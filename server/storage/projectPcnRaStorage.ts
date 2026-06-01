import { db } from "../db";
import {
  projectPcnsRas,
  users,
  type ProjectPcnRa,
  type InsertProjectPcnRa,
  type UpdateProjectPcnRa,
} from "@shared/schema";
import { desc, eq, inArray } from "drizzle-orm";

export type ProjectPcnRaWithUsers = ProjectPcnRa & {
  createdByName: string | null;
  updatedByName: string | null;
};

const userDisplay = (u: { firstName: string | null; lastName: string | null; email: string | null } | undefined): string | null => {
  if (!u) return null;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || null;
};

async function enrich(rows: ProjectPcnRa[]): Promise<ProjectPcnRaWithUsers[]> {
  const ids = new Set<string>();
  rows.forEach(r => { if (r.createdBy) ids.add(r.createdBy); if (r.updatedBy) ids.add(r.updatedBy); });
  if (ids.size === 0) return rows.map(r => ({ ...r, createdByName: null, updatedByName: null }));
  const userRows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(inArray(users.id, Array.from(ids)));
  const byId = new Map(userRows.map(u => [u.id, u]));
  return rows.map(r => ({
    ...r,
    createdByName: r.createdBy ? userDisplay(byId.get(r.createdBy)) : null,
    updatedByName: r.updatedBy ? userDisplay(byId.get(r.updatedBy)) : null,
  }));
}

export async function listProjectPcnsRas(projectId: number): Promise<ProjectPcnRaWithUsers[]> {
  const rows = await db.select().from(projectPcnsRas)
    .where(eq(projectPcnsRas.projectId, projectId))
    .orderBy(desc(projectPcnsRas.year), desc(projectPcnsRas.createdAt));
  return enrich(rows);
}

export async function getProjectPcnRa(id: number): Promise<ProjectPcnRa | undefined> {
  const [row] = await db.select().from(projectPcnsRas).where(eq(projectPcnsRas.id, id));
  return row;
}

export async function createProjectPcnRa(data: InsertProjectPcnRa, userId: string): Promise<ProjectPcnRaWithUsers> {
  const [created] = await db.insert(projectPcnsRas)
    .values({ ...(data as any), createdBy: userId, updatedBy: userId })
    .returning();
  const [enriched] = await enrich([created]);
  return enriched;
}

export async function updateProjectPcnRa(id: number, updates: UpdateProjectPcnRa, userId: string): Promise<ProjectPcnRaWithUsers | undefined> {
  const [updated] = await db.update(projectPcnsRas)
    .set({ ...(updates as any), updatedBy: userId, updatedAt: new Date() })
    .where(eq(projectPcnsRas.id, id))
    .returning();
  if (!updated) return undefined;
  const [enriched] = await enrich([updated]);
  return enriched;
}

export async function deleteProjectPcnRa(id: number): Promise<void> {
  await db.delete(projectPcnsRas).where(eq(projectPcnsRas.id, id));
}
