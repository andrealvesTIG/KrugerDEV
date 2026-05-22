import type { Express } from "express";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { z } from "zod";
import { issues, projects, portfolios, insertPortfolioKeyDateSchema, updatePortfolioKeyDateSchema } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  getUserOrgIds,
  userHasAnyOrgAccess,
  requireEmailVerified,
  getTeamMemberPortfolioIds,
  logUserActivity,
  formatZodErrors,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";
import { invalidateOrganizationContextCache } from "../services/jarvisService";

export function registerPortfolioRoutes(app: Express) {
  // --- Portfolios ---
  apiRoute(app, 'get', '/api/portfolios', {
    tag: 'Portfolios',
    summary: 'List portfolios',
    parameters: [qInt('organizationId', false, 'Filter by organization')],
    responses: { ...r200('List of portfolios', arrOf('Portfolio')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      return res.json([]);
    }
    
    const requestedOrgId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
    
    // Get user's accessible org IDs
    const accessibleOrgIds = await getUserOrgIds(userId);
    
    // If requesting a specific org, check access
    if (requestedOrgId && !accessibleOrgIds.includes(requestedOrgId)) {
      return res.json([]); // Return empty if no access
    }
    
    const portfolios = await storage.getPortfolios(requestedOrgId);
    
    // Filter portfolios to only those in accessible orgs
    let filteredPortfolios = portfolios.filter(p => 
      p.organizationId !== null && accessibleOrgIds.includes(p.organizationId)
    );
    
    // For team_member role, further filter to only portfolios they created or are assigned to
    if (userId) {
      const userMemberships = await storage.getUserOrganizations(userId);
      
      for (const membership of userMemberships) {
        if (membership.role === 'team_member') {
          const teamMemberPortfolioIds = await getTeamMemberPortfolioIds(userId, membership.organizationId);
          filteredPortfolios = filteredPortfolios.filter(p => 
            // Keep portfolios not in this org, or portfolios team member has access to
            p.organizationId !== membership.organizationId || 
            teamMemberPortfolioIds.includes(p.id)
          );
        }
      }
    }
    
    res.json(filteredPortfolios);
  });

  apiRoute(app, 'get', '/api/portfolios/:id', {
    tag: 'Portfolios',
    summary: 'Get portfolio by ID',
    parameters: [pathId()],
    responses: { ...r200('Portfolio details', ref('Portfolio')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const portfolio = await storage.getPortfolio(Number(req.params.id));
      if (!portfolio) {
        return res.status(404).json({ message: 'Portfolio not found' });
      }

      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      res.json(portfolio);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error fetching portfolio' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/portfolios', {
    tag: 'Portfolios',
    summary: 'Create a new portfolio',
    requestBody: body(ref('PortfolioRequest')),
    responses: { ...r201('Portfolio created', ref('Portfolio')), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const input = api.portfolios.create.input.parse(req.body);
      
      // Check portfolio limit before creation (using org subscription if available)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PORTFOLIOS, 1, input.organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Portfolio limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "portfolios"
          });
        }
      }
      
      if (!input.name || !input.name.trim()) {
        return res.status(400).json({ message: "Portfolio name is required" });
      }
      
      const trimmedName = input.name.trim();
      if (input.organizationId) {
        const existing = await storage.getPortfolios(input.organizationId);
        const duplicate = existing.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
        if (duplicate) {
          return res.status(400).json({ message: "A portfolio with this name already exists in this organization" });
        }
      }
      
      const portfolioData = {
        ...input,
        name: trimmedName,
        createdBy: userId || undefined,
      };
      
      const portfolio = await storage.createPortfolio(portfolioData);
      
      if (userId) {
        logUserActivity(userId, 'create_portfolio', 'portfolio', portfolio.id, { name: portfolio.name, organizationId: portfolio.organizationId }, req);
      }
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.PORTFOLIOS, portfolio.id, 1, portfolio.organizationId);
      }
      
      invalidateOrganizationContextCache(portfolio.organizationId);
      res.status(201).json(portfolio);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      throw err;
    }
  });

  apiRoute(app, 'put', '/api/portfolios/:id', {
    tag: 'Portfolios',
    summary: 'Update portfolio',
    parameters: [pathId()],
    requestBody: body(ref('PortfolioRequest'), false),
    responses: { ...r200('Portfolio updated', ref('Portfolio')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const input = api.portfolios.update.input.parse(req.body);
      const portfolioId = Number(req.params.id);
      
      const currentPortfolio = await storage.getPortfolio(portfolioId);
      if (!currentPortfolio) return res.status(404).json({ message: "Portfolio not found" });
      if (!await userHasOrgAccess(userId, currentPortfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      if (input.name) {
        const trimmedName = input.name.trim();
        if (currentPortfolio && currentPortfolio.organizationId) {
          const existing = await storage.getPortfolios(currentPortfolio.organizationId);
          const duplicate = existing.find(p => p.id !== portfolioId && p.name.toLowerCase() === trimmedName.toLowerCase());
          if (duplicate) {
            return res.status(400).json({ message: "A portfolio with this name already exists in this organization" });
          }
        }
        input.name = trimmedName;
      }
      
      const updated = await storage.updatePortfolio(portfolioId, input);
      invalidateOrganizationContextCache(currentPortfolio.organizationId);
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Internal server error" : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/portfolios/:id', {
    tag: 'Portfolios',
    summary: 'Delete portfolio',
    parameters: [pathId()],
    responses: { ...r204('Portfolio deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: "Portfolio not found" });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.softDeleteItem('portfolio', portfolioId, userId);
      invalidateOrganizationContextCache(portfolio.organizationId);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting portfolio" : classified.message });
    }
  });

  // --- Portfolio Aggregations ---
  apiRoute(app, 'get', '/api/portfolios/:id/projects', {
    tag: 'Portfolios',
    summary: 'List projects in portfolio',
    parameters: [pathId()],
    responses: { ...r200('Portfolio projects', arrOf('Project')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const projects = await storage.getPortfolioProjects(portfolioId);
      res.json(projects);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio projects' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/portfolios/:id/custom-projects', {
    tag: 'Portfolios',
    summary: 'Add custom project to portfolio',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { projectId: { type: 'integer' } } }),
    responses: { ...r201('Project added to portfolio', { type: 'object', properties: { message: { type: 'string' } } }), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!portfolio.isCustom) return res.status(400).json({ message: 'Portfolio is not a custom portfolio' });
      const hasAccess = await userHasOrgAccess(userId, portfolio.organizationId);
      if (!hasAccess) return res.status(403).json({ message: 'Not authorized for this organization' });
      const { projectId } = req.body;
      if (!projectId) return res.status(400).json({ message: 'projectId is required' });
      const project = await storage.getProject(projectId);
      if (!project || project.organizationId !== portfolio.organizationId) {
        return res.status(400).json({ message: 'Project not found or belongs to a different organization' });
      }
      await storage.addProjectToCustomPortfolio(portfolioId, projectId, userId);
      res.status(201).json({ success: true, portfolioId, projectId });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to add project to custom portfolio' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/portfolios/:id/custom-projects/:projectId', {
    tag: 'Portfolios',
    summary: 'Remove custom project from portfolio',
    parameters: [pathId(), pathId('projectId')],
    responses: { ...r200('Project removed', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!portfolio.isCustom) return res.status(400).json({ message: 'Portfolio is not a custom portfolio' });
      const hasAccess = await userHasOrgAccess(userId, portfolio.organizationId);
      if (!hasAccess) return res.status(403).json({ message: 'Not authorized for this organization' });
      await storage.removeProjectFromCustomPortfolio(portfolioId, Number(req.params.projectId));
      res.json({ success: true });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to remove project from custom portfolio' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/financial-entries', {
    tag: 'Portfolios',
    summary: 'List financial entries for all projects in portfolio',
    parameters: [pathId(), qInt('fiscalYear', false, 'Fiscal year to filter by')],
    responses: { ...r200('Portfolio financial entries', arrOf('FinancialEntry')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      const entries = await storage.getPortfolioFinancialEntries(portfolioId, fiscalYear);
      res.json(entries);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio financial entries' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/risks', {
    tag: 'Portfolios',
    summary: 'List risks across portfolio projects',
    parameters: [pathId()],
    responses: { ...r200('Portfolio risks', arrOf('Risk')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const risks = await storage.getPortfolioRisks(portfolioId);
      res.json(risks);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio risks' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/issues', {
    tag: 'Portfolios',
    summary: 'List issues across portfolio projects',
    parameters: [pathId()],
    responses: { ...r200('Portfolio issues', arrOf('Issue')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const issues = await storage.getPortfolioIssues(portfolioId);
      res.json(issues);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio issues' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/milestones', {
    tag: 'Portfolios',
    summary: 'List task milestones across portfolio projects (legacy)',
    parameters: [pathId()],
    responses: { ...r200('Task milestones from projects in this portfolio', arrOf('Milestone')), ...idRes },
    deprecated: true,
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const milestones = await storage.getPortfolioMilestones(portfolioId);
      res.json(milestones);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio key dates' : classified.message });
    }
  });

  // --- Portfolio Key Dates (new table) ---
  apiRoute(app, 'get', '/api/portfolios/:id/key-dates', {
    tag: 'Portfolio Key Dates',
    summary: 'List portfolio key dates',
    parameters: [pathId()],
    responses: { ...r200('Portfolio key dates', arrOf('PortfolioKeyDate')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const keyDates = await storage.getPortfolioKeyDates(portfolioId);
      res.json(keyDates);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio key dates' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/portfolios/:id/key-dates', {
    tag: 'Portfolio Key Dates',
    summary: 'Create a portfolio key date',
    parameters: [pathId()],
    requestBody: body(ref('PortfolioKeyDateRequest')),
    responses: { ...r201('Key date created', ref('PortfolioKeyDate')), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const parsed = insertPortfolioKeyDateSchema.safeParse({
        ...req.body,
        portfolioId,
        organizationId: portfolio.organizationId,
        createdBy: userId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid key date data', errors: formatZodErrors(parsed.error) });
      }
      const keyDate = await storage.createPortfolioKeyDate(parsed.data);
      logUserActivity(userId, 'portfolio_key_date_created', 'portfolio_key_date', keyDate.id, { portfolioId });
      invalidateOrganizationContextCache(portfolio.organizationId);
      res.status(201).json(keyDate);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create portfolio key date' : classified.message });
    }
  });

  apiRoute(app, 'patch', '/api/portfolios/:id/key-dates/:keyDateId', {
    tag: 'Portfolio Key Dates',
    summary: 'Update a portfolio key date',
    parameters: [pathId(), pathId('keyDateId')],
    requestBody: body(ref('PortfolioKeyDateRequest'), false),
    responses: { ...r200('Key date updated', ref('PortfolioKeyDate')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      const portfolioId = Number(req.params.id);
      const keyDateId = Number(req.params.keyDateId);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const existing = await storage.getPortfolioKeyDate(keyDateId);
      if (!existing || existing.portfolioId !== portfolioId) {
        return res.status(404).json({ message: 'Key date not found' });
      }
      const parsed = updatePortfolioKeyDateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid key date data', errors: formatZodErrors(parsed.error) });
      }
      const updated = await storage.updatePortfolioKeyDate(keyDateId, parsed.data);
      logUserActivity(userId, 'portfolio_key_date_updated', 'portfolio_key_date', keyDateId, { portfolioId });
      invalidateOrganizationContextCache(portfolio.organizationId);
      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update portfolio key date' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/portfolios/:id/key-dates/:keyDateId', {
    tag: 'Portfolio Key Dates',
    summary: 'Delete a portfolio key date',
    parameters: [pathId(), pathId('keyDateId')],
    responses: { ...r204('Key date deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      const portfolioId = Number(req.params.id);
      const keyDateId = Number(req.params.keyDateId);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const existing = await storage.getPortfolioKeyDate(keyDateId);
      if (!existing || existing.portfolioId !== portfolioId) {
        return res.status(404).json({ message: 'Key date not found' });
      }
      await storage.deletePortfolioKeyDate(keyDateId, userId);
      logUserActivity(userId, 'portfolio_key_date_deleted', 'portfolio_key_date', keyDateId, { portfolioId });
      invalidateOrganizationContextCache(portfolio.organizationId);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete portfolio key date' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/portfolios/:id/risk-assessment', {
    tag: 'Portfolios',
    summary: 'Run AI risk assessment for portfolio',
    parameters: [pathId()],
    responses: { ...r201('Risk assessment created', ref('RiskAssessment')), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: "Portfolio not found" });

      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs.find(m => m.organizationId === portfolio.organizationId)) {
        return res.status(403).json({ message: "You are not a member of this organization. Please ask an admin to invite you." });
      }

      const orgForConfig = await storage.getOrganization(portfolio.organizationId);
      const { DEFAULT_RISK_ASSESSMENT_CONFIG: DEFAULTS } = await import('@shared/schema');
      const riskConfig = { ...DEFAULTS, ...(orgForConfig?.riskAssessmentConfig || {}) };

      const forceRecalculate = req.body?.force === true;
      const existing = await storage.getLatestPortfolioRiskAssessment(portfolioId);
      if (existing && !forceRecalculate) {
        const ageInDays = (Date.now() - new Date(existing.generatedAt!).getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays < riskConfig.cacheDays) {
          const cachedReport = JSON.parse(existing.reportJson);
          return res.json({
            success: true,
            cached: true,
            assessment: {
              id: existing.id,
              riskScore: existing.riskScore,
              summary: existing.summary,
              shareToken: existing.shareToken,
              generatedAt: existing.generatedAt,
              report: cachedReport,
            },
          });
        }
      }

      // AI credit enforcement + recording happens inside
      // `generatePortfolioRiskAssessment` via `withAiCredits`. Don't
      // double-charge here.
      const { generatePortfolioRiskAssessment } = await import("../services/portfolioRiskAssessment");
      let report;
      try {
        report = await generatePortfolioRiskAssessment(portfolioId, portfolio.organizationId, userId);
      } catch (limitErr) {
        const { sendLimitExceeded } = await import("../services/aiCredits");
        if (sendLimitExceeded(res, limitErr)) return;
        throw limitErr;
      }

      const crypto = await import("crypto");
      const shareToken = crypto.randomBytes(32).toString('hex');

      const assessment = await storage.createPortfolioRiskAssessment({
        portfolioId,
        organizationId: portfolio.organizationId,
        riskScore: report.riskScore,
        summary: report.summary,
        reportJson: JSON.stringify(report),
        shareToken,
        generatedBy: userId,
        generatedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        cached: false,
        assessment: {
          id: assessment.id,
          riskScore: assessment.riskScore,
          summary: assessment.summary,
          shareToken: assessment.shareToken,
          generatedAt: assessment.generatedAt,
          report,
        },
      });
    } catch (err) {
      console.error("Error generating portfolio risk assessment:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate risk assessment" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/risk-assessment/latest', {
    tag: 'Portfolios',
    summary: 'Get latest portfolio risk assessment',
    parameters: [pathId()],
    responses: { ...r200('Latest assessment', ref('RiskAssessment')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: "Portfolio not found" });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const assessment = await storage.getLatestPortfolioRiskAssessment(portfolioId);
      if (!assessment) return res.json(null);

      const report = JSON.parse(assessment.reportJson);
      res.json({
        id: assessment.id,
        riskScore: assessment.riskScore,
        summary: assessment.summary,
        shareToken: assessment.shareToken,
        generatedAt: assessment.generatedAt,
        report,
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to get risk assessment" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/risk-assessment/history', {
    tag: 'Portfolios',
    summary: 'Get portfolio risk assessment history',
    parameters: [pathId()],
    responses: { ...r200('Assessment history', arrOf('RiskAssessment')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: "Portfolio not found" });

      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs.find(m => m.organizationId === portfolio.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const history = await storage.getPortfolioRiskAssessmentHistory(portfolioId);
      res.json(history);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to get risk assessment history" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolio-risk-assessments/org/:orgId', {
    tag: 'Portfolios',
    summary: 'Get all portfolio risk assessments for org',
    parameters: [pathId('orgId')],
    responses: { ...r200('Org portfolio assessments', { type: 'array', items: ref('RiskAssessment') }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const orgId = Number(req.params.orgId);
      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs.find(m => m.organizationId === orgId)) {
        return res.status(403).json({ message: "You are not a member of this organization. Please ask an admin to invite you." });
      }

      const assessments = await storage.getLatestRiskAssessmentsForOrg(orgId);
      const uniqueByPortfolio = new Map<number, typeof assessments[0]>();
      for (const a of assessments) {
        if (!uniqueByPortfolio.has(a.portfolioId)) {
          uniqueByPortfolio.set(a.portfolioId, a);
        }
      }
      res.json(Array.from(uniqueByPortfolio.values()).map(a => ({
        portfolioId: a.portfolioId,
        riskScore: a.riskScore,
        summary: a.summary,
        generatedAt: a.generatedAt,
      })));
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to get risk assessments" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/project-risk-assessments/org/:orgId', {
    tag: 'Portfolios',
    summary: 'Get all project risk assessments for org',
    parameters: [pathId('orgId')],
    responses: { ...r200('Org project assessments', { type: 'array', items: ref('RiskAssessment') }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const orgId = Number(req.params.orgId);
      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs.find(m => m.organizationId === orgId)) {
        return res.status(403).json({ message: "You are not a member of this organization." });
      }

      const assessments = await storage.getLatestProjectRiskAssessmentsForOrg(orgId);
      const uniqueByProject = new Map<number, typeof assessments[0]>();
      for (const a of assessments) {
        if (!uniqueByProject.has(a.projectId)) {
          uniqueByProject.set(a.projectId, a);
        }
      }
      res.json(Array.from(uniqueByProject.values()).map(a => ({
        projectId: a.projectId,
        riskScore: a.riskScore,
        summary: a.summary,
        generatedAt: a.generatedAt,
      })));
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to get project risk assessments" : classified.message });
    }
  });

  // Public endpoint - accessible via share token without authentication
  apiRoute(app, 'get', '/api/portfolio-risk-assessments/share/:token', {
    tag: 'Portfolios',
    summary: 'View shared risk assessment (public)',
    parameters: [pathStr('token')],
    security: [],
    responses: { ...r200('Shared assessment', ref('RiskAssessment')), ...e404 },
  }, async (req, res) => {
    try {
      const assessment = await storage.getPortfolioRiskAssessmentByShareToken(req.params.token);
      if (!assessment) return res.status(404).json({ message: "Report not found" });

      const portfolio = await storage.getPortfolio(assessment.portfolioId);
      const report = JSON.parse(assessment.reportJson);

      res.json({
        id: assessment.id,
        portfolioId: assessment.portfolioId,
        portfolioName: portfolio?.name || 'Portfolio',
        riskScore: assessment.riskScore,
        summary: assessment.summary,
        shareToken: assessment.shareToken,
        generatedAt: assessment.generatedAt,
        report,
      });
    } catch (err) {
      console.error("Error serving shared risk assessment:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to load report" : classified.message });
    }
  });

  // Public endpoint - accessible via share token without authentication
  apiRoute(app, 'get', '/api/portfolio-risk-assessments/share/:token/pdf', {
    tag: 'Portfolios',
    summary: 'Download shared risk assessment as PDF (public)',
    parameters: [pathStr('token')],
    security: [],
    responses: { '200': { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, ...e404 },
  }, async (req, res) => {
    try {
      const assessment = await storage.getPortfolioRiskAssessmentByShareToken(req.params.token);
      if (!assessment) return res.status(404).json({ message: "Report not found" });

      const portfolio = await storage.getPortfolio(assessment.portfolioId);
      const report = JSON.parse(assessment.reportJson);

      const { generateRiskAssessmentPDF } = await import("../services/portfolioRiskAssessment");
      const pdfBuffer = await generateRiskAssessmentPDF(report, portfolio?.name || 'Portfolio');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="risk-assessment-${assessment.portfolioId}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("Error serving shared risk assessment PDF:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate PDF" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/risk-assessment/:assessmentId/pdf', {
    tag: 'Portfolios',
    summary: 'Download portfolio risk assessment PDF',
    parameters: [pathId(), pathId('assessmentId')],
    responses: { '200': { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: "Portfolio not found" });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const assessment = await storage.getLatestPortfolioRiskAssessment(portfolioId);
      if (!assessment) return res.status(404).json({ message: "No assessment found" });
      const report = JSON.parse(assessment.reportJson);

      const { generateRiskAssessmentPDF } = await import("../services/portfolioRiskAssessment");
      const pdfBuffer = await generateRiskAssessmentPDF(report, portfolio?.name || 'Portfolio');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="risk-assessment-${assessment.portfolioId}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate PDF" : classified.message });
    }
  });

  // === Project Risk Assessment Endpoints ===

  apiRoute(app, 'post', '/api/projects/:id/risk-assessment', {
    tag: 'Projects',
    summary: 'Run AI risk assessment for project',
    parameters: [pathId()],
    responses: { ...r201('Risk assessment created', ref('RiskAssessment')), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const orgId = project.organizationId;
      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs.find(m => m.organizationId === orgId)) {
        return res.status(403).json({ message: "You are not a member of this organization. Please ask an admin to invite you." });
      }

      const orgForProjConfig = await storage.getOrganization(orgId);
      const { DEFAULT_RISK_ASSESSMENT_CONFIG: PROJ_DEFAULTS } = await import('@shared/schema');
      const projRiskConfig = { ...PROJ_DEFAULTS, ...(orgForProjConfig?.riskAssessmentConfig || {}) };

      const forceRecalculate = req.body?.force === true;
      const existing = await storage.getLatestProjectRiskAssessment(projectId);
      if (existing && !forceRecalculate) {
        const ageInDays = (Date.now() - new Date(existing.generatedAt!).getTime()) / (1000 * 60 * 60 * 24);
        if (ageInDays < projRiskConfig.cacheDays) {
          const cachedReport = JSON.parse(existing.reportJson);
          return res.json({
            success: true,
            cached: true,
            assessment: {
              id: existing.id,
              riskScore: existing.riskScore,
              summary: existing.summary,
              shareToken: existing.shareToken,
              generatedAt: existing.generatedAt,
              report: cachedReport,
            },
          });
        }
      }

      // AI credit enforcement + recording happens inside
      // `generateProjectRiskAssessment` via `withAiCredits`. Don't
      // double-charge here.
      const { generateProjectRiskAssessment } = await import("../services/projectRiskAssessment");
      let report;
      try {
        report = await generateProjectRiskAssessment(projectId, orgId, userId);
      } catch (limitErr) {
        const { sendLimitExceeded } = await import("../services/aiCredits");
        if (sendLimitExceeded(res, limitErr)) return;
        throw limitErr;
      }

      const crypto = await import("crypto");
      const shareToken = crypto.randomBytes(32).toString('hex');

      const assessment = await storage.createProjectRiskAssessment({
        projectId,
        organizationId: orgId,
        riskScore: report.riskScore,
        summary: report.summary,
        reportJson: JSON.stringify(report),
        shareToken,
        generatedBy: userId,
        generatedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        cached: false,
        assessment: {
          id: assessment.id,
          riskScore: assessment.riskScore,
          summary: assessment.summary,
          shareToken: assessment.shareToken,
          generatedAt: assessment.generatedAt,
          report,
        },
      });
    } catch (err) {
      console.error("Error generating project risk assessment:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate risk assessment" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/projects/:id/risk-assessment/latest', {
    tag: 'Projects',
    summary: 'Get latest project risk assessment',
    parameters: [pathId()],
    responses: { ...r200('Latest assessment', ref('RiskAssessment')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.id);
      const assessment = await storage.getLatestProjectRiskAssessment(projectId);
      if (!assessment) return res.json(null);

      const report = JSON.parse(assessment.reportJson);
      res.json({
        id: assessment.id,
        riskScore: assessment.riskScore,
        summary: assessment.summary,
        shareToken: assessment.shareToken,
        generatedAt: assessment.generatedAt,
        report,
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to get risk assessment" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/projects/:id/risk-assessment/history', {
    tag: 'Projects',
    summary: 'Get project risk assessment history',
    parameters: [pathId()],
    responses: { ...r200('Assessment history', arrOf('RiskAssessment')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const userOrgs = await storage.getUserOrganizations(userId);
      if (!userOrgs.find(m => m.organizationId === project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const history = await storage.getProjectRiskAssessmentHistory(projectId);
      res.json(history);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to get risk assessment history" : classified.message });
    }
  });

  // Public endpoint - accessible via share token without authentication
  apiRoute(app, 'get', '/api/project-risk-assessments/share/:token', {
    tag: 'Projects',
    summary: 'View shared project risk assessment (public)',
    parameters: [pathStr('token')],
    security: [],
    responses: { ...r200('Shared assessment', ref('RiskAssessment')), ...e404 },
  }, async (req, res) => {
    try {
      const assessment = await storage.getProjectRiskAssessmentByShareToken(req.params.token);
      if (!assessment) return res.status(404).json({ message: "Report not found" });

      const project = await storage.getProject(assessment.projectId);
      const report = JSON.parse(assessment.reportJson);

      res.json({
        id: assessment.id,
        projectId: assessment.projectId,
        projectName: project?.name || 'Project',
        riskScore: assessment.riskScore,
        summary: assessment.summary,
        shareToken: assessment.shareToken,
        generatedAt: assessment.generatedAt,
        report,
      });
    } catch (err) {
      console.error("Error serving shared project risk assessment:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to load report" : classified.message });
    }
  });

  // Public endpoint - accessible via share token without authentication
  apiRoute(app, 'get', '/api/project-risk-assessments/share/:token/pdf', {
    tag: 'Projects',
    summary: 'Download shared project risk assessment as PDF (public)',
    parameters: [pathStr('token')],
    security: [],
    responses: { '200': { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, ...e404 },
  }, async (req, res) => {
    try {
      const assessment = await storage.getProjectRiskAssessmentByShareToken(req.params.token);
      if (!assessment) return res.status(404).json({ message: "Report not found" });

      const project = await storage.getProject(assessment.projectId);
      const report = JSON.parse(assessment.reportJson);

      const { generateProjectRiskAssessmentPDF } = await import("../services/projectRiskAssessment");
      const pdfBuffer = await generateProjectRiskAssessmentPDF(report, project?.name || 'Project');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="project-risk-assessment-${assessment.projectId}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("Error serving project risk assessment PDF:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate PDF" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/projects/:id/risk-assessment/:assessmentId/pdf', {
    tag: 'Projects',
    summary: 'Download project risk assessment PDF',
    parameters: [pathId(), pathId('assessmentId')],
    responses: { '200': { description: 'PDF file', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const assessment = await storage.getLatestProjectRiskAssessment(Number(req.params.id));
      if (!assessment) return res.status(404).json({ message: "No assessment found" });

      const project = await storage.getProject(assessment.projectId);
      const report = JSON.parse(assessment.reportJson);

      const { generateProjectRiskAssessmentPDF } = await import("../services/projectRiskAssessment");
      const pdfBuffer = await generateProjectRiskAssessmentPDF(report, project?.name || 'Project');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="project-risk-assessment-${assessment.projectId}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate PDF" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/overview', {
    tag: 'Portfolios',
    summary: 'Get portfolio overview with stats',
    parameters: [pathId()],
    responses: { ...r200('Portfolio overview', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const projects = await storage.getPortfolioProjects(portfolioId);
      const risks = await storage.getPortfolioRisks(portfolioId);
      const issues = await storage.getPortfolioIssues(portfolioId);
      const keyDates = await storage.getPortfolioKeyDates(portfolioId);
      
      const projectIds = projects.map(p => p.id);
      const financialBudgets = await storage.getFinancialBudgetTotals(projectIds);
      
      const getEffectiveBudget = (p: typeof projects[0]) => {
        if (p.id in financialBudgets) return financialBudgets[p.id];
        return Number(p.budget || 0);
      };
      
      const totalBudget = projects.reduce((sum, p) => sum + getEffectiveBudget(p), 0);

      // Sum target benefits across all project_benefits rows for the
      // portfolio's projects so the UI can show a calendar-agnostic ROI tile
      // (benefits − costs / costs) without an extra round-trip per project.
      let totalBenefits = 0;
      if (projectIds.length > 0) {
        const { db } = await import('../db');
        const { projectBenefits } = await import('@shared/schema');
        const { inArray, sql } = await import('drizzle-orm');
        const [row] = await db
          .select({ total: sql<string>`COALESCE(SUM(${projectBenefits.targetValue}), 0)` })
          .from(projectBenefits)
          .where(inArray(projectBenefits.projectId, projectIds));
        totalBenefits = Number(row?.total ?? 0) || 0;
      }
      const avgCompletion = projects.length > 0 
        ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length)
        : 0;
      const healthCounts = {
        green: projects.filter(p => p.health === 'Green').length,
        yellow: projects.filter(p => p.health === 'Yellow').length,
        red: projects.filter(p => p.health === 'Red').length,
      };
      const openRisks = risks.filter(r => r.status === 'Open').length;
      const highRisks = risks.filter(r => r.probability === 'High' || r.impact === 'High').length;
      const openIssues = issues.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
      const upcomingKeyDates = keyDates.filter(kd => !kd.completed).length;
      
      res.json({
        portfolio,
        metrics: {
          projectCount: projects.length,
          totalBudget,
          totalBenefits,
          avgCompletion,
          healthCounts,
          riskCount: risks.length,
          openRisks,
          highRisks,
          issueCount: issues.length,
          openIssues,
          keyDateCount: keyDates.length,
          upcomingKeyDates: upcomingKeyDates,
        },
        financialBudgets,
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio overview' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/portfolios/:id/scoring-rollup', {
    tag: 'Portfolios',
    summary: 'Get portfolio scoring rollup',
    parameters: [pathId()],
    responses: { ...r200('Scoring rollup', { type: 'object' }), ...idRes },
  }, async (req, res) => {
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
      const criteria = await storage.getProjectScoringCriteria(portfolio.organizationId!);
      const allScores = await storage.getAllProjectScoresForProjects(projectIds);
      const config = await storage.getPortfolioScoringConfig(portfolioId);

      const configMap = new Map(config.map(c => [c.criteriaId, c.aggregationMethod]));

      const rollup = criteria.map(criterion => {
        const criteriaScores = allScores.filter(s => s.criteriaId === criterion.id);
        const aggregationMethod = configMap.get(criterion.id) || 'average';

        const projectBreakdown = portfolioProjects.map(project => {
          const score = criteriaScores.find(s => s.projectId === project.id);
          return {
            projectId: project.id,
            projectName: project.name,
            score: score?.score ?? null,
            justification: score?.justification ?? null,
          };
        });

        const validScores = projectBreakdown.filter(p => p.score !== null).map(p => p.score as number);
        let aggregatedScore: number | null = null;

        if (validScores.length > 0) {
          switch (aggregationMethod) {
            case 'sum':
              aggregatedScore = validScores.reduce((a, b) => a + b, 0);
              break;
            case 'max':
              aggregatedScore = Math.max(...validScores);
              break;
            case 'min':
              aggregatedScore = Math.min(...validScores);
              break;
            case 'weighted-average': {
              let totalWeightedScore = 0;
              let totalWeight = 0;
              for (const pb of projectBreakdown) {
                if (pb.score !== null) {
                  const project = portfolioProjects.find(p => p.id === pb.projectId);
                  const weight = Number(project?.budget || 1);
                  totalWeightedScore += pb.score * weight;
                  totalWeight += weight;
                }
              }
              aggregatedScore = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) / 100 : null;
              break;
            }
            case 'average':
            default:
              aggregatedScore = Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100;
              break;
          }
        }

        return {
          criteriaId: criterion.id,
          criteriaName: criterion.name,
          criteriaCategory: criterion.category,
          criteriaWeight: criterion.weight,
          maxScore: criterion.maxScore,
          aggregationMethod,
          aggregatedScore,
          scoredProjectCount: validScores.length,
          totalProjectCount: portfolioProjects.length,
          projectBreakdown,
        };
      });

      let overallScore: number | null = null;
      const scoredCriteria = rollup.filter(r => r.aggregatedScore !== null);
      if (scoredCriteria.length > 0) {
        let totalWeighted = 0;
        let totalWeight = 0;
        for (const r of scoredCriteria) {
          const weight = parseFloat(String(r.criteriaWeight)) || 1;
          const maxScore = r.maxScore || 10;
          let normalizedScore = r.aggregatedScore! / maxScore;
          if (r.aggregationMethod === 'sum') {
            normalizedScore = Math.min(normalizedScore, 1.0);
          }
          totalWeighted += normalizedScore * weight;
          totalWeight += weight;
        }
        overallScore = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 10 * 100) / 100 : null;
      }

      const keyDates = await storage.getPortfolioKeyDates(portfolioId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const total = keyDates.length;

      let completedCount = 0;
      let overdueCount = 0;
      let atRiskCount = 0;
      let upcomingCount = 0;

      for (const kd of keyDates) {
        if (kd.completed || kd.status === 'Completed') {
          completedCount++;
        } else if (kd.status === 'Overdue' || (kd.date && new Date(new Date(kd.date).toDateString()) < today)) {
          overdueCount++;
        } else if (kd.status === 'At Risk') {
          atRiskCount++;
        } else {
          upcomingCount++;
        }
      }

      const complianceRate = total > 0 ? Math.round(((completedCount + upcomingCount) / total) * 10000) / 100 : null;

      const keyDateCompliance = {
        total,
        completed: completedCount,
        overdue: overdueCount,
        atRisk: atRiskCount,
        upcoming: upcomingCount,
        complianceRate,
      };

      res.json({
        portfolioId,
        portfolioName: portfolio.name,
        projectCount: portfolioProjects.length,
        overallScore,
        keyDateCompliance,
        criteria: rollup,
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio scoring rollup' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/portfolios/:id/scoring-config', {
    tag: 'Portfolios',
    summary: 'Update portfolio scoring aggregation config',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { criteriaId: { type: 'integer' }, aggregationMethod: { type: 'string', enum: ['average', 'sum', 'max', 'min', 'weighted-average'] } }, required: ['criteriaId', 'aggregationMethod'] }),
    responses: { ...r200('Scoring config updated', ref('PortfolioScoringConfig')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const portfolioId = Number(req.params.id);
      const portfolio = await storage.getPortfolio(portfolioId);
      if (!portfolio) return res.status(404).json({ message: 'Portfolio not found' });
      if (!await userHasOrgAccess(userId, portfolio.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const { criteriaId, aggregationMethod } = req.body;
      if (!criteriaId || !aggregationMethod) {
        return res.status(400).json({ message: 'criteriaId and aggregationMethod are required' });
      }

      const validMethods = ['average', 'sum', 'max', 'min', 'weighted-average'];
      if (!validMethods.includes(aggregationMethod)) {
        return res.status(400).json({ message: `Invalid aggregation method. Must be one of: ${validMethods.join(', ')}` });
      }

      const criterion = await storage.getProjectScoringCriterion(criteriaId);
      if (!criterion || criterion.organizationId !== portfolio.organizationId) {
        return res.status(400).json({ message: 'Invalid criteria for this portfolio' });
      }

      const result = await storage.upsertPortfolioScoringConfig(portfolioId, criteriaId, aggregationMethod);
      invalidateOrganizationContextCache(portfolio.organizationId);
      res.json(result);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update scoring config' : classified.message });
    }
  });

}
