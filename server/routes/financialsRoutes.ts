import type { Express, Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { multiYearWbs } from "@shared/schema";
import type { FinancialType } from "@shared/schema";
import type { FinancialItemDimensions } from "../storage/financialStorage";
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

const DIMENSION_FIELDS = [
  "itemName", "financialView", "costCategory", "costSpecification",
  "category", "wbs", "comments", "sortOrder",
] as const;
type DimensionField = (typeof DIMENSION_FIELDS)[number];

function pickDimensions(body: any): Partial<FinancialItemDimensions> {
  const out: any = {};
  for (const f of DIMENSION_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, f)) out[f] = body[f];
  }
  return out;
}

async function getOrgTypeConfig(organizationId: number): Promise<FinancialType[]> {
  const { DEFAULT_FINANCIAL_TYPES, financialTypesConfigSchema } = await import("@shared/schema");
  const org = await storage.getOrganization(organizationId);
  const validated = financialTypesConfigSchema.safeParse(org?.financialTypesConfig);
  const list = validated.success ? validated.data.types : [];
  const seen = new Set(list.map(s => s.key));
  const merged = [...list];
  for (const sys of DEFAULT_FINANCIAL_TYPES.types) {
    if (!seen.has(sys.key)) merged.push(sys);
  }
  return merged.length > 0 ? merged : DEFAULT_FINANCIAL_TYPES.types;
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
  // ===================== FINANCIAL ENTRIES (normalized) =====================

  // List every cell for a project (optionally filtered by fiscal year). The
  // grid groups/pivots these client-side.
  app.get("/api/projects/:projectId/financial-entries", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const entries = await storage.getFinancialEntries(projectId, fiscalYear);
      res.json(entries);
    } catch (err) {
      console.error("Error fetching financial entries:", err);
      res.status(500).json({ message: "Error fetching financial entries" });
    }
  });

  // Create a new logical item (writes 36 zero-amount cells).
  app.post("/api/projects/:projectId/financial-items", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const { fiscalYear } = req.body || {};
      const dimensions = pickDimensions(req.body) as FinancialItemDimensions;
      if (!fiscalYear) return res.status(400).json({ message: "fiscalYear is required" });
      if (!dimensions.itemName || !String(dimensions.itemName).trim()) {
        return res.status(400).json({ message: "itemName is required" });
      }

      const orgTypes = await getOrgTypeConfig(guard.project.organizationId);
      const enabledKeys = orgTypes.filter(s => s.enabled).map(s => s.key);

      const itemKey = await storage.createFinancialItem({
        projectId,
        fiscalYear: Number(fiscalYear),
        dimensions,
        types: enabledKeys,
      });

      try {
        await storage.clearRedoStack(projectId);
        await storage.createCostItemChangeLog({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "item_created",
          changeSummary: `Created "${dimensions.itemName}" (${dimensions.financialView || "N/A"} > ${dimensions.costCategory || "N/A"} > ${dimensions.costSpecification || "N/A"})`,
          previousValues: null,
          // Persist the org-enabled type set used at creation so redo can
          // recreate the same fan-out (orgs with custom enabled types beyond
          // the defaults would otherwise get an incomplete item on redo).
          newValues: JSON.stringify({ itemKey, fiscalYear, types: enabledKeys, ...dimensions }),
        });
      } catch (logErr) {
        console.error("Error creating change log:", logErr);
      }

      res.status(201).json({ itemKey, fiscalYear: Number(fiscalYear), ...dimensions });
    } catch (err) {
      console.error("Error creating financial item:", err);
      res.status(500).json({ message: "Error creating financial item" });
    }
  });

  // Update a single cell (one financial type × one month for one logical item).
  app.put("/api/projects/:projectId/financial-cells", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      // Accept either `type` (new) or `scenario` (legacy) for backward compat.
      const body = req.body || {};
      const { fiscalYear, itemKey, month, amount } = body;
      const typeKey: unknown = body.type ?? body.scenario;
      if (!fiscalYear || !itemKey || !typeKey || !month) {
        return res.status(400).json({ message: "fiscalYear, itemKey, type, month are required" });
      }
      if (typeof typeKey !== "string" || !/^[a-z0-9_-]+$/.test(typeKey)) {
        return res.status(400).json({ message: "type must be a valid financial type key" });
      }
      const monthNum = Number(month);
      if (monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "month must be 1..12" });
      }

      // Validate the type exists, is enabled, and is editable for this org.
      const orgTypes = await getOrgTypeConfig(guard.project.organizationId);
      const typeConfig = orgTypes.find(s => s.key === typeKey);
      if (!typeConfig) {
        return res.status(400).json({ message: `Unknown financial type "${typeKey}" for this organization` });
      }
      if (!typeConfig.enabled) {
        return res.status(400).json({ message: `Financial type "${typeConfig.label}" is disabled` });
      }
      if (!typeConfig.editable) {
        return res.status(403).json({ message: `Financial type "${typeConfig.label}" is read-only` });
      }

      const result = await storage.upsertFinancialCell({
        projectId,
        fiscalYear: Number(fiscalYear),
        itemKey,
        type: typeKey,
        month: monthNum,
        amount: Number(amount) || 0,
      });

      if (result.previous !== result.next) {
        try {
          await storage.clearRedoStack(projectId);
          await storage.createCostItemChangeLog({
            costItemId: null,
            projectId,
            changedBy: userId,
            changedByName: await changedByName(userId),
            changeType: "cell",
            changeSummary: `"${result.entry.itemName}" ${typeKey.toUpperCase()} M${monthNum}: ${result.previous} → ${result.next}`,
            previousValues: JSON.stringify({
              itemKey, type: typeKey, month: monthNum, fiscalYear: Number(fiscalYear), amount: result.previous,
            }),
            newValues: JSON.stringify({
              itemKey, type: typeKey, month: monthNum, fiscalYear: Number(fiscalYear), amount: result.next,
            }),
          });
        } catch (logErr) {
          console.error("Error creating change log:", logErr);
        }
      }

      res.json(result.entry);
    } catch (err: any) {
      console.error("Error updating financial cell:", err);
      res.status(500).json({ message: err?.message || "Error updating financial cell" });
    }
  });

  // Update dimension fields (rename, change category, etc.) across every cell of an item.
  app.patch("/api/projects/:projectId/financial-items/:itemKey", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const itemKey = req.params.itemKey;
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const dimensions = pickDimensions(req.body);
      const fiscalYear = req.body?.fiscalYear ?? (req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined);
      const result = await storage.updateFinancialItemDimensions({
        projectId,
        itemKey,
        fiscalYear: fiscalYear !== undefined ? Number(fiscalYear) : undefined,
        dimensions,
      });
      if (result.updated === 0) return res.status(404).json({ message: "Item not found" });

      try {
        await storage.clearRedoStack(projectId);
        await storage.createCostItemChangeLog({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "item_updated",
          changeSummary: `Updated dimensions of "${result.previous?.itemName ?? itemKey}"`,
          previousValues: JSON.stringify({ itemKey, fiscalYear: fiscalYear ?? null, ...result.previous }),
          newValues: JSON.stringify({ itemKey, fiscalYear: fiscalYear ?? null, ...dimensions }),
        });
      } catch (logErr) {
        console.error("Error creating change log:", logErr);
      }

      res.json({ itemKey, updated: result.updated });
    } catch (err) {
      console.error("Error updating financial item:", err);
      res.status(500).json({ message: "Error updating financial item" });
    }
  });

  // Delete every cell of a logical item.
  app.delete("/api/projects/:projectId/financial-items/:itemKey", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const itemKey = req.params.itemKey;
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      const previous = await storage.deleteFinancialItem({ projectId, itemKey, fiscalYear });
      if (!previous) return res.status(404).json({ message: "Item not found" });

      try {
        await storage.clearRedoStack(projectId);
        await storage.createCostItemChangeLog({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "item_deleted",
          changeSummary: `Deleted "${previous.itemName}"`,
          previousValues: JSON.stringify({ itemKey, ...previous }),
          newValues: null,
        });
      } catch (logErr) {
        console.error("Error creating change log:", logErr);
      }

      res.status(204).send();
    } catch (err) {
      console.error("Error deleting financial item:", err);
      res.status(500).json({ message: "Error deleting financial item" });
    }
  });

  app.get("/api/projects/:projectId/financial-entries/history", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const history = await storage.getCostItemChangeLogs(projectId);
      res.json(history);
    } catch (err) {
      console.error("Error fetching financial history:", err);
      res.status(500).json({ message: "Error fetching financial history" });
    }
  });

  // Helper: returns true if this log row is a legacy `__undo` placeholder
  // written by an older version of the undo route. Those rows are ignored by
  // both undo and redo selection.
  const isLegacyUndoRow = (h: { previousValues: string | null; newValues: string | null }) => {
    try {
      const a = h.newValues ? JSON.parse(h.newValues) : null;
      if (a && a.__undo) return true;
      const b = h.previousValues ? JSON.parse(h.previousValues) : null;
      if (b && b.__undo) return true;
    } catch { /* fall through */ }
    return false;
  };

  // Apply a change-log row in the FORWARD direction (used for redo) or in
  // the REVERSE direction (used for undo). Returns a short message describing
  // what happened, or throws on a failure that should be surfaced to the user.
  async function applyChangeLog(
    projectId: number,
    log: any,
    direction: "undo" | "redo",
  ): Promise<string> {
    if (log.changeType === "cell") {
      const target = direction === "undo" ? log.previousValues : log.newValues;
      if (!target) throw new Error(`Cell change log missing ${direction === "undo" ? "previousValues" : "newValues"}`);
      const payload = JSON.parse(target);
      const typeKey: string | undefined = payload.type ?? payload.scenario;
      if (!typeKey) throw new Error("Cell change log missing financial type");
      await storage.upsertFinancialCell({
        projectId,
        fiscalYear: payload.fiscalYear,
        itemKey: payload.itemKey,
        type: typeKey,
        month: payload.month,
        amount: Number(payload.amount) || 0,
      });
      return `${direction === "undo" ? "Reverted" : "Re-applied"} ${typeKey.toUpperCase()} M${payload.month}`;
    }

    if (log.changeType === "item_updated") {
      const target = direction === "undo" ? log.previousValues : log.newValues;
      if (!target) throw new Error(`Item-update change log missing ${direction === "undo" ? "previousValues" : "newValues"}`);
      const payload = JSON.parse(target);
      const result = await storage.updateFinancialItemDimensions({
        projectId,
        itemKey: payload.itemKey,
        // Scope to the original year so undo/redo can never bleed across years
        // when the same itemKey exists in multiple fiscal years.
        fiscalYear: payload.fiscalYear != null ? Number(payload.fiscalYear) : undefined,
        dimensions: payload,
      });
      if (result.updated === 0) throw new Error("Item not found");
      return `${direction === "undo" ? "Reverted" : "Re-applied"} dimensions of "${payload.itemName ?? payload.itemKey}"`;
    }

    if (log.changeType === "item_created") {
      const created = log.newValues ? JSON.parse(log.newValues) : null;
      if (!created?.itemKey) throw new Error("Item-create change log missing newValues.itemKey");
      if (direction === "undo") {
        await storage.deleteFinancialItem({ projectId, itemKey: created.itemKey });
        return `Removed "${created.itemName ?? created.itemKey}" (reverted creation)`;
      }
      // Redo: re-create the item with the original dimensions AND the same
      // org-enabled type set captured at creation time. Fall back to the
      // current org config if a legacy log row didn't persist `types`.
      let typesForRedo: string[] | undefined = Array.isArray(created.types) ? created.types : undefined;
      if (!typesForRedo) {
        const project = await storage.getProject(projectId);
        if (project?.organizationId) {
          const orgTypes = await getOrgTypeConfig(project.organizationId);
          typesForRedo = orgTypes.filter(s => s.enabled).map(s => s.key);
        }
      }
      await storage.createFinancialItem({
        projectId,
        fiscalYear: Number(created.fiscalYear),
        itemKey: created.itemKey,
        dimensions: {
          itemName: created.itemName,
          financialView: created.financialView ?? null,
          costCategory: created.costCategory ?? null,
          costSpecification: created.costSpecification ?? null,
          category: created.category ?? null,
          wbs: created.wbs ?? null,
          comments: created.comments ?? null,
          sortOrder: created.sortOrder ?? 0,
        },
        types: typesForRedo,
      });
      return `Re-created "${created.itemName ?? created.itemKey}"`;
    }

    if (log.changeType === "item_deleted") {
      throw new Error("Cannot undo or redo a deletion — please recreate the item manually");
    }

    throw new Error(`Cannot ${direction} change of type "${log.changeType}"`);
  }

  // Undo: revert the most recent active (non-undone) change.
  app.post("/api/projects/:projectId/financial-entries/undo", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

      const history = await storage.getCostItemChangeLogs(projectId);
      // Most recent active (undone=false) entry that isn't a legacy __undo row.
      // Item deletions are NOT skipped — they form a hard barrier so that we
      // never undo a stale "update" against an item that was later deleted.
      const target = history.find(h => !h.undone && !isLegacyUndoRow(h));
      if (!target) return res.status(400).json({ message: "Nothing to undo" });
      if (target.changeType === "item_deleted") {
        return res.status(400).json({
          message: "Cannot undo deletion — please recreate the item manually",
        });
      }

      const summary = await applyChangeLog(projectId, target, "undo");
      await storage.setChangeLogUndone(target.id, true);
      return res.json({ message: summary, undone: target });
    } catch (err: any) {
      console.error("Error undoing change:", err);
      res.status(500).json({ message: err?.message || "Error undoing change" });
    }
  });

  // Redo: re-apply the next change on the redo stack (the earliest undone
  // entry by changedAt — undones form a contiguous suffix because any new
  // edit truncates the redo stack).
  app.post("/api/projects/:projectId/financial-entries/redo", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });

      const history = await storage.getCostItemChangeLogs(projectId);
      // History is desc by changedAt; reverse-walk to find the EARLIEST undone
      // entry.
      const undoneAsc = history.filter(h => h.undone && !isLegacyUndoRow(h)).reverse();
      const target = undoneAsc[0];
      if (!target) return res.status(400).json({ message: "Nothing to redo" });

      const summary = await applyChangeLog(projectId, target, "redo");
      await storage.setChangeLogUndone(target.id, false);
      return res.json({ message: summary, redone: target });
    } catch (err: any) {
      console.error("Error redoing change:", err);
      res.status(500).json({ message: err?.message || "Error redoing change" });
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
