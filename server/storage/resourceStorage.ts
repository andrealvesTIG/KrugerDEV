import { db } from "../db";
import {
  users, organizations, organizationMembers,
  tasks, projects, issues,
  resources, taskResourceAssignments, issueResourceAssignments,
  resourceSkills, resourceAvailability,
  timesheetEntries, nonProjectTimeEntries,
  type Resource, type InsertResource, type UpdateResourceRequest,
  type ResourceSkill, type InsertResourceSkill,
  type ResourceAvailability, type InsertResourceAvailability,
  type TaskResourceAssignment, type InsertTaskResourceAssignment,
  type IssueResourceAssignment, type InsertIssueResourceAssignment,
  type RiskResourceAssignment, type InsertRiskResourceAssignment,
  type Task, type Project,
} from "@shared/schema";
import { eq, and, desc, asc, isNull, inArray, sql } from "drizzle-orm";
import { getTask } from "./taskStorage";

let syncLocks: Map<number, Promise<void>> = new Map();

async function doSyncOrganizationMembersAsResources(organizationId: number): Promise<void> {
  const members = await db.select({
    userId: organizationMembers.userId,
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
  })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId));

  const existingResources = await db.select()
    .from(resources)
    .where(and(
      eq(resources.organizationId, organizationId),
      isNull(resources.deletedAt)
    ));

  const existingByUserId = new Set(existingResources.filter(r => r.userId).map(r => r.userId));
  const existingByEmail = new Map(existingResources.filter(r => r.email).map(r => [r.email?.toLowerCase(), r]));

  for (const member of members) {
    if (existingByUserId.has(member.userId)) continue;
    
    if (member.email) {
      const matchingResource = existingByEmail.get(member.email.toLowerCase());
      if (matchingResource && !matchingResource.userId) {
        await db.update(resources)
          .set({ userId: member.userId })
          .where(eq(resources.id, matchingResource.id));
        existingByUserId.add(member.userId);
        continue;
      }
    }
    
    if (member.email && existingByEmail.has(member.email.toLowerCase())) continue;

    const displayName = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || member.userId;
    await db.insert(resources).values({
      organizationId,
      userId: member.userId,
      displayName,
      email: member.email || null,
      isActive: true,
    });
    
    existingByUserId.add(member.userId);
    if (member.email) existingByEmail.set(member.email.toLowerCase(), { id: 0 } as any);
  }
}

export async function syncOrganizationMembersAsResources(organizationId: number): Promise<void> {
  const existingLock = syncLocks.get(organizationId);
  if (existingLock) {
    await existingLock;
    return;
  }
  
  const syncPromise = doSyncOrganizationMembersAsResources(organizationId);
  syncLocks.set(organizationId, syncPromise);
  
  try {
    await syncPromise;
  } finally {
    syncLocks.delete(organizationId);
  }
}

export async function deduplicateResources(organizationId: number): Promise<number> {
  const allResources = await db.select()
    .from(resources)
    .where(and(
      eq(resources.organizationId, organizationId),
      isNull(resources.deletedAt)
    ))
    .orderBy(resources.id);

  const byEmail = new Map<string, typeof allResources>();
  for (const r of allResources) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(r);
  }

  let deletedCount = 0;

  for (const group of Array.from(byEmail.values())) {
    if (group.length <= 1) continue;

    const [keep, ...toDelete] = group;
    
    for (const dup of toDelete) {
      await db.update(taskResourceAssignments)
        .set({ resourceId: keep.id })
        .where(eq(taskResourceAssignments.resourceId, dup.id));
      await db.update(issueResourceAssignments)
        .set({ resourceId: keep.id })
        .where(eq(issueResourceAssignments.resourceId, dup.id));
      await db.update(timesheetEntries)
        .set({ resourceId: keep.id })
        .where(eq(timesheetEntries.resourceId, dup.id));
      await db.delete(resourceSkills).where(eq(resourceSkills.resourceId, dup.id));
      await db.delete(resourceAvailability).where(eq(resourceAvailability.resourceId, dup.id));

      await db.delete(resources).where(eq(resources.id, dup.id));
      deletedCount++;
    }
  }

  return deletedCount;
}

