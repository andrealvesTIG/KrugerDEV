import type { Express } from "express";
import path from "path";
import fs from "fs";
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

export function registerOrganizationRoutes(app: Express) {
  // --- Organizations ---
  app.get('/api/organizations', async (req, res) => {
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

  app.get('/api/organizations/:id', async (req, res) => {
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

  app.post('/api/organizations', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating (except during onboarding where org is created by system)
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { name, slug, description, ownerId } = req.body;
      const org = await storage.createOrganization({ name, slug, description, ownerId });
      // Add creator as org_admin
      if (ownerId) {
        await storage.addOrganizationMember({ 
          organizationId: org.id, 
          userId: ownerId, 
          role: 'org_admin' 
        });
      }
      // Auto-assign FREE plan subscription to new organization
      try {
        const { billingProvider } = await import("../services/billing");
        await billingProvider.createSubscription({
          planCode: "FREE",
          orgId: org.id,
          userId: ownerId || undefined,
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

  app.put('/api/organizations/:id', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl } = req.body;
      const updated = await storage.updateOrganization(orgId, { name, description, hiddenModules, moduleOrder, hiddenGroups, sidebarStructure, logoUrl });
      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update organization' : classified.message });
    }
  });

  app.get('/api/organizations/:id/risk-assessment-config', async (req, res) => {
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

  app.put('/api/organizations/:id/risk-assessment-config', async (req, res) => {
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

  app.get('/api/organizations/:id/scheduling-defaults', async (req, res) => {
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

  app.put('/api/organizations/:id/scheduling-defaults', async (req, res) => {
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

  // Get all organization integrations with status
  app.get('/api/organizations/:id/integrations', async (req, res) => {
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

  // Dashboard tab order - admin only
  app.put('/api/organizations/:id/dashboard-tab-order', async (req, res) => {
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

  // Get dashboard tab order
  app.get('/api/organizations/:id/dashboard-tab-order', async (req, res) => {
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

  // Organization logo upload URL
  app.post('/api/organizations/:id/logo/upload-url', async (req, res) => {
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

  // Direct logo upload (uses local storage as fallback when object storage is unavailable)
  app.post('/api/organizations/:id/logo/upload', imageUpload.single('logo'), async (req, res) => {
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

  // Deactivate organization (soft delete)
  app.delete('/api/organizations/:id', async (req, res) => {
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

  // Get deactivated organizations (super_admin only)
  app.get('/api/admin/organizations/deactivated', async (req, res) => {
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

  // Get all organization members (super_admin only)
  app.get('/api/admin/organization-members', async (req, res) => {
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

  // Reactivate (restore) organization (super_admin only)
  app.post('/api/admin/organizations/:id/reactivate', async (req, res) => {
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

  app.get('/api/admin/organizations/subscriptions', async (req, res) => {
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

  // Send upgrade offer email to users (super_admin or marketing)
  app.post('/api/admin/send-upgrade-offer', async (req, res) => {
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
      console.log(`Upgrade offer sent by ${adminUser.email}: ${sent} sent, ${failed} failed, targets: ${userIds.join(', ')}`);
      res.json({ sent, failed, results });
    } catch (err) {
      console.error("Error sending upgrade offers:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to send upgrade offers' : classified.message });
    }
  });

  // Get organization billing info (super_admin only)
  app.get('/api/admin/organizations/:id/billing', async (req, res) => {
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

  // Update organization billing (super_admin only) - change plan and/or bonus seats
  app.put('/api/admin/organizations/:id/billing', async (req, res) => {
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

  // --- Get all task resource assignments for organization (for grouping) ---
  app.get('/api/organizations/:id/task-assignments', async (req, res) => {
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

  // --- Organization Members ---
  app.get('/api/organizations/:id/members', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const members = await storage.getOrganizationMembers(orgId);
      const allUsers = await storage.getAllUsers();
      const enrichedMembers = members.map(m => ({
        ...m,
        user: sanitizeUser(allUsers.find(u => u.id === m.userId))
      }));
      res.json(enrichedMembers);
    } catch (err) {
      res.json([]);
    }
  });

  app.get('/api/users/:userId/organizations', async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const targetUserId = req.params.userId;

      if (currentUserId !== targetUserId) {
        const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId));
        if (!currentUser || currentUser.role !== 'super_admin') {
          return res.status(403).json({ message: 'Access denied' });
        }
      }

      const memberships = await storage.getUserOrganizations(targetUserId);
      res.json(memberships);
    } catch (err) {
      console.error('Error fetching user organizations:', err);
      res.status(500).json({ message: 'Failed to fetch organizations' });
    }
  });

  app.post('/api/organizations/:id/members', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Check seat limit before adding member
      const { checkSeatLimit } = await import("../services/billing");
      const seatCheck = await checkSeatLimit(orgId, 1);
      if (!seatCheck.allowed) {
        return res.status(403).json({ 
          message: seatCheck.reason || 'Seat limit reached. Please upgrade your plan.',
          limitExceeded: true,
          resourceType: 'seats',
          currentSeats: seatCheck.currentSeats,
          maxSeats: seatCheck.maxSeats
        });
      }
      
      const { userId, role } = req.body;
      const member = await storage.addOrganizationMember({
        organizationId: orgId,
        userId,
        role: role || 'member'
      });
      
      // Automatically create a resource for this team member if one doesn't exist
      const existingResources = await storage.getResources(orgId);
      const existingResource = existingResources.find(r => r.userId === userId);
      
      if (!existingResource) {
        // Get user details for resource creation
        const user = await storage.getUser(userId);
        if (user) {
          await storage.createResource({
            organizationId: orgId,
            displayName: user.firstName && user.lastName 
              ? `${user.firstName} ${user.lastName}` 
              : user.username || user.email || 'Team Member',
            email: user.email || null,
            userId: userId,
            isActive: true,
            isApprover: false,
            isIntakeApprover: false,
          });
        }
      }
      
      res.status(201).json(member);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to add member' : classified.message });
    }
  });

  app.put('/api/organizations/:id/members/:userId', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const members = await storage.getOrganizationMembers(orgId);
      const requesterMembership = members.find(m => m.userId === currentUserId);
      if (!requesterMembership || (requesterMembership.role !== 'owner' && requesterMembership.role !== 'org_admin')) {
        const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId));
        if (!hasAdminAccess(currentUser)) {
          return res.status(403).json({ message: 'Only organization owners and admins can update member roles' });
        }
      }
      
      const targetMembership = members.find(m => m.userId === req.params.userId);
      if (targetMembership?.role === 'owner') {
        return res.status(403).json({ message: 'Cannot change the role of an organization owner' });
      }
      
      const { role } = req.body;
      const updated = await storage.updateOrganizationMemberRole(
        orgId,
        req.params.userId,
        role
      );
      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update member role' : classified.message });
    }
  });

  app.delete('/api/organizations/:id/members/:userId', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const members = await storage.getOrganizationMembers(orgId);
      const requesterMembership = members.find(m => m.userId === currentUserId);
      const targetUserId = req.params.userId;
      
      if (currentUserId !== targetUserId) {
        if (!requesterMembership || (requesterMembership.role !== 'owner' && requesterMembership.role !== 'org_admin')) {
          const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId));
          if (!hasAdminAccess(currentUser)) {
            return res.status(403).json({ message: 'Only organization owners and admins can remove members' });
          }
        }
      }
      
      const targetMembership = members.find(m => m.userId === targetUserId);
      if (targetMembership?.role === 'owner') {
        const ownerCount = members.filter(m => m.role === 'owner').length;
        if (ownerCount <= 1) {
          return res.status(403).json({ message: 'Cannot remove the last owner of an organization' });
        }
      }
      
      await storage.removeOrganizationMember(orgId, targetUserId);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to remove member' : classified.message });
    }
  });

  // --- Organization Seat Info ---
  app.get('/api/organizations/:id/seats', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { checkSeatLimit } = await import("../services/billing");
      const seatInfo = await checkSeatLimit(orgId, 0);
      
      // Also get the organization's subscription and plan info
      const { billingProvider } = await import("../services/billing");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      let planName = "Free";
      let planCode = "FREE";
      let extraSeatPriceCents: number | null = null;
      
      if (subscription) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);
        if (plan) {
          planName = plan.name;
          planCode = plan.code;
          extraSeatPriceCents = plan.extraSeatPriceCents;
        }
      }
      
      // Count pending invites
      const invites = await storage.getOrganizationInvites(orgId);
      const pendingInvites = invites.filter(i => i.status === 'pending').length;
      
      // Check if current user is admin
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      
      // Also check if user is super_admin
      const user = await storage.getUser(userId!);
      const isSuperAdmin = hasAdminAccess(user);
      
      const isAdmin = currentMember?.role === 'org_admin' || currentMember?.role === 'owner' || isSuperAdmin;
      
      res.json({
        ...seatInfo,
        pendingInvites,
        planName,
        planCode,
        subscriptionId: subscription?.id || null,
        bonusSeats: subscription?.bonusSeats || 0,
        extraSeatPriceCents,
        isAdmin
      });
    } catch (err) {
      console.error("Error fetching seat info:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to fetch seat information' : classified.message });
    }
  });

  // Remove extra seats from the organization
  // Remove extra seats from the organization
  app.post('/api/organizations/:id/seats/remove', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { quantity = 1 } = req.body;

      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Check if user is org admin or super admin
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      const user = await storage.getUser(userId!);
      const isSuperAdmin = hasAdminAccess(user);
      
      if (!isSuperAdmin && (!currentMember || !['org_admin', 'owner'].includes(currentMember.role))) {
        return res.status(403).json({ message: 'Only organization admins can remove seats' });
      }

      // Get organization subscription
      const { billingProvider } = await import("../services/billing");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);

      if (!subscription) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      const currentBonusSeats = subscription.bonusSeats || 0;
      if (currentBonusSeats < quantity) {
        return res.status(400).json({ message: "Cannot remove more seats than purchased extra seats" });
      }

      const newBonusSeats = currentBonusSeats - quantity;

      // Update bonus seats on subscription
      await db.update(subscriptions)
        .set({ bonusSeats: newBonusSeats })
        .where(eq(subscriptions.id, subscription.id));

      // Record in billing audit log
      await db.insert(billingAuditLogs).values({
        actorUserId: userId,
        orgId: orgId,
        action: "EXTRA_SEAT_REMOVED",
        entityType: "subscription",
        entityId: String(subscription.id),
        metadataJson: {
          quantity,
          previousBonusSeats: currentBonusSeats,
          newBonusSeats
        }
      });

      res.json({ message: "Extra seats removed successfully", bonusSeats: newBonusSeats });
    } catch (error: any) {
      console.error('Error removing extra seats:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to remove extra seats" : classified.message });
    }
  });

  app.post('/api/organizations/:id/seats/purchase', async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { quantity = 1 } = req.body;
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Check if user is org admin or super admin
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      const user = await storage.getUser(userId!);
      const isSuperAdmin = hasAdminAccess(user);
      
      if (!isSuperAdmin && (!currentMember || !['org_admin', 'owner'].includes(currentMember.role))) {
        return res.status(403).json({ message: 'Only organization admins can purchase extra seats' });
      }
      
      // Get organization subscription and plan
      const { billingProvider } = await import("../services/billing");
      const subscription = await billingProvider.getSubscriptionForOrg(orgId);
      
      if (!subscription) {
        return res.status(400).json({ message: 'No active subscription found. Please upgrade to a paid plan first.' });
      }
      
      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);
      
      if (!plan) {
        return res.status(400).json({ message: 'Plan not found' });
      }
      
      if (plan.extraSeatPriceCents === null) {
        return res.status(400).json({ message: 'Extra seats are not available for the Free plan. Please upgrade first.' });
      }
      
      // For Enterprise plan with $0 extra seats, just add them
      // For paid plans, we record the purchase
      const newBonusSeats = (subscription.bonusSeats || 0) + quantity;
      
      // Update bonus seats on subscription
      await db.update(subscriptions)
        .set({ bonusSeats: newBonusSeats })
        .where(eq(subscriptions.id, subscription.id));
      
      // Record in billing audit log
      await db.insert(billingAuditLogs).values({
        actorUserId: userId,
        orgId: orgId,
        action: "EXTRA_SEAT_PURCHASE",
        entityType: "subscription",
        entityId: String(subscription.id),
        metadataJson: { 
          quantity,
          pricePerSeatCents: plan.extraSeatPriceCents,
          totalCents: plan.extraSeatPriceCents * quantity,
          previousBonusSeats: subscription.bonusSeats || 0,
          newBonusSeats
        }
      });
      
      // Get updated seat info
      const { checkSeatLimit } = await import("../services/billing");
      const seatInfo = await checkSeatLimit(orgId, 0);
      
      res.json({
        success: true,
        message: `Successfully added ${quantity} extra seat${quantity > 1 ? 's' : ''} to your subscription`,
        bonusSeats: newBonusSeats,
        ...seatInfo
      });
    } catch (err) {
      console.error("Error purchasing extra seat:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to purchase extra seat' : classified.message });
    }
  });

}
