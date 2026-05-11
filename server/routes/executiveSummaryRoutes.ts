import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  insertExecutiveSummarySchema,
  updateExecutiveSummarySchema,
} from "@shared/schema";
import {
  classifyError,
  formatZodErrors,
  getUserIdFromRequest,
  userHasOrgAccess,
} from "./helpers";

export function registerExecutiveSummaryRoutes(app: Express) {
  // List all executive summaries for an organization (used by "Add Existing" picker)
  app.get('/api/organizations/:orgId/executive-summaries', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const orgId = Number(req.params.orgId);
      if (isNaN(orgId)) return res.status(400).json({ message: 'Invalid organization id' });
      if (!await userHasOrgAccess(userId, orgId)) return res.status(403).json({ message: 'Access denied' });
      const rows = await storage.listExecutiveSummariesForOrg(orgId);
      res.json(rows);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching executive summaries' : c.message });
    }
  });

  // List executive summaries linked to a project
  app.get('/api/projects/:projectId/executive-summaries', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      const rows = await storage.listExecutiveSummariesForProject(projectId);
      res.json(rows);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching project executive summaries' : c.message });
    }
  });

  // Create a new executive summary and link it to the project
  app.post('/api/projects/:projectId/executive-summaries', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: 'Invalid project id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });

      const parsed = insertExecutiveSummarySchema.safeParse({
        ...req.body,
        organizationId: project.organizationId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const created = await storage.createExecutiveSummaryForProject(projectId, parsed.data, userId);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error creating executive summary' : c.message });
    }
  });

  // Link an existing executive summary to the project
  app.post('/api/projects/:projectId/executive-summaries/:summaryId/link', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const summaryId = Number(req.params.summaryId);
      if (isNaN(projectId) || isNaN(summaryId)) return res.status(400).json({ message: 'Invalid id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      const summary = await storage.getExecutiveSummary(summaryId);
      if (!summary) return res.status(404).json({ message: 'Executive summary not found' });
      if (summary.organizationId !== project.organizationId) {
        return res.status(403).json({ message: 'Cannot link an executive summary from a different organization' });
      }
      await storage.linkExecutiveSummaryToProject(projectId, summaryId);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error linking executive summary' : c.message });
    }
  });

  // Unlink an executive summary from the project (does not delete the summary)
  app.delete('/api/projects/:projectId/executive-summaries/:summaryId', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const projectId = Number(req.params.projectId);
      const summaryId = Number(req.params.summaryId);
      if (isNaN(projectId) || isNaN(summaryId)) return res.status(400).json({ message: 'Invalid id' });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!await userHasOrgAccess(userId, project.organizationId!)) return res.status(403).json({ message: 'Access denied' });
      await storage.unlinkExecutiveSummaryFromProject(projectId, summaryId);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error unlinking executive summary' : c.message });
    }
  });

  // Update an executive summary
  app.patch('/api/executive-summaries/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getExecutiveSummary(id);
      if (!existing) return res.status(404).json({ message: 'Executive summary not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      const parsed = updateExecutiveSummarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const updated = await storage.updateExecutiveSummary(id, parsed.data, userId);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error updating executive summary' : c.message });
    }
  });

  // Delete an executive summary entirely (cascades to project links)
  app.delete('/api/executive-summaries/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const existing = await storage.getExecutiveSummary(id);
      if (!existing) return res.status(404).json({ message: 'Executive summary not found' });
      if (!await userHasOrgAccess(userId, existing.organizationId)) return res.status(403).json({ message: 'Access denied' });
      await storage.deleteExecutiveSummary(id);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error deleting executive summary' : c.message });
    }
  });
}
