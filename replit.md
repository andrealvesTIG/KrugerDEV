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
- `/api/home/recent-activity` uses `getRecentOrgActivity` storage method with `Promise.all` (4 total queries instead of sequential per-item queries)
- `KanbanView`/`DraggableTaskCard` use `useOrgFullTaskAssignments` bulk hook with per-card filtered `preloadedAssignments`
- `ProjectGanttView` bulk-fetches task assignments once via `useProjectTaskAssignments(projectId)` and passes filtered `preloadedAssignments` per row

### Gantt Chart Virtual Scrolling
Projects with more than 150 visible tasks use `@tanstack/react-virtual` for virtual scrolling in `ProjectGanttView`. Only rows visible in the viewport are rendered (plus a 15-row overscan buffer), which prevents the browser from freezing on large task lists. Virtual scroll mode disables drag-and-drop reordering (DnD via `@dnd-kit` only active for ≤150 tasks). Both left (metadata) and right (timeline) panes share the same `rowVirtualizer` keyed to the right pane's scroll element.

### Project Navigation (Org Auto-Switch)
`ProjectDetails.tsx` has a `useEffect` that detects when the loaded project belongs to a different organization than the currently selected one. If the user is a member of the project's org, it auto-switches to that org. If not, an access-denied message is shown. This replaces a previous infinite spinner bug (comment said "will redirect" but never did).

### Resource Management Module
Includes features for tracking resource skills with proficiency levels, resource availability (time-off, leave), and a resource utilization API. Frontend views include Capacity Planning, Workload Dashboard, Availability Calendar, and Demand vs. Supply Forecast.

## Schema Files
Schema definitions are split across multiple files:
- `shared/schema.ts` — Core application tables (70 tables: projects, tasks, issues, milestones, portfolios, resources, notifications, etc.)
- `shared/models/billing.ts` — Billing/subscription tables (plans, meters, subscriptions, seat_assignments, billing_cycles, billing_transactions, referrals, etc.)
- `shared/models/auth.ts` — Authentication tables (users, sessions, magic_link_tokens, password_reset_tokens)
- `shared/models/chat.ts` — Chat tables (conversations, messages)

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
- **Analytics API**: REST endpoints for external analytics tools like Power BI, secured with API keys (Basic auth) or Bearer tokens (org-scoped). Bearer tokens are managed via `api_tokens` table and CRUD endpoints at `/api/organizations/:orgId/api-tokens`. Bearer tokens also authenticate all CRUD endpoints (projects, tasks, etc.) via middleware that sets the session userId.

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

### Industry Landing Pages
Each vertical landing page follows the same structure: header, hero, trust bar, pain points, solution features, stats, use cases, feature comparison, sign-up form (email magic link + Microsoft/Google SSO), and footer. All use Framer Motion animations, are fully responsive, and have SEO meta tags.
- **Healthcare** (`/healthcare`): `HealthcareLandingPage.tsx`, assets in `client/src/assets/healthcare/`. Teal/blue theme. Targets hospitals, health systems, clinical PMOs.
- **Financial Services** (`/financial-services`): `FinancialServicesLandingPage.tsx`, assets in `client/src/assets/financial-services/`. Indigo/blue theme. Targets banks, insurance, investment firms.
- **Manufacturing** (`/manufacturing`): `ManufacturingLandingPage.tsx`, assets in `client/src/assets/manufacturing/`. Orange/amber theme. Targets factories, production, supply chain.
- **Industrial Automation** (`/industrial-automation`): `IndustrialAutomationLandingPage.tsx`, assets in `client/src/assets/industrial-automation/`. Cyan/slate theme. Targets SCADA, PLC, control systems.
- **Construction & Engineering** (`/construction`): `ConstructionLandingPage.tsx`, assets in `client/src/assets/construction/`. Yellow/amber theme. Targets capital programs, contractors, infrastructure.
- **Energy & Utilities** (`/energy`): `EnergyLandingPage.tsx`, assets in `client/src/assets/energy/`. Green/emerald theme. Targets utilities, renewables, grid modernization.
- **Government & Public Sector** (`/government`): `GovernmentLandingPage.tsx`, assets in `client/src/assets/government/`. Navy/blue-gray theme. Targets agencies, IT modernization, public infrastructure.

