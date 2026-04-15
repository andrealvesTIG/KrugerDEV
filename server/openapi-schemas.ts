import { drizzleTableToOpenApiSchema, createRequestSchema, validateSchemas } from './openapi-schema-generator';
import {
  organizations,
  portfolios,
  portfolioKeyDates,
  projects,
  tasks,
  milestones,
  issues,
  resources,
  timesheetEntries,
  projectInvoices,
  projectIntakes,
  taskDependencies,
  projectDocuments,
  projectComments,
  changeRequests,
  notifications,
  customDashboards,
  helpTickets,
  mppImports,
  projectFinancials,
  costItems,
  projectRiskAssessments,
  customFieldDefinitions,
  customProjectTabs,
  projectScoringCriteria,
  projectScores,
  portfolioScoringConfig,
  projectBenefits,
  projectDecisions,
  lessonsLearned,
  reportSubscriptions,
  timesheetPeriods,
  projectViews,
  projectTemplates,
  timesheetAuditLog,
  timesheetComments,
  timesheetReminderSettings,
  timesheetSettings,
  referralCodes,
  users,
  plans,
} from '@shared/schema';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const STATUS_ENUMS = {
  project: ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closing', 'Billing', 'On Hold', 'Cancelled', 'Closed'],
  task: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
  priority: ['Low', 'Medium', 'High', 'Critical'],
  health: ['Green', 'Yellow', 'Red'],
  riskTolerance: ['Low', 'Medium', 'High'],
  portfolioStatus: ['Active', 'On Hold', 'Closed', 'Archived'],
  taskType: ['Work', 'Milestone', 'Summary', 'Fixed Duration', 'Fixed Units', 'Ongoing'],
  constraintType: ['ASAP', 'ALAP', 'Start No Earlier Than', 'Finish No Later Than', 'Must Start On', 'Must Finish On'],
  riskStatus: ['Identified', 'Open', 'In Mitigation', 'Mitigated', 'Closed', 'Accepted'],
  issueStatus: ['Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Escalated'],
  probability: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
  impact: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
  responseStrategy: ['Avoid', 'Transfer', 'Mitigate', 'Accept'],
  milestoneStatus: ['Backlog', 'To Do', 'In Progress', 'Done', 'Delayed'],
  severity: ['Minor', 'Moderate', 'Major', 'Critical', 'Blocker'],
  issueType: ['Bug', 'Enhancement', 'Task', 'Question', 'Defect', 'Support'],
  escalationLevel: ['None', 'Team Lead', 'Manager', 'Director', 'Executive'],
  timesheetStatus: ['Draft', 'Submitted', 'Approved', 'Rejected'],
  invoiceStatus: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'],
  intakeStatus: ['draft', 'in_progress', 'approved', 'rejected', 'cancelled'],
  changeRequestType: ['Scope', 'Schedule', 'Budget', 'Resource', 'Quality'],
  changeRequestStatus: ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Implemented'],
  notificationSeverity: ['info', 'warning', 'critical'],
  helpTicketStatus: ['new', 'in_progress', 'resolved', 'closed'],
  helpTicketPriority: ['low', 'normal', 'high', 'urgent'],
  fileType: ['xml', 'csv', 'mpp'],
  capexOpex: ['CapEx', 'OpEx'],
  benefitStatus: ['Planned', 'In Progress', 'Partially Realized', 'Fully Realized', 'Not Achieved'],
  decisionStatus: ['Pending', 'Approved', 'Rejected', 'Deferred', 'Implemented'],
  keyDateType: ['Deadline', 'Governance', 'Deliverable', 'Phase Gate', 'External', 'Payment', 'Review', 'Go Live', 'Other'],
  keyDateStatus: ['Upcoming', 'At Risk', 'Overdue', 'Completed'],
  proximity: ['Imminent', 'Near-term', 'Mid-term', 'Long-term'],
  resourceType: ['Employee', 'Contractor', 'Vendor', 'Equipment', 'Material'],
  experienceLevel: ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Principal'],
  periodStatus: ['open', 'locked'],
  projectSource: ['manual', 'imported', 'planner', 'planner_premium'],
  aggregationMethod: ['average', 'sum', 'max', 'min', 'weighted-average'],
};

const taskFieldAliases: Record<string, string> = {
  projectId: 'Also accepts: project_id',
  taskIndex: 'Sequential ordering index. Auto-assigned if omitted. Also accepts: task_index',
  taskNumber: 'Auto-generated (e.g. "TASK-001"). Also accepts: task_number',
  taskType: 'Also accepts: task_type',
  startDate: 'Also accepts: start_date',
  endDate: 'Also accepts: end_date. Auto-calculated if durationDays is provided.',
  baselineStartDate: 'Also accepts: baseline_start_date',
  baselineEndDate: 'Also accepts: baseline_end_date',
  actualStartDate: 'Also accepts: actual_start_date',
  actualEndDate: 'Also accepts: actual_end_date',
  estimatedHours: 'Also accepts: estimated_hours',
  actualHours: 'Also accepts: actual_hours',
  remainingHours: 'Also accepts: remaining_hours',
  constraintType: 'Also accepts: constraint_type',
  constraintDate: 'Also accepts: constraint_date',
  ownerId: 'User ID of the task owner. Also accepts: owner_id',
  outlineLevel: 'Hierarchy level (1, 2, 3...). Also accepts: outline_level',
  parentId: 'ID of the parent task for creating subtasks. Also accepts: parent_id',
  isMilestone: 'Also accepts: is_milestone',
  isSummary: 'Also accepts: is_summary',
  isCritical: 'Also accepts: is_critical',
  isOngoing: 'Ongoing/operational task without scheduled dates. Also accepts: is_ongoing',
  actualCost: 'Also accepts: actual_cost',
  timesheetBlocked: 'Also accepts: timesheet_blocked',
  externalId: 'Also accepts: external_id',
};

