import { parseISO, addDays, differenceInCalendarDays, isWeekend, format } from "date-fns";

export const HOURS_PER_DAY = 8;
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;

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

  const calendarSpan = Math.ceil(durationWorkingDays);

  if (calendarSpan <= 1) {
    return format(current, 'yyyy-MM-dd');
  }

  return format(addWorkingDays(current, calendarSpan - 1), 'yyyy-MM-dd');
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

  const calendarSpan = Math.ceil(durationWorkingDays);

  if (calendarSpan <= 1) {
    return format(current, 'yyyy-MM-dd');
  }

  return format(addWorkingDays(current, -(calendarSpan - 1)), 'yyyy-MM-dd');
}

export function hoursToFractionalDays(hours: number): number {
  return hours / HOURS_PER_DAY;
}

export function fractionalDaysToHours(days: number): number {
  return days * HOURS_PER_DAY;
}

export function formatDuration(durationDays: number | null | undefined): string {
  if (durationDays == null || durationDays < 0) return "—";
  if (durationDays === 0) return "0d";

  const totalMinutes = Math.round(durationDays * MINUTES_PER_DAY);
  const wholeDays = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const remainderAfterDays = totalMinutes % MINUTES_PER_DAY;
  const wholeHours = Math.floor(remainderAfterDays / MINUTES_PER_HOUR);
  const remainingMinutes = remainderAfterDays % MINUTES_PER_HOUR;

  const parts: string[] = [];
  if (wholeDays > 0) parts.push(`${wholeDays}d`);
  if (wholeHours > 0) parts.push(`${wholeHours}h`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);

  return parts.length > 0 ? parts.join(" ") : "0d";
}

export function parseDurationInput(input: string): number | null {
  if (!input || !input.trim()) return null;
  const trimmed = input.trim().toLowerCase();

  let days = 0;
  let hours = 0;
  let minutes = 0;
  let matched = false;

  const combined = trimmed.match(/(?:(\d+(?:\.\d+)?)\s*d(?:ays?)?)?\s*(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/);
  if (combined && (combined[1] || combined[2] || combined[3])) {
    if (combined[1]) days = parseFloat(combined[1]);
    if (combined[2]) hours = parseFloat(combined[2]);
    if (combined[3]) minutes = parseFloat(combined[3]);
    matched = true;
  }

  if (!matched) {
    const numericMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
    if (numericMatch) {
      return parseFloat(numericMatch[1]);
    }
    return null;
  }

  return days + hours / HOURS_PER_DAY + minutes / MINUTES_PER_DAY;
}
