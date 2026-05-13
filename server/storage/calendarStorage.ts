import { db } from "../db";
import {
  calendars,
  calendarWorkingShifts,
  calendarExceptions,
  calendarRecurringExceptions,
  organizations,
  projects,
  resources,
  type Calendar,
  type InsertCalendar,
  type UpdateCalendarRequest,
  type CalendarWorkingShift,
  type CalendarException,
  type InsertCalendarException,
  type UpdateCalendarExceptionRequest,
  type CalendarRecurringException,
  type InsertCalendarRecurringException,
  type UpdateCalendarRecurringExceptionRequest,
} from "@shared/schema";
import {
  buildResolvedCalendar,
  defaultStandardWorkingWeek,
  type ResolvedCalendar,
} from "@shared/lib/calendarEngine";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Validate baseCalendarId for: existence, same-org ownership, not-soft-deleted,
 * one-level inheritance (base must not itself be a child), and self-reference.
 * Throws a 400/404 error for the route layer.
 */
async function validateBaseCalendarId(baseCalendarId: number, organizationId: number, selfId?: number): Promise<void> {
  if (selfId && baseCalendarId === selfId) {
    throw Object.assign(new Error("A calendar cannot be its own base"), { status: 400 });
  }
  const [base] = await db.select().from(calendars).where(
    and(eq(calendars.id, baseCalendarId), isNull(calendars.deletedAt)),
  );
  if (!base) throw Object.assign(new Error("Base calendar not found"), { status: 404 });
  if (base.organizationId !== organizationId) {
    throw Object.assign(new Error("Base calendar must belong to the same organization"), { status: 400 });
  }
  if (base.baseCalendarId != null) {
    throw Object.assign(new Error("Base calendar inheritance is limited to one level"), { status: 400 });
  }
}

// ---- Calendars -----------------------------------------------------------

export async function getDefaultCalendarForOrg(organizationId: number): Promise<Calendar | null> {
  const rows = await db
    .select()
    .from(calendars)
    .where(and(
      eq(calendars.organizationId, organizationId),
      eq(calendars.isDefault, true),
      eq(calendars.isActive, true),
      isNull(calendars.deletedAt),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCalendars(organizationId: number, includeInactive = false): Promise<Calendar[]> {
  const where = includeInactive
    ? and(eq(calendars.organizationId, organizationId), isNull(calendars.deletedAt))
    : and(eq(calendars.organizationId, organizationId), isNull(calendars.deletedAt), eq(calendars.isActive, true));
  return await db.select().from(calendars).where(where);
}

export async function getCalendar(id: number): Promise<Calendar | undefined> {
  const [c] = await db.select().from(calendars).where(
    and(eq(calendars.id, id), isNull(calendars.deletedAt)),
  );
  return c;
}

export async function createCalendar(input: InsertCalendar & { createdBy?: string }): Promise<Calendar> {
  if (input.baseCalendarId) await validateBaseCalendarId(input.baseCalendarId, input.organizationId);
  return await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx.update(calendars)
        .set({ isDefault: false })
        .where(and(eq(calendars.organizationId, input.organizationId), eq(calendars.isDefault, true)));
    }
    const [created] = await tx.insert(calendars).values(input as any).returning();
    // Seed the standard 5x8 working week for new calendars without a base.
    if (!created.baseCalendarId) {
      const weekly = defaultStandardWorkingWeek();
      const rows = weekly.flatMap((intervals, dow) =>
        intervals.map((iv, idx) => ({
          calendarId: created.id,
          dayOfWeek: dow,
          startMinute: iv.startMinute,
          endMinute: iv.endMinute,
          position: idx,
        })),
      );
      if (rows.length) await tx.insert(calendarWorkingShifts).values(rows);
    }
    if (created.isDefault) {
      await tx.update(organizations).set({ defaultCalendarId: created.id }).where(eq(organizations.id, created.organizationId));
    }
    return created;
  });
}

