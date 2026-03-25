# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is an enterprise-grade project portfolio management application for comprehensive oversight of projects, portfolios, risks, portfolio key dates, and issues. It provides robust tracking and reporting through clean data presentation, refined status badges, and a professional user interface. The project aims to become a leading tool in project portfolio management, enhancing decision-making and operational efficiency for organizations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features an enterprise-grade UI inspired by Linear and Asana, built with a page-based architecture and reusable UI components. Styling leverages Tailwind CSS and shadcn/ui, with Recharts for data visualization and Framer Motion for animations. Industry-specific landing pages are responsive and SEO-optimized. The PMO Radar visualization uses HTML Canvas for dynamic, animated displays supporting both light and dark themes.

### Technical Implementations
**Frontend**: Developed with React 18 and TypeScript, utilizing Wouter for routing, TanStack React Query for state management, React Hook Form with Zod for form handling, and `@tanstack/react-virtual` for virtual scrolling.
**Backend**: Built with Express.js and TypeScript, utilizing PostgreSQL with Drizzle ORM. It provides a RESTful API with typed routes and Express sessions for session management.
**Shared Code**: Common schemas, route definitions, and models are shared between frontend and backend.
**Data Model**: Supports Portfolios, Projects, hierarchical Tasks, Resources, Risks, Issues, Portfolio Key Dates, Change Requests, Project Documents, and Organizations. It includes multi-tenancy with soft-delete and role-based access control (Owner, Admin, Member, Team Member). **Task Milestones** (project-level) are consolidated into the tasks table (with `isMilestone=true` and `taskType='Milestone'`). **Portfolio Key Dates** (portfolio-level) use the dedicated `portfolio_key_dates` table with full CRUD — completely separate from task milestones. Key Dates have types (Deadline, Governance, Deliverable, Phase Gate, External, Payment, Review, Go Live, Other) and statuses (Upcoming, At Risk, Overdue, Completed). The old standalone `milestones` table is deprecated. The storage layer provides a `taskToMilestone()` mapping function to preserve backward-compatible Milestone-shaped API responses for task milestones. Field mapping: `name→title`, `endDate→dueDate`, `baselineEndDate→baselineDueDate`, `(status==='Done'||progress===100)→completed`.
**Security**: Features soft-delete for organizations, mandatory email verification, bot protection, versioned user consent tracking, and encrypted OAuth tokens. All API endpoints enforce authentication and authorization.
**Notification Engine**: Supports various notification types with severity levels and deduplication.
**Help & Feedback**: Provides a system for users to submit support tickets with text and screenshots.
**Friday Academy Training & Certification**: A comprehensive training section offering interactive modules with video placeholders, sequential lesson gating, user-scoped progress tracking, and PDF certificate generation. Quiz mechanics enforce passing grades, attempt limits, and cooldown periods. Training badges are displayed on the training page and user profiles.
**Integration Settings**: Stores organization-scoped integration credentials and connection statuses, with encrypted OAuth tokens.
**API Design**: Follows a consistent API error convention and maintains a comprehensive OpenAPI 3.0 specification.
**Performance Optimizations**: Includes extensive database indexing, N+1 query fixes, `React.memo` and `useCallback` for UI components, bulk assignment fetching, `inArray` batch queries, virtual scrolling, and memoized date parsing. Server-side date filtering and optimized `workingDaysBetween` calculation. Batch SQL updates for WBS and parentId recalculation using CASE statements.
**Code Organization**: Critical oversized files have been modularized, including `server/routes.ts`, `server/storage.ts`, `client/src/pages/SuperAdmin.tsx`, and `client/src/pages/OrgSettings.tsx`. Duplicate industry landing pages were consolidated, and Vite `manualChunks` are configured for vendor code splitting.
**Testing**: Utilizes Vitest for testing, focusing on date calculation logic, performance, and cross-validation.
**Resource Management**: Tracks resource skills, availability, and utilization with dedicated views for Capacity Planning, Workload Dashboard, and Availability Calendar.
**PMO Radar**: A dynamic risk visualization page displaying risks and issues on a radar-style interface with interactive filters, time projection, timeline playback, and detailed drill-down capabilities.
**Shared Risk Editing**: Utilizes a single, consistent `EditRiskDialog` component across the application for managing risks, supporting AI suggestions, resource assignments, and change history.
**Issues Grid View**: The `/issues` page features an inline-editable data grid for managing issues and risks, with user-configurable column visibility and persistence of preferences.
**Issues Export/Import**: Supports exporting and importing filtered issues/risks to/from Excel (.xlsx) or CSV (.csv), with a preview dialog for imports and project selection.
**CSV Import/Export Round-Trip**: Allows exporting tasks to CSV from project details and re-importing modified tasks.
**Task Date Scheduling Rules**: Implements rules for task date changes where start date changes keep duration fixed, end date changes keep start date fixed, and dependency changes cascade to dependent tasks while preserving duration and respecting working days. Milestones are preserved.
**Gantt Undo/Redo**: A comprehensive undo/redo system for Gantt chart operations including field updates, task reordering, indent/outdent, creation, deletion, and dependency management.
**Schedule PNG Export**: Enables exporting the visible schedule (table columns + Gantt chart) as a PNG image.
**Timesheet History Tab**: Displays past timesheet entries grouped by week, with selectable date ranges, status filters, and detailed entry views.
**Critical Path Method (CPM)**: Implemented for calculating ES/EF/LS/LF/TF for tasks using forward and backward passes, supporting various dependency types and lag.
**Dependency Type Selection**: Full-stack support for FS/SS/FF/SF dependency types with lag days, including API routes, UI selectors, and server-side date adjustments.
**Organization Scheduling Defaults**: Allows defining and enforcing default dependency types and lag days at the organization level via API and UI settings.
**Professional Profile & Analytics**: Features a user profile with credentials, an analytics dashboard displaying engagement statistics, a weekly activity chart, feature usage, a tiered professional ranking system, and an achievement badge gallery. The Profile page is mobile-optimized.
**Shareable Branded Badges**: Allows users to share their profile and earned badges externally via branded images and a public profile page. Uses official FridayReport.AI brand assets.
**Project Templates Module**: Allows users to create reusable project templates from MPP/XML/CSV file uploads or from existing projects. Templates are org-scoped with persistent file storage and include CRUD operations, duplication, and project creation from templates.
**AI Create Features**: Incorporates AI for smart project matching to prevent duplication and facilitate context-aware generation of tasks, risks, issues, and milestones. All AI Create actions are logged.
**Timesheet Control & Audit Engine**: Organization-level timesheet policies (mandatory notes, overtime threshold, min/max weekly hours, grace period). Full audit logging of all timesheet mutations. Proxy entry support for admins. Compliance reporting dashboard with submission rates, approval/rejection stats, and overtime tracking.
**Manager Review Workflow Enhancements**: Approval delegation (OOO coverage), rejection templates, comments/history threads on timesheet entries, and a team review dashboard for managers. SLA tracking with turnaround time metrics.
**Reminder & Escalation System**: Automated multi-channel reminder engine for timesheets, including submission reminders, manager approval reminders, auto-escalation to skip-level managers, and weekly manager digest emails. Configurable at the organization level.

