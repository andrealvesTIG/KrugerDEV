# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is an enterprise-grade project portfolio management application designed for comprehensive oversight of projects, portfolios, risks, key dates, and issues. It aims to enhance decision-making and operational efficiency through robust tracking, clean data presentation, and a professional user interface. The project's vision is to become a leading tool in project portfolio management, offering advanced features like AI-powered assistance, robust reporting, and extensive integration capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features an enterprise-grade UI inspired by Linear and Asana, utilizing a page-based architecture with reusable UI components. Styling is managed with Tailwind CSS and shadcn/ui. Data visualizations are powered by Recharts, and animations by Framer Motion. The PMO Radar visualization uses HTML Canvas for dynamic displays supporting both light and dark themes. Industry-specific landing pages are responsive and SEO-optimized.

### Technical Implementations
**Frontend**: Developed with React 18 and TypeScript, employing Wouter for routing, TanStack React Query for state management, React Hook Form with Zod for form handling, and `@tanstack/react-virtual` for virtual scrolling.
**Backend**: Built with Express.js and TypeScript, utilizing PostgreSQL with Drizzle ORM, providing a RESTful API with typed routes and Express sessions for session management.
**Shared Code**: Common schemas, route definitions, and models are shared between frontend and backend to ensure consistency.
**Data Model**: Supports Portfolios, Projects, hierarchical Tasks, Resources, Risks, Issues, Portfolio Key Dates, Change Requests, Project Documents, and Organizations, with multi-tenancy, soft-delete, and role-based access control.
**Security**: Features soft-delete, mandatory email verification, bot protection, versioned user consent tracking, encrypted OAuth tokens, `helmet` HTTP security headers, `express-rate-limit` on auth endpoints, and a strong password policy. All API endpoints enforce authentication and authorization.
**Notification Engine**: Supports various notification types with severity levels and deduplication.
**Help & Feedback**: Provides a system for user support tickets with text and screenshots.
**Friday Academy**: Offers interactive training modules with progress tracking and PDF certificate generation, including quiz mechanics.
**API Design**: Follows a consistent API error convention and maintains a comprehensive OpenAPI 3.0 specification. OpenAPI schemas are auto-generated from Drizzle ORM table definitions, ensuring documentation accuracy. The API documentation uses `@asteasolutions/zod-to-openapi` and `swagger-ui-express`.
**Performance Optimizations**: Includes extensive database indexing, N+1 query fixes, `React.memo` and `useCallback` for UI components, bulk assignment fetching, virtual scrolling, memoized date parsing, server-side date filtering, and optimized batch SQL updates.
**Code Organization**: Critical oversized files are modularized, duplicate industry landing pages consolidated, and Vite `manualChunks` configured for vendor code splitting.
**Testing**: Utilizes Vitest for testing, focusing on date calculation logic, performance, and cross-validation.
**Resource Management**: Tracks resource skills, availability, and utilization through Capacity Planning, Workload Dashboard, and Availability Calendar views.
**PMO Radar**: A dynamic risk visualization page displaying risks and issues on a radar-style interface with interactive filters, time projection, timeline playback, and drill-down capabilities, including a simulation engine.
**Risk & Issue Management**: Uses a consistent `EditRiskDialog` component and features an inline-editable data grid for managing issues and risks with user-configurable columns and persistence. Supports export/import to/from Excel/CSV.
**Task Scheduling**: Implements rules for task date changes, dependency cascading, milestone preservation, and working days. Supports manual task scheduling with flexible date management.
**Gantt Chart Features**: Includes a comprehensive undo/redo system for Gantt chart operations and Excel-like grid editing with advanced cell navigation, selection, copy, and paste functionalities.
**Project List Enhancements**: Supports grouping by any standard or custom project field, with interactive group headers. Offers configurable column visibility and persistent sorting options.
**Custom Fields**: Organization-scoped custom field definitions for projects, tasks, and resources, managed via a tabbed settings UI.
**Schedule PNG Export**: Enables exporting the visible schedule as a PNG image.
**Timesheet Management**: Features a Timesheet History tab and an organization-level Timesheet Control & Audit Engine with policies, audit logging, proxy entry, and compliance reporting. Includes a Manager Review Workflow with approval delegation and reminder/escalation system.
**Critical Path Method (CPM)**: Implemented for calculating ES/EF/LS/LF/TF for tasks using forward and backward passes, supporting various dependency types and lag.
**Dependency Management**: Full-stack support for FS/SS/FF/SF dependency types with lag days, including organization-level default settings and server-side date adjustments.
**Professional Profile & Analytics**: Features a user profile with credentials, an analytics dashboard displaying engagement statistics, a weekly activity chart, feature usage, a tiered professional ranking system, and an achievement badge gallery.
**Shareable Branded Badges**: Allows users to share their profile and earned badges externally via branded images and a public profile page.
**Project Templates Module**: Allows users to create reusable project templates from file uploads (MPP/XML/CSV) or existing projects, with CRUD operations and project creation from templates.
**AI Create Features**: Incorporates AI for smart project matching and context-aware generation of tasks, risks, issues, and milestones, with all actions logged.
**Timesheet Control & Audit Engine**: Organization-level timesheet policies (mandatory notes, overtime threshold, min/max weekly hours, grace period). Full audit logging of all timesheet mutations. Proxy entry support for admins. Compliance reporting dashboard.
**Manager Review Workflow Enhancements**: Approval delegation, rejection templates, comments/history threads on timesheet entries, and a team review dashboard for managers with SLA tracking.
**Reminder & Escalation System**: Automated multi-channel reminder engine for timesheets, including submission reminders, manager approval reminders, auto-escalation, and weekly manager digest emails, configurable at the organization level.
**Partner Program**: A public landing page targeting PMO consulting firms, independent consultants, and trainers/educators, featuring an application form and partner type cards. Applications are stored in a dedicated database table.
**Project Workflow Configuration**: Organization-level configurable project lifecycle stages stored in `project_workflow_steps` table. Admins manage steps via Governance > Project tab in Org Settings. Each step has a key, label, description, position, and `isTerminal` flag. Terminal steps lock the project from edits. `BusinessProcessFlow` in `ProjectDetails.tsx` and status lists in `Projects.tsx` dynamically use org-configured steps.
**Cross-Project References**: Bidirectional linking between tasks and projects across different projects within the same organization, supporting various relationship types. Integrated into the task edit dialog and project summary.
**Friday Agent (Jarvis)**: AI-powered project assistant accessible via floating orb button. Backend service queries organization's project data and feeds context to OpenAI for intelligent responses. Uses OpenAI function/tool calling to execute write actions (create tasks, risks, issues, add notes, flag projects, assign/create resources) when confirmed by the user. Features include voice input/output via Web Speech API, "Hey Friday" wake word detection, concise mode toggle, clickable entity links in responses, and sessionStorage-persisted chat history. **Page-scoped context**: Agent detects the current page via URL path and injects focused entity data into the system prompt. Context-aware suggested prompts change based on the current page. **File attachments**: Users can attach up to 5 files (500KB each) to agent messages — text-based files are base64-decoded and included in the AI prompt. **CSV task import**: When a CSV file is attached, the agent parses it, maps flexible column names to task fields, and uses `bulk_create_tasks` tool. **Organization Configuration**: Organizations can configure their own Azure OpenAI endpoint and API key via the "Friday Agent" tab in Organization Settings, with encrypted API key storage and admin-only access. The jarvis service dynamically selects the org-specific Azure client or falls back to the system default.
**Investor Room**: Password-gated pitch deck page at `/investor-room` with animated slides, PMO Radar demo, pricing tiers, roadmap, and competitive matrix. Includes PDF download and email PDF dialog. Backend routes handle password verification, access checks, and email sending.
**Database & Schema Management**: The build process includes schema synchronization and additional index/manual migrations. A script validates all tables, columns, and foreign keys.
**KPI Analytics Dashboard**: Dedicated dashboards for organization-scoped user activity metrics (tasks, projects, issues, hours logged, feature usage) and a Super Admin console for platform-wide monitoring of subscriber activity, engagement, feature usage hotspots, and error friction trends.
**Media**: Public media section with listing page (`/media`) and individual post pages (`/media/:slug`). Managed via a Super Admin interface for creating, editing, and deleting posts with draft/published status. Database table `blog_posts` with slug-based routing.

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
    -   OpenAI (for Friday Agent)
