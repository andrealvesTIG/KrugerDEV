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
import { decimalString, sumDecimals, BigNumber } from "@shared/lib/decimalString";
import { nextCounterValue, formatCounter } from "../services/financialCounterService";

// All money values cross the wire as decimal strings to avoid float drift.
// JS `number` inputs are REJECTED at the boundary (see decimalString.ts).
const numericInput = decimalString;

const createInvoiceSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  contractAmount: numericInput.nullable().optional(),
  totalAmount: numericInput.nullable().optional(),
  previousBilled: numericInput.nullable().optional(),
  currentBilled: numericInput.nullable().optional(),
  balanceToFinish: numericInput.nullable().optional(),
  retainage: numericInput.nullable().optional(),
  status: z.enum(["Draft", "Submitted", "Under Review", "Approved", "Paid", "Rejected"]).default("Draft"),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  vendorName: z.string().max(500).nullable().optional(),
  vendorEmail: z.string().max(500).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  lineItems: z.array(z.object({
    costCode: z.string().max(100).nullable().optional(),
    description: z.string().min(1).max(1000),
    scheduledValue: numericInput.nullable().optional(),
    previousBilled: numericInput.nullable().optional(),
    currentBilled: numericInput.nullable().optional(),
    balanceToFinish: numericInput.nullable().optional(),
    percentComplete: numericInput.nullable().optional(),
    sortOrder: z.number().int().optional(),
  })).optional(),
}).strict();

const updateInvoiceSchema = createInvoiceSchema.partial().strict();

/**
 * Atomic per-project numbering. Backed by `financial_counters` +
 * `INSERT ... ON CONFLICT ... DO UPDATE RETURNING`, which Postgres serialises
 * on the conflicting row. The partial unique index on `(project_id,
 * invoice_number)` is a backstop against any future code path that bypasses
 * this helper.
 */
