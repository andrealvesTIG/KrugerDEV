import {
  composeForRange,
  defaultLegacyResolvedCalendar,
  workingHoursBetween,
  type ResolvedCalendar,
  type ResourceAvailabilityWindowInput,
} from "./calendarEngine";

export interface ComputeEffectiveCapacityInput {
  /** Org default calendar (acts as projCal so org holidays count). May be null. */
  orgCal: ResolvedCalendar | null;
  /** Resource's own calendar (restricts only). May be null. */
  resourceCal: ResolvedCalendar | null;
  /** Approved-only filtering happens inside the engine. */
  availabilityRows: ResourceAvailabilityWindowInput[];
  rangeStart: Date;
  rangeEnd: Date;
  /**
   * Resource-level availability % (e.g. a 50% FTE stays half-time). Multiplied
   * onto the calendar-derived hours so per-resource part-time settings still
   * apply on top of the calendar. Defaults to 100.
   */
  availabilityPct?: number;
}

export interface ComputeEffectiveCapacityResult {
  /** Calendar-aware working hours over the full [rangeStart, rangeEnd] window. */
  effectiveHoursInRange: number;
  /** effectiveHoursInRange normalized to a 7-day week (so the existing
   *  per-week chart copy keeps working). */
  effectiveWeeklyHours: number;
  /** Length of the window in weeks (range days / 7). Useful for UI copy. */
  weeksInRange: number;
}

/**
 * Pure, calendar-aware effective-capacity helper. Composes the org default
 * calendar (as project calendar) with the resource calendar + approved PTO
 * via `composeResourceEffectiveCalendar` and asks the engine for the actual
 * working hours in the window. Falls back to legacy Mon–Fri 8h when nothing
 * is configured. Multiplies the result by the resource-level availability%
 * so a 50% FTE on a holiday-free week still reads ~20h, not 40h.
 *
 * Side-effect free → unit-testable without a DB stack.
 */
export function computeEffectiveCapacity(input: ComputeEffectiveCapacityInput): ComputeEffectiveCapacityResult {
  const composed = composeForRange(
    input.orgCal, input.resourceCal, input.availabilityRows,
    input.rangeStart, input.rangeEnd,
  ) ?? defaultLegacyResolvedCalendar();

  const rawHours = workingHoursBetween(composed, input.rangeStart, input.rangeEnd);
  const availabilityPct = input.availabilityPct != null ? input.availabilityPct : 100;
  const effectiveHoursInRange = (availabilityPct / 100) * rawHours;

  const ms = input.rangeEnd.getTime() - input.rangeStart.getTime();
  const days = Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
  const weeksInRange = days / 7;
  const effectiveWeeklyHours = weeksInRange > 0 ? effectiveHoursInRange / weeksInRange : effectiveHoursInRange;

  return {
    effectiveHoursInRange: Math.round(effectiveHoursInRange * 100) / 100,
    effectiveWeeklyHours: Math.round(effectiveWeeklyHours * 100) / 100,
    weeksInRange: Math.round(weeksInRange * 100) / 100,
  };
}
