import {
  composeResourceEffectiveCalendar,
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
  let total = 0;
  for (const resource of input.resources) {
    const allocPct = input.allocations.find(a => a.resourceId === resource.id)?.allocationPercentage ?? 100;
    let perResourceHours: number;
    if (haveDates) {
      const resourceCal = resource.calendarId
        ? await input.loadResourceCalendar(resource.calendarId)
        : null;
      const availabilityRows = await input.loadResourceAvailability(resource.id);
      const composed = composeResourceEffectiveCalendar(
        input.projCal, resourceCal, availabilityRows,
        { start: input.rangeStart!, end: input.rangeEnd! },
      ) ?? defaultLegacyResolvedCalendar();
      const wh = workingHoursBetween(composed, input.rangeStart!, input.rangeEnd!);
      perResourceHours = (allocPct / 100) * wh;
    } else {
      const weeklyCapacity = Number(resource.weeklyCapacity ?? 40);
      const dailyCapacity = weeklyCapacity / 5;
      perResourceHours = (allocPct / 100) * dailyCapacity * (input.durationDays ?? 0);
    }
    total += perResourceHours;
  }
  return Math.round(total * 100) / 100;
}
