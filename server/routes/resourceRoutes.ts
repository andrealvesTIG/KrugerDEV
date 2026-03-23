import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { taskResourceAssignments, issueResourceAssignments, issues, resources, tasks, projects, portfolios, notifications } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  getUserOrgRole,
  requireEmailVerified,
} from "./helpers";

export function registerResourceRoutes(app: Express) {
  // ==================== RESOURCES ====================
  
  // Get all resources for an organization
  app.get('/api/resources', async (req, res) => {
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
      const resourceList = await storage.getResources(organizationId);
      res.json(resourceList);
    } catch (err) {
      console.error("Error fetching resources:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resources" : classified.message });
    }
  });

  // Find potential duplicate resources for matching and merging
  app.get('/api/resources/duplicates', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const allResources = await storage.getResources(organizationId);
      
      // Normalize string for comparison (remove accents, lowercase)
      const normalize = (str: string): string => {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[^a-z0-9\s]/g, ' ')    // Replace special chars with space
          .trim();
      };
      
      // Extract name parts from email (e.g., "john.doe@email.com" -> ["john", "doe"])
      const extractNameFromEmail = (email: string): string[] => {
        const localPart = email.split('@')[0];
        return localPart.split(/[._-]/).filter(p => p.length > 1);
      };
      
      // Find potential duplicates by name similarity or email match
      const duplicateGroups: { resources: typeof allResources; matchType: string }[] = [];
      const processedIds = new Set<number>();
      
      for (let i = 0; i < allResources.length; i++) {
        if (processedIds.has(allResources[i].id)) continue;
        
        const resource = allResources[i];
        const matches: typeof allResources = [resource];
        const normalizedName1 = normalize(resource.displayName);
        const nameParts1 = normalizedName1.split(/\s+/).filter(p => p.length > 1);
        
        // Also check if displayName looks like an email
        const emailNameParts1 = resource.displayName.includes('@') 
          ? extractNameFromEmail(resource.displayName) 
          : [];
        
        for (let j = i + 1; j < allResources.length; j++) {
          if (processedIds.has(allResources[j].id)) continue;
          
          const other = allResources[j];
          const normalizedName2 = normalize(other.displayName);
          const nameParts2 = normalizedName2.split(/\s+/).filter(p => p.length > 1);
          const emailNameParts2 = other.displayName.includes('@') 
            ? extractNameFromEmail(other.displayName) 
            : [];
          
          let matchType = '';
          
          // Check exact email match
          if (resource.email && other.email && 
              resource.email.toLowerCase() === other.email.toLowerCase()) {
            matchType = 'email';
          }
          // Check exact normalized name match
          else if (normalizedName1 === normalizedName2) {
            matchType = 'exact_name';
          }
          // Check if one's email matches other's name parts
          else if (resource.email && nameParts2.length >= 2) {
            const emailParts = extractNameFromEmail(resource.email);
            if (emailParts.length >= 2 && 
                emailParts[0] === nameParts2[0] && 
                emailParts[1].startsWith(nameParts2[1].charAt(0))) {
              matchType = 'email_to_name';
            }
          }
          else if (other.email && nameParts1.length >= 2) {
            const emailParts = extractNameFromEmail(other.email);
            if (emailParts.length >= 2 && 
                emailParts[0] === nameParts1[0] && 
                emailParts[1].startsWith(nameParts1[1].charAt(0))) {
              matchType = 'email_to_name';
            }
          }
          // Check if displayName is an email that matches the other's name
          else if (emailNameParts1.length >= 2 && nameParts2.length >= 2) {
            if (emailNameParts1[0] === nameParts2[0] && 
                emailNameParts1[1].startsWith(nameParts2[1].charAt(0))) {
              matchType = 'email_name_match';
            }
          }
          else if (emailNameParts2.length >= 2 && nameParts1.length >= 2) {
            if (emailNameParts2[0] === nameParts1[0] && 
                emailNameParts2[1].startsWith(nameParts1[1].charAt(0))) {
              matchType = 'email_name_match';
            }
          }
          // Check similar names (first name matches + last name starts same)
          else if (nameParts1.length >= 2 && nameParts2.length >= 2) {
            if (nameParts1[0] === nameParts2[0] && nameParts1[0].length > 2) {
              const lastName1 = nameParts1[nameParts1.length - 1];
              const lastName2 = nameParts2[nameParts2.length - 1];
              if (lastName1.charAt(0) === lastName2.charAt(0)) {
                matchType = 'similar_name';
              }
            }
          }
          
          if (matchType) {
            matches.push(other);
            processedIds.add(other.id);
          }
        }
        
        if (matches.length > 1) {
          processedIds.add(resource.id);
          duplicateGroups.push({
            resources: matches,
            matchType: matches.some(m => m.email && resource.email && 
              m.email.toLowerCase() === resource.email.toLowerCase()) ? 'email' : 'name'
          });
        }
      }
      
      res.json({ duplicateGroups });
    } catch (err: any) {
      console.error("Error finding duplicates:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to find duplicates" : classified.message });
    }
  });

  // Merge two resources - keep primary, transfer assignments from secondary, delete secondary
  app.post('/api/resources/merge', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const { primaryId, secondaryId, organizationId } = req.body;
      
      if (!primaryId || !secondaryId || !organizationId) {
        return res.status(400).json({ message: "Primary ID, Secondary ID, and Organization ID are required" });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const primary = await storage.getResource(primaryId);
      const secondary = await storage.getResource(secondaryId);
      
      // If secondary already deleted (by another merge), treat as no-op success
      if (!secondary) {
        if (!primary) {
          return res.status(404).json({ message: "Primary resource not found" });
        }
        return res.json({ 
          message: `Resource already merged or deleted`,
          resource: primary,
          skipped: true
        });
      }
      
      if (!primary) {
        return res.status(404).json({ message: "Primary resource not found" });
      }
      
      if (primary.organizationId !== organizationId || secondary.organizationId !== organizationId) {
        return res.status(403).json({ message: "Resources must belong to the specified organization" });
      }
      
      // Merge by re-pointing assignments and optionally merging data
      const merged = await storage.mergeResources(primaryId, secondaryId);
      
      res.json({ 
        message: `Merged "${secondary.displayName}" into "${primary.displayName}"`,
        resource: merged
      });
    } catch (err: any) {
      console.error("Error merging resources:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to merge resources" : classified.message });
    }
  });

  // Get all resource assignments for an organization (for Assignments View)
  // NOTE: This route MUST come before /api/resources/:id to avoid "assignments" being treated as an ID
  app.get('/api/resources/assignments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const organizationId = Number(req.query.organizationId);
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Get all task resource assignments with related data
      const assignments = await db.select({
        assignmentId: taskResourceAssignments.id,
        taskId: taskResourceAssignments.taskId,
        resourceId: taskResourceAssignments.resourceId,
        allocationPercentage: taskResourceAssignments.allocationPercentage,
        role: taskResourceAssignments.role,
        taskName: tasks.name,
        taskStatus: tasks.status,
        taskProgress: tasks.progress,
        taskStartDate: tasks.startDate,
        taskEndDate: tasks.endDate,
        taskEstimatedHours: tasks.estimatedHours,
        projectId: tasks.projectId,
        projectName: projects.name,
        projectStatus: projects.status,
        portfolioId: projects.portfolioId,
        portfolioName: portfolios.name,
        resourceName: resources.displayName,
        resourceEmail: resources.email,
        resourceTitle: resources.title,
        resourceDepartment: resources.department,
        resourceSkills: resources.skills,
      })
        .from(taskResourceAssignments)
        .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
        .leftJoin(portfolios, eq(projects.portfolioId, portfolios.id))
        .where(eq(resources.organizationId, organizationId))
        .orderBy(resources.displayName, projects.name, tasks.name);

      res.json(assignments);
    } catch (err) {
      console.error("Error fetching resource assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch resource assignments" : classified.message });
    }
  });

  // Get a single resource
  app.get('/api/resources/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const resource = await storage.getResource(Number(req.params.id));
      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, resource.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      res.json(resource);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource" : classified.message });
    }
  });

  // Get task assignments for a resource
  app.get('/api/resources/:id/task-assignments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const resourceId = Number(req.params.id);
      const resource = await storage.getResource(resourceId);
      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, resource.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const assignments = await db.select({
        taskId: taskResourceAssignments.taskId,
        taskName: tasks.name,
        projectId: tasks.projectId,
        projectName: projects.name,
        status: tasks.status,
        progress: tasks.progress,
        startDate: tasks.startDate,
        endDate: tasks.endDate,
        allocationPercentage: taskResourceAssignments.allocationPercentage,
      })
        .from(taskResourceAssignments)
        .innerJoin(tasks, eq(taskResourceAssignments.taskId, tasks.id))
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(taskResourceAssignments.resourceId, resourceId));
      res.json(assignments);
    } catch (err) {
      console.error("Error fetching task assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch task assignments" : classified.message });
    }
  });

  // Get issue assignments for a resource
  app.get('/api/resources/:id/issue-assignments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const resourceId = Number(req.params.id);
      const resource = await storage.getResource(resourceId);
      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, resource.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const assignments = await db.select({
        issueId: issueResourceAssignments.issueId,
        issueTitle: issues.title,
        projectId: issues.projectId,
        projectName: projects.name,
        status: issues.status,
        priority: issues.priority,
        dueDate: issues.targetResolutionDate,
      })
        .from(issueResourceAssignments)
        .innerJoin(issues, eq(issueResourceAssignments.issueId, issues.id))
        .innerJoin(projects, eq(issues.projectId, projects.id))
        .where(eq(issueResourceAssignments.resourceId, resourceId));
      res.json(assignments);
    } catch (err) {
      console.error("Error fetching issue assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch issue assignments" : classified.message });
    }
  });

  // Create a resource
  app.post('/api/resources', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      // Check credit limit before creation
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.RESOURCES);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "resources"
          });
        }
      }
      
      const { organizationId, displayName, email, title, department, skills, hourlyRate, isActive, notes } = req.body;
      if (!organizationId || !displayName) {
        return res.status(400).json({ message: "organizationId and displayName are required" });
      }
      const resource = await storage.createResource({
        organizationId,
        displayName,
        email,
        title,
        department,
        skills,
        hourlyRate,
        isActive,
        notes
      });
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.RESOURCES, resource.id, 1, organizationId);
      }
      
      res.status(201).json(resource);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating resource" : classified.message });
    }
  });

  // Update a resource
  app.put('/api/resources/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getResource(id);
      if (!existing) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const { displayName, email, title, department, skills, hourlyRate, isActive, notes } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (displayName !== undefined) safeUpdate.displayName = displayName;
      if (email !== undefined) safeUpdate.email = email;
      if (title !== undefined) safeUpdate.title = title;
      if (department !== undefined) safeUpdate.department = department;
      if (skills !== undefined) safeUpdate.skills = skills;
      if (hourlyRate !== undefined) safeUpdate.hourlyRate = hourlyRate;
      if (isActive !== undefined) safeUpdate.isActive = isActive;
      if (notes !== undefined) safeUpdate.notes = notes;

      const updated = await storage.updateResource(id, safeUpdate);
      res.json(updated);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating resource" : classified.message });
    }
  });

  // Delete a resource (requires admin role)
  app.delete('/api/resources/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const existing = await storage.getResource(id);
      if (!existing) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const role = await getUserOrgRole(userId, existing.organizationId);
      if (role !== 'org_admin' && role !== 'owner') {
        return res.status(403).json({ message: 'Admin role required to delete resources' });
      }
      await storage.deleteResource(id);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting resource" : classified.message });
    }
  });

  // Create a resource with invitation - creates resource, org invite, and sends magic link email
  app.post('/api/resources/invite', async (req, res) => {
    try {
      const currentUserId = getUserIdFromRequest(req);
      if (!currentUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(currentUserId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const { organizationId, email, projectId, taskId, taskName, projectName, riskId, issueId } = req.body;
      
      if (!organizationId || !email) {
        return res.status(400).json({ message: "organizationId and email are required" });
      }
      
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail.includes('@')) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      
      // Check if user has access to this organization
      if (!await userHasOrgAccess(currentUserId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Check credit limit for resources
      const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(currentUserId, METER_CODES.RESOURCES);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "Credits limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "resources"
        });
      }
      
      // Check if resource already exists with this email
      const existingResources = await storage.getResources(organizationId);
      const existingResource = existingResources.find(r => r.email?.toLowerCase() === normalizedEmail);
      if (existingResource) {
        return res.status(409).json({ 
          message: "A resource with this email already exists in this organization",
          existingResourceId: existingResource.id
        });
      }
      
      // Get organization info
      const org = await storage.getOrganization(organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      // Create the resource with email as display name
      const displayName = normalizedEmail.split('@')[0];
      const resource = await storage.createResource({
        organizationId,
        displayName: displayName.charAt(0).toUpperCase() + displayName.slice(1),
        email: normalizedEmail,
        isActive: true,
        invitedProjectIds: projectId ? [projectId] : null,
      });
      
      // Record usage after successful creation
      if (currentUserId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(currentUserId, METER_CODES.RESOURCES, resource.id);
      }
      
      // Check if there's already an organization invite for this email
      const existingInvites = await storage.getOrganizationInvites(organizationId);
      const pendingInvite = existingInvites.find(i => 
        i.email.toLowerCase() === normalizedEmail && i.status === 'pending'
      );
      
      // Create organization invite if not already pending
      if (!pendingInvite) {
        await storage.createOrganizationInvite({
          organizationId,
          email: normalizedEmail,
          role: 'member',
          invitedBy: currentUserId,
          status: 'pending'
        });
      }
      
      // Generate a magic link token for resource invitation (7 day expiry)
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      // Store the token
      await db.insert(magicLinkTokens).values({
        email: normalizedEmail,
        token,
        type: "resource_invite",
        expiresAt,
        metadata: JSON.stringify({
          organizationId,
          resourceId: resource.id,
          projectId: projectId || null,
          taskId: taskId || null,
          riskId: riskId || null,
          issueId: issueId || null
        })
      });
      
      // Get inviter info
      const inviter = await storage.getUser(currentUserId);
      const inviterName = inviter 
        ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.email || 'An administrator'
        : 'An administrator';
      
      // Build magic link URL
      const appUrl = process.env.APP_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'https://fridayreport.ai');
      const magicLinkUrl = `${appUrl}/resource-invite?token=${token}`;
      
      // Send the resource invitation email
      const { sendResourceInviteEmail } = await import("../services/email");
      const emailSent = await sendResourceInviteEmail(
        normalizedEmail,
        org.name,
        inviterName,
        projectName || null,
        taskName || null,
        magicLinkUrl
      );
      
      if (!emailSent) {
        console.log(`\n===== RESOURCE INVITATION LINK =====`);
        console.log(`Email: ${normalizedEmail}`);
        console.log(`Organization: ${org.name}`);
        console.log(`Invite URL: ${magicLinkUrl}`);
        console.log(`Expires: ${expiresAt.toISOString()}`);
        console.log(`====================================\n`);
      }
      
      // Assign the new resource to the task if taskId was provided
      if (taskId) {
        try {
          // Get current assignments and add the new resource
          const currentAssignments = await storage.getTaskResourceAssignments(taskId);
          const currentResourceIds = currentAssignments.map(a => a.resourceId);
          if (!currentResourceIds.includes(resource.id)) {
            await storage.updateTaskResourceAssignments(taskId, [...currentResourceIds, resource.id]);
            console.log(`Assigned resource ${resource.id} to task ${taskId}`);
          }
        } catch (assignErr) {
          console.error("Failed to auto-assign resource to task:", assignErr);
          // Don't fail the whole request if assignment fails
        }
      }
      
      res.status(201).json({
        resource,
        inviteSent: true,
        taskAssigned: !!taskId,
        message: `Resource created and invitation sent to ${normalizedEmail}`
      });
    } catch (err) {
      console.error("Error creating resource with invitation:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating resource with invitation" : classified.message });
    }
  });

  // ==================== TASK RESOURCE ASSIGNMENTS ====================
  
  // Get all task resource assignments for an organization with full resource data (bulk endpoint - avoids N+1 queries)
  app.get('/api/organizations/:id/full-task-assignments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const orgId = Number(req.params.id);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const assignments = await storage.getAllTaskResourceAssignments(orgId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching org task assignments" : classified.message });
    }
  });

  // Get all task resource assignments for a project (bulk endpoint - avoids N+1 queries)
  app.get('/api/projects/:id/task-resource-assignments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const assignments = await storage.getProjectTaskResourceAssignments(projectId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project task assignments" : classified.message });
    }
  });

  // Get all issue resource assignments for an organization (bulk endpoint - avoids N+1 queries)
  app.get('/api/organizations/:id/issue-assignments', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const orgId = Number(req.params.id);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const assignments = await storage.getAllIssueResourceAssignments(orgId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching issue assignments" : classified.message });
    }
  });

  // Get assignments for a task
  app.get('/api/tasks/:taskId/resources', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const taskId = Number(req.params.taskId);
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: 'Task not found' });
      const project = await storage.getProject(task.projectId);
      if (project && !await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const assignments = await storage.getTaskResourceAssignments(taskId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching task assignments" : classified.message });
    }
  });

  // Update assignments for a task (replace all)
  app.put('/api/tasks/:taskId/resources', async (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const { resourceIds, allocations } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }
      
      // Get existing assignments before update to find new ones
      const existingAssignments = await storage.getTaskResourceAssignments(taskId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      // Pass allocations to storage (array of { resourceId, allocationPercentage })
      await storage.updateTaskResourceAssignments(taskId, resourceIds, allocations);
      const assignments = await storage.getTaskResourceAssignments(taskId);
      
      // Auto-calculate estimated hours based on resource assignments
      if (assignments.length > 0) {
        await recalculateTaskEstimatedHours(taskId);
      } else {
        await storage.updateTask(taskId, { estimatedHours: null });
      }
      
      // Create notifications for newly assigned resources
      const user = req.user as any;
      if (user) {
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            await createTaskAssignmentNotification(
              taskId,
              resourceId,
              user.id,
              user.name || user.email || 'A team member'
            );
          } catch (notifErr) {
            console.error('Error creating task assignment notification:', notifErr);
          }
        }
      }
      
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating task assignments" : classified.message });
    }
  });

  // ==================== ISSUE RESOURCE ASSIGNMENTS ====================
  
  // Get assignments for an issue
  app.get('/api/issues/:issueId/resources', async (req, res) => {
    try {
      const issueId = Number(req.params.issueId);
      const assignments = await storage.getIssueResourceAssignments(issueId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching issue assignments" : classified.message });
    }
  });

  // Update assignments for an issue (replace all)
  app.put('/api/issues/:issueId/resources', async (req, res) => {
    try {
      const issueId = Number(req.params.issueId);
      const { resourceIds } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }
      
      // Get existing assignments before update to find new ones
      const existingAssignments = await storage.getIssueResourceAssignments(issueId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateIssueResourceAssignments(issueId, resourceIds);
      const assignments = await storage.getIssueResourceAssignments(issueId);
      
      // Create notifications for newly assigned resources
      const user = req.user as any;
      if (user) {
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            // Get the resource to find their userId
            const resource = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
            if (resource[0]?.userId) {
              await createRiskAssignmentNotification(
                issueId,
                resource[0].userId,
                user.id,
                user.name || user.email || 'A team member'
              );
            }
          } catch (notifErr) {
            console.error('Error creating issue assignment notification:', notifErr);
          }
        }
      }
      
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating issue assignments" : classified.message });
    }
  });

  // ==================== RISK RESOURCE ASSIGNMENTS ====================
  
  // Get assignments for a risk
  app.get('/api/risks/:riskId/resources', async (req, res) => {
    try {
      const riskId = Number(req.params.riskId);
      const assignments = await storage.getRiskResourceAssignments(riskId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching risk assignments" : classified.message });
    }
  });

  // Update assignments for a risk (replace all)
  app.put('/api/risks/:riskId/resources', async (req, res) => {
    try {
      const riskId = Number(req.params.riskId);
      const { resourceIds } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }
      
      // Get existing assignments before update to find new ones
      const existingAssignments = await storage.getRiskResourceAssignments(riskId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateRiskResourceAssignments(riskId, resourceIds);
      const assignments = await storage.getRiskResourceAssignments(riskId);
      
      // Create notifications for newly assigned resources
      const user = req.user as any;
      if (user) {
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            // Get the resource to find their userId
            const resource = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
            if (resource[0]?.userId) {
              await createRiskAssignmentNotification(
                riskId,
                resource[0].userId,
                user.id,
                user.name || user.email || 'A team member'
              );
            }
          } catch (notifErr) {
            console.error('Error creating risk assignment notification:', notifErr);
          }
        }
      }
      
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating risk assignments" : classified.message });
    }
  });

  // ==================== RESOURCE SKILLS ====================

  app.get('/api/organizations/:orgId/resources/:resourceId/skills', async (req, res) => {
    try {
      const skills = await storage.getResourceSkills(Number(req.params.resourceId));
      res.json(skills);
    } catch (err) {
      console.error("Error fetching resource skills:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource skills" : classified.message });
    }
  });

  app.get('/api/organizations/:orgId/resource-skills', async (req, res) => {
    try {
      const skills = await storage.getResourceSkillsByOrg(Number(req.params.orgId));
      res.json(skills);
    } catch (err) {
      console.error("Error fetching org resource skills:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource skills" : classified.message });
    }
  });

  app.post('/api/organizations/:orgId/resources/:resourceId/skills', async (req, res) => {
    try {
      const skill = await storage.addResourceSkill({
        organizationId: Number(req.params.orgId),
        resourceId: Number(req.params.resourceId),
        ...req.body
      });
      res.status(201).json(skill);
    } catch (err) {
      console.error("Error adding resource skill:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error adding resource skill" : classified.message });
    }
  });

  app.patch('/api/organizations/:orgId/resource-skills/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { skillName, proficiencyLevel, yearsOfExperience, certified } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (skillName !== undefined) safeUpdate.skillName = skillName;
      if (proficiencyLevel !== undefined) safeUpdate.proficiencyLevel = proficiencyLevel;
      if (yearsOfExperience !== undefined) safeUpdate.yearsOfExperience = yearsOfExperience;
      if (certified !== undefined) safeUpdate.certified = certified;
      const skill = await storage.updateResourceSkill(Number(req.params.id), safeUpdate);
      res.json(skill);
    } catch (err) {
      console.error("Error updating resource skill:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating resource skill" : classified.message });
    }
  });

  app.delete('/api/organizations/:orgId/resource-skills/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.removeResourceSkill(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("Error removing resource skill:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error removing resource skill" : classified.message });
    }
  });

  // ==================== RESOURCE AVAILABILITY ====================

  app.get('/api/organizations/:orgId/resources/:resourceId/availability', async (req, res) => {
    try {
      const entries = await storage.getResourceAvailability(Number(req.params.resourceId));
      res.json(entries);
    } catch (err) {
      console.error("Error fetching resource availability:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource availability" : classified.message });
    }
  });

  app.get('/api/organizations/:orgId/resource-availability', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const entries = await storage.getResourceAvailabilityByOrg(
        Number(req.params.orgId),
        startDate as string | undefined,
        endDate as string | undefined
      );
      res.json(entries);
    } catch (err) {
      console.error("Error fetching org resource availability:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource availability" : classified.message });
    }
  });

  app.post('/api/organizations/:orgId/resources/:resourceId/availability', async (req, res) => {
    try {
      const entry = await storage.addResourceAvailability({
        organizationId: Number(req.params.orgId),
        resourceId: Number(req.params.resourceId),
        ...req.body
      });
      res.status(201).json(entry);
    } catch (err) {
      console.error("Error adding resource availability:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error adding resource availability" : classified.message });
    }
  });

  app.patch('/api/organizations/:orgId/resource-availability/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { startDate, endDate, availableHoursPerDay, availabilityType, notes } = req.body;
      const safeUpdate: Record<string, any> = {};
      if (startDate !== undefined) safeUpdate.startDate = startDate;
      if (endDate !== undefined) safeUpdate.endDate = endDate;
      if (availableHoursPerDay !== undefined) safeUpdate.availableHoursPerDay = availableHoursPerDay;
      if (availabilityType !== undefined) safeUpdate.availabilityType = availabilityType;
      if (notes !== undefined) safeUpdate.notes = notes;
      const entry = await storage.updateResourceAvailability(Number(req.params.id), safeUpdate);
      res.json(entry);
    } catch (err) {
      console.error("Error updating resource availability:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating resource availability" : classified.message });
    }
  });

  app.delete('/api/organizations/:orgId/resource-availability/:id', async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      if (!await userHasOrgAccess(userId, orgId)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.removeResourceAvailability(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      console.error("Error removing resource availability:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error removing resource availability" : classified.message });
    }
  });

  // ==================== AI RESOURCE OPTIMIZATION ====================

  app.post('/api/organizations/:orgId/resource-optimization', async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.id;
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === orgId);
      if (!membership) return res.status(403).json({ message: "Not a member of this organization" });

      const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.AI_RUNS, 1, orgId);
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: limitCheck.error || "AI run limit reached", limitExceeded: true, resourceType: "ai_run" });
      }

      const { generateResourceOptimization } = await import('../services/resourceOptimizationAI');
      const result = await generateResourceOptimization(orgId);

      await recordResourceUsage(userId, METER_CODES.AI_RUNS, `ai_optimization_${orgId}_${Date.now()}`, 1, orgId);

      res.json(result);
    } catch (err: any) {
      console.error("Error generating resource optimization:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error generating resource optimization suggestions" : classified.message });
    }
  });

  // ==================== RESOURCE UTILIZATION & CAPACITY ====================

  app.get('/api/organizations/:orgId/resource-utilization', async (req, res) => {
    try {
      const orgId = Number(req.params.orgId);
      const { startDate, endDate } = req.query;
      
      const allResources = await storage.getResources(orgId);
      const activeResources = allResources.filter(r => r.isActive && !r.deletedAt);
      
      const assignments = await storage.getAllTaskResourceAssignments(orgId);
      
      const availability = await storage.getResourceAvailabilityByOrg(
        orgId,
        startDate as string | undefined,
        endDate as string | undefined
      );

      const timesheetData = startDate && endDate 
        ? await storage.getAllTimesheetEntriesWithDetails(orgId, startDate as string, endDate as string)
        : [];
      
      const utilization = activeResources.map(resource => {
        const resourceAssignments = assignments.filter(a => a.resourceId === resource.id);
        const resourceAvailabilityEntries = availability.filter(a => a.resourceId === resource.id);
        const resourceTimesheets = timesheetData.filter(t => t.entry.resourceId === resource.id);
        
        const weeklyCapacity = Number(resource.weeklyCapacity) || 40;
        const availabilityPct = resource.availability || 100;
        const effectiveWeeklyHours = (weeklyCapacity * availabilityPct) / 100;
        
        const totalAllocationPct = resourceAssignments.reduce((sum, a) => sum + (a.allocationPercentage || 100), 0);
        const allocatedHoursPerWeek = (totalAllocationPct / 100) * weeklyCapacity;
        
        const actualHours = resourceTimesheets.reduce((sum, t) => sum + Number(t.entry.hours), 0);
        
        const timeOffDays = resourceAvailabilityEntries.reduce((sum, entry) => {
          const start = new Date(entry.startDate);
          const end = new Date(entry.endDate);
          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          return sum + days;
        }, 0);
        
        const utilizationPct = effectiveWeeklyHours > 0 ? Math.round((allocatedHoursPerWeek / effectiveWeeklyHours) * 100) : 0;
        const isOverAllocated = totalAllocationPct > 100;
        
        return {
          resourceId: resource.id,
          displayName: resource.displayName,
          department: resource.department,
          title: resource.title,
          weeklyCapacity,
          availabilityPct,
          effectiveWeeklyHours,
          totalAllocationPct,
          allocatedHoursPerWeek,
          actualHours,
          utilizationPct,
          isOverAllocated,
          assignmentCount: resourceAssignments.length,
          timeOffDays,
          assignments: resourceAssignments.map(a => ({
            taskId: a.taskId,
            allocationPercentage: a.allocationPercentage || 100,
          })),
        };
      });
      
      const totalResources = utilization.length;
      const overAllocated = utilization.filter(u => u.isOverAllocated).length;
      const underAllocated = utilization.filter(u => u.utilizationPct < 50).length;
      const avgUtilization = totalResources > 0 
        ? Math.round(utilization.reduce((sum, u) => sum + u.utilizationPct, 0) / totalResources) 
        : 0;
      
      res.json({
        resources: utilization,
        summary: {
          totalResources,
          overAllocated,
          underAllocated,
          optimallyAllocated: totalResources - overAllocated - underAllocated,
          avgUtilization,
        }
      });
    } catch (err) {
      console.error("Error fetching resource utilization:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource utilization" : classified.message });
    }
  });

}
