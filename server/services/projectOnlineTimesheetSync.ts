/**
 * Pure, side-effect-free logic for the Project Online → timesheets sync.
 *
 * The fetch/auth/DB-write parts live in `projectOnline.ts` and
 * `timesheetStorage.ts`. Everything here is deterministic so it can be unit
 * tested without a live Project Online instance.
 *
 * Data source: the Project Online OData reporting feed
 *   `${siteUrl}/_api/ProjectData/AssignmentTimephasedDataSet`
 * which exposes per-assignment, per-day actuals with the project / task /
 * resource names attached in a single query (no joins needed). Work values in
 * the reporting feed are decimal hours (e.g. `8` = 8h), so no unit conversion
 * is applied. `normalizeActualRows` is written defensively so it also accepts
 * timesheet-line-shaped rows (ActualWorkBillable / ActualWorkNonBillable).
 */

export const PROJECT_ONLINE_TIMESHEET_SOURCE = "project_online";

/** A raw row as returned by the OData reporting feed (verbose JSON). */
export interface RawActualRow {
  ProjectUID?: string;
  ProjectId?: string;
  ProjectName?: string;
  TaskUID?: string;
  TaskId?: string;
  TaskName?: string;
  ResourceUID?: string;
  ResourceId?: string;
  ResourceName?: string;
  ResourceEmailAddress?: string;
  TimeByDay?: string;
  AssignmentActualWork?: number;
  // Timesheet-line fallbacks
  ActualWorkBillable?: number;
  ActualWorkNonBillable?: number;
  [key: string]: unknown;
}

export interface NormalizedActual {
  externalProjectId: string | null;
  projectName: string | null;
  externalTaskId: string | null;
  taskName: string | null;
  externalResourceId: string | null;
  resourceName: string | null;
  resourceEmail: string | null;
  date: string; // yyyy-mm-dd
  hours: number;
}

function toDateKey(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  // OData dates look like "2026-05-12T00:00:00" or full ISO strings.
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    // Fall back to a leading yyyy-mm-dd if Date couldn't parse it.
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  return d.toISOString().split("T")[0];
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}

/**
 * Convert raw reporting rows into normalized actuals, dropping rows with no
 * usable date or no positive hours.
 */
export function normalizeActualRows(rows: RawActualRow[]): NormalizedActual[] {
  const out: NormalizedActual[] = [];
  for (const r of rows || []) {
    const date = toDateKey(r.TimeByDay);
    if (!date) continue;

    let hours = num(r.AssignmentActualWork);
    if (hours === 0) {
      hours = num(r.ActualWorkBillable) + num(r.ActualWorkNonBillable);
    }
    // Round to 2 decimals to avoid floating-point noise (e.g. 7.999999).
    hours = Math.round(hours * 100) / 100;
    if (hours <= 0) continue;

    out.push({
      externalProjectId: str(r.ProjectUID) ?? str(r.ProjectId),
      projectName: str(r.ProjectName),
      externalTaskId: str(r.TaskUID) ?? str(r.TaskId),
      taskName: str(r.TaskName),
      externalResourceId: str(r.ResourceUID) ?? str(r.ResourceId),
      resourceName: str(r.ResourceName),
      resourceEmail: str(r.ResourceEmailAddress),
      date,
      hours,
    });
  }
  return out;
}

export interface MatchResource {
  id: number;
  name: string;
  email?: string | null;
  userId?: string | null;
}

export interface MatchProject {
  id: number;
  name: string;
  externalSource?: string | null;
  externalId?: string | null;
}

export interface MatchTask {
  id: number;
  name: string;
  projectId: number;
  externalId?: string | null;
}

export interface MatchContext {
  resources: MatchResource[];
  projects: MatchProject[];
  tasks: MatchTask[];
}

export interface MatchedEntry {
  resourceId: number;
  userId: string;
  projectId: number;
  taskId: number;
  entryDate: string;
  hours: number;
  externalId: string;
}

export interface UnmatchedItem {
  name: string;
  reason: string;
  hours: number;
}

