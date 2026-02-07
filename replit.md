# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is a full-stack project portfolio management application for enterprise teams. It facilitates tracking of projects, portfolios, risks, milestones, and issues, adopting a design philosophy inspired by Linear and Asana. The application focuses on providing clean data tables, refined status badges, and a professional, enterprise-grade user interface. It aims to offer comprehensive project and portfolio oversight with detailed tracking capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack React Query.
- **Styling**: Tailwind CSS with shadcn/ui.
- **Data Visualization**: Recharts.
- **Animations**: Framer Motion.
- **Forms**: React Hook Form with Zod validation.
- **Structure**: Page-based with reusable components for UI and layout.

### Backend
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **API Design**: RESTful API with typed routes.
- **Session Management**: Express sessions with PostgreSQL store.
- **Build Tools**: esbuild for server, Vite for client.
- **Shared Code**: `shared/` directory for common schemas, route definitions, and models.

### Data Model
The application manages comprehensive data entities including:
- **Portfolios**: Strategic project groupings with detailed metadata, budget tracking, and performance metrics.
- **Projects**: Individual initiatives with extensive tracking for scope, budget, schedule, and risks.
- **Tasks**: Work items with hierarchical roll-up logic for dates, progress, hours, and costs. Resource assignments are restricted to leaf tasks.
- **Resources**: Team members and equipment with detailed profiles, rates, and availability.
- **Risks, Issues, Milestones**: Dedicated entities for tracking project risks, issues, and key milestones with associated metadata and resolution strategies.
- **Change Requests**: Formal requests with workflow status and impact assessment.
- **Project Documents**: Categorized document management with versioning.
- **Organizations**: Multi-tenant support with soft-delete capabilities and role-based access control.

### Organization Roles and Access Control
- **Roles**: Owner, Admin, Member, Team Member.
- **Team Member Role**: Restricted visibility based on resource assignments to portfolios, projects, tasks, and issues. Visibility is determined by `createdBy`, `teamMemberResourceIds`, `invitedProjectIds`, `taskResourceAssignments`, `riskResourceAssignments`, and `issueResourceAssignments`.

### Billing and Seat Management
- **Plan-Based Seat Limits**: Each organization subscription has seat limits based on their plan.
- **Bonus Seats**: Super Admins can grant additional bonus seats beyond plan limits, stored in the `bonusSeats` column on subscriptions.
- **Total Seats Calculation**: Available seats = plan's maxSeats + bonusSeats.
- **Super Admin Billing Management**: API endpoints (`GET/PUT /api/admin/organizations/:id/billing`) allow Super Admins to manually change organization plans and set bonus seats, bypassing normal billing flows.

### Security and Data Integrity
- **Organization Soft-Delete**: Organizations are deactivated rather than permanently deleted, preserving data for potential reactivation by Super Admins.
- **Email Verification**: Mandatory email verification for all creation operations across the application, with a 403 Forbidden response if not verified.
- **Bot Protection**: Implemented via honeypot fields and time-based validation for public authentication forms, with optional Cloudflare Turnstile integration.

### User Consent Tracking
- **Consent Table**: `user_consents` table stores consent records with user ID, consent type, version, timestamp, IP address, user agent, and method.
- **Versioning**: Each consent type (Terms of Service, Privacy Policy) has a version string. When versions change, users must re-accept.
- **Current Versions**: Defined in `shared/schema.ts` as `CURRENT_TERMS_VERSION` and `CURRENT_PRIVACY_VERSION`.
- **Consent Flow**: `TermsConsentModal` appears for logged-in users who haven't accepted the current versions.
- **Admin View**: Super Admins can view all consent records and statistics in the "User Consents" tab of the Super Admin Console.
- **Public Pages**: Terms of Service at `/terms`, Privacy Policy at `/privacy`.

## External Dependencies

### Database & ORM
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: Type-safe database interactions.

### Authentication
- **Replit Auth**: OpenID Connect for user authentication.
- **Passport.js**: Authentication middleware.
- **express-session**: Session management.

### UI/UX Libraries
- **shadcn/ui**: Component library based on Radix UI.
- **Radix UI**: Accessible, unstyled UI primitives.
- **Lucide React**: Icon library.

### Development & Utilities
- **Vite**: Frontend development and bundling.
- **esbuild**: Server bundling.
- **tsx**: TypeScript execution for development.
- **date-fns**: Date manipulation.
- **Zod**: Schema validation.
- **drizzle-zod**: Zod schema generation from Drizzle.

### Integrations
- **Microsoft Project (MPXJ)**: Java-based library for parsing `.mpp`, XML (MSPDI), and CSV project files.
- **Microsoft Planner**: Integration via Microsoft Graph API for importing and syncing projects and tasks. Supports OAuth for secure access and task synchronization, with tasks from Planner being read-only within the application.
- **Microsoft Dynamics 365 Sales Hub**: Organization-scoped integration for importing invoices from Dynamics 365 Sales Hub. Uses OAuth 2.0 via MSAL for authentication, stores tokens and environment URL per organization in the `organization_integrations` table. Imported invoices are marked with `source='dynamics365'` and include `externalId` and `externalUrl` for linking back to the source system. Imported invoices are read-only (no edit button) with a resync button to refresh data from Dynamics 365.
- **Analytics API**: REST endpoints for integrating with external analytics tools like Power BI, providing project, portfolio, risk, issue, milestone, intake, and KPI data. Secured with API key authentication.