async function getNextInvoiceNumber(projectId: number): Promise<string> {
  const next = await nextCounterValue("invoice", projectId);
  return formatCounter("PAY", next);
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

      // Money rollups via BigNumber so float drift can't bleed into the
      // contract-vs-billed delta the construction PMs read every day.
      const originalContract = new BigNumber(String(project.contractTotal ?? 0));
      const approvedChanges = sumDecimals(
        allChangeOrders
          .filter(co => co.status === "Approved" && co.tier === "CO")
          .map(co => String(co.costImpact ?? 0)),
      );
      const revisedContract = originalContract.plus(approvedChanges);

      const totalBilled = new BigNumber(sumDecimals(
        allInvoices
          .filter(inv => ["Approved", "Paid"].includes(inv.status))
          .map(inv => String(inv.currentBilled ?? 0)),
      ));

      const totalPaid = sumDecimals(
        allInvoices
          .filter(inv => inv.status === "Paid")
          .map(inv => String(inv.paidAmount ?? inv.currentBilled ?? 0)),
      );

      const balanceRemaining = revisedContract.minus(totalBilled);
      const pendingInvoices = allInvoices.filter(inv => ["Draft", "Submitted", "Under Review"].includes(inv.status)).length;
      const totalRetainage = sumDecimals(allInvoices.map(inv => String(inv.retainage ?? 0)));

      res.json({
        originalContract: originalContract.toFixed(),
        approvedChanges,
        revisedContract: revisedContract.toFixed(),
        totalBilled: totalBilled.toFixed(),
        totalPaid,
        balanceRemaining: balanceRemaining.toFixed(),
        totalRetainage,
        invoiceCount: allInvoices.length,
        pendingInvoices,
        paidInvoices: allInvoices.filter(inv => inv.status === "Paid").length,
        percentBilled: revisedContract.gt(0)
          ? Math.round(totalBilled.div(revisedContract).times(100).toNumber())
          : 0,
      });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get("/api/projects/:projectId/construction-invoices/aging", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const allInvoices = await db.select()
        .from(constructionInvoices)
        .where(and(eq(constructionInvoices.projectId, projectId), isNull(constructionInvoices.deletedAt)))
        .orderBy(asc(constructionInvoices.submittedDate));

      const today = new Date();
      type AgingEntry = {
        id: number; invoiceNumber: string | null; title: string; vendorName: string | null;
        status: string; submittedDate: string | null; currentBilled: number | null;
        paidAmount: number | null; outstanding: number; daysOld: number;
      };
      const buckets: Record<string, AgingEntry[]> = { current: [], days1to30: [], days31to60: [], days61to90: [], over90: [] };
      const unpaid = allInvoices.filter(inv => inv.status !== "Paid" && inv.status !== "Draft" && inv.status !== "Void");

      for (const inv of unpaid) {
        const refDate = inv.submittedDate ? new Date(inv.submittedDate) : (inv.createdAt || today);
        const daysOld = Math.floor((today.getTime() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24));
        const outstanding = (inv.currentBilled ?? 0) - (inv.paidAmount ?? 0);
        const entry = {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          title: inv.title,
          vendorName: inv.vendorName,
          status: inv.status,
          submittedDate: inv.submittedDate,
          currentBilled: inv.currentBilled,
          paidAmount: inv.paidAmount,
          outstanding,
          daysOld,
        };

        if (daysOld <= 0) buckets.current.push(entry);
        else if (daysOld <= 30) buckets.days1to30.push(entry);
        else if (daysOld <= 60) buckets.days31to60.push(entry);
        else if (daysOld <= 90) buckets.days61to90.push(entry);
        else buckets.over90.push(entry);
      }

      const bucketTotals: Record<string, number> = {};
      for (const [key, entries] of Object.entries(buckets)) {
        bucketTotals[key] = entries.reduce((s, e) => s + e.outstanding, 0);
      }

      const totalOutstanding = Object.values(bucketTotals).reduce((s, v) => s + v, 0);
      const totalBilled = allInvoices.reduce((s, inv) => s + (inv.currentBilled ?? 0), 0);
      const totalPaid = allInvoices.filter(inv => inv.status === "Paid").reduce((s, inv) => s + (inv.paidAmount ?? inv.currentBilled ?? 0), 0);

      res.json({
        projectName: project.name,
        totalInvoices: allInvoices.length,
        totalBilled,
        totalPaid,
        totalOutstanding,
        buckets,
        bucketTotals,
        generatedAt: new Date().toISOString(),
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
      } as any).returning();

      if (lineItems && lineItems.length > 0) {
        await db.insert(constructionInvoiceLineItems).values(
          lineItems.map((li, idx) => ({
            ...li,
            invoiceId: invoice.id,
            sortOrder: li.sortOrder ?? idx,
          })) as any,
        );
      }

      logUserActivity(userId, "construction_invoice_created", "construction_invoice", invoice.id, { projectId });

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
            })) as any,
          );
        }
      }

      logUserActivity(userId, "construction_invoice_updated", "construction_invoice", invoiceId, { projectId });

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

  app.post("/api/projects/:projectId/construction-invoices/:invoiceId/record-payment", async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const invoiceId = Number(req.params.invoiceId);
      const project = await verifyProjectAccess(userId, projectId);
      if (!project) return res.status(403).json({ message: "Access denied" });

      const paymentSchema = z.object({
        paidAmount: numericInput,
        paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().max(10000).optional(),
      });

      const parsed = paymentSchema.parse(req.body);

      const [existing] = await db.select()
        .from(constructionInvoices)
        .where(and(
          eq(constructionInvoices.id, invoiceId),
          eq(constructionInvoices.projectId, projectId),
          isNull(constructionInvoices.deletedAt),
        ));

      if (!existing) return res.status(404).json({ message: "Invoice not found" });
      if (existing.status === "Paid") return res.status(400).json({ message: "Invoice is already fully paid" });
      if (existing.status === "Draft") return res.status(400).json({ message: "Cannot record payment on a draft invoice" });

      const now = new Date();
      const notesUpdate = parsed.notes
        ? (existing.notes ? `${existing.notes}\n\nPayment recorded: ${parsed.notes}` : `Payment recorded: ${parsed.notes}`)
        : existing.notes;

      const [updated] = await db.update(constructionInvoices)
        .set({
          paidAmount: parsed.paidAmount,
          paidDate: parsed.paidDate || now.toISOString().split("T")[0],
          status: "Paid" as const,
          updatedAt: now,
          notes: notesUpdate,
        } as any)
        .where(and(
          eq(constructionInvoices.id, invoiceId),
          eq(constructionInvoices.projectId, projectId),
        ))
        .returning();

      logUserActivity(userId, "construction_invoice_payment_recorded", "construction_invoice", invoiceId, {
        projectId,
        paidAmount: parsed.paidAmount,
        paidDate: parsed.paidDate || now.toISOString().split("T")[0],
      });

      res.json(updated);
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

      logUserActivity(userId, "construction_invoice_deleted", "construction_invoice", invoiceId, { projectId });
      res.json({ message: "Invoice deleted" });
    } catch (err: unknown) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
