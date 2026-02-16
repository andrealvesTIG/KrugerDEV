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

export function workingDaysBetween(startDate: Date, endDate: Date): number {
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

export function calculateEndDateFromWorkingDays(startDateStr: string, durationWorkingDays: number): string {
  if (durationWorkingDays <= 0) return startDateStr;

  const start = parseISO(startDateStr);
  if (durationWorkingDays === 1) {
    let current = start;
    while (!isWorkingDay(current)) {
      current = addDays(current, 1);
    }
    return format(current, 'yyyy-MM-dd');
  }

  let current = start;
  while (!isWorkingDay(current)) {
    current = addDays(current, 1);
  }

  let remaining = durationWorkingDays - 1;
  while (remaining > 0) {
    current = addDays(current, 1);
    if (isWorkingDay(current)) {
      remaining--;
    }
  }

  return format(current, 'yyyy-MM-dd');
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

  let remaining = durationWorkingDays - 1;
  while (remaining > 0) {
    current = addDays(current, -1);
    if (isWorkingDay(current)) {
      remaining--;
    }
  }

  return format(current, 'yyyy-MM-dd');
}
