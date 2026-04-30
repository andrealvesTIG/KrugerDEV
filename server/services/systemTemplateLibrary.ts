/**
 * Shared system template library DSL + builder + idempotent upsert.
 *
 * This module is the contract every per-industry seeder uses. It mirrors the
 * authoring style first introduced for the IT library: a small, readable DSL
 * (phases → tasks → optional terminating milestone) with auto-chained
 * predecessors, plus a single `seedTemplateLibrary` entry point that upserts
 * each template by slug and replaces its items inside a transaction.
 *
 * Choice for system-template ownership: project_templates.organization_id is
 * nullable, so system templates are stored with organizationId = null and
 * isSystem = true. They are excluded from per-org "My Templates" listings
 * (see getProjectTemplates) and surfaced via the Browse Library scope.
 */

import { db } from "../db";
import {
  projectTemplates,
  projectTemplateItems,
  type InsertProjectTemplateItem,
} from "@shared/schema";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Authoring DSL
// ---------------------------------------------------------------------------

export interface TaskSpec {
  slug: string;        // unique within the phase
  name: string;
  days: number;
  notes?: string;
  /**
   * Predecessors. Bare slugs are resolved within the current phase; slugs
   * containing "." are treated as global within the template (cross-phase).
   * If omitted, the task chains to the previous task of the same phase, or to
   * the previous phase's terminating milestone/task if it's the first task.
   */
  deps?: string[];
}

export interface MilestoneSpec {
  slug: string;
  name: string;
  deps?: string[];
}

export interface PhaseSpec {
  slug: string;
  name: string;
  tasks: TaskSpec[];
  milestone?: MilestoneSpec;
}

export interface TemplatePlan {
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  icon: string;
  phases: PhaseSpec[];
}

export interface BuiltItem {
  slug: string;
  name: string;
  outlineLevel: number;
  isSummary: boolean;
  isMilestone: boolean;
  durationDays: number;
  parentSlug: string | null;
  predecessorSlugs: string[];
  notes?: string;
}

export interface BuiltTemplate {
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  icon: string;
  industry: string;
  estimatedDurationDays: number;
  items: BuiltItem[];
  itemCount: number;
  milestoneCount: number;
}

export function buildTemplate(plan: TemplatePlan): { items: BuiltItem[]; totalDays: number } {
  const items: BuiltItem[] = [];
  let totalDays = 0;
  let prevPhaseEndSlug: string | null = null;

  for (const phase of plan.phases) {
    const phaseSlug = `${plan.slug}.${phase.slug}`;
    items.push({
      slug: phaseSlug,
      name: phase.name,
      outlineLevel: 1,
      isSummary: true,
      isMilestone: false,
      durationDays: 0,
      parentSlug: null,
      predecessorSlugs: [],
    });

    let prevTaskSlug: string | null = null;
    let lastTaskSlugForPhase: string | null = null;

    const resolve = (raw: string): string => {
      if (raw.includes(".")) return raw.startsWith(`${plan.slug}.`) ? raw : `${plan.slug}.${raw}`;
      return `${phaseSlug}.${raw}`;
    };

    for (const t of phase.tasks) {
      const taskSlug = `${phaseSlug}.${t.slug}`;
      const deps = t.deps && t.deps.length > 0
        ? t.deps.map(resolve)
        : prevTaskSlug
          ? [prevTaskSlug]
          : prevPhaseEndSlug
            ? [prevPhaseEndSlug]
            : [];
      items.push({
        slug: taskSlug,
        name: t.name,
        outlineLevel: 2,
        isSummary: false,
        isMilestone: false,
        durationDays: t.days,
        parentSlug: phaseSlug,
        predecessorSlugs: deps,
        notes: t.notes,
      });
      totalDays += t.days;
      prevTaskSlug = taskSlug;
      lastTaskSlugForPhase = taskSlug;
    }

    if (phase.milestone) {
      const msSlug = `${phaseSlug}.${phase.milestone.slug}`;
      const deps = phase.milestone.deps && phase.milestone.deps.length > 0
        ? phase.milestone.deps.map(resolve)
        : prevTaskSlug
          ? [prevTaskSlug]
          : [];
      items.push({
        slug: msSlug,
        name: phase.milestone.name,
        outlineLevel: 2,
        isSummary: false,
        isMilestone: true,
        durationDays: 0,
        parentSlug: phaseSlug,
        predecessorSlugs: deps,
      });
      lastTaskSlugForPhase = msSlug;
    }

    prevPhaseEndSlug = lastTaskSlugForPhase;
  }

  return { items, totalDays };
}

// ---------------------------------------------------------------------------
// Common cross-cutting phases — applied to every system template.
// Real enterprise projects always include governance/PMO setup at the start
// and a structured closeout. Layering these in here keeps per-template
// authoring focused on what's domain-specific while ensuring every template
// has the depth needed for realistic plans.
// ---------------------------------------------------------------------------

export const PMO_PHASE: PhaseSpec = {
  slug: "pmo",
  name: "Project Governance & PMO",
  tasks: [
    { slug: "charter", name: "Project charter & sponsor sign-off", days: 3 },
    { slug: "raci", name: "Stakeholder map & RACI", days: 2 },
    { slug: "risk-register", name: "Risk & assumption register", days: 3 },
    { slug: "comms-plan", name: "Communications & escalation plan", days: 2 },
    { slug: "budget-baseline", name: "Budget baseline & cost tracking", days: 3 },
    { slug: "change-control", name: "Change control & approval process", days: 2 },
    { slug: "quality-plan", name: "Quality & acceptance criteria plan", days: 2 },
    { slug: "procurement", name: "Procurement & vendor onboarding", days: 5 },
  ],
  milestone: { slug: "ms-pmo-baseline", name: "Governance baseline approved" },
};

