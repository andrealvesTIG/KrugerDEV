import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { users, organizationInvites, plans, subscriptions, billingAuditLogs, notifications, passwordResetTokens, type Task } from "@shared/schema";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../services/email";
import { hashPassword } from "../auth/emailAuth";
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
import { sendOrganizationInviteEmail, sendAccessRequestNotification, sendAccessRequestDecisionNotification } from "../services/email";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";

export function registerOrgMemberRoutes(app: Express) {
  // --- Organization Invites ---
  apiRoute(app, 'get', '/api/organizations/:id/invites', {
    tag: 'Organization Members',
    summary: 'List pending invites',
    parameters: [pathId()],
    responses: { ...r200('List of invites', arrOf('User')), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const invites = await storage.getOrganizationInvites(orgId);
      res.json(invites);
    } catch (err) {
      res.json([]);
    }
  });

  apiRoute(app, 'post', '/api/organizations/:id/invites', {
    tag: 'Organization Members',
    summary: 'Send organization invite',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { email: { type: 'string' }, role: { type: 'string' } } }),
    responses: { ...r201('Invite sent', ref('User')), ...createRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(currentUserId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { emails, role } = req.body;
      
      // Validate input
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ message: 'Emails array is required' });
      }
      
      // Validate role if provided
      const validOrgRoles = ['member', 'org_admin', 'team_member'];
      if (role && !validOrgRoles.includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be one of: ' + validOrgRoles.join(', ') });
      }
      
      // Limit batch size to prevent abuse
      if (emails.length > 50) {
        return res.status(400).json({ message: 'Maximum 50 invites per request' });
      }
      
      // Check seat limit before sending invites
      // Count pending invites as they will become members
      const { checkSeatLimit } = await import("../services/billing");
      const existingMembers = await storage.getOrganizationMembers(orgId);
      const existingInvites = await storage.getOrganizationInvites(orgId);
      const pendingInviteCount = existingInvites.filter(i => i.status === 'pending').length;
      
      // Check if adding new invites would exceed limit
      // We need to consider: current members + pending invites + new invites
      const seatCheck = await checkSeatLimit(orgId, 0);
      const currentTotal = existingMembers.length + pendingInviteCount;
      const maxSeats = seatCheck.maxSeats;
      
      if (maxSeats !== null && currentTotal >= maxSeats) {
        return res.status(403).json({ 
          message: `Your plan allows ${maxSeats} seat${maxSeats === 1 ? '' : 's'}. You have ${existingMembers.length} member${existingMembers.length === 1 ? '' : 's'} and ${pendingInviteCount} pending invite${pendingInviteCount === 1 ? '' : 's'}. Please upgrade your plan to invite more team members.`,
          limitExceeded: true,
          resourceType: 'seats',
          currentSeats: existingMembers.length,
          pendingInvites: pendingInviteCount,
          maxSeats: maxSeats
        });
      }
      
      // Calculate how many more invites we can send
      const availableSlots = maxSeats !== null ? maxSeats - currentTotal : Infinity;
      
      const results: { success: string[]; skipped: string[]; errors: string[] } = {
        success: [],
        skipped: [],
        errors: []
      };
      
      const allUsers = await storage.getAllUsers();
      let invitesSent = 0;
      
      for (const email of emails) {
        const normalizedEmail = email.trim().toLowerCase();
        
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          results.errors.push(`Invalid email: ${email}`);
          continue;
        }
        
        const existingUser = allUsers.find(u => u.email?.toLowerCase() === normalizedEmail);
        if (existingUser && existingMembers.some(m => m.userId === existingUser.id)) {
          results.skipped.push(`${normalizedEmail} is already a member`);
          continue;
        }
        
        const pendingInvite = existingInvites.find(i => 
          i.email.toLowerCase() === normalizedEmail && i.status === 'pending'
        );
        if (pendingInvite) {
          results.skipped.push(`${normalizedEmail} already has a pending invite`);
          continue;
        }
        
        // Cancel any existing non-pending invites to allow re-invites (database has unique constraint on org+email)
        const existingInvite = existingInvites.find(i => 
          i.email.toLowerCase() === normalizedEmail && i.status !== 'pending'
        );
        if (existingInvite) {
          await db.delete(organizationInvites).where(eq(organizationInvites.id, existingInvite.id));
        }
        
        // Check if we've reached the seat limit
        if (invitesSent >= availableSlots) {
          results.errors.push(`${normalizedEmail}: Seat limit reached. Upgrade to invite more.`);
          continue;
        }
        
        try {
          if (maxSeats !== null) {
            const freshMembers = await storage.getOrganizationMembers(orgId);
            const freshInvites = await storage.getOrganizationInvites(orgId);
            const freshPending = freshInvites.filter(i => i.status === 'pending').length;
            if (freshMembers.length + freshPending >= maxSeats) {
              results.errors.push(`${normalizedEmail}: Seat limit reached. Upgrade to invite more.`);
              continue;
            }
          }

          // Generate a secure token for the magic link
          const crypto = await import('crypto');
          const inviteToken = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
          
          await storage.createOrganizationInvite({
            organizationId: orgId,
            email: normalizedEmail,
            role: role || 'member',
            invitedBy: currentUserId,
            status: 'pending',
            token: inviteToken,
            expiresAt: expiresAt
          });
          results.success.push(normalizedEmail);
          invitesSent++;
          
          // Send invitation email
          const org = await storage.getOrganization(orgId);
          const inviter = currentUserId ? await storage.getUser(currentUserId) : null;
          const inviterName = inviter 
            ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.email || 'An administrator'
            : 'An administrator';
          const appUrl = 'https://fridayreport.ai';
          
          if (org) {
            await sendOrganizationInviteEmail(
              normalizedEmail,
              org.name,
              inviterName,
              role || 'member',
              appUrl,
              inviteToken
            );
          }
        } catch (err) {
          results.errors.push(`Failed to invite ${normalizedEmail}`);
        }
      }
      
      res.status(201).json(results);
    } catch (err) {
      console.error('Failed to create invites:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create invites' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:id/invites/:inviteId', {
    tag: 'Organization Members',
    summary: 'Cancel an invite',
    parameters: [pathId(), pathId('inviteId')],
    responses: { ...r200('Invite cancelled', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      await storage.cancelOrganizationInvite(inviteId);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to cancel invite' : classified.message });
    }
  });

  // Resend invite email
  apiRoute(app, 'post', '/api/organizations/:id/invites/:inviteId/resend', {
    tag: 'Organization Members',
    summary: 'Resend an invite',
    parameters: [pathId(), pathId('inviteId')],
    responses: { ...r200('Invite resent', ref('User')), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const inviteId = Number(req.params.inviteId);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Get the invite
      const invites = await storage.getOrganizationInvites(orgId);
      const invite = invites.find(i => i.id === inviteId);
      
      if (!invite) {
        return res.status(404).json({ message: 'Invite not found' });
      }
      
      if (invite.status !== 'pending') {
        return res.status(400).json({ message: 'Can only resend pending invites' });
      }
      
      // Generate new token and update expiration
      const crypto = await import('crypto');
      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      await storage.resendOrganizationInvite(inviteId, newToken, newExpiresAt);
      
      // Get org and inviter info for email
      const org = await storage.getOrganization(orgId);
      const inviter = currentUserId ? await storage.getUser(currentUserId) : null;
      const inviterName = inviter 
        ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.email || 'An administrator'
        : 'An administrator';
      const appUrl = 'https://fridayreport.ai';
      
      if (org) {
        await sendOrganizationInviteEmail(
          invite.email,
          org.name,
          inviterName,
          invite.role,
          appUrl,
          newToken
        );
      }
      
      res.json({ message: 'Invitation email resent successfully' });
    } catch (err) {
      console.error('Failed to resend invite:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to resend invite' : classified.message });
    }
  });

  // Magic link invite acceptance - validates token and accepts invite for logged in user
  apiRoute(app, 'post', '/api/invites/accept', {
    tag: 'Organization Members',
    summary: 'Accept an invite',
    requestBody: body({ type: 'object', properties: { token: { type: 'string' } } }),
    responses: { ...r200('Invite accepted', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: 'Invite token is required' });
      }
      
      if (!currentUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Look up the invite by token
      const invite = await storage.getOrganizationInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ message: 'Invalid or expired invitation link' });
      }
      
      if (invite.status !== 'pending') {
        return res.status(400).json({ 
          message: invite.status === 'accepted' 
            ? 'This invitation has already been accepted' 
            : 'This invitation is no longer valid' 
        });
      }
      
      // Check if invite has expired
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ message: 'This invitation has expired. Please ask for a new invite.' });
      }
      
      // Verify the user's email matches the invite
      const user = await storage.getUser(currentUserId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if email matches (case insensitive)
      if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(403).json({ 
          message: `This invitation was sent to ${invite.email}. Please log in with that email address or ask for a new invitation.` 
        });
      }
      
      // Accept the invite
      const member = await storage.acceptOrganizationInvite(invite.id, currentUserId);
      
      if (!member) {
        return res.status(500).json({ message: 'Failed to accept invitation' });
      }
      
      // Automatically create a resource for this team member if one doesn't exist
      const existingResources = await storage.getResources(invite.organizationId);
      const existingResource = existingResources.find(r => r.userId === currentUserId);
      
      if (!existingResource && user) {
        await storage.createResource({
          organizationId: invite.organizationId,
          displayName: user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}` 
            : user.username || user.email || 'Team Member',
          email: user.email || null,
          userId: currentUserId,
          isActive: true,
          isApprover: false,
          isIntakeApprover: false,
        });
      }
      
      // Get organization details for response
      const org = await storage.getOrganization(invite.organizationId);
      
      res.json({ 
        message: 'Successfully joined organization',
        organization: org,
        role: invite.role
      });
    } catch (err) {
      console.error('Failed to accept invite:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to accept invitation' : classified.message });
    }
  });

  // Get invite details by token (for displaying invite info before login)
  apiRoute(app, 'get', '/api/invites/:token', {
    tag: 'Organization Members',
    summary: 'Get invite details by token',
    parameters: [pathStr('token')],
    responses: { ...r200('Invite details', ref('User')), ...e404 },
  }, async (req, res) => {
    try {
      const { token } = req.params;
      
      const invite = await storage.getOrganizationInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ message: 'Invalid or expired invitation link' });
      }
      
      if (invite.status !== 'pending') {
        return res.status(400).json({ 
          message: invite.status === 'accepted' 
            ? 'This invitation has already been accepted' 
            : 'This invitation is no longer valid',
          status: invite.status
        });
      }
      
      // Check if invite has expired
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ message: 'This invitation has expired', expired: true });
      }
      
      // Get organization details
      const org = await storage.getOrganization(invite.organizationId);
      
      // Return safe details (no sensitive info)
      res.json({
        email: invite.email,
        organizationName: org?.name || 'Unknown Organization',
        role: invite.role,
        expiresAt: invite.expiresAt
      });
    } catch (err) {
      console.error('Failed to get invite details:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get invitation details' : classified.message });
    }
  });

  // Microsoft Entra ID directory user search
  apiRoute(app, 'get', '/api/organizations/:id/directory/search', {
    tag: 'Organization Members',
    summary: 'Search organization directory',
    parameters: [pathId(), qStr('q', true, 'Search query')],
    responses: { ...r200('Search results', { type: 'array', items: { type: 'object' } }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      const { q } = req.query;
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.status(400).json({ message: 'Search query must be at least 2 characters' });
      }
      
      // Get organization to check for Entra ID configuration
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: 'Organization not found' });
      }
      
      // Get existing members to exclude from results
      const members = await storage.getOrganizationMembers(orgId);
      const memberUserIds = members.map(m => m.userId);
      const memberUsers = await Promise.all(memberUserIds.map(id => storage.getUser(id)));
      const memberEmails = new Set(
        memberUsers.map(u => u?.email?.toLowerCase()).filter(Boolean) as string[]
      );
      
      // Get pending invites to exclude from results
      const invites = await storage.getOrganizationInvites(orgId);
      const pendingInviteEmails = new Set(
        invites.filter(i => i.status === 'pending').map(i => i.email.toLowerCase())
      );
      
      // Check if Microsoft Entra ID integration is connected for this organization
      const { getOrgIntegration } = await import('../services/microsoftPlanner');
      const integration = await getOrgIntegration(orgId, 'entra');
      
      if (integration?.connectionStatus === 'connected' && integration.accessToken) {
        // Search Microsoft Graph API for users
        try {
          const searchQuery = encodeURIComponent(q);
          // Use $filter to search by displayName or mail containing the search term
          const graphUrl = `https://graph.microsoft.com/v1.0/users?$filter=startswith(displayName,'${searchQuery}') or startswith(mail,'${searchQuery}') or startswith(givenName,'${searchQuery}') or startswith(surname,'${searchQuery}')&$top=15&$select=id,displayName,mail,givenName,surname,userPrincipalName,jobTitle,department`;
          
          const graphResponse = await fetch(graphUrl, {
            headers: {
              'Authorization': `Bearer ${integration.accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (graphResponse.ok) {
            const graphData = await graphResponse.json();
            const graphUsers = (graphData.value || [])
              .filter((user: any) => {
                const email = (user.mail || user.userPrincipalName || '').toLowerCase();
                // Skip if already a member or has pending invite
                if (memberEmails.has(email)) return false;
                if (pendingInviteEmails.has(email)) return false;
                return true;
              })
              .slice(0, 10)
              .map((user: any) => ({
                id: user.id,
                email: user.mail || user.userPrincipalName,
                firstName: user.givenName,
                lastName: user.surname,
                displayName: user.displayName || [user.givenName, user.surname].filter(Boolean).join(' ') || user.mail || 'Unknown User',
                jobTitle: user.jobTitle,
                department: user.department,
                source: 'entra' as const
              }));
            
            return res.json({ users: graphUsers, source: 'microsoft_entra' });
          } else {
            // Log error but fall back to internal search
            const errorText = await graphResponse.text();
            console.error('Microsoft Graph API error:', graphResponse.status, errorText);
            // Token might be expired or insufficient permissions - fall back to internal
          }
        } catch (graphErr) {
          console.error('Failed to search Microsoft Graph:', graphErr);
          // Fall back to internal search
        }
      }
      
      // Fall back to internal users if no external directory is configured or Graph API failed
      const allUsers = await storage.getAllUsers();
      const normalizedQuery = normalizeSearchStr(q);
      
      const matchingUsers = allUsers
        .filter(user => {
          // Skip if already a member
          if (user.email && memberEmails.has(user.email.toLowerCase())) return false;
          
          // Skip if already has a pending invite
          if (user.email && pendingInviteEmails.has(user.email.toLowerCase())) return false;
          
          // Match on name or email (accent-insensitive)
          const fullName = normalizeSearchStr([user.firstName, user.lastName].filter(Boolean).join(' '));
          const email = normalizeSearchStr(user.email);
          
          return fullName.includes(normalizedQuery) || email.includes(normalizedQuery);
        })
        .slice(0, 10) // Limit results
        .map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown User',
          source: 'internal' as const
        }));
      
      res.json({ users: matchingUsers, source: 'internal' });
    } catch (err) {
      console.error('Failed to search directory:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to search directory' : classified.message });
    }
  });

  // --- Organization Access Requests ---
  
  // Create access request (for users without admin access)
  apiRoute(app, 'post', '/api/organizations/:id/access-requests', {
    tag: 'Organization Members',
    summary: 'Submit access request',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { message: { type: 'string' } } }),
    responses: { ...r201('Request submitted', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Check if org exists
      const org = await storage.getOrganization(orgId);
      if (!org) {
        return res.status(404).json({ message: 'Organization not found' });
      }
      
      // Check if user already has a pending request
      const existingRequest = await storage.getPendingAccessRequestByUser(orgId, userId);
      if (existingRequest) {
        return res.status(400).json({ message: 'You already have a pending access request for this organization' });
      }
      
      // Check if user is already a member with admin role
      const userOrgs = await storage.getUserOrganizations(userId);
      const existingMembership = userOrgs.find(m => m.organizationId === orgId);
      if (existingMembership && existingMembership.role === 'org_admin') {
        return res.status(400).json({ message: 'You already have admin access to this organization' });
      }
      
      const { message } = req.body;
      
      // Create the access request
      const request = await storage.createOrganizationAccessRequest({
        organizationId: orgId,
        userId,
        requestedRole: 'org_admin',
        message: message || null,
      });
      
      // Get the requester's name
      const requester = await storage.getUser(userId);
      const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') || requester?.email || 'Unknown User';
      
      // Send email notifications to all org admins
      const members = await storage.getOrganizationMembers(orgId);
      const admins = members.filter(m => m.role === 'org_admin');
      
      for (const admin of admins) {
        const adminUser = await storage.getUser(admin.userId);
        if (adminUser?.email) {
          await sendAccessRequestNotification(
            adminUser.email,
            requesterName,
            org.name,
            message
          );
        }
      }
      
      res.status(201).json(request);
    } catch (err) {
      console.error('Failed to create access request:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create access request' : classified.message });
    }
  });
  
  // Get access requests for an organization (org admins only)
  apiRoute(app, 'get', '/api/organizations/:id/access-requests', {
    tag: 'Organization Members',
    summary: 'List access requests',
    parameters: [pathId()],
    responses: { ...r200('Access requests', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      // Require org_admin role to view access requests
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      if (!isOrgAdmin) {
        return res.status(403).json({ message: 'Only organization admins can view access requests' });
      }
      
      const requests = await storage.getOrganizationAccessRequests(orgId);
      
      // Enrich with user details
      const enrichedRequests = await Promise.all(
        requests.map(async (request) => {
          const user = await storage.getUser(request.userId);
          return {
            ...request,
            user: user ? {
              id: user.id,
              name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
              email: user.email,
              avatarUrl: user.avatarUrl,
            } : null,
          };
        })
      );
      
      res.json(enrichedRequests);
    } catch (err) {
      console.error('Failed to get access requests:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get access requests' : classified.message });
    }
  });
  
  // Get user's pending request status for an organization
  apiRoute(app, 'get', '/api/organizations/:id/access-requests/my-status', {
    tag: 'Organization Members',
    summary: 'Get current user access request status',
    parameters: [pathId()],
    responses: { ...r200('Request status', ref('User')), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const request = await storage.getPendingAccessRequestByUser(orgId, userId);
      res.json({ hasPendingRequest: !!request, request: request || null });
    } catch (err) {
      console.error('Failed to get access request status:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get access request status' : classified.message });
    }
  });

  // Resend access request notification (for the requesting user)
  apiRoute(app, 'post', '/api/organizations/:id/access-requests/:requestId/resend', {
    tag: 'Organization Members',
    summary: 'Resend access request notification',
    parameters: [pathId(), pathId('requestId')],
    responses: { ...r200('Notification resent', ref('User')), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Get all access requests to find this one
      const allRequests = await storage.getOrganizationAccessRequests(orgId);
      const request = allRequests.find(r => r.id === requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Access request not found' });
      }
      
      // Only the requester can resend their own request
      if (request.userId !== userId) {
        return res.status(403).json({ message: 'You can only resend your own access requests' });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: 'Can only resend pending requests' });
      }
      
      // Get organization and requester info
      const org = await storage.getOrganization(orgId);
      const requester = await storage.getUser(userId);
      const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') || requester?.email || 'Unknown User';
      
      // Send email notifications to all org admins
      const members = await storage.getOrganizationMembers(orgId);
      const admins = members.filter(m => m.role === 'org_admin');
      
      for (const admin of admins) {
        const adminUser = await storage.getUser(admin.userId);
        if (adminUser?.email && org) {
          await sendAccessRequestNotification(
            adminUser.email,
            requesterName,
            org.name,
            request.message ?? undefined
          );
        }
      }
      
      res.json({ message: 'Access request notification resent successfully' });
    } catch (err) {
      console.error('Failed to resend access request:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to resend access request' : classified.message });
    }
  });
  
  // Approve access request
  apiRoute(app, 'post', '/api/organizations/:id/access-requests/:requestId/approve', {
    tag: 'Organization Members',
    summary: 'Approve access request',
    parameters: [pathId(), pathId('requestId')],
    responses: { ...r200('Request approved', ref('User')), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      const userId = getUserIdFromRequest(req);
      
      // Require org_admin role to approve access requests
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      if (!isOrgAdmin) {
        return res.status(403).json({ message: 'Only organization admins can approve access requests' });
      }
      
      // Get the request
      const requests = await storage.getOrganizationAccessRequests(orgId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Access request not found' });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: 'This request has already been processed' });
      }
      
      // Update request status
      const updatedRequest = await storage.updateAccessRequestStatus(requestId, 'approved', userId);
      
      // Add the user as an org admin
      const existingMembership = (await storage.getUserOrganizations(request.userId))
        .find(m => m.organizationId === orgId);
      
      if (existingMembership) {
        // Update existing membership to org_admin
        await storage.updateOrganizationMemberRole(orgId, request.userId, 'org_admin');
      } else {
        // Add as new member with org_admin role
        await storage.addOrganizationMember({
          organizationId: orgId,
          userId: request.userId,
          role: 'org_admin',
        });
      }
      
      // Send notification email
      const requestingUser = await storage.getUser(request.userId);
      const reviewer = userId ? await storage.getUser(userId) : null;
      const org = await storage.getOrganization(orgId);
      const reviewerName = reviewer ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(' ') || reviewer.email : undefined;
      
      if (requestingUser?.email && org) {
        await sendAccessRequestDecisionNotification(
          requestingUser.email,
          org.name,
          true,
          reviewerName || undefined
        );
      }
      
      res.json(updatedRequest);
    } catch (err) {
      console.error('Failed to approve access request:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to approve access request' : classified.message });
    }
  });
  
  // Reject access request
  apiRoute(app, 'post', '/api/organizations/:id/access-requests/:requestId/reject', {
    tag: 'Organization Members',
    summary: 'Reject access request',
    parameters: [pathId(), pathId('requestId')],
    responses: { ...r200('Request rejected', ref('User')), ...fullRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      const userId = getUserIdFromRequest(req);
      
      // Require org_admin role to reject access requests
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      if (!isOrgAdmin) {
        return res.status(403).json({ message: 'Only organization admins can reject access requests' });
      }
      
      // Get the request
      const requests = await storage.getOrganizationAccessRequests(orgId);
      const request = requests.find(r => r.id === requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Access request not found' });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: 'This request has already been processed' });
      }
      
      // Update request status
      const updatedRequest = await storage.updateAccessRequestStatus(requestId, 'rejected', userId);
      
      // Send notification email
      const requestingUser = await storage.getUser(request.userId);
      const reviewer = userId ? await storage.getUser(userId) : null;
      const org = await storage.getOrganization(orgId);
      const reviewerName = reviewer ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(' ') || reviewer.email : undefined;
      
      if (requestingUser?.email && org) {
        await sendAccessRequestDecisionNotification(
          requestingUser.email,
          org.name,
          false,
          reviewerName || undefined
        );
      }
      
      res.json(updatedRequest);
    } catch (err) {
      console.error('Failed to reject access request:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to reject access request' : classified.message });
    }
  });

  // --- Organization Members ---
  apiRoute(app, 'get', '/api/organizations/:id/members', {
    tag: 'Organization Members',
    summary: 'List organization members',
    parameters: [pathId()],
    responses: { ...r200('List of members', arrOf('User')), ...idRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/users/:userId/organizations', {
    tag: 'Organization Members',
    summary: 'List organizations for a user',
    parameters: [pathId('userId')],
    responses: { ...r200('User organizations', arrOf('Organization')), ...authRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/organizations/:id/members', {
    tag: 'Organization Members',
    summary: 'Add member to organization',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { userId: { type: 'string' }, role: { type: 'string' } } }),
    responses: { ...r201('Member added', ref('User')), ...createRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const currentUserId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(currentUserId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
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
      
      const existingResources = await storage.getResources(orgId);
      const existingResource = existingResources.find(r => r.userId === userId);
      
      if (!existingResource) {
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

  apiRoute(app, 'put', '/api/organizations/:id/members/:userId', {
    tag: 'Organization Members',
    summary: 'Update member role',
    parameters: [pathId(), pathId('userId')],
    requestBody: body({ type: 'object', properties: { role: { type: 'string' } } }),
    responses: { ...r200('Member updated', ref('User')), ...updateRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/organizations/:id/members/:userId/send-password-reset', {
    tag: 'Organization Members',
    summary: 'Generate temporary password reset link and email it to a member',
    parameters: [pathId(), pathStr('userId')],
    responses: { ...r200('Reset link emailed', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
          return res.status(403).json({ message: 'Only organization owners and admins can send password reset links' });
        }
      }

      const targetUserId = req.params.userId;
      const targetMembership = members.find(m => m.userId === targetUserId);
      if (!targetMembership) {
        return res.status(404).json({ message: 'Member not found in this organization' });
      }

      const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!targetUser || !targetUser.email) {
        return res.status(404).json({ message: 'User not found or has no email on file' });
      }

      // Invalidate any existing reset tokens for this user
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.userId, targetUser.id));

      // Generate a fresh secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({
        userId: targetUser.id,
        token,
        expiresAt,
      });

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

      const emailSent = await sendPasswordResetEmail(targetUser.email, resetUrl);
      if (!emailSent) {
        console.warn(`[org-members] Password reset email could not be sent to ${targetUser.email} (no email service configured)`);
        return res.status(502).json({ message: 'Reset link generated but email could not be sent. Check email service configuration.' });
      }

      res.json({ message: 'Password reset link emailed successfully' });
    } catch (err) {
      console.error('Error sending password reset link:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to send password reset link' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:id/members/:userId/generate-temp-password', {
    tag: 'Organization Members',
    summary: 'Generate a one-time temporary password for a member',
    parameters: [pathId(), pathStr('userId')],
    responses: { ...r200('Temporary password generated', { type: 'object', properties: { tempPassword: { type: 'string' }, email: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
          return res.status(403).json({ message: 'Only organization owners and admins can generate temporary passwords' });
        }
      }

      const targetUserId = req.params.userId;
      const targetMembership = members.find(m => m.userId === targetUserId);
      if (!targetMembership) {
        return res.status(404).json({ message: 'Member not found in this organization' });
      }

      const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Generate a 16-char readable random password (hex is unambiguous)
      const tempPassword = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12) + 'A1!';
      const hash = await hashPassword(tempPassword);

      await db.update(users).set({ passwordHash: hash }).where(eq(users.id, targetUser.id));

      // Invalidate any pending reset tokens so the temp password is the only valid path
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.userId, targetUser.id));

      res.json({ tempPassword, email: targetUser.email });
    } catch (err) {
      console.error('Error generating temporary password:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to generate temporary password' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:id/members/:userId', {
    tag: 'Organization Members',
    summary: 'Remove member from organization',
    parameters: [pathId(), pathId('userId')],
    responses: { ...r200('Member removed', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
  apiRoute(app, 'get', '/api/organizations/:id/seats', {
    tag: 'Organization Members',
    summary: 'Get seat usage info',
    parameters: [pathId()],
    responses: { ...r200('Seat info', ref('User')), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { checkSeatLimit } = await import("../services/billing");
      const seatInfo = await checkSeatLimit(orgId, 0);
      
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
      
      const invites = await storage.getOrganizationInvites(orgId);
      const pendingInvites = invites.filter(i => i.status === 'pending').length;
      
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      
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

  apiRoute(app, 'post', '/api/organizations/:id/seats/remove', {
    tag: 'Organization Members',
    summary: 'Remove extra seats',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { count: { type: 'integer' } } }),
    responses: { ...r200('Seats removed', { type: 'object', properties: { message: { type: 'string' } } }), ...createRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { quantity = 1 } = req.body;

      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      const user = await storage.getUser(userId!);
      const isSuperAdmin = hasAdminAccess(user);
      
      if (!isSuperAdmin && (!currentMember || !['org_admin', 'owner'].includes(currentMember.role))) {
        return res.status(403).json({ message: 'Only organization admins can remove seats' });
      }

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

      await db.update(subscriptions)
        .set({ bonusSeats: newBonusSeats })
        .where(eq(subscriptions.id, subscription.id));

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

  apiRoute(app, 'post', '/api/organizations/:id/seats/purchase', {
    tag: 'Organization Members',
    summary: 'Purchase additional seats',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { count: { type: 'integer' } } }),
    responses: { ...r200('Seats purchased', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { quantity = 1 } = req.body;
      
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const members = await storage.getOrganizationMembers(orgId);
      const currentMember = members.find(m => m.userId === userId);
      const user = await storage.getUser(userId!);
      const isSuperAdmin = hasAdminAccess(user);
      
      if (!isSuperAdmin && (!currentMember || !['org_admin', 'owner'].includes(currentMember.role))) {
        return res.status(403).json({ message: 'Only organization admins can purchase extra seats' });
      }
      
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
      
      const newBonusSeats = (subscription.bonusSeats || 0) + quantity;
      
      await db.update(subscriptions)
        .set({ bonusSeats: newBonusSeats })
        .where(eq(subscriptions.id, subscription.id));
      
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
