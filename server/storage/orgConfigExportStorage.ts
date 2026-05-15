import { db } from "../db";
import { sql, eq, inArray } from "drizzle-orm";
import {
  organizations,
  customFieldDefinitions,
  intakeWorkflows,
  intakeWorkflowSteps,
  intakeTabs,
  intakeTabSections,
  intakeTabItems,
  projectFormTabs,
  projectFormTabSections,
  projectFormTabItems,
  projectWorkflows,
  projectWorkflowSteps,
  projectCustomFieldValues,
  taskCustomFieldValues,
  resourceCustomFieldValues,
  intakeCustomFieldValues,
  projectIntakes,
} from "@shared/schema";

export const ORG_CONFIG_SCHEMA_VERSION = "1.1.0";

// Subset of organizations columns that are safe to port across environments.
// Excludes id/name/slug/ownerId/createdAt/deactivated*/defaultCalendarId
// (calendar IDs don't survive cross-env moves) and defaultTemplateAppliedAt
// (one-time backfill marker).
const PORTABLE_ORG_COLUMNS = [
  "description",
  "logoUrl",
  "hiddenModules",
  "moduleOrder",
  "hiddenGroups",
  "sidebarStructure",
  "dashboardTabOrder",
  "dashboardHiddenTabs",
  "billingHidden",
  "showPowerBiIntake",
  "riskAssessmentConfig",
  "schedulingDefaults",
  "timezone",
  "fridayAgentConfig",
  "financialTypesConfig",
  "costItemCategoriesConfig",
  "fiscalYearStartMonth",
  "projectTabSettings",
] as const;

type PortableOrgKey = (typeof PORTABLE_ORG_COLUMNS)[number];
type PortableOrgSettings = Partial<Record<PortableOrgKey, unknown>>;

interface ExportCustomField {
  id: number; name: string; fieldType: string; entityType: string;
  description: string | null; isRequired: boolean | null;
  options: string[] | null; defaultValue: string | null;
  mask: string | null; nextSequence: number | null;
  displayOrder: number | null; isActive: boolean | null;
}
interface ExportIntakeWorkflow {
  id: number; name: string; description: string | null;
  isDefault: boolean | null; isActive: boolean | null;
  creationMode: string; creationUrl: string | null;
  agentTarget: string | null;
}
interface ExportIntakeWorkflowStep {
  workflowId: number | null; stepKey: string; position: number;
  label: string; description: string | null; helpText: string | null;
  requiredFields: string[] | null;
  // Value-based gate rules. Field keys (including `cf:<id>`) are remapped on
  // import in the same way as `requiredFields`.
  fieldRules: Record<string, { allowedValues: string[] }> | null;
  notifyOnEntry: string[] | null; notifyOnExit: string[] | null;
  showFinancials: boolean; showArchitectureQuestions: boolean;
  showCybersecurityQuestions: boolean; showCostingChecklist: boolean;
  isActive: boolean | null;
}
interface ExportProjectWorkflow {
  id: number; name: string; description: string | null;
  isDefault: boolean | null; isActive: boolean | null;
  creationMode: string; creationUrl: string | null;
}
interface ExportProjectWorkflowStep {
  workflowId: number | null; stepKey: string; position: number;
  label: string; description: string | null; helpText: string | null;
  requiredFields: string[] | null;
  fieldRules: Record<string, { allowedValues: string[] }> | null;
  isTerminal: boolean | null; isActive: boolean | null;
}
interface ExportTabItem {
  itemType: string; itemKey: string; width: string;
  displayName: string | null; isRequired?: boolean;
}
interface ExportTabSection {
  position: number; title: string | null; description: string | null;
  width?: string; items: ExportTabItem[];
}
interface ExportTab {
  position: number; key: string; label: string;
  icon: string | null; isActive: boolean;
  sections: ExportTabSection[];
}

export interface OrgConfigBundle {
  schemaVersion: string;
  exportedAt: string;
  sourceOrganizationId: number;
  sourceOrganizationName: string;
  organizationSettings: PortableOrgSettings;
  customFieldDefinitions: ExportCustomField[];
  intakeWorkflows: ExportIntakeWorkflow[];
  intakeWorkflowSteps: ExportIntakeWorkflowStep[];
  projectWorkflows: ExportProjectWorkflow[];
  projectWorkflowSteps: ExportProjectWorkflowStep[];
  intakeTabs: ExportTab[];
  projectFormTabs: ExportTab[];
}

