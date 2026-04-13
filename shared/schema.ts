import { pgTable, text, serial, integer, boolean, timestamp, date, varchar, jsonb, uniqueIndex, index, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";

const numeric = customType<{ data: number; driverData: string }>({
  dataType() { return 'numeric'; },
  fromDriver(value: string): number { return (value == null) ? 0 : Number(value); },
  toDriver(value: number): string { return (value == null) ? '0' : String(value); },
});
import { users } from "./models/auth";

export * from "./models/auth";
export * from "./models/chat";
export * from "./models/billing";

// === SIDEBAR STRUCTURE TYPES ===

export const sidebarItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("module"),
    key: z.string(),
    hidden: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("customLink"),
    id: z.string(),
    label: z.string(),
    url: z.string().url(),
    icon: z.string().optional(),
    openInNewTab: z.boolean().default(true),
    openMode: z.enum(["newTab", "iframe"]).default("newTab"),
    hidden: z.boolean().optional(),
  }),
]);

export const sidebarGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean().optional(),
  hidden: z.boolean().optional(),
  collapsedByDefault: z.boolean().optional(),
  items: z.array(sidebarItemSchema),
});

export const sidebarStructureSchema = z.array(sidebarGroupSchema);

export type SidebarItem = z.infer<typeof sidebarItemSchema>;
export type SidebarGroup = z.infer<typeof sidebarGroupSchema>;
export type SidebarStructure = z.infer<typeof sidebarStructureSchema>;

export const riskAssessmentConfigSchema = z.object({
  model: z.enum(["gpt-4o", "gpt-4o-mini"]).default("gpt-4o"),
  temperature: z.number().min(0).max(1).default(0.3),
  maxTokens: z.number().min(500).max(8000).default(3000),
  cacheDays: z.number().min(1).max(30).default(5),
  thresholds: z.object({
    lowMax: z.number().min(1).max(99).default(25),
    mediumMax: z.number().min(1).max(99).default(50),
    highMax: z.number().min(1).max(99).default(75),
  }).default({}),
  customInstructions: z.string().max(2000).default(""),
  categories: z.array(z.string()).default(["Schedule Risk", "Budget Risk", "Resource Risk", "Technical Risk", "Scope Risk"]),
  useCustomLLM: z.boolean().default(false),
  customEndpoint: z.string().max(500).default(""),
  customApiKey: z.string().max(500).default(""),
  customModel: z.string().max(200).default(""),
});

export type RiskAssessmentConfig = z.infer<typeof riskAssessmentConfigSchema>;

export const schedulingDefaultsSchema = z.object({
  defaultDependencyType: z.enum(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish']).default('finish-to-start'),
  defaultLagDays: z.number().int().min(-30).max(90).default(0),
  enforceDefaults: z.boolean().default(false),
});

export type SchedulingDefaults = z.infer<typeof schedulingDefaultsSchema>;

export const DEFAULT_SCHEDULING_DEFAULTS: SchedulingDefaults = {
  defaultDependencyType: 'finish-to-start',
  defaultLagDays: 0,
  enforceDefaults: false,
};

export const DEFAULT_RISK_ASSESSMENT_CONFIG: RiskAssessmentConfig = {
  model: "gpt-4o",
  temperature: 0.3,
  maxTokens: 3000,
  cacheDays: 5,
  thresholds: { lowMax: 25, mediumMax: 50, highMax: 75 },
  customInstructions: "",
  categories: ["Schedule Risk", "Budget Risk", "Resource Risk", "Technical Risk", "Scope Risk"],
  useCustomLLM: false,
  customEndpoint: "",
  customApiKey: "",
  customModel: "",
};

// === TABLE DEFINITIONS ===

// Users (Imported from ./models/auth)

// Organizations (Tenants)
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  description: text("description"),
  logoUrl: text("logo_url"), // Custom company logo URL
  ownerId: varchar("owner_id").references(() => users.id), // Organization creator
  createdAt: timestamp("created_at").defaultNow(),
  hiddenModules: text("hidden_modules").array(), // Legacy: Array of module keys to hide from sidebar
  moduleOrder: text("module_order").array(), // Legacy: Array of module keys defining sidebar order
  hiddenGroups: text("hidden_groups").array(), // Legacy: Array of group keys to hide from sidebar
  sidebarStructure: jsonb("sidebar_structure").$type<SidebarStructure>(), // New: Full sidebar config
  dashboardTabOrder: text("dashboard_tab_order").array(), // Array of tab IDs defining dashboard report order
  dashboardHiddenTabs: text("dashboard_hidden_tabs").array(), // Array of tab IDs hidden in overflow menu
  billingHidden: boolean("billing_hidden").default(false),
  riskAssessmentConfig: jsonb("risk_assessment_config").$type<RiskAssessmentConfig>(),
  schedulingDefaults: jsonb("scheduling_defaults").$type<SchedulingDefaults>(),
  timezone: text("timezone").default("UTC"),
  deactivatedAt: timestamp("deactivated_at"), // Soft delete timestamp
  deactivatedBy: varchar("deactivated_by").references(() => users.id), // Who deactivated
});

// Organization Members (Join table for users <-> organizations)
export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"), // 'org_admin', 'member', 'viewer'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueOrgUser: uniqueIndex("unique_org_user").on(table.organizationId, table.userId),
}));

// Organization Invites (Pending invitations by email)
export const organizationInvites = pgTable("organization_invites", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"), // 'org_admin', 'member', 'viewer'
  status: text("status").notNull().default("pending"), // 'pending', 'accepted', 'cancelled', 'expired'
  invitedBy: varchar("invited_by").references(() => users.id),
  token: text("token").unique(), // Magic link token for accepting invite
  expiresAt: timestamp("expires_at"), // When the invite expires
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
}, (table) => ({
  uniquePendingInvite: uniqueIndex("unique_pending_invite").on(table.organizationId, table.email),
}));

// Organization Access Requests (Users requesting admin access)
export const organizationAccessRequests = pgTable("organization_access_requests", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'rejected'
  requestedRole: text("requested_role").notNull().default("org_admin"), // Role being requested
  message: text("message"), // Optional message from requester
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueAccessRequest: uniqueIndex("unique_access_request").on(table.organizationId, table.userId),
}));

// External Shares - Cross-organization object sharing
// When a user from OrgA assigns a resource from OrgB, the object is "shared" externally
export const externalShares = pgTable("external_shares", {
  id: serial("id").primaryKey(),
  objectType: text("object_type").notNull(), // 'project', 'task', 'risk', 'issue', 'portfolio'
  objectId: integer("object_id").notNull(), // ID of the shared object
  sourceOrganizationId: integer("source_organization_id").references(() => organizations.id).notNull(), // Org that owns the object
  sharedWithUserId: varchar("shared_with_user_id").references(() => users.id).notNull(), // User who has access
  sharedWithResourceId: integer("shared_with_resource_id").references(() => resources.id), // Resource record in source org
  accessRole: text("access_role").notNull().default("viewer"), // 'viewer', 'assignee', 'manager'
  sharedBy: varchar("shared_by").references(() => users.id), // Who shared it
  sharedAt: timestamp("shared_at").defaultNow(),
  revokedAt: timestamp("revoked_at"), // When access was revoked (soft delete)
}, (table) => [
  uniqueIndex("external_shares_obj_user_idx").on(table.objectType, table.objectId, table.sharedWithUserId),
]);

// Portfolios - High level grouping of projects
export const portfolios = pgTable("portfolios", {
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  strategy: text("strategy"), // Strategic alignment description
  managerId: varchar("manager_id").references(() => users.id), // Portfolio Manager
  businessOwnerId: varchar("business_owner_id").references(() => users.id), // Business Owner/Executive Sponsor
  strategicObjective: text("strategic_objective"), // Key business objective this portfolio supports
  budgetAllocated: numeric("budget_allocated"), // Total budget allocated to portfolio
  budgetSpent: numeric("budget_spent"), // Total budget spent across projects
  targetStartDate: date("target_start_date"), // Portfolio timeline start
  targetEndDate: date("target_end_date"), // Portfolio timeline end
  riskTolerance: text("risk_tolerance"), // Low, Medium, High - acceptable risk level
  performanceMetrics: text("performance_metrics"), // KPIs for portfolio success
  status: text("status").default("Active"), // Active, On Hold, Closed, Archived
  healthScore: text("health_score").default("Green"), // Green, Yellow, Red - overall health
  department: text("department"), // Primary department/business unit
  notes: text("notes"), // Additional notes
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id), // Who created the portfolio
  teamMemberResourceIds: integer("team_member_resource_ids").array(), // Resource IDs with team member access
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
  deletedBy: varchar("deleted_by").references(() => users.id), // Who deleted it
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
  isCustom: boolean("is_custom").default(false), // Custom portfolios can include projects from any portfolio
});

// Portfolio Key Dates - important dates tracked at the portfolio level
export const portfolioKeyDates = pgTable("portfolio_key_dates", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  keyDateType: text("key_date_type").default("Deadline"),
  date: date("date").notNull(),
  status: text("status").default("Upcoming"),
  completed: boolean("completed").default(false),
  notes: text("notes"),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("portfolio_key_dates_portfolio_id_idx").on(table.portfolioId),
  index("portfolio_key_dates_organization_id_idx").on(table.organizationId),
]);

// Custom Portfolio Projects - junction table for custom portfolios
export const customPortfolioProjects = pgTable("custom_portfolio_projects", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  addedAt: timestamp("added_at").defaultNow(),
  addedBy: varchar("added_by").references(() => users.id),
}, (table) => [
  uniqueIndex("custom_portfolio_projects_unique").on(table.portfolioId, table.projectId),
]);

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  name: text("name").notNull(),
  projectCode: text("project_code"), // Unique project identifier (e.g., "PRJ-2025-001")
  description: text("description"),
  status: text("status").notNull().default("Initiation"), // Initiation, Planning, Execution, Monitoring, Closing
  priority: text("priority").notNull().default("Medium"), // Low, Medium, High, Critical
  projectType: text("project_type"), // Internal, External, Strategic, Operational, Regulatory
  methodology: text("methodology"), // Waterfall, Agile, Hybrid, Scrum, Kanban
  startDate: date("start_date"),
  endDate: date("end_date"),
  baselineStartDate: date("baseline_start_date"), // Original planned start
  baselineEndDate: date("baseline_end_date"), // Original planned end
  actualStartDate: date("actual_start_date"), // When work actually started
  actualEndDate: date("actual_end_date"), // When work actually finished
  budget: numeric("budget").notNull().default("0"),
  actualCost: numeric("actual_cost").default("0"), // Actual spend to date
  forecastCost: numeric("forecast_cost"), // Projected final cost
  contractTotal: numeric("contract_total").default("0"), // Total contract value for invoicing
  managerId: varchar("manager_id").references(() => users.id), // Project Manager (user ID)
  managerResourceId: integer("manager_resource_id").references(() => resources.id), // Project Manager (resource ID for display)
  businessSponsorId: varchar("business_sponsor_id").references(() => users.id), // Executive Sponsor
  sponsorResourceId: integer("sponsor_resource_id").references(() => resources.id),
  businessOwnerId: varchar("business_owner_id").references(() => users.id), // Product/Business Owner
  ownerResourceId: integer("owner_resource_id").references(() => resources.id),
  technicalLeadId: varchar("technical_lead_id").references(() => users.id), // Technical Lead
  technicalLeadResourceId: integer("technical_lead_resource_id").references(() => resources.id),
  completionPercentage: integer("completion_percentage").default(0),
  completionOverridden: boolean("completion_overridden").default(false), // True if user manually set completion percentage
  health: text("health").default("Green"), // Green, Yellow, Red
  healthReason: text("health_reason"), // Reason for health status change
  healthReasonUpdatedAt: timestamp("health_reason_updated_at"), // When health reason was last updated
  scheduleVariance: integer("schedule_variance"), // Days ahead/behind schedule (negative = behind)
  costVariance: numeric("cost_variance"), // Budget variance (negative = over budget)
  scope: text("scope"), // Project scope statement
  objectives: text("objectives"), // Key project objectives
  successCriteria: text("success_criteria"), // How success will be measured
  constraints: text("constraints"), // Known constraints
  assumptions: text("assumptions"), // Project assumptions
  dependencies: text("dependencies"), // External dependencies
  department: text("department"), // Primary department
  category: text("category"), // Project category (IT, Marketing, Operations, etc.)
  businessValue: text("business_value"), // Expected business value/ROI
  riskLevel: text("risk_level"), // Low, Medium, High - overall risk assessment
  source: text("source").default("manual"), // "manual" = created in app, "imported" = from MPP/external file, "planner" = from Microsoft Planner
  plannerPlanId: text("planner_plan_id"), // Microsoft Planner plan ID for syncing
  dataverseOrgId: text("dataverse_org_id"), // Dataverse organization ID for Planner Premium URL construction
  dataverseTenantId: text("dataverse_tenant_id"), // Microsoft tenant ID for Planner Premium URL construction
  sourceFileName: text("source_file_name"), // Original filename of imported file (e.g., "project.mpp")
  sourceFileUrl: text("source_file_url"), // URL to the original imported file (in object storage)
  notes: text("notes"), // Additional notes
  billableStatus: text("billable_status").default("N/A"), // Billable status: N/A, On Track, Waiting for Approval, etc.
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id), // Who created the project
  updatedAt: timestamp("updated_at").defaultNow(), // Last modification date
  updatedBy: varchar("updated_by").references(() => users.id), // Who last modified the project
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
  isInternal: boolean("is_internal").default(false),
  timesheetBlocked: boolean("timesheet_blocked").default(false),
}, (table) => [
  index("projects_org_id_idx").on(table.organizationId),
  index("projects_portfolio_id_idx").on(table.portfolioId),
  index("projects_org_portfolio_deleted_idx").on(table.organizationId, table.portfolioId, table.deletedAt),
  index("projects_manager_id_idx").on(table.managerId),
  index("projects_deleted_at_idx").on(table.deletedAt),
]);

