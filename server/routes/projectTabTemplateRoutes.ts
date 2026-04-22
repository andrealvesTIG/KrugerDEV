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
  createTemplate,
  createTemplateTab,
  updateTemplateTab,
  deleteTemplateTab,
  createTemplateSection,
  updateTemplateSection,
  deleteTemplateSection,
  createTemplateField,
  updateTemplateField,
  deleteTemplateField,
  getTemplateIdForTab,
  getTemplateIdForSection,
  getTemplateIdForField,
  propagateTemplateToAppliedOrgs,
} from "../storage/projectTabTemplateStorage";
import { VALID_FIELD_KEYS } from "../services/projectTabTemplateSeed";

async function authorizeTemplateEdit(userId: string, templateId: number): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const tmpl = await getTemplate(templateId);
  if (!tmpl) return { ok: false, status: 404, message: 'Template not found' };
  const user = await storage.getUser(userId);
  if (tmpl.scope === 'system') {
    if (!hasAdminAccess(user)) return { ok: false, status: 403, message: 'Super-admin required' };
  } else {
    if (!tmpl.organizationId || !await isOrgAdmin(userId, tmpl.organizationId)) {
      return { ok: false, status: 403, message: 'Organization admin required' };
    }
  }
  return { ok: true };
}

async function propagate(templateId: number, userId: string): Promise<void> {
  await propagateTemplateToAppliedOrgs({
    templateId,
    validFieldKeys: VALID_FIELD_KEYS,
    createdBy: userId,
  });
}

