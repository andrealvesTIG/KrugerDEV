import type { Express } from "express";
import { z } from "zod";
import {
  streamPowerBIAgentResponse,
  getPowerBIIntakeRequests,
  getPowerBIIntakeRequest,
  convertPowerBIRequestToIntake,
  deletePowerBIIntakeRequest,
  availableProviders,
  isModelAvailable,
  ALLOWED_ATTACHMENT_TYPES,
  type PbiModelTier,
} from "../services/powerbiAgentService";
import {
  createConversation,
  listConversations,
  getConversation,
  getMessages,
  addMessage,
  updateConversationTitle,
  updateConversationModel,
  deleteConversation,
} from "../storage/powerbiAgentStorage";
import {
  getUserIdFromRequest,
  getUserOrgIds,
  getUserOrgRole,
  logUserActivity,
} from "./helpers";
import { apiRoute, body, r200, inputRes, authRes, stdRes } from "../route-registry";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 50000;
const MAX_ATTACHMENTS = 5;

// Restrict objectPath to the shape the upload endpoint produces:
//   /objects/uploads/<id>   (id is a uuid-ish string, no slashes, no traversal)
const OBJECT_PATH_RE = /^\/objects\/uploads\/[A-Za-z0-9._-]{1,128}$/;

const attachmentSchema = z.object({
  name: z.string().min(1).max(300),
  objectPath: z.string().max(300).regex(OBJECT_PATH_RE, "Invalid objectPath"),
  contentType: z.string().min(1).max(200).refine(
    (t) => ALLOWED_ATTACHMENT_TYPES.has(t.toLowerCase()),
    { message: "Unsupported attachment type" },
  ),
  size: z.number().int().nonnegative().max(20 * 1024 * 1024),
});

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LENGTH),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  organizationId: z.number().int().positive(),
  model: z.enum(["fast", "smart", "claude"]).optional().default("fast"),
  conversationId: z.number().int().positive().nullable().optional(),
});

function deriveTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 80) || "New Power BI request";
}

