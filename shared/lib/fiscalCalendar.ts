// Helpers for translating between an organization's fiscal-month index (1..12,
// where M1 is the first month of the org's fiscal year) and the underlying
// calendar (year, month) pair. Storage always uses month numbers 1..12; the
// org-wide `fiscalYearStartMonth` setting (1..12, default 10 = October) is what
// re-interprets those indices into calendar dates and labels.

export const DEFAULT_FISCAL_YEAR_START_MONTH = 10;

export const CALENDAR_MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const CALENDAR_MONTH_LONG_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function normalizeStart(startMonth: number | null | undefined): number {
  const n = Number(startMonth);
  if (!Number.isFinite(n)) return DEFAULT_FISCAL_YEAR_START_MONTH;
  const i = Math.floor(n);
  if (i < 1 || i > 12) return DEFAULT_FISCAL_YEAR_START_MONTH;
  return i;
}

/**
 * Build the 12-entry month layout for a fiscal year given the org's start
 * month. Index 0 corresponds to fiscal month M1, index 11 to M12. Each entry
 * carries its short label, calendar (year, month), and the storage `monthNum`
 * (1..12) used by `financial_entries.month`.
 */
export function buildFiscalMonths(
  fiscalYear: number,
  startMonth: number | null | undefined,
): Array<{ monthNum: number; label: string; longLabel: string; year: number; month: number }> {
  const start = normalizeStart(startMonth);
  return Array.from({ length: 12 }, (_, i) => {
    const calendarMonth = ((start - 1 + i) % 12) + 1; // 1..12
    // FY label = the calendar year in which the FY *ends*. So any month whose
    // calendar month is >= start lives in `fiscalYear - 1` (it's before the
    // year flip), and months with calendar month < start live in `fiscalYear`.
    // When start === 1 the FY equals the calendar year, so no offset.
    const yearOffset = start === 1 || calendarMonth < start ? 0 : -1;
    const year = fiscalYear + yearOffset;
    return {
      monthNum: i + 1,
      label: CALENDAR_MONTH_LABELS[calendarMonth - 1],
      longLabel: CALENDAR_MONTH_LONG_LABELS[calendarMonth - 1],
      year,
      month: calendarMonth,
    };
  });
}

/**
 * Quarter labels derived from the org's fiscal start. Q1 covers M1..M3, etc.
 * Hint shows the calendar months covered (e.g. "Apr–Jun").
 */
export function buildFiscalQuarters(
  fiscalYear: number,
  startMonth: number | null | undefined,
): Array<{ key: string; label: string; hint: string; monthIndices: number[]; year: number }> {
  const months = buildFiscalMonths(fiscalYear, startMonth);
  return [0, 1, 2, 3].map(qi => {
    const monthIndices = [qi * 3, qi * 3 + 1, qi * 3 + 2];
    const first = months[monthIndices[0]];
    const last = months[monthIndices[2]];
    return {
      key: `q${qi + 1}`,
      label: `Q${qi + 1}`,
      hint: `${first.label}–${last.label}`,
      monthIndices,
      // Year used by the year-grouping header row: the calendar year of the
      // quarter's first month so multi-year FYs render their Q1/Q2 in the
      // earlier year and Q3/Q4 in the later year (matches the prior Oct-FY UX).
      year: first.year,
    };
  });
}

/**
 * Single fiscal-year column. Hint shows the calendar months (e.g. "Apr–Mar").
 */
export function buildFiscalYearColumn(
  fiscalYear: number,
  startMonth: number | null | undefined,
): { key: string; label: string; hint: string; monthIndices: number[]; year: number } {
  const months = buildFiscalMonths(fiscalYear, startMonth);
  const first = months[0];
  const last = months[months.length - 1];
  return {
    key: "fy",
    label: `FY ${fiscalYear}`,
    hint: `${first.label}–${last.label}`,
    monthIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    year: fiscalYear,
  };
}

export function normalizeFiscalYearStartMonth(value: number | null | undefined): number {
  return normalizeStart(value);
}

/**
 * Translate a calendar (year, month) to its FY-relative slot under the given
 * org fiscal start month. Returns the FY label (calendar year in which the FY
 * ends) and the 1..12 fiscal-month index (M1 = the start month).
 */
export function calendarToFiscalSlot(
  calendarYear: number,
  calendarMonth: number,
  startMonth: number | null | undefined,
): { fiscalYear: number; monthNum: number } {
  const start = normalizeStart(startMonth);
  const monthNum = ((calendarMonth - start + 12) % 12) + 1;
  const fiscalYear = start === 1
    ? calendarYear
    : calendarMonth >= start
      ? calendarYear + 1
      : calendarYear;
  return { fiscalYear, monthNum };
}

/**
 * Translate an FY-relative slot (FY label + 1..12 monthNum) to a calendar
 * (year, month). Inverse of `calendarToFiscalSlot` for the same `startMonth`.
 */
export function fiscalSlotToCalendar(
  fiscalYear: number,
  monthNum: number,
  startMonth: number | null | undefined,
): { year: number; month: number } {
  const months = buildFiscalMonths(fiscalYear, startMonth);
  const slot = months[Math.max(0, Math.min(11, monthNum - 1))];
  return { year: slot.year, month: slot.month };
}

/**
 * The fiscal year (labeled by the calendar year in which the FY ends) that
 * `today` falls into, given the org's fiscal start month. For start === 1 the
 * fiscal year equals the calendar year. Otherwise, calendar months >= start
 * belong to the FY that ends in the next calendar year.
 */
export function currentFiscalYear(
  today: Date,
  startMonth: number | null | undefined,
): number {
  const start = normalizeStart(startMonth);
  const calendarYear = today.getFullYear();
  const calendarMonth = today.getMonth() + 1; // 1..12
  if (start === 1) return calendarYear;
  return calendarMonth >= start ? calendarYear + 1 : calendarYear;
}
