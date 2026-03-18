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
import { addWorkingDays, ensureWorkingDay, calculateEndDate, calculateDuration, nextWorkingDay, formatDateStr, workingDaysBetweenExclusive } from "../lib/workingDays";

export function registerIntakeRoutes(app: Express) {
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
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
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
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
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

}
