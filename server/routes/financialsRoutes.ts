import type { Express, Request } from "express";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { financialEntries, costItemChangeLogs, projects, portfolios, costItems, tasks } from "@shared/schema";
import { apiRoute, qInt, ref, r200, stdRes } from "../route-registry";
import { storage } from "../storage";
import { multiYearWbs } from "@shared/schema";
import type { FinancialType } from "@shared/schema";
import type { FinancialItemDimensions } from "../storage/financialStorage";
import {
  buildFiscalMonths,
  currentFiscalYear,
  fiscalSlotToCalendar,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";
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

/**
 * Map an FY-relative slot (fiscalYear label + month 1..12) → calendar
 * month-end date as ISO `YYYY-MM-DD`, given the org's `fiscalYearStartMonth`.
 * Returned strings are directly comparable to lockdown dates which are stored
 * as ISO date strings (YYYY-MM-DD lex order matches calendar order).
 */
export function fiscalMonthEndIso(
  fiscalYear: number,
  month: number,
  fyStartMonth: number,
): string {
  const start = normalizeFiscalYearStartMonth(fyStartMonth);
  const { year: cy, month: cm } = fiscalSlotToCalendar(fiscalYear, month, start);
  // Last day of `cm` for `cy` — `new Date(cy, cm, 0)` gives day 0 of (cm+1 in 0-idx) → last day of cm (1-idx).
  const d = new Date(Date.UTC(cy, cm, 0));
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

  // Lockdowns visible to anyone who can read the project. Returns the active
  // lockdown map (typeKey → lockdownDate) so the grid can mark locked cells.
  app.get("/api/projects/:projectId/financial-lockdowns", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const map = await storage.getActiveLockdownMap(guard.project.organizationId);
      res.json(map);
    } catch (err) {
      console.error("Error fetching lockdowns:", err);
      res.status(500).json({ message: "Error fetching lockdowns" });
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

      // Lockdown enforcement: reject saves whose period (FY+month → calendar
      // month-end) is on or before the most-recent lockdown date for this
      // financial type in this org.
      const lockdownMap = await storage.getActiveLockdownMap(guard.project.organizationId);
      const lockedAt = lockdownMap[typeKey];
      if (lockedAt) {
        const org = await storage.getOrganization(guard.project.organizationId);
        const fyStart = normalizeFiscalYearStartMonth(org?.fiscalYearStartMonth);
        const cellMonthEnd = fiscalMonthEndIso(Number(fiscalYear), monthNum, fyStart);
        if (cellMonthEnd <= lockedAt) {
          return res.status(403).json({
            message: `Financial type "${typeConfig.label}" is locked through ${lockedAt}. Cell for FY${fiscalYear} M${monthNum} (${cellMonthEnd}) cannot be edited.`,
            code: "LOCKDOWN",
            lockdown: { financialTypeKey: typeKey, lockdownDate: lockedAt },
          });
        }
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

  // Bulk-clear: zero a list of editable cells in a single transaction and
  // write ONE change-log row of type `bulk_cell`. Already-zero cells are
  // silently dropped so the log doesn't get noise. Read-only types and
  // unknown/disabled types are rejected with 400.
  app.post("/api/projects/:projectId/financial-cells/bulk-clear", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const body = req.body || {};
      const fiscalYear = Number(body.fiscalYear);
      const cellsIn: any[] = Array.isArray(body.cells) ? body.cells : [];
      if (!fiscalYear || cellsIn.length === 0) {
        return res.status(400).json({ message: "fiscalYear and a non-empty cells array are required" });
      }

      const orgTypes = await getOrgTypeConfig(guard.project.organizationId);
      const typeMap = new Map(orgTypes.map(s => [s.key, s]));
      // Validate every cell up front so we don't half-apply.
      for (const c of cellsIn) {
        const typeKey = String(c?.type ?? "");
        const typeCfg = typeMap.get(typeKey);
        if (!typeCfg) return res.status(400).json({ message: `Unknown financial type "${typeKey}"` });
        if (!typeCfg.enabled) return res.status(400).json({ message: `Financial type "${typeCfg.label}" is disabled` });
        if (!typeCfg.editable) return res.status(403).json({ message: `Financial type "${typeCfg.label}" is read-only` });
        const m = Number(c?.month);
        if (!Number.isFinite(m) || m < 1 || m > 12) {
          return res.status(400).json({ message: "Each cell must include month 1..12" });
        }
        if (!c?.itemKey || typeof c.itemKey !== "string") {
          return res.status(400).json({ message: "Each cell must include itemKey" });
        }
      }

      // Snapshot current amounts so undo can restore them. Only include
      // cells whose previous amount is non-zero — clearing an already-zero
      // cell is a no-op and would just clutter the log.
      const allEntries = await storage.getFinancialEntries(projectId, fiscalYear);
      const lookup = new Map<string, number>();
      for (const e of allEntries) {
        lookup.set(`${e.itemKey}::${e.scenario}::${e.month}`, Number(e.amount) || 0);
      }
      const itemNameByKey = new Map<string, string>();
      for (const e of allEntries) {
        if (!itemNameByKey.has(e.itemKey)) itemNameByKey.set(e.itemKey, e.itemName);
      }

      const seen = new Set<string>();
      const toClear: Array<{ itemKey: string; type: string; month: number; fiscalYear: number; amount: number }> = [];
      for (const c of cellsIn) {
        const itemKey = String(c.itemKey);
        const typeKey = String(c.type);
        const month = Number(c.month);
        const dedupeKey = `${itemKey}::${typeKey}::${month}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const prevAmount = lookup.get(dedupeKey) ?? 0;
        if (prevAmount === 0) continue;
        toClear.push({ itemKey, type: typeKey, month, fiscalYear, amount: prevAmount });
      }

      if (toClear.length === 0) {
        return res.json({ cleared: 0, message: "Nothing to clear" });
      }

      // Resolve user display name BEFORE the transaction so we don't block
      // the tx on a separate read inside.
      const changerName = await changedByName(userId);
      const sampleNames = Array.from(new Set(toClear.map(c => itemNameByKey.get(c.itemKey)).filter(Boolean))).slice(0, 3);
      const distinctItemCount = new Set(toClear.map(c => c.itemKey)).size;
      const summary = `Cleared ${toClear.length} cell${toClear.length === 1 ? "" : "s"}`
        + (sampleNames.length > 0
          ? ` (${sampleNames.join(", ")}${sampleNames.length < distinctItemCount ? ", …" : ""})`
          : "");

      // Single DB transaction: zero every targeted cell, clear the redo stack,
      // and write ONE change-log row. If any step fails the whole batch is
      // rolled back so the audit log can never disagree with the data.
      // We update by matching the natural key tuple (project, fy, itemKey,
      // scenario, month) — every cell is guaranteed to exist because we only
      // included cells whose previous amount was non-zero (they came from
      // getFinancialEntries above).
      // Translate each FY-relative cell → calendar (year, month) using the
      // org's `fiscalYearStartMonth` so the WHERE clause hits the right
      // calendar-anchored row in storage (Task #36).
      const orgForFy = await storage.getOrganization(guard.project.organizationId);
      const fyStart = normalizeFiscalYearStartMonth(orgForFy?.fiscalYearStartMonth);

      await db.transaction(async (tx) => {
        for (const c of toClear) {
          const cal = fiscalSlotToCalendar(c.fiscalYear, c.month, fyStart);
          await tx
            .update(financialEntries)
            .set({ amount: "0" as any, updatedAt: new Date() })
            .where(and(
              eq(financialEntries.projectId, projectId),
              eq(financialEntries.fiscalYear, cal.year),
              eq(financialEntries.itemKey, c.itemKey),
              eq(financialEntries.scenario, c.type),
              eq(financialEntries.month, cal.month),
            ));
        }
        // Clear redo stack inside the tx so a partial failure doesn't leave
        // a stale redo state that would re-apply the wrong thing.
        await tx
          .delete(costItemChangeLogs)
          .where(and(eq(costItemChangeLogs.projectId, projectId), eq(costItemChangeLogs.undone, true)));
        await tx.insert(costItemChangeLogs).values({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: changerName,
          changeType: "bulk_cell",
          changeSummary: summary,
          previousValues: JSON.stringify({ fiscalYear, cells: toClear }),
          newValues: JSON.stringify({ fiscalYear, cells: toClear.map(c => ({ ...c, amount: 0 })) }),
        });
      });

      res.json({ cleared: toClear.length });
    } catch (err: any) {
      console.error("Error bulk-clearing financial cells:", err);
      res.status(500).json({ message: err?.message || "Error bulk-clearing financial cells" });
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

      // Snapshot all cells BEFORE deletion so undo can fully restore the
      // item — dimensions + every (fiscalYear, type, month, amount) tuple.
      const allEntries = await storage.getFinancialEntries(projectId);
      const itemEntries = allEntries.filter(e =>
        e.itemKey === itemKey && (fiscalYear === undefined || e.fiscalYear === fiscalYear),
      );
      const cellSnapshots = itemEntries.map(e => ({
        fiscalYear: e.fiscalYear,
        type: e.scenario,
        month: e.month,
        amount: Number(e.amount) || 0,
      }));
      // Capture the per-fiscalYear type set actually present so undo recreates
      // the same fan-out (covers orgs with custom enabled types).
      const yearTypeMap = new Map<number, Set<string>>();
      for (const e of itemEntries) {
        if (!yearTypeMap.has(e.fiscalYear)) yearTypeMap.set(e.fiscalYear, new Set());
        yearTypeMap.get(e.fiscalYear)!.add(e.scenario);
      }
      const yearTypes = Array.from(yearTypeMap.entries()).map(([fy, types]) => ({
        fiscalYear: fy,
        types: Array.from(types),
      }));

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
          previousValues: JSON.stringify({
            itemKey,
            ...previous,
            yearTypes,
            cells: cellSnapshots,
          }),
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
      const prev = log.previousValues ? JSON.parse(log.previousValues) : null;
      if (!prev?.itemKey) throw new Error("Item-delete change log missing previousValues.itemKey");

      if (direction === "undo") {
        // Restore the item: recreate per-fiscal-year fan-outs using the
        // captured type set, then upsert every cell to its original amount.
        // Legacy rows without `yearTypes`/`cells` (pre-feature) cannot be
        // fully restored — surface a clear error.
        if (!Array.isArray(prev.yearTypes) || !Array.isArray(prev.cells)) {
          throw new Error("This deletion was logged before undo support — cannot restore");
        }
        const dimensions: FinancialItemDimensions = {
          itemName: prev.itemName,
          financialView: prev.financialView ?? null,
          costCategory: prev.costCategory ?? null,
          costSpecification: prev.costSpecification ?? null,
          category: prev.category ?? null,
          wbs: prev.wbs ?? null,
          comments: prev.comments ?? null,
          sortOrder: prev.sortOrder ?? 0,
        };
        for (const yt of prev.yearTypes as Array<{ fiscalYear: number; types: string[] }>) {
          await storage.createFinancialItem({
            projectId,
            fiscalYear: Number(yt.fiscalYear),
            itemKey: prev.itemKey,
            dimensions,
            types: yt.types,
          });
        }
        for (const c of prev.cells as Array<{ fiscalYear: number; type: string; month: number; amount: number }>) {
          if (Number(c.amount) === 0) continue; // create already seeded zeros
          await storage.upsertFinancialCell({
            projectId,
            fiscalYear: Number(c.fiscalYear),
            itemKey: prev.itemKey,
            type: c.type,
            month: Number(c.month),
            amount: Number(c.amount) || 0,
          });
        }
        return `Restored "${prev.itemName ?? prev.itemKey}"`;
      }

      // Redo: re-delete the item (scoped to the original year if the original
      // delete was scoped, otherwise across all years).
      const scopedYears = Array.isArray(prev.yearTypes) && prev.yearTypes.length === 1
        ? [Number(prev.yearTypes[0].fiscalYear)]
        : null;
      if (scopedYears) {
        for (const fy of scopedYears) {
          await storage.deleteFinancialItem({ projectId, itemKey: prev.itemKey, fiscalYear: fy });
        }
      } else {
        await storage.deleteFinancialItem({ projectId, itemKey: prev.itemKey });
      }
      return `Re-deleted "${prev.itemName ?? prev.itemKey}"`;
    }

    if (log.changeType === "bulk_cell") {
      // previousValues holds the snapshot of cells BEFORE the bulk action ran.
      // Undo restores each previous amount; redo re-zeroes the same set.
      const prev = log.previousValues ? JSON.parse(log.previousValues) : null;
      const cells: Array<{ itemKey: string; type: string; month: number; fiscalYear: number; amount: number }>
        = prev?.cells ?? [];
      if (!Array.isArray(cells) || cells.length === 0) {
        throw new Error("Bulk-cell change log has no cells to apply");
      }
      for (const c of cells) {
        const typeKey = c.type;
        if (!typeKey) continue;
        await storage.upsertFinancialCell({
          projectId,
          fiscalYear: Number(c.fiscalYear),
          itemKey: c.itemKey,
          type: typeKey,
          month: Number(c.month),
          amount: direction === "undo" ? (Number(c.amount) || 0) : 0,
        });
      }
      return direction === "undo"
        ? `Restored ${cells.length} cleared cell${cells.length === 1 ? "" : "s"}`
        : `Re-cleared ${cells.length} cell${cells.length === 1 ? "" : "s"}`;
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
      // Most recent active (undone=false) non-legacy entry. Deletions are now
      // undoable because we snapshot dimensions+cells in their previousValues.
      const target = history.find(h => !h.undone && !isLegacyUndoRow(h));
      if (!target) return res.status(400).json({ message: "Nothing to undo" });

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

  // ===================== FINANCIAL ANALYTICS (org-wide EVM rollup) =====================
  // Aggregates AOP/FCST/ACT/EAC entries for every project the user can see in
  // the org, joins with project schedule + completion data to compute PMI EVM
  // metrics (PV, EV, AC, EAC, CPI, SPI) for the requested fiscal year. Used by
  // the Financials Dashboard's seven sub-reports — they all hit this single
  // endpoint and re-shape the payload client-side.
  apiRoute(app, 'get', '/api/organizations/:orgId/financial-analytics', {
    tag: 'Financials',
    summary: 'Compute org-level PMI/EVM analytics',
    description: 'Returns BAC/AC/PV/EV/EAC totals, monthly series, per-portfolio rollups, and per-project EVM (CPI/SPI/VAC/ETC/TCPI) for a fiscal year. EV uses task-progress when tasks have progress, otherwise falls back to project-level completionPercentage. EAC monthly series falls back to AC + PV-proportional remaining ETC when no EAC entries exist.',
    parameters: [
      qInt('fiscalYear', false, 'Fiscal-year label (defaults to current FY)'),
      qInt('portfolioId', false, 'Restrict to a single portfolio'),
    ],
    responses: { ...r200('Financial analytics payload', ref('Object')), ...stdRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      if (!Number.isInteger(orgId) || orgId <= 0) {
        return res.status(400).json({ message: "Invalid orgId" });
      }
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      if (!(await userHasOrgAccess(userId, orgId))) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      const fyStart = normalizeFiscalYearStartMonth(org.fiscalYearStartMonth);
      const today = new Date();
      let fiscalYear: number;
      if (req.query.fiscalYear !== undefined) {
        const parsed = Number(req.query.fiscalYear);
        if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2999) {
          return res.status(400).json({ message: "Invalid fiscalYear" });
        }
        fiscalYear = parsed;
      } else {
        fiscalYear = currentFiscalYear(today, fyStart);
      }
      let portfolioFilter: number | undefined;
      if (req.query.portfolioId !== undefined) {
        const parsed = Number(req.query.portfolioId);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ message: "Invalid portfolioId" });
        }
        portfolioFilter = parsed;
      }

      // Project list scoped to user's access. Team members only see assigned projects.
      const allProjects = await db.select().from(projects).where(and(
        eq(projects.organizationId, orgId),
        isNull(projects.deletedAt),
      ));
      const isTeamOnly = await isTeamMemberInOrg(userId, orgId);
      const allowedIds = isTeamOnly ? new Set(await getTeamMemberProjectIds(userId, orgId)) : null;
      const visibleProjects = allProjects.filter(p =>
        (!allowedIds || allowedIds.has(p.id))
        && (portfolioFilter === undefined || p.portfolioId === portfolioFilter)
      );
      const projectIds = visibleProjects.map(p => p.id);

      const portfolioRows = await db.select().from(portfolios).where(eq(portfolios.organizationId, orgId));

      const months = buildFiscalMonths(fiscalYear, fyStart);

      // Determine the "as-of" fiscal-month index (1..12). Months whose
      // calendar end falls on/before today are considered actuals; future
      // months become forecast projections.
      const monthEnds = months.map(m => new Date(Date.UTC(m.year, m.month, 0)));
      let asOfMonth = 0;
      for (let i = 0; i < monthEnds.length; i++) {
        if (today >= monthEnds[i]) asOfMonth = i + 1;
        else break;
      }
      // If today is mid-month within the FY, also count the in-progress month.
      const fyStartDate = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
      const fyEndDate = monthEnds[11];
      if (today >= fyStartDate && today < fyEndDate) {
        const cur = today.getUTCMonth() + 1;
        const curYear = today.getUTCFullYear();
        const idx = months.findIndex(m => m.year === curYear && m.month === cur);
        if (idx >= 0 && idx + 1 > asOfMonth) asOfMonth = idx + 1;
      } else if (today >= fyEndDate) {
        asOfMonth = 12;
      }

      // financial_entries is calendar-anchored: rows store (fiscal_year=calendar
      // year, month=calendar month 1..12). To pull a fiscal year we have to
      // match each of its 12 (year, month) calendar pairs and translate them
      // back to a 1..12 fiscal-month index for charting.
      const calPairs = months.map(m => ({ year: m.year, month: m.month }));
      const calKey = (y: number, m: number) => `${y}-${m}`;
      const calIndex = new Map<string, number>(); // calendar key → 0-based fiscal-month index
      calPairs.forEach((p, i) => calIndex.set(calKey(p.year, p.month), i));

      const allEntries = projectIds.length === 0 ? [] : await db
        .select()
        .from(financialEntries)
        .where(and(
          inArray(financialEntries.projectId, projectIds),
          or(...calPairs.map(p => and(
            eq(financialEntries.fiscalYear, p.year),
            eq(financialEntries.month, p.month),
          ))),
        ));

      // BAC per project from cost_items.aopTotal (authoritative budget when
      // present), with a fallback to the AOP entries we already aggregate.
      const costItemBac = projectIds.length === 0 ? [] : await db
        .select({
          projectId: costItems.projectId,
          total: sql<string>`COALESCE(SUM(${costItems.aopTotal}::numeric), 0)`.as("total"),
        })
        .from(costItems)
        .where(and(
          inArray(costItems.projectId, projectIds),
          eq(costItems.fiscalYear, fiscalYear),
        ))
        .groupBy(costItems.projectId);
      // Use a Map to track *presence* of cost-item BAC, not just non-zero
      // value. A project that has cost_items recorded for the FY (even if the
      // sum is 0) is treated as having an authoritative budget; only projects
      // with no cost_items at all fall back to summing AOP entries.
      const bacFromCostItems = new Map<number, number>();
      for (const r of costItemBac) bacFromCostItems.set(r.projectId, Number(r.total) || 0);

      // Task-derived progress: weighted average of task.progress by
      // estimatedHours, falling back to durationDays, then to a count weight.
      // This becomes the project's effective % complete for EV when at least
      // one of its tasks has a non-zero progress value (more accurate than the
      // single project-level completionPercentage). Projects without any task
      // progress fall back to the project-level value.
      const taskProgressByProject = new Map<number, number>();
      if (projectIds.length > 0) {
        const taskRows = await db
          .select({
            projectId: tasks.projectId,
            progress: tasks.progress,
            estimatedHours: tasks.estimatedHours,
            durationDays: tasks.durationDays,
          })
          .from(tasks)
          .where(and(
            inArray(tasks.projectId, projectIds),
            isNull(tasks.deletedAt),
          ));
        const accum = new Map<number, { num: number; den: number; anyProgress: boolean }>();
        for (const t of taskRows) {
          if (t.progress == null) continue;
          const w = Number(t.estimatedHours) || Number(t.durationDays) || 1;
          if (!isFinite(w) || w <= 0) continue;
          const cur = accum.get(t.projectId) ?? { num: 0, den: 0, anyProgress: false };
          cur.num += w * Number(t.progress);
          cur.den += w;
          if (Number(t.progress) > 0) cur.anyProgress = true;
          accum.set(t.projectId, cur);
        }
        for (const [pid, v] of accum.entries()) {
          if (v.anyProgress && v.den > 0) {
            taskProgressByProject.set(pid, v.num / v.den);
          }
        }
      }

      // Build per-project monthly buckets keyed by financial type, indexed by
      // fiscal-month position 0..11.
      type Buckets = Record<string, number[]>;
      const perProject = new Map<number, Buckets>();
      for (const pid of projectIds) perProject.set(pid, {});
      for (const e of allEntries) {
        const buckets = perProject.get(e.projectId);
        if (!buckets) continue;
        const idx = calIndex.get(calKey(e.fiscalYear, e.month));
        if (idx === undefined) continue;
        const arr = buckets[e.scenario] ?? (buckets[e.scenario] = Array(12).fill(0));
        arr[idx] += Number(e.amount) || 0;
      }

      const sumArr = (a: number[] | undefined) => (a ? a.reduce((s, v) => s + v, 0) : 0);
      const cumArr = (a: number[] | undefined) => {
        const out = Array(12).fill(0);
        if (!a) return out;
        let acc = 0;
        for (let i = 0; i < 12; i++) { acc += a[i] || 0; out[i] = acc; }
        return out;
      };

      // EVM per project for the FY.
      type ProjectEvm = {
        projectId: number;
        name: string;
        portfolioId: number | null;
        status: string | null;
        health: string | null;
        completionPercentage: number;
        startDate: string | null;
        endDate: string | null;
        actualStartDate: string | null;
        actualEndDate: string | null;
        bac: number;       // total AOP for FY
        ac: number;        // sum ACT to as-of
        pv: number;        // cumulative AOP through as-of
        ev: number;        // earned value to date
        eacEntered: number;// sum of EAC entries for FY
        eacComputed: number;
        vac: number;
        etc: number;
        cpi: number;
        spi: number;
        // monthly cumulative arrays (length 12)
        pvCum: number[];
        acCum: number[];
        evCum: number[];
        eacMonthly: number[]; // EAC values per month (not cumulative — useful for time-phased EAC)
        eacCum: number[];
        // monthly non-cumulative AC / AOP for cash-flow charts
        acMonthly: number[];
        pvMonthly: number[];
      };

      const projectEvm: ProjectEvm[] = visibleProjects.map(p => {
        const b = perProject.get(p.id) ?? {};
        const aopArr = b["aop"] ?? Array(12).fill(0);
        const fcstArr = b["fcst"] ?? Array(12).fill(0);
        const actArr = b["act"] ?? Array(12).fill(0);
        const eacArr = b["eac"] ?? null;
        const pvCum = cumArr(aopArr);
        const acCum = cumArr(actArr);
        // BAC: prefer cost_items.aopTotal aggregate (the budget the user
        // explicitly captured per cost item); fall back to summed AOP entries
        // ONLY when no cost-item row exists at all for the FY. Presence-based,
        // not value-based — a project with cost items totaling exactly 0 is
        // still considered to have an authoritative budget.
        const hasCiBac = bacFromCostItems.has(p.id);
        const bacEntries = sumArr(aopArr);
        const bac = hasCiBac ? (bacFromCostItems.get(p.id) ?? 0) : bacEntries;
        const acTotal = acCum[11];
        // Prefer task-progress-derived %, fall back to project-level value.
        const taskPc = taskProgressByProject.get(p.id);
        const pcSource: 'task-weighted' | 'project-level' =
          taskPc != null ? 'task-weighted' : 'project-level';
        const pcRaw = taskPc != null ? taskPc : Number(p.completionPercentage ?? 0);
        const pcFraction = Math.max(0, Math.min(1, pcRaw / 100));

        // EV strategy:
        //   PMI EVM defines EV as Σ(planned cost × % complete) per cost item
        //   or work package. The current schema (`cost_items`) records
        //   monthly AOP/FCST/ACT but does not carry a per-cost-item progress
        //   percentage. We therefore use the documented PMI fallback:
        //   project-level `completionPercentage` applied to BAC, distributed
        //   across periods in proportion to that project's own planned (PV)
        //   curve (a per-project — NOT global — distribution). This is
        //   equivalent to Σ(cost_item.aopTotal × project_pc) when summed over
        //   the project's cost items, and converges to the per-item formula
        //   if/when item progress is added later.
        const asOfIdx = Math.max(0, asOfMonth - 1);
        const pvAtAsOf = asOfMonth > 0 ? pvCum[asOfIdx] : 0;
        const evToDate = bac > 0 ? bac * pcFraction : 0;
        const evCum = Array(12).fill(0);
        for (let i = 0; i < 12; i++) {
          if (asOfMonth === 0) { evCum[i] = 0; continue; }
          if (i <= asOfIdx) {
            evCum[i] = pvAtAsOf > 0
              ? evToDate * (pvCum[i] / pvAtAsOf)
              : evToDate * ((i + 1) / asOfMonth);
          } else {
            evCum[i] = evToDate;
          }
        }
        const ev = asOfMonth > 0 ? evCum[asOfIdx] : 0;
        const ac = asOfMonth > 0 ? acCum[asOfIdx] : 0;
        const pv = pvAtAsOf;
        const cpi = ac > 0 ? ev / ac : 1;
        const spi = pv > 0 ? ev / pv : 1;
        const eacEntered = eacArr ? sumArr(eacArr) : 0;
        const eacComputed = eacEntered > 0
          ? eacEntered
          : (cpi > 0 ? bac / cpi : bac);
        const vac = bac - eacComputed;
        const etc = Math.max(0, eacComputed - ac);

        // EAC monthly: prefer entered series, otherwise synthesize a
        // PMI-conformant curve = AC for past/current months + ETC distributed
        // across future months in proportion to remaining AOP (PV). When no
        // future AOP exists, spread ETC evenly across remaining months.
        let eacMonthlyOut: number[];
        if (eacArr && eacArr.some(v => Number(v) !== 0)) {
          eacMonthlyOut = eacArr.slice();
        } else {
          eacMonthlyOut = Array(12).fill(0);
          let futureAop = 0;
          for (let i = 0; i < 12; i++) {
            if (i < asOfMonth) eacMonthlyOut[i] = actArr[i] || 0;
            else futureAop += aopArr[i] || 0;
          }
          const remainingMonths = Math.max(0, 12 - asOfMonth);
          for (let i = asOfMonth; i < 12; i++) {
            if (futureAop > 0) {
              eacMonthlyOut[i] = etc * ((aopArr[i] || 0) / futureAop);
            } else if (remainingMonths > 0) {
              eacMonthlyOut[i] = etc / remainingMonths;
            }
          }
        }
        const eacCum = cumArr(eacMonthlyOut);

        return {
          projectId: p.id,
          name: p.name,
          portfolioId: p.portfolioId,
          status: p.status,
          health: p.health,
          completionPercentage: pcRaw,
          startDate: p.startDate ? String(p.startDate) : null,
          endDate: p.endDate ? String(p.endDate) : null,
          actualStartDate: p.actualStartDate ? String(p.actualStartDate) : null,
          actualEndDate: p.actualEndDate ? String(p.actualEndDate) : null,
          bac, ac, pv, ev, eacEntered, eacComputed, vac, etc, cpi, spi,
          pvCum, acCum, evCum,
          eacMonthly: eacMonthlyOut,
          eacCum,
          acMonthly: actArr,
          pvMonthly: aopArr,
        };
      });

      // Org-wide series: sum monthly arrays across all visible projects.
      const series = months.map((m, i) => {
        let pvCum = 0, acCum = 0, evCum = 0, eacCum = 0;
        let pv = 0, ac = 0, ev = 0;
        let pvMonthly = 0, acMonthly = 0, eacMonthly = 0, fcstMonthly = 0;
        for (const e of projectEvm) {
          pvCum += e.pvCum[i];
          acCum += e.acCum[i];
          evCum += e.evCum[i];
          eacCum += e.eacCum[i];
          pvMonthly += e.pvMonthly[i] || 0;
          acMonthly += e.acMonthly[i] || 0;
          eacMonthly += e.eacMonthly[i] || 0;
          fcstMonthly += (perProject.get(e.projectId)?.["fcst"]?.[i] || 0);
        }
        // Past/current months: AC actuals are the spend curve. Future months:
        // project remaining ETC across remaining months proportionally to AOP.
        const isFuture = (i + 1) > asOfMonth;
        return {
          monthNum: m.monthNum,
          label: m.label,
          year: m.year,
          month: m.month,
          isFuture,
          pv: pvMonthly,
          ac: acMonthly,
          fcst: fcstMonthly,
          eac: eacMonthly,
          pvCum, acCum, evCum, eacCum,
        };
      });

      // Org totals (at as-of).
      const totals = projectEvm.reduce((acc, p) => {
        acc.bac += p.bac;
        acc.ac += p.ac;
        acc.pv += p.pv;
        acc.ev += p.ev;
        acc.eacEntered += p.eacEntered;
        acc.eacComputed += p.eacComputed;
        acc.vac += p.vac;
        acc.etc += p.etc;
        return acc;
      }, { bac: 0, ac: 0, pv: 0, ev: 0, eacEntered: 0, eacComputed: 0, vac: 0, etc: 0 });
      const totalCpi = totals.ac > 0 ? totals.ev / totals.ac : 1;
      const totalSpi = totals.pv > 0 ? totals.ev / totals.pv : 1;

      // Portfolio rollup.
      const portfolioMap = new Map<number, { id: number; name: string }>();
      for (const pf of portfolioRows) portfolioMap.set(pf.id, { id: pf.id, name: pf.name });
      const portfolioGroups = new Map<number | null, ProjectEvm[]>();
      for (const pe of projectEvm) {
        const k = pe.portfolioId ?? null;
        const list = portfolioGroups.get(k) ?? [];
        list.push(pe);
        portfolioGroups.set(k, list);
      }
      const portfoliosOut = Array.from(portfolioGroups.entries()).map(([pid, items]) => {
        const meta = pid != null ? portfolioMap.get(pid) : undefined;
        const sum = items.reduce((acc, p) => {
          acc.bac += p.bac; acc.ac += p.ac; acc.pv += p.pv; acc.ev += p.ev;
          acc.eacEntered += p.eacEntered; acc.eacComputed += p.eacComputed;
          acc.vac += p.vac; acc.etc += p.etc;
          return acc;
        }, { bac: 0, ac: 0, pv: 0, ev: 0, eacEntered: 0, eacComputed: 0, vac: 0, etc: 0 });
        return {
          portfolioId: pid,
          name: meta?.name ?? (pid == null ? "Unassigned" : `Portfolio ${pid}`),
          projectCount: items.length,
          ...sum,
          cpi: sum.ac > 0 ? sum.ev / sum.ac : 1,
          spi: sum.pv > 0 ? sum.ev / sum.pv : 1,
        };
      }).sort((a, b) => b.bac - a.bac);

      res.json({
        fiscalYear,
        fiscalYearStartMonth: fyStart,
        asOfMonth,
        months: months.map(m => ({ monthNum: m.monthNum, label: m.label, year: m.year, month: m.month })),
        totals: { ...totals, cpi: totalCpi, spi: totalSpi },
        series,
        portfolios: portfoliosOut,
        projects: projectEvm,
      });
    } catch (err: any) {
      console.error("Error computing financial analytics:", err);
      res.status(500).json({ message: err?.message || "Error computing financial analytics" });
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
