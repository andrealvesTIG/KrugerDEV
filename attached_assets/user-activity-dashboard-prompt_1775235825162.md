# User Activity Analytics Dashboard — Full Feature Specification

Use this as a prompt to build a super admin User Activity Analytics Dashboard in a separate project. This dashboard provides platform-wide user engagement tracking with 5 tabbed views, 2 API endpoints, and full charting capabilities.

---

## Tech Stack Requirements

- **Frontend:** React, TypeScript, TanStack React Query, Recharts (charting), Framer Motion (animations), Tailwind CSS, shadcn/ui components (Card, Badge, Select, Tabs, Table, Progress, Input, Dialog)
- **Backend:** Express.js (Node), Drizzle ORM, PostgreSQL
- **Icons:** Lucide React (Users, UserCheck, TrendingUp, Activity, MousePointerClick, Building2, Search, FolderKanban, ListTodo, AlertTriangle, Bug, Clock, FileText, Upload, Plug, Briefcase)

---

## Database Tables Required

### `users` table
- `id` (primary key)
- `created_at` (timestamp — used for cohort assignment and new user calculations)

### `user_activity_logs` table
- `id` (primary key)
- `user_id` (foreign key to users)
- `action` (varchar — the action name, e.g., "view_project", "create_task", "update_risk")
- `created_at` (timestamp — when the action occurred)

### `organizations` table
- `id`, `name`, `slug`, `created_at`, `deactivated_at`

### `organization_members` table
- `user_id`, `organization_id`

### Related tables for per-org metrics
- `projects` (organization_id, deleted_at, created_at)
- `tasks` (project_id, deleted_at, created_at)
- `issues` (project_id, item_type: "risk"|"issue", deleted_at, created_at)
- `timesheet_entries` (organization_id, entry_date, hours)
- `reports`, `data_imports`, `integrations`, `resources`, `portfolios` — each with organization_id and created_at

---

## API Endpoints

### 1. `GET /api/admin/user-activity-kpi`

**Auth:** Super admin only (reject with 403 if not super admin).

**Response shape:**
```typescript
{
  totalUsers: number;
  activeUsersLast7d: number;
  activeUsersLast30d: number;
  avgActionsPerUser: number;
  overallRetentionRate: number;
  newUsersThisWeek: number;
  newUsersLastWeek: number;
  cohorts: UserCohort[];
  actionBreakdown: { action: string; count: number; percentage: number }[];
  dailyActiveUsers: { date: string; count: number }[];
  weeklyRetentionTrend: { week: string; rate: number }[];
}
```

**Metric calculations:**

1. **Total Users:** `SELECT COUNT(*) FROM users`

2. **Active Users (7d):** `SELECT COUNT(DISTINCT user_id) FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '7 days'`

3. **Active Users (30d):** Same as above with 30-day interval.

4. **Avg Actions Per User:** Subquery that groups `user_activity_logs` by `user_id` over 30 days, counts actions per user, then takes `AVG()` over the result. Use `COALESCE(ROUND(AVG(...)), 0)`.

5. **New Users This Week / Last Week:** `COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days'` and the prior 7-day window.

6. **Overall Retention Rate:** Users who were created 7+ days ago AND were active in the last 7 days, divided by all users created 7+ days ago. Formula:
   ```sql
   SELECT CASE WHEN total > 0 THEN ROUND((active::numeric / total) * 100) ELSE 0 END
   FROM (
     SELECT
       (SELECT COUNT(*) FROM users WHERE created_at <= NOW() - INTERVAL '7 days') as total,
       (SELECT COUNT(DISTINCT ual.user_id) FROM user_activity_logs ual
        INNER JOIN users u ON u.id = ual.user_id
        WHERE ual.created_at >= NOW() - INTERVAL '7 days'
        AND u.created_at <= NOW() - INTERVAL '7 days') as active
   ) sub
   ```

