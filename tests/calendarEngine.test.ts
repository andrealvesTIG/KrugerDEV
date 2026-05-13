import { describe, it, expect } from "vitest";
import {
  buildResolvedCalendar,
  defaultStandardWorkingWeek,
  isWorkingDay,
  isWorkingMoment,
  getWorkingIntervalsForDate,
  nextWorkingMoment,
  addWorkingHours,
  workingHoursBetween,
  subtractWorkingHours,
  withAdditionalNonWorkingWindows,
  type ResolvedCalendar,
} from "../shared/lib/calendarEngine";

function standardCalendar(over: Partial<ResolvedCalendar> = {}): ResolvedCalendar {
  return {
    id: 1, name: "Standard",
    weeklyShifts: defaultStandardWorkingWeek(),
    exceptions: [], recurring: [],
    ...over,
  };
}

describe("calendarEngine — weekly defaults", () => {
  const cal = standardCalendar();

  it("Mon–Fri are working days, Sat/Sun are not", () => {
    expect(isWorkingDay(cal, new Date(2026, 0, 5))).toBe(true);   // Mon
    expect(isWorkingDay(cal, new Date(2026, 0, 9))).toBe(true);   // Fri
    expect(isWorkingDay(cal, new Date(2026, 0, 10))).toBe(false); // Sat
    expect(isWorkingDay(cal, new Date(2026, 0, 11))).toBe(false); // Sun
  });

  it("returns split AM/PM intervals for weekdays", () => {
    const ints = getWorkingIntervalsForDate(cal, new Date(2026, 0, 5));
    expect(ints).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 780, endMinute: 1020 },
    ]);
  });

  it("isWorkingMoment respects the lunch gap", () => {
    expect(isWorkingMoment(cal, new Date(2026, 0, 5, 9, 0))).toBe(true);
    expect(isWorkingMoment(cal, new Date(2026, 0, 5, 12, 30))).toBe(false);
    expect(isWorkingMoment(cal, new Date(2026, 0, 5, 16, 59))).toBe(true);
    expect(isWorkingMoment(cal, new Date(2026, 0, 5, 17, 0))).toBe(false);
  });
});

describe("calendarEngine — nextWorkingMoment", () => {
  const cal = standardCalendar();

  it("returns input unchanged if already working", () => {
    const dt = new Date(2026, 0, 5, 9, 30);
    expect(nextWorkingMoment(cal, dt).getTime()).toBe(dt.getTime());
  });

  it("snaps forward to interval start when before working hours", () => {
    const dt = new Date(2026, 0, 5, 6, 0);
    const got = nextWorkingMoment(cal, dt);
    expect(got).toEqual(new Date(2026, 0, 5, 8, 0));
  });

  it("snaps across the lunch gap", () => {
    const got = nextWorkingMoment(cal, new Date(2026, 0, 5, 12, 30));
    expect(got).toEqual(new Date(2026, 0, 5, 13, 0));
  });

  it("skips weekends to Monday morning", () => {
    const got = nextWorkingMoment(cal, new Date(2026, 0, 10, 10, 0)); // Sat
    expect(got).toEqual(new Date(2026, 0, 12, 8, 0));                  // Mon
  });
});

describe("calendarEngine — addWorkingHours", () => {
  const cal = standardCalendar();

  it("adds hours within a single morning slot", () => {
    expect(addWorkingHours(cal, new Date(2026, 0, 5, 8, 0), 2)).toEqual(new Date(2026, 0, 5, 10, 0));
  });

  it("crosses the lunch break", () => {
    expect(addWorkingHours(cal, new Date(2026, 0, 5, 11, 0), 2)).toEqual(new Date(2026, 0, 5, 14, 0));
  });

  it("crosses to the next day end-of-day → next morning", () => {
    expect(addWorkingHours(cal, new Date(2026, 0, 5, 16, 0), 2)).toEqual(new Date(2026, 0, 6, 9, 0));
  });

  it("8h from Mon 8:00 finishes at Mon 17:00 (full working day)", () => {
    expect(addWorkingHours(cal, new Date(2026, 0, 5, 8, 0), 8)).toEqual(new Date(2026, 0, 5, 17, 0));
  });

  it("40h from Mon 8:00 finishes at end of Friday", () => {
    expect(addWorkingHours(cal, new Date(2026, 0, 5, 8, 0), 40)).toEqual(new Date(2026, 0, 9, 17, 0));
  });

  it("starting on a Saturday rolls to Monday before counting", () => {
    expect(addWorkingHours(cal, new Date(2026, 0, 10, 9, 0), 1)).toEqual(new Date(2026, 0, 12, 9, 0));
  });
});

describe("calendarEngine — workingHoursBetween + subtractWorkingHours", () => {
  const cal = standardCalendar();

  it("counts working hours across the lunch gap", () => {
    const h = workingHoursBetween(cal, new Date(2026, 0, 5, 11, 0), new Date(2026, 0, 5, 14, 0));
    expect(h).toBeCloseTo(2, 6);
  });

  it("ignores weekends in the span", () => {
    const h = workingHoursBetween(cal, new Date(2026, 0, 9, 17, 0), new Date(2026, 0, 12, 8, 0));
    expect(h).toBe(0);
  });

  it("subtractWorkingHours is the inverse of addWorkingHours", () => {
    const start = new Date(2026, 0, 5, 9, 0);
    const finish = addWorkingHours(cal, start, 18);
    expect(subtractWorkingHours(cal, finish, 18)).toEqual(start);
  });
});

