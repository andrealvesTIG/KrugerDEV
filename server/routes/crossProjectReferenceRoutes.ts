import type { Express } from "express";
import { z } from "zod";
import {
  getCrossProjectReferences,
  getCrossProjectReferencesByProject,
  createCrossProjectReference,
  deleteCrossProjectReference,
  getCrossProjectReference,
  validateTaskBelongsToProject,
} from "../storage";
import { storage } from "../storage";
import {
  getUserIdFromRequest,
  userHasOrgAccess,
  classifyError,
  formatZodErrors,
} from "./helpers";
import { apiRoute, pathId, body, r200, r201, r204, inputRes, authRes, fullRes, createRes } from "../route-registry";

const createRefSchema = z.object({
  organizationId: z.number(),
  referenceType: z.enum(["task_to_task", "project_to_project"]),
  sourceType: z.enum(["task", "project"]),
  sourceId: z.number(),
  sourceProjectId: z.number(),
  targetType: z.enum(["task", "project"]),
  targetId: z.number(),
  targetProjectId: z.number(),
  relationshipType: z.enum(["blocks", "is_blocked_by", "relates_to", "duplicates", "depends_on", "is_dependency_of"]),
  notes: z.string().optional().nullable(),
}).refine((data) => {
  if (data.referenceType === "task_to_task") {
    return data.sourceType === "task" && data.targetType === "task";
  }
  if (data.referenceType === "project_to_project") {
    return data.sourceType === "project" && data.targetType === "project";
  }
  return false;
}, { message: "referenceType must match sourceType and targetType" })
.refine((data) => {
  if (data.referenceType === "project_to_project") {
    return data.sourceProjectId !== data.targetProjectId;
  }
  return true;
}, { message: "Cannot create a reference from a project to itself" })
.refine((data) => {
  if (data.referenceType === "task_to_task") {
    return data.sourceProjectId !== data.targetProjectId;
  }
  return true;
}, { message: "Cross-project task references must link tasks from different projects" });

