import { db } from "../db";
import {
  timesheetEntries, tasks, projects, resources,
  timesheetPeriods, timesheetSettings,
  timesheetAuditLog, timeCategories, nonProjectTimeEntries,
  approvalDelegations, rejectionTemplates, timesheetComments,
  type TimesheetEntry, type InsertTimesheetEntry, type UpdateTimesheetEntryRequest,
  type Task, type Project, type Resource,
  type TimesheetPeriod, type InsertTimesheetPeriod,
  type TimesheetSettings, type InsertTimesheetSettings,
  type TimesheetAuditLog, type InsertTimesheetAuditLog,
  type TimeCategory, type InsertTimeCategory,
  type NonProjectTimeEntry, type InsertNonProjectTimeEntry,
  type ApprovalDelegation, type InsertApprovalDelegation,
  type RejectionTemplate, type InsertRejectionTemplate,
  type TimesheetComment, type InsertTimesheetComment,
} from "@shared/schema";
import { eq, and, desc, asc, inArray, isNull, sql } from "drizzle-orm";

export async function getTimesheetEntries(userId: string, organizationId: number, startDate: string, endDate: string): Promise<TimesheetEntry[]> {
  return await db.select().from(timesheetEntries)
    .where(and(
      eq(timesheetEntries.userId, userId),
      eq(timesheetEntries.organizationId, organizationId),
      sql`${timesheetEntries.entryDate} >= ${startDate}`,
      sql`${timesheetEntries.entryDate} <= ${endDate}`
    ))
    .orderBy(timesheetEntries.entryDate, timesheetEntries.taskId);
}

export async function getTimesheetEntriesWithDetails(userId: string, organizationId: number, startDate: string, endDate: string): Promise<{ entry: TimesheetEntry; task: Task; project: Project }[]> {
  const results = await db.select({
    entry: timesheetEntries,
    task: tasks,
    project: projects
  })
    .from(timesheetEntries)
    .innerJoin(tasks, eq(timesheetEntries.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(timesheetEntries.userId, userId),
      eq(timesheetEntries.organizationId, organizationId),
      sql`${timesheetEntries.entryDate} >= ${startDate}`,
      sql`${timesheetEntries.entryDate} <= ${endDate}`,
      isNull(tasks.deletedAt),
      isNull(projects.deletedAt)
    ))
    .orderBy(timesheetEntries.entryDate, timesheetEntries.taskId);
  
  return results;
}

