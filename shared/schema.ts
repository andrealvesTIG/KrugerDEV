import { pgTable, text, serial, integer, boolean, timestamp, date, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { users } from "./models/auth";

export * from "./models/auth";
export * from "./models/chat";
export * from "./models/billing";

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
  hiddenModules: text("hidden_modules").array(), // Array of module keys to hide from sidebar
  moduleOrder: text("module_order").array(), // Array of module keys defining sidebar order
  hiddenGroups: text("hidden_groups").array(), // Array of group keys to hide from sidebar (e.g., 'menu', 'help')
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
  source: text("source").default("manual"), // "manual" = created in app, "imported" = from MPP/external file
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
  isMilestone: boolean("is_milestone").default(false), // Show task on project timeline
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

// Resources (Global list of team members/resources)
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id), // Links to organization member user (for auto-synced resources)
  displayName: text("display_name").notNull(),
  email: text("email"),
  title: text("title"), // Job title/role
  department: text("department"),
  skills: text("skills"), // Comma-separated skills
  hourlyRate: numeric("hourly_rate"), // For cost tracking
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
});

// Task Resource Assignments (Join table)
export const taskResourceAssignments = pgTable("task_resource_assignments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  allocationPercentage: integer("allocation_percentage").default(100), // 0-100%
  role: text("role"), // Role in this specific task (e.g., "Lead", "Support")
  createdAt: timestamp("created_at").defaultNow(),
});

// Issue Resource Assignments (Join table)
export const issueResourceAssignments = pgTable("issue_resource_assignments", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  role: text("role"), // Role (e.g., "Assignee", "Reviewer")
  createdAt: timestamp("created_at").defaultNow(),
});

// Risk Resource Assignments (Join table)
export const riskResourceAssignments = pgTable("risk_resource_assignments", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").references(() => risks.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  role: text("role"), // Role (e.g., "Owner", "Mitigator")
  createdAt: timestamp("created_at").defaultNow(),
});

// Change Requests (Project change control)
export const changeRequests = pgTable("change_requests", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  requestNumber: text("request_number"), // Auto-generated CR number (e.g., "CR-001")
  title: text("title").notNull(),
  description: text("description"),
  justification: text("justification"), // Business justification for the change
  type: text("type").default("Scope"), // Scope, Schedule, Budget, Resource, Quality
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  status: text("status").default("Draft"), // Draft, Submitted, Under Review, Approved, Rejected, Implemented
  impact: text("impact"), // Description of impact on project
  requestedBy: text("requested_by"), // Name of requester
  requestedDate: date("requested_date"),
  reviewedBy: text("reviewed_by"), // Name of reviewer/approver
  reviewedDate: date("reviewed_date"),
  implementedDate: date("implemented_date"),
  estimatedCost: numeric("estimated_cost"), // Cost impact of the change
  estimatedEffort: text("estimated_effort"), // Effort estimate (e.g., "5 days")
  affectedAreas: text("affected_areas"), // Comma-separated list of affected areas
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
});

// Project Documents (Documentation management)
export const projectDocuments = pgTable("project_documents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").default("General"), // Charter, Plan, Requirements, Design, Test, Training, General
  category: text("category"), // Project Management, Technical, Business, Compliance
  version: text("version").default("1.0"),
  status: text("status").default("Draft"), // Draft, In Review, Approved, Archived
  fileName: text("file_name"), // Original file name if uploaded
  fileUrl: text("file_url"), // URL/path to the document
  fileSize: integer("file_size"), // Size in bytes
  mimeType: text("mime_type"), // File MIME type
  content: text("content"), // For text-based documents, store content directly
  author: text("author"), // Document author
  owner: text("owner"), // Document owner/maintainer
  reviewedBy: text("reviewed_by"),
  reviewedDate: date("reviewed_date"),
  approvedBy: text("approved_by"),
  approvedDate: date("approved_date"),
  expiresAt: date("expires_at"), // Optional expiration date
  tags: text("tags"), // Comma-separated tags for categorization
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
});

// Project Comments (Notes feed for project discussions)
export const projectComments = pgTable("project_comments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  parentId: integer("parent_id"), // For threaded replies - references another comment
  content: text("content").notNull(),
  authorId: varchar("author_id").references(() => users.id),
  authorName: text("author_name"), // Stored for display even if user is deleted
  mentions: text("mentions").array(), // Array of user IDs mentioned with @
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
  isDemo: boolean("is_demo").default(false),
});

