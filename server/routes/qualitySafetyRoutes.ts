import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, sql, SQL, asc } from "drizzle-orm";
import {
  inspectionTemplates, inspectionTemplateItems, inspections, inspectionResults,
  incidents, incidentActions, observations, observationActions,
  projects, users,
} from "@shared/schema";
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

async function getNextNumber(tx: typeof db, table: typeof inspections | typeof incidents | typeof observations, prefix: string, projectId: number): Promise<string> {
  await tx.execute(
    sql`SELECT id FROM ${table} WHERE ${table.projectId} = ${projectId} ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  const result = await tx
    .select({ maxNum: sql<string>`max(substring("number" from ${prefix.length + 2})::int)` })
    .from(table)
    .where(eq(table.projectId, projectId));
  const maxNum = Number(result[0]?.maxNum ?? 0);
  return `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
}

const VALID_INSPECTION_STATUSES = ["Scheduled", "In Progress", "Completed", "Failed", "Cancelled"] as const;
const VALID_INSPECTION_RESULTS = ["Pass", "Fail", "Partial", "N/A"] as const;
const VALID_INCIDENT_STATUSES = ["Reported", "Under Investigation", "Corrective Action", "Closed"] as const;
const VALID_INCIDENT_SEVERITIES = ["Minor", "Moderate", "Major", "Critical", "Fatal"] as const;
const VALID_OBSERVATION_STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;
const VALID_OBSERVATION_CATEGORIES = ["Safety", "Quality", "Environmental"] as const;
const VALID_OBSERVATION_TYPES = ["Positive", "Negative"] as const;
const VALID_ACTION_STATUSES = ["Open", "In Progress", "Completed", "Overdue"] as const;

const createTemplateSchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  items: z.array(z.object({
    section: z.string().max(200).nullable().optional(),
    itemText: z.string().min(1).max(1000),
    itemType: z.string().max(50).default("pass_fail"),
    sortOrder: z.number().int().min(0).default(0),
    isRequired: z.boolean().default(true),
  })).min(1).max(100),
}).strict();

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  items: z.array(z.object({
    id: z.number().int().optional(),
    section: z.string().max(200).nullable().optional(),
    itemText: z.string().min(1).max(1000),
    itemType: z.string().max(50).default("pass_fail"),
    sortOrder: z.number().int().min(0).default(0),
    isRequired: z.boolean().default(true),
  })).min(1).max(100).optional(),
}).strict();

