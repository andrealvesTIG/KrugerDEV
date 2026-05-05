import type { Express } from "express";
import { z } from "zod";
import { streamJarvisResponse, executeJarvisAction, type JarvisMessage } from "../services/jarvisService";
import {
  getUserIdFromRequest,
  getUserOrgIds,
  getUserOrgRole,
  logUserActivity,
} from "./helpers";
import { apiRoute, body, r200, inputRes, authRes, stdRes, pathStr, e404 } from "../route-registry";
import {
  enforceAiCredits,
  recordAiCredits,
  sendLimitExceeded,
  writeSseLimitExceeded,
  AiCreditsLimitError,
  newAiRequestId,
  type MeterPerCall,
} from "../services/aiCredits";
import { getGeneratedFile } from "../services/fridayGeneratedFiles";
import {
  createConversation as fcCreate,
  listConversations as fcList,
  getConversation as fcGet,
  getMessages as fcGetMessages,
  addMessage as fcAddMessage,
  updateConversationTitle as fcUpdateTitle,
  archiveConversation as fcArchive,
  deleteConversation as fcDelete,
  setFridayMessageMetadata,
} from "../storage/fridayConversationStorage";
import {
  createSavedReport as srCreate,
  listSavedReports as srList,
  getSavedReport as srGet,
  deleteSavedReport as srDelete,
  setShareToken as srSetShare,
  revokeShareToken as srRevokeShare,
  getReportByShareToken as srGetByToken,
} from "../storage/fridaySavedReportStorage";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 200000;
const MAX_ATTACHMENT_SIZE = 500000;
const MAX_ATTACHMENTS = 5;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LENGTH),
});

const pageContextSchema = z.object({
  path: z.string().max(500),
  entityType: z.enum(["project", "portfolio", "resource"]).nullable(),
  entityId: z.number().int().positive().nullable(),
}).optional();

