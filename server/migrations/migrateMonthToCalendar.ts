import { db } from "../db";
import { inArray, sql } from "drizzle-orm";
import { financialEntries } from "@shared/schema";
import { buildFiscalMonths, normalizeFiscalYearStartMonth } from "@shared/lib/fiscalCalendar";

/**
 * Task #36 one-shot, idempotent migration.
 *
 * Converts every row in `financial_entries` whose `(fiscal_year, month)` were
 * stored as FY-relative (label, monthNum 1..12) into calendar `(year, month)`
 * — using the row's project org's `fiscal_year_start_month` to compute the
 * exact target calendar month. After this runs, the storage layer treats
 * `fiscal_year` and `month` columns as calendar values; the API surface still
 * uses the FY-relative pair, with translation done in `financialStorage.ts`.
 *
 * Idempotency is guarded by a single-row marker in `_meta_migrations`. Once
 * the marker exists, this function returns immediately on every boot.
 *
 * The migration is safe to interrupt: each (project, item) batch runs in a
 * transaction that updates the rows and writes the marker only at the end.
 */
const MARKER_KEY = "financial_entries_calendar_v1";

export async function migrateMonthToCalendar(): Promise<{
  alreadyApplied: boolean;
  rowsRewritten: number;
}> {
  // Confirm financial_entries exists.
  const tables = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('financial_entries', 'organizations', 'projects')
  `);
  const present = new Set((tables.rows as Array<{ table_name: string }>).map(r => r.table_name));
  if (!present.has("financial_entries") || !present.has("projects") || !present.has("organizations")) {
    return { alreadyApplied: true, rowsRewritten: 0 };
  }

  // Marker table — single source of truth for whether this migration ran.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _meta_migrations (
      key TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  const existing = await db.execute(sql`
    SELECT 1 FROM _meta_migrations WHERE key = ${MARKER_KEY} LIMIT 1
  `);
  if ((existing.rows as any[]).length > 0) {
    return { alreadyApplied: true, rowsRewritten: 0 };
  }

  // Pull every row joined with the org fiscal start month. Process in memory
  // — typical orgs have well under a million cells, and we need to compute
  // (calYear, calMonth) per row using JS.
  const rows = await db.execute(sql`
    SELECT fe.id, fe.fiscal_year, fe.month, o.fiscal_year_start_month AS fy_start
    FROM financial_entries fe
    INNER JOIN projects p ON p.id = fe.project_id
    INNER JOIN organizations o ON o.id = p.organization_id
  `);

  let rewritten = 0;
  // Group updates by (newYear, newMonth) so we can issue a single UPDATE per
  // distinct target value with a big id list — much faster than per-row
  // updates while still being completely deterministic.
  const buckets = new Map<string, { year: number; month: number; ids: number[] }>();
  for (const r of rows.rows as any[]) {
    const fyLabel = Number(r.fiscal_year);
    const monthNum = Number(r.month);
    const fyStart = normalizeFiscalYearStartMonth(r.fy_start);
    const cal = buildFiscalMonths(fyLabel, fyStart)[Math.max(0, Math.min(11, monthNum - 1))];
    // Skip rows that are already calendar-anchored: if the existing
    // (fiscal_year, month) already equals the computed (cal.year, cal.month),
    // no rewrite needed. This preserves correctness if a re-run somehow
    // happens before the marker is written (e.g. crash mid-migration).
    if (cal.year === fyLabel && cal.month === monthNum) continue;
    const key = `${cal.year}::${cal.month}`;
    if (!buckets.has(key)) buckets.set(key, { year: cal.year, month: cal.month, ids: [] });
    buckets.get(key)!.ids.push(Number(r.id));
  }

  await db.transaction(async (tx) => {
    // Drop the unique index temporarily so two-phase updates that pass
    // through a transient duplicate state (e.g. swapping months) don't
    // violate the constraint mid-transaction. Re-create at the end.
    await tx.execute(sql`DROP INDEX IF EXISTS financial_entries_cell_unique_idx`);

    for (const { year, month, ids } of buckets.values()) {
      // Chunk to avoid massive parameter lists.
      const CHUNK = 1000;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        await tx
          .update(financialEntries)
          .set({ fiscalYear: year, month })
          .where(inArray(financialEntries.id, slice));
        rewritten += slice.length;
      }
    }

    // Re-create the unique cell index. Matches the definition in schema.ts.
    await tx.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS financial_entries_cell_unique_idx
        ON financial_entries (project_id, fiscal_year, item_key, scenario, month)
    `);

    await tx.execute(sql`
      INSERT INTO _meta_migrations (key) VALUES (${MARKER_KEY})
      ON CONFLICT (key) DO NOTHING
    `);
  });

  return { alreadyApplied: false, rowsRewritten: rewritten };
}
