import type {
  User, UpsertUser,
  Organization, InsertOrganization,
  OrganizationMember, InsertOrganizationMember,
  OrganizationInvite, InsertOrganizationInvite,
  OrganizationAccessRequest, InsertOrganizationAccessRequest,
  ExternalShare, InsertExternalShare,
  Portfolio, InsertPortfolio, UpdatePortfolioRequest,
  Project, InsertProject, UpdateProjectRequest,
  Risk, InsertRisk, UpdateRiskRequest,
  Milestone, InsertMilestone, UpdateMilestoneRequest,
  PortfolioKeyDate, InsertPortfolioKeyDate, UpdatePortfolioKeyDateRequest,
  Issue, InsertIssue, UpdateIssueRequest,
  Task, InsertTask, UpdateTaskRequest,
  TaskChangeLog, InsertTaskChangeLog,
  ProjectChangeLog, InsertProjectChangeLog,
  RiskChangeLog, InsertRiskChangeLog,
  IssueChangeLog, InsertIssueChangeLog,
  TaskDependency, InsertTaskDependency,
  ProjectFinancial, InsertProjectFinancial, UpdateProjectFinancialRequest,
  Resource, InsertResource, UpdateResourceRequest,
  TaskResourceAssignment, InsertTaskResourceAssignment,
  IssueResourceAssignment, InsertIssueResourceAssignment,
  RiskResourceAssignment, InsertRiskResourceAssignment,
  CostItem, InsertCostItem, UpdateCostItemRequest,
  ProjectIntake, InsertProjectIntake, UpdateProjectIntakeRequest,
  MppImport, InsertMppImport,
  MppImportTask, InsertMppImportTask,
  ChangeRequest, InsertChangeRequest, UpdateChangeRequestRequest,
  ProjectDocument, InsertProjectDocument, UpdateProjectDocumentRequest,
  ProjectComment, InsertProjectComment,
  BillableStatusComment, InsertBillableStatusComment,
  HealthStatusHistory, InsertHealthStatusHistory,
  ProjectInvoice, InsertProjectInvoice,
  InvoiceNote, InsertInvoiceNote,
  Notification, InsertNotification,
  StatusReportHistory, InsertStatusReportHistory,
  IntakeWorkflowStep, InsertIntakeWorkflowStep,
  TimesheetEntry, InsertTimesheetEntry, UpdateTimesheetEntryRequest,
  TimeCategory, InsertTimeCategory,
  NonProjectTimeEntry, InsertNonProjectTimeEntry,
  TimesheetPeriod, InsertTimesheetPeriod,
  TimesheetSettings, InsertTimesheetSettings,
  TimesheetAuditLog, InsertTimesheetAuditLog,
  ApprovalDelegation, InsertApprovalDelegation,
  RejectionTemplate, InsertRejectionTemplate,
  TimesheetComment, InsertTimesheetComment,
  RecycleBinItem, RecycleBinItemType,
  ProjectView, InsertProjectView, UpdateProjectViewRequest,
  SystemProjectView, InsertSystemProjectView, UpdateSystemProjectViewRequest,
  UserConsent, InsertUserConsent,
  CustomFieldDefinition, InsertCustomFieldDefinition, UpdateCustomFieldDefinitionRequest,
  ProjectCustomFieldValue, InsertProjectCustomFieldValue,
  CustomProjectTab, InsertCustomProjectTab,
  CustomTabSection, InsertCustomTabSection,
  CustomTabField, InsertCustomTabField,
  ResourceSkill, InsertResourceSkill,
  ResourceAvailability, InsertResourceAvailability,
  PortfolioRiskAssessment, InsertPortfolioRiskAssessment,
  ProjectRiskAssessment, InsertProjectRiskAssessment,
  ApiToken, InsertApiToken,
  ProjectTemplate, InsertProjectTemplate,
  ProjectTemplateItem, InsertProjectTemplateItem,
} from "@shared/schema";
import type { BillingTransaction, InsertBillingTransaction } from "@shared/models/billing";

export interface TaskDateFilterOptions {
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  overdue?: boolean;
  today?: string;
  sortBy?: 'startDate' | 'endDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface IUserStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByApiKey(apiKey: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  getUserConsents(userId: string): Promise<UserConsent[]>;
  getUserConsentByType(userId: string, consentType: string): Promise<UserConsent | undefined>;
  createUserConsent(consent: InsertUserConsent): Promise<UserConsent>;
  revokeUserConsent(id: number): Promise<UserConsent>;
  getAllUserConsents(limit?: number, offset?: number): Promise<UserConsent[]>;
  getUserConsentStats(): Promise<{ consentType: string; version: string; count: number }[]>;
  createApiToken(data: InsertApiToken): Promise<ApiToken>;
  getApiTokenByToken(token: string): Promise<(ApiToken & { user: User }) | undefined>;
  getApiTokensByUserAndOrg(userId: string, organizationId: number): Promise<ApiToken[]>;
  deleteApiToken(id: number): Promise<void>;
  updateApiTokenLastUsed(id: number): Promise<void>;
}

export interface IOrganizationStorage {
  getOrganizations(): Promise<Organization[]>;
  getDeactivatedOrganizations(): Promise<Organization[]>;
  getAllOrganizations(): Promise<Organization[]>;
  getOrganization(id: number): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, updates: Partial<InsertOrganization>): Promise<Organization>;
  deactivateOrganization(id: number, deactivatedBy: string): Promise<Organization>;
  reactivateOrganization(id: number): Promise<Organization>;
  deleteOrganization(id: number): Promise<void>;
  getOrganizationMembers(organizationId: number): Promise<OrganizationMember[]>;
  getUserOrganizations(userId: string): Promise<OrganizationMember[]>;
  getUserOrganizationsWithDetails(userId: string): Promise<Organization[]>;
  addOrganizationMember(member: InsertOrganizationMember): Promise<OrganizationMember>;
  updateOrganizationMemberRole(organizationId: number, userId: string, role: string): Promise<OrganizationMember>;
  removeOrganizationMember(organizationId: number, userId: string): Promise<void>;
  getOrganizationInvites(organizationId: number): Promise<OrganizationInvite[]>;
  getPendingInvitesByEmail(email: string): Promise<OrganizationInvite[]>;
  createOrganizationInvite(invite: InsertOrganizationInvite): Promise<OrganizationInvite>;
  cancelOrganizationInvite(id: number): Promise<void>;
  claimInvitesForUser(email: string, userId: string): Promise<OrganizationMember[]>;
  getOrganizationAccessRequests(organizationId: number): Promise<OrganizationAccessRequest[]>;
  getPendingAccessRequestByUser(organizationId: number, userId: string): Promise<OrganizationAccessRequest | undefined>;
  createOrganizationAccessRequest(request: InsertOrganizationAccessRequest): Promise<OrganizationAccessRequest>;
  updateAccessRequestStatus(id: number, status: string, reviewedBy: string): Promise<OrganizationAccessRequest>;
  getOrganizationIntegrations(organizationId: number): Promise<{ id: number; organizationId: number; integrationType: string; connectionStatus: string | null }[]>;
  getExternalSharesForUser(userId: string): Promise<ExternalShare[]>;
  getExternalSharesForObject(objectType: string, objectId: number): Promise<ExternalShare[]>;
  createExternalShare(share: InsertExternalShare): Promise<ExternalShare>;
  revokeExternalShare(id: number): Promise<void>;
  getExternalShare(objectType: string, objectId: number, userId: string): Promise<ExternalShare | undefined>;
}

export interface IPortfolioStorage {
  getPortfolios(organizationId?: number): Promise<Portfolio[]>;
  getPortfolio(id: number): Promise<Portfolio | undefined>;
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, updates: UpdatePortfolioRequest): Promise<Portfolio>;
  deletePortfolio(id: number): Promise<void>;
  createPortfolioRiskAssessment(assessment: InsertPortfolioRiskAssessment): Promise<PortfolioRiskAssessment>;
  getLatestPortfolioRiskAssessment(portfolioId: number): Promise<PortfolioRiskAssessment | undefined>;
  getLatestRiskAssessmentsForOrg(organizationId: number): Promise<PortfolioRiskAssessment[]>;
  getPortfolioRiskAssessmentByShareToken(shareToken: string): Promise<PortfolioRiskAssessment | undefined>;
  getPortfolioRiskAssessmentHistory(portfolioId: number): Promise<Pick<PortfolioRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]>;
  getPortfolioKeyDates(portfolioId: number): Promise<PortfolioKeyDate[]>;
  getPortfolioKeyDate(id: number): Promise<PortfolioKeyDate | undefined>;
  createPortfolioKeyDate(data: InsertPortfolioKeyDate): Promise<PortfolioKeyDate>;
  updatePortfolioKeyDate(id: number, updates: UpdatePortfolioKeyDateRequest): Promise<PortfolioKeyDate>;
  deletePortfolioKeyDate(id: number, deletedBy?: string): Promise<void>;
}

export interface IProjectStorage {
  getProjects(organizationId?: number, portfolioId?: number, isInternal?: boolean): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: UpdateProjectRequest): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  getRisks(projectId: number): Promise<Risk[]>;
  getRisk(id: number): Promise<Risk | undefined>;
  createRisk(risk: InsertRisk): Promise<Risk>;
  updateRisk(id: number, updates: UpdateRiskRequest): Promise<Risk>;
  deleteRisk(id: number): Promise<void>;
  getMilestones(projectId: number): Promise<Milestone[]>;
  getAllMilestones(): Promise<Milestone[]>;
  createMilestone(milestone: InsertMilestone): Promise<Milestone>;
  updateMilestone(id: number, updates: UpdateMilestoneRequest): Promise<Milestone>;
  deleteMilestone(id: number): Promise<void>;
  getIssues(projectId: number): Promise<Issue[]>;
  getAllIssues(): Promise<Issue[]>;
  getIssue(id: number): Promise<Issue | undefined>;
  createIssue(issue: InsertIssue): Promise<Issue>;
  updateIssue(id: number, updates: UpdateIssueRequest): Promise<Issue>;
  deleteIssue(id: number): Promise<void>;
  getProjectChangeLogs(projectId: number): Promise<ProjectChangeLog[]>;
  createProjectChangeLog(log: InsertProjectChangeLog): Promise<ProjectChangeLog>;
  getRiskChangeLogs(riskId: number): Promise<RiskChangeLog[]>;
  createRiskChangeLog(log: InsertRiskChangeLog): Promise<RiskChangeLog>;
  getIssueChangeLogs(issueId: number): Promise<IssueChangeLog[]>;
  createIssueChangeLog(log: InsertIssueChangeLog): Promise<IssueChangeLog>;
  getRecentOrgActivity(organizationId: number, limit: number): Promise<{ type: string; entityName: string; entityId: number; action: string; summary: string; changedBy: string; changedAt: Date | null }[]>;
  getChangeRequests(projectId: number): Promise<ChangeRequest[]>;
  getChangeRequest(id: number): Promise<ChangeRequest | undefined>;
  createChangeRequest(changeRequest: InsertChangeRequest): Promise<ChangeRequest>;
  updateChangeRequest(id: number, updates: UpdateChangeRequestRequest): Promise<ChangeRequest>;
  deleteChangeRequest(id: number): Promise<void>;
  getProjectDocuments(projectId: number): Promise<ProjectDocument[]>;
  getProjectDocument(id: number): Promise<ProjectDocument | undefined>;
  createProjectDocument(document: InsertProjectDocument): Promise<ProjectDocument>;
  updateProjectDocument(id: number, updates: UpdateProjectDocumentRequest): Promise<ProjectDocument>;
  deleteProjectDocument(id: number): Promise<void>;
  getProjectComments(projectId: number): Promise<ProjectComment[]>;
  getProjectComment(id: number): Promise<ProjectComment | undefined>;
  createProjectComment(comment: InsertProjectComment): Promise<ProjectComment>;
  deleteProjectComment(id: number): Promise<void>;
  getBillableStatusComments(projectId: number): Promise<BillableStatusComment[]>;
  createBillableStatusComment(comment: InsertBillableStatusComment): Promise<BillableStatusComment>;
  getHealthStatusHistory(projectId: number): Promise<HealthStatusHistory[]>;
  createHealthStatusHistory(entry: InsertHealthStatusHistory): Promise<HealthStatusHistory>;
  getProjectInvoices(projectId: number): Promise<ProjectInvoice[]>;
  getOrganizationInvoices(organizationId: number): Promise<ProjectInvoice[]>;
  getProjectInvoice(id: number): Promise<ProjectInvoice | undefined>;
  getProjectInvoiceByExternalId(externalId: string, organizationId: number, source: string): Promise<ProjectInvoice | undefined>;
  createProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice>;
  upsertProjectInvoice(invoice: InsertProjectInvoice): Promise<ProjectInvoice>;
  updateProjectInvoice(id: number, updates: Partial<InsertProjectInvoice>): Promise<ProjectInvoice>;
  deleteProjectInvoice(id: number): Promise<void>;
  getInvoiceNotes(invoiceId: number): Promise<InvoiceNote[]>;
  createInvoiceNote(note: InsertInvoiceNote): Promise<InvoiceNote>;
  createProjectRiskAssessment(assessment: InsertProjectRiskAssessment): Promise<ProjectRiskAssessment>;
  getLatestProjectRiskAssessment(projectId: number): Promise<ProjectRiskAssessment | undefined>;
  getLatestProjectRiskAssessmentsForOrg(organizationId: number): Promise<ProjectRiskAssessment[]>;
  getProjectRiskAssessmentByShareToken(shareToken: string): Promise<ProjectRiskAssessment | undefined>;
  getProjectRiskAssessmentHistory(projectId: number): Promise<Pick<ProjectRiskAssessment, 'id' | 'riskScore' | 'generatedAt'>[]>;
  getProjectTemplates(organizationId: number): Promise<ProjectTemplate[]>;
  getProjectTemplate(id: number): Promise<ProjectTemplate | undefined>;
  createProjectTemplate(template: InsertProjectTemplate): Promise<ProjectTemplate>;
  updateProjectTemplate(id: number, updates: Partial<InsertProjectTemplate>): Promise<ProjectTemplate>;
  deleteProjectTemplate(id: number): Promise<void>;
  getProjectTemplateItems(templateId: number): Promise<ProjectTemplateItem[]>;
  createProjectTemplateItems(items: InsertProjectTemplateItem[]): Promise<ProjectTemplateItem[]>;
  deleteProjectTemplateItems(templateId: number): Promise<void>;
}

export interface ITaskStorage {
  getTasks(projectId: number): Promise<Task[]>;
  getTasksByProject(projectId: number): Promise<Task[]>;
  getAllTasks(): Promise<Task[]>;
  getTasksByOrganization(organizationId: number): Promise<Task[]>;
  getTasksByOrganizationPaginated(organizationId: number, limit: number, offset: number, onlyTaskIds?: number[], dateFilters?: TaskDateFilterOptions): Promise<{ tasks: Task[]; total: number }>;
  getTasksByMultipleOrganizationsPaginated(orgIds: number[], limit: number, offset: number, restrictedTaskIds?: number[], unrestrictedOrgIds?: number[], dateFilters?: TaskDateFilterOptions): Promise<{ tasks: Task[]; total: number }>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: UpdateTaskRequest): Promise<Task>;
  batchUpdateTaskWbs(updates: Array<{ id: number; wbs: string }>): Promise<void>;
  batchUpdateTaskParentIds(updates: Array<{ id: number; parentId: number | null }>): Promise<void>;
  batchUpdateTaskFields(updates: import('./taskStorage').BatchTaskFieldUpdate[]): Promise<void>;
  getResourcesByUserId(userId: string, organizationId: number): Promise<Resource[]>;
  getTaskResourceAssignmentsByOrgId(organizationId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  deleteTask(id: number): Promise<void>;
  getTaskChangeLogs(taskId: number): Promise<TaskChangeLog[]>;
  createTaskChangeLog(log: InsertTaskChangeLog): Promise<TaskChangeLog>;
  getTaskDependencies(taskId: number): Promise<TaskDependency[]>;
  getTaskDependents(taskId: number): Promise<TaskDependency[]>;
  getProjectDependencies(projectId: number): Promise<TaskDependency[]>;
  createTaskDependency(dependency: InsertTaskDependency): Promise<TaskDependency>;
  updateTaskDependency(taskId: number, dependsOnTaskId: number, updates: { dependencyType?: string; lagDays?: number }): Promise<TaskDependency | undefined>;
  deleteTaskDependency(taskId: number, dependsOnTaskId: number): Promise<void>;
}

export interface IResourceStorage {
  getResources(organizationId: number): Promise<Resource[]>;
  getResource(id: number): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: number, updates: UpdateResourceRequest): Promise<Resource>;
  deleteResource(id: number): Promise<void>;
  mergeResources(primaryId: number, secondaryId: number): Promise<Resource>;
  getResourceSkills(resourceId: number): Promise<ResourceSkill[]>;
  getResourceSkillsByOrg(organizationId: number): Promise<ResourceSkill[]>;
  addResourceSkill(skill: InsertResourceSkill): Promise<ResourceSkill>;
  removeResourceSkill(id: number): Promise<void>;
  updateResourceSkill(id: number, updates: Partial<InsertResourceSkill>): Promise<ResourceSkill>;
  getResourceAvailability(resourceId: number): Promise<ResourceAvailability[]>;
  getResourceAvailabilityByOrg(organizationId: number, startDate?: string, endDate?: string): Promise<ResourceAvailability[]>;
  addResourceAvailability(entry: InsertResourceAvailability): Promise<ResourceAvailability>;
  updateResourceAvailability(id: number, updates: Partial<InsertResourceAvailability>): Promise<ResourceAvailability>;
  removeResourceAvailability(id: number): Promise<void>;
  getTaskResourceAssignments(taskId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  getProjectTaskResourceAssignments(projectId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  getAllTaskResourceAssignments(organizationId: number): Promise<(TaskResourceAssignment & { resource: Resource })[]>;
  getAssignedTasksForResource(resourceId: number, organizationId: number, userId?: string): Promise<{ task: Task; project: Project }[]>;
  addTaskResourceAssignment(assignment: InsertTaskResourceAssignment): Promise<TaskResourceAssignment>;
  removeTaskResourceAssignment(taskId: number, resourceId: number): Promise<void>;
  updateTaskResourceAssignments(taskId: number, resourceIds: number[], allocations?: { resourceId: number; allocationPercentage: number }[]): Promise<void>;
  getIssueResourceAssignments(issueId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]>;
  getAllIssueResourceAssignments(organizationId: number): Promise<(IssueResourceAssignment & { resource: Resource })[]>;
  addIssueResourceAssignment(assignment: InsertIssueResourceAssignment): Promise<IssueResourceAssignment>;
  removeIssueResourceAssignment(issueId: number, resourceId: number): Promise<void>;
  updateIssueResourceAssignments(issueId: number, resourceIds: number[]): Promise<void>;
  getRiskResourceAssignments(riskId: number): Promise<(RiskResourceAssignment & { resource: Resource })[]>;
  addRiskResourceAssignment(assignment: InsertRiskResourceAssignment): Promise<RiskResourceAssignment>;
  removeRiskResourceAssignment(riskId: number, resourceId: number): Promise<void>;
  updateRiskResourceAssignments(riskId: number, resourceIds: number[]): Promise<void>;
}

export interface IFinancialStorage {
  getProjectFinancials(projectId: number): Promise<ProjectFinancial[]>;
  getProjectFinancial(id: number): Promise<ProjectFinancial | undefined>;
  createProjectFinancial(financial: InsertProjectFinancial): Promise<ProjectFinancial>;
  updateProjectFinancial(id: number, updates: UpdateProjectFinancialRequest): Promise<ProjectFinancial>;
  deleteProjectFinancial(id: number): Promise<void>;
  getCostItems(projectId: number, fiscalYear?: number): Promise<CostItem[]>;
  getCostItem(id: number): Promise<CostItem | undefined>;
  createCostItem(costItem: InsertCostItem): Promise<CostItem>;
  updateCostItem(id: number, updates: UpdateCostItemRequest): Promise<CostItem>;
  deleteCostItem(id: number): Promise<void>;
  getBillingTransactions(userId?: string, orgId?: number, limit?: number, offset?: number): Promise<BillingTransaction[]>;
  getBillingTransaction(id: number): Promise<BillingTransaction | undefined>;
  createBillingTransaction(transaction: InsertBillingTransaction): Promise<BillingTransaction>;
}

export interface ITimesheetStorage {
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
  getTimesheetSettings(organizationId: number): Promise<TimesheetSettings | undefined>;
  upsertTimesheetSettings(settings: InsertTimesheetSettings): Promise<TimesheetSettings>;
  createTimesheetAuditLog(log: InsertTimesheetAuditLog): Promise<TimesheetAuditLog>;
  getTimesheetAuditLogs(organizationId: number, filters?: { entryId?: number; actorId?: string; action?: string; limit?: number; offset?: number }): Promise<TimesheetAuditLog[]>;
  getTimesheetAuditLogsForEntry(entryId: number): Promise<TimesheetAuditLog[]>;
  getTimeCategories(organizationId: number): Promise<TimeCategory[]>;
  getTimeCategory(id: number): Promise<TimeCategory | undefined>;
  createTimeCategory(category: InsertTimeCategory): Promise<TimeCategory>;
  updateTimeCategory(id: number, updates: Partial<InsertTimeCategory>): Promise<TimeCategory>;
  deleteTimeCategory(id: number): Promise<void>;
  getNonProjectTimeEntry(id: number): Promise<NonProjectTimeEntry | undefined>;
  getAllNonProjectTimeEntriesWithCategory(organizationId: number, startDate: string, endDate: string): Promise<{ entry: NonProjectTimeEntry; category: TimeCategory }[]>;
  getNonProjectTimeEntries(userId: string, organizationId: number, startDate: string, endDate: string): Promise<NonProjectTimeEntry[]>;
  getNonProjectTimeEntriesWithCategory(userId: string, organizationId: number, startDate: string, endDate: string): Promise<{ entry: NonProjectTimeEntry; category: TimeCategory }[]>;
  createNonProjectTimeEntry(entry: InsertNonProjectTimeEntry): Promise<NonProjectTimeEntry>;
  updateNonProjectTimeEntry(id: number, updates: Partial<InsertNonProjectTimeEntry>): Promise<NonProjectTimeEntry>;
  deleteNonProjectTimeEntry(id: number): Promise<void>;
  getTimesheetPeriods(organizationId: number): Promise<TimesheetPeriod[]>;
  getTimesheetPeriod(id: number): Promise<TimesheetPeriod | undefined>;
  getClosedPeriodsForDateRange(organizationId: number, startDate: string, endDate: string): Promise<TimesheetPeriod[]>;
  createTimesheetPeriod(period: InsertTimesheetPeriod): Promise<TimesheetPeriod>;
  closeTimesheetPeriod(id: number, closedBy: string): Promise<TimesheetPeriod>;
  reopenTimesheetPeriod(id: number, reopenedBy: string): Promise<TimesheetPeriod>;
  deleteTimesheetPeriod(id: number): Promise<void>;
  getApprovalDelegations(organizationId: number): Promise<ApprovalDelegation[]>;
  getActiveDelegationsForDelegate(delegateId: string, organizationId: number): Promise<ApprovalDelegation[]>;
  getActiveDelegationsForDelegator(delegatorId: string, organizationId: number): Promise<ApprovalDelegation[]>;
  createApprovalDelegation(delegation: InsertApprovalDelegation): Promise<ApprovalDelegation>;
  revokeApprovalDelegation(id: number): Promise<ApprovalDelegation>;
  getRejectionTemplates(organizationId: number): Promise<RejectionTemplate[]>;
  getRejectionTemplate(id: number): Promise<RejectionTemplate | undefined>;
  createRejectionTemplate(template: InsertRejectionTemplate): Promise<RejectionTemplate>;
  updateRejectionTemplate(id: number, updates: Partial<InsertRejectionTemplate>): Promise<RejectionTemplate>;
  deleteRejectionTemplate(id: number): Promise<void>;
  getTimesheetComments(entryId: number): Promise<TimesheetComment[]>;
  createTimesheetComment(comment: InsertTimesheetComment): Promise<TimesheetComment>;
}

export interface IIntakeStorage {
  getProjectIntakes(organizationId: number): Promise<ProjectIntake[]>;
  getProjectIntake(id: number): Promise<ProjectIntake | undefined>;
  createProjectIntake(intake: InsertProjectIntake): Promise<ProjectIntake>;
  updateProjectIntake(id: number, updates: UpdateProjectIntakeRequest): Promise<ProjectIntake>;
  deleteProjectIntake(id: number): Promise<void>;
  approveProjectIntake(id: number, approvedBy: string): Promise<Project>;
  getMppImports(organizationId: number): Promise<MppImport[]>;
  getMppImport(id: number): Promise<MppImport | undefined>;
  createMppImport(mppImport: InsertMppImport): Promise<MppImport>;
  updateMppImport(id: number, updates: Partial<InsertMppImport>): Promise<MppImport>;
  deleteMppImport(id: number): Promise<void>;
  getMppImportTasks(importId: number): Promise<MppImportTask[]>;
  createMppImportTask(task: InsertMppImportTask): Promise<MppImportTask>;
  createMppImportTasks(tasks: InsertMppImportTask[]): Promise<MppImportTask[]>;
  deleteMppImportTasks(importId: number): Promise<void>;
  getIntakeWorkflowSteps(organizationId: number): Promise<IntakeWorkflowStep[]>;
  upsertIntakeWorkflowSteps(organizationId: number, steps: InsertIntakeWorkflowStep[]): Promise<IntakeWorkflowStep[]>;
  resetIntakeWorkflowToDefaults(organizationId: number): Promise<IntakeWorkflowStep[]>;
}

export interface IMiscStorage {
  search(query: string, organizationIds?: number[]): Promise<{
    portfolios: Portfolio[];
    projects: Project[];
    tasks: Task[];
    issues: Issue[];
    risks: Risk[];
    milestones: Milestone[];
  }>;
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
    changeRequests: number;
    documents: number;
    benefits: number;
    decisions: number;
    timesheets: number;
    assignments: number;
    keyDates: number;
  }>;
  getDeletedItems(organizationId: number): Promise<RecycleBinItem[]>;
  softDeleteItem(type: RecycleBinItemType, id: number, userId: string, organizationId?: number): Promise<boolean>;
  restoreItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean>;
  permanentlyDeleteItem(type: RecycleBinItemType, id: number, organizationId: number): Promise<boolean>;
  getProjectViews(organizationId: number, userId: string, mode: string): Promise<ProjectView[]>;
  getProjectView(id: number): Promise<ProjectView | undefined>;
  createProjectView(view: InsertProjectView): Promise<ProjectView>;
  updateProjectView(id: number, updates: UpdateProjectViewRequest): Promise<ProjectView>;
  deleteProjectView(id: number): Promise<void>;
  setDefaultProjectView(organizationId: number, userId: string, mode: string, viewId: number): Promise<void>;
  getSystemProjectViews(organizationId: number, mode: string): Promise<SystemProjectView[]>;
  getSystemProjectView(id: number): Promise<SystemProjectView | undefined>;
  createSystemProjectView(view: InsertSystemProjectView): Promise<SystemProjectView>;
  updateSystemProjectView(id: number, updates: UpdateSystemProjectViewRequest): Promise<SystemProjectView>;
  deleteSystemProjectView(id: number): Promise<void>;
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getStatusReportHistory(projectId: number): Promise<StatusReportHistory[]>;
  getStatusReportHistoryByOrg(organizationId: number): Promise<StatusReportHistory[]>;
  createStatusReportHistory(report: InsertStatusReportHistory): Promise<StatusReportHistory>;
  getCustomFieldDefinitions(organizationId: number): Promise<CustomFieldDefinition[]>;
  getCustomFieldDefinition(id: number): Promise<CustomFieldDefinition | undefined>;
  createCustomFieldDefinition(field: InsertCustomFieldDefinition): Promise<CustomFieldDefinition>;
  updateCustomFieldDefinition(id: number, updates: UpdateCustomFieldDefinitionRequest): Promise<CustomFieldDefinition>;
  deleteCustomFieldDefinition(id: number): Promise<void>;
  getProjectCustomFieldValues(projectId: number): Promise<ProjectCustomFieldValue[]>;
  getProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<ProjectCustomFieldValue | undefined>;
  upsertProjectCustomFieldValue(value: InsertProjectCustomFieldValue): Promise<ProjectCustomFieldValue>;
  deleteProjectCustomFieldValue(projectId: number, fieldDefinitionId: number): Promise<void>;
  getCustomProjectTabs(organizationId: number): Promise<CustomProjectTab[]>;
  getCustomProjectTab(id: number): Promise<CustomProjectTab | undefined>;
  createCustomProjectTab(tab: InsertCustomProjectTab): Promise<CustomProjectTab>;
  updateCustomProjectTab(id: number, updates: Partial<InsertCustomProjectTab>): Promise<CustomProjectTab>;
  deleteCustomProjectTab(id: number): Promise<void>;
  getCustomTabSections(tabId: number): Promise<CustomTabSection[]>;
  getCustomTabSection(id: number): Promise<CustomTabSection | undefined>;
  createCustomTabSection(section: InsertCustomTabSection): Promise<CustomTabSection>;
  updateCustomTabSection(id: number, updates: Partial<InsertCustomTabSection>): Promise<CustomTabSection>;
  deleteCustomTabSection(id: number): Promise<void>;
  getCustomTabFields(sectionId: number): Promise<CustomTabField[]>;
  getCustomTabField(id: number): Promise<CustomTabField | undefined>;
  createCustomTabField(field: InsertCustomTabField): Promise<CustomTabField>;
  updateCustomTabField(id: number, updates: Partial<InsertCustomTabField>): Promise<CustomTabField>;
  deleteCustomTabField(id: number): Promise<void>;
  getFullCustomProjectTab(tabId: number): Promise<{ tab: CustomProjectTab; sections: (CustomTabSection & { fields: CustomTabField[] })[] } | undefined>;
}

export interface IStorage extends
  IUserStorage,
  IOrganizationStorage,
  IPortfolioStorage,
  IProjectStorage,
  ITaskStorage,
  IResourceStorage,
  IFinancialStorage,
  ITimesheetStorage,
  IIntakeStorage,
  IMiscStorage {}