// Notifications for @mentions and other events
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // "mention", "comment_reply", etc.
  title: text("title").notNull(),
  message: text("message").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  commentId: integer("comment_id"),
  fromUserId: varchar("from_user_id").references(() => users.id),
  fromUserName: text("from_user_name"),
  isRead: boolean("is_read").default(false),
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

// Cost Items (Hierarchical financial line items with monthly breakdown)
export const costItems = pgTable("cost_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  parentId: integer("parent_id"), // Self-reference for hierarchy (null = root level)
  name: text("name").notNull(), // Cost item name
  wbs: text("wbs"), // Work Breakdown Structure code
  comments: text("comments"),
  category: text("category"), // "Direct Expense", "Licenses", "Outside Services", "Travel/Meals", "Project Material", etc.
  fiscalYear: integer("fiscal_year").notNull(), // e.g., 2026
  // Annual totals
  aopTotal: numeric("aop_total").default("0"), // Annual Operating Plan (original budget)
  fcstTotal: numeric("fcst_total").default("0"), // Forecast total
  actTotal: numeric("act_total").default("0"), // Actual total
  // Monthly forecasts (fiscal year Oct-Sep: M1=Oct, M2=Nov, ..., M12=Sep)
  fcstM1: numeric("fcst_m1").default("0"), // October
  fcstM2: numeric("fcst_m2").default("0"), // November
  fcstM3: numeric("fcst_m3").default("0"), // December
  fcstM4: numeric("fcst_m4").default("0"), // January
  fcstM5: numeric("fcst_m5").default("0"), // February
  fcstM6: numeric("fcst_m6").default("0"), // March
  fcstM7: numeric("fcst_m7").default("0"), // April
  fcstM8: numeric("fcst_m8").default("0"), // May
  fcstM9: numeric("fcst_m9").default("0"), // June
  fcstM10: numeric("fcst_m10").default("0"), // July
  fcstM11: numeric("fcst_m11").default("0"), // August
  fcstM12: numeric("fcst_m12").default("0"), // September
  // Monthly actuals
  actM1: numeric("act_m1").default("0"),
  actM2: numeric("act_m2").default("0"),
  actM3: numeric("act_m3").default("0"),
  actM4: numeric("act_m4").default("0"),
  actM5: numeric("act_m5").default("0"),
  actM6: numeric("act_m6").default("0"),
  actM7: numeric("act_m7").default("0"),
  actM8: numeric("act_m8").default("0"),
  actM9: numeric("act_m9").default("0"),
  actM10: numeric("act_m10").default("0"),
  actM11: numeric("act_m11").default("0"),
  actM12: numeric("act_m12").default("0"),
  sortOrder: integer("sort_order").default(0), // For manual ordering within parent
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
});

// Project Intakes (Intake workflow for new project ideas)
export const projectIntakes = pgTable("project_intakes", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  intakeNumber: text("intake_number"), // Auto-generated intake ID (e.g., "INT-2026-001")
  
  // Basic Information (Intake Form tab)
  projectName: text("project_name").notNull(),
  submitterId: varchar("submitter_id").references(() => users.id),
  description: text("description"),
  fundingSource: text("funding_source"), // "Business Funded", "IT Funded", "Shared", etc.
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  businessUnit: text("business_unit"), // BU field
  programId: integer("program_id"), // Reference to program (can be added later)
  programName: text("program_name"), // Stored program name for display
  
  // Workflow state
  currentStep: text("current_step").default("is_backlog"), // Workflow step
  status: text("status").default("draft"), // draft, in_progress, approved, rejected, cancelled
  
  // Step completion tracking
  isBacklogComplete: boolean("is_backlog_complete").default(false),
  basicInfoComplete: boolean("basic_info_complete").default(false),
  financialsComplete: boolean("financials_complete").default(false),
  projectCostComplete: boolean("project_cost_complete").default(false),
  cyberArchComplete: boolean("cyber_arch_complete").default(false),
  pmoSubmitted: boolean("pmo_submitted").default(false),
  
  // Financials tab data
  estimatedBudget: numeric("estimated_budget").default("0"),
  capitalExpense: numeric("capital_expense").default("0"),
  operatingExpense: numeric("operating_expense").default("0"),
  financialJustification: text("financial_justification"),
  
  // Cyber and Architectural Evaluation tab
  cyberRiskAssessment: text("cyber_risk_assessment"),
  architecturalReview: text("architectural_review"),
  complianceRequirements: text("compliance_requirements"),
  securityApproval: boolean("security_approval"),
  securityApprovalDate: timestamp("security_approval_date"),
  securityApproverId: varchar("security_approver_id").references(() => users.id),
  
  // Project Cost Evaluation (IT) tab
  itCostEstimate: numeric("it_cost_estimate").default("0"),
  resourceRequirements: text("resource_requirements"),
  implementationTimeline: text("implementation_timeline"),
  costBenefitAnalysis: text("cost_benefit_analysis"),
  
  // Approval tracking
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  
  // Created project reference (populated after approval)
  createdProjectId: integer("created_project_id").references(() => projects.id),
  
  // Meta
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
});

