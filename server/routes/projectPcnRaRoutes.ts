import type { Express } from "express";
import {
  insertProjectPcnRaSchema,
  updateProjectPcnRaSchema,
} from "@shared/schema";
import { storage } from "../storage";
import {
  classifyError,
  formatZodErrors,
  getUserIdFromRequest,
  userHasOrgAccess,
} from "./helpers";

export function registerProjectPcnRaRoutes(app: Express) {
  app.get('/api/projects/:projectId/pcns-ras', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      const rows = await storage.listProjectPcnsRas(projectId);
      res.json(rows);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching PCNs/RAs' : c.message });
    }
  });

  app.post('/api/projects/:projectId/pcns-ras', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });

      const parsed = insertProjectPcnRaSchema.safeParse({
        ...req.body,
        projectId,
        organizationId: project.organizationId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const created = await storage.createProjectPcnRa(parsed.data, userId);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error creating PCN/RA' : c.message });
    }
  });

  app.patch('/api/pcns-ras/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getProjectPcnRa(id);
      if (!existing) return res.status(404).json({ message: 'PCN/RA not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      const parsed = updateProjectPcnRaSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const updated = await storage.updateProjectPcnRa(id, parsed.data, userId);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error updating PCN/RA' : c.message });
    }
  });

  app.delete('/api/pcns-ras/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getProjectPcnRa(id);
      if (!existing) return res.status(404).json({ message: 'PCN/RA not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      await storage.deleteProjectPcnRa(id);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error deleting PCN/RA' : c.message });
    }
  });
}
