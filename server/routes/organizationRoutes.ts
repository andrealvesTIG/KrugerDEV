import type { Express } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { eq, and, isNotNull } from "drizzle-orm";
import { users, taskResourceAssignments, resources, tasks, projects, organizationMembers, plans, subscriptions, billingAuditLogs, notifications, type Task } from "@shared/schema";
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
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400 } from "../route-registry";

export function registerOrganizationRoutes(app: Express) {
  // --- Organizations ---
  apiRoute(app, 'get', '/api/organizations', {
    tag: 'Organizations',
    summary: 'List all organizations',
    responses: { ...r200('List of organizations', arrOf('Organization')), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      if (hasAdminAccess(user)) {
        const orgs = await storage.getOrganizations();
        return res.json(orgs);
      }
      const orgs = await storage.getUserOrganizationsWithDetails(userId);
      res.json(orgs);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      res.status(500).json({ message: 'Failed to fetch organizations' });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id', {
    tag: 'Organizations',
    summary: 'Get organization by ID',
    parameters: [pathId()],
    responses: { ...r200('Organization details', ref('Organization')), ...idRes },
  }, async (req, res) => {
    const orgId = Number(req.params.id);
    const userId = getUserIdFromRequest(req);
    
    // Check access
    if (!await userHasOrgAccess(userId, orgId)) {
      return res.status(403).json({ message: 'Access denied to this organization' });
    }
    
    const org = await storage.getOrganization(orgId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    res.json(org);
  });

  apiRoute(app, 'post', '/api/organizations', {
    tag: 'Organizations',
    summary: 'Create a new organization',
    requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } }),
    responses: { ...r201('Organization created', ref('Organization')), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating (except during onboarding where org is created by system)
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { name, slug, description } = req.body;
      const safeOwnerId = userId!;

      if (slug) {
        const existingOrg = await storage.getOrganizationBySlug(slug);
        if (existingOrg) {
          return res.status(409).json({ message: "This organization URL slug is already taken. Please choose a different one." });
        }
      }

      const org = await storage.createOrganization({ name, slug, description, ownerId: safeOwnerId });
      await storage.addOrganizationMember({ 
        organizationId: org.id, 
        userId: safeOwnerId, 
        role: 'org_admin' 
      });
      // Auto-assign FREE plan subscription to new organization
      try {
        const { billingProvider } = await import("../services/billing");
        await billingProvider.createSubscription({
          planCode: "FREE",
          orgId: org.id,
          userId: safeOwnerId,
        });
      } catch (billingErr) {
        console.error("Failed to assign FREE plan to organization:", billingErr);
      }
      res.status(201).json(org);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create organization' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id', {
    tag: 'Organizations',
    summary: 'Update organization',
    parameters: [pathId()],
    requestBody: body(ref('Organization')),
    responses: { ...r200('Organization updated', ref('Organization')), ...updateRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const role = await getUserOrgRole(userId, orgId);
      if (role !== 'org_admin') {
        return res.status(403).json({ message: 'Only organization admins can update settings' });
      }
      
      const { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl, timezone } = req.body;
      const updated = await storage.updateOrganization(orgId, { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl, timezone });
      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update organization' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/risk-assessment-config', {
    tag: 'Organizations',
    summary: 'Get risk assessment configuration',
    parameters: [pathId()],
    responses: { ...r200('Risk assessment config', ref('Organization')), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { DEFAULT_RISK_ASSESSMENT_CONFIG } = await import('@shared/schema');
      const rawConfig = { ...DEFAULT_RISK_ASSESSMENT_CONFIG, ...(org.riskAssessmentConfig || {}) };
      const maskedConfig = { ...rawConfig };
      if (maskedConfig.customApiKey) {
        const crypto = await import('crypto');
        try {
          const decrypted = decryptApiKey(maskedConfig.customApiKey, crypto);
          maskedConfig.customApiKey = decrypted.length > 8
            ? decrypted.slice(0, 4) + '••••••••' + decrypted.slice(-4)
            : '••••••••';
        } catch {
          maskedConfig.customApiKey = maskedConfig.customApiKey.length > 8
            ? maskedConfig.customApiKey.slice(0, 4) + '••••••••' + maskedConfig.customApiKey.slice(-4)
            : '••••••••';
        }
      }
      res.json(maskedConfig);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get risk assessment config' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/risk-assessment-config', {
    tag: 'Organizations',
    summary: 'Update risk assessment configuration',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Config updated', ref('Organization')), ...updateRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const memberships = await storage.getUserOrganizations(userId!);
      const membership = memberships.find(m => m.organizationId === orgId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        const [user] = await db.select().from(users).where(eq(users.id, userId!));
        if (!hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Only admins can update risk assessment config' });
        }
      }
      const { riskAssessmentConfigSchema } = await import('@shared/schema');
      const parsed = riskAssessmentConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid config', errors: parsed.error.flatten() });
      }
      if (parsed.data.thresholds.lowMax >= parsed.data.thresholds.mediumMax || parsed.data.thresholds.mediumMax >= parsed.data.thresholds.highMax) {
        return res.status(400).json({ message: 'Thresholds must be in ascending order: Low < Medium < High' });
      }
      const org = await storage.getOrganization(orgId);
      if (parsed.data.customApiKey && parsed.data.customApiKey.includes('••••')) {
        parsed.data.customApiKey = (org?.riskAssessmentConfig as any)?.customApiKey || '';
      } else if (parsed.data.customApiKey && parsed.data.customApiKey.length > 0) {
        parsed.data.customApiKey = encryptApiKey(parsed.data.customApiKey);
      }
      const updated = await storage.updateOrganization(orgId, { riskAssessmentConfig: parsed.data });
      res.json(updated?.riskAssessmentConfig || parsed.data);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update risk assessment config' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/friday-agent-config', {
    tag: 'Organizations',
    summary: 'Get Friday Agent configuration',
    parameters: [pathId()],
    responses: { ...r200('Friday Agent config', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const memberships = await storage.getUserOrganizations(userId!);
      const membership = memberships.find(m => m.organizationId === orgId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        const [user] = await db.select().from(users).where(eq(users.id, userId!));
        if (!hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Only admins can view Friday Agent config' });
        }
      }
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { DEFAULT_FRIDAY_AGENT_CONFIG } = await import('@shared/schema');
      const rawConfig = { ...DEFAULT_FRIDAY_AGENT_CONFIG, ...((org as any).fridayAgentConfig || {}) };
      const maskedConfig = { ...rawConfig };
      if (maskedConfig.azureApiKey) {
        const crypto = await import('crypto');
        try {
          const decrypted = decryptApiKey(maskedConfig.azureApiKey, crypto);
          maskedConfig.azureApiKey = decrypted.length > 8
            ? decrypted.slice(0, 4) + '••••••••' + decrypted.slice(-4)
            : '••••••••';
        } catch {
          maskedConfig.azureApiKey = maskedConfig.azureApiKey.length > 8
            ? maskedConfig.azureApiKey.slice(0, 4) + '••••••••' + maskedConfig.azureApiKey.slice(-4)
            : '••••••••';
        }
      }
      res.json(maskedConfig);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get Friday Agent config' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/friday-agent-config', {
    tag: 'Organizations',
    summary: 'Update Friday Agent configuration',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Config updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const memberships = await storage.getUserOrganizations(userId!);
      const membership = memberships.find(m => m.organizationId === orgId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        const [user] = await db.select().from(users).where(eq(users.id, userId!));
        if (!hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Only admins can update Friday Agent config' });
        }
      }
      const { fridayAgentConfigSchema } = await import('@shared/schema');
      const parsed = fridayAgentConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid config', errors: parsed.error.flatten() });
      }
      if (parsed.data.azureEndpoint) {
        parsed.data.azureEndpoint = parsed.data.azureEndpoint.trim()
          .replace(/\/openai\/v1\/?$/i, '')
          .replace(/\/openai\/?$/i, '')
          .replace(/\/+$/, '');
      }
      if (parsed.data.useOrgAzure) {
        const endpointVal = parsed.data.azureEndpoint;
        if (!endpointVal) {
          return res.status(400).json({ message: 'Azure endpoint is required when using org-specific model.' });
        }
        try {
          const url = new URL(endpointVal);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return res.status(400).json({ message: 'Azure endpoint must use http or https protocol.' });
          }
        } catch {
          return res.status(400).json({ message: 'Azure endpoint must be a valid URL.' });
        }
        const keyVal = parsed.data.azureApiKey?.trim();
        if (!keyVal || keyVal.includes('••••')) {
          const org = await storage.getOrganization(orgId);
          const existingKey = ((org as any)?.fridayAgentConfig as any)?.azureApiKey || '';
          if (!existingKey) {
            return res.status(400).json({ message: 'Azure API key is required when using org-specific model.' });
          }
        }
      }
      const org = await storage.getOrganization(orgId);
      if (parsed.data.azureApiKey && parsed.data.azureApiKey.includes('••••')) {
        parsed.data.azureApiKey = ((org as any)?.fridayAgentConfig as any)?.azureApiKey || '';
      } else if (parsed.data.azureApiKey && parsed.data.azureApiKey.length > 0) {
        parsed.data.azureApiKey = encryptApiKey(parsed.data.azureApiKey);
      }
      const updated = await storage.updateOrganization(orgId, { fridayAgentConfig: parsed.data } as any);
      res.json((updated as any)?.fridayAgentConfig || parsed.data);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update Friday Agent config' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/scheduling-defaults', {
    tag: 'Organizations',
    summary: 'Get organization scheduling defaults',
    parameters: [pathId()],
    responses: { ...r200('Scheduling defaults', { type: 'object', properties: { defaultDependencyType: { type: 'string', enum: ['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'] }, defaultLagDays: { type: 'integer' }, enforceDefaults: { type: 'boolean' } } }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { DEFAULT_SCHEDULING_DEFAULTS } = await import('@shared/schema');
      res.json({ ...DEFAULT_SCHEDULING_DEFAULTS, ...(org.schedulingDefaults || {}) });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get scheduling defaults' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/scheduling-defaults', {
    tag: 'Organizations',
    summary: 'Update organization scheduling defaults',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { defaultDependencyType: { type: 'string', enum: ['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'] }, defaultLagDays: { type: 'integer' }, enforceDefaults: { type: 'boolean' } } }),
    responses: { ...r200('Scheduling defaults updated', { type: 'object', properties: { defaultDependencyType: { type: 'string', enum: ['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'] }, defaultLagDays: { type: 'integer' }, enforceDefaults: { type: 'boolean' } } }), ...updateRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const memberships = await storage.getUserOrganizations(userId!);
      const membership = memberships.find(m => m.organizationId === orgId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        const [user] = await db.select().from(users).where(eq(users.id, userId!));
        if (!hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Only admins can update scheduling defaults' });
        }
      }
      const { schedulingDefaultsSchema } = await import('@shared/schema');
      const parsed = schedulingDefaultsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid config', errors: parsed.error.flatten() });
      }
      const updated = await storage.updateOrganization(orgId, { schedulingDefaults: parsed.data });
      res.json(updated?.schedulingDefaults || parsed.data);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update scheduling defaults' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/project-tab-settings', {
    tag: 'Organizations',
    summary: 'Get organization project tab default order/visibility',
    parameters: [pathId()],
    responses: { ...r200('Project tab settings', { type: 'object', properties: { order: { type: 'array', items: { type: 'string' } }, hidden: { type: 'array', items: { type: 'string' } } } }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { DEFAULT_PROJECT_TAB_SETTINGS, resolveProjectTabOrder, resolveProjectTabHidden } = await import('@shared/projectTabs');
      const saved = (org as { projectTabSettings?: { order?: string[]; hidden?: string[] } | null }).projectTabSettings ?? null;
      res.json({
        order: saved ? resolveProjectTabOrder(saved) : DEFAULT_PROJECT_TAB_SETTINGS.order,
        hidden: saved ? Array.from(resolveProjectTabHidden(saved)) : DEFAULT_PROJECT_TAB_SETTINGS.hidden,
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get project tab settings' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/project-tab-settings', {
    tag: 'Organizations',
    summary: 'Update organization project tab default order/visibility',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { order: { type: 'array', items: { type: 'string' } }, hidden: { type: 'array', items: { type: 'string' } } } }),
    responses: { ...r200('Project tab settings updated', { type: 'object', properties: { order: { type: 'array', items: { type: 'string' } }, hidden: { type: 'array', items: { type: 'string' } } } }), ...updateRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const memberships = await storage.getUserOrganizations(userId!);
      const membership = memberships.find(m => m.organizationId === orgId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        const [user] = await db.select().from(users).where(eq(users.id, userId!));
        if (!hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Only admins can update project tab settings' });
        }
      }
      const { projectTabSettingsSchema, isKnownProjectTabId, resolveProjectTabOrder, resolveProjectTabHidden } = await import('@shared/projectTabs');
      const parsed = projectTabSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid project tab settings', errors: parsed.error.flatten() });
      }
      const dedupe = (ids: string[]) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const id of ids) {
          if (!isKnownProjectTabId(id) || seen.has(id)) continue;
          seen.add(id);
          out.push(id);
        }
        return out;
      };
      const cleaned = {
        order: dedupe(parsed.data.order),
        hidden: dedupe(parsed.data.hidden),
      };
      const updated = await storage.updateOrganization(orgId, { projectTabSettings: cleaned } as Record<string, unknown>);
      const saved = (updated as { projectTabSettings?: { order?: string[]; hidden?: string[] } | null } | undefined)?.projectTabSettings ?? cleaned;
      res.json({
        order: resolveProjectTabOrder(saved),
        hidden: Array.from(resolveProjectTabHidden(saved)),
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update project tab settings' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/integrations', {
    tag: 'Organizations',
    summary: 'Get organization integrations',
    parameters: [pathId()],
    responses: { ...r200('Integration settings', ref('Organization')), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Get all integrations for this organization
      const integrations = await storage.getOrganizationIntegrations(orgId);
      res.json(integrations);
    } catch (err) {
      console.error('Error fetching organization integrations:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch integrations' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/dashboard-tab-order', {
    tag: 'Organizations',
    summary: 'Update dashboard tab order',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { tabOrder: { type: 'array', items: { type: 'string' } } } }),
    responses: { ...r200('Tab order updated', ref('Organization')), ...updateRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if user is org admin
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      
      // Also allow super_admin
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      
      if (!isOrgAdmin && !isSuperAdmin) {
        return res.status(403).json({ message: 'Only organization admins can reorder dashboard tabs' });
      }
      
      const { tabOrder, hiddenTabs } = req.body;
      
      const updateData: { dashboardTabOrder?: string[]; dashboardHiddenTabs?: string[] } = {};
      
      if (tabOrder !== undefined) {
        if (!Array.isArray(tabOrder)) {
          return res.status(400).json({ message: 'tabOrder must be an array of tab IDs' });
        }
        updateData.dashboardTabOrder = tabOrder;
      }
      
      if (hiddenTabs !== undefined) {
        if (!Array.isArray(hiddenTabs)) {
          return res.status(400).json({ message: 'hiddenTabs must be an array of tab IDs' });
        }
        updateData.dashboardHiddenTabs = hiddenTabs;
      }
      
      const updated = await storage.updateOrganization(orgId, updateData);
      res.json({ tabOrder: updated.dashboardTabOrder, hiddenTabs: updated.dashboardHiddenTabs });
    } catch (err) {
      console.error('Error updating dashboard tab order:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update dashboard tab order' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/dashboard-tab-order', {
    tag: 'Organizations',
    summary: 'Get dashboard tab order',
    parameters: [pathId()],
    responses: { ...r200('Tab order', ref('Organization')), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const org = await storage.getOrganization(orgId);
      res.json({ tabOrder: org?.dashboardTabOrder || [], hiddenTabs: org?.dashboardHiddenTabs || [] });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get dashboard tab order' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:id/logo/upload-url', {
    tag: 'Organizations',
    summary: 'Get presigned logo upload URL',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { contentType: { type: 'string' } } }),
    responses: { ...r200('Upload URL', ref('Organization')), ...createRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath });
    } catch (err: any) {
      console.error("Error generating logo upload URL:", err);
      console.error("Error stack:", err?.stack);
      console.error("Error message:", err?.message);
      console.error("PRIVATE_OBJECT_DIR:", process.env.PRIVATE_OBJECT_DIR);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to generate upload URL' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:id/logo/upload', {
    tag: 'Organizations',
    summary: 'Upload organization logo directly',
    parameters: [pathId()],
    requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
    responses: { ...r200('Logo uploaded', { type: 'array', items: { type: 'object' } }), ...createRes },
  }, imageUpload.single('logo'), async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Generate unique filename
      const ext = req.file.mimetype.split('/')[1] || 'png';
      const filename = `logo-org-${orgId}-${Date.now()}.${ext}`;
      
      // Try object storage first, fall back to local storage
      let servePath: string;
      
      try {
        const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
        const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        
        if (privateObjectDir) {
          const objectPath = `${privateObjectDir}/uploads/${filename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');

          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          
          await file.save(req.file.buffer, {
            contentType: req.file.mimetype,
            metadata: {
              originalName: req.file.originalname,
              uploadedBy: userId,
            },
          });

          servePath = `/objects/uploads/${filename}`;
        } else {
          throw new Error('Object storage not configured');
        }
      } catch (objectStorageError) {
        // Fall back to local file storage
        console.log("Object storage unavailable for logo, using local storage:", (objectStorageError as Error).message);
        
        const logoDir = path.join(process.cwd(), 'public', 'logos');
        if (!fs.existsSync(logoDir)) {
          fs.mkdirSync(logoDir, { recursive: true });
        }
        
        const filePath = path.join(logoDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);
        
        servePath = `/logos/${filename}`;
      }
      
      // Update organization logo in database
      await storage.updateOrganization(orgId, { logoUrl: servePath });

      res.json({ objectPath: servePath, success: true });
    } catch (err) {
      console.error("Error uploading logo:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to upload logo' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:id', {
    tag: 'Organizations',
    summary: 'Delete organization',
    parameters: [pathId()],
    responses: { ...r200('Organization deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const deactivated = await storage.deactivateOrganization(orgId, userId);
      res.json({ message: 'Organization deactivated', organization: deactivated });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to deactivate organization' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/admin/organizations/deactivated', {
    tag: 'Admin',
    summary: 'List deactivated organizations',
    responses: { ...r200('Deactivated orgs', { type: 'object' }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || !hasAdminAccess(user)) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const deactivatedOrgs = await storage.getDeactivatedOrganizations();
      res.json(deactivatedOrgs);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get deactivated organizations' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/admin/organization-members', {
    tag: 'Admin',
    summary: 'List all organization members (admin)',
    responses: { ...r200('All org members', { type: 'array', items: { type: 'object' } }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || !hasAdminAccess(user)) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const allMembers = await db.select({
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
      }).from(organizationMembers);
      
      res.json(allMembers);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get organization members' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/admin/organizations/:id/reactivate', {
    tag: 'Admin',
    summary: 'Reactivate a deactivated organization',
    parameters: [pathId()],
    responses: { ...r200('Organization reactivated', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const reactivated = await storage.reactivateOrganization(orgId);
      res.json({ message: 'Organization reactivated', organization: reactivated });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to reactivate organization' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/admin/organizations/subscriptions', {
    tag: 'Admin',
    summary: 'List all organization subscriptions',
    responses: { ...r200('All subscriptions', { type: 'array', items: { type: 'object' } }), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const user = await storage.getUser(userId);
      if (!user || !hasAdminAccess(user)) return res.status(403).json({ message: 'Admin access required' });

      const allSubs = await db.select({
        orgId: subscriptions.orgId,
        planName: plans.name,
        planCode: plans.code,
        status: subscriptions.status,
      }).from(subscriptions)
        .leftJoin(plans, eq(subscriptions.planId, plans.id))
        .where(isNotNull(subscriptions.orgId));

      res.json(allSubs);
    } catch (err) {
      console.error("Error fetching all org subscriptions:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch subscriptions' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/admin/send-upgrade-offer', {
    tag: 'Admin',
    summary: 'Send upgrade offer email to users',
    requestBody: body({ type: 'object', required: ['userIds', 'customMessage'], properties: { userIds: { type: 'array', items: { type: 'string' } }, customMessage: { type: 'string' } } }),
    responses: { ...r200('Upgrade offers sent', { type: 'object' }), ...stdRes, ...e400 },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const adminUser = await storage.getUser(userId);
      if (!adminUser || !hasAdminAccess(adminUser)) return res.status(403).json({ message: 'Admin access required' });

      const { userIds, customMessage } = req.body;
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'userIds array is required' });
      }
      if (!customMessage || typeof customMessage !== 'string' || customMessage.trim().length === 0) {
        return res.status(400).json({ message: 'customMessage is required' });
      }
      if (userIds.length > 50) {
        return res.status(400).json({ message: 'Maximum 50 users per batch' });
      }

      const { sendUpgradeOfferEmail, verifyEmailConnection } = await import("../services/email");
      
      const emailConfigured = await verifyEmailConnection();
      if (!emailConfigured) {
        return res.status(503).json({ message: 'Email service is not configured. Please set up the RESEND_API_KEY to send emails.' });
      }

      const senderName = `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || 'FridayReport.AI Admin';

      const sendPromises = userIds.map(async (targetId: string) => {
        try {
          const targetUser = await storage.getUser(targetId);
          if (!targetUser || !targetUser.email) {
            return { userId: targetId, email: '', success: false };
          }
          const userName = `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || 'there';
          const success = await sendUpgradeOfferEmail({
            to: targetUser.email,
            userName,
            customMessage: customMessage.trim(),
            senderName,
          });
          return { userId: targetId, email: targetUser.email, success };
        } catch {
          return { userId: targetId, email: '', success: false };
        }
      });

      const results = await Promise.all(sendPromises);
      const sent = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      res.json({ sent, failed, results });
    } catch (err) {
      console.error("Error sending upgrade offers:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to send upgrade offers' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/admin/organizations/:id/billing', {
    tag: 'Admin',
    summary: 'Get organization billing info',
    parameters: [pathId()],
    responses: { ...r200('Organization billing info', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || !hasAdminAccess(user)) {
        return res.status(403).json({ message: 'Admin access required' });
      }
      
      const { billingProvider } = await import("../services/billing");
      const { plans, organizations } = await import("@shared/schema");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      const [org] = await db.select({ billingHidden: organizations.billingHidden }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
      
      // Get all available plans
      const allPlans = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.displayOrder);
      
      let currentPlan = null;
      if (subscription) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);
        currentPlan = plan;
      }
      
      res.json({
        subscription: subscription ? {
          id: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          bonusSeats: subscription.bonusSeats || 0,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd
        } : null,
        currentPlan,
        availablePlans: allPlans,
        billingHidden: org?.billingHidden ?? false
      });
    } catch (err) {
      console.error("Error fetching org billing:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch organization billing' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/admin/organizations/:id/billing', {
    tag: 'Admin',
    summary: 'Update organization billing',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { planCode: { type: 'string' }, bonusSeats: { type: 'integer' }, billingHidden: { type: 'boolean' } } }),
    responses: { ...r200('Organization billing updated', { type: 'object' }), ...fullRes, ...e400 },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { planCode, bonusSeats, billingHidden } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      if (billingHidden !== undefined) {
        const { organizations } = await import("@shared/schema");
        await db.update(organizations).set({ billingHidden: !!billingHidden }).where(eq(organizations.id, orgId));
      }
      
      const { billingProvider } = await import("../services/billing");
      const { plans, subscriptions, billingAuditLogs } = await import("@shared/schema");
      let subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      // If no subscription exists, create one
      if (!subscription && planCode) {
        subscription = await billingProvider.createSubscription({
          planCode,
          orgId
        });
      }
      
      if (!subscription) {
        return res.status(400).json({ message: 'No subscription found and no plan specified' });
      }
      
      // Update plan if specified
      if (planCode) {
        const [plan] = await db.select().from(plans).where(eq(plans.code, planCode)).limit(1);
        if (!plan) {
          return res.status(400).json({ message: `Plan not found: ${planCode}` });
        }
        
        await db
          .update(subscriptions)
          .set({ planId: plan.id })
          .where(eq(subscriptions.id, subscription.id));
        
        // Log the plan change
        await db.insert(billingAuditLogs).values({
          actorUserId: userId,
          orgId,
          action: "ADMIN_PLAN_CHANGE",
          entityType: "subscription",
          entityId: String(subscription.id),
          metadataJson: { newPlanCode: planCode, previousPlanId: subscription.planId }
        });
      }
      
      // Update bonus seats if specified
      if (bonusSeats !== undefined) {
        const parsedBonusSeats = Math.max(0, parseInt(bonusSeats) || 0);
        
        await db
          .update(subscriptions)
          .set({ bonusSeats: parsedBonusSeats })
          .where(eq(subscriptions.id, subscription.id));
        
        // Log the bonus seats change
        await db.insert(billingAuditLogs).values({
          actorUserId: userId,
          orgId,
          action: "ADMIN_BONUS_SEATS_CHANGE",
          entityType: "subscription",
          entityId: String(subscription.id),
          metadataJson: { bonusSeats: parsedBonusSeats, previousBonusSeats: subscription.bonusSeats || 0 }
        });
      }
      
      // Fetch updated subscription
      const [updatedSubscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id))
        .limit(1);
      
      let updatedPlan = null;
      if (updatedSubscription) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, updatedSubscription.planId)).limit(1);
        updatedPlan = plan;
      }
      
      res.json({
        message: 'Organization billing updated',
        subscription: updatedSubscription ? {
          id: updatedSubscription.id,
          planId: updatedSubscription.planId,
          status: updatedSubscription.status,
          bonusSeats: updatedSubscription.bonusSeats || 0
        } : null,
        currentPlan: updatedPlan
      });
    } catch (err) {
      console.error("Error updating org billing:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update organization billing' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/task-assignments', {
    tag: 'Organizations',
    summary: 'Get all task assignments for organization',
    parameters: [pathId()],
    responses: { ...r200('Task assignments', arrOf('Organization')), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Get all task assignments for projects in this organization
      const assignments = await db
        .select({
          taskId: taskResourceAssignments.taskId,
          resourceId: taskResourceAssignments.resourceId,
          resourceName: resources.displayName,
        })
        .from(taskResourceAssignments)
        .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
        .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(projects.organizationId, orgId));
      
      res.json(assignments);
    } catch (err) {
      console.error('Error fetching task assignments:', err);
      res.json([]);
    }
  });


}
