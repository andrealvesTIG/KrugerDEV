# FridayReport.AI — Technical Audit Report

**Date:** March 13, 2026
**Auditor:** Automated Codebase Audit
**Codebase:** Full-stack TypeScript (React + Express + PostgreSQL)

---

## A. Executive Summary

**Overall Health: Functional — Production-ready with areas for improvement**

The application builds and deploys successfully. All 146 declared dependencies are installed and the build pipeline produces correct output. The core architecture is sound: a monorepo with shared types, Drizzle ORM for type-safe database access, and a well-structured deployment configuration.

**Main Findings:**
- 1 build blocker was found and fixed (missing `jspdf` package — now resolved)
- Several N+1 query patterns exist in timesheet routes that will degrade at scale
- 4 source files exceed 5,000 lines (maintainability concern)
- Security posture is generally good but some endpoints have inconsistent input validation
- No critical schema mismatches — the `drizzle-zod` approach keeps layers mostly aligned
- Database indexing gaps on frequently-queried columns
- ~40 potentially unused dependencies adding bundle/install weight

**Readiness:** The app is deployable and functional. The issues below are prioritized for ongoing improvement, not blockers.

---

## B. Critical Issues

### B1. N+1 Queries in Timesheet Routes
- **Severity:** High
- **Category:** Performance
- **Files:** `server/routes.ts` (Lines 19915-19920, 19867-19870, 20316-20455)
- **Description:** Timesheet enrichment loops perform 3 individual DB queries per entry (`getTask`, `getProject`, `getResource`). For 100 entries, this is 300+ queries.
- **Root cause:** Individual `storage.getX()` calls inside `Promise.all(entries.map(...))` instead of batch fetching.
- **Confidence:** High
- **Recommended fix:** Replace with batch `inArray` queries:
  ```typescript
  const taskIds = entries.map(e => e.taskId).filter(Boolean);
  const tasks = await db.select().from(tasksTable).where(inArray(tasksTable.id, taskIds));
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  ```

### B2. Unbounded List Queries (No Pagination)
- **Severity:** High
- **Category:** Performance / Scalability
- **Files:** `server/storage.ts` — `getPortfolios()`, `getProjects()`, `getRisks()`, `getMilestones()`, `getIssues()`, `getResources()`, `getProjectComments()`
- **Description:** Multiple storage methods return ALL records for an organization without limit/offset. As data grows, these will cause memory spikes and slow responses.
- **Confidence:** High
- **Recommended fix:** Add pagination parameters (limit/offset) to storage methods and API routes, with sensible defaults (e.g., limit=100).

### B3. Missing Database Indexes
- **Severity:** Medium
- **Category:** Performance
- **Files:** `shared/schema.ts`
- **Description:** Several frequently-queried column combinations lack indexes:
  - `tasks(projectId, deletedAt)` — used in every task listing
  - `timesheet_entries(userId, organizationId, entryDate)` — used in every timesheet query
  - `timesheet_entries(resourceId, taskId, entryDate)` — used in duplicate detection
  - `projects(organizationId, portfolioId, deletedAt)` — used in project listings
  - `resources(organizationId, userId)` — used in access control checks
- **Confidence:** High
- **Recommended fix:** Add composite indexes in `shared/schema.ts` and run `db:push`.

### B4. Monolithic Source Files
- **Severity:** Medium
- **Category:** Maintainability
- **Files:**
  - `server/routes.ts` — 26,191 lines (1.08 MB)
  - `client/src/pages/SuperAdmin.tsx` — 7,353 lines (321 KB)
  - `client/src/pages/OrgSettings.tsx` — 6,131 lines (256 KB)
  - `server/storage.ts` — 5,301 lines (228 KB)
- **Description:** These files are far beyond maintainable size. `server/routes.ts` at 26K lines triggers Babel parser warnings and makes code review extremely difficult.
- **Confidence:** High
- **Recommended fix:** Split routes into domain-specific modules (e.g., `routes/projects.ts`, `routes/timesheets.ts`). Split large pages into sub-components.

### B5. Inconsistent Request Body Validation
- **Severity:** Medium
- **Category:** Security
- **Files:** `server/routes.ts` — Lines 1616 (user profile update), 2598 (org creation), 1492 (role update)
- **Description:** Some endpoints manually destructure `req.body` without Zod schema validation, while most of the codebase correctly uses `api.X.input.parse(req.body)`. This inconsistency means some endpoints accept unexpected fields.
- **Confidence:** High
- **Recommended fix:** Add Zod schemas for all `req.body` destructuring, following the existing pattern used elsewhere.