// Billable Status Comments (Comment log for billable status field)
export const billableStatusComments = pgTable("billable_status_comments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  billableStatus: text("billable_status"), // The billable status value at time of comment
  comment: text("comment").notNull(),
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"), // User's display name at time of comment
  createdAt: timestamp("created_at").defaultNow(),
});

// Health Status History (Track all health status changes with comments)
export const healthStatusHistory = pgTable("health_status_history", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  previousHealth: text("previous_health"), // Previous health status (Green, Yellow, Red, or null if first entry)
  newHealth: text("new_health").notNull(), // New health status (Green, Yellow, Red)
  comment: text("comment"), // Optional comment/reason for the change
  changedBy: varchar("changed_by").references(() => users.id), // User who made the change
  changedByName: text("changed_by_name"), // User's display name at time of change
  createdAt: timestamp("created_at").defaultNow(),
});

// Note: Risks are now consolidated into the issues table with itemType = "risk"
// The 'risks' table is deprecated - use issues with itemType filter instead

// Portfolio Key Dates (formerly Milestones)
/** @deprecated Use tasks table with isMilestone=true instead. This table is kept for backward compatibility but is no longer read from or written to. All portfolio key date data has been migrated to the tasks table. */
export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  milestoneNumber: text("milestone_number"), // Auto-generated (e.g., "MS-001")
  title: text("title").notNull(),
  description: text("description"),
  milestoneType: text("milestone_type"), // Governance, Deliverable, Phase Gate, External, Payment
  dueDate: date("due_date").notNull(),
  baselineDueDate: date("baseline_due_date"), // Original planned due date
  actualCompletionDate: date("actual_completion_date"),
  startDate: date("start_date"),
  completed: boolean("completed").default(false),
  status: text("status").default("Backlog"), // Backlog, To Do, In Progress, Done, Delayed
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  ownerId: varchar("owner_id").references(() => users.id), // Milestone owner
  assignee: text("assignee"),
  deliverables: text("deliverables"), // Expected deliverables for this milestone
  acceptanceCriteria: text("acceptance_criteria"), // Criteria for completion
  dependencies: text("dependencies"), // Dependencies on other milestones/tasks
  successMetrics: text("success_metrics"), // How success will be measured
  stakeholders: text("stakeholders"), // Key stakeholders
  phase: text("phase"), // Project phase this milestone belongs to
  notes: text("notes"),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
}, (table) => [
  index("milestones_project_id_idx").on(table.projectId),
  index("milestones_organization_id_idx").on(table.organizationId),
  index("milestones_owner_id_idx").on(table.ownerId),
]);

// Issues (consolidated - includes both issues and risks via itemType)
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  itemType: text("item_type").default("issue").notNull(), // "issue" or "risk" - distinguishes the type
  issueNumber: text("issue_number"), // Auto-generated (e.g., "ISS-001" or "RISK-001")
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"), // Technical, Process, Resource, External, Scope (issues) or Technical, Schedule, Resource, External, Organizational, Financial (risks)
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  severity: text("severity"), // Minor, Moderate, Major, Critical, Blocker
  status: text("status").default("Open"), // Open, In Progress, Pending, Resolved, Closed, Escalated (issues) or Identified, Open, In Mitigation, Mitigated, Closed, Accepted (risks)
  type: text("type").default("Bug"), // Bug, Enhancement, Task, Question, Defect, Support (for issues only)
  escalationLevel: text("escalation_level"), // None, Team Lead, Manager, Director, Executive
  assignee: text("assignee"),
  assigneeId: varchar("assignee_id").references(() => users.id), // Issue assignee
  reporterId: varchar("reporter_id").references(() => users.id), // Who reported the issue
  reportedBy: text("reported_by"), // Name of reporter (for external reports)
  reportedDate: date("reported_date"),
  targetResolutionDate: date("target_resolution_date"),
  actualResolutionDate: date("actual_resolution_date"),
  resolution: text("resolution"), // How the issue was resolved
  rootCause: text("root_cause"), // Root cause analysis
  impactDescription: text("impact_description"), // Impact on project
  impactCost: numeric("impact_cost"), // Cost impact
  impactSchedule: text("impact_schedule"), // Schedule impact
  relatedTaskId: integer("related_task_id").references(() => tasks.id), // Related task
  stepsToReproduce: text("steps_to_reproduce"), // For bugs
  environment: text("environment"), // Environment where issue occurred
  labels: text("labels"), // Comma-separated labels
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false), // True if created by demo data generator
  // Risk-specific fields (only used when itemType = "risk")
  probability: text("probability"), // Very Low, Low, Medium, High, Very High
  impact: text("impact"), // Very Low, Low, Medium, High, Very High
  riskScore: integer("risk_score"), // Calculated score (probability x impact)
  responseStrategy: text("response_strategy"), // Avoid, Transfer, Mitigate, Accept
  mitigationPlan: text("mitigation_plan"),
  contingencyPlan: text("contingency_plan"), // Backup plan if risk occurs
  triggerEvents: text("trigger_events"), // What triggers this risk
  residualRisk: text("residual_risk"), // Remaining risk after mitigation
  ownerId: varchar("owner_id").references(() => users.id), // Risk owner
  reviewerId: varchar("reviewer_id").references(() => users.id), // Risk reviewer
  identifiedDate: date("identified_date"), // When risk was identified
  targetResolutionDateRisk: date("target_resolution_date_risk"),
  actualResolutionDateRisk: date("actual_resolution_date_risk"),
  costExposure: numeric("cost_exposure"), // Expected monetary value of risk (probability × impact cost)
  dueDate: date("due_date"), // Risk due date for time-based placement on radar
  proximity: text("proximity"), // Imminent, Near-term, Mid-term, Long-term
  // Portfolio escalation fields
  escalatedToPortfolio: boolean("escalated_to_portfolio").default(false), // Whether escalated to portfolio level
  escalatedAt: timestamp("escalated_at"), // When it was escalated
  escalatedBy: varchar("escalated_by").references(() => users.id), // Who escalated it
}, (table) => [
  index("issues_project_id_idx").on(table.projectId),
  index("issues_item_type_idx").on(table.itemType),
  index("issues_project_item_type_idx").on(table.projectId, table.itemType),
  index("issues_assignee_id_idx").on(table.assigneeId),
  index("issues_owner_id_idx").on(table.ownerId),
  index("issues_status_idx").on(table.status),
]);

// Tasks (for Gantt Chart)
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  taskIndex: integer("task_index"), // Sequential index for ordering tasks (1, 2, 3... per project)
  taskNumber: text("task_number"), // Auto-generated (e.g., "TASK-001")
  wbs: text("wbs"), // Work Breakdown Structure code (e.g., "1.2.3") - MS Project style
  name: text("name").notNull(),
  description: text("description"),
  taskType: text("task_type"), // Work, Milestone, Summary, Fixed Duration, Fixed Units, Ongoing
  priority: text("priority").default("Medium"), // Low, Medium, High, Critical
  startDate: date("start_date"),
  endDate: date("end_date"),
  baselineStartDate: date("baseline_start_date"), // Original planned start
  baselineEndDate: date("baseline_end_date"), // Original planned end
  actualStartDate: date("actual_start_date"), // When work actually started
  actualEndDate: date("actual_end_date"), // When work actually finished
  durationDays: numeric("duration_days"), // Duration in days (supports fractional, e.g. 0.5 = 4h)
  estimatedHours: numeric("estimated_hours"), // Estimated effort in hours
  actualHours: numeric("actual_hours"), // Actual hours worked
  remainingHours: numeric("remaining_hours"), // Remaining effort
  progress: integer("progress").default(0), // 0-100 percentage
  status: text("status").default("Not Started"), // Not Started, In Progress, On Hold, Completed, Cancelled
  constraintType: text("constraint_type"), // ASAP, ALAP, Start No Earlier Than, Finish No Later Than, Must Start On, Must Finish On
  constraintDate: date("constraint_date"), // Date for constraint if applicable
  assignee: text("assignee"),
  ownerId: varchar("owner_id").references(() => users.id), // Task owner/lead
  outlineLevel: integer("outline_level"), // Hierarchy level (1, 2, 3...)
  parentId: integer("parent_id"), // Self-ref FK managed in migrate.ts with NOT VALID for safe production deploys
  isMilestone: boolean("is_milestone").default(false), // Show task on project timeline
  isSummary: boolean("is_summary").default(false), // Is a summary/parent task
  isCritical: boolean("is_critical").default(false), // On critical path
  isOngoing: boolean("is_ongoing").default(false), // Ongoing/operational task without scheduled dates
  schedulingMode: text("scheduling_mode").default("auto"), // 'auto' = auto-scheduled, 'manual' = manually scheduled (dates optional)
  cost: numeric("cost"), // Budget for this task
  actualCost: numeric("actual_cost"), // Actual cost incurred
  phase: text("phase"), // Project phase this task belongs to
  category: text("category"), // Task category
  labels: text("labels"), // Comma-separated labels
  notes: text("notes"),
  notesUpdatedAt: timestamp("notes_updated_at"),
  notesUpdatedBy: varchar("notes_updated_by").references(() => users.id),
  notesUpdatedByName: text("notes_updated_by_name"),
  timesheetBlocked: boolean("timesheet_blocked").default(false),
  externalId: text("external_id"),
  completionOverridden: boolean("completion_overridden").default(false),
  milestoneNumber: text("milestone_number"),
  milestoneType: text("milestone_type"),
  deliverables: text("deliverables"),
  acceptanceCriteria: text("acceptance_criteria"),
  successMetrics: text("success_metrics"),
  stakeholders: text("stakeholders"),
  updatedAt: timestamp("updated_at").defaultNow(),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("tasks_project_id_idx").on(table.projectId),
  index("tasks_parent_id_idx").on(table.parentId),
  index("tasks_deleted_at_idx").on(table.deletedAt),
  index("tasks_start_date_idx").on(table.startDate),
  index("tasks_end_date_idx").on(table.endDate),
  index("tasks_status_idx").on(table.status),
  index("tasks_created_at_idx").on(table.createdAt),
  index("tasks_project_deleted_task_idx").on(table.projectId, table.deletedAt, table.taskIndex),
  index("tasks_owner_id_idx").on(table.ownerId),
  index("tasks_project_external_id_idx").on(table.projectId, table.externalId),
]);

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
}, (table) => [
  index("task_change_logs_task_id_idx").on(table.taskId),
]);

export const taskNotesHistory = pgTable("task_notes_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  changedBy: varchar("changed_by").references(() => users.id),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  previousNotes: text("previous_notes"),
  newNotes: text("new_notes"),
}, (table) => [
  index("task_notes_history_task_id_idx").on(table.taskId),
]);

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
}, (table) => [
  index("project_change_logs_project_id_idx").on(table.projectId),
]);

// Note: Risk Change Logs are now consolidated into Issue Change Logs
// The 'risk_change_logs' table is deprecated - use issue_change_logs instead

// Issue Change Logs (Audit Trail) - also handles risks since they're now in issues table
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
}, (table) => [
  index("issue_change_logs_issue_id_idx").on(table.issueId),
]);

// Task Dependencies
export const taskDependencies = pgTable("task_dependencies", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  dependsOnTaskId: integer("depends_on_task_id").references(() => tasks.id).notNull(),
  dependencyType: text("dependency_type").default("finish-to-start"), // finish-to-start, start-to-start, finish-to-finish, start-to-finish
  lagDays: integer("lag_days").default(0), // Lag or lead time in days (negative for lead)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("task_dependencies_task_id_idx").on(table.taskId),
  index("task_dependencies_depends_on_idx").on(table.dependsOnTaskId),
]);

