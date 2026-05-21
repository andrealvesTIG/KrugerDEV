import type { Express, Request } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { financialEntries, costItemChangeLogs, projects, portfolios } from "@shared/schema";
import { apiRoute, qInt, ref, r200, stdRes } from "../route-registry";
import { storage } from "../storage";
import { multiYearWbs } from "@shared/schema";
import type { FinancialType } from "@shared/schema";
import type { FinancialItemDimensions } from "../storage/financialStorage";
import {
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
import { gatherProjectEvmSeries } from "../services/projectAnalytics";
import { invalidateOrganizationContextCache } from "../services/jarvisService";
import { assertNotLocked, fiscalToCalendar } from "../services/financialLockdownService";

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

      if (guard.project.organizationId) {
        invalidateOrganizationContextCache(guard.project.organizationId);
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

      // Lockdown enforcement runs through the shared `assertNotLocked` helper
      // so every write path (this route, bulk-clear, item-delete, change-order
      // approval) honours exactly the same rule.
      const violation = await assertNotLocked({
        organizationId: guard.project.organizationId,
        projectId,
        fiscalYear: Number(fiscalYear),
        fiscalMonth: monthNum,
        typeKey,
      });
      if (violation) {
        return res.status(409).json({
          message: `Financial type "${typeConfig.label}" is locked through ${violation.lockdownDate}. Cell for FY${fiscalYear} M${monthNum} (${violation.cellMonthEnd}) cannot be edited.`,
          code: "LOCKDOWN",
          lockdown: { financialTypeKey: violation.financialTypeKey, lockdownDate: violation.lockdownDate },
        });
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

      if (guard.project.organizationId) {
        invalidateOrganizationContextCache(guard.project.organizationId);
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

      // Lockdown enforcement: reject the whole batch if ANY cell falls in a
      // locked period. We check per-(type, fiscalYear, month) tuple so a
      // bulk-clear that mixes a locked AOP cell with editable FCST/ACT cells
      // is rejected cleanly with 409, not partially applied.
      for (const c of toClear) {
        const violation = await assertNotLocked({
          organizationId: guard.project.organizationId,
          projectId,
          fiscalYear: c.fiscalYear,
          fiscalMonth: c.month,
          typeKey: c.type,
        });
        if (violation) {
          return res.status(409).json({
            message: `Cannot clear cell for "${c.type}" in FY${c.fiscalYear} M${c.month}: period is locked through ${violation.lockdownDate}.`,
            code: "LOCKDOWN",
            lockdown: { financialTypeKey: violation.financialTypeKey, lockdownDate: violation.lockdownDate },
          });
        }
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

      if (guard.project.organizationId) {
        invalidateOrganizationContextCache(guard.project.organizationId);
      }

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

      if (guard.project.organizationId) {
        invalidateOrganizationContextCache(guard.project.organizationId);
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

      // Lockdown enforcement: an item-delete drops every (type, year, month)
      // cell of the item. Reject if ANY underlying cell sits in a locked
      // period — the same rule the single-cell PUT route enforces.
      //
      // `storage.getFinancialEntries` returns rows relabelled to FISCAL
      // coordinates (see relabelRow in financialStorage.ts) — `e.fiscalYear`
      // is the FY label and `e.month` is M1..M12 in fiscal order. We must
      // pass those as fiscal inputs so `assertNotLocked` translates them
      // back to the correct calendar month-end via the org's
      // fiscalYearStartMonth. Passing them as calendar directly would mis-
      // match for any org whose FY does not start in January.
      for (const e of itemEntries) {
        const violation = await assertNotLocked({
          organizationId: guard.project.organizationId,
          projectId,
          fiscalYear: e.fiscalYear,
          fiscalMonth: e.month,
          typeKey: e.scenario,
        });
        if (violation) {
          return res.status(409).json({
            message: `Cannot delete item: cell for "${e.scenario}" in ${violation.cellMonthEnd} is locked through ${violation.lockdownDate}.`,
            code: "LOCKDOWN",
            lockdown: { financialTypeKey: violation.financialTypeKey, lockdownDate: violation.lockdownDate },
          });
        }
      }

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

      if (guard.project.organizationId) {
        invalidateOrganizationContextCache(guard.project.organizationId);
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
      if (project.organizationId) {
        invalidateOrganizationContextCache(project.organizationId);
      }
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
      if (guard.project.organizationId) {
        invalidateOrganizationContextCache(guard.project.organizationId);
      }
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
      const orgIdRaw = req.params.orgId;
      const orgId = Number(orgIdRaw);
      if (!/^\d+$/.test(orgIdRaw) || !Number.isInteger(orgId) || orgId <= 0) {
        return res.status(400).json({ message: "Invalid orgId: must be a positive integer" });
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
      if (req.query.fiscalYear !== undefined && req.query.fiscalYear !== "") {
        const raw = String(req.query.fiscalYear);
        const parsed = Number(raw);
        if (!/^-?\d+$/.test(raw) || !Number.isInteger(parsed) || parsed < 1970 || parsed > 2200) {
          return res.status(400).json({ message: "Invalid fiscalYear: must be an integer between 1970 and 2200" });
        }
        fiscalYear = parsed;
      } else {
        fiscalYear = currentFiscalYear(today, fyStart);
      }
      let portfolioFilter: number | undefined;
      if (req.query.portfolioId !== undefined && req.query.portfolioId !== "") {
        const raw = String(req.query.portfolioId);
        const parsed = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ message: "Invalid portfolioId: must be a positive integer" });
        }
        // Verify the portfolio actually belongs to this org so callers can't
        // probe portfolios across organizations they have access to.
        const [pf] = await db.select().from(portfolios).where(and(
          eq(portfolios.id, parsed),
          eq(portfolios.organizationId, orgId),
        )).limit(1);
        if (!pf) {
          return res.status(404).json({ message: `Portfolio ${parsed} not found in this organization` });
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

      // Time-phased EVM (BAC fallback, task-weighted % complete, EV
      // distribution, EAC monthly synthesis, etc.) is delegated to
      // `gatherProjectEvmSeries` so the dashboard and Friday's analytics
      // helper share a single end-to-end pipeline. The route is responsible
      // only for org-/portfolio-scoping, project metadata enrichment, and
      // org-/portfolio-level rollups — not the EVM math itself.
      const evmResult = await gatherProjectEvmSeries(
        fyStart,
        projectIds,
        today,
        { fiscalYear, includeEmpty: true },
      );
      const { months, asOfMonth } = evmResult;
      const evmByProject = new Map<number, typeof evmResult.projects[number]>();
      for (const e of evmResult.projects) evmByProject.set(e.projectId, e);

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
        bac: number;
        ac: number;
        pv: number;
        ev: number;
        eacEntered: number;
        eacComputed: number;
        vac: number;
        varianceVsBudget: number;
        etc: number;
        cpi: number;
        spi: number;
        pvCum: number[];
        acCum: number[];
        evCum: number[];
        eacMonthly: number[];
        eacCum: number[];
        acMonthly: number[];
        pvMonthly: number[];
        fcstMonthly: number[];
      };

      const empty12 = () => Array<number>(12).fill(0);
      const projectEvm: ProjectEvm[] = visibleProjects.map(p => {
        // Every project is in `evmByProject` because the route opts into
        // `includeEmpty: true`; this fallback is purely defensive.
        const e = evmByProject.get(p.id);
        return {
          projectId: p.id,
          name: p.name,
          portfolioId: p.portfolioId,
          status: p.status,
          health: p.health,
          completionPercentage: e?.pcRaw ?? Number(p.completionPercentage ?? 0),
          startDate: p.startDate ? String(p.startDate) : null,
          endDate: p.endDate ? String(p.endDate) : null,
          actualStartDate: p.actualStartDate ? String(p.actualStartDate) : null,
          actualEndDate: p.actualEndDate ? String(p.actualEndDate) : null,
          bac: e?.bac ?? 0,
          ac: e?.ac ?? 0,
          pv: e?.pv ?? 0,
          ev: e?.ev ?? 0,
          eacEntered: e?.eacEntered ?? 0,
          eacComputed: e?.eacComputed ?? 0,
          vac: e?.vac ?? 0,
          varianceVsBudget: e?.varianceVsBudget ?? 0,
          etc: e?.etc ?? 0,
          cpi: e?.cpi ?? 1,
          spi: e?.spi ?? 1,
          pvCum: e?.pvCum ?? empty12(),
          acCum: e?.acCum ?? empty12(),
          evCum: e?.evCum ?? empty12(),
          eacMonthly: e?.eacMonthly ?? empty12(),
          eacCum: e?.eacCum ?? empty12(),
          acMonthly: e?.acMonthly ?? empty12(),
          pvMonthly: e?.pvMonthly ?? empty12(),
          fcstMonthly: e?.fcstMonthly ?? empty12(),
        };
      });

      // Org-wide series: sum monthly arrays across all visible projects.
      const series = months.map((m, i) => {
        let pvCum = 0, acCum = 0, evCum = 0, eacCum = 0;
        let pvMonthly = 0, acMonthly = 0, eacMonthly = 0, fcstMonthly = 0;
        for (const e of projectEvm) {
          pvCum += e.pvCum[i];
          acCum += e.acCum[i];
          evCum += e.evCum[i];
          eacCum += e.eacCum[i];
          pvMonthly += e.pvMonthly[i] || 0;
          acMonthly += e.acMonthly[i] || 0;
          eacMonthly += e.eacMonthly[i] || 0;
          fcstMonthly += e.fcstMonthly[i] || 0;
        }
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
        acc.varianceVsBudget += p.varianceVsBudget;
        acc.etc += p.etc;
        return acc;
      }, { bac: 0, ac: 0, pv: 0, ev: 0, eacEntered: 0, eacComputed: 0, vac: 0, varianceVsBudget: 0, etc: 0 });
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
          acc.vac += p.vac; acc.varianceVsBudget += p.varianceVsBudget; acc.etc += p.etc;
          return acc;
        }, { bac: 0, ac: 0, pv: 0, ev: 0, eacEntered: 0, eacComputed: 0, vac: 0, varianceVsBudget: 0, etc: 0 });
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
      if (guard.project.organizationId) {
        invalidateOrganizationContextCache(guard.project.organizationId);
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting WBS entry:", err);
      res.status(500).json({ message: "Error deleting WBS entry" });
    }
  });
}
