import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, asc, desc, isNull, inArray } from "drizzle-orm";
import { meetings, meetingAgendaItems, meetingActionItems } from "@shared/schema";
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

const agendaItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  presenter: z.string().optional().nullable(),
  duration: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
});

const createMeetingSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  meetingType: z.string().optional().nullable(),
  status: z.string().optional(),
  date: z.string().min(1),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  attendees: z.string().optional().nullable(),
  agendaItems: z.array(agendaItemSchema).optional(),
});

const updateMeetingSchema = createMeetingSchema.partial().extend({
  minutesNotes: z.string().optional().nullable(),
  agendaItemNotes: z.array(z.object({
    id: z.number(),
    notes: z.string().nullable(),
  })).optional(),
});

const createActionItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assignee: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.string().optional(),
  notes: z.string().optional().nullable(),
});

const updateActionItemSchema = createActionItemSchema.partial().extend({
  status: z.string().optional(),
});

async function getNextMeetingNumber(projectId: number): Promise<string> {
  const existing = await db.select({ meetingNumber: meetings.meetingNumber })
    .from(meetings)
    .where(eq(meetings.projectId, projectId))
    .orderBy(desc(meetings.id));
  let maxNum = 0;
  for (const row of existing) {
    const match = row.meetingNumber?.match(/MTG-(\d+)/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `MTG-${String(maxNum + 1).padStart(3, "0")}`;
}

export function registerMeetingRoutes(app: Express) {

  app.get("/api/projects/:projectId/meetings", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const list = await db.select()
        .from(meetings)
        .where(and(eq(meetings.projectId, projectId), isNull(meetings.deletedAt)))
        .orderBy(desc(meetings.date));

      res.json(list);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/meetings/action-items", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const activeMeetingIds = await db.select({ id: meetings.id })
        .from(meetings)
        .where(and(eq(meetings.projectId, projectId), isNull(meetings.deletedAt)));
      const activeIds = activeMeetingIds.map(m => m.id);

      const items = activeIds.length > 0
        ? await db.select()
            .from(meetingActionItems)
            .where(and(
              eq(meetingActionItems.projectId, projectId),
              inArray(meetingActionItems.meetingId, activeIds),
            ))
            .orderBy(asc(meetingActionItems.dueDate))
        : [];

      res.json(items);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/meetings/:meetingId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const meetingId = Number(req.params.meetingId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [meeting] = await db.select()
        .from(meetings)
        .where(and(
          eq(meetings.id, meetingId),
          eq(meetings.projectId, projectId),
          isNull(meetings.deletedAt),
        ));

      if (!meeting) return res.status(404).json({ message: "Meeting not found" });

      const agendaList = await db.select()
        .from(meetingAgendaItems)
        .where(eq(meetingAgendaItems.meetingId, meetingId))
        .orderBy(asc(meetingAgendaItems.sortOrder));

      const actionItemsList = await db.select()
        .from(meetingActionItems)
        .where(eq(meetingActionItems.meetingId, meetingId))
        .orderBy(asc(meetingActionItems.createdAt));

      res.json({ ...meeting, agendaItems: agendaList, actionItems: actionItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/meetings", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = createMeetingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const { agendaItems, ...data } = parsed.data;
      const meetingNumber = await getNextMeetingNumber(projectId);

      const [created] = await db.insert(meetings).values({
        ...data,
        projectId,
        meetingNumber,
        createdBy: userId,
      }).returning();

      if (agendaItems && agendaItems.length > 0) {
        await db.insert(meetingAgendaItems).values(
          agendaItems.map((item, idx) => ({
            ...item,
            meetingId: created.id,
            sortOrder: item.sortOrder ?? idx,
          }))
        );
      }

      const agendaList = await db.select()
        .from(meetingAgendaItems)
        .where(eq(meetingAgendaItems.meetingId, created.id))
        .orderBy(asc(meetingAgendaItems.sortOrder));

      logUserActivity(userId, "meeting_created", projectId, { meetingId: created.id });

      res.status(201).json({ ...created, agendaItems: agendaList, actionItems: [] });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.patch("/api/projects/:projectId/meetings/:meetingId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const meetingId = Number(req.params.meetingId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = updateMeetingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const { agendaItems, agendaItemNotes, ...data } = parsed.data;

      const [updated] = await db.update(meetings)
        .set({
          ...data,
          updatedAt: new Date(),
          ...(data.minutesNotes !== undefined ? { minutesRecordedAt: new Date(), minutesRecordedBy: userId } : {}),
        })
        .where(and(
          eq(meetings.id, meetingId),
          eq(meetings.projectId, projectId),
          isNull(meetings.deletedAt),
        ))
        .returning();

      if (!updated) return res.status(404).json({ message: "Meeting not found" });

      if (agendaItems !== undefined) {
        await db.delete(meetingAgendaItems).where(eq(meetingAgendaItems.meetingId, meetingId));
        if (agendaItems.length > 0) {
          await db.insert(meetingAgendaItems).values(
            agendaItems.map((item, idx) => ({
              ...item,
              meetingId,
              sortOrder: item.sortOrder ?? idx,
            }))
          );
        }
      }

      if (agendaItemNotes && agendaItemNotes.length > 0) {
        for (const itemNote of agendaItemNotes) {
          await db.update(meetingAgendaItems)
            .set({ notes: itemNote.notes })
            .where(and(
              eq(meetingAgendaItems.id, itemNote.id),
              eq(meetingAgendaItems.meetingId, meetingId),
            ));
        }
      }

      const agendaList = await db.select()
        .from(meetingAgendaItems)
        .where(eq(meetingAgendaItems.meetingId, meetingId))
        .orderBy(asc(meetingAgendaItems.sortOrder));

      const actionItemsList = await db.select()
        .from(meetingActionItems)
        .where(eq(meetingActionItems.meetingId, meetingId))
        .orderBy(asc(meetingActionItems.createdAt));

      logUserActivity(userId, "meeting_updated", projectId, { meetingId });

      res.json({ ...updated, agendaItems: agendaList, actionItems: actionItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete("/api/projects/:projectId/meetings/:meetingId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const meetingId = Number(req.params.meetingId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [deleted] = await db.update(meetings)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(and(
          eq(meetings.id, meetingId),
          eq(meetings.projectId, projectId),
          isNull(meetings.deletedAt),
        ))
        .returning();

      if (!deleted) return res.status(404).json({ message: "Meeting not found" });

      logUserActivity(userId, "meeting_deleted", projectId, { meetingId });

      res.json({ message: "Meeting deleted" });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/meetings/:meetingId/action-items", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const meetingId = Number(req.params.meetingId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [meeting] = await db.select().from(meetings)
        .where(and(eq(meetings.id, meetingId), eq(meetings.projectId, projectId), isNull(meetings.deletedAt)));
      if (!meeting) return res.status(404).json({ message: "Meeting not found" });

      const parsed = createActionItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const [created] = await db.insert(meetingActionItems).values({
        ...parsed.data,
        meetingId,
        projectId,
      }).returning();

      logUserActivity(userId, "meeting_action_item_created", projectId, { meetingId, actionItemId: created.id });

      res.status(201).json(created);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.patch("/api/projects/:projectId/meetings/:meetingId/action-items/:actionItemId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const meetingId = Number(req.params.meetingId);
      const actionItemId = Number(req.params.actionItemId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = updateActionItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const [updated] = await db.update(meetingActionItems)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
          ...(parsed.data.status === "Completed" ? { completedAt: new Date() } : {}),
        })
        .where(and(
          eq(meetingActionItems.id, actionItemId),
          eq(meetingActionItems.meetingId, meetingId),
          eq(meetingActionItems.projectId, projectId),
        ))
        .returning();

      if (!updated) return res.status(404).json({ message: "Action item not found" });

      logUserActivity(userId, "meeting_action_item_updated", projectId, { actionItemId });

      res.json(updated);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete("/api/projects/:projectId/meetings/:meetingId/action-items/:actionItemId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const meetingId = Number(req.params.meetingId);
      const actionItemId = Number(req.params.actionItemId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [deleted] = await db.delete(meetingActionItems)
        .where(and(
          eq(meetingActionItems.id, actionItemId),
          eq(meetingActionItems.meetingId, meetingId),
          eq(meetingActionItems.projectId, projectId),
        ))
        .returning();

      if (!deleted) return res.status(404).json({ message: "Action item not found" });

      res.json({ message: "Action item deleted" });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
