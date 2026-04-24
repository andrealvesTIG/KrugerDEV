import type { Express, Request as ExpressRequest } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import { issues, tasks, projects, portfolios } from "@shared/schema";
import type { User } from "@shared/models/auth";
import {
  classifyError,
  getUserIdFromRequest,
  getUserOrgIds,
  isTeamMemberInOrg,
  getTeamMemberProjectIds,
  getTeamMemberPortfolioIds,
  getTeamMemberRiskIds,
  getTeamMemberIssueIds,
  getTeamMemberTaskIds,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, qInt, authRes, stdRes, fullRes, createRes, e401 } from "../route-registry";

export function registerAnalyticsRoutes(app: Express) {

  async function getAnalyticsUserId(req: ExpressRequest): Promise<{ userId: string; organizationId?: number } | null> {
    const userId = getUserIdFromRequest(req);
    if (userId) {
      return { userId, organizationId: (req as any).bearerOrgId };
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.slice(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [email, apiKey] = credentials.split(':');
        
        if (email && apiKey) {
          const user = await storage.getUserByApiKey(apiKey);
          if (user && user.email === email) {
            return { userId: user.id };
          }
        }
      } catch (err) {
        console.error('Error parsing Basic auth:', err);
      }
    }
    
    return null;
  }

  apiRoute(app, 'get', '/api/user/api-key', {
    tag: 'User Account',
    summary: 'Get current user API key status',
    responses: { ...r200('API key info', ref('User')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ 
      hasApiKey: !!user.apiKey,
      apiKey: user.apiKey ? `${user.apiKey.slice(0, 8)}...` : null
    });
  });

  apiRoute(app, 'post', '/api/user/api-key/generate', {
    tag: 'User Account',
    summary: 'Generate new API key',
    responses: { ...r201('API key generated', { type: 'object', properties: { apiKey: { type: 'string' } } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const crypto = await import('crypto');
    const apiKey = crypto.randomBytes(32).toString('hex');
    
    await storage.updateUser(userId, { apiKey });
    
    const user = await storage.getUser(userId);
    
    res.status(201).json({ 
      success: true,
      apiKey,
      message: "API key generated. Use your email as username and this API key as password in Power BI Basic auth.",
      instructions: {
        username: user?.email,
        password: apiKey,
        authType: "Basic"
      }
    });
  });

  apiRoute(app, 'delete', '/api/user/api-key', {
    tag: 'User Account',
    summary: 'Revoke API key',
    responses: { ...r200('API key revoked', { type: 'object', properties: { message: { type: 'string' } } }), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    await storage.updateUser(userId, { apiKey: null });
    
    res.json({ success: true, message: "API key revoked" });
  });

  apiRoute(app, 'delete', '/api/user/account', {
    tag: 'User Account',
    summary: 'Delete own account',
    responses: { ...r200('Account deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      await storage.deleteUser(userId);

      if (req.session) {
        req.session.destroy((err: Error | null) => {
          if (err) {
            console.error('Error destroying session:', err);
          }
        });
      }

      res.json({ success: true, message: "Account deleted successfully" });
    } catch (err) {
      console.error('Error deleting account:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete account' : classified.message });
    }
  });

  async function resolveAnalyticsScope(req: ExpressRequest, res: any, emptyResult: any = []): Promise<{ userId: string; targetOrgIds: number[] } | null> {
    const authResult = await getAnalyticsUserId(req);
    if (!authResult) {
      res.status(401).json({ message: "Authentication required. Use Basic auth, Bearer token, or session." });
      return null;
    }

    const { userId, organizationId: bearerOrgId } = authResult;
    const queryOrgId = req.query.organizationId ? Number(req.query.organizationId) : null;

    if (bearerOrgId) {
      if (queryOrgId && queryOrgId !== bearerOrgId) {
        res.status(403).json({ message: "Bearer token is scoped to a specific organization. Cannot override with organizationId parameter." });
        return null;
      }
      return { userId, targetOrgIds: [bearerOrgId] };
    }

    const accessibleOrgIds = await getUserOrgIds(userId);

    if (accessibleOrgIds.length === 0) {
      res.json(emptyResult);
      return null;
    }

    if (queryOrgId && !accessibleOrgIds.includes(queryOrgId)) {
      res.status(403).json({ message: "Access denied to this organization" });
      return null;
    }

    const targetOrgIds = queryOrgId ? [queryOrgId] : accessibleOrgIds;
    return { userId, targetOrgIds };
  }

  apiRoute(app, 'post', '/api/organizations/:orgId/api-tokens', {
    tag: 'API Tokens',
    summary: 'Generate a new Bearer token for the Analytics API',
    parameters: [pathId('orgId')],
    requestBody: body({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional label for the token (e.g., "Power BI Production")' },
        expiresAt: { type: 'string', format: 'date-time', description: 'Optional expiration date' },
      },
    }, false),
    responses: {
      ...r201('Token created', {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          token: { type: 'string', description: 'Full token value (shown only once)' },
          name: { type: 'string' },
          organizationId: { type: 'integer' },
          expiresAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      }),
      ...createRes,
    },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const crypto = await import('crypto');
      const tokenValue = crypto.randomBytes(32).toString('hex');

      const { name, expiresAt } = req.body || {};
      const token = await storage.createApiToken({
        token: tokenValue,
        userId,
        organizationId: orgId,
        name: name || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      res.json({
        id: token.id,
        token: tokenValue,
        name: token.name,
        organizationId: token.organizationId,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:orgId/api-tokens', {
    tag: 'API Tokens',
    summary: 'List Bearer tokens for the current user in this organization',
    parameters: [pathId('orgId')],
    responses: {
      ...r200('List of tokens (masked)', {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            token: { type: 'string', description: 'Masked token value' },
            organizationId: { type: 'integer' },
            lastUsedAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      }),
      ...stdRes,
    },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const tokens = await storage.getApiTokensByUserAndOrg(userId, orgId);
      const masked = tokens.map(t => ({
        id: t.id,
        name: t.name,
        token: t.token.slice(0, 8) + '••••••••',
        organizationId: t.organizationId,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
      }));

      res.json(masked);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:orgId/api-tokens/:tokenId', {
    tag: 'API Tokens',
    summary: 'Revoke a Bearer token',
    parameters: [pathId('orgId'), pathId('tokenId')],
    responses: { ...r200('Token revoked', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const orgId = Number(req.params.orgId);
      const tokenId = Number(req.params.tokenId);

      const tokens = await storage.getApiTokensByUserAndOrg(userId, orgId);
      const token = tokens.find(t => t.id === tokenId);
      if (!token) {
        return res.status(404).json({ message: "Token not found" });
      }

      if (token.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this token" });
      }

      await storage.deleteApiToken(tokenId);
      res.json({ message: "Token revoked" });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  apiRoute(app, 'get', '/api/analytics/projects', {
    tag: 'Analytics',
    summary: 'Get projects data for Power BI',
    security: [{ basicAuth: [] }, { bearerAuth: [] }],
    parameters: [qInt('organizationId', false, 'Organization ID (optional with Bearer token)')],
    responses: { ...r200('Projects analytics data', arrOf('Project')), ...e401 },
  }, async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;
      
      const { userId } = scope;
      const allProjects: any[] = [];
      for (const orgId of targetOrgIds) {
        let orgProjects = await storage.getProjects(orgId);
        const portfolios = await storage.getPortfolios(orgId);
        const org = await storage.getOrganization(orgId);

        const isTeamMember = await isTeamMemberInOrg(userId, orgId);
        let allowedTaskIdsForProj: Set<number> | null = null;
        let allowedRiskIdsForProj: Set<number> | null = null;
        let allowedIssueIdsForProj: Set<number> | null = null;

        if (isTeamMember) {
          const allowedIds = new Set(await getTeamMemberProjectIds(userId, orgId));
          orgProjects = orgProjects.filter(p => allowedIds.has(p.id));
          allowedTaskIdsForProj = new Set(await getTeamMemberTaskIds(userId, orgId));
          allowedRiskIdsForProj = new Set(await getTeamMemberRiskIds(userId, orgId));
          allowedIssueIdsForProj = new Set(await getTeamMemberIssueIds(userId, orgId));
        }

        for (const project of orgProjects) {
          const portfolio = portfolios.find(p => p.id === project.portfolioId);
          let tasks = await storage.getTasks(project.id);
          let risks = await storage.getRisks(project.id);
          let issues = await storage.getIssues(project.id);
          const milestones = await storage.getMilestones(project.id);

          if (allowedTaskIdsForProj) tasks = tasks.filter(t => allowedTaskIdsForProj!.has(t.id));
          if (allowedRiskIdsForProj) risks = risks.filter(r => allowedRiskIdsForProj!.has(r.id));
          if (allowedIssueIdsForProj) issues = issues.filter(i => allowedIssueIdsForProj!.has(i.id));
          
          allProjects.push({
            projectId: project.id,
            projectName: project.name,
            description: project.description,
            status: project.status,
            health: project.health,
            completionPercentage: project.completionPercentage || 0,
            budget: Number(project.budget) || 0,
            startDate: project.startDate,
            endDate: project.endDate,
            projectManager: project.managerId,
            portfolioId: project.portfolioId,
            portfolioName: portfolio?.name || null,
            organizationId: orgId,
            organizationName: org?.name || null,
            taskCount: tasks.length,
            completedTaskCount: tasks.filter(t => t.status === 'Completed').length,
            riskCount: risks.length,
            openRiskCount: risks.filter(r => r.status === 'Open').length,
            highRiskCount: risks.filter(r => r.probability === 'High' || r.impact === 'High').length,
            issueCount: issues.length,
            openIssueCount: issues.filter(i => i.status === 'Open').length,
            milestoneCount: milestones.length,
            completedMilestoneCount: milestones.filter(m => m.completed).length,
            source: project.source || 'manual',
            createdAt: project.createdAt,
          });
        }
      }

      res.json(allProjects);
    } catch (err) {
      console.error("Error fetching analytics projects:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/analytics/portfolios', {
    tag: 'Analytics',
    summary: 'Get portfolios data for Power BI',
    security: [{ basicAuth: [] }, { bearerAuth: [] }],
    parameters: [qInt('organizationId', false, 'Organization ID (optional with Bearer token)')],
    responses: { ...r200('Portfolios analytics data', arrOf('Portfolio')), ...e401 },
  }, async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;
      
      const { userId } = scope;
      const allPortfolios: any[] = [];
      for (const orgId of targetOrgIds) {
        let orgPortfolios = await storage.getPortfolios(orgId);
        let projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);

        if (await isTeamMemberInOrg(userId, orgId)) {
          const allowedPortIds = new Set(await getTeamMemberPortfolioIds(userId, orgId));
          orgPortfolios = orgPortfolios.filter(p => allowedPortIds.has(p.id));
          const allowedProjIds = new Set(await getTeamMemberProjectIds(userId, orgId));
          projects = projects.filter(p => allowedProjIds.has(p.id));
        }
        
        for (const portfolio of orgPortfolios) {
          const portfolioProjects = projects.filter(p => p.portfolioId === portfolio.id);
          const totalBudget = portfolioProjects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
          const avgCompletion = portfolioProjects.length > 0 
            ? Math.round(portfolioProjects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / portfolioProjects.length)
            : 0;
          
          allPortfolios.push({
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            description: portfolio.description,
            strategy: portfolio.strategy,
            organizationId: orgId,
            organizationName: org?.name || null,
            projectCount: portfolioProjects.length,
            healthyProjectCount: portfolioProjects.filter(p => p.health === 'Green').length,
            atRiskProjectCount: portfolioProjects.filter(p => p.health === 'Yellow').length,
            criticalProjectCount: portfolioProjects.filter(p => p.health === 'Red').length,
            totalBudget,
            avgCompletion,
            createdAt: portfolio.createdAt,
          });
        }
      }

      res.json(allPortfolios);
    } catch (err) {
      console.error("Error fetching analytics portfolios:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/analytics/risks', {
    tag: 'Analytics',
    summary: 'Get risks data for Power BI',
    security: [{ basicAuth: [] }, { bearerAuth: [] }],
    parameters: [qInt('organizationId', false, 'Organization ID (optional with Bearer token)')],
    responses: { ...r200('Risks analytics data', arrOf('Risk')), ...e401 },
  }, async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;
      
      const { userId } = scope;
      const allRisks: any[] = [];
      for (const orgId of targetOrgIds) {
        let orgProjects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);
        const isTeamMember = await isTeamMemberInOrg(userId, orgId);
        let allowedRiskIds: Set<number> | null = null;

        if (isTeamMember) {
          const allowedIds = new Set(await getTeamMemberProjectIds(userId, orgId));
          orgProjects = orgProjects.filter(p => allowedIds.has(p.id));
          allowedRiskIds = new Set(await getTeamMemberRiskIds(userId, orgId));
        }
        
        for (const project of orgProjects) {
          const risks = await storage.getRisks(project.id);
          
          for (const risk of risks) {
            if (allowedRiskIds && !allowedRiskIds.has(risk.id)) continue;
            allRisks.push({
              riskId: risk.id,
              title: risk.title,
              description: risk.description,
              probability: risk.probability,
              impact: risk.impact,
              status: risk.status,
              mitigationPlan: risk.mitigationPlan,
              owner: risk.ownerId,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
              createdAt: risk.createdAt,
            });
          }
        }
      }

      res.json(allRisks);
    } catch (err) {
      console.error("Error fetching analytics risks:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/analytics/issues', {
    tag: 'Analytics',
    summary: 'Get issues data for Power BI',
    security: [{ basicAuth: [] }, { bearerAuth: [] }],
    parameters: [qInt('organizationId', false, 'Organization ID (optional with Bearer token)')],
    responses: { ...r200('Issues analytics data', arrOf('Issue')), ...e401 },
  }, async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;
      
      const { userId } = scope;
      const allIssues: any[] = [];
      for (const orgId of targetOrgIds) {
        let orgProjects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);
        const isTeamMember = await isTeamMemberInOrg(userId, orgId);
        let allowedIssueIds: Set<number> | null = null;

        if (isTeamMember) {
          const allowedIds = new Set(await getTeamMemberProjectIds(userId, orgId));
          orgProjects = orgProjects.filter(p => allowedIds.has(p.id));
          allowedIssueIds = new Set(await getTeamMemberIssueIds(userId, orgId));
        }
        
        for (const project of orgProjects) {
          const issues = await storage.getIssues(project.id);
          
          for (const issue of issues) {
            if (allowedIssueIds && !allowedIssueIds.has(issue.id)) continue;
            allIssues.push({
              issueId: issue.id,
              title: issue.title,
              description: issue.description,
              type: issue.type,
              priority: issue.priority,
              status: issue.status,
              assignee: issue.assignee,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
              createdAt: issue.createdAt,
            });
          }
        }
      }

      res.json(allIssues);
    } catch (err) {
      console.error("Error fetching analytics issues:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/analytics/milestones', {
    tag: 'Analytics',
    summary: 'Get task milestones data for Power BI (legacy)',
    security: [{ basicAuth: [] }, { bearerAuth: [] }],
    parameters: [qInt('organizationId', false, 'Organization ID (optional with Bearer token)')],
    responses: { ...r200('Task milestones analytics data', arrOf('Milestone')), ...e401 },
    deprecated: true,
    description: 'Legacy endpoint returning task milestones. For portfolio key dates, use the /portfolios/{id}/key-dates endpoints.',
  }, async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;
      
      const { userId } = scope;
      const allMilestones: any[] = [];
      for (const orgId of targetOrgIds) {
        let orgProjects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);

        if (await isTeamMemberInOrg(userId, orgId)) {
          const allowedIds = new Set(await getTeamMemberProjectIds(userId, orgId));
          orgProjects = orgProjects.filter(p => allowedIds.has(p.id));
        }
        
        for (const project of orgProjects) {
          const milestones = await storage.getMilestones(project.id);
          
          for (const milestone of milestones) {
            allMilestones.push({
              milestoneId: milestone.id,
              title: milestone.title,
              description: milestone.description,
              dueDate: milestone.dueDate,
              completed: milestone.completed,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
            });
          }
        }
      }

      res.json(allMilestones);
    } catch (err) {
      console.error("Error fetching analytics milestones:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/analytics/intakes', {
    tag: 'Analytics',
    summary: 'Get intakes data for Power BI',
    security: [{ basicAuth: [] }, { bearerAuth: [] }],
    parameters: [qInt('organizationId', false, 'Organization ID (optional with Bearer token)')],
    responses: { ...r200('Intakes analytics data', arrOf('ProjectIntake')), ...e401 },
  }, async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;
      
      const { userId } = scope;

      const allIntakes: any[] = [];
      for (const orgId of targetOrgIds) {
        if (userId && await isTeamMemberInOrg(userId, orgId)) {
          continue;
        }

        const intakes = await storage.getProjectIntakes(orgId);
        const org = await storage.getOrganization(orgId);
        
        for (const intake of intakes) {
          allIntakes.push({
            intakeId: intake.id,
            projectName: intake.projectName,
            description: intake.description,
            status: intake.status,
            currentStep: intake.currentStep,
            businessUnit: intake.businessUnit,
            programName: intake.programName,
            fundingSource: intake.fundingSource,
            estimatedBudget: intake.estimatedBudget,
            strategicAlignment: (intake as any).strategicAlignment,
            organizationId: orgId,
            organizationName: org?.name || null,
            submitterId: intake.submitterId,
            createdAt: intake.createdAt,
          });
        }
      }

      res.json(allIntakes);
    } catch (err) {
      console.error("Error fetching analytics intakes:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/analytics/summary', {
    tag: 'Analytics',
    summary: 'Get summary analytics for Power BI',
    security: [{ basicAuth: [] }, { bearerAuth: [] }],
    parameters: [qInt('organizationId', false, 'Organization ID (optional with Bearer token)')],
    responses: { ...r200('Summary analytics', { type: 'object' }), ...e401 },
  }, async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res, { organizations: [] });
      if (!scope) return;
      const { targetOrgIds } = scope;
      
      const { userId } = scope;
      const summaries: any[] = [];
      for (const orgId of targetOrgIds) {
        const org = await storage.getOrganization(orgId);
        let projects = await storage.getProjects(orgId);
        let orgPortfolios = await storage.getPortfolios(orgId);

        const isTeamMember = await isTeamMemberInOrg(userId, orgId);
        let allowedRiskIds: Set<number> | null = null;
        let allowedIssueIds: Set<number> | null = null;
        let allowedTaskIds: Set<number> | null = null;

        if (isTeamMember) {
          const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, orgId));
          projects = projects.filter(p => allowedProjectIds.has(p.id));
          const allowedPortfolioIds = new Set(await getTeamMemberPortfolioIds(userId, orgId));
          orgPortfolios = orgPortfolios.filter(p => allowedPortfolioIds.has(p.id));
          allowedRiskIds = new Set(await getTeamMemberRiskIds(userId, orgId));
          allowedIssueIds = new Set(await getTeamMemberIssueIds(userId, orgId));
          allowedTaskIds = new Set(await getTeamMemberTaskIds(userId, orgId));
        }

        const portfolios = orgPortfolios;
        const intakes = isTeamMember ? [] : await storage.getProjectIntakes(orgId);
        
        let totalRisks = 0, openRisks = 0, highRisks = 0;
        let totalIssues = 0, openIssues = 0;
        let totalMilestones = 0, completedMilestones = 0;
        let totalTasks = 0, completedTasks = 0;
        
        for (const project of projects) {
          let risks = await storage.getRisks(project.id);
          let issues = await storage.getIssues(project.id);
          const milestones = await storage.getMilestones(project.id);
          let tasks = await storage.getTasks(project.id);

          if (allowedRiskIds) risks = risks.filter(r => allowedRiskIds!.has(r.id));
          if (allowedIssueIds) issues = issues.filter(i => allowedIssueIds!.has(i.id));
          if (allowedTaskIds) tasks = tasks.filter(t => allowedTaskIds!.has(t.id));
          
          totalRisks += risks.length;
          openRisks += risks.filter(r => r.status === 'Open').length;
          highRisks += risks.filter(r => r.probability === 'High' || r.impact === 'High').length;
          totalIssues += issues.length;
          openIssues += issues.filter(i => i.status === 'Open').length;
          totalMilestones += milestones.length;
          completedMilestones += milestones.filter(m => m.completed).length;
          totalTasks += tasks.length;
          completedTasks += tasks.filter(t => t.status === 'Completed').length;
        }
        
        const totalBudget = projects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
        const avgCompletion = projects.length > 0 
          ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length)
          : 0;
        
        summaries.push({
          organizationId: orgId,
          organizationName: org?.name || null,
          portfolioCount: portfolios.length,
          projectCount: projects.length,
          healthyProjectCount: projects.filter(p => p.health === 'Green').length,
          atRiskProjectCount: projects.filter(p => p.health === 'Yellow').length,
          criticalProjectCount: projects.filter(p => p.health === 'Red').length,
          totalBudget,
          avgCompletion,
          totalRisks,
          openRisks,
          highRisks,
          totalIssues,
          openIssues,
          totalMilestones,
          completedMilestones,
          totalTasks,
          completedTasks,
          intakeCount: intakes.length,
          pendingIntakes: intakes.filter(i => i.status === 'draft' || i.status === 'in_progress').length,
          approvedIntakes: intakes.filter(i => i.status === 'approved').length,
          rejectedIntakes: intakes.filter(i => i.status === 'rejected').length,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({ organizations: summaries });
    } catch (err) {
      console.error("Error fetching analytics summary:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

}