export function registerPowerBIAgentRoutes(app: Express) {
  apiRoute(app, 'get', '/api/powerbi-agent/providers', {
    tag: 'AI', summary: 'List available Power BI agent model providers',
    responses: { ...r200('Providers', { type: 'array' }), ...stdRes },
  }, async (_req, res) => {
    res.json(availableProviders());
  });

  apiRoute(app, 'get', '/api/powerbi-agent/conversations', {
    tag: 'AI', summary: 'List the user\'s saved Power BI agent conversations',
    responses: { ...r200('Conversations', { type: 'array' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.query.organizationId);
      if (!orgId) return res.status(400).json({ message: "organizationId required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const rows = await listConversations(orgId, userId);
      res.json(rows);
    } catch (e: any) {
      console.error("[PBI Agent] List conversations:", e.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'post', '/api/powerbi-agent/conversations', {
    tag: 'AI', summary: 'Create a new (empty) Power BI agent conversation',
    responses: { ...r200('Conversation', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.query.organizationId || req.body?.organizationId);
      if (!orgId) return res.status(400).json({ message: "organizationId required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const rawModel = String(req.body?.model || "fast");
      const modelTier: PbiModelTier = (["fast", "smart", "claude"].includes(rawModel) ? rawModel : "fast") as PbiModelTier;
      const title = req.body?.title ? String(req.body.title).slice(0, 200) : null;
      const created = await createConversation(orgId, userId, modelTier, title);
      res.json(created);
    } catch (e: any) {
      console.error("[PBI Agent] Create conversation:", e.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'get', '/api/powerbi-agent/conversations/:id', {
    tag: 'AI', summary: 'Get a single Power BI agent conversation with messages',
    responses: { ...r200('Conversation', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.query.organizationId);
      const id = Number(req.params.id);
      if (!orgId || !id) return res.status(400).json({ message: "organizationId and id required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const conv = await getConversation(id, orgId, userId);
      if (!conv) return res.status(404).json({ message: "Not found" });
      const msgs = await getMessages(id);
      res.json({ conversation: conv, messages: msgs });
    } catch (e: any) {
      console.error("[PBI Agent] Get conversation:", e.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'patch', '/api/powerbi-agent/conversations/:id', {
    tag: 'AI', summary: 'Rename a Power BI agent conversation',
    responses: { ...r200('Updated', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.query.organizationId || req.body?.organizationId);
      const id = Number(req.params.id);
      const title = String(req.body?.title || "").trim();
      if (!orgId || !id || !title) return res.status(400).json({ message: "organizationId, id and title required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const updated = await updateConversationTitle(id, orgId, userId, title);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e: any) {
      console.error("[PBI Agent] Rename:", e.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'delete', '/api/powerbi-agent/conversations/:id', {
    tag: 'AI', summary: 'Delete a Power BI agent conversation',
    responses: { ...r200('Deleted', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.query.organizationId);
      const id = Number(req.params.id);
      if (!orgId || !id) return res.status(400).json({ message: "organizationId and id required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      await deleteConversation(id, orgId, userId);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[PBI Agent] Delete:", e.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'post', '/api/powerbi-agent/conversations/:id/messages', {
    tag: 'AI', summary: 'Append a single message to a conversation (legacy migration only)',
    responses: { ...r200('Inserted', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.query.organizationId || req.body?.organizationId);
      const id = Number(req.params.id);
      if (!orgId || !id) return res.status(400).json({ message: "organizationId and id required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const conv = await getConversation(id, orgId, userId);
      if (!conv) return res.status(404).json({ message: "Not found" });

      const role = req.body?.role;
      const content = String(req.body?.content || "").slice(0, MAX_MESSAGE_LENGTH);
      if ((role !== "user" && role !== "assistant") || !content) {
        return res.status(400).json({ message: "role (user|assistant) and content required" });
      }
      const row = await addMessage(id, role, content, null, null);
      res.json(row);
    } catch (e: any) {
      console.error("[PBI Agent] Append message:", e.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'post', '/api/powerbi-agent/chat', {
    tag: 'AI',
    summary: 'Stream a Power BI Agent chat response',
    requestBody: body({
      type: 'object',
      properties: {
        messages: { type: 'array' },
        organizationId: { type: 'integer' },
        model: { type: 'string', enum: ['fast', 'smart', 'claude'] },
        conversationId: { type: 'integer', nullable: true },
      },
      required: ['messages', 'organizationId'],
    }),
    responses: { ...r200('SSE stream', { type: 'object' }), ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      }

      const { messages, organizationId, model, conversationId } = parsed.data;
      let modelTier: PbiModelTier = (model || "fast") as PbiModelTier;
      if (!isModelAvailable(modelTier)) modelTier = "fast";

      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      // Resolve / create conversation
      let convId = conversationId ?? null;
      if (convId) {
        const existing = await getConversation(convId, organizationId, userId);
        if (!existing) convId = null;
      }
      if (!convId) {
        const firstUser = messages.find(m => m.role === "user");
        const title = firstUser ? deriveTitle(firstUser.content) : "New Power BI request";
        const created = await createConversation(organizationId, userId, modelTier, title);
        convId = created.id;
      } else {
        await updateConversationModel(convId, modelTier);
      }

      // Persist the latest user turn (assume the last message is the new user input that the client just sent)
      const last = messages[messages.length - 1];
      if (last?.role === "user") {
        await addMessage(convId, "user", last.content, last.attachments ?? null);
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      (res as any).flushHeaders?.();

      const sendSSE = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        (res as any).flush?.();
      };

      // Tell client the conversationId we're using
      sendSSE({ conversationId: convId });

      await streamPowerBIAgentResponse(
        organizationId,
        userId,
        messages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          attachments: m.attachments,
        })),
        modelTier,
        convId,
        (content) => sendSSE({ content }),
        (_full) => { sendSSE({ done: true }); res.end(); },
        (error) => {
          console.error("[PowerBI Agent] Stream error:", error.message);
          sendSSE({ error: "An error occurred. Please try again." });
          res.end();
        },
      );

      logUserActivity(userId, "powerbi_agent_chat", "powerbi_agent_conversation", convId ?? undefined, { organizationId });
    } catch (err: any) {
      console.error("[PowerBI Agent] Route error:", err.message);
      if (!res.headersSent) res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'get', '/api/powerbi-agent/requests', {
    tag: 'Power BI', summary: 'List Power BI intake requests for the organization',
    responses: { ...r200('List', { type: 'array' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.query.organizationId);
      if (!orgId || isNaN(orgId)) return res.status(400).json({ message: "organizationId query param required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const requests = await getPowerBIIntakeRequests(orgId);
      res.json(requests);
    } catch (err: any) {
      console.error("[PowerBI Agent] List error:", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'get', '/api/powerbi-agent/requests/:id', {
    tag: 'Power BI', summary: 'Get a single Power BI intake request',
    responses: { ...r200('Detail', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const requestId = Number(req.params.id);
      const orgId = Number(req.query.organizationId);
      if (!orgId || isNaN(orgId)) return res.status(400).json({ message: "organizationId query param required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const request = await getPowerBIIntakeRequest(requestId, orgId);
      if (!request) return res.status(404).json({ message: "Request not found" });
      res.json(request);
    } catch (err: any) {
      console.error("[PowerBI Agent] Detail error:", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'post', '/api/powerbi-agent/requests/:id/convert', {
    tag: 'Power BI', summary: 'Convert a Power BI request into a regular project intake',
    responses: { ...r200('Created', { type: 'object' }), ...authRes, ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const requestId = Number(req.params.id);
      const orgId = Number(req.query.organizationId || req.body?.organizationId);
      if (!orgId || isNaN(orgId)) return res.status(400).json({ message: "organizationId required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const role = await getUserOrgRole(userId, orgId);
      if (!role || role === 'team_member') return res.status(403).json({ message: "Only admins and owners can convert Power BI requests" });
      const projectIntake = await convertPowerBIRequestToIntake(requestId, orgId, userId);
      res.json({ success: true, projectIntake });
    } catch (err: any) {
      console.error("[PowerBI Agent] Convert error:", err.message);
      if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
      if (err.message.includes("already has")) return res.status(409).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'delete', '/api/powerbi-agent/requests/:id', {
    tag: 'Power BI', summary: 'Delete a Power BI intake request',
    responses: { ...r200('Deleted', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const requestId = Number(req.params.id);
      const orgId = Number(req.query.organizationId);
      if (!orgId || isNaN(orgId)) return res.status(400).json({ message: "organizationId query param required" });
      const orgIds = await getUserOrgIds(userId);
      if (!orgIds.includes(orgId)) return res.status(403).json({ message: "Access denied" });
      const role = await getUserOrgRole(userId, orgId);
      if (!role || role === 'team_member') return res.status(403).json({ message: "Only admins and owners can delete Power BI requests" });
      await deletePowerBIIntakeRequest(requestId, orgId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[PowerBI Agent] Delete error:", err.message);
      if (err.message.includes("not found")) return res.status(404).json({ message: err.message });
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