function remapRequiredFields(arr: string[] | null | undefined, cfMap: Map<number, number>): string[] | null {
  if (!Array.isArray(arr)) return null;
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v !== "string") continue;
    if (v.startsWith("cf:")) {
      const oldId = Number(v.slice(3));
      const newId = cfMap.get(oldId);
      if (Number.isFinite(newId as number)) out.push(`cf:${newId}`);
    } else {
      out.push(v);
    }
  }
  return out;
}

// Remap field-rule keys the same way requiredFields are remapped — `cf:<oldId>`
// keys swap to `cf:<newId>` so rules survive an export/import across orgs.
// Unknown cf: ids are dropped (matches remapRequiredFields).
function remapFieldRules(
  rules: Record<string, { allowedValues: string[] }> | null | undefined,
  cfMap: Map<number, number>,
): Record<string, { allowedValues: string[] }> | null {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const out: Record<string, { allowedValues: string[] }> = {};
  for (const [key, val] of Object.entries(rules)) {
    if (!val || typeof val !== "object" || !Array.isArray((val as any).allowedValues)) continue;
    const allowed = (val as any).allowedValues.filter((x: unknown) => typeof x === "string");
    if (allowed.length === 0) continue;
    let mappedKey: string | null = key;
    if (key.startsWith("cf:")) {
      const oldId = Number(key.slice(3));
      const newId = cfMap.get(oldId);
      mappedKey = Number.isFinite(newId as number) ? `cf:${newId}` : null;
    }
    if (mappedKey === null) continue;
    out[mappedKey] = { allowedValues: allowed };
  }
  return out;
}

function remapItemKey(item: ExportTabItem, cfMap: Map<number, number>): string | null {
  if (item.itemType !== "custom_field") return item.itemKey;
  const oldId = Number(item.itemKey);
  if (!Number.isFinite(oldId)) return null;
  const newId = cfMap.get(oldId);
  return newId === undefined ? null : String(newId);
}

