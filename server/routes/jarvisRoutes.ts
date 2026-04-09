import type { Express } from "express";
import { z } from "zod";
import { streamJarvisResponse, executeJarvisAction, type JarvisMessage } from "../services/jarvisService";
import {
  getUserIdFromRequest,
  getUserOrgIds,
  getUserOrgRole,
  logUserActivity,
} from "./helpers";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 10000;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LENGTH),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  organizationId: z.number().int().positive(),
  concise: z.boolean().optional(),
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
  app.post("/api/jarvis/chat", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const parsed = chatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request: " + parsed.error.issues.map(i => i.message).join(", ") });
      }

      const { messages, organizationId, concise } = parsed.data;

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
      );
    } catch (error) {
      console.error("[JARVIS] Route error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.post("/api/jarvis/action", async (req, res) => {
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
