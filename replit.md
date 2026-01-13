# FridayReport.AI - Project Portfolio Management Application

## Overview

FridayReport.AI is a full-stack project portfolio management application designed for enterprise teams to track projects, portfolios, risks, milestones, and issues. The application follows a Linear + Asana hybrid design approach, emphasizing clean data tables, refined status badges, and professional enterprise-grade UI.

The stack consists of a React frontend with TypeScript, an Express.js backend, PostgreSQL database with Drizzle ORM, and Replit Auth for authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Charts**: Recharts for data visualization
- **Animations**: Framer Motion for smooth transitions
- **Forms**: React Hook Form with Zod validation

The frontend follows a page-based architecture with shared components:
- `client/src/pages/` - Route components (Dashboard, Projects, Portfolios, Issues, Calendar)
- `client/src/components/ui/` - Reusable shadcn/ui components
- `client/src/components/layout/` - Layout components (Sidebar, AppLayout)
- `client/src/hooks/` - Custom hooks for data fetching and authentication

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API Design**: RESTful API with typed routes defined in `shared/routes.ts`
- **Session Management**: Express sessions with PostgreSQL store
- **Build Tool**: esbuild for server bundling, Vite for client

Key backend files:
- `server/routes.ts` - API route handlers with automatic seeding
- `server/storage.ts` - Data access layer interface
- `server/db.ts` - Database connection setup
- `shared/schema.ts` - Drizzle schema definitions and Zod validators

### Data Model
The application manages the following core entities with extensive industry-standard metadata fields:

1. **Portfolios** - Strategic groupings of projects with:
   - Business owner, strategic objectives, risk tolerance
   - Budget tracking (allocated/spent), health score, status
   - Target dates, department, performance metrics

2. **Projects** - Individual initiatives with:
   - Project code, type, methodology (Waterfall/Agile/etc.)
   - Business sponsor, owner, technical lead references
   - Baseline and actual dates for variance tracking
   - Budget, actual cost, forecast, cost/schedule variance
   - Scope, objectives, success criteria, constraints, assumptions
   - Department, category, business value, risk level

3. **Tasks** - Project tasks/work items with:
   - Task number, WBS code, outline level, priority
   - Task type (Work/Milestone/Summary), constraint type/date
   - Baseline and actual start/end dates
   - Estimated/actual/remaining hours, cost tracking
   - Owner, phase, category, labels, critical path flag

4. **Resources** - Team members and equipment with:
   - Resource code, type (Employee/Contractor/Vendor/Equipment)
   - Contact info, manager, department, cost center, location
   - Hourly/overtime/cost rates, weekly capacity, availability %
   - Skills, certifications, experience level
   - Start/end dates, billable flag

5. **Risks** - Project risks with:
   - Risk number, category, score (probability x impact)
   - Response strategy, contingency plan, trigger events
   - Owner, reviewer, identified/target/actual resolution dates
   - Impact (cost/schedule), proximity, residual risk

6. **Issues** - Bug/task/enhancement tracking with:
   - Issue number, category, severity, escalation level
   - Reporter, assignee, reported/target/actual resolution dates
   - Resolution, root cause, impact (cost/schedule)
   - Steps to reproduce, environment, labels

7. **Milestones** - Key project milestones with:
   - Milestone number, type, phase
   - Baseline and actual dates
   - Owner, deliverables, acceptance criteria
   - Dependencies, success metrics, stakeholders

8. **Change Requests** - Formal change requests with type (scope/schedule/budget/resource), priority, impact assessment, justification, and workflow status (pending/under_review/approved/rejected/implemented)

9. **Project Documents** - Document management with categories (general/contract/requirement/design/test/report), versioning, and URL references

10. **Organizations** - Multi-tenant organizations with soft-delete (deactivate/reactivate) capability

### Organization Soft-Delete
Organizations use soft-delete (deactivation) rather than permanent deletion:
- When deleted, organizations are marked with `deactivatedAt` and `deactivatedBy` timestamps
- Deactivated organizations are hidden from normal queries but data is preserved
- Organization members remain intact during deactivation for seamless restore
- Only Super Admins can restore (reactivate) deactivated organizations via the Super Admin console
- Restore endpoint: `POST /api/admin/organizations/:id/reactivate`
- View deactivated: `GET /api/admin/organizations/deactivated`

### Shared Code Pattern
The `shared/` directory contains code used by both frontend and backend:
- `shared/schema.ts` - Database schema, TypeScript types, Zod validators
- `shared/routes.ts` - API contract definitions with request/response schemas
- `shared/models/auth.ts` - User and session models for Replit Auth

## External Dependencies

### Database
- **PostgreSQL** - Primary data store
- **Drizzle ORM** - Type-safe database queries and migrations
- **connect-pg-simple** - PostgreSQL session store

### Authentication
- **Replit Auth** - OpenID Connect authentication via Replit
- **Passport.js** - Authentication middleware
- **express-session** - Session management

### UI Components
- **shadcn/ui** - Component library built on Radix UI primitives
- **Radix UI** - Accessible, unstyled UI primitives
- **Lucide React** - Icon library

### Build & Development
- **Vite** - Frontend dev server and bundler
- **esbuild** - Server bundling for production
- **tsx** - TypeScript execution for development

### Data & Utilities
- **date-fns** - Date formatting and manipulation
- **Zod** - Schema validation
- **drizzle-zod** - Generate Zod schemas from Drizzle tables

### Microsoft Project Integration
- **MPXJ** - Open-source Java library for parsing native .mpp files
- Located in `lib/` directory with compiled Java parser
- Supports MPP (native), XML (MSPDI), and CSV formats
- Parsed fields: Task Name, WBS, Start/Finish Date, Duration, % Complete, Outline Level, Summary/Milestone flags

### Analytics API (Power BI Integration)
The application exposes REST API endpoints for external analytics tools like Power BI:

**Endpoints** (all require authentication):
- `GET /api/analytics/projects` - Flat project data with aggregated metrics
- `GET /api/analytics/portfolios` - Portfolio summaries with project counts
- `GET /api/analytics/risks` - All risks with project/org context
- `GET /api/analytics/issues` - All issues with project/org context
- `GET /api/analytics/milestones` - All milestones with project/org context
- `GET /api/analytics/intakes` - Project intake pipeline data
- `GET /api/analytics/summary` - Organization-level KPI summaries

**Query Parameters**:
- `organizationId` (optional) - Filter to specific organization

**Power BI Connection**:
1. Use Web connector in Power BI Desktop
2. Set URL to `https://your-app.replit.app/api/analytics/projects`
3. Configure authentication (requires session cookie from logged-in user)
4. Schedule refresh as needed