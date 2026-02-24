# FridayReport.AI - Project Portfolio Management Application

## Overview
FridayReport.AI is a full-stack project portfolio management application designed for enterprise teams. It provides comprehensive project and portfolio oversight by facilitating the tracking of projects, portfolios, risks, milestones, and issues. The application emphasizes clean data tables, refined status badges, and a professional, enterprise-grade user interface, drawing inspiration from design principles found in Linear and Asana. Its core purpose is to offer robust tracking capabilities and reporting for strategic project groupings and individual initiatives.

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
- **Structure**: Page-based architecture with reusable UI components.

### Backend
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **API Design**: RESTful API with typed routes.
- **Session Management**: Express sessions with PostgreSQL store.
- **Build Tools**: esbuild for server, Vite for client.
- **Shared Code**: Common schemas, route definitions, and models are shared between frontend and backend.

### Data Model
The application manages entities including Portfolios, Projects, Tasks (with hierarchical roll-up), Resources, Risks, Issues, Milestones, Change Requests, Project Documents, and Organizations. Multi-tenant support is implemented with soft-delete and role-based access control.

### Organization Roles and Access Control
Access control is role-based (Owner, Admin, Member, Team Member). The Team Member role has restricted visibility based on assigned resources to specific portfolios, projects, tasks, and issues.

### Billing and Seat Management
The system supports plan-based seat limits per organization subscription, with Super Admins capable of granting additional bonus seats. Super Admins can manually adjust organization plans and bonus seats via dedicated API endpoints.

### Security and Data Integrity
- **Soft-Delete**: Organizations are deactivated rather than permanently deleted.
- **Email Verification**: Mandatory for all creation operations.
- **Bot Protection**: Honeypot fields and time-based validation for public authentication forms.

### User Consent Tracking
User consents (e.g., Terms of Service, Privacy Policy) are versioned and stored in a `user_consents` table. Users are prompted to re-accept when versions change. Super Admins can view consent records.

### Notification Engine
Supports various notification types (e.g., mentions, task overdue, health alerts, assignments) with severity levels. The engine includes services for checking alerts and uses deduplication to prevent spam.

### Help & Feedback System
A help button in the header allows users to submit tickets with text descriptions and screenshots. Submissions are stored, emailed to support, and manageable by Super Admins through a dedicated console.

### Organization-Scoped Integration Settings
Integration credentials (e.g., OAuth tokens) and connection statuses are stored per organization in `organization_integrations` for multi-tenant integration management. OAuth tokens are encrypted at rest using AES-256-GCM via `server/lib/tokenEncryption.ts`. Helper functions (`getOrgIntegration`/`upsertOrgIntegration` in `server/services/microsoftPlanner.ts`) handle transparent encryption/decryption. API endpoints are scoped by `organizationId`.

### Database Optimization
- 100+ indexes added on foreign key columns across all major tables for query performance
- Billing tables (`subscriptions`, `seat_assignments`) have DB-level FK constraints to `organizations` table (circular import prevents Drizzle `.references()`)
- Legacy risk tables (`risks`, `risk_change_logs`, `risk_resource_assignments`) contain real data but are deprecated; risks now managed via `issues` table with `itemType="risk"`

### Resource Management Module
Includes features for tracking resource skills with proficiency levels, resource availability (time-off, leave), and a resource utilization API. Frontend views include Capacity Planning, Workload Dashboard, Availability Calendar, and Demand vs. Supply Forecast.

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

### Integrations
- **Microsoft Project (MPXJ)**: For parsing `.mpp`, XML, and CSV project files.
- **Microsoft Planner**: Integration via Microsoft Graph API for importing and syncing projects and tasks (read-only tasks in the application).
- **Microsoft Dynamics 365 Sales Hub**: Organization-scoped integration for importing invoices using OAuth 2.0 via MSAL.
- **Analytics API**: REST endpoints for external analytics tools like Power BI, secured with API keys.

## API Error Convention
All API routes in `server/routes.ts` follow these HTTP status code conventions. **Always update `server/swagger.ts` when adding, modifying, or removing API routes.**

### Status Codes
- **400 Bad Request**: Invalid input, validation errors (Zod), missing required fields. Message describes the specific validation failure.
- **401 Unauthorized**: No authenticated user session. Always use message `"Authentication required"`. Use `getUserIdFromRequest(req)` helper (line ~916 in routes.ts) to check auth.
- **403 Forbidden**: User is authenticated but lacks permission. Use `"Access denied"` for generic cases, or specific messages like `"Admin access required"`, `"Not a member of this organization"`.
- **404 Not Found**: Resource doesn't exist. Message describes what wasn't found.
- **500 Internal Server Error**: Catch-all for unexpected errors in try/catch blocks.

### Auth Check Pattern
Every protected route must include this check near the top of the handler:
```typescript
const userId = getUserIdFromRequest(req);
if (!userId) return res.status(401).json({ message: 'Authentication required' });
```

### Swagger/OpenAPI
- The complete OpenAPI 3.0 spec is maintained in `server/swagger.ts` covering all ~400 routes.
- Swagger UI is served at `/api-docs`, raw JSON spec at `/api-docs.json`.
- When adding new routes, add corresponding entries in the swagger spec paths object.
- Use the helper functions (`op()`, `pathId()`, `qInt()`, `qStr()`, `body()`) and reusable response patterns (`authRes`, `stdRes`, `idRes`, `fullRes`, `inputRes`, `createRes`, `updateRes`) defined at the top of swagger.ts.