import type { Express } from "express";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import Papa from "papaparse";
import { and, desc, asc, eq } from "drizzle-orm";
import { issues, tasks, projects, portfolios, type Task } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  getUserOrgIds,
  userHasAnyOrgAccess,
  requireEmailVerified,
  getTeamMemberTaskIds,
  getTeamMemberIssueIds,
  upload,
  openai,
  formatZodErrors,
} from "./helpers";
import { createTaskAssignmentNotification, createRiskAssignmentNotification } from "../services/notificationEngine";
import { addWorkingDays, ensureWorkingDay, calculateEndDate, calculateDuration, nextWorkingDay, formatDateStr, workingDaysBetweenExclusive } from "../lib/workingDays";

export function registerProjectItemRoutes(app: Express) {
  // --- Risks ---
  app.get(api.risks.list.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const risks = await storage.getRisks(projectId);
      res.json(risks);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching risks" : classified.message });
    }
  });

  app.post(api.risks.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const input = api.risks.create.input.parse(req.body);
      
      // Check credit limit before creation (using org subscription from project)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const riskProject = input.projectId ? await storage.getProject(input.projectId) : null;
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.RISKS, 1, riskProject?.organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "risks"
          });
        }
      }
      const risk = await storage.createRisk(input);
      
      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createRiskChangeLog({
        issueId: risk.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Risk "${risk.title}" created`,
        previousValues: null,
        newValues: JSON.stringify(risk),
      });
      
      res.status(201).json(risk);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      throw err;
    }
  });

  app.put(api.risks.update.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const riskId = Number(req.params.id);
      const existing = await storage.getRisk(riskId);
      if (!existing) return res.status(404).json({ message: "Risk not found" });
      
      const input = api.risks.update.input.parse(req.body);
      const updated = await storage.updateRisk(riskId, input);
      
      // Track changes
      const trackedFields = ['title', 'description', 'probability', 'impact', 'status', 'mitigation', 'owner'];
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      for (const field of trackedFields) {
        const prev = (existing as any)[field];
        const curr = (updated as any)[field];
        if (String(prev ?? '') !== String(curr ?? '')) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createRiskChangeLog({
          issueId: riskId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
       const classified = classifyError(err);
       res.status(classified.status).json({ message: classified.status === 500 ? "Error" : classified.message });
    }
  });

  app.delete(api.risks.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('risk', Number(req.params.id), userId!);
    res.status(204).send();
  });

  // Risk History
  app.get(api.risks.getHistory.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const riskId = Number(req.params.id);
      const risk = await storage.getRisk(riskId);
      if (!risk) return res.status(404).json({ message: "Risk not found" });
      
      const history = await storage.getRiskChangeLogs(riskId);
      res.json(history);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching risk history" : classified.message });
    }
  });

  // Convert Risk to Issue
  app.post('/api/risks/:id/convert-to-issue', async (req, res) => {
    try {
      const riskId = Number(req.params.id);
      const risk = await storage.getRisk(riskId);
      if (!risk) return res.status(404).json({ message: "Risk not found" });
      
      const converted = await storage.convertRiskToIssue(riskId);
      if (!converted) {
        return res.status(500).json({ message: "Failed to convert risk to issue" });
      }
      
      // Log the conversion in change logs
      const userId = getUserIdFromRequest(req);
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createIssueChangeLog({
        issueId: riskId,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'converted',
        changeSummary: `Converted from Risk to Issue`,
        previousValues: JSON.stringify({ itemType: 'risk' }),
        newValues: JSON.stringify({ itemType: 'issue' }),
      });
      
      res.json(converted);
    } catch (err) {
      console.error('Error converting risk to issue:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error converting risk to issue" : classified.message });
    }
  });

  // AI-powered Risk Mitigation Suggestions
  app.post('/api/risks/ai-mitigation', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { title, description, probability, impact, projectContext, organizationId } = req.body;
      
      if (!title) {
        return res.status(400).json({ message: "Risk title is required" });
      }

      const { checkAndEnforceLimit, METER_CODES, recordCreditUsage, RESOURCE_TYPES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, organizationId ? Number(organizationId) : undefined);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      const prompt = `You are a project risk management expert. Analyze the following risk and provide practical mitigation strategies.

Risk Title: ${title}
${description ? `Description: ${description}` : ''}
Probability: ${probability || 'Medium'}
Impact: ${impact || 'Medium'}
${projectContext ? `Project Context: ${projectContext}` : ''}

Provide 3-5 specific, actionable mitigation strategies for this risk. Each strategy should be:
- Practical and implementable
- Specific to the risk described
- Include who might be responsible and rough timeline if applicable

Format your response as a numbered list with clear, concise strategies. Do not include any preamble or conclusion - just provide the numbered list of mitigation strategies.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a project risk management expert providing concise, actionable mitigation strategies."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const suggestion = completion.choices[0]?.message?.content || "Unable to generate suggestions at this time.";

      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_mitigation_${Date.now()}`, organizationId ? Number(organizationId) : undefined);
      
      res.json({ suggestion });
    } catch (err: any) {
      console.error('Error generating AI mitigation suggestions:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error generating mitigation suggestions" : classified.message });
    }
  });

  // --- Milestones ---
  app.get(api.milestones.list.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const projectId = Number(req.params.projectId);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!await userHasOrgAccess(userId, project.organizationId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const milestones = await storage.getMilestones(projectId);
    res.json(milestones);
  });

  app.get(api.milestones.listAll.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    const accessibleOrgIds = await getUserOrgIds(userId);
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    const allMilestones = await storage.getAllMilestones();
    
    const allProjects = await storage.getProjects();
    let accessibleProjectIds: Set<number>;
    
    if (organizationId !== null) {
      // Verify user has access to this organization
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.json([]);
      }
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === organizationId)
          .map(p => p.id)
      );
    } else {
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === null || accessibleOrgIds.includes(p.organizationId))
          .map(p => p.id)
      );
    }
    
    const filteredMilestones = allMilestones.filter(m => accessibleProjectIds.has(m.projectId));
    res.json(filteredMilestones);
  });

  app.post(api.milestones.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const input = api.milestones.create.input.parse(req.body);
      const milestone = await storage.createMilestone(input);
      res.status(201).json(milestone);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      throw err;
    }
  });

  app.put(api.milestones.update.path, async (req, res) => {
    try {
      const input = api.milestones.update.input.parse(req.body);
      const updated = await storage.updateMilestone(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error" : classified.message });
    }
  });

  app.delete(api.milestones.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('milestone', Number(req.params.id), userId!);
    res.status(204).send();
  });

  // --- Issues ---
  app.get(api.issues.list.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const projectId = Number(req.params.projectId);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!await userHasOrgAccess(userId, project.organizationId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const issues = await storage.getIssues(projectId);
    res.json(issues);
  });

  app.get(api.issues.listAll.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    // Get user's accessible org IDs and filter issues by project's organization
    const accessibleOrgIds = await getUserOrgIds(userId);
    const itemType = req.query.itemType as 'issue' | 'risk' | 'all' | undefined;
    const allIssues = await storage.getAllIssues(itemType || 'all');
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    
    // Get all projects to determine which issues belong to accessible orgs
    const allProjects = await storage.getProjects();
    let accessibleProjectIds: Set<number>;
    
    if (organizationId !== null) {
      // Verify user has access to this organization
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.json([]);
      }
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === organizationId)
          .map(p => p.id)
      );
    } else {
      accessibleProjectIds = new Set(
        allProjects
          .filter(p => p.organizationId === null || accessibleOrgIds.includes(p.organizationId))
          .map(p => p.id)
      );
    }
    
    let filteredIssues = allIssues.filter(issue => accessibleProjectIds.has(issue.projectId));
    
    // For team_member role, further filter to only assigned issues
    // Apply filtering across all orgs where user has team_member role
    if (userId) {
      const userOrgs = await storage.getUserOrganizations(userId);
      for (const membership of userOrgs) {
        if (membership.role === 'team_member') {
          const assignedIssueIds = await getTeamMemberIssueIds(userId, membership.organizationId);
          // Get projects in this org to filter issues
          const orgProjects = allProjects.filter(p => p.organizationId === membership.organizationId);
          const orgProjectIds = new Set(orgProjects.map(p => p.id));
          filteredIssues = filteredIssues.filter(i => 
            !orgProjectIds.has(i.projectId) || assignedIssueIds.includes(i.id)
          );
        }
      }
    }
    
    res.json(filteredIssues);
  });

  app.post(api.issues.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const input = api.issues.create.input.parse(req.body);
      
      // Check credit limit before creation (using org subscription from project)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const issueProject = input.projectId ? await storage.getProject(input.projectId) : null;
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.ISSUES, 1, issueProject?.organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "issues"
          });
        }
      }
      const issue = await storage.createIssue(input);
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        // Get org ID from project for billing
        const project = input.projectId ? await storage.getProject(input.projectId) : null;
        await recordResourceUsage(userId, METER_CODES.ISSUES, issue.id, 1, project?.organizationId);
      }
      
      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createIssueChangeLog({
        issueId: issue.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Issue "${issue.title}" created`,
        previousValues: null,
        newValues: JSON.stringify(issue),
      });
      
      res.status(201).json(issue);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      throw err;
    }
  });

  app.put(api.issues.update.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const issueId = Number(req.params.id);
      const existing = await storage.getIssue(issueId);
      if (!existing) return res.status(404).json({ message: "Issue not found" });
      
      const input = api.issues.update.input.parse(req.body);
      const updated = await storage.updateIssue(issueId, input);
      
      // Track changes
      const trackedFields = ['title', 'description', 'priority', 'status', 'type', 'assignee'];
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      for (const field of trackedFields) {
        const prev = (existing as any)[field];
        const curr = (updated as any)[field];
        if (String(prev ?? '') !== String(curr ?? '')) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createIssueChangeLog({
          issueId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating issue" : classified.message });
    }
  });

  app.delete(api.issues.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    await storage.softDeleteItem('issue', Number(req.params.id), userId!);
    res.status(204).send();
  });

  // Issue History
  app.get(api.issues.getHistory.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const issueId = Number(req.params.id);
      const issue = await storage.getIssue(issueId);
      if (!issue) return res.status(404).json({ message: "Issue not found" });
      
      const history = await storage.getIssueChangeLogs(issueId);
      res.json(history);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching issue history" : classified.message });
    }
  });

  // Escalate issue/risk to portfolio
  app.post('/api/issues/:id/escalate', async (req, res) => {
    try {
      const issueId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { escalate } = req.body; // true to escalate, false to de-escalate
      
      const issue = await storage.getIssue(issueId);
      if (!issue) return res.status(404).json({ message: "Issue not found" });
      
      // Get project to check if it has a portfolio
      const project = await storage.getProject(issue.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      if (escalate && !project.portfolioId) {
        return res.status(400).json({ message: "Cannot escalate - project is not part of a portfolio" });
      }
      
      const updated = await storage.updateIssue(issueId, {
        escalatedToPortfolio: escalate,
        escalatedAt: escalate ? new Date() : null,
        escalatedBy: escalate ? userId : null,
      });
      
      // Log the escalation change
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createIssueChangeLog({
        issueId,
        changedBy: userId || undefined,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'updated',
        changeSummary: escalate ? 'Escalated to portfolio' : 'De-escalated from portfolio',
        previousValues: JSON.stringify({ escalatedToPortfolio: !escalate }),
        newValues: JSON.stringify({ escalatedToPortfolio: escalate }),
      });
      
      res.json(updated);
    } catch (err) {
      console.error('Error escalating issue:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating escalation status" : classified.message });
    }
  });

  // Get portfolio escalated issues
  app.get('/api/portfolios/:id/escalated-items', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const portfolioProjects = await storage.getPortfolioProjects(portfolioId);
      const projectIds = portfolioProjects.map(p => p.id);
      
      if (projectIds.length === 0) {
        return res.json({ risks: [], issues: [] });
      }
      
      // Get all escalated items from portfolio projects
      const allItems = await storage.getEscalatedItemsByProjects(projectIds);
      
      // Add project names to items
      const projectMap = new Map(portfolioProjects.map(p => [p.id, p.name]));
      const itemsWithProjectNames = allItems.map(item => ({
        ...item,
        projectName: projectMap.get(item.projectId) || 'Unknown'
      }));
      
      const risks = itemsWithProjectNames.filter(item => item.itemType === 'risk');
      const issues = itemsWithProjectNames.filter(item => item.itemType === 'issue');
      
      res.json({ risks, issues });
    } catch (err) {
      console.error('Error fetching escalated items:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching escalated items" : classified.message });
    }
  });

  // --- Tasks ---
  
  // Helper function to recalculate WBS numbers for all tasks in a project (MS Project style)
  async function recalculateProjectWBS(projectId: number) {
    const allTasks = await storage.getTasksByProject(projectId);
    if (allTasks.length === 0) return;
    
    // Sort tasks by taskIndex (sequential order)
    const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
    
    // Track WBS counters at each outline level (index 0 unused, levels 1-6)
    const wbsCounters: number[] = [0, 0, 0, 0, 0, 0, 0]; 
    let lastLevel = 0;
    
    const updates: Array<{ id: number; wbs: string }> = [];
    
    for (const task of sortedTasks) {
      const level = task.outlineLevel || 1;
      
      // Reset all deeper level counters when going to same or shallower level
      if (level <= lastLevel) {
        for (let i = level + 1; i < wbsCounters.length; i++) {
          wbsCounters[i] = 0;
        }
      }
      
      // Increment counter at current level
      wbsCounters[level]++;
      
      // Build WBS string from level 1 to current level
      const wbsParts: number[] = [];
      for (let i = 1; i <= level; i++) {
        wbsParts.push(wbsCounters[i]);
      }
      const wbs = wbsParts.join('.');
      
      // Collect updates
      if (task.wbs !== wbs) {
        updates.push({ id: task.id, wbs });
      }
      
      lastLevel = level;
    }
    
    await storage.batchUpdateTaskWbs(updates);
  }
  
  // Helper function to recalculate parentId for all tasks based on outline levels (MS Project style)
  async function recalculateParentIds(projectId: number) {
    const allTasks = await storage.getTasksByProject(projectId);
    if (allTasks.length === 0) return;
    
    // Sort tasks by taskIndex (sequential display order)
    const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
    
    // Track the most recent task at each outline level (for finding parent)
    const taskAtLevel: (number | null)[] = [null, null, null, null, null, null, null]; // index 0 unused, levels 1-6
    
    const updates: Array<{ id: number; parentId: number | null }> = [];
    
    for (const task of sortedTasks) {
      const level = task.outlineLevel || 1;
      
      // Find parent: the most recent task at level-1
      let newParentId: number | null = null;
      if (level > 1) {
        newParentId = taskAtLevel[level - 1] || null;
      }
      
      // Queue update if parentId changed
      if (task.parentId !== newParentId) {
        updates.push({ id: task.id, parentId: newParentId });
      }
      
      // Update task at current level
      taskAtLevel[level] = task.id;
      
      // Clear deeper levels (they can't be parents anymore once we move to this level)
      for (let i = level + 1; i < taskAtLevel.length; i++) {
        taskAtLevel[i] = null;
      }
    }
    
    await storage.batchUpdateTaskParentIds(updates);
  }
  
  async function recalculateTaskEstimatedHours(taskId: number) {
    const task = await storage.getTask(taskId);
    if (!task) return;
    const assignments = await storage.getTaskResourceAssignments(taskId);
    if (assignments.length === 0) return;

    let duration = task.durationDays;
    if (!duration && task.startDate && task.endDate) {
      const start = new Date(task.startDate + 'T00:00:00');
      const end = new Date(task.endDate + 'T00:00:00');
      duration = calculateDuration(start, end);
    }

    if (duration && duration > 0) {
      let totalEstimatedHours = 0;
      for (const assignment of assignments) {
        const allocationPct = assignment.allocationPercentage ?? 100;
        const weeklyCapacityStr = assignment.resource?.weeklyCapacity;
        const weeklyCapacity = weeklyCapacityStr ? parseFloat(weeklyCapacityStr) : 40;
        const dailyHours = weeklyCapacity / 5;
        const hoursForResource = (allocationPct / 100) * dailyHours * duration;
        totalEstimatedHours += hoursForResource;
      }
      const roundedHours = Math.round(totalEstimatedHours * 100) / 100;
      await storage.updateTask(taskId, { estimatedHours: String(roundedHours) });
    } else {
      await storage.updateTask(taskId, { estimatedHours: null });
    }
  }

  async function rollUpParentTasks(projectId: number) {
    await recalculateParentIds(projectId);
    
    const allTasks = await storage.getTasks(projectId);
    if (allTasks.length === 0) return;
    
    const childrenByParent = new Map<number, typeof allTasks>();
    const taskById = new Map<number, typeof allTasks[0]>();
    
    for (const task of allTasks) {
      taskById.set(task.id, task);
      if (task.parentId) {
        const children = childrenByParent.get(task.parentId) || [];
        children.push(task);
        childrenByParent.set(task.parentId, children);
      }
    }
    
    function getLeafDescendants(taskId: number): typeof allTasks {
      const children = childrenByParent.get(taskId) || [];
      if (children.length === 0) {
        const task = taskById.get(taskId);
        return task ? [task] : [];
      }
      const leaves: typeof allTasks = [];
      for (const child of children) {
        leaves.push(...getLeafDescendants(child.id));
      }
      return leaves;
    }
    
    const batchUpdates: import('../storage/taskStorage').BatchTaskFieldUpdate[] = [];
    
    for (const [parentId] of childrenByParent.entries()) {
      const parentTask = taskById.get(parentId);
      if (!parentTask) continue;
      
      const leafTasks = getLeafDescendants(parentId);
      if (leafTasks.length === 0) continue;

      const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + Number(t.estimatedHours || 0), 0);
      const totalActualHours = leafTasks.reduce((sum, t) => sum + Number(t.actualHours || 0), 0);
      const totalCost = leafTasks.reduce((sum, t) => sum + Number(t.cost || 0), 0);
      const totalActualCost = leafTasks.reduce((sum, t) => sum + Number(t.actualCost || 0), 0);
      
      const estHoursStr = totalEstimatedHours > 0 ? String(totalEstimatedHours) : null;
      const actHoursStr = totalActualHours > 0 ? String(totalActualHours) : null;
      const costStr = totalCost > 0 ? String(totalCost) : null;
      const actCostStr = totalActualCost > 0 ? String(totalActualCost) : null;

      const datedLeaves = leafTasks.filter(t => t.startDate && t.endDate && !t.isOngoing);

      let minStart = parentTask.startDate;
      let maxEnd = parentTask.endDate;
      let rollUpDurationDays = parentTask.durationDays;
      let avgProgress = parentTask.progress || 0;

      if (datedLeaves.length > 0) {
        const startDates = datedLeaves.map(t => new Date(t.startDate!).getTime());
        const endDates = datedLeaves.map(t => new Date(t.endDate!).getTime());
        const minStartDate = new Date(Math.min(...startDates));
        const maxEndDate = new Date(Math.max(...endDates));
        minStart = minStartDate.toISOString().split('T')[0];
        maxEnd = maxEndDate.toISOString().split('T')[0];
        rollUpDurationDays = calculateDuration(minStartDate, maxEndDate);

        let totalDuration = 0;
        let weightedProgress = 0;
        for (const leaf of datedLeaves) {
          const duration = Math.max(1, calculateDuration(new Date(leaf.startDate!), new Date(leaf.endDate!)));
          totalDuration += duration;
          weightedProgress += (leaf.progress || 0) * duration;
        }
        avgProgress = totalDuration > 0 ? Math.round(weightedProgress / totalDuration) : 0;
      }
      
      const needsUpdate = 
        parentTask.startDate !== minStart || 
        parentTask.endDate !== maxEnd || 
        parentTask.durationDays !== rollUpDurationDays ||
        parentTask.progress !== avgProgress ||
        parentTask.estimatedHours !== estHoursStr ||
        parentTask.actualHours !== actHoursStr ||
        parentTask.cost !== costStr ||
        parentTask.actualCost !== actCostStr ||
        !parentTask.isSummary;
      
      if (needsUpdate) {
        batchUpdates.push({
          id: parentId,
          startDate: minStart,
          endDate: maxEnd,
          durationDays: rollUpDurationDays,
          progress: avgProgress,
          estimatedHours: estHoursStr,
          actualHours: actHoursStr,
          cost: costStr,
          actualCost: actCostStr,
          isSummary: true,
        });
      }
    }
    
    if (batchUpdates.length > 0) {
      await storage.batchUpdateTaskFields(batchUpdates);
    }
    
    const durationFixes: import('../storage/taskStorage').BatchTaskFieldUpdate[] = [];
    for (const task of allTasks) {
      if (task.isOngoing) continue;
      if (task.startDate && task.endDate && !childrenByParent.has(task.id)) {
        if (task.isMilestone && task.durationDays === 0) continue;
        if (task.durationDays != null && task.durationDays > 0) {
          const expectedEnd = calculateEndDate(new Date(task.startDate), task.durationDays);
          const expectedEndStr = formatDateStr(expectedEnd);
          if (expectedEndStr === task.endDate) continue;
        }
        const correctDuration = calculateDuration(new Date(task.startDate), new Date(task.endDate));
        if (task.durationDays !== correctDuration) {
          durationFixes.push({ id: task.id, durationDays: correctDuration });
        }
      }
    }
    if (durationFixes.length > 0) {
      await storage.batchUpdateTaskFields(durationFixes);
    }
  }
  
  async function enrichTasksWithTimesheetHours(taskList: Task[]): Promise<Task[]> {
    if (taskList.length === 0) return taskList;
    const taskIds = taskList.map(t => t.id);
    const hoursMap = await storage.getTimesheetHoursByTaskIds(taskIds);
    return taskList.map(t => {
      const tsHours = hoursMap.get(t.id);
      if (tsHours !== undefined && tsHours > 0) {
        return { ...t, actualHours: String(tsHours) };
      }
      return t;
    });
  }

  app.get(api.tasks.list.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const tasks = await storage.getTasks(Number(req.params.projectId));
    const enriched = await enrichTasksWithTimesheetHours(tasks);
    res.json(enriched);
  });

  // Get single task by ID
  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const taskId = Number(req.params.id);
      if (isNaN(taskId)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      const [enriched] = await enrichTasksWithTimesheetHours([task]);
      res.json(enriched);
    } catch (err) {
      console.error("Error fetching task:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching task" : classified.message });
    }
  });

  app.get(api.tasks.listAll.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json({ tasks: [], total: 0, hasMore: false });
    }
    
    const accessibleOrgIds = await getUserOrgIds(userId);
    const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const dateFilters: import('./storage').TaskDateFilterOptions = {};
    if (req.query.startDateFrom) dateFilters.startDateFrom = req.query.startDateFrom as string;
    if (req.query.startDateTo) dateFilters.startDateTo = req.query.startDateTo as string;
    if (req.query.endDateFrom) dateFilters.endDateFrom = req.query.endDateFrom as string;
    if (req.query.endDateTo) dateFilters.endDateTo = req.query.endDateTo as string;
    if (req.query.overdue === 'true') dateFilters.overdue = true;
    if (req.query.today && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today as string)) {
      dateFilters.today = req.query.today as string;
    }
    const sortByParam = req.query.sortBy as string | undefined;
    if (sortByParam && ['startDate', 'endDate', 'createdAt'].includes(sortByParam)) {
      dateFilters.sortBy = sortByParam as 'startDate' | 'endDate' | 'createdAt';
    }
    const sortOrderParam = req.query.sortOrder as string | undefined;
    if (sortOrderParam && ['asc', 'desc'].includes(sortOrderParam)) {
      dateFilters.sortOrder = sortOrderParam as 'asc' | 'desc';
    }
    const hasDateFilters = Object.keys(dateFilters).length > 0 ? dateFilters : undefined;
    
    // Determine which orgs to query
    const targetOrgIds = organizationId !== null
      ? (accessibleOrgIds.includes(organizationId) ? [organizationId] : [])
      : accessibleOrgIds;
    
    if (targetOrgIds.length === 0) {
      return res.json({ tasks: [], total: 0, hasMore: false });
    }
    
    // Build per-org role map for team_member filtering
    const userOrgs = userId ? await storage.getUserOrganizations(userId) : [];
    const teamMemberOrgIds = new Set(
      userOrgs.filter(m => m.role === 'team_member').map(m => m.organizationId)
    );
    
    // For single org (most common case), use efficient DB-level pagination
    if (targetOrgIds.length === 1) {
      const orgId = targetOrgIds[0];
      let onlyTaskIds: number[] | undefined;
      if (teamMemberOrgIds.has(orgId) && userId) {
        onlyTaskIds = await getTeamMemberTaskIds(userId, orgId);
      }
      const { tasks: paginatedTasks, total } = await storage.getTasksByOrganizationPaginated(
        orgId, limit, offset, onlyTaskIds, hasDateFilters
      );
      const hasMore = offset + limit < total;
      const enrichedTasks = await enrichTasksWithTimesheetHours(paginatedTasks);
      return res.json({ tasks: enrichedTasks, total, hasMore });
    }
    
    // Multi-org: single batched query instead of per-org loop
    const teamMemberTargetOrgIds = targetOrgIds.filter(id => teamMemberOrgIds.has(id));
    const unrestrictedOrgIds = targetOrgIds.filter(id => !teamMemberOrgIds.has(id));

    let restrictedTaskIds: number[] | undefined;
    if (teamMemberTargetOrgIds.length > 0 && userId) {
      const taskIdPromises = teamMemberTargetOrgIds.map(orgId => getTeamMemberTaskIds(userId, orgId));
      const taskIdArrays = await Promise.all(taskIdPromises);
      restrictedTaskIds = taskIdArrays.flat();
    }

    const { tasks: paginatedTasks, total } = await storage.getTasksByMultipleOrganizationsPaginated(
      targetOrgIds, limit, offset, restrictedTaskIds, unrestrictedOrgIds, hasDateFilters
    );
    const hasMore = offset + limit < total;
    const enrichedTasks = await enrichTasksWithTimesheetHours(paginatedTasks);
    res.json({ tasks: enrichedTasks, total, hasMore });
  });

  app.post(api.tasks.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Normalize snake_case field names to camelCase for API compatibility
      const body = { ...req.body };
      const snakeToCamelMap: Record<string, string> = {
        project_id: 'projectId',
        task_index: 'taskIndex',
        task_number: 'taskNumber',
        task_type: 'taskType',
        start_date: 'startDate',
        end_date: 'endDate',
        baseline_start_date: 'baselineStartDate',
        baseline_end_date: 'baselineEndDate',
        actual_start_date: 'actualStartDate',
        actual_end_date: 'actualEndDate',
        duration_days: 'durationDays',
        estimated_hours: 'estimatedHours',
        actual_hours: 'actualHours',
        remaining_hours: 'remainingHours',
        constraint_type: 'constraintType',
        constraint_date: 'constraintDate',
        owner_id: 'ownerId',
        outline_level: 'outlineLevel',
        parent_id: 'parentId',
        is_milestone: 'isMilestone',
        is_summary: 'isSummary',
        is_critical: 'isCritical',
        actual_cost: 'actualCost',
        timesheet_blocked: 'timesheetBlocked',
        external_id: 'externalId',
        completion_overridden: 'completionOverridden',
        is_ongoing: 'isOngoing',
      };
      for (const [snake, camel] of Object.entries(snakeToCamelMap)) {
        if (snake in body && !(camel in body)) {
          body[camel] = body[snake];
          delete body[snake];
        }
      }

      const input = api.tasks.create.input.parse(body);

      if (!input.isOngoing && !input.startDate) {
        return res.status(400).json({ message: "Start date is required for non-ongoing tasks" });
      }
      
      // Check task limit before creation (using org subscription from project)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const taskProject = input.projectId ? await storage.getProject(input.projectId) : null;
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.TASKS, 1, taskProject?.organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Task limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "tasks"
          });
        }
      }
      
      // Calculate endDate from duration if provided
      if (input.durationDays != null && input.startDate) {
        if (input.durationDays === 0) {
          input.isMilestone = true;
          input.endDate = input.startDate;
        } else {
          const start = new Date(input.startDate + 'T00:00:00');
          input.endDate = formatDateStr(calculateEndDate(start, input.durationDays));
        }
      }
      
      const existingTasks = await storage.getTasksByProject(input.projectId);

      // When parentId is provided, auto-set outlineLevel and position the subtask correctly
      if (input.parentId) {
        const parentTask = existingTasks.find(t => t.id === input.parentId);
        if (!parentTask) {
          return res.status(400).json({ message: `Parent task with id ${input.parentId} not found in this project` });
        }
        const parentLevel = parentTask.outlineLevel || 1;
        if (!input.outlineLevel) {
          input.outlineLevel = parentLevel + 1;
        }

        // Position subtask right after the parent's last existing child
        if (input.taskIndex === undefined || input.taskIndex === null) {
          const hasNullIndices = existingTasks.some(t => t.taskIndex === null || t.taskIndex === undefined);
          let sortedTasks: typeof existingTasks;
          if (hasNullIndices) {
            sortedTasks = [...existingTasks].sort((a, b) => (a.taskIndex || 999999) - (b.taskIndex || 999999));
            for (let i = 0; i < sortedTasks.length; i++) {
              const t = sortedTasks[i];
              if (t.taskIndex !== i + 1) {
                await storage.updateTask(t.id, { taskIndex: i + 1 });
                t.taskIndex = i + 1;
              }
            }
          } else {
            sortedTasks = [...existingTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
          }
          const parentIdx = sortedTasks.findIndex(t => t.id === input.parentId);
          let insertAfterIdx = parentIdx;
          for (let i = parentIdx + 1; i < sortedTasks.length; i++) {
            const level = sortedTasks[i].outlineLevel || 1;
            if (level > parentLevel) {
              insertAfterIdx = i;
            } else {
              break;
            }
          }
          const insertAfterTaskIndex = sortedTasks[insertAfterIdx]?.taskIndex || 0;
          const nextTaskIndex = sortedTasks[insertAfterIdx + 1]?.taskIndex;

          if (nextTaskIndex !== undefined && nextTaskIndex !== null) {
            for (const t of sortedTasks) {
              if ((t.taskIndex || 0) > insertAfterTaskIndex) {
                await storage.updateTask(t.id, { taskIndex: (t.taskIndex || 0) + 1 });
              }
            }
          }
          input.taskIndex = insertAfterTaskIndex + 1;
        }

        // Mark the parent task as a summary task
        if (!parentTask.isSummary) {
          await storage.updateTask(parentTask.id, { isSummary: true });
        }
      } else {
        // Auto-assign taskIndex if not provided (top-level task)
        if (input.taskIndex === undefined || input.taskIndex === null) {
          const hasNullIndices = existingTasks.some(t => t.taskIndex === null || t.taskIndex === undefined);
          if (hasNullIndices) {
            const sortedExisting = [...existingTasks].sort((a, b) => (a.taskIndex || 999999) - (b.taskIndex || 999999));
            for (let i = 0; i < sortedExisting.length; i++) {
              const t = sortedExisting[i];
              if (t.taskIndex !== i + 1) {
                await storage.updateTask(t.id, { taskIndex: i + 1 });
              }
            }
            input.taskIndex = sortedExisting.length + 1;
          } else {
            const maxExistingIndex = existingTasks.reduce((max, t) => Math.max(max, t.taskIndex || 0), 0);
            input.taskIndex = maxExistingIndex + 1;
          }
        }
      }
      
      const task = await storage.createTask(input);
      
      // Recalculate WBS for all tasks in the project
      await recalculateProjectWBS(input.projectId);
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        // Get org ID from project for billing
        const project = await storage.getProject(input.projectId);
        await recordResourceUsage(userId, METER_CODES.TASKS, task.id, 1, project?.organizationId);
      }
      
      // Log the creation
      const user = userId ? await storage.getUser(userId) : null;
      await storage.createTaskChangeLog({
        taskId: task.id,
        changedBy: userId || null,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'created',
        changeSummary: `Task "${task.name}" created`,
        previousValues: null,
        newValues: JSON.stringify(task),
      });
      
      // Roll up values from children to parent tasks
      if (task.projectId) {
        await rollUpParentTasks(task.projectId);
      }
      
      // Re-fetch the task to return the fully updated version (with WBS, outlineLevel, etc.)
      const updatedTask = await storage.getTask(task.id);
      res.status(201).json(updatedTask || task);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      throw err;
    }
  });

  const bulkUpdateSchema = z.object({
    taskIds: z.array(z.number()).optional(),
    updates: z.object({
      progress: z.number().min(0).max(100).optional(),
      status: z.string().optional(),
      timesheetBlocked: z.boolean().optional(),
    }).optional(),
    taskUpdates: z.array(z.object({
      taskId: z.number(),
      updates: z.object({
        baselineStartDate: z.string().optional(),
        baselineEndDate: z.string().optional(),
      }),
    })).optional(),
  }).refine(
    data => (data.taskIds?.length && data.updates) || data.taskUpdates?.length,
    { message: 'taskIds with updates, or taskUpdates array required' }
  );

  app.post(api.tasks.bulkUpdate.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const parsed = bulkUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: formatZodErrors(parsed.error) });
      }
      const { taskIds, updates, taskUpdates } = parsed.data;

      let updatedCount = 0;
      const user = await storage.getUser(userId);
      const changedByName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System';

      if (taskIds?.length && updates) {
        const previousTasks = await Promise.all(taskIds.map(id => storage.getTask(id)));
        const validTasks = previousTasks.filter((t): t is NonNullable<typeof t> => t !== null && t !== undefined);

        if (validTasks.length === 0) {
          return res.status(400).json({ message: 'No valid tasks found' });
        }

        const finalUpdates: Record<string, any> = { ...updates };
        if (finalUpdates.progress !== undefined) {
          if (finalUpdates.progress === 100) {
            finalUpdates.status = 'Completed';
          } else if (finalUpdates.progress === 0) {
            finalUpdates.status = 'Not Started';
          } else if (finalUpdates.progress > 0) {
            finalUpdates.status = 'In Progress';
          }
        }

        const validIds = validTasks.map(t => t.id);
        await storage.bulkUpdateTasks(validIds, finalUpdates);
        updatedCount = validIds.length;

        const projectIds = new Set(validTasks.map(t => t.projectId));

        const changeLogs = validTasks.map(prev => {
          const changes: string[] = [];
          const prevValues: Record<string, any> = {};
          const newValues: Record<string, any> = {};
          const fieldsToTrack = ['progress', 'status', 'timesheetBlocked'];
          for (const field of fieldsToTrack) {
            if (finalUpdates[field] !== undefined && (prev as any)[field] !== finalUpdates[field]) {
              changes.push(`${field}: "${(prev as any)[field] ?? '(empty)'}" → "${finalUpdates[field] ?? '(empty)'}"`);
              prevValues[field] = (prev as any)[field];
              newValues[field] = finalUpdates[field];
            }
          }
          if (changes.length === 0) return null;
          return {
            taskId: prev.id,
            changedBy: userId,
            changedByName,
            changeType: 'updated' as const,
            changeSummary: changes.join('; '),
            previousValues: JSON.stringify(prevValues),
            newValues: JSON.stringify(newValues),
          };
        }).filter((c): c is NonNullable<typeof c> => c !== null);

        if (changeLogs.length > 0) {
          await Promise.all(changeLogs.map(log => storage.createTaskChangeLog(log)));
        }

        for (const pid of projectIds) {
          await rollUpParentTasks(pid);
        }
      }

      if (taskUpdates?.length) {
        const allTaskIds = taskUpdates.map(t => t.taskId);
        const previousTasks = await Promise.all(allTaskIds.map(id => storage.getTask(id)));
        const taskMap = new Map(previousTasks.filter((t): t is NonNullable<typeof t> => t !== null).map(t => [t.id, t]));
        const projectIds = new Set<number>();

        for (const { taskId, updates: perTaskUpdates } of taskUpdates) {
          const prev = taskMap.get(taskId);
          if (!prev) continue;

          await storage.updateTask(taskId, perTaskUpdates);
          updatedCount++;
          projectIds.add(prev.projectId);

          const changes: string[] = [];
          const prevValues: Record<string, any> = {};
          const newValues: Record<string, any> = {};
          for (const field of ['baselineStartDate', 'baselineEndDate']) {
            if ((perTaskUpdates as any)[field] !== undefined && (prev as any)[field] !== (perTaskUpdates as any)[field]) {
              changes.push(`${field}: "${(prev as any)[field] ?? '(empty)'}" → "${(perTaskUpdates as any)[field] ?? '(empty)'}"`);
              prevValues[field] = (prev as any)[field];
              newValues[field] = (perTaskUpdates as any)[field];
            }
          }
          if (changes.length > 0) {
            await storage.createTaskChangeLog({
              taskId,
              changedBy: userId,
              changedByName,
              changeType: 'updated',
              changeSummary: changes.join('; '),
              previousValues: JSON.stringify(prevValues),
              newValues: JSON.stringify(newValues),
            });
          }
        }

        for (const pid of projectIds) {
          await rollUpParentTasks(pid);
        }
      }

      return res.json({ updatedCount });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      throw err;
    }
  });

  app.post(api.tasks.bulkDelete.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const bodySchema = z.object({ taskIds: z.array(z.number()).min(1) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'taskIds array with at least one ID required' });
      }
      const { taskIds } = parsed.data;

      const tasksToDelete = await Promise.all(taskIds.map(id => storage.getTask(id)));
      const validTasks = tasksToDelete.filter((t): t is NonNullable<typeof t> => t !== null && t !== undefined);
      if (validTasks.length === 0) {
        return res.status(400).json({ message: 'No valid tasks found' });
      }

      const validIds = validTasks.map(t => t.id);
      const projectIds = new Set(validTasks.map(t => t.projectId));

      const deletedCount = await storage.bulkSoftDeleteTasks(validIds, userId);

      for (const pid of projectIds) {
        await rollUpParentTasks(pid);
        await recalculateProjectWBS(pid);
      }

      return res.json({ deletedCount });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      throw err;
    }
  });

  app.put(api.tasks.update.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const taskId = Number(req.params.id);
      const previousTask = await storage.getTask(taskId);
      if (!previousTask) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Normalize snake_case field names to camelCase for API compatibility
      const body = { ...req.body };
      const snakeToCamelMap: Record<string, string> = {
        project_id: 'projectId',
        task_index: 'taskIndex',
        task_number: 'taskNumber',
        task_type: 'taskType',
        start_date: 'startDate',
        end_date: 'endDate',
        baseline_start_date: 'baselineStartDate',
        baseline_end_date: 'baselineEndDate',
        actual_start_date: 'actualStartDate',
        actual_end_date: 'actualEndDate',
        duration_days: 'durationDays',
        estimated_hours: 'estimatedHours',
        actual_hours: 'actualHours',
        remaining_hours: 'remainingHours',
        constraint_type: 'constraintType',
        constraint_date: 'constraintDate',
        owner_id: 'ownerId',
        outline_level: 'outlineLevel',
        parent_id: 'parentId',
        is_milestone: 'isMilestone',
        is_summary: 'isSummary',
        is_critical: 'isCritical',
        actual_cost: 'actualCost',
        timesheet_blocked: 'timesheetBlocked',
        external_id: 'externalId',
        completion_overridden: 'completionOverridden',
        is_ongoing: 'isOngoing',
      };
      for (const [snake, camel] of Object.entries(snakeToCamelMap)) {
        if (snake in body && !(camel in body)) {
          body[camel] = body[snake];
          delete body[snake];
        }
      }

      const input = api.tasks.update.input.parse(body);

      if (input.isOngoing === true && !previousTask.isOngoing) {
        const outgoingDeps = await storage.getTaskDependencies(taskId);
        for (const dep of outgoingDeps) {
          await storage.deleteTaskDependency(dep.taskId, dep.dependsOnTaskId);
        }
        const incomingDeps = await storage.getTaskDependents(taskId);
        for (const dep of incomingDeps) {
          await storage.deleteTaskDependency(dep.taskId, dep.dependsOnTaskId);
        }
        input.startDate = null;
        input.endDate = null;
        input.durationDays = null;
        input.isMilestone = false;
      }

      const isOngoing = input.isOngoing !== undefined ? input.isOngoing : previousTask.isOngoing;
      if (!isOngoing && input.startDate === null && previousTask.startDate && input.startDate !== undefined) {
        return res.status(400).json({ message: "Start date is required for non-ongoing tasks" });
      }
      
      // Guardrails: sync status and progress
      const incomingStatus = input.status ?? previousTask.status;
      const incomingProgress = input.progress ?? previousTask.progress ?? 0;
      
      if (input.status !== undefined && input.status !== previousTask.status) {
        if (input.status === "Not Started") {
          input.progress = 0;
        } else if (input.status === "Completed") {
          input.progress = 100;
        } else if (input.status === "In Progress" && previousTask.status === "Completed") {
          input.progress = 50;
        }
      } else if (input.progress !== undefined && input.progress !== (previousTask.progress ?? 0)) {
        if (incomingStatus === "Not Started" && input.progress > 0) {
          input.status = "In Progress";
        }
        if (incomingStatus === "In Progress" && input.progress === 100) {
          input.status = "Completed";
        }
        if (incomingStatus === "In Progress" && input.progress === 0) {
          input.status = "Not Started";
        }
      }
      
      // Validate outline level is within bounds (1-6)
      if (input.outlineLevel !== undefined && input.outlineLevel !== null) {
        if (input.outlineLevel < 1) {
          input.outlineLevel = 1;
        } else if (input.outlineLevel > 6) {
          input.outlineLevel = 6;
        }
      }
      
      if (input.durationDays != null) {
        if (input.durationDays === 0) {
          input.isMilestone = true;
        } else if (input.isMilestone === undefined) {
          input.isMilestone = false;
        }
        const startDate = input.startDate || previousTask.startDate;
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          const end = calculateEndDate(start, input.durationDays);
          input.endDate = formatDateStr(end);
        }
      } else if (input.startDate && input.startDate !== previousTask.startDate && input.endDate === undefined) {
        const duration = previousTask.durationDays ?? (previousTask.startDate && previousTask.endDate
          ? calculateDuration(new Date(previousTask.startDate + 'T00:00:00'), new Date(previousTask.endDate + 'T00:00:00'))
          : 1);
        if (duration > 0) {
          const start = new Date(input.startDate + 'T00:00:00');
          const end = calculateEndDate(start, duration);
          input.endDate = formatDateStr(end);
          input.durationDays = duration;
        }
      } else if (input.endDate && input.endDate !== previousTask.endDate && input.startDate === undefined) {
        const startDate = previousTask.startDate;
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          const end = new Date(input.endDate + 'T00:00:00');
          input.durationDays = calculateDuration(start, end);
        }
      }
      
      const updated = await storage.updateTask(taskId, input);
      
      // Build change summary
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      const fieldsToTrack = ['name', 'description', 'startDate', 'endDate', 'durationDays', 'progress', 'status', 'assignee'];
      for (const field of fieldsToTrack) {
        const prev = (previousTask as any)[field];
        const curr = (updated as any)[field];
        if (prev !== curr) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createTaskChangeLog({
          taskId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      // Roll up values from children to parent tasks
      if (updated.projectId) {
        await rollUpParentTasks(updated.projectId);
      }
      
      // Recalculate WBS if outline level or taskIndex changed
      if ((input.outlineLevel !== undefined && input.outlineLevel !== previousTask.outlineLevel) ||
          (input.taskIndex !== undefined && input.taskIndex !== previousTask.taskIndex)) {
        await recalculateProjectWBS(updated.projectId);
      }
      
      const datesChanged = (input.startDate !== undefined && input.startDate !== previousTask.startDate) ||
                           (input.endDate !== undefined && input.endDate !== previousTask.endDate) ||
                           (input.durationDays !== undefined && input.durationDays !== previousTask.durationDays);
      
      if (datesChanged) {
        await recalculateTaskEstimatedHours(taskId);
      }
      
      // When the user manually changes a task's start date, update predecessor dependency
      // lag days so the dependency reflects the user's chosen date instead of reverting it
      if (datesChanged && input.startDate && input.startDate !== previousTask.startDate) {
        const predecessorDeps = await storage.getTaskDependencies(taskId);
        if (predecessorDeps.length > 0) {
          for (const dep of predecessorDeps) {
            const predTask = await storage.getTask(dep.dependsOnTaskId);
            if (!predTask) continue;

            const dtype = (dep.dependencyType || 'finish-to-start').toLowerCase().replace(/[\s_-]/g, '');
            const newStart = ensureWorkingDay(new Date(updated.startDate + 'T00:00:00'));
            const newEnd = updated.endDate ? ensureWorkingDay(new Date(updated.endDate + 'T00:00:00')) : newStart;
            let referenceDate: Date | null = null;
            let targetDate: Date;

            if (dtype === 'finishtostart' || dtype === 'fs') {
              referenceDate = predTask.endDate ? nextWorkingDay(new Date(predTask.endDate + 'T00:00:00')) : null;
              targetDate = newStart;
            } else if (dtype === 'starttostart' || dtype === 'ss') {
              referenceDate = predTask.startDate ? ensureWorkingDay(new Date(predTask.startDate + 'T00:00:00')) : null;
              targetDate = newStart;
            } else if (dtype === 'finishtofinish' || dtype === 'ff') {
              referenceDate = predTask.endDate ? ensureWorkingDay(new Date(predTask.endDate + 'T00:00:00')) : null;
              targetDate = newEnd;
            } else if (dtype === 'starttofinish' || dtype === 'sf') {
              referenceDate = predTask.startDate ? ensureWorkingDay(new Date(predTask.startDate + 'T00:00:00')) : null;
              targetDate = newEnd;
            } else {
              continue;
            }

            if (referenceDate) {
              let newLag = 0;
              if (targetDate > referenceDate) {
                newLag = workingDaysBetweenExclusive(referenceDate, targetDate);
              } else if (targetDate < referenceDate) {
                newLag = -workingDaysBetweenExclusive(targetDate, referenceDate);
              }

              if (newLag !== (dep.lagDays || 0)) {
                await storage.updateTaskDependency(taskId, dep.dependsOnTaskId, { lagDays: newLag });
              }
            }
          }
        }
      }

      let propagatedTasks: { taskId: number; newStartDate: string; newEndDate: string }[] = [];
      if (datesChanged && updated.projectId) {
        propagatedTasks = await propagateScheduleForProject(updated.projectId);
      }
      
      // If the task itself was adjusted by propagation, re-fetch to return accurate data
      let finalTask = updated;
      let datesCorrectedByDependency = false;
      const selfAdjustment = propagatedTasks.find(p => p.taskId === taskId);
      if (selfAdjustment) {
        const refetched = await storage.getTask(taskId);
        if (refetched) {
          finalTask = refetched;
          datesCorrectedByDependency = true;
        }
      }
      
      res.json({ ...finalTask, propagatedTasks, datesCorrectedByDependency });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating task" : classified.message });
    }
  });

  app.delete(api.tasks.delete.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      const project = await storage.getProject(task.projectId);
      if (project && !await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await storage.softDeleteItem('task', taskId, userId);
      
      if (task.projectId) {
        await recalculateProjectWBS(task.projectId);
      }
      
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting task" : classified.message });
    }
  });

  // Task History
  app.get(api.tasks.getHistory.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      const project = await storage.getProject(task.projectId);
      if (project && !await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const history = await storage.getTaskChangeLogs(taskId);
      res.json(history);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching task history" : classified.message });
    }
  });

  // Task Dependencies
  app.get(api.tasks.getDependencies.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const taskId = Number(req.params.id);
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      const project = await storage.getProject(task.projectId);
      if (project && !await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const dependencies = await storage.getTaskDependencies(taskId);
      res.json(dependencies);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching task dependencies" : classified.message });
    }
  });

  app.post(api.tasks.addDependency.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const taskId = Number(req.params.id);
      const { dependsOnTaskId, dependencyType, lagDays } = api.tasks.addDependency.input.parse(req.body);
      
      // Prevent self-dependency
      if (taskId === dependsOnTaskId) {
        return res.status(400).json({ message: "A task cannot depend on itself" });
      }
      
      // Check if either task is ongoing - ongoing tasks cannot have dependencies
      const dependentTask = await storage.getTask(taskId);
      const predecessorCheck = await storage.getTask(dependsOnTaskId);
      if (dependentTask?.isOngoing || predecessorCheck?.isOngoing) {
        return res.status(400).json({ message: "Dependencies cannot be added to or from ongoing tasks" });
      }

      // Check if the dependent task (taskId) has children - only leaf tasks can have dependencies
      if (dependentTask) {
        const allTasks = await storage.getTasksByProject(dependentTask.projectId);
        const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
        const taskIdx = sortedTasks.findIndex(t => t.id === taskId);
        if (taskIdx >= 0 && taskIdx < sortedTasks.length - 1) {
          const taskLevel = dependentTask.outlineLevel || 1;
          const nextTaskLevel = sortedTasks[taskIdx + 1].outlineLevel || 1;
          if (nextTaskLevel > taskLevel) {
            return res.status(400).json({ message: "Dependencies are only allowed for leaf tasks (tasks without children)" });
          }
        }
      }
      
      // Check if the predecessor task (dependsOnTaskId) has children
      const predecessorTask = predecessorCheck;
      if (predecessorTask) {
        const allTasks = await storage.getTasksByProject(predecessorTask.projectId);
        const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
        const taskIdx = sortedTasks.findIndex(t => t.id === dependsOnTaskId);
        if (taskIdx >= 0 && taskIdx < sortedTasks.length - 1) {
          const taskLevel = predecessorTask.outlineLevel || 1;
          const nextTaskLevel = sortedTasks[taskIdx + 1].outlineLevel || 1;
          if (nextTaskLevel > taskLevel) {
            return res.status(400).json({ message: "Cannot add dependency on a parent task (tasks with children)" });
          }
        }
      }
      
      const dependency = await storage.createTaskDependency({
        taskId,
        dependsOnTaskId,
        dependencyType: dependencyType || 'finish-to-start',
        lagDays: lagDays || 0,
      });
      
      let dateAdjusted = false;
      let newStartDate: string | null = null;
      let newEndDate: string | null = null;
      
      const predecessorTaskForDates = await storage.getTask(dependsOnTaskId);
      const dependentTaskForDates = await storage.getTask(taskId);
      
      if (predecessorTaskForDates && dependentTaskForDates) {
        const predStart = predecessorTaskForDates.startDate ? new Date(predecessorTaskForDates.startDate + 'T00:00:00') : null;
        const predEnd = predecessorTaskForDates.endDate ? new Date(predecessorTaskForDates.endDate + 'T00:00:00') : null;
        const depType = (dependencyType || 'finish-to-start').toLowerCase().replace(/[\s_-]/g, '');
        const lag = lagDays || 0;
        
        let requiredStart: Date | null = null;
        let requiredEnd: Date | null = null;
        
        if ((depType === 'finishtostart' || depType === 'fs') && predEnd) {
          const base = nextWorkingDay(predEnd);
          requiredStart = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        } else if ((depType === 'starttostart' || depType === 'ss') && predStart) {
          const base = ensureWorkingDay(new Date(predStart));
          requiredStart = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        } else if ((depType === 'finishtofinish' || depType === 'ff') && predEnd) {
          const base = ensureWorkingDay(new Date(predEnd));
          requiredEnd = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        } else if ((depType === 'starttofinish' || depType === 'sf') && predStart) {
          const base = ensureWorkingDay(new Date(predStart));
          requiredEnd = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        }
        
        const currentStart = dependentTaskForDates.startDate ? new Date(dependentTaskForDates.startDate + 'T00:00:00') : null;
        const currentEnd = dependentTaskForDates.endDate ? new Date(dependentTaskForDates.endDate + 'T00:00:00') : null;
        const duration = dependentTaskForDates.durationDays ?? (currentStart && currentEnd
          ? calculateDuration(currentStart, currentEnd) : 1);
        
        if (requiredStart && (!currentStart || currentStart < requiredStart)) {
          newStartDate = formatDateStr(requiredStart);
          if (duration === 0 || dependentTaskForDates.isMilestone) {
            newEndDate = newStartDate;
            await storage.updateTask(taskId, { startDate: newStartDate, endDate: newStartDate, durationDays: 0 });
          } else {
            const newEnd = calculateEndDate(requiredStart, duration);
            newEndDate = formatDateStr(newEnd);
            await storage.updateTask(taskId, { startDate: newStartDate, endDate: newEndDate, durationDays: duration });
          }
          dateAdjusted = true;
        } else if (requiredEnd && (!currentEnd || currentEnd < requiredEnd)) {
          newEndDate = formatDateStr(requiredEnd);
          if (duration === 0 || dependentTaskForDates.isMilestone) {
            newStartDate = newEndDate;
            await storage.updateTask(taskId, { startDate: newEndDate, endDate: newEndDate, durationDays: 0 });
          } else {
            const calendarSpan = Math.ceil(duration);
            const newStart = ensureWorkingDay(addWorkingDays(requiredEnd, -(Math.max(0, calendarSpan - 1))));
            newStartDate = formatDateStr(newStart);
            await storage.updateTask(taskId, { startDate: newStartDate, endDate: newEndDate, durationDays: duration });
          }
          dateAdjusted = true;
        }
      }
      
      let propagatedTasks: { taskId: number; newStartDate: string; newEndDate: string }[] = [];
      if (dependentTaskForDates) {
        propagatedTasks = await propagateScheduleForProject(dependentTaskForDates.projectId);
      }

      res.status(201).json({ 
        ...dependency, 
        dateAdjusted,
        adjustedTaskId: dateAdjusted ? taskId : null,
        newStartDate: dateAdjusted ? newStartDate : null,
        newEndDate: dateAdjusted ? newEndDate : null,
        propagatedTasks,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error adding dependency" : classified.message });
    }
  });

  app.put(api.tasks.updateDependency.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const taskId = Number(req.params.id);
      const dependsOnTaskId = Number(req.params.dependsOnTaskId);
      const updates = api.tasks.updateDependency.input.parse(req.body);
      
      const updated = await storage.updateTaskDependency(taskId, dependsOnTaskId, updates);
      if (!updated) {
        return res.status(404).json({ message: 'Dependency not found' });
      }
      
      const dependentTask = await storage.getTask(taskId);
      let propagatedTasks: { taskId: number; newStartDate: string; newEndDate: string }[] = [];

      if (dependentTask) {
        propagatedTasks = await propagateScheduleForProject(dependentTask.projectId);
        await rollUpParentTasks(dependentTask.projectId);
      }

      const updatedTask = await storage.getTask(taskId);
      
      res.json({ 
        ...updated, 
        dateAdjusted: propagatedTasks.some(p => p.taskId === taskId),
        adjustedTaskId: propagatedTasks.some(p => p.taskId === taskId) ? taskId : null,
        newStartDate: updatedTask?.startDate || null,
        newEndDate: updatedTask?.endDate || null,
        propagatedTasks,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating dependency" : classified.message });
    }
  });

  app.delete(api.tasks.removeDependency.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const taskId = Number(req.params.id);
    const dependsOnTaskId = Number(req.params.dependsOnTaskId);
    await storage.deleteTaskDependency(taskId, dependsOnTaskId);
    res.status(204).send();
  });

  // Get all dependencies for a project (for CPM calculation)
  app.get('/api/projects/:projectId/dependencies', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (project.organizationId) {
        const userOrgs = await storage.getUserOrganizations(userId);
        if (!userOrgs.find(m => m.organizationId === project.organizationId)) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
      const dependencies = await storage.getProjectDependencies(projectId);
      res.json(dependencies);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project dependencies" : classified.message });
    }
  });

  async function propagateScheduleForProject(projectId: number): Promise<{ taskId: number; newStartDate: string; newEndDate: string }[]> {
    const allTasks = await storage.getTasksByProject(projectId);
    const dependencies = await storage.getProjectDependencies(projectId);
    if (dependencies.length === 0) return [];

    const taskMap = new Map(allTasks.map(t => [t.id, { ...t }]));
    const adjustedTasks: { taskId: number; newStartDate: string; newEndDate: string }[] = [];
    const allTaskIds = new Set(allTasks.map(t => t.id));

    const predecessorDeps = new Map<number, typeof dependencies>();
    for (const dep of dependencies) {
      if (!allTaskIds.has(dep.taskId) || !allTaskIds.has(dep.dependsOnTaskId)) continue;
      if (!predecessorDeps.has(dep.taskId)) {
        predecessorDeps.set(dep.taskId, []);
      }
      predecessorDeps.get(dep.taskId)!.push(dep);
    }

    const successorIds = new Map<number, Set<number>>();
    for (const dep of dependencies) {
      if (!allTaskIds.has(dep.taskId) || !allTaskIds.has(dep.dependsOnTaskId)) continue;
      if (!successorIds.has(dep.dependsOnTaskId)) {
        successorIds.set(dep.dependsOnTaskId, new Set());
      }
      successorIds.get(dep.dependsOnTaskId)!.add(dep.taskId);
    }

    function normalizeDependencyType(depType: string | null): string {
      return (depType || 'finish-to-start').toLowerCase().replace(/[\s_-]/g, '');
    }

    function getConstraintFromDep(dep: typeof dependencies[0]): { requiredStart: Date | null; requiredEnd: Date | null } {
      const pred = taskMap.get(dep.dependsOnTaskId);
      if (!pred) return { requiredStart: null, requiredEnd: null };

      const predStart = pred.startDate ? new Date(pred.startDate + 'T00:00:00') : null;
      const predEnd = pred.endDate ? new Date(pred.endDate + 'T00:00:00') : null;
      const lag = dep.lagDays || 0;
      const dtype = normalizeDependencyType(dep.dependencyType);

      if (dtype === 'finishtostart' || dtype === 'fs') {
        if (!predEnd) return { requiredStart: null, requiredEnd: null };
        const base = nextWorkingDay(predEnd);
        const adjusted = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        return { requiredStart: adjusted, requiredEnd: null };
      }
      if (dtype === 'starttostart' || dtype === 'ss') {
        if (!predStart) return { requiredStart: null, requiredEnd: null };
        const base = ensureWorkingDay(new Date(predStart));
        const adjusted = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        return { requiredStart: adjusted, requiredEnd: null };
      }
      if (dtype === 'finishtofinish' || dtype === 'ff') {
        if (!predEnd) return { requiredStart: null, requiredEnd: null };
        const base = ensureWorkingDay(new Date(predEnd));
        const adjusted = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        return { requiredStart: null, requiredEnd: adjusted };
      }
      if (dtype === 'starttofinish' || dtype === 'sf') {
        if (!predStart) return { requiredStart: null, requiredEnd: null };
        const base = ensureWorkingDay(new Date(predStart));
        const adjusted = lag !== 0 ? ensureWorkingDay(addWorkingDays(base, lag)) : base;
        return { requiredStart: null, requiredEnd: adjusted };
      }
      return { requiredStart: null, requiredEnd: null };
    }

    const inDegree = new Map<number, number>();
    for (const id of allTaskIds) inDegree.set(id, 0);
    for (const dep of dependencies) {
      if (allTaskIds.has(dep.taskId) && allTaskIds.has(dep.dependsOnTaskId)) {
        inDegree.set(dep.taskId, (inDegree.get(dep.taskId) || 0) + 1);
      }
    }

    const topoOrder: number[] = [];
    const queue: number[] = [];
    const tempDegree = new Map(inDegree);
    for (const [id, deg] of tempDegree) {
      if (deg === 0) queue.push(id);
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      topoOrder.push(id);
      const succs = successorIds.get(id);
      if (succs) {
        for (const succId of succs) {
          const d = (tempDegree.get(succId) || 1) - 1;
          tempDegree.set(succId, d);
          if (d === 0) queue.push(succId);
        }
      }
    }

    for (const taskId of topoOrder) {
      const deps = predecessorDeps.get(taskId);
      if (!deps || deps.length === 0) continue;

      const successor = taskMap.get(taskId);
      if (!successor) continue;
      if (successor.isOngoing) continue;

      let maxRequiredStart: Date | null = null;
      let maxRequiredEnd: Date | null = null;

      for (const dep of deps) {
        const { requiredStart, requiredEnd } = getConstraintFromDep(dep);
        if (requiredStart && (!maxRequiredStart || requiredStart > maxRequiredStart)) {
          maxRequiredStart = requiredStart;
        }
        if (requiredEnd && (!maxRequiredEnd || requiredEnd > maxRequiredEnd)) {
          maxRequiredEnd = requiredEnd;
        }
      }

      const currentStart = successor.startDate ? new Date(successor.startDate + 'T00:00:00') : null;
      const currentEnd = successor.endDate ? new Date(successor.endDate + 'T00:00:00') : null;
      const parsedDuration = successor.durationDays == null ? NaN : Number(successor.durationDays);
      const duration = Number.isFinite(parsedDuration) ? parsedDuration : (currentStart && currentEnd ? calculateDuration(currentStart, currentEnd) : 1);

      let newStart: Date | null = null;
      let newEnd: Date | null = null;

      if (maxRequiredStart) {
        newStart = maxRequiredStart;
        newEnd = calculateEndDate(newStart, duration);
      }

      if (maxRequiredEnd) {
        const effectiveEnd = newEnd || currentEnd;
        if (!effectiveEnd || effectiveEnd.getTime() !== maxRequiredEnd.getTime()) {
          newEnd = maxRequiredEnd;
          if (!newStart) {
            newStart = addWorkingDays(newEnd, -(duration - 1));
            newStart = ensureWorkingDay(newStart);
          }
        }
      }

      if (newStart && newEnd) {
        if (newStart > newEnd) {
          newEnd = calculateEndDate(newStart, duration);
        }

        const newStartStr = formatDateStr(newStart);
        const newEndStr = formatDateStr(newEnd);

        if (newStartStr !== successor.startDate || newEndStr !== successor.endDate) {
          const updated = { ...successor, startDate: newStartStr, endDate: newEndStr };
          taskMap.set(taskId, updated);
          adjustedTasks.push({ taskId, newStartDate: newStartStr, newEndDate: newEndStr });
        }
      }
    }

    if (adjustedTasks.length > 0) {
      await storage.batchUpdateTaskFields(
        adjustedTasks.map(t => ({ id: t.taskId, startDate: t.newStartDate, endDate: t.newEndDate }))
      );
    }

    return adjustedTasks;
  }

  // Recalculate schedule - enforce all dependency date constraints
  app.post('/api/projects/:projectId/recalculate-schedule', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const adjustedTasks = await propagateScheduleForProject(projectId);
      await rollUpParentTasks(projectId);
      
      res.json({ 
        success: true, 
        adjustedCount: adjustedTasks.length,
        adjustedTasks
      });
    } catch (err) {
      console.error("Error recalculating schedule:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error recalculating schedule" : classified.message });
    }
  });

  // Reorder tasks (drag and drop) - updates taskIndex for all affected tasks
  app.post('/api/projects/:projectId/tasks/reorder', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const { taskId, newIndex, taskIds } = req.body as { taskId: number; newIndex: number; taskIds?: number[] };
      
      if (!taskId || newIndex === undefined) {
        return res.status(400).json({ message: "taskId and newIndex are required" });
      }
      
      const allTasks = await storage.getTasksByProject(projectId);
      const sortedTasks = [...allTasks].sort((a, b) => (a.taskIndex || 0) - (b.taskIndex || 0));
      
      const idsToMove = taskIds || [taskId];
      const idSet = new Set(idsToMove);
      
      const tasksToMove = idsToMove.map(id => sortedTasks.find(t => t.id === id)).filter(Boolean) as typeof sortedTasks;
      if (tasksToMove.length === 0) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      const tasksWithoutMoved = sortedTasks.filter(t => !idSet.has(t.id));
      
      const clampedIndex = Math.max(0, Math.min(newIndex, tasksWithoutMoved.length));
      tasksWithoutMoved.splice(clampedIndex, 0, ...tasksToMove);
      
      await db.transaction(async (tx) => {
        for (let i = 0; i < tasksWithoutMoved.length; i++) {
          const task = tasksWithoutMoved[i];
          if (task.taskIndex !== i + 1) {
            await tx.update(tasks).set({ taskIndex: i + 1 }).where(eq(tasks.id, task.id));
          }
        }
      });
      
      await recalculateProjectWBS(projectId);
      await rollUpParentTasks(projectId);
      
      res.json({ message: "Tasks reordered successfully" });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error reordering tasks" : classified.message });
    }
  });

  // Reindex tasks and recalculate WBS for a project
  app.post('/api/projects/:projectId/tasks/reindex', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      
      // Get all tasks for the project
      const allTasks = await storage.getTasks(projectId);
      
      // Sort by id (creation order) or existing taskIndex
      const sortedTasks = [...allTasks].sort((a, b) => {
        if (a.taskIndex && b.taskIndex) return a.taskIndex - b.taskIndex;
        return a.id - b.id;
      });
      
      // Assign sequential taskIndex
      for (let i = 0; i < sortedTasks.length; i++) {
        const task = sortedTasks[i];
        if (task.taskIndex !== i + 1) {
          await storage.updateTask(task.id, { taskIndex: i + 1 });
        }
      }
      
      // Recalculate WBS and roll up parent tasks
      await recalculateProjectWBS(projectId);
      await rollUpParentTasks(projectId);
      
      res.json({ message: "Tasks reindexed and WBS recalculated", count: sortedTasks.length });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error reindexing tasks" : classified.message });
    }
  });

  // Batch baseline update for tasks
  app.post('/api/projects/:projectId/tasks/baseline', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
      // Validate project exists
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const { taskIds, clearBaseline } = req.body as { taskIds?: number[]; clearBaseline?: boolean };
      
      // Get all tasks for the project
      const allTasks = await storage.getTasks(projectId);
      
      // Determine which tasks to update
      let tasksToUpdate = allTasks;
      if (taskIds && taskIds.length > 0) {
        tasksToUpdate = allTasks.filter(t => taskIds.includes(t.id));
      }
      
      // Update baseline dates for each task
      const updates = await Promise.all(
        tasksToUpdate.map(async (task) => {
          if (clearBaseline) {
            return storage.updateTask(task.id, {
              baselineStartDate: null,
              baselineEndDate: null,
            });
          } else {
            // Only set baseline if task has valid dates
            if (task.startDate && task.endDate) {
              return storage.updateTask(task.id, {
                baselineStartDate: task.startDate,
                baselineEndDate: task.endDate,
              });
            }
            return task;
          }
        })
      );
      
      res.json({ 
        message: clearBaseline ? "Baseline cleared" : "Baseline set",
        updatedCount: updates.length 
      });
    } catch (err) {
      console.error('Error updating baselines:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating baselines" : classified.message });
    }
  });

  // Project Financials
  app.get(api.projectFinancials.list.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const projectId = Number(req.params.projectId);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const financials = await storage.getProjectFinancials(projectId);
    res.json(financials);
  });

  app.get(api.projectFinancials.get.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const financial = await storage.getProjectFinancial(id);
      if (!financial) return res.status(404).json({ message: "Financial record not found" });
      res.json(financial);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching financial record" : classified.message });
    }
  });

  app.post(api.projectFinancials.create.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const input = api.projectFinancials.create.input.parse(req.body);
      const financial = await storage.createProjectFinancial({ ...input, projectId });
      res.status(201).json(financial);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating financial record" : classified.message });
    }
  });

  app.put(api.projectFinancials.update.path, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getProjectFinancial(id);
      if (!existing) return res.status(404).json({ message: "Financial record not found" });
      
      const updates = api.projectFinancials.update.input.parse(req.body);
      const updated = await storage.updateProjectFinancial(id, updates);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating financial record" : classified.message });
    }
  });

  app.delete(api.projectFinancials.delete.path, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const id = Number(req.params.id);
    const existing = await storage.getProjectFinancial(id);
    if (!existing) return res.status(404).json({ message: "Financial record not found" });
    await storage.deleteProjectFinancial(id);
    res.status(204).send();
  });

  // ==================== TASK CSV IMPORT ====================

  app.post('/api/projects/:id/import-csv', upload.single('file'), async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const parseResult = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
      });

      if (parseResult.errors.length > 0) {
        const criticalErrors = parseResult.errors.filter((e: any) => e.type !== 'FieldMismatch');
        if (criticalErrors.length > 0) {
          return res.status(400).json({ 
            message: "CSV parsing errors", 
            errors: criticalErrors.slice(0, 5).map((e: any) => `Row ${e.row}: ${e.message}`)
          });
        }
      }

      const rows = parseResult.data as Record<string, string>[];
      if (rows.length === 0) {
        return res.status(400).json({ message: "CSV file is empty or has no data rows" });
      }

      const existingTasks = await storage.getTasksByProject(projectId);
      const existingByWbs = new Map<string, typeof existingTasks[0]>();
      const existingByName = new Map<string, typeof existingTasks[0][]>();
      for (const t of existingTasks) {
        if (t.wbs) {
          existingByWbs.set(t.wbs.trim(), t);
        }
        if (t.name) {
          const key = t.name.toLowerCase().trim();
          if (!existingByName.has(key)) existingByName.set(key, []);
          existingByName.get(key)!.push(t);
        }
      }

      const matchedTaskIds = new Set<number>();

      const findExistingTask = (wbs: string, name: string): typeof existingTasks[0] | undefined => {
        if (wbs) {
          const byWbs = existingByWbs.get(wbs);
          if (byWbs && !matchedTaskIds.has(byWbs.id)) return byWbs;
        }
        const nameKey = name.toLowerCase().trim();
        const byName = existingByName.get(nameKey);
        if (byName) {
          const unmatched = byName.find(t => !matchedTaskIds.has(t.id));
          if (unmatched) return unmatched;
        }
        return undefined;
      };

      const isValidDate = (d: string) => d && !isNaN(new Date(d).getTime());

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        const name = (row['Name'] || '').trim();
        const type = (row['Type'] || '').trim();

        if (!name || type === 'Project') {
          skipped++;
          continue;
        }

        const startDate = (row['Start Date'] || '').trim();
        const endDate = (row['End Date'] || '').trim();
        const durationStr = (row['Duration (days)'] || '').trim();
        const progressStr = (row['% Complete'] || '').trim();
        const status = (row['Status'] || '').trim();
        const priority = (row['Priority'] || '').trim();
        const assignee = (row['Assigned To'] || '').trim();
        const description = (row['Description'] || '').trim();
        const wbs = (row['WBS'] || '').trim();

        const isMilestone = type === 'Milestone';
        const durationDays = durationStr ? parseFloat(durationStr) : undefined;
        const progress = progressStr ? parseInt(progressStr, 10) : undefined;

        const validStatuses = ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
        const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
        const taskStatus = validStatuses.includes(status) ? status : undefined;
        const taskPriority = validPriorities.includes(priority) ? priority : undefined;

        const existingTask = findExistingTask(wbs, name);

        if (existingTask) {
          matchedTaskIds.add(existingTask.id);
          const updates: Record<string, any> = {};
          if (description && description !== (existingTask.description || '')) updates.description = description;
          if (isValidDate(startDate) && startDate !== (existingTask.startDate || '')) updates.startDate = startDate;
          if (isValidDate(endDate) && endDate !== (existingTask.endDate || '')) updates.endDate = endDate;
          if (durationDays !== undefined && !isNaN(durationDays) && durationDays !== existingTask.durationDays) updates.durationDays = durationDays;
          if (progress !== undefined && !isNaN(progress) && progress !== existingTask.progress) updates.progress = progress;
          if (taskStatus && taskStatus !== existingTask.status) updates.status = taskStatus;
          if (taskPriority && taskPriority !== (existingTask.priority || '')) updates.priority = taskPriority;
          if (assignee && assignee !== (existingTask.assignee || '')) updates.assignee = assignee;
          if (isMilestone !== existingTask.isMilestone) updates.isMilestone = isMilestone;
          if (wbs && wbs !== (existingTask.wbs || '')) updates.wbs = wbs;
          if (name !== existingTask.name) updates.name = name;

          if (Object.keys(updates).length > 0) {
            await storage.updateTask(existingTask.id, updates);
            updated++;
          } else {
            skipped++;
          }
        } else {
          const today = new Date().toISOString().split('T')[0];
          const resolvedStartDate = isValidDate(startDate) ? startDate : today;
          const resolvedEndDate = isValidDate(endDate) ? endDate : (
            durationDays && isValidDate(startDate)
              ? new Date(new Date(startDate).getTime() + (durationDays - 1) * 86400000).toISOString().split('T')[0]
              : resolvedStartDate
          );

          const taskData: any = {
            projectId,
            name,
            startDate: resolvedStartDate,
            endDate: resolvedEndDate,
            isMilestone,
          };
          if (description) taskData.description = description;
          if (durationDays !== undefined && !isNaN(durationDays)) taskData.durationDays = durationDays;
          if (progress !== undefined && !isNaN(progress)) taskData.progress = progress;
          if (taskStatus) taskData.status = taskStatus;
          if (taskPriority) taskData.priority = taskPriority;
          if (assignee) taskData.assignee = assignee;
          if (wbs) taskData.wbs = wbs;

          await storage.createTask(taskData);
          created++;
        }
      }

      res.json({
        message: `Import complete: ${created} tasks created, ${updated} tasks updated, ${skipped} rows skipped`,
        created,
        updated,
        skipped,
      });
    } catch (err) {
      console.error('CSV import error:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error importing CSV" : classified.message });
    }
  });

}
