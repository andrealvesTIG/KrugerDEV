# Project Portfolio Management Application - Design Guidelines

## Design Approach
**Design System Foundation**: Linear + Asana Hybrid
- Linear's precision: Clean data tables, refined status badges, monochromatic sophistication
- Asana's structure: Dashboard cards, project hierarchy, workspace organization
- Enterprise credibility through restraint and clarity over decoration

## Core Design Elements

### Typography Hierarchy
- **Headers**: Inter or SF Pro Display, 600-700 weight
- **Body/Data**: Inter, 400-500 weight  
- **Scale**: 48px (page titles) → 24px (section headers) → 16px (body) → 14px (table data) → 12px (labels/meta)
- **Data emphasis**: Tabular numbers, mono-spaced for metrics

### Layout System
**Spacing Primitives**: Tailwind units 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section gaps: gap-6 to gap-8
- Page margins: p-8 to p-12
- Card spacing: p-6
- Table cells: px-4 py-3

### Component Library

**Dashboard Cards**
- Metric cards: Large number (32px), label below, micro-trend indicator
- Chart cards: Header with filters, full-bleed visualization area
- Status overview: Grid of progress rings with labels
- Activity feed: Timeline with avatar dots, compact entries

**Data Tables**
- Sticky header row with sort indicators
- Alternating row hover states (subtle)
- Inline status badges, priority icons
- Row actions appear on hover (right-aligned)
- Checkbox column for bulk actions
- Pagination footer

**Status Badges**
- Pill shape, 6px rounded corners
- Size: px-3 py-1, 12px text, 600 weight
- Solid fills for active states
- Types: On Track, At Risk, Delayed, Complete, Blocked

**Navigation**
- Fixed left sidebar (240px): Logo top, main nav middle, settings/profile bottom
- Top bar: Breadcrumbs left, search center, notifications/avatar right
- Sidebar items: Icon + label, active indicator (left border accent)

**Forms**
- Label above input pattern
- Input height: h-10
- Border focus states with subtle shadows
- Field grouping with clear sections
- Inline validation messages

**Project/Portfolio Cards**
- Header: Title + status badge + priority indicator
- Meta row: Owner avatar, due date, progress %
- Footer: Tag pills, comment count, attachment count
- Grid layout: 2-3 columns on desktop

**Modals/Panels**
- Slide-out panels (right): 480px width for detail views
- Centered modals: Max 600px for forms/confirmations
- Overlay backdrop: 40% opacity

### Interactions
**Minimal Animation Budget**
- Table row hover: Instant
- Dropdown menus: 150ms slide-down
- Modal entry: 200ms fade + slight scale
- NO scroll animations, parallax, or decorative motion

## Images

**No Hero Image**: Enterprise applications prioritize immediate utility - users land directly on their dashboard/workspace. 

**Avatar/Profile Images Only**:
- User avatars in navigation, activity feeds, assignment indicators
- Company logos in portfolio cards (if multi-client)
- All functional, no decorative imagery

## Page Structure Examples

**Dashboard Page**
- Top metrics row: 4 metric cards (projects, risks, milestones, issues)
- Chart section: 2-column grid (timeline gantt + risk matrix)
- Recent activity feed: Right sidebar or bottom section

**Portfolio List**
- Filters bar: Search, status dropdown, sort options
- Portfolio cards grid: 2-3 columns, consistent height
- Pagination controls bottom

**Project Detail**
- Header: Project title, status, key metrics
- Tab navigation: Overview, Milestones, Risks, Issues
- Content area: Mixed tables, cards based on active tab

**Data Table View (Issues/Risks)**
- Bulk action bar top (when items selected)
- Filterable columns
- Inline editing capability

---

**Design Principle**: Trust data density. Enterprise users value information accessibility over white space. Compact, scannable layouts with clear visual hierarchy create professional credibility.