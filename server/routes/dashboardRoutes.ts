import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  users, taskResourceAssignments, issues, resources, tasks, projects, portfolios, portfolioKeyDates,
  organizationMembers, featureUsageLogs, timesheetEntries, projectChangeLogs, taskChangeLogs,
  issueChangeLogs, organizations, apiRequestLogs,
  taskDependencies, resourceSkills, resourceAvailability, costItems, financialEntries,
  projectComments, statusReportHistory, healthStatusHistory,
  dailyLogs, dailyLogLabor, dailyLogEquipment,
  rfis, rfiResponses, submittals, submittalRevisions,
  drawingSets, drawings, drawingRevisions, drawingMarkups,
  punchItems, punchItemPhotos, punchItemStatusHistory,
  inspectionTemplates, inspectionTemplateItems, inspections, inspectionResults,
  incidents, incidentActions, observations, observationActions,
  vendors, vendorPrequalifications,
  bidPackages, bidInvitations, bids, bidLineItems,
  changeOrders, changeOrderLineItems,
  constructionInvoices, constructionInvoiceLineItems,
  meetings, meetingAgendaItems, meetingActionItems, meetingMinutes,
  correspondence,
  issueResourceAssignments,
  type Task,
} from "@shared/schema";
import type { User } from "@shared/models/auth";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  openai,
  isTeamMemberInOrg,
  getTeamMemberProjectIds,
  getTeamMemberRiskIds,
  getTeamMemberIssueIds,
  getTeamMemberTaskIds,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";
import { getRequestEmailDomainExclusion } from "../lib/emailDomainFilter";

