import { pgTable, text, serial, integer, boolean, timestamp, date, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

// Users (Imported from ./models/auth)

// Organizations (Tenants)
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  description: text("description"),
  ownerId: varchar("owner_id").references(() => users.id), // Organization creator
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization Members (Join table for users <-> organizations)
export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"), // 'org_admin', 'member', 'viewer'
  createdAt: timestamp("created_at").defaultNow(),
});

// Portfolios - High level grouping of projects
export const portfolios = pgTable("portfolios", {
  organizationId: integer("organization_id").references(() => organizations.id),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  strategy: text("strategy"), // Strategic alignment description
  managerId: varchar("manager_id").references(() => users.id), // Changed to varchar to match users.id
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
  deletedBy: varchar("deleted_by").references(() => users.id), // Who deleted it
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
});

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id),
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Initiation"), // Initiation, Planning, Execution, Monitoring, Closing
  priority: text("priority").notNull().default("Medium"), // Low, Medium, High, Critical
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: numeric("budget").notNull().default("0"),
  managerId: varchar("manager_id").references(() => users.id), // Changed to varchar to match users.id
  completionPercentage: integer("completion_percentage").default(0),
  health: text("health").default("Green"), // Green, Yellow, Red
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
});

// Risks
export const risks = pgTable("risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  probability: text("probability"), // Low, Medium, High
  impact: text("impact"), // Low, Medium, High
  status: text("status").default("Open"), // Open, Mitigated, Closed
  mitigationPlan: text("mitigation_plan"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
});

// Milestones
export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  startDate: date("start_date"),
  completed: boolean("completed").default(false),
  status: text("status").default("Backlog"), // Backlog, To Do, In Progress, Done
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  assignee: text("assignee"),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
});

// Issues
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  status: text("status").default("Open"), // Open, In Progress, Resolved, Closed
  type: text("type").default("Bug"), // Bug, Enhancement, Task, Question
  assignee: text("assignee"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
});

// Tasks (for Gantt Chart)
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  durationDays: integer("duration_days"), // Duration in days - auto-calculates endDate if set
  progress: integer("progress").default(0), // 0-100 percentage
  status: text("status").default("Not Started"), // Not Started, In Progress, Completed
  assignee: text("assignee"),
  parentId: integer("parent_id"), // For subtasks/dependencies
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
});

// Task Change Logs (Audit Trail)
export const taskChangeLogs = pgTable("task_change_logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"), // Store name for display even if user is deleted
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(), // 'created', 'updated', 'deleted'
  changeSummary: text("change_summary"), // Human-readable summary
  previousValues: text("previous_values"), // JSON string of changed fields before
  newValues: text("new_values"), // JSON string of changed fields after
});

// Project Change Logs (Audit Trail)
export const projectChangeLogs = pgTable("project_change_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"),
  newValues: text("new_values"),
});

// Risk Change Logs (Audit Trail)
export const riskChangeLogs = pgTable("risk_change_logs", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").references(() => risks.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"),
  newValues: text("new_values"),
});

// Issue Change Logs (Audit Trail)
export const issueChangeLogs = pgTable("issue_change_logs", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"),
  newValues: text("new_values"),
});

// Task Dependencies
export const taskDependencies = pgTable("task_dependencies", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  dependsOnTaskId: integer("depends_on_task_id").references(() => tasks.id).notNull(),
  dependencyType: text("dependency_type").default("finish-to-start"), // finish-to-start, start-to-start, finish-to-finish, start-to-finish
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Financials (Budget/Plan/Actuals with CapEx/OpEx breakdown)
export const projectFinancials = pgTable("project_financials", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  category: text("category").notNull(), // "CapEx" or "OpEx"
  lineItem: text("line_item").notNull(), // Name of the expense item (e.g., "Hardware", "Software Licenses", "Consulting")
  description: text("description"),
  fiscalYear: integer("fiscal_year").notNull(), // e.g., 2025, 2026
  fiscalPeriod: text("fiscal_period"), // e.g., "Q1", "Q2", "Jan", "Full Year"
  budgetAmount: numeric("budget_amount").default("0"), // Original budget/plan
  plannedAmount: numeric("planned_amount").default("0"), // Current planned amount (may differ from original budget)
  actualAmount: numeric("actual_amount").default("0"), // Actual spent
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
});

// === RELATIONS ===

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerId],
    references: [users.id],
  }),
  members: many(organizationMembers),
  portfolios: many(portfolios),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  managedPortfolios: many(portfolios, { relationName: "portfolioManager" }),
  managedProjects: many(projects, { relationName: "projectManager" }),
  organizationMemberships: many(organizationMembers),
  ownedOrganizations: many(organizations),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [portfolios.organizationId],
    references: [organizations.id],
  }),
  manager: one(users, {
    fields: [portfolios.managerId],
    references: [users.id],
    relationName: "portfolioManager"
  }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  portfolio: one(portfolios, {
    fields: [projects.portfolioId],
    references: [portfolios.id],
  }),
  manager: one(users, {
    fields: [projects.managerId],
    references: [users.id],
    relationName: "projectManager"
  }),
  risks: many(risks),
  milestones: many(milestones),
  issues: many(issues),
  tasks: many(tasks),
  financials: many(projectFinancials),
}));

