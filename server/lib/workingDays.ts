export function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function addWorkingDays(startDate: Date, workingDaysToAdd: number): Date {
  if (workingDaysToAdd === 0) return new Date(startDate);

  let current = new Date(startDate);
  let remaining = Math.abs(workingDaysToAdd);
  const direction = workingDaysToAdd > 0 ? 1 : -1;

  while (remaining > 0) {
    current.setDate(current.getDate() + direction);
    if (isWorkingDay(current)) {
      remaining--;
    }
  }

  return current;
}

export function workingDaysBetweenLoop(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;

  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    if (isWorkingDay(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

function countWeekdaysInclusive(startDate: Date, endDate: Date): number {
  const startMs = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endMs = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const totalDays = Math.floor((endMs - startMs) / 86400000) + 1;
  if (totalDays <= 0) return 0;

  const fullWeeks = Math.floor(totalDays / 7);
  let workingDays = fullWeeks * 5;
  const remainder = totalDays % 7;

  const startDay = startDate.getDay();
  for (let i = 0; i < remainder; i++) {
    const day = (startDay + i) % 7;
    if (day !== 0 && day !== 6) workingDays++;
  }

  return workingDays;
}

export function workingDaysBetween(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;
  return countWeekdaysInclusive(startDate, endDate);
}

export const workingDaysSpanInclusive = workingDaysBetween;

export function workingDaysBetweenExclusive(startDate: Date, endDate: Date): number {
  if (startDate >= endDate) return 0;
  const next = new Date(startDate);
  next.setDate(next.getDate() + 1);
  return countWeekdaysInclusive(next, endDate);
}

export function nextWorkingDay(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  while (!isWorkingDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export function ensureWorkingDay(date: Date): Date {
  const result = new Date(date);
  while (!isWorkingDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export function calculateEndDate(startDate: Date, durationDays: number): Date {
  if (durationDays <= 0) return new Date(startDate);

  const calendarSpan = Math.ceil(durationDays);
  const start = ensureWorkingDay(new Date(startDate));

  if (calendarSpan <= 1) return start;

  return addWorkingDays(start, calendarSpan - 1);
}

export function calculateDuration(startDate: Date, endDate: Date): number {
  return workingDaysBetween(startDate, endDate);
}

// ============================================================================
// Calendar-aware overloads (Phase 2). When a ResolvedCalendar is supplied we
// walk day-by-day via the engine; when it's null/undefined we fall back to the
// legacy Mon–Fri math above so existing call-sites keep working unchanged.
// ============================================================================

import {
  defaultLegacyResolvedCalendar,
  isWorkingDay as engineIsWorkingDay,
  type ResolvedCalendar,
} from "../../shared/lib/calendarEngine";

function calOrLegacy(cal?: ResolvedCalendar | null): ResolvedCalendar {
  return cal ?? defaultLegacyResolvedCalendar();
}

export function isWorkingDayCal(cal: ResolvedCalendar | null | undefined, date: Date): boolean {
  return engineIsWorkingDay(calOrLegacy(cal), date);
}

export function addWorkingDaysCal(cal: ResolvedCalendar | null | undefined, startDate: Date, workingDaysToAdd: number): Date {
  if (workingDaysToAdd === 0) return new Date(startDate);
  const c = calOrLegacy(cal);
  const current = new Date(startDate);
  let remaining = Math.abs(workingDaysToAdd);
  const direction = workingDaysToAdd > 0 ? 1 : -1;
  while (remaining > 0) {
    current.setDate(current.getDate() + direction);
    if (engineIsWorkingDay(c, current)) remaining--;
  }
  return current;
}

export function workingDaysBetweenCal(cal: ResolvedCalendar | null | undefined, startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;
  const c = calOrLegacy(cal);
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    if (engineIsWorkingDay(c, current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export function workingDaysBetweenExclusiveCal(cal: ResolvedCalendar | null | undefined, startDate: Date, endDate: Date): number {
  if (startDate >= endDate) return 0;
  const next = new Date(startDate);
  next.setDate(next.getDate() + 1);
  return workingDaysBetweenCal(cal, next, endDate);
}

export function ensureWorkingDayCal(cal: ResolvedCalendar | null | undefined, date: Date, dir: 1 | -1 = 1): Date {
  const c = calOrLegacy(cal);
  const result = new Date(date);
  while (!engineIsWorkingDay(c, result)) result.setDate(result.getDate() + dir);
  return result;
}

export function nextWorkingDayCal(cal: ResolvedCalendar | null | undefined, date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  return ensureWorkingDayCal(cal, result, 1);
}

export function calculateEndDateCal(cal: ResolvedCalendar | null | undefined, startDate: Date, durationDays: number): Date {
  if (durationDays <= 0) return new Date(startDate);
  const calendarSpan = Math.ceil(durationDays);
  const start = ensureWorkingDayCal(cal, new Date(startDate), 1);
  if (calendarSpan <= 1) return start;
  return addWorkingDaysCal(cal, start, calendarSpan - 1);
}

export function calculateDurationCal(cal: ResolvedCalendar | null | undefined, startDate: Date, endDate: Date): number {
  return workingDaysBetweenCal(cal, startDate, endDate);
}

export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
