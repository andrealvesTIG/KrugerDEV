import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { submittals, submittalRevisions, projects, users, organizationMembers } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  validateUserInOrg,
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

const createSubmittalSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  specSection: z.string().max(200).nullable().optional(),
  type: z.enum(["Product Data", "Shop Drawings", "Samples", "Design Data", "Test Reports", "Certificates", "Manufacturer Instructions", "Other"]).default("Product Data"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  reviewerId: z.string().max(200).nullable().optional(),
  reviewerName: z.string().max(500).nullable().optional(),
  submitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  requiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  leadTime: z.number().int().min(0).max(365).nullable().optional(),
  costImpact: z.string().max(500).nullable().optional(),
  scheduleImpact: z.string().max(500).nullable().optional(),
  attachments: z.array(attachmentSchema).max(20).nullable().optional(),
}).strict();

const updateSubmittalSchema = createSubmittalSchema.partial().extend({
  status: z.enum(["Pending", "Under Review", "Approved", "Rejected", "Revise & Resubmit"]).optional(),
}).strict();

const createRevisionSchema = z.object({
  notes: z.string().max(10000).nullable().optional(),
  status: z.enum(["Pending", "Under Review", "Approved", "Rejected", "Revise & Resubmit"]).default("Pending"),
  attachments: z.array(attachmentSchema).max(20).nullable().optional(),
}).strict();

const reviewRevisionSchema = z.object({
  status: z.enum(["Approved", "Rejected", "Revise & Resubmit"]),
  reviewNotes: z.string().max(10000).nullable().optional(),
}).strict();

async function resolveOrgUserByName(name: string, orgId: number): Promise<string | null> {
  const members = await db.select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId));
  if (members.length === 0) return null;

  const memberIds = members.map(m => m.userId);
  const matchingUsers = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(sql`${users.id} = ANY(${memberIds})`);

  const nameLower = name.toLowerCase().trim();
  const match = matchingUsers.find(u => {
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase();
    return fullName === nameLower || u.email?.toLowerCase() === nameLower;
  });
  return match?.id || null;
}

