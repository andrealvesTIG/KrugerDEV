# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is an enterprise-grade project portfolio management application designed to provide comprehensive oversight of projects, portfolios, risks, milestones, and issues. It emphasizes clean data presentation, refined status badges, and a professional user interface to offer robust tracking and reporting for strategic project groupings and individual initiatives.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features a professional, enterprise-grade UI inspired by Linear and Asana, utilizing a page-based architecture with reusable UI components. Styling is handled with Tailwind CSS and shadcn/ui. Data visualization uses Recharts, and Framer Motion provides animations. Industry-specific landing pages are responsive and SEO-optimized. The PMO Radar visualization employs HTML Canvas with `requestAnimationFrame` for dynamic, animated displays, supporting light and dark themes.

### Technical Implementations
**Frontend**: Built with React 18 and TypeScript, using Wouter for routing, TanStack React Query for state management, React Hook Form with Zod for form handling, and `@tanstack/react-virtual` for virtual scrolling.
**Backend**: Developed with Express.js and TypeScript, utilizing PostgreSQL with Drizzle ORM. It features a RESTful API with typed routes, Express sessions for session management, and esbuild for server builds.
**Shared Code**: Common schemas, route definitions, and models are shared between the frontend and backend.
**Data Model**: Manages Portfolios, Projects, Tasks (hierarchical), Resources, Risks, Issues, Milestones, Change Requests, Project Documents, and Organizations. It supports multi-tenancy with soft-delete and role-based access control (Owner, Admin, Member, Team Member).
**Security**: Implements soft-delete for organizations, mandatory email verification, bot protection, versioned user consent tracking, and encrypted OAuth tokens. All API endpoints enforce authentication and authorization based on user roles and organization membership.
**Signup Source Tracking**: Records the origin of user signups for analytics purposes, preserving source information across authentication flows.
**Notification Engine**: Supports various notification types with severity levels and deduplication. Includes welcome emails for all new user registrations.
**Help & Feedback**: Provides a system for users to submit support tickets with text and screenshots.
**Friday Academy Training & Certification**: A complete training section (`/training`) under the Help sidebar group where users explore interactive training modules organized by role (Project Manager, Portfolio Manager, Functional Administrator) across all eight PMO subject areas: Portfolio Management, Project Portfolio Management, Optimization, Resource Management, Schedule Management, Risks & Issues Management, Predictive Analytics, and PMO Governance. Each module has 5 lessons with 3 scenario-based quiz questions each (40 lessons, 120 questions total). Features include: video placeholders, sequential lesson gating, localStorage-based progress tracking, and branded PDF certificate generation (jsPDF) upon module completion. Certificates feature the FridayReport.AI logo, brand colors (orange/blue), unique certificate IDs, curriculum listing, and professional layout. The Training page cards show "Start Learning"/"In Progress"/"Completed" states with progress bars. Architecture uses a centralized data file (`client/src/lib/trainingData.ts`) for all module content and a generic module player page (`client/src/pages/TrainingModule.tsx`) with parameterized routing (`/training/:moduleId`). Schedule Management retains its dedicated route at `/training/schedule-management` for backward compatibility.
**Integration Settings**: Stores organization-scoped integration credentials and connection statuses, with encrypted OAuth tokens.
**API Design**: Follows a consistent API error convention and maintains a comprehensive OpenAPI 3.0 specification.
**Performance Optimizations**: Includes extensive database indexing, N+1 query fixes, `React.memo` and `useCallback` for UI components, batch queries, virtual scrolling for large data sets, and memoized date parsing. Server-side date filtering is supported.
**Testing**: Utilizes Vitest for testing, focusing on date calculation logic and performance.
**Resource Management**: Tracks resource skills, availability, and utilization with dedicated views for Capacity Planning, Workload Dashboard, and Availability Calendar.
**PMO Radar**: A dynamic risk visualization displaying risks and issues on a radar-style interface with interactive filters, time projection, and drill-down capabilities.
**Shared Risk Editing**: A consistent `EditRiskDialog` component for risk management across the application, supporting AI suggestions, resource assignments, and change history.
**Issues Grid View**: An inline-editable data grid for managing issues and risks, with user-configurable column visibility and persistence of preferences.
**Issues Export/Import**: Supports exporting and importing filtered issues/risks to/from Excel (.xlsx) or CSV (.csv) formats, with a preview dialog and project selection for imports.
**CSV Import/Export Round-Trip**: Allows exporting tasks to CSV from project details and re-importing modified tasks, matching by WBS code or name.
**Task Date Scheduling Rules**: Implements rules for task date changes, ensuring consistent duration and cascading updates to dependent tasks, while respecting working days. Milestones are preserved.
**Gantt Undo/Redo**: A comprehensive undo/redo system for Gantt chart operations, including field updates, task reordering, indent/outdent, creation, deletion, and dependency management.
**Schedule PNG Export**: Enables exporting the visible schedule as a PNG image, capturing both table columns and the Gantt chart.
**Timesheet History Tab**: Displays past timesheet entries grouped by week, with selectable date ranges, status filters, and detailed entry views.
**Critical Path Method (CPM)**: Calculates critical path elements (ES/EF/LS/LF/TF) for tasks using forward and backward passes, supporting various dependency types and lag. Excludes summary tasks from CPM calculation.
**Professional Profile & Analytics**: Features a user profile with professional credentials, an analytics dashboard displaying engagement statistics, a weekly activity chart, feature usage, a tiered professional ranking system, and an achievement badge gallery.
**Shareable Branded Badges**: Allows users to share their profile and individual earned badges externally via branded images and a public profile page.
**AI Create Features**: Incorporates AI for smart project matching to prevent duplication and ensure context-aware generation of tasks, risks, issues, and milestones. AI Create actions are logged for change tracking.

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