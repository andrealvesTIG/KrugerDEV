import {
  composeForRange,
  defaultLegacyResolvedCalendar,
  workingHoursBetween,
  type ResolvedCalendar,
  type ResourceAvailabilityWindowInput,
} from "./calendarEngine";

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
