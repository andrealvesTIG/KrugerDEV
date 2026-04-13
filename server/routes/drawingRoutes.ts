import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, asc, ilike } from "drizzle-orm";
import { drawings, drawingRevisions, drawingMarkups, projects } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  formatZodErrors,
  logUserActivity,
} from "./helpers";

const DISCIPLINES = [
  "Architectural",
  "Structural",
  "Mechanical",
  "Electrical",
  "Plumbing",
  "Fire Protection",
  "Civil",
  "Landscape",
  "General",
  "Other",
] as const;

const STATUSES = ["Current", "Superseded", "Void"] as const;

const createDrawingSchema = z.object({
  drawingNumber: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  discipline: z.string().max(100).default("General"),
  description: z.string().max(5000).nullable().optional(),
}).strict();

const updateDrawingSchema = createDrawingSchema.partial().extend({
  status: z.enum(STATUSES).optional(),
}).strict();

const createRevisionSchema = z.object({
  fileUrl: z.string().min(1).max(2000).refine(
    (u) => /^https?:\/\/|^\/objects\//i.test(u),
    { message: "File URL must use http/https or /objects/ path" }
  ),
  fileName: z.string().min(1).max(500),
  fileSize: z.number().int().min(0).optional(),
  fileType: z.string().max(200).optional(),
  thumbnailUrl: z.string().max(2000).nullable().optional(),
  version: z.string().max(50).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

const markupElementSchema = z.object({
  type: z.enum(["text", "arrow", "rectangle", "ellipse", "freehand", "line"]),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  text: z.string().max(1000).optional(),
  color: z.string().max(50).optional(),
  strokeWidth: z.number().min(1).max(20).optional(),
});

const createMarkupSchema = z.object({
  revisionId: z.number().int().positive(),
  label: z.string().max(200).nullable().optional(),
  markupData: z.array(markupElementSchema).min(1).max(500),
}).strict();

export function registerDrawingRoutes(app: Express) {
  app.get("/api/projects/:projectId/drawings", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const conditions: any[] = [eq(drawings.projectId, projectId), isNull(drawings.deletedAt)];

      const disciplineParam = req.query.discipline as string | undefined;
      if (disciplineParam) {
        conditions.push(eq(drawings.discipline, disciplineParam));
      }

      const statusParam = req.query.status as string | undefined;
      if (statusParam) {
        if (!STATUSES.includes(statusParam as typeof STATUSES[number])) {
          return res.status(400).json({ message: "Invalid status filter" });
        }
        conditions.push(eq(drawings.status, statusParam));
      }

      const searchParam = req.query.search as string | undefined;
      if (searchParam) {
        conditions.push(
          ilike(drawings.title, `%${searchParam}%`)
        );
      }

      const results = await db.select().from(drawings)
        .where(and(...conditions))
        .orderBy(asc(drawings.discipline), asc(drawings.drawingNumber));

      res.json(results);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching drawings" });
    }
  });

  app.get("/api/projects/:projectId/drawings/:drawingId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const drawing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);

      if (!drawing) return res.status(404).json({ message: "Drawing not found" });

      const revisions = await db.select().from(drawingRevisions)
        .where(eq(drawingRevisions.drawingId, drawingId))
        .orderBy(desc(drawingRevisions.revisionNumber));

      res.json({ ...drawing, revisions });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching drawing" });
    }
  });

  app.post("/api/projects/:projectId/drawings", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsed = createDrawingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const data = parsed.data;

      const [drawing] = await db.insert(drawings).values({
        projectId,
        organizationId: project.organizationId!,
        drawingNumber: data.drawingNumber,
        title: data.title,
        discipline: data.discipline || "General",
        description: data.description || null,
        currentRevisionNumber: 0,
        createdBy: userId,
      }).returning();

      logUserActivity(userId, "create_drawing", "drawing", drawing.id, { drawingNumber: drawing.drawingNumber, projectId }, req);

      res.status(201).json(drawing);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      const classified = classifyError(err);
      if (classified.message?.includes("duplicate")) {
        return res.status(409).json({ message: "A drawing with this number already exists in the project" });
      }
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create drawing" : classified.message });
    }
  });

  app.patch("/api/projects/:projectId/drawings/:drawingId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Drawing not found" });

      const parsed = updateDrawingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      const fields = parsed.data;
      if (fields.drawingNumber !== undefined) updateData.drawingNumber = fields.drawingNumber;
      if (fields.title !== undefined) updateData.title = fields.title;
      if (fields.discipline !== undefined) updateData.discipline = fields.discipline;
      if (fields.description !== undefined) updateData.description = fields.description;
      if (fields.status !== undefined) updateData.status = fields.status;

      const [updated] = await db.update(drawings).set(updateData).where(eq(drawings.id, drawingId)).returning();

      logUserActivity(userId, "update_drawing", "drawing", drawingId, { changes: Object.keys(updateData), projectId }, req);

      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      if (classified.message?.includes("duplicate")) {
        return res.status(409).json({ message: "A drawing with this number already exists in the project" });
      }
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update drawing" : classified.message });
    }
  });

  app.delete("/api/projects/:projectId/drawings/:drawingId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const existing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Drawing not found" });

      await db.update(drawings).set({
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      }).where(eq(drawings.id, drawingId));

      logUserActivity(userId, "delete_drawing", "drawing", drawingId, { drawingNumber: existing.drawingNumber, projectId }, req);

      res.json({ message: "Drawing deleted" });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Failed to delete drawing" });
    }
  });

  app.get("/api/projects/:projectId/drawings/:drawingId/revisions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const drawing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);
      if (!drawing) return res.status(404).json({ message: "Drawing not found" });

      const revisions = await db.select().from(drawingRevisions)
        .where(eq(drawingRevisions.drawingId, drawingId))
        .orderBy(desc(drawingRevisions.revisionNumber));

      res.json(revisions);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching revisions" });
    }
  });

  app.post("/api/projects/:projectId/drawings/:drawingId/revisions", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const drawing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);
      if (!drawing) return res.status(404).json({ message: "Drawing not found" });

      const parsed = createRevisionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const data = parsed.data;
      const newRevNumber = (drawing.currentRevisionNumber || 0) + 1;

      const user = await db.query.users?.findFirst?.({ where: (u: any, { eq: e }: any) => e(u.id, userId) });
      const uploaderName = user ? `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() || (user as any).email || "Unknown" : "Unknown";

      const result = await db.transaction(async (tx) => {
        const [revision] = await tx.insert(drawingRevisions).values({
          drawingId,
          revisionNumber: newRevNumber,
          version: data.version || null,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileSize: data.fileSize || null,
          fileType: data.fileType || null,
          thumbnailUrl: data.thumbnailUrl || null,
          notes: data.notes || null,
          uploadedBy: userId,
          uploadedByName: uploaderName,
        }).returning();

        await tx.update(drawings).set({
          currentRevisionNumber: newRevNumber,
          updatedAt: new Date(),
        }).where(eq(drawings.id, drawingId));

        return revision;
      });

      logUserActivity(userId, "upload_drawing_revision", "drawing_revision", result.id, { drawingId, revisionNumber: newRevNumber, projectId }, req);

      res.status(201).json(result);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create revision" : classified.message });
    }
  });

  app.get("/api/projects/:projectId/drawings/:drawingId/markups", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const drawing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);
      if (!drawing) return res.status(404).json({ message: "Drawing not found" });

      const revisionIdParam = req.query.revisionId ? Number(req.query.revisionId) : undefined;
      if (revisionIdParam !== undefined && (isNaN(revisionIdParam) || !Number.isInteger(revisionIdParam))) {
        return res.status(400).json({ message: "Invalid revisionId query parameter" });
      }

      const conditions: any[] = [eq(drawingMarkups.drawingId, drawingId)];
      if (revisionIdParam) {
        conditions.push(eq(drawingMarkups.revisionId, revisionIdParam));
      }

      const markups = await db.select().from(drawingMarkups)
        .where(and(...conditions))
        .orderBy(desc(drawingMarkups.createdAt));

      res.json(markups);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Error fetching markups" });
    }
  });

  app.post("/api/projects/:projectId/drawings/:drawingId/markups", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const drawing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);
      if (!drawing) return res.status(404).json({ message: "Drawing not found" });

      const parsed = createMarkupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const data = parsed.data;

      const revision = await db.select().from(drawingRevisions)
        .where(and(eq(drawingRevisions.id, data.revisionId), eq(drawingRevisions.drawingId, drawingId)))
        .then(r => r[0]);
      if (!revision) return res.status(404).json({ message: "Revision not found" });

      const user = await db.query.users?.findFirst?.({ where: (u: any, { eq: e }: any) => e(u.id, userId) });
      const creatorName = user ? `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() || (user as any).email || "Unknown" : "Unknown";

      const [markup] = await db.insert(drawingMarkups).values({
        revisionId: data.revisionId,
        drawingId,
        label: data.label || null,
        markupData: data.markupData,
        createdBy: userId,
        createdByName: creatorName,
      }).returning();

      res.status(201).json(markup);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to save markup" : classified.message });
    }
  });

  app.delete("/api/projects/:projectId/drawings/:drawingId/markups/:markupId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const drawingId = Number(req.params.drawingId);
      const markupId = Number(req.params.markupId);

      const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const drawing = await db.select().from(drawings)
        .where(and(eq(drawings.id, drawingId), eq(drawings.projectId, projectId), isNull(drawings.deletedAt)))
        .then(r => r[0]);
      if (!drawing) return res.status(404).json({ message: "Drawing not found" });

      const markup = await db.select().from(drawingMarkups)
        .where(and(eq(drawingMarkups.id, markupId), eq(drawingMarkups.drawingId, drawingId)))
        .then(r => r[0]);
      if (!markup) return res.status(404).json({ message: "Markup not found" });

      if (markup.createdBy !== userId) {
        return res.status(403).json({ message: "Only the creator can delete this markup" });
      }

      await db.delete(drawingMarkups).where(eq(drawingMarkups.id, markupId));

      res.json({ message: "Markup deleted" });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: "Failed to delete markup" });
    }
  });
}
