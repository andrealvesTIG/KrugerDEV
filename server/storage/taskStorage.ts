import { db } from "../db";
import {
  tasks, projects, issues, resources,
  taskDependencies, taskChangeLogs, taskResourceAssignments,
  projectChangeLogs, issueChangeLogs,
  notifications,
  type Task, type InsertTask, type UpdateTaskRequest,
  type TaskChangeLog, type InsertTaskChangeLog,
  type ProjectChangeLog, type InsertProjectChangeLog,
  type RiskChangeLog, type InsertRiskChangeLog,
  type IssueChangeLog, type InsertIssueChangeLog,
  type TaskDependency, type InsertTaskDependency,
  type Resource, type TaskResourceAssignment,
} from "@shared/schema";
import { eq, and, desc, asc, or, isNull, inArray, sql, gte, lte, lt } from "drizzle-orm";
import type { TaskDateFilterOptions } from "./types";

function chunkedInArray<T>(column: any, values: T[], chunkSize = 1000): ReturnType<typeof inArray> {
  if (values.length <= chunkSize) {
    return inArray(column, values);
  }
  console.warn(`[chunkedInArray] Splitting ${values.length} values into chunks of ${chunkSize}`);
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    chunks.push(values.slice(i, i + chunkSize));
  }
  return or(...chunks.map(chunk => inArray(column, chunk))) as any;
}

function buildDateFilterConditions(filters?: TaskDateFilterOptions) {
  const conditions: any[] = [];
  if (!filters) return conditions;
  if (filters.startDateFrom) {
    conditions.push(or(isNull(tasks.startDate), gte(tasks.startDate, filters.startDateFrom)));
  }
  if (filters.startDateTo) {
    conditions.push(or(isNull(tasks.startDate), lte(tasks.startDate, filters.startDateTo)));
  }
  if (filters.endDateFrom) {
    conditions.push(or(isNull(tasks.endDate), gte(tasks.endDate, filters.endDateFrom)));
  }
  if (filters.endDateTo) {
    conditions.push(or(isNull(tasks.endDate), lte(tasks.endDate, filters.endDateTo)));
  }
  if (filters.overdue) {
    const today = filters.today || new Date().toISOString().split('T')[0];
    conditions.push(lt(tasks.endDate, today));
    conditions.push(sql`${tasks.status} NOT IN ('Completed', 'Cancelled')`);
  }
  return conditions;
}

function getTaskSortOrder(filters?: TaskDateFilterOptions) {
  if (!filters?.sortBy) return desc(tasks.createdAt);
  const col = filters.sortBy === 'startDate' ? tasks.startDate
    : filters.sortBy === 'endDate' ? tasks.endDate
    : tasks.createdAt;
  return filters.sortOrder === 'asc' ? asc(col) : desc(col);
}

export async function getTasks(projectId: number): Promise<Task[]> {
  return await db.select().from(tasks).where(
    and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))
  ).orderBy(sql`COALESCE(${tasks.taskIndex}, 999999) ASC, ${tasks.createdAt} ASC`);
}

export async function getTasksByProject(projectId: number): Promise<Task[]> {
  return getTasks(projectId);
}

export async function getAllTasks(): Promise<Task[]> {
  return await db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(desc(tasks.createdAt));
}

export async function getTasksByOrganization(organizationId: number): Promise<Task[]> {
  const orgProjectIds = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));
  if (orgProjectIds.length === 0) return [];
  const pIds = orgProjectIds.map(p => p.id);
  return await db.select().from(tasks).where(
    and(chunkedInArray(tasks.projectId, pIds), isNull(tasks.deletedAt))
  );
}

export async function getTasksByOrganizationPaginated(organizationId: number, limit: number, offset: number, onlyTaskIds?: number[], dateFilters?: TaskDateFilterOptions): Promise<{ tasks: Task[]; total: number }> {
  const orgProjectIds = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));
  const projectIdList = orgProjectIds.map(p => p.id);
  if (projectIdList.length === 0) return { tasks: [], total: 0 };

  const conditions: any[] = [
    chunkedInArray(tasks.projectId, projectIdList),
    isNull(tasks.deletedAt),
    ...buildDateFilterConditions(dateFilters),
  ];
  if (onlyTaskIds && onlyTaskIds.length > 0) {
    conditions.push(chunkedInArray(tasks.id, onlyTaskIds));
  }
  const baseConditions = and(...conditions);

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(baseConditions);
  const total = countResult?.count ?? 0;

  const result = await db.select().from(tasks)
    .where(baseConditions)
    .orderBy(getTaskSortOrder(dateFilters))
    .limit(limit)
    .offset(offset);

  return { tasks: result, total };
}

