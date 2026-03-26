import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { users, usageEvents, meters, issues, resources, tasks, projects, portfolios, customDashboards, plans, subscriptions, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, helpTickets, notifications, reportSubscriptions, trainingModules, trainingLessons, trainingQuizQuestions } from "@shared/schema";
import type { User } from "@shared/models/auth";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgIds,
} from "./helpers";
import { sendEmail } from "../services/email";
import { AVAILABLE_DASHBOARDS, sendScheduledReport, checkAndSendDueReports, initializeSubscriptionSchedule, calculateNextScheduledTime } from "../services/scheduledReports";

export async function registerMiscRoutes(app: Express) {
  // --- External Shares (Cross-organization sharing) ---

  // Get all external shares for the current user
  app.get('/api/external-shares', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const shares = await storage.getExternalSharesForUser(userId);
      res.json(shares);
    } catch (err) {
      console.error('Failed to get external shares:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get external shares' : classified.message });
    }
  });

  // Get external projects for the current user (with full project details)
  app.get('/api/external-projects', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const shares = await storage.getExternalSharesForUser(userId);
      const projectShares = shares.filter(s => s.objectType === 'project');

      if (projectShares.length === 0) return res.json([]);

      const projectIds = projectShares.map(s => s.objectId);
      const orgIds = [...new Set(projectShares.map(s => s.sourceOrganizationId))];
      const [allProjects, allOrgs] = await Promise.all([
        Promise.all(projectIds.map(id => storage.getProject(id))),
        Promise.all(orgIds.map(id => storage.getOrganization(id)))
      ]);
      const projectMap = new Map(allProjects.filter(Boolean).map(p => [p!.id, p!]));
      const orgMap = new Map(allOrgs.filter(Boolean).map(o => [o!.id, o!]));

      const projects = projectShares.map(share => {
        const project = projectMap.get(share.objectId);
        if (!project) return null;
        const org = orgMap.get(share.sourceOrganizationId);
        return {
          ...project,
          isExternal: true,
          sourceOrganizationId: share.sourceOrganizationId,
          sourceOrganizationName: org?.name || 'External Organization',
          externalShareId: share.id,
          accessRole: share.accessRole
        };
      });

      res.json(projects.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external projects:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get external projects' : classified.message });
    }
  });

  app.get('/api/external-tasks', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const shares = await storage.getExternalSharesForUser(userId);
      const taskShares = shares.filter(s => s.objectType === 'task');

      if (taskShares.length === 0) return res.json([]);

      const taskIds = taskShares.map(s => s.objectId);
      const orgIds = [...new Set(taskShares.map(s => s.sourceOrganizationId))];
      const [allTasks, allOrgs] = await Promise.all([
        Promise.all(taskIds.map(id => storage.getTask(id))),
        Promise.all(orgIds.map(id => storage.getOrganization(id)))
      ]);
      const taskMap = new Map(allTasks.filter(Boolean).map(t => [t!.id, t!]));
      const orgMap = new Map(allOrgs.filter(Boolean).map(o => [o!.id, o!]));
      const projectIds = [...new Set(Array.from(taskMap.values()).map(t => t.projectId).filter(Boolean))];
      const allProjects = await Promise.all(projectIds.map(id => storage.getProject(id)));
      const projectMap = new Map(allProjects.filter(Boolean).map(p => [p!.id, p!]));

      const tasks = taskShares.map(share => {
        const task = taskMap.get(share.objectId);
        if (!task) return null;
        const org = orgMap.get(share.sourceOrganizationId);
        const project = task.projectId ? projectMap.get(task.projectId) : null;
        return {
          ...task,
          isExternal: true,
          sourceOrganizationId: share.sourceOrganizationId,
          sourceOrganizationName: org?.name || 'External Organization',
          projectName: project?.name || null,
          externalShareId: share.id,
          accessRole: share.accessRole
        };
      });

      res.json(tasks.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external tasks:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get external tasks' : classified.message });
    }
  });

  app.get('/api/external-risks', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const shares = await storage.getExternalSharesForUser(userId);
      const riskShares = shares.filter(s => s.objectType === 'risk');

      if (riskShares.length === 0) return res.json([]);

      const riskIds = riskShares.map(s => s.objectId);
      const orgIds = [...new Set(riskShares.map(s => s.sourceOrganizationId))];
      const [allRisks, allOrgs] = await Promise.all([
        Promise.all(riskIds.map(id => storage.getRisk(id))),
        Promise.all(orgIds.map(id => storage.getOrganization(id)))
      ]);
      const riskMap = new Map(allRisks.filter(Boolean).map(r => [r!.id, r!]));
      const orgMap = new Map(allOrgs.filter(Boolean).map(o => [o!.id, o!]));
      const projectIds = [...new Set(Array.from(riskMap.values()).map(r => r.projectId).filter(Boolean))];
      const allProjects = await Promise.all(projectIds.map(id => storage.getProject(id)));
      const projectMap = new Map(allProjects.filter(Boolean).map(p => [p!.id, p!]));

      const risks = riskShares.map(share => {
        const risk = riskMap.get(share.objectId);
        if (!risk) return null;
        const org = orgMap.get(share.sourceOrganizationId);
        const project = risk.projectId ? projectMap.get(risk.projectId) : null;
        return {
          ...risk,
          isExternal: true,
          sourceOrganizationId: share.sourceOrganizationId,
          sourceOrganizationName: org?.name || 'External Organization',
          projectName: project?.name || null,
          externalShareId: share.id,
          accessRole: share.accessRole
        };
      });

      res.json(risks.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external risks:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get external risks' : classified.message });
    }
  });

  app.get('/api/external-issues', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const shares = await storage.getExternalSharesForUser(userId);
      const issueShares = shares.filter(s => s.objectType === 'issue');

      if (issueShares.length === 0) return res.json([]);

      const issueIds = issueShares.map(s => s.objectId);
      const orgIds = [...new Set(issueShares.map(s => s.sourceOrganizationId))];
      const [allIssues, allOrgs] = await Promise.all([
        Promise.all(issueIds.map(id => storage.getIssue(id))),
        Promise.all(orgIds.map(id => storage.getOrganization(id)))
      ]);
      const issueMap = new Map(allIssues.filter(Boolean).map(i => [i!.id, i!]));
      const orgMap = new Map(allOrgs.filter(Boolean).map(o => [o!.id, o!]));
      const projectIds = [...new Set(Array.from(issueMap.values()).map(i => i.projectId).filter(Boolean))];
      const allProjects = await Promise.all(projectIds.map(id => storage.getProject(id)));
      const projectMap = new Map(allProjects.filter(Boolean).map(p => [p!.id, p!]));

      const issues = issueShares.map(share => {
        const issue = issueMap.get(share.objectId);
        if (!issue) return null;
        const org = orgMap.get(share.sourceOrganizationId);
        const project = issue.projectId ? projectMap.get(issue.projectId) : null;
        return {
          ...issue,
          isExternal: true,
          sourceOrganizationId: share.sourceOrganizationId,
          sourceOrganizationName: org?.name || 'External Organization',
          projectName: project?.name || null,
          externalShareId: share.id,
          accessRole: share.accessRole
        };
      });

      res.json(issues.filter(Boolean));
    } catch (err) {
      console.error('Failed to get external issues:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get external issues' : classified.message });
    }
  });

  // --- Recycle Bin ---
  app.get('/api/organizations/:id/recycle-bin', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);

      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const items = await storage.getDeletedItems(orgId);
      res.json(items);
    } catch (err) {
      console.error('Failed to get recycle bin items:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get deleted items' : classified.message });
    }
  });

  app.post('/api/organizations/:id/recycle-bin/restore', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);

      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const { type, itemId } = req.body;
      if (!type || !itemId) {
        return res.status(400).json({ message: 'Type and itemId are required' });
      }

      const success = await storage.restoreItem(type, itemId, orgId);
      if (!success) {
        return res.status(404).json({ message: 'Item not found in this organization' });
      }
      res.json({ message: 'Item restored successfully' });
    } catch (err) {
      console.error('Failed to restore item:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to restore item' : classified.message });
    }
  });

  app.delete('/api/organizations/:id/recycle-bin/:type/:itemId', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);

      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const { type, itemId } = req.params;
      const success = await storage.permanentlyDeleteItem(type as any, Number(itemId), orgId);
      if (!success) {
        return res.status(404).json({ message: 'Item not found in this organization' });
      }
      res.json({ message: 'Item permanently deleted' });
    } catch (err) {
      console.error('Failed to permanently delete item:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to permanently delete item' : classified.message });
    }
  });

  // --- Global Search ---
  app.get('/api/search', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const query = req.query.q as string;
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : undefined;

      if (!query || query.length < 2) {
        return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
      }

      // Get user's accessible organization IDs for security filtering
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (accessibleOrgIds.length === 0) {
        return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
      }

      // If organizationId specified, verify user has access and filter to just that org
      let searchOrgIds = accessibleOrgIds;
      if (organizationId) {
        if (!accessibleOrgIds.includes(organizationId)) {
          return res.json({ portfolios: [], projects: [], tasks: [], issues: [], risks: [], milestones: [] });
        }
        searchOrgIds = [organizationId];
      }

      const results = await storage.search(query, searchOrgIds);
      res.json(results);
    } catch (err) {
      console.error('Search error:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Search failed' : classified.message });
    }
  });


  // === Custom Dashboards API ===

  // Get all custom dashboards for an organization
  app.get('/api/custom-dashboards', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId } = req.query;
      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID required' });
      }

      const orgId = Number(organizationId);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const dashboards = await db
        .select()
        .from(customDashboards)
        .where(eq(customDashboards.organizationId, orgId))
        .orderBy(desc(customDashboards.createdAt));

      res.json(dashboards);
    } catch (error) {
      console.error('Error fetching custom dashboards:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch custom dashboards' : classified.message });
    }
  });

  // Get a specific custom dashboard
  app.get('/api/custom-dashboards/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const dashboardId = Number(req.params.id);
      const [dashboard] = await db
        .select()
        .from(customDashboards)
        .where(eq(customDashboards.id, dashboardId));

      if (!dashboard) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }

      if (!await userHasOrgAccess(userId, dashboard.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      res.json(dashboard);
    } catch (error) {
      console.error('Error fetching custom dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch custom dashboard' : classified.message });
    }
  });

  // Create a new custom dashboard directly
  app.post('/api/custom-dashboards', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, name, description, config } = req.body;
      if (!organizationId || !name || !config) {
        return res.status(400).json({ message: 'Organization ID, name, and config are required' });
      }

      const orgId = Number(organizationId);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const [newDashboard] = await db
        .insert(customDashboards)
        .values({
          organizationId: orgId,
          userId,
          name,
          description: description || '',
          config,
        })
        .returning();

      res.status(201).json(newDashboard);
    } catch (error) {
      console.error('Error creating custom dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create custom dashboard' : classified.message });
    }
  });

  // Generate a new custom dashboard using AI
  app.post('/api/custom-dashboards/generate', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { description, organizationId } = req.body;
      if (!description || !organizationId) {
        return res.status(400).json({ message: 'Description and organization ID required' });
      }

      const orgId = Number(organizationId);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const { generateDashboardConfig } = await import('../services/dashboardAI');
      const { name, config } = await generateDashboardConfig(description);

      // Save the generated dashboard
      const [newDashboard] = await db
        .insert(customDashboards)
        .values({
          organizationId: orgId,
          userId,
          name,
          description,
          config,
        })
        .returning();

      res.status(201).json(newDashboard);
    } catch (error) {
      console.error('Error generating custom dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to generate custom dashboard' : classified.message });
    }
  });

  // Update a custom dashboard
  app.patch('/api/custom-dashboards/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const dashboardId = Number(req.params.id);

      const [existing] = await db.select().from(customDashboards).where(eq(customDashboards.id, dashboardId));
      if (!existing) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const { name, config } = req.body;
      const [updated] = await db
        .update(customDashboards)
        .set({
          name,
          config,
          updatedAt: new Date(),
        })
        .where(eq(customDashboards.id, dashboardId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error updating custom dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update custom dashboard' : classified.message });
    }
  });

  // Delete a custom dashboard
  app.delete('/api/custom-dashboards/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const dashboardId = Number(req.params.id);

      const [existing] = await db.select().from(customDashboards).where(eq(customDashboards.id, dashboardId));
      if (!existing) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      await db
        .delete(customDashboards)
        .where(eq(customDashboards.id, dashboardId));

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting custom dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete custom dashboard' : classified.message });
    }
  });

  // ===== USER CONSENT ENDPOINTS =====

  // Get current terms/privacy versions and user's consent status
  app.get('/api/consents/status', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const termsConsent = await storage.getUserConsentByType(userId, 'terms_of_service');
      const privacyConsent = await storage.getUserConsentByType(userId, 'privacy_policy');

      res.json({
        currentTermsVersion: CURRENT_TERMS_VERSION,
        currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
        termsAccepted: termsConsent ? termsConsent.version === CURRENT_TERMS_VERSION : false,
        privacyAccepted: privacyConsent ? privacyConsent.version === CURRENT_PRIVACY_VERSION : false,
        termsConsentDate: termsConsent?.acceptedAt,
        privacyConsentDate: privacyConsent?.acceptedAt,
        needsConsent: !termsConsent || termsConsent.version !== CURRENT_TERMS_VERSION ||
                      !privacyConsent || privacyConsent.version !== CURRENT_PRIVACY_VERSION
      });
    } catch (error) {
      console.error('Error fetching consent status:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch consent status' : classified.message });
    }
  });

  // Get user's consent history
  app.get('/api/consents', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const consents = await storage.getUserConsents(userId);
      res.json(consents);
    } catch (error) {
      console.error('Error fetching consents:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch consents' : classified.message });
    }
  });

  // Record user consent
  app.post('/api/consents', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { consentType, version, method } = req.body;
      
      if (!consentType || !version) {
        return res.status(400).json({ message: 'consentType and version are required' });
      }

      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const consent = await storage.createUserConsent({
        userId,
        consentType,
        version,
        ipAddress,
        userAgent,
        method: method || 'checkbox'
      });

      res.status(201).json(consent);
    } catch (error) {
      console.error('Error recording consent:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to record consent' : classified.message });
    }
  });

  // Accept both terms and privacy in one request
  app.post('/api/consents/accept-all', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { method } = req.body;
      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      const termsConsent = await storage.createUserConsent({
        userId,
        consentType: 'terms_of_service',
        version: CURRENT_TERMS_VERSION,
        ipAddress,
        userAgent,
        method: method || 'modal'
      });

      const privacyConsent = await storage.createUserConsent({
        userId,
        consentType: 'privacy_policy',
        version: CURRENT_PRIVACY_VERSION,
        ipAddress,
        userAgent,
        method: method || 'modal'
      });

      res.status(201).json({
        termsConsent,
        privacyConsent,
        message: 'Consents recorded successfully'
      });
    } catch (error) {
      console.error('Error recording consents:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to record consents' : classified.message });
    }
  });

  // Admin: Get all user consents (super_admin only)
  app.get('/api/admin/consents', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user || !hasAdminAccess(user)) {
        return res.status(403).json({ message: 'Forbidden: Admin access required' });
      }

      const limit = Number(req.query.limit) || 100;
      const offset = Number(req.query.offset) || 0;

      const consents = await storage.getAllUserConsents(limit, offset);
      
      // Get user details for each consent
      const consentsWithUsers = await Promise.all(
        consents.map(async (consent) => {
          const consentUser = await storage.getUser(consent.userId);
          return {
            ...consent,
            userName: consentUser ? `${consentUser.firstName || ''} ${consentUser.lastName || ''}`.trim() || consentUser.email : 'Unknown',
            userEmail: consentUser?.email || 'Unknown'
          };
        })
      );

      res.json(consentsWithUsers);
    } catch (error) {
      console.error('Error fetching all consents:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch consents' : classified.message });
    }
  });

  // Admin: Get consent statistics (super_admin only)
  app.get('/api/admin/consents/stats', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user || !hasAdminAccess(user)) {
        return res.status(403).json({ message: 'Forbidden: Admin access required' });
      }

      const stats = await storage.getUserConsentStats();
      res.json({
        stats,
        currentVersions: {
          terms_of_service: CURRENT_TERMS_VERSION,
          privacy_policy: CURRENT_PRIVACY_VERSION
        }
      });
    } catch (error) {
      console.error('Error fetching consent stats:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch consent statistics' : classified.message });
    }
  });

  // ============================================
  // CUSTOM FIELD DEFINITIONS ROUTES
  // ============================================

  // Get all custom field definitions for an organization
  app.get('/api/organizations/:organizationId/custom-fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const fields = await storage.getCustomFieldDefinitions(organizationId);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching custom fields:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch custom fields' : classified.message });
    }
  });

  // Create a custom field definition
  app.post('/api/organizations/:organizationId/custom-fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const { fieldName, fieldType, fieldLabel, description, isRequired, options, defaultValue, displayOrder, isActive } = req.body;
      const field = await storage.createCustomFieldDefinition({
        organizationId,
        fieldName,
        fieldType,
        fieldLabel,
        description,
        isRequired,
        options,
        defaultValue,
        displayOrder,
        isActive,
      });
      res.status(201).json(field);
    } catch (error) {
      console.error('Error creating custom field:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create custom field' : classified.message });
    }
  });

  // Update a custom field definition
  app.put('/api/custom-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const { fieldName, fieldType, fieldLabel, description, isRequired, options, defaultValue, displayOrder, isActive } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (fieldName !== undefined) safeUpdate.fieldName = fieldName;
      if (fieldType !== undefined) safeUpdate.fieldType = fieldType;
      if (fieldLabel !== undefined) safeUpdate.fieldLabel = fieldLabel;
      if (description !== undefined) safeUpdate.description = description;
      if (isRequired !== undefined) safeUpdate.isRequired = isRequired;
      if (options !== undefined) safeUpdate.options = options;
      if (defaultValue !== undefined) safeUpdate.defaultValue = defaultValue;
      if (displayOrder !== undefined) safeUpdate.displayOrder = displayOrder;
      if (isActive !== undefined) safeUpdate.isActive = isActive;
      const field = await storage.updateCustomFieldDefinition(id, safeUpdate);
      res.json(field);
    } catch (error) {
      console.error('Error updating custom field:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update custom field' : classified.message });
    }
  });

  // Delete a custom field definition (soft delete)
  app.delete('/api/custom-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getCustomFieldDefinition(id);
      if (!existing) return res.status(404).json({ message: 'Custom field not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.deleteCustomFieldDefinition(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom field:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete custom field' : classified.message });
    }
  });

  // ============================================
  // PROJECT CUSTOM FIELD VALUES ROUTES
  // ============================================

  // Get all custom field values for a project
  app.get('/api/projects/:projectId/custom-field-values', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const values = await storage.getProjectCustomFieldValues(projectId);
      res.json(values);
    } catch (error) {
      console.error('Error fetching custom field values:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch custom field values' : classified.message });
    }
  });

  // Update/create a custom field value for a project
  app.put('/api/projects/:projectId/custom-field-values/:fieldDefinitionId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const fieldDefinitionId = parseInt(req.params.fieldDefinitionId);
      const { value } = req.body;
      
      const fieldValue = await storage.upsertProjectCustomFieldValue({
        projectId,
        fieldDefinitionId,
        value
      });
      res.json(fieldValue);
    } catch (error) {
      console.error('Error updating custom field value:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update custom field value' : classified.message });
    }
  });

  // Bulk update custom field values for a project
  app.put('/api/projects/:projectId/custom-field-values', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const { values } = req.body; // Array of { fieldDefinitionId, value }
      
      const results = await Promise.all(
        values.map((v: { fieldDefinitionId: number; value: string | null }) => 
          storage.upsertProjectCustomFieldValue({
            projectId,
            fieldDefinitionId: v.fieldDefinitionId,
            value: v.value
          })
        )
      );
      res.json(results);
    } catch (error) {
      console.error('Error updating custom field values:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update custom field values' : classified.message });
    }
  });

  // Delete a custom field value
  app.delete('/api/projects/:projectId/custom-field-values/:fieldDefinitionId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const projectId = parseInt(req.params.projectId);
      const fieldDefinitionId = parseInt(req.params.fieldDefinitionId);
      await storage.deleteProjectCustomFieldValue(projectId, fieldDefinitionId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom field value:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete custom field value' : classified.message });
    }
  });

  // ============================================
  // CUSTOM PROJECT TABS ROUTES
  // ============================================

  // Get all custom tabs for an organization
  app.get('/api/organizations/:organizationId/custom-tabs', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const tabs = await storage.getCustomProjectTabs(organizationId);
      res.json(tabs);
    } catch (error) {
      console.error('Error fetching custom tabs:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch custom tabs' : classified.message });
    }
  });

  // Get a single custom tab with sections and fields
  app.get('/api/custom-tabs/:id/full', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const fullTab = await storage.getFullCustomProjectTab(id);
      if (!fullTab) {
        return res.status(404).json({ message: 'Tab not found' });
      }
      res.json(fullTab);
    } catch (error) {
      console.error('Error fetching custom tab:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch custom tab' : classified.message });
    }
  });

  // Create a custom tab
  app.post('/api/organizations/:organizationId/custom-tabs', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = parseInt(req.params.organizationId);
      const tab = await storage.createCustomProjectTab({
        ...req.body,
        organizationId,
        createdBy: userId
      });
      res.status(201).json(tab);
    } catch (error) {
      console.error('Error creating custom tab:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create custom tab' : classified.message });
    }
  });

  // Update a custom tab
  app.put('/api/custom-tabs/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const { name, label, icon, displayOrder, isActive, isDefault } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (name !== undefined) safeUpdate.name = name;
      if (label !== undefined) safeUpdate.label = label;
      if (icon !== undefined) safeUpdate.icon = icon;
      if (displayOrder !== undefined) safeUpdate.displayOrder = displayOrder;
      if (isActive !== undefined) safeUpdate.isActive = isActive;
      if (isDefault !== undefined) safeUpdate.isDefault = isDefault;
      const tab = await storage.updateCustomProjectTab(id, safeUpdate);
      res.json(tab);
    } catch (error) {
      console.error('Error updating custom tab:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update custom tab' : classified.message });
    }
  });

  // Delete a custom tab
  app.delete('/api/custom-tabs/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getCustomProjectTab(id);
      if (!existing) return res.status(404).json({ message: 'Custom tab not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.deleteCustomProjectTab(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom tab:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete custom tab' : classified.message });
    }
  });

  // ============================================
  // CUSTOM TAB SECTIONS ROUTES
  // ============================================

  // Get sections for a tab
  app.get('/api/custom-tabs/:tabId/sections', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const tabId = parseInt(req.params.tabId);
      const sections = await storage.getCustomTabSections(tabId);
      res.json(sections);
    } catch (error) {
      console.error('Error fetching custom tab sections:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch sections' : classified.message });
    }
  });

  // Create a section
  app.post('/api/custom-tabs/:tabId/sections', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const tabId = parseInt(req.params.tabId);
      const section = await storage.createCustomTabSection({
        ...req.body,
        tabId
      });
      res.status(201).json(section);
    } catch (error) {
      console.error('Error creating custom tab section:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create section' : classified.message });
    }
  });

  // Update a section
  app.put('/api/custom-tab-sections/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const { name, label, displayOrder, isCollapsible, isDefaultCollapsed } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (name !== undefined) safeUpdate.name = name;
      if (label !== undefined) safeUpdate.label = label;
      if (displayOrder !== undefined) safeUpdate.displayOrder = displayOrder;
      if (isCollapsible !== undefined) safeUpdate.isCollapsible = isCollapsible;
      if (isDefaultCollapsed !== undefined) safeUpdate.isDefaultCollapsed = isDefaultCollapsed;
      const section = await storage.updateCustomTabSection(id, safeUpdate);
      res.json(section);
    } catch (error) {
      console.error('Error updating custom tab section:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update section' : classified.message });
    }
  });

  // Delete a section
  app.delete('/api/custom-tab-sections/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getCustomTabSection(id);
      if (!existing) return res.status(404).json({ message: 'Section not found' });
      const parentTab = await storage.getCustomProjectTab(existing.tabId);
      if (parentTab && !await userHasOrgAccess(userId, parentTab.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.deleteCustomTabSection(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom tab section:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete section' : classified.message });
    }
  });

  // ============================================
  // CUSTOM TAB FIELDS ROUTES
  // ============================================

  // Get fields for a section
  app.get('/api/custom-tab-sections/:sectionId/fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const sectionId = parseInt(req.params.sectionId);
      const fields = await storage.getCustomTabFields(sectionId);
      res.json(fields);
    } catch (error) {
      console.error('Error fetching custom tab fields:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch fields' : classified.message });
    }
  });

  // Create a field
  app.post('/api/custom-tab-sections/:sectionId/fields', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const sectionId = parseInt(req.params.sectionId);
      const field = await storage.createCustomTabField({
        ...req.body,
        sectionId
      });
      res.status(201).json(field);
    } catch (error) {
      console.error('Error creating custom tab field:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create field' : classified.message });
    }
  });

  // Update a field
  app.put('/api/custom-tab-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const { fieldName, fieldType, fieldLabel, description, isRequired, options, defaultValue, displayOrder, isActive } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (fieldName !== undefined) safeUpdate.fieldName = fieldName;
      if (fieldType !== undefined) safeUpdate.fieldType = fieldType;
      if (fieldLabel !== undefined) safeUpdate.fieldLabel = fieldLabel;
      if (description !== undefined) safeUpdate.description = description;
      if (isRequired !== undefined) safeUpdate.isRequired = isRequired;
      if (options !== undefined) safeUpdate.options = options;
      if (defaultValue !== undefined) safeUpdate.defaultValue = defaultValue;
      if (displayOrder !== undefined) safeUpdate.displayOrder = displayOrder;
      if (isActive !== undefined) safeUpdate.isActive = isActive;
      const field = await storage.updateCustomTabField(id, safeUpdate);
      res.json(field);
    } catch (error) {
      console.error('Error updating custom tab field:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update field' : classified.message });
    }
  });

  // Delete a field
  app.delete('/api/custom-tab-fields/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getCustomTabField(id);
      if (!existing) return res.status(404).json({ message: 'Field not found' });
      const parentSection = await storage.getCustomTabSection(existing.sectionId);
      if (parentSection) {
        const parentTab = await storage.getCustomProjectTab(parentSection.tabId);
        if (parentTab && !await userHasOrgAccess(userId, parentTab.organizationId)) {
          return res.status(403).json({ message: 'Access denied to this organization' });
        }
      }
      await storage.deleteCustomTabField(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting custom tab field:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete field' : classified.message });
    }
  });

  // Get project field definitions for tab builder
  app.get('/api/project-field-definitions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { PROJECT_FIELD_DEFINITIONS } = await import('@shared/schema');
      res.json(PROJECT_FIELD_DEFINITIONS);
    } catch (error) {
      console.error('Error fetching project field definitions:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch project field definitions' : classified.message });
    }
  });

  // ============================================
  // PORTFOLIO SCORING CRITERIA ROUTES
  // ============================================

  app.get('/api/organizations/:organizationId/scoring-criteria', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = parseInt(req.params.organizationId);
      const criteria = await storage.getProjectScoringCriteria(organizationId);
      res.json(criteria);
    } catch (error) {
      console.error('Error fetching scoring criteria:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch scoring criteria' : classified.message });
    }
  });

  app.post('/api/organizations/:organizationId/scoring-criteria', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = parseInt(req.params.organizationId);
      const criteria = await storage.createProjectScoringCriteria({
        ...req.body,
        organizationId,
        createdBy: userId
      });
      res.status(201).json(criteria);
    } catch (error) {
      console.error('Error creating scoring criteria:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create scoring criteria' : classified.message });
    }
  });

  app.put('/api/scoring-criteria/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      const { name, description, weight, maxScore, category, isActive } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (name !== undefined) safeUpdate.name = name;
      if (description !== undefined) safeUpdate.description = description;
      if (weight !== undefined) safeUpdate.weight = weight;
      if (maxScore !== undefined) safeUpdate.maxScore = maxScore;
      if (category !== undefined) safeUpdate.category = category;
      if (isActive !== undefined) safeUpdate.isActive = isActive;
      const criteria = await storage.updateProjectScoringCriteria(id, safeUpdate);
      res.json(criteria);
    } catch (error) {
      console.error('Error updating scoring criteria:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update scoring criteria' : classified.message });
    }
  });

  app.delete('/api/scoring-criteria/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectScoringCriteria(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting scoring criteria:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete scoring criteria' : classified.message });
    }
  });

  // ============================================
  // PROJECT SCORES ROUTES
  // ============================================

  app.get('/api/projects/:projectId/scores', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const scores = await storage.getProjectScores(projectId);
      res.json(scores);
    } catch (error) {
      console.error('Error fetching project scores:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch project scores' : classified.message });
    }
  });

  app.post('/api/projects/:projectId/scores', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const { criteriaId, score, justification } = req.body;
      const result = await storage.upsertProjectScore(projectId, criteriaId, score, justification, userId);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error saving project score:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to save project score' : classified.message });
    }
  });

  app.delete('/api/project-scores/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectScore(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting project score:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete project score' : classified.message });
    }
  });

  // ============================================
  // PROJECT BENEFITS ROUTES
  // ============================================

  app.get('/api/projects/:projectId/benefits', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const benefits = await storage.getProjectBenefits(projectId);
      res.json(benefits);
    } catch (error) {
      console.error('Error fetching project benefits:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch project benefits' : classified.message });
    }
  });

  app.post('/api/projects/:projectId/benefits', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const benefit = await storage.createProjectBenefit({
        ...req.body,
        projectId,
        createdBy: userId
      });
      res.status(201).json(benefit);
    } catch (error) {
      console.error('Error creating project benefit:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create project benefit' : classified.message });
    }
  });

  app.put('/api/project-benefits/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      const { title, description, category, expectedValue, actualValue, status, measurementMethod, targetDate, notes } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (title !== undefined) safeUpdate.title = title;
      if (description !== undefined) safeUpdate.description = description;
      if (category !== undefined) safeUpdate.category = category;
      if (expectedValue !== undefined) safeUpdate.expectedValue = expectedValue;
      if (actualValue !== undefined) safeUpdate.actualValue = actualValue;
      if (status !== undefined) safeUpdate.status = status;
      if (measurementMethod !== undefined) safeUpdate.measurementMethod = measurementMethod;
      if (targetDate !== undefined) safeUpdate.targetDate = targetDate;
      if (notes !== undefined) safeUpdate.notes = notes;
      const benefit = await storage.updateProjectBenefit(id, safeUpdate);
      res.json(benefit);
    } catch (error) {
      console.error('Error updating project benefit:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update project benefit' : classified.message });
    }
  });

  app.delete('/api/project-benefits/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectBenefit(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting project benefit:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete project benefit' : classified.message });
    }
  });

  // ============================================
  // PROJECT DECISIONS ROUTES
  // ============================================

  app.get('/api/projects/:projectId/decisions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const decisions = await storage.getProjectDecisions(projectId);
      res.json(decisions);
    } catch (error) {
      console.error('Error fetching project decisions:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch project decisions' : classified.message });
    }
  });

  app.post('/api/projects/:projectId/decisions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const decision = await storage.createProjectDecision({
        ...req.body,
        projectId,
        createdBy: userId
      });
      res.status(201).json(decision);
    } catch (error) {
      console.error('Error creating project decision:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create project decision' : classified.message });
    }
  });

  app.put('/api/project-decisions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      const { title, description, status, priority, decisionDate, decisionMaker, rationale, alternatives, impact, notes } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (title !== undefined) safeUpdate.title = title;
      if (description !== undefined) safeUpdate.description = description;
      if (status !== undefined) safeUpdate.status = status;
      if (priority !== undefined) safeUpdate.priority = priority;
      if (decisionDate !== undefined) safeUpdate.decisionDate = decisionDate;
      if (decisionMaker !== undefined) safeUpdate.decisionMaker = decisionMaker;
      if (rationale !== undefined) safeUpdate.rationale = rationale;
      if (alternatives !== undefined) safeUpdate.alternatives = alternatives;
      if (impact !== undefined) safeUpdate.impact = impact;
      if (notes !== undefined) safeUpdate.notes = notes;
      const decision = await storage.updateProjectDecision(id, safeUpdate);
      res.json(decision);
    } catch (error) {
      console.error('Error updating project decision:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update project decision' : classified.message });
    }
  });

  app.delete('/api/project-decisions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteProjectDecision(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting project decision:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete project decision' : classified.message });
    }
  });

  // ============================================
  // LESSONS LEARNED ROUTES
  // ============================================

  // Get lessons learned for a specific project
  app.get('/api/projects/:projectId/lessons-learned', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const lessons = await storage.getLessonsLearned(projectId);
      res.json(lessons);
    } catch (error) {
      console.error('Error fetching lessons learned:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch lessons learned' : classified.message });
    }
  });

  // Get all lessons learned for an organization
  app.get('/api/organizations/:organizationId/lessons-learned', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = parseInt(req.params.organizationId);
      const lessons = await storage.getAllLessonsLearned(organizationId);
      res.json(lessons);
    } catch (error) {
      console.error('Error fetching all lessons learned:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch lessons learned' : classified.message });
    }
  });

  // Create a lesson learned
  app.post('/api/projects/:projectId/lessons-learned', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const projectId = parseInt(req.params.projectId);
      const lesson = await storage.createLessonLearned({
        ...req.body,
        projectId,
        createdBy: userId
      });
      res.status(201).json(lesson);
    } catch (error) {
      console.error('Error creating lesson learned:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create lesson learned' : classified.message });
    }
  });

  // Update a lesson learned
  app.put('/api/lessons-learned/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      const { title, description, category, impact, recommendations, status, dateIdentified, approvedBy, notes } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (title !== undefined) safeUpdate.title = title;
      if (description !== undefined) safeUpdate.description = description;
      if (category !== undefined) safeUpdate.category = category;
      if (impact !== undefined) safeUpdate.impact = impact;
      if (recommendations !== undefined) safeUpdate.recommendations = recommendations;
      if (status !== undefined) safeUpdate.status = status;
      if (dateIdentified !== undefined) safeUpdate.dateIdentified = dateIdentified;
      if (approvedBy !== undefined) safeUpdate.approvedBy = approvedBy;
      if (notes !== undefined) safeUpdate.notes = notes;
      const lesson = await storage.updateLessonLearned(id, safeUpdate);
      res.json(lesson);
    } catch (error) {
      console.error('Error updating lesson learned:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update lesson learned' : classified.message });
    }
  });

  // Delete a lesson learned
  app.delete('/api/lessons-learned/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = parseInt(req.params.id);
      await storage.deleteLessonLearned(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting lesson learned:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete lesson learned' : classified.message });
    }
  });

  // ============================================
  // APPLICATION MONITORING ROUTES (Super Admin)
  // ============================================

  const {
    apiRequestLogs,
    applicationMetrics,
    userActivityLogs,
    featureUsageLogs,
    errorLogs
  } = await import("@shared/schema");

  // Helper to verify admin access (super_admin or marketing for read-only)
  const requireSuperAdmin = async (userId: string | null): Promise<boolean> => {
    if (!userId) return false;
    const user = await storage.getUser(userId);
    return hasAdminAccess(user);
  };

  // Get monitoring dashboard overview
  app.get('/api/admin/monitoring/overview', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const days = Math.min(Math.max(Number(req.query.days) || 1, 1), 365);
      const methodFilter = (req.query.method as string || '').toUpperCase();
      const statusFilter = req.query.status as string || '';
      const pathSearch = (req.query.path as string || '').trim();
      const userIdFilter = req.query.userId as string || '';
      const orgIdFilter = req.query.orgId as string || '';

      const intervalStr = `${days} days`;

      const conditions: string[] = [`l.created_at >= NOW() - INTERVAL '${intervalStr}'`];
      if (methodFilter && ['GET','POST','PUT','PATCH','DELETE'].includes(methodFilter)) {
        conditions.push(`l.method = '${methodFilter}'`);
      }
      if (statusFilter === '2xx') conditions.push(`l.status_code >= 200 AND l.status_code < 300`);
      else if (statusFilter === '3xx') conditions.push(`l.status_code >= 300 AND l.status_code < 400`);
      else if (statusFilter === '4xx') conditions.push(`l.status_code >= 400 AND l.status_code < 500`);
      else if (statusFilter === '5xx') conditions.push(`l.status_code >= 500`);
      if (pathSearch) {
        const escaped = pathSearch.replace(/'/g, "''");
        conditions.push(`l.path ILIKE '%${escaped}%'`);
      }
      if (userIdFilter) {
        const escaped = userIdFilter.replace(/'/g, "''");
        conditions.push(`l.user_id = '${escaped}'`);
      }
      if (orgIdFilter && !isNaN(Number(orgIdFilter))) {
        conditions.push(`l.organization_id = ${Number(orgIdFilter)}`);
      }

      const whereClause = conditions.join(' AND ');
      const simpleWhere = `created_at >= NOW() - INTERVAL '${intervalStr}'`;

      const activeUsersResult = await db.execute(sql.raw(
        `SELECT COUNT(DISTINCT l.user_id) as count FROM api_request_logs l WHERE ${whereClause}`
      ));
      const activeUsers = Number(activeUsersResult.rows[0]?.count || 0);

      const requestsResult = await db.execute(sql.raw(
        `SELECT COUNT(*) as count FROM api_request_logs l WHERE ${whereClause}`
      ));
      const requestsCount = Number(requestsResult.rows[0]?.count || 0);

      const avgResponseTimeResult = await db.execute(sql.raw(
        `SELECT AVG(l.duration) as avg FROM api_request_logs l WHERE ${whereClause} AND l.duration IS NOT NULL`
      ));
      const avgResponseTime = Number(avgResponseTimeResult.rows[0]?.avg || 0).toFixed(0);

      const errorRateResult = await db.execute(sql.raw(
        `SELECT 
          COUNT(*) FILTER (WHERE l.status_code >= 400) as errors,
          COUNT(*) as total
        FROM api_request_logs l WHERE ${whereClause}`
      ));
      const errors = Number(errorRateResult.rows[0]?.errors || 0);
      const total = Number(errorRateResult.rows[0]?.total || 1);
      const errorRate = ((errors / total) * 100).toFixed(2);

      const totalUsersResult = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
      const totalUsers = Number(totalUsersResult.rows[0]?.count || 0);

      const totalOrgsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM organizations WHERE deactivated_at IS NULL
      `);
      const totalOrganizations = Number(totalOrgsResult.rows[0]?.count || 0);

      const totalProjectsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM projects WHERE deleted_at IS NULL
      `);
      const totalProjects = Number(totalProjectsResult.rows[0]?.count || 0);

      const requestsPerDayResult = await db.execute(sql.raw(
        `SELECT DATE(l.created_at) as date, COUNT(*) as count 
        FROM api_request_logs l
        WHERE ${whereClause}
        GROUP BY DATE(l.created_at) 
        ORDER BY date DESC`
      ));

      const topEndpointsResult = await db.execute(sql.raw(
        `SELECT l.path, l.method, COUNT(*) as count, AVG(l.duration) as avg_duration
        FROM api_request_logs l
        WHERE ${whereClause}
        GROUP BY l.path, l.method 
        ORDER BY count DESC 
        LIMIT 15`
      ));

      const regDays = Math.max(days, 30);
      const registrationsResult = await db.execute(sql.raw(
        `SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '${regDays} days'
        GROUP BY DATE(created_at) 
        ORDER BY date DESC`
      ));

      const recentErrorsResult = await db.execute(sql.raw(
        `SELECT l.path, l.status_code, l.error_message, COUNT(*) as count
        FROM api_request_logs l
        WHERE l.status_code >= 400 AND ${whereClause}
        GROUP BY l.path, l.status_code, l.error_message
        ORDER BY count DESC
        LIMIT 15`
      ));

      const methodBreakdownResult = await db.execute(sql.raw(
        `SELECT l.method, COUNT(*) as count
        FROM api_request_logs l
        WHERE ${whereClause}
        GROUP BY l.method
        ORDER BY count DESC`
      ));

      const statusBreakdownResult = await db.execute(sql.raw(
        `SELECT 
          CASE 
            WHEN l.status_code >= 200 AND l.status_code < 300 THEN '2xx'
            WHEN l.status_code >= 300 AND l.status_code < 400 THEN '3xx'
            WHEN l.status_code >= 400 AND l.status_code < 500 THEN '4xx'
            WHEN l.status_code >= 500 THEN '5xx'
            ELSE 'other'
          END as status_group,
          COUNT(*) as count
        FROM api_request_logs l
        WHERE ${whereClause}
        GROUP BY status_group
        ORDER BY count DESC`
      ));

      const topUsersResult = await db.execute(sql.raw(
        `SELECT l.user_id, u.email, u.first_name, u.last_name, COUNT(*) as count
        FROM api_request_logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE ${whereClause} AND l.user_id IS NOT NULL
        GROUP BY l.user_id, u.email, u.first_name, u.last_name
        ORDER BY count DESC
        LIMIT 10`
      ));

      const topOrgsResult = await db.execute(sql.raw(
        `SELECT l.organization_id, o.name as org_name, COUNT(*) as count
        FROM api_request_logs l
        LEFT JOIN organizations o ON l.organization_id = o.id
        WHERE ${whereClause} AND l.organization_id IS NOT NULL
        GROUP BY l.organization_id, o.name
        ORDER BY count DESC
        LIMIT 10`
      ));

      const slowestEndpointsResult = await db.execute(sql.raw(
        `SELECT l.path, l.method, AVG(l.duration) as avg_duration, COUNT(*) as count
        FROM api_request_logs l
        WHERE ${whereClause} AND l.duration IS NOT NULL
        GROUP BY l.path, l.method
        HAVING COUNT(*) >= 3
        ORDER BY avg_duration DESC
        LIMIT 10`
      ));

      const allUsersResult = await db.execute(sql.raw(
        `SELECT DISTINCT l.user_id, u.email, u.first_name, u.last_name
        FROM api_request_logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.user_id IS NOT NULL AND l.created_at >= NOW() - INTERVAL '90 days'
        ORDER BY u.email
        LIMIT 100`
      ));

      const allOrgsResult = await db.execute(sql`
        SELECT id, name FROM organizations WHERE deactivated_at IS NULL ORDER BY name LIMIT 100
      `);

      res.json({
        summary: {
          activeUsers24h: activeUsers,
          requestsToday: requestsCount,
          avgResponseTime: `${avgResponseTime}ms`,
          errorRate: `${errorRate}%`,
          totalUsers,
          totalOrganizations,
          totalProjects,
          totalErrors: errors,
        },
        charts: {
          requestsPerDay: requestsPerDayResult.rows,
          userRegistrations: registrationsResult.rows,
        },
        topEndpoints: topEndpointsResult.rows,
        recentErrors: recentErrorsResult.rows,
        methodBreakdown: methodBreakdownResult.rows,
        statusBreakdown: statusBreakdownResult.rows,
        topUsers: topUsersResult.rows,
        topOrgs: topOrgsResult.rows,
        slowestEndpoints: slowestEndpointsResult.rows,
        filterOptions: {
          users: allUsersResult.rows,
          organizations: allOrgsResult.rows,
        },
      });
    } catch (error) {
      console.error('Error fetching monitoring overview:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch monitoring data' : classified.message });
    }
  });

  // Get API request logs with pagination and filtering
  app.get('/api/admin/monitoring/api-logs', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const { page = '1', limit = '50', method, path, minStatus, maxStatus } = req.query;
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      let query = sql`
        SELECT l.*, u.email as user_email, u.first_name, u.last_name
        FROM api_request_logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE 1=1
      `;

      if (method) {
        query = sql`${query} AND l.method = ${method}`;
      }
      if (path) {
        query = sql`${query} AND l.path LIKE ${'%' + path + '%'}`;
      }
      if (minStatus) {
        query = sql`${query} AND l.status_code >= ${parseInt(minStatus as string)}`;
      }
      if (maxStatus) {
        query = sql`${query} AND l.status_code <= ${parseInt(maxStatus as string)}`;
      }

      query = sql`${query} ORDER BY l.created_at DESC LIMIT ${parseInt(limit as string)} OFFSET ${offset}`;

      const logs = await db.execute(query);

      // Get total count
      const countResult = await db.execute(sql`SELECT COUNT(*) as total FROM api_request_logs`);
      const total = Number(countResult.rows[0]?.total || 0);

      res.json({
        logs: logs.rows,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      console.error('Error fetching API logs:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch API logs' : classified.message });
    }
  });

  // Get user activity statistics
  app.get('/api/admin/users/activity-counts', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const result = await db.execute(sql`
        SELECT 
          user_id,
          COUNT(*) as total_actions,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          MAX(created_at) as last_active_at
        FROM api_request_logs 
        WHERE user_id IS NOT NULL AND created_at >= NOW() - INTERVAL '90 days'
        GROUP BY user_id
      `);

      const usageResult = await db.execute(sql`
        SELECT 
          actor_user_id as user_id,
          COUNT(*) as usage_count
        FROM usage_events 
        WHERE actor_user_id IS NOT NULL AND occurred_at >= NOW() - INTERVAL '90 days'
        GROUP BY actor_user_id
      `);

      const activityMap: Record<string, { totalActions: number; activeDays: number; lastActiveAt: string | null; usageEvents: number }> = {};
      for (const row of result.rows as any[]) {
        activityMap[row.user_id] = {
          totalActions: Number(row.total_actions),
          activeDays: Number(row.active_days),
          lastActiveAt: row.last_active_at,
          usageEvents: 0,
        };
      }
      for (const row of usageResult.rows as any[]) {
        if (!activityMap[row.user_id]) {
          activityMap[row.user_id] = { totalActions: 0, activeDays: 0, lastActiveAt: null, usageEvents: 0 };
        }
        activityMap[row.user_id].usageEvents = Number(row.usage_count);
      }

      res.json(activityMap);
    } catch (error: any) {
      console.error('Error fetching user activity counts:', error);
      res.status(500).json({ message: 'Failed to fetch activity counts' });
    }
  });

  app.get('/api/admin/monitoring/user-activity', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // Active users by hour for last 24 hours
      const hourlyActiveResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(DISTINCT user_id) as active_users
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `);

      // Most active users
      const topUsersResult = await db.execute(sql`
        SELECT 
          l.user_id,
          u.email,
          u.first_name,
          u.last_name,
          COUNT(*) as request_count,
          MAX(l.created_at) as last_activity
        FROM api_request_logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.created_at >= NOW() - INTERVAL '24 hours' AND l.user_id IS NOT NULL
        GROUP BY l.user_id, u.email, u.first_name, u.last_name
        ORDER BY request_count DESC
        LIMIT 20
      `);

      // User logins per day
      const loginsResult = await db.execute(sql`
        SELECT 
          DATE(l.created_at) as date,
          COUNT(DISTINCT l.user_id) as unique_users
        FROM api_request_logs l
        WHERE l.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(l.created_at)
        ORDER BY date DESC
      `);

      res.json({
        hourlyActive: hourlyActiveResult.rows,
        topUsers: topUsersResult.rows,
        dailyLogins: loginsResult.rows,
      });
    } catch (error) {
      console.error('Error fetching user activity:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch user activity' : classified.message });
    }
  });

  // Get comprehensive activity ledger - all user actions as a general ledger
  app.get('/api/admin/monitoring/activity-ledger', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;
      const search = (req.query.search as string) || '';
      const actionFilter = (req.query.action as string) || '';
      const entityFilter = (req.query.entity as string) || '';
      const userFilter = (req.query.userId as string) || '';
      const sortCol = (req.query.sortCol as string) || 'created_at';
      const sortDir = (req.query.sortDir as string) === 'asc' ? 'ASC' : 'DESC';
      const days = parseInt(req.query.days as string) || 30;

      const whereClauses: string[] = [
        `l.method IN ('POST', 'PUT', 'PATCH', 'DELETE')`,
        `l.created_at >= NOW() - INTERVAL '${days} days'`,
        `l.path NOT LIKE '/api/admin/monitoring%'`,
        `l.path NOT LIKE '/api/auth/session%'`,
        `l.user_id IS NOT NULL`,
      ];

      if (userFilter) {
        whereClauses.push(`l.user_id = '${userFilter.replace(/'/g, "''")}'`);
      }
      if (search) {
        const s = search.replace(/'/g, "''");
        whereClauses.push(`(
          l.path ILIKE '%${s}%' 
          OR u.email ILIKE '%${s}%' 
          OR u.first_name ILIKE '%${s}%' 
          OR u.last_name ILIKE '%${s}%'
          OR o.name ILIKE '%${s}%'
        )`);
      }
      if (actionFilter) {
        const methodMap: Record<string, string> = { 'create': 'POST', 'update': 'PUT', 'delete': 'DELETE', 'patch': 'PATCH' };
        if (actionFilter === 'update') {
          whereClauses.push(`l.method IN ('PUT', 'PATCH')`);
        } else if (methodMap[actionFilter]) {
          whereClauses.push(`l.method = '${methodMap[actionFilter]}'`);
        }
      }
      if (entityFilter) {
        whereClauses.push(`l.path ILIKE '%/api/${entityFilter.replace(/'/g, "''")}%'`);
      }

      const allowedSortCols: Record<string, string> = {
        'created_at': 'l.created_at',
        'user': 'u.email',
        'method': 'l.method',
        'path': 'l.path',
        'status': 'l.status_code',
        'duration': 'l.duration',
      };
      const sortColumn = allowedSortCols[sortCol] || 'l.created_at';

      const whereStr = whereClauses.join(' AND ');

      const countResult = await db.execute(sql.raw(
        `SELECT COUNT(*) as total FROM api_request_logs l
         LEFT JOIN users u ON l.user_id = u.id
         LEFT JOIN organizations o ON l.organization_id = o.id
         WHERE ${whereStr}`
      ));
      const total = Number(countResult.rows[0]?.total || 0);

      const logsResult = await db.execute(sql.raw(
        `SELECT 
          l.id,
          l.method,
          l.path,
          l.status_code,
          l.duration,
          l.user_id,
          l.organization_id,
          l.ip_address,
          l.user_agent,
          l.request_body,
          l.error_message,
          l.created_at,
          u.email as user_email,
          u.first_name as user_first_name,
          u.last_name as user_last_name,
          u.profile_image_url as user_avatar,
          o.name as org_name,
          o.slug as org_slug
        FROM api_request_logs l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN organizations o ON l.organization_id = o.id
        WHERE ${whereStr}
        ORDER BY ${sortColumn} ${sortDir}
        LIMIT ${limit} OFFSET ${offset}`
      ));

      const distinctUsersResult = await db.execute(sql.raw(
        `SELECT DISTINCT l.user_id, u.email, u.first_name, u.last_name
         FROM api_request_logs l
         LEFT JOIN users u ON l.user_id = u.id
         WHERE l.method IN ('POST', 'PUT', 'PATCH', 'DELETE')
           AND l.created_at >= NOW() - INTERVAL '${days} days'
           AND l.user_id IS NOT NULL
         ORDER BY u.email
         LIMIT 50`
      ));

      const summaryResult = await db.execute(sql.raw(
        `SELECT 
          COUNT(*) FILTER (WHERE method = 'POST') as creates,
          COUNT(*) FILTER (WHERE method IN ('PUT', 'PATCH')) as updates,
          COUNT(*) FILTER (WHERE method = 'DELETE') as deletes,
          COUNT(*) FILTER (WHERE status_code >= 400) as errors,
          COUNT(DISTINCT user_id) as unique_users
        FROM api_request_logs
        WHERE method IN ('POST', 'PUT', 'PATCH', 'DELETE')
          AND created_at >= NOW() - INTERVAL '${days} days'
          AND user_id IS NOT NULL
          AND path NOT LIKE '/api/admin/monitoring%'`
      ));

      const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key', 'accessToken', 'refreshToken', 'currentPassword', 'newPassword', 'confirmPassword'];
      const sanitizedActivities = logsResult.rows.map((row: any) => {
        if (row.request_body && typeof row.request_body === 'object') {
          const sanitized = { ...row.request_body };
          for (const field of sensitiveFields) {
            if (field in sanitized) sanitized[field] = '[REDACTED]';
          }
          return { ...row, request_body: sanitized };
        }
        return row;
      });

      res.json({
        activities: sanitizedActivities,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        users: distinctUsersResult.rows,
        summary: summaryResult.rows[0] || { creates: 0, updates: 0, deletes: 0, errors: 0, unique_users: 0 },
      });
    } catch (error) {
      console.error('Error fetching activity ledger:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch activity ledger' : classified.message });
    }
  });

  // Get feature usage statistics
  app.get('/api/admin/monitoring/feature-usage', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // API endpoint usage grouped by feature
      const featureUsageResult = await db.execute(sql`
        SELECT 
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
            ELSE 'Other'
          END as feature,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE method = 'GET') as get_requests,
          COUNT(*) FILTER (WHERE method = 'POST') as post_requests,
          COUNT(*) FILTER (WHERE method = 'PUT' OR method = 'PATCH') as update_requests,
          COUNT(*) FILTER (WHERE method = 'DELETE') as delete_requests
        FROM api_request_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY 
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
            ELSE 'Other'
          END
        ORDER BY total_requests DESC
      `);

      // Feature usage trend over last 7 days
      const trendResult = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            ELSE 'Other'
          END as feature,
          COUNT(*) as count
        FROM api_request_logs
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at), 
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            ELSE 'Other'
          END
        ORDER BY date DESC, count DESC
      `);

      res.json({
        featureUsage: featureUsageResult.rows,
        trend: trendResult.rows,
      });
    } catch (error) {
      console.error('Error fetching feature usage:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch feature usage' : classified.message });
    }
  });

  // Get performance metrics
  app.get('/api/admin/monitoring/performance', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // Response time percentiles
      const percentilesResult = await db.execute(sql`
        SELECT 
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration) as p50,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY duration) as p90,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) as p99,
          AVG(duration) as avg,
          MAX(duration) as max,
          MIN(duration) as min
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND duration IS NOT NULL
      `);

      // Slowest endpoints
      const slowEndpointsResult = await db.execute(sql`
        SELECT 
          path,
          method,
          AVG(duration) as avg_duration,
          MAX(duration) as max_duration,
          COUNT(*) as request_count
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND duration IS NOT NULL
        GROUP BY path, method
        HAVING COUNT(*) >= 5
        ORDER BY avg_duration DESC
        LIMIT 10
      `);

      // Response time trend by hour
      const trendResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          AVG(duration) as avg_duration,
          COUNT(*) as request_count
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND duration IS NOT NULL
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `);

      // Error rate by hour
      const errorTrendResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE status_code >= 400) as error_count,
          ROUND(100.0 * COUNT(*) FILTER (WHERE status_code >= 400) / NULLIF(COUNT(*), 0), 2) as error_rate
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `);

      res.json({
        percentiles: percentilesResult.rows[0] || {},
        slowEndpoints: slowEndpointsResult.rows,
        responseTrend: trendResult.rows,
        errorTrend: errorTrendResult.rows,
      });
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch performance metrics' : classified.message });
    }
  });

  // Get database statistics
  app.get('/api/admin/monitoring/database', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      // Table row counts
      const tableCountsResult = await db.execute(sql`
        SELECT 
          'users' as table_name, COUNT(*) as row_count FROM users
        UNION ALL
        SELECT 'organizations', COUNT(*) FROM organizations
        UNION ALL
        SELECT 'projects', COUNT(*) FROM projects
        UNION ALL
        SELECT 'tasks', COUNT(*) FROM tasks
        UNION ALL
        SELECT 'issues', COUNT(*) FROM issues WHERE item_type = 'issue' OR item_type IS NULL
        UNION ALL
        SELECT 'risks', COUNT(*) FROM issues WHERE item_type = 'risk'
        UNION ALL
        SELECT 'milestones', COUNT(*) FROM tasks WHERE is_milestone = true
        UNION ALL
        SELECT 'resources', COUNT(*) FROM resources
        UNION ALL
        SELECT 'portfolios', COUNT(*) FROM portfolios
        UNION ALL
        SELECT 'timesheet_entries', COUNT(*) FROM timesheet_entries
        UNION ALL
        SELECT 'api_request_logs', COUNT(*) FROM api_request_logs
        ORDER BY row_count DESC
      `);

      // Database size
      const dbSizeResult = await db.execute(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);

      // Table sizes
      const tableSizesResult = await db.execute(sql`
        SELECT 
          relname as table_name,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 15
      `);

      res.json({
        tableCounts: tableCountsResult.rows,
        databaseSize: dbSizeResult.rows[0]?.size || 'Unknown',
        tableSizes: tableSizesResult.rows,
      });
    } catch (error) {
      console.error('Error fetching database stats:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch database statistics' : classified.message });
    }
  });

  app.get('/api/admin/organizations/credit-usage', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const result = await db.execute(sql`
        SELECT 
          s.org_id,
          m.code as meter_code,
          ur.included_units,
          ur.used_units,
          ur.remaining_units,
          ur.overage_units
        FROM usage_rollups ur
        JOIN billing_cycles bc ON bc.id = ur.billing_cycle_id
        JOIN subscriptions s ON s.id = bc.subscription_id
        JOIN meters m ON m.id = ur.meter_id
        WHERE bc.status = 'OPEN' AND s.org_id IS NOT NULL AND m.code = 'credits'
      `);

      const creditMap: Record<number, { included: number; used: number; remaining: number; overage: number }> = {};
      for (const row of result.rows as any[]) {
        creditMap[row.org_id] = {
          included: Number(row.included_units || 0),
          used: Number(row.used_units || 0),
          remaining: Number(row.remaining_units || 0),
          overage: Number(row.overage_units || 0),
        };
      }

      res.json(creditMap);
    } catch (error: any) {
      console.error('Error fetching org credit usage:', error);
      res.status(500).json({ message: 'Failed to fetch credit usage' });
    }
  });

  // Get organization usage statistics (comprehensive dashboard)
  app.get('/api/admin/monitoring/organization-usage', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const orgDetailsResult = await db.execute(sql`
        SELECT 
          o.id,
          o.name,
          o.slug,
          o.created_at,
          p.code as plan_code,
          p.name as plan_name,
          s.status as sub_status,
          s.bonus_seats,
          s.current_period_start,
          s.current_period_end,
          (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) as member_count,
          (SELECT COUNT(*) FROM projects pr WHERE pr.organization_id = o.id AND pr.deleted_at IS NULL) as project_count,
          (SELECT COUNT(*) FROM tasks t INNER JOIN projects pr ON t.project_id = pr.id WHERE pr.organization_id = o.id) as task_count,
          (SELECT COUNT(*) FROM portfolios pf WHERE pf.organization_id = o.id AND pf.deleted_at IS NULL) as portfolio_count,
          (SELECT COUNT(*) FROM risks r INNER JOIN projects pr ON r.project_id = pr.id WHERE pr.organization_id = o.id) as risk_count,
          (SELECT COUNT(*) FROM tasks m WHERE m.is_milestone = true AND m.organization_id = o.id) as milestone_count,
          (SELECT COUNT(*) FROM issues i INNER JOIN projects pr ON i.project_id = pr.id WHERE pr.organization_id = o.id) as issue_count,
          (SELECT COUNT(*) FROM api_request_logs l WHERE l.organization_id = o.id AND l.created_at >= NOW() - INTERVAL '7 days') as api_requests_7d
        FROM organizations o
        LEFT JOIN subscriptions s ON s.org_id = o.id
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE o.deactivated_at IS NULL
        ORDER BY o.name
      `);

      const creditUsageResult = await db.execute(sql`
        SELECT 
          s.org_id,
          m.code as meter_code,
          m.name as meter_name,
          ur.included_units,
          ur.used_units,
          ur.remaining_units,
          ur.overage_units,
          bc.period_start,
          bc.period_end,
          bc.status as cycle_status
        FROM usage_rollups ur
        JOIN billing_cycles bc ON bc.id = ur.billing_cycle_id
        JOIN subscriptions s ON s.id = bc.subscription_id
        JOIN meters m ON m.id = ur.meter_id
        WHERE bc.status = 'OPEN'
        ORDER BY s.org_id, m.code
      `);

      const totalsResult = await db.execute(sql`
        SELECT
          COUNT(DISTINCT o.id) as total_orgs,
          (SELECT COUNT(*) FROM organization_members) as total_users,
          (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) as total_projects,
          (SELECT COUNT(*) FROM tasks t INNER JOIN projects p ON t.project_id = p.id) as total_tasks,
          (SELECT COUNT(*) FROM portfolios WHERE deleted_at IS NULL) as total_portfolios
        FROM organizations o
        WHERE o.deactivated_at IS NULL
      `);

      const planDistResult = await db.execute(sql`
        SELECT 
          COALESCE(p.name, 'No Plan') as plan_name,
          COALESCE(p.code, 'none') as plan_code,
          COUNT(o.id) as org_count
        FROM organizations o
        LEFT JOIN subscriptions s ON s.org_id = o.id
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE o.deactivated_at IS NULL
        GROUP BY p.name, p.code
        ORDER BY org_count DESC
      `);

      res.json({
        organizations: orgDetailsResult.rows,
        creditUsage: creditUsageResult.rows,
        totals: totalsResult.rows[0],
        planDistribution: planDistResult.rows,
      });
    } catch (error) {
      console.error('Error fetching organization usage:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch organization usage' : classified.message });
    }
  });

  // ========== ANALYTICS DASHBOARD API ==========

  // Comprehensive analytics dashboard for Super Admin
  app.get('/api/admin/analytics/dashboard', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const now = new Date();

      // ===== USER METRICS =====
      // Total users
      const totalUsersResult = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
      const totalUsers = Number(totalUsersResult.rows[0]?.count || 0);

      // New users today (EST/EDT timezone - New York)
      const newUsersTodayResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM users 
        WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date = (NOW() AT TIME ZONE 'America/New_York')::date
      `);
      const newUsersToday = Number(newUsersTodayResult.rows[0]?.count || 0);

      // New users this week (EST/EDT timezone - New York)
      const newUsersWeekResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM users 
        WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date >= ((NOW() AT TIME ZONE 'America/New_York')::date - INTERVAL '7 days')
      `);
      const newUsersThisWeek = Number(newUsersWeekResult.rows[0]?.count || 0);

      // New users this month (EST/EDT timezone - New York)
      const newUsersMonthResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM users 
        WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date >= ((NOW() AT TIME ZONE 'America/New_York')::date - INTERVAL '30 days')
      `);
      const newUsersThisMonth = Number(newUsersMonthResult.rows[0]?.count || 0);

      // Active users (last 24h, 7d, 30d)
      const activeUsers24hResult = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours' AND user_id IS NOT NULL
      `);
      const activeUsers24h = Number(activeUsers24hResult.rows[0]?.count || 0);

      const activeUsers7dResult = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '7 days' AND user_id IS NOT NULL
      `);
      const activeUsers7d = Number(activeUsers7dResult.rows[0]?.count || 0);

      const activeUsers30dResult = await db.execute(sql`
        SELECT COUNT(DISTINCT user_id) as count FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '30 days' AND user_id IS NOT NULL
      `);
      const activeUsers30d = Number(activeUsers30dResult.rows[0]?.count || 0);

      // Daily new user signups (last 30 days, EST/EDT timezone - New York)
      const dailySignupsResult = await db.execute(sql`
        SELECT ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date as date, COUNT(*) as count 
        FROM users 
        WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date >= ((NOW() AT TIME ZONE 'America/New_York')::date - INTERVAL '30 days')
        GROUP BY ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York')::date 
        ORDER BY date ASC
      `);

      // Weekly new users (last 12 weeks)
      const weeklySignupsResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('week', created_at) as week_start,
          COUNT(*) as count 
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '12 weeks'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week_start ASC
      `);

      // Monthly new users (last 12 months)
      const monthlySignupsResult = await db.execute(sql`
        SELECT 
          DATE_TRUNC('month', created_at) as month_start,
          COUNT(*) as count 
        FROM users 
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month_start ASC
      `);

      // ===== ORGANIZATION METRICS =====
      const totalOrgsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM organizations WHERE deactivated_at IS NULL
      `);
      const totalOrganizations = Number(totalOrgsResult.rows[0]?.count || 0);

      const newOrgsThisMonthResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM organizations 
        WHERE created_at >= NOW() - INTERVAL '30 days' AND deactivated_at IS NULL
      `);
      const newOrgsThisMonth = Number(newOrgsThisMonthResult.rows[0]?.count || 0);

      // ===== PUBLIC PAGE STATS =====
      // Track public page views (landing, sign-in, pricing, terms, privacy)
      const publicPagesResult = await db.execute(sql`
        SELECT 
          CASE 
            WHEN path = '/' OR path = '' THEN 'Landing Page'
            WHEN path LIKE '/sign-in%' THEN 'Sign In'
            WHEN path LIKE '/sign-up%' THEN 'Sign Up'
            WHEN path LIKE '/pricing%' THEN 'Pricing'
            WHEN path LIKE '/terms%' THEN 'Terms of Service'
            WHEN path LIKE '/privacy%' THEN 'Privacy Policy'
            WHEN path LIKE '/features%' THEN 'Features'
            WHEN path LIKE '/about%' THEN 'About'
            WHEN path LIKE '/contact%' THEN 'Contact'
            ELSE 'Other Public'
          END as page_name,
          COUNT(*) as views,
          COUNT(DISTINCT COALESCE(user_id, ip_address)) as unique_visitors
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND method = 'GET'
          AND (
            path = '/' OR path = '' 
            OR path LIKE '/sign-in%' 
            OR path LIKE '/sign-up%'
            OR path LIKE '/pricing%'
            OR path LIKE '/terms%'
            OR path LIKE '/privacy%'
            OR path LIKE '/features%'
            OR path LIKE '/about%'
            OR path LIKE '/contact%'
          )
        GROUP BY 
          CASE 
            WHEN path = '/' OR path = '' THEN 'Landing Page'
            WHEN path LIKE '/sign-in%' THEN 'Sign In'
            WHEN path LIKE '/sign-up%' THEN 'Sign Up'
            WHEN path LIKE '/pricing%' THEN 'Pricing'
            WHEN path LIKE '/terms%' THEN 'Terms of Service'
            WHEN path LIKE '/privacy%' THEN 'Privacy Policy'
            WHEN path LIKE '/features%' THEN 'Features'
            WHEN path LIKE '/about%' THEN 'About'
            WHEN path LIKE '/contact%' THEN 'Contact'
            ELSE 'Other Public'
          END
        ORDER BY views DESC
      `);

      // Daily page views (last 30 days)
      const dailyPageViewsResult = await db.execute(sql`
        SELECT DATE(created_at) as date, COUNT(*) as views
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND method = 'GET'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      // ===== SESSION & ENGAGEMENT METRICS =====
      // Average sessions per user (last 7 days)
      const sessionsPerUserResult = await db.execute(sql`
        SELECT 
          user_id,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          COUNT(*) as total_requests
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '7 days' AND user_id IS NOT NULL
        GROUP BY user_id
      `);
      const avgSessionsPerUser = sessionsPerUserResult.rows.length > 0 
        ? (sessionsPerUserResult.rows.reduce((sum: number, r: any) => sum + Number(r.active_days || 0), 0) / sessionsPerUserResult.rows.length).toFixed(1)
        : '0';

      // Top users by activity
      const topUsersResult = await db.execute(sql`
        SELECT 
          l.user_id,
          u.email,
          u.first_name,
          u.last_name,
          COUNT(*) as request_count,
          MAX(l.created_at) as last_activity
        FROM api_request_logs l
        JOIN users u ON l.user_id = u.id
        WHERE l.created_at >= NOW() - INTERVAL '7 days' AND l.user_id IS NOT NULL
        GROUP BY l.user_id, u.email, u.first_name, u.last_name
        ORDER BY request_count DESC
        LIMIT 10
      `);

      // ===== FEATURE USAGE =====
      const featureUsageResult = await db.execute(sql`
        SELECT 
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            WHEN path LIKE '/api/timesheets%' THEN 'Timesheets'
            WHEN path LIKE '/api/issues%' THEN 'Issues'
            WHEN path LIKE '/api/milestones%' THEN 'Milestones'
            WHEN path LIKE '/api/resources%' THEN 'Resources'
            WHEN path LIKE '/api/dashboard%' THEN 'Dashboards'
            WHEN path LIKE '/api/reports%' THEN 'Reports'
            WHEN path LIKE '/api/ai%' THEN 'AI Features'
            ELSE 'Other'
          END as feature,
          COUNT(*) as usage_count
        FROM api_request_logs 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 
          CASE 
            WHEN path LIKE '/api/projects%' THEN 'Projects'
            WHEN path LIKE '/api/tasks%' THEN 'Tasks'
            WHEN path LIKE '/api/portfolios%' THEN 'Portfolios'
            WHEN path LIKE '/api/timesheets%' THEN 'Timesheets'
            WHEN path LIKE '/api/issues%' THEN 'Issues'
            WHEN path LIKE '/api/milestones%' THEN 'Milestones'
            WHEN path LIKE '/api/resources%' THEN 'Resources'
            WHEN path LIKE '/api/dashboard%' THEN 'Dashboards'
            WHEN path LIKE '/api/reports%' THEN 'Reports'
            WHEN path LIKE '/api/ai%' THEN 'AI Features'
            ELSE 'Other'
          END
        ORDER BY usage_count DESC
      `);

      // ===== SUBSCRIPTION METRICS =====
      const subscriptionStatsResult = await db.execute(sql`
        SELECT 
          p.name as plan_name,
          p.code as plan_code,
          COUNT(s.id) as subscription_count
        FROM subscriptions s
        JOIN plans p ON s.plan_id = p.id
        WHERE UPPER(s.status) = 'ACTIVE'
        GROUP BY p.name, p.code
        ORDER BY subscription_count DESC
      `);

      // Churned subscriptions this month (using created_at as proxy for cancelled date)
      const churnedResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM subscriptions 
        WHERE UPPER(status) = 'CANCELLED' AND created_at >= NOW() - INTERVAL '30 days'
      `);
      const churnedThisMonth = Number(churnedResult.rows[0]?.count || 0);

      // ===== USER RETENTION =====
      // Users who returned after signup (within 7 days)
      const retentionResult = await db.execute(sql`
        WITH new_users AS (
          SELECT id, created_at FROM users 
          WHERE created_at >= NOW() - INTERVAL '37 days' 
            AND created_at < NOW() - INTERVAL '7 days'
        ),
        returning_users AS (
          SELECT DISTINCT nu.id
          FROM new_users nu
          JOIN api_request_logs l ON l.user_id = nu.id
          WHERE l.created_at > nu.created_at + INTERVAL '1 day'
            AND l.created_at <= nu.created_at + INTERVAL '7 days'
        )
        SELECT 
          (SELECT COUNT(*) FROM new_users) as total_new,
          (SELECT COUNT(*) FROM returning_users) as returned
      `);
      const totalNew = Number(retentionResult.rows[0]?.total_new || 0);
      const returned = Number(retentionResult.rows[0]?.returned || 0);
      const retentionRate = totalNew > 0 ? ((returned / totalNew) * 100).toFixed(1) : '0';

      res.json({
        userMetrics: {
          totalUsers,
          newUsersToday,
          newUsersThisWeek,
          newUsersThisMonth,
          activeUsers24h,
          activeUsers7d,
          activeUsers30d,
          avgSessionsPerUser,
          retentionRate: `${retentionRate}%`,
        },
        organizationMetrics: {
          totalOrganizations,
          newOrgsThisMonth,
        },
        subscriptionMetrics: {
          byPlan: subscriptionStatsResult.rows,
          churnedThisMonth,
        },
        charts: {
          dailySignups: dailySignupsResult.rows,
          weeklySignups: weeklySignupsResult.rows,
          monthlySignups: monthlySignupsResult.rows,
          dailyPageViews: dailyPageViewsResult.rows,
        },
        publicPageStats: publicPagesResult.rows,
        featureUsage: featureUsageResult.rows,
        topUsers: topUsersResult.rows,
      });
    } catch (error) {
      console.error('Error fetching analytics dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch analytics data' : classified.message });
    }
  });

  // ========== HELP TICKETS API ==========
  
  // Create a new help ticket
  app.post('/api/help-tickets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const { subject, description, imageUrls, organizationId } = req.body;
      
      if (!subject?.trim() || !description?.trim()) {
        return res.status(400).json({ message: 'Subject and description are required' });
      }

      // Validate imageUrls is an array of strings if provided
      const validImageUrls = Array.isArray(imageUrls) 
        ? imageUrls.filter((url: unknown) => typeof url === 'string')
        : [];

      // Get current organization if any
      const orgId = typeof organizationId === 'number' ? organizationId : null;
      let orgName = null;
      if (orgId) {
        const org = await storage.getOrganization(orgId);
        orgName = org?.name || null;
      }

      const ticketData = {
        userId,
        userEmail: user.email,
        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        organizationId: orgId,
        organizationName: orgName,
        subject: subject.trim(),
        description: description.trim(),
        imageUrls: validImageUrls,
        status: 'new',
        priority: 'normal',
      };

      const [ticket] = await db.insert(helpTickets).values(ticketData).returning();

      // Send email notification to support
      try {
        await sendEmail({
          to: 'support@fridayreport.ai',
          subject: `[Help Ticket #${ticket.id}] ${subject}`,
          text: `New Help Ticket from ${ticketData.userName} (${ticketData.userEmail}): ${subject} - ${description}`,
          html: `
            <h2>New Help Ticket Submitted</h2>
            <p><strong>From:</strong> ${ticketData.userName} (${ticketData.userEmail})</p>
            ${orgName ? `<p><strong>Organization:</strong> ${orgName}</p>` : ''}
            <p><strong>Subject:</strong> ${subject}</p>
            <hr>
            <p><strong>Description:</strong></p>
            <p>${description.replace(/\n/g, '<br>')}</p>
            ${imageUrls?.length ? `<p><strong>Attachments:</strong> ${imageUrls.length} image(s)</p>` : ''}
            <hr>
            <p><em>Ticket ID: ${ticket.id}</em></p>
          `,
        });
        
        // Mark email as sent
        await db.update(helpTickets)
          .set({ emailSent: true, emailSentAt: new Date() })
          .where(eq(helpTickets.id, ticket.id));
      } catch (emailError) {
        console.error('Failed to send help ticket email:', emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json(ticket);
    } catch (error) {
      console.error('Error creating help ticket:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create help ticket' : classified.message });
    }
  });

  // Get all help tickets (superadmin only)
  app.get('/api/admin/help-tickets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const tickets = await db.select().from(helpTickets).orderBy(desc(helpTickets.createdAt));
      res.json(tickets);
    } catch (error) {
      console.error('Error fetching help tickets:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch help tickets' : classified.message });
    }
  });

  // Get a single help ticket (superadmin only)
  app.get('/api/admin/help-tickets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const ticketId = parseInt(req.params.id);
      const [ticket] = await db.select().from(helpTickets).where(eq(helpTickets.id, ticketId));
      
      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      res.json(ticket);
    } catch (error) {
      console.error('Error fetching help ticket:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch help ticket' : classified.message });
    }
  });

  // Update a help ticket (superadmin only)
  app.patch('/api/admin/help-tickets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const ticketId = parseInt(req.params.id);
      const { status, priority, resolution, assignedTo } = req.body;

      const updateData: Record<string, any> = { updatedAt: new Date() };
      
      if (status) updateData.status = status;
      if (priority) updateData.priority = priority;
      if (resolution !== undefined) updateData.resolution = resolution;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      
      // Set resolvedAt if status is resolved
      if (status === 'resolved' || status === 'closed') {
        updateData.resolvedAt = new Date();
      }

      const [updatedTicket] = await db.update(helpTickets)
        .set(updateData)
        .where(eq(helpTickets.id, ticketId))
        .returning();

      if (!updatedTicket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error updating help ticket:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update help ticket' : classified.message });
    }
  });

  // Delete a help ticket (superadmin only)
  app.delete('/api/admin/help-tickets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    try {
      const ticketId = parseInt(req.params.id);
      await db.delete(helpTickets).where(eq(helpTickets.id, ticketId));
      res.json({ message: 'Ticket deleted successfully' });
    } catch (error) {
      console.error('Error deleting help ticket:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete help ticket' : classified.message });
    }
  });

  // ===== REPORT SUBSCRIPTIONS (Scheduled Email Reports) =====
  
  // Get available dashboards for report subscriptions
  app.get('/api/report-subscriptions/dashboards', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    res.json(AVAILABLE_DASHBOARDS);
  });
  
  // Get all report subscriptions for current user and organization
  app.get('/api/organizations/:orgId/report-subscriptions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const orgId = parseInt(req.params.orgId);
      const userSubscriptions = await db.select()
        .from(reportSubscriptions)
        .where(
          and(
            eq(reportSubscriptions.userId, userId),
            eq(reportSubscriptions.organizationId, orgId)
          )
        )
        .orderBy(desc(reportSubscriptions.createdAt));
      
      res.json(userSubscriptions);
    } catch (error) {
      console.error('Error fetching report subscriptions:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch report subscriptions' : classified.message });
    }
  });
  
  // Create a new report subscription
  app.post('/api/organizations/:orgId/report-subscriptions', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const orgId = parseInt(req.params.orgId);
      const { name, dashboards, frequency, dayOfWeek, dayOfMonth, timeOfDay, timezone, recipients, isActive } = req.body;
      
      if (!name || !dashboards || dashboards.length === 0 || !frequency) {
        return res.status(400).json({ message: 'Name, dashboards, and frequency are required' });
      }
      
      const nextScheduled = calculateNextScheduledTime(
        frequency,
        timeOfDay || '09:00',
        timezone || 'America/New_York',
        dayOfWeek,
        dayOfMonth
      );
      
      const [subscription] = await db.insert(reportSubscriptions)
        .values({
          userId,
          organizationId: orgId,
          name,
          dashboards,
          frequency,
          dayOfWeek: dayOfWeek ?? null,
          dayOfMonth: dayOfMonth ?? null,
          timeOfDay: timeOfDay || '09:00',
          timezone: timezone || 'America/New_York',
          recipients: recipients || [],
          isActive: isActive ?? true,
          nextScheduledAt: nextScheduled,
        })
        .returning();
      
      res.status(201).json(subscription);
    } catch (error) {
      console.error('Error creating report subscription:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create report subscription' : classified.message });
    }
  });
  
  // Update a report subscription
  app.put('/api/organizations/:orgId/report-subscriptions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const orgId = parseInt(req.params.orgId);
      const subscriptionId = parseInt(req.params.id);
      const { name, dashboards, frequency, dayOfWeek, dayOfMonth, timeOfDay, timezone, recipients, isActive } = req.body;
      
      // Verify ownership
      const [existing] = await db.select()
        .from(reportSubscriptions)
        .where(
          and(
            eq(reportSubscriptions.id, subscriptionId),
            eq(reportSubscriptions.userId, userId),
            eq(reportSubscriptions.organizationId, orgId)
          )
        );
      
      if (!existing) {
        return res.status(404).json({ message: 'Subscription not found' });
      }
      
      const nextScheduled = calculateNextScheduledTime(
        frequency || existing.frequency,
        timeOfDay || existing.timeOfDay,
        timezone || existing.timezone,
        dayOfWeek ?? existing.dayOfWeek,
        dayOfMonth ?? existing.dayOfMonth
      );
      
      const [updated] = await db.update(reportSubscriptions)
        .set({
          name: name || existing.name,
          dashboards: dashboards || existing.dashboards,
          frequency: frequency || existing.frequency,
          dayOfWeek: dayOfWeek ?? existing.dayOfWeek,
          dayOfMonth: dayOfMonth ?? existing.dayOfMonth,
          timeOfDay: timeOfDay || existing.timeOfDay,
          timezone: timezone || existing.timezone,
          recipients: recipients ?? existing.recipients,
          isActive: isActive ?? existing.isActive,
          nextScheduledAt: nextScheduled,
          updatedAt: new Date(),
        })
        .where(eq(reportSubscriptions.id, subscriptionId))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating report subscription:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update report subscription' : classified.message });
    }
  });
  
  // Delete a report subscription
  app.delete('/api/organizations/:orgId/report-subscriptions/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const orgId = parseInt(req.params.orgId);
      const subscriptionId = parseInt(req.params.id);
      
      // Verify ownership
      const [existing] = await db.select()
        .from(reportSubscriptions)
        .where(
          and(
            eq(reportSubscriptions.id, subscriptionId),
            eq(reportSubscriptions.userId, userId),
            eq(reportSubscriptions.organizationId, orgId)
          )
        );
      
      if (!existing) {
        return res.status(404).json({ message: 'Subscription not found' });
      }
      
      await db.delete(reportSubscriptions)
        .where(eq(reportSubscriptions.id, subscriptionId));
      
      res.json({ message: 'Subscription deleted successfully' });
    } catch (error) {
      console.error('Error deleting report subscription:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete report subscription' : classified.message });
    }
  });
  
  // Send a test report immediately
  app.post('/api/organizations/:orgId/report-subscriptions/:id/send-now', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const orgId = parseInt(req.params.orgId);
      const subscriptionId = parseInt(req.params.id);
      
      // Verify ownership
      const [existing] = await db.select()
        .from(reportSubscriptions)
        .where(
          and(
            eq(reportSubscriptions.id, subscriptionId),
            eq(reportSubscriptions.userId, userId),
            eq(reportSubscriptions.organizationId, orgId)
          )
        );
      
      if (!existing) {
        return res.status(404).json({ message: 'Subscription not found' });
      }
      
      const success = await sendScheduledReport(subscriptionId);
      
      if (success) {
        res.json({ message: 'Report sent successfully' });
      } else {
        res.status(500).json({ message: 'Failed to send report' });
      }
    } catch (error) {
      console.error('Error sending report:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to send report' : classified.message });
    }
  });
  
  // Admin endpoint to manually trigger scheduled report check (for testing/cron)
  app.post('/api/admin/report-subscriptions/check', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!await requireSuperAdmin(userId ?? null)) {
      return res.status(403).json({ message: 'Super admin access required' });
    }
    
    try {
      const sentCount = await checkAndSendDueReports();
      res.json({ message: `Sent ${sentCount} scheduled reports` });
    } catch (error) {
      console.error('Error checking scheduled reports:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to check scheduled reports' : classified.message });
    }
  });

  // XKCD Comic Proxy (for Easter egg - bypasses CORS)
  // Curated list of PM-relevant XKCD comics about deadlines, estimates, meetings, scope, etc.
  const PM_XKCD_COMICS = [
    303,   // Compiling - "Are you stealing those LCDs?"
    612,   // Estimation - How long will this take?
    1658,  // Estimating Time - "How long will the 5 minute task take?"
    844,   // Good Code - "It says here you wrote the code"
    1205,  // Is It Worth The Time? - Time savings matrix
    1319,  // Automation - Time spent automating vs doing manually
    1445,  // Panama Canal - Cost of mega-projects
    1570,  // Engineer Syllogism - "My code is good"
    1667,  // Algorithms - O(n) jokes
    1739,  // Fixing Problems - "Do you want me to fix it or explain why..."
    1741,  // Work - "My hobby: Following people who say 'this will only take a minute'"
    1790,  // Telescopes/Microphones - Scope creep
    1831,  // Here to Help - "I'm from the help desk"
    1844,  // Voting Systems - Designing the perfect system
    1906,  // Making Progress - Progress bars that lie
    1988,  // Containers - "It works on my machine"
    2021,  // Software Development - Feature requests
    2030,  // Voting Software - Why not to build it
    2054,  // Data Pipeline - ETL nightmares
    2083,  // Laptop Issues - "Have you tried turning it off?"
    2173,  // Trained a Neural Net - ML overpromising
    2347,  // Dependency - "Someday a random person will mass-delete all their repos"
    2349,  // Rabbit Introduction - Introducing new features causing chaos
    2365,  // Messaging Systems - Too many communication tools
    2413,  // Pulsar Analogy - Explaining complex things
    2456,  // Types of Scientific Paper - Results vary
    2501,  // Average Familiarity - Everyone thinks they understand
    2568,  // Brush Strokes - "Adding small features" nightmare
    2620,  // Health Data - Dashboard data interpretation
    2730,  // Code Lifespan - "This is temporary code"
    353,   // Python - Import antigravity
    1513,  // Code Quality - "WTFs per minute"
    927,   // Standards - "We need a new standard to replace the 14 existing ones"
    1172,  // Workflow - Complex automation
    1926,  // Bad Code - "Sometimes I'm like 'wow I wrote this'"
    2303,  // Error Bars - Uncertainty in estimates
    1428,  // Move Fast and Break Things - Startup culture
    1629,  // Tools - "What are you working on?" "Making tools"
    1700,  // New Bug - "Fixing one bug creates two more"
    2138,  // Wanna See The Code? - Code review anxiety
  ];
  
  app.get('/api/xkcd/random', async (req, res) => {
    try {
      // Pick a random comic from our curated PM-relevant list
      const randomIndex = Math.floor(Math.random() * PM_XKCD_COMICS.length);
      const comicNum = PM_XKCD_COMICS[randomIndex];
      
      // Fetch the selected comic
      const comicResponse = await fetch(`https://xkcd.com/${comicNum}/info.0.json`);
      const comic = await comicResponse.json();
      
      res.json({
        img: comic.img,
        title: comic.title,
        alt: comic.alt,
        num: comic.num
      });
    } catch (error) {
      console.error('Error fetching XKCD comic:', error);
      // Return a known good fallback comic (Estimation)
      res.json({
        img: 'https://imgs.xkcd.com/comics/estimation.png',
        title: 'Estimation',
        alt: "They could say 'the connection is probably lost', but it's more fun to do naive time-averaging for this job.",
        num: 612
      });
    }
  });

  app.get('/api/home/recent-activity', async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Authentication required" });
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      if (!organizationId) return res.json([]);

      const orgMembers = await storage.getOrganizationMembers(organizationId);
      const isMember = orgMembers.some(m => m.userId === (req.user as User).id);
      if (!isMember) return res.status(403).json({ message: "Not a member of this organization" });

      const activity = await storage.getRecentOrgActivity(organizationId, 15);
      res.json(activity.map((item, i) => ({ id: `${item.type}-activity-${i}`, ...item })));
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.json([]);
    }
  });

  app.post('/api/contact-sales', async (req, res) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        name: z.string().optional(),
        message: z.string().optional(),
      });
      const { email, name, message } = schema.parse(req.body);

      await sendEmail({
        to: 'info@fridayreport.ai',
        subject: `Contact Sales Request from ${name || email}`,
        text: `New contact sales inquiry:\n\nName: ${name || 'Not provided'}\nEmail: ${email}\nMessage: ${message || 'No message provided'}`,
        html: `<h2>New Contact Sales Inquiry</h2><p><strong>Name:</strong> ${name || 'Not provided'}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong> ${message || 'No message provided'}</p>`,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Contact sales error:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to send contact request" : classified.message });
    }
  });

  // === TRAINING CONTENT MANAGEMENT (SuperAdmin) ===

  app.get('/api/admin/training/modules', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const modules = await db.select().from(trainingModules).orderBy(asc(trainingModules.sortOrder), asc(trainingModules.id));
      res.json(modules);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/admin/training/modules', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const body = z.object({
        moduleKey: z.string().min(1),
        name: z.string().min(1),
        subtitle: z.string().min(1),
        certPrefix: z.string().min(1).max(10),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      const [created] = await db.insert(trainingModules).values(body).returning();
      res.status(201).json(created);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.put('/api/admin/training/modules/:id', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const id = parseInt(req.params.id);
      const body = z.object({
        moduleKey: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        subtitle: z.string().min(1).optional(),
        certPrefix: z.string().min(1).max(10).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      const [updated] = await db.update(trainingModules).set({ ...body, updatedAt: new Date() }).where(eq(trainingModules.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Module not found" });
      res.json(updated);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete('/api/admin/training/modules/:id', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const id = parseInt(req.params.id);
      await db.delete(trainingModules).where(eq(trainingModules.id, id));
      res.json({ success: true });
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get('/api/admin/training/modules/:moduleId/lessons', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const moduleId = parseInt(req.params.moduleId);
      const lessons = await db.select().from(trainingLessons).where(eq(trainingLessons.moduleId, moduleId)).orderBy(asc(trainingLessons.sortOrder), asc(trainingLessons.id));
      res.json(lessons);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/admin/training/lessons', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const body = z.object({
        moduleId: z.number(),
        lessonKey: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1),
        videoTitle: z.string().min(1),
        videoDescription: z.string().min(1),
        keyConcepts: z.array(z.string()),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      const [created] = await db.insert(trainingLessons).values(body).returning();
      res.status(201).json(created);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.put('/api/admin/training/lessons/:id', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const id = parseInt(req.params.id);
      const body = z.object({
        moduleId: z.number().optional(),
        lessonKey: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        videoTitle: z.string().min(1).optional(),
        videoDescription: z.string().min(1).optional(),
        keyConcepts: z.array(z.string()).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      const [updated] = await db.update(trainingLessons).set({ ...body, updatedAt: new Date() }).where(eq(trainingLessons.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Lesson not found" });
      res.json(updated);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete('/api/admin/training/lessons/:id', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const id = parseInt(req.params.id);
      await db.delete(trainingLessons).where(eq(trainingLessons.id, id));
      res.json({ success: true });
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get('/api/admin/training/lessons/:lessonId/questions', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const lessonId = parseInt(req.params.lessonId);
      const questions = await db.select().from(trainingQuizQuestions).where(eq(trainingQuizQuestions.lessonId, lessonId)).orderBy(asc(trainingQuizQuestions.sortOrder), asc(trainingQuizQuestions.id));
      res.json(questions);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/admin/training/questions', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const body = z.object({
        lessonId: z.number(),
        questionKey: z.string().min(1),
        scenario: z.string().min(1),
        options: z.array(z.string()).min(2),
        correctIndex: z.number().min(0),
        explanation: z.string().min(1),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      if (body.correctIndex >= body.options.length) {
        return res.status(400).json({ message: `correctIndex (${body.correctIndex}) must be less than number of options (${body.options.length})` });
      }
      const [created] = await db.insert(trainingQuizQuestions).values(body).returning();
      res.status(201).json(created);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.put('/api/admin/training/questions/:id', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const id = parseInt(req.params.id);
      const body = z.object({
        lessonId: z.number().optional(),
        questionKey: z.string().min(1).optional(),
        scenario: z.string().min(1).optional(),
        options: z.array(z.string()).min(2).optional(),
        correctIndex: z.number().min(0).optional(),
        explanation: z.string().min(1).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      if (body.options && body.correctIndex !== undefined && body.correctIndex >= body.options.length) {
        return res.status(400).json({ message: `correctIndex (${body.correctIndex}) must be less than number of options (${body.options.length})` });
      }
      const [updated] = await db.update(trainingQuizQuestions).set({ ...body, updatedAt: new Date() }).where(eq(trainingQuizQuestions.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Question not found" });
      res.json(updated);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete('/api/admin/training/questions/:id', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const id = parseInt(req.params.id);
      await db.delete(trainingQuizQuestions).where(eq(trainingQuizQuestions.id, id));
      res.json({ success: true });
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.put('/api/admin/training/reorder', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const body = z.object({
        type: z.enum(['modules', 'lessons', 'questions']),
        items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
      }).parse(req.body);

      await db.transaction(async (tx) => {
        for (const item of body.items) {
          if (body.type === 'modules') {
            await tx.update(trainingModules).set({ sortOrder: item.sortOrder, updatedAt: new Date() }).where(eq(trainingModules.id, item.id));
          } else if (body.type === 'lessons') {
            await tx.update(trainingLessons).set({ sortOrder: item.sortOrder, updatedAt: new Date() }).where(eq(trainingLessons.id, item.id));
          } else {
            await tx.update(trainingQuizQuestions).set({ sortOrder: item.sortOrder, updatedAt: new Date() }).where(eq(trainingQuizQuestions.id, item.id));
          }
        }
      });
      res.json({ success: true });
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/admin/training/seed', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const existing = await db.select().from(trainingModules);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Training data already exists. Delete all modules first to re-seed." });
      }
      res.json({ message: "Use the client-side seed function to populate training data from the static content." });
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/admin/training/seed-from-static', async (req, res) => {
    try {
      const user = req.user as User | undefined;
      if (user?.role !== 'super_admin') return res.status(403).json({ message: "Super admin access required" });
      const body = z.object({
        modules: z.array(z.object({
          moduleKey: z.string(),
          name: z.string(),
          subtitle: z.string(),
          certPrefix: z.string(),
          sortOrder: z.number(),
          lessons: z.array(z.object({
            lessonKey: z.string(),
            title: z.string(),
            description: z.string(),
            videoTitle: z.string(),
            videoDescription: z.string(),
            keyConcepts: z.array(z.string()),
            sortOrder: z.number(),
            questions: z.array(z.object({
              questionKey: z.string(),
              scenario: z.string(),
              options: z.array(z.string()),
              correctIndex: z.number(),
              explanation: z.string(),
              sortOrder: z.number(),
            })),
          })),
        })),
      }).parse(req.body);

      let moduleCount = 0, lessonCount = 0, questionCount = 0;
      await db.transaction(async (tx) => {
        for (const mod of body.modules) {
          const [createdModule] = await tx.insert(trainingModules).values({
            moduleKey: mod.moduleKey,
            name: mod.name,
            subtitle: mod.subtitle,
            certPrefix: mod.certPrefix,
            sortOrder: mod.sortOrder,
          }).returning();
          moduleCount++;
          for (const lesson of mod.lessons) {
            const [createdLesson] = await tx.insert(trainingLessons).values({
              moduleId: createdModule.id,
              lessonKey: lesson.lessonKey,
              title: lesson.title,
              description: lesson.description,
              videoTitle: lesson.videoTitle,
              videoDescription: lesson.videoDescription,
              keyConcepts: lesson.keyConcepts,
              sortOrder: lesson.sortOrder,
            }).returning();
            lessonCount++;
            for (const q of lesson.questions) {
              if (q.correctIndex >= q.options.length) {
                throw new Error(`Invalid correctIndex ${q.correctIndex} for question ${q.questionKey} with ${q.options.length} options`);
              }
              await tx.insert(trainingQuizQuestions).values({
                lessonId: createdLesson.id,
                questionKey: q.questionKey,
                scenario: q.scenario,
                options: q.options,
                correctIndex: q.correctIndex,
                explanation: q.explanation,
                sortOrder: q.sortOrder,
              });
              questionCount++;
            }
          }
        }
      });
      res.json({ success: true, stats: { modules: moduleCount, lessons: lessonCount, questions: questionCount } });
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get('/api/training/modules', async (req, res) => {
    try {
      const modules = await db.select().from(trainingModules).where(eq(trainingModules.isActive, true)).orderBy(asc(trainingModules.sortOrder), asc(trainingModules.id));
      const allLessons = await db.select().from(trainingLessons).where(eq(trainingLessons.isActive, true)).orderBy(asc(trainingLessons.sortOrder), asc(trainingLessons.id));
      const allQuestions = await db.select().from(trainingQuizQuestions).where(eq(trainingQuizQuestions.isActive, true)).orderBy(asc(trainingQuizQuestions.sortOrder), asc(trainingQuizQuestions.id));

      const result = modules.map(mod => ({
        id: mod.moduleKey,
        name: mod.name,
        subtitle: mod.subtitle,
        certPrefix: mod.certPrefix,
        lessons: allLessons.filter(l => l.moduleId === mod.id).map(lesson => ({
          id: lesson.lessonKey,
          title: lesson.title,
          description: lesson.description,
          videoTitle: lesson.videoTitle,
          videoDescription: lesson.videoDescription,
          keyConcepts: lesson.keyConcepts,
          questions: allQuestions.filter(q => q.lessonId === lesson.id).map(q => ({
            id: q.questionKey,
            scenario: q.scenario,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
          })),
        })),
      }));
      res.json(result);
    } catch (error) {
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.message });
    }
  });

}

async function seedTrainingDataIfEmpty() {
  const existing = await db.select({ id: trainingModules.id }).from(trainingModules).limit(1);
  if (existing.length > 0) return;

  console.log('[training] No training data found, auto-seeding from static content...');

  try {
    const { allModules: staticModules } = await import('../../client/src/lib/trainingModulesData');
    await db.transaction(async (tx) => {
      for (let i = 0; i < staticModules.length; i++) {
        const mod = staticModules[i];
        const [createdModule] = await tx.insert(trainingModules).values({
          moduleKey: mod.id,
          name: mod.name,
          subtitle: mod.subtitle,
          certPrefix: mod.certPrefix,
          sortOrder: i,
        }).returning();

        for (let j = 0; j < mod.lessons.length; j++) {
          const lesson = mod.lessons[j];
          const [createdLesson] = await tx.insert(trainingLessons).values({
            moduleId: createdModule.id,
            lessonKey: lesson.id,
            title: lesson.title,
            description: lesson.description,
            videoTitle: lesson.videoTitle,
            videoDescription: lesson.videoDescription,
            keyConcepts: lesson.keyConcepts,
            sortOrder: j,
          }).returning();

          for (let k = 0; k < lesson.questions.length; k++) {
            const q = lesson.questions[k];
            await tx.insert(trainingQuizQuestions).values({
              lessonId: createdLesson.id,
              questionKey: q.id,
              scenario: q.scenario,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
              sortOrder: k,
            });
          }
        }
      }
    });
    const totalLessons = staticModules.reduce((s, m) => s + m.lessons.length, 0);
    const totalQuestions = staticModules.reduce((s, m) => s + m.lessons.reduce((ls, l) => ls + l.questions.length, 0), 0);
    console.log(`[training] Auto-seeded ${staticModules.length} modules, ${totalLessons} lessons, ${totalQuestions} questions`);
  } catch (err: any) {
    console.error('[training] Auto-seed failed, will use static fallback:', err.message);
  }

  // === REFERRAL PROGRAM ROUTES ===
  
  // Get or create user's referral code
  app.get('/api/referral/my-code', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { referralCodes } = await import("@shared/schema");
      
      // Check if user already has a referral code
      let [existingCode] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
      
      if (!existingCode) {
        // Generate a unique referral code
        const user = await storage.getUser(userId);
        const baseCode = (user?.firstName || user?.email?.split('@')[0] || 'REF').toUpperCase().substring(0, 6);
        const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = `${baseCode}${uniqueSuffix}`;
        
        [existingCode] = await db.insert(referralCodes).values({
          userId,
          code,
          commissionPercent: 10,
          isActive: true,
          totalReferrals: 0,
          totalEarningsCents: 0,
        }).returning();
      }
      
      res.json(existingCode);
    } catch (error) {
      console.error('Error getting referral code:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get referral code' : classified.message });
    }
  });

  // Get referral statistics for a user
  app.get('/api/referral/stats', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { referralCodes, referrals, referralPayouts } = await import("@shared/schema");
      
      // Get user's referral code - auto-create if none exists
      let [userCode] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
      
      if (!userCode) {
        // Auto-generate a unique referral code
        const user = await storage.getUser(userId);
        const baseCode = (user?.firstName || user?.email?.split('@')[0] || 'REF').toUpperCase().substring(0, 6);
        const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = `${baseCode}${uniqueSuffix}`;
        
        [userCode] = await db.insert(referralCodes).values({
          userId,
          code,
          commissionPercent: 10,
          isActive: true,
          totalReferrals: 0,
          totalEarningsCents: 0,
        }).returning();
      }
      
      // Get referrals for this code
      const userReferrals = await db.select().from(referrals)
        .where(eq(referrals.referralCodeId, userCode.id))
        .orderBy(referrals.createdAt);
      
      // Get payouts
      const userPayouts = await db.select().from(referralPayouts)
        .where(eq(referralPayouts.userId, userId))
        .orderBy(referralPayouts.createdAt);
      
      // Calculate stats
      const signedUp = userReferrals.filter(r => r.status === 'SIGNED_UP' || r.status === 'CONVERTED' || r.status === 'PAID_OUT').length;
      const converted = userReferrals.filter(r => r.status === 'CONVERTED' || r.status === 'PAID_OUT').length;
      const pendingEarningsCents = userReferrals
        .filter(r => r.status === 'CONVERTED')
        .reduce((sum, r) => sum + (r.commissionAmountCents || 0), 0);
      const paidOutCents = userPayouts
        .filter(p => p.status === 'COMPLETED')
        .reduce((sum, p) => sum + p.amountCents, 0);
      
      res.json({
        code: userCode,
        totalReferrals: userReferrals.length,
        signedUp,
        converted,
        pendingEarningsCents,
        paidOutCents,
        referrals: userReferrals,
        payouts: userPayouts,
      });
    } catch (error) {
      console.error('Error getting referral stats:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get referral stats' : classified.message });
    }
  });

  // Validate a referral code (public endpoint for signup)
  app.get('/api/referral/validate/:code', async (req, res) => {
    try {
      const { referralCodes } = await import("@shared/schema");
      const code = req.params.code.toUpperCase();
      
      const [refCode] = await db.select().from(referralCodes)
        .where(and(eq(referralCodes.code, code), eq(referralCodes.isActive, true)));
      
      if (!refCode) {
        return res.json({ valid: false });
      }
      
      // Get referrer info
      const referrer = await storage.getUser(refCode.userId);
      
      res.json({
        valid: true,
        referrerName: referrer ? `${referrer.firstName || ''} ${referrer.lastName || ''}`.trim() : 'A friend',
      });
    } catch (error) {
      console.error('Error validating referral code:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to validate referral code' : classified.message });
    }
  });

  // Track a referral (called when a new user signs up with a referral code)
  app.post('/api/referral/track', async (req, res) => {
    try {
      const { referralCodes, referrals } = await import("@shared/schema");
      const { code, email, userId } = req.body;
      
      if (!code || (!email && !userId)) {
        return res.status(400).json({ message: 'Code and email or userId required' });
      }
      
      const [refCode] = await db.select().from(referralCodes)
        .where(and(eq(referralCodes.code, code.toUpperCase()), eq(referralCodes.isActive, true)));
      
      if (!refCode) {
        return res.status(404).json({ message: 'Invalid referral code' });
      }
      
      // Create referral record
      const [newReferral] = await db.insert(referrals).values({
        referralCodeId: refCode.id,
        referrerId: refCode.userId,
        referredUserId: userId || null,
        referredEmail: email || null,
        status: userId ? 'SIGNED_UP' : 'PENDING',
        signedUpAt: userId ? new Date() : null,
      }).returning();
      
      // Update total referrals count
      await db.update(referralCodes)
        .set({ totalReferrals: (refCode.totalReferrals || 0) + 1 })
        .where(eq(referralCodes.id, refCode.id));
      
      res.status(201).json({ success: true, referral: newReferral });
    } catch (error) {
      console.error('Error tracking referral:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to track referral' : classified.message });
    }
  });

  // Request a payout (user requesting their earnings)
  app.post('/api/referral/request-payout', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { referralCodes, referrals, referralPayouts } = await import("@shared/schema");
      const { paypalEmail } = req.body;
      
      if (!paypalEmail) {
        return res.status(400).json({ message: 'PayPal email required' });
      }
      
      // Get user's referral code
      const [userCode] = await db.select().from(referralCodes).where(eq(referralCodes.userId, userId));
      
      if (!userCode) {
        return res.status(400).json({ message: 'No referral code found' });
      }
      
      // Calculate pending earnings
      const convertedReferrals = await db.select().from(referrals)
        .where(and(eq(referrals.referralCodeId, userCode.id), eq(referrals.status, 'CONVERTED')));
      
      const pendingAmount = convertedReferrals.reduce((sum, r) => sum + (r.commissionAmountCents || 0), 0);
      
      if (pendingAmount < 1000) { // Minimum $10 payout
        return res.status(400).json({ message: 'Minimum payout is $10' });
      }
      
      // Create payout request
      const [payout] = await db.insert(referralPayouts).values({
        userId,
        amountCents: pendingAmount,
        status: 'PENDING',
        paypalEmail,
      }).returning();
      
      // Mark referrals as paid out
      for (const ref of convertedReferrals) {
        await db.update(referrals)
          .set({ status: 'PAID_OUT' })
          .where(eq(referrals.id, ref.id));
      }
      
      res.json({ success: true, payout });
    } catch (error) {
      console.error('Error requesting payout:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to request payout' : classified.message });
    }
  });

  // =========== NOTIFICATIONS ===========
  
  // Get all notifications for the current user
  app.get('/api/notifications', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const notifications = await storage.getNotifications(userId);
      res.json(notifications);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching notifications" : classified.message });
    }
  });

  // Get unread notification count
  app.get('/api/notifications/unread-count', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (err) {
      console.error("Error fetching notification count:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching notification count" : classified.message });
    }
  });

  // Mark a notification as read
  app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const id = Number(req.params.id);
      await storage.markNotificationRead(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error marking notification as read:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error marking notification as read" : classified.message });
    }
  });

  // Mark all notifications as read
  app.patch('/api/notifications/read-all', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error marking all notifications as read" : classified.message });
    }
  });

  // Run notification checks for an organization (generates notifications for overdue tasks, deadlines, health alerts, etc.)
  app.post('/api/organizations/:orgId/notifications/check', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization (admin or owner only)
      const orgMembers = await storage.getOrganizationMembers(orgId);
      const membership = orgMembers.find(m => m.userId === userId);
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      const isOrgAdmin = membership?.role === 'owner' || membership?.role === 'org_admin' || membership?.role === 'admin';
      
      if (!isSuperAdmin && !isOrgAdmin) {
        return res.status(403).json({ message: "Admin access required to run notification checks" });
      }
      
      const { runAllNotificationChecks } = await import('../services/notificationEngine');
      const results = await runAllNotificationChecks(orgId);
      
      res.json({
        message: "Notification check completed",
        results,
      });
    } catch (err) {
      console.error("Error running notification checks:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error running notification checks" : classified.message });
    }
  });

  // Run notification checks for all organizations (super admin only - for scheduled jobs)
  app.post('/api/admin/notifications/check-all', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const user = await storage.getUser(userId);
      if (user?.role !== 'super_admin') {
        return res.status(403).json({ message: "Super admin access required" });
      }
      
      const orgs = await storage.getOrganizations();
      const activeOrgs = orgs.filter(o => !o.deactivatedAt);
      
      const { runAllNotificationChecks } = await import('../services/notificationEngine');
      const allResults = [];
      
      for (const org of activeOrgs) {
        try {
          const result = await runAllNotificationChecks(org.id);
          allResults.push({ organizationId: org.id, organizationName: org.name, ...result });
        } catch (err) {
          allResults.push({ organizationId: org.id, organizationName: org.name, error: String(err) });
        }
      }
      
      const totals = allResults.reduce((acc, r: any) => ({
        totalCreated: acc.totalCreated + (r.totalCreated || 0),
        totalSkipped: acc.totalSkipped + (r.totalSkipped || 0),
        totalErrors: acc.totalErrors + (r.totalErrors || 0),
      }), { totalCreated: 0, totalSkipped: 0, totalErrors: 0 });
      
      res.json({
        message: "Notification check completed for all organizations",
        organizationsProcessed: activeOrgs.length,
        ...totals,
        details: allResults,
      });
    } catch (err) {
      console.error("Error running notification checks for all orgs:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error running notification checks" : classified.message });
    }
  });

}

export { seedTrainingDataIfEmpty };