export function registerSubmittalRoutes(app: Express) {
  app.get("/api/projects/:projectId/submittals", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const conditions = [eq(submittals.projectId, projectId), isNull(submittals.deletedAt)];

      const statusParam = req.query.status as string | undefined;
      if (statusParam) {
        const validStatuses = ["Pending", "Under Review", "Approved", "Rejected", "Revise & Resubmit"] as const;
        if (!validStatuses.includes(statusParam as typeof validStatuses[number])) {
          return res.status(400).json({ message: "Invalid status filter" });
        }
        conditions.push(eq(submittals.status, statusParam));
      }

      const results = await db.select().from(submittals)
        .where(and(...conditions))
        .orderBy(desc(submittals.createdAt));

      res.json(results);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching submittals" });
    }
  });

  app.get("/api/projects/:projectId/submittals/:submittalId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const submittalId = Number(req.params.submittalId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const submittal = await db.select().from(submittals)
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)))
        .then(r => r[0]);

      if (!submittal) return res.status(404).json({ message: "Submittal not found" });

      const revisions = await db.select().from(submittalRevisions)
        .where(eq(submittalRevisions.submittalId, submittalId))
        .orderBy(desc(submittalRevisions.revisionNumber));

      res.json({ ...submittal, revisions });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching submittal" });
    }
  });

  app.post("/api/projects/:projectId/submittals", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsed = createSubmittalSchema.parse(req.body);

      let resolvedReviewerId = parsed.reviewerId || null;
      if (resolvedReviewerId) {
        const isOrgMember = await validateUserInOrg(resolvedReviewerId, project.organizationId);
        if (!isOrgMember) return res.status(400).json({ message: "Reviewer is not a member of this organization" });
      } else if (parsed.reviewerName) {
        resolvedReviewerId = await resolveOrgUserByName(parsed.reviewerName, project.organizationId);
      }

      const existingCount = await db.select({ count: sql<number>`count(*)::int` })
        .from(submittals)
        .where(eq(submittals.projectId, projectId))
        .then(r => r[0]?.count ?? 0);

      const submittalNumber = `SUB-${String(existingCount + 1).padStart(3, "0")}`;

      const { storage } = await import("../storage");
      const user = await storage.getUser(userId);
      const userName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown" : "Unknown";

      const result = await db.transaction(async (tx) => {
        const [submittal] = await tx.insert(submittals).values({
          projectId,
          organizationId: project.organizationId,
          submittalNumber,
          title: parsed.title,
          description: parsed.description || null,
          specSection: parsed.specSection || null,
          type: parsed.type,
          priority: parsed.priority,
          reviewerId: resolvedReviewerId,
          reviewerName: parsed.reviewerName || null,
          submitDate: parsed.submitDate || null,
          requiredDate: parsed.requiredDate || null,
          leadTime: parsed.leadTime ?? null,
          costImpact: parsed.costImpact || null,
          scheduleImpact: parsed.scheduleImpact || null,
          attachments: parsed.attachments || null,
          submittedBy: userId,
          submittedByName: userName,
          createdBy: userId,
          currentRevision: 1,
        }).returning();

        const [revision] = await tx.insert(submittalRevisions).values({
          submittalId: submittal.id,
          revisionNumber: 1,
          status: "Pending",
          notes: parsed.description || null,
          attachments: parsed.attachments || null,
          createdBy: userId,
          createdByName: userName,
        }).returning();

        return { ...submittal, revisions: [revision] };
      });

      if (resolvedReviewerId) {
        await storage.createNotification({
          userId: resolvedReviewerId,
          type: "submittal_assignment",
          title: `New Submittal for Review: ${result.submittalNumber}`,
          message: `${userName} submitted ${result.submittalNumber}: "${result.title}" for your review`,
          severity: "info",
          organizationId: project.organizationId,
          projectId,
          fromUserId: userId,
          fromUserName: userName,
          actionUrl: `/projects/${projectId}?tab=submittals`,
          metadata: { submittalId: result.id, submittalNumber: result.submittalNumber },
        });
      }

      logUserActivity(userId, "create_submittal", "submittal", result.id, { projectId, title: result.title }, req);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error creating submittal" });
    }
  });

  app.patch("/api/projects/:projectId/submittals/:submittalId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const submittalId = Number(req.params.submittalId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db.select().from(submittals)
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Submittal not found" });

      const parsed = updateSubmittalSchema.parse(req.body);

      let resolvedReviewerId = parsed.reviewerId;
      if (resolvedReviewerId) {
        const isOrgMember = await validateUserInOrg(resolvedReviewerId, project.organizationId);
        if (!isOrgMember) return res.status(400).json({ message: "Reviewer is not a member of this organization" });
      } else if (parsed.reviewerName && parsed.reviewerId === undefined) {
        resolvedReviewerId = await resolveOrgUserByName(parsed.reviewerName, project.organizationId) || undefined;
      }

      const updateData: Partial<typeof submittals.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };

      if (parsed.title !== undefined) updateData.title = parsed.title;
      if (parsed.description !== undefined) updateData.description = parsed.description || null;
      if (parsed.specSection !== undefined) updateData.specSection = parsed.specSection || null;
      if (parsed.type !== undefined) updateData.type = parsed.type;
      if (parsed.priority !== undefined) updateData.priority = parsed.priority;
      if (resolvedReviewerId !== undefined) updateData.reviewerId = resolvedReviewerId || null;
      if (parsed.reviewerName !== undefined) updateData.reviewerName = parsed.reviewerName || null;
      if (parsed.submitDate !== undefined) updateData.submitDate = parsed.submitDate || null;
      if (parsed.requiredDate !== undefined) updateData.requiredDate = parsed.requiredDate || null;
      if (parsed.leadTime !== undefined) updateData.leadTime = parsed.leadTime ?? null;
      if (parsed.costImpact !== undefined) updateData.costImpact = parsed.costImpact || null;
      if (parsed.scheduleImpact !== undefined) updateData.scheduleImpact = parsed.scheduleImpact || null;
      if (parsed.attachments !== undefined) updateData.attachments = parsed.attachments || null;

      if (parsed.status !== undefined) {
        updateData.status = parsed.status;
        if ((parsed.status === "Approved" || parsed.status === "Rejected") && !existing.closedAt) {
          updateData.closedAt = new Date();
          updateData.closedBy = userId;
          updateData.reviewedDate = new Date().toISOString().split("T")[0];
        } else if ((parsed.status === "Pending" || parsed.status === "Under Review") && existing.closedAt) {
          updateData.closedAt = null;
          updateData.closedBy = null;
        }
      }

      const [updated] = await db.update(submittals)
        .set(updateData)
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)))
        .returning();

      if (parsed.status && parsed.status !== existing.status) {
        const { storage } = await import("../storage");
        const user = await storage.getUser(userId);
        const userName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown" : "Unknown";
        const notifyUserId = existing.submittedBy && existing.submittedBy !== userId
          ? existing.submittedBy
          : existing.createdBy && existing.createdBy !== userId
            ? existing.createdBy
            : null;
        if (notifyUserId) {
          await storage.createNotification({
            userId: notifyUserId,
            type: "submittal_status_change",
            title: `Submittal ${parsed.status}: ${existing.submittalNumber}`,
            message: `${userName} changed ${existing.submittalNumber}: "${existing.title}" to ${parsed.status}`,
            severity: parsed.status === "Rejected" ? "warning" : "info",
            organizationId: project.organizationId,
            projectId,
            fromUserId: userId,
            fromUserName: userName,
            actionUrl: `/projects/${projectId}?tab=submittals`,
            metadata: { submittalId, submittalNumber: existing.submittalNumber, status: parsed.status },
          });
        }
      }

      logUserActivity(userId, "update_submittal", "submittal", submittalId, { projectId, status: updated.status }, req);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error updating submittal" });
    }
  });

  app.delete("/api/projects/:projectId/submittals/:submittalId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const submittalId = Number(req.params.submittalId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db.select().from(submittals)
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Submittal not found" });

      await db.update(submittals)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)));

      logUserActivity(userId, "delete_submittal", "submittal", submittalId, { projectId }, req);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error deleting submittal" });
    }
  });

  app.post("/api/projects/:projectId/submittals/:submittalId/revisions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const submittalId = Number(req.params.submittalId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const submittal = await db.select().from(submittals)
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)))
        .then(r => r[0]);
      if (!submittal) return res.status(404).json({ message: "Submittal not found" });

      const parsed = createRevisionSchema.parse(req.body);

      const { storage } = await import("../storage");
      const user = await storage.getUser(userId);
      const userName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown" : "Unknown";

      const nextRevision = (submittal.currentRevision || 1) + 1;

      const result = await db.transaction(async (tx) => {
        const [revision] = await tx.insert(submittalRevisions).values({
          submittalId,
          revisionNumber: nextRevision,
          status: parsed.status,
          notes: parsed.notes || null,
          attachments: parsed.attachments || null,
          createdBy: userId,
          createdByName: userName,
        }).returning();

        await tx.update(submittals)
          .set({
            currentRevision: nextRevision,
            status: parsed.status === "Pending" ? "Under Review" : parsed.status,
            updatedAt: new Date(),
          })
          .where(eq(submittals.id, submittalId));

        return revision;
      });

      logUserActivity(userId, "create_submittal_revision", "submittal_revision", result.id, { submittalId, projectId, revisionNumber: nextRevision }, req);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error creating revision" });
    }
  });

  app.patch("/api/projects/:projectId/submittals/:submittalId/revisions/:revisionId/review", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const submittalId = Number(req.params.submittalId);
      const revisionId = Number(req.params.revisionId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const submittal = await db.select().from(submittals)
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)))
        .then(r => r[0]);
      if (!submittal) return res.status(404).json({ message: "Submittal not found" });

      const parsed = reviewRevisionSchema.parse(req.body);

      const { storage } = await import("../storage");
      const user = await storage.getUser(userId);
      const userName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown" : "Unknown";

      const result = await db.transaction(async (tx) => {
        const [updated] = await tx.update(submittalRevisions)
          .set({
            status: parsed.status,
            reviewNotes: parsed.reviewNotes || null,
            reviewedBy: userId,
            reviewedByName: userName,
            reviewedAt: new Date(),
          })
          .where(and(eq(submittalRevisions.id, revisionId), eq(submittalRevisions.submittalId, submittalId)))
          .returning();

        if (!updated) {
          throw new Error("REVISION_NOT_FOUND");
        }

        const submittalUpdate: Partial<typeof submittals.$inferInsert> & { updatedAt: Date } = {
          status: parsed.status,
          updatedAt: new Date(),
          reviewedDate: new Date().toISOString().split("T")[0],
        };

        if (parsed.status === "Approved" || parsed.status === "Rejected") {
          submittalUpdate.closedAt = new Date();
          submittalUpdate.closedBy = userId;
        }

        await tx.update(submittals)
          .set(submittalUpdate)
          .where(eq(submittals.id, submittalId));

        return updated;
      });

      if (submittal.submittedBy && submittal.submittedBy !== userId) {
        const { storage } = await import("../storage");
        await storage.createNotification({
          userId: submittal.submittedBy,
          type: "submittal_review",
          title: `Submittal ${parsed.status}: ${submittal.submittalNumber}`,
          message: `${userName} ${parsed.status.toLowerCase()} ${submittal.submittalNumber}: "${submittal.title}"`,
          severity: parsed.status === "Rejected" ? "warning" : "info",
          organizationId: project.organizationId,
          projectId,
          fromUserId: userId,
          fromUserName: userName,
          actionUrl: `/projects/${projectId}?tab=submittals`,
          metadata: { submittalId, submittalNumber: submittal.submittalNumber, status: parsed.status },
        });
      }

      logUserActivity(userId, "review_submittal_revision", "submittal_revision", revisionId, { submittalId, projectId, status: parsed.status }, req);
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "REVISION_NOT_FOUND") {
        return res.status(404).json({ message: "Revision not found" });
      }
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error reviewing revision" });
    }
  });

  const updateRevisionSchema = z.object({
    notes: z.string().max(10000).nullable().optional(),
    attachments: z.array(attachmentSchema).max(20).nullable().optional(),
  }).strict();

  app.patch("/api/projects/:projectId/submittals/:submittalId/revisions/:revisionId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const submittalId = Number(req.params.submittalId);
      const revisionId = Number(req.params.revisionId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const submittal = await db.select().from(submittals)
        .where(and(eq(submittals.id, submittalId), eq(submittals.projectId, projectId), isNull(submittals.deletedAt)))
        .then(r => r[0]);
      if (!submittal) return res.status(404).json({ message: "Submittal not found" });

      const existing = await db.select().from(submittalRevisions)
        .where(and(eq(submittalRevisions.id, revisionId), eq(submittalRevisions.submittalId, submittalId)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Revision not found" });

      if (existing.createdBy !== userId) {
        return res.status(403).json({ message: "You can only edit your own revisions" });
      }

      if (existing.reviewedAt) {
        return res.status(400).json({ message: "Cannot edit a revision that has already been reviewed" });
      }

      const parsed = updateRevisionSchema.parse(req.body);
      const updateData: Record<string, unknown> = {};
      if (parsed.notes !== undefined) updateData.notes = parsed.notes || null;
      if (parsed.attachments !== undefined) updateData.attachments = parsed.attachments || null;

      const [updated] = await db.update(submittalRevisions)
        .set(updateData)
        .where(and(eq(submittalRevisions.id, revisionId), eq(submittalRevisions.submittalId, submittalId)))
        .returning();

      logUserActivity(userId, "update_submittal_revision", "submittal_revision", revisionId, { submittalId, projectId }, req);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error updating revision" });
    }
  });

  app.delete("/api/projects/:projectId/submittals/:submittalId/revisions/:revisionId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const submittalId = Number(req.params.submittalId);
      const revisionId = Number(req.params.revisionId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db.select().from(submittalRevisions)
        .where(and(eq(submittalRevisions.id, revisionId), eq(submittalRevisions.submittalId, submittalId)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Revision not found" });

      if (existing.createdBy !== userId) {
        return res.status(403).json({ message: "You can only delete your own revisions" });
      }

      if (existing.reviewedAt) {
        return res.status(400).json({ message: "Cannot delete a revision that has already been reviewed" });
      }

      await db.delete(submittalRevisions)
        .where(and(eq(submittalRevisions.id, revisionId), eq(submittalRevisions.submittalId, submittalId)));

      logUserActivity(userId, "delete_submittal_revision", "submittal_revision", revisionId, { submittalId, projectId }, req);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error deleting revision" });
    }
  });
}
