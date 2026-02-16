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

export function workingDaysBetween(startDate: Date, endDate: Date): number {
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
  if (durationDays === 1) return ensureWorkingDay(new Date(startDate));

  const start = ensureWorkingDay(new Date(startDate));
  return addWorkingDays(start, durationDays - 1);
}

export function calculateDuration(startDate: Date, endDate: Date): number {
  return workingDaysBetween(startDate, endDate);
}

export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
