import { describe, it, expect } from "vitest";
import {
  defaultLegacyResolvedCalendar,
  buildResolvedCalendar,
  withAdditionalNonWorkingWindows,
  enumerateNonWorkingDates,
  type ResolvedCalendar,
} from "../shared/lib/calendarEngine";
import {
  isWorkingDayCal,
  addWorkingDaysCal,
  workingDaysBetweenCal,
  calculateEndDateFromWorkingDaysCal,
  calculateDurationInWorkingDaysCal,
} from "../client/src/lib/workingDays";
import { calculateCPM, type CPMTask, type CPMDependency } from "../client/src/lib/cpm";

function d(s: string): Date {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
}

describe("calendar-aware workingDays (legacy fallback)", () => {
  it("matches legacy Mon–Fri behaviour when no calendar is supplied", () => {
    expect(isWorkingDayCal(null, d("2026-03-02"))).toBe(true);  // Mon
    expect(isWorkingDayCal(null, d("2026-03-07"))).toBe(false); // Sat
    expect(workingDaysBetweenCal(null, d("2026-03-02"), d("2026-03-06"))).toBe(5);
    expect(calculateEndDateFromWorkingDaysCal(null, "2026-03-02", 5)).toBe("2026-03-06");
  });

  it("matches legacy behaviour when defaultLegacyResolvedCalendar() is used", () => {
    const cal = defaultLegacyResolvedCalendar();
    expect(isWorkingDayCal(cal, d("2026-03-07"))).toBe(false);
    expect(workingDaysBetweenCal(cal, d("2026-03-02"), d("2026-03-06"))).toBe(5);
  });
});

describe("calendar-aware workingDays (with holiday)", () => {
  // Cal: Mon–Fri working, Wed 2026-03-04 marked as a non-working holiday.
  const holidayCal: ResolvedCalendar = withAdditionalNonWorkingWindows(
    defaultLegacyResolvedCalendar(),
    [{ startDate: "2026-03-04", endDate: "2026-03-04", isWorking: false, intervals: null }],
  );

  it("isWorkingDayCal returns false on the holiday", () => {
    expect(isWorkingDayCal(holidayCal, d("2026-03-04"))).toBe(false);
    expect(isWorkingDayCal(holidayCal, d("2026-03-03"))).toBe(true);
    expect(isWorkingDayCal(holidayCal, d("2026-03-05"))).toBe(true);
  });

  it("workingDaysBetweenCal skips the holiday", () => {
    // Mon..Fri normally = 5 days; with Wed holiday = 4
    expect(workingDaysBetweenCal(holidayCal, d("2026-03-02"), d("2026-03-06"))).toBe(4);
  });

  it("addWorkingDaysCal jumps over the holiday", () => {
    // From Mon 03-02, +2 working days = Tue 03-03 (1) → skip Wed holiday → Thu 03-05 (2).
    expect(
      addWorkingDaysCal(holidayCal, d("2026-03-02"), 2).toISOString().slice(0, 10),
    ).toBe("2026-03-05");
    // +3 working days lands on Fri 03-06 (Tue, Thu, Fri).
    expect(
      addWorkingDaysCal(holidayCal, d("2026-03-02"), 3).toISOString().slice(0, 10),
    ).toBe("2026-03-06");
  });

  it("calculateEndDateFromWorkingDaysCal extends past holiday", () => {
    // Start Mon 03-02, duration 5 working days → would be Fri 03-06 normally,
    // but with Wed holiday ends Mon 03-09.
    expect(calculateEndDateFromWorkingDaysCal(holidayCal, "2026-03-02", 5)).toBe("2026-03-09");
  });

  it("calculateDurationInWorkingDaysCal counts working days, not weekend/holiday", () => {
    expect(calculateDurationInWorkingDaysCal(holidayCal, "2026-03-02", "2026-03-06")).toBe(4);
  });
});

describe("CPM with project calendar", () => {
  const holidayCal: ResolvedCalendar = withAdditionalNonWorkingWindows(
    defaultLegacyResolvedCalendar(),
    [{ startDate: "2026-03-04", endDate: "2026-03-04", isWorking: false, intervals: null }],
  );

  const tasks: CPMTask[] = [
    { id: 1, name: "A", startDate: "2026-03-02", endDate: "2026-03-03", durationDays: 2 },
    { id: 2, name: "B", startDate: "2026-03-04", endDate: "2026-03-05", durationDays: 2 },
  ];
  const deps: CPMDependency[] = [
    { taskId: 2, dependsOnTaskId: 1, dependencyType: "finish-to-start", lagDays: 0 },
  ];

  it("forward pass without calendar finishes B on 2026-03-05 (Thu)", () => {
    const r = calculateCPM(tasks, deps);
    expect(r.results.get(2)?.efDate).toBe("2026-03-05");
  });

  it("forward pass with holiday calendar pushes B's EF past the holiday", () => {
    const r = calculateCPM(tasks, deps, holidayCal);
    // A finishes Tue 03-03, B starts Thu 03-05 (Wed is holiday), 2-day duration:
    // Thu 03-05 + Fri 03-06.
    expect(r.results.get(2)?.efDate).toBe("2026-03-06");
  });
});

