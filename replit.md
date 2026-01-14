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
   - Task number, WBS code, outline level (1-6), priority
   - Task type (Work/Milestone/Summary), constraint type/date
   - Baseline and actual start/end dates
   - Estimated/actual/remaining hours, cost tracking
   - Owner, phase, category, labels, critical path flag
   - **Hierarchical Roll-up**: Parent tasks (those with children) automatically roll up values from leaf tasks:
     - Start date = earliest start date of leaf children
     - End date = latest end date of leaf children
     - Progress = weighted average by duration
     - Hours and costs = sum of leaf children values
   - **Resource Assignment Restriction**: Only leaf tasks (no children) can have resource assignments; summary tasks display an explanatory message

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

### Email Verification Requirement
All create operations require the user's email to be verified before allowing creation. This applies to:
- Organizations, Portfolios, Projects
- Tasks, Risks, Issues, Milestones
- Resources, Resource Invites
- Project Intakes, Change Requests, Documents, Comments
- Organization Invites, Task Dependencies
- AI Project Generation, MPP Imports

**Exception**: The demo data generation endpoint (`/api/demo-data/generate`) is exempt to allow new users to generate sample data during onboarding before email verification.

When a create request is blocked due to email verification:
- Response status: 403 Forbidden
- Response includes: `{ message: "Email verification required...", emailVerificationRequired: true }`

### Bot Protection (Honeypot + Time-based)
All public authentication forms are protected against automated bots using a two-layer approach:

1. **Honeypot Fields**: Hidden form fields that real users cannot see. Bots typically fill all fields, so if these hidden fields have values, the submission is rejected.
   - Component: `client/src/components/HoneypotField.tsx`
   - Hidden fields: `website_url`, `phone_number` (positioned off-screen)

2. **Time-based Validation**: Tracks when the form loads. If submitted in under 2 seconds, it's likely a bot since humans take longer to read and fill forms.
   - Minimum submission time: 2000ms
   - Server-side validation in: `server/auth/emailAuth.ts` (`verifyHoneypot` function)

**Protected Endpoints**:
- `/api/auth/register` - User registration
- `/api/auth/login` - User login
- `/api/auth/forgot-password` - Password reset requests
- `/api/auth/magic-link/request` - Magic link sign-up
- `/api/auth/passwordless/request` - Passwordless authentication

**Cloudflare Turnstile**: Remains available as an optional additional protection layer. If `TURNSTILE_SECRET_KEY` and `VITE_TURNSTILE_SITE_KEY` are configured, Turnstile verification is also performed. Without these keys, honeypot protection alone guards against bots.

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

**Power BI Connection with API Key Authentication**:
1. **Generate API Key**: In the app, go to Settings and generate an API key (or call POST `/api/user/api-key/generate`)
2. **Configure Power BI Desktop**: 
   - Use Web connector and set URL to `https://your-app.replit.app/api/analytics/projects`
   - Select "Basic" authentication
   - **Username**: Your email address (e.g., `alex.rodov@trusteditgroup.com`)
   - **Password**: Your generated API key (64-character hex string)
3. Click Connect and schedule refresh as needed

**API Key Management Endpoints**:
- `GET /api/user/api-key` - Check if API key exists
- `POST /api/user/api-key/generate` - Generate new API key
- `DELETE /api/user/api-key` - Revoke API key