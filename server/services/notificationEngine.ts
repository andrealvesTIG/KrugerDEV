import { db } from '../db';
import { storage } from '../storage';
import { tasks, projects, portfolios, issues, taskResourceAssignments, resources, users, notifications, organizationMembers } from '@shared/schema';
import { eq, and, lt, lte, gte, isNull, or, not, inArray, sql } from 'drizzle-orm';
import { addDays, format, startOfDay } from 'date-fns';

export interface NotificationResult {
  created: number;
  skipped: number;
  errors: string[];
}

async function getResourceUserIds(resourceIds: number[]): Promise<Map<number, string>> {
  if (resourceIds.length === 0) return new Map();
  
  const resourceUsers = await db
    .select({ id: resources.id, userId: resources.userId })
    .from(resources)
    .where(and(
      inArray(resources.id, resourceIds),
      not(isNull(resources.userId))
    ));
  
  return new Map(resourceUsers.filter(r => r.userId).map(r => [r.id, r.userId!]));
}

async function notificationExists(
  userId: string, 
  type: string, 
  referenceId: number,
  referenceType: 'task' | 'project' | 'risk_issue' | 'milestone' | 'portfolio',
  withinHours: number = 24
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  
  let condition;
  switch (referenceType) {
    case 'task':
      condition = eq(notifications.taskId, referenceId);
      break;
    case 'project':
      condition = eq(notifications.projectId, referenceId);
      break;
    case 'risk_issue':
      condition = eq(notifications.riskIssueId, referenceId);
      break;
    case 'milestone':
      condition = eq(notifications.milestoneId, referenceId);
      break;
    case 'portfolio':
      condition = eq(notifications.portfolioId, referenceId);
      break;
  }
  
  const existing = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.type, type),
      condition,
      gte(notifications.createdAt, cutoff)
    ))
    .limit(1);
  
  return existing.length > 0;
}

