import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { users, resources, tasks, timesheetReminderSettings, type Task } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";
import { invalidateOrganizationContextCache } from "../services/jarvisService";

export function registerTimesheetRoutes(app: Express) {
  // ==================== TIMESHEETS ====================

  // Get timesheet entries - returns all entries for admins, or user's own entries for non-admins
  apiRoute(app, 'get', '/api/timesheets', {
    tag: 'Timesheets',
    summary: 'List timesheet entries',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', true, 'Start date (YYYY-MM-DD)'), qStr('endDate', true, 'End date (YYYY-MM-DD)')],
    responses: { ...r200('Timesheet entries', arrOf('TimesheetEntry')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      // Main timesheet view should ALWAYS return only the current user's own entries
      // The approval tab uses a separate endpoint (/api/timesheets/approval) for viewing other users' entries
      // This prevents entries from other users appearing in an admin's personal timesheet grid
      const entriesWithDetails = await storage.getTimesheetEntriesWithDetails(userId, organizationId, startDate, endDate);
      
      // Transform to expected format
      const enrichedEntries = entriesWithDetails.map(({ entry, task, project }) => ({
        ...entry,
        task,
        project
      }));

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet entries' : classified.message });
    }
  });

  // Get all team timesheet entries for approvers/admins (used by dashboards)
  apiRoute(app, 'get', '/api/timesheets/team', {
    tag: 'Timesheets',
    summary: 'Get team timesheet report',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', true, 'Start date (YYYY-MM-DD)'), qStr('endDate', true, 'End date (YYYY-MM-DD)')],
    responses: { ...r200('Team report', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const user = await storage.getUser(userId);
      const membership = (await storage.getOrganizationMembers(organizationId)).find(m => m.userId === userId);
      const isSuperAdmin = hasAdminAccess(user);
      const isOrgAdmin = membership?.role === 'org_admin' || membership?.role === 'owner';
      const isApprover = userResource?.isApprover === true;

      if (!isSuperAdmin && !isOrgAdmin && !isApprover) {
        return res.status(403).json({ message: 'Not authorized to view team timesheets' });
      }

      const entriesWithDetails = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);

      const enrichedEntries = entriesWithDetails.map(({ entry, task, project, resource }) => {
        return { ...entry, task, project, resource };
      });

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting team timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get team timesheet entries' : classified.message });
    }
  });

  // Get timesheet entries for approval (managers/approvers)
  apiRoute(app, 'get', '/api/timesheets/approval', {
    tag: 'Timesheets',
    summary: 'Get entries pending approval',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('status', false, 'Filter by status')],
    responses: { ...r200('Pending approvals', arrOf('TimesheetEntry')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const status = req.query.status as string;

      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      const isApprover = userResource?.isApprover === true;
      
      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      const entriesWithDetails = await storage.getTimesheetEntriesForApprovalWithDetails(organizationId, status);
      
      let scopedEntries = entriesWithDetails;
      if (!isApprover && activeDelegations.length > 0) {
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        scopedEntries = entriesWithDetails.filter(({ entry }) => {
          const entryResource = resources.find(r => r.id === entry.resourceId);
          return entryResource?.managerId && delegatorIds.includes(entryResource.managerId);
        });
      }

      const enrichedEntries = scopedEntries.map(({ entry, task, project, resource }) => {
        return { ...entry, task, project, resource };
      });

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting timesheet entries for approval:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet entries for approval' : classified.message });
    }
  });

  // Get tasks assigned to current user
  apiRoute(app, 'get', '/api/timesheets/assigned-tasks', {
    tag: 'Timesheets',
    summary: 'Get tasks assigned to current user for time logging',
    responses: { ...r200('Assigned tasks', ref('TimesheetEntry')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Find the resource for this user
      const resources = await storage.getResources(organizationId);
      let userResource = resources.find(r => r.userId === userId);

      if (!userResource) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          const resourceByEmail = resources.find(r => 
            r.email?.toLowerCase() === user.email?.toLowerCase() && !r.userId
          );
          if (resourceByEmail) {
            await storage.updateResource(resourceByEmail.id, { userId });
            userResource = { ...resourceByEmail, userId };
            console.log(`Auto-linked resource ${resourceByEmail.id} to user ${userId} by email ${user.email}`);
          }
        }
      }

      if (!userResource) {
        return res.json([]);
      }

      // Single optimized query with JOINs - replaces N+1 queries
      // Returns { task, project }[] so project is already included
      // Pass userId to also include tasks where user is the ownerId
      const assignedTasks = await storage.getAssignedTasksForResource(userResource.id, organizationId, userId);

      // Optional calendar-aware planned hours window. Callers pass
      // `from`/`to` (YYYY-MM-DD) to get a per-task per-date map of planned
      // hours for that window so the Timesheets grid can render a reference
      // "Planned" row beneath each task row. Skipped entirely when params
      // are absent so the legacy callers stay on the cheap codepath.
      const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
      const toRaw = typeof req.query.to === "string" ? req.query.to : null;
      // When either of `from`/`to` is supplied, both must be valid and
      // `from <= to`. We return 400 on bad input rather than silently
      // dropping the planned-hours payload, so client bugs are surfaced.
      if ((fromRaw && !toRaw) || (toRaw && !fromRaw)) {
        return res.status(400).json({ message: 'Both `from` and `to` are required when requesting planned hours' });
      }
      let plannedRange: { start: Date; end: Date } | null = null;
      if (fromRaw && toRaw) {
        const dateRe = /^\d{4}-\d{2}-\d{2}/;
        if (!dateRe.test(fromRaw) || !dateRe.test(toRaw)) {
          return res.status(400).json({ message: '`from` and `to` must be YYYY-MM-DD' });
        }
        const [fy, fm, fd] = fromRaw.slice(0, 10).split("-").map(Number);
        const [ty, tm, td] = toRaw.slice(0, 10).split("-").map(Number);
        const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
        const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return res.status(400).json({ message: 'Invalid `from`/`to` date' });
        }
        if (start > end) {
          return res.status(400).json({ message: '`from` must be on or before `to`' });
        }
        plannedRange = { start, end };
      }

      let plannedByTaskId: Map<number, Record<string, number>> = new Map();
      if (plannedRange) {
        const calStorage = await import("../storage/calendarStorage");
        const { computePlannedHoursByDate } = await import("@shared/lib/assignmentEstimation");

        // Per-request caches: project calendar by projectId, resource
        // calendar by calendarId, availability by resourceId. Each is
        // resolved at most once even when many tasks share them.
        const projCalCache = new Map<number, Awaited<ReturnType<typeof calStorage.getResolvedCalendarForProject>>>();
        const resourceCalCache = new Map<number, Awaited<ReturnType<typeof calStorage.loadResolvedCalendar>>>();
        const availabilityCache = new Map<number, Awaited<ReturnType<typeof storage.getResourceAvailability>>>();
        const loadResourceCalendar = async (calendarId: number) => {
          if (resourceCalCache.has(calendarId)) return resourceCalCache.get(calendarId)!;
          const cal = await calStorage.loadResolvedCalendar(calendarId);
          resourceCalCache.set(calendarId, cal);
          return cal;
        };
        const loadResourceAvailability = async (resourceId: number) => {
          if (availabilityCache.has(resourceId)) return availabilityCache.get(resourceId)!;
          const rows = await storage.getResourceAvailability(resourceId);
          availabilityCache.set(resourceId, rows);
          return rows as any;
        };

        for (const { task } of assignedTasks) {
          if (!task.startDate || !task.endDate) continue;
          const [sy, sm, sd] = String(task.startDate).slice(0, 10).split("-").map(Number);
          const [ey, em, ed] = String(task.endDate).slice(0, 10).split("-").map(Number);
          if (!sy || !ey) continue;
          const taskStart = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
          const taskEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999);
          // Skip when the task range doesn't intersect the requested window.
          if (taskEnd < plannedRange.start || taskStart > plannedRange.end) continue;

          // Planned hours are personal: only count the current user's own
          // assignment on the task. Tasks where the user is the owner but
          // not an assignee (still surfaced by getAssignedTasksForResource)
          // legitimately show 0 planned hours.
          const allAssignments = await storage.getTaskResourceAssignments(task.id);
          const assignments = allAssignments.filter(a => a.resourceId === userResource!.id);
          if (assignments.length === 0) continue;

          let projCal: Awaited<ReturnType<typeof calStorage.getResolvedCalendarForProject>>;
          if (projCalCache.has(task.projectId)) {
            projCal = projCalCache.get(task.projectId)!;
          } else {
            projCal = await calStorage.getResolvedCalendarForProject(task.projectId);
            projCalCache.set(task.projectId, projCal);
          }

          const planned = await computePlannedHoursByDate({
            projCal,
            assignments: assignments.map(a => ({
              resourceId: a.resourceId,
              calendarId: a.resource?.calendarId ?? null,
              allocationPercentage: Number(a.allocationPercentage),
            })),
            taskStart,
            taskEnd,
            rangeStart: plannedRange.start,
            rangeEnd: plannedRange.end,
            loadResourceCalendar,
            loadResourceAvailability,
          });
          if (Object.keys(planned).length > 0) {
            plannedByTaskId.set(task.id, planned);
          }
        }
      }

      const result = assignedTasks.map(item => ({
        ...item,
        timesheetLocked: !!(item.task.timesheetBlocked || item.project.timesheetBlocked),
        ...(plannedRange ? { plannedHoursByDate: plannedByTaskId.get(item.task.id) ?? {} } : {}),
      }));

      res.json(result);
    } catch (error) {
      console.error('Error getting assigned tasks:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get assigned tasks' : classified.message });
    }
  });

  // Get current user's resource record
  apiRoute(app, 'get', '/api/timesheets/current-resource', {
    tag: 'Timesheets',
    summary: 'Get current user resource for timesheets',
    responses: {
      ...r200('Current resource (resource is null when the user has no linked resource)', {
        type: 'object',
        properties: {
          resource: {
            oneOf: [ref('Resource'), { type: 'null' }],
            description: 'The resource record linked to the current user, or null when no link exists.',
          },
          reason: {
            type: ['string', 'null'],
            enum: ['no_match', null],
            description: "Set to 'no_match' when no linked resource was found; null otherwise.",
          },
        },
        required: ['resource', 'reason'],
      }),
      ...authRes,
    },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      let userResource = resources.find(r => r.userId === userId);

      if (!userResource) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          const resourceByEmail = resources.find(r => 
            r.email?.toLowerCase() === user.email?.toLowerCase() && !r.userId
          );
          if (resourceByEmail) {
            await storage.updateResource(resourceByEmail.id, { userId });
            userResource = { ...resourceByEmail, userId };
            console.log(`Auto-linked resource ${resourceByEmail.id} to user ${userId} by email ${user.email}`);
          }
        }
      }

      if (!userResource) {
        return res.json({ resource: null, reason: 'no_match' });
      }

      res.json({ resource: userResource, reason: null });
    } catch (error) {
      console.error('Error getting current resource:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get current resource' : classified.message });
    }
  });

  // Helper: check if date is in a closed period respecting grace period
  async function isDateInClosedPeriodWithGrace(orgId: number, entryDate: string): Promise<{ closed: boolean; periodName?: string }> {
    const closedPeriods = await storage.getClosedPeriodsForDateRange(orgId, entryDate, entryDate);
    if (closedPeriods.length === 0) return { closed: false };

    const settings = await getEffectiveTimesheetSettings(orgId);
    const graceDays = settings?.gracePeriodDays || 0;

    if (graceDays > 0) {
      const now = new Date();
      for (const period of closedPeriods) {
        if (period.closedAt) {
          const graceEnd = new Date(period.closedAt);
          graceEnd.setDate(graceEnd.getDate() + graceDays);
          if (now <= graceEnd) {
            return { closed: false };
          }
        }
      }
    }

    return { closed: true, periodName: closedPeriods[0]?.name };
  }

  // Helper: log timesheet audit event
  const DEFAULT_TIMESHEET_SETTINGS = {
    mandatoryNotes: false,
    maxWeeklyHours: '50',
    minWeeklyHours: '0',
    overtimeThreshold: '40',
    gracePeriodDays: 0,
  };

  async function getEffectiveTimesheetSettings(organizationId: number) {
    const settings = await storage.getTimesheetSettings(organizationId);
    return {
      mandatoryNotes: settings?.mandatoryNotes ?? DEFAULT_TIMESHEET_SETTINGS.mandatoryNotes,
      maxWeeklyHours: settings?.maxWeeklyHours ?? DEFAULT_TIMESHEET_SETTINGS.maxWeeklyHours,
      minWeeklyHours: settings?.minWeeklyHours ?? DEFAULT_TIMESHEET_SETTINGS.minWeeklyHours,
      overtimeThreshold: settings?.overtimeThreshold ?? DEFAULT_TIMESHEET_SETTINGS.overtimeThreshold,
      gracePeriodDays: settings?.gracePeriodDays ?? DEFAULT_TIMESHEET_SETTINGS.gracePeriodDays,
    };
  }


    async function hasTimesheetAdminAccess(userId: string, organizationId: number): Promise<boolean> {
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (userResource?.isApprover) return true;
      const user = await storage.getUser(userId);
      if (hasAdminAccess(user)) return true;
      const members = await storage.getOrganizationMembers(organizationId);
      const membership = members.find(m => m.userId === userId);
      if (membership?.role === 'org_admin' || membership?.role === 'owner') return true;
      return false;
    }
  
  function getWeekBounds(entryDate: string): { startDate: string; endDate: string } {
    const d = new Date(entryDate + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    return { startDate: fmt(monday), endDate: fmt(sunday) };
  }

  async function checkWeeklyHourLimits(
    userId: string,
    organizationId: number,
    entryDate: string,
    newHours: number,
    existingEntryId?: number,
  ): Promise<{ ok: boolean; message?: string }> {
    const settings = await getEffectiveTimesheetSettings(organizationId);
    const maxHours = Number(settings.maxWeeklyHours);
    if (!maxHours) return { ok: true };
    const { startDate, endDate } = getWeekBounds(entryDate);
    const entries = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
    let weekTotal = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);

    if (existingEntryId) {
      const existing = entries.find(e => e.id === existingEntryId);
      if (existing) {
        weekTotal -= Number(existing.hours || 0);
      }
    }

    weekTotal += newHours;
    if (weekTotal > maxHours) {
      return { ok: false, message: `Adding ${newHours}h would bring weekly total to ${weekTotal}h, exceeding the ${maxHours}h maximum` };
    }
    return { ok: true };
  }

  async function logTimesheetAudit(params: {
    organizationId: number;
    entryId?: number;
    action: string;
    actorId: string;
    targetUserId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await storage.createTimesheetAuditLog({
        organizationId: params.organizationId,
        entryId: params.entryId ?? null,
        action: params.action,
        actorId: params.actorId,
        targetUserId: params.targetUserId ?? null,
        before: params.before ?? null,
        after: params.after ?? null,
        metadata: params.metadata ?? null,
      });
    } catch (e) {
      console.error('Failed to write timesheet audit log:', e);
    }
  }

  // Create timesheet entry
  apiRoute(app, 'post', '/api/timesheets', {
    tag: 'Timesheets',
    summary: 'Create timesheet entry',
    requestBody: body(ref('TimesheetEntry')),
    responses: { ...r201('Timesheet entry created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, taskId, projectId, entryDate, hours, notes, resourceId } = req.body;

      if (!organizationId || !taskId || !projectId || !entryDate || hours === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Validate hours value
      const hoursNum = parseFloat(hours);
      if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
        return res.status(400).json({ message: 'Hours must be between 0 and 24' });
      }

      // Enforce mandatory notes
      const settings = await getEffectiveTimesheetSettings(organizationId);
      if (settings?.mandatoryNotes && (!notes || !notes.trim())) {
        return res.status(400).json({ message: 'Notes are required for all timesheet entries' });
      }

      // Enforce weekly hour limits on create
      const weekLimitCheck = await checkWeeklyHourLimits(userId, organizationId, entryDate, hoursNum);
      if (!weekLimitCheck.ok) {
        return res.status(400).json({ message: weekLimitCheck.message });
      }

      // Verify user is assigned to this task
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource) {
        return res.status(403).json({ message: 'You are not a resource in this organization' });
      }

      const assignments = await storage.getTaskResourceAssignments(taskId);
      const isAssignedViaResource = assignments.some(a => a.resourceId === userResource.id);
      const task = await storage.getTask(taskId);
      const isOwner = task?.ownerId === userId;
      
      if (!isAssignedViaResource && !isOwner) {
        return res.status(403).json({ message: 'You are not assigned to this task' });
      }

      if (task?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this task' });
      }
      
      const project = await storage.getProject(projectId);
      if (project?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this project' });
      }

      // Check if entry date is in a closed period (with grace period)
      const periodCheck = await isDateInClosedPeriodWithGrace(organizationId, entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot create entries in a closed period' });
      }

      const entry = await storage.createTimesheetEntry({
        organizationId,
        userId,
        resourceId: userResource.id,
        taskId,
        projectId,
        entryDate,
        hours: Number(hours),
        notes,
        status: 'Draft',
      });

      await logTimesheetAudit({
        organizationId,
        entryId: entry.id,
        action: 'create',
        actorId: userId,
        after: { hours: Number(hours), notes, taskId, projectId, entryDate },
      });

      invalidateOrganizationContextCache(organizationId);

      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create timesheet entry' : classified.message });
    }
  });

  // Bulk upsert timesheet entries
  apiRoute(app, 'post', '/api/timesheets/bulk', {
    tag: 'Timesheets',
    summary: 'Create/update timesheet entries in bulk',
    requestBody: body({ type: 'object', properties: { entries: { type: 'array', items: ref('TimesheetEntry') } } }),
    responses: { ...r201('Timesheet entries created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { entries } = req.body;
      if (!entries || !Array.isArray(entries)) {
        return res.status(400).json({ message: 'entries array is required' });
      }

      const organizationId = entries[0]?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource) {
        return res.status(403).json({ message: 'You are not a resource in this organization' });
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);

      const taskAssignmentCache: Record<number, boolean> = {};
      const validateTaskAssignment = async (taskId: number): Promise<boolean> => {
        if (taskAssignmentCache[taskId] !== undefined) {
          return taskAssignmentCache[taskId];
        }
        const assignments = await storage.getTaskResourceAssignments(taskId);
        const isAssignedViaResource = assignments.some(a => a.resourceId === userResource.id);
        if (isAssignedViaResource) {
          taskAssignmentCache[taskId] = true;
          return true;
        }
        const task = await storage.getTask(taskId);
        const isOwner = task?.ownerId === userId;
        taskAssignmentCache[taskId] = isOwner;
        return isOwner;
      };

      const taskBlockedCache: Record<number, boolean> = {};
      const projectBlockedCache: Record<number, boolean> = {};
      
      const isTaskOrProjectBlocked = async (taskId: number, projectId: number): Promise<boolean> => {
        if (taskBlockedCache[taskId] === undefined) {
          const task = await storage.getTask(taskId);
          taskBlockedCache[taskId] = task?.timesheetBlocked || false;
        }
        if (taskBlockedCache[taskId]) return true;
        
        if (projectBlockedCache[projectId] === undefined) {
          const project = await storage.getProject(projectId);
          projectBlockedCache[projectId] = project?.timesheetBlocked || false;
        }
        return projectBlockedCache[projectId];
      };

      const closedPeriodCache: Record<string, boolean> = {};
      const isDateClosed = async (entryDate: string): Promise<boolean> => {
        if (closedPeriodCache[entryDate] !== undefined) {
          return closedPeriodCache[entryDate];
        }
        const check = await isDateInClosedPeriodWithGrace(organizationId, entryDate);
        closedPeriodCache[entryDate] = check.closed;
        return check.closed;
      };

      const results = [];
      const errors: { index: number; taskId: number; entryDate: string; message: string }[] = [];

      const maxHours = Number(settings.maxWeeklyHours);
      const weeklyPayloadAccum: Record<string, number> = {};

      for (let idx = 0; idx < entries.length; idx++) {
        const entry = entries[idx];
        const hoursNum = parseFloat(entry.hours);
        if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
          errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Hours must be between 0 and 24' });
          continue;
        }

        if (settings.mandatoryNotes && (!entry.notes || !String(entry.notes).trim())) {
          errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Notes are required for all timesheet entries' });
          continue;
        }

        if (hoursNum > 0 && maxHours) {
          const { startDate: weekStart, endDate: weekEnd } = getWeekBounds(entry.entryDate);
          const weekKey = weekStart;

          if (!(weekKey in weeklyPayloadAccum)) {
            const existingEntries = await storage.getTimesheetEntries(userId, organizationId, weekStart, weekEnd);
            const existingIds = entries.filter(e => e.id).map(e => e.id);
            weeklyPayloadAccum[weekKey] = existingEntries
              .filter(e => !existingIds.includes(e.id))
              .reduce((sum, e) => sum + Number(e.hours || 0), 0);
          }

          const projectedTotal = weeklyPayloadAccum[weekKey] + hoursNum;
          if (projectedTotal > maxHours) {
            errors.push({
              index: idx,
              taskId: entry.taskId,
              entryDate: entry.entryDate,
              message: `Weekly hours would exceed limit of ${maxHours}h (total: ${projectedTotal.toFixed(1)}h)`,
            });
            continue;
          }
          weeklyPayloadAccum[weekKey] += hoursNum;
        }

        if (entry.id) {
          const existing = await storage.getTimesheetEntry(entry.id);
          if (!existing) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Entry not found' });
            continue;
          }
          
          if (existing.userId !== userId) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'You do not own this entry' });
            continue;
          }
          
          if (existing.status !== 'Draft' && existing.status !== 'Rejected') {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: `Entry is ${existing.status} and cannot be edited` });
            continue;
          }
          
          const isBlocked = await isTaskOrProjectBlocked(existing.taskId, existing.projectId);
          if (isBlocked) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Task or project is blocked for timesheet entries' });
            continue;
          }

          const isPeriodClosed = await isDateClosed(existing.entryDate);
          if (isPeriodClosed) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'This date is in a closed period' });
            continue;
          }
          
          const beforeSnapshot = { hours: existing.hours, notes: existing.notes };
          const updated = await storage.updateTimesheetEntry(entry.id, {
            hours: hoursNum,
            notes: entry.notes,
          });
          results.push(updated);

          await logTimesheetAudit({
            organizationId,
            entryId: entry.id,
            action: 'update',
            actorId: userId,
            before: beforeSnapshot,
            after: { hours: hoursNum, notes: entry.notes },
          });
        } else if (hoursNum > 0) {
          const isAssigned = await validateTaskAssignment(entry.taskId);
          if (!isAssigned) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'You are not assigned to this task' });
            continue;
          }
          
          const isBlocked = await isTaskOrProjectBlocked(entry.taskId, entry.projectId);
          if (isBlocked) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Task or project is blocked for timesheet entries' });
            continue;
          }

          const isPeriodClosed = await isDateClosed(entry.entryDate);
          if (isPeriodClosed) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'This date is in a closed period' });
            continue;
          }
          
          const existingEntry = await storage.findTimesheetEntry(
            userResource.id, 
            entry.taskId, 
            entry.entryDate
          );
          
          if (existingEntry) {
            if (existingEntry.status === 'Draft' || existingEntry.status === 'Rejected') {
              const beforeSnapshot = { hours: existingEntry.hours, notes: existingEntry.notes };
              const updated = await storage.updateTimesheetEntry(existingEntry.id, {
                hours: hoursNum,
                notes: entry.notes,
              });
              results.push(updated);

              await logTimesheetAudit({
                organizationId,
                entryId: existingEntry.id,
                action: 'update',
                actorId: userId,
                before: beforeSnapshot,
                after: { hours: hoursNum, notes: entry.notes },
              });
            } else {
              errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: `Entry is ${existingEntry.status} and cannot be edited` });
            }
            continue;
          }
          
          const created = await storage.createTimesheetEntry({
            organizationId: entry.organizationId,
            userId,
            resourceId: userResource.id,
            taskId: entry.taskId,
            projectId: entry.projectId,
            entryDate: entry.entryDate,
            hours: Number(entry.hours),
            notes: entry.notes,
            status: 'Draft',
          });
          results.push(created);

          await logTimesheetAudit({
            organizationId,
            entryId: created.id,
            action: 'create',
            actorId: userId,
            after: { hours: Number(entry.hours), notes: entry.notes, taskId: entry.taskId, entryDate: entry.entryDate },
          });
        }
      }

      if (errors.length > 0 && results.length === 0) {
        return res.status(400).json({ message: 'All entries failed validation', errors, entries: [] });
      }

      if (results.length > 0) {
        invalidateOrganizationContextCache(organizationId);
      }

      res.status(201).json({ entries: results, errors });
    } catch (error) {
      console.error('Error bulk upserting timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to save timesheet entries' : classified.message });
    }
  });

  // Update timesheet entry
  apiRoute(app, 'put', '/api/timesheets/:id', {
    tag: 'Timesheets',
    summary: 'Update timesheet entry',
    parameters: [pathId()],
    requestBody: body(ref('TimesheetEntry')),
    responses: { ...r200('Entry updated', ref('TimesheetEntry')), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      if (entry.userId !== userId) {
        return res.status(403).json({ message: 'You can only edit your own timesheet entries' });
      }

      if (entry.status !== 'Draft') {
        return res.status(400).json({ message: 'Only draft entries can be edited' });
      }

      const task = await storage.getTask(entry.taskId);
      if (task?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this task' });
      }
      
      const project = await storage.getProject(entry.projectId);
      if (project?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this project' });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot edit entries in a closed period' });
      }

      const { hours, notes } = req.body;
      
      if (hours !== undefined) {
        const hoursNum = parseFloat(hours);
        if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
          return res.status(400).json({ message: 'Hours must be between 0 and 24' });
        }
      }

      const settings = await getEffectiveTimesheetSettings(entry.organizationId);
      const effectiveNotes = notes !== undefined ? notes : entry.notes;
      const effectiveHours = hours !== undefined ? parseFloat(hours) : Number(entry.hours || 0);
      if (settings?.mandatoryNotes && (!effectiveNotes || !effectiveNotes.trim())) {
        return res.status(400).json({ message: 'Notes are required for all timesheet entries' });
      }

      if (hours !== undefined) {
        const weekLimitCheck = await checkWeeklyHourLimits(userId, entry.organizationId, entry.entryDate, effectiveHours, id);
        if (!weekLimitCheck.ok) {
          return res.status(400).json({ message: weekLimitCheck.message });
        }
      }

      const beforeSnapshot = { hours: entry.hours, notes: entry.notes };
      const updated = await storage.updateTimesheetEntry(id, {
        hours: hours !== undefined ? parseFloat(hours) : undefined,
        notes,
      });

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'update',
        actorId: userId,
        before: beforeSnapshot,
        after: { hours: hours !== undefined ? String(parseFloat(hours)) : entry.hours, notes: notes ?? entry.notes },
      });

      invalidateOrganizationContextCache(entry.organizationId);

      res.json(updated);
    } catch (error) {
      console.error('Error updating timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update timesheet entry' : classified.message });
    }
  });

  // Delete timesheet entry
  apiRoute(app, 'delete', '/api/timesheets/:id', {
    tag: 'Timesheets',
    summary: 'Delete timesheet entry',
    parameters: [pathId()],
    responses: { ...r204('Entry deleted'), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      if (entry.userId !== userId) {
        return res.status(403).json({ message: 'You can only delete your own timesheet entries' });
      }

      if (entry.status !== 'Draft') {
        return res.status(400).json({ message: 'Only draft entries can be deleted' });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot delete entries in a closed period' });
      }

      await storage.deleteTimesheetEntry(id);

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'delete',
        actorId: userId,
        before: { hours: entry.hours, notes: entry.notes, taskId: entry.taskId, entryDate: entry.entryDate },
      });

      invalidateOrganizationContextCache(entry.organizationId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete timesheet entry' : classified.message });
    }
  });

  // Submit timesheet week for approval
  apiRoute(app, 'post', '/api/timesheets/submit-week', {
    tag: 'Timesheets',
    summary: 'Submit a week of timesheets for approval',
    requestBody: body({ type: 'object', properties: { weekStartDate: { type: 'string', format: 'date' } } }),
    responses: { ...r200('Week submitted', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, startDate, endDate } = req.body;
      
      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const closedPeriods = await storage.getClosedPeriodsForDateRange(organizationId, startDate, endDate);
      if (closedPeriods.length > 0) {
        const settings = await getEffectiveTimesheetSettings(organizationId);
        const graceDays = settings?.gracePeriodDays || 0;
        let allInGrace = true;
        if (graceDays > 0) {
          const now = new Date();
          for (const period of closedPeriods) {
            if (period.closedAt) {
              const graceEnd = new Date(period.closedAt);
              graceEnd.setDate(graceEnd.getDate() + graceDays);
              if (now > graceEnd) { allInGrace = false; break; }
            } else { allInGrace = false; break; }
          }
        } else { allInGrace = false; }
        if (!allInGrace) {
          return res.status(403).json({ 
            message: 'Cannot submit entries in a closed period. Some dates in this week are locked.',
            closedPeriods: closedPeriods.map(p => p.name)
          });
        }
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);

      if (settings?.mandatoryNotes) {
        const draftEntries = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
        const drafts = draftEntries.filter(e => e.status === 'Draft');
        const missingNotes = drafts.filter(e => !e.notes || !e.notes.trim());
        if (missingNotes.length > 0) {
          return res.status(400).json({ message: 'All timesheet entries must have notes before submission' });
        }
      }

      const allEntriesForHourCheck = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
      const totalHours = allEntriesForHourCheck.reduce((sum, e) => sum + Number(e.hours || 0), 0);

      if (settings?.maxWeeklyHours) {
        const maxHours = Number(settings.maxWeeklyHours);
        if (totalHours > maxHours) {
          return res.status(400).json({ message: `Weekly hours (${totalHours}) exceed maximum allowed (${maxHours})` });
        }
      }

      if (settings?.minWeeklyHours) {
        const minHours = Number(settings.minWeeklyHours);
        if (totalHours < minHours) {
          return res.status(400).json({ message: `Weekly hours (${totalHours}) are below minimum required (${minHours})` });
        }
      }

      const preSubmitEntries = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
      const draftEntries = preSubmitEntries.filter(e => e.status === 'Draft');

      await storage.submitTimesheetWeek(userId, organizationId, startDate, endDate);

      for (const entry of draftEntries) {
        await logTimesheetAudit({
          organizationId,
          entryId: entry.id,
          action: 'submit',
          actorId: userId,
          before: { status: 'Draft', hours: entry.hours, notes: entry.notes },
          after: { status: 'Submitted', hours: entry.hours, notes: entry.notes },
          metadata: { startDate, endDate, taskId: entry.taskId, entryDate: entry.entryDate },
        });
      }

      invalidateOrganizationContextCache(organizationId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error submitting timesheet week:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to submit timesheet week' : classified.message });
    }
  });

  // Bulk approve timesheet entries (single DB round-trip)
  apiRoute(app, 'post', '/api/timesheets/bulk-approve', {
    tag: 'Timesheets',
    summary: 'Bulk approve multiple timesheet entries',
    requestBody: body({ type: 'object', properties: { entryIds: { type: 'array', items: { type: 'integer' } } }, required: ['entryIds'] }),
    responses: { ...r200('Entries approved', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { ids, organizationId } = req.body as { ids: number[]; organizationId: number };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'ids must be a non-empty array' });
      }
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      const isApprover = userResource?.isApprover === true;
      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      if (!isApprover && activeDelegations.length > 0) {
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        for (const entryId of ids) {
          const entry = await storage.getTimesheetEntry(entryId);
          if (entry) {
            const entryResource = resources.find(r => r.id === entry.resourceId);
            if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
              return res.status(403).json({ message: `Entry ${entryId} is outside your delegated approval scope` });
            }
          }
        }
      }

      const approved = await storage.bulkApproveTimesheetEntries(ids, userId, organizationId);

      for (const entry of approved) {
        await logTimesheetAudit({
          organizationId,
          entryId: entry.id,
          action: 'approve',
          actorId: userId,
          targetUserId: entry.userId,
          before: { status: 'Submitted' },
          after: { status: 'Approved' },
        });
      }

      if (approved.length > 0) {
        invalidateOrganizationContextCache(organizationId);
      }

      res.json({ approved: approved.length, entries: approved });
    } catch (error) {
      console.error('Error bulk approving timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to bulk approve timesheet entries' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/timesheets/:id/approve', {
    tag: 'Timesheets',
    summary: 'Approve a timesheet entry',
    parameters: [pathId()],
    responses: { ...r200('Entry approved', ref('TimesheetEntry')), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, entry.organizationId);
      const isApprover = userResource?.isApprover === true;
      
      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      if (!isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated approval scope' });
        }
      }

      if (entry.status !== 'Submitted') {
        return res.status(400).json({ message: `Cannot approve entry with status "${entry.status}". Only submitted entries can be approved.` });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot approve entries in a closed period' });
      }

      const updated = await storage.approveTimesheetEntry(id, userId);

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'approve',
        actorId: userId,
        targetUserId: entry.userId,
        before: { status: 'Submitted' },
        after: { status: 'Approved' },
      });

      invalidateOrganizationContextCache(entry.organizationId);

      res.json(updated);
    } catch (error) {
      console.error('Error approving timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to approve timesheet entry' : classified.message });
    }
  });

  // Reject timesheet entry
  apiRoute(app, 'post', '/api/timesheets/:id/reject', {
    tag: 'Timesheets',
    summary: 'Reject a timesheet entry',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { reason: { type: 'string' } } }, false),
    responses: { ...r200('Entry rejected', ref('TimesheetEntry')), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const { rejectionReason } = req.body;
      
      const entry = await storage.getTimesheetEntry(id);
      
      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, entry.organizationId);
      const isApprover = userResource?.isApprover === true;
      
      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to reject timesheets' });
      }

      if (!isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated approval scope' });
        }
      }

      if (entry.status !== 'Submitted') {
        return res.status(400).json({ message: `Cannot reject entry with status "${entry.status}". Only submitted entries can be rejected.` });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot reject entries in a closed period' });
      }

      const updated = await storage.rejectTimesheetEntry(id, rejectionReason || '', userId);

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'reject',
        actorId: userId,
        targetUserId: entry.userId,
        before: { status: 'Submitted' },
        after: { status: 'Rejected', rejectionReason: rejectionReason || '' },
      });

      invalidateOrganizationContextCache(entry.organizationId);

      res.json(updated);
    } catch (error) {
      console.error('Error rejecting timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to reject timesheet entry' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/timesheets/my-report', {
    tag: 'Timesheets',
    summary: 'Get current user timesheet report',
    parameters: [qStr('startDate'), qStr('endDate')],
    responses: { ...r200('My report', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const entriesWithDetails = await storage.getTimesheetEntriesWithDetails(userId, organizationId, startDate, endDate);

      const enrichedEntries = entriesWithDetails.map(({ entry, task, project }) => ({
        ...entry,
        task,
        project
      }));

      const totalHours = enrichedEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);

      const byStatus: Record<string, number> = {};
      const byProject: Record<string, { projectId: number; projectName: string; hours: number; entries: number }> = {};
      const byWeek: Record<string, number> = {};

      for (const entry of enrichedEntries) {
        const status = entry.status || 'Draft';
        byStatus[status] = (byStatus[status] || 0) + Number(entry.hours || 0);

        const projectKey = String(entry.projectId);
        if (!byProject[projectKey]) {
          byProject[projectKey] = {
            projectId: entry.projectId,
            projectName: entry.project?.name || 'Unknown',
            hours: 0,
            entries: 0
          };
        }
        byProject[projectKey].hours += Number(entry.hours || 0);
        byProject[projectKey].entries += 1;

        const entryDate = new Date(entry.entryDate + 'T00:00:00');
        const weekStart = new Date(entryDate);
        const day = weekStart.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        weekStart.setDate(weekStart.getDate() + diff);
        const weekKey = weekStart.toISOString().split('T')[0];
        byWeek[weekKey] = (byWeek[weekKey] || 0) + Number(entry.hours || 0);
      }

      res.json({
        totalHours,
        totalEntries: enrichedEntries.length,
        byStatus,
        byProject: Object.values(byProject).sort((a, b) => b.hours - a.hours),
        byWeek,
        entries: enrichedEntries
      });
    } catch (error) {
      console.error('Error getting timesheet report:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet report' : classified.message });
    }
  });

  // ===== Timesheet Periods (Period Closing/Locking) =====
  
  // Get all timesheet periods for organization (approvers only)
  apiRoute(app, 'get', '/api/timesheet-periods', {
    tag: 'Timesheets',
    summary: 'List timesheet periods',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Timesheet periods', arrOf('TimesheetPeriod')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Verify user belongs to this organization
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!userResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const periods = await storage.getTimesheetPeriods(organizationId);
      res.json(periods);
    } catch (error) {
      console.error('Error getting timesheet periods:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet periods' : classified.message });
    }
  });

  // Get closed periods for a date range (for checking if dates are editable)
  apiRoute(app, 'get', '/api/timesheet-periods/closed', {
    tag: 'Timesheets',
    summary: 'List closed timesheet periods',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', true), qStr('endDate', true)],
    responses: { ...r200('Closed periods', ref('TimesheetEntry')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const periods = await storage.getClosedPeriodsForDateRange(organizationId, startDate, endDate);
      const settings = await getEffectiveTimesheetSettings(organizationId);
      const graceDays = settings?.gracePeriodDays || 0;

      const periodsWithGrace = periods.map(p => {
        let inGracePeriod = false;
        let graceEndDate: string | null = null;
        if (graceDays > 0 && p.closedAt) {
          const graceEnd = new Date(p.closedAt);
          graceEnd.setDate(graceEnd.getDate() + graceDays);
          graceEndDate = graceEnd.toISOString();
          inGracePeriod = new Date() <= graceEnd;
        }
        return { ...p, inGracePeriod, graceEndDate, gracePeriodDays: graceDays };
      });

      res.json(periodsWithGrace);
    } catch (error) {
      console.error('Error getting closed periods:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get closed periods' : classified.message });
    }
  });

  // Create a new timesheet period (approvers only)
  apiRoute(app, 'post', '/api/timesheet-periods', {
    tag: 'Timesheets',
    summary: 'Create timesheet period',
    requestBody: body(ref('TimesheetPeriod')),
    responses: { ...r201('Period created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, name, startDate, endDate, notes } = req.body;
      
      if (!organizationId || !name || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, name, startDate, and endDate are required' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to manage timesheet periods' });
      }

      const period = await storage.createTimesheetPeriod({
        organizationId,
        name,
        startDate,
        endDate,
        notes,
        status: 'open',
        createdBy: userId,
      });
      
      res.status(201).json(period);
    } catch (error) {
      console.error('Error creating timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create timesheet period' : classified.message });
    }
  });

  // Close a timesheet period (approvers only)
  apiRoute(app, 'post', '/api/timesheet-periods/:id/close', {
    tag: 'Timesheets',
    summary: 'Close a timesheet period',
    parameters: [pathId()],
    responses: { ...r200('Period closed', ref('TimesheetEntry')), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const period = await storage.getTimesheetPeriod(id);
      
      if (!period) {
        return res.status(404).json({ message: 'Timesheet period not found' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(period.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!(await hasTimesheetAdminAccess(userId, period.organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to close timesheet periods' });
      }

      const updated = await storage.closeTimesheetPeriod(id, userId);
      res.json(updated);
    } catch (error) {
      console.error('Error closing timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to close timesheet period' : classified.message });
    }
  });

  // Reopen a timesheet period (approvers only)
  apiRoute(app, 'post', '/api/timesheet-periods/:id/reopen', {
    tag: 'Timesheets',
    summary: 'Reopen a closed timesheet period',
    parameters: [pathId()],
    responses: { ...r200('Period reopened', ref('TimesheetEntry')), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const period = await storage.getTimesheetPeriod(id);
      
      if (!period) {
        return res.status(404).json({ message: 'Timesheet period not found' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(period.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!(await hasTimesheetAdminAccess(userId, period.organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to reopen timesheet periods' });
      }

      const updated = await storage.reopenTimesheetPeriod(id, userId);
      res.json(updated);
    } catch (error) {
      console.error('Error reopening timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to reopen timesheet period' : classified.message });
    }
  });

  // Delete a timesheet period (approvers only)
  apiRoute(app, 'delete', '/api/timesheet-periods/:id', {
    tag: 'Timesheets',
    summary: 'Delete timesheet period',
    parameters: [pathId()],
    responses: { ...r200('Period deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const period = await storage.getTimesheetPeriod(id);
      
      if (!period) {
        return res.status(404).json({ message: 'Timesheet period not found' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(period.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      
      if (!(await hasTimesheetAdminAccess(userId, period.organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to delete timesheet periods' });
      }

      await storage.deleteTimesheetPeriod(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete timesheet period' : classified.message });
    }
  });

  // ===== Timesheet Settings (Org-level Policies) =====

  apiRoute(app, 'get', '/api/timesheet-settings', {
    tag: 'Timesheets',
    summary: 'Get timesheet settings',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Timesheet settings', ref('TimesheetSettings')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const settings = await storage.getTimesheetSettings(organizationId);
      res.json(settings || {
        organizationId,
        minWeeklyHours: "0",
        maxWeeklyHours: "50",
        overtimeThreshold: "40",
        gracePeriodDays: 0,
        mandatoryNotes: false,
      });
    } catch (error) {
      console.error('Error getting timesheet settings:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet settings' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/timesheet-settings', {
    tag: 'Timesheets',
    summary: 'Update timesheet settings',
    requestBody: body(ref('TimesheetSettings')),
    responses: { ...r200('Settings updated', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, minWeeklyHours, maxWeeklyHours, overtimeThreshold, gracePeriodDays, mandatoryNotes } = req.body;
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can manage timesheet settings' });
      }

      const settings = await storage.upsertTimesheetSettings({
        organizationId,
        minWeeklyHours: minWeeklyHours !== undefined ? Number(minWeeklyHours) : undefined,
        maxWeeklyHours: maxWeeklyHours !== undefined ? Number(maxWeeklyHours) : undefined,
        overtimeThreshold: overtimeThreshold !== undefined ? Number(overtimeThreshold) : undefined,
        gracePeriodDays: gracePeriodDays !== undefined ? Number(gracePeriodDays) : undefined,
        mandatoryNotes: mandatoryNotes !== undefined ? Boolean(mandatoryNotes) : undefined,
      });

      await logTimesheetAudit({
        organizationId,
        action: 'update_settings',
        actorId: userId,
        after: { minWeeklyHours, maxWeeklyHours, overtimeThreshold, gracePeriodDays, mandatoryNotes },
      });

      res.json(settings);
    } catch (error) {
      console.error('Error updating timesheet settings:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update timesheet settings' : classified.message });
    }
  });

  // ===== Timesheet Reminder Settings =====

  apiRoute(app, 'get', '/api/timesheet-reminder-settings', {
    tag: 'Timesheets',
    summary: 'Get timesheet reminder settings',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Reminder settings', ref('TimesheetReminderSettings')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const [settings] = await db.select()
        .from(timesheetReminderSettings)
        .where(eq(timesheetReminderSettings.organizationId, organizationId));

      res.json(settings || {
        organizationId,
        enabled: true,
        emailEnabled: true,
        notificationEnabled: true,
        submissionReminderDays: [4, 5, 8],
        approvalReminderDays: 2,
        escalationThresholdDays: 5,
        frequencyCap: 3,
        digestEnabled: true,
        digestDay: 1,
      });
    } catch (error) {
      console.error('Error getting reminder settings:', error);
      res.status(500).json({ message: 'Failed to get reminder settings' });
    }
  });

  apiRoute(app, 'put', '/api/timesheet-reminder-settings', {
    tag: 'Timesheets',
    summary: 'Update timesheet reminder settings',
    requestBody: body(ref('TimesheetReminderSettings')),
    responses: { ...r200('Reminder settings updated', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, enabled, emailEnabled, notificationEnabled, submissionReminderDays, approvalReminderDays, escalationThresholdDays, frequencyCap, digestEnabled, digestDay } = req.body;
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage reminder settings' });
      }

      const validDays = [4, 5, 8];
      const sanitized: Record<string, any> = {};
      if (enabled !== undefined) sanitized.enabled = Boolean(enabled);
      if (emailEnabled !== undefined) sanitized.emailEnabled = Boolean(emailEnabled);
      if (notificationEnabled !== undefined) sanitized.notificationEnabled = Boolean(notificationEnabled);
      if (submissionReminderDays !== undefined) {
        if (!Array.isArray(submissionReminderDays) || !submissionReminderDays.every((d: number) => validDays.includes(d))) {
          return res.status(400).json({ message: 'submissionReminderDays must be array of 4, 5, or 8' });
        }
        sanitized.submissionReminderDays = submissionReminderDays;
      }
      if (approvalReminderDays !== undefined) {
        const v = Number(approvalReminderDays);
        if (!Number.isInteger(v) || v < 1 || v > 14) return res.status(400).json({ message: 'approvalReminderDays must be 1-14' });
        sanitized.approvalReminderDays = v;
      }
      if (escalationThresholdDays !== undefined) {
        const v = Number(escalationThresholdDays);
        if (!Number.isInteger(v) || v < 1 || v > 30) return res.status(400).json({ message: 'escalationThresholdDays must be 1-30' });
        sanitized.escalationThresholdDays = v;
      }
      if (frequencyCap !== undefined) {
        const v = Number(frequencyCap);
        if (!Number.isInteger(v) || v < 1 || v > 10) return res.status(400).json({ message: 'frequencyCap must be 1-10' });
        sanitized.frequencyCap = v;
      }
      if (digestEnabled !== undefined) sanitized.digestEnabled = Boolean(digestEnabled);
      if (digestDay !== undefined) {
        const v = Number(digestDay);
        if (!Number.isInteger(v) || v < 1 || v > 5) return res.status(400).json({ message: 'digestDay must be 1-5 (Mon-Fri)' });
        sanitized.digestDay = v;
      }
      if (req.body.scheduledHour !== undefined) {
        const v = Number(req.body.scheduledHour);
        if (!Number.isInteger(v) || v < 0 || v > 23) return res.status(400).json({ message: 'scheduledHour must be 0-23' });
        sanitized.scheduledHour = v;
      }
      if (req.body.scheduledMinute !== undefined) {
        const v = Number(req.body.scheduledMinute);
        if (!Number.isInteger(v) || ![0, 15, 30, 45].includes(v)) return res.status(400).json({ message: 'scheduledMinute must be 0, 15, 30, or 45' });
        sanitized.scheduledMinute = v;
      }

      const [existing] = await db.select()
        .from(timesheetReminderSettings)
        .where(eq(timesheetReminderSettings.organizationId, organizationId));

      let result;
      if (existing) {
        [result] = await db.update(timesheetReminderSettings)
          .set({ ...sanitized, updatedAt: new Date() })
          .where(eq(timesheetReminderSettings.organizationId, organizationId))
          .returning();
      } else {
        [result] = await db.insert(timesheetReminderSettings)
          .values({ organizationId, ...sanitized })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error('Error updating reminder settings:', error);
      res.status(500).json({ message: 'Failed to update reminder settings' });
    }
  });

  apiRoute(app, 'post', '/api/timesheet-reminder-snooze', {
    tag: 'Timesheets',
    summary: 'Snooze timesheet reminder',
    requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, durationMinutes: { type: 'integer' } }, required: ['organizationId'] }),
    responses: { ...r200('Reminder snoozed', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, weekStart, durationHours } = req.body;
      if (!organizationId || !weekStart || !durationHours) {
        return res.status(400).json({ message: 'organizationId, weekStart, and durationHours are required' });
      }

      const hours = Number(durationHours);
      if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
        return res.status(400).json({ message: 'durationHours must be between 1 and 168' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return res.status(400).json({ message: 'weekStart must be a valid date (YYYY-MM-DD)' });
      }

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const { snoozeReminder } = await import('../services/timesheetReminderEngine');
      await snoozeReminder(userId, organizationId, weekStart, hours);

      res.json({ success: true, snoozedUntil: new Date(Date.now() + Number(durationHours) * 60 * 60 * 1000) });
    } catch (error) {
      console.error('Error snoozing reminder:', error);
      res.status(500).json({ message: 'Failed to snooze reminder' });
    }
  });

  apiRoute(app, 'post', '/api/timesheet-reminder-send-now', {
    tag: 'Timesheets',
    summary: 'Send timesheet reminders now',
    requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' } }, required: ['organizationId'] }),
    responses: { ...r200('Reminders sent', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId } = req.body;
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins can trigger reminders' });
      }

      const { runTimesheetRemindersForOrg } = await import('../services/timesheetReminderEngine');
      const result = await runTimesheetRemindersForOrg(organizationId);

      const total = result.submissionReminders + result.approvalReminders + result.escalations + result.digestsSent;
      res.json({
        success: true,
        sent: total,
        breakdown: {
          submissionReminders: result.submissionReminders,
          approvalReminders: result.approvalReminders,
          escalations: result.escalations,
          digestsSent: result.digestsSent,
        },
        errors: result.errors,
      });
    } catch (error) {
      console.error('Error sending reminders now:', error);
      res.status(500).json({ message: 'Failed to send reminders' });
    }
  });

  // ===== Timesheet Audit Log =====

  apiRoute(app, 'get', '/api/timesheet-audit-log', {
    tag: 'Timesheets',
    summary: 'Get timesheet audit log',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', false), qStr('endDate', false), qStr('action', false), qInt('page', false), qInt('pageSize', false)],
    responses: { ...r200('Audit log entries', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can view audit logs' });
      }

      const entryId = req.query.entryId ? Number(req.query.entryId) : undefined;
      const actorId = req.query.actorId as string | undefined;
      const action = req.query.action as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const logs = await storage.getTimesheetAuditLogs(organizationId, { entryId, actorId, action, limit, offset });
      res.json(logs);
    } catch (error) {
      console.error('Error getting timesheet audit log:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get audit log' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/timesheet-audit-log/entry/:entryId', {
    tag: 'Timesheets',
    summary: 'Get audit log for a specific timesheet entry',
    parameters: [pathId('entryId')],
    responses: { ...r200('Entry audit log', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const entryId = Number(req.params.entryId);
      const entry = await storage.getTimesheetEntry(entryId);
      if (!entry) return res.status(404).json({ message: 'Entry not found' });

      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, entry.organizationId)) && entry.userId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const logs = await storage.getTimesheetAuditLogsForEntry(entryId);
      res.json(logs);
    } catch (error) {
      console.error('Error getting entry audit log:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get entry audit log' : classified.message });
    }
  });

  // ===== Proxy Timesheet Entry =====

  apiRoute(app, 'post', '/api/timesheets/proxy', {
    tag: 'Timesheets',
    summary: 'Create proxy timesheet entry on behalf of another user',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Proxy entry created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, targetResourceId, taskId, projectId, entryDate, hours, notes } = req.body;

      if (!organizationId || !targetResourceId || !taskId || !projectId || !entryDate || hours === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const resources = await storage.getResources(organizationId);
      const actorResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can create proxy entries' });
      }

      const targetResource = resources.find(r => r.id === targetResourceId);
      if (!targetResource) {
        return res.status(404).json({ message: 'Target resource not found' });
      }

      if (!targetResource.userId) {
        return res.status(400).json({ message: 'Target resource does not have an associated user account' });
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      if (task.timesheetBlocked) {
        return res.status(403).json({ message: 'This task is blocked for timesheet entries' });
      }
      if (project.timesheetBlocked) {
        return res.status(403).json({ message: 'This project is blocked for timesheet entries' });
      }

      const hoursNum = parseFloat(hours);
      if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
        return res.status(400).json({ message: 'Hours must be between 0 and 24' });
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);
      if (settings.mandatoryNotes && (!notes || !notes.trim())) {
        return res.status(400).json({ message: 'Notes are required for all timesheet entries' });
      }

      const weekLimitCheck = await checkWeeklyHourLimits(targetResource.userId, organizationId, entryDate, hoursNum);
      if (!weekLimitCheck.ok) {
        return res.status(400).json({ message: weekLimitCheck.message });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(organizationId, entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot create entries in a closed period' });
      }

      const entry = await storage.createTimesheetEntry({
        organizationId,
        userId: targetResource.userId!,
        resourceId: targetResourceId,
        taskId,
        projectId,
        entryDate,
        hours: hoursNum,
        notes,
        status: 'Draft',
        proxyUserId: userId,
      });

      await logTimesheetAudit({
        organizationId,
        entryId: entry.id,
        action: 'proxy_create',
        actorId: userId,
        targetUserId: targetResource.userId!,
        after: { hours: hoursNum, notes, taskId, projectId, entryDate },
        metadata: { proxyUserId: userId, targetResourceId },
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating proxy timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create proxy entry' : classified.message });
    }
  });

  // ===== Compliance Reporting =====

  apiRoute(app, 'get', '/api/timesheet-compliance', {
    tag: 'Timesheets',
    summary: 'Get timesheet compliance report',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', true), qStr('endDate', true)],
    responses: { ...r200('Compliance report', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;
      const resourceId = req.query.resourceId ? Number(req.query.resourceId) : null;
      const department = req.query.department ? String(req.query.department) : null;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const actorResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can view compliance reports' });
      }

      let allEntries = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);
      const allNonProjectEntries = await storage.getAllNonProjectTimeEntriesWithCategory(organizationId, startDate, endDate);

      if (projectId) {
        allEntries = allEntries.filter(({ entry }) => entry.projectId === projectId);
      }

      if (resourceId) {
        allEntries = allEntries.filter(({ entry }) => entry.resourceId === resourceId);
      }

      let activeResources = resources.filter(r => r.userId);
      if (resourceId) {
        activeResources = activeResources.filter(r => r.id === resourceId);
      }
      if (department) {
        const deptResourceIds = new Set(activeResources.filter(r => r.department === department).map(r => r.id));
        activeResources = activeResources.filter(r => deptResourceIds.has(r.id));
        allEntries = allEntries.filter(({ entry }) => deptResourceIds.has(entry.resourceId));
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);
      const overtimeThreshold = Number(settings?.overtimeThreshold || 40);
      const totalResources = activeResources.length;

      const byUser: Record<string, { userId: string; resourceName: string; totalHours: number; nonProjectHours: number; entries: number; submitted: number; approved: number; rejected: number; draft: number; overtime: boolean; hasNonProjectTime: boolean }> = {};

      for (const r of activeResources) {
        if (r.userId) {
          byUser[r.userId] = {
            userId: r.userId,
            resourceName: r.displayName,
            totalHours: 0,
            nonProjectHours: 0,
            entries: 0,
            submitted: 0,
            approved: 0,
            rejected: 0,
            draft: 0,
            overtime: false,
            hasNonProjectTime: false,
          };
        }
      }

      let totalSubmitted = 0, totalApproved = 0, totalRejected = 0, totalDraft = 0;
      let lateSubmissions = 0;
      let overdueApprovals = 0;
      const endDateObj = new Date(endDate + 'T23:59:59Z');
      const now = new Date();
      const approvalThresholdDays = 3;

      for (const { entry } of allEntries) {
        const u = byUser[entry.userId];
        if (u) {
          const hrs = Number(entry.hours || 0);
          u.totalHours += hrs;
          u.entries += 1;
          if (entry.status === 'Submitted') {
            u.submitted++; totalSubmitted++;
            if (entry.submittedAt && new Date(entry.submittedAt) > endDateObj) {
              lateSubmissions++;
            }
            const submittedDate = entry.submittedAt ? new Date(entry.submittedAt) : null;
            if (submittedDate) {
              const daysSinceSubmit = Math.floor((now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysSinceSubmit > approvalThresholdDays) {
                overdueApprovals++;
              }
            }
          }
          else if (entry.status === 'Approved') { u.approved++; totalApproved++; }
          else if (entry.status === 'Rejected') { u.rejected++; totalRejected++; }
          else {
            u.draft++; totalDraft++;
            if (now > endDateObj) {
              lateSubmissions++;
            }
          }
        }
      }

      for (const { entry } of allNonProjectEntries) {
        const u = byUser[entry.userId];
        if (u) {
          const hrs = Number(entry.hours || 0);
          u.totalHours += hrs;
          u.nonProjectHours += hrs;
          u.entries += 1;
          u.hasNonProjectTime = true;
          if (entry.status === 'Submitted') { u.submitted++; totalSubmitted++; }
          else if (entry.status === 'Approved') { u.approved++; totalApproved++; }
          else if (entry.status === 'Rejected') { u.rejected++; totalRejected++; }
          else { u.draft++; totalDraft++; }
        }
      }

      for (const u of Object.values(byUser)) {
        u.overtime = u.totalHours > overtimeThreshold;
      }

      const usersWithEntries = Object.values(byUser).filter(u => u.entries > 0).length;
      const usersWithNoEntries = totalResources - usersWithEntries;
      const submissionRate = totalResources > 0 ? Math.round((usersWithEntries / totalResources) * 100) : 0;

      const totalEntries = totalSubmitted + totalApproved + totalRejected + totalDraft;
      const approvalRate = (totalSubmitted + totalApproved + totalRejected) > 0
        ? Math.round((totalApproved / (totalSubmitted + totalApproved + totalRejected)) * 100)
        : 0;
      const rejectionRate = (totalSubmitted + totalApproved + totalRejected) > 0
        ? Math.round((totalRejected / (totalSubmitted + totalApproved + totalRejected)) * 100)
        : 0;

      const overtimeUsers = Object.values(byUser).filter(u => u.overtime).length;

      res.json({
        summary: {
          totalResources,
          usersWithEntries,
          usersWithNoEntries,
          submissionRate,
          totalEntries,
          totalSubmitted,
          totalApproved,
          totalRejected,
          totalDraft,
          approvalRate,
          rejectionRate,
          overtimeUsers,
          overtimeThreshold,
          lateSubmissions,
          overdueApprovals,
        },
        byUser: Object.values(byUser).sort((a, b) => b.totalHours - a.totalHours),
      });
    } catch (error) {
      console.error('Error getting compliance report:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get compliance report' : classified.message });
    }
  });

  // ===== Approval Delegations =====

  apiRoute(app, 'get', '/api/approval-delegations/is-delegate', {
    tag: 'Timesheets',
    summary: 'Check if current user is a delegate',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Delegate status', ref('TimesheetEntry')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      res.json({ isDelegate: activeDelegations.length > 0 });
    } catch (error) {
      console.error('Error checking delegate status:', error);
      res.status(500).json({ message: 'Failed to check delegate status' });
    }
  });

  apiRoute(app, 'get', '/api/approval-delegations', {
    tag: 'Timesheets',
    summary: 'List approval delegations',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Delegations', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!userResource?.isApprover && !(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const delegations = await storage.getApprovalDelegations(organizationId);
      const enriched = delegations.map(d => {
        const delegatorRes = resources.find(r => r.userId === d.delegatorId);
        const delegateRes = resources.find(r => r.userId === d.delegateId);
        return {
          ...d,
          delegatorName: delegatorRes?.displayName || 'Unknown',
          delegateName: delegateRes?.displayName || 'Unknown',
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error('Error getting delegations:', error);
      res.status(500).json({ message: 'Failed to get delegations' });
    }
  });

  apiRoute(app, 'post', '/api/approval-delegations', {
    tag: 'Timesheets',
    summary: 'Create approval delegation',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Delegation created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, delegateId, startDate, endDate } = req.body;
      if (!organizationId || !delegateId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, delegateId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!userResource?.isApprover) {
        return res.status(403).json({ message: 'Only approvers can create delegations' });
      }

      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({ message: 'Start date must be before or equal to end date' });
      }

      if (delegateId === userId) {
        return res.status(400).json({ message: 'Cannot delegate to yourself' });
      }

      const delegateResource = resources.find(r => r.userId === delegateId);
      if (!delegateResource) {
        return res.status(400).json({ message: 'Delegate must be a resource in the organization' });
      }

      const delegation = await storage.createApprovalDelegation({
        organizationId,
        delegatorId: userId,
        delegateId,
        startDate,
        endDate,
        isActive: true,
      });

      await logTimesheetAudit({
        organizationId,
        action: 'delegation_create',
        actorId: userId,
        after: { delegateId, startDate, endDate },
      });

      res.status(201).json(delegation);
    } catch (error) {
      console.error('Error creating delegation:', error);
      res.status(500).json({ message: 'Failed to create delegation' });
    }
  });

  apiRoute(app, 'post', '/api/approval-delegations/:id/revoke', {
    tag: 'Timesheets',
    summary: 'Revoke an approval delegation',
    parameters: [pathId()],
    responses: { ...r200('Delegation revoked', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = Number(req.params.id);
      const delegations = await storage.getApprovalDelegations(Number(req.body.organizationId || 0));
      const delegation = delegations.find(d => d.id === id);
      if (!delegation) return res.status(404).json({ message: 'Delegation not found' });

      if (delegation.delegatorId !== userId && !(await hasTimesheetAdminAccess(userId, delegation.organizationId))) {
        return res.status(403).json({ message: 'Not authorized to revoke this delegation' });
      }

      const revoked = await storage.revokeApprovalDelegation(id);

      await logTimesheetAudit({
        organizationId: delegation.organizationId,
        action: 'delegation_revoke',
        actorId: userId,
        before: { delegateId: delegation.delegateId, startDate: delegation.startDate, endDate: delegation.endDate },
      });

      res.json(revoked);
    } catch (error) {
      console.error('Error revoking delegation:', error);
      res.status(500).json({ message: 'Failed to revoke delegation' });
    }
  });

  // ===== Rejection Templates =====

  apiRoute(app, 'get', '/api/rejection-templates', {
    tag: 'Timesheets',
    summary: 'List rejection templates',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Rejection templates', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      if (!userResource?.isApprover && !isAdmin && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      let templates = await storage.getRejectionTemplates(organizationId);
      if (templates.length === 0) {
        const defaults = [
          { name: "Missing Details", text: "Please provide more details about the work performed, including specific tasks and deliverables.", category: "general" },
          { name: "Incorrect Hours", text: "The hours reported do not match the expected effort. Please review and correct.", category: "hours" },
          { name: "Wrong Project", text: "Time was logged against the wrong project or task. Please reassign to the correct project.", category: "assignment" },
          { name: "Missing Notes", text: "Notes are required for this entry. Please add a description of the work completed.", category: "general" },
          { name: "Exceeds Estimate", text: "Hours exceed the task estimate. Please provide justification or split across appropriate tasks.", category: "hours" },
          { name: "Duplicate Entry", text: "This appears to be a duplicate of another timesheet entry. Please review and remove if confirmed.", category: "general" },
        ];
        for (const d of defaults) {
          await storage.createRejectionTemplate({ organizationId, ...d });
        }
        templates = await storage.getRejectionTemplates(organizationId);
      }
      res.json(templates);
    } catch (error) {
      console.error('Error getting rejection templates:', error);
      res.status(500).json({ message: 'Failed to get rejection templates' });
    }
  });

  apiRoute(app, 'post', '/api/rejection-templates', {
    tag: 'Timesheets',
    summary: 'Create rejection template',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Template created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, name, text, category } = req.body;
      if (!organizationId || !name || !text) {
        return res.status(400).json({ message: 'organizationId, name, and text are required' });
      }

      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage rejection templates' });
      }

      const template = await storage.createRejectionTemplate({ organizationId, name, text, category });
      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating rejection template:', error);
      res.status(500).json({ message: 'Failed to create rejection template' });
    }
  });

  apiRoute(app, 'put', '/api/rejection-templates/:id', {
    tag: 'Timesheets',
    summary: 'Update rejection template',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Template updated', ref('TimesheetEntry')), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = Number(req.params.id);
      const template = await storage.getRejectionTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });

      if (!(await hasTimesheetAdminAccess(userId, template.organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage rejection templates' });
      }

      const { name, text, category, sortOrder } = req.body;
      const updated = await storage.updateRejectionTemplate(id, { name, text, category, sortOrder });
      res.json(updated);
    } catch (error) {
      console.error('Error updating rejection template:', error);
      res.status(500).json({ message: 'Failed to update rejection template' });
    }
  });

  apiRoute(app, 'delete', '/api/rejection-templates/:id', {
    tag: 'Timesheets',
    summary: 'Delete rejection template',
    parameters: [pathId()],
    responses: { ...r200('Template deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = Number(req.params.id);
      const template = await storage.getRejectionTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });

      if (!(await hasTimesheetAdminAccess(userId, template.organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage rejection templates' });
      }

      await storage.deleteRejectionTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting rejection template:', error);
      res.status(500).json({ message: 'Failed to delete rejection template' });
    }
  });

  // ===== Timesheet Comments =====

  apiRoute(app, 'get', '/api/timesheet-comments/:entryId', {
    tag: 'Timesheets',
    summary: 'List timesheet comments for an entry',
    parameters: [pathId('entryId')],
    responses: { ...r200('Comments', arrOf('TimesheetComment')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const entryId = Number(req.params.entryId);
      const entry = await storage.getTimesheetEntry(entryId);
      if (!entry) return res.status(404).json({ message: 'Entry not found' });

      const orgId = entry.organizationId;
      const resources = await storage.getResources(orgId);
      const userResource = resources.find(r => r.userId === userId);
      const isOwner = entry.userId === userId;
      const isAdmin = await hasTimesheetAdminAccess(userId, orgId);
      const isApprover = userResource?.isApprover === true;
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, orgId);
      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized to view comments for this entry' });
      }

      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated scope' });
        }
      }

      const comments = await storage.getTimesheetComments(entryId);
      res.json(comments);
    } catch (error) {
      console.error('Error getting comments:', error);
      res.status(500).json({ message: 'Failed to get comments' });
    }
  });

  apiRoute(app, 'post', '/api/timesheet-comments', {
    tag: 'Timesheets',
    summary: 'Add a comment to a timesheet entry',
    requestBody: body({ type: 'object', properties: { entryId: { type: 'integer' }, text: { type: 'string' }, commentType: { type: 'string', nullable: true } }, required: ['entryId', 'text'] }),
    responses: { ...r201('Comment created', ref('TimesheetComment')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { entryId, organizationId, text } = req.body;
      if (!entryId || !organizationId || !text?.trim()) {
        return res.status(400).json({ message: 'entryId, organizationId, and text are required' });
      }

      const entry = await storage.getTimesheetEntry(entryId);
      if (!entry) return res.status(404).json({ message: 'Entry not found' });

      if (entry.organizationId !== organizationId) {
        return res.status(400).json({ message: 'Organization mismatch' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isOwner = entry.userId === userId;
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);
      const isApprover = userResource?.isApprover === true;
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized to comment on this entry' });
      }

      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated scope' });
        }
      }

      const comment = await storage.createTimesheetComment({
        entryId,
        organizationId,
        userId,
        text: text.trim(),
        commentType: 'comment',
      });
      res.status(201).json(comment);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ message: 'Failed to create comment' });
    }
  });

  // ===== Team Review Dashboard =====

  apiRoute(app, 'get', '/api/timesheets/team-review', {
    tag: 'Timesheets',
    summary: 'Get team review dashboard data',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', true), qStr('endDate', true)],
    responses: { ...r200('Team review data', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isApprover = userResource?.isApprover === true;
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);

      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      const isDelegateApprover = activeDelegations.length > 0;

      if (!isApprover && !isAdmin && !isDelegateApprover) {
        return res.status(403).json({ message: 'Not authorized to view team review dashboard' });
      }

      const allEntries = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);
      const allNonProjectEntries = await storage.getAllNonProjectTimeEntriesWithCategory(organizationId, startDate, endDate);

      const managerUserIds = new Set<string>();
      managerUserIds.add(userId);
      if (isDelegateApprover) {
        for (const delegation of activeDelegations) {
          managerUserIds.add(delegation.delegatorId);
        }
      }

      let activeResources = resources.filter(r => r.isActive && !r.timesheetHidden && r.userId);
      if (!isAdmin) {
        activeResources = activeResources.filter(r => r.managerId && managerUserIds.has(r.managerId));
      }

      const teamData = activeResources.map(resource => {
        const userEntries = allEntries.filter(({ entry }) => entry.resourceId === resource.id);
        const userNonProjectEntries = allNonProjectEntries.filter(({ entry }) => entry.userId === resource.userId);
        const projectHours = userEntries.reduce((sum, { entry }) => sum + Number(entry.hours || 0), 0);
        const nonProjectHours = userNonProjectEntries.reduce((sum, { entry }) => sum + Number(entry.hours || 0), 0);
        const totalHours = projectHours + nonProjectHours;
        const totalEntryCount = userEntries.length + userNonProjectEntries.length;
        const draft = userEntries.filter(({ entry }) => entry.status === 'Draft').length + userNonProjectEntries.filter(({ entry }) => entry.status === 'Draft').length;
        const submitted = userEntries.filter(({ entry }) => entry.status === 'Submitted').length + userNonProjectEntries.filter(({ entry }) => entry.status === 'Submitted').length;
        const approved = userEntries.filter(({ entry }) => entry.status === 'Approved').length + userNonProjectEntries.filter(({ entry }) => entry.status === 'Approved').length;
        const rejected = userEntries.filter(({ entry }) => entry.status === 'Rejected').length + userNonProjectEntries.filter(({ entry }) => entry.status === 'Rejected').length;

        return {
          resourceId: resource.id,
          userId: resource.userId,
          displayName: resource.displayName,
          email: resource.email,
          department: resource.department,
          title: resource.title,
          photoUrl: resource.photoUrl,
          totalHours,
          nonProjectHours,
          entryCount: totalEntryCount,
          draft,
          submitted,
          approved,
          rejected,
          hasNonProjectTime: nonProjectHours > 0,
          submissionStatus: draft > 0 ? 'partial' : submitted > 0 ? 'submitted' : approved === totalEntryCount && totalEntryCount > 0 ? 'approved' : totalEntryCount === 0 ? 'no_entries' : 'mixed',
        };
      });

      const delegatedForUsers = activeDelegations.map(d => d.delegatorId);

      res.json({
        team: teamData.sort((a, b) => b.submitted - a.submitted),
        delegatedForUsers,
        period: { startDate, endDate },
      });
    } catch (error) {
      console.error('Error getting team review:', error);
      res.status(500).json({ message: 'Failed to get team review data' });
    }
  });

  // ===== SLA Metrics =====

  apiRoute(app, 'get', '/api/timesheets/sla-metrics', {
    tag: 'Timesheets',
    summary: 'Get SLA metrics for timesheet approvals',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', true), qStr('endDate', true)],
    responses: { ...r200('SLA metrics', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);
      const isApprover = userResource?.isApprover === true;
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      if (!isAdmin && !isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const allEntriesRaw = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);
      const slaThresholdDays = 3;

      let filteredEntries = allEntriesRaw;
      if (!isAdmin && !isApprover && activeDelegations.length > 0) {
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        filteredEntries = allEntriesRaw.filter(({ entry }) => {
          const entryResource = resources.find(r => r.id === entry.resourceId);
          return entryResource?.managerId && delegatorIds.includes(entryResource.managerId);
        });
      }

      const allEntries = filteredEntries;

      let totalTurnaroundMs = 0;
      let resolvedCount = 0;
      let exceedingSla = 0;
      let pendingExceedingSla = 0;
      const now = new Date();

      for (const { entry } of allEntries) {
        if (entry.submittedAt) {
          const resolvedAt = entry.approvedAt || entry.rejectedAt;
          if (resolvedAt) {
            const turnaround = new Date(resolvedAt).getTime() - new Date(entry.submittedAt).getTime();
            totalTurnaroundMs += turnaround;
            resolvedCount++;
            if (turnaround > slaThresholdDays * 24 * 60 * 60 * 1000) {
              exceedingSla++;
            }
          } else if (entry.status === 'Submitted') {
            const waitTime = now.getTime() - new Date(entry.submittedAt).getTime();
            if (waitTime > slaThresholdDays * 24 * 60 * 60 * 1000) {
              pendingExceedingSla++;
            }
          }
        }
      }

      const avgTurnaroundHours = resolvedCount > 0 ? Math.round(totalTurnaroundMs / resolvedCount / (1000 * 60 * 60) * 10) / 10 : 0;
      const avgTurnaroundDays = resolvedCount > 0 ? Math.round(avgTurnaroundHours / 24 * 10) / 10 : 0;

      const managerMetrics: Record<string, { managerId: string; managerName: string; resolvedCount: number; totalTurnaroundMs: number; exceedingSla: number; pendingExceedingSla: number; totalSubmitted: number; totalApproved: number; totalRejected: number; totalPending: number }> = {};

      for (const { entry } of allEntries) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const managerId = entryResource?.managerId || 'unassigned';
        const managerResource = resources.find(r => r.userId === managerId);
        const managerName = managerResource?.displayName || (managerId === 'unassigned' ? 'Unassigned' : 'Unknown');

        if (!managerMetrics[managerId]) {
          managerMetrics[managerId] = { managerId, managerName, resolvedCount: 0, totalTurnaroundMs: 0, exceedingSla: 0, pendingExceedingSla: 0, totalSubmitted: 0, totalApproved: 0, totalRejected: 0, totalPending: 0 };
        }
        const m = managerMetrics[managerId];

        if (entry.submittedAt) {
          m.totalSubmitted++;
          const resolvedAt = entry.approvedAt || entry.rejectedAt;
          if (resolvedAt) {
            const turnaround = new Date(resolvedAt).getTime() - new Date(entry.submittedAt).getTime();
            m.totalTurnaroundMs += turnaround;
            m.resolvedCount++;
            if (turnaround > slaThresholdDays * 24 * 60 * 60 * 1000) m.exceedingSla++;
          } else if (entry.status === 'Submitted') {
            m.totalPending++;
            const waitTime = now.getTime() - new Date(entry.submittedAt).getTime();
            if (waitTime > slaThresholdDays * 24 * 60 * 60 * 1000) m.pendingExceedingSla++;
          }
        }
        if (entry.status === 'Approved') m.totalApproved++;
        if (entry.status === 'Rejected') m.totalRejected++;
      }

      const byManager = Object.values(managerMetrics).map(m => ({
        managerId: m.managerId,
        managerName: m.managerName,
        avgTurnaroundHours: m.resolvedCount > 0 ? Math.round(m.totalTurnaroundMs / m.resolvedCount / (1000 * 60 * 60) * 10) / 10 : 0,
        avgTurnaroundDays: m.resolvedCount > 0 ? Math.round(m.totalTurnaroundMs / m.resolvedCount / (1000 * 60 * 60 * 24) * 10) / 10 : 0,
        resolvedCount: m.resolvedCount,
        exceedingSla: m.exceedingSla,
        pendingExceedingSla: m.pendingExceedingSla,
        totalSubmitted: m.totalSubmitted,
        totalApproved: m.totalApproved,
        totalRejected: m.totalRejected,
        totalPending: m.totalPending,
      })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);

      res.json({
        avgTurnaroundHours,
        avgTurnaroundDays,
        resolvedCount,
        exceedingSla,
        pendingExceedingSla,
        slaThresholdDays,
        totalSubmitted: allEntries.filter(({ entry }) => entry.submittedAt).length,
        totalApproved: allEntries.filter(({ entry }) => entry.status === 'Approved').length,
        totalRejected: allEntries.filter(({ entry }) => entry.status === 'Rejected').length,
        totalPending: allEntries.filter(({ entry }) => entry.status === 'Submitted').length,
        byManager,
      });
    } catch (error) {
      console.error('Error getting SLA metrics:', error);
      res.status(500).json({ message: 'Failed to get SLA metrics' });
    }
  });

  // ===== Time Categories (Non-Project Time Types) =====
  
  // Get time categories for organization
  apiRoute(app, 'get', '/api/time-categories', {
    tag: 'Timesheets',
    summary: 'List time categories',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Time categories', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Verify user belongs to this organization (via membership or resource)
      const memberships = await storage.getUserOrganizations(userId);
      const isMember = memberships.some(m => m.organizationId === organizationId);
      
      // Also check if user has a resource in this organization
      const resources = await storage.getResources(organizationId);
      const hasResource = resources.some(r => r.userId === userId);
      
      if (!isMember && !hasResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      let categories = await storage.getTimeCategories(organizationId);
      
      if (categories.length === 0) {
        const defaults = [
          { name: "Vacation", code: "VAC", color: "#10b981", isPaidTime: true, requiresApproval: true, displayOrder: 1 },
          { name: "PTO", code: "PTO", color: "#3b82f6", isPaidTime: true, requiresApproval: true, displayOrder: 2 },
          { name: "Sick Leave", code: "SICK", color: "#ef4444", isPaidTime: true, requiresApproval: false, displayOrder: 3 },
          { name: "Holiday", code: "HOL", color: "#8b5cf6", isPaidTime: true, requiresApproval: false, displayOrder: 4 },
          { name: "Training", code: "TRN", color: "#f59e0b", isPaidTime: true, requiresApproval: true, displayOrder: 5 },
          { name: "Admin Time", code: "ADM", color: "#6b7280", isPaidTime: true, requiresApproval: false, displayOrder: 6 },
          { name: "Unpaid Leave", code: "UNP", color: "#d97706", isPaidTime: false, requiresApproval: true, displayOrder: 7 },
        ];
        for (const cat of defaults) {
          await storage.createTimeCategory({
            organizationId,
            name: cat.name,
            code: cat.code,
            color: cat.color,
            isPaidTime: cat.isPaidTime,
            requiresApproval: cat.requiresApproval,
            displayOrder: cat.displayOrder,
            isBillable: false,
            isActive: true,
          });
        }
        categories = await storage.getTimeCategories(organizationId);
      }
      
      res.json(categories);
    } catch (error) {
      console.error('Error getting time categories:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get time categories' : classified.message });
    }
  });

  // Create time category (admin only)
  apiRoute(app, 'post', '/api/time-categories', {
    tag: 'Timesheets',
    summary: 'Create time category',
    requestBody: body({ type: 'object', properties: { name: { type: 'string' }, organizationId: { type: 'integer' } } }),
    responses: { ...r201('Category created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, name, code, description, color, sortOrder, isPaidTime } = req.body;
      if (!organizationId || !name) {
        return res.status(400).json({ message: 'organizationId and name are required' });
      }

      // Verify user belongs to this organization and is admin
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === organizationId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const category = await storage.createTimeCategory({
        organizationId,
        name,
        code,
        description,
        color,
        sortOrder,
        isPaidTime: isPaidTime ?? true
      });
      res.status(201).json(category);
    } catch (error) {
      console.error('Error creating time category:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create time category' : classified.message });
    }
  });

  // Update time category (admin only)
  apiRoute(app, 'put', '/api/time-categories/:id', {
    tag: 'Timesheets',
    summary: 'Update time category',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { name: { type: 'string' } } }),
    responses: { ...r200('Category updated', ref('TimesheetEntry')), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const category = await storage.getTimeCategory(id);
      if (!category) {
        return res.status(404).json({ message: 'Time category not found' });
      }

      // Verify user is admin of this category's organization
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === category.organizationId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const { name, description, code, color, isActive, isBillable } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (name !== undefined) safeUpdate.name = name;
      if (description !== undefined) safeUpdate.description = description;
      if (code !== undefined) safeUpdate.code = code;
      if (color !== undefined) safeUpdate.color = color;
      if (isActive !== undefined) safeUpdate.isActive = isActive;
      if (isBillable !== undefined) safeUpdate.isBillable = isBillable;
      const updated = await storage.updateTimeCategory(id, safeUpdate);
      res.json(updated);
    } catch (error) {
      console.error('Error updating time category:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update time category' : classified.message });
    }
  });

  // Delete time category (admin only)
  apiRoute(app, 'delete', '/api/time-categories/:id', {
    tag: 'Timesheets',
    summary: 'Delete time category',
    parameters: [pathId()],
    responses: { ...r200('Category deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const category = await storage.getTimeCategory(id);
      if (!category) {
        return res.status(404).json({ message: 'Time category not found' });
      }

      // Verify user is admin of this category's organization
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === category.organizationId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      await storage.deleteTimeCategory(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting time category:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete time category' : classified.message });
    }
  });

  // ===== Non-Project Time Entries =====

  // Get non-project time entries
  apiRoute(app, 'get', '/api/non-project-time', {
    tag: 'Timesheets',
    summary: 'List non-project time entries',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('startDate', true), qStr('endDate', true)],
    responses: { ...r200('Non-project time entries', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      // Verify user belongs to this organization (via membership or resource)
      const memberships = await storage.getUserOrganizations(userId);
      const isMember = memberships.some(m => m.organizationId === organizationId);
      
      // Also check if user has a resource in this organization
      const resources = await storage.getResources(organizationId);
      const hasResource = resources.some(r => r.userId === userId);
      
      if (!isMember && !hasResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Always fetch entries for the authenticated user only
      const entries = await storage.getNonProjectTimeEntriesWithCategory(userId, organizationId, startDate, endDate);
      res.json(entries);
    } catch (error) {
      console.error('Error getting non-project time entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get non-project time entries' : classified.message });
    }
  });

  // Create non-project time entry
  apiRoute(app, 'post', '/api/non-project-time', {
    tag: 'Timesheets',
    summary: 'Create non-project time entry',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Entry created', ref('TimesheetEntry')), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, categoryId, entryDate, hours, notes } = req.body;

      // Validate required fields
      if (!organizationId || !categoryId || !entryDate || hours === undefined) {
        return res.status(400).json({ message: 'organizationId, categoryId, entryDate, and hours are required' });
      }

      // Validate hours range
      const hoursNum = Number(hours);
      if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
        return res.status(400).json({ message: 'Hours must be between 0 and 24' });
      }

      // Verify user belongs to this organization (via membership or resource)
      const memberships = await storage.getUserOrganizations(userId);
      const isMember = memberships.some(m => m.organizationId === organizationId);
      
      // Also check if user has a resource in this organization
      const resources = await storage.getResources(organizationId);
      const hasResource = resources.some(r => r.userId === userId);
      
      if (!isMember && !hasResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Verify category belongs to this organization
      const category = await storage.getTimeCategory(categoryId);
      if (!category || category.organizationId !== organizationId) {
        return res.status(400).json({ message: 'Invalid category for this organization' });
      }

      // Find user's resource (reuse resources from org access check)
      const userResource = resources.find(r => r.userId === userId);

      if (!userResource) {
        return res.status(400).json({ message: 'No resource record found for this user' });
      }

      // Check if entry date is in a closed period
      const closedPeriods = await storage.getClosedPeriodsForDateRange(organizationId, entryDate, entryDate);
      if (closedPeriods.length > 0) {
        return res.status(403).json({ message: 'Cannot create entries in a closed period' });
      }

      // Always use authenticated user's ID (ignore any client-supplied userId)
      const entry = await storage.createNonProjectTimeEntry({
        organizationId,
        userId,
        resourceId: userResource.id,
        categoryId,
        entryDate,
        hours: hoursNum,
        notes,
        status: 'Draft'
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating non-project time entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create non-project time entry' : classified.message });
    }
  });

  // Update non-project time entry
  apiRoute(app, 'put', '/api/non-project-time/:id', {
    tag: 'Timesheets',
    summary: 'Update non-project time entry',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Entry updated', ref('TimesheetEntry')), ...updateRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      
      // Get the entry and verify ownership
      const existingEntry = await storage.getNonProjectTimeEntry(id);
      
      if (!existingEntry) {
        return res.status(404).json({ message: 'Time entry not found' });
      }
      
      // Verify the authenticated user owns this entry
      if (existingEntry.userId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if entry date is in a closed period
      const closedPeriods = await storage.getClosedPeriodsForDateRange(
        existingEntry.organizationId, existingEntry.entryDate, existingEntry.entryDate
      );
      if (closedPeriods.length > 0) {
        return res.status(403).json({ message: 'Cannot update entries in a closed period' });
      }

      // Only allow updating hours and notes
      const { hours, notes } = req.body;
      const updates: { hours?: number; notes?: string } = {};
      if (hours !== undefined) updates.hours = Number(hours);
      if (notes !== undefined) updates.notes = notes;

      const updated = await storage.updateNonProjectTimeEntry(id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error updating non-project time entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update non-project time entry' : classified.message });
    }
  });

  // Delete non-project time entry
  apiRoute(app, 'delete', '/api/non-project-time/:id', {
    tag: 'Timesheets',
    summary: 'Delete non-project time entry',
    parameters: [pathId()],
    responses: { ...r200('Entry deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      
      // Get the entry and verify ownership
      const existingEntry = await storage.getNonProjectTimeEntry(id);
      
      if (!existingEntry) {
        return res.status(404).json({ message: 'Time entry not found' });
      }
      
      // Verify the authenticated user owns this entry
      if (existingEntry.userId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if entry date is in a closed period
      const closedPeriods = await storage.getClosedPeriodsForDateRange(existingEntry.organizationId, existingEntry.entryDate, existingEntry.entryDate);
      if (closedPeriods.length > 0) {
        return res.status(403).json({ message: 'Cannot delete entries in a closed period' });
      }

      await storage.deleteNonProjectTimeEntry(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting non-project time entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete non-project time entry' : classified.message });
    }
  });

  // Admin: Get all referral stats (Super Admin only)
  apiRoute(app, 'get', '/api/admin/referrals', {
    tag: 'Timesheets',
    summary: 'Get admin referral stats',
    responses: { ...r200('Referral stats', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    try {
      const { referralCodes, referrals, referralPayouts } = await import("@shared/schema");
      
      const allCodes = await db.select().from(referralCodes);
      const allReferrals = await db.select().from(referrals);
      const allPayouts = await db.select().from(referralPayouts);
      
      res.json({
        codes: allCodes,
        referrals: allReferrals,
        payouts: allPayouts,
        summary: {
          totalCodes: allCodes.length,
          totalReferrals: allReferrals.length,
          totalConversions: allReferrals.filter(r => r.status === 'CONVERTED' || r.status === 'PAID_OUT').length,
          totalPayoutsPending: allPayouts.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + p.amountCents, 0),
          totalPayoutsCompleted: allPayouts.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amountCents, 0),
        },
      });
    } catch (error) {
      console.error('Error getting admin referral stats:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get referral stats' : classified.message });
    }
  });

  // Dashboard Export Routes
  apiRoute(app, 'post', '/api/dashboard/:type/export', {
    tag: 'Timesheets',
    summary: 'Export dashboard data',
    parameters: [pathStr('type')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Dashboard exported', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { type } = req.params;
      const { format, organizationId } = req.body;
      
      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required' });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied for this organization' });
      }
      
      const { getDashboardDataForExport, generateDashboardPowerPoint, generateDashboardPdf, generateDashboardHTML } = await import('../services/dashboardExport');
      const data = await getDashboardDataForExport(type, organizationId);
      
      if (format === 'pptx') {
        const buffer = await generateDashboardPowerPoint(data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-dashboard.pptx"`);
        res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await generateDashboardPdf(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-dashboard.pdf"`);
        res.send(buffer);
      } else if (format === 'html') {
        const html = generateDashboardHTML(data);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } else {
        res.status(400).json({ message: 'Invalid format. Use pptx, pdf or html' });
      }
    } catch (error) {
      console.error('Error exporting dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to export dashboard' : classified.message });
    }
  });

  // Dashboard Share Route
  apiRoute(app, 'post', '/api/dashboard/:type/share', {
    tag: 'Timesheets',
    summary: 'Share dashboard report via email',
    parameters: [pathStr('type')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Dashboard shared', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { type } = req.params;
      const { recipients, organizationId, formats, message } = req.body;
      
      if (!organizationId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ message: 'Organization ID and recipients are required' });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied for this organization' });
      }
      
      const { getDashboardDataForExport, generateDashboardPowerPoint, generateDashboardHTML } = await import('../services/dashboardExport');
      const { sendEmail } = await import('../services/email');
      
      const data = await getDashboardDataForExport(type, organizationId);
      const htmlContent = generateDashboardHTML(data);
      
      const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
      
      if (formats?.includes('pptx')) {
        const pptxBuffer = await generateDashboardPowerPoint(data);
        attachments.push({
          filename: `${type}-dashboard.pptx`,
          content: pptxBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });
      }
      
      const user = await storage.getUser(userId);
      const senderName = user?.firstName || user?.email || 'A colleague';
      const { escapeHtml, escapeHtmlMultiline } = await import('../lib/htmlEscape');
      const safeSenderName = escapeHtml(senderName);
      const safeMessage = message ? escapeHtmlMultiline(String(message)) : '';

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">FridayReport.AI</h1>
          </div>
          <p><strong>${safeSenderName}</strong> has shared a dashboard report with you.</p>
          ${safeMessage ? `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-style: italic;">"${safeMessage}"</p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          ${htmlContent}
        </div>
      `;
      
      const { shouldSendEmailToAddress } = await import("../services/userNotificationPreferences");
      let successCount = 0;
      for (const email of recipients) {
        if (!(await shouldSendEmailToAddress(email, "report.shared"))) continue;
        const success = await sendEmail({
          to: email,
          subject: `${data.title} - Shared Report`,
          text: `${senderName} has shared a ${data.title} report with you.`,
          html: emailHtml,
          attachments,
        });
        if (success) successCount++;
      }
      
      res.json({ 
        success: true, 
        sent: successCount, 
        total: recipients.length 
      });
    } catch (error) {
      console.error('Error sharing dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to share dashboard' : classified.message });
    }
  });

}