function taskOverrides(extra: Record<string, any> = {}): Record<string, any> {
  const base: Record<string, any> = {};
  for (const [key, desc] of Object.entries(taskFieldAliases)) {
    base[key] = { description: desc };
  }
  base.wbs = { description: 'Work Breakdown Structure code (e.g. "1.2.3"). Auto-calculated.' };
  base.taskType = { ...base.taskType, enum: STATUS_ENUMS.taskType };
  base.priority = { enum: STATUS_ENUMS.priority };
  base.durationDays = { type: 'number', format: 'decimal', description: 'Duration in days (supports decimals, e.g. 1.5 = 1 day 4 hours, 0.25 = 2 hours). If provided with startDate, endDate is auto-calculated. Also accepts: duration_days' };
  base.progress = { minimum: 0, maximum: 100 };
  base.status = { enum: STATUS_ENUMS.task };
  base.constraintType = { ...base.constraintType, enum: STATUS_ENUMS.constraintType };
  base.labels = { description: 'Comma-separated labels' };
  base.completionOverridden = { description: 'True if user manually set progress' };
  base.milestoneNumber = { description: 'Auto-generated milestone number (e.g. "MS-001")' };
  base.milestoneType = { description: 'Governance, Deliverable, Phase Gate, External, Payment' };
  base.deliverables = { description: 'Expected deliverables for milestone tasks' };
  base.acceptanceCriteria = { description: 'Criteria for milestone completion' };
  base.successMetrics = { description: 'How success will be measured' };
  base.stakeholders = { description: 'Key stakeholders' };
  base.schedulingMode = { omit: true };
  base.parentTaskId = { omit: true };
  return { ...base, ...extra };
}

const riskOmitFields: Record<string, { omit: true }> = {
  severity: { omit: true }, type: { omit: true }, escalationLevel: { omit: true },
  assigneeId: { omit: true }, reporterId: { omit: true }, reportedBy: { omit: true },
  reportedDate: { omit: true }, targetResolutionDate: { omit: true },
  actualResolutionDate: { omit: true }, resolution: { omit: true },
  rootCause: { omit: true }, impactDescription: { omit: true },
  impactCost: { omit: true }, impactSchedule: { omit: true },
  relatedTaskId: { omit: true }, stepsToReproduce: { omit: true },
  environment: { omit: true }, assignee: { omit: true },
};

const issueOmitFields: Record<string, { omit: true }> = {
  probability: { omit: true }, riskScore: { omit: true },
  responseStrategy: { omit: true }, mitigationPlan: { omit: true },
  contingencyPlan: { omit: true }, triggerEvents: { omit: true },
  residualRisk: { omit: true }, reviewerId: { omit: true },
  identifiedDate: { omit: true }, targetResolutionDateRisk: { omit: true },
  actualResolutionDateRisk: { omit: true }, proximity: { omit: true },
};