export async function getResources(organizationId: number): Promise<Resource[]> {
  await deduplicateResources(organizationId);
  await syncOrganizationMembersAsResources(organizationId);
  
  return await db.select().from(resources)
    .where(and(
      eq(resources.organizationId, organizationId),
      isNull(resources.deletedAt)
    ))
    .orderBy(resources.displayName);
}

export async function getResource(id: number): Promise<Resource | undefined> {
  const [resource] = await db.select().from(resources).where(eq(resources.id, id));
  return resource;
}

export async function createResource(resource: InsertResource): Promise<Resource> {
  const [newResource] = await db.insert(resources).values(resource).returning();
  return newResource;
}

export async function updateResource(id: number, updates: UpdateResourceRequest): Promise<Resource> {
  const [updated] = await db.update(resources)
    .set(updates)
    .where(eq(resources.id, id))
    .returning();
  return updated;
}

export async function deleteResource(id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ managerResourceId: null }).where(eq(projects.managerResourceId, id));
    await tx.update(projects).set({ sponsorResourceId: null }).where(eq(projects.sponsorResourceId, id));
    await tx.delete(taskResourceAssignments).where(eq(taskResourceAssignments.resourceId, id));
    await tx.delete(issueResourceAssignments).where(eq(issueResourceAssignments.resourceId, id));
    await tx.update(resources)
      .set({ deletedAt: new Date() })
      .where(eq(resources.id, id));
  });
}

export async function mergeResources(primaryId: number, secondaryId: number): Promise<Resource> {
  const primary = await getResource(primaryId);
  const secondary = await getResource(secondaryId);
  
  if (!primary || !secondary) {
    throw new Error("One or both resources not found");
  }
  
  return await db.transaction(async (tx) => {
    const existingTaskAssignments = await tx.select()
      .from(taskResourceAssignments)
      .where(eq(taskResourceAssignments.resourceId, primaryId));
    const existingTaskIds = new Set(existingTaskAssignments.map(a => a.taskId));
    
    const secondaryTaskAssignments = await tx.select()
      .from(taskResourceAssignments)
      .where(eq(taskResourceAssignments.resourceId, secondaryId));
    
    for (const assignment of secondaryTaskAssignments) {
      if (!existingTaskIds.has(assignment.taskId)) {
        await tx.update(taskResourceAssignments)
          .set({ resourceId: primaryId })
          .where(and(
            eq(taskResourceAssignments.taskId, assignment.taskId),
            eq(taskResourceAssignments.resourceId, secondaryId)
          ));
      } else {
        await tx.delete(taskResourceAssignments)
          .where(and(
            eq(taskResourceAssignments.taskId, assignment.taskId),
            eq(taskResourceAssignments.resourceId, secondaryId)
          ));
      }
    }
    
    const existingIssueAssignments = await tx.select()
      .from(issueResourceAssignments)
      .where(eq(issueResourceAssignments.resourceId, primaryId));
    const existingIssueIds = new Set(existingIssueAssignments.map(a => a.issueId));
    
    const secondaryIssueAssignments = await tx.select()
      .from(issueResourceAssignments)
      .where(eq(issueResourceAssignments.resourceId, secondaryId));
    
    for (const assignment of secondaryIssueAssignments) {
      if (!existingIssueIds.has(assignment.issueId)) {
        await tx.update(issueResourceAssignments)
          .set({ resourceId: primaryId })
          .where(and(
            eq(issueResourceAssignments.issueId, assignment.issueId),
            eq(issueResourceAssignments.resourceId, secondaryId)
          ));
      } else {
        await tx.delete(issueResourceAssignments)
          .where(and(
            eq(issueResourceAssignments.issueId, assignment.issueId),
            eq(issueResourceAssignments.resourceId, secondaryId)
          ));
      }
    }
    
    const updates: Partial<Resource> = {};
    if (!primary.email && secondary.email) updates.email = secondary.email;
    if (!primary.title && secondary.title) updates.title = secondary.title;
    if (!primary.department && secondary.department) updates.department = secondary.department;
    if (!primary.skills && secondary.skills) updates.skills = secondary.skills;
    if (!primary.hourlyRate && secondary.hourlyRate) updates.hourlyRate = secondary.hourlyRate;
    if (!primary.notes && secondary.notes) updates.notes = secondary.notes;
    if (!primary.userId && secondary.userId) updates.userId = secondary.userId;
    
    if (Object.keys(updates).length > 0) {
      await tx.update(resources).set(updates).where(eq(resources.id, primaryId));
    }
    
    if (secondary.userId) {
      await tx.update(resources).set({ userId: null }).where(eq(resources.id, secondaryId));
    }
    
    await tx.delete(resources).where(eq(resources.id, secondaryId));
    
    const [updated] = await tx.select().from(resources).where(eq(resources.id, primaryId));
    return updated;
  });
}