export async function getAllTimesheetEntriesWithDetails(organizationId: number, startDate: string, endDate: string): Promise<{ entry: TimesheetEntry; task: Task; project: Project; resource: Resource }[]> {
  const results = await db.select({
    entry: timesheetEntries,
    task: tasks,
    project: projects,
    resource: resources,
  })
    .from(timesheetEntries)
    .innerJoin(tasks, eq(timesheetEntries.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(resources, eq(timesheetEntries.resourceId, resources.id))
    .where(and(
      eq(timesheetEntries.organizationId, organizationId),
      sql`${timesheetEntries.entryDate} >= ${startDate}`,
      sql`${timesheetEntries.entryDate} <= ${endDate}`,
      isNull(tasks.deletedAt),
      isNull(projects.deletedAt)
    ))
    .orderBy(timesheetEntries.entryDate, timesheetEntries.taskId);
  
  return results;
}

export async function getTimesheetHoursByTaskIds(taskIds: number[]): Promise<Map<number, number>> {
  if (taskIds.length === 0) return new Map();
  const results = await db.select({
    taskId: timesheetEntries.taskId,
    totalHours: sql<string>`COALESCE(SUM(CAST(${timesheetEntries.hours} AS NUMERIC)), 0)`,
  })
    .from(timesheetEntries)
    .where(inArray(timesheetEntries.taskId, taskIds))
    .groupBy(timesheetEntries.taskId);
  const map = new Map<number, number>();
  for (const row of results) {
    map.set(row.taskId, Number(row.totalHours));
  }
  return map;
}

export async function getTimesheetEntriesForApproval(organizationId: number, status?: string): Promise<TimesheetEntry[]> {
  const conditions = [eq(timesheetEntries.organizationId, organizationId)];
  if (status) {
    conditions.push(eq(timesheetEntries.status, status));
  }
  return await db.select().from(timesheetEntries)
    .where(and(...conditions))
    .orderBy(desc(timesheetEntries.submittedAt), timesheetEntries.userId);
}

export async function getTimesheetEntriesForApprovalWithDetails(organizationId: number, status?: string): Promise<{ entry: TimesheetEntry; task: Task | null; project: Project | null; resource: Resource | null }[]> {
  const conditions: ReturnType<typeof eq>[] = [eq(timesheetEntries.organizationId, organizationId)];
  if (status) {
    conditions.push(eq(timesheetEntries.status, status));
  }
  const results = await db.select({
    entry: timesheetEntries,
    task: tasks,
    project: projects,
    resource: resources,
  })
    .from(timesheetEntries)
    .leftJoin(tasks, eq(timesheetEntries.taskId, tasks.id))
    .leftJoin(projects, sql`${tasks.projectId} = ${projects.id}`)
    .leftJoin(resources, eq(timesheetEntries.resourceId, resources.id))
    .where(and(...conditions))
    .orderBy(desc(timesheetEntries.submittedAt), timesheetEntries.userId);
  return results;
}

export async function getTimesheetEntry(id: number): Promise<TimesheetEntry | undefined> {
  const [entry] = await db.select().from(timesheetEntries).where(eq(timesheetEntries.id, id));
  return entry;
}

export async function findTimesheetEntry(resourceId: number, taskId: number, entryDate: string): Promise<TimesheetEntry | undefined> {
  const [entry] = await db.select().from(timesheetEntries).where(and(
    eq(timesheetEntries.resourceId, resourceId),
    eq(timesheetEntries.taskId, taskId),
    eq(timesheetEntries.entryDate, entryDate)
  ));
  return entry;
}

export async function createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntry> {
  // Atomic insert-or-add. The previous implementation caught the 23505
  // duplicate-key error, then ran SELECT + UPDATE in two trips outside any
  // transaction — two concurrent saves both read the same `existing.hours`
  // and one write was silently lost (classic lost-update on a debounced
  // auto-save). `onConflictDoUpdate` performs the increment atomically at
  // the DB level using EXCLUDED + the existing row in a single statement.
  const [row] = await db.insert(timesheetEntries)
    .values(entry)
    .onConflictDoUpdate({
      target: [
        timesheetEntries.resourceId,
        timesheetEntries.taskId,
        timesheetEntries.entryDate,
      ],
      set: {
        hours: sql`${timesheetEntries.hours} + EXCLUDED.hours`,
        notes: sql`COALESCE(EXCLUDED.notes, ${timesheetEntries.notes})`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export type ImportedTimesheetUpsert = {
  organizationId: number;
  userId: string;
  resourceId: number;
  taskId: number;
  projectId: number;
  entryDate: string;
  hours: number;
  status: string;
  externalSource: string;
  externalId: string;
  notes?: string | null;
};

export type ImportedTimesheetResult = "inserted" | "updated" | "conflict";

/**
 * Upsert a timesheet entry that originates from an external sync (e.g. Project
 * Online). Unlike `createTimesheetEntry`, hours are SET (not added) since the
 * source is authoritative. A pre-existing manually-entered row (no
 * externalSource) is left untouched and reported as a conflict so the sync
 * never clobbers hand-keyed time.
 */
export async function upsertImportedTimesheetEntry(entry: ImportedTimesheetUpsert): Promise<ImportedTimesheetResult> {
  const existing = await findTimesheetEntry(entry.resourceId, entry.taskId, entry.entryDate);
  if (existing) {
    if (existing.externalSource !== entry.externalSource) {
      return "conflict";
    }
    await db.update(timesheetEntries)
      .set({
        hours: entry.hours,
        status: entry.status,
        externalId: entry.externalId,
        notes: entry.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(timesheetEntries.id, existing.id));
    return "updated";
  }
  await db.insert(timesheetEntries).values({
    organizationId: entry.organizationId,
    userId: entry.userId,
    resourceId: entry.resourceId,
    taskId: entry.taskId,
    projectId: entry.projectId,
    entryDate: entry.entryDate,
    hours: entry.hours,
    status: entry.status,
    externalSource: entry.externalSource,
    externalId: entry.externalId,
    notes: entry.notes ?? null,
  });
  return "inserted";
}

export async function updateTimesheetEntry(id: number, updates: UpdateTimesheetEntryRequest): Promise<TimesheetEntry> {
  const [updated] = await db.update(timesheetEntries)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(timesheetEntries.id, id))
    .returning();
  return updated;
}

export async function deleteTimesheetEntry(id: number): Promise<void> {
  await db.delete(timesheetEntries).where(eq(timesheetEntries.id, id));
}

export async function submitTimesheetWeek(userId: string, organizationId: number, startDate: string, endDate: string): Promise<void> {
  await db.update(timesheetEntries)
    .set({ status: "Submitted", submittedAt: new Date(), rejectedAt: null, rejectionReason: null, updatedAt: new Date() })
    .where(and(
      eq(timesheetEntries.userId, userId),
      eq(timesheetEntries.organizationId, organizationId),
      sql`${timesheetEntries.status} IN ('Draft', 'Rejected')`,
      sql`${timesheetEntries.entryDate} >= ${startDate}`,
      sql`${timesheetEntries.entryDate} <= ${endDate}`
    ));
}

export async function approveTimesheetEntry(id: number, approvedBy: string): Promise<TimesheetEntry> {
  const [updated] = await db.update(timesheetEntries)
    .set({ status: "Approved", approvedBy, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(timesheetEntries.id, id))
    .returning();
  return updated;
}

export async function bulkApproveTimesheetEntries(ids: number[], approvedBy: string, organizationId: number): Promise<TimesheetEntry[]> {
  if (ids.length === 0) return [];
  const now = new Date();
  return await db.update(timesheetEntries)
    .set({ status: "Approved", approvedBy, approvedAt: now, updatedAt: now })
    .where(
      and(
        inArray(timesheetEntries.id, ids),
        eq(timesheetEntries.organizationId, organizationId),
        eq(timesheetEntries.status, "Submitted")
      )
    )
    .returning();
}

export async function rejectTimesheetEntry(id: number, rejectionReason: string, rejectedBy?: string): Promise<TimesheetEntry> {
  const [updated] = await db.update(timesheetEntries)
    .set({ status: "Rejected", rejectionReason, rejectedAt: new Date(), rejectedBy: rejectedBy || null, updatedAt: new Date() })
    .where(eq(timesheetEntries.id, id))
    .returning();
  return updated;
}

export async function getTimesheetPeriods(organizationId: number): Promise<TimesheetPeriod[]> {
  return await db.select().from(timesheetPeriods)
    .where(eq(timesheetPeriods.organizationId, organizationId))
    .orderBy(desc(timesheetPeriods.startDate));
}

export async function getTimesheetPeriod(id: number): Promise<TimesheetPeriod | undefined> {
  const [period] = await db.select().from(timesheetPeriods)
    .where(eq(timesheetPeriods.id, id));
  return period;
}

export async function getClosedPeriodsForDateRange(organizationId: number, startDate: string, endDate: string): Promise<TimesheetPeriod[]> {
  return await db.select().from(timesheetPeriods)
    .where(and(
      eq(timesheetPeriods.organizationId, organizationId),
      eq(timesheetPeriods.status, "closed"),
      sql`${timesheetPeriods.startDate} <= ${endDate}`,
      sql`${timesheetPeriods.endDate} >= ${startDate}`
    ))
    .orderBy(asc(timesheetPeriods.startDate));
}

export async function createTimesheetPeriod(period: InsertTimesheetPeriod): Promise<TimesheetPeriod> {
  const [created] = await db.insert(timesheetPeriods).values(period).returning();
  return created;
}

export async function closeTimesheetPeriod(id: number, closedBy: string): Promise<TimesheetPeriod> {
  const [updated] = await db.update(timesheetPeriods)
    .set({ status: "closed", closedBy, closedAt: new Date() })
    .where(eq(timesheetPeriods.id, id))
    .returning();
  return updated;
}

export async function reopenTimesheetPeriod(id: number, reopenedBy: string): Promise<TimesheetPeriod> {
  const [updated] = await db.update(timesheetPeriods)
    .set({ status: "open", reopenedBy, reopenedAt: new Date() })
    .where(eq(timesheetPeriods.id, id))
    .returning();
  return updated;
}

export async function deleteTimesheetPeriod(id: number): Promise<void> {
  await db.delete(timesheetPeriods).where(eq(timesheetPeriods.id, id));
}

export async function getApprovalDelegations(organizationId: number): Promise<ApprovalDelegation[]> {
  return await db.select().from(approvalDelegations)
    .where(eq(approvalDelegations.organizationId, organizationId))
    .orderBy(desc(approvalDelegations.createdAt));
}

export async function getActiveDelegationsForDelegate(delegateId: string, organizationId: number): Promise<ApprovalDelegation[]> {
  const today = new Date().toISOString().split('T')[0];
  return await db.select().from(approvalDelegations)
    .where(and(
      eq(approvalDelegations.delegateId, delegateId),
      eq(approvalDelegations.organizationId, organizationId),
      eq(approvalDelegations.isActive, true),
      sql`${approvalDelegations.startDate} <= ${today}`,
      sql`${approvalDelegations.endDate} >= ${today}`
    ));
}

export async function getActiveDelegationsForDelegator(delegatorId: string, organizationId: number): Promise<ApprovalDelegation[]> {
  return await db.select().from(approvalDelegations)
    .where(and(
      eq(approvalDelegations.delegatorId, delegatorId),
      eq(approvalDelegations.organizationId, organizationId),
      eq(approvalDelegations.isActive, true)
    ));
}

export async function createApprovalDelegation(delegation: InsertApprovalDelegation): Promise<ApprovalDelegation> {
  const [created] = await db.insert(approvalDelegations).values(delegation).returning();
  return created;
}

export async function revokeApprovalDelegation(id: number): Promise<ApprovalDelegation> {
  const [updated] = await db.update(approvalDelegations)
    .set({ isActive: false, revokedAt: new Date() })
    .where(eq(approvalDelegations.id, id))
    .returning();
  return updated;
}

export async function getRejectionTemplates(organizationId: number): Promise<RejectionTemplate[]> {
  return await db.select().from(rejectionTemplates)
    .where(and(
      eq(rejectionTemplates.organizationId, organizationId),
      eq(rejectionTemplates.isActive, true)
    ))
    .orderBy(asc(rejectionTemplates.sortOrder), asc(rejectionTemplates.name));
}

export async function getRejectionTemplate(id: number): Promise<RejectionTemplate | undefined> {
  const [template] = await db.select().from(rejectionTemplates)
    .where(eq(rejectionTemplates.id, id));
  return template;
}

export async function createRejectionTemplate(template: InsertRejectionTemplate): Promise<RejectionTemplate> {
  const [created] = await db.insert(rejectionTemplates).values(template).returning();
  return created;
}

export async function updateRejectionTemplate(id: number, updates: Partial<InsertRejectionTemplate>): Promise<RejectionTemplate> {
  const [updated] = await db.update(rejectionTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(rejectionTemplates.id, id))
    .returning();
  return updated;
}

export async function deleteRejectionTemplate(id: number): Promise<void> {
  await db.update(rejectionTemplates)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(rejectionTemplates.id, id));
}

export async function getTimesheetComments(entryId: number): Promise<TimesheetComment[]> {
  return await db.select().from(timesheetComments)
    .where(eq(timesheetComments.entryId, entryId))
    .orderBy(asc(timesheetComments.createdAt));
}

export async function createTimesheetComment(comment: InsertTimesheetComment): Promise<TimesheetComment> {
  const [created] = await db.insert(timesheetComments).values(comment).returning();
  return created;
}

export async function getTimesheetSettings(organizationId: number): Promise<TimesheetSettings | undefined> {
  const [settings] = await db.select().from(timesheetSettings)
    .where(eq(timesheetSettings.organizationId, organizationId));
  return settings;
}

export async function upsertTimesheetSettings(settings: InsertTimesheetSettings): Promise<TimesheetSettings> {
  const [result] = await db.insert(timesheetSettings)
    .values(settings)
    .onConflictDoUpdate({
      target: [timesheetSettings.organizationId],
      set: {
        minWeeklyHours: settings.minWeeklyHours,
        maxWeeklyHours: settings.maxWeeklyHours,
        overtimeThreshold: settings.overtimeThreshold,
        gracePeriodDays: settings.gracePeriodDays,
        mandatoryNotes: settings.mandatoryNotes,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
}

export async function createTimesheetAuditLog(log: InsertTimesheetAuditLog): Promise<TimesheetAuditLog> {
  const [created] = await db.insert(timesheetAuditLog).values(log).returning();
  return created;
}

export async function getTimesheetAuditLogs(organizationId: number, filters?: { entryId?: number; actorId?: string; action?: string; limit?: number; offset?: number }): Promise<TimesheetAuditLog[]> {
  const conditions = [eq(timesheetAuditLog.organizationId, organizationId)];
  if (filters?.entryId) conditions.push(eq(timesheetAuditLog.entryId, filters.entryId));
  if (filters?.actorId) conditions.push(eq(timesheetAuditLog.actorId, filters.actorId));
  if (filters?.action) conditions.push(eq(timesheetAuditLog.action, filters.action));

  return await db.select().from(timesheetAuditLog)
    .where(and(...conditions))
    .orderBy(desc(timesheetAuditLog.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);
}

export async function getTimesheetAuditLogsForEntry(entryId: number): Promise<TimesheetAuditLog[]> {
  return await db.select().from(timesheetAuditLog)
    .where(eq(timesheetAuditLog.entryId, entryId))
    .orderBy(desc(timesheetAuditLog.createdAt));
}

export async function getTimeCategories(organizationId: number): Promise<TimeCategory[]> {
  return await db.select().from(timeCategories)
    .where(and(
      eq(timeCategories.organizationId, organizationId),
      isNull(timeCategories.deletedAt)
    ))
    .orderBy(asc(timeCategories.sortOrder), asc(timeCategories.name));
}

export async function getTimeCategory(id: number): Promise<TimeCategory | undefined> {
  const [category] = await db.select().from(timeCategories)
    .where(and(eq(timeCategories.id, id), isNull(timeCategories.deletedAt)));
  return category;
}

export async function createTimeCategory(category: InsertTimeCategory): Promise<TimeCategory> {
  const [created] = await db.insert(timeCategories).values(category).returning();
  return created;
}

export async function updateTimeCategory(id: number, updates: Partial<InsertTimeCategory>): Promise<TimeCategory> {
  const [updated] = await db.update(timeCategories)
    .set(updates)
    .where(eq(timeCategories.id, id))
    .returning();
  return updated;
}

export async function deleteTimeCategory(id: number): Promise<void> {
  await db.update(timeCategories)
    .set({ deletedAt: new Date() })
    .where(eq(timeCategories.id, id));
}

export async function getNonProjectTimeEntry(id: number): Promise<NonProjectTimeEntry | undefined> {
  const [entry] = await db.select().from(nonProjectTimeEntries)
    .where(eq(nonProjectTimeEntries.id, id));
  return entry;
}

export async function getAllNonProjectTimeEntriesWithCategory(organizationId: number, startDate: string, endDate: string): Promise<{ entry: NonProjectTimeEntry; category: TimeCategory }[]> {
  const results = await db.select({
    entry: nonProjectTimeEntries,
    category: timeCategories
  })
    .from(nonProjectTimeEntries)
    .innerJoin(timeCategories, eq(nonProjectTimeEntries.categoryId, timeCategories.id))
    .where(and(
      eq(nonProjectTimeEntries.organizationId, organizationId),
      isNull(nonProjectTimeEntries.deletedAt),
      sql`${nonProjectTimeEntries.entryDate} >= ${startDate}`,
      sql`${nonProjectTimeEntries.entryDate} <= ${endDate}`
    ));
  return results;
}

export async function getNonProjectTimeEntries(userId: string, organizationId: number, startDate: string, endDate: string): Promise<NonProjectTimeEntry[]> {
  return await db.select().from(nonProjectTimeEntries)
    .where(and(
      eq(nonProjectTimeEntries.userId, userId),
      eq(nonProjectTimeEntries.organizationId, organizationId),
      sql`${nonProjectTimeEntries.entryDate} >= ${startDate}`,
      sql`${nonProjectTimeEntries.entryDate} <= ${endDate}`
    ));
}

export async function getNonProjectTimeEntriesWithCategory(userId: string, organizationId: number, startDate: string, endDate: string): Promise<{ entry: NonProjectTimeEntry; category: TimeCategory }[]> {
  const results = await db.select({
    entry: nonProjectTimeEntries,
    category: timeCategories
  })
    .from(nonProjectTimeEntries)
    .innerJoin(timeCategories, eq(nonProjectTimeEntries.categoryId, timeCategories.id))
    .where(and(
      eq(nonProjectTimeEntries.userId, userId),
      eq(nonProjectTimeEntries.organizationId, organizationId),
      sql`${nonProjectTimeEntries.entryDate} >= ${startDate}`,
      sql`${nonProjectTimeEntries.entryDate} <= ${endDate}`
    ));
  return results;
}

export async function createNonProjectTimeEntry(entry: InsertNonProjectTimeEntry): Promise<NonProjectTimeEntry> {
  const [created] = await db.insert(nonProjectTimeEntries).values(entry).returning();
  return created;
}

export async function updateNonProjectTimeEntry(id: number, updates: Partial<InsertNonProjectTimeEntry>): Promise<NonProjectTimeEntry> {
  const [updated] = await db.update(nonProjectTimeEntries)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(nonProjectTimeEntries.id, id))
    .returning();
  return updated;
}

export async function deleteNonProjectTimeEntry(id: number): Promise<void> {
  await db.delete(nonProjectTimeEntries).where(eq(nonProjectTimeEntries.id, id));
}
