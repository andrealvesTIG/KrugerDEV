import {
  composeForRange,
  defaultLegacyResolvedCalendar,
  workingHoursBetween,
  type ResolvedCalendar,
  type ResourceAvailabilityWindowInput,
} from "./calendarEngine";

export interface PlannedHoursAssignment {
  resourceId: number;
  calendarId: number | null;
  allocationPercentage: number;
}

export interface PlannedHoursByDateInputs {
  projCal: ResolvedCalendar | null;
  assignments: PlannedHoursAssignment[];
  taskStart: Date;
  taskEnd: Date;
  rangeStart: Date;
  rangeEnd: Date;
  loadResourceCalendar: (calendarId: number) => Promise<ResolvedCalendar | null>;
  loadResourceAvailability: (resourceId: number) => Promise<ResourceAvailabilityWindowInput[]>;
}

/**
 * Calendar-aware per-day planned hours for a single task, summed across all
 * the task's resource assignments. For each day in [rangeStart, rangeEnd]
 * that also falls inside the task's [taskStart, taskEnd] window, we compute
 * `workingHoursBetween(composedResourceCalendar, startOfDay, endOfDay) × allocPct`
 * and add it to that date's bucket.
 *
 * Returns a `{ YYYY-MM-DD: number }` map, omitting days with zero hours so
 * callers can render "-" without iterating the full week. Hours are rounded
 * to 2 decimals to keep response payloads small.
 *
 * Pure / side-effect free — calendar + availability I/O is injected via
 * loader callbacks so this can be exercised directly from unit tests.
 */
export async function computePlannedHoursByDate(
  input: PlannedHoursByDateInputs,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (input.assignments.length === 0) return out;

  // Clamp the iteration window to the intersection of the task range and
  // the requested range so we never enumerate days outside either bound.
  const iterStart = input.taskStart > input.rangeStart ? input.taskStart : input.rangeStart;
  const iterEnd = input.taskEnd < input.rangeEnd ? input.taskEnd : input.rangeEnd;
  if (iterStart > iterEnd) return out;

  // Per-resource cache so we resolve each calendar and availability list
  // exactly once even when a resource is on multiple assignments.
  const resourceCalCache = new Map<number, ResolvedCalendar | null>();
  const availabilityCache = new Map<number, ResourceAvailabilityWindowInput[]>();

  // Build the list of (assignment, composed calendar) once over the task's
  // full range so PTO / partial-day windows that overlap the iteration
  // window are honoured at the engine level.
  const prepared: Array<{ allocPct: number; composed: ResolvedCalendar }> = [];
  for (const a of input.assignments) {
    const rawAlloc = Number(a.allocationPercentage);
    const allocPct = Math.max(0, Math.min(100, Number.isFinite(rawAlloc) ? rawAlloc : 0));
    if (allocPct === 0) continue;

    let resourceCal: ResolvedCalendar | null = null;
    if (a.calendarId != null) {
      if (resourceCalCache.has(a.calendarId)) {
        resourceCal = resourceCalCache.get(a.calendarId) ?? null;
      } else {
        resourceCal = await input.loadResourceCalendar(a.calendarId);
        resourceCalCache.set(a.calendarId, resourceCal);
      }
    }
    let availability: ResourceAvailabilityWindowInput[];
    if (availabilityCache.has(a.resourceId)) {
      availability = availabilityCache.get(a.resourceId)!;
    } else {
      availability = await input.loadResourceAvailability(a.resourceId);
      availabilityCache.set(a.resourceId, availability);
    }

    const composed = composeForRange(
      input.projCal, resourceCal, availability,
      input.taskStart, input.taskEnd,
    ) ?? defaultLegacyResolvedCalendar();
    prepared.push({ allocPct, composed });
  }

  if (prepared.length === 0) return out;

  // Walk day by day. `workingHoursBetween` takes the start-of-day → start
  // of next day so partial-day PTO windows are honoured at minute precision.
  const day = new Date(iterStart);
  day.setHours(0, 0, 0, 0);
  const lastDay = new Date(iterEnd);
  lastDay.setHours(0, 0, 0, 0);

  while (day <= lastDay) {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    let total = 0;
    for (const { allocPct, composed } of prepared) {
      const wh = workingHoursBetween(composed, day, next);
      total += (allocPct / 100) * wh;
    }
    if (total > 0) {
      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, "0");
      const dd = String(day.getDate()).padStart(2, "0");
      out[`${yyyy}-${mm}-${dd}`] = Math.round(total * 100) / 100;
    }
    day.setDate(day.getDate() + 1);
  }

  return out;
}

export interface EstimateAssignmentInputs {
  projCal: ResolvedCalendar | null;
  resources: Array<{
    id: number;
    calendarId: number | null;
    weeklyCapacity: number | null;
  }>;
  allocations: Array<{ resourceId: number; allocationPercentage: number }>;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  durationDays: number | null;
  loadResourceCalendar: (id: number) => Promise<ResolvedCalendar | null>;
  loadResourceAvailability: (id: number) => Promise<ResourceAvailabilityWindowInput[]>;
}

/**
 * Pure helper that computes the total estimatedHours for a task's resource
 * assignments. Calendar-aware when concrete dates are provided (composes
 * project + per-resource calendar + approved PTO via the engine and counts
 * `workingHoursBetween` × allocation%); falls back to legacy
 * `weeklyCapacity / 5 × durationDays` math when only durationDays is known.
 *
 * Side-effect free / no DB access — all I/O is injected via the loader
 * callbacks so this can be exercised directly from unit tests.
 */
export async function estimateTaskAssignmentHours(input: EstimateAssignmentInputs): Promise<number> {
  const haveDates = input.rangeStart != null && input.rangeEnd != null;
  // NaN guard: durationDays may arrive as a non-numeric string from imports
  // or stale rows. Treat anything non-finite or negative as 0 so we never
  // silently multiply NaN into estimatedHours.
  const durationRaw = input.durationDays;
  const durationDays =
    durationRaw != null && Number.isFinite(Number(durationRaw)) && Number(durationRaw) >= 0
      ? Number(durationRaw)
      : 0;
  let total = 0;
  for (const resource of input.resources) {
    const rawAlloc = input.allocations.find(a => a.resourceId === resource.id)?.allocationPercentage ?? 100;
    // Invariant: allocationPercentage is clamped at the Zod / storage layer,
    // but defensively clamp again here so this pure helper can't yield a
    // negative or >100% per-resource share even if a stale row sneaks in.
    const allocPct = Math.max(0, Math.min(100, Number(rawAlloc) || 0));
    let perResourceHours: number;
    if (haveDates) {
      const resourceCal = resource.calendarId
        ? await input.loadResourceCalendar(resource.calendarId)
        : null;
      const availabilityRows = await input.loadResourceAvailability(resource.id);
      const composed = composeForRange(
        input.projCal, resourceCal, availabilityRows,
        input.rangeStart!, input.rangeEnd!,
      ) ?? defaultLegacyResolvedCalendar();
      const wh = workingHoursBetween(composed, input.rangeStart!, input.rangeEnd!);
      perResourceHours = (allocPct / 100) * wh;
    } else {
      const weeklyCapacity = Number(resource.weeklyCapacity ?? 40);
      const dailyCapacity = weeklyCapacity / 5;
      perResourceHours = (allocPct / 100) * dailyCapacity * durationDays;
    }
    total += perResourceHours;
  }
  return Math.round(total * 100) / 100;
}
