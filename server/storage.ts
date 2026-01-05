import { db } from "./db";
import {
  users, portfolios, projects, risks, milestones, issues, tasks,
  organizations, organizationMembers, taskChangeLogs, taskDependencies, projectFinancials,
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
  type TaskDependency, type InsertTaskDependency,
  type ProjectFinancial, type InsertProjectFinancial, type UpdateProjectFinancialRequest
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

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
      return await db.select().from(portfolios).where(eq(portfolios.organizationId, organizationId));
    }
    return await db.select().from(portfolios);
  }

  async getPortfolio(id: number): Promise<Portfolio | undefined> {
    const [portfolio] = await db.select().from(portfolios).where(eq(portfolios.id, id));
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
        and(eq(projects.organizationId, organizationId), eq(projects.portfolioId, portfolioId))
      );
    }
    if (organizationId) {
      return await db.select().from(projects).where(eq(projects.organizationId, organizationId));
    }
    if (portfolioId) {
      return await db.select().from(projects).where(eq(projects.portfolioId, portfolioId));
    }
    return await db.select().from(projects);
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
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
    return await db.select().from(risks).where(eq(risks.projectId, projectId));
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
    return await db.select().from(milestones).where(eq(milestones.projectId, projectId));
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
    return await db.select().from(issues).where(eq(issues.projectId, projectId));
  }

  async getAllIssues(): Promise<Issue[]> {
    return await db.select().from(issues);
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
    return await db.select().from(tasks).where(eq(tasks.projectId, projectId));
  }

  async getAllTasks(): Promise<Task[]> {
    return await db.select().from(tasks);
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
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
}

export const storage = new DatabaseStorage();