### Notification Engine
- **Notification Types**: The system supports multiple notification types including:
  - `mention`: @mention in a comment
  - `comment_reply`: reply to user's comment
  - `task_overdue`: task past its end date
  - `task_deadline_warning`: task deadline approaching (3 days or less)
  - `project_health_alert`: project health changed to Red
  - `portfolio_health_alert`: portfolio has multiple red projects
  - `task_assignment`: user assigned to a task
  - `risk_assignment`: user assigned to a risk
  - `issue_assignment`: user assigned to an issue
  - `project_assignment`: user added to a project team
  - `milestone_approaching`: milestone deadline within 7 days
  - `milestone_overdue`: milestone past its target date
  - `status_change`: project/task status changed
- **Severity Levels**: info, warning, critical - displayed with appropriate styling in the UI.
- **Notification Engine Service**: Located at `server/services/notificationEngine.ts` with functions for checking overdue tasks, upcoming deadlines, project health, and milestones.
- **API Endpoints**:
  - `POST /api/organizations/:orgId/notifications/check`: Run notification checks for an organization (admin only)
  - `POST /api/admin/notifications/check-all`: Run checks for all organizations (super admin only, for scheduled jobs)
- **Assignment Notifications**: Helper functions for creating assignment notifications when users are added to tasks, risks, issues, or projects.
- **Deduplication**: Notifications are deduplicated to prevent spam - each notification type/reference is only created once per 24 hours.
- **Frontend Display**: NotificationBell component displays notifications with type-specific icons and severity badges.

### Help & Feedback System
- **Help Button**: Located in the top header bar, accessible from all pages.
- **Help Dialog**: Users can submit text descriptions and paste/upload screenshots directly.
- **Image Support**: Supports clipboard paste (Ctrl+V/Cmd+V) and file upload for screenshots.
- **Ticket Tracking**: All submissions are stored in the `help_tickets` table with user info, organization, status, and priority.
- **Email Notifications**: Tickets are automatically emailed to support@fridayreport.ai.
- **Super Admin Management**: Help Tickets tab in Super Admin Console for viewing, filtering, updating status/priority, and resolving tickets.
- **Status Workflow**: new → in_progress → resolved → closed.

### Organization-Scoped Integration Settings
- **Integration Credentials Storage**: The `organization_integrations` table stores OAuth tokens and connection status per organization and integration type.
- **Multi-Tenant Integration Architecture**: Each organization has separate integration connections (Microsoft Planner, etc.) that are not shared across organizations.
- **Token Management**: Access tokens, refresh tokens, and token expiry are stored per organization. When users switch organizations, they see the correct integration status for that specific organization.
- **Helper Functions**: `getOrgIntegration()` and `upsertOrgIntegration()` in `server/services/microsoftPlanner.ts` handle reading and writing organization-scoped integration data.
- **API Pattern**: All integration-related API endpoints accept `organizationId` as a parameter (query string for GET, body for POST) to scope operations to the correct organization.

### Recent Schema Fixes (January 2026)
- **Projects Table**: Added missing `completed_at` and `completed_by` columns to track project completion status and who completed them.
- **Video Assets**: Landing page demo video is compressed and served from `client/public/videos/` folder with dedicated Express route for production compatibility.

### Schema Sync (February 2026)
- **Tables Created**: Synced 7 missing tables that were defined in schema but not in database:
  - `external_shares`: Cross-organization object sharing capabilities
  - `time_categories`: Timesheet category definitions per organization
  - `non_project_time_entries`: Non-project time tracking (PTO, admin time, etc.)
  - `application_metrics`: Application performance and usage metrics
  - `user_activity_logs`: User activity tracking for analytics
  - `feature_usage_logs`: Feature usage tracking for analytics
  - `error_logs`: Error tracking and debugging logs
- **Column Added**: Added missing `is_intake_approver` column to `resources` table (boolean, default false)

### Resource Management Module (February 2026)
- **Resource Skills** (`resource_skills` table): Normalized skill tracking per resource with proficiency levels (Beginner/Intermediate/Advanced/Expert). CRUD via `/api/organizations/:orgId/resources/:resourceId/skills`.
- **Resource Availability** (`resource_availability` table): Planned time-off/leave tracking with types (leave, pto, sick, holiday, training). CRUD via `/api/organizations/:orgId/resource-availability`.
- **Resource Utilization API**: Aggregate endpoint (`/api/organizations/:orgId/resource-utilization`) computes per-resource allocated hours vs capacity, over-allocation detection, and summary stats.
- **Capacity Planning View**: Tab on Resources page showing per-resource capacity bars with date range filtering.
- **Workload Dashboard**: Tab on Resources page with summary cards (total resources, avg utilization, over/under-allocated counts) and sortable resource list.
- **Availability Calendar**: Month-view calendar showing resource time-off with color-coded type indicators and "Add Time Off" dialog.
- **Demand vs Supply Forecast**: Recharts bar chart comparing weekly team capacity vs projected demand over configurable periods.
- **Skills Management**: Skills & Competencies card on Resource Details page for adding/removing skills with proficiency levels.
- **Components**: `client/src/components/resources/` contains CapacityPlanningView, WorkloadDashboard, AvailabilityCalendar, DemandForecast.

### Deprecated Tables (Pending Cleanup)
The following tables are deprecated and scheduled for future removal. Data migration should be verified before cleanup:
- **`risks`**: DEPRECATED - Risk tracking is now handled by the `issues` table with `itemType='risk'` filter. The unified issues table provides better consistency and reduces schema complexity.
- **`risk_resource_assignments`**: DEPRECATED - Linked to deprecated `risks` table. Use `issueResourceAssignments` for risk resource assignments.
- **`risk_change_logs`**: DEPRECATED - Linked to deprecated `risks` table. Use `issueChangeLogs` for risk change history.

**Migration Notes**: Before removing deprecated tables:
1. Verify no production data exists in `risks` table that needs migration
2. Confirm all risk-related queries use `issues` table with appropriate `itemType` filters
3. Update any remaining `riskResourceAssignments` references to use `issueResourceAssignments`