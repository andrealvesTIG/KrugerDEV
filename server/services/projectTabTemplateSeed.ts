import {
  upsertTemplateBlueprint,
  applyTemplateToOrganization,
  getTemplateBySlug,
  listOrgsMissingDefaultTemplate,
  type TemplateBlueprint,
} from "../storage/projectTabTemplateStorage";
import { PROJECT_FIELD_DEFINITIONS } from "@shared/schema";
import { db } from "../db";
import { organizations, organizationAppliedTemplates } from "@shared/schema";
import { sql, eq, and, isNotNull, notExists } from "drizzle-orm";

const VALID_FIELD_KEYS = new Set(PROJECT_FIELD_DEFINITIONS.map(d => d.key));

export const GENERIC_PMO_SLUG = 'generic-pmo';

export const SYSTEM_TEMPLATES: TemplateBlueprint[] = [
  {
    slug: GENERIC_PMO_SLUG,
    name: 'Generic PMO',
    description: 'A balanced PMO layout: charter, governance, finance, and risk visibility for any project.',
    industry: 'generic',
    icon: 'Briefcase',
    tabs: [
      {
        name: 'PMO Charter',
        description: 'Project charter and governance fundamentals.',
        icon: 'FileText',
        sections: [
          {
            name: 'Identification',
            columns: 2,
            fields: [
              { fieldKey: 'name', fieldType: 'text' },
              { fieldKey: 'projectCode', fieldType: 'text' },
              { fieldKey: 'projectType', fieldType: 'text' },
              { fieldKey: 'methodology', fieldType: 'text' },
              { fieldKey: 'department', fieldType: 'text' },
              { fieldKey: 'category', fieldType: 'text' },
            ],
          },
          {
            name: 'Charter Narrative',
            columns: 1,
            fields: [
              { fieldKey: 'description', fieldType: 'textarea' },
              { fieldKey: 'objectives', fieldType: 'textarea' },
              { fieldKey: 'successCriteria', fieldType: 'textarea' },
              { fieldKey: 'scope', fieldType: 'textarea' },
            ],
          },
        ],
      },
      {
        name: 'Governance',
        icon: 'Users',
        sections: [
          {
            name: 'Stakeholders',
            columns: 2,
            fields: [
              { fieldKey: 'managerResourceId', fieldType: 'reference' },
              { fieldKey: 'portfolioId', fieldType: 'reference' },
              { fieldKey: 'businessValue', fieldType: 'text' },
              { fieldKey: 'priority', fieldType: 'select' },
            ],
          },
          {
            name: 'Constraints & Assumptions',
            columns: 1,
            fields: [
              { fieldKey: 'constraints', fieldType: 'textarea' },
              { fieldKey: 'assumptions', fieldType: 'textarea' },
              { fieldKey: 'dependencies', fieldType: 'textarea' },
            ],
          },
        ],
      },
      {
        name: 'Finance & Health',
        icon: 'DollarSign',
        sections: [
          {
            name: 'Budget',
            columns: 2,
            fields: [
              { fieldKey: 'budget', fieldType: 'currency' },
              { fieldKey: 'actualCost', fieldType: 'currency' },
              { fieldKey: 'forecastCost', fieldType: 'currency' },
              { fieldKey: 'costVariance', fieldType: 'number' },
              { fieldKey: 'billableStatus', fieldType: 'select' },
            ],
          },
          {
            name: 'Health & Schedule',
            columns: 2,
            fields: [
              { fieldKey: 'health', fieldType: 'select' },
              { fieldKey: 'healthReason', fieldType: 'textarea' },
              { fieldKey: 'completionPercentage', fieldType: 'percentage' },
              { fieldKey: 'scheduleVariance', fieldType: 'number' },
              { fieldKey: 'riskLevel', fieldType: 'select' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'construction',
    name: 'Construction',
    description: 'Field-ready layout: site information, contracts, milestones, and safety.',
    industry: 'construction',
    icon: 'HardHat',
    tabs: [
      {
        name: 'Site & Contract',
        sections: [
          {
            name: 'Site Information',
            columns: 2,
            fields: [
              { fieldKey: 'name', fieldType: 'text' },
              { fieldKey: 'projectCode', fieldType: 'text' },
              { fieldKey: 'projectType', fieldType: 'text' },
              { fieldKey: 'department', fieldType: 'text' },
            ],
          },
          {
            name: 'Contract',
            columns: 2,
            fields: [
              { fieldKey: 'budget', fieldType: 'currency' },
              { fieldKey: 'actualCost', fieldType: 'currency' },
              { fieldKey: 'forecastCost', fieldType: 'currency' },
              { fieldKey: 'billableStatus', fieldType: 'select' },
              { fieldKey: 'source', fieldType: 'text' },
            ],
          },
        ],
      },
      {
        name: 'Schedule & Milestones',
        sections: [
          {
            name: 'Schedule',
            columns: 2,
            fields: [
              { fieldKey: 'startDate', fieldType: 'date' },
              { fieldKey: 'endDate', fieldType: 'date' },
              { fieldKey: 'baselineStartDate', fieldType: 'date' },
              { fieldKey: 'baselineEndDate', fieldType: 'date' },
              { fieldKey: 'actualStartDate', fieldType: 'date' },
              { fieldKey: 'actualEndDate', fieldType: 'date' },
              { fieldKey: 'completionPercentage', fieldType: 'percentage' },
            ],
          },
        ],
      },
      {
        name: 'Risk & Safety',
        sections: [
          {
            name: 'Risk',
            columns: 2,
            fields: [
              { fieldKey: 'riskLevel', fieldType: 'select' },
              { fieldKey: 'health', fieldType: 'select' },
              { fieldKey: 'healthReason', fieldType: 'textarea' },
              { fieldKey: 'constraints', fieldType: 'textarea' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'it-software',
    name: 'IT / Software',
    description: 'Engineering-friendly layout: scope, delivery, and technical context.',
    industry: 'it',
    icon: 'Code',
    tabs: [
      {
        name: 'Product Brief',
        sections: [
          {
            name: 'Overview',
            columns: 2,
            fields: [
              { fieldKey: 'name', fieldType: 'text' },
              { fieldKey: 'projectCode', fieldType: 'text' },
              { fieldKey: 'methodology', fieldType: 'text' },
              { fieldKey: 'priority', fieldType: 'select' },
            ],
          },
          {
            name: 'Narrative',
            columns: 1,
            fields: [
              { fieldKey: 'description', fieldType: 'textarea' },
              { fieldKey: 'objectives', fieldType: 'textarea' },
              { fieldKey: 'scope', fieldType: 'textarea' },
              { fieldKey: 'successCriteria', fieldType: 'textarea' },
            ],
          },
        ],
      },
      {
        name: 'Delivery',
        sections: [
          {
            name: 'Plan',
            columns: 2,
            fields: [
              { fieldKey: 'startDate', fieldType: 'date' },
              { fieldKey: 'endDate', fieldType: 'date' },
              { fieldKey: 'completionPercentage', fieldType: 'percentage' },
              { fieldKey: 'health', fieldType: 'select' },
              { fieldKey: 'managerResourceId', fieldType: 'reference' },
            ],
          },
          {
            name: 'Dependencies',
            columns: 1,
            fields: [
              { fieldKey: 'dependencies', fieldType: 'textarea' },
              { fieldKey: 'constraints', fieldType: 'textarea' },
              { fieldKey: 'assumptions', fieldType: 'textarea' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'marketing',
    name: 'Marketing',
    description: 'Campaign-centric layout: audience, creative, budget, and KPIs.',
    industry: 'marketing',
    icon: 'Megaphone',
    tabs: [
      {
        name: 'Campaign',
        sections: [
          {
            name: 'Brief',
            columns: 2,
            fields: [
              { fieldKey: 'name', fieldType: 'text' },
              { fieldKey: 'category', fieldType: 'text' },
              { fieldKey: 'startDate', fieldType: 'date' },
              { fieldKey: 'endDate', fieldType: 'date' },
            ],
          },
          {
            name: 'Goals',
            columns: 1,
            fields: [
              { fieldKey: 'objectives', fieldType: 'textarea' },
              { fieldKey: 'successCriteria', fieldType: 'textarea' },
              { fieldKey: 'businessValue', fieldType: 'text' },
            ],
          },
        ],
      },
      {
        name: 'Budget',
        sections: [
          {
            name: 'Spend',
            columns: 2,
            fields: [
              { fieldKey: 'budget', fieldType: 'currency' },
              { fieldKey: 'actualCost', fieldType: 'currency' },
              { fieldKey: 'forecastCost', fieldType: 'currency' },
              { fieldKey: 'completionPercentage', fieldType: 'percentage' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'product-rd',
    name: 'Product / R&D',
    description: 'Discovery-friendly layout for new product or research initiatives.',
    industry: 'rnd',
    icon: 'Beaker',
    tabs: [
      {
        name: 'Discovery',
        sections: [
          {
            name: 'Hypothesis',
            columns: 1,
            fields: [
              { fieldKey: 'description', fieldType: 'textarea' },
              { fieldKey: 'objectives', fieldType: 'textarea' },
              { fieldKey: 'successCriteria', fieldType: 'textarea' },
              { fieldKey: 'assumptions', fieldType: 'textarea' },
            ],
          },
        ],
      },
      {
        name: 'Plan & Risk',
        sections: [
          {
            name: 'Plan',
            columns: 2,
            fields: [
              { fieldKey: 'startDate', fieldType: 'date' },
              { fieldKey: 'endDate', fieldType: 'date' },
              { fieldKey: 'budget', fieldType: 'currency' },
              { fieldKey: 'priority', fieldType: 'select' },
              { fieldKey: 'riskLevel', fieldType: 'select' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'healthcare',
    name: 'Healthcare / Life Sciences',
    description: 'Compliance-aware layout for regulated programs.',
    industry: 'healthcare',
    icon: 'HeartPulse',
    tabs: [
      {
        name: 'Program Charter',
        sections: [
          {
            name: 'Identification',
            columns: 2,
            fields: [
              { fieldKey: 'name', fieldType: 'text' },
              { fieldKey: 'projectCode', fieldType: 'text' },
              { fieldKey: 'department', fieldType: 'text' },
              { fieldKey: 'category', fieldType: 'text' },
              { fieldKey: 'methodology', fieldType: 'text' },
            ],
          },
          {
            name: 'Scope & Constraints',
            columns: 1,
            fields: [
              { fieldKey: 'scope', fieldType: 'textarea' },
              { fieldKey: 'constraints', fieldType: 'textarea' },
              { fieldKey: 'assumptions', fieldType: 'textarea' },
              { fieldKey: 'dependencies', fieldType: 'textarea' },
            ],
          },
        ],
      },
      {
        name: 'Risk & Health',
        sections: [
          {
            name: 'Risk',
            columns: 2,
            fields: [
              { fieldKey: 'riskLevel', fieldType: 'select' },
              { fieldKey: 'health', fieldType: 'select' },
              { fieldKey: 'healthReason', fieldType: 'textarea' },
              { fieldKey: 'completionPercentage', fieldType: 'percentage' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'professional-services',
    name: 'Professional Services',
    description: 'Client-engagement layout: scope, billing, and delivery.',
    industry: 'services',
    icon: 'Briefcase',
    tabs: [
      {
        name: 'Engagement',
        sections: [
          {
            name: 'Client',
            columns: 2,
            fields: [
              { fieldKey: 'name', fieldType: 'text' },
              { fieldKey: 'projectCode', fieldType: 'text' },
              { fieldKey: 'category', fieldType: 'text' },
              { fieldKey: 'managerResourceId', fieldType: 'reference' },
            ],
          },
          {
            name: 'Scope of Work',
            columns: 1,
            fields: [
              { fieldKey: 'scope', fieldType: 'textarea' },
              { fieldKey: 'objectives', fieldType: 'textarea' },
              { fieldKey: 'successCriteria', fieldType: 'textarea' },
            ],
          },
        ],
      },
      {
        name: 'Billing & Delivery',
        sections: [
          {
            name: 'Billing',
            columns: 2,
            fields: [
              { fieldKey: 'budget', fieldType: 'currency' },
              { fieldKey: 'actualCost', fieldType: 'currency' },
              { fieldKey: 'forecastCost', fieldType: 'currency' },
              { fieldKey: 'billableStatus', fieldType: 'select' },
            ],
          },
          {
            name: 'Schedule',
            columns: 2,
            fields: [
              { fieldKey: 'startDate', fieldType: 'date' },
              { fieldKey: 'endDate', fieldType: 'date' },
              { fieldKey: 'completionPercentage', fieldType: 'percentage' },
              { fieldKey: 'health', fieldType: 'select' },
            ],
          },
        ],
      },
    ],
  },
];

/**
 * Idempotently seed the system templates. Safe to call on every boot — it
 * upserts by slug and never touches org-scoped templates.
 */
export async function seedSystemTemplates(): Promise<void> {
  for (const tpl of SYSTEM_TEMPLATES) {
    try {
      await upsertTemplateBlueprint(tpl);
    } catch (err) {
      console.error(`[project-tab-templates] Failed to seed template ${tpl.slug}:`, err);
    }
  }
}

/**
 * Apply the Generic PMO template to every organization that has not yet had a
 * default template applied. Marks `defaultTemplateAppliedAt` to make this
 * idempotent across restarts.
 */
export async function backfillDefaultTemplateForOrgs(): Promise<void> {
  const generic = await getTemplateBySlug(GENERIC_PMO_SLUG);
  if (!generic) {
    console.warn('[project-tab-templates] Generic PMO template missing — skipping backfill');
    return;
  }
  const orgs = await listOrgsMissingDefaultTemplate();
  if (orgs.length === 0) return;
  console.log(`[project-tab-templates] Backfilling Generic PMO template for ${orgs.length} organization(s)`);
  for (const org of orgs) {
    try {
      await applyTemplateToOrganization({
        templateId: generic.id,
        organizationId: org.id,
        mode: 'append',
        validFieldKeys: VALID_FIELD_KEYS,
        markDefaultApplied: true,
        skipIfDefaultAlreadyApplied: true,
      });
    } catch (err) {
      console.error(`[project-tab-templates] Backfill failed for org ${org.id}:`, err);
    }
  }
}

/**
 * Ensure every organization that already has the default template marker is
 * also registered in `organization_applied_templates` for Generic PMO. Older
 * backfill runs set the marker without registering the template, which means
 * later edits to Generic PMO never propagated to those orgs.
 */
export async function ensureDefaultTemplateRegistry(): Promise<void> {
  const generic = await getTemplateBySlug(GENERIC_PMO_SLUG);
  if (!generic) return;
  const orphans = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        isNotNull(organizations.defaultTemplateAppliedAt),
        notExists(
          db
            .select({ x: sql`1` })
            .from(organizationAppliedTemplates)
            .where(
              and(
                eq(organizationAppliedTemplates.organizationId, organizations.id),
                eq(organizationAppliedTemplates.templateId, generic.id),
              ),
            ),
        ),
      ),
    );
  if (orphans.length === 0) return;
  console.log(`[project-tab-templates] Registering Generic PMO for ${orphans.length} legacy org(s)`);
  for (const o of orphans) {
    await db.insert(organizationAppliedTemplates).values({
      organizationId: o.id,
      templateId: generic.id,
      appliedAt: new Date(),
    }).onConflictDoNothing();
  }
}

/**
 * Apply the Generic PMO template to a single organization (used at org
 * creation time). No-op if Generic PMO is missing.
 */
export async function applyDefaultTemplateToOrg(organizationId: number, createdBy?: string | null): Promise<void> {
  const generic = await getTemplateBySlug(GENERIC_PMO_SLUG);
  if (!generic) return;
  await applyTemplateToOrganization({
    templateId: generic.id,
    organizationId,
    mode: 'append',
    createdBy: createdBy ?? null,
    validFieldKeys: VALID_FIELD_KEYS,
    markDefaultApplied: true,
    skipIfDefaultAlreadyApplied: true,
  });
}

export { VALID_FIELD_KEYS };