### B6. File Upload Authorization Timing
- **Severity:** Medium
- **Category:** Security
- **Files:** `server/routes.ts` — Lines 2454 (avatar upload), 2887 (logo upload)
- **Description:** Multer processes file uploads (into memory) BEFORE the route handler checks authentication/authorization. An unauthenticated user could submit large files that consume server memory before being rejected.
- **Confidence:** Medium
- **Recommended fix:** Add authentication middleware BEFORE the multer middleware on upload routes, or add file size limits to multer config.

### B7. `nanoid` Used but Not in package.json
- **Severity:** Low (works as transitive dependency)
- **Category:** Dependency
- **Files:** `server/vite.ts` (Line 7)
- **Description:** `nanoid` is imported directly but not listed in `package.json`. It works because it's a transitive dependency of another package, but this is fragile — an update to the parent package could remove it.
- **Confidence:** High
- **Recommended fix:** `npm install nanoid`

### B8. TypeScript Path Alias Missing from tsconfig.json
- **Severity:** Low
- **Category:** Config
- **Files:** `tsconfig.json`, `vite.config.ts`
- **Description:** The `@assets` alias is configured in `vite.config.ts` but missing from `tsconfig.json` paths. This causes IDE/TypeScript errors for `@assets/` imports, though builds succeed because Vite handles resolution.
- **Confidence:** High
- **Recommended fix:** Add `"@assets/*": ["./attached_assets/*"]` to `tsconfig.json` paths.

---

## C. Dependency / Package Findings

### Installed and Working
All 123 production dependencies and 23 dev dependencies are present in `node_modules`. The production build succeeds.

### Previously Missing (Fixed)
| Package | Issue | Status |
|---------|-------|--------|
| `jspdf` | Listed in package.json but not installed | **Fixed** — installed |

### Not in package.json but Imported
| Package | Used In | Risk |
|---------|---------|------|
| `nanoid` | `server/vite.ts` | Low — transitive dep, should be explicit |

### Potentially Unused Dependencies (~40)
These packages are in `package.json` but no direct imports were detected in source files. Some may be used indirectly (e.g., `@types/*` packages, build plugins, peer dependencies):

**Likely safe to remove (application code):**
- `gantt-task-react` — no imports found
- `next-themes` — no imports found (app uses custom theme logic)
- `passport-local` — no imports found (uses Replit Auth)
- `google-auth-library` — no imports found
- `zod-validation-error` — no imports found

**Keep (infrastructure/build/types):**
- `@types/*` packages — used by TypeScript compiler
- `tsx`, `typescript`, `autoprefixer`, `postcss` — build tooling
- `@replit/vite-plugin-*` — Replit build plugins
- `@tailwindcss/vite` — Tailwind CSS build integration
- `ws` — may be used by session store or dev server
- `memorystore` — session store fallback
- `nodemailer` — email service (imported dynamically or via services)
- `swagger-jsdoc` — API documentation generation

**Recommendation:** Before removing any package, search for dynamic imports (`require()`, `import()`) and config file references.

---

## D. Schema / Contract Mismatches

### D1. Risk Table Deprecation Inconsistency
- **Mismatch:** `risks` table marked deprecated in schema, but `insertRiskSchema` from it is still used in `api.risks.create`
- **Affected files:** `shared/schema.ts`, `shared/routes.ts` (Line 181), `server/storage.ts` (Line 1368)
- **Impact:** Low — storage layer correctly redirects to `issues` table with `itemType: 'risk'`, but validation schema may not align perfectly
- **Recommendation:** Create a dedicated `insertRiskFromIssuesSchema` that validates against the `issues` table structure

### D2. Project Update Change Tracking Gap
- **Mismatch:** Many project fields exist in schema but aren't tracked in the change history logic
- **Affected files:** `shared/schema.ts` (Lines 224-288), `server/routes.ts` (Line 8622)
- **Impact:** Low — fields save correctly but changes to `projectCode`, `methodology`, `actualCost`, `forecastCost`, etc. won't appear in project history
- **Recommendation:** Add these fields to the tracked changes array