export async function getResourceSkills(resourceId: number): Promise<ResourceSkill[]> {
  return await db.select().from(resourceSkills).where(eq(resourceSkills.resourceId, resourceId)).orderBy(resourceSkills.skillName);
}

export async function getResourceSkillsByOrg(organizationId: number): Promise<ResourceSkill[]> {
  return await db.select().from(resourceSkills).where(eq(resourceSkills.organizationId, organizationId)).orderBy(resourceSkills.skillName);
}

export async function addResourceSkill(skill: InsertResourceSkill): Promise<ResourceSkill> {
  const [created] = await db.insert(resourceSkills).values(skill).returning();
  return created;
}

export async function removeResourceSkill(id: number): Promise<void> {
  await db.delete(resourceSkills).where(eq(resourceSkills.id, id));
}

export async function updateResourceSkill(id: number, updates: Partial<InsertResourceSkill>): Promise<ResourceSkill> {
  const [updated] = await db.update(resourceSkills).set(updates).where(eq(resourceSkills.id, id)).returning();
  return updated;
}

export async function getResourceAvailability(resourceId: number): Promise<ResourceAvailability[]> {
  return await db.select().from(resourceAvailability).where(eq(resourceAvailability.resourceId, resourceId)).orderBy(desc(resourceAvailability.startDate));
}

