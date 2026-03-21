# Schema Gap Analysis Report

**Date:** March 21, 2026  
**Schema sources:** `shared/schema.ts` (~2846 lines), `shared/models/auth.ts`, `shared/models/billing.ts`, `shared/models/chat.ts`  
**Migration sources:** `script/migrate.ts`, `migrations/0000–0005`

---

## Findings

### 1. MISSING — Unique Constraints on Upsert Tables (Race Condition Risk)

Four tables use find-then-insert/update logic in application code without a database-level unique constraint. Under concurrent requests, duplicate rows can be created.

#### 1a. `organization_integrations` — missing `uniqueIndex(organization_id, integration_type)`

- **File:** `shared/schema.ts:1318` (table definition has no uniqueIndex)
- **Evidence:** `server/services/microsoftPlanner.ts:75-115` — `upsertOrgIntegration()` does `SELECT WHERE org_id AND integration_type`, then either `INSERT` or `UPDATE`. No `ON CONFLICT` clause. No DB unique constraint.
- **Confidence:** High
- **Fix:** Add `uniqueIndex("org_integrations_org_type_idx").on(table.organizationId, table.integrationType)` to the table definition.

#### 1b. `project_custom_field_values` — missing `uniqueIndex(project_id, field_definition_id)`

- **File:** `shared/schema.ts:1939` (no uniqueIndex in table definition)
- **Evidence:** `server/storage/miscStorage.ts:334-345` — `upsertProjectCustomFieldValue()` does a SELECT to check for existing row, then INSERT or UPDATE. Two simultaneous requests for the same project + field could both pass the SELECT check and both INSERT.
- **Confidence:** High
- **Fix:** Add `uniqueIndex("pcfv_project_field_idx").on(table.projectId, table.fieldDefinitionId)` to the table definition.

#### 1c. `project_scores` — missing `uniqueIndex(project_id, criteria_id)`

- **File:** `shared/schema.ts` (projectScores table, no uniqueIndex)
- **Evidence:** `server/storage/miscStorage.ts:532-546` — `upsertProjectScore()` follows the same find-then-insert pattern.
- **Confidence:** High
- **Fix:** Add `uniqueIndex("project_scores_project_criteria_idx").on(table.projectId, table.criteriaId)`.

#### 1d. `project_invoices` — missing `uniqueIndex(external_id, organization_id, source)`

- **File:** `shared/schema.ts:1111` (projectInvoices table)
- **Evidence:** `server/storage/financialStorage.ts` — upsert logic for external invoice imports uses `externalId + organizationId + source` as the lookup key.
- **Confidence:** High
- **Fix:** Add `uniqueIndex("project_invoices_ext_org_source_idx").on(table.externalId, table.organizationId, table.source)`.

---

### 2. MISSING — Foreign Key Constraints on Billing `orgId` Columns

Five billing tables have `orgId` columns that reference organizations but lack `.references()` in the ORM definition. Comments say "enforced at database level" but since `drizzle-kit push` is the primary schema sync mechanism, no actual FK constraint is created.

| Table | Line | Column | Nullable | File |
|-------|------|--------|----------|------|
| `subscriptions` | 125 | `orgId` | Yes (nullable) | `shared/models/billing.ts` |
| `seatAssignments` | 141 | `orgId` | No (.notNull()) | `shared/models/billing.ts` |
| `usageEvents` | 164 | `orgId` | Yes (nullable) | `shared/models/billing.ts` |
| `billingAuditLogs` | 214 | `orgId` | Yes (nullable) | `shared/models/billing.ts` |
| `billingTransactions` | 429 | `orgId` | Yes (nullable) | `shared/models/billing.ts` |

- **Evidence:** All five columns are `integer("org_id")` with no `.references()` call. The `organizations` table is defined in `shared/schema.ts`, creating a cross-file import issue.
- **Confidence:** High
- **Fix:** Either (a) add `.references(() => organizations.id)` and resolve the circular import, or (b) add FK constraints via raw SQL in `script/migrate.ts`:
  ```sql
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_org_id_fk FOREIGN KEY (org_id) REFERENCES organizations(id);
  ```

---

### 3. MISSING — Nullable `organizationId` on Core Multi-Tenant Tables

Several core entity tables have `organizationId` as nullable despite being always required in practice. This allows orphan records that bypass org-scoped queries.

| Table | Line in schema.ts | Used as filter? |
|-------|-------------------|-----------------|
| `tasks` | 474 | Yes — filtered by org in list queries |
| `milestones` (deprecated) | 348 | Yes — filtered by org in milestone queries |

- **Evidence:** `tasks.organizationId` is `integer("organization_id").references(() => organizations.id)` — nullable. But every task belongs to a project, and every project has a non-null `organizationId`. Query logic in `server/storage/taskStorage.ts` filters by `organizationId` directly, meaning null values would silently disappear from results.
- **Confidence:** Medium (the project FK chain provides indirect enforcement, but direct queries could miss records)
- **Fix:** Add `.notNull()` after backfilling any null values:
  ```sql
  UPDATE tasks SET organization_id = (SELECT organization_id FROM projects WHERE id = tasks.project_id) WHERE organization_id IS NULL;
  ALTER TABLE tasks ALTER COLUMN organization_id SET NOT NULL;
  ```

---

### 4. MISMATCH — `training_modules.cert_prefix` Length (10 vs 20)

- **File (schema):** `shared/schema.ts:2704` — `varchar("cert_prefix", { length: 10 })`
- **File (migration):** `script/migrate.ts:320` — `cert_prefix VARCHAR(20)`
- **Evidence:** The Drizzle schema limits to 10 characters, but the migration creates a 20-character column. If the DB was initialized via `script/migrate.ts` first, the column is `VARCHAR(20)`. A subsequent `drizzle-kit push` would try to ALTER it to `VARCHAR(10)`, potentially truncating data.
- **Confidence:** High
- **Fix:** Align both to the same length. `VARCHAR(20)` in the schema is safer — change schema to `{ length: 20 }`.

