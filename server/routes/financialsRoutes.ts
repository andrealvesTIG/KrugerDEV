import type { Express, Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { multiYearWbs } from "@shared/schema";
import type { FinancialScenario } from "@shared/schema";
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

async function getOrgScenarioConfig(organizationId: number): Promise<FinancialScenario[]> {
  const { DEFAULT_FINANCIAL_SCENARIOS, financialScenariosConfigSchema } = await import("@shared/schema");
  const org = await storage.getOrganization(organizationId);
  const validated = financialScenariosConfigSchema.safeParse(org?.financialScenariosConfig);
  const list = validated.success ? validated.data.scenarios : [];
  const seen = new Set(list.map(s => s.key));
  const merged = [...list];
  for (const sys of DEFAULT_FINANCIAL_SCENARIOS.scenarios) {
    if (!seen.has(sys.key)) merged.push(sys);
  }
  return merged.length > 0 ? merged : DEFAULT_FINANCIAL_SCENARIOS.scenarios;
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

      const orgScenarios = await getOrgScenarioConfig(guard.project.organizationId);
      const enabledKeys = orgScenarios.filter(s => s.enabled).map(s => s.key);

      const itemKey = await storage.createFinancialItem({
        projectId,
        fiscalYear: Number(fiscalYear),
        dimensions,
        scenarios: enabledKeys,
      });

      try {
        await storage.createCostItemChangeLog({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "item_created",
          changeSummary: `Created "${dimensions.itemName}" (${dimensions.financialView || "N/A"} > ${dimensions.costCategory || "N/A"} > ${dimensions.costSpecification || "N/A"})`,
          previousValues: null,
          newValues: JSON.stringify({ itemKey, fiscalYear, ...dimensions }),
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

  // Update a single cell (one scenario × one month for one logical item).
  app.put("/api/projects/:projectId/financial-cells", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const { fiscalYear, itemKey, scenario, month, amount } = req.body || {};
      if (!fiscalYear || !itemKey || !scenario || !month) {
        return res.status(400).json({ message: "fiscalYear, itemKey, scenario, month are required" });
      }
      if (typeof scenario !== "string" || !/^[a-z0-9_-]+$/.test(scenario)) {
        return res.status(400).json({ message: "scenario must be a valid scenario key" });
      }
      const monthNum = Number(month);
      if (monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "month must be 1..12" });
      }

      // Validate the scenario exists, is enabled, and is editable for this org.
      const orgScenarios = await getOrgScenarioConfig(guard.project.organizationId);
      const scenarioConfig = orgScenarios.find(s => s.key === scenario);
      if (!scenarioConfig) {
        return res.status(400).json({ message: `Unknown scenario "${scenario}" for this organization` });
      }
      if (!scenarioConfig.enabled) {
        return res.status(400).json({ message: `Scenario "${scenarioConfig.label}" is disabled` });
      }
      if (!scenarioConfig.editable) {
        return res.status(403).json({ message: `Scenario "${scenarioConfig.label}" is read-only` });
      }

      const result = await storage.upsertFinancialCell({
        projectId,
        fiscalYear: Number(fiscalYear),
        itemKey,
        scenario,
        month: monthNum,
        amount: Number(amount) || 0,
      });

      if (result.previous !== result.next) {
        try {
          await storage.createCostItemChangeLog({
            costItemId: null,
            projectId,
            changedBy: userId,
            changedByName: await changedByName(userId),
            changeType: "cell",
            changeSummary: `"${result.entry.itemName}" ${scenario.toUpperCase()} M${monthNum}: ${result.previous} → ${result.next}`,
            previousValues: JSON.stringify({
              itemKey, scenario, month: monthNum, fiscalYear: Number(fiscalYear), amount: result.previous,
            }),
            newValues: JSON.stringify({
              itemKey, scenario, month: monthNum, fiscalYear: Number(fiscalYear), amount: result.next,
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
        await storage.createCostItemChangeLog({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "item_updated",
          changeSummary: `Updated dimensions of "${result.previous?.itemName ?? itemKey}"`,
          previousValues: JSON.stringify({ itemKey, ...result.previous }),
          newValues: JSON.stringify({ itemKey, ...dimensions }),
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

  // Undo: replays the most recent change in reverse.
  app.post("/api/projects/:projectId/financial-entries/undo", async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const guard = await ensureProjectAccess(req, projectId);
      if (!guard.ok) return res.status(guard.status).json({ message: guard.message });
      const userId = guard.userId;

      const history = await storage.getCostItemChangeLogs(projectId);
      // Skip prior undo records — undoing an undo would just toggle forever.
      const last = history.find(h => {
        try {
          const meta = h.newValues ? JSON.parse(h.newValues) : null;
          if (meta && meta.__undo) return false;
          const prevMeta = h.previousValues ? JSON.parse(h.previousValues) : null;
          if (prevMeta && prevMeta.__undo) return false;
        } catch { /* fall through */ }
        return true;
      });
      if (!last) return res.status(400).json({ message: "No changes to undo" });

      if (last.changeType === "cell" && last.previousValues) {
        const prev = JSON.parse(last.previousValues);
        const newJson = last.newValues ? JSON.parse(last.newValues) : null;
        await storage.upsertFinancialCell({
          projectId,
          fiscalYear: prev.fiscalYear,
          itemKey: prev.itemKey,
          scenario: prev.scenario,
          month: prev.month,
          amount: Number(prev.amount) || 0,
        });
        await storage.createCostItemChangeLog({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "cell",
          changeSummary: `Undo: reverted ${prev.scenario?.toUpperCase()} M${prev.month}`,
          previousValues: JSON.stringify({ ...(newJson ?? prev), __undo: true }),
          newValues: JSON.stringify({ ...prev, __undo: true }),
        });
        return res.json({ message: "Cell change undone", undone: last });
      }

      if (last.changeType === "item_updated" && last.previousValues) {
        const prev = JSON.parse(last.previousValues);
        const result = await storage.updateFinancialItemDimensions({
          projectId,
          itemKey: prev.itemKey,
          dimensions: prev,
        });
        await storage.createCostItemChangeLog({
          costItemId: null,
          projectId,
          changedBy: userId,
          changedByName: await changedByName(userId),
          changeType: "item_updated",
          changeSummary: `Undo: reverted dimensions of "${prev.itemName ?? prev.itemKey}"`,
          previousValues: JSON.stringify({ ...(last.newValues ? JSON.parse(last.newValues) : {}), __undo: true }),
          newValues: JSON.stringify({ ...(last.previousValues ? JSON.parse(last.previousValues) : {}), __undo: true }),
        });
        return res.json({ message: "Item update undone", undone: last, updated: result.updated });
      }

      if (last.changeType === "item_created" && last.newValues) {
        const created = JSON.parse(last.newValues);
        const previous = await storage.deleteFinancialItem({ projectId, itemKey: created.itemKey });
        if (previous) {
          await storage.createCostItemChangeLog({
            costItemId: null,
            projectId,
            changedBy: userId,
            changedByName: await changedByName(userId),
            changeType: "item_deleted",
            changeSummary: `Undo: removed "${previous.itemName}" (reverted creation)`,
            previousValues: JSON.stringify({ itemKey: created.itemKey, ...previous, __undo: true }),
            newValues: JSON.stringify({ __undo: true }),
          });
        }
        return res.json({ message: "Creation undone", undone: last });
      }

      if (last.changeType === "item_deleted") {
        return res.status(400).json({ message: "Cannot undo deletion — please recreate the item manually" });
      }

      return res.status(400).json({ message: "Cannot undo this change" });
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