export async function getResourceAvailabilityByOrg(organizationId: number, startDate?: string, endDate?: string): Promise<ResourceAvailability[]> {
  const conditions = [eq(resourceAvailability.organizationId, organizationId)];
  if (startDate) {
    conditions.push(sql`${resourceAvailability.endDate} >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(sql`${resourceAvailability.startDate} <= ${endDate}`);
  }
  return await db.select().from(resourceAvailability).where(and(...conditions)).orderBy(resourceAvailability.startDate);
}

export async function addResourceAvailability(entry: InsertResourceAvailability): Promise<ResourceAvailability> {
  const [created] = await db.insert(resourceAvailability).values(entry).returning();
  return created;
}

export async function updateResourceAvailability(id: number, updates: Partial<InsertResourceAvailability>): Promise<ResourceAvailability> {
  const [updated] = await db.update(resourceAvailability).set(updates).where(eq(resourceAvailability.id, id)).returning();
  return updated;
}

export async function removeResourceAvailability(id: number): Promise<void> {
  await db.delete(resourceAvailability).where(eq(resourceAvailability.id, id));
}

export async function getTaskResourceAssignments(taskId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]> {
  const assignments = await db.select()
    .from(taskResourceAssignments)
    .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
    .where(and(
      eq(taskResourceAssignments.taskId, taskId),
      isNull(resources.deletedAt)
    ));
  
  return assignments.map(a => ({
    ...a.task_resource_assignments,
    resource: a.resources
  }));
}

export async function getProjectTaskResourceAssignments(projectId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]> {
  const assignments = await db.select()
    .from(taskResourceAssignments)
    .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
    .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
    .where(and(
      eq(tasks.projectId, projectId),
      isNull(resources.deletedAt)
    ));
  
  return assignments.map(a => ({
    ...a.task_resource_assignments,
    resource: a.resources
  }));
}

export async function getAllTaskResourceAssignments(organizationId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]> {
  const assignments = await db.select()
    .from(taskResourceAssignments)
    .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
    .where(and(
      eq(resources.organizationId, organizationId),
      isNull(resources.deletedAt)
    ));
  
  return assignments.map(a => ({
    ...a.task_resource_assignments,
    resource: a.resources
  }));
}

export async function getAssignedTasksForResource(resourceId: number, organizationId: number, userId?: string): Promise<{ task: Task; project: Project }[]> {
  const assignedByResource = await db.select({
    task: tasks,
    project: projects
  })
    .from(taskResourceAssignments)
    .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(taskResourceAssignments.resourceId, resourceId),
      eq(projects.organizationId, organizationId),
      isNull(tasks.deletedAt),
      isNull(projects.deletedAt)
    ));
  
  let assignedByOwner: { task: Task; project: Project }[] = [];
  if (userId) {
    assignedByOwner = await db.select({
      task: tasks,
      project: projects
    })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(tasks.ownerId, userId),
        eq(projects.organizationId, organizationId),
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt)
      ));
  }
  
  const taskMap = new Map<number, { task: Task; project: Project }>();
  for (const item of assignedByResource) {
    taskMap.set(item.task.id, item);
  }
  for (const item of assignedByOwner) {
    taskMap.set(item.task.id, item);
  }
  
  return Array.from(taskMap.values()).sort((a, b) => {
    if (a.project.id !== b.project.id) {
      return a.project.name.localeCompare(b.project.name);
    }
    return (a.task.taskIndex ?? 999999) - (b.task.taskIndex ?? 999999);
  });
}

export async function addTaskResourceAssignment(assignment: InsertTaskResourceAssignment): Promise<TaskResourceAssignment> {
  const [newAssignment] = await db.insert(taskResourceAssignments).values(assignment).returning();
  return newAssignment;
}

export async function removeTaskResourceAssignment(taskId: number, resourceId: number): Promise<void> {
  await db.delete(taskResourceAssignments)
    .where(and(
      eq(taskResourceAssignments.taskId, taskId),
      eq(taskResourceAssignments.resourceId, resourceId)
    ));
}

export async function updateTaskResourceAssignments(taskId: number, resourceIds: number[], allocations?: { resourceId: number; allocationPercentage: number }[]): Promise<void> {
  const task = await getTask(taskId);
  if (!task) return;

  if (resourceIds.length > 0) {
    const project = await db.select().from(projects).where(eq(projects.id, task.projectId)).limit(1);
    const orgId = project[0]?.organizationId;
    const validResources = await db.select()
      .from(resources)
      .where(and(
        inArray(resources.id, resourceIds),
        isNull(resources.deletedAt),
        orgId ? eq(resources.organizationId, orgId) : undefined
      ));
    const validIds = new Set(validResources.map(r => r.id));
    const invalidIds = resourceIds.filter(id => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new Error(`Invalid resource IDs: ${invalidIds.join(', ')}. Resources must exist, belong to the same organization, and not be deleted.`);
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, taskId));
    
    const resourceIdSet = new Set(resourceIds);
    const assignmentData: { taskId: number; resourceId: number; allocationPercentage: number }[] = [];
    
    if (resourceIds.length > 0) {
      for (const resourceId of resourceIds) {
        const allocation = allocations?.find(a => a.resourceId === resourceId && resourceIdSet.has(a.resourceId));
        assignmentData.push({ 
          taskId, 
          resourceId,
          allocationPercentage: allocation?.allocationPercentage ?? 100
        });
      }
      await tx.insert(taskResourceAssignments).values(assignmentData);
    }
    
    if (resourceIds.length === 0) {
      await tx.update(tasks)
        .set({ estimatedHours: null })
        .where(eq(tasks.id, taskId));
      return;
    }
    
    let durationDays = task.durationDays != null ? Number(task.durationDays) : null;
    if (durationDays == null && task.startDate && task.endDate) {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      durationDays = diffDays + 1;
    }

    if ((durationDays == null || durationDays <= 0) && !(task.startDate && task.endDate)) {
      await tx.update(tasks)
        .set({ estimatedHours: null })
        .where(eq(tasks.id, taskId));
      return;
    }

    const assignedResources = await tx.select()
      .from(resources)
      .where(inArray(resources.id, resourceIds));

    // Phase 3a Slice 2: estimated hours are calendar-aware. The actual
    // estimation logic is the pure `estimateTaskAssignmentHours` helper in
    // `shared/lib/assignmentEstimation.ts` (unit-testable without DB stack);
    // here we just resolve the project calendar + dates and inject the
    // per-resource calendar / availability loaders.
    const calStorage = await import("./calendarStorage");
    const { estimateTaskAssignmentHours } = await import("@shared/lib/assignmentEstimation");
    const projCal = await calStorage.getResolvedCalendarForProject(task.projectId);
    const haveDates = !!(task.startDate && task.endDate);
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    if (haveDates) {
      const [sy, sm, sd] = String(task.startDate).slice(0, 10).split("-").map(Number);
      const [ey, em, ed] = String(task.endDate).slice(0, 10).split("-").map(Number);
      rangeStart = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
      rangeEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    }

    const totalEstimatedHours = await estimateTaskAssignmentHours({
      projCal,
      resources: assignedResources.map(r => ({
        id: r.id,
        calendarId: r.calendarId ?? null,
        weeklyCapacity: r.weeklyCapacity != null ? Number(r.weeklyCapacity) : null,
      })),
      allocations: assignmentData.map(a => ({ resourceId: a.resourceId, allocationPercentage: a.allocationPercentage })),
      rangeStart,
      rangeEnd,
      durationDays,
      loadResourceCalendar: (id) => calStorage.loadResolvedCalendar(id),
      loadResourceAvailability: (id) => getResourceAvailability(id) as any,
    });

    await tx.update(tasks)
      .set({ estimatedHours: totalEstimatedHours })
      .where(eq(tasks.id, taskId));
  });
}

export async function getIssueResourceAssignments(issueId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]> {
  const assignments = await db.select()
    .from(issueResourceAssignments)
    .innerJoin(resources, eq(issueResourceAssignments.resourceId, resources.id))
    .where(eq(issueResourceAssignments.issueId, issueId));
  
  return assignments.map(a => ({
    ...a.issue_resource_assignments,
    resource: a.resources
  }));
}

export async function getAllIssueResourceAssignments(organizationId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]> {
  const assignments = await db.select()
    .from(issueResourceAssignments)
    .innerJoin(resources, eq(issueResourceAssignments.resourceId, resources.id))
    .where(eq(resources.organizationId, organizationId));
  
  return assignments.map(a => ({
    ...a.issue_resource_assignments,
    resource: a.resources
  }));
}

export async function addIssueResourceAssignment(assignment: InsertIssueResourceAssignment): Promise<IssueResourceAssignment> {
  const [newAssignment] = await db.insert(issueResourceAssignments).values(assignment).returning();
  return newAssignment;
}

export async function removeIssueResourceAssignment(issueId: number, resourceId: number): Promise<void> {
  await db.delete(issueResourceAssignments)
    .where(and(
      eq(issueResourceAssignments.issueId, issueId),
      eq(issueResourceAssignments.resourceId, resourceId)
    ));
}

export async function updateIssueResourceAssignments(issueId: number, resourceIds: number[]): Promise<void> {
  await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.issueId, issueId));
  if (resourceIds.length > 0) {
    await db.insert(issueResourceAssignments).values(
      resourceIds.map(resourceId => ({ issueId, resourceId }))
    );
  }
}

export async function getRiskResourceAssignments(riskId: number): Promise<(RiskResourceAssignment & { resource: Resource })[]> {
  const assignments = await db.select()
    .from(issueResourceAssignments)
    .innerJoin(resources, eq(issueResourceAssignments.resourceId, resources.id))
    .where(eq(issueResourceAssignments.issueId, riskId));
  
  return assignments.map(a => ({
    ...a.issue_resource_assignments,
    resource: a.resources
  }));
}

export async function addRiskResourceAssignment(assignment: InsertRiskResourceAssignment): Promise<RiskResourceAssignment> {
  const issueAssignment = { issueId: (assignment as any).riskId || (assignment as any).issueId, resourceId: assignment.resourceId, role: assignment.role };
  const [newAssignment] = await db.insert(issueResourceAssignments).values(issueAssignment).returning();
  return newAssignment;
}

export async function removeRiskResourceAssignment(riskId: number, resourceId: number): Promise<void> {
  await db.delete(issueResourceAssignments)
    .where(and(
      eq(issueResourceAssignments.issueId, riskId),
      eq(issueResourceAssignments.resourceId, resourceId)
    ));
}

export async function updateRiskResourceAssignments(riskId: number, resourceIds: number[]): Promise<void> {
  await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.issueId, riskId));
  if (resourceIds.length > 0) {
    await db.insert(issueResourceAssignments).values(
      resourceIds.map(resourceId => ({ issueId: riskId, resourceId }))
    );
  }
}
