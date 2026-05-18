import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { insertProgramSchema, updateProgramSchema } from "@shared/schema";
import {
  classifyError,
  getUserIdFromRequest,
  userHasOrgAccess,
  getUserOrgIds,
  userHasAnyOrgAccess,
  getUserOrgRole,
  formatZodErrors,
} from "./helpers";
import { enforcePermission } from "../services/authorizationService";

export function registerProgramRoutes(app: Express) {
  // List programs (optionally by org)
  app.get('/api/programs', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      if (!await userHasAnyOrgAccess(userId)) return res.json([]);

      const requestedOrgId = req.query.organizationId ? Number(req.query.organizationId) : undefined;
      const accessibleOrgIds = await getUserOrgIds(userId);

      if (requestedOrgId && !accessibleOrgIds.includes(requestedOrgId)) {
        return res.json([]);
      }

      const programs = await storage.getPrograms(requestedOrgId);
      const filtered = programs.filter(p => accessibleOrgIds.includes(p.organizationId));
      res.json(filtered);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching programs' : c.message });
    }
  });

  // Get program by id
  app.get('/api/programs/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid program id' });

      const program = await storage.getProgram(id);
      if (!program) return res.status(404).json({ message: 'Program not found' });
      if (!await userHasOrgAccess(userId, program.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      res.json(program);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching program' : c.message });
    }
  });

  // Create program
  app.post('/api/programs', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const parsed = insertProgramSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      if (await enforcePermission(req, res, userId, parsed.data.organizationId, "program.manage")) return;
      const created = await storage.createProgram({ ...parsed.data, createdBy: userId } as any);
      res.status(201).json(created);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error creating program' : c.message });
    }
  });

  // Update program
  app.put('/api/programs/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid program id' });

      const existing = await storage.getProgram(id);
      if (!existing) return res.status(404).json({ message: 'Program not found' });
      if (await enforcePermission(req, res, userId, existing.organizationId, "program.manage")) return;

      const parsed = updateProgramSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      const updated = await storage.updateProgram(id, parsed.data);
      res.json(updated);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error updating program' : c.message });
    }
  });

  // Delete program (soft)
  app.delete('/api/programs/:id', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid program id' });

      const existing = await storage.getProgram(id);
      if (!existing) return res.status(404).json({ message: 'Program not found' });
      if (await enforcePermission(req, res, userId, existing.organizationId, "program.manage")) return;
      await storage.deleteProgram(id, userId);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error deleting program' : c.message });
    }
  });

  // List projects associated with a program
  app.get('/api/programs/:id/projects', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid program id' });

      const program = await storage.getProgram(id);
      if (!program) return res.status(404).json({ message: 'Program not found' });
      if (!await userHasOrgAccess(userId, program.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const projects = await storage.getProgramProjects(id);
      res.json(projects);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error fetching program projects' : c.message });
    }
  });

  // Replace the full set of projects associated with a program
  app.put('/api/programs/:id/projects', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid program id' });

      const program = await storage.getProgram(id);
      if (!program) return res.status(404).json({ message: 'Program not found' });
      if (!await userHasOrgAccess(userId, program.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const parsed = z.object({ projectIds: z.array(z.number().int()) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Validation failed', errors: formatZodErrors(parsed.error) });
      }
      await storage.setProgramProjects(id, parsed.data.projectIds);
      const projects = await storage.getProgramProjects(id);
      res.json(projects);
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error setting program projects' : c.message });
    }
  });

  // Add a single project to a program
  app.post('/api/programs/:id/projects/:projectId', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const id = Number(req.params.id);
      const projectId = Number(req.params.projectId);
      if (isNaN(id) || isNaN(projectId)) return res.status(400).json({ message: 'Invalid id' });

      const program = await storage.getProgram(id);
      if (!program) return res.status(404).json({ message: 'Program not found' });
      if (!await userHasOrgAccess(userId, program.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      await storage.addProjectToProgram(id, projectId);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error associating project' : c.message });
    }
  });

  // Remove a single project from a program
  app.delete('/api/programs/:id/projects/:projectId', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const id = Number(req.params.id);
      const projectId = Number(req.params.projectId);
      if (isNaN(id) || isNaN(projectId)) return res.status(400).json({ message: 'Invalid id' });

      const program = await storage.getProgram(id);
      if (!program) return res.status(404).json({ message: 'Program not found' });
      if (!await userHasOrgAccess(userId, program.organizationId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      await storage.removeProjectFromProgram(projectId);
      res.status(204).send();
    } catch (err) {
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Error removing project' : c.message });
    }
  });
}
