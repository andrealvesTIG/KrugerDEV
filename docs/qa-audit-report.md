# FridayReport.AI — Database & Backend QA Audit Report

**Date:** March 27, 2026
**Schema Check Status:** ALL GOOD — 113 tables, 1561 columns, 260 FKs in sync

---

## 1. Schema Sync (FIXED)

| Item | Before | After |
|------|--------|-------|
| Missing tables | 1 (`partner_applications`) | 0 |
| Column mismatches | 0 | 0 |
| FK mismatches | 0 | 0 |

**Action taken:** Ran `db:push` to create `partner_applications` table. Verified with `check-schema.ts`.

---

## 2. API Route Audit (PASS)

All 16 route files audited (`aiRoutes`, `analyticsRoutes`, `billingRoutes`, `dashboardRoutes`, `intakeRoutes`, `miscRoutes`, `organizationRoutes`, `orgMemberRoutes`, `portfolioRoutes`, `projectRoutes`, `projectFeatureRoutes`, `projectItemRoutes`, `resourceRoutes`, `timesheetRoutes`, `userRoutes`, `partnerRoutes`). Every table/column reference verified against schema:
- `partnerRoutes.ts` — correctly uses `partnerApplications` table
- All `sql` template literals reference valid table/column names
- All `@shared/schema` imports resolve correctly
- `milestones` table still imported in `organizationStorage.ts` delete cascade (deprecated but functional)
- No raw SQL referencing nonexistent columns

**Endpoints tested (no 500s):**
| Endpoint | Status |
|----------|--------|
| GET /api/user (unauthed) | 200 (empty) |
| GET /api/organizations (unauthed) | 401 |
| GET /api/portfolios (unauthed) | 200 (empty array) |
| GET /api/projects (unauthed) | 200 (empty array) |
| GET /api/tasks (unauthed) | 200 (empty) |
| GET /api/issues (unauthed) | 200 (empty array) |
| GET /api/resources (unauthed) | 401 |
| POST /api/partner-applications | 201 |
| GET /api/billing/plans | 200 |
| GET /api/admin/monitoring/health | 200 |

---

## 3. FK Integrity & Race Conditions

### 3a. Billing FK Gaps (KNOWN/ACCEPTED — Severity: LOW)

5 tables in `shared/models/billing.ts` have `orgId` columns without Drizzle `.references()`:

| Table | Column | File | Line | Comment in Code |
|-------|--------|------|------|-----------------|
| `subscriptions` | `orgId` | `shared/models/billing.ts` | ~125 | "FK enforced at database level" |
| `seatAssignments` | `orgId` | `shared/models/billing.ts` | ~141 | "FK enforced at database level" |
| `usageEvents` | `orgId` | `shared/models/billing.ts` | ~164 | No comment |
| `billingAuditLogs` | `orgId` | `shared/models/billing.ts` | ~214 | No comment |
| `billingTransactions` | `orgId` | `shared/models/billing.ts` | ~429 | No comment |

**Status:** Known intentional gap — billing tables use app-level enforcement. The `deleteOrganization` cascade in `organizationStorage.ts` handles cleanup. `script/migrate.ts` adds FK constraints at runtime.

### 3b. Race Conditions (FIXED — Severity: MEDIUM)

| Storage Function | File | Table | Had Unique Index? | Fix Applied |
|-----------------|------|-------|-------------------|-------------|
| `upsertProjectCustomFieldValue` | `server/storage/miscStorage.ts` | `projectCustomFieldValues` | Yes (`pcfv_project_field_idx`) | Converted to `onConflictDoUpdate` |
| `upsertProjectScore` | `server/storage/miscStorage.ts` | `projectScores` | Yes (`project_scores_project_criteria_idx`) | Converted to `onConflictDoUpdate` |
| `upsertTimesheetSettings` | `server/storage/timesheetStorage.ts` | `timesheetSettings` | Yes (`ts_settings_org_idx`) | Converted to `onConflictDoUpdate` |
| `createExternalShare` | `server/storage/organizationStorage.ts` | `externalShares` | **No** | Added `uniqueIndex` in schema + migration dedup + `onConflictDoUpdate` |

### 3c. Remaining Race Condition Risks (Severity: LOW)

| Function | File | Table | Risk |
|----------|------|-------|------|
| `acceptOrganizationInvite` | `server/storage/organizationStorage.ts` | `organizationMembers` | Protected by existing `unique_org_user` constraint |
| `claimInvitesForUser` | `server/storage/organizationStorage.ts` | `organizationMembers` | Same protection as above |
| `doSyncOrganizationMembersAsResources` | `server/storage/resourceStorage.ts` | `resources` | In-memory `syncLocks` prevent per-process; multi-instance risk |

---

## 4. Migration Audit (PASS)

### Journal State
- **4 migrations in journal** (0000–0003), properly ordered with ascending timestamps
- **2 orphan SQL files on disk** (0004, 0005) not tracked in the Drizzle journal:
  - `0004_reminder_escalation_system.sql` — tables already exist via `db:push`
  - `0005_cross_project_references.sql` — tables already exist via `db:push`
