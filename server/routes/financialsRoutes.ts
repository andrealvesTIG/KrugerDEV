import type { Express, Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { multiYearWbs, type CostItem, type InsertCostItem } from "@shared/schema";
import {
  getUserIdFromRequest,
  userHasOrgAccess,
  isTeamMemberInOrg,
  getTeamMemberProjectIds,
} from "./helpers";

async function teamMemberCanAccessProject(userId: string, projectId: number, organizationId: number): Promise<boolean> {
  if (!await isTeamMemberInOrg(userId, organizationId)) return true;
  const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, organizationId));
  return allowedProjectIds.has(projectId);
}

const META_FIELDS = [
  "name", "wbs", "comments", "financialView", "costCategory", "costSpecification",
] as const;
const MONTH_FIELDS = [
  "aopM1","aopM2","aopM3","aopM4","aopM5","aopM6","aopM7","aopM8","aopM9","aopM10","aopM11","aopM12",
  "fcstM1","fcstM2","fcstM3","fcstM4","fcstM5","fcstM6","fcstM7","fcstM8","fcstM9","fcstM10","fcstM11","fcstM12",
  "actM1","actM2","actM3","actM4","actM5","actM6","actM7","actM8","actM9","actM10","actM11","actM12",
] as const;
type MetaField = (typeof META_FIELDS)[number];
type MonthField = (typeof MONTH_FIELDS)[number];
type TrackedField = MetaField | MonthField;

async function ensureProjectAccess(req: Request, projectId: number) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return { ok: false as const, status: 401, message: "Authentication required" };
  const project = await storage.getProject(projectId);
  if (!project) return { ok: false as const, status: 404, message: "Project not found" };
  if (!(await userHasOrgAccess(userId, project.organizationId))) {
    return { ok: false as const, status: 403, message: "Access denied to this organization" };
  }
  if (!(await teamMemberCanAccessProject(userId, projectId, project.organizationId))) {
    return { ok: false as const, status: 403, message: "Access denied" };
  }
  return { ok: true as const, project, userId };
}

function pickCostItemUpdate(body: any): Partial<InsertCostItem> {
  const out: any = {};
  const fields = [
    ...META_FIELDS,
    "category", "parentId", "sortOrder",
    "aopTotal", "fcstTotal", "actTotal",
    ...MONTH_FIELDS,
  ];
  for (const f of fields) {
    if (body && Object.prototype.hasOwnProperty.call(body, f)) out[f] = body[f];
  }
  return out;
}

const WBS_FIELDS = [
  "fiscalYear", "sapProjectNumber", "sapCapitalNumber", "sapExpenseNumber",
  "sapLaborNumber", "notes",
] as const;

function pickWbsUpdate(body: any): Record<string, any> {
  const out: any = {};
  for (const f of WBS_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, f)) out[f] = body[f];
  }
  return out;
}

async function changedByName(userId: string | null | undefined): Promise<string> {
  if (!userId) return "System";
  const user: any = await storage.getUser(userId);
  if (!user) return "System";
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown";
}

