import { db } from "../db";
import { sql } from "drizzle-orm";
import { financialEntries, type InsertFinancialEntry } from "@shared/schema";

/**
 * One-shot migration: copies the legacy denormalized monthly columns from
 * `cost_items` (aopM1..aopM12, fcstM1..fcstM12, actM1..actM12) into the new
 * `financial_entries` fact table.
 *
 * Idempotent: for every legacy `cost_items` row we generate a deterministic
 * `itemKey` of the form `legacy-<id>`. If at least one financial_entries row
 * with that itemKey already exists we skip the row.
 *
 * Safe to run on every boot.
 */
export async function backfillFinancialEntries(): Promise<{ migrated: number; skipped: number }> {
  // Confirm both tables exist before doing anything.
  const tables = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('cost_items', 'financial_entries')
  `);
  const present = new Set((tables.rows as Array<{ table_name: string }>).map(r => r.table_name));
  if (!present.has("cost_items") || !present.has("financial_entries")) {
    return { migrated: 0, skipped: 0 };
  }

  // Pull every legacy cost_items row.
  const legacy = await db.execute(sql`
    SELECT
      id, project_id, fiscal_year, name, wbs, comments,
      financial_view, cost_category, cost_specification, category, sort_order, is_demo,
      aop_m1, aop_m2, aop_m3, aop_m4, aop_m5, aop_m6,
      aop_m7, aop_m8, aop_m9, aop_m10, aop_m11, aop_m12,
      fcst_m1, fcst_m2, fcst_m3, fcst_m4, fcst_m5, fcst_m6,
      fcst_m7, fcst_m8, fcst_m9, fcst_m10, fcst_m11, fcst_m12,
      act_m1, act_m2, act_m3, act_m4, act_m5, act_m6,
      act_m7, act_m8, act_m9, act_m10, act_m11, act_m12
    FROM cost_items
  `);

  const SCENARIOS: Array<{ scenario: "aop" | "fcst" | "act"; prefix: string }> = [
    { scenario: "aop", prefix: "aop_m" },
    { scenario: "fcst", prefix: "fcst_m" },
    { scenario: "act", prefix: "act_m" },
  ];

  let migrated = 0;
  let skipped = 0;

  for (const row of legacy.rows as any[]) {
    const itemKey = `legacy-${row.id}`;

    // Idempotency: a healthy migrated item has exactly 36 cells. Skip only when
    // that's the case. If a partial set exists we wipe and re-insert so we never
    // leave a logical item half-materialized.
    const countRes = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM financial_entries
      WHERE item_key = ${itemKey} AND project_id = ${row.project_id}
    `);
    const existingCount = Number((countRes.rows[0] as any)?.count ?? 0);
    if (existingCount === 36) {
      skipped++;
      continue;
    }
    if (existingCount > 0) {
      await db.execute(sql`
        DELETE FROM financial_entries
        WHERE item_key = ${itemKey} AND project_id = ${row.project_id}
      `);
    }

    const rows: InsertFinancialEntry[] = [];
    for (const { scenario, prefix } of SCENARIOS) {
      for (let m = 1; m <= 12; m++) {
        const amount = Number(row[`${prefix}${m}`] ?? 0) || 0;
        rows.push({
          projectId: row.project_id,
          fiscalYear: row.fiscal_year,
          scenario,
          month: m,
          amount: String(amount),
          itemKey,
          itemName: row.name ?? "Unnamed",
          financialView: row.financial_view ?? null,
          costCategory: row.cost_category ?? null,
          costSpecification: row.cost_specification ?? null,
          category: row.category ?? null,
          wbs: row.wbs ?? null,
          comments: row.comments ?? null,
          sortOrder: row.sort_order ?? 0,
          isDemo: row.is_demo ?? false,
        } as unknown as InsertFinancialEntry);
      }
    }

    if (rows.length === 0) continue;

    await db.insert(financialEntries).values(rows).onConflictDoNothing();
    migrated++;
  }

  return { migrated, skipped };
}
