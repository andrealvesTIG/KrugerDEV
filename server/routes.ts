import type { Express, Request as ExpressRequest } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth as setupReplitAuth } from "./replit_integrations/auth";
import { setupAuth as setupEmailAuth } from "./auth/emailAuth";
import { setupMicrosoftAuth } from "./auth/microsoftAuth";
import { setupGoogleAuth } from "./auth/googleAuth";
import { setupProjectOnlineRoutes } from "./services/projectOnline";
import { setupPlannerRoutes, mapPlannerPriorityToProjectPriority, mapPlannerPercentToStatus, getOrgIntegration } from "./services/microsoftPlanner";
import { setupDataverseRoutes, mapDataversePriorityToProjectPriority, mapDataverseProgressToStatus } from "./services/microsoftDataverse";
import { setupDynamics365Routes } from "./services/dynamics365Sales";
import { sendEmail, sendAccessRequestNotification, sendAccessRequestDecisionNotification, sendOrganizationInviteEmail } from "./services/email";
import { createTaskAssignmentNotification, createRiskAssignmentNotification, createProjectAssignmentNotification } from "./services/notificationEngine";
import { AVAILABLE_DASHBOARDS, sendScheduledReport, checkAndSendDueReports, initializeSubscriptionSchedule, calculateNextScheduledTime } from "./services/scheduledReports";
import { db } from "./db";
import { users, usageEvents, meters, taskResourceAssignments, issueResourceAssignments, issues, resources, tasks, projects, portfolios, milestones, customDashboards, organizationMembers, organizationInvites, plans, subscriptions, billingAuditLogs, billingCycles, usageRollups, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, insertUserConsentSchema, helpTickets, insertHelpTicketSchema, systemProjectViews, timesheetEntries, taskChangeLogs, taskDependencies, notifications, reportSubscriptions, insertReportSubscriptionSchema, trainingModules, trainingLessons, trainingQuizQuestions, timesheetReminderSettings, type Task } from "@shared/schema";
import { magicLinkTokens, type User } from "@shared/models/auth";
import { eq, and, desc, asc, sql, isNotNull, inArray } from "drizzle-orm";
import Papa from "papaparse";

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import OpenAI from "openai";
import { addWorkingDays, ensureWorkingDay, calculateEndDate, calculateDuration, nextWorkingDay, formatDateStr, workingDaysBetweenExclusive } from "./lib/workingDays";
import { registerUserRoutes } from "./routes/userRoutes";
import { registerOrganizationRoutes } from "./routes/organizationRoutes";
import { registerOrgMemberRoutes } from "./routes/orgMemberRoutes";
import { registerPortfolioRoutes } from "./routes/portfolioRoutes";
import { registerProjectRoutes } from "./routes/projectRoutes";
import { registerProjectFeatureRoutes } from "./routes/projectFeatureRoutes";
import { registerProjectItemRoutes } from "./routes/projectItemRoutes";
import { registerResourceRoutes } from "./routes/resourceRoutes";
import { registerDashboardRoutes } from "./routes/dashboardRoutes";
import { registerMiscRoutes } from "./routes/miscRoutes";

