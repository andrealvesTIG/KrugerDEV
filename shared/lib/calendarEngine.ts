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
/**
 * A ResolvedCalendar matching the legacy hardcoded behaviour: Mon–Fri working,
 * 8h/day (08:00–12:00, 13:00–17:00 from the standard working week). No
 * holidays or recurring rules. Used as the safe default whenever a caller
 * doesn't have an explicit project/resource calendar yet.
 */
export function defaultLegacyResolvedCalendar(): ResolvedCalendar {
  return {
    id: -1,
    name: "Legacy default (Mon–Fri 9–5)",
    weeklyShifts: defaultStandardWorkingWeek(),
    exceptions: [],
    recurring: [],
  };
}

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
/**
 * Enumerate every local-date within [from, to] (inclusive) that the calendar
 * marks as non-working (no working intervals). Returns an array of
 * `ResolvedException` rows suitable for `withAdditionalNonWorkingWindows`.
 * Bounded by `to - from`; callers should cap the horizon (e.g. 5 years).
 */
export function enumerateNonWorkingDates(
  cal: ResolvedCalendar,
  from: Date,
  to: Date,
): ResolvedException[] {
  const out: ResolvedException[] = [];
  let cur = startOfDay(from);
  const end = startOfDay(to);
  for (let safety = 0; safety < 366 * 20; safety++) {
    if (cur > end) break;
    if (getWorkingIntervalsForDate(cal, cur).length === 0) {
      const s = ymd(cur);
      out.push({ startDate: s, endDate: s, isWorking: false, intervals: null });
    }
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * A non-working window may carry an optional `intervals` override:
 *   - omitted / null / empty → full day off (legacy behaviour)
 *   - non-empty              → the day IS working but ONLY during these
 *                              intervals (i.e. residual working time after
 *                              partial-day PTO has been subtracted upstream).
 * This is how partial-day PTO (resource_availability.hoursPerDay) is folded
 * into the engine without losing the resource's residual availability.
 */
export type NonWorkingWindow = {
  startDate: string;
  endDate: string;
  intervals?: CalendarInterval[] | null;
  /** Accepted for back-compat with callers that already pass this; ignored.
   *  The function decides isWorking based on whether intervals are present. */
  isWorking?: boolean;
};

export function withAdditionalNonWorkingWindows(
  base: ResolvedCalendar,
  windows: Array<NonWorkingWindow>,
): ResolvedCalendar {
  if (!windows.length) return base;
  return {
    ...base,
    exceptions: [
      ...windows.map(w => {
        const ints = w.intervals && w.intervals.length ? w.intervals : null;
        return ints
          ? { startDate: w.startDate, endDate: w.endDate, isWorking: true, intervals: ints }
          : { startDate: w.startDate, endDate: w.endDate, isWorking: false };
      }),
      ...base.exceptions,
    ],
  };
}

// ---- Resource availability folding (PTO / partial-day) ------------------

/**
 * Local YYYY-MM-DD formatter that avoids the toISOString() timezone shift
 * (which would bump dates by one day in non-UTC server zones).
 */
function _localYmdEng(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function _toYmdEng(v: any): string {
  return typeof v === "string" ? v.slice(0, 10) : _localYmdEng(new Date(v));
}
function _parseYmdEng(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Minimal shape needed to fold a resource_availability row into the calendar
 * engine. Status defaults to "approved" when missing; only approved rows
 * count. Rows with `hoursPerDay` set are treated as partial-day (residual
 * working time emitted via `intervals`); rows without `hoursPerDay` are
 * full-day off.
 */
export type ResourceAvailabilityWindowInput = {
  startDate: string | Date;
  endDate: string | Date;
  hoursPerDay?: string | number | null;
  status?: string | null;
  /**
   * Optional split-shift PTO window (minutes-into-day). When set together with
   * `hoursPerDay`, the partial-day PTO is taken from this specific time-of-day
   * window (e.g. 8:00–12:00 morning PTO) instead of the end of the day.
   */
  ptoStartMinute?: number | null;
  ptoEndMinute?: number | null;
};

/**
 * Build PTO windows from raw resource_availability rows, intersecting
 * partial-day intervals against `baseCal` so partial PTO can never reopen a
 * day the base calendar (project precedence + resource overlay) considers
 * non-working.
 */
export function buildResourceAvailabilityWindows(
  baseCal: ResolvedCalendar | null,
  rows: ResourceAvailabilityWindowInput[],
): NonWorkingWindow[] {
  const approved = rows.filter(r => (r.status ?? "approved") === "approved");
  return approved.flatMap((r): NonWorkingWindow[] => {
    const startStr = _toYmdEng(r.startDate);
    const endStr = _toYmdEng(r.endDate);
    const hpd = r.hoursPerDay != null ? Number(r.hoursPerDay) : null;
    if (hpd == null || !isFinite(hpd) || hpd <= 0) {
      return [{ startDate: startStr, endDate: endStr }];
    }
    const lookupCal = baseCal ?? defaultLegacyResolvedCalendar();
    const out: NonWorkingWindow[] = [];
    const start = _parseYmdEng(startStr);
    const end = _parseYmdEng(endStr);
    const ptoStart = r.ptoStartMinute != null ? Number(r.ptoStartMinute) : null;
    const ptoEnd = r.ptoEndMinute != null ? Number(r.ptoEndMinute) : null;
    const splitShift =
      ptoStart != null && ptoEnd != null && isFinite(ptoStart) && isFinite(ptoEnd) && ptoEnd > ptoStart
        ? { ptoStartMinute: ptoStart, ptoEndMinute: ptoEnd }
        : undefined;
    for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const dayIntervals = getWorkingIntervalsForDate(lookupCal, cur);
      if (!dayIntervals.length) continue;
      const residual = subtractPtoFromIntervals(dayIntervals, hpd, splitShift);
      const ymd = _localYmdEng(cur);
      out.push({ startDate: ymd, endDate: ymd, intervals: residual.length ? residual : null });
    }
    return out;
  });
}

/**
 * Compose the effective ResolvedCalendar for a resource working on a project,
 * applying the documented precedence rule: project calendar wins; resource
 * calendar restricts only; resource_availability (PTO) layered on top.
 *
 * Returns null only when there is no project calendar, no resource calendar,
 * AND no PTO. When PTO exists with no calendars, falls back onto the legacy
 * default so PTO is still honoured.
 */
/**
 * Intersect two sorted, non-overlapping interval lists (minute-precision).
 * Returns the time both lists agree is "working".
 */
function _intersectIntervals(a: CalendarInterval[], b: CalendarInterval[]): CalendarInterval[] {
  const out: CalendarInterval[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].startMinute, b[j].startMinute);
    const e = Math.min(a[i].endMinute, b[j].endMinute);
    if (s < e) out.push({ startMinute: s, endMinute: e });
    if (a[i].endMinute < b[j].endMinute) i++; else j++;
  }
  return out;
}

function _intervalsEqual(a: CalendarInterval[], b: CalendarInterval[]): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) {
    if (a[k].startMinute !== b[k].startMinute || a[k].endMinute !== b[k].endMinute) return false;
  }
  return true;
}