7. **Cohort Analysis:** Define lifecycle periods as an array:
   ```
   Week 1 (0-7 days), Week 2 (7-14), Week 3-4 (14-28),
   Month 2 (28-56), Month 3 (56-84), Months 4-6 (84-168),
   Months 7-12 (168-336), 12+ months (336+)
   ```
   For each period, query users whose account age falls within the range. Then count how many were active (have entries in `user_activity_logs`), their total actions, avg actions per user, and top 5 action types.

   Return as:
   ```typescript
   interface UserCohort {
     cohortLabel: string;       // e.g., "Week 1"
     cohortStart: string;       // ISO date
     totalUsers: number;
     periods: CohortPeriod[];
   }
   interface CohortPeriod {
     label: string;
     key: string;
     totalUsers: number;
     activeUsers: number;
     totalActions: number;
     avgActionsPerUser: number;
     retentionRate: number;     // (activeUsers / totalUsers) * 100
     topActions: { action: string; count: number }[];
   }
   ```

8. **Action Breakdown:** Top 20 action types from the last 90 days with counts and percentages. Humanize action names by replacing underscores with spaces and capitalizing each word.

9. **Daily Active Users:** Last 30 days, grouped by date. Convert timestamps to a consistent timezone (`AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York'`). Format dates as "Mar 15", "Mar 16", etc.

10. **Weekly Retention Trend:** Last 12 weeks. For each week, count distinct active users and total users created up to that week. Retention = active / total * 100. Important: Use a subquery to materialize the grouped weeks first, then run the correlated subquery against the materialized alias — do NOT reference `GROUP BY` columns inside a correlated subquery directly, or PostgreSQL will reject it.
    ```sql
    SELECT w.week_start, w.active_users,
      (SELECT COUNT(*) FROM users WHERE created_at <= w.week_start + INTERVAL '7 days') as total_users
    FROM (
      SELECT DATE_TRUNC('week', created_at) as week_start,
        COUNT(DISTINCT user_id) as active_users
      FROM user_activity_logs WHERE created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', created_at)
    ) w ORDER BY w.week_start
    ```

### 2. `GET /api/admin/user-activity-kpi/organizations`

**Auth:** Super admin only.

**Query Params:**
- `period` — one of: `7d`, `14d`, `30d` (default), `90d`, `6m`, `1y`, `all`

**Response shape:**
```typescript
{
  organizations: OrgData[];
  totals: {
    totalOrgs: number;
    totalProjects: number;
    totalTasks: number;
    totalRisks: number;
    totalIssues: number;
    totalTimesheetEntries: number;
    totalTimesheetHours: number;
    totalReports: number;
    totalImportsExports: number;
    totalIntegrations: number;
    totalResources: number;
    totalPortfolios: number;
  };
  period: string;
}

interface OrgData {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  metrics: {
    projectsCreated: number;
    tasksCreated: number;
    risksCreated: number;
    issuesCreated: number;
    timesheetEntries: number;
    timesheetHours: number;
    reportsGenerated: number;
    importsExports: number;
    integrationsSetUp: number;
    resourcesManaged: number;
    portfoliosCreated: number;
    totalActivityLogs: number;
    activeUsers: number;
    topActions: { action: string; count: number }[];
  };
}
```

Map the `period` param to a PostgreSQL INTERVAL. Apply it as a date filter to all metric queries. When `period=all`, omit the date filter entirely.

For each active organization (`WHERE deactivated_at IS NULL`), query: projects, tasks, risks (issues where item_type='risk'), issues (item_type='issue'), timesheet entries + total hours, reports, imports/exports, integrations, resources, portfolios, total activity logs, active users, and top 5 actions.

Compute `totals` by reducing across all organization metrics on the server side.

---

## Frontend: 5 Tabbed Views

The dashboard has a tab bar with 5 views: **Overview**, **Cohorts**, **Retention**, **Engagement**, **Organizations**.

All views share 4 persistent KPI summary cards at the top.

### Shared KPI Cards (always visible)

| Card | Value | Subtitle | Color Logic |
|------|-------|----------|-------------|
| Total Users | `totalUsers` formatted with locale | "{newUsersThisWeek} new this week" | Always blue |
| Active Users (7d) | `activeUsersLast7d` formatted | "{DAU/MAU ratio}% DAU/MAU ratio" where ratio = `(7d / 30d) * 100` | Always green |
| Avg Actions/User | `avgActionsPerUser` formatted | "Across all active users" | Always purple |
| Overall Retention | `{overallRetentionRate}%` | "+X% WoW growth" / "-X% WoW growth" / "Stable WoW" | Green (>=50%), Amber (>=25%), Red (<25%) — applies to both icon color and left border |

Week-over-week growth = `((newUsersThisWeek - newUsersLastWeek) / newUsersLastWeek) * 100`.