### PMO Radar
A risk radar visualization page (`/pmo-radar`) that displays an animated radar-style scanning system. Uses HTML Canvas with `requestAnimationFrame` for continuous sweep animation.
- **Components**: `client/src/components/radar/RadarCanvas.tsx` (canvas rendering), `FiltersPanel.tsx` (left-side filters), `DetailsDrawer.tsx` (right-side detail drawer)
- **Page**: `client/src/pages/PmoRadar.tsx` — fetches risks from `/api/issues?itemType=risk`, projects, and portfolios; transforms into radar signals
- **Axes**: Vertical = Time (future up, past down, ±90 days), Horizontal = switchable metric (Risk Score / Impact / Probability / Cost Exposure) selected via FiltersPanel dropdown; axis labels, tick marks, and tooltips update dynamically; Cost Exposure uses `costExposure` field from issues table, normalized to 0-100 relative scale with raw $ amounts shown on axis ticks and in tooltip; `maxCostExposure` prop passed from PmoRadar to RadarCanvas for tick formatting
- **Features**: Color-coded dots (green/yellow/red by risk level), dot size by impact, opacity by confidence, glow effect for high-risk signals, pulse animation on score changes, hover tooltips, click-to-detail drawer, portfolio/type/threshold filters, "Simulate Update" demo button, live clock display, time projection slider (0-12 months ahead)
- **Time Projection**: Slider in FiltersPanel (0-12 months, step 0.1) shifts all signal timeOffsetDays by `projectionOffsetDays = months * 30.44`, moving future risks toward/past center. Unresolved risks (not Closed/Mitigated) clamp at -85 days so they never scroll off the radar during simulation — only resolved risks disappear. Header shows projected date badge, RadarCanvas center label switches from "NOW" to projected month/year
- **Timeline Playback**: Play/Pause button auto-advances the time projection slider using `requestAnimationFrame` for smooth movie-like animation. Speed controls: 0.5x, 1x, 2x, 4x. Rewind button resets to Now. Dragging the slider pauses playback. Playback auto-stops at 12 months. Pressing play at max rewinds and restarts. During simulation, risks dynamically resolve: ~35% get Closed (fade out gradually over 1.5 months), ~35% get Mitigated (score drops to 30%, turn green, stay on radar), ~30% persist as unresolved. Resolution timing is deterministic via `hashId` so the movie replays identically
- **Overdue Visualization**: Signals with `timeOffsetDays < 0` (past the NOW line) are forced RED regardless of risk score, with full opacity, thicker stroke, and red glow. If `costExposure` is set, a compact formatted label (e.g. "$250K", "$1.5M") renders next to the dot. Tooltip shows "OVERDUE" badge (when dueDate exists) and formatted cost exposure in red
- **Theming**: Supports light/dark themes via `useTheme()` from `theme-provider`. All components accept `isDark` prop — canvas adapts background/grid/sweep colors, panels and drawer use theme-conditional classes. Light theme has sky-blue gradient with drifting cloud clusters (14 multi-blob ellipses); dark theme has deep navy gradient with 120 twinkling stars (seeded RNG, sine-based twinkle + glow halos). Both drift slowly downward to evoke timeline motion
- **Risk Spread**: Risks without dueDate/proximity use `createdAt` age for time placement: ≤7 days → far-future (30-70d), ≤30 days → near-future (15-45d), ≤90 days → near-center with drift, >90 days → past (-8 to -73d); Closed/Mitigated always placed in past based on age factor; hash-based jitter (±10d) prevents overlap; all outputs clamped to [-85, 85]; invalid dates fall back to hash-based distribution
- **Sidebar**: Located in Finance group alongside Simulation, uses `Radar` icon from lucide-react, module key `pmo-radar`
- **Details Drawer**: Slide-in panel showing signal details when clicking a dot; includes clickable Project link (navigates to `/projects/:id`), clickable Portfolio link (navigates to `/portfolios/:id`, shown when portfolio exists), cost exposure card, due date card (red-highlighted when overdue), status display, and "Edit Risk" button that opens the shared `EditRiskDialog` for in-place editing with full mutation support (update, delete, convert to issue, AI suggestions, resource assignment)
- **Sweep Pop Effect**: Dots pop (1.4x scale, 800ms sine curve + color glow) when the rotating radar sweep line passes over them; afterglow sleeve (144° wide, subtle opacity) creates realistic radar trailing effect behind the 60° bright sweep trail

