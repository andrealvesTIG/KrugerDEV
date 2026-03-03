# Performance Assessment Report — Date/Schedule Handling

**Application**: FridayReport.AI PMO Platform  
**Date**: March 2026  
**Scope**: Task date filtering, sorting, pagination, Gantt rendering, working-day calculations

---

## Executive Summary

- **Working-day calculations** are the single biggest CPU bottleneck — the loop-based `workingDaysBetween` iterates every calendar day between two dates (O(D) per task), totaling **222ms for 10K tasks** vs **6.5ms with arithmetic** (34× speedup).
- **Multi-org task aggregation** performed sequential DB round-trips (2×N queries for N organizations) — **fixed** to use a single batched query with `inArray()`.
- **Client-side date parsing** created thousands of redundant `parseISO()` + `format()` calls per Gantt render — **fixed** with memoized date maps (`useMemo`).
- **No server-side date filtering existed** — all tasks were fetched then filtered in JavaScript. **Added** SQL WHERE clause support for date ranges, overdue detection, and server-side sorting.
- **Database indexes were missing** on `startDate`, `endDate`, `status`, and `createdAt` columns — **added** 5 new indexes including a composite index for the primary getTasks query.
- **Client-side sorting at 100K tasks takes 62ms** — manageable for typical workloads but would benefit from SQL-level ORDER BY for large datasets.

---

## Current State Analysis

### Key Operations & Complexity

| Operation | Location | Before | After | Notes |
|---|---|---|---|---|
| Task list fetch (per project) | `storage.getTasks()` | O(N) full scan | O(log N) indexed | Added composite index on `(projectId, deletedAt, taskIndex)` |
| Global task fetch (paginated) | `storage.getTasksByOrganizationPaginated()` | O(N) sort on `createdAt` | O(log N) indexed | Added index on `createdAt` |
| Multi-org aggregation | `routes.ts` listAll | O(Orgs × 2) DB calls | O(2) total | Batched into single query |
| Date range filter | Client-side only | O(N) in JS | O(log N) in SQL | Added server-side WHERE clauses |
| Working days calculation | `workingDays.ts` | O(D) per task (day loop) | O(D) per task | Arithmetic O(1) available as future optimization |
| Gantt date parsing | `ProjectGanttView.tsx` | O(N) per render | O(N) once (memoized) | Pre-parsed date map |
| Duration display | `Tasks.tsx` Gantt | O(N×D) per render | O(N×D) once (memoized) | Pre-computed in useMemo |

### Benchmark Results

All benchmarks run on synthetic in-memory data. DB-level benchmarks would show greater improvements due to I/O reduction.

#### Client-Side Filtering & Sorting

| Metric | 1K tasks | 10K tasks | 100K tasks | Scaling |
|---|---|---|---|---|
| Filter by date range | 0.08ms | 0.33ms | 4.5ms | O(N) |
| Sort by startDate | 0.97ms | 4.65ms | 61.4ms | O(N log N) |
| Filter+Sort+Page combined | 0.15ms | 1.08ms | 11.2ms | O(N log N) |

#### Working Days Calculation

| Implementation | 1K tasks | 10K tasks | Speedup |
|---|---|---|---|
| Loop (current) | 21.6ms | 222ms | baseline |
| Arithmetic (optimized) | 2.0ms | 6.5ms | **34×** |

#### Date Parsing Overhead

| Approach | 5K tasks |
|---|---|
| `parseISO` each render cycle | 1.60ms |
| Cached parse (Map, once) | 0.80ms |

---

## Bottlenecks Identified & Fixes Applied

### 1. Database Indexes (T001) — Applied ✅

**Before**: Tasks table had only 3 indexes (`project_id`, `parent_id`, `deleted_at`). Date columns and common query patterns were unindexed.

**Added** in `shared/schema.ts`:
- `tasks_start_date_idx` on `startDate`
- `tasks_end_date_idx` on `endDate`
- `tasks_status_idx` on `status`
- `tasks_created_at_idx` on `createdAt`
- `tasks_project_deleted_task_idx` composite on `(projectId, deletedAt, taskIndex)`

**Impact**: Eliminates sequential scans for date-filtered queries and the primary per-project task fetch.

### 2. Server-Side Date Filtering (T002) — Applied ✅

**Before**: `GET /api/tasks/all` returned all tasks; filtering happened in React `useMemo`.

**Added** optional query parameters:
- `startDateFrom`, `startDateTo`, `endDateFrom`, `endDateTo` — SQL date range filters
- `overdue` — filters tasks where `endDate < today AND status != 'Completed'`
- `sortBy` (`startDate`, `endDate`, `createdAt`) and `sortOrder` (`asc`, `desc`)

**Files**: `server/storage.ts` (new `TaskDateFilterOptions` interface, `buildDateFilterConditions()`, `getTaskSortOrder()` helpers), `server/routes.ts` (query parameter parsing)

**Impact**: Reduces network payload and eliminates client-side processing for filtered views. Backward-compatible — no params = same behavior as before.

### 3. Multi-Org N+1 Fix (T003) — Applied ✅

**Before** (routes.ts ~line 9712):
```javascript
for (const orgId of targetOrgIds) {
  const { tasks: orgTasks } = await storage.getTasksByOrganizationPaginated(orgId, 999999, 0, onlyTaskIds);
  allFilteredTasks = allFilteredTasks.concat(orgTasks);
}
```
This made 2×N sequential DB calls (count + data per org).

