import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, sql, asc } from "drizzle-orm";
import { changeOrders, changeOrderLineItems, projects, projectFinancials } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  logUserActivity,
} from "./helpers";

const createChangeOrderSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  tier: z.enum(["PCO", "COR", "CO"]).default("PCO"),
  status: z.enum(["Draft", "Pending", "Under Review", "Approved", "Rejected", "Void"]).default("Draft"),
  reasonCode: z.string().max(200).nullable().optional(),
  costImpact: z.string().nullable().optional(),
  scheduleImpactDays: z.number().int().nullable().optional(),
  originalContractAmount: z.string().nullable().optional(),
  revisedContractAmount: z.string().nullable().optional(),
  requestedBy: z.string().max(500).nullable().optional(),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  lineItems: z.array(z.object({
    costCode: z.string().max(100).nullable().optional(),
    description: z.string().min(1).max(1000),
    quantity: z.string().nullable().optional(),
    unitPrice: z.string().nullable().optional(),
    totalPrice: z.string().nullable().optional(),
    category: z.string().max(200).nullable().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
}).strict();

const updateChangeOrderSchema = createChangeOrderSchema.partial().strict();

async function getNextChangeOrderNumber(projectId: number, tier: string): Promise<string> {
  const prefix = tier === "PCO" ? "PCO" : tier === "COR" ? "COR" : "CO";
  const existing = await db.select({ changeOrderNumber: changeOrders.changeOrderNumber })
    .from(changeOrders)
    .where(and(
      eq(changeOrders.projectId, projectId),
      eq(changeOrders.tier, tier),
    ))
    .orderBy(desc(changeOrders.id));

  let maxNum = 0;
  for (const co of existing) {
    if (co.changeOrderNumber) {
      const match = co.changeOrderNumber.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
}

async function verifyProjectAccess(userId: string, projectId: number) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
  if (!project) return null;
  const hasAccess = await userHasOrgAccess(userId, project.organizationId);
  if (!hasAccess) return null;
  return project;
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

      const approvedCostImpact = allOrders
        .filter(o => o.status === "Approved")
        .reduce((sum, o) => sum + parseFloat(o.costImpact || "0"), 0);

      const totalCostImpact = allOrders
        .reduce((sum, o) => sum + parseFloat(o.costImpact || "0"), 0);

      const totalScheduleImpact = allOrders
        .filter(o => o.status === "Approved")
        .reduce((sum, o) => sum + (o.scheduleImpactDays || 0), 0);

      const originalContract = parseFloat(project.contractTotal || "0");
      const revisedContract = originalContract + approvedCostImpact;

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
      }).returning();

      if (lineItems && lineItems.length > 0) {
        await db.insert(changeOrderLineItems).values(
          lineItems.map((li, idx) => ({
            ...li,
            changeOrderId: co.id,
            sortOrder: li.sortOrder ?? idx,
          }))
        );
      }

      logUserActivity(userId, "change_order_created", projectId, { changeOrderId: co.id, tier: co.tier });

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

      const [updated] = await db.update(changeOrders)
        .set({ ...data, updatedAt: new Date() })
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
            }))
          );
        }
      }

      logUserActivity(userId, "change_order_updated", projectId, { changeOrderId });

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
      }).returning();

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
          }))
        );
      }

      await db.update(changeOrders)
        .set({ status: "Void", updatedAt: new Date() })
        .where(eq(changeOrders.id, changeOrderId));

      logUserActivity(userId, "change_order_promoted", projectId, {
        from: existing.tier,
        to: nextTier,
        originalId: changeOrderId,
        newId: promoted.id,
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

      if (existing.tier === "CO" && existing.costImpact) {
        const costImpact = parseFloat(existing.costImpact || "0");
        if (costImpact !== 0) {
          const currentContract = parseFloat(project.contractTotal || "0");
          const newContract = currentContract + costImpact;
          await db.update(projects)
            .set({ contractTotal: String(newContract), updatedAt: now })
            .where(eq(projects.id, projectId));
        }
      }

      logUserActivity(userId, "change_order_approved", projectId, { changeOrderId, tier: existing.tier });

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

      logUserActivity(userId, "change_order_deleted", projectId, { changeOrderId });
      res.json({ message: "Change order deleted" });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
