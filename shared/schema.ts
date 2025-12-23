import { pgTable, text, serial, integer, boolean, timestamp, date, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

// Users (Imported from ./models/auth)

// Portfolios - High level grouping of projects
export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  strategy: text("strategy"), // Strategic alignment description
  managerId: varchar("manager_id").references(() => users.id), // Changed to varchar to match users.id
  createdAt: timestamp("created_at").defaultNow(),
});

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
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
});

// Milestones
export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  dueDate: date("due_date").notNull(),
  completed: boolean("completed").default(false),
});

// === RELATIONS ===

export const usersRelations = relations(users, ({ many }) => ({
  managedPortfolios: many(portfolios, { relationName: "portfolioManager" }),
  managedProjects: many(projects, { relationName: "projectManager" }),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  manager: one(users, {
    fields: [portfolios.managerId],
    references: [users.id],
    relationName: "portfolioManager"
  }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
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

// === SCHEMAS ===

// insertUserSchema is now handled by models/auth types or we create one here for other uses
// But we should use the one from auth if possible, or create a new one for specific app usage
// replit auth uses UpsertUser type. 
// Let's define a schema for our app's user usage if needed, but mainly we use the auth one.
// createInsertSchema(users) would work.

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, completionPercentage: true, health: true });
export const insertRiskSchema = createInsertSchema(risks).omit({ id: true, createdAt: true });
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });

// === TYPES ===

// User types exported from models/auth

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Risk = typeof risks.$inferSelect;
export type InsertRisk = z.infer<typeof insertRiskSchema>;

export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;

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