// Cross-Project References (links between tasks in different projects, or between projects)
export const crossProjectReferences = pgTable("cross_project_references", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  referenceType: text("reference_type").notNull(), // 'task_to_task' | 'project_to_project'
  sourceType: text("source_type").notNull(), // 'task' | 'project'
  sourceId: integer("source_id").notNull(),
  sourceProjectId: integer("source_project_id").references(() => projects.id).notNull(),
  targetType: text("target_type").notNull(), // 'task' | 'project'
  targetId: integer("target_id").notNull(),
  targetProjectId: integer("target_project_id").references(() => projects.id).notNull(),
  relationshipType: text("relationship_type").notNull(), // 'blocks', 'is_blocked_by', 'relates_to', 'duplicates', 'depends_on', 'is_dependency_of'
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("cross_project_refs_org_idx").on(table.organizationId),
  index("cross_project_refs_source_idx").on(table.sourceType, table.sourceId),
  index("cross_project_refs_target_idx").on(table.targetType, table.targetId),
]);

export const insertCrossProjectReferenceSchema = createInsertSchema(crossProjectReferences).omit({
  id: true,
  createdAt: true,
});
export type CrossProjectReference = typeof crossProjectReferences.$inferSelect;
export type InsertCrossProjectReference = z.infer<typeof insertCrossProjectReferenceSchema>;

// Resources (Global list of team members/resources)
export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id), // Links to organization member user (for auto-synced resources)
  resourceCode: text("resource_code"), // Unique identifier (e.g., "EMP-001")
  resourceType: text("resource_type"), // Employee, Contractor, Vendor, Equipment, Material
  displayName: text("display_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  title: text("title"), // Job title/role
  department: text("department"),
  costCenter: text("cost_center"), // Cost center for billing
  location: text("location"), // Office location
  timezone: text("timezone"), // Resource timezone
  managerId: varchar("manager_id").references(() => users.id), // Direct manager
  skills: text("skills"), // Comma-separated skills
  certifications: text("certifications"), // Comma-separated certifications
  experienceLevel: text("experience_level"), // Junior, Mid-Level, Senior, Lead, Principal
  hourlyRate: numeric("hourly_rate"), // Standard hourly rate
  overtimeRate: numeric("overtime_rate"), // Overtime hourly rate
  costRate: numeric("cost_rate"), // Internal cost rate
  weeklyCapacity: numeric("weekly_capacity").default("40"), // Hours per week available
  availability: integer("availability").default(100), // Percentage availability (0-100)
  startDate: date("start_date"), // When resource started
  endDate: date("end_date"), // When resource contract ends (if applicable)
  isActive: boolean("is_active").default(true),
  isApprover: boolean("is_approver").default(false), // Can approve timesheets
  isIntakeApprover: boolean("is_intake_approver").default(false), // Can approve project intakes
  isBillable: boolean("is_billable").default(true), // Can be billed to clients
  timesheetHidden: boolean("timesheet_hidden").default(false), // Hide from all timesheet dashboards
  photoUrl: text("photo_url"), // Profile photo URL
  notes: text("notes"),
  invitedProjectIds: integer("invited_project_ids").array(), // Projects this resource was invited to (for team_member visibility)
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("resources_org_id_idx").on(table.organizationId),
  index("resources_user_id_idx").on(table.userId),
  index("resources_org_user_idx").on(table.organizationId, table.userId),
]);

// Task Resource Assignments (Join table)
export const taskResourceAssignments = pgTable("task_resource_assignments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  allocationPercentage: integer("allocation_percentage").default(100), // 0-100%
  role: text("role"), // Role in this specific task (e.g., "Lead", "Support")
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tra_task_id_idx").on(table.taskId),
  index("tra_resource_id_idx").on(table.resourceId),
]);

// Issue Resource Assignments (Join table) - also handles risks since they're now in issues table
export const issueResourceAssignments = pgTable("issue_resource_assignments", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  role: text("role"), // Role (e.g., "Assignee", "Reviewer", "Owner", "Mitigator")
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ira_issue_id_idx").on(table.issueId),
  index("ira_resource_id_idx").on(table.resourceId),
]);

// Note: Risk Resource Assignments are now consolidated into Issue Resource Assignments
// The 'risk_resource_assignments' table is deprecated - use issue_resource_assignments instead

// Timesheet Entries (Time logging against tasks)
export const timesheetEntries = pgTable("timesheet_entries", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(), // The user logging time
  resourceId: integer("resource_id").references(() => resources.id).notNull(), // The resource record
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  entryDate: date("entry_date").notNull(), // The date for this time entry
  hours: numeric("hours").notNull(), // Hours worked (supports decimals like 0.25, 0.5)
  notes: text("notes"), // Optional notes for this entry
  status: text("status").default("Draft"), // Draft, Submitted, Approved, Rejected
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  proxyUserId: varchar("proxy_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("te_task_id_idx").on(table.taskId),
  index("te_resource_id_idx").on(table.resourceId),
  index("te_project_id_idx").on(table.projectId),
  index("te_organization_id_idx").on(table.organizationId),
  index("te_user_org_date_idx").on(table.userId, table.organizationId, table.entryDate),
  index("te_resource_task_date_idx").on(table.resourceId, table.taskId, table.entryDate),
]);

// Time Categories (for non-project time like vacation, PTO, etc.)
export const timeCategories = pgTable("time_categories", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // e.g., "Vacation", "PTO", "Sick Leave"
  code: text("code"), // Short code like "VAC", "PTO", "SICK"
  description: text("description"),
  color: text("color").default("#6366f1"), // Color for UI display
  isActive: boolean("is_active").default(true),
  isPaidTime: boolean("is_paid_time").default(true), // Whether this counts as paid time
  requiresApproval: boolean("requires_approval").default(true),
  maxHoursPerYear: numeric("max_hours_per_year"),
  isBillable: boolean("is_billable").default(false),
  displayOrder: integer("display_order").default(0),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertTimeCategorySchema = createInsertSchema(timeCategories).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});
export type InsertTimeCategory = z.infer<typeof insertTimeCategorySchema>;
export type TimeCategory = typeof timeCategories.$inferSelect;

// Non-Project Time Entries (for vacation, PTO, etc.)
export const nonProjectTimeEntries = pgTable("non_project_time_entries", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  categoryId: integer("category_id").references(() => timeCategories.id).notNull(),
  entryDate: date("entry_date").notNull(),
  hours: numeric("hours").notNull(),
  description: text("description"),
  notes: text("notes"),
  isBillable: boolean("is_billable").default(false),
  status: text("status").default("Draft"),
  submittedAt: timestamp("submitted_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
});

export const insertNonProjectTimeEntrySchema = createInsertSchema(nonProjectTimeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  approvedAt: true,
});
export type InsertNonProjectTimeEntry = z.infer<typeof insertNonProjectTimeEntrySchema>;
export type NonProjectTimeEntry = typeof nonProjectTimeEntries.$inferSelect;

// Timesheet Periods (for closing/locking time periods)
export const timesheetPeriods = pgTable("timesheet_periods", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // e.g., "January 2024", "Week 1 - 2024"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").default("open").notNull(), // open, closed
  closedBy: varchar("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
  reopenedBy: varchar("reopened_by").references(() => users.id),
  reopenedAt: timestamp("reopened_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertTimesheetPeriodSchema = createInsertSchema(timesheetPeriods).omit({
  id: true,
  createdAt: true,
  closedAt: true,
  reopenedAt: true,
});
export type InsertTimesheetPeriod = z.infer<typeof insertTimesheetPeriodSchema>;
export type TimesheetPeriod = typeof timesheetPeriods.$inferSelect;

export const timesheetSettings = pgTable("timesheet_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  minWeeklyHours: numeric("min_weekly_hours").default("0"),
  maxWeeklyHours: numeric("max_weekly_hours").default("50"),
  overtimeThreshold: numeric("overtime_threshold").default("40"),
  gracePeriodDays: integer("grace_period_days").default(0),
  mandatoryNotes: boolean("mandatory_notes").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ts_settings_org_idx").on(table.organizationId),
]);

export const insertTimesheetSettingsSchema = createInsertSchema(timesheetSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimesheetSettings = z.infer<typeof insertTimesheetSettingsSchema>;
export type TimesheetSettings = typeof timesheetSettings.$inferSelect;

export const timesheetAuditLog = pgTable("timesheet_audit_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  entryId: integer("entry_id"),
  action: text("action").notNull(),
  actorId: varchar("actor_id").references(() => users.id).notNull(),
  targetUserId: varchar("target_user_id").references(() => users.id),
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ts_audit_entry_idx").on(table.entryId),
  index("ts_audit_org_idx").on(table.organizationId),
  index("ts_audit_actor_idx").on(table.actorId),
  index("ts_audit_created_idx").on(table.createdAt),
]);

export const insertTimesheetAuditLogSchema = createInsertSchema(timesheetAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertTimesheetAuditLog = z.infer<typeof insertTimesheetAuditLogSchema>;
export type TimesheetAuditLog = typeof timesheetAuditLog.$inferSelect;

export const approvalDelegations = pgTable("approval_delegations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  delegatorId: varchar("delegator_id").references(() => users.id).notNull(),
  delegateId: varchar("delegate_id").references(() => users.id).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  index("ad_org_idx").on(table.organizationId),
  index("ad_delegator_idx").on(table.delegatorId),
  index("ad_delegate_idx").on(table.delegateId),
]);

export const insertApprovalDelegationSchema = createInsertSchema(approvalDelegations).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});
export type InsertApprovalDelegation = z.infer<typeof insertApprovalDelegationSchema>;
export type ApprovalDelegation = typeof approvalDelegations.$inferSelect;

export const rejectionTemplates = pgTable("rejection_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  text: text("text").notNull(),
  category: text("category").default("General"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("rt_org_idx").on(table.organizationId),
]);

export const insertRejectionTemplateSchema = createInsertSchema(rejectionTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRejectionTemplate = z.infer<typeof insertRejectionTemplateSchema>;
export type RejectionTemplate = typeof rejectionTemplates.$inferSelect;

export const timesheetComments = pgTable("timesheet_comments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  entryId: integer("entry_id").references(() => timesheetEntries.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  text: text("text").notNull(),
  commentType: text("comment_type").default("comment"),
  statusFrom: text("status_from"),
  statusTo: text("status_to"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tc_entry_idx").on(table.entryId),
  index("tc_org_idx").on(table.organizationId),
]);

export const insertTimesheetCommentSchema = createInsertSchema(timesheetComments).omit({
  id: true,
  createdAt: true,
});
export type InsertTimesheetComment = z.infer<typeof insertTimesheetCommentSchema>;
export type TimesheetComment = typeof timesheetComments.$inferSelect;

export const timesheetReminderSettings = pgTable("timesheet_reminder_settings", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  enabled: boolean("enabled").default(true),
  emailEnabled: boolean("email_enabled").default(true),
  notificationEnabled: boolean("notification_enabled").default(true),
  submissionReminderDays: jsonb("submission_reminder_days").$type<number[]>().default([4, 5, 8]),
  approvalReminderDays: integer("approval_reminder_days").default(2),
  escalationThresholdDays: integer("escalation_threshold_days").default(5),
  frequencyCap: integer("frequency_cap").default(3),
  digestEnabled: boolean("digest_enabled").default(true),
  digestDay: integer("digest_day").default(1),
  scheduledHour: integer("scheduled_hour").default(9),
  scheduledMinute: integer("scheduled_minute").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("trs_org_idx").on(table.organizationId),
]);

export const insertTimesheetReminderSettingsSchema = createInsertSchema(timesheetReminderSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimesheetReminderSettings = z.infer<typeof insertTimesheetReminderSettingsSchema>;
export type TimesheetReminderSettings = typeof timesheetReminderSettings.$inferSelect;

export const timesheetReminderLog = pgTable("timesheet_reminder_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  reminderType: text("reminder_type").notNull(),
  weekStart: date("week_start").notNull(),
  urgencyLevel: text("urgency_level").default("friendly"),
  emailSent: boolean("email_sent").default(false),
  notificationCreated: boolean("notification_created").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trl_org_idx").on(table.organizationId),
  index("trl_user_week_idx").on(table.userId, table.weekStart),
]);

export type TimesheetReminderLog = typeof timesheetReminderLog.$inferSelect;

export const timesheetReminderSnooze = pgTable("timesheet_reminder_snooze", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  weekStart: date("week_start").notNull(),
  snoozedUntil: timestamp("snoozed_until").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("trsnz_user_week_idx").on(table.userId, table.weekStart),
]);

export type TimesheetReminderSnooze = typeof timesheetReminderSnooze.$inferSelect;

export const timesheetEscalationLog = pgTable("timesheet_escalation_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  entryUserId: varchar("entry_user_id").references(() => users.id).notNull(),
  managerId: varchar("manager_id").references(() => users.id),
  escalatedToId: varchar("escalated_to_id").references(() => users.id),
  weekStart: date("week_start").notNull(),
  reason: text("reason"),
  emailSent: boolean("email_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("tel_org_idx").on(table.organizationId),
  index("tel_user_week_idx").on(table.entryUserId, table.weekStart),
]);

