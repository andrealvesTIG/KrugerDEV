import { db } from "../db";
import {
  users, portfolios, projects, tasks, issues, milestones,
  resources, taskResourceAssignments, issueResourceAssignments,
  taskDependencies, taskChangeLogs, issueChangeLogs,
  projectFinancials, changeRequests, projectDocuments, projectComments,
  projectBenefits, projectDecisions, lessonsLearned,
  projectChangeLogs, healthStatusHistory, statusReportHistory,
  billableStatusComments, costItems, projectCustomFieldValues,
  projectScores, projectRiskAssessments, customPortfolioProjects,
  simulationEvents, mppImports, projectIntakes,
  notifications, projectInvoices, invoiceNotes,
  timesheetEntries, resourceSkills, resourceAvailability,
  portfolioRiskAssessments, portfolioKeyDates,
  legacyRisks, legacyRiskChangeLogs, legacyRiskResourceAssignments,
  type Project, type InsertProject, type UpdateProjectRequest,
  type Risk, type InsertRisk, type UpdateRiskRequest,
  type Milestone, type InsertMilestone, type UpdateMilestoneRequest,
  type Issue, type InsertIssue, type UpdateIssueRequest,
  type Portfolio, type Task,
  type RecycleBinItem, type RecycleBinItemType,
} from "@shared/schema";
import { eq, and, desc, or, isNull, isNotNull, inArray, sql } from "drizzle-orm";

export async function getProjects(organizationId?: number, portfolioId?: number, isInternal?: boolean, options?: { limit?: number; offset?: number }): Promise<Project[]> {
  const conditions = [isNull(projects.deletedAt)];
  if (organizationId) conditions.push(eq(projects.organizationId, organizationId));
  if (portfolioId) conditions.push(eq(projects.portfolioId, portfolioId));
  if (isInternal !== undefined) conditions.push(eq(projects.isInternal, isInternal));
  let query = db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.createdAt));
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }
  return await query;
}

export async function getProject(id: number): Promise<Project | undefined> {
  const [project] = await db.select().from(projects).where(
    and(eq(projects.id, id), isNull(projects.deletedAt))
  );
  return project;
}

export async function createProject(project: InsertProject): Promise<Project> {
  const [newProject] = await db.insert(projects).values({
    ...project,
    portfolioId: project.portfolioId || null,
  }).returning();
  return newProject;
}

export async function updateProject(id: number, updates: UpdateProjectRequest): Promise<Project> {
  const [updated] = await db.update(projects)
    .set(updates)
    .where(eq(projects.id, id))
    .returning();
  return updated;
}

export async function deleteProject(id: number): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(tasks)
      .set({ deletedAt: now })
      .where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)));
    await tx.update(issues)
      .set({ deletedAt: now })
      .where(and(eq(issues.projectId, id), isNull(issues.deletedAt)));
    await tx.update(projects)
      .set({ deletedAt: now })
      .where(eq(projects.id, id));
  });
}

export async function getRisks(projectId: number): Promise<Risk[]> {
  return await db.select().from(issues).where(
    and(eq(issues.projectId, projectId), eq(issues.itemType, 'risk'), isNull(issues.deletedAt))
  );
}

export async function getRisk(id: number): Promise<Risk | undefined> {
  const [risk] = await db.select().from(issues).where(
    and(eq(issues.id, id), eq(issues.itemType, 'risk'), isNull(issues.deletedAt))
  );
  return risk;
}

export async function createRisk(risk: InsertRisk): Promise<Risk> {
  const [newRisk] = await db.insert(issues).values({ ...risk, itemType: 'risk' }).returning();
  return newRisk;
}

export async function updateRisk(id: number, updates: UpdateRiskRequest): Promise<Risk> {
  const [updated] = await db.update(issues)
    .set(updates)
    .where(and(eq(issues.id, id), eq(issues.itemType, 'risk')))
    .returning();
  return updated;
}

export async function deleteRisk(id: number): Promise<void> {
  await db.update(issues)
    .set({ deletedAt: new Date() })
    .where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
}

export async function convertRiskToIssue(id: number): Promise<Issue | undefined> {
  const [converted] = await db.update(issues)
    .set({
      itemType: 'issue',
      type: 'Bug',
      probability: null,
      impact: null,
      riskScore: null,
      responseStrategy: null,
      mitigationPlan: null,
      contingencyPlan: null,
      triggerEvents: null,
      residualRisk: null,
      ownerId: null,
      reviewerId: null,
      identifiedDate: null,
      proximity: null,
    })
    .where(and(eq(issues.id, id), eq(issues.itemType, 'risk')))
    .returning();
  return converted;
}

function taskToMilestone(task: Task): Milestone {
  return {
    id: task.id,
    projectId: task.projectId,
    milestoneNumber: task.milestoneNumber ?? null,
    title: task.name,
    description: task.description,
    milestoneType: task.milestoneType ?? null,
    dueDate: task.endDate ?? '',
    baselineDueDate: task.baselineEndDate ?? null,
    actualCompletionDate: task.actualEndDate ?? null,
    startDate: task.startDate ?? null,
    completed: task.status === 'Completed' || task.progress === 100,
    status: task.status,
    priority: task.priority,
    ownerId: task.ownerId ?? null,
    assignee: task.assignee ?? null,
    deliverables: task.deliverables ?? null,
    acceptanceCriteria: task.acceptanceCriteria ?? null,
    dependencies: null,
    successMetrics: task.successMetrics ?? null,
    stakeholders: task.stakeholders ?? null,
    phase: task.phase ?? null,
    notes: task.notes ?? null,
    organizationId: task.organizationId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt ?? task.createdAt,
    deletedAt: task.deletedAt,
    deletedBy: task.deletedBy,
    isDemo: task.isDemo,
  };
}

export async function getMilestones(projectId: number): Promise<Milestone[]> {
  const rows = await db.select().from(tasks).where(
    and(eq(tasks.projectId, projectId), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'), isNull(tasks.deletedAt))
  );
  return rows.map(taskToMilestone);
}

export async function getMilestone(id: number): Promise<Milestone | undefined> {
  const [row] = await db.select().from(tasks).where(
    and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'), isNull(tasks.deletedAt))
  );
  return row ? taskToMilestone(row) : undefined;
}

export async function getAllMilestones(): Promise<Milestone[]> {
  const rows = await db.select().from(tasks).where(
    and(eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'), isNull(tasks.deletedAt))
  );
  return rows.map(taskToMilestone);
}

export async function createMilestone(milestone: InsertMilestone): Promise<Milestone> {
  const taskData: Partial<typeof tasks.$inferInsert> = {
    projectId: milestone.projectId,
    name: milestone.title,
    description: milestone.description ?? null,
    taskType: 'Milestone',
    isMilestone: true,
    priority: milestone.priority ?? 'Medium',
    startDate: milestone.startDate ?? null,
    endDate: milestone.dueDate,
    baselineEndDate: milestone.baselineDueDate ?? null,
    actualEndDate: milestone.actualCompletionDate ?? null,
    status: milestone.status ?? (milestone.completed ? 'Completed' : 'Not Started'),
    progress: milestone.completed ? 100 : 0,
    assignee: milestone.assignee ?? null,
    ownerId: milestone.ownerId ?? null,
    milestoneNumber: milestone.milestoneNumber ?? null,
    milestoneType: milestone.milestoneType ?? null,
    deliverables: milestone.deliverables ?? null,
    acceptanceCriteria: milestone.acceptanceCriteria ?? null,
    successMetrics: milestone.successMetrics ?? null,
    stakeholders: milestone.stakeholders ?? null,
    phase: milestone.phase ?? null,
    notes: milestone.notes ?? null,
    organizationId: milestone.organizationId ?? null,
    isDemo: milestone.isDemo ?? false,
  };
  const [newTask] = await db.insert(tasks).values(taskData).returning();
  return taskToMilestone(newTask);
}

export async function updateMilestone(id: number, updates: UpdateMilestoneRequest): Promise<Milestone> {
  const taskUpdates: Partial<typeof tasks.$inferInsert> = {};
  if (updates.title !== undefined) taskUpdates.name = updates.title;
  if (updates.description !== undefined) taskUpdates.description = updates.description;
  if (updates.dueDate !== undefined) taskUpdates.endDate = updates.dueDate;
  if (updates.baselineDueDate !== undefined) taskUpdates.baselineEndDate = updates.baselineDueDate;
  if (updates.actualCompletionDate !== undefined) taskUpdates.actualEndDate = updates.actualCompletionDate;
  if (updates.startDate !== undefined) taskUpdates.startDate = updates.startDate;
  if (updates.status !== undefined) taskUpdates.status = updates.status;
  if (updates.priority !== undefined) taskUpdates.priority = updates.priority;
  if (updates.assignee !== undefined) taskUpdates.assignee = updates.assignee;
  if (updates.ownerId !== undefined) taskUpdates.ownerId = updates.ownerId;
  if (updates.milestoneNumber !== undefined) taskUpdates.milestoneNumber = updates.milestoneNumber;
  if (updates.milestoneType !== undefined) taskUpdates.milestoneType = updates.milestoneType;
  if (updates.deliverables !== undefined) taskUpdates.deliverables = updates.deliverables;
  if (updates.acceptanceCriteria !== undefined) taskUpdates.acceptanceCriteria = updates.acceptanceCriteria;
  if (updates.successMetrics !== undefined) taskUpdates.successMetrics = updates.successMetrics;
  if (updates.stakeholders !== undefined) taskUpdates.stakeholders = updates.stakeholders;
  if (updates.phase !== undefined) taskUpdates.phase = updates.phase;
  if (updates.notes !== undefined) taskUpdates.notes = updates.notes;
  if (updates.completed !== undefined) {
    taskUpdates.progress = updates.completed ? 100 : 0;
    if (updates.status === undefined) {
      taskUpdates.status = updates.completed ? 'Completed' : 'Not Started';
    }
    if (updates.completed && updates.actualCompletionDate === undefined) {
      taskUpdates.actualEndDate = new Date();
    }
    if (!updates.completed) {
      taskUpdates.actualEndDate = null;
    }
  }
  taskUpdates.updatedAt = new Date();

  const [updated] = await db.update(tasks)
    .set(taskUpdates)
    .where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')))
    .returning();
  return taskToMilestone(updated);
}

export async function deleteMilestone(id: number): Promise<void> {
  await db.delete(notifications).where(eq(notifications.milestoneId, id));
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
}

export async function getIssues(projectId: number): Promise<Issue[]> {
  return await db.select().from(issues).where(
    and(
      eq(issues.projectId, projectId),
      or(eq(issues.itemType, 'issue'), isNull(issues.itemType)),
      isNull(issues.deletedAt)
    )
  );
}

export async function getIssue(id: number): Promise<Issue | undefined> {
  const [issue] = await db.select().from(issues).where(
    and(eq(issues.id, id), isNull(issues.deletedAt))
  );
  return issue;
}

export async function getAllIssues(itemType?: 'issue' | 'risk' | 'all'): Promise<Issue[]> {
  if (itemType === 'all' || !itemType) {
    return await db.select().from(issues).where(isNull(issues.deletedAt));
  }
  return await db.select().from(issues).where(
    and(eq(issues.itemType, itemType), isNull(issues.deletedAt))
  );
}

export async function createIssue(issue: InsertIssue): Promise<Issue> {
  const [newIssue] = await db.insert(issues).values({ ...issue, itemType: 'issue' }).returning();
  return newIssue;
}

export async function updateIssue(id: number, updates: UpdateIssueRequest): Promise<Issue> {
  const [updated] = await db.update(issues)
    .set(updates)
    .where(eq(issues.id, id))
    .returning();
  return updated;
}

export async function deleteIssue(id: number): Promise<void> {
  await db.update(issues)
    .set({ deletedAt: new Date() })
    .where(eq(issues.id, id));
}

export async function getEscalatedItemsByProjects(projectIds: number[]): Promise<Issue[]> {
  if (projectIds.length === 0) return [];
  return await db.select().from(issues).where(
    and(
      inArray(issues.projectId, projectIds),
      eq(issues.escalatedToPortfolio, true),
      isNull(issues.deletedAt)
    )
  );
}

export async function search(query: string, organizationIds?: number[]): Promise<{
  portfolios: Portfolio[];
  projects: Project[];
  tasks: Task[];
  issues: Issue[];
  risks: Risk[];
  milestones: Milestone[];
}> {
  const searchPattern = `%${query}%`;
  const limit = 10;

  const portfolioResults = await db.select().from(portfolios)
    .where(
      and(
        isNull(portfolios.deletedAt),
        organizationIds && organizationIds.length > 0
          ? sql`${portfolios.organizationId} IN (${sql.join(organizationIds.map(id => sql`${id}`), sql`, `)})`
          : sql`1=1`,
        or(
          sql`COALESCE(${portfolios.name}, '') ILIKE ${searchPattern}`,
          sql`COALESCE(${portfolios.description}, '') ILIKE ${searchPattern}`
        )
      )
    )
    .limit(limit);

  const projectResults = await db.select().from(projects)
    .where(
      and(
        isNull(projects.deletedAt),
        organizationIds && organizationIds.length > 0
          ? sql`${projects.organizationId} IN (${sql.join(organizationIds.map(id => sql`${id}`), sql`, `)})`
          : sql`1=1`,
        or(
          sql`COALESCE(${projects.name}, '') ILIKE ${searchPattern}`,
          sql`COALESCE(${projects.description}, '') ILIKE ${searchPattern}`
        )
      )
    )
    .limit(limit);

  const accessibleProjects = organizationIds && organizationIds.length > 0
    ? await db.select({ id: projects.id }).from(projects)
        .where(and(
          isNull(projects.deletedAt),
          sql`${projects.organizationId} IN (${sql.join(organizationIds.map(id => sql`${id}`), sql`, `)})`
        ))
    : await db.select({ id: projects.id }).from(projects).where(isNull(projects.deletedAt));
  const projectIds = accessibleProjects.map(p => p.id);

  if (projectIds.length === 0) {
    return { portfolios: portfolioResults, projects: projectResults, tasks: [], issues: [], risks: [], milestones: [] };
  }

  const taskResults = await db.select().from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        sql`${tasks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        or(
          sql`COALESCE(${tasks.name}, '') ILIKE ${searchPattern}`,
          sql`COALESCE(${tasks.description}, '') ILIKE ${searchPattern}`
        )
      )
    )
    .limit(limit);

  const issueResults = await db.select().from(issues)
    .where(
      and(
        isNull(issues.deletedAt),
        sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        or(
          sql`COALESCE(${issues.title}, '') ILIKE ${searchPattern}`,
          sql`COALESCE(${issues.description}, '') ILIKE ${searchPattern}`
        )
      )
    )
    .limit(limit);

  const riskResults = await db.select().from(issues)
    .where(
      and(
        isNull(issues.deletedAt),
        eq(issues.itemType, 'risk'),
        sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        or(
          sql`COALESCE(${issues.title}, '') ILIKE ${searchPattern}`,
          sql`COALESCE(${issues.description}, '') ILIKE ${searchPattern}`
        )
      )
    )
    .limit(limit);

  const milestoneTaskResults = await db.select().from(tasks)
    .where(
      and(
        isNull(tasks.deletedAt),
        eq(tasks.isMilestone, true),
        eq(tasks.taskType, 'Milestone'),
        sql`${tasks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        or(
          sql`COALESCE(${tasks.name}, '') ILIKE ${searchPattern}`,
          sql`COALESCE(${tasks.description}, '') ILIKE ${searchPattern}`
        )
      )
    )
    .limit(limit);
  const milestoneResults = milestoneTaskResults.map(taskToMilestone);

  return { portfolios: portfolioResults, projects: projectResults, tasks: taskResults, issues: issueResults, risks: riskResults, milestones: milestoneResults };
}

export async function deleteAllDemoDataForOrganization(organizationId: number): Promise<{
  portfolios: number; projects: number; tasks: number; risks: number; milestones: number;
  issues: number; financials: number; intakes: number; resources: number;
  changeRequests: number; documents: number; benefits: number; decisions: number;
  timesheets: number; assignments: number; keyDates: number;
}> {
  const stats = {
    portfolios: 0, projects: 0, tasks: 0, risks: 0, milestones: 0,
    issues: 0, financials: 0, intakes: 0, resources: 0,
    changeRequests: 0, documents: 0, benefits: 0, decisions: 0,
    timesheets: 0, assignments: 0, keyDates: 0,
  };

  const allProjects = await db.select().from(projects)
    .where(eq(projects.organizationId, organizationId));
  
  for (const project of allProjects) {
    const isDemoProject = project.isDemo === true;

    const demoFilter = isDemoProject
      ? eq(tasks.projectId, project.id)
      : and(eq(tasks.projectId, project.id), eq(tasks.isDemo, true));

    const demoTasks = await db.select().from(tasks).where(demoFilter);
    
    let taskAssignmentsDeleted = 0;
    for (const task of demoTasks) {
      const deletedTimesheets = await db.delete(timesheetEntries).where(eq(timesheetEntries.taskId, task.id)).returning();
      stats.timesheets += deletedTimesheets.length;
      await db.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id));
      await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, task.id));
      await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
      const deletedAssignments = await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, task.id)).returning();
      taskAssignmentsDeleted += deletedAssignments.length;
      await db.delete(notifications).where(eq(notifications.taskId, task.id));
      await db.update(issues).set({ relatedTaskId: null }).where(eq(issues.relatedTaskId, task.id));
    }
    stats.assignments += taskAssignmentsDeleted;
    
    const milestoneDemoFilter = isDemoProject
      ? and(eq(tasks.projectId, project.id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'))
      : and(eq(tasks.projectId, project.id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'), eq(tasks.isDemo, true));

    const demoMilestoneTasks = await db.select({ id: tasks.id }).from(tasks).where(milestoneDemoFilter);
    for (const ms of demoMilestoneTasks) {
      await db.delete(notifications).where(eq(notifications.milestoneId, ms.id));
    }
    stats.milestones += demoMilestoneTasks.length;

    const deletedTasks = await db.delete(tasks).where(demoFilter).returning();
    stats.tasks += deletedTasks.length - demoMilestoneTasks.length;

    const issuesDemoFilter = isDemoProject
      ? eq(issues.projectId, project.id)
      : and(eq(issues.projectId, project.id), eq(issues.isDemo, true));
    
    const demoIssuesAndRisks = await db.select({ id: issues.id }).from(issues).where(issuesDemoFilter);
    for (const item of demoIssuesAndRisks) {
      await db.delete(issueChangeLogs).where(eq(issueChangeLogs.issueId, item.id));
      await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.issueId, item.id));
    }

    const deletedRisks = await db.delete(issues)
      .where(isDemoProject
        ? and(eq(issues.projectId, project.id), eq(issues.itemType, 'risk'))
        : and(eq(issues.projectId, project.id), eq(issues.itemType, 'risk'), eq(issues.isDemo, true))
      ).returning();
    stats.risks += deletedRisks.length;
    
    const deletedIssues = await db.delete(issues)
      .where(isDemoProject
        ? and(eq(issues.projectId, project.id), eq(issues.itemType, 'issue'))
        : and(eq(issues.projectId, project.id), eq(issues.itemType, 'issue'), eq(issues.isDemo, true))
      ).returning();
    stats.issues += deletedIssues.length;
    
    const deletedFinancials = await db.delete(projectFinancials)
      .where(isDemoProject
        ? eq(projectFinancials.projectId, project.id)
        : and(eq(projectFinancials.projectId, project.id), eq(projectFinancials.isDemo, true))
      ).returning();
    stats.financials += deletedFinancials.length;

    const deletedChangeRequests = await db.delete(changeRequests)
      .where(isDemoProject
        ? eq(changeRequests.projectId, project.id)
        : and(eq(changeRequests.projectId, project.id), eq(changeRequests.isDemo, true))
      ).returning();
    stats.changeRequests += deletedChangeRequests.length;

    const deletedDocuments = await db.delete(projectDocuments)
      .where(isDemoProject
        ? eq(projectDocuments.projectId, project.id)
        : and(eq(projectDocuments.projectId, project.id), eq(projectDocuments.isDemo, true))
      ).returning();
    stats.documents += deletedDocuments.length;

    const deletedBenefits = await db.delete(projectBenefits)
      .where(isDemoProject
        ? eq(projectBenefits.projectId, project.id)
        : and(eq(projectBenefits.projectId, project.id), eq(projectBenefits.isDemo, true))
      ).returning();
    stats.benefits += deletedBenefits.length;

    const deletedDecisions = await db.delete(projectDecisions)
      .where(isDemoProject
        ? eq(projectDecisions.projectId, project.id)
        : and(eq(projectDecisions.projectId, project.id), eq(projectDecisions.isDemo, true))
      ).returning();
    stats.decisions += deletedDecisions.length;
  }
  
  const demoProjects = await db.select().from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.isDemo, true)));
  
  for (const project of demoProjects) {
    const remainingTasks = await db.select({ count: sql`count(*)` }).from(tasks).where(eq(tasks.projectId, project.id));
    const remainingIssuesAll = await db.select({ count: sql`count(*)` }).from(issues).where(eq(issues.projectId, project.id));
    const remainingMilestones = await db.select({ count: sql`count(*)` }).from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
    const remainingFinancials = await db.select({ count: sql`count(*)` }).from(projectFinancials).where(eq(projectFinancials.projectId, project.id));
    const remainingCRs = await db.select({ count: sql`count(*)` }).from(changeRequests).where(eq(changeRequests.projectId, project.id));
    const remainingDocs = await db.select({ count: sql`count(*)` }).from(projectDocuments).where(eq(projectDocuments.projectId, project.id));
    const remainingBenefits = await db.select({ count: sql`count(*)` }).from(projectBenefits).where(eq(projectBenefits.projectId, project.id));
    const remainingDecisions = await db.select({ count: sql`count(*)` }).from(projectDecisions).where(eq(projectDecisions.projectId, project.id));
    
    const hasRemainingChildren = 
      Number(remainingTasks[0]?.count || 0) > 0 ||
      Number(remainingIssuesAll[0]?.count || 0) > 0 ||
      Number(remainingMilestones[0]?.count || 0) > 0 ||
      Number(remainingFinancials[0]?.count || 0) > 0 ||
      Number(remainingCRs[0]?.count || 0) > 0 ||
      Number(remainingDocs[0]?.count || 0) > 0 ||
      Number(remainingBenefits[0]?.count || 0) > 0 ||
      Number(remainingDecisions[0]?.count || 0) > 0;
    
    if (!hasRemainingChildren) {
      await db.delete(lessonsLearned).where(eq(lessonsLearned.projectId, project.id));
      await db.delete(projectChangeLogs).where(eq(projectChangeLogs.projectId, project.id));
      await db.delete(healthStatusHistory).where(eq(healthStatusHistory.projectId, project.id));
      await db.delete(statusReportHistory).where(eq(statusReportHistory.projectId, project.id));
      await db.delete(billableStatusComments).where(eq(billableStatusComments.projectId, project.id));
      await db.delete(costItems).where(eq(costItems.projectId, project.id));
      await db.delete(projectCustomFieldValues).where(eq(projectCustomFieldValues.projectId, project.id));
      await db.delete(projectScores).where(eq(projectScores.projectId, project.id));
      await db.delete(projectRiskAssessments).where(eq(projectRiskAssessments.projectId, project.id));
      await db.delete(customPortfolioProjects).where(eq(customPortfolioProjects.projectId, project.id));
      await db.delete(simulationEvents).where(eq(simulationEvents.projectId, project.id));
      await db.update(mppImports).set({ projectId: null }).where(eq(mppImports.projectId, project.id));
      await db.update(projectIntakes).set({ createdProjectId: null }).where(eq(projectIntakes.createdProjectId, project.id));
      await db.delete(notifications).where(eq(notifications.projectId, project.id));
      const projectInvoiceRows = await db.select({ id: projectInvoices.id }).from(projectInvoices).where(eq(projectInvoices.projectId, project.id));
      for (const inv of projectInvoiceRows) {
        await db.delete(invoiceNotes).where(eq(invoiceNotes.invoiceId, inv.id));
      }
      await db.delete(projectInvoices).where(eq(projectInvoices.projectId, project.id));
      const comments = await db.select({ id: projectComments.id }).from(projectComments).where(eq(projectComments.projectId, project.id));
      for (const c of comments) {
        await db.delete(notifications).where(eq(notifications.commentId, c.id));
      }
      await db.delete(projectComments).where(eq(projectComments.projectId, project.id));
      const legacyRiskRows2 = await db.select({ id: legacyRisks.id }).from(legacyRisks).where(eq(legacyRisks.projectId, project.id));
      for (const lr of legacyRiskRows2) {
        await db.delete(legacyRiskChangeLogs).where(eq(legacyRiskChangeLogs.riskId, lr.id));
        await db.delete(legacyRiskResourceAssignments).where(eq(legacyRiskResourceAssignments.riskId, lr.id));
      }
      await db.delete(legacyRisks).where(eq(legacyRisks.projectId, project.id));
      await db.delete(milestones).where(eq(milestones.projectId, project.id));
      await db.delete(projects).where(eq(projects.id, project.id));
      stats.projects++;
    }
  }
  
  const demoPortfolios = await db.select().from(portfolios)
    .where(and(eq(portfolios.organizationId, organizationId), eq(portfolios.isDemo, true)));
  
  for (const portfolio of demoPortfolios) {
    const remainingProjects = await db.select({ count: sql`count(*)` }).from(projects)
      .where(eq(projects.portfolioId, portfolio.id));
    
    if (Number(remainingProjects[0]?.count || 0) === 0) {
      const deletedKeyDates = await db.delete(portfolioKeyDates)
        .where(eq(portfolioKeyDates.portfolioId, portfolio.id)).returning();
      stats.keyDates += deletedKeyDates.length;
      await db.delete(portfolioRiskAssessments).where(eq(portfolioRiskAssessments.portfolioId, portfolio.id));
      await db.delete(notifications).where(eq(notifications.portfolioId, portfolio.id));
      await db.delete(portfolios).where(eq(portfolios.id, portfolio.id));
      stats.portfolios++;
    }
  }
  
  const deletedIntakes = await db.delete(projectIntakes)
    .where(and(eq(projectIntakes.organizationId, organizationId), eq(projectIntakes.isDemo, true))).returning();
  stats.intakes = deletedIntakes.length;
  
  const demoResources = await db.select().from(resources)
    .where(and(eq(resources.organizationId, organizationId), eq(resources.isDemo, true)));
  
  const demoResourceIds = demoResources.map(r => r.id);
  
  if (demoResourceIds.length > 0) {
    for (const resourceId of demoResourceIds) {
      const deletedTimesheets = await db.delete(timesheetEntries).where(eq(timesheetEntries.resourceId, resourceId)).returning();
      stats.timesheets += deletedTimesheets.length;
      const deletedAssignments = await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.resourceId, resourceId)).returning();
      stats.assignments += deletedAssignments.length;
      await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.resourceId, resourceId));
      await db.delete(resourceSkills).where(eq(resourceSkills.resourceId, resourceId));
      await db.delete(resourceAvailability).where(eq(resourceAvailability.resourceId, resourceId));
    }
  }
  
  const deletedResources = await db.delete(resources)
    .where(and(eq(resources.organizationId, organizationId), eq(resources.isDemo, true))).returning();
  stats.resources = deletedResources.length;
  
  return stats;
}

export async function getDeletedItems(organizationId: number): Promise<RecycleBinItem[]> {
  const items: RecycleBinItem[] = [];

  const deletedPortfolios = await db.select().from(portfolios)
    .where(and(eq(portfolios.organizationId, organizationId), isNotNull(portfolios.deletedAt)));
  for (const p of deletedPortfolios) {
    items.push({ id: p.id, type: 'portfolio', name: p.name, deletedAt: p.deletedAt!, deletedBy: p.deletedBy });
  }

  const deletedProjects = await db.select().from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNotNull(projects.deletedAt)));
  for (const p of deletedProjects) {
    items.push({ id: p.id, type: 'project', name: p.name, deletedAt: p.deletedAt!, deletedBy: p.deletedBy });
  }

  const orgProjects = await db.select({ id: projects.id, name: projects.name }).from(projects)
    .where(eq(projects.organizationId, organizationId));
  const projectMap = new Map(orgProjects.map(p => [p.id, p.name]));
  const projectIds = orgProjects.map(p => p.id);

  if (projectIds.length > 0) {
    const deletedTasks = await db.select().from(tasks)
      .where(and(
        sql`${tasks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        isNotNull(tasks.deletedAt)
      ));
    for (const t of deletedTasks) {
      items.push({ id: t.id, type: 'task', name: t.name, projectName: projectMap.get(t.projectId), deletedAt: t.deletedAt!, deletedBy: t.deletedBy });
    }

    const deletedRisks = await db.select().from(issues)
      .where(and(
        eq(issues.itemType, 'risk'),
        sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        isNotNull(issues.deletedAt)
      ));
    for (const r of deletedRisks) {
      items.push({ id: r.id, type: 'risk', name: r.title, projectName: projectMap.get(r.projectId), deletedAt: r.deletedAt!, deletedBy: r.deletedBy });
    }

    const deletedMilestonesItems = await db.select().from(tasks)
      .where(and(
        eq(tasks.isMilestone, true),
        eq(tasks.taskType, 'Milestone'),
        sql`${tasks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        isNotNull(tasks.deletedAt)
      ));
    for (const m of deletedMilestonesItems) {
      items.push({ id: m.id, type: 'milestone', name: m.name, projectName: projectMap.get(m.projectId), deletedAt: m.deletedAt!, deletedBy: m.deletedBy });
    }

    const deletedIssuesItems = await db.select().from(issues)
      .where(and(
        eq(issues.itemType, 'issue'),
        sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
        isNotNull(issues.deletedAt)
      ));
    for (const i of deletedIssuesItems) {
      items.push({ id: i.id, type: 'issue', name: i.title, projectName: projectMap.get(i.projectId), deletedAt: i.deletedAt!, deletedBy: i.deletedBy });
    }
  }

  const deleterIds = [...new Set(items.map(i => i.deletedBy).filter(Boolean))] as string[];
  const userMap = new Map<string, { firstName?: string | null; lastName?: string | null; email?: string | null }>();
  if (deleterIds.length > 0) {
    const deleterUsers = await db.select().from(users).where(inArray(users.id, deleterIds));
    for (const u of deleterUsers) {
      userMap.set(u.id, u);
    }
  }

  for (const item of items) {
    if (item.deletedBy) {
      const deleter = userMap.get(item.deletedBy);
      item.deletedByName = deleter
        ? `${deleter.firstName || ''} ${deleter.lastName || ''}`.trim() || deleter.email || 'Unknown'
        : undefined;
    }
  }

  return items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}

export async function softDeleteItem(type: RecycleBinItemType, id: number, userId: string, organizationId?: number): Promise<boolean> {
  const now = new Date();
  switch (type) {
    case 'portfolio':
      if (organizationId) {
        const [p] = await db.select().from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.organizationId, organizationId)));
        if (!p) return false;
      }
      await db.transaction(async (tx) => {
        await tx.update(projects).set({ portfolioId: null }).where(eq(projects.portfolioId, id));
        await tx.update(portfolios).set({ deletedAt: now, deletedBy: userId }).where(eq(portfolios.id, id));
      });
      break;
    case 'project':
      if (organizationId) {
        const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)));
        if (!p) return false;
      }
      await db.transaction(async (tx) => {
        await tx.update(tasks).set({ deletedAt: now }).where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)));
        await tx.update(issues).set({ deletedAt: now }).where(and(eq(issues.projectId, id), isNull(issues.deletedAt)));
        await tx.update(projects).set({ deletedAt: now, deletedBy: userId }).where(eq(projects.id, id));
      });
      break;
    case 'task':
      if (organizationId) {
        const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
        if (!t) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, t.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
      }
      await db.transaction(async (tx) => {
        await tx.update(tasks).set({ parentId: null }).where(eq(tasks.parentId, id));
        await tx.update(tasks).set({ deletedAt: now, deletedBy: userId }).where(eq(tasks.id, id));
      });
      break;
    case 'risk':
      if (organizationId) {
        const [r] = await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
        if (!r) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
      }
      await db.update(issues).set({ deletedAt: now, deletedBy: userId }).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
      break;
    case 'milestone':
      if (organizationId) {
        const [m] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
        if (!m) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, m.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
      }
      await db.update(tasks).set({ deletedAt: now, deletedBy: userId }).where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
      break;
    case 'issue':
      if (organizationId) {
        const [i] = await db.select().from(issues).where(eq(issues.id, id));
        if (!i) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, i.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
      }
      await db.update(issues).set({ deletedAt: now, deletedBy: userId }).where(eq(issues.id, id));
      break;
  }
  return true;
}

export async function restoreItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean> {
  switch (type) {
    case 'portfolio': {
      const [p] = await db.select().from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.organizationId, organizationId)));
      if (!p) return false;
      await db.update(portfolios).set({ deletedAt: null, deletedBy: null }).where(eq(portfolios.id, id));
      break;
    }
    case 'project': {
      const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.update(projects).set({ deletedAt: null, deletedBy: null }).where(eq(projects.id, id));
      break;
    }
    case 'task': {
      const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
      if (!t) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, t.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.update(tasks).set({ deletedAt: null, deletedBy: null }).where(eq(tasks.id, id));
      break;
    }
    case 'risk': {
      const [r] = await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
      if (!r) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.update(issues).set({ deletedAt: null, deletedBy: null }).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
      break;
    }
    case 'milestone': {
      const [m] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
      if (!m) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, m.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.update(tasks).set({ deletedAt: null, deletedBy: null }).where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
      break;
    }
    case 'issue': {
      const [i] = await db.select().from(issues).where(eq(issues.id, id));
      if (!i) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, i.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.update(issues).set({ deletedAt: null, deletedBy: null }).where(eq(issues.id, id));
      break;
    }
  }
  return true;
}

export async function permanentlyDeleteItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean> {
  switch (type) {
    case 'portfolio': {
      const [p] = await db.select().from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.organizationId, organizationId)));
      if (!p) return false;
      await db.delete(portfolios).where(eq(portfolios.id, id));
      break;
    }
    case 'project': {
      const [proj] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)));
      if (!proj) return false;
      const projectTasks2 = await db.select().from(tasks).where(eq(tasks.projectId, id));
      for (const task of projectTasks2) {
        await db.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id));
        await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, task.id));
        await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
      }
      await db.delete(tasks).where(eq(tasks.projectId, id));
      await db.delete(issues).where(eq(issues.projectId, id));
      await db.delete(milestones).where(eq(milestones.projectId, id));
      await db.delete(projectFinancials).where(eq(projectFinancials.projectId, id));
      await db.delete(projects).where(eq(projects.id, id));
      break;
    }
    case 'task': {
      const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
      if (!t) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, t.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.delete(taskDependencies).where(eq(taskDependencies.taskId, id));
      await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, id));
      await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, id));
      await db.delete(tasks).where(eq(tasks.id, id));
      break;
    }
    case 'risk': {
      const [r] = await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
      if (!r) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.delete(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
      break;
    }
    case 'milestone': {
      const [m] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
      if (!m) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, m.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.delete(notifications).where(eq(notifications.milestoneId, id));
      await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone')));
      break;
    }
    case 'issue': {
      const [i] = await db.select().from(issues).where(eq(issues.id, id));
      if (!i) return false;
      const [p] = await db.select().from(projects).where(and(eq(projects.id, i.projectId), eq(projects.organizationId, organizationId)));
      if (!p) return false;
      await db.delete(issues).where(eq(issues.id, id));
      break;
    }
  }
  return true;
}
