/**
 * Enterprise Calendar engine — pure, dependency-free working-time math.
 *
 * Phase 1: NOT yet wired into CPM/Gantt. Used by the calendar admin UI's
 * simulator and the /api/calendars/:id/simulate endpoint. The CPM rewire is
 * Phase 2.
 *
 * Behaviour intentionally mirrors Microsoft Project Online enterprise calendars:
 *   - default working week (per dayOfWeek list of [start,end] minute intervals)
 *   - one-time exceptions override the working week for the days they cover
 *     (isWorking=false  → non-working override; isWorking=true → working override)
 *   - recurring exceptions match the same way (annual_date / nth_weekday_of_month
 *     / annual_range) and are evaluated AFTER one-time exceptions so admins can
 *     locally override a recurring rule for a specific year.
 *   - one-level base calendar inheritance: shifts from the base calendar are
 *     used when the child has no shifts for a given day; exceptions are merged.
 *   - resource calendars (folded resourceAvailability rows) are layered on top
 *     of the project calendar as additional non-working windows when a resource
 *     is in scope; the project calendar otherwise drives all date math.
 *
 * All timestamps are treated in the calendar's local time. Timezone-aware
 * conversion is the caller's responsibility (Phase 2).
 */

export type CalendarInterval = { startMinute: number; endMinute: number };

export type ResolvedException = {
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  isWorking: boolean;
  intervals?: CalendarInterval[] | null;
};

export type RecurrenceType = "annual_date" | "nth_weekday_of_month" | "annual_range";
export type ResolvedRecurring = {
  recurrenceType: RecurrenceType;
  month?: number | null;
  dayOfMonth?: number | null;
  weekOfMonth?: number | null;
  dayOfWeek?: number | null;
  endMonth?: number | null;
  endDayOfMonth?: number | null;
  isWorking: boolean;
  intervals?: CalendarInterval[] | null;
};

