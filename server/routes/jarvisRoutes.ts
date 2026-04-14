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

      const { messages, organizationId, concise, pageContext, attachments } = parsed.data;

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await streamJarvisResponse(
        Number(organizationId),
        messages,
        concise ?? false,
        (content) => {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        },
        (fullResponse) => {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          logUserActivity(userId, "jarvis_chat", "jarvis", undefined, {
            messageCount: messages.length,
            responseLength: fullResponse.length,
            pageContext: pageContext?.entityType ? `${pageContext.entityType}:${pageContext.entityId}` : undefined,
          }, req).catch(() => {});
        },
        (error) => {
          console.error("[JARVIS] Stream error:", error);
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: "An error occurred while processing your request." })}\n\n`);
            res.end();
          } else {
            res.status(500).json({ message: "Failed to process JARVIS request" });
          }
        },
        pageContext ? { path: pageContext.path, entityType: pageContext.entityType, entityId: pageContext.entityId } : undefined,
        attachments,
      );
    } catch (error) {
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

      const result = await executeJarvisAction(Number(organizationId), userId, action);

      await logUserActivity(userId, "jarvis_action", "jarvis", action.projectId, {
        actionType: action.type,
        success: result.success,
        entityId: result.entityId,
      }, req).catch(() => {});

      res.json(result);
    } catch (error: any) {
      console.error("[JARVIS] Action error:", error);
      res.status(500).json({ message: error.message || "Failed to execute action" });
    }
  });
}
