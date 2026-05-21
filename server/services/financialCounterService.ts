// Atomic per-(scope, project) counters for invoice / change-order numbering.
//
// The old `SELECT max(num) FROM ... ; INSERT num+1` pattern is racey: two
// concurrent creates read the same max and produce duplicate numbers. This
// helper allocates the next sequence value in a single Postgres statement
// using `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING value`, which
// runs atomically inside Postgres (the conflicting row is locked for the
// duration of the UPDATE). Combined with a unique constraint on
// `(project_id, <number column>)` on the target table, duplicates are
// impossible even under heavy concurrency.

import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Allocates the next sequence value for `(scope, projectId)`. Returns an
 * integer >= 1. Safe to call concurrently — each caller gets a distinct
 * value.
 */
export async function nextCounterValue(scope: string, projectId: number): Promise<number> {
  const result: any = await db.execute(sql`
    INSERT INTO financial_counters (scope, project_id, value)
    VALUES (${scope}, ${projectId}, 1)
    ON CONFLICT (scope, project_id) DO UPDATE
      SET value = financial_counters.value + 1,
          updated_at = now()
    RETURNING value
  `);
  const rows = (result?.rows ?? result) as Array<{ value: number | string }>;
  if (!rows || rows.length === 0) {
    throw new Error(`Failed to allocate counter for (${scope}, ${projectId})`);
  }
  return Number(rows[0].value);
}

/** Format a counter as a prefixed, zero-padded number, e.g. (3, "PCO") → "PCO-003". */
export function formatCounter(prefix: string, value: number, pad = 3): string {
  return `${prefix}-${String(value).padStart(pad, "0")}`;
}