export async function updateCalendar(id: number, updates: UpdateCalendarRequest): Promise<Calendar> {
  const [existing] = await db.select().from(calendars).where(eq(calendars.id, id));
  if (!existing) throw Object.assign(new Error("Calendar not found"), { status: 404 });

  if (updates.baseCalendarId != null) {
    await validateBaseCalendarId(updates.baseCalendarId, existing.organizationId, id);
  }
  // Forbid clearing the default flag without picking a new default — keeps the
  // organizations.defaultCalendarId pointer consistent with the calendar rows.
  if (updates.isDefault === false && existing.isDefault) {
    throw Object.assign(new Error("To unset the default, mark another calendar as the default instead"), { status: 400 });
  }

  return await db.transaction(async (tx) => {
    if (updates.isDefault) {
      await tx.update(calendars)
        .set({ isDefault: false })
        .where(and(eq(calendars.organizationId, existing.organizationId), eq(calendars.isDefault, true)));
    }
    const [updated] = await tx.update(calendars)
      .set({ ...(updates as any), updatedAt: new Date() })
      .where(eq(calendars.id, id))
      .returning();
    if (updated.isDefault) {
      await tx.update(organizations).set({ defaultCalendarId: updated.id }).where(eq(organizations.id, updated.organizationId));
    }
    return updated;
  });
}

/**
 * Soft-delete a calendar. Refuses if the calendar is the org default OR is
 * still referenced by any project/resource. Detaching is the admin's job
 * before deletion (matches MS Project Online "calendar in use" guard).
 */
export async function deleteCalendar(id: number, deletedBy?: string): Promise<void> {
  const [cal] = await db.select().from(calendars).where(eq(calendars.id, id));
  if (!cal) throw Object.assign(new Error("Calendar not found"), { status: 404 });
  if (cal.isDefault) throw Object.assign(new Error("Cannot delete the organization's default calendar"), { status: 409 });

  // Only block on LIVE references — soft-deleted projects/resources should not keep a calendar pinned.
  const projectRefs = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.calendarId, id), isNull(projects.deletedAt)));
  const resourceRefs = await db.select({ id: resources.id }).from(resources)
    .where(and(eq(resources.calendarId, id), isNull(resources.deletedAt)));
  const childRefs = await db.select({ id: calendars.id }).from(calendars)
    .where(and(eq(calendars.baseCalendarId, id), isNull(calendars.deletedAt)));
  if (projectRefs.length || resourceRefs.length || childRefs.length) {
    throw Object.assign(
      new Error(`Calendar is in use by ${projectRefs.length} project(s), ${resourceRefs.length} resource(s), and ${childRefs.length} child calendar(s). Reassign them before deleting.`),
      { status: 409 },
    );
  }
  await db.update(calendars)
    .set({ deletedAt: new Date(), deletedBy: deletedBy ?? null, isActive: false })
    .where(eq(calendars.id, id));
}

// ---- Working week --------------------------------------------------------

export async function listWorkingShifts(calendarId: number): Promise<CalendarWorkingShift[]> {
  return await db.select().from(calendarWorkingShifts).where(eq(calendarWorkingShifts.calendarId, calendarId));
}

export async function replaceWorkingWeek(
  calendarId: number,
  shifts: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; position?: number }>,
): Promise<CalendarWorkingShift[]> {
  return await db.transaction(async (tx) => {
    await tx.delete(calendarWorkingShifts).where(eq(calendarWorkingShifts.calendarId, calendarId));
    if (shifts.length === 0) return [];
    const rows = shifts.map((s, i) => ({
      calendarId,
      dayOfWeek: s.dayOfWeek,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      position: s.position ?? i,
    }));
    return await tx.insert(calendarWorkingShifts).values(rows).returning();
  });
}

// ---- Exceptions ----------------------------------------------------------

export async function listExceptions(calendarId: number): Promise<CalendarException[]> {
  return await db.select().from(calendarExceptions).where(eq(calendarExceptions.calendarId, calendarId));
}

export async function createException(input: InsertCalendarException): Promise<CalendarException> {
  const [created] = await db.insert(calendarExceptions).values(input as any).returning();
  return created;
}

export async function updateException(id: number, updates: UpdateCalendarExceptionRequest): Promise<CalendarException> {
  const [updated] = await db.update(calendarExceptions)
    .set(updates as any)
    .where(eq(calendarExceptions.id, id))
    .returning();
  return updated;
}

