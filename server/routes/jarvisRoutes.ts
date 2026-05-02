import type { Express } from "express";
import { z } from "zod";
import { streamJarvisResponse, executeJarvisAction, type JarvisMessage } from "../services/jarvisService";
import {
  getUserIdFromRequest,
  getUserOrgIds,
  getUserOrgRole,
  logUserActivity,
} from "./helpers";
import { apiRoute, body, r200, inputRes, authRes, stdRes } from "../route-registry";
import {
  enforceAiCredits,
  recordAiCredits,
  sendLimitExceeded,
  writeSseLimitExceeded,
  AiCreditsLimitError,
  newAiRequestId,
  type MeterPerCall,
} from "../services/aiCredits";
import {
  createConversation as fcCreate,
  listConversations as fcList,
  getConversation as fcGet,
  getMessages as fcGetMessages,
  addMessage as fcAddMessage,
  updateConversationTitle as fcUpdateTitle,
  archiveConversation as fcArchive,
  deleteConversation as fcDelete,
} from "../storage/fridayConversationStorage";

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
});

const actionRequestSchema = z.object({
  organizationId: z.number().int().positive(),
  action: z.object({
    type: z.enum(["create_task", "create_mitigation", "assign_owner", "add_note", "flag_for_review"]),
    projectId: z.number().int().positive(),
    data: z.record(z.any()),
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

      const { messages, organizationId, concise, pageContext, attachments, conversationId: incomingConversationId } = parsed.data;

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      // Enforce credits BEFORE persisting anything so over-limit users
      // get a clean 403 with no orphan conversation/message rows.
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

      // Resolve or create persistent conversation for this user+org
      let conversationId: number | null = null;
      if (incomingConversationId) {
        const existing = await fcGet(incomingConversationId, organizationId, userId);
        if (existing) conversationId = existing.id;
      }
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
      if (!conversationId) {
        const titleSeed = lastUserMessage?.content?.slice(0, 60).trim() || "New conversation";
        const created = await fcCreate(organizationId, userId, titleSeed);
        conversationId = created.id;
      } else if (lastUserMessage) {
        // Refresh title if it's still placeholder-ish
        const conv = await fcGet(conversationId, organizationId, userId);
        if (conv && (!conv.title || conv.title === "New conversation")) {
          await fcUpdateTitle(conversationId, organizationId, userId, lastUserMessage.content.slice(0, 60));
        }
      }

      // Persist the new user message (the last in the list, if it's role:user)
      if (lastUserMessage) {
        await fcAddMessage(
          conversationId,
          "user",
          lastUserMessage.content,
          attachments ? attachments.map((a) => ({ name: a.name, type: a.type, size: a.size })) : null,
          pageContext ? { path: pageContext.path, entityType: pageContext.entityType ?? undefined, entityId: pageContext.entityId ?? undefined } : null,
        );
      }
      // Per-call: enforce before opening the stream, return a recordSuccess
      // callback the service must invoke after the stream completes.
      const meterPerCall: MeterPerCall = async <T>(round: number, fn: () => Promise<T>) => {
        const ctx = { ...creditCtx, requestId: `${baseRequestId}_r${round}` };
        const { chargeUserId } = await enforceAiCredits(ctx);
        const result = await fn();
        return { result, recordSuccess: () => recordAiCredits(chargeUserId, ctx) };
      };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send conversationId immediately so the client can pin to it
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);

      await streamJarvisResponse(
        Number(organizationId),
        userId,
        messages,
        concise ?? false,
        (content) => {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        },
        (fullResponse) => {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          // Persist the assistant message
          if (conversationId && fullResponse) {
            fcAddMessage(conversationId, "assistant", fullResponse, null, null).catch((err) => {
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
            type: { type: 'string', enum: ['create_task', 'create_mitigation', 'assign_owner', 'add_note', 'flag_for_review'] },
            projectId: { type: 'integer' },
            data: { type: 'object' },
          },
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
      if (role === "viewer" || role === "team_member") {
        return res.status(403).json({ message: "Insufficient permissions to perform this action" });
      }

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

      await logUserActivity(userId, "jarvis_action", "jarvis", action.projectId, {
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
}
