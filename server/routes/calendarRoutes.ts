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