export async function getTasksByMultipleOrganizationsPaginated(
  orgIds: number[], limit: number, offset: number,
  restrictedTaskIds?: number[], unrestrictedOrgIds?: number[],
  dateFilters?: TaskDateFilterOptions
): Promise<{ tasks: Task[]; total: number }> {
  if (orgIds.length === 0) return { tasks: [], total: 0 };

  const orgProjectRows = await db.select({ id: projects.id, organizationId: projects.organizationId })
    .from(projects)
    .where(and(inArray(projects.organizationId, orgIds), isNull(projects.deletedAt)));

  if (orgProjectRows.length === 0) return { tasks: [], total: 0 };

  const unrestrictedOrgSet = new Set(unrestrictedOrgIds || orgIds);
  const unrestrictedProjectIds = orgProjectRows
    .filter(p => unrestrictedOrgSet.has(p.organizationId))
    .map(p => p.id);
  const restrictedProjectIds = orgProjectRows
    .filter(p => !unrestrictedOrgSet.has(p.organizationId))
    .map(p => p.id);

  const hasUnrestricted = unrestrictedProjectIds.length > 0;
  const hasRestricted = restrictedProjectIds.length > 0 && restrictedTaskIds && restrictedTaskIds.length > 0;

  if (!hasUnrestricted && !hasRestricted) return { tasks: [], total: 0 };

  const dateConditions = buildDateFilterConditions(dateFilters);

  let baseConditions;
  if (hasUnrestricted && hasRestricted) {
    baseConditions = and(
      isNull(tasks.deletedAt),
      or(
        chunkedInArray(tasks.projectId, unrestrictedProjectIds),
        and(
          chunkedInArray(tasks.projectId, restrictedProjectIds),
          chunkedInArray(tasks.id, restrictedTaskIds!)
        )
      ),
      ...dateConditions
    );
  } else if (hasUnrestricted) {
    baseConditions = and(
      isNull(tasks.deletedAt),
      chunkedInArray(tasks.projectId, unrestrictedProjectIds),
      ...dateConditions
    );
  } else {
    baseConditions = and(
      isNull(tasks.deletedAt),
      chunkedInArray(tasks.projectId, restrictedProjectIds),
      chunkedInArray(tasks.id, restrictedTaskIds!),
      ...dateConditions
    );
  }

  const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(baseConditions);
  const total = countResult?.count ?? 0;

  const result = await db.select().from(tasks)
    .where(baseConditions)
    .orderBy(getTaskSortOrder(dateFilters))
    .limit(limit)
    .offset(offset);

  return { tasks: result, total };
}

export async function getTask(id: number): Promise<Task | undefined> {
  const [task] = await db.select().from(tasks).where(
    and(eq(tasks.id, id), isNull(tasks.deletedAt))
  );
  return task;
}

export async function createTask(task: InsertTask): Promise<Task> {
  const [newTask] = await db.insert(tasks).values(task).returning();
  return newTask;
}

export async function updateTask(id: number, updates: UpdateTaskRequest): Promise<Task> {
  const [updated] = await db.update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))
    .returning();
  return updated;
}

export async function bulkUpdateTasks(taskIds: number[], updates: UpdateTaskRequest): Promise<Task[]> {
  if (taskIds.length === 0) return [];
  const updated = await db.update(tasks)
    .set(updates)
    .where(inArray(tasks.id, taskIds))
    .returning();
  return updated;
}

export async function bulkSoftDeleteTasks(taskIds: number[], userId: string): Promise<number> {
  if (taskIds.length === 0) return 0;
  await db.update(tasks).set({ parentId: null }).where(inArray(tasks.parentId, taskIds));
  const now = new Date();
  const updated = await db.update(tasks)
    .set({ deletedAt: now, deletedBy: userId })
    .where(inArray(tasks.id, taskIds))
    .returning();
  return updated.length;
}

export async function batchUpdateTaskWbs(updates: Array<{ id: number; wbs: string }>): Promise<void> {
  if (updates.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const ids = batch.map(u => u.id);
    let caseSql = sql`CASE`;
    for (const u of batch) {
      caseSql = sql`${caseSql} WHEN ${tasks.id} = ${u.id} THEN ${u.wbs}`;
    }
    caseSql = sql`${caseSql} ELSE ${tasks.wbs} END`;
    await db.update(tasks).set({ wbs: caseSql } as any).where(inArray(tasks.id, ids));
  }
}

export async function batchUpdateTaskParentIds(updates: Array<{ id: number; parentId: number | null }>): Promise<void> {
  if (updates.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const ids = batch.map(u => u.id);
    let caseSql = sql`CASE`;
    for (const u of batch) {
      caseSql = sql`${caseSql} WHEN ${tasks.id} = ${u.id} THEN ${u.parentId !== null ? sql`${u.parentId}` : sql`NULL`}`;
    }
    caseSql = sql`${caseSql} ELSE ${tasks.parentId} END`;
    await db.update(tasks).set({ parentId: caseSql } as any).where(inArray(tasks.id, ids));
  }
}

export interface BatchTaskFieldUpdate {
  id: number;
  startDate?: string | null;
  endDate?: string | null;
  durationDays?: number | null;
  progress?: number | null;
  estimatedHours?: string | null;
  actualHours?: string | null;
  cost?: string | null;
  actualCost?: string | null;
  isSummary?: boolean;
}

export async function batchUpdateTaskFields(updates: BatchTaskFieldUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const BATCH_SIZE = 200;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const ids = batch.map(u => u.id);
    const setObj: Record<string, any> = {};

    const fields: Array<{ key: string; col: any; defaultVal: any }> = [
      { key: 'startDate', col: tasks.startDate, defaultVal: tasks.startDate },
      { key: 'endDate', col: tasks.endDate, defaultVal: tasks.endDate },
      { key: 'durationDays', col: tasks.durationDays, defaultVal: tasks.durationDays },
      { key: 'progress', col: tasks.progress, defaultVal: tasks.progress },
      { key: 'estimatedHours', col: tasks.estimatedHours, defaultVal: tasks.estimatedHours },
      { key: 'actualHours', col: tasks.actualHours, defaultVal: tasks.actualHours },
      { key: 'cost', col: tasks.cost, defaultVal: tasks.cost },
      { key: 'actualCost', col: tasks.actualCost, defaultVal: tasks.actualCost },
      { key: 'isSummary', col: tasks.isSummary, defaultVal: tasks.isSummary },
    ];

    for (const field of fields) {
      const hasField = batch.some(u => (u as any)[field.key] !== undefined);
      if (!hasField) continue;

      let caseSql = sql`CASE`;
      for (const u of batch) {
        const val = (u as any)[field.key];
        if (val !== undefined) {
          caseSql = val === null
            ? sql`${caseSql} WHEN ${tasks.id} = ${u.id} THEN NULL`
            : sql`${caseSql} WHEN ${tasks.id} = ${u.id} THEN ${val}`;
        }
      }
      caseSql = sql`${caseSql} ELSE ${field.defaultVal} END`;
      setObj[field.key] = caseSql;
    }

    if (Object.keys(setObj).length > 0) {
      await db.update(tasks).set(setObj as any).where(inArray(tasks.id, ids));
    }
  }
}

export async function getResourcesByUserId(userId: string, organizationId: number): Promise<Resource[]> {
  return await db.select().from(resources).where(
    and(eq(resources.userId, userId), eq(resources.organizationId, organizationId), isNull(resources.deletedAt))
  );
}

export async function getTaskResourceAssignmentsByOrgId(organizationId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]> {
  const assignments = await db.select()
    .from(taskResourceAssignments)
    .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
    .where(eq(resources.organizationId, organizationId));
  return assignments.map(a => ({
    ...a.task_resource_assignments,
    resource: a.resources
  }));
}

export async function deleteTask(id: number): Promise<void> {
  await db.update(tasks).set({ parentId: null }).where(eq(tasks.parentId, id));
  await db.delete(taskDependencies).where(eq(taskDependencies.taskId, id));
  await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, id));
  await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, id));
  await db.delete(tasks).where(eq(tasks.id, id));
}

