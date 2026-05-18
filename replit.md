# FridayReport.AI

Enterprise project portfolio management app — portfolios, projects, tasks, resources, risks, issues, key dates, financials, and AI assistants.

## Stack

*   **Frontend**: React 18, TypeScript, Wouter, TanStack React Query, React Hook Form, Zod, `@tanstack/react-virtual`, Tailwind, shadcn/ui, Recharts, Framer Motion
*   **Backend**: Express, TypeScript, PostgreSQL, Drizzle ORM
*   **Auth**: Replit Auth (OIDC), Passport.js, express-session
*   **Build / Test**: Vite, Vitest

## Where things live

*   **DB Schema**: `shared/schema.ts`, `shared/models/*.ts` (source of truth)
*   **API contracts**: `/api-docs` (Swagger), `/api-docs.json` (OpenAPI 3.0) — auto-generated from Drizzle tables
*   **Shared logic**: `shared/lib/*` (calendar engine, scheduling, capacity, etc.)
*   **AI agents**: `server/services/jarvisService.ts`, `server/services/powerbiAgentService.ts`, `server/services/customAgentService.ts`
*   **User Guide**: `client/src/pages/UserGuide.tsx` (auth), `client/src/pages/PublicUserGuide.tsx` (public, `/guide`)
*   **Permissions / Roles**: see [Roles & Permissions](#roles--permissions-rbac)
*   **Enterprise calendar**: see [Enterprise Calendar](#enterprise-calendar)
*   **Configurable forms**: admin DnD editors for the Project Summary tab and Intake form layout, both stored per-org in `*_tabs` / `*_tab_sections` / `*_tab_items` tables. Registries at `shared/projectFormRegistry.ts` and `shared/intakeFormRegistry.ts`. Renderers at `client/src/components/project/ProjectFormRenderer.tsx` and `client/src/components/intake/IntakeFormRenderer.tsx`. Admin UIs at Settings → Governance → Project Form / Intake Form.
*   **Intake blocks**: financials grid, architecture/cybersecurity Y/N questions, costing checklist — each has its own table in `shared/schema.ts`, a default catalog in `shared/intake*Defaults.ts`, CRUD routes in `server/routes/intakeRoutes.ts`, and a per-step visibility toggle on `intake_workflow_steps`.

## Architecture decisions

*   **Drizzle is the single source of truth** — OpenAPI schemas, API routes, and shared types are generated from `shared/schema.ts`.
*   **Schema drift detection** — boot aborts if the DB doesn't match the schema. Always `npm run db:push` after editing `shared/schema.ts`.
*   **Multi-tenant + RBAC** — soft delete + organization-scoped access everywhere. See [Roles & Permissions](#roles--permissions-rbac).
*   **Security first** — soft delete, email verification, bot protection, versioned consent, encrypted OAuth tokens, helmet headers, auth rate limiting.
*   **Auto Number custom fields** — `fieldType='autonumber'` carries a mask (`N###`) and `nextSequence`; values are server-assigned via atomic SQL increment in `assignAutonumberValuesForEntity`.
*   **Resource / Attachment custom fields** — `resource` stores a resource id, renders the resource's display name. `attachment` stores `{path,name,size,type}` JSON where `path` is an `/objects/...` URL from the presigned-URL upload flow.
*   **Upload fallback** — `POST /api/uploads/request-url` tries Replit Object Storage first; on failure returns a same-origin `/api/uploads/local/<uuid.ext>` URL backed by `public/uploads/`. `GET /objects/:path(*)` falls back to that directory too.

## Product

Core PPM (portfolios / projects / tasks / resources / risks / issues / key dates / change requests / documents) · Gantt with CPM, undo/redo, FS/SS/FF/SF dependencies · AI assistants (Friday / Power BI / custom agents) with voice and attachments · Construction suite (daily logs, RFIs, submittals, drawings, punch list, QA/safety, bidding) · Financials (hierarchical cost items, multi-year WBS, change order workflow, invoicing) · Timesheets with audit, approval workflow, escalations · Analytics dashboards, PMO Radar, templates · Meetings, correspondence, cross-project refs · User profiles, achievements, Friday Academy.

## Roles & Permissions (RBAC)

*   **Source of truth**: `shared/permissionCatalog.ts` (`PERMISSIONS` map + `PERMISSION_CATALOG`). Every entity area (Portfolios, Programs, Projects, Tasks, Intakes, Risks, Issues, Resources) uses the same `view / create / update / delete` pattern. Org / Roles / Financials / Timesheets / Reports use domain-specific keys.
*   **Built-in roles**: `shared/permissionDefaults.ts` — 10 roles (system_admin, pmo_admin, portfolio_manager, project_manager, resource_manager, finance_manager, timesheet_approver, executive_viewer, team_member, read_only) + `mapLegacyMemberRole()` backfill.
*   **Tables**: `roles`, `permissions`, `role_permissions`, `user_roles` (`shared/schema.ts`).
*   **Enforcement**: `server/services/authorizationService.ts` — `requirePermission(key)` middleware, `enforcePermission(req,res,userId,orgId,key)` / `enforceMembership(...)` helpers, `userHasPermission`, `getUserPermissions` (per-request cache), `syncPermissionCatalog`, `seedDefaultRolesForOrg` (idempotent, re-applies built-in role permission sets on every boot, leaves custom roles alone, backfills `user_roles` from legacy `organization_members.role`). Both run in the boot loop in `server/index.ts`.
*   **Routes**: `server/routes/roleRoutes.ts` — `/api/me/permissions`, `/api/permissions/catalog`, full CRUD under `/api/organizations/:orgId/roles`, clone, member-role assignment.
*   **Frontend**: `client/src/hooks/use-permissions.tsx` exports `usePermissions()` (`has` / `hasAny` / `hasAll`) and `<Can>`. Admin UI at `/roles` and as the **Roles & Permissions** tab in Organization Settings (`client/src/pages/RolesAndPermissions.tsx`).
*   **Bypass rule**: only platform `super_admin` (`users.role`) bypasses RBAC. All other accounts must be explicit org members holding the right permissions. The existing `userHasOrgAccess` check stays as an additive membership gate.

## Enterprise Calendar

Calendar-aware scheduling. Precedence: **project/org calendar → resource calendar restricts → approved PTO on top**. Falls back to Mon–Fri 8h when no calendar is set. Engine + tests in `shared/lib/calendarEngine.ts` and `tests/calendarAwareScheduling.test.ts`.

### Engine

*   `defaultLegacyResolvedCalendar()` — Mon–Fri 8h fallback.
*   `withAdditionalNonWorkingWindows(base, windows)` — folds non-working windows; `intervals` makes a window partial-day.
*   `subtractPtoFromIntervals(intervals, ptoHours)` — trims PTO from end of day.
*   `composeResourceEffectiveCalendar(projCal, resourceCal, availabilityRows, horizon?)` — single source of truth. Folds PTO → resource full-day-off → resource partial-day intersection. Resource intervals are intersected at minute precision with the project. Horizon defaults to today−30d → +5y; **callers must pin it for far-future task ranges**.
*   `workingHoursBetween(cal, start, end)` — actual working hours over a window.

### Date math

*   `client/src/lib/workingDays.ts` — `*Cal` overloads walk day-by-day via the engine when a calendar is supplied, else fall back to legacy Mon–Fri.
*   `client/src/lib/cpm.ts` — `calculateCPM(tasks, deps, calendar?)` threads the calendar through forward + backward passes and all helpers.

### Storage / routes / hooks

*   `server/storage/calendarStorage.ts` — resolves project → org default → null; loads resolved calendars.
*   `server/routes/calendarRoutes.ts` — `GET /api/projects/:id/resolved-calendar`, `GET /api/resources/:id/resolved-calendar?projectId=` (folds approved `resource_availability` rows via `withAdditionalNonWorkingWindows`; partial-day rows with `hoursPerDay` become per-date residual-interval windows).
*   `client/src/hooks/use-resolved-calendar.ts` — `useProjectResolvedCalendar`, `useResourceResolvedCalendar`.

### Wired consumers

*   **CPM / Gantt** — `ProjectGanttView` passes the resolved calendar to `calculateCPM`.
*   **Schedule propagation** — `propagateScheduleForProject` resolves the project calendar at function entry and threads it through every `*Cal` helper (lag recompute, dep-create constraint enforcement).
*   **MPP/XER import** — `convertMppImportToProject` / `syncMppImportToProject` use `calculateEndDateCal` so duration-derived end dates honour org holidays.
*   **Assignment scheduler** — `updateTaskResourceAssignments` delegates to `estimateTaskAssignmentHours` (DI'd resource-calendar + availability loaders, unit-testable). Per-resource hours = `workingHoursBetween(composed, taskStart, taskEnd) × allocPct`, with the compose horizon pinned to the task's date range. Falls back to `weeklyCapacity/5 × durationDays` only when dates are absent.
*   **AI optimizer** — adds `effectiveHoursNext30Days` per resource (PTO-aware) alongside legacy `weeklyCapacity`.
*   **Capacity planning** — `computeEffectiveCapacity()` in `shared/lib/capacityCalc.ts` returns `{effectiveHoursInRange, effectiveWeeklyHours, weeksInRange}`. `GET /api/organizations/:orgId/resource-utilization` defaults the range to today→+27d and returns calendar-aware fields. `CapacityPlanningView` shows tooltips with the range total.

### Phase 3a partial-day PTO

Engine supports partial-day windows; resource resolved-calendar route expands `resource_availability` rows with `hoursPerDay` into per-date residual windows. Rows without `hoursPerDay` keep legacy full-day-off behaviour. Wired into the assignment scheduler, AI optimizer, and capacity planning.

### Deferred

Gantt timeline drag/resize snap-to-working-time (drag/resize doesn't exist today) · `CreateTaskDialog` / `IntakeDetails` interactive duration math · `WorkloadDashboard` / `DemandForecast` migration from `effectiveWeeklyHours` to `effectiveHoursInRange` · in-flight dedupe for resource-calendar loads.

## Gotchas

*   **Schema changes** — always run `npm run db:push` after editing `shared/schema.ts` / `shared/models/*.ts`. Forgetting aborts the dev server boot.
*   **Investor Room password** — env var only, no hardcoded fallback.
*   **Required notifications** — transactional emails (sign-in, password reset, etc.) are locked on.

## Pointers

*   OpenAPI: `/api-docs`
*   Public guide: `/guide`
*   Roles admin: `/roles` or Org Settings → Roles & Permissions

## User preferences

Preferred communication style: Simple, everyday language.
