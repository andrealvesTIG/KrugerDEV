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

## Architecture decisions

*   **API Auto-generation**: OpenAPI schemas are auto-generated directly from Drizzle ORM table definitions to ensure consistency. Drizzle tables are the single source of truth.
*   **Shared Codebase**: Common schemas, route definitions, and models are shared between frontend and backend to maintain type safety and consistency.
*   **Security First**: Implemented soft-delete, mandatory email verification, bot protection, versioned user consent, encrypted OAuth tokens, `helmet` HTTP headers, and rate limiting on auth endpoints. All API endpoints enforce authentication and role-based access control.
*   **Multi-tenancy & RBAC**: The data model supports multi-tenancy with soft-delete and granular role-based access control across all entities.
*   **Page-Based UI**: Enterprise-grade UI inspired by Linear and Asana, utilizing a page-based architecture with reusable components and Tailwind CSS for styling.
*   **Schema Drift Detection**: Critical schema drift check runs at server boot, aborting dev builds if schema doesn't match the DB, ensuring schema integrity.
*   **Auto Number Custom Fields**: Definitions with `fieldType='autonumber'` carry a `mask` (e.g. `N###`) and a `nextSequence` counter. Values are server-assigned on entity creation via `assignAutonumberValuesForEntity` (atomic SQL increment) and rejected by all CF value upsert/delete routes — masks are limited to a single `#` run.

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