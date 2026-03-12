import { db } from '../db';
import { storage } from '../storage';
import {
  timesheetEntries, timesheetReminderSettings, timesheetReminderLog,
  timesheetReminderSnooze, timesheetEscalationLog, resources,
  organizations, organizationMembers, users, notifications
} from '@shared/schema';
import { eq, and, gte, lte, lt, isNull, inArray, sql, not, or, count } from 'drizzle-orm';
import { format, startOfWeek, endOfWeek, addDays, subDays, differenceInBusinessDays } from 'date-fns';
import { addWorkingDays } from '../lib/workingDays';
import {
  sendTimesheetSubmissionReminder,
  sendManagerApprovalReminder,
  sendTimesheetEscalationEmail,
  sendManagerWeeklyDigestEmail
} from './email';

interface ReminderResult {
  submissionReminders: number;
  approvalReminders: number;
  escalations: number;
  digestsSent: number;
  errors: string[];
}

function getAppUrl(): string {
  return process.env.REPLIT_DOMAINS?.split(',')[0]
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'https://fridayreport.ai';
}

async function getReminderSettings(organizationId: number) {
  const [settings] = await db.select()
    .from(timesheetReminderSettings)
    .where(eq(timesheetReminderSettings.organizationId, organizationId));

  if (settings) return settings;

  const [created] = await db.insert(timesheetReminderSettings)
    .values({ organizationId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [existing] = await db.select()
    .from(timesheetReminderSettings)
    .where(eq(timesheetReminderSettings.organizationId, organizationId));
  return existing;
}

async function isUserSnoozed(userId: string, weekStartStr: string): Promise<boolean> {
  const now = new Date();
  const [snooze] = await db.select()
    .from(timesheetReminderSnooze)
    .where(and(
      eq(timesheetReminderSnooze.userId, userId),
      eq(timesheetReminderSnooze.weekStart, weekStartStr),
      gte(timesheetReminderSnooze.snoozedUntil, now)
    ))
    .limit(1);
  return !!snooze;
}

async function getReminderCount(userId: string, weekStartStr: string, reminderType: string): Promise<number> {
  const [result] = await db.select({ cnt: count() })
    .from(timesheetReminderLog)
    .where(and(
      eq(timesheetReminderLog.userId, userId),
      eq(timesheetReminderLog.weekStart, weekStartStr),
      eq(timesheetReminderLog.reminderType, reminderType)
    ));
  return result?.cnt ?? 0;
}

function getUrgencyLevel(dayOfWeek: number): 'friendly' | 'nudge' | 'firm' {
  if (dayOfWeek <= 4) return 'friendly';
  if (dayOfWeek === 5) return 'nudge';
  return 'firm';
}

export async function processSubmissionReminders(organizationId: number): Promise<number> {
  let sent = 0;
  const settings = await getReminderSettings(organizationId);
  if (!settings?.enabled) return 0;

  const today = new Date();
  const dayOfWeek = today.getDay();
  const scheduleDays = (settings.submissionReminderDays as number[]) || [4, 5, 8];

  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const currentWeekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
  const currentWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const currentWeekEndStr = format(currentWeekEnd, 'yyyy-MM-dd');

  const prevWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
  const prevWeekStartStr = format(prevWeekStart, 'yyyy-MM-dd');
  const prevWeekEnd = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
  const prevWeekEndStr = format(prevWeekEnd, 'yyyy-MM-dd');

  let targetWeekStart = currentWeekStartStr;
  let targetWeekEnd = currentWeekEndStr;
  let urgency: 'friendly' | 'nudge' | 'firm' = 'friendly';

  if (dayOfWeek === 4 && scheduleDays.includes(4)) {
    urgency = 'friendly';
  } else if (dayOfWeek === 5 && scheduleDays.includes(5)) {
    urgency = 'nudge';
  } else if (dayOfWeek === 1 && scheduleDays.includes(8)) {
    targetWeekStart = prevWeekStartStr;
    targetWeekEnd = prevWeekEndStr;
    urgency = 'firm';
  } else {
    return 0;
  }

  const orgResources = await db.select()
    .from(resources)
    .where(and(
      eq(resources.organizationId, organizationId),
      not(isNull(resources.userId)),
      eq(resources.isActive, true),
      eq(resources.timesheetHidden, false)
    ));

  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));

  for (const resource of orgResources) {
    if (!resource.userId) continue;

    try {
      if (await isUserSnoozed(resource.userId, targetWeekStart)) continue;

      const existingCount = await getReminderCount(resource.userId, targetWeekStart, 'submission');
      if (existingCount >= (settings.frequencyCap || 3)) continue;

      const entries = await db.select()
        .from(timesheetEntries)
        .where(and(
          eq(timesheetEntries.userId, resource.userId),
          eq(timesheetEntries.organizationId, organizationId),
          gte(timesheetEntries.entryDate, targetWeekStart),
          lte(timesheetEntries.entryDate, targetWeekEnd)
        ));

      const hasSubmitted = entries.some(e => e.status === 'Submitted' || e.status === 'Approved');
      if (hasSubmitted) continue;

      const totalHours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);

      const [user] = await db.select().from(users).where(eq(users.id, resource.userId));
      if (!user?.email) continue;

      const appUrl = getAppUrl();

      const emailEnabled = settings.emailEnabled !== false;
      const notifEnabled = settings.notificationEnabled !== false;

      if (emailEnabled) {
        await sendTimesheetSubmissionReminder(
          user.email,
          resource.displayName || user.email,
          urgency,
          targetWeekStart,
          targetWeekEnd,
          totalHours,
          appUrl
        );
      }

      if (notifEnabled) {
        await storage.createNotification({
          userId: resource.userId,
          organizationId,
          type: 'timesheet_submission_reminder',
          title: urgency === 'firm' ? 'Timesheet Overdue' : 'Timesheet Reminder',
          message: urgency === 'firm'
            ? `Your timesheet for the week of ${targetWeekStart} is overdue. Please submit as soon as possible.`
            : `Reminder: Please submit your timesheet for the week of ${targetWeekStart}.`,
          severity: urgency === 'firm' ? 'critical' : urgency === 'nudge' ? 'warning' : 'info',
          actionUrl: '/timesheets',
        });
      }

      await db.insert(timesheetReminderLog).values({
        organizationId,
        userId: resource.userId,
        reminderType: 'submission',
        weekStart: targetWeekStart,
        urgencyLevel: urgency,
        emailSent: emailEnabled,
        notificationCreated: notifEnabled,
      });

      sent++;
    } catch (err) {
      console.error(`Error sending submission reminder to ${resource.userId}:`, err);
    }
  }

  return sent;
}

export async function processApprovalReminders(organizationId: number): Promise<number> {
  let sent = 0;
  const settings = await getReminderSettings(organizationId);
  if (!settings?.enabled) return 0;

  const thresholdDays = settings.approvalReminderDays || 2;
  const cutoffDate = subDays(new Date(), thresholdDays);

  const pendingEntries = await db.select({
    entry: timesheetEntries,
    resource: resources,
  })
    .from(timesheetEntries)
    .innerJoin(resources, eq(timesheetEntries.resourceId, resources.id))
    .where(and(
      eq(timesheetEntries.organizationId, organizationId),
      eq(timesheetEntries.status, 'Submitted'),
      lte(timesheetEntries.submittedAt, cutoffDate)
    ));

  if (pendingEntries.length === 0) return 0;

  const managerMap = new Map<string, Array<{ entry: typeof pendingEntries[0]['entry'], resource: typeof pendingEntries[0]['resource'] }>>();
  for (const { entry, resource } of pendingEntries) {
    if (resource.managerId) {
      const list = managerMap.get(resource.managerId) || [];
      list.push({ entry, resource });
      managerMap.set(resource.managerId, list);
    }
  }

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const appUrl = getAppUrl();

  for (const [managerId, items] of managerMap) {
    try {
      if (await isUserSnoozed(managerId, weekStart)) continue;

      const existingCount = await getReminderCount(managerId, weekStart, 'approval');
      if (existingCount >= (settings.frequencyCap || 3)) continue;

      const [manager] = await db.select().from(users).where(eq(users.id, managerId));
      if (!manager?.email) continue;

      const pendingList = items.map(i => ({
        name: i.resource.displayName || 'Unknown',
        hours: Number(i.entry.hours) || 0,
        date: i.entry.entryDate,
      }));

      const daysOld = Math.max(...items.map(i =>
        differenceInBusinessDays(new Date(), new Date(i.entry.submittedAt || i.entry.createdAt!))
      ));
      const urgency: 'warning' | 'critical' = daysOld >= 4 ? 'critical' : 'warning';

      const emailOn = settings.emailEnabled !== false;
      const notifOn = settings.notificationEnabled !== false;

      if (emailOn) {
        await sendManagerApprovalReminder(
          manager.email,
          manager.firstName || manager.email,
          pendingList,
          daysOld,
          appUrl
        );
      }

      if (notifOn) {
        await storage.createNotification({
          userId: managerId,
          organizationId,
          type: 'timesheet_approval_reminder',
          title: `${items.length} Timesheet${items.length > 1 ? 's' : ''} Pending Approval`,
          message: `You have ${items.length} timesheet entries pending approval for ${daysOld}+ business days.`,
          severity: urgency,
          actionUrl: '/timesheets',
        });
      }

      await db.insert(timesheetReminderLog).values({
        organizationId,
        userId: managerId,
        reminderType: 'approval',
        weekStart,
        urgencyLevel: urgency,
        emailSent: emailOn,
        notificationCreated: notifOn,
      });

      sent++;
    } catch (err) {
      console.error(`Error sending approval reminder to ${managerId}:`, err);
    }
  }

  return sent;
}

export async function processEscalations(organizationId: number): Promise<number> {
  let escalated = 0;
  const settings = await getReminderSettings(organizationId);
  if (!settings?.enabled) return 0;

  const thresholdDays = settings.escalationThresholdDays || 5;
  const cutoffDate = addWorkingDays(new Date(), -thresholdDays);

  const breachedEntries = await db.select({
    entry: timesheetEntries,
    resource: resources,
  })
    .from(timesheetEntries)
    .innerJoin(resources, eq(timesheetEntries.resourceId, resources.id))
    .where(and(
      eq(timesheetEntries.organizationId, organizationId),
      eq(timesheetEntries.status, 'Submitted'),
      lte(timesheetEntries.submittedAt, cutoffDate)
    ));

  if (breachedEntries.length === 0) return 0;

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const appUrl = getAppUrl();

  const managerEntries = new Map<string, Array<typeof breachedEntries[0]>>();
  for (const item of breachedEntries) {
    const mid = item.resource.managerId;
    if (mid) {
      const list = managerEntries.get(mid) || [];
      list.push(item);
      managerEntries.set(mid, list);
    }
  }

  for (const [managerId, items] of managerEntries) {
    try {
      const [existing] = await db.select({ cnt: count() })
        .from(timesheetEscalationLog)
        .where(and(
          eq(timesheetEscalationLog.managerId, managerId),
          eq(timesheetEscalationLog.weekStart, weekStart),
          eq(timesheetEscalationLog.organizationId, organizationId)
        ));
      if ((existing?.cnt ?? 0) > 0) continue;

      const [managerResource] = await db.select()
        .from(resources)
        .where(and(
          eq(resources.userId, managerId),
          eq(resources.organizationId, organizationId)
        ));

      let escalateToId: string | null = managerResource?.managerId || null;

      if (!escalateToId) {
        const admins = await db.select({ userId: organizationMembers.userId })
          .from(organizationMembers)
          .where(and(
            eq(organizationMembers.organizationId, organizationId),
            or(
              eq(organizationMembers.role, 'owner'),
              eq(organizationMembers.role, 'org_admin'),
              eq(organizationMembers.role, 'admin')
            )
          ))
          .limit(1);

        escalateToId = admins[0]?.userId || null;
      }

      if (!escalateToId) continue;

      const [escalateTo] = await db.select().from(users).where(eq(users.id, escalateToId));
      const [manager] = await db.select().from(users).where(eq(users.id, managerId));
      if (!escalateTo?.email) continue;

      const pendingNames = items.map(i => i.resource.displayName || 'Unknown');

      await sendTimesheetEscalationEmail(
        escalateTo.email,
        escalateTo.firstName || escalateTo.email,
        manager?.firstName || managerId,
        pendingNames,
        thresholdDays,
        appUrl
      );

      await storage.createNotification({
        userId: escalateToId,
        organizationId,
        type: 'timesheet_escalation',
        title: 'Timesheet Approval Escalation',
        message: `${items.length} timesheet(s) managed by ${manager?.firstName || managerId} have exceeded the ${thresholdDays}-day SLA.`,
        severity: 'critical',
        actionUrl: '/timesheets',
      });

      for (const item of items) {
        await db.insert(timesheetEscalationLog).values({
          organizationId,
          entryUserId: item.entry.userId,
          managerId,
          escalatedToId: escalateToId,
          weekStart,
          reason: `Pending approval for ${thresholdDays}+ business days`,
          emailSent: true,
        });
      }

      escalated++;
    } catch (err) {
      console.error(`Error processing escalation for manager ${managerId}:`, err);
    }
  }

  return escalated;
}

