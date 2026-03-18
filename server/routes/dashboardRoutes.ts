import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { eq, and, desc, asc, sql, isNotNull, inArray } from "drizzle-orm";
import { users, usageEvents, meters, taskResourceAssignments, issueResourceAssignments, issues, resources, tasks, projects, portfolios, milestones, customDashboards, organizationMembers, organizationInvites, plans, subscriptions, billingAuditLogs, billingCycles, usageRollups, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, insertUserConsentSchema, helpTickets, insertHelpTicketSchema, systemProjectViews, timesheetEntries, taskChangeLogs, taskDependencies, notifications, reportSubscriptions, insertReportSubscriptionSchema, trainingModules, trainingLessons, trainingQuizQuestions, timesheetReminderSettings, type Task } from "@shared/schema";
import type { User } from "@shared/models/auth";
import {
  classifyError,
  getUserIdFromRequest,
  sanitizeUser,
  sanitizeUsers,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgIds,
  userHasAnyOrgAccess,
  requireEmailVerified,
  getUserOrgRole,
  isTeamMemberInOrg,
  getUserResourceIds,
  getTeamMemberAccessData,
  getTeamMemberProjectIds,
  getTeamMemberTaskIds,
  getTeamMemberRiskIds,
  getTeamMemberIssueIds,
  getTeamMemberPortfolioIds,
  normalizeSearchStr,
  logUserActivity,
  upload,
  imageUpload,
  openai,
  encryptApiKey,
  decryptApiKey,
  parseMppFile,
  parseXmlMspdi,
  parseCsv,
  parseDate,
  seedDatabase,
  formatZodErrors,
} from "./helpers";

export function registerDashboardRoutes(app: Express) {
  // ==================== DASHBOARD AGGREGATION ENDPOINTS ====================

  // Get all risks for an organization (dashboard)
  app.get('/api/risks', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      const projects = await storage.getProjects(organizationId);
      const allRisks = [];
      for (const project of projects) {
        const risks = await storage.getRisks(project.id);
        allRisks.push(...risks);
      }
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
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
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
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      // Return empty utilization data - can be extended with timesheet aggregation
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
    
    const { industryTemplates } = await import('./demo-data-templates');
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
      const { industryTemplates } = await import('./demo-data-templates');
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
      ]
    }
  ]
}

Create 2 portfolios with 2-3 projects each. Make project names, tasks, risks, milestones, and issues realistic for the ${customIndustry} industry. Include realistic budget amounts and varied project statuses.`;

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

}
