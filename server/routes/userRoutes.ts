import type { Express } from "express";
import path from "path";
import fs from "fs";
import * as crypto from "crypto";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { eq, and, desc, asc as ascOrder, sql, inArray } from "drizzle-orm";
import multer from "multer";
import { users, taskResourceAssignments, issues, resources, tasks, projects, portfolios, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, type Task, unconSelfieLeads } from "@shared/schema";
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
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";

export function registerUserRoutes(app: Express) {
  // --- Users (Admin) ---
  apiRoute(app, 'get', '/api/users', {
    tag: 'Users',
    summary: 'List all users',
    parameters: [qInt('organizationId', false, 'Filter by organization')],
    responses: { ...r200('List of users', arrOf('User')), ...authRes },
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
      
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
      
      // Admin roles can see all users
      if (hasAdminAccess(user)) {
        if (organizationId) {
          const orgMembers = await storage.getOrganizationMembers(organizationId);
          const memberUserIds = orgMembers.map(m => m.userId);
          const allUsers = await storage.getAllUsers();
          const orgUsers = allUsers.filter(u => memberUserIds.includes(u.id));
          return res.json(sanitizeUsers(orgUsers));
        }
        const allUsers = await storage.getAllUsers();
        return res.json(sanitizeUsers(allUsers));
      }
      
      // Non-super-admins must specify an organization
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }
      
      // Verify user has admin access to the requested organization
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === organizationId);
      
      if (!membership) {
        return res.json([]);
      }
      
      // Only org admins and owners can list all users in the org
      if (!['org_admin', 'owner'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required to list users' });
      }
      
      // Get users who are members of this organization
      const orgMembers = await storage.getOrganizationMembers(organizationId);
      const memberUserIds = orgMembers.map(m => m.userId);
      const allUsers = await storage.getAllUsers();
      const orgUsers = allUsers.filter(u => memberUserIds.includes(u.id));
      return res.json(sanitizeUsers(orgUsers));
    } catch (err) {
      console.error('Error listing org users:', err);
      res.status(500).json({ message: 'Failed to list organization users' });
    }
  });

  apiRoute(app, 'put', '/api/users/:userId/role', {
    tag: 'Users',
    summary: 'Update user role',
    parameters: [pathId('userId')],
    requestBody: body({ type: 'object', properties: { role: { type: 'string' } } }),
    responses: { ...r200('Role updated'), ...updateRes },
  }, async (req, res) => {
    try {
      // SECURITY: Only super_admin can change user roles
      const userId = req.session?.userId || (req.user as any)?.id;
      const currentUser = userId ? await storage.getUser(userId) : null;
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const { role } = req.body;
      
      // Validate role is a valid value
      const validRoles = ['user', 'super_admin', 'marketing'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be one of: ' + validRoles.join(', ') });
      }
      
      // Prevent self-demotion (super admin cannot remove their own super_admin role)
      if (currentUser.id === req.params.userId && role !== 'super_admin') {
        return res.status(400).json({ message: 'Cannot remove your own super admin role' });
      }
      
      const [updated] = await db.update(users)
        .set({ role })
        .where(eq(users.id, req.params.userId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error('Failed to update user role:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update user role' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/users/:userId/technician', {
    tag: 'Users',
    summary: 'Update user technician status',
    parameters: [pathId('userId')],
    requestBody: body({ type: 'object', properties: { isTechnician: { type: 'boolean' } } }),
    responses: { ...r200('Technician status updated'), ...updateRes },
  }, async (req, res) => {
    try {
      const currentUserId = req.session?.userId || (req.user as any)?.id;
      const currentUser = currentUserId ? await storage.getUser(currentUserId) : null;
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      const { isTechnician } = req.body;
      if (typeof isTechnician !== 'boolean') {
        return res.status(400).json({ message: 'isTechnician must be a boolean' });
      }

      const [updated] = await db.update(users)
        .set({ isTechnician })
        .where(eq(users.id, req.params.userId))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error('Failed to update technician status:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update technician status' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/users/:userId/deactivate', {
    tag: 'Users',
    summary: 'Deactivate a user',
    parameters: [pathId('userId')],
    responses: { ...r200('User deactivated'), ...fullRes },
  }, async (req, res) => {
    try {
      const currentUserId = req.session?.userId || (req.user as any)?.id;
      const currentUser = currentUserId ? await storage.getUser(currentUserId) : null;
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      // Prevent self-deactivation
      if (currentUser.id === req.params.userId) {
        return res.status(400).json({ message: 'Cannot deactivate yourself' });
      }
      
      const [updated] = await db.update(users)
        .set({ 
          deactivatedAt: new Date(),
          deactivatedBy: currentUser.id
        })
        .where(eq(users.id, req.params.userId))
        .returning();
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error('Failed to deactivate user:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to deactivate user' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/users/:userId/reactivate', {
    tag: 'Users',
    summary: 'Reactivate a user',
    parameters: [pathId('userId')],
    responses: { ...r200('User reactivated'), ...fullRes },
  }, async (req, res) => {
    try {
      const currentUserId = req.session?.userId || (req.user as any)?.id;
      const currentUser = currentUserId ? await storage.getUser(currentUserId) : null;
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }
      
      const [updated] = await db.update(users)
        .set({ 
          deactivatedAt: null,
          deactivatedBy: null
        })
        .where(eq(users.id, req.params.userId))
        .returning();
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error('Failed to reactivate user:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to reactivate user' : classified.message });
    }
  });

  apiRoute(app, 'patch', '/api/users/:userId/profile', {
    tag: 'Users',
    summary: 'Update user profile',
    parameters: [pathId('userId')],
    requestBody: body({ type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' } } }),
    responses: { ...r200('Profile updated'), ...updateRes },
  }, async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const targetUserId = req.params.userId;
      if (currentUserId !== targetUserId) {
        const currentUser = await storage.getUser(currentUserId);
        if (!currentUser || currentUser.role !== 'super_admin') {
          return res.status(403).json({ message: 'You can only update your own profile' });
        }
      }
      const { firstName, lastName, email, jobTitle, pmiId, linkedinUrl, publicProfileEnabled } = req.body;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) {
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ message: 'Invalid email format' });
        }
        updateData.email = email;
      }
      if (jobTitle !== undefined) updateData.jobTitle = typeof jobTitle === 'string' ? jobTitle.slice(0, 200) : null;
      if (pmiId !== undefined) {
        if (pmiId && (typeof pmiId !== 'string' || !/^[A-Za-z0-9\-]{1,20}$/.test(pmiId))) {
          return res.status(400).json({ message: 'PMI ID must be alphanumeric, up to 20 characters' });
        }
        updateData.pmiId = pmiId || null;
      }
      if (linkedinUrl !== undefined) {
        if (linkedinUrl && (typeof linkedinUrl !== 'string' || !/^https?:\/\/(www\.)?linkedin\.com\//i.test(linkedinUrl))) {
          return res.status(400).json({ message: 'LinkedIn URL must be a valid linkedin.com URL' });
        }
        updateData.linkedinUrl = linkedinUrl || null;
      }
      if (publicProfileEnabled !== undefined) updateData.publicProfileEnabled = !!publicProfileEnabled;
      const [updated] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, targetUserId))
        .returning();
      res.json(sanitizeUser(updated));
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update user profile' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/admin/selfie-leads', {
    tag: 'Users',
    summary: 'List selfie leads (admin)',
    responses: { ...r200('Selfie leads list'), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== 'super_admin' && user.role !== 'marketing')) {
        return res.status(403).json({ message: "Admin access required" });
      }
      const page = Math.max(1, Number(req.query.page) || 1);
      const exportAll = req.query.export === 'true';
      const limit = exportAll ? 10000 : Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;
      const searchQ = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      const sortField = typeof req.query.sort === 'string' ? req.query.sort : 'createdAt';
      const sortDirection = req.query.sortDir === 'asc' ? 'asc' : 'desc';
      const validSortFields: Record<string, typeof unconSelfieLeads.name> = {
        name: unconSelfieLeads.name,
        email: unconSelfieLeads.email,
        interviewer: unconSelfieLeads.interviewer,
        createdAt: unconSelfieLeads.createdAt,
      };
      const sortColumn = validSortFields[sortField] || unconSelfieLeads.createdAt;

      let baseQuery = db.select().from(unconSelfieLeads);
      let countQuery = db.select({ count: sql`count(*)::int` }).from(unconSelfieLeads);
      if (searchQ) {
        const pattern = `%${searchQ}%`;
        const searchCondition = sql`(${unconSelfieLeads.name} ILIKE ${pattern} OR ${unconSelfieLeads.email} ILIKE ${pattern} OR ${unconSelfieLeads.interviewer} ILIKE ${pattern})`;
        baseQuery = baseQuery.where(searchCondition) as typeof baseQuery;
        countQuery = countQuery.where(searchCondition) as typeof countQuery;
      }
      const [countResult] = await countQuery;
      const total = countResult?.count ?? 0;
      const orderFn = sortDirection === 'asc' ? ascOrder : desc;
      const leads = await (baseQuery as any)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);
      const [globalCount] = await db.select({ count: sql`count(*)::int` }).from(unconSelfieLeads);
      const [uniqueEmails] = await db.select({ count: sql`count(DISTINCT lower(${unconSelfieLeads.email}))::int` }).from(unconSelfieLeads);
      const [uniqueInterviewers] = await db.select({ count: sql`count(DISTINCT lower(${unconSelfieLeads.interviewer}))::int` }).from(unconSelfieLeads).where(sql`${unconSelfieLeads.interviewer} IS NOT NULL`);
      res.json({
        leads,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        summary: {
          totalLeads: globalCount?.count ?? 0,
          uniqueEmails: uniqueEmails?.count ?? 0,
          uniqueInterviewers: uniqueInterviewers?.count ?? 0,
        },
      });
    } catch (err) {
      console.error("Error fetching selfie leads:", err);
      res.status(500).json({ message: "Failed to fetch selfie leads" });
    }
  });

  apiRoute(app, 'post', '/api/admin/selfie-leads/send-followup', {
    tag: 'Users',
    summary: 'Send selfie lead followup emails',
    responses: { ...r200('Followup emails sent'), ...stdRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const user = await storage.getUser(userId);
      if (!user || (user.role !== 'super_admin' && user.role !== 'marketing')) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { leadIds } = req.body;
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ message: "At least one lead ID is required" });
      }
      if (leadIds.length > 500) {
        return res.status(400).json({ message: "Maximum 500 leads per batch" });
      }
      const validIds = leadIds.filter((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0);
      if (validIds.length === 0) {
        return res.status(400).json({ message: "No valid lead IDs provided" });
      }

      const leads = await db.select().from(unconSelfieLeads)
        .where(inArray(unconSelfieLeads.id, validIds));

      if (leads.length === 0) {
        return res.status(404).json({ message: "No leads found for the given IDs" });
      }

      const { sendUnconSelfieFollowupEmail } = await import("../services/email");
      const { generateSelfieOgImage } = await import("../selfie-og");

      const results: { id: number; email: string; success: boolean; error?: string }[] = [];

      for (const lead of leads) {
        try {
          const firstName = lead.name.trim();

          let selfieBuffer: Buffer | null = null;
          if (lead.photoPath) {
            try {
              if (lead.photoPath.startsWith('data:')) {
                const base64Data = lead.photoPath.split(',')[1];
                if (base64Data) {
                  selfieBuffer = Buffer.from(base64Data, 'base64');
                }
              } else if (lead.photoPath.startsWith('local:')) {
                const localFilename = lead.photoPath.replace('local:', '');
                const localPath = path.resolve(process.cwd(), 'server', 'selfie-uploads', localFilename);
                if (fs.existsSync(localPath)) {
                  selfieBuffer = fs.readFileSync(localPath);
                }
              } else {
                const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
                const oss = new ObjectStorageService();
                const file = await oss.getObjectEntityFile(lead.photoPath);
                const [contents] = await file.download();
                selfieBuffer = contents;
              }
            } catch (dlErr) {
              console.error(`[selfie-followup] Failed to download selfie for lead ${lead.id} (path: ${lead.photoPath?.substring(0, 50)}):`, dlErr);
            }
          } else {
            console.log(`[selfie-followup] Lead ${lead.id} has no photoPath`);
          }

          let brandedImage: Buffer | undefined;
          if (selfieBuffer) {
            try {
              brandedImage = await generateSelfieOgImage({
                userName: lead.name,
                interviewer: lead.interviewer,
                selfieBuffer,
              });
            } catch (ogErr) {
              console.error(`[selfie-followup] Failed to generate branded image for lead ${lead.id}:`, ogErr);
            }
          }

          const sent = await sendUnconSelfieFollowupEmail(lead.email, firstName, lead.shareToken, brandedImage, selfieBuffer);
          if (sent) {
            await db.update(unconSelfieLeads)
              .set({ followupSentAt: new Date() })
              .where(eq(unconSelfieLeads.id, lead.id));
          }
          results.push({ id: lead.id, email: lead.email, success: sent });
        } catch (leadErr: any) {
          console.error(`Error sending followup to lead ${lead.id}:`, leadErr);
          results.push({ id: lead.id, email: lead.email, success: false, error: leadErr.message || 'Unknown error' });
        }
      }

      const sent = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        message: `Sent ${sent} of ${results.length} emails${failed > 0 ? ` (${failed} failed)` : ''}`,
        sent,
        failed,
        results,
      });
    } catch (err) {
      console.error("Error sending selfie lead followup emails:", err);
      res.status(500).json({ message: "Failed to send followup emails" });
    }
  });

  apiRoute(app, 'get', '/api/users/:userId/profile-analytics', {
    tag: 'Users',
    summary: 'Get user profile analytics',
    parameters: [pathId('userId')],
    responses: { ...r200('Profile analytics data'), ...idRes },
  }, async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const targetUserId = req.params.userId;
      if (currentUserId !== targetUserId) {
        const currentUser = await storage.getUser(currentUserId);
        if (!currentUser || currentUser.role !== 'super_admin') {
          return res.status(403).json({ message: 'You can only view your own analytics' });
        }
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const { apiRequestLogs, userActivityLogs, featureUsageLogs } = await import("@shared/schema");
      const { count, sum } = await import("drizzle-orm");

      const projectsManaged = await db.select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(and(
          sql`(${projects.managerId} = ${targetUserId} OR ${projects.businessOwnerId} = ${targetUserId} OR ${projects.businessSponsorId} = ${targetUserId} OR ${projects.technicalLeadId} = ${targetUserId})`,
          sql`${projects.deletedAt} IS NULL`
        ));

      const tasksOwned = await db.select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.ownerId, targetUserId), sql`${tasks.deletedAt} IS NULL`));

      const tasksAssigned = await db.select({ count: sql<number>`count(DISTINCT ${tasks.id})::int` })
        .from(tasks)
        .innerJoin(taskResourceAssignments, eq(taskResourceAssignments.taskId, tasks.id))
        .innerJoin(resources, eq(resources.id, taskResourceAssignments.resourceId))
        .where(and(eq(resources.userId, targetUserId), sql`${tasks.deletedAt} IS NULL`));

      const tasksCompleted = await db.select({ count: sql<number>`count(DISTINCT ${tasks.id})::int` })
        .from(tasks)
        .leftJoin(taskResourceAssignments, eq(taskResourceAssignments.taskId, tasks.id))
        .leftJoin(resources, eq(resources.id, taskResourceAssignments.resourceId))
        .where(and(
          sql`(${tasks.ownerId} = ${targetUserId} OR ${resources.userId} = ${targetUserId})`,
          eq(tasks.status, 'Completed'),
          sql`${tasks.deletedAt} IS NULL`
        ));

      const issuesAssigned = await db.select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(
          sql`(${issues.assigneeId} = ${targetUserId} OR ${issues.ownerId} = ${targetUserId})`,
          eq(issues.itemType, 'issue'),
          sql`${issues.deletedAt} IS NULL`
        ));

      const risksAssigned = await db.select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(
          sql`(${issues.assigneeId} = ${targetUserId} OR ${issues.ownerId} = ${targetUserId})`,
          eq(issues.itemType, 'risk'),
          sql`${issues.deletedAt} IS NULL`
        ));

      const risksResolved = await db.select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(
          sql`(${issues.assigneeId} = ${targetUserId} OR ${issues.ownerId} = ${targetUserId})`,
          eq(issues.itemType, 'risk'),
          sql`${issues.status} IN ('Mitigated', 'Closed')`,
          sql`${issues.deletedAt} IS NULL`
        ));

      const milestonesOwned = await db.select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.ownerId, targetUserId), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'), sql`${tasks.deletedAt} IS NULL`));

      const portfoliosManaged = await db.select({ count: sql<number>`count(*)::int` })
        .from(portfolios)
        .where(and(
          sql`(${portfolios.managerId} = ${targetUserId} OR ${portfolios.businessOwnerId} = ${targetUserId})`,
          sql`${portfolios.deletedAt} IS NULL`
        ));

      const totalLogins = await db.select({ count: sql<number>`count(*)::int` })
        .from(apiRequestLogs)
        .where(and(
          eq(apiRequestLogs.userId, targetUserId),
          sql`${apiRequestLogs.path} = '/api/auth/user'`,
          sql`${apiRequestLogs.method} = 'GET'`
        ));

      const totalApiRequests = await db.select({ count: sql<number>`count(*)::int` })
        .from(apiRequestLogs)
        .where(eq(apiRequestLogs.userId, targetUserId));

      const weeklyActivity = await db.select({
        week: sql<string>`to_char(date_trunc('week', ${apiRequestLogs.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`
      })
        .from(apiRequestLogs)
        .where(and(
          eq(apiRequestLogs.userId, targetUserId),
          sql`${apiRequestLogs.createdAt} >= NOW() - INTERVAL '12 weeks'`
        ))
        .groupBy(sql`date_trunc('week', ${apiRequestLogs.createdAt})`)
        .orderBy(sql`date_trunc('week', ${apiRequestLogs.createdAt})`);

      const featureBreakdown = await db.select({
        feature: apiRequestLogs.path,
        count: sql<number>`count(*)::int`
      })
        .from(apiRequestLogs)
        .where(and(
          eq(apiRequestLogs.userId, targetUserId),
          sql`${apiRequestLogs.method} != 'OPTIONS'`,
          sql`${apiRequestLogs.createdAt} >= NOW() - INTERVAL '30 days'`
        ))
        .groupBy(apiRequestLogs.path)
        .orderBy(sql`count(*) DESC`)
        .limit(15);

      const featureCategories: Record<string, number> = {};
      for (const f of featureBreakdown) {
        let category = 'Other';
        const p = f.feature;
        if (p.includes('/projects')) category = 'Projects';
        else if (p.includes('/tasks')) category = 'Tasks';
        else if (p.includes('/issues') || p.includes('/risks')) category = 'Issues & Risks';
        else if (p.includes('/milestones')) category = 'Milestones';
        else if (p.includes('/portfolios')) category = 'Portfolios';
        else if (p.includes('/resources')) category = 'Resources';
        else if (p.includes('/timesheets') || p.includes('/timesheet')) category = 'Timesheets';
        else if (p.includes('/dashboard') || p.includes('/reports')) category = 'Reports & Dashboards';
        else if (p.includes('/auth')) category = 'Authentication';
        featureCategories[category] = (featureCategories[category] || 0) + f.count;
      }

      const recentActions = await db.select({
        action: userActivityLogs.action,
        entityType: userActivityLogs.entityType,
        createdAt: userActivityLogs.createdAt,
      })
        .from(userActivityLogs)
        .where(eq(userActivityLogs.userId, targetUserId))
        .orderBy(desc(userActivityLogs.createdAt))
        .limit(20);

      const stats = {
        projectsManaged: projectsManaged[0]?.count || 0,
        tasksOwned: tasksOwned[0]?.count || 0,
        tasksAssigned: tasksAssigned[0]?.count || 0,
        tasksCompleted: tasksCompleted[0]?.count || 0,
        issuesAssigned: issuesAssigned[0]?.count || 0,
        risksAssigned: risksAssigned[0]?.count || 0,
        risksResolved: risksResolved[0]?.count || 0,
        milestonesOwned: milestonesOwned[0]?.count || 0,
        portfoliosManaged: portfoliosManaged[0]?.count || 0,
        totalLogins: totalLogins[0]?.count || 0,
        totalApiRequests: totalApiRequests[0]?.count || 0,
      };

      const score =
        stats.projectsManaged * 15 +
        stats.portfoliosManaged * 20 +
        stats.tasksOwned * 3 +
        stats.tasksAssigned * 2 +
        stats.tasksCompleted * 5 +
        stats.issuesAssigned * 4 +
        stats.risksAssigned * 4 +
        stats.risksResolved * 8 +
        stats.milestonesOwned * 6 +
        Math.min(stats.totalLogins, 500) * 0.5 +
        Math.min(stats.totalApiRequests, 5000) * 0.02;

      const tiers = [
        { name: 'Beginner', minScore: 0, icon: 'seedling' },
        { name: 'Associate', minScore: 50, icon: 'leaf' },
        { name: 'Professional', minScore: 150, icon: 'star' },
        { name: 'Senior', minScore: 400, icon: 'award' },
        { name: 'Expert', minScore: 800, icon: 'trophy' },
        { name: 'Master', minScore: 1500, icon: 'crown' },
      ];

      let currentTier = tiers[0];
      let nextTier: typeof tiers[0] | null = tiers[1];
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (score >= tiers[i].minScore) {
          currentTier = tiers[i];
          nextTier = tiers[i + 1] || null;
          break;
        }
      }

      const progressToNext = nextTier
        ? Math.min(100, Math.round(((score - currentTier.minScore) / (nextTier.minScore - currentTier.minScore)) * 100))
        : 100;

      const achievementBadges = [
        { id: 'first-project', name: 'Project Starter', description: 'Manage your first project', icon: 'rocket', earned: stats.projectsManaged >= 1, threshold: 1, current: stats.projectsManaged, category: 'Projects' },
        { id: 'portfolio-leader', name: 'Portfolio Leader', description: 'Manage 5+ projects', icon: 'briefcase', earned: stats.projectsManaged >= 5, threshold: 5, current: stats.projectsManaged, category: 'Projects' },
        { id: 'project-master', name: 'Project Master', description: 'Manage 15+ projects', icon: 'building', earned: stats.projectsManaged >= 15, threshold: 15, current: stats.projectsManaged, category: 'Projects' },
        { id: 'task-starter', name: 'Task Tracker', description: 'Own 10+ tasks', icon: 'list-checks', earned: stats.tasksOwned >= 10, threshold: 10, current: stats.tasksOwned, category: 'Tasks' },
        { id: 'task-champion', name: 'Task Champion', description: 'Complete 25+ tasks', icon: 'check-circle', earned: stats.tasksCompleted >= 25, threshold: 25, current: stats.tasksCompleted, category: 'Tasks' },
        { id: 'task-legend', name: 'Task Legend', description: 'Complete 100+ tasks', icon: 'zap', earned: stats.tasksCompleted >= 100, threshold: 100, current: stats.tasksCompleted, category: 'Tasks' },
        { id: 'risk-manager', name: 'Risk Manager', description: 'Resolve 10+ risks', icon: 'shield', earned: stats.risksResolved >= 10, threshold: 10, current: stats.risksResolved, category: 'Risks' },
        { id: 'risk-master', name: 'Risk Master', description: 'Handle 25+ risks', icon: 'shield-check', earned: stats.risksAssigned >= 25, threshold: 25, current: stats.risksAssigned, category: 'Risks' },
        { id: 'issue-resolver', name: 'Issue Resolver', description: 'Handle 20+ issues', icon: 'bug', earned: stats.issuesAssigned >= 20, threshold: 20, current: stats.issuesAssigned, category: 'Issues' },
        { id: 'milestone-tracker', name: 'Milestone Tracker', description: 'Own 10+ milestones', icon: 'flag', earned: stats.milestonesOwned >= 10, threshold: 10, current: stats.milestonesOwned, category: 'Milestones' },
        { id: 'power-user', name: 'Power User', description: '100+ sessions', icon: 'activity', earned: stats.totalLogins >= 100, threshold: 100, current: stats.totalLogins, category: 'Engagement' },
        { id: 'dedicated', name: 'Dedicated PM', description: '500+ sessions', icon: 'flame', earned: stats.totalLogins >= 500, threshold: 500, current: stats.totalLogins, category: 'Engagement' },
        { id: 'portfolio-strategist', name: 'Portfolio Strategist', description: 'Manage 3+ portfolios', icon: 'layers', earned: stats.portfoliosManaged >= 3, threshold: 3, current: stats.portfoliosManaged, category: 'Portfolios' },
      ];

      res.json({
        stats,
        ranking: {
          score: Math.round(score),
          tier: currentTier,
          nextTier,
          progressToNext,
          tiers,
        },
        badges: achievementBadges,
        weeklyActivity,
        featureUsage: Object.entries(featureCategories).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        recentActions,
        memberSince: targetUser.createdAt,
      });
    } catch (err) {
      console.error('Profile analytics error:', err);
      res.status(500).json({ message: 'Failed to fetch profile analytics' });
    }
  });

  apiRoute(app, 'get', '/api/users/:userId/public-profile', {
    tag: 'Users',
    summary: 'Get user public profile',
    parameters: [pathId('userId')],
    responses: { ...r200('Public profile data'), ...idRes },
  }, async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser || !targetUser.publicProfileEnabled) {
        return res.status(404).json({ message: 'Profile not found' });
      }

      const { apiRequestLogs } = await import("@shared/schema");

      const projectsManaged = await db.select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(and(
          sql`(${projects.managerId} = ${targetUserId} OR ${projects.businessOwnerId} = ${targetUserId} OR ${projects.businessSponsorId} = ${targetUserId} OR ${projects.technicalLeadId} = ${targetUserId})`,
          sql`${projects.deletedAt} IS NULL`
        ));

      const tasksOwned = await db.select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.ownerId, targetUserId), sql`${tasks.deletedAt} IS NULL`));

      const tasksCompleted = await db.select({ count: sql<number>`count(DISTINCT ${tasks.id})::int` })
        .from(tasks)
        .leftJoin(taskResourceAssignments, eq(taskResourceAssignments.taskId, tasks.id))
        .leftJoin(resources, eq(resources.id, taskResourceAssignments.resourceId))
        .where(and(
          sql`(${tasks.ownerId} = ${targetUserId} OR ${resources.userId} = ${targetUserId})`,
          eq(tasks.status, 'Completed'),
          sql`${tasks.deletedAt} IS NULL`
        ));

      const issuesAssigned = await db.select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(
          sql`(${issues.assigneeId} = ${targetUserId} OR ${issues.ownerId} = ${targetUserId})`,
          eq(issues.itemType, 'issue'),
          sql`${issues.deletedAt} IS NULL`
        ));

      const risksAssigned = await db.select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(
          sql`(${issues.assigneeId} = ${targetUserId} OR ${issues.ownerId} = ${targetUserId})`,
          eq(issues.itemType, 'risk'),
          sql`${issues.deletedAt} IS NULL`
        ));

      const risksResolved = await db.select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(
          sql`(${issues.assigneeId} = ${targetUserId} OR ${issues.ownerId} = ${targetUserId})`,
          eq(issues.itemType, 'risk'),
          sql`${issues.status} IN ('Mitigated', 'Closed')`,
          sql`${issues.deletedAt} IS NULL`
        ));

      const milestonesOwned = await db.select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(eq(tasks.ownerId, targetUserId), eq(tasks.isMilestone, true), eq(tasks.taskType, 'Milestone'), sql`${tasks.deletedAt} IS NULL`));

      const portfoliosManaged = await db.select({ count: sql<number>`count(*)::int` })
        .from(portfolios)
        .where(and(
          sql`(${portfolios.managerId} = ${targetUserId} OR ${portfolios.businessOwnerId} = ${targetUserId})`,
          sql`${portfolios.deletedAt} IS NULL`
        ));

      const totalLogins = await db.select({ count: sql<number>`count(*)::int` })
        .from(apiRequestLogs)
        .where(and(
          eq(apiRequestLogs.userId, targetUserId),
          sql`${apiRequestLogs.path} = '/api/auth/user'`,
          sql`${apiRequestLogs.method} = 'GET'`
        ));

      const tasksAssigned = await db.select({ count: sql<number>`count(DISTINCT ${tasks.id})::int` })
        .from(tasks)
        .innerJoin(taskResourceAssignments, eq(taskResourceAssignments.taskId, tasks.id))
        .innerJoin(resources, eq(resources.id, taskResourceAssignments.resourceId))
        .where(and(eq(resources.userId, targetUserId), sql`${tasks.deletedAt} IS NULL`));

      const stats = {
        projectsManaged: projectsManaged[0]?.count || 0,
        tasksOwned: tasksOwned[0]?.count || 0,
        tasksAssigned: tasksAssigned[0]?.count || 0,
        tasksCompleted: tasksCompleted[0]?.count || 0,
        issuesAssigned: issuesAssigned[0]?.count || 0,
        risksAssigned: risksAssigned[0]?.count || 0,
        risksResolved: risksResolved[0]?.count || 0,
        milestonesOwned: milestonesOwned[0]?.count || 0,
        portfoliosManaged: portfoliosManaged[0]?.count || 0,
        totalLogins: totalLogins[0]?.count || 0,
      };

      const score =
        stats.projectsManaged * 15 +
        stats.portfoliosManaged * 20 +
        stats.tasksOwned * 3 +
        stats.tasksAssigned * 2 +
        stats.tasksCompleted * 5 +
        stats.issuesAssigned * 4 +
        stats.risksAssigned * 4 +
        stats.risksResolved * 8 +
        stats.milestonesOwned * 6 +
        Math.min(stats.totalLogins, 500) * 0.5;

      const tiers = [
        { name: 'Beginner', minScore: 0, icon: 'seedling' },
        { name: 'Associate', minScore: 50, icon: 'leaf' },
        { name: 'Professional', minScore: 150, icon: 'star' },
        { name: 'Senior', minScore: 400, icon: 'award' },
        { name: 'Expert', minScore: 800, icon: 'trophy' },
        { name: 'Master', minScore: 1500, icon: 'crown' },
      ];

      let currentTier = tiers[0];
      let nextTier: typeof tiers[0] | null = tiers[1];
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (score >= tiers[i].minScore) {
          currentTier = tiers[i];
          nextTier = tiers[i + 1] || null;
          break;
        }
      }

      const progressToNext = nextTier
        ? Math.min(100, Math.round(((score - currentTier.minScore) / (nextTier.minScore - currentTier.minScore)) * 100))
        : 100;

      const achievementBadges = [
        { id: 'first-project', name: 'Project Starter', description: 'Manage your first project', icon: 'rocket', earned: stats.projectsManaged >= 1, threshold: 1, current: stats.projectsManaged, category: 'Projects' },
        { id: 'portfolio-leader', name: 'Portfolio Leader', description: 'Manage 5+ projects', icon: 'briefcase', earned: stats.projectsManaged >= 5, threshold: 5, current: stats.projectsManaged, category: 'Projects' },
        { id: 'project-master', name: 'Project Master', description: 'Manage 15+ projects', icon: 'building', earned: stats.projectsManaged >= 15, threshold: 15, current: stats.projectsManaged, category: 'Projects' },
        { id: 'task-starter', name: 'Task Tracker', description: 'Own 10+ tasks', icon: 'list-checks', earned: stats.tasksOwned >= 10, threshold: 10, current: stats.tasksOwned, category: 'Tasks' },
        { id: 'task-champion', name: 'Task Champion', description: 'Complete 25+ tasks', icon: 'check-circle', earned: stats.tasksCompleted >= 25, threshold: 25, current: stats.tasksCompleted, category: 'Tasks' },
        { id: 'task-legend', name: 'Task Legend', description: 'Complete 100+ tasks', icon: 'zap', earned: stats.tasksCompleted >= 100, threshold: 100, current: stats.tasksCompleted, category: 'Tasks' },
        { id: 'risk-manager', name: 'Risk Manager', description: 'Resolve 10+ risks', icon: 'shield', earned: stats.risksResolved >= 10, threshold: 10, current: stats.risksResolved, category: 'Risks' },
        { id: 'risk-master', name: 'Risk Master', description: 'Handle 25+ risks', icon: 'shield-check', earned: stats.risksAssigned >= 25, threshold: 25, current: stats.risksAssigned, category: 'Risks' },
        { id: 'issue-resolver', name: 'Issue Resolver', description: 'Handle 20+ issues', icon: 'bug', earned: stats.issuesAssigned >= 20, threshold: 20, current: stats.issuesAssigned, category: 'Issues' },
        { id: 'milestone-tracker', name: 'Milestone Tracker', description: 'Own 10+ milestones', icon: 'flag', earned: stats.milestonesOwned >= 10, threshold: 10, current: stats.milestonesOwned, category: 'Milestones' },
        { id: 'power-user', name: 'Power User', description: '100+ sessions', icon: 'activity', earned: stats.totalLogins >= 100, threshold: 100, current: stats.totalLogins, category: 'Engagement' },
        { id: 'dedicated', name: 'Dedicated PM', description: '500+ sessions', icon: 'flame', earned: stats.totalLogins >= 500, threshold: 500, current: stats.totalLogins, category: 'Engagement' },
        { id: 'portfolio-strategist', name: 'Portfolio Strategist', description: 'Manage 3+ portfolios', icon: 'layers', earned: stats.portfoliosManaged >= 3, threshold: 3, current: stats.portfoliosManaged, category: 'Portfolios' },
      ];

      const displayName = [targetUser.firstName, targetUser.lastName].filter(Boolean).join(' ') || 'PM Professional';
      const jobTitle = targetUser.jobTitle || null;

      res.json({
        displayName,
        jobTitle,
        memberSince: targetUser.createdAt,
        stats: {
          projectsManaged: stats.projectsManaged,
          tasksCompleted: stats.tasksCompleted,
          risksManaged: stats.risksAssigned,
          issuesHandled: stats.issuesAssigned,
          milestonesOwned: stats.milestonesOwned,
          portfoliosManaged: stats.portfoliosManaged,
        },
        ranking: {
          score: Math.round(score),
          tier: currentTier,
          nextTier,
          progressToNext,
          tiers,
        },
        badges: achievementBadges.filter(b => b.earned).map(b => ({
          id: b.id,
          name: b.name,
          description: b.description,
          icon: b.icon,
          category: b.category,
        })),
        totalBadges: achievementBadges.length,
      });
    } catch (err) {
      console.error('Public profile error:', err);
      res.status(500).json({ message: 'Failed to fetch public profile' });
    }
  });

  apiRoute(app, 'get', '/api/users/:userId/badge-card.png', {
    tag: 'Users',
    summary: 'Get user badge card image',
    parameters: [pathId('userId')],
    responses: { '200': { description: 'Badge card PNG image', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } }, ...idRes },
  }, async (req, res) => {
    try {
      const { getBadgeOgData, generateBadgeOgImage } = await import("../badge-og");
      const ogData = await getBadgeOgData(req.params.userId);
      if (!ogData) {
        return res.status(404).json({ message: 'Profile not found' });
      }
      const pngBuffer = await generateBadgeOgImage(ogData);
      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': pngBuffer.length.toString(),
      });
      res.send(pngBuffer);
    } catch (err) {
      console.error('Badge card image generation error:', err);
      res.status(500).json({ message: 'Failed to generate badge card image' });
    }
  });

  apiRoute(app, 'get', '/api/users/:userId/badges/:badgeId/image.png', {
    tag: 'Users',
    summary: 'Get user badge image',
    parameters: [pathId('userId'), pathId('badgeId')],
    responses: { '200': { description: 'Badge PNG image', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } }, ...idRes },
  }, async (req, res) => {
    try {
      const { getSingleBadgeOgData, generateSingleBadgeImage } = await import("../badge-og");
      const badgeData = await getSingleBadgeOgData(req.params.userId, req.params.badgeId);
      if (!badgeData) {
        return res.status(404).json({ message: 'Badge not found' });
      }
      const pngBuffer = await generateSingleBadgeImage(badgeData);
      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': pngBuffer.length.toString(),
      });
      res.send(pngBuffer);
    } catch (err) {
      console.error('Single badge image generation error:', err);
      res.status(500).json({ message: 'Failed to generate badge image' });
    }
  });

  const selfieUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only JPEG, PNG, GIF, WebP, and HEIC images are allowed'));
    }
  });

  apiRoute(app, 'post', '/api/uncon2026/selfie', {
    tag: 'Users',
    summary: 'Submit UnCon selfie',
    requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { photo: { type: 'string', format: 'binary' }, name: { type: 'string' }, email: { type: 'string' }, interviewer: { type: 'string' } } } } } },
    responses: { ...r200('Selfie submitted'), ...inputRes },
  }, (req, res, next) => {
    selfieUpload.single('photo')(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Invalid file upload' });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const { name: userName, email, interviewer } = req.body;
      if (!userName || !email) {
        return res.status(400).json({ message: 'Name and email are required' });
      }
      if (typeof userName !== 'string' || userName.trim().length < 1 || userName.trim().length > 255) {
        return res.status(400).json({ message: 'Name must be between 1 and 255 characters' });
      }
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ message: 'A valid email address is required' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'A selfie photo is required' });
      }

      const shareToken = crypto.randomBytes(16).toString('hex');
      let photoPath: string | null = null;

      try {
        const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
        const oss = new ObjectStorageService();
        const uploadURL = await oss.getObjectEntityUploadURL();
        photoPath = oss.normalizeObjectEntityPath(uploadURL);

        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: req.file.buffer,
          headers: { 'Content-Type': req.file.mimetype },
        });

        if (!uploadResponse.ok) {
          console.error('Failed to upload selfie to object storage');
          photoPath = null;
        }
      } catch (uploadErr) {
        console.error('Object storage upload error:', uploadErr);
        photoPath = null;
      }

      if (!photoPath && req.file) {
        try {
          const uploadsDir = path.resolve(process.cwd(), 'server', 'selfie-uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
          const localFilename = `${shareToken}${ext}`;
          const localPath = path.join(uploadsDir, localFilename);
          fs.writeFileSync(localPath, req.file.buffer);
          photoPath = `local:${localFilename}`;
        } catch (localErr) {
          console.error('Local selfie save error:', localErr);
        }
      }

      if (!photoPath && req.file) {
        try {
          const base64 = req.file.buffer.toString('base64');
          photoPath = `data:${req.file.mimetype};base64,${base64}`;
        } catch (b64Err) {
          console.error('Base64 selfie fallback error:', b64Err);
        }
      }

      if (!photoPath) {
        return res.status(500).json({ message: 'Failed to save selfie photo. Please try again.' });
      }

      const { unconSelfieLeads } = await import("@shared/schema");
      const [lead] = await db.insert(unconSelfieLeads).values({
        name: userName.trim().slice(0, 255),
        email: email.trim().slice(0, 255),
        interviewer: interviewer?.trim()?.slice(0, 255) || null,
        photoPath,
        shareToken,
      }).returning();

      res.json({ success: true, shareToken: lead.shareToken });

      try {
        const { generateSelfieOgImage } = await import("../selfie-og");
        const { sendUnconSelfieThankYouEmail } = await import("../services/email");
        const brandedImage = await generateSelfieOgImage({
          userName: userName.trim(),
          interviewer: interviewer?.trim() || null,
          selfieBuffer: req.file!.buffer,
        });
        await sendUnconSelfieThankYouEmail(email.trim(), userName.trim(), brandedImage);
      } catch (emailErr) {
        console.error('Failed to send UnCon selfie thank-you email:', emailErr);
      }
    } catch (err) {
      console.error('Selfie submission error:', err);
      const { status, message } = classifyError(err);
      res.status(status).json({ message });
    }
  });

  apiRoute(app, 'get', '/api/uncon2026/selfie/:shareToken/og.png', {
    tag: 'Users',
    summary: 'Get selfie OG image',
    parameters: [pathStr('shareToken')],
    responses: { '200': { description: 'OG PNG image', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } }, ...e404 },
  }, async (req, res) => {
    try {
      const { unconSelfieLeads } = await import("@shared/schema");
      const [lead] = await db.select().from(unconSelfieLeads)
        .where(eq(unconSelfieLeads.shareToken, req.params.shareToken))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ message: 'Selfie not found' });
      }

      let selfieBuffer: Buffer | null = null;
      if (lead.photoPath) {
        try {
          if (lead.photoPath.startsWith('data:')) {
            const base64Data = lead.photoPath.split(',')[1];
            if (base64Data) {
              selfieBuffer = Buffer.from(base64Data, 'base64');
            }
          } else if (lead.photoPath.startsWith('local:')) {
            const localFilename = lead.photoPath.replace('local:', '');
            const localPath = path.resolve(process.cwd(), 'server', 'selfie-uploads', localFilename);
            if (fs.existsSync(localPath)) {
              selfieBuffer = fs.readFileSync(localPath);
            }
          } else {
            const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
            const oss = new ObjectStorageService();
            const file = await oss.getObjectEntityFile(lead.photoPath);
            const [contents] = await file.download();
            selfieBuffer = contents;
          }
        } catch (dlErr) {
          console.error('Failed to download selfie for OG image:', dlErr);
        }
      }

      const { generateSelfieOgImage } = await import("../selfie-og");
      const pngBuffer = await generateSelfieOgImage({
        userName: lead.name,
        interviewer: lead.interviewer,
        selfieBuffer,
      });

      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': pngBuffer.length.toString(),
      });
      res.send(pngBuffer);
    } catch (err) {
      console.error('Selfie OG image generation error:', err);
      res.status(500).json({ message: 'Failed to generate selfie image' });
    }
  });

  apiRoute(app, 'get', '/api/uncon2026/selfie/:shareToken/share', {
    tag: 'Users',
    summary: 'Get selfie share page',
    parameters: [pathStr('shareToken')],
    responses: { '200': { description: 'HTML share page' }, ...e404 },
  }, async (req, res) => {
    try {
      const { unconSelfieLeads } = await import("@shared/schema");
      const [lead] = await db.select().from(unconSelfieLeads)
        .where(eq(unconSelfieLeads.shareToken, req.params.shareToken))
        .limit(1);

      if (!lead) {
        return res.status(404).send('Not found');
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const ogImageUrl = `${baseUrl}/api/uncon2026/selfie/${lead.shareToken}/og.png`;
      const title = lead.interviewer
        ? `${lead.name} met ${lead.interviewer} at PMO unCON 2026!`
        : `${lead.name} at PMO unCON 2026!`;
      const description = `Great meeting you at PMO unCON 2026! PMO Global Alliance \u00B7 FridayReport.AI \u2014 Gold Sponsor.`;

      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      let fridayLogoDataUrl = '';
      let pmiPmogaLogoDataUrl = '';
      try {
        const sharp = (await import('sharp')).default;
        const logoPath = path.resolve(process.cwd(), 'client', 'public', 'logo-full.png');
        if (fs.existsSync(logoPath)) {
          const buf = await sharp(logoPath).resize(240, null, { fit: 'inside' }).png().toBuffer();
          fridayLogoDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
        }
        const pmiPath = path.resolve(process.cwd(), 'client', 'public', 'pmi-pmoga-logo.png');
        if (fs.existsSync(pmiPath)) {
          const buf2 = await sharp(pmiPath).resize(200, null, { fit: 'inside' }).png().toBuffer();
          pmiPmogaLogoDataUrl = `data:image/png;base64,${buf2.toString('base64')}`;
        }
      } catch {}

      const interviewerHtml = lead.interviewer
        ? `<p class="interviewer">Interviewed by <strong>${esc(lead.interviewer)}</strong></p>`
        : '';

      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(ogImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(baseUrl)}/api/uncon2026/selfie/${lead.shareToken}/share" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImageUrl)}" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 30%, #f5f6fa 100%); display: flex; flex-direction: column; align-items: center; }
    .header { width: 100%; background: #17255A; padding: 14px 24px; display: flex; align-items: center; justify-content: center; }
    .header img { height: 28px; filter: invert(1); }
    .header-text { color: white; font-size: 16px; font-weight: 700; }
    .container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 16px; width: 100%; max-width: 480px; }
    .card { background: white; border-radius: 20px; box-shadow: 0 8px 40px rgba(0,0,0,0.08); padding: 32px 24px; text-align: center; width: 100%; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(90deg, #fef3c7, #fde68a); border: 1px solid #fcd34d; border-radius: 999px; padding: 6px 16px; font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 20px; }
    .og-image { width: 100%; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    h1 { font-size: 22px; color: #17255A; margin-bottom: 8px; line-height: 1.3; }
    .subtitle { color: #FF751F; font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    .interviewer { color: #6b7280; font-size: 14px; margin-bottom: 16px; }
    .interviewer strong { color: #17255A; }
    .description { color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    .cta { display: inline-block; background: #FF751F; color: white; text-decoration: none; font-weight: 700; font-size: 15px; padding: 12px 32px; border-radius: 10px; transition: background 0.2s; }
    .cta:hover { background: #e86a15; }
    .logos { display: flex; align-items: center; justify-content: center; gap: 24px; margin-top: 24px; padding-top: 20px; border-top: 1px solid #f0f1f5; }
    .logos img { height: 24px; object-fit: contain; opacity: 0.7; }
    .logos .sep { width: 1px; height: 20px; background: #e5e7eb; }
    .footer { padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
    .gold-label { color: #d97706; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    ${fridayLogoDataUrl ? `<img src="${fridayLogoDataUrl}" alt="FridayReport.AI" />` : `<span class="header-text">FridayReport.AI</span>`}
  </div>
  <div class="container">
    <div class="card">
      <div class="badge">\u{1F4F8} PMO unCON 2026 \u00B7 Selfie Experience</div>
      <img src="${esc(ogImageUrl)}" alt="Selfie card" class="og-image" />
      <h1>${esc(lead.name)}</h1>
      <p class="subtitle">Great meeting you at PMO unCON 2026!</p>
      ${interviewerHtml}
      <p class="description">Snap a selfie, share the moment. Powered by FridayReport.AI \u2014 proud <span class="gold-label">Gold Sponsor</span> of PMO unCON North America 2026.</p>
      <a href="https://fridayreport.ai" class="cta" target="_blank" rel="noopener noreferrer">Learn about FridayReport.AI</a>
      <div class="logos">
        ${pmiPmogaLogoDataUrl ? `<img src="${pmiPmogaLogoDataUrl}" alt="PMI &middot; PMO Global Alliance" />` : `<span style="font-size:12px;font-weight:700;color:#9ca3af">PMI \u00B7 PMO Global Alliance</span>`}
        <div class="sep"></div>
        ${fridayLogoDataUrl ? `<img src="${fridayLogoDataUrl}" alt="FridayReport.AI" />` : `<span style="font-size:12px;font-weight:700;color:#17255A">FridayReport.AI</span>`}
      </div>
    </div>
  </div>
  <div class="footer">PMO unCON North America 2026 \u00B7 FridayReport.AI \u2014 Gold Sponsor</div>
</body>
</html>`);
    } catch (err) {
      console.error('Selfie share page error:', err);
      res.status(500).send('Something went wrong');
    }
  });

  apiRoute(app, 'patch', '/api/users/:userId/avatar', {
    tag: 'Users',
    summary: 'Update user avatar URL',
    parameters: [pathId('userId')],
    requestBody: body({ type: 'object', properties: { avatarUrl: { type: 'string' } } }),
    responses: { ...r200('Avatar updated'), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId || userId !== req.params.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { avatarUrl, avatarEmoji } = req.body;
      
      const updateData: any = { updatedAt: new Date() };
      
      if (avatarUrl !== undefined) {
        // For image uploads, set avatarUrl (primary) and profileImageUrl (legacy)
        updateData.avatarUrl = avatarUrl || null;
        updateData.profileImageUrl = avatarUrl || null;
      }
      
      if (avatarEmoji !== undefined) {
        // Store emoji in avatarUrl field with emoji: prefix
        updateData.avatarUrl = avatarEmoji ? `emoji:${avatarEmoji}` : null;
        // Clear image URL when using emoji
        updateData.profileImageUrl = null;
      }

      const [updated] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, req.params.userId))
        .returning();
      
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error("Error updating avatar:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update avatar' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/users/:userId/avatar/upload-url', {
    tag: 'Users',
    summary: 'Get presigned avatar upload URL',
    parameters: [pathId('userId')],
    requestBody: body({ type: 'object', properties: { contentType: { type: 'string' } } }),
    responses: { ...r200('Upload URL generated'), ...createRes },
  }, async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId || userId !== req.params.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { ObjectStorageService } = await import("../replit_integrations/object_storage/objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({ uploadURL, objectPath });
    } catch (err) {
      console.error("Error generating avatar upload URL:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to generate upload URL' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/users/:userId/avatar/upload', {
    tag: 'Users',
    summary: 'Upload user avatar directly',
    parameters: [pathId('userId')],
    requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
    responses: { ...r200('Avatar uploaded'), ...createRes },
  }, imageUpload.single('avatar'), async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId || userId !== req.params.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Generate unique filename
      const ext = req.file.mimetype.split('/')[1] || 'jpg';
      const filename = `avatar-${userId}-${Date.now()}.${ext}`;
      
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
        console.log("Object storage unavailable, using local storage:", (objectStorageError as Error).message);
        
        const avatarDir = path.join(process.cwd(), 'public', 'avatars');
        if (!fs.existsSync(avatarDir)) {
          fs.mkdirSync(avatarDir, { recursive: true });
        }
        
        const filePath = path.join(avatarDir, filename);
        fs.writeFileSync(filePath, req.file.buffer);
        
        servePath = `/avatars/${filename}`;
      }
      
      // Update user avatar in database
      await db.update(users)
        .set({ 
          avatarUrl: servePath, 
          profileImageUrl: servePath,
          updatedAt: new Date() 
        })
        .where(eq(users.id, req.params.userId));

      res.json({ objectPath: servePath, success: true });
    } catch (err) {
      console.error("Error uploading avatar:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to upload avatar' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/users/:userId', {
    tag: 'Users',
    summary: 'Delete a user',
    parameters: [pathId('userId')],
    responses: { ...r200('User deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check if current user is super admin
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser || currentUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super Admin access required' });
      }

      const targetUserId = req.params.userId;

      // Prevent deleting yourself
      if (targetUserId === currentUserId) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }

      // Delete the user (this also removes organization memberships)
      await storage.deleteUser(targetUserId);
      
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
      console.error('Error deleting user:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete user' : classified.message });
    }
  });

  // ===== USER CONSENT ENDPOINTS =====

  apiRoute(app, 'get', '/api/consents/status', {
    tag: 'Users',
    summary: 'Get user consent status',
    responses: { ...r200('Consent status'), ...authRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/consents', {
    tag: 'Users',
    summary: 'Get user consents',
    responses: { ...r200('User consents list'), ...authRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/consents', {
    tag: 'Users',
    summary: 'Record user consent',
    requestBody: body({ type: 'object', properties: { consentType: { type: 'string' }, version: { type: 'string' }, method: { type: 'string' } } }),
    responses: { ...r201('Consent recorded'), ...inputRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/consents/accept-all', {
    tag: 'Users',
    summary: 'Accept all current consents',
    responses: { ...r201('All consents accepted'), ...authRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/admin/consents', {
    tag: 'Users',
    summary: 'List all user consents (admin)',
    parameters: [qInt('limit', false, 'Limit'), qInt('offset', false, 'Offset')],
    responses: { ...r200('All consents list'), ...stdRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/admin/consents/stats', {
    tag: 'Users',
    summary: 'Get consent statistics (admin)',
    responses: { ...r200('Consent statistics'), ...stdRes },
  }, async (req, res) => {
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

  // ============ DELEGATE / ACT-AS MODE ============

  apiRoute(app, 'post', '/api/organizations/:orgId/act-as', {
    tag: 'Users',
    summary: 'Start delegate mode (act as another user)',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object', properties: { targetUserId: { type: 'string' } } }),
    responses: { ...r200('Delegate mode started'), ...fullRes, ...e400 },
  }, async (req, res) => {
    try {
      const realUserId = (req as any).session.userId;
      if (!realUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if ((req as any).session.actingAsUserId) {
        return res.status(400).json({ message: "Already acting as another user. Exit delegate mode first." });
      }

      const orgId = parseInt(req.params.orgId);
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ message: "targetUserId is required" });
      }

      if (targetUserId === realUserId) {
        return res.status(400).json({ message: "Cannot act as yourself" });
      }

      const [realUser] = await db.select().from(users).where(eq(users.id, realUserId)).limit(1);
      if (!realUser) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const isSuperAdmin = hasAdminAccess(realUser);
      if (!isSuperAdmin) {
        const realUserMemberships = await storage.getUserOrganizations(realUserId);
        const realUserMembership = realUserMemberships.find(m => m.organizationId === orgId);
        if (!realUserMembership || !['org_admin', 'owner'].includes(realUserMembership.role)) {
          return res.status(403).json({ message: "Only organization admins and owners can use delegate mode" });
        }
      }

      const targetMemberships = await storage.getUserOrganizations(targetUserId);
      const targetMembership = targetMemberships.find(m => m.organizationId === orgId);
      if (!targetMembership) {
        return res.status(400).json({ message: "Target user is not a member of this organization" });
      }

      const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!targetUser) {
        return res.status(400).json({ message: "Target user not found" });
      }

      (req as any).session.actingAsUserId = targetUserId;
      (req as any).session.actingAsOrgId = orgId;

      (req as any).session.save((err: any) => {
        if (err) {
          console.error("Failed to save session for act-as:", err);
          return res.status(500).json({ message: "Failed to start delegate mode" });
        }

        console.log(`[delegate] User ${realUserId} (${realUser.email}) started acting as ${targetUserId} (${targetUser.email}) in org ${orgId}`);

        res.json({
          success: true,
          actingAs: {
            id: targetUser.id,
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
            username: targetUser.username,
            email: targetUser.email,
          },
        });
      });
    } catch (error) {
      console.error("Act-as start error:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to start delegate mode" : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:orgId/act-as', {
    tag: 'Users',
    summary: 'Stop delegate mode',
    parameters: [pathId('orgId')],
    responses: { ...r200('Delegate mode stopped'), ...authRes },
  }, async (req, res) => {
    try {
      const realUserId = (req as any).session.userId;
      if (!realUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const wasActingAs = (req as any).session.actingAsUserId;

      delete (req as any).session.actingAsUserId;
      delete (req as any).session.actingAsOrgId;

      (req as any).session.save((err: any) => {
        if (err) {
          console.error("Failed to save session for act-as stop:", err);
          return res.status(500).json({ message: "Failed to stop delegate mode" });
        }

        if (wasActingAs) {
          console.log(`[delegate] User ${realUserId} stopped acting as ${wasActingAs}`);
        }

        res.json({ success: true });
      });
    } catch (error) {
      console.error("Act-as stop error:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to stop delegate mode" : classified.message });
    }
  });

}