/** Engine-ready calendar shape (pure data, no DB rows). */
export type ResolvedCalendar = {
  id: number;
  name: string;
  /** weeklyShifts[dayOfWeek 0..6] → sorted, non-overlapping intervals */
  weeklyShifts: CalendarInterval[][];
  exceptions: ResolvedException[];
  recurring: ResolvedRecurring[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfDay(d: Date): Date {
  const o = new Date(d);
  o.setHours(0, 0, 0, 0);
  return o;
}
function addDays(d: Date, days: number): Date {
  const o = new Date(d);
  o.setDate(o.getDate() + days);
  return o;
}
function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}
function dateAtMinute(day: Date, minute: number): Date {
  const o = startOfDay(day);
  const whole = Math.floor(minute);
  const frac = minute - whole;
  o.setMinutes(whole);
  if (frac) o.setSeconds(Math.round(frac * 60));
  return o;
}
function mergeIntervals(intervals: CalendarInterval[]): CalendarInterval[] {
  if (intervals.length <= 1) return [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  const out: CalendarInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, cur.endMinute);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Standard MS-Project-style 8h × 5d working week (Mon–Fri 08:00–12:00, 13:00–17:00). */
export function defaultStandardWorkingWeek(): CalendarInterval[][] {
  const week: CalendarInterval[][] = [[], [], [], [], [], [], []];
  for (let dow = 1; dow <= 5; dow++) {
    week[dow] = [
      { startMinute: 8 * 60, endMinute: 12 * 60 },
      { startMinute: 13 * 60, endMinute: 17 * 60 },
    ];
  }
  return week;
}

// ---------------------------------------------------------------------------
// Recurrence matching
// ---------------------------------------------------------------------------

/** Returns the in-month date number (1..31) of the Nth weekday of a month. */
function nthWeekdayOfMonth(year: number, month1: number, weekOfMonth: number, dayOfWeek: number): number | null {
  // First find the first matching weekday
  const first = new Date(year, month1 - 1, 1);
  const offset = (dayOfWeek - first.getDay() + 7) % 7;
  const firstMatch = 1 + offset;
  if (weekOfMonth > 0) {
    const day = firstMatch + (weekOfMonth - 1) * 7;
    const lastDayOfMonth = new Date(year, month1, 0).getDate();
    return day > lastDayOfMonth ? null : day;
  }
  // -1 = last weekday of month
  if (weekOfMonth === -1) {
    const lastDayOfMonth = new Date(year, month1, 0).getDate();
    let day = firstMatch;
    while (day + 7 <= lastDayOfMonth) day += 7;
    return day;
  }
  return null;
}

function recurringMatches(date: Date, r: ResolvedRecurring): boolean {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const dom = date.getDate();
  const dow = date.getDay();

  switch (r.recurrenceType) {
    case "annual_date":
      return r.month === m && r.dayOfMonth === dom;

    case "nth_weekday_of_month": {
      if (r.month !== m) return false;
      if (r.dayOfWeek == null || r.weekOfMonth == null) return false;
      if (dow !== r.dayOfWeek) return false;
      const target = nthWeekdayOfMonth(y, m, r.weekOfMonth, r.dayOfWeek);
      return target === dom;
    }

    case "annual_range": {
      if (r.month == null || r.dayOfMonth == null || r.endMonth == null || r.endDayOfMonth == null) return false;
      const start = r.month * 100 + r.dayOfMonth;
      const end = r.endMonth * 100 + r.endDayOfMonth;
      const cur = m * 100 + dom;
      if (start <= end) return cur >= start && cur <= end;
      // Wraps year boundary (e.g. Dec 24 → Jan 2)
      return cur >= start || cur <= end;
    }
  }
}

function exceptionMatches(date: Date, ex: ResolvedException): boolean {
  const day = ymd(date);
  return day >= ex.startDate && day <= ex.endDate;
}

// ---------------------------------------------------------------------------
// Per-day intervals (the heart of the engine)
// ---------------------------------------------------------------------------

/**
 * Returns the working intervals for a specific date on this calendar.
 * Resolution order (highest precedence wins):
 *   1. one-time exceptions covering this date
 *   2. recurring exceptions matching this date
 *   3. weekly default for the dayOfWeek
 */
export function getWorkingIntervalsForDate(cal: ResolvedCalendar, date: Date): CalendarInterval[] {
  // 1. One-time exceptions first (later-created admin entries are most specific)
  for (const ex of cal.exceptions) {
    if (!exceptionMatches(date, ex)) continue;
    if (!ex.isWorking) return [];
    const ints = ex.intervals && ex.intervals.length ? ex.intervals : cal.weeklyShifts[date.getDay()] || [];
    return mergeIntervals(ints);
  }
  // 2. Recurring rules
  for (const r of cal.recurring) {
    if (!recurringMatches(date, r)) continue;
    if (!r.isWorking) return [];
    const ints = r.intervals && r.intervals.length ? r.intervals : cal.weeklyShifts[date.getDay()] || [];
    return mergeIntervals(ints);
  }
  // 3. Weekly default
  return mergeIntervals(cal.weeklyShifts[date.getDay()] || []);
}

/** True iff the calendar has any working time on the given local date. */
export function isWorkingDay(cal: ResolvedCalendar, date: Date): boolean {
  return getWorkingIntervalsForDate(cal, date).length > 0;
}

/** True iff the precise instant (date+time) falls inside a working interval. */
export function isWorkingMoment(cal: ResolvedCalendar, dt: Date): boolean {
  const intervals = getWorkingIntervalsForDate(cal, dt);
  const m = minutesIntoDay(dt);
  return intervals.some(i => m >= i.startMinute && m < i.endMinute);
}

/** Snap forward to the next working moment (returns dt itself if already working). */
export function nextWorkingMoment(cal: ResolvedCalendar, dt: Date, maxLookaheadDays = 366 * 4): Date {
  let cursor = new Date(dt);
  for (let i = 0; i <= maxLookaheadDays; i++) {
    const intervals = getWorkingIntervalsForDate(cal, cursor);
    if (intervals.length === 0) {
      cursor = startOfDay(addDays(cursor, 1));
      continue;
    }
    const m = minutesIntoDay(cursor);
    for (const iv of intervals) {
      if (m < iv.startMinute) return dateAtMinute(cursor, iv.startMinute);
      if (m < iv.endMinute) return cursor;
    }
    // Past the last interval today → start of next day
    cursor = startOfDay(addDays(cursor, 1));
  }
  throw new Error(`nextWorkingMoment: no working time within ${maxLookaheadDays} days`);
}

/**
 * Add `hours` of working time to `start`, returning the finish moment. The
 * cursor snaps forward past non-working time. `hours` may be fractional.
 */
export function addWorkingHours(cal: ResolvedCalendar, start: Date, hours: number, maxLookaheadDays = 366 * 4): Date {
  if (hours <= 0) return new Date(start);
  let remainingMin = hours * 60;
  let cursor = nextWorkingMoment(cal, start, maxLookaheadDays);

  for (let safety = 0; safety <= maxLookaheadDays + 1; safety++) {
    const intervals = getWorkingIntervalsForDate(cal, cursor);
    if (intervals.length === 0) {
      cursor = startOfDay(addDays(cursor, 1));
      continue;
    }
    const curMin = minutesIntoDay(cursor);
    let consumed = false;
    for (const iv of intervals) {
      if (curMin >= iv.endMinute) continue;
      const inside = Math.max(curMin, iv.startMinute);
      const available = iv.endMinute - inside;
      if (remainingMin <= available) {
        return dateAtMinute(cursor, inside + remainingMin);
      }
      remainingMin -= available;
      // Fast-forward to the start of the next interval/day
      cursor = dateAtMinute(cursor, iv.endMinute);
      consumed = true;
    }
    if (!consumed || remainingMin > 0) {
      cursor = nextWorkingMoment(cal, startOfDay(addDays(cursor, 1)), maxLookaheadDays);
    }
  }
  throw new Error(`addWorkingHours: could not fit ${hours}h within ${maxLookaheadDays} days`);
}

/** Total working hours strictly between two timestamps (a < b). Returns 0 if a >= b. */
export function workingHoursBetween(cal: ResolvedCalendar, a: Date, b: Date, maxLookaheadDays = 366 * 10): number {
  if (a >= b) return 0;
  let cursor = nextWorkingMoment(cal, a, maxLookaheadDays);
  let totalMin = 0;
  for (let safety = 0; safety <= maxLookaheadDays + 1; safety++) {
    if (cursor >= b) break;
    const intervals = getWorkingIntervalsForDate(cal, cursor);
    const curMin = minutesIntoDay(cursor);
    const dayStart = startOfDay(cursor).getTime();
    let movedThisDay = false;
    for (const iv of intervals) {
      if (curMin >= iv.endMinute) continue;
      const sliceStart = Math.max(curMin, iv.startMinute);
      const sliceEndMin = iv.endMinute;
      const sliceStartTs = dayStart + sliceStart * MS_PER_MINUTE;
      const sliceEndTs = dayStart + sliceEndMin * MS_PER_MINUTE;
      const bTs = b.getTime();
      if (bTs <= sliceStartTs) { cursor = b; break; }
      const effectiveEnd = Math.min(sliceEndTs, bTs);
      totalMin += (effectiveEnd - sliceStartTs) / MS_PER_MINUTE;
      cursor = new Date(effectiveEnd);
      movedThisDay = true;
      if (cursor >= b) break;
    }
    if (cursor >= b) break;
    if (!movedThisDay || cursor.getTime() === dayStart) {
      cursor = nextWorkingMoment(cal, startOfDay(addDays(cursor, 1)), maxLookaheadDays);
    } else if (minutesIntoDay(cursor) >= MINUTES_PER_DAY - 0.0001) {
      cursor = nextWorkingMoment(cal, startOfDay(addDays(cursor, 1)), maxLookaheadDays);
    }
  }
  return totalMin / 60;
}

/**
 * Inverse of addWorkingHours: working start such that addWorkingHours(start, hours) = finish.
 * Walks backward through working intervals.
 */
export function subtractWorkingHours(cal: ResolvedCalendar, finish: Date, hours: number, maxLookbackDays = 366 * 4): Date {
  if (hours <= 0) return new Date(finish);
  let remainingMin = hours * 60;
  let cursor = new Date(finish);
  for (let safety = 0; safety <= maxLookbackDays + 1; safety++) {
    const intervals = getWorkingIntervalsForDate(cal, cursor);
    const curMin = minutesIntoDay(cursor);
    if (intervals.length === 0) {
      // Jump to "end of previous day" (1 ms before start-of-current-day).
      cursor = new Date(startOfDay(cursor).getTime() - 1);
      continue;
    }
    // Walk intervals from latest to earliest
    let consumed = false;
    for (let i = intervals.length - 1; i >= 0; i--) {
      const iv = intervals[i];
      if (curMin <= iv.startMinute) continue;
      const upper = Math.min(curMin, iv.endMinute);
      const available = upper - iv.startMinute;
      if (remainingMin <= available) {
        return dateAtMinute(cursor, upper - remainingMin);
      }
      remainingMin -= available;
      cursor = dateAtMinute(cursor, iv.startMinute);
      consumed = true;
    }
    if (remainingMin > 0) {
      cursor = new Date(startOfDay(cursor).getTime() - 1);
    }
  }
  throw new Error(`subtractWorkingHours: could not unwind ${hours}h within ${maxLookbackDays} days`);
}

// ---------------------------------------------------------------------------
// Builders / merging
// ---------------------------------------------------------------------------

/**
 * Build a ResolvedCalendar from raw rows. `base`, when provided, supplies the
 * default working week for any dayOfWeek that has no shifts on the child, and
 * its exceptions are concatenated AFTER the child's (child wins).
 */
export function buildResolvedCalendar(input: {
  id: number;
  name: string;
  shifts: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  exceptions: Array<{ startDate: string; endDate: string; isWorking: boolean; intervals?: CalendarInterval[] | null }>;
  recurring: Array<{
    recurrenceType: string;
    month?: number | null; dayOfMonth?: number | null;
    weekOfMonth?: number | null; dayOfWeek?: number | null;
    endMonth?: number | null; endDayOfMonth?: number | null;
    isWorking: boolean; intervals?: CalendarInterval[] | null;
  }>;
  base?: ResolvedCalendar | null;
}): ResolvedCalendar {
  const weeklyShifts: CalendarInterval[][] = [[], [], [], [], [], [], []];
  for (const s of input.shifts) {
    if (s.dayOfWeek < 0 || s.dayOfWeek > 6) continue;
    weeklyShifts[s.dayOfWeek].push({ startMinute: s.startMinute, endMinute: s.endMinute });
  }
  for (let dow = 0; dow < 7; dow++) {
    weeklyShifts[dow] = mergeIntervals(weeklyShifts[dow]);
    if (weeklyShifts[dow].length === 0 && input.base) {
      weeklyShifts[dow] = [...(input.base.weeklyShifts[dow] || [])];
    }
  }

  const exceptions: ResolvedException[] = [
    ...input.exceptions,
    ...(input.base?.exceptions || []),
  ];
  const recurring: ResolvedRecurring[] = [
    ...input.recurring.map(r => ({ ...r, recurrenceType: r.recurrenceType as RecurrenceType })),
    ...(input.base?.recurring || []),
  ];

  return { id: input.id, name: input.name, weeklyShifts, exceptions, recurring };
}

/**
 * Layer additional non-working windows on top of an existing calendar (for
 * resource-availability folding). Returns a NEW ResolvedCalendar; the source
 * is not mutated.
 */
export function withAdditionalNonWorkingWindows(
  base: ResolvedCalendar,
  windows: Array<{ startDate: string; endDate: string }>,
): ResolvedCalendar {
  if (!windows.length) return base;
  return {
    ...base,
    exceptions: [
      ...windows.map(w => ({ startDate: w.startDate, endDate: w.endDate, isWorking: false })),
      ...base.exceptions,
    ],
  };
}