export function registerFinancialsRoutes(app: Express) {
  // ===================== COST ITEMS =====================

  app.get("/api/projects/:projectId/cost-items", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const items = await storage.getCostItems(projectId, fiscalYear);
      res.json(items);
    } catch (err) {
      console.error("Error fetching cost items:", err);
      res.status(500).json({ message: "Error fetching cost items" });
    }
  });

  app.get("/api/cost-items/:id", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const item = await storage.getCostItem(Number(req.params.id));
      if (!item) return res.status(404).json({ message: "Cost item not found" });
      const guard = await ensureProjectAccess(req, item.projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      res.json(item);
    } catch (err) {
      console.error("Error fetching cost item:", err);
      res.status(500).json({ message: "Error fetching cost item" });
    }
  });

  app.post("/api/projects/:projectId/cost-items", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const {
        name, parentId, wbs, comments, category, fiscalYear,
        financialView, costCategory, costSpecification,
        aopTotal, fcstTotal, actTotal,
        aopM1, aopM2, aopM3, aopM4, aopM5, aopM6, aopM7, aopM8, aopM9, aopM10, aopM11, aopM12,
        fcstM1, fcstM2, fcstM3, fcstM4, fcstM5, fcstM6, fcstM7, fcstM8, fcstM9, fcstM10, fcstM11, fcstM12,
        actM1, actM2, actM3, actM4, actM5, actM6, actM7, actM8, actM9, actM10, actM11, actM12,
        sortOrder,
      } = req.body || {};

      if (!name || !fiscalYear) {
        return res.status(400).json({ message: "name and fiscalYear are required" });
      }

      const item = await storage.createCostItem({
        projectId,
        parentId: parentId || null,
        name,
        wbs,
        comments,
        category,
        financialView,
        costCategory,
        costSpecification,
        fiscalYear,
        aopTotal, fcstTotal, actTotal,
        aopM1, aopM2, aopM3, aopM4, aopM5, aopM6, aopM7, aopM8, aopM9, aopM10, aopM11, aopM12,
        fcstM1, fcstM2, fcstM3, fcstM4, fcstM5, fcstM6, fcstM7, fcstM8, fcstM9, fcstM10, fcstM11, fcstM12,
        actM1, actM2, actM3, actM4, actM5, actM6, actM7, actM8, actM9, actM10, actM11, actM12,
        sortOrder: sortOrder || 0,
      } as InsertCostItem);

      try {
        await storage.createCostItemChangeLog({
          costItemId: item.id,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "created",
          changeSummary: `Cost item "${name}" created (${financialView || "N/A"} > ${costCategory || "N/A"} > ${costSpecification || "N/A"})`,
          previousValues: null,
          newValues: JSON.stringify({ name, financialView, costCategory, costSpecification, wbs, comments }),
        });
      } catch (logErr) {
        console.error("Error creating cost item change log:", logErr);
      }

      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating cost item:", err);
      res.status(500).json({ message: "Error creating cost item" });
    }
  });

  app.put("/api/cost-items/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getCostItem(id);
      if (!existing) return res.status(404).json({ message: "Cost item not found" });
      const guard = await ensureProjectAccess(req, existing.projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const updates = pickCostItemUpdate(req.body);
      const updated = await storage.updateCostItem(id, updates);

      try {
        const changedFields: TrackedField[] = [];
        const prevValues: Partial<Record<TrackedField, unknown>> = {};
        const newValues: Partial<Record<TrackedField, unknown>> = {};
        const body = req.body as Partial<Record<TrackedField, unknown>>;

        const allFields: ReadonlyArray<TrackedField> = [...META_FIELDS, ...MONTH_FIELDS];
        for (const field of allFields) {
          const existingVal = (existing as any)[field];
          const incomingVal = body[field];
          const oldStr = String(existingVal ?? "0");
          const newStr = String(incomingVal !== undefined ? incomingVal : existingVal ?? "0");
          if (oldStr !== newStr) {
            changedFields.push(field);
            prevValues[field] = existingVal;
            newValues[field] = incomingVal;
          }
        }

        if (changedFields.length > 0) {
          const monthChanges = changedFields.filter((f): f is MonthField => (MONTH_FIELDS as readonly string[]).includes(f));
          const metaChanges = changedFields.filter((f): f is MetaField => (META_FIELDS as readonly string[]).includes(f));
          let summary = `Updated "${existing.name}"`;
          if (metaChanges.length > 0) summary += `: ${metaChanges.join(", ")} changed`;
          if (monthChanges.length > 0)
            summary += `${metaChanges.length > 0 ? "; " : ": "}${monthChanges.length} financial value(s) updated`;

          await storage.createCostItemChangeLog({
            costItemId: id,
            projectId: existing.projectId,
            changedBy: userId,
            changedByName: await changedByName(userId),
            changeType: "updated",
            changeSummary: summary,
            previousValues: JSON.stringify(prevValues),
            newValues: JSON.stringify(newValues),
          });
        }
      } catch (logErr) {
        console.error("Error creating cost item change log:", logErr);
      }

      res.json(updated);
    } catch (err) {
      console.error("Error updating cost item:", err);
      res.status(500).json({ message: "Error updating cost item" });
    }
  });

  app.delete("/api/cost-items/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getCostItem(id);
      if (!existing) return res.status(404).json({ message: "Cost item not found" });
      const guard = await ensureProjectAccess(req, existing.projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      try {
        await storage.createCostItemChangeLog({
          costItemId: id,
          projectId: existing.projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "deleted",
          changeSummary: `Cost item "${existing.name}" deleted (${existing.financialView || "N/A"} > ${existing.costCategory || "N/A"} > ${existing.costSpecification || "N/A"})`,
          previousValues: JSON.stringify({
            name: existing.name,
            financialView: existing.financialView,
            costCategory: existing.costCategory,
            costSpecification: existing.costSpecification,
          }),
          newValues: null,
        });
      } catch (logErr) {
        console.error("Error creating cost item change log:", logErr);
      }

      await storage.deleteCostItem(id);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting cost item:", err);
      res.status(500).json({ message: "Error deleting cost item" });
    }
  });

  app.get("/api/projects/:projectId/cost-items/history", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const history = await storage.getCostItemChangeLogs(projectId);
      res.json(history);
    } catch (err) {
      console.error("Error fetching cost item history:", err);
      res.status(500).json({ message: "Error fetching cost item history" });
    }
  });

  app.post("/api/projects/:projectId/cost-items/undo", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const history = await storage.getCostItemChangeLogs(projectId);
      if (history.length === 0) return res.status(400).json({ message: "No changes to undo" });
      const lastChange = history[0];

      if (lastChange.changeType === "updated" && lastChange.previousValues) {
        const prevValues = JSON.parse(lastChange.previousValues);
        const costItem = await storage.getCostItem(lastChange.costItemId!);
        if (!costItem) return res.status(404).json({ message: "Cost item no longer exists" });

        await storage.updateCostItem(lastChange.costItemId!, prevValues);
        await storage.createCostItemChangeLog({
          costItemId: lastChange.costItemId,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "updated",
          changeSummary: `Undo: reverted changes to "${costItem.name}"`,
          previousValues: lastChange.newValues,
          newValues: lastChange.previousValues,
        });
        return res.json({ message: "Change undone successfully", undoneChange: lastChange });
      } else if (lastChange.changeType === "created") {
        const costItem = await storage.getCostItem(lastChange.costItemId!);
        if (costItem) {
          await storage.deleteCostItem(lastChange.costItemId!);
          await storage.createCostItemChangeLog({
            costItemId: lastChange.costItemId,
            projectId,
            changedBy: userId,
            changedByName: await changedByName(userId),
            changeType: "deleted",
            changeSummary: `Undo: removed "${costItem.name}" (reverted creation)`,
            previousValues: lastChange.newValues,
            newValues: null,
          });
        }
        return res.json({ message: "Creation undone successfully", undoneChange: lastChange });
      } else if (lastChange.changeType === "deleted") {
        return res.status(400).json({ message: "Cannot undo deletion — please recreate the item manually" });
      }

      return res.status(400).json({ message: "Cannot undo this type of change" });
    } catch (err) {
      console.error("Error undoing change:", err);
      res.status(500).json({ message: "Error undoing change" });
    }
  });

  // ===================== MULTI-YEAR WBS =====================

  app.get("/api/projects/:projectId/wbs", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

      const entries = await db
        .select()
        .from(multiYearWbs)
        .where(eq(multiYearWbs.projectId, projectId))
        .orderBy(multiYearWbs.fiscalYear);
      res.json(entries);
    } catch (err) {
      console.error("Error fetching project WBS:", err);
      res.status(500).json({ message: "Error fetching WBS entries" });
    }
  });

  app.post("/api/projects/:projectId/wbs", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const { project, userId } = guard;

      const [entry] = await db
        .insert(multiYearWbs)
        .values({
          ...pickWbsUpdate(req.body),
          projectId,
          organizationId: project.organizationId,
          createdBy: userId,
        } as any)
        .returning();
      res.status(201).json(entry);
    } catch (err) {
      console.error("Error creating WBS entry:", err);
      res.status(500).json({ message: "Error creating WBS entry" });
    }
  });

  app.patch("/api/wbs/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(multiYearWbs).where(eq(multiYearWbs.id, id));
      if (!existing) return res.status(404).json({ message: "WBS entry not found" });
      const guard = await ensureProjectAccess(req, existing.projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

      const [updated] = await db
        .update(multiYearWbs)
        .set({ ...pickWbsUpdate(req.body), updatedAt: new Date() } as any)
        .where(eq(multiYearWbs.id, id))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error("Error updating WBS entry:", err);
      res.status(500).json({ message: "Error updating WBS entry" });
    }
  });

  app.delete("/api/wbs/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(multiYearWbs).where(eq(multiYearWbs.id, id));
      if (!existing) return res.status(404).json({ message: "WBS entry not found" });
      const guard = await ensureProjectAccess(req, existing.projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

      await db.delete(multiYearWbs).where(eq(multiYearWbs.id, id));
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting WBS entry:", err);
      res.status(500).json({ message: "Error deleting WBS entry" });
    }
  });
}