export async function processManagerDigests(organizationId: number): Promise<number> {
  let sent = 0;
  const settings = await getReminderSettings(organizationId);
  if (!settings?.enabled || !settings?.digestEnabled) return 0;

  const today = new Date();
  const digestDay = settings.digestDay ?? 1;
  if (today.getDay() !== digestDay) return 0;

  const weekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  const approvers = await db.select()
    .from(resources)
    .where(and(
      eq(resources.organizationId, organizationId),
      eq(resources.isApprover, true),
      eq(resources.isActive, true),
      not(isNull(resources.userId))
    ));

  const appUrl = getAppUrl();

  for (const approver of approvers) {
    if (!approver.userId) continue;

    try {
      const directReports = await db.select()
        .from(resources)
        .where(and(
          eq(resources.organizationId, organizationId),
          eq(resources.managerId, approver.userId),
          eq(resources.isActive, true),
          not(isNull(resources.userId))
        ));

      if (directReports.length === 0) continue;

      const reportUserIds = directReports.map(r => r.userId!).filter(Boolean);

      const entries = await db.select()
        .from(timesheetEntries)
        .where(and(
          eq(timesheetEntries.organizationId, organizationId),
          inArray(timesheetEntries.userId, reportUserIds),
          gte(timesheetEntries.entryDate, weekStartStr),
          lte(timesheetEntries.entryDate, weekEndStr)
        ));

      const submitted = new Set<string>();
      const notSubmitted: string[] = [];
      const pendingApproval: string[] = [];
      const overdue: string[] = [];

      for (const report of directReports) {
        if (!report.userId) continue;
        const name = report.displayName || report.email || 'Unknown';
        const userEntries = entries.filter(e => e.userId === report.userId);
        const hasSubmitted = userEntries.some(e => e.status === 'Submitted' || e.status === 'Approved');
        const hasPending = userEntries.some(e => e.status === 'Submitted');

        if (hasSubmitted) {
          submitted.add(name);
        } else {
          notSubmitted.push(name);
        }

        if (hasPending) {
          pendingApproval.push(name);
        }

        const hasOverdue = userEntries.some(e => {
          if (e.status !== 'Submitted' || !e.submittedAt) return false;
          return differenceInBusinessDays(new Date(), new Date(e.submittedAt)) > (settings.escalationThresholdDays || 5);
        });
        if (hasOverdue) overdue.push(name);
      }

      const [user] = await db.select().from(users).where(eq(users.id, approver.userId));
      if (!user?.email) continue;

      await sendManagerWeeklyDigestEmail(
        user.email,
        approver.displayName || user.email,
        weekStartStr,
        weekEndStr,
        {
          submitted: Array.from(submitted),
          notSubmitted,
          pendingApproval,
          overdue,
          totalDirectReports: directReports.length,
        },
        appUrl
      );

      sent++;
    } catch (err) {
      console.error(`Error sending digest to ${approver.userId}:`, err);
    }
  }

  return sent;
}

export async function runTimesheetReminders(): Promise<ReminderResult> {
  const result: ReminderResult = {
    submissionReminders: 0,
    approvalReminders: 0,
    escalations: 0,
    digestsSent: 0,
    errors: [],
  };

  try {
    const orgs = await db.select({ id: organizations.id }).from(organizations)
      .where(isNull(organizations.deactivatedAt));

    for (const org of orgs) {
      try {
        result.submissionReminders += await processSubmissionReminders(org.id);
        result.approvalReminders += await processApprovalReminders(org.id);
        result.escalations += await processEscalations(org.id);
        result.digestsSent += await processManagerDigests(org.id);
      } catch (err: any) {
        result.errors.push(`Org ${org.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(`Fatal: ${err.message}`);
  }

  return result;
}

export async function snoozeReminder(
  userId: string,
  organizationId: number,
  weekStart: string,
  durationHours: number
): Promise<void> {
  const snoozedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  await db.insert(timesheetReminderSnooze).values({
    organizationId,
    userId,
    weekStart,
    snoozedUntil,
  });
}
