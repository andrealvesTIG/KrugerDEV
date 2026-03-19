# FridayReport.AI — Comprehensive Schema & Architecture Analysis Report

**Date:** March 19, 2026  
**Role:** Senior Solution Architect & Database Analyst  
**Scope:** Full repository scan of schema definitions, ORM models, migration files, API contracts, validation schemas, and TypeScript types

---

## 1. Schema Technologies Detected

| Technology | Purpose | Confidence |
|---|---|---|
| **Drizzle ORM** | Primary ORM — all table definitions, relations, insert schemas | **Very High** |
| **PostgreSQL** | Underlying database engine | **Very High** |
| **drizzle-zod** (`createInsertSchema`) | Generates Zod validation schemas from Drizzle table defs | **Very High** |
| **Zod** | Additional hand-written validation (sidebar, risk-assessment config, scheduling defaults, task insert extensions) | **Very High** |
| **drizzle-kit** (`push --force`) | Primary schema synchronization. A `migrations/` folder exists with versioned SQL files but has duplicate numbers and is not the primary deployment mechanism | **Very High** |
| **Raw SQL migrations** (`script/migrate.ts`) | Additive DDL — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` | **Very High** |
| **OpenAPI 3.0 / Swagger UI** (`server/swagger.ts`) | Hand-written OpenAPI spec served via `swagger-ui-express` — 3,500+ lines | **Very High** |
| **express-session + connect-pg-simple** | Session storage in dedicated `sessions` table | **High** |

### Not Used
Prisma, TypeORM, Sequelize, Mongoose, Entity Framework, SQLAlchemy, Yup, Joi, Pydantic — none detected.

---

## 2. Canonical Schema Source

**Source of truth: Drizzle ORM table definitions** spread across four files:

| File | Lines | Tables Defined | Domain |
|---|---|---|---|
| `shared/schema.ts` | 2,794 | ~80 tables + relations + insert schemas + types | Core PPM (projects, tasks, issues, resources, timesheets, etc.) |
| `shared/models/auth.ts` | 97 | 4 tables | Authentication (users, sessions, password_reset_tokens, magic_link_tokens) |
| `shared/models/billing.ts` | 517 | ~20 tables + relations | Billing, subscriptions, usage metering, referrals, transactions |
| `shared/models/chat.ts` | 34 | 2 tables | AI chat (conversations, messages) |

`shared/schema.ts` re-exports all three model files via `export * from "./models/auth"` etc., making it the single import point for the rest of the application.

**Drizzle config** (`drizzle.config.ts`) points to `schema: "./shared/schema.ts"` with `dialect: "postgresql"` and output directory `./migrations`.

**Schema drift guard:** `script/check-schema.ts` (537 lines) programmatically validates all tables, columns, types, nullability, defaults, PKs, and FKs against the live database — reports mismatches. Invoked as `npx tsx script/check-schema.ts --verbose`.

**Confidence: Very High** — Drizzle definitions are authoritative. The build pipeline runs `drizzle-kit push --force` then `script/migrate.ts` for additive changes.

---

## 3. Entity / Table Overview

### 3.1 Core PPM Domain (~35 tables)

| Table | PK | Key FK(s) | Purpose |
|---|---|---|---|
| `organizations` | serial `id` | `ownerId → users.id` | Multi-tenant anchor |
| `organization_members` | serial `id` | `organizationId → organizations.id`, `userId → users.id` | Membership join (unique constraint on org+user) |
| `organization_invites` | serial `id` | `organizationId → organizations.id` | Pending email invites (unique on org+email) |
| `organization_access_requests` | serial `id` | `organizationId`, `userId` | Admin access requests (unique on org+user) |
| `external_shares` | serial `id` | `sourceOrganizationId`, `sharedWithUserId`, `sharedWithResourceId` | Cross-org object sharing |
| `portfolios` | serial `id` | `organizationId`, `managerId`, `businessOwnerId`, `createdBy`, `deletedBy` | Portfolio grouping with soft-delete |
| `custom_portfolio_projects` | serial `id` | `portfolioId → portfolios.id`, `projectId → projects.id` | Custom portfolio ↔ project junction (unique) |
| `projects` | serial `id` | `organizationId`, `portfolioId`, `managerId`, `managerResourceId`, `businessSponsorId`, `sponsorResourceId`, `businessOwnerId`, `ownerResourceId`, `technicalLeadId`, `technicalLeadResourceId`, `createdBy`, `updatedBy`, `completedBy`, `deletedBy` | Central project entity — 50+ columns |
| `billable_status_comments` | serial `id` | `projectId` | Comment log for billable status |
| `health_status_history` | serial `id` | `projectId` | Health status change audit |
| `tasks` | serial `id` | `projectId`, `parentId (self)`, `ownerId`, `assigneeId`, `milestoneId` | Hierarchical tasks for Gantt — supports WBS, CPM fields (ES/EF/LS/LF/TF) |
| `task_change_logs` | serial `id` | `taskId`, `changedBy` | Task audit trail |
| `project_change_logs` | serial `id` | `projectId`, `changedBy` | Project audit trail |
| `issues` | serial `id` | `projectId`, `assigneeId`, `reporterId`, `ownerId`, `reviewerId`, `relatedTaskId`, `escalatedBy`, `deletedBy` | Consolidated issues **and risks** via `itemType` discriminator |
| `issue_change_logs` | serial `id` | `issueId`, `changedBy` | Issue/risk audit trail |
| `task_dependencies` | serial `id` | `taskId → tasks.id`, `dependsOnTaskId → tasks.id` | FS/SS/FF/SF with lag days |
| `milestones` | serial `id` | `projectId`, `ownerId`, `deletedBy` | Project milestones with soft-delete |
| `resources` | serial `id` | `organizationId`, `userId`, `managerId`, `deletedBy` | Team members / resource pool — 30+ columns |
| `task_resource_assignments` | serial `id` | `taskId`, `resourceId` | Task ↔ resource junction |
| `issue_resource_assignments` | serial `id` | `issueId`, `resourceId` | Issue/risk ↔ resource junction |
| `change_requests` | serial `id` | `projectId`, `deletedBy` | Change control |
| `project_documents` | serial `id` | `projectId`, `deletedBy` | Document management |
| `project_comments` | serial `id` | `projectId`, `parentId (self-ref implied)`, `authorId` | Threaded comments |
| `notifications` | serial `id` | `userId`, `organizationId`, `projectId`, `portfolioId`, `taskId`, `milestoneId`, `commentId`, `fromUserId` | Multi-type notification hub |
| `status_report_history` | serial `id` | `projectId`, `organizationId`, `createdBy` | Weekly/monthly report archive |
| `project_invoices` | serial `id` | `projectId`, `organizationId`, `createdBy`, `deletedBy` | Invoice tracking |
| `invoice_notes` | serial `id` | `invoiceId → project_invoices.id` | Invoice comment log |
| `project_financials` | serial `id` | `projectId` | Budget/plan/actuals with CapEx/OpEx |
| `cost_items` | serial `id` | `projectId`, `parentId (self)` | Hierarchical cost items with monthly breakdown (24 month columns) |
| `project_intakes` | serial `id` | `organizationId`, `submitterId`, `portfolioId`, `pmoApprovedBy`, `securityApproverId`, `approvedBy`, `rejectedBy`, `createdProjectId`, `deletedBy` | Intake workflow |
| `intake_workflow_steps` | serial `id` | `organizationId` | Configurable workflow steps per org |
| `mpp_imports` | serial `id` | `organizationId`, `projectId`, `importedBy` | MS Project import metadata |
| `mpp_import_tasks` | serial `id` | `importId → mpp_imports.id` | Imported MPP task records |
| `organization_integrations` | serial `id` | `organizationId` | Integration credentials (encrypted tokens) |

### 3.2 Timesheet & Resource Management (~12 tables)

| Table | PK | Key FK(s) | Purpose |
|---|---|---|---|
| `timesheet_entries` | serial `id` | `organizationId`, `userId`, `resourceId`, `taskId`, `projectId`, `approvedBy`, `rejectedBy`, `proxyUserId` | Core time logging |
| `time_categories` | serial `id` | `organizationId` | Vacation/PTO/sick categories |
| `non_project_time_entries` | serial `id` | `organizationId`, `userId`, `resourceId`, `categoryId → time_categories.id` | Non-project time |
| `timesheet_periods` | serial `id` | `organizationId`, `closedBy`, `reopenedBy`, `createdBy` | Period open/close control |
| `timesheet_settings` | serial `id` | `organizationId` (unique) | Org-level timesheet policies |
| `timesheet_audit_log` | serial `id` | `organizationId`, `actorId`, `targetUserId` | Full timesheet audit |
| `approval_delegations` | serial `id` | `organizationId`, `delegatorId`, `delegateId` | OOO approval delegation |
| `rejection_templates` | serial `id` | `organizationId` | Reusable rejection templates |
| `timesheet_comments` | serial `id` | `organizationId`, `entryId → timesheet_entries.id`, `userId` | Comment threads on entries |
| `timesheet_reminder_settings` | serial `id` | `organizationId` (unique) | Reminder configuration |
| `timesheet_reminder_log` | serial `id` | `organizationId`, `userId` | Reminder delivery log |
| `timesheet_reminder_snooze` | serial `id` | `organizationId`, `userId` | Snooze tracking |
| `timesheet_escalation_log` | serial `id` | `organizationId`, `entryUserId`, `managerId`, `escalatedToId` | Escalation events |
| `resource_availability` | serial `id` | `organizationId`, `resourceId`, `createdBy` | Leave/PTO planning |
| `resource_skills` | serial `id` | `organizationId`, `resourceId` | Normalized skills |

### 3.3 Custom Fields, Views & Dashboards (~8 tables)

| Table | PK | Purpose |
|---|---|---|
| `custom_field_definitions` | serial `id` | Org-scoped custom field defs |
| `project_custom_field_values` | serial `id` | Per-project custom field values |
| `organization_custom_fields` | serial `id` | Org custom fields (appears to overlap with `custom_field_definitions` — see Inconsistencies) |
| `custom_project_tabs` | serial `id` | User-defined project detail tabs |
| `custom_tab_sections` | serial `id` | Sections within custom tabs |
| `custom_tab_fields` | serial `id` | Fields within sections |
| `project_views` | serial `id` | User-scoped saved grid/gantt views |
| `system_project_views` | serial `id` | Admin-managed org-level views |
| `custom_dashboards` | serial `id` | AI-generated dashboard configs |

### 3.4 Scoring, Benefits, Decisions, Lessons (~4 tables)

| Table | PK | Purpose |
|---|---|---|
| `project_scoring_criteria` | serial `id` | Org-level scoring dimensions |
| `project_scores` | serial `id` | Per-project scores on criteria |
| `project_benefits` | serial `id` | Expected/realized benefit tracking |
| `project_decisions` | serial `id` | Decision log |
| `lessons_learned` | serial `id` | Lessons learned with approval workflow |

### 3.5 Simulation (~3 tables)

| Table | PK | Purpose |
|---|---|---|
| `simulation_runs` | serial `id` | Monte Carlo–style simulation sessions |
| `simulation_events` | serial `id` | Individual simulation events |
| `simulation_snapshots` | serial `id` | State at each simulation time step |

### 3.6 Risk Assessment (~2 tables)

| Table | PK | Purpose |
|---|---|---|
| `portfolio_risk_assessments` | serial `id` | AI-generated portfolio risk reports |
| `project_risk_assessments` | serial `id` | AI-generated project risk reports |

### 3.7 Authentication & Sessions (~4 tables, in `shared/models/auth.ts`)

| Table | PK | Key Detail |
|---|---|---|
| `users` | varchar `id` (UUID default) | Central user — email/password + Microsoft + Google OAuth, email verification, professional credentials, technician flag, terms consent |
| `sessions` | varchar `sid` | Express session storage |
| `password_reset_tokens` | varchar `id` (UUID) | Password reset with expiry |
| `magic_link_tokens` | varchar `id` (UUID) | Passwordless auth (signup, signin, resource_invite) |

### 3.8 Billing & Subscriptions (~20 tables, in `shared/models/billing.ts`)

| Table | PK | Purpose |
|---|---|---|
| `plans` | serial `id` | Subscription plans (FREE→ENTERPRISE) with Stripe + PayPal IDs |
| `meters` | serial `id` | Usage meters (credits, ai_runs, documents, projects, tasks) |
| `plan_meter_rules` | serial `id` | Metering rules per plan |
| `features` | serial `id` | Feature flags |
| `plan_features` | serial `id` | Plan ↔ feature junction |
| `subscriptions` | serial `id` | Active subscriptions (Stripe + PayPal) |
| `seat_assignments` | serial `id` | Seat allocation |
| `billing_cycles` | serial `id` | Billing period tracking |
| `usage_events` | serial `id` | Individual usage events (unique `requestId`) |
| `usage_rollups` | serial `id` | Aggregated usage per cycle per meter |
| `invoice_records` | serial `id` | Billing invoices (Stripe/PayPal) |
| `payment_events` | serial `id` | Webhook event dedup (unique `providerEventId`) |
| `billing_audit_logs` | serial `id` | Billing audit trail |
| `resource_credit_costs` | serial `id` | Credit cost per resource type (unique `resourceType`) |
| `referral_codes` | serial `id` | Referral codes per user |
| `referrals` | serial `id` | Referral tracking |
| `referral_payouts` | serial `id` | PayPal payout tracking |
| `billing_transactions` | serial `id` | Payment history |

### 3.9 Chat (~2 tables, in `shared/models/chat.ts`)

| Table | PK | Purpose |
|---|---|---|
| `conversations` | serial `id` | AI chat sessions |
| `messages` | serial `id` | Chat messages (FK → conversations with cascade delete) |

### 3.10 Monitoring & Analytics (~4 tables)

| Table | PK | Purpose |
|---|---|---|
| `api_request_logs` | serial `id` | API request tracking |
| `application_metrics` | serial `id` | Aggregated metrics |
| `user_activity_logs` | serial `id` | User action audit |
| `feature_usage_logs` | serial `id` | Feature usage telemetry |
| `error_logs` | serial `id` | Error tracking |

### 3.11 Miscellaneous

| Table | PK | Purpose |
|---|---|---|
| `help_tickets` | serial `id` | Support tickets with screenshot URLs |
| `user_consents` | serial `id` | Versioned consent tracking (GDPR-style) |
| `report_subscriptions` | serial `id` | Scheduled email report subscriptions |
| `api_tokens` | serial `id` | Bearer tokens for Analytics API (unique `token`, indexed) |
| `training_modules` | serial `id` | Friday Academy modules |
| `training_lessons` | serial `id` | Lessons within modules (cascade delete) |
| `training_quiz_questions` | serial `id` | Quiz questions (cascade delete) |
| `uncon_selfie_leads` | serial `id` | Event lead capture |
| `project_templates` | serial `id` | Reusable project templates |

### 3.12 Legacy / Deprecated Tables (~3 tables)

| Table | Status | Replacement |
|---|---|---|
| `risks` (aliased as `legacyRisks`) | **Deprecated** | `issues` table with `itemType = "risk"` |
| `risk_change_logs` (aliased as `legacyRiskChangeLogs`) | **Deprecated** | `issue_change_logs` |
| `risk_resource_assignments` (aliased as `legacyRiskResourceAssignments`) | **Deprecated** | `issue_resource_assignments` |

---

## 4. Relationship Map (ERD-style Text Summary)

```
USERS ──┬── 1:N ── ORGANIZATIONS (as owner)
        ├── M:N ── ORGANIZATIONS (via organization_members)
        ├── 1:N ── PASSWORD_RESET_TOKENS
        ├── 1:N ── MAGIC_LINK_TOKENS
        ├── 1:N ── USER_CONSENTS
        ├── 1:N ── API_TOKENS
        ├── 1:N ── REFERRAL_CODES ── 1:N ── REFERRALS
        └── 1:N ── REFERRAL_PAYOUTS