/**
 * Walk every working day in `[from, to]` for `projCal` and, when `resourceCal`'s
 * intervals for that day are stricter (a proper subset of project intervals),
 * emit a partial-day NonWorkingWindow with the intersected residual. Days the
 * resource is fully off are NOT emitted here — `enumerateNonWorkingDates` is
 * still the right primitive for that and is handled by the caller.
 *
 * This is what enforces "resource calendar restricts only" at minute precision
 * (e.g. a part-time resource on a 5-day project gets per-day capacity equal to
 * the project∩resource intersection, not the full project day).
 */
export function enumerateResourceIntervalRestrictions(
  projCal: ResolvedCalendar,
  resourceCal: ResolvedCalendar,
  from: Date,
  to: Date,
): NonWorkingWindow[] {
  const out: NonWorkingWindow[] = [];
  let cur = startOfDay(from);
  const end = startOfDay(to);
  for (let safety = 0; safety < 366 * 20; safety++) {
    if (cur > end) break;
    const proj = getWorkingIntervalsForDate(projCal, cur);
    if (proj.length) {
      const res = getWorkingIntervalsForDate(resourceCal, cur);
      if (res.length) {
        const inter = _intersectIntervals(proj, res);
        if (!_intervalsEqual(inter, proj)) {
          const s = ymd(cur);
          if (inter.length) {
            out.push({ startDate: s, endDate: s, intervals: inter });
          } else {
            // Disjoint intervals (e.g. project 08–17, resource 18–20):
            // resource is "working" on its own calendar so enumerateNonWorkingDates
            // won't catch this — emit a full-day non-working window so the
            // composed day is correctly 0h.
            out.push({ startDate: s, endDate: s, intervals: null });
          }
        }
      }
    }
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * Compose a resource's effective ResolvedCalendar.
 *
 * @internal — prefer `composeForRange` so the horizon is always pinned
 * explicitly. The bare `horizon` arg is optional only for the legacy default
 * (today-30d → +5y), which silently produces wrong answers for tasks past
 * that window (see README "Pin horizon for far-future task ranges").
 */
export function composeResourceEffectiveCalendar(
  projCal: ResolvedCalendar | null,
  resourceCal: ResolvedCalendar | null,
  availabilityRows: ResourceAvailabilityWindowInput[],
  horizon?: { start: Date; end: Date },
): ResolvedCalendar | null {
  if (projCal && resourceCal) {
    const horizonStart = horizon?.start ?? (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const horizonEnd = horizon?.end ?? (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 5); return d; })();
    // Resource fully-off days → full-day non-working overlay.
    const fullDayOverlay = enumerateNonWorkingDates(resourceCal, horizonStart, horizonEnd);
    // Resource partial-day restrictions → emit residual intervals so per-day
    // working hours == project ∩ resource (e.g. 4h/day part-time on an 8h project).
    const intervalOverlay = enumerateResourceIntervalRestrictions(projCal, resourceCal, horizonStart, horizonEnd);
    const composedForLookup = withAdditionalNonWorkingWindows(projCal, [...fullDayOverlay, ...intervalOverlay]);
    const ptoWindows = buildResourceAvailabilityWindows(composedForLookup, availabilityRows);
    // PTO must win over interval-restriction overlays for the same date — the
    // engine picks the FIRST matching exception, and PTO already consumed the
    // resource's restricted intervals when it was built (via composedForLookup).
    return withAdditionalNonWorkingWindows(projCal, [...ptoWindows, ...fullDayOverlay, ...intervalOverlay]);
  }
  const baseCal = projCal ?? resourceCal;
  const ptoWindows = buildResourceAvailabilityWindows(baseCal, availabilityRows);
  if (baseCal) {
    return ptoWindows.length ? withAdditionalNonWorkingWindows(baseCal, ptoWindows) : baseCal;
  }
  if (ptoWindows.length) return withAdditionalNonWorkingWindows(defaultLegacyResolvedCalendar(), ptoWindows);
  return null;
}

/**
 * Subtract `ptoHours` of working time from the END of a day's working
 * intervals and return the residual intervals the resource is still
 * available for.
 *
 *   - PTO consumes the END of the working day (matches the most common
 *     half-day PTO pattern: "I'm leaving at 1pm"). If product later wants
 *     start-of-day or proportional consumption this becomes a strategy arg.
 *   - If `ptoHours` >= total working hours in the day → returns [] (full
 *     day off — caller should still emit a non-working exception).
 *   - If `ptoHours` <= 0 → returns intervals unchanged.
 *
 * Pure / no calendar lookup. Caller passes the day's normal intervals
 * (e.g. from `getWorkingIntervalsForDate`).
 */
export function subtractPtoFromIntervals(
  intervals: CalendarInterval[],
  ptoHours: number,
  opts?: { ptoStartMinute?: number; ptoEndMinute?: number },
): CalendarInterval[] {
  if (ptoHours <= 0) return intervals.map(i => ({ ...i }));
  if (!intervals.length) return [];

  // Split-shift PTO: when a time-of-day window is supplied, subtract working
  // minutes that fall INSIDE [ptoStartMinute, ptoEndMinute] instead of the
  // legacy "trim from the end of the day" behaviour. Caps removed minutes at
  // `ptoHours` so an oversized window doesn't accidentally clear more than the
  // approved PTO budget.
  const ws = opts?.ptoStartMinute;
  const we = opts?.ptoEndMinute;
  if (ws != null && we != null && isFinite(ws) && isFinite(we) && we > ws) {
    let remainingPtoMin = ptoHours * 60;
    const out: CalendarInterval[] = [];
    for (const iv of intervals) {
      // No overlap with the PTO window → keep as-is.
      if (iv.endMinute <= ws || iv.startMinute >= we || remainingPtoMin <= 0) {
        out.push({ ...iv });
        continue;
      }
      const overlapStart = Math.max(iv.startMinute, ws);
      const overlapEnd = Math.min(iv.endMinute, we);
      const overlap = overlapEnd - overlapStart;
      const cut = Math.min(overlap, remainingPtoMin);
      const cutStart = overlapStart;
      const cutEnd = overlapStart + cut;
      remainingPtoMin -= cut;
      if (iv.startMinute < cutStart) out.push({ startMinute: iv.startMinute, endMinute: cutStart });
      if (iv.endMinute > cutEnd) out.push({ startMinute: cutEnd, endMinute: iv.endMinute });
    }
    return out;
  }

  let remainingPtoMin = ptoHours * 60;
  // Default: walk from the LAST interval backward, trimming working minutes
  // until the PTO budget is consumed. Whatever survives is the residual.
  const out: CalendarInterval[] = intervals.map(i => ({ ...i }));
  for (let i = out.length - 1; i >= 0 && remainingPtoMin > 0; i--) {
    const span = out[i].endMinute - out[i].startMinute;
    if (span <= remainingPtoMin) {
      remainingPtoMin -= span;
      out.splice(i, 1);
    } else {
      out[i].endMinute -= remainingPtoMin;
      remainingPtoMin = 0;
    }
  }
  return out;
}

/**
 * Calendar composition wrapper that REQUIRES an explicit horizon range. All
 * application callers should go through this rather than the bare
 * `composeResourceEffectiveCalendar` so far-future task ranges still get
 * PTO / resource-restriction overlays enumerated for their actual dates.
 */
export function composeForRange(
  projCal: ResolvedCalendar | null,
  resourceCal: ResolvedCalendar | null,
  availabilityRows: ResourceAvailabilityWindowInput[],
  rangeStart: Date,
  rangeEnd: Date,
): ResolvedCalendar | null {
  return composeResourceEffectiveCalendar(projCal, resourceCal, availabilityRows, {
    start: rangeStart,
    end: rangeEnd,
  });
}
