import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, sql, gte, lte } from "drizzle-orm";
import { rfis, rfiResponses, projects } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  formatZodErrors,
  logUserActivity,
} from "./helpers";

const attachmentSchema = z.object({
  name: z.string().min(1).max(500),
  url: z.string().min(1).max(2000).refine(
    (u) => /^https?:\/\//i.test(u),
    { message: "Attachment URL must use http or https" }
  ),
  size: z.number().int().min(0).optional(),
  type: z.string().max(200).optional(),
});

const createRfiSchema = z.object({
  subject: z.string().min(1).max(500),
  question: z.string().min(1).max(10000),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  category: z.string().max(200).nullable().optional(),
  assignedTo: z.string().max(200).nullable().optional(),
  assignedToName: z.string().max(500).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  distributionList: z.string().max(2000).nullable().optional(),
  costImpact: z.string().max(500).nullable().optional(),
  scheduleImpact: z.string().max(500).nullable().optional(),
  references: z.string().max(2000).nullable().optional(),
  attachments: z.array(attachmentSchema).max(20).nullable().optional(),
}).strict();

const updateRfiSchema = createRfiSchema.partial().extend({
  status: z.enum(["Open", "Answered", "Closed"]).optional(),
}).strict();

const createResponseSchema = z.object({
  responseText: z.string().min(1).max(10000),
  isOfficial: z.boolean().default(false),
  attachments: z.array(attachmentSchema).max(20).nullable().optional(),
}).strict();

