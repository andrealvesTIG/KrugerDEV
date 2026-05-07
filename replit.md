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
*   **Programs**: `programs` table in `shared/schema.ts` (fields: name*, status default Active, description, businessCase, ownerId* FK users, budget/benefit/roi numerics) + `projects.programId` FK + `project_intakes.programId` is now a real FK. Storage `server/storage/programStorage.ts` (CRUD + `setProgramProjects` bulk associate). Routes `server/routes/programRoutes.ts` (`/api/programs` CRUD, `GET/PUT /api/programs/:id/projects`, `POST/DELETE /api/programs/:id/projects/:projectId`). Hook `client/src/hooks/use-programs.ts`. Pages `client/src/pages/Programs.tsx` (list + create/edit dialog) and `client/src/pages/ProgramDetails.tsx` (form modeled on MS Project for the Web Program form + associated-projects table with Manage Projects picker). Sidebar `programs` module key under the Portfolio group.
*   **Configurable Project Form Layout** (admin-editable per-org tabs/sections/items driving the project Summary tab): tables `projectFormTabs` / `projectFormTabSections` / `projectFormTabItems` in `shared/schema.ts`. Catalog of placeable items in `shared/projectFormRegistry.ts` (`PROJECT_FORM_FIELDS` for built-in projects columns, `PROJECT_FORM_BLOCKS` with the `custom_fields` block). Default 4-tab layout in `shared/projectFormTabDefaults.ts`. Storage in `server/storage/projectFormLayoutStorage.ts` (`getProjectFormLayout`, `replaceProjectFormLayout` with advisory lock `0x5052464C`='PRFL', `seedDefaultProjectFormLayoutIfMissing`, `resetProjectFormLayoutToDefaults`). Routes in `server/routes/projectRoutes.ts`: `GET/PUT /api/organizations/:orgId/project-form-layout`, `POST .../reset`. Client hook `client/src/hooks/use-project-form-layout.ts`. Renderer `client/src/components/project/ProjectFormRenderer.tsx` (+ `ProjectFieldRenderer.tsx` for built-in fields with on-blur draft buffer, `ProjectSingleCustomField.tsx` for individually-placed custom fields) drives the Summary tab on `client/src/pages/ProjectDetails.tsx` via the local `ProjectFormSummary` helper. Admin DnD editor at Settings → Governance → Project Form: `client/src/components/settings/ProjectFormLayoutSection.tsx` (mirrors the intake editor; sortable tabs/sections/items with cross-section drag and "move to…" menu for cross-tab).
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

## Gotchas

*   **Schema Changes**: Always run `npm run db:push` after editing `shared/schema.ts` (or `shared/models/*.ts`) to sync the database. Forgetting this will abort the dev server boot.
*   **Environment Variables**: Investor Room password is an environment variable and cannot have a hardcoded fallback.
*   **Required Notifications**: Some transactional emails (sign-in, password reset, etc.) are locked on and cannot be disabled.

## Pointers

*   **OpenAPI Documentation**: `/api-docs`
*   **Public User Guide**: `/guide`
*   **Replit Auth Documentation**: _Populate as you build_
*   **Drizzle ORM Documentation**: _Populate as you build_