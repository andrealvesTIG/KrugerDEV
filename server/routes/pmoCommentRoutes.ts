import type { Express } from "express";
import { storage } from "../storage";
import {
  insertPmoCommentSchema,
  updatePmoCommentSchema,
} from "@shared/schema";
import {
  classifyError,
  formatZodErrors,
  getUserIdFromRequest,
  userHasOrgAccess,
} from "./helpers";

export function registerPmoCommentRoutes(app: Express) {
  app.get('/api/organizations/:orgId/pmo-comments', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const orgId = Number(req.params.orgId);
      if (isNaN(orgId)) return res.status(400).json({ message: 'Invalid organization id' });
      if (!await userHasOrgAccess(userId, orgId)) return res.status(403).json({ message: 'Access denied' });
      const rows = await storage.listPmoCommentsForOrg(orgId);
      res.json(rows);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching PMO comments' : c.message });
    }
  });

  app.get('/api/projects/:projectId/pmo-comments', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      const rows = await storage.listPmoCommentsForProject(projectId);
      res.json(rows);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching project PMO comments' : c.message });
    }
  });

  app.post('/api/projects/:projectId/pmo-comments', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });

      const parsed = insertPmoCommentSchema.safeParse({
        ...req.body,
        organizationId: project.organizationId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const created = await storage.createPmoCommentForProject(projectId, parsed.data, userId);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error creating PMO comment' : c.message });
    }
  });

  app.post('/api/projects/:projectId/pmo-comments/:commentId/link', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const commentId = Number(req.params.commentId);
      if (isNaN(projectId) || isNaN(commentId)) return res.status(400).json({ message: 'Invalid id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      const comment = await storage.getPmoComment(commentId);
      if (!comment) return res.status(404).json({ message: 'PMO comment not found' });
      if (comment.organizationId !== project.organizationId) {
        return res.status(403).json({ message: 'Cannot link a PMO comment from a different organization' });
      }
      await storage.linkPmoCommentToProject(projectId, commentId);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error linking PMO comment' : c.message });
    }
  });

  app.delete('/api/projects/:projectId/pmo-comments/:commentId', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const commentId = Number(req.params.commentId);
      if (isNaN(projectId) || isNaN(commentId)) return res.status(400).json({ message: 'Invalid id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      await storage.unlinkPmoCommentFromProject(projectId, commentId);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error unlinking PMO comment' : c.message });
    }
  });

  app.patch('/api/pmo-comments/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getPmoComment(id);
      if (!existing) return res.status(404).json({ message: 'PMO comment not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      const parsed = updatePmoCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const updated = await storage.updatePmoComment(id, parsed.data, userId);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error updating PMO comment' : c.message });
    }
  });

  app.delete('/api/pmo-comments/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getPmoComment(id);
      if (!existing) return res.status(404).json({ message: 'PMO comment not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      await storage.deletePmoComment(id);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error deleting PMO comment' : c.message });
    }
  });
}
