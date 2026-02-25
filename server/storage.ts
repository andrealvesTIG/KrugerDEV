import { db } from "./db";
import {
  users, portfolios, projects, customPortfolioProjects, milestones, issues, tasks,
  organizations, organizationMembers, organizationInvites, organizationAccessRequests, externalShares, taskChangeLogs, taskDependencies, projectFinancials,
  projectChangeLogs, issueChangeLogs, organizationIntegrations,
  resources, taskResourceAssignments, issueResourceAssignments,
  costItems, projectIntakes, mppImports, mppImportTasks, intakeWorkflowSteps,
  changeRequests, projectDocuments, projectComments, notifications, statusReportHistory, healthStatusHistory,
  billingTransactions, timesheetEntries, billableStatusComments, projectViews, systemProjectViews,
  magicLinkTokens,
  type User, type UpsertUser,
  type BillingTransaction, type InsertBillingTransaction,
  type Organization, type InsertOrganization,
  type OrganizationMember, type InsertOrganizationMember,
  type OrganizationInvite, type InsertOrganizationInvite,
  type OrganizationAccessRequest, type InsertOrganizationAccessRequest,
  type ExternalShare, type InsertExternalShare,
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
  type ChangeRequest, type InsertChangeRequest, type UpdateChangeRequestRequest,
  type ProjectDocument, type InsertProjectDocument, type UpdateProjectDocumentRequest,
  type ProjectComment, type InsertProjectComment,
  type BillableStatusComment, type InsertBillableStatusComment,
  type HealthStatusHistory, type InsertHealthStatusHistory,
  type ProjectInvoice, type InsertProjectInvoice,
  type InvoiceNote, type InsertInvoiceNote,
  projectInvoices, invoiceNotes,
  type Notification, type InsertNotification,
  type StatusReportHistory, type InsertStatusReportHistory,
  type IntakeWorkflowStep, type InsertIntakeWorkflowStep,
  type TimesheetEntry, type InsertTimesheetEntry, type UpdateTimesheetEntryRequest,
  timeCategories, type TimeCategory, type InsertTimeCategory,
  nonProjectTimeEntries, type NonProjectTimeEntry, type InsertNonProjectTimeEntry,
  timesheetPeriods, type TimesheetPeriod, type InsertTimesheetPeriod,
  type RecycleBinItem, type RecycleBinItemType,
  type ProjectView, type InsertProjectView, type UpdateProjectViewRequest,
  type SystemProjectView, type InsertSystemProjectView, type UpdateSystemProjectViewRequest,
  userConsents, type UserConsent, type InsertUserConsent,
  customFieldDefinitions, type CustomFieldDefinition, type InsertCustomFieldDefinition, type UpdateCustomFieldDefinitionRequest,
  projectCustomFieldValues, type ProjectCustomFieldValue, type InsertProjectCustomFieldValue,
  customProjectTabs, type CustomProjectTab, type InsertCustomProjectTab,
  customTabSections, type CustomTabSection, type InsertCustomTabSection,
  customTabFields, type CustomTabField, type InsertCustomTabField,
  projectScoringCriteria, type ProjectScoringCriteria, type InsertProjectScoringCriteria,
  projectScores, type ProjectScore, type InsertProjectScore,
  projectBenefits, type ProjectBenefit, type InsertProjectBenefit,
  projectDecisions, type ProjectDecision, type InsertProjectDecision,
  lessonsLearned, type LessonLearned, type InsertLessonLearned,
  resourceSkills, type ResourceSkill, type InsertResourceSkill,
  resourceAvailability, type ResourceAvailability, type InsertResourceAvailability,
  portfolioRiskAssessments, type PortfolioRiskAssessment, type InsertPortfolioRiskAssessment,
  projectRiskAssessments, type ProjectRiskAssessment, type InsertProjectRiskAssessment,
  customDashboards, apiRequestLogs, userActivityLogs, featureUsageLogs,
  errorLogs, helpTickets, simulationRuns, reportSubscriptions
} from "@shared/schema";
import { eq, and, desc, asc, or, ilike, sql, isNull, isNotNull, inArray, notInArray } from "drizzle-orm";
import { 
  billingAuditLogs, 
  subscriptions, 
  seatAssignments, 
  usageEvents,
  resourceCreditCosts,
  referralCodes,
  referrals,
  referralPayouts 
} from "@shared/models/billing";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByApiKey(apiKey: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  // Organizations
  getOrganizations(): Promise<Organization[]>;
  getDeactivatedOrganizations(): Promise<Organization[]>;
  getAllOrganizations(): Promise<Organization[]>; // Including deactivated
  getOrganization(id: number): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, updates: Partial<InsertOrganization>): Promise<Organization>;
  deactivateOrganization(id: number, deactivatedBy: string): Promise<Organization>;
  reactivateOrganization(id: number): Promise<Organization>;
  deleteOrganization(id: number): Promise<void>;
  
  // Organization Members
  getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]>;
  getUserOrganizations(userId: string): Promise<OrganizationMember[]>;
  addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  updateOrganizationMemberRole(organizationId: number, userId: string, role: string): Promise<OrganizationMember>;
  removeOrganizationMember(organizationId: number, userId: string): Promise<void>;

  // Organization Invites
  getOrganizationInvites(organizationId: number): Promise<OrganizationInvite[]>;
  getPendingInvitesByEmail(email: string): Promise<OrganizationInvite[]>;
  createOrganizationInvite(invite: InsertOrganizationInvite): Promise<OrganizationInvite>;
  cancelOrganizationInvite(id: number): Promise<void>;
  claimInvitesForUser(email: string, userId: string): Promise<OrganizationMember[]>;

  // Organization Access Requests
  getOrganizationAccessRequests(organizationId: number): Promise<OrganizationAccessRequest[]>;
  getPendingAccessRequestByUser(organizationId: number, userId: string): Promise<OrganizationAccessRequest | undefined>;
  createOrganizationAccessRequest(request: InsertOrganizationAccessRequest): Promise<OrganizationAccessRequest>;
  updateAccessRequestStatus(id: number, status: string, reviewedBy: string): Promise<OrganizationAccessRequest>;

  // Organization Integrations
  getOrganizationIntegrations(organizationId: number): Promise<{ id: number; organizationId: number; integrationType: string; connectionStatus: string | null }[]>;

  // External Shares - Cross-organization object sharing
  getExternalSharesForUser(userId: string): Promise<ExternalShare[]>;
  getExternalSharesForObject(objectType: string, objectId: number): Promise<ExternalShare[]>;
  createExternalShare(share: InsertExternalShare): Promise<ExternalShare>;
  revokeExternalShare(id: number): Promise<void>;
  getExternalShare(objectType: string, objectId: number, userId: string): Promise<ExternalShare | undefined>;

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
  getAllMilestones(): Promise<Milestone[]>;
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
  getTasksByProject(projectId: number): Promise<Task[]>;
  getAllTasks(): Promise<Task[]>;
  getTasksByOrganizationPaginated(organizationId: number, limit: number, offset: number, onlyTaskIds?: number[]): Promise<{ tasks: Task[]; total: number }>;
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
  getRecentOrgActivity(organizationId: number, limit: number): Promise<{ type: string; entityName: string; entityId: number; action: string; summary: string; changedBy: string; changedAt: Date | null }[]>;

  // Task Dependencies
  getTaskDependencies(taskId: number): Promise<TaskDependency[]>;
  getTaskDependents(taskId: number): Promise<TaskDependency[]>;
  getProjectDependencies(projectId: number): Promise<TaskDependency[]>;
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
    intakes: number;
    resources: number;
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
  mergeResources(primaryId: number, secondaryId: number): Promise<Resource>;

  // Resource Skills
  getResourceSkills(resourceId: number): Promise<ResourceSkill[]>;
  getResourceSkillsByOrg(organizationId: number): Promise<ResourceSkill[]>;
  addResourceSkill(skill: InsertResourceSkill): Promise<ResourceSkill>;
  removeResourceSkill(id: number): Promise<void>;
  updateResourceSkill(id: number, updates: Partial<InsertResourceSkill>): Promise<ResourceSkill>;

  // Resource Availability (time-off, leave)
  getResourceAvailability(resourceId: number): Promise<ResourceAvailability[]>;
  getResourceAvailabilityByOrg(organizationId: number, startDate?: string, endDate?: string): Promise<ResourceAvailability[]>;
  addResourceAvailability(entry: InsertResourceAvailability): Promise<ResourceAvailability>;
  updateResourceAvailability(id: number, updates: Partial<InsertResourceAvailability>): Promise<ResourceAvailability>;
  removeResourceAvailability(id: number): Promise<void>;

  // Task Resource Assignments
  getTaskResourceAssignments(taskId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  getProjectTaskResourceAssignments(projectId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  getAllTaskResourceAssignments(organizationId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  getAssignedTasksForResource(resourceId: number, organizationId: number, userId?: string): Promise<{ task: Task; project: Project }[]>;
  addTaskResourceAssignment(assignment: InsertTaskResourceAssignment): Promise<TaskResourceAssignment>;
  removeTaskResourceAssignment(taskId: number, resourceId: number): Promise<void>;
  updateTaskResourceAssignments(taskId: number, resourceIds: number[], allocations?: { resourceId: number; allocationPercentage: number }[]): Promise<void>;

  // Issue Resource Assignments
  getIssueResourceAssignments(issueId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]>;
  getAllIssueResourceAssignments(organizationId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]>;
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

  // Change Requests
  getChangeRequests(projectId: number): Promise<ChangeRequest[]>;
  getChangeRequest(id: number): Promise<ChangeRequest | undefined>;
  createChangeRequest(changeRequest: InsertChangeRequest): Promise<ChangeRequest>;
  updateChangeRequest(id: number, updates: UpdateChangeRequestRequest): Promise<ChangeRequest>;
  deleteChangeRequest(id: number): Promise<void>;

  // Project Documents
  getProjectDocuments(projectId: number): Promise<ProjectDocument[]>;
  getProjectDocument(id: number): Promise<ProjectDocument | undefined>;
  createProjectDocument(document: InsertProjectDocument): Promise<ProjectDocument>;
  updateProjectDocument(id: number, updates: UpdateProjectDocumentRequest): Promise<ProjectDocument>;
  deleteProjectDocument(id: number): Promise<void>;

  // Project Comments
  getProjectComments(projectId: number): Promise<ProjectComment[]>;
  getProjectComment(id: number): Promise<ProjectComment | undefined>;
  createProjectComment(comment: InsertProjectComment): Promise<ProjectComment>;
  deleteProjectComment(id: number): Promise<void>;

  // Billable Status Comments
  getBillableStatusComments(projectId: number): Promise<BillableStatusComment[]>;
  createBillableStatusComment(comment: InsertBillableStatusComment): Promise<BillableStatusComment>;

  // Health Status History
  getHealthStatusHistory(projectId: number): Promise<HealthStatusHistory[]>;
  createHealthStatusHistory(entry: InsertHealthStatusHistory): Promise<HealthStatusHistory>;

  // Project Invoices
  getProjectInvoices(projectId: number): Promise<ProjectInvoice[]>;
  getOrganizationInvoices(organizationId: number): Promise<ProjectInvoice[]>;
  getProjectInvoice(id: number): Promise<ProjectInvoice | undefined>;
  getProjectInvoiceByExternalId(externalId: string, organizationId: number, source: string): Promise<ProjectInvoice | undefined>;
  createProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice>;
  upsertProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice>;
  updateProjectInvoice(id: number, updates: Partial<InsertProjectInvoice>): Promise<ProjectInvoice>;
  deleteProjectInvoice(id: number): Promise<void>;

  // Invoice Notes
  getInvoiceNotes(invoiceId: number): Promise<InvoiceNote[]>;
  createInvoiceNote(note: InsertInvoiceNote): Promise<InvoiceNote>;

  // Project Views
  getProjectViews(organizationId: number, userId: string, mode: string): Promise<ProjectView[]>;
  getProjectView(id: number): Promise<ProjectView | undefined>;
  createProjectView(view: InsertProjectView): Promise<ProjectView>;
  updateProjectView(id: number, updates: UpdateProjectViewRequest): Promise<ProjectView>;
  deleteProjectView(id: number): Promise<void>;
  setDefaultProjectView(organizationId: number, userId: string, mode: string, viewId: number): Promise<void>;

  // System Project Views (Admin-managed org-level views)
  getSystemProjectViews(organizationId: number, mode: string): Promise<SystemProjectView[]>;
  getSystemProjectView(id: number): Promise<SystemProjectView | undefined>;
  createSystemProjectView(view: InsertSystemProjectView): Promise<SystemProjectView>;
  updateSystemProjectView(id: number, updates: UpdateSystemProjectViewRequest): Promise<SystemProjectView>;
  deleteSystemProjectView(id: number): Promise<void>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Status Report History
  getStatusReportHistory(projectId: number): Promise<StatusReportHistory[]>;
  getStatusReportHistoryByOrg(organizationId: number): Promise<StatusReportHistory[]>;
  createStatusReportHistory(report: InsertStatusReportHistory): Promise<StatusReportHistory>;

  // Intake Workflow Steps
  getIntakeWorkflowSteps(organizationId: number): Promise<IntakeWorkflowStep[]>;
  upsertIntakeWorkflowSteps(organizationId: number, steps: InsertIntakeWorkflowStep[]): Promise<IntakeWorkflowStep[]>;
  resetIntakeWorkflowToDefaults(organizationId: number): Promise<IntakeWorkflowStep[]>;

  // Billing Transactions
  getBillingTransactions(userId?: string, orgId?: number, limit?: number, offset?: number): Promise<BillingTransaction[]>;
  getBillingTransaction(id: number): Promise<BillingTransaction | undefined>;
  createBillingTransaction(transaction: InsertBillingTransaction): Promise<BillingTransaction>;

  // Timesheet Entries
  getTimesheetEntries(userId: string, organizationId: number, startDate: string, endDate: string): Promise<TimesheetEntry[]>;
  getTimesheetEntriesWithDetails(userId: string, organizationId: number, startDate: string, endDate: string): Promise<{ entry: TimesheetEntry; task: Task; project: Project }[]>;
  getAllTimesheetEntriesWithDetails(organizationId: number, startDate: string, endDate: string): Promise<{ entry: TimesheetEntry; task: Task; project: Project }[]>;
  getTimesheetHoursByTaskIds(taskIds: number[]): Promise<Map<number, number>>;
  getTimesheetEntriesForApproval(organizationId: number, status?: string): Promise<TimesheetEntry[]>;
  getTimesheetEntry(id: number): Promise<TimesheetEntry | undefined>;
  findTimesheetEntry(resourceId: number, taskId: number, entryDate: string): Promise<TimesheetEntry | undefined>;
  createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntry>;
  updateTimesheetEntry(id: number, updates: UpdateTimesheetEntryRequest): Promise<TimesheetEntry>;
  deleteTimesheetEntry(id: number): Promise<void>;
  submitTimesheetWeek(userId: string, organizationId: number, startDate: string, endDate: string): Promise<void>;
  approveTimesheetEntry(id: number, approvedBy: string): Promise<TimesheetEntry>;
  bulkApproveTimesheetEntries(ids: number[], approvedBy: string, organizationId: number): Promise<TimesheetEntry[]>;
  rejectTimesheetEntry(id: number, rejectionReason: string): Promise<TimesheetEntry>;

  // Time Categories (non-project time types)
  getTimeCategories(organizationId: number): Promise<TimeCategory[]>;
  getTimeCategory(id: number): Promise<TimeCategory | undefined>;
  createTimeCategory(category: InsertTimeCategory): Promise<TimeCategory>;
  updateTimeCategory(id: number, updates: Partial<InsertTimeCategory>): Promise<TimeCategory>;
  deleteTimeCategory(id: number): Promise<void>;

  // Non-Project Time Entries
  getNonProjectTimeEntry(id: number): Promise<NonProjectTimeEntry | undefined>;
  getNonProjectTimeEntries(userId: string, organizationId: number, startDate: string, endDate: string): Promise<NonProjectTimeEntry[]>;
  getNonProjectTimeEntriesWithCategory(userId: string, organizationId: number, startDate: string, endDate: string): Promise<{ entry: NonProjectTimeEntry; category: TimeCategory }[]>;
  createNonProjectTimeEntry(entry: InsertNonProjectTimeEntry): Promise<NonProjectTimeEntry>;
  updateNonProjectTimeEntry(id: number, updates: Partial<InsertNonProjectTimeEntry>): Promise<NonProjectTimeEntry>;
  deleteNonProjectTimeEntry(id: number): Promise<void>;

  // Timesheet Periods (for closing/locking time periods)
  getTimesheetPeriods(organizationId: number): Promise<TimesheetPeriod[]>;
  getTimesheetPeriod(id: number): Promise<TimesheetPeriod | undefined>;
  getClosedPeriodsForDateRange(organizationId: number, startDate: string, endDate: string): Promise<TimesheetPeriod[]>;
  createTimesheetPeriod(period: InsertTimesheetPeriod): Promise<TimesheetPeriod>;
  closeTimesheetPeriod(id: number, closedBy: string): Promise<TimesheetPeriod>;
  reopenTimesheetPeriod(id: number, reopenedBy: string): Promise<TimesheetPeriod>;
  deleteTimesheetPeriod(id: number): Promise<void>;

  // User Consents
  getUserConsents(userId: string): Promise<UserConsent[]>;
  getUserConsentByType(userId: string, consentType: string): Promise<UserConsent | undefined>;
  createUserConsent(consent: InsertUserConsent): Promise<UserConsent>;
  revokeUserConsent(id: number): Promise<UserConsent>;
  getAllUserConsents(limit?: number, offset?: number): Promise<UserConsent[]>;
  getUserConsentStats(): Promise<{ consentType: string; version: string; count: number }[]>;

  // Custom Field Definitions
  getCustomFieldDefinitions(organizationId: number): Promise<CustomFieldDefinition[]>;
  getCustomFieldDefinition(id: number): Promise<CustomFieldDefinition | undefined>;
  createCustomFieldDefinition(field: InsertCustomFieldDefinition): Promise<CustomFieldDefinition>;
  updateCustomFieldDefinition(id: number, updates: UpdateCustomFieldDefinitionRequest): Promise<CustomFieldDefinition>;
  deleteCustomFieldDefinition(id: number): Promise<void>;

  // Project Custom Field Values
  getProjectCustomFieldValues(projectId: number): Promise<ProjectCustomFieldValue[]>;
  getProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<ProjectCustomFieldValue | undefined>;
  upsertProjectCustomFieldValue(value: InsertProjectCustomFieldValue): Promise<ProjectCustomFieldValue>;
  deleteProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<void>;

  // Custom Project Tabs
  getCustomProjectTabs(organizationId: number): Promise<CustomProjectTab[]>;
  getCustomProjectTab(id: number): Promise<CustomProjectTab | undefined>;
  createCustomProjectTab(tab: InsertCustomProjectTab): Promise<CustomProjectTab>;
  updateCustomProjectTab(id: number, updates: Partial<InsertCustomProjectTab>): Promise<CustomProjectTab>;
  deleteCustomProjectTab(id: number): Promise<void>;

  // Custom Tab Sections
  getCustomTabSections(tabId: number): Promise<CustomTabSection[]>;
  getCustomTabSection(id: number): Promise<CustomTabSection | undefined>;
  createCustomTabSection(section: InsertCustomTabSection): Promise<CustomTabSection>;
  updateCustomTabSection(id: number, updates: Partial<InsertCustomTabSection>): Promise<CustomTabSection>;
  deleteCustomTabSection(id: number): Promise<void>;

  // Custom Tab Fields
  getCustomTabFields(sectionId: number): Promise<CustomTabField[]>;
  getCustomTabField(id: number): Promise<CustomTabField | undefined>;
  createCustomTabField(field: InsertCustomTabField): Promise<CustomTabField>;
  updateCustomTabField(id: number, updates: Partial<InsertCustomTabField>): Promise<CustomTabField>;
  deleteCustomTabField(id: number): Promise<void>;

  // Full tab with sections and fields
  getFullCustomProjectTab(tabId: number): Promise<{ tab: CustomProjectTab; sections: (CustomTabSection & { fields: CustomTabField[] })[] } | undefined>;

  // Portfolio Risk Assessments
  createPortfolioRiskAssessment(assessment: InsertPortfolioRiskAssessment): Promise<PortfolioRiskAssessment>;
  getLatestPortfolioRiskAssessment(portfolioId: number): Promise<PortfolioRiskAssessment | undefined>;
  getLatestRiskAssessmentsForOrg(organizationId: number): Promise<PortfolioRiskAssessment[]>;
  getPortfolioRiskAssessmentByShareToken(shareToken: string): Promise<PortfolioRiskAssessment | undefined>;
  getPortfolioRiskAssessmentHistory(portfolioId: number): Promise<Pick<PortfolioRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]>;

  // Project Risk Assessments
  createProjectRiskAssessment(assessment: InsertProjectRiskAssessment): Promise<ProjectRiskAssessment>;
  getLatestProjectRiskAssessment(projectId: number): Promise<ProjectRiskAssessment | undefined>;
  getLatestProjectRiskAssessmentsForOrg(organizationId: number): Promise<ProjectRiskAssessment[]>;
  getProjectRiskAssessmentByShareToken(shareToken: string): Promise<ProjectRiskAssessment | undefined>;
  getProjectRiskAssessmentHistory(projectId: number): Promise<Pick<ProjectRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]>;
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

  async getUserByApiKey(apiKey: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.apiKey, apiKey));
    return user;
  }

  async createUser(insertUser: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<UpsertUser>): Promise<User> {
    const [user] = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    // Remove foreign key references before deleting user
    // 1. Unlink resources (set userId to null since it's nullable)
    await db.update(resources).set({ userId: null }).where(eq(resources.userId, id));
    await db.update(resources).set({ managerId: null }).where(eq(resources.managerId, id));
    await db.update(resources).set({ deletedBy: null }).where(eq(resources.deletedBy, id));
    // 2. Delete notifications for this user
    await db.delete(notifications).where(or(eq(notifications.userId, id), eq(notifications.fromUserId, id)));
    // 3. Delete organization access requests
    await db.delete(organizationAccessRequests).where(eq(organizationAccessRequests.userId, id));
    // 4. Delete organization memberships
    await db.delete(organizationMembers).where(eq(organizationMembers.userId, id));
    // 5. Handle organizations owned by this user - set ownerId to null
    await db.update(organizations).set({ ownerId: null }).where(eq(organizations.ownerId, id));
    await db.update(organizations).set({ deactivatedBy: null }).where(eq(organizations.deactivatedBy, id));
    // 6. Nullify user references in portfolios
    await db.update(portfolios).set({ managerId: null }).where(eq(portfolios.managerId, id));
    await db.update(portfolios).set({ businessOwnerId: null }).where(eq(portfolios.businessOwnerId, id));
    await db.update(portfolios).set({ createdBy: null }).where(eq(portfolios.createdBy, id));
    await db.update(portfolios).set({ deletedBy: null }).where(eq(portfolios.deletedBy, id));
    // 7. Nullify user references in projects
    await db.update(projects).set({ managerId: null }).where(eq(projects.managerId, id));
    await db.update(projects).set({ businessSponsorId: null }).where(eq(projects.businessSponsorId, id));
    await db.update(projects).set({ businessOwnerId: null }).where(eq(projects.businessOwnerId, id));
    await db.update(projects).set({ technicalLeadId: null }).where(eq(projects.technicalLeadId, id));
    await db.update(projects).set({ deletedBy: null }).where(eq(projects.deletedBy, id));
    await db.update(projects).set({ createdBy: null }).where(eq(projects.createdBy, id));
    await db.update(projects).set({ updatedBy: null }).where(eq(projects.updatedBy, id));
    await db.update(projects).set({ completedBy: null }).where(eq(projects.completedBy, id));
    // 8. Nullify user references in risks (now stored in issues table with ownerId and reviewerId)
    await db.update(issues).set({ ownerId: null }).where(and(eq(issues.ownerId, id), eq(issues.itemType, 'risk')));
    await db.update(issues).set({ reviewerId: null }).where(and(eq(issues.reviewerId, id), eq(issues.itemType, 'risk')));
    await db.update(issues).set({ escalatedBy: null }).where(eq(issues.escalatedBy, id));
    // 9. Nullify user references in milestones
    await db.update(milestones).set({ ownerId: null }).where(eq(milestones.ownerId, id));
    await db.update(milestones).set({ deletedBy: null }).where(eq(milestones.deletedBy, id));
    // 10. Nullify user references in issues
    await db.update(issues).set({ assigneeId: null }).where(eq(issues.assigneeId, id));
    await db.update(issues).set({ reporterId: null }).where(eq(issues.reporterId, id));
    await db.update(issues).set({ deletedBy: null }).where(eq(issues.deletedBy, id));
    // 11. Nullify user references in tasks
    await db.update(tasks).set({ ownerId: null }).where(eq(tasks.ownerId, id));
    await db.update(tasks).set({ deletedBy: null }).where(eq(tasks.deletedBy, id));
    // 12. Nullify user references in status report history
    await db.update(statusReportHistory).set({ createdBy: null }).where(eq(statusReportHistory.createdBy, id));
    // 13. Nullify user references in project intakes
    await db.update(projectIntakes).set({ submitterId: null }).where(eq(projectIntakes.submitterId, id));
    await db.update(projectIntakes).set({ pmoApprovedBy: null }).where(eq(projectIntakes.pmoApprovedBy, id));
    await db.update(projectIntakes).set({ securityApproverId: null }).where(eq(projectIntakes.securityApproverId, id));
    await db.update(projectIntakes).set({ approvedBy: null }).where(eq(projectIntakes.approvedBy, id));
    await db.update(projectIntakes).set({ rejectedBy: null }).where(eq(projectIntakes.rejectedBy, id));
    await db.update(projectIntakes).set({ deletedBy: null }).where(eq(projectIntakes.deletedBy, id));
    // 14. Nullify user references in change log tables
    await db.update(projectChangeLogs).set({ changedBy: null }).where(eq(projectChangeLogs.changedBy, id));
    await db.update(issueChangeLogs).set({ changedBy: null }).where(eq(issueChangeLogs.changedBy, id));
    await db.update(taskChangeLogs).set({ changedBy: null }).where(eq(taskChangeLogs.changedBy, id));
    // 15. Delete timesheet entries for this user
    await db.delete(timesheetEntries).where(eq(timesheetEntries.userId, id));
    // 16. Nullify timesheet approvedBy references
    await db.update(timesheetEntries).set({ approvedBy: null }).where(eq(timesheetEntries.approvedBy, id));
    // 17. Nullify project comments author
    await db.update(projectComments).set({ authorId: null }).where(eq(projectComments.authorId, id));
    // 18. Nullify billable status comments userId
    await db.update(billableStatusComments).set({ userId: null }).where(eq(billableStatusComments.userId, id));
    // 19. Nullify organization invites invitedBy
    await db.update(organizationInvites).set({ invitedBy: null }).where(eq(organizationInvites.invitedBy, id));
    // 20. Nullify organization access requests reviewedBy
    await db.update(organizationAccessRequests).set({ reviewedBy: null }).where(eq(organizationAccessRequests.reviewedBy, id));
    // 21. Nullify mpp imports importedBy
    await db.update(mppImports).set({ importedBy: null }).where(eq(mppImports.importedBy, id));
    // 22. Nullify change requests deletedBy
    await db.update(changeRequests).set({ deletedBy: null }).where(eq(changeRequests.deletedBy, id));
    // 23. Nullify project documents deletedBy
    await db.update(projectDocuments).set({ deletedBy: null }).where(eq(projectDocuments.deletedBy, id));
    // 24. Nullify billing audit logs actorUserId
    await db.update(billingAuditLogs).set({ actorUserId: null }).where(eq(billingAuditLogs.actorUserId, id));
    // 25. Nullify subscriptions userId
    await db.update(subscriptions).set({ userId: null }).where(eq(subscriptions.userId, id));
    // 26. Delete seat assignments for this user
    await db.delete(seatAssignments).where(eq(seatAssignments.userId, id));
    // 27. Nullify usage events actorUserId
    await db.update(usageEvents).set({ actorUserId: null }).where(eq(usageEvents.actorUserId, id));
    // 28. Nullify resource credit costs updatedBy
    await db.update(resourceCreditCosts).set({ updatedBy: null }).where(eq(resourceCreditCosts.updatedBy, id));
    // 29. Handle referral program - delete referral payouts first
    await db.delete(referralPayouts).where(eq(referralPayouts.userId, id));
    // 30. Nullify referrals referredUserId (where this user was referred)
    await db.update(referrals).set({ referredUserId: null }).where(eq(referrals.referredUserId, id));
    // 31. Delete referrals where this user is the referrer
    await db.delete(referrals).where(eq(referrals.referrerId, id));
    // 32. Delete referral codes for this user
    await db.delete(referralCodes).where(eq(referralCodes.userId, id));
    // 33. Nullify billing transactions userId
    await db.update(billingTransactions).set({ userId: null }).where(eq(billingTransactions.userId, id));
    // 34. Delete magic link tokens for this user's email
    const user = await this.getUser(id);
    if (user) {
      await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, user.email));
    }
    // 35. Delete external shares where this user is either the recipient or the sharer
    try {
      await db.delete(externalShares).where(eq(externalShares.sharedWithUserId, id));
      await db.delete(externalShares).where(eq(externalShares.sharedBy, id));
    } catch (err) {
      // Table may not exist, ignore the error
    }
    // 36. Delete non-project time entries for this user (userId is NOT NULL)
    await db.delete(nonProjectTimeEntries).where(eq(nonProjectTimeEntries.userId, id));
    await db.update(nonProjectTimeEntries).set({ approvedBy: null }).where(eq(nonProjectTimeEntries.approvedBy, id));
    await db.update(nonProjectTimeEntries).set({ deletedBy: null }).where(eq(nonProjectTimeEntries.deletedBy, id));
    // 37. Nullify timesheet periods user references
    await db.update(timesheetPeriods).set({ closedBy: null }).where(eq(timesheetPeriods.closedBy, id));
    await db.update(timesheetPeriods).set({ reopenedBy: null }).where(eq(timesheetPeriods.reopenedBy, id));
    await db.update(timesheetPeriods).set({ createdBy: null }).where(eq(timesheetPeriods.createdBy, id));
    // 38. Nullify project invoices user references
    await db.update(projectInvoices).set({ createdBy: null }).where(eq(projectInvoices.createdBy, id));
    await db.update(projectInvoices).set({ deletedBy: null }).where(eq(projectInvoices.deletedBy, id));
    // 39. Nullify invoice notes userId
    await db.update(invoiceNotes).set({ userId: null }).where(eq(invoiceNotes.userId, id));
    // 40. Delete custom dashboards for this user (userId is NOT NULL)
    await db.delete(customDashboards).where(eq(customDashboards.userId, id));
    // 41. Delete project views for this user (userId is NOT NULL)
    await db.delete(projectViews).where(eq(projectViews.userId, id));
    // 42. Nullify system project views user references
    await db.update(systemProjectViews).set({ createdBy: null }).where(eq(systemProjectViews.createdBy, id));
    await db.update(systemProjectViews).set({ updatedBy: null }).where(eq(systemProjectViews.updatedBy, id));
    // 43. Delete user consents (userId is NOT NULL)
    await db.delete(userConsents).where(eq(userConsents.userId, id));
    // 44. Nullify custom project tabs createdBy
    await db.update(customProjectTabs).set({ createdBy: null }).where(eq(customProjectTabs.createdBy, id));
    // 45. Nullify project scoring criteria createdBy
    await db.update(projectScoringCriteria).set({ createdBy: null }).where(eq(projectScoringCriteria.createdBy, id));
    // 46. Nullify project scores scoredBy
    await db.update(projectScores).set({ scoredBy: null }).where(eq(projectScores.scoredBy, id));
    // 47. Nullify project benefits user references
    await db.update(projectBenefits).set({ owner: null }).where(eq(projectBenefits.owner, id));
    await db.update(projectBenefits).set({ createdBy: null }).where(eq(projectBenefits.createdBy, id));
    // 48. Nullify project decisions user references
    await db.update(projectDecisions).set({ decisionMaker: null }).where(eq(projectDecisions.decisionMaker, id));
    await db.update(projectDecisions).set({ createdBy: null }).where(eq(projectDecisions.createdBy, id));
    // 49. Nullify lessons learned user references
    await db.update(lessonsLearned).set({ identifiedBy: null }).where(eq(lessonsLearned.identifiedBy, id));
    await db.update(lessonsLearned).set({ reviewedBy: null }).where(eq(lessonsLearned.reviewedBy, id));
    await db.update(lessonsLearned).set({ createdBy: null }).where(eq(lessonsLearned.createdBy, id));
    // 50. Nullify API request logs userId
    await db.update(apiRequestLogs).set({ userId: null }).where(eq(apiRequestLogs.userId, id));
    // 51. Delete user activity logs (userId is NOT NULL)
    await db.delete(userActivityLogs).where(eq(userActivityLogs.userId, id));
    // 52. Nullify feature usage logs userId
    await db.update(featureUsageLogs).set({ userId: null }).where(eq(featureUsageLogs.userId, id));
    // 53. Nullify error logs userId
    await db.update(errorLogs).set({ userId: null }).where(eq(errorLogs.userId, id));
    // 54. Delete help tickets for this user (userId is NOT NULL)
    await db.delete(helpTickets).where(eq(helpTickets.userId, id));
    await db.update(helpTickets).set({ assignedTo: null }).where(eq(helpTickets.assignedTo, id));
    // 55. Nullify simulation runs createdBy
    await db.update(simulationRuns).set({ createdBy: null }).where(eq(simulationRuns.createdBy, id));
    // 56. Delete report subscriptions for this user (userId is NOT NULL)
    await db.delete(reportSubscriptions).where(eq(reportSubscriptions.userId, id));
    // 57. Nullify resource availability createdBy
    await db.update(resourceAvailability).set({ createdBy: null }).where(eq(resourceAvailability.createdBy, id));
    // 58. Finally delete the user
    await db.delete(users).where(eq(users.id, id));
  }

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations).where(isNull(organizations.deactivatedAt));
  }

  async getDeactivatedOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations).where(isNotNull(organizations.deactivatedAt));
  }

  async getAllOrganizations(): Promise<Organization[]> {
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

  async deactivateOrganization(id: number, deactivatedBy: string): Promise<Organization> {
    const [updated] = await db.update(organizations)
      .set({ deactivatedAt: new Date(), deactivatedBy })
      .where(eq(organizations.id, id))
      .returning();
    return updated;
  }

  async reactivateOrganization(id: number): Promise<Organization> {
    const [updated] = await db.update(organizations)
      .set({ deactivatedAt: null, deactivatedBy: null })
      .where(eq(organizations.id, id))
      .returning();
    return updated;
  }

  async deleteOrganization(id: number): Promise<void> {
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, id));
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

  // Organization Invites
  async getOrganizationInvites(organizationId: number): Promise<OrganizationInvite[]> {
    return await db.select().from(organizationInvites)
      .where(eq(organizationInvites.organizationId, organizationId))
      .orderBy(desc(organizationInvites.createdAt));
  }

  async getPendingInvitesByEmail(email: string): Promise<OrganizationInvite[]> {
    return await db.select().from(organizationInvites)
      .where(and(
        eq(organizationInvites.email, email.toLowerCase()),
        eq(organizationInvites.status, "pending")
      ));
  }

  async createOrganizationInvite(invite: InsertOrganizationInvite): Promise<OrganizationInvite> {
    const [created] = await db.insert(organizationInvites)
      .values({ ...invite, email: invite.email.toLowerCase() })
      .returning();
    return created;
  }

  async cancelOrganizationInvite(id: number): Promise<void> {
    await db.update(organizationInvites)
      .set({ status: "cancelled" })
      .where(eq(organizationInvites.id, id));
  }

  async getOrganizationInviteByToken(token: string): Promise<OrganizationInvite | undefined> {
    const [invite] = await db.select().from(organizationInvites)
      .where(eq(organizationInvites.token, token));
    return invite;
  }

  async getOrganizationInviteById(id: number): Promise<OrganizationInvite | undefined> {
    const [invite] = await db.select().from(organizationInvites)
      .where(eq(organizationInvites.id, id));
    return invite;
  }

  async acceptOrganizationInvite(id: number, userId: string): Promise<OrganizationMember | null> {
    const invite = await this.getOrganizationInviteById(id);
    if (!invite || invite.status !== "pending") {
      return null;
    }

    // Check if already a member
    const existingMember = await db.select().from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, invite.organizationId),
        eq(organizationMembers.userId, userId)
      ));

    if (existingMember.length > 0) {
      // Already a member, just mark invite as accepted
      await db.update(organizationInvites)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(organizationInvites.id, id));
      return existingMember[0];
    }

    // Add user to organization
    const [member] = await db.insert(organizationMembers)
      .values({
        organizationId: invite.organizationId,
        userId: userId,
        role: invite.role
      })
      .returning();

    // Mark invite as accepted
    await db.update(organizationInvites)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(organizationInvites.id, id));

    return member;
  }

  async resendOrganizationInvite(id: number, newToken: string, newExpiresAt: Date): Promise<OrganizationInvite | null> {
    const [updated] = await db.update(organizationInvites)
      .set({ token: newToken, expiresAt: newExpiresAt })
      .where(eq(organizationInvites.id, id))
      .returning();
    return updated || null;
  }

  async claimInvitesForUser(email: string, userId: string): Promise<OrganizationMember[]> {
    const pendingInvites = await this.getPendingInvitesByEmail(email);
    const claimedMembers: OrganizationMember[] = [];

    for (const invite of pendingInvites) {
      const existingMember = await db.select().from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.userId, userId)
        ));

      if (existingMember.length === 0) {
        const [member] = await db.insert(organizationMembers)
          .values({
            organizationId: invite.organizationId,
            userId: userId,
            role: invite.role
          })
          .returning();
        claimedMembers.push(member);
      }

      await db.update(organizationInvites)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(organizationInvites.id, invite.id));
    }

    return claimedMembers;
  }

  // Organization Access Requests
  async getOrganizationAccessRequests(organizationId: number): Promise<OrganizationAccessRequest[]> {
    return await db.select().from(organizationAccessRequests)
      .where(eq(organizationAccessRequests.organizationId, organizationId))
      .orderBy(desc(organizationAccessRequests.createdAt));
  }

  async getOrganizationIntegrations(organizationId: number) {
    return await db.select().from(organizationIntegrations)
      .where(eq(organizationIntegrations.organizationId, organizationId));
  }

  async getPendingAccessRequestByUser(organizationId: number, userId: string): Promise<OrganizationAccessRequest | undefined> {
    const [request] = await db.select().from(organizationAccessRequests)
      .where(and(
        eq(organizationAccessRequests.organizationId, organizationId),
        eq(organizationAccessRequests.userId, userId),
        eq(organizationAccessRequests.status, "pending")
      ));
    return request;
  }

  async createOrganizationAccessRequest(request: InsertOrganizationAccessRequest): Promise<OrganizationAccessRequest> {
    const [created] = await db.insert(organizationAccessRequests)
      .values(request)
      .returning();
    return created;
  }

  async updateAccessRequestStatus(id: number, status: string, reviewedBy: string): Promise<OrganizationAccessRequest> {
    const [updated] = await db.update(organizationAccessRequests)
      .set({ status, reviewedBy, reviewedAt: new Date() })
      .where(eq(organizationAccessRequests.id, id))
      .returning();
    return updated;
  }

  // External Shares - Cross-organization object sharing
  async getExternalSharesForUser(userId: string): Promise<ExternalShare[]> {
    return await db.select().from(externalShares).where(
      and(
        eq(externalShares.sharedWithUserId, userId),
        isNull(externalShares.revokedAt)
      )
    );
  }

  async getExternalSharesForObject(objectType: string, objectId: number): Promise<ExternalShare[]> {
    return await db.select().from(externalShares).where(
      and(
        eq(externalShares.objectType, objectType),
        eq(externalShares.objectId, objectId),
        isNull(externalShares.revokedAt)
      )
    );
  }

  async createExternalShare(share: InsertExternalShare): Promise<ExternalShare> {
    // Check if share already exists
    const existing = await this.getExternalShare(
      share.objectType,
      share.objectId,
      share.sharedWithUserId
    );
    if (existing) {
      // Update the existing share if revoked
      if (existing.revokedAt) {
        const [updated] = await db.update(externalShares)
          .set({ revokedAt: null, accessRole: share.accessRole, sharedBy: share.sharedBy })
          .where(eq(externalShares.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }
    const [created] = await db.insert(externalShares).values(share).returning();
    return created;
  }

  async revokeExternalShare(id: number): Promise<void> {
    await db.update(externalShares)
      .set({ revokedAt: new Date() })
      .where(eq(externalShares.id, id));
  }

  async getExternalShare(objectType: string, objectId: number, userId: string): Promise<ExternalShare | undefined> {
    const [share] = await db.select().from(externalShares).where(
      and(
        eq(externalShares.objectType, objectType),
        eq(externalShares.objectId, objectId),
        eq(externalShares.sharedWithUserId, userId)
      )
    );
    return share;
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
    const [newProject] = await db.insert(projects).values({
      ...project,
      portfolioId: project.portfolioId || null,
    }).returning();
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

  // Risks (now stored in issues table with itemType='risk')
  async getRisks(projectId: number): Promise<Risk[]> {
    return await db.select().from(issues).where(
      and(
        eq(issues.projectId, projectId),
        eq(issues.itemType, 'risk'),
        isNull(issues.deletedAt)
      )
    );
  }

  async getRisk(id: number): Promise<Risk | undefined> {
    const [risk] = await db.select().from(issues).where(
      and(eq(issues.id, id), eq(issues.itemType, 'risk'))
    );
    return risk;
  }

  async createRisk(risk: InsertRisk): Promise<Risk> {
    const [newRisk] = await db.insert(issues).values({ ...risk, itemType: 'risk' }).returning();
    return newRisk;
  }

  async updateRisk(id: number, updates: UpdateRiskRequest): Promise<Risk> {
    const [updated] = await db.update(issues)
      .set(updates)
      .where(and(eq(issues.id, id), eq(issues.itemType, 'risk')))
      .returning();
    return updated;
  }

  async deleteRisk(id: number): Promise<void> {
    await db.delete(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
  }

  async convertRiskToIssue(id: number): Promise<Issue | undefined> {
    const [converted] = await db.update(issues)
      .set({
        itemType: 'issue',
        type: 'Task',
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

  // Milestones
  async getMilestones(projectId: number): Promise<Milestone[]> {
    return await db.select().from(milestones).where(
      and(eq(milestones.projectId, projectId), isNull(milestones.deletedAt))
    );
  }

  async getAllMilestones(): Promise<Milestone[]> {
    return await db.select().from(milestones).where(isNull(milestones.deletedAt));
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

  // Issues (filtering by itemType='issue' or NULL to exclude risks - NULL for legacy data)
  async getIssues(projectId: number): Promise<Issue[]> {
    return await db.select().from(issues).where(
      and(
        eq(issues.projectId, projectId),
        or(eq(issues.itemType, 'issue'), isNull(issues.itemType)),
        isNull(issues.deletedAt)
      )
    );
  }

  async getIssue(id: number): Promise<Issue | undefined> {
    const [issue] = await db.select().from(issues).where(eq(issues.id, id));
    return issue;
  }

  async getAllIssues(itemType?: 'issue' | 'risk' | 'all'): Promise<Issue[]> {
    if (itemType === 'all' || !itemType) {
      return await db.select().from(issues).where(isNull(issues.deletedAt));
    }
    return await db.select().from(issues).where(
      and(eq(issues.itemType, itemType), isNull(issues.deletedAt))
    );
  }

  async createIssue(issue: InsertIssue): Promise<Issue> {
    const [newIssue] = await db.insert(issues).values({ ...issue, itemType: 'issue' }).returning();
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

  async getEscalatedItemsByProjects(projectIds: number[]): Promise<Issue[]> {
    if (projectIds.length === 0) return [];
    return await db.select().from(issues).where(
      and(
        inArray(issues.projectId, projectIds),
        eq(issues.escalatedToPortfolio, true),
        isNull(issues.deletedAt)
      )
    );
  }

  // Tasks
  async getTasks(projectId: number): Promise<Task[]> {
    return await db.select().from(tasks).where(
      and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))
    ).orderBy(sql`COALESCE(${tasks.taskIndex}, 999999) ASC, ${tasks.createdAt} ASC`);
  }
  
  async getTasksByProject(projectId: number): Promise<Task[]> {
    return this.getTasks(projectId);
  }

  async getAllTasks(): Promise<Task[]> {
    return await db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(desc(tasks.createdAt));
  }

  async getTasksByOrganizationPaginated(organizationId: number, limit: number, offset: number, onlyTaskIds?: number[]): Promise<{ tasks: Task[]; total: number }> {
    const orgProjectIds = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));
    const projectIdList = orgProjectIds.map(p => p.id);
    if (projectIdList.length === 0) return { tasks: [], total: 0 };

    const conditions = [
      isNull(tasks.deletedAt),
      inArray(tasks.projectId, projectIdList),
    ];
    if (onlyTaskIds !== undefined) {
      if (onlyTaskIds.length === 0) return { tasks: [], total: 0 };
      conditions.push(inArray(tasks.id, onlyTaskIds));
    }
    const baseConditions = and(...conditions);

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(baseConditions);
    const total = countResult?.count ?? 0;

    const result = await db.select().from(tasks)
      .where(baseConditions)
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);

    return { tasks: result, total };
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

  async deleteAllTasksForProject(projectId: number): Promise<void> {
    // Get all task IDs for this project
    const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
    const taskIds = projectTasks.map(t => t.id);
    
    if (taskIds.length > 0) {
      // Delete task dependencies
      await db.delete(taskDependencies).where(inArray(taskDependencies.taskId, taskIds));
      await db.delete(taskDependencies).where(inArray(taskDependencies.dependsOnTaskId, taskIds));
      // Delete task change logs
      await db.delete(taskChangeLogs).where(inArray(taskChangeLogs.taskId, taskIds));
      // Delete resource assignments for tasks
      await db.delete(taskResourceAssignments).where(inArray(taskResourceAssignments.taskId, taskIds));
      // Delete all tasks
      await db.delete(tasks).where(eq(tasks.projectId, projectId));
    }
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

  // Risk Change Logs (now using issue change logs since risks are in issues table)
  async getRiskChangeLogs(riskId: number): Promise<RiskChangeLog[]> {
    return await db.select().from(issueChangeLogs)
      .where(eq(issueChangeLogs.issueId, riskId))
      .orderBy(desc(issueChangeLogs.changedAt));
  }

  async createRiskChangeLog(log: InsertRiskChangeLog): Promise<RiskChangeLog> {
    const [newLog] = await db.insert(issueChangeLogs).values(log).returning();
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

  async getRecentOrgActivity(organizationId: number, limit: number): Promise<{ type: string; entityName: string; entityId: number; action: string; summary: string; changedBy: string; changedAt: Date | null }[]> {
    const orgProjects = await db.select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));
    if (orgProjects.length === 0) return [];
    const projectIds = orgProjects.map(p => p.id);
    const projectNameMap = new Map(orgProjects.map(p => [p.id, p.name]));

    const [projLogs, recentTasks, issueLogs] = await Promise.all([
      db.select().from(projectChangeLogs)
        .where(inArray(projectChangeLogs.projectId, projectIds))
        .orderBy(desc(projectChangeLogs.changedAt))
        .limit(limit * 3),
      db.select({ id: tasks.id, name: tasks.name, projectId: tasks.projectId })
        .from(tasks)
        .where(and(inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt)))
        .limit(limit * 5),
      db.select({ log: issueChangeLogs, issueTitle: issues.title, issueProjectId: issues.projectId, itemType: issues.itemType })
        .from(issueChangeLogs)
        .innerJoin(issues, eq(issueChangeLogs.issueId, issues.id))
        .where(inArray(issues.projectId, projectIds))
        .orderBy(desc(issueChangeLogs.changedAt))
        .limit(limit * 3),
    ]);

    const taskIds = recentTasks.map(t => t.id);
    const taskNameMap = new Map(recentTasks.map(t => [t.id, { name: t.name, projectId: t.projectId }]));

    const taskLogs = taskIds.length > 0
      ? await db.select().from(taskChangeLogs)
          .where(inArray(taskChangeLogs.taskId, taskIds))
          .orderBy(desc(taskChangeLogs.changedAt))
          .limit(limit * 3)
      : [];

    const allActivity: { type: string; entityName: string; entityId: number; action: string; summary: string; changedBy: string; changedAt: Date | null }[] = [];

    for (const log of projLogs) {
      allActivity.push({
        type: 'project',
        entityName: projectNameMap.get(log.projectId) || `Project #${log.projectId}`,
        entityId: log.projectId,
        action: log.changeType || 'updated',
        summary: log.changeSummary || `Project ${log.changeType || 'updated'}`,
        changedBy: log.changedByName || 'Unknown',
        changedAt: log.changedAt,
      });
    }
    for (const log of taskLogs) {
      const task = taskNameMap.get(log.taskId);
      allActivity.push({
        type: 'task',
        entityName: task?.name || `Task #${log.taskId}`,
        entityId: task?.projectId || 0,
        action: log.changeType || 'updated',
        summary: log.changeSummary || `Task ${log.changeType || 'updated'}`,
        changedBy: log.changedByName || 'Unknown',
        changedAt: log.changedAt,
      });
    }
    for (const { log, issueTitle, issueProjectId, itemType } of issueLogs) {
      allActivity.push({
        type: itemType === 'risk' ? 'risk' : 'issue',
        entityName: issueTitle || `Issue #${log.issueId}`,
        entityId: issueProjectId || 0,
        action: log.changeType || 'updated',
        summary: log.changeSummary || `${itemType === 'risk' ? 'Risk' : 'Issue'} ${log.changeType || 'updated'}`,
        changedBy: log.changedByName || 'Unknown',
        changedAt: log.changedAt,
      });
    }

    allActivity.sort((a, b) => {
      const dateA = a.changedAt ? new Date(a.changedAt).getTime() : 0;
      const dateB = b.changedAt ? new Date(b.changedAt).getTime() : 0;
      return dateB - dateA;
    });
    return allActivity.slice(0, limit);
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

  async getProjectDependencies(projectId: number): Promise<TaskDependency[]> {
    // Get all tasks for the project first
    const projectTasks = await db.select().from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
    const taskIds = projectTasks.map(t => t.id);
    
    if (taskIds.length === 0) return [];
    
    // Get all dependencies where either taskId or dependsOnTaskId is in the project
    return await db.select().from(taskDependencies)
      .where(or(
        inArray(taskDependencies.taskId, taskIds),
        inArray(taskDependencies.dependsOnTaskId, taskIds)
      ));
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
    const portfolio = await this.getPortfolio(portfolioId);
    if (portfolio?.isCustom) {
      const customLinks = await db.select().from(customPortfolioProjects).where(
        eq(customPortfolioProjects.portfolioId, portfolioId)
      );
      if (customLinks.length === 0) return [];
      const projectIds = customLinks.map(l => l.projectId);
      return await db.select().from(projects).where(
        and(inArray(projects.id, projectIds), isNull(projects.deletedAt))
      );
    }
    return await db.select().from(projects).where(
      and(eq(projects.portfolioId, portfolioId), isNull(projects.deletedAt))
    );
  }

  async addProjectToCustomPortfolio(portfolioId: number, projectId: number, addedBy?: string): Promise<void> {
    await db.insert(customPortfolioProjects).values({ portfolioId, projectId, addedBy }).onConflictDoNothing();
  }

  async removeProjectFromCustomPortfolio(portfolioId: number, projectId: number): Promise<void> {
    await db.delete(customPortfolioProjects).where(
      and(eq(customPortfolioProjects.portfolioId, portfolioId), eq(customPortfolioProjects.projectId, projectId))
    );
  }

  async getCustomPortfolioProjectIds(portfolioId: number): Promise<number[]> {
    const links = await db.select().from(customPortfolioProjects).where(
      eq(customPortfolioProjects.portfolioId, portfolioId)
    );
    return links.map(l => l.projectId);
  }

  async getPortfolioRisks(portfolioId: number): Promise<(Risk & { projectName: string })[]> {
    const portfolioProjects = await this.getPortfolioProjects(portfolioId);
    const projectIds = portfolioProjects.map(p => p.id);
    if (projectIds.length === 0) return [];
    
    const allRisks: (Risk & { projectName: string })[] = [];
    for (const project of portfolioProjects) {
      const projectRisks = await db.select().from(issues).where(
        and(eq(issues.projectId, project.id), eq(issues.itemType, 'risk'), isNull(issues.deletedAt))
      );
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

    // Filter portfolios by organization IDs (exclude soft-deleted)
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

    // Filter projects by organization IDs (exclude soft-deleted)
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

    // Get accessible project IDs for filtering tasks, issues, risks, milestones (exclude soft-deleted)
    const accessibleProjects = organizationIds && organizationIds.length > 0
      ? await db.select({ id: projects.id }).from(projects)
          .where(and(
            isNull(projects.deletedAt),
            sql`${projects.organizationId} IN (${sql.join(organizationIds.map(id => sql`${id}`), sql`, `)})`
          ))
      : await db.select({ id: projects.id }).from(projects).where(isNull(projects.deletedAt));
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

    // Filter tasks by accessible projects (exclude soft-deleted)
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

    // Filter issues by accessible projects (exclude soft-deleted)
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

    // Filter risks by accessible projects (risks are now in issues table with itemType='risk', exclude soft-deleted)
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

    // Filter milestones by accessible projects
    const milestoneResults = await db.select().from(milestones)
      .where(
        and(
          sql`${milestones.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          or(
            sql`COALESCE(${milestones.title}, '') ILIKE ${searchPattern}`,
            sql`COALESCE(${milestones.description}, '') ILIKE ${searchPattern}`
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
    intakes: number;
    resources: number;
  }> {
    const stats = {
      portfolios: 0,
      projects: 0,
      tasks: 0,
      risks: 0,
      milestones: 0,
      issues: 0,
      financials: 0,
      intakes: 0,
      resources: 0,
    };

    // Get ALL projects for this organization (not just demo ones)
    // We need to delete demo items from ALL projects, not just demo projects
    const allProjects = await db.select().from(projects)
      .where(eq(projects.organizationId, organizationId));
    
    for (const project of allProjects) {
      // Delete DEMO tasks for this project (and their dependencies/logs)
      const demoTasks = await db.select().from(tasks)
        .where(and(eq(tasks.projectId, project.id), eq(tasks.isDemo, true)));
      for (const task of demoTasks) {
        await db.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id));
        await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, task.id));
        await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
        await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, task.id));
      }
      const deletedTasks = await db.delete(tasks)
        .where(and(eq(tasks.projectId, project.id), eq(tasks.isDemo, true))).returning();
      stats.tasks += deletedTasks.length;
      
      // Delete DEMO risks (now in issues table with itemType='risk')
      const deletedRisks = await db.delete(issues)
        .where(and(eq(issues.projectId, project.id), eq(issues.itemType, 'risk'), eq(issues.isDemo, true))).returning();
      stats.risks += deletedRisks.length;
      
      // Delete DEMO milestones
      const deletedMilestones = await db.delete(milestones)
        .where(and(eq(milestones.projectId, project.id), eq(milestones.isDemo, true))).returning();
      stats.milestones += deletedMilestones.length;
      
      // Delete DEMO issues (non-risk)
      const deletedIssues = await db.delete(issues)
        .where(and(eq(issues.projectId, project.id), eq(issues.itemType, 'issue'), eq(issues.isDemo, true))).returning();
      stats.issues += deletedIssues.length;
      
      // Delete DEMO financials
      const deletedFinancials = await db.delete(projectFinancials)
        .where(and(eq(projectFinancials.projectId, project.id), eq(projectFinancials.isDemo, true))).returning();
      stats.financials += deletedFinancials.length;
    }
    
    // Now delete demo projects that have no remaining children
    const demoProjects = await db.select().from(projects)
      .where(and(eq(projects.organizationId, organizationId), eq(projects.isDemo, true)));
    
    for (const project of demoProjects) {
      const remainingTasks = await db.select({ count: sql`count(*)` }).from(tasks).where(eq(tasks.projectId, project.id));
      const remainingRisks = await db.select({ count: sql`count(*)` }).from(issues).where(and(eq(issues.projectId, project.id), eq(issues.itemType, 'risk')));
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
    
    // Delete DEMO intakes (organization-level)
    const deletedIntakes = await db.delete(projectIntakes)
      .where(and(eq(projectIntakes.organizationId, organizationId), eq(projectIntakes.isDemo, true))).returning();
    stats.intakes = deletedIntakes.length;
    
    // Delete DEMO resources and their assignments (organization-level)
    const demoResources = await db.select().from(resources)
      .where(and(eq(resources.organizationId, organizationId), eq(resources.isDemo, true)));
    
    for (const resource of demoResources) {
      // Delete any task/issue resource assignments for this demo resource (risks use issue_resource_assignments now)
      await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.resourceId, resource.id));
      await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.resourceId, resource.id));
    }
    
    const deletedResources = await db.delete(resources)
      .where(and(eq(resources.organizationId, organizationId), eq(resources.isDemo, true))).returning();
    stats.resources = deletedResources.length;
    
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

      // Get deleted risks (now in issues table with itemType='risk')
      const deletedRisks = await db.select().from(issues)
        .where(and(
          eq(issues.itemType, 'risk'),
          sql`${issues.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`,
          isNotNull(issues.deletedAt)
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
          const [r] = await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
          if (!r) return false;
          const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
          if (!p) return false;
        }
        await db.update(issues).set({ deletedAt: now, deletedBy: userId }).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
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
        const [r] = await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
        if (!r) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
        await db.update(issues).set({ deletedAt: null, deletedBy: null }).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
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
        // Risks are now in issues table - they get deleted with issues below
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
        const [r] = await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
        if (!r) return false;
        const [p] = await db.select().from(projects).where(and(eq(projects.id, r.projectId), eq(projects.organizationId, organizationId)));
        if (!p) return false;
        await db.delete(issues).where(and(eq(issues.id, id), eq(issues.itemType, 'risk')));
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
  // Track sync locks per organization to prevent race conditions
  private syncLocks: Map<number, Promise<void>> = new Map();
  
  async syncOrganizationMembersAsResources(organizationId: number): Promise<void> {
    // If a sync is already in progress for this org, wait for it
    const existingLock = this.syncLocks.get(organizationId);
    if (existingLock) {
      await existingLock;
      return; // After waiting, another sync has completed, no need to run again
    }
    
    // Create a new lock
    const syncPromise = this.doSyncOrganizationMembersAsResources(organizationId);
    this.syncLocks.set(organizationId, syncPromise);
    
    try {
      await syncPromise;
    } finally {
      this.syncLocks.delete(organizationId);
    }
  }
  
  private async doSyncOrganizationMembersAsResources(organizationId: number): Promise<void> {
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

    // Get existing resources for this organization to check for duplicates
    const existingResources = await db.select()
      .from(resources)
      .where(and(
        eq(resources.organizationId, organizationId),
        isNull(resources.deletedAt)
      ));

    // Build lookup maps for existing resources
    const existingByUserId = new Set(existingResources.filter(r => r.userId).map(r => r.userId));
    const existingByEmail = new Map(existingResources.filter(r => r.email).map(r => [r.email?.toLowerCase(), r]));

    // Link existing resources to org members by email (if not already linked by userId)
    // This is less aggressive than auto-creating - it only links, doesn't create
    for (const member of members) {
      // Skip if already linked by userId
      if (existingByUserId.has(member.userId)) continue;
      
      // Try to link an existing resource by email match
      if (member.email) {
        const matchingResource = existingByEmail.get(member.email.toLowerCase());
        if (matchingResource && !matchingResource.userId) {
          // Link this resource to the user
          await db.update(resources)
            .set({ userId: member.userId })
            .where(eq(resources.id, matchingResource.id));
          existingByUserId.add(member.userId);
          continue;
        }
      }
      
      // Only auto-create a resource if this is the first sync for this member
      // (no resource exists with this userId AND no resource with matching email)
      if (member.email && existingByEmail.has(member.email.toLowerCase())) continue;

      const displayName = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || member.userId;
      await db.insert(resources).values({
        organizationId,
        userId: member.userId,
        displayName,
        email: member.email || null,
        isActive: true,
      });
      
      // Add to lookup sets to prevent duplicates within this sync
      existingByUserId.add(member.userId);
      if (member.email) existingByEmail.set(member.email.toLowerCase(), { id: 0 } as any);
    }
  }

  async deduplicateResources(organizationId: number): Promise<number> {
    // Get all resources for this organization
    const allResources = await db.select()
      .from(resources)
      .where(and(
        eq(resources.organizationId, organizationId),
        isNull(resources.deletedAt)
      ))
      .orderBy(resources.id); // Oldest first

    // Group by email (case-insensitive)
    const byEmail = new Map<string, typeof allResources>();
    for (const r of allResources) {
      if (!r.email) continue;
      const key = r.email.toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key)!.push(r);
    }

    let deletedCount = 0;

    // For each group with duplicates, keep the oldest and delete the rest
    for (const group of Array.from(byEmail.values())) {
      if (group.length <= 1) continue;

      const [keep, ...toDelete] = group;
      
      for (const dup of toDelete) {
        // Re-point any assignments to the canonical resource (risks use issue_resource_assignments now)
        await db.update(taskResourceAssignments)
          .set({ resourceId: keep.id })
          .where(eq(taskResourceAssignments.resourceId, dup.id));
        await db.update(issueResourceAssignments)
          .set({ resourceId: keep.id })
          .where(eq(issueResourceAssignments.resourceId, dup.id));

        // Delete the duplicate
        await db.delete(resources).where(eq(resources.id, dup.id));
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async getResources(organizationId: number): Promise<Resource[]> {
    // First, clean up any existing duplicates
    await this.deduplicateResources(organizationId);
    
    // Auto-sync org members as resources
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
    // First delete all assignments for this resource (risks use issue_resource_assignments now)
    await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.resourceId, id));
    await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.resourceId, id));
    // Then delete the resource
    await db.delete(resources).where(eq(resources.id, id));
  }

  async mergeResources(primaryId: number, secondaryId: number): Promise<Resource> {
    const primary = await this.getResource(primaryId);
    const secondary = await this.getResource(secondaryId);
    
    if (!primary || !secondary) {
      throw new Error("One or both resources not found");
    }
    
    // Re-point all task assignments from secondary to primary
    // First, get existing primary assignments to avoid duplicates
    const existingTaskAssignments = await db.select()
      .from(taskResourceAssignments)
      .where(eq(taskResourceAssignments.resourceId, primaryId));
    const existingTaskIds = new Set(existingTaskAssignments.map(a => a.taskId));
    
    // Get secondary's task assignments
    const secondaryTaskAssignments = await db.select()
      .from(taskResourceAssignments)
      .where(eq(taskResourceAssignments.resourceId, secondaryId));
    
    // Transfer non-duplicate task assignments
    for (const assignment of secondaryTaskAssignments) {
      if (!existingTaskIds.has(assignment.taskId)) {
        await db.update(taskResourceAssignments)
          .set({ resourceId: primaryId })
          .where(and(
            eq(taskResourceAssignments.taskId, assignment.taskId),
            eq(taskResourceAssignments.resourceId, secondaryId)
          ));
      } else {
        // Delete duplicate assignment
        await db.delete(taskResourceAssignments)
          .where(and(
            eq(taskResourceAssignments.taskId, assignment.taskId),
            eq(taskResourceAssignments.resourceId, secondaryId)
          ));
      }
    }
    
    // Re-point all issue/risk assignments from secondary to primary
    const existingIssueAssignments = await db.select()
      .from(issueResourceAssignments)
      .where(eq(issueResourceAssignments.resourceId, primaryId));
    const existingIssueIds = new Set(existingIssueAssignments.map(a => a.issueId));
    
    const secondaryIssueAssignments = await db.select()
      .from(issueResourceAssignments)
      .where(eq(issueResourceAssignments.resourceId, secondaryId));
    
    for (const assignment of secondaryIssueAssignments) {
      if (!existingIssueIds.has(assignment.issueId)) {
        await db.update(issueResourceAssignments)
          .set({ resourceId: primaryId })
          .where(and(
            eq(issueResourceAssignments.issueId, assignment.issueId),
            eq(issueResourceAssignments.resourceId, secondaryId)
          ));
      } else {
        await db.delete(issueResourceAssignments)
          .where(and(
            eq(issueResourceAssignments.issueId, assignment.issueId),
            eq(issueResourceAssignments.resourceId, secondaryId)
          ));
      }
    }
    
    // Merge data fields if primary is missing them
    const updates: Partial<Resource> = {};
    if (!primary.email && secondary.email) updates.email = secondary.email;
    if (!primary.title && secondary.title) updates.title = secondary.title;
    if (!primary.department && secondary.department) updates.department = secondary.department;
    if (!primary.skills && secondary.skills) updates.skills = secondary.skills;
    if (!primary.hourlyRate && secondary.hourlyRate) updates.hourlyRate = secondary.hourlyRate;
    if (!primary.notes && secondary.notes) updates.notes = secondary.notes;
    if (!primary.userId && secondary.userId) updates.userId = secondary.userId;
    
    // Update primary if needed
    if (Object.keys(updates).length > 0) {
      await db.update(resources).set(updates).where(eq(resources.id, primaryId));
    }
    
    // Before deleting, clear the secondary's userId to prevent auto-sync from recreating it
    // This happens when both resources have different userIds (same person, different accounts)
    if (secondary.userId) {
      await db.update(resources).set({ userId: null }).where(eq(resources.id, secondaryId));
    }
    
    // Delete the secondary resource
    await db.delete(resources).where(eq(resources.id, secondaryId));
    
    // Return the updated primary
    const [updated] = await db.select().from(resources).where(eq(resources.id, primaryId));
    return updated;
  }

  // Resource Skills
  async getResourceSkills(resourceId: number): Promise<ResourceSkill[]> {
    return await db.select().from(resourceSkills).where(eq(resourceSkills.resourceId, resourceId)).orderBy(resourceSkills.skillName);
  }

  async getResourceSkillsByOrg(organizationId: number): Promise<ResourceSkill[]> {
    return await db.select().from(resourceSkills).where(eq(resourceSkills.organizationId, organizationId)).orderBy(resourceSkills.skillName);
  }

  async addResourceSkill(skill: InsertResourceSkill): Promise<ResourceSkill> {
    const [created] = await db.insert(resourceSkills).values(skill).returning();
    return created;
  }

  async removeResourceSkill(id: number): Promise<void> {
    await db.delete(resourceSkills).where(eq(resourceSkills.id, id));
  }

  async updateResourceSkill(id: number, updates: Partial<InsertResourceSkill>): Promise<ResourceSkill> {
    const [updated] = await db.update(resourceSkills).set(updates).where(eq(resourceSkills.id, id)).returning();
    return updated;
  }

  // Resource Availability
  async getResourceAvailability(resourceId: number): Promise<ResourceAvailability[]> {
    return await db.select().from(resourceAvailability).where(eq(resourceAvailability.resourceId, resourceId)).orderBy(desc(resourceAvailability.startDate));
  }

  async getResourceAvailabilityByOrg(organizationId: number, startDate?: string, endDate?: string): Promise<ResourceAvailability[]> {
    const conditions = [eq(resourceAvailability.organizationId, organizationId)];
    if (startDate) {
      conditions.push(sql`${resourceAvailability.endDate} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${resourceAvailability.startDate} <= ${endDate}`);
    }
    return await db.select().from(resourceAvailability).where(and(...conditions)).orderBy(resourceAvailability.startDate);
  }

  async addResourceAvailability(entry: InsertResourceAvailability): Promise<ResourceAvailability> {
    const [created] = await db.insert(resourceAvailability).values(entry).returning();
    return created;
  }

  async updateResourceAvailability(id: number, updates: Partial<InsertResourceAvailability>): Promise<ResourceAvailability> {
    const [updated] = await db.update(resourceAvailability).set(updates).where(eq(resourceAvailability.id, id)).returning();
    return updated;
  }

  async removeResourceAvailability(id: number): Promise<void> {
    await db.delete(resourceAvailability).where(eq(resourceAvailability.id, id));
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

  async getProjectTaskResourceAssignments(projectId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]> {
    const assignments = await db.select()
      .from(taskResourceAssignments)
      .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
      .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
      .where(eq(tasks.projectId, projectId));
    
    return assignments.map(a => ({
      ...a.task_resource_assignments,
      resource: a.resources
    }));
  }

  async getAllTaskResourceAssignments(organizationId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]> {
    const assignments = await db.select()
      .from(taskResourceAssignments)
      .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
      .where(eq(resources.organizationId, organizationId));
    
    return assignments.map(a => ({
      ...a.task_resource_assignments,
      resource: a.resources
    }));
  }

  async getAssignedTasksForResource(resourceId: number, organizationId: number, userId?: string): Promise<{ task: Task; project: Project }[]> {
    // Query 1: Tasks assigned via task_resource_assignments table
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
    
    // Query 2: Tasks where user is the ownerId (if userId is provided)
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
    
    // Combine results and deduplicate by task ID
    const taskMap = new Map<number, { task: Task; project: Project }>();
    for (const item of assignedByResource) {
      taskMap.set(item.task.id, item);
    }
    for (const item of assignedByOwner) {
      taskMap.set(item.task.id, item);
    }
    
    return Array.from(taskMap.values());
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

  async updateTaskResourceAssignments(taskId: number, resourceIds: number[], allocations?: { resourceId: number; allocationPercentage: number }[]): Promise<void> {
    // Remove all existing assignments
    await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, taskId));
    
    // Add new assignments (only for resources in resourceIds, ignore stale allocations)
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
      await db.insert(taskResourceAssignments).values(assignmentData);
    }
    
    // Calculate estimated hours based on resource allocations
    // Formula: sum of (allocation% / 100) * (weeklyCapacity / 5 days) * durationDays
    const task = await this.getTask(taskId);
    
    if (resourceIds.length === 0) {
      // No resources assigned - clear estimated hours
      await db.update(tasks)
        .set({ estimatedHours: null })
        .where(eq(tasks.id, taskId));
      return;
    }
    
    if (!task) return;
    
    // Get task duration (from stored value or calculate from dates)
    // Duration semantics: 0 = milestone, 1 = same-day, N = N days
    let durationDays = task.durationDays;
    if (durationDays == null && task.startDate && task.endDate) {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      // Calculate inclusive days: floor(diffMs / msPerDay) + 1
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      durationDays = diffDays + 1; // +1 for inclusive (same day = 1 day)
    }
    
    // If no valid duration, clear estimated hours
    if (durationDays == null || durationDays <= 0) {
      await db.update(tasks)
        .set({ estimatedHours: null })
        .where(eq(tasks.id, taskId));
      return;
    }
    
    // Get resources with their weekly capacities
    const assignedResources = await db.select()
      .from(resources)
      .where(inArray(resources.id, resourceIds));
    
    // Calculate total estimated hours
    let totalEstimatedHours = 0;
    for (const resource of assignedResources) {
      const assignment = assignmentData.find(a => a.resourceId === resource.id);
      const allocationPct = assignment?.allocationPercentage ?? 100;
      const weeklyCapacity = parseFloat(resource.weeklyCapacity || "40");
      const dailyCapacity = weeklyCapacity / 5; // Assuming 5 working days per week
      const resourceHours = (allocationPct / 100) * dailyCapacity * durationDays;
      totalEstimatedHours += resourceHours;
    }
    
    // Update task's estimated hours (round to 2 decimal places)
    await db.update(tasks)
      .set({ estimatedHours: String(Math.round(totalEstimatedHours * 100) / 100) })
      .where(eq(tasks.id, taskId));
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

  async getAllIssueResourceAssignments(organizationId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]> {
    const assignments = await db.select()
      .from(issueResourceAssignments)
      .innerJoin(resources, eq(issueResourceAssignments.resourceId, resources.id))
      .where(eq(resources.organizationId, organizationId));
    
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

  // Risk Resource Assignments (now using issue resource assignments since risks are in issues table)
  async getRiskResourceAssignments(riskId: number): Promise<(RiskResourceAssignment & { resource: Resource })[]> {
    const assignments = await db.select()
      .from(issueResourceAssignments)
      .innerJoin(resources, eq(issueResourceAssignments.resourceId, resources.id))
      .where(eq(issueResourceAssignments.issueId, riskId));
    
    return assignments.map(a => ({
      ...a.issue_resource_assignments,
      resource: a.resources
    }));
  }

  async addRiskResourceAssignment(assignment: InsertRiskResourceAssignment): Promise<RiskResourceAssignment> {
    // Convert riskId to issueId for the assignment
    const issueAssignment = { issueId: (assignment as any).riskId || (assignment as any).issueId, resourceId: assignment.resourceId, role: assignment.role };
    const [newAssignment] = await db.insert(issueResourceAssignments).values(issueAssignment).returning();
    return newAssignment;
  }

  async removeRiskResourceAssignment(riskId: number, resourceId: number): Promise<void> {
    await db.delete(issueResourceAssignments)
      .where(and(
        eq(issueResourceAssignments.issueId, riskId),
        eq(issueResourceAssignments.resourceId, resourceId)
      ));
  }

  async updateRiskResourceAssignments(riskId: number, resourceIds: number[]): Promise<void> {
    await db.delete(issueResourceAssignments).where(eq(issueResourceAssignments.issueId, riskId));
    if (resourceIds.length > 0) {
      await db.insert(issueResourceAssignments).values(
        resourceIds.map(resourceId => ({ issueId: riskId, resourceId }))
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
    
    // Calculate default dates if needed
    const today = new Date().toISOString().split('T')[0];
    const defaultEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Calculate project start/end dates from tasks
    let projectStartDate = today;
    let projectEndDate = defaultEndDate;
    
    const validStartDates = importedTasks
      .filter(t => t.startDate)
      .map(t => t.startDate as string);
    const validEndDates = importedTasks
      .filter(t => t.finishDate)
      .map(t => t.finishDate as string);
    
    if (validStartDates.length > 0) {
      projectStartDate = validStartDates.sort()[0];
    }
    if (validEndDates.length > 0) {
      projectEndDate = validEndDates.sort().reverse()[0];
    }
    
    // Create the project (portfolioId should be undefined/null, not 0)
    const [newProject] = await db.insert(projects).values({
      organizationId: projectData.organizationId,
      portfolioId: projectData.portfolioId && projectData.portfolioId > 0 ? projectData.portfolioId : null,
      name: projectData.name,
      description: projectData.description || mppImport.fileName,
      status: projectData.status || "Initiation",
      priority: projectData.priority || "Medium",
      startDate: projectStartDate,
      endDate: projectEndDate,
      health: "Green",
      budget: "0",
      completionPercentage: 0,
      source: "imported", // Mark as imported from MPP file
      sourceFileName: mppImport.fileName, // Store the original filename
      sourceFileUrl: mppImport.fileUrl, // Store the file URL for download
    }).returning();

    // Create a mapping from old taskId to new task id
    const taskIdMapping: Map<number, number> = new Map();
    
    // First pass: create all tasks without parent references
    for (const importedTask of importedTasks) {
      const startDate = importedTask.startDate || today;
      const endDate = importedTask.finishDate || 
        (importedTask.durationDays 
          ? new Date(new Date(startDate).getTime() + importedTask.durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : defaultEndDate);

      const isSummary = importedTask.isSummary || false;
      const isMilestone = importedTask.isMilestone || false;
      const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";
      const workHoursStr = importedTask.workHours ? importedTask.workHours.toString() : null;
      const actualWorkHoursStr = importedTask.actualWorkHours ? importedTask.actualWorkHours.toString() : null;
      const remainingWorkHoursStr = importedTask.remainingWorkHours ? importedTask.remainingWorkHours.toString() : null;

      const [newTask] = await db.insert(tasks).values({
        projectId: newProject.id,
        name: importedTask.taskName,
        wbs: importedTask.wbs || undefined,
        description: importedTask.notes || undefined,
        startDate,
        endDate,
        durationDays: importedTask.durationDays,
        progress: importedTask.percentComplete || 0,
        status: importedTask.percentComplete === 100 ? "Completed" : 
                importedTask.percentComplete && importedTask.percentComplete > 0 ? "In Progress" : "Not Started",
        outlineLevel: importedTask.outlineLevel || 1,
        isSummary,
        isMilestone,
        taskType,
        estimatedHours: workHoursStr,
        actualHours: actualWorkHoursStr,
        remainingHours: remainingWorkHoursStr,
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

    // Third pass: create task dependencies from predecessors
    for (const importedTask of importedTasks) {
      if (!importedTask.taskId) continue;
      const newTaskId = taskIdMapping.get(importedTask.taskId);
      if (!newTaskId) continue;

      // Parse predecessors from stored JSON
      let predecessorList: Array<{ predecessorTaskId: number; type: string; lagDays: number }> = [];
      if (importedTask.predecessors) {
        try {
          predecessorList = typeof importedTask.predecessors === 'string' 
            ? JSON.parse(importedTask.predecessors) 
            : [];
        } catch (e) {
          predecessorList = [];
        }
      }

      for (const pred of predecessorList) {
        const depTaskId = taskIdMapping.get(pred.predecessorTaskId);
        if (!depTaskId) continue;

        const typeMap: Record<string, string> = {
          'FS': 'finish-to-start',
          'SS': 'start-to-start',
          'FF': 'finish-to-finish',
          'SF': 'start-to-finish',
        };

        try {
          await db.insert(taskDependencies).values({
            taskId: newTaskId,
            dependsOnTaskId: depTaskId,
            dependencyType: typeMap[pred.type] || 'finish-to-start',
            lagDays: pred.lagDays || 0,
          });
        } catch (depError) {
          console.log(`Skipped duplicate dependency: task ${newTaskId} -> ${depTaskId}`);
        }
      }
    }

    // Update the import with the created project ID and task count
    const actualTaskCount = importedTasks.length;
    await db.update(mppImports)
      .set({ projectId: newProject.id, status: "converted", taskCount: actualTaskCount })
      .where(eq(mppImports.id, importId));

    // Calculate and update project completion percentage and status based on non-summary tasks
    const leafTasks = importedTasks.filter(t => !t.isSummary);
    const avgProgress = leafTasks.length > 0
      ? Math.round(leafTasks.reduce((sum, t) => sum + (t.percentComplete || 0), 0) / leafTasks.length)
      : 0;
    
    let derivedStatus = projectData.status || "Initiation";
    if (avgProgress >= 100) {
      derivedStatus = "Closing";
    } else if (avgProgress > 0) {
      derivedStatus = "Execution";
    } else {
      const hasAnyProgress = leafTasks.some(t => (t.percentComplete || 0) > 0);
      if (hasAnyProgress) {
        derivedStatus = "Execution";
      }
    }

    await db.update(projects)
      .set({ completionPercentage: avgProgress, status: derivedStatus })
      .where(eq(projects.id, newProject.id));

    return { project: newProject, taskCount: importedTasks.length };
  }

  // Sync MPP Import to Existing Project (update tasks)
  async syncMppImportToProject(
    importId: number,
    projectId: number,
    options?: {
      syncMode?: 'merge' | 'replace'; // merge = add/update, replace = delete existing first
    }
  ): Promise<{ project: Project; tasksAdded: number; tasksUpdated: number; tasksRemoved: number }> {
    const mppImport = await this.getMppImport(importId);
    if (!mppImport) {
      throw new Error("Import not found");
    }

    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const importedTasks = await this.getMppImportTasks(importId);
    const existingTasks = await this.getTasks(projectId);
    
    const syncMode = options?.syncMode || 'merge';
    let tasksAdded = 0;
    let tasksUpdated = 0;
    let tasksRemoved = 0;

    const today = new Date().toISOString().split('T')[0];
    const defaultEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Build lookup map for existing tasks by name (case-insensitive) or WBS
    const existingByName = new Map<string, typeof existingTasks[0]>();
    const existingByWbs = new Map<string, typeof existingTasks[0]>();
    
    for (const task of existingTasks) {
      existingByName.set(task.name.toLowerCase().trim(), task);
      if (task.description?.startsWith('WBS: ')) {
        const wbs = task.description.replace('WBS: ', '').split('\n')[0].trim();
        existingByWbs.set(wbs, task);
      }
    }

    if (syncMode === 'replace') {
      // Delete all existing tasks and their related records first
      tasksRemoved = existingTasks.length;
      await this.deleteAllTasksForProject(projectId);
      existingByName.clear();
      existingByWbs.clear();
    }

    // Track which existing tasks we've matched (for merge mode)
    const matchedExistingIds = new Set<number>();
    const taskIdMapping = new Map<number, number>();

    // First pass: create or update tasks
    for (const importedTask of importedTasks) {
      const startDate = importedTask.startDate || today;
      const endDate = importedTask.finishDate || 
        (importedTask.durationDays 
          ? new Date(new Date(startDate).getTime() + importedTask.durationDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : defaultEndDate);

      const isSummary = importedTask.isSummary || false;
      const isMilestone = importedTask.isMilestone || false;
      const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";
      const workHoursStr = importedTask.workHours ? importedTask.workHours.toString() : null;
      const actualWorkHoursStr = importedTask.actualWorkHours ? importedTask.actualWorkHours.toString() : null;
      const remainingWorkHoursStr = importedTask.remainingWorkHours ? importedTask.remainingWorkHours.toString() : null;

      const taskData = {
        name: importedTask.taskName,
        wbs: importedTask.wbs || undefined,
        description: importedTask.notes || undefined,
        startDate,
        endDate,
        durationDays: importedTask.durationDays,
        progress: importedTask.percentComplete || 0,
        status: importedTask.percentComplete === 100 ? "Completed" : 
                importedTask.percentComplete && importedTask.percentComplete > 0 ? "In Progress" : "Not Started",
        outlineLevel: importedTask.outlineLevel || 1,
        isSummary,
        isMilestone,
        taskType,
        estimatedHours: workHoursStr,
        actualHours: actualWorkHoursStr,
        remainingHours: remainingWorkHoursStr,
      };

      // Try to match by WBS first, then by name
      let existingTask = importedTask.wbs ? existingByWbs.get(importedTask.wbs) : undefined;
      if (!existingTask) {
        existingTask = existingByName.get(importedTask.taskName.toLowerCase().trim());
      }

      if (existingTask && syncMode === 'merge') {
        // Update existing task
        await db.update(tasks)
          .set(taskData)
          .where(eq(tasks.id, existingTask.id));
        matchedExistingIds.add(existingTask.id);
        tasksUpdated++;
        if (importedTask.taskId) {
          taskIdMapping.set(importedTask.taskId, existingTask.id);
        }
      } else {
        // Create new task
        const [newTask] = await db.insert(tasks).values({
          projectId,
          ...taskData,
          parentId: null,
        }).returning();
        tasksAdded++;
        if (importedTask.taskId) {
          taskIdMapping.set(importedTask.taskId, newTask.id);
        }
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

    // Third pass: create task dependencies from predecessors
    for (const importedTask of importedTasks) {
      if (!importedTask.taskId) continue;
      const newTaskId = taskIdMapping.get(importedTask.taskId);
      if (!newTaskId) continue;

      let predecessorList: Array<{ predecessorTaskId: number; type: string; lagDays: number }> = [];
      if (importedTask.predecessors) {
        try {
          predecessorList = typeof importedTask.predecessors === 'string'
            ? JSON.parse(importedTask.predecessors)
            : [];
        } catch (e) {
          predecessorList = [];
        }
      }

      for (const pred of predecessorList) {
        const depTaskId = taskIdMapping.get(pred.predecessorTaskId);
        if (!depTaskId) continue;

        const typeMap: Record<string, string> = {
          'FS': 'finish-to-start',
          'SS': 'start-to-start',
          'FF': 'finish-to-finish',
          'SF': 'start-to-finish',
        };

        try {
          await db.insert(taskDependencies).values({
            taskId: newTaskId,
            dependsOnTaskId: depTaskId,
            dependencyType: typeMap[pred.type] || 'finish-to-start',
            lagDays: pred.lagDays || 0,
          });
        } catch (depError) {
          console.log(`Skipped duplicate dependency: task ${newTaskId} -> ${depTaskId}`);
        }
      }
    }

    // Update the import record to link to this project
    await db.update(mppImports)
      .set({ 
        projectId, 
        status: "synced", 
        taskCount: importedTasks.length,
        lastSyncedAt: new Date()
      })
      .where(eq(mppImports.id, importId));

    // Update project dates from imported tasks
    const validStartDates = importedTasks
      .filter(t => t.startDate)
      .map(t => t.startDate as string);
    const validEndDates = importedTasks
      .filter(t => t.finishDate)
      .map(t => t.finishDate as string);
    
    const projectUpdates: any = {};
    if (validStartDates.length > 0) {
      projectUpdates.startDate = validStartDates.sort()[0];
    }
    if (validEndDates.length > 0) {
      projectUpdates.endDate = validEndDates.sort().reverse()[0];
    }

    // Calculate and update project completion percentage based on non-summary tasks
    const leafTasks = importedTasks.filter(t => !t.isSummary);
    const avgProgress = leafTasks.length > 0
      ? Math.round(leafTasks.reduce((sum, t) => sum + (t.percentComplete || 0), 0) / leafTasks.length)
      : project.completionPercentage || 0;
    
    projectUpdates.completionPercentage = avgProgress;

    // Derive project status from task progress
    if (avgProgress >= 100) {
      projectUpdates.status = "Closing";
    } else if (avgProgress > 0) {
      projectUpdates.status = "Execution";
    } else {
      const hasAnyProgress = leafTasks.some(t => (t.percentComplete || 0) > 0);
      if (hasAnyProgress) {
        projectUpdates.status = "Execution";
      }
    }

    if (Object.keys(projectUpdates).length > 0) {
      await db.update(projects)
        .set(projectUpdates)
        .where(eq(projects.id, projectId));
    }

    const updatedProject = await this.getProject(projectId);

    return { 
      project: updatedProject!, 
      tasksAdded, 
      tasksUpdated, 
      tasksRemoved 
    };
  }

  // Change Requests
  async getChangeRequests(projectId: number): Promise<ChangeRequest[]> {
    return await db.select().from(changeRequests)
      .where(eq(changeRequests.projectId, projectId))
      .orderBy(desc(changeRequests.createdAt));
  }

  async getChangeRequest(id: number): Promise<ChangeRequest | undefined> {
    const [changeRequest] = await db.select().from(changeRequests).where(eq(changeRequests.id, id));
    return changeRequest;
  }

  async createChangeRequest(changeRequest: InsertChangeRequest): Promise<ChangeRequest> {
    const [created] = await db.insert(changeRequests).values(changeRequest).returning();
    return created;
  }

  async updateChangeRequest(id: number, updates: UpdateChangeRequestRequest): Promise<ChangeRequest> {
    const [updated] = await db.update(changeRequests)
      .set(updates)
      .where(eq(changeRequests.id, id))
      .returning();
    return updated;
  }

  async deleteChangeRequest(id: number): Promise<void> {
    await db.delete(changeRequests).where(eq(changeRequests.id, id));
  }

  // Project Documents
  async getProjectDocuments(projectId: number): Promise<ProjectDocument[]> {
    return await db.select().from(projectDocuments)
      .where(eq(projectDocuments.projectId, projectId))
      .orderBy(desc(projectDocuments.createdAt));
  }

  async getProjectDocument(id: number): Promise<ProjectDocument | undefined> {
    const [document] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, id));
    return document;
  }

  async createProjectDocument(document: InsertProjectDocument): Promise<ProjectDocument> {
    const [created] = await db.insert(projectDocuments).values(document).returning();
    return created;
  }

  async updateProjectDocument(id: number, updates: UpdateProjectDocumentRequest): Promise<ProjectDocument> {
    const [updated] = await db.update(projectDocuments)
      .set(updates)
      .where(eq(projectDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteProjectDocument(id: number): Promise<void> {
    await db.delete(projectDocuments).where(eq(projectDocuments.id, id));
  }

  // Project Comments
  async getProjectComments(projectId: number): Promise<ProjectComment[]> {
    return await db.select().from(projectComments)
      .where(eq(projectComments.projectId, projectId))
      .orderBy(desc(projectComments.createdAt));
  }

  async getProjectComment(id: number): Promise<ProjectComment | undefined> {
    const [comment] = await db.select().from(projectComments).where(eq(projectComments.id, id));
    return comment;
  }

  async createProjectComment(comment: InsertProjectComment): Promise<ProjectComment> {
    const [created] = await db.insert(projectComments).values(comment).returning();
    return created;
  }

  async deleteProjectComment(id: number): Promise<void> {
    await db.delete(projectComments).where(eq(projectComments.id, id));
  }

  // Billable Status Comments
  async getBillableStatusComments(projectId: number): Promise<BillableStatusComment[]> {
    return await db.select().from(billableStatusComments)
      .where(eq(billableStatusComments.projectId, projectId))
      .orderBy(desc(billableStatusComments.createdAt));
  }

  async createBillableStatusComment(comment: InsertBillableStatusComment): Promise<BillableStatusComment> {
    const [created] = await db.insert(billableStatusComments).values(comment).returning();
    return created;
  }

  // Health Status History
  async getHealthStatusHistory(projectId: number): Promise<HealthStatusHistory[]> {
    return await db.select().from(healthStatusHistory)
      .where(eq(healthStatusHistory.projectId, projectId))
      .orderBy(desc(healthStatusHistory.createdAt));
  }

  async createHealthStatusHistory(entry: InsertHealthStatusHistory): Promise<HealthStatusHistory> {
    const [created] = await db.insert(healthStatusHistory).values(entry).returning();
    return created;
  }

  // Project Invoices
  async getProjectInvoices(projectId: number): Promise<ProjectInvoice[]> {
    return await db.select().from(projectInvoices)
      .where(and(
        eq(projectInvoices.projectId, projectId),
        isNull(projectInvoices.deletedAt)
      ))
      .orderBy(desc(projectInvoices.createdAt));
  }

  async getOrganizationInvoices(organizationId: number): Promise<ProjectInvoice[]> {
    return await db.select().from(projectInvoices)
      .where(and(
        eq(projectInvoices.organizationId, organizationId),
        isNull(projectInvoices.deletedAt)
      ))
      .orderBy(desc(projectInvoices.createdAt));
  }

  async getProjectInvoice(id: number): Promise<ProjectInvoice | undefined> {
    const [invoice] = await db.select().from(projectInvoices)
      .where(eq(projectInvoices.id, id));
    return invoice;
  }

  async getProjectInvoiceByExternalId(externalId: string, organizationId: number, source: string): Promise<ProjectInvoice | undefined> {
    const [invoice] = await db.select().from(projectInvoices)
      .where(and(
        eq(projectInvoices.externalId, externalId),
        eq(projectInvoices.organizationId, organizationId),
        eq(projectInvoices.source, source),
        isNull(projectInvoices.deletedAt)
      ));
    return invoice;
  }

  async createProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice> {
    const [created] = await db.insert(projectInvoices).values(invoice).returning();
    return created;
  }

  async upsertProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice> {
    // Check if invoice already exists by external ID
    if (invoice.externalId && invoice.organizationId && invoice.source) {
      const existing = await this.getProjectInvoiceByExternalId(
        invoice.externalId,
        invoice.organizationId,
        invoice.source
      );
      if (existing) {
        // Update existing invoice
        return await this.updateProjectInvoice(existing.id, invoice);
      }
    }
    // Create new invoice
    return await this.createProjectInvoice(invoice);
  }

  async updateProjectInvoice(id: number, updates: Partial<InsertProjectInvoice>): Promise<ProjectInvoice> {
    const [updated] = await db.update(projectInvoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectInvoices.id, id))
      .returning();
    return updated;
  }

  async deleteProjectInvoice(id: number): Promise<void> {
    await db.update(projectInvoices)
      .set({ deletedAt: new Date() })
      .where(eq(projectInvoices.id, id));
  }

  // Invoice Notes
  async getInvoiceNotes(invoiceId: number): Promise<InvoiceNote[]> {
    return await db.select().from(invoiceNotes)
      .where(eq(invoiceNotes.invoiceId, invoiceId))
      .orderBy(desc(invoiceNotes.createdAt));
  }

  async createInvoiceNote(note: InsertInvoiceNote): Promise<InvoiceNote> {
    const [created] = await db.insert(invoiceNotes).values(note).returning();
    return created;
  }

  // Project Views
  async getProjectViews(organizationId: number, userId: string, mode: string): Promise<ProjectView[]> {
    return await db.select().from(projectViews)
      .where(and(
        eq(projectViews.organizationId, organizationId),
        eq(projectViews.userId, userId),
        eq(projectViews.mode, mode)
      ))
      .orderBy(desc(projectViews.isSystem), asc(projectViews.name));
  }

  async getProjectView(id: number): Promise<ProjectView | undefined> {
    const [view] = await db.select().from(projectViews).where(eq(projectViews.id, id));
    return view;
  }

  async createProjectView(view: InsertProjectView): Promise<ProjectView> {
    const [created] = await db.insert(projectViews).values(view).returning();
    return created;
  }

  async updateProjectView(id: number, updates: UpdateProjectViewRequest): Promise<ProjectView> {
    const [updated] = await db.update(projectViews)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectViews.id, id))
      .returning();
    return updated;
  }

  async deleteProjectView(id: number): Promise<void> {
    await db.delete(projectViews).where(eq(projectViews.id, id));
  }

  async setDefaultProjectView(organizationId: number, userId: string, mode: string, viewId: number): Promise<void> {
    // First, unset any existing default for this user/mode
    await db.update(projectViews)
      .set({ isDefault: false })
      .where(and(
        eq(projectViews.organizationId, organizationId),
        eq(projectViews.userId, userId),
        eq(projectViews.mode, mode)
      ));
    // Then set the new default
    await db.update(projectViews)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(projectViews.id, viewId));
  }

  // System Project Views (Admin-managed org-level views)
  async getSystemProjectViews(organizationId: number, mode: string): Promise<SystemProjectView[]> {
    return await db.select().from(systemProjectViews)
      .where(and(
        eq(systemProjectViews.organizationId, organizationId),
        eq(systemProjectViews.mode, mode),
        eq(systemProjectViews.isActive, true)
      ))
      .orderBy(asc(systemProjectViews.displayOrder), asc(systemProjectViews.name));
  }

  async getSystemProjectView(id: number): Promise<SystemProjectView | undefined> {
    const [view] = await db.select().from(systemProjectViews).where(eq(systemProjectViews.id, id));
    return view;
  }

  async createSystemProjectView(view: InsertSystemProjectView): Promise<SystemProjectView> {
    const [created] = await db.insert(systemProjectViews).values(view).returning();
    return created;
  }

  async updateSystemProjectView(id: number, updates: UpdateSystemProjectViewRequest): Promise<SystemProjectView> {
    const [updated] = await db.update(systemProjectViews)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(systemProjectViews.id, id))
      .returning();
    return updated;
  }

  async deleteSystemProjectView(id: number): Promise<void> {
    await db.delete(systemProjectViews).where(eq(systemProjectViews.id, id));
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result[0]?.count || 0;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // Intake Workflow Steps
  async getIntakeWorkflowSteps(organizationId: number): Promise<IntakeWorkflowStep[]> {
    return await db.select().from(intakeWorkflowSteps)
      .where(eq(intakeWorkflowSteps.organizationId, organizationId))
      .orderBy(intakeWorkflowSteps.position);
  }

  async upsertIntakeWorkflowSteps(organizationId: number, steps: InsertIntakeWorkflowStep[]): Promise<IntakeWorkflowStep[]> {
    // Delete existing steps for this organization
    await db.delete(intakeWorkflowSteps).where(eq(intakeWorkflowSteps.organizationId, organizationId));
    
    // Insert new steps
    if (steps.length === 0) {
      return [];
    }
    
    const stepsWithOrg = steps.map(step => ({
      ...step,
      organizationId,
    }));
    
    const inserted = await db.insert(intakeWorkflowSteps).values(stepsWithOrg).returning();
    return inserted;
  }

  async resetIntakeWorkflowToDefaults(organizationId: number): Promise<IntakeWorkflowStep[]> {
    const defaultSteps: InsertIntakeWorkflowStep[] = [
      {
        organizationId,
        stepKey: "intake_capture",
        position: 0,
        label: "Intake Capture",
        description: "Capture the initial idea and basic information",
        helpText: "Document the initial request, problem statement, and desired outcome.",
        requiredFields: ["projectName", "description"],
      },
      {
        organizationId,
        stepKey: "triage",
        position: 1,
        label: "Triage",
        description: "Classify and prioritize the intake request",
        helpText: "Determine if this is a new initiative or backlog item, and assign to appropriate portfolio.",
        requiredFields: ["portfolioId", "fundingSource"],
      },
      {
        organizationId,
        stepKey: "business_case",
        position: 2,
        label: "Business Case",
        description: "Define business justification and expected benefits",
        helpText: "Document the business case including ROI, benefits, and stakeholder alignment.",
        requiredFields: ["estimatedBudget", "financialJustification"],
      },
      {
        organizationId,
        stepKey: "technical_evaluation",
        position: 3,
        label: "Technical Evaluation",
        description: "Assess technical feasibility and resource requirements",
        helpText: "Evaluate technical requirements, architecture impact, and resource availability.",
        requiredFields: ["itCostEstimate", "resourceRequirements"],
      },
      {
        organizationId,
        stepKey: "governance_review",
        position: 4,
        label: "Governance Review",
        description: "Security, compliance, and architecture approval",
        helpText: "Complete security assessment, compliance review, and architecture sign-off.",
        requiredFields: ["cyberRiskAssessment"],
      },
      {
        organizationId,
        stepKey: "decision",
        position: 5,
        label: "Decision",
        description: "Final PMO review and approval decision",
        helpText: "PMO reviews the complete intake and makes approval, deferral, or rejection decision.",
        requiredFields: [],
      },
    ];
    
    return this.upsertIntakeWorkflowSteps(organizationId, defaultSteps);
  }

  // Status Report History
  async getStatusReportHistory(projectId: number): Promise<StatusReportHistory[]> {
    return await db.select().from(statusReportHistory)
      .where(eq(statusReportHistory.projectId, projectId))
      .orderBy(desc(statusReportHistory.createdAt));
  }

  async getStatusReportHistoryByOrg(organizationId: number): Promise<StatusReportHistory[]> {
    return await db.select().from(statusReportHistory)
      .where(eq(statusReportHistory.organizationId, organizationId))
      .orderBy(desc(statusReportHistory.createdAt));
  }

  async createStatusReportHistory(report: InsertStatusReportHistory): Promise<StatusReportHistory> {
    const [created] = await db.insert(statusReportHistory).values(report).returning();
    return created;
  }

  // Billing Transactions
  async getBillingTransactions(userId?: string, orgId?: number, limit: number = 50, offset: number = 0): Promise<BillingTransaction[]> {
    const conditions = [];
    if (userId) {
      conditions.push(eq(billingTransactions.userId, userId));
    }
    if (orgId) {
      conditions.push(eq(billingTransactions.orgId, orgId));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    return await db.select()
      .from(billingTransactions)
      .where(whereClause)
      .orderBy(desc(billingTransactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getBillingTransaction(id: number): Promise<BillingTransaction | undefined> {
    const [transaction] = await db.select().from(billingTransactions).where(eq(billingTransactions.id, id));
    return transaction;
  }

  async createBillingTransaction(transaction: InsertBillingTransaction): Promise<BillingTransaction> {
    const [created] = await db.insert(billingTransactions).values(transaction).returning();
    return created;
  }

  // Timesheet Entries
  async getTimesheetEntries(userId: string, organizationId: number, startDate: string, endDate: string): Promise<TimesheetEntry[]> {
    return await db.select().from(timesheetEntries)
      .where(and(
        eq(timesheetEntries.userId, userId),
        eq(timesheetEntries.organizationId, organizationId),
        sql`${timesheetEntries.entryDate} >= ${startDate}`,
        sql`${timesheetEntries.entryDate} <= ${endDate}`
      ))
      .orderBy(timesheetEntries.entryDate, timesheetEntries.taskId);
  }

  async getTimesheetEntriesWithDetails(userId: string, organizationId: number, startDate: string, endDate: string): Promise<{ entry: TimesheetEntry; task: Task; project: Project }[]> {
    // Single optimized query with JOINs - no N+1 problem
    // Join projects via tasks.projectId (authoritative source) rather than timesheetEntries.projectId
    const results = await db.select({
      entry: timesheetEntries,
      task: tasks,
      project: projects
    })
      .from(timesheetEntries)
      .innerJoin(tasks, eq(timesheetEntries.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(timesheetEntries.userId, userId),
        eq(timesheetEntries.organizationId, organizationId),
        sql`${timesheetEntries.entryDate} >= ${startDate}`,
        sql`${timesheetEntries.entryDate} <= ${endDate}`,
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt)
      ))
      .orderBy(timesheetEntries.entryDate, timesheetEntries.taskId);
    
    return results;
  }

  async getAllTimesheetEntriesWithDetails(organizationId: number, startDate: string, endDate: string): Promise<{ entry: TimesheetEntry; task: Task; project: Project }[]> {
    // Get all timesheet entries for the organization (for admins) with JOINs
    const results = await db.select({
      entry: timesheetEntries,
      task: tasks,
      project: projects
    })
      .from(timesheetEntries)
      .innerJoin(tasks, eq(timesheetEntries.taskId, tasks.id))
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(timesheetEntries.organizationId, organizationId),
        sql`${timesheetEntries.entryDate} >= ${startDate}`,
        sql`${timesheetEntries.entryDate} <= ${endDate}`,
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt)
      ))
      .orderBy(timesheetEntries.entryDate, timesheetEntries.taskId);
    
    return results;
  }

  async getTimesheetHoursByTaskIds(taskIds: number[]): Promise<Map<number, number>> {
    if (taskIds.length === 0) return new Map();
    const results = await db.select({
      taskId: timesheetEntries.taskId,
      totalHours: sql<string>`COALESCE(SUM(CAST(${timesheetEntries.hours} AS NUMERIC)), 0)`,
    })
      .from(timesheetEntries)
      .where(inArray(timesheetEntries.taskId, taskIds))
      .groupBy(timesheetEntries.taskId);
    const map = new Map<number, number>();
    for (const row of results) {
      map.set(row.taskId, Number(row.totalHours));
    }
    return map;
  }

  async getTimesheetEntriesForApproval(organizationId: number, status?: string): Promise<TimesheetEntry[]> {
    const conditions = [eq(timesheetEntries.organizationId, organizationId)];
    if (status) {
      conditions.push(eq(timesheetEntries.status, status));
    }
    return await db.select().from(timesheetEntries)
      .where(and(...conditions))
      .orderBy(desc(timesheetEntries.submittedAt), timesheetEntries.userId);
  }

  async getTimesheetEntry(id: number): Promise<TimesheetEntry | undefined> {
    const [entry] = await db.select().from(timesheetEntries).where(eq(timesheetEntries.id, id));
    return entry;
  }

  async findTimesheetEntry(resourceId: number, taskId: number, entryDate: string): Promise<TimesheetEntry | undefined> {
    const [entry] = await db.select().from(timesheetEntries).where(and(
      eq(timesheetEntries.resourceId, resourceId),
      eq(timesheetEntries.taskId, taskId),
      eq(timesheetEntries.entryDate, entryDate)
    ));
    return entry;
  }

  async createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntry> {
    // Use upsert pattern with retry for race condition handling
    // First attempt a simple insert
    try {
      const [created] = await db.insert(timesheetEntries).values(entry).returning();
      return created;
    } catch (error: any) {
      // If unique constraint violation, update the existing entry instead
      if (error?.code === '23505' || error?.message?.includes('unique constraint')) {
        const [existing] = await db.select()
          .from(timesheetEntries)
          .where(and(
            eq(timesheetEntries.userId, entry.userId),
            eq(timesheetEntries.taskId, entry.taskId),
            eq(timesheetEntries.entryDate, entry.entryDate)
          ))
          .limit(1);
        
        if (existing) {
          // Update existing entry with new hours (add to existing hours)
          const newHours = String(Number(existing.hours) + Number(entry.hours));
          const [updated] = await db.update(timesheetEntries)
            .set({ hours: newHours, notes: entry.notes || existing.notes, updatedAt: new Date() })
            .where(eq(timesheetEntries.id, existing.id))
            .returning();
          return updated;
        }
      }
      throw error;
    }
  }

  async updateTimesheetEntry(id: number, updates: UpdateTimesheetEntryRequest): Promise<TimesheetEntry> {
    const [updated] = await db.update(timesheetEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(timesheetEntries.id, id))
      .returning();
    return updated;
  }

  async deleteTimesheetEntry(id: number): Promise<void> {
    await db.delete(timesheetEntries).where(eq(timesheetEntries.id, id));
  }

  async submitTimesheetWeek(userId: string, organizationId: number, startDate: string, endDate: string): Promise<void> {
    await db.update(timesheetEntries)
      .set({ status: "Submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(timesheetEntries.userId, userId),
        eq(timesheetEntries.organizationId, organizationId),
        eq(timesheetEntries.status, "Draft"),
        sql`${timesheetEntries.entryDate} >= ${startDate}`,
        sql`${timesheetEntries.entryDate} <= ${endDate}`
      ));
  }

  async approveTimesheetEntry(id: number, approvedBy: string): Promise<TimesheetEntry> {
    const [updated] = await db.update(timesheetEntries)
      .set({ status: "Approved", approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(timesheetEntries.id, id))
      .returning();
    return updated;
  }

  async bulkApproveTimesheetEntries(ids: number[], approvedBy: string, organizationId: number): Promise<TimesheetEntry[]> {
    if (ids.length === 0) return [];
    const now = new Date();
    return await db.update(timesheetEntries)
      .set({ status: "Approved", approvedBy, approvedAt: now, updatedAt: now })
      .where(
        and(
          inArray(timesheetEntries.id, ids),
          eq(timesheetEntries.organizationId, organizationId),
          eq(timesheetEntries.status, "Submitted")
        )
      )
      .returning();
  }

  async rejectTimesheetEntry(id: number, rejectionReason: string): Promise<TimesheetEntry> {
    const [updated] = await db.update(timesheetEntries)
      .set({ status: "Rejected", rejectionReason, updatedAt: new Date() })
      .where(eq(timesheetEntries.id, id))
      .returning();
    return updated;
  }

  // Timesheet Periods
  async getTimesheetPeriods(organizationId: number): Promise<TimesheetPeriod[]> {
    return await db.select().from(timesheetPeriods)
      .where(eq(timesheetPeriods.organizationId, organizationId))
      .orderBy(desc(timesheetPeriods.startDate));
  }

  async getTimesheetPeriod(id: number): Promise<TimesheetPeriod | undefined> {
    const [period] = await db.select().from(timesheetPeriods)
      .where(eq(timesheetPeriods.id, id));
    return period;
  }

  async getClosedPeriodsForDateRange(organizationId: number, startDate: string, endDate: string): Promise<TimesheetPeriod[]> {
    return await db.select().from(timesheetPeriods)
      .where(and(
        eq(timesheetPeriods.organizationId, organizationId),
        eq(timesheetPeriods.status, "closed"),
        // Period overlaps with date range
        sql`${timesheetPeriods.startDate} <= ${endDate}`,
        sql`${timesheetPeriods.endDate} >= ${startDate}`
      ))
      .orderBy(asc(timesheetPeriods.startDate));
  }

  async createTimesheetPeriod(period: InsertTimesheetPeriod): Promise<TimesheetPeriod> {
    const [created] = await db.insert(timesheetPeriods).values(period).returning();
    return created;
  }

  async closeTimesheetPeriod(id: number, closedBy: string): Promise<TimesheetPeriod> {
    const [updated] = await db.update(timesheetPeriods)
      .set({ status: "closed", closedBy, closedAt: new Date() })
      .where(eq(timesheetPeriods.id, id))
      .returning();
    return updated;
  }

  async reopenTimesheetPeriod(id: number, reopenedBy: string): Promise<TimesheetPeriod> {
    const [updated] = await db.update(timesheetPeriods)
      .set({ status: "open", reopenedBy, reopenedAt: new Date() })
      .where(eq(timesheetPeriods.id, id))
      .returning();
    return updated;
  }

  async deleteTimesheetPeriod(id: number): Promise<void> {
    await db.delete(timesheetPeriods).where(eq(timesheetPeriods.id, id));
  }

  // Time Categories
  async getTimeCategories(organizationId: number): Promise<TimeCategory[]> {
    return await db.select().from(timeCategories)
      .where(and(
        eq(timeCategories.organizationId, organizationId),
        isNull(timeCategories.deletedAt)
      ))
      .orderBy(asc(timeCategories.sortOrder), asc(timeCategories.name));
  }

  async getTimeCategory(id: number): Promise<TimeCategory | undefined> {
    const [category] = await db.select().from(timeCategories)
      .where(and(eq(timeCategories.id, id), isNull(timeCategories.deletedAt)));
    return category;
  }

  async createTimeCategory(category: InsertTimeCategory): Promise<TimeCategory> {
    const [created] = await db.insert(timeCategories).values(category).returning();
    return created;
  }

  async updateTimeCategory(id: number, updates: Partial<InsertTimeCategory>): Promise<TimeCategory> {
    const [updated] = await db.update(timeCategories)
      .set(updates)
      .where(eq(timeCategories.id, id))
      .returning();
    return updated;
  }

  async deleteTimeCategory(id: number): Promise<void> {
    await db.update(timeCategories)
      .set({ deletedAt: new Date() })
      .where(eq(timeCategories.id, id));
  }

  // Non-Project Time Entries
  async getNonProjectTimeEntry(id: number): Promise<NonProjectTimeEntry | undefined> {
    const [entry] = await db.select().from(nonProjectTimeEntries)
      .where(eq(nonProjectTimeEntries.id, id));
    return entry;
  }

  async getNonProjectTimeEntries(userId: string, organizationId: number, startDate: string, endDate: string): Promise<NonProjectTimeEntry[]> {
    return await db.select().from(nonProjectTimeEntries)
      .where(and(
        eq(nonProjectTimeEntries.userId, userId),
        eq(nonProjectTimeEntries.organizationId, organizationId),
        sql`${nonProjectTimeEntries.entryDate} >= ${startDate}`,
        sql`${nonProjectTimeEntries.entryDate} <= ${endDate}`
      ));
  }

  async getNonProjectTimeEntriesWithCategory(userId: string, organizationId: number, startDate: string, endDate: string): Promise<{ entry: NonProjectTimeEntry; category: TimeCategory }[]> {
    const results = await db.select({
      entry: nonProjectTimeEntries,
      category: timeCategories
    })
      .from(nonProjectTimeEntries)
      .innerJoin(timeCategories, eq(nonProjectTimeEntries.categoryId, timeCategories.id))
      .where(and(
        eq(nonProjectTimeEntries.userId, userId),
        eq(nonProjectTimeEntries.organizationId, organizationId),
        sql`${nonProjectTimeEntries.entryDate} >= ${startDate}`,
        sql`${nonProjectTimeEntries.entryDate} <= ${endDate}`
      ));
    return results;
  }

  async createNonProjectTimeEntry(entry: InsertNonProjectTimeEntry): Promise<NonProjectTimeEntry> {
    const [created] = await db.insert(nonProjectTimeEntries).values(entry).returning();
    return created;
  }

  async updateNonProjectTimeEntry(id: number, updates: Partial<InsertNonProjectTimeEntry>): Promise<NonProjectTimeEntry> {
    const [updated] = await db.update(nonProjectTimeEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(nonProjectTimeEntries.id, id))
      .returning();
    return updated;
  }

  async deleteNonProjectTimeEntry(id: number): Promise<void> {
    await db.delete(nonProjectTimeEntries).where(eq(nonProjectTimeEntries.id, id));
  }

  // User Consents
  async getUserConsents(userId: string): Promise<UserConsent[]> {
    return await db.select().from(userConsents)
      .where(and(eq(userConsents.userId, userId), eq(userConsents.revoked, false)))
      .orderBy(desc(userConsents.acceptedAt));
  }

  async getUserConsentByType(userId: string, consentType: string): Promise<UserConsent | undefined> {
    const [consent] = await db.select().from(userConsents)
      .where(and(
        eq(userConsents.userId, userId),
        eq(userConsents.consentType, consentType),
        eq(userConsents.revoked, false)
      ))
      .orderBy(desc(userConsents.acceptedAt))
      .limit(1);
    return consent;
  }

  async createUserConsent(consent: InsertUserConsent): Promise<UserConsent> {
    const [created] = await db.insert(userConsents).values(consent).returning();
    return created;
  }

  async revokeUserConsent(id: number): Promise<UserConsent> {
    const [updated] = await db.update(userConsents)
      .set({ revoked: true, revokedAt: new Date() })
      .where(eq(userConsents.id, id))
      .returning();
    return updated;
  }

  async getAllUserConsents(limit: number = 100, offset: number = 0): Promise<UserConsent[]> {
    return await db.select().from(userConsents)
      .orderBy(desc(userConsents.acceptedAt))
      .limit(limit)
      .offset(offset);
  }

  async getUserConsentStats(): Promise<{ consentType: string; version: string; count: number }[]> {
    const stats = await db.select({
      consentType: userConsents.consentType,
      version: userConsents.version,
      count: sql<number>`count(*)::int`
    })
      .from(userConsents)
      .where(eq(userConsents.revoked, false))
      .groupBy(userConsents.consentType, userConsents.version);
    return stats;
  }

  // Custom Field Definitions
  async getCustomFieldDefinitions(organizationId: number): Promise<CustomFieldDefinition[]> {
    return await db.select().from(customFieldDefinitions)
      .where(and(
        eq(customFieldDefinitions.organizationId, organizationId),
        eq(customFieldDefinitions.isActive, true)
      ))
      .orderBy(asc(customFieldDefinitions.displayOrder), asc(customFieldDefinitions.name));
  }

  async getCustomFieldDefinition(id: number): Promise<CustomFieldDefinition | undefined> {
    const [field] = await db.select().from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.id, id));
    return field;
  }

  async createCustomFieldDefinition(field: InsertCustomFieldDefinition): Promise<CustomFieldDefinition> {
    const [created] = await db.insert(customFieldDefinitions).values(field).returning();
    return created;
  }

  async updateCustomFieldDefinition(id: number, updates: UpdateCustomFieldDefinitionRequest): Promise<CustomFieldDefinition> {
    const [updated] = await db.update(customFieldDefinitions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customFieldDefinitions.id, id))
      .returning();
    return updated;
  }

  async deleteCustomFieldDefinition(id: number): Promise<void> {
    await db.update(customFieldDefinitions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(customFieldDefinitions.id, id));
  }

  // Project Custom Field Values
  async getProjectCustomFieldValues(projectId: number): Promise<ProjectCustomFieldValue[]> {
    return await db.select().from(projectCustomFieldValues)
      .where(eq(projectCustomFieldValues.projectId, projectId));
  }

  async getProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<ProjectCustomFieldValue | undefined> {
    const [value] = await db.select().from(projectCustomFieldValues)
      .where(and(
        eq(projectCustomFieldValues.projectId, projectId),
        eq(projectCustomFieldValues.fieldDefinitionId, fieldDefinitionId)
      ));
    return value;
  }

  async upsertProjectCustomFieldValue(value: InsertProjectCustomFieldValue): Promise<ProjectCustomFieldValue> {
    const existing = await this.getProjectCustomFieldValue(value.projectId, value.fieldDefinitionId);
    if (existing) {
      const [updated] = await db.update(projectCustomFieldValues)
        .set({ value: value.value, updatedAt: new Date() })
        .where(eq(projectCustomFieldValues.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(projectCustomFieldValues).values(value).returning();
      return created;
    }
  }

  async deleteProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<void> {
    await db.delete(projectCustomFieldValues)
      .where(and(
        eq(projectCustomFieldValues.projectId, projectId),
        eq(projectCustomFieldValues.fieldDefinitionId, fieldDefinitionId)
      ));
  }

  // Custom Project Tabs
  async getCustomProjectTabs(organizationId: number): Promise<CustomProjectTab[]> {
    return await db.select().from(customProjectTabs)
      .where(and(
        eq(customProjectTabs.organizationId, organizationId),
        eq(customProjectTabs.isActive, true)
      ))
      .orderBy(asc(customProjectTabs.displayOrder), asc(customProjectTabs.name));
  }

  async getCustomProjectTab(id: number): Promise<CustomProjectTab | undefined> {
    const [tab] = await db.select().from(customProjectTabs)
      .where(eq(customProjectTabs.id, id));
    return tab;
  }

  async createCustomProjectTab(tab: InsertCustomProjectTab): Promise<CustomProjectTab> {
    const [created] = await db.insert(customProjectTabs).values(tab).returning();
    return created;
  }

  async updateCustomProjectTab(id: number, updates: Partial<InsertCustomProjectTab>): Promise<CustomProjectTab> {
    const [updated] = await db.update(customProjectTabs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customProjectTabs.id, id))
      .returning();
    return updated;
  }

  async deleteCustomProjectTab(id: number): Promise<void> {
    // First delete all fields in all sections of this tab
    const sections = await this.getCustomTabSections(id);
    for (const section of sections) {
      await db.delete(customTabFields).where(eq(customTabFields.sectionId, section.id));
    }
    // Then delete all sections
    await db.delete(customTabSections).where(eq(customTabSections.tabId, id));
    // Finally delete the tab (soft delete)
    await db.update(customProjectTabs)
      .set({ isActive: false })
      .where(eq(customProjectTabs.id, id));
  }

  // Custom Tab Sections
  async getCustomTabSections(tabId: number): Promise<CustomTabSection[]> {
    return await db.select().from(customTabSections)
      .where(eq(customTabSections.tabId, tabId))
      .orderBy(asc(customTabSections.displayOrder));
  }

  async getCustomTabSection(id: number): Promise<CustomTabSection | undefined> {
    const [section] = await db.select().from(customTabSections)
      .where(eq(customTabSections.id, id));
    return section;
  }

  async createCustomTabSection(section: InsertCustomTabSection): Promise<CustomTabSection> {
    const [created] = await db.insert(customTabSections).values(section).returning();
    return created;
  }

  async updateCustomTabSection(id: number, updates: Partial<InsertCustomTabSection>): Promise<CustomTabSection> {
    const [updated] = await db.update(customTabSections)
      .set(updates)
      .where(eq(customTabSections.id, id))
      .returning();
    return updated;
  }

  async deleteCustomTabSection(id: number): Promise<void> {
    // First delete all fields in this section
    await db.delete(customTabFields).where(eq(customTabFields.sectionId, id));
    // Then delete the section
    await db.delete(customTabSections).where(eq(customTabSections.id, id));
  }

  // Custom Tab Fields
  async getCustomTabFields(sectionId: number): Promise<CustomTabField[]> {
    return await db.select().from(customTabFields)
      .where(eq(customTabFields.sectionId, sectionId))
      .orderBy(asc(customTabFields.displayOrder));
  }

  async getCustomTabField(id: number): Promise<CustomTabField | undefined> {
    const [field] = await db.select().from(customTabFields)
      .where(eq(customTabFields.id, id));
    return field;
  }

  async createCustomTabField(field: InsertCustomTabField): Promise<CustomTabField> {
    const [created] = await db.insert(customTabFields).values(field).returning();
    return created;
  }

  async updateCustomTabField(id: number, updates: Partial<InsertCustomTabField>): Promise<CustomTabField> {
    const [updated] = await db.update(customTabFields)
      .set(updates)
      .where(eq(customTabFields.id, id))
      .returning();
    return updated;
  }

  async deleteCustomTabField(id: number): Promise<void> {
    await db.delete(customTabFields).where(eq(customTabFields.id, id));
  }

  // Full tab with sections and fields
  async getFullCustomProjectTab(tabId: number): Promise<{ tab: CustomProjectTab; sections: (CustomTabSection & { fields: CustomTabField[] })[] } | undefined> {
    const tab = await this.getCustomProjectTab(tabId);
    if (!tab) return undefined;

    const sections = await this.getCustomTabSections(tabId);
    const sectionsWithFields = await Promise.all(
      sections.map(async (section) => {
        const fields = await this.getCustomTabFields(section.id);
        return { ...section, fields };
      })
    );

    return { tab, sections: sectionsWithFields };
  }

  // Project Scoring Criteria
  async getProjectScoringCriteria(organizationId: number): Promise<ProjectScoringCriteria[]> {
    return await db.select().from(projectScoringCriteria)
      .where(and(
        eq(projectScoringCriteria.organizationId, organizationId),
        eq(projectScoringCriteria.isActive, true)
      ))
      .orderBy(asc(projectScoringCriteria.displayOrder), asc(projectScoringCriteria.name));
  }

  async getProjectScoringCriterion(id: number): Promise<ProjectScoringCriteria | undefined> {
    const [criteria] = await db.select().from(projectScoringCriteria)
      .where(eq(projectScoringCriteria.id, id));
    return criteria;
  }

  async createProjectScoringCriteria(criteria: InsertProjectScoringCriteria): Promise<ProjectScoringCriteria> {
    const [created] = await db.insert(projectScoringCriteria).values(criteria).returning();
    return created;
  }

  async updateProjectScoringCriteria(id: number, updates: Partial<InsertProjectScoringCriteria>): Promise<ProjectScoringCriteria> {
    const [updated] = await db.update(projectScoringCriteria)
      .set(updates)
      .where(eq(projectScoringCriteria.id, id))
      .returning();
    return updated;
  }

  async deleteProjectScoringCriteria(id: number): Promise<void> {
    await db.update(projectScoringCriteria)
      .set({ isActive: false })
      .where(eq(projectScoringCriteria.id, id));
  }

  // Project Scores
  async getProjectScores(projectId: number): Promise<ProjectScore[]> {
    return await db.select().from(projectScores)
      .where(eq(projectScores.projectId, projectId))
      .orderBy(desc(projectScores.scoredAt));
  }

  async getProjectScore(id: number): Promise<ProjectScore | undefined> {
    const [score] = await db.select().from(projectScores)
      .where(eq(projectScores.id, id));
    return score;
  }

  async createProjectScore(score: InsertProjectScore): Promise<ProjectScore> {
    const [created] = await db.insert(projectScores).values(score).returning();
    return created;
  }

  async updateProjectScore(id: number, updates: Partial<InsertProjectScore>): Promise<ProjectScore> {
    const [updated] = await db.update(projectScores)
      .set(updates)
      .where(eq(projectScores.id, id))
      .returning();
    return updated;
  }

  async deleteProjectScore(id: number): Promise<void> {
    await db.delete(projectScores).where(eq(projectScores.id, id));
  }

  async upsertProjectScore(projectId: number, criteriaId: number, score: number, justification: string | null, scoredBy: string | null): Promise<ProjectScore> {
    const existing = await db.select().from(projectScores)
      .where(and(
        eq(projectScores.projectId, projectId),
        eq(projectScores.criteriaId, criteriaId)
      ));
    
    if (existing.length > 0) {
      const [updated] = await db.update(projectScores)
        .set({ score, justification, scoredBy, scoredAt: new Date() })
        .where(eq(projectScores.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(projectScores).values({
        projectId,
        criteriaId,
        score,
        justification,
        scoredBy
      }).returning();
      return created;
    }
  }

  // Project Benefits
  async getProjectBenefits(projectId: number): Promise<ProjectBenefit[]> {
    return await db.select().from(projectBenefits)
      .where(eq(projectBenefits.projectId, projectId))
      .orderBy(desc(projectBenefits.createdAt));
  }

  async getProjectBenefit(id: number): Promise<ProjectBenefit | undefined> {
    const [benefit] = await db.select().from(projectBenefits)
      .where(eq(projectBenefits.id, id));
    return benefit;
  }

  async createProjectBenefit(benefit: InsertProjectBenefit): Promise<ProjectBenefit> {
    const [created] = await db.insert(projectBenefits).values(benefit).returning();
    return created;
  }

  async updateProjectBenefit(id: number, updates: Partial<InsertProjectBenefit>): Promise<ProjectBenefit> {
    const [updated] = await db.update(projectBenefits)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectBenefits.id, id))
      .returning();
    return updated;
  }

  async deleteProjectBenefit(id: number): Promise<void> {
    await db.delete(projectBenefits).where(eq(projectBenefits.id, id));
  }

  // Project Decisions
  async getProjectDecisions(projectId: number): Promise<ProjectDecision[]> {
    return await db.select().from(projectDecisions)
      .where(eq(projectDecisions.projectId, projectId))
      .orderBy(desc(projectDecisions.createdAt));
  }

  async getProjectDecision(id: number): Promise<ProjectDecision | undefined> {
    const [decision] = await db.select().from(projectDecisions)
      .where(eq(projectDecisions.id, id));
    return decision;
  }

  async createProjectDecision(decision: InsertProjectDecision): Promise<ProjectDecision> {
    const [created] = await db.insert(projectDecisions).values(decision).returning();
    return created;
  }

  async updateProjectDecision(id: number, updates: Partial<InsertProjectDecision>): Promise<ProjectDecision> {
    const [updated] = await db.update(projectDecisions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectDecisions.id, id))
      .returning();
    return updated;
  }

  async deleteProjectDecision(id: number): Promise<void> {
    await db.delete(projectDecisions).where(eq(projectDecisions.id, id));
  }

  // Lessons Learned
  async getLessonsLearned(projectId: number): Promise<LessonLearned[]> {
    return await db.select().from(lessonsLearned)
      .where(eq(lessonsLearned.projectId, projectId))
      .orderBy(desc(lessonsLearned.createdAt));
  }

  async getAllLessonsLearned(organizationId: number): Promise<LessonLearned[]> {
    return await db.select().from(lessonsLearned)
      .where(eq(lessonsLearned.organizationId, organizationId))
      .orderBy(desc(lessonsLearned.createdAt));
  }

  async getLessonLearned(id: number): Promise<LessonLearned | undefined> {
    const [lesson] = await db.select().from(lessonsLearned)
      .where(eq(lessonsLearned.id, id));
    return lesson;
  }

  async createLessonLearned(lesson: InsertLessonLearned): Promise<LessonLearned> {
    const [created] = await db.insert(lessonsLearned).values(lesson).returning();
    return created;
  }

  async updateLessonLearned(id: number, updates: Partial<InsertLessonLearned>): Promise<LessonLearned> {
    const [updated] = await db.update(lessonsLearned)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(lessonsLearned.id, id))
      .returning();
    return updated;
  }

  async deleteLessonLearned(id: number): Promise<void> {
    await db.delete(lessonsLearned).where(eq(lessonsLearned.id, id));
  }

  async createPortfolioRiskAssessment(assessment: InsertPortfolioRiskAssessment): Promise<PortfolioRiskAssessment> {
    const [created] = await db.insert(portfolioRiskAssessments).values(assessment).returning();
    return created;
  }

  async getLatestPortfolioRiskAssessment(portfolioId: number): Promise<PortfolioRiskAssessment | undefined> {
    const [result] = await db.select().from(portfolioRiskAssessments)
      .where(eq(portfolioRiskAssessments.portfolioId, portfolioId))
      .orderBy(desc(portfolioRiskAssessments.generatedAt))
      .limit(1);
    return result;
  }

  async getLatestRiskAssessmentsForOrg(organizationId: number): Promise<PortfolioRiskAssessment[]> {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    return await db.select().from(portfolioRiskAssessments)
      .where(and(
        eq(portfolioRiskAssessments.organizationId, organizationId),
        sql`${portfolioRiskAssessments.generatedAt} >= ${fiveDaysAgo}`
      ))
      .orderBy(desc(portfolioRiskAssessments.generatedAt));
  }

  async getPortfolioRiskAssessmentByShareToken(shareToken: string): Promise<PortfolioRiskAssessment | undefined> {
    const [result] = await db.select().from(portfolioRiskAssessments)
      .where(eq(portfolioRiskAssessments.shareToken, shareToken));
    return result;
  }

  async getPortfolioRiskAssessmentHistory(portfolioId: number): Promise<Pick<PortfolioRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]> {
    return await db.select({
      id: portfolioRiskAssessments.id,
      riskScore: portfolioRiskAssessments.riskScore,
      generatedAt: portfolioRiskAssessments.generatedAt,
    }).from(portfolioRiskAssessments)
      .where(eq(portfolioRiskAssessments.portfolioId, portfolioId))
      .orderBy(portfolioRiskAssessments.generatedAt);
  }

  async createProjectRiskAssessment(assessment: InsertProjectRiskAssessment): Promise<ProjectRiskAssessment> {
    const [created] = await db.insert(projectRiskAssessments).values(assessment).returning();
    return created;
  }

  async getLatestProjectRiskAssessmentsForOrg(organizationId: number): Promise<ProjectRiskAssessment[]> {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    return await db.select().from(projectRiskAssessments)
      .where(and(
        eq(projectRiskAssessments.organizationId, organizationId),
        sql`${projectRiskAssessments.generatedAt} >= ${fiveDaysAgo}`
      ))
      .orderBy(desc(projectRiskAssessments.generatedAt));
  }

  async getLatestProjectRiskAssessment(projectId: number): Promise<ProjectRiskAssessment | undefined> {
    const [result] = await db.select().from(projectRiskAssessments)
      .where(eq(projectRiskAssessments.projectId, projectId))
      .orderBy(desc(projectRiskAssessments.generatedAt))
      .limit(1);
    return result;
  }

  async getProjectRiskAssessmentByShareToken(shareToken: string): Promise<ProjectRiskAssessment | undefined> {
    const [result] = await db.select().from(projectRiskAssessments)
      .where(eq(projectRiskAssessments.shareToken, shareToken));
    return result;
  }

  async getProjectRiskAssessmentHistory(projectId: number): Promise<Pick<ProjectRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]> {
    return await db.select({
      id: projectRiskAssessments.id,
      riskScore: projectRiskAssessments.riskScore,
      generatedAt: projectRiskAssessments.generatedAt,
    }).from(projectRiskAssessments)
      .where(eq(projectRiskAssessments.projectId, projectId))
      .orderBy(projectRiskAssessments.generatedAt);
  }
}

export const storage = new DatabaseStorage();
