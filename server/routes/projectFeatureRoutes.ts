import type { Express } from "express";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { users, tasks, projects, systemProjectViews, notifications, taskDependencies } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgIds,
  requireEmailVerified,
  upload,
  parseMppFile,
  parseXmlMspdi,
  parseCsv,
} from "./helpers";

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
      const { name, description, fileUrl, fileType, fileSize, category, version, status, tags } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (name !== undefined) safeUpdate.name = name;
      if (description !== undefined) safeUpdate.description = description;
      if (fileUrl !== undefined) safeUpdate.fileUrl = fileUrl;
      if (fileType !== undefined) safeUpdate.fileType = fileType;
      if (fileSize !== undefined) safeUpdate.fileSize = fileSize;
      if (category !== undefined) safeUpdate.category = category;
      if (version !== undefined) safeUpdate.version = version;
      if (status !== undefined) safeUpdate.status = status;
      if (tags !== undefined) safeUpdate.tags = tags;
      const document = await storage.updateProjectDocument(id, safeUpdate);
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
      
      const { invoiceNumber, description, amount, currency, status, issueDate, dueDate, paidDate, notes, lineItems } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (invoiceNumber !== undefined) safeUpdate.invoiceNumber = invoiceNumber;
      if (description !== undefined) safeUpdate.description = description;
      if (amount !== undefined) safeUpdate.amount = amount;
      if (currency !== undefined) safeUpdate.currency = currency;
      if (status !== undefined) safeUpdate.status = status;
      if (issueDate !== undefined) safeUpdate.issueDate = issueDate;
      if (dueDate !== undefined) safeUpdate.dueDate = dueDate;
      if (paidDate !== undefined) safeUpdate.paidDate = paidDate;
      if (notes !== undefined) safeUpdate.notes = notes;
      if (lineItems !== undefined) safeUpdate.lineItems = lineItems;
      const updated = await storage.updateProjectInvoice(invoiceId, safeUpdate);
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
      
      const { name, description, category, estimatedCost, actualCost, status, startDate, endDate, notes } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (name !== undefined) safeUpdate.name = name;
      if (description !== undefined) safeUpdate.description = description;
      if (category !== undefined) safeUpdate.category = category;
      if (estimatedCost !== undefined) safeUpdate.estimatedCost = estimatedCost;
      if (actualCost !== undefined) safeUpdate.actualCost = actualCost;
      if (status !== undefined) safeUpdate.status = status;
      if (startDate !== undefined) safeUpdate.startDate = startDate;
      if (endDate !== undefined) safeUpdate.endDate = endDate;
      if (notes !== undefined) safeUpdate.notes = notes;
      const updated = await storage.updateCostItem(id, safeUpdate);
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


  // ==================== MPP IMPORTS ====================
  
  // Get all MPP imports for an organization
  app.get('/api/mpp-imports', async (req, res) => {
    try {
      const organizationId = Number(req.query.organizationId);
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Organization ID required" });
      }
      const imports = await storage.getMppImports(organizationId);
      res.json(imports);
    } catch (err) {
      console.error("Error fetching MPP imports:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching MPP imports" : classified.message });
    }
  });

  // Get tasks for a specific import
  app.get('/api/mpp-imports/:id/tasks', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const tasks = await storage.getMppImportTasks(id);
      res.json(tasks);
    } catch (err) {
      console.error("Error fetching MPP import tasks:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching tasks" : classified.message });
    }
  });

  // Upload and parse MPP file (XML or CSV)
  app.post('/api/mpp-imports/upload', upload.single('file'), async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const organizationId = Number(req.body.organizationId);
      
      if (isNaN(organizationId)) {
        return res.status(400).json({ message: "Organization ID required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileName = req.file.originalname;
      const fileContent = req.file.buffer.toString('utf-8');
      const fileExt = fileName.split('.').pop()?.toLowerCase();
      
      // Save the original file to object storage for future download
      let fileUrl: string | undefined;
      const uniqueFilename = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      
      try {
        const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
        const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        
        if (privateObjectDir) {
          const objectPath = `${privateObjectDir}/mpp-imports/${uniqueFilename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');

          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          
          await file.save(req.file.buffer, {
            contentType: 'application/octet-stream',
            metadata: {
              originalName: fileName,
              uploadedBy: userId,
            },
          });

          fileUrl = `/objects/mpp-imports/${uniqueFilename}`;
        } else {
          throw new Error('Object storage not configured');
        }
      } catch (objectStorageError) {
        console.log("Object storage unavailable, using local storage:", (objectStorageError as Error).message);
        // Fallback to local file storage
        const mppDir = path.join(process.cwd(), 'public', 'mpp-imports');
        if (!fs.existsSync(mppDir)) {
          fs.mkdirSync(mppDir, { recursive: true });
        }
        
        const filePath = path.join(mppDir, uniqueFilename);
        fs.writeFileSync(filePath, req.file.buffer);
        
        fileUrl = `/mpp-imports/${uniqueFilename}`;
      }
      
      let parsedTasks: ParsedMppTask[] = [];

      if (fileExt === 'mpp') {
        parsedTasks = parseMppFile(req.file.buffer);
      } else if (fileExt === 'xml') {
        parsedTasks = await parseXmlMspdi(fileContent);
      } else if (fileExt === 'csv') {
        parsedTasks = parseCsv(fileContent);
      } else {
        return res.status(400).json({ message: "Unsupported file format. Use MPP, XML, or CSV." });
      }

      // Create the import record
      const mppImport = await storage.createMppImport({
        organizationId,
        fileName,
        fileType: fileExt || 'unknown',
        fileUrl, // Store the object storage URL for download
        importedBy: userId,
        taskCount: parsedTasks.length,
        status: 'active',
      });

      // Create task records
      if (parsedTasks.length > 0) {
        const taskRecords = parsedTasks.map(task => ({
          importId: mppImport.id,
          taskId: task.taskId,
          wbs: task.wbs,
          taskName: task.taskName,
          startDate: task.startDate,
          finishDate: task.finishDate,
          duration: task.duration,
          durationDays: task.durationDays,
          percentComplete: task.percentComplete || 0,
          outlineLevel: task.outlineLevel || 1,
          parentTaskId: task.parentTaskId,
          isSummary: task.isSummary || false,
          isMilestone: task.isMilestone || false,
          notes: task.notes,
          workHours: task.workHours?.toString() || null,
          actualWorkHours: task.actualWorkHours?.toString() || null,
          remainingWorkHours: task.remainingWorkHours?.toString() || null,
          predecessors: task.predecessors && task.predecessors.length > 0 ? JSON.stringify(task.predecessors) : null,
        }));
        await storage.createMppImportTasks(taskRecords);
      }

      res.status(201).json({
        ...mppImport,
        taskCount: parsedTasks.length,
      });
    } catch (err: any) {
      console.error("Error uploading MPP file:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error processing file" : classified.message });
    }
  });

  // Convert MPP import to a project with tasks
  app.post('/api/mpp-imports/:id/convert', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const id = Number(req.params.id);
      const { name, portfolioId, description, status, priority } = req.body;
      
      // Get the import to verify it exists and get organizationId
      const mppImport = await storage.getMppImport(id);
      if (!mppImport) {
        return res.status(404).json({ message: "Import not found" });
      }
      
      if (!await userHasOrgAccess(userId, mppImport.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      if (mppImport.projectId) {
        return res.status(400).json({ message: "This import has already been converted to a project" });
      }
      
      if (!name) {
        return res.status(400).json({ message: "Project name is required" });
      }
      
      const result = await storage.convertMppImportToProject(id, {
        organizationId: mppImport.organizationId,
        portfolioId: portfolioId ? Number(portfolioId) : undefined,
        name,
        description,
        status,
        priority,
      });
      
      const mppUser = userId ? await storage.getUser(userId) : null;
      const mppUserName = mppUser ? `${mppUser.firstName || ''} ${mppUser.lastName || ''}`.trim() || mppUser.email || 'Unknown' : 'System';
      const sourceFileName = mppImport.fileName || 'MS Project file';
      await storage.createProjectChangeLog({
        projectId: result.project.id,
        changedBy: userId || null,
        changedByName: mppUserName,
        changeType: 'created',
        changeSummary: `Project "${result.project.name}" created by ${mppUserName} — imported from ${sourceFileName}`,
        previousValues: null,
        newValues: null,
      });
      
      res.json({
        success: true,
        project: result.project,
        taskCount: result.taskCount,
        message: `Created project "${result.project.name}" with ${result.taskCount} tasks`,
      });
    } catch (err) {
      console.error("Error converting MPP import:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error converting import to project" : classified.message });
    }
  });

  // Sync MPP import to an existing project (update tasks)
  app.post('/api/mpp-imports/:id/sync', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const id = Number(req.params.id);
      const { projectId, syncMode } = req.body;
      
      if (!projectId) {
        return res.status(400).json({ message: "projectId is required" });
      }

      const mppImport = await storage.getMppImport(id);
      if (!mppImport) {
        return res.status(404).json({ message: "Import not found" });
      }

      // Get the target project to verify it exists and user has access
      const project = await storage.getProject(Number(projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Verify user has access to both the import's org and the project's org
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(mppImport.organizationId)) {
        return res.status(403).json({ message: "Access denied to import's organization" });
      }
      if (project.organizationId && !accessibleOrgIds.includes(project.organizationId)) {
        return res.status(403).json({ message: "Access denied to project's organization" });
      }

      // Ensure import and project belong to the same organization
      if (project.organizationId && mppImport.organizationId !== project.organizationId) {
        return res.status(400).json({ message: "Import and project must belong to the same organization" });
      }

      // Validate syncMode
      const validSyncModes = ['merge', 'replace'];
      if (syncMode && !validSyncModes.includes(syncMode)) {
        return res.status(400).json({ message: "syncMode must be 'merge' or 'replace'" });
      }

      const result = await storage.syncMppImportToProject(id, Number(projectId), {
        syncMode: syncMode || 'merge',
      });

      const response = {
        success: true,
        project: result.project,
        tasksAdded: result.tasksAdded,
        tasksUpdated: result.tasksUpdated,
        tasksRemoved: result.tasksRemoved,
        message: `Synced to "${result.project.name}": ${result.tasksAdded} added, ${result.tasksUpdated} updated, ${result.tasksRemoved} removed`,
      };
      
      return res.json(response);
    } catch (err: any) {
      console.error("Error syncing MPP import to project:", err?.message || err);
      const classified = classifyError(err);
      return res.status(classified.status).json({ message: classified.status === 500 ? "Error syncing import to project" : classified.message });
    }
  });

  // Delete an MPP import
  app.delete('/api/mpp-imports/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteMppImport(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting MPP import:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting import" : classified.message });
    }
  });

  // =========== PROJECT TEMPLATES ===========

  app.get('/api/project-templates', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const organizationId = Number(req.query.organizationId);
      if (isNaN(organizationId)) return res.status(400).json({ message: 'Organization ID required' });
      if (!await userHasOrgAccess(userId, organizationId)) return res.status(403).json({ message: 'Access denied' });
      const templates = await storage.getProjectTemplates(organizationId);
      res.json(templates);
    } catch (err) {
      console.error("Error fetching templates:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get('/api/project-templates/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await storage.getProjectTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      if (!await userHasOrgAccess(userId, template.organizationId)) return res.status(403).json({ message: 'Access denied' });
      const items = await storage.getProjectTemplateItems(id);
      res.json({ ...template, items });
    } catch (err) {
      console.error("Error fetching template:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/project-templates/from-mpp', upload.single('file'), async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      const organizationId = Number(req.body.organizationId);
      const templateName = req.body.name;
      if (isNaN(organizationId)) return res.status(400).json({ message: 'Organization ID required' });
      if (!templateName) return res.status(400).json({ message: 'Template name required' });
      if (!await userHasOrgAccess(userId, organizationId)) return res.status(403).json({ message: 'Access denied' });
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const fileName = req.file.originalname;
      const fileExt = fileName.split('.').pop()?.toLowerCase();
      const fileContent = req.file.buffer.toString('utf-8');

      let storedFileUrl: string | undefined;
      const uniqueFilename = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      try {
        const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
        const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        if (privateObjectDir) {
          const objectPath = `${privateObjectDir}/project-templates/${uniqueFilename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          await file.save(req.file.buffer, {
            contentType: 'application/octet-stream',
            metadata: { originalName: fileName, uploadedBy: userId },
          });
          storedFileUrl = `/objects/project-templates/${uniqueFilename}`;
        } else {
          throw new Error('Object storage not configured');
        }
      } catch (objErr) {
        console.log("Object storage unavailable for template, using local:", (objErr as Error).message);
        const templateDir = path.join(process.cwd(), 'public', 'project-templates');
        if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });
        fs.writeFileSync(path.join(templateDir, uniqueFilename), req.file.buffer);
        storedFileUrl = `/project-templates/${uniqueFilename}`;
      }

      let parsedTasks: ParsedMppTask[] = [];
      if (fileExt === 'mpp') {
        parsedTasks = parseMppFile(req.file.buffer);
      } else if (fileExt === 'xml') {
        parsedTasks = await parseXmlMspdi(fileContent);
      } else if (fileExt === 'csv') {
        parsedTasks = parseCsv(fileContent);
      } else {
        return res.status(400).json({ message: 'Unsupported file format. Use MPP, XML, or CSV.' });
      }

      const milestoneCount = parsedTasks.filter(t => t.isMilestone).length;
      const template = await storage.createProjectTemplate({
        organizationId,
        name: templateName,
        description: req.body.description || null,
        sourceType: 'mpp',
        originalFileName: fileName,
        storedFileUrl,
        itemCount: parsedTasks.length,
        milestoneCount,
        createdBy: userId,
      });

      if (parsedTasks.length > 0) {
        const items = parsedTasks.map(task => ({
          templateId: template.id,
          taskId: task.taskId,
          wbs: task.wbs,
          name: task.taskName,
          startDate: task.startDate,
          endDate: task.finishDate,
          duration: task.duration,
          durationDays: task.durationDays,
          outlineLevel: task.outlineLevel || 1,
          parentTaskId: task.parentTaskId,
          isSummary: task.isSummary || false,
          isMilestone: task.isMilestone || false,
          predecessors: task.predecessors && task.predecessors.length > 0 ? JSON.stringify(task.predecessors) : null,
          notes: task.notes,
          workHours: task.workHours?.toString() || null,
        }));
        await storage.createProjectTemplateItems(items);
      }

      res.status(201).json(template);
    } catch (err) {
      console.error("Error creating template from MPP:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/project-templates/from-project', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      const { projectId, name, description } = req.body;
      if (!projectId) return res.status(400).json({ message: 'Project ID required' });
      if (!name) return res.status(400).json({ message: 'Template name required' });

      const project = await storage.getProject(Number(projectId));
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) return res.status(403).json({ message: 'Access denied' });

      const projectTasks = await storage.getTasks(Number(projectId));
      const projectMilestones = await storage.getMilestones(Number(projectId));

      const taskMilestoneCount = projectTasks.filter(t => t.taskType === 'Milestone' || (t.startDate === t.endDate && t.durationDays === 0)).length;
      const totalMilestoneCount = taskMilestoneCount + projectMilestones.length;
      const totalItemCount = projectTasks.length + projectMilestones.length;

      const template = await storage.createProjectTemplate({
        organizationId: project.organizationId,
        name,
        description: description || project.description || null,
        sourceType: 'project',
        originalFileName: null,
        storedFileUrl: null,
        itemCount: totalItemCount,
        milestoneCount: totalMilestoneCount,
        createdBy: userId,
        sourceProjectId: project.id,
      });

      const items: Array<any> = [];

      if (projectTasks.length > 0) {
        const taskDeps = await db.select().from(taskDependencies)
          .where(inArray(taskDependencies.taskId, projectTasks.map(t => t.id)));

        const depsByTaskId = new Map<number, Array<{ predecessorTaskId: number; type: string; lagDays: number }>>();
        for (const dep of taskDeps) {
          const arr = depsByTaskId.get(dep.taskId) || [];
          arr.push({ predecessorTaskId: dep.dependsOnTaskId, type: dep.dependencyType || 'finish-to-start', lagDays: dep.lagDays || 0 });
          depsByTaskId.set(dep.taskId, arr);
        }

        for (const task of projectTasks) {
          const deps = depsByTaskId.get(task.id);
          items.push({
            templateId: template.id,
            taskId: task.id,
            wbs: task.wbs,
            name: task.name,
            description: task.description,
            startDate: task.startDate,
            endDate: task.endDate,
            duration: task.duration,
            durationDays: task.durationDays,
            outlineLevel: task.outlineLevel || 1,
            parentTaskId: task.parentId,
            isSummary: task.isSummary || false,
            isMilestone: task.taskType === 'Milestone',
            predecessors: deps && deps.length > 0 ? JSON.stringify(deps) : null,
            notes: task.notes,
            workHours: task.estimatedHours?.toString() || null,
          });
        }
      }

      for (const ms of projectMilestones) {
        const msIdOffset = 1000000;
        items.push({
          templateId: template.id,
          taskId: msIdOffset + ms.id,
          wbs: null,
          name: ms.title,
          description: ms.description,
          startDate: ms.startDate || ms.dueDate,
          endDate: ms.dueDate,
          duration: '0 days',
          durationDays: 0,
          outlineLevel: 1,
          parentTaskId: null,
          isSummary: false,
          isMilestone: true,
          predecessors: null,
          notes: ms.notes,
          workHours: null,
        });
      }

      if (items.length > 0) {
        await storage.createProjectTemplateItems(items);
      }

      res.status(201).json(template);
    } catch (err) {
      console.error("Error creating template from project:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.put('/api/project-templates/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await storage.getProjectTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      if (!await userHasOrgAccess(userId, template.organizationId)) return res.status(403).json({ message: 'Access denied' });

      const { name, description } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;

      const updated = await storage.updateProjectTemplate(id, updates);
      res.json(updated);
    } catch (err) {
      console.error("Error updating template:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete('/api/project-templates/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await storage.getProjectTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      if (!await userHasOrgAccess(userId, template.organizationId)) return res.status(403).json({ message: 'Access denied' });

      if (template.storedFileUrl) {
        try {
          if (template.storedFileUrl.startsWith('/objects/')) {
            const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
            const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
            if (privateObjectDir) {
              const relativePath = template.storedFileUrl.replace('/objects/', '');
              const objectPath = `${privateObjectDir}/${relativePath}`;
              const pathParts = objectPath.split('/');
              const bucketName = pathParts[1];
              const objectName = pathParts.slice(2).join('/');
              const bucket = objectStorageClient.bucket(bucketName);
              await bucket.file(objectName).delete().catch(() => {});
            }
          } else {
            const normalizedUrl = template.storedFileUrl.replace(/^\/+/, '');
            const localPath = path.join(process.cwd(), 'public', normalizedUrl);
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          }
        } catch (fileErr) {
          console.error("Error deleting template file:", fileErr);
        }
      }

      await storage.deleteProjectTemplate(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting template:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/project-templates/:id/duplicate', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await storage.getProjectTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      if (!await userHasOrgAccess(userId, template.organizationId)) return res.status(403).json({ message: 'Access denied' });

      const newName = req.body.name || `${template.name} (Copy)`;

      let newFileUrl: string | null = null;
      if (template.storedFileUrl) {
        try {
          const uniqueFilename = `${Date.now()}-copy-${template.originalFileName?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'template'}`;
          if (template.storedFileUrl.startsWith('/objects/')) {
            const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
            const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
            if (privateObjectDir) {
              const relativePath = template.storedFileUrl.replace('/objects/', '');
              const srcPath = `${privateObjectDir}/${relativePath}`;
              const srcParts = srcPath.split('/');
              const srcBucket = objectStorageClient.bucket(srcParts[1]);
              const [contents] = await srcBucket.file(srcParts.slice(2).join('/')).download();
              const dstPath = `${privateObjectDir}/project-templates/${uniqueFilename}`;
              const dstParts = dstPath.split('/');
              const dstBucket = objectStorageClient.bucket(dstParts[1]);
              await dstBucket.file(dstParts.slice(2).join('/')).save(contents, { contentType: 'application/octet-stream' });
              newFileUrl = `/objects/project-templates/${uniqueFilename}`;
            }
          } else {
            const normalizedSrcUrl = template.storedFileUrl.replace(/^\/+/, '');
            const srcLocalPath = path.join(process.cwd(), 'public', normalizedSrcUrl);
            if (fs.existsSync(srcLocalPath)) {
              const templateDir = path.join(process.cwd(), 'public', 'project-templates');
              if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });
              fs.copyFileSync(srcLocalPath, path.join(templateDir, uniqueFilename));
              newFileUrl = `/project-templates/${uniqueFilename}`;
            }
          }
        } catch (copyErr) {
          console.error("Error copying template file during duplicate:", copyErr);
        }
      }

      const newTemplate = await storage.createProjectTemplate({
        organizationId: template.organizationId,
        name: newName,
        description: template.description,
        sourceType: template.sourceType,
        originalFileName: template.originalFileName,
        storedFileUrl: newFileUrl,
        itemCount: template.itemCount,
        milestoneCount: template.milestoneCount,
        createdBy: userId,
        sourceProjectId: template.sourceProjectId,
      });

      const items = await storage.getProjectTemplateItems(id);
      if (items.length > 0) {
        const newItems = items.map(item => ({
          templateId: newTemplate.id,
          taskId: item.taskId,
          wbs: item.wbs,
          name: item.name,
          description: item.description,
          startDate: item.startDate,
          endDate: item.endDate,
          duration: item.duration,
          durationDays: item.durationDays,
          outlineLevel: item.outlineLevel,
          parentTaskId: item.parentTaskId,
          isSummary: item.isSummary,
          isMilestone: item.isMilestone,
          predecessors: item.predecessors,
          notes: item.notes,
          workHours: item.workHours?.toString() || null,
        }));
        await storage.createProjectTemplateItems(newItems);
      }

      res.status(201).json(newTemplate);
    } catch (err) {
      console.error("Error duplicating template:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get('/api/project-templates/:id/download', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await storage.getProjectTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      if (!await userHasOrgAccess(userId, template.organizationId)) return res.status(403).json({ message: 'Access denied' });
      if (!template.storedFileUrl) return res.status(404).json({ message: 'No file associated with this template' });

      const downloadName = template.originalFileName || 'template.mpp';

      if (template.storedFileUrl.startsWith('/objects/')) {
        try {
          const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
          const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
          if (privateObjectDir) {
            const relativePath = template.storedFileUrl.replace('/objects/', '');
            const objectPath = `${privateObjectDir}/${relativePath}`;
            const pathParts = objectPath.split('/');
            const bucketName = pathParts[1];
            const objectName = pathParts.slice(2).join('/');
            const bucket = objectStorageClient.bucket(bucketName);
            const file = bucket.file(objectName);
            const [contents] = await file.download();
            res.set({
              'Content-Disposition': `attachment; filename="${downloadName}"`,
              'Content-Type': 'application/octet-stream',
              'Content-Length': contents.length.toString(),
            });
            return res.send(contents);
          }
        } catch (objErr) {
          console.error("Object storage download failed:", objErr);
        }
      }

      const normalizedUrl = template.storedFileUrl.replace(/^\/+/, '');
      const localPath = path.join(process.cwd(), 'public', normalizedUrl);
      if (fs.existsSync(localPath)) {
        res.set({ 'Content-Disposition': `attachment; filename="${downloadName}"` });
        return res.sendFile(localPath);
      }

      return res.status(404).json({ message: 'File not found' });
    } catch (err) {
      console.error("Error downloading template file:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/project-templates/:id/reimport', upload.single('file'), async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await storage.getProjectTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      if (!await userHasOrgAccess(userId, template.organizationId)) return res.status(403).json({ message: 'Access denied' });
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      const fileName = req.file.originalname;
      const fileExt = fileName.split('.').pop()?.toLowerCase();
      const fileContent = req.file.buffer.toString('utf-8');

      let parsedTasks: ParsedMppTask[] = [];
      if (fileExt === 'mpp') {
        parsedTasks = parseMppFile(req.file.buffer);
      } else if (fileExt === 'xml') {
        parsedTasks = await parseXmlMspdi(fileContent);
      } else if (fileExt === 'csv') {
        parsedTasks = parseCsv(fileContent);
      } else {
        return res.status(400).json({ message: 'Unsupported file format. Use MPP, XML, or CSV.' });
      }

      let storedFileUrl: string | undefined;
      const uniqueFilename = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      try {
        const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
        const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
        if (privateObjectDir) {
          const objectPath = `${privateObjectDir}/project-templates/${uniqueFilename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          await file.save(req.file.buffer, {
            contentType: 'application/octet-stream',
            metadata: { originalName: fileName, uploadedBy: userId },
          });
          storedFileUrl = `/objects/project-templates/${uniqueFilename}`;
        } else {
          throw new Error('Object storage not configured');
        }
      } catch (objErr) {
        console.log("Object storage unavailable for template reimport:", (objErr as Error).message);
        const templateDir = path.join(process.cwd(), 'public', 'project-templates');
        if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });
        fs.writeFileSync(path.join(templateDir, uniqueFilename), req.file.buffer);
        storedFileUrl = `/project-templates/${uniqueFilename}`;
      }

      await storage.deleteProjectTemplateItems(id);

      const oldFileUrl = template.storedFileUrl;

      const milestoneCount = parsedTasks.filter(t => t.isMilestone).length;
      const updated = await storage.updateProjectTemplate(id, {
        originalFileName: fileName,
        storedFileUrl,
        itemCount: parsedTasks.length,
        milestoneCount,
      });

      if (parsedTasks.length > 0) {
        const items = parsedTasks.map(task => ({
          templateId: id,
          taskId: task.taskId,
          wbs: task.wbs,
          name: task.taskName,
          startDate: task.startDate,
          endDate: task.finishDate,
          duration: task.duration,
          durationDays: task.durationDays,
          outlineLevel: task.outlineLevel || 1,
          parentTaskId: task.parentTaskId,
          isSummary: task.isSummary || false,
          isMilestone: task.isMilestone || false,
          predecessors: task.predecessors && task.predecessors.length > 0 ? JSON.stringify(task.predecessors) : null,
          notes: task.notes,
          workHours: task.workHours?.toString() || null,
        }));
        await storage.createProjectTemplateItems(items);
      }

      if (oldFileUrl && oldFileUrl !== storedFileUrl) {
        try {
          if (oldFileUrl.startsWith('/objects/')) {
            const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
            const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
            if (privateObjectDir) {
              const relativePath = oldFileUrl.replace('/objects/', '');
              const objectPath = `${privateObjectDir}/${relativePath}`;
              const pathParts = objectPath.split('/');
              const bucketName = pathParts[1];
              const objectName = pathParts.slice(2).join('/');
              const bucket = objectStorageClient.bucket(bucketName);
              await bucket.file(objectName).delete().catch(() => {});
            }
          } else {
            const normalizedOldUrl = oldFileUrl.replace(/^\/+/, '');
            const oldPath = path.join(process.cwd(), 'public', normalizedOldUrl);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        } catch (cleanupErr) {
          console.error("Error cleaning up old template file:", cleanupErr);
        }
      }

      res.json(updated);
    } catch (err) {
      console.error("Error reimporting template:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.post('/api/project-templates/:id/create-project', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      const id = Number(req.params.id);
      const template = await storage.getProjectTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      if (!await userHasOrgAccess(userId, template.organizationId)) return res.status(403).json({ message: 'Access denied' });

      const { name, portfolioId, description, status, priority, startDate } = req.body;
      if (!name) return res.status(400).json({ message: 'Project name required' });

      let validPortfolioId: number | null = null;
      if (portfolioId) {
        const portfolio = await storage.getPortfolio(Number(portfolioId));
        if (!portfolio || portfolio.organizationId !== template.organizationId) {
          return res.status(400).json({ message: 'Invalid portfolio for this organization' });
        }
        validPortfolioId = portfolio.id;
      }

      const templateItems = await storage.getProjectTemplateItems(id);

      const project = await storage.createProject({
        organizationId: template.organizationId,
        name,
        description: description || template.description || null,
        portfolioId: validPortfolioId,
        status: status || 'Initiation',
        priority: priority || 'Medium',
        startDate: startDate || null,
        endDate: null,
        budget: "0",
        managerId: userId,
        source: 'manual',
      });

      let taskCount = 0;
      if (templateItems.length > 0) {
        const oldIdToNewId = new Map<number, number>();

        let earliestDate: Date | null = null;
        if (startDate) {
          for (const item of templateItems) {
            if (item.startDate) {
              const d = new Date(item.startDate);
              if (!earliestDate || d < earliestDate) earliestDate = d;
            }
          }
        }

        for (const item of templateItems) {
          let taskStartDate: string;
          let taskEndDate: string;

          if (startDate && earliestDate && item.startDate) {
            const itemStart = new Date(item.startDate);
            const offsetDays = Math.round((itemStart.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
            const newStart = new Date(startDate);
            newStart.setDate(newStart.getDate() + offsetDays);
            taskStartDate = newStart.toISOString().split('T')[0];

            if (item.durationDays != null && item.durationDays >= 0) {
              const newEnd = new Date(newStart);
              newEnd.setDate(newEnd.getDate() + item.durationDays);
              taskEndDate = newEnd.toISOString().split('T')[0];
            } else if (item.endDate) {
              const itemEnd = new Date(item.endDate);
              const endOffsetDays = Math.round((itemEnd.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
              const newEnd = new Date(startDate);
              newEnd.setDate(newEnd.getDate() + endOffsetDays);
              taskEndDate = newEnd.toISOString().split('T')[0];
            } else {
              taskEndDate = taskStartDate;
            }
          } else {
            taskStartDate = item.startDate || startDate || new Date().toISOString().split('T')[0];
            taskEndDate = item.endDate || taskStartDate;
          }

          const newTask = await storage.createTask({
            projectId: project.id,
            name: item.name,
            description: item.description || null,
            wbs: item.wbs,
            startDate: taskStartDate,
            endDate: taskEndDate,
            duration: item.duration,
            durationDays: item.durationDays,
            outlineLevel: item.outlineLevel,
            parentId: item.parentTaskId && oldIdToNewId.has(item.parentTaskId) ? oldIdToNewId.get(item.parentTaskId)! : null,
            isSummary: item.isSummary || false,
            taskType: item.isMilestone ? 'Milestone' : item.isSummary ? 'Summary' : 'Work',
            status: 'Backlog',
            priority: 'Medium',
            progress: 0,
            notes: item.notes,
            estimatedHours: item.workHours ? Number(item.workHours) : null,
          });
          if (item.taskId) oldIdToNewId.set(item.taskId, newTask.id);
          taskCount++;
        }

        for (const item of templateItems) {
          if (!item.predecessors) continue;
          try {
            const deps = JSON.parse(item.predecessors) as Array<{ predecessorTaskId: number; type: string; lagDays: number }>;
            const currentTaskNewId = item.taskId ? oldIdToNewId.get(item.taskId) : undefined;
            if (!currentTaskNewId) continue;
            for (const dep of deps) {
              const predNewId = oldIdToNewId.get(dep.predecessorTaskId);
              if (!predNewId) continue;
              const depTypeMap: Record<string, string> = {
                'FS': 'finish-to-start', 'SS': 'start-to-start', 'FF': 'finish-to-finish', 'SF': 'start-to-finish',
                'finish-to-start': 'finish-to-start', 'start-to-start': 'start-to-start', 'finish-to-finish': 'finish-to-finish', 'start-to-finish': 'start-to-finish',
              };
              await storage.createTaskDependency({
                taskId: currentTaskNewId,
                dependsOnTaskId: predNewId,
                dependencyType: depTypeMap[dep.type] || 'finish-to-start',
                lagDays: dep.lagDays || 0,
              });
            }
          } catch (depErr) {
            console.error("Error creating dependency from template:", depErr);
          }
        }
      }

      const templateUser = userId ? await storage.getUser(userId) : null;
      const templateUserName = templateUser ? `${templateUser.firstName || ''} ${templateUser.lastName || ''}`.trim() || templateUser.email || 'Unknown' : 'System';
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: templateUserName,
        changeType: 'created',
        changeSummary: `Project "${project.name}" created by ${templateUserName} — from template "${template.name}"`,
        previousValues: null,
        newValues: null,
      });

      res.status(201).json({
        success: true,
        project,
        taskCount,
        message: `Created project "${project.name}" with ${taskCount} tasks from template "${template.name}"`,
      });
    } catch (err) {
      console.error("Error creating project from template:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });
}
