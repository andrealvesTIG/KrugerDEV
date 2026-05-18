# FridayReport.AI

FridayReport.AI is an enterprise-grade project portfolio management application for comprehensive oversight of projects, portfolios, risks, key dates, and issues.

## Run & Operate

_Populate as you build_

## Stack

*   **Frontend**: React 18, TypeScript, Wouter, TanStack React Query, React Hook Form, Zod, `@tanstack/react-virtual`, Tailwind CSS, shadcn/ui, Recharts, Framer Motion
*   **Backend**: Express.js, TypeScript, PostgreSQL, Drizzle ORM
*   **Authentication**: Replit Auth (OpenID Connect), Passport.js, express-session
*   **Build Tool**: Vite
*   **Testing**: Vitest

## Where things live

*   **DB Schema**: `shared/schema.ts`, `shared/models/*.ts` (source of truth for API auto-generation)
*   **API Contracts**: `/api-docs` (Swagger UI), `/api-docs.json` (OpenAPI 3.0 spec)
*   **Notification Catalog**: `shared/notificationCatalog.ts`
*   **Email Services**: `server/services/email.ts`
*   **Jarvis AI Agent**: `server/services/jarvisService.ts`, `server/routes/jarvisRoutes.ts`, `client/src/hooks/use-jarvis.ts`, `client/src/components/jarvis/JarvisPanel.tsx`
*   **Power BI Agent**: `server/services/powerbiAgentService.ts`, `server/routes/powerbiAgentRoutes.ts`, `client/src/pages/PowerBIAgent.tsx`
*   **Custom AI Agents**: `server/services/customAgentService.ts`, `server/routes/customAgentRoutes.ts`, `client/src/pages/Agents.tsx`
*   **User Guide**: `client/src/pages/UserGuide.tsx` (authenticated), `client/src/pages/PublicUserGuide.tsx` (public)
*   **Project Templates**: `client/src/pages/Templates.tsx`
*   **Financial Grid Export**: `client/src/lib/financialGridExport.ts`
*   **Fiscal Calendar Logic**: `shared/lib/fiscalCalendar.ts`
*   **Custom Field Attachment Component**: `client/src/components/custom-fields/AttachmentField.tsx`
*   **Intake Financials**: `client/src/components/intake/IntakeFinancialsSection.tsx`, `client/src/hooks/use-intake-financials.ts`, `intakeFinancials` table in `shared/schema.ts`, CRUD routes in `server/routes/intakeRoutes.ts` (`/api/project-intakes/:intakeId/financials`, `/api/intake-financials/:id`)
*   **Intake Governance Questions** (Architecture & Cybersecurity Y/N grids): `client/src/components/intake/IntakeGovernanceQuestionsSection.tsx` (takes `category` prop), `client/src/hooks/use-intake-governance-questions.ts`, `intakeGovernanceQuestions` table in `shared/schema.ts`, CRUD routes in `server/routes/intakeRoutes.ts` (`/api/project-intakes/:intakeId/governance-questions`, `/api/intake-governance-questions/:id`). Per-step visibility toggles `showArchitectureQuestions` / `showCybersecurityQuestions` on `intake_workflow_steps`. Default question catalog in `shared/intakeGovernanceDefaults.ts` is lazily seeded on first list-fetch per intake/category. Answers are restricted to Yes/No (no blank) and the IntakeDetails "Next Gate" button blocks advancement when the current step shows a questionnaire and any row is unanswered.
*   **Intake Costing Checklist** (bottom-up FTE/cost grid per intake): `client/src/components/intake/IntakeCostingChecklistSection.tsx`, `client/src/hooks/use-intake-costing-checklist.ts`, `intakeCostingChecklist` table in `shared/schema.ts` (columns: category, question, resourceName, costType opex/capex, ftePermanentDays, fteConsultantDays, projectCost, comments, position). CRUD routes in `server/routes/intakeRoutes.ts` (`/api/project-intakes/:intakeId/costing-checklist`, `/api/intake-costing-checklist/:id`). Default catalog in `shared/intakeCostingDefaults.ts` (also exports `FTE_PERMANENT_RATE_PER_DAY=700` and `FTE_CONSULTANT_RATE_PER_DAY=1100`) is lazily seeded on first list-fetch per intake (advisory-lock guarded). Per-step visibility toggle `showCostingChecklist` on `intake_workflow_steps`. Block key in `INTAKE_BLOCKS`: `costing_checklist`.
*   **Enterprise Calendar**: see the dedicated [Enterprise Calendar](#enterprise-calendar) section below.
*   **Programs**: `programs` table in `shared/schema.ts` (fields: name*, status default Active, description, businessCase, ownerId* FK users, budget/benefit/roi numerics) + `projects.programId` FK + `project_intakes.programId` is now a real FK. Storage `server/storage/programStorage.ts` (CRUD + `setProgramProjects` bulk associate). Routes `server/routes/programRoutes.ts` (`/api/programs` CRUD, `GET/PUT /api/programs/:id/projects`, `POST/DELETE /api/programs/:id/projects/:projectId`). Hook `client/src/hooks/use-programs.ts`. Pages `client/src/pages/Programs.tsx` (list + create/edit dialog) and `client/src/pages/ProgramDetails.tsx` (form modeled on MS Project for the Web Program form + associated-projects table with Manage Projects picker). Sidebar `programs` module key under the Portfolio group.
*   **Configurable Project Form Layout** (admin-editable per-org tabs/sections/items driving the project Summary tab): tables `projectFormTabs` / `projectFormTabSections` / `projectFormTabItems` in `shared/schema.ts`. Catalog of placeable items in `shared/projectFormRegistry.ts` (`PROJECT_FORM_FIELDS` for built-in projects columns, `PROJECT_FORM_BLOCKS` with the `custom_fields` block). Default 4-tab layout in `shared/projectFormTabDefaults.ts`. Storage in `server/storage/projectFormLayoutStorage.ts` (`getProjectFormLayout`, `replaceProjectFormLayout` with advisory lock `0x5052464C`='PRFL', `seedDefaultProjectFormLayoutIfMissing`, `resetProjectFormLayoutToDefaults`). Routes in `server/routes/projectRoutes.ts`: `GET/PUT /api/organizations/:orgId/project-form-layout`, `POST .../reset`. Client hook `client/src/hooks/use-project-form-layout.ts`. Renderer `client/src/components/project/ProjectFormRenderer.tsx` (+ `ProjectFieldRenderer.tsx` for built-in fields with on-blur draft buffer, `ProjectSingleCustomField.tsx` for individually-placed custom fields) drives the Summary tab on `client/src/pages/ProjectDetails.tsx` via the local `ProjectFormSummary` helper. Admin DnD editor at Settings → Governance → Project Form: `client/src/components/settings/ProjectFormLayoutSection.tsx` (mirrors the intake editor; sortable tabs/sections/items with cross-section drag and "move to…" menu for cross-tab).
*   **Power BI Intake Tab Toggle**: org-level boolean `organizations.showPowerBiIntake` (default true). Toggled via Settings → Governance → Intake (`PowerBiIntakeToggleCard` in `client/src/components/settings/GovernanceSection.tsx`) → `PUT /api/organizations/:id { showPowerBiIntake }` (allowlisted in `server/routes/organizationRoutes.ts`). Consumed in `client/src/pages/ProjectIntakes.tsx` to hide the "Power BI Requests" tab button and auto-switch back to the Project tab if the user was on Power BI when it gets disabled. Power BI Agent itself stays reachable via `/powerbi-agent`.
*   **Per-Item Required Toggle (Intake)**: each `intake_tab_items` row has an `isRequired` boolean (default false). Toggled via the "Required/Optional" pill in the IntakeFormLayoutSection editor (testid `button-toggle-required-{uid}`). Defaults seeded for `projectName` and `description`. Enforced in `client/src/components/workflow/WorkflowStepRequirementsDialog.tsx` `layoutValidationErrors`: built-in fields are required iff `item.isRequired`; custom fields are required iff `item.isRequired || def.isRequired`. Block items are skipped. Replaces the old hardcoded `BUILTIN_INTAKE_REQUIRED={'title'}` / `BUILTIN_PROJECT_REQUIRED={'name'}` sets.
*   **Configurable Intake Form Layout** (admin-editable per-org tabs/sections/items): tables `intakeTabs` / `intakeTabSections` / `intakeTabItems` in `shared/schema.ts`. Catalog of placeable items in `shared/intakeFormRegistry.ts` (`INTAKE_FIELDS` for built-in projectIntakes columns, `INTAKE_BLOCKS` for composite widgets like `custom_fields`, `financials_grid`, `architecture_questions`, `cybersecurity_questions`, `budget_summary`, `pm_approval`, `source_conversation`). Default 5-tab layout in `shared/intakeTabDefaults.ts`. Storage in `server/storage/intakeStorage.ts` (`getIntakeTabLayout`, `replaceIntakeTabLayout`, `seedDefaultIntakeTabLayoutIfMissing`, `resetIntakeTabLayoutToDefaults`). Routes in `server/routes/intakeRoutes.ts`: `GET/PUT /api/organizations/:orgId/intake-tab-layout`, `POST .../reset`. Client hook `client/src/hooks/use-intake-tab-layout.ts`. Renderer `client/src/components/intake/IntakeFormRenderer.tsx` (+ `IntakeFieldRenderer.tsx`) drives `client/src/pages/IntakeDetails.tsx`. Admin DnD editor at Settings → Governance → Intake Form: `client/src/components/settings/IntakeFormLayoutSection.tsx` (dnd-kit; sortable tabs/sections/items with cross-section drag and "move to…" menu for cross-tab). Layout is global per-org (same on every gate); the `financials_grid` / `architecture_questions` / `cybersecurity_questions` blocks still respect the per-step `showFinancials` / `showArchitectureQuestions` / `showCybersecurityQuestions` toggles for visibility.

## Architecture decisions

*   **API Auto-generation**: OpenAPI schemas are auto-generated directly from Drizzle ORM table definitions to ensure consistency. Drizzle tables are the single source of truth.
*   **Shared Codebase**: Common schemas, route definitions, and models are shared between frontend and backend to maintain type safety and consistency.
*   **Security First**: Implemented soft-delete, mandatory email verification, bot protection, versioned user consent, encrypted OAuth tokens, `helmet` HTTP headers, and rate limiting on auth endpoints. All API endpoints enforce authentication and role-based access control.
*   **Multi-tenancy & RBAC**: The data model supports multi-tenancy with soft-delete and granular role-based access control across all entities.
*   **Page-Based UI**: Enterprise-grade UI inspired by Linear and Asana, utilizing a page-based architecture with reusable components and Tailwind CSS for styling.
*   **Schema Drift Detection**: Critical schema drift check runs at server boot, aborting dev builds if schema doesn't match the DB, ensuring schema integrity.
*   **Auto Number Custom Fields**: Definitions with `fieldType='autonumber'` carry a `mask` (e.g. `N###`) and a `nextSequence` counter. Values are server-assigned on entity creation via `assignAutonumberValuesForEntity` (atomic SQL increment) and rejected by all CF value upsert/delete routes — masks are limited to a single `#` run.
*   **Resource & Attachment Custom Fields**: `fieldType='resource'` stores a resource id as the CF value and renders the resource's `displayName`. `fieldType='attachment'` stores `JSON.stringify({path, name, size, type})` where `path` is an object-storage `/objects/...` URL produced by the existing `useUpload` presigned-URL flow. Both render in ProjectDetails / IntakeDetails / ResourceDetails / TaskCustomFieldsSection and (for `resource`) the Projects grid view.
*   **Upload local-storage fallback**: `POST /api/uploads/request-url` (in `server/replit_integrations/object_storage/routes.ts`) tries `objectStorageService.getObjectEntityUploadURL()` first; on failure it returns a same-origin `uploadURL: /api/uploads/local/<uuid.ext>` and matching `objectPath: /objects/uploads/<uuid.ext>`. The companion `PUT /api/uploads/local/:filename` (raw body, 100mb cap, regex-restricted filename) writes to `public/uploads/`. `GET /objects/:objectPath(*)` falls back to that local directory when object storage auth-errors or returns NotFound. Lets attachment custom fields work in environments where Replit Object Storage isn't configured.

## Product

*   **Core PPM**: Portfolios, Projects, hierarchical Tasks, Resources, Risks, Issues, Key Dates, Change Requests, Documents, Organizations.
*   **Advanced Scheduling**: Gantt chart with undo/redo, Excel-like grid editing, manual task scheduling, Critical Path Method (CPM), and full dependency type support (FS/SS/FF/SF with lag).
*   **AI-Powered Assistants**: "Friday Agent" (Jarvis) for project management tasks (create tasks, risks, issues, update tasks, assign resources, create resources) with voice input/output, page-scoped context, and file attachment support (e.g., CSV task import). "Power BI Report Request Agent" for structured intake of Power BI report requirements. Custom AI agents with configurable scope, tools, and schedule.
*   **Construction Suite**: Modules for Daily Logs, RFIs, Submittals, Drawings (with versioning and markups), Punch List, Quality & Safety (inspections, incidents), and Bidding & Preconstruction (vendors, bid packages, bid leveling).
*   **Financials**: Detailed cost items with hierarchical grouping, multi-year WBS, change order workflow (PCO→COR→CO), and construction invoicing with payment applications.
*   **Timesheet Management**: Organization-level policies, audit engine, manager review workflow, and automated reminder/escalation system.
*   **Analytics & Reporting**: KPI analytics dashboards (org-scoped and Super Admin), PMO Radar visualization, and project template management.
*   **Collaboration**: Meetings with agendas/minutes/action items, formal correspondence tracking, and cross-project references.
*   **User Management**: Professional profiles, analytics dashboard, achievement badges, and Friday Academy for training/certification.

## User preferences

Preferred communication style: Simple, everyday language.

## Roles & Permissions (RBAC)

Permission keys live in `shared/permissionCatalog.ts` (single source of truth, `PERMISSIONS` const map + `PERMISSION_CATALOG`). Built-in roles are in `shared/permissionDefaults.ts` (10 roles: system_admin, pmo_admin, portfolio_manager, project_manager, resource_manager, finance_manager, timesheet_approver, executive_viewer, team_member, read_only) along with `mapLegacyMemberRole()` for backfill. Tables: `roles`, `permissions`, `role_permissions`, `user_roles` (`shared/schema.ts`). Server enforcement lives in `server/services/authorizationService.ts`: `getUserPermissions` (per-request cached), `userHasPermission`, `requirePermission(key)` Express middleware (resolves `organizationId` from params/body/query; 403 returns `{code:'FORBIDDEN_PERMISSION',required}`), `syncPermissionCatalog`, `seedDefaultRolesForOrg` (idempotent — upserts built-in roles, refreshes their permission set on every boot, leaves custom roles alone, then backfills `user_roles` from legacy `organization_members.role`). Boot seed loop in `server/index.ts` runs both. Routes: `server/routes/roleRoutes.ts` — `GET /api/me/permissions`, `GET /api/permissions/catalog`, full CRUD under `/api/organizations/:orgId/roles`, plus `GET/PUT /api/organizations/:orgId/members/:userId/roles` (gated by `roles.view`/`roles.manage`). Frontend hook `client/src/hooks/use-permissions.ts` exports `usePermissions()` (returns `has`/`hasAny`/`hasAll`) and the `<Can permission|anyOf>` wrapper. Admin UI at `/roles` (`client/src/pages/RolesAndPermissions.tsx`). `super_admin` and `marketing` users (`users.role`) bypass every permission check. The existing `userHasOrgAccess` membership check and team-member row-filtering stay in place — `requirePermission` is layered additively on top.

## Gotchas

*   **Schema Changes**: Always run `npm run db:push` after editing `shared/schema.ts` (or `shared/models/*.ts`) to sync the database. Forgetting this will abort the dev server boot.
*   **Environment Variables**: Investor Room password is an environment variable and cannot have a hardcoded fallback.
*   **Required Notifications**: Some transactional emails (sign-in, password reset, etc.) are locked on and cannot be disabled.

## Pointers

*   **OpenAPI Documentation**: `/api-docs`
*   **Public User Guide**: `/guide`
*   **Replit Auth Documentation**: _Populate as you build_
*   **Drizzle ORM Documentation**: _Populate as you build_
## Enterprise Calendar

Calendar-aware scheduling. Precedence everywhere: **project/org calendar wins → resource calendar restricts → approved PTO layered on top**. Falls back to legacy Mon–Fri 8h when no calendar is supplied. Engine + helpers live in `shared/lib/calendarEngine.ts`; tests in `tests/calendarAwareScheduling.test.ts` (37 in the file, 295 total).

### Engine (`shared/lib/calendarEngine.ts`)

*   `defaultLegacyResolvedCalendar()` — Mon–Fri 8h fallback used wherever a calendar isn't supplied.
*   `withAdditionalNonWorkingWindows(base, windows)` — folds non-working windows onto a base calendar. `NonWorkingWindow.intervals` (optional) makes the window **partial-day** (residual working time) instead of full-day off.
*   `subtractPtoFromIntervals(intervals, ptoHours)` — trims `ptoHours` from the **END** of a day's working intervals (matches the common half-day pattern).
*   `composeResourceEffectiveCalendar(projCal, resourceCal, availabilityRows, horizon?)` — single source of truth for the precedence rule. Folds three overlays in priority order (PTO → resource full-day-off → resource partial-day intersection). Resource intervals are **intersected at minute precision** with the project (a part-time resource on a full-time project gets capacity = project ∩ resource per day). Horizon defaults to today−30d → today+5y; **callers must pin it for far-future task ranges**. Returns `null` only when projCal+resourceCal+PTO are all empty.
*   `workingHoursBetween(cal, start, end)` — actual working hours over a window using the resolved calendar's intervals.
*   Helper types: `ResourceAvailabilityWindowInput`, `CalendarInterval`, `NonWorkingWindow`, `ResolvedCalendar`.

### Calendar-aware date math

*   `client/src/lib/workingDays.ts` — `*Cal` overloads (`isWorkingDayCal`, `addWorkingDaysCal`, `workingDaysBetweenCal`, `calculateEndDateFromWorkingDaysCal`, `calculateDurationInWorkingDaysCal`, `calculateStartDateFromEndAndDurationCal`) walk day-by-day via the engine when a calendar is supplied, else fall back to legacy Mon–Fri.
*   `client/src/lib/cpm.ts` — `calculateCPM(tasks, deps, calendar?)` threads the calendar through forward + backward passes plus all `getDurationDays` / `workingDaysFromProjectStart` / `dateFromWorkingDayOffset` helpers.

### Storage / routes / hooks

*   `server/storage/calendarStorage.ts` — `getDefaultCalendarForOrg(orgId)`, `getOrgDefaultResolvedCalendar(orgId)`, `getResolvedCalendarForProject(projectId)` (resolves `project.calendarId → org default → null`), `loadResolvedCalendar(calendarId)`. Re-exports the pure compose helpers.
*   `server/routes/calendarRoutes.ts` — `GET /api/projects/:projectId/resolved-calendar` and `GET /api/resources/:resourceId/resolved-calendar?projectId=` (the resource endpoint is now a thin wrapper around `composeResourceEffectiveCalendar` and folds approved `resource_availability` rows in via `withAdditionalNonWorkingWindows`; partial-day rows with `hoursPerDay` set become per-date residual-interval windows).
*   `client/src/hooks/use-resolved-calendar.ts` — `useProjectResolvedCalendar`, `useResourceResolvedCalendar`.

### Wired consumers

*   **CPM/Gantt** (Phase 2): `ProjectGanttView` subscribes to the project's resolved calendar and passes it to `calculateCPM`.
*   **Schedule propagation** (Slice C): `propagateScheduleForProject(projectId)` in `server/routes/projectItemRoutes.ts` resolves the project calendar at function entry and threads it through `getConstraintFromDep` plus the start/end recompute via `*Cal` helpers. Manual-startDate-change lag-recompute (~L2044) and dep-create constraint enforcement (~L2304) both use `*Cal` helpers (`nextWorkingDayCal`, `ensureWorkingDayCal`, `addWorkingDaysCal`, `calculateEndDateCal`, `calculateDurationCal`, `workingDaysBetweenExclusiveCal`).
*   **MPP/XER import** (Slice D): `convertMppImportToProject` resolves the org default calendar; `syncMppImportToProject` resolves the existing project's calendar. Both use `calculateEndDateCal` so duration-derived end dates honour org holidays.
*   **Assignment-overlay scheduler** (Slice 2): `server/storage/resourceStorage.ts updateTaskResourceAssignments` delegates to the pure helper `estimateTaskAssignmentHours` in `shared/lib/assignmentEstimation.ts` (DI'd resource-calendar + availability loaders → unit-testable without DB stack). Computes per-resource hours via `engine.workingHoursBetween(composed, taskStart, taskEnd) × allocPct` when the task has start+end, **pinning the compose horizon to the task's date range** so resource restrictions apply for far-future tasks. Falls back to `weeklyCapacity/5 × durationDays` only when dates are absent (loaders not invoked in the legacy path).
*   **AI optimizer** (Slice 2): `server/services/resourceOptimizationAI.ts` adds `effectiveHoursNext30Days` per resource (computed via `composeResourceEffectiveCalendar(null, resourceCal, leaveEntries)` + `workingHoursBetween` over today→+30d) alongside the legacy `weeklyCapacity` field — gives the AI optimizer real PTO-aware capacity instead of the static `weeklyCapacity || 40` heuristic.
*   **CapacityPlanningView + resource-utilization endpoint** (Slice 3): pure helper `computeEffectiveCapacity({orgCal, resourceCal, availabilityRows, rangeStart, rangeEnd, availabilityPct})` in `shared/lib/capacityCalc.ts` returns `{effectiveHoursInRange, effectiveWeeklyHours, weeksInRange}`. Endpoint `GET /api/organizations/:orgId/resource-utilization` (`server/routes/resourceRoutes.ts` ~L1623) loads org default calendar once, lazy-caches per-resource calendars, defaults range to **today→+27d (28 inclusive days)**, and returns the new fields alongside legacy `effectiveWeeklyHours` (now calendar-aware). Auth/authz guard via `getUserIdFromRequest` + `userHasOrgAccess`. `client/src/hooks/use-resources.ts` `ResourceUtilizationData` type extended. `client/src/components/resources/CapacityPlanningView.tsx` wraps the card in `<TooltipProvider>` with an info tooltip on the title (testid `info-effective-capacity`) and per-resource capacity span shows a tooltip with range total.

### Phase 3a partial-day PTO

*   **Slice 1** (engine): `withAdditionalNonWorkingWindows` accepts `intervals` overrides; `subtractPtoFromIntervals` trims from end of day. Resource resolved-calendar route expands `resource_availability` rows with `hoursPerDay` into per-date partial-day windows (residual = normal intervals − ptoHours from end). Rows without `hoursPerDay` keep legacy full-day-off behaviour.
*   **Slice 2**: assignment scheduler + AI optimizer (see "Wired consumers" above).
*   **Slice 3**: CapacityPlanningView UI + resource-utilization endpoint (see "Wired consumers" above).

### Not yet wired (deferred)

*   Gantt timeline bar drag/resize snap-to-working-time (drag/resize doesn't exist today; editing is via inline cells which already use `*Cal` helpers).
*   `CreateTaskDialog` / `IntakeDetails` interactive duration math (`implementationTimeline` is a textarea today).
*   `WorkloadDashboard` / `DemandForecast` consumers still read the per-week proxy `effectiveWeeklyHours`; could be migrated to `effectiveHoursInRange` for arbitrary windows.
*   `Promise.all` in-flight dedupe for resource-calendar loads in the utilization endpoint (low impact — first call wins per-`calendarId`, may issue duplicate concurrent loads in the same request).
