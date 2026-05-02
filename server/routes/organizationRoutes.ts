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

// Slugs that must never be used as an organization URL because they collide
// with public marketing/auth/share routes or with top-level API namespaces.
// Keep this in sync with `PUBLIC_PATH_PREFIXES` in `client/src/lib/orgUrl.ts`.
const RESERVED_ORG_SLUGS = new Set<string>([
  'api', 'admin', 'auth', 'new', 'signin', 'signup', 'signout', 'login', 'logout',
  'reset-password', 'verify-email', 'resource-invite', 'account-setup', 'onboarding',
  'terms', 'privacy', 'guide', 'friday', 'partners', 'uncon2026',
  'badges', 'media', 'investor-room', 'compare', 'embed',
  'healthcare', 'financial-services', 'manufacturing', 'industrial-automation',
  'construction', 'capital-projects', 'energy', 'government',
  'risk-assessment', 'project-risk-assessment',
  'static', 'public', 'assets', 'docs', 'app', 'www', 'support', 'help',
  'settings', 'organization', 'organizations', 'user', 'users',
]);

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

  // Resolve a slug-or-numeric-id to a lightweight org descriptor. Used by the
  // client to translate `?org=<slug-or-id>` URL parameters into the numeric id
  // that all other API calls require, without loading the full org list.
  // Returns membership status so the client can render an access-denied screen
  // when the URL points at an org the current user is not a member of.
  apiRoute(app, 'get', '/api/organizations/resolve', {
    tag: 'Organizations',
    summary: 'Resolve org slug or numeric id to a minimal descriptor',
    parameters: [qStr('key', true, 'Org slug (e.g. "acme") or numeric id')],
    responses: {
      ...r200('Resolved organization', { type: 'object', properties: {
        id: { type: 'integer' },
        slug: { type: 'string' },
        name: { type: 'string' },
        isMember: { type: 'boolean' },
      } }),
      ...authRes,
      ...e400,
    },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const key = String(req.query.key ?? '').trim();
      if (!key) return res.status(400).json({ message: 'Missing required query parameter "key"' });

      let org: Awaited<ReturnType<typeof storage.getOrganization>> | undefined;
      if (/^\d+$/.test(key)) {
        org = await storage.getOrganization(Number(key));
      } else {
        org = await storage.getOrganizationBySlug(key);
      }
      if (!org) return res.status(404).json({ message: 'Organization not found' });

      // We deliberately return a minimal payload (and an isMember flag) so the
      // resolver works even for non-members — the client uses this to render
      // the access-denied screen with the org's friendly name.
      const isMember = await userHasOrgAccess(userId, org.id);
      res.json({ id: org.id, slug: org.slug, name: org.name, isMember });
    } catch (err) {
      console.error('Error resolving organization key:', err);
      res.status(500).json({ message: 'Failed to resolve organization' });
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
      // Seed default intake & project workflows (best-effort)
      try {
        await storage.ensureDefaultIntakeWorkflow(org.id);
        await storage.ensureDefaultProjectWorkflow(org.id);
      } catch (wfErr) {
        console.error("Failed to seed default workflows for new org:", wfErr);
      }
      // Auto-apply the Generic PMO project tab template (best-effort)
      try {
        const { applyDefaultTemplateToOrg } = await import("../services/projectTabTemplateSeed");
        await applyDefaultTemplateToOrg(org.id, safeOwnerId);
      } catch (templateErr) {
        console.error("Failed to apply default project tab template to new organization:", templateErr);
      }
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
      const actingUser = userId ? await storage.getUser(userId) : null;
      const isSuperAdmin = actingUser?.role === 'super_admin';
      if (role !== 'org_admin' && !isSuperAdmin) {
        return res.status(403).json({ message: 'Only organization admins can update settings' });
      }
      
      const { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl, timezone, fiscalYearStartMonth, slug } = req.body;
      const updates: Record<string, unknown> = { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl, timezone };
      if (fiscalYearStartMonth !== undefined) {
        const n = Number(fiscalYearStartMonth);
        if (!Number.isInteger(n) || n < 1 || n > 12) {
          return res.status(400).json({ message: 'fiscalYearStartMonth must be an integer 1..12' });
        }
        updates.fiscalYearStartMonth = n;
      }
      if (slug !== undefined) {
        if (typeof slug !== 'string') {
          return res.status(400).json({ message: 'Organization URL must be a string' });
        }
        const trimmed = slug.trim();
        const SLUG_FORMAT = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
        if (trimmed.length < 3 || trimmed.length > 63 || !SLUG_FORMAT.test(trimmed)) {
          return res.status(400).json({
            message: 'Organization URL must be 3–63 characters, contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.',
          });
        }
        if (RESERVED_ORG_SLUGS.has(trimmed)) {
          return res.status(409).json({ message: 'This organization URL is reserved. Please choose a different one.' });
        }
        const existingOrg = await storage.getOrganizationBySlug(trimmed);
        if (existingOrg && existingOrg.id !== orgId) {
          return res.status(409).json({ message: 'This organization URL is already taken. Please choose a different one.' });
        }
        updates.slug = trimmed;
      }
      const updated = await storage.updateOrganization(orgId, updates);
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

  apiRoute(app, 'get', '/api/organizations/:id/financial-types', {
    tag: 'Organizations',
    summary: 'Get organization financial types config',
    parameters: [pathId()],
    responses: { ...r200('Financial types config', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { DEFAULT_FINANCIAL_TYPES, financialTypesConfigSchema } = await import('@shared/schema');
      const systemDefaults = DEFAULT_FINANCIAL_TYPES.types;
      // Validate stored config defensively; if it's malformed/null, fall back to defaults.
      const validated = financialTypesConfigSchema.safeParse(org.financialTypesConfig);
      const storedList = validated.success ? validated.data.types : [];
      const seenKeys = new Set(storedList.map(s => s.key));
      const merged = [...storedList];
      for (const sys of systemDefaults) {
        if (!seenKeys.has(sys.key)) merged.push(sys);
      }
      const finalList = merged.length > 0 ? merged : systemDefaults;
      res.json({ types: finalList });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get financial types' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/financial-types', {
    tag: 'Organizations',
    summary: 'Update organization financial types config',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Financial types config updated', { type: 'object' }), ...updateRes },
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
          return res.status(403).json({ message: 'Only admins can update financial types' });
        }
      }
      const { financialTypesConfigSchema, SYSTEM_FINANCIAL_TYPE_KEYS, DEFAULT_FINANCIAL_TYPES } = await import('@shared/schema');
      const parsed = financialTypesConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid types config', errors: parsed.error.flatten() });
      }
      const submittedKeys = new Set(parsed.data.types.map(s => s.key));
      // System types must remain present (may be renamed/disabled, never deleted).
      for (const sysKey of SYSTEM_FINANCIAL_TYPE_KEYS) {
        if (!submittedKeys.has(sysKey)) {
          return res.status(400).json({ message: `System type "${sysKey}" cannot be removed; disable it instead.` });
        }
      }
      // Force isSystem flag on the system types so the UI keeps treating them right.
      const sysSet = new Set<string>(SYSTEM_FINANCIAL_TYPE_KEYS);
      const normalized = {
        types: parsed.data.types.map(s => ({
          ...s,
          isSystem: sysSet.has(s.key) ? true : (s.isSystem ?? false),
        })),
      };

      // Compute newly-added (non-system) keys vs the previous config so we can
      // backfill cells for them.
      const org = await storage.getOrganization(orgId);
      const previousList = org?.financialTypesConfig?.types ?? [];
      const previousKeys = new Set<string>([
        ...previousList.map(s => s.key),
        ...DEFAULT_FINANCIAL_TYPES.types.map(s => s.key),
      ]);
      const newKeys = normalized.types.filter(s => !previousKeys.has(s.key)).map(s => s.key);

      // Backfill FIRST so we never persist a config whose cells we couldn't seed.
      // If any backfill fails the whole request fails and the config is unchanged.
      if (newKeys.length > 0) {
        const { backfillTypeCellsForOrg } = await import('../storage/financialStorage');
        for (const key of newKeys) {
          await backfillTypeCellsForOrg({ organizationId: orgId, typeKey: key });
        }
      }

      const updated = await storage.updateOrganization(orgId, { financialTypesConfig: normalized });
      res.json(updated.financialTypesConfig ?? normalized);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update financial types' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:id/cost-item-categories', {
    tag: 'Organizations',
    summary: 'Get organization cost item categories config',
    parameters: [pathId()],
    responses: { ...r200('Cost item categories config', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      const { DEFAULT_COST_ITEM_CATEGORIES, costItemCategoriesConfigSchema, SYSTEM_FINANCIAL_VIEW_KEYS, SYSTEM_COST_CATEGORY_KEYS } = await import('@shared/schema');
      // Defensively validate; on malformed/missing data, fall back to defaults.
      const validated = costItemCategoriesConfigSchema.safeParse(org.costItemCategoriesConfig);
      const stored = validated.success ? validated.data : DEFAULT_COST_ITEM_CATEGORIES;
      // Make sure system entries are always present (renamable/disable-able only).
      const sysViewKeys = new Set<string>(SYSTEM_FINANCIAL_VIEW_KEYS);
      const sysCatKeys = new Set<string>(SYSTEM_COST_CATEGORY_KEYS);
      const haveViewKeys = new Set(stored.views.map(v => v.key));
      const mergedViews = [...stored.views];
      for (const sv of DEFAULT_COST_ITEM_CATEGORIES.views) {
        if (!haveViewKeys.has(sv.key)) mergedViews.push(sv);
      }
      const haveCatKeys = new Set(stored.categories.map(c => c.key));
      const mergedCats = [...stored.categories];
      for (const sc of DEFAULT_COST_ITEM_CATEGORIES.categories) {
        if (!haveCatKeys.has(sc.key)) mergedCats.push(sc);
      }
      // Re-stamp isSystem on system entries.
      const finalViews = mergedViews.map(v => ({ ...v, isSystem: sysViewKeys.has(v.key) ? true : (v.isSystem ?? false) }));
      const finalCats = mergedCats.map(c => ({ ...c, isSystem: sysCatKeys.has(c.key) ? true : (c.isSystem ?? false) }));
      // If the org has no specifications yet, surface the best-practice
      // defaults so first-time admins see a usable starter taxonomy.
      // Existing custom specs are left alone.
      const finalSpecs = stored.specifications.length > 0
        ? stored.specifications
        : DEFAULT_COST_ITEM_CATEGORIES.specifications;
      res.json({ views: finalViews, categories: finalCats, specifications: finalSpecs });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get cost item categories' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/cost-item-categories', {
    tag: 'Organizations',
    summary: 'Update organization cost item categories config',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Cost item categories config updated', { type: 'object' }), ...updateRes },
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
          return res.status(403).json({ message: 'Only admins can update cost item categories' });
        }
      }
      const { costItemCategoriesConfigSchema, SYSTEM_FINANCIAL_VIEW_KEYS, SYSTEM_COST_CATEGORY_KEYS } = await import('@shared/schema');
      const parsed = costItemCategoriesConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid cost item categories config', errors: parsed.error.flatten() });
      }
      const submittedViewKeys = new Set(parsed.data.views.map(v => v.key));
      for (const sysKey of SYSTEM_FINANCIAL_VIEW_KEYS) {
        if (!submittedViewKeys.has(sysKey)) {
          return res.status(400).json({ message: `System financial view "${sysKey}" cannot be removed; disable it instead.` });
        }
      }
      const submittedCatKeys = new Set(parsed.data.categories.map(c => c.key));
      for (const sysKey of SYSTEM_COST_CATEGORY_KEYS) {
        if (!submittedCatKeys.has(sysKey)) {
          return res.status(400).json({ message: `System cost category "${sysKey}" cannot be removed; disable it instead.` });
        }
      }
      // Force isSystem flag on system entries so the UI keeps treating them right.
      const sysViewSet = new Set<string>(SYSTEM_FINANCIAL_VIEW_KEYS);
      const sysCatSet = new Set<string>(SYSTEM_COST_CATEGORY_KEYS);
      const normalized = {
        views: parsed.data.views.map(v => ({ ...v, isSystem: sysViewSet.has(v.key) ? true : (v.isSystem ?? false) })),
        categories: parsed.data.categories.map(c => ({ ...c, isSystem: sysCatSet.has(c.key) ? true : (c.isSystem ?? false) })),
        specifications: parsed.data.specifications.map(s => ({ ...s, isSystem: s.isSystem ?? false })),
      };
      const updated = await storage.updateOrganization(orgId, { costItemCategoriesConfig: normalized });
      res.json(updated.costItemCategoriesConfig ?? normalized);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update cost item categories' : classified.message });
    }
  });

  // ===================== FINANCIAL LOCKDOWNS =====================
  apiRoute(app, 'get', '/api/organizations/:id/financial-lockdowns', {
    tag: 'Organizations',
    summary: 'List financial lockdowns for an organization',
    parameters: [pathId()],
    responses: { ...r200('Lockdowns', { type: 'array', items: { type: 'object' } }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await ensureOrgAdminOrSuper(userId, orgId)) {
        return res.status(403).json({ message: 'Only organization admins can manage lockdowns' });
      }
      const rows = await storage.getFinancialLockdowns(orgId);
      res.json(rows);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to list lockdowns' : classified.message });
    }
  });

  async function ensureOrgAdminOrSuper(userId: string | null | undefined, orgId: number): Promise<boolean> {
    if (!userId) return false;
    const memberships = await storage.getUserOrganizations(userId);
    const m = memberships.find(x => x.organizationId === orgId);
    if (m && (m.role === 'org_admin' || m.role === 'owner')) return true;
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return hasAdminAccess(u);
  }

  async function validateLockdownTypeKey(orgId: number, typeKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const { DEFAULT_FINANCIAL_TYPES, financialTypesConfigSchema } = await import('@shared/schema');
    const org = await storage.getOrganization(orgId);
    const validated = financialTypesConfigSchema.safeParse(org?.financialTypesConfig);
    const list = validated.success ? validated.data.types : [];
    const seen = new Set(list.map(s => s.key));
    const merged = [...list];
    for (const sys of DEFAULT_FINANCIAL_TYPES.types) {
      if (!seen.has(sys.key)) merged.push(sys);
    }
    const found = merged.find(t => t.key === typeKey);
    if (!found) {
      return { ok: false, message: `Unknown financial type "${typeKey}" for this organization` };
    }
    if (!found.enabled) {
      return { ok: false, message: `Financial type "${found.label}" is disabled and cannot be locked down` };
    }
    return { ok: true };
  }

  apiRoute(app, 'post', '/api/organizations/:id/financial-lockdowns', {
    tag: 'Organizations',
    summary: 'Create a financial lockdown',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Created', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await ensureOrgAdminOrSuper(userId, orgId)) {
        return res.status(403).json({ message: 'Only organization admins can manage lockdowns' });
      }
      const { financialLockdownInputSchema } = await import('@shared/schema');
      const parsed = financialLockdownInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid lockdown payload', errors: parsed.error.flatten() });
      }
      const validation = await validateLockdownTypeKey(orgId, parsed.data.financialTypeKey);
      if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
      }
      const created = await storage.createFinancialLockdown({
        organizationId: orgId,
        financialTypeKey: parsed.data.financialTypeKey,
        lockdownDate: parsed.data.lockdownDate,
        note: parsed.data.note ?? null,
        createdBy: userId ?? null,
      });
      res.status(201).json(created);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create lockdown' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:id/financial-lockdowns/:lockdownId', {
    tag: 'Organizations',
    summary: 'Update a financial lockdown',
    parameters: [pathId(), { name: 'lockdownId', in: 'path', required: true, schema: { type: 'integer' } }],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const lockdownId = Number(req.params.lockdownId);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await ensureOrgAdminOrSuper(userId, orgId)) {
        return res.status(403).json({ message: 'Only organization admins can manage lockdowns' });
      }
      const existing = await storage.getFinancialLockdown(lockdownId);
      if (!existing || existing.organizationId !== orgId) {
        return res.status(404).json({ message: 'Lockdown not found' });
      }
      const { financialLockdownInputSchema } = await import('@shared/schema');
      const parsed = financialLockdownInputSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid lockdown payload', errors: parsed.error.flatten() });
      }
      if (parsed.data.financialTypeKey) {
        const validation = await validateLockdownTypeKey(orgId, parsed.data.financialTypeKey);
        if (!validation.ok) {
          return res.status(400).json({ message: validation.message });
        }
      }
      const updated = await storage.updateFinancialLockdown(lockdownId, {
        financialTypeKey: parsed.data.financialTypeKey,
        lockdownDate: parsed.data.lockdownDate,
        note: parsed.data.note,
        updatedBy: userId ?? null,
      });
      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update lockdown' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:id/financial-lockdowns/:lockdownId', {
    tag: 'Organizations',
    summary: 'Delete a financial lockdown',
    parameters: [pathId(), { name: 'lockdownId', in: 'path', required: true, schema: { type: 'integer' } }],
    responses: { ...r204('Deleted'), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const lockdownId = Number(req.params.lockdownId);
      const userId = getUserIdFromRequest(req);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await ensureOrgAdminOrSuper(userId, orgId)) {
        return res.status(403).json({ message: 'Only organization admins can manage lockdowns' });
      }
      const existing = await storage.getFinancialLockdown(lockdownId);
      if (!existing || existing.organizationId !== orgId) {
        return res.status(404).json({ message: 'Lockdown not found' });
      }
      await storage.deleteFinancialLockdown(lockdownId);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete lockdown' : classified.message });
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