ORGANIZATIONS ──┬── 1:N ── PORTFOLIOS ── 1:N ── PROJECTS
                ├── 1:N ── RESOURCES
                ├── 1:N ── ORGANIZATION_MEMBERS
                ├── 1:N ── ORGANIZATION_INVITES
                ├── 1:N ── ORGANIZATION_INTEGRATIONS
                ├── 1:N ── SUBSCRIPTIONS
                ├── 1:N ── TIMESHEET_SETTINGS (1:1 via unique index)
                ├── 1:N ── TIMESHEET_REMINDER_SETTINGS (1:1 via unique index)
                ├── 1:N ── CUSTOM_FIELD_DEFINITIONS
                └── 1:N ── PROJECT_TEMPLATES

PORTFOLIOS ──┬── 1:N ── PROJECTS
             ├── M:N ── PROJECTS (via custom_portfolio_projects)
             ├── 1:N ── PORTFOLIO_RISK_ASSESSMENTS
             └── 1:N ── SIMULATION_RUNS

PROJECTS ──┬── 1:N ── TASKS (hierarchical via parentId)
           ├── 1:N ── ISSUES (includes risks via itemType)
           ├── 1:N ── MILESTONES
           ├── 1:N ── CHANGE_REQUESTS
           ├── 1:N ── PROJECT_DOCUMENTS
           ├── 1:N ── PROJECT_COMMENTS (threaded via parentId)
           ├── 1:N ── PROJECT_FINANCIALS
           ├── 1:N ── COST_ITEMS (hierarchical via parentId)
           ├── 1:N ── PROJECT_INVOICES ── 1:N ── INVOICE_NOTES
           ├── 1:N ── STATUS_REPORT_HISTORY
           ├── 1:N ── PROJECT_RISK_ASSESSMENTS
           ├── 1:N ── BILLABLE_STATUS_COMMENTS
           ├── 1:N ── HEALTH_STATUS_HISTORY
           ├── 1:N ── PROJECT_SCORING_CRITERIA ── 1:N ── PROJECT_SCORES
           ├── 1:N ── PROJECT_BENEFITS
           ├── 1:N ── PROJECT_DECISIONS
           └── 1:N ── LESSONS_LEARNED

