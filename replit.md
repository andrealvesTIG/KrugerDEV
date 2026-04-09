# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is an enterprise-grade project portfolio management application designed for comprehensive oversight of projects, portfolios, risks, key dates, and issues. It aims to enhance decision-making and operational efficiency through robust tracking, clean data presentation, and a professional user interface. The project's vision is to become a leading tool in project portfolio management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features an enterprise-grade UI inspired by Linear and Asana, utilizing a page-based architecture with reusable UI components. Styling is managed with Tailwind CSS and shadcn/ui. Data visualizations are powered by Recharts, and animations by Framer Motion. Industry-specific landing pages are responsive and SEO-optimized. The PMO Radar visualization uses HTML Canvas for dynamic, animated displays supporting both light and dark themes.

### Technical Implementations
**Frontend**: Developed with React 18 and TypeScript, employing Wouter for routing, TanStack React Query for state management, React Hook Form with Zod for form handling, and `@tanstack/react-virtual` for virtual scrolling.
**Backend**: Built with Express.js and TypeScript, utilizing PostgreSQL with Drizzle ORM. It provides a RESTful API with typed routes and Express sessions for session management.
**Shared Code**: Common schemas, route definitions, and models are shared between frontend and backend.
**Data Model**: Supports Portfolios, Projects, hierarchical Tasks, Resources, Risks, Issues, Portfolio Key Dates, Change Requests, Project Documents, and Organizations. It includes multi-tenancy with soft-delete and role-based access control. Task Milestones are integrated into the tasks table, while Portfolio Key Dates are managed in a dedicated table with various types and statuses.
**Security**: Features soft-delete, mandatory email verification, bot protection, versioned user consent tracking, and encrypted OAuth tokens. All API endpoints enforce authentication and authorization.
**Notification Engine**: Supports various notification types with severity levels and deduplication.
**Help & Feedback**: Provides a system for user support tickets with text and screenshots.
**Friday Academy Training & Certification**: Offers interactive training modules with progress tracking and PDF certificate generation, including quiz mechanics.
**Integration Settings**: Stores organization-scoped integration credentials and connection statuses with encrypted OAuth tokens.
**API Design**: Follows a consistent API error convention and maintains a comprehensive OpenAPI 3.0 specification with extensive documentation for endpoints, schemas, and tags, including requiredness annotations and pagination.
**Performance Optimizations**: Includes extensive database indexing, N+1 query fixes, `React.memo` and `useCallback` for UI components, bulk assignment fetching, virtual scrolling, memoized date parsing, server-side date filtering, and optimized batch SQL updates.
**Code Organization**: Critical oversized files are modularized, duplicate industry landing pages consolidated, and Vite `manualChunks` configured for vendor code splitting. Unused code is systematically removed.
**Testing**: Utilizes Vitest for testing, focusing on date calculation logic, performance, and cross-validation.
**Resource Management**: Tracks resource skills, availability, and utilization through Capacity Planning, Workload Dashboard, and Availability Calendar views.
**PMO Radar**: A dynamic risk visualization page displaying risks and issues on a radar-style interface with interactive filters, time projection, timeline playback, and drill-down capabilities. It includes a simulation engine for modeling project risk lifecycles and provides a filterable log review UI with summary stats and PDF export.
**Shared Risk Editing**: A consistent `EditRiskDialog` component is used across the application for risk management, including AI suggestions, resource assignments, and change history.
**Issues Grid View**: The `/issues` page features an inline-editable data grid for managing issues and risks, with user-configurable column visibility and preference persistence.
**Issues Export/Import**: Supports exporting and importing filtered issues/risks to/from Excel (.xlsx) or CSV (.csv) with a preview dialog.
**CSV Import/Export Round-Trip**: Allows exporting tasks to CSV from project details and re-importing modified tasks.
**Task Date Scheduling Rules**: Implements rules for task date changes, dependency cascading, and milestone preservation while respecting working days.
**Gantt Undo/Redo**: A comprehensive undo/redo system for Gantt chart operations including field updates, reordering, indent/outdent, creation, deletion, and dependency management.
**Schedule PNG Export**: Enables exporting the visible schedule as a PNG image.
**Timesheet History Tab**: Displays past timesheet entries grouped by week, with selectable date ranges and status filters.
**Critical Path Method (CPM)**: Implemented for calculating ES/EF/LS/LF/TF for tasks using forward and backward passes, supporting various dependency types and lag.
**Dependency Type Selection**: Full-stack support for FS/SS/FF/SF dependency types with lag days, including API routes, UI selectors, and server-side date adjustments.
**Organization Scheduling Defaults**: Allows defining and enforcing default dependency types and lag days at the organization level.
**Professional Profile & Analytics**: Features a user profile with credentials, an analytics dashboard displaying engagement statistics, a weekly activity chart, feature usage, a tiered professional ranking system, and an achievement badge gallery.
**Shareable Branded Badges**: Allows users to share their profile and earned badges externally via branded images and a public profile page.
**Project Templates Module**: Allows users to create reusable project templates from file uploads (MPP/XML/CSV) or existing projects, with CRUD operations and project creation from templates.
**AI Create Features**: Incorporates AI for smart project matching and context-aware generation of tasks, risks, issues, and milestones, with all actions logged.
**Timesheet Control & Audit Engine**: Organization-level timesheet policies (mandatory notes, overtime threshold, min/max weekly hours, grace period). Full audit logging of all timesheet mutations. Proxy entry support for admins. Compliance reporting dashboard.
**Manager Review Workflow Enhancements**: Approval delegation, rejection templates, comments/history threads on timesheet entries, and a team review dashboard for managers with SLA tracking.
**Reminder & Escalation System**: Automated multi-channel reminder engine for timesheets, including submission reminders, manager approval reminders, auto-escalation, and weekly manager digest emails, configurable at the organization level.
**Partner Program**: A public landing page targeting PMO consulting firms, independent consultants, and trainers/educators, featuring an application form and partner type cards. Applications are stored in a dedicated database table.
**Cross-Project References**: Bidirectional linking between tasks and projects across different projects within the same organization, supporting various relationship types. Integrated into the task edit dialog and project summary.
**Friday Copilot (Jarvis)**: AI-powered project assistant accessible via floating orb button. Backend service queries organization's project data (projects, tasks, issues, resources, dependencies) and feeds context to OpenAI for intelligent responses. Features include voice input/output via Web Speech API, "Hey Friday" wake word detection, concise mode toggle, clickable entity links in responses, and sessionStorage-persisted chat history. Files: `server/services/jarvisService.ts`, `server/routes/jarvisRoutes.ts`, `client/src/hooks/use-jarvis.ts`, `client/src/hooks/use-speech.ts`, `client/src/hooks/use-wake-word.ts`, `client/src/components/jarvis/JarvisOrb.tsx`, `client/src/components/jarvis/JarvisPanel.tsx`.
**Investor Room**: Password-gated pitch deck page at `/investor-room` with animated slides, PMO Radar demo, pricing tiers, roadmap, and competitive matrix. Includes PDF download via jsPDF + html-to-image, and email PDF dialog. Backend routes handle password verification, access checks, and email sending with authorization enforcement. Navigation links in Home, SignInPage, LandingFooter, and SuperAdmin. Files: `client/src/pages/InvestorRoom.tsx`, `server/routes/investorRoutes.ts`.
**Database Migration & Deployment**: The build process includes schema synchronization and additional index/manual migrations.
**Schema Integrity**: A script validates all tables, columns, and foreign keys.
**KPI Analytics Dashboard**: A dedicated dashboard tab under Dashboards showing org-scoped user activity metrics across time cohorts (Week 1-4, Month 2-3, Month 4+). Tracks tasks created/completed, projects created, issues raised/resolved, hours logged, feature usage, active users, and platform engagement. Backend endpoint at `/api/dashboard/kpi-metrics` aggregates data from tasks, projects, issues, timesheets, feature usage logs, and change logs. Frontend uses Recharts for bar charts, line charts, and area charts with a detailed breakdown table.
**Super Admin KPI Analytics**: A platform-wide KPI Analytics tab in the Super Admin Console (`/super-admin`) for monitoring all subscriber activity and engagement. Backend endpoint at `/api/admin/kpi-metrics` aggregates data across all organizations/users (no org filter). Includes new signups metric, user behavior stats (top features by usage with read/write breakdown and response times), error hotspots (features with high error rates and affected user counts), and a friction trend chart (weekly error rate vs active users over 90 days). All behavior data sourced from `api_request_logs`. Only accessible to Super Admin and Marketing roles.

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
    -   Analytics API