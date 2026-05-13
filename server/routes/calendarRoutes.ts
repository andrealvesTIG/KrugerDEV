import type { Express } from "express";
import { storage } from "../storage";
import {
  insertCalendarSchema,
  updateCalendarSchema,
  insertCalendarExceptionSchema,
  updateCalendarExceptionSchema,
  insertCalendarRecurringExceptionSchema,
  updateCalendarRecurringExceptionSchema,
  replaceWorkingWeekSchema,
  calendarSimulateSchema,
} from "@shared/schema";
import {
  addWorkingHours,
  subtractWorkingHours,
  workingHoursBetween,
  nextWorkingMoment,
} from "@shared/lib/calendarEngine";
import {
  classifyError,
  formatZodErrors,
  getUserIdFromRequest,
  getUserOrgRole,
  userHasOrgAccess,
} from "./helpers";

async function requireOrgAdmin(userId: string | undefined, orgId: number): Promise<boolean> {
  const role = await getUserOrgRole(userId, orgId);
  return role === "org_admin" || role === "owner";
}

export function registerCalendarRoutes(app: Express) {
  // ---- Resolved calendars (engine-ready) ---------------------------------
  // Returns the project's effective ResolvedCalendar (project.calendarId →
  // org default → null). Used by the client CPM/Gantt to schedule against
  // the right working week + holidays.
  app.get("/api/projects/:projectId/resolved-calendar", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const projectId = Number(req.params.projectId);
      if (Number.isNaN(projectId)) return res.status(400).json({ message: "Invalid project id" });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      let calId: number | null = project.calendarId ?? null;
      if (!calId) {
        const def = await storage.getDefaultCalendarForOrg(project.organizationId);
        calId = def?.id ?? null;
      }
      if (!calId) return res.json(null);
      const resolved = await storage.loadResolvedCalendar(calId);
      res.json(resolved);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error loading project calendar" : c.message });
    }
  });

  // Returns a resource's effective ResolvedCalendar. If `projectId` is
  // supplied, the resource's calendar is layered on top of the project
  // calendar as additional non-working windows (resource calendars only
  // restrict availability — project calendar wins for scheduling).
  app.get("/api/resources/:resourceId/resolved-calendar", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const resourceId = Number(req.params.resourceId);
      if (Number.isNaN(resourceId)) return res.status(400).json({ message: "Invalid resource id" });
      const resource = await storage.getResource(resourceId);
      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, resource.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const projectIdRaw = req.query.projectId;
      const projectId = projectIdRaw != null ? Number(projectIdRaw) : null;
      const resourceCalId = resource.calendarId ?? null;
      const resourceCal = resourceCalId ? await storage.loadResolvedCalendar(resourceCalId) : null;

      // Fold resource_availability rows (PTO, leave, etc.) in as additional
      // non-working windows so callers see PTO via the engine instead of as
      // a separate concept. Only `approved` rows count.
      const engine = await import("@shared/lib/calendarEngine");
      const availabilityRows = (await storage.getResourceAvailability(resourceId))
        .filter((r: any) => (r.status ?? "approved") === "approved");
      // Local-date YMD (avoids the toISOString() timezone shift that would
      // bump dates by one day in non-UTC server zones).
      const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const localYmd = (d: Date): string =>
        `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const toYmd = (v: any): string =>
        typeof v === "string" ? v.slice(0, 10) : localYmd(new Date(v));
      const parseYmd = (s: string): Date => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      };

      /**
       * Build PTO windows against a specific "effective base" calendar so
       * partial-day intervals are intersected with the base day's working
       * intervals BEFORE being emitted. This preserves the documented rule
       * "project calendar wins; resource calendar only restricts": if the
       * base says the day is non-working, partial PTO cannot reopen it.
       *
       * Phase 3a: rows with `hoursPerDay` set are expanded into per-date
       * partial-day windows. For each date we look up the base's working
       * intervals and subtract `hoursPerDay` of working time from the END
       * of the day (most common half-day pattern: "I'm leaving at 1pm").
       * Rows without `hoursPerDay` keep the legacy full-day-off behaviour.
       */
      const buildPtoWindows = (baseCal: any) =>
        availabilityRows.flatMap((r: any) => {
          const startStr = toYmd(r.startDate);
          const endStr = toYmd(r.endDate);
          const hpd = r.hoursPerDay != null ? Number(r.hoursPerDay) : null;
          // Full-day PTO (no hoursPerDay) → single multi-day window. Safe
          // even if base is already non-working on some of those dates.
          if (hpd == null || !isFinite(hpd) || hpd <= 0) {
            return [{ startDate: startStr, endDate: endStr }];
          }
          // Partial-day PTO → expand against the EFFECTIVE base calendar.
          const lookupCal = baseCal ?? engine.defaultLegacyResolvedCalendar();
          const out: Array<{ startDate: string; endDate: string; intervals?: any }> = [];
          const start = parseYmd(startStr);
          const end = parseYmd(endStr);
          for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
            const dayIntervals = engine.getWorkingIntervalsForDate(lookupCal, cur);
            if (!dayIntervals.length) continue; // base is non-working — PTO is moot
            const residual = engine.subtractPtoFromIntervals(dayIntervals, hpd);
            const ymd = localYmd(cur);
            // residual.length === 0 → PTO consumed the whole day → full-day off.
            out.push({ startDate: ymd, endDate: ymd, intervals: residual.length ? residual : null });
          }
          return out;
        });

      if (projectId != null && !Number.isNaN(projectId)) {
        const project = await storage.getProject(projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });
        if (!await userHasOrgAccess(userId, project.organizationId)) {
          return res.status(403).json({ message: "Access denied" });
        }
        const projCalId = project.calendarId ?? (await storage.getDefaultCalendarForOrg(project.organizationId))?.id ?? null;
        const projCal = projCalId ? await storage.loadResolvedCalendar(projCalId) : null;
        if (projCal && resourceCal) {
          // Walk a bounded horizon (today − 30d → today + 5y) and emit one
          // non-working exception for every date the resource calendar
          // marks non-working. This honours the resource's weeklyShifts
          // (e.g. resource doesn't work Fridays), recurring rules, AND
          // one-time exceptions — anything the engine considers non-working.
          const horizonStart = new Date();
          horizonStart.setDate(horizonStart.getDate() - 30);
          const horizonEnd = new Date();
          horizonEnd.setFullYear(horizonEnd.getFullYear() + 5);
          const overlayWindows = engine.enumerateNonWorkingDates(resourceCal, horizonStart, horizonEnd);
          // Build PTO against the composed (project + resource overlay)
          // calendar so partial-day PTO can't reopen days the project
          // OR resource consider non-working.
          const composedForLookup = engine.withAdditionalNonWorkingWindows(projCal, overlayWindows);
          const ptoWindows = buildPtoWindows(composedForLookup);
          return res.json(engine.withAdditionalNonWorkingWindows(projCal, [...overlayWindows, ...ptoWindows]));
        }
        const baseCal = projCal ?? resourceCal;
        const ptoWindows = buildPtoWindows(baseCal);
        if (baseCal && ptoWindows.length) return res.json(engine.withAdditionalNonWorkingWindows(baseCal, ptoWindows));
        return res.json(baseCal);
      }
      const ptoWindows = buildPtoWindows(resourceCal);
      if (resourceCal && ptoWindows.length) return res.json(engine.withAdditionalNonWorkingWindows(resourceCal, ptoWindows));
      // Edge case: no resource calendar but PTO exists — fold PTO onto the
      // legacy Mon–Fri 8h fallback so callers don't lose PTO when the
      // resource has no explicit calendar pinned. (`null` would otherwise
      // make the client fall back to legacy with no PTO knowledge.)
      if (!resourceCal && ptoWindows.length) return res.json(engine.withAdditionalNonWorkingWindows(engine.defaultLegacyResolvedCalendar(), ptoWindows));
      return res.json(resourceCal);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error loading resource calendar" : c.message });
    }
  });

  // ---- Calendars ---------------------------------------------------------

  app.get("/api/organizations/:orgId/calendars", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      if (Number.isNaN(orgId)) return res.status(400).json({ message: "Invalid organization id" });
      if (!await userHasOrgAccess(userId, orgId)) return res.status(403).json({ message: "Access denied" });
      const includeInactive = req.query.includeInactive === "true";
      const list = await storage.listCalendars(orgId, includeInactive);
      res.json(list);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error fetching calendars" : c.message });
    }
  });

  app.get("/api/calendars/:id", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid calendar id" });
      const cal = await storage.getCalendar(id);
      if (!cal) return res.status(404).json({ message: "Calendar not found" });
      if (!await userHasOrgAccess(userId, cal.organizationId)) return res.status(403).json({ message: "Access denied" });

      const [shifts, exceptions, recurring] = await Promise.all([
        storage.listWorkingShifts(id),
        storage.listExceptions(id),
        storage.listRecurringExceptions(id),
      ]);
      res.json({ ...cal, shifts, exceptions, recurring });
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error fetching calendar" : c.message });
    }
  });

  app.post("/api/calendars", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const parsed = insertCalendarSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });
      if (!await requireOrgAdmin(userId, parsed.data.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      const created = await storage.createCalendar({ ...parsed.data, createdBy: userId } as any);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error creating calendar" : c.message });
    }
  });

  app.put("/api/calendars/:id", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid calendar id" });
      const existing = await storage.getCalendar(id);
      if (!existing) return res.status(404).json({ message: "Calendar not found" });
      if (!await requireOrgAdmin(userId, existing.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      const parsed = updateCalendarSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });
      const updated = await storage.updateCalendar(id, parsed.data);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error updating calendar" : c.message });
    }
  });

  app.delete("/api/calendars/:id", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid calendar id" });
      const existing = await storage.getCalendar(id);
      if (!existing) return res.status(404).json({ message: "Calendar not found" });
      if (!await requireOrgAdmin(userId, existing.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      await storage.deleteCalendar(id, userId);
      res.json({ ok: true });
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status >= 500 ? "Error deleting calendar" : c.message });
    }
  });

  // ---- Working week ------------------------------------------------------

  app.put("/api/calendars/:id/working-week", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid calendar id" });
      const existing = await storage.getCalendar(id);
      if (!existing) return res.status(404).json({ message: "Calendar not found" });
      if (!await requireOrgAdmin(userId, existing.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      const parsed = replaceWorkingWeekSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });
      const rows = await storage.replaceWorkingWeek(id, parsed.data.shifts);
      res.json(rows);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error updating working week" : c.message });
    }
  });

  // ---- Exceptions --------------------------------------------------------

  app.post("/api/calendars/:id/exceptions", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const calendarId = Number(req.params.id);
      const existing = await storage.getCalendar(calendarId);
      if (!existing) return res.status(404).json({ message: "Calendar not found" });
      if (!await requireOrgAdmin(userId, existing.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      const parsed = insertCalendarExceptionSchema.safeParse({ ...req.body, calendarId });
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });
      const created = await storage.createException(parsed.data);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error creating exception" : c.message });
    }
  });

  app.put("/api/calendar-exceptions/:id", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const parent = await storage.getExceptionParentCalendar(id);
      if (!parent) return res.status(404).json({ message: "Exception not found" });
      if (!await requireOrgAdmin(userId, parent.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      const parsed = updateCalendarExceptionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });
      const updated = await storage.updateException(id, parsed.data);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error updating exception" : c.message });
    }
  });

  app.delete("/api/calendar-exceptions/:id", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const parent = await storage.getExceptionParentCalendar(id);
      if (!parent) return res.status(404).json({ message: "Exception not found" });
      if (!await requireOrgAdmin(userId, parent.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      await storage.deleteException(id);
      res.json({ ok: true });
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error deleting exception" : c.message });
    }
  });

  // ---- Recurring exceptions ---------------------------------------------

  app.post("/api/calendars/:id/recurring-exceptions", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const calendarId = Number(req.params.id);
      const existing = await storage.getCalendar(calendarId);
      if (!existing) return res.status(404).json({ message: "Calendar not found" });
      if (!await requireOrgAdmin(userId, existing.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      const parsed = insertCalendarRecurringExceptionSchema.safeParse({ ...req.body, calendarId });
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });
      const created = await storage.createRecurringException(parsed.data);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error creating recurring exception" : c.message });
    }
  });

  app.put("/api/calendar-recurring-exceptions/:id", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const parent = await storage.getRecurringExceptionParentCalendar(id);
      if (!parent) return res.status(404).json({ message: "Recurring exception not found" });
      if (!await requireOrgAdmin(userId, parent.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      const parsed = updateCalendarRecurringExceptionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });
      const updated = await storage.updateRecurringException(id, parsed.data);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error updating recurring exception" : c.message });
    }
  });

  app.delete("/api/calendar-recurring-exceptions/:id", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const parent = await storage.getRecurringExceptionParentCalendar(id);
      if (!parent) return res.status(404).json({ message: "Recurring exception not found" });
      if (!await requireOrgAdmin(userId, parent.organizationId)) {
        return res.status(403).json({ message: "Org admin access required" });
      }
      await storage.deleteRecurringException(id);
      res.json({ ok: true });
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error deleting recurring exception" : c.message });
    }
  });

  // ---- Simulate (engine preview) ----------------------------------------

  app.post("/api/calendars/:id/simulate", async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const id = Number(req.params.id);
      const existing = await storage.getCalendar(id);
      if (!existing) return res.status(404).json({ message: "Calendar not found" });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: "Access denied" });

      const parsed = calendarSimulateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation failed", errors: formatZodErrors(parsed.error) });

      const cal = await storage.loadResolvedCalendar(id);
      if (!cal) return res.status(404).json({ message: "Calendar not found" });

      const start = new Date(parsed.data.startDate);
      if (Number.isNaN(start.getTime())) return res.status(400).json({ message: "Invalid startDate" });

      switch (parsed.data.mode) {
        case "finish_from_start": {
          if (!parsed.data.hours) return res.status(400).json({ message: "hours required for finish_from_start" });
          const finish = addWorkingHours(cal, start, parsed.data.hours);
          return res.json({ mode: parsed.data.mode, start: start.toISOString(), finish: finish.toISOString() });
        }
        case "start_from_finish": {
          if (!parsed.data.hours) return res.status(400).json({ message: "hours required for start_from_finish" });
          const startCalc = subtractWorkingHours(cal, start, parsed.data.hours);
          return res.json({ mode: parsed.data.mode, finish: start.toISOString(), start: startCalc.toISOString() });
        }
        case "hours_between": {
          if (!parsed.data.finishDate) return res.status(400).json({ message: "finishDate required for hours_between" });
          const finish = new Date(parsed.data.finishDate);
          if (Number.isNaN(finish.getTime())) return res.status(400).json({ message: "Invalid finishDate" });
          const hours = workingHoursBetween(cal, start, finish);
          return res.json({ mode: parsed.data.mode, start: start.toISOString(), finish: finish.toISOString(), hours });
        }
        case "next_working_moment": {
          const moment = nextWorkingMoment(cal, start);
          return res.json({ mode: parsed.data.mode, input: start.toISOString(), nextWorkingMoment: moment.toISOString() });
        }
      }
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? "Error running simulation" : c.message });
    }
  });
}
