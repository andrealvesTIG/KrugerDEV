import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { users, taskResourceAssignments, issues, resources, tasks, projects, portfolios, portfolioKeyDates, organizationMembers, featureUsageLogs, timesheetEntries, projectChangeLogs, taskChangeLogs, issueChangeLogs, type Task } from "@shared/schema";
import type { User } from "@shared/models/auth";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  openai,
} from "./helpers";

export function registerDashboardRoutes(app: Express) {
  // ==================== DASHBOARD AGGREGATION ENDPOINTS ====================

  app.get('/api/dashboard/summary', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const userId = getUserIdFromRequest(req);
      if (!userId || !(await userHasOrgAccess(userId, organizationId))) {
        return res.status(403).json({ message: "Access denied" });
      }

      const orgProjects = await db.select({
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

      const projectIds = orgProjects.map(p => p.id);

      let taskStats = { total: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0 };
      let tasksByAssignee: { assignee: string | null; status: string | null; count: number }[] = [];
      let riskStats = { total: 0, open: 0, mitigated: 0, closed: 0, highPriority: 0, criticalImpact: 0 };
      let issueStats = { total: 0, open: 0, inProgress: 0, resolved: 0, highPriority: 0 };
      let risksByPriority: { priority: string | null; count: number }[] = [];
      let issuesByPriority: { priority: string | null; count: number }[] = [];

      if (projectIds.length > 0) {
        const today = new Date().toISOString().split('T')[0];

        const taskCountRows = await db.select({
          status: tasks.status,
          cnt: sql<number>`count(*)::int`,
        }).from(tasks).where(
          and(inArray(tasks.projectId, projectIds), sql`${tasks.deletedAt} IS NULL`)
        ).groupBy(tasks.status);

        for (const row of taskCountRows) {
          taskStats.total += row.cnt;
          if (row.status === 'Completed') taskStats.completed += row.cnt;
          else if (row.status === 'In Progress') taskStats.inProgress += row.cnt;
          else if (row.status === 'Not Started') taskStats.notStarted += row.cnt;
        }

        const [overdueRow] = await db.select({
          cnt: sql<number>`count(*)::int`,
        }).from(tasks).where(
          and(
            inArray(tasks.projectId, projectIds),
            sql`${tasks.deletedAt} IS NULL`,
            sql`${tasks.status} != 'Completed'`,
            sql`${tasks.endDate} IS NOT NULL`,
            sql`${tasks.endDate}::date < ${today}::date`
          )
        );
        taskStats.overdue = overdueRow?.cnt || 0;

        tasksByAssignee = await db.select({
          assignee: tasks.assignee,
          status: tasks.status,
          count: sql<number>`count(*)::int`,
        }).from(tasks).where(
          and(
            inArray(tasks.projectId, projectIds),
            sql`${tasks.deletedAt} IS NULL`,
            sql`${tasks.assignee} IS NOT NULL`,
            sql`${tasks.assignee} != ''`
          )
        ).groupBy(tasks.assignee, tasks.status);

        const riskRows = await db.select({
          status: issues.status,
          priority: issues.priority,
          impact: issues.impact,
          cnt: sql<number>`count(*)::int`,
        }).from(issues).where(
          and(
            inArray(issues.projectId, projectIds),
            eq(issues.itemType, 'risk'),
            sql`${issues.deletedAt} IS NULL`
          )
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
          and(
            inArray(issues.projectId, projectIds),
            eq(issues.itemType, 'risk'),
            sql`${issues.deletedAt} IS NULL`
          )
        ).groupBy(issues.priority);

        const issueRows = await db.select({
          status: issues.status,
          priority: issues.priority,
          cnt: sql<number>`count(*)::int`,
        }).from(issues).where(
          and(
            inArray(issues.projectId, projectIds),
            eq(issues.itemType, 'issue'),
            sql`${issues.deletedAt} IS NULL`
          )
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
          and(
            inArray(issues.projectId, projectIds),
            eq(issues.itemType, 'issue'),
            sql`${issues.deletedAt} IS NULL`
          )
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

  app.get('/api/risks', async (req, res) => {
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
      const projectIds = orgProjects.map(p => p.id);
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

  // Get all resource assignments (dashboard)
  app.get('/api/resource-assignments', async (req, res) => {
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
      const allAssignments = await storage.getAllTaskResourceAssignments(organizationId);
      res.json(allAssignments);
    } catch (err) {
      console.error("Error fetching resource assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource assignments" : classified.message });
    }
  });

  // Get dashboard utilization data
  app.get('/api/dashboard/utilization', async (req, res) => {
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

  // Onboarding endpoints
  app.get('/api/onboarding/status', async (req, res) => {
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

  app.post('/api/onboarding/complete', async (req, res) => {
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

  app.post('/api/onboarding/skip', async (req, res) => {
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

  app.post('/api/onboarding/generate-sample-data', async (req, res) => {
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

  // Demo Data Generation (Org Admin or Super Admin)
  app.get('/api/demo-data/industries', async (req, res) => {
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

  app.post('/api/demo-data/generate', async (req, res) => {
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
          
          const project = await storage.createProject({
            organizationId,
            portfolioId: portfolio.id,
            name: projectTemplate.name,
            description: projectTemplate.description,
            status: projectTemplate.status,
            priority: projectTemplate.priority,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            budget: sanitizeBudget(projectTemplate.budget),
            health: projectTemplate.health,
            completionPercentage: projectTemplate.completionPercentage,
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
      
      for (const resourceTemplate of resourceTemplates) {
        const resource = await storage.createResource({
          organizationId,
          displayName: resourceTemplate.name,
          email: resourceTemplate.email,
          title: resourceTemplate.title,
          department: resourceTemplate.department,
          skills: resourceTemplate.skills,
          hourlyRate: String(Math.floor(Math.random() * 100) + 80),
          isActive: true,
          isDemo: true,
        });
        createdResourceIds.push(resource.id);
        stats.resources++;
      }
      
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
              });
              stats.timesheets++;
            }
          }
        }
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

  app.delete('/api/demo-data/:organizationId', async (req, res) => {
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

  app.get('/api/dashboard/kpi-metrics', async (req, res) => {
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

      const orgProjectIds = await db.select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, organizationId), sql`${projects.deletedAt} IS NULL`));
      const projectIds = orgProjectIds.map(p => p.id);

      const orgMemberIds = await db.select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, organizationId));
      const memberUserIds = orgMemberIds.map(m => m.userId);

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
            }).from(tasks).where(and(inArray(tasks.projectId, projectIds), sql`${tasks.deletedAt} IS NULL`))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              createdAt: tasks.updatedAt,
            }).from(tasks).where(and(
              inArray(tasks.projectId, projectIds),
              sql`${tasks.deletedAt} IS NULL`,
              eq(tasks.status, 'Completed')
            ))
          : Promise.resolve([]),

        db.select({
          createdAt: projects.createdAt,
        }).from(projects).where(and(eq(projects.organizationId, organizationId), sql`${projects.deletedAt} IS NULL`)),

        projectIds.length > 0
          ? db.select({
              createdAt: issues.createdAt,
            }).from(issues).where(and(
              inArray(issues.projectId, projectIds),
              eq(issues.itemType, 'issue'),
              sql`${issues.deletedAt} IS NULL`
            ))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              resolvedDate: issues.actualResolutionDate,
            }).from(issues).where(and(
              inArray(issues.projectId, projectIds),
              eq(issues.itemType, 'issue'),
              sql`${issues.deletedAt} IS NULL`,
              sql`${issues.actualResolutionDate} IS NOT NULL`
            ))
          : Promise.resolve([]),

        db.select({
          hours: timesheetEntries.hours,
          entryDate: timesheetEntries.entryDate,
        }).from(timesheetEntries).where(eq(timesheetEntries.organizationId, organizationId)),

        db.select({
          createdAt: featureUsageLogs.createdAt,
          count: featureUsageLogs.usageCount,
        }).from(featureUsageLogs).where(eq(featureUsageLogs.organizationId, organizationId)),

        projectIds.length > 0
          ? db.select({
              changedBy: taskChangeLogs.changedBy,
              changedAt: taskChangeLogs.changedAt,
            }).from(taskChangeLogs)
              .innerJoin(tasks, eq(taskChangeLogs.taskId, tasks.id))
              .where(and(
                sql`${taskChangeLogs.changedBy} IS NOT NULL`,
                inArray(tasks.projectId, projectIds)
              ))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              changedAt: projectChangeLogs.changedAt,
            }).from(projectChangeLogs).where(inArray(projectChangeLogs.projectId, projectIds))
          : Promise.resolve([]),

        projectIds.length > 0
          ? db.select({
              changedAt: taskChangeLogs.changedAt,
            }).from(taskChangeLogs)
              .innerJoin(tasks, eq(taskChangeLogs.taskId, tasks.id))
              .where(inArray(tasks.projectId, projectIds))
          : Promise.resolve([]),
      ]);

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

      for (const pc of projectChangesRaw) {
        cohorts[getCohortIndex(pc.changedAt)].projectUpdates++;
      }
      for (const tc of taskChangesRaw) {
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
        totalMembers: memberUserIds.length,
        totalActivities: (projectChangesRaw as any[]).length + (taskChangesRaw as any[]).length,
      };

      res.json({ cohorts: cohorts.reverse(), totals });
    } catch (err) {
      console.error('Error fetching KPI metrics:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch KPI metrics' : classified.message });
    }
  });

}
