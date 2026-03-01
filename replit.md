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
**Security**: Implements soft-delete for organizations, mandatory email verification for creation, bot protection with honeypot fields, and versioned user consent tracking. OAuth tokens for integrations are encrypted at rest using AES-256-GCM.
**Notification Engine**: Supports various notification types with severity levels, including deduplication.
**Help & Feedback**: Provides a system for users to submit tickets with text and screenshots.
**Integration Settings**: Stores organization-scoped integration credentials and connection statuses, with encrypted OAuth tokens.
**API Design**: Follows a consistent API error convention (400, 401, 403, 404, 500 status codes) and maintains a comprehensive OpenAPI 3.0 specification via `server/swagger.ts`.
**Performance Optimizations**: Includes extensive database indexing, N+1 query fixes, `React.memo` and `useCallback` for UI components, bulk assignment fetching, and virtual scrolling for large data sets.
**Resource Management**: Features tracking of resource skills, availability, and utilization, with views for Capacity Planning, Workload Dashboard, and Availability Calendar.
**PMO Radar**: A dynamic risk visualization page displaying risks and issues on a radar-style interface with interactive filters, time projection, timeline playback, and detailed drill-down capabilities. Overdue items are visually highlighted.
**Shared Risk Editing**: Utilizes a single, shared `EditRiskDialog` component across the application for consistent risk management, supporting AI suggestions, resource assignments, and change history.

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