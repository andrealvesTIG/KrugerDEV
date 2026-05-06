import type { Express } from "express";
import { storage } from "../storage";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db";
import { resources, insertProjectIntakeSchema, powerbiIntakeRequests, powerbiAgentConversations, powerbiAgentMessages, type InsertIntakeWorkflow, type InsertProjectWorkflow, type IntakeWorkflow } from "@shared/schema";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgIds,
  requireEmailVerified,
  formatZodErrors,
} from "./helpers";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400 } from "../route-registry";

function dispatchIntakeStepTransitionEmails(args: {
  intakeId: number;
  intakeNumber: string | null;
  projectName: string;
  organizationId: number | null;
  previousWorkflowId: number | null;
  nextWorkflowId: number | null;
  previousStep: string | null;
  nextStep: string | null;
  actorUserId: string | undefined;
}): void {
  const { intakeId, intakeNumber, projectName, organizationId, previousWorkflowId, nextWorkflowId, previousStep, nextStep, actorUserId } = args;
  if (!organizationId) return;
  if (previousStep === nextStep && previousWorkflowId === nextWorkflowId) return;

  void (async () => {
    try {
      const fromSteps = await storage.getIntakeWorkflowSteps(organizationId, previousWorkflowId ?? null);
      const toSteps = previousWorkflowId === nextWorkflowId
        ? fromSteps
        : await storage.getIntakeWorkflowSteps(organizationId, nextWorkflowId ?? null);
      const fromStep = previousStep ? fromSteps.find(s => s.stepKey === previousStep) : undefined;
      const toStep = nextStep ? toSteps.find(s => s.stepKey === nextStep) : undefined;
      const fromEmails = (fromStep?.notifyOnExit || []) as string[];
      const toEmails = (toStep?.notifyOnEntry || []) as string[];
      if (fromEmails.length === 0 && toEmails.length === 0) return;

      const { sendIntakeStepTransitionEmail } = await import("../services/email");
      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.APP_URL || 'https://fridayreport.ai';

      let actorName: string | null = null;
      try {
        const actor = actorUserId ? await storage.getUser(actorUserId) : null;
        actorName = actor ? (`${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email || null) : null;
      } catch (lookupErr) {
        console.error("Failed to look up actor for intake step transition email:", lookupErr);
      }
      let organizationName: string | undefined;
      try {
        const org = await storage.getOrganization(organizationId);
        organizationName = org?.name;
      } catch (lookupErr) {
        console.error("Failed to look up organization for intake step transition email:", lookupErr);
      }

      const exitTasks = fromEmails.map(email =>
        sendIntakeStepTransitionEmail(email, {
          intakeId,
          intakeNumber,
          projectName,
          organizationName,
          stepLabel: fromStep?.label || previousStep || 'Step',
          transition: 'exit',
          toStepLabel: toStep?.label || nextStep || null,
          actorName,
          appUrl,
        }).catch(err => { console.error(`Failed to send intake step exit email to ${email}:`, err); return false; })
      );
      const entryTasks = toEmails.map(email =>
        sendIntakeStepTransitionEmail(email, {
          intakeId,
          intakeNumber,
          projectName,
          organizationName,
          stepLabel: toStep?.label || nextStep || 'Step',
          transition: 'entry',
          fromStepLabel: fromStep?.label || previousStep || null,
          actorName,
          appUrl,
        }).catch(err => { console.error(`Failed to send intake step entry email to ${email}:`, err); return false; })
      );
      await Promise.allSettled([...exitTasks, ...entryTasks]);
    } catch (err) {
      console.error("Error sending intake step transition emails:", err);
    }
  })();
}

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

      await storage.assignAutonumberValuesForEntity({
        organizationId: intake.organizationId,
        entityType: 'intake',
        entityId: intake.id,
      }).catch((e) => console.error('[autonumber] intake assignment failed:', e));

      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.INTAKES, intake.id, 1, input.organizationId);
      }

      dispatchIntakeStepTransitionEmails({
        intakeId: intake.id,
        intakeNumber: intake.intakeNumber ?? null,
        projectName: intake.projectName,
        organizationId: intake.organizationId,
        previousWorkflowId: null,
        nextWorkflowId: intake.workflowId ?? null,
        previousStep: null,
        nextStep: intake.currentStep ?? null,
        actorUserId: userId,
      });

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
      
      const previousStep = existing.currentStep;
      const updated = await storage.updateProjectIntake(id, req.body);

      dispatchIntakeStepTransitionEmails({
        intakeId: id,
        intakeNumber: updated.intakeNumber ?? null,
        projectName: updated.projectName,
        organizationId: existing.organizationId,
        previousWorkflowId: existing.workflowId ?? null,
        nextWorkflowId: updated.workflowId ?? null,
        previousStep,
        nextStep: updated.currentStep,
        actorUserId: userId,
      });

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

  apiRoute(app, 'get', '/api/project-intakes/:id/source', {
    tag: 'Project Intakes',
    summary: 'Get the source PBI request and agent conversation that led to this intake',
    parameters: [pathId()],
    responses: { ...r200('Intake source', { type: 'object' }), ...fullRes },
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
      }

      const [pbiRequest] = await db
        .select()
        .from(powerbiIntakeRequests)
        .where(eq(powerbiIntakeRequests.projectIntakeId, id))
        .limit(1);

      const [conversation] = await db
        .select()
        .from(powerbiAgentConversations)
        .where(eq(powerbiAgentConversations.submittedIntakeId, id))
        .limit(1);

      let messages: any[] = [];
      if (conversation) {
        messages = await db
          .select({
            id: powerbiAgentMessages.id,
            role: powerbiAgentMessages.role,
            content: powerbiAgentMessages.content,
            attachments: powerbiAgentMessages.attachments,
            createdAt: powerbiAgentMessages.createdAt,
          })
          .from(powerbiAgentMessages)
          .where(eq(powerbiAgentMessages.conversationId, conversation.id))
          .orderBy(asc(powerbiAgentMessages.createdAt));
      }

      const attachments: Array<{ name: string; objectPath: string; contentType: string; size: number; messageId: number; createdAt: Date | null }> = [];
      for (const m of messages) {
        const atts = (m.attachments || []) as Array<{ name: string; objectPath: string; contentType: string; size: number }>;
        for (const a of atts) {
          attachments.push({ ...a, messageId: m.id, createdAt: m.createdAt });
        }
      }

      res.json({
        pbiRequest: pbiRequest || null,
        conversation: conversation || null,
        messages,
        attachments,
      });
    } catch (err) {
      console.error("Error fetching intake source:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching intake source" : classified.message });
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

      const previousStepBeforeApproval = existing.currentStep;
      const project = await storage.approveProjectIntake(id, userId);

      dispatchIntakeStepTransitionEmails({
        intakeId: id,
        intakeNumber: existing.intakeNumber ?? null,
        projectName: existing.projectName,
        organizationId: existing.organizationId,
        previousWorkflowId: existing.workflowId ?? null,
        nextWorkflowId: existing.workflowId ?? null,
        previousStep: previousStepBeforeApproval,
        nextStep: 'submit_to_pmo',
        actorUserId: userId,
      });

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

  apiRoute(app, 'get', '/api/organizations/:orgId/intake-workflow', {
    tag: 'Intake Workflow',
    summary: 'Get intake workflow configuration',
    parameters: [pathId('orgId')],
    responses: { ...r200('Workflow config', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }
      
      const wfIdRaw = req.query.workflowId;
      let workflowId: number | null = null;
      if (wfIdRaw !== undefined && wfIdRaw !== null && wfIdRaw !== '') {
        const parsed = Number(wfIdRaw);
        if (!Number.isFinite(parsed)) return res.status(400).json({ message: "Invalid workflowId" });
        workflowId = parsed;
      } else {
        // Auto-resolve to default workflow
        const def = await storage.ensureDefaultIntakeWorkflow(orgId);
        workflowId = def.id;
      }

      let steps = await storage.getIntakeWorkflowSteps(orgId, workflowId);

      if (steps.length === 0) {
        try {
          steps = await storage.resetIntakeWorkflowToDefaults(orgId, workflowId);
        } catch (resetErr) {
          // Most likely cause: a concurrent request already populated the
          // default steps (the unique-key violation surfaces as a 500).
          // Re-read; if rows now exist, treat it as success.
          console.warn("resetIntakeWorkflowToDefaults failed, re-reading:", resetErr);
          steps = await storage.getIntakeWorkflowSteps(orgId, workflowId);
          if (steps.length === 0) throw resetErr;
        }
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
    summary: 'Update intake workflow configuration',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Workflow updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const memberships = await storage.getOrganizationMembers(orgId);
      const userMembership = memberships.find(m => m.userId === userId);
      const isOrgAdmin = !!userMembership && (userMembership.role === 'org_admin' || userMembership.role === 'owner');
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      if (!isOrgAdmin && !isSuperAdmin) {
        return res.status(403).json({ message: "Only organization admins can modify intake workflow configuration" });
      }

      const { steps } = req.body;
      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Steps must be an array" });
      }

      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const sanitizeEmails = (raw: unknown): string[] | undefined => {
        if (raw === undefined) return undefined;
        if (raw === null) return [];
        if (!Array.isArray(raw)) {
          throw new Error("notifyOnEntry/notifyOnExit must be an array of email addresses");
        }
        const seen = new Set<string>();
        const out: string[] = [];
        for (const v of raw) {
          if (typeof v !== 'string') continue;
          const trimmed = v.trim().toLowerCase();
          if (!trimmed) continue;
          if (!EMAIL_RE.test(trimmed)) {
            throw new Error(`Invalid email address: ${v}`);
          }
          if (!seen.has(trimmed)) {
            seen.add(trimmed);
            out.push(trimmed);
          }
        }
        return out;
      };

      try {
        for (const step of steps) {
          if (!step.stepKey || !step.label || step.position === undefined) {
            return res.status(400).json({ message: "Each step must have stepKey, label, and position" });
          }
          const entry = sanitizeEmails(step.notifyOnEntry);
          if (entry !== undefined) step.notifyOnEntry = entry;
          const exit = sanitizeEmails(step.notifyOnExit);
          if (exit !== undefined) step.notifyOnExit = exit;
          if (step.showFinancials !== undefined) step.showFinancials = !!step.showFinancials;
          if ((step as any).showArchitectureQuestions !== undefined) (step as any).showArchitectureQuestions = !!(step as any).showArchitectureQuestions;
          if ((step as any).showCybersecurityQuestions !== undefined) (step as any).showCybersecurityQuestions = !!(step as any).showCybersecurityQuestions;
        }
      } catch (e: any) {
        return res.status(400).json({ message: e?.message || "Invalid email address" });
      }

      const wfIdRaw = req.query.workflowId ?? req.body.workflowId;
      let workflowId: number | null = null;
      if (wfIdRaw !== undefined && wfIdRaw !== null && wfIdRaw !== '') {
        const parsed = Number(wfIdRaw);
        if (!Number.isFinite(parsed)) return res.status(400).json({ message: "Invalid workflowId" });
        workflowId = parsed;
      } else {
        const def = await storage.ensureDefaultIntakeWorkflow(orgId);
        workflowId = def.id;
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
    summary: 'Reset intake workflow to defaults',
    parameters: [pathId('orgId')],
    responses: { ...r200('Workflow reset', { type: 'object' }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const orgId = Number(req.params.orgId);
      
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      const memberships = await storage.getOrganizationMembers(orgId);
      const userMembership = memberships.find(m => m.userId === userId);
      const isOrgAdmin = !!userMembership && (userMembership.role === 'org_admin' || userMembership.role === 'owner');
      const user = await storage.getUser(userId);
      const isSuperAdmin = hasAdminAccess(user);
      if (!isOrgAdmin && !isSuperAdmin) {
        return res.status(403).json({ message: "Only organization admins can reset the intake workflow" });
      }

      const wfIdRaw = req.query.workflowId ?? req.body?.workflowId;
      let workflowId: number | null = null;
      if (wfIdRaw !== undefined && wfIdRaw !== null && wfIdRaw !== '') {
        const parsed = Number(wfIdRaw);
        if (!Number.isFinite(parsed)) return res.status(400).json({ message: "Invalid workflowId" });
        workflowId = parsed;
      } else {
        const def = await storage.ensureDefaultIntakeWorkflow(orgId);
        workflowId = def.id;
      }
      const steps = await storage.resetIntakeWorkflowToDefaults(orgId, workflowId);
      res.json(steps);
    } catch (err) {
      console.error("Error resetting intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error resetting intake workflow configuration" : classified.message });
    }
  });

  // Helper to resolve workflowId from query/body, verifying it belongs to the org.
  const resolveProjectWorkflowId = async (
    req: any,
    orgId: number,
  ): Promise<number | { status: number; message: string }> => {
    const raw = req.query.workflowId ?? req.body?.workflowId;
    if (raw !== undefined && raw !== null && raw !== '') {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) return { status: 400, message: "Invalid workflowId" };
      const wf = await storage.getProjectWorkflow(parsed);
      if (!wf || wf.organizationId !== orgId) return { status: 404, message: "Workflow not found" };
      return parsed;
    }
    const def = await storage.ensureDefaultProjectWorkflow(orgId);
    return def.id;
  };

  apiRoute(app, 'get', '/api/organizations/:orgId/project-workflow', {
    tag: 'Project Workflow',
    summary: 'Get project workflow steps (optionally scoped by ?workflowId)',
    parameters: [pathId('orgId')],
    responses: { ...r200('Workflow steps', { type: 'array' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });

      const wfIdResult = await resolveProjectWorkflowId(req, orgId);
      if (typeof wfIdResult === 'object') return res.status(wfIdResult.status).json({ message: wfIdResult.message });

      let steps = await storage.getProjectWorkflowSteps(orgId, wfIdResult);
      if (steps.length === 0) {
        steps = await storage.resetProjectWorkflowToDefaults(orgId, wfIdResult);
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
    summary: 'Update project workflow steps (optionally scoped by ?workflowId)',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Workflow updated', { type: 'array' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });

      const { steps } = req.body;
      if (!Array.isArray(steps)) return res.status(400).json({ message: "Steps must be an array" });
      for (const step of steps) {
        if (!step.stepKey || !step.label || step.position === undefined) {
          return res.status(400).json({ message: "Each step must have stepKey, label, and position" });
        }
      }

      const wfIdResult = await resolveProjectWorkflowId(req, orgId);
      if (typeof wfIdResult === 'object') return res.status(wfIdResult.status).json({ message: wfIdResult.message });

      const cleaned = steps.map((s: any) => ({
        stepKey: String(s.stepKey),
        label: String(s.label),
        description: s.description ?? null,
        position: Number(s.position),
        isTerminal: !!s.isTerminal,
        isActive: s.isActive !== false,
      }));
      const saved = await storage.upsertProjectWorkflowSteps(orgId, wfIdResult, cleaned);
      res.json(saved);
    } catch (err) {
      console.error("Error updating project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating project workflow configuration" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:orgId/project-workflow/reset', {
    tag: 'Project Workflow',
    summary: 'Reset project workflow to defaults (optionally scoped by ?workflowId)',
    parameters: [pathId('orgId')],
    responses: { ...r200('Workflow reset', { type: 'array' }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });

      const wfIdResult = await resolveProjectWorkflowId(req, orgId);
      if (typeof wfIdResult === 'object') return res.status(wfIdResult.status).json({ message: wfIdResult.message });

      const steps = await storage.resetProjectWorkflowToDefaults(orgId, wfIdResult);
      res.json(steps);
    } catch (err) {
      console.error("Error resetting project workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error resetting project workflow configuration" : classified.message });
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
    requestBody: body({ type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, isDefault: { type: 'boolean' }, creationMode: { type: 'string', enum: ['dialog', 'url'] }, creationUrl: { type: 'string' }, agentTarget: { type: 'string', nullable: true } }, required: ['name'] }),
    responses: { ...r201('Workflow created', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const accessibleOrgIds = await getUserOrgIds(userId);
      if (!accessibleOrgIds.includes(orgId)) return res.status(403).json({ message: "You don't have access to this organization" });
      const { name, description, isDefault, creationMode, creationUrl, agentTarget } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: "Name is required" });
      const mode: 'dialog' | 'url' = creationMode === 'url' ? 'url' : 'dialog';
      if (mode === 'url') {
        if (!creationUrl || typeof creationUrl !== 'string') return res.status(400).json({ message: "creationUrl is required when creationMode is 'url'" });
        if (!/^https?:\/\//i.test(creationUrl)) return res.status(400).json({ message: "creationUrl must start with http:// or https://" });
      }
      const normalizedAgent = agentTarget === 'powerbi' ? 'powerbi' : null;
      const wf = await storage.createIntakeWorkflow({
        organizationId: orgId,
        name: name.trim(),
        description: description || null,
        isDefault: !!isDefault,
        isActive: true,
        creationMode: mode,
        creationUrl: mode === 'url' ? creationUrl : null,
        agentTarget: normalizedAgent,
      });
      // Seed default steps for the new workflow (only when it manages its own intake form)
      if (mode === 'dialog' && !normalizedAgent) {
        await storage.resetIntakeWorkflowToDefaults(orgId, wf.id);
      }
      res.status(201).json(wf);
    } catch (err) {
      console.error("Error creating intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating intake workflow" : (err instanceof Error ? err.message : classified.message) });
    }
  });

  apiRoute(app, 'patch', '/api/organizations/:orgId/intake-workflows/:wfId', {
    tag: 'Intake Workflow',
    summary: 'Update an intake workflow (name, description, isDefault, isActive, creationMode, creationUrl, agentTarget)',
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
      const { name, description, isDefault, isActive, creationMode, creationUrl, agentTarget } = req.body || {};
      const updates: Partial<InsertIntakeWorkflow> = {};
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
      if (agentTarget !== undefined) {
        updates.agentTarget = agentTarget === 'powerbi' ? 'powerbi' : null;
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
      // Don't allow deleting the last workflow for an org
      const all = await storage.getIntakeWorkflows(orgId);
      if (all.length <= 1) return res.status(400).json({ message: "Cannot delete the last intake workflow. Create another workflow first." });
      await storage.deleteIntakeWorkflow(wfId);
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting intake workflow:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: err instanceof Error ? err.message : classified.message });
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
      const updates: Partial<InsertProjectWorkflow> = {};
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

  // ==================== INTAKE FINANCIALS ====================

  apiRoute(app, 'get', '/api/project-intakes/:intakeId/financials', {
    tag: 'Intake Financials',
    summary: 'List financial estimates for an intake',
    parameters: [pathId('intakeId')],
    responses: { ...r200('Intake financials', arrOf('IntakeFinancial')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const intakeId = Number(req.params.intakeId);
      const intake = await storage.getProjectIntake(intakeId);
      if (!intake) return res.status(404).json({ message: 'Intake not found' });
      if (!await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const rows = await storage.getIntakeFinancials(intakeId);
      res.json(rows);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error fetching intake financials' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/project-intakes/:intakeId/financials', {
    tag: 'Intake Financials',
    summary: 'Create financial estimate for intake',
    parameters: [pathId('intakeId')],
    requestBody: body(ref('IntakeFinancial')),
    responses: { ...r201('Intake financial created', ref('IntakeFinancial')), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      const intakeId = Number(req.params.intakeId);
      const intake = await storage.getProjectIntake(intakeId);
      if (!intake) return res.status(404).json({ message: 'Intake not found' });
      if (!await userHasOrgAccess(userId!, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const input = api.intakeFinancials.create.input.parse(req.body);
      const existingRows = await storage.getIntakeFinancials(intakeId);
      if (existingRows.some(r => r.fiscalYear === input.fiscalYear)) {
        return res.status(400).json({ message: `An estimate for fiscal year ${input.fiscalYear} already exists for this intake.` });
      }
      const created = await storage.createIntakeFinancial({ ...input, intakeId });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error creating intake financial' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/intake-financials/:id', {
    tag: 'Intake Financials',
    summary: 'Update intake financial estimate',
    parameters: [pathId()],
    requestBody: body(ref('IntakeFinancial'), false),
    responses: { ...r200('Intake financial updated', ref('IntakeFinancial')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getIntakeFinancial(id);
      if (!existing) return res.status(404).json({ message: 'Intake financial not found' });
      const intake = await storage.getProjectIntake(existing.intakeId);
      if (!intake || !await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const updates = api.intakeFinancials.update.input.parse(req.body);
      if (updates.fiscalYear !== undefined && updates.fiscalYear !== existing.fiscalYear) {
        const existingRows = await storage.getIntakeFinancials(existing.intakeId);
        if (existingRows.some(r => r.id !== id && r.fiscalYear === updates.fiscalYear)) {
          return res.status(400).json({ message: `An estimate for fiscal year ${updates.fiscalYear} already exists for this intake.` });
        }
      }
      const updated = await storage.updateIntakeFinancial(id, updates);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error updating intake financial' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/intake-financials/:id', {
    tag: 'Intake Financials',
    summary: 'Delete intake financial estimate',
    parameters: [pathId()],
    responses: { ...r204('Intake financial deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getIntakeFinancial(id);
      if (!existing) return res.status(404).json({ message: 'Intake financial not found' });
      const intake = await storage.getProjectIntake(existing.intakeId);
      if (!intake || !await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.deleteIntakeFinancial(id);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error deleting intake financial' : classified.message });
    }
  });

  // ==================== INTAKE GOVERNANCE QUESTIONS ====================

  apiRoute(app, 'get', '/api/project-intakes/:intakeId/governance-questions', {
    tag: 'Intake Governance Questions',
    summary: 'List governance questionnaire rows for an intake',
    parameters: [pathId('intakeId')],
    responses: { ...r200('Governance questions', arrOf('IntakeGovernanceQuestion')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const intakeId = Number(req.params.intakeId);
      const intake = await storage.getProjectIntake(intakeId);
      if (!intake) return res.status(404).json({ message: 'Intake not found' });
      if (!await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const categoryRaw = typeof req.query.category === 'string' ? req.query.category : undefined;
      const category = categoryRaw === 'architecture' || categoryRaw === 'cybersecurity' ? categoryRaw : undefined;
      const rows = await storage.getIntakeGovernanceQuestions(intakeId, category);
      res.json(rows);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error fetching governance questions' : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/project-intakes/:intakeId/governance-questions', {
    tag: 'Intake Governance Questions',
    summary: 'Create governance questionnaire row',
    parameters: [pathId('intakeId')],
    requestBody: body(ref('IntakeGovernanceQuestion')),
    responses: { ...r201('Governance question created', ref('IntakeGovernanceQuestion')), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      const intakeId = Number(req.params.intakeId);
      const intake = await storage.getProjectIntake(intakeId);
      if (!intake) return res.status(404).json({ message: 'Intake not found' });
      if (!await userHasOrgAccess(userId!, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const input = api.intakeGovernanceQuestions.create.input.parse(req.body);
      const created = await storage.createIntakeGovernanceQuestion({ ...input, intakeId });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error creating governance question' : classified.message });
    }
  });

  apiRoute(app, 'put', '/api/intake-governance-questions/:id', {
    tag: 'Intake Governance Questions',
    summary: 'Update governance questionnaire row',
    parameters: [pathId()],
    requestBody: body(ref('IntakeGovernanceQuestion'), false),
    responses: { ...r200('Governance question updated', ref('IntakeGovernanceQuestion')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getIntakeGovernanceQuestion(id);
      if (!existing) return res.status(404).json({ message: 'Governance question not found' });
      const intake = await storage.getProjectIntake(existing.intakeId);
      if (!intake || !await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const updates = api.intakeGovernanceQuestions.update.input.parse(req.body);
      const updated = await storage.updateIntakeGovernanceQuestion(id, updates);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: formatZodErrors(err) });
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error updating governance question' : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/intake-governance-questions/:id', {
    tag: 'Intake Governance Questions',
    summary: 'Delete governance questionnaire row',
    parameters: [pathId()],
    responses: { ...r204('Governance question deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getIntakeGovernanceQuestion(id);
      if (!existing) return res.status(404).json({ message: 'Governance question not found' });
      const intake = await storage.getProjectIntake(existing.intakeId);
      if (!intake || !await userHasOrgAccess(userId, intake.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      await storage.deleteIntakeGovernanceQuestion(id);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error deleting governance question' : classified.message });
    }
  });

}