export function registerRfiRoutes(app: Express) {
  app.get("/api/projects/:projectId/rfis", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const conditions = [eq(rfis.projectId, projectId), isNull(rfis.deletedAt)];

      const statusParam = req.query.status as string | undefined;
      if (statusParam) {
        const validStatuses = ["Open", "Answered", "Closed"] as const;
        if (!validStatuses.includes(statusParam as typeof validStatuses[number])) {
          return res.status(400).json({ message: "Invalid status filter" });
        }
        conditions.push(eq(rfis.status, statusParam));
      }

      const results = await db.select().from(rfis)
        .where(and(...conditions))
        .orderBy(desc(rfis.createdAt));

      res.json(results);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching RFIs" });
    }
  });

  app.get("/api/projects/:projectId/rfis/:rfiId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const rfiId = Number(req.params.rfiId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const rfi = await db.select().from(rfis)
        .where(and(eq(rfis.id, rfiId), eq(rfis.projectId, projectId), isNull(rfis.deletedAt)))
        .then(r => r[0]);

      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const responses = await db.select().from(rfiResponses)
        .where(eq(rfiResponses.rfiId, rfiId))
        .orderBy(desc(rfiResponses.createdAt));

      res.json({ ...rfi, responses });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching RFI" });
    }
  });

  app.post("/api/projects/:projectId/rfis", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsed = createRfiSchema.parse(req.body);

      const existingCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(rfis)
        .where(eq(rfis.projectId, projectId))
        .then(r => r[0]?.count ?? 0);

      const rfiNumber = `RFI-${String(existingCount + 1).padStart(3, "0")}`;

      const [rfi] = await db.insert(rfis).values({
        projectId,
        organizationId: project.organizationId,
        rfiNumber,
        subject: parsed.subject,
        question: parsed.question,
        priority: parsed.priority,
        category: parsed.category || null,
        assignedTo: parsed.assignedTo || null,
        assignedToName: parsed.assignedToName || null,
        dueDate: parsed.dueDate || null,
        distributionList: parsed.distributionList || null,
        costImpact: parsed.costImpact || null,
        scheduleImpact: parsed.scheduleImpact || null,
        references: parsed.references || null,
        attachments: parsed.attachments || null,
        createdBy: userId,
      }).returning();

      if (parsed.assignedTo) {
        const { storage } = await import("../storage");
        const creator = await storage.getUser(userId);
        const creatorName = creator ? `${creator.firstName || ""} ${creator.lastName || ""}`.trim() || creator.email || "Unknown" : "Unknown";
        await storage.createNotification({
          userId: parsed.assignedTo,
          type: "rfi_assignment",
          title: `New RFI Assigned: ${rfi.rfiNumber}`,
          message: `You have been assigned ${rfi.rfiNumber}: "${rfi.subject}" by ${creatorName}`,
          severity: "info",
          organizationId: project.organizationId,
          projectId,
          fromUserId: userId,
          fromUserName: creatorName,
          actionUrl: `/projects/${projectId}?tab=rfis`,
          metadata: { rfiId: rfi.id, rfiNumber: rfi.rfiNumber },
        });
      }

      logUserActivity(userId, "create_rfi", "rfi", rfi.id, { projectId, subject: rfi.subject }, req);
      res.status(201).json(rfi);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error creating RFI" });
    }
  });

  app.patch("/api/projects/:projectId/rfis/:rfiId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const rfiId = Number(req.params.rfiId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db.select().from(rfis)
        .where(and(eq(rfis.id, rfiId), eq(rfis.projectId, projectId), isNull(rfis.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "RFI not found" });

      const parsed = updateRfiSchema.parse(req.body);
      const updateData: Partial<typeof rfis.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };

      if (parsed.subject !== undefined) updateData.subject = parsed.subject;
      if (parsed.question !== undefined) updateData.question = parsed.question;
      if (parsed.priority !== undefined) updateData.priority = parsed.priority;
      if (parsed.category !== undefined) updateData.category = parsed.category || null;
      if (parsed.assignedTo !== undefined) updateData.assignedTo = parsed.assignedTo || null;
      if (parsed.assignedToName !== undefined) updateData.assignedToName = parsed.assignedToName || null;
      if (parsed.dueDate !== undefined) updateData.dueDate = parsed.dueDate || null;
      if (parsed.distributionList !== undefined) updateData.distributionList = parsed.distributionList || null;
      if (parsed.costImpact !== undefined) updateData.costImpact = parsed.costImpact || null;
      if (parsed.scheduleImpact !== undefined) updateData.scheduleImpact = parsed.scheduleImpact || null;
      if (parsed.references !== undefined) updateData.references = parsed.references || null;
      if (parsed.attachments !== undefined) updateData.attachments = parsed.attachments || null;

      if (parsed.status !== undefined) {
        updateData.status = parsed.status;
        if (parsed.status === "Closed" && existing.status !== "Closed") {
          updateData.closedAt = new Date();
          updateData.closedBy = userId;
        }
      }

      const [updated] = await db.update(rfis)
        .set(updateData)
        .where(and(eq(rfis.id, rfiId), eq(rfis.projectId, projectId), isNull(rfis.deletedAt)))
        .returning();

      logUserActivity(userId, "update_rfi", "rfi", rfiId, { projectId, status: updated.status }, req);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error updating RFI" });
    }
  });

  app.delete("/api/projects/:projectId/rfis/:rfiId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const rfiId = Number(req.params.rfiId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db.select().from(rfis)
        .where(and(eq(rfis.id, rfiId), eq(rfis.projectId, projectId), isNull(rfis.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "RFI not found" });

      await db.update(rfis)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(and(eq(rfis.id, rfiId), eq(rfis.projectId, projectId), isNull(rfis.deletedAt)));

      logUserActivity(userId, "delete_rfi", "rfi", rfiId, { projectId }, req);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error deleting RFI" });
    }
  });

  app.post("/api/projects/:projectId/rfis/:rfiId/responses", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const rfiId = Number(req.params.rfiId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const rfi = await db.select().from(rfis)
        .where(and(eq(rfis.id, rfiId), eq(rfis.projectId, projectId), isNull(rfis.deletedAt)))
        .then(r => r[0]);
      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const parsed = createResponseSchema.parse(req.body);

      const { storage } = await import("../storage");
      const user = await storage.getUser(userId);
      const userName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown" : "Unknown";

      const [response] = await db.insert(rfiResponses).values({
        rfiId,
        responseText: parsed.responseText,
        isOfficial: parsed.isOfficial,
        attachments: parsed.attachments || null,
        createdBy: userId,
        createdByName: userName,
      }).returning();

      if (parsed.isOfficial && rfi.status === "Open") {
        await db.update(rfis)
          .set({ status: "Answered", updatedAt: new Date() })
          .where(and(eq(rfis.id, rfiId), eq(rfis.projectId, projectId), isNull(rfis.deletedAt)));
      }

      if (rfi.createdBy && rfi.createdBy !== userId) {
        const { storage } = await import("../storage");
        await storage.createNotification({
          userId: rfi.createdBy,
          type: "rfi_response",
          title: `${parsed.isOfficial ? "Official " : ""}Response on ${rfi.rfiNumber}`,
          message: `${userName} responded to ${rfi.rfiNumber}: "${rfi.subject}"`,
          severity: "info",
          organizationId: project.organizationId,
          projectId,
          fromUserId: userId,
          fromUserName: userName,
          actionUrl: `/projects/${projectId}?tab=rfis`,
          metadata: { rfiId, rfiNumber: rfi.rfiNumber },
        });
      }

      logUserActivity(userId, "create_rfi_response", "rfi_response", response.id, { rfiId, projectId }, req);
      res.status(201).json(response);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error adding response" });
    }
  });
}