async function isOrgAdmin(userId: string | null | undefined, orgId: number): Promise<boolean> {
  if (!userId) return false;
  const user = await storage.getUser(userId);
  if (!user) return false;
  if (hasAdminAccess(user)) return true;
  // Org owners get full admin powers over their org's templates
  const org = await storage.getOrganization(orgId);
  if (org?.ownerId === userId) return true;
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
      const user = await storage.getUser(userId);
      // Browsing templates is an admin action — restrict to super-admin
      // (any context) or org-admin within the requested organization.
      if (organizationId == null) {
        if (!hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Super-admin access required to browse system templates' });
        }
      } else {
        if (!await userHasOrgAccess(userId, organizationId)) {
          return res.status(403).json({ message: 'Access denied to this organization' });
        }
        if (!await isOrgAdmin(userId, organizationId)) {
          return res.status(403).json({ message: 'Organization admin access required' });
        }
      }
      const templates = await listTemplatesForOrg(organizationId);
      // Non-super-admins only see published templates
      const visible = hasAdminAccess(user)
        ? templates
        : templates.filter(t => t.isPublished !== false);
      res.json(visible);
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
      const orgIdQuery = req.query.organizationId ? Number(req.query.organizationId) : undefined;
      const user = await storage.getUser(userId);
      if (full.template.scope === 'system') {
        // System templates: super-admin or org-admin (within any provided org)
        if (!hasAdminAccess(user)) {
          if (!orgIdQuery || !await isOrgAdmin(userId, orgIdQuery)) {
            return res.status(403).json({ message: 'Organization admin access required' });
          }
        }
        if (full.template.isPublished === false && !hasAdminAccess(user)) {
          return res.status(403).json({ message: 'Template is not currently published' });
        }
      } else if (full.template.organizationId) {
        // Org-scoped templates: must be org-admin in the owning org (or super-admin)
        if (!await isOrgAdmin(userId, full.template.organizationId)) {
          return res.status(403).json({ message: 'Organization admin access required' });
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
      // Non-super-admins cannot apply unpublished templates
      const actor = await storage.getUser(userId);
      if (template.isPublished === false && !hasAdminAccess(actor)) {
        return res.status(403).json({ message: 'Template is not currently published' });
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

  // Create a new (blank) template
  apiRoute(app, 'post', '/api/project-tab-templates', {
    tag: 'Project Tab Templates',
    summary: 'Create a new template',
    requestBody: body({
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        industry: { type: 'string' },
        icon: { type: 'string' },
        scope: { type: 'string', enum: ['system', 'org'] },
        organizationId: { type: 'integer' },
        isPublished: { type: 'boolean' },
      },
    }),
    responses: { ...r201('Template created', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const { name, description, industry, icon, scope, organizationId, isPublished } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'name required' });
      const resolvedScope: 'system' | 'org' = scope === 'org' ? 'org' : 'system';
      const user = await storage.getUser(userId);
      if (resolvedScope === 'system') {
        if (!hasAdminAccess(user)) return res.status(403).json({ message: 'Super-admin required to create system templates' });
      } else {
        if (!organizationId || !await isOrgAdmin(userId, Number(organizationId))) {
          return res.status(403).json({ message: 'Organization admin required' });
        }
      }
      const created = await createTemplate({
        name: name.trim(),
        description,
        industry,
        icon,
        scope: resolvedScope,
        organizationId: resolvedScope === 'org' ? Number(organizationId) : null,
        createdBy: userId,
        isPublished: typeof isPublished === 'boolean' ? isPublished : false,
      });
      res.status(201).json(created);
    } catch (err) {
      console.error('Error creating template:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to create template' : c.message });
    }
  });

  // ---------- Tabs ----------
  apiRoute(app, 'post', '/api/project-tab-templates/:id/tabs', {
    tag: 'Project Tab Templates',
    summary: 'Add a tab to a template',
    parameters: [pathId()],
    requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, icon: { type: 'string' } } }),
    responses: { ...r201('Tab created', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const templateId = Number(req.params.id);
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      const { name, description, icon } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'name required' });
      const created = await createTemplateTab(templateId, { name: name.trim(), description, icon });
      await propagate(templateId, userId);
      res.status(201).json(created);
    } catch (err) {
      console.error('Error creating template tab:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to create tab' : c.message });
    }
  });

  apiRoute(app, 'put', '/api/project-tab-templates/tabs/:tabId', {
    tag: 'Project Tab Templates',
    summary: 'Update a template tab',
    parameters: [pathId('tabId')],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r200('Tab updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const tabId = Number(req.params.tabId);
      const templateId = await getTemplateIdForTab(tabId);
      if (!templateId) return res.status(404).json({ message: 'Tab not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      const { name, description, icon, displayOrder } = req.body || {};
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (icon !== undefined) updates.icon = icon;
      if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);
      const updated = await updateTemplateTab(tabId, updates);
      await propagate(templateId, userId);
      res.json(updated);
    } catch (err) {
      console.error('Error updating template tab:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to update tab' : c.message });
    }
  });

  apiRoute(app, 'delete', '/api/project-tab-templates/tabs/:tabId', {
    tag: 'Project Tab Templates',
    summary: 'Delete a template tab',
    parameters: [pathId('tabId')],
    responses: { ...r204('Tab deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const tabId = Number(req.params.tabId);
      const templateId = await getTemplateIdForTab(tabId);
      if (!templateId) return res.status(404).json({ message: 'Tab not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      await deleteTemplateTab(tabId);
      await propagate(templateId, userId);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting template tab:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to delete tab' : c.message });
    }
  });

  // ---------- Sections ----------
  apiRoute(app, 'post', '/api/project-tab-templates/tabs/:tabId/sections', {
    tag: 'Project Tab Templates',
    summary: 'Add a section to a template tab',
    parameters: [pathId('tabId')],
    requestBody: body({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, columns: { type: 'integer' } } }),
    responses: { ...r201('Section created', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const tabId = Number(req.params.tabId);
      const templateId = await getTemplateIdForTab(tabId);
      if (!templateId) return res.status(404).json({ message: 'Tab not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      const { name, description, columns } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'name required' });
      const created = await createTemplateSection(tabId, { name: name.trim(), description, columns: columns ? Number(columns) : undefined });
      await propagate(templateId, userId);
      res.status(201).json(created);
    } catch (err) {
      console.error('Error creating template section:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to create section' : c.message });
    }
  });

  apiRoute(app, 'put', '/api/project-tab-templates/sections/:sectionId', {
    tag: 'Project Tab Templates',
    summary: 'Update a template section',
    parameters: [pathId('sectionId')],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r200('Section updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const sectionId = Number(req.params.sectionId);
      const templateId = await getTemplateIdForSection(sectionId);
      if (!templateId) return res.status(404).json({ message: 'Section not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      const { name, description, columns, displayOrder } = req.body || {};
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (columns !== undefined) updates.columns = Number(columns);
      if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);
      const updated = await updateTemplateSection(sectionId, updates);
      await propagate(templateId, userId);
      res.json(updated);
    } catch (err) {
      console.error('Error updating template section:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to update section' : c.message });
    }
  });

  apiRoute(app, 'delete', '/api/project-tab-templates/sections/:sectionId', {
    tag: 'Project Tab Templates',
    summary: 'Delete a template section',
    parameters: [pathId('sectionId')],
    responses: { ...r204('Section deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const sectionId = Number(req.params.sectionId);
      const templateId = await getTemplateIdForSection(sectionId);
      if (!templateId) return res.status(404).json({ message: 'Section not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      await deleteTemplateSection(sectionId);
      await propagate(templateId, userId);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting template section:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to delete section' : c.message });
    }
  });

  // ---------- Fields ----------
  apiRoute(app, 'post', '/api/project-tab-templates/sections/:sectionId/fields', {
    tag: 'Project Tab Templates',
    summary: 'Add a field to a template section',
    parameters: [pathId('sectionId')],
    requestBody: body({ type: 'object', required: ['fieldKey'], properties: { fieldKey: { type: 'string' }, fieldType: { type: 'string' }, label: { type: 'string' }, span: { type: 'integer' }, isRequired: { type: 'boolean' } } }),
    responses: { ...r201('Field created', { type: 'object' }), ...createRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const sectionId = Number(req.params.sectionId);
      const templateId = await getTemplateIdForSection(sectionId);
      if (!templateId) return res.status(404).json({ message: 'Section not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      const { fieldKey, fieldType, label, span, isRequired } = req.body || {};
      if (!fieldKey || typeof fieldKey !== 'string' || !fieldKey.trim()) return res.status(400).json({ message: 'fieldKey required' });
      const created = await createTemplateField(sectionId, {
        fieldKey: fieldKey.trim(),
        fieldType,
        label,
        span: span ? Number(span) : undefined,
        isRequired: typeof isRequired === 'boolean' ? isRequired : undefined,
      });
      await propagate(templateId, userId);
      res.status(201).json(created);
    } catch (err) {
      console.error('Error creating template field:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to create field' : c.message });
    }
  });

  apiRoute(app, 'put', '/api/project-tab-templates/fields/:fieldId', {
    tag: 'Project Tab Templates',
    summary: 'Update a template field',
    parameters: [pathId('fieldId')],
    requestBody: body({ type: 'object' }, false),
    responses: { ...r200('Field updated', { type: 'object' }), ...updateRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const fieldId = Number(req.params.fieldId);
      const templateId = await getTemplateIdForField(fieldId);
      if (!templateId) return res.status(404).json({ message: 'Field not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      const { fieldKey, fieldType, label, span, isRequired, displayOrder } = req.body || {};
      const updates: Record<string, unknown> = {};
      if (fieldKey !== undefined) updates.fieldKey = fieldKey;
      if (fieldType !== undefined) updates.fieldType = fieldType;
      if (label !== undefined) updates.label = label;
      if (span !== undefined) updates.span = Number(span);
      if (isRequired !== undefined) updates.isRequired = !!isRequired;
      if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);
      const updated = await updateTemplateField(fieldId, updates);
      await propagate(templateId, userId);
      res.json(updated);
    } catch (err) {
      console.error('Error updating template field:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to update field' : c.message });
    }
  });

  apiRoute(app, 'delete', '/api/project-tab-templates/fields/:fieldId', {
    tag: 'Project Tab Templates',
    summary: 'Delete a template field',
    parameters: [pathId('fieldId')],
    responses: { ...r204('Field deleted'), ...fullRes },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const fieldId = Number(req.params.fieldId);
      const templateId = await getTemplateIdForField(fieldId);
      if (!templateId) return res.status(404).json({ message: 'Field not found' });
      const auth = await authorizeTemplateEdit(userId, templateId);
      if (!auth.ok) return res.status(auth.status).json({ message: auth.message });
      await deleteTemplateField(fieldId);
      await propagate(templateId, userId);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting template field:', err);
      const c = classifyError(err);
      res.status(c.status).json({ message: c.status === 500 ? 'Failed to delete field' : c.message });
    }
  });
}
