import { db } from "../db";
import {
  projectFinancials, costItems, costItemChangeLogs, financialEntries,
  projectInvoices, invoiceNotes,
  type ProjectFinancial, type InsertProjectFinancial, type UpdateProjectFinancialRequest,
  type CostItem, type InsertCostItem, type UpdateCostItemRequest,
  type CostItemChangeLog, type InsertCostItemChangeLog,
  type FinancialEntry, type InsertFinancialEntry,
  type ProjectInvoice, type InsertProjectInvoice,
  type InvoiceNote, type InsertInvoiceNote,
} from "@shared/schema";
import {
  billingTransactions,
  type BillingTransaction, type InsertBillingTransaction,
} from "@shared/models/billing";
import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";

// Scenario keys are now org-configurable strings. The legacy three (aop/fcst/act)
// are guaranteed to exist on every org so historical data and audit-log entries
// stay valid even when the admin renames or disables them.
export type FinancialScenario = string;
const DEFAULT_FAN_OUT_SCENARIOS = ["aop", "fcst", "act"];

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

export async function getCostItemChangeLogs(projectId: number): Promise<CostItemChangeLog[]> {
  return await db.select().from(costItemChangeLogs)
    .where(eq(costItemChangeLogs.projectId, projectId))
    .orderBy(desc(costItemChangeLogs.changedAt));
}

export async function createCostItemChangeLog(data: InsertCostItemChangeLog): Promise<void> {
  await db.insert(costItemChangeLogs).values(data);
}

// ===================== FINANCIAL ENTRIES (normalized fact table) =====================

export async function getFinancialEntries(
  projectId: number,
  fiscalYear?: number,
): Promise<FinancialEntry[]> {
  const where = fiscalYear !== undefined
    ? and(eq(financialEntries.projectId, projectId), eq(financialEntries.fiscalYear, fiscalYear))
    : eq(financialEntries.projectId, projectId);
  return await db.select().from(financialEntries)
    .where(where)
    .orderBy(financialEntries.sortOrder, financialEntries.itemKey, financialEntries.scenario, financialEntries.month);
}

export interface FinancialItemDimensions {
  itemName: string;
  financialView?: string | null;
  costCategory?: string | null;
  costSpecification?: string | null;
  category?: string | null;
  wbs?: string | null;
  comments?: string | null;
  sortOrder?: number | null;
  isDemo?: boolean | null;
}

/**
 * Insert all 36 zero-amount cells (3 scenarios × 12 months) for a brand-new logical
 * item. Returns the itemKey created. If `itemKey` is provided, uses that one; else
 * generates a fresh uuid-style key.
 */
