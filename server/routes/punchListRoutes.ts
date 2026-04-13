import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, sql, SQL } from "drizzle-orm";
import { punchItems, punchItemPhotos, projects, users } from "@shared/schema";
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

async function getNextPunchNumber(projectId: number): Promise<string> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(punchItems)
    .where(eq(punchItems.projectId, projectId));
  const count = Number(result[0]?.count ?? 0);
  return `PL-${String(count + 1).padStart(4, "0")}`;
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

      const photos = await db
        .select()
        .from(punchItemPhotos)
        .where(eq(punchItemPhotos.punchItemId, punchItemId))
        .orderBy(desc(punchItemPhotos.createdAt));

      res.json({ ...item, photos });
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

      const number = await getNextPunchNumber(projectId);
      const createdByName = await getUserDisplayName(userId);

      const [item] = await db.insert(punchItems).values({
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
          const countResult = await tx
            .select({ count: sql<number>`count(*)` })
            .from(punchItems)
            .where(eq(punchItems.projectId, projectId));
          const count = Number(countResult[0]?.count ?? 0);
          const number = `PL-${String(count + 1).padStart(4, "0")}`;

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
          results.push(item);
        }
        return results;
      });

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