const ALLOWED_ATTACHMENT_EXTENSIONS = /\.(txt|csv|json|xml|md|log|yaml|yml|ini|conf|cfg|tsv|html|htm|sql|js|ts|py|rb|go|java|c|cpp|h|css|scss|less|pdf|xls|xlsx)$/i;
const ALLOWED_ATTACHMENT_TYPES = [
  "text/plain", "text/csv", "text/html", "text/xml", "text/markdown",
  "application/json", "application/xml", "application/csv", "application/pdf",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

const attachmentSchema = z.object({
  name: z.string().max(255).refine(
    (name) => ALLOWED_ATTACHMENT_EXTENSIONS.test(name),
    { message: "File type not supported" }
  ),
  type: z.string().max(100).refine(
    (type) => ALLOWED_ATTACHMENT_TYPES.includes(type),
    { message: "MIME type not allowed" }
  ),
  size: z.number().int().max(MAX_ATTACHMENT_SIZE),
  content: z.string().max(MAX_ATTACHMENT_SIZE * 2).refine(
    (content) => {
      try {
        const decoded = Buffer.from(content, "base64");
        return decoded.length <= MAX_ATTACHMENT_SIZE;
      } catch {
        return false;
      }
    },
    { message: "Invalid or oversized file content" }
  ),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  organizationId: z.number().int().positive(),
  concise: z.boolean().optional(),
  pageContext: pageContextSchema,
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
  conversationId: z.number().int().positive().optional(),
  forceOnboarding: z.boolean().optional(),
});

const JARVIS_ACTION_TYPES = [
  "create_task", "update_task", "delete_task", "bulk_delete_tasks",
  "create_mitigation", "create_risk", "update_risk", "delete_risk",
  "create_issue", "update_issue", "delete_issue",
  "create_project", "update_project", "delete_project",
  "create_portfolio", "update_portfolio", "delete_portfolio",
  "add_project_to_portfolio", "remove_project_from_portfolio",
  "create_resource", "update_resource", "delete_resource",
  "assign_resources_to_task",
  "invite_member", "remove_member",
  "assign_owner", "add_note", "flag_for_review",
  "configure_organization",
] as const;

const DESTRUCTIVE_ACTION_TYPES = new Set<string>([
  "delete_project", "delete_portfolio", "delete_resource",
  "delete_task", "bulk_delete_tasks",
  "delete_risk", "delete_issue",
  "remove_member",
]);

const actionRequestSchema = z.object({
  organizationId: z.number().int().positive(),
  action: z.object({
    type: z.enum(JARVIS_ACTION_TYPES),
    projectId: z.number().int().positive().optional(),
    data: z.record(z.any()).optional().default({}),
  }),
});

export function registerJarvisRoutes(app: Express) {
  apiRoute(app, 'post', '/api/jarvis/chat', {
    tag: 'AI',
    summary: 'Stream a JARVIS AI chat response',
    requestBody: body({
      type: 'object',
      properties: {
        messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } } },
        organizationId: { type: 'integer' },
        concise: { type: 'boolean' },
        pageContext: { type: 'object', nullable: true },
        attachments: { type: 'array', items: { type: 'object' } },
      },
      required: ['messages', 'organizationId'],
    }),
    responses: { ...r200('SSE stream', { type: 'object' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }

      const { messages, organizationId, concise, pageContext, attachments, conversationId: incomingConversationId, forceOnboarding } = parsed.data;

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      // Admission check: enforce BEFORE persisting anything so over-limit
      // users get a clean 403 with no orphan rows. NOT recorded — only
      // the per-round meterPerCall below charges usage_events.
      const baseRequestId = `friday_chat_${incomingConversationId ?? "new"}_${newAiRequestId()}`;
      const creditCtx = {
        userId,
        orgId: organizationId,
        action: "friday_chat",
        entityId: incomingConversationId ?? undefined,
        requestId: baseRequestId,
      };
      try {
        await enforceAiCredits(creditCtx);
      } catch (err) {
        if (sendLimitExceeded(res, err)) return;
        throw err;
      }

      // Resolve or create persistent conversation for this user+org. Only the
      // create path blocks the stream open — title refresh and user-message
      // persistence are fire-and-forget after we flush the SSE headers so
      // they don't add latency to TTFB.
      let conversationId: number | null = null;
      let needsCreate = true;
      // Tracks the conversation row's persisted is_onboarding flag (set by
      // /api/jarvis/guest/adopt for migrated public-preview chats). We OR
      // it onto the request's forceOnboarding below so the onboarding
      // directive is applied for every reply on that conversation —
      // even if the client forgot to send forceOnboarding=true, and even
      // after a page reload that re-mounts the chat without the flag.
      let persistedIsOnboarding = false;
      if (incomingConversationId) {
        const existing = await fcGet(incomingConversationId, organizationId, userId);
        if (existing) {
          conversationId = existing.id;
          needsCreate = false;
          persistedIsOnboarding = existing.isOnboarding === true;
        }
      }
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
      if (needsCreate) {
        const titleSeed = lastUserMessage?.content?.slice(0, 60).trim() || "New conversation";
        const created = await fcCreate(organizationId, userId, titleSeed);
        conversationId = created.id;
      }
      // Per-call: enforce before opening the stream, return a recordSuccess
      // callback the service must invoke after the stream completes. We
      // accumulate credits charged across every round so we can surface a
      // single "Used N credits" total on the assistant reply — sourced
      // straight from the same call that wrote the ledger entry, so the
      // chat indicator can never drift from the Billing page.
      let creditsChargedHundredths = 0;
      const meterPerCall: MeterPerCall = async <T>(round: number, fn: () => Promise<T>) => {
        const ctx = { ...creditCtx, requestId: `${baseRequestId}_r${round}` };
        const { chargeUserId } = await enforceAiCredits(ctx);
        const result = await fn();
        return {
          result,
          recordSuccess: async () => {
            const charged = await recordAiCredits(chargeUserId, ctx);
            creditsChargedHundredths += charged;
            return charged;
          },
        };
      };

      // Open the SSE stream BEFORE doing any further DB writes so the
      // client gets bytes ASAP. Disable proxy buffering / transforms so
      // chunks are flushed end-to-end on every write.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      (res as any).flushHeaders?.();

      // Send conversationId immediately so the client can pin to it
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);
      (res as any).flush?.();

      // Fire-and-forget: persist the user message + title refresh in
      // parallel with the model call. The user's bubble already exists in
      // the optimistic overlay client-side, and history rendering only
      // needs these rows by the time the response refetches.
      if (lastUserMessage && conversationId != null) {
        const cid = conversationId;
        fcAddMessage(
          cid,
          "user",
          lastUserMessage.content,
          attachments ? attachments.map((a) => ({ name: a.name, type: a.type, size: a.size })) : null,
          pageContext ? { path: pageContext.path, entityType: pageContext.entityType ?? undefined, entityId: pageContext.entityId ?? undefined } : null,
        ).catch((err) => {
          console.error("[JARVIS] Failed to persist user message:", err);
        });
        if (!needsCreate) {
          // Refresh title if it's still placeholder-ish — defer so it
          // doesn't block TTFB.
          fcGet(cid, organizationId, userId)
            .then((conv) => {
              if (conv && (!conv.title || conv.title === "New conversation")) {
                return fcUpdateTitle(cid, organizationId, userId, lastUserMessage.content.slice(0, 60));
              }
            })
            .catch((err) => {
              console.error("[JARVIS] Failed to refresh conversation title:", err);
            });
        }
      }

      await streamJarvisResponse(
        Number(organizationId),
        userId,
        messages,
        concise ?? false,
        (content) => {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
          (res as any).flush?.();
        },
        (fullResponse) => {
          // Round to 2 decimal places (the credit ledger granularity) and
          // ship the value the model just spent so the client can render
          // an inline "Used N credits" indicator on this reply.
          const creditsUsedDisplay = Math.round(creditsChargedHundredths) / 100;
          res.write(`data: ${JSON.stringify({ done: true, creditsUsed: creditsUsedDisplay })}\n\n`);
          (res as any).flush?.();
          res.end();
          // Persist the assistant message + the same hundredths total we
          // just told the client so a later page reload renders the same
          // value and matches the Billing ledger byte-for-byte.
          if (conversationId && fullResponse) {
            fcAddMessage(
              conversationId,
              "assistant",
              fullResponse,
              null,
              null,
              creditsChargedHundredths > 0 ? Math.round(creditsChargedHundredths) : null,
            ).catch((err) => {
              console.error("[JARVIS] Failed to persist assistant message:", err);
            });
          }
          logUserActivity(userId, "jarvis_chat", "friday_conversation", conversationId ?? undefined, {
            messageCount: messages.length,
            responseLength: fullResponse.length,
            pageContext: pageContext?.entityType ? `${pageContext.entityType}:${pageContext.entityId}` : undefined,
          }, req).catch(() => {});
        },
        (error: Error & { logDetails?: string; originalError?: any }) => {
          if (writeSseLimitExceeded(res, error)) return;
          if (sendLimitExceeded(res, error)) return;
          const userMessage = error.message || "An unexpected error occurred. Please try again.";
          const logDetails = error.logDetails || error.message;
          console.error(`[JARVIS] Stream error: ${logDetails}`, error.originalError?.stack || error.stack || "");
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: userMessage })}\n\n`);
            res.end();
          } else {
            res.status(500).json({ message: userMessage });
          }
        },
        meterPerCall,
        pageContext ? { path: pageContext.path, entityType: pageContext.entityType, entityId: pageContext.entityId } : undefined,
        attachments,
        { forceOnboarding: forceOnboarding === true || persistedIsOnboarding },
      );
    } catch (error) {
      if (error instanceof AiCreditsLimitError) {
        if (sendLimitExceeded(res, error)) return;
      }
      console.error("[JARVIS] Route error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  apiRoute(app, 'post', '/api/jarvis/action', {
    tag: 'AI',
    summary: 'Execute a JARVIS AI action',
    requestBody: body({
      type: 'object',
      properties: {
        organizationId: { type: 'integer' },
        action: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...JARVIS_ACTION_TYPES] },
            projectId: { type: 'integer', nullable: true, description: 'Required for project-scoped actions; omit for org-wide ones (e.g. delete_portfolio, invite_member, configure_organization).' },
            data: { type: 'object' },
          },
          required: ['type'],
        },
      },
      required: ['organizationId', 'action'],
    }),
    responses: { ...r200('Action result', { type: 'object' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const parsed = actionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }

      const { organizationId, action } = parsed.data;

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const role = await getUserOrgRole(userId, organizationId);
      if (!role) {
        return res.status(403).json({ message: "You are not a member of this organization" });
      }
      if (role === "viewer") {
        return res.status(403).json({ message: "Viewers cannot perform write actions" });
      }
      if (DESTRUCTIVE_ACTION_TYPES.has(action.type) && role !== "owner" && role !== "org_admin") {
        return res.status(403).json({ message: "Only organization admins or owners can perform this destructive action" });
      }
      // configure_organization seeds an entire workspace (portfolios,
      // projects, demo resources). That's a heavier operation than a
      // single task/risk write, so restrict it to org admins, the same
      // permission gate the regular onboarding wizard uses.
      if (action.type === "configure_organization" && role !== "org_admin" && role !== "owner") {
        return res.status(403).json({ message: "Only an Organization Admin can configure the workspace." });
      }
      // executeJarvisAction performs additional admin-only checks for invite_member, etc.

      // Action requests are billable AI surfaces — 1 credit per success.
      const actionCreditCtx = {
        userId,
        orgId: organizationId,
        action: "friday_action",
        entityId: action.projectId,
        requestId: `friday_action_${action.type}_${action.projectId}_${newAiRequestId()}`,
      };
      let chargeUserId: string;
      try {
        ({ chargeUserId } = await enforceAiCredits(actionCreditCtx));
      } catch (limitErr) {
        if (sendLimitExceeded(res, limitErr)) return;
        throw limitErr;
      }

      const result = await executeJarvisAction(Number(organizationId), userId, action);

      // Only charge on success — failed actions are no-ops.
      if (result.success) {
        await recordAiCredits(chargeUserId, actionCreditCtx).catch((err) => {
          console.error("[JARVIS] Failed to record action credit usage:", err);
        });
      }

      await logUserActivity(userId, "jarvis_action", "jarvis", action.projectId ?? undefined, {
        actionType: action.type,
        success: result.success,
        entityId: result.entityId,
      }, req).catch(() => {});

      res.json(result);
    } catch (error: any) {
      if (sendLimitExceeded(res, error)) return;
      console.error("[JARVIS] Action error:", error);
      res.status(500).json({ message: error.message || "Failed to execute action" });
    }
  });

  // ----- Conversation management (per-user persistent history) -----

  apiRoute(app, 'get', '/api/jarvis/conversations', {
    tag: 'AI',
    summary: "List the current user's Friday conversations for an organization",
    responses: { ...r200('Conversations', { type: 'array' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgIdRaw = req.query.organizationId;
      const organizationId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const conversations = await fcList(organizationId, userId);
      res.json(conversations);
    } catch (error: any) {
      console.error("[JARVIS] List conversations error:", error);
      res.status(500).json({ message: error.message || "Failed to list conversations" });
    }
  });

  apiRoute(app, 'get', '/api/jarvis/conversations/:id', {
    tag: 'AI',
    summary: 'Get a Friday conversation with messages',
    responses: { ...r200('Conversation with messages', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const orgIdRaw = req.query.organizationId;
      const organizationId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const conv = await fcGet(id, organizationId, userId);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      const messages = await fcGetMessages(id);
      res.json({ ...conv, messages });
    } catch (error: any) {
      console.error("[JARVIS] Get conversation error:", error);
      res.status(500).json({ message: error.message || "Failed to load conversation" });
    }
  });

  apiRoute(app, 'post', '/api/jarvis/conversations', {
    tag: 'AI',
    summary: 'Create a new empty Friday conversation',
    requestBody: body({
      type: 'object',
      properties: {
        organizationId: { type: 'integer' },
        title: { type: 'string' },
      },
      required: ['organizationId'],
    }),
    responses: { ...r200('Created conversation', { type: 'object' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const schema = z.object({
        organizationId: z.number().int().positive(),
        title: z.string().max(200).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }
      const { organizationId, title } = parsed.data;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const conv = await fcCreate(organizationId, userId, title ?? null);
      res.json(conv);
    } catch (error: any) {
      console.error("[JARVIS] Create conversation error:", error);
      res.status(500).json({ message: error.message || "Failed to create conversation" });
    }
  });

  apiRoute(app, 'patch', '/api/jarvis/conversations/:id', {
    tag: 'AI',
    summary: 'Rename a Friday conversation',
    requestBody: body({
      type: 'object',
      properties: {
        organizationId: { type: 'integer' },
        title: { type: 'string' },
      },
      required: ['organizationId', 'title'],
    }),
    responses: { ...r200('Updated conversation', { type: 'object' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const schema = z.object({
        organizationId: z.number().int().positive(),
        title: z.string().min(1).max(200),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request" });
      const { organizationId, title } = parsed.data;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const updated = await fcUpdateTitle(id, organizationId, userId, title);
      if (!updated) return res.status(404).json({ message: "Conversation not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("[JARVIS] Rename conversation error:", error);
      res.status(500).json({ message: error.message || "Failed to rename conversation" });
    }
  });

  apiRoute(app, 'patch', '/api/jarvis/conversations/:cid/messages/:mid/quick-reply', {
    tag: 'AI',
    summary: "Mark which quick-reply chip the user picked on a Friday assistant message",
    requestBody: body({
      type: 'object',
      properties: {
        option: { type: 'string', description: 'The chip label the user clicked.' },
      },
      required: ['option'],
    }),
    responses: { ...r200('Updated message metadata', { type: 'object' }), ...inputRes, ...stdRes, ...e404 },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const cid = Number(req.params.cid);
      const mid = Number(req.params.mid);
      const orgIdRaw = req.query.organizationId;
      const organizationId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
      if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(mid) || mid <= 0) {
        return res.status(400).json({ message: "Invalid id" });
      }
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const schema = z.object({ option: z.string().min(1).max(200) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      // Org+user gate via fcGet so users can't mark chips on a
      // conversation that isn't theirs.
      const conv = await fcGet(cid, organizationId, userId);
      if (!conv) return res.status(404).json({ message: "Conversation not found" });
      const updated = await setFridayMessageMetadata(mid, cid, {
        quickReplySelection: parsed.data.option,
      });
      if (!updated) return res.status(404).json({ message: "Message not found" });
      res.json({ id: updated.id, metadata: updated.metadata });
    } catch (error: any) {
      console.error("[JARVIS] Quick-reply select error:", error);
      res.status(500).json({ message: error.message || "Failed to mark quick-reply" });
    }
  });

  apiRoute(app, 'delete', '/api/jarvis/conversations/:id', {
    tag: 'AI',
    summary: 'Delete (archive) a Friday conversation',
    responses: { ...r200('Archived', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const orgIdRaw = req.query.organizationId;
      const organizationId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const archived = await fcArchive(id, organizationId, userId);
      if (!archived) return res.status(404).json({ message: "Conversation not found" });
      res.json({ ok: true, id: archived.id });
    } catch (error: any) {
      console.error("[JARVIS] Delete conversation error:", error);
      res.status(500).json({ message: error.message || "Failed to delete conversation" });
    }
  });

  // ----- Saved Reports (org-scoped, persistent rich HTML reports) -----

  const MAX_SAVED_REPORT_HTML_BYTES = 1_000_000; // 1MB upper bound
  const MAX_SAVED_REPORTS_PER_ORG = 200;
  const saveReportSchema = z.object({
    organizationId: z.number().int().positive(),
    title: z.string().min(1).max(500),
    subtitle: z.string().max(500).optional().nullable(),
    generatedAt: z.string().datetime().optional().nullable(),
    html: z.string().min(1).max(MAX_SAVED_REPORT_HTML_BYTES),
  });

  apiRoute(app, 'post', '/api/jarvis/saved-reports', {
    tag: 'AI',
    summary: 'Save a Friday report so it can be re-opened later',
    requestBody: body({
      type: 'object',
      properties: {
        organizationId: { type: 'integer' },
        title: { type: 'string' },
        subtitle: { type: 'string', nullable: true },
        generatedAt: { type: 'string', format: 'date-time', nullable: true },
        html: { type: 'string' },
      },
      required: ['organizationId', 'title', 'html'],
    }),
    responses: { ...r200('Created saved report', { type: 'object' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const parsed = saveReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }
      const { organizationId, title, subtitle, generatedAt, html } = parsed.data;

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const role = await getUserOrgRole(userId, organizationId);
      if (!role || role === "viewer") {
        return res.status(403).json({ message: "You don't have permission to save reports in this organization" });
      }

      // Soft per-org cap to keep storage bounded.
      const existing = await srList(organizationId, MAX_SAVED_REPORTS_PER_ORG + 1);
      if (existing.length >= MAX_SAVED_REPORTS_PER_ORG) {
        return res.status(409).json({
          message: `This organization has reached the limit of ${MAX_SAVED_REPORTS_PER_ORG} saved reports. Delete some older reports before saving more.`,
        });
      }

      const created = await srCreate({
        organizationId,
        savedByUserId: userId,
        title,
        subtitle: subtitle ?? null,
        generatedAt: generatedAt ? new Date(generatedAt) : null,
        html,
      });

      logUserActivity(userId, "friday_report_save", "friday_saved_report", created.id, {
        title: created.title,
      }, req).catch(() => {});

      res.json({
        id: created.id,
        organizationId: created.organizationId,
        title: created.title,
        subtitle: created.subtitle,
        generatedAt: created.generatedAt,
        createdAt: created.createdAt,
      });
    } catch (error: any) {
      console.error("[JARVIS] Save report error:", error);
      res.status(500).json({ message: error.message || "Failed to save report" });
    }
  });

  apiRoute(app, 'get', '/api/jarvis/saved-reports', {
    tag: 'AI',
    summary: 'List saved Friday reports for an organization',
    responses: { ...r200('Saved reports', { type: 'array' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgIdRaw = req.query.organizationId;
      const organizationId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const reports = await srList(organizationId);
      res.json(reports);
    } catch (error: any) {
      console.error("[JARVIS] List saved reports error:", error);
      res.status(500).json({ message: error.message || "Failed to list saved reports" });
    }
  });

  apiRoute(app, 'get', '/api/jarvis/saved-reports/:id', {
    tag: 'AI',
    summary: 'Fetch a saved Friday report (HTML payload included)',
    responses: { ...r200('Saved report', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const orgIdRaw = req.query.organizationId;
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (accessibleOrgIds.length === 0) {
        return res.status(403).json({ message: "You don't have access to this report" });
      }

      // The client may either pin to a specific org (via query param) or
      // simply hit /saved-reports/:id and let the server resolve which of
      // the user's orgs owns the report. Either way we reject reports the
      // user has no membership in.
      let report = null as Awaited<ReturnType<typeof srGet>> | null;
      if (orgIdRaw !== undefined) {
        const orgId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
        if (!Number.isFinite(orgId) || orgId <= 0) {
          return res.status(400).json({ message: "Invalid organizationId" });
        }
        if (!accessibleOrgIds.includes(orgId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }
        report = (await srGet(id, orgId)) ?? null;
      } else {
        for (const orgId of accessibleOrgIds) {
          const found = await srGet(id, orgId);
          if (found) {
            report = found;
            break;
          }
        }
      }

      if (!report) return res.status(404).json({ message: "Saved report not found" });
      res.json(report);
    } catch (error: any) {
      console.error("[JARVIS] Get saved report error:", error);
      res.status(500).json({ message: error.message || "Failed to load saved report" });
    }
  });

  apiRoute(app, 'delete', '/api/jarvis/saved-reports/:id', {
    tag: 'AI',
    summary: 'Delete a saved Friday report',
    responses: { ...r200('Deleted', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const orgIdRaw = req.query.organizationId;
      const organizationId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const role = await getUserOrgRole(userId, organizationId);
      if (!role || role === "viewer") {
        return res.status(403).json({ message: "You don't have permission to delete saved reports" });
      }
      const existing = await srGet(id, organizationId);
      if (!existing) return res.status(404).json({ message: "Saved report not found" });
      // Only the user who saved the report, or an org admin/owner, may delete.
      const isAdmin = role === "owner" || role === "org_admin";
      if (!isAdmin && existing.savedByUserId !== userId) {
        return res.status(403).json({ message: "Only the user who saved this report (or an admin) can delete it" });
      }
      const deleted = await srDelete(id, organizationId);
      if (!deleted) return res.status(404).json({ message: "Saved report not found" });
      res.json({ ok: true, id: deleted.id });
    } catch (error: any) {
      console.error("[JARVIS] Delete saved report error:", error);
      res.status(500).json({ message: error.message || "Failed to delete saved report" });
    }
  });

  // ----- Friday Report PDF export -----

  const fridayReportPdfSchema = z.object({
    title: z.string().min(1).max(300),
    subtitle: z.string().max(500).optional(),
    generatedAt: z.string().max(64).optional(),
    html: z.string().min(1).max(500_000),
  });

  apiRoute(app, 'post', '/api/jarvis/friday-report/pdf', {
    tag: 'AI',
    summary: 'Render a Friday report (HTML) as a downloadable PDF',
    requestBody: body({ type: 'object', properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      generatedAt: { type: 'string' },
      html: { type: 'string' },
    }, required: ['title', 'html'] }),
    responses: { ...r200('Binary PDF', { type: 'string', format: 'binary' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const parsed = fridayReportPdfSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid report payload", issues: parsed.error.flatten() });
      }
      const { renderHtmlReportToPdfBuffer, buildReportPdfFilename } = await import("../services/fridayReportHtmlPdf");
      const buffer = await renderHtmlReportToPdfBuffer(parsed.data);
      const filename = buildReportPdfFilename(parsed.data);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "private, no-store");
      res.send(buffer);
    } catch (error: any) {
      console.error("[JARVIS] Friday report PDF error:", error);
      res.status(500).json({ message: error?.message || "Failed to render PDF" });
    }
  });

  // ----- Public share links for saved reports -----

  // Owners/admins (or the user who saved the report) can mint a public
  // share link. The link points at /r/friday-report/{token} on the client
  // and resolves via the public GET below — no login required.
  const SHARE_EXPIRY_DAYS = z.union([
    z.literal(7),
    z.literal(30),
    z.literal(90),
    z.literal(365),
  ]).optional().nullable();
  const createShareSchema = z.object({
    organizationId: z.number().int().positive(),
    expiresInDays: SHARE_EXPIRY_DAYS,
  });

  function canShareReport(role: string, savedByUserId: string | null, userId: string): boolean {
    if (role === "owner" || role === "org_admin") return true;
    return !!savedByUserId && savedByUserId === userId;
  }

  apiRoute(app, 'post', '/api/jarvis/saved-reports/:id/share', {
    tag: 'AI',
    summary: 'Mint a public share link for a saved Friday report',
    requestBody: body({
      type: 'object',
      properties: {
        organizationId: { type: 'integer' },
        expiresInDays: { type: 'integer', nullable: true, enum: [7, 30, 90, 365], description: 'Optional expiry. Omit for a non-expiring link.' },
      },
      required: ['organizationId'],
    }),
    responses: { ...r200('Share token + URL', { type: 'object' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });

      const parsed = createShareSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }
      const { organizationId, expiresInDays } = parsed.data;

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const role = await getUserOrgRole(userId, organizationId);
      if (!role || role === "viewer") {
        return res.status(403).json({ message: "You don't have permission to share reports" });
      }
      const existing = await srGet(id, organizationId);
      if (!existing) return res.status(404).json({ message: "Saved report not found" });
      if (!canShareReport(role, existing.savedByUserId, userId)) {
        return res.status(403).json({ message: "Only the user who saved this report (or an admin) can share it" });
      }

      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      const updated = await srSetShare({
        reportId: id,
        organizationId,
        sharedByUserId: userId,
        expiresAt,
      });
      if (!updated) return res.status(404).json({ message: "Saved report not found" });

      logUserActivity(userId, "friday_report_share_create", "friday_saved_report", id, {
        expiresInDays: expiresInDays ?? null,
      }, req).catch(() => {});

      res.json({
        id: updated.id,
        shareToken: updated.shareToken,
        sharedAt: updated.sharedAt,
        sharedByUserId: updated.sharedByUserId,
        shareExpiresAt: updated.shareExpiresAt,
        shareRevokedAt: updated.shareRevokedAt,
        // Path only — the client knows its own origin and we want this to
        // work behind reverse proxies / preview domains without the server
        // having to guess the host.
        sharePath: `/r/friday-report/${updated.shareToken}`,
      });
    } catch (error: any) {
      console.error("[JARVIS] Create share error:", error);
      res.status(500).json({ message: error.message || "Failed to create share link" });
    }
  });

  apiRoute(app, 'delete', '/api/jarvis/saved-reports/:id/share', {
    tag: 'AI',
    summary: 'Revoke the public share link on a saved Friday report',
    parameters: [pathStr('id')],
    responses: { ...r200('Revoked', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const orgIdRaw = req.query.organizationId;
      const organizationId = Number(Array.isArray(orgIdRaw) ? orgIdRaw[0] : orgIdRaw);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
      if (!Number.isFinite(organizationId) || organizationId <= 0) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      const role = await getUserOrgRole(userId, organizationId);
      if (!role || role === "viewer") {
        return res.status(403).json({ message: "You don't have permission to revoke share links" });
      }
      const existing = await srGet(id, organizationId);
      if (!existing) return res.status(404).json({ message: "Saved report not found" });
      if (!canShareReport(role, existing.savedByUserId, userId)) {
        return res.status(403).json({ message: "Only the user who saved this report (or an admin) can revoke its share link" });
      }
      const revoked = await srRevokeShare(id, organizationId);
      if (!revoked) return res.status(404).json({ message: "Saved report not found" });

      logUserActivity(userId, "friday_report_share_revoke", "friday_saved_report", id, {}, req).catch(() => {});

      res.json({
        id: revoked.id,
        shareToken: null,
        sharedAt: revoked.sharedAt,
        shareRevokedAt: revoked.shareRevokedAt,
      });
    } catch (error: any) {
      console.error("[JARVIS] Revoke share error:", error);
      res.status(500).json({ message: error.message || "Failed to revoke share link" });
    }
  });

  // Public read endpoint — intentionally no auth check, no org check. The
  // share token IS the access credential. We return only the fields the
  // public viewer needs: title/subtitle/timestamps + sanitized HTML; no
  // org id, no saver identity.
  apiRoute(app, 'get', '/api/public/friday-reports/:token', {
    tag: 'AI',
    summary: 'View a publicly-shared Friday report (no login required)',
    parameters: [pathStr('token')],
    security: [],
    responses: { ...r200('Shared saved report', { type: 'object' }), ...e404 },
  }, async (req, res) => {
    try {
      const token = String(req.params.token || "");
      // Hex tokens are exactly 64 chars; reject obvious garbage early so we
      // don't even hit the DB.
      if (!/^[a-f0-9]{16,128}$/i.test(token)) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = await srGetByToken(token);
      if (!report) return res.status(404).json({ message: "Report not found" });

      // Don't cache shared reports — revocation must take effect quickly.
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        id: report.id,
        title: report.title,
        subtitle: report.subtitle,
        generatedAt: report.generatedAt,
        sharedAt: report.sharedAt,
        shareExpiresAt: report.shareExpiresAt,
        createdAt: report.createdAt,
        html: report.html,
      });
    } catch (error: any) {
      console.error("[JARVIS] Public shared report error:", error);
      res.status(500).json({ message: "Failed to load shared report" });
    }
  });

  apiRoute(app, 'get', '/api/jarvis/generated-files/:id', {
    tag: 'AI',
    summary: 'Download a file generated by Friday (PDFs, etc.)',
    responses: { ...r200('Binary file', { type: 'string', format: 'binary' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = String(req.params.id || "");
      const file = getGeneratedFile(id);
      if (!file) return res.status(404).json({ message: "File not found or expired" });
      if (file.userId !== userId) {
        return res.status(403).json({ message: "You don't have access to this file" });
      }
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(file.orgId)) {
        return res.status(403).json({ message: "You don't have access to this file" });
      }
      const safeName = file.filename.replace(/[^A-Za-z0-9._-]/g, "_");
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      res.setHeader("Content-Length", String(file.buffer.length));
      res.setHeader("Cache-Control", "private, no-store");
      res.send(file.buffer);
    } catch (error: any) {
      console.error("[JARVIS] Download generated file error:", error);
      res.status(500).json({ message: error.message || "Failed to download file" });
    }
  });
}