export type TimesheetEscalationLog = typeof timesheetEscalationLog.$inferSelect;

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
}, (table) => [
  index("project_documents_project_id_idx").on(table.projectId),
]);

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
}, (table) => [
  index("project_comments_project_id_idx").on(table.projectId),
]);

// Notification types:
// - mention: @mention in a comment
// - comment_reply: reply to user's comment
// - task_overdue: task past its end date
// - task_deadline_warning: task deadline approaching (3 days or less)
// - project_health_alert: project health changed to Red or at risk
// - portfolio_health_alert: portfolio has multiple red projects
// - task_assignment: user assigned to a task
// - risk_assignment: user assigned to a risk
// - issue_assignment: user assigned to an issue
// - project_assignment: user added to a project team
// - milestone_approaching: milestone deadline within 7 days
// - milestone_overdue: milestone past its target date
// - status_change: project/task status changed

// Notifications for @mentions and other events
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  taskId: integer("task_id").references(() => tasks.id),
  riskIssueId: integer("risk_issue_id"), // Polymorphic: can reference risks or issues
  milestoneId: integer("milestone_id").references(() => milestones.id),
  commentId: integer("comment_id").references(() => projectComments.id),
  fromUserId: varchar("from_user_id").references(() => users.id),
  fromUserName: text("from_user_name"),
  severity: text("severity").default("info"), // info, warning, critical
  actionUrl: text("action_url"), // deep link to the relevant item
  metadata: text("metadata"), // JSON string for additional context
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_organization_id_idx").on(table.organizationId),
  index("notifications_is_read_idx").on(table.isRead),
  index("notifications_created_at_idx").on(table.createdAt),
]);

// Status Report History (Weekly status reports archive)
export const statusReportHistory = pgTable("status_report_history", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  reportDate: date("report_date").notNull(), // The date the report covers
  weekNumber: integer("week_number"), // ISO week number for weekly tracking
  yearNumber: integer("year_number"), // Year for the week
  executiveSummary: text("executive_summary"),
  reportType: text("report_type").default("weekly"), // weekly, monthly, quarterly, adhoc
  recipientEmail: text("recipient_email"), // Who it was sent to
  sentAt: timestamp("sent_at"), // When the email was sent
  pdfFileUrl: text("pdf_file_url"), // URL to stored PDF in object storage
  pdfFileName: text("pdf_file_name"),
  // Snapshot data at time of report
  projectHealth: text("project_health"),
  projectStatus: text("project_status"),
  completionPercentage: integer("completion_percentage"),
  totalBudget: numeric("total_budget"),
  actualSpent: numeric("actual_spent"),
  forecastAmount: numeric("forecast_amount"),
  openRisksCount: integer("open_risks_count"),
  openIssuesCount: integer("open_issues_count"),
  completedMilestonesCount: integer("completed_milestones_count"),
  totalMilestonesCount: integer("total_milestones_count"),
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("status_report_history_project_id_idx").on(table.projectId),
]);

// Project Invoices for tracking billing
export const projectInvoices = pgTable("project_invoices", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  invoiceNumber: text("invoice_number"), // Invoice reference number
  title: text("title").notNull(), // Brief description
  description: text("description"), // Detailed description
  amount: numeric("amount").default("0"), // Invoice amount
  currency: text("currency").default("USD"),
  status: text("status").default("Draft"), // Draft, Sent, Paid, Overdue, Cancelled
  invoiceDate: date("invoice_date"), // Date of invoice
  dueDate: date("due_date"), // Payment due date
  paidDate: date("paid_date"), // Actual payment date
  vendorName: text("vendor_name"), // Vendor or client name
  vendorEmail: text("vendor_email"),
  // File attachment fields
  fileName: text("file_name"), // Original file name if uploaded
  fileUrl: text("file_url"), // URL/path to the document in object storage
  fileSize: integer("file_size"), // Size in bytes
  mimeType: text("mime_type"), // File MIME type
  // External integration fields (for Dynamics 365, etc.)
  source: text("source"), // Source system: 'manual', 'dynamics365', etc.
  externalId: text("external_id"), // ID in the source system
  externalUrl: text("external_url"), // Direct URL to the invoice in source system
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false),
}, (table) => [
  index("project_invoices_project_id_idx").on(table.projectId),
]);

// Invoice Notes (tracking notes with timestamps like billable status comments)
export const invoiceNotes = pgTable("invoice_notes", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => projectInvoices.id).notNull(),
  status: text("status"), // The invoice status at time of note
  note: text("note").notNull(),
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"), // User's display name at time of note
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
}, (table) => [
  index("project_financials_project_id_idx").on(table.projectId),
]);

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
}, (table) => [
  index("cost_items_project_id_idx").on(table.projectId),
]);

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
  pmoApproved: boolean("pmo_approved").default(false), // PM must approve before conversion to project
  pmoApprovedAt: timestamp("pmo_approved_at"),
  pmoApprovedBy: varchar("pmo_approved_by").references(() => users.id),
  
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
}, (table) => [
  index("project_intakes_org_id_idx").on(table.organizationId),
  index("project_intakes_portfolio_id_idx").on(table.portfolioId),
]);

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
  fileUrl: text("file_url"), // URL to the original uploaded file (in object storage)
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
  durationDays: numeric("duration_days"), // Duration in days (supports fractional)
  percentComplete: integer("percent_complete").default(0),
  outlineLevel: integer("outline_level").default(1), // Task hierarchy level
  parentTaskId: integer("parent_task_id"), // Parent task reference
  isSummary: boolean("is_summary").default(false), // Summary/parent task
  isMilestone: boolean("is_milestone").default(false),
  notes: text("notes"),
  workHours: numeric("work_hours"), // Work/effort in hours from MPP
  actualWorkHours: numeric("actual_work_hours"), // Actual work hours from MPP
  remainingWorkHours: numeric("remaining_work_hours"), // Remaining work hours from MPP
  predecessors: text("predecessors"), // JSON array of predecessor relationships [{predecessorTaskId, type, lagDays}]
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization-specific integration settings
// Tokens are encrypted at rest via server/lib/tokenEncryption.ts
export const organizationIntegrations = pgTable("organization_integrations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  integrationType: text("integration_type").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  connectionStatus: text("connection_status").default("disconnected"),
  additionalData: text("additional_data"),
  connectedBy: text("connected_by"),
  connectedAt: timestamp("connected_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
}, (table) => [
  uniqueIndex("org_integrations_org_type_idx").on(table.organizationId, table.integrationType),
]);

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
  milestones: many(milestones),
  issues: many(issues), // includes both issues and risks (via itemType field)
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

// Note: risksRelations removed - risks are now in issues table with itemType="risk"

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
  issueAssignments: many(issueResourceAssignments), // includes both issue and risk resource assignments
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

