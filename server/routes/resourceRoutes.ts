import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { taskResourceAssignments, issueResourceAssignments, issues, resources, tasks, projects, portfolios, notifications, resourceAvailability, magicLinkTokens, users } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  getUserOrgRole,
  requireEmailVerified,
  isTeamMemberInOrg,
  getTeamMemberProjectIds,
  getUserResourceIds,
} from "./helpers";
import { createTaskAssignmentNotification, createTaskUnassignmentNotification, createRiskAssignmentNotification } from "../services/notificationEngine";
import { sendTaskAssignmentNotificationEmail } from "../services/email";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404 } from "../route-registry";

export function registerResourceRoutes(app: Express) {
  // ==================== RESOURCES ====================
  
  // Get all resources for an organization
  apiRoute(app, 'get', '/api/resources', {
    tag: 'Resources',
    summary: 'List resources',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Resources list', arrOf('Resource')), ...authRes },
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
      let resourceList = await storage.getResources(organizationId);

      if (await isTeamMemberInOrg(userId, organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, organizationId));
        const allAssignments = await storage.getTaskResourceAssignmentsByOrgId(organizationId);
        const orgTasks = await storage.getTasksByOrganization(organizationId);
        const allowedTaskIds = new Set(orgTasks.filter(t => allowedProjectIds.has(t.projectId)).map(t => t.id));
        const allowedResourceIds = new Set<number>();
        for (const a of allAssignments) {
          if (allowedTaskIds.has(a.taskId)) {
            allowedResourceIds.add(a.resourceId);
          }
        }
        const userResIds = await getUserResourceIds(userId, organizationId);
        for (const id of userResIds) allowedResourceIds.add(id);
        resourceList = resourceList.filter(r => allowedResourceIds.has(r.id));
      }

      res.json(resourceList);
    } catch (err) {
      console.error("Error fetching resources:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resources" : classified.message });
    }
  });

  // Find potential duplicate resources for matching and merging
  apiRoute(app, 'get', '/api/resources/duplicates', {
    tag: 'Resources',
    summary: 'Find duplicate resources',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Duplicate groups', { type: 'object' }), ...authRes },
  }, async (req, res) => {
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
      
      let allResources = await storage.getResources(organizationId);

      if (await isTeamMemberInOrg(userId, organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, organizationId));
        const allAssignments = await storage.getTaskResourceAssignmentsByOrgId(organizationId);
        const orgTasks = await storage.getTasksByOrganization(organizationId);
        const allowedTaskIds = new Set(orgTasks.filter(t => allowedProjectIds.has(t.projectId)).map(t => t.id));
        const allowedResourceIds = new Set<number>();
        for (const a of allAssignments) {
          if (allowedTaskIds.has(a.taskId)) {
            allowedResourceIds.add(a.resourceId);
          }
        }
        const userResIds = await getUserResourceIds(userId, organizationId);
        for (const id of userResIds) allowedResourceIds.add(id);
        allResources = allResources.filter(r => allowedResourceIds.has(r.id));
      }
      
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
  apiRoute(app, 'post', '/api/resources/merge', {
    tag: 'Resources',
    summary: 'Merge duplicate resources',
    requestBody: body({ type: 'object', properties: { primaryId: { type: 'integer' }, duplicateIds: { type: 'array', items: { type: 'integer' } } } }),
    responses: { ...r200('Resources merged', ref('Resource')), ...createRes },
  }, async (req, res) => {
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
  apiRoute(app, 'get', '/api/resources/assignments', {
    tag: 'Resources',
    summary: 'Get resource assignments across all projects',
    parameters: [qInt('organizationId', true, 'Organization ID')],
    responses: { ...r200('Assignments', arrOf('Resource')), ...authRes },
  }, async (req, res) => {
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
      let assignments = await db.select({
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

      if (await isTeamMemberInOrg(userId, organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, organizationId));
        assignments = assignments.filter(a => allowedProjectIds.has(a.projectId));
      }

      res.json(assignments);
    } catch (err) {
      console.error("Error fetching resource assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch resource assignments" : classified.message });
    }
  });

  // Get a single resource
  apiRoute(app, 'get', '/api/resources/:id', {
    tag: 'Resources',
    summary: 'Get resource by ID',
    parameters: [pathId()],
    responses: { ...r200('Resource details', ref('Resource')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const resource = await storage.getResource(Number(req.params.id));
      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, resource.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (await isTeamMemberInOrg(userId, resource.organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, resource.organizationId));
        const allAssignments = await storage.getTaskResourceAssignmentsByOrgId(resource.organizationId);
        const orgTasks = await storage.getTasksByOrganization(resource.organizationId);
        const allowedTaskIds = new Set(orgTasks.filter(t => allowedProjectIds.has(t.projectId)).map(t => t.id));
        const allowedResIds = new Set<number>();
        for (const a of allAssignments) {
          if (allowedTaskIds.has(a.taskId)) allowedResIds.add(a.resourceId);
        }
        const userResIds = await getUserResourceIds(userId, resource.organizationId);
        for (const id of userResIds) allowedResIds.add(id);
        if (!allowedResIds.has(resource.id)) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
      res.json(resource);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource" : classified.message });
    }
  });

  // Get task assignments for a resource
  apiRoute(app, 'get', '/api/resources/:id/task-assignments', {
    tag: 'Resources',
    summary: 'Get resource task assignments',
    parameters: [pathId()],
    responses: { ...r200('Task assignments', ref('Resource')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const resourceId = Number(req.params.id);
      const resource = await storage.getResource(resourceId);
      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, resource.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (await isTeamMemberInOrg(userId, resource.organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, resource.organizationId));
        const orgAssignments = await storage.getTaskResourceAssignmentsByOrgId(resource.organizationId);
        const orgTasks = await storage.getTasksByOrganization(resource.organizationId);
        const allowedTaskIds = new Set(orgTasks.filter(t => allowedProjectIds.has(t.projectId)).map(t => t.id));
        const allowedResIds = new Set<number>();
        for (const a of orgAssignments) {
          if (allowedTaskIds.has(a.taskId)) allowedResIds.add(a.resourceId);
        }
        const userResIds = await getUserResourceIds(userId, resource.organizationId);
        for (const id of userResIds) allowedResIds.add(id);
        if (!allowedResIds.has(resourceId)) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
      let assignments = await db.select({
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
      if (await isTeamMemberInOrg(userId, resource.organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, resource.organizationId));
        assignments = assignments.filter(a => allowedProjectIds.has(a.projectId));
      }
      res.json(assignments);
    } catch (err) {
      console.error("Error fetching task assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch task assignments" : classified.message });
    }
  });

  // Get issue assignments for a resource
  apiRoute(app, 'get', '/api/resources/:id/issue-assignments', {
    tag: 'Resources',
    summary: 'Get resource issue assignments',
    parameters: [pathId()],
    responses: { ...r200('Issue assignments', ref('Resource')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const resourceId = Number(req.params.id);
      const resource = await storage.getResource(resourceId);
      if (!resource) return res.status(404).json({ message: "Resource not found" });
      if (!await userHasOrgAccess(userId, resource.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      if (await isTeamMemberInOrg(userId, resource.organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, resource.organizationId));
        const orgAssignments = await storage.getTaskResourceAssignmentsByOrgId(resource.organizationId);
        const orgTasks = await storage.getTasksByOrganization(resource.organizationId);
        const allowedTaskIds = new Set(orgTasks.filter(t => allowedProjectIds.has(t.projectId)).map(t => t.id));
        const allowedResIds = new Set<number>();
        for (const a of orgAssignments) {
          if (allowedTaskIds.has(a.taskId)) allowedResIds.add(a.resourceId);
        }
        const userResIds = await getUserResourceIds(userId, resource.organizationId);
        for (const id of userResIds) allowedResIds.add(id);
        if (!allowedResIds.has(resourceId)) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
      let assignments = await db.select({
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
      if (await isTeamMemberInOrg(userId, resource.organizationId)) {
        const allowedProjectIds = new Set(await getTeamMemberProjectIds(userId, resource.organizationId));
        assignments = assignments.filter(a => allowedProjectIds.has(a.projectId));
      }
      res.json(assignments);
    } catch (err) {
      console.error("Error fetching issue assignments:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to fetch issue assignments" : classified.message });
    }
  });

  // Create a resource
  apiRoute(app, 'post', '/api/resources', {
    tag: 'Resources',
    summary: 'Create a new resource',
    requestBody: body(ref('Resource')),
    responses: { ...r201('Resource created', ref('Resource')), ...inputRes },
  }, async (req, res) => {
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
        notes,
      });

      await storage.assignAutonumberValuesForEntity({
        organizationId,
        entityType: 'resource',
        entityId: resource.id,
      }).catch((e) => console.error('[autonumber] resource assignment failed:', e));

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
  apiRoute(app, 'put', '/api/resources/:id', {
    tag: 'Resources',
    summary: 'Update resource',
    parameters: [pathId()],
    requestBody: body(ref('Resource')),
    responses: { ...r200('Resource updated', ref('Resource')), ...updateRes },
  }, async (req, res) => {
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
  apiRoute(app, 'delete', '/api/resources/:id', {
    tag: 'Resources',
    summary: 'Delete resource',
    parameters: [pathId()],
    responses: { ...r204('Resource deleted'), ...fullRes },
  }, async (req, res) => {
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
  apiRoute(app, 'post', '/api/resources/invite', {
    tag: 'Resources',
    summary: 'Invite resource via email',
    requestBody: body({ type: 'object', properties: { email: { type: 'string' }, organizationId: { type: 'integer' } } }),
    responses: { ...r201('Invitation sent', ref('Resource')), ...createRes },
  }, async (req, res) => {
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
      const appUrl = 'https://fridayreport.ai';
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
        console.log(`[auth] Resource invite email not sent for ${normalizedEmail} (no email service)`);
      }
      
      // Assign the new resource to the task if taskId was provided
      if (taskId) {
        try {
          // Get current assignments and add the new resource
          const currentAssignments = await storage.getTaskResourceAssignments(taskId);
          const currentResourceIds = currentAssignments.map(a => a.resourceId);
          if (!currentResourceIds.includes(resource.id)) {
            await storage.updateTaskResourceAssignments(taskId, [...currentResourceIds, resource.id]);
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
  apiRoute(app, 'get', '/api/organizations/:id/full-task-assignments', {
    tag: 'Resources',
    summary: 'Get full task assignments for organization',
    parameters: [pathId()],
    responses: { ...r200('Task assignments with resource data', { type: 'object' }), ...idRes },
  }, async (req, res) => {
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
  apiRoute(app, 'get', '/api/projects/:id/task-resource-assignments', {
    tag: 'Resources',
    summary: 'Get all task resource assignments for a project',
    parameters: [pathId()],
    responses: { ...r200('Task resource assignments', arrOf('Resource')), ...idRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/projects/:id/team-members', {
    tag: 'Resources',
    summary: 'Add team member to project',
    parameters: [pathId()],
    requestBody: body({ type: 'object', properties: { resourceId: { type: 'integer' } } }),
    responses: { ...r200('Team member added', ref('Resource')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.id);
      const { resourceId } = req.body;
      if (!resourceId || isNaN(Number(resourceId))) return res.status(400).json({ message: 'Valid resourceId is required' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const role = await getUserOrgRole(userId, project.organizationId);
      if (role === 'viewer') return res.status(403).json({ message: 'Viewers cannot modify team membership' });
      const resource = await storage.getResource(Number(resourceId));
      if (!resource) return res.status(404).json({ message: 'Resource not found' });
      if (resource.organizationId !== project.organizationId) {
        return res.status(400).json({ message: 'Resource does not belong to the same organization' });
      }
      const currentInvites = resource.invitedProjectIds || [];
      if (!currentInvites.includes(projectId)) {
        await storage.updateResource(resource.id, {
          invitedProjectIds: [...currentInvites, projectId]
        });
      }
      res.json({ success: true });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error adding team member" : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/projects/:id/team-members/:resourceId', {
    tag: 'Resources',
    summary: 'Remove team member from project',
    parameters: [pathId(), pathId('resourceId')],
    responses: { ...r200('Team member removed', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.id);
      const resourceId = Number(req.params.resourceId);
      if (isNaN(resourceId)) return res.status(400).json({ message: 'Valid resourceId is required' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const role = await getUserOrgRole(userId, project.organizationId);
      if (role === 'viewer') return res.status(403).json({ message: 'Viewers cannot modify team membership' });
      const resource = await storage.getResource(resourceId);
      if (!resource) return res.status(404).json({ message: 'Resource not found' });
      if (resource.organizationId !== project.organizationId) {
        return res.status(400).json({ message: 'Resource does not belong to the same organization' });
      }
      const currentInvites = resource.invitedProjectIds || [];
      await storage.updateResource(resourceId, {
        invitedProjectIds: currentInvites.filter(id => id !== projectId)
      });
      res.json({ success: true });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error removing team member" : classified.message });
    }
  });

  // Get all issue resource assignments for an organization (bulk endpoint - avoids N+1 queries)
  apiRoute(app, 'get', '/api/organizations/:id/issue-assignments', {
    tag: 'Resources',
    summary: 'Get all issue resource assignments for organization',
    parameters: [pathId()],
    responses: { ...r200('Issue assignments', arrOf('Resource')), ...idRes },
  }, async (req, res) => {
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
  apiRoute(app, 'get', '/api/tasks/:taskId/resources', {
    tag: 'Resources',
    summary: 'Get resources assigned to a task',
    parameters: [pathId('taskId')],
    responses: { ...r200('Task resources', arrOf('Resource')), ...idRes },
  }, async (req, res) => {
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
  apiRoute(app, 'put', '/api/tasks/:taskId/resources', {
    tag: 'Resources',
    summary: 'Update task resource assignments',
    parameters: [pathId('taskId')],
    requestBody: body({ type: 'object', properties: { resourceIds: { type: 'array', items: { type: 'integer' } } } }),
    responses: { ...r200('Assignments updated', ref('Resource')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const verified = await requireEmailVerified(userId);
      if (!verified.verified) return res.status(403).json({ message: verified.error || 'Email verification required' });

      const taskId = Number(req.params.taskId);
      const { resourceIds, allocations, expectedUpdatedAt } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }

      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });

      const project = await storage.getProject(task.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const role = await getUserOrgRole(userId, project.organizationId);
      if (role === 'viewer') {
        return res.status(403).json({ message: 'Viewers cannot modify task assignments' });
      }

      if (expectedUpdatedAt) {
        const taskUpdatedAt = task.updatedAt ? new Date(task.updatedAt).toISOString() : null;
        const expected = new Date(expectedUpdatedAt).toISOString();
        if (taskUpdatedAt && taskUpdatedAt !== expected) {
          return res.status(409).json({ message: 'Task was modified by another user. Please refresh and try again.' });
        }
      }

      const warnings: string[] = [];

      if (resourceIds.length > 0 && task.startDate && task.endDate) {
        for (const resId of resourceIds) {
          const existingAssignments = await db.select({
            allocationPercentage: taskResourceAssignments.allocationPercentage,
          }).from(taskResourceAssignments)
            .where(and(
              eq(taskResourceAssignments.resourceId, resId),
              sql`${taskResourceAssignments.taskId} != ${taskId}`
            ));

          const currentAlloc = allocations?.find((a: any) => a.resourceId === resId)?.allocationPercentage ?? 100;
          const totalAlloc = existingAssignments.reduce((sum, a) => sum + (a.allocationPercentage ?? 100), 0) + currentAlloc;
          if (totalAlloc > 100) {
            const resource = await db.select().from(resources).where(eq(resources.id, resId)).limit(1);
            const name = resource[0]?.displayName || `Resource #${resId}`;
            warnings.push(`${name} is over-allocated at ${totalAlloc}%`);
          }

          const timeOff = await db.select().from(resourceAvailability)
            .where(and(
              eq(resourceAvailability.resourceId, resId),
              lte(resourceAvailability.startDate, task.endDate),
              gte(resourceAvailability.endDate, task.startDate),
              eq(resourceAvailability.status, 'approved')
            ));
          if (timeOff.length > 0) {
            const resource = await db.select().from(resources).where(eq(resources.id, resId)).limit(1);
            const name = resource[0]?.displayName || `Resource #${resId}`;
            warnings.push(`${name} has time-off during the task period`);
          }
        }
      }

      const existingAssignments = await storage.getTaskResourceAssignments(taskId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateTaskResourceAssignments(taskId, resourceIds, allocations);
      const assignments = await storage.getTaskResourceAssignments(taskId);
      
      const user = req.user as any;
      if (user) {
        const userName = user.name || user.email || 'A team member';
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            await createTaskAssignmentNotification(taskId, resourceId, user.id, userName);
          } catch (notifErr) {
            console.error('Error creating task assignment notification:', notifErr);
          }
        }

        const removedResourceIds = [...existingResourceIds].filter(id => !resourceIds.includes(id));
        for (const resourceId of removedResourceIds) {
          try {
            await createTaskUnassignmentNotification(taskId, resourceId, user.id, userName);
          } catch (notifErr) {
            console.error('Error creating task unassignment notification:', notifErr);
          }
        }
      }
      
      res.json({ assignments, warnings });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating task assignments" : classified.message });
    }
  });

  // Send assignment notification emails to all resources assigned to a task
  apiRoute(app, 'post', '/api/tasks/:taskId/notify-assignees', {
    tag: 'Resources',
    summary: 'Send assignment notification emails to all resources assigned to a task',
    parameters: [pathId('taskId')],
    responses: { ...r200('Notification result', { type: 'object' }), ...idRes, ...e400, ...e404 },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const taskId = Number(req.params.taskId);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        return res.status(400).json({ message: 'Invalid task ID' });
      }

      const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task[0]) return res.status(404).json({ message: 'Task not found' });

      const project = await db.select().from(projects).where(eq(projects.id, task[0].projectId)).limit(1);
      if (!project[0]) return res.status(404).json({ message: 'Project not found' });

      if (!await userHasOrgAccess(userId, project[0].organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const userRole = await getUserOrgRole(userId, project[0].organizationId);
      if (userRole === 'viewer') {
        return res.status(403).json({ message: 'Viewers cannot send notifications' });
      }

      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error });
      }

      const assignments = await storage.getTaskResourceAssignments(taskId);
      if (assignments.length === 0) {
        return res.status(400).json({ message: 'No resources assigned to this task' });
      }

      const isProduction = process.env.NODE_ENV === 'production';
      const appUrl = isProduction
        ? (process.env.APP_URL || 'https://fridayreport.ai')
        : (process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : process.env.APP_URL || 'https://fridayreport.ai');
      const taskUrl = `${appUrl}/projects/${project[0].id}?tab=tasks&taskId=${task[0].id}`;

      const formatDate = (d: Date | string | null) => {
        if (!d) return null;
        const date = typeof d === 'string' ? new Date(d) : d;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };

      let assignedByName: string | null = null;
      try {
        const actor = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (actor[0]) {
          const fullName = [actor[0].firstName, actor[0].lastName].filter(Boolean).join(' ').trim();
          assignedByName = fullName || actor[0].email || null;
        }
      } catch {
        assignedByName = null;
      }

      let sent = 0;
      let skipped = 0;
      for (const assignment of assignments) {
        const resource = await db.select().from(resources).where(eq(resources.id, assignment.resourceId)).limit(1);
        if (!resource[0] || !resource[0].email) {
          skipped++;
          continue;
        }
        try {
          const success = await sendTaskAssignmentNotificationEmail(
            resource[0].email,
            resource[0].displayName,
            task[0].name,
            project[0].name,
            formatDate(task[0].startDate),
            formatDate(task[0].endDate),
            taskUrl,
            {
              assignedByName,
              priority: task[0].priority ?? null,
              description: task[0].description ?? null,
            }
          );
          if (success) sent++;
          else skipped++;
        } catch (emailErr) {
          console.error('Error sending assignment notification email:', emailErr);
          skipped++;
        }
      }

      res.json({ sent, skipped, total: assignments.length });
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error sending assignment notifications" : classified.message });
    }
  });

  // ==================== ISSUE RESOURCE ASSIGNMENTS ====================
  
  // Get assignments for an issue
  apiRoute(app, 'get', '/api/issues/:issueId/resources', {
    tag: 'Resources',
    summary: 'Get resources assigned to an issue',
    parameters: [pathId('issueId')],
    responses: { ...r200('Issue resources', arrOf('Resource')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const issueId = Number(req.params.issueId);
      const issue = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
      if (!issue[0]) return res.status(404).json({ message: 'Issue not found' });

      const project = await storage.getProject(issue[0].projectId);
      if (project && !await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const assignments = await storage.getIssueResourceAssignments(issueId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching issue assignments" : classified.message });
    }
  });

  // Update assignments for an issue (replace all)
  apiRoute(app, 'put', '/api/issues/:issueId/resources', {
    tag: 'Resources',
    summary: 'Update issue resource assignments',
    parameters: [pathId('issueId')],
    requestBody: body({ type: 'object', properties: { resourceIds: { type: 'array', items: { type: 'integer' } } } }),
    responses: { ...r200('Assignments updated', ref('Resource')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const verified = await requireEmailVerified(userId);
      if (!verified.verified) return res.status(403).json({ message: verified.error || 'Email verification required' });

      const issueId = Number(req.params.issueId);
      const { resourceIds } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }

      const issue = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
      if (!issue[0]) return res.status(404).json({ message: 'Issue not found' });

      const project = await storage.getProject(issue[0].projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const role = await getUserOrgRole(userId, project.organizationId);
      if (role === 'viewer') {
        return res.status(403).json({ message: 'Viewers cannot modify issue assignments' });
      }

      const existingAssignments = await storage.getIssueResourceAssignments(issueId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateIssueResourceAssignments(issueId, resourceIds);
      const assignments = await storage.getIssueResourceAssignments(issueId);
      
      const user = req.user as any;
      if (user) {
        const userName = user.name || user.email || 'A team member';
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            const resource = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
            if (resource[0]?.userId) {
              await createRiskAssignmentNotification(issueId, resource[0].userId, user.id, userName);
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
  apiRoute(app, 'get', '/api/risks/:riskId/resources', {
    tag: 'Resources',
    summary: 'Get resources assigned to a risk',
    parameters: [pathId('riskId')],
    responses: { ...r200('Risk resources', arrOf('Resource')), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const riskId = Number(req.params.riskId);
      const risk = await db.select().from(issues).where(eq(issues.id, riskId)).limit(1);
      if (!risk[0]) return res.status(404).json({ message: 'Risk not found' });

      const project = await storage.getProject(risk[0].projectId);
      if (project && !await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const assignments = await storage.getRiskResourceAssignments(riskId);
      res.json(assignments);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching risk assignments" : classified.message });
    }
  });

  // Update assignments for a risk (replace all)
  apiRoute(app, 'put', '/api/risks/:riskId/resources', {
    tag: 'Resources',
    summary: 'Update risk resource assignments',
    parameters: [pathId('riskId')],
    requestBody: body({ type: 'object', properties: { resourceIds: { type: 'array', items: { type: 'integer' } } } }),
    responses: { ...r200('Assignments updated', ref('Resource')), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const verified = await requireEmailVerified(userId);
      if (!verified.verified) return res.status(403).json({ message: verified.error || 'Email verification required' });

      const riskId = Number(req.params.riskId);
      const { resourceIds } = req.body;
      if (!Array.isArray(resourceIds)) {
        return res.status(400).json({ message: "resourceIds must be an array" });
      }

      const risk = await db.select().from(issues).where(eq(issues.id, riskId)).limit(1);
      if (!risk[0]) return res.status(404).json({ message: 'Risk not found' });

      const project = await storage.getProject(risk[0].projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });

      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      const role = await getUserOrgRole(userId, project.organizationId);
      if (role === 'viewer') {
        return res.status(403).json({ message: 'Viewers cannot modify risk assignments' });
      }

      const existingAssignments = await storage.getRiskResourceAssignments(riskId);
      const existingResourceIds = new Set(existingAssignments.map(a => a.resourceId));
      
      await storage.updateRiskResourceAssignments(riskId, resourceIds);
      const assignments = await storage.getRiskResourceAssignments(riskId);
      
      const user = req.user as any;
      if (user) {
        const userName = user.name || user.email || 'A team member';
        const newResourceIds = resourceIds.filter((id: number) => !existingResourceIds.has(id));
        for (const resourceId of newResourceIds) {
          try {
            const resource = await db.select().from(resources).where(eq(resources.id, resourceId)).limit(1);
            if (resource[0]?.userId) {
              await createRiskAssignmentNotification(riskId, resource[0].userId, user.id, userName);
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

  apiRoute(app, 'get', '/api/organizations/:orgId/resources/:resourceId/skills', {
    tag: 'Resources',
    summary: 'Get resource skills',
    parameters: [pathId('orgId'), pathId('resourceId')],
    responses: { ...r200('Resource skills', { type: 'array', items: { type: 'object' } }), ...idRes },
  }, async (req, res) => {
    try {
      const skills = await storage.getResourceSkills(Number(req.params.resourceId));
      res.json(skills);
    } catch (err) {
      console.error("Error fetching resource skills:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource skills" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:orgId/resource-skills', {
    tag: 'Resources',
    summary: 'List all resource skills for org',
    parameters: [pathId('orgId')],
    responses: { ...r200('All resource skills', arrOf('Resource')), ...idRes },
  }, async (req, res) => {
    try {
      const skills = await storage.getResourceSkillsByOrg(Number(req.params.orgId));
      res.json(skills);
    } catch (err) {
      console.error("Error fetching org resource skills:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource skills" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/organizations/:orgId/resources/:resourceId/skills', {
    tag: 'Resources',
    summary: 'Add skill to resource',
    parameters: [pathId('orgId'), pathId('resourceId')],
    requestBody: body({ type: 'object', properties: { name: { type: 'string' }, level: { type: 'string' } } }),
    responses: { ...r201('Skill added', ref('Resource')), ...createRes },
  }, async (req, res) => {
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

  apiRoute(app, 'patch', '/api/organizations/:orgId/resource-skills/:id', {
    tag: 'Resources',
    summary: 'Update a resource skill',
    parameters: [pathId('orgId'), pathId()],
    requestBody: body({ type: 'object', properties: { name: { type: 'string' }, level: { type: 'string' } } }),
    responses: { ...r200('Skill updated', ref('Resource')), ...updateRes },
  }, async (req, res) => {
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

  apiRoute(app, 'delete', '/api/organizations/:orgId/resource-skills/:id', {
    tag: 'Resources',
    summary: 'Delete a resource skill',
    parameters: [pathId('orgId'), pathId()],
    responses: { ...r200('Skill deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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

  apiRoute(app, 'get', '/api/organizations/:orgId/resources/:resourceId/availability', {
    tag: 'Resources',
    summary: 'Get resource availability',
    parameters: [pathId('orgId'), pathId('resourceId')],
    responses: { ...r200('Availability data', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const entries = await storage.getResourceAvailability(Number(req.params.resourceId));
      res.json(entries);
    } catch (err) {
      console.error("Error fetching resource availability:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching resource availability" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/organizations/:orgId/resource-availability', {
    tag: 'Resources',
    summary: 'List all resource availability for org',
    parameters: [pathId('orgId')],
    responses: { ...r200('All availability', arrOf('Resource')), ...idRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/organizations/:orgId/resources/:resourceId/availability', {
    tag: 'Resources',
    summary: 'Add availability entry for resource',
    parameters: [pathId('orgId'), pathId('resourceId')],
    requestBody: body({ type: 'object', properties: { startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, hoursPerWeek: { type: 'number' } } }),
    responses: { ...r201('Availability entry created', ref('Resource')), ...createRes },
  }, async (req, res) => {
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

  apiRoute(app, 'patch', '/api/organizations/:orgId/resource-availability/:id', {
    tag: 'Resources',
    summary: 'Update an availability entry',
    parameters: [pathId('orgId'), pathId()],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Availability updated', ref('Resource')), ...updateRes },
  }, async (req, res) => {
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

  apiRoute(app, 'delete', '/api/organizations/:orgId/resource-availability/:id', {
    tag: 'Resources',
    summary: 'Delete an availability entry',
    parameters: [pathId('orgId'), pathId()],
    responses: { ...r200('Availability deleted', { type: 'object', properties: { message: { type: 'string' } } }), ...fullRes },
  }, async (req, res) => {
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

  apiRoute(app, 'post', '/api/organizations/:orgId/resource-optimization', {
    tag: 'Resources',
    summary: 'Run AI resource optimization',
    parameters: [pathId('orgId')],
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Optimization results', { type: 'array', items: { type: 'object' } }), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });
      const orgId = Number(req.params.orgId);
      const memberships = await storage.getUserOrganizations(userId);
      const membership = memberships.find(m => m.organizationId === orgId);
      if (!membership) return res.status(403).json({ message: "Not a member of this organization" });

      // AI credit enforcement + recording happens inside
      // `generateResourceOptimization` via `withAiCredits`. Don't double-charge.
      const { generateResourceOptimization } = await import('../services/resourceOptimizationAI');
      let result;
      try {
        result = await generateResourceOptimization(orgId, userId);
      } catch (limitErr) {
        const { sendLimitExceeded } = await import("../services/aiCredits");
        if (sendLimitExceeded(res, limitErr)) return;
        throw limitErr;
      }

      res.json(result);
    } catch (err: any) {
      console.error("Error generating resource optimization:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error generating resource optimization suggestions" : classified.message });
    }
  });

  // ==================== RESOURCE UTILIZATION & CAPACITY ====================

  apiRoute(app, 'get', '/api/organizations/:orgId/resource-utilization', {
    tag: 'Resources',
    summary: 'Get resource utilization report',
    parameters: [pathId('orgId')],
    responses: { ...r200('Utilization data', { type: 'object' }), ...idRes },
  }, async (req, res) => {
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
