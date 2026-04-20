import type { Express } from "express";
import { z } from "zod";
import { streamPowerBIAgentResponse, getPowerBIIntakeRequests, getPowerBIIntakeRequest, convertPowerBIRequestToIntake, deletePowerBIIntakeRequest } from "../services/powerbiAgentService";
import {
  getUserIdFromRequest,
  getUserOrgIds,
  getUserOrgRole,
  logUserActivity,
} from "./helpers";
import { apiRoute, body, r200, inputRes, authRes, stdRes } from "../route-registry";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 50000;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_LENGTH),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
  organizationId: z.number().int().positive(),
});

export function registerPowerBIAgentRoutes(app: Express) {
  apiRoute(app, 'post', '/api/powerbi-agent/chat', {
    tag: 'AI',
    summary: 'Stream a Power BI Agent chat response',
    requestBody: body({
      type: 'object',
      properties: {
        messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } } },
        organizationId: { type: 'integer' },
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
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      }

      const { messages, organizationId } = parsed.data;

      const userOrgIds = await getUserOrgIds(userId);
      if (!userOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const sendSSE = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      await streamPowerBIAgentResponse(
        organizationId,
        userId,
        messages.map(m => ({ ...m, role: m.role as "user" | "assistant" })),
        (content) => sendSSE({ content }),
        (fullResponse) => {
          sendSSE({ done: true });
          res.end();
        },
        (error) => {
          console.error("[PowerBI Agent] Stream error:", error.message);
          sendSSE({ error: "An error occurred. Please try again." });
          res.end();
        },
      );

      logUserActivity(userId, "powerbi_agent_chat", organizationId);
    } catch (err: any) {
      console.error("[PowerBI Agent] Route error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  apiRoute(app, 'get', '/api/powerbi-agent/requests', {
    tag: 'Power BI',
    summary: 'List Power BI intake requests for the organization',
    responses: { ...r200('List of intake requests', { type: 'array', items: { type: 'object' } }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const orgId = Number(req.query.organizationId);
      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ message: "organizationId query param required" });
      }

      const userOrgIds = await getUserOrgIds(userId);
      if (!userOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const requests = await getPowerBIIntakeRequests(orgId);
      res.json(requests);
    } catch (err: any) {
      console.error("[PowerBI Agent] List error:", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'get', '/api/powerbi-agent/requests/:id', {
    tag: 'Power BI',
    summary: 'Get a single Power BI intake request',
    responses: { ...r200('Intake request details', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requestId = Number(req.params.id);
      const orgId = Number(req.query.organizationId);
      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ message: "organizationId query param required" });
      }

      const userOrgIds = await getUserOrgIds(userId);
      if (!userOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const request = await getPowerBIIntakeRequest(requestId, orgId);
      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      res.json(request);
    } catch (err: any) {
      console.error("[PowerBI Agent] Detail error:", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'post', '/api/powerbi-agent/requests/:id/convert', {
    tag: 'Power BI',
    summary: 'Convert a Power BI request into a regular project intake',
    responses: { ...r200('Created project intake', { type: 'object' }), ...authRes, ...inputRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requestId = Number(req.params.id);
      const orgId = Number(req.query.organizationId || req.body?.organizationId);
      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ message: "organizationId required" });
      }

      const userOrgIds = await getUserOrgIds(userId);
      if (!userOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const role = await getUserOrgRole(userId, orgId);
      if (!role || role === 'team_member') {
        return res.status(403).json({ message: "Only admins and owners can convert Power BI requests" });
      }

      const projectIntake = await convertPowerBIRequestToIntake(requestId, orgId, userId);
      res.json({ success: true, projectIntake });
    } catch (err: any) {
      console.error("[PowerBI Agent] Convert error:", err.message);
      if (err.message.includes("not found")) {
        return res.status(404).json({ message: err.message });
      }
      if (err.message.includes("already has")) {
        return res.status(409).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  apiRoute(app, 'delete', '/api/powerbi-agent/requests/:id', {
    tag: 'Power BI',
    summary: 'Delete a Power BI intake request',
    responses: { ...r200('Deleted', { type: 'object' }), ...authRes, ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requestId = Number(req.params.id);
      const orgId = Number(req.query.organizationId);
      if (!orgId || isNaN(orgId)) {
        return res.status(400).json({ message: "organizationId query param required" });
      }

      const userOrgIds = await getUserOrgIds(userId);
      if (!userOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const role = await getUserOrgRole(userId, orgId);
      if (!role || role === 'team_member') {
        return res.status(403).json({ message: "Only admins and owners can delete Power BI requests" });
      }

      await deletePowerBIIntakeRequest(requestId, orgId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[PowerBI Agent] Delete error:", err.message);
      if (err.message.includes("not found")) {
        return res.status(404).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
