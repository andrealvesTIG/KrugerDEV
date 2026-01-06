import { db } from "./db";
import {
  users, portfolios, projects, risks, milestones, issues, tasks,
  organizations, organizationMembers, taskChangeLogs, taskDependencies, projectFinancials,
  projectChangeLogs, riskChangeLogs, issueChangeLogs,
  resources, taskResourceAssignments, issueResourceAssignments, riskResourceAssignments,
  costItems, projectIntakes, mppImports, mppImportTasks,
  type User, type UpsertUser,
  type Organization, type InsertOrganization,
  type OrganizationMember, type InsertOrganizationMember,
  type Portfolio, type InsertPortfolio, type UpdatePortfolioRequest,
  type Project, type InsertProject, type UpdateProjectRequest,
  type Risk, type InsertRisk, type UpdateRiskRequest,
  type Milestone, type InsertMilestone, type UpdateMilestoneRequest,
  type Issue, type InsertIssue, type UpdateIssueRequest,
  type Task, type InsertTask, type UpdateTaskRequest,
  type TaskChangeLog, type InsertTaskChangeLog,
  type ProjectChangeLog, type InsertProjectChangeLog,
  type RiskChangeLog, type InsertRiskChangeLog,
  type IssueChangeLog, type InsertIssueChangeLog,
  type TaskDependency, type InsertTaskDependency,
  type ProjectFinancial, type InsertProjectFinancial, type UpdateProjectFinancialRequest,
  type Resource, type InsertResource, type UpdateResourceRequest,
  type TaskResourceAssignment, type InsertTaskResourceAssignment,
  type IssueResourceAssignment, type InsertIssueResourceAssignment,
  type RiskResourceAssignment, type InsertRiskResourceAssignment,
  type CostItem, type InsertCostItem, type UpdateCostItemRequest,
  type ProjectIntake, type InsertProjectIntake, type UpdateProjectIntakeRequest,
  type MppImport, type InsertMppImport,
  type MppImportTask, type InsertMppImportTask,
  type RecycleBinItem, type RecycleBinItemType
} from "@shared/schema";
import { eq, and, desc, or, ilike, sql, isNull, isNotNull } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // Organizations
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: number): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, updates: Partial<InsertOrganization>): Promise<Organization>;
  deleteOrganization(id: number): Promise<void>;
  
  // Organization Members
  getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]>;
  getUserOrganizations(userId: string): Promise<OrganizationMember[]>;
  addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  updateOrganizationMemberRole(organizationId: number, userId: string, role: string): Promise<OrganizationMember>;
  removeOrganizationMember(organizationId: number, userId: string): Promise<void>;

  // Portfolios
  getPortfolios(organizationId?: number): Promise<Portfolio[]>;
  getPortfolio(id: number): Promise<Portfolio | undefined>;
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, updates: UpdatePortfolioRequest): Promise<Portfolio>;
  deletePortfolio(id: number): Promise<void>;

  // Projects
  getProjects(organizationId?: number, portfolioId?: number): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: UpdateProjectRequest): Promise<Project>;
  deleteProject(id: number): Promise<void>;

  // Risks
  getRisks(projectId: number): Promise<Risk[]>;
  getRisk(id: number): Promise<Risk | undefined>;
  createRisk(risk: InsertRisk): Promise<Risk>;
  updateRisk(id: number, updates: UpdateRiskRequest): Promise<Risk>;
  deleteRisk(id: number): Promise<void>;

  // Milestones
  getMilestones(projectId: number): Promise<Milestone[]>;
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;
  updateMilestone(id: number, updates: UpdateMilestoneRequest): Promise<Milestone>;
  deleteMilestone(id: number): Promise<void>;

  // Issues
  getIssues(projectId: number): Promise<Issue[]>;
  getAllIssues(): Promise<Issue[]>;
  getIssue(id: number): Promise<Issue | undefined>;
  createIssue(issue: InsertIssue): Promise<Issue>;
  updateIssue(id: number, updates: UpdateIssueRequest): Promise<Issue>;
  deleteIssue(id: number): Promise<void>;

  // Tasks
  getTasks(projectId: number): Promise<Task[]>;
  getAllTasks(): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: UpdateTaskRequest): Promise<Task>;
  deleteTask(id: number): Promise<void>;

  // Task Change Logs
  getTaskChangeLogs(taskId: number): Promise<TaskChangeLog[]>;
  createTaskChangeLog(log: InsertTaskChangeLog): Promise<TaskChangeLog>;

  // Project Change Logs
  getProjectChangeLogs(projectId: number): Promise<ProjectChangeLog[]>;
  createProjectChangeLog(log: InsertProjectChangeLog): Promise<ProjectChangeLog>;

  // Risk Change Logs
  getRiskChangeLogs(riskId: number): Promise<RiskChangeLog[]>;
  createRiskChangeLog(log: InsertRiskChangeLog): Promise<RiskChangeLog>;

  // Issue Change Logs
  getIssueChangeLogs(issueId: number): Promise<IssueChangeLog[]>;
  createIssueChangeLog(log: InsertIssueChangeLog): Promise<IssueChangeLog>;

  // Task Dependencies
  getTaskDependencies(taskId: number): Promise<TaskDependency[]>;
  getTaskDependents(taskId: number): Promise<TaskDependency[]>;
  createTaskDependency(dependency: InsertTaskDependency): Promise<TaskDependency>;
  deleteTaskDependency(taskId: number, dependsOnTaskId: number): Promise<void>;

  // Project Financials
  getProjectFinancials(projectId: number): Promise<ProjectFinancial[]>;
  getProjectFinancial(id: number): Promise<ProjectFinancial | undefined>;
  createProjectFinancial(financial: InsertProjectFinancial): Promise<ProjectFinancial>;
  updateProjectFinancial(id: number, updates: UpdateProjectFinancialRequest): Promise<ProjectFinancial>;
  deleteProjectFinancial(id: number): Promise<void>;

  // Global Search
  search(query: string, organizationIds?: number[]): Promise<{
    portfolios: Portfolio[];
    projects: Project[];
    tasks: Task[];
    issues: Issue[];
    risks: Risk[];
    milestones: Milestone[];
  }>;

  // Demo Data Management
  deleteAllDemoDataForOrganization(organizationId: number): Promise<{
    portfolios: number;
    projects: number;
    tasks: number;
    risks: number;
    milestones: number;
    issues: number;
    financials: number;
  }>;

  // Recycle Bin
  getDeletedItems(organizationId: number): Promise<RecycleBinItem[]>;
  softDeleteItem(type: RecycleBinItemType, id: number, userId: string, organizationId?: number): Promise<boolean>;
  restoreItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean>;
  permanentlyDeleteItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean>;

  // Resources
  getResources(organizationId: number): Promise<Resource[]>;
  getResource(id: number): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: number, updates: UpdateResourceRequest): Promise<Resource>;
  deleteResource(id: number): Promise<void>;

  // Task Resource Assignments
  getTaskResourceAssignments(taskId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  addTaskResourceAssignment(assignment: InsertTaskResourceAssignment): Promise<TaskResourceAssignment>;
  removeTaskResourceAssignment(taskId: number, resourceId: number): Promise<void>;
  updateTaskResourceAssignments(taskId: number, resourceIds: number[]): Promise<void>;

  // Issue Resource Assignments
  getIssueResourceAssignments(issueId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]>;
  addIssueResourceAssignment(assignment: InsertIssueResourceAssignment): Promise<IssueResourceAssignment>;
  removeIssueResourceAssignment(issueId: number, resourceId: number): Promise<void>;
  updateIssueResourceAssignments(issueId: number, resourceIds: number[]): Promise<void>;

  // Risk Resource Assignments
  getRiskResourceAssignments(riskId: number): Promise<(RiskResourceAssignment & { resource: Resource })[]>;
  addRiskResourceAssignment(assignment: InsertRiskResourceAssignment): Promise<RiskResourceAssignment>;
  removeRiskResourceAssignment(riskId: number, resourceId: number): Promise<void>;
  updateRiskResourceAssignments(riskId: number, resourceIds: number[]): Promise<void>;

  // Cost Items
  getCostItems(projectId: number, fiscalYear?: number): Promise<CostItem[]>;
  getCostItem(id: number): Promise<CostItem | undefined>;
  createCostItem(costItem: InsertCostItem): Promise<CostItem>;
  updateCostItem(id: number, updates: UpdateCostItemRequest): Promise<CostItem>;
  deleteCostItem(id: number): Promise<void>;

  // Project Intakes
  getProjectIntakes(organizationId: number): Promise<ProjectIntake[]>;
  getProjectIntake(id: number): Promise<ProjectIntake | undefined>;
  createProjectIntake(intake: InsertProjectIntake): Promise<ProjectIntake>;
  updateProjectIntake(id: number, updates: UpdateProjectIntakeRequest): Promise<ProjectIntake>;
  deleteProjectIntake(id: number): Promise<void>;
  approveProjectIntake(id: number, approvedBy: string): Promise<Project>;

  // MPP Imports
  getMppImports(organizationId: number): Promise<MppImport[]>;
  getMppImport(id: number): Promise<MppImport | undefined>;
  createMppImport(mppImport: InsertMppImport): Promise<MppImport>;
  updateMppImport(id: number, updates: Partial<InsertMppImport>): Promise<MppImport>;
  deleteMppImport(id: number): Promise<void>;
  
  // MPP Import Tasks
  getMppImportTasks(importId: number): Promise<MppImportTask[]>;
  createMppImportTask(task: InsertMppImportTask): Promise<MppImportTask>;
  createMppImportTasks(tasks: InsertMppImportTask[]): Promise<MppImportTask[]>;
  deleteMppImportTasks(importId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations);
  }

  async getOrganization(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [newOrg] = await db.insert(organizations).values(org).returning();
    return newOrg;
  }

  async updateOrganization(id: number, updates: Partial<InsertOrganization>): Promise<Organization> {
    const [updated] = await db.update(organizations)
      .set(updates)
      .where(eq(organizations.id, id))
      .returning();
    return updated;
  }

  async deleteOrganization(id: number): Promise<void> {
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  // Organization Members
  async getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]> {
    return await db.select().from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));
  }

  async getUserOrganizations(userId: string): Promise<OrganizationMember[]> {
    return await db.select().from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));
  }

  async addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember> {
    const [newMember] = await db.insert(organizationMembers).values(member).returning();
    return newMember;
  }

  async updateOrganizationMemberRole(organizationId: number, userId: string, role: string): Promise<OrganizationMember> {
    const [updated] = await db.update(organizationMembers)
      .set({ role })
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      ))
      .returning();
    return updated;
  }

  async removeOrganizationMember(organizationId: number, userId: string): Promise<void> {
    await db.delete(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId)
      ));
  }

  // Portfolios
  async getPortfolios(organizationId?: number): Promise<Portfolio[]> {
    if (organizationId) {
      return await db.select().from(portfolios).where(
        and(eq(portfolios.organizationId, organizationId), isNull(portfolios.deletedAt))
      );
    }
    return await db.select().from(portfolios).where(isNull(portfolios.deletedAt));
  }

  async getPortfolio(id: number): Promise<Portfolio | undefined> {
    const [portfolio] = await db.select().from(portfolios).where(
      and(eq(portfolios.id, id), isNull(portfolios.deletedAt))
    );
    return portfolio;
  }

  async createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio> {
    const [newPortfolio] = await db.insert(portfolios).values(portfolio).returning();
    return newPortfolio;
  }

  async updatePortfolio(id: number, updates: UpdatePortfolioRequest): Promise<Portfolio> {
    const [updated] = await db.update(portfolios)
      .set(updates)
      .where(eq(portfolios.id, id))
      .returning();
    return updated;
  }

  async deletePortfolio(id: number): Promise<void> {
    await db.delete(portfolios).where(eq(portfolios.id, id));
  }

  // Projects
  async getProjects(organizationId?: number, portfolioId?: number): Promise<Project[]> {
    if (organizationId && portfolioId) {
      return await db.select().from(projects).where(
        and(eq(projects.organizationId, organizationId), eq(projects.portfolioId, portfolioId), isNull(projects.deletedAt))
      );
    }
    if (organizationId) {
      return await db.select().from(projects).where(
        and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt))
      );
    }
    if (portfolioId) {
      return await db.select().from(projects).where(
        and(eq(projects.portfolioId, portfolioId), isNull(projects.deletedAt))
      );
    }
    return await db.select().from(projects).where(isNull(projects.deletedAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(
      and(eq(projects.id, id), isNull(projects.deletedAt))
    );
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(id: number, updates: UpdateProjectRequest): Promise<Project> {
    const [updated] = await db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Risks
  async getRisks(projectId: number): Promise<Risk[]> {
    return await db.select().from(risks).where(
      and(eq(risks.projectId, projectId), isNull(risks.deletedAt))
    );
  }

  async getRisk(id: number): Promise<Risk | undefined> {
    const [risk] = await db.select().from(risks).where(eq(risks.id, id));
    return risk;
  }

  async createRisk(risk: InsertRisk): Promise<Risk> {
    const [newRisk] = await db.insert(risks).values(risk).returning();
    return newRisk;
  }

  async updateRisk(id: number, updates: UpdateRiskRequest): Promise<Risk> {
    const [updated] = await db.update(risks)
      .set(updates)
      .where(eq(risks.id, id))
      .returning();
    return updated;
  }

  async deleteRisk(id: number): Promise<void> {
    await db.delete(risks).where(eq(risks.id, id));
  }

  // Milestones
  async getMilestones(projectId: number): Promise<Milestone[]> {
    return await db.select().from(milestones).where(
      and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt))
    );
  }

  async createMilestone(milestone: InsertMilestone): Promise<Milestone> {
    const [newMilestone] = await db.insert(milestones).values(milestone).returning();
    return newMilestone;
  }

  async updateMilestone(id: number, updates: UpdateMilestoneRequest): Promise<Milestone> {
    const [updated] = await db.update(milestones)
      .set(updates)
      .where(eq(milestones.id, id))
      .returning();
    return updated;
  }

  async deleteMilestone(id: number): Promise<void> {
    await db.delete(milestones).where(eq(milestones.id, id));
  }

  // Issues
  async getIssues(projectId: number): Promise<Issue[]> {
    return await db.select().from(issues).where(
      and(eq(issues.projectId, projectId), isNull(issues.deletedAt))
    );
  }

  async getIssue(id: number): Promise<Issue | undefined> {
    const [issue] = await db.select().from(issues).where(eq(issues.id, id));
    return issue;
  }

  async getAllIssues(): Promise<Issue[]> {
    return await db.select().from(issues).where(isNull(issues.deletedAt));
  }

  async createIssue(issue: InsertIssue): Promise<Issue> {
    const [newIssue] = await db.insert(issues).values(issue).returning();
    return newIssue;
  }

  async updateIssue(id: number, updates: UpdateIssueRequest): Promise<Issue> {
    const [updated] = await db.update(issues)
      .set(updates)
      .where(eq(issues.id, id))
      .returning();
    return updated;
  }

  async deleteIssue(id: number): Promise<void> {
    await db.delete(issues).where(eq(issues.id, id));
  }

  // Tasks
  async getTasks(projectId: number): Promise<Task[]> {
    return await db.select().from(tasks).where(
      and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))
    );
  }

  async getAllTasks(): Promise<Task[]> {
    return await db.select().from(tasks).where(isNull(tasks.deletedAt));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(
      and(eq(tasks.id, id), isNull(tasks.deletedAt))
    );
    return task;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }

  async updateTask(id: number, updates: UpdateTaskRequest): Promise<Task> {
    const [updated] = await db.update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(taskDependencies).where(eq(taskDependencies.taskId, id));
    await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, id));
    await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  // Task Change Logs
  async getTaskChangeLogs(taskId: number): Promise<TaskChangeLog[]> {
    return await db.select().from(taskChangeLogs)
      .where(eq(taskChangeLogs.taskId, taskId))
      .orderBy(desc(taskChangeLogs.changedAt));
  }

  async createTaskChangeLog(log: InsertTaskChangeLog): Promise<TaskChangeLog> {
    const [newLog] = await db.insert(taskChangeLogs).values(log).returning();
    return newLog;
  }

  // Project Change Logs
  async getProjectChangeLogs(projectId: number): Promise<ProjectChangeLog[]> {
    return await db.select().from(projectChangeLogs)
      .where(eq(projectChangeLogs.projectId, projectId))
      .orderBy(desc(projectChangeLogs.changedAt));
  }

  async createProjectChangeLog(log: InsertProjectChangeLog): Promise<ProjectChangeLog> {
    const [newLog] = await db.insert(projectChangeLogs).values(log).returning();
    return newLog;
  }

  // Risk Change Logs
  async getRiskChangeLogs(riskId: number): Promise<RiskChangeLog[]> {
    return await db.select().from(riskChangeLogs)
      .where(eq(riskChangeLogs.riskId, riskId))
      .orderBy(desc(riskChangeLogs.changedAt));
  }

  async createRiskChangeLog(log: InsertRiskChangeLog): Promise<RiskChangeLog> {
    const [newLog] = await db.insert(riskChangeLogs).values(log).returning();
    return newLog;
  }

  // Issue Change Logs
  async getIssueChangeLogs(issueId: number): Promise<IssueChangeLog[]> {
    return await db.select().from(issueChangeLogs)
      .where(eq(issueChangeLogs.issueId, issueId))
      .orderBy(desc(issueChangeLogs.changedAt));
  }

  async createIssueChangeLog(log: InsertIssueChangeLog): Promise<IssueChangeLog> {
    const [newLog] = await db.insert(issueChangeLogs).values(log).returning();
    return newLog;
  }

  // Task Dependencies
  async getTaskDependencies(taskId: number): Promise<TaskDependency[]> {
    return await db.select().from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId));
  }

  async getTaskDependents(taskId: number): Promise<TaskDependency[]> {
    return await db.select().from(taskDependencies)
      .where(eq(taskDependencies.dependsOnTaskId, taskId));
  }

  async createTaskDependency(dependency: InsertTaskDependency): Promise<TaskDependency> {
    const [newDep] = await db.insert(taskDependencies).values(dependency).returning();
    return newDep;
  }

  async deleteTaskDependency(taskId: number, dependsOnTaskId: number): Promise<void> {
    await db.delete(taskDependencies)
      .where(and(
        eq(taskDependencies.taskId, taskId),
        eq(taskDependencies.dependsOnTaskId, dependsOnTaskId)
      ));
  }

  // Project Financials
  async getProjectFinancials(projectId: number): Promise<ProjectFinancial[]> {
    return await db.select().from(projectFinancials)
      .where(eq(projectFinancials.projectId, projectId))
      .orderBy(projectFinancials.fiscalYear, projectFinancials.category, projectFinancials.lineItem);
  }

  async getProjectFinancial(id: number): Promise<ProjectFinancial | undefined> {
    const [financial] = await db.select().from(projectFinancials).where(eq(projectFinancials.id, id));
    return financial;
  }

  async createProjectFinancial(financial: InsertProjectFinancial): Promise<ProjectFinancial> {
    const [newFinancial] = await db.insert(projectFinancials).values(financial).returning();
    return newFinancial;
  }

  async updateProjectFinancial(id: number, updates: UpdateProjectFinancialRequest): Promise<ProjectFinancial> {
    const [updatedFinancial] = await db.update(projectFinancials)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectFinancials.id, id))
      .returning();
    return updatedFinancial;
  }

  async deleteProjectFinancial(id: number): Promise<void> {
    await db.delete(projectFinancials).where(eq(projectFinancials.id, id));
  }

  // Portfolio Aggregations
  async getPortfolioProjects(portfolioId: number): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.portfolioId, portfolioId));
  }

  async getPortfolioRisks(portfolioId: number): Promise<(Risk & { projectName: string })[]> {
    const portfolioProjects = await this.getPortfolioProjects(portfolioId);
    const projectIds = portfolioProjects.map(p => p.id);
    if (projectIds.length === 0) return [];
    
    const allRisks: (Risk & { projectName: string })[] = [];
    for (const project of portfolioProjects) {
      const projectRisks = await db.select().from(risks).where(eq(risks.projectId, project.id));
      allRisks.push(...projectRisks.map(r => ({ ...r, projectName: project.name })));
    }
    return allRisks;
  }

  async getPortfolioIssues(portfolioId: number): Promise<(Issue & { projectName: string })[]> {
    const portfolioProjects = await this.getPortfolioProjects(portfolioId);
    if (portfolioProjects.length === 0) return [];
    
    const allIssues: (Issue & { projectName: string })[] = [];
    for (const project of portfolioProjects) {
      const projectIssues = await db.select().from(issues).where(eq(issues.projectId, project.id));
      allIssues.push(...projectIssues.map(i => ({ ...i, projectName: project.name })));
    }
    return allIssues;
  }

  async getPortfolioMilestones(portfolioId: number): Promise<(Milestone & { projectName: string })[]> {
    const portfolioProjects = await this.getPortfolioProjects(portfolioId);
    if (portfolioProjects.length === 0) return [];
    
    const allMilestones: (Milestone & { projectName: string })[] = [];
    for (const project of portfolioProjects) {
      const projectMilestones = await db.select().from(milestones).where(eq(milestones.projectId, project.id));
      allMilestones.push(...projectMilestones.map(m => ({ ...m, projectName: project.name })));
    }
    return allMilestones;
  }

  // Global Search
  async search(query: string, organizationIds?: number[]): Promise<{
    portfolios: Portfolio[];
    projects: Project[];
    tasks: Task[];
    issues: Issue[];
    risks: Risk[];
    milestones: Milestone[];
  }> {
    const searchPattern = `%${query}%`;
    const limit = 10;

    // Filter portfolios by organization IDs
    const portfolioResults = await db.select().from(portfolios)
      .where(
        and(
          organizationIds && organizationIds.length > 0
            ? sql`${portfolios.organizationId} IN (${sql.join(organizationIds.map(id => sql`${id}`), sql`, `)})`
            : sql`1=1`,
          or(
            ilike(portfolios.name, searchPattern),
            ilike(portfolios.description, searchPattern)
          )
        )
      )
      .limit(limit);

    // Filter projects by organization IDs
    const projectResults = await db.select().from(projects)
      .where(
        and(
          organizationIds && organizationIds.length > 0
            ? sql`${projects.organizationId} IN (${sql.join(organizationIds.map(id => sql`${id}`), sql`, `)})`
            : sql`1=1`,
          or(
            ilike(projects.name, searchPattern),
            ilike(projects.description, searchPattern)
          )
        )
      )
      .limit(limit);

    // Get accessible project IDs for filtering tasks, issues, risks, milestones
    const accessibleProjects = organizationIds && organizationIds.length > 0
      ? await db.select({ id: projects.id }).from(projects)
          .where(sql`${projects.organizationId} IN (${sql.join(organizationIds.map(id => sql`${id}`), sql`, `)})`)
      : await db.select({ id: projects.id }).from(projects);
    const projectIds = accessibleProjects.map(p => p.id);

    if (projectIds.length === 0) {
      return {
        portfolios: portfolioResults,
        projects: projectResults,
        tasks: [],
        issues: [],
        risks: [],
        milestones: [],
      };
    }

    // Filter tasks by accessible projects
    const taskResults = await db.select().from(tasks)
      .where(
        and(
          sql`${tasks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          or(
            ilike(tasks.name, searchPattern),
            ilike(tasks.description, searchPattern)
          )
        )
      )
      .limit(limit);

    // Filter issues by accessible projects
    const issueResults = await db.select().from(issues)
      .where(
        and(
          sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          or(
            ilike(issues.title, searchPattern),
            ilike(issues.description, searchPattern)
          )
        )
      )
      .limit(limit);

    // Filter risks by accessible projects
    const riskResults = await db.select().from(risks)
      .where(
        and(
          sql`${risks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          or(
            ilike(risks.title, searchPattern),
            ilike(risks.description, searchPattern)
          )
        )
      )
      .limit(limit);

    // Filter milestones by accessible projects
    const milestoneResults = await db.select().from(milestones)
      .where(
        and(
          sql`${milestones.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          or(
            ilike(milestones.title, searchPattern),
            ilike(milestones.description, searchPattern)
          )
        )
      )
      .limit(limit);

    return {
      portfolios: portfolioResults,
      projects: projectResults,
      tasks: taskResults,
      issues: issueResults,
      risks: riskResults,
      milestones: milestoneResults,
    };
  }

  async deleteAllDemoDataForOrganization(organizationId: number): Promise<{
    portfolios: number;
    projects: number;
    tasks: number;
    risks: number;
    milestones: number;
    issues: number;
    financials: number;
  }> {
    const stats = {
      portfolios: 0,
      projects: 0,
      tasks: 0,
      risks: 0,
      milestones: 0,
      issues: 0,
      financials: 0,
    };

    // Get all DEMO projects for this organization (only isDemo=true)
    const demoProjects = await db.select().from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.isDemo, true)));
    
    for (const project of demoProjects) {
      // Delete DEMO tasks for this project (and their dependencies/logs)
      const demoTasks = await db.select().from(tasks)
        .where(and(eq(tasks.projectId, project.id), eq(tasks.isDemo, true)));
      for (const task of demoTasks) {
        await db.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id));
        await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, task.id));
        await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
      }
      const deletedTasks = await db.delete(tasks)
        .where(and(eq(tasks.projectId, project.id), eq(tasks.isDemo, true))).returning();
      stats.tasks += deletedTasks.length;
      
      // Delete DEMO risks
      const deletedRisks = await db.delete(risks)
        .where(and(eq(risks.projectId, project.id), eq(risks.isDemo, true))).returning();
      stats.risks += deletedRisks.length;
      
      // Delete DEMO milestones
      const deletedMilestones = await db.delete(milestones)
        .where(and(eq(milestones.projectId, project.id), eq(milestones.isDemo, true))).returning();
      stats.milestones += deletedMilestones.length;
      
      // Delete DEMO issues
      const deletedIssues = await db.delete(issues)
        .where(and(eq(issues.projectId, project.id), eq(issues.isDemo, true))).returning();
      stats.issues += deletedIssues.length;
      
      // Delete DEMO financials
      const deletedFinancials = await db.delete(projectFinancials)
        .where(and(eq(projectFinancials.projectId, project.id), eq(projectFinancials.isDemo, true))).returning();
      stats.financials += deletedFinancials.length;
      
      // Check if this demo project has any remaining (non-demo) children before deleting
      const remainingTasks = await db.select({ count: sql`count(*)` }).from(tasks).where(eq(tasks.projectId, project.id));
      const remainingRisks = await db.select({ count: sql`count(*)` }).from(risks).where(eq(risks.projectId, project.id));
      const remainingMilestones = await db.select({ count: sql`count(*)` }).from(milestones).where(eq(milestones.projectId, project.id));
      const remainingIssues = await db.select({ count: sql`count(*)` }).from(issues).where(eq(issues.projectId, project.id));
      const remainingFinancials = await db.select({ count: sql`count(*)` }).from(projectFinancials).where(eq(projectFinancials.projectId, project.id));
      
      const hasRemainingChildren = 
        Number(remainingTasks[0]?.count || 0) > 0 ||
        Number(remainingRisks[0]?.count || 0) > 0 ||
        Number(remainingMilestones[0]?.count || 0) > 0 ||
        Number(remainingIssues[0]?.count || 0) > 0 ||
        Number(remainingFinancials[0]?.count || 0) > 0;
      
      // Only delete the demo project if it has no remaining children
      if (!hasRemainingChildren) {
        await db.delete(projects).where(eq(projects.id, project.id));
        stats.projects++;
      }
    }
    
    // Delete DEMO portfolios only if they have no remaining projects
    const demoPortfolios = await db.select().from(portfolios)
      .where(and(eq(portfolios.organizationId, organizationId), eq(portfolios.isDemo, true)));
    
    for (const portfolio of demoPortfolios) {
      const remainingProjects = await db.select({ count: sql`count(*)` }).from(projects)
        .where(eq(projects.portfolioId, portfolio.id));
      
      if (Number(remainingProjects[0]?.count || 0) === 0) {
        await db.delete(portfolios).where(eq(portfolios.id, portfolio.id));
        stats.portfolios++;
      }
    }
    
    return stats;
  }

  // Recycle Bin Methods
  async getDeletedItems(organizationId: number): Promise<RecycleBinItem[]> {
    const items: RecycleBinItem[] = [];

    // Get deleted portfolios
    const deletedPortfolios = await db.select().from(portfolios)
      .where(and(eq(portfolios.organizationId, organizationId), isNotNull(portfolios.deletedAt)));
    for (const p of deletedPortfolios) {
      const deleter = p.deletedBy ? await this.getUser(p.deletedBy) : null;
      items.push({
        id: p.id,
        type: 'portfolio',
        name: p.name,
        deletedAt: p.deletedAt!,
        deletedBy: p.deletedBy,
        deletedByName: deleter ? `${deleter.firstName || ''} ${deleter.lastName || ''}`.trim() || deleter.email || 'Unknown' : undefined
      });
    }

    // Get deleted projects
    const deletedProjects = await db.select().from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNotNull(projects.deletedAt)));
    for (const p of deletedProjects) {
      const deleter = p.deletedBy ? await this.getUser(p.deletedBy) : null;
      items.push({
        id: p.id,
        type: 'project',
        name: p.name,
        deletedAt: p.deletedAt!,
        deletedBy: p.deletedBy,
        deletedByName: deleter ? `${deleter.firstName || ''} ${deleter.lastName || ''}`.trim() || deleter.email || 'Unknown' : undefined
      });
    }

    // Get project IDs for this organization to filter related items
    const orgProjects = await db.select({ id: projects.id, name: projects.name }).from(projects)
      .where(eq(projects.organizationId, organizationId));
    const projectMap = new Map(orgProjects.map(p => [p.id, p.name]));
    const projectIds = orgProjects.map(p => p.id);

    if (projectIds.length > 0) {
      // Get deleted tasks
      const deletedTasks = await db.select().from(tasks)
        .where(and(
          sql`${tasks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          isNotNull(tasks.deletedAt)
        ));
      for (const t of deletedTasks) {
        const deleter = t.deletedBy ? await this.getUser(t.deletedBy) : null;
        items.push({
          id: t.id,
          type: 'task',
          name: t.name,
          projectName: projectMap.get(t.projectId),
          deletedAt: t.deletedAt!,
          deletedBy: t.deletedBy,
          deletedByName: deleter ? `${deleter.firstName || ''} ${deleter.lastName || ''}`.trim() || deleter.email || 'Unknown' : undefined
        });
      }

      // Get deleted risks
      const deletedRisks = await db.select().from(risks)
        .where(and(
          sql`${risks.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          isNotNull(risks.deletedAt)
        ));
      for (const r of deletedRisks) {
        const deleter = r.deletedBy ? await this.getUser(r.deletedBy) : null;
        items.push({
          id: r.id,
          type: 'risk',
          name: r.title,
          projectName: projectMap.get(r.projectId),
          deletedAt: r.deletedAt!,
          deletedBy: r.deletedBy,
          deletedByName: deleter ? `${deleter.firstName || ''} ${deleter.lastName || ''}`.trim() || deleter.email || 'Unknown' : undefined
        });
      }

      // Get deleted milestones
      const deletedMilestones = await db.select().from(milestones)
        .where(and(
          sql`${milestones.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          isNotNull(milestones.deletedAt)
        ));
      for (const m of deletedMilestones) {
        const deleter = m.deletedBy ? await this.getUser(m.deletedBy) : null;
        items.push({
          id: m.id,
          type: 'milestone',
          name: m.title,
          projectName: projectMap.get(m.projectId),
          deletedAt: m.deletedAt!,
          deletedBy: m.deletedBy,
          deletedByName: deleter ? `${deleter.firstName || ''} ${deleter.lastName || ''}`.trim() || deleter.email || 'Unknown' : undefined
        });
      }

      // Get deleted issues
      const deletedIssues = await db.select().from(issues)
        .where(and(
          sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          isNotNull(issues.deletedAt)
        ));
      for (const i of deletedIssues) {
        const deleter = i.deletedBy ? await this.getUser(i.deletedBy) : null;
        items.push({
          id: i.id,
          type: 'issue',
          name: i.title,
          projectName: projectMap.get(i.projectId),
          deletedAt: i.deletedAt!,
          deletedBy: i.deletedBy,
          deletedByName: deleter ? `${deleter.firstName || ''} ${deleter.lastName || ''}`.trim() || deleter.email || 'Unknown' : undefined
        });
      }
    }

    // Sort by deletedAt descending (most recent first)
    return items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
  }

  async softDeleteItem(type: RecycleBinItemType, id: number, userId: string, organizationId?: number): Promise<boolean> {
    const now = new Date();
    switch (type) {
      case 'portfolio':
        if (organizationId) {
          const [p] = await db.select().from(portfolios).where(and(eq(portfolios.id, id), eq(portfolios.organizationId, organizationId)));
          if (!p) return false;
        }
        await db.update(portfolios).set({ deletedAt: now, deletedBy: userId }).where(eq(portfolios.id, id));
        break;
      case 'project':
        if (organizationId) {
          const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)));
          if (!p) return false;
        }
        await db.update(projects).set({ deletedAt: now, deletedBy: userId }).where(eq(projects.id, id));
        break;
      case 'task':
        if (organizationId) {
          const [t] = await db.select().from(tasks).where(eq(tasks.id, id));
          if (!t) return false;
          const [p] = await db.select().from(projects).where(and(eq(projects.id, t.projectId), eq(projects.organizationId, organizationId)));
          if (!p) return false;
        }
        await db.update(tasks).set({ deletedAt: now, deletedBy: userId }).where(eq(tasks.id, id));
        break;
      case 'risk':
        if (organizationId) {
          const [r] = await db.select().from(risks).where(eq(risks.id, id));
          if (!r) return false;
          const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
          if (!p) return false;
        }
        await db.update(risks).set({ deletedAt: now, deletedBy: userId }).where(eq(risks.id, id));
        break;
      case 'milestone':
        if (organizationId) {
          const [m] = await db.select().from(milestones).where(eq(milestones.id, id));
          if (!m) return false;
          const [p] = await db.select().from(projects).where(and(eq(projects.id, m.projectId), eq(projects.organizationId, organizationId)));
          if (!p) return false;
        }
        await db.update(milestones).set({ deletedAt: now, deletedBy: userId }).where(eq(milestones.id, id));
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

  async restoreItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean> {
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
        const [r] = await db.select().from(risks).where(eq(risks.id, id));
        if (!r) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
        await db.update(risks).set({ deletedAt: null, deletedBy: null }).where(eq(risks.id, id));
        break;
      }
      case 'milestone': {
        const [m] = await db.select().from(milestones).where(eq(milestones.id, id));
        if (!m) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, m.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
        await db.update(milestones).set({ deletedAt: null, deletedBy: null }).where(eq(milestones.id, id));
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

  async permanentlyDeleteItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean> {
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
        // Delete related items first
        const projectTasks = await db.select().from(tasks).where(eq(tasks.projectId, id));
        for (const task of projectTasks) {
          await db.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id));
          await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, task.id));
          await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
        }
        await db.delete(tasks).where(eq(tasks.projectId, id));
        await db.delete(risks).where(eq(risks.projectId, id));
        await db.delete(milestones).where(eq(milestones.projectId, id));
        await db.delete(issues).where(eq(issues.projectId, id));
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
        const [r] = await db.select().from(risks).where(eq(risks.id, id));
        if (!r) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
        await db.delete(risks).where(eq(risks.id, id));
        break;
      }
      case 'milestone': {
        const [m] = await db.select().from(milestones).where(eq(milestones.id, id));
        if (!m) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, m.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
        await db.delete(milestones).where(eq(milestones.id, id));
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

  // Resources
  async syncOrganizationMembersAsResources(organizationId: number): Promise<void> {
    // Get all org members with their user info
    const members = await db.select({
      userId: organizationMembers.userId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, organizationId));

    // Insert resources for members that don't have one yet using ON CONFLICT DO NOTHING
    // This is concurrency-safe due to the unique index on (organization_id, user_id)
    for (const member of members) {
      const displayName = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || member.userId;
      await db.insert(resources).values({
        organizationId,
        userId: member.userId,
        displayName,
        email: member.email || null,
        isActive: true,
      }).onConflictDoNothing();
    }
  }

  async getResources(organizationId: number): Promise<Resource[]> {
    // Auto-sync org members as resources before returning
    await this.syncOrganizationMembersAsResources(organizationId);
    
    return await db.select().from(resources)
      .where(and(
        eq(resources.organizationId, organizationId),
        isNull(resources.deletedAt)
      ))
      .orderBy(resources.displayName);
  }

  async getResource(id: number): Promise<Resource | undefined> {
    const [resource] = await db.select().from(resources).where(eq(resources.id, id));
    return resource;
  }

  async createResource(resource: InsertResource): Promise<Resource> {
    const [newResource] = await db.insert(resources).values(resource).returning();
    return newResource;
  }

  async updateResource(id: number, updates: UpdateResourceRequest): Promise<Resource> {
    const [updated] = await db.update(resources)
      .set(updates)
      .where(eq(resources.id, id))
      .returning();
    return updated;
  }

  async deleteResource(id: number): Promise<void> {
    // First delete all assignments for this resource
    await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.resourceId, id));
    await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.resourceId, id));
    await db.delete(riskResourceAssignments).where(eq(riskResourceAssignments.resourceId, id));
    // Then delete the resource
    await db.delete(resources).where(eq(resources.id, id));
  }

  // Task Resource Assignments
  async getTaskResourceAssignments(taskId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]> {
    const assignments = await db.select()
      .from(taskResourceAssignments)
      .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
      .where(eq(taskResourceAssignments.taskId, taskId));
    
    return assignments.map(a => ({
      ...a.task_resource_assignments,
      resource: a.resources
    }));
  }

  async addTaskResourceAssignment(assignment: InsertTaskResourceAssignment): Promise<TaskResourceAssignment> {
    const [newAssignment] = await db.insert(taskResourceAssignments).values(assignment).returning();
    return newAssignment;
  }

  async removeTaskResourceAssignment(taskId: number, resourceId: number): Promise<void> {
    await db.delete(taskResourceAssignments)
      .where(and(
        eq(taskResourceAssignments.taskId, taskId),
        eq(taskResourceAssignments.resourceId, resourceId)
      ));
  }

  async updateTaskResourceAssignments(taskId: number, resourceIds: number[]): Promise<void> {
    // Remove all existing assignments
    await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, taskId));
    // Add new assignments
    if (resourceIds.length > 0) {
      await db.insert(taskResourceAssignments).values(
        resourceIds.map(resourceId => ({ taskId, resourceId }))
      );
    }
  }

  // Issue Resource Assignments
  async getIssueResourceAssignments(issueId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]> {
    const assignments = await db.select()
      .from(issueResourceAssignments)
      .innerJoin(resources, eq(issueResourceAssignments.resourceId, resources.id))
      .where(eq(issueResourceAssignments.issueId, issueId));
    
    return assignments.map(a => ({
      ...a.issue_resource_assignments,
      resource: a.resources
    }));
  }

  async addIssueResourceAssignment(assignment: InsertIssueResourceAssignment): Promise<IssueResourceAssignment> {
    const [newAssignment] = await db.insert(issueResourceAssignments).values(assignment).returning();
    return newAssignment;
  }

  async removeIssueResourceAssignment(issueId: number, resourceId: number): Promise<void> {
    await db.delete(issueResourceAssignments)
      .where(and(
        eq(issueResourceAssignments.issueId, issueId),
        eq(issueResourceAssignments.resourceId, resourceId)
      ));
  }

  async updateIssueResourceAssignments(issueId: number, resourceIds: number[]): Promise<void> {
    await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.issueId, issueId));
    if (resourceIds.length > 0) {
      await db.insert(issueResourceAssignments).values(
        resourceIds.map(resourceId => ({ issueId, resourceId }))
      );
    }
  }

  // Risk Resource Assignments
  async getRiskResourceAssignments(riskId: number): Promise<(RiskResourceAssignment & { resource: Resource })[]> {
    const assignments = await db.select()
      .from(riskResourceAssignments)
      .innerJoin(resources, eq(riskResourceAssignments.resourceId, resources.id))
      .where(eq(riskResourceAssignments.riskId, riskId));
    
    return assignments.map(a => ({
      ...a.risk_resource_assignments,
      resource: a.resources
    }));
  }

  async addRiskResourceAssignment(assignment: InsertRiskResourceAssignment): Promise<RiskResourceAssignment> {
    const [newAssignment] = await db.insert(riskResourceAssignments).values(assignment).returning();
    return newAssignment;
  }

  async removeRiskResourceAssignment(riskId: number, resourceId: number): Promise<void> {
    await db.delete(riskResourceAssignments)
      .where(and(
        eq(riskResourceAssignments.riskId, riskId),
        eq(riskResourceAssignments.resourceId, resourceId)
      ));
  }

  async updateRiskResourceAssignments(riskId: number, resourceIds: number[]): Promise<void> {
    await db.delete(riskResourceAssignments).where(eq(riskResourceAssignments.riskId, riskId));
    if (resourceIds.length > 0) {
      await db.insert(riskResourceAssignments).values(
        resourceIds.map(resourceId => ({ riskId, resourceId }))
      );
    }
  }

  // Cost Items
  async getCostItems(projectId: number, fiscalYear?: number): Promise<CostItem[]> {
    if (fiscalYear) {
      return await db.select().from(costItems)
        .where(and(
          eq(costItems.projectId, projectId),
          eq(costItems.fiscalYear, fiscalYear)
        ))
        .orderBy(costItems.sortOrder, costItems.id);
    }
    return await db.select().from(costItems)
      .where(eq(costItems.projectId, projectId))
      .orderBy(costItems.sortOrder, costItems.id);
  }

  async getCostItem(id: number): Promise<CostItem | undefined> {
    const [item] = await db.select().from(costItems).where(eq(costItems.id, id));
    return item;
  }

  async createCostItem(costItem: InsertCostItem): Promise<CostItem> {
    const [newItem] = await db.insert(costItems).values(costItem).returning();
    return newItem;
  }

  async updateCostItem(id: number, updates: UpdateCostItemRequest): Promise<CostItem> {
    const [updated] = await db.update(costItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(costItems.id, id))
      .returning();
    return updated;
  }

  async deleteCostItem(id: number): Promise<void> {
    // First delete any children
    await db.delete(costItems).where(eq(costItems.parentId, id));
    // Then delete the item itself
    await db.delete(costItems).where(eq(costItems.id, id));
  }

  // Project Intakes
  async getProjectIntakes(organizationId: number): Promise<ProjectIntake[]> {
    return await db.select().from(projectIntakes)
      .where(and(
        eq(projectIntakes.organizationId, organizationId),
        isNull(projectIntakes.deletedAt)
      ))
      .orderBy(desc(projectIntakes.createdAt));
  }

  async getProjectIntake(id: number): Promise<ProjectIntake | undefined> {
    const [intake] = await db.select().from(projectIntakes).where(eq(projectIntakes.id, id));
    return intake;
  }

  async createProjectIntake(intake: InsertProjectIntake): Promise<ProjectIntake> {
    // Generate intake number
    const year = new Date().getFullYear();
    const existingCount = await db.select({ count: sql<number>`count(*)` })
      .from(projectIntakes)
      .where(sql`EXTRACT(YEAR FROM ${projectIntakes.createdAt}) = ${year}`);
    const count = Number(existingCount[0]?.count || 0) + 1;
    const intakeNumber = `INT-${year}-${String(count).padStart(3, '0')}`;
    
    const [newIntake] = await db.insert(projectIntakes)
      .values({ ...intake, intakeNumber })
      .returning();
    return newIntake;
  }

  async updateProjectIntake(id: number, updates: UpdateProjectIntakeRequest): Promise<ProjectIntake> {
    const [updated] = await db.update(projectIntakes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectIntakes.id, id))
      .returning();
    return updated;
  }

  async deleteProjectIntake(id: number): Promise<void> {
    await db.delete(projectIntakes).where(eq(projectIntakes.id, id));
  }

  async approveProjectIntake(id: number, approvedBy: string): Promise<Project> {
    // Get the intake
    const intake = await this.getProjectIntake(id);
    if (!intake) {
      throw new Error("Project intake not found");
    }

    // Create the project from intake data
    const [newProject] = await db.insert(projects).values({
      organizationId: intake.organizationId,
      portfolioId: intake.portfolioId,
      name: intake.projectName,
      description: intake.description,
      budget: intake.estimatedBudget || "0",
      status: "Initiation",
      priority: "Medium",
      health: "Green",
    }).returning();

    // Update the intake with approval info and created project reference
    await db.update(projectIntakes)
      .set({
        status: "approved",
        currentStep: "submit_to_pmo",
        pmoSubmitted: true,
        approvedAt: new Date(),
        approvedBy: approvedBy,
        createdProjectId: newProject.id,
        updatedAt: new Date(),
      })
      .where(eq(projectIntakes.id, id));

    return newProject;
  }

  // MPP Imports
  async getMppImports(organizationId: number): Promise<MppImport[]> {
    return await db.select().from(mppImports)
      .where(and(
        eq(mppImports.organizationId, organizationId),
        eq(mppImports.status, "active")
      ))
      .orderBy(desc(mppImports.lastSyncedAt));
  }

  async getMppImport(id: number): Promise<MppImport | undefined> {
    const [mppImport] = await db.select().from(mppImports).where(eq(mppImports.id, id));
    return mppImport;
  }

  async createMppImport(mppImport: InsertMppImport): Promise<MppImport> {
    const [newImport] = await db.insert(mppImports).values(mppImport).returning();
    return newImport;
  }

  async updateMppImport(id: number, updates: Partial<InsertMppImport>): Promise<MppImport> {
    const [updated] = await db.update(mppImports)
      .set({ ...updates, lastSyncedAt: new Date() })
      .where(eq(mppImports.id, id))
      .returning();
    return updated;
  }

  async deleteMppImport(id: number): Promise<void> {
    await db.delete(mppImportTasks).where(eq(mppImportTasks.importId, id));
    await db.delete(mppImports).where(eq(mppImports.id, id));
  }

  // MPP Import Tasks
  async getMppImportTasks(importId: number): Promise<MppImportTask[]> {
    return await db.select().from(mppImportTasks)
      .where(eq(mppImportTasks.importId, importId))
      .orderBy(mppImportTasks.taskId);
  }

  async createMppImportTask(task: InsertMppImportTask): Promise<MppImportTask> {
    const [newTask] = await db.insert(mppImportTasks).values(task).returning();
    return newTask;
  }

  async createMppImportTasks(tasks: InsertMppImportTask[]): Promise<MppImportTask[]> {
    if (tasks.length === 0) return [];
    return await db.insert(mppImportTasks).values(tasks).returning();
  }

  async deleteMppImportTasks(importId: number): Promise<void> {
    await db.delete(mppImportTasks).where(eq(mppImportTasks.importId, importId));
  }

  // Convert MPP Import to Project with Tasks
  async convertMppImportToProject(
    importId: number,
    projectData: {
      organizationId: number;
      portfolioId?: number;
      name: string;
      description?: string;
      status?: string;
      priority?: string;
    }
  ): Promise<{ project: Project; taskCount: number }> {
    // Get the import
    const mppImport = await this.getMppImport(importId);
    if (!mppImport) {
      throw new Error("Import not found");
    }

    // Get the imported tasks
    const importedTasks = await this.getMppImportTasks(importId);
    
    // Create the project
    const [newProject] = await db.insert(projects).values({
      organizationId: projectData.organizationId,
      portfolioId: projectData.portfolioId || null,
      name: projectData.name,
      description: projectData.description || mppImport.fileName,
      status: projectData.status || "Initiation",
      priority: projectData.priority || "Medium",
      health: "Green",
      budget: "0",
      completionPercentage: 0,
    }).returning();

    // Calculate default dates if needed
    const today = new Date().toISOString().split('T')[0];
    const defaultEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Create a mapping from old taskId to new task id
    const taskIdMapping: Map<number, number> = new Map();
    
    // First pass: create all tasks without parent references
    for (const importedTask of importedTasks) {
      const startDate = importedTask.startDate || today;
      const endDate = importedTask.finishDate || 
        (importedTask.durationDays 
          ? new Date(new Date(startDate).getTime() + importedTask.durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : defaultEndDate);

      const [newTask] = await db.insert(tasks).values({
        projectId: newProject.id,
        name: importedTask.taskName,
        description: importedTask.notes || (importedTask.wbs ? `WBS: ${importedTask.wbs}` : undefined),
        startDate,
        endDate,
        durationDays: importedTask.durationDays,
        progress: importedTask.percentComplete || 0,
        status: importedTask.percentComplete === 100 ? "Completed" : 
                importedTask.percentComplete && importedTask.percentComplete > 0 ? "In Progress" : "Not Started",
        parentId: null, // Will update in second pass
      }).returning();

      if (importedTask.taskId) {
        taskIdMapping.set(importedTask.taskId, newTask.id);
      }
    }

    // Second pass: update parent references
    for (const importedTask of importedTasks) {
      if (importedTask.parentTaskId && importedTask.taskId) {
        const newTaskId = taskIdMapping.get(importedTask.taskId);
        const newParentId = taskIdMapping.get(importedTask.parentTaskId);
        
        if (newTaskId && newParentId) {
          await db.update(tasks)
            .set({ parentId: newParentId })
            .where(eq(tasks.id, newTaskId));
        }
      }
    }

    // Update the import with the created project ID
    await db.update(mppImports)
      .set({ projectId: newProject.id, status: "converted" })
      .where(eq(mppImports.id, importId));

    // Calculate and update project completion percentage based on tasks
    const avgProgress = importedTasks.length > 0
      ? Math.round(importedTasks.reduce((sum, t) => sum + (t.percentComplete || 0), 0) / importedTasks.length)
      : 0;
    
    await db.update(projects)
      .set({ completionPercentage: avgProgress })
      .where(eq(projects.id, newProject.id));

    return { project: newProject, taskCount: importedTasks.length };
  }
}

export const storage = new DatabaseStorage();
