import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, asc, desc, isNull } from "drizzle-orm";
import { correspondence } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  logUserActivity,
} from "./helpers";
import { projects } from "@shared/schema";

async function verifyProjectAccess(userId: string | null, projectId: number) {
  if (!userId) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const hasAccess = await userHasOrgAccess(userId, project.organizationId);
  return hasAccess ? project : null;
}

const createCorrespondenceSchema = z.object({
  type: z.enum(["Letter", "Email", "Transmittal", "Notice"]),
  subject: z.string().min(1),
  body: z.string().optional().nullable(),
  fromName: z.string().optional().nullable(),
  fromEmail: z.string().optional().nullable(),
  toName: z.string().optional().nullable(),
  toEmail: z.string().optional().nullable(),
  date: z.string().min(1),
  status: z.string().optional(),
  priority: z.string().optional(),
  attachments: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateCorrespondenceSchema = createCorrespondenceSchema.partial();

async function getNextCorrespondenceNumber(projectId: number, type: string): Promise<string> {
  const prefix = type === "Transmittal" ? "TR" : type === "Notice" ? "NT" : type === "Email" ? "EM" : "LT";
  const existing = await db.select({ correspondenceNumber: correspondence.correspondenceNumber })
    .from(correspondence)
    .where(and(eq(correspondence.projectId, projectId), eq(correspondence.type, type)))
    .orderBy(desc(correspondence.id));
  let maxNum = 0;
  for (const row of existing) {
    const match = row.correspondenceNumber?.match(/\w+-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
}

export function registerCorrespondenceRoutes(app: Express) {

  app.get("/api/projects/:projectId/correspondence", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const list = await db.select()
        .from(correspondence)
        .where(and(eq(correspondence.projectId, projectId), isNull(correspondence.deletedAt)))
        .orderBy(desc(correspondence.date));

      res.json(list);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/correspondence/:correspondenceId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const correspondenceId = Number(req.params.correspondenceId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [item] = await db.select()
        .from(correspondence)
        .where(and(
          eq(correspondence.id, correspondenceId),
          eq(correspondence.projectId, projectId),
          isNull(correspondence.deletedAt),
        ));

      if (!item) return res.status(404).json({ message: "Correspondence not found" });

      res.json(item);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/correspondence", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = createCorrespondenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const correspondenceNumber = await getNextCorrespondenceNumber(projectId, parsed.data.type);

      const [created] = await db.insert(correspondence).values({
        ...parsed.data,
        projectId,
        correspondenceNumber,
        createdBy: userId,
      }).returning();

      logUserActivity(userId, "correspondence_created", projectId, { correspondenceId: created.id });

      res.status(201).json(created);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.patch("/api/projects/:projectId/correspondence/:correspondenceId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const correspondenceId = Number(req.params.correspondenceId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = updateCorrespondenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const [updated] = await db.update(correspondence)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(
          eq(correspondence.id, correspondenceId),
          eq(correspondence.projectId, projectId),
          isNull(correspondence.deletedAt),
        ))
        .returning();

      if (!updated) return res.status(404).json({ message: "Correspondence not found" });

      logUserActivity(userId, "correspondence_updated", projectId, { correspondenceId });

      res.json(updated);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete("/api/projects/:projectId/correspondence/:correspondenceId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const correspondenceId = Number(req.params.correspondenceId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [deleted] = await db.update(correspondence)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(and(
          eq(correspondence.id, correspondenceId),
          eq(correspondence.projectId, projectId),
          isNull(correspondence.deletedAt),
        ))
        .returning();

      if (!deleted) return res.status(404).json({ message: "Correspondence not found" });

      logUserActivity(userId, "correspondence_deleted", projectId, { correspondenceId });

      res.json({ message: "Correspondence deleted" });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
