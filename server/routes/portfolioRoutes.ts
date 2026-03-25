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

export function registerPortfolioRoutes(app: Express) {
  // --- Portfolios ---
  app.get(api.portfolios.list.path, async (req, res) => {
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
      p.organizationId === null || accessibleOrgIds.includes(p.organizationId)
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

  app.get(api.portfolios.get.path, async (req, res) => {
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

  app.post(api.portfolios.create.path, async (req, res) => {
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
      
      res.status(201).json(portfolio);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      throw err;
    }
  });

  app.put(api.portfolios.update.path, async (req, res) => {
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
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Internal server error" : classified.message });
    }
  });

  app.delete(api.portfolios.delete.path, async (req, res) => {
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
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting portfolio" : classified.message });
    }
  });

  // --- Portfolio Aggregations ---
  app.get('/api/portfolios/:id/projects', async (req, res) => {
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

  app.post('/api/portfolios/:id/custom-projects', async (req, res) => {
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

  app.delete('/api/portfolios/:id/custom-projects/:projectId', async (req, res) => {
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

  app.get('/api/portfolios/:id/risks', async (req, res) => {
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

  app.get('/api/portfolios/:id/issues', async (req, res) => {
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

  app.get('/api/portfolios/:id/milestones', async (req, res) => {
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
  app.get('/api/portfolios/:id/key-dates', async (req, res) => {
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

  app.post('/api/portfolios/:id/key-dates', async (req, res) => {
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
      logUserActivity(userId, 'portfolio_key_date_created', { portfolioId, keyDateId: keyDate.id });
      res.status(201).json(keyDate);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create portfolio key date' : classified.message });
    }
  });

  app.patch('/api/portfolios/:id/key-dates/:keyDateId', async (req, res) => {
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
      logUserActivity(userId, 'portfolio_key_date_updated', { portfolioId, keyDateId });
      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update portfolio key date' : classified.message });
    }
  });

  app.delete('/api/portfolios/:id/key-dates/:keyDateId', async (req, res) => {
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
      logUserActivity(userId, 'portfolio_key_date_deleted', { portfolioId, keyDateId });
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete portfolio key date' : classified.message });
    }
  });

  app.post('/api/portfolios/:id/risk-assessment', async (req, res) => {
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

      const { checkAndEnforceLimit, METER_CODES, recordCreditUsage, RESOURCE_TYPES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, portfolio.organizationId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      const { generatePortfolioRiskAssessment } = await import("../services/portfolioRiskAssessment");

      const report = await generatePortfolioRiskAssessment(portfolioId, portfolio.organizationId);

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

      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_risk_assessment_${Date.now()}`, portfolio.organizationId);

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

  app.get('/api/portfolios/:id/risk-assessment/latest', async (req, res) => {
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

  app.get('/api/portfolios/:id/risk-assessment/history', async (req, res) => {
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

  app.get('/api/portfolio-risk-assessments/org/:orgId', async (req, res) => {
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

  app.get('/api/project-risk-assessments/org/:orgId', async (req, res) => {
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
  app.get('/api/portfolio-risk-assessments/share/:token', async (req, res) => {
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
  app.get('/api/portfolio-risk-assessments/share/:token/pdf', async (req, res) => {
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

  app.get('/api/portfolios/:id/risk-assessment/:assessmentId/pdf', async (req, res) => {
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

  app.post('/api/projects/:id/risk-assessment', async (req, res) => {
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

      const { checkAndEnforceLimit, METER_CODES, recordCreditUsage, RESOURCE_TYPES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, orgId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      const { generateProjectRiskAssessment } = await import("../services/projectRiskAssessment");
      const report = await generateProjectRiskAssessment(projectId, orgId);

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

      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_project_risk_assessment_${Date.now()}`, orgId);

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

  app.get('/api/projects/:id/risk-assessment/latest', async (req, res) => {
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

  app.get('/api/projects/:id/risk-assessment/history', async (req, res) => {
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
  app.get('/api/project-risk-assessments/share/:token', async (req, res) => {
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
  app.get('/api/project-risk-assessments/share/:token/pdf', async (req, res) => {
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

  app.get('/api/projects/:id/risk-assessment/:assessmentId/pdf', async (req, res) => {
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

  app.get('/api/portfolios/:id/overview', async (req, res) => {
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
      
      // Calculate metrics
      const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
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
          avgCompletion,
          healthCounts,
          riskCount: risks.length,
          openRisks,
          highRisks,
          issueCount: issues.length,
          openIssues,
          keyDateCount: keyDates.length,
          upcomingKeyDates: upcomingKeyDates,
        }
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get portfolio overview' : classified.message });
    }
  });

}
