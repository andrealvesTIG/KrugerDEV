import type { Express } from "express";
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
import { sendEmail } from "../services/email";

export function registerProjectFeatureRoutes(app: Express) {
  // =========== CHANGE REQUESTS ===========
  
  // Get all change requests for a project
  app.get('/api/projects/:projectId/change-requests', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const changeRequests = await storage.getChangeRequests(projectId);
      res.json(changeRequests);
    } catch (err) {
      console.error("Error fetching change requests:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching change requests" : classified.message });
    }
  });

  // Create a change request
  app.post('/api/projects/:projectId/change-requests', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check change request limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.CHANGE_REQUESTS);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Change request limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "change_requests"
          });
        }
      }
      
      const changeRequest = await storage.createChangeRequest({
        ...req.body,
        projectId,
        requestedBy: userId,
      });
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        // Get org ID from project for billing
        const project = await storage.getProject(projectId);
        await recordResourceUsage(userId, METER_CODES.CHANGE_REQUESTS, changeRequest.id, 1, project?.organizationId);
      }
      
      res.status(201).json(changeRequest);
    } catch (err) {
      console.error("Error creating change request:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating change request" : classified.message });
    }
  });

  // Update a change request
  app.patch('/api/change-requests/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existingCR = await storage.getChangeRequest(id);
      if (!existingCR) return res.status(404).json({ message: "Change request not found" });
      const crProject = await storage.getProject(existingCR.projectId);
      if (crProject && !await userHasOrgAccess(userId, crProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const updates = { ...req.body };
      
      // Track who reviewed/approved if status is changing to those states
      if (updates.status === 'approved' || updates.status === 'rejected') {
        updates.reviewedBy = userId;
        updates.reviewedAt = new Date();
      }
      if (updates.status === 'implemented') {
        updates.implementedAt = new Date();
      }
      
      const changeRequest = await storage.updateChangeRequest(id, updates);
      res.json(changeRequest);
    } catch (err) {
      console.error("Error updating change request:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating change request" : classified.message });
    }
  });

  // Delete a change request
  app.delete('/api/change-requests/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existingCR = await storage.getChangeRequest(id);
      if (!existingCR) return res.status(404).json({ message: "Change request not found" });
      const crProject = await storage.getProject(existingCR.projectId);
      if (crProject && !await userHasOrgAccess(userId, crProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.deleteChangeRequest(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting change request:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting change request" : classified.message });
    }
  });

  // =========== PROJECT DOCUMENTS ===========
  
  // Get all documents for a project
  app.get('/api/projects/:projectId/documents', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const documents = await storage.getProjectDocuments(projectId);
      res.json(documents);
    } catch (err) {
      console.error("Error fetching project documents:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching documents" : classified.message });
    }
  });

  // Create a document record (metadata only - actual file upload handled separately)
  app.post('/api/projects/:projectId/documents', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check document limit before creation (using org subscription from project)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const docProject = projectId ? await storage.getProject(projectId) : null;
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.DOCUMENTS, 1, docProject?.organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Document limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "documents"
          });
        }
      }
      
      const document = await storage.createProjectDocument({
        ...req.body,
        projectId,
        uploadedBy: userId,
      });
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        // Get org ID from project for billing
        const project = await storage.getProject(projectId);
        await recordResourceUsage(userId, METER_CODES.DOCUMENTS, document.id, 1, project?.organizationId);
      }
      
      res.status(201).json(document);
    } catch (err) {
      console.error("Error creating project document:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating document" : classified.message });
    }
  });

  // Update a document
  app.patch('/api/documents/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existingDoc = await storage.getProjectDocument(id);
      if (!existingDoc) return res.status(404).json({ message: "Document not found" });
      const docProject = await storage.getProject(existingDoc.projectId);
      if (docProject && !await userHasOrgAccess(userId, docProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const document = await storage.updateProjectDocument(id, req.body);
      res.json(document);
    } catch (err) {
      console.error("Error updating document:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating document" : classified.message });
    }
  });

  // Delete a document
  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existingDoc = await storage.getProjectDocument(id);
      if (!existingDoc) return res.status(404).json({ message: "Document not found" });
      const docProject = await storage.getProject(existingDoc.projectId);
      if (docProject && !await userHasOrgAccess(userId, docProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.deleteProjectDocument(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting document:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting document" : classified.message });
    }
  });

  // =========== PROJECT COMMENTS ===========
  
  // Get all comments for a project
  app.get('/api/projects/:projectId/comments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
      // Verify project exists and user has access
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (userId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const comments = await storage.getProjectComments(projectId);
      res.json(comments);
    } catch (err) {
      console.error("Error fetching project comments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching comments" : classified.message });
    }
  });

  // Create a comment for a project (supports replies via parentId and @mentions)
  app.post('/api/projects/:projectId/comments', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Note: Email verification not required for comments since they are low-risk,
      // append-only, and essential for team collaboration
      
      // Verify project exists and user has access
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Validate content
      const content = req.body.content?.trim();
      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }
      
      const parentId = req.body.parentId ? Number(req.body.parentId) : null;
      
      // Parse @mentions from content (match @username patterns)
      const mentionRegex = /@(\w+(?:\.\w+)*(?:@[\w.-]+)?)/g;
      const mentionMatches = content.match(mentionRegex) || [];
      const mentionedUsernames = mentionMatches.map((m: string) => m.substring(1)); // Remove @ prefix
      
      // Find mentioned users by username or email
      const allUsers = await storage.getAllUsers();
      const mentionedUsers = allUsers.filter(u => 
        mentionedUsernames.some((mention: string) => 
          u.username?.toLowerCase() === mention.toLowerCase() ||
          u.email?.toLowerCase() === mention.toLowerCase()
        )
      );
      const mentionedUserIds = mentionedUsers.map(u => u.id);
      
      const user = await storage.getUser(userId);
      const authorName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.username || user?.email || 'Unknown';
      
      const comment = await storage.createProjectComment({
        projectId,
        parentId,
        authorId: userId,
        authorName,
        content,
        mentions: mentionedUserIds.length > 0 ? mentionedUserIds : null,
      });
      
      // Create notifications for mentioned users
      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser.id !== userId) { // Don't notify self
          await storage.createNotification({
            userId: mentionedUser.id,
            type: 'mention',
            title: 'You were mentioned in a comment',
            message: `${authorName} mentioned you in a comment on "${project.name}"`,
            projectId,
            commentId: comment.id,
            fromUserId: userId,
            fromUserName: authorName,
          });
        }
      }
      
      // If this is a reply, also notify the parent comment author
      if (parentId) {
        const parentComment = await storage.getProjectComment(parentId);
        if (parentComment && parentComment.authorId && parentComment.authorId !== userId) {
          // Check if we already notified this user via mention
          if (!mentionedUserIds.includes(parentComment.authorId)) {
            await storage.createNotification({
              userId: parentComment.authorId,
              type: 'comment_reply',
              title: 'Someone replied to your comment',
              message: `${authorName} replied to your comment on "${project.name}"`,
              projectId,
              commentId: comment.id,
              fromUserId: userId,
              fromUserName: authorName,
            });
          }
        }
      }
      
      res.status(201).json(comment);
    } catch (err) {
      console.error("Error creating project comment:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating comment" : classified.message });
    }
  });

  // Delete a comment
  app.delete('/api/comments/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const id = Number(req.params.id);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Get the comment and verify org access through the project
      const comment = await storage.getProjectComment(id);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      const project = await storage.getProject(comment.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteProjectComment(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting comment:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting comment" : classified.message });
    }
  });

  // =========== BILLABLE STATUS COMMENTS ===========
  
  // Get all billable status comments for a project
  app.get('/api/projects/:projectId/billable-status-comments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (userId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const comments = await storage.getBillableStatusComments(projectId);
      res.json(comments);
    } catch (err) {
      console.error("Error fetching billable status comments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching billable status comments" : classified.message });
    }
  });

  // Create a billable status comment for a project
  app.post('/api/projects/:projectId/billable-status-comments', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const content = req.body.content?.trim();
      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }
      
      // Get user's display name
      const user = await storage.getUser(userId);
      const userName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || 'Unknown';
      
      // Get current project's billable status
      const currentBillableStatus = project.billableStatus || 'N/A';
      
      const comment = await storage.createBillableStatusComment({
        projectId,
        billableStatus: currentBillableStatus,
        comment: content,
        userId,
        userName,
      });
      
      res.status(201).json(comment);
    } catch (err) {
      console.error("Error creating billable status comment:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating billable status comment" : classified.message });
    }
  });

  // =========== HEALTH STATUS HISTORY ===========
  
  // Get health status history for a project
  app.get('/api/projects/:projectId/health-status-history', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (userId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const history = await storage.getHealthStatusHistory(projectId);
      res.json(history);
    } catch (err) {
      console.error("Error fetching health status history:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching health status history" : classified.message });
    }
  });

  // =========== PROJECT INVOICES ===========
  
  // Get all invoices for an organization
  app.get('/api/organizations/:organizationId/invoices', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const organizationId = Number(req.params.organizationId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const invoices = await storage.getOrganizationInvoices(organizationId);
      res.json(invoices);
    } catch (err) {
      console.error("Error fetching organization invoices:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching invoices" : classified.message });
    }
  });

  // Get all invoices for a project
  app.get('/api/projects/:projectId/invoices', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const projectId = Number(req.params.projectId);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (userId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const invoices = await storage.getProjectInvoices(projectId);
      res.json(invoices);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching invoices" : classified.message });
    }
  });

  // Create a new invoice
  app.post('/api/projects/:projectId/invoices', async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const user = await storage.getUser(userId);
      const userName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || 'Unknown';
      
      // Convert amount to string if it's a number (for numeric DB column)
      const invoiceData = {
        ...req.body,
        projectId,
        organizationId: project.organizationId,
        createdBy: userId,
        createdByName: userName,
        amount: req.body.amount !== undefined ? String(req.body.amount) : undefined,
      };
      
      // Use upsert for external imports to prevent duplicates
      const invoice = req.body.externalId && req.body.source
        ? await storage.upsertProjectInvoice(invoiceData)
        : await storage.createProjectInvoice(invoiceData);
      
      res.status(201).json(invoice);
    } catch (err) {
      console.error("Error creating invoice:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating invoice" : classified.message });
    }
  });

  // Update an invoice
  app.patch('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updated = await storage.updateProjectInvoice(invoiceId, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating invoice:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating invoice" : classified.message });
    }
  });

  // Delete an invoice
  app.delete('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteProjectInvoice(invoiceId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting invoice:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting invoice" : classified.message });
    }
  });

  // =========== INVOICE NOTES ===========
  
  // Get all notes for an invoice
  app.get('/api/invoices/:invoiceId/notes', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const invoiceId = Number(req.params.invoiceId);
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (userId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Invoice not found" });
        }
      }
      
      const notes = await storage.getInvoiceNotes(invoiceId);
      res.json(notes);
    } catch (err) {
      console.error("Error fetching invoice notes:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching invoice notes" : classified.message });
    }
  });

  // Create a note for an invoice
  app.post('/api/invoices/:invoiceId/notes', async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const invoice = await storage.getProjectInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const project = await storage.getProject(invoice.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const content = req.body.note?.trim();
      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Note content is required" });
      }
      
      const user = await storage.getUser(userId);
      const userName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || 'Unknown';
      
      const note = await storage.createInvoiceNote({
        invoiceId,
        status: invoice.status,
        note: content,
        userId,
        userName,
      });
      
      res.status(201).json(note);
    } catch (err) {
      console.error("Error creating invoice note:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating invoice note" : classified.message });
    }
  });

  // =========== PROJECT VIEWS ===========
  
  // Get all views for a user in a specific mode (grid or gantt)
  app.get('/api/organizations/:orgId/project-views', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const mode = req.query.mode as string;
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!mode || !['grid', 'gantt'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid' or 'gantt'" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const views = await storage.getProjectViews(orgId, userId, mode);
      res.json(views);
    } catch (err) {
      console.error("Error fetching project views:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project views" : classified.message });
    }
  });

  // Create a new project view
  app.post('/api/organizations/:orgId/project-views', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { mode, name, visibleColumns, columnOrder, columnWidths, frozenColumns, isDefault } = req.body;
      
      if (!mode || !['grid', 'gantt'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid' or 'gantt'" });
      }
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "View name is required" });
      }
      
      if (!visibleColumns || !Array.isArray(visibleColumns)) {
        return res.status(400).json({ message: "Visible columns are required" });
      }
      
      // Check for duplicate name
      const existingViews = await storage.getProjectViews(orgId, userId, mode);
      const duplicateName = existingViews.find(v => v.name.toLowerCase() === name.trim().toLowerCase());
      if (duplicateName) {
        return res.status(400).json({ message: "A view with this name already exists" });
      }
      
      const view = await storage.createProjectView({
        organizationId: orgId,
        userId,
        mode,
        name: name.trim(),
        visibleColumns,
        columnOrder: columnOrder || null,
        columnWidths: columnWidths || null,
        frozenColumns: frozenColumns || null,
        isDefault: isDefault || false,
        isSystem: false,
      });
      
      // If this is marked as default, update the default status
      if (isDefault) {
        await storage.setDefaultProjectView(orgId, userId, mode, view.id);
      }
      
      res.status(201).json(view);
    } catch (err) {
      console.error("Error creating project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating project view" : classified.message });
    }
  });

  // Update a project view
  app.patch('/api/project-views/:id', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check ownership
      if (existingView.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Prevent updating system views' name or deleting them
      if (existingView.isSystem && req.body.name) {
        return res.status(400).json({ message: "Cannot rename system views" });
      }
      
      const { name, visibleColumns, columnOrder, columnWidths, frozenColumns, isDefault } = req.body;
      
      // Check for duplicate name if renaming
      if (name && name.trim().toLowerCase() !== existingView.name.toLowerCase()) {
        const existingViews = await storage.getProjectViews(existingView.organizationId, userId, existingView.mode);
        const duplicateName = existingViews.find(v => v.name.toLowerCase() === name.trim().toLowerCase() && v.id !== viewId);
        if (duplicateName) {
          return res.status(400).json({ message: "A view with this name already exists" });
        }
      }
      
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (visibleColumns !== undefined) updates.visibleColumns = visibleColumns;
      if (columnOrder !== undefined) updates.columnOrder = columnOrder;
      if (columnWidths !== undefined) updates.columnWidths = columnWidths;
      if (frozenColumns !== undefined) updates.frozenColumns = frozenColumns;
      
      const updatedView = await storage.updateProjectView(viewId, updates);
      
      // If this is marked as default, update the default status
      if (isDefault) {
        await storage.setDefaultProjectView(existingView.organizationId, userId, existingView.mode, viewId);
      }
      
      res.json(updatedView);
    } catch (err) {
      console.error("Error updating project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating project view" : classified.message });
    }
  });

  // Delete a project view
  app.delete('/api/project-views/:id', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check ownership
      if (existingView.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Prevent deleting system views
      if (existingView.isSystem) {
        return res.status(400).json({ message: "Cannot delete system views" });
      }
      
      await storage.deleteProjectView(viewId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting project view" : classified.message });
    }
  });

  // Set a view as default
  app.post('/api/project-views/:id/set-default', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check ownership
      if (existingView.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.setDefaultProjectView(existingView.organizationId, userId, existingView.mode, viewId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error setting default view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error setting default view" : classified.message });
    }
  });

  // =========== SYSTEM PROJECT VIEWS (Admin-managed org-level views) ===========
  
  // Get all system views for an organization (read-only for all members)
  app.get('/api/organizations/:orgId/system-project-views', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const mode = req.query.mode as string;
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!mode || !['grid', 'gantt'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid' or 'gantt'" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const views = await storage.getSystemProjectViews(orgId, mode);
      res.json(views);
    } catch (err) {
      console.error("Error fetching system project views:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching system project views" : classified.message });
    }
  });

  // Get all system views for org settings (admin only, includes inactive)
  app.get('/api/organizations/:orgId/system-project-views/all', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Check admin access
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      
      if (!isSuperAdmin && !isOrgAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Get all views including inactive
      const views = await db.select().from(systemProjectViews)
        .where(eq(systemProjectViews.organizationId, orgId))
        .orderBy(asc(systemProjectViews.displayOrder), asc(systemProjectViews.name));
      res.json(views);
    } catch (err) {
      console.error("Error fetching all system project views:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching system project views" : classified.message });
    }
  });

  // Create a new system project view (admin only)
  app.post('/api/organizations/:orgId/system-project-views', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Check admin access
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && m.role === 'org_admin');
      
      if (!isSuperAdmin && !isOrgAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { mode, name, description, visibleColumns, columnOrder, columnWidths, filterCriteria, isActive, displayOrder } = req.body;
      
      if (!mode || !['grid', 'gantt'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid' or 'gantt'" });
      }
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "View name is required" });
      }
      
      if (!visibleColumns || !Array.isArray(visibleColumns)) {
        return res.status(400).json({ message: "Visible columns are required" });
      }
      
      const view = await storage.createSystemProjectView({
        organizationId: orgId,
        mode,
        name: name.trim(),
        description: description?.trim() || null,
        visibleColumns,
        columnOrder: columnOrder || null,
        columnWidths: columnWidths || null,
        filterCriteria: filterCriteria || null,
        isActive: isActive !== false,
        displayOrder: displayOrder || 0,
        createdBy: userId,
        updatedBy: userId,
      });
      
      res.status(201).json(view);
    } catch (err) {
      console.error("Error creating system project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating system project view" : classified.message });
    }
  });

  // Update a system project view (admin only)
  app.patch('/api/system-project-views/:id', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getSystemProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check admin access
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === existingView.organizationId && m.role === 'org_admin');
      
      if (!isSuperAdmin && !isOrgAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { name, description, visibleColumns, columnOrder, columnWidths, filterCriteria, isActive, displayOrder } = req.body;
      
      const updates: any = { updatedBy: userId };
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (visibleColumns !== undefined) updates.visibleColumns = visibleColumns;
      if (columnOrder !== undefined) updates.columnOrder = columnOrder;
      if (columnWidths !== undefined) updates.columnWidths = columnWidths;
      if (filterCriteria !== undefined) updates.filterCriteria = filterCriteria;
      if (isActive !== undefined) updates.isActive = isActive;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      
      const updatedView = await storage.updateSystemProjectView(viewId, updates);
      res.json(updatedView);
    } catch (err) {
      console.error("Error updating system project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating system project view" : classified.message });
    }
  });

  // Delete a system project view (admin only)
  app.delete('/api/system-project-views/:id', async (req, res) => {
    try {
      const viewId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const existingView = await storage.getSystemProjectView(viewId);
      if (!existingView) {
        return res.status(404).json({ message: "View not found" });
      }
      
      // Check admin access
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === existingView.organizationId && m.role === 'org_admin');
      
      if (!isSuperAdmin && !isOrgAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteSystemProjectView(viewId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting system project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting system project view" : classified.message });
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

  // =========== INTAKE WORKFLOW CONFIGURATION ===========

  // Get intake workflow steps for an organization
  app.get('/api/organizations/:orgId/intake-workflow', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      let steps = await storage.getIntakeWorkflowSteps(orgId);
      
      // If no steps exist, initialize with defaults
      if (steps.length === 0) {
        steps = await storage.resetIntakeWorkflowToDefaults(orgId);
      }
      
      res.json(steps);
    } catch (err) {
      console.error("Error fetching intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching intake workflow configuration" : classified.message });
    }
  });

  // Update intake workflow steps for an organization
  app.put('/api/organizations/:orgId/intake-workflow', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      // Validate the steps array
      const { steps } = req.body;
      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Steps must be an array" });
      }
      
      // Validate each step has required fields
      for (const step of steps) {
        if (!step.stepKey || !step.label || step.position === undefined) {
          return res.status(400).json({ message: "Each step must have stepKey, label, and position" });
        }
      }
      
      const updatedSteps = await storage.upsertIntakeWorkflowSteps(orgId, steps);
      res.json(updatedSteps);
    } catch (err) {
      console.error("Error updating intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating intake workflow configuration" : classified.message });
    }
  });

  // Reset intake workflow to defaults
  app.post('/api/organizations/:orgId/intake-workflow/reset', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      // Check user has access to the organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      const steps = await storage.resetIntakeWorkflowToDefaults(orgId);
      res.json(steps);
    } catch (err) {
      console.error("Error resetting intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error resetting intake workflow configuration" : classified.message });
    }
  });

  // ==================== COST ITEMS (Financial Grid) ====================

  app.get('/api/projects/:projectId/cost-items', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const items = await storage.getCostItems(projectId, fiscalYear);
      res.json(items);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching cost items" : classified.message });
    }
  });

  app.get('/api/cost-items/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const item = await storage.getCostItem(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Cost item not found" });
    res.json(item);
  });

  app.post('/api/projects/:projectId/cost-items', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const { name, parentId, wbs, comments, category, fiscalYear, aopTotal, fcstTotal, actTotal,
        fcstM1, fcstM2, fcstM3, fcstM4, fcstM5, fcstM6, fcstM7, fcstM8, fcstM9, fcstM10, fcstM11, fcstM12,
        actM1, actM2, actM3, actM4, actM5, actM6, actM7, actM8, actM9, actM10, actM11, actM12,
        sortOrder } = req.body;
      
      if (!name || !fiscalYear) {
        return res.status(400).json({ message: "name and fiscalYear are required" });
      }
      
      const item = await storage.createCostItem({
        projectId,
        parentId: parentId || null,
        name,
        wbs,
        comments,
        category,
        fiscalYear,
        aopTotal,
        fcstTotal,
        actTotal,
        fcstM1, fcstM2, fcstM3, fcstM4, fcstM5, fcstM6, fcstM7, fcstM8, fcstM9, fcstM10, fcstM11, fcstM12,
        actM1, actM2, actM3, actM4, actM5, actM6, actM7, actM8, actM9, actM10, actM11, actM12,
        sortOrder: sortOrder || 0,
      });
      res.status(201).json(item);
    } catch (err) {
      console.error("Error creating cost item:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating cost item" : classified.message });
    }
  });

  app.put('/api/cost-items/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getCostItem(id);
      if (!existing) return res.status(404).json({ message: "Cost item not found" });
      
      const updated = await storage.updateCostItem(id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating cost item:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating cost item" : classified.message });
    }
  });

  app.delete('/api/cost-items/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const id = Number(req.params.id);
    const existing = await storage.getCostItem(id);
    if (!existing) return res.status(404).json({ message: "Cost item not found" });
    await storage.deleteCostItem(id);
    res.status(204).send();
  });

}
