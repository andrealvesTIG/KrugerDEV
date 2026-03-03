# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is an enterprise-grade, full-stack project portfolio management application. It offers comprehensive oversight by tracking projects, portfolios, risks, milestones, and issues with a focus on clean data presentation, refined status badges, and a professional user interface. The application aims to provide robust tracking and reporting for strategic project groupings and individual initiatives.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features a professional, enterprise-grade UI inspired by Linear and Asana. It utilizes a page-based architecture with reusable UI components, Tailwind CSS with shadcn/ui for styling, Recharts for data visualization, and Framer Motion for animations. Industry-specific landing pages are fully responsive, use Framer Motion, and include SEO meta tags. The PMO Radar visualization uses HTML Canvas with `requestAnimationFrame` for dynamic, animated displays, supporting light/dark themes with distinct visual effects.

### Technical Implementations
**Frontend**: Built with React 18 and TypeScript, using Wouter for routing, TanStack React Query for state management, React Hook Form with Zod for form handling, and `@tanstack/react-virtual` for virtual scrolling in Gantt charts.
**Backend**: Developed with Express.js and TypeScript, utilizing PostgreSQL with Drizzle ORM for database interactions. It features a RESTful API with typed routes, Express sessions for session management, and esbuild for server builds.
**Shared Code**: Common schemas, route definitions, and models are shared between frontend and backend.
**Data Model**: Manages Portfolios, Projects, Tasks (hierarchical), Resources, Risks, Issues, Milestones, Change Requests, Project Documents, and Organizations. It supports multi-tenancy with soft-delete and role-based access control (Owner, Admin, Member, Team Member).
**Security**: Implements soft-delete for organizations, mandatory email verification for creation, bot protection with honeypot fields, and versioned user consent tracking. OAuth tokens for integrations are encrypted at rest using AES-256-GCM. All API endpoints enforce authentication and authorization: `GET /api/organizations` requires login and filters by membership (super_admins see all), `PATCH /api/users/:userId/profile` enforces self-only or super_admin access, `GET /api/projects/:projectId/dependencies` verifies org membership. All portfolio aggregation endpoints (`/projects`, `/risks`, `/issues`, `/milestones`, `/overview`, `/escalated-items`, `/risk-assessment/*`) enforce org membership. `GET /api/projects/:id` enforces org membership. Billing usage recording (`recordUsage`) wraps credit-check + deduction in a DB transaction for atomicity. `deleteOrganization` performs comprehensive FK cleanup across all child tables before deletion. Invite seat limits are rechecked at insert time to prevent race conditions.
**Notification Engine**: Supports various notification types with severity levels, including deduplication.
**Help & Feedback**: Provides a system for users to submit tickets with text and screenshots.
**Integration Settings**: Stores organization-scoped integration credentials and connection statuses, with encrypted OAuth tokens.
**API Design**: Follows a consistent API error convention (400, 401, 403, 404, 500 status codes) and maintains a comprehensive OpenAPI 3.0 specification via `server/swagger.ts`.
**Performance Optimizations**: Includes extensive database indexing (tasks table has indexes on `startDate`, `endDate`, `status`, `createdAt`, and composite `(projectId, deletedAt, taskIndex)`), N+1 query fixes (including batched user lookups in Recycle Bin and multi-org task aggregation via `getTasksByMultipleOrganizationsPaginated`), `React.memo` and `useCallback` for UI components, bulk assignment fetching, `inArray` batch queries for portfolio aggregation, virtual scrolling for large data sets, and memoized date parsing maps in Gantt views. Server-side date filtering available via `startDateFrom/To`, `endDateFrom/To`, `overdue`, `sortBy`, `sortOrder` query params on `/api/tasks/all`. Frontend fetch hooks use `res.ok` checks to properly surface HTTP errors. Benchmark harness at `scripts/benchmark-dates.ts`; performance report at `PERFORMANCE_REPORT.md`.
**Resource Management**: Features tracking of resource skills, availability, and utilization, with views for Capacity Planning, Workload Dashboard, and Availability Calendar.
**PMO Radar**: A dynamic risk visualization page displaying risks and issues on a radar-style interface with interactive filters, time projection, timeline playback, and detailed drill-down capabilities. Overdue items are visually highlighted.
**Shared Risk Editing**: Utilizes a single, shared `EditRiskDialog` component across the application for consistent risk management, supporting AI suggestions, resource assignments, and change history.
**CSV Import/Export Round-Trip**: Tasks can be exported to CSV from the project details page and re-imported after modifications. The import matches existing tasks by WBS code first, then by name, and only updates fields that have changed. New rows in the CSV create new tasks. The import endpoint is `POST /api/projects/:id/import-csv` using multipart file upload.
**Task Date Scheduling Rules**: Start date changes keep duration fixed and auto-adjust end date. End date changes keep start date fixed and auto-adjust duration. Dependency changes cascade to dependent tasks, adjusting their start/end dates while preserving duration. All date calculations use working days (skip weekends). Milestones (duration 0) are preserved during dependency propagation.

## External Dependencies

-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Authentication**: Replit Auth (OpenID Connect), Passport.js, express-session
-   **UI Libraries**: shadcn/ui (based on Radix UI), Radix UI, Lucide React (icons)
-   **Integrations**:
    -   Microsoft Project (MPXJ) for parsing project files (`.mpp`, XML, CSV)
    -   Microsoft Planner for importing and syncing projects/tasks via Microsoft Graph API
    -   Microsoft Dynamics 365 Sales Hub for importing invoices via OAuth 2.0 (MSAL)
    -   Analytics API for external analytics tools (e.g., Power BI) with API key and Bearer token authentication