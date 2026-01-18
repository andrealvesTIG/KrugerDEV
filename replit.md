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

### Security and Data Integrity
- **Organization Soft-Delete**: Organizations are deactivated rather than permanently deleted, preserving data for potential reactivation by Super Admins.
- **Email Verification**: Mandatory email verification for all creation operations across the application, with a 403 Forbidden response if not verified.
- **Bot Protection**: Implemented via honeypot fields and time-based validation for public authentication forms, with optional Cloudflare Turnstile integration.

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
- **Analytics API**: REST endpoints for integrating with external analytics tools like Power BI, providing project, portfolio, risk, issue, milestone, intake, and KPI data. Secured with API key authentication.