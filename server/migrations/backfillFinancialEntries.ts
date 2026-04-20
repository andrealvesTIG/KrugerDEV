import { db } from "../db";
import { sql } from "drizzle-orm";
import { financialEntries, type InsertFinancialEntry } from "@shared/schema";
import { buildFiscalMonths, normalizeFiscalYearStartMonth } from "@shared/lib/fiscalCalendar";

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

  // Pull every legacy cost_items row, joining to organizations so we can
  // translate the FY-relative monthly columns (M1..M12) into calendar
  // (year, month) when inserting into financial_entries (Task #36).
  const legacy = await db.execute(sql`
    SELECT
      ci.id, ci.project_id, ci.fiscal_year, ci.name, ci.wbs, ci.comments,
      ci.financial_view, ci.cost_category, ci.cost_specification, ci.category,
      ci.sort_order, ci.is_demo,
      o.fiscal_year_start_month AS fy_start,
      ci.aop_m1, ci.aop_m2, ci.aop_m3, ci.aop_m4, ci.aop_m5, ci.aop_m6,
      ci.aop_m7, ci.aop_m8, ci.aop_m9, ci.aop_m10, ci.aop_m11, ci.aop_m12,
      ci.fcst_m1, ci.fcst_m2, ci.fcst_m3, ci.fcst_m4, ci.fcst_m5, ci.fcst_m6,
      ci.fcst_m7, ci.fcst_m8, ci.fcst_m9, ci.fcst_m10, ci.fcst_m11, ci.fcst_m12,
      ci.act_m1, ci.act_m2, ci.act_m3, ci.act_m4, ci.act_m5, ci.act_m6,
      ci.act_m7, ci.act_m8, ci.act_m9, ci.act_m10, ci.act_m11, ci.act_m12
    FROM cost_items ci
    INNER JOIN projects p ON p.id = ci.project_id
    INNER JOIN organizations o ON o.id = p.organization_id
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

    // Translate the legacy FY-relative monthly columns (M1..M12) into
    // calendar (year, month) pairs using the project's org fiscal start month
    // so the new normalized rows are calendar-anchored from day one.
    const fyStart = normalizeFiscalYearStartMonth(row.fy_start);
    const calPairs = buildFiscalMonths(row.fiscal_year, fyStart);

    const rows: InsertFinancialEntry[] = [];
    for (const { scenario, prefix } of SCENARIOS) {
      for (let m = 1; m <= 12; m++) {
        const amount = Number(row[`${prefix}${m}`] ?? 0) || 0;
        const cal = calPairs[m - 1];
        rows.push({
          projectId: row.project_id,
          fiscalYear: cal.year,
          scenario,
          month: cal.month,
          amount,
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
        });
      }
    }

    if (rows.length === 0) continue;

    await db.insert(financialEntries).values(rows).onConflictDoNothing();
    migrated++;
  }

  return { migrated, skipped };
}
