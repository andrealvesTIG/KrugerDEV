import type { Express } from "express";
import { api } from "@shared/routes";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { eq, and, asc, inArray } from "drizzle-orm";
import { users, taskResourceAssignments, issues, resources, tasks, projects, plans, timesheetEntries, taskChangeLogs, taskDependencies, notifications, type Task } from "@shared/schema";
import type { User } from "@shared/models/auth";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  getUserOrgIds,
  userHasAnyOrgAccess,
  requireEmailVerified,
  getTeamMemberProjectIds,
  logUserActivity,
  formatZodErrors,
  getUserOrgRole,
  hasAdminAccess,
} from "./helpers";
import { mapPlannerPriorityToProjectPriority, mapPlannerPercentToStatus, getOrgIntegration } from "../services/microsoftPlanner";
import { mapDataversePriorityToProjectPriority, mapDataverseProgressToStatus } from "../services/microsoftDataverse";
import { addWorkingDays, ensureWorkingDay, calculateEndDate, calculateDuration, nextWorkingDay, formatDateStr, workingDaysBetweenExclusive } from "../lib/workingDays";
import { createProjectAssignmentNotification } from "../services/notificationEngine";
import { sendEmail } from "../services/email";
import { invalidateOrganizationContextCache } from "../services/jarvisService";
import { apiRoute, pathId, body, ref, arrOf, r200, r201, r204, qInt, qStr, qBool, pathStr, authRes, stdRes, fullRes, inputRes, createRes, updateRes, idRes, e400, e404, p } from "../route-registry";