// Intake Workflow Steps - Configurable workflow steps per organization
export const intakeWorkflowSteps = pgTable("intake_workflow_steps", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  stepKey: text("step_key").notNull(), // Canonical step identifier: intake_capture, triage, business_case, technical_evaluation, governance_review, decision
  position: integer("position").notNull(), // Order in workflow (0-5)
  label: text("label").notNull(), // Display name (can be customized per org)
  description: text("description"), // Short description
  helpText: text("help_text"), // Detailed help text shown during step
  requiredFields: text("required_fields").array(), // Array of field names required at this step
  isActive: boolean("is_active").default(true), // Whether step is active
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// MPP Imports - Store imported Microsoft Project data
export const mppImports = pgTable("mpp_imports", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  projectId: integer("project_id").references(() => projects.id), // Optional link to existing project
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull().default("xml"), // "xml", "csv", "mpp"
  importedBy: varchar("imported_by").references(() => users.id),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  taskCount: integer("task_count").default(0),
  status: text("status").default("active"), // "active", "archived"
  createdAt: timestamp("created_at").defaultNow(),
});

// MPP Import Tasks - Individual tasks from MPP imports
export const mppImportTasks = pgTable("mpp_import_tasks", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").references(() => mppImports.id).notNull(),
  taskId: integer("task_id"), // Original task ID from the file
  wbs: text("wbs"), // Work Breakdown Structure code
  taskName: text("task_name").notNull(),
  startDate: date("start_date"),
  finishDate: date("finish_date"),
  duration: text("duration"), // Duration as text (e.g., "5 days")
  durationDays: integer("duration_days"), // Duration in days
  percentComplete: integer("percent_complete").default(0),
  outlineLevel: integer("outline_level").default(1), // Task hierarchy level
  parentTaskId: integer("parent_task_id"), // Parent task reference
  isSummary: boolean("is_summary").default(false), // Summary/parent task
  isMilestone: boolean("is_milestone").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
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
  costItems: many(costItems),
}));

export const projectFinancialsRelations = relations(projectFinancials, ({ one }) => ({
  project: one(projects, {
    fields: [projectFinancials.projectId],
    references: [projects.id],
  }),
}));

export const costItemsRelations = relations(costItems, ({ one }) => ({
  project: one(projects, {
    fields: [costItems.projectId],
    references: [projects.id],
  }),
}));

export const projectIntakesRelations = relations(projectIntakes, ({ one }) => ({
  organization: one(organizations, {
    fields: [projectIntakes.organizationId],
    references: [organizations.id],
  }),
  portfolio: one(portfolios, {
    fields: [projectIntakes.portfolioId],
    references: [portfolios.id],
  }),
  submitter: one(users, {
    fields: [projectIntakes.submitterId],
    references: [users.id],
  }),
  createdProject: one(projects, {
    fields: [projectIntakes.createdProjectId],
    references: [projects.id],
  }),
}));

export const risksRelations = relations(risks, ({ one }) => ({
  project: one(projects, {
    fields: [risks.projectId],
    references: [projects.id],
  }),
}));

export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  project: one(projects, {
    fields: [changeRequests.projectId],
    references: [projects.id],
  }),
}));

export const projectDocumentsRelations = relations(projectDocuments, ({ one }) => ({
  project: one(projects, {
    fields: [projectDocuments.projectId],
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
  resourceAssignments: many(taskResourceAssignments),
}));

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [resources.organizationId],
    references: [organizations.id],
  }),
  taskAssignments: many(taskResourceAssignments),
  issueAssignments: many(issueResourceAssignments),
  riskAssignments: many(riskResourceAssignments),
}));

export const taskResourceAssignmentsRelations = relations(taskResourceAssignments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskResourceAssignments.taskId],
    references: [tasks.id],
  }),
  resource: one(resources, {
    fields: [taskResourceAssignments.resourceId],
    references: [resources.id],
  }),
}));

