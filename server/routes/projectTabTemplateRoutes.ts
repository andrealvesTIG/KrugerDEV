import type { Express } from "express";
import { storage } from "../storage";
import {
  classifyError,
  getUserIdFromRequest,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgRole,
} from "./helpers";
import {
  apiRoute, pathId, body, qInt, qStr, r200, r201, r204,
  authRes, fullRes, inputRes, createRes, updateRes, idRes,
} from "../route-registry";
import {
  listTemplatesForOrg,
  listSystemTemplates,
  getTemplate,
  getFullTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplateToOrganization,
  upsertTemplateBlueprint,
  saveOrgTabsAsTemplate,
} from "../storage/projectTabTemplateStorage";
import { VALID_FIELD_KEYS } from "../services/projectTabTemplateSeed";

async function isOrgAdmin(userId: string | null | undefined, orgId: number): Promise<boolean> {
  if (!userId) return false;
  const user = await storage.getUser(userId);
  if (!user) return false;
  if (hasAdminAccess(user)) return true;
  const role = await getUserOrgRole(userId, orgId);
  return role === 'org_admin';
}

export function registerProjectTabTemplateRoutes(app: Express) {
  // List templates available to an organization (system + org-scoped)
  apiRoute(app, 'get', '/api/project-tab-templates', {
    tag: 'Project Tab Templates',
    summary: 'List project tab templates',
    parameters: [qInt('organizationId', false, 'Organization ID for org-scoped templates')],
    responses: { ...r200('Templates list', { type: 'array', items: { type: 'object' } }), ...authRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const organizationId = req.query.organizationId ? Number(req.query.organizationId) : null;
      if (organizationId != null) {
        if (!await userHasOrgAccess(userId, organizationId)) {
          return res.status(403).json({ message: 'Access denied to this organization' });
        }
      }
      const templates = await listTemplatesForOrg(organizationId);
      res.json(templates);
    } catch (err) {
      console.error('Error listing project tab templates:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to list templates' : c.message });
    }
  });

  // Get a single template (with full nested structure)
  apiRoute(app, 'get', '/api/project-tab-templates/:id/full', {
    tag: 'Project Tab Templates',
    summary: 'Get template with tabs/sections/fields',
    parameters: [pathId()],
    responses: { ...r200('Full template', { type: 'object' }), ...idRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const full = await getFullTemplate(id);
      if (!full) return res.status(404).json({ message: 'Template not found' });
      // Org-scoped templates require org access
      if (full.template.scope === 'org' && full.template.organizationId) {
        if (!await userHasOrgAccess(userId, full.template.organizationId)) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
      res.json(full);
    } catch (err) {
      console.error('Error fetching template:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to fetch template' : c.message });
    }
  });

  // Apply a template to an organization (append or replace)
  apiRoute(app, 'post', '/api/project-tab-templates/:id/apply', {
    tag: 'Project Tab Templates',
    summary: 'Apply a template to an organization',
    parameters: [pathId()],
    requestBody: body({
      type: 'object',
      required: ['organizationId'],
      properties: {
        organizationId: { type: 'integer' },
        mode: { type: 'string', enum: ['append', 'replace'] },
      },
    }),
    responses: { ...r200('Apply result', { type: 'object' }), ...inputRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const { organizationId, mode } = req.body || {};
      if (!organizationId) return res.status(400).json({ message: 'organizationId required' });
      if (!await isOrgAdmin(userId, organizationId)) {
        return res.status(403).json({ message: 'Organization admin access required' });
      }
      const template = await getTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      // Org-scoped templates can only be applied to their owning org
      if (template.scope === 'org' && template.organizationId !== organizationId) {
        return res.status(403).json({ message: 'Template is not available to this organization' });
      }
      const result = await applyTemplateToOrganization({
        templateId: id,
        organizationId,
        mode: mode === 'replace' ? 'replace' : 'append',
        createdBy: userId,
        validFieldKeys: VALID_FIELD_KEYS,
      });
      res.json(result);
    } catch (err) {
      console.error('Error applying template:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to apply template' : c.message });
    }
  });

  // Save the org's current custom tabs as a new template
  apiRoute(app, 'post', '/api/organizations/:id/save-tabs-as-template', {
    tag: 'Project Tab Templates',
    summary: 'Snapshot org custom tabs into a new template',
    parameters: [pathId()],
    requestBody: body({
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        industry: { type: 'string' },
        scope: { type: 'string', enum: ['system', 'org'] },
      },
    }),
    responses: { ...r201('Template created', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const orgId = Number(req.params.id);
      if (!await isOrgAdmin(userId, orgId)) {
        return res.status(403).json({ message: 'Organization admin access required' });
      }
      const { name, description, industry, scope } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'name required' });
      }
      let resolvedScope: 'system' | 'org' = scope === 'system' ? 'system' : 'org';
      if (resolvedScope === 'system') {
        const user = await storage.getUser(userId);
        if (!hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Only super-admins can create system templates' });
        }
      }
      const template = await saveOrgTabsAsTemplate({
        organizationId: orgId,
        name: name.trim(),
        description,
        industry,
        scope: resolvedScope,
        createdBy: userId,
      });
      res.status(201).json(template);
    } catch (err: any) {
      if (err?.message === 'No active custom tabs to snapshot') {
        return res.status(400).json({ message: err.message });
      }
      console.error('Error saving org tabs as template:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to save template' : c.message });
    }
  });

  // Update template metadata (super-admin for system; org-admin for org-scoped)
  apiRoute(app, 'put', '/api/project-tab-templates/:id', {
    tag: 'Project Tab Templates',
    summary: 'Update template metadata',
    parameters: [pathId()],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r200('Template updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await getTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      const user = await storage.getUser(userId);
      if (template.scope === 'system') {
        if (!hasAdminAccess(user)) return res.status(403).json({ message: 'Super-admin required' });
      } else {
        if (!template.organizationId || !await isOrgAdmin(userId, template.organizationId)) {
          return res.status(403).json({ message: 'Organization admin required' });
        }
      }
      const { name, description, industry, icon, isPublished } = req.body || {};
      const safe: Record<string, any> = {};
      if (name !== undefined) safe.name = name;
      if (description !== undefined) safe.description = description;
      if (industry !== undefined) safe.industry = industry;
      if (icon !== undefined) safe.icon = icon;
      if (isPublished !== undefined) safe.isPublished = isPublished;
      const updated = await updateTemplate(id, safe);
      res.json(updated);
    } catch (err) {
      console.error('Error updating template:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to update template' : c.message });
    }
  });

  // Delete a template
  apiRoute(app, 'delete', '/api/project-tab-templates/:id', {
    tag: 'Project Tab Templates',
    summary: 'Delete a template',
    parameters: [pathId()],
    responses: { ...r204('Template deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const id = Number(req.params.id);
      const template = await getTemplate(id);
      if (!template) return res.status(404).json({ message: 'Template not found' });
      const user = await storage.getUser(userId);
      if (template.scope === 'system') {
        if (!hasAdminAccess(user)) return res.status(403).json({ message: 'Super-admin required' });
      } else {
        if (!template.organizationId || !await isOrgAdmin(userId, template.organizationId)) {
          return res.status(403).json({ message: 'Organization admin required' });
        }
      }
      await deleteTemplate(id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting template:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to delete template' : c.message });
    }
  });
}