const createInspectionSchema = z.object({
  templateId: z.number().int().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  inspectionType: z.string().max(200).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  status: z.enum(VALID_INSPECTION_STATUSES).default("Scheduled"),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  inspectorId: z.string().max(255).nullable().optional(),
  inspectorName: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

const updateInspectionSchema = createInspectionSchema.partial().extend({
  overallResult: z.enum(VALID_INSPECTION_RESULTS).nullable().optional(),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const saveResultsSchema = z.object({
  results: z.array(z.object({
    templateItemId: z.number().int().nullable().optional(),
    itemText: z.string().min(1).max(1000),
    section: z.string().max(200).nullable().optional(),
    result: z.enum(VALID_INSPECTION_RESULTS).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    photoUrl: z.string().max(2000).nullable().optional(),
    deficiencyDescription: z.string().max(5000).nullable().optional(),
    correctiveAction: z.string().max(5000).nullable().optional(),
    assignedTo: z.string().max(255).nullable().optional(),
    assignedToName: z.string().max(500).nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })).min(1).max(200),
}).strict();

const createIncidentSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  incidentDate: z.string().nullable().optional(),
  incidentTime: z.string().max(20).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  severity: z.enum(VALID_INCIDENT_SEVERITIES).default("Minor"),
  status: z.enum(VALID_INCIDENT_STATUSES).default("Reported"),
  injuredParties: z.string().max(5000).nullable().optional(),
  witnesses: z.string().max(5000).nullable().optional(),
  rootCause: z.string().max(5000).nullable().optional(),
  immediateActions: z.string().max(5000).nullable().optional(),
  assignedTo: z.string().max(255).nullable().optional(),
  assignedToName: z.string().max(500).nullable().optional(),
}).strict();

const updateIncidentSchema = createIncidentSchema.partial().extend({
  investigationNotes: z.string().max(10000).nullable().optional(),
  investigationStatus: z.string().max(100).nullable().optional(),
});

const createIncidentActionSchema = z.object({
  actionType: z.string().max(100).default("Corrective"),
  description: z.string().min(1).max(5000),
  assignedTo: z.string().max(255).nullable().optional(),
  assignedToName: z.string().max(500).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(VALID_ACTION_STATUSES).default("Open"),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

const createObservationSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).nullable().optional(),
  category: z.enum(VALID_OBSERVATION_CATEGORIES).default("Safety"),
  observationType: z.enum(VALID_OBSERVATION_TYPES).default("Negative"),
  location: z.string().max(500).nullable().optional(),
  severity: z.string().max(100).nullable().optional(),
  status: z.enum(VALID_OBSERVATION_STATUSES).default("Open"),
  photoUrl: z.string().max(2000).nullable().optional(),
  correctiveAction: z.string().max(5000).nullable().optional(),
  assignedTo: z.string().max(255).nullable().optional(),
  assignedToName: z.string().max(500).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  observedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

const updateObservationSchema = createObservationSchema.partial();

const createObservationActionSchema = z.object({
  actionType: z.string().max(100).default("Corrective"),
  description: z.string().min(1).max(5000),
  assignedTo: z.string().max(255).nullable().optional(),
  assignedToName: z.string().max(500).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(VALID_ACTION_STATUSES).default("Open"),
  notes: z.string().max(5000).nullable().optional(),
}).strict();

async function verifyProjectAccess(req: any, res: any): Promise<{ userId: string; projectId: number; project: any } | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) { res.status(401).json({ message: "Authentication required" }); return null; }
  const projectId = Number(req.params.projectId);
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
  if (!project) { res.status(404).json({ message: "Project not found" }); return null; }
  if (!await userHasOrgAccess(userId, project.organizationId)) {
    res.status(403).json({ message: "Access denied" }); return null;
  }
  return { userId, projectId, project };
}

export function registerQualitySafetyRoutes(app: Express) {

  // ── INSPECTION TEMPLATES ──

  app.get("/api/projects/:projectId/inspection-templates", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const items = await db.select().from(inspectionTemplates)
        .where(and(eq(inspectionTemplates.projectId, ctx.projectId), isNull(inspectionTemplates.deletedAt)))
        .orderBy(desc(inspectionTemplates.createdAt));
      res.json(items);
    } catch (err) {
      console.error("Error fetching inspection templates:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.get("/api/projects/:projectId/inspection-templates/:templateId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const templateId = Number(req.params.templateId);
      const template = await db.select().from(inspectionTemplates)
        .where(and(eq(inspectionTemplates.id, templateId), eq(inspectionTemplates.projectId, ctx.projectId), isNull(inspectionTemplates.deletedAt)))
        .then(r => r[0]);
      if (!template) return res.status(404).json({ message: "Template not found" });
      const items = await db.select().from(inspectionTemplateItems)
        .where(eq(inspectionTemplateItems.templateId, templateId))
        .orderBy(asc(inspectionTemplateItems.sortOrder));
      res.json({ ...template, items });
    } catch (err) {
      console.error("Error fetching inspection template:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/inspection-templates", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const createdByName = await getUserDisplayName(ctx.userId);
      const result = await db.transaction(async (tx) => {
        const [template] = await tx.insert(inspectionTemplates).values({
          projectId: ctx.projectId,
          organizationId: ctx.project.organizationId!,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          category: parsed.data.category ?? null,
          createdBy: ctx.userId,
          createdByName,
        }).returning();
        for (const item of parsed.data.items) {
          await tx.insert(inspectionTemplateItems).values({
            templateId: template.id,
            section: item.section ?? null,
            itemText: item.itemText,
            itemType: item.itemType,
            sortOrder: item.sortOrder,
            isRequired: item.isRequired,
          });
        }
        return template;
      });
      res.status(201).json(result);
    } catch (err) {
      console.error("Error creating inspection template:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/projects/:projectId/inspection-templates/:templateId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const templateId = Number(req.params.templateId);
      const existing = await db.select().from(inspectionTemplates)
        .where(and(eq(inspectionTemplates.id, templateId), eq(inspectionTemplates.projectId, ctx.projectId), isNull(inspectionTemplates.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      await db.update(inspectionTemplates).set({ deletedAt: new Date(), deletedBy: ctx.userId })
        .where(and(eq(inspectionTemplates.id, templateId), eq(inspectionTemplates.projectId, ctx.projectId)));
      res.json({ message: "Template deleted" });
    } catch (err) {
      console.error("Error deleting inspection template:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/inspection-templates/:templateId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const templateId = Number(req.params.templateId);
      const existing = await db.select().from(inspectionTemplates)
        .where(and(eq(inspectionTemplates.id, templateId), eq(inspectionTemplates.projectId, ctx.projectId), isNull(inspectionTemplates.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Template not found" });

      const parsed = updateTemplateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });

      const result = await db.transaction(async (tx) => {
        const updates: Record<string, unknown> = {};
        if (parsed.data.name !== undefined) updates.name = parsed.data.name;
        if (parsed.data.description !== undefined) updates.description = parsed.data.description;
        if (parsed.data.category !== undefined) updates.category = parsed.data.category;
        updates.updatedAt = new Date();

        const [updated] = await tx.update(inspectionTemplates).set(updates)
          .where(eq(inspectionTemplates.id, templateId)).returning();

        if (parsed.data.items) {
          await tx.delete(inspectionTemplateItems).where(eq(inspectionTemplateItems.templateId, templateId));
          for (const item of parsed.data.items) {
            await tx.insert(inspectionTemplateItems).values({
              templateId: templateId,
              section: item.section ?? null,
              itemText: item.itemText,
              itemType: item.itemType,
              sortOrder: item.sortOrder,
              isRequired: item.isRequired,
            });
          }
        }

        const items = await tx.select().from(inspectionTemplateItems)
          .where(eq(inspectionTemplateItems.templateId, templateId))
          .orderBy(asc(inspectionTemplateItems.sortOrder));
        return { ...updated, items };
      });

      res.json(result);
    } catch (err) {
      console.error("Error updating inspection template:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── INSPECTIONS ──

  app.get("/api/projects/:projectId/inspections", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const conditions: SQL[] = [eq(inspections.projectId, ctx.projectId), isNull(inspections.deletedAt)];
      const statusFilter = req.query.status as string | undefined;
      if (statusFilter) {
        if (!(VALID_INSPECTION_STATUSES as readonly string[]).includes(statusFilter))
          return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_INSPECTION_STATUSES.join(", ")}` });
        conditions.push(eq(inspections.status, statusFilter));
      }
      const items = await db.select().from(inspections).where(and(...conditions)).orderBy(desc(inspections.createdAt));
      res.json(items);
    } catch (err) {
      console.error("Error fetching inspections:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.get("/api/projects/:projectId/inspections/:inspectionId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const inspectionId = Number(req.params.inspectionId);
      const item = await db.select().from(inspections)
        .where(and(eq(inspections.id, inspectionId), eq(inspections.projectId, ctx.projectId), isNull(inspections.deletedAt)))
        .then(r => r[0]);
      if (!item) return res.status(404).json({ message: "Inspection not found" });
      const results = await db.select().from(inspectionResults)
        .where(eq(inspectionResults.inspectionId, inspectionId))
        .orderBy(asc(inspectionResults.id));
      res.json({ ...item, results });
    } catch (err) {
      console.error("Error fetching inspection:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/inspections", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const parsed = createInspectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      if (parsed.data.templateId) {
        const tmpl = await db.select({ id: inspectionTemplates.id }).from(inspectionTemplates)
          .where(and(eq(inspectionTemplates.id, parsed.data.templateId), eq(inspectionTemplates.projectId, ctx.projectId), isNull(inspectionTemplates.deletedAt)))
          .then(r => r[0]);
        if (!tmpl) return res.status(400).json({ message: "Template not found in this project" });
      }

      const createdByName = await getUserDisplayName(ctx.userId);
      const item = await db.transaction(async (tx) => {
        const number = await getNextNumber(tx, inspections, "INS", ctx.projectId);
        const [created] = await tx.insert(inspections).values({
          projectId: ctx.projectId,
          organizationId: ctx.project.organizationId!,
          number,
          templateId: parsed.data.templateId ?? null,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          inspectionType: parsed.data.inspectionType ?? null,
          location: parsed.data.location ?? null,
          status: parsed.data.status,
          scheduledDate: parsed.data.scheduledDate ?? null,
          inspectorId: parsed.data.inspectorId ?? null,
          inspectorName: parsed.data.inspectorName ?? null,
          notes: parsed.data.notes ?? null,
          createdBy: ctx.userId,
          createdByName,
        }).returning();
        return created;
      });
      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating inspection:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/inspections/:inspectionId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const inspectionId = Number(req.params.inspectionId);
      const existing = await db.select().from(inspections)
        .where(and(eq(inspections.id, inspectionId), eq(inspections.projectId, ctx.projectId), isNull(inspections.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Inspection not found" });

      const parsed = updateInspectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) updateFields[key] = value ?? null;
      }

      const [updated] = await db.update(inspections).set(updateFields)
        .where(and(eq(inspections.id, inspectionId), eq(inspections.projectId, ctx.projectId), isNull(inspections.deletedAt)))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("Error updating inspection:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/projects/:projectId/inspections/:inspectionId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const inspectionId = Number(req.params.inspectionId);
      const existing = await db.select().from(inspections)
        .where(and(eq(inspections.id, inspectionId), eq(inspections.projectId, ctx.projectId), isNull(inspections.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Inspection not found" });
      await db.update(inspections).set({ deletedAt: new Date(), deletedBy: ctx.userId })
        .where(and(eq(inspections.id, inspectionId), eq(inspections.projectId, ctx.projectId)));
      res.json({ message: "Inspection deleted" });
    } catch (err) {
      console.error("Error deleting inspection:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/inspections/:inspectionId/results", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const inspectionId = Number(req.params.inspectionId);
      const existing = await db.select().from(inspections)
        .where(and(eq(inspections.id, inspectionId), eq(inspections.projectId, ctx.projectId), isNull(inspections.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Inspection not found" });

      const parsed = saveResultsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      await db.transaction(async (tx) => {
        await tx.delete(inspectionResults).where(eq(inspectionResults.inspectionId, inspectionId));
        for (const r of parsed.data.results) {
          await tx.insert(inspectionResults).values({
            inspectionId,
            templateItemId: r.templateItemId ?? null,
            itemText: r.itemText,
            section: r.section ?? null,
            result: r.result ?? null,
            notes: r.notes ?? null,
            photoUrl: r.photoUrl ?? null,
            deficiencyDescription: r.deficiencyDescription ?? null,
            correctiveAction: r.correctiveAction ?? null,
            assignedTo: r.assignedTo ?? null,
            assignedToName: r.assignedToName ?? null,
            dueDate: r.dueDate ?? null,
          });
        }
      });

      const passCount = parsed.data.results.filter(r => r.result === "Pass").length;
      const failCount = parsed.data.results.filter(r => r.result === "Fail").length;
      const totalGraded = parsed.data.results.filter(r => r.result && r.result !== "N/A").length;
      let overallResult: string | null = null;
      if (totalGraded > 0) {
        if (failCount === 0) overallResult = "Pass";
        else if (passCount === 0) overallResult = "Fail";
        else overallResult = "Partial";
      }

      await db.update(inspections).set({ overallResult, updatedAt: new Date() })
        .where(eq(inspections.id, inspectionId));

      res.json({ message: "Results saved", overallResult });
    } catch (err) {
      console.error("Error saving inspection results:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── INCIDENTS ──

  app.get("/api/projects/:projectId/incidents", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const conditions: SQL[] = [eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)];
      const statusFilter = req.query.status as string | undefined;
      if (statusFilter) {
        if (!(VALID_INCIDENT_STATUSES as readonly string[]).includes(statusFilter))
          return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_INCIDENT_STATUSES.join(", ")}` });
        conditions.push(eq(incidents.status, statusFilter));
      }
      const severityFilter = req.query.severity as string | undefined;
      if (severityFilter) {
        if (!(VALID_INCIDENT_SEVERITIES as readonly string[]).includes(severityFilter))
          return res.status(400).json({ message: `Invalid severity. Must be one of: ${VALID_INCIDENT_SEVERITIES.join(", ")}` });
        conditions.push(eq(incidents.severity, severityFilter));
      }
      const items = await db.select().from(incidents).where(and(...conditions)).orderBy(desc(incidents.createdAt));
      res.json(items);
    } catch (err) {
      console.error("Error fetching incidents:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.get("/api/projects/:projectId/incidents/:incidentId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const incidentId = Number(req.params.incidentId);
      const item = await db.select().from(incidents)
        .where(and(eq(incidents.id, incidentId), eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
        .then(r => r[0]);
      if (!item) return res.status(404).json({ message: "Incident not found" });
      const actions = await db.select().from(incidentActions)
        .where(eq(incidentActions.incidentId, incidentId))
        .orderBy(desc(incidentActions.createdAt));
      res.json({ ...item, actions });
    } catch (err) {
      console.error("Error fetching incident:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/incidents", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const parsed = createIncidentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const createdByName = await getUserDisplayName(ctx.userId);
      const item = await db.transaction(async (tx) => {
        const number = await getNextNumber(tx, incidents, "INC", ctx.projectId);
        const [created] = await tx.insert(incidents).values({
          projectId: ctx.projectId,
          organizationId: ctx.project.organizationId!,
          number,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          incidentDate: parsed.data.incidentDate ? new Date(parsed.data.incidentDate) : null,
          incidentTime: parsed.data.incidentTime ?? null,
          location: parsed.data.location ?? null,
          category: parsed.data.category ?? null,
          severity: parsed.data.severity,
          status: parsed.data.status,
          injuredParties: parsed.data.injuredParties ?? null,
          witnesses: parsed.data.witnesses ?? null,
          rootCause: parsed.data.rootCause ?? null,
          immediateActions: parsed.data.immediateActions ?? null,
          assignedTo: parsed.data.assignedTo ?? null,
          assignedToName: parsed.data.assignedToName ?? null,
          reportedBy: ctx.userId,
          reportedByName: createdByName,
          createdBy: ctx.userId,
          createdByName,
        }).returning();
        return created;
      });
      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating incident:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/incidents/:incidentId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const incidentId = Number(req.params.incidentId);
      const existing = await db.select().from(incidents)
        .where(and(eq(incidents.id, incidentId), eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Incident not found" });

      const parsed = updateIncidentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) {
          if (key === "incidentDate" && value) {
            updateFields[key] = new Date(value as string);
          } else {
            updateFields[key] = value ?? null;
          }
        }
      }
      if (parsed.data.status === "Closed" && existing.status !== "Closed") {
        updateFields.closedAt = new Date();
        updateFields.closedBy = ctx.userId;
      }
      if (parsed.data.status && parsed.data.status !== "Closed" && existing.status === "Closed") {
        updateFields.closedAt = null;
        updateFields.closedBy = null;
      }

      const [updated] = await db.update(incidents).set(updateFields)
        .where(and(eq(incidents.id, incidentId), eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("Error updating incident:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/projects/:projectId/incidents/:incidentId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const incidentId = Number(req.params.incidentId);
      const existing = await db.select().from(incidents)
        .where(and(eq(incidents.id, incidentId), eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Incident not found" });
      await db.update(incidents).set({ deletedAt: new Date(), deletedBy: ctx.userId })
        .where(and(eq(incidents.id, incidentId), eq(incidents.projectId, ctx.projectId)));
      res.json({ message: "Incident deleted" });
    } catch (err) {
      console.error("Error deleting incident:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── INCIDENT ACTIONS ──

  app.post("/api/projects/:projectId/incidents/:incidentId/actions", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const incidentId = Number(req.params.incidentId);
      const existing = await db.select({ id: incidents.id }).from(incidents)
        .where(and(eq(incidents.id, incidentId), eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Incident not found" });

      const parsed = createIncidentActionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const [action] = await db.insert(incidentActions).values({
        incidentId,
        actionType: parsed.data.actionType,
        description: parsed.data.description,
        assignedTo: parsed.data.assignedTo ?? null,
        assignedToName: parsed.data.assignedToName ?? null,
        dueDate: parsed.data.dueDate ?? null,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
        createdBy: ctx.userId,
      }).returning();
      res.status(201).json(action);
    } catch (err) {
      console.error("Error creating incident action:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/incidents/:incidentId/actions/:actionId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const incidentId = Number(req.params.incidentId);
      const actionId = Number(req.params.actionId);
      const parentIncident = await db.select({ id: incidents.id }).from(incidents)
        .where(and(eq(incidents.id, incidentId), eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
        .then(r => r[0]);
      if (!parentIncident) return res.status(404).json({ message: "Incident not found" });
      const existing = await db.select({ id: incidentActions.id }).from(incidentActions)
        .where(and(eq(incidentActions.id, actionId), eq(incidentActions.incidentId, incidentId)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Action not found" });

      const parsed = createIncidentActionSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) updateFields[key] = value ?? null;
      }
      if (parsed.data.status === "Completed") {
        updateFields.completedAt = new Date();
        updateFields.completedBy = ctx.userId;
      }

      const [updated] = await db.update(incidentActions).set(updateFields)
        .where(and(eq(incidentActions.id, actionId), eq(incidentActions.incidentId, incidentId)))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("Error updating incident action:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── OBSERVATIONS ──

  app.get("/api/projects/:projectId/observations", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const conditions: SQL[] = [eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)];
      const statusFilter = req.query.status as string | undefined;
      if (statusFilter) {
        if (!(VALID_OBSERVATION_STATUSES as readonly string[]).includes(statusFilter))
          return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_OBSERVATION_STATUSES.join(", ")}` });
        conditions.push(eq(observations.status, statusFilter));
      }
      const categoryFilter = req.query.category as string | undefined;
      if (categoryFilter) {
        if (!(VALID_OBSERVATION_CATEGORIES as readonly string[]).includes(categoryFilter))
          return res.status(400).json({ message: `Invalid category. Must be one of: ${VALID_OBSERVATION_CATEGORIES.join(", ")}` });
        conditions.push(eq(observations.category, categoryFilter));
      }
      const typeFilter = req.query.observationType as string | undefined;
      if (typeFilter) {
        if (!(VALID_OBSERVATION_TYPES as readonly string[]).includes(typeFilter))
          return res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_OBSERVATION_TYPES.join(", ")}` });
        conditions.push(eq(observations.observationType, typeFilter));
      }
      const items = await db.select().from(observations).where(and(...conditions)).orderBy(desc(observations.createdAt));
      res.json(items);
    } catch (err) {
      console.error("Error fetching observations:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.get("/api/projects/:projectId/observations/:observationId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const observationId = Number(req.params.observationId);
      const item = await db.select().from(observations)
        .where(and(eq(observations.id, observationId), eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
        .then(r => r[0]);
      if (!item) return res.status(404).json({ message: "Observation not found" });
      const actions = await db.select().from(observationActions)
        .where(eq(observationActions.observationId, observationId))
        .orderBy(desc(observationActions.createdAt));
      res.json({ ...item, actions });
    } catch (err) {
      console.error("Error fetching observation:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.post("/api/projects/:projectId/observations", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const parsed = createObservationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const createdByName = await getUserDisplayName(ctx.userId);
      const item = await db.transaction(async (tx) => {
        const number = await getNextNumber(tx, observations, "OBS", ctx.projectId);
        const [created] = await tx.insert(observations).values({
          projectId: ctx.projectId,
          organizationId: ctx.project.organizationId!,
          number,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          category: parsed.data.category,
          observationType: parsed.data.observationType,
          location: parsed.data.location ?? null,
          severity: parsed.data.severity ?? null,
          status: parsed.data.status,
          photoUrl: parsed.data.photoUrl ?? null,
          correctiveAction: parsed.data.correctiveAction ?? null,
          assignedTo: parsed.data.assignedTo ?? null,
          assignedToName: parsed.data.assignedToName ?? null,
          dueDate: parsed.data.dueDate ?? null,
          observedDate: parsed.data.observedDate ?? null,
          observedBy: ctx.userId,
          observedByName: createdByName,
          createdBy: ctx.userId,
          createdByName,
        }).returning();
        return created;
      });
      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating observation:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/observations/:observationId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const observationId = Number(req.params.observationId);
      const existing = await db.select().from(observations)
        .where(and(eq(observations.id, observationId), eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Observation not found" });

      const parsed = updateObservationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) updateFields[key] = value ?? null;
      }
      if (parsed.data.status === "Resolved" && existing.status !== "Resolved") {
        updateFields.resolvedAt = new Date();
        updateFields.resolvedBy = ctx.userId;
      }
      if (parsed.data.status && parsed.data.status !== "Resolved" && existing.status === "Resolved") {
        updateFields.resolvedAt = null;
        updateFields.resolvedBy = null;
      }

      const [updated] = await db.update(observations).set(updateFields)
        .where(and(eq(observations.id, observationId), eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("Error updating observation:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.delete("/api/projects/:projectId/observations/:observationId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const observationId = Number(req.params.observationId);
      const existing = await db.select().from(observations)
        .where(and(eq(observations.id, observationId), eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Observation not found" });
      await db.update(observations).set({ deletedAt: new Date(), deletedBy: ctx.userId })
        .where(and(eq(observations.id, observationId), eq(observations.projectId, ctx.projectId)));
      res.json({ message: "Observation deleted" });
    } catch (err) {
      console.error("Error deleting observation:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── OBSERVATION ACTIONS ──

  app.post("/api/projects/:projectId/observations/:observationId/actions", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const observationId = Number(req.params.observationId);
      const existing = await db.select({ id: observations.id }).from(observations)
        .where(and(eq(observations.id, observationId), eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Observation not found" });

      const parsed = createObservationActionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const [action] = await db.insert(observationActions).values({
        observationId,
        actionType: parsed.data.actionType,
        description: parsed.data.description,
        assignedTo: parsed.data.assignedTo ?? null,
        assignedToName: parsed.data.assignedToName ?? null,
        dueDate: parsed.data.dueDate ?? null,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
        createdBy: ctx.userId,
      }).returning();
      res.status(201).json(action);
    } catch (err) {
      console.error("Error creating observation action:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  app.patch("/api/projects/:projectId/observations/:observationId/actions/:actionId", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;
      const observationId = Number(req.params.observationId);
      const actionId = Number(req.params.actionId);
      const parentObservation = await db.select({ id: observations.id }).from(observations)
        .where(and(eq(observations.id, observationId), eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
        .then(r => r[0]);
      if (!parentObservation) return res.status(404).json({ message: "Observation not found" });
      const existing = await db.select({ id: observationActions.id }).from(observationActions)
        .where(and(eq(observationActions.id, actionId), eq(observationActions.observationId, observationId)))
        .then(r => r[0]);
      if (!existing) return res.status(404).json({ message: "Action not found" });

      const parsed = createObservationActionSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: formatZodErrors(parsed.error) });

      const updateFields: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) updateFields[key] = value ?? null;
      }
      if (parsed.data.status === "Completed") {
        updateFields.completedAt = new Date();
        updateFields.completedBy = ctx.userId;
      }

      const [updated] = await db.update(observationActions).set(updateFields)
        .where(and(eq(observationActions.id, actionId), eq(observationActions.observationId, observationId)))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("Error updating observation action:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });

  // ── SAFETY DASHBOARD ──

  app.get("/api/projects/:projectId/safety-dashboard", async (req, res) => {
    try {
      const ctx = await verifyProjectAccess(req, res);
      if (!ctx) return;

      const [inspectionStats, incidentStats, observationStats, incidentSeverityStats, observationCategoryStats, openIncidentActions, openObservationActions, weeklyTrends] = await Promise.all([
        db.select({ status: inspections.status, count: sql<number>`count(*)` })
          .from(inspections)
          .where(and(eq(inspections.projectId, ctx.projectId), isNull(inspections.deletedAt)))
          .groupBy(inspections.status),
        db.select({ status: incidents.status, count: sql<number>`count(*)` })
          .from(incidents)
          .where(and(eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
          .groupBy(incidents.status),
        db.select({ status: observations.status, count: sql<number>`count(*)` })
          .from(observations)
          .where(and(eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
          .groupBy(observations.status),
        db.select({ severity: incidents.severity, count: sql<number>`count(*)` })
          .from(incidents)
          .where(and(eq(incidents.projectId, ctx.projectId), isNull(incidents.deletedAt)))
          .groupBy(incidents.severity),
        db.select({ category: observations.category, count: sql<number>`count(*)` })
          .from(observations)
          .where(and(eq(observations.projectId, ctx.projectId), isNull(observations.deletedAt)))
          .groupBy(observations.category),
        db.select({ count: sql<number>`count(*)` })
          .from(incidentActions)
          .innerJoin(incidents, eq(incidentActions.incidentId, incidents.id))
          .where(and(
            eq(incidents.projectId, ctx.projectId),
            isNull(incidents.deletedAt),
            sql`${incidentActions.status} IN ('Open', 'In Progress', 'Overdue')`,
          )),
        db.select({ count: sql<number>`count(*)` })
          .from(observationActions)
          .innerJoin(observations, eq(observationActions.observationId, observations.id))
          .where(and(
            eq(observations.projectId, ctx.projectId),
            isNull(observations.deletedAt),
            sql`${observationActions.status} IN ('Open', 'In Progress', 'Overdue')`,
          )),
        db.execute(sql`
          SELECT
            to_char(date_trunc('week', w.week_start), 'YYYY-MM-DD') as week,
            COALESCE(i.inspection_count, 0) as inspections,
            COALESCE(inc.incident_count, 0) as incidents,
            COALESCE(obs.observation_count, 0) as observations
          FROM generate_series(
            date_trunc('week', NOW() - interval '12 weeks'),
            date_trunc('week', NOW()),
            '1 week'
          ) AS w(week_start)
          LEFT JOIN (
            SELECT date_trunc('week', created_at) as wk, count(*) as inspection_count
            FROM inspections WHERE project_id = ${ctx.projectId} AND deleted_at IS NULL
            GROUP BY wk
          ) i ON i.wk = w.week_start
          LEFT JOIN (
            SELECT date_trunc('week', created_at) as wk, count(*) as incident_count
            FROM incidents WHERE project_id = ${ctx.projectId} AND deleted_at IS NULL
            GROUP BY wk
          ) inc ON inc.wk = w.week_start
          LEFT JOIN (
            SELECT date_trunc('week', created_at) as wk, count(*) as observation_count
            FROM observations WHERE project_id = ${ctx.projectId} AND deleted_at IS NULL
            GROUP BY wk
          ) obs ON obs.wk = w.week_start
          ORDER BY w.week_start
        `),
      ]);

      const toMap = (rows: { status?: string; severity?: string; category?: string; count: number }[], key: string) => {
        const m: Record<string, number> = {};
        let total = 0;
        for (const r of rows) {
          const k = (r as Record<string, unknown>)[key] as string;
          m[k] = Number(r.count);
          total += Number(r.count);
        }
        return { counts: m, total };
      };

      const inspData = toMap(inspectionStats, "status");
      const incData = toMap(incidentStats, "status");
      const obsData = toMap(observationStats, "status");
      const sevData = toMap(incidentSeverityStats, "severity");
      const catData = toMap(observationCategoryStats, "category");

      const totalInspections = inspData.total;
      const completedInspections = (inspData.counts["Completed"] ?? 0) + (inspData.counts["Failed"] ?? 0);
      const inspectionCompletionRate = totalInspections > 0 ? Math.round((completedInspections / totalInspections) * 100) : 0;

      const totalOpenActions = Number(openIncidentActions[0]?.count ?? 0) + Number(openObservationActions[0]?.count ?? 0);

      const trends = (weeklyTrends.rows as Array<{ week: string; inspections: string; incidents: string; observations: string }>).map(r => ({
        week: r.week,
        inspections: Number(r.inspections),
        incidents: Number(r.incidents),
        observations: Number(r.observations),
      }));

      res.json({
        inspections: { ...inspData, completionRate: inspectionCompletionRate },
        incidents: incData,
        observations: obsData,
        incidentsBySeverity: sevData,
        observationsByCategory: catData,
        openCorrectiveActions: totalOpenActions,
        trends,
      });
    } catch (err) {
      console.error("Error fetching safety dashboard:", err);
      const c = classifyError(err); res.status(c.status).json({ message: c.message });
    }
  });
}