export async function deleteException(id: number): Promise<void> {
  await db.delete(calendarExceptions).where(eq(calendarExceptions.id, id));
}

// ---- Recurring exceptions ------------------------------------------------

export async function listRecurringExceptions(calendarId: number): Promise<CalendarRecurringException[]> {
  return await db.select().from(calendarRecurringExceptions).where(eq(calendarRecurringExceptions.calendarId, calendarId));
}

export async function createRecurringException(input: InsertCalendarRecurringException): Promise<CalendarRecurringException> {
  const [created] = await db.insert(calendarRecurringExceptions).values(input as any).returning();
  return created;
}

export async function updateRecurringException(id: number, updates: UpdateCalendarRecurringExceptionRequest): Promise<CalendarRecurringException> {
  const [updated] = await db.update(calendarRecurringExceptions)
    .set(updates as any)
    .where(eq(calendarRecurringExceptions.id, id))
    .returning();
  return updated;
}

export async function deleteRecurringException(id: number): Promise<void> {
  await db.delete(calendarRecurringExceptions).where(eq(calendarRecurringExceptions.id, id));
}

/** Resolve the parent calendar of an exception row (for org-scoped authz). */
export async function getExceptionParentCalendar(exceptionId: number): Promise<Calendar | undefined> {
  const [row] = await db.select({ calendarId: calendarExceptions.calendarId })
    .from(calendarExceptions)
    .where(eq(calendarExceptions.id, exceptionId));
  if (!row) return undefined;
  return await getCalendar(row.calendarId);
}

export async function getRecurringExceptionParentCalendar(recurringId: number): Promise<Calendar | undefined> {
  const [row] = await db.select({ calendarId: calendarRecurringExceptions.calendarId })
    .from(calendarRecurringExceptions)
    .where(eq(calendarRecurringExceptions.id, recurringId));
  if (!row) return undefined;
  return await getCalendar(row.calendarId);
}

// ---- Engine resolution ---------------------------------------------------

/**
 * Load a calendar (with one level of base inheritance) and convert it into
 * an engine-ready ResolvedCalendar. Returns null if the calendar doesn't
 * exist or has been soft-deleted.
 */
export async function loadResolvedCalendar(calendarId: number, _seen: Set<number> = new Set()): Promise<ResolvedCalendar | null> {
  if (_seen.has(calendarId)) return null;             // cycle break (defence-in-depth)
  if (_seen.size >= 4) return null;                   // hard depth cap
  _seen.add(calendarId);

  const cal = await getCalendar(calendarId);
  if (!cal) return null;

  const [shifts, excs, rec] = await Promise.all([
    listWorkingShifts(calendarId),
    listExceptions(calendarId),
    listRecurringExceptions(calendarId),
  ]);

  let base: ResolvedCalendar | null = null;
  if (cal.baseCalendarId && cal.baseCalendarId !== cal.id) {
    base = await loadResolvedCalendar(cal.baseCalendarId, _seen);
  }

  return buildResolvedCalendar({
    id: cal.id,
    name: cal.name,
    shifts: shifts.map(s => ({ dayOfWeek: s.dayOfWeek, startMinute: s.startMinute, endMinute: s.endMinute })),
    exceptions: excs.map(e => ({
      startDate: typeof e.startDate === "string" ? e.startDate : new Date(e.startDate as any).toISOString().slice(0, 10),
      endDate: typeof e.endDate === "string" ? e.endDate : new Date(e.endDate as any).toISOString().slice(0, 10),
      isWorking: e.isWorking,
      intervals: e.intervals as any,
    })),
    recurring: rec.map(r => ({
      recurrenceType: r.recurrenceType,
      month: r.month, dayOfMonth: r.dayOfMonth,
      weekOfMonth: r.weekOfMonth, dayOfWeek: r.dayOfWeek,
      endMonth: r.endMonth, endDayOfMonth: r.endDayOfMonth,
      isWorking: r.isWorking,
      intervals: r.intervals as any,
    })),
    base,
  });
}