export function generateOpenApiSchemas(): Record<string, any> {
  const schemas: Record<string, any> = {
    Error: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },

    Organization: drizzleTableToOpenApiSchema(organizations, {
      overrides: {
        slug: { description: 'URL-friendly unique identifier' },
        logoUrl: { description: 'Custom company logo URL' },
        ownerId: { description: 'User ID of the organization creator' },
        hiddenModules: { description: 'Legacy: module keys hidden from sidebar' },
        moduleOrder: { description: 'Legacy: module keys defining sidebar order' },
        hiddenGroups: { description: 'Legacy: group keys hidden from sidebar' },
        sidebarStructure: { description: 'Full sidebar configuration (groups, items, custom links)' },
        dashboardTabOrder: { description: 'Tab IDs defining dashboard report order' },
        dashboardHiddenTabs: { description: 'Tab IDs hidden in overflow menu' },
        billingHidden: { description: 'Whether billing section is hidden' },
        riskAssessmentConfig: { description: 'AI risk assessment configuration (model, temperature, thresholds, etc.)' },
        schedulingDefaults: { description: 'Default scheduling settings (dependency type, lag days)', properties: { defaultDependencyType: { type: 'string', enum: ['FS', 'SS', 'FF', 'SF'] }, defaultLagDays: { type: 'integer' } } },
        timesheetPolicies: { omit: true },
        timezone: { omit: true },
        deactivatedAt: { description: 'Soft delete timestamp' },
        deactivatedBy: { description: 'User ID who deactivated' },
      },
      example: { id: 1, name: 'Acme Corp', slug: 'acme-corp', description: 'Enterprise organization', createdAt: '2025-01-15T10:00:00Z' },
    }),

    Portfolio: drizzleTableToOpenApiSchema(portfolios, {
      overrides: {
        strategy: { description: 'Strategic alignment description' },
        managerId: { description: 'Portfolio Manager user ID' },
        businessOwnerId: { description: 'Business Owner/Executive Sponsor user ID' },
        strategicObjective: { description: 'Key business objective this portfolio supports' },
        budgetAllocated: { description: 'Total budget allocated to portfolio' },
        budgetSpent: { description: 'Total budget spent across projects' },
        riskTolerance: { enum: STATUS_ENUMS.riskTolerance, description: 'Acceptable risk level' },
        performanceMetrics: { description: 'KPIs for portfolio success' },
        status: { enum: STATUS_ENUMS.portfolioStatus },
        healthScore: { enum: STATUS_ENUMS.health },
        department: { description: 'Primary department/business unit' },
        teamMemberResourceIds: { description: 'Resource IDs with team member access' },
        isCustom: { description: 'Custom portfolios can include projects from any portfolio' },
      },
      example: { id: 1, organizationId: 1, name: 'Digital Transformation', status: 'Active', healthScore: 'Green' },
    }),

    PortfolioRequest: createRequestSchema(portfolios, {
      description: 'Input schema for creating or updating a portfolio. Excludes server-generated fields (id, timestamps, calculated metrics, etc.).',
      extraExclude: ['createdBy', 'budgetSpent'],
      overrides: {
        strategy: { description: 'Strategic alignment description' },
        managerId: { description: 'Portfolio Manager user ID' },
        businessOwnerId: { description: 'Business Owner/Executive Sponsor user ID' },
        strategicObjective: { description: 'Key business objective this portfolio supports' },
        budgetAllocated: { description: 'Total budget allocated to portfolio' },
        riskTolerance: { enum: STATUS_ENUMS.riskTolerance, description: 'Acceptable risk level' },
        performanceMetrics: { description: 'KPIs for portfolio success' },
        status: { enum: STATUS_ENUMS.portfolioStatus },
        healthScore: { enum: STATUS_ENUMS.health },
        department: { description: 'Primary department/business unit' },
        teamMemberResourceIds: { description: 'Resource IDs with team member access' },
        isCustom: { description: 'Custom portfolios can include projects from any portfolio. Defaults to false.' },
      },
    }),

    Project: drizzleTableToOpenApiSchema(projects, {
      overrides: {
        projectCode: { description: 'Unique project identifier (e.g. "PRJ-2025-001")' },
        status: { enum: STATUS_ENUMS.project },
        priority: { enum: STATUS_ENUMS.priority },
        projectType: { description: 'Internal, External, Strategic, Operational, Regulatory' },
        methodology: { description: 'Waterfall, Agile, Hybrid, Scrum, Kanban' },
        baselineStartDate: { description: 'Original planned start' },
        baselineEndDate: { description: 'Original planned end' },
        actualCost: { description: 'Actual spend to date' },
        forecastCost: { description: 'Projected final cost' },
        contractTotal: { description: 'Total contract value for invoicing' },
        managerId: { description: 'Project Manager user ID' },
        managerResourceId: { description: 'Project Manager resource ID for display' },
        businessSponsorId: { description: 'Executive Sponsor user ID' },
        completionPercentage: { minimum: 0, maximum: 100 },
        completionOverridden: { description: 'True if user manually set completion percentage' },
        health: { enum: STATUS_ENUMS.health },
        scheduleVariance: { description: 'Days ahead/behind schedule (negative = behind)' },
        costVariance: { description: 'Budget variance (negative = over budget)' },
        dependencies: { description: 'External dependencies' },
        category: { description: 'IT, Marketing, Operations, etc.' },
        riskLevel: { enum: STATUS_ENUMS.riskTolerance },
        source: { enum: STATUS_ENUMS.projectSource, description: '"manual" = created in app, "imported" = from MPP/external file, "planner" = from Microsoft Planner (Graph), "planner_premium" = from Planner Premium / Dataverse' },
        plannerPlanId: { description: 'Microsoft Planner plan ID for syncing' },
        sourceFileName: { description: 'Original filename of imported file' },
        sourceFileUrl: { description: 'URL to the original imported file' },
        billableStatus: { description: 'N/A, On Track, Waiting for Approval, etc.' },
        isInternal: { description: 'Internal project flag' },
      },
      example: { id: 1, organizationId: 1, name: 'Website Redesign', status: 'Execution', priority: 'High', budget: 50000, completionPercentage: 45, health: 'Green', startDate: '2025-03-01', endDate: '2025-09-30' },
    }),

    ProjectRequest: createRequestSchema(projects, {
      description: 'Input schema for creating or updating a project. Excludes server-generated fields (id, timestamps, calculated metrics, etc.). Fields with defaults (status, priority, budget, health, etc.) are optional on create.',
      extraExclude: ['actualCost', 'createdBy', 'updatedBy', 'completedAt', 'completedBy', 'plannerPlanId', 'dataverseOrgId', 'dataverseTenantId', 'sourceFileName', 'sourceFileUrl', 'source', 'completionPercentage', 'scheduleVariance', 'costVariance', 'healthReasonUpdatedAt'],
      overrides: {
        projectCode: { description: 'Unique project identifier (e.g. "PRJ-2025-001")' },
        status: { enum: STATUS_ENUMS.project },
        priority: { enum: STATUS_ENUMS.priority },
        projectType: { description: 'Internal, External, Strategic, Operational, Regulatory' },
        methodology: { description: 'Waterfall, Agile, Hybrid, Scrum, Kanban' },
        health: { enum: STATUS_ENUMS.health },
        riskLevel: { enum: STATUS_ENUMS.riskTolerance },
        isInternal: { description: 'Internal project flag' },
      },
    }),

    Task: drizzleTableToOpenApiSchema(tasks, {
      description: 'Task object. Create and update endpoints accept both camelCase (e.g. parentId) and snake_case (e.g. parent_id) field names.',
      overrides: taskOverrides(),
      example: { id: 1, projectId: 1, name: 'Design wireframes', status: 'In Progress', priority: 'High', progress: 60, startDate: '2025-04-01', endDate: '2025-04-15', durationDays: 10 },
    }),

    TaskRequest: createRequestSchema(tasks, {
      description: 'Input schema for creating or updating a task. Excludes server-generated fields (id, taskNumber, wbs, timestamps, etc.). Accepts both camelCase and snake_case field names. Fields with defaults (priority, status, progress, boolean flags) are optional on create.',
      extraExclude: ['taskNumber', 'wbs', 'schedulingMode', 'parentTaskId'],
      overrides: taskOverrides(),
    }),

    Milestone: drizzleTableToOpenApiSchema(milestones, {
      deprecated: true,
      description: 'DEPRECATED: Legacy task milestone (from tasks table with isMilestone=true). For portfolio-level key dates, use PortfolioKeyDate instead.',
      overrides: {
        milestoneNumber: { description: 'Auto-generated (e.g. "MS-001")' },
        milestoneType: { description: 'Governance, Deliverable, Phase Gate, External, Payment' },
        baselineDueDate: { description: 'Original planned due date' },
        status: { enum: STATUS_ENUMS.milestoneStatus },
        priority: { enum: STATUS_ENUMS.priority },
        ownerId: { description: 'Milestone owner user ID' },
        deliverables: { description: 'Expected deliverables' },
      },
    }),

    MilestoneRequest: createRequestSchema(milestones, {
      deprecated: true,
      description: 'DEPRECATED: Request body for creating or updating a task milestone (legacy milestones table). Fields with defaults (completed, status, priority) are optional on create.',
      overrides: {
        milestoneType: { description: 'Governance, Deliverable, Phase Gate, External, Payment' },
        status: { enum: STATUS_ENUMS.milestoneStatus },
        priority: { enum: STATUS_ENUMS.priority },
        ownerId: { description: 'Milestone owner user ID' },
      },
    }),

    PortfolioKeyDate: drizzleTableToOpenApiSchema(portfolioKeyDates, {
      description: 'Portfolio-level key date. Stored in the portfolio_key_dates table, completely separate from task milestones.',
      overrides: {
        portfolioId: { description: 'The portfolio this key date belongs to' },
        keyDateType: { enum: STATUS_ENUMS.keyDateType, description: 'Type of key date' },
        date: { description: 'The key date' },
        status: { enum: STATUS_ENUMS.keyDateStatus },
        createdBy: { description: 'User ID of creator' },
      },
    }),

    PortfolioKeyDateRequest: createRequestSchema(portfolioKeyDates, {
      description: 'Request body for creating or updating a portfolio key date. Fields with defaults (keyDateType, status, completed) are optional on create.',
      exclude: ['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'isDemo', 'portfolioId', 'organizationId', 'createdBy'],
      overrides: {
        keyDateType: { enum: STATUS_ENUMS.keyDateType },
        status: { enum: STATUS_ENUMS.keyDateStatus },
      },
    }),

    Risk: drizzleTableToOpenApiSchema(issues, {
      description: 'Risk record. Risks and Issues share the same database table (issues) distinguished by itemType. This schema shows the risk-specific view.',
      overrides: {
        itemType: { enum: ['risk'], description: 'Always "risk" for risk records' },
        issueNumber: { description: 'Auto-generated (e.g. "RISK-001")' },
        category: { description: 'Technical, Schedule, Resource, External, Organizational, Financial' },
        priority: { enum: STATUS_ENUMS.priority },
        status: { enum: STATUS_ENUMS.riskStatus },
        probability: { enum: STATUS_ENUMS.probability },
        impact: { enum: STATUS_ENUMS.impact },
        riskScore: { description: 'Calculated score (probability x impact)' },
        responseStrategy: { enum: STATUS_ENUMS.responseStrategy },
        contingencyPlan: { description: 'Backup plan if risk occurs' },
        residualRisk: { description: 'Remaining risk after mitigation' },
        ownerId: { description: 'Risk owner user ID' },
        costExposure: { description: 'Expected monetary value (probability x impact cost)' },
        dueDate: { description: 'Risk due date for time-based placement' },
        proximity: { enum: STATUS_ENUMS.proximity },
        escalatedToPortfolio: { description: 'Whether escalated to portfolio level' },
        ...riskOmitFields,
      },
    }),

    Issue: drizzleTableToOpenApiSchema(issues, {
      description: 'Issue record. Risks and Issues share the same database table (issues) distinguished by itemType. This schema shows the issue-specific view.',
      overrides: {
        itemType: { enum: ['issue'], description: 'Always "issue" for issue records' },
        issueNumber: { description: 'Auto-generated (e.g. "ISS-001")' },
        category: { description: 'Technical, Process, Resource, External, Scope' },
        priority: { enum: STATUS_ENUMS.priority },
        severity: { enum: STATUS_ENUMS.severity },
        status: { enum: STATUS_ENUMS.issueStatus },
        type: { enum: STATUS_ENUMS.issueType },
        escalationLevel: { enum: STATUS_ENUMS.escalationLevel },
        assigneeId: { description: 'Assignee user ID' },
        reporterId: { description: 'Reporter user ID' },
        reportedBy: { description: 'Reporter name (for external reports)' },
        labels: { description: 'Comma-separated labels' },
        ...issueOmitFields,
      },
    }),

    RiskRequest: createRequestSchema(issues, {
      description: 'Input schema for creating or updating a risk. Excludes server-generated fields (id, timestamps, calculated fields).',
      extraExclude: ['issueNumber', 'riskScore', 'escalatedAt'],
      overrides: {
        itemType: { enum: ['risk'], description: 'Must be "risk"' },
        title: { description: 'Risk title' },
        category: { description: 'Technical, Schedule, Resource, External, Organizational, Financial' },
        priority: { enum: STATUS_ENUMS.priority },
        status: { enum: STATUS_ENUMS.riskStatus },
        probability: { enum: STATUS_ENUMS.probability },
        impact: { enum: STATUS_ENUMS.impact },
        responseStrategy: { enum: STATUS_ENUMS.responseStrategy },
        contingencyPlan: { description: 'Backup plan if risk occurs' },
        residualRisk: { description: 'Remaining risk after mitigation' },
        ownerId: { description: 'Risk owner user ID' },
        costExposure: { description: 'Expected monetary value (probability x impact cost)' },
        dueDate: { description: 'Risk due date' },
        proximity: { enum: STATUS_ENUMS.proximity },
        escalatedToPortfolio: { description: 'Whether escalated to portfolio level' },
        ...riskOmitFields,
      },
    }),

    IssueRequest: createRequestSchema(issues, {
      description: 'Input schema for creating or updating an issue. Excludes server-generated fields (id, timestamps, calculated fields).',
      extraExclude: ['issueNumber', 'riskScore', 'escalatedAt'],
      overrides: {
        itemType: { enum: ['issue'], description: 'Must be "issue"' },
        title: { description: 'Issue title' },
        category: { description: 'Technical, Process, Resource, External, Scope' },
        priority: { enum: STATUS_ENUMS.priority },
        severity: { enum: STATUS_ENUMS.severity },
        status: { enum: STATUS_ENUMS.issueStatus },
        type: { enum: STATUS_ENUMS.issueType },
        escalationLevel: { enum: STATUS_ENUMS.escalationLevel },
        assigneeId: { description: 'Assignee user ID' },
        reporterId: { description: 'Reporter user ID' },
        reportedBy: { description: 'Reporter name (for external reports)' },
        labels: { description: 'Comma-separated labels' },
        ...issueOmitFields,
      },
    }),

    Resource: drizzleTableToOpenApiSchema(resources, {
      overrides: {
        userId: { description: 'Linked organization member user ID (for auto-synced resources)' },
        resourceCode: { description: 'Unique identifier (e.g. "EMP-001")' },
        resourceType: { enum: STATUS_ENUMS.resourceType, description: 'Resource classification' },
        title: { description: 'Job title/role' },
        managerId: { description: 'Direct manager user ID' },
        skills: { description: 'Comma-separated skills' },
        certifications: { description: 'Comma-separated certifications' },
        experienceLevel: { enum: STATUS_ENUMS.experienceLevel },
        overtimeRate: { description: 'Overtime hourly rate' },
        costRate: { description: 'Internal cost rate' },
        weeklyCapacity: { description: 'Hours per week available' },
        availability: { description: 'Percentage availability 0-100' },
        isApprover: { description: 'Can approve timesheets' },
        isIntakeApprover: { description: 'Can approve project intakes' },
        timesheetHidden: { description: 'Hide from all timesheet dashboards' },
        invitedProjectIds: { description: 'Projects this resource was invited to' },
      },
    }),

    TimesheetEntry: drizzleTableToOpenApiSchema(timesheetEntries, {
      overrides: {
        userId: { description: 'The user logging time' },
        resourceId: { description: 'The resource record' },
        hours: { description: 'Hours worked (supports decimals like 0.25, 0.5)' },
        status: { enum: STATUS_ENUMS.timesheetStatus },
        approvedBy: { description: 'User ID of approver' },
        proxyUserId: { description: 'User ID if time was logged on behalf of another user' },
      },
    }),

    Invoice: drizzleTableToOpenApiSchema(projectInvoices, {
      overrides: {
        status: { enum: STATUS_ENUMS.invoiceStatus },
        fileSize: { description: 'Size in bytes' },
        source: { description: 'Source system: manual, dynamics365, etc.' },
        externalId: { description: 'ID in the source system' },
        externalUrl: { description: 'Direct URL to invoice in source system' },
      },
    }),

    ProjectIntake: drizzleTableToOpenApiSchema(projectIntakes, {
      description: 'Full project intake response object including server-generated fields.',
      overrides: {
        intakeNumber: { description: 'Auto-generated (e.g. "INT-2026-001")' },
        fundingSource: { description: 'Business Funded, IT Funded, Shared, etc.' },
        currentStep: { description: 'Current workflow step' },
        status: { enum: STATUS_ENUMS.intakeStatus },
        createdProjectId: { description: 'Populated after approval when project is created' },
      },
    }),

    ProjectIntakeRequest: createRequestSchema(projectIntakes, {
      description: 'Input schema for creating or updating a project intake. Excludes server-generated fields (id, timestamps, approval tracking, etc.).',
      extraExclude: ['intakeNumber', 'pmoApproved', 'pmoApprovedAt', 'pmoApprovedBy', 'approvedAt', 'approvedBy', 'rejectedAt', 'rejectedBy', 'rejectionReason', 'securityApprovalDate', 'securityApproverId', 'createdProjectId'],
      overrides: {
        fundingSource: { description: 'Business Funded, IT Funded, Shared, etc.' },
        currentStep: { description: 'Current workflow step' },
        status: { enum: STATUS_ENUMS.intakeStatus },
      },
    }),

    DependencyType: {
      type: 'string',
      enum: ['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'],
      description: 'Task dependency relationship type. Kebab-case values as stored and returned by the API. For input, alternate formats are also accepted: "FinishToStart", "finish_to_start", "FS", "fs", etc.',
    },

    TaskDependency: drizzleTableToOpenApiSchema(taskDependencies, {
      overrides: {
        id: { description: 'Unique identifier for the dependency record' },
        taskId: { description: 'The dependent task (the task that depends on another)' },
        dependsOnTaskId: { description: 'The predecessor task (the task that must complete first)' },
        dependencyType: ref('DependencyType'),
        lagDays: { description: 'Lag (positive) or lead (negative) time in working days between the linked tasks' },
        createdAt: { description: 'When the dependency was created' },
      },
    }),

    TaskDependencyCreateRequest: {
      type: 'object',
      description: 'Input schema for creating a task dependency. The dependencyType field defaults to "finish-to-start" if omitted or null. Alternate input formats are also accepted: "FinishToStart", "finish_to_start", "FS", etc.',
      properties: {
        dependsOnTaskId: { type: 'integer', description: 'The ID of the predecessor task that must complete first' },
        dependencyType: ref('DependencyType'),
        lagDays: { type: 'integer', default: 0, nullable: true, description: 'Lag (positive) or lead (negative) time in working days. Defaults to 0 if omitted or null.' },
      },
      required: ['dependsOnTaskId'],
    },

    TaskDependencyUpdateRequest: {
      type: 'object',
      description: 'Input schema for updating a task dependency. Both fields are optional; only provided fields are changed. Alternate dependency type formats are also accepted: "FinishToStart", "finish_to_start", "FS", etc.',
      properties: {
        dependencyType: ref('DependencyType'),
        lagDays: { type: 'integer', nullable: true, description: 'Lag (positive) or lead (negative) time in working days.' },
      },
    },

    TaskDependencyCreateResponse: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'ID of the created dependency' },
        taskId: { type: 'integer' },
        dependsOnTaskId: { type: 'integer' },
        dependencyType: ref('DependencyType'),
        lagDays: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
        message: { type: 'string', description: 'Human-readable summary (e.g. "Dependency created successfully. Adjusted dates for 3 tasks.")' },
        adjustedCount: { type: 'integer', description: 'Number of downstream tasks whose dates were adjusted' },
        propagatedTasks: {
          type: 'array',
          description: 'Tasks whose dates changed due to dependency propagation',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'integer' },
              name: { type: 'string' },
              oldStartDate: { type: 'string', format: 'date', nullable: true },
              newStartDate: { type: 'string', format: 'date', nullable: true },
              oldEndDate: { type: 'string', format: 'date', nullable: true },
              newEndDate: { type: 'string', format: 'date', nullable: true },
            },
          },
        },
      },
      required: ['id', 'taskId', 'dependsOnTaskId'],
    },

    TaskDependencyUpdateResponse: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        taskId: { type: 'integer' },
        dependsOnTaskId: { type: 'integer' },
        dependencyType: ref('DependencyType'),
        lagDays: { type: 'integer' },
        message: { type: 'string', description: 'Human-readable summary' },
        propagatedTasks: {
          type: 'array',
          description: 'Tasks whose dates changed due to updated dependency',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'integer' },
              name: { type: 'string' },
              oldStartDate: { type: 'string', format: 'date', nullable: true },
              newStartDate: { type: 'string', format: 'date', nullable: true },
              oldEndDate: { type: 'string', format: 'date', nullable: true },
              newEndDate: { type: 'string', format: 'date', nullable: true },
            },
          },
        },
      },
      required: ['id', 'taskId', 'dependsOnTaskId'],
    },

    User: drizzleTableToOpenApiSchema(users, {
      exclude: ['password', 'passwordHash', 'emailVerificationToken', 'emailVerificationExpiry'],
      overrides: {
        profileImageUrl: { description: 'Avatar URL' },
        role: { description: 'Platform role: user, super_admin, marketing' },
        emailVerified: { description: 'Whether email has been verified' },
        lastActiveAt: { description: 'Last activity timestamp' },
        onboardingComplete: { description: 'Whether the user has completed onboarding flow' },
        defaultOrganizationId: { description: 'Default org to load on login' },
        receiveEmailNotifications: { description: 'Whether to receive email notifications' },
        analyticsOptIn: { description: 'Whether user opted into analytics' },
        apiKey: { description: 'User-generated API key for analytics/Power BI' },
        bio: { description: 'Short bio for profile' },
        linkedinUrl: { description: 'LinkedIn profile URL' },
        company: { description: 'Company name for profile' },
        jobTitle: { description: 'Job title for profile' },
        location: { description: 'Location for profile' },
        timezone: { description: 'Preferred timezone' },
      },
    }),

    Document: drizzleTableToOpenApiSchema(projectDocuments, {
      additionalRequired: ['fileUrl'],
      overrides: {
        fileSize: { description: 'Size in bytes' },
        uploadedBy: { description: 'User who uploaded the document' },
      },
    }),

    Comment: drizzleTableToOpenApiSchema(projectComments, {
      overrides: {
        userId: { description: 'User who made the comment' },
        parentCommentId: { description: 'Parent comment ID for threaded replies' },
      },
    }),

    ChangeRequest: drizzleTableToOpenApiSchema(changeRequests, {
      overrides: {
        requestNumber: { description: 'Auto-generated CR number (e.g. "CR-001")' },
        justification: { description: 'Business justification for the change' },
        type: { enum: STATUS_ENUMS.changeRequestType },
        priority: { enum: STATUS_ENUMS.priority },
        status: { enum: STATUS_ENUMS.changeRequestStatus },
        impact: { description: 'Description of impact on project' },
        estimatedEffort: { description: 'Effort estimate (e.g. "5 days")' },
        affectedAreas: { description: 'Comma-separated list of affected areas' },
      },
    }),

    Notification: drizzleTableToOpenApiSchema(notifications, {
      overrides: {
        type: { description: 'mention, comment_reply, task_overdue, task_deadline_warning, project_health_alert, task_assignment, risk_assignment, issue_assignment, project_assignment, milestone_approaching, milestone_overdue, status_change' },
        riskIssueId: { description: 'Polymorphic: can reference risks or issues' },
        severity: { enum: STATUS_ENUMS.notificationSeverity },
        actionUrl: { description: 'Deep link to the relevant item' },
        metadata: { description: 'JSON string for additional context' },
      },
    }),

    CustomDashboard: drizzleTableToOpenApiSchema(customDashboards, {
      overrides: {
        description: { description: "User's original request" },
        config: {
          description: 'AI-generated dashboard configuration',
          properties: {
            widgets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string', enum: ['kpi', 'bar-chart', 'line-chart', 'pie-chart', 'area-chart', 'table', 'progress', 'powerbi-embed', 'gantt', 'narrative', 'recent-tasks', 'stat-card', 'heatmap', 'trend-card', 'milestone-timeline'] },
                  title: { type: 'string' },
                  dataSource: { type: 'string', enum: ['projects', 'portfolios', 'tasks', 'risks', 'issues', 'milestones', 'resources', 'timesheets', 'external'] },
                  metrics: { type: 'array', items: { type: 'string' }, nullable: true },
                  filters: { type: 'object', nullable: true },
                  aggregation: { type: 'string', enum: ['count', 'sum', 'average', 'percentage'], nullable: true },
                  groupBy: { type: 'string', nullable: true },
                  size: { type: 'string', enum: ['small', 'medium', 'large', 'full'] },
                  embedUrl: { type: 'string', nullable: true },
                  limit: { type: 'integer', nullable: true },
                },
              },
            },
            layout: { type: 'string', enum: ['grid', 'masonry'], nullable: true },
            refreshInterval: { type: 'integer', nullable: true },
          },
        },
      },
    }),

    Plan: drizzleTableToOpenApiSchema(plans, {
      overrides: {
        code: { description: 'Unique plan code (e.g. FREE, BASIC, TEAM, ENTERPRISE)' },
        name: { description: 'Display name of the plan' },
        monthlyPriceCents: { description: 'Monthly price in cents (e.g. 200 = $2.00)' },
        maxSeats: { description: 'Maximum included seats for this plan' },
        extraSeatPriceCents: { description: 'Price per additional seat per month in cents' },
        meterRules: { omit: true },
      },
    }),

    HelpTicket: drizzleTableToOpenApiSchema(helpTickets, {
      overrides: {
        imageUrls: { description: 'Image URLs stored in object storage' },
        status: { enum: STATUS_ENUMS.helpTicketStatus },
        priority: { enum: STATUS_ENUMS.helpTicketPriority },
      },
    }),

    MppImport: drizzleTableToOpenApiSchema(mppImports, {
      overrides: {
        projectId: { description: 'Link to existing project' },
        fileType: { enum: STATUS_ENUMS.fileType },
        fileUrl: { description: 'URL to original uploaded file' },
        status: { enum: ['active', 'archived'] },
      },
    }),

    ProjectFinancial: drizzleTableToOpenApiSchema(projectFinancials, {
      description: 'Budget/Plan/Actuals with CapEx/OpEx breakdown per fiscal year and period.',
      overrides: {
        category: { enum: STATUS_ENUMS.capexOpex },
        lineItem: { description: 'Name of expense item (e.g. Hardware, Software Licenses, Consulting)' },
        fiscalYear: { description: 'e.g. 2025, 2026' },
        fiscalPeriod: { description: 'e.g. Q1, Q2, Jan, Full Year' },
        budgetAmount: { description: 'Original budget/plan' },
        plannedAmount: { description: 'Current planned amount (may differ from original budget)' },
        actualAmount: { description: 'Actual spent' },
      },
    }),

    CostItem: drizzleTableToOpenApiSchema(costItems, {
      description: 'Detailed cost tracking with monthly forecast/actual breakdown (fiscal year Oct-Sep: M1=Oct through M12=Sep).',
      overrides: {
        parentId: { description: 'Self-reference for hierarchy (null = root level)' },
        category: { description: 'Direct Expense, Licenses, Outside Services, Travel/Meals, Project Material, etc.' },
        aopTotal: { description: 'Annual Operating Plan (original budget)' },
        fcstTotal: { description: 'Forecast total' },
        actTotal: { description: 'Actual total' },
      },
    }),

    RiskAssessment: drizzleTableToOpenApiSchema(projectRiskAssessments, {
      exclude: ['projectId', 'category', 'details', 'factors', 'updatedAt'],
      excludeRequired: ['projectId'],
      overrides: {
        riskScore: { description: 'Calculated risk score (0-100)' },
        reportJson: { description: 'Full assessment report as JSON', type: 'object' },
      },
    }),

    CustomField: drizzleTableToOpenApiSchema(customFieldDefinitions, {
      exclude: ['createdAt', 'entityType', 'isActive', 'sortOrder'],
    }),

    CustomTab: drizzleTableToOpenApiSchema(customProjectTabs, {}),

    ScoringCriterion: drizzleTableToOpenApiSchema(projectScoringCriteria, {
      overrides: {
        category: { description: 'Strategic, Financial, Risk, Resource, Technical' },
        weight: { description: 'Numeric weight stored as string (default "1")' },
        scoringGuidelines: { description: 'Instructions for scoring' },
      },
      example: { id: 1, organizationId: 1, name: 'Strategic Alignment', category: 'Strategic', weight: '2.5', maxScore: 10, isActive: true },
    }),

    ScoringCriterionRequest: createRequestSchema(projectScoringCriteria, {
      description: 'Input schema for creating or updating a scoring criterion.',
      overrides: {
        category: { description: 'Strategic, Financial, Risk, Resource, Technical' },
        weight: { description: 'Numeric weight (default "1")' },
      },
    }),

    ProjectScore: drizzleTableToOpenApiSchema(projectScores, {
      overrides: {
        score: { description: 'Score value (typically 0-10)' },
        justification: { description: 'Rationale for the score' },
      },
      example: { id: 1, projectId: 100, criteriaId: 1, score: 8, justification: 'Strong strategic alignment with Q2 objectives' },
    }),

    ProjectScoreRequest: {
      type: 'object',
      description: 'Input schema for saving a project score. Uses upsert: if a score already exists for this project+criterion, it is updated.',
      properties: {
        criterionId: { type: 'integer', description: 'Scoring criterion ID' },
        score: { type: 'integer', description: 'Score value (typically 0 to maxScore)' },
        justification: { type: 'string', nullable: true, description: 'Rationale for the score' },
      },
      required: ['criterionId', 'score'],
    },

    PortfolioScoringConfig: drizzleTableToOpenApiSchema(portfolioScoringConfig, {
      description: 'Per-portfolio override for how project scores are aggregated per criterion.',
      overrides: {
        aggregationMethod: { enum: STATUS_ENUMS.aggregationMethod, description: 'How project scores are combined for this criterion' },
      },
    }),

    ProjectBenefit: drizzleTableToOpenApiSchema(projectBenefits, {
      overrides: {
        category: { description: 'Financial, Operational, Strategic, Customer, etc.' },
        benefitType: { description: 'Tangible or Intangible' },
        measurementMethod: { description: 'How the benefit is measured' },
        unit: { description: 'Currency, Percentage, Number, etc.' },
        targetValue: { description: 'Expected/target value (numeric stored as string)' },
        actualValue: { description: 'Realized/actual value (numeric stored as string)' },
        baselineValue: { description: 'Value before project (numeric stored as string)' },
        status: { enum: STATUS_ENUMS.benefitStatus },
        owner: { description: 'User ID of benefit owner' },
      },
    }),

    ProjectDecision: drizzleTableToOpenApiSchema(projectDecisions, {
      overrides: {
        decisionType: { description: 'Strategic, Financial, Resource, Risk, Scope, etc.' },
        status: { enum: STATUS_ENUMS.decisionStatus },
        rationale: { description: 'Why this decision was made' },
        alternatives: { description: 'Alternatives considered' },
        impact: { description: 'Expected impact of the decision' },
        riskAssessment: { description: 'Risks associated with the decision' },
        stakeholders: { description: 'Key stakeholders involved' },
        reviewDate: { description: 'When to review the decision' },
        outcome: { description: 'Actual outcome after implementation' },
        decisionMaker: { description: 'User ID of decision maker' },
      },
    }),

    LessonLearned: drizzleTableToOpenApiSchema(lessonsLearned, {
      overrides: {
        lessonType: { description: 'Positive or Negative' },
      },
    }),

    ReportSubscription: drizzleTableToOpenApiSchema(reportSubscriptions, {}),

    TimesheetPeriod: drizzleTableToOpenApiSchema(timesheetPeriods, {
      overrides: {
        status: { enum: STATUS_ENUMS.periodStatus },
      },
    }),

    ProjectView: drizzleTableToOpenApiSchema(projectViews, {
      overrides: {
        viewType: { description: 'gantt, board, list, calendar, etc.' },
      },
    }),

    ProjectTemplate: drizzleTableToOpenApiSchema(projectTemplates, {
      overrides: {
        source: { description: 'file or project' },
      },
    }),

    TimesheetAuditLog: drizzleTableToOpenApiSchema(timesheetAuditLog, {}),

    TimesheetComment: drizzleTableToOpenApiSchema(timesheetComments, {}),

    TimesheetReminderSettings: drizzleTableToOpenApiSchema(timesheetReminderSettings, {}),

    TimesheetSettings: drizzleTableToOpenApiSchema(timesheetSettings, {}),

    ReferralCode: drizzleTableToOpenApiSchema(referralCodes, {}),
  };

  const errors = validateSchemas(schemas);
  if (errors.length > 0) {
    console.error('[OpenAPI Schema Validation Errors]');
    errors.forEach(e => console.error('  -', e));
  }

  return schemas;
}
