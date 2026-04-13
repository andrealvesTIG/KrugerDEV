import type { Express } from "express";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNull, desc, asc, sql } from "drizzle-orm";
import { constructionInvoices, constructionInvoiceLineItems, changeOrders, projects } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  logUserActivity,
} from "./helpers";

const createInvoiceSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  contractAmount: z.string().nullable().optional(),
  totalAmount: z.string().nullable().optional(),
  previousBilled: z.string().nullable().optional(),
  currentBilled: z.string().nullable().optional(),
  balanceToFinish: z.string().nullable().optional(),
  retainage: z.string().nullable().optional(),
  status: z.enum(["Draft", "Submitted", "Under Review", "Approved", "Paid", "Rejected"]).default("Draft"),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  vendorName: z.string().max(500).nullable().optional(),
  vendorEmail: z.string().max(500).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  lineItems: z.array(z.object({
    costCode: z.string().max(100).nullable().optional(),
    description: z.string().min(1).max(1000),
    scheduledValue: z.string().nullable().optional(),
    previousBilled: z.string().nullable().optional(),
    currentBilled: z.string().nullable().optional(),
    balanceToFinish: z.string().nullable().optional(),
    percentComplete: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
}).strict();

const updateInvoiceSchema = createInvoiceSchema.partial().strict();

async function getNextInvoiceNumber(projectId: number): Promise<string> {
  const existing = await db.select({ invoiceNumber: constructionInvoices.invoiceNumber })
    .from(constructionInvoices)
    .where(eq(constructionInvoices.projectId, projectId))
    .orderBy(desc(constructionInvoices.id));

  let maxNum = 0;
  for (const inv of existing) {
    if (inv.invoiceNumber) {
      const match = inv.invoiceNumber.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }
  return `PAY-${String(maxNum + 1).padStart(3, "0")}`;
}

async function verifyProjectAccess(userId: string, projectId: number) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).then(r => r[0]);
  if (!project) return null;
  const hasAccess = await userHasOrgAccess(userId, project.organizationId);
  if (!hasAccess) return null;
  return project;
}