export async function deleteAllTasksForProject(projectId: number): Promise<void> {
  const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
  const taskIds = projectTasks.map(t => t.id);
  
  if (taskIds.length > 0) {
    await db.delete(taskDependencies).where(inArray(taskDependencies.taskId, taskIds));
    await db.delete(taskDependencies).where(inArray(taskDependencies.dependsOnTaskId, taskIds));
    await db.delete(taskChangeLogs).where(inArray(taskChangeLogs.taskId, taskIds));
    await db.delete(taskResourceAssignments).where(inArray(taskResourceAssignments.taskId, taskIds));
    await db.delete(tasks).where(eq(tasks.projectId, projectId));
  }
}

export async function getTaskChangeLogs(taskId: number): Promise<TaskChangeLog[]> {
  return await db.select().from(taskChangeLogs)
    .where(eq(taskChangeLogs.taskId, taskId))
    .orderBy(desc(taskChangeLogs.changedAt));
}

export async function createTaskChangeLog(log: InsertTaskChangeLog): Promise<TaskChangeLog> {
  const [newLog] = await db.insert(taskChangeLogs).values(log).returning();
  return newLog;
}

export async function getProjectChangeLogs(projectId: number): Promise<ProjectChangeLog[]> {
  return await db.select().from(projectChangeLogs)
    .where(eq(projectChangeLogs.projectId, projectId))
    .orderBy(desc(projectChangeLogs.changedAt));
}

export async function createProjectChangeLog(log: InsertProjectChangeLog): Promise<ProjectChangeLog> {
  const [newLog] = await db.insert(projectChangeLogs).values(log).returning();
  return newLog;
}

export async function getRiskChangeLogs(riskId: number): Promise<RiskChangeLog[]> {
  return await db.select().from(issueChangeLogs)
    .where(eq(issueChangeLogs.issueId, riskId))
    .orderBy(desc(issueChangeLogs.changedAt));
}

export async function createRiskChangeLog(log: InsertRiskChangeLog): Promise<RiskChangeLog> {
  const [newLog] = await db.insert(issueChangeLogs).values(log).returning();
  return newLog;
}

export async function getIssueChangeLogs(issueId: number): Promise<IssueChangeLog[]> {
  return await db.select().from(issueChangeLogs)
    .where(eq(issueChangeLogs.issueId, issueId))
    .orderBy(desc(issueChangeLogs.changedAt));
}

export async function createIssueChangeLog(log: InsertIssueChangeLog): Promise<IssueChangeLog> {
  const [newLog] = await db.insert(issueChangeLogs).values(log).returning();
  return newLog;
}