export function registerDashboardRoutes(app: Express) {
  // ==================== DASHBOARD AGGREGATION ENDPOINTS ====================

  apiRoute(app, 'get', '/api/dashboard/summary', {
    tag: 'Dashboards',
    summary: 'Get dashboard summary',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Dashboard summary data', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const userId = getUserIdFromRequest(req);
      if (!userId || !(await userHasOrgAccess(userId, organizationId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      let orgProjects = await db.select({
        id: projects.id,
        status: projects.status,
        health: projects.health,
        budget: projects.budget,
        actualCost: projects.actualCost,
        completionPercentage: projects.completionPercentage,
        portfolioId: projects.portfolioId,
      }).from(projects).where(
        and(eq(projects.organizationId, organizationId), sql`${projects.deletedAt} IS NULL`)
      );

      const isTeamMember = userId ? await isTeamMemberInOrg(userId, organizationId) : false;
      let allowedTaskIdsList: number[] | null = null;
      let allowedRiskIdsList: number[] | null = null;
      let allowedIssueIdsList: number[] | null = null;

      if (isTeamMember) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId!, organizationId));
        orgProjects = orgProjects.filter(p => allowedProjectIds.has(p.id));
        allowedTaskIdsList = await getTeamMemberTaskIds(userId!, organizationId);
        allowedRiskIdsList = await getTeamMemberRiskIds(userId!, organizationId);
        allowedIssueIdsList = await getTeamMemberIssueIds(userId!, organizationId);
      }

      const projectIds = orgProjects.map(p => p.id);

      let taskStats = { total: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0 };
      let tasksByAssignee: { assignee: string | null; status: string | null; count: number }[] = [];
      let riskStats = { total: 0, open: 0, mitigated: 0, closed: 0, highPriority: 0, criticalImpact: 0 };
      let issueStats = { total: 0, open: 0, inProgress: 0, resolved: 0, highPriority: 0 };
      let risksByPriority: { priority: string | null; count: number }[] = [];
      let issuesByPriority: { priority: string | null; count: number }[] = [];

      if (projectIds.length > 0) {
        const today = new Date().toISOString().split('T')[0];

        const taskWhereConditions = [
          inArray(tasks.projectId, projectIds),
          sql`${tasks.deletedAt} IS NULL`,
        ];
        if (allowedTaskIdsList !== null && allowedTaskIdsList.length > 0) {
          taskWhereConditions.push(inArray(tasks.id, allowedTaskIdsList));
        } else if (allowedTaskIdsList !== null) {
          taskWhereConditions.push(sql`false`);
        }

        const taskCountRows = await db.select({
          status: tasks.status,
          cnt: sql<number>`count(*)::int`,
        }).from(tasks).where(
          and(...taskWhereConditions)
        ).groupBy(tasks.status);

        for (const row of taskCountRows) {
          taskStats.total += row.cnt;
          if (row.status === 'Completed') taskStats.completed += row.cnt;
          else if (row.status === 'In Progress') taskStats.inProgress += row.cnt;
          else if (row.status === 'Not Started') taskStats.notStarted += row.cnt;
        }

        const overdueConditions = [
          inArray(tasks.projectId, projectIds),
          sql`${tasks.deletedAt} IS NULL`,
          sql`${tasks.status} != 'Completed'`,
          sql`${tasks.endDate} IS NOT NULL`,
          sql`${tasks.endDate}::date < ${today}::date`,
        ];
        if (allowedTaskIdsList !== null && allowedTaskIdsList.length > 0) {
          overdueConditions.push(inArray(tasks.id, allowedTaskIdsList));
        } else if (allowedTaskIdsList !== null) {
          overdueConditions.push(sql`false`);
        }

        const [overdueRow] = await db.select({
          cnt: sql<number>`count(*)::int`,
        }).from(tasks).where(
          and(...overdueConditions)
        );
        taskStats.overdue = overdueRow?.cnt || 0;

        const assigneeConditions = [
          inArray(tasks.projectId, projectIds),
          sql`${tasks.deletedAt} IS NULL`,
          sql`${tasks.assignee} IS NOT NULL`,
          sql`${tasks.assignee} != ''`,
        ];
        if (allowedTaskIdsList !== null && allowedTaskIdsList.length > 0) {
          assigneeConditions.push(inArray(tasks.id, allowedTaskIdsList));
        } else if (allowedTaskIdsList !== null) {
          assigneeConditions.push(sql`false`);
        }

        tasksByAssignee = await db.select({
          assignee: tasks.assignee,
          status: tasks.status,
          count: sql<number>`count(*)::int`,
        }).from(tasks).where(
          and(...assigneeConditions)
        ).groupBy(tasks.assignee, tasks.status);

        const riskWhereConditions = [
          inArray(issues.projectId, projectIds),
          eq(issues.itemType, 'risk'),
          sql`${issues.deletedAt} IS NULL`,
        ];
        if (allowedRiskIdsList !== null && allowedRiskIdsList.length > 0) {
          riskWhereConditions.push(inArray(issues.id, allowedRiskIdsList));
        } else if (allowedRiskIdsList !== null) {
          riskWhereConditions.push(sql`false`);
        }

        const riskRows = await db.select({
          status: issues.status,
          priority: issues.priority,
          impact: issues.impact,
          cnt: sql<number>`count(*)::int`,
        }).from(issues).where(
          and(...riskWhereConditions)
        ).groupBy(issues.status, issues.priority, issues.impact);

        for (const row of riskRows) {
          riskStats.total += row.cnt;
          if (row.status === 'Open' || row.status === 'Identified') riskStats.open += row.cnt;
          else if (row.status === 'Mitigated') riskStats.mitigated += row.cnt;
          else if (row.status === 'Closed' || row.status === 'Resolved') riskStats.closed += row.cnt;
          if (row.priority === 'High' || row.priority === 'Critical') riskStats.highPriority += row.cnt;
          if (row.impact === 'Critical' || row.impact === 'High') riskStats.criticalImpact += row.cnt;
        }

        risksByPriority = await db.select({
          priority: issues.priority,
          count: sql<number>`count(*)::int`,
        }).from(issues).where(
          and(...riskWhereConditions)
        ).groupBy(issues.priority);

        const issueWhereConditions = [
          inArray(issues.projectId, projectIds),
          eq(issues.itemType, 'issue'),
          sql`${issues.deletedAt} IS NULL`,
        ];
        if (allowedIssueIdsList !== null && allowedIssueIdsList.length > 0) {
          issueWhereConditions.push(inArray(issues.id, allowedIssueIdsList));
        } else if (allowedIssueIdsList !== null) {
          issueWhereConditions.push(sql`false`);
        }

        const issueRows = await db.select({
          status: issues.status,
          priority: issues.priority,
          cnt: sql<number>`count(*)::int`,
        }).from(issues).where(
          and(...issueWhereConditions)
        ).groupBy(issues.status, issues.priority);

        for (const row of issueRows) {
          issueStats.total += row.cnt;
          if (row.status === 'Open') issueStats.open += row.cnt;
          else if (row.status === 'In Progress') issueStats.inProgress += row.cnt;
          else if (row.status === 'Resolved' || row.status === 'Closed') issueStats.resolved += row.cnt;
          if (row.priority === 'High' || row.priority === 'Critical') issueStats.highPriority += row.cnt;
        }

        issuesByPriority = await db.select({
          priority: issues.priority,
          count: sql<number>`count(*)::int`,
        }).from(issues).where(
          and(...issueWhereConditions)
        ).groupBy(issues.priority);
      }

      const projectStats = {
        total: orgProjects.length,
        byHealth: { Green: 0, Yellow: 0, Red: 0 } as Record<string, number>,
        byStatus: {} as Record<string, number>,
        totalBudget: 0,
        totalActualCost: 0,
        avgCompletion: 0,
      };
      for (const p of orgProjects) {
        if (p.health) projectStats.byHealth[p.health] = (projectStats.byHealth[p.health] || 0) + 1;
        if (p.status) projectStats.byStatus[p.status] = (projectStats.byStatus[p.status] || 0) + 1;
        projectStats.totalBudget += Number(p.budget) || 0;
        projectStats.totalActualCost += Number(p.actualCost) || 0;
      }
      if (orgProjects.length > 0) {
        projectStats.avgCompletion = Math.round(
          orgProjects.reduce((s, p) => s + (Number(p.completionPercentage) || 0), 0) / orgProjects.length
        );
      }

      res.json({
        tasks: taskStats,
        tasksByAssignee,
        risks: riskStats,
        risksByPriority,
        issues: issueStats,
        issuesByPriority,
        projects: projectStats,
      });
    } catch (err) {
      console.error("Error fetching dashboard summary:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching dashboard summary" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/risks', {
    tag: 'Dashboards',
    summary: 'List all risks across projects',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Risks list', arrOf('Organization')), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const orgProjects = await storage.getProjects(organizationId);
      let projectIds = orgProjects.map(p => p.id);

      if (userId && await isTeamMemberInOrg(userId, organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, organizationId));
        projectIds = projectIds.filter(id => allowedProjectIds.has(id));
        if (projectIds.length === 0) return res.json([]);
        const allowedRiskIds = new Set(await getTeamMemberRiskIds(userId, organizationId));
        const allRisks = await db.select().from(issues).where(
          and(
            inArray(issues.projectId, projectIds),
            eq(issues.itemType, 'risk'),
            sql`${issues.deletedAt} IS NULL`
          )
        );
        return res.json(allRisks.filter(r => allowedRiskIds.has(r.id)));
      }

      if (projectIds.length === 0) return res.json([]);
      const allRisks = await db.select().from(issues).where(
        and(
          inArray(issues.projectId, projectIds),
          eq(issues.itemType, 'risk'),
          sql`${issues.deletedAt} IS NULL`
        )
      );
      res.json(allRisks);
    } catch (err) {
      console.error("Error fetching all risks:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching risks" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/resource-assignments', {
    tag: 'Dashboards',
    summary: 'Get all resource assignments',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Resource assignments list', arrOf('Organization')), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      let allAssignments = await storage.getAllTaskResourceAssignments(organizationId);

      if (userId && await isTeamMemberInOrg(userId, organizationId)) {
        const allowedTaskIds = new Set(await getTeamMemberTaskIds(userId, organizationId));
        allAssignments = allAssignments.filter(a => allowedTaskIds.has(a.taskId));
      }

      res.json(allAssignments);
    } catch (err) {
      console.error("Error fetching resource assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource assignments" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/dashboard/utilization', {
    tag: 'Dashboards',
    summary: 'Get dashboard utilization data',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Utilization data', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json([]);
    } catch (err) {
      console.error("Error fetching utilization:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching utilization" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/onboarding/status', {
    tag: 'Dashboards',
    summary: 'Get onboarding status',
    responses: { ...r200('Onboarding status', ref('Organization')), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const { getUserOnboardingStatus } = await import("../services/onboarding");
      const status = await getUserOnboardingStatus(userId);
      res.json(status);
    } catch (err) {
      console.error("Error getting onboarding status:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error checking onboarding status" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/onboarding/complete', {
    tag: 'Dashboards',
    summary: 'Complete onboarding',
    requestBody: body({ type: 'object', properties: { companyName: { type: 'string' }, industry: { type: 'string' }, createDemoData: { type: 'boolean' } } }),
    responses: { ...r200('Onboarding completed', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const { companyName, industry, createDemoData } = req.body;
      if (!companyName || typeof companyName !== 'string') {
        return res.status(400).json({ message: "Company name is required" });
      }
      const { completeOnboarding } = await import("../services/onboarding");
      await completeOnboarding(userId, { companyName, industry: industry || "General", createDemoData: !!createDemoData });
      res.json({ success: true, demoDataCreated: !!createDemoData });
    } catch (err) {
      console.error("Error completing onboarding:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to complete onboarding" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/onboarding/skip', {
    tag: 'Dashboards',
    summary: 'Skip onboarding',
    responses: { ...r200('Onboarding skipped', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
      res.json({ success: true });
    } catch (err) {
      console.error("Error skipping onboarding:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to skip onboarding" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/onboarding/generate-sample-data', {
    tag: 'Dashboards',
    summary: 'Generate sample data for onboarding',
    responses: { ...r200('Sample data generated', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const userOrgs = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
      if (userOrgs.length === 0) return res.status(400).json({ message: "No organization found. Please complete onboarding first." });
      const orgId = userOrgs[0].organizationId;
      const { generateSampleDataForOrg } = await import("../services/onboarding");
      await generateSampleDataForOrg(userId, orgId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error generating sample data:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate sample data" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/demo-data/industries', {
    tag: 'Dashboards',
    summary: 'List available demo data industries',
    responses: { ...r200('Industries list', arrOf('Organization')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const isSuperAdmin = hasAdminAccess(user);
    if (!isSuperAdmin) {
      const memberships = await storage.getUserOrganizations(user.id);
      const isAnyOrgAdmin = memberships.some(m => m.role === 'org_admin');
      if (!isAnyOrgAdmin) {
        return res.status(403).json({ message: 'Organization Admin access required' });
      }
    }
    
    const { industryTemplates } = await import('../demo-data-templates');
    const industries = Object.entries(industryTemplates).map(([key, template]) => ({
      id: key,
      label: template.label,
      description: template.description,
    }));
    
    res.json(industries);
  });

  apiRoute(app, 'post', '/api/demo-data/generate', {
    tag: 'Dashboards',
    summary: 'Generate demo data for organization',
    requestBody: body({ type: 'object', properties: { organizationId: { type: 'integer' }, industry: { type: 'string' }, customIndustry: { type: 'string' }, dataTypes: { type: 'array', items: { type: 'string' } } } }),
    responses: { ...r201('Demo data generated', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const { organizationId, industry, customIndustry, dataTypes } = req.body;
    
    const allDataTypes = ['portfolios', 'projects', 'tasks', 'issues', 'risks', 'assignments', 'timesheets', 'intakes'];
    const selectedTypes = new Set<string>(
      Array.isArray(dataTypes) && dataTypes.length > 0 ? dataTypes : allDataTypes
    );
    
    if (selectedTypes.has('timesheets') || selectedTypes.has('assignments')) {
      selectedTypes.add('tasks');
    }
    if (selectedTypes.has('tasks') || selectedTypes.has('issues') || selectedTypes.has('risks')) {
      selectedTypes.add('projects');
    }
    if (selectedTypes.has('projects')) {
      selectedTypes.add('portfolios');
    }
    
    if (!organizationId) {
      return res.status(400).json({ message: 'organizationId is required' });
    }
    
    if (!industry && !customIndustry) {
      return res.status(400).json({ message: 'industry or customIndustry is required' });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    
    const isSuperAdmin = hasAdminAccess(user);
    const memberships = await storage.getUserOrganizations(user.id);
    const isOrgAdmin = memberships.some(m => m.organizationId === organizationId && m.role === 'org_admin');
    
    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ message: 'Organization Admin access required' });
    }
    
    try {
      const { industryTemplates } = await import('../demo-data-templates');
      type IndustryType = keyof typeof industryTemplates;
      let template = industry ? industryTemplates[industry as IndustryType] : null;
      
      if (customIndustry && !template) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId!, METER_CODES.AI_RUNS, 1, organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({
            message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "ai_runs"
          });
        }

        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        
        const prompt = `Generate realistic project portfolio demo data for a company in the "${customIndustry}" industry. 
        
Create a JSON object with this exact structure:
{
  "portfolios": [
    {
      "name": "Portfolio Name",
      "description": "Portfolio description",
      "projects": [
        {
          "name": "Project Name",
          "description": "Project description",
          "status": "Planning|Initiation|Execution|Monitoring|Closing|Billing",
          "priority": "Low|Medium|High|Critical",
          "budget": "500000",
          "health": "Green|Yellow|Red",
          "completionPercentage": 45,
          "tasks": [
            { "name": "Task name", "description": "Task description", "progress": 80, "status": "Not Started|In Progress|Completed|On Hold", "assignee": "Person Name" }
          ],
          "risks": [
            { "title": "Risk title", "description": "Risk description", "probability": "Low|Medium|High", "impact": "Low|Medium|High|Critical", "status": "Open|Mitigated|Closed", "mitigationPlan": "Mitigation strategy", "costExposure": "50000" }
          ],
          "milestones": [
            { "title": "Milestone title", "description": "Description", "dueDaysFromNow": 30, "completed": false, "status": "Backlog|In Progress|Done", "priority": "Low|Medium|High|Critical", "assignee": "Person Name" }
          ],
          "issues": [
            { "title": "Issue title", "description": "Description", "priority": "Low|Medium|High|Critical", "status": "Open|In Progress|Resolved|Closed", "type": "Bug|Task|Enhancement", "assignee": "Person Name", "costExposure": "25000" }
          ],
          "financials": [
            { "category": "CapEx|OpEx", "lineItem": "Line item name", "description": "Description", "budgetAmount": "100000", "plannedAmount": "90000", "actualAmount": "45000", "notes": "Notes" }
          ]
        }
      ],
      "keyDates": [
        { "title": "Key date title", "description": "Description", "keyDateType": "Deadline|Milestone|Review", "daysFromNow": 30, "status": "Upcoming|At Risk|Completed" }
      ]
    }
  ]
}

Create 2 portfolios with 2-3 projects each. Each portfolio should include 2-4 keyDates. Make project names, tasks, risks, milestones, issues, and key dates realistic for the ${customIndustry} industry. Include realistic budget amounts and varied project statuses.`;

        try {
          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a project portfolio management expert. Generate realistic demo data for project management systems. Return only valid JSON." },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 4000,
          });
          
          // Always track AI credit usage after successful API call, even for free accounts
          const { recordCreditUsage, RESOURCE_TYPES } = await import("../services/billing");
          await recordCreditUsage(userId!, RESOURCE_TYPES.AI_RUN, `ai_demo_${Date.now()}`, organizationId);
          
          const content = response.choices[0]?.message?.content || '{}';
          template = JSON.parse(content);
        } catch (aiError) {
          console.error('AI demo data generation error:', aiError);
          template = industryTemplates['it_software'];
        }
      }
      
      if (!template) {
        return res.status(400).json({ message: 'Invalid industry' });
      }
      
      const {
        projectAddressPool, onSiteLocationLabels, resourceOfficeLocations,
        vendorTemplates, skillTemplates,
        dailyLogTemplates, dailyLogLaborTemplates, dailyLogEquipmentTemplates,
        rfiTemplates, submittalTemplates,
        drawingSetTemplates, drawingTemplates,
        punchItemTemplates,
        inspectionTemplateData, inspectionInstanceTemplates,
        incidentTemplates, observationTemplates,
        changeOrderTemplates, constructionInvoiceTemplates,
        meetingTemplates, correspondenceTemplates,
        bidPackageTemplates, costItemTemplates, projectCommentTemplates,
      } = await import('../demo-data-capital-templates');

      const pickAddress = (index: number) => projectAddressPool[index % projectAddressPool.length];
      const pickLocation = (index: number) => onSiteLocationLabels[index % onSiteLocationLabels.length];
      // Sample project hero images (Unsplash public CDN — no auth required).
      const projectImagePool: { url: string; alt: string }[] = [
        { url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=70', alt: 'Mid-rise construction site with tower crane' },
        { url: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1200&q=70', alt: 'Steel-frame commercial building under construction' },
        { url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=70', alt: 'Modern glass office facade' },
        { url: 'https://images.unsplash.com/photo-1448630360428-65456885c650?auto=format&fit=crop&w=1200&q=70', alt: 'Urban high-rise project site' },
        { url: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=1200&q=70', alt: 'Warehouse and industrial facility build-out' },
        { url: 'https://images.unsplash.com/photo-1590725140246-20acdee442be?auto=format&fit=crop&w=1200&q=70', alt: 'Healthcare facility expansion' },
        { url: 'https://images.unsplash.com/photo-1577415124269-fc1140a69e91?auto=format&fit=crop&w=1200&q=70', alt: 'Roadway and infrastructure project' },
        { url: 'https://images.unsplash.com/photo-1531834685032-c34bf0d84c77?auto=format&fit=crop&w=1200&q=70', alt: 'Residential mid-rise construction' },
      ];
      const pickProjectImage = (index: number) => projectImagePool[index % projectImagePool.length];
      let projectAddressCounter = 0;

      const stats = {
        portfolios: 0,
        projects: 0,
        tasks: 0,
        risks: 0,
        milestones: 0,
        issues: 0,
        financials: 0,
        changeRequests: 0,
        lessonsLearned: 0,
        documents: 0,
        benefits: 0,
        decisions: 0,
        resources: 0,
        intakes: 0,
        assignments: 0,
        timesheets: 0,
        keyDates: 0,
        taskDependencies: 0,
        costItems: 0,
        financialEntries: 0,
        projectComments: 0,
        healthStatusHistory: 0,
        statusReportHistory: 0,
        dailyLogs: 0,
        rfis: 0,
        submittals: 0,
        drawingSets: 0,
        drawings: 0,
        punchListItems: 0,
        inspectionTemplates: 0,
        inspections: 0,
        incidents: 0,
        observations: 0,
        vendors: 0,
        bidPackages: 0,
        bids: 0,
        bidLineItems: 0,
        bidInvitations: 0,
        issueResourceAssignments: 0,
        changeOrders: 0,
        constructionInvoices: 0,
        meetings: 0,
        correspondence: 0,
        resourceSkills: 0,
        resourceAvailability: 0,
      };
      
      const sanitizeBudget = (value: any) => {
        if (typeof value === 'number') return String(value);
        if (typeof value === 'string') return value.replace(/,/g, '');
        return '0';
      };
      
      const today = new Date();
      
      for (const portfolioTemplate of template.portfolios) {
        if (!selectedTypes.has('portfolios')) continue;
        const portfolio = await storage.createPortfolio({
          organizationId,
          name: portfolioTemplate.name,
          description: portfolioTemplate.description,
          isDemo: true,
        });
        stats.portfolios++;
        
        if (portfolioTemplate.keyDates) {
          for (const keyDateTemplate of portfolioTemplate.keyDates) {
            const keyDate = new Date(today);
            keyDate.setDate(keyDate.getDate() + keyDateTemplate.daysFromNow);
            
            await db.insert(portfolioKeyDates).values({
              portfolioId: portfolio.id,
              organizationId,
              title: keyDateTemplate.title,
              description: keyDateTemplate.description,
              keyDateType: keyDateTemplate.keyDateType,
              date: keyDate.toISOString().split('T')[0],
              status: keyDateTemplate.status,
              completed: keyDateTemplate.status === 'Completed',
              createdBy: userId || undefined,
              isDemo: true,
            });
            stats.keyDates++;
          }
        }
        
        for (const projectTemplate of portfolioTemplate.projects) {
          if (!selectedTypes.has('projects')) continue;
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 60);
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 180);
          
          const projImg = pickProjectImage(projectAddressCounter);
          const projAddr = pickAddress(projectAddressCounter++);
          const project = await storage.createProject({
            organizationId,
            portfolioId: portfolio.id,
            name: projectTemplate.name,
            description: projectTemplate.description,
            status: projectTemplate.status,
            priority: projectTemplate.priority,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            budget: Number(sanitizeBudget(projectTemplate.budget)),
            health: projectTemplate.health,
            completionPercentage: projectTemplate.completionPercentage,
            addressLine1: projAddr.addressLine1,
            city: projAddr.city,
            region: projAddr.region,
            country: projAddr.country,
            postalCode: projAddr.postalCode,
            latitude: projAddr.latitude,
            longitude: projAddr.longitude,
            images: [{ url: projImg.url, alt: projImg.alt }],
            isDemo: true,
          });
          const demoCreatorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'System' : 'System';
          await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: demoCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${demoCreatorName} — generated as demo data`, previousValues: null, newValues: null });
          stats.projects++;
          
          const createdTaskIds: number[] = [];
          if (selectedTypes.has('tasks') && projectTemplate.tasks) {
            let taskIndex = 1;
            for (const taskTemplate of projectTemplate.tasks) {
              const taskStart = new Date(today);
              taskStart.setDate(taskStart.getDate() - 30);
              const taskEnd = new Date(today);
              taskEnd.setDate(taskEnd.getDate() + 60);
              
              const task = await storage.createTask({
                projectId: project.id,
                name: taskTemplate.name,
                description: taskTemplate.description,
                startDate: taskStart.toISOString().split('T')[0],
                endDate: taskEnd.toISOString().split('T')[0],
                durationDays: 90,
                progress: taskTemplate.progress,
                status: taskTemplate.status,
                assignee: taskTemplate.assignee,
                isDemo: true,
                taskIndex: taskIndex++,
              });
              createdTaskIds.push(task.id);
              stats.tasks++;
            }
          }
          
          if (selectedTypes.has('risks') && projectTemplate.risks) for (const riskTemplate of projectTemplate.risks) {
            await storage.createRisk({
              projectId: project.id,
              title: riskTemplate.title,
              description: riskTemplate.description,
              probability: riskTemplate.probability,
              impact: riskTemplate.impact,
              status: riskTemplate.status,
              mitigationPlan: riskTemplate.mitigationPlan,
              costExposure: riskTemplate.costExposure || null,
              isDemo: true,
            });
            stats.risks++;
          }
          
          if (projectTemplate.milestones) for (const milestoneTemplate of projectTemplate.milestones) {
            const dueDate = new Date(today);
            dueDate.setDate(dueDate.getDate() + milestoneTemplate.dueDaysFromNow);
            const startDateMs = new Date(dueDate);
            startDateMs.setDate(startDateMs.getDate() - 30);
            
            await storage.createMilestone({
              projectId: project.id,
              title: milestoneTemplate.title,
              description: milestoneTemplate.description,
              dueDate: dueDate.toISOString().split('T')[0],
              startDate: startDateMs.toISOString().split('T')[0],
              completed: milestoneTemplate.completed,
              status: milestoneTemplate.status,
              priority: milestoneTemplate.priority,
              assignee: milestoneTemplate.assignee,
              isDemo: true,
            });
            stats.milestones++;
          }
          
          if (selectedTypes.has('issues') && projectTemplate.issues) for (const issueTemplate of projectTemplate.issues) {
            await storage.createIssue({
              projectId: project.id,
              title: issueTemplate.title,
              description: issueTemplate.description,
              priority: issueTemplate.priority,
              status: issueTemplate.status,
              type: issueTemplate.type,
              assignee: issueTemplate.assignee,
              costExposure: issueTemplate.costExposure || null,
              isDemo: true,
            });
            stats.issues++;
          }
          
          if (projectTemplate.financials) for (const finTemplate of projectTemplate.financials) {
            await storage.createProjectFinancial({
              projectId: project.id,
              category: finTemplate.category,
              lineItem: finTemplate.lineItem,
              description: finTemplate.description,
              fiscalYear: today.getFullYear(),
              fiscalPeriod: 'Full Year',
              budgetAmount: sanitizeBudget(finTemplate.budgetAmount),
              plannedAmount: sanitizeBudget(finTemplate.plannedAmount),
              actualAmount: sanitizeBudget(finTemplate.actualAmount),
              notes: finTemplate.notes,
              isDemo: true,
            });
            stats.financials++;
          }
          
          // Generate demo change requests for each project (use template data if available)
          if (projectTemplate.changeRequests && projectTemplate.changeRequests.length > 0) {
            for (let crIdx = 0; crIdx < projectTemplate.changeRequests.length; crIdx++) {
              const crTemplate = projectTemplate.changeRequests[crIdx];
              const requestedDate = new Date(today);
              requestedDate.setDate(requestedDate.getDate() - (10 - crIdx * 5));
              
              await storage.createChangeRequest({
                projectId: project.id,
                requestNumber: `CR-${String(project.id).padStart(3, '0')}-${String(crIdx + 1).padStart(2, '0')}`,
                title: crTemplate.title,
                description: crTemplate.description,
                justification: crTemplate.justification,
                type: crTemplate.type,
                priority: crTemplate.priority,
                status: crTemplate.status,
                requestedBy: 'Demo User',
                requestedDate: requestedDate.toISOString().split('T')[0],
                impact: crTemplate.impact,
                estimatedCost: String(crTemplate.estimatedCost || 0),
                estimatedEffort: crTemplate.estimatedEffort,
                isDemo: true,
              });
              stats.changeRequests++;
            }
          } else {
            // Fall back to generic change requests
            const changeRequestTypes = ['Scope', 'Schedule', 'Budget', 'Resource'];
            const crStatuses = ['Draft', 'Submitted', 'Under Review', 'Approved'];
            for (let crIdx = 0; crIdx < 2; crIdx++) {
              const crType = changeRequestTypes[crIdx % changeRequestTypes.length];
              const crStatus = crStatuses[crIdx % crStatuses.length];
              const requestedDate = new Date(today);
              requestedDate.setDate(requestedDate.getDate() - (10 - crIdx * 5));
              
              await storage.createChangeRequest({
                projectId: project.id,
                requestNumber: `CR-${String(project.id).padStart(3, '0')}-${String(crIdx + 1).padStart(2, '0')}`,
                title: crIdx === 0 ? 'Scope Enhancement Request' : 'Timeline Adjustment Request',
                description: crIdx === 0 ? 'Additional features requested by stakeholders' : 'Schedule change due to resource constraints',
                justification: crIdx === 0 ? 'Business requirement change based on market feedback' : 'Resource availability requires timeline shift',
                type: crType,
                priority: crIdx === 0 ? 'High' : 'Medium',
                status: crStatus,
                requestedBy: 'Demo User',
                requestedDate: requestedDate.toISOString().split('T')[0],
                isDemo: true,
              });
              stats.changeRequests++;
            }
          }
          
          // Generate lessons learned from template if available
          if (projectTemplate.lessonsLearned && projectTemplate.lessonsLearned.length > 0) {
            for (const lessonTemplate of projectTemplate.lessonsLearned) {
              const identifiedDate = new Date(today);
              identifiedDate.setDate(identifiedDate.getDate() - Math.floor(Math.random() * 60));
              
              await storage.createLessonLearned({
                projectId: project.id,
                title: lessonTemplate.title,
                description: lessonTemplate.description,
                category: lessonTemplate.category,
                type: lessonTemplate.type,
                impact: lessonTemplate.impact,
                phase: lessonTemplate.phase,
                recommendation: lessonTemplate.recommendation,
                status: lessonTemplate.status,
                dateIdentified: identifiedDate.toISOString().split('T')[0],
                isDemo: true,
              });
              stats.lessonsLearned++;
            }
          }
          
          // Generate documents from template if available
          if (projectTemplate.documents && projectTemplate.documents.length > 0) {
            for (const docTemplate of projectTemplate.documents) {
              await storage.createProjectDocument({
                projectId: project.id,
                title: docTemplate.title,
                description: docTemplate.description,
                type: docTemplate.type,
                category: docTemplate.category,
                version: docTemplate.version,
                status: docTemplate.status,
                fileName: docTemplate.fileName,
                content: docTemplate.content || '',
                author: 'Demo User',
                isDemo: true,
              });
              stats.documents++;
            }
          }
          
          // Generate benefits from template if available
          if (projectTemplate.benefits && projectTemplate.benefits.length > 0) {
            for (const benefitTemplate of projectTemplate.benefits) {
              const targetDate = new Date(today);
              targetDate.setDate(targetDate.getDate() + Math.floor(Math.random() * 180) + 30);
              
              await storage.createProjectBenefit({
                projectId: project.id,
                name: benefitTemplate.name,
                description: benefitTemplate.description,
                category: benefitTemplate.category,
                benefitType: benefitTemplate.benefitType,
                status: benefitTemplate.status,
                targetValue: benefitTemplate.targetValue,
                actualValue: benefitTemplate.actualValue || null,
                measurementMethod: benefitTemplate.measurementMethod,
                targetDate: targetDate.toISOString().split('T')[0],
                isDemo: true,
              });
              stats.benefits++;
            }
          }
          
          // Generate decisions from template if available
          if (projectTemplate.decisions && projectTemplate.decisions.length > 0) {
            for (const decisionTemplate of projectTemplate.decisions) {
              const decisionDate = new Date(today);
              decisionDate.setDate(decisionDate.getDate() - Math.floor(Math.random() * 30));
              
              await storage.createProjectDecision({
                projectId: project.id,
                title: decisionTemplate.title,
                description: decisionTemplate.description,
                status: decisionTemplate.status,
                priority: decisionTemplate.priority,
                decisionType: decisionTemplate.decisionType,
                outcome: decisionTemplate.outcome || null,
                rationale: decisionTemplate.rationale || null,
                alternatives: decisionTemplate.alternatives || null,
                decisionDate: decisionTemplate.status === 'Made' ? decisionDate.toISOString().split('T')[0] : null,
                isDemo: true,
              });
              stats.decisions++;
            }
          }

          // ============================================================
          // Capital Projects per-project demo data
          // ============================================================
          const projectIdx = stats.projects; // 1-based
          const projOnSite = pickLocation(projectIdx);
          const padNum = (n: number, w = 3) => String(n).padStart(w, '0');

          // Wrap per-project Capital Projects seeding in a transaction so a
          // failure in one phase rolls back this project's child rows
          // (batched/per-project transactional phase).
          await db.transaction(async (db) => {
          // Task dependencies: chain successive sibling tasks (FS)
          if (selectedTypes.has('tasks') && createdTaskIds.length > 1) {
            for (let ti = 1; ti < createdTaskIds.length; ti++) {
              await db.insert(taskDependencies).values({
                taskId: createdTaskIds[ti],
                dependsOnTaskId: createdTaskIds[ti - 1],
                dependencyType: 'finish-to-start',
                lagDays: 0,
                isDemo: true,
              });
              stats.taskDependencies++;
            }
          }

          // Daily Logs (last 3 weekdays) + labor + equipment
          for (let dayBack = 1; dayBack <= 5; dayBack++) {
            const logDate = new Date(today);
            logDate.setDate(logDate.getDate() - dayBack);
            if (logDate.getDay() === 0 || logDate.getDay() === 6) continue;
            const tpl = dailyLogTemplates[dayBack % dailyLogTemplates.length];
            const [dl] = await db.insert(dailyLogs).values({
              projectId: project.id,
              organizationId,
              logDate: logDate.toISOString().split('T')[0],
              weatherCondition: tpl.weather,
              temperature: tpl.temp,
              windSpeed: tpl.wind,
              precipitation: tpl.precip,
              visitors: tpl.visitors,
              notes: tpl.notes,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.dailyLogs++;
            for (const lab of dailyLogLaborTemplates) {
              await db.insert(dailyLogLabor).values({
                dailyLogId: dl.id,
                company: lab.company,
                trade: lab.trade,
                headcount: lab.headcount,
                hoursWorked: lab.hoursWorked,
                isDemo: true,
              });
            }
            for (const eq of dailyLogEquipmentTemplates) {
              await db.insert(dailyLogEquipment).values({
                dailyLogId: dl.id,
                equipmentName: eq.equipmentName,
                quantity: eq.quantity,
                hoursUsed: eq.hoursUsed,
                status: eq.status,
                isDemo: true,
              });
            }
          }

          // RFIs + responses
          for (let ri = 0; ri < rfiTemplates.length; ri++) {
            const tpl = rfiTemplates[ri];
            const [rfi] = await db.insert(rfis).values({
              projectId: project.id,
              organizationId,
              rfiNumber: `RFI-${padNum(ri + 1)}`,
              subject: tpl.subject,
              question: tpl.question,
              status: tpl.status,
              priority: tpl.priority,
              category: tpl.category,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.rfis++;

            // Add 1-2 responses for non-Open RFIs
            if (tpl.status !== 'Open') {
              await db.insert(rfiResponses).values({
                rfiId: rfi.id,
                responseText: 'Acknowledged — coordinating with design team for clarification. Initial guidance provided per attached sketch.',
                isOfficial: false,
                createdBy: userId || undefined,
                createdByName: 'Design Team',
                isDemo: true,
              });
              if (tpl.status === 'Closed' || tpl.status === 'Answered') {
                await db.insert(rfiResponses).values({
                  rfiId: rfi.id,
                  responseText: 'Official response: proceed per revised detail. Drawing markup attached. No cost or schedule impact anticipated.',
                  isOfficial: true,
                  createdBy: userId || undefined,
                  createdByName: 'Architect of Record',
                  isDemo: true,
                });
              }
            }
          }

          // Submittals + revisions
          for (let si = 0; si < submittalTemplates.length; si++) {
            const tpl = submittalTemplates[si];
            const [sub] = await db.insert(submittals).values({
              projectId: project.id,
              organizationId,
              submittalNumber: `SUB-${padNum(si + 1)}`,
              title: tpl.title,
              specSection: tpl.specSection,
              type: tpl.type,
              status: tpl.status,
              priority: tpl.priority,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.submittals++;

            // Initial revision (always present)
            await db.insert(submittalRevisions).values({
              submittalId: sub.id,
              revisionNumber: 1,
              status: tpl.status === 'Approved' ? 'Approved' : tpl.status === 'Revise & Resubmit' ? 'Revise & Resubmit' : 'Pending',
              notes: 'Initial submittal package — product data, shop drawings, and material certifications.',
              reviewNotes: tpl.status === 'Revise & Resubmit'
                ? 'Update product data sheet and re-submit per spec section requirements.'
                : tpl.status === 'Approved'
                  ? 'Approved as noted — proceed with fabrication.'
                  : 'Under review by architect.',
              createdBy: userId || undefined,
              createdByName: 'Subcontractor',
              isDemo: true,
            });
          }

          // Drawing set + drawings + revisions + markups
          for (const setTpl of drawingSetTemplates) {
            const [ds] = await db.insert(drawingSets).values({
              projectId: project.id,
              organizationId,
              name: setTpl.name,
              discipline: setTpl.discipline,
              description: setTpl.description,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.drawingSets++;
            for (const dt of drawingTemplates) {
              const [dwg] = await db.insert(drawings).values({
                projectId: project.id,
                organizationId,
                drawingSetId: ds.id,
                drawingNumber: dt.drawingNumber,
                title: dt.title,
                discipline: dt.discipline,
                status: dt.status,
                currentRevisionNumber: 1,
                createdBy: userId || undefined,
                isDemo: true,
              }).returning();
              stats.drawings++;

              // Initial revision per drawing (file URL is a demo placeholder)
              const [rev] = await db.insert(drawingRevisions).values({
                drawingId: dwg.id,
                revisionNumber: 1,
                version: 'A',
                fileUrl: `demo://drawings/${dwg.drawingNumber}-r1.pdf`,
                fileName: `${dwg.drawingNumber}-r1.pdf`,
                fileSize: 1024 * 256,
                fileType: 'application/pdf',
                notes: 'Initial issued-for-construction revision.',
                uploadedBy: userId || undefined,
                uploadedByName: 'Architect of Record',
                isDemo: true,
              }).returning();

              // One markup per drawing for demo richness
              await db.insert(drawingMarkups).values({
                revisionId: rev.id,
                drawingId: dwg.id,
                label: 'Field clarification needed at column line',
                markupData: [
                  { type: 'circle', x: 250, y: 320, width: 60, height: 60, color: '#ef4444', strokeWidth: 2 },
                  { type: 'text', x: 320, y: 350, text: 'Verify dim. with field — RFI pending', color: '#ef4444' },
                ],
                createdBy: userId || undefined,
                createdByName: 'Field Engineer',
                isDemo: true,
              });
            }
          }

          // Punch List + photos + status history
          for (let pi = 0; pi < punchItemTemplates.length; pi++) {
            const tpl = punchItemTemplates[pi];
            const due = new Date(today);
            due.setDate(due.getDate() + 14);
            const [punch] = await db.insert(punchItems).values({
              projectId: project.id,
              organizationId,
              number: `PI-${padNum(pi + 1)}`,
              title: tpl.title,
              description: tpl.description,
              location: projOnSite,
              category: tpl.category,
              priority: tpl.priority,
              status: tpl.status,
              dueDate: due.toISOString().split('T')[0],
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.punchListItems++;

            // Initial status entry (Open) for all punch items
            await db.insert(punchItemStatusHistory).values({
              punchItemId: punch.id,
              fromStatus: null,
              toStatus: 'Open',
              changedBy: userId || undefined,
              changedByName: 'Field Superintendent',
              isDemo: true,
            });
            // Transition to current status if not Open
            if (tpl.status !== 'Open') {
              await db.insert(punchItemStatusHistory).values({
                punchItemId: punch.id,
                fromStatus: 'Open',
                toStatus: tpl.status,
                changedBy: userId || undefined,
                changedByName: 'Field Superintendent',
                isDemo: true,
              });
            }

            // Demo photo per punch item (placeholder URL)
            await db.insert(punchItemPhotos).values({
              punchItemId: punch.id,
              fileUrl: `demo://punch/${punch.number}-photo.jpg`,
              fileName: `${punch.number}-before.jpg`,
              fileSize: 1024 * 180,
              photoType: tpl.status === 'Closed' || tpl.status === 'Verified' ? 'after' : 'before',
              caption: tpl.status === 'Closed' || tpl.status === 'Verified'
                ? 'Completed work — ready for verification'
                : 'Initial documentation of deficiency',
              createdBy: userId || undefined,
              isDemo: true,
            });
          }

          // Inspection template + items, then inspection instances + results
          const [inspTpl] = await db.insert(inspectionTemplates).values({
            projectId: project.id,
            organizationId,
            name: inspectionTemplateData.template.name,
            description: inspectionTemplateData.template.description,
            category: inspectionTemplateData.template.category,
            createdBy: userId || undefined,
            isDemo: true,
          }).returning();
          stats.inspectionTemplates++;
          const createdTemplateItems: { id: number; section: string | null; itemText: string }[] = [];
          for (let ii = 0; ii < inspectionTemplateData.items.length; ii++) {
            const it = inspectionTemplateData.items[ii];
            const [tplItem] = await db.insert(inspectionTemplateItems).values({
              templateId: inspTpl.id,
              section: it.section,
              itemText: it.itemText,
              itemType: it.itemType,
              sortOrder: ii,
              isDemo: true,
            }).returning();
            createdTemplateItems.push({ id: tplItem.id, section: it.section, itemText: it.itemText });
          }
          for (let ii = 0; ii < inspectionInstanceTemplates.length; ii++) {
            const tpl = inspectionInstanceTemplates[ii];
            const sched = new Date(today);
            sched.setDate(sched.getDate() - (5 - ii * 2));
            const [insp] = await db.insert(inspections).values({
              projectId: project.id,
              organizationId,
              templateId: inspTpl.id,
              number: `INS-${padNum(ii + 1)}`,
              title: tpl.title,
              inspectionType: tpl.inspectionType,
              status: tpl.status,
              location: projOnSite,
              scheduledDate: sched.toISOString().split('T')[0],
              completedDate: tpl.status === 'Completed' ? sched.toISOString().split('T')[0] : null,
              overallResult: tpl.overallResult,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.inspections++;

            // Generate one result per template item for completed inspections
            if (tpl.status === 'Completed' && createdTemplateItems.length > 0) {
              for (let ti = 0; ti < createdTemplateItems.length; ti++) {
                const tplItem = createdTemplateItems[ti];
                // Make most pass; mark a couple deficient for realism
                const isDeficient = ti % 4 === 0 && tpl.overallResult !== 'Pass';
                await db.insert(inspectionResults).values({
                  inspectionId: insp.id,
                  templateItemId: tplItem.id,
                  itemText: tplItem.itemText,
                  section: tplItem.section,
                  result: isDeficient ? 'Fail' : 'Pass',
                  notes: isDeficient ? 'Item flagged during walkthrough — corrective action issued.' : 'Compliant.',
                  deficiencyDescription: isDeficient ? 'Installation does not meet specification — see corrective action.' : null,
                  correctiveAction: isDeficient ? 'Subcontractor to remediate within 7 days.' : null,
                  isDemo: true,
                });
              }
            }
          }

          // Incidents + actions
          for (let ix = 0; ix < incidentTemplates.length; ix++) {
            const tpl = incidentTemplates[ix];
            const incDate = new Date(today);
            incDate.setDate(incDate.getDate() - 7 - ix);
            const [inc] = await db.insert(incidents).values({
              projectId: project.id,
              organizationId,
              number: `INC-${padNum(ix + 1)}`,
              title: tpl.title,
              description: tpl.description,
              incidentDate: incDate,
              location: projOnSite,
              category: tpl.category,
              severity: tpl.severity,
              status: tpl.status,
              rootCause: tpl.rootCause,
              immediateActions: tpl.immediateActions,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.incidents++;
            for (const act of tpl.actions) {
              await db.insert(incidentActions).values({
                incidentId: inc.id,
                actionType: act.actionType,
                description: act.description,
                status: act.status,
                createdBy: userId || undefined,
                isDemo: true,
              });
            }
          }

          // Observations + actions
          for (let ox = 0; ox < observationTemplates.length; ox++) {
            const tpl = observationTemplates[ox];
            const obsDate = new Date(today);
            obsDate.setDate(obsDate.getDate() - 3 - ox);
            const [obs] = await db.insert(observations).values({
              projectId: project.id,
              organizationId,
              number: `OBS-${padNum(ox + 1)}`,
              title: tpl.title,
              description: tpl.description,
              category: tpl.category,
              observationType: tpl.observationType,
              location: projOnSite,
              severity: tpl.severity,
              status: tpl.status,
              correctiveAction: tpl.correctiveAction,
              observedDate: obsDate.toISOString().split('T')[0],
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.observations++;
            for (const act of tpl.actions) {
              await db.insert(observationActions).values({
                observationId: obs.id,
                actionType: act.actionType,
                description: act.description,
                status: act.status,
                createdBy: userId || undefined,
                isDemo: true,
              });
            }
          }

          // Change orders + line items
          for (const tpl of changeOrderTemplates) {
            const reqDate = new Date(today);
            reqDate.setDate(reqDate.getDate() - 10);
            const [co] = await db.insert(changeOrders).values({
              projectId: project.id,
              changeOrderNumber: tpl.changeOrderNumber,
              title: tpl.title,
              description: tpl.description,
              tier: tpl.tier,
              status: tpl.status,
              reasonCode: tpl.reasonCode,
              costImpact: tpl.costImpact,
              scheduleImpactDays: tpl.scheduleImpactDays,
              requestedBy: 'Demo PM',
              requestedDate: reqDate.toISOString().split('T')[0],
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.changeOrders++;
            for (let li = 0; li < tpl.lines.length; li++) {
              const ln = tpl.lines[li];
              await db.insert(changeOrderLineItems).values({
                changeOrderId: co.id,
                costCode: ln.costCode,
                description: ln.description,
                quantity: ln.quantity,
                unitPrice: ln.unitPrice,
                totalPrice: ln.totalPrice,
                category: ln.category,
                sortOrder: li,
                isDemo: true,
              });
            }
          }

          // Construction invoices (pay applications) + line items
          for (const tpl of constructionInvoiceTemplates) {
            const periodTo = new Date(today);
            const periodFrom = new Date(today);
            periodFrom.setDate(periodFrom.getDate() - 30);
            const [inv] = await db.insert(constructionInvoices).values({
              projectId: project.id,
              invoiceNumber: tpl.invoiceNumber,
              title: tpl.title,
              description: tpl.description,
              contractAmount: tpl.contractAmount,
              totalAmount: tpl.totalAmount,
              previousBilled: tpl.previousBilled,
              currentBilled: tpl.currentBilled,
              balanceToFinish: tpl.balanceToFinish,
              retainage: tpl.retainage,
              status: tpl.status,
              vendorName: tpl.vendorName,
              periodFrom: periodFrom.toISOString().split('T')[0],
              periodTo: periodTo.toISOString().split('T')[0],
              submittedDate: periodTo.toISOString().split('T')[0],
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.constructionInvoices++;
            for (let li = 0; li < tpl.lines.length; li++) {
              const ln = tpl.lines[li];
              await db.insert(constructionInvoiceLineItems).values({
                invoiceId: inv.id,
                costCode: ln.costCode,
                description: ln.description,
                scheduledValue: ln.scheduledValue,
                previousBilled: ln.previousBilled,
                currentBilled: ln.currentBilled,
                balanceToFinish: ln.balanceToFinish,
                percentComplete: ln.percentComplete,
                sortOrder: li,
                isDemo: true,
              });
            }
          }

          // Meetings + agenda + actions + minutes
          for (let mi = 0; mi < meetingTemplates.length; mi++) {
            const tpl = meetingTemplates[mi];
            const mDate = new Date(today);
            mDate.setDate(mDate.getDate() - (mi * 7 + 2));
            const [mt] = await db.insert(meetings).values({
              projectId: project.id,
              meetingNumber: `MTG-${padNum(mi + 1)}`,
              title: tpl.title,
              meetingType: tpl.meetingType,
              status: tpl.status,
              date: mDate.toISOString().split('T')[0],
              startTime: '09:00',
              endTime: '10:00',
              location: pickLocation(projectIdx + mi),
              attendees: 'Owner, Architect, GC, Key Subs',
              minutesNotes: tpl.minutesNotes,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.meetings++;
            for (let ai = 0; ai < tpl.agenda.length; ai++) {
              const ag = tpl.agenda[ai];
              await db.insert(meetingAgendaItems).values({
                meetingId: mt.id,
                title: ag.title,
                presenter: ag.presenter,
                duration: ag.duration,
                sortOrder: ai,
                isDemo: true,
              });
            }
            const dueAct = new Date(today);
            dueAct.setDate(dueAct.getDate() + 7);
            for (const act of tpl.actions) {
              await db.insert(meetingActionItems).values({
                meetingId: mt.id,
                projectId: project.id,
                title: act.title,
                assignee: act.assignee,
                status: act.status,
                priority: act.priority,
                dueDate: dueAct.toISOString().split('T')[0],
                isDemo: true,
              });
            }
            await db.insert(meetingMinutes).values({
              meetingId: mt.id,
              projectId: project.id,
              content: tpl.minutesContent,
              recordedBy: userId || undefined,
              isDemo: true,
            });
          }

          // Correspondence
          for (let ci = 0; ci < correspondenceTemplates.length; ci++) {
            const tpl = correspondenceTemplates[ci];
            const cDate = new Date(today);
            cDate.setDate(cDate.getDate() - ci * 5);
            await db.insert(correspondence).values({
              projectId: project.id,
              correspondenceNumber: `CORR-${padNum(ci + 1)}`,
              type: tpl.type,
              subject: tpl.subject,
              body: tpl.body,
              fromName: tpl.fromName,
              toName: tpl.toName,
              date: cDate.toISOString().split('T')[0],
              status: tpl.status,
              priority: tpl.priority,
              createdBy: userId || undefined,
              isDemo: true,
            });
            stats.correspondence++;
          }

          // Bid packages + line items (bids/invitations require vendors — added at org-level later)
          for (let bi = 0; bi < bidPackageTemplates.length; bi++) {
            const tpl = bidPackageTemplates[bi];
            const dueBP = new Date(today);
            dueBP.setDate(dueBP.getDate() + 21);
            const [bp] = await db.insert(bidPackages).values({
              projectId: project.id,
              organizationId,
              number: tpl.number,
              title: tpl.title,
              description: tpl.scope,
              tradeCategory: tpl.tradeCategory,
              scope: tpl.scope,
              estimatedBudget: String(tpl.estimatedBudget),
              dueDate: dueBP.toISOString().split('T')[0],
              status: tpl.status,
              createdBy: userId || undefined,
              isDemo: true,
            }).returning();
            stats.bidPackages++;
            // Note: bidLineItems require a NOT NULL bidId, so package-stage line
            // items are deferred to the bid-invitation phase below where each
            // submitted bid gets its own line items.
          }

          // Cost items (capital cost catalog per project) — current fiscal year
          const fyYear = today.getFullYear();
          const costItemRows: { id: number; tpl: typeof costItemTemplates[number] }[] = [];
          for (const tpl of costItemTemplates) {
            const [row] = await db.insert(costItems).values({
              projectId: project.id,
              name: tpl.name,
              financialView: tpl.financialView,
              costCategory: tpl.costCategory,
              costSpecification: tpl.costSpecification,
              category: tpl.category,
              wbs: tpl.wbs,
              fiscalYear: fyYear,
              isDemo: true,
            }).returning();
            costItemRows.push({ id: row.id, tpl });
            stats.costItems++;
          }

          // Financial entries — multi-year coverage (prior, current, next FY).
          // Volume bounded: prior year = actuals only, current year = aop+fcst+act
          // (act through current month), next year = aop+fcst only (no actuals).
          const fyYears: { year: number; scenarios: string[]; capActMonth?: number }[] = [
            { year: fyYear - 1, scenarios: ['act'] },
            { year: fyYear, scenarios: ['aop', 'fcst', 'act'], capActMonth: today.getMonth() + 1 },
            { year: fyYear + 1, scenarios: ['aop', 'fcst'] },
          ];
          for (const ci of costItemRows) {
            for (const yr of fyYears) {
              for (const scenario of yr.scenarios) {
                for (let m = 1; m <= 12; m++) {
                  let baseAmount: number;
                  if (scenario === 'aop') {
                    baseAmount = Math.floor(Math.random() * 8000) + 2000;
                  } else if (scenario === 'fcst') {
                    baseAmount = Math.floor(Math.random() * 8000) + 2200;
                  } else {
                    // act — capped to current month for current FY; full year for prior FY
                    if (yr.capActMonth !== undefined && m > yr.capActMonth) continue;
                    baseAmount = Math.floor(Math.random() * 7500) + 1800;
                  }
                  await db.insert(financialEntries).values({
                    projectId: project.id,
                    fiscalYear: yr.year,
                    scenario,
                    month: m,
                    amount: baseAmount,
                    itemKey: `demo-${ci.id}`,
                    itemName: ci.tpl.name,
                    financialView: ci.tpl.financialView,
                    costCategory: ci.tpl.costCategory,
                    costSpecification: ci.tpl.costSpecification,
                    category: ci.tpl.category,
                    wbs: ci.tpl.wbs,
                    isDemo: true,
                  });
                  stats.financialEntries++;
                }
              }
            }
          }

          // Project comments
          for (const ct of projectCommentTemplates) {
            await db.insert(projectComments).values({
              projectId: project.id,
              content: ct.content,
              authorName: ct.authorName,
              authorId: userId || undefined,
              isDemo: true,
            });
            stats.projectComments++;
          }

          // Status report history — 8 entries spanning ~90 days
          // (every ~12 days; satisfies the 6-12 entries / ~90-day requirement).
          const statusEntryCount = 8;
          const statusSpanDays = 90;
          const statusStepDays = Math.floor(statusSpanDays / (statusEntryCount - 1));
          const statusHealthCycle: ('Green' | 'Yellow' | 'Red')[] =
            ['Green', 'Green', 'Yellow', 'Green', 'Yellow', 'Red', 'Yellow', 'Green'];
          for (let wi = 0; wi < statusEntryCount; wi++) {
            const reportDate = new Date(today);
            reportDate.setDate(reportDate.getDate() - (wi * statusStepDays + 2));
            const health = statusHealthCycle[wi % statusHealthCycle.length];
            await db.insert(statusReportHistory).values({
              projectId: project.id,
              organizationId,
              reportDate: reportDate.toISOString().split('T')[0],
              reportType: 'weekly',
              executiveSummary: health === 'Red'
                ? 'Critical issue — recovery plan engaged; daily standups in effect.'
                : health === 'Yellow'
                  ? 'Schedule slip flagged — recovery plan in place. Crews on site and producing.'
                  : 'On plan for the period. Crews productive; no significant issues.',
              projectHealth: health,
              projectStatus: projectTemplate.status,
              completionPercentage: Math.max(5, projectTemplate.completionPercentage - wi * 3),
              isDemo: true,
            });
            stats.statusReportHistory++;
          }

          // Health status history — 8 transitions spanning ~90 days
          // (paralleling status reports; satisfies 6-12 entries / ~90-day window).
          const healthEntryCount = 8;
          const healthSpanDays = 90;
          const healthStepDays = Math.floor(healthSpanDays / (healthEntryCount - 1));
          const healthCycle: ('Green' | 'Yellow' | 'Red')[] =
            ['Green', 'Green', 'Yellow', 'Green', 'Yellow', 'Red', 'Yellow', 'Green'];
          let prevHealth: 'Green' | 'Yellow' | 'Red' = 'Green';
          // Note: healthStatusHistory schema has no historical date column —
          // entries will all share createdAt=now(), but the sequence of 8
          // snapshots reflects ~90 days of project health transitions.
          for (let hi = 0; hi < healthEntryCount; hi++) {
            const newHealth = healthCycle[hi % healthCycle.length];
            const daysAgo = (healthEntryCount - 1 - hi) * healthStepDays + 1;
            await db.insert(healthStatusHistory).values({
              projectId: project.id,
              previousHealth: prevHealth,
              newHealth,
              comment: (newHealth === 'Red'
                ? 'Critical risk surfaced at OAC — recovery actions logged'
                : newHealth === 'Yellow'
                  ? 'Schedule slip flagged at weekly OAC'
                  : 'Weekly status update — on plan')
                + ` (snapshot ~${daysAgo}d ago).`,
              changedBy: userId || undefined,
              changedByName: demoCreatorName,
              isDemo: true,
            });
            prevHealth = newHealth;
            stats.healthStatusHistory++;
          }
          }); // end per-project Capital Projects transaction
        }
      }
      
      const createdResourceIds: number[] = [];
      const resourceTemplates = [
        { name: 'John Smith', email: 'john.smith@demo.com', title: 'Senior Project Manager', department: 'Project Management', skills: 'Agile,Scrum,PMP,Risk Management' },
        { name: 'Sarah Johnson', email: 'sarah.johnson@demo.com', title: 'Business Analyst', department: 'Business Analysis', skills: 'Requirements,BPMN,SQL,Data Analysis' },
        { name: 'Michael Chen', email: 'michael.chen@demo.com', title: 'Technical Lead', department: 'Engineering', skills: 'Architecture,Cloud,DevOps,Python' },
        { name: 'Emily Rodriguez', email: 'emily.rodriguez@demo.com', title: 'UX Designer', department: 'Design', skills: 'Figma,User Research,Prototyping,CSS' },
        { name: 'David Kim', email: 'david.kim@demo.com', title: 'Developer', department: 'Engineering', skills: 'React,TypeScript,Node.js,PostgreSQL' },
      ];
      
      for (let rIdx = 0; rIdx < resourceTemplates.length; rIdx++) {
        const resourceTemplate = resourceTemplates[rIdx];
        const resource = await storage.createResource({
          organizationId,
          displayName: resourceTemplate.name,
          email: resourceTemplate.email,
          title: resourceTemplate.title,
          department: resourceTemplate.department,
          skills: resourceTemplate.skills,
          location: resourceOfficeLocations[rIdx % resourceOfficeLocations.length],
          hourlyRate: Math.floor(Math.random() * 100) + 80,
          isActive: true,
          isDemo: true,
        });
        createdResourceIds.push(resource.id);
        stats.resources++;

        // Skills (normalized)
        const skills = skillTemplates[rIdx % skillTemplates.length];
        const proficiencies = ['Intermediate', 'Advanced', 'Expert'];
        for (let si = 0; si < skills.length; si++) {
          await db.insert(resourceSkills).values({
            organizationId,
            resourceId: resource.id,
            skillName: skills[si],
            proficiencyLevel: proficiencies[si % proficiencies.length],
            yearsOfExperience: 2 + (si % 6),
            isDemo: true,
          });
          stats.resourceSkills++;
        }

        // Availability (one PTO + one training entry within next 60 days)
        const ptoStart = new Date(today);
        ptoStart.setDate(ptoStart.getDate() + 14 + rIdx * 3);
        const ptoEnd = new Date(ptoStart);
        ptoEnd.setDate(ptoEnd.getDate() + 4);
        await db.insert(resourceAvailability).values({
          organizationId,
          resourceId: resource.id,
          startDate: ptoStart.toISOString().split('T')[0],
          endDate: ptoEnd.toISOString().split('T')[0],
          type: 'pto',
          notes: 'Planned vacation',
          status: 'approved',
          createdBy: userId || undefined,
          isDemo: true,
        });
        stats.resourceAvailability++;
        const trnStart = new Date(today);
        trnStart.setDate(trnStart.getDate() + 30 + rIdx * 2);
        const trnEnd = new Date(trnStart);
        trnEnd.setDate(trnEnd.getDate() + 1);
        await db.insert(resourceAvailability).values({
          organizationId,
          resourceId: resource.id,
          startDate: trnStart.toISOString().split('T')[0],
          endDate: trnEnd.toISOString().split('T')[0],
          type: 'training',
          notes: 'Industry training / certification course',
          status: 'approved',
          createdBy: userId || undefined,
          isDemo: true,
        });
        stats.resourceAvailability++;
      }

      // Wrap org-level vendors + bid invitations in a transaction
      // (batched transactional phase — vendor catalog + bid responses).
      await db.transaction(async (db) => {
      // Org-level vendors (used by Bidding & Pay-app modules)
      const createdVendorIds: number[] = [];
      for (const vt of vendorTemplates) {
        const [v] = await db.insert(vendors).values({
          organizationId,
          companyName: vt.companyName,
          contactName: vt.contactName,
          email: vt.email,
          phone: vt.phone,
          address: vt.address,
          city: vt.city,
          state: vt.state,
          zipCode: vt.zipCode,
          tradeSpecialty: vt.tradeSpecialty,
          licenseNumber: vt.licenseNumber,
          bondingCapacity: vt.bondingCapacity,
          status: 'Active',
          rating: vt.rating,
          createdBy: userId || undefined,
          isDemo: true,
        }).returning();
        createdVendorIds.push(v.id);
        stats.vendors++;

        // Vendor prequalification (one row per vendor)
        await db.insert(vendorPrequalifications).values({
          vendorId: v.id,
          organizationId,
          safetyRating: vt.prequalified ? 5 : Math.max(3, vt.rating),
          financialRating: vt.rating,
          qualityRating: vt.rating,
          experienceYears: 8 + (vt.rating * 2),
          emrRate: vt.prequalified ? '0.78' : '0.92',
          osha300Log: true,
          insuranceCertificate: true,
          bondingLetter: vt.prequalified,
          overallScore: vt.prequalified ? 90 + vt.rating : 70 + vt.rating * 2,
          qualificationStatus: vt.prequalified ? 'Approved' : 'Pending',
          notes: vt.prequalified
            ? 'Approved subcontractor — current insurance and bonding on file.'
            : 'Documentation under review by procurement.',
          createdBy: userId || undefined,
          isDemo: true,
        });
      }

      // Bid invitations + bids + bid line items per demo bid package (vendors required)
      if (createdVendorIds.length > 0) {
        const demoBidPackages = await db.select({ id: bidPackages.id, estimatedBudget: bidPackages.estimatedBudget })
          .from(bidPackages)
          .innerJoin(projects, eq(bidPackages.projectId, projects.id))
          .where(and(eq(projects.organizationId, organizationId), eq(bidPackages.isDemo, true)));

        for (let bpIdx = 0; bpIdx < demoBidPackages.length; bpIdx++) {
          const bp = demoBidPackages[bpIdx];
          // Invite a rotating subset of vendors per package
          const inviteCount = Math.min(4, createdVendorIds.length);
          const startIdx = bpIdx % createdVendorIds.length;
          for (let invIdx = 0; invIdx < inviteCount; invIdx++) {
            const vendorId = createdVendorIds[(startIdx + invIdx) % createdVendorIds.length];
            const invStatus = invIdx === 0 ? 'Submitted' : invIdx === 1 ? 'Submitted' : invIdx === 2 ? 'Submitted' : 'Declined';
            await db.insert(bidInvitations).values({
              bidPackageId: bp.id,
              vendorId,
              status: invStatus,
              respondedAt: new Date(),
              declineReason: invStatus === 'Declined' ? 'Capacity constraints — unable to bid this cycle.' : null,
              createdBy: userId || undefined,
              isDemo: true,
            });
            stats.bidInvitations++;

            if (invStatus === 'Submitted') {
              const baseBudget = Number(bp.estimatedBudget) || 250000;
              const variance = (invIdx - 1) * 0.05; // -5%, 0%, +5%
              const totalAmount = Math.round(baseBudget * (1 + variance));
              const validUntil = new Date();
              validUntil.setDate(validUntil.getDate() + 60);
              const [bidRow] = await db.insert(bids).values({
                bidPackageId: bp.id,
                vendorId,
                totalAmount: String(totalAmount),
                bondIncluded: true,
                notes: invIdx === 1 ? 'Includes value-engineering options outlined in cover letter.' : 'Base bid only — see exclusions.',
                exclusions: 'Permits, owner-furnished equipment, weekend premium time.',
                clarifications: 'Schedule assumes site access by package due date.',
                validUntil: validUntil.toISOString().split('T')[0],
                status: 'Submitted',
                evaluationScore: 80 + (invIdx === 1 ? 10 : 0) - invIdx * 2,
                evaluationNotes: invIdx === 1 ? 'Strongest technical and commercial response.' : 'Compliant bid.',
                isRecommended: invIdx === 1,
                createdBy: userId || undefined,
                isDemo: true,
              }).returning();
              stats.bids++;

              const lineItemDefs = [
                { description: 'Mobilization & general conditions', pct: 0.10, category: 'General Conditions' },
                { description: 'Materials & equipment', pct: 0.55, category: 'Materials' },
                { description: 'Labor & installation', pct: 0.30, category: 'Labor' },
                { description: 'Closeout & demobilization', pct: 0.05, category: 'Closeout' },
              ];
              for (let li = 0; li < lineItemDefs.length; li++) {
                const ln = lineItemDefs[li];
                const lineTotal = Math.round(totalAmount * ln.pct);
                await db.insert(bidLineItems).values({
                  bidId: bidRow.id,
                  bidPackageId: bp.id,
                  description: ln.description,
                  quantity: '1',
                  unit: 'LS',
                  unitPrice: String(lineTotal),
                  totalPrice: String(lineTotal),
                  category: ln.category,
                  sortOrder: li,
                  isDemo: true,
                });
                stats.bidLineItems++;
              }
            }
          }
        }
      }
      }); // end vendors + bid invitations transaction
      
      if (selectedTypes.has('assignments') && createdResourceIds.length > 0) {
        const demoTasks = await db.select({ id: tasks.id, projectId: tasks.projectId })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(and(eq(projects.organizationId, organizationId), eq(tasks.isDemo, true)));
        
        for (const task of demoTasks) {
          const numAssignees = Math.min(1 + Math.floor(Math.random() * 2), createdResourceIds.length);
          const shuffled = [...createdResourceIds].sort(() => Math.random() - 0.5);
          const roles = ['Lead', 'Support', 'Reviewer', 'Contributor'];
          for (let i = 0; i < numAssignees; i++) {
            await db.insert(taskResourceAssignments).values({
              taskId: task.id,
              resourceId: shuffled[i],
              allocationPercentage: i === 0 ? 80 : 40,
              role: roles[i % roles.length],
              isDemo: true,
            });
            stats.assignments++;
          }
        }
      }
      
      if (selectedTypes.has('timesheets') && createdResourceIds.length > 0) {
        const demoTasks = await db.select({ id: tasks.id, projectId: tasks.projectId })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(and(eq(projects.organizationId, organizationId), eq(tasks.isDemo, true)));
        
        if (demoTasks.length > 0 && userId) {
          for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
            const entryDate = new Date(today);
            entryDate.setDate(entryDate.getDate() - dayOffset);
            if (entryDate.getDay() === 0 || entryDate.getDay() === 6) continue;
            
            const numEntries = 1 + Math.floor(Math.random() * 2);
            for (let e = 0; e < numEntries; e++) {
              const task = demoTasks[Math.floor(Math.random() * demoTasks.length)];
              const resource = createdResourceIds[Math.floor(Math.random() * createdResourceIds.length)];
              const hours = [1, 1.5, 2, 2.5, 3, 4, 6, 8][Math.floor(Math.random() * 8)];
              
              await storage.createTimesheetEntry({
                organizationId,
                userId: userId,
                resourceId: resource,
                taskId: task.id,
                projectId: task.projectId,
                entryDate: entryDate.toISOString().split('T')[0],
                hours: String(hours),
                notes: ['Development work', 'Code review', 'Testing', 'Documentation', 'Meeting', 'Design review'][Math.floor(Math.random() * 6)],
                status: dayOffset > 7 ? 'Approved' : dayOffset > 3 ? 'Submitted' : 'Draft',
                isDemo: true,
              });
              stats.timesheets++;
            }
          }
        }
      }
      
      // Issue/risk resource assignments (1 per demo issue/risk to a rotating resource)
      // Wrapped in transaction (batched transactional phase).
      if (createdResourceIds.length > 0) {
        await db.transaction(async (db) => {
          const demoIssuesAndRisks = await db.select({ id: issues.id })
            .from(issues)
            .innerJoin(projects, eq(issues.projectId, projects.id))
            .where(and(eq(projects.organizationId, organizationId), eq(issues.isDemo, true)));
          const roles = ['Owner', 'Mitigator', 'Reviewer', 'Assignee'];
          for (let ix = 0; ix < demoIssuesAndRisks.length; ix++) {
            const item = demoIssuesAndRisks[ix];
            await db.insert(issueResourceAssignments).values({
              issueId: item.id,
              resourceId: createdResourceIds[ix % createdResourceIds.length],
              role: roles[ix % roles.length],
              isDemo: true,
            });
          }
        });
      }

      if (selectedTypes.has('intakes')) {
        const intakeTemplates = [
          { name: 'Customer Portal Enhancement', status: 'submitted', businessUnit: 'Customer Success', funding: 'Business Funded', budget: '450000', description: 'Enhance self-service capabilities in customer portal' },
          { name: 'Data Analytics Platform', status: 'approved', businessUnit: 'Data & Analytics', funding: 'IT Funded', budget: '800000', description: 'Enterprise data analytics and reporting platform' },
          { name: 'Mobile App v3.0', status: 'draft', businessUnit: 'Digital', funding: 'Shared', budget: '350000', description: 'Major mobile application redesign and feature update' },
          { name: 'Security Compliance Upgrade', status: 'submitted', businessUnit: 'IT Security', funding: 'IT Funded', budget: '275000', description: 'SOC2 and ISO compliance infrastructure updates' },
        ];
        
        const year = today.getFullYear();
        for (let intakeIdx = 0; intakeIdx < intakeTemplates.length; intakeIdx++) {
          const intakeTemplate = intakeTemplates[intakeIdx];
          await storage.createProjectIntake({
            organizationId,
            intakeNumber: `INT-${year}-${String(intakeIdx + 1).padStart(3, '0')}`,
            projectName: intakeTemplate.name,
            description: intakeTemplate.description,
            status: intakeTemplate.status,
            businessUnit: intakeTemplate.businessUnit,
            fundingSource: intakeTemplate.funding,
            estimatedBudget: intakeTemplate.budget,
            currentStep: intakeTemplate.status === 'approved' ? 'pmo_approved' : 'basic_info',
            basicInfoComplete: true,
            isDemo: true,
          });
          stats.intakes++;
        }
      }
      
      res.status(201).json({
        success: true,
        message: `Demo data generated for ${org.name}`,
        stats,
      });
    } catch (err) {
      console.error('Error generating demo data:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to generate demo data' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/demo-data/:organizationId', {
    tag: 'Dashboards',
    summary: 'Delete demo data for organization',
    parameters: [pathId('organizationId')],
    responses: { ...r200('Demo data deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    const user = userId ? await storage.getUser(userId) : null;
    
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const organizationId = Number(req.params.organizationId);
    if (!organizationId) {
      return res.status(400).json({ message: 'Organization ID is required' });
    }
    
    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    
    const isSuperAdmin = hasAdminAccess(user);
    const memberships = await storage.getUserOrganizations(user.id);
    const isOrgAdmin = memberships.some(m => m.organizationId === organizationId && m.role === 'org_admin');
    
    if (!isSuperAdmin && !isOrgAdmin) {
      return res.status(403).json({ message: 'Organization Admin access required' });
    }
    
    try {
      const stats = await storage.deleteAllDemoDataForOrganization(organizationId);
      res.json({
        success: true,
        message: `Demo data removed from ${org.name}`,
        stats,
      });
    } catch (err) {
      console.error('Error removing demo data:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to remove demo data' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/dashboard/kpi-metrics', {
    tag: 'Dashboards',
    summary: 'Get KPI metrics for organization',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('KPI metrics data', { type: 'object' }), ...authRes },
  }, async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const userId = getUserIdFromRequest(req);
      if (!userId || !(await userHasOrgAccess(userId, organizationId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const now = new Date();
      const cohortBoundaries = [
        { label: "Week 1", daysAgo: 7 },
        { label: "Week 2", daysAgo: 14 },
        { label: "Week 3", daysAgo: 21 },
        { label: "Week 4", daysAgo: 28 },
        { label: "Month 2", daysAgo: 60 },
        { label: "Month 3", daysAgo: 90 },
        { label: "Month 4+", daysAgo: 9999 },
      ];

      let orgProjectIds = await db.select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, organizationId), sql`${projects.deletedAt} IS NULL`));
      
      const isTeamMember = await isTeamMemberInOrg(userId, organizationId);
      if (isTeamMember) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, organizationId));
        orgProjectIds = orgProjectIds.filter(p => allowedProjectIds.has(p.id));
      }
      
      const projectIds = orgProjectIds.map(p => p.id);

      let allowedTaskIdSet: Set<number> | null = null;
      let allowedIssueIdSet: Set<number> | null = null;
      if (isTeamMember) {
        const [taskIds, issueIds] = await Promise.all([
          getTeamMemberTaskIds(userId, organizationId),
          getTeamMemberIssueIds(userId, organizationId),
        ]);
        allowedTaskIdSet = new Set(taskIds);
        allowedIssueIdSet = new Set(issueIds);
      }

      const orgMemberIds = await db.select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, organizationId));
      const memberUserIds = orgMemberIds.map(m => m.userId);

      const taskConditions = [inArray(tasks.projectId, projectIds), sql`${tasks.deletedAt} IS NULL`];
      if (allowedTaskIdSet && allowedTaskIdSet.size > 0) {
        taskConditions.push(inArray(tasks.id, Array.from(allowedTaskIdSet)));
      } else if (allowedTaskIdSet) {
        taskConditions.push(sql`1=0`);
      }

      const issueConditions = [inArray(issues.projectId, projectIds), eq(issues.itemType, 'issue'), sql`${issues.deletedAt} IS NULL`];
      if (allowedIssueIdSet && allowedIssueIdSet.size > 0) {
        issueConditions.push(inArray(issues.id, Array.from(allowedIssueIdSet)));
      } else if (allowedIssueIdSet) {
        issueConditions.push(sql`1=0`);
      }

      const [
        tasksCreatedRaw,
        tasksCompletedRaw,
        projectsCreatedRaw,
        issuesRaisedRaw,
        issuesResolvedRaw,
        hoursLoggedRaw,
        featureUsageRaw,
        activeUsersRaw,
        projectChangesRaw,
        taskChangesRaw,
      ] = await Promise.all([
        projectIds.length > 0
          ? db.select({
              createdAt: tasks.createdAt,
            }).from(tasks).where(and(...taskConditions))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              createdAt: tasks.updatedAt,
            }).from(tasks).where(and(
              ...taskConditions,
              eq(tasks.status, 'Completed')
            ))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              createdAt: projects.createdAt,
            }).from(projects).where(and(inArray(projects.id, projectIds), sql`${projects.deletedAt} IS NULL`))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              createdAt: issues.createdAt,
            }).from(issues).where(and(...issueConditions))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              resolvedDate: issues.actualResolutionDate,
            }).from(issues).where(and(
              ...issueConditions,
              sql`${issues.actualResolutionDate} IS NOT NULL`
            ))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              hours: timesheetEntries.hours,
              entryDate: timesheetEntries.entryDate,
            }).from(timesheetEntries).where(
              isTeamMember
                ? and(eq(timesheetEntries.organizationId, organizationId), inArray(timesheetEntries.projectId, projectIds), eq(timesheetEntries.userId, userId))
                : and(eq(timesheetEntries.organizationId, organizationId), inArray(timesheetEntries.projectId, projectIds))
            )
          : Promise.resolve([]),

        !isTeamMember
          ? db.select({
              createdAt: featureUsageLogs.createdAt,
              count: featureUsageLogs.usageCount,
            }).from(featureUsageLogs).where(eq(featureUsageLogs.organizationId, organizationId))
          : Promise.resolve([]),

        projectIds.length > 0
          ? (() => {
              const changeConditions = [sql`${taskChangeLogs.changedBy} IS NOT NULL`, inArray(tasks.projectId, projectIds)];
              if (allowedTaskIdSet && allowedTaskIdSet.size > 0) {
                changeConditions.push(inArray(tasks.id, Array.from(allowedTaskIdSet)));
              } else if (allowedTaskIdSet) {
                changeConditions.push(sql`1=0`);
              }
              return db.select({
                changedBy: taskChangeLogs.changedBy,
                changedAt: taskChangeLogs.changedAt,
              }).from(taskChangeLogs)
                .innerJoin(tasks, eq(taskChangeLogs.taskId, tasks.id))
                .where(and(...changeConditions));
            })()
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              changedAt: projectChangeLogs.changedAt,
              changedBy: projectChangeLogs.changedBy,
            }).from(projectChangeLogs).where(inArray(projectChangeLogs.projectId, projectIds))
          : Promise.resolve([]),

        projectIds.length > 0
          ? (() => {
              const taskChangeConditions = [inArray(tasks.projectId, projectIds)];
              if (allowedTaskIdSet && allowedTaskIdSet.size > 0) {
                taskChangeConditions.push(inArray(tasks.id, Array.from(allowedTaskIdSet)));
              } else if (allowedTaskIdSet) {
                taskChangeConditions.push(sql`1=0`);
              }
              return db.select({
                changedAt: taskChangeLogs.changedAt,
                changedBy: taskChangeLogs.changedBy,
              }).from(taskChangeLogs)
                .innerJoin(tasks, eq(taskChangeLogs.taskId, tasks.id))
                .where(and(...taskChangeConditions));
            })()
          : Promise.resolve([]),
      ]);

      const filteredProjectChanges = projectChangesRaw as Array<{ changedAt: Date | null; changedBy: string | null }>;
      const filteredTaskChanges = taskChangesRaw as Array<{ changedAt: Date | null; changedBy: string | null }>;

      function getCohortIndex(date: Date | string | null): number {
        if (!date) return cohortBoundaries.length - 1;
        const d = typeof date === 'string' ? new Date(date) : date;
        const daysAgo = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        for (let i = 0; i < cohortBoundaries.length; i++) {
          if (daysAgo < cohortBoundaries[i].daysAgo) return i;
        }
        return cohortBoundaries.length - 1;
      }

      const cohorts = cohortBoundaries.map(b => ({
        label: b.label,
        tasksCreated: 0,
        tasksCompleted: 0,
        projectsCreated: 0,
        issuesRaised: 0,
        issuesResolved: 0,
        hoursLogged: 0,
        featureUsage: 0,
        activeUsers: 0,
        projectUpdates: 0,
        taskUpdates: 0,
      }));

      for (const t of tasksCreatedRaw) {
        cohorts[getCohortIndex(t.createdAt)].tasksCreated++;
      }
      for (const t of tasksCompletedRaw) {
        cohorts[getCohortIndex(t.createdAt)].tasksCompleted++;
      }
      for (const p of projectsCreatedRaw) {
        cohorts[getCohortIndex(p.createdAt)].projectsCreated++;
      }
      for (const i of issuesRaisedRaw) {
        cohorts[getCohortIndex(i.createdAt)].issuesRaised++;
      }
      for (const i of issuesResolvedRaw) {
        cohorts[getCohortIndex(i.resolvedDate)].issuesResolved++;
      }
      for (const h of hoursLoggedRaw) {
        cohorts[getCohortIndex(h.entryDate)].hoursLogged += Number(h.hours || 0);
      }
      for (const f of featureUsageRaw) {
        cohorts[getCohortIndex(f.createdAt)].featureUsage += f.count || 1;
      }

      const activeUserSets: Set<string>[] = cohortBoundaries.map(() => new Set());
      for (const a of activeUsersRaw) {
        if (a.changedBy) {
          activeUserSets[getCohortIndex(a.changedAt)].add(a.changedBy);
        }
      }
      for (let i = 0; i < cohorts.length; i++) {
        cohorts[i].activeUsers = activeUserSets[i].size;
      }

      for (const pc of filteredProjectChanges) {
        cohorts[getCohortIndex(pc.changedAt)].projectUpdates++;
      }
      for (const tc of filteredTaskChanges) {
        cohorts[getCohortIndex(tc.changedAt)].taskUpdates++;
      }

      const totals = {
        tasksCreated: tasksCreatedRaw.length,
        tasksCompleted: tasksCompletedRaw.length,
        projectsCreated: projectsCreatedRaw.length,
        issuesRaised: issuesRaisedRaw.length,
        issuesResolved: issuesResolvedRaw.length,
        hoursLogged: Math.round(hoursLoggedRaw.reduce((s, h) => s + Number(h.hours || 0), 0) * 10) / 10,
        featureUsage: featureUsageRaw.reduce((s, f) => s + (f.count || 1), 0),
        totalMembers: isTeamMember ? 0 : memberUserIds.length,
        totalActivities: filteredProjectChanges.length + filteredTaskChanges.length,
      };

      res.json({ cohorts: cohorts.reverse(), totals });
    } catch (err) {
      console.error('Error fetching KPI metrics:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch KPI metrics' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/admin/kpi-metrics', {
    tag: 'Dashboards',
    summary: 'Get admin KPI metrics',
    responses: { ...r200('Admin KPI metrics data', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!hasAdminAccess(currentUser)) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const exclusion = await getRequestEmailDomainExclusion(req);

      const now = new Date();
      const cohortBoundaries = [
        { label: "Week 1", daysAgo: 7 },
        { label: "Week 2", daysAgo: 14 },
        { label: "Week 3", daysAgo: 21 },
        { label: "Week 4", daysAgo: 28 },
        { label: "Month 2", daysAgo: 60 },
        { label: "Month 3", daysAgo: 90 },
        { label: "Month 4+", daysAgo: 9999 },
      ];

      const [
        signupsRawAll,
        tasksCreatedRaw,
        tasksCompletedRaw,
        projectsCreatedRaw,
        issuesRaisedRaw,
        issuesResolvedRaw,
        hoursLoggedRaw,
        featureUsageRaw,
        activeUsersRaw,
        projectChangesRaw,
        taskChangesRaw,
      ] = await Promise.all([
        db.select({
          id: users.id,
          createdAt: users.createdAt,
        }).from(users),

        db.select({
          createdAt: tasks.createdAt,
        }).from(tasks).where(sql`${tasks.deletedAt} IS NULL`),

        db.select({
          createdAt: tasks.updatedAt,
        }).from(tasks).where(and(
          sql`${tasks.deletedAt} IS NULL`,
          eq(tasks.status, 'Completed')
        )),

        db.select({
          createdAt: projects.createdAt,
        }).from(projects).where(sql`${projects.deletedAt} IS NULL`),

        db.select({
          createdAt: issues.createdAt,
        }).from(issues).where(and(
          eq(issues.itemType, 'issue'),
          sql`${issues.deletedAt} IS NULL`
        )),

        db.select({
          resolvedDate: issues.actualResolutionDate,
        }).from(issues).where(and(
          eq(issues.itemType, 'issue'),
          sql`${issues.deletedAt} IS NULL`,
          sql`${issues.actualResolutionDate} IS NOT NULL`
        )),

        db.select({
          hours: timesheetEntries.hours,
          entryDate: timesheetEntries.entryDate,
        }).from(timesheetEntries),

        db.select({
          createdAt: featureUsageLogs.createdAt,
          count: featureUsageLogs.usageCount,
        }).from(featureUsageLogs),

        db.select({
          changedBy: taskChangeLogs.changedBy,
          changedAt: taskChangeLogs.changedAt,
        }).from(taskChangeLogs).where(
          sql`${taskChangeLogs.changedBy} IS NOT NULL`
        ),

        db.select({
          changedBy: projectChangeLogs.changedBy,
          changedAt: projectChangeLogs.changedAt,
        }).from(projectChangeLogs),

        db.select({
          changedAt: taskChangeLogs.changedAt,
          changedBy: taskChangeLogs.changedBy,
        }).from(taskChangeLogs),
      ]);

      const signupsRaw = signupsRawAll.filter(u => !exclusion.excludedUserIds.has(u.id));

      function getCohortIndex(date: Date | string | null): number {
        if (!date) return cohortBoundaries.length - 1;
        const d = typeof date === 'string' ? new Date(date) : date;
        const daysAgo = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        for (let i = 0; i < cohortBoundaries.length; i++) {
          if (daysAgo < cohortBoundaries[i].daysAgo) return i;
        }
        return cohortBoundaries.length - 1;
      }

      const cohorts = cohortBoundaries.map(b => ({
        label: b.label,
        newSignups: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
        projectsCreated: 0,
        issuesRaised: 0,
        issuesResolved: 0,
        hoursLogged: 0,
        featureUsage: 0,
        activeUsers: 0,
        projectUpdates: 0,
        taskUpdates: 0,
      }));

      for (const u of signupsRaw) {
        cohorts[getCohortIndex(u.createdAt)].newSignups++;
      }
      for (const t of tasksCreatedRaw) {
        cohorts[getCohortIndex(t.createdAt)].tasksCreated++;
      }
      for (const t of tasksCompletedRaw) {
        cohorts[getCohortIndex(t.createdAt)].tasksCompleted++;
      }
      for (const p of projectsCreatedRaw) {
        cohorts[getCohortIndex(p.createdAt)].projectsCreated++;
      }
      for (const i of issuesRaisedRaw) {
        cohorts[getCohortIndex(i.createdAt)].issuesRaised++;
      }
      for (const i of issuesResolvedRaw) {
        cohorts[getCohortIndex(i.resolvedDate)].issuesResolved++;
      }
      for (const h of hoursLoggedRaw) {
        cohorts[getCohortIndex(h.entryDate)].hoursLogged += Number(h.hours || 0);
      }
      for (const f of featureUsageRaw) {
        cohorts[getCohortIndex(f.createdAt)].featureUsage += f.count || 1;
      }

      const activeUserSets: Set<string>[] = cohortBoundaries.map(() => new Set());
      for (const a of activeUsersRaw) {
        if (a.changedBy && !exclusion.excludedUserIds.has(a.changedBy)) {
          activeUserSets[getCohortIndex(a.changedAt)].add(a.changedBy);
        }
      }
      for (let i = 0; i < cohorts.length; i++) {
        cohorts[i].activeUsers = activeUserSets[i].size;
      }

      for (const pc of projectChangesRaw) {
        if (pc.changedBy && exclusion.excludedUserIds.has(pc.changedBy)) continue;
        cohorts[getCohortIndex(pc.changedAt)].projectUpdates++;
      }
      for (const tc of taskChangesRaw) {
        if (tc.changedBy && exclusion.excludedUserIds.has(tc.changedBy)) continue;
        cohorts[getCohortIndex(tc.changedAt)].taskUpdates++;
      }

      const filteredProjectChanges = projectChangesRaw.filter(pc => !pc.changedBy || !exclusion.excludedUserIds.has(pc.changedBy));
      const filteredTaskChanges = (taskChangesRaw as Array<{ changedAt: Date | null; changedBy: string | null }>).filter(tc => !tc.changedBy || !exclusion.excludedUserIds.has(tc.changedBy));

      const totals = {
        newSignups: signupsRaw.length,
        tasksCreated: tasksCreatedRaw.length,
        tasksCompleted: tasksCompletedRaw.length,
        projectsCreated: projectsCreatedRaw.length,
        issuesRaised: issuesRaisedRaw.length,
        issuesResolved: issuesResolvedRaw.length,
        hoursLogged: Math.round(hoursLoggedRaw.reduce((s, h) => s + Number(h.hours || 0), 0) * 10) / 10,
        featureUsage: featureUsageRaw.reduce((s, f) => s + (f.count || 1), 0),
        totalUsers: signupsRaw.length,
        totalActivities: filteredProjectChanges.length + filteredTaskChanges.length,
      };

      function toDate(d: Date | string | null): Date | null {
        if (!d) return null;
        return typeof d === 'string' ? new Date(d) : d;
      }
      function daysAgo(d: Date | string | null): number {
        const dt = toDate(d);
        if (!dt) return 99999;
        return Math.floor((now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
      }
      function truncateToMonday(d: Date): string {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d);
        mon.setDate(diff);
        return mon.toISOString().split('T')[0];
      }

      const newSignupsThisWeek = signupsRaw.filter(u => daysAgo(u.createdAt) < 7).length;

      const allActivityEntries: { userId: string; date: Date }[] = [];
      for (const a of activeUsersRaw) {
        if (a.changedBy && a.changedAt && !exclusion.excludedUserIds.has(a.changedBy)) {
          allActivityEntries.push({ userId: a.changedBy, date: toDate(a.changedAt)! });
        }
      }
      for (const pc of projectChangesRaw) {
        if (pc.changedBy && pc.changedAt && !exclusion.excludedUserIds.has(pc.changedBy)) {
          allActivityEntries.push({ userId: pc.changedBy, date: toDate(pc.changedAt)! });
        }
      }

      const activeUsers7d = new Set<string>();
      const activeUsers30d = new Set<string>();
      let actions7d = 0;
      for (const entry of allActivityEntries) {
        const da = Math.floor((now.getTime() - entry.date.getTime()) / (1000 * 60 * 60 * 24));
        if (da < 7) {
          activeUsers7d.add(entry.userId);
          actions7d++;
        }
        if (da < 30) {
          activeUsers30d.add(entry.userId);
        }
      }

      const avgActionsPerUser = activeUsers7d.size > 0
        ? Math.round(actions7d / activeUsers7d.size)
        : 0;

      const dauMauRatio = activeUsers30d.size > 0
        ? Math.round((activeUsers7d.size / activeUsers30d.size) * 100)
        : 0;

      const dailyActiveUsersMap = new Map<string, Set<string>>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dailyActiveUsersMap.set(d.toISOString().split('T')[0], new Set());
      }
      for (const entry of allActivityEntries) {
        const key = entry.date.toISOString().split('T')[0];
        if (dailyActiveUsersMap.has(key)) {
          dailyActiveUsersMap.get(key)!.add(entry.userId);
        }
      }
      const dailyActiveUsers = Array.from(dailyActiveUsersMap.entries()).map(([date, userSet]) => ({
        date,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: userSet.size,
      }));

      const lifecycleBoundaries = [
        { label: "Week 2", minDays: 7, maxDays: 14 },
        { label: "Week 4", minDays: 14, maxDays: 28 },
        { label: "Month 3", minDays: 28, maxDays: 90 },
        { label: "Month 5", minDays: 90, maxDays: 150 },
        { label: "Month 7-9", minDays: 150, maxDays: 270 },
        { label: "Year 2+", minDays: 270, maxDays: 99999 },
      ];

      const userActionCounts = new Map<string, number>();
      for (const entry of allActivityEntries) {
        userActionCounts.set(entry.userId, (userActionCounts.get(entry.userId) || 0) + 1);
      }

      const activeUsers7dForRetention = new Set<string>();
      for (const entry of allActivityEntries) {
        const da = Math.floor((now.getTime() - entry.date.getTime()) / (1000 * 60 * 60 * 24));
        if (da < 30) {
          activeUsers7dForRetention.add(entry.userId);
        }
      }

      const retentionByLifecycle = lifecycleBoundaries.map(lb => {
        const usersInCohort = signupsRaw.filter(u => {
          const da = daysAgo(u.createdAt);
          return da >= lb.minDays && da < lb.maxDays;
        });
        const retainedCount = usersInCohort.filter(u =>
          u.id && activeUsers7dForRetention.has(u.id)
        ).length;
        const retentionPct = usersInCohort.length > 0
          ? Math.round((retainedCount / usersInCohort.length) * 100)
          : 0;
        let cohortActions = 0;
        for (const u of usersInCohort) {
          if (u.id) cohortActions += (userActionCounts.get(u.id) || 0);
        }
        return {
          label: lb.label,
          retentionPct,
          avgActions: usersInCohort.length > 0
            ? Math.round(cohortActions / usersInCohort.length)
            : 0,
          cohortSize: usersInCohort.length,
        };
      });

      const overallRetention = signupsRaw.length > 0
        ? Math.round((activeUsers7dForRetention.size / signupsRaw.length) * 100)
        : 0;

      const weeklyRetentionMap = new Map<string, { active: Set<string>; existingUsers: number }>();
      for (let i = 11; i >= 0; i--) {
        const weekDate = new Date(now);
        weekDate.setDate(weekDate.getDate() - i * 7);
        const weekKey = truncateToMonday(weekDate);
        if (!weeklyRetentionMap.has(weekKey)) {
          const usersExistingByWeek = signupsRaw.filter(u => {
            const dt = toDate(u.createdAt);
            return dt && dt <= weekDate;
          }).length;
          weeklyRetentionMap.set(weekKey, { active: new Set(), existingUsers: usersExistingByWeek });
        }
      }
      for (const entry of allActivityEntries) {
        const weekKey = truncateToMonday(entry.date);
        if (weeklyRetentionMap.has(weekKey)) {
          weeklyRetentionMap.get(weekKey)!.active.add(entry.userId);
        }
      }
      const weeklyRetention = Array.from(weeklyRetentionMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          week: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          retentionPct: data.existingUsers > 0 ? Math.round((data.active.size / data.existingUsers) * 100) : 0,
          activeUsers: data.active.size,
        }));

      const prevWeekActiveUsers = new Set<string>();
      for (const entry of allActivityEntries) {
        const da = Math.floor((now.getTime() - entry.date.getTime()) / (1000 * 60 * 60 * 24));
        if (da >= 7 && da < 14) {
          prevWeekActiveUsers.add(entry.userId);
        }
      }
      const retentionWoW = prevWeekActiveUsers.size > 0
        ? Math.round(((activeUsers7d.size - prevWeekActiveUsers.size) / prevWeekActiveUsers.size) * 100)
        : (activeUsers7d.size > 0 ? 100 : 0);

      const featureCaseExpr = `
        CASE
          WHEN path LIKE '/api/projects%' THEN 'Projects'
          WHEN path LIKE '/api/tasks%' THEN 'Tasks'
          WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
          WHEN path LIKE '/api/risks%' THEN 'Risks'
          WHEN path LIKE '/api/issues%' THEN 'Issues'
          WHEN path LIKE '/api/timesheets%' THEN 'Timesheets'
          WHEN path LIKE '/api/resources%' THEN 'Resources'
          WHEN path LIKE '/api/milestones%' THEN 'Milestones'
          WHEN path LIKE '/api/organizations%' THEN 'Organizations'
          WHEN path LIKE '/api/users%' THEN 'Users'
          WHEN path LIKE '/api/notifications%' THEN 'Notifications'
          WHEN path LIKE '/api/custom-dashboards%' THEN 'Custom Dashboards'
          WHEN path LIKE '/api/project-intakes%' THEN 'Project Intakes'
          WHEN path LIKE '/api/chat%' THEN 'AI Chat'
          WHEN path LIKE '/api/dashboard%' THEN 'Dashboards'
          WHEN path LIKE '/api/gantt%' THEN 'Gantt Charts'
          WHEN path LIKE '/api/templates%' THEN 'Templates'
          WHEN path LIKE '/api/documents%' THEN 'Documents'
          ELSE 'Other'
        END`;

      const userOk = exclusion.userNotInSql('user_id');
      const [topFeaturesResult, errorHotspotsResult, frictionTrendResult] = await Promise.all([
        db.execute(sql.raw(`
          SELECT ${featureCaseExpr} as feature,
            COUNT(*) as total_requests,
            COUNT(*) FILTER (WHERE method = 'GET') as reads,
            COUNT(*) FILTER (WHERE method != 'GET') as writes,
            COUNT(DISTINCT user_id) as unique_users,
            ROUND(AVG(duration)::numeric, 0) as avg_duration_ms
          FROM api_request_logs
          WHERE created_at >= NOW() - INTERVAL '30 days'
            AND path NOT LIKE '/api/auth%'
            AND path NOT LIKE '/api/billing%'
            AND ${userOk}
          GROUP BY ${featureCaseExpr}
          ORDER BY total_requests DESC
          LIMIT 15
        `)),

        db.execute(sql.raw(`
          WITH feature_stats AS (
            SELECT ${featureCaseExpr} as feature,
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE status_code >= 400 AND status_code != 401) as errors,
              COUNT(DISTINCT user_id) FILTER (WHERE status_code >= 400 AND status_code != 401) as affected_users,
              mode() WITHIN GROUP (ORDER BY status_code) FILTER (WHERE status_code >= 400 AND status_code != 401) as most_common_status
            FROM api_request_logs
            WHERE created_at >= NOW() - INTERVAL '30 days'
              AND path NOT LIKE '/api/auth%'
              AND ${userOk}
            GROUP BY ${featureCaseExpr}
          )
          SELECT feature, errors as error_count, affected_users,
            ROUND(errors * 100.0 / NULLIF(total, 0), 1) as error_rate,
            most_common_status
          FROM feature_stats
          WHERE errors >= 3
          ORDER BY errors DESC
          LIMIT 10
        `)),

        db.execute(sql.raw(`
          SELECT
            TO_CHAR(DATE_TRUNC('week', created_at), 'Mon DD') as week,
            COUNT(*) FILTER (WHERE status_code >= 400 AND status_code != 401) as errors,
            COUNT(*) as total,
            ROUND(
              COUNT(*) FILTER (WHERE status_code >= 400 AND status_code != 401) * 100.0 / NULLIF(COUNT(*), 0), 1
            ) as error_rate,
            COUNT(DISTINCT user_id) as active_users
          FROM api_request_logs
          WHERE created_at >= NOW() - INTERVAL '90 days'
            AND path NOT LIKE '/api/auth%'
            AND ${userOk}
          GROUP BY DATE_TRUNC('week', created_at)
          ORDER BY DATE_TRUNC('week', created_at) ASC
        `)),
      ]);

      const topFeatures = topFeaturesResult.rows.map((r: Record<string, unknown>) => ({
        feature: String(r.feature || ''),
        totalRequests: Number(r.total_requests || 0),
        reads: Number(r.reads || 0),
        writes: Number(r.writes || 0),
        uniqueUsers: Number(r.unique_users || 0),
        avgDurationMs: Number(r.avg_duration_ms || 0),
      }));

      const errorHotspots = errorHotspotsResult.rows.map((r: Record<string, unknown>) => ({
        feature: String(r.feature || ''),
        errorCount: Number(r.error_count || 0),
        affectedUsers: Number(r.affected_users || 0),
        errorRate: Number(r.error_rate || 0),
        mostCommonStatus: Number(r.most_common_status || 0),
      }));

      const frictionTrend = frictionTrendResult.rows.map((r: Record<string, unknown>) => ({
        week: String(r.week || ''),
        errors: Number(r.errors || 0),
        total: Number(r.total || 0),
        errorRate: Number(r.error_rate || 0),
        activeUsers: Number(r.active_users || 0),
      }));

      const [topActionsResult, orgBreakdownRaw] = await Promise.all([
        db.execute(sql.raw(`
          SELECT ${featureCaseExpr} as action,
            COUNT(*) as count,
            COUNT(DISTINCT user_id) as unique_users
          FROM api_request_logs
          WHERE created_at >= NOW() - INTERVAL '30 days'
            AND method != 'GET'
            AND path NOT LIKE '/api/auth%'
            AND path NOT LIKE '/api/billing%'
            AND ${userOk}
          GROUP BY ${featureCaseExpr}
          ORDER BY count DESC
          LIMIT 10
        `)),
        (() => {
          const omOk = sql.raw(exclusion.userNotInSql('user_id'));
          const tclOk = sql.raw(exclusion.userNotInSql('changed_by'));
          return db.select({
            orgId: organizations.id,
            orgName: organizations.name,
            memberCount: sql<number>`(SELECT COUNT(*) FROM organization_members WHERE organization_id = ${organizations.id} AND ${omOk})`,
            activeCount: sql<number>`(SELECT COUNT(DISTINCT changed_by) FROM task_change_logs tcl
              INNER JOIN tasks t ON tcl.task_id = t.id
              INNER JOIN projects p ON t.project_id = p.id
              WHERE p.organization_id = ${organizations.id}
              AND tcl.changed_at >= NOW() - INTERVAL '7 days'
              AND ${tclOk})`,
          }).from(organizations).limit(20);
        })(),
      ]);

      const topActions = topActionsResult.rows.map((r: Record<string, unknown>) => ({
        action: String(r.action || ''),
        count: Number(r.count || 0),
        uniqueUsers: Number(r.unique_users || 0),
      }));

      const orgBreakdown = orgBreakdownRaw
        .filter(o => !exclusion.excludedOrgIds.has(o.orgId))
        .map(o => ({
          orgId: o.orgId,
          orgName: o.orgName,
          memberCount: Number(o.memberCount || 0),
          activeCount: Number(o.activeCount || 0),
        }));

      res.json({
        cohorts: cohorts.reverse(),
        totals,
        topFeatures,
        errorHotspots,
        frictionTrend,
        excludedEmailDomains: exclusion.domains,
        userActivity: {
          totalUsers: signupsRaw.length,
          activeUsers7d: activeUsers7d.size,
          avgActionsPerUser,
          overallRetention,
          newSignupsThisWeek,
          dauMauRatio,
          retentionWoW,
          dailyActiveUsers,
          retentionByLifecycle,
          weeklyRetention,
          topActions,
          orgBreakdown,
        },
      });
    } catch (err) {
      console.error('Error fetching admin KPI metrics:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch admin KPI metrics' : classified.message });
    }
  });

}