describe("calendarEngine — exceptions and recurring rules", () => {
  it("one-time non-working exception removes a working day", () => {
    const cal = standardCalendar({
      exceptions: [{ startDate: "2026-01-05", endDate: "2026-01-05", isWorking: false }],
    });
    expect(isWorkingDay(cal, new Date(2026, 0, 5))).toBe(false);
    expect(addWorkingHours(cal, new Date(2026, 0, 5, 8, 0), 1)).toEqual(new Date(2026, 0, 6, 9, 0));
  });

  it("working exception with custom intervals overrides a Saturday", () => {
    const cal = standardCalendar({
      exceptions: [{
        startDate: "2026-01-10", endDate: "2026-01-10",
        isWorking: true,
        intervals: [{ startMinute: 9 * 60, endMinute: 13 * 60 }],
      }],
    });
    expect(isWorkingDay(cal, new Date(2026, 0, 10))).toBe(true);
    expect(addWorkingHours(cal, new Date(2026, 0, 10, 9, 0), 2)).toEqual(new Date(2026, 0, 10, 11, 0));
  });

  it("recurring annual_date matches Jan 1 every year", () => {
    const cal = standardCalendar({
      recurring: [{ recurrenceType: "annual_date", month: 1, dayOfMonth: 1, isWorking: false }],
    });
    expect(isWorkingDay(cal, new Date(2026, 0, 1))).toBe(false);
    expect(isWorkingDay(cal, new Date(2030, 0, 1))).toBe(false);
  });

  it("recurring nth_weekday_of_month matches first Monday of September", () => {
    const cal = standardCalendar({
      recurring: [{ recurrenceType: "nth_weekday_of_month", month: 9, weekOfMonth: 1, dayOfWeek: 1, isWorking: false }],
    });
    expect(isWorkingDay(cal, new Date(2026, 8, 7))).toBe(false); // Mon Sep 7, 2026
    expect(isWorkingDay(cal, new Date(2026, 8, 14))).toBe(true); // Mon Sep 14
  });

  it("recurring annual_range that wraps year boundary (Dec 24 → Jan 2)", () => {
    const cal = standardCalendar({
      recurring: [{
        recurrenceType: "annual_range",
        month: 12, dayOfMonth: 24, endMonth: 1, endDayOfMonth: 2, isWorking: false,
      }],
    });
    expect(isWorkingDay(cal, new Date(2026, 11, 25))).toBe(false);
    expect(isWorkingDay(cal, new Date(2027, 0, 1))).toBe(false);
    expect(isWorkingDay(cal, new Date(2027, 0, 5))).toBe(true);
  });

  it("one-time exception wins over recurring rule for that specific date", () => {
    const cal = standardCalendar({
      exceptions: [{ startDate: "2026-01-01", endDate: "2026-01-01", isWorking: true,
        intervals: [{ startMinute: 8 * 60, endMinute: 16 * 60 }] }],
      recurring: [{ recurrenceType: "annual_date", month: 1, dayOfMonth: 1, isWorking: false }],
    });
    expect(isWorkingDay(cal, new Date(2026, 0, 1))).toBe(true);
    expect(isWorkingDay(cal, new Date(2027, 0, 1))).toBe(false);
  });
});

describe("calendarEngine — base calendar inheritance", () => {
  it("child without shifts inherits weekly week from base", () => {
    const base = standardCalendar({ id: 100, name: "Base" });
    const child = buildResolvedCalendar({
      id: 200, name: "Child",
      shifts: [],            // empty → inherit
      exceptions: [],
      recurring: [],
      base,
    });
    expect(isWorkingDay(child, new Date(2026, 0, 5))).toBe(true);
    expect(addWorkingHours(child, new Date(2026, 0, 5, 8, 0), 8))
      .toEqual(new Date(2026, 0, 5, 17, 0));
  });

  it("child shifts override base for the days they cover", () => {
    const base = standardCalendar({ id: 100, name: "Base" });
    const child = buildResolvedCalendar({
      id: 200, name: "Night Shift",
      shifts: [{ dayOfWeek: 1, startMinute: 22 * 60, endMinute: 24 * 60 }], // Mon 22:00–24:00
      exceptions: [],
      recurring: [],
      base,
    });
    // Monday now has only the night shift, not the base's 8:00–17:00
    const monIntervals = getWorkingIntervalsForDate(child, new Date(2026, 0, 5));
    expect(monIntervals).toEqual([{ startMinute: 22 * 60, endMinute: 24 * 60 }]);
    // Tuesday inherits base
    const tueIntervals = getWorkingIntervalsForDate(child, new Date(2026, 0, 6));
    expect(tueIntervals.length).toBe(2);
  });
});

describe("calendarEngine — withAdditionalNonWorkingWindows (resource availability folding)", () => {
  it("layered windows remove working time without mutating source", () => {
    const project = standardCalendar();
    const resource = withAdditionalNonWorkingWindows(project, [
      { startDate: "2026-01-06", endDate: "2026-01-06" },
    ]);
    expect(isWorkingDay(project, new Date(2026, 0, 6))).toBe(true);  // unchanged
    expect(isWorkingDay(resource, new Date(2026, 0, 6))).toBe(false); // PTO
    // 8h started Mon morning runs into Wed because Tue is PTO
    expect(addWorkingHours(resource, new Date(2026, 0, 5, 16, 0), 2))
      .toEqual(new Date(2026, 0, 7, 9, 0));
  });
});
