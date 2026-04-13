import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, sql, SQL, asc } from "drizzle-orm";
import { punchItems, punchItemPhotos, punchItemStatusHistory, projects, users } from "@shared/schema";
import { storage } from "../storage";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  formatZodErrors,
} from "./helpers";

async function getUserDisplayName(userId: string): Promise<string> {
  const result = await db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
  if (!result) return "Unknown";
  if (result.firstName && result.lastName) return `${result.firstName} ${result.lastName}`;
  return result.username || result.email || "Unknown";
}

const VALID_STATUSES = ["Open", "In Progress", "Ready for Review", "Closed"] as const;
const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const VALID_PHOTO_TYPES = ["before", "after", "general"] as const;

const createPunchItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  priority: z.enum(VALID_PRIORITIES).default("Medium"),
  status: z.enum(VALID_STATUSES).default("Open"),
  assignedTo: z.string().max(255).nullable().optional(),
  assignedToName: z.string().max(500).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

const updatePunchItemSchema = createPunchItemSchema.partial();

const bulkCreateSchema = z.object({
  items: z.array(createPunchItemSchema).min(1).max(50),
}).strict();

const addPhotoSchema = z.object({
  fileUrl: z.string().min(1).max(2000),
  fileName: z.string().max(500).nullable().optional(),
  fileSize: z.number().int().min(0).nullable().optional(),
  photoType: z.enum(VALID_PHOTO_TYPES).default("general"),
  caption: z.string().max(1000).nullable().optional(),
}).strict();