export const projectFinancialsRelations = relations(projectFinancials, ({ one }) => ({
  project: one(projects, {
    fields: [projectFinancials.projectId],
    references: [projects.id],
  }),
}));

export const risksRelations = relations(risks, ({ one }) => ({
  project: one(projects, {
    fields: [risks.projectId],
    references: [projects.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  changeLogs: many(taskChangeLogs),
  dependencies: many(taskDependencies, { relationName: "taskDependencies" }),
  dependentOn: many(taskDependencies, { relationName: "taskDependentOn" }),
}));

export const taskChangeLogsRelations = relations(taskChangeLogs, ({ one }) => ({
  task: one(tasks, {
    fields: [taskChangeLogs.taskId],
    references: [tasks.id],
  }),
  changedByUser: one(users, {
    fields: [taskChangeLogs.changedBy],
    references: [users.id],
  }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: "taskDependencies",
  }),
  dependsOnTask: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: "taskDependentOn",
  }),
}));

// === SCHEMAS ===

// insertUserSchema is now handled by models/auth types or we create one here for other uses
// But we should use the one from auth if possible, or create a new one for specific app usage
// replit auth uses UpsertUser type. 
// Let's define a schema for our app's user usage if needed, but mainly we use the auth one.
// createInsertSchema(users) would work.

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({ id: true, createdAt: true });
export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertRiskSchema = createInsertSchema(risks).omit({ id: true, createdAt: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });
export const insertIssueSchema = createInsertSchema(issues).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertTaskChangeLogSchema = createInsertSchema(taskChangeLogs).omit({ id: true, changedAt: true });
export const insertProjectChangeLogSchema = createInsertSchema(projectChangeLogs).omit({ id: true, changedAt: true });
export const insertRiskChangeLogSchema = createInsertSchema(riskChangeLogs).omit({ id: true, changedAt: true });
export const insertIssueChangeLogSchema = createInsertSchema(issueChangeLogs).omit({ id: true, changedAt: true });
export const insertTaskDependencySchema = createInsertSchema(taskDependencies).omit({ id: true, createdAt: true });
export const insertProjectFinancialSchema = createInsertSchema(projectFinancials).omit({ id: true, createdAt: true, updatedAt: true });

// === TYPES ===

// User types exported from models/auth

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Risk = typeof risks.$inferSelect;
export type InsertRisk = z.infer<typeof insertRiskSchema>;

export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = z.infer<typeof insertIssueSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskChangeLog = typeof taskChangeLogs.$inferSelect;
export type InsertTaskChangeLog = z.infer<typeof insertTaskChangeLogSchema>;

export type ProjectChangeLog = typeof projectChangeLogs.$inferSelect;
export type InsertProjectChangeLog = z.infer<typeof insertProjectChangeLogSchema>;

export type RiskChangeLog = typeof riskChangeLogs.$inferSelect;
export type InsertRiskChangeLog = z.infer<typeof insertRiskChangeLogSchema>;

export type IssueChangeLog = typeof issueChangeLogs.$inferSelect;
export type InsertIssueChangeLog = z.infer<typeof insertIssueChangeLogSchema>;

export type TaskDependency = typeof taskDependencies.$inferSelect;
export type InsertTaskDependency = z.infer<typeof insertTaskDependencySchema>;

export type ProjectFinancial = typeof projectFinancials.$inferSelect;
export type InsertProjectFinancial = z.infer<typeof insertProjectFinancialSchema>;

// API Request/Response Types
export type CreatePortfolioRequest = InsertPortfolio;
export type UpdatePortfolioRequest = Partial<InsertPortfolio>;

export type CreateProjectRequest = InsertProject;
export type UpdateProjectRequest = Partial<InsertProject> & { 
  completionPercentage?: number;
  health?: string;
};

export type CreateRiskRequest = InsertRisk;
export type UpdateRiskRequest = Partial<InsertRisk>;

export type CreateMilestoneRequest = InsertMilestone;
export type UpdateMilestoneRequest = Partial<InsertMilestone>;

export type CreateIssueRequest = InsertIssue;
export type UpdateIssueRequest = Partial<InsertIssue>;

export type CreateTaskRequest = InsertTask;
export type UpdateTaskRequest = Partial<InsertTask>;

export type CreateProjectFinancialRequest = InsertProjectFinancial;
export type UpdateProjectFinancialRequest = Partial<InsertProjectFinancial>;

// Recycle Bin Types
export type RecycleBinItemType = 'portfolio' | 'project' | 'task' | 'risk' | 'milestone' | 'issue';

export interface RecycleBinItem {
  id: number;
  type: RecycleBinItemType;
  name: string;
  projectName?: string; // For items belonging to a project
  deletedAt: Date;
  deletedBy: string | null;
  deletedByName?: string;
}
