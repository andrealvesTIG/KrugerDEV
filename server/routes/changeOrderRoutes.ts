import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, asc, sql } from "drizzle-orm";
import { changeOrders, changeOrderLineItems, projects, projectFinancials } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  logUserActivity,
} from "./helpers";
import { decimalString, sumDecimals, isZeroDecimal, BigNumber } from "@shared/lib/decimalString";
import { assertNotLocked } from "../services/financialLockdownService";
import { nextCounterValue, formatCounter } from "../services/financialCounterService";

// All money fields cross the wire as decimal strings. JS `number` inputs are
// REJECTED at the schema boundary — see shared/lib/decimalString.ts. All
// arithmetic uses BigNumber so 0.10 × 10 === 1.00 exactly.
const createChangeOrderSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  tier: z.enum(["PCO", "COR", "CO"]).default("PCO"),
  status: z.enum(["Draft", "Pending", "Under Review", "Approved", "Rejected", "Void"]).default("Draft"),
  reasonCode: z.string().max(200).nullable().optional(),
  costImpact: decimalString.nullable().optional(),
  scheduleImpactDays: z.number().int().nullable().optional(),
  originalContractAmount: decimalString.nullable().optional(),
  revisedContractAmount: decimalString.nullable().optional(),
  requestedBy: z.string().max(500).nullable().optional(),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  lineItems: z.array(z.object({
    costCode: z.string().max(100).nullable().optional(),
    description: z.string().min(1).max(1000),
    quantity: decimalString.nullable().optional(),
    unitPrice: decimalString.nullable().optional(),
    totalPrice: decimalString.nullable().optional(),
    category: z.string().max(200).nullable().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
}).strict();

const updateChangeOrderSchema = createChangeOrderSchema.partial().strict();

/**
 * Atomic per-(project, tier) numbering. Replaces the legacy
 * `SELECT max+1` read-then-write that produced duplicates under concurrency.
 * Combined with the partial unique index `change_orders_project_number_unique`,
 * duplicates are impossible.
 */
async function getNextChangeOrderNumber(projectId: number, tier: string): Promise<string> {
  const prefix = tier === "PCO" ? "PCO" : tier === "COR" ? "COR" : "CO";
  const next = await nextCounterValue(`co:${tier}`, projectId);
  return formatCounter(prefix, next);
}

async function verifyProjectAccess(userId: string, projectId: number) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
  if (!project) return null;
  const hasAccess = await userHasOrgAccess(userId, project.organizationId);
  if (!hasAccess) return null;
  return project;
}

// Money columns are stored as Postgres `numeric`. Drizzle's custom numeric
// type coerces to/from JS `number` (legacy), so we may receive a number from
// older rows. Coerce defensively to a decimal string for BigNumber math.
function toDecimal(v: unknown): BigNumber {
  if (v == null || v === "") return new BigNumber(0);
  return new BigNumber(typeof v === "number" ? String(v) : String(v));
}