async function getNextPunchNumberSafe(tx: typeof db, projectId: number): Promise<string> {
  await tx.execute(
    sql`SELECT id FROM ${punchItems} WHERE ${punchItems.projectId} = ${projectId} ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  const result = await tx
    .select({ maxNum: sql<string>`max(substring("number" from 4)::int)` })
    .from(punchItems)
    .where(eq(punchItems.projectId, projectId));
  const maxNum = Number(result[0]?.maxNum ?? 0);
  return `PL-${String(maxNum + 1).padStart(4, "0")}`;
}

async function recordStatusChange(
  punchItemId: number,
  fromStatus: string | null,
  toStatus: string,
  userId: string,
  userName: string,
) {
  await db.insert(punchItemStatusHistory).values({
    punchItemId,
    fromStatus,
    toStatus,
    changedBy: userId,
    changedByName: userName,
  });
}

async function sendPunchNotification(
  recipientId: string,
  type: string,
  title: string,
  message: string,
  projectId: number,
) {
  try {
    await storage.createNotification({
      userId: recipientId,
      type,
      title,
      message,
      severity: "info",
      projectId,
    });
  } catch (err) {
    console.error("Error sending punch list notification:", err);
  }
}

export function registerPunchListRoutes(app: Express) {
  app.get("/api/projects/:projectId/punch-items", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const conditions: SQL[] = [
        eq(punchItems.projectId, projectId),
        isNull(punchItems.deletedAt),
      ];

      const statusFilter = req.query.status as string | undefined;
      if (statusFilter) {
        if (!(VALID_STATUSES as readonly string[]).includes(statusFilter)) {
          return res.status(400).json({ message: `Invalid status filter. Must be one of: ${VALID_STATUSES.join(", ")}` });
        }
        conditions.push(eq(punchItems.status, statusFilter));
      }
      const priorityFilter = req.query.priority as string | undefined;
      if (priorityFilter) {
        if (!(VALID_PRIORITIES as readonly string[]).includes(priorityFilter)) {
          return res.status(400).json({ message: `Invalid priority filter. Must be one of: ${VALID_PRIORITIES.join(", ")}` });
        }
        conditions.push(eq(punchItems.priority, priorityFilter));
      }
      const categoryFilter = req.query.category as string | undefined;
      if (categoryFilter) {
        conditions.push(eq(punchItems.category, categoryFilter));
      }
      const assigneeFilter = req.query.assignedTo as string | undefined;
      if (assigneeFilter) {
        conditions.push(eq(punchItems.assignedTo, assigneeFilter));
      }
      const locationFilter = req.query.location as string | undefined;
      if (locationFilter) {
        conditions.push(eq(punchItems.location, locationFilter));
      }

      const items = await db
        .select()
        .from(punchItems)
        .where(and(...conditions))
        .orderBy(desc(punchItems.createdAt));

      res.json(items);
    } catch (err) {
      console.error("Error fetching punch items:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/punch-items/summary", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const result = await db
        .select({
          status: punchItems.status,
          count: sql<number>`count(*)`,
        })
        .from(punchItems)
        .where(and(
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .groupBy(punchItems.status);

      const statusCounts: Record<string, number> = {};
      let total = 0;
      for (const row of result) {
        statusCounts[row.status] = Number(row.count);
        total += Number(row.count);
      }

      const closed = statusCounts["Closed"] ?? 0;
      const percentComplete = total > 0 ? Math.round((closed / total) * 100) : 0;

      const priorityResult = await db
        .select({
          priority: punchItems.priority,
          count: sql<number>`count(*)`,
        })
        .from(punchItems)
        .where(and(
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .groupBy(punchItems.priority);

      const priorityCounts: Record<string, number> = {};
      for (const row of priorityResult) {
        priorityCounts[row.priority] = Number(row.count);
      }

      res.json({
        total,
        statusCounts,
        priorityCounts,
        percentComplete,
      });
    } catch (err) {
      console.error("Error fetching punch list summary:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/punch-items/export/pdf-data", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const conditions: SQL[] = [
        eq(punchItems.projectId, projectId),
        isNull(punchItems.deletedAt),
      ];

      const statusFilter = req.query.status as string | undefined;
      if (statusFilter && (VALID_STATUSES as readonly string[]).includes(statusFilter)) {
        conditions.push(eq(punchItems.status, statusFilter));
      }

      const items = await db
        .select()
        .from(punchItems)
        .where(and(...conditions))
        .orderBy(asc(punchItems.number));

      const summaryResult = await db
        .select({
          status: punchItems.status,
          count: sql<number>`count(*)`,
        })
        .from(punchItems)
        .where(and(
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .groupBy(punchItems.status);

      const statusCounts: Record<string, number> = {};
      let total = 0;
      for (const row of summaryResult) {
        statusCounts[row.status] = Number(row.count);
        total += Number(row.count);
      }
      const closed = statusCounts["Closed"] ?? 0;
      const percentComplete = total > 0 ? Math.round((closed / total) * 100) : 0;

      res.json({
        project: { id: project.id, name: project.name },
        items,
        summary: { total, statusCounts, percentComplete },
        exportDate: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Error exporting punch list data:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/punch-items/:punchItemId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const punchItemId = Number(req.params.punchItemId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const item = await db
        .select()
        .from(punchItems)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .then(r => r[0]);

      if (!item) return res.status(404).json({ message: "Punch item not found" });

      const [photos, statusHistory] = await Promise.all([
        db.select().from(punchItemPhotos)
          .where(eq(punchItemPhotos.punchItemId, punchItemId))
          .orderBy(desc(punchItemPhotos.createdAt)),
        db.select().from(punchItemStatusHistory)
          .where(eq(punchItemStatusHistory.punchItemId, punchItemId))
          .orderBy(asc(punchItemStatusHistory.changedAt)),
      ]);

      res.json({ ...item, photos, statusHistory });
    } catch (err) {
      console.error("Error fetching punch item:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/punch-items", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsed = createPunchItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: formatZodErrors(parsed.error) });
      }

      const createdByName = await getUserDisplayName(userId);

      const item = await db.transaction(async (tx) => {
        const number = await getNextPunchNumberSafe(tx, projectId);
        const [created] = await tx.insert(punchItems).values({
          projectId,
          organizationId: project.organizationId!,
          number,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          location: parsed.data.location ?? null,
          category: parsed.data.category ?? null,
          priority: parsed.data.priority,
          status: parsed.data.status,
          assignedTo: parsed.data.assignedTo ?? null,
          assignedToName: parsed.data.assignedToName ?? null,
          dueDate: parsed.data.dueDate ?? null,
          createdBy: userId,
          createdByName,
        }).returning();

        await tx.insert(punchItemStatusHistory).values({
          punchItemId: created.id,
          fromStatus: null,
          toStatus: parsed.data.status || "Open",
          changedBy: userId,
          changedByName: createdByName,
        });

        return created;
      });

      if (parsed.data.assignedTo && parsed.data.assignedTo !== userId) {
        sendPunchNotification(
          parsed.data.assignedTo,
          "punch_item_assigned",
          `Punch Item Assigned: ${item.number}`,
          `You have been assigned to punch item "${item.title}" (${item.number}).`,
          projectId,
        );
      }

      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating punch item:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/punch-items/bulk", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsed = bulkCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: formatZodErrors(parsed.error) });
      }

      const createdByName = await getUserDisplayName(userId);
      const created = await db.transaction(async (tx) => {
        const results = [];
        for (let i = 0; i < parsed.data.items.length; i++) {
          const itemData = parsed.data.items[i];
          const number = await getNextPunchNumberSafe(tx, projectId);

          const [item] = await tx.insert(punchItems).values({
            projectId,
            organizationId: project.organizationId!,
            number,
            title: itemData.title,
            description: itemData.description ?? null,
            location: itemData.location ?? null,
            category: itemData.category ?? null,
            priority: itemData.priority,
            status: itemData.status,
            assignedTo: itemData.assignedTo ?? null,
            assignedToName: itemData.assignedToName ?? null,
            dueDate: itemData.dueDate ?? null,
            createdBy: userId,
            createdByName,
          }).returning();

          await tx.insert(punchItemStatusHistory).values({
            punchItemId: item.id,
            fromStatus: null,
            toStatus: itemData.status || "Open",
            changedBy: userId,
            changedByName: createdByName,
          });

          results.push(item);
        }
        return results;
      });

      for (const item of created) {
        if (item.assignedTo && item.assignedTo !== userId) {
          sendPunchNotification(
            item.assignedTo,
            "punch_item_assigned",
            `Punch Item Assigned: ${item.number}`,
            `You have been assigned to punch item "${item.title}" (${item.number}).`,
            projectId,
          );
        }
      }

      res.status(201).json(created);
    } catch (err) {
      console.error("Error bulk creating punch items:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.patch("/api/projects/:projectId/punch-items/:punchItemId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const punchItemId = Number(req.params.punchItemId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db
        .select()
        .from(punchItems)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .then(r => r[0]);

      if (!existing) return res.status(404).json({ message: "Punch item not found" });

      const parsed = updatePunchItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: formatZodErrors(parsed.error) });
      }

      const updateFields: Record<string, unknown> = { updatedAt: new Date() };

      if (parsed.data.title !== undefined) updateFields.title = parsed.data.title;
      if (parsed.data.description !== undefined) updateFields.description = parsed.data.description;
      if (parsed.data.location !== undefined) updateFields.location = parsed.data.location;
      if (parsed.data.category !== undefined) updateFields.category = parsed.data.category;
      if (parsed.data.priority !== undefined) updateFields.priority = parsed.data.priority;
      if (parsed.data.assignedTo !== undefined) updateFields.assignedTo = parsed.data.assignedTo;
      if (parsed.data.assignedToName !== undefined) updateFields.assignedToName = parsed.data.assignedToName;
      if (parsed.data.dueDate !== undefined) updateFields.dueDate = parsed.data.dueDate;

      if (parsed.data.status !== undefined) {
        updateFields.status = parsed.data.status;
        if (parsed.data.status === "Closed" && existing.status !== "Closed") {
          updateFields.closedAt = new Date();
          updateFields.closedBy = userId;
        }
        if (parsed.data.status !== "Closed" && existing.status === "Closed") {
          updateFields.closedAt = null;
          updateFields.closedBy = null;
        }
      }

      const [updated] = await db
        .update(punchItems)
        .set(updateFields)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .returning();

      const changerName = await getUserDisplayName(userId);

      if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
        await recordStatusChange(punchItemId, existing.status, parsed.data.status, userId, changerName);

        if (existing.assignedTo && existing.assignedTo !== userId) {
          sendPunchNotification(
            existing.assignedTo,
            "punch_item_status_change",
            `Punch Item Status Changed: ${existing.number}`,
            `Punch item "${existing.title}" (${existing.number}) status changed from "${existing.status}" to "${parsed.data.status}".`,
            projectId,
          );
        }
        if (existing.createdBy && existing.createdBy !== userId && existing.createdBy !== existing.assignedTo) {
          sendPunchNotification(
            existing.createdBy,
            "punch_item_status_change",
            `Punch Item Status Changed: ${existing.number}`,
            `Punch item "${existing.title}" (${existing.number}) status changed from "${existing.status}" to "${parsed.data.status}".`,
            projectId,
          );
        }
      }

      if (parsed.data.assignedTo !== undefined && parsed.data.assignedTo !== existing.assignedTo && parsed.data.assignedTo && parsed.data.assignedTo !== userId) {
        sendPunchNotification(
          parsed.data.assignedTo,
          "punch_item_assigned",
          `Punch Item Assigned: ${existing.number}`,
          `You have been assigned to punch item "${existing.title}" (${existing.number}).`,
          projectId,
        );
      }

      res.json(updated);
    } catch (err) {
      console.error("Error updating punch item:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete("/api/projects/:projectId/punch-items/:punchItemId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const punchItemId = Number(req.params.punchItemId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db
        .select()
        .from(punchItems)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .then(r => r[0]);

      if (!existing) return res.status(404).json({ message: "Punch item not found" });

      await db
        .update(punchItems)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ));

      res.json({ message: "Punch item deleted" });
    } catch (err) {
      console.error("Error deleting punch item:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/punch-items/:punchItemId/history", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const punchItemId = Number(req.params.punchItemId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const item = await db
        .select({ id: punchItems.id })
        .from(punchItems)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .then(r => r[0]);

      if (!item) return res.status(404).json({ message: "Punch item not found" });

      const history = await db
        .select()
        .from(punchItemStatusHistory)
        .where(eq(punchItemStatusHistory.punchItemId, punchItemId))
        .orderBy(asc(punchItemStatusHistory.changedAt));

      res.json(history);
    } catch (err) {
      console.error("Error fetching punch item history:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/punch-items/:punchItemId/photos", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const punchItemId = Number(req.params.punchItemId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const item = await db
        .select({ id: punchItems.id })
        .from(punchItems)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .then(r => r[0]);

      if (!item) return res.status(404).json({ message: "Punch item not found" });

      const photos = await db
        .select()
        .from(punchItemPhotos)
        .where(eq(punchItemPhotos.punchItemId, punchItemId))
        .orderBy(desc(punchItemPhotos.createdAt));

      res.json(photos);
    } catch (err) {
      console.error("Error fetching punch item photos:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/punch-items/:punchItemId/photos", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const punchItemId = Number(req.params.punchItemId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const item = await db
        .select({ id: punchItems.id })
        .from(punchItems)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .then(r => r[0]);

      if (!item) return res.status(404).json({ message: "Punch item not found" });

      const parsed = addPhotoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: formatZodErrors(parsed.error) });
      }

      const [photo] = await db.insert(punchItemPhotos).values({
        punchItemId,
        fileUrl: parsed.data.fileUrl,
        fileName: parsed.data.fileName ?? null,
        fileSize: parsed.data.fileSize ?? null,
        photoType: parsed.data.photoType,
        caption: parsed.data.caption ?? null,
        createdBy: userId,
      }).returning();

      res.status(201).json(photo);
    } catch (err) {
      console.error("Error adding punch item photo:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete("/api/projects/:projectId/punch-items/:punchItemId/photos/:photoId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const punchItemId = Number(req.params.punchItemId);
      const photoId = Number(req.params.photoId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const item = await db
        .select({ id: punchItems.id })
        .from(punchItems)
        .where(and(
          eq(punchItems.id, punchItemId),
          eq(punchItems.projectId, projectId),
          isNull(punchItems.deletedAt),
        ))
        .then(r => r[0]);

      if (!item) return res.status(404).json({ message: "Punch item not found" });

      const photo = await db
        .select()
        .from(punchItemPhotos)
        .where(and(
          eq(punchItemPhotos.id, photoId),
          eq(punchItemPhotos.punchItemId, punchItemId),
        ))
        .then(r => r[0]);

      if (!photo) return res.status(404).json({ message: "Photo not found" });

      await db.delete(punchItemPhotos).where(eq(punchItemPhotos.id, photoId));

      res.json({ message: "Photo deleted" });
    } catch (err) {
      console.error("Error deleting punch item photo:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

}