export async function getRecentOrgActivity(organizationId: number, limit: number): Promise<{ type: string; entityName: string; entityId: number; action: string; summary: string; changedBy: string; changedAt: Date | null }[]> {
  const orgProjects = await db.select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));
  if (orgProjects.length === 0) return [];
  const projectIds = orgProjects.map(p => p.id);
  const projectNameMap = new Map(orgProjects.map(p => [p.id, p.name]));

  const [projLogs, recentTasks, issueLogs] = await Promise.all([
    db.select().from(projectChangeLogs)
      .where(inArray(projectChangeLogs.projectId, projectIds))
      .orderBy(desc(projectChangeLogs.changedAt))
      .limit(limit * 3),
    db.select({ id: tasks.id, name: tasks.name, projectId: tasks.projectId })
      .from(tasks)
      .where(and(inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt)))
      .limit(limit * 5),
    db.select({ log: issueChangeLogs, issueTitle: issues.title, issueProjectId: issues.projectId, itemType: issues.itemType })
      .from(issueChangeLogs)
      .innerJoin(issues, eq(issueChangeLogs.issueId, issues.id))
      .where(inArray(issues.projectId, projectIds))
      .orderBy(desc(issueChangeLogs.changedAt))
      .limit(limit * 3),
  ]);

  const taskIds = recentTasks.map(t => t.id);
  const taskNameMap = new Map(recentTasks.map(t => [t.id, { name: t.name, projectId: t.projectId }]));

  const taskLogs = taskIds.length > 0
    ? await db.select().from(taskChangeLogs)
        .where(inArray(taskChangeLogs.taskId, taskIds))
        .orderBy(desc(taskChangeLogs.changedAt))
        .limit(limit * 3)
    : [];

  const allActivity: { type: string; entityName: string; entityId: number; action: string; summary: string; changedBy: string; changedAt: Date | null }[] = [];

  for (const log of projLogs) {
    allActivity.push({
      type: 'project',
      entityName: projectNameMap.get(log.projectId) || `Project #${log.projectId}`,
      entityId: log.projectId,
      action: log.changeType || 'updated',
      summary: log.changeSummary || `Project ${log.changeType || 'updated'}`,
      changedBy: log.changedByName || 'Unknown',
      changedAt: log.changedAt,
    });
  }
  for (const log of taskLogs) {
    const task = taskNameMap.get(log.taskId);
    allActivity.push({
      type: 'task',
      entityName: task?.name || `Task #${log.taskId}`,
      entityId: task?.projectId || 0,
      action: log.changeType || 'updated',
      summary: log.changeSummary || `Task ${log.changeType || 'updated'}`,
      changedBy: log.changedByName || 'Unknown',
      changedAt: log.changedAt,
    });
  }
  for (const { log, issueTitle, issueProjectId, itemType } of issueLogs) {
    allActivity.push({
      type: itemType === 'risk' ? 'risk' : 'issue',
      entityName: issueTitle || `Issue #${log.issueId}`,
      entityId: issueProjectId || 0,
      action: log.changeType || 'updated',
      summary: log.changeSummary || `${itemType === 'risk' ? 'Risk' : 'Issue'} ${log.changeType || 'updated'}`,
      changedBy: log.changedByName || 'Unknown',
      changedAt: log.changedAt,
    });
  }

  allActivity.sort((a, b) => {
    const dateA = a.changedAt ? new Date(a.changedAt).getTime() : 0;
    const dateB = b.changedAt ? new Date(b.changedAt).getTime() : 0;
    return dateB - dateA;
  });
  return allActivity.slice(0, limit);
}

export async function getTaskDependencies(taskId: number): Promise<TaskDependency[]> {
  return await db.select().from(taskDependencies)
    .where(eq(taskDependencies.taskId, taskId));
}

export async function getTaskDependents(taskId: number): Promise<TaskDependency[]> {
  return await db.select().from(taskDependencies)
    .where(eq(taskDependencies.dependsOnTaskId, taskId));
}

export async function getProjectDependencies(projectId: number): Promise<TaskDependency[]> {
  const projectTasks = await db.select().from(tasks)
    .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
  const taskIds = projectTasks.map(t => t.id);
  
  if (taskIds.length === 0) return [];
  
  return await db.select().from(taskDependencies)
    .where(or(
      inArray(taskDependencies.taskId, taskIds),
      inArray(taskDependencies.dependsOnTaskId, taskIds)
    ));
}

export async function createTaskDependency(dependency: InsertTaskDependency): Promise<TaskDependency> {
  const [newDep] = await db.insert(taskDependencies).values(dependency).returning();
  return newDep;
}

export async function updateTaskDependency(taskId: number, dependsOnTaskId: number, updates: { dependencyType?: string; lagDays?: number }): Promise<TaskDependency | undefined> {
  const cleanUpdates: Record<string, any> = {};
  if (updates.dependencyType !== undefined) cleanUpdates.dependencyType = updates.dependencyType;
  if (updates.lagDays !== undefined) cleanUpdates.lagDays = updates.lagDays;
  if (Object.keys(cleanUpdates).length === 0) {
    const existing = await db.select().from(taskDependencies)
      .where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, dependsOnTaskId)));
    return existing[0];
  }
  const [updated] = await db.update(taskDependencies)
    .set(cleanUpdates)
    .where(and(
      eq(taskDependencies.taskId, taskId),
      eq(taskDependencies.dependsOnTaskId, dependsOnTaskId)
    ))
    .returning();
  return updated;
}

export async function deleteTaskDependency(taskId: number, dependsOnTaskId: number): Promise<void> {
  await db.delete(taskDependencies)
    .where(and(
      eq(taskDependencies.taskId, taskId),
      eq(taskDependencies.dependsOnTaskId, dependsOnTaskId)
    ));
}
