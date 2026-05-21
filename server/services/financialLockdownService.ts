// Single source of truth for financial-period lockdown enforcement.
//
// All server writes that touch `project_financials` or `financial_entries`
// — manual cell edits, bulk-clear, item-delete, change-order approval — must
// run through `assertNotLocked` so a closed period can never be mutated.
// Returns a `LockdownViolation` describing the locked type+date when the
// (org, year, month) tuple is on or before any active lockdown; otherwise
// returns `null`. Callers translate violations to a 409 with code "LOCKDOWN".

import { storage } from "../storage";
import {
  calendarToFiscalSlot,
  fiscalSlotToCalendar,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";

export interface LockdownViolation {
  financialTypeKey: string;
  lockdownDate: string; // YYYY-MM-DD
  cellMonthEnd: string; // YYYY-MM-DD
  message: string;
}

interface AssertNotLockedOpts {
  organizationId: number;
  /** Optional — kept for API parity with the task spec; reserved for future per-project lockdowns. */
  projectId?: number;
  /**
   * Either pass calendar (year, month) directly OR fiscal (fiscalYear, fiscalMonth).
   * Exactly one form must be provided. Calendar form is preferred for paths that
   * naturally work in calendar time (e.g. change-order approval uses `new Date()`).
   */
  calendarYear?: number;
  calendarMonth?: number; // 1..12
  fiscalYear?: number;
  fiscalMonth?: number;   // 1..12
  /**
   * Scope check to a single financial type key. When omitted, the helper checks
   * EVERY known type and trips on the first one whose lockdown date is on or
   * after the target month-end — useful for paths like change-order approval
   * that write rows on behalf of multiple types implicitly.
   */
  typeKey?: string;
}

/** Last day of a calendar (year, month) as YYYY-MM-DD (UTC). */
export function monthEndIso(calendarYear: number, calendarMonth: number): string {
  const d = new Date(Date.UTC(calendarYear, calendarMonth, 0));
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns a `LockdownViolation` if the cell at the given period is on or
 * before an active lockdown date, otherwise `null`.
 *
 * Routes should do:
 *
 *     const violation = await assertNotLocked({ organizationId, calendarYear, calendarMonth, typeKey });
 *     if (violation) return res.status(409).json({ code: "LOCKDOWN", ...violation });
 */
export async function assertNotLocked(opts: AssertNotLockedOpts): Promise<LockdownViolation | null> {
  let calYear = opts.calendarYear;
  let calMonth = opts.calendarMonth;

  if (calYear == null || calMonth == null) {
    if (opts.fiscalYear == null || opts.fiscalMonth == null) {
      throw new Error("assertNotLocked: must provide either calendar (year,month) or fiscal (year,month)");
    }
    const org = await storage.getOrganization(opts.organizationId);
    const fyStart = normalizeFiscalYearStartMonth(org?.fiscalYearStartMonth);
    const slot = fiscalSlotToCalendar(opts.fiscalYear, opts.fiscalMonth, fyStart);
    calYear = slot.year;
    calMonth = slot.month;
  }

  const cellMonthEnd = monthEndIso(calYear, calMonth);
  const lockdownMap = await storage.getActiveLockdownMap(opts.organizationId);

  if (opts.typeKey) {
    const lockedAt = lockdownMap[opts.typeKey];
    if (lockedAt && cellMonthEnd <= lockedAt) {
      return {
        financialTypeKey: opts.typeKey,
        lockdownDate: lockedAt,
        cellMonthEnd,
        message: `Financial type "${opts.typeKey}" is locked through ${lockedAt}. Period ${cellMonthEnd} cannot be edited.`,
      };
    }
    return null;
  }

  for (const [key, lockedAt] of Object.entries(lockdownMap)) {
    if (cellMonthEnd <= lockedAt) {
      return {
        financialTypeKey: key,
        lockdownDate: lockedAt,
        cellMonthEnd,
        message: `Period ${cellMonthEnd} is locked through ${lockedAt} for "${key}".`,
      };
    }
  }
  return null;
}

/**
 * Convenience: fiscal (FY label, M1..M12) → calendar via the org's
 * fiscalYearStartMonth. Exposed so routes that already have fiscal slots can
 * batch a single org lookup before calling `assertNotLocked` in a loop.
 */
export async function fiscalToCalendar(
  organizationId: number,
  fiscalYear: number,
  fiscalMonth: number,
): Promise<{ year: number; month: number }> {
  const org = await storage.getOrganization(organizationId);
  const fyStart = normalizeFiscalYearStartMonth(org?.fiscalYearStartMonth);
  return fiscalSlotToCalendar(fiscalYear, fiscalMonth, fyStart);
}

export { calendarToFiscalSlot };
