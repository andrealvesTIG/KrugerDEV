# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is an enterprise-grade project portfolio management application designed for comprehensive oversight of projects, portfolios, risks, milestones, and issues. It aims to provide robust tracking and reporting through clean data presentation, refined status badges, and a professional user interface, supporting both strategic project groupings and individual initiatives. The project envisions becoming a leading tool in project portfolio management, enhancing decision-making and operational efficiency for organizations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features an enterprise-grade UI inspired by Linear and Asana, built with a page-based architecture and reusable UI components. Styling leverages Tailwind CSS and shadcn/ui, with Recharts for data visualization and Framer Motion for animations. Industry-specific landing pages are responsive and SEO-optimized. The PMO Radar visualization uses HTML Canvas with `requestAnimationFrame` for dynamic, animated displays supporting both light and dark themes.

### Technical Implementations
**Frontend**: Developed with React 18 and TypeScript, using Wouter for routing, TanStack React Query for state management, React Hook Form with Zod for form handling, and `@tanstack/react-virtual` for virtual scrolling.
**Backend**: Built with Express.js and TypeScript, utilizing PostgreSQL with Drizzle ORM. It provides a RESTful API with typed routes, Express sessions for session management, and esbuild for server builds.
**Shared Code**: Common schemas, route definitions, and models are shared between frontend and backend.
**Data Model**: Supports Portfolios, Projects, hierarchical Tasks, Resources, Risks, Issues, Milestones, Change Requests, Project Documents, and Organizations. It includes multi-tenancy with soft-delete and role-based access control (Owner, Admin, Member, Team Member).
**Security**: Features soft-delete for organizations, mandatory email verification, bot protection, versioned user consent tracking, and encrypted OAuth tokens. All API endpoints enforce authentication and authorization based on user roles and organization membership.
**Notification Engine**: Supports various notification types with severity levels and deduplication, including welcome emails.
**Help & Feedback**: Provides a system for users to submit support tickets with text and screenshots.
**Friday Academy Training & Certification**: A comprehensive training section offering interactive modules organized by role and PMO subject areas. It includes video placeholders, sequential lesson gating, user-scoped progress tracking, and branded PDF certificate generation upon module completion. Quiz mechanics enforce passing grades, attempt limits, and cooldown periods. Training badges are displayed on the training page and user profiles. The architecture uses a centralized data file and a generic module player page, with SuperAdmin CRUD management for training content stored in a PostgreSQL database.
**Integration Settings**: Stores organization-scoped integration credentials and connection statuses, with encrypted OAuth tokens.
**API Design**: Follows a consistent API error convention and maintains a comprehensive OpenAPI 3.0 specification.
**Performance Optimizations**: Includes extensive database indexing, N+1 query fixes, `React.memo` and `useCallback` for UI components, bulk assignment fetching, `inArray` batch queries, virtual scrolling for large data sets, and memoized date parsing maps. Server-side date filtering is supported, with optimized `workingDaysBetween` calculation.
**Testing**: Utilizes Vitest for testing, focusing on date calculation logic, performance, and cross-validation.
**Resource Management**: Tracks resource skills, availability, and utilization with dedicated views for Capacity Planning, Workload Dashboard, and Availability Calendar.
**PMO Radar**: A dynamic risk visualization page displaying risks and issues on a radar-style interface with interactive filters, time projection, timeline playback, and detailed drill-down capabilities.
**Shared Risk Editing**: Utilizes a single, consistent `EditRiskDialog` component across the application for managing risks, supporting AI suggestions, resource assignments, and change history.
**Issues Grid View**: The `/issues` page features an inline-editable data grid for managing issues and risks, with user-configurable column visibility and persistence of preferences in localStorage.
**Issues Export/Import**: Supports exporting and importing filtered issues/risks to/from Excel (.xlsx) or CSV (.csv), with a preview dialog for imports and project selection.
**CSV Import/Export Round-Trip**: Allows exporting tasks to CSV from project details and re-importing modified tasks. The import process matches existing tasks by WBS code or name and only updates changed fields, creating new tasks for new rows.
**Task Date Scheduling Rules**: Implements rules for task date changes where start date changes keep duration fixed, end date changes keep start date fixed, and dependency changes cascade to dependent tasks while preserving duration and respecting working days. Milestones are preserved.
**Gantt Undo/Redo**: A comprehensive undo/redo system for Gantt chart operations including field updates, task reordering, indent/outdent, creation, deletion, and dependency management.
**Schedule PNG Export**: Enables exporting the visible schedule (table columns + Gantt chart) as a PNG image.
**Timesheet History Tab**: Displays past timesheet entries grouped by week, with selectable date ranges, status filters, and detailed entry views.
**Critical Path Method (CPM)**: Implemented for calculating ES/EF/LS/LF/TF for tasks using forward and backward passes, supporting various dependency types and lag. Excludes summary tasks and isolated tasks from criticality.
**Dependency Type Selection**: Full-stack support for FS/SS/FF/SF dependency types with lag days, including API routes, UI selectors, and server-side date adjustments.
**Organization Scheduling Defaults**: Allows defining and enforcing default dependency types and lag days at the organization level via API and UI settings.
**Professional Profile & Analytics**: Features a user profile with credentials, an analytics dashboard displaying engagement statistics, a weekly activity chart, feature usage, a tiered professional ranking system, and an achievement badge gallery.
**Shareable Branded Badges**: Allows users to share their profile and earned badges externally via branded images and a public profile page.
**AI Create Features**: Incorporates AI for smart project matching to prevent duplication and facilitate context-aware generation of tasks, risks, issues, and milestones. All AI Create actions are logged.

## External Dependencies

-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Authentication**: Replit Auth (OpenID Connect), Passport.js, express-session
-   **UI Libraries**: shadcn/ui, Radix UI, Lucide React
-   **Integrations**:
    -   Microsoft Project (MPXJ)
    -   Microsoft Planner (Microsoft Graph API)
    -   Microsoft Dynamics 365 Sales Hub (OAuth 2.0 / MSAL)
    -   Analytics API (for external analytics tools)