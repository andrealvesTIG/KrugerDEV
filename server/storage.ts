import { db } from "./db";
import {
  users, portfolios, projects, risks, milestones, issues, tasks,
  type User, type UpsertUser,
  type Portfolio, type InsertPortfolio, type UpdatePortfolioRequest,
  type Project, type InsertProject, type UpdateProjectRequest,
  type Risk, type InsertRisk, type UpdateRiskRequest,
  type Milestone, type InsertMilestone, type UpdateMilestoneRequest,
  type Issue, type InsertIssue, type UpdateIssueRequest,
  type Task, type InsertTask, type UpdateTaskRequest
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;

  // Portfolios
  getPortfolios(): Promise<Portfolio[]>;
  getPortfolio(id: number): Promise<Portfolio | undefined>;
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, updates: UpdatePortfolioRequest): Promise<Portfolio>;
  deletePortfolio(id: number): Promise<void>;

  // Projects
  getProjects(portfolioId?: number): Promise<Project[]>;
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
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: UpdateTaskRequest): Promise<Task>;
  deleteTask(id: number): Promise<void>;
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

  // Portfolios
  async getPortfolios(): Promise<Portfolio[]> {
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
  async getProjects(portfolioId?: number): Promise<Project[]> {
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
    await db.delete(tasks).where(eq(tasks.id, id));
  }
}

export const storage = new DatabaseStorage();
