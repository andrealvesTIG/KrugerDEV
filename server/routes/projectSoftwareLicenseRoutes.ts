import type { Express } from "express";
import { storage } from "../storage";
import {
  insertProjectSoftwareLicenseSchema,
  updateProjectSoftwareLicenseSchema,
} from "@shared/schema";
import {
  classifyError,
  formatZodErrors,
  getUserIdFromRequest,
  userHasOrgAccess,
} from "./helpers";

export function registerProjectSoftwareLicenseRoutes(app: Express) {
  app.get('/api/projects/:projectId/software-licenses', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      const rows = await storage.listProjectSoftwareLicenses(projectId);
      res.json(rows);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching software/licenses' : c.message });
    }
  });

  app.post('/api/projects/:projectId/software-licenses', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });

      const parsed = insertProjectSoftwareLicenseSchema.safeParse({
        ...req.body,
        projectId,
        organizationId: project.organizationId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const created = await storage.createProjectSoftwareLicense(parsed.data, userId);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error creating software/license' : c.message });
    }
  });

  app.patch('/api/software-licenses/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getProjectSoftwareLicense(id);
      if (!existing) return res.status(404).json({ message: 'Software/license not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      const parsed = updateProjectSoftwareLicenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const updated = await storage.updateProjectSoftwareLicense(id, parsed.data, userId);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error updating software/license' : c.message });
    }
  });

  app.delete('/api/software-licenses/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getProjectSoftwareLicense(id);
      if (!existing) return res.status(404).json({ message: 'Software/license not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      await storage.deleteProjectSoftwareLicense(id);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error deleting software/license' : c.message });
    }
  });
}
