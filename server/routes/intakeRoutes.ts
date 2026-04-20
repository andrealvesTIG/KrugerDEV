import type { Express } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import { resources, insertProjectIntakeSchema, insertIntakeTypeSchema } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgIds,
  requireEmailVerified,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400 } from "../route-registry";

export function registerIntakeRoutes(app: Express) {

  apiRoute(app, 'get', '/api/project-intakes', {
    tag: 'Project Intakes',
    summary: 'List project intakes',
    parameters: [qInt('organizationId', true, 'Organization ID'), qStr('status', false, 'Filter by status')],
    responses: { ...r200('Intakes list', arrOf('ProjectIntake')), ...authRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/project-intakes/:id', {
    tag: 'Project Intakes',
    summary: 'Get intake by ID',
    parameters: [pathId()],
    responses: { ...r200('Intake details', ref('ProjectIntake')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const intake = await storage.getProjectIntake(Number(req.params.id));
      if (!intake) return res.status(404).json({ message: "Project intake not found" });
      if (!await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
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

  apiRoute(app, 'post', '/api/project-intakes', {
    tag: 'Project Intakes',
    summary: 'Create a new intake',
    requestBody: body(ref('ProjectIntakeRequest')),
    responses: { ...r201('Intake created', ref('ProjectIntake')), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const input = insertProjectIntakeSchema.parse(req.body);
      
      if (!await userHasOrgAccess(userId, input.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

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
        ...input,
        status: input.status || 'draft',
        currentStep: input.currentStep || 'intake_capture',
      });
      
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.INTAKES, intake.id, 1, input.organizationId);
      }
      
      res.status(201).json(intake);
    } catch (err) {
      console.error("Error creating project intake:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating project intake" : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/project-intakes/:id', {
    tag: 'Project Intakes',
    summary: 'Update intake',
    parameters: [pathId()],
    requestBody: body(ref('ProjectIntakeRequest'), false),
    responses: { ...r200('Intake updated', ref('ProjectIntake')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }

        const isSubmitter = existing.submitterId === userId;
        if (!isSubmitter) {
          const memberships = await storage.getOrganizationMembers(existing.organizationId);
          const userMembership = memberships.find(m => m.userId === userId);
          const isOrgAdmin = userMembership && (userMembership.role === 'org_admin' || userMembership.role === 'owner');
          const user = await storage.getUser(userId);
          const isSuperAdmin = hasAdminAccess(user);
          if (!isOrgAdmin && !isSuperAdmin) {
            return res.status(403).json({ message: "Only the submitter or an admin can modify this intake" });
          }
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

  apiRoute(app, 'delete', '/api/project-intakes/:id', {
    tag: 'Project Intakes',
    summary: 'Delete intake',
    parameters: [pathId()],
    responses: { ...r200('Intake deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }

        const isSubmitter = existing.submitterId === userId;
        if (!isSubmitter) {
          const memberships = await storage.getOrganizationMembers(existing.organizationId);
          const userMembership = memberships.find(m => m.userId === userId);
          const isOrgAdmin = userMembership && (userMembership.role === 'org_admin' || userMembership.role === 'owner');
          const user = await storage.getUser(userId);
          const isSuperAdmin = hasAdminAccess(user);
          if (!isOrgAdmin && !isSuperAdmin) {
            return res.status(403).json({ message: "Only the submitter or an admin can delete this intake" });
          }
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

  apiRoute(app, 'get', '/api/organizations/:orgId/can-approve-intakes', {
    tag: 'Project Intakes',
    summary: 'Check if user can approve intakes',
    parameters: [pathId('orgId')],
    responses: { ...r200('Approval permission', { type: 'object', properties: { canApprove: { type: 'boolean' } } }), ...idRes },
  }, async (req, res) => {
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

      if (hasAdminAccess(user)) {
        return res.json({ canApprove: true });
      }

      const memberships = await storage.getUserOrganizations(userId);
      const isOrgAdmin = memberships.some(m => m.organizationId === orgId && (m.role === 'org_admin' || m.role === 'owner'));
      
      if (isOrgAdmin) {
        return res.json({ canApprove: true });
      }

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

  apiRoute(app, 'post', '/api/project-intakes/:id/approve', {
    tag: 'Project Intakes',
    summary: 'Approve intake and convert to project',
    parameters: [pathId()],
    responses: { ...r200('Intake approved, project created', ref('ProjectIntake')), ...fullRes, ...e400 },
  }, async (req, res) => {
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

      if (!existing.pmoApproved) {
        return res.status(403).json({ message: "PM approval is required before converting to a project. Please ensure the PM has approved this intake." });
      }

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

  apiRoute(app, 'post', '/api/project-intakes/:id/reject', {
    tag: 'Project Intakes',
    summary: 'Reject an intake',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { reason: { type: 'string' } } }, false),
    responses: { ...r200('Intake rejected', ref('ProjectIntake')), ...fullRes },
  }, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const { reason } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });
      
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

  // ----- Change workflow on existing record -----

  apiRoute(app, 'post', '/api/project-intakes/:id/change-workflow', {
    tag: 'Project Intakes',
    summary: 'Change the workflow assigned to an intake (maps current step)',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { workflowId: { type: 'integer' }, resetToFirstStep: { type: 'boolean' } }, required: ['workflowId'] }),
    responses: { ...r200('Workflow switched', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const id = Number(req.params.id);
      const existing = await storage.getProjectIntake(id);
      if (!existing) return res.status(404).json({ message: "Project intake not found" });

      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }
        const isSubmitter = existing.submitterId === userId;
        if (!isSubmitter) {
          const memberships = await storage.getOrganizationMembers(existing.organizationId);
          const userMembership = memberships.find(m => m.userId === userId);
          const isOrgAdmin = userMembership && (userMembership.role === 'org_admin' || userMembership.role === 'owner');
          const user = await storage.getUser(userId);
          const isSuperAdmin = hasAdminAccess(user);
          if (!isOrgAdmin && !isSuperAdmin) {
            return res.status(403).json({ message: "Only the submitter or an admin can modify this intake" });
          }
        }
      }

      const targetWorkflowId = Number(req.body?.workflowId);
      if (!Number.isFinite(targetWorkflowId) || targetWorkflowId <= 0) {
        return res.status(400).json({ message: "workflowId is required" });
      }
      const resetToFirstStep = req.body?.resetToFirstStep === true;

      const result = await storage.changeIntakeWorkflow(id, targetWorkflowId, { resetToFirstStep });
      res.json(result);
    } catch (err) {
      console.error("Error changing intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error changing intake workflow" : (err instanceof Error ? err.message : classified.message) });
    }
  });

  apiRoute(app, 'post', '/api/projects/:id/change-workflow', {
    tag: 'Projects',
    summary: 'Change the workflow assigned to a project (maps current status)',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { workflowId: { type: 'integer' }, resetToFirstStep: { type: 'boolean' } }, required: ['workflowId'] }),
    responses: { ...r200('Workflow switched', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const id = Number(req.params.id);
      const existing = await storage.getProject(id);
      if (!existing) return res.status(404).json({ message: "Project not found" });

      if (existing.organizationId) {
        const accessibleOrgIds = await getUserOrgIds(userId);
        if (!accessibleOrgIds.includes(existing.organizationId)) {
          return res.status(403).json({ message: "You don't have access to this organization" });
        }
      }

      const targetWorkflowId = Number(req.body?.workflowId);
      if (!Number.isFinite(targetWorkflowId) || targetWorkflowId <= 0) {
        return res.status(400).json({ message: "workflowId is required" });
      }
      const resetToFirstStep = req.body?.resetToFirstStep === true;

      const result = await storage.changeProjectWorkflow(id, targetWorkflowId, { resetToFirstStep });
      res.json(result);
    } catch (err) {
      console.error("Error changing project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error changing project workflow" : (err instanceof Error ? err.message : classified.message) });
    }
  });

  // ----- Intake workflow steps (default or by ?workflowId=) -----

  apiRoute(app, 'get', '/api/organizations/:orgId/intake-workflow', {
    tag: 'Intake Workflow',
    summary: 'Get intake workflow configuration (default or by workflowId)',
    parameters: [pathId('orgId'), qInt('workflowId', false, 'Workflow ID (defaults to org default)')],
    responses: { ...r200('Workflow config', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const workflowId = req.query.workflowId ? Number(req.query.workflowId) : undefined;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      if (workflowId) {
        const wf = await storage.getIntakeWorkflow(workflowId);
        if (!wf || wf.organizationId !== orgId) {
          return res.status(404).json({ message: "Workflow not found in this organization" });
        }
      }
      let steps = await storage.getIntakeWorkflowSteps(orgId, workflowId);
      if (steps.length === 0) {
        steps = await storage.resetIntakeWorkflowToDefaults(orgId, workflowId);
      }
      res.json(steps);
    } catch (err) {
      console.error("Error fetching intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching intake workflow configuration" : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:orgId/intake-workflow', {
    tag: 'Intake Workflow',
    summary: 'Update intake workflow configuration (default or by workflowId)',
    parameters: [pathId('orgId'), qInt('workflowId', false, 'Workflow ID (defaults to org default)')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Workflow updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const workflowId = req.query.workflowId ? Number(req.query.workflowId) : undefined;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      if (workflowId) {
        const wf = await storage.getIntakeWorkflow(workflowId);
        if (!wf || wf.organizationId !== orgId) {
          return res.status(404).json({ message: "Workflow not found in this organization" });
        }
      }
      const { steps } = req.body;
      if (!Array.isArray(steps)) return res.status(400).json({ message: "Steps must be an array" });
      for (const step of steps) {
        if (!step.stepKey || !step.label || step.position === undefined) {
          return res.status(400).json({ message: "Each step must have stepKey, label, and position" });
        }
      }
      const updatedSteps = await storage.upsertIntakeWorkflowSteps(orgId, steps, workflowId);
      res.json(updatedSteps);
    } catch (err) {
      console.error("Error updating intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating intake workflow configuration" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:orgId/intake-workflow/reset', {
    tag: 'Intake Workflow',
    summary: 'Reset intake workflow to defaults (default or by workflowId)',
    parameters: [pathId('orgId'), qInt('workflowId', false, 'Workflow ID (defaults to org default)')],
    responses: { ...r200('Workflow reset', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const workflowId = req.query.workflowId ? Number(req.query.workflowId) : undefined;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      if (workflowId) {
        const wf = await storage.getIntakeWorkflow(workflowId);
        if (!wf || wf.organizationId !== orgId) {
          return res.status(404).json({ message: "Workflow not found in this organization" });
        }
      }
      const steps = await storage.resetIntakeWorkflowToDefaults(orgId, workflowId);
      res.json(steps);
    } catch (err) {
      console.error("Error resetting intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error resetting intake workflow configuration" : classified.message });
    }
  });

  // ----- Multi-workflow management: Intake -----

  apiRoute(app, 'get', '/api/organizations/:orgId/intake-workflows', {
    tag: 'Intake Workflow',
    summary: 'List all intake workflows for an organization',
    parameters: [pathId('orgId')],
    responses: { ...r200('Workflows', { type: 'array' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      // Ensure a default exists so the list is never empty for existing orgs.
      await storage.ensureDefaultIntakeWorkflow(orgId);
      const wfs = await storage.getIntakeWorkflows(orgId);
      res.json(wfs);
    } catch (err) {
      console.error("Error listing intake workflows:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error listing intake workflows" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:orgId/intake-workflows', {
    tag: 'Intake Workflow',
    summary: 'Create a new intake workflow (with default steps)',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, isDefault: { type: 'boolean' }, creationMode: { type: 'string', enum: ['dialog', 'url'] }, creationUrl: { type: 'string' } }, required: ['name'] }),
    responses: { ...r201('Workflow created', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      const { name, description, isDefault, creationMode, creationUrl } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: "Name is required" });
      const mode: 'dialog' | 'url' = creationMode === 'url' ? 'url' : 'dialog';
      if (mode === 'url') {
        if (!creationUrl || typeof creationUrl !== 'string') return res.status(400).json({ message: "creationUrl is required when creationMode is 'url'" });
        if (!/^https?:\/\//i.test(creationUrl)) return res.status(400).json({ message: "creationUrl must start with http:// or https://" });
      }
      const wf = await storage.createIntakeWorkflow({
        organizationId: orgId,
        name: name.trim(),
        description: description || null,
        isDefault: !!isDefault,
        isActive: true,
        creationMode: mode,
        creationUrl: mode === 'url' ? creationUrl : null,
      });
      await storage.resetIntakeWorkflowToDefaults(orgId, wf.id);
      res.status(201).json(wf);
    } catch (err) {
      console.error("Error creating intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating intake workflow" : (err instanceof Error ? err.message : classified.message) });
    }
  });

  apiRoute(app, 'patch', '/api/organizations/:orgId/intake-workflows/:wfId', {
    tag: 'Intake Workflow',
    summary: 'Update an intake workflow (name, description, isDefault, isActive, creationMode, creationUrl)',
    parameters: [pathId('orgId'), pathId('wfId')],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r200('Workflow updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const wfId = Number(req.params.wfId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      const existing = await storage.getIntakeWorkflow(wfId);
      if (!existing || existing.organizationId !== orgId) return res.status(404).json({ message: "Workflow not found" });
      const { name, description, isDefault, isActive, creationMode, creationUrl } = req.body || {};
      const updates: any = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (description !== undefined) updates.description = description;
      if (isDefault !== undefined) updates.isDefault = !!isDefault;
      if (isActive !== undefined) updates.isActive = !!isActive;
      if (creationMode !== undefined) {
        if (creationMode !== 'dialog' && creationMode !== 'url') return res.status(400).json({ message: "creationMode must be 'dialog' or 'url'" });
        updates.creationMode = creationMode;
      }
      if (creationUrl !== undefined) {
        if (creationUrl !== null && creationUrl !== '') {
          if (typeof creationUrl !== 'string' || !/^https?:\/\//i.test(creationUrl)) return res.status(400).json({ message: "creationUrl must start with http:// or https://" });
          updates.creationUrl = creationUrl;
        } else {
          updates.creationUrl = null;
        }
      }
      const effectiveMode = updates.creationMode ?? existing.creationMode;
      if (effectiveMode === 'url') {
        const effectiveUrl = updates.creationUrl ?? existing.creationUrl;
        if (!effectiveUrl) return res.status(400).json({ message: "creationUrl is required when creationMode is 'url'" });
      }
      const updated = await storage.updateIntakeWorkflow(wfId, updates);
      res.json(updated);
    } catch (err) {
      console.error("Error updating intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: err instanceof Error ? err.message : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:orgId/intake-workflows/:wfId', {
    tag: 'Intake Workflow',
    summary: 'Delete an intake workflow',
    parameters: [pathId('orgId'), pathId('wfId')],
    responses: { ...r204('Workflow deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const wfId = Number(req.params.wfId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      const existing = await storage.getIntakeWorkflow(wfId);
      if (!existing || existing.organizationId !== orgId) return res.status(404).json({ message: "Workflow not found" });
      await storage.deleteIntakeWorkflow(wfId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: err instanceof Error ? err.message : classified.message });
    }
  });

  // ----- Project workflow steps (default or by ?workflowId=) -----

  apiRoute(app, 'get', '/api/organizations/:orgId/project-workflow', {
    tag: 'Project Workflow',
    summary: 'Get project workflow configuration (default or by workflowId)',
    parameters: [pathId('orgId'), qInt('workflowId', false, 'Workflow ID (defaults to org default)')],
    responses: { ...r200('Workflow config', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const workflowId = req.query.workflowId ? Number(req.query.workflowId) : undefined;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      if (workflowId) {
        const wf = await storage.getProjectWorkflow(workflowId);
        if (!wf || wf.organizationId !== orgId) return res.status(404).json({ message: "Workflow not found in this organization" });
      }
      let steps = await storage.getProjectWorkflowSteps(orgId, workflowId);
      if (steps.length === 0) {
        steps = await storage.resetProjectWorkflowToDefaults(orgId, workflowId);
      }
      res.json(steps);
    } catch (err) {
      console.error("Error fetching project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project workflow configuration" : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/organizations/:orgId/project-workflow', {
    tag: 'Project Workflow',
    summary: 'Update project workflow configuration (default or by workflowId)',
    parameters: [pathId('orgId'), qInt('workflowId', false, 'Workflow ID (defaults to org default)')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Workflow updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const workflowId = req.query.workflowId ? Number(req.query.workflowId) : undefined;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      if (workflowId) {
        const wf = await storage.getProjectWorkflow(workflowId);
        if (!wf || wf.organizationId !== orgId) return res.status(404).json({ message: "Workflow not found in this organization" });
      }
      const { steps } = req.body;
      if (!Array.isArray(steps)) return res.status(400).json({ message: "Steps must be an array" });
      for (const step of steps) {
        if (!step.stepKey || !step.label || step.position === undefined) {
          return res.status(400).json({ message: "Each step must have stepKey, label, and position" });
        }
      }
      const updatedSteps = await storage.upsertProjectWorkflowSteps(orgId, steps, workflowId);
      res.json(updatedSteps);
    } catch (err) {
      console.error("Error updating project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating project workflow configuration" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:orgId/project-workflow/reset', {
    tag: 'Project Workflow',
    summary: 'Reset project workflow to defaults (default or by workflowId)',
    parameters: [pathId('orgId'), qInt('workflowId', false, 'Workflow ID (defaults to org default)')],
    responses: { ...r200('Workflow reset', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const workflowId = req.query.workflowId ? Number(req.query.workflowId) : undefined;
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      if (workflowId) {
        const wf = await storage.getProjectWorkflow(workflowId);
        if (!wf || wf.organizationId !== orgId) return res.status(404).json({ message: "Workflow not found in this organization" });
      }
      const steps = await storage.resetProjectWorkflowToDefaults(orgId, workflowId);
      res.json(steps);
    } catch (err) {
      console.error("Error resetting project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error resetting project workflow configuration" : classified.message });
    }
  });

  // ----- Multi-workflow management: Project -----

  apiRoute(app, 'get', '/api/organizations/:orgId/project-workflows', {
    tag: 'Project Workflow',
    summary: 'List all project workflows for an organization',
    parameters: [pathId('orgId')],
    responses: { ...r200('Workflows', { type: 'array' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      await storage.ensureDefaultProjectWorkflow(orgId);
      const wfs = await storage.getProjectWorkflows(orgId);
      res.json(wfs);
    } catch (err) {
      console.error("Error listing project workflows:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error listing project workflows" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:orgId/project-workflows', {
    tag: 'Project Workflow',
    summary: 'Create a new project workflow (with default steps)',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, isDefault: { type: 'boolean' }, creationMode: { type: 'string', enum: ['dialog', 'url'] }, creationUrl: { type: 'string' } }, required: ['name'] }),
    responses: { ...r201('Workflow created', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      const { name, description, isDefault, creationMode, creationUrl } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: "Name is required" });
      const mode: 'dialog' | 'url' = creationMode === 'url' ? 'url' : 'dialog';
      if (mode === 'url') {
        if (!creationUrl || typeof creationUrl !== 'string') return res.status(400).json({ message: "creationUrl is required when creationMode is 'url'" });
        if (!/^https?:\/\//i.test(creationUrl)) return res.status(400).json({ message: "creationUrl must start with http:// or https://" });
      }
      const wf = await storage.createProjectWorkflow({
        organizationId: orgId,
        name: name.trim(),
        description: description || null,
        isDefault: !!isDefault,
        isActive: true,
        creationMode: mode,
        creationUrl: mode === 'url' ? creationUrl : null,
      });
      await storage.resetProjectWorkflowToDefaults(orgId, wf.id);
      res.status(201).json(wf);
    } catch (err) {
      console.error("Error creating project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating project workflow" : (err instanceof Error ? err.message : classified.message) });
    }
  });

  apiRoute(app, 'patch', '/api/organizations/:orgId/project-workflows/:wfId', {
    tag: 'Project Workflow',
    summary: 'Update a project workflow (name, description, isDefault, isActive, creationMode, creationUrl)',
    parameters: [pathId('orgId'), pathId('wfId')],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r200('Workflow updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const wfId = Number(req.params.wfId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      const existing = await storage.getProjectWorkflow(wfId);
      if (!existing || existing.organizationId !== orgId) return res.status(404).json({ message: "Workflow not found" });
      const { name, description, isDefault, isActive, creationMode, creationUrl } = req.body || {};
      const updates: any = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (description !== undefined) updates.description = description;
      if (isDefault !== undefined) updates.isDefault = !!isDefault;
      if (isActive !== undefined) updates.isActive = !!isActive;
      if (creationMode !== undefined) {
        if (creationMode !== 'dialog' && creationMode !== 'url') return res.status(400).json({ message: "creationMode must be 'dialog' or 'url'" });
        updates.creationMode = creationMode;
      }
      if (creationUrl !== undefined) {
        if (creationUrl !== null && creationUrl !== '') {
          if (typeof creationUrl !== 'string' || !/^https?:\/\//i.test(creationUrl)) return res.status(400).json({ message: "creationUrl must start with http:// or https://" });
          updates.creationUrl = creationUrl;
        } else {
          updates.creationUrl = null;
        }
      }
      const effectiveMode = updates.creationMode ?? existing.creationMode;
      if (effectiveMode === 'url') {
        const effectiveUrl = updates.creationUrl ?? existing.creationUrl;
        if (!effectiveUrl) return res.status(400).json({ message: "creationUrl is required when creationMode is 'url'" });
      }
      const updated = await storage.updateProjectWorkflow(wfId, updates);
      res.json(updated);
    } catch (err) {
      console.error("Error updating project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: err instanceof Error ? err.message : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/organizations/:orgId/project-workflows/:wfId', {
    tag: 'Project Workflow',
    summary: 'Delete a project workflow',
    parameters: [pathId('orgId'), pathId('wfId')],
    responses: { ...r204('Workflow deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const wfId = Number(req.params.wfId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      const existing = await storage.getProjectWorkflow(wfId);
      if (!existing || existing.organizationId !== orgId) return res.status(404).json({ message: "Workflow not found" });
      await storage.deleteProjectWorkflow(wfId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: err instanceof Error ? err.message : classified.message });
    }
  });

  // ----- Intake Types -----
  apiRoute(app, 'get', '/api/intake-types', {
    tag: 'Intake Types',
    summary: 'List intake types for an organization',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Intake types', { type: 'array' }), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ message: "organizationId is required" });
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const types = await storage.getIntakeTypes(organizationId);
      res.json(types);
    } catch (err) {
      console.error("Error fetching intake types:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching intake types" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/intake-types', {
    tag: 'Intake Types',
    summary: 'Create an intake type',
    requestBody: body({ type: 'object' }),
    responses: { ...r201('Intake type created', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const input = insertIntakeTypeSchema.parse({ ...req.body, isSystem: false });
      if (!await userHasOrgAccess(userId, input.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const created = await storage.createIntakeType(input);
      res.status(201).json(created);
    } catch (err) {
      console.error("Error creating intake type:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating intake type" : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/intake-types/:id', {
    tag: 'Intake Types',
    summary: 'Update an intake type',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r200('Intake type updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getIntakeType(id);
      if (!existing) return res.status(404).json({ message: 'Intake type not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const updated = await storage.updateIntakeType(id, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Error updating intake type:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating intake type" : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/intake-types/:id', {
    tag: 'Intake Types',
    summary: 'Delete an intake type',
    parameters: [pathId()],
    responses: { ...r204('Intake type deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getIntakeType(id);
      if (!existing) return res.status(404).json({ message: 'Intake type not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (existing.isSystem) {
        return res.status(400).json({ message: 'System intake types cannot be deleted' });
      }
      await storage.deleteIntakeType(id);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting intake type:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting intake type" : classified.message });
    }
  });
}