export function registerCrossProjectReferenceRoutes(app: Express) {
  apiRoute(app, 'get', '/api/cross-project-references', {
    tag: 'Projects',
    summary: 'Get cross-project references for an entity',
    parameters: [
      { name: 'entityType', in: 'query', required: true, schema: { type: 'string', enum: ['task', 'project'] } },
      { name: 'entityId', in: 'query', required: true, schema: { type: 'integer' } },
    ],
    responses: { ...r200('List of references'), ...inputRes, ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const entityType = req.query.entityType as "task" | "project";
      const entityId = Number(req.query.entityId);

      if (!entityType || !entityId || isNaN(entityId)) {
        return res.status(400).json({ message: "entityType and entityId are required" });
      }

      const refs = await getCrossProjectReferences(entityType, entityId);

      const orgChecked = await Promise.all(
        refs.map(async (ref) => {
          const hasAccess = await userHasOrgAccess(userId, ref.organizationId);
          return hasAccess ? ref : null;
        })
      );

      res.json(orgChecked.filter(Boolean));
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching cross-project references" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/cross-project-references/by-project/:projectId', {
    tag: 'Projects',
    summary: 'Get all cross-project references for a project',
    parameters: [pathId('projectId')],
    responses: { ...r200('Project references'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const refs = await getCrossProjectReferencesByProject(projectId);
      res.json(refs);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching project references" : classified.message });
    }
  });

  apiRoute(app, 'post', '/api/cross-project-references', {
    tag: 'Projects',
    summary: 'Create a cross-project reference',
    requestBody: body({
      type: 'object',
      properties: {
        organizationId: { type: 'integer' },
        referenceType: { type: 'string', enum: ['task_to_task', 'project_to_project'] },
        sourceType: { type: 'string', enum: ['task', 'project'] },
        sourceId: { type: 'integer' },
        sourceProjectId: { type: 'integer' },
        targetType: { type: 'string', enum: ['task', 'project'] },
        targetId: { type: 'integer' },
        targetProjectId: { type: 'integer' },
        relationshipType: { type: 'string', enum: ['blocks', 'is_blocked_by', 'relates_to', 'duplicates', 'depends_on', 'is_dependency_of'] },
        notes: { type: 'string', nullable: true },
      },
      required: ['organizationId', 'referenceType', 'sourceType', 'sourceId', 'sourceProjectId', 'targetType', 'targetId', 'targetProjectId', 'relationshipType'],
    }),
    responses: { ...r201('Reference created'), ...createRes, '409': { description: 'Reference already exists' } },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const input = createRefSchema.parse(req.body);

      if (!await userHasOrgAccess(userId, input.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const sourceProject = await storage.getProject(input.sourceProjectId);
      const targetProject = await storage.getProject(input.targetProjectId);

      if (!sourceProject || !targetProject) {
        return res.status(404).json({ message: "Source or target project not found" });
      }

      if (sourceProject.organizationId !== input.organizationId || targetProject.organizationId !== input.organizationId) {
        return res.status(400).json({ message: "Both projects must belong to the same organization" });
      }

      if (input.sourceType === "project" && input.sourceId !== input.sourceProjectId) {
        return res.status(400).json({ message: "Source ID must match source project ID for project references" });
      }
      if (input.targetType === "project" && input.targetId !== input.targetProjectId) {
        return res.status(400).json({ message: "Target ID must match target project ID for project references" });
      }

      const validTaskRelationships = ["blocks", "is_blocked_by", "relates_to", "duplicates"];
      const validProjectRelationships = ["depends_on", "is_dependency_of", "relates_to"];

      if (input.referenceType === "task_to_task" && !validTaskRelationships.includes(input.relationshipType)) {
        return res.status(400).json({ message: `Invalid relationship type for task references. Must be one of: ${validTaskRelationships.join(", ")}` });
      }
      if (input.referenceType === "project_to_project" && !validProjectRelationships.includes(input.relationshipType)) {
        return res.status(400).json({ message: `Invalid relationship type for project references. Must be one of: ${validProjectRelationships.join(", ")}` });
      }

      if (input.sourceType === "task") {
        const valid = await validateTaskBelongsToProject(input.sourceId, input.sourceProjectId);
        if (!valid) {
          return res.status(400).json({ message: "Source task does not belong to the specified source project" });
        }
      }

      if (input.targetType === "task") {
        const valid = await validateTaskBelongsToProject(input.targetId, input.targetProjectId);
        if (!valid) {
          return res.status(400).json({ message: "Target task does not belong to the specified target project" });
        }
      }

      const ref = await createCrossProjectReference({
        ...input,
        createdBy: userId,
      });

      res.status(201).json(ref);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: formatZodErrors(err) });
      }
      if (err?.message === "This reference already exists") {
        return res.status(409).json({ message: err.message });
      }
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error creating cross-project reference" : classified.message });
    }
  });

  apiRoute(app, 'delete', '/api/cross-project-references/:id', {
    tag: 'Projects',
    summary: 'Delete a cross-project reference',
    parameters: [pathId()],
    responses: { ...r204('Reference deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const id = Number(req.params.id);
      const ref = await getCrossProjectReference(id);
      if (!ref) return res.status(404).json({ message: "Reference not found" });

      if (!await userHasOrgAccess(userId, ref.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (ref.createdBy && ref.createdBy !== userId) {
        const members = await storage.getOrganizationMembers(ref.organizationId);
        const member = members.find(m => m.userId === userId);
        if (member && !["owner", "org_admin"].includes(member.role)) {
          return res.status(403).json({ message: "Only the creator or an admin can delete this reference" });
        }
      }

      await deleteCrossProjectReference(id);
      res.status(204).send();
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error deleting cross-project reference" : classified.message });
    }
  });

  apiRoute(app, 'get', '/api/projects/:projectId/tasks-for-reference', {
    tag: 'Projects',
    summary: 'Get tasks available for cross-project referencing',
    parameters: [pathId('projectId')],
    responses: { ...r200('Task list'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const projectId = Number(req.params.projectId);
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      if (!await userHasOrgAccess(userId, project.organizationId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const projectTasks = await storage.getTasks(projectId);
      const simplifiedTasks = projectTasks.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        projectId: t.projectId,
      }));

      res.json(simplifiedTasks);
    } catch (err) {
      const classified = classifyError(err);
      res.status(classified.status).json({ message: classified.status === 500 ? "Error fetching tasks" : classified.message });
    }
  });
}