export async function checkOverdueTasks(organizationId: number): Promise<NotificationResult> {
  const result: NotificationResult = { created: 0, skipped: 0, errors: [] };
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  
  try {
    const overdueTasks = await db
      .select({
        task: tasks,
        project: projects,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.organizationId, organizationId),
        lt(tasks.endDate, todayStr),
        not(eq(tasks.status, 'Completed')),
        not(eq(tasks.status, 'Cancelled')),
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt)
      ));
    
    for (const { task, project } of overdueTasks) {
      const assignments = await db
        .select({ resourceId: taskResourceAssignments.resourceId })
        .from(taskResourceAssignments)
        .where(eq(taskResourceAssignments.taskId, task.id));
      
      const resourceIds = assignments.map(a => a.resourceId);
      const resourceUserMap = await getResourceUserIds(resourceIds);
      
      for (const entry of Array.from(resourceUserMap.entries())) {
      const [resourceId, userId] = entry;
        try {
          const exists = await notificationExists(userId, 'task_overdue', task.id, 'task');
          if (exists) {
            result.skipped++;
            continue;
          }
          
          await storage.createNotification({
            userId,
            organizationId,
            type: 'task_overdue',
            title: 'Task Overdue',
            message: `Task "${task.name}" in project "${project.name}" is overdue (due: ${task.endDate})`,
            projectId: project.id,
            taskId: task.id,
            severity: 'critical',
            actionUrl: `/projects/${project.id}`,
          });
          result.created++;
        } catch (err) {
          result.errors.push(`Error creating notification for task ${task.id}: ${err}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`Error checking overdue tasks: ${err}`);
  }
  
  return result;
}

export async function checkUpcomingDeadlines(organizationId: number, daysAhead: number = 3): Promise<NotificationResult> {
  const result: NotificationResult = { created: 0, skipped: 0, errors: [] };
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const futureDate = addDays(today, daysAhead);
  const futureDateStr = format(futureDate, 'yyyy-MM-dd');
  
  try {
    const upcomingTasks = await db
      .select({
        task: tasks,
        project: projects,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.organizationId, organizationId),
        gte(tasks.endDate, todayStr),
        lte(tasks.endDate, futureDateStr),
        not(eq(tasks.status, 'Completed')),
        not(eq(tasks.status, 'Cancelled')),
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt)
      ));
    
    for (const { task, project } of upcomingTasks) {
      const assignments = await db
        .select({ resourceId: taskResourceAssignments.resourceId })
        .from(taskResourceAssignments)
        .where(eq(taskResourceAssignments.taskId, task.id));
      
      const resourceIds = assignments.map(a => a.resourceId);
      const resourceUserMap = await getResourceUserIds(resourceIds);
      
      for (const entry of Array.from(resourceUserMap.entries())) {
      const [resourceId, userId] = entry;
        try {
          const exists = await notificationExists(userId, 'task_deadline_warning', task.id, 'task');
          if (exists) {
            result.skipped++;
            continue;
          }
          
          await storage.createNotification({
            userId,
            organizationId,
            type: 'task_deadline_warning',
            title: 'Task Deadline Approaching',
            message: `Task "${task.name}" in project "${project.name}" is due on ${task.endDate}`,
            projectId: project.id,
            taskId: task.id,
            severity: 'warning',
            actionUrl: `/projects/${project.id}`,
          });
          result.created++;
        } catch (err) {
          result.errors.push(`Error creating deadline warning for task ${task.id}: ${err}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`Error checking upcoming deadlines: ${err}`);
  }
  
  return result;
}

export async function checkProjectHealth(organizationId: number): Promise<NotificationResult> {
  const result: NotificationResult = { created: 0, skipped: 0, errors: [] };
  
  try {
    const redProjects = await db
      .select()
      .from(projects)
      .where(and(
        eq(projects.organizationId, organizationId),
        eq(projects.health, 'Red'),
        isNull(projects.deletedAt)
      ));
    
    const orgMembers = await db
      .select({ userId: organizationMembers.userId, role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));
    
    const adminUsers = orgMembers.filter(m => 
      m.role === 'owner' || m.role === 'org_admin' || m.role === 'admin'
    );
    
    for (const project of redProjects) {
      for (const { userId } of adminUsers) {
        try {
          const exists = await notificationExists(userId, 'project_health_alert', project.id, 'project');
          if (exists) {
            result.skipped++;
            continue;
          }
          
          await storage.createNotification({
            userId,
            organizationId,
            type: 'project_health_alert',
            title: 'Project At Risk',
            message: `Project "${project.name}" health status is RED${project.healthReason ? `: ${project.healthReason}` : ''}`,
            projectId: project.id,
            severity: 'critical',
            actionUrl: `/projects/${project.id}`,
          });
          result.created++;
        } catch (err) {
          result.errors.push(`Error creating health alert for project ${project.id}: ${err}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`Error checking project health: ${err}`);
  }
  
  return result;
}

export async function checkMilestones(organizationId: number): Promise<NotificationResult> {
  const result: NotificationResult = { created: 0, skipped: 0, errors: [] };
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const nextWeek = addDays(today, 7);
  const nextWeekStr = format(nextWeek, 'yyyy-MM-dd');
  
  try {
    const upcomingMilestones = await db
      .select({
        milestone: tasks,
        project: projects,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.organizationId, organizationId),
        eq(tasks.isMilestone, true),
        eq(tasks.taskType, 'Milestone'),
        gte(tasks.endDate, todayStr),
        lte(tasks.endDate, nextWeekStr),
        not(eq(tasks.status, 'Done')),
        sql`(${tasks.progress} IS NULL OR ${tasks.progress} < 100)`,
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt)
      ));
    
    const orgMembers = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));
    
    for (const { milestone, project } of upcomingMilestones) {
      for (const { userId } of orgMembers) {
        try {
          const exists = await notificationExists(userId, 'milestone_approaching', milestone.id, 'milestone');
          if (exists) {
            result.skipped++;
            continue;
          }
          
          await storage.createNotification({
            userId,
            organizationId,
            type: 'milestone_approaching',
            title: 'Milestone Approaching',
            message: `Milestone "${milestone.name}" in project "${project.name}" is due on ${milestone.endDate}`,
            projectId: project.id,
            milestoneId: milestone.id,
            severity: 'warning',
            actionUrl: `/projects/${project.id}`,
          });
          result.created++;
        } catch (err) {
          result.errors.push(`Error creating milestone notification: ${err}`);
        }
      }
    }
    
    const overdueMilestones = await db
      .select({
        milestone: tasks,
        project: projects,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.organizationId, organizationId),
        eq(tasks.isMilestone, true),
        eq(tasks.taskType, 'Milestone'),
        lt(tasks.endDate, todayStr),
        not(eq(tasks.status, 'Done')),
        sql`(${tasks.progress} IS NULL OR ${tasks.progress} < 100)`,
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt)
      ));
    
    for (const { milestone, project } of overdueMilestones) {
      for (const { userId } of orgMembers) {
        try {
          const exists = await notificationExists(userId, 'milestone_overdue', milestone.id, 'milestone');
          if (exists) {
            result.skipped++;
            continue;
          }
          
          await storage.createNotification({
            userId,
            organizationId,
            type: 'milestone_overdue',
            title: 'Milestone Overdue',
            message: `Milestone "${milestone.name}" in project "${project.name}" is overdue (was due: ${milestone.endDate})`,
            projectId: project.id,
            milestoneId: milestone.id,
            severity: 'critical',
            actionUrl: `/projects/${project.id}`,
          });
          result.created++;
        } catch (err) {
          result.errors.push(`Error creating overdue milestone notification: ${err}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`Error checking milestones: ${err}`);
  }
  
  return result;
}

export async function createTaskAssignmentNotification(
  taskId: number,
  resourceId: number,
  assignedByUserId: string,
  assignedByUserName: string
): Promise<void> {
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task[0]) return;
  
  const project = await db.select().from(projects).where(eq(projects.id, task[0].projectId)).limit(1);
  if (!project[0]) return;
  
  const resource = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
  if (!resource[0] || !resource[0].userId) return;
  
  const exists = await notificationExists(resource[0].userId, 'task_assignment', taskId, 'task', 1);
  if (exists) return;
  
  await storage.createNotification({
    userId: resource[0].userId,
    organizationId: project[0].organizationId,
    type: 'task_assignment',
    title: 'New Task Assignment',
    message: `${assignedByUserName} assigned you to task "${task[0].name}" in project "${project[0].name}"`,
    projectId: project[0].id,
    taskId: taskId,
    fromUserId: assignedByUserId,
    fromUserName: assignedByUserName,
    severity: 'info',
    actionUrl: `/projects/${project[0].id}`,
  });
}

export async function createRiskAssignmentNotification(
  riskIssueId: number,
  assigneeUserId: string,
  assignedByUserId: string,
  assignedByUserName: string
): Promise<void> {
  const riskIssue = await db.select().from(issues).where(eq(issues.id, riskIssueId)).limit(1);
  if (!riskIssue[0]) return;
  
  const project = await db.select().from(projects).where(eq(projects.id, riskIssue[0].projectId)).limit(1);
  if (!project[0]) return;
  
  const notificationType = riskIssue[0].itemType === 'risk' ? 'risk_assignment' : 'issue_assignment';
  const itemLabel = riskIssue[0].itemType === 'risk' ? 'Risk' : 'Issue';
  
  const exists = await notificationExists(assigneeUserId, notificationType, riskIssueId, 'risk_issue', 1);
  if (exists) return;
  
  await storage.createNotification({
    userId: assigneeUserId,
    organizationId: project[0].organizationId,
    type: notificationType,
    title: `New ${itemLabel} Assignment`,
    message: `${assignedByUserName} assigned you to ${itemLabel.toLowerCase()} "${riskIssue[0].title}" in project "${project[0].name}"`,
    projectId: project[0].id,
    riskIssueId: riskIssueId,
    fromUserId: assignedByUserId,
    fromUserName: assignedByUserName,
    severity: riskIssue[0].priority === 'High' || riskIssue[0].priority === 'Critical' ? 'warning' : 'info',
    actionUrl: `/projects/${project[0].id}`,
  });
}

export async function createProjectAssignmentNotification(
  projectId: number,
  assigneeUserId: string,
  assignedByUserId: string,
  assignedByUserName: string
): Promise<void> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project[0]) return;
  
  const exists = await notificationExists(assigneeUserId, 'project_assignment', projectId, 'project', 1);
  if (exists) return;
  
  await storage.createNotification({
    userId: assigneeUserId,
    organizationId: project[0].organizationId,
    type: 'project_assignment',
    title: 'Added to Project',
    message: `${assignedByUserName} added you to project "${project[0].name}"`,
    projectId: projectId,
    fromUserId: assignedByUserId,
    fromUserName: assignedByUserName,
    severity: 'info',
    actionUrl: `/projects/${projectId}`,
  });
}

export async function runAllNotificationChecks(organizationId: number): Promise<{
  overdue: NotificationResult;
  deadlines: NotificationResult;
  health: NotificationResult;
  milestones: NotificationResult;
  totalCreated: number;
  totalSkipped: number;
  totalErrors: number;
}> {
  const [overdue, deadlines, health, milestonesResult] = await Promise.all([
    checkOverdueTasks(organizationId),
    checkUpcomingDeadlines(organizationId),
    checkProjectHealth(organizationId),
    checkMilestones(organizationId),
  ]);
  
  return {
    overdue,
    deadlines,
    health,
    milestones: milestonesResult,
    totalCreated: overdue.created + deadlines.created + health.created + milestonesResult.created,
    totalSkipped: overdue.skipped + deadlines.skipped + health.skipped + milestonesResult.skipped,
    totalErrors: overdue.errors.length + deadlines.errors.length + health.errors.length + milestonesResult.errors.length,
  };
}