export interface MatchResult {
  matched: MatchedEntry[];
  unmatched: UnmatchedItem[];
  totalRows: number;
  matchedRows: number;
  totalHours: number;
  matchedHours: number;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Match normalized actuals to existing app resources / projects / tasks and
 * aggregate hours per (resource, task, date). Nothing is auto-created — rows
 * that can't be matched are reported so an admin can see what was skipped.
 *
 * Matching precedence:
 *   - project: externalId (project_online) → case-insensitive name
 *   - resource: email → case-insensitive name (must have a linked user)
 *   - task: externalId within the project → case-insensitive name within it
 */
export function matchActuals(rows: NormalizedActual[], ctx: MatchContext): MatchResult {
  const projectsByExtId = new Map<string, MatchProject>();
  const projectsByName = new Map<string, MatchProject>();
  for (const p of ctx.projects) {
    if (p.externalSource === PROJECT_ONLINE_TIMESHEET_SOURCE && p.externalId) {
      projectsByExtId.set(p.externalId, p);
    }
    const key = norm(p.name);
    if (key && !projectsByName.has(key)) projectsByName.set(key, p);
  }

  const resourcesByEmail = new Map<string, MatchResource>();
  const resourcesByName = new Map<string, MatchResource>();
  for (const r of ctx.resources) {
    const email = norm(r.email);
    if (email && !resourcesByEmail.has(email)) resourcesByEmail.set(email, r);
    const name = norm(r.name);
    if (name && !resourcesByName.has(name)) resourcesByName.set(name, r);
  }

  const tasksByProjectExtId = new Map<number, Map<string, MatchTask>>();
  const tasksByProjectName = new Map<number, Map<string, MatchTask>>();
  for (const t of ctx.tasks) {
    if (t.externalId) {
      if (!tasksByProjectExtId.has(t.projectId)) tasksByProjectExtId.set(t.projectId, new Map());
      tasksByProjectExtId.get(t.projectId)!.set(t.externalId, t);
    }
    const name = norm(t.name);
    if (name) {
      if (!tasksByProjectName.has(t.projectId)) tasksByProjectName.set(t.projectId, new Map());
      const m = tasksByProjectName.get(t.projectId)!;
      if (!m.has(name)) m.set(name, t);
    }
  }

  const aggregated = new Map<string, MatchedEntry>();
  const unmatched: UnmatchedItem[] = [];
  let totalHours = 0;
  let matchedRows = 0;
  let matchedHours = 0;

  for (const row of rows) {
    totalHours += row.hours;

    const project =
      (row.externalProjectId && projectsByExtId.get(row.externalProjectId)) ||
      (row.projectName && projectsByName.get(norm(row.projectName))) ||
      null;
    if (!project) {
      unmatched.push({
        name: row.projectName || row.externalProjectId || "(unknown project)",
        reason: "Project not found in this workspace",
        hours: row.hours,
      });
      continue;
    }

    const resource =
      (row.resourceEmail && resourcesByEmail.get(norm(row.resourceEmail))) ||
      (row.resourceName && resourcesByName.get(norm(row.resourceName))) ||
      null;
    if (!resource) {
      unmatched.push({
        name: row.resourceName || row.resourceEmail || "(unknown resource)",
        reason: "Resource not found in this workspace",
        hours: row.hours,
      });
      continue;
    }
    if (!resource.userId) {
      unmatched.push({
        name: resource.name,
        reason: "Resource has no linked user account",
        hours: row.hours,
      });
      continue;
    }

    let task: MatchTask | null = null;
    if (row.externalTaskId) {
      task = tasksByProjectExtId.get(project.id)?.get(row.externalTaskId) ?? null;
    }
    if (!task && row.taskName) {
      task = tasksByProjectName.get(project.id)?.get(norm(row.taskName)) ?? null;
    }
    if (!task) {
      unmatched.push({
        name: `${row.taskName || "(unknown task)"} — ${project.name}`,
        reason: "Task not found in the matched project",
        hours: row.hours,
      });
      continue;
    }

    matchedRows += 1;
    matchedHours += row.hours;

    const aggKey = `${resource.id}|${task.id}|${row.date}`;
    const existing = aggregated.get(aggKey);
    if (existing) {
      existing.hours = Math.round((existing.hours + row.hours) * 100) / 100;
    } else {
      aggregated.set(aggKey, {
        resourceId: resource.id,
        userId: resource.userId,
        projectId: project.id,
        taskId: task.id,
        entryDate: row.date,
        hours: row.hours,
        externalId: `${row.externalProjectId ?? project.id}:${row.externalTaskId ?? task.id}:${row.externalResourceId ?? resource.id}:${row.date}`,
      });
    }
  }

  return {
    matched: Array.from(aggregated.values()),
    unmatched,
    totalRows: rows.length,
    matchedRows,
    totalHours: Math.round(totalHours * 100) / 100,
    matchedHours: Math.round(matchedHours * 100) / 100,
  };
}

/**
 * Build the OData reporting URL for actuals in a date range. `$filter` uses
 * `TimeByDay` so we only pull the requested window. Ordered for stable paging.
 */
export function buildActualsODataUrl(siteUrl: string, startDate: string, endDate: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const select = [
    "ProjectUID",
    "ProjectName",
    "TaskUID",
    "TaskName",
    "ResourceUID",
    "ResourceName",
    "TimeByDay",
    "AssignmentActualWork",
  ].join(",");
  const filter = `TimeByDay ge datetime'${startDate}T00:00:00' and TimeByDay le datetime'${endDate}T23:59:59' and AssignmentActualWork gt 0`;
  const params = new URLSearchParams({
    $select: select,
    $filter: filter,
    $orderby: "TimeByDay",
  });
  return `${base}/_api/ProjectData/AssignmentTimephasedDataSet?${params.toString()}`;
}

/**
 * Build the OData URL for the Resources entity. The actuals feed
 * (`AssignmentTimephasedDataSet`) carries `ResourceUID` but not the resource's
 * email, so we pull the resource directory separately to enable email-first
 * matching (display names are not unique).
 */
export function buildResourcesODataUrl(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    $select: "ResourceUID,ResourceName,ResourceEmailAddress",
  });
  return `${base}/_api/ProjectData/Resources?${params.toString()}`;
}

/** A raw Resources-entity row. */
export interface RawResourceRow {
  ResourceUID?: string;
  ResourceName?: string;
  ResourceEmailAddress?: string;
  [key: string]: unknown;
}

/** Build a `ResourceUID → email` lookup from the Resources feed. */
export function buildResourceEmailMap(rows: RawResourceRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows || []) {
    const uid = str(r.ResourceUID);
    const email = str(r.ResourceEmailAddress);
    if (uid && email) map[uid] = email;
  }
  return map;
}

/**
 * Fill in `resourceEmail` on normalized rows that lack it, using the
 * `ResourceUID → email` map from the Resources feed. Rows that already have an
 * email (or have no UID / no mapping) are returned unchanged.
 */
export function applyResourceEmails(
  rows: NormalizedActual[],
  uidToEmail: Record<string, string>,
): NormalizedActual[] {
  return rows.map((r) => {
    if (!r.resourceEmail && r.externalResourceId && uidToEmail[r.externalResourceId]) {
      return { ...r, resourceEmail: uidToEmail[r.externalResourceId] };
    }
    return r;
  });
}
