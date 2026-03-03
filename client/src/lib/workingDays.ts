import { parseISO, addDays, differenceInCalendarDays, isWeekend, format } from "date-fns";

export function isWorkingDay(date: Date): boolean {
  return !isWeekend(date);
}

export function addWorkingDays(startDate: Date, workingDaysToAdd: number): Date {
  if (workingDaysToAdd === 0) return startDate;

  let current = startDate;
  let remaining = Math.abs(workingDaysToAdd);
  const direction = workingDaysToAdd > 0 ? 1 : -1;

  while (remaining > 0) {
    current = addDays(current, direction);
    if (isWorkingDay(current)) {
      remaining--;
    }
  }

  return current;
}

export function workingDaysBetweenLoop(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;

  let count = 0;
  let current = startDate;

  while (current <= endDate) {
    if (isWorkingDay(current)) {
      count++;
    }
    current = addDays(current, 1);
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
  const next = addDays(startDate, 1);
  return countWeekdaysInclusive(next, endDate);
}

export function calculateEndDateFromWorkingDays(startDateStr: string, durationWorkingDays: number): string {
  if (durationWorkingDays <= 0) return startDateStr;

  const start = parseISO(startDateStr);
  let current = start;
  while (!isWorkingDay(current)) {
    current = addDays(current, 1);
  }
  if (durationWorkingDays === 1) {
    return format(current, 'yyyy-MM-dd');
  }

  return format(addWorkingDays(current, durationWorkingDays - 1), 'yyyy-MM-dd');
}

export function calculateDurationInWorkingDays(startDateStr: string, endDateStr: string): number {
  const start = parseISO(startDateStr);
  const end = parseISO(endDateStr);

  if (end < start) return 0;

  return workingDaysBetween(start, end);
}

export function calculateStartDateFromEndAndDuration(endDateStr: string, durationWorkingDays: number): string {
  if (durationWorkingDays <= 0) return endDateStr;

  const end = parseISO(endDateStr);
  let current = end;
  while (!isWorkingDay(current)) {
    current = addDays(current, -1);
  }

  if (durationWorkingDays === 1) {
    return format(current, 'yyyy-MM-dd');
  }

  return format(addWorkingDays(current, -(durationWorkingDays - 1)), 'yyyy-MM-dd');
}