export async function createFinancialItem(args: {
  projectId: number;
  fiscalYear: number;
  itemKey?: string;
  dimensions: FinancialItemDimensions;
  scenarios?: string[];
}): Promise<string> {
  const itemKey = args.itemKey ?? `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const scenarios = args.scenarios && args.scenarios.length > 0 ? args.scenarios : DEFAULT_FAN_OUT_SCENARIOS;
  const rows: InsertFinancialEntry[] = [];
  for (const scenario of scenarios) {
    for (let month = 1; month <= 12; month++) {
      rows.push({
        projectId: args.projectId,
        fiscalYear: args.fiscalYear,
        scenario,
        month,
        amount: 0,
        itemKey,
        itemName: args.dimensions.itemName,
        financialView: args.dimensions.financialView ?? null,
        costCategory: args.dimensions.costCategory ?? null,
        costSpecification: args.dimensions.costSpecification ?? null,
        category: args.dimensions.category ?? null,
        wbs: args.dimensions.wbs ?? null,
        comments: args.dimensions.comments ?? null,
        sortOrder: args.dimensions.sortOrder ?? 0,
        isDemo: args.dimensions.isDemo ?? false,
      });
    }
  }
  await db.insert(financialEntries).values(rows).onConflictDoNothing();
  return itemKey;
}

/**
 * For every existing (project, fiscal_year, item_key) in `financial_entries` that
 * belongs to the given organization, materialize 12 zero-amount cells for the
 * given scenario key. Used when an admin adds a brand-new scenario in Org Settings
 * so the grid has cells to edit immediately. Idempotent via the unique cell index.
 */
export async function backfillScenarioCellsForOrg(args: {
  organizationId: number;
  scenarioKey: string;
}): Promise<{ inserted: number }> {
  const result = await db.execute(sql`
    INSERT INTO financial_entries (
      project_id, fiscal_year, scenario, month, amount,
      item_key, item_name, financial_view, cost_category, cost_specification,
      category, wbs, comments, sort_order, is_demo, created_at, updated_at
    )
    SELECT
      sub.project_id, sub.fiscal_year, ${args.scenarioKey}::text, m.month, 0,
      sub.item_key, sub.item_name, sub.financial_view, sub.cost_category, sub.cost_specification,
      sub.category, sub.wbs, sub.comments, sub.sort_order, sub.is_demo, NOW(), NOW()
    FROM (
      SELECT DISTINCT ON (fe.project_id, fe.fiscal_year, fe.item_key)
        fe.project_id, fe.fiscal_year, fe.item_key, fe.item_name,
        fe.financial_view, fe.cost_category, fe.cost_specification,
        fe.category, fe.wbs, fe.comments, fe.sort_order, fe.is_demo
      FROM financial_entries fe
      INNER JOIN projects p ON p.id = fe.project_id
      WHERE p.organization_id = ${args.organizationId}
    ) sub
    CROSS JOIN generate_series(1, 12) AS m(month)
    ON CONFLICT (project_id, fiscal_year, item_key, scenario, month) DO NOTHING
  `);
  return { inserted: (result as any).rowCount ?? 0 };
}

/**
 * Upsert a single cell. Returns { previous, next } amounts so callers can write a
 * cell-level change log entry.
 */
export async function upsertFinancialCell(args: {
  projectId: number;
  fiscalYear: number;
  itemKey: string;
  scenario: FinancialScenario;
  month: number;
  amount: number;
}): Promise<{ previous: number; next: number; entry: FinancialEntry }> {
  const [existing] = await db.select().from(financialEntries).where(and(
    eq(financialEntries.projectId, args.projectId),
    eq(financialEntries.fiscalYear, args.fiscalYear),
    eq(financialEntries.itemKey, args.itemKey),
    eq(financialEntries.scenario, args.scenario),
    eq(financialEntries.month, args.month),
  ));
  const previous = existing ? Number(existing.amount) : 0;
  if (!existing) {
    throw new Error(`Cell not found for itemKey=${args.itemKey} scenario=${args.scenario} month=${args.month}`);
  }
  const [entry] = await db.update(financialEntries)
    .set({ amount: sql`${args.amount}`, updatedAt: new Date() })
    .where(eq(financialEntries.id, existing.id))
    .returning();
  return { previous, next: Number(entry.amount), entry };
}

/**
 * Update dimension fields across every cell of a logical item. `fiscalYear` is
 * optional but recommended — without it, an itemKey that happens to be reused
 * across multiple years would update every year at once.
 */
export async function updateFinancialItemDimensions(args: {
  projectId: number;
  itemKey: string;
  fiscalYear?: number;
  dimensions: Partial<FinancialItemDimensions>;
}): Promise<{ updated: number; previous: FinancialItemDimensions | null }> {
  const baseWhere = args.fiscalYear !== undefined
    ? and(
        eq(financialEntries.projectId, args.projectId),
        eq(financialEntries.itemKey, args.itemKey),
        eq(financialEntries.fiscalYear, args.fiscalYear),
      )
    : and(
        eq(financialEntries.projectId, args.projectId),
        eq(financialEntries.itemKey, args.itemKey),
      );
  const [sample] = await db.select().from(financialEntries).where(baseWhere).limit(1);
  if (!sample) return { updated: 0, previous: null };

  const previous: FinancialItemDimensions = {
    itemName: sample.itemName,
    financialView: sample.financialView,
    costCategory: sample.costCategory,
    costSpecification: sample.costSpecification,
    category: sample.category,
    wbs: sample.wbs,
    comments: sample.comments,
    sortOrder: sample.sortOrder,
  };

  const set: any = { updatedAt: new Date() };
  if (args.dimensions.itemName !== undefined) set.itemName = args.dimensions.itemName;
  if (args.dimensions.financialView !== undefined) set.financialView = args.dimensions.financialView;
  if (args.dimensions.costCategory !== undefined) set.costCategory = args.dimensions.costCategory;
  if (args.dimensions.costSpecification !== undefined) set.costSpecification = args.dimensions.costSpecification;
  if (args.dimensions.category !== undefined) set.category = args.dimensions.category;
  if (args.dimensions.wbs !== undefined) set.wbs = args.dimensions.wbs;
  if (args.dimensions.comments !== undefined) set.comments = args.dimensions.comments;
  if (args.dimensions.sortOrder !== undefined) set.sortOrder = args.dimensions.sortOrder;

  const updated = await db.update(financialEntries)
    .set(set)
    .where(baseWhere)
    .returning();

  return { updated: updated.length, previous };
}

/** Delete every cell for a logical item; returns the deleted dimensions for logging. */
export async function deleteFinancialItem(args: {
  projectId: number;
  itemKey: string;
  fiscalYear?: number;
}): Promise<FinancialItemDimensions | null> {
  const baseWhere = args.fiscalYear !== undefined
    ? and(
        eq(financialEntries.projectId, args.projectId),
        eq(financialEntries.itemKey, args.itemKey),
        eq(financialEntries.fiscalYear, args.fiscalYear),
      )
    : and(
        eq(financialEntries.projectId, args.projectId),
        eq(financialEntries.itemKey, args.itemKey),
      );
  const [sample] = await db.select().from(financialEntries).where(baseWhere).limit(1);
  if (!sample) return null;
  await db.delete(financialEntries).where(baseWhere);
  return {
    itemName: sample.itemName,
    financialView: sample.financialView,
    costCategory: sample.costCategory,
    costSpecification: sample.costSpecification,
    category: sample.category,
    wbs: sample.wbs,
    comments: sample.comments,
    sortOrder: sample.sortOrder,
  };
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
