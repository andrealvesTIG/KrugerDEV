import { db } from "../db";
import {
  projectFinancials, costItems, projectInvoices, invoiceNotes,
  type ProjectFinancial, type InsertProjectFinancial, type UpdateProjectFinancialRequest,
  type CostItem, type InsertCostItem, type UpdateCostItemRequest,
  type ProjectInvoice, type InsertProjectInvoice,
  type InvoiceNote, type InsertInvoiceNote,
} from "@shared/schema";
import {
  billingTransactions,
  type BillingTransaction, type InsertBillingTransaction,
} from "@shared/models/billing";
import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";

export async function getProjectFinancials(projectId: number): Promise<ProjectFinancial[]> {
  return await db.select().from(projectFinancials)
    .where(eq(projectFinancials.projectId, projectId))
    .orderBy(projectFinancials.fiscalYear, projectFinancials.category, projectFinancials.lineItem);
}

export async function getFinancialBudgetTotals(projectIds: number[]): Promise<Record<number, number>> {
  if (projectIds.length === 0) return {};
  const rows = await db
    .select({
      projectId: projectFinancials.projectId,
      total: sql<string>`coalesce(sum(${projectFinancials.budgetAmount}), 0)`,
    })
    .from(projectFinancials)
    .where(inArray(projectFinancials.projectId, projectIds))
    .groupBy(projectFinancials.projectId);
  const result: Record<number, number> = {};
  for (const row of rows) {
    result[row.projectId] = Number(row.total);
  }
  return result;
}

export async function getProjectFinancial(id: number): Promise<ProjectFinancial | undefined> {
  const [financial] = await db.select().from(projectFinancials).where(eq(projectFinancials.id, id));
  return financial;
}

export async function createProjectFinancial(financial: InsertProjectFinancial): Promise<ProjectFinancial> {
  const [newFinancial] = await db.insert(projectFinancials).values(financial).returning();
  return newFinancial;
}

export async function updateProjectFinancial(id: number, updates: UpdateProjectFinancialRequest): Promise<ProjectFinancial> {
  const [updatedFinancial] = await db.update(projectFinancials)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectFinancials.id, id))
    .returning();
  return updatedFinancial;
}

export async function deleteProjectFinancial(id: number): Promise<void> {
  await db.delete(projectFinancials).where(eq(projectFinancials.id, id));
}

export async function getCostItems(projectId: number, fiscalYear?: number): Promise<CostItem[]> {
  if (fiscalYear) {
    return await db.select().from(costItems)
      .where(and(eq(costItems.projectId, projectId), eq(costItems.fiscalYear, fiscalYear)))
      .orderBy(costItems.sortOrder, costItems.id);
  }
  return await db.select().from(costItems)
    .where(eq(costItems.projectId, projectId))
    .orderBy(costItems.sortOrder, costItems.id);
}

export async function getCostItem(id: number): Promise<CostItem | undefined> {
  const [item] = await db.select().from(costItems).where(eq(costItems.id, id));
  return item;
}

export async function createCostItem(costItem: InsertCostItem): Promise<CostItem> {
  const [newItem] = await db.insert(costItems).values(costItem).returning();
  return newItem;
}

export async function updateCostItem(id: number, updates: UpdateCostItemRequest): Promise<CostItem> {
  const [updated] = await db.update(costItems)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(costItems.id, id))
    .returning();
  return updated;
}

export async function deleteCostItem(id: number): Promise<void> {
  await db.delete(costItems).where(eq(costItems.parentId, id));
  await db.delete(costItems).where(eq(costItems.id, id));
}

export async function getProjectInvoices(projectId: number): Promise<ProjectInvoice[]> {
  return await db.select().from(projectInvoices)
    .where(and(eq(projectInvoices.projectId, projectId), isNull(projectInvoices.deletedAt)))
    .orderBy(desc(projectInvoices.createdAt));
}

export async function getOrganizationInvoices(organizationId: number): Promise<ProjectInvoice[]> {
  return await db.select().from(projectInvoices)
    .where(and(eq(projectInvoices.organizationId, organizationId), isNull(projectInvoices.deletedAt)))
    .orderBy(desc(projectInvoices.createdAt));
}

export async function getProjectInvoice(id: number): Promise<ProjectInvoice | undefined> {
  const [invoice] = await db.select().from(projectInvoices).where(eq(projectInvoices.id, id));
  return invoice;
}

export async function getProjectInvoiceByExternalId(externalId: string, organizationId: number, source: string): Promise<ProjectInvoice | undefined> {
  const [invoice] = await db.select().from(projectInvoices)
    .where(and(
      eq(projectInvoices.externalId, externalId),
      eq(projectInvoices.organizationId, organizationId),
      eq(projectInvoices.source, source),
      isNull(projectInvoices.deletedAt)
    ));
  return invoice;
}

export async function createProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice> {
  const [created] = await db.insert(projectInvoices).values(invoice).returning();
  return created;
}

export async function upsertProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice> {
  if (invoice.externalId && invoice.organizationId && invoice.source) {
    const existing = await getProjectInvoiceByExternalId(
      invoice.externalId, invoice.organizationId, invoice.source
    );
    if (existing) {
      return await updateProjectInvoice(existing.id, invoice);
    }
  }
  return await createProjectInvoice(invoice);
}

export async function updateProjectInvoice(id: number, updates: Partial<InsertProjectInvoice>): Promise<ProjectInvoice> {
  const [updated] = await db.update(projectInvoices)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectInvoices.id, id))
    .returning();
  return updated;
}

export async function deleteProjectInvoice(id: number): Promise<void> {
  await db.update(projectInvoices)
    .set({ deletedAt: new Date() })
    .where(eq(projectInvoices.id, id));
}

export async function getInvoiceNotes(invoiceId: number): Promise<InvoiceNote[]> {
  return await db.select().from(invoiceNotes)
    .where(eq(invoiceNotes.invoiceId, invoiceId))
    .orderBy(desc(invoiceNotes.createdAt));
}

export async function createInvoiceNote(note: InsertInvoiceNote): Promise<InvoiceNote> {
  const [created] = await db.insert(invoiceNotes).values(note).returning();
  return created;
}

export async function getBillingTransactions(userId?: string, orgId?: number, limit: number = 50, offset: number = 0): Promise<BillingTransaction[]> {
  const conditions = [];
  if (userId) conditions.push(eq(billingTransactions.userId, userId));
  if (orgId) conditions.push(eq(billingTransactions.orgId, orgId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  return await db.select().from(billingTransactions)
    .where(whereClause)
    .orderBy(desc(billingTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getBillingTransaction(id: number): Promise<BillingTransaction | undefined> {
  const [transaction] = await db.select().from(billingTransactions).where(eq(billingTransactions.id, id));
  return transaction;
}

export async function createBillingTransaction(transaction: InsertBillingTransaction): Promise<BillingTransaction> {
  const [created] = await db.insert(billingTransactions).values(transaction).returning();
  return created;
}