export function registerConstructionInvoiceRoutes(app: Express) {
  app.get("/api/projects/:projectId/construction-invoices", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const statusFilter = req.query.status as string | undefined;

      let conditions = [eq(constructionInvoices.projectId, projectId), isNull(constructionInvoices.deletedAt)];
      if (statusFilter) conditions.push(eq(constructionInvoices.status, statusFilter));

      const result = await db.select()
        .from(constructionInvoices)
        .where(and(...conditions))
        .orderBy(desc(constructionInvoices.createdAt));

      res.json(result);
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/construction-invoices/contract-summary", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const allInvoices = await db.select()
        .from(constructionInvoices)
        .where(and(eq(constructionInvoices.projectId, projectId), isNull(constructionInvoices.deletedAt)));

      const allChangeOrders = await db.select()
        .from(changeOrders)
        .where(and(
          eq(changeOrders.projectId, projectId),
          isNull(changeOrders.deletedAt),
        ));

      const originalContract = parseFloat(project.contractTotal || "0");
      const approvedChanges = allChangeOrders
        .filter(co => co.status === "Approved" && co.tier === "CO")
        .reduce((sum, co) => sum + parseFloat(co.costImpact || "0"), 0);
      const revisedContract = originalContract + approvedChanges;

      const totalBilled = allInvoices
        .filter(inv => ["Approved", "Paid"].includes(inv.status))
        .reduce((sum, inv) => sum + parseFloat(inv.currentBilled || "0"), 0);

      const totalPaid = allInvoices
        .filter(inv => inv.status === "Paid")
        .reduce((sum, inv) => sum + parseFloat(inv.paidAmount || inv.currentBilled || "0"), 0);

      const balanceRemaining = revisedContract - totalBilled;
      const pendingInvoices = allInvoices.filter(inv => ["Draft", "Submitted", "Under Review"].includes(inv.status)).length;
      const totalRetainage = allInvoices
        .reduce((sum, inv) => sum + parseFloat(inv.retainage || "0"), 0);

      res.json({
        originalContract,
        approvedChanges,
        revisedContract,
        totalBilled,
        totalPaid,
        balanceRemaining,
        totalRetainage,
        invoiceCount: allInvoices.length,
        pendingInvoices,
        paidInvoices: allInvoices.filter(inv => inv.status === "Paid").length,
        percentBilled: revisedContract > 0 ? Math.round((totalBilled / revisedContract) * 100) : 0,
      });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/construction-invoices/:invoiceId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const invoiceId = Number(req.params.invoiceId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [invoice] = await db.select()
        .from(constructionInvoices)
        .where(and(
          eq(constructionInvoices.id, invoiceId),
          eq(constructionInvoices.projectId, projectId),
          isNull(constructionInvoices.deletedAt),
        ));

      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const lineItemsList = await db.select()
        .from(constructionInvoiceLineItems)
        .where(eq(constructionInvoiceLineItems.invoiceId, invoiceId))
        .orderBy(asc(constructionInvoiceLineItems.sortOrder));

      res.json({ ...invoice, lineItems: lineItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post("/api/projects/:projectId/construction-invoices", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = createInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const { lineItems, ...data } = parsed.data;
      const invoiceNumber = await getNextInvoiceNumber(projectId);

      const [invoice] = await db.insert(constructionInvoices).values({
        ...data,
        projectId,
        invoiceNumber,
        createdBy: userId,
      }).returning();

      if (lineItems && lineItems.length > 0) {
        await db.insert(constructionInvoiceLineItems).values(
          lineItems.map((li, idx) => ({
            ...li,
            invoiceId: invoice.id,
            sortOrder: li.sortOrder ?? idx,
          }))
        );
      }

      logUserActivity(userId, "construction_invoice_created", projectId, { invoiceId: invoice.id });

      const lineItemsList = await db.select()
        .from(constructionInvoiceLineItems)
        .where(eq(constructionInvoiceLineItems.invoiceId, invoice.id))
        .orderBy(asc(constructionInvoiceLineItems.sortOrder));

      res.status(201).json({ ...invoice, lineItems: lineItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.patch("/api/projects/:projectId/construction-invoices/:invoiceId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const invoiceId = Number(req.params.invoiceId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const parsed = updateInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
      }

      const { lineItems, ...data } = parsed.data;

      const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
      if (data.status === "Submitted" && !data.periodFrom) {
        updateData.submittedDate = new Date().toISOString().split("T")[0];
      }
      if (data.status === "Approved") {
        updateData.approvedDate = new Date().toISOString().split("T")[0];
      }
      if (data.status === "Paid") {
        updateData.paidDate = new Date().toISOString().split("T")[0];
      }

      const [updated] = await db.update(constructionInvoices)
        .set(updateData)
        .where(and(
          eq(constructionInvoices.id, invoiceId),
          eq(constructionInvoices.projectId, projectId),
          isNull(constructionInvoices.deletedAt),
        ))
        .returning();

      if (!updated) return res.status(404).json({ message: "Invoice not found" });

      if (lineItems !== undefined) {
        await db.delete(constructionInvoiceLineItems).where(eq(constructionInvoiceLineItems.invoiceId, invoiceId));
        if (lineItems.length > 0) {
          await db.insert(constructionInvoiceLineItems).values(
            lineItems.map((li, idx) => ({
              ...li,
              invoiceId,
              sortOrder: li.sortOrder ?? idx,
            }))
          );
        }
      }

      logUserActivity(userId, "construction_invoice_updated", projectId, { invoiceId });

      const lineItemsList = await db.select()
        .from(constructionInvoiceLineItems)
        .where(eq(constructionInvoiceLineItems.invoiceId, invoiceId))
        .orderBy(asc(constructionInvoiceLineItems.sortOrder));

      res.json({ ...updated, lineItems: lineItemsList });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete("/api/projects/:projectId/construction-invoices/:invoiceId", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const invoiceId = Number(req.params.invoiceId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const [deleted] = await db.update(constructionInvoices)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(and(
          eq(constructionInvoices.id, invoiceId),
          eq(constructionInvoices.projectId, projectId),
          isNull(constructionInvoices.deletedAt),
        ))
        .returning();

      if (!deleted) return res.status(404).json({ message: "Invoice not found" });

      logUserActivity(userId, "construction_invoice_deleted", projectId, { invoiceId });
      res.json({ message: "Invoice deleted" });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