export function registerProjectRoutes(app: Express) {
  // --- Projects ---
  apiRoute(app, 'get', api.projects.list.path, {
    tag: 'Projects',
    summary: 'List projects',
    parameters: [qInt('organizationId', false, 'Filter by organization'), qInt('portfolioId', false, 'Filter by portfolio'), qStr('isInternal', false, 'Filter by internal status'), qInt('page', false, 'Page number'), qInt('pageSize', false, 'Page size')],
    responses: { ...r200('List of projects', arrOf('Project')), ...authRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    
    // Deny access if user is not a member of any organization
    if (!await userHasAnyOrgAccess(userId)) {
      const page = req.query.page ? Number(req.query.page) : undefined;
      if (page !== undefined) {
        return res.json({ projects: [], total: 0, page: page || 1, pageSize: Number(req.query.pageSize) || 10 });
      }
      return res.json([]);
    }
    
    const requestedOrgId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
    const portfolioId = req.query.portfolioId ? Number(req.query.portfolioId) : undefined;
    const isInternal = req.query.isInternal !== undefined ? req.query.isInternal === 'true' : undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 10;
    
    // Get user's accessible org IDs
    const accessibleOrgIds = await getUserOrgIds(userId);
    
    // If requesting a specific org, check access
    if (requestedOrgId && !accessibleOrgIds.includes(requestedOrgId)) {
      if (page !== undefined) {
        return res.json({ projects: [], total: 0, page: page || 1, pageSize });
      }
      return res.json([]);
    }
    
    const allProjects = await storage.getProjects(requestedOrgId, portfolioId, isInternal);
    
    // Filter projects to only those in accessible orgs
    let filteredProjects = allProjects.filter(p => 
      p.organizationId !== null && accessibleOrgIds.includes(p.organizationId)
    );
    
    // For team_member role, further filter to only assigned projects
    if (userId) {
      const userOrgs = await storage.getUserOrganizations(userId);
      for (const membership of userOrgs) {
        if (membership.role === 'team_member') {
          const assignedProjectIds = await getTeamMemberProjectIds(userId, membership.organizationId);
          filteredProjects = filteredProjects.filter(p => 
            p.organizationId !== membership.organizationId || assignedProjectIds.includes(p.id)
          );
        }
      }
    }
    
    // If pagination requested, return paginated response
    if (page !== undefined) {
      const currentPage = Math.max(1, page);
      const total = filteredProjects.length;
      // Sort by most recent first before paginating
      filteredProjects.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      const start = (currentPage - 1) * pageSize;
      const paginatedProjects = filteredProjects.slice(start, start + pageSize);
      return res.json({ projects: paginatedProjects, total, page: currentPage, pageSize });
    }
    
    res.json(filteredProjects);
  });

  apiRoute(app, 'get', api.projects.get.path, {
    tag: 'Projects',
    summary: 'Get project by ID',
    parameters: [pathId()],
    responses: { ...r200('Project details', ref('Project')), ...idRes },
  }, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: 'Authentication required' });
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!await userHasOrgAccess(userId, project.organizationId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Fetch user names for createdBy and updatedBy in parallel
    const [createdByUser, updatedByUser] = await Promise.all([
      project.createdBy ? db.select().from(users).where(eq(users.id, project.createdBy)).then(r => r[0] ?? null) : Promise.resolve(null),
      project.updatedBy ? db.select().from(users).where(eq(users.id, project.updatedBy)).then(r => r[0] ?? null) : Promise.resolve(null),
    ]);
    const formatName = (u: typeof createdByUser) => u ? (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username || u.email) : null;
    const createdByName = formatName(createdByUser);
    const updatedByName = formatName(updatedByUser);
    
    res.json({
      ...project,
      createdByName,
      updatedByName
    });
  });

  apiRoute(app, 'post', api.projects.create.path, {
    tag: 'Projects',
    summary: 'Create a new project',
    requestBody: body(ref('ProjectRequest')),
    responses: { ...r201('Project created', ref('Project')), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const input = api.projects.create.input.parse(req.body);
      
      if (!await userHasOrgAccess(userId, input.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Check project limit before creation (using org subscription if available)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PROJECTS, 1, input.organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Project limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "projects"
          });
        }
      }
      const sanitizedInput = {
        ...input,
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        createdBy: userId || null,
        updatedAt: new Date(),
        updatedBy: userId || null,
      };
      const project = await storage.createProject(sanitizedInput);

      await storage.assignAutonumberValuesForEntity({
        organizationId: project.organizationId,
        entityType: 'project',
        entityId: project.id,
      }).catch((e) => console.error('[autonumber] project assignment failed:', e));

      if (userId) {
        await logUserActivity(userId, 'create_project', 'project', project.id, { name: project.name, organizationId: project.organizationId }, req).catch((e) => {
          console.error('[activity] failed to log create_project:', e);
        });
      }
      
      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.PROJECTS, project.id, 1, project.organizationId);
      }
      
      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      const creatorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System';
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: creatorName,
        changeType: 'created',
        changeSummary: `Project "${project.name}" created by ${creatorName}`,
        previousValues: null,
        newValues: JSON.stringify(project),
      });
      
      // If the creator is a team_member, auto-add this project to their invitedProjectIds
      // so they can see the project they just created
      if (userId && project.organizationId) {
        const userOrgs = await storage.getUserOrganizations(userId);
        const membership = userOrgs.find(m => m.organizationId === project.organizationId);
        if (membership?.role === 'team_member') {
          // Find the user's resource in this org
          const resources = await storage.getResources(project.organizationId);
          const userResource = resources.find(r => r.userId === userId);
          if (userResource) {
            const currentInvites = userResource.invitedProjectIds || [];
            if (!currentInvites.includes(project.id)) {
              await storage.updateResource(userResource.id, {
                invitedProjectIds: [...currentInvites, project.id]
              });
            }
          }
        }
      }
      
      invalidateOrganizationContextCache(project.organizationId);
      res.status(201).json(project);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      console.error('Error creating project:', err);
      const classified = classifyError(err);
      return res.status(classified.status).json({ message: classified.status === 500 ? "Failed to create project" : classified.message });
    }
  });

  // Import project from Microsoft Planner (organization-scoped)
  apiRoute(app, 'post', '/api/planner/import', {
    tag: 'Projects',
    summary: 'Import tasks from Microsoft Planner',
    requestBody: body({ type: 'object', properties: { planId: { type: 'string' }, projectId: { type: 'integer' }, organizationId: { type: 'integer' } }, required: ['planId', 'projectId'] }),
    responses: { ...r201('Planner tasks imported', ref('Project')), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }

      const { planId, organizationId, portfolioId } = req.body;
      if (!planId || !organizationId) {
        return res.status(400).json({ message: "Plan ID and Organization ID are required" });
      }
      
      // Verify user has access to this organization
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      // Try org-scoped token first, fallback to session
      let token = req.session.plannerAccessToken;
      const integration = await getOrgIntegration(organizationId, "planner");
      if (integration?.accessToken) {
        const isExpired = integration.tokenExpiry ? Date.now() > new Date(integration.tokenExpiry).getTime() : false;
        if (!isExpired) {
          token = integration.accessToken;
        }
      }
      
      if (!token) {
        return res.status(401).json({ message: "Not connected to Planner. Please connect first." });
      }

      // Check project limit before creation (using org subscription)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PROJECTS, 1, organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Project limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "projects"
          });
        }
      }

      // Fetch plan details
      const planResponse = await fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!planResponse.ok) {
        if (planResponse.status === 401) {
          delete req.session.plannerAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect to Planner." });
        }
        throw new Error(`Failed to fetch plan: ${planResponse.status}`);
      }

      const plan = await planResponse.json();

      // Fetch tasks and buckets
      const [tasksResponse, bucketsResponse] = await Promise.all([
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/tasks`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/buckets`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      ]);

      if (!tasksResponse.ok) {
        throw new Error(`Failed to fetch tasks: ${tasksResponse.status}`);
      }

      const tasksData = await tasksResponse.json();
      const plannerTasks = tasksData.value || [];

      let buckets: { id: string; name: string; orderHint: string }[] = [];
      if (bucketsResponse.ok) {
        const bucketsData = await bucketsResponse.json();
        buckets = bucketsData.value || [];
      }

      const bucketMap = new Map(buckets.map((b: any) => [b.id, b.name]));

      // Calculate project dates from tasks
      let projectStartDate: string | null = null;
      let projectEndDate: string | null = null;

      for (const task of plannerTasks) {
        if (task.startDateTime) {
          const startDate = task.startDateTime.split('T')[0];
          if (!projectStartDate || startDate < projectStartDate) {
            projectStartDate = startDate;
          }
        }
        if (task.dueDateTime) {
          const endDate = task.dueDateTime.split('T')[0];
          if (!projectEndDate || endDate > projectEndDate) {
            projectEndDate = endDate;
          }
        }
      }

      // Create the project
      const project = await storage.createProject({
        organizationId: Number(organizationId),
        portfolioId: portfolioId ? Number(portfolioId) : null,
        name: plan.title,
        description: `Imported from Microsoft Planner on ${new Date().toLocaleDateString()}`,
        status: "Initiation",
        priority: "Medium",
        budget: 0,
        health: "Green",
        startDate: projectStartDate,
        endDate: projectEndDate,
        source: "planner",
        plannerPlanId: planId, // Store for future syncing
      });

      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.PROJECTS, project.id, 1, project.organizationId);
      }

      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      const plannerCreatorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System';
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: plannerCreatorName,
        changeType: 'created',
        changeSummary: `Project "${project.name}" created by ${plannerCreatorName} — imported from Microsoft Planner`,
        previousValues: null,
        newValues: JSON.stringify(project),
      });

      // Sort buckets by orderHint for consistent ordering
      const sortedBuckets = [...buckets].sort((a, b) => (a.orderHint || '').localeCompare(b.orderHint || ''));
      const bucketIndexMap = new Map(sortedBuckets.map((b, i) => [b.id, i + 1]));

      // Sort tasks by orderHint to preserve Planner's display order
      // orderHint is a string that determines the order of tasks in Planner
      const sortedPlannerTasks = [...plannerTasks].sort((a: any, b: any) => {
        // First sort by bucket order, then by task orderHint within each bucket
        const bucketOrderA = a.bucketId ? bucketIndexMap.get(a.bucketId) || 999 : 999;
        const bucketOrderB = b.bucketId ? bucketIndexMap.get(b.bucketId) || 999 : 999;
        if (bucketOrderA !== bucketOrderB) {
          return bucketOrderA - bucketOrderB;
        }
        // Within same bucket, sort by orderHint
        return (a.orderHint || '').localeCompare(b.orderHint || '');
      });

      // Create tasks from Planner tasks
      let taskIndex = 0;
      const createdTasks: any[] = [];

      // Default dates for tasks without dates (use project dates or today)
      const defaultStartDate = projectStartDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = projectEndDate || defaultStartDate;

      for (const plannerTask of sortedPlannerTasks) {
        taskIndex++;
        const bucketName = plannerTask.bucketId ? bucketMap.get(plannerTask.bucketId) || null : null;
        const bucketOrder = plannerTask.bucketId ? bucketIndexMap.get(plannerTask.bucketId) || 1 : 1;

        // Use Planner dates if available, otherwise use project dates or today
        const taskStartDate = plannerTask.startDateTime 
          ? plannerTask.startDateTime.split('T')[0] 
          : defaultStartDate;
        const taskEndDate = plannerTask.dueDateTime 
          ? plannerTask.dueDateTime.split('T')[0] 
          : (plannerTask.startDateTime ? plannerTask.startDateTime.split('T')[0] : defaultEndDate);

        const durationDays = calculateDuration(new Date(taskStartDate), new Date(taskEndDate));
        const taskIsMilestone = durationDays === 0;

        const task = await storage.createTask({
          projectId: project.id,
          taskIndex,
          name: plannerTask.title,
          description: null,
          priority: mapPlannerPriorityToProjectPriority(plannerTask.priority || 5),
          startDate: taskStartDate,
          endDate: taskEndDate,
          durationDays,
          progress: plannerTask.percentComplete || 0,
          status: mapPlannerPercentToStatus(plannerTask.percentComplete || 0),
          phase: bucketName,
          outlineLevel: 1,
          isMilestone: taskIsMilestone,
          isSummary: false,
          isCritical: false,
          externalId: plannerTask.id,
        });

        createdTasks.push({ task, plannerTaskId: plannerTask.id, assignments: plannerTask.assignments });
      }

      // Import resources and assignments from Planner
      let resourcesImported = 0;
      try {
        // Collect all unique user IDs from task assignments
        const userIdSet = new Set<string>();
        for (const { assignments } of createdTasks) {
          if (assignments) {
            for (const userId of Object.keys(assignments)) {
              userIdSet.add(userId);
            }
          }
        }

        if (userIdSet.size > 0) {
          // Fetch existing resources for matching
          const existingResources = await storage.getResources(Number(organizationId));
          const resourcesByEmail = new Map(existingResources.filter(r => r.email).map(r => [r.email!.toLowerCase(), r]));
          const resourcesByName = new Map(existingResources.map(r => [r.displayName.toLowerCase(), r]));
          const userResourceMap = new Map<string, number>(); // Maps Graph userId to our resourceId
          const assignedPairs = new Set<string>(); // Track assigned pairs

          // Fetch user details from Microsoft Graph (batch request for efficiency)
          const userIds = Array.from(userIdSet);
          for (const msUserId of userIds) {
            try {
              const userResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${msUserId}?$select=id,displayName,mail,userPrincipalName`, {
                headers: {
                  "Authorization": `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              });

              if (userResponse.ok) {
                const userData = await userResponse.json();
                const userName = userData.displayName || 'Unknown User';
                const userEmail = userData.mail || userData.userPrincipalName || null;
                
                // Try to match existing resource by email first, then by name
                let matchedResource = userEmail ? resourcesByEmail.get(userEmail.toLowerCase()) : null;
                if (!matchedResource) {
                  matchedResource = resourcesByName.get(userName.toLowerCase());
                }

                if (matchedResource) {
                  userResourceMap.set(msUserId, matchedResource.id);
                } else {
                  // Create new resource
                  const newResource = await storage.createResource({
                    organizationId: Number(organizationId),
                    displayName: userName,
                    email: userEmail,
                    title: 'Team Member',
                    resourceType: 'Employee',
                    availability: 100,
                  });

                  userResourceMap.set(msUserId, newResource.id);
                  if (userEmail) {
                    resourcesByEmail.set(userEmail.toLowerCase(), newResource);
                  }
                  resourcesByName.set(userName.toLowerCase(), newResource);

                  resourcesImported++;
                }
              }
            } catch (userErr) {
              console.error(`Planner import: Error fetching user ${msUserId}:`, userErr);
            }
          }

          // Create task resource assignments
          for (const { task, assignments } of createdTasks) {
            if (assignments) {
              for (const userId of Object.keys(assignments)) {
                const resourceId = userResourceMap.get(userId);
                if (resourceId) {
                  const pairKey = `${task.id}-${resourceId}`;
                  if (assignedPairs.has(pairKey)) continue;

                  try {
                    await storage.addTaskResourceAssignment({
                      taskId: task.id,
                      resourceId: resourceId,
                    });
                    assignedPairs.add(pairKey);
                  } catch (assignErr) {
                    console.error("Planner import: Failed to assign resource:", assignErr);
                  }
                }
              }
            }
          }
        }
      } catch (resourceErr) {
        console.error("Planner import: Error importing resources:", resourceErr);
        // Continue without failing - resources are optional
      }

      res.status(201).json({ 
        project,
        tasksCreated: createdTasks.length,
        resourcesImported,
        message: `Successfully imported "${plan.title}" with ${createdTasks.length} tasks${resourcesImported > 0 ? ` and ${resourcesImported} new resources` : ''}`
      });
    } catch (err: any) {
      console.error("Planner import error:", err);
      console.error("Planner import error stack:", err?.stack);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to import from Planner" : classified.message });
    }
  });

  // Import project from Dataverse (Planner Premium)
  apiRoute(app, 'post', '/api/dataverse/import', {
    tag: 'Projects',
    summary: 'Import tasks from Microsoft Planner Premium (Dataverse)',
    requestBody: body({ type: 'object', properties: { planId: { type: 'string' }, environmentUrl: { type: 'string' }, organizationId: { type: 'integer' } }, required: ['planId', 'environmentUrl'] }),
    responses: { ...r201('Planner Premium tasks imported', ref('Project')), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      
      // Require email verification before creating
      const emailCheck = await requireEmailVerified(userId);
      if (!emailCheck.verified) {
        return res.status(403).json({ message: emailCheck.error, emailVerificationRequired: true });
      }
      
      const token = req.session.dataverseAccessToken;
      const environmentUrl = req.session.dataverseEnvironmentUrl;
      
      if (!token) {
        return res.status(401).json({ message: "Not connected to Dataverse. Please connect first." });
      }
      
      if (!environmentUrl) {
        return res.status(400).json({ message: "Dataverse environment not configured." });
      }

      const { planId, organizationId, portfolioId } = req.body;
      if (!planId || !organizationId) {
        return res.status(400).json({ message: "Plan ID and Organization ID are required" });
      }

      if (!await userHasOrgAccess(userId, Number(organizationId))) {
        return res.status(403).json({ message: "You don't have access to this organization" });
      }

      // Fetch WhoAmI to get the Dataverse organization ID for URL construction
      let dataverseOrgId: string | null = null;
      try {
        const whoAmIResponse = await fetch(`${environmentUrl}/api/data/v9.2/WhoAmI`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
          },
        });
        if (whoAmIResponse.ok) {
          const whoAmI = await whoAmIResponse.json();
          dataverseOrgId = whoAmI.OrganizationId || null;
        }
      } catch (err) {
        console.error("Failed to fetch WhoAmI for org ID:", err);
      }

      // Get tenant ID from user profile
      let dataverseTenantId: string | null = null;
      if (userId) {
        const user = await storage.getUser(userId);
        dataverseTenantId = user?.microsoftTenantId || null;
      }

      // Check project limit before creation (using org subscription)
      if (userId) {
        const { checkAndEnforceLimit, METER_CODES } = await import("../services/billing");
        const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.PROJECTS, 1, organizationId);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            message: limitCheck.error || "Project limit reached. Please upgrade your plan.",
            limitExceeded: true,
            resourceType: "projects"
          });
        }
      }

      // Fetch plan details from Dataverse - use only core columns that exist in all environments
      const planApiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projects(${planId})?$select=msdyn_projectid,msdyn_subject,createdon,modifiedon,statecode,statuscode`;
      const planResponse = await fetch(planApiUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });

      if (!planResponse.ok) {
        if (planResponse.status === 401) {
          delete req.session.dataverseAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect to Dataverse." });
        }
        throw new Error(`Failed to fetch plan: ${planResponse.status}`);
      }

      const plan = await planResponse.json();

      // Fetch tasks from Dataverse - try with extended fields first, fall back to minimal
      let dataverseTasks: any[] = [];
      
      // Field sets for import (includes msdyn_displaysequence for proper task ordering)
      const importFieldSets = [
        // Extended fields with displaysequence
        "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_percentcomplete,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,msdyn_outlinelevel,msdyn_priority,msdyn_description,_msdyn_parenttask_value,statecode",
        // Simpler set with displaysequence
        "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
        // Minimal with displaysequence
        "msdyn_projecttaskid,msdyn_subject,msdyn_displaysequence,_msdyn_parenttask_value",
        // Absolute minimal without displaysequence
        "msdyn_projecttaskid,msdyn_subject,_msdyn_parenttask_value",
        "msdyn_projecttaskid,msdyn_subject"
      ];
      
      // Try with orderby first, then without
      const importOrderByClauses = ["&$orderby=msdyn_displaysequence asc", ""];
      
      let tasksResponse: Response | null = null;
      let successfulFetch = false;
      
      // Try each field set with ordering first, then without ordering
      for (let oi = 0; oi < importOrderByClauses.length && !successfulFetch; oi++) {
        for (let fi = 0; fi < importFieldSets.length && !successfulFetch; fi++) {
          const orderBy = importOrderByClauses[oi];
          const fields = importFieldSets[fi];
          const tasksApiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projecttasks?$select=${fields}&$filter=_msdyn_project_value eq ${planId}${orderBy}`;
          
          tasksResponse = await fetch(tasksApiUrl, {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "OData-MaxVersion": "4.0",
              "OData-Version": "4.0",
            },
          });
          
          if (tasksResponse.ok) {
            successfulFetch = true;
            break;
          }
        }
      }
      
      if (!tasksResponse || !tasksResponse.ok) {
        throw new Error(`Failed to fetch tasks after trying all field sets: ${tasksResponse?.status || 'unknown'}`);
      }

      const tasksData = await tasksResponse.json();
      dataverseTasks = tasksData.value || [];
      
      // Sort tasks by displaysequence to preserve the row order from Planner
      dataverseTasks = dataverseTasks.sort((a: any, b: any) => {
        const seqA = a.msdyn_displaysequence ?? Infinity;
        const seqB = b.msdyn_displaysequence ?? Infinity;
        return seqA - seqB;
      });
      

      // Calculate project dates from tasks using available schedule data
      const today = new Date().toISOString().split('T')[0];
      let projectStartDate: string | null = null;
      let projectEndDate: string | null = null;
      
      // Try to extract project dates from tasks if schedule fields are available
      for (const task of dataverseTasks) {
        if (task.msdyn_scheduledstart) {
          const startDate = task.msdyn_scheduledstart.split('T')[0];
          if (!projectStartDate || startDate < projectStartDate) {
            projectStartDate = startDate;
          }
        }
        if (task.msdyn_scheduledend) {
          const endDate = task.msdyn_scheduledend.split('T')[0];
          if (!projectEndDate || endDate > projectEndDate) {
            projectEndDate = endDate;
          }
        }
      }
      
      // Default to today if no dates found
      projectStartDate = projectStartDate || today;
      projectEndDate = projectEndDate || today;

      // Create the project - use msdyn_subject for project name (msdyn_name doesn't exist)
      const project = await storage.createProject({
        organizationId: Number(organizationId),
        portfolioId: portfolioId ? Number(portfolioId) : null,
        name: plan.msdyn_subject || "Imported Project",
        description: `Imported from Planner Premium on ${new Date().toLocaleDateString()}`,
        status: "Initiation",
        priority: "Medium",
        budget: 0,
        health: "Green",
        startDate: projectStartDate,
        endDate: projectEndDate,
        source: "planner_premium",
        plannerPlanId: planId,
        dataverseOrgId: dataverseOrgId,
        dataverseTenantId: dataverseTenantId,
      });

      // Record usage after successful creation
      if (userId) {
        const { recordResourceUsage, METER_CODES } = await import("../services/billing");
        await recordResourceUsage(userId, METER_CODES.PROJECTS, project.id, 1, project.organizationId);
      }

      // Log change
      const user = userId ? await storage.getUser(userId) : null;
      const premiumCreatorName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System';
      await storage.createProjectChangeLog({
        projectId: project.id,
        changedBy: userId || null,
        changedByName: premiumCreatorName,
        changeType: 'created',
        changeSummary: `Project "${project.name}" created by ${premiumCreatorName} — imported from Planner Premium`,
        previousValues: null,
        newValues: JSON.stringify(project),
      });

      // Create tasks from Dataverse tasks
      let taskIndex = 0;
      const createdTasks: any[] = [];
      const taskIdMap = new Map<string, number>();

      // Default dates for tasks (schedule fields may not be available in all environments)
      const defaultStartDate = projectStartDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = projectEndDate || defaultStartDate;

      // Helper function to map Dataverse priority to project priority
      const mapDataversePriority = (dvPriority: number | null | undefined): string => {
        if (dvPriority === null || dvPriority === undefined) return "Medium";
        // Dataverse priority: lower number = higher priority (1-10 scale typically)
        if (dvPriority <= 3) return "High";
        if (dvPriority <= 6) return "Medium";
        return "Low";
      };
      
      // Helper to map progress to status
      const mapProgressToStatus = (progress: number): string => {
        if (progress >= 100) return "Completed";
        if (progress > 0) return "In Progress";
        return "Not Started";
      };
      
      const calcDurationDays = (start: string | null, end: string | null): number => {
        if (!start || !end) return 1;
        return calculateDuration(new Date(start), new Date(end));
      };

      for (const dvTask of dataverseTasks) {
        taskIndex++;
        
        // Use schedule fields if available, otherwise defaults
        const taskStartDate = dvTask.msdyn_scheduledstart 
          ? dvTask.msdyn_scheduledstart.split('T')[0] 
          : defaultStartDate;
        const taskEndDate = dvTask.msdyn_scheduledend 
          ? dvTask.msdyn_scheduledend.split('T')[0] 
          : (dvTask.msdyn_scheduledstart ? dvTask.msdyn_scheduledstart.split('T')[0] : defaultEndDate);

        // Map progress (% complete) - check both msdyn_progress (decimal 0-1) and msdyn_percentcomplete (0-100)
        let progress = 0;
        if (dvTask.msdyn_progress !== null && dvTask.msdyn_progress !== undefined) {
          // msdyn_progress is stored as decimal (0.5 = 50%)
          progress = dvTask.msdyn_progress <= 1 
            ? Math.round(dvTask.msdyn_progress * 100) 
            : Math.round(dvTask.msdyn_progress);
        } else if (dvTask.msdyn_percentcomplete !== null && dvTask.msdyn_percentcomplete !== undefined) {
          // msdyn_percentcomplete is stored as percentage (0-100)
          progress = Math.round(dvTask.msdyn_percentcomplete);
        }
        
        const priority = mapDataversePriority(dvTask.msdyn_priority);
        const status = mapProgressToStatus(progress);

        // Parse WBS ID to determine outline level
        const wbsId = dvTask.msdyn_wbsid || '';
        // Use msdyn_outlinelevel if available, otherwise calculate from WBS
        const outlineLevel = dvTask.msdyn_outlinelevel || (wbsId ? wbsId.split('.').length : 1);
        
        let durationDays: number;
        if (dvTask.msdyn_duration !== null && dvTask.msdyn_duration !== undefined) {
          durationDays = dvTask.msdyn_duration;
        } else {
          durationDays = calcDurationDays(taskStartDate, taskEndDate);
        }
        const taskIsMilestone = durationDays === 0;

        const task = await storage.createTask({
          projectId: project.id,
          taskIndex,
          name: dvTask.msdyn_subject,
          description: dvTask.msdyn_description || (wbsId ? `WBS: ${wbsId}` : null),
          priority,
          startDate: taskStartDate,
          endDate: taskEndDate,
          durationDays,
          progress,
          status,
          outlineLevel,
          isMilestone: taskIsMilestone,
          isSummary: false,
          isCritical: false,
          wbs: wbsId || null,
          externalId: dvTask.msdyn_projecttaskid,
        });

        taskIdMap.set(dvTask.msdyn_projecttaskid, task.id);
        createdTasks.push(task);
      }

      // Update parent task references and collect parent task IDs
      const parentTaskIds = new Set<number>();
      for (const dvTask of dataverseTasks) {
        if (dvTask._msdyn_parenttask_value) {
          const childTaskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
          const parentTaskId = taskIdMap.get(dvTask._msdyn_parenttask_value);
          if (childTaskId && parentTaskId) {
            await storage.updateTask(childTaskId, { parentId: parentTaskId });
            parentTaskIds.add(parentTaskId);
          }
        }
      }

      // Mark all parent tasks as summary tasks
      for (const parentId of parentTaskIds) {
        await storage.updateTask(parentId, { isSummary: true });
      }

      // Recalculate outline levels based on hierarchy
      const taskParentMapImport = new Map<number, number | null>();
      for (const dvTask of dataverseTasks) {
        const taskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
        const parentId = dvTask._msdyn_parenttask_value ? taskIdMap.get(dvTask._msdyn_parenttask_value) : null;
        if (taskId) {
          taskParentMapImport.set(taskId, parentId || null);
        }
      }

      const calculateLevelImport = (taskId: number, visited = new Set<number>()): number => {
        if (visited.has(taskId)) return 1;
        visited.add(taskId);
        const parentId = taskParentMapImport.get(taskId);
        if (!parentId) return 1;
        return 1 + calculateLevelImport(parentId, visited);
      };

      for (const [taskId] of taskParentMapImport) {
        const level = calculateLevelImport(taskId);
        await storage.updateTask(taskId, { outlineLevel: level });
      }

      // Import resources and assignments from Planner Premium
      let resourcesImported = 0;
      try {
        // Fetch existing resources for matching
        const existingResources = await storage.getResources(project.organizationId!);
        const resourcesByName = new Map(existingResources.map(r => [r.displayName.toLowerCase(), r]));
        const resourcesByEmail = new Map(existingResources.filter(r => r.email).map(r => [r.email!.toLowerCase(), r]));
        const bookableResourceMap = new Map<string, number>(); // Maps Dataverse bookableResourceId to our resourceId
        const assignedPairs = new Set<string>(); // Track assigned resource-task pairs to prevent duplicates

        // Try multiple API approaches to fetch team members
        const teamApiUrls = [
          `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name,msdyn_primaryemail,emailaddress1)&$filter=_msdyn_project_value eq ${planId}`,
          `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name)&$filter=_msdyn_project_value eq ${planId}`,
          `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$filter=_msdyn_project_value eq ${planId}`,
        ];

        let teamResponse: Response | null = null;
        let teamFetched = false;
        let teamApiUrlIndex = -1;

        for (let i = 0; i < teamApiUrls.length; i++) {
          teamResponse = await fetch(teamApiUrls[i], {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "OData-MaxVersion": "4.0",
              "OData-Version": "4.0",
            },
          });
          if (teamResponse.ok) {
            teamFetched = true;
            teamApiUrlIndex = i;
            break;
          }
        }

        if (teamResponse && teamFetched) {
          const teamData = await teamResponse.json();
          const teamMembers = teamData.value || [];
          // Process each team member
          for (const member of teamMembers) {
            const memberName = member.msdyn_bookableresourceid?.name || member.msdyn_name;
            let memberEmail = member.msdyn_bookableresourceid?.msdyn_primaryemail || member.msdyn_bookableresourceid?.emailaddress1;
            const bookableResourceId = member._msdyn_bookableresourceid_value;

            if (!memberName) continue;

            // If email not in expanded data, try to fetch from bookableresources entity directly
            if (!memberEmail && bookableResourceId) {
              try {
                // First try with just name and userid - these are the most reliable fields
                const brResponse = await fetch(
                  `${environmentUrl}/api/data/v9.2/bookableresources(${bookableResourceId})?$select=name,_userid_value`,
                  {
                    headers: {
                      "Authorization": `Bearer ${token}`,
                      "Content-Type": "application/json",
                      "OData-MaxVersion": "4.0",
                      "OData-Version": "4.0",
                    },
                  }
                );
                if (brResponse.ok) {
                  const brData = await brResponse.json();
                  
                  if (brData._userid_value) {
                    try {
                      const systemUserResponse = await fetch(
                        `${environmentUrl}/api/data/v9.2/systemusers(${brData._userid_value})?$select=internalemailaddress,domainname,fullname`,
                        {
                          headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json",
                            "OData-MaxVersion": "4.0",
                            "OData-Version": "4.0",
                          },
                        }
                      );
                      if (systemUserResponse.ok) {
                        const systemUserData = await systemUserResponse.json();
                        memberEmail = systemUserData.internalemailaddress || systemUserData.domainname;
                      }
                    } catch (systemUserErr) {
                    }
                  }
                }
              } catch (brErr) {
              }
            }

            // Try to match existing resource by name or email
            // First try matching by email (most reliable - primary identifier)
            let matchedResource: typeof existingResources[0] | undefined;
            if (memberEmail) {
              matchedResource = resourcesByEmail.get(memberEmail.toLowerCase());
            }
            // Then try matching by display name
            if (!matchedResource && memberName) {
              matchedResource = resourcesByName.get(memberName.toLowerCase());
            }

            if (matchedResource) {
              if (bookableResourceId) {
                bookableResourceMap.set(bookableResourceId, matchedResource.id);
              }
              // Update existing resource with email if it was missing or different (email is primary identifier)
              if (memberEmail && (!matchedResource.email || matchedResource.email.toLowerCase() !== memberEmail.toLowerCase())) {
                try {
                  await storage.updateResource(matchedResource.id, { email: memberEmail });
                  // Update local cache
                  matchedResource.email = memberEmail;
                  resourcesByEmail.set(memberEmail.toLowerCase(), matchedResource);
                } catch (updateErr) {
                }
              }
            } else {
              // Create new resource in resource pool
              try {
                const newResource = await storage.createResource({
                  organizationId: project.organizationId!,
                  displayName: memberName,
                  email: memberEmail || null,
                  title: 'Team Member',
                  resourceType: 'Employee',
                  availability: 100,
                });

                if (bookableResourceId) {
                  bookableResourceMap.set(bookableResourceId, newResource.id);
                }
                resourcesByName.set(memberName.toLowerCase(), newResource);
                if (memberEmail) {
                  resourcesByEmail.set(memberEmail.toLowerCase(), newResource);
                }

                resourcesImported++;
                console.log(`Import: Created resource: ${memberName} (ID: ${newResource.id}, Email: ${memberEmail || 'none'})`);
              } catch (createErr) {
                console.log(`Import: Failed to create resource ${memberName}:`, createErr);
              }
            }
          }

          // Fetch and apply resource assignments
          const assignmentApiUrls = [
            `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$filter=_msdyn_projectid_value eq ${planId}`,
            `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments`,
          ];

          let assignmentsResponse: Response | null = null;
          let assignmentsFetched = false;

          for (let i = 0; i < assignmentApiUrls.length; i++) {
            assignmentsResponse = await fetch(assignmentApiUrls[i], {
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            if (assignmentsResponse.ok) {
              console.log(`Import: Successfully fetched resource assignments using API variant ${i + 1}`);
              assignmentsFetched = true;
              break;
            }
            console.log(`Import: Assignments API attempt ${i + 1} failed (status ${assignmentsResponse.status}), trying next...`);
          }

          if (assignmentsResponse && assignmentsFetched) {
            const assignmentsData = await assignmentsResponse.json();
            let assignments = assignmentsData.value || [];

            // Filter to only include tasks in our project
            const projectTaskIds = new Set(Array.from(taskIdMap.keys()));
            assignments = assignments.filter((a: any) => {
              const taskId = a._msdyn_projecttaskid_value || a._msdyn_projecttask_value || a._msdyn_taskid_value;
              return taskId && projectTaskIds.has(taskId);
            });

            console.log(`Import: Found ${assignments.length} relevant resource assignments`);

            // Apply assignments to tasks
            for (const assignment of assignments) {
              const dvTaskId = assignment._msdyn_projecttaskid_value || assignment._msdyn_projecttask_value || assignment._msdyn_taskid_value;
              const dvResourceId = assignment._msdyn_bookableresourceid_value || assignment._bookableresource_value;

              if (!dvTaskId || !dvResourceId) continue;

              const ourTaskId = taskIdMap.get(dvTaskId);
              const ourResourceId = bookableResourceMap.get(dvResourceId);

              if (ourTaskId && ourResourceId) {
                const pairKey = `${ourTaskId}-${ourResourceId}`;
                if (assignedPairs.has(pairKey)) continue;

                try {
                  await storage.addTaskResourceAssignment({
                    taskId: ourTaskId,
                    resourceId: ourResourceId,
                  });
                  assignedPairs.add(pairKey);
                } catch (assignErr) {
                  console.log(`Import: Failed to assign resource ${ourResourceId} to task ${ourTaskId}:`, assignErr);
                }
              }
            }
          }
        }
      } catch (resourceErr) {
        console.log("Import: Error importing resources from Planner Premium:", resourceErr);
        // Continue without failing the import - resources are optional
      }

      // Import task dependencies from Dataverse
      let dependenciesImported = 0;
      try {
        const depApiUrls = [
          `${environmentUrl}/api/data/v9.2/msdyn_projecttaskdependencies?$select=msdyn_projecttaskdependencyid,_msdyn_predecessortask_value,_msdyn_successortask_value,msdyn_linktype&$filter=_msdyn_project_value eq ${planId}`,
          `${environmentUrl}/api/data/v9.2/msdyn_projecttaskdependencies?$filter=_msdyn_project_value eq ${planId}`,
        ];

        let depResponse: Response | null = null;
        let depFetched = false;

        for (let i = 0; i < depApiUrls.length; i++) {
          depResponse = await fetch(depApiUrls[i], {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
              "OData-MaxVersion": "4.0",
              "OData-Version": "4.0",
            },
          });
          if (depResponse.ok) {
            console.log(`Import: Successfully fetched dependencies using API variant ${i + 1}`);
            depFetched = true;
            break;
          }
          console.log(`Import: Dependencies API attempt ${i + 1} failed (status ${depResponse.status}), trying next...`);
        }

        if (depResponse && depFetched) {
          const depData = await depResponse.json();
          const dvDependencies = depData.value || [];
          console.log(`Import: Found ${dvDependencies.length} task dependencies`);

          for (const dvDep of dvDependencies) {
            const predecessorExtId = dvDep._msdyn_predecessortask_value;
            const successorExtId = dvDep._msdyn_successortask_value;

            if (!predecessorExtId || !successorExtId) continue;

            const predecessorTaskId = taskIdMap.get(predecessorExtId);
            const successorTaskId = taskIdMap.get(successorExtId);

            if (predecessorTaskId && successorTaskId) {
              // Map Dataverse link types: 192350000=FinishToStart, 192350001=StartToStart, 192350002=FinishToFinish, 192350003=StartToFinish
              let dependencyType = 'finish-to-start';
              const linkType = dvDep.msdyn_linktype;
              if (linkType === 192350001) dependencyType = 'start-to-start';
              else if (linkType === 192350002) dependencyType = 'finish-to-finish';
              else if (linkType === 192350003) dependencyType = 'start-to-finish';

              try {
                await storage.createTaskDependency({
                  taskId: successorTaskId,
                  dependsOnTaskId: predecessorTaskId,
                  dependencyType,
                  lagDays: 0,
                });
                dependenciesImported++;
                console.log(`Import: Created dependency: task ${predecessorTaskId} -> task ${successorTaskId} (${dependencyType})`);
              } catch (depErr) {
                console.log(`Import: Failed to create dependency:`, depErr);
              }
            }
          }
        }
      } catch (depErr) {
        console.log("Import: Error importing dependencies from Planner Premium:", depErr);
      }

      res.status(201).json({ 
        project,
        tasksCreated: createdTasks.length,
        resourcesImported,
        dependenciesImported,
        message: `Successfully imported "${plan.msdyn_subject || project.name}" with ${createdTasks.length} tasks${resourcesImported > 0 ? `, ${resourcesImported} new resources` : ''}${dependenciesImported > 0 ? `, ${dependenciesImported} dependencies` : ''} from Planner Premium`
      });
    } catch (err: any) {
      console.error("Dataverse import error:", err);
      console.error("Dataverse import error stack:", err?.stack);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to import from Planner Premium" : classified.message });
    }
  });

  // Sync tasks from Planner for a project
  apiRoute(app, 'post', '/api/projects/:id/sync-planner', {
    tag: 'Projects',
    summary: 'Sync project data to/from planner view',
    parameters: [pathId()],
    responses: { ...r200('Planner synced', ref('Project')), ...updateRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Verify user has access to the project's organization
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      if ((project.source !== "planner" && project.source !== "planner_premium") || !project.plannerPlanId) {
        return res.status(400).json({ message: "Project is not linked to Microsoft Planner" });
      }

      const planId = project.plannerPlanId;
      // Detect Premium plans by source OR by GUID-style plannerPlanId (Dataverse uses GUIDs)
      const isGuidPlanId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId);
      const isPremium = project.source === "planner_premium" || (project.source === "planner" && isGuidPlanId);

      // For Premium plans, use Dataverse sync instead of regular Planner
      if (isPremium) {
        const dataverseToken = req.session.dataverseAccessToken;
        const environmentUrl = req.session.dataverseEnvironmentUrl;
        
        if (!dataverseToken || !environmentUrl) {
          return res.status(401).json({ message: "Not connected to Dataverse. Please reconnect." });
        }

        // Fetch WhoAmI to get org ID if project doesn't have it
        if (!project.dataverseOrgId || !project.dataverseTenantId) {
          try {
            const whoAmIResponse = await fetch(`${environmentUrl}/api/data/v9.2/WhoAmI`, {
              headers: {
                "Authorization": `Bearer ${dataverseToken}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            if (whoAmIResponse.ok) {
              const whoAmI = await whoAmIResponse.json();
              const userId = getUserIdFromRequest(req);
              const user = userId ? await storage.getUser(userId) : null;
              
              // Update project with org and tenant IDs
              await storage.updateProject(projectId, {
                dataverseOrgId: whoAmI.OrganizationId || null,
                dataverseTenantId: user?.microsoftTenantId || null,
              });
            }
          } catch (err) {
            console.log("Failed to fetch WhoAmI for org ID during sync:", err);
          }
        }

        // Fetch tasks from Dataverse with extended fields
        // Try different field combinations as Dataverse environments may have different schemas
        // Note: msdyn_progress stores decimal (0-1), msdyn_percentcomplete stores percentage (0-100)
        const fieldSets = [
          // Full Project for the Web schema with msdyn_progress and msdyn_displaysequence for ordering
          "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,msdyn_outlinelevel,msdyn_priority,msdyn_description,_msdyn_parenttask_value,statecode",
          // Try with msdyn_percentcomplete instead (some environments use this)
          "msdyn_projecttaskid,msdyn_subject,msdyn_percentcomplete,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,msdyn_outlinelevel,msdyn_priority,msdyn_description,_msdyn_parenttask_value,statecode",
          // Simpler set with msdyn_progress AND msdyn_displaysequence for proper sequencing
          "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
          // Simpler set with msdyn_percentcomplete AND msdyn_displaysequence for proper sequencing
          "msdyn_projecttaskid,msdyn_subject,msdyn_percentcomplete,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
          // Basic fields with msdyn_displaysequence for sequencing
          "msdyn_projecttaskid,msdyn_subject,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,msdyn_displaysequence,_msdyn_parenttask_value,statecode",
          // Basic fields without msdyn_displaysequence (fallback without sequencing)
          "msdyn_projecttaskid,msdyn_subject,msdyn_progress,msdyn_scheduledstart,msdyn_scheduledend,msdyn_duration,_msdyn_parenttask_value,statecode",
          // Minimal fallback with parent task for hierarchy
          "msdyn_projecttaskid,msdyn_subject,_msdyn_parenttask_value",
          // Absolute minimal
          "msdyn_projecttaskid,msdyn_subject"
        ];
        
        // Try with $orderby first, then without (some environments don't support ordering by msdyn_displaysequence)
        const orderByClauses = ["&$orderby=msdyn_displaysequence asc", ""];
        
        let tasksResponse: Response | null = null;
        let fieldSetIndex = 0;
        let orderByIndex = 0;
        let successfulFetch = false;
        
        // Try each field set with ordering first, then without ordering
        for (let oi = 0; oi < orderByClauses.length && !successfulFetch; oi++) {
          for (let fi = 0; fi < fieldSets.length && !successfulFetch; fi++) {
            const orderBy = orderByClauses[oi];
            const fields = fieldSets[fi];
            const tasksApiUrl = `${environmentUrl}/api/data/v9.2/msdyn_projecttasks?$select=${fields}&$filter=_msdyn_project_value eq ${planId}${orderBy}`;
            
            tasksResponse = await fetch(tasksApiUrl, {
              headers: {
                "Authorization": `Bearer ${dataverseToken}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            
            if (tasksResponse.ok) {
              fieldSetIndex = fi;
              orderByIndex = oi;
              successfulFetch = true;
              break;
            } else {
              console.log(`Field set ${fi} with orderBy[${oi}] failed (status ${tasksResponse.status}), trying next...`);
            }
          }
        }
        
        if (!tasksResponse || !tasksResponse.ok) {
          if (tasksResponse?.status === 401) {
            delete req.session.dataverseAccessToken;
            return res.status(401).json({ message: "Session expired. Please reconnect to Dataverse." });
          }
          throw new Error(`Failed to fetch tasks after trying all field sets: ${tasksResponse?.status || 'unknown'}`);
        }
        
        console.log(`Successfully fetched tasks using field set ${fieldSetIndex}${orderByIndex === 0 ? ' with WBS ordering' : ' without ordering'}: ${fieldSets[fieldSetIndex]}`);

        const tasksData = await tasksResponse.json();
        let dataverseTasks = tasksData.value || [];
        
        // Log first task to debug field availability
        if (dataverseTasks.length > 0) {
          console.log("Dataverse sync - First task fields available:", Object.keys(dataverseTasks[0]));
          console.log("Dataverse sync - First task sample:", JSON.stringify(dataverseTasks[0], null, 2));
        }

        // Sort tasks by displaysequence to preserve the row order from Planner
        // msdyn_displaysequence is a decimal number (e.g., 1.0, 2.0, 3.5)
        dataverseTasks = dataverseTasks.sort((a: any, b: any) => {
          const seqA = a.msdyn_displaysequence ?? Infinity;
          const seqB = b.msdyn_displaysequence ?? Infinity;
          return seqA - seqB;
        });
        
        console.log(`Sorted ${dataverseTasks.length} tasks by displaysequence for proper row ordering`);

        // Get existing tasks for this project
        const existingTasks = await storage.getTasksByProject(projectId);
        
        // Build old task ID to name and externalId mappings for relationship preservation
        const oldTaskIdToName = new Map<number, string>();
        const oldTaskIdToExternalId = new Map<number, string>();
        for (const task of existingTasks) {
          oldTaskIdToName.set(task.id, task.name.toLowerCase().trim());
          if (task.externalId) {
            oldTaskIdToExternalId.set(task.id, task.externalId);
          }
        }
        
        // Preserve hours (estimatedHours, actualHours) by externalId and task name
        // externalId is the primary key for matching (survives renames), task name is fallback
        const hoursByExternalId = new Map<string, { estimatedHours: number | null; actualHours: number | null }>();
        const hoursByTaskName = new Map<string, { estimatedHours: number | null; actualHours: number | null }>();
        for (const task of existingTasks) {
          if (task.estimatedHours || task.actualHours) {
            const hoursData = { estimatedHours: task.estimatedHours, actualHours: task.actualHours };
            if (task.externalId) {
              hoursByExternalId.set(task.externalId, hoursData);
            }
            const taskName = task.name.toLowerCase().trim();
            if (!hoursByTaskName.has(taskName)) {
              hoursByTaskName.set(taskName, hoursData);
            }
          }
        }
        console.log(`Planner Premium sync: Found ${hoursByExternalId.size} tasks with hours to preserve (by externalId), ${hoursByTaskName.size} (by name)`);
        
        // Preserve timesheet entries by externalId and task name
        // externalId is the primary key for matching, task name is fallback
        const timesheetEntriesByExternalId = new Map<string, { entries: any[]; oldTaskId: number }[]>();
        const timesheetEntriesByTaskName = new Map<string, { entries: any[]; oldTaskId: number }[]>();
        for (const task of existingTasks) {
          const entries = await db.select().from(timesheetEntries).where(eq(timesheetEntries.taskId, task.id));
          if (entries.length > 0) {
            if (task.externalId) {
              if (!timesheetEntriesByExternalId.has(task.externalId)) {
                timesheetEntriesByExternalId.set(task.externalId, []);
              }
              timesheetEntriesByExternalId.get(task.externalId)!.push({ entries, oldTaskId: task.id });
            }
            const taskName = task.name.toLowerCase().trim();
            if (!timesheetEntriesByTaskName.has(taskName)) {
              timesheetEntriesByTaskName.set(taskName, []);
            }
            timesheetEntriesByTaskName.get(taskName)!.push({ entries, oldTaskId: task.id });
          }
        }
        console.log(`Planner Premium sync: Found ${timesheetEntriesByExternalId.size} tasks with timesheet entries to preserve (by externalId), ${timesheetEntriesByTaskName.size} (by name)`);
        
        // Preserve task change logs by externalId and task name
        const changeLogsByExternalId = new Map<string, any[]>();
        const changeLogsByTaskName = new Map<string, any[]>();
        for (const task of existingTasks) {
          const logs = await db.select().from(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
          if (logs.length > 0) {
            if (task.externalId) {
              if (!changeLogsByExternalId.has(task.externalId)) {
                changeLogsByExternalId.set(task.externalId, []);
              }
              changeLogsByExternalId.get(task.externalId)!.push(...logs);
            }
            const taskName = task.name.toLowerCase().trim();
            if (!changeLogsByTaskName.has(taskName)) {
              changeLogsByTaskName.set(taskName, []);
            }
            changeLogsByTaskName.get(taskName)!.push(...logs);
          }
        }
        console.log(`Planner Premium sync: Found ${changeLogsByExternalId.size} tasks with change logs to preserve (by externalId), ${changeLogsByTaskName.size} (by name)`);
        
        // Preserve task dependencies by externalId and task names (source -> target)
        const dependenciesByExternalId = new Map<string, { dependsOnExternalId: string | null; dependsOnTaskName: string; dependencyType: string; lagDays: number }[]>();
        const dependenciesByTaskNames = new Map<string, { dependsOnExternalId: string | null; dependsOnTaskName: string; dependencyType: string; lagDays: number }[]>();
        for (const task of existingTasks) {
          const deps = await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, task.id));
          if (deps.length > 0) {
            const taskName = task.name.toLowerCase().trim();
            const taskExtId = task.externalId || null;
            for (const dep of deps) {
              const dependsOnName = oldTaskIdToName.get(dep.dependsOnTaskId) || '';
              const dependsOnExtId = oldTaskIdToExternalId.get(dep.dependsOnTaskId) || null;
              const depData = {
                dependsOnExternalId: dependsOnExtId,
                dependsOnTaskName: dependsOnName,
                dependencyType: dep.dependencyType || 'finish-to-start',
                lagDays: dep.lagDays || 0,
              };
              if (taskExtId) {
                if (!dependenciesByExternalId.has(taskExtId)) {
                  dependenciesByExternalId.set(taskExtId, []);
                }
                dependenciesByExternalId.get(taskExtId)!.push(depData);
              }
              if (!dependenciesByTaskNames.has(taskName)) {
                dependenciesByTaskNames.set(taskName, []);
              }
              dependenciesByTaskNames.get(taskName)!.push(depData);
            }
          }
        }
        console.log(`Planner Premium sync: Found ${dependenciesByExternalId.size} tasks with dependencies to preserve (by externalId), ${dependenciesByTaskNames.size} (by name)`);
        
        // Collect issues with relatedTaskId for this project's tasks to update later
        // Store both externalId and taskName for matching
        const issuesWithRelatedTasks = new Map<number, { externalId: string | null; taskName: string }>(); // issueId -> { externalId, taskName }
        for (const task of existingTasks) {
          const relatedIssues = await db.select().from(issues).where(eq(issues.relatedTaskId, task.id));
          for (const issue of relatedIssues) {
            issuesWithRelatedTasks.set(issue.id, {
              externalId: task.externalId || null,
              taskName: task.name.toLowerCase().trim(),
            });
          }
        }
        console.log(`Planner Premium sync: Found ${issuesWithRelatedTasks.size} issues with related tasks to preserve`);

        // Delete all existing tasks for this project (full sync)
        // First delete timesheet entries temporarily (we'll recreate them with new task IDs)
        for (const task of existingTasks) {
          await db.delete(timesheetEntries).where(eq(timesheetEntries.taskId, task.id));
        }
        // Delete task change logs temporarily
        for (const task of existingTasks) {
          await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
        }
        // Delete task dependencies
        for (const task of existingTasks) {
          await db.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id));
          await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, task.id));
        }
        // Clear relatedTaskId on issues (will be restored later)
        for (const task of existingTasks) {
          await db.update(issues).set({ relatedTaskId: null }).where(eq(issues.relatedTaskId, task.id));
        }
        // Clean up orphaned notifications referencing these tasks
        for (const task of existingTasks) {
          await db.delete(notifications).where(eq(notifications.taskId, task.id));
        }
        // Then delete task resource assignments to avoid FK constraint violations
        for (const task of existingTasks) {
          await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, task.id));
        }
        for (const task of existingTasks) {
          await storage.deleteTask(task.id);
        }

        // Calculate project dates from tasks
        const today = new Date().toISOString().split('T')[0];
        let projectStartDate: string | null = null;
        let projectEndDate: string | null = null;
        
        for (const task of dataverseTasks) {
          if (task.msdyn_scheduledstart) {
            const startDate = task.msdyn_scheduledstart.split('T')[0];
            if (!projectStartDate || startDate < projectStartDate) {
              projectStartDate = startDate;
            }
          }
          if (task.msdyn_scheduledend) {
            const endDate = task.msdyn_scheduledend.split('T')[0];
            if (!projectEndDate || endDate > projectEndDate) {
              projectEndDate = endDate;
            }
          }
        }
        
        const defaultStartDate = projectStartDate || today;
        const defaultEndDate = projectEndDate || today;

        // Helper functions
        const mapDataversePriority = (dvPriority: number | null | undefined): string => {
          if (dvPriority === null || dvPriority === undefined) return "Medium";
          if (dvPriority <= 3) return "High";
          if (dvPriority <= 6) return "Medium";
          return "Low";
        };
        
        const mapProgressToStatus = (progress: number): string => {
          if (progress >= 100) return "Completed";
          if (progress > 0) return "In Progress";
          return "Not Started";
        };
        
        const calcDurationDays = (start: string | null, end: string | null): number => {
          if (!start || !end) return 1;
          return calculateDuration(new Date(start), new Date(end));
        };

        // Create tasks from Dataverse
        let taskIndex = 0;
        const createdTasks: any[] = [];
        const taskIdMap = new Map<string, number>();

        for (const dvTask of dataverseTasks) {
          taskIndex++;
          
          const taskStartDate = dvTask.msdyn_scheduledstart 
            ? dvTask.msdyn_scheduledstart.split('T')[0] 
            : defaultStartDate;
          const taskEndDate = dvTask.msdyn_scheduledend 
            ? dvTask.msdyn_scheduledend.split('T')[0] 
            : (dvTask.msdyn_scheduledstart ? dvTask.msdyn_scheduledstart.split('T')[0] : defaultEndDate);

          // Handle progress - check both msdyn_progress (decimal 0-1) and msdyn_percentcomplete (0-100)
          let progress = 0;
          if (dvTask.msdyn_progress !== null && dvTask.msdyn_progress !== undefined) {
            // msdyn_progress is stored as decimal (0.5 = 50%)
            progress = dvTask.msdyn_progress <= 1 
              ? Math.round(dvTask.msdyn_progress * 100) 
              : Math.round(dvTask.msdyn_progress);
          } else if (dvTask.msdyn_percentcomplete !== null && dvTask.msdyn_percentcomplete !== undefined) {
            // msdyn_percentcomplete is stored as percentage (0-100)
            progress = Math.round(dvTask.msdyn_percentcomplete);
          }
          
          const priority = mapDataversePriority(dvTask.msdyn_priority);
          const status = mapProgressToStatus(progress);
          const wbsId = dvTask.msdyn_wbsid || '';
          // Initially set outlineLevel to 1, will recalculate from hierarchy later
          const outlineLevel = dvTask.msdyn_outlinelevel || (wbsId ? wbsId.split('.').length : 1);
          let durationDays: number;
          if (dvTask.msdyn_duration !== null && dvTask.msdyn_duration !== undefined) {
            durationDays = dvTask.msdyn_duration;
          } else {
            durationDays = calcDurationDays(taskStartDate, taskEndDate);
          }
          const taskIsMilestone = durationDays === 0;

          const task = await storage.createTask({
            projectId: project.id,
            taskIndex,
            name: dvTask.msdyn_subject,
            description: dvTask.msdyn_description || (wbsId ? `WBS: ${wbsId}` : null),
            priority,
            startDate: taskStartDate,
            endDate: taskEndDate,
            durationDays,
            progress,
            status,
            outlineLevel,
            isMilestone: taskIsMilestone,
            isSummary: false,
            isCritical: false,
            wbs: wbsId || null,
            externalId: dvTask.msdyn_projecttaskid,
          });

          taskIdMap.set(dvTask.msdyn_projecttaskid, task.id);
          createdTasks.push(task);
        }

        // Update parent task references and collect parent task IDs
        const parentTaskIds = new Set<number>();
        for (const dvTask of dataverseTasks) {
          if (dvTask._msdyn_parenttask_value) {
            const childTaskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
            const parentTaskId = taskIdMap.get(dvTask._msdyn_parenttask_value);
            if (childTaskId && parentTaskId) {
              await storage.updateTask(childTaskId, { parentId: parentTaskId });
              parentTaskIds.add(parentTaskId);
            }
          }
        }

        // Mark all parent tasks as summary tasks
        for (const parentId of parentTaskIds) {
          await storage.updateTask(parentId, { isSummary: true });
        }

        // Recalculate outline levels based on hierarchy
        // Build a map of task ID to parent ID for level calculation
        const taskParentMap = new Map<number, number | null>();
        for (const dvTask of dataverseTasks) {
          const taskId = taskIdMap.get(dvTask.msdyn_projecttaskid);
          const parentId = dvTask._msdyn_parenttask_value ? taskIdMap.get(dvTask._msdyn_parenttask_value) : null;
          if (taskId) {
            taskParentMap.set(taskId, parentId || null);
          }
        }

        // Calculate level for each task by walking up the parent chain
        const calculateLevel = (taskId: number, visited = new Set<number>()): number => {
          if (visited.has(taskId)) return 1; // Prevent infinite loops
          visited.add(taskId);
          const parentId = taskParentMap.get(taskId);
          if (!parentId) return 1; // Root level
          return 1 + calculateLevel(parentId, visited);
        };

        // Update outline levels for all tasks
        for (const [taskId] of taskParentMap) {
          const level = calculateLevel(taskId);
          await storage.updateTask(taskId, { outlineLevel: level });
        }

        // =====================================================
        // Import Resources from Planner Premium (Project Team)
        // =====================================================
        let resourcesSynced = 0;
        const bookableResourceMap = new Map<string, number>(); // Dataverse bookableresourceid -> our resource ID
        const assignedPairs = new Set<string>(); // Track assigned task-resource pairs to avoid duplicates
        
        try {
          // Try multiple API approaches to fetch team members (different Dataverse schemas)
          const teamApiUrls = [
            // Full expand with msdyn_primaryemail (Project Operations)
            `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name,msdyn_primaryemail,emailaddress1)&$filter=_msdyn_project_value eq ${planId}`,
            // Simpler expand with just name (some environments)
            `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$expand=msdyn_bookableresourceid($select=name)&$filter=_msdyn_project_value eq ${planId}`,
            // No expand - just get team member names
            `${environmentUrl}/api/data/v9.2/msdyn_projectteams?$select=msdyn_projectteamid,msdyn_name,_msdyn_bookableresourceid_value&$filter=_msdyn_project_value eq ${planId}`,
          ];
          
          let teamResponse: Response | null = null;
          let teamApiUrlIndex = 0;
          
          for (let i = 0; i < teamApiUrls.length; i++) {
            teamResponse = await fetch(teamApiUrls[i], {
              headers: {
                "Authorization": `Bearer ${dataverseToken}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            if (teamResponse.ok) {
              teamApiUrlIndex = i;
              break;
            }
            console.log(`Team API attempt ${i + 1} failed (status ${teamResponse.status}), trying next...`);
          }

          if (teamResponse && teamResponse.ok) {
            const teamData = await teamResponse.json();
            const teamMembers = teamData.value || [];
            
            console.log(`Planner Premium sync - Found ${teamMembers.length} team members (using API variant ${teamApiUrlIndex + 1})`);
            if (teamMembers.length > 0) {
              console.log("Sample team member:", JSON.stringify(teamMembers[0], null, 2));
            }

            // Get existing resources for this organization to match
            const existingResources = project.organizationId 
              ? await storage.getResources(project.organizationId)
              : [];
            
            // Create a map of existing resources by email and displayName for matching
            const resourcesByEmail = new Map<string, typeof existingResources[0]>();
            const resourcesByName = new Map<string, typeof existingResources[0]>();
            for (const res of existingResources) {
              if (res.email) {
                resourcesByEmail.set(res.email.toLowerCase(), res);
              }
              if (res.displayName) {
                resourcesByName.set(res.displayName.toLowerCase(), res);
              }
            }

            // Process each team member
            for (const teamMember of teamMembers) {
              const bookableResourceId = teamMember._msdyn_bookableresourceid_value;
              const bookableResource = teamMember.msdyn_bookableresourceid;
              
              // Get name from bookable resource or fallback to team member name
              const memberName = bookableResource?.name || teamMember.msdyn_name;
              
              // Skip if we can't determine a valid name
              if (!memberName || memberName === 'Unknown Resource' || memberName.trim() === '') {
                console.log(`Skipping team member with no valid name`);
                continue;
              }
              
              // Get email from multiple possible fields (different Dataverse schemas)
              let memberEmail = bookableResource?.msdyn_primaryemail || 
                                  bookableResource?.emailaddress1 || 
                                  null;
              
              // If email not in expanded data, try to fetch from bookableresources entity directly
              if (!memberEmail && bookableResourceId) {
                try {
                  // Only request name and userid - email fields may not exist in all Dataverse schemas
                  const brResponse = await fetch(
                    `${environmentUrl}/api/data/v9.2/bookableresources(${bookableResourceId})?$select=name,_userid_value`,
                    {
                      headers: {
                        "Authorization": `Bearer ${dataverseToken}`,
                        "Content-Type": "application/json",
                        "OData-MaxVersion": "4.0",
                        "OData-Version": "4.0",
                      },
                    }
                  );
                  if (brResponse.ok) {
                    const brData = await brResponse.json();
                    console.log(`Planner sync: Bookable resource data for ${memberName}:`, JSON.stringify(brData));
                    
                    // The userId field links to the Dataverse systemuser - use it to fetch email
                    if (brData._userid_value) {
                      console.log(`Planner sync: Trying Dataverse systemusers with userId ${brData._userid_value}`);
                      try {
                        // Fetch email from Dataverse systemusers entity (same token works)
                        const systemUserResponse = await fetch(
                          `${environmentUrl}/api/data/v9.2/systemusers(${brData._userid_value})?$select=internalemailaddress,domainname,fullname`,
                          {
                            headers: {
                              "Authorization": `Bearer ${dataverseToken}`,
                              "Content-Type": "application/json",
                              "OData-MaxVersion": "4.0",
                              "OData-Version": "4.0",
                            },
                          }
                        );
                        if (systemUserResponse.ok) {
                          const systemUserData = await systemUserResponse.json();
                          console.log(`Planner sync: Systemuser data for ${memberName}:`, JSON.stringify(systemUserData));
                          memberEmail = systemUserData.internalemailaddress || systemUserData.domainname;
                          if (memberEmail) {
                            console.log(`Planner sync: Fetched email from Dataverse systemusers for ${memberName}: ${memberEmail}`);
                          }
                        } else {
                          const errorText = await systemUserResponse.text();
                          console.log(`Planner sync: Dataverse systemusers API failed for ${memberName}: ${systemUserResponse.status} - ${errorText}`);
                        }
                      } catch (systemUserErr) {
                        console.log(`Planner sync: Could not fetch systemuser details for ${memberName}:`, systemUserErr);
                      }
                    } else {
                      console.log(`Planner sync: No userId in Dataverse for ${memberName} - cannot lookup email`);
                    }
                    
                    if (memberEmail) {
                      console.log(`Planner sync: Fetched email for ${memberName}: ${memberEmail}`);
                    }
                  } else {
                    const errorText = await brResponse.text();
                    console.log(`Planner sync: Bookable resource fetch failed for ${memberName}: ${brResponse.status} - ${errorText}`);
                  }
                } catch (brErr) {
                  console.log(`Planner sync: Could not fetch bookable resource details for ${memberName}:`, brErr);
                }
              }
              
              // Try to match with existing resource first
              let matchedResource: typeof existingResources[0] | undefined;
              
              // First try matching by email (most reliable)
              if (memberEmail) {
                matchedResource = resourcesByEmail.get(memberEmail.toLowerCase());
              }
              
              // Then try matching by exact displayName
              if (!matchedResource && memberName) {
                matchedResource = resourcesByName.get(memberName.toLowerCase());
              }
              
              if (matchedResource) {
                // Use existing resource
                if (bookableResourceId) {
                  bookableResourceMap.set(bookableResourceId, matchedResource.id);
                }
                // Update existing resource with email if it was missing or different (email is primary identifier)
                if (memberEmail && (!matchedResource.email || matchedResource.email.toLowerCase() !== memberEmail.toLowerCase())) {
                  try {
                    await storage.updateResource(matchedResource.id, { email: memberEmail });
                    // Update local cache
                    matchedResource.email = memberEmail;
                    resourcesByEmail.set(memberEmail.toLowerCase(), matchedResource);
                  } catch (updateErr) {
                  }
                }
              } else if (project.organizationId) {
                // Create new resource in resource pool
                try {
                  const newResource = await storage.createResource({
                    organizationId: project.organizationId,
                    displayName: memberName,
                    email: memberEmail || null,
                    title: 'Team Member',
                    resourceType: 'Employee',
                    availability: 100,
                  });
                  
                  if (bookableResourceId) {
                    bookableResourceMap.set(bookableResourceId, newResource.id);
                  }
                  // Also add to name map for future matching
                  resourcesByName.set(memberName.toLowerCase(), newResource);
                  if (memberEmail) {
                    resourcesByEmail.set(memberEmail.toLowerCase(), newResource);
                  }
                  
                  resourcesSynced++;
                  console.log(`Created resource: ${memberName} (ID: ${newResource.id})`);
                } catch (createErr) {
                  console.log(`Failed to create resource ${memberName}:`, createErr);
                }
              }
            }

            // Try multiple API approaches to fetch resource assignments
            // Different Dataverse schemas may use different field names or entities
            const assignmentApiUrls = [
              // Standard approach with project filter
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$select=msdyn_resourceassignmentid,_msdyn_projecttaskid_value,_msdyn_bookableresourceid_value&$filter=_msdyn_projectid_value eq ${planId}`,
              // Without project filter (will filter locally)
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$select=msdyn_resourceassignmentid,_msdyn_projecttaskid_value,_msdyn_bookableresourceid_value`,
              // Try with minimal fields (some schemas might not have all fields)
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments?$filter=_msdyn_projectid_value eq ${planId}`,
              // Without any select (get all fields)
              `${environmentUrl}/api/data/v9.2/msdyn_resourceassignments`,
              // Try bookableresourcebookings entity (alternative for some schemas)
              `${environmentUrl}/api/data/v9.2/bookableresourcebookings?$select=bookableresourcebookingid,_bookableresource_value&$filter=_msdyn_projecttask_value ne null`,
            ];
            
            let assignmentsResponse: Response | null = null;
            let assignmentsFetched = false;
            
            for (let i = 0; i < assignmentApiUrls.length; i++) {
              assignmentsResponse = await fetch(assignmentApiUrls[i], {
                headers: {
                  "Authorization": `Bearer ${dataverseToken}`,
                  "Content-Type": "application/json",
                  "OData-MaxVersion": "4.0",
                  "OData-Version": "4.0",
                },
              });
              if (assignmentsResponse.ok) {
                console.log(`Successfully fetched resource assignments using API variant ${i + 1}`);
                assignmentsFetched = true;
                break;
              }
              console.log(`Assignments API attempt ${i + 1} failed (status ${assignmentsResponse.status}), trying next...`);
            }

            if (assignmentsResponse && assignmentsFetched) {
              const assignmentsData = await assignmentsResponse.json();
              let assignments = assignmentsData.value || [];
              
              // Log sample assignment for debugging
              if (assignments.length > 0) {
                console.log("Sample assignment record:", JSON.stringify(assignments[0], null, 2));
              }
              
              // If we used the unfiltered query, filter manually to only include tasks in our project
              const projectTaskIds = new Set(Array.from(taskIdMap.keys()));
              assignments = assignments.filter((a: any) => {
                // Support different field names for task ID across different Dataverse schemas
                const taskId = a._msdyn_projecttaskid_value || a._msdyn_projecttask_value || a._msdyn_taskid_value;
                return taskId && projectTaskIds.has(taskId);
              });
              
              console.log(`Planner Premium sync - Found ${assignments.length} relevant resource assignments`);

              // Apply assignments to tasks (with duplicate prevention)
              for (const assignment of assignments) {
                // Support different field names from different Dataverse schemas
                const dvTaskId = assignment._msdyn_projecttaskid_value || assignment._msdyn_projecttask_value || assignment._msdyn_taskid_value;
                const dvResourceId = assignment._msdyn_bookableresourceid_value || assignment._bookableresource_value;
                
                if (!dvTaskId || !dvResourceId) continue;
                
                const ourTaskId = taskIdMap.get(dvTaskId);
                const ourResourceId = bookableResourceMap.get(dvResourceId);
                
                if (ourTaskId && ourResourceId) {
                  const pairKey = `${ourTaskId}-${ourResourceId}`;
                  if (assignedPairs.has(pairKey)) {
                    console.log(`Skipping duplicate assignment: resource ${ourResourceId} to task ${ourTaskId}`);
                    continue;
                  }
                  
                  try {
                    await storage.addTaskResourceAssignment({
                      taskId: ourTaskId,
                      resourceId: ourResourceId,
                    });
                    assignedPairs.add(pairKey);
                  } catch (assignErr) {
                    // Assignment might already exist or other error
                    console.log(`Failed to assign resource ${ourResourceId} to task ${ourTaskId}:`, assignErr);
                  }
                }
              }
            } else {
              console.log(`Failed to fetch resource assignments from any API variant`);
            }
          } else {
            console.log(`Failed to fetch project team from any API variant`);
            // Log more details for debugging
            if (teamResponse) {
              try {
                const errText = await teamResponse.text();
                console.log(`Team fetch error details: ${errText}`);
              } catch (e) {
                // Ignore
              }
            }
          }
        } catch (resourceErr) {
          console.log("Error importing resources from Planner Premium:", resourceErr);
          // Continue without failing the sync - resources are optional
        }

        // Reassign preserved data to new tasks using externalId (primary) and task name (fallback)
        let timesheetEntriesPreserved = 0;
        let timesheetEntriesLost = 0;
        
        // Build maps: new task externalId -> new task ID, and new task name -> new task ID
        const newExternalIdToTaskId = new Map<string, number>();
        const newTaskNameToId = new Map<string, number>();
        const duplicateNames = new Set<string>();
        for (const task of createdTasks) {
          if (task.externalId) {
            newExternalIdToTaskId.set(task.externalId, task.id);
          }
          const taskName = task.name.toLowerCase().trim();
          if (newTaskNameToId.has(taskName)) {
            duplicateNames.add(taskName);
          } else {
            newTaskNameToId.set(taskName, task.id);
          }
        }
        if (duplicateNames.size > 0) {
          console.log(`Planner Premium sync WARNING: ${duplicateNames.size} duplicate task names found. Using externalId for reliable matching. Name fallback may be assigned to first matching task: ${Array.from(duplicateNames).slice(0, 5).join(', ')}${duplicateNames.size > 5 ? '...' : ''}`);
        }
        
        // Helper: resolve new task ID from externalId (primary) or task name (fallback)
        const resolveNewTaskId = (extId: string | null, taskName: string): number | undefined => {
          if (extId) {
            const byExtId = newExternalIdToTaskId.get(extId);
            if (byExtId) return byExtId;
          }
          return newTaskNameToId.get(taskName);
        };
        
        // Recreate timesheet entries with new task IDs (externalId-first matching)
        // First try by externalId, then by task name for tasks without externalId
        const processedTimesheetExternalIds = new Set<string>();
        for (const [extId, entriesData] of timesheetEntriesByExternalId) {
          const newTaskId = newExternalIdToTaskId.get(extId);
          processedTimesheetExternalIds.add(extId);
          if (newTaskId) {
            for (const { entries } of entriesData) {
              for (const entry of entries) {
                try {
                  await db.insert(timesheetEntries).values({
                    organizationId: entry.organizationId,
                    userId: entry.userId,
                    resourceId: entry.resourceId,
                    taskId: newTaskId,
                    projectId: entry.projectId,
                    entryDate: entry.entryDate,
                    hours: entry.hours,
                    notes: entry.notes,
                    status: entry.status,
                    submittedAt: entry.submittedAt,
                    approvedBy: entry.approvedBy,
                    approvedAt: entry.approvedAt,
                    rejectionReason: entry.rejectionReason,
                    createdAt: entry.createdAt,
                    updatedAt: new Date(),
                  });
                  timesheetEntriesPreserved++;
                } catch (err) {
                  console.log(`Failed to recreate timesheet entry for externalId ${extId}:`, err);
                  timesheetEntriesLost++;
                }
              }
            }
          } else {
            for (const { entries } of entriesData) {
              timesheetEntriesLost += entries.length;
            }
          }
        }
        // Fallback: process timesheet entries that were stored by task name (for tasks without externalId)
        for (const [taskName, entriesData] of timesheetEntriesByTaskName) {
          // Skip if already processed via externalId
          const alreadyProcessed = entriesData.every(({ oldTaskId }) => {
            const extId = oldTaskIdToExternalId.get(oldTaskId);
            return extId && processedTimesheetExternalIds.has(extId);
          });
          if (alreadyProcessed) continue;
          
          const newTaskId = newTaskNameToId.get(taskName);
          if (newTaskId) {
            for (const { entries, oldTaskId } of entriesData) {
              // Skip entries already processed by externalId
              const extId = oldTaskIdToExternalId.get(oldTaskId);
              if (extId && processedTimesheetExternalIds.has(extId)) continue;
              for (const entry of entries) {
                try {
                  await db.insert(timesheetEntries).values({
                    organizationId: entry.organizationId,
                    userId: entry.userId,
                    resourceId: entry.resourceId,
                    taskId: newTaskId,
                    projectId: entry.projectId,
                    entryDate: entry.entryDate,
                    hours: entry.hours,
                    notes: entry.notes,
                    status: entry.status,
                    submittedAt: entry.submittedAt,
                    approvedBy: entry.approvedBy,
                    approvedAt: entry.approvedAt,
                    rejectionReason: entry.rejectionReason,
                    createdAt: entry.createdAt,
                    updatedAt: new Date(),
                  });
                  timesheetEntriesPreserved++;
                } catch (err) {
                  console.log(`Failed to recreate timesheet entry for task ${taskName}:`, err);
                  timesheetEntriesLost++;
                }
              }
            }
          } else {
            for (const { entries, oldTaskId } of entriesData) {
              const extId = oldTaskIdToExternalId.get(oldTaskId);
              if (extId && processedTimesheetExternalIds.has(extId)) continue;
              timesheetEntriesLost += entries.length;
            }
          }
        }
        
        if (timesheetEntriesPreserved > 0 || timesheetEntriesLost > 0) {
          console.log(`Planner Premium sync: Timesheet entries preserved: ${timesheetEntriesPreserved}, lost: ${timesheetEntriesLost}`);
        }

        // Restore preserved hours - externalId first, task name fallback
        let hoursPreserved = 0;
        const processedHoursExtIds = new Set<string>();
        for (const [extId, hours] of hoursByExternalId) {
          const newTaskId = newExternalIdToTaskId.get(extId);
          processedHoursExtIds.add(extId);
          if (newTaskId && (hours.estimatedHours || hours.actualHours)) {
            try {
              await storage.updateTask(newTaskId, {
                estimatedHours: hours.estimatedHours,
                actualHours: hours.actualHours,
              });
              hoursPreserved++;
            } catch (err) {
              console.log(`Planner Premium sync: Failed to restore hours for externalId "${extId}":`, err);
            }
          }
        }
        for (const [taskName, hours] of hoursByTaskName) {
          if (processedHoursExtIds.size > 0) {
            // Check if this was already processed by externalId
            const matchingTask = existingTasks.find(t => t.name.toLowerCase().trim() === taskName && t.externalId && processedHoursExtIds.has(t.externalId));
            if (matchingTask) continue;
          }
          const newTaskId = newTaskNameToId.get(taskName);
          if (newTaskId && (hours.estimatedHours || hours.actualHours)) {
            try {
              await storage.updateTask(newTaskId, {
                estimatedHours: hours.estimatedHours,
                actualHours: hours.actualHours,
              });
              hoursPreserved++;
            } catch (err) {
              console.log(`Planner Premium sync: Failed to restore hours for task "${taskName}":`, err);
            }
          }
        }
        if (hoursPreserved > 0) {
          console.log(`Planner Premium sync: Restored hours for ${hoursPreserved} tasks`);
        }
        
        // Restore task change logs - externalId first, task name fallback
        let changeLogsPreserved = 0;
        let changeLogsLost = 0;
        const processedChangeLogExtIds = new Set<string>();
        for (const [extId, logs] of changeLogsByExternalId) {
          const newTaskId = newExternalIdToTaskId.get(extId);
          processedChangeLogExtIds.add(extId);
          if (newTaskId) {
            for (const log of logs) {
              try {
                await db.insert(taskChangeLogs).values({
                  taskId: newTaskId,
                  changedBy: log.changedBy,
                  changedByName: log.changedByName,
                  changedAt: log.changedAt,
                  changeType: log.changeType,
                  changeSummary: log.changeSummary,
                  previousValues: log.previousValues,
                  newValues: log.newValues,
                });
                changeLogsPreserved++;
              } catch (err) {
                console.log(`Planner Premium sync: Failed to preserve change log:`, err);
                changeLogsLost++;
              }
            }
          } else {
            changeLogsLost += logs.length;
          }
        }
        for (const [taskName, logs] of changeLogsByTaskName) {
          const matchingTask = existingTasks.find(t => t.name.toLowerCase().trim() === taskName && t.externalId && processedChangeLogExtIds.has(t.externalId));
          if (matchingTask) continue;
          const newTaskId = newTaskNameToId.get(taskName);
          if (newTaskId) {
            for (const log of logs) {
              try {
                await db.insert(taskChangeLogs).values({
                  taskId: newTaskId,
                  changedBy: log.changedBy,
                  changedByName: log.changedByName,
                  changedAt: log.changedAt,
                  changeType: log.changeType,
                  changeSummary: log.changeSummary,
                  previousValues: log.previousValues,
                  newValues: log.newValues,
                });
                changeLogsPreserved++;
              } catch (err) {
                console.log(`Planner Premium sync: Failed to preserve change log:`, err);
                changeLogsLost++;
              }
            }
          } else {
            changeLogsLost += logs.length;
          }
        }
        if (changeLogsPreserved > 0 || changeLogsLost > 0) {
          console.log(`Planner Premium sync: Preserved ${changeLogsPreserved} change logs, lost ${changeLogsLost}`);
        }
        
        // Restore task dependencies - externalId first, task name fallback
        let dependenciesPreserved = 0;
        let dependenciesLost = 0;
        const processedDepExtIds = new Set<string>();
        for (const [extId, deps] of dependenciesByExternalId) {
          const newTaskId = newExternalIdToTaskId.get(extId);
          processedDepExtIds.add(extId);
          if (newTaskId) {
            for (const dep of deps) {
              const dependsOnTaskId = resolveNewTaskId(dep.dependsOnExternalId, dep.dependsOnTaskName);
              if (dependsOnTaskId) {
                try {
                  await db.insert(taskDependencies).values({
                    taskId: newTaskId,
                    dependsOnTaskId: dependsOnTaskId,
                    dependencyType: dep.dependencyType,
                    lagDays: dep.lagDays,
                  });
                  dependenciesPreserved++;
                } catch (err) {
                  console.log(`Planner Premium sync: Failed to preserve dependency:`, err);
                  dependenciesLost++;
                }
              } else {
                dependenciesLost++;
              }
            }
          } else {
            dependenciesLost += deps.length;
          }
        }
        for (const [taskName, deps] of dependenciesByTaskNames) {
          const matchingTask = existingTasks.find(t => t.name.toLowerCase().trim() === taskName && t.externalId && processedDepExtIds.has(t.externalId));
          if (matchingTask) continue;
          const newTaskId = newTaskNameToId.get(taskName);
          if (newTaskId) {
            for (const dep of deps) {
              const dependsOnTaskId = resolveNewTaskId(dep.dependsOnExternalId, dep.dependsOnTaskName);
              if (dependsOnTaskId) {
                try {
                  await db.insert(taskDependencies).values({
                    taskId: newTaskId,
                    dependsOnTaskId: dependsOnTaskId,
                    dependencyType: dep.dependencyType,
                    lagDays: dep.lagDays,
                  });
                  dependenciesPreserved++;
                } catch (err) {
                  console.log(`Planner Premium sync: Failed to preserve dependency:`, err);
                  dependenciesLost++;
                }
              } else {
                dependenciesLost++;
              }
            }
          } else {
            dependenciesLost += deps.length;
          }
        }
        if (dependenciesPreserved > 0 || dependenciesLost > 0) {
          console.log(`Planner Premium sync: Preserved ${dependenciesPreserved} dependencies, lost ${dependenciesLost}`);
        }

        // Fetch and import dependencies from Dataverse (picks up new dependencies added in Planner)
        let dataverseDepsImported = 0;
        try {
          const depApiUrls = [
            `${environmentUrl}/api/data/v9.2/msdyn_projecttaskdependencies?$select=msdyn_projecttaskdependencyid,_msdyn_predecessortask_value,_msdyn_successortask_value,msdyn_linktype&$filter=_msdyn_project_value eq ${planId}`,
            `${environmentUrl}/api/data/v9.2/msdyn_projecttaskdependencies?$filter=_msdyn_project_value eq ${planId}`,
          ];

          let depResponse: Response | null = null;
          let depFetched = false;

          for (let i = 0; i < depApiUrls.length; i++) {
            depResponse = await fetch(depApiUrls[i], {
              headers: {
                "Authorization": `Bearer ${dataverseToken}`,
                "Content-Type": "application/json",
                "OData-MaxVersion": "4.0",
                "OData-Version": "4.0",
              },
            });
            if (depResponse.ok) {
              depFetched = true;
              break;
            }
          }

          if (depResponse && depFetched) {
            const depData = await depResponse.json();
            const dvDependencies = depData.value || [];
            console.log(`Planner Premium sync: Found ${dvDependencies.length} dependencies in Dataverse`);

            // Get existing dependencies for this project's tasks to avoid duplicates
            const existingDeps = new Set<string>();
            const allNewTasks = await storage.getTasksByProject(projectId);
            for (const task of allNewTasks) {
              const deps = await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, task.id));
              for (const dep of deps) {
                existingDeps.add(`${dep.taskId}-${dep.dependsOnTaskId}`);
              }
            }

            for (const dvDep of dvDependencies) {
              const predecessorExtId = dvDep._msdyn_predecessortask_value;
              const successorExtId = dvDep._msdyn_successortask_value;

              if (!predecessorExtId || !successorExtId) continue;

              const predecessorTaskId = newExternalIdToTaskId.get(predecessorExtId);
              const successorTaskId = newExternalIdToTaskId.get(successorExtId);

              if (predecessorTaskId && successorTaskId) {
                const depKey = `${successorTaskId}-${predecessorTaskId}`;
                if (existingDeps.has(depKey)) continue;

                let dependencyType = 'finish-to-start';
                const linkType = dvDep.msdyn_linktype;
                if (linkType === 192350001) dependencyType = 'start-to-start';
                else if (linkType === 192350002) dependencyType = 'finish-to-finish';
                else if (linkType === 192350003) dependencyType = 'start-to-finish';

                try {
                  await db.insert(taskDependencies).values({
                    taskId: successorTaskId,
                    dependsOnTaskId: predecessorTaskId,
                    dependencyType,
                    lagDays: 0,
                  });
                  existingDeps.add(depKey);
                  dataverseDepsImported++;
                } catch (err) {
                  console.log(`Planner Premium sync: Failed to import Dataverse dependency:`, err);
                }
              }
            }
          }
        } catch (depErr) {
          console.log("Planner Premium sync: Error fetching dependencies from Dataverse:", depErr);
        }
        if (dataverseDepsImported > 0) {
          console.log(`Planner Premium sync: Imported ${dataverseDepsImported} new dependencies from Dataverse`);
        }

        // Restore issue/risk relatedTaskId links - externalId first, task name fallback
        let issueLinksPreserved = 0;
        let issueLinksLost = 0;
        for (const [issueId, { externalId: extId, taskName }] of issuesWithRelatedTasks) {
          const newTaskId = resolveNewTaskId(extId, taskName);
          if (newTaskId) {
            try {
              await db.update(issues).set({ relatedTaskId: newTaskId }).where(eq(issues.id, issueId));
              issueLinksPreserved++;
            } catch (err) {
              console.log(`Planner Premium sync: Failed to restore issue task link:`, err);
              issueLinksLost++;
            }
          } else {
            issueLinksLost++;
          }
        }
        if (issueLinksPreserved > 0 || issueLinksLost > 0) {
          console.log(`Planner Premium sync: Preserved ${issueLinksPreserved} issue task links, lost ${issueLinksLost}`);
        }

        // Update project dates
        if (projectStartDate || projectEndDate) {
          await storage.updateProject(projectId, {
            startDate: projectStartDate || project.startDate,
            endDate: projectEndDate || project.endDate,
          });
        }

        return res.json({ 
          synced: createdTasks.length,
          resourcesSynced,
          timesheetEntriesPreserved,
          timesheetEntriesLost,
          changeLogsPreserved,
          changeLogsLost,
          dependenciesPreserved,
          dependenciesLost,
          dataverseDepsImported,
          issueLinksPreserved,
          issueLinksLost,
          message: `Successfully synced ${createdTasks.length} tasks${resourcesSynced > 0 ? ` and ${resourcesSynced} new resources` : ''}${timesheetEntriesPreserved > 0 ? ` (preserved ${timesheetEntriesPreserved} timesheet entries)` : ''}${changeLogsPreserved > 0 ? ` (preserved ${changeLogsPreserved} change logs)` : ''}${(dependenciesPreserved + dataverseDepsImported) > 0 ? ` (${dependenciesPreserved > 0 ? `preserved ${dependenciesPreserved}` : ''}${dependenciesPreserved > 0 && dataverseDepsImported > 0 ? ', ' : ''}${dataverseDepsImported > 0 ? `imported ${dataverseDepsImported} new` : ''} dependencies)` : ''}${issueLinksPreserved > 0 ? ` (preserved ${issueLinksPreserved} issue links)` : ''} from Planner Premium`
        });
      }

      // Regular Planner sync (non-Premium)
      const token = req.session.plannerAccessToken;
      if (!token) {
        return res.status(401).json({ message: "Not connected to Planner. Please reconnect." });
      }

      // Fetch tasks and buckets from Planner
      const [tasksResponse, bucketsResponse] = await Promise.all([
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/tasks`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
        fetch(`https://graph.microsoft.com/v1.0/planner/plans/${planId}/buckets`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      ]);

      if (!tasksResponse.ok) {
        if (tasksResponse.status === 401) {
          delete req.session.plannerAccessToken;
          return res.status(401).json({ message: "Session expired. Please reconnect to Planner." });
        }
        throw new Error(`Failed to fetch tasks: ${tasksResponse.status}`);
      }

      const tasksData = await tasksResponse.json();
      const plannerTasks = tasksData.value || [];

      let buckets: { id: string; name: string }[] = [];
      if (bucketsResponse.ok) {
        const bucketsData = await bucketsResponse.json();
        buckets = bucketsData.value || [];
      }
      const bucketMap = new Map(buckets.map((b: any) => [b.id, b.name]));

      // Get existing tasks for this project
      const existingTasks = await storage.getTasksByProject(projectId);
      
      // Build old task ID to name and externalId mappings for relationship preservation
      const oldTaskIdToName = new Map<number, string>();
      const oldTaskIdToExternalId = new Map<number, string>();
      for (const task of existingTasks) {
        oldTaskIdToName.set(task.id, task.name.toLowerCase().trim());
        if (task.externalId) {
          oldTaskIdToExternalId.set(task.id, task.externalId);
        }
      }
      
      // Preserve hours by externalId (primary) and task name (fallback)
      const hoursByExternalId = new Map<string, { estimatedHours: number | null; actualHours: number | null }>();
      const hoursByTaskName = new Map<string, { estimatedHours: number | null; actualHours: number | null }>();
      for (const task of existingTasks) {
        if (task.estimatedHours || task.actualHours) {
          const hoursData = { estimatedHours: task.estimatedHours, actualHours: task.actualHours };
          if (task.externalId) {
            hoursByExternalId.set(task.externalId, hoursData);
          }
          const taskName = task.name.toLowerCase().trim();
          if (!hoursByTaskName.has(taskName)) {
            hoursByTaskName.set(taskName, hoursData);
          }
        }
      }
      console.log(`Planner sync: Found ${hoursByExternalId.size} tasks with hours to preserve (by externalId), ${hoursByTaskName.size} (by name)`);
      
      // Preserve timesheet entries by externalId (primary) and task name (fallback)
      const timesheetEntriesByExternalId = new Map<string, { entries: any[]; oldTaskId: number }[]>();
      const timesheetEntriesByTaskName = new Map<string, { entries: any[]; oldTaskId: number }[]>();
      for (const task of existingTasks) {
        const entries = await db.select().from(timesheetEntries).where(eq(timesheetEntries.taskId, task.id));
        if (entries.length > 0) {
          if (task.externalId) {
            if (!timesheetEntriesByExternalId.has(task.externalId)) {
              timesheetEntriesByExternalId.set(task.externalId, []);
            }
            timesheetEntriesByExternalId.get(task.externalId)!.push({ entries, oldTaskId: task.id });
          }
          const taskName = task.name.toLowerCase().trim();
          if (!timesheetEntriesByTaskName.has(taskName)) {
            timesheetEntriesByTaskName.set(taskName, []);
          }
          timesheetEntriesByTaskName.get(taskName)!.push({ entries, oldTaskId: task.id });
        }
      }
      console.log(`Planner sync: Found ${timesheetEntriesByExternalId.size} tasks with timesheet entries to preserve (by externalId), ${timesheetEntriesByTaskName.size} (by name)`);
      
      // Preserve task change logs by externalId and task name
      const changeLogsByExternalId = new Map<string, any[]>();
      const changeLogsByTaskName = new Map<string, any[]>();
      for (const task of existingTasks) {
        const logs = await db.select().from(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
        if (logs.length > 0) {
          if (task.externalId) {
            if (!changeLogsByExternalId.has(task.externalId)) {
              changeLogsByExternalId.set(task.externalId, []);
            }
            changeLogsByExternalId.get(task.externalId)!.push(...logs);
          }
          const taskName = task.name.toLowerCase().trim();
          if (!changeLogsByTaskName.has(taskName)) {
            changeLogsByTaskName.set(taskName, []);
          }
          changeLogsByTaskName.get(taskName)!.push(...logs);
        }
      }
      console.log(`Planner sync: Found ${changeLogsByExternalId.size} tasks with change logs to preserve (by externalId), ${changeLogsByTaskName.size} (by name)`);
      
      // Preserve task dependencies by externalId and task names
      const dependenciesByExternalId = new Map<string, { dependsOnExternalId: string | null; dependsOnTaskName: string; dependencyType: string; lagDays: number }[]>();
      const dependenciesByTaskNames = new Map<string, { dependsOnExternalId: string | null; dependsOnTaskName: string; dependencyType: string; lagDays: number }[]>();
      for (const task of existingTasks) {
        const deps = await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, task.id));
        if (deps.length > 0) {
          const taskName = task.name.toLowerCase().trim();
          const taskExtId = task.externalId || null;
          for (const dep of deps) {
            const dependsOnName = oldTaskIdToName.get(dep.dependsOnTaskId) || '';
            const dependsOnExtId = oldTaskIdToExternalId.get(dep.dependsOnTaskId) || null;
            const depData = {
              dependsOnExternalId: dependsOnExtId,
              dependsOnTaskName: dependsOnName,
              dependencyType: dep.dependencyType || 'finish-to-start',
              lagDays: dep.lagDays || 0,
            };
            if (taskExtId) {
              if (!dependenciesByExternalId.has(taskExtId)) {
                dependenciesByExternalId.set(taskExtId, []);
              }
              dependenciesByExternalId.get(taskExtId)!.push(depData);
            }
            if (!dependenciesByTaskNames.has(taskName)) {
              dependenciesByTaskNames.set(taskName, []);
            }
            dependenciesByTaskNames.get(taskName)!.push(depData);
          }
        }
      }
      console.log(`Planner sync: Found ${dependenciesByExternalId.size} tasks with dependencies to preserve (by externalId), ${dependenciesByTaskNames.size} (by name)`);
      
      // Collect issues with relatedTaskId - store both externalId and taskName
      const issuesWithRelatedTasks = new Map<number, { externalId: string | null; taskName: string }>();
      for (const task of existingTasks) {
        const relatedIssues = await db.select().from(issues).where(eq(issues.relatedTaskId, task.id));
        for (const issue of relatedIssues) {
          issuesWithRelatedTasks.set(issue.id, {
            externalId: task.externalId || null,
            taskName: task.name.toLowerCase().trim(),
          });
        }
      }
      console.log(`Planner sync: Found ${issuesWithRelatedTasks.size} issues with related tasks to preserve`);

      // Delete all existing tasks for this project (full sync)
      // First delete timesheet entries temporarily (we'll recreate them with new task IDs)
      for (const task of existingTasks) {
        await db.delete(timesheetEntries).where(eq(timesheetEntries.taskId, task.id));
      }
      // Delete task change logs temporarily
      for (const task of existingTasks) {
        await db.delete(taskChangeLogs).where(eq(taskChangeLogs.taskId, task.id));
      }
      // Delete task dependencies
      for (const task of existingTasks) {
        await db.delete(taskDependencies).where(eq(taskDependencies.taskId, task.id));
        await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, task.id));
      }
      // Clear relatedTaskId on issues (will be restored later)
      for (const task of existingTasks) {
        await db.update(issues).set({ relatedTaskId: null }).where(eq(issues.relatedTaskId, task.id));
      }
      // Clean up orphaned notifications referencing these tasks
      for (const task of existingTasks) {
        await db.delete(notifications).where(eq(notifications.taskId, task.id));
      }
      // Then delete task resource assignments to avoid FK constraint violations
      for (const task of existingTasks) {
        await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, task.id));
      }
      for (const task of existingTasks) {
        await storage.deleteTask(task.id);
      }

      // Calculate default dates
      let projectStartDate: string | null = null;
      let projectEndDate: string | null = null;
      for (const task of plannerTasks) {
        if (task.startDateTime) {
          const startDate = task.startDateTime.split('T')[0];
          if (!projectStartDate || startDate < projectStartDate) {
            projectStartDate = startDate;
          }
        }
        if (task.dueDateTime) {
          const endDate = task.dueDateTime.split('T')[0];
          if (!projectEndDate || endDate > projectEndDate) {
            projectEndDate = endDate;
          }
        }
      }

      const defaultStartDate = projectStartDate || new Date().toISOString().split('T')[0];
      const defaultEndDate = projectEndDate || defaultStartDate;

      // Create new tasks from Planner
      let taskIndex = 0;
      const createdTasks: { task: any; plannerTaskId: string; assignments: any }[] = [];
      const newTasksByName = new Map<string, number>();

      for (const plannerTask of plannerTasks) {
        taskIndex++;
        const bucketName = plannerTask.bucketId ? bucketMap.get(plannerTask.bucketId) || null : null;

        const taskStartDate = plannerTask.startDateTime 
          ? plannerTask.startDateTime.split('T')[0] 
          : defaultStartDate;
        const taskEndDate = plannerTask.dueDateTime 
          ? plannerTask.dueDateTime.split('T')[0] 
          : (plannerTask.startDateTime ? plannerTask.startDateTime.split('T')[0] : defaultEndDate);

        const durationDays = calculateDuration(new Date(taskStartDate), new Date(taskEndDate));
        const taskIsMilestone = durationDays === 0;

        const task = await storage.createTask({
          projectId: project.id,
          taskIndex,
          name: plannerTask.title,
          description: null,
          priority: mapPlannerPriorityToProjectPriority(plannerTask.priority || 5),
          startDate: taskStartDate,
          endDate: taskEndDate,
          durationDays,
          progress: plannerTask.percentComplete || 0,
          status: mapPlannerPercentToStatus(plannerTask.percentComplete || 0),
          phase: bucketName,
          outlineLevel: 1,
          isMilestone: taskIsMilestone,
          isSummary: false,
          isCritical: false,
          externalId: plannerTask.id,
        });

        createdTasks.push({ task, plannerTaskId: plannerTask.id, assignments: plannerTask.assignments });
        
        // Track new tasks by name and externalId for timesheet entry reassignment
        const taskNameKey = plannerTask.title.toLowerCase().trim();
        if (!newTasksByName.has(taskNameKey)) {
          newTasksByName.set(taskNameKey, task.id);
        }
      }

      // Build externalId -> new task ID map for reliable matching
      const newExternalIdToTaskId = new Map<string, number>();
      for (const { task, plannerTaskId } of createdTasks) {
        newExternalIdToTaskId.set(plannerTaskId, task.id);
      }
      
      // Warn if duplicate task names exist
      const taskNameCounts = new Map<string, number>();
      for (const plannerTask of plannerTasks) {
        const taskName = plannerTask.title.toLowerCase().trim();
        taskNameCounts.set(taskName, (taskNameCounts.get(taskName) || 0) + 1);
      }
      const duplicateNames: string[] = [];
      for (const [name, count] of Array.from(taskNameCounts.entries())) {
        if (count > 1) {
          duplicateNames.push(name);
        }
      }
      if (duplicateNames.length > 0) {
        console.log(`Planner sync WARNING: ${duplicateNames.length} duplicate task names found. Using externalId for reliable matching. Name fallback may be assigned to first matching task: ${duplicateNames.slice(0, 5).join(', ')}${duplicateNames.length > 5 ? '...' : ''}`);
      }

      // Helper: resolve new task ID from externalId (primary) or task name (fallback)
      const resolveNewTaskId = (extId: string | null, taskName: string): number | undefined => {
        if (extId) {
          const byExtId = newExternalIdToTaskId.get(extId);
          if (byExtId) return byExtId;
        }
        return newTasksByName.get(taskName);
      };

      // Reassign preserved timesheet entries - externalId first, task name fallback
      let timesheetEntriesPreserved = 0;
      let timesheetEntriesLost = 0;
      const processedTimesheetExternalIds = new Set<string>();
      for (const [extId, taskGroups] of timesheetEntriesByExternalId) {
        const newTaskId = newExternalIdToTaskId.get(extId);
        processedTimesheetExternalIds.add(extId);
        if (newTaskId) {
          for (const { entries } of taskGroups) {
            for (const entry of entries) {
              try {
                await db.insert(timesheetEntries).values({
                  organizationId: entry.organizationId,
                  userId: entry.userId,
                  resourceId: entry.resourceId,
                  taskId: newTaskId,
                  projectId: entry.projectId,
                  entryDate: entry.entryDate,
                  hours: entry.hours,
                  notes: entry.notes,
                  status: entry.status,
                  submittedAt: entry.submittedAt,
                  approvedBy: entry.approvedBy,
                  approvedAt: entry.approvedAt,
                  rejectionReason: entry.rejectionReason,
                  createdAt: entry.createdAt,
                  updatedAt: new Date(),
                });
                timesheetEntriesPreserved++;
              } catch (err) {
                console.log(`Planner sync: Failed to preserve timesheet entry (externalId ${extId}):`, err);
                timesheetEntriesLost++;
              }
            }
          }
        } else {
          for (const { entries } of taskGroups) {
            timesheetEntriesLost += entries.length;
          }
        }
      }
      // Fallback: process timesheet entries by task name for tasks without externalId
      for (const [taskName, taskGroups] of timesheetEntriesByTaskName) {
        const alreadyProcessed = taskGroups.every(({ oldTaskId }) => {
          const extId = oldTaskIdToExternalId.get(oldTaskId);
          return extId && processedTimesheetExternalIds.has(extId);
        });
        if (alreadyProcessed) continue;
        
        const newTaskId = newTasksByName.get(taskName);
        if (newTaskId) {
          for (const { entries, oldTaskId } of taskGroups) {
            const extId = oldTaskIdToExternalId.get(oldTaskId);
            if (extId && processedTimesheetExternalIds.has(extId)) continue;
            for (const entry of entries) {
              try {
                await db.insert(timesheetEntries).values({
                  organizationId: entry.organizationId,
                  userId: entry.userId,
                  resourceId: entry.resourceId,
                  taskId: newTaskId,
                  projectId: entry.projectId,
                  entryDate: entry.entryDate,
                  hours: entry.hours,
                  notes: entry.notes,
                  status: entry.status,
                  submittedAt: entry.submittedAt,
                  approvedBy: entry.approvedBy,
                  approvedAt: entry.approvedAt,
                  rejectionReason: entry.rejectionReason,
                  createdAt: entry.createdAt,
                  updatedAt: new Date(),
                });
                timesheetEntriesPreserved++;
              } catch (err) {
                console.log(`Planner sync: Failed to preserve timesheet entry (name ${taskName}):`, err);
                timesheetEntriesLost++;
              }
            }
          }
        } else {
          for (const { entries, oldTaskId } of taskGroups) {
            const extId = oldTaskIdToExternalId.get(oldTaskId);
            if (extId && processedTimesheetExternalIds.has(extId)) continue;
            timesheetEntriesLost += entries.length;
          }
        }
      }
      console.log(`Planner sync: Preserved ${timesheetEntriesPreserved} timesheet entries, lost ${timesheetEntriesLost}`);

      // Restore preserved hours - externalId first, task name fallback
      let hoursPreserved = 0;
      const processedHoursExtIds = new Set<string>();
      for (const [extId, hours] of hoursByExternalId) {
        const newTaskId = newExternalIdToTaskId.get(extId);
        processedHoursExtIds.add(extId);
        if (newTaskId && (hours.estimatedHours || hours.actualHours)) {
          try {
            await storage.updateTask(newTaskId, {
              estimatedHours: hours.estimatedHours,
              actualHours: hours.actualHours,
            });
            hoursPreserved++;
          } catch (err) {
            console.log(`Planner sync: Failed to restore hours for externalId "${extId}":`, err);
          }
        }
      }
      for (const [taskName, hours] of hoursByTaskName) {
        const matchingTask = existingTasks.find(t => t.name.toLowerCase().trim() === taskName && t.externalId && processedHoursExtIds.has(t.externalId));
        if (matchingTask) continue;
        const newTaskId = newTasksByName.get(taskName);
        if (newTaskId && (hours.estimatedHours || hours.actualHours)) {
          try {
            await storage.updateTask(newTaskId, {
              estimatedHours: hours.estimatedHours,
              actualHours: hours.actualHours,
            });
            hoursPreserved++;
          } catch (err) {
            console.log(`Planner sync: Failed to restore hours for task "${taskName}":`, err);
          }
        }
      }
      console.log(`Planner sync: Restored hours for ${hoursPreserved} tasks`);
      
      // Restore task change logs - externalId first, task name fallback
      let changeLogsPreserved = 0;
      let changeLogsLost = 0;
      const processedChangeLogExtIds = new Set<string>();
      for (const [extId, logs] of changeLogsByExternalId) {
        const newTaskId = newExternalIdToTaskId.get(extId);
        processedChangeLogExtIds.add(extId);
        if (newTaskId) {
          for (const log of logs) {
            try {
              await db.insert(taskChangeLogs).values({
                taskId: newTaskId,
                changedBy: log.changedBy,
                changedByName: log.changedByName,
                changedAt: log.changedAt,
                changeType: log.changeType,
                changeSummary: log.changeSummary,
                previousValues: log.previousValues,
                newValues: log.newValues,
              });
              changeLogsPreserved++;
            } catch (err) {
              console.log(`Planner sync: Failed to preserve change log:`, err);
              changeLogsLost++;
            }
          }
        } else {
          changeLogsLost += logs.length;
        }
      }
      for (const [taskName, logs] of changeLogsByTaskName) {
        const matchingTask = existingTasks.find(t => t.name.toLowerCase().trim() === taskName && t.externalId && processedChangeLogExtIds.has(t.externalId));
        if (matchingTask) continue;
        const newTaskId = newTasksByName.get(taskName);
        if (newTaskId) {
          for (const log of logs) {
            try {
              await db.insert(taskChangeLogs).values({
                taskId: newTaskId,
                changedBy: log.changedBy,
                changedByName: log.changedByName,
                changedAt: log.changedAt,
                changeType: log.changeType,
                changeSummary: log.changeSummary,
                previousValues: log.previousValues,
                newValues: log.newValues,
              });
              changeLogsPreserved++;
            } catch (err) {
              console.log(`Planner sync: Failed to preserve change log:`, err);
              changeLogsLost++;
            }
          }
        } else {
          changeLogsLost += logs.length;
        }
      }
      console.log(`Planner sync: Preserved ${changeLogsPreserved} change logs, lost ${changeLogsLost}`);
      
      // Restore task dependencies - externalId first, task name fallback
      let dependenciesPreserved = 0;
      let dependenciesLost = 0;
      const processedDepExtIds = new Set<string>();
      for (const [extId, deps] of dependenciesByExternalId) {
        const newTaskId = newExternalIdToTaskId.get(extId);
        processedDepExtIds.add(extId);
        if (newTaskId) {
          for (const dep of deps) {
            const dependsOnTaskId = resolveNewTaskId(dep.dependsOnExternalId, dep.dependsOnTaskName);
            if (dependsOnTaskId) {
              try {
                await db.insert(taskDependencies).values({
                  taskId: newTaskId,
                  dependsOnTaskId: dependsOnTaskId,
                  dependencyType: dep.dependencyType,
                  lagDays: dep.lagDays,
                });
                dependenciesPreserved++;
              } catch (err) {
                console.log(`Planner sync: Failed to preserve dependency:`, err);
                dependenciesLost++;
              }
            } else {
              dependenciesLost++;
            }
          }
        } else {
          dependenciesLost += deps.length;
        }
      }
      for (const [taskName, deps] of dependenciesByTaskNames) {
        const matchingTask = existingTasks.find(t => t.name.toLowerCase().trim() === taskName && t.externalId && processedDepExtIds.has(t.externalId));
        if (matchingTask) continue;
        const newTaskId = newTasksByName.get(taskName);
        if (newTaskId) {
          for (const dep of deps) {
            const dependsOnTaskId = resolveNewTaskId(dep.dependsOnExternalId, dep.dependsOnTaskName);
            if (dependsOnTaskId) {
              try {
                await db.insert(taskDependencies).values({
                  taskId: newTaskId,
                  dependsOnTaskId: dependsOnTaskId,
                  dependencyType: dep.dependencyType,
                  lagDays: dep.lagDays,
                });
                dependenciesPreserved++;
              } catch (err) {
                console.log(`Planner sync: Failed to preserve dependency:`, err);
                dependenciesLost++;
              }
            } else {
              dependenciesLost++;
            }
          }
        } else {
          dependenciesLost += deps.length;
        }
      }
      console.log(`Planner sync: Preserved ${dependenciesPreserved} dependencies, lost ${dependenciesLost}`);
      
      // Restore issue/risk relatedTaskId links - externalId first, task name fallback
      let issueLinksPreserved = 0;
      let issueLinksLost = 0;
      for (const [issueId, { externalId: extId, taskName }] of issuesWithRelatedTasks) {
        const newTaskId = resolveNewTaskId(extId, taskName);
        if (newTaskId) {
          try {
            await db.update(issues).set({ relatedTaskId: newTaskId }).where(eq(issues.id, issueId));
            issueLinksPreserved++;
          } catch (err) {
            console.log(`Planner sync: Failed to restore issue task link:`, err);
            issueLinksLost++;
          }
        } else {
          issueLinksLost++;
        }
      }
      console.log(`Planner sync: Preserved ${issueLinksPreserved} issue task links, lost ${issueLinksLost}`);

      // Import resources and assignments from Planner (same logic as initial import)
      let resourcesSynced = 0;
      try {
        const userIdSet = new Set<string>();
        for (const { assignments } of createdTasks) {
          if (assignments) {
            for (const userId of Object.keys(assignments)) {
              userIdSet.add(userId);
            }
          }
        }

        if (userIdSet.size > 0) {
          console.log(`Planner sync: Found ${userIdSet.size} assigned users`);
          
          const existingResources = await storage.getResources(project.organizationId);
          const resourcesByEmail = new Map(existingResources.filter(r => r.email).map(r => [r.email!.toLowerCase(), r]));
          const resourcesByName = new Map(existingResources.map(r => [r.displayName.toLowerCase(), r]));
          const userResourceMap = new Map<string, number>();
          const assignedPairs = new Set<string>();

          const userIds = Array.from(userIdSet);
          for (const msUserId of userIds) {
            try {
              const userResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${msUserId}?$select=id,displayName,mail,userPrincipalName`, {
                headers: {
                  "Authorization": `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              });

              if (userResponse.ok) {
                const userData = await userResponse.json();
                const userName = userData.displayName || 'Unknown User';
                const userEmail = userData.mail || userData.userPrincipalName || null;
                
                console.log(`Planner sync: User ${msUserId} - Name: ${userName}, Email: ${userEmail}`);

                let matchedResource = userEmail ? resourcesByEmail.get(userEmail.toLowerCase()) : null;
                if (!matchedResource) {
                  matchedResource = resourcesByName.get(userName.toLowerCase());
                }

                if (matchedResource) {
                  userResourceMap.set(msUserId, matchedResource.id);
                  console.log(`Planner sync: Matched resource: ${userName} (ID: ${matchedResource.id})`);
                } else {
                  const newResource = await storage.createResource({
                    organizationId: project.organizationId,
                    displayName: userName,
                    email: userEmail,
                    title: 'Team Member',
                    resourceType: 'Employee',
                    availability: 100,
                  });

                  userResourceMap.set(msUserId, newResource.id);
                  if (userEmail) {
                    resourcesByEmail.set(userEmail.toLowerCase(), newResource);
                  }
                  resourcesByName.set(userName.toLowerCase(), newResource);

                  resourcesSynced++;
                  console.log(`Planner sync: Created resource: ${userName} (ID: ${newResource.id}, Email: ${userEmail})`);
                }
              } else {
                console.log(`Planner sync: Failed to fetch user ${msUserId}: ${userResponse.status}`);
              }
            } catch (userErr) {
              console.log(`Planner sync: Error fetching user ${msUserId}:`, userErr);
            }
          }

          for (const { task, assignments } of createdTasks) {
            if (assignments) {
              for (const userId of Object.keys(assignments)) {
                const resourceId = userResourceMap.get(userId);
                if (resourceId) {
                  const pairKey = `${task.id}-${resourceId}`;
                  if (assignedPairs.has(pairKey)) continue;

                  try {
                    await storage.addTaskResourceAssignment({
                      taskId: task.id,
                      resourceId: resourceId,
                    });
                    assignedPairs.add(pairKey);
                  } catch (assignErr) {
                    console.log(`Planner sync: Failed to assign resource:`, assignErr);
                  }
                }
              }
            }
          }
        }
      } catch (resourceErr) {
        console.log("Planner sync: Error importing resources:", resourceErr);
      }

      // Update project dates if changed
      if (projectStartDate || projectEndDate) {
        await storage.updateProject(projectId, {
          startDate: projectStartDate || project.startDate,
          endDate: projectEndDate || project.endDate,
        });
      }

      res.json({ 
        success: true,
        tasksCount: createdTasks.length,
        resourcesSynced,
        timesheetEntriesPreserved,
        timesheetEntriesLost,
        changeLogsPreserved,
        changeLogsLost,
        dependenciesPreserved,
        dependenciesLost,
        issueLinksPreserved,
        issueLinksLost,
        message: `Synced ${createdTasks.length} tasks${resourcesSynced > 0 ? ` and ${resourcesSynced} new resources` : ''}${timesheetEntriesPreserved > 0 ? ` (preserved ${timesheetEntriesPreserved} timesheet entries)` : ''}${changeLogsPreserved > 0 ? ` (preserved ${changeLogsPreserved} change logs)` : ''}${dependenciesPreserved > 0 ? ` (preserved ${dependenciesPreserved} dependencies)` : ''}${issueLinksPreserved > 0 ? ` (preserved ${issueLinksPreserved} issue links)` : ''} from Planner`
      });
    } catch (err: any) {
      console.error("Planner sync error:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Failed to sync from Planner" : classified.message });
    }
  });

  apiRoute(app, 'put', api.projects.update.path, {
    tag: 'Projects',
    summary: 'Update project',
    parameters: [pathId()],
    requestBody: body(ref('ProjectRequest'), false),
    responses: { ...r200('Project updated', ref('Project')), ...updateRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      const existing = await storage.getProject(projectId);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      
      if (!await userHasOrgAccess(userId, existing.organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      
      const input = api.projects.update.input.parse(req.body);
      const sanitizedInput: Record<string, any> = {
        ...input,
        updatedAt: new Date(),
        updatedBy: userId || null,
      };
      // Only update dates if explicitly provided in the request
      if ('startDate' in input) {
        sanitizedInput.startDate = input.startDate || null;
      }
      if ('endDate' in input) {
        sanitizedInput.endDate = input.endDate || null;
      }
      
      // If healthReason is provided or health changed, update the timestamp and record history
      const healthChanged = input.health && input.health !== existing.health;
      const healthReasonChanged = input.healthReason !== undefined && input.healthReason !== null && 
        input.healthReason.trim() !== '' && input.healthReason.trim() !== (existing.healthReason || '').trim();
      
      if (healthReasonChanged || healthChanged) {
        sanitizedInput.healthReasonUpdatedAt = new Date();
        
        // Get user name for history record
        const user = userId ? await storage.getUser(userId) : null;
        const changedByName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System';
        
        // Record to health status history
        await storage.createHealthStatusHistory({
          projectId,
          previousHealth: existing.health || null,
          newHealth: input.health || existing.health || 'Green',
          comment: input.healthReason || null,
          changedBy: userId || null,
          changedByName,
        });
      }
      
      const updated = await storage.updateProject(projectId, sanitizedInput);
      
      // Track changes
      const trackedFields = ['name', 'description', 'status', 'priority', 'health', 'budget', 'startDate', 'endDate', 'completionPercentage', 'portfolioId'];
      const changes: string[] = [];
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      
      for (const field of trackedFields) {
        const prev = (existing as any)[field];
        const curr = (updated as any)[field];
        if (String(prev ?? '') !== String(curr ?? '')) {
          changes.push(`${field}: "${prev || '(empty)'}" → "${curr || '(empty)'}"`);
          prevValues[field] = prev;
          newValues[field] = curr;
        }
      }
      
      if (changes.length > 0) {
        const userId = getUserIdFromRequest(req);
        const user = userId ? await storage.getUser(userId) : null;
        await storage.createProjectChangeLog({
          projectId,
          changedBy: userId || null,
          changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
          changeType: 'updated',
          changeSummary: changes.join('; '),
          previousValues: JSON.stringify(prevValues),
          newValues: JSON.stringify(newValues),
        });
      }
      
      invalidateOrganizationContextCache(existing.organizationId);
      res.json(updated);
    } catch (err) {
      console.error("Error updating project:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error updating project" : classified.message });
    }
  });

  apiRoute(app, 'delete', api.projects.delete.path, {
    tag: 'Projects',
    summary: 'Delete project',
    parameters: [pathId()],
    responses: { ...r204('Project deleted'), ...fullRes },
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
      const role = await getUserOrgRole(userId, project.organizationId);
      if (role === 'viewer' || role === 'team_member') {
        return res.status(403).json({ message: 'Insufficient permissions to delete project' });
      }
      await storage.softDeleteItem('project', projectId, userId);
      invalidateOrganizationContextCache(project.organizationId);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error deleting project' : classified.message });
    }
  });

  // Convert imported project to editable (native) mode
  apiRoute(app, 'post', '/api/projects/:id/make-editable', {
    tag: 'Projects',
    summary: 'Convert read-only project to editable',
    parameters: [pathId()],
    responses: { ...r200('Project is now editable', ref('Project')), ...updateRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const userId = getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check user has access to this project's organization
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      // Only allow conversion for imported or planner projects
      if (project.source !== "imported" && project.source !== "planner" && project.source !== "planner_premium") {
        return res.status(400).json({ message: "Project is already editable" });
      }
      
      // Convert to manual (editable) mode - clear integration links to fully detach
      const updated = await storage.updateProject(projectId, {
        source: "manual",
        plannerPlanId: null,
        dataverseOrgId: null,
        dataverseTenantId: null,
        // Keep sourceFileName and sourceFileUrl for historical reference only
      });
      
      // Log the conversion
      const user = await storage.getUser(userId);
      await storage.createProjectChangeLog({
        projectId,
        changedBy: userId,
        changedByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        changeType: 'updated',
        changeSummary: `Converted from "${project.source}" to editable mode`,
        previousValues: JSON.stringify({ source: project.source }),
        newValues: JSON.stringify({ source: "manual" }),
      });
      
      invalidateOrganizationContextCache(project.organizationId);
      res.json({ 
        message: "Project converted to editable mode successfully",
        project: updated 
      });
    } catch (err) {
      console.error("Error converting project to editable:", err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error converting project to editable mode" : classified.message });
    }
  });

  // Project History
  apiRoute(app, 'get', api.projects.getHistory.path, {
    tag: 'Projects',
    summary: 'Get project change history',
    parameters: [pathId()],
    responses: { ...r200('Change history', { type: 'array', items: { type: 'object' } }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const history = await storage.getProjectChangeLogs(projectId);
      res.json(history);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project history" : classified.message });
    }
  });

  // Project Export (CSV and MSPDI/XML)
  apiRoute(app, 'get', '/api/projects/:id/export', {
    tag: 'Projects',
    summary: 'Export project schedule',
    parameters: [pathId(), p('format', 'query', { type: 'string', enum: ['csv', 'mspdi', 'xml'] }, false, 'Export format')],
    responses: { '200': { description: 'Exported file', content: { 'text/csv': { schema: { type: 'string' } }, 'application/xml': { schema: { type: 'string' } } } }, ...fullRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const format = (req.query.format as string) || 'csv';
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      // Security check: verify user is authenticated and has access to project's organization
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      // Check report limit before export
      const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("../services/billing");
      const limitCheck = await checkAndEnforceLimit(userId, METER_CODES.REPORTS);
      if (!limitCheck.allowed) {
        return res.status(403).json({ 
          message: limitCheck.error || "Report export limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "reports"
        });
      }
      
      const tasks = await storage.getTasks(projectId);
      const milestones = await storage.getMilestones(projectId);

      const tasksTable = (await import("@shared/schema")).tasks;
      const taskAssignmentRows = await db.select({
        taskId: taskResourceAssignments.taskId,
        displayName: resources.displayName,
      })
        .from(taskResourceAssignments)
        .innerJoin(resources, eq(taskResourceAssignments.resourceId, resources.id))
        .innerJoin(tasksTable, eq(taskResourceAssignments.taskId, tasksTable.id))
        .where(eq(tasksTable.projectId, projectId));

      const taskResourceMap = new Map<number, string>();
      for (const row of taskAssignmentRows) {
        const existing = taskResourceMap.get(row.taskId);
        const name = row.displayName || '';
        if (name) {
          taskResourceMap.set(row.taskId, existing ? `${existing}, ${name}` : name);
        }
      }
      
      const safeFileName = (project.name || 'project').replace(/[^a-z0-9]/gi, '_');
      
      // Helper to escape XML special characters
      const escapeXml = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      };
      
      if (format === 'csv') {
        // Fetch dependencies for this project
        const taskIds = tasks.map(t => t.id);
        const allDependencies = taskIds.length > 0
          ? await db.select().from(taskDependencies)
              .where(inArray(taskDependencies.taskId, taskIds))
          : [];

        const taskIdToIndex = new Map<number, number>();
        tasks.forEach((task, index) => {
          taskIdToIndex.set(task.id, index + 1);
        });

        const taskPredecessors = new Map<number, string[]>();
        for (const dep of allDependencies) {
          const predIndex = taskIdToIndex.get(dep.dependsOnTaskId);
          if (predIndex === undefined) continue;
          const depTypeMap: Record<string, string> = {
            'finish-to-start': 'FS',
            'start-to-start': 'SS',
            'finish-to-finish': 'FF',
            'start-to-finish': 'SF',
          };
          const typeAbbr = depTypeMap[dep.dependencyType || 'finish-to-start'] || 'FS';
          let predStr = String(predIndex);
          if (typeAbbr !== 'FS') predStr += typeAbbr;
          if (dep.lagDays && dep.lagDays !== 0) {
            predStr += (dep.lagDays > 0 ? '+' : '') + dep.lagDays + 'd';
          }
          if (!taskPredecessors.has(dep.taskId)) taskPredecessors.set(dep.taskId, []);
          taskPredecessors.get(dep.taskId)!.push(predStr);
        }

        // Generate CSV with task indentation reflecting outline hierarchy
        const headers = ['Index', 'WBS', 'Outline Level', 'Parent Task Index', 'Name', 'Type', 'Start Date', 'End Date', 'Duration (days)', '% Complete', 'Status', 'Priority', 'Assigned To', 'Predecessors', 'Description'];
        const rows: string[][] = [];

        const taskIdToCsvIndex = new Map<number, number>();
        tasks.forEach((task, index) => {
          taskIdToCsvIndex.set(task.id, index + 1);
        });
        
        // Add project as first row
        rows.push([
          '0',
          '0',
          '0',
          '',
          project.name || '',
          'Project',
          project.startDate || '',
          project.endDate || '',
          project.startDate && project.endDate ? String(calculateDuration(new Date(project.startDate), new Date(project.endDate))) : '',
          String(project.completionPercentage || 0),
          project.status || '',
          project.priority || '',
          '',
          '',
          project.description || ''
        ]);
        
        // Compute WBS values based on hierarchy
        const wbsCounters: number[] = [];
        const computeWbs = (outlineLevel: number): string => {
          const lvlIdx = outlineLevel - 1;
          while (wbsCounters.length <= lvlIdx) wbsCounters.push(0);
          wbsCounters[lvlIdx]++;
          wbsCounters.length = outlineLevel;
          return wbsCounters.join('.');
        };

        const parentStack: { level: number; csvIndex: number }[] = [];

        // Add tasks with indentation
        tasks.forEach((task, index) => {
          const level = task.outlineLevel || 1;
          const indent = '    '.repeat(level - 1);
          const wbs = task.wbs || computeWbs(level);
          const taskType = task.isSummary ? 'Summary' : task.isMilestone ? 'Milestone' : 'Task';
          const predecessorStr = taskPredecessors.get(task.id)?.join(';') || '';
          const csvIndex = index + 1;

          let parentCsvIndex = '';
          if (task.parentId && taskIdToCsvIndex.has(task.parentId)) {
            parentCsvIndex = String(taskIdToCsvIndex.get(task.parentId));
          } else if (level > 1) {
            while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
              parentStack.pop();
            }
            if (parentStack.length > 0) {
              parentCsvIndex = String(parentStack[parentStack.length - 1].csvIndex);
            }
          }

          if (task.isSummary) {
            parentStack.push({ level, csvIndex });
          } else {
            while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= level) {
              parentStack.pop();
            }
          }

          rows.push([
            String(csvIndex),
            wbs,
            String(level),
            parentCsvIndex,
            indent + (task.name || ''),
            taskType,
            task.startDate || '',
            task.endDate || '',
            task.durationDays != null ? String(task.durationDays) : '',
            String(task.progress || 0),
            task.status || '',
            task.priority || '',
            taskResourceMap.get(task.id) || task.assignee || '',
            predecessorStr,
            task.description || ''
          ]);
        });
        
        // Escape CSV values
        const escapeCSV = (val: string) => {
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        };
        
        const csvContent = [
          headers.map(escapeCSV).join(','),
          ...rows.map(row => row.map(escapeCSV).join(','))
        ].join('\n');
        
        // Record report usage
        await recordResourceUsage(userId, METER_CODES.REPORTS, `export_${projectId}_${Date.now()}`, 1, project.organizationId);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}_export.csv"`);
        res.send(csvContent);
        
      } else if (format === 'mspdi' || format === 'xml') {
        // Generate MSPDI (Microsoft Project XML) format
        const now = new Date().toISOString();
        const projectStart = project.startDate ? new Date(project.startDate).toISOString() : now;
        const projectEnd = project.endDate ? new Date(project.endDate).toISOString() : now;
        
        // Build task XML
        let taskXml = '';
        let taskUid = 0;
        
        // Project summary task (UID 0)
        taskXml += `
    <Task>
      <UID>${taskUid}</UID>
      <ID>${taskUid}</ID>
      <Name>${escapeXml(project.name || 'Project')}</Name>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <CreateDate>${now}</CreateDate>
      <WBS>0</WBS>
      <OutlineNumber>0</OutlineNumber>
      <OutlineLevel>0</OutlineLevel>
      <Priority>500</Priority>
      <Start>${projectStart}</Start>
      <Finish>${projectEnd}</Finish>
      <Duration>PT${Math.max(1, calculateDuration(new Date(projectStart), new Date(projectEnd)) * 8)}H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Summary>1</Summary>
      <Milestone>0</Milestone>
      <PercentComplete>${project.completionPercentage || 0}</PercentComplete>
      <PercentWorkComplete>${project.completionPercentage || 0}</PercentWorkComplete>
    </Task>`;
        
        // Compute WBS values based on hierarchy for XML export
        const xmlWbsCounters: number[] = [];
        const computeXmlWbs = (outlineLevel: number): string => {
          const lvlIdx = outlineLevel - 1;
          while (xmlWbsCounters.length <= lvlIdx) xmlWbsCounters.push(0);
          xmlWbsCounters[lvlIdx]++;
          xmlWbsCounters.length = outlineLevel;
          return xmlWbsCounters.join('.');
        };

        // Add tasks
        tasks.forEach((task, index) => {
          taskUid++;
          const taskStart = task.startDate ? new Date(task.startDate).toISOString() : projectStart;
          const taskEnd = task.endDate ? new Date(task.endDate).toISOString() : taskStart;
          const duration = task.durationDays ?? Math.max(1, calculateDuration(new Date(taskStart), new Date(taskEnd)));
          const level = task.outlineLevel || 1;
          const wbs = task.wbs || computeXmlWbs(level);
          
          taskXml += `
    <Task>
      <UID>${taskUid}</UID>
      <ID>${taskUid}</ID>
      <Name>${escapeXml(task.name || '')}</Name>
      <Type>0</Type>
      <IsNull>0</IsNull>
      <CreateDate>${task.createdAt ? new Date(task.createdAt).toISOString() : now}</CreateDate>
      <WBS>${escapeXml(wbs)}</WBS>
      <OutlineNumber>${escapeXml(wbs)}</OutlineNumber>
      <OutlineLevel>${level}</OutlineLevel>
      <Priority>500</Priority>
      <Start>${taskStart}</Start>
      <Finish>${taskEnd}</Finish>
      <Duration>PT${duration * 8}H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Summary>${task.isSummary ? 1 : 0}</Summary>
      <Milestone>${task.isMilestone ? 1 : 0}</Milestone>
      <PercentComplete>${task.progress || 0}</PercentComplete>
      <PercentWorkComplete>${task.progress || 0}</PercentWorkComplete>
      <Notes>${escapeXml(task.description || '')}</Notes>
    </Task>`;
        });
        
        // Add milestones as tasks
        milestones.forEach((ms, index) => {
          taskUid++;
          const msDate = ms.dueDate ? new Date(ms.dueDate).toISOString() : projectEnd;
          
          taskXml += `
    <Task>
      <UID>${taskUid}</UID>
      <ID>${taskUid}</ID>
      <Name>${escapeXml(ms.title || '')}</Name>
      <Type>0</Type>
      <IsNull>0</IsNull>
      <CreateDate>${now}</CreateDate>
      <WBS>M${index + 1}</WBS>
      <OutlineNumber>${tasks.length + index + 1}</OutlineNumber>
      <OutlineLevel>1</OutlineLevel>
      <Priority>500</Priority>
      <Start>${msDate}</Start>
      <Finish>${msDate}</Finish>
      <Duration>PT0H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Summary>0</Summary>
      <Milestone>1</Milestone>
      <PercentComplete>${ms.completed ? 100 : 0}</PercentComplete>
      <PercentWorkComplete>${ms.completed ? 100 : 0}</PercentWorkComplete>
      <Notes>${escapeXml(ms.description || '')}</Notes>
    </Task>`;
        });
        
        const mspdiXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${escapeXml(project.name || 'Project')}</Name>
  <Title>${escapeXml(project.name || 'Project')}</Title>
  <CreationDate>${now}</CreationDate>
  <LastSaved>${now}</LastSaved>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${projectStart}</StartDate>
  <FinishDate>${projectEnd}</FinishDate>
  <FYStartDate>1</FYStartDate>
  <CriticalSlackLimit>0</CriticalSlackLimit>
  <CurrencyDigits>2</CurrencyDigits>
  <CurrencySymbol>$</CurrencySymbol>
  <CurrencySymbolPosition>0</CurrencySymbolPosition>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DefaultTaskType>0</DefaultTaskType>
  <DefaultFixedCostAccrual>2</DefaultFixedCostAccrual>
  <DefaultStandardRate>0</DefaultStandardRate>
  <DefaultOvertimeRate>0</DefaultOvertimeRate>
  <DurationFormat>7</DurationFormat>
  <WorkFormat>2</WorkFormat>
  <EditableActualCosts>0</EditableActualCosts>
  <HonorConstraints>1</HonorConstraints>
  <InsertedProjectsLikeSummary>1</InsertedProjectsLikeSummary>
  <MultipleCriticalPaths>0</MultipleCriticalPaths>
  <NewTasksEffortDriven>1</NewTasksEffortDriven>
  <NewTasksEstimated>1</NewTasksEstimated>
  <SplitsInProgressTasks>1</SplitsInProgressTasks>
  <SpreadActualCost>0</SpreadActualCost>
  <SpreadPercentComplete>0</SpreadPercentComplete>
  <TaskUpdatesResource>1</TaskUpdatesResource>
  <FiscalYearStart>0</FiscalYearStart>
  <WeekStartDay>0</WeekStartDay>
  <MoveCompletedEndsBack>0</MoveCompletedEndsBack>
  <MoveRemainingStartsBack>0</MoveRemainingStartsBack>
  <MoveRemainingStartsForward>0</MoveRemainingStartsForward>
  <MoveCompletedEndsForward>0</MoveCompletedEndsForward>
  <BaselineForEarnedValue>0</BaselineForEarnedValue>
  <AutoAddNewResourcesAndTasks>1</AutoAddNewResourcesAndTasks>
  <CurrentDate>${now}</CurrentDate>
  <MicrosoftProjectServerURL>1</MicrosoftProjectServerURL>
  <Autolink>1</Autolink>
  <NewTaskStartDate>0</NewTaskStartDate>
  <NewTasksAreManual>0</NewTasksAreManual>
  <DefaultTaskEVMethod>0</DefaultTaskEVMethod>
  <ProjectExternallyEdited>0</ProjectExternallyEdited>
  <ExtendedCreationDate>${now}</ExtendedCreationDate>
  <ActualsInSync>1</ActualsInSync>
  <RemoveFileProperties>0</RemoveFileProperties>
  <AdminProject>0</AdminProject>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
        <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
        <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>3</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>4</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>5</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>6</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>${taskXml}
  </Tasks>
</Project>`;
        
        // Record report usage
        await recordResourceUsage(userId, METER_CODES.REPORTS, `export_${projectId}_${Date.now()}`, 1, project.organizationId);
        
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}_export.xml"`);
        res.send(mspdiXml);
        
      } else {
        res.status(400).json({ message: "Invalid format. Use 'csv' or 'mspdi'" });
      }
    } catch (err) {
      console.error('Export error:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error exporting project" : classified.message });
    }
  });

  // Project Status Report Email
  apiRoute(app, 'post', '/api/projects/:id/status-report/email', {
    tag: 'Projects',
    summary: 'Email AI status report for project',
    parameters: [pathId()],
    responses: { ...r200('Status report emailed', { type: 'object', properties: { message: { type: 'string' } } }), ...createRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const { recipientEmail, executiveSummary, pdfBase64, pdfFileName } = req.body;
      
      if (!recipientEmail) {
        return res.status(400).json({ message: "Recipient email is required" });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      // Check report and email limits before sending
      const { checkAndEnforceLimit, METER_CODES, recordResourceUsage } = await import("../services/billing");
      
      // Check report limit (for generating the report)
      const reportCheck = await checkAndEnforceLimit(userId, METER_CODES.REPORTS);
      if (!reportCheck.allowed) {
        return res.status(403).json({ 
          message: reportCheck.error || "Report limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "reports"
        });
      }
      
      // Check email limit (for sending the email)
      const emailCheck = await checkAndEnforceLimit(userId, METER_CODES.EMAILS);
      if (!emailCheck.allowed) {
        return res.status(403).json({ 
          message: emailCheck.error || "Email limit reached. Please upgrade your plan.",
          limitExceeded: true,
          resourceType: "emails"
        });
      }
      
      const user = await storage.getUser(userId);
      const tasks = await storage.getTasks(projectId);
      const risks = await storage.getRisks(projectId);
      const issues = await storage.getIssues(projectId);
      const milestones = await storage.getMilestones(projectId);
      const financials = await storage.getProjectFinancials(projectId);
      const changeRequests = await storage.getChangeRequests(projectId);
      const documents = await storage.getProjectDocuments(projectId);
      
      const leafTasks = tasks.filter(t => !t.isSummary);
      const completed = leafTasks.filter(t => t.status === "Completed" || t.progress === 100).length;
      const inProgress = leafTasks.filter(t => t.status === "In Progress").length;
      const notStarted = leafTasks.filter(t => t.status === "Not Started" || (!t.status && t.progress === 0)).length;
      const total = leafTasks.length || 1;
      const totalProgress = tasks.reduce((sum: number, t: any) => sum + (t.progress || 0), 0);
      const overallCompletion = tasks.length > 0 ? Math.round(totalProgress / tasks.length) : 0;
      
      const budget = financials.reduce((sum, f) => sum + (f.budgetAmount ?? 0), 0);
      const actual = financials.reduce((sum, f) => sum + (f.actualAmount ?? 0), 0);
      const planned = financials.reduce((sum, f) => sum + (f.plannedAmount ?? 0), 0);
      const projectBudget = parseFloat(project.budget?.toString() || "0");
      const totalBudget = budget > 0 ? budget : projectBudget;
      const forecast = planned > 0 ? planned : totalBudget;
      const variance = totalBudget - actual;
      
      const riskClosedStatuses = ["Closed", "Mitigated", "Accepted"];
      const issueClosedStatuses = ["Closed", "Resolved"];
      const allOpenRisks = risks.filter(r => !riskClosedStatuses.includes(r.status || "") && !r.deletedAt);
      const allOpenIssues = issues.filter(i => !issueClosedStatuses.includes(i.status || "") && !i.deletedAt);
      const openRisks = allOpenRisks.slice(0, 5);
      const openIssues = allOpenIssues.slice(0, 5);
      const riskHigh = allOpenRisks.filter(r => r.impact === "High" || r.impact === "Very High" || r.probability === "High" || r.probability === "Very High").length;
      const issueCritical = allOpenIssues.filter(i => i.priority === "Critical" || i.priority === "High").length;
      
      const majorMilestones = milestones
        .filter(m => !m.deletedAt)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 6);
      
      const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      };
      
      const formatDate = (date: string | null | Date) => {
        if (!date) return 'Not set';
        return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };
      
      const getHealthColor = (value: string | null) => {
        switch (value) {
          case "Green": return "#22c55e";
          case "Yellow": return "#eab308";
          case "Red": return "#ef4444";
          default: return "#22c55e";
        }
      };
      
      const getMilestoneStatus = (ms: typeof milestones[0]) => {
        if (ms.completed || ms.status === "Completed") return { text: "Complete", color: "#16a34a" };
        const dueDate = new Date(ms.dueDate);
        const today = new Date();
        if (dueDate < today) return { text: "At Risk", color: "#dc2626" };
        return { text: "On Track", color: "#6b7280" };
      };
      
      const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Status Report - ${project.name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 0; background: #f3f4f6;">
  <!--[if mso]>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="background-color: #1e3a5f; padding: 30px; text-align: center;">
  <![endif]-->
  <div style="background-color: #1e3a5f; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: #ffffff !important; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px; mso-line-height-rule: exactly;">PROJECT STATUS REPORT</h1>
    <p style="color: #cbd5e1 !important; margin: 10px 0 0 0; font-size: 14px; mso-line-height-rule: exactly;">${reportDate}</p>
    <p style="color: #f97316 !important; margin: 6px 0 0 0; font-size: 18px; font-weight: 600; mso-line-height-rule: exactly;">${project.name}</p>
  </div>
  <!--[if mso]>
      </td>
    </tr>
  </table>
  <![endif]-->
  
  <div style="background: #ffffff; padding: 30px;">
    
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      <tr>
        <td width="50%" style="vertical-align: top; padding-right: 15px;">
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Executive Summary</h2>
          <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 13px;">${executiveSummary || project.description || 'No executive summary provided.'}</p>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Project Schedule</h2>
          <div style="margin-bottom: 24px;">
            <div style="margin-bottom: 10px;">
              <span style="font-size: 12px; color: #374151;">Complete (${Math.round((completed / total) * 100)}%)</span>
              <div style="background: #e5e7eb; border-radius: 4px; height: 8px; margin-top: 4px;">
                <div style="background: #3b82f6; border-radius: 4px; height: 8px; width: ${(completed / total) * 100}%;"></div>
              </div>
            </div>
            <div style="margin-bottom: 10px;">
              <span style="font-size: 12px; color: #374151;">In Progress (${Math.round((inProgress / total) * 100)}%)</span>
              <div style="background: #e5e7eb; border-radius: 4px; height: 8px; margin-top: 4px;">
                <div style="background: #3b82f6; border-radius: 4px; height: 8px; width: ${(inProgress / total) * 100}%;"></div>
              </div>
            </div>
            <div>
              <span style="font-size: 12px; color: #374151;">Not Started (${Math.round((notStarted / total) * 100)}%)</span>
              <div style="background: #e5e7eb; border-radius: 4px; height: 8px; margin-top: 4px;">
                <div style="background: #3b82f6; border-radius: 4px; height: 8px; width: ${(notStarted / total) * 100}%;"></div>
              </div>
            </div>
          </div>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Financials</h2>
          <table width="100%" style="margin-bottom: 24px; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0; color: #374151;">Budget</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(totalBudget)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #374151;">Actual</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(actual)}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #374151;">Forecast</td>
              <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(forecast)}</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0 4px 0; color: #374151; font-weight: 600;">Variance</td>
              <td style="padding: 8px 0 4px 0; text-align: right; font-weight: 600; color: ${variance < 0 ? '#dc2626' : '#16a34a'};">${formatCurrency(variance)}</td>
            </tr>
          </table>
          
        </td>
        <td width="50%" style="vertical-align: top; padding-left: 15px;">
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Project Health</h2>
          <table width="100%" style="margin-bottom: 24px; text-align: center;">
            <tr>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${getHealthColor(project.health)}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">✓</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Overall</span>
              </td>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${getHealthColor(project.health)}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">✓</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Schedule</span>
              </td>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${actual > totalBudget ? '#ef4444' : '#22c55e'}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">✓</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Budget</span>
              </td>
              <td style="padding: 8px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${riskHigh > 2 ? '#ef4444' : riskHigh > 0 ? '#eab308' : '#22c55e'}; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: white; font-size: 16px;">!</span>
                </div>
                <span style="font-size: 11px; color: #6b7280;">Risk</span>
              </td>
            </tr>
          </table>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Key Risks & Issues</h2>
          <div style="margin-bottom: 12px;">
            <table width="100%" style="margin-bottom: 12px;">
              <tr>
                <td width="50%" style="background: #fef3c7; border-radius: 4px; padding: 8px; text-align: center;">
                  <div style="font-size: 18px; font-weight: 700; color: #d97706;">${allOpenRisks.length}</div>
                  <div style="font-size: 10px; color: #92400e;">Open Risks</div>
                </td>
                <td width="50%" style="background: #fee2e2; border-radius: 4px; padding: 8px; text-align: center;">
                  <div style="font-size: 18px; font-weight: 700; color: #dc2626;">${allOpenIssues.length}</div>
                  <div style="font-size: 10px; color: #991b1b;">Open Issues</div>
                </td>
              </tr>
            </table>
            <p style="font-size: 11px; color: #6b7280; margin: 0 0 12px 0;">High/Critical: <span style="color: #dc2626; font-weight: 600;">${riskHigh + issueCritical}</span></p>
          </div>
          <div style="margin-bottom: 24px;">
            ${openRisks.length === 0 && openIssues.length === 0 
              ? '<p style="color: #6b7280; font-size: 13px; margin: 0;">No open risks or issues</p>'
              : [...openRisks.map(r => ({...r, itemType: 'RISK', itemPriority: r.impact})), ...openIssues.map(i => ({...i, itemType: 'ISSUE', itemPriority: i.priority}))].slice(0, 5).map(item => `
                <div style="display: flex; align-items: center; margin-bottom: 6px; padding: 4px 0; border-bottom: 1px solid #f3f4f6;">
                  <span style="background: ${item.itemType === 'RISK' ? '#fef3c7' : '#fee2e2'}; color: ${item.itemType === 'RISK' ? '#d97706' : '#dc2626'}; font-size: 8px; padding: 2px 6px; border-radius: 2px; margin-right: 8px; font-weight: 600;">${item.itemType}</span>
                  <span style="font-size: 12px; color: #374151; flex: 1;">${item.title || ''}</span>
                  <span style="background: ${item.itemPriority === 'High' || item.itemPriority === 'Critical' ? '#fee2e2' : item.itemPriority === 'Medium' ? '#fef3c7' : '#f3f4f6'}; color: ${item.itemPriority === 'High' || item.itemPriority === 'Critical' ? '#dc2626' : item.itemPriority === 'Medium' ? '#d97706' : '#6b7280'}; font-size: 9px; padding: 2px 6px; border-radius: 2px;">${item.itemPriority || 'Medium'}</span>
                </div>
              `).join('')
            }
          </div>
          
          <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Major Milestones</h2>
          ${majorMilestones.length === 0 
            ? '<p style="color: #6b7280; font-size: 13px; margin: 0 0 24px 0;">No milestones defined</p>'
            : `<table width="100%" style="margin-bottom: 24px; font-size: 12px;">
                ${majorMilestones.map(ms => {
                  const status = getMilestoneStatus(ms);
                  return `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                      <td style="padding: 6px 0; color: #374151;">${ms.title}</td>
                      <td style="padding: 6px 0; color: #6b7280;">${formatDate(ms.dueDate)}</td>
                      <td style="padding: 6px 0; text-align: right; color: ${status.color};">${status.text}</td>
                    </tr>
                  `;
                }).join('')}
              </table>`
          }
          
        </td>
      </tr>
    </table>
    
    <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 14px;">Project Timeline</h3>
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #4b5563;">
        ${formatDate(project.startDate)} → ${formatDate(project.endDate)}
      </p>
      <div style="background: #e5e7eb; border-radius: 4px; height: 12px;">
        <div style="background: #3b82f6; border-radius: 4px; height: 12px; width: ${overallCompletion}%;"></div>
      </div>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">${overallCompletion}% Complete</p>
    </div>
    
    <div style="display: flex; gap: 8px; margin-bottom: 24px;">
      <span style="background: #e5e7eb; color: #374151; padding: 4px 12px; border-radius: 4px; font-size: 12px;">${project.status}</span>
      <span style="background: ${project.priority === 'Critical' ? '#fef2f2' : '#e5e7eb'}; color: ${project.priority === 'Critical' ? '#dc2626' : '#374151'}; padding: 4px 12px; border-radius: 4px; font-size: 12px;">${project.priority}</span>
    </div>
    
    ${changeRequests.length > 0 ? `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 14px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Change Requests (${changeRequests.length})</h3>
      <table width="100%" style="font-size: 12px;">
        ${changeRequests.slice(0, 5).map(cr => {
          const statusColor = cr.status === 'approved' ? '#16a34a' : cr.status === 'rejected' ? '#dc2626' : '#6b7280';
          return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 0; color: #374151;">${cr.title || 'Untitled'}</td>
            <td style="padding: 6px 0; color: #6b7280; text-transform: capitalize;">${(cr.type || 'scope').replace('_', ' ')}</td>
            <td style="padding: 6px 0; text-align: right; color: ${statusColor}; text-transform: capitalize;">${(cr.status || 'pending').replace('_', ' ')}</td>
          </tr>
          `;
        }).join('')}
      </table>
      ${changeRequests.length > 5 ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280; font-style: italic;">+ ${changeRequests.length - 5} more change requests</p>` : ''}
    </div>
    ` : ''}
    
    ${documents.length > 0 ? `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <h3 style="margin: 0 0 12px 0; color: #1f2937; font-size: 14px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Project Documents (${documents.length})</h3>
      <table width="100%" style="font-size: 12px;">
        ${documents.slice(0, 5).map(doc => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px 0; color: #374151;">${doc.title || 'Untitled'}</td>
            <td style="padding: 6px 0; color: #6b7280; text-transform: capitalize;">${(doc.category || 'general').replace('_', ' ')}</td>
            <td style="padding: 6px 0; text-align: right; color: #6b7280;">v${doc.version || '1.0'}</td>
          </tr>
        `).join('')}
      </table>
      ${documents.length > 5 ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280; font-style: italic;">+ ${documents.length - 5} more documents</p>` : ''}
    </div>
    ` : ''}
    
    <table width="100%" cellpadding="0" cellspacing="8" style="margin-bottom: 16px;">
      <tr>
        <td width="25%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${leafTasks.length}</div>
          <div style="font-size: 11px; color: #6b7280;">Total Tasks</div>
        </td>
        <td width="25%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #22c55e;">${overallCompletion}%</div>
          <div style="font-size: 11px; color: #6b7280;">Complete</div>
        </td>
        <td width="25%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${milestones.filter(m => !m.deletedAt).length}</div>
          <div style="font-size: 11px; color: #6b7280;">Milestones</div>
        </td>
        <td width="12.5%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${allOpenRisks.length}</div>
          <div style="font-size: 11px; color: #6b7280;">Open Risks</div>
        </td>
        <td width="12.5%" style="background: #f9fafb; border-radius: 8px; padding: 12px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #ef4444;">${allOpenIssues.length}</div>
          <div style="font-size: 11px; color: #6b7280;">Open Issues</div>
        </td>
      </tr>
    </table>
    
  </div>
  
  <div style="padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
    <p style="color: #9ca3af; font-size: 11px; margin: 0;">Generated by FridayReport.AI on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
    <p style="margin: 8px 0 0; font-size: 11px;"><a href="https://fridayreport.ai/profile?section=notifications" style="color: #9ca3af; text-decoration: underline;">Manage notification preferences</a></p>
  </div>
</body>
</html>
`;
      
      const textContent = `
PROJECT STATUS REPORT
${project.name}
${reportDate}

EXECUTIVE SUMMARY
${executiveSummary || project.description || 'No executive summary provided.'}

PROJECT SCHEDULE
- Complete: ${Math.round((completed / total) * 100)}%
- In Progress: ${Math.round((inProgress / total) * 100)}%
- Not Started: ${Math.round((notStarted / total) * 100)}%

FINANCIALS
- Budget: ${formatCurrency(totalBudget)}
- Actual: ${formatCurrency(actual)}
- Forecast: ${formatCurrency(forecast)}
- Variance: ${formatCurrency(variance)}

PROJECT HEALTH
- Overall: ${project.health || 'Green'}
- Budget Status: ${actual > totalBudget ? 'Over Budget' : 'On Budget'}

KEY RISKS & ISSUES
${openRisks.length === 0 && openIssues.length === 0 
  ? '- No open risks or issues'
  : [...openRisks, ...openIssues].map(item => `- ${'title' in item ? item.title : ''}`).join('\n')
}

MAJOR MILESTONES
${majorMilestones.length === 0 
  ? '- No milestones defined'
  : majorMilestones.map(ms => {
      const status = getMilestoneStatus(ms);
      return `- ${ms.title} (${formatDate(ms.dueDate)}) - ${status.text}`;
    }).join('\n')
}

PROJECT TIMELINE
${formatDate(project.startDate)} → ${formatDate(project.endDate)}
${overallCompletion}% Complete

Status: ${project.status} | Priority: ${project.priority}

${changeRequests.length > 0 ? `CHANGE REQUESTS (${changeRequests.length})
${changeRequests.slice(0, 5).map(cr => `- ${cr.title || 'Untitled'} (${(cr.type || 'scope').replace('_', ' ')}) - ${(cr.status || 'pending').replace('_', ' ')}`).join('\n')}
${changeRequests.length > 5 ? `+ ${changeRequests.length - 5} more change requests` : ''}
` : ''}
${documents.length > 0 ? `PROJECT DOCUMENTS (${documents.length})
${documents.slice(0, 5).map(doc => `- ${doc.title || 'Untitled'} (${(doc.category || 'general').replace('_', ' ')}) - v${doc.version || '1.0'}`).join('\n')}
${documents.length > 5 ? `+ ${documents.length - 5} more documents` : ''}
` : ''}
SUMMARY STATISTICS
- Total Tasks: ${leafTasks.length}
- Completion: ${overallCompletion}%
- Milestones: ${milestones.filter(m => !m.deletedAt).length}
- Open Risks: ${allOpenRisks.length}
- Open Issues: ${allOpenIssues.length}

---
Generated by FridayReport.AI
`;

      // Build email with optional PDF attachment
      const attachments = pdfBase64 ? [{
        filename: pdfFileName || `${project.name}_Comprehensive_Status_Report.pdf`,
        content: pdfBase64,
        contentType: 'application/pdf',
      }] : undefined;
      
      const { shouldSendEmailToAddress } = await import("../services/userNotificationPreferences");
      const success = (await shouldSendEmailToAddress(recipientEmail, "report.shared"))
        ? await sendEmail({
            to: recipientEmail,
            subject: `Project Status Report: ${project.name} - ${reportDate}`,
            text: textContent,
            html: htmlContent,
            attachments,
          })
        : false;
      
      if (success) {
        // Get ISO week number for weekly tracking
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const weekNumber = Math.ceil((((now.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
        
        // Save status report history
        const openRisksCount = allOpenRisks.length;
        const openIssuesCount = allOpenIssues.length;
        const completedMilestonesCount = milestones.filter(m => (m.completed || m.status === "Completed") && !m.deletedAt).length;
        const totalMilestonesCount = milestones.filter(m => !m.deletedAt).length;
        
        await storage.createStatusReportHistory({
          projectId,
          organizationId: project.organizationId ?? null,
          reportDate: now.toISOString().split('T')[0],
          weekNumber,
          yearNumber: now.getFullYear(),
          executiveSummary: executiveSummary || project.description || null,
          reportType: 'weekly',
          recipientEmail,
          sentAt: now,
          pdfFileName: pdfFileName || `${project.name}_Comprehensive_Status_Report.pdf`,
          projectHealth: project.health || 'Green',
          projectStatus: project.status,
          completionPercentage: overallCompletion,
          totalBudget: totalBudget,
          actualSpent: actual,
          forecastAmount: forecast,
          openRisksCount,
          openIssuesCount,
          completedMilestonesCount,
          totalMilestonesCount,
          createdBy: userId,
          createdByName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown' : 'System',
        });
        
        // Record usage for report and email after successful send
        await recordResourceUsage(userId, METER_CODES.REPORTS, `report_${projectId}_${Date.now()}`, 1, project.organizationId);
        await recordResourceUsage(userId, METER_CODES.EMAILS, `email_${projectId}_${Date.now()}`, 1, project.organizationId);
        
        invalidateOrganizationContextCache(project.organizationId);
        res.json({ success: true, message: `Status report sent to ${recipientEmail}` });
      } else {
        res.status(500).json({ message: "Failed to send email. Please check email configuration." });
      }
    } catch (err) {
      console.error('Error sending status report email:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error sending status report" : classified.message });
    }
  });

  // Get Status Report History for a project
  apiRoute(app, 'get', '/api/projects/:id/status-report/history', {
    tag: 'Projects',
    summary: 'Get status report history for project',
    parameters: [pathId()],
    responses: { ...r200('Status report history', { type: 'array', items: { type: 'object' } }), ...idRes },
  }, async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      
      const userId = getUserIdFromRequest(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied to this project" });
      }
      
      const history = await storage.getStatusReportHistory(projectId);
      res.json(history);
    } catch (err) {
      console.error('Error fetching status report history:', err);
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching status report history" : classified.message });
    }
  });

  // ===================== PROJECT FORM LAYOUT (configurable Summary tab) =====================

  app.get('/api/organizations/:orgId/project-form-layout', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const organizationId = parseInt(req.params.orgId);
      if (Number.isNaN(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
      if (!await userHasOrgAccess(userId, organizationId)) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }
      const layout = await storage.seedDefaultProjectFormLayoutIfMissing(organizationId);
      res.json(layout);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error loading project form layout' : classified.message });
    }
  });

  function humanizeProjectLayoutZodError(err: z.ZodError, body: any): string {
    const tabs = Array.isArray(body?.tabs) ? body.tabs : [];
    const issues = err.errors.slice(0, 3).map(e => {
      const path = e.path;
      if (path[0] !== 'tabs' || typeof path[1] !== 'number') return e.message;
      const ti = path[1] as number;
      const tab = tabs[ti] ?? {};
      const tabLabel = (tab.label && String(tab.label).trim()) || `Tab ${ti + 1}`;
      const tabPart = `Tab "${tabLabel}"`;
      if (path[2] === 'key' || path[2] === 'label') {
        const fieldName = path[2] === 'label' ? 'name' : 'key';
        return `${tabPart} is missing a ${fieldName}.`;
      }
      if (path[2] === 'icon' || path[2] === 'isActive') return `${tabPart}: invalid ${path[2]}.`;
      if (path[2] !== 'sections' || typeof path[3] !== 'number') return `${tabPart}: ${e.message}`;
      const si = path[3] as number;
      const section = (tab.sections ?? [])[si] ?? {};
      const sectionLabel = (section.title && String(section.title).trim()) || `Section ${si + 1} (unnamed)`;
      const secPart = `${tabPart} → "${sectionLabel}"`;
      if (path[4] === 'title') return `${secPart}: title is too long (max 120 characters).`;
      if (path[4] === 'description') return `${secPart}: description is too long (max 500 characters).`;
      if (path[4] !== 'items' || typeof path[5] !== 'number') return `${secPart}: ${e.message}`;
      const ii = path[5] as number;
      const itemPart = `${secPart} → item ${ii + 1}`;
      if (path[6] === 'itemKey') return `${itemPart}: missing or invalid item.`;
      if (path[6] === 'itemType') return `${itemPart}: invalid item type.`;
      if (path[6] === 'width') return `${itemPart}: invalid width.`;
      return `${itemPart}: ${e.message}`;
    });
    const more = err.errors.length > 3 ? ` (+${err.errors.length - 3} more issue${err.errors.length - 3 === 1 ? '' : 's'})` : '';
    return issues.join(' ') + more;
  }

  const projectFormLayoutSchema = z.object({
    tabs: z.array(z.object({
      key: z.string().min(1).max(64),
      label: z.string().min(1).max(80),
      icon: z.string().max(40).nullish(),
      isActive: z.boolean().optional(),
      sections: z.array(z.object({
        title: z.string().max(120).nullish(),
        description: z.string().max(500).nullish(),
        items: z.array(z.object({
          itemType: z.enum(['field', 'custom_field', 'block']),
          itemKey: z.string().min(1).max(120),
          width: z.enum(['full', 'half', 'third']).default('full'),
        })).default([]),
      })).default([]),
    })).min(1, 'At least one tab is required'),
  });

  async function ensureProjectLayoutAdmin(req: any, res: any, organizationId: number, action: string): Promise<boolean> {
    const userId = getUserIdFromRequest(req);
    if (!userId || !await userHasOrgAccess(userId, organizationId)) {
      res.status(403).json({ message: 'Access denied to this organization' });
      return false;
    }
    const memberships = await storage.getOrganizationMembers(organizationId);
    const userMembership = memberships.find((m: any) => m.userId === userId);
    const isOrgAdmin = !!userMembership && (userMembership.role === 'org_admin' || userMembership.role === 'owner');
    const user = await storage.getUser(userId);
    const isSuperAdmin = hasAdminAccess(user);
    if (!isOrgAdmin && !isSuperAdmin) {
      res.status(403).json({ message: `Only organization admins can ${action} the project form layout` });
      return false;
    }
    return true;
  }

  app.put('/api/organizations/:orgId/project-form-layout', async (req: any, res) => {
    try {
      const organizationId = parseInt(req.params.orgId);
      if (Number.isNaN(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
      if (!await ensureProjectLayoutAdmin(req, res, organizationId, 'modify')) return;
      const result = projectFormLayoutSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: humanizeProjectLayoutZodError(result.error, req.body) });
      }
      const parsed = result.data;
      const keys = parsed.tabs.map(t => t.key);
      if (new Set(keys).size !== keys.length) {
        return res.status(400).json({ message: 'Two tabs end up with the same internal key. Please give each tab a distinct name.' });
      }
      const layout = await storage.replaceProjectFormLayout(organizationId, parsed.tabs);
      res.json(layout);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error saving project form layout' : classified.message });
    }
  });

  app.post('/api/organizations/:orgId/project-form-layout/reset', async (req: any, res) => {
    try {
      const organizationId = parseInt(req.params.orgId);
      if (Number.isNaN(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
      if (!await ensureProjectLayoutAdmin(req, res, organizationId, 'reset')) return;
      const layout = await storage.resetProjectFormLayoutToDefaults(organizationId);
      res.json(layout);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? 'Error resetting project form layout' : classified.message });
    }
  });

}