// Note: riskResourceAssignmentsRelations removed - risk assignments are now in issueResourceAssignments

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
export const insertOrganizationInviteSchema = createInsertSchema(organizationInvites).omit({ id: true, createdAt: true, acceptedAt: true });
export const insertOrganizationAccessRequestSchema = createInsertSchema(organizationAccessRequests).omit({ id: true, createdAt: true, reviewedAt: true });
export const insertExternalShareSchema = createInsertSchema(externalShares).omit({ id: true, sharedAt: true });
export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Portfolio name is required"),
});
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true, updatedBy: true, createdBy: true });
// Risk schema is now an alias for Issue schema with itemType="risk"
// Extend to handle date strings for escalatedAt field
const baseRiskSchema = createInsertSchema(issues).omit({ id: true, createdAt: true });
export const insertRiskSchema = baseRiskSchema.extend({
  escalatedAt: z.union([z.date(), z.string().transform(s => s ? new Date(s) : null), z.null()]).optional(),
});
/** @deprecated Renamed to Portfolio Key Dates. Schema kept for backward compatibility. */
export const insertMilestoneSchema = createInsertSchema(milestones).omit({ id: true });
export const insertPortfolioKeyDateSchema = createInsertSchema(portfolioKeyDates).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true, deletedBy: true, isDemo: true });
export const updatePortfolioKeyDateSchema = insertPortfolioKeyDateSchema.pick({ title: true, description: true, keyDateType: true, date: true, status: true, completed: true, notes: true }).partial();
// Extend to handle date strings for escalatedAt field
const baseIssueSchema = createInsertSchema(issues).omit({ id: true, createdAt: true });
export const insertIssueSchema = baseIssueSchema.extend({
  escalatedAt: z.union([z.date(), z.string().transform(s => s ? new Date(s) : null), z.null()]).optional(),
});
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true }).extend({
  durationDays: z.number().min(0).max(36500).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isOngoing: z.boolean().optional(),
  schedulingMode: z.enum(['auto', 'manual']).optional(),
});
export const insertTaskChangeLogSchema = createInsertSchema(taskChangeLogs).omit({ id: true, changedAt: true });
export const insertTaskNotesHistorySchema = createInsertSchema(taskNotesHistory).omit({ id: true, changedAt: true });
export const insertProjectChangeLogSchema = createInsertSchema(projectChangeLogs).omit({ id: true, changedAt: true });
export const insertIssueChangeLogSchema = createInsertSchema(issueChangeLogs).omit({ id: true, changedAt: true });
// Risk change logs are now handled through issue change logs
export const insertRiskChangeLogSchema = insertIssueChangeLogSchema;
export const insertTaskDependencySchema = createInsertSchema(taskDependencies).omit({ id: true, createdAt: true });
export const insertProjectFinancialSchema = createInsertSchema(projectFinancials).omit({ id: true, createdAt: true, updatedAt: true });
export const insertResourceSchema = createInsertSchema(resources).omit({ id: true, createdAt: true });
export const insertTaskResourceAssignmentSchema = createInsertSchema(taskResourceAssignments).omit({ id: true, createdAt: true });
export const insertIssueResourceAssignmentSchema = createInsertSchema(issueResourceAssignments).omit({ id: true, createdAt: true });
// Risk resource assignments are now handled through issue resource assignments
export const insertRiskResourceAssignmentSchema = insertIssueResourceAssignmentSchema;
export const insertTimesheetEntrySchema = createInsertSchema(timesheetEntries).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCostItemSchema = createInsertSchema(costItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProjectIntakeSchema = createInsertSchema(projectIntakes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMppImportSchema = createInsertSchema(mppImports).omit({ id: true, createdAt: true, lastSyncedAt: true });
export const insertMppImportTaskSchema = createInsertSchema(mppImportTasks).omit({ id: true, createdAt: true });
export const insertChangeRequestSchema = createInsertSchema(changeRequests).omit({ id: true, createdAt: true });
export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({ id: true, createdAt: true, updatedAt: true });

export const insertProjectCommentSchema = createInsertSchema(projectComments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBillableStatusCommentSchema = createInsertSchema(billableStatusComments).omit({ id: true, createdAt: true });
export const insertHealthStatusHistorySchema = createInsertSchema(healthStatusHistory).omit({ id: true, createdAt: true });
export const insertProjectInvoiceSchema = createInsertSchema(projectInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceNoteSchema = createInsertSchema(invoiceNotes).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertStatusReportHistorySchema = createInsertSchema(statusReportHistory).omit({ id: true, createdAt: true });
export const insertIntakeWorkflowStepSchema = createInsertSchema(intakeWorkflowSteps).omit({ id: true, createdAt: true, updatedAt: true });

// === TYPES ===

// User types exported from models/auth

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;

export type OrganizationInvite = typeof organizationInvites.$inferSelect;
export type InsertOrganizationInvite = z.infer<typeof insertOrganizationInviteSchema>;

export type OrganizationAccessRequest = typeof organizationAccessRequests.$inferSelect;
export type InsertOrganizationAccessRequest = z.infer<typeof insertOrganizationAccessRequestSchema>;

export type ExternalShare = typeof externalShares.$inferSelect;
export type InsertExternalShare = z.infer<typeof insertExternalShareSchema>;

export type Portfolio = typeof portfolios.$inferSelect;
export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;

export type CustomPortfolioProject = typeof customPortfolioProjects.$inferSelect;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

/** @deprecated Renamed to PortfolioKeyDate. Alias kept for backward compatibility. */
export type Milestone = typeof milestones.$inferSelect;
/** @deprecated Renamed to InsertPortfolioKeyDate. Alias kept for backward compatibility. */
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;

export type PortfolioKeyDate = typeof portfolioKeyDates.$inferSelect;
export type InsertPortfolioKeyDate = z.infer<typeof insertPortfolioKeyDateSchema>;
export type UpdatePortfolioKeyDateRequest = Partial<InsertPortfolioKeyDate>;

export type Issue = typeof issues.$inferSelect;
export type InsertIssue = z.infer<typeof insertIssueSchema>;

// Risk is now an alias for Issue with itemType="risk"
export type Risk = Issue;
export type InsertRisk = InsertIssue;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskChangeLog = typeof taskChangeLogs.$inferSelect;
export type InsertTaskChangeLog = z.infer<typeof insertTaskChangeLogSchema>;

export type TaskNotesHistoryEntry = typeof taskNotesHistory.$inferSelect;
export type InsertTaskNotesHistory = z.infer<typeof insertTaskNotesHistorySchema>;

export type ProjectChangeLog = typeof projectChangeLogs.$inferSelect;
export type InsertProjectChangeLog = z.infer<typeof insertProjectChangeLogSchema>;

export type IssueChangeLog = typeof issueChangeLogs.$inferSelect;
export type InsertIssueChangeLog = z.infer<typeof insertIssueChangeLogSchema>;

// Risk change logs are now handled through issue change logs
export type RiskChangeLog = IssueChangeLog;
export type InsertRiskChangeLog = InsertIssueChangeLog;

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

// Risk resource assignments are now handled through issue resource assignments  
export type RiskResourceAssignment = IssueResourceAssignment;
export type InsertRiskResourceAssignment = InsertIssueResourceAssignment;

export type TimesheetEntry = typeof timesheetEntries.$inferSelect;
export type InsertTimesheetEntry = z.infer<typeof insertTimesheetEntrySchema>;

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

export type BillableStatusComment = typeof billableStatusComments.$inferSelect;
export type InsertBillableStatusComment = z.infer<typeof insertBillableStatusCommentSchema>;

export type HealthStatusHistory = typeof healthStatusHistory.$inferSelect;
export type InsertHealthStatusHistory = z.infer<typeof insertHealthStatusHistorySchema>;

export type ProjectInvoice = typeof projectInvoices.$inferSelect;
export type InsertProjectInvoice = z.infer<typeof insertProjectInvoiceSchema>;

export type InvoiceNote = typeof invoiceNotes.$inferSelect;
export type InsertInvoiceNote = z.infer<typeof insertInvoiceNoteSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type StatusReportHistory = typeof statusReportHistory.$inferSelect;
export type InsertStatusReportHistory = z.infer<typeof insertStatusReportHistorySchema>;

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

/** @deprecated Use InsertPortfolioKeyDate from the portfolioKeyDates table instead. */
export type CreateMilestoneRequest = InsertMilestone;
/** @deprecated Use UpdatePortfolioKeyDateRequest from the portfolioKeyDates table instead. */
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

export type CreateTimesheetEntryRequest = InsertTimesheetEntry;
export type UpdateTimesheetEntryRequest = Partial<InsertTimesheetEntry>;

// Organization Integrations
export const insertOrganizationIntegrationSchema = createInsertSchema(organizationIntegrations).omit({
  id: true,
  updatedAt: true,
});
export type InsertOrganizationIntegration = z.infer<typeof insertOrganizationIntegrationSchema>;
export type OrganizationIntegration = typeof organizationIntegrations.$inferSelect;

// Custom Dashboards - AI-generated dashboards saved by users
export const customDashboards = pgTable("custom_dashboards", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"), // User's original request
  config: jsonb("config").$type<CustomDashboardConfig>().notNull(), // AI-generated configuration
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Custom Dashboard Configuration Types
export interface DashboardWidget {
  id: string;
  type: 'kpi' | 'bar-chart' | 'line-chart' | 'pie-chart' | 'area-chart' | 'table' | 'progress' | 'powerbi-embed' | 'gantt' | 'narrative' | 'recent-tasks' | 'stat-card' | 'heatmap' | 'trend-card' | 'milestone-timeline';
  title: string;
  dataSource: 'projects' | 'portfolios' | 'tasks' | 'risks' | 'issues' | 'milestones' | 'resources' | 'timesheets' | 'external';
  metrics?: string[];
  filters?: Record<string, any>;
  aggregation?: 'count' | 'sum' | 'average' | 'percentage';
  groupBy?: string;
  size: 'small' | 'medium' | 'large' | 'full';
  embedUrl?: string; // For Power BI or other iframe embeds
  limit?: number; // For widgets that show limited items (e.g., recent-tasks)
  narrativeTemplate?: string; // For narrative widgets
  trendField?: string; // For trend cards to show change over time
  colorScheme?: 'green' | 'blue' | 'amber' | 'red' | 'purple'; // Color scheme for stat cards
}

export interface CustomDashboardConfig {
  widgets: DashboardWidget[];
  layout?: 'grid' | 'masonry';
  refreshInterval?: number;
}

export const insertCustomDashboardSchema = createInsertSchema(customDashboards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomDashboard = z.infer<typeof insertCustomDashboardSchema>;
export type CustomDashboard = typeof customDashboards.$inferSelect;

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

// Project Views - User-specific saved view configurations for Grid and Gantt modes
export const projectViews = pgTable("project_views", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: text("mode").notNull(), // 'grid' or 'gantt'
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false), // User's default view for this mode
  isSystem: boolean("is_system").default(false), // System default view (cannot be deleted)
  visibleColumns: text("visible_columns").array().notNull(),
  columnOrder: text("column_order").array(),
  columnWidths: jsonb("column_widths").$type<Record<string, number>>(),
  frozenColumns: text("frozen_columns").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectViewSchema = createInsertSchema(projectViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectView = z.infer<typeof insertProjectViewSchema>;
export type ProjectView = typeof projectViews.$inferSelect;
export type UpdateProjectViewRequest = Partial<InsertProjectView>;

// System Project Views - Admin-managed org-level views available to all members
export const systemProjectViews = pgTable("system_project_views", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  mode: text("mode").notNull(), // 'grid' or 'gantt'
  name: text("name").notNull(),
  description: text("description"), // Description of what this view shows
  visibleColumns: text("visible_columns").array().notNull(),
  columnOrder: text("column_order").array(),
  columnWidths: jsonb("column_widths").$type<Record<string, number>>(),
  filterCriteria: jsonb("filter_criteria").$type<SystemViewFilterCriteria>(), // Optional filter criteria
  isActive: boolean("is_active").default(true), // Admins can deactivate without deleting
  displayOrder: integer("display_order").default(0), // Order in the dropdown
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Filter criteria for system views
export interface SystemViewFilterCriteria {
  status?: string[];
  priority?: string[];
  health?: string[];
  portfolioIds?: number[];
  dateRange?: { field: string; start?: string; end?: string };
}

export const insertSystemProjectViewSchema = createInsertSchema(systemProjectViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSystemProjectView = z.infer<typeof insertSystemProjectViewSchema>;
export type SystemProjectView = typeof systemProjectViews.$inferSelect;
export type UpdateSystemProjectViewRequest = Partial<InsertSystemProjectView>;

// User Consents - Tracking acceptance of Terms of Service, Privacy Policy, etc.
export const userConsents = pgTable("user_consents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  consentType: text("consent_type").notNull(), // 'terms_of_service', 'privacy_policy', 'marketing', etc.
  version: text("version").notNull(), // Version of the document accepted (e.g., '1.0', '2024-01')
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  ipAddress: text("ip_address"), // IP address at time of consent
  userAgent: text("user_agent"), // Browser/device info
  method: text("method").notNull().default("checkbox"), // 'checkbox', 'modal', 'signup', etc.
  revoked: boolean("revoked").default(false),
  revokedAt: timestamp("revoked_at"),
});

export const insertUserConsentSchema = createInsertSchema(userConsents).omit({
  id: true,
  acceptedAt: true,
  revoked: true,
  revokedAt: true,
});

export type InsertUserConsent = z.infer<typeof insertUserConsentSchema>;
export type UserConsent = typeof userConsents.$inferSelect;

// Current Terms/Privacy versions - used to check if user needs to re-accept
export const CURRENT_TERMS_VERSION = "2026-01";
export const CURRENT_PRIVACY_VERSION = "2026-01";

// Custom Field Definitions - Define custom fields for projects, tasks, or resources per organization
export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  fieldType: text("field_type").notNull(), // 'text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url'
  entityType: text("entity_type").default("project").notNull(), // 'project', 'task', 'resource'
  description: text("description"),
  isRequired: boolean("is_required").default(false),
  options: text("options").array(), // For select/multiselect types
  defaultValue: text("default_value"),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomFieldDefinitionSchema = createInsertSchema(customFieldDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomFieldDefinition = z.infer<typeof insertCustomFieldDefinitionSchema>;
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type UpdateCustomFieldDefinitionRequest = Partial<InsertCustomFieldDefinition>;

// Project Custom Field Values - Store values for custom fields per project
export const projectCustomFieldValues = pgTable("project_custom_field_values", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  fieldDefinitionId: integer("field_definition_id").references(() => customFieldDefinitions.id).notNull(),
  value: text("value"), // JSON string for complex types (multiselect arrays, etc.)
  textValue: text("text_value"), // Legacy typed storage
  numberValue: numeric("number_value"), // Legacy typed storage
  dateValue: date("date_value"), // Legacy typed storage
  booleanValue: boolean("boolean_value"), // Legacy typed storage
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("pcfv_project_field_idx").on(table.projectId, table.fieldDefinitionId),
]);

export const insertProjectCustomFieldValueSchema = createInsertSchema(projectCustomFieldValues).omit({
  id: true,
  updatedAt: true,
});

export type InsertProjectCustomFieldValue = z.infer<typeof insertProjectCustomFieldValueSchema>;
export type ProjectCustomFieldValue = typeof projectCustomFieldValues.$inferSelect;
export type UpdateProjectCustomFieldValueRequest = Partial<InsertProjectCustomFieldValue>;

// Task Custom Field Values - Store values for custom fields per task
export const taskCustomFieldValues = pgTable("task_custom_field_values", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  fieldDefinitionId: integer("field_definition_id").references(() => customFieldDefinitions.id).notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("tcfv_task_field_idx").on(table.taskId, table.fieldDefinitionId),
]);

export const insertTaskCustomFieldValueSchema = createInsertSchema(taskCustomFieldValues).omit({
  id: true,
  updatedAt: true,
});

export type InsertTaskCustomFieldValue = z.infer<typeof insertTaskCustomFieldValueSchema>;
export type TaskCustomFieldValue = typeof taskCustomFieldValues.$inferSelect;

// Resource Custom Field Values - Store values for custom fields per resource
export const resourceCustomFieldValues = pgTable("resource_custom_field_values", {
  id: serial("id").primaryKey(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  fieldDefinitionId: integer("field_definition_id").references(() => customFieldDefinitions.id).notNull(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("rcfv_resource_field_idx").on(table.resourceId, table.fieldDefinitionId),
]);

export const insertResourceCustomFieldValueSchema = createInsertSchema(resourceCustomFieldValues).omit({
  id: true,
  updatedAt: true,
});

export type InsertResourceCustomFieldValue = z.infer<typeof insertResourceCustomFieldValueSchema>;
export type ResourceCustomFieldValue = typeof resourceCustomFieldValues.$inferSelect;

// Custom Project Tabs - User-defined tabs for project details
export const customProjectTabs = pgTable("custom_project_tabs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // Lucide icon name
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertCustomProjectTabSchema = createInsertSchema(customProjectTabs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomProjectTab = z.infer<typeof insertCustomProjectTabSchema>;
export type CustomProjectTab = typeof customProjectTabs.$inferSelect;

// Custom Tab Sections - Sections within a custom tab
export const customTabSections = pgTable("custom_tab_sections", {
  id: serial("id").primaryKey(),
  tabId: integer("tab_id").references(() => customProjectTabs.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  columns: integer("columns").default(2), // 1, 2, 3, or 4 column layout
  displayOrder: integer("display_order").default(0),
  isCollapsible: boolean("is_collapsible").default(true),
  isCollapsedByDefault: boolean("is_collapsed_by_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomTabSectionSchema = createInsertSchema(customTabSections).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomTabSection = z.infer<typeof insertCustomTabSectionSchema>;
export type CustomTabSection = typeof customTabSections.$inferSelect;

// Custom Tab Fields - Fields within a section
export const customTabFields = pgTable("custom_tab_fields", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").references(() => customTabSections.id).notNull(),
  fieldKey: text("field_key").notNull(),
  fieldType: text("field_type").notNull(),
  label: text("label"),
  displayOrder: integer("display_order").default(0),
  span: integer("span").default(1),
  isRequired: boolean("is_required").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomTabFieldSchema = createInsertSchema(customTabFields).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomTabField = z.infer<typeof insertCustomTabFieldSchema>;
export type CustomTabField = typeof customTabFields.$inferSelect;

// Project field definitions for the custom tab builder
export const PROJECT_FIELD_DEFINITIONS = [
  { key: 'name', label: 'Project Name', type: 'text' },
  { key: 'projectCode', label: 'Project Code', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'status', label: 'Status', type: 'select' },
  { key: 'priority', label: 'Priority', type: 'select' },
  { key: 'health', label: 'Health', type: 'select' },
  { key: 'healthReason', label: 'Health Reason', type: 'textarea' },
  { key: 'projectType', label: 'Project Type', type: 'text' },
  { key: 'methodology', label: 'Methodology', type: 'text' },
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'endDate', label: 'End Date', type: 'date' },
  { key: 'baselineStartDate', label: 'Baseline Start Date', type: 'date' },
  { key: 'baselineEndDate', label: 'Baseline End Date', type: 'date' },
  { key: 'actualStartDate', label: 'Actual Start Date', type: 'date' },
  { key: 'actualEndDate', label: 'Actual End Date', type: 'date' },
  { key: 'budget', label: 'Budget', type: 'currency' },
  { key: 'actualCost', label: 'Actual Cost', type: 'currency' },
  { key: 'forecastCost', label: 'Forecast Cost', type: 'currency' },
  { key: 'completionPercentage', label: 'Completion %', type: 'percentage' },
  { key: 'scheduleVariance', label: 'Schedule Variance', type: 'number' },
  { key: 'costVariance', label: 'Cost Variance', type: 'number' },
  { key: 'scope', label: 'Scope', type: 'textarea' },
  { key: 'objectives', label: 'Objectives', type: 'textarea' },
  { key: 'successCriteria', label: 'Success Criteria', type: 'textarea' },
  { key: 'constraints', label: 'Constraints', type: 'textarea' },
  { key: 'assumptions', label: 'Assumptions', type: 'textarea' },
  { key: 'dependencies', label: 'Dependencies', type: 'textarea' },
  { key: 'businessValue', label: 'Business Value', type: 'text' },
  { key: 'riskLevel', label: 'Risk Level', type: 'select' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
  { key: 'billableStatus', label: 'Billable Status', type: 'select' },
  { key: 'source', label: 'Source', type: 'text' },
  { key: 'portfolioId', label: 'Portfolio', type: 'reference' },
  { key: 'managerResourceId', label: 'Project Manager', type: 'reference' },
] as const;

export type ProjectFieldKey = typeof PROJECT_FIELD_DEFINITIONS[number]['key'];

// Portfolio Scoring Criteria - defines scoring dimensions with weights
// Project Scoring Criteria - organization-level criteria for scoring projects
export const projectScoringCriteria = pgTable("project_scoring_criteria", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // Strategic, Financial, Risk, Resource, etc.
  weight: numeric("weight").default("1"), // Weight for weighted scoring
  minScore: integer("min_score").default(0),
  maxScore: integer("max_score").default(10),
  scoringGuidelines: text("scoring_guidelines"), // Instructions for scoring
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

export const insertProjectScoringCriteriaSchema = createInsertSchema(projectScoringCriteria).omit({
  id: true,
  createdAt: true,
});

export type InsertProjectScoringCriteria = z.infer<typeof insertProjectScoringCriteriaSchema>;
export type ProjectScoringCriteria = typeof projectScoringCriteria.$inferSelect;

// Project Scores - actual scores for projects on each criterion
export const projectScores = pgTable("project_scores", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  criteriaId: integer("criteria_id").references(() => projectScoringCriteria.id).notNull(),
  score: integer("score").notNull(),
  justification: text("justification"),
  scoredAt: timestamp("scored_at").defaultNow(),
  scoredBy: varchar("scored_by").references(() => users.id),
}, (table) => [
  uniqueIndex("project_scores_project_criteria_idx").on(table.projectId, table.criteriaId),
]);

export const insertProjectScoreSchema = createInsertSchema(projectScores).omit({
  id: true,
  scoredAt: true,
});

export type InsertProjectScore = z.infer<typeof insertProjectScoreSchema>;
export type ProjectScore = typeof projectScores.$inferSelect;

// Portfolio Scoring Config - per-portfolio overrides for how project scores are aggregated
export const portfolioScoringConfig = pgTable("portfolio_scoring_config", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  criteriaId: integer("criteria_id").references(() => projectScoringCriteria.id).notNull(),
  aggregationMethod: text("aggregation_method").default("average").notNull(), // average, sum, max, min, weighted-average
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("portfolio_scoring_config_portfolio_criteria_idx").on(table.portfolioId, table.criteriaId),
]);

export type PortfolioScoringConfig = typeof portfolioScoringConfig.$inferSelect;

// Project Benefits - track expected and realized benefits
export const projectBenefits = pgTable("project_benefits", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // Financial, Operational, Strategic, Customer, etc.
  benefitType: text("benefit_type"), // Tangible, Intangible
  measurementMethod: text("measurement_method"), // How the benefit is measured
  unit: text("unit"), // Currency, Percentage, Number, etc.
  targetValue: numeric("target_value"), // Expected/target value
  actualValue: numeric("actual_value"), // Realized/actual value
  baselineValue: numeric("baseline_value"), // Value before project
  targetDate: date("target_date"), // When benefit should be realized
  actualRealizationDate: date("actual_realization_date"), // When benefit was realized
  status: text("status").default("Planned"), // Planned, In Progress, Partially Realized, Fully Realized, Not Achieved
  owner: varchar("owner").references(() => users.id), // Who is responsible
  notes: text("notes"),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectBenefitSchema = createInsertSchema(projectBenefits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectBenefit = z.infer<typeof insertProjectBenefitSchema>;
export type ProjectBenefit = typeof projectBenefits.$inferSelect;

// Project Decisions - log key decisions made for projects
export const projectDecisions = pgTable("project_decisions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  decisionType: text("decision_type"), // Strategic, Financial, Resource, Risk, Scope, etc.
  status: text("status").default("Pending"), // Pending, Approved, Rejected, Deferred, Implemented
  rationale: text("rationale"), // Why this decision was made
  alternatives: text("alternatives"), // Alternatives considered
  impact: text("impact"), // Expected impact of the decision
  riskAssessment: text("risk_assessment"), // Risks associated with the decision
  stakeholders: text("stakeholders"), // Key stakeholders involved
  decisionDate: date("decision_date"),
  implementationDate: date("implementation_date"),
  reviewDate: date("review_date"), // When to review the decision
  outcome: text("outcome"), // Actual outcome after implementation
  decisionMaker: varchar("decision_maker").references(() => users.id),
  priority: text("priority").default("Medium"),
  notes: text("notes"),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectDecisionSchema = createInsertSchema(projectDecisions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectDecision = z.infer<typeof insertProjectDecisionSchema>;
export type ProjectDecision = typeof projectDecisions.$inferSelect;

// Lessons Learned
export const lessonsLearned = pgTable("lessons_learned", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").default("General"),
  type: text("type").default("Improvement"),
  lessonType: text("lesson_type").default("Positive"),
  impact: text("impact"),
  phase: text("phase"),
  rootCause: text("root_cause"),
  recommendation: text("recommendation"),
  outcome: text("outcome"),
  actionsTaken: text("actions_taken"),
  applicability: text("applicability"),
  tags: text("tags"),
  attachments: text("attachments"),
  isShared: boolean("is_shared").default(false),
  status: text("status").default("Draft"),
  dateIdentified: date("date_identified"),
  identifiedBy: varchar("identified_by").references(() => users.id),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLessonLearnedSchema = createInsertSchema(lessonsLearned).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
});

export type InsertLessonLearned = z.infer<typeof insertLessonLearnedSchema>;
export type LessonLearned = typeof lessonsLearned.$inferSelect;

// === APPLICATION MONITORING ===

// API Request Logs - track all API requests for monitoring
export const apiRequestLogs = pgTable("api_request_logs", {
  id: serial("id").primaryKey(),
  method: text("method").notNull(), // GET, POST, PUT, DELETE, etc.
  path: text("path").notNull(), // API endpoint path
  statusCode: integer("status_code"), // HTTP response status
  duration: integer("duration"), // Response time in milliseconds
  userId: varchar("user_id").references(() => users.id), // Who made the request
  organizationId: integer("organization_id").references(() => organizations.id),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  errorMessage: text("error_message"), // Error details if request failed
  requestBody: jsonb("request_body"), // Sanitized request body for debugging
  createdAt: timestamp("created_at").defaultNow(),
});

export type ApiRequestLog = typeof apiRequestLogs.$inferSelect;

// Application Metrics - aggregated metrics for dashboards
export const applicationMetrics = pgTable("application_metrics", {
  id: serial("id").primaryKey(),
  metricName: text("metric_name").notNull(),
  metricValue: numeric("metric_value").notNull(),
  dimensions: jsonb("dimensions"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export type ApplicationMetric = typeof applicationMetrics.$inferSelect;

// User Activity Logs - track important user actions
export const userActivityLogs = pgTable("user_activity_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserActivityLog = typeof userActivityLogs.$inferSelect;

// Feature Usage - track which features are being used
export const featureUsageLogs = pgTable("feature_usage_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  featureCode: text("feature_code").notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  usageCount: integer("usage_count").default(1),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type FeatureUsageLog = typeof featureUsageLogs.$inferSelect;

// Error Logs - detailed error tracking
export const errorLogs = pgTable("error_logs", {
  id: serial("id").primaryKey(),
  errorType: text("error_type").notNull(),
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  userId: varchar("user_id").references(() => users.id),
  organizationId: integer("organization_id").references(() => organizations.id),
  requestUrl: text("request_url"),
  requestMethod: text("request_method"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ErrorLog = typeof errorLogs.$inferSelect;

// Help Tickets - user feedback and support requests
export const helpTickets = pgTable("help_tickets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  userEmail: text("user_email").notNull(),
  userName: text("user_name"),
  organizationId: integer("organization_id").references(() => organizations.id),
  organizationName: text("organization_name"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  imageUrls: text("image_urls").array(), // Array of image URLs stored in object storage
  status: text("status").notNull().default("new"), // new, in_progress, resolved, closed
  priority: text("priority").default("normal"), // low, normal, high, urgent
  assignedTo: varchar("assigned_to").references(() => users.id),
  resolution: text("resolution"),
  emailSent: boolean("email_sent").default(false),
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertHelpTicketSchema = createInsertSchema(helpTickets).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  resolvedAt: true,
  emailSent: true,
  emailSentAt: true 
});
export type InsertHelpTicket = z.infer<typeof insertHelpTicketSchema>;
export type HelpTicket = typeof helpTickets.$inferSelect;
// === SIMULATION MODULE ===

// Simulation Runs - Portfolio/project simulation sessions
export const simulationRuns = pgTable("simulation_runs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id),
  name: text("name").notNull(),
  description: text("description"),
  timeHorizon: text("time_horizon").notNull(), // "1month", "3months", "6months", "1year"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  scenario: text("scenario").default("baseline"), // "optimistic", "baseline", "pessimistic"
  status: text("status").default("pending"), // "pending", "running", "completed", "cancelled"
  currentStep: integer("current_step").default(0),
  totalSteps: integer("total_steps").default(0),
  riskTriggerProbabilityMultiplier: numeric("risk_trigger_probability_multiplier").default("1.0"),
  budgetVarianceRange: numeric("budget_variance_range").default("0.1"),
  scheduleVarianceRange: numeric("schedule_variance_range").default("0.1"),
  snapshotData: jsonb("snapshot_data").$type<SimulationSnapshot>(),
  finalResults: jsonb("final_results").$type<SimulationResults>(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Simulation Events - Individual events triggered during simulation
export const simulationEvents = pgTable("simulation_events", {
  id: serial("id").primaryKey(),
  simulationRunId: integer("simulation_run_id").references(() => simulationRuns.id).notNull(),
  stepNumber: integer("step_number").notNull(),
  eventDate: date("event_date").notNull(),
  eventType: text("event_type").notNull(), // "risk_triggered", "deadline_missed", "budget_exceeded", "resource_overload", "milestone_delayed"
  severity: text("severity").default("medium"), // "low", "medium", "high", "critical"
  sourceType: text("source_type"), // "risk", "task", "project", "resource"
  sourceId: integer("source_id"),
  sourceName: text("source_name"),
  projectId: integer("project_id").references(() => projects.id),
  projectName: text("project_name"),
  title: text("title").notNull(),
  description: text("description"),
  impactBudget: numeric("impact_budget"),
  impactScheduleDays: integer("impact_schedule_days"),
  impactHealth: text("impact_health"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Simulation Step Snapshots - State at each time step
export const simulationSnapshots = pgTable("simulation_snapshots", {
  id: serial("id").primaryKey(),
  simulationRunId: integer("simulation_run_id").references(() => simulationRuns.id).notNull(),
  stepNumber: integer("step_number").notNull(),
  stepDate: date("step_date").notNull(),
  portfolioHealth: text("portfolio_health"),
  totalBudget: numeric("total_budget"),
  totalSpent: numeric("total_spent"),
  totalForecast: numeric("total_forecast"),
  projectsOnTrack: integer("projects_on_track"),
  projectsAtRisk: integer("projects_at_risk"),
  projectsOffTrack: integer("projects_off_track"),
  openRisks: integer("open_risks"),
  triggeredRisks: integer("triggered_risks"),
  openIssues: integer("open_issues"),
  completedTasks: integer("completed_tasks"),
  totalTasks: integer("total_tasks"),
  resourceUtilization: numeric("resource_utilization"),
  projectStates: jsonb("project_states").$type<ProjectSimState[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Types for simulation JSON data
export interface ProjectSimState {
  projectId: number;
  projectName: string;
  health: string;
  budget: number;
  spent: number;
  forecast: number;
  completionPercentage: number;
  scheduleVarianceDays: number;
  costVariance: number;
}

export interface SimulationSnapshot {
  portfolioHealth: string;
  totalBudget: number;
  totalSpent: number;
  totalForecast: number;
  projectStates: ProjectSimState[];
}

export interface SimulationResults {
  scenario: string;
  finalHealth: string;
  budgetVariance: number;
  scheduleVarianceDays: number;
  riskTriggeredCount: number;
  issuesCreatedCount: number;
  projectsCompleted: number;
  projectsDelayed: number;
  projectsOverBudget: number;
  recommendations: string[];
}

export const insertSimulationRunSchema = createInsertSchema(simulationRuns).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type InsertSimulationRun = z.infer<typeof insertSimulationRunSchema>;
export type SimulationRun = typeof simulationRuns.$inferSelect;

export const insertSimulationEventSchema = createInsertSchema(simulationEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertSimulationEvent = z.infer<typeof insertSimulationEventSchema>;
export type SimulationEvent = typeof simulationEvents.$inferSelect;

export const insertSimulationSnapshotSchema = createInsertSchema(simulationSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertSimulationSnapshot = z.infer<typeof insertSimulationSnapshotSchema>;
export type SimulationSnapshot2 = typeof simulationSnapshots.$inferSelect;

// Report Subscriptions - scheduled email reports for dashboards
export const reportSubscriptions = pgTable("report_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(), // e.g., "Weekly Portfolio Summary"
  dashboards: text("dashboards").array().notNull(), // e.g., ["timesheet-overview", "project-hours"]
  frequency: text("frequency").notNull(), // daily, weekly, monthly
  dayOfWeek: integer("day_of_week"), // 0-6 for weekly (0=Sunday)
  dayOfMonth: integer("day_of_month"), // 1-31 for monthly
  timeOfDay: text("time_of_day").notNull().default("09:00"), // HH:mm format
  timezone: text("timezone").notNull().default("America/New_York"),
  recipients: text("recipients").array(), // Additional email addresses
  isActive: boolean("is_active").notNull().default(true),
  lastSentAt: timestamp("last_sent_at"),
  nextScheduledAt: timestamp("next_scheduled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReportSubscriptionSchema = createInsertSchema(reportSubscriptions).omit({
  id: true,
  lastSentAt: true,
  nextScheduledAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReportSubscription = z.infer<typeof insertReportSubscriptionSchema>;
export type ReportSubscription = typeof reportSubscriptions.$inferSelect;

// Resource Availability (planned time-off, leave, holidays, training)
export const resourceAvailability = pgTable("resource_availability", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: text("type").notNull(), // leave, pto, sick, holiday, training, other
  hoursPerDay: numeric("hours_per_day"), // Override hours unavailable per day (null = full day)
  notes: text("notes"),
  status: text("status").default("approved"), // pending, approved, rejected
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertResourceAvailabilitySchema = createInsertSchema(resourceAvailability).omit({
  id: true,
  createdAt: true,
});
export type InsertResourceAvailability = z.infer<typeof insertResourceAvailabilitySchema>;
export type ResourceAvailability = typeof resourceAvailability.$inferSelect;

// Resource Skills (normalized skill tracking)
export const resourceSkills = pgTable("resource_skills", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  skillName: text("skill_name").notNull(),
  proficiencyLevel: text("proficiency_level"), // Beginner, Intermediate, Advanced, Expert
  yearsOfExperience: numeric("years_of_experience"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertResourceSkillSchema = createInsertSchema(resourceSkills).omit({
  id: true,
  createdAt: true,
});
export type InsertResourceSkill = z.infer<typeof insertResourceSkillSchema>;
export type ResourceSkill = typeof resourceSkills.$inferSelect;

export const portfolioRiskAssessments = pgTable("portfolio_risk_assessments", {
  id: serial("id").primaryKey(),
  portfolioId: integer("portfolio_id").references(() => portfolios.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  riskScore: integer("risk_score").notNull(),
  summary: text("summary").notNull(),
  reportJson: text("report_json").notNull(),
  shareToken: text("share_token").notNull(),
  generatedBy: varchar("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPortfolioRiskAssessmentSchema = createInsertSchema(portfolioRiskAssessments).omit({
  id: true,
  createdAt: true,
});
export type InsertPortfolioRiskAssessment = z.infer<typeof insertPortfolioRiskAssessmentSchema>;
export type PortfolioRiskAssessment = typeof portfolioRiskAssessments.$inferSelect;

export const projectRiskAssessments = pgTable("project_risk_assessments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  riskScore: integer("risk_score").notNull(),
  summary: text("summary").notNull(),
  reportJson: text("report_json").notNull(),
  shareToken: text("share_token").notNull(),
  generatedBy: varchar("generated_by").references(() => users.id),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectRiskAssessmentSchema = createInsertSchema(projectRiskAssessments).omit({
  id: true,
  createdAt: true,
});
export type InsertProjectRiskAssessment = z.infer<typeof insertProjectRiskAssessmentSchema>;
export type ProjectRiskAssessment = typeof projectRiskAssessments.$inferSelect;

// === LEGACY RISK TABLES ===
// These tables exist in the database but are no longer actively used.
// Risks are now managed through the "issues" table with itemType="risk".
// These definitions are kept for schema completeness and potential data migration.

export const legacyRisks = pgTable("risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  probability: text("probability"),
  impact: text("impact"),
  status: text("status").default("Open"),
  mitigationPlan: text("mitigation_plan"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by"),
  isDemo: boolean("is_demo").default(false),
  riskNumber: text("risk_number"),
  category: text("category"),
  riskScore: integer("risk_score"),
  responseStrategy: text("response_strategy"),
  contingencyPlan: text("contingency_plan"),
  triggerEvents: text("trigger_events"),
  residualRisk: text("residual_risk"),
  ownerId: varchar("owner_id"),
  reviewerId: varchar("reviewer_id"),
  identifiedDate: date("identified_date"),
  targetResolutionDate: date("target_resolution_date"),
  actualResolutionDate: date("actual_resolution_date"),
  impactCost: numeric("impact_cost"),
  impactSchedule: text("impact_schedule"),
  proximity: text("proximity"),
  notes: text("notes"),
  itemType: text("item_type"),
});

export type LegacyRisk = typeof legacyRisks.$inferSelect;

export const legacyRiskChangeLogs = pgTable("risk_change_logs", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").references(() => legacyRisks.id).notNull(),
  changedBy: varchar("changed_by"),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
  changeType: text("change_type").notNull(),
  changeSummary: text("change_summary"),
  previousValues: text("previous_values"),
  newValues: text("new_values"),
});

export type LegacyRiskChangeLog = typeof legacyRiskChangeLogs.$inferSelect;

export const legacyRiskResourceAssignments = pgTable("risk_resource_assignments", {
  id: serial("id").primaryKey(),
  riskId: integer("risk_id").references(() => legacyRisks.id).notNull(),
  resourceId: integer("resource_id").references(() => resources.id).notNull(),
  role: text("role"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type LegacyRiskResourceAssignment = typeof legacyRiskResourceAssignments.$inferSelect;

// API Tokens (Bearer auth for Analytics API, scoped to user + organization)
export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token").unique().notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: varchar("name"),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("api_tokens_token_idx").on(table.token),
  index("api_tokens_user_org_idx").on(table.userId, table.organizationId),
]);

export const insertApiTokenSchema = createInsertSchema(apiTokens).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});
export type InsertApiToken = z.infer<typeof insertApiTokenSchema>;
export type ApiToken = typeof apiTokens.$inferSelect;

// === TRAINING CONTENT MANAGEMENT ===

export const trainingModules = pgTable("training_modules", {
  id: serial("id").primaryKey(),
  moduleKey: varchar("module_key").unique().notNull(),
  name: text("name").notNull(),
  subtitle: text("subtitle").notNull(),
  certPrefix: varchar("cert_prefix", { length: 20 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTrainingModuleSchema = createInsertSchema(trainingModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingModule = z.infer<typeof insertTrainingModuleSchema>;
export type TrainingModuleRecord = typeof trainingModules.$inferSelect;

export const trainingLessons = pgTable("training_lessons", {
  id: serial("id").primaryKey(),
  moduleId: integer("module_id").references(() => trainingModules.id, { onDelete: "cascade" }).notNull(),
  lessonKey: varchar("lesson_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  videoTitle: text("video_title").notNull(),
  videoDescription: text("video_description").notNull(),
  keyConcepts: jsonb("key_concepts").$type<string[]>().notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("training_lessons_module_idx").on(table.moduleId),
  uniqueIndex("training_lessons_module_key_idx").on(table.moduleId, table.lessonKey),
]);

export const insertTrainingLessonSchema = createInsertSchema(trainingLessons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingLesson = z.infer<typeof insertTrainingLessonSchema>;
export type TrainingLessonRecord = typeof trainingLessons.$inferSelect;

export const trainingQuizQuestions = pgTable("training_quiz_questions", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").references(() => trainingLessons.id, { onDelete: "cascade" }).notNull(),
  questionKey: varchar("question_key").notNull(),
  scenario: text("scenario").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("training_questions_lesson_idx").on(table.lessonId),
  uniqueIndex("training_questions_lesson_key_idx").on(table.lessonId, table.questionKey),
]);

export const insertTrainingQuizQuestionSchema = createInsertSchema(trainingQuizQuestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingQuizQuestion = z.infer<typeof insertTrainingQuizQuestionSchema>;
export type TrainingQuizQuestionRecord = typeof trainingQuizQuestions.$inferSelect;

export const unconSelfieLeads = pgTable("uncon_selfie_leads", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  interviewer: varchar("interviewer", { length: 255 }),
  photoPath: text("photo_path"),
  shareToken: varchar("share_token", { length: 64 }).notNull(),
  followupSentAt: timestamp("followup_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("uncon_selfie_leads_email_idx").on(table.email),
  uniqueIndex("uncon_selfie_leads_share_token_idx").on(table.shareToken),
]);

export const insertUnconSelfieLeadSchema = createInsertSchema(unconSelfieLeads).omit({
  id: true,
  createdAt: true,
});
export type InsertUnconSelfieLead = z.infer<typeof insertUnconSelfieLeadSchema>;
export type UnconSelfieLeadRecord = typeof unconSelfieLeads.$inferSelect;

// === PROJECT TEMPLATES ===

export const projectTemplates = pgTable("project_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull().default("project"),
  originalFileName: text("original_file_name"),
  storedFileUrl: text("stored_file_url"),
  itemCount: integer("item_count").default(0),
  milestoneCount: integer("milestone_count").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  sourceProjectId: integer("source_project_id").references(() => projects.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("project_templates_org_idx").on(table.organizationId),
]);

export const projectTemplateItems = pgTable("project_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => projectTemplates.id, { onDelete: "cascade" }).notNull(),
  taskId: integer("task_id"),
  wbs: text("wbs"),
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  duration: text("duration"),
  durationDays: numeric("duration_days"),
  outlineLevel: integer("outline_level").default(1),
  parentTaskId: integer("parent_task_id"),
  isSummary: boolean("is_summary").default(false),
  isMilestone: boolean("is_milestone").default(false),
  predecessors: text("predecessors"),
  notes: text("notes"),
  workHours: numeric("work_hours"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("project_template_items_template_idx").on(table.templateId),
]);

export const insertProjectTemplateSchema = createInsertSchema(projectTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertProjectTemplateItemSchema = createInsertSchema(projectTemplateItems).omit({
  id: true,
  createdAt: true,
});
export type ProjectTemplate = typeof projectTemplates.$inferSelect;
export type InsertProjectTemplate = z.infer<typeof insertProjectTemplateSchema>;
export type ProjectTemplateItem = typeof projectTemplateItems.$inferSelect;
export type InsertProjectTemplateItem = z.infer<typeof insertProjectTemplateItemSchema>;

export const partnerApplications = pgTable("partner_applications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  partnerType: text("partner_type").notNull(),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("partner_apps_email_idx").on(table.email),
  index("partner_apps_status_idx").on(table.status),
]);

export const insertPartnerApplicationSchema = createInsertSchema(partnerApplications).omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type PartnerApplication = typeof partnerApplications.$inferSelect;
export type InsertPartnerApplication = z.infer<typeof insertPartnerApplicationSchema>;

export const projectAgents = pgTable("project_agents", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  enabled: boolean("enabled").notNull().default(false),
  agendaEnabled: boolean("agenda_enabled").notNull().default(true),
  agendaDay: integer("agenda_day").notNull().default(1),
  agendaTime: text("agenda_time").notNull().default("09:00"),
  taskFollowUpEnabled: boolean("task_follow_up_enabled").notNull().default(true),
  taskFollowUpDay: integer("task_follow_up_day").notNull().default(3),
  taskFollowUpTime: text("task_follow_up_time").notNull().default("09:00"),
  statusReportEnabled: boolean("status_report_enabled").notNull().default(true),
  statusReportDay: integer("status_report_day").notNull().default(5),
  statusReportTime: text("status_report_time").notNull().default("09:00"),
  timezone: text("timezone").notNull().default("America/New_York"),
  lastAgendaRun: timestamp("last_agenda_run"),
  nextAgendaRun: timestamp("next_agenda_run"),
  lastTaskFollowUpRun: timestamp("last_task_follow_up_run"),
  nextTaskFollowUpRun: timestamp("next_task_follow_up_run"),
  lastStatusReportRun: timestamp("last_status_report_run"),
  nextStatusReportRun: timestamp("next_status_report_run"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("project_agents_project_id_unique").on(table.projectId),
  index("project_agents_org_idx").on(table.organizationId),
  index("project_agents_next_agenda_idx").on(table.nextAgendaRun),
  index("project_agents_next_follow_up_idx").on(table.nextTaskFollowUpRun),
  index("project_agents_next_status_idx").on(table.nextStatusReportRun),
]);

export type ProjectAgent = typeof projectAgents.$inferSelect;
export type InsertProjectAgent = typeof projectAgents.$inferInsert;

export const projectAgentLogs = pgTable("project_agent_logs", {
  id: serial("id").primaryKey(),
  projectAgentId: integer("project_agent_id").notNull().references(() => projectAgents.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  actionType: text("action_type").notNull(),
  subject: text("subject"),
  recipientEmails: text("recipient_emails").array(),
  emailPreview: text("email_preview"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ProjectAgentLog = typeof projectAgentLogs.$inferSelect;
export type InsertProjectAgentLog = typeof projectAgentLogs.$inferInsert;

// === DAILY LOGS (Field Management) ===

export const dailyLogs = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  logDate: date("log_date").notNull(),
  weatherCondition: text("weather_condition"),
  temperature: text("temperature"),
  windSpeed: text("wind_speed"),
  precipitation: text("precipitation"),
  visitors: text("visitors"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
}, (table) => [
  index("daily_logs_project_id_idx").on(table.projectId),
  index("daily_logs_org_id_idx").on(table.organizationId),
  index("daily_logs_log_date_idx").on(table.logDate),
  uniqueIndex("daily_logs_project_date_unique").on(table.projectId, table.logDate).where(sql`deleted_at IS NULL`),
]);

export const insertDailyLogSchema = createInsertSchema(dailyLogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
});
export type DailyLog = typeof dailyLogs.$inferSelect;
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;

export const dailyLogLabor = pgTable("daily_log_labor", {
  id: serial("id").primaryKey(),
  dailyLogId: integer("daily_log_id").references(() => dailyLogs.id).notNull(),
  company: text("company"),
  trade: text("trade"),
  headcount: integer("headcount").default(0),
  hoursWorked: numeric("hours_worked"),
  notes: text("notes"),
}, (table) => [
  index("daily_log_labor_log_id_idx").on(table.dailyLogId),
]);

export const insertDailyLogLaborSchema = createInsertSchema(dailyLogLabor).omit({
  id: true,
});
export type DailyLogLabor = typeof dailyLogLabor.$inferSelect;
export type InsertDailyLogLabor = z.infer<typeof insertDailyLogLaborSchema>;

export const dailyLogEquipment = pgTable("daily_log_equipment", {
  id: serial("id").primaryKey(),
  dailyLogId: integer("daily_log_id").references(() => dailyLogs.id).notNull(),
  equipmentName: text("equipment_name").notNull(),
  quantity: integer("quantity").default(1),
  hoursUsed: numeric("hours_used"),
  status: text("status").default("Active"),
  notes: text("notes"),
}, (table) => [
  index("daily_log_equipment_log_id_idx").on(table.dailyLogId),
]);

export const insertDailyLogEquipmentSchema = createInsertSchema(dailyLogEquipment).omit({
  id: true,
});
export type DailyLogEquipment = typeof dailyLogEquipment.$inferSelect;
export type InsertDailyLogEquipment = z.infer<typeof insertDailyLogEquipmentSchema>;

// === RFIs (Requests for Information) ===
export const rfis = pgTable("rfis", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  rfiNumber: text("rfi_number").notNull(),
  subject: text("subject").notNull(),
  question: text("question").notNull(),
  status: text("status").notNull().default("Open"),
  priority: text("priority").default("Medium"),
  category: text("category"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  distributionList: text("distribution_list"),
  costImpact: text("cost_impact"),
  scheduleImpact: text("schedule_impact"),
  references: text("references"),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
}, (table) => [
  index("rfis_project_id_idx").on(table.projectId),
  index("rfis_org_id_idx").on(table.organizationId),
  index("rfis_assigned_to_idx").on(table.assignedTo),
  index("rfis_status_idx").on(table.status),
  uniqueIndex("rfis_project_number_unique").on(table.projectId, table.rfiNumber).where(sql`deleted_at IS NULL`),
]);

export const insertRfiSchema = createInsertSchema(rfis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
  closedAt: true,
  closedBy: true,
});
export type Rfi = typeof rfis.$inferSelect;
export type InsertRfi = z.infer<typeof insertRfiSchema>;

// === RFI Responses ===
export const rfiResponses = pgTable("rfi_responses", {
  id: serial("id").primaryKey(),
  rfiId: integer("rfi_id").references(() => rfis.id).notNull(),
  responseText: text("response_text").notNull(),
  isOfficial: boolean("is_official").default(false),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("rfi_responses_rfi_id_idx").on(table.rfiId),
]);

export const insertRfiResponseSchema = createInsertSchema(rfiResponses).omit({
  id: true,
  createdAt: true,
});
export type RfiResponse = typeof rfiResponses.$inferSelect;
export type InsertRfiResponse = z.infer<typeof insertRfiResponseSchema>;

// === Submittals ===
export const submittals = pgTable("submittals", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  submittalNumber: text("submittal_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  specSection: text("spec_section"),
  type: text("type").default("Product Data"),
  status: text("status").notNull().default("Pending"),
  priority: text("priority").default("Medium"),
  submittedBy: varchar("submitted_by").references(() => users.id),
  submittedByName: text("submitted_by_name"),
  reviewerId: varchar("reviewer_id").references(() => users.id),
  reviewerName: text("reviewer_name"),
  submitDate: date("submit_date"),
  requiredDate: date("required_date"),
  receivedDate: date("received_date"),
  reviewedDate: date("reviewed_date"),
  leadTime: integer("lead_time"),
  costImpact: text("cost_impact"),
  scheduleImpact: text("schedule_impact"),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  currentRevision: integer("current_revision").default(1),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
}, (table) => [
  index("submittals_project_id_idx").on(table.projectId),
  index("submittals_org_id_idx").on(table.organizationId),
  index("submittals_reviewer_id_idx").on(table.reviewerId),
  index("submittals_status_idx").on(table.status),
  uniqueIndex("submittals_project_number_unique").on(table.projectId, table.submittalNumber).where(sql`deleted_at IS NULL`),
]);

export const insertSubmittalSchema = createInsertSchema(submittals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
  closedAt: true,
  closedBy: true,
});
export type Submittal = typeof submittals.$inferSelect;
export type InsertSubmittal = z.infer<typeof insertSubmittalSchema>;

// === Submittal Revisions ===
export const submittalRevisions = pgTable("submittal_revisions", {
  id: serial("id").primaryKey(),
  submittalId: integer("submittal_id").references(() => submittals.id).notNull(),
  revisionNumber: integer("revision_number").notNull(),
  status: text("status").notNull().default("Pending"),
  notes: text("notes"),
  attachments: jsonb("attachments").$type<Array<{ name: string; url: string; size?: number; type?: string }>>(),
  reviewNotes: text("review_notes"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("submittal_revisions_submittal_id_idx").on(table.submittalId),
]);

export const insertSubmittalRevisionSchema = createInsertSchema(submittalRevisions).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});
export type SubmittalRevision = typeof submittalRevisions.$inferSelect;
export type InsertSubmittalRevision = z.infer<typeof insertSubmittalRevisionSchema>;

// === Drawing Sets ===
export const drawingSets = pgTable("drawing_sets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  discipline: text("discipline").default("General"),
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
}, (table) => [
  index("drawing_sets_project_id_idx").on(table.projectId),
  index("drawing_sets_org_id_idx").on(table.organizationId),
  uniqueIndex("drawing_sets_project_name_unique").on(table.projectId, table.name).where(sql`deleted_at IS NULL`),
]);

export const insertDrawingSetSchema = createInsertSchema(drawingSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
});
export type DrawingSet = typeof drawingSets.$inferSelect;
export type InsertDrawingSet = z.infer<typeof insertDrawingSetSchema>;

// === Drawings ===
export const drawings = pgTable("drawings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  drawingSetId: integer("drawing_set_id").references(() => drawingSets.id),
  drawingNumber: text("drawing_number").notNull(),
  title: text("title").notNull(),
  discipline: text("discipline").default("General"),
  status: text("status").notNull().default("Current"),
  description: text("description"),
  currentRevisionNumber: integer("current_revision_number").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
}, (table) => [
  index("drawings_project_id_idx").on(table.projectId),
  index("drawings_org_id_idx").on(table.organizationId),
  index("drawings_discipline_idx").on(table.discipline),
  index("drawings_status_idx").on(table.status),
  uniqueIndex("drawings_project_number_unique").on(table.projectId, table.drawingNumber).where(sql`deleted_at IS NULL`),
]);

export const insertDrawingSchema = createInsertSchema(drawings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
});
export type Drawing = typeof drawings.$inferSelect;
export type InsertDrawing = z.infer<typeof insertDrawingSchema>;

// === Drawing Revisions ===
export const drawingRevisions = pgTable("drawing_revisions", {
  id: serial("id").primaryKey(),
  drawingId: integer("drawing_id").references(() => drawings.id).notNull(),
  revisionNumber: integer("revision_number").notNull(),
  version: text("version"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  fileType: text("file_type"),
  thumbnailUrl: text("thumbnail_url"),
  notes: text("notes"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  uploadedByName: text("uploaded_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("drawing_revisions_drawing_id_idx").on(table.drawingId),
  uniqueIndex("drawing_revisions_drawing_rev_unique").on(table.drawingId, table.revisionNumber),
]);

export const insertDrawingRevisionSchema = createInsertSchema(drawingRevisions).omit({
  id: true,
  createdAt: true,
});
export type DrawingRevision = typeof drawingRevisions.$inferSelect;
export type InsertDrawingRevision = z.infer<typeof insertDrawingRevisionSchema>;

// === Drawing Markups ===
export const drawingMarkups = pgTable("drawing_markups", {
  id: serial("id").primaryKey(),
  revisionId: integer("revision_id").references(() => drawingRevisions.id).notNull(),
  drawingId: integer("drawing_id").references(() => drawings.id).notNull(),
  label: text("label"),
  markupData: jsonb("markup_data").$type<Array<{
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    points?: Array<{ x: number; y: number }>;
    text?: string;
    color?: string;
    strokeWidth?: number;
  }>>().notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("drawing_markups_revision_id_idx").on(table.revisionId),
  index("drawing_markups_drawing_id_idx").on(table.drawingId),
]);

export const insertDrawingMarkupSchema = createInsertSchema(drawingMarkups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type DrawingMarkup = typeof drawingMarkups.$inferSelect;
export type InsertDrawingMarkup = z.infer<typeof insertDrawingMarkupSchema>;

// === Punch List Items ===
export const punchItems = pgTable("punch_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  number: text("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  category: text("category"),
  priority: text("priority").notNull().default("Medium"),
  status: text("status").notNull().default("Open"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  assignedToName: text("assigned_to_name"),
  dueDate: date("due_date"),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
}, (table) => [
  index("punch_items_project_id_idx").on(table.projectId),
  index("punch_items_org_id_idx").on(table.organizationId),
  index("punch_items_status_idx").on(table.status),
  index("punch_items_assigned_to_idx").on(table.assignedTo),
  index("punch_items_category_idx").on(table.category),
  index("punch_items_priority_idx").on(table.priority),
]);

export const insertPunchItemSchema = createInsertSchema(punchItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  deletedBy: true,
  closedAt: true,
  closedBy: true,
});
export type PunchItem = typeof punchItems.$inferSelect;
export type InsertPunchItem = z.infer<typeof insertPunchItemSchema>;

// === Punch Item Photos ===
export const punchItemPhotos = pgTable("punch_item_photos", {
  id: serial("id").primaryKey(),
  punchItemId: integer("punch_item_id").references(() => punchItems.id).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  photoType: text("photo_type").default("general"),
  caption: text("caption"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("punch_item_photos_item_id_idx").on(table.punchItemId),
]);

export const insertPunchItemPhotoSchema = createInsertSchema(punchItemPhotos).omit({
  id: true,
  createdAt: true,
});
export type PunchItemPhoto = typeof punchItemPhotos.$inferSelect;
export type InsertPunchItemPhoto = z.infer<typeof insertPunchItemPhotoSchema>;
