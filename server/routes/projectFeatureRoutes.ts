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
  p6Upload,
  parseMppFile,
  parseXmlMspdi,
  parseCsv,
  parseXerFile,
  parseP6Xml,
  isTeamMemberInOrg,
  getTeamMemberProjectIds,
  type ParsedMppTask,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";
import {
  listScheduleVersionsForProject,
  getScheduleVersion as getScheduleVersionById,
  getScheduleVersionTasks as getScheduleVersionTaskRows,
  diffScheduleVersions as diffScheduleVersionsFn,
  restoreScheduleVersion as restoreScheduleVersionFn,
  deleteScheduleVersion as deleteScheduleVersionFn,
  ScheduleVersionDeleteError,
} from "../storage/scheduleVersionStorage";

async function teamMemberCanAccessProject(userId: string, projectId: number, organizationId: number): Promise<boolean> {
  if (!await isTeamMemberInOrg(userId, organizationId)) return true;
  const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, organizationId));
  return allowedProjectIds.has(projectId);
}

export function registerProjectFeatureRoutes(app: Express) {
  // =========== CHANGE REQUESTS ===========
  
  apiRoute(app, 'get', '/api/projects/:projectId/change-requests', {
    tag: 'Change Requests',
    summary: 'List change requests for project',
    parameters: [pathId('projectId')],
    responses: { ...r200('Change requests', arrOf('ChangeRequest')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const changeRequests = await storage.getChangeRequests(projectId);
      res.json(changeRequests);
    } catch (err) {
      console.error("Error fetching change requests:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching change requests" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/projects/:projectId/change-requests', {
    tag: 'Change Requests',
    summary: 'Create change request',
    parameters: [pathId('projectId')],
    requestBody: body(ref('ChangeRequest')),
    responses: { ...r201('Change request created', ref('ChangeRequest')), ...createRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'patch', '/api/change-requests/:id', {
    tag: 'Change Requests',
    summary: 'Update change request',
    parameters: [pathId()],
    requestBody: body(ref('ChangeRequest')),
    responses: { ...r200('Change request updated', ref('ChangeRequest')), ...updateRes },
  }, async (req, res) => {
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
      if (crProject && !await teamMemberCanAccessProject(userId, existingCR.projectId, crProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'delete', '/api/change-requests/:id', {
    tag: 'Change Requests',
    summary: 'Delete change request',
    parameters: [pathId()],
    responses: { ...r200('Change request deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
      if (crProject && !await teamMemberCanAccessProject(userId, existingCR.projectId, crProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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
  
  apiRoute(app, 'get', '/api/projects/:projectId/documents', {
    tag: 'Documents',
    summary: 'List project documents',
    parameters: [pathId('projectId')],
    responses: { ...r200('Documents list', arrOf('Document')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const documents = await storage.getProjectDocuments(projectId);
      res.json(documents);
    } catch (err) {
      console.error("Error fetching project documents:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching documents" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/projects/:projectId/documents', {
    tag: 'Documents',
    summary: 'Add document to project',
    parameters: [pathId('projectId')],
    requestBody: body(ref('Document')),
    responses: { ...r201('Document added', ref('Document')), ...createRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'patch', '/api/documents/:id', {
    tag: 'Documents',
    summary: 'Update document',
    parameters: [pathId()],
    requestBody: body(ref('Document')),
    responses: { ...r200('Document updated', ref('Document')), ...updateRes },
  }, async (req, res) => {
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
      if (docProject && !await teamMemberCanAccessProject(userId, existingDoc.projectId, docProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'delete', '/api/documents/:id', {
    tag: 'Documents',
    summary: 'Delete document',
    parameters: [pathId()],
    responses: { ...r200('Document deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
      if (docProject && !await teamMemberCanAccessProject(userId, existingDoc.projectId, docProject.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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
  
  apiRoute(app, 'get', '/api/projects/:projectId/comments', {
    tag: 'Comments',
    summary: 'List project comments',
    parameters: [pathId('projectId')],
    responses: { ...r200('Comments list', arrOf('Comment')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
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
        if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
          return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'post', '/api/projects/:projectId/comments', {
    tag: 'Comments',
    summary: 'Add comment to project',
    parameters: [pathId('projectId')],
    requestBody: body({ type: 'object', properties: { content: { type: 'string' } } }),
    responses: { ...r201('Comment added', ref('Comment')), ...createRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'delete', '/api/comments/:id', {
    tag: 'Comments',
    summary: 'Delete comment',
    parameters: [pathId()],
    responses: { ...r200('Comment deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, comment.projectId, project.organizationId)) {
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
  
  apiRoute(app, 'get', '/api/projects/:projectId/billable-status-comments', {
    tag: 'Comments',
    summary: 'List billable status comments for project',
    parameters: [pathId('projectId')],
    responses: { ...r200('Billable status comments', ref('Comment')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const projectId = Number(req.params.projectId);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Project not found" });
        }
        if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
          return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'post', '/api/projects/:projectId/billable-status-comments', {
    tag: 'Comments',
    summary: 'Add billable status comment',
    parameters: [pathId('projectId')],
    requestBody: body({ type: 'object', properties: { content: { type: 'string' }, billableStatus: { type: 'string' } } }),
    responses: { ...r201('Comment added', ref('Comment')), ...createRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
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
  
  apiRoute(app, 'get', '/api/projects/:projectId/health-status-history', {
    tag: 'Comments',
    summary: 'Get project health status history',
    parameters: [pathId('projectId')],
    responses: { ...r200('Health status history', { type: 'array', items: { type: 'object' } }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const projectId = Number(req.params.projectId);
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(project.organizationId)) {
          return res.status(404).json({ message: "Project not found" });
        }
        if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
          return res.status(403).json({ message: 'Access denied' });
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
  
  apiRoute(app, 'get', '/api/organizations/:organizationId/invoices', {
    tag: 'Invoices',
    summary: 'List organization invoices',
    parameters: [pathId('organizationId')],
    responses: { ...r200('Invoices list', arrOf('Invoice')), ...idRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/projects/:projectId/invoices', {
    tag: 'Invoices',
    summary: 'List project invoices',
    parameters: [pathId('projectId')],
    responses: { ...r200('Project invoices', { type: 'object' }), ...idRes },
  }, async (req, res) => {
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
        if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
          return res.status(403).json({ message: 'Access denied' });
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

  apiRoute(app, 'post', '/api/projects/:projectId/invoices', {
    tag: 'Invoices',
    summary: 'Create project invoice',
    parameters: [pathId('projectId')],
    requestBody: body(ref('Invoice')),
    responses: { ...r201('Invoice created', ref('Invoice')), ...createRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const user = await storage.getUser(userId);
      const userName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || 'Unknown';
      
      const emptyToNull = (v: any) => (v === '' || v === undefined) ? null : v;
      
      const invoiceData = {
        ...req.body,
        projectId,
        organizationId: project.organizationId,
        createdBy: userId,
        createdByName: userName,
        amount: req.body.amount !== undefined ? String(req.body.amount) : undefined,
        invoiceDate: emptyToNull(req.body.invoiceDate),
        dueDate: emptyToNull(req.body.dueDate),
        paidDate: emptyToNull(req.body.paidDate),
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

  apiRoute(app, 'patch', '/api/invoices/:invoiceId', {
    tag: 'Invoices',
    summary: 'Update invoice',
    parameters: [pathId('invoiceId')],
    requestBody: body(ref('Invoice')),
    responses: { ...r200('Invoice updated', ref('Invoice')), ...updateRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, invoice.projectId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { invoiceNumber, description, amount, currency, status, invoiceDate, dueDate, paidDate, notes, lineItems } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (invoiceNumber !== undefined) safeUpdate.invoiceNumber = invoiceNumber;
      if (description !== undefined) safeUpdate.description = description;
      if (amount !== undefined) safeUpdate.amount = amount;
      if (currency !== undefined) safeUpdate.currency = currency;
      if (status !== undefined) safeUpdate.status = status;
      if (invoiceDate !== undefined) safeUpdate.invoiceDate = invoiceDate || null;
      if (dueDate !== undefined) safeUpdate.dueDate = dueDate || null;
      if (paidDate !== undefined) safeUpdate.paidDate = paidDate || null;
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

  apiRoute(app, 'delete', '/api/invoices/:invoiceId', {
    tag: 'Invoices',
    summary: 'Delete invoice',
    parameters: [pathId('invoiceId')],
    responses: { ...r200('Invoice deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, invoice.projectId, project.organizationId)) {
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
  
  apiRoute(app, 'get', '/api/invoices/:invoiceId/notes', {
    tag: 'Invoice Notes',
    summary: 'List invoice notes',
    parameters: [pathId('invoiceId')],
    responses: { ...r200('Invoice notes', { type: 'object' }), ...idRes },
  }, async (req, res) => {
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
        if (!await teamMemberCanAccessProject(userId, invoice.projectId, project.organizationId)) {
          return res.status(403).json({ message: "Access denied" });
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

  apiRoute(app, 'post', '/api/invoices/:invoiceId/notes', {
    tag: 'Invoice Notes',
    summary: 'Create invoice note',
    parameters: [pathId('invoiceId')],
    requestBody: body({ type: 'object', properties: { note: { type: 'string' } } }),
    responses: { ...r201('Note created', ref('Invoice')), ...createRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, invoice.projectId, project.organizationId)) {
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
  
  apiRoute(app, 'get', '/api/organizations/:orgId/project-views', {
    tag: 'Project Views',
    summary: 'List project views for organization',
    parameters: [pathId('orgId'), qStr('mode', true, 'View mode (grid, gantt, or list)'), qInt('portfolioId', false, 'Optional portfolio scope')],
    responses: { ...r200('Project views', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const mode = req.query.mode as string;
      const portfolioIdRaw = req.query.portfolioId;
      let portfolioId: number | null = null;
      if (portfolioIdRaw !== undefined && portfolioIdRaw !== '' && portfolioIdRaw !== null) {
        const pid = Number(portfolioIdRaw);
        if (!Number.isFinite(pid) || pid <= 0) {
          return res.status(400).json({ message: "portfolioId must be a positive number" });
        }
        portfolioId = pid;
      }
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!mode || !['grid', 'gantt', 'list'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid', 'gantt', or 'list'" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const views = await storage.getProjectViews(orgId, userId, mode, portfolioId);
      res.json(views);
    } catch (err) {
      console.error("Error fetching project views:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project views" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:orgId/project-views', {
    tag: 'Project Views',
    summary: 'Create project view',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object' }),
    responses: { ...r201('View created', ref('ProjectView')), ...createRes },
  }, async (req, res) => {
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
      
      const { mode, name, visibleColumns, columnOrder, columnWidths, frozenColumns, isDefault, portfolioId: portfolioIdRaw } = req.body;
      let portfolioId: number | null = null;
      if (portfolioIdRaw !== undefined && portfolioIdRaw !== null) {
        const pid = Number(portfolioIdRaw);
        if (!Number.isFinite(pid) || pid <= 0) {
          return res.status(400).json({ message: "portfolioId must be a positive number or null" });
        }
        portfolioId = pid;
      }
      
      if (!mode || !['grid', 'gantt', 'list'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid', 'gantt', or 'list'" });
      }
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "View name is required" });
      }
      
      if (!visibleColumns || !Array.isArray(visibleColumns)) {
        return res.status(400).json({ message: "Visible columns are required" });
      }
      
      // Check for duplicate name within the same scope
      const existingViews = await storage.getProjectViews(orgId, userId, mode, portfolioId);
      const duplicateName = existingViews.find(v => v.name.toLowerCase() === name.trim().toLowerCase());
      if (duplicateName) {
        return res.status(400).json({ message: "A view with this name already exists" });
      }
      
      const view = await storage.createProjectView({
        organizationId: orgId,
        userId,
        mode,
        name: name.trim(),
        portfolioId,
        visibleColumns,
        columnOrder: columnOrder || null,
        columnWidths: columnWidths || null,
        frozenColumns: frozenColumns || null,
        isDefault: isDefault || false,
        isSystem: false,
      });
      
      // If this is marked as default, update the default status
      if (isDefault) {
        await storage.setDefaultProjectView(orgId, userId, mode, view.id, portfolioId);
      }
      
      res.status(201).json(view);
    } catch (err) {
      console.error("Error creating project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating project view" : classified.message });
    }
  });

  apiRoute(app, 'patch', '/api/project-views/:id', {
    tag: 'Project Views',
    summary: 'Update project view',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('View updated', ref('ProjectView')), ...updateRes },
  }, async (req, res) => {
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
      
      // Check for duplicate name if renaming (within the same scope)
      if (name && name.trim().toLowerCase() !== existingView.name.toLowerCase()) {
        const existingViews = await storage.getProjectViews(existingView.organizationId, userId, existingView.mode, existingView.portfolioId ?? null);
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
        await storage.setDefaultProjectView(existingView.organizationId, userId, existingView.mode, viewId, existingView.portfolioId ?? null);
      }
      
      res.json(updatedView);
    } catch (err) {
      console.error("Error updating project view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating project view" : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/project-views/:id', {
    tag: 'Project Views',
    summary: 'Delete project view',
    parameters: [pathId()],
    responses: { ...r200('View deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/project-views/:id/set-default', {
    tag: 'Project Views',
    summary: 'Set project view as default',
    parameters: [pathId()],
    responses: { ...r200('Default view set', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
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
      
      await storage.setDefaultProjectView(existingView.organizationId, userId, existingView.mode, viewId, existingView.portfolioId ?? null);
      res.json({ success: true });
    } catch (err) {
      console.error("Error setting default view:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error setting default view" : classified.message });
    }
  });

  // =========== SYSTEM PROJECT VIEWS (Admin-managed org-level views) ===========
  
  apiRoute(app, 'get', '/api/organizations/:orgId/system-project-views', {
    tag: 'System Project Views',
    summary: 'List system project views for organization',
    parameters: [pathId('orgId'), qStr('mode', true, 'View mode (grid, gantt, or list)'), qInt('portfolioId', false, 'Optional portfolio scope')],
    responses: { ...r200('System project views', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const mode = req.query.mode as string;
      const portfolioIdRaw = req.query.portfolioId;
      const portfolioId = portfolioIdRaw !== undefined && portfolioIdRaw !== '' ? Number(portfolioIdRaw) : null;
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      if (!mode || !['grid', 'gantt', 'list'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid', 'gantt', or 'list'" });
      }
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const views = await storage.getSystemProjectViews(orgId, mode, portfolioId);
      res.json(views);
    } catch (err) {
      console.error("Error fetching system project views:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching system project views" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:orgId/system-project-views/all', {
    tag: 'System Project Views',
    summary: 'List all system project views including inactive',
    parameters: [pathId('orgId')],
    responses: { ...r200('All system project views', arrOf('ProjectView')), ...fullRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/organizations/:orgId/system-project-views', {
    tag: 'System Project Views',
    summary: 'Create system project view',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object' }),
    responses: { ...r201('System view created', ref('ProjectView')), ...createRes },
  }, async (req, res) => {
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
      
      const { mode, name, description, visibleColumns, columnOrder, columnWidths, filterCriteria, isActive, displayOrder, portfolioId } = req.body;
      
      if (!mode || !['grid', 'gantt', 'list'].includes(mode)) {
        return res.status(400).json({ message: "Mode must be 'grid', 'gantt', or 'list'" });
      }
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "View name is required" });
      }
      
      if (!visibleColumns || !Array.isArray(visibleColumns)) {
        return res.status(400).json({ message: "Visible columns are required" });
      }

      let scopedPortfolioId: number | null = null;
      if (portfolioId !== undefined && portfolioId !== null) {
        const pid = Number(portfolioId);
        if (!Number.isFinite(pid) || pid <= 0) {
          return res.status(400).json({ message: "portfolioId must be a positive number or null" });
        }
        scopedPortfolioId = pid;
      }
      
      const view = await storage.createSystemProjectView({
        organizationId: orgId,
        mode,
        name: name.trim(),
        description: description?.trim() || null,
        portfolioId: scopedPortfolioId,
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

  apiRoute(app, 'patch', '/api/system-project-views/:id', {
    tag: 'System Project Views',
    summary: 'Update system project view',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('System view updated', ref('ProjectView')), ...updateRes },
  }, async (req, res) => {
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

  apiRoute(app, 'delete', '/api/system-project-views/:id', {
    tag: 'System Project Views',
    summary: 'Delete system project view',
    parameters: [pathId()],
    responses: { ...r204('System view deleted'), ...fullRes },
  }, async (req, res) => {
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
  // Cost item routes (CRUD + history + undo) and Multi-Year WBS routes
  // are registered separately by registerFinancialsRoutes() in
  // server/routes/financialsRoutes.ts.


  // ==================== MPP IMPORTS ====================
  
  apiRoute(app, 'get', '/api/mpp-imports', {
    tag: 'MPP Imports',
    summary: 'List MPP imports for organization',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('MPP imports list', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/mpp-imports/:id/tasks', {
    tag: 'MPP Imports',
    summary: 'Get tasks for MPP import',
    parameters: [pathId()],
    responses: { ...r200('Import tasks', { type: 'object' }), ...idRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/mpp-imports/upload', {
    tag: 'MPP Imports',
    summary: 'Upload and parse MPP file',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('File uploaded and parsed', { type: 'object' }), ...createRes },
  }, upload.single('file'), async (req, res) => {
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
          workHours: task.workHours ?? null,
          actualWorkHours: task.actualWorkHours ?? null,
          remainingWorkHours: task.remainingWorkHours ?? null,
          cost: task.cost ?? null,
          actualCost: task.actualCost ?? null,
          remainingCost: task.remainingCost ?? null,
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

  apiRoute(app, 'post', '/api/mpp-imports/:id/convert', {
    tag: 'MPP Imports',
    summary: 'Convert MPP import to project',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Import converted to project', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      const id = Number(req.params.id);
      const { name, portfolioId, description, status, priority, onConflict } = req.body;
      
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

      // Same-name conflict handling: prompt | overwrite | skip
      const conflictMode: 'prompt' | 'overwrite' | 'skip' =
        onConflict === 'overwrite' || onConflict === 'skip' ? onConflict : 'prompt';
      const existingProject = await storage.findActiveProjectByNameInOrg(mppImport.organizationId, name);
      if (existingProject) {
        if (conflictMode === 'prompt') {
          return res.status(409).json({
            conflict: true,
            message: `A project named "${existingProject.name}" already exists.`,
            existingProject: { id: existingProject.id, name: existingProject.name },
          });
        }
        if (conflictMode === 'skip') {
          return res.json({
            success: true,
            skipped: true,
            existingProject: { id: existingProject.id, name: existingProject.name },
            message: `Skipped — project "${existingProject.name}" already exists.`,
          });
        }
        // overwrite: re-import the file into the existing project so the
        // schedule-version history (and other project metadata) is preserved.
        // Project-level access check — org access alone isn't enough; team
        // members may have a restricted project scope and must not be able to
        // overwrite a project they otherwise can't open.
        if (!await teamMemberCanAccessProject(userId, existingProject.id, existingProject.organizationId)) {
          return res.status(403).json({ message: 'Access denied to the existing project' });
        }
        // syncMppImportToProject in 'replace' mode swaps out the tasks and
        // appends a new numbered ScheduleVersion snapshot for this file.
        const syncResult = await storage.syncMppImportToProject(id, existingProject.id, {
          syncMode: 'replace',
          importedBy: userId || null,
        });

        const ovrUser = userId ? await storage.getUser(userId) : null;
        const ovrUserName = ovrUser
          ? `${ovrUser.firstName || ''} ${ovrUser.lastName || ''}`.trim() || ovrUser.email || 'Unknown'
          : 'System';
        const ovrFileName = mppImport.fileName || 'MS Project file';
        const ovrVersionLabel = syncResult.scheduleVersionNumber != null
          ? ` (v${syncResult.scheduleVersionNumber})`
          : '';
        await storage.createProjectChangeLog({
          projectId: syncResult.project.id,
          changedBy: userId || null,
          changedByName: ovrUserName,
          changeType: 'updated',
          changeSummary: `Project "${syncResult.project.name}" overwritten by ${ovrUserName} — re-imported from ${ovrFileName}${ovrVersionLabel}`,
          previousValues: null,
          newValues: null,
        });

        return res.json({
          success: true,
          overwritten: true,
          project: syncResult.project,
          taskCount: syncResult.tasksAdded,
          tasksAdded: syncResult.tasksAdded,
          tasksUpdated: syncResult.tasksUpdated,
          tasksRemoved: syncResult.tasksRemoved,
          scheduleVersionId: syncResult.scheduleVersionId,
          scheduleVersionNumber: syncResult.scheduleVersionNumber,
          message: `Overwrote "${syncResult.project.name}" with ${syncResult.tasksAdded} tasks${ovrVersionLabel}`,
        });
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

  // =========== PRIMAVERA P6 IMPORTS ===========
  // Reuses the mppImports / mppImportTasks tables and convertMppImportToProject storage helper.
  // fileType is set to "xer" or "p6xml" so downstream listings can distinguish the source.

  apiRoute(app, 'post', '/api/p6-imports/upload', {
    tag: 'P6 Imports',
    summary: 'Upload and parse a Primavera P6 XER or PM XML file',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('File uploaded and parsed', { type: 'object' }), ...createRes },
  }, p6Upload.single('file'), async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);

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

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const fileName = req.file.originalname;
      const fileExt = fileName.split('.').pop()?.toLowerCase();

      // Determine source: .xer is tab-delimited; .xml could be P6 PM XML.
      let parsedTasks: ParsedMppTask[] = [];
      let storedFileType: string;

      if (fileExt === 'xer') {
        parsedTasks = parseXerFile(req.file.buffer);
        storedFileType = 'xer';
      } else if (fileExt === 'xml') {
        // Detect P6 PM XML vs MS Project MSPDI by sniffing for P6 markers.
        const xmlPreview = req.file.buffer.toString('utf-8');
        const isP6 = /APIBusinessObjects|<Activity[\s>]|<WBS[\s>]|<Relationship[\s>]/.test(xmlPreview);
        if (!isP6) {
          return res.status(400).json({
            message: "This XML does not appear to be a Primavera P6 PM XML export. Use the MS Project importer for MSPDI files.",
          });
        }
        parsedTasks = await parseP6Xml(xmlPreview);
        storedFileType = 'p6xml';
      } else {
        return res.status(400).json({ message: "Unsupported file format. Use .xer or P6 PM .xml." });
      }

      if (parsedTasks.length === 0) {
        return res.status(400).json({
          message: "No tasks could be parsed from this file. Verify it is a valid Primavera P6 export.",
        });
      }

      // Save the original file to object storage (with local fallback)
      let fileUrl: string | undefined;
      const uniqueFilename = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      try {
        const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
        const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

        if (privateObjectDir) {
          const objectPath = `${privateObjectDir}/p6-imports/${uniqueFilename}`;
          const pathParts = objectPath.split('/');
          const bucketName = pathParts[1];
          const objectName = pathParts.slice(2).join('/');

          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);

          await file.save(req.file.buffer, {
            contentType: 'application/octet-stream',
            metadata: { originalName: fileName, uploadedBy: userId },
          });

          fileUrl = `/objects/p6-imports/${uniqueFilename}`;
        } else {
          throw new Error('Object storage not configured');
        }
      } catch (objectStorageError) {
        console.log("Object storage unavailable, using local storage:", (objectStorageError as Error).message);
        const p6Dir = path.join(process.cwd(), 'public', 'p6-imports');
        if (!fs.existsSync(p6Dir)) {
          fs.mkdirSync(p6Dir, { recursive: true });
        }
        const filePath = path.join(p6Dir, uniqueFilename);
        fs.writeFileSync(filePath, req.file.buffer);
        fileUrl = `/p6-imports/${uniqueFilename}`;
      }

      const importRecord = await storage.createMppImport({
        organizationId,
        fileName,
        fileType: storedFileType,
        fileUrl,
        importedBy: userId,
        taskCount: parsedTasks.length,
        status: 'active',
      });

      if (parsedTasks.length > 0) {
        const taskRecords = parsedTasks.map(task => ({
          importId: importRecord.id,
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
          workHours: task.workHours ?? null,
          actualWorkHours: task.actualWorkHours ?? null,
          remainingWorkHours: task.remainingWorkHours ?? null,
          cost: task.cost ?? null,
          actualCost: task.actualCost ?? null,
          remainingCost: task.remainingCost ?? null,
          predecessors: task.predecessors && task.predecessors.length > 0
            ? JSON.stringify(task.predecessors)
            : null,
        }));
        await storage.createMppImportTasks(taskRecords);
      }

      res.status(201).json({
        ...importRecord,
        taskCount: parsedTasks.length,
      });
    } catch (err: any) {
      console.error("Error uploading P6 file:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({
        message: classified.status === 500 ? "Error processing file" : classified.message,
      });
    }
  });

  apiRoute(app, 'post', '/api/p6-imports/:id/convert', {
    tag: 'P6 Imports',
    summary: 'Convert a Primavera P6 import to a project',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Import converted to project', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const id = Number(req.params.id);
      const { name, portfolioId, description, status, priority, onConflict } = req.body;

      const importRecord = await storage.getMppImport(id);
      if (!importRecord) {
        return res.status(404).json({ message: "Import not found" });
      }

      if (!await userHasOrgAccess(userId, importRecord.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Guard against using this endpoint for non-P6 imports
      if (importRecord.fileType !== 'xer' && importRecord.fileType !== 'p6xml') {
        return res.status(400).json({ message: "This import is not a Primavera P6 import" });
      }

      if (importRecord.projectId) {
        return res.status(400).json({ message: "This import has already been converted to a project" });
      }

      if (!name) {
        return res.status(400).json({ message: "Project name is required" });
      }

      // Same-name conflict handling: prompt | overwrite | skip
      const conflictMode: 'prompt' | 'overwrite' | 'skip' =
        onConflict === 'overwrite' || onConflict === 'skip' ? onConflict : 'prompt';
      const existingProject = await storage.findActiveProjectByNameInOrg(importRecord.organizationId, name);
      if (existingProject) {
        if (conflictMode === 'prompt') {
          return res.status(409).json({
            conflict: true,
            message: `A project named "${existingProject.name}" already exists.`,
            existingProject: { id: existingProject.id, name: existingProject.name },
          });
        }
        if (conflictMode === 'skip') {
          return res.json({
            success: true,
            skipped: true,
            existingProject: { id: existingProject.id, name: existingProject.name },
            message: `Skipped — project "${existingProject.name}" already exists.`,
          });
        }
      }

      // Check project limit only when we're actually going to create a new project.
      // Overwrite re-imports into the existing project (no new project row), so the
      // net project count is unchanged.
      if (!existingProject) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PROJECTS, 1, importRecord.organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({
            message: limitCheck.error || "Project limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "projects",
          });
        }
      }

      const p6SourceLabel = importRecord.fileType === 'xer' ? 'Primavera P6 XER' : 'Primavera P6 XML';

      // overwrite: re-import into the existing project so the schedule-version
      // history (and any other project metadata) is preserved. The replace
      // sync mode swaps out the tasks and appends a new numbered
      // ScheduleVersion snapshot for this file.
      if (existingProject) {
        // Project-level access check — org access alone isn't enough; team
        // members may have a restricted project scope and must not be able to
        // overwrite a project they otherwise can't open.
        if (!await teamMemberCanAccessProject(userId, existingProject.id, existingProject.organizationId)) {
          return res.status(403).json({ message: 'Access denied to the existing project' });
        }
        const syncResult = await storage.syncMppImportToProject(id, existingProject.id, {
          syncMode: 'replace',
          importedBy: userId || null,
        });

        const ovrUser = await storage.getUser(userId);
        const ovrUserName = ovrUser
          ? `${ovrUser.firstName || ''} ${ovrUser.lastName || ''}`.trim() || ovrUser.email || 'Unknown'
          : 'System';
        const ovrFileName = importRecord.fileName || p6SourceLabel;
        const ovrVersionLabel = syncResult.scheduleVersionNumber != null
          ? ` (v${syncResult.scheduleVersionNumber})`
          : '';
        await storage.createProjectChangeLog({
          projectId: syncResult.project.id,
          changedBy: userId,
          changedByName: ovrUserName,
          changeType: 'updated',
          changeSummary: `Project "${syncResult.project.name}" overwritten by ${ovrUserName} — re-imported from ${ovrFileName} (${p6SourceLabel})${ovrVersionLabel}`,
          previousValues: null,
          newValues: null,
        });

        return res.json({
          success: true,
          overwritten: true,
          project: syncResult.project,
          taskCount: syncResult.tasksAdded,
          tasksAdded: syncResult.tasksAdded,
          tasksUpdated: syncResult.tasksUpdated,
          tasksRemoved: syncResult.tasksRemoved,
          scheduleVersionId: syncResult.scheduleVersionId,
          scheduleVersionNumber: syncResult.scheduleVersionNumber,
          message: `Overwrote "${syncResult.project.name}" with ${syncResult.tasksAdded} tasks${ovrVersionLabel}`,
        });
      }

      const result = await storage.convertMppImportToProject(id, {
        organizationId: importRecord.organizationId,
        portfolioId: portfolioId ? Number(portfolioId) : undefined,
        name,
        description,
        status,
        priority,
      });

      // Record usage after successful creation
      {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.PROJECTS, result.project.id, 1, result.project.organizationId);
      }

      const p6User = await storage.getUser(userId);
      const p6UserName = p6User
        ? `${p6User.firstName || ''} ${p6User.lastName || ''}`.trim() || p6User.email || 'Unknown'
        : 'System';
      const sourceFileName = importRecord.fileName || p6SourceLabel;
      await storage.createProjectChangeLog({
        projectId: result.project.id,
        changedBy: userId,
        changedByName: p6UserName,
        changeType: 'created',
        changeSummary: `Project "${result.project.name}" created by ${p6UserName} — imported from ${sourceFileName} (${p6SourceLabel})`,
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
      console.error("Error converting P6 import:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({
        message: classified.status === 500 ? "Error converting import to project" : classified.message,
      });
    }
  });

  apiRoute(app, 'post', '/api/mpp-imports/:id/sync', {
    tag: 'MPP Imports',
    summary: 'Sync MPP import to existing project',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Import synced to project', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
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
        importedBy: userId || null,
      });

      const response = {
        success: true,
        project: result.project,
        tasksAdded: result.tasksAdded,
        tasksUpdated: result.tasksUpdated,
        tasksRemoved: result.tasksRemoved,
        scheduleVersionId: result.scheduleVersionId,
        scheduleVersionNumber: result.scheduleVersionNumber,
        message: `Synced to "${result.project.name}": ${result.tasksAdded} added, ${result.tasksUpdated} updated, ${result.tasksRemoved} removed`,
      };

      return res.json(response);
    } catch (err: any) {
      console.error("Error syncing MPP import to project:", err?.message || err);
      const classified = classifyError(err);
      return res.status(classified.status).json({ message: classified.status === 500 ? "Error syncing import to project" : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/mpp-imports/:id', {
    tag: 'MPP Imports',
    summary: 'Delete MPP import',
    parameters: [pathId()],
    responses: { ...r200('Import deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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

  // =========== SCHEDULE VERSIONS ===========
  // Version history snapshots for imported schedules (MS Project / Primavera P6).
  // Each (re-)import or restore creates a new version row in schedule_versions
  // plus a snapshot of the file's tasks in schedule_version_tasks.

  apiRoute(app, 'get', '/api/projects/:projectId/schedule-versions', {
    tag: 'Schedule Versions',
    summary: 'List schedule version history for a project',
    parameters: [pathId('projectId')],
    responses: { ...r200('Schedule versions', { type: 'array' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const versions = await listScheduleVersionsForProject(projectId);

      // Decorate with importer display name (best effort)
      const userIds = Array.from(new Set(versions.map(v => v.importedBy).filter((x): x is string => !!x)));
      const userMap = new Map<string, string>();
      for (const uid of userIds) {
        try {
          const u = await storage.getUser(uid);
          if (u) {
            const display = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown';
            userMap.set(uid, display);
          }
        } catch { /* ignore */ }
      }

      const enriched = versions.map(v => ({
        ...v,
        importedByName: v.importedBy ? (userMap.get(v.importedBy) || 'Unknown') : null,
      }));

      res.json(enriched);
    } catch (err) {
      console.error('Error listing schedule versions:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error listing schedule versions' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/projects/:projectId/schedule-versions/:versionId/tasks', {
    tag: 'Schedule Versions',
    summary: 'Get tasks for a specific schedule version (read-only snapshot)',
    parameters: [pathId('projectId'), pathId('versionId')],
    responses: { ...r200('Snapshot tasks', { type: 'array' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const versionId = Number(req.params.versionId);

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const version = await getScheduleVersionById(versionId);
      if (!version || version.projectId !== projectId) {
        return res.status(404).json({ message: 'Schedule version not found' });
      }

      const snapshotTasks = await getScheduleVersionTaskRows(versionId);
      res.json({ version, tasks: snapshotTasks });
    } catch (err) {
      console.error('Error fetching schedule version tasks:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error fetching schedule version tasks' : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/projects/:projectId/schedule-versions/diff', {
    tag: 'Schedule Versions',
    summary: 'Diff two schedule versions for a project',
    parameters: [pathId('projectId'), qInt('from', true, 'From version ID'), qInt('to', true, 'To version ID')],
    responses: { ...r200('Diff result', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const fromId = Number(req.query.from);
      const toId = Number(req.query.to);
      if (!fromId || !toId) {
        return res.status(400).json({ message: 'Both from and to version IDs are required' });
      }

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const [fromVer, toVer] = await Promise.all([
        getScheduleVersionById(fromId),
        getScheduleVersionById(toId),
      ]);
      if (!fromVer || fromVer.projectId !== projectId) return res.status(404).json({ message: 'From version not found' });
      if (!toVer || toVer.projectId !== projectId) return res.status(404).json({ message: 'To version not found' });

      const diff = await diffScheduleVersionsFn(fromId, toId);
      res.json(diff);
    } catch (err) {
      console.error('Error diffing schedule versions:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error diffing schedule versions' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/projects/:projectId/schedule-versions/:versionId/restore', {
    tag: 'Schedule Versions',
    summary: 'Restore a schedule version (creates a new version snapshot)',
    parameters: [pathId('projectId'), pathId('versionId')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Version restored', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const projectId = Number(req.params.projectId);
      const versionId = Number(req.params.versionId);

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const sourceVersion = await getScheduleVersionById(versionId);
      if (!sourceVersion || sourceVersion.projectId !== projectId) {
        return res.status(404).json({ message: 'Schedule version not found' });
      }

      const result = await restoreScheduleVersionFn(versionId, userId);

      // Record a project change log entry
      try {
        const u = await storage.getUser(userId);
        const userName = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown' : 'Unknown';
        await storage.createProjectChangeLog({
          projectId,
          changedBy: userId,
          changedByName: userName,
          changeType: 'updated',
          changeSummary: `Restored schedule version v${sourceVersion.versionNumber} (created v${result.newVersion.versionNumber}) — ${result.tasksRestored} tasks`,
          previousValues: null,
          newValues: null,
        });
      } catch (logErr) {
        console.error('Failed to record project change log for restore:', logErr);
      }

      res.json({
        success: true,
        newVersion: result.newVersion,
        tasksRestored: result.tasksRestored,
        message: `Restored to v${sourceVersion.versionNumber}; ${result.tasksRestored} tasks loaded as new v${result.newVersion.versionNumber}`,
      });
    } catch (err) {
      console.error('Error restoring schedule version:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error restoring schedule version' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/projects/:projectId/schedule-versions/:versionId', {
    tag: 'Schedule Versions',
    summary: 'Delete a schedule version (cascade-removes its task snapshot)',
    parameters: [pathId('projectId'), pathId('versionId')],
    responses: { ...r200('Version deleted', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const projectId = Number(req.params.projectId);
      const versionId = Number(req.params.versionId);

      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (!await teamMemberCanAccessProject(userId, projectId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const sourceVersion = await getScheduleVersionById(versionId);
      if (!sourceVersion || sourceVersion.projectId !== projectId) {
        return res.status(404).json({ message: 'Schedule version not found' });
      }

      try {
        const result = await deleteScheduleVersionFn(versionId);

        try {
          const u = await storage.getUser(userId);
          const userName = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown' : 'Unknown';
          await storage.createProjectChangeLog({
            projectId,
            changedBy: userId,
            changedByName: userName,
            changeType: 'deleted',
            changeSummary: `Deleted schedule version v${result.deletedVersionNumber}`,
            previousValues: null,
            newValues: null,
          });
        } catch (logErr) {
          console.error('Failed to record project change log for delete:', logErr);
        }

        res.json({
          success: true,
          deletedVersionNumber: result.deletedVersionNumber,
          message: `Deleted schedule version v${result.deletedVersionNumber}`,
        });
      } catch (err) {
        if (err instanceof ScheduleVersionDeleteError) {
          return res.status(err.status).json({ message: err.message });
        }
        throw err;
      }
    } catch (err) {
      console.error('Error deleting schedule version:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error deleting schedule version' : classified.message });
    }
  });

  // =========== PROJECT TEMPLATES ===========

  apiRoute(app, 'get', '/api/project-templates', {
    tag: 'Project Templates',
    summary: 'List project templates',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Templates list', arrOf('ProjectTemplate')), ...authRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/project-templates/:id', {
    tag: 'Project Templates',
    summary: 'Get project template by ID',
    parameters: [pathId()],
    responses: { ...r200('Template details', ref('ProjectTemplate')), ...idRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/project-templates/from-mpp', {
    tag: 'Project Templates',
    summary: 'Create template from MPP file',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Template created from file', ref('ProjectTemplate')), ...createRes },
  }, upload.single('file'), async (req, res) => {
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
          workHours: task.workHours ?? null,
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

  apiRoute(app, 'post', '/api/project-templates/from-project', {
    tag: 'Project Templates',
    summary: 'Create template from existing project',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Template created from project', ref('ProjectTemplate')), ...createRes },
  }, async (req, res) => {
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
      if (!await teamMemberCanAccessProject(userId, Number(projectId), project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

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
            duration: task.durationDays,
            durationDays: task.durationDays,
            outlineLevel: task.outlineLevel || 1,
            parentTaskId: task.parentId,
            isSummary: task.isSummary || false,
            isMilestone: task.taskType === 'Milestone',
            predecessors: deps && deps.length > 0 ? JSON.stringify(deps) : null,
            notes: task.notes,
            workHours: task.estimatedHours != null ? Number(task.estimatedHours) : null,
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

  apiRoute(app, 'put', '/api/project-templates/:id', {
    tag: 'Project Templates',
    summary: 'Update project template',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Template updated', ref('ProjectTemplate')), ...updateRes },
  }, async (req, res) => {
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

  apiRoute(app, 'delete', '/api/project-templates/:id', {
    tag: 'Project Templates',
    summary: 'Delete project template',
    parameters: [pathId()],
    responses: { ...r200('Template deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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
              await bucket.file(objectName).delete().catch((err: any) => {
                console.error('Failed to delete file from storage:', objectName, err?.message || err);
              });
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

  apiRoute(app, 'post', '/api/project-templates/:id/duplicate', {
    tag: 'Project Templates',
    summary: 'Duplicate project template',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r201('Template duplicated', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
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
          workHours: item.workHours ?? null,
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

  apiRoute(app, 'get', '/api/project-templates/:id/download', {
    tag: 'Project Templates',
    summary: 'Download project template file',
    parameters: [pathId()],
    responses: { ...r200('Template file download', { type: 'object' }), ...idRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/project-templates/:id/reimport', {
    tag: 'Project Templates',
    summary: 'Reimport template from new file',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Template reimported', { type: 'object' }), ...updateRes },
  }, upload.single('file'), async (req, res) => {
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
          workHours: task.workHours ?? null,
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
              await bucket.file(objectName).delete().catch((err: any) => {
                console.error('Failed to delete file from storage:', objectName, err?.message || err);
              });
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

  apiRoute(app, 'post', '/api/project-templates/:id/create-project', {
    tag: 'Project Templates',
    summary: 'Create project from template',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Project created from template', ref('ProjectTemplate')), ...createRes },
  }, async (req, res) => {
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
        budget: 0,
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