### Shared Risk Edit Dialog
All risk editing across the application (Issues page, Project Risks tab, Portfolio Details) uses a single shared `EditRiskDialog` component (`client/src/components/EditRiskDialog.tsx`). It supports optional features via props: AI mitigation suggestions, resource assignments, change history, portfolio escalation, and convert-to-issue. Form validation uses Zod (title required). Parent components pass mutation callbacks rather than the dialog managing mutations internally. Both CreateRiskDialog and EditRiskDialog include `dueDate` (date input, maps to `issues.due_date`) and `costExposure` (numeric input, maps to `issues.cost_exposure`) fields. Empty values are sent as `null` for proper clearing.

### Performance Optimizations
- **Virtual Scrolling**: Gantt rows use virtual scroll when task count exceeds `VIRTUAL_SCROLL_THRESHOLD = 150`; DnD disabled in virtual-scroll mode.
- **Org Auto-Switch**: Switching organizations selects the correct org automatically.
- **Bulk Assignment Fetching**: `useProjectTaskAssignments(projectId)` fetches all task-resource assignments for a project in one query; called directly in `ProjectGanttView` (React Query deduplicates). Assignments precomputed into `taskAssignmentsMap` (Map<taskId, assignments[]>) to avoid per-row `.filter()` calls.
- **DB Indexes**: Indexes added on all major foreign-key columns: milestones (project_id), issues (project_id, item_type), tasks (project_id, parent_id, deleted_at), taskChangeLogs, projectChangeLogs, issueChangeLogs, taskDependencies, taskResourceAssignments, issueResourceAssignments, timesheetEntries (task_id, resource_id, project_id, organization_id).
- **N+1 Query Fix**: Project detail endpoint parallelizes `createdBy`/`updatedBy` user lookups using `Promise.all`.
- **React.memo**: `ProjectGanttTaskRowMeta` and `ProjectGanttTaskRowTimeline` wrapped in `React.memo` to prevent unnecessary re-renders.
- **useCallback**: Gantt row handlers (`toggleTaskSelection`, `pushToUndoStack`, `handleIndent`, `handleOutdent`, `toggleCollapse`, `handleCreateTaskAt`, `handleDeleteTask`, `handleSetBaseline`, `handleClearBaseline`, `handleEditDependencies`, `toggleTaskForBaseline`) wrapped in `useCallback` with stable deps to prevent prop churn on memoized rows.

### Swagger/OpenAPI
- The complete OpenAPI 3.0 spec is maintained in `server/swagger.ts` covering all ~400 routes.
- Swagger UI is served at `/api-docs`, raw JSON spec at `/api-docs.json`.
- When adding new routes, add corresponding entries in the swagger spec paths object.
- Use the helper functions (`op()`, `pathId()`, `qInt()`, `qStr()`, `body()`) and reusable response patterns (`authRes`, `stdRes`, `idRes`, `fullRes`, `inputRes`, `createRes`, `updateRes`) defined at the top of swagger.ts.
