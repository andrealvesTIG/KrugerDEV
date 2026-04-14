import { drizzleTableToOpenApiSchema, createRequestSchema } from './openapi-schema-generator';
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

export function generateOpenApiSchemas(): Record<string, any> {
  return {
    Error: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },

    Organization: drizzleTableToOpenApiSchema(organizations, {
      required: ['id', 'name', 'slug', 'createdAt'],
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
      required: ['id', 'organizationId', 'name'],
      overrides: {
        strategy: { description: 'Strategic alignment description' },
        managerId: { description: 'Portfolio Manager user ID' },
        businessOwnerId: { description: 'Business Owner/Executive Sponsor user ID' },
        strategicObjective: { description: 'Key business objective this portfolio supports' },
        budgetAllocated: { description: 'Total budget allocated to portfolio' },
        budgetSpent: { description: 'Total budget spent across projects' },
        riskTolerance: { enum: ['Low', 'Medium', 'High'], description: 'Acceptable risk level' },
        performanceMetrics: { description: 'KPIs for portfolio success' },
        status: { enum: ['Active', 'On Hold', 'Closed', 'Archived'] },
        healthScore: { enum: ['Green', 'Yellow', 'Red'] },
        department: { description: 'Primary department/business unit' },
        teamMemberResourceIds: { description: 'Resource IDs with team member access' },
        isCustom: { description: 'Custom portfolios can include projects from any portfolio' },
      },
      example: { id: 1, organizationId: 1, name: 'Digital Transformation', status: 'Active', healthScore: 'Green' },
    }),

    PortfolioRequest: createRequestSchema(portfolios, {
      description: 'Input schema for creating or updating a portfolio. Excludes server-generated fields (id, timestamps, calculated metrics, etc.).',
      extraExclude: ['createdBy', 'budgetSpent'],
      required: ['organizationId', 'name'],
      overrides: {
        strategy: { description: 'Strategic alignment description' },
        managerId: { description: 'Portfolio Manager user ID' },
        businessOwnerId: { description: 'Business Owner/Executive Sponsor user ID' },
        strategicObjective: { description: 'Key business objective this portfolio supports' },
        budgetAllocated: { description: 'Total budget allocated to portfolio' },
        riskTolerance: { enum: ['Low', 'Medium', 'High'], description: 'Acceptable risk level' },
        performanceMetrics: { description: 'KPIs for portfolio success' },
        status: { enum: ['Active', 'On Hold', 'Closed', 'Archived'] },
        healthScore: { enum: ['Green', 'Yellow', 'Red'] },
        department: { description: 'Primary department/business unit' },
        teamMemberResourceIds: { description: 'Resource IDs with team member access' },
        isCustom: { description: 'Custom portfolios can include projects from any portfolio. Defaults to false.' },
      },
    }),

    Project: drizzleTableToOpenApiSchema(projects, {
      required: ['id', 'organizationId', 'name', 'status', 'priority', 'budget'],
      overrides: {
        projectCode: { description: 'Unique project identifier (e.g. "PRJ-2025-001")' },
        status: { enum: ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closing', 'Billing', 'On Hold', 'Cancelled', 'Closed'] },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
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
        health: { enum: ['Green', 'Yellow', 'Red'] },
        scheduleVariance: { description: 'Days ahead/behind schedule (negative = behind)' },
        costVariance: { description: 'Budget variance (negative = over budget)' },
        dependencies: { description: 'External dependencies' },
        category: { description: 'IT, Marketing, Operations, etc.' },
        riskLevel: { enum: ['Low', 'Medium', 'High'] },
        source: { enum: ['manual', 'imported', 'planner', 'planner_premium'], description: '"manual" = created in app, "imported" = from MPP/external file, "planner" = from Microsoft Planner (Graph), "planner_premium" = from Planner Premium / Dataverse' },
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
      required: ['organizationId', 'name'],
      overrides: {
        projectCode: { description: 'Unique project identifier (e.g. "PRJ-2025-001")' },
        status: { enum: ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closing', 'Billing', 'On Hold', 'Cancelled', 'Closed'] },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        projectType: { description: 'Internal, External, Strategic, Operational, Regulatory' },
        methodology: { description: 'Waterfall, Agile, Hybrid, Scrum, Kanban' },
        health: { enum: ['Green', 'Yellow', 'Red'] },
        riskLevel: { enum: ['Low', 'Medium', 'High'] },
        isInternal: { description: 'Internal project flag' },
      },
    }),

    Task: drizzleTableToOpenApiSchema(tasks, {
      description: 'Task object. Create and update endpoints accept both camelCase (e.g. parentId) and snake_case (e.g. parent_id) field names.',
      required: ['id', 'projectId', 'name'],
      overrides: {
        projectId: { description: 'Also accepts: project_id' },
        taskIndex: { description: 'Sequential ordering index. Auto-assigned if omitted. Also accepts: task_index' },
        taskNumber: { description: 'Auto-generated (e.g. "TASK-001"). Also accepts: task_number' },
        wbs: { description: 'Work Breakdown Structure code (e.g. "1.2.3"). Auto-calculated.' },
        taskType: { enum: ['Work', 'Milestone', 'Summary', 'Fixed Duration', 'Fixed Units', 'Ongoing'], description: 'Also accepts: task_type' },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        startDate: { description: 'Also accepts: start_date' },
        endDate: { description: 'Also accepts: end_date. Auto-calculated if durationDays is provided.' },
        baselineStartDate: { description: 'Also accepts: baseline_start_date' },
        baselineEndDate: { description: 'Also accepts: baseline_end_date' },
        actualStartDate: { description: 'Also accepts: actual_start_date' },
        actualEndDate: { description: 'Also accepts: actual_end_date' },
        durationDays: { type: 'number', format: 'decimal', description: 'Duration in days (supports decimals, e.g. 1.5 = 1 day 4 hours, 0.25 = 2 hours). If provided with startDate, endDate is auto-calculated. Also accepts: duration_days' },
        estimatedHours: { description: 'Also accepts: estimated_hours' },
        actualHours: { description: 'Also accepts: actual_hours' },
        remainingHours: { description: 'Also accepts: remaining_hours' },
        progress: { minimum: 0, maximum: 100 },
        status: { enum: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] },
        constraintType: { enum: ['ASAP', 'ALAP', 'Start No Earlier Than', 'Finish No Later Than', 'Must Start On', 'Must Finish On'], description: 'Also accepts: constraint_type' },
        constraintDate: { description: 'Also accepts: constraint_date' },
        ownerId: { description: 'User ID of the task owner. Also accepts: owner_id' },
        outlineLevel: { description: 'Hierarchy level (1, 2, 3...). Also accepts: outline_level' },
        parentId: { description: 'ID of the parent task for creating subtasks. Also accepts: parent_id' },
        isMilestone: { description: 'Also accepts: is_milestone' },
        isSummary: { description: 'Also accepts: is_summary' },
        isCritical: { description: 'Also accepts: is_critical' },
        isOngoing: { description: 'Ongoing/operational task without scheduled dates. Also accepts: is_ongoing' },
        actualCost: { description: 'Also accepts: actual_cost' },
        labels: { description: 'Comma-separated labels' },
        timesheetBlocked: { description: 'Also accepts: timesheet_blocked' },
        externalId: { description: 'Also accepts: external_id' },
        completionOverridden: { description: 'True if user manually set progress' },
        milestoneNumber: { description: 'Auto-generated milestone number (e.g. "MS-001")' },
        milestoneType: { description: 'Governance, Deliverable, Phase Gate, External, Payment' },
        deliverables: { description: 'Expected deliverables for milestone tasks' },
        acceptanceCriteria: { description: 'Criteria for milestone completion' },
        successMetrics: { description: 'How success will be measured' },
        stakeholders: { description: 'Key stakeholders' },
        schedulingMode: { omit: true },
        parentTaskId: { omit: true },
      },
      example: { id: 1, projectId: 1, name: 'Design wireframes', status: 'In Progress', priority: 'High', progress: 60, startDate: '2025-04-01', endDate: '2025-04-15', durationDays: 10 },
    }),

    TaskRequest: createRequestSchema(tasks, {
      description: 'Input schema for creating or updating a task. Excludes server-generated fields (id, taskNumber, wbs, timestamps, etc.). Accepts both camelCase and snake_case field names. Fields with defaults (priority, status, progress, boolean flags) are optional on create.',
      extraExclude: ['taskNumber', 'wbs', 'schedulingMode', 'parentTaskId'],
      required: ['projectId', 'name'],
      overrides: {
        projectId: { description: 'Also accepts: project_id' },
        taskType: { enum: ['Work', 'Milestone', 'Summary', 'Fixed Duration', 'Fixed Units', 'Ongoing'], description: 'Also accepts: task_type' },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        startDate: { description: 'Also accepts: start_date' },
        endDate: { description: 'Also accepts: end_date. Auto-calculated if durationDays is provided.' },
        baselineStartDate: { description: 'Also accepts: baseline_start_date' },
        baselineEndDate: { description: 'Also accepts: baseline_end_date' },
        actualStartDate: { description: 'Also accepts: actual_start_date' },
        actualEndDate: { description: 'Also accepts: actual_end_date' },
        durationDays: { type: 'number', format: 'decimal', description: 'Duration in days (supports decimals, e.g. 1.5 = 1 day 4 hours, 0.25 = 2 hours). If provided with startDate, endDate is auto-calculated. Also accepts: duration_days' },
        estimatedHours: { description: 'Also accepts: estimated_hours' },
        actualHours: { description: 'Also accepts: actual_hours' },
        remainingHours: { description: 'Also accepts: remaining_hours' },
        progress: { minimum: 0, maximum: 100 },
        status: { enum: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] },
        constraintType: { enum: ['ASAP', 'ALAP', 'Start No Earlier Than', 'Finish No Later Than', 'Must Start On', 'Must Finish On'], description: 'Also accepts: constraint_type' },
        constraintDate: { description: 'Also accepts: constraint_date' },
        ownerId: { description: 'User ID of the task owner. Also accepts: owner_id' },
        outlineLevel: { description: 'Hierarchy level (1, 2, 3...). Also accepts: outline_level' },
        parentId: { description: 'ID of the parent task for creating subtasks. Also accepts: parent_id' },
        isMilestone: { description: 'Also accepts: is_milestone' },
        isSummary: { description: 'Also accepts: is_summary' },
        isCritical: { description: 'Also accepts: is_critical' },
        isOngoing: { description: 'Ongoing/operational task without scheduled dates. Also accepts: is_ongoing' },
        actualCost: { description: 'Also accepts: actual_cost' },
        labels: { description: 'Comma-separated labels' },
        timesheetBlocked: { description: 'Also accepts: timesheet_blocked' },
        externalId: { description: 'Also accepts: external_id' },
        completionOverridden: { description: 'True if user manually set progress' },
        milestoneType: { description: 'Governance, Deliverable, Phase Gate, External, Payment' },
      },
    }),

    Milestone: drizzleTableToOpenApiSchema(milestones, {
      deprecated: true,
      description: 'DEPRECATED: Legacy task milestone (from tasks table with isMilestone=true). For portfolio-level key dates, use PortfolioKeyDate instead.',
      required: ['id', 'projectId', 'title', 'dueDate'],
      overrides: {
        milestoneNumber: { description: 'Auto-generated (e.g. "MS-001")' },
        milestoneType: { description: 'Governance, Deliverable, Phase Gate, External, Payment' },
        baselineDueDate: { description: 'Original planned due date' },
        status: { enum: ['Backlog', 'To Do', 'In Progress', 'Done', 'Delayed'] },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        ownerId: { description: 'Milestone owner user ID' },
        deliverables: { description: 'Expected deliverables' },
      },
    }),

    MilestoneRequest: createRequestSchema(milestones, {
      deprecated: true,
      description: 'DEPRECATED: Request body for creating or updating a task milestone (legacy milestones table). Fields with defaults (completed, status, priority) are optional on create.',
      required: ['projectId', 'title', 'dueDate'],
      overrides: {
        milestoneType: { description: 'Governance, Deliverable, Phase Gate, External, Payment' },
        status: { enum: ['Backlog', 'To Do', 'In Progress', 'Done', 'Delayed'] },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        ownerId: { description: 'Milestone owner user ID' },
      },
    }),

    PortfolioKeyDate: drizzleTableToOpenApiSchema(portfolioKeyDates, {
      description: 'Portfolio-level key date. Stored in the portfolio_key_dates table, completely separate from task milestones.',
      required: ['id', 'portfolioId', 'title', 'date'],
      overrides: {
        portfolioId: { description: 'The portfolio this key date belongs to' },
        keyDateType: { enum: ['Deadline', 'Governance', 'Deliverable', 'Phase Gate', 'External', 'Payment', 'Review', 'Go Live', 'Other'], description: 'Type of key date' },
        date: { description: 'The key date' },
        status: { enum: ['Upcoming', 'At Risk', 'Overdue', 'Completed'] },
        createdBy: { description: 'User ID of creator' },
      },
    }),

    PortfolioKeyDateRequest: createRequestSchema(portfolioKeyDates, {
      description: 'Request body for creating or updating a portfolio key date. Fields with defaults (keyDateType, status, completed) are optional on create.',
      exclude: ['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'isDemo', 'portfolioId', 'organizationId', 'createdBy'],
      required: ['title', 'date'],
      overrides: {
        keyDateType: { enum: ['Deadline', 'Governance', 'Deliverable', 'Phase Gate', 'External', 'Payment', 'Review', 'Go Live', 'Other'] },
        status: { enum: ['Upcoming', 'At Risk', 'Overdue', 'Completed'] },
      },
    }),

    Risk: drizzleTableToOpenApiSchema(issues, {
      description: 'Risk record. Risks and Issues share the same database table (issues) distinguished by itemType. This schema shows the risk-specific view.',
      required: ['id', 'projectId', 'itemType', 'title'],
      overrides: {
        itemType: { enum: ['risk'], description: 'Always "risk" for risk records' },
        issueNumber: { description: 'Auto-generated (e.g. "RISK-001")' },
        category: { description: 'Technical, Schedule, Resource, External, Organizational, Financial' },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        status: { enum: ['Identified', 'Open', 'In Mitigation', 'Mitigated', 'Closed', 'Accepted'] },
        probability: { enum: ['Very Low', 'Low', 'Medium', 'High', 'Very High'] },
        impact: { enum: ['Very Low', 'Low', 'Medium', 'High', 'Very High'] },
        riskScore: { description: 'Calculated score (probability x impact)' },
        responseStrategy: { enum: ['Avoid', 'Transfer', 'Mitigate', 'Accept'] },
        contingencyPlan: { description: 'Backup plan if risk occurs' },
        residualRisk: { description: 'Remaining risk after mitigation' },
        ownerId: { description: 'Risk owner user ID' },
        costExposure: { description: 'Expected monetary value (probability x impact cost)' },
        dueDate: { description: 'Risk due date for time-based placement' },
        proximity: { enum: ['Imminent', 'Near-term', 'Mid-term', 'Long-term'] },
        escalatedToPortfolio: { description: 'Whether escalated to portfolio level' },
        severity: { omit: true },
        type: { omit: true },
        escalationLevel: { omit: true },
        assigneeId: { omit: true },
        reporterId: { omit: true },
        reportedBy: { omit: true },
        reportedDate: { omit: true },
        targetResolutionDate: { omit: true },
        actualResolutionDate: { omit: true },
        resolution: { omit: true },
        rootCause: { omit: true },
        impactDescription: { omit: true },
        impactCost: { omit: true },
        impactSchedule: { omit: true },
        relatedTaskId: { omit: true },
        stepsToReproduce: { omit: true },
        environment: { omit: true },
        assignee: { omit: true },
      },
    }),

    Issue: drizzleTableToOpenApiSchema(issues, {
      description: 'Issue record. Risks and Issues share the same database table (issues) distinguished by itemType. This schema shows the issue-specific view.',
      required: ['id', 'projectId', 'itemType', 'title'],
      overrides: {
        itemType: { enum: ['issue'], description: 'Always "issue" for issue records' },
        issueNumber: { description: 'Auto-generated (e.g. "ISS-001")' },
        category: { description: 'Technical, Process, Resource, External, Scope' },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        severity: { enum: ['Minor', 'Moderate', 'Major', 'Critical', 'Blocker'] },
        status: { enum: ['Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Escalated'] },
        type: { enum: ['Bug', 'Enhancement', 'Task', 'Question', 'Defect', 'Support'] },
        escalationLevel: { enum: ['None', 'Team Lead', 'Manager', 'Director', 'Executive'] },
        assigneeId: { description: 'Assignee user ID' },
        reporterId: { description: 'Reporter user ID' },
        reportedBy: { description: 'Reporter name (for external reports)' },
        labels: { description: 'Comma-separated labels' },
        probability: { omit: true },
        riskScore: { omit: true },
        responseStrategy: { omit: true },
        mitigationPlan: { omit: true },
        contingencyPlan: { omit: true },
        triggerEvents: { omit: true },
        residualRisk: { omit: true },
        reviewerId: { omit: true },
        identifiedDate: { omit: true },
        targetResolutionDateRisk: { omit: true },
        actualResolutionDateRisk: { omit: true },
        proximity: { omit: true },
      },
    }),

    Resource: drizzleTableToOpenApiSchema(resources, {
      required: ['id', 'organizationId', 'displayName'],
      overrides: {
        userId: { description: 'Linked organization member user ID (for auto-synced resources)' },
        resourceCode: { description: 'Unique identifier (e.g. "EMP-001")' },
        resourceType: { enum: ['Employee', 'Contractor', 'Vendor', 'Equipment', 'Material'], description: 'Resource classification' },
        title: { description: 'Job title/role' },
        managerId: { description: 'Direct manager user ID' },
        skills: { description: 'Comma-separated skills' },
        certifications: { description: 'Comma-separated certifications' },
        experienceLevel: { enum: ['Junior', 'Mid-Level', 'Senior', 'Lead', 'Principal'] },
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
      required: ['id', 'organizationId', 'userId', 'resourceId', 'taskId', 'projectId', 'entryDate', 'hours'],
      overrides: {
        userId: { description: 'The user logging time' },
        resourceId: { description: 'The resource record' },
        hours: { description: 'Hours worked (supports decimals like 0.25, 0.5)' },
        status: { enum: ['Draft', 'Submitted', 'Approved', 'Rejected'] },
        approvedBy: { description: 'User ID of approver' },
        proxyUserId: { description: 'User ID if time was logged on behalf of another user' },
      },
    }),

    Invoice: drizzleTableToOpenApiSchema(projectInvoices, {
      required: ['id', 'projectId', 'title'],
      overrides: {
        status: { enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'] },
        fileSize: { description: 'Size in bytes' },
        source: { description: 'Source system: manual, dynamics365, etc.' },
        externalId: { description: 'ID in the source system' },
        externalUrl: { description: 'Direct URL to invoice in source system' },
      },
    }),

    ProjectIntake: drizzleTableToOpenApiSchema(projectIntakes, {
      description: 'Full project intake response object including server-generated fields.',
      required: ['id', 'organizationId', 'projectName'],
      overrides: {
        intakeNumber: { description: 'Auto-generated (e.g. "INT-2026-001")' },
        fundingSource: { description: 'Business Funded, IT Funded, Shared, etc.' },
        currentStep: { description: 'Current workflow step' },
        status: { enum: ['draft', 'in_progress', 'approved', 'rejected', 'cancelled'] },
        createdProjectId: { description: 'Populated after approval when project is created' },
      },
    }),

    ProjectIntakeRequest: createRequestSchema(projectIntakes, {
      description: 'Input schema for creating or updating a project intake. Excludes server-generated fields (id, timestamps, approval tracking, etc.).',
      extraExclude: ['intakeNumber', 'pmoApproved', 'pmoApprovedAt', 'pmoApprovedBy', 'approvedAt', 'approvedBy', 'rejectedAt', 'rejectedBy', 'rejectionReason', 'securityApprovalDate', 'securityApproverId', 'createdProjectId'],
      required: ['organizationId', 'projectName'],
      overrides: {
        fundingSource: { description: 'Business Funded, IT Funded, Shared, etc.' },
        currentStep: { description: 'Current workflow step' },
        status: { enum: ['draft', 'in_progress', 'approved', 'rejected', 'cancelled'] },
      },
    }),

    DependencyType: {
      type: 'string',
      enum: ['FinishToStart', 'StartToStart', 'FinishToFinish', 'StartToFinish'],
      description: 'Task dependency relationship type. API responses use PascalCase values: FinishToStart, StartToStart, FinishToFinish, StartToFinish. For input, the API also accepts alternate formats such as "finish-to-start", "finish_to_start", "FS", "fs", "Finish To Start", etc.',
    },

    TaskDependency: drizzleTableToOpenApiSchema(taskDependencies, {
      required: ['id', 'taskId', 'dependsOnTaskId'],
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
      description: 'Input schema for creating a task dependency. The dependencyType field defaults to finish-to-start if omitted or null. Also accepts alternate formats: "FinishToStart", "finish_to_start", "FS", etc.',
      properties: {
        dependsOnTaskId: { type: 'integer', description: 'The ID of the predecessor task that must complete first' },
        dependencyType: ref('DependencyType'),
        lagDays: { type: 'integer', default: 0, nullable: true, description: 'Lag (positive) or lead (negative) time in working days. Defaults to 0 if omitted or null.' },
      },
      required: ['dependsOnTaskId'],
    },

    TaskDependencyUpdateRequest: {
      type: 'object',
      description: 'Input schema for updating a task dependency. Both fields are optional; only provided fields are changed. Also accepts alternate dependency type formats: "FinishToStart", "finish_to_start", "FS", etc.',
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
      required: ['id'],
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
      required: ['id', 'projectId', 'title', 'fileUrl'],
      overrides: {
        fileSize: { description: 'Size in bytes' },
        uploadedBy: { description: 'User who uploaded the document' },
      },
    }),

    Comment: drizzleTableToOpenApiSchema(projectComments, {
      required: ['id', 'projectId', 'content'],
      overrides: {
        userId: { description: 'User who made the comment' },
        parentCommentId: { description: 'Parent comment ID for threaded replies' },
      },
    }),

    ChangeRequest: drizzleTableToOpenApiSchema(changeRequests, {
      required: ['id', 'projectId', 'title'],
      overrides: {
        requestNumber: { description: 'Auto-generated CR number (e.g. "CR-001")' },
        justification: { description: 'Business justification for the change' },
        type: { enum: ['Scope', 'Schedule', 'Budget', 'Resource', 'Quality'] },
        priority: { enum: ['Low', 'Medium', 'High', 'Critical'] },
        status: { enum: ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Implemented'] },
        impact: { description: 'Description of impact on project' },
        estimatedEffort: { description: 'Effort estimate (e.g. "5 days")' },
        affectedAreas: { description: 'Comma-separated list of affected areas' },
      },
    }),

    Notification: drizzleTableToOpenApiSchema(notifications, {
      required: ['id', 'userId', 'type', 'title', 'message', 'severity', 'isRead', 'createdAt'],
      overrides: {
        type: { description: 'mention, comment_reply, task_overdue, task_deadline_warning, project_health_alert, task_assignment, risk_assignment, issue_assignment, project_assignment, milestone_approaching, milestone_overdue, status_change' },
        riskIssueId: { description: 'Polymorphic: can reference risks or issues' },
        severity: { enum: ['info', 'warning', 'critical'] },
        actionUrl: { description: 'Deep link to the relevant item' },
        metadata: { description: 'JSON string for additional context' },
      },
    }),

    CustomDashboard: drizzleTableToOpenApiSchema(customDashboards, {
      required: ['id', 'organizationId', 'userId', 'name', 'config'],
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
      required: ['id', 'code', 'name'],
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
      required: ['id', 'userId', 'userEmail', 'subject', 'description', 'status'],
      overrides: {
        imageUrls: { description: 'Image URLs stored in object storage' },
        status: { enum: ['new', 'in_progress', 'resolved', 'closed'] },
        priority: { enum: ['low', 'normal', 'high', 'urgent'] },
      },
    }),

    MppImport: drizzleTableToOpenApiSchema(mppImports, {
      required: ['id', 'organizationId', 'fileName', 'fileType'],
      overrides: {
        projectId: { description: 'Link to existing project' },
        fileType: { enum: ['xml', 'csv', 'mpp'] },
        fileUrl: { description: 'URL to original uploaded file' },
        status: { enum: ['active', 'archived'] },
      },
    }),

    ProjectFinancial: drizzleTableToOpenApiSchema(projectFinancials, {
      description: 'Budget/Plan/Actuals with CapEx/OpEx breakdown per fiscal year and period.',
      required: ['id', 'projectId', 'category', 'lineItem', 'fiscalYear'],
      overrides: {
        category: { enum: ['CapEx', 'OpEx'] },
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
      required: ['id', 'projectId', 'name', 'fiscalYear'],
      overrides: {
        parentId: { description: 'Self-reference for hierarchy (null = root level)' },
        category: { description: 'Direct Expense, Licenses, Outside Services, Travel/Meals, Project Material, etc.' },
        aopTotal: { description: 'Annual Operating Plan (original budget)' },
        fcstTotal: { description: 'Forecast total' },
        actTotal: { description: 'Actual total' },
      },
    }),

    RiskAssessment: drizzleTableToOpenApiSchema(projectRiskAssessments, {
      required: ['id', 'riskScore', 'summary'],
      exclude: ['projectId', 'category', 'details', 'factors', 'updatedAt'],
      overrides: {
        riskScore: { description: 'Calculated risk score (0-100)' },
        reportJson: { description: 'Full assessment report as JSON', type: 'object' },
      },
    }),

    CustomField: drizzleTableToOpenApiSchema(customFieldDefinitions, {
      required: ['id', 'organizationId', 'name', 'fieldType'],
      exclude: ['createdAt', 'entityType', 'isActive', 'sortOrder'],
    }),

    CustomTab: drizzleTableToOpenApiSchema(customProjectTabs, {
      required: ['id', 'organizationId', 'name'],
    }),

    ScoringCriterion: drizzleTableToOpenApiSchema(projectScoringCriteria, {
      required: ['id', 'organizationId', 'name'],
      overrides: {
        category: { description: 'Strategic, Financial, Risk, Resource, Technical' },
        weight: { description: 'Numeric weight stored as string (default "1")' },
        scoringGuidelines: { description: 'Instructions for scoring' },
      },
      example: { id: 1, organizationId: 1, name: 'Strategic Alignment', category: 'Strategic', weight: '2.5', maxScore: 10, isActive: true },
    }),

    ScoringCriterionRequest: createRequestSchema(projectScoringCriteria, {
      description: 'Input schema for creating or updating a scoring criterion.',
      required: ['organizationId', 'name'],
      overrides: {
        category: { description: 'Strategic, Financial, Risk, Resource, Technical' },
        weight: { description: 'Numeric weight (default "1")' },
      },
    }),

    ProjectScore: drizzleTableToOpenApiSchema(projectScores, {
      required: ['id', 'projectId', 'criteriaId', 'score'],
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
      required: ['id', 'portfolioId', 'criteriaId', 'aggregationMethod'],
      overrides: {
        aggregationMethod: { enum: ['average', 'sum', 'max', 'min', 'weighted-average'], description: 'How project scores are combined for this criterion' },
      },
    }),

    ProjectBenefit: drizzleTableToOpenApiSchema(projectBenefits, {
      required: ['id', 'projectId', 'name'],
      overrides: {
        category: { description: 'Financial, Operational, Strategic, Customer, etc.' },
        benefitType: { description: 'Tangible or Intangible' },
        measurementMethod: { description: 'How the benefit is measured' },
        unit: { description: 'Currency, Percentage, Number, etc.' },
        targetValue: { description: 'Expected/target value (numeric stored as string)' },
        actualValue: { description: 'Realized/actual value (numeric stored as string)' },
        baselineValue: { description: 'Value before project (numeric stored as string)' },
        status: { enum: ['Planned', 'In Progress', 'Partially Realized', 'Fully Realized', 'Not Achieved'] },
        owner: { description: 'User ID of benefit owner' },
      },
    }),

    ProjectDecision: drizzleTableToOpenApiSchema(projectDecisions, {
      required: ['id', 'projectId', 'title'],
      overrides: {
        decisionType: { description: 'Strategic, Financial, Resource, Risk, Scope, etc.' },
        status: { enum: ['Pending', 'Approved', 'Rejected', 'Deferred', 'Implemented'] },
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
      required: ['id', 'projectId', 'title'],
      overrides: {
        lessonType: { description: 'Positive or Negative' },
      },
    }),

    ReportSubscription: drizzleTableToOpenApiSchema(reportSubscriptions, {
      required: ['id', 'organizationId'],
    }),

    TimesheetPeriod: drizzleTableToOpenApiSchema(timesheetPeriods, {
      required: ['id', 'organizationId'],
      overrides: {
        status: { enum: ['open', 'locked'] },
      },
    }),

    ProjectView: drizzleTableToOpenApiSchema(projectViews, {
      required: ['id', 'name'],
      overrides: {
        viewType: { description: 'gantt, board, list, calendar, etc.' },
      },
    }),

    ProjectTemplate: drizzleTableToOpenApiSchema(projectTemplates, {
      required: ['id', 'organizationId', 'name'],
      overrides: {
        source: { description: 'file or project' },
      },
    }),

    TimesheetAuditLog: drizzleTableToOpenApiSchema(timesheetAuditLog, {
      required: ['id', 'organizationId'],
    }),

    TimesheetComment: drizzleTableToOpenApiSchema(timesheetComments, {
      required: ['id', 'entryId', 'userId'],
    }),

    TimesheetReminderSettings: drizzleTableToOpenApiSchema(timesheetReminderSettings, {
      required: ['organizationId'],
    }),

    TimesheetSettings: drizzleTableToOpenApiSchema(timesheetSettings, {
      required: ['organizationId'],
    }),

    ReferralCode: drizzleTableToOpenApiSchema(referralCodes, {
      required: ['id', 'userId', 'code'],
    }),
  };
}
