# Schema Missing Elements & Mismatch Report

**Date:** March 20, 2026  
**Scope:** All schema definitions vs. actual codebase usage  
**Schema sources:** `shared/schema.ts`, `shared/models/auth.ts`, `shared/models/billing.ts`, `shared/models/chat.ts`, `script/migrate.ts`, `migrations/*.sql`

---

## 1. Summary

The codebase defines ~110 tables across 4 schema source files. All tables referenced in storage/route code have corresponding Drizzle `pgTable` definitions. The schema is broadly consistent. However, the audit uncovered:

- **1 confirmed type mismatch** between schema and migration (`tokens_encrypted`)
- **5 missing foreign key constraints** on billing tables
- **4 missing unique constraints** on upsert-pattern tables (race condition risk)
- **11+ missing performance indexes** on frequently-queried columns
- **2 duplicate migration file numbers** (0002, 0003)
- **1 duplicate/redundant table** (`organization_custom_fields` vs `custom_field_definitions`)
- **1 unused schema column** (`tokens_encrypted` — field exists but is never read or written)
- **Indexes drift** between `script/migrate.ts` (adds many indexes) and Drizzle schema (doesn't declare them)

No missing tables were found. No fields referenced in code are absent from the schema.

---

## 2. Missing Schema Elements

### 2.1 LIKELY MISSING — Missing Foreign Key Constraints on Billing Tables

| Table | Column | Should Reference | File | Confidence |
|-------|--------|-----------------|------|------------|
| `subscriptions` | `orgId` | `organizations.id` | `shared/models/billing.ts:125` | **High** |
| `seatAssignments` | `orgId` | `organizations.id` | `shared/models/billing.ts:141` | **High** |
| `usageEvents` | `orgId` | `organizations.id` | `shared/models/billing.ts:164` | **High** |
| `billingAuditLogs` | `orgId` | `organizations.id` | `shared/models/billing.ts:214` | **High** |
| `billingTransactions` | `orgId` | `organizations.id` | `shared/models/billing.ts:429` | **High** |

**Why missing:** Comments in code say "enforced at database level" but the Drizzle ORM definitions lack `.references()`, meaning `drizzle-kit push` never creates the actual FK constraint either. These are real org references that should have referential integrity.

**Recommended fix:** Add `.references(() => organizations.id)` to each column. Requires importing `organizations` in `shared/models/billing.ts` (circular dependency may need a workaround — see note below).

**Note on circular imports:** `shared/models/billing.ts` doesn't currently import from `shared/schema.ts`. Adding `.references(() => organizations.id)` requires resolving the import. Options: (a) move the FK to a migration-only SQL statement, (b) restructure the import, or (c) use a post-push SQL `ALTER TABLE ADD CONSTRAINT`.

---

### 2.2 LIKELY MISSING — Missing Unique Constraints (Race Condition Risk)

These tables use find-then-insert/update patterns in application code without database-level uniqueness enforcement. Under concurrent requests, duplicates can be created.

| Table | Columns | Upsert Location | Confidence |
|-------|---------|-----------------|------------|
| `organization_integrations` | `(organization_id, integration_type)` | `server/services/microsoftPlanner.ts` | **High** |
| `project_custom_field_values` | `(project_id, field_definition_id)` | `server/storage/miscStorage.ts` | **High** |
| `project_invoices` | `(external_id, organization_id, source)` | `server/storage/financialStorage.ts` | **High** |
| `project_scores` | `(project_id, criteria_id)` | `server/storage/miscStorage.ts` | **Medium** |

**Recommended fix:** Add `uniqueIndex()` declarations to each table's second argument in `shared/schema.ts`, then run `drizzle-kit push`.

---

### 2.3 LIKELY MISSING — Missing Performance Indexes

The following columns are used in high-frequency `eq()` filters in storage queries but have no index in the schema or `script/migrate.ts`:

| Table | Column(s) | Query Location | Confidence |
|-------|-----------|---------------|------------|
| `project_intakes` | `organization_id` | `server/storage/` | **High** |
| `project_intakes` | `portfolio_id` | `server/storage/` | **High** |
| `project_financials` | `project_id` | `server/storage/financialStorage.ts` | **High** |
| `cost_items` | `project_id` | `server/storage/financialStorage.ts` | **High** |
| `status_report_history` | `project_id` | `server/storage/` | **Medium** |
| `notifications` | `user_id` | `server/storage/projectStorage.ts` | **High** |
| `project_comments` | `project_id` | `server/storage/` | **Medium** |
| `external_shares` | `source_organization_id` | `server/storage/` | **Medium** |
| `external_shares` | `shared_with_user_id` | `server/storage/` | **Medium** |
| `project_documents` | `project_id` | `server/storage/` | **Medium** |
| `user_consents` | `user_id` | `server/storage/` | **Medium** |

**Note:** `script/migrate.ts` adds many indexes via raw SQL that are NOT declared in the Drizzle schema. This means `drizzle-kit push` doesn't know about them and could theoretically try to drop them. The indexes listed above appear to be missing from BOTH the schema AND migrate.ts.

**Recommended fix:** Add `index()` declarations to each table definition in `shared/schema.ts`.

---

## 3. Mismatches

### 3.1 CONFIRMED — `tokens_encrypted` Type Mismatch

| Source | Type | Location |
|--------|------|----------|
| Drizzle schema | `text` | `shared/schema.ts:1332` |
| Manual migration | `BOOLEAN DEFAULT false` | `script/migrate.ts:264` |
| Generated migration | `text` | `migrations/0001_omniscient_sinister_six.sql:305` |

**Impact:** If the database was initialized via `script/migrate.ts`, the actual DB column is `boolean`. If via `drizzle-kit push`, it's `text`. The Drizzle ORM will attempt to read/write it as `text` regardless of what's in the DB.

**Additional finding:** The field is **never read or written** in application code. The encryption logic in `server/services/microsoftPlanner.ts` uses prefix-based detection (`enc:v1:`) instead of this flag.

**Recommended fix:** Either:
- (a) Change schema to `boolean("tokens_encrypted").default(false)` and update the column to match, OR
- (b) Remove the column entirely since it's unused (cleaner option)

---

### 3.2 CONFIRMED — Duplicate Migration File Numbers

| Number | File 1 (manual) | File 2 (Drizzle-generated) |
|--------|-----------------|---------------------------|
| 0002 | `0002_timesheet_controls.sql` | `0002_whole_vance_astro.sql` |
| 0003 | `0003_manager_review_workflow.sql` | `0003_talented_blockbuster.sql` |

**Impact:** Migration runners that depend on sequential numbering may skip one of each pair or execute them in unpredictable order. The Drizzle-generated files appear to be supersets of the manual files.

**Recommended fix:** Remove the manually-named duplicates (`0002_timesheet_controls.sql`, `0003_manager_review_workflow.sql`) if the Drizzle-generated versions contain all necessary changes. Verify by diffing content first.

---

### 3.3 CONFIRMED — Duplicate Custom Field Tables

Two tables serve the same purpose (org-scoped custom field definitions):

| Table | Location | Used In Code? |
|-------|----------|--------------|
| `custom_field_definitions` | `shared/schema.ts:1913` | **Yes** — referenced in storage and routes |
| `organization_custom_fields` | `shared/schema.ts:2628` | **No** — zero references in `server/` or `client/` |

**Differences:**
- `custom_field_definitions` has `isRequired`, `defaultValue` columns; `organization_custom_fields` has `required` instead
- Both have `organizationId`, `name`, `fieldType`, `options`, `displayOrder`, `isActive`

**Recommended fix:** Remove `organization_custom_fields` table definition from schema and drop the DB table (after confirming no data exists in it).

---

### 3.4 POSSIBLE — Schema ↔ migrate.ts Index Drift

`script/migrate.ts` creates ~50+ indexes via raw SQL (`CREATE INDEX IF NOT EXISTS`) that are NOT declared in the Drizzle schema files. Examples:

- `idx_tasks_project_id`, `idx_tasks_owner_id`, `idx_tasks_status`
- `idx_issues_project_id`, `idx_issues_status`
- `idx_notifications_user_id`, `idx_notifications_is_read`
- Many more across milestones, resources, timesheets, etc.

**Impact:** Drizzle doesn't know about these indexes. A future `drizzle-kit push` with `--force` might attempt to drop them since they aren't in the schema. Currently safe because `drizzle-kit push` doesn't typically drop indexes, but it's a maintenance risk.

**Recommended fix:** Gradually migrate the index declarations from `script/migrate.ts` into the `shared/schema.ts` table definitions.

---

## 4. Recommended Fixes — Priority Order

| # | Issue | Severity | Effort | Fix |
|---|-------|----------|--------|-----|
| 1 | `tokens_encrypted` type mismatch + unused | **High** | Low | Remove column from schema + DB, or fix type to `boolean` |
| 2 | Missing unique constraints (4 tables) | **High** | Low | Add `uniqueIndex()` to schema, run push |
| 3 | Missing billing FK constraints (5 columns) | **Medium** | Low | Add `.references()` or ALTER TABLE SQL |
| 4 | Duplicate migration files (0002, 0003) | **Medium** | Low | Remove manual duplicates after content verification |
| 5 | Duplicate `organization_custom_fields` table | **Medium** | Low | Remove unused table definition + drop DB table |
| 6 | Missing performance indexes (11 columns) | **Medium** | Low | Add `index()` declarations to schema |
| 7 | Index drift (migrate.ts vs schema) | **Low** | Medium | Move raw SQL indexes into schema definitions |

---

## 5. Confidence & Open Questions

### High Confidence Findings
- `tokens_encrypted` type mismatch (verified in 3 source files)
- Missing billing FKs (verified: comments confirm intent, `.references()` calls absent)
- Missing unique constraints (verified: upsert patterns use find-then-insert without DB constraint)
- Duplicate custom field tables (verified: `organization_custom_fields` has zero usage in server/client code)
- Duplicate migration numbers (verified: file listing shows two 0002 and two 0003 files)

### Medium Confidence Findings
- Missing indexes: Based on common query patterns in storage files. Some may already exist via `script/migrate.ts` raw SQL (cross-referenced where possible).
- Index drift risk: Depends on how `drizzle-kit push` handles unknown indexes in future versions.

### Open Questions
1. **Was the DB initialized via `drizzle-kit push` or `script/migrate.ts`?** This determines the actual `tokens_encrypted` column type in production.
2. **Does `organization_custom_fields` have any data in the production database?** If so, it needs data migration before removal.
3. **Are the duplicate migration files (0002, 0003) both being executed?** If using Drizzle's journal-based tracking, only the Drizzle-generated ones would run. The manual ones might be dead code.
4. **Circular import concern for billing FKs:** Adding `.references(() => organizations.id)` to `shared/models/billing.ts` requires importing from `shared/schema.ts`. Need to verify this doesn't create a circular dependency.

### No Issues Found
- All tables referenced in storage/route code have corresponding `pgTable` definitions
- All major entity columns (projects, tasks, issues, resources, timesheets, portfolios) match between schema and usage
- `cross_project_references` is fully defined and integrated across the stack
- `rejectionReason` exists on `projectIntakes` (earlier flag was a false positive)
- `scheduledHour`/`scheduledMinute` exist on `timesheetSettings` (earlier flag was a false positive)
- All "log" tables (`issueChangeLogs`, `taskChangeLogs`, `userActivityLogs`, `apiTokens`, etc.) are defined in schema