export const CLOSEOUT_PHASE: PhaseSpec = {
  slug: "closeout",
  name: "Closeout & Lessons Learned",
  tasks: [
    { slug: "ops-handover", name: "Operations handover & runbooks", days: 3 },
    { slug: "support-kt", name: "Knowledge transfer to support team", days: 3 },
    { slug: "end-user-training", name: "End-user training & enablement", days: 5 },
    { slug: "lessons-learned", name: "Lessons learned workshop", days: 2 },
    { slug: "closeout-report", name: "Project closeout report", days: 2 },
    { slug: "benefits-review", name: "Benefits realization review", days: 2 },
    { slug: "vendor-closeout", name: "Contract & vendor closeout", days: 2 },
  ],
  milestone: { slug: "ms-project-closed", name: "Project formally closed" },
};

export function withCommonPhases(plan: TemplatePlan): TemplatePlan {
  return {
    ...plan,
    phases: [PMO_PHASE, ...plan.phases, CLOSEOUT_PHASE],
  };
}

// ---------------------------------------------------------------------------
// Seeder entry point
// ---------------------------------------------------------------------------

export interface SeedOptions {
  industry: string;
  plans: TemplatePlan[];
  /**
   * If true (default), wraps each plan with the shared PMO + Closeout phases.
   * Pass false to opt out for plans that already include their own governance.
   */
  applyCommonPhases?: boolean;
  /** Log tag, e.g. "healthcare-templates". */
  logTag?: string;
}

export async function seedTemplateLibrary(opts: SeedOptions): Promise<void> {
  const apply = opts.applyCommonPhases !== false;
  const built = opts.plans.map((rawPlan) => {
    const plan = apply ? withCommonPhases(rawPlan) : rawPlan;
    const { items, totalDays } = buildTemplate(plan);
    const milestoneCount = items.filter((i) => i.isMilestone).length;
    const tpl: BuiltTemplate = {
      slug: plan.slug,
      name: plan.name,
      summary: plan.summary,
      description: plan.description,
      category: plan.category,
      icon: plan.icon,
      industry: opts.industry,
      estimatedDurationDays: totalDays,
      items,
      itemCount: items.filter((i) => !i.isSummary).length,
      milestoneCount,
    };
    return tpl;
  });

  const tag = opts.logTag ?? `${opts.industry}-templates`;
  for (const tpl of built) {
    try {
      await upsertOne(tpl);
    } catch (err) {
      console.error(`[${tag}] Failed to seed ${tpl.slug}:`, err);
    }
  }
}

async function upsertOne(tpl: BuiltTemplate): Promise<void> {
  const existing = await db
    .select()
    .from(projectTemplates)
    .where(and(eq(projectTemplates.slug, tpl.slug), eq(projectTemplates.isSystem, true)));

  let templateId: number;

  if (existing.length === 0) {
    const [created] = await db
      .insert(projectTemplates)
      .values({
        organizationId: null,
        name: tpl.name,
        description: tpl.description,
        sourceType: "system",
        originalFileName: null,
        storedFileUrl: null,
        itemCount: tpl.itemCount,
        milestoneCount: tpl.milestoneCount,
        createdBy: null,
        sourceProjectId: null,
        isSystem: true,
        industry: tpl.industry,
        category: tpl.category,
        slug: tpl.slug,
        icon: tpl.icon,
        estimatedDurationDays: tpl.estimatedDurationDays,
        summary: tpl.summary,
      })
      .returning();
    templateId = created.id;
  } else {
    const row = existing[0];
    templateId = row.id;
    await db
      .update(projectTemplates)
      .set({
        name: tpl.name,
        description: tpl.description,
        sourceType: "system",
        itemCount: tpl.itemCount,
        milestoneCount: tpl.milestoneCount,
        isSystem: true,
        industry: tpl.industry,
        category: tpl.category,
        icon: tpl.icon,
        estimatedDurationDays: tpl.estimatedDurationDays,
        summary: tpl.summary,
        updatedAt: new Date(),
      })
      .where(eq(projectTemplates.id, templateId));
  }

  // Replace items inside a transaction so we never leave the template empty.
  await db.transaction(async (tx) => {
    await tx.delete(projectTemplateItems).where(eq(projectTemplateItems.templateId, templateId));

    const slugToTaskId = new Map<string, number>();
    tpl.items.forEach((item, idx) => {
      slugToTaskId.set(item.slug, idx + 1);
    });

    const rows: InsertProjectTemplateItem[] = tpl.items.map((item, idx) => {
      const taskId = idx + 1;
      const parentTaskId = item.parentSlug ? slugToTaskId.get(item.parentSlug) ?? null : null;
      const predecessors = item.predecessorSlugs
        .map((s) => {
          const pid = slugToTaskId.get(s);
          if (!pid) return null;
          return { predecessorTaskId: pid, type: "finish-to-start", lagDays: 0 };
        })
        .filter((x): x is { predecessorTaskId: number; type: string; lagDays: number } => x !== null);

      return {
        templateId,
        taskId,
        wbs: null,
        name: item.name,
        description: null,
        startDate: null,
        endDate: null,
        duration: item.durationDays > 0 ? `${item.durationDays} days` : item.isMilestone ? "0 days" : null,
        durationDays: item.durationDays != null ? item.durationDays : null,
        outlineLevel: item.outlineLevel,
        parentTaskId,
        isSummary: item.isSummary,
        isMilestone: item.isMilestone,
        predecessors: predecessors.length > 0 ? JSON.stringify(predecessors) : null,
        notes: item.notes ?? null,
        workHours: null,
      };
    });

    if (rows.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(projectTemplateItems).values(rows.slice(i, i + CHUNK));
      }
    }
  });
}