describe("withAdditionalNonWorkingWindows resource overlay", () => {
  it("layers resource non-working windows on top of project calendar", () => {
    const proj = defaultLegacyResolvedCalendar();
    const overlaid = withAdditionalNonWorkingWindows(proj, [
      { startDate: "2026-03-03", endDate: "2026-03-03", isWorking: false, intervals: null }, // Tue PTO
    ]);
    expect(isWorkingDayCal(proj, d("2026-03-03"))).toBe(true);
    expect(isWorkingDayCal(overlaid, d("2026-03-03"))).toBe(false);
    // Sat still non-working in both.
    expect(isWorkingDayCal(overlaid, d("2026-03-07"))).toBe(false);
  });

  it("enumerateNonWorkingDates captures weekend days from a Mon–Fri calendar", () => {
    const cal = defaultLegacyResolvedCalendar();
    const windows = enumerateNonWorkingDates(cal, d("2026-03-02"), d("2026-03-15"));
    // Mon 03-02 .. Sun 03-15 → weekends = 03-07, 03-08, 03-14, 03-15 (4 days).
    expect(windows.map(w => w.startDate)).toEqual([
      "2026-03-07", "2026-03-08", "2026-03-14", "2026-03-15",
    ]);
    expect(windows.every(w => !w.isWorking)).toBe(true);
  });

  it("PTO/availability windows fold into a resource calendar as non-working dates", () => {
    // Mirrors what /api/resources/:id/resolved-calendar now does: maps each
    // approved resource_availability row { startDate, endDate } onto the
    // engine as an additional non-working window.
    const cal = defaultLegacyResolvedCalendar();
    const ptoRows = [
      { startDate: "2026-03-03", endDate: "2026-03-04" }, // 2-day Tue–Wed PTO
      { startDate: "2026-03-09", endDate: "2026-03-09" }, // 1-day Mon PTO
    ];
    const ptoWindows = ptoRows.map(r => ({
      startDate: r.startDate, endDate: r.endDate, isWorking: false, intervals: null,
    }));
    const withPto = withAdditionalNonWorkingWindows(cal, ptoWindows);
    expect(isWorkingDayCal(withPto, d("2026-03-02"))).toBe(true);  // Mon — fine
    expect(isWorkingDayCal(withPto, d("2026-03-03"))).toBe(false); // PTO start
    expect(isWorkingDayCal(withPto, d("2026-03-04"))).toBe(false); // PTO end
    expect(isWorkingDayCal(withPto, d("2026-03-05"))).toBe(true);  // Thu — back
    expect(isWorkingDayCal(withPto, d("2026-03-09"))).toBe(false); // single PTO day
    // PTO eats into addWorkingDays math: from Mon 03-02, +2 working days now
    // skips Tue/Wed PTO and lands on Fri 03-06 (Thu is +1, Fri is +2).
    expect(addWorkingDaysCal(withPto, d("2026-03-02"), 2).toISOString().slice(0, 10)).toBe("2026-03-06");
  });

  it("overlaying enumerated resource non-working dates restricts the project calendar", () => {
    // Resource that ALSO doesn't work Fridays (in addition to weekends).
    const noFridays: ResolvedCalendar = {
      ...defaultLegacyResolvedCalendar(),
      weeklyShifts: defaultLegacyResolvedCalendar().weeklyShifts.map((s, i) => i === 5 ? [] : s),
    };
    const proj = defaultLegacyResolvedCalendar();
    const horizonWindows = enumerateNonWorkingDates(noFridays, d("2026-03-01"), d("2026-03-31"));
    const overlay = withAdditionalNonWorkingWindows(proj, horizonWindows);
    expect(isWorkingDayCal(proj, d("2026-03-06"))).toBe(true);   // Fri — project says yes
    expect(isWorkingDayCal(overlay, d("2026-03-06"))).toBe(false); // overlay says no
    expect(isWorkingDayCal(overlay, d("2026-03-05"))).toBe(true);  // Thu still OK
  });
});