export function registerChangeOrderRoutes(app: Express) {
  app.get("/api/projects/:projectId/change-orders", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const tierFilter = req.query.tier as string | undefined;
      const statusFilter = req.query.status as string | undefined;

      let conditions = [eq(changeOrders.projectId, projectId), isNull(changeOrders.deletedAt)];
      if (tierFilter) conditions.push(eq(changeOrders.tier, tierFilter));
      if (statusFilter) conditions.push(eq(changeOrders.status, statusFilter));

      const result = await db.select()
        .from(changeOrders)
        .where(and(...conditions))
        .orderBy(desc(changeOrders.createdAt));

      res.json(result);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/change-orders/summary", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const allOrders = await db.select()
        .from(changeOrders)
        .where(and(eq(changeOrders.projectId, projectId), isNull(changeOrders.deletedAt)));

      const totalCount = allOrders.length;
      const pcoCount = allOrders.filter(o => o.tier === "PCO").length;
      const corCount = allOrders.filter(o => o.tier === "COR").length;
      const coCount = allOrders.filter(o => o.tier === "CO").length;
      const approvedCount = allOrders.filter(o => o.status === "Approved").length;
      const pendingCount = allOrders.filter(o => ["Pending", "Under Review"].includes(o.status)).length;

      // Money rollups use BigNumber so e.g. summing ten `0.10` impacts gives
      // exactly `1.00`, not `0.9999999999999999`.
      const approvedCostImpact = sumDecimals(
        allOrders.filter(o => o.status === "Approved" && o.tier === "CO").map(o => String(o.costImpact ?? 0)),
      );
      const totalCostImpact = sumDecimals(allOrders.map(o => String(o.costImpact ?? 0)));

      const totalScheduleImpact = allOrders
        .filter(o => o.status === "Approved")
        .reduce((sum, o) => sum + (o.scheduleImpactDays || 0), 0);

      const originalContract = String(project.contractTotal ?? 0);
      const revisedContract = new BigNumber(originalContract).plus(approvedCostImpact).toFixed();

      res.json({
        totalCount,
        pcoCount,
        corCount,
        coCount,
        approvedCount,
        pendingCount,
        approvedCostImpact,
        totalCostImpact,
        totalScheduleImpact,
        originalContract,
        revisedContract,
      });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/change-orders/report", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const allOrders = await db.select()
        .from(changeOrders)
        .where(and(eq(changeOrders.projectId, projectId), isNull(changeOrders.deletedAt)))
        .orderBy(asc(changeOrders.tier), asc(changeOrders.changeOrderNumber));

      let lineItemsAll: (typeof changeOrderLineItems.$inferSelect)[] = [];
      if (allOrders.length > 0) {
        const orderIds = allOrders.map(o => o.id);
        lineItemsAll = await db.select()
          .from(changeOrderLineItems)
          .where(sql`${changeOrderLineItems.changeOrderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)})`);
      }

      const lineItemsByOrder = new Map<number, typeof lineItemsAll>();
      for (const li of lineItemsAll) {
        if (!lineItemsByOrder.has(li.changeOrderId)) lineItemsByOrder.set(li.changeOrderId, []);
        lineItemsByOrder.get(li.changeOrderId)!.push(li);
      }

      const tiers = ["PCO", "COR", "CO"] as const;
      const tierSummaries = tiers.map(tier => {
        const tierOrders = allOrders.filter(o => o.tier === tier);
        return {
          tier,
          total: tierOrders.length,
          approved: tierOrders.filter(o => o.status === "Approved").length,
          pending: tierOrders.filter(o => ["Pending", "Under Review"].includes(o.status)).length,
          rejected: tierOrders.filter(o => o.status === "Rejected").length,
          totalCostImpact: sumDecimals(tierOrders.map(o => String(o.costImpact ?? 0))),
          approvedCostImpact: sumDecimals(
            tierOrders.filter(o => o.status === "Approved").map(o => String(o.costImpact ?? 0)),
          ),
          totalScheduleImpact: tierOrders.filter(o => o.status === "Approved").reduce((sum, o) => sum + (o.scheduleImpactDays || 0), 0),
        };
      });

      const originalContract = String(project.contractTotal ?? 0);
      const totalApprovedImpact = sumDecimals(
        allOrders
          .filter(o => o.status === "Approved" && o.tier === "CO")
          .map(o => String(o.costImpact ?? 0)),
      );

      const reasonCodeBreakdown: Record<string, { count: number; totalCost: string }> = {};
      for (const o of allOrders) {
        const code = o.reasonCode || "Unspecified";
        if (!reasonCodeBreakdown[code]) reasonCodeBreakdown[code] = { count: 0, totalCost: "0" };
        reasonCodeBreakdown[code].count++;
        reasonCodeBreakdown[code].totalCost = new BigNumber(reasonCodeBreakdown[code].totalCost)
          .plus(toDecimal(o.costImpact))
          .toFixed();
      }

      const log = allOrders.map(o => ({
        id: o.id,
        number: o.changeOrderNumber,
        tier: o.tier,
        title: o.title,
        status: o.status,
        reasonCode: o.reasonCode,
        costImpact: o.costImpact,
        scheduleImpactDays: o.scheduleImpactDays,
        requestedBy: o.requestedBy,
        requestedDate: o.requestedDate,
        approvedBy: o.approvedBy,
        approvedDate: o.approvedDate,
        createdAt: o.createdAt,
        lineItems: lineItemsByOrder.get(o.id) || [],
      }));

      res.json({
        projectName: project.name,
        originalContract,
        revisedContract: new BigNumber(originalContract).plus(totalApprovedImpact).toFixed(),
        netChange: totalApprovedImpact,
        tierSummaries,
        reasonCodeBreakdown,
        log,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/change-orders/:changeOrderId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const changeOrderId = Number(req.params.changeOrderId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [co] = await db.select()
        .from(changeOrders)
        .where(and(
          eq(changeOrders.id, changeOrderId),
          eq(changeOrders.projectId, projectId),
          isNull(changeOrders.deletedAt),
        ));

      if (!co) return res.status(404).json({ message: "Change order not found" });

      const lineItemsList = await db.select()
        .from(changeOrderLineItems)
        .where(eq(changeOrderLineItems.changeOrderId, changeOrderId))
        .orderBy(asc(changeOrderLineItems.sortOrder));

      res.json({ ...co, lineItems: lineItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/change-orders", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = createChangeOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const { lineItems, ...data } = parsed.data;
      const changeOrderNumber = await getNextChangeOrderNumber(projectId, data.tier || "PCO");

      const [co] = await db.insert(changeOrders).values({
        ...data,
        projectId,
        changeOrderNumber,
        createdBy: userId,
      } as any).returning();

      if (lineItems && lineItems.length > 0) {
        await db.insert(changeOrderLineItems).values(
          lineItems.map((li, idx) => ({
            ...li,
            changeOrderId: co.id,
            sortOrder: li.sortOrder ?? idx,
          })) as any,
        );
      }

      logUserActivity(userId, "change_order_created", "change_order", co.id, { projectId, tier: co.tier });

      const lineItemsList = await db.select()
        .from(changeOrderLineItems)
        .where(eq(changeOrderLineItems.changeOrderId, co.id))
        .orderBy(asc(changeOrderLineItems.sortOrder));

      res.status(201).json({ ...co, lineItems: lineItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.patch("/api/projects/:projectId/change-orders/:changeOrderId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const changeOrderId = Number(req.params.changeOrderId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = updateChangeOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const { lineItems, ...data } = parsed.data;

      if (data.status === "Approved") {
        return res.status(400).json({ message: "Use the /approve endpoint to approve change orders" });
      }

      const [updated] = await db.update(changeOrders)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(
          eq(changeOrders.id, changeOrderId),
          eq(changeOrders.projectId, projectId),
          isNull(changeOrders.deletedAt),
        ))
        .returning();

      if (!updated) return res.status(404).json({ message: "Change order not found" });

      if (lineItems !== undefined) {
        await db.delete(changeOrderLineItems).where(eq(changeOrderLineItems.changeOrderId, changeOrderId));
        if (lineItems.length > 0) {
          await db.insert(changeOrderLineItems).values(
            lineItems.map((li, idx) => ({
              ...li,
              changeOrderId,
              sortOrder: li.sortOrder ?? idx,
            })) as any,
          );
        }
      }

      logUserActivity(userId, "change_order_updated", "change_order", changeOrderId, { projectId });

      const lineItemsList = await db.select()
        .from(changeOrderLineItems)
        .where(eq(changeOrderLineItems.changeOrderId, changeOrderId))
        .orderBy(asc(changeOrderLineItems.sortOrder));

      res.json({ ...updated, lineItems: lineItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/change-orders/:changeOrderId/promote", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const changeOrderId = Number(req.params.changeOrderId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [existing] = await db.select()
        .from(changeOrders)
        .where(and(
          eq(changeOrders.id, changeOrderId),
          eq(changeOrders.projectId, projectId),
          isNull(changeOrders.deletedAt),
        ));

      if (!existing) return res.status(404).json({ message: "Change order not found" });

      const tierMap: Record<string, string> = { PCO: "COR", COR: "CO" };
      const nextTier = tierMap[existing.tier];
      if (!nextTier) {
        return res.status(400).json({ message: "Change order is already at the highest tier (CO)" });
      }

      const newNumber = await getNextChangeOrderNumber(projectId, nextTier);

      const [promoted] = await db.insert(changeOrders).values({
        projectId,
        changeOrderNumber: newNumber,
        title: existing.title,
        description: existing.description,
        tier: nextTier,
        status: "Draft",
        reasonCode: existing.reasonCode,
        costImpact: existing.costImpact,
        scheduleImpactDays: existing.scheduleImpactDays,
        originalContractAmount: existing.originalContractAmount,
        revisedContractAmount: existing.revisedContractAmount,
        requestedBy: existing.requestedBy,
        requestedDate: existing.requestedDate,
        notes: existing.notes,
        promotedFrom: existing.id,
        createdBy: userId,
      } as any).returning();

      const existingLineItems = await db.select()
        .from(changeOrderLineItems)
        .where(eq(changeOrderLineItems.changeOrderId, changeOrderId));

      if (existingLineItems.length > 0) {
        await db.insert(changeOrderLineItems).values(
          existingLineItems.map((li, idx) => ({
            changeOrderId: promoted.id,
            costCode: li.costCode,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            totalPrice: li.totalPrice,
            category: li.category,
            sortOrder: li.sortOrder ?? idx,
          })) as any,
        );
      }

      await db.update(changeOrders)
        .set({ status: "Void", updatedAt: new Date() })
        .where(eq(changeOrders.id, changeOrderId));

      logUserActivity(userId, "change_order_promoted", "change_order", promoted.id, {
        projectId,
        from: existing.tier,
        to: nextTier,
        originalId: changeOrderId,
      });

      const lineItemsList = await db.select()
        .from(changeOrderLineItems)
        .where(eq(changeOrderLineItems.changeOrderId, promoted.id))
        .orderBy(asc(changeOrderLineItems.sortOrder));

      res.status(201).json({ ...promoted, lineItems: lineItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/change-orders/:changeOrderId/approve", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const changeOrderId = Number(req.params.changeOrderId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [existing] = await db.select()
        .from(changeOrders)
        .where(and(
          eq(changeOrders.id, changeOrderId),
          eq(changeOrders.projectId, projectId),
          isNull(changeOrders.deletedAt),
        ));

      if (!existing) return res.status(404).json({ message: "Change order not found" });
      if (existing.status === "Approved") {
        return res.status(400).json({ message: "Change order is already approved" });
      }

      const now = new Date();
      const approvedByName = req.body.approvedBy || "System";

      // Lockdown enforcement: a CO approval that writes into project_financials
      // for a closed calendar month must be rejected with 409, otherwise a
      // post-close approval would mutate already-locked totals.
      const costImpactBn = toDecimal(existing.costImpact);
      if (existing.tier === "CO" && !costImpactBn.isZero() && project.organizationId) {
        const violation = await assertNotLocked({
          organizationId: project.organizationId,
          projectId,
          calendarYear: now.getUTCFullYear(),
          calendarMonth: now.getUTCMonth() + 1,
        });
        if (violation) {
          return res.status(409).json({ code: "LOCKDOWN", ...violation });
        }
      }

      const [approved] = await db.update(changeOrders)
        .set({
          status: "Approved",
          approvedBy: approvedByName,
          approvedDate: now.toISOString().split("T")[0],
          updatedAt: now,
        })
        .where(and(
          eq(changeOrders.id, changeOrderId),
          eq(changeOrders.projectId, projectId),
        ))
        .returning();

      if (existing.tier === "CO" && !costImpactBn.isZero()) {
        const costImpactStr = costImpactBn.toFixed();
        await db.insert(projectFinancials).values({
          projectId,
          category: "CapEx",
          lineItem: `CO-${existing.changeOrderNumber || changeOrderId}: ${existing.title}`,
          description: `Approved change order (${existing.tier}) cost impact`,
          fiscalYear: now.getFullYear(),
          fiscalPeriod: `Q${Math.ceil((now.getMonth() + 1) / 3)}`,
          budgetAmount: costImpactStr as any,
          plannedAmount: costImpactStr as any,
          actualAmount: costImpactStr as any,
        });
      }

      logUserActivity(userId, "change_order_approved", "change_order", changeOrderId, { projectId, tier: existing.tier });

      res.json(approved);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete("/api/projects/:projectId/change-orders/:changeOrderId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const changeOrderId = Number(req.params.changeOrderId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [deleted] = await db.update(changeOrders)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(and(
          eq(changeOrders.id, changeOrderId),
          eq(changeOrders.projectId, projectId),
          isNull(changeOrders.deletedAt),
        ))
        .returning();

      if (!deleted) return res.status(404).json({ message: "Change order not found" });

      logUserActivity(userId, "change_order_deleted", "change_order", changeOrderId, { projectId });
      res.json({ message: "Change order deleted" });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