**Cross-Project References**: Bidirectional linking between tasks and projects across different projects within the same organization. Supports relationship types: blocks, is_blocked_by, depends_on, relates_to, duplicates. Stored in `cross_project_references` table with automatic inverse relationship management. UI integrated in the task edit dialog Dependencies tab and the project summary tab. Storage layer in `server/storage/crossProjectReferenceStorage.ts`, routes in `server/routes/crossProjectReferenceRoutes.ts`, hooks in `client/src/hooks/use-cross-project-references.ts`, component in `client/src/components/CrossProjectReferences.tsx`.

**Database Migration & Deployment**: The build process runs `drizzle-kit push --force` to sync schema tables and `script/migrate.ts` for additional indexes and manual migrations.
**Schema Integrity**: `script/check-schema.ts --verbose` validates all 110 tables, 1,517 columns, and 249 FKs. `task_dependencies` has a unique constraint on `(task_id, depends_on_task_id)`. `lessons_learned.approvedBy` is `varchar` with FK to `users`. Legacy `identifiedDate` column removed from `lessons_learned` (consolidated to `dateIdentified`). `tasks.start_date` and `tasks.end_date` are nullable in both schema and DB.

## External Dependencies

-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Authentication**: Replit Auth (OpenID Connect), Passport.js, express-session
-   **UI Libraries**: shadcn/ui, Radix UI, Lucide React
-   **Integrations**:
    -   Microsoft Project (MPXJ)
    -   Microsoft Planner (Microsoft Graph API)
    -   Microsoft Planner Premium / Dataverse (msdyn_projecttaskdependencies)
    -   Microsoft Dynamics 365 Sales Hub (OAuth 2.0 / MSAL)
    -   Analytics API (for external analytics tools)