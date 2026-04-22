import { db } from "../db";
import {
  projectTabTemplates,
  projectTabTemplateTabs,
  projectTabTemplateSections,
  projectTabTemplateFields,
  organizationAppliedTemplates,
  customProjectTabs,
  customTabSections,
  customTabFields,
  organizations,
  type ProjectTabTemplate,
  type InsertProjectTabTemplate,
  type ProjectTabTemplateTab,
  type ProjectTabTemplateSection,
  type ProjectTabTemplateField,
} from "@shared/schema";
import { eq, and, or, asc, isNull, sql } from "drizzle-orm";

export type FullTemplate = {
  template: ProjectTabTemplate;
  tabs: (ProjectTabTemplateTab & {
    sections: (ProjectTabTemplateSection & { fields: ProjectTabTemplateField[] })[];
  })[];
};

export type ApplyResult = {
  tabsCreated: number;
  fieldsSkipped: number;
  skippedFieldKeys: string[];
};

export async function listTemplatesForOrg(organizationId: number | null, industry?: string | null): Promise<ProjectTabTemplate[]> {
  const industryFilter = industry && industry !== 'all'
    ? eq(projectTabTemplates.industry, industry)
    : undefined;
  if (organizationId == null) {
    const where = industryFilter
      ? and(eq(projectTabTemplates.scope, 'system'), industryFilter)
      : eq(projectTabTemplates.scope, 'system');
    return await db.select().from(projectTabTemplates)
      .where(where)
      .orderBy(asc(projectTabTemplates.name));
  }
  const scopeWhere = or(
    eq(projectTabTemplates.scope, 'system'),
    and(eq(projectTabTemplates.scope, 'org'), eq(projectTabTemplates.organizationId, organizationId))
  );
  const where = industryFilter ? and(scopeWhere, industryFilter) : scopeWhere;
  return await db.select().from(projectTabTemplates)
    .where(where)
    .orderBy(asc(projectTabTemplates.scope), asc(projectTabTemplates.name));
}

export async function listSystemTemplates(): Promise<ProjectTabTemplate[]> {
  return await db.select().from(projectTabTemplates)
    .where(eq(projectTabTemplates.scope, 'system'))
    .orderBy(asc(projectTabTemplates.name));
}

export async function getTemplate(id: number): Promise<ProjectTabTemplate | undefined> {
  const [t] = await db.select().from(projectTabTemplates).where(eq(projectTabTemplates.id, id));
  return t;
}

export async function getTemplateBySlug(slug: string): Promise<ProjectTabTemplate | undefined> {
  const [t] = await db.select().from(projectTabTemplates).where(eq(projectTabTemplates.slug, slug));
  return t;
}

export async function getFullTemplate(id: number): Promise<FullTemplate | undefined> {
  const template = await getTemplate(id);
  if (!template) return undefined;
  const tabs = await db.select().from(projectTabTemplateTabs)
    .where(eq(projectTabTemplateTabs.templateId, id))
    .orderBy(asc(projectTabTemplateTabs.displayOrder));
  const fullTabs = await Promise.all(tabs.map(async (tab) => {
    const sections = await db.select().from(projectTabTemplateSections)
      .where(eq(projectTabTemplateSections.templateTabId, tab.id))
      .orderBy(asc(projectTabTemplateSections.displayOrder));
    const sectionsWithFields = await Promise.all(sections.map(async (s) => {
      const fields = await db.select().from(projectTabTemplateFields)
        .where(eq(projectTabTemplateFields.templateSectionId, s.id))
        .orderBy(asc(projectTabTemplateFields.displayOrder));
      return { ...s, fields };
    }));
    return { ...tab, sections: sectionsWithFields };
  }));
  return { template, tabs: fullTabs };
}

export async function deleteTemplate(id: number): Promise<void> {
  await db.delete(projectTabTemplates).where(eq(projectTabTemplates.id, id));
}

export async function updateTemplate(id: number, updates: Partial<InsertProjectTabTemplate>): Promise<ProjectTabTemplate> {
  const [updated] = await db.update(projectTabTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectTabTemplates.id, id))
    .returning();
  return updated;
}

export type TemplateBlueprint = {
  slug: string;
  name: string;
  description?: string;
  industry?: string;
  icon?: string;
  scope?: 'system' | 'org';
  organizationId?: number | null;
  createdBy?: string | null;
  tabs: Array<{
    name: string;
    description?: string;
    icon?: string;
    sections: Array<{
      name: string;
      description?: string;
      columns?: number;
      fields: Array<{ fieldKey: string; fieldType?: string; label?: string; span?: number; isRequired?: boolean }>;
    }>;
  }>;
};

/**
 * Idempotent upsert of a template by slug. Replaces nested tabs/sections/fields
 * each time so the seed can evolve safely.
 */
export async function upsertTemplateBlueprint(blueprint: TemplateBlueprint): Promise<ProjectTabTemplate> {
  return await db.transaction(async (tx) => {
    const existing = await tx.select().from(projectTabTemplates)
      .where(eq(projectTabTemplates.slug, blueprint.slug));
    let template: ProjectTabTemplate;
    if (existing.length > 0) {
      // Refresh metadata only — DO NOT wipe the nested structure on existing
      // templates. Once seeded, admins may have edited the layout (or future
      // versions of the seeder may regress fields), so we preserve it. To
      // intentionally re-seed structure, delete the template first.
      const [updated] = await tx.update(projectTabTemplates)
        .set({
          name: blueprint.name,
          description: blueprint.description,
          industry: blueprint.industry,
          icon: blueprint.icon,
          updatedAt: new Date(),
        })
        .where(eq(projectTabTemplates.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await tx.insert(projectTabTemplates).values({
        slug: blueprint.slug,
        name: blueprint.name,
        description: blueprint.description,
        industry: blueprint.industry,
        icon: blueprint.icon,
        scope: blueprint.scope ?? 'system',
        organizationId: blueprint.organizationId ?? null,
        createdBy: blueprint.createdBy ?? null,
      }).returning();
      template = created;
    }

    for (let ti = 0; ti < blueprint.tabs.length; ti++) {
      const tab = blueprint.tabs[ti];
      const [createdTab] = await tx.insert(projectTabTemplateTabs).values({
        templateId: template.id,
        name: tab.name,
        description: tab.description,
        icon: tab.icon,
        displayOrder: ti,
      }).returning();
      for (let si = 0; si < tab.sections.length; si++) {
        const section = tab.sections[si];
        const [createdSection] = await tx.insert(projectTabTemplateSections).values({
          templateTabId: createdTab.id,
          name: section.name,
          description: section.description,
          columns: section.columns ?? 2,
          displayOrder: si,
        }).returning();
        for (let fi = 0; fi < section.fields.length; fi++) {
          const f = section.fields[fi];
          await tx.insert(projectTabTemplateFields).values({
            templateSectionId: createdSection.id,
            fieldKey: f.fieldKey,
            fieldType: f.fieldType ?? 'text',
            label: f.label,
            displayOrder: fi,
            span: f.span ?? 1,
            isRequired: f.isRequired ?? false,
          });
        }
      }
    }
    return template;
  });
}

/**
 * Apply a template to an organization. Templates are pure layout snapshots —
 * applying them never mutates project data. Mode 'append' (default) preserves
 * existing custom tabs; 'replace' soft-deletes existing custom tabs first.
 *
 * Returns counts of newly created tabs and skipped fields (e.g. references to
 * field keys that no longer exist in PROJECT_FIELD_DEFINITIONS).
 */
export async function applyTemplateToOrganization(opts: {
  templateId: number;
  organizationId: number;
  mode?: 'append' | 'replace';
  createdBy?: string | null;
  validFieldKeys?: Set<string>;
  // When true, set organizations.defaultTemplateAppliedAt within the same
  // transaction as the apply so the two writes are atomic. Used by backfill
  // and new-org auto-apply to guarantee idempotency under crashes/restarts.
  markDefaultApplied?: boolean;
  // Skip the apply (and mark) entirely if the org already has a non-null
  // defaultTemplateAppliedAt. Returns zero counts in that case.
  skipIfDefaultAlreadyApplied?: boolean;
}): Promise<ApplyResult> {
  const mode = opts.mode ?? 'append';
  const full = await getFullTemplate(opts.templateId);
  if (!full) throw new Error('Template not found');

  return await db.transaction(async (tx) => {
    if (opts.skipIfDefaultAlreadyApplied) {
      const [orgRow] = await tx.select({ marker: organizations.defaultTemplateAppliedAt })
        .from(organizations).where(eq(organizations.id, opts.organizationId));
      if (orgRow?.marker) {
        return { tabsCreated: 0, fieldsSkipped: 0, skippedFieldKeys: [] };
      }
    }
    let tabsCreated = 0;
    let fieldsSkipped = 0;
    const skippedFieldKeys: string[] = [];

    if (mode === 'replace') {
      const existingTabs = await tx.select().from(customProjectTabs)
        .where(and(
          eq(customProjectTabs.organizationId, opts.organizationId),
          eq(customProjectTabs.isActive, true),
        ));
      for (const t of existingTabs) {
        await tx.update(customProjectTabs)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(customProjectTabs.id, t.id));
      }
    }

    // Find max displayOrder so appended tabs sit at the end
    const [{ max }] = await tx.select({
      max: sql<number>`coalesce(max(${customProjectTabs.displayOrder}), -1)::int`,
    }).from(customProjectTabs).where(eq(customProjectTabs.organizationId, opts.organizationId));
    let nextOrder = (max ?? -1) + 1;

    for (const tab of full.tabs) {
      const [createdTab] = await tx.insert(customProjectTabs).values({
        organizationId: opts.organizationId,
        name: tab.name,
        description: tab.description ?? null,
        icon: tab.icon ?? null,
        displayOrder: nextOrder++,
        isActive: true,
        sourceTemplateId: opts.templateId,
        createdBy: opts.createdBy ?? null,
      }).returning();
      tabsCreated++;

      for (const section of tab.sections) {
        const [createdSection] = await tx.insert(customTabSections).values({
          tabId: createdTab.id,
          name: section.name,
          description: section.description ?? null,
          columns: section.columns ?? 2,
          displayOrder: section.displayOrder ?? 0,
          isCollapsible: section.isCollapsible ?? true,
          isCollapsedByDefault: section.isCollapsedByDefault ?? false,
        }).returning();

        for (const field of section.fields) {
          if (opts.validFieldKeys && !field.fieldKey.startsWith('customField:') && !opts.validFieldKeys.has(field.fieldKey)) {
            fieldsSkipped++;
            skippedFieldKeys.push(field.fieldKey);
            continue;
          }
          await tx.insert(customTabFields).values({
            sectionId: createdSection.id,
            fieldKey: field.fieldKey,
            fieldType: field.fieldType,
            label: field.label ?? null,
            displayOrder: field.displayOrder ?? 0,
            span: field.span ?? 1,
            isRequired: field.isRequired ?? false,
          });
        }
      }
    }

    if (opts.markDefaultApplied) {
      await tx.update(organizations)
        .set({ defaultTemplateAppliedAt: new Date() })
        .where(eq(organizations.id, opts.organizationId));
    }

    // Track that this org has applied this template (for auto-propagation
    // when the template structure is later edited).
    await tx.insert(organizationAppliedTemplates).values({
      organizationId: opts.organizationId,
      templateId: opts.templateId,
      appliedAt: new Date(),
    }).onConflictDoUpdate({
      target: [organizationAppliedTemplates.organizationId, organizationAppliedTemplates.templateId],
      set: { appliedAt: new Date() },
    });

    return { tabsCreated, fieldsSkipped, skippedFieldKeys };
  });
}

/**
 * Snapshot an organization's current custom tabs into a new template.
 */
export async function saveOrgTabsAsTemplate(opts: {
  organizationId: number;
  name: string;
  description?: string;
  industry?: string;
  scope: 'system' | 'org';
  createdBy: string;
}): Promise<ProjectTabTemplate> {
  const tabs = await db.select().from(customProjectTabs)
    .where(and(
      eq(customProjectTabs.organizationId, opts.organizationId),
      eq(customProjectTabs.isActive, true),
    ))
    .orderBy(asc(customProjectTabs.displayOrder));

  if (tabs.length === 0) {
    throw new Error('No active custom tabs to snapshot');
  }

  const blueprintTabs: TemplateBlueprint['tabs'] = [];
  for (const t of tabs) {
    const sections = await db.select().from(customTabSections)
      .where(eq(customTabSections.tabId, t.id))
      .orderBy(asc(customTabSections.displayOrder));
    const sectionsOut: TemplateBlueprint['tabs'][number]['sections'] = [];
    for (const s of sections) {
      const fields = await db.select().from(customTabFields)
        .where(eq(customTabFields.sectionId, s.id))
        .orderBy(asc(customTabFields.displayOrder));
      sectionsOut.push({
        name: s.name,
        description: s.description ?? undefined,
        columns: s.columns ?? 2,
        fields: fields.map(f => ({
          fieldKey: f.fieldKey,
          fieldType: f.fieldType,
          label: f.label ?? undefined,
          span: f.span ?? 1,
          isRequired: f.isRequired ?? false,
        })),
      });
    }
    blueprintTabs.push({
      name: t.name,
      description: t.description ?? undefined,
      icon: t.icon ?? undefined,
      sections: sectionsOut,
    });
  }

  // Always create a fresh, non-colliding slug for user-saved snapshots so we
  // never accidentally overwrite a seeded system template or another user's
  // saved template via slug-upsert.
  const slugBase = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
  const slugSeed = opts.scope === 'system'
    ? `system-${slugBase}-${Date.now()}`
    : `org-${opts.organizationId}-${slugBase}-${Date.now()}`;
  let slug = slugSeed;
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.select({ id: projectTabTemplates.id }).from(projectTabTemplates).where(eq(projectTabTemplates.slug, slug));
    if (existing.length === 0) break;
    suffix++;
    slug = `${slugSeed}-${suffix}`;
  }

  return await upsertTemplateBlueprint({
    slug,
    name: opts.name,
    description: opts.description,
    industry: opts.industry,
    scope: opts.scope,
    organizationId: opts.scope === 'org' ? opts.organizationId : null,
    createdBy: opts.createdBy,
    tabs: blueprintTabs,
  });
}

// ---------- Structural CRUD (super admin / template-owner builder) ----------

export type CreateTemplateInput = {
  name: string;
  description?: string;
  industry?: string;
  icon?: string;
  scope: 'system' | 'org';
  organizationId?: number | null;
  createdBy: string;
  isPublished?: boolean;
};

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
}

export async function createTemplate(input: CreateTemplateInput): Promise<ProjectTabTemplate> {
  const base = slugify(input.name);
  const slugSeed = input.scope === 'system'
    ? `system-${base}-${Date.now()}`
    : `org-${input.organizationId ?? 0}-${base}-${Date.now()}`;
  let slug = slugSeed;
  let suffix = 0;
  while (true) {
    const existing = await db.select({ id: projectTabTemplates.id }).from(projectTabTemplates).where(eq(projectTabTemplates.slug, slug));
    if (existing.length === 0) break;
    suffix++;
    slug = `${slugSeed}-${suffix}`;
  }
  const [created] = await db.insert(projectTabTemplates).values({
    slug,
    name: input.name,
    description: input.description,
    industry: input.industry,
    icon: input.icon,
    scope: input.scope,
    organizationId: input.scope === 'org' ? input.organizationId ?? null : null,
    createdBy: input.createdBy,
    isPublished: input.isPublished ?? false,
  }).returning();
  return created;
}

export async function createTemplateTab(templateId: number, data: { name: string; description?: string; icon?: string }): Promise<ProjectTabTemplateTab> {
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${projectTabTemplateTabs.displayOrder}), -1)::int` })
    .from(projectTabTemplateTabs).where(eq(projectTabTemplateTabs.templateId, templateId));
  const [created] = await db.insert(projectTabTemplateTabs).values({
    templateId,
    name: data.name,
    description: data.description,
    icon: data.icon,
    displayOrder: (max ?? -1) + 1,
  }).returning();
  return created;
}

export async function updateTemplateTab(tabId: number, updates: Partial<{ name: string; description: string | null; icon: string | null; displayOrder: number }>): Promise<ProjectTabTemplateTab> {
  const [updated] = await db.update(projectTabTemplateTabs)
    .set(updates)
    .where(eq(projectTabTemplateTabs.id, tabId))
    .returning();
  return updated;
}

export async function deleteTemplateTab(tabId: number): Promise<void> {
  await db.delete(projectTabTemplateTabs).where(eq(projectTabTemplateTabs.id, tabId));
}

export async function getTemplateTab(tabId: number): Promise<ProjectTabTemplateTab | undefined> {
  const [t] = await db.select().from(projectTabTemplateTabs).where(eq(projectTabTemplateTabs.id, tabId));
  return t;
}

export async function createTemplateSection(tabId: number, data: { name: string; description?: string; columns?: number }): Promise<ProjectTabTemplateSection> {
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${projectTabTemplateSections.displayOrder}), -1)::int` })
    .from(projectTabTemplateSections).where(eq(projectTabTemplateSections.templateTabId, tabId));
  const [created] = await db.insert(projectTabTemplateSections).values({
    templateTabId: tabId,
    name: data.name,
    description: data.description,
    columns: data.columns ?? 2,
    displayOrder: (max ?? -1) + 1,
  }).returning();
  return created;
}

export async function updateTemplateSection(sectionId: number, updates: Partial<{ name: string; description: string | null; columns: number; displayOrder: number }>): Promise<ProjectTabTemplateSection> {
  const [updated] = await db.update(projectTabTemplateSections)
    .set(updates)
    .where(eq(projectTabTemplateSections.id, sectionId))
    .returning();
  return updated;
}

export async function deleteTemplateSection(sectionId: number): Promise<void> {
  await db.delete(projectTabTemplateSections).where(eq(projectTabTemplateSections.id, sectionId));
}

export async function getTemplateSection(sectionId: number): Promise<ProjectTabTemplateSection | undefined> {
  const [s] = await db.select().from(projectTabTemplateSections).where(eq(projectTabTemplateSections.id, sectionId));
  return s;
}

export async function createTemplateField(sectionId: number, data: { fieldKey: string; fieldType?: string; label?: string; span?: number; isRequired?: boolean }): Promise<ProjectTabTemplateField> {
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${projectTabTemplateFields.displayOrder}), -1)::int` })
    .from(projectTabTemplateFields).where(eq(projectTabTemplateFields.templateSectionId, sectionId));
  const [created] = await db.insert(projectTabTemplateFields).values({
    templateSectionId: sectionId,
    fieldKey: data.fieldKey,
    fieldType: data.fieldType ?? 'text',
    label: data.label,
    displayOrder: (max ?? -1) + 1,
    span: data.span ?? 1,
    isRequired: data.isRequired ?? false,
  }).returning();
  return created;
}

export async function updateTemplateField(fieldId: number, updates: Partial<{ fieldKey: string; fieldType: string; label: string | null; span: number; isRequired: boolean; displayOrder: number }>): Promise<ProjectTabTemplateField> {
  const [updated] = await db.update(projectTabTemplateFields)
    .set(updates)
    .where(eq(projectTabTemplateFields.id, fieldId))
    .returning();
  return updated;
}

export async function deleteTemplateField(fieldId: number): Promise<void> {
  await db.delete(projectTabTemplateFields).where(eq(projectTabTemplateFields.id, fieldId));
}

export async function getTemplateField(fieldId: number): Promise<ProjectTabTemplateField | undefined> {
  const [f] = await db.select().from(projectTabTemplateFields).where(eq(projectTabTemplateFields.id, fieldId));
  return f;
}

export async function getTemplateIdForTab(tabId: number): Promise<number | undefined> {
  const [row] = await db.select({ templateId: projectTabTemplateTabs.templateId })
    .from(projectTabTemplateTabs).where(eq(projectTabTemplateTabs.id, tabId));
  return row?.templateId;
}

export async function getTemplateIdForSection(sectionId: number): Promise<number | undefined> {
  const [row] = await db.select({ templateId: projectTabTemplateTabs.templateId })
    .from(projectTabTemplateSections)
    .innerJoin(projectTabTemplateTabs, eq(projectTabTemplateSections.templateTabId, projectTabTemplateTabs.id))
    .where(eq(projectTabTemplateSections.id, sectionId));
  return row?.templateId;
}

export async function getTemplateIdForField(fieldId: number): Promise<number | undefined> {
  const [row] = await db.select({ templateId: projectTabTemplateTabs.templateId })
    .from(projectTabTemplateFields)
    .innerJoin(projectTabTemplateSections, eq(projectTabTemplateFields.templateSectionId, projectTabTemplateSections.id))
    .innerJoin(projectTabTemplateTabs, eq(projectTabTemplateSections.templateTabId, projectTabTemplateTabs.id))
    .where(eq(projectTabTemplateFields.id, fieldId));
  return row?.templateId;
}

// ---------- Propagation to organizations that previously applied a template ----------

export async function listAppliedOrganizations(templateId: number): Promise<number[]> {
  const rows = await db.select({ organizationId: organizationAppliedTemplates.organizationId })
    .from(organizationAppliedTemplates)
    .where(eq(organizationAppliedTemplates.templateId, templateId));
  return rows.map(r => r.organizationId);
}

/**
 * Re-applies the current structure of a template to every organization that
 * previously applied it. Only tabs created from THIS template (matched via
 * sourceTemplateId) are removed and recreated; unrelated custom tabs are left
 * intact. Returns per-org counts.
 */
export async function propagateTemplateToAppliedOrgs(opts: {
  templateId: number;
  validFieldKeys?: Set<string>;
  createdBy?: string | null;
}): Promise<{ organizationsUpdated: number; tabsCreated: number; fieldsSkipped: number }> {
  const orgIds = await listAppliedOrganizations(opts.templateId);
  if (orgIds.length === 0) return { organizationsUpdated: 0, tabsCreated: 0, fieldsSkipped: 0 };
  const full = await getFullTemplate(opts.templateId);
  if (!full) return { organizationsUpdated: 0, tabsCreated: 0, fieldsSkipped: 0 };

  let tabsCreated = 0;
  let fieldsSkipped = 0;

  for (const orgId of orgIds) {
    await db.transaction(async (tx) => {
      // Soft-delete tabs sourced from this template
      const existing = await tx.select().from(customProjectTabs)
        .where(and(
          eq(customProjectTabs.organizationId, orgId),
          eq(customProjectTabs.sourceTemplateId, opts.templateId),
          eq(customProjectTabs.isActive, true),
        ));
      for (const t of existing) {
        await tx.update(customProjectTabs)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(customProjectTabs.id, t.id));
      }
      const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${customProjectTabs.displayOrder}), -1)::int` })
        .from(customProjectTabs).where(eq(customProjectTabs.organizationId, orgId));
      let nextOrder = (max ?? -1) + 1;
      for (const tab of full.tabs) {
        const [createdTab] = await tx.insert(customProjectTabs).values({
          organizationId: orgId,
          name: tab.name,
          description: tab.description ?? null,
          icon: tab.icon ?? null,
          displayOrder: nextOrder++,
          isActive: true,
          sourceTemplateId: opts.templateId,
          createdBy: opts.createdBy ?? null,
        }).returning();
        tabsCreated++;
        for (const section of tab.sections) {
          const [createdSection] = await tx.insert(customTabSections).values({
            tabId: createdTab.id,
            name: section.name,
            description: section.description ?? null,
            columns: section.columns ?? 2,
            displayOrder: section.displayOrder ?? 0,
            isCollapsible: section.isCollapsible ?? true,
            isCollapsedByDefault: section.isCollapsedByDefault ?? false,
          }).returning();
          for (const field of section.fields) {
            if (opts.validFieldKeys && !field.fieldKey.startsWith('customField:') && !opts.validFieldKeys.has(field.fieldKey)) {
              fieldsSkipped++;
              continue;
            }
            await tx.insert(customTabFields).values({
              sectionId: createdSection.id,
              fieldKey: field.fieldKey,
              fieldType: field.fieldType,
              label: field.label ?? null,
              displayOrder: field.displayOrder ?? 0,
              span: field.span ?? 1,
              isRequired: field.isRequired ?? false,
            });
          }
        }
      }
      await tx.update(organizationAppliedTemplates)
        .set({ appliedAt: new Date() })
        .where(and(
          eq(organizationAppliedTemplates.organizationId, orgId),
          eq(organizationAppliedTemplates.templateId, opts.templateId),
        ));
    });
  }
  return { organizationsUpdated: orgIds.length, tabsCreated, fieldsSkipped };
}

export async function listOrgsMissingDefaultTemplate(): Promise<{ id: number }[]> {
  return await db.select({ id: organizations.id }).from(organizations)
    .where(isNull(organizations.defaultTemplateAppliedAt));
}

export async function markDefaultTemplateApplied(organizationId: number): Promise<void> {
  await db.update(organizations)
    .set({ defaultTemplateAppliedAt: new Date() })
    .where(eq(organizations.id, organizationId));
}
