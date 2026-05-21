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
      // a separate concept. Only `approved` rows count. Both window-building
      // and project-precedence intersection live in the shared helpers in
      // `server/storage/calendarStorage.ts` so the assignment estimator
      // agrees on PTO semantics.
      const calStorage = await import("../storage/calendarStorage");
      const availabilityRows = await storage.getResourceAvailability(resourceId);

      let projCal: any = null;
      if (projectId != null && !Number.isNaN(projectId)) {
        const project = await storage.getProject(projectId);
        if (!project) return res.status(404).json({ message: "Project not found" });
        if (!await userHasOrgAccess(userId, project.organizationId)) {
          return res.status(403).json({ message: "Access denied" });
        }
        const projCalId = project.calendarId ?? (await storage.getDefaultCalendarForOrg(project.organizationId))?.id ?? null;
        projCal = projCalId ? await storage.loadResolvedCalendar(projCalId) : null;
      }
      // Single source of truth for compose semantics: project precedence,
      // resource overlay restriction, partial-day PTO honoured at the
      // engine level. Returns null only when projCal/resourceCal/PTO are
      // all absent (caller falls back to legacy Mon–Fri).
      //
      // Pin the horizon explicitly (optional `from`/`to` query params, else
      // the engine's default today-30d → +5y). Far-future Gantt callers
      // should pass `from`/`to` covering the task range so PTO / resource
      // restriction overlays are enumerated for those dates.
      const fromRaw = req.query.from;
      const toRaw = req.query.to;
      const horizonStart = typeof fromRaw === "string" && fromRaw
        ? new Date(fromRaw)
        : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
      const horizonEnd = typeof toRaw === "string" && toRaw
        ? new Date(toRaw)
        : (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 5); return d; })();
      return res.json(calStorage.composeResourceEffectiveCalendar(
        projCal, resourceCal, availabilityRows,
        { start: horizonStart, end: horizonEnd },
      ));
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