**After**: New `getTasksByMultipleOrganizationsPaginated()` method performs a single projects lookup + 1 count + 1 data query using OR conditions for mixed access levels. Team member task IDs are gathered in parallel with `Promise.all`.

**Impact**: Reduces from 2×N to ≤3 DB round-trips regardless of org count.

### 4. Client-Side Memoization (T004) — Applied ✅

**Before**: In `ProjectGanttView.tsx`, each `ProjectGanttTaskRowMeta` and `ProjectGanttTaskRowTimeline` called `parseISO()` + `format()` on 7 date fields per task during every render. For 500 tasks, this created ~7,000 Date objects and ~3,500 formatted strings per render cycle.

**After**: Added `parsedDatesMap` useMemo in the parent component that pre-parses all dates once when the tasks array changes. Both row components accept pre-computed dates as props with fallback to inline parsing.

Similarly in `Tasks.tsx` GanttView — pre-parsed dates map eliminates redundant parsing in the Gantt task rows.

**Impact**: Date parsing reduced from O(N) per render to O(N) once per task list change.

---

## Remaining Optimization Opportunities

### Quick Wins (Low effort, high impact)

1. **Replace `workingDaysBetween` loop with arithmetic formula**
   - Files: `server/lib/workingDays.ts:23-37`, `client/src/lib/workingDays.ts:24-38`
   - Current: Iterates every calendar day with `addDays()` — O(D) where D = calendar days between dates
   - Fix: `fullWeeks * 5 + remainder weekdays` — O(1)
   - Benchmark shows **34× speedup** (222ms → 6.5ms for 10K tasks)

2. **Wire up client-side date filter UI to server-side endpoints**
   - The server-side filtering infrastructure is now in place (T002)
   - When the Tasks page filters by date or shows overdue tasks, pass those params to the API instead of filtering locally

### Deeper Improvements (Higher effort)

3. **Virtual scrolling for large Gantt charts**
   - Currently renders all task rows; with 1,000+ tasks, DOM node count becomes the bottleneck
   - The virtual scroll infrastructure exists in `ProjectGanttView.tsx` but is only active for some views

4. **Cursor-based pagination for multi-org**
   - Current OFFSET/LIMIT pagination degrades at high offsets (Postgres still scans skipped rows)
   - For datasets >50K tasks, switch to keyset/cursor pagination on `createdAt`

5. **Batch timesheet enrichment**
   - `enrichTasksWithTimesheetHours()` makes a single query per call which is good, but could be eliminated entirely by using a SQL JOIN at the storage layer

---

## Timezone & Correctness Findings

### UTC Handling
- All dates stored as `date` type in PostgreSQL (date-only, no timezone) — correct for schedule dates
- `parseISO()` on date-only strings creates dates in local timezone — consistent across client since all users see the same date strings
- Timestamps (`createdAt`, `deletedAt`) use `timestamp` type — stored as UTC, rendered via date-fns which respects locale

### Boundary Conditions
- **Null dates**: Working-day calculations correctly return `null` / skip when dates are missing
- **Same-day ranges**: `workingDaysBetween` returns 0 for same-day — this is correct for "days between" semantics
- **Weekend-only ranges**: Loop correctly counts 0 working days for Sat-Sun ranges
- **Cross-year boundaries**: No issues — `addDays()` handles year rollovers

### Potential Issues
- **Overdue filter**: New server-side filter compares `endDate < today` using SQL — this uses the database server's date, which may differ from client timezone by ±1 day at midnight boundaries
- **Duration calculation inconsistency**: Both `calculateDuration()` (working days to add) and `workingDaysBetween()` (working days between) exist — they count differently (inclusive vs exclusive of endpoints), which can cause off-by-one in edge cases

---

## Monitoring Recommendations

1. **Add server-side request timing**
   ```
   GET /api/tasks/all → log(duration, taskCount, filterParams)
   ```
   Flag requests >500ms for investigation.

2. **Track query execution plans** for the tasks table periodically — verify indexes are being used via `EXPLAIN ANALYZE`.

3. **Add client-side performance marks** in Gantt rendering:
   ```javascript
   performance.mark('gantt-render-start');
   // ... render
   performance.mark('gantt-render-end');
   performance.measure('gantt-render', 'gantt-render-start', 'gantt-render-end');
   ```

4. **Monitor payload sizes** — if `/api/tasks/all` responses exceed 1MB, consider implementing server-side field selection or compression.

---

## Risks & Validation Checklist

| Risk | Mitigation |
|---|---|
| New indexes increase write latency | 5 indexes is reasonable for a read-heavy table; monitor INSERT/UPDATE times |
| Server-side date filter returns different results than client-side | Compare results with and without params in staging; overdue filter timezone edge case |
| Multi-org batched query may hit Postgres parameter limits | `inArray()` with >10K IDs should be refactored to use temp tables or subqueries |
| Memoized date maps increase memory usage | Map is cleared on task list change; memory is bounded by task count × ~200 bytes |
| Composite index order matters | `(projectId, deletedAt, taskIndex)` matches the WHERE/ORDER BY clause order in `getTasks()` |

### Validation Steps
- [ ] Run `npm run db:push` to apply new indexes
- [ ] Verify existing task CRUD operations work unchanged
- [ ] Test Gantt view with 100+ tasks — confirm no visual regressions
- [ ] Test global Tasks page filtering and sorting
- [ ] Test multi-org user sees tasks from all orgs
- [ ] Run benchmark: `npx tsx scripts/benchmark-dates.ts`