TASKS ──┬── M:N ── TASKS (via task_dependencies — self-join)
        ├── M:N ── RESOURCES (via task_resource_assignments)
        ├── 1:N ── TASK_CHANGE_LOGS
        └── 1:N ── TIMESHEET_ENTRIES

ISSUES ──┬── M:N ── RESOURCES (via issue_resource_assignments)
         └── 1:N ── ISSUE_CHANGE_LOGS

RESOURCES ──┬── 1:N ── RESOURCE_AVAILABILITY
            └── 1:N ── RESOURCE_SKILLS

SUBSCRIPTIONS ──┬── 1:N ── BILLING_CYCLES ── 1:N ── USAGE_EVENTS
                ├── 1:N ── USAGE_ROLLUPS
                ├── 1:N ── INVOICE_RECORDS
                └── 1:N ── BILLING_TRANSACTIONS

PLANS ──┬── 1:N ── PLAN_METER_RULES ── N:1 ── METERS
        └── 1:N ── PLAN_FEATURES ── N:1 ── FEATURES

TRAINING_MODULES ── 1:N ── TRAINING_LESSONS ── 1:N ── TRAINING_QUIZ_QUESTIONS
```

---

## 5. Inconsistencies Found

### 5.1 Duplicate Custom Field Tables (Severity: Medium)
- **`organization_custom_fields`** (line 2600) and **`custom_field_definitions`** (line 1885) both define org-scoped custom fields with nearly identical structure (`name`, `fieldType`, `options`, `required/isRequired`, `description`, `displayOrder`, `isActive`).
- **Impact:** Ambiguity about which table is canonical for custom fields. `project_custom_field_values.fieldDefinitionId` references `custom_field_definitions`, suggesting that table is the active one.
- **Confidence: High**

### 5.2 Missing Drizzle FK on `subscriptions.orgId` and `seatAssignments.orgId` (Severity: Medium)
- Both tables have `orgId: integer("org_id")` with comments "FK to organizations(id) enforced at database level" — but **no `.references(() => organizations.id)`** in the Drizzle definition.
- **Impact:** Drizzle-kit push won't create the FK constraint; it relies on manual DB enforcement. `check-schema.ts` won't validate these FKs.
- **Confidence: Very High**

### 5.3 `numeric` Custom Type Returns Number, Not String (Severity: Medium)
- A custom `numeric` type (line 6-10 of `schema.ts`) wraps Drizzle's numeric to auto-convert to/from `Number`. This works for most values but can silently lose precision for large numbers (> 2^53).
- **Impact:** Financial fields like `budget`, `actualCost`, `forecastCost`, `contractTotal`, etc. use this. For enterprise portfolios with very large budgets, precision could be lost.
- **Confidence: High**

### 5.4 `tokens_encrypted` Type Mismatch Between Schema and Migration (Severity: High)
- **Drizzle schema** (`shared/schema.ts:1304`): `tokensEncrypted: text("tokens_encrypted")` — defined as **text**.
- **Manual migration** (`script/migrate.ts:264`): `ALTER TABLE organization_integrations ADD COLUMN IF NOT EXISTS tokens_encrypted BOOLEAN DEFAULT false` — creates it as **boolean**.
- Because `migrate.ts` uses `IF NOT EXISTS`, whichever ran first wins. If `drizzle-kit push` ran first, the column is `text`; if `migrate.ts` ran first, it's `boolean`. The schema and migration disagree.
- **Impact:** Code checking `tokensEncrypted` may compare against boolean `true`/`false` or string `"true"`/`"false"` depending on the actual DB column type. This can silently break encryption-state logic.
- **Confidence: Very High**

### 5.5 `notifications.riskIssueId` Missing FK (Severity: Low)
- `riskIssueId: integer("risk_issue_id")` has no `.references()` — used polymorphically for both issues and legacy risks.
- **Impact:** No referential integrity. Could reference deleted rows.
- **Confidence: Very High**

### 5.6 `project_comments.parentId` Missing FK (Severity: Low)
- `parentId: integer("parent_id")` for threaded replies has no `.references()` to itself.
- **Impact:** No DB-enforced referential integrity on comment threading.
- **Confidence: Very High**

### 5.7 `cost_items.parentId` Missing FK (Severity: Low)
- Same pattern as project_comments — self-referential hierarchy without a DB-level FK.
- **Confidence: Very High**

### 5.8 Legacy Risk Tables Still in Schema (Severity: Low)
- `legacyRisks`, `legacyRiskChangeLogs`, `legacyRiskResourceAssignments` are defined in schema with comments marking them deprecated. They still exist in the database.
- **Impact:** No functional impact unless code accidentally queries them. They consume schema space and could confuse new developers.
- **Confidence: Very High**

### 5.9 OpenAPI Spec May Drift from Implementation (Severity: Medium)
- `server/swagger.ts` (3,500+ lines) is hand-written, not auto-generated from Drizzle schemas or route handlers. There's no automated validation that API contracts match the actual implementation.
- **Impact:** API documentation may become stale as new endpoints or fields are added.
- **Confidence: High**

### 5.10 `timeCategories` Has Both `displayOrder` and `sortOrder` (Severity: Low)
- Two ordering columns serve the same purpose. Only one is needed.
- **Confidence: Very High**

### 5.11 Duplicate Migration File Numbers (Severity: Medium)
- The `migrations/` directory contains conflicting migration numbers:
  - `0002_timesheet_controls.sql` AND `0002_whole_vance_astro.sql`
  - `0003_manager_review_workflow.sql` AND `0003_talented_blockbuster.sql`
- These have overlapping DDL and were generated at different times. While `drizzle-kit push --force` is the primary sync mechanism (making migrations mostly informational), duplicate numbers break deterministic replay if migrations are ever used for deployment.
- **Confidence: Very High**

---

## 6. Risks

### 6.1 Production-Breaking Risks

| Risk | Severity | Detail |
|---|---|---|
| **`tokens_encrypted` type mismatch** | **High** | Schema defines `text`, migration creates `boolean`. Encryption-state logic may silently break depending on which ran first. |
| **Missing billing FK constraints** | **High** | `subscriptions.orgId` and `seatAssignments.orgId` lack Drizzle-level FKs. If a DB migration recreates tables, orphaned subscriptions could result. |
| **Numeric precision loss on financials** | **Medium** | Custom `numeric` type converts to JS `Number`. Budgets exceeding ~$9 quadrillion are safe, but it's an anti-pattern for financial data. |
| **OpenAPI spec drift** | **Medium** | New endpoints or field changes can ship without updating `swagger.ts`, leading to incorrect API documentation for external consumers. |
| **Dual-track schema management with migration conflicts** | **Medium** | `drizzle-kit push --force` + additive `migrate.ts` creates a dual-track approach. A `migrations/` folder exists with versioned files but has duplicate numbers (0002, 0003) and is not the primary deployment mechanism. There is no rollback mechanism for schema changes. |

### 6.2 Technical Debt Risks

| Risk | Severity | Detail |
|---|---|---|
| **Duplicate custom field tables** | **Medium** | Two tables (`organization_custom_fields` and `custom_field_definitions`) for the same concept creates maintenance confusion. |
| **Legacy risk tables** | **Low** | Dead tables in the database waste space and could cause confusion. |
| **SuperAdmin.tsx > 7,200 lines** | **Low** | Not a schema issue but a code organization concern flagged during analysis. |
| **Self-referential FKs missing** | **Low** | `project_comments.parentId`, `cost_items.parentId` lack referential integrity. |

### 6.3 Schema Drift Assessment

**Overall schema drift: Low.** The `check-schema.ts` validator (110 tables, 1,517 columns, 249 FKs) provides strong evidence that Drizzle definitions and the live database are kept in sync. The dual-track approach (drizzle-kit push + manual migrate.ts) works well for additive changes but would be risky for destructive ones.

**Confidence: High**

---

## 7. Recommended Fixes

### Priority 1 — High Impact, Low Effort

1. **Resolve `tokens_encrypted` type mismatch**
   - Change Drizzle schema from `text("tokens_encrypted")` to `boolean("tokens_encrypted").default(false)`.
   - On the live DB, run: `ALTER TABLE organization_integrations ALTER COLUMN tokens_encrypted TYPE boolean USING tokens_encrypted::boolean`.
   - Verify all code paths that read/write this column handle the correct type.

2. **Add Drizzle FK references to `subscriptions.orgId` and `seatAssignments.orgId`**
   - Change to `.references(() => organizations.id)` and run `db:push`.
   - Risk: Must verify no orphaned rows exist first.

3. **Consolidate or deprecate one of `organization_custom_fields` / `custom_field_definitions`**
   - Determine which is actively used (likely `custom_field_definitions` since `project_custom_field_values` references it).
   - Mark the unused one as legacy with a comment, or migrate data and drop it.

4. **Remove duplicate `displayOrder`/`sortOrder` from `time_categories`**
   - Pick one column, migrate data, drop the other.

5. **Clean up duplicate migration file numbers** in `migrations/` (0002 and 0003 conflicts).

### Priority 2 — Medium Impact

6. **Add self-referential FKs** on `project_comments.parentId`, `cost_items.parentId`, and `notifications.riskIssueId` (to `issues.id`)
   - Adds referential integrity. Must verify no orphaned references first.

7. **Consider using `decimal.js` or `bigint`** for financial fields if budgets > $9T are expected. Current approach is functional but not ideal for financial-grade precision.

### Priority 3 — Maintenance

8. **Plan for legacy risk table cleanup**
   - Verify no application code reads from `risks`, `risk_change_logs`, `risk_resource_assignments`.
   - If clean, drop or archive tables.

9. **Auto-generate OpenAPI spec** or add CI validation that `swagger.ts` stays synchronized with route implementations.

10. **Formalize migration strategy** — either commit to `drizzle-kit push` as the sole mechanism (and remove the `migrations/` folder) or adopt versioned migration files via `drizzle-kit generate` for production deployments.

---

## 8. Top 10 Most Important Schema Files

| Rank | File | Why |
|---|---|---|
| 1 | `shared/schema.ts` | **Primary schema** — 80+ tables, all relations, all insert schemas, all types |
| 2 | `shared/models/auth.ts` | **Users table** — central to every FK in the system |
| 3 | `shared/models/billing.ts` | **Billing domain** — 20 tables, Drizzle relations, Stripe/PayPal integration |
| 4 | `shared/models/chat.ts` | AI chat tables |
| 5 | `drizzle.config.ts` | Drizzle-kit configuration (schema pointer, dialect, output dir) |
| 6 | `script/migrate.ts` | **Additive migrations** — indexes, new tables, new columns |
| 7 | `script/check-schema.ts` | **Schema integrity validator** — cross-checks Drizzle vs live DB |
| 8 | `server/swagger.ts` | **OpenAPI 3.0 spec** — API contract documentation |
| 9 | `server/routes/helpers.ts` | Auth helpers, encryption key, shared route utilities |
| 10 | `server/db.ts` / `server/storage.ts` | Database connection + storage layer (data access) |

---

## 9. Items That Could Not Be Verified Directly

| Item | Reason |
|---|---|
| Exact live DB table/column counts | Would require running `check-schema.ts` against production. Relying on documented "110 tables, 1,517 columns, 249 FKs" from replit.md. |
| Whether `organization_custom_fields` data is actually used in production | Would require querying live DB to check row count. |
| Whether legacy `risks` table has any remaining data | No live DB access during this analysis. |
| Complete Stripe/PayPal webhook integration correctness | `payment_events` table handles dedup, but full webhook flow wasn't traced. |
| Whether all OpenAPI endpoints in `swagger.ts` match actual registered routes | Would require programmatic cross-referencing of routes vs spec paths. |

---

## 10. Practical Action Plan

### Immediate (This Sprint)
1. **Resolve `tokens_encrypted` type mismatch** — Decide on boolean (logical choice), update Drizzle schema from `text` to `boolean`, and run `ALTER TABLE organization_integrations ALTER COLUMN tokens_encrypted TYPE boolean USING tokens_encrypted::boolean` on the live DB. Verify all code paths that read/write this column.
2. Add FK references to `subscriptions.orgId` and `seatAssignments.orgId`
3. Remove duplicate `sortOrder`/`displayOrder` from `time_categories`
4. Clean up duplicate migration file numbers in `migrations/` (resolve 0002 and 0003 conflicts)

### Short-Term (Next 2 Sprints)
5. Consolidate `organization_custom_fields` vs `custom_field_definitions`
6. Add self-referential FK constraints on `project_comments.parentId` and `cost_items.parentId`
7. Add FK on `notifications.riskIssueId` to `issues.id`
8. Run `check-schema.ts --verbose` in CI pipeline to catch drift early

### Medium-Term (This Quarter)
9. Plan and execute legacy risk table cleanup (drop `risks`, `risk_change_logs`, `risk_resource_assignments`)
10. Evaluate auto-generated OpenAPI spec (e.g., `drizzle-openapi` or route-based generation)
11. Introduce versioned migration files for production deployments alongside `push` for dev

### Long-Term
12. Evaluate `decimal.js` for financial precision if enterprise customers exceed JS Number safe range
13. Consider schema documentation generation (ERD diagrams from Drizzle definitions)

---

*End of Report*
