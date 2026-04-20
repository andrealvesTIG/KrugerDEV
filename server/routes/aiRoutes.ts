import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { issues, resources, tasks, projects, plans, type Task } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  getUserOrgIds,
  requireEmailVerified,
  openai,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";

export function registerAiRoutes(app: Express) {
  // =========== AI PROJECT GENERATION ===========
  
  // Generate a project with tasks, issues, and risks using AI
  apiRoute(app, 'post', '/api/ai/generate-project', {
    tag: 'AI',
    summary: 'Generate project structure from description',
    requestBody: body({ type: 'object', properties: { description: { type: 'string' }, organizationId: { type: 'integer' } } }),
    responses: { ...r201('Project generated', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require authentication
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { prompt, organizationId, portfolioId } = req.body;
      
      // Check AI runs limit before making the API call (using org subscription)
      const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, organizationId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }
      
      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }
      
      // Check user has access to the specified organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      const systemPrompt = `You are a project management expert. Based on the user's project description, generate a comprehensive project plan in JSON format.

The response must be valid JSON with this exact structure:
{
  "project": {
    "name": "Project name (max 100 chars)",
    "description": "Detailed project description",
    "status": "Initiation",
    "priority": "Medium",
    "health": "Green",
    "budget": 0
  },
  "tasks": [
    {
      "name": "Task name",
      "description": "Task description",
      "durationDays": 5,
      "status": "Not Started"
    }
  ],
  "issues": [
    {
      "title": "Issue title",
      "description": "Issue description",
      "priority": "Medium",
      "status": "Open",
      "type": "Task"
    }
  ],
  "risks": [
    {
      "title": "Risk title",
      "description": "Risk description",
      "probability": "Medium",
      "impact": "Medium",
      "status": "Open",
      "mitigationPlan": "How to mitigate this risk"
    }
  ]
}

Guidelines:
- Generate 5-10 logical tasks that form a project timeline
- Generate 2-5 potential issues or action items
- Generate 2-4 project risks with mitigation plans
- Use realistic estimates based on the project scope
- Priority can be: Low, Medium, High, Critical
- Task status: Not Started, In Progress, Completed
- Issue type: Bug, Enhancement, Task, Question
- Risk probability/impact: Low, Medium, High

Return ONLY valid JSON, no markdown or explanations.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a project plan for: ${prompt}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });
      
      // Track AI usage and deduct credits after successful API call
      const { recordCreditUsage, RESOURCE_TYPES } = await import("../services/billing");
      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_project_${Date.now()}`);
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI did not return a response" });
      }
      
      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content);
        const classified = classifyError(parseError);
        return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to parse AI response" : classified.message });
      }
      
      // Calculate dates for tasks
      const today = new Date();
      let currentDate = new Date(today);
      
      // Create project
      const projectData = {
        organizationId,
        portfolioId: portfolioId || null,
        name: aiResult.project.name,
        description: aiResult.project.description,
        status: aiResult.project.status || "Initiation",
        priority: aiResult.project.priority || "Medium",
        health: aiResult.project.health || "Green",
        budget: String(aiResult.project.budget || 0),
        startDate: today.toISOString().split('T')[0],
        source: "ai_generated",
      };
      
      const project = await storage.createProject(projectData);
      
      const aiUser = userId ? await storage.getUser(userId) : null;
      const aiCreatorName = aiUser ? `${aiUser.firstName || ''} ${aiUser.lastName || ''}`.trim() || aiUser.email || 'Unknown' : 'System';
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: aiCreatorName,
        changeType: 'created',
        changeSummary: `Project "${project.name}" created by ${aiCreatorName} — generated with AI`,
        previousValues: null,
        newValues: null,
      });
      
      // Create tasks with sequential dates
      const createdTasks = [];
      for (const taskData of aiResult.tasks || []) {
        const startDate = new Date(currentDate);
        const durationDays = taskData.durationDays || 5;
        const endDate = new Date(currentDate);
        endDate.setDate(endDate.getDate() + durationDays);
        
        const task = await storage.createTask({
          projectId: project.id,
          name: taskData.name,
          description: taskData.description,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          durationDays,
          status: taskData.status || "Not Started",
          progress: 0,
        });
        createdTasks.push(task);
        
        // Move current date forward for next task
        currentDate = new Date(endDate);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Update project end date based on last task
      if (createdTasks.length > 0) {
        const lastTask = createdTasks[createdTasks.length - 1];
        await storage.updateProject(project.id, {
          endDate: lastTask.endDate,
        });
      }
      
      // Create issues
      const createdIssues = [];
      for (const issueData of aiResult.issues || []) {
        const issue = await storage.createIssue({
          projectId: project.id,
          title: issueData.title,
          description: issueData.description,
          priority: issueData.priority || "Medium",
          status: issueData.status || "Open",
          type: issueData.type || "Task",
          costExposure: issueData.costExposure || null,
        });
        createdIssues.push(issue);
      }
      
      // Create risks
      const createdRisks = [];
      for (const riskData of aiResult.risks || []) {
        const risk = await storage.createRisk({
          projectId: project.id,
          title: riskData.title,
          description: riskData.description,
          probability: riskData.probability || "Medium",
          impact: riskData.impact || "Medium",
          status: riskData.status || "Open",
          mitigationPlan: riskData.mitigationPlan,
          costExposure: riskData.costExposure || null,
        });
        createdRisks.push(risk);
      }
      
      res.status(201).json({
        success: true,
        project,
        tasks: createdTasks,
        issues: createdIssues,
        risks: createdRisks,
        summary: {
          tasksCreated: createdTasks.length,
          issuesCreated: createdIssues.length,
          risksCreated: createdRisks.length,
        }
      });
    } catch (err) {
      console.error("Error generating AI project:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate project with AI" : classified.message });
    }
  });

  // Smart AI Create - can create projects, tasks, risks, issues, milestones, or resources
  apiRoute(app, 'post', '/api/ai/smart-create', {
    tag: 'AI',
    summary: 'Smart create with AI',
    requestBody: body({ type: 'object', properties: { prompt: { type: 'string' }, organizationId: { type: 'integer' } } }),
    responses: { ...r200('Smart create result', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { prompt, organizationId, projectId, portfolioId } = req.body;
      
      // Check AI runs limit (using org subscription)
      const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, organizationId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }
      
      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const systemPrompt = `You are an AI assistant for a project portfolio management system. Based on the user's request, determine what they want to create and generate the appropriate data.

Analyze the request and decide which type(s) of items to create:
- "project" - For creating new projects with tasks, risks, and issues
- "task" - For creating one or more tasks (requires projectId context)
- "risk" - For creating one or more project risks (requires projectId context)
- "issue" - For creating one or more project issues (requires projectId context)
- "milestone" - For creating one or more milestones (requires projectId context)
- "resource" - For creating team members/resources

Return a JSON response with this structure:
{
  "intent": "project" | "task" | "risk" | "issue" | "milestone" | "resource" | "multiple",
  "requiresProject": boolean,
  "assignToMe": boolean,
  "items": {
    "project": { ... } | null,
    "tasks": [...] | [],
    "risks": [...] | [],
    "issues": [...] | [],
    "milestones": [...] | [],
    "resources": [...] | []
  }
}

For a PROJECT:
{
  "name": "Project name",
  "description": "Description",
  "status": "Initiation",
  "priority": "Medium",
  "health": "Green",
  "budget": 0
}

For TASKS (array):
{
  "name": "Task name",
  "description": "Description",
  "durationDays": 5,
  "status": "Not Started",
  "priority": "Medium"
}

For RISKS (array):
{
  "title": "Risk title",
  "description": "Description",
  "probability": "Medium",
  "impact": "Medium",
  "status": "Open",
  "mitigationPlan": "How to mitigate",
  "costExposure": "50000"
}

For ISSUES (array):
{
  "title": "Issue title",
  "description": "Description",
  "priority": "Medium",
  "status": "Open",
  "type": "Task",
  "costExposure": "25000"
}

For MILESTONES (array):
{
  "name": "Milestone name",
  "description": "Description",
  "daysFromStart": 30
}

For RESOURCES (array):
{
  "displayName": "Full Name",
  "email": "email@example.com",
  "title": "Job Title",
  "department": "Department",
  "skills": "Skill1, Skill2"
}

Guidelines:
- If user mentions "project", "initiative", "program" → create a project with related tasks/risks
- If user mentions "task", "todo", "work item", "action item" → create tasks. If no projectId is provided in the context, you MUST also create one or more projects to hold the tasks. Distribute tasks across the projects logically.
- If user mentions "risk", "concern", "threat" → create risks. If no projectId is provided, also create a project.
- If user mentions "issue", "problem", "bug", "blocker" → create issues. If no projectId is provided, also create a project.
- If user mentions "milestone", "deadline", "deliverable", "phase" → create milestones. If no projectId is provided, also create a project.
- If user mentions "resource", "team member", "person", "staff" → create resources only
- If the user asks to create items across "a few projects" or "multiple projects", create multiple projects each with their own tasks/items. In this case, return a "projects" array instead of a single "project" object in items.
- If the user says "assign me", "assign to me", "for me", or similar, set "assignToMe": true
- Be specific and realistic based on the domain context
- Generate 3-8 items when creating multiple of the same type
- When distributing tasks across multiple projects, assign each task a "projectIndex" (0-based) matching the project in the "projects" array.

For MULTIPLE PROJECTS, use this items structure:
{
  "projects": [{ "name": "...", "description": "...", ... }, { "name": "...", ... }],
  "tasks": [{ "name": "...", "projectIndex": 0, ... }, { "name": "...", "projectIndex": 1, ... }]
}

Return ONLY valid JSON.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Request: ${prompt}\n\nContext: organizationId=${organizationId}${projectId ? `, projectId=${projectId}` : ''}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });
      
      const { recordCreditUsage, RESOURCE_TYPES } = await import("../services/billing");
      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_smart_create_${Date.now()}`);
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI did not return a response" });
      }
      
      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content);
        const classified = classifyError(parseError);
        return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to parse AI response" : classified.message });
      }
      
      // Validate that there's something to create
      const hasItems = aiResult.items?.project || 
        (aiResult.items?.projects?.length > 0) ||
        (aiResult.items?.tasks?.length > 0) || 
        (aiResult.items?.risks?.length > 0) || 
        (aiResult.items?.issues?.length > 0) || 
        (aiResult.items?.milestones?.length > 0) || 
        (aiResult.items?.resources?.length > 0);
      
      if (!hasItems) {
        return res.status(400).json({ 
          message: "Could not understand what to create. Please be more specific in your request.",
          intent: aiResult.intent
        });
      }
      
      // Check if project context is required but missing
      const needsProjectContext = (aiResult.items?.tasks?.length > 0) || 
        (aiResult.items?.risks?.length > 0) || 
        (aiResult.items?.issues?.length > 0) || 
        (aiResult.items?.milestones?.length > 0);
      
      const hasProjectContext = projectId || aiResult.items?.project || (aiResult.items?.projects?.length > 0);
      
      if (needsProjectContext && !hasProjectContext) {
        return res.status(400).json({ 
          message: "Creating tasks, risks, issues, or milestones requires a project. Please specify a project or ask to create a new project.",
          requiresProject: true,
          intent: aiResult.intent
        });
      }
      
      const results: any = {
        intent: aiResult.intent,
        created: {},
        summary: []
      };
      
      const today = new Date();
      let currentProjectId = projectId ? Number(projectId) : null;
      
      // Handle multiple projects (projects array)
      const projectIndexToId: Record<number, number> = {};
      if (aiResult.items?.projects?.length > 0) {
        const createdProjects = [];
        for (let i = 0; i < aiResult.items.projects.length; i++) {
          const proj = aiResult.items.projects[i];
          const projectData = {
            organizationId: Number(organizationId),
            portfolioId: portfolioId ? Number(portfolioId) : null,
            name: proj.name,
            description: proj.description,
            status: proj.status || "Initiation",
            priority: proj.priority || "Medium",
            health: proj.health || "Green",
            budget: String(proj.budget || 0),
            startDate: today.toISOString().split('T')[0],
            source: "ai_generated",
          };
          const project = await storage.createProject(projectData);
          const projUser = userId ? await storage.getUser(userId) : null;
          const projCreatorName = projUser ? `${projUser.firstName || ''} ${projUser.lastName || ''}`.trim() || projUser.email || 'Unknown' : 'System';
          await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: projCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${projCreatorName} — generated with AI`, previousValues: null, newValues: null });
          projectIndexToId[i] = project.id;
          createdProjects.push(project);
          if (i === 0) currentProjectId = project.id;
        }
        results.created.projects = createdProjects;
        results.summary.push(`Created ${createdProjects.length} project(s)`);
      }
      // Handle single project
      else if (aiResult.items?.project) {
        const projectData = {
          organizationId: Number(organizationId),
          portfolioId: portfolioId ? Number(portfolioId) : null,
          name: aiResult.items.project.name,
          description: aiResult.items.project.description,
          status: aiResult.items.project.status || "Initiation",
          priority: aiResult.items.project.priority || "Medium",
          health: aiResult.items.project.health || "Green",
          budget: String(aiResult.items.project.budget || 0),
          startDate: today.toISOString().split('T')[0],
          source: "ai_generated",
        };
        
        const project = await storage.createProject(projectData);
        const projUser = userId ? await storage.getUser(userId) : null;
        const projCreatorName = projUser ? `${projUser.firstName || ''} ${projUser.lastName || ''}`.trim() || projUser.email || 'Unknown' : 'System';
        await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: projCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${projCreatorName} — generated with AI`, previousValues: null, newValues: null });
        currentProjectId = project.id;
        projectIndexToId[0] = project.id;
        results.created.project = project;
        results.summary.push(`Created project "${project.name}"`);
      }
      
      // Create tasks
      if (aiResult.items?.tasks?.length > 0) {
        const tasksByProject: Record<number, any[]> = {};
        for (const taskData of aiResult.items.tasks) {
          const targetProjectId = (taskData.projectIndex !== undefined && projectIndexToId[taskData.projectIndex])
            ? projectIndexToId[taskData.projectIndex]
            : currentProjectId;
          if (!targetProjectId) continue;
          if (!tasksByProject[targetProjectId]) tasksByProject[targetProjectId] = [];
          tasksByProject[targetProjectId].push(taskData);
        }

        const createdTasks = [];
        for (const [projId, tasks] of Object.entries(tasksByProject)) {
          let currentDate = new Date(today);
          for (const taskData of tasks) {
            const startDate = new Date(currentDate);
            const durationDays = taskData.durationDays || 5;
            const endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + durationDays);
            
            const task = await storage.createTask({
              projectId: Number(projId),
              name: taskData.name,
              description: taskData.description,
              startDate: startDate.toISOString().split('T')[0],
              endDate: endDate.toISOString().split('T')[0],
              durationDays,
              status: taskData.status || "Not Started",
              priority: taskData.priority || "Medium",
              progress: 0,
            });
            createdTasks.push(task);
            currentDate.setDate(currentDate.getDate() + durationDays);
          }
        }
        results.created.tasks = createdTasks;
        results.summary.push(`Created ${createdTasks.length} task(s)`);
      }
      
      // Assign tasks to the current user if requested
      if (aiResult.assignToMe && results.created.tasks?.length > 0) {
        try {
          const userResource = await db.select().from(resources)
            .where(and(
              eq(resources.userId, userId),
              eq(resources.organizationId, Number(organizationId)),
              eq(resources.isActive, true)
            ))
            .limit(1);
          
          if (userResource.length > 0) {
            const resourceId = userResource[0].id;
            for (const task of results.created.tasks) {
              await storage.addTaskResourceAssignment({
                taskId: task.id,
                resourceId: resourceId,
                allocationPercentage: 100,
                role: "Assignee",
              });
            }
            results.summary.push(`Assigned all tasks to you`);
          }
        } catch (assignErr) {
          console.error("Error assigning tasks to user:", assignErr);
        }
      }
      
      // Create risks
      if (aiResult.items?.risks?.length > 0 && currentProjectId) {
        const createdRisks = [];
        for (const riskData of aiResult.items.risks) {
          const targetProjectId = (riskData.projectIndex !== undefined && projectIndexToId[riskData.projectIndex])
            ? projectIndexToId[riskData.projectIndex]
            : currentProjectId;
          const risk = await storage.createRisk({
            projectId: targetProjectId,
            title: riskData.title,
            description: riskData.description,
            probability: riskData.probability || "Medium",
            impact: riskData.impact || "Medium",
            status: riskData.status || "Open",
            mitigationPlan: riskData.mitigationPlan,
            costExposure: riskData.costExposure || null,
          });
          createdRisks.push(risk);
        }
        results.created.risks = createdRisks;
        results.summary.push(`Created ${createdRisks.length} risk(s)`);
      }
      
      // Create issues
      if (aiResult.items?.issues?.length > 0 && currentProjectId) {
        const createdIssues = [];
        for (const issueData of aiResult.items.issues) {
          const targetProjectId = (issueData.projectIndex !== undefined && projectIndexToId[issueData.projectIndex])
            ? projectIndexToId[issueData.projectIndex]
            : currentProjectId;
          const issue = await storage.createIssue({
            projectId: targetProjectId,
            title: issueData.title,
            description: issueData.description,
            priority: issueData.priority || "Medium",
            status: issueData.status || "Open",
            type: issueData.type || "Task",
            costExposure: issueData.costExposure || null,
          });
          createdIssues.push(issue);
        }
        results.created.issues = createdIssues;
        results.summary.push(`Created ${createdIssues.length} issue(s)`);
      }
      
      // Create milestones
      if (aiResult.items?.milestones?.length > 0 && currentProjectId) {
        const createdMilestones = [];
        for (const milestoneData of aiResult.items.milestones) {
          const milestoneDate = new Date(today);
          milestoneDate.setDate(milestoneDate.getDate() + (milestoneData.daysFromStart || 30));
          
          const milestoneTitle = milestoneData.title || milestoneData.name || "Milestone";
          const targetProjectId = (milestoneData.projectIndex !== undefined && projectIndexToId[milestoneData.projectIndex])
            ? projectIndexToId[milestoneData.projectIndex]
            : currentProjectId;
          
          const milestone = await storage.createMilestone({
            projectId: targetProjectId,
            title: milestoneTitle,
            description: milestoneData.description,
            dueDate: milestoneDate.toISOString().split('T')[0],
            status: "Not Started",
          });
          createdMilestones.push(milestone);
        }
        results.created.milestones = createdMilestones;
        results.summary.push(`Created ${createdMilestones.length} milestone(s)`);
      }
      
      // Create resources
      if (aiResult.items?.resources?.length > 0) {
        const createdResources = [];
        for (const resourceData of aiResult.items.resources) {
          const resource = await storage.createResource({
            organizationId: Number(organizationId),
            displayName: resourceData.displayName,
            email: resourceData.email,
            title: resourceData.title,
            department: resourceData.department,
            skills: resourceData.skills,
          });
          createdResources.push(resource);
        }
        results.created.resources = createdResources;
        results.summary.push(`Created ${createdResources.length} resource(s)`);
      }
      
      // Determine redirect path
      if (results.created.projects?.length > 0) {
        results.redirectTo = `/projects`;
      } else if (results.created.project) {
        results.redirectTo = `/projects/${results.created.project.id}`;
      } else if (currentProjectId) {
        results.redirectTo = `/projects/${currentProjectId}`;
      }
      
      res.json({
        success: true,
        ...results,
        message: results.summary.join(", ")
      });
    } catch (err) {
      console.error("Error with AI smart create:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create with AI" : classified.message });
    }
  });

  // ==================== AI VOICE INPUT USAGE METERING ====================
  apiRoute(app, 'post', '/api/ai/voice-usage', {
    tag: 'AI',
    summary: 'Log AI voice usage',
    requestBody: body({ type: 'object', properties: { durationSeconds: { type: 'number' } } }),
    responses: { ...r200('Usage logged', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { organizationId } = req.body;
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, Number(organizationId));
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI usage limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      await recordResourceUsage(userId, METER_CODES.AI_RUNS, `voice_input_${organizationId}_${Date.now()}`, 1, Number(organizationId));

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error recording voice usage:", error);
      const classified = classifyError(error);
      return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to record voice usage" : classified.message });
    }
  });

  // ==================== AI SMART-CREATE PREVIEW (Parse Only) ====================
  apiRoute(app, 'post', '/api/ai/smart-create/preview', {
    tag: 'AI',
    summary: 'Preview AI smart create result',
    requestBody: body({ type: 'object', properties: { prompt: { type: 'string' }, organizationId: { type: 'integer' } } }),
    responses: { ...r200('Preview data', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { prompt, organizationId, projectId } = req.body;

      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, Number(organizationId));
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      const existingProjects = await storage.getProjects(Number(organizationId));
      const activeProjects = existingProjects.filter((p: any) => !p.deletedAt);
      const projectListForAI = activeProjects
        .map((p: any) => ({ id: p.id, name: p.name }));

      let detailProjectId: number | null = projectId ? Number(projectId) : null;
      if (!detailProjectId) {
        const promptLower = prompt.toLowerCase().trim();
        const nameMatch = activeProjects.find((p: any) => {
          const pName = p.name.toLowerCase().trim();
          return promptLower.includes(pName) || pName.includes(promptLower.replace(/^.*?(on|for|in|to)\s+/i, '').trim());
        });
        if (nameMatch) {
          detailProjectId = nameMatch.id;
        }
      }

      let targetProjectDetails = '';
      if (detailProjectId) {
        const proj = activeProjects.find((p: any) => p.id === detailProjectId);
        if (proj) {
          const [projTasks, projRisks, projIssues, projMilestones] = await Promise.all([
            storage.getTasks(detailProjectId),
            storage.getRisks(detailProjectId),
            storage.getIssues(detailProjectId),
            storage.getMilestones(detailProjectId),
          ]);
          const activeTasks = projTasks.filter((t: any) => !t.deletedAt);
          const activeRisks = projRisks.filter((r: any) => !r.deletedAt);
          const activeIssues = projIssues.filter((i: any) => !i.deletedAt);
          targetProjectDetails = `\n\nTarget project details:
- Name: "${proj.name}"
- Description: ${proj.description || 'N/A'}
- Status: ${proj.status || 'N/A'}
- Priority: ${proj.priority || 'N/A'}
- Health: ${proj.health || 'N/A'}
- Budget: ${proj.budget || 'N/A'}
- Start Date: ${proj.startDate || 'N/A'}
- End Date: ${proj.endDate || 'N/A'}
- Existing tasks (${activeTasks.length}): ${activeTasks.slice(0, 20).map((t: any) => `"${t.name}" [${t.status}]`).join(', ') || 'None'}
- Existing risks (${activeRisks.length}): ${activeRisks.slice(0, 10).map((r: any) => `"${r.title}" [${r.status}, ${r.probability} prob., ${r.impact} impact]`).join(', ') || 'None'}
- Existing issues (${activeIssues.length}): ${activeIssues.slice(0, 10).map((i: any) => `"${i.title}" [${i.status}, ${i.priority}]`).join(', ') || 'None'}
- Existing milestones (${projMilestones.length}): ${projMilestones.slice(0, 10).map((m: any) => `"${m.title}" [${m.status}, due: ${m.dueDate || 'N/A'}]`).join(', ') || 'None'}`;
        }
      }

      const systemPrompt = `You are a project management AI. Parse the user's request and return JSON describing items to create.

Item types: project, task, risk, issue, milestone, resource.

JSON structure:
{"intent":"project|task|risk|issue|milestone|resource|multiple","requiresProject":boolean,"existingProjectId":number|null,"assignToMe":boolean,"items":{"project":null|{...},"tasks":[],"risks":[],"issues":[],"milestones":[],"resources":[]}}

Schemas:
- project: {"name","description","status":"Initiation","priority":"Medium","health":"Green","budget":0}
- task: {"name","description","durationDays":5,"status":"Not Started","priority":"Medium"}
- risk: {"title","description","probability":"Medium","impact":"Medium","status":"Open","mitigationPlan","costExposure":"50000"}
- issue: {"title","description","priority":"Medium","status":"Open","type":"Task","costExposure":"25000"}
- milestone: {"name","description","daysFromStart":30}
- resource: {"displayName","email","title","department","skills"}
- Multiple projects: {"projects":[...],"tasks":[{"projectIndex":0,...},...]}

Rules:
1. If user references an existing project by name, set "existingProjectId" to its ID. Do NOT create a new project.
2. Only create a new project if explicitly requested or no existing project matches.
3. Generate 3-8 items per type. Don't duplicate existing items.
4. Tailor items to the project's actual context, domain, phase, and existing items. Avoid generic boilerplate.
5. If user says "assign me", set "assignToMe":true.
6. If items need a project but none exists/matches, set "requiresProject":true and also create a project.

Return ONLY valid JSON.`;

      const projectSummariesForAI = activeProjects.map((p: any) => {
        let summary = `- ID: ${p.id}, Name: "${p.name}"`;
        if (p.status) summary += `, Status: ${p.status}`;
        return summary;
      });

      const existingProjectsContext = projectSummariesForAI.length > 0
        ? `\n\nExisting projects in this organization:\n${projectSummariesForAI.join('\n')}`
        : '\n\nNo existing projects in this organization.';

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Request: ${prompt}\n\nContext: organizationId=${organizationId}${projectId ? `, projectId=${projectId}` : ''}${targetProjectDetails}${existingProjectsContext}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI did not return a response" });
      }

      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError) {
        const classified = classifyError(parseError);
        return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to parse AI response" : classified.message });
      }

      const actions: any[] = [];

      if (aiResult.items?.project) {
        actions.push({ id: `project-0`, type: "create_project", description: `Create project "${aiResult.items.project.name}"`, details: aiResult.items.project, enabled: true });
      }
      if (aiResult.items?.projects?.length > 0) {
        aiResult.items.projects.forEach((proj: any, i: number) => {
          actions.push({ id: `project-${i}`, type: "create_project", description: `Create project "${proj.name}"`, details: proj, enabled: true });
        });
      }
      if (aiResult.items?.tasks?.length > 0) {
        aiResult.items.tasks.forEach((task: any, i: number) => {
          actions.push({ id: `task-${i}`, type: "create_task", description: `Create task "${task.name}" (${task.durationDays || 5} days, ${task.priority || 'Medium'} priority)`, details: task, enabled: true });
        });
      }
      if (aiResult.items?.risks?.length > 0) {
        aiResult.items.risks.forEach((risk: any, i: number) => {
          actions.push({ id: `risk-${i}`, type: "create_risk", description: `Create risk "${risk.title}" (${risk.probability || 'Medium'} prob., ${risk.impact || 'Medium'} impact)`, details: risk, enabled: true });
        });
      }
      if (aiResult.items?.issues?.length > 0) {
        aiResult.items.issues.forEach((issue: any, i: number) => {
          actions.push({ id: `issue-${i}`, type: "create_issue", description: `Create issue "${issue.title}" (${issue.priority || 'Medium'} priority)`, details: issue, enabled: true });
        });
      }
      if (aiResult.items?.milestones?.length > 0) {
        aiResult.items.milestones.forEach((ms: any, i: number) => {
          actions.push({ id: `milestone-${i}`, type: "create_milestone", description: `Create milestone "${ms.name || ms.title}" (day ${ms.daysFromStart || 30})`, details: ms, enabled: true });
        });
      }
      if (aiResult.items?.resources?.length > 0) {
        aiResult.items.resources.forEach((r: any, i: number) => {
          actions.push({ id: `resource-${i}`, type: "create_resource", description: `Add team member "${r.displayName}" - ${r.title || 'No title'}`, details: r, enabled: true });
        });
      }
      if (aiResult.assignToMe) {
        actions.push({ id: `assign-me`, type: "assign_to_me", description: `Assign all created tasks to you`, details: {}, enabled: true });
      }

      if (actions.length === 0) {
        return res.status(400).json({ message: "Could not understand what to create. Please be more specific.", intent: aiResult.intent });
      }

      let resolvedExistingProjectId: number | null = null;
      let matchedProject: { id: number; name: string } | null = null;

      if (aiResult.existingProjectId) {
        const candidateId = Number(aiResult.existingProjectId);
        const found = projectListForAI.find((p: any) => p.id === candidateId);
        if (found) {
          resolvedExistingProjectId = found.id;
          matchedProject = found;
        }
      }

      if (!resolvedExistingProjectId && !projectId && aiResult.items?.project?.name) {
        const aiProjectName = aiResult.items.project.name.toLowerCase().trim();
        const fuzzyMatch = projectListForAI.find((p: any) => {
          const existingName = p.name.toLowerCase().trim();
          return existingName === aiProjectName || existingName.includes(aiProjectName) || aiProjectName.includes(existingName);
        });
        if (fuzzyMatch) {
          resolvedExistingProjectId = fuzzyMatch.id;
          matchedProject = fuzzyMatch;
        }
      }

      if (!resolvedExistingProjectId && !projectId && detailProjectId) {
        const fallback = projectListForAI.find((p: any) => p.id === detailProjectId);
        if (fallback) {
          resolvedExistingProjectId = fallback.id;
          matchedProject = fallback;
        }
      }

      let finalActions = actions;
      if (resolvedExistingProjectId) {
        finalActions = actions.filter((a: any) => a.type !== "create_project");
      }

      const needsProjectContext = finalActions.some(a => ["create_task", "create_risk", "create_issue", "create_milestone"].includes(a.type));
      const hasProjectContext = projectId || resolvedExistingProjectId || finalActions.some(a => a.type === "create_project");

      res.json({
        success: true,
        intent: aiResult.intent,
        actions: finalActions,
        requiresProject: needsProjectContext && !hasProjectContext,
        resolvedProjectId: resolvedExistingProjectId || undefined,
        resolvedProjectName: matchedProject?.name || undefined,
        summary: `AI identified ${finalActions.length} action(s) to perform${matchedProject ? ` for project "${matchedProject.name}"` : ''}`,
      });
    } catch (err) {
      console.error("Error with AI smart create preview:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to preview AI actions" : classified.message });
    }
  });

  // ==================== AI SMART-CREATE CONFIRMED EXECUTE ====================
  apiRoute(app, 'post', '/api/ai/smart-create/execute', {
    tag: 'AI',
    summary: 'Execute AI smart create',
    requestBody: body({ type: 'object', properties: { plan: { type: 'object' }, organizationId: { type: 'integer' } } }),
    responses: { ...r201('Entities created', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { organizationId, projectId, portfolioId, actions } = req.body;

      if (!organizationId || !actions || !Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ message: "organizationId and actions array are required" });
      }

      const { checkAndEnforceLimit, METER_CODES, recordCreditUsage, RESOURCE_TYPES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, organizationId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      if (projectId) {
        const targetProject = await storage.getProject(Number(projectId));
        if (!targetProject || targetProject.organizationId !== Number(organizationId)) {
          return res.status(403).json({ message: "The selected project does not belong to this organization" });
        }
      }

      const today = new Date();
      let currentProjectId = projectId ? Number(projectId) : null;
      const results: any = { created: {}, summary: [] };
      const projectIndexToId: Record<number, number> = {};

      const projectActions = actions.filter((a: any) => a.type === "create_project");
      const taskActions = actions.filter((a: any) => a.type === "create_task");
      const riskActions = actions.filter((a: any) => a.type === "create_risk");
      const issueActions = actions.filter((a: any) => a.type === "create_issue");
      const milestoneActions = actions.filter((a: any) => a.type === "create_milestone");
      const resourceActions = actions.filter((a: any) => a.type === "create_resource");
      const assignToMe = actions.some((a: any) => a.type === "assign_to_me");

      if (projectActions.length > 1) {
        const createdProjects = [];
        const actionUser = userId ? await storage.getUser(userId) : null;
        const actionCreatorName = actionUser ? `${actionUser.firstName || ''} ${actionUser.lastName || ''}`.trim() || actionUser.email || 'Unknown' : 'System';
        for (let i = 0; i < projectActions.length; i++) {
          const proj = projectActions[i].details;
          const project = await storage.createProject({
            organizationId: Number(organizationId),
            portfolioId: portfolioId ? Number(portfolioId) : null,
            name: proj.name,
            description: proj.description,
            status: proj.status || "Initiation",
            priority: proj.priority || "Medium",
            health: proj.health || "Green",
            budget: String(proj.budget || 0),
            startDate: today.toISOString().split('T')[0],
            source: "ai_generated",
          });
          await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: actionCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${actionCreatorName} — generated with AI`, previousValues: null, newValues: null });
          projectIndexToId[i] = project.id;
          createdProjects.push(project);
          if (i === 0) currentProjectId = project.id;
        }
        results.created.projects = createdProjects;
        results.summary.push(`Created ${createdProjects.length} project(s)`);
      } else if (projectActions.length === 1) {
        const proj = projectActions[0].details;
        const project = await storage.createProject({
          organizationId: Number(organizationId),
          portfolioId: portfolioId ? Number(portfolioId) : null,
          name: proj.name,
          description: proj.description,
          status: proj.status || "Initiation",
          priority: proj.priority || "Medium",
          health: proj.health || "Green",
          budget: String(proj.budget || 0),
          startDate: today.toISOString().split('T')[0],
          source: "ai_generated",
        });
        const actionUser = userId ? await storage.getUser(userId) : null;
        const actionCreatorName = actionUser ? `${actionUser.firstName || ''} ${actionUser.lastName || ''}`.trim() || actionUser.email || 'Unknown' : 'System';
        await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: actionCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${actionCreatorName} — generated with AI`, previousValues: null, newValues: null });
        currentProjectId = project.id;
        projectIndexToId[0] = project.id;
        results.created.project = project;
        results.summary.push(`Created project "${project.name}"`);
      }

      if (taskActions.length > 0 && currentProjectId) {
        const createdTasks = [];
        let currentDate = new Date(today);
        for (const action of taskActions) {
          const taskData = action.details;
          const targetProjectId = (taskData.projectIndex !== undefined && projectIndexToId[taskData.projectIndex])
            ? projectIndexToId[taskData.projectIndex]
            : currentProjectId;
          const startDate = new Date(currentDate);
          const durationDays = taskData.durationDays || 5;
          const endDate = new Date(currentDate);
          endDate.setDate(endDate.getDate() + durationDays);
          const task = await storage.createTask({
            projectId: targetProjectId,
            name: taskData.name,
            description: taskData.description,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            durationDays,
            status: taskData.status || "Not Started",
            priority: taskData.priority || "Medium",
            progress: 0,
          });
          createdTasks.push(task);
          currentDate.setDate(currentDate.getDate() + durationDays);
        }
        results.created.tasks = createdTasks;
        results.summary.push(`Created ${createdTasks.length} task(s)`);
      }

      if (assignToMe && results.created.tasks?.length > 0) {
        try {
          const userResource = await db.select().from(resources)
            .where(and(
              eq(resources.userId, userId),
              eq(resources.organizationId, Number(organizationId)),
              eq(resources.isActive, true)
            ))
            .limit(1);
          if (userResource.length > 0) {
            for (const task of results.created.tasks) {
              await storage.addTaskResourceAssignment({
                taskId: task.id,
                resourceId: userResource[0].id,
                allocationPercentage: 100,
                role: "Assignee",
              });
            }
            results.summary.push(`Assigned all tasks to you`);
          }
        } catch (assignErr) {
          console.error("Error assigning tasks:", assignErr);
        }
      }

      if (riskActions.length > 0 && currentProjectId) {
        const createdRisks = [];
        for (const action of riskActions) {
          const riskData = action.details;
          const targetProjectId = (riskData.projectIndex !== undefined && projectIndexToId[riskData.projectIndex])
            ? projectIndexToId[riskData.projectIndex]
            : currentProjectId;
          const risk = await storage.createRisk({
            projectId: targetProjectId,
            title: riskData.title,
            description: riskData.description,
            probability: riskData.probability || "Medium",
            impact: riskData.impact || "Medium",
            status: riskData.status || "Open",
            mitigationPlan: riskData.mitigationPlan,
            costExposure: riskData.costExposure || null,
          });
          createdRisks.push(risk);
        }
        results.created.risks = createdRisks;
        results.summary.push(`Created ${createdRisks.length} risk(s)`);
      }

      if (issueActions.length > 0 && currentProjectId) {
        const createdIssues = [];
        for (const action of issueActions) {
          const issueData = action.details;
          const targetProjectId = (issueData.projectIndex !== undefined && projectIndexToId[issueData.projectIndex])
            ? projectIndexToId[issueData.projectIndex]
            : currentProjectId;
          const issue = await storage.createIssue({
            projectId: targetProjectId,
            title: issueData.title,
            description: issueData.description,
            priority: issueData.priority || "Medium",
            status: issueData.status || "Open",
            type: issueData.type || "Task",
            costExposure: issueData.costExposure || null,
          });
          createdIssues.push(issue);
        }
        results.created.issues = createdIssues;
        results.summary.push(`Created ${createdIssues.length} issue(s)`);
      }

      if (milestoneActions.length > 0 && currentProjectId) {
        const createdMilestones = [];
        for (const action of milestoneActions) {
          const msData = action.details;
          const milestoneDate = new Date(today);
          milestoneDate.setDate(milestoneDate.getDate() + (msData.daysFromStart || 30));
          const targetProjectId = (msData.projectIndex !== undefined && projectIndexToId[msData.projectIndex])
            ? projectIndexToId[msData.projectIndex]
            : currentProjectId;
          const milestone = await storage.createTask({
            projectId: targetProjectId,
            name: msData.name || msData.title || "Milestone",
            description: msData.description || null,
            startDate: milestoneDate.toISOString().split('T')[0],
            endDate: milestoneDate.toISOString().split('T')[0],
            durationDays: 0,
            status: "Not Started",
            priority: "Medium",
            progress: 0,
            isMilestone: true,
          });
          createdMilestones.push(milestone);
        }
        results.created.milestones = createdMilestones;
        results.summary.push(`Created ${createdMilestones.length} milestone(s)`);
      }

      if (resourceActions.length > 0) {
        const createdResources = [];
        for (const action of resourceActions) {
          const rData = action.details;
          const resource = await storage.createResource({
            organizationId: Number(organizationId),
            displayName: rData.displayName,
            email: rData.email,
            title: rData.title,
            department: rData.department,
            skills: rData.skills,
          });
          createdResources.push(resource);
        }
        results.created.resources = createdResources;
        results.summary.push(`Created ${createdResources.length} resource(s)`);
      }

      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_smart_create_confirmed_${Date.now()}`, organizationId ? Number(organizationId) : undefined);

      const aiUser = userId ? await storage.getUser(userId) : null;
      const aiCreatorName = aiUser ? `${aiUser.firstName || ''} ${aiUser.lastName || ''}`.trim() || aiUser.email || 'Unknown' : 'System';

      try {
        const allCreatedItems = [
          ...(results.created.tasks || []).map((t: any) => ({ type: 'task', id: t.id, name: t.name, projectId: t.projectId })),
          ...(results.created.risks || []).map((r: any) => ({ type: 'risk', id: r.id, name: r.title, projectId: r.projectId })),
          ...(results.created.issues || []).map((i: any) => ({ type: 'issue', id: i.id, name: i.title, projectId: i.projectId })),
          ...(results.created.milestones || []).map((m: any) => ({ type: 'milestone', id: m.id, name: m.name || m.title, projectId: m.projectId })),
        ];

        const itemsByProject = new Map<number, typeof allCreatedItems>();
        for (const item of allCreatedItems) {
          const pid = item.projectId || currentProjectId;
          if (!pid) continue;
          if (!itemsByProject.has(pid)) itemsByProject.set(pid, []);
          itemsByProject.get(pid)!.push(item);
        }

        for (const [pid, items] of itemsByProject) {
          const grouped: Record<string, string[]> = {};
          for (const item of items) {
            if (!grouped[item.type]) grouped[item.type] = [];
            grouped[item.type].push(`"${item.name}"`);
          }
          const summaryParts = Object.entries(grouped).map(([type, names]) => `${names.length} ${type}(s): ${names.join(', ')}`);
          await storage.createProjectChangeLog({
            projectId: pid,
            changedBy: userId || null,
            changedByName: aiCreatorName,
            changeType: 'ai_create',
            changeSummary: `AI Create by ${aiCreatorName} — ${summaryParts.join('; ')}`,
            previousValues: null,
            newValues: JSON.stringify(items),
          });
        }
      } catch (logErr) {
        console.error("Error writing AI create change logs:", logErr);
      }

      let redirectTo;
      if (results.created.projects?.length > 0) {
        redirectTo = `/projects`;
      } else if (results.created.project) {
        redirectTo = `/projects/${results.created.project.id}`;
      } else if (currentProjectId) {
        redirectTo = `/projects/${currentProjectId}`;
      }

      res.status(201).json({
        success: true,
        ...results,
        redirectTo,
        message: results.summary.join(", ")
      });
    } catch (err) {
      console.error("Error with AI smart create execute:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create items" : classified.message });
    }
  });

}