- **No conflicts** — orphan files are benign since `db:push` manages actual schema

### Manual Migration Script (`script/migrate.ts`)
- Contains 70+ `CREATE INDEX IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements
- All statements use `IF NOT EXISTS` / `IF EXISTS` — safe for re-runs
- No ordering issues detected
- New: Added dedup step + unique index creation for `external_shares`

### Fresh Setup Viability
- `db:push` creates all 113 tables from schema definitions
- `script/migrate.ts` runs idempotent ALTER/CREATE statements on top
- Both work independently and together; fresh setup is viable

---

## 5. Enum & Type Consistency

### Mismatches Found (Severity: LOW)

| Category | Backend Schema (`shared/schema.ts`) | Frontend | Issue |
|----------|--------------------------------------|----------|-------|
| Project Status | `Initiation, Planning, Execution, Monitoring, Closing` | `Projects.tsx` adds `Billing`, `Closed` | Frontend broader than schema defaults |
| Org Roles | `org_admin, member, viewer` (line ~131) | Billing uses `OWNER, ADMIN, MEMBER` | Naming inconsistency between core and billing roles |
| Task Status | `Not Started, In Progress, On Hold, Completed, Cancelled` (line ~470) | `Timesheets.tsx` uses `Done` as synonym for `Completed` | Minor inconsistency |

### Synchronized (No Issues)
- Project Health: `Green, Yellow, Red`
- Risk Probability: `Very Low, Low, Medium, High, Very High`
- Issue Types: `Bug, Enhancement, Task, Question, Defect, Support`
- Notification Types: All 10 types match across frontend and backend

---

## 6. Auth Consistency (PASS)

| Pattern | File(s) | Status |
|---------|---------|--------|
| `getUserIdFromRequest` → 401 | `server/routes/*.ts` | Correct |
| `userHasOrgAccess` → 403 | `server/routes/*.ts` | Correct |
| `super_admin` role separation | `shared/models/auth.ts` | Correct |

**Observation:** Some endpoints (portfolios, projects, tasks, issues) return empty arrays instead of 401 when unauthenticated. This is by design — they rely on org-scoped queries that naturally return nothing without a user context.

---

## 7. Index Coverage (Severity: LOW)

### Indexes in `script/migrate.ts` missing from `shared/schema.ts`:
| Index Name | Table | Type |
|-----------|-------|------|
| `idx_tasks_is_milestone` | `tasks` | Filtered (WHERE is_milestone = true) |
| `idx_projects_status` | `projects` | Standard |
| `idx_portfolios_manager_id` | `portfolios` | Standard |
| `idx_timesheet_entries_status` | `timesheet_entries` | Standard |
| `idx_help_tickets_status` | `help_tickets` | Standard |
| `idx_api_request_logs_created_at` | `api_request_logs` | Standard |
| `project_invoices_ext_org_source_idx` | `project_invoices` | Conditional unique |
| `idx_org_integrations_type` | `organization_integrations` | Standard |

### Indexes in `shared/schema.ts` missing from `script/migrate.ts`:
| Index Name | Table | Type |
|-----------|-------|------|
| `projects_org_portfolio_deleted_idx` | `projects` | Composite |
| `tasks_project_deleted_task_idx` | `tasks` | Composite |
| `resources_org_user_idx` | `resources` | Composite |
| `te_user_org_date_idx` | `timesheet_entries` | Composite |
| `te_resource_task_date_idx` | `timesheet_entries` | Composite |

**Impact:** All indexes are created at runtime since both `db:push` (from schema) and `migrate.ts` run. The gap is a maintainability concern, not a runtime issue.

---

## 8. Summary of Changes Made

1. **Created `partner_applications` table** via `db:push`
2. **Added unique index** `external_shares_obj_user_idx` on `externalShares(objectType, objectId, sharedWithUserId)` in `shared/schema.ts` (line 185) to prevent duplicate shares
3. **Added migration** in `script/migrate.ts` (lines 455-459) to deduplicate existing rows and create the index for already-provisioned environments
4. **Converted 4 find-then-insert patterns to atomic `onConflictDoUpdate`:**
   - `upsertProjectCustomFieldValue` in `server/storage/miscStorage.ts` (line 338)
   - `upsertProjectScore` in `server/storage/miscStorage.ts` (line 533)
   - `upsertTimesheetSettings` in `server/storage/timesheetStorage.ts` (line 339)
   - `createExternalShare` in `server/storage/organizationStorage.ts` (line 448)

## 9. Recommendations (Not Implemented)

| Priority | Recommendation | Files |
|----------|---------------|-------|
| LOW | Add Drizzle `.references()` to billing `orgId` columns | `shared/models/billing.ts` |
| LOW | Backport `migrate.ts` indexes into `schema.ts` | `shared/schema.ts`, `script/migrate.ts` |
| LOW | Clean up orphan migration files (0004, 0005) | `migrations/` |
| LOW | Standardize project status enum across frontend/backend | `shared/schema.ts`, `client/src/pages/Projects.tsx` |
| LOW | Add unique constraint on `resources(organizationId, userId)` | `shared/schema.ts` |