import {
  encryptApiKey,
  decryptApiKey,
  openai,
  upload,
  imageUpload,
  formatZodErrors,
  classifyError,
  parseMppFile,
  parseXmlMspdi,
  parseCsv,
  parseDate,
  seedDatabase,
  sanitizeUser,
  sanitizeUsers,
  getUserIdFromRequest,
  normalizeSearchStr,
  logUserActivity,
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
} from "./routes/helpers";
import type { ParsedMppTask, TeamMemberAccessData } from "./routes/helpers";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Validate that common numeric route params are valid integers (prevents NaN SQL errors)
  const numericParams = ['id', 'projectId', 'portfolioId', 'taskId', 'issueId', 'milestoneId', 'riskId', 'resourceId', 'orgId', 'organizationId', 'memberId', 'ticketId', 'documentId', 'assessmentId', 'subscriptionId', 'planId', 'viewId', 'entryId', 'notificationId'];
  for (const param of numericParams) {
    app.param(param, (req, res, next, value) => {
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num)) {
        return res.status(400).json({ message: `Invalid ${param}: must be an integer` });
      }
      next();
    });
  }

  // Bearer token middleware — resolves API tokens to userId for all routes.
  // Only applies when no existing session auth is present (avoids overriding cookie sessions).
  app.use(async (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const existingUserId = req.user?.claims?.sub || req.session?.userId;
      if (!existingUserId) {
        try {
          const token = authHeader.slice(7);
          const tokenRecord = await storage.getApiTokenByToken(token);
          if (tokenRecord) {
            if (!tokenRecord.expiresAt || tokenRecord.expiresAt >= new Date()) {
              if (!req.session) req.session = {};
              req.session.userId = tokenRecord.userId;
              req.bearerOrgId = tokenRecord.organizationId;
              storage.updateApiTokenLastUsed(tokenRecord.id);
            }
          }
        } catch (err) {
          // Silently continue — session/other auth will apply
        }
      }
    }
    next();
  });

  // Set up authentication first - Replit OAuth, Email/Password, Microsoft 365, and Google
  await setupReplitAuth(app);
  await setupEmailAuth(app);
  await setupMicrosoftAuth(app);
  setupGoogleAuth(app);
  await setupProjectOnlineRoutes(app);
  await setupPlannerRoutes(app);
  await setupDataverseRoutes(app);
  await setupDynamics365Routes(app);
  // Seed DB on startup
  seedDatabase().catch(err => console.error("Error seeding database:", err));

  registerUserRoutes(app);
  registerOrganizationRoutes(app);
  registerOrgMemberRoutes(app);
  registerPortfolioRoutes(app);
  registerProjectRoutes(app);
  registerProjectFeatureRoutes(app);
  registerProjectItemRoutes(app);
  registerResourceRoutes(app);
  registerDashboardRoutes(app);
  await registerMiscRoutes(app);

  // ==================== PROJECT INTAKES ====================

  // Get all project intakes for an organization
  app.get('/api/project-intakes', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const intakes = await storage.getProjectIntakes(organizationId);
      res.json(intakes);
    } catch (err) {
      console.error("Error fetching project intakes:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project intakes" : classified.message });
    }
  });

  // Get a single project intake
  app.get('/api/project-intakes/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const intake = await storage.getProjectIntake(Number(req.params.id));
      if (!intake) return res.status(404).json({ message: "Project intake not found" });
      if (!await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // If organizationId is provided, validate the intake belongs to that organization
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      if (organizationId && intake.organizationId !== organizationId) {
        return res.status(404).json({ message: "Project intake not found in this organization" });
      }

      res.json(intake);
    } catch (err) {
      console.error("Error fetching project intake:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project intake" : classified.message });
    }
  });

  // Create a new project intake
  app.post('/api/project-intakes', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);

      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { 
        organizationId, projectName, submitterId, description, fundingSource,
        portfolioId, businessUnit, programName
      } = req.body;

      if (!organizationId || !projectName) {
        return res.status(400).json({ message: "organizationId and projectName are required" });
      }

      // Check intake limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.INTAKES);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Intake limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "intakes"
          });
        }
      }

      const intake = await storage.createProjectIntake({
        organizationId,
        projectName,
        submitterId,
        description,
        fundingSource,
        portfolioId,
        businessUnit,
        programName,
        status: 'draft',
        currentStep: 'intake_capture',
      });

      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("./services/billing");
        await recordResourceUsage(userId, METER_CODES.INTAKES, intake.id, 1, organizationId);
      }

      res.status(201).json(intake);
    } catch (err) {
      console.error("Error creating project intake:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating project intake" : classified.message });
    }
  });

  // Update a project intake
  app.put('/api/project-intakes/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });

      // Check user has access to the organization this intake belongs to
      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }
      }

      const updated = await storage.updateProjectIntake(id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating project intake:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating project intake" : classified.message });
    }
  });

  // Delete a project intake
  app.delete('/api/project-intakes/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });

      // Check user has access to the organization this intake belongs to
      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }
      }

      await storage.deleteProjectIntake(id);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting project intake:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting project intake" : classified.message });
    }
  });

  // Check if user can approve intakes for an organization
  app.get('/api/organizations/:orgId/can-approve-intakes', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Admin roles can always approve
      if (hasAdminAccess(user)) {
        return res.json({ canApprove: true });
      }

      // Check if user is org_admin or owner for this organization
      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && (m.role === 'org_admin' || m.role === 'owner'));

      if (isOrgAdmin) {
        return res.json({ canApprove: true });
      }

      // Check if user's resource has isIntakeApprover flag
      const resources = await storage.getResources(orgId);
      const userResource = resources.find(r => r.userId === userId);
      const isIntakeApprover = userResource?.isIntakeApprover === true;

      return res.json({ canApprove: isIntakeApprover });
    } catch (err) {
      console.error("Error checking intake approval permission:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error checking permission" : classified.message });
    }
  });

  // Approve a project intake and create project
  app.post('/api/project-intakes/:id/approve', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });

      if (existing.status === 'approved') {
        return res.status(400).json({ message: "Project intake is already approved" });
      }

      // Check PMO approval requirement
      if (!existing.pmoApproved) {
        return res.status(403).json({ message: "PM approval is required before converting to a project. Please ensure the PM has approved this intake." });
      }

      // Check user permission - must be super_admin, org_admin/owner, or have isIntakeApprover flag
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const isSuperAdmin = hasAdminAccess(user);
      if (!isSuperAdmin) {
        // Check if user is org_admin or owner for this organization
        const memberships = await storage.getUserOrganizations(userId);
        const isOrgAdmin = memberships.some(m => m.organizationId === existing.organizationId && (m.role === 'org_admin' || m.role === 'owner'));

        // Check if user's resource has isIntakeApprover flag
        const resources = await storage.getResources(existing.organizationId);
        const userResource = resources.find(r => r.userId === userId);
        const isIntakeApprover = userResource?.isIntakeApprover === true;

        if (!isOrgAdmin && !isIntakeApprover) {
          return res.status(403).json({ message: "You don't have permission to approve intakes. Contact your administrator to grant you intake approval permissions." });
        }
      }

      const project = await storage.approveProjectIntake(id, userId);
      res.json({ 
        message: "Project intake approved and project created",
        project 
      });
    } catch (err) {
      console.error("Error approving project intake:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error approving project intake" : classified.message });
    }
  });

  // Reject a project intake
  app.post('/api/project-intakes/:id/reject', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { reason } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });

      // Check user permission - must be super_admin, org_admin/owner, or have isIntakeApprover flag
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const isSuperAdmin = hasAdminAccess(user);
      if (!isSuperAdmin) {
        const memberships = await storage.getUserOrganizations(userId);
        const isOrgAdmin = memberships.some(m => m.organizationId === existing.organizationId && (m.role === 'org_admin' || m.role === 'owner'));

        const resources = await storage.getResources(existing.organizationId);
        const userResource = resources.find(r => r.userId === userId);
        const isIntakeApprover = userResource?.isIntakeApprover === true;

        if (!isOrgAdmin && !isIntakeApprover) {
          return res.status(403).json({ message: "You don't have permission to reject intakes. Contact your administrator to grant you intake approval permissions." });
        }
      }

      const updated = await storage.updateProjectIntake(id, {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: reason,
      });

      res.json(updated);
    } catch (err) {
      console.error("Error rejecting project intake:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error rejecting project intake" : classified.message });
    }
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
        const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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
      console.log("MPP Sync request:", { params: req.params, body: req.body });

      const userId = getUserIdFromRequest(req);
      if (!userId) {
        console.log("MPP Sync: No userId");
        return res.status(401).json({ message: "Authentication required" });
      }

      const id = Number(req.params.id);
      const { projectId, syncMode } = req.body;

      console.log("MPP Sync: parsed values", { id, projectId, syncMode });

      if (!projectId) {
        console.log("MPP Sync: No projectId");
        return res.status(400).json({ message: "projectId is required" });
      }

      // Get the import to verify it exists
      const mppImport = await storage.getMppImport(id);
      if (!mppImport) {
        console.log("MPP Sync: Import not found");
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

      console.log("MPP Sync: Starting sync operation");
      const result = await storage.syncMppImportToProject(id, Number(projectId), {
        syncMode: syncMode || 'merge',
      });

      console.log("MPP Sync: Completed", { 
        projectName: result.project?.name, 
        tasksAdded: result.tasksAdded, 
        tasksUpdated: result.tasksUpdated 
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
        const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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
            const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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
            const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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
          const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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
        const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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
            const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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


  // =========== AI PROJECT GENERATION ===========

  // Generate a project with tasks, issues, and risks using AI
  app.post('/api/ai/generate-project', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);

      // Require authentication
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { prompt, organizationId, portfolioId } = req.body;

      // Check AI runs limit before making the API call (using org subscription)
      const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, organizationId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }

      // Check user has access to the specified organization
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const systemPrompt = `You are a project management expert. Based on the user's project description, generate a comprehensive project plan in JSON format.

The response must be valid JSON with this exact structure:
{
  "project": {
    "name": "Project name (max 100 chars)",
    "description": "Detailed project description",
    "status": "Initiation",
    "priority": "Medium",
    "health": "Green",
    "budget": 0
  },
  "tasks": [
    {
      "name": "Task name",
      "description": "Task description",
      "durationDays": 5,
      "status": "Not Started"
    }
  ],
  "issues": [
    {
      "title": "Issue title",
      "description": "Issue description",
      "priority": "Medium",
      "status": "Open",
      "type": "Task"
    }
  ],
  "risks": [
    {
      "title": "Risk title",
      "description": "Risk description",
      "probability": "Medium",
      "impact": "Medium",
      "status": "Open",
      "mitigationPlan": "How to mitigate this risk"
    }
  ]
}

Guidelines:
- Generate 5-10 logical tasks that form a project timeline
- Generate 2-5 potential issues or action items
- Generate 2-4 project risks with mitigation plans
- Use realistic estimates based on the project scope
- Priority can be: Low, Medium, High, Critical
- Task status: Not Started, In Progress, Completed
- Issue type: Bug, Enhancement, Task, Question
- Risk probability/impact: Low, Medium, High

Return ONLY valid JSON, no markdown or explanations.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a project plan for: ${prompt}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });

      // Track AI usage and deduct credits after successful API call
      const { recordCreditUsage, RESOURCE_TYPES } = await import("./services/billing");
      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_project_${Date.now()}`);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI did not return a response" });
      }

      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content);
        const classified = classifyError(parseError);
        return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to parse AI response" : classified.message });
      }

      // Calculate dates for tasks
      const today = new Date();
      let currentDate = new Date(today);

      // Create project
      const projectData = {
        organizationId,
        portfolioId: portfolioId || null,
        name: aiResult.project.name,
        description: aiResult.project.description,
        status: aiResult.project.status || "Initiation",
        priority: aiResult.project.priority || "Medium",
        health: aiResult.project.health || "Green",
        budget: String(aiResult.project.budget || 0),
        startDate: today.toISOString().split('T')[0],
        source: "ai_generated",
      };

      const project = await storage.createProject(projectData);

      const aiUser = userId ? await storage.getUser(userId) : null;
      const aiCreatorName = aiUser ? `${aiUser.firstName || ''} ${aiUser.lastName || ''}`.trim() || aiUser.email || 'Unknown' : 'System';
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: aiCreatorName,
        changeType: 'created',
        changeSummary: `Project "${project.name}" created by ${aiCreatorName} — generated with AI`,
        previousValues: null,
        newValues: null,
      });

      // Create tasks with sequential dates
      const createdTasks = [];
      for (const taskData of aiResult.tasks || []) {
        const startDate = new Date(currentDate);
        const durationDays = taskData.durationDays || 5;
        const endDate = new Date(currentDate);
        endDate.setDate(endDate.getDate() + durationDays);

        const task = await storage.createTask({
          projectId: project.id,
          name: taskData.name,
          description: taskData.description,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          durationDays,
          status: taskData.status || "Not Started",
          progress: 0,
        });
        createdTasks.push(task);

        // Move current date forward for next task
        currentDate = new Date(endDate);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Update project end date based on last task
      if (createdTasks.length > 0) {
        const lastTask = createdTasks[createdTasks.length - 1];
        await storage.updateProject(project.id, {
          endDate: lastTask.endDate,
        });
      }

      // Create issues
      const createdIssues = [];
      for (const issueData of aiResult.issues || []) {
        const issue = await storage.createIssue({
          projectId: project.id,
          title: issueData.title,
          description: issueData.description,
          priority: issueData.priority || "Medium",
          status: issueData.status || "Open",
          type: issueData.type || "Task",
          costExposure: issueData.costExposure || null,
        });
        createdIssues.push(issue);
      }

      // Create risks
      const createdRisks = [];
      for (const riskData of aiResult.risks || []) {
        const risk = await storage.createRisk({
          projectId: project.id,
          title: riskData.title,
          description: riskData.description,
          probability: riskData.probability || "Medium",
          impact: riskData.impact || "Medium",
          status: riskData.status || "Open",
          mitigationPlan: riskData.mitigationPlan,
          costExposure: riskData.costExposure || null,
        });
        createdRisks.push(risk);
      }

      res.status(201).json({
        success: true,
        project,
        tasks: createdTasks,
        issues: createdIssues,
        risks: createdRisks,
        summary: {
          tasksCreated: createdTasks.length,
          issuesCreated: createdIssues.length,
          risksCreated: createdRisks.length,
        }
      });
    } catch (err) {
      console.error("Error generating AI project:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to generate project with AI" : classified.message });
    }
  });

  // Smart AI Create - can create projects, tasks, risks, issues, milestones, or resources
  app.post('/api/ai/smart-create', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { prompt, organizationId, projectId, portfolioId } = req.body;

      // Check AI runs limit (using org subscription)
      const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, organizationId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const systemPrompt = `You are an AI assistant for a project portfolio management system. Based on the user's request, determine what they want to create and generate the appropriate data.

Analyze the request and decide which type(s) of items to create:
- "project" - For creating new projects with tasks, risks, and issues
- "task" - For creating one or more tasks (requires projectId context)
- "risk" - For creating one or more project risks (requires projectId context)
- "issue" - For creating one or more project issues (requires projectId context)
- "milestone" - For creating one or more milestones (requires projectId context)
- "resource" - For creating team members/resources

Return a JSON response with this structure:
{
  "intent": "project" | "task" | "risk" | "issue" | "milestone" | "resource" | "multiple",
  "requiresProject": boolean,
  "assignToMe": boolean,
  "items": {
    "project": { ... } | null,
    "tasks": [...] | [],
    "risks": [...] | [],
    "issues": [...] | [],
    "milestones": [...] | [],
    "resources": [...] | []
  }
}

For a PROJECT:
{
  "name": "Project name",
  "description": "Description",
  "status": "Initiation",
  "priority": "Medium",
  "health": "Green",
  "budget": 0
}

For TASKS (array):
{
  "name": "Task name",
  "description": "Description",
  "durationDays": 5,
  "status": "Not Started",
  "priority": "Medium"
}

For RISKS (array):
{
  "title": "Risk title",
  "description": "Description",
  "probability": "Medium",
  "impact": "Medium",
  "status": "Open",
  "mitigationPlan": "How to mitigate",
  "costExposure": "50000"
}

For ISSUES (array):
{
  "title": "Issue title",
  "description": "Description",
  "priority": "Medium",
  "status": "Open",
  "type": "Task",
  "costExposure": "25000"
}

For MILESTONES (array):
{
  "name": "Milestone name",
  "description": "Description",
  "daysFromStart": 30
}

For RESOURCES (array):
{
  "displayName": "Full Name",
  "email": "email@example.com",
  "title": "Job Title",
  "department": "Department",
  "skills": "Skill1, Skill2"
}

Guidelines:
- If user mentions "project", "initiative", "program" → create a project with related tasks/risks
- If user mentions "task", "todo", "work item", "action item" → create tasks. If no projectId is provided in the context, you MUST also create one or more projects to hold the tasks. Distribute tasks across the projects logically.
- If user mentions "risk", "concern", "threat" → create risks. If no projectId is provided, also create a project.
- If user mentions "issue", "problem", "bug", "blocker" → create issues. If no projectId is provided, also create a project.
- If user mentions "milestone", "deadline", "deliverable", "phase" → create milestones. If no projectId is provided, also create a project.
- If user mentions "resource", "team member", "person", "staff" → create resources only
- If the user asks to create items across "a few projects" or "multiple projects", create multiple projects each with their own tasks/items. In this case, return a "projects" array instead of a single "project" object in items.
- If the user says "assign me", "assign to me", "for me", or similar, set "assignToMe": true
- Be specific and realistic based on the domain context
- Generate 3-8 items when creating multiple of the same type
- When distributing tasks across multiple projects, assign each task a "projectIndex" (0-based) matching the project in the "projects" array.

For MULTIPLE PROJECTS, use this items structure:
{
  "projects": [{ "name": "...", "description": "...", ... }, { "name": "...", ... }],
  "tasks": [{ "name": "...", "projectIndex": 0, ... }, { "name": "...", "projectIndex": 1, ... }]
}

Return ONLY valid JSON.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Request: ${prompt}\n\nContext: organizationId=${organizationId}${projectId ? `, projectId=${projectId}` : ''}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });

      const { recordCreditUsage, RESOURCE_TYPES } = await import("./services/billing");
      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_smart_create_${Date.now()}`);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI did not return a response" });
      }

      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError) {
        console.error("Failed to parse AI response:", content);
        const classified = classifyError(parseError);
        return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to parse AI response" : classified.message });
      }

      // Validate that there's something to create
      const hasItems = aiResult.items?.project || 
        (aiResult.items?.projects?.length > 0) ||
        (aiResult.items?.tasks?.length > 0) || 
        (aiResult.items?.risks?.length > 0) || 
        (aiResult.items?.issues?.length > 0) || 
        (aiResult.items?.milestones?.length > 0) || 
        (aiResult.items?.resources?.length > 0);

      if (!hasItems) {
        return res.status(400).json({ 
          message: "Could not understand what to create. Please be more specific in your request.",
          intent: aiResult.intent
        });
      }

      // Check if project context is required but missing
      const needsProjectContext = (aiResult.items?.tasks?.length > 0) || 
        (aiResult.items?.risks?.length > 0) || 
        (aiResult.items?.issues?.length > 0) || 
        (aiResult.items?.milestones?.length > 0);

      const hasProjectContext = projectId || aiResult.items?.project || (aiResult.items?.projects?.length > 0);

      if (needsProjectContext && !hasProjectContext) {
        return res.status(400).json({ 
          message: "Creating tasks, risks, issues, or milestones requires a project. Please specify a project or ask to create a new project.",
          requiresProject: true,
          intent: aiResult.intent
        });
      }

      const results: any = {
        intent: aiResult.intent,
        created: {},
        summary: []
      };

      const today = new Date();
      let currentProjectId = projectId ? Number(projectId) : null;

      // Handle multiple projects (projects array)
      const projectIndexToId: Record<number, number> = {};
      if (aiResult.items?.projects?.length > 0) {
        const createdProjects = [];
        for (let i = 0; i < aiResult.items.projects.length; i++) {
          const proj = aiResult.items.projects[i];
          const projectData = {
            organizationId: Number(organizationId),
            portfolioId: portfolioId ? Number(portfolioId) : null,
            name: proj.name,
            description: proj.description,
            status: proj.status || "Initiation",
            priority: proj.priority || "Medium",
            health: proj.health || "Green",
            budget: String(proj.budget || 0),
            startDate: today.toISOString().split('T')[0],
            source: "ai_generated",
          };
          const project = await storage.createProject(projectData);
          const projUser = userId ? await storage.getUser(userId) : null;
          const projCreatorName = projUser ? `${projUser.firstName || ''} ${projUser.lastName || ''}`.trim() || projUser.email || 'Unknown' : 'System';
          await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: projCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${projCreatorName} — generated with AI`, previousValues: null, newValues: null });
          projectIndexToId[i] = project.id;
          createdProjects.push(project);
          if (i === 0) currentProjectId = project.id;
        }
        results.created.projects = createdProjects;
        results.summary.push(`Created ${createdProjects.length} project(s)`);
      }
      // Handle single project
      else if (aiResult.items?.project) {
        const projectData = {
          organizationId: Number(organizationId),
          portfolioId: portfolioId ? Number(portfolioId) : null,
          name: aiResult.items.project.name,
          description: aiResult.items.project.description,
          status: aiResult.items.project.status || "Initiation",
          priority: aiResult.items.project.priority || "Medium",
          health: aiResult.items.project.health || "Green",
          budget: String(aiResult.items.project.budget || 0),
          startDate: today.toISOString().split('T')[0],
          source: "ai_generated",
        };

        const project = await storage.createProject(projectData);
        const projUser = userId ? await storage.getUser(userId) : null;
        const projCreatorName = projUser ? `${projUser.firstName || ''} ${projUser.lastName || ''}`.trim() || projUser.email || 'Unknown' : 'System';
        await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: projCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${projCreatorName} — generated with AI`, previousValues: null, newValues: null });
        currentProjectId = project.id;
        projectIndexToId[0] = project.id;
        results.created.project = project;
        results.summary.push(`Created project "${project.name}"`);
      }

      // Create tasks
      if (aiResult.items?.tasks?.length > 0) {
        const tasksByProject: Record<number, any[]> = {};
        for (const taskData of aiResult.items.tasks) {
          const targetProjectId = (taskData.projectIndex !== undefined && projectIndexToId[taskData.projectIndex])
            ? projectIndexToId[taskData.projectIndex]
            : currentProjectId;
          if (!targetProjectId) continue;
          if (!tasksByProject[targetProjectId]) tasksByProject[targetProjectId] = [];
          tasksByProject[targetProjectId].push(taskData);
        }

        const createdTasks = [];
        for (const [projId, tasks] of Object.entries(tasksByProject)) {
          let currentDate = new Date(today);
          for (const taskData of tasks) {
            const startDate = new Date(currentDate);
            const durationDays = taskData.durationDays || 5;
            const endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + durationDays);

            const task = await storage.createTask({
              projectId: Number(projId),
              name: taskData.name,
              description: taskData.description,
              startDate: startDate.toISOString().split('T')[0],
              endDate: endDate.toISOString().split('T')[0],
              durationDays,
              status: taskData.status || "Not Started",
              priority: taskData.priority || "Medium",
              progress: 0,
            });
            createdTasks.push(task);
            currentDate.setDate(currentDate.getDate() + durationDays);
          }
        }
        results.created.tasks = createdTasks;
        results.summary.push(`Created ${createdTasks.length} task(s)`);
      }

      // Assign tasks to the current user if requested
      if (aiResult.assignToMe && results.created.tasks?.length > 0) {
        try {
          const userResource = await db.select().from(resources)
            .where(and(
              eq(resources.userId, userId),
              eq(resources.organizationId, Number(organizationId)),
              eq(resources.isActive, true)
            ))
            .limit(1);

          if (userResource.length > 0) {
            const resourceId = userResource[0].id;
            for (const task of results.created.tasks) {
              await storage.addTaskResourceAssignment({
                taskId: task.id,
                resourceId: resourceId,
                allocationPercentage: 100,
                role: "Assignee",
              });
            }
            results.summary.push(`Assigned all tasks to you`);
          }
        } catch (assignErr) {
          console.error("Error assigning tasks to user:", assignErr);
        }
      }

      // Create risks
      if (aiResult.items?.risks?.length > 0 && currentProjectId) {
        const createdRisks = [];
        for (const riskData of aiResult.items.risks) {
          const targetProjectId = (riskData.projectIndex !== undefined && projectIndexToId[riskData.projectIndex])
            ? projectIndexToId[riskData.projectIndex]
            : currentProjectId;
          const risk = await storage.createRisk({
            projectId: targetProjectId,
            title: riskData.title,
            description: riskData.description,
            probability: riskData.probability || "Medium",
            impact: riskData.impact || "Medium",
            status: riskData.status || "Open",
            mitigationPlan: riskData.mitigationPlan,
            costExposure: riskData.costExposure || null,
          });
          createdRisks.push(risk);
        }
        results.created.risks = createdRisks;
        results.summary.push(`Created ${createdRisks.length} risk(s)`);
      }

      // Create issues
      if (aiResult.items?.issues?.length > 0 && currentProjectId) {
        const createdIssues = [];
        for (const issueData of aiResult.items.issues) {
          const targetProjectId = (issueData.projectIndex !== undefined && projectIndexToId[issueData.projectIndex])
            ? projectIndexToId[issueData.projectIndex]
            : currentProjectId;
          const issue = await storage.createIssue({
            projectId: targetProjectId,
            title: issueData.title,
            description: issueData.description,
            priority: issueData.priority || "Medium",
            status: issueData.status || "Open",
            type: issueData.type || "Task",
            costExposure: issueData.costExposure || null,
          });
          createdIssues.push(issue);
        }
        results.created.issues = createdIssues;
        results.summary.push(`Created ${createdIssues.length} issue(s)`);
      }

      // Create milestones
      if (aiResult.items?.milestones?.length > 0 && currentProjectId) {
        const createdMilestones = [];
        for (const milestoneData of aiResult.items.milestones) {
          const milestoneDate = new Date(today);
          milestoneDate.setDate(milestoneDate.getDate() + (milestoneData.daysFromStart || 30));

          const milestoneTitle = milestoneData.title || milestoneData.name || "Milestone";
          const targetProjectId = (milestoneData.projectIndex !== undefined && projectIndexToId[milestoneData.projectIndex])
            ? projectIndexToId[milestoneData.projectIndex]
            : currentProjectId;

          const milestone = await storage.createMilestone({
            projectId: targetProjectId,
            title: milestoneTitle,
            description: milestoneData.description,
            dueDate: milestoneDate.toISOString().split('T')[0],
            status: "Not Started",
          });
          createdMilestones.push(milestone);
        }
        results.created.milestones = createdMilestones;
        results.summary.push(`Created ${createdMilestones.length} milestone(s)`);
      }

      // Create resources
      if (aiResult.items?.resources?.length > 0) {
        const createdResources = [];
        for (const resourceData of aiResult.items.resources) {
          const resource = await storage.createResource({
            organizationId: Number(organizationId),
            displayName: resourceData.displayName,
            email: resourceData.email,
            title: resourceData.title,
            department: resourceData.department,
            skills: resourceData.skills,
          });
          createdResources.push(resource);
        }
        results.created.resources = createdResources;
        results.summary.push(`Created ${createdResources.length} resource(s)`);
      }

      // Determine redirect path
      if (results.created.projects?.length > 0) {
        results.redirectTo = `/projects`;
      } else if (results.created.project) {
        results.redirectTo = `/projects/${results.created.project.id}`;
      } else if (currentProjectId) {
        results.redirectTo = `/projects/${currentProjectId}`;
      }

      res.json({
        success: true,
        ...results,
        message: results.summary.join(", ")
      });
    } catch (err) {
      console.error("Error with AI smart create:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create with AI" : classified.message });
    }
  });

  // ==================== AI VOICE INPUT USAGE METERING ====================
  app.post('/api/ai/voice-usage', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { organizationId } = req.body;
      if (!organizationId) {
        return res.status(400).json({ message: "organizationId is required" });
      }

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, Number(organizationId));
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI usage limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      await recordResourceUsage(userId, METER_CODES.AI_RUNS, `voice_input_${organizationId}_${Date.now()}`, 1, Number(organizationId));

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error recording voice usage:", error);
      const classified = classifyError(error);
      return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to record voice usage" : classified.message });
    }
  });

  // ==================== AI SMART-CREATE PREVIEW (Parse Only) ====================
  app.post('/api/ai/smart-create/preview', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { prompt, organizationId, projectId } = req.body;

      if (!prompt || !organizationId) {
        return res.status(400).json({ message: "Prompt and organizationId are required" });
      }

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const { checkAndEnforceLimit, METER_CODES } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, Number(organizationId));
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      const existingProjects = await storage.getProjects(Number(organizationId));
      const activeProjects = existingProjects.filter((p: any) => !p.deletedAt);
      const projectListForAI = activeProjects
        .map((p: any) => ({ id: p.id, name: p.name }));

      let detailProjectId: number | null = projectId ? Number(projectId) : null;
      if (!detailProjectId) {
        const promptLower = prompt.toLowerCase().trim();
        const nameMatch = activeProjects.find((p: any) => {
          const pName = p.name.toLowerCase().trim();
          return promptLower.includes(pName) || pName.includes(promptLower.replace(/^.*?(on|for|in|to)\s+/i, '').trim());
        });
        if (nameMatch) {
          detailProjectId = nameMatch.id;
        }
      }

      let targetProjectDetails = '';
      if (detailProjectId) {
        const proj = activeProjects.find((p: any) => p.id === detailProjectId);
        if (proj) {
          const [projTasks, projRisks, projIssues, projMilestones] = await Promise.all([
            storage.getTasks(detailProjectId),
            storage.getRisks(detailProjectId),
            storage.getIssues(detailProjectId),
            storage.getMilestones(detailProjectId),
          ]);
          const activeTasks = projTasks.filter((t: any) => !t.deletedAt);
          const activeRisks = projRisks.filter((r: any) => !r.deletedAt);
          const activeIssues = projIssues.filter((i: any) => !i.deletedAt);
          targetProjectDetails = `\n\nTarget project details:
- Name: "${proj.name}"
- Description: ${proj.description || 'N/A'}
- Status: ${proj.status || 'N/A'}
- Priority: ${proj.priority || 'N/A'}
- Health: ${proj.health || 'N/A'}
- Budget: ${proj.budget || 'N/A'}
- Start Date: ${proj.startDate || 'N/A'}
- End Date: ${proj.endDate || 'N/A'}
- Existing tasks (${activeTasks.length}): ${activeTasks.slice(0, 20).map((t: any) => `"${t.name}" [${t.status}]`).join(', ') || 'None'}
- Existing risks (${activeRisks.length}): ${activeRisks.slice(0, 10).map((r: any) => `"${r.title}" [${r.status}, ${r.probability} prob., ${r.impact} impact]`).join(', ') || 'None'}
- Existing issues (${activeIssues.length}): ${activeIssues.slice(0, 10).map((i: any) => `"${i.title}" [${i.status}, ${i.priority}]`).join(', ') || 'None'}
- Existing milestones (${projMilestones.length}): ${projMilestones.slice(0, 10).map((m: any) => `"${m.title}" [${m.status}, due: ${m.dueDate || 'N/A'}]`).join(', ') || 'None'}`;
        }
      }

      const systemPrompt = `You are an AI assistant for a project portfolio management system. Based on the user's request, determine what they want to create and generate the appropriate data.

Analyze the request and decide which type(s) of items to create:
- "project" - For creating new projects with tasks, risks, and issues
- "task" - For creating one or more tasks (requires projectId context)
- "risk" - For creating one or more project risks (requires projectId context)
- "issue" - For creating one or more project issues (requires projectId context)
- "milestone" - For creating one or more milestones (requires projectId context)
- "resource" - For creating team members/resources

IMPORTANT: Before creating a new project, ALWAYS check the list of existing projects provided in the context. If the user references a project by name (or a name that closely matches an existing project), use that existing project instead of creating a new one. Set "existingProjectId" to the matching project's ID and do NOT include a "project" object in "items".

Only create a new project if:
1. The user explicitly asks to create a NEW project, OR
2. No existing project matches what the user is describing

Return a JSON response with this structure:
{
  "intent": "project" | "task" | "risk" | "issue" | "milestone" | "resource" | "multiple",
  "requiresProject": boolean,
  "existingProjectId": number | null,
  "assignToMe": boolean,
  "items": {
    "project": { ... } | null,
    "tasks": [...] | [],
    "risks": [...] | [],
    "issues": [...] | [],
    "milestones": [...] | [],
    "resources": [...] | []
  }
}

Set "existingProjectId" to the ID of the matching existing project when the user references one. Set it to null only if creating a brand new project or if no project context is needed.

For a PROJECT: { "name": "Project name", "description": "Description", "status": "Initiation", "priority": "Medium", "health": "Green", "budget": 0 }
For TASKS (array): { "name": "Task name", "description": "Description", "durationDays": 5, "status": "Not Started", "priority": "Medium" }
For RISKS (array): { "title": "Risk title", "description": "Description", "probability": "Medium", "impact": "Medium", "status": "Open", "mitigationPlan": "How to mitigate", "costExposure": "50000" }
For ISSUES (array): { "title": "Issue title", "description": "Description", "priority": "Medium", "status": "Open", "type": "Task", "costExposure": "25000" }
For MILESTONES (array): { "name": "Milestone name", "description": "Description", "daysFromStart": 30 }
For RESOURCES (array): { "displayName": "Full Name", "email": "email@example.com", "title": "Job Title", "department": "Department", "skills": "Skill1, Skill2" }

Guidelines:
- FIRST check if the user's request references any existing project by name. If it does, use "existingProjectId" instead of creating a new project.
- If user wants to create a brand new project (e.g., "create a new project called X"), create a project with related tasks/risks.
- If user mentions "task", "todo", "work item" create tasks. If no projectId is provided AND no existing project matches, also create a project.
- If user mentions "risk", "concern", "threat" create risks. If no projectId AND no existing project matches, also create a project.
- If user mentions "issue", "problem", "bug", "blocker" create issues. If no projectId AND no existing project matches, also create a project.
- If user mentions "milestone", "deadline", "deliverable" create milestones. If no projectId AND no existing project matches, also create a project.
- If user mentions "resource", "team member", "person", "staff" create resources only
- If the user asks to create items across multiple existing projects, you can reference multiple existing projects.
- If the user says "assign me" or similar, set "assignToMe": true
- Generate 3-8 items when creating multiple of the same type
- When distributing tasks across multiple projects, assign each task a "projectIndex" (0-based)

Context-Awareness Rules (IMPORTANT):
- When project details are provided in the context (description, status, existing tasks, risks, issues, milestones), use them to generate highly relevant and specific items.
- Risks should reflect realistic threats to the specific project domain, technology stack, timeline, and scope. Reference actual project characteristics.
- Issues should be relevant to the project's current phase, status, and existing work items. They should address practical concerns specific to this project.
- Tasks should complement (not duplicate) existing tasks. Consider the project timeline, current phase, and what work would logically come next.
- Milestones should align with the project timeline, existing tasks, and deliverable schedule.
- Do NOT create generic or boilerplate items. Every item should be specifically tailored to the project's actual context.
- Do NOT duplicate items that already exist in the project. Check the existing items list and create new, different ones.
- Use realistic cost exposure values appropriate to the project's budget and scale.
- Set appropriate probability/impact levels based on the project's actual risk profile.

For MULTIPLE PROJECTS, use:
{ "projects": [{ "name": "...", ... }, ...], "tasks": [{ "name": "...", "projectIndex": 0, ... }, ...] }

Return ONLY valid JSON.`;

      const projectSummariesForAI = activeProjects.map((p: any) => {
        let summary = `- ID: ${p.id}, Name: "${p.name}"`;
        if (p.description) summary += `, Description: "${p.description.substring(0, 200)}"`;
        if (p.status) summary += `, Status: ${p.status}`;
        if (p.priority) summary += `, Priority: ${p.priority}`;
        if (p.health) summary += `, Health: ${p.health}`;
        if (p.startDate) summary += `, Start: ${p.startDate}`;
        if (p.endDate) summary += `, End: ${p.endDate}`;
        if (p.budget) summary += `, Budget: ${p.budget}`;
        return summary;
      });

      const existingProjectsContext = projectSummariesForAI.length > 0
        ? `\n\nExisting projects in this organization:\n${projectSummariesForAI.join('\n')}`
        : '\n\nNo existing projects in this organization.';

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Request: ${prompt}\n\nContext: organizationId=${organizationId}${projectId ? `, projectId=${projectId}` : ''}${targetProjectDetails}${existingProjectsContext}` }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "AI did not return a response" });
      }

      let aiResult;
      try {
        aiResult = JSON.parse(content);
      } catch (parseError) {
        const classified = classifyError(parseError);
        return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to parse AI response" : classified.message });
      }

      const actions: any[] = [];

      if (aiResult.items?.project) {
        actions.push({ id: `project-0`, type: "create_project", description: `Create project "${aiResult.items.project.name}"`, details: aiResult.items.project, enabled: true });
      }
      if (aiResult.items?.projects?.length > 0) {
        aiResult.items.projects.forEach((proj: any, i: number) => {
          actions.push({ id: `project-${i}`, type: "create_project", description: `Create project "${proj.name}"`, details: proj, enabled: true });
        });
      }
      if (aiResult.items?.tasks?.length > 0) {
        aiResult.items.tasks.forEach((task: any, i: number) => {
          actions.push({ id: `task-${i}`, type: "create_task", description: `Create task "${task.name}" (${task.durationDays || 5} days, ${task.priority || 'Medium'} priority)`, details: task, enabled: true });
        });
      }
      if (aiResult.items?.risks?.length > 0) {
        aiResult.items.risks.forEach((risk: any, i: number) => {
          actions.push({ id: `risk-${i}`, type: "create_risk", description: `Create risk "${risk.title}" (${risk.probability || 'Medium'} prob., ${risk.impact || 'Medium'} impact)`, details: risk, enabled: true });
        });
      }
      if (aiResult.items?.issues?.length > 0) {
        aiResult.items.issues.forEach((issue: any, i: number) => {
          actions.push({ id: `issue-${i}`, type: "create_issue", description: `Create issue "${issue.title}" (${issue.priority || 'Medium'} priority)`, details: issue, enabled: true });
        });
      }
      if (aiResult.items?.milestones?.length > 0) {
        aiResult.items.milestones.forEach((ms: any, i: number) => {
          actions.push({ id: `milestone-${i}`, type: "create_milestone", description: `Create milestone "${ms.name || ms.title}" (day ${ms.daysFromStart || 30})`, details: ms, enabled: true });
        });
      }
      if (aiResult.items?.resources?.length > 0) {
        aiResult.items.resources.forEach((r: any, i: number) => {
          actions.push({ id: `resource-${i}`, type: "create_resource", description: `Add team member "${r.displayName}" - ${r.title || 'No title'}`, details: r, enabled: true });
        });
      }
      if (aiResult.assignToMe) {
        actions.push({ id: `assign-me`, type: "assign_to_me", description: `Assign all created tasks to you`, details: {}, enabled: true });
      }

      if (actions.length === 0) {
        return res.status(400).json({ message: "Could not understand what to create. Please be more specific.", intent: aiResult.intent });
      }

      let resolvedExistingProjectId: number | null = null;
      let matchedProject: { id: number; name: string } | null = null;

      if (aiResult.existingProjectId) {
        const candidateId = Number(aiResult.existingProjectId);
        const found = projectListForAI.find((p: any) => p.id === candidateId);
        if (found) {
          resolvedExistingProjectId = found.id;
          matchedProject = found;
        }
      }

      if (!resolvedExistingProjectId && !projectId && aiResult.items?.project?.name) {
        const aiProjectName = aiResult.items.project.name.toLowerCase().trim();
        const fuzzyMatch = projectListForAI.find((p: any) => {
          const existingName = p.name.toLowerCase().trim();
          return existingName === aiProjectName || existingName.includes(aiProjectName) || aiProjectName.includes(existingName);
        });
        if (fuzzyMatch) {
          resolvedExistingProjectId = fuzzyMatch.id;
          matchedProject = fuzzyMatch;
        }
      }

      if (!resolvedExistingProjectId && !projectId && detailProjectId) {
        const fallback = projectListForAI.find((p: any) => p.id === detailProjectId);
        if (fallback) {
          resolvedExistingProjectId = fallback.id;
          matchedProject = fallback;
        }
      }

      let finalActions = actions;
      if (resolvedExistingProjectId) {
        finalActions = actions.filter((a: any) => a.type !== "create_project");
      }

      const needsProjectContext = finalActions.some(a => ["create_task", "create_risk", "create_issue", "create_milestone"].includes(a.type));
      const hasProjectContext = projectId || resolvedExistingProjectId || finalActions.some(a => a.type === "create_project");

      res.json({
        success: true,
        intent: aiResult.intent,
        actions: finalActions,
        requiresProject: needsProjectContext && !hasProjectContext,
        resolvedProjectId: resolvedExistingProjectId || undefined,
        resolvedProjectName: matchedProject?.name || undefined,
        summary: `AI identified ${finalActions.length} action(s) to perform${matchedProject ? ` for project "${matchedProject.name}"` : ''}`,
      });
    } catch (err) {
      console.error("Error with AI smart create preview:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to preview AI actions" : classified.message });
    }
  });

  // ==================== AI SMART-CREATE CONFIRMED EXECUTE ====================
  app.post('/api/ai/smart-create/execute', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { organizationId, projectId, portfolioId, actions } = req.body;

      if (!organizationId || !actions || !Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({ message: "organizationId and actions array are required" });
      }

      const { checkAndEnforceLimit, METER_CODES, recordCreditUsage, RESOURCE_TYPES } = await import("./services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, organizationId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.error || "AI credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "ai_runs"
        });
      }

      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      if (projectId) {
        const targetProject = await storage.getProject(Number(projectId));
        if (!targetProject || targetProject.organizationId !== Number(organizationId)) {
          return res.status(403).json({ message: "The selected project does not belong to this organization" });
        }
      }

      const today = new Date();
      let currentProjectId = projectId ? Number(projectId) : null;
      const results: any = { created: {}, summary: [] };
      const projectIndexToId: Record<number, number> = {};

      const projectActions = actions.filter((a: any) => a.type === "create_project");
      const taskActions = actions.filter((a: any) => a.type === "create_task");
      const riskActions = actions.filter((a: any) => a.type === "create_risk");
      const issueActions = actions.filter((a: any) => a.type === "create_issue");
      const milestoneActions = actions.filter((a: any) => a.type === "create_milestone");
      const resourceActions = actions.filter((a: any) => a.type === "create_resource");
      const assignToMe = actions.some((a: any) => a.type === "assign_to_me");

      if (projectActions.length > 1) {
        const createdProjects = [];
        const actionUser = userId ? await storage.getUser(userId) : null;
        const actionCreatorName = actionUser ? `${actionUser.firstName || ''} ${actionUser.lastName || ''}`.trim() || actionUser.email || 'Unknown' : 'System';
        for (let i = 0; i < projectActions.length; i++) {
          const proj = projectActions[i].details;
          const project = await storage.createProject({
            organizationId: Number(organizationId),
            portfolioId: portfolioId ? Number(portfolioId) : null,
            name: proj.name,
            description: proj.description,
            status: proj.status || "Initiation",
            priority: proj.priority || "Medium",
            health: proj.health || "Green",
            budget: String(proj.budget || 0),
            startDate: today.toISOString().split('T')[0],
            source: "ai_generated",
          });
          await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: actionCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${actionCreatorName} — generated with AI`, previousValues: null, newValues: null });
          projectIndexToId[i] = project.id;
          createdProjects.push(project);
          if (i === 0) currentProjectId = project.id;
        }
        results.created.projects = createdProjects;
        results.summary.push(`Created ${createdProjects.length} project(s)`);
      } else if (projectActions.length === 1) {
        const proj = projectActions[0].details;
        const project = await storage.createProject({
          organizationId: Number(organizationId),
          portfolioId: portfolioId ? Number(portfolioId) : null,
          name: proj.name,
          description: proj.description,
          status: proj.status || "Initiation",
          priority: proj.priority || "Medium",
          health: proj.health || "Green",
          budget: String(proj.budget || 0),
          startDate: today.toISOString().split('T')[0],
          source: "ai_generated",
        });
        const actionUser = userId ? await storage.getUser(userId) : null;
        const actionCreatorName = actionUser ? `${actionUser.firstName || ''} ${actionUser.lastName || ''}`.trim() || actionUser.email || 'Unknown' : 'System';
        await storage.createProjectChangeLog({ projectId: project.id, changedBy: userId || null, changedByName: actionCreatorName, changeType: 'created', changeSummary: `Project "${project.name}" created by ${actionCreatorName} — generated with AI`, previousValues: null, newValues: null });
        currentProjectId = project.id;
        projectIndexToId[0] = project.id;
        results.created.project = project;
        results.summary.push(`Created project "${project.name}"`);
      }

      if (taskActions.length > 0 && currentProjectId) {
        const createdTasks = [];
        let currentDate = new Date(today);
        for (const action of taskActions) {
          const taskData = action.details;
          const targetProjectId = (taskData.projectIndex !== undefined && projectIndexToId[taskData.projectIndex])
            ? projectIndexToId[taskData.projectIndex]
            : currentProjectId;
          const startDate = new Date(currentDate);
          const durationDays = taskData.durationDays || 5;
          const endDate = new Date(currentDate);
          endDate.setDate(endDate.getDate() + durationDays);
          const task = await storage.createTask({
            projectId: targetProjectId,
            name: taskData.name,
            description: taskData.description,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            durationDays,
            status: taskData.status || "Not Started",
            priority: taskData.priority || "Medium",
            progress: 0,
          });
          createdTasks.push(task);
          currentDate.setDate(currentDate.getDate() + durationDays);
        }
        results.created.tasks = createdTasks;
        results.summary.push(`Created ${createdTasks.length} task(s)`);
      }

      if (assignToMe && results.created.tasks?.length > 0) {
        try {
          const userResource = await db.select().from(resources)
            .where(and(
              eq(resources.userId, userId),
              eq(resources.organizationId, Number(organizationId)),
              eq(resources.isActive, true)
            ))
            .limit(1);
          if (userResource.length > 0) {
            for (const task of results.created.tasks) {
              await storage.addTaskResourceAssignment({
                taskId: task.id,
                resourceId: userResource[0].id,
                allocationPercentage: 100,
                role: "Assignee",
              });
            }
            results.summary.push(`Assigned all tasks to you`);
          }
        } catch (assignErr) {
          console.error("Error assigning tasks:", assignErr);
        }
      }

      if (riskActions.length > 0 && currentProjectId) {
        const createdRisks = [];
        for (const action of riskActions) {
          const riskData = action.details;
          const targetProjectId = (riskData.projectIndex !== undefined && projectIndexToId[riskData.projectIndex])
            ? projectIndexToId[riskData.projectIndex]
            : currentProjectId;
          const risk = await storage.createRisk({
            projectId: targetProjectId,
            title: riskData.title,
            description: riskData.description,
            probability: riskData.probability || "Medium",
            impact: riskData.impact || "Medium",
            status: riskData.status || "Open",
            mitigationPlan: riskData.mitigationPlan,
            costExposure: riskData.costExposure || null,
          });
          createdRisks.push(risk);
        }
        results.created.risks = createdRisks;
        results.summary.push(`Created ${createdRisks.length} risk(s)`);
      }

      if (issueActions.length > 0 && currentProjectId) {
        const createdIssues = [];
        for (const action of issueActions) {
          const issueData = action.details;
          const targetProjectId = (issueData.projectIndex !== undefined && projectIndexToId[issueData.projectIndex])
            ? projectIndexToId[issueData.projectIndex]
            : currentProjectId;
          const issue = await storage.createIssue({
            projectId: targetProjectId,
            title: issueData.title,
            description: issueData.description,
            priority: issueData.priority || "Medium",
            status: issueData.status || "Open",
            type: issueData.type || "Task",
            costExposure: issueData.costExposure || null,
          });
          createdIssues.push(issue);
        }
        results.created.issues = createdIssues;
        results.summary.push(`Created ${createdIssues.length} issue(s)`);
      }

      if (milestoneActions.length > 0 && currentProjectId) {
        const createdMilestones = [];
        for (const action of milestoneActions) {
          const msData = action.details;
          const milestoneDate = new Date(today);
          milestoneDate.setDate(milestoneDate.getDate() + (msData.daysFromStart || 30));
          const targetProjectId = (msData.projectIndex !== undefined && projectIndexToId[msData.projectIndex])
            ? projectIndexToId[msData.projectIndex]
            : currentProjectId;
          const milestone = await storage.createTask({
            projectId: targetProjectId,
            name: msData.name || msData.title || "Milestone",
            description: msData.description || null,
            startDate: milestoneDate.toISOString().split('T')[0],
            endDate: milestoneDate.toISOString().split('T')[0],
            durationDays: 0,
            status: "Not Started",
            priority: "Medium",
            progress: 0,
            isMilestone: true,
          });
          createdMilestones.push(milestone);
        }
        results.created.milestones = createdMilestones;
        results.summary.push(`Created ${createdMilestones.length} milestone(s)`);
      }

      if (resourceActions.length > 0) {
        const createdResources = [];
        for (const action of resourceActions) {
          const rData = action.details;
          const resource = await storage.createResource({
            organizationId: Number(organizationId),
            displayName: rData.displayName,
            email: rData.email,
            title: rData.title,
            department: rData.department,
            skills: rData.skills,
          });
          createdResources.push(resource);
        }
        results.created.resources = createdResources;
        results.summary.push(`Created ${createdResources.length} resource(s)`);
      }

      await recordCreditUsage(userId, RESOURCE_TYPES.AI_RUN, `ai_smart_create_confirmed_${Date.now()}`, organizationId ? Number(organizationId) : undefined);

      const aiUser = userId ? await storage.getUser(userId) : null;
      const aiCreatorName = aiUser ? `${aiUser.firstName || ''} ${aiUser.lastName || ''}`.trim() || aiUser.email || 'Unknown' : 'System';

      try {
        const allCreatedItems = [
          ...(results.created.tasks || []).map((t: any) => ({ type: 'task', id: t.id, name: t.name, projectId: t.projectId })),
          ...(results.created.risks || []).map((r: any) => ({ type: 'risk', id: r.id, name: r.title, projectId: r.projectId })),
          ...(results.created.issues || []).map((i: any) => ({ type: 'issue', id: i.id, name: i.title, projectId: i.projectId })),
          ...(results.created.milestones || []).map((m: any) => ({ type: 'milestone', id: m.id, name: m.name || m.title, projectId: m.projectId })),
        ];

        const itemsByProject = new Map<number, typeof allCreatedItems>();
        for (const item of allCreatedItems) {
          const pid = item.projectId || currentProjectId;
          if (!pid) continue;
          if (!itemsByProject.has(pid)) itemsByProject.set(pid, []);
          itemsByProject.get(pid)!.push(item);
        }

        for (const [pid, items] of itemsByProject) {
          const grouped: Record<string, string[]> = {};
          for (const item of items) {
            if (!grouped[item.type]) grouped[item.type] = [];
            grouped[item.type].push(`"${item.name}"`);
          }
          const summaryParts = Object.entries(grouped).map(([type, names]) => `${names.length} ${type}(s): ${names.join(', ')}`);
          await storage.createProjectChangeLog({
            projectId: pid,
            changedBy: userId || null,
            changedByName: aiCreatorName,
            changeType: 'ai_create',
            changeSummary: `AI Create by ${aiCreatorName} — ${summaryParts.join('; ')}`,
            previousValues: null,
            newValues: JSON.stringify(items),
          });
        }
      } catch (logErr) {
        console.error("Error writing AI create change logs:", logErr);
      }

      let redirectTo;
      if (results.created.projects?.length > 0) {
        redirectTo = `/projects`;
      } else if (results.created.project) {
        redirectTo = `/projects/${results.created.project.id}`;
      } else if (currentProjectId) {
        redirectTo = `/projects/${currentProjectId}`;
      }

      res.status(201).json({
        success: true,
        ...results,
        redirectTo,
        message: results.summary.join(", ")
      });
    } catch (err) {
      console.error("Error with AI smart create execute:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create items" : classified.message });
    }
  });

  // ==================== ANALYTICS API (Power BI Integration) ====================

  // Helper: Get user ID from either session or API key (Basic auth)
  // Power BI uses Basic auth where username=email and password=apiKey
  async function getAnalyticsUserId(req: ExpressRequest): Promise<{ userId: string; organizationId?: number } | null> {
    const userId = getUserIdFromRequest(req);
    if (userId) {
      return { userId, organizationId: (req as any).bearerOrgId };
    }

    // Try Basic auth (email:apiKey) — not handled by middleware
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.slice(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [email, apiKey] = credentials.split(':');

        if (email && apiKey) {
          const user = await storage.getUserByApiKey(apiKey);
          if (user && user.email === email) {
            return { userId: user.id };
          }
        }
      } catch (err) {
        console.error('Error parsing Basic auth:', err);
      }
    }

    return null;
  }

  // API Key Management
  app.get('/api/user/api-key', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ 
      hasApiKey: !!user.apiKey,
      apiKey: user.apiKey ? `${user.apiKey.slice(0, 8)}...` : null // Show partial for security
    });
  });

  app.post('/api/user/api-key/generate', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Generate a secure random API key
    const crypto = await import('crypto');
    const apiKey = crypto.randomBytes(32).toString('hex');

    await storage.updateUser(userId, { apiKey });

    const user = await storage.getUser(userId);

    res.status(201).json({ 
      success: true,
      apiKey,
      message: "API key generated. Use your email as username and this API key as password in Power BI Basic auth.",
      instructions: {
        username: user?.email,
        password: apiKey,
        authType: "Basic"
      }
    });
  });

  app.delete('/api/user/api-key', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    await storage.updateUser(userId, { apiKey: null });

    res.json({ success: true, message: "API key revoked" });
  });

  // Delete own account
  app.delete('/api/user/account', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Delete the user and all associated data
      await storage.deleteUser(userId);

      // Clear the session
      if (req.session) {
        req.session.destroy((err: Error | null) => {
          if (err) {
            console.error('Error destroying session:', err);
          }
        });
      }

      res.json({ success: true, message: "Account deleted successfully" });
    } catch (err) {
      console.error('Error deleting account:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete account' : classified.message });
    }
  });

  async function resolveAnalyticsScope(req: ExpressRequest, res: any, emptyResult: any = []): Promise<{ userId: string; targetOrgIds: number[] } | null> {
    const authResult = await getAnalyticsUserId(req);
    if (!authResult) {
      res.status(401).json({ message: "Authentication required. Use Basic auth, Bearer token, or session." });
      return null;
    }

    const { userId, organizationId: bearerOrgId } = authResult;
    const queryOrgId = req.query.organizationId ? Number(req.query.organizationId) : null;

    if (bearerOrgId) {
      if (queryOrgId && queryOrgId !== bearerOrgId) {
        res.status(403).json({ message: "Bearer token is scoped to a specific organization. Cannot override with organizationId parameter." });
        return null;
      }
      return { userId, targetOrgIds: [bearerOrgId] };
    }

    const accessibleOrgIds = await getUserOrgIds(userId);

    if (accessibleOrgIds.length === 0) {
      res.json(emptyResult);
      return null;
    }

    if (queryOrgId && !accessibleOrgIds.includes(queryOrgId)) {
      res.status(403).json({ message: "Access denied to this organization" });
      return null;
    }

    const targetOrgIds = queryOrgId ? [queryOrgId] : accessibleOrgIds;
    return { userId, targetOrgIds };
  }

  // API Token Management (Bearer tokens scoped to organizations)
  app.post('/api/organizations/:orgId/api-tokens', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const crypto = await import('crypto');
      const tokenValue = crypto.randomBytes(32).toString('hex');

      const { name, expiresAt } = req.body || {};
      const token = await storage.createApiToken({
        token: tokenValue,
        userId,
        organizationId: orgId,
        name: name || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      res.json({
        id: token.id,
        token: tokenValue,
        name: token.name,
        organizationId: token.organizationId,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
      });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.get('/api/organizations/:orgId/api-tokens', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }

      const tokens = await storage.getApiTokensByUserAndOrg(userId, orgId);
      const masked = tokens.map(t => ({
        id: t.id,
        name: t.name,
        token: t.token.slice(0, 8) + '••••••••',
        organizationId: t.organizationId,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
      }));

      res.json(masked);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  app.delete('/api/organizations/:orgId/api-tokens/:tokenId', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const orgId = Number(req.params.orgId);
      const tokenId = Number(req.params.tokenId);

      const tokens = await storage.getApiTokensByUserAndOrg(userId, orgId);
      const token = tokens.find(t => t.id === tokenId);
      if (!token) {
        return res.status(404).json({ message: "Token not found" });
      }

      if (token.userId !== userId) {
        return res.status(403).json({ message: "Not authorized to delete this token" });
      }

      await storage.deleteApiToken(tokenId);
      res.json({ message: "Token revoked" });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.message });
    }
  });

  // Analytics: Projects flat data for Power BI
  app.get('/api/analytics/projects', async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;

      // Fetch projects for all accessible organizations
      const allProjects: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const portfolios = await storage.getPortfolios(orgId);
        const org = await storage.getOrganization(orgId);

        for (const project of projects) {
          const portfolio = portfolios.find(p => p.id === project.portfolioId);
          const tasks = await storage.getTasks(project.id);
          const risks = await storage.getRisks(project.id);
          const issues = await storage.getIssues(project.id);
          const milestones = await storage.getMilestones(project.id);

          allProjects.push({
            projectId: project.id,
            projectName: project.name,
            description: project.description,
            status: project.status,
            health: project.health,
            completionPercentage: project.completionPercentage || 0,
            budget: Number(project.budget) || 0,
            startDate: project.startDate,
            endDate: project.endDate,
            projectManager: project.managerId,
            portfolioId: project.portfolioId,
            portfolioName: portfolio?.name || null,
            organizationId: orgId,
            organizationName: org?.name || null,
            taskCount: tasks.length,
            completedTaskCount: tasks.filter(t => t.status === 'Done').length,
            riskCount: risks.length,
            openRiskCount: risks.filter(r => r.status === 'Open').length,
            highRiskCount: risks.filter(r => r.probability === 'High' || r.impact === 'High').length,
            issueCount: issues.length,
            openIssueCount: issues.filter(i => i.status === 'Open').length,
            milestoneCount: milestones.length,
            completedMilestoneCount: milestones.filter(m => m.completed).length,
            source: project.source || 'manual',
            createdAt: project.createdAt,
          });
        }
      }

      res.json(allProjects);
    } catch (err) {
      console.error("Error fetching analytics projects:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  // Analytics: Portfolios summary for Power BI
  app.get('/api/analytics/portfolios', async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;

      const allPortfolios: any[] = [];
      for (const orgId of targetOrgIds) {
        const portfolios = await storage.getPortfolios(orgId);
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);

        for (const portfolio of portfolios) {
          const portfolioProjects = projects.filter(p => p.portfolioId === portfolio.id);
          const totalBudget = portfolioProjects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
          const avgCompletion = portfolioProjects.length > 0 
            ? Math.round(portfolioProjects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / portfolioProjects.length)
            : 0;

          allPortfolios.push({
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            description: portfolio.description,
            strategy: portfolio.strategy,
            organizationId: orgId,
            organizationName: org?.name || null,
            projectCount: portfolioProjects.length,
            healthyProjectCount: portfolioProjects.filter(p => p.health === 'Green').length,
            atRiskProjectCount: portfolioProjects.filter(p => p.health === 'Yellow').length,
            criticalProjectCount: portfolioProjects.filter(p => p.health === 'Red').length,
            totalBudget,
            avgCompletion,
            createdAt: portfolio.createdAt,
          });
        }
      }

      res.json(allPortfolios);
    } catch (err) {
      console.error("Error fetching analytics portfolios:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  // Analytics: Risks flat data for Power BI
  app.get('/api/analytics/risks', async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;

      const allRisks: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);

        for (const project of projects) {
          const risks = await storage.getRisks(project.id);

          for (const risk of risks) {
            allRisks.push({
              riskId: risk.id,
              title: risk.title,
              description: risk.description,
              probability: risk.probability,
              impact: risk.impact,
              status: risk.status,
              mitigationPlan: risk.mitigationPlan,
              owner: risk.ownerId,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
              createdAt: risk.createdAt,
            });
          }
        }
      }

      res.json(allRisks);
    } catch (err) {
      console.error("Error fetching analytics risks:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  // Analytics: Issues flat data for Power BI
  app.get('/api/analytics/issues', async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;

      const allIssues: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);

        for (const project of projects) {
          const issues = await storage.getIssues(project.id);

          for (const issue of issues) {
            allIssues.push({
              issueId: issue.id,
              title: issue.title,
              description: issue.description,
              type: issue.type,
              priority: issue.priority,
              status: issue.status,
              assignee: issue.assignee,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
              createdAt: issue.createdAt,
            });
          }
        }
      }

      res.json(allIssues);
    } catch (err) {
      console.error("Error fetching analytics issues:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  // Analytics: Milestones flat data for Power BI
  app.get('/api/analytics/milestones', async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;

      const allMilestones: any[] = [];
      for (const orgId of targetOrgIds) {
        const projects = await storage.getProjects(orgId);
        const org = await storage.getOrganization(orgId);

        for (const project of projects) {
          const milestones = await storage.getMilestones(project.id);

          for (const milestone of milestones) {
            allMilestones.push({
              milestoneId: milestone.id,
              title: milestone.title,
              description: milestone.description,
              dueDate: milestone.dueDate,
              completed: milestone.completed,
              projectId: project.id,
              projectName: project.name,
              organizationId: orgId,
              organizationName: org?.name || null,
            });
          }
        }
      }

      res.json(allMilestones);
    } catch (err) {
      console.error("Error fetching analytics milestones:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  // Analytics: Intakes flat data for Power BI
  app.get('/api/analytics/intakes', async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res);
      if (!scope) return;
      const { targetOrgIds } = scope;

      const allIntakes: any[] = [];
      for (const orgId of targetOrgIds) {
        const intakes = await storage.getProjectIntakes(orgId);
        const org = await storage.getOrganization(orgId);

        for (const intake of intakes) {
          allIntakes.push({
            intakeId: intake.id,
            projectName: intake.projectName,
            description: intake.description,
            status: intake.status,
            currentStep: intake.currentStep,
            businessUnit: intake.businessUnit,
            programName: intake.programName,
            fundingSource: intake.fundingSource,
            estimatedBudget: intake.estimatedBudget,
            strategicAlignment: (intake as any).strategicAlignment,
            organizationId: orgId,
            organizationName: org?.name || null,
            submitterId: intake.submitterId,
            createdAt: intake.createdAt,
          });
        }
      }

      res.json(allIntakes);
    } catch (err) {
      console.error("Error fetching analytics intakes:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  // Analytics: Summary metrics for Power BI dashboards
  app.get('/api/analytics/summary', async (req, res) => {
    try {
      const scope = await resolveAnalyticsScope(req, res, { organizations: [] });
      if (!scope) return;
      const { targetOrgIds } = scope;

      const summaries: any[] = [];
      for (const orgId of targetOrgIds) {
        const org = await storage.getOrganization(orgId);
        const projects = await storage.getProjects(orgId);
        const portfolios = await storage.getPortfolios(orgId);
        const intakes = await storage.getProjectIntakes(orgId);

        let totalRisks = 0, openRisks = 0, highRisks = 0;
        let totalIssues = 0, openIssues = 0;
        let totalMilestones = 0, completedMilestones = 0;
        let totalTasks = 0, completedTasks = 0;

        for (const project of projects) {
          const risks = await storage.getRisks(project.id);
          const issues = await storage.getIssues(project.id);
          const milestones = await storage.getMilestones(project.id);
          const tasks = await storage.getTasks(project.id);

          totalRisks += risks.length;
          openRisks += risks.filter(r => r.status === 'Open').length;
          highRisks += risks.filter(r => r.probability === 'High' || r.impact === 'High').length;
          totalIssues += issues.length;
          openIssues += issues.filter(i => i.status === 'Open').length;
          totalMilestones += milestones.length;
          completedMilestones += milestones.filter(m => m.completed).length;
          totalTasks += tasks.length;
          completedTasks += tasks.filter(t => t.status === 'Done').length;
        }

        const totalBudget = projects.reduce((sum, p) => sum + (Number(p.budget) || 0), 0);
        const avgCompletion = projects.length > 0 
          ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length)
          : 0;

        summaries.push({
          organizationId: orgId,
          organizationName: org?.name || null,
          portfolioCount: portfolios.length,
          projectCount: projects.length,
          healthyProjectCount: projects.filter(p => p.health === 'Green').length,
          atRiskProjectCount: projects.filter(p => p.health === 'Yellow').length,
          criticalProjectCount: projects.filter(p => p.health === 'Red').length,
          totalBudget,
          avgCompletion,
          totalRisks,
          openRisks,
          highRisks,
          totalIssues,
          openIssues,
          totalMilestones,
          completedMilestones,
          totalTasks,
          completedTasks,
          intakeCount: intakes.length,
          pendingIntakes: intakes.filter(i => i.status === 'draft' || i.status === 'in_progress').length,
          approvedIntakes: intakes.filter(i => i.status === 'approved').length,
          rejectedIntakes: intakes.filter(i => i.status === 'rejected').length,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({ organizations: summaries });
    } catch (err) {
      console.error("Error fetching analytics summary:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching analytics data" : classified.message });
    }
  });

  // ============= BILLING ROUTES =============

  // Get all plans with meter rules
  app.get('/api/billing/plans', async (req, res) => {
    try {
      const { plans, meters, planMeterRules } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { getAllCreditCosts } = await import("./services/billing");

      let includeInactive = false;
      if (req.query.includeInactive === 'true') {
        const userId = getUserIdFromRequest(req);
        if (userId) {
          const user = await storage.getUser(userId);
          if (user?.role === 'super_admin') {
            includeInactive = true;
          }
        }
      }

      const allPlans = includeInactive
        ? await db.select().from(plans).orderBy(plans.displayOrder)
        : await db.select().from(plans).where(eq(plans.isActive, true));
      const allRules = await db
        .select()
        .from(planMeterRules)
        .innerJoin(meters, eq(planMeterRules.meterId, meters.id));

      const creditCosts = await getAllCreditCosts();

      const plansWithRules = allPlans.map(plan => ({
        ...plan,
        meterRules: allRules
          .filter(r => r.plan_meter_rules.planId === plan.id)
          .map(r => ({
            meterCode: r.meters.code,
            meterName: r.meters.name,
            ruleType: r.plan_meter_rules.ruleType,
            includedUnitsMonthly: r.plan_meter_rules.includedUnitsMonthly,
            hardCapUnits: r.plan_meter_rules.hardCapUnits,
            overageUnitPriceMicrocents: r.plan_meter_rules.overageUnitPriceMicrocents,
          })),
      }));

      res.json({ plans: plansWithRules, creditCosts });
    } catch (error) {
      console.error("Error fetching plans:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch plans" : classified.message });
    }
  });

  // Get subscription - supports both user and org-based subscriptions
  app.get('/api/billing/subscription', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { billingProvider } = await import("./services/billing");
      const { plans } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const orgIdParam = req.query.orgId;
      const orgId = orgIdParam ? parseInt(orgIdParam as string) : null;

      let subscription = null;

      // If orgId is explicitly provided, only show that org's subscription (no fallback)
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }

      // Get the plan details
      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId));

      res.json({ ...subscription, plan });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch subscription" : classified.message });
    }
  });

  // Get usage summary (credits-based)
  app.get('/api/billing/usage', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { billingProvider, getAllCreditCosts } = await import("./services/billing");
      const { meters, planMeterRules, usageRollups } = await import("@shared/schema");
      const { sql, eq, and } = await import("drizzle-orm");
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;

      let subscription;

      // If orgId is explicitly provided, only show that org's data (no fallback)
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }

      // Get credits meter
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);

      // Get credits limit from plan rules
      let creditsIncluded = 0;
      let creditsHardCap: number | null = null;

      if (creditsMeter) {
        const rules = await db
          .select()
          .from(planMeterRules)
          .where(
            and(
              eq(planMeterRules.planId, subscription.planId),
              eq(planMeterRules.meterId, creditsMeter.id)
            )
          );

        const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
        const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");

        creditsIncluded = quotaRule?.includedUnitsMonthly || 0;
        creditsHardCap = hardCapRule?.hardCapUnits || null;
      }

      // Get credits used from rollups
      const cycle = await billingProvider.getOrCreateBillingCycle(subscription.id);
      let creditsUsedHundredths = 0;

      if (creditsMeter) {
        const [rollup] = await db
          .select()
          .from(usageRollups)
          .where(
            and(
              eq(usageRollups.billingCycleId, cycle.id),
              eq(usageRollups.meterId, creditsMeter.id)
            )
          )
          .limit(1);

        creditsUsedHundredths = rollup?.usedUnits || 0;
      }

      // Convert usage from hundredths to actual credits for display
      // Plan meter rules store credits as actual credits (200, 500, etc.)
      // Usage rollups store in hundredths (500 = 5 credits)
      const creditsUsed = creditsUsedHundredths / 100;
      const limit = creditsHardCap !== null ? creditsHardCap : creditsIncluded;
      const remaining = Math.max(0, limit - creditsUsed);

      // Get credit costs for display
      const creditCosts = await getAllCreditCosts();

      // Return credits-based usage - plan limits are in actual credits, not hundredths
      res.json({
        credits: {
          used: creditsUsed,
          included: creditsIncluded,
          hardCap: creditsHardCap,
          remaining: remaining,
          limit: limit
        },
        creditCosts: creditCosts.map(c => ({
          ...c,
          creditCost: c.creditCost / 100 // Credit costs table uses hundredths, convert for display
        }))
      });
    } catch (error) {
      console.error("Error fetching usage:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch usage" : classified.message });
    }
  });

  // Get AI operation credit costs for frontend warnings
  app.get('/api/billing/ai-costs', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { billingProvider, getAllCreditCosts } = await import("./services/billing");
      const { meters, planMeterRules, usageRollups } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");

      // Get user's subscription
      let subscription = await billingProvider.getSubscriptionForUser(userId);
      if (!subscription) {
        subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
      }

      // Get credits meter info
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);

      // Get credits limits from plan
      let creditsIncluded = 0;
      let creditsHardCap: number | null = null;
      let hasQuotaRule = false; // Track whether a quota rule exists at all

      if (creditsMeter) {
        const rules = await db
          .select()
          .from(planMeterRules)
          .where(
            and(
              eq(planMeterRules.planId, subscription.planId),
              eq(planMeterRules.meterId, creditsMeter.id)
            )
          );

        const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
        const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");

        hasQuotaRule = quotaRule !== undefined;
        creditsIncluded = quotaRule?.includedUnitsMonthly || 0;
        creditsHardCap = hardCapRule?.hardCapUnits ?? null;
      }

      // Get current usage
      const cycle = await billingProvider.getOrCreateBillingCycle(subscription.id);
      let creditsUsedHundredths = 0;

      if (creditsMeter) {
        const [rollup] = await db
          .select()
          .from(usageRollups)
          .where(
            and(
              eq(usageRollups.billingCycleId, cycle.id),
              eq(usageRollups.meterId, creditsMeter.id)
            )
          )
          .limit(1);

        creditsUsedHundredths = rollup?.usedUnits || 0;
      }

      const creditsUsed = creditsUsedHundredths / 100;

      // Determine if there's an explicit limit set
      // If hardCap exists, use it; if quota rule exists (even with 0 units), use quota; if neither, limit is null (unlimited)
      const hasExplicitLimit = creditsHardCap !== null || hasQuotaRule;
      const limit = hasExplicitLimit ? (creditsHardCap !== null ? creditsHardCap : creditsIncluded) : null;
      const remaining = limit !== null ? Math.max(0, limit - creditsUsed) : null;

      // Get all credit costs
      const creditCosts = await getAllCreditCosts();

      // Find AI-related credit costs - check for specific resource types
      const aiRunCost = creditCosts.find(c => c.resourceType === 'ai_run');
      const aiProjectCost = creditCosts.find(c => c.resourceType === 'ai_project_generation');
      const aiDemoCost = creditCosts.find(c => c.resourceType === 'ai_demo_generation');

      // Use specific costs if available, fallback to ai_run, then default 3 credits
      const projectCreditCost = aiProjectCost ? aiProjectCost.creditCost / 100 : 
                                 aiRunCost ? aiRunCost.creditCost / 100 : 3;
      const demoCreditCost = aiDemoCost ? aiDemoCost.creditCost / 100 : 
                              aiRunCost ? aiRunCost.creditCost / 100 : 3;

      // If remaining is null (unlimited), user can afford; otherwise check balance
      const canAffordProject = remaining === null || remaining >= projectCreditCost;
      const canAffordDemo = remaining === null || remaining >= demoCreditCost;

      res.json({
        aiProjectGeneration: {
          creditCost: projectCreditCost,
          description: "Generate a project with AI",
          canAfford: canAffordProject,
        },
        aiDemoDataGeneration: {
          creditCost: demoCreditCost,
          description: "Generate demo data with custom industry using AI",
          canAfford: canAffordDemo,
        },
        credits: {
          used: creditsUsed,
          remaining: remaining,
          limit: limit,
        },
        // Overall flag for backward compat - true if can afford at least one operation
        canAfford: canAffordProject || canAffordDemo,
      });
    } catch (error) {
      console.error("Error fetching AI costs:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch AI costs" : classified.message });
    }
  });

  // Get billing/payment history
  app.get('/api/billing/history', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;

      const transactions = await storage.getBillingTransactions(userId, orgId, limit, offset);

      // Prevent caching of billing history
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching billing history:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch billing history" : classified.message });
    }
  });

  app.get('/api/billing/cycle-history', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;
      const { billingProvider } = await import("./services/billing");

      let subscription = null;
      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }

      await billingProvider.getOrCreateBillingCycle(subscription.id);

      const [plan] = await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1);

      const cycles = await db
        .select()
        .from(billingCycles)
        .where(eq(billingCycles.subscriptionId, subscription.id))
        .orderBy(desc(billingCycles.periodStart));

      const result = [];
      for (const cycle of cycles) {
        const rollups = await db
          .select({
            meterCode: meters.code,
            includedUnits: usageRollups.includedUnits,
            usedUnits: usageRollups.usedUnits,
            remainingUnits: usageRollups.remainingUnits,
            overageUnits: usageRollups.overageUnits,
            overageCostMicrocents: usageRollups.overageCostMicrocents,
            hardCapHit: usageRollups.hardCapHit,
          })
          .from(usageRollups)
          .innerJoin(meters, eq(usageRollups.meterId, meters.id))
          .where(eq(usageRollups.billingCycleId, cycle.id));

        const convertedRollups = rollups.map(r => {
          if (r.meterCode === 'credits') {
            return {
              ...r,
              includedUnits: r.includedUnits / 100,
              usedUnits: r.usedUnits / 100,
              remainingUnits: r.remainingUnits / 100,
              overageUnits: r.overageUnits / 100,
            };
          }
          return r;
        });

        result.push({
          id: cycle.id,
          periodStart: cycle.periodStart,
          periodEnd: cycle.periodEnd,
          status: cycle.status,
          planName: plan?.name || "Unknown",
          usage: convertedRollups,
        });
      }

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json(result);
    } catch (error) {
      console.error("Error fetching billing cycle history:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch billing cycle history" : classified.message });
    }
  });

  // Get credit usage ledger - detailed history of all credit transactions
  app.get('/api/billing/credit-ledger', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const orgId = req.query.orgId ? parseInt(req.query.orgId as string) : undefined;

      // Get subscription - if orgId is explicitly provided, only show that org's data (no fallback)
      const { billingProvider } = await import("./services/billing");
      let subscription = null;

      if (orgId) {
        subscription = await billingProvider.getSubscriptionForOrg(orgId);
        if (!subscription) {
          // Auto-create a free subscription for organizations without one
          subscription = await billingProvider.createSubscription({ planCode: "FREE", orgId });
        }
      } else {
        // No orgId provided - show user's personal subscription
        subscription = await billingProvider.getSubscriptionForUser(userId);
        if (!subscription) {
          // Auto-create a free subscription for new users
          subscription = await billingProvider.createSubscription({ planCode: "FREE", userId });
        }
      }

      // Query usage events for credits meter with user details
      const result = await db.select({
        id: usageEvents.id,
        units: usageEvents.units,
        requestId: usageEvents.requestId,
        occurredAt: usageEvents.occurredAt,
        createdAt: usageEvents.createdAt,
        actorUserId: usageEvents.actorUserId,
        meterCode: meters.code,
        meterName: meters.name,
      })
      .from(usageEvents)
      .innerJoin(meters, eq(usageEvents.meterId, meters.id))
      .where(
        and(
          eq(usageEvents.subscriptionId, subscription.id),
          eq(meters.code, 'credits')
        )
      )
      .orderBy(desc(usageEvents.occurredAt))
      .limit(limit)
      .offset(offset);

      // Get total count
      const countResult = await db.select({ count: sql<number>`count(*)` })
        .from(usageEvents)
        .innerJoin(meters, eq(usageEvents.meterId, meters.id))
        .where(
          and(
            eq(usageEvents.subscriptionId, subscription.id),
            eq(meters.code, 'credits')
          )
        );

      const total = countResult[0]?.count || 0;

      // Get user details for each entry
      const userIds = Array.from(new Set(result.map(e => e.actorUserId).filter((id): id is string => id !== null)));
      const users = await Promise.all(
        userIds.map(uid => storage.getUser(uid as string))
      );
      const userMap = new Map(
        users.filter(Boolean).map(u => [u!.id, u])
      );

      // Parse resource type from request_id (format: "project_123_timestamp")
      const parseResourceType = (requestId: string): { type: string; resourceId: string } => {
        const parts = requestId.split('_');
        if (parts.length >= 2) {
          return { type: parts[0], resourceId: parts[1] };
        }
        return { type: 'unknown', resourceId: requestId };
      };

      const entries = result.map(e => {
        const user = e.actorUserId ? userMap.get(e.actorUserId) : null;
        const { type, resourceId } = parseResourceType(e.requestId);
        return {
          id: e.id,
          creditsUsed: e.units / 100, // Convert from hundredths
          resourceType: type,
          resourceId,
          occurredAt: e.occurredAt,
          createdAt: e.createdAt,
          userId: e.actorUserId,
          userName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'System',
          userEmail: user?.email || null,
        };
      });

      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json({ entries, total: Number(total) });
    } catch (error) {
      console.error("Error fetching credit ledger:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch credit ledger" : classified.message });
    }
  });

  // Enterprise plan inquiry - sends email to both user and sales
  app.post('/api/billing/enterprise-inquiry', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { planName, organizationName } = req.body;

      if (!planName) {
        return res.status(400).json({ message: "Plan name is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      const { sendEnterpriseInquiryEmail } = await import("./services/email");
      const result = await sendEnterpriseInquiryEmail(
        user.email,
        userName,
        planName,
        organizationName
      );

      res.status(201).json({ 
        success: result.userSent || result.salesSent,
        userEmailSent: result.userSent,
        salesEmailSent: result.salesSent
      });
    } catch (error) {
      console.error("Error sending enterprise inquiry:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to send inquiry" : classified.message });
    }
  });

  // Create subscription
  app.post('/api/billing/subscription', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { planCode } = req.body;
      if (!planCode) {
        return res.status(400).json({ message: "Plan code is required" });
      }

      const { billingProvider } = await import("./services/billing");

      // Check if user already has a subscription
      const existing = await billingProvider.getSubscriptionForUser(userId);
      if (existing) {
        return res.status(400).json({ message: "User already has a subscription. Use PATCH to change plan." });
      }

      const subscription = await billingProvider.createSubscription({ planCode, userId });
      res.status(201).json(subscription);
    } catch (error) {
      console.error("Error creating subscription:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create subscription" : classified.message });
    }
  });

  // Change plan
  app.patch('/api/billing/subscription/:id/plan', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const subscriptionId = parseInt(req.params.id);
      const { planCode } = req.body;

      if (!planCode) {
        return res.status(400).json({ message: "Plan code is required" });
      }

      const { billingProvider } = await import("./services/billing");

      const subscription = await billingProvider.changePlan(subscriptionId, planCode, userId);
      res.json(subscription);
    } catch (error) {
      console.error("Error changing plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to change plan" : classified.message });
    }
  });

  // ============= ADMIN PLAN ROUTES =============

  // Create a new plan (super admin only)
  app.post('/api/admin/plans', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans, meters, planMeterRules, features, planFeatures } = await import("@shared/schema");
      const { code, name, description, monthlyPriceCents, maxSeats } = req.body;

      if (!code || !name) {
        return res.status(400).json({ message: "Code and name are required" });
      }

      const existingPlan = await db.select().from(plans).where(eq(plans.code, code.toUpperCase())).limit(1);
      if (existingPlan.length > 0) {
        return res.status(400).json({ message: "Plan code already exists" });
      }

      const [newPlan] = await db.insert(plans).values({
        code: code.toUpperCase(),
        name,
        description: description || null,
        monthlyPriceCents: monthlyPriceCents || 0,
        maxSeats: maxSeats || null,
        isActive: true,
      }).returning();

      const allMeters = await db.select().from(meters);
      const meterRulesValues: any[] = [];

      for (const meter of allMeters) {
        meterRulesValues.push({
          planId: newPlan.id,
          meterId: meter.id,
          ruleType: "INCLUDED_QUOTA",
          includedUnitsMonthly: 10,
          isSharedPool: false,
        });
        meterRulesValues.push({
          planId: newPlan.id,
          meterId: meter.id,
          ruleType: "HARD_CAP",
          hardCapUnits: 10,
          isSharedPool: false,
        });
      }

      if (meterRulesValues.length > 0) {
        await db.insert(planMeterRules).values(meterRulesValues);
      }

      const allFeatures = await db.select().from(features);
      if (allFeatures.length > 0) {
        const featureValues = allFeatures.map(f => ({
          planId: newPlan.id,
          featureId: f.id,
          isEnabled: false,
        }));
        await db.insert(planFeatures).values(featureValues);
      }

      res.status(201).json(newPlan);
    } catch (error) {
      console.error("Error creating plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create plan" : classified.message });
    }
  });

  // Reorder plans (super admin only) - MUST be before :id route
  app.put('/api/admin/plans/reorder', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans } = await import("@shared/schema");
      const { orderedIds } = req.body;

      if (!Array.isArray(orderedIds)) {
        return res.status(400).json({ message: "orderedIds must be an array" });
      }

      for (let i = 0; i < orderedIds.length; i++) {
        await db.update(plans)
          .set({ displayOrder: i })
          .where(eq(plans.id, orderedIds[i]));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering plans:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to reorder plans" : classified.message });
    }
  });

  // Update a plan (super admin only)
  app.put('/api/admin/plans/:id', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans } = await import("@shared/schema");
      const planId = parseInt(req.params.id);
      const { name, description, monthlyPriceCents, maxSeats, extraSeatPriceCents, isActive, paypalPlanId, paypalProductId } = req.body;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (monthlyPriceCents !== undefined) updates.monthlyPriceCents = monthlyPriceCents;
      if (maxSeats !== undefined) updates.maxSeats = maxSeats;
      if (extraSeatPriceCents !== undefined) updates.extraSeatPriceCents = extraSeatPriceCents;
      if (isActive !== undefined) updates.isActive = isActive;
      if (paypalPlanId !== undefined) updates.paypalPlanId = paypalPlanId;
      if (paypalProductId !== undefined) updates.paypalProductId = paypalProductId;

      const [updated] = await db.update(plans)
        .set(updates)
        .where(eq(plans.id, planId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update plan" : classified.message });
    }
  });

  // Initialize extra seat prices for plans (super admin only)
  app.post('/api/admin/plans/init-extra-seat-prices', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans } = await import("@shared/schema");

      // Update Professional plan (code: BASIC) with $5/seat extra
      await db.update(plans)
        .set({ extraSeatPriceCents: 500 })
        .where(eq(plans.code, 'BASIC'));

      // Update Business plan (code: BUSINESS) with $8/seat extra
      await db.update(plans)
        .set({ extraSeatPriceCents: 800 })
        .where(eq(plans.code, 'BUSINESS'));

      // Get updated plans
      const updatedPlans = await db.select().from(plans).orderBy(plans.displayOrder);

      res.json({ 
        message: "Extra seat prices initialized successfully",
        plans: updatedPlans.map(p => ({ 
          code: p.code, 
          name: p.name, 
          extraSeatPriceCents: p.extraSeatPriceCents 
        }))
      });
    } catch (error) {
      console.error("Error initializing extra seat prices:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to initialize extra seat prices" : classified.message });
    }
  });

  // Delete a plan (super admin only)
  app.delete('/api/admin/plans/:id', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { plans, planMeterRules, planFeatures, subscriptions } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.planId, planId)).limit(1);
      if (existingSub) {
        return res.status(400).json({ message: "Cannot delete plan with active subscriptions. Deactivate it instead." });
      }

      await db.delete(planMeterRules).where(eq(planMeterRules.planId, planId));
      await db.delete(planFeatures).where(eq(planFeatures.planId, planId));
      await db.delete(plans).where(eq(plans.id, planId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting plan:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to delete plan" : classified.message });
    }
  });

  // Get plan meter rules
  app.get('/api/admin/plans/:id/rules', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { planMeterRules, meters } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      const rules = await db.select({
        id: planMeterRules.id,
        planId: planMeterRules.planId,
        meterId: planMeterRules.meterId,
        ruleType: planMeterRules.ruleType,
        includedUnitsMonthly: planMeterRules.includedUnitsMonthly,
        hardCapUnits: planMeterRules.hardCapUnits,
        overageUnitPriceMicrocents: planMeterRules.overageUnitPriceMicrocents,
        isSharedPool: planMeterRules.isSharedPool,
        meter: {
          id: meters.id,
          code: meters.code,
          name: meters.name,
          unitLabel: meters.unitLabel,
        }
      })
      .from(planMeterRules)
      .innerJoin(meters, eq(planMeterRules.meterId, meters.id))
      .where(eq(planMeterRules.planId, planId));

      res.json(rules);
    } catch (error) {
      console.error("Error fetching plan rules:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch plan rules" : classified.message });
    }
  });

  // Create plan meter rule
  app.post('/api/admin/plans/:planId/rules', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { planMeterRules } = await import("@shared/schema");
      const planId = parseInt(req.params.planId);
      const { meterId, ruleType, includedUnitsMonthly, hardCapUnits, overageUnitPriceMicrocents, isSharedPool } = req.body;

      if (!meterId || !ruleType) {
        return res.status(400).json({ message: "meterId and ruleType are required" });
      }

      const [newRule] = await db.insert(planMeterRules)
        .values({
          planId,
          meterId,
          ruleType,
          includedUnitsMonthly: includedUnitsMonthly || null,
          hardCapUnits: hardCapUnits || null,
          overageUnitPriceMicrocents: overageUnitPriceMicrocents || null,
          isSharedPool: isSharedPool || false,
        })
        .returning();

      res.status(201).json(newRule);
    } catch (error) {
      console.error("Error creating rule:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create rule" : classified.message });
    }
  });

  // Update plan meter rule
  app.put('/api/admin/plans/:planId/rules/:ruleId', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { planMeterRules } = await import("@shared/schema");
      const ruleId = parseInt(req.params.ruleId);
      const { includedUnitsMonthly, hardCapUnits, overageUnitPriceMicrocents } = req.body;

      const updates: any = {};
      if (includedUnitsMonthly !== undefined) updates.includedUnitsMonthly = includedUnitsMonthly;
      if (hardCapUnits !== undefined) updates.hardCapUnits = hardCapUnits;
      if (overageUnitPriceMicrocents !== undefined) updates.overageUnitPriceMicrocents = overageUnitPriceMicrocents;

      const [updated] = await db.update(planMeterRules)
        .set(updates)
        .where(eq(planMeterRules.id, ruleId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating rule:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update rule" : classified.message });
    }
  });

  // === CREDIT COST MANAGEMENT (Super Admin) ===

  // Get all credit costs
  app.get('/api/admin/credit-costs', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { getAllCreditCosts } = await import("./services/billing");
      const costs = await getAllCreditCosts();

      // Return raw values for editing (in hundredths)
      res.json(costs);
    } catch (error) {
      console.error("Error fetching credit costs:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch credit costs" : classified.message });
    }
  });

  // Update a credit cost
  app.put('/api/admin/credit-costs/:resourceType', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (user?.role !== 'super_admin') {
      return res.status(403).json({ message: "Super admin access required" });
    }

    try {
      const { resourceType } = req.params;
      const { creditCost, displayName, description } = req.body;
      const { resourceCreditCosts } = await import("@shared/schema");

      if (creditCost === undefined || creditCost < 0) {
        return res.status(400).json({ message: "Invalid credit cost" });
      }

      const [updated] = await db.update(resourceCreditCosts)
        .set({ 
          creditCost: Math.round(creditCost),
          displayName: displayName || undefined,
          description: description || undefined,
          updatedAt: new Date(),
          updatedBy: userId
        })
        .where(eq(resourceCreditCosts.resourceType, resourceType))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Resource type not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating credit cost:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update credit cost" : classified.message });
    }
  });

  // Get plan credits summary (for plan management UI)
  app.get('/api/admin/plans/:id/credits', async (req, res) => {
    const userId = req.session?.userId || (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { planMeterRules, meters } = await import("@shared/schema");
      const planId = parseInt(req.params.id);

      // Get credits meter
      const [creditsMeter] = await db.select().from(meters).where(eq(meters.code, "credits")).limit(1);

      if (!creditsMeter) {
        return res.json({ included: 0, hardCap: null });
      }

      const rules = await db.select()
        .from(planMeterRules)
        .where(and(
          eq(planMeterRules.planId, planId),
          eq(planMeterRules.meterId, creditsMeter.id)
        ));

      const quotaRule = rules.find((r) => r.ruleType === "INCLUDED_QUOTA");
      const hardCapRule = rules.find((r) => r.ruleType === "HARD_CAP");

      res.json({
        meterId: creditsMeter.id,
        included: quotaRule?.includedUnitsMonthly || 0,
        hardCap: hardCapRule?.hardCapUnits || null,
        quotaRuleId: quotaRule?.id,
        hardCapRuleId: hardCapRule?.id
      });
    } catch (error) {
      console.error("Error fetching plan credits:", error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch plan credits" : classified.message });
    }
  });

  // === PAYPAL ROUTES ===
  // Only register PayPal routes if credentials are configured
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    try {
      const { createPaypalOrder, capturePaypalOrder, loadPaypalDefault } = await import("./paypal");

      app.get("/paypal/setup", async (req, res) => {
        await loadPaypalDefault(req, res);
      });

      app.post("/paypal/order", async (req, res) => {
        await createPaypalOrder(req, res);
      });

      app.post("/paypal/order/:orderID/capture", async (req, res) => {
        await capturePaypalOrder(req, res);
      });

      console.log("[routes] PayPal routes registered successfully");

      // PayPal Subscription routes
      const { 
        createProduct, 
        createPlan, 
        createSubscription, 
        getSubscription, 
        cancelSubscription, 
        activateSubscription,
        listPlans: listPayPalPlans,
        getPayPalClientId 
      } = await import("./paypalSubscriptions");

      app.get("/api/paypal/subscription/client-id", getPayPalClientId);
      app.post("/api/paypal/subscription/product", createProduct);
      app.post("/api/paypal/subscription/plan", createPlan);
      app.get("/api/paypal/subscription/plans", listPayPalPlans);
      app.post("/api/paypal/subscription/create", createSubscription);
      app.get("/api/paypal/subscription/:subscriptionId", getSubscription);
      app.post("/api/paypal/subscription/:subscriptionId/cancel", cancelSubscription);
      app.post("/api/paypal/subscription/:subscriptionId/activate", activateSubscription);

      // Get payment method from user's active PayPal subscription
      app.get("/api/billing/payment-method", async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Authentication required" });
        }

        try {
          const { billingProvider } = await import("./services/billing");
          const subscription = await billingProvider.getSubscriptionForUser(userId);

          if (!subscription?.paypalSubscriptionId) {
            return res.json({ hasPaymentMethod: false });
          }

          // Fetch PayPal subscription details
          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";

          const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
          const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });

          if (!tokenRes.ok) {
            return res.json({ hasPaymentMethod: true, type: "paypal" });
          }

          const { access_token } = await tokenRes.json();

          const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscription.paypalSubscriptionId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          });

          if (!subRes.ok) {
            return res.json({ hasPaymentMethod: true, type: "paypal" });
          }

          const subData = await subRes.json();

          // Extract subscriber info
          const subscriber = subData.subscriber || {};
          const payerEmail = subscriber.email_address || null;
          const payerId = subscriber.payer_id || null;
          const payerName = subscriber.name ? `${subscriber.name.given_name || ""} ${subscriber.name.surname || ""}`.trim() : null;

          res.json({
            hasPaymentMethod: true,
            type: "paypal",
            email: payerEmail,
            payerId: payerId,
            name: payerName,
            status: subData.status,
          });
        } catch (error) {
          console.error("Error fetching payment method:", error);
          const classified = classifyError(error);
          res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch payment method" : classified.message });
        }
      });

      // Admin: Sync all billing plans to PayPal
      app.post("/api/admin/paypal/sync-plans", async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Authentication required" });
        }

        const user = await storage.getUser(userId);
        if (user?.role !== "super_admin") {
          return res.status(403).json({ message: "Super admin access required" });
        }

        try {
          const { plans } = await import("@shared/schema");
          const allPlans = await db.select().from(plans);

          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";

          const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
          const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });

          if (!tokenRes.ok) {
            const errorData = await tokenRes.json();
            console.error("PayPal auth failed:", errorData);
            return res.status(500).json({ message: "PayPal authentication failed", error: errorData });
          }
          const { access_token } = await tokenRes.json();

          // STEP 1: Fetch ALL existing plans from PayPal
          console.log("[PayPal Sync] Fetching existing plans from PayPal...");
          const existingPlansRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans?page_size=20&total_required=true`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
          });

          let paypalPlans: any[] = [];
          if (existingPlansRes.ok) {
            const data = await existingPlansRes.json();
            paypalPlans = data.plans || [];
            console.log(`[PayPal Sync] Found ${paypalPlans.length} plans in PayPal`);
          } else {
            console.log("[PayPal Sync] Could not fetch existing plans, will create new ones");
          }

          // STEP 2: Fetch details for each PayPal plan to get pricing
          const paypalPlanDetails: any[] = [];
          for (const pp of paypalPlans) {
            if (pp.status === "ACTIVE") {
              try {
                const detailRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans/${pp.id}`, {
                  method: "GET",
                  headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json",
                  },
                });
                if (detailRes.ok) {
                  const detail = await detailRes.json();
                  const billingCycle = detail.billing_cycles?.find((bc: any) => bc.tenure_type === "REGULAR");
                  const price = billingCycle?.pricing_scheme?.fixed_price?.value;
                  paypalPlanDetails.push({
                    id: pp.id,
                    name: pp.name,
                    status: pp.status,
                    product_id: detail.product_id,
                    price: price ? parseFloat(price) : null,
                    priceCents: price ? Math.round(parseFloat(price) * 100) : null,
                  });
                  console.log(`[PayPal Sync] Plan ${pp.id}: ${pp.name} - $${price}`);
                }
              } catch (e) {
                console.error(`[PayPal Sync] Error fetching plan details for ${pp.id}:`, e);
              }
            }
          }

          // STEP 3: Match PayPal plans to database plans by price
          const results = [];
          let productId = paypalPlanDetails[0]?.product_id || allPlans.find(p => p.paypalProductId)?.paypalProductId;

          for (const dbPlan of allPlans) {
            if (!dbPlan.monthlyPriceCents || dbPlan.monthlyPriceCents === 0) {
              results.push({ planCode: dbPlan.code, status: "skipped", reason: "free_plan" });
              continue;
            }

            // Find matching PayPal plan by price
            const matchingPaypalPlan = paypalPlanDetails.find(pp => pp.priceCents === dbPlan.monthlyPriceCents);

            if (matchingPaypalPlan) {
              // Update database with correct PayPal plan ID
              if (dbPlan.paypalPlanId !== matchingPaypalPlan.id) {
                await db.update(plans)
                  .set({ 
                    paypalPlanId: matchingPaypalPlan.id, 
                    paypalProductId: matchingPaypalPlan.product_id 
                  })
                  .where(eq(plans.id, dbPlan.id));
                results.push({ 
                  planCode: dbPlan.code, 
                  paypalPlanId: matchingPaypalPlan.id, 
                  status: "updated",
                  oldPaypalPlanId: dbPlan.paypalPlanId,
                  price: `$${(dbPlan.monthlyPriceCents / 100).toFixed(2)}`
                });
                console.log(`[PayPal Sync] Updated ${dbPlan.code}: ${dbPlan.paypalPlanId} -> ${matchingPaypalPlan.id}`);
              } else {
                results.push({ 
                  planCode: dbPlan.code, 
                  paypalPlanId: dbPlan.paypalPlanId, 
                  status: "already_correct" 
                });
              }
            } else {
              // No matching plan found - need to create one
              console.log(`[PayPal Sync] No matching PayPal plan for ${dbPlan.code} at $${(dbPlan.monthlyPriceCents / 100).toFixed(2)}`);

              // Create product if needed
              if (!productId) {
                const productRes = await fetch(`${PAYPAL_API_BASE}/v1/catalogs/products`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": `product-fridayreport-${Date.now()}`,
                  },
                  body: JSON.stringify({
                    name: "FridayReport.AI Subscription",
                    description: "Project Portfolio Management subscription",
                    type: "SERVICE",
                    category: "SOFTWARE",
                  }),
                });

                if (productRes.ok) {
                  const product = await productRes.json();
                  productId = product.id;
                }
              }

              // Create the plan in PayPal
              const priceValue = (dbPlan.monthlyPriceCents / 100).toFixed(2);
              const planRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/plans`, {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${access_token}`,
                  "Content-Type": "application/json",
                  "PayPal-Request-Id": `plan-${dbPlan.code}-${Date.now()}`,
                },
                body: JSON.stringify({
                  product_id: productId,
                  name: `${dbPlan.name} Plan`,
                  description: dbPlan.description || `${dbPlan.name} monthly subscription`,
                  status: "ACTIVE",
                  billing_cycles: [{
                    frequency: { interval_unit: "MONTH", interval_count: 1 },
                    tenure_type: "REGULAR",
                    sequence: 1,
                    total_cycles: 0,
                    pricing_scheme: {
                      fixed_price: { value: priceValue, currency_code: "USD" },
                    },
                  }],
                  payment_preferences: {
                    auto_bill_outstanding: true,
                    setup_fee: { value: "0", currency_code: "USD" },
                    setup_fee_failure_action: "CONTINUE",
                    payment_failure_threshold: 3,
                  },
                }),
              });

              if (planRes.ok) {
                const paypalPlan = await planRes.json();
                await db.update(plans)
                  .set({ paypalPlanId: paypalPlan.id, paypalProductId: productId })
                  .where(eq(plans.id, dbPlan.id));
                results.push({ planCode: dbPlan.code, paypalPlanId: paypalPlan.id, status: "created" });
              } else {
                const errorData = await planRes.json();
                results.push({ planCode: dbPlan.code, error: errorData.message || "Failed to create plan", status: "error" });
              }
            }
          }

          console.log("[PayPal Sync] Sync complete:", results);
          res.json({ success: true, productId, paypalPlansFound: paypalPlanDetails.length, plans: results });
        } catch (error) {
          console.error("Failed to sync PayPal plans:", error);
          const classified = classifyError(error);
          res.status(classified.status).json({ message: classified.status === 500 ? "Failed to sync PayPal plans" : classified.message });
        }
      });

      // Update subscription with PayPal subscription ID
      app.post("/api/billing/subscription/paypal", async (req, res) => {
        const userId = getUserIdFromRequest(req);
        if (!userId) {
          return res.status(401).json({ message: "Authentication required" });
        }

        try {
          const { planCode, paypalSubscriptionId, organizationId } = req.body;
          const { plans, subscriptions, billingCycles, usageRollups, meters, planMeterRules, organizationMembers } = await import("@shared/schema");

          if (!paypalSubscriptionId || typeof paypalSubscriptionId !== 'string') {
            return res.status(400).json({ message: "PayPal subscription ID is required" });
          }

          if (!organizationId || typeof organizationId !== 'number') {
            return res.status(400).json({ message: "Organization ID is required" });
          }

          // Verify user is an admin of the organization
          const [membership] = await db.select()
            .from(organizationMembers)
            .where(and(
              eq(organizationMembers.organizationId, organizationId),
              eq(organizationMembers.userId, userId)
            ));

          if (!membership || (membership.role !== 'org_admin' && membership.role !== 'owner')) {
            return res.status(403).json({ message: "Only organization admins can manage subscriptions" });
          }

          // Verify PayPal subscription and derive plan from PayPal's data (prevents plan spoofing)
          const PAYPAL_API_BASE = process.env.NODE_ENV === "production"
            ? "https://api-m.paypal.com"
            : "https://api-m.sandbox.paypal.com";

          const PAYPAL_CLIENT_ID = (process.env.PAYPAL_CLIENT_ID || "").trim();
          const PAYPAL_CLIENT_SECRET = (process.env.PAYPAL_CLIENT_SECRET || "").trim();

          let verifiedPlan: typeof plans.$inferSelect | null = null;

          if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
            // PayPal credentials not configured - require planCode as fallback
            const [requestedPlan] = await db.select().from(plans).where(eq(plans.code, planCode));
            if (!requestedPlan) {
              return res.status(404).json({ message: "Plan not found" });
            }
            if (requestedPlan.paypalPlanId) {
              // Plan requires PayPal verification but credentials missing
              console.error("PayPal credentials not configured, cannot verify subscription for PayPal-enabled plan");
              return res.status(500).json({ message: "Payment verification is not configured. Please contact support." });
            }
            verifiedPlan = requestedPlan;
          } else {
            // Verify subscription with PayPal API
            try {
              const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
              const tokenRes = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
                method: "POST",
                headers: {
                  "Authorization": `Basic ${auth}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: "grant_type=client_credentials",
              });

              if (!tokenRes.ok) {
                console.error("Failed to get PayPal access token:", await tokenRes.text());
        return res.status(500).json({ message: "Failed to authenticate with payment provider. Please try again." });
              }

              const tokenData = await tokenRes.json();

              const subRes = await fetch(`${PAYPAL_API_BASE}/v1/billing/subscriptions/${paypalSubscriptionId}`, {
                headers: {
                  "Authorization": `Bearer ${tokenData.access_token}`,
                  "Content-Type": "application/json",
                },
              });

              if (!subRes.ok) {
                console.error(`Failed to verify PayPal subscription ${paypalSubscriptionId}:`, await subRes.text());
                return res.status(400).json({ message: "Failed to verify PayPal subscription" });
              }

              const paypalSub = await subRes.json();
              console.log(`[PayPal Activation] Subscription ${paypalSubscriptionId} status: ${paypalSub.status}, plan_id: ${paypalSub.plan_id}`);

              // Verify the subscription is active/approved/pending
              // APPROVAL_PENDING: User approved but first payment not yet processed
              // APPROVED: User approved, awaiting activation
              // ACTIVE: Subscription is fully active
              const validStatuses = ['ACTIVE', 'APPROVED', 'APPROVAL_PENDING'];
              if (!validStatuses.includes(paypalSub.status)) {
                console.error(`PayPal subscription ${paypalSubscriptionId} has status ${paypalSub.status}, rejecting`);
                return res.status(400).json({ 
                  message: `PayPal subscription status is '${paypalSub.status}'. Expected: ACTIVE, APPROVED, or APPROVAL_PENDING.`,
                  status: paypalSub.status
                });
              }

              // Derive plan from PayPal's plan_id (server-side, ignore URL param to prevent spoofing)
              const paypalPlanIdFromSub = paypalSub.plan_id;
              console.log(`[PayPal Activation] PayPal subscription ${paypalSubscriptionId} has plan_id: ${paypalPlanIdFromSub}, requested planCode: ${planCode}`);

              if (paypalPlanIdFromSub) {
                const [matchingPlan] = await db.select().from(plans).where(eq(plans.paypalPlanId, paypalPlanIdFromSub));
                if (matchingPlan) {
                  verifiedPlan = matchingPlan;
                  console.log(`[PayPal Activation] Matched to plan ${matchingPlan.code} (id: ${matchingPlan.id})`);
                  if (planCode && matchingPlan.code !== planCode) {
                    console.log(`[PayPal Activation] Note: requested ${planCode} but PayPal subscription is for ${matchingPlan.code}`);
                  }
                } else {
                  console.log(`[PayPal Activation] No plan found in database with paypalPlanId: ${paypalPlanIdFromSub}`);
                  // Log all plans for debugging
                  const allPlans = await db.select().from(plans);
                  console.log(`[PayPal Activation] Available plans:`, allPlans.map(p => ({ code: p.code, paypalPlanId: p.paypalPlanId })));

                  // Return detailed error to help debug
                  return res.status(400).json({
                    message: "PayPal plan ID not found in database. Please use 'Sync PayPal Plans' in Super Admin.",
                    paypalPlanId: paypalPlanIdFromSub,
                    availablePlans: allPlans.map(p => ({ code: p.code, paypalPlanId: p.paypalPlanId }))
                  });
                }
              }

              // If no matching plan found from PayPal, fall back to planCode
              if (!verifiedPlan && planCode) {
                const [requestedPlan] = await db.select().from(plans).where(eq(plans.code, planCode));
                if (requestedPlan) {
                  // Check if the plan's paypalPlanId matches what we got from PayPal
                  if (!requestedPlan.paypalPlanId) {
                    // Plan has no PayPal ID set, allow fallback
                    verifiedPlan = requestedPlan;
                    console.log(`[PayPal Activation] Fallback to plan ${requestedPlan.code} (no paypalPlanId set)`);
                  } else if (paypalPlanIdFromSub && requestedPlan.paypalPlanId !== paypalPlanIdFromSub) {
                    // Plan has a different paypalPlanId - this could be sandbox/live mismatch
                    console.error(`[PayPal Activation] Plan mismatch: ${planCode} has DB paypalPlanId=${requestedPlan.paypalPlanId} but PayPal returned ${paypalPlanIdFromSub}`);
                    console.error(`[PayPal Activation] This usually means the database has sandbox plan IDs but you're using live PayPal credentials, or vice versa.`);
                    return res.status(400).json({ 
                      message: "Subscription plan ID mismatch. Please contact support.",
                      details: "The payment was processed but the plan IDs don't match. Your payment is safe - contact support to activate your subscription."
                    });
                  } else {
                    verifiedPlan = requestedPlan;
                  }
                }
              }
            } catch (verifyError) {
              console.error("PayPal verification error:", verifyError);
              const classified = classifyError(verifyError);
              return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to verify subscription with PayPal. Please try again." : classified.message });
            }
          }

          if (!verifiedPlan) {
            return res.status(404).json({ message: "Could not determine subscription plan" });
          }

          const plan = verifiedPlan;

          // Check if organization has existing subscription
          const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, organizationId));

          const now = new Date();
          const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

          const { billingTransactions } = await import("@shared/schema");

          if (existingSub) {
            // Update existing subscription
            await db.update(subscriptions)
              .set({ 
                planId: plan.id, 
                paypalSubscriptionId,
                status: "ACTIVE",
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              })
              .where(eq(subscriptions.id, existingSub.id));

            // Record the initial subscription transaction
            if (plan.monthlyPriceCents && plan.monthlyPriceCents > 0) {
              await db.insert(billingTransactions).values({
                subscriptionId: existingSub.id,
                userId,
                orgId: organizationId,
                provider: "paypal",
                externalTransactionId: paypalSubscriptionId,
                amountCents: plan.monthlyPriceCents,
                currency: "USD",
                status: "COMPLETED",
                description: `${plan.name} subscription activated`,
                planName: plan.name,
                periodStart,
                periodEnd,
                paymentMethodType: "paypal",
                createdAt: now,
              });
            }

            res.json({ success: true, subscriptionId: existingSub.id, organizationId });
          } else {
            // Create new subscription for organization
            const [newSub] = await db.insert(subscriptions).values({
              planId: plan.id,
              orgId: organizationId,
              subjectType: "ORGANIZATION",
              status: "ACTIVE",
              paypalSubscriptionId,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            }).returning();

            // Create billing cycle and usage rollups
            const [cycle] = await db.insert(billingCycles).values({
              subscriptionId: newSub.id,
              periodStart,
              periodEnd,
              status: "OPEN",
            }).returning();

            const allMeters = await db.select().from(meters);
            const allRules = await db.select().from(planMeterRules).where(eq(planMeterRules.planId, plan.id));

            for (const meter of allMeters) {
              const rules = allRules.filter(r => r.meterId === meter.id);
              const includedQuota = rules.find(r => r.ruleType === "INCLUDED_QUOTA");

              await db.insert(usageRollups).values({
                billingCycleId: cycle.id,
                meterId: meter.id,
                includedUnits: includedQuota?.includedUnitsMonthly || 0,
                usedUnits: 0,
                remainingUnits: includedQuota?.includedUnitsMonthly || 0,
                overageUnits: 0,
                overageCostMicrocents: 0,
                hardCapHit: false,
              });
            }

            // Record the initial subscription transaction
            if (plan.monthlyPriceCents && plan.monthlyPriceCents > 0) {
              await db.insert(billingTransactions).values({
                subscriptionId: newSub.id,
                userId,
                orgId: organizationId,
                provider: "paypal",
                externalTransactionId: paypalSubscriptionId,
                amountCents: plan.monthlyPriceCents,
                currency: "USD",
                status: "COMPLETED",
                description: `${plan.name} subscription activated`,
                planName: plan.name,
                periodStart,
                periodEnd,
                paymentMethodType: "paypal",
                createdAt: now,
              });
            }

            res.status(201).json({ success: true, subscriptionId: newSub.id, organizationId });
          }
        } catch (error) {
          console.error("Failed to update subscription:", error);
          const classified = classifyError(error);
          res.status(classified.status).json({ message: classified.status === 500 ? "Failed to update subscription" : classified.message });
        }
      });

      // PayPal Webhook handler for recording payment transactions
      app.post("/api/webhooks/paypal", async (req, res) => {
        try {
          const { event_type, resource, create_time } = req.body;
          console.log("[PayPal Webhook] Received event:", event_type);

          // Handle subscription payment events
          if (event_type === "PAYMENT.SALE.COMPLETED" || event_type === "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED") {
            const paypalSubscriptionId = resource?.billing_agreement_id || resource?.id;
            const transactionId = resource?.id;
            const amount = resource?.amount?.total || resource?.gross_amount?.value;
            const currency = resource?.amount?.currency || resource?.gross_amount?.currency_code || "USD";

            if (paypalSubscriptionId && transactionId && amount) {
              const { subscriptions, plans, billingTransactions } = await import("@shared/schema");

              // Find the subscription by PayPal subscription ID
              const [subscription] = await db.select({
                sub: subscriptions,
                plan: plans,
              }).from(subscriptions)
                .leftJoin(plans, eq(subscriptions.planId, plans.id))
                .where(eq(subscriptions.paypalSubscriptionId, paypalSubscriptionId));

              if (subscription) {
                const amountCents = Math.round(parseFloat(amount) * 100);

                // Check if we already recorded this transaction (idempotency)
                const [existingTx] = await db.select().from(billingTransactions)
                  .where(eq(billingTransactions.externalTransactionId, transactionId));

                if (!existingTx) {
                  // Record the payment transaction
                  await db.insert(billingTransactions).values({
                    subscriptionId: subscription.sub.id,
                    userId: subscription.sub.userId,
                    orgId: subscription.sub.orgId,
                    provider: "paypal",
                    externalTransactionId: transactionId,
                    amountCents,
                    currency: currency.toUpperCase(),
                    status: "COMPLETED",
                    description: `${subscription.plan?.name || 'Subscription'} payment`,
                    planName: subscription.plan?.name,
                    periodStart: subscription.sub.currentPeriodStart,
                    periodEnd: subscription.sub.currentPeriodEnd,
                    paymentMethodType: "paypal",
                    metadata: { event_type, resource_id: resource?.id },
                    createdAt: new Date(create_time || Date.now()),
                  });
                  console.log(`[PayPal Webhook] Recorded payment of $${(amountCents / 100).toFixed(2)} for subscription ${subscription.sub.id}`);
                }
              }
            }
          }

          // Handle failed payment events
          if (event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" || event_type === "PAYMENT.SALE.DENIED") {
            const paypalSubscriptionId = resource?.billing_agreement_id || resource?.id;
            const transactionId = resource?.id;
            const amount = resource?.amount?.total || resource?.gross_amount?.value;
            const currency = resource?.amount?.currency || resource?.gross_amount?.currency_code || "USD";
            const failureReason = resource?.status_details?.reason || "Payment failed";

            if (paypalSubscriptionId && transactionId) {
              const { subscriptions, plans, billingTransactions } = await import("@shared/schema");

              const [subscription] = await db.select({
                sub: subscriptions,
                plan: plans,
              }).from(subscriptions)
                .leftJoin(plans, eq(subscriptions.planId, plans.id))
                .where(eq(subscriptions.paypalSubscriptionId, paypalSubscriptionId));

              if (subscription) {
                const amountCents = amount ? Math.round(parseFloat(amount) * 100) : 0;

                await db.insert(billingTransactions).values({
                  subscriptionId: subscription.sub.id,
                  userId: subscription.sub.userId,
                  orgId: subscription.sub.orgId,
                  provider: "paypal",
                  externalTransactionId: transactionId,
                  amountCents,
                  currency: currency?.toUpperCase() || "USD",
                  status: "FAILED",
                  description: `Failed payment for ${subscription.plan?.name || 'Subscription'}`,
                  planName: subscription.plan?.name,
                  failureReason,
                  paymentMethodType: "paypal",
                  metadata: { event_type, resource_id: resource?.id },
                  createdAt: new Date(create_time || Date.now()),
                });
                console.log(`[PayPal Webhook] Recorded failed payment for subscription ${subscription.sub.id}`);
              }
            }
          }

          // Always respond 200 to acknowledge receipt
          res.status(200).json({ received: true });
        } catch (error) {
          console.error("[PayPal Webhook] Error processing webhook:", error);
          // Still return 200 to avoid PayPal retries on non-critical errors
          res.status(200).json({ received: true, error: "Processing error logged" });
        }
      });

      console.log("[routes] PayPal Subscription routes registered successfully");
    } catch (error) {
      console.warn("[routes] PayPal routes not registered - credentials may be invalid:", error);
    }
  } else {
    console.log("[routes] PayPal routes not registered - credentials not configured");
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

  // ==================== TIMESHEETS ====================

  // Get timesheet entries - returns all entries for admins, or user's own entries for non-admins
  app.get('/api/timesheets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      // Main timesheet view should ALWAYS return only the current user's own entries
      // The approval tab uses a separate endpoint (/api/timesheets/approval) for viewing other users' entries
      // This prevents entries from other users appearing in an admin's personal timesheet grid
      const entriesWithDetails = await storage.getTimesheetEntriesWithDetails(userId, organizationId, startDate, endDate);

      // Transform to expected format
      const enrichedEntries = entriesWithDetails.map(({ entry, task, project }) => ({
        ...entry,
        task,
        project
      }));

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet entries' : classified.message });
    }
  });

  // Get all team timesheet entries for approvers/admins (used by dashboards)
  app.get('/api/timesheets/team', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const user = await storage.getUser(userId);
      const membership = (await storage.getOrganizationMembers(organizationId)).find(m => m.userId === userId);
      const isSuperAdmin = hasAdminAccess(user);
      const isOrgAdmin = membership?.role === 'org_admin' || membership?.role === 'owner';
      const isApprover = userResource?.isApprover === true;

      if (!isSuperAdmin && !isOrgAdmin && !isApprover) {
        return res.status(403).json({ message: 'Not authorized to view team timesheets' });
      }

      const entriesWithDetails = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);

      const enrichedEntries = await Promise.all(entriesWithDetails.map(async ({ entry, task, project }) => {
        const resource = await storage.getResource(entry.resourceId);
        return { ...entry, task, project, resource };
      }));

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting team timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get team timesheet entries' : classified.message });
    }
  });

  // Get timesheet entries for approval (managers/approvers)
  app.get('/api/timesheets/approval', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const status = req.query.status as string;

      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      const isApprover = userResource?.isApprover === true;

      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      const entries = await storage.getTimesheetEntriesForApproval(organizationId, status);

      let scopedEntries = entries;
      if (!isApprover && activeDelegations.length > 0) {
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        scopedEntries = entries.filter(entry => {
          const entryResource = resources.find(r => r.id === entry.resourceId);
          return entryResource?.managerId && delegatorIds.includes(entryResource.managerId);
        });
      }

      const enrichedEntries = await Promise.all(scopedEntries.map(async (entry) => {
        const task = await storage.getTask(entry.taskId);
        const project = task ? await storage.getProject(task.projectId) : null;
        const resource = await storage.getResource(entry.resourceId);
        return { ...entry, task, project, resource };
      }));

      res.json(enrichedEntries);
    } catch (error) {
      console.error('Error getting timesheet entries for approval:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet entries for approval' : classified.message });
    }
  });

  // Get tasks assigned to current user
  app.get('/api/timesheets/assigned-tasks', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Find the resource for this user
      const resources = await storage.getResources(organizationId);
      let userResource = resources.find(r => r.userId === userId);

      // If no resource linked by userId, try to auto-link by email
      if (!userResource) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          // Find resource by matching email (even if linked to different user)
          const resourceByEmail = resources.find(r => 
            r.email?.toLowerCase() === user.email?.toLowerCase()
          );
          if (resourceByEmail) {
            // Auto-link or re-link resource to current user
            await storage.updateResource(resourceByEmail.id, { userId });
            userResource = { ...resourceByEmail, userId };
            console.log(`Auto-linked resource ${resourceByEmail.id} to user ${userId} by email ${user.email}`);
          }
        }
      }

      if (!userResource) {
        return res.json([]);
      }

      // Single optimized query with JOINs - replaces N+1 queries
      // Returns { task, project }[] so project is already included
      // Pass userId to also include tasks where user is the ownerId
      const assignedTasks = await storage.getAssignedTasksForResource(userResource.id, organizationId, userId);

      const result = assignedTasks.map(item => ({
        ...item,
        timesheetLocked: !!(item.task.timesheetBlocked || item.project.timesheetBlocked)
      }));

      res.json(result);
    } catch (error) {
      console.error('Error getting assigned tasks:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get assigned tasks' : classified.message });
    }
  });

  // Get current user's resource record
  app.get('/api/timesheets/current-resource', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      let userResource = resources.find(r => r.userId === userId);

      // If no resource linked by userId, try to auto-link by email
      if (!userResource) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          // Find resource by matching email (even if linked to different user)
          const resourceByEmail = resources.find(r => 
            r.email?.toLowerCase() === user.email?.toLowerCase()
          );
          if (resourceByEmail) {
            // Auto-link or re-link resource to current user
            await storage.updateResource(resourceByEmail.id, { userId });
            userResource = { ...resourceByEmail, userId };
            console.log(`Auto-linked resource ${resourceByEmail.id} to user ${userId} by email ${user.email}`);
          }
        }
      }

      if (!userResource) {
        return res.status(404).json({ message: 'Resource not found' });
      }

      res.json(userResource);
    } catch (error) {
      console.error('Error getting current resource:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get current resource' : classified.message });
    }
  });

  // Helper: check if date is in a closed period respecting grace period
  async function isDateInClosedPeriodWithGrace(orgId: number, entryDate: string): Promise<{ closed: boolean; periodName?: string }> {
    const closedPeriods = await storage.getClosedPeriodsForDateRange(orgId, entryDate, entryDate);
    if (closedPeriods.length === 0) return { closed: false };

    const settings = await getEffectiveTimesheetSettings(orgId);
    const graceDays = settings?.gracePeriodDays || 0;

    if (graceDays > 0) {
      const now = new Date();
      for (const period of closedPeriods) {
        if (period.closedAt) {
          const graceEnd = new Date(period.closedAt);
          graceEnd.setDate(graceEnd.getDate() + graceDays);
          if (now <= graceEnd) {
            return { closed: false };
          }
        }
      }
    }

    return { closed: true, periodName: closedPeriods[0]?.name };
  }

  // Helper: log timesheet audit event
  const DEFAULT_TIMESHEET_SETTINGS = {
    mandatoryNotes: false,
    maxWeeklyHours: '50',
    minWeeklyHours: '0',
    overtimeThreshold: '40',
    gracePeriodDays: 0,
  };

  async function getEffectiveTimesheetSettings(organizationId: number) {
    const settings = await storage.getTimesheetSettings(organizationId);
    return {
      mandatoryNotes: settings?.mandatoryNotes ?? DEFAULT_TIMESHEET_SETTINGS.mandatoryNotes,
      maxWeeklyHours: settings?.maxWeeklyHours ?? DEFAULT_TIMESHEET_SETTINGS.maxWeeklyHours,
      minWeeklyHours: settings?.minWeeklyHours ?? DEFAULT_TIMESHEET_SETTINGS.minWeeklyHours,
      overtimeThreshold: settings?.overtimeThreshold ?? DEFAULT_TIMESHEET_SETTINGS.overtimeThreshold,
      gracePeriodDays: settings?.gracePeriodDays ?? DEFAULT_TIMESHEET_SETTINGS.gracePeriodDays,
    };
  }


    async function hasTimesheetAdminAccess(userId: string, organizationId: number): Promise<boolean> {
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (userResource?.isApprover) return true;
      const user = await storage.getUser(userId);
      if (hasAdminAccess(user)) return true;
      const members = await storage.getOrganizationMembers(organizationId);
      const membership = members.find(m => m.userId === userId);
      if (membership?.role === 'org_admin' || membership?.role === 'owner') return true;
      return false;
    }

  function getWeekBounds(entryDate: string): { startDate: string; endDate: string } {
    const d = new Date(entryDate + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    return { startDate: fmt(monday), endDate: fmt(sunday) };
  }

  async function checkWeeklyHourLimits(
    userId: string,
    organizationId: number,
    entryDate: string,
    newHours: number,
    existingEntryId?: number,
  ): Promise<{ ok: boolean; message?: string }> {
    const settings = await getEffectiveTimesheetSettings(organizationId);
    const maxHours = Number(settings.maxWeeklyHours);
    if (!maxHours) return { ok: true };
    const { startDate, endDate } = getWeekBounds(entryDate);
    const entries = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
    let weekTotal = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);

    if (existingEntryId) {
      const existing = entries.find(e => e.id === existingEntryId);
      if (existing) {
        weekTotal -= Number(existing.hours || 0);
      }
    }

    weekTotal += newHours;
    if (weekTotal > maxHours) {
      return { ok: false, message: `Adding ${newHours}h would bring weekly total to ${weekTotal}h, exceeding the ${maxHours}h maximum` };
    }
    return { ok: true };
  }

  async function logTimesheetAudit(params: {
    organizationId: number;
    entryId?: number;
    action: string;
    actorId: string;
    targetUserId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await storage.createTimesheetAuditLog({
        organizationId: params.organizationId,
        entryId: params.entryId ?? null,
        action: params.action,
        actorId: params.actorId,
        targetUserId: params.targetUserId ?? null,
        before: params.before ?? null,
        after: params.after ?? null,
        metadata: params.metadata ?? null,
      });
    } catch (e) {
      console.error('Failed to write timesheet audit log:', e);
    }
  }

  // Create timesheet entry
  app.post('/api/timesheets', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, taskId, projectId, entryDate, hours, notes, resourceId } = req.body;

      if (!organizationId || !taskId || !projectId || !entryDate || hours === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Validate hours value
      const hoursNum = parseFloat(hours);
      if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
        return res.status(400).json({ message: 'Hours must be between 0 and 24' });
      }

      // Enforce mandatory notes
      const settings = await getEffectiveTimesheetSettings(organizationId);
      if (settings?.mandatoryNotes && (!notes || !notes.trim())) {
        return res.status(400).json({ message: 'Notes are required for all timesheet entries' });
      }

      // Enforce weekly hour limits on create
      const weekLimitCheck = await checkWeeklyHourLimits(userId, organizationId, entryDate, hoursNum);
      if (!weekLimitCheck.ok) {
        return res.status(400).json({ message: weekLimitCheck.message });
      }

      // Verify user is assigned to this task
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);

      if (!userResource) {
        return res.status(403).json({ message: 'You are not a resource in this organization' });
      }

      const assignments = await storage.getTaskResourceAssignments(taskId);
      const isAssigned = assignments.some(a => a.resourceId === userResource.id);

      if (!isAssigned) {
        return res.status(403).json({ message: 'You are not assigned to this task' });
      }

      // Check if task or project is blocked for timesheet entries
      const task = await storage.getTask(taskId);
      if (task?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this task' });
      }

      const project = await storage.getProject(projectId);
      if (project?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this project' });
      }

      // Check if entry date is in a closed period (with grace period)
      const periodCheck = await isDateInClosedPeriodWithGrace(organizationId, entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot create entries in a closed period' });
      }

      const entry = await storage.createTimesheetEntry({
        organizationId,
        userId,
        resourceId: userResource.id,
        taskId,
        projectId,
        entryDate,
        hours: String(hours),
        notes,
        status: 'Draft',
      });

      await logTimesheetAudit({
        organizationId,
        entryId: entry.id,
        action: 'create',
        actorId: userId,
        after: { hours: String(hours), notes, taskId, projectId, entryDate },
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create timesheet entry' : classified.message });
    }
  });

  // Bulk upsert timesheet entries
  app.post('/api/timesheets/bulk', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { entries } = req.body;
      if (!entries || !Array.isArray(entries)) {
        return res.status(400).json({ message: 'entries array is required' });
      }

      const organizationId = entries[0]?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);

      if (!userResource) {
        return res.status(403).json({ message: 'You are not a resource in this organization' });
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);

      const taskAssignmentCache: Record<number, boolean> = {};
      const validateTaskAssignment = async (taskId: number): Promise<boolean> => {
        if (taskAssignmentCache[taskId] !== undefined) {
          return taskAssignmentCache[taskId];
        }
        const assignments = await storage.getTaskResourceAssignments(taskId);
        taskAssignmentCache[taskId] = assignments.some(a => a.resourceId === userResource.id);
        return taskAssignmentCache[taskId];
      };

      const taskBlockedCache: Record<number, boolean> = {};
      const projectBlockedCache: Record<number, boolean> = {};

      const isTaskOrProjectBlocked = async (taskId: number, projectId: number): Promise<boolean> => {
        if (taskBlockedCache[taskId] === undefined) {
          const task = await storage.getTask(taskId);
          taskBlockedCache[taskId] = task?.timesheetBlocked || false;
        }
        if (taskBlockedCache[taskId]) return true;

        if (projectBlockedCache[projectId] === undefined) {
          const project = await storage.getProject(projectId);
          projectBlockedCache[projectId] = project?.timesheetBlocked || false;
        }
        return projectBlockedCache[projectId];
      };

      const closedPeriodCache: Record<string, boolean> = {};
      const isDateClosed = async (entryDate: string): Promise<boolean> => {
        if (closedPeriodCache[entryDate] !== undefined) {
          return closedPeriodCache[entryDate];
        }
        const check = await isDateInClosedPeriodWithGrace(organizationId, entryDate);
        closedPeriodCache[entryDate] = check.closed;
        return check.closed;
      };

      const results = [];
      const errors: { index: number; taskId: number; entryDate: string; message: string }[] = [];

      const maxHours = Number(settings.maxWeeklyHours);
      const weeklyPayloadAccum: Record<string, number> = {};

      for (let idx = 0; idx < entries.length; idx++) {
        const entry = entries[idx];
        const hoursNum = parseFloat(entry.hours);
        if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
          errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Hours must be between 0 and 24' });
          continue;
        }

        if (settings.mandatoryNotes && (!entry.notes || !String(entry.notes).trim())) {
          errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Notes are required for all timesheet entries' });
          continue;
        }

        if (hoursNum > 0 && maxHours) {
          const { startDate: weekStart, endDate: weekEnd } = getWeekBounds(entry.entryDate);
          const weekKey = weekStart;

          if (!(weekKey in weeklyPayloadAccum)) {
            const existingEntries = await storage.getTimesheetEntries(userId, organizationId, weekStart, weekEnd);
            const existingIds = entries.filter(e => e.id).map(e => e.id);
            weeklyPayloadAccum[weekKey] = existingEntries
              .filter(e => !existingIds.includes(e.id))
              .reduce((sum, e) => sum + Number(e.hours || 0), 0);
          }

          const projectedTotal = weeklyPayloadAccum[weekKey] + hoursNum;
          if (projectedTotal > maxHours) {
            errors.push({
              index: idx,
              taskId: entry.taskId,
              entryDate: entry.entryDate,
              message: `Weekly hours would exceed limit of ${maxHours}h (total: ${projectedTotal.toFixed(1)}h)`,
            });
            continue;
          }
          weeklyPayloadAccum[weekKey] += hoursNum;
        }

        if (entry.id) {
          const existing = await storage.getTimesheetEntry(entry.id);
          if (!existing) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Entry not found' });
            continue;
          }

          if (existing.userId !== userId) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'You do not own this entry' });
            continue;
          }

          if (existing.status !== 'Draft' && existing.status !== 'Rejected') {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: `Entry is ${existing.status} and cannot be edited` });
            continue;
          }

          const isBlocked = await isTaskOrProjectBlocked(existing.taskId, existing.projectId);
          if (isBlocked) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Task or project is blocked for timesheet entries' });
            continue;
          }

          const isPeriodClosed = await isDateClosed(existing.entryDate);
          if (isPeriodClosed) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'This date is in a closed period' });
            continue;
          }

          const beforeSnapshot = { hours: existing.hours, notes: existing.notes };
          const updated = await storage.updateTimesheetEntry(entry.id, {
            hours: String(hoursNum),
            notes: entry.notes,
          });
          results.push(updated);

          await logTimesheetAudit({
            organizationId,
            entryId: entry.id,
            action: 'update',
            actorId: userId,
            before: beforeSnapshot,
            after: { hours: String(hoursNum), notes: entry.notes },
          });
        } else if (hoursNum > 0) {
          const isAssigned = await validateTaskAssignment(entry.taskId);
          if (!isAssigned) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'You are not assigned to this task' });
            continue;
          }

          const isBlocked = await isTaskOrProjectBlocked(entry.taskId, entry.projectId);
          if (isBlocked) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'Task or project is blocked for timesheet entries' });
            continue;
          }

          const isPeriodClosed = await isDateClosed(entry.entryDate);
          if (isPeriodClosed) {
            errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: 'This date is in a closed period' });
            continue;
          }

          const existingEntry = await storage.findTimesheetEntry(
            userResource.id, 
            entry.taskId, 
            entry.entryDate
          );

          if (existingEntry) {
            if (existingEntry.status === 'Draft' || existingEntry.status === 'Rejected') {
              const beforeSnapshot = { hours: existingEntry.hours, notes: existingEntry.notes };
              const updated = await storage.updateTimesheetEntry(existingEntry.id, {
                hours: String(hoursNum),
                notes: entry.notes,
              });
              results.push(updated);

              await logTimesheetAudit({
                organizationId,
                entryId: existingEntry.id,
                action: 'update',
                actorId: userId,
                before: beforeSnapshot,
                after: { hours: String(hoursNum), notes: entry.notes },
              });
            } else {
              errors.push({ index: idx, taskId: entry.taskId, entryDate: entry.entryDate, message: `Entry is ${existingEntry.status} and cannot be edited` });
            }
            continue;
          }

          const created = await storage.createTimesheetEntry({
            organizationId: entry.organizationId,
            userId,
            resourceId: userResource.id,
            taskId: entry.taskId,
            projectId: entry.projectId,
            entryDate: entry.entryDate,
            hours: String(entry.hours),
            notes: entry.notes,
            status: 'Draft',
          });
          results.push(created);

          await logTimesheetAudit({
            organizationId,
            entryId: created.id,
            action: 'create',
            actorId: userId,
            after: { hours: String(entry.hours), notes: entry.notes, taskId: entry.taskId, entryDate: entry.entryDate },
          });
        }
      }

      if (errors.length > 0 && results.length === 0) {
        return res.status(400).json({ message: 'All entries failed validation', errors, entries: [] });
      }

      res.status(201).json({ entries: results, errors });
    } catch (error) {
      console.error('Error bulk upserting timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to save timesheet entries' : classified.message });
    }
  });

  // Update timesheet entry
  app.put('/api/timesheets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);

      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      if (entry.userId !== userId) {
        return res.status(403).json({ message: 'You can only edit your own timesheet entries' });
      }

      if (entry.status !== 'Draft') {
        return res.status(400).json({ message: 'Only draft entries can be edited' });
      }

      const task = await storage.getTask(entry.taskId);
      if (task?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this task' });
      }

      const project = await storage.getProject(entry.projectId);
      if (project?.timesheetBlocked) {
        return res.status(403).json({ message: 'Timesheet entries are blocked for this project' });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot edit entries in a closed period' });
      }

      const { hours, notes } = req.body;

      if (hours !== undefined) {
        const hoursNum = parseFloat(hours);
        if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
          return res.status(400).json({ message: 'Hours must be between 0 and 24' });
        }
      }

      const settings = await getEffectiveTimesheetSettings(entry.organizationId);
      const effectiveNotes = notes !== undefined ? notes : entry.notes;
      const effectiveHours = hours !== undefined ? parseFloat(hours) : Number(entry.hours || 0);
      if (settings?.mandatoryNotes && (!effectiveNotes || !effectiveNotes.trim())) {
        return res.status(400).json({ message: 'Notes are required for all timesheet entries' });
      }

      if (hours !== undefined) {
        const weekLimitCheck = await checkWeeklyHourLimits(userId, entry.organizationId, entry.entryDate, effectiveHours, id);
        if (!weekLimitCheck.ok) {
          return res.status(400).json({ message: weekLimitCheck.message });
        }
      }

      const beforeSnapshot = { hours: entry.hours, notes: entry.notes };
      const updated = await storage.updateTimesheetEntry(id, {
        hours: hours !== undefined ? String(parseFloat(hours)) : undefined,
        notes,
      });

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'update',
        actorId: userId,
        before: beforeSnapshot,
        after: { hours: hours !== undefined ? String(parseFloat(hours)) : entry.hours, notes: notes ?? entry.notes },
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update timesheet entry' : classified.message });
    }
  });

  // Delete timesheet entry
  app.delete('/api/timesheets/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);

      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      if (entry.userId !== userId) {
        return res.status(403).json({ message: 'You can only delete your own timesheet entries' });
      }

      if (entry.status !== 'Draft') {
        return res.status(400).json({ message: 'Only draft entries can be deleted' });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot delete entries in a closed period' });
      }

      await storage.deleteTimesheetEntry(id);

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'delete',
        actorId: userId,
        before: { hours: entry.hours, notes: entry.notes, taskId: entry.taskId, entryDate: entry.entryDate },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete timesheet entry' : classified.message });
    }
  });

  // Submit timesheet week for approval
  app.post('/api/timesheets/submit-week', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, startDate, endDate } = req.body;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const closedPeriods = await storage.getClosedPeriodsForDateRange(organizationId, startDate, endDate);
      if (closedPeriods.length > 0) {
        const settings = await getEffectiveTimesheetSettings(organizationId);
        const graceDays = settings?.gracePeriodDays || 0;
        let allInGrace = true;
        if (graceDays > 0) {
          const now = new Date();
          for (const period of closedPeriods) {
            if (period.closedAt) {
              const graceEnd = new Date(period.closedAt);
              graceEnd.setDate(graceEnd.getDate() + graceDays);
              if (now > graceEnd) { allInGrace = false; break; }
            } else { allInGrace = false; break; }
          }
        } else { allInGrace = false; }
        if (!allInGrace) {
          return res.status(403).json({ 
            message: 'Cannot submit entries in a closed period. Some dates in this week are locked.',
            closedPeriods: closedPeriods.map(p => p.name)
          });
        }
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);

      if (settings?.mandatoryNotes) {
        const draftEntries = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
        const drafts = draftEntries.filter(e => e.status === 'Draft');
        const missingNotes = drafts.filter(e => !e.notes || !e.notes.trim());
        if (missingNotes.length > 0) {
          return res.status(400).json({ message: 'All timesheet entries must have notes before submission' });
        }
      }

      const allEntriesForHourCheck = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
      const totalHours = allEntriesForHourCheck.reduce((sum, e) => sum + Number(e.hours || 0), 0);

      if (settings?.maxWeeklyHours) {
        const maxHours = Number(settings.maxWeeklyHours);
        if (totalHours > maxHours) {
          return res.status(400).json({ message: `Weekly hours (${totalHours}) exceed maximum allowed (${maxHours})` });
        }
      }

      if (settings?.minWeeklyHours) {
        const minHours = Number(settings.minWeeklyHours);
        if (totalHours < minHours) {
          return res.status(400).json({ message: `Weekly hours (${totalHours}) are below minimum required (${minHours})` });
        }
      }

      const preSubmitEntries = await storage.getTimesheetEntries(userId, organizationId, startDate, endDate);
      const draftEntries = preSubmitEntries.filter(e => e.status === 'Draft');

      await storage.submitTimesheetWeek(userId, organizationId, startDate, endDate);

      for (const entry of draftEntries) {
        await logTimesheetAudit({
          organizationId,
          entryId: entry.id,
          action: 'submit',
          actorId: userId,
          before: { status: 'Draft', hours: entry.hours, notes: entry.notes },
          after: { status: 'Submitted', hours: entry.hours, notes: entry.notes },
          metadata: { startDate, endDate, taskId: entry.taskId, entryDate: entry.entryDate },
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error submitting timesheet week:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to submit timesheet week' : classified.message });
    }
  });

  // Bulk approve timesheet entries (single DB round-trip)
  app.post('/api/timesheets/bulk-approve', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { ids, organizationId } = req.body as { ids: number[]; organizationId: number };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'ids must be a non-empty array' });
      }
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      const isApprover = userResource?.isApprover === true;
      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      if (!isApprover && activeDelegations.length > 0) {
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        for (const entryId of ids) {
          const entry = await storage.getTimesheetEntry(entryId);
          if (entry) {
            const entryResource = resources.find(r => r.id === entry.resourceId);
            if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
              return res.status(403).json({ message: `Entry ${entryId} is outside your delegated approval scope` });
            }
          }
        }
      }

      const approved = await storage.bulkApproveTimesheetEntries(ids, userId, organizationId);

      for (const entry of approved) {
        await logTimesheetAudit({
          organizationId,
          entryId: entry.id,
          action: 'approve',
          actorId: userId,
          targetUserId: entry.userId,
          before: { status: 'Submitted' },
          after: { status: 'Approved' },
        });
      }

      res.json({ approved: approved.length, entries: approved });
    } catch (error) {
      console.error('Error bulk approving timesheet entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to bulk approve timesheet entries' : classified.message });
    }
  });

  app.post('/api/timesheets/:id/approve', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const entry = await storage.getTimesheetEntry(id);

      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, entry.organizationId);
      const isApprover = userResource?.isApprover === true;

      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to approve timesheets' });
      }

      if (!isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated approval scope' });
        }
      }

      if (entry.status !== 'Submitted') {
        return res.status(400).json({ message: `Cannot approve entry with status "${entry.status}". Only submitted entries can be approved.` });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot approve entries in a closed period' });
      }

      const updated = await storage.approveTimesheetEntry(id, userId);

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'approve',
        actorId: userId,
        targetUserId: entry.userId,
        before: { status: 'Submitted' },
        after: { status: 'Approved' },
      });

      res.json(updated);
    } catch (error) {
      console.error('Error approving timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to approve timesheet entry' : classified.message });
    }
  });

  // Reject timesheet entry
  app.post('/api/timesheets/:id/reject', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const { rejectionReason } = req.body;

      const entry = await storage.getTimesheetEntry(id);

      if (!entry) {
        return res.status(404).json({ message: 'Timesheet entry not found' });
      }

      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, entry.organizationId);
      const isApprover = userResource?.isApprover === true;

      if (!isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'You are not authorized to reject timesheets' });
      }

      if (!isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated approval scope' });
        }
      }

      if (entry.status !== 'Submitted') {
        return res.status(400).json({ message: `Cannot reject entry with status "${entry.status}". Only submitted entries can be rejected.` });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(entry.organizationId, entry.entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot reject entries in a closed period' });
      }

      const updated = await storage.rejectTimesheetEntry(id, rejectionReason || '');

      await logTimesheetAudit({
        organizationId: entry.organizationId,
        entryId: id,
        action: 'reject',
        actorId: userId,
        targetUserId: entry.userId,
        before: { status: 'Submitted' },
        after: { status: 'Rejected', rejectionReason: rejectionReason || '' },
      });

      res.json(updated);
    } catch (error) {
      console.error('Error rejecting timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to reject timesheet entry' : classified.message });
    }
  });

  app.get('/api/timesheets/my-report', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const entriesWithDetails = await storage.getTimesheetEntriesWithDetails(userId, organizationId, startDate, endDate);

      const enrichedEntries = entriesWithDetails.map(({ entry, task, project }) => ({
        ...entry,
        task,
        project
      }));

      const totalHours = enrichedEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);

      const byStatus: Record<string, number> = {};
      const byProject: Record<string, { projectId: number; projectName: string; hours: number; entries: number }> = {};
      const byWeek: Record<string, number> = {};

      for (const entry of enrichedEntries) {
        const status = entry.status || 'Draft';
        byStatus[status] = (byStatus[status] || 0) + Number(entry.hours || 0);

        const projectKey = String(entry.projectId);
        if (!byProject[projectKey]) {
          byProject[projectKey] = {
            projectId: entry.projectId,
            projectName: entry.project?.name || 'Unknown',
            hours: 0,
            entries: 0
          };
        }
        byProject[projectKey].hours += Number(entry.hours || 0);
        byProject[projectKey].entries += 1;

        const entryDate = new Date(entry.entryDate + 'T00:00:00');
        const weekStart = new Date(entryDate);
        const day = weekStart.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        weekStart.setDate(weekStart.getDate() + diff);
        const weekKey = weekStart.toISOString().split('T')[0];
        byWeek[weekKey] = (byWeek[weekKey] || 0) + Number(entry.hours || 0);
      }

      res.json({
        totalHours,
        totalEntries: enrichedEntries.length,
        byStatus,
        byProject: Object.values(byProject).sort((a, b) => b.hours - a.hours),
        byWeek,
        entries: enrichedEntries
      });
    } catch (error) {
      console.error('Error getting timesheet report:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet report' : classified.message });
    }
  });

  // ===== Timesheet Periods (Period Closing/Locking) =====

  // Get all timesheet periods for organization (approvers only)
  app.get('/api/timesheet-periods', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Verify user belongs to this organization
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);

      if (!userResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const periods = await storage.getTimesheetPeriods(organizationId);
      res.json(periods);
    } catch (error) {
      console.error('Error getting timesheet periods:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet periods' : classified.message });
    }
  });

  // Get closed periods for a date range (for checking if dates are editable)
  app.get('/api/timesheet-periods/closed', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const periods = await storage.getClosedPeriodsForDateRange(organizationId, startDate, endDate);
      const settings = await getEffectiveTimesheetSettings(organizationId);
      const graceDays = settings?.gracePeriodDays || 0;

      const periodsWithGrace = periods.map(p => {
        let inGracePeriod = false;
        let graceEndDate: string | null = null;
        if (graceDays > 0 && p.closedAt) {
          const graceEnd = new Date(p.closedAt);
          graceEnd.setDate(graceEnd.getDate() + graceDays);
          graceEndDate = graceEnd.toISOString();
          inGracePeriod = new Date() <= graceEnd;
        }
        return { ...p, inGracePeriod, graceEndDate, gracePeriodDays: graceDays };
      });

      res.json(periodsWithGrace);
    } catch (error) {
      console.error('Error getting closed periods:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get closed periods' : classified.message });
    }
  });

  // Create a new timesheet period (approvers only)
  app.post('/api/timesheet-periods', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, name, startDate, endDate, notes } = req.body;

      if (!organizationId || !name || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, name, startDate, and endDate are required' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);

      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to manage timesheet periods' });
      }

      const period = await storage.createTimesheetPeriod({
        organizationId,
        name,
        startDate,
        endDate,
        notes,
        status: 'open',
        createdBy: userId,
      });

      res.status(201).json(period);
    } catch (error) {
      console.error('Error creating timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create timesheet period' : classified.message });
    }
  });

  // Close a timesheet period (approvers only)
  app.post('/api/timesheet-periods/:id/close', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const period = await storage.getTimesheetPeriod(id);

      if (!period) {
        return res.status(404).json({ message: 'Timesheet period not found' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(period.organizationId);
      const userResource = resources.find(r => r.userId === userId);

      if (!(await hasTimesheetAdminAccess(userId, period.organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to close timesheet periods' });
      }

      const updated = await storage.closeTimesheetPeriod(id, userId);
      res.json(updated);
    } catch (error) {
      console.error('Error closing timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to close timesheet period' : classified.message });
    }
  });

  // Reopen a timesheet period (approvers only)
  app.post('/api/timesheet-periods/:id/reopen', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const period = await storage.getTimesheetPeriod(id);

      if (!period) {
        return res.status(404).json({ message: 'Timesheet period not found' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(period.organizationId);
      const userResource = resources.find(r => r.userId === userId);

      if (!(await hasTimesheetAdminAccess(userId, period.organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to reopen timesheet periods' });
      }

      const updated = await storage.reopenTimesheetPeriod(id, userId);
      res.json(updated);
    } catch (error) {
      console.error('Error reopening timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to reopen timesheet period' : classified.message });
    }
  });

  // Delete a timesheet period (approvers only)
  app.delete('/api/timesheet-periods/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const period = await storage.getTimesheetPeriod(id);

      if (!period) {
        return res.status(404).json({ message: 'Timesheet period not found' });
      }

      // Verify user is an approver
      const resources = await storage.getResources(period.organizationId);
      const userResource = resources.find(r => r.userId === userId);

      if (!(await hasTimesheetAdminAccess(userId, period.organizationId))) {
        return res.status(403).json({ message: 'You must be an admin or approver to delete timesheet periods' });
      }

      await storage.deleteTimesheetPeriod(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting timesheet period:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete timesheet period' : classified.message });
    }
  });

  // ===== Timesheet Settings (Org-level Policies) =====

  app.get('/api/timesheet-settings', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const settings = await storage.getTimesheetSettings(organizationId);
      res.json(settings || {
        organizationId,
        minWeeklyHours: "0",
        maxWeeklyHours: "50",
        overtimeThreshold: "40",
        gracePeriodDays: 0,
        mandatoryNotes: false,
      });
    } catch (error) {
      console.error('Error getting timesheet settings:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get timesheet settings' : classified.message });
    }
  });

  app.put('/api/timesheet-settings', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, minWeeklyHours, maxWeeklyHours, overtimeThreshold, gracePeriodDays, mandatoryNotes } = req.body;
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can manage timesheet settings' });
      }

      const settings = await storage.upsertTimesheetSettings({
        organizationId,
        minWeeklyHours: minWeeklyHours !== undefined ? String(minWeeklyHours) : undefined,
        maxWeeklyHours: maxWeeklyHours !== undefined ? String(maxWeeklyHours) : undefined,
        overtimeThreshold: overtimeThreshold !== undefined ? String(overtimeThreshold) : undefined,
        gracePeriodDays: gracePeriodDays !== undefined ? Number(gracePeriodDays) : undefined,
        mandatoryNotes: mandatoryNotes !== undefined ? Boolean(mandatoryNotes) : undefined,
      });

      await logTimesheetAudit({
        organizationId,
        action: 'update_settings',
        actorId: userId,
        after: { minWeeklyHours, maxWeeklyHours, overtimeThreshold, gracePeriodDays, mandatoryNotes },
      });

      res.json(settings);
    } catch (error) {
      console.error('Error updating timesheet settings:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update timesheet settings' : classified.message });
    }
  });

  // ===== Timesheet Reminder Settings =====

  app.get('/api/timesheet-reminder-settings', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const [settings] = await db.select()
        .from(timesheetReminderSettings)
        .where(eq(timesheetReminderSettings.organizationId, organizationId));

      res.json(settings || {
        organizationId,
        enabled: true,
        emailEnabled: true,
        notificationEnabled: true,
        submissionReminderDays: [4, 5, 8],
        approvalReminderDays: 2,
        escalationThresholdDays: 5,
        frequencyCap: 3,
        digestEnabled: true,
        digestDay: 1,
      });
    } catch (error) {
      console.error('Error getting reminder settings:', error);
      res.status(500).json({ message: 'Failed to get reminder settings' });
    }
  });

  app.put('/api/timesheet-reminder-settings', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, enabled, emailEnabled, notificationEnabled, submissionReminderDays, approvalReminderDays, escalationThresholdDays, frequencyCap, digestEnabled, digestDay } = req.body;
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage reminder settings' });
      }

      const validDays = [4, 5, 8];
      const sanitized: Record<string, any> = {};
      if (enabled !== undefined) sanitized.enabled = Boolean(enabled);
      if (emailEnabled !== undefined) sanitized.emailEnabled = Boolean(emailEnabled);
      if (notificationEnabled !== undefined) sanitized.notificationEnabled = Boolean(notificationEnabled);
      if (submissionReminderDays !== undefined) {
        if (!Array.isArray(submissionReminderDays) || !submissionReminderDays.every((d: number) => validDays.includes(d))) {
          return res.status(400).json({ message: 'submissionReminderDays must be array of 4, 5, or 8' });
        }
        sanitized.submissionReminderDays = submissionReminderDays;
      }
      if (approvalReminderDays !== undefined) {
        const v = Number(approvalReminderDays);
        if (!Number.isInteger(v) || v < 1 || v > 14) return res.status(400).json({ message: 'approvalReminderDays must be 1-14' });
        sanitized.approvalReminderDays = v;
      }
      if (escalationThresholdDays !== undefined) {
        const v = Number(escalationThresholdDays);
        if (!Number.isInteger(v) || v < 1 || v > 30) return res.status(400).json({ message: 'escalationThresholdDays must be 1-30' });
        sanitized.escalationThresholdDays = v;
      }
      if (frequencyCap !== undefined) {
        const v = Number(frequencyCap);
        if (!Number.isInteger(v) || v < 1 || v > 10) return res.status(400).json({ message: 'frequencyCap must be 1-10' });
        sanitized.frequencyCap = v;
      }
      if (digestEnabled !== undefined) sanitized.digestEnabled = Boolean(digestEnabled);
      if (digestDay !== undefined) {
        const v = Number(digestDay);
        if (!Number.isInteger(v) || v < 1 || v > 5) return res.status(400).json({ message: 'digestDay must be 1-5 (Mon-Fri)' });
        sanitized.digestDay = v;
      }
      if (req.body.scheduledHour !== undefined) {
        const v = Number(req.body.scheduledHour);
        if (!Number.isInteger(v) || v < 0 || v > 23) return res.status(400).json({ message: 'scheduledHour must be 0-23' });
        sanitized.scheduledHour = v;
      }
      if (req.body.scheduledMinute !== undefined) {
        const v = Number(req.body.scheduledMinute);
        if (!Number.isInteger(v) || ![0, 15, 30, 45].includes(v)) return res.status(400).json({ message: 'scheduledMinute must be 0, 15, 30, or 45' });
        sanitized.scheduledMinute = v;
      }

      const [existing] = await db.select()
        .from(timesheetReminderSettings)
        .where(eq(timesheetReminderSettings.organizationId, organizationId));

      let result;
      if (existing) {
        [result] = await db.update(timesheetReminderSettings)
          .set({ ...sanitized, updatedAt: new Date() })
          .where(eq(timesheetReminderSettings.organizationId, organizationId))
          .returning();
      } else {
        [result] = await db.insert(timesheetReminderSettings)
          .values({ organizationId, ...sanitized })
          .returning();
      }

      res.json(result);
    } catch (error) {
      console.error('Error updating reminder settings:', error);
      res.status(500).json({ message: 'Failed to update reminder settings' });
    }
  });

  app.post('/api/timesheet-reminder-snooze', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, weekStart, durationHours } = req.body;
      if (!organizationId || !weekStart || !durationHours) {
        return res.status(400).json({ message: 'organizationId, weekStart, and durationHours are required' });
      }

      const hours = Number(durationHours);
      if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
        return res.status(400).json({ message: 'durationHours must be between 1 and 168' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return res.status(400).json({ message: 'weekStart must be a valid date (YYYY-MM-DD)' });
      }

      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const { snoozeReminder } = await import('./services/timesheetReminderEngine');
      await snoozeReminder(userId, organizationId, weekStart, hours);

      res.json({ success: true, snoozedUntil: new Date(Date.now() + Number(durationHours) * 60 * 60 * 1000) });
    } catch (error) {
      console.error('Error snoozing reminder:', error);
      res.status(500).json({ message: 'Failed to snooze reminder' });
    }
  });

  app.post('/api/timesheet-reminder-send-now', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId } = req.body;
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins can trigger reminders' });
      }

      const { runTimesheetRemindersForOrg } = await import('./services/timesheetReminderEngine');
      const result = await runTimesheetRemindersForOrg(organizationId);

      const total = result.submissionReminders + result.approvalReminders + result.escalations + result.digestsSent;
      res.json({
        success: true,
        sent: total,
        breakdown: {
          submissionReminders: result.submissionReminders,
          approvalReminders: result.approvalReminders,
          escalations: result.escalations,
          digestsSent: result.digestsSent,
        },
        errors: result.errors,
      });
    } catch (error) {
      console.error('Error sending reminders now:', error);
      res.status(500).json({ message: 'Failed to send reminders' });
    }
  });

  // ===== Timesheet Audit Log =====

  app.get('/api/timesheet-audit-log', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can view audit logs' });
      }

      const entryId = req.query.entryId ? Number(req.query.entryId) : undefined;
      const actorId = req.query.actorId as string | undefined;
      const action = req.query.action as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const logs = await storage.getTimesheetAuditLogs(organizationId, { entryId, actorId, action, limit, offset });
      res.json(logs);
    } catch (error) {
      console.error('Error getting timesheet audit log:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get audit log' : classified.message });
    }
  });

  app.get('/api/timesheet-audit-log/entry/:entryId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const entryId = Number(req.params.entryId);
      const entry = await storage.getTimesheetEntry(entryId);
      if (!entry) return res.status(404).json({ message: 'Entry not found' });

      const resources = await storage.getResources(entry.organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, entry.organizationId)) && entry.userId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const logs = await storage.getTimesheetAuditLogsForEntry(entryId);
      res.json(logs);
    } catch (error) {
      console.error('Error getting entry audit log:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get entry audit log' : classified.message });
    }
  });

  // ===== Proxy Timesheet Entry =====

  app.post('/api/timesheets/proxy', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, targetResourceId, taskId, projectId, entryDate, hours, notes } = req.body;

      if (!organizationId || !targetResourceId || !taskId || !projectId || !entryDate || hours === undefined) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const resources = await storage.getResources(organizationId);
      const actorResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can create proxy entries' });
      }

      const targetResource = resources.find(r => r.id === targetResourceId);
      if (!targetResource) {
        return res.status(404).json({ message: 'Target resource not found' });
      }

      if (!targetResource.userId) {
        return res.status(400).json({ message: 'Target resource does not have an associated user account' });
      }

      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      if (task.timesheetBlocked) {
        return res.status(403).json({ message: 'This task is blocked for timesheet entries' });
      }
      if (project.timesheetBlocked) {
        return res.status(403).json({ message: 'This project is blocked for timesheet entries' });
      }

      const hoursNum = parseFloat(hours);
      if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
        return res.status(400).json({ message: 'Hours must be between 0 and 24' });
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);
      if (settings.mandatoryNotes && (!notes || !notes.trim())) {
        return res.status(400).json({ message: 'Notes are required for all timesheet entries' });
      }

      const weekLimitCheck = await checkWeeklyHourLimits(targetResource.userId, organizationId, entryDate, hoursNum);
      if (!weekLimitCheck.ok) {
        return res.status(400).json({ message: weekLimitCheck.message });
      }

      const periodCheck = await isDateInClosedPeriodWithGrace(organizationId, entryDate);
      if (periodCheck.closed) {
        return res.status(403).json({ message: 'Cannot create entries in a closed period' });
      }

      const entry = await storage.createTimesheetEntry({
        organizationId,
        userId: targetResource.userId!,
        resourceId: targetResourceId,
        taskId,
        projectId,
        entryDate,
        hours: String(hoursNum),
        notes,
        status: 'Draft',
        proxyUserId: userId,
      });

      await logTimesheetAudit({
        organizationId,
        entryId: entry.id,
        action: 'proxy_create',
        actorId: userId,
        targetUserId: targetResource.userId!,
        after: { hours: String(hoursNum), notes, taskId, projectId, entryDate },
        metadata: { proxyUserId: userId, targetResourceId },
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating proxy timesheet entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create proxy entry' : classified.message });
    }
  });

  // ===== Compliance Reporting =====

  app.get('/api/timesheet-compliance', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const projectId = req.query.projectId ? Number(req.query.projectId) : null;
      const resourceId = req.query.resourceId ? Number(req.query.resourceId) : null;
      const department = req.query.department ? String(req.query.department) : null;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const actorResource = resources.find(r => r.userId === userId);
      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins and approvers can view compliance reports' });
      }

      let allEntries = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);

      if (projectId) {
        allEntries = allEntries.filter(({ entry }) => entry.projectId === projectId);
      }

      if (resourceId) {
        allEntries = allEntries.filter(({ entry }) => entry.resourceId === resourceId);
      }

      let activeResources = resources.filter(r => r.userId);
      if (resourceId) {
        activeResources = activeResources.filter(r => r.id === resourceId);
      }
      if (department) {
        const deptResourceIds = new Set(activeResources.filter(r => r.department === department).map(r => r.id));
        activeResources = activeResources.filter(r => deptResourceIds.has(r.id));
        allEntries = allEntries.filter(({ entry }) => deptResourceIds.has(entry.resourceId));
      }

      const settings = await getEffectiveTimesheetSettings(organizationId);
      const overtimeThreshold = Number(settings?.overtimeThreshold || 40);
      const totalResources = activeResources.length;

      const byUser: Record<string, { userId: string; resourceName: string; totalHours: number; entries: number; submitted: number; approved: number; rejected: number; draft: number; overtime: boolean }> = {};

      for (const r of activeResources) {
        if (r.userId) {
          byUser[r.userId] = {
            userId: r.userId,
            resourceName: r.displayName,
            totalHours: 0,
            entries: 0,
            submitted: 0,
            approved: 0,
            rejected: 0,
            draft: 0,
            overtime: false,
          };
        }
      }

      let totalSubmitted = 0, totalApproved = 0, totalRejected = 0, totalDraft = 0;
      let lateSubmissions = 0;
      let overdueApprovals = 0;
      const endDateObj = new Date(endDate + 'T23:59:59Z');
      const now = new Date();
      const approvalThresholdDays = 3;

      for (const { entry } of allEntries) {
        const u = byUser[entry.userId];
        if (u) {
          const hrs = Number(entry.hours || 0);
          u.totalHours += hrs;
          u.entries += 1;
          if (entry.status === 'Submitted') {
            u.submitted++; totalSubmitted++;
            if (entry.submittedAt && new Date(entry.submittedAt) > endDateObj) {
              lateSubmissions++;
            }
            const submittedDate = entry.submittedAt ? new Date(entry.submittedAt) : null;
            if (submittedDate) {
              const daysSinceSubmit = Math.floor((now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysSinceSubmit > approvalThresholdDays) {
                overdueApprovals++;
              }
            }
          }
          else if (entry.status === 'Approved') { u.approved++; totalApproved++; }
          else if (entry.status === 'Rejected') { u.rejected++; totalRejected++; }
          else {
            u.draft++; totalDraft++;
            if (now > endDateObj) {
              lateSubmissions++;
            }
          }
        }
      }

      for (const u of Object.values(byUser)) {
        u.overtime = u.totalHours > overtimeThreshold;
      }

      const usersWithEntries = Object.values(byUser).filter(u => u.entries > 0).length;
      const usersWithNoEntries = totalResources - usersWithEntries;
      const submissionRate = totalResources > 0 ? Math.round((usersWithEntries / totalResources) * 100) : 0;

      const totalEntries = totalSubmitted + totalApproved + totalRejected + totalDraft;
      const approvalRate = (totalSubmitted + totalApproved + totalRejected) > 0
        ? Math.round((totalApproved / (totalSubmitted + totalApproved + totalRejected)) * 100)
        : 0;
      const rejectionRate = (totalSubmitted + totalApproved + totalRejected) > 0
        ? Math.round((totalRejected / (totalSubmitted + totalApproved + totalRejected)) * 100)
        : 0;

      const overtimeUsers = Object.values(byUser).filter(u => u.overtime).length;

      res.json({
        summary: {
          totalResources,
          usersWithEntries,
          usersWithNoEntries,
          submissionRate,
          totalEntries,
          totalSubmitted,
          totalApproved,
          totalRejected,
          totalDraft,
          approvalRate,
          rejectionRate,
          overtimeUsers,
          overtimeThreshold,
          lateSubmissions,
          overdueApprovals,
        },
        byUser: Object.values(byUser).sort((a, b) => b.totalHours - a.totalHours),
      });
    } catch (error) {
      console.error('Error getting compliance report:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get compliance report' : classified.message });
    }
  });

  // ===== Approval Delegations =====

  app.get('/api/approval-delegations/is-delegate', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      res.json({ isDelegate: activeDelegations.length > 0 });
    } catch (error) {
      console.error('Error checking delegate status:', error);
      res.status(500).json({ message: 'Failed to check delegate status' });
    }
  });

  app.get('/api/approval-delegations', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!userResource?.isApprover && !(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const delegations = await storage.getApprovalDelegations(organizationId);
      const enriched = delegations.map(d => {
        const delegatorRes = resources.find(r => r.userId === d.delegatorId);
        const delegateRes = resources.find(r => r.userId === d.delegateId);
        return {
          ...d,
          delegatorName: delegatorRes?.displayName || delegatorRes?.name || 'Unknown',
          delegateName: delegateRes?.displayName || delegateRes?.name || 'Unknown',
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error('Error getting delegations:', error);
      res.status(500).json({ message: 'Failed to get delegations' });
    }
  });

  app.post('/api/approval-delegations', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, delegateId, startDate, endDate } = req.body;
      if (!organizationId || !delegateId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, delegateId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      if (!userResource?.isApprover) {
        return res.status(403).json({ message: 'Only approvers can create delegations' });
      }

      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({ message: 'Start date must be before or equal to end date' });
      }

      if (delegateId === userId) {
        return res.status(400).json({ message: 'Cannot delegate to yourself' });
      }

      const delegateResource = resources.find(r => r.userId === delegateId);
      if (!delegateResource) {
        return res.status(400).json({ message: 'Delegate must be a resource in the organization' });
      }

      const delegation = await storage.createApprovalDelegation({
        organizationId,
        delegatorId: userId,
        delegateId,
        startDate,
        endDate,
        isActive: true,
      });

      await logTimesheetAudit({
        organizationId,
        action: 'delegation_create',
        actorId: userId,
        after: { delegateId, startDate, endDate },
      });

      res.status(201).json(delegation);
    } catch (error) {
      console.error('Error creating delegation:', error);
      res.status(500).json({ message: 'Failed to create delegation' });
    }
  });

  app.post('/api/approval-delegations/:id/revoke', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = Number(req.params.id);
      const delegations = await storage.getApprovalDelegations(Number(req.body.organizationId || 0));
      const delegation = delegations.find(d => d.id === id);
      if (!delegation) return res.status(404).json({ message: 'Delegation not found' });

      if (delegation.delegatorId !== userId && !(await hasTimesheetAdminAccess(userId, delegation.organizationId))) {
        return res.status(403).json({ message: 'Not authorized to revoke this delegation' });
      }

      const revoked = await storage.revokeApprovalDelegation(id);

      await logTimesheetAudit({
        organizationId: delegation.organizationId,
        action: 'delegation_revoke',
        actorId: userId,
        before: { delegateId: delegation.delegateId, startDate: delegation.startDate, endDate: delegation.endDate },
      });

      res.json(revoked);
    } catch (error) {
      console.error('Error revoking delegation:', error);
      res.status(500).json({ message: 'Failed to revoke delegation' });
    }
  });

  // ===== Rejection Templates =====

  app.get('/api/rejection-templates', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: 'organizationId is required' });

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      if (!userResource?.isApprover && !isAdmin && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      let templates = await storage.getRejectionTemplates(organizationId);
      if (templates.length === 0) {
        const defaults = [
          { name: "Missing Details", text: "Please provide more details about the work performed, including specific tasks and deliverables.", category: "general" },
          { name: "Incorrect Hours", text: "The hours reported do not match the expected effort. Please review and correct.", category: "hours" },
          { name: "Wrong Project", text: "Time was logged against the wrong project or task. Please reassign to the correct project.", category: "assignment" },
          { name: "Missing Notes", text: "Notes are required for this entry. Please add a description of the work completed.", category: "general" },
          { name: "Exceeds Estimate", text: "Hours exceed the task estimate. Please provide justification or split across appropriate tasks.", category: "hours" },
          { name: "Duplicate Entry", text: "This appears to be a duplicate of another timesheet entry. Please review and remove if confirmed.", category: "general" },
        ];
        for (const d of defaults) {
          await storage.createRejectionTemplate({ organizationId, ...d });
        }
        templates = await storage.getRejectionTemplates(organizationId);
      }
      res.json(templates);
    } catch (error) {
      console.error('Error getting rejection templates:', error);
      res.status(500).json({ message: 'Failed to get rejection templates' });
    }
  });

  app.post('/api/rejection-templates', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { organizationId, name, text, category } = req.body;
      if (!organizationId || !name || !text) {
        return res.status(400).json({ message: 'organizationId, name, and text are required' });
      }

      if (!(await hasTimesheetAdminAccess(userId, organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage rejection templates' });
      }

      const template = await storage.createRejectionTemplate({ organizationId, name, text, category });
      res.status(201).json(template);
    } catch (error) {
      console.error('Error creating rejection template:', error);
      res.status(500).json({ message: 'Failed to create rejection template' });
    }
  });

  app.put('/api/rejection-templates/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = Number(req.params.id);
      const template = await storage.getRejectionTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });

      if (!(await hasTimesheetAdminAccess(userId, template.organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage rejection templates' });
      }

      const { name, text, category, sortOrder } = req.body;
      const updated = await storage.updateRejectionTemplate(id, { name, text, category, sortOrder });
      res.json(updated);
    } catch (error) {
      console.error('Error updating rejection template:', error);
      res.status(500).json({ message: 'Failed to update rejection template' });
    }
  });

  app.delete('/api/rejection-templates/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const id = Number(req.params.id);
      const template = await storage.getRejectionTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });

      if (!(await hasTimesheetAdminAccess(userId, template.organizationId))) {
        return res.status(403).json({ message: 'Only admins can manage rejection templates' });
      }

      await storage.deleteRejectionTemplate(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting rejection template:', error);
      res.status(500).json({ message: 'Failed to delete rejection template' });
    }
  });

  // ===== Timesheet Comments =====

  app.get('/api/timesheet-comments/:entryId', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const entryId = Number(req.params.entryId);
      const entry = await storage.getTimesheetEntry(entryId);
      if (!entry) return res.status(404).json({ message: 'Entry not found' });

      const orgId = entry.organizationId;
      const resources = await storage.getResources(orgId);
      const userResource = resources.find(r => r.userId === userId);
      const isOwner = entry.userId === userId;
      const isAdmin = await hasTimesheetAdminAccess(userId, orgId);
      const isApprover = userResource?.isApprover === true;
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, orgId);
      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized to view comments for this entry' });
      }

      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated scope' });
        }
      }

      const comments = await storage.getTimesheetComments(entryId);
      res.json(comments);
    } catch (error) {
      console.error('Error getting comments:', error);
      res.status(500).json({ message: 'Failed to get comments' });
    }
  });

  app.post('/api/timesheet-comments', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const { entryId, organizationId, text } = req.body;
      if (!entryId || !organizationId || !text?.trim()) {
        return res.status(400).json({ message: 'entryId, organizationId, and text are required' });
      }

      const entry = await storage.getTimesheetEntry(entryId);
      if (!entry) return res.status(404).json({ message: 'Entry not found' });

      if (entry.organizationId !== organizationId) {
        return res.status(400).json({ message: 'Organization mismatch' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isOwner = entry.userId === userId;
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);
      const isApprover = userResource?.isApprover === true;
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized to comment on this entry' });
      }

      if (!isOwner && !isAdmin && !isApprover && activeDelegations.length > 0) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        if (!entryResource?.managerId || !delegatorIds.includes(entryResource.managerId)) {
          return res.status(403).json({ message: 'This entry is outside your delegated scope' });
        }
      }

      const comment = await storage.createTimesheetComment({
        entryId,
        organizationId,
        userId,
        text: text.trim(),
        commentType: 'comment',
      });
      res.status(201).json(comment);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ message: 'Failed to create comment' });
    }
  });

  // ===== Team Review Dashboard =====

  app.get('/api/timesheets/team-review', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isApprover = userResource?.isApprover === true;
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);

      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      const isDelegateApprover = activeDelegations.length > 0;

      if (!isApprover && !isAdmin && !isDelegateApprover) {
        return res.status(403).json({ message: 'Not authorized to view team review dashboard' });
      }

      const allEntries = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);

      const managerUserIds = new Set<string>();
      managerUserIds.add(userId);
      if (isDelegateApprover) {
        for (const delegation of activeDelegations) {
          managerUserIds.add(delegation.delegatorId);
        }
      }

      let activeResources = resources.filter(r => r.isActive && !r.timesheetHidden && r.userId);
      if (!isAdmin) {
        activeResources = activeResources.filter(r => r.managerId && managerUserIds.has(r.managerId));
      }

      const teamData = activeResources.map(resource => {
        const userEntries = allEntries.filter(({ entry }) => entry.resourceId === resource.id);
        const totalHours = userEntries.reduce((sum, { entry }) => sum + Number(entry.hours || 0), 0);
        const draft = userEntries.filter(({ entry }) => entry.status === 'Draft').length;
        const submitted = userEntries.filter(({ entry }) => entry.status === 'Submitted').length;
        const approved = userEntries.filter(({ entry }) => entry.status === 'Approved').length;
        const rejected = userEntries.filter(({ entry }) => entry.status === 'Rejected').length;

        return {
          resourceId: resource.id,
          userId: resource.userId,
          displayName: resource.displayName,
          email: resource.email,
          department: resource.department,
          title: resource.title,
          photoUrl: resource.photoUrl,
          totalHours,
          entryCount: userEntries.length,
          draft,
          submitted,
          approved,
          rejected,
          submissionStatus: draft > 0 ? 'partial' : submitted > 0 ? 'submitted' : approved === userEntries.length && userEntries.length > 0 ? 'approved' : userEntries.length === 0 ? 'no_entries' : 'mixed',
        };
      });

      const delegatedForUsers = activeDelegations.map(d => d.delegatorId);

      res.json({
        team: teamData.sort((a, b) => b.submitted - a.submitted),
        delegatedForUsers,
        period: { startDate, endDate },
      });
    } catch (error) {
      console.error('Error getting team review:', error);
      res.status(500).json({ message: 'Failed to get team review data' });
    }
  });

  // ===== SLA Metrics =====

  app.get('/api/timesheets/sla-metrics', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      const resources = await storage.getResources(organizationId);
      const userResource = resources.find(r => r.userId === userId);
      const isAdmin = await hasTimesheetAdminAccess(userId, organizationId);
      const isApprover = userResource?.isApprover === true;
      const activeDelegations = await storage.getActiveDelegationsForDelegate(userId, organizationId);
      if (!isAdmin && !isApprover && activeDelegations.length === 0) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const allEntriesRaw = await storage.getAllTimesheetEntriesWithDetails(organizationId, startDate, endDate);
      const slaThresholdDays = 3;

      let filteredEntries = allEntriesRaw;
      if (!isAdmin && !isApprover && activeDelegations.length > 0) {
        const delegatorIds = activeDelegations.map(d => d.delegatorId);
        filteredEntries = allEntriesRaw.filter(({ entry }) => {
          const entryResource = resources.find(r => r.id === entry.resourceId);
          return entryResource?.managerId && delegatorIds.includes(entryResource.managerId);
        });
      }

      const allEntries = filteredEntries;

      let totalTurnaroundMs = 0;
      let resolvedCount = 0;
      let exceedingSla = 0;
      let pendingExceedingSla = 0;
      const now = new Date();

      for (const { entry } of allEntries) {
        if (entry.submittedAt) {
          const resolvedAt = entry.approvedAt || entry.rejectedAt;
          if (resolvedAt) {
            const turnaround = new Date(resolvedAt).getTime() - new Date(entry.submittedAt).getTime();
            totalTurnaroundMs += turnaround;
            resolvedCount++;
            if (turnaround > slaThresholdDays * 24 * 60 * 60 * 1000) {
              exceedingSla++;
            }
          } else if (entry.status === 'Submitted') {
            const waitTime = now.getTime() - new Date(entry.submittedAt).getTime();
            if (waitTime > slaThresholdDays * 24 * 60 * 60 * 1000) {
              pendingExceedingSla++;
            }
          }
        }
      }

      const avgTurnaroundHours = resolvedCount > 0 ? Math.round(totalTurnaroundMs / resolvedCount / (1000 * 60 * 60) * 10) / 10 : 0;
      const avgTurnaroundDays = resolvedCount > 0 ? Math.round(avgTurnaroundHours / 24 * 10) / 10 : 0;

      const managerMetrics: Record<string, { managerId: string; managerName: string; resolvedCount: number; totalTurnaroundMs: number; exceedingSla: number; pendingExceedingSla: number; totalSubmitted: number; totalApproved: number; totalRejected: number; totalPending: number }> = {};

      for (const { entry } of allEntries) {
        const entryResource = resources.find(r => r.id === entry.resourceId);
        const managerId = entryResource?.managerId || 'unassigned';
        const managerResource = resources.find(r => r.userId === managerId);
        const managerName = managerResource?.displayName || managerResource?.name || (managerId === 'unassigned' ? 'Unassigned' : 'Unknown');

        if (!managerMetrics[managerId]) {
          managerMetrics[managerId] = { managerId, managerName, resolvedCount: 0, totalTurnaroundMs: 0, exceedingSla: 0, pendingExceedingSla: 0, totalSubmitted: 0, totalApproved: 0, totalRejected: 0, totalPending: 0 };
        }
        const m = managerMetrics[managerId];

        if (entry.submittedAt) {
          m.totalSubmitted++;
          const resolvedAt = entry.approvedAt || entry.rejectedAt;
          if (resolvedAt) {
            const turnaround = new Date(resolvedAt).getTime() - new Date(entry.submittedAt).getTime();
            m.totalTurnaroundMs += turnaround;
            m.resolvedCount++;
            if (turnaround > slaThresholdDays * 24 * 60 * 60 * 1000) m.exceedingSla++;
          } else if (entry.status === 'Submitted') {
            m.totalPending++;
            const waitTime = now.getTime() - new Date(entry.submittedAt).getTime();
            if (waitTime > slaThresholdDays * 24 * 60 * 60 * 1000) m.pendingExceedingSla++;
          }
        }
        if (entry.status === 'Approved') m.totalApproved++;
        if (entry.status === 'Rejected') m.totalRejected++;
      }

      const byManager = Object.values(managerMetrics).map(m => ({
        managerId: m.managerId,
        managerName: m.managerName,
        avgTurnaroundHours: m.resolvedCount > 0 ? Math.round(m.totalTurnaroundMs / m.resolvedCount / (1000 * 60 * 60) * 10) / 10 : 0,
        avgTurnaroundDays: m.resolvedCount > 0 ? Math.round(m.totalTurnaroundMs / m.resolvedCount / (1000 * 60 * 60 * 24) * 10) / 10 : 0,
        resolvedCount: m.resolvedCount,
        exceedingSla: m.exceedingSla,
        pendingExceedingSla: m.pendingExceedingSla,
        totalSubmitted: m.totalSubmitted,
        totalApproved: m.totalApproved,
        totalRejected: m.totalRejected,
        totalPending: m.totalPending,
      })).sort((a, b) => b.totalSubmitted - a.totalSubmitted);

      res.json({
        avgTurnaroundHours,
        avgTurnaroundDays,
        resolvedCount,
        exceedingSla,
        pendingExceedingSla,
        slaThresholdDays,
        totalSubmitted: allEntries.filter(({ entry }) => entry.submittedAt).length,
        totalApproved: allEntries.filter(({ entry }) => entry.status === 'Approved').length,
        totalRejected: allEntries.filter(({ entry }) => entry.status === 'Rejected').length,
        totalPending: allEntries.filter(({ entry }) => entry.status === 'Submitted').length,
        byManager,
      });
    } catch (error) {
      console.error('Error getting SLA metrics:', error);
      res.status(500).json({ message: 'Failed to get SLA metrics' });
    }
  });

  // ===== Time Categories (Non-Project Time Types) =====

  // Get time categories for organization
  app.get('/api/time-categories', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: 'organizationId is required' });
      }

      // Verify user belongs to this organization (via membership or resource)
      const memberships = await storage.getUserOrganizations(userId);
      const isMember = memberships.some(m => m.organizationId === organizationId);

      // Also check if user has a resource in this organization
      const resources = await storage.getResources(organizationId);
      const hasResource = resources.some(r => r.userId === userId);

      if (!isMember && !hasResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      let categories = await storage.getTimeCategories(organizationId);

      if (categories.length === 0) {
        const defaults = [
          { name: "Vacation", code: "VAC", color: "#10b981", isPaidTime: true, requiresApproval: true, displayOrder: 1 },
          { name: "PTO", code: "PTO", color: "#3b82f6", isPaidTime: true, requiresApproval: true, displayOrder: 2 },
          { name: "Sick Leave", code: "SICK", color: "#ef4444", isPaidTime: true, requiresApproval: false, displayOrder: 3 },
          { name: "Holiday", code: "HOL", color: "#8b5cf6", isPaidTime: true, requiresApproval: false, displayOrder: 4 },
          { name: "Training", code: "TRN", color: "#f59e0b", isPaidTime: true, requiresApproval: true, displayOrder: 5 },
          { name: "Admin Time", code: "ADM", color: "#6b7280", isPaidTime: true, requiresApproval: false, displayOrder: 6 },
          { name: "Unpaid Leave", code: "UNP", color: "#d97706", isPaidTime: false, requiresApproval: true, displayOrder: 7 },
        ];
        for (const cat of defaults) {
          await storage.createTimeCategory({
            organizationId,
            name: cat.name,
            code: cat.code,
            color: cat.color,
            isPaidTime: cat.isPaidTime,
            requiresApproval: cat.requiresApproval,
            displayOrder: cat.displayOrder,
            isBillable: false,
            isActive: true,
          });
        }
        categories = await storage.getTimeCategories(organizationId);
      }

      res.json(categories);
    } catch (error) {
      console.error('Error getting time categories:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get time categories' : classified.message });
    }
  });

  // Create time category (admin only)
  app.post('/api/time-categories', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, name, code, description, color, sortOrder, isPaidTime } = req.body;
      if (!organizationId || !name) {
        return res.status(400).json({ message: 'organizationId and name are required' });
      }

      // Verify user belongs to this organization and is admin
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === organizationId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const category = await storage.createTimeCategory({
        organizationId,
        name,
        code,
        description,
        color,
        sortOrder,
        isPaidTime: isPaidTime ?? true
      });
      res.status(201).json(category);
    } catch (error) {
      console.error('Error creating time category:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create time category' : classified.message });
    }
  });

  // Update time category (admin only)
  app.put('/api/time-categories/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const category = await storage.getTimeCategory(id);
      if (!category) {
        return res.status(404).json({ message: 'Time category not found' });
      }

      // Verify user is admin of this category's organization
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === category.organizationId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const updated = await storage.updateTimeCategory(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error('Error updating time category:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update time category' : classified.message });
    }
  });

  // Delete time category (admin only)
  app.delete('/api/time-categories/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);
      const category = await storage.getTimeCategory(id);
      if (!category) {
        return res.status(404).json({ message: 'Time category not found' });
      }

      // Verify user is admin of this category's organization
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === category.organizationId);
      if (!membership || !['owner', 'org_admin'].includes(membership.role)) {
        return res.status(403).json({ message: 'Admin access required' });
      }

      await storage.deleteTimeCategory(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting time category:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete time category' : classified.message });
    }
  });

  // ===== Non-Project Time Entries =====

  // Get non-project time entries
  app.get('/api/non-project-time', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const organizationId = Number(req.query.organizationId);
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!organizationId || !startDate || !endDate) {
        return res.status(400).json({ message: 'organizationId, startDate, and endDate are required' });
      }

      // Verify user belongs to this organization (via membership or resource)
      const memberships = await storage.getUserOrganizations(userId);
      const isMember = memberships.some(m => m.organizationId === organizationId);

      // Also check if user has a resource in this organization
      const resources = await storage.getResources(organizationId);
      const hasResource = resources.some(r => r.userId === userId);

      if (!isMember && !hasResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Always fetch entries for the authenticated user only
      const entries = await storage.getNonProjectTimeEntriesWithCategory(userId, organizationId, startDate, endDate);
      res.json(entries);
    } catch (error) {
      console.error('Error getting non-project time entries:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get non-project time entries' : classified.message });
    }
  });

  // Create non-project time entry
  app.post('/api/non-project-time', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { organizationId, categoryId, entryDate, hours, notes } = req.body;

      // Validate required fields
      if (!organizationId || !categoryId || !entryDate || hours === undefined) {
        return res.status(400).json({ message: 'organizationId, categoryId, entryDate, and hours are required' });
      }

      // Validate hours range
      const hoursNum = Number(hours);
      if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
        return res.status(400).json({ message: 'Hours must be between 0 and 24' });
      }

      // Verify user belongs to this organization (via membership or resource)
      const memberships = await storage.getUserOrganizations(userId);
      const isMember = memberships.some(m => m.organizationId === organizationId);

      // Also check if user has a resource in this organization
      const resources = await storage.getResources(organizationId);
      const hasResource = resources.some(r => r.userId === userId);

      if (!isMember && !hasResource) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Verify category belongs to this organization
      const category = await storage.getTimeCategory(categoryId);
      if (!category || category.organizationId !== organizationId) {
        return res.status(400).json({ message: 'Invalid category for this organization' });
      }

      // Find user's resource (reuse resources from org access check)
      const userResource = resources.find(r => r.userId === userId);

      if (!userResource) {
        return res.status(400).json({ message: 'No resource record found for this user' });
      }

      // Check if entry date is in a closed period
      const closedPeriods = await storage.getClosedPeriodsForDateRange(organizationId, entryDate, entryDate);
      if (closedPeriods.length > 0) {
        return res.status(403).json({ message: 'Cannot create entries in a closed period' });
      }

      // Always use authenticated user's ID (ignore any client-supplied userId)
      const entry = await storage.createNonProjectTimeEntry({
        organizationId,
        userId,
        resourceId: userResource.id,
        categoryId,
        entryDate,
        hours: String(hoursNum),
        notes,
        status: 'Draft'
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating non-project time entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to create non-project time entry' : classified.message });
    }
  });

  // Update non-project time entry
  app.put('/api/non-project-time/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);

      // Get the entry and verify ownership
      const existingEntry = await storage.getNonProjectTimeEntry(id);

      if (!existingEntry) {
        return res.status(404).json({ message: 'Time entry not found' });
      }

      // Verify the authenticated user owns this entry
      if (existingEntry.userId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if entry date is in a closed period
      const closedPeriods = await storage.getClosedPeriodsForDateRange(
        existingEntry.organizationId, existingEntry.entryDate, existingEntry.entryDate
      );
      if (closedPeriods.length > 0) {
        return res.status(403).json({ message: 'Cannot update entries in a closed period' });
      }

      // Only allow updating hours and notes
      const { hours, notes } = req.body;
      const updates: { hours?: string; notes?: string } = {};
      if (hours !== undefined) updates.hours = String(Number(hours));
      if (notes !== undefined) updates.notes = notes;

      const updated = await storage.updateNonProjectTimeEntry(id, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error updating non-project time entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to update non-project time entry' : classified.message });
    }
  });

  // Delete non-project time entry
  app.delete('/api/non-project-time/:id', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const id = Number(req.params.id);

      // Get the entry and verify ownership
      const existingEntry = await storage.getNonProjectTimeEntry(id);

      if (!existingEntry) {
        return res.status(404).json({ message: 'Time entry not found' });
      }

      // Verify the authenticated user owns this entry
      if (existingEntry.userId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if entry date is in a closed period
      const closedPeriods = await storage.getClosedPeriodsForDateRange(existingEntry.organizationId, existingEntry.entryDate, existingEntry.entryDate);
      if (closedPeriods.length > 0) {
        return res.status(403).json({ message: 'Cannot delete entries in a closed period' });
      }

      await storage.deleteNonProjectTimeEntry(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting non-project time entry:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to delete non-project time entry' : classified.message });
    }
  });

  // Admin: Get all referral stats (Super Admin only)
  app.get('/api/admin/referrals', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    if (!hasAdminAccess(user)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    try {
      const { referralCodes, referrals, referralPayouts } = await import("@shared/schema");

      const allCodes = await db.select().from(referralCodes);
      const allReferrals = await db.select().from(referrals);
      const allPayouts = await db.select().from(referralPayouts);

      res.json({
        codes: allCodes,
        referrals: allReferrals,
        payouts: allPayouts,
        summary: {
          totalCodes: allCodes.length,
          totalReferrals: allReferrals.length,
          totalConversions: allReferrals.filter(r => r.status === 'CONVERTED' || r.status === 'PAID_OUT').length,
          totalPayoutsPending: allPayouts.filter(p => p.status === 'PENDING').reduce((sum, p) => sum + p.amountCents, 0),
          totalPayoutsCompleted: allPayouts.filter(p => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amountCents, 0),
        },
      });
    } catch (error) {
      console.error('Error getting admin referral stats:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to get referral stats' : classified.message });
    }
  });

  // Dashboard Export Routes
  app.post('/api/dashboard/:type/export', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { type } = req.params;
      const { format, organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required' });
      }

      const { getDashboardDataForExport, generateDashboardPowerPoint, generateDashboardPdf, generateDashboardHTML } = await import('./services/dashboardExport');
      const data = await getDashboardDataForExport(type, organizationId);

      if (format === 'pptx') {
        const buffer = await generateDashboardPowerPoint(data);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-dashboard.pptx"`);
        res.send(buffer);
      } else if (format === 'pdf') {
        const buffer = await generateDashboardPdf(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-dashboard.pdf"`);
        res.send(buffer);
      } else if (format === 'html') {
        const html = generateDashboardHTML(data);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } else {
        res.status(400).json({ message: 'Invalid format. Use pptx, pdf or html' });
      }
    } catch (error) {
      console.error('Error exporting dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to export dashboard' : classified.message });
    }
  });

  // Dashboard Share Route
  app.post('/api/dashboard/:type/share', async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const { type } = req.params;
      const { recipients, organizationId, formats, message } = req.body;

      if (!organizationId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ message: 'Organization ID and recipients are required' });
      }

      const { getDashboardDataForExport, generateDashboardPowerPoint, generateDashboardHTML } = await import('./services/dashboardExport');
      const { sendEmail } = await import('./services/email');

      const data = await getDashboardDataForExport(type, organizationId);
      const htmlContent = generateDashboardHTML(data);

      const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];

      if (formats?.includes('pptx')) {
        const pptxBuffer = await generateDashboardPowerPoint(data);
        attachments.push({
          filename: `${type}-dashboard.pptx`,
          content: pptxBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        });
      }

      const user = await storage.getUser(userId);
      const senderName = user?.firstName || user?.email || 'A colleague';

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">FridayReport.AI</h1>
          </div>
          <p><strong>${senderName}</strong> has shared a dashboard report with you.</p>
          ${message ? `<p style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-style: italic;">"${message}"</p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          ${htmlContent}
        </div>
      `;

      let successCount = 0;
      for (const email of recipients) {
        const success = await sendEmail({
          to: email,
          subject: `${data.title} - Shared Report`,
          text: `${senderName} has shared a ${data.title} report with you.`,
          html: emailHtml,
          attachments,
        });
        if (success) successCount++;
      }

      res.json({ 
        success: true, 
        sent: successCount, 
        total: recipients.length 
      });
    } catch (error) {
      console.error('Error sharing dashboard:', error);
      const classified = classifyError(error);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Failed to share dashboard' : classified.message });
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

  seedTrainingDataIfEmpty().catch(err => {
    console.error('[training] Failed to seed training data:', err.message);
  });

  return httpServer;
}

async function seedTrainingDataIfEmpty() {
  const existing = await db.select({ id: trainingModules.id }).from(trainingModules).limit(1);
  if (existing.length > 0) return;

  console.log('[training] No training data found, auto-seeding from static content...');

  try {
    const { allModules: staticModules } = await import('../client/src/lib/trainingData');
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
}
