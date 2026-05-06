import { db } from "../db";
import {
  projectFinancials, intakeFinancials, costItems, costItemChangeLogs, financialEntries,
  financialLockdowns,
  projectInvoices, invoiceNotes,
  projects, organizations,
  type ProjectFinancial, type InsertProjectFinancial, type UpdateProjectFinancialRequest,
  type IntakeFinancial, type InsertIntakeFinancial, type UpdateIntakeFinancialRequest,
  type CostItem, type InsertCostItem, type UpdateCostItemRequest,
  type CostItemChangeLog, type InsertCostItemChangeLog,
  type FinancialEntry, type InsertFinancialEntry,
  type FinancialLockdown,
  type ProjectInvoice, type InsertProjectInvoice,
  type InvoiceNote, type InsertInvoiceNote,
} from "@shared/schema";
import {
  billingTransactions,
  type BillingTransaction, type InsertBillingTransaction,
} from "@shared/models/billing";
import { eq, and, or, desc, isNull, inArray, sql } from "drizzle-orm";
import {
  buildFiscalMonths,
  calendarToFiscalSlot,
  fiscalSlotToCalendar,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";

// ---------- calendar-anchored helpers (Task #36) ----------
// `financial_entries` stores CALENDAR (year, month) so values stay anchored to
// the original calendar month even when the org admin changes
// `organizations.fiscalYearStartMonth`. The API surface still uses the
// FY-relative pair (fiscalYear=label, month=1..12 monthNum) for backward
// compatibility — this storage layer translates at the boundary.

async function getProjectFyStart(projectId: number): Promise<number> {
  const [row] = await db
    .select({ start: organizations.fiscalYearStartMonth })
    .from(projects)
    .innerJoin(organizations, eq(organizations.id, projects.organizationId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return normalizeFiscalYearStartMonth(row?.start);
}

/** All 12 (calendarYear, calendarMonth) pairs that make up the given FY label. */
function fyCalendarPairs(fyLabel: number, fyStart: number): Array<{ year: number; month: number }> {
  return buildFiscalMonths(fyLabel, fyStart).map(m => ({ year: m.year, month: m.month }));
}

/** Build a drizzle WHERE that matches any of the 12 (year, month) pairs of an FY. */
function fyCalendarWhere(fyLabel: number, fyStart: number) {
  const pairs = fyCalendarPairs(fyLabel, fyStart);
  return or(
    ...pairs.map(p => and(
      eq(financialEntries.fiscalYear, p.year),
      eq(financialEntries.month, p.month),
    )),
  );
}

/** Re-label rows from calendar (year, month) back to (fyLabel, monthNum). */
function relabelRow(row: FinancialEntry, fyStart: number): FinancialEntry {
  const slot = calendarToFiscalSlot(row.fiscalYear, row.month, fyStart);
  return { ...row, fiscalYear: slot.fiscalYear, month: slot.monthNum };
}

// Financial type keys are now org-configurable strings. The legacy three
// (aop/fcst/act) are guaranteed to exist on every org so historical data and
// audit-log entries stay valid even when the admin renames or disables them.
// (The DB column on `financial_entries` is still named `scenario` for back-compat.)
export type FinancialType = string;
const DEFAULT_FAN_OUT_TYPES = ["aop", "fcst", "act"];

export async function getProjectFinancials(projectId: number): Promise<ProjectFinancial[]> {
  return await db.select().from(projectFinancials)
    .where(eq(projectFinancials.projectId, projectId))
    .orderBy(projectFinancials.fiscalYear, projectFinancials.category, projectFinancials.lineItem);
}

export async function getFinancialBudgetTotals(projectIds: number[]): Promise<Record<number, number>> {
  if (projectIds.length === 0) return {};
  // Source the per-project Total Budget from the All-Years AOP scenario in
  // `financial_entries` so the Summary tab matches the "PORTFOLIO TOTAL — ALL
  // YEARS / AOP" chip on the Financials tab. Falls back to the legacy
  // `project_financials.budget_amount` sum when a project has no AOP entries
  // yet (e.g. a freshly-created project that still uses the line-item budget).
  const aopRows = await db
    .select({
      projectId: financialEntries.projectId,
      total: sql<string>`coalesce(sum(${financialEntries.amount}), 0)`,
    })
    .from(financialEntries)
    .where(and(
      inArray(financialEntries.projectId, projectIds),
      eq(financialEntries.scenario, "aop"),
    ))
    .groupBy(financialEntries.projectId);

  const result: Record<number, number> = {};
  for (const row of aopRows) {
    const total = Number(row.total);
    if (total !== 0) result[row.projectId] = total;
  }

  const missing = projectIds.filter(id => !(id in result));
  if (missing.length > 0) {
    const legacyRows = await db
      .select({
        projectId: projectFinancials.projectId,
        total: sql<string>`coalesce(sum(${projectFinancials.budgetAmount}), 0)`,
      })
      .from(projectFinancials)
      .where(inArray(projectFinancials.projectId, missing))
      .groupBy(projectFinancials.projectId);
    for (const row of legacyRows) {
      const total = Number(row.total);
      if (total !== 0) result[row.projectId] = total;
    }
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

// ===================== INTAKE FINANCIALS =====================

export async function getIntakeFinancials(intakeId: number): Promise<IntakeFinancial[]> {
  return await db.select().from(intakeFinancials)
    .where(eq(intakeFinancials.intakeId, intakeId))
    .orderBy(intakeFinancials.fiscalYear);
}

export async function getIntakeFinancial(id: number): Promise<IntakeFinancial | undefined> {
  const [row] = await db.select().from(intakeFinancials).where(eq(intakeFinancials.id, id));
  return row;
}

export async function createIntakeFinancial(financial: InsertIntakeFinancial): Promise<IntakeFinancial> {
  const [row] = await db.insert(intakeFinancials).values(financial).returning();
  return row;
}

export async function updateIntakeFinancial(id: number, updates: UpdateIntakeFinancialRequest): Promise<IntakeFinancial> {
  const { intakeId: _ignoredIntakeId, ...safeUpdates } = updates as UpdateIntakeFinancialRequest & { intakeId?: number };
  const [row] = await db.update(intakeFinancials)
    .set({ ...safeUpdates, updatedAt: new Date() })
    .where(eq(intakeFinancials.id, id))
    .returning();
  return row;
}

export async function deleteIntakeFinancial(id: number): Promise<void> {
  await db.delete(intakeFinancials).where(eq(intakeFinancials.id, id));
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

export async function createCostItemChangeLog(data: InsertCostItemChangeLog): Promise<CostItemChangeLog> {
  const [created] = await db.insert(costItemChangeLogs).values(data).returning();
  return created;
}

/**
 * Set the `undone` flag on a single change-log row. Used by the undo/redo flow
 * to flip a change between the active stack and the redo stack without ever
 * losing the original payload.
 */
export async function setChangeLogUndone(id: number, undone: boolean): Promise<void> {
  await db.update(costItemChangeLogs)
    .set({ undone })
    .where(eq(costItemChangeLogs.id, id));
}

/**
 * Truncate the redo stack for a project: hard-delete every change-log row
 * marked `undone=true`. Called whenever the user makes a fresh edit (cell
 * change, item create / update / delete) so that classic Excel-style behavior
 * applies — once you do something new after an undo, you can't redo the old
 * branch.
 */
export async function clearRedoStack(projectId: number): Promise<number> {
  const deleted = await db.delete(costItemChangeLogs)
    .where(and(
      eq(costItemChangeLogs.projectId, projectId),
      eq(costItemChangeLogs.undone, true),
    ))
    .returning({ id: costItemChangeLogs.id });
  return deleted.length;
}

// ===================== FINANCIAL ENTRIES (normalized fact table) =====================

export async function getFinancialEntries(
  projectId: number,
  fiscalYear?: number,
): Promise<FinancialEntry[]> {
  const fyStart = await getProjectFyStart(projectId);
  const where = fiscalYear !== undefined
    ? and(eq(financialEntries.projectId, projectId), fyCalendarWhere(fiscalYear, fyStart))
    : eq(financialEntries.projectId, projectId);
  const rows = await db.select().from(financialEntries)
    .where(where)
    .orderBy(financialEntries.sortOrder, financialEntries.itemKey, financialEntries.scenario, financialEntries.fiscalYear, financialEntries.month);
  // Re-label calendar (year, month) → FY-relative (label, monthNum) so the
  // API surface and client code keep using the existing semantics.
  return rows.map(r => relabelRow(r, fyStart));
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
 * Insert all 36 zero-amount cells (3 financial types × 12 months) for a brand-new
 * logical item. Returns the itemKey created. If `itemKey` is provided, uses that
 * one; else generates a fresh uuid-style key.
 */
export async function createFinancialItem(args: {
  projectId: number;
  fiscalYear: number;
  itemKey?: string;
  dimensions: FinancialItemDimensions;
  types?: string[];
}): Promise<string> {
  const itemKey = args.itemKey ?? `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const typeKeys = args.types && args.types.length > 0 ? args.types : DEFAULT_FAN_OUT_TYPES;
  const fyStart = await getProjectFyStart(args.projectId);
  const calPairs = fyCalendarPairs(args.fiscalYear, fyStart);
  const rows: InsertFinancialEntry[] = [];
  for (const typeKey of typeKeys) {
    for (const { year: calYear, month: calMonth } of calPairs) {
      rows.push({
        projectId: args.projectId,
        fiscalYear: calYear,
        scenario: typeKey,
        month: calMonth,
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
 * given financial type key. Used when an admin adds a brand-new type in Org
 * Settings so the grid has cells to edit immediately. Idempotent via the unique
 * cell index.
 */
export async function backfillTypeCellsForOrg(args: {
  organizationId: number;
  typeKey: string;
}): Promise<{ inserted: number }> {
  // Storage is calendar-anchored (Task #36): mirror the EXACT (calYear,
  // calMonth) set already present for each (project, item) so the new type
  // covers the same months as existing types — no more, no less.
  const result = await db.execute(sql`
    INSERT INTO financial_entries (
      project_id, fiscal_year, scenario, month, amount,
      item_key, item_name, financial_view, cost_category, cost_specification,
      category, wbs, comments, sort_order, is_demo, created_at, updated_at
    )
    SELECT
      sub.project_id, sub.fiscal_year, ${args.typeKey}::text, sub.month, 0,
      sub.item_key, sub.item_name, sub.financial_view, sub.cost_category, sub.cost_specification,
      sub.category, sub.wbs, sub.comments, sub.sort_order, sub.is_demo, NOW(), NOW()
    FROM (
      SELECT DISTINCT ON (fe.project_id, fe.item_key, fe.fiscal_year, fe.month)
        fe.project_id, fe.fiscal_year, fe.item_key, fe.month, fe.item_name,
        fe.financial_view, fe.cost_category, fe.cost_specification,
        fe.category, fe.wbs, fe.comments, fe.sort_order, fe.is_demo
      FROM financial_entries fe
      INNER JOIN projects p ON p.id = fe.project_id
      WHERE p.organization_id = ${args.organizationId}
    ) sub
    ON CONFLICT (project_id, fiscal_year, item_key, scenario, month) DO NOTHING
  `);
  return { inserted: result.rowCount ?? 0 };
}

/**
 * Upsert a single cell. Returns { previous, next } amounts so callers can write a
 * cell-level change log entry.
 */
export async function upsertFinancialCell(args: {
  projectId: number;
  fiscalYear: number;
  itemKey: string;
  type: FinancialType;
  month: number;
  amount: number;
}): Promise<{ previous: number; next: number; entry: FinancialEntry }> {
  // Translate FY-relative (label, monthNum) → calendar (year, month) for
  // storage. The API surface keeps the FY-relative pair so callers don't
  // change.
  const fyStart = await getProjectFyStart(args.projectId);
  const target = fiscalSlotToCalendar(args.fiscalYear, args.month, fyStart);

  const [existing] = await db.select().from(financialEntries).where(and(
    eq(financialEntries.projectId, args.projectId),
    eq(financialEntries.fiscalYear, target.year),
    eq(financialEntries.itemKey, args.itemKey),
    eq(financialEntries.scenario, args.type),
    eq(financialEntries.month, target.month),
  ));
  const previous = existing ? Number(existing.amount) : 0;
  if (existing) {
    const [entry] = await db.update(financialEntries)
      .set({ amount: sql`${args.amount}`, updatedAt: new Date() })
      .where(eq(financialEntries.id, existing.id))
      .returning();
    return { previous, next: Number(entry.amount), entry: relabelRow(entry, fyStart) };
  }
  // Cell missing — insert one on the fly by copying dimensions from any
  // sibling row of the same (project, itemKey). This can happen when a type
  // is enabled in Org Settings after the item was created (no backfill) or
  // when a fan-out race skipped a cell. We also run a safety backfill so
  // every (calYear, calMonth) of the target FY exists for this type/item.
  const [sibling] = await db.select().from(financialEntries).where(and(
    eq(financialEntries.projectId, args.projectId),
    eq(financialEntries.itemKey, args.itemKey),
  )).limit(1);
  if (!sibling) {
    throw new Error(`Item not found for itemKey=${args.itemKey} in fiscal year ${args.fiscalYear}`);
  }
  // Fan out one cell per (calYear, calMonth) of the target FY for this type.
  const calPairs = fyCalendarPairs(args.fiscalYear, fyStart);
  const fanOutRows: InsertFinancialEntry[] = calPairs.map(p => ({
    projectId: args.projectId,
    fiscalYear: p.year,
    scenario: args.type,
    month: p.month,
    amount: (p.year === target.year && p.month === target.month) ? Number(args.amount) : 0,
    itemKey: args.itemKey,
    itemName: sibling.itemName,
    financialView: sibling.financialView,
    costCategory: sibling.costCategory,
    costSpecification: sibling.costSpecification,
    category: sibling.category,
    wbs: sibling.wbs,
    comments: sibling.comments,
    sortOrder: sibling.sortOrder,
    isDemo: sibling.isDemo,
  }));
  await db.insert(financialEntries).values(fanOutRows).onConflictDoNothing();
  // Re-read the target row (whether we just inserted it or a race beat us).
  const [entry] = await db.select().from(financialEntries).where(and(
    eq(financialEntries.projectId, args.projectId),
    eq(financialEntries.fiscalYear, target.year),
    eq(financialEntries.itemKey, args.itemKey),
    eq(financialEntries.scenario, args.type),
    eq(financialEntries.month, target.month),
  ));
  if (!entry) {
    throw new Error(`Failed to materialize cell for itemKey=${args.itemKey} type=${args.type} month=${args.month}`);
  }
  // If a concurrent request won the insert race with amount=0, apply our value.
  if (Number(entry.amount) !== args.amount) {
    const [updated] = await db.update(financialEntries)
      .set({ amount: sql`${args.amount}`, updatedAt: new Date() })
      .where(eq(financialEntries.id, entry.id))
      .returning();
    return { previous, next: Number(updated.amount), entry: relabelRow(updated, fyStart) };
  }
  return { previous, next: Number(entry.amount), entry: relabelRow(entry, fyStart) };
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
  const fyStart = args.fiscalYear !== undefined ? await getProjectFyStart(args.projectId) : 0;
  const baseWhere = args.fiscalYear !== undefined
    ? and(
        eq(financialEntries.projectId, args.projectId),
        eq(financialEntries.itemKey, args.itemKey),
        fyCalendarWhere(args.fiscalYear, fyStart),
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
  const fyStart = args.fiscalYear !== undefined ? await getProjectFyStart(args.projectId) : 0;
  const baseWhere = args.fiscalYear !== undefined
    ? and(
        eq(financialEntries.projectId, args.projectId),
        eq(financialEntries.itemKey, args.itemKey),
        fyCalendarWhere(args.fiscalYear, fyStart),
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

// ===================== FINANCIAL LOCKDOWNS =====================

export async function getFinancialLockdowns(organizationId: number): Promise<FinancialLockdown[]> {
  return await db.select().from(financialLockdowns)
    .where(eq(financialLockdowns.organizationId, organizationId))
    .orderBy(financialLockdowns.financialTypeKey, desc(financialLockdowns.lockdownDate));
}

export async function getFinancialLockdown(id: number): Promise<FinancialLockdown | undefined> {
  const [row] = await db.select().from(financialLockdowns).where(eq(financialLockdowns.id, id));
  return row;
}

export async function createFinancialLockdown(args: {
  organizationId: number;
  financialTypeKey: string;
  lockdownDate: string;
  note?: string | null;
  createdBy: string | null;
}): Promise<FinancialLockdown> {
  const [created] = await db.insert(financialLockdowns).values({
    organizationId: args.organizationId,
    financialTypeKey: args.financialTypeKey,
    lockdownDate: args.lockdownDate,
    note: args.note ?? null,
    createdBy: args.createdBy,
    updatedBy: args.createdBy,
  }).returning();
  return created;
}

export async function updateFinancialLockdown(id: number, updates: {
  financialTypeKey?: string;
  lockdownDate?: string;
  note?: string | null;
  updatedBy: string | null;
}): Promise<FinancialLockdown> {
  const set: {
    updatedAt: Date;
    updatedBy: string | null;
    financialTypeKey?: string;
    lockdownDate?: string;
    note?: string | null;
  } = {
    updatedAt: new Date(),
    updatedBy: updates.updatedBy,
  };
  if (updates.financialTypeKey !== undefined) set.financialTypeKey = updates.financialTypeKey;
  if (updates.lockdownDate !== undefined) set.lockdownDate = updates.lockdownDate;
  if (updates.note !== undefined) set.note = updates.note;
  const [updated] = await db.update(financialLockdowns)
    .set(set)
    .where(eq(financialLockdowns.id, id))
    .returning();
  return updated;
}

export async function deleteFinancialLockdown(id: number): Promise<void> {
  await db.delete(financialLockdowns).where(eq(financialLockdowns.id, id));
}

/**
 * Returns the most-recent lockdown date per financial type for an org.
 * Map keys are financial type keys; values are ISO date strings (YYYY-MM-DD).
 */
export async function getActiveLockdownMap(organizationId: number): Promise<Record<string, string>> {
  const rows = await db.select().from(financialLockdowns)
    .where(eq(financialLockdowns.organizationId, organizationId));
  const map: Record<string, string> = {};
  for (const row of rows) {
    const cur = map[row.financialTypeKey];
    if (!cur || row.lockdownDate > cur) map[row.financialTypeKey] = row.lockdownDate;
  }
  return map;
}