### D3. completionPercentage Type Flexibility
- **Mismatch:** DB schema defines `integer`, API allows optional without strict integer validation
- **Affected files:** `shared/schema.ts` (Line 253), `shared/routes.ts` (Lines 132-147)
- **Impact:** Low — PostgreSQL truncates floats to integers silently
- **Recommendation:** Add `.int()` validation to the Zod schema

### D4. Date Handling Workaround
- **Mismatch:** Manual date parsing in `server/routes.ts` (Lines 413-436) supplements schema validation
- **Impact:** Low — working but indicates the schema-level date validation isn't sufficient for frontend string inputs
- **Recommendation:** Standardize on ISO string dates in API contracts with `.transform()` in Zod schemas

---

## E. Performance Findings

### Critical Performance Problems
| Issue | Impact | Fix |
|-------|--------|-----|
| Timesheet N+1 queries (3N queries per listing) | Response time degrades linearly with entries | Batch fetch with `inArray` |
| Unbounded list queries (no pagination) | Memory spikes, slow responses at scale | Add limit/offset to storage methods |

### Moderate Performance Issues
| Issue | Impact | Fix |
|-------|--------|-----|
| Missing composite indexes on hot paths | Slow queries as data grows beyond ~10K rows | Add indexes in schema |
| Duplicate name checks fetch all records | O(N) memory for a boolean check | Use `count` query or DB unique constraint |
| MPP parsing spawns Java process on main thread | Blocks event loop during file parsing | Move to background worker |
| Bulk timesheet update sequential awaits | High latency for batch operations | Batch database operations |

### Optimization Opportunities
| Issue | Impact | Fix |
|-------|--------|-----|
| Large JS bundles (SuperAdmin 585KB, index 852KB) | Slower initial page loads | Code splitting with dynamic imports |
| `react-pdf` chunk at 1.58MB | Large download for PDF viewing | Lazy load only on pages that need it |
| 26K-line routes file | Slow IDE, harder to maintain | Split into domain modules |

---

## F. Verification Results

| Check | Status | Notes |
|-------|--------|-------|
| Dependencies installed | PASS | All 146 packages present in node_modules |
| Production build | PASS | Completed in ~38s, outputs dist/index.cjs + dist/public/ |
| Build output structure | PASS | Matches .replit deployment config |
| Deployment config | PASS | autoscale target, correct run/build commands |
| Port mapping | PASS | Port 5000 → external 80 |
| Dev server running | PASS | Workflow "Start application" is running |
| TypeScript type check | NOT RUN | Node binary not available in shell session (works in workflow) |
| Tests | NOT RUN | Same environment limitation |
| Lint | NOT RUN | No lint script configured in package.json |

---

## G. Prioritized Action Plan

### Immediate (This Sprint)
1. **Add `nanoid` to package.json** — prevents breakage if transitive dep changes
2. **Add `@assets` path alias to tsconfig.json** — fixes IDE errors
3. **Add composite database indexes** — prevents slow queries as data grows

### Short-Term (Next 2 Sprints)
4. **Fix timesheet N+1 queries** — replace individual fetches with batch `inArray` queries
5. **Add pagination to unbounded list endpoints** — prevents memory issues at scale
6. **Standardize request body validation** — add Zod schemas to all endpoints that manually destructure `req.body`
7. **Add auth middleware before multer** on upload routes

### Medium-Term (Next Quarter)
8. **Split `server/routes.ts`** into domain modules (projects, timesheets, portfolios, admin, etc.)
9. **Split large page components** (SuperAdmin, OrgSettings) into sub-components
10. **Lazy load heavy chunks** (react-pdf, exceljs) only on pages that use them
11. **Audit and remove unused dependencies** — clean up the ~5 clearly unused packages
12. **Align risk schema** with issues table after deprecation

### Long-Term
13. **Add ESLint/Prettier** configuration for consistent code quality
14. **Add automated test coverage** for critical paths (timesheets, project CRUD, auth)
15. **Implement rate limiting** on public endpoints and file uploads

---

## H. Quick Wins

These can be done in minutes with high value:

1. **`npm install nanoid`** — explicit dependency (1 min)
2. **Add `@assets` path to tsconfig.json** — fixes IDE warnings (1 min)
3. **Add database indexes** — paste 5 index definitions in schema, run db:push (10 min)
4. **Add multer file size limit** — `multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } })` (2 min)
5. **Add `.int()` to completionPercentage Zod validation** (1 min)

---

*End of Audit Report*
