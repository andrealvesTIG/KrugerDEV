import { db } from "../db";
import { sql, asc, eq, inArray } from "drizzle-orm";
import {
  projectFormTabs as _tabs,
  projectFormTabSections as _sections,
  projectFormTabItems as _items,
  type ProjectFormLayoutTabDTO,
} from "@shared/schema";
import { DEFAULT_PROJECT_FORM_TABS } from "@shared/projectFormTabDefaults";

export interface ProjectFormLayoutItemFull { id: number; itemType: string; itemKey: string; width: string; position: number; }
export interface ProjectFormLayoutSectionFull { id: number; title: string | null; description: string | null; width: string; position: number; items: ProjectFormLayoutItemFull[]; }
export interface ProjectFormLayoutTabFull { id: number; key: string; label: string; icon: string | null; isActive: boolean; position: number; sections: ProjectFormLayoutSectionFull[]; }

export async function getProjectFormLayout(organizationId: number): Promise<ProjectFormLayoutTabFull[]> {
  const tabRows = await db.select().from(_tabs)
    .where(eq(_tabs.organizationId, organizationId))
    .orderBy(asc(_tabs.position), asc(_tabs.id));
  if (tabRows.length === 0) return [];
  const tabIds = tabRows.map(t => t.id);
  const sectionRows = await db.select().from(_sections)
    .where(inArray(_sections.tabId, tabIds))
    .orderBy(asc(_sections.tabId), asc(_sections.position), asc(_sections.id));
  const sectionIds = sectionRows.map(s => s.id);
  const itemRows = sectionIds.length === 0
    ? []
    : await db.select().from(_items)
        .where(inArray(_items.sectionId, sectionIds))
        .orderBy(asc(_items.sectionId), asc(_items.position), asc(_items.id));

  const itemsBySection = new Map<number, ProjectFormLayoutItemFull[]>();
  for (const i of itemRows) {
    const arr = itemsBySection.get(i.sectionId) ?? [];
    arr.push({ id: i.id, itemType: i.itemType, itemKey: i.itemKey, width: i.width, position: i.position });
    itemsBySection.set(i.sectionId, arr);
  }
  const sectionsByTab = new Map<number, ProjectFormLayoutSectionFull[]>();
  for (const s of sectionRows) {
    const arr = sectionsByTab.get(s.tabId) ?? [];
    arr.push({ id: s.id, title: s.title ?? null, description: s.description ?? null, width: s.width ?? "full", position: s.position, items: itemsBySection.get(s.id) ?? [] });
    sectionsByTab.set(s.tabId, arr);
  }
  return tabRows.map(t => ({
    id: t.id, key: t.key, label: t.label, icon: t.icon ?? null,
    isActive: t.isActive, position: t.position,
    sections: sectionsByTab.get(t.id) ?? [],
  }));
}

export async function replaceProjectFormLayout(organizationId: number, tabs: ProjectFormLayoutTabDTO[]): Promise<ProjectFormLayoutTabFull[]> {
  await db.transaction(async (tx) => {
    // Distinct advisory-lock key from intake's 0x494E544C ('INTL') — use 'PRFL'.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${0x5052464C}, ${organizationId})`);
    await tx.delete(_tabs).where(eq(_tabs.organizationId, organizationId));
    for (let ti = 0; ti < tabs.length; ti++) {
      const t = tabs[ti];
      const [tabRow] = await tx.insert(_tabs).values({
        organizationId, position: ti, key: t.key, label: t.label,
        icon: t.icon ?? null, isActive: t.isActive ?? true,
      }).returning();
      for (let si = 0; si < (t.sections ?? []).length; si++) {
        const s = t.sections[si];
        const [secRow] = await tx.insert(_sections).values({
          tabId: tabRow.id, position: si, title: s.title ?? null, description: s.description ?? null, width: s.width ?? "full",
        }).returning();
        const items = s.items ?? [];
        if (items.length > 0) {
          await tx.insert(_items).values(items.map((it, ii) => ({
            sectionId: secRow.id, position: ii, itemType: it.itemType, itemKey: it.itemKey, width: it.width ?? "full",
          })));
        }
      }
    }
  });
  return await getProjectFormLayout(organizationId);
}

function defaultsToDto(): ProjectFormLayoutTabDTO[] {
  return DEFAULT_PROJECT_FORM_TABS.map(t => ({
    key: t.key, label: t.label, icon: t.icon, isActive: true,
    sections: t.sections.map(s => ({
      title: s.title, description: s.description ?? null, width: s.width ?? "full",
      items: s.items.map(i => ({ itemType: i.itemType, itemKey: i.itemKey, width: i.width })),
    })),
  }));
}

export async function seedDefaultProjectFormLayoutIfMissing(organizationId: number): Promise<ProjectFormLayoutTabFull[]> {
  const existing = await getProjectFormLayout(organizationId);
  if (existing.length > 0) return existing;
  return await replaceProjectFormLayout(organizationId, defaultsToDto());
}

export async function resetProjectFormLayoutToDefaults(organizationId: number): Promise<ProjectFormLayoutTabFull[]> {
  return await replaceProjectFormLayout(organizationId, defaultsToDto());
}
