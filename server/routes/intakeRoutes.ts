import type { Express } from "express";
import { storage } from "../storage";
import { and } from "drizzle-orm";
import { resources, insertProjectIntakeSchema } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgIds,
  requireEmailVerified,
} from "./helpers";

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
      
      const input = insertProjectIntakeSchema.parse(req.body);
      
      if (!await userHasOrgAccess(userId, input.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
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
        ...input,
        status: input.status || 'draft',
        currentStep: input.currentStep || 'intake_capture',
      });
      
      // Record usage after successful creation
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
}