---

### 5. MISMATCH — Duplicate Custom Field Tables

Two tables serve the same purpose — org-scoped custom field definitions:

| Table | Line | Referenced in code? |
|-------|------|-------------------|
| `custom_field_definitions` | 1913 | Yes — used in storage and routes |
| `organization_custom_fields` | 2628 | **No** — zero references in `server/` or `client/` |

- **Evidence:** `grep -r "organization_custom_fields" server/ client/` returns zero matches. `customFieldDefinitions` is imported and used in `server/storage/miscStorage.ts` and `server/storage/organizationStorage.ts`.
- **Confidence:** High
- **Fix:** Remove the `organizationCustomFields` table definition from `shared/schema.ts`. Drop the DB table after verifying it's empty: `DROP TABLE IF EXISTS organization_custom_fields;`

---

### 6. MISMATCH — Duplicate Migration File Numbers

| Number | Manual File | Drizzle-Generated File |
|--------|------------|----------------------|
| 0002 | `0002_timesheet_controls.sql` | `0002_whole_vance_astro.sql` |
| 0003 | `0003_manager_review_workflow.sql` | `0003_talented_blockbuster.sql` |

- **Evidence:** `ls migrations/*.sql` shows both pairs. The Drizzle journal (`migrations/meta/_journal.json`) likely only tracks one of each. The other is dead code or could cause confusion.
- **Confidence:** High
- **Fix:** Diff the pairs. If the Drizzle-generated files are supersets, remove the manual duplicates.

---

### 7. MISSING — Performance Indexes on Frequently-Queried Columns

These columns are used in `eq()` filters in high-traffic storage queries but have no index in the Drizzle schema. Some may exist via `script/migrate.ts` raw SQL, but they aren't tracked by Drizzle and could be dropped by `push --force`.

| Table | Column | Query File |
|-------|--------|-----------|
| `project_intakes` | `organization_id` | `server/storage/` |
| `project_intakes` | `portfolio_id` | `server/storage/` |
| `project_financials` | `project_id` | `server/storage/financialStorage.ts` |
| `cost_items` | `project_id` | `server/storage/financialStorage.ts` |
| `notifications` | `user_id` | `server/storage/projectStorage.ts` |
| `project_comments` | `project_id` | `server/storage/` |
| `project_documents` | `project_id` | `server/storage/` |
| `status_report_history` | `project_id` | `server/storage/` |

- **Confidence:** Medium — indexes may exist at DB level via `script/migrate.ts` but aren't in the schema
- **Fix:** Add `index()` declarations to each table's definition in `shared/schema.ts` so Drizzle manages them.

---

### 8. POSSIBLE — Enum Value Inconsistency (Priority Casing)

- **File:** `client/src/components/project/ProjectTabs.tsx:990-1001`
- **Evidence:** Uses lowercase priority values (`'low'`, `'medium'`, `'high'`, `'critical'`) when creating milestones/tasks. The schema comments and all server-side code use Title Case (`Low`, `Medium`, `High`, `Critical`). The DB column is `text` with no enum constraint, so both are accepted — but queries filtering by `priority = 'High'` will miss records stored as `'high'`.
- **Confidence:** Medium — depends on whether any filter/display logic is case-sensitive
- **Fix:** Normalize the frontend to use Title Case, matching the schema comment and server-side convention. Or add a DB-level check constraint.

---

### 9. POSSIBLE — `tokensEncrypted` Column Never Read or Written

- **File:** `shared/schema.ts:1356` — `tokensEncrypted: boolean("tokens_encrypted").default(false)`
- **Evidence:** The encryption logic in `server/services/microsoftPlanner.ts` uses prefix-based detection (`enc:v1:`) via `isEncryptedFormat()` from `server/lib/tokenEncryption.ts`. The `upsertOrgIntegration()` function never sets `tokensEncrypted`. No storage or route code reads it.
- **Confidence:** High (the column exists but serves no purpose)
- **Fix:** Either remove the column or wire it into the upsert logic to set `true` when tokens are encrypted.

---

## Summary Table

| # | Finding | Type | Severity | Confidence |
|---|---------|------|----------|------------|
| 1 | Missing unique constraints (4 tables) | Missing constraint | High | High |
| 2 | Missing billing FK constraints (5 columns) | Missing FK | Medium | High |
| 3 | Nullable `organizationId` on `tasks` | Missing notNull | Medium | Medium |
| 4 | `cert_prefix` length mismatch (10 vs 20) | Type mismatch | Medium | High |
| 5 | Duplicate `organization_custom_fields` table | Dead schema | Low | High |
| 6 | Duplicate migration file numbers | Migration hygiene | Low | High |
| 7 | Missing performance indexes (8 columns) | Missing index | Low | Medium |
| 8 | Priority casing inconsistency | Enum mismatch | Low | Medium |
| 9 | `tokensEncrypted` unused column | Dead column | Low | High |

---

## No Issues Found

- All tables referenced in storage/route code have `pgTable` definitions
- All `db.insert().values()` and `db.update().set()` calls reference columns that exist in the schema
- Zod validation schemas (generated via `drizzle-zod`) align with table columns
- `cross_project_references` is fully defined and integrated
- Profile analytics, badges, and rankings are calculated dynamically (no missing persistence tables — this is by design)
- The `RISK`/`ISSUE` uppercase values in `projectRoutes.ts:3820` are display-only labels for email HTML, not written to the database
- Portfolio `status: "Active"` in QuickAddMenu matches the schema comment (`Active, On Hold, Closed, Archived`)
