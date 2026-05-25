import { describe, it, expect } from "vitest";
import {
  computePlannedHoursByDate,
} from "../shared/lib/assignmentEstimation";
import {
  defaultLegacyResolvedCalendar,
  type ResolvedCalendar,
  type ResourceAvailabilityWindowInput,
} from "../shared/lib/calendarEngine";

function d(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}
function dEnd(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day, 23, 59, 59, 999);
}

const noResourceCal = async (_id: number): Promise<ResolvedCalendar | null> => null;
const noAvailability = async (_id: number): Promise<ResourceAvailabilityWindowInput[]> => [];

describe("computePlannedHoursByDate", () => {
  it("distributes a 100% assignment as 8h per Mon-Fri working day, skipping weekends", async () => {
    // Week of 2026-06-01 (Mon) through 2026-06-07 (Sun).
    const planned = await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [{ resourceId: 1, calendarId: null, allocationPercentage: 100 }],
      taskStart: d("2026-06-01"),
      taskEnd: dEnd("2026-06-30"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-07"),
      loadResourceCalendar: noResourceCal,
      loadResourceAvailability: noAvailability,
    });
    expect(planned["2026-06-01"]).toBe(8); // Mon
    expect(planned["2026-06-02"]).toBe(8); // Tue
    expect(planned["2026-06-03"]).toBe(8); // Wed
    expect(planned["2026-06-04"]).toBe(8); // Thu
    expect(planned["2026-06-05"]).toBe(8); // Fri
    // Weekends are omitted (legacy Mon-Fri calendar = 0 working hours).
    expect(planned["2026-06-06"]).toBeUndefined();
    expect(planned["2026-06-07"]).toBeUndefined();
  });

  it("scales by allocation percentage and sums across assignments", async () => {
    const planned = await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [
        { resourceId: 1, calendarId: null, allocationPercentage: 50 },
        { resourceId: 2, calendarId: null, allocationPercentage: 25 },
      ],
      taskStart: d("2026-06-01"),
      taskEnd: dEnd("2026-06-30"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-01"),
      loadResourceCalendar: noResourceCal,
      loadResourceAvailability: noAvailability,
    });
    // 0.5*8 + 0.25*8 = 6
    expect(planned["2026-06-01"]).toBe(6);
  });

  it("clamps to the intersection of task range and requested range", async () => {
    // Task only runs Wed-Fri, but we request the full week. Mon/Tue must
    // be absent because they're before the task start.
    const planned = await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [{ resourceId: 1, calendarId: null, allocationPercentage: 100 }],
      taskStart: d("2026-06-03"),
      taskEnd: dEnd("2026-06-05"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-07"),
      loadResourceCalendar: noResourceCal,
      loadResourceAvailability: noAvailability,
    });
    expect(planned["2026-06-01"]).toBeUndefined();
    expect(planned["2026-06-02"]).toBeUndefined();
    expect(planned["2026-06-03"]).toBe(8);
    expect(planned["2026-06-04"]).toBe(8);
    expect(planned["2026-06-05"]).toBe(8);
  });

  it("returns empty object when the task range does not intersect the requested range", async () => {
    const planned = await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [{ resourceId: 1, calendarId: null, allocationPercentage: 100 }],
      taskStart: d("2026-07-01"),
      taskEnd: dEnd("2026-07-31"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-07"),
      loadResourceCalendar: noResourceCal,
      loadResourceAvailability: noAvailability,
    });
    expect(planned).toEqual({});
  });

  it("returns empty object when there are no assignments", async () => {
    const planned = await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [],
      taskStart: d("2026-06-01"),
      taskEnd: dEnd("2026-06-30"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-07"),
      loadResourceCalendar: noResourceCal,
      loadResourceAvailability: noAvailability,
    });
    expect(planned).toEqual({});
  });

  it("skips zero-allocation assignments without touching calendar loaders", async () => {
    let resourceCalLoaderCalls = 0;
    let availabilityLoaderCalls = 0;
    const planned = await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [{ resourceId: 1, calendarId: 99, allocationPercentage: 0 }],
      taskStart: d("2026-06-01"),
      taskEnd: dEnd("2026-06-30"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-07"),
      loadResourceCalendar: async () => { resourceCalLoaderCalls++; return null; },
      loadResourceAvailability: async () => { availabilityLoaderCalls++; return []; },
    });
    expect(planned).toEqual({});
    expect(resourceCalLoaderCalls).toBe(0);
    expect(availabilityLoaderCalls).toBe(0);
  });

  it("clamps allocation to [0,100] and drops days where PTO covers the whole day", async () => {
    // Approved full-day PTO on Wed 2026-06-03. Other Mon-Fri days remain 8h.
    const pto: ResourceAvailabilityWindowInput[] = [
      { startDate: "2026-06-03", endDate: "2026-06-03", status: "approved", hoursPerDay: null } as any,
    ];
    const planned = await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [{ resourceId: 1, calendarId: null, allocationPercentage: 250 }],
      taskStart: d("2026-06-01"),
      taskEnd: dEnd("2026-06-30"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-05"),
      loadResourceCalendar: noResourceCal,
      loadResourceAvailability: async (_id) => pto,
    });
    // Allocation clamps to 100% → 8h on working days.
    expect(planned["2026-06-01"]).toBe(8);
    expect(planned["2026-06-02"]).toBe(8);
    // Full-day PTO removes Wed.
    expect(planned["2026-06-03"]).toBeUndefined();
    expect(planned["2026-06-04"]).toBe(8);
    expect(planned["2026-06-05"]).toBe(8);
  });

  it("caches resource calendar + availability lookups across assignments", async () => {
    let calLoaderCalls = 0;
    let availLoaderCalls = 0;
    await computePlannedHoursByDate({
      projCal: defaultLegacyResolvedCalendar(),
      assignments: [
        { resourceId: 1, calendarId: 7, allocationPercentage: 50 },
        { resourceId: 1, calendarId: 7, allocationPercentage: 25 },
        { resourceId: 2, calendarId: 7, allocationPercentage: 25 },
      ],
      taskStart: d("2026-06-01"),
      taskEnd: dEnd("2026-06-30"),
      rangeStart: d("2026-06-01"),
      rangeEnd: dEnd("2026-06-02"),
      loadResourceCalendar: async () => { calLoaderCalls++; return null; },
      loadResourceAvailability: async () => { availLoaderCalls++; return []; },
    });
    // Calendar 7 resolved once. Resources 1+2 → 2 availability loads.
    expect(calLoaderCalls).toBe(1);
    expect(availLoaderCalls).toBe(2);
  });
});