export async function exportOrganizationConfig(organizationId: number): Promise<OrgConfigBundle> {
  // Wrap in a REPEATABLE READ snapshot so concurrent imports can't produce a mixed bundle.
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);

    const [org] = await tx.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!org) throw new Error(`Organization ${organizationId} not found`);

    const orgSettings: PortableOrgSettings = {};
    for (const k of PORTABLE_ORG_COLUMNS) {
      const v = (org as Record<string, unknown>)[k];
      if (v !== undefined) orgSettings[k] = v;
    }

    const cfs = await tx.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.organizationId, organizationId));
    const iws = await tx.select().from(intakeWorkflows).where(eq(intakeWorkflows.organizationId, organizationId));
    const iwSteps = await tx.select().from(intakeWorkflowSteps).where(eq(intakeWorkflowSteps.organizationId, organizationId));
    const pws = await tx.select().from(projectWorkflows).where(eq(projectWorkflows.organizationId, organizationId));
    const pwSteps = await tx.select().from(projectWorkflowSteps).where(eq(projectWorkflowSteps.organizationId, organizationId));

    const tabRows = await tx.select().from(intakeTabs).where(eq(intakeTabs.organizationId, organizationId));
    const tabIds = tabRows.map(t => t.id);
    const secRows = tabIds.length ? await tx.select().from(intakeTabSections).where(inArray(intakeTabSections.tabId, tabIds)) : [];
    const secIds = secRows.map(s => s.id);
    const itemRows = secIds.length ? await tx.select().from(intakeTabItems).where(inArray(intakeTabItems.sectionId, secIds)) : [];

    const pfTabRows = await tx.select().from(projectFormTabs).where(eq(projectFormTabs.organizationId, organizationId));
    const pfTabIds = pfTabRows.map(t => t.id);
    const pfSecRows = pfTabIds.length ? await tx.select().from(projectFormTabSections).where(inArray(projectFormTabSections.tabId, pfTabIds)) : [];
    const pfSecIds = pfSecRows.map(s => s.id);
    const pfItemRows = pfSecIds.length ? await tx.select().from(projectFormTabItems).where(inArray(projectFormTabItems.sectionId, pfSecIds)) : [];

    function nest(tabRowsX: any[], secRowsX: any[], itemRowsX: any[], includeWidth: boolean, includeIsRequired: boolean): ExportTab[] {
      return tabRowsX
        .slice().sort((a, b) => a.position - b.position)
        .map(t => ({
          position: t.position, key: t.key, label: t.label, icon: t.icon ?? null, isActive: !!t.isActive,
          sections: secRowsX
            .filter(s => s.tabId === t.id)
            .sort((a, b) => a.position - b.position)
            .map(s => ({
              position: s.position, title: s.title ?? null, description: s.description ?? null,
              ...(includeWidth ? { width: s.width } : {}),
              items: itemRowsX
                .filter(i => i.sectionId === s.id)
                .sort((a, b) => a.position - b.position)
                .map(i => ({
                  itemType: i.itemType, itemKey: i.itemKey, width: i.width,
                  displayName: i.displayName ?? null,
                  ...(includeIsRequired ? { isRequired: !!i.isRequired } : {}),
                })),
            })),
        }));
    }

    return {
      schemaVersion: ORG_CONFIG_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      sourceOrganizationId: org.id,
      sourceOrganizationName: org.name,
      organizationSettings: orgSettings,
      customFieldDefinitions: cfs.map(c => ({
        id: c.id, name: c.name, fieldType: c.fieldType, entityType: c.entityType,
        description: c.description ?? null, isRequired: c.isRequired ?? null,
        options: c.options ?? null, defaultValue: c.defaultValue ?? null,
        mask: c.mask ?? null, nextSequence: c.nextSequence ?? null,
        displayOrder: c.displayOrder ?? null, isActive: c.isActive ?? null,
      })),
      intakeWorkflows: iws.map(w => ({
        id: w.id, name: w.name, description: w.description ?? null,
        isDefault: w.isDefault ?? null, isActive: w.isActive ?? null,
        creationMode: w.creationMode, creationUrl: w.creationUrl ?? null,
        agentTarget: w.agentTarget ?? null,
      })),
      intakeWorkflowSteps: iwSteps.map(s => ({
        workflowId: s.workflowId ?? null, stepKey: s.stepKey, position: s.position,
        label: s.label, description: s.description ?? null, helpText: s.helpText ?? null,
        requiredFields: s.requiredFields ?? null,
        fieldRules: ((s as any).fieldRules ?? null) as Record<string, { allowedValues: string[] }> | null,
        notifyOnEntry: s.notifyOnEntry ?? null,
        notifyOnExit: s.notifyOnExit ?? null,
        showFinancials: !!s.showFinancials, showArchitectureQuestions: !!s.showArchitectureQuestions,
        showCybersecurityQuestions: !!s.showCybersecurityQuestions, showCostingChecklist: !!s.showCostingChecklist,
        isActive: s.isActive ?? null,
      })),
      projectWorkflows: pws.map(w => ({
        id: w.id, name: w.name, description: w.description ?? null,
        isDefault: w.isDefault ?? null, isActive: w.isActive ?? null,
        creationMode: w.creationMode, creationUrl: w.creationUrl ?? null,
      })),
      projectWorkflowSteps: pwSteps.map(s => ({
        workflowId: s.workflowId ?? null, stepKey: s.stepKey, position: s.position,
        label: s.label, description: s.description ?? null, helpText: s.helpText ?? null,
        requiredFields: s.requiredFields ?? null,
        fieldRules: ((s as any).fieldRules ?? null) as Record<string, { allowedValues: string[] }> | null,
        isTerminal: s.isTerminal ?? null, isActive: s.isActive ?? null,
      })),
      intakeTabs: nest(tabRows, secRows, itemRows, false, true),
      projectFormTabs: nest(pfTabRows, pfSecRows, pfItemRows, true, false),
    };
  });
}

export interface ImportBlocker { resource: string; count: number; message: string; }

/**
 * Counts rows in the target org that would block a destructive import.
 * The import wipes per-org config tables, but several tables FK into those
 * configs WITHOUT cascade — so deleting them while operational data exists
 * would either fail with FK errors or silently orphan rows. We refuse the
 * import up-front and return a clear list of what's blocking.
 */
export async function getImportBlockers(organizationId: number): Promise<ImportBlocker[]> {
  const blockers: ImportBlocker[] = [];
  const firstCount = (r: any): number => Number(r?.rows?.[0]?.n ?? 0);

  const pcfvCount = firstCount(await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ${projectCustomFieldValues} v
    JOIN ${customFieldDefinitions} d ON d.id = v.field_definition_id
    WHERE d.organization_id = ${organizationId}
  `));
  if (pcfvCount > 0) blockers.push({ resource: "project_custom_field_values", count: pcfvCount,
    message: `${pcfvCount} project custom-field value(s) reference this organization's custom fields` });

  const tcfvCount = firstCount(await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ${taskCustomFieldValues} v
    JOIN ${customFieldDefinitions} d ON d.id = v.field_definition_id
    WHERE d.organization_id = ${organizationId}
  `));
  if (tcfvCount > 0) blockers.push({ resource: "task_custom_field_values", count: tcfvCount,
    message: `${tcfvCount} task custom-field value(s) reference this organization's custom fields` });

  const rcfvCount = firstCount(await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ${resourceCustomFieldValues} v
    JOIN ${customFieldDefinitions} d ON d.id = v.field_definition_id
    WHERE d.organization_id = ${organizationId}
  `));
  if (rcfvCount > 0) blockers.push({ resource: "resource_custom_field_values", count: rcfvCount,
    message: `${rcfvCount} resource custom-field value(s) reference this organization's custom fields` });

  const icfvCount = firstCount(await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ${intakeCustomFieldValues} v
    JOIN ${customFieldDefinitions} d ON d.id = v.field_definition_id
    WHERE d.organization_id = ${organizationId}
  `));
  if (icfvCount > 0) blockers.push({ resource: "intake_custom_field_values", count: icfvCount,
    message: `${icfvCount} intake custom-field value(s) reference this organization's custom fields` });

  const intakeCount = firstCount(await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ${projectIntakes} i
    WHERE i.organization_id = ${organizationId} AND i.workflow_id IS NOT NULL
  `));
  if (intakeCount > 0) blockers.push({ resource: "project_intakes", count: intakeCount,
    message: `${intakeCount} intake(s) reference this organization's intake workflows` });

  return blockers;
}

export interface ImportResult {
  customFieldsImported: number;
  intakeWorkflowsImported: number;
  intakeWorkflowStepsImported: number;
  projectWorkflowsImported: number;
  projectWorkflowStepsImported: number;
  intakeTabsImported: number;
  projectFormTabsImported: number;
  organizationSettingsApplied: boolean;
  warnings: string[];
}

export class ImportBlockedError extends Error {
  blockers: ImportBlocker[];
  constructor(blockers: ImportBlocker[]) {
    super(`Import blocked by ${blockers.length} precondition(s)`);
    this.blockers = blockers;
    this.name = "ImportBlockedError";
  }
}

export async function importOrganizationConfig(
  organizationId: number,
  bundle: OrgConfigBundle,
  opts: { force?: boolean } = {},
): Promise<ImportResult> {
  if (!bundle || typeof bundle !== "object") throw new Error("Invalid bundle");
  // Forward-compatible: accept any 1.x bundle (additive fields like project workflows
  // are optional). Reject 0.x or 2.x.
  if (!/^1\.\d+\.\d+$/.test(bundle.schemaVersion ?? "")) {
    throw new Error(`Unsupported schema version "${bundle.schemaVersion}" (expected 1.x)`);
  }

  const [target] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!target) throw new Error(`Target organization ${organizationId} not found`);

  if (!opts.force) {
    const blockers = await getImportBlockers(organizationId);
    if (blockers.length > 0) throw new ImportBlockedError(blockers);
  }

  const warnings: string[] = [];
  const result: ImportResult = {
    customFieldsImported: 0, intakeWorkflowsImported: 0, intakeWorkflowStepsImported: 0,
    projectWorkflowsImported: 0, projectWorkflowStepsImported: 0,
    intakeTabsImported: 0, projectFormTabsImported: 0,
    organizationSettingsApplied: false, warnings,
  };

  await db.transaction(async (tx) => {
    // Distinct advisory-lock key 'ORGC' — serializes imports per target org.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${0x4F524743}, ${organizationId})`);

    // 1. Apply organization settings (column-by-column patch over portable subset).
    const settings = bundle.organizationSettings ?? {};
    const patch: Record<string, unknown> = {};
    for (const k of PORTABLE_ORG_COLUMNS) {
      if (k in settings) patch[k] = (settings as Record<string, unknown>)[k];
    }
    if (Object.keys(patch).length > 0) {
      await tx.update(organizations).set(patch as any).where(eq(organizations.id, organizationId));
      result.organizationSettingsApplied = true;
    }

    // 2. Wipe existing per-org config tables (children cascade via FK).
    await tx.delete(intakeTabs).where(eq(intakeTabs.organizationId, organizationId));
    await tx.delete(projectFormTabs).where(eq(projectFormTabs.organizationId, organizationId));
    await tx.delete(intakeWorkflowSteps).where(eq(intakeWorkflowSteps.organizationId, organizationId));
    await tx.delete(intakeWorkflows).where(eq(intakeWorkflows.organizationId, organizationId));
    await tx.delete(projectWorkflowSteps).where(eq(projectWorkflowSteps.organizationId, organizationId));
    await tx.delete(projectWorkflows).where(eq(projectWorkflows.organizationId, organizationId));
    await tx.delete(customFieldDefinitions).where(eq(customFieldDefinitions.organizationId, organizationId));

    // 3. Insert custom field definitions; build oldId → newId map.
    const cfMap = new Map<number, number>();
    for (const cf of bundle.customFieldDefinitions ?? []) {
      const [row] = await tx.insert(customFieldDefinitions).values({
        organizationId, name: cf.name, fieldType: cf.fieldType, entityType: cf.entityType,
        description: cf.description, isRequired: cf.isRequired ?? false,
        options: cf.options ?? null, defaultValue: cf.defaultValue,
        mask: cf.mask, nextSequence: cf.nextSequence ?? 1,
        displayOrder: cf.displayOrder ?? 0, isActive: cf.isActive ?? true,
      }).returning({ id: customFieldDefinitions.id });
      cfMap.set(cf.id, row.id);
      result.customFieldsImported++;
    }

    // 4. Insert intake workflows; build oldId → newId map.
    const iwMap = new Map<number, number>();
    for (const w of bundle.intakeWorkflows ?? []) {
      const [row] = await tx.insert(intakeWorkflows).values({
        organizationId, name: w.name, description: w.description,
        isDefault: w.isDefault ?? false, isActive: w.isActive ?? true,
        creationMode: w.creationMode, creationUrl: w.creationUrl,
        agentTarget: w.agentTarget,
      }).returning({ id: intakeWorkflows.id });
      iwMap.set(w.id, row.id);
      result.intakeWorkflowsImported++;
    }

    // 5. Insert intake workflow steps (remap workflowId + cf: refs).
    for (const s of bundle.intakeWorkflowSteps ?? []) {
      const mapped = s.workflowId == null ? null : iwMap.get(s.workflowId);
      if (s.workflowId != null && mapped === undefined) {
        warnings.push(`Intake workflow step "${s.stepKey}" referenced unknown workflow ${s.workflowId}; skipped`);
        continue;
      }
      await tx.insert(intakeWorkflowSteps).values({
        organizationId, workflowId: mapped ?? null,
        stepKey: s.stepKey, position: s.position, label: s.label,
        description: s.description, helpText: s.helpText,
        requiredFields: remapRequiredFields(s.requiredFields, cfMap),
        fieldRules: remapFieldRules(s.fieldRules, cfMap) ?? {},
        notifyOnEntry: s.notifyOnEntry ?? null, notifyOnExit: s.notifyOnExit ?? null,
        showFinancials: !!s.showFinancials, showArchitectureQuestions: !!s.showArchitectureQuestions,
        showCybersecurityQuestions: !!s.showCybersecurityQuestions, showCostingChecklist: !!s.showCostingChecklist,
        isActive: s.isActive ?? true,
      });
      result.intakeWorkflowStepsImported++;
    }

    // 6. Insert project workflows; build oldId → newId map.
    const pwMap = new Map<number, number>();
    for (const w of bundle.projectWorkflows ?? []) {
      const [row] = await tx.insert(projectWorkflows).values({
        organizationId, name: w.name, description: w.description,
        isDefault: w.isDefault ?? false, isActive: w.isActive ?? true,
        creationMode: w.creationMode, creationUrl: w.creationUrl,
      }).returning({ id: projectWorkflows.id });
      pwMap.set(w.id, row.id);
      result.projectWorkflowsImported++;
    }

    // 7. Insert project workflow steps (remap workflowId + cf: refs).
    for (const s of bundle.projectWorkflowSteps ?? []) {
      const mapped = s.workflowId == null ? null : pwMap.get(s.workflowId);
      if (s.workflowId != null && mapped === undefined) {
        warnings.push(`Project workflow step "${s.stepKey}" referenced unknown workflow ${s.workflowId}; skipped`);
        continue;
      }
      await tx.insert(projectWorkflowSteps).values({
        organizationId, workflowId: mapped ?? null,
        stepKey: s.stepKey, position: s.position, label: s.label,
        description: s.description, helpText: s.helpText,
        requiredFields: remapRequiredFields(s.requiredFields, cfMap),
        fieldRules: remapFieldRules(s.fieldRules, cfMap) ?? {},
        isTerminal: s.isTerminal ?? false, isActive: s.isActive ?? true,
      });
      result.projectWorkflowStepsImported++;
    }

    // 8. Insert intake tabs / sections / items (remap cf: itemKey refs).
    for (let ti = 0; ti < (bundle.intakeTabs ?? []).length; ti++) {
      const t = bundle.intakeTabs[ti];
      const [tabRow] = await tx.insert(intakeTabs).values({
        organizationId, position: ti, key: t.key, label: t.label,
        icon: t.icon ?? null, isActive: t.isActive ?? true,
      }).returning({ id: intakeTabs.id });
      for (let si = 0; si < (t.sections ?? []).length; si++) {
        const s = t.sections[si];
        const [secRow] = await tx.insert(intakeTabSections).values({
          tabId: tabRow.id, position: si, title: s.title ?? null, description: s.description ?? null,
        }).returning({ id: intakeTabSections.id });
        for (let ii = 0; ii < (s.items ?? []).length; ii++) {
          const it = s.items[ii];
          const mappedKey = remapItemKey(it, cfMap);
          if (mappedKey === null) {
            warnings.push(`Intake item dropped (unknown custom field ${it.itemKey})`);
            continue;
          }
          await tx.insert(intakeTabItems).values({
            sectionId: secRow.id, position: ii,
            itemType: it.itemType, itemKey: mappedKey,
            width: it.width ?? "full", displayName: it.displayName ?? null,
            isRequired: !!it.isRequired,
          });
        }
      }
      result.intakeTabsImported++;
    }

    // 9. Insert project form tabs / sections / items (remap cf: itemKey refs).
    for (let ti = 0; ti < (bundle.projectFormTabs ?? []).length; ti++) {
      const t = bundle.projectFormTabs[ti];
      const [tabRow] = await tx.insert(projectFormTabs).values({
        organizationId, position: ti, key: t.key, label: t.label,
        icon: t.icon ?? null, isActive: t.isActive ?? true,
      }).returning({ id: projectFormTabs.id });
      for (let si = 0; si < (t.sections ?? []).length; si++) {
        const s = t.sections[si];
        const [secRow] = await tx.insert(projectFormTabSections).values({
          tabId: tabRow.id, position: si, title: s.title ?? null, description: s.description ?? null, width: s.width ?? "full",
        }).returning({ id: projectFormTabSections.id });
        for (let ii = 0; ii < (s.items ?? []).length; ii++) {
          const it = s.items[ii];
          const mappedKey = remapItemKey(it, cfMap);
          if (mappedKey === null) {
            warnings.push(`Project-form item dropped (unknown custom field ${it.itemKey})`);
            continue;
          }
          await tx.insert(projectFormTabItems).values({
            sectionId: secRow.id, position: ii,
            itemType: it.itemType, itemKey: mappedKey,
            width: it.width ?? "full", displayName: it.displayName ?? null,
          });
        }
      }
      result.projectFormTabsImported++;
    }
  });

  return result;
}
