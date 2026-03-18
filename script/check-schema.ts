import pg from "pg";
import * as schema from "../shared/schema";
import * as authModels from "../shared/models/auth";
import * as billingModels from "../shared/models/billing";
import * as chatModels from "../shared/models/chat";
import { getTableName, getTableColumns } from "drizzle-orm";
import { PgTable, PgColumn, getTableConfig } from "drizzle-orm/pg-core";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");

interface ExpectedColumn {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
}

interface ExpectedFK {
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

interface ActualColumn {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

interface ActualConstraint {
  table_name: string;
  column_name: string;
  constraint_type: string;
  foreign_table: string | null;
  foreign_column: string | null;
}

interface Mismatch {
  table: string;
  column?: string;
  type: "missing_table" | "missing_column" | "extra_column" | "type_mismatch" | "nullable_mismatch" | "default_mismatch" | "pk_mismatch" | "fk_mismatch" | "fk_missing";
  expected?: string;
  actual?: string;
}

function drizzleTypeToPostgres(col: PgColumn): string {
  const dt = (col as any).dataType;
  const colType = (col as any).columnType;
  const sqlName = (col as any).sqlName;

  if (colType === "PgSerial") return "integer";
  if (colType === "PgInteger" || colType === "PgSmallInt") return "integer";
  if (colType === "PgBigInt53" || colType === "PgBigInt64" || colType === "PgBigSerial53" || colType === "PgBigSerial64") return "bigint";
  if (colType === "PgReal") return "real";
  if (colType === "PgDoublePrecision") return "double precision";
  if (colType === "PgNumeric") return "numeric";
  if (colType === "PgVarchar") return "character varying";
  if (colType === "PgChar") return "character";
  if (colType === "PgText") return "text";
  if (colType === "PgBoolean") return "boolean";
  if (colType === "PgTimestamp") return "timestamp without time zone";
  if (colType === "PgDate" || colType === "PgDateString") return "date";
  if (colType === "PgTime") return "time without time zone";
  if (colType === "PgJson") return "json";
  if (colType === "PgJsonb") return "jsonb";
  if (colType === "PgUUID") return "uuid";
  if (colType === "PgArray") return "ARRAY";

  if (colType === "PgCustomColumn" || dt === "custom") {
    if (sqlName) return normalizeType(sqlName);
    return "numeric";
  }

  if (dt === "string") return "text";
  if (dt === "number") return "integer";
  if (dt === "boolean") return "boolean";
  if (dt === "date") return "date";
  if (dt === "json") return "jsonb";
  if (dt === "bigint") return "bigint";
  if (dt === "array") return "ARRAY";

  return dt || "unknown";
}

function normalizeType(pgType: string): string {
  const t = pgType.toLowerCase().trim();
  if (t === "int4" || t === "int" || t === "serial") return "integer";
  if (t === "int8" || t === "bigserial") return "bigint";
  if (t === "int2") return "integer";
  if (t === "float4") return "real";
  if (t === "float8") return "double precision";
  if (t === "bool") return "boolean";
  if (t === "varchar") return "character varying";
  if (t === "bpchar") return "character";
  if (t === "timestamptz") return "timestamp with time zone";
  if (t === "timestamp") return "timestamp without time zone";
  if (t.startsWith("character varying")) return "character varying";
  if (t.startsWith("timestamp")) return t;
  return t;
}

function collectDrizzleTables(): Map<string, PgTable> {
  const tables = new Map<string, PgTable>();
  const allModules = [schema, authModels, billingModels, chatModels];

  for (const mod of allModules) {
    for (const [, value] of Object.entries(mod)) {
      if (value && typeof value === "object" && Symbol.for("drizzle:IsDrizzleTable") in (value as any)) {
        const tableName = getTableName(value as PgTable);
        if (!tables.has(tableName)) {
          tables.set(tableName, value as PgTable);
        }
      }
    }
  }
  return tables;
}

function getExpectedColumns(table: PgTable): ExpectedColumn[] {
  const cols = getTableColumns(table);
  const config = getTableConfig(table);
  const compositePkColumns = new Set<string>();
  for (const pk of config.primaryKeys) {
    for (const col of pk.columns) {
      compositePkColumns.add((col as any).name);
    }
  }

  const result: ExpectedColumn[] = [];

  for (const [, col] of Object.entries(cols)) {
    const pgCol = col as PgColumn;
    const colType = (pgCol as any).columnType;
    const isSerial = colType === "PgSerial" || colType === "PgBigSerial53" || colType === "PgBigSerial64";

    result.push({
      name: pgCol.name,
      dataType: drizzleTypeToPostgres(pgCol),
      isNullable: !pgCol.notNull,
      hasDefault: pgCol.hasDefault || isSerial,
      isPrimaryKey: pgCol.primary || compositePkColumns.has(pgCol.name),
    });
  }
  return result;
}

function getExpectedForeignKeys(table: PgTable): ExpectedFK[] {
  const config = getTableConfig(table);
  const result: ExpectedFK[] = [];

  for (const fk of config.foreignKeys) {
    const ref = fk.reference();
    const columns = ref.columns.map((c: any) => c.name);
    const foreignColumns = ref.foreignColumns.map((c: any) => c.name);
    const foreignTableName = (ref.foreignTable as any)[Symbol.for("drizzle:Name")] || getTableName(ref.foreignTable as PgTable);

    for (let i = 0; i < columns.length; i++) {
      result.push({
        column: columns[i],
        foreignTable: foreignTableName,
        foreignColumn: foreignColumns[i] || foreignColumns[0],
      });
    }
  }
  return result;
}

async function getActualTables(): Promise<string[]> {
  const res = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return res.rows.map((r: any) => r.table_name);
}

async function getActualColumns(tableName: string): Promise<ActualColumn[]> {
  const res = await pool.query(`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return res.rows;
}

async function getConstraints(tableName: string): Promise<ActualConstraint[]> {
  const res = await pool.query(`
    SELECT 
      tc.table_name,
      kcu.column_name,
      tc.constraint_type,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    LEFT JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public' AND tc.table_name = $1
    ORDER BY tc.constraint_type, kcu.column_name
  `, [tableName]);
  return res.rows;
}

async function main() {
  console.log("=".repeat(70));
  console.log("  FridayReport.AI  -  Database Schema Checker");
  console.log("=".repeat(70));
  console.log();

  console.log("Source of truth:");
  console.log("  - shared/schema.ts (main schema hub)");
  console.log("  - shared/models/auth.ts (users, sessions, tokens)");
  console.log("  - shared/models/billing.ts (plans, subscriptions, billing)");
  console.log("  - shared/models/chat.ts (conversations, messages)");
  console.log("  - Database: PostgreSQL via DATABASE_URL");
  console.log("  - ORM: Drizzle ORM with drizzle-kit push");
  if (verbose) console.log("  - Mode: VERBOSE (showing per-table details)");
  console.log();

  const expectedTables = collectDrizzleTables();
  const actualTableNames = await getActualTables();
  const actualTableSet = new Set(actualTableNames);

  console.log(`Expected tables (from Drizzle schema): ${expectedTables.size}`);
  console.log(`Actual tables (in database):           ${actualTableNames.length}`);
  console.log();

  const mismatches: Mismatch[] = [];
  let tablesOk = 0;
  let columnsChecked = 0;
  let columnsOk = 0;
  let fksChecked = 0;
  let fksOk = 0;

  for (const [tableName, table] of expectedTables) {
    if (!actualTableSet.has(tableName)) {
      mismatches.push({ table: tableName, type: "missing_table" });
      continue;
    }

    tablesOk++;
    const expectedCols = getExpectedColumns(table);
    const expectedFKs = getExpectedForeignKeys(table);
    const actualCols = await getActualColumns(tableName);
    const constraints = await getConstraints(tableName);

    const actualColMap = new Map<string, ActualColumn>();
    for (const ac of actualCols) {
      actualColMap.set(ac.column_name, ac);
    }

    const pkColumns = new Set(
      constraints.filter(c => c.constraint_type === "PRIMARY KEY").map(c => c.column_name)
    );
    const fkMap = new Map<string, { table: string; column: string }>();
    for (const c of constraints) {
      if (c.constraint_type === "FOREIGN KEY" && c.foreign_table && c.foreign_column) {
        fkMap.set(c.column_name, { table: c.foreign_table, column: c.foreign_column });
      }
    }

    const expectedColNames = new Set<string>();
    let tableColsOk = 0;
    let tableColIssues = 0;

    for (const ec of expectedCols) {
      expectedColNames.add(ec.name);
      columnsChecked++;
      const ac = actualColMap.get(ec.name);

      if (!ac) {
        mismatches.push({ table: tableName, column: ec.name, type: "missing_column", expected: ec.dataType });
        tableColIssues++;
        continue;
      }

      let colOk = true;

      const expectedType = normalizeType(ec.dataType);
      const actualTypeRaw = ac.data_type === "ARRAY" ? "ARRAY" : normalizeType(ac.udt_name || ac.data_type);
      if (expectedType !== actualTypeRaw) {
        const isCompatible = (
          (expectedType === "integer" && actualTypeRaw === "integer") ||
          (expectedType === "text" && actualTypeRaw === "character varying") ||
          (expectedType === "character varying" && actualTypeRaw === "text") ||
          (expectedType === "timestamp without time zone" && actualTypeRaw.startsWith("timestamp")) ||
          (expectedType === "ARRAY" && actualTypeRaw === "ARRAY") ||
          (expectedType.toLowerCase() === "array" && actualTypeRaw === "ARRAY")
        );
        if (!isCompatible) {
          mismatches.push({
            table: tableName,
            column: ec.name,
            type: "type_mismatch",
            expected: expectedType,
            actual: actualTypeRaw,
          });
          colOk = false;
        }
      }

      const actualNullable = ac.is_nullable === "YES";
      if (ec.isNullable !== actualNullable) {
        mismatches.push({
          table: tableName,
          column: ec.name,
          type: "nullable_mismatch",
          expected: ec.isNullable ? "nullable" : "NOT NULL",
          actual: actualNullable ? "nullable" : "NOT NULL",
        });
        colOk = false;
      }

      const actualHasDefault = ac.column_default !== null;
      if (ec.hasDefault && !actualHasDefault) {
        mismatches.push({
          table: tableName,
          column: ec.name,
          type: "default_mismatch",
          expected: "has default",
          actual: "no default",
        });
        colOk = false;
      }

      if (ec.isPrimaryKey && !pkColumns.has(ec.name)) {
        mismatches.push({
          table: tableName,
          column: ec.name,
          type: "pk_mismatch",
          expected: "PRIMARY KEY",
          actual: "not a PK",
        });
        colOk = false;
      }

      if (colOk) {
        columnsOk++;
        tableColsOk++;
      } else {
        tableColIssues++;
      }
    }

    for (const efk of expectedFKs) {
      fksChecked++;
      const actualFK = fkMap.get(efk.column);
      if (!actualFK) {
        mismatches.push({
          table: tableName,
          column: efk.column,
          type: "fk_missing",
          expected: `FK -> ${efk.foreignTable}.${efk.foreignColumn}`,
          actual: "no FK constraint",
        });
      } else if (actualFK.table !== efk.foreignTable || actualFK.column !== efk.foreignColumn) {
        mismatches.push({
          table: tableName,
          column: efk.column,
          type: "fk_mismatch",
          expected: `FK -> ${efk.foreignTable}.${efk.foreignColumn}`,
          actual: `FK -> ${actualFK.table}.${actualFK.column}`,
        });
      } else {
        fksOk++;
      }
    }

    const extraInTable = actualCols.filter(ac => !expectedColNames.has(ac.column_name));
    for (const ac of extraInTable) {
      mismatches.push({
        table: tableName,
        column: ac.column_name,
        type: "extra_column",
        actual: normalizeType(ac.udt_name || ac.data_type),
      });
    }

    if (verbose) {
      const tableFkIssues = mismatches.filter(m => m.table === tableName && (m.type === "fk_missing" || m.type === "fk_mismatch")).length;
      const status = (tableColIssues === 0 && extraInTable.length === 0 && tableFkIssues === 0) ? "OK" : "ISSUES";
      const fkStatus = expectedFKs.length > 0 ? `, ${expectedFKs.length} FKs${tableFkIssues > 0 ? ` (${tableFkIssues} issues)` : ""}` : "";
      console.log(`  [${status}] ${tableName}: ${expectedCols.length} cols (${tableColsOk} ok, ${tableColIssues} issues), ${extraInTable.length} extra${fkStatus}`);
    }
  }

  const extraTables = actualTableNames.filter(t => !expectedTables.has(t));

  console.log();
  console.log("-".repeat(70));
  console.log("  RESULTS");
  console.log("-".repeat(70));
  console.log();

  const missingTables = mismatches.filter(m => m.type === "missing_table");
  const missingCols = mismatches.filter(m => m.type === "missing_column");
  const extraCols = mismatches.filter(m => m.type === "extra_column");
  const typeMismatches = mismatches.filter(m => m.type === "type_mismatch");
  const nullMismatches = mismatches.filter(m => m.type === "nullable_mismatch");
  const defaultMismatches = mismatches.filter(m => m.type === "default_mismatch");
  const pkMismatches = mismatches.filter(m => m.type === "pk_mismatch");
  const fkMissing = mismatches.filter(m => m.type === "fk_missing");
  const fkMismatches = mismatches.filter(m => m.type === "fk_mismatch");

  if (missingTables.length > 0) {
    console.log(`MISSING TABLES (${missingTables.length}):`);
    for (const m of missingTables) {
      console.log(`  [!] ${m.table}`);
    }
    console.log();
  }

  if (extraTables.length > 0) {
    console.log(`EXTRA TABLES in DB not in schema (${extraTables.length}):`);
    for (const t of extraTables) {
      console.log(`  [?] ${t}`);
    }
    console.log();
  }

  if (missingCols.length > 0) {
    console.log(`MISSING COLUMNS (${missingCols.length}):`);
    for (const m of missingCols) {
      console.log(`  [!] ${m.table}.${m.column} (expected type: ${m.expected})`);
    }
    console.log();
  }

  if (extraCols.length > 0) {
    console.log(`EXTRA COLUMNS in DB not in schema (${extraCols.length}):`);
    for (const m of extraCols) {
      console.log(`  [?] ${m.table}.${m.column} (type: ${m.actual})`);
    }
    console.log();
  }

  if (typeMismatches.length > 0) {
    console.log(`TYPE MISMATCHES (${typeMismatches.length}):`);
    for (const m of typeMismatches) {
      console.log(`  [X] ${m.table}.${m.column}: expected "${m.expected}", got "${m.actual}"`);
    }
    console.log();
  }

  if (nullMismatches.length > 0) {
    console.log(`NULLABLE MISMATCHES (${nullMismatches.length}):`);
    for (const m of nullMismatches) {
      console.log(`  [~] ${m.table}.${m.column}: expected ${m.expected}, got ${m.actual}`);
    }
    console.log();
  }

  if (defaultMismatches.length > 0) {
    console.log(`DEFAULT MISMATCHES (${defaultMismatches.length}):`);
    for (const m of defaultMismatches) {
      console.log(`  [~] ${m.table}.${m.column}: ${m.expected} vs ${m.actual}`);
    }
    console.log();
  }

  if (pkMismatches.length > 0) {
    console.log(`PRIMARY KEY MISMATCHES (${pkMismatches.length}):`);
    for (const m of pkMismatches) {
      console.log(`  [X] ${m.table}.${m.column}: expected ${m.expected}, got ${m.actual}`);
    }
    console.log();
  }

  if (fkMissing.length > 0) {
    console.log(`MISSING FOREIGN KEYS (${fkMissing.length}):`);
    for (const m of fkMissing) {
      console.log(`  [!] ${m.table}.${m.column}: expected ${m.expected}, got ${m.actual}`);
    }
    console.log();
  }

  if (fkMismatches.length > 0) {
    console.log(`FOREIGN KEY MISMATCHES (${fkMismatches.length}):`);
    for (const m of fkMismatches) {
      console.log(`  [X] ${m.table}.${m.column}: expected ${m.expected}, got ${m.actual}`);
    }
    console.log();
  }

  console.log("-".repeat(70));
  console.log("  SUMMARY");
  console.log("-".repeat(70));
  console.log(`  Tables in schema:     ${expectedTables.size}`);
  console.log(`  Tables in database:   ${actualTableNames.length}`);
  console.log(`  Tables matched:       ${tablesOk} / ${expectedTables.size}`);
  console.log(`  Missing tables:       ${missingTables.length}`);
  console.log(`  Extra tables in DB:   ${extraTables.length}`);
  console.log(`  Columns checked:      ${columnsChecked}`);
  console.log(`  Columns OK:           ${columnsOk}`);
  console.log(`  Missing columns:      ${missingCols.length}`);
  console.log(`  Extra columns in DB:  ${extraCols.length}`);
  console.log(`  Type mismatches:      ${typeMismatches.length}`);
  console.log(`  Nullable mismatches:  ${nullMismatches.length}`);
  console.log(`  Default mismatches:   ${defaultMismatches.length}`);
  console.log(`  PK mismatches:        ${pkMismatches.length}`);
  console.log(`  FK checked:           ${fksChecked}`);
  console.log(`  FK OK:                ${fksOk}`);
  console.log(`  FK missing:           ${fkMissing.length}`);
  console.log(`  FK mismatches:        ${fkMismatches.length}`);
  console.log();

  const totalIssues = missingTables.length + missingCols.length + typeMismatches.length + pkMismatches.length + fkMissing.length + fkMismatches.length;
  if (totalIssues === 0) {
    console.log("  STATUS: ALL GOOD - Schema and database are in sync!");
  } else {
    console.log(`  STATUS: ${totalIssues} CRITICAL ISSUE(S) FOUND`);
    console.log("  Run 'npm run db:push' to sync the schema to the database.");
  }
  console.log("=".repeat(70));

  await pool.end();
  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Schema check failed:", err);
  process.exit(2);
});