export const issueResourceAssignmentsRelations = relations(issueResourceAssignments, ({ one }) => ({
  issue: one(issues, {
    fields: [issueResourceAssignments.issueId],
    references: [issues.id],
  }),
  resource: one(resources, {
    fields: [issueResourceAssignments.resourceId],
    references: [resources.id],
  }),
}));

export const riskResourceAssignmentsRelations = relations(riskResourceAssignments, ({ one }) => ({
  risk: one(risks, {
    fields: [riskResourceAssignments.riskId],
    references: [risks.id],
  }),
  resource: one(resources, {
    fields: [riskResourceAssignments.resourceId],
    references: [resources.id],
  }),
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
export const insertResourceSchema = createInsertSchema(resources).omit({ id: true, createdAt: true });
export const insertTaskResourceAssignmentSchema = createInsertSchema(taskResourceAssignments).omit({ id: true, createdAt: true });
export const insertIssueResourceAssignmentSchema = createInsertSchema(issueResourceAssignments).omit({ id: true, createdAt: true });
export const insertRiskResourceAssignmentSchema = createInsertSchema(riskResourceAssignments).omit({ id: true, createdAt: true });
export const insertCostItemSchema = createInsertSchema(costItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectIntakeSchema = createInsertSchema(projectIntakes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMppImportSchema = createInsertSchema(mppImports).omit({ id: true, createdAt: true, lastSyncedAt: true });
export const insertMppImportTaskSchema = createInsertSchema(mppImportTasks).omit({ id: true, createdAt: true });
export const insertChangeRequestSchema = createInsertSchema(changeRequests).omit({ id: true, createdAt: true });
export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({ id: true, createdAt: true, updatedAt: true });

export const insertProjectCommentSchema = createInsertSchema(projectComments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertIntakeWorkflowStepSchema = createInsertSchema(intakeWorkflowSteps).omit({ id: true, createdAt: true, updatedAt: true });

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

export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;

export type TaskResourceAssignment = typeof taskResourceAssignments.$inferSelect;
export type InsertTaskResourceAssignment = z.infer<typeof insertTaskResourceAssignmentSchema>;

export type IssueResourceAssignment = typeof issueResourceAssignments.$inferSelect;
export type InsertIssueResourceAssignment = z.infer<typeof insertIssueResourceAssignmentSchema>;

export type RiskResourceAssignment = typeof riskResourceAssignments.$inferSelect;
export type InsertRiskResourceAssignment = z.infer<typeof insertRiskResourceAssignmentSchema>;

export type CostItem = typeof costItems.$inferSelect;
export type InsertCostItem = z.infer<typeof insertCostItemSchema>;

export type ProjectIntake = typeof projectIntakes.$inferSelect;
export type InsertProjectIntake = z.infer<typeof insertProjectIntakeSchema>;

export type MppImport = typeof mppImports.$inferSelect;
export type InsertMppImport = z.infer<typeof insertMppImportSchema>;

export type MppImportTask = typeof mppImportTasks.$inferSelect;
export type InsertMppImportTask = z.infer<typeof insertMppImportTaskSchema>;

export type ChangeRequest = typeof changeRequests.$inferSelect;
export type InsertChangeRequest = z.infer<typeof insertChangeRequestSchema>;

export type ProjectDocument = typeof projectDocuments.$inferSelect;
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;

export type ProjectComment = typeof projectComments.$inferSelect;
export type InsertProjectComment = z.infer<typeof insertProjectCommentSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type IntakeWorkflowStep = typeof intakeWorkflowSteps.$inferSelect;
export type InsertIntakeWorkflowStep = z.infer<typeof insertIntakeWorkflowStepSchema>;

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

export type CreateResourceRequest = InsertResource;
export type UpdateResourceRequest = Partial<InsertResource>;

export type CreateCostItemRequest = InsertCostItem;
export type UpdateCostItemRequest = Partial<InsertCostItem>;

export type CreateProjectIntakeRequest = InsertProjectIntake;
export type UpdateProjectIntakeRequest = Partial<InsertProjectIntake>;

export type CreateChangeRequestRequest = InsertChangeRequest;
export type UpdateChangeRequestRequest = Partial<InsertChangeRequest>;

export type CreateProjectDocumentRequest = InsertProjectDocument;
export type UpdateProjectDocumentRequest = Partial<InsertProjectDocument>;

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
