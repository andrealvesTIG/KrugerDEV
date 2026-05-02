import { getTableName, getTableColumns, isTable } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { pool } from "./db";
import * as schema from "@shared/schema";
import * as authModels from "@shared/models/auth";
import * as billingModels from "@shared/models/billing";
import * as chatModels from "@shared/models/chat";

interface DriftResult {
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
  checkedTables: number;
  checkedColumns: number;
}

interface ActualTableRow {
  table_name: string;
}

interface ActualColumnRow {
  table_name: string;
  column_name: string;
}

function collectExpectedTables(): Map<string, PgTable> {
  const tables = new Map<string, PgTable>();
  const allModules: Array<Record<string, unknown>> = [
    schema,
    authModels,
    billingModels,
    chatModels,
  ];
  for (const mod of allModules) {
    for (const value of Object.values(mod)) {
      if (isTable(value)) {
        const pgTable = value as PgTable;
        const name = getTableName(pgTable);
        if (!tables.has(name)) {
          tables.set(name, pgTable);
        }
      }
    }
  }
  return tables;
}

function getExpectedColumnNames(table: PgTable): string[] {
  const cols = getTableColumns(table);
  return Object.values(cols).map((c) => (c as PgColumn).name);
}

async function getActualTableNames(): Promise<Set<string>> {
  const res = await pool.query<ActualTableRow>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  return new Set(res.rows.map((r) => r.table_name));
}

async function getActualColumnsByTable(): Promise<Map<string, Set<string>>> {
  const res = await pool.query<ActualColumnRow>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const map = new Map<string, Set<string>>();
  for (const row of res.rows) {
    let set = map.get(row.table_name);
    if (!set) {
      set = new Set<string>();
      map.set(row.table_name, set);
    }
    set.add(row.column_name);
  }
  return map;
}

export async function detectSchemaDrift(): Promise<DriftResult> {
  const expectedTables = collectExpectedTables();
  const actualTableSet = await getActualTableNames();
  const actualColumnsByTable = await getActualColumnsByTable();

  const missingTables: string[] = [];
  const missingColumns: Array<{ table: string; column: string }> = [];
  let checkedColumns = 0;

  for (const [tableName, table] of expectedTables) {
    if (!actualTableSet.has(tableName)) {
      missingTables.push(tableName);
      continue;
    }

    const expectedCols = getExpectedColumnNames(table);
    const actualCols = actualColumnsByTable.get(tableName) ?? new Set<string>();

    for (const colName of expectedCols) {
      checkedColumns++;
      if (!actualCols.has(colName)) {
        missingColumns.push({ table: tableName, column: colName });
      }
    }
  }

  return {
    missingTables,
    missingColumns,
    checkedTables: expectedTables.size,
    checkedColumns,
  };
}

function logDrift(result: DriftResult): void {
  const banner = "=".repeat(72);
  console.error("\n" + banner);
  console.error("  [schema-drift] DATABASE SCHEMA DRIFT DETECTED");
  console.error(banner);

  if (result.missingTables.length > 0) {
    console.error(
      `  [schema-drift] Missing tables (${result.missingTables.length}):`,
    );
    for (const t of result.missingTables) {
      console.error(`    - ${t}`);
    }
  }

  if (result.missingColumns.length > 0) {
    console.error(
      `  [schema-drift] Missing columns (${result.missingColumns.length}):`,
    );
    for (const { table, column } of result.missingColumns) {
      console.error(`    - ${table}.${column}`);
    }
  }

  console.error(
    "  [schema-drift] The Drizzle schema in shared/schema.ts is ahead of the live database.",
  );
  console.error(
    "  [schema-drift] Run `npm run db:push` to sync the database, then restart the server.",
  );
  console.error(
    "  [schema-drift] Run `npm run db:check-schema` for a full diff (types, FKs, defaults).",
  );
  console.error(banner + "\n");
}

/**
 * Runs at server boot. Compares the Drizzle schema against the live database
 * and reports any tables/columns that exist in code but not in the DB.
 *
 * Behavior:
 *   - Always logs drift loudly (stderr banner) so it cannot be missed.
 *   - In development (NODE_ENV !== "production"), throws to fail the boot
 *     when drift is found OR when the check itself errors, so no failure
 *     mode is silently ignored. Set SKIP_SCHEMA_DRIFT_CHECK=true to bypass.
 *   - In production, never crashes the process — drift and check errors are
 *     logged so they surface in error tracking, but the app keeps serving
 *     traffic for the tables/columns that DO exist.
 */
export async function runSchemaDriftCheck(): Promise<void> {
  if (process.env.SKIP_SCHEMA_DRIFT_CHECK === "true") {
    console.log("[schema-drift] Check skipped (SKIP_SCHEMA_DRIFT_CHECK=true)");
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";

  let result: DriftResult;
  try {
    result = await detectSchemaDrift();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[schema-drift] Failed to run startup schema drift check:", message);
    if (!isProduction) {
      throw new Error(
        `Schema drift check failed: ${message}. ` +
          `Set SKIP_SCHEMA_DRIFT_CHECK=true to bypass.`,
      );
    }
    return;
  }

  const driftCount = result.missingTables.length + result.missingColumns.length;

  if (driftCount === 0) {
    console.log(
      `[schema-drift] OK — ${result.checkedTables} tables, ${result.checkedColumns} columns match the database.`,
    );
    return;
  }

  logDrift(result);

  if (!isProduction) {
    throw new Error(
      `Schema drift detected: ${result.missingTables.length} missing table(s), ` +
        `${result.missingColumns.length} missing column(s). ` +
        `Run \`npm run db:push\` to sync, or set SKIP_SCHEMA_DRIFT_CHECK=true to bypass.`,
    );
  }
}