Each KPI card has: colored left border (4px), icon, title (muted text), large value, subtitle text, and a staggered fade-in animation (0.1s delay between cards).

### Tab 1: Overview

4 charts in a 2x2 grid:

1. **Daily Active Users** — Area chart with gradient fill. 30-day data. X: date labels ("Mar 15"), Y: count. Blue color scheme with linear gradient from 30% opacity to 0%.

2. **Retention by Lifecycle Period** — Composed chart (dual Y-axis). Left Y: Retention %, Right Y: Avg Actions. Shows bars for avg actions per period (purple) and a line for retention rate (green). X-axis labels rotated -30 degrees.

3. **Weekly Retention Trend** — Line chart. 12 weeks of data. Y: 0-100%. Cyan color (#06b6d4). Dots on each data point (r=3).

4. **Top User Actions** — Horizontal bar chart (layout="vertical"). Top 10 actions. Y-axis shows action names (120px width). Amber color (#f59e0b). Rounded bar corners.

### Tab 2: Cohorts

- **Cohort Selector:** Dropdown to pick "All Cohorts" or a specific one (showing user count). Controls which cohorts appear in the chart below.

- **Cohort Activity Over Time:** Line chart showing active users by cohort across lifecycle periods. Each cohort gets a distinct color from a 12-color palette. X-axis: period labels, rotated -30 degrees. Shows legend.

- **Cohort Detail Cards:** Grid of cards (1-3 columns depending on screen), one per displayed cohort. Each card shows:
  - Header: cohort label + badge with user count
  - First 6 lifecycle periods with:
    - Period label (left)
    - Mini progress bar (24px wide) with color: green (>=50%), amber (>=25%), red (<25%)
    - Retention percentage (right)

### Tab 3: Retention

- **Retention Heatmap:** Full-width HTML table (not a chart). Rows = cohorts, columns = lifecycle periods ("Wk 1", "Wk 2", ... "Yr 2+"). Cells are color-coded:
  - >=75%: green at 80% opacity, white text
  - >=50%: green at 50% opacity, white text
  - >=25%: amber at 50% opacity, dark text
  - >0%: red at 30% opacity, dark text
  - 0%: muted at 30%, shows "—"
  - Each cell has a tooltip showing active user count
  - First column (cohort label) is sticky on horizontal scroll

- **Retention Curve:** Area chart showing average retention across all cohorts per period. Green gradient fill. Y: 0-100%.

- **Cohort Size Trend:** Bar chart showing number of users per cohort. Indigo color (#6366f1). Rounded top corners.

### Tab 4: Engagement

4 charts in a 2x2 grid:

1. **Engagement Intensity by Period:** Bar chart with per-bar coloring (each bar gets a different color from the palette using `<Cell>` components). Shows avg actions per user at each lifecycle stage.

2. **Action Distribution:** Donut/ring pie chart (innerRadius=60, outerRadius=100). Top 8 action types. Labels show name and percentage. 3px padding between segments.

3. **Engagement vs Retention Radar:** Radar chart comparing normalized engagement intensity (0-100) against retention rate (0-100) across lifecycle periods. Two overlapping radar shapes — purple for engagement, green for retention. Shows first 8 periods.

4. **Active Users by Period:** Area chart with amber gradient fill showing total active users at each lifecycle stage.

### Tab 5: Organizations

Separate API call to `/api/admin/user-activity-kpi/organizations`.

**Controls bar:**
- Search input with search icon (filters organizations by name, client-side, case-insensitive)
- Period dropdown (7d, 14d, 30d, 90d, 6m, 1y, All Time)
- Sort dropdown (Most Active, Most Projects, Most Tasks, Most Members, Most Timesheets, Name A-Z)

**Summary Cards Row:** 6 small cards in a responsive grid (2 cols mobile, 4 tablet, 6 desktop):
- Organizations (blue), Projects (indigo), Tasks (purple), Risks (amber), Issues (red), Timesheet Entries (green)
- Each shows: icon, label, large number value

**Charts row (2 columns):**
1. **Activity by Organization (Top 10):** Horizontal stacked bar chart. Stacks: Projects (blue), Tasks (purple), Risks (amber), Issues (red). Shows top 10 orgs by the selected sort. Org names truncated to 15 chars.

2. **Platform Activity Distribution:** Donut pie chart. Segments: Projects, Tasks, Risks, Issues, Timesheets, Reports, Imports. Each with a fixed color. Zero-value segments are filtered out.

**Organization Detail Table:**
- Full-width responsive table with columns: Organization, Members, Projects, Tasks, Risks, Issues, Timesheets, Hours, Reports, Imports, Integrations, Activity
- Activity column shows a progress bar (relative to the most active org) + numeric count
- Each org name cell also shows active user count as a subtitle
- **Expandable rows:** Click any row to toggle an expanded section with 4 detail groups:
  1. Portfolio & Resources (portfolios count, resources count)
  2. Project Work (total items = projects + tasks + risks + issues, risk-to-issue ratio)
  3. Time Tracking (entries count, avg hours per entry)
  4. Top Actions (list of top 5 actions with counts, or "No activity logged")
- Empty state: "No organizations found matching your search."

---

## UX Details

### Loading States
- KPI cards: 4 skeleton cards with `animate-pulse` class, muted background rectangles
- Charts: 4 skeleton chart cards with muted backgrounds
- Organizations tab: 3 skeleton cards

### Error States
- Main view: Centered card with Activity icon, "Unable to Load Activity Data" title, descriptive message
- Organizations view: Centered card with Building2 icon, "Unable to Load Organization Data" title

### Animations
- All KPI cards and chart cards use `framer-motion` fade-in: `{ opacity: 0, y: 20 }` → `{ opacity: 1, y: 0 }` with 0.4s duration
- Staggered delays: KPI cards at 0.1s increments, charts at 0.05s increments
- Cohort detail cards stagger at 0.1s per card

### Data Fetching
- React Query with `staleTime: 5 * 60 * 1000` (5 minutes)
- Credentials: `{ credentials: "include" }` on all fetch calls
- Organizations tab re-fetches when period changes (period is part of the query key)

### Color Palette (12 colors for cohorts/charts)
```
#3b82f6 (blue), #8b5cf6 (purple), #06b6d4 (cyan), #10b981 (green),
#f59e0b (amber), #ef4444 (red), #ec4899 (pink), #6366f1 (indigo),
#14b8a6 (teal), #f97316 (orange), #84cc16 (lime), #a855f7 (violet)
```

### Chart Styling Conventions
- All charts use `<ResponsiveContainer width="100%" height="100%">`
- CartesianGrid: `strokeDasharray="3 3"` with `className="opacity-30"`
- Tooltip: `contentStyle={{ borderRadius: "8px", fontSize: "12px" }}`
- Axis ticks: `fontSize: 11` (or 10 for rotated labels)
- Bar corners: `radius={[4, 4, 0, 0]}` (top rounded) or `radius={[0, 4, 4, 0]}` (right rounded for horizontal)
- Gradient fills: defined in `<defs>` with unique IDs, from 30% opacity to 0%

---

## Component Structure

```
UserActivityKPIDashboard (main component)
├── KPI Cards (4x, always visible)
├── Tab Bar (Overview | Cohorts | Retention | Engagement | Organizations)
├── OverviewView
│   ├── Daily Active Users (AreaChart)
│   ├── Retention by Lifecycle Period (ComposedChart)
│   ├── Weekly Retention Trend (LineChart)
│   └── Top User Actions (BarChart horizontal)
├── CohortsView
│   ├── Cohort Selector (Select dropdown)
│   ├── Cohort Activity Over Time (LineChart, multi-line)
│   └── Cohort Detail Cards (grid of cards with mini progress bars)
├── RetentionView
│   ├── Retention Heatmap (HTML table with colored cells)
│   ├── Retention Curve (AreaChart)
│   └── Cohort Size Trend (BarChart)
├── EngagementView
│   ├── Engagement Intensity by Period (BarChart with per-bar colors)
│   ├── Action Distribution (PieChart donut)
│   ├── Engagement vs Retention Radar (RadarChart)
│   └── Active Users by Period (AreaChart)
└── OrganizationsView (separate API call)
    ├── Search + Period Selector + Sort Dropdown
    ├── Summary Cards (6x mini cards)
    ├── Activity by Org Top 10 (BarChart stacked horizontal)
    ├── Platform Activity Distribution (PieChart donut)
    └── Organization Detail Table (expandable rows)
```
