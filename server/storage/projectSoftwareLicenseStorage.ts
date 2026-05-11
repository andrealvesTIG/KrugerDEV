import { db } from "../db";
import {
  projectSoftwareLicenses,
  users,
  type ProjectSoftwareLicense,
  type InsertProjectSoftwareLicense,
  type UpdateProjectSoftwareLicense,
} from "@shared/schema";
import { desc, eq, inArray } from "drizzle-orm";

export type ProjectSoftwareLicenseWithUsers = ProjectSoftwareLicense & {
  createdByName: string | null;
  updatedByName: string | null;
};

const userDisplay = (u: { firstName: string | null; lastName: string | null; email: string | null } | undefined): string | null => {
  if (!u) return null;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || null;
};

async function enrich(rows: ProjectSoftwareLicense[]): Promise<ProjectSoftwareLicenseWithUsers[]> {
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

export async function listProjectSoftwareLicenses(projectId: number): Promise<ProjectSoftwareLicenseWithUsers[]> {
  const rows = await db.select().from(projectSoftwareLicenses)
    .where(eq(projectSoftwareLicenses.projectId, projectId))
    .orderBy(desc(projectSoftwareLicenses.createdAt));
  return enrich(rows);
}

export async function getProjectSoftwareLicense(id: number): Promise<ProjectSoftwareLicense | undefined> {
  const [row] = await db.select().from(projectSoftwareLicenses).where(eq(projectSoftwareLicenses.id, id));
  return row;
}

export async function createProjectSoftwareLicense(data: InsertProjectSoftwareLicense, userId: string): Promise<ProjectSoftwareLicenseWithUsers> {
  const [created] = await db.insert(projectSoftwareLicenses)
    .values({ ...(data as any), createdBy: userId, updatedBy: userId })
    .returning();
  const [enriched] = await enrich([created]);
  return enriched;
}

export async function updateProjectSoftwareLicense(id: number, updates: UpdateProjectSoftwareLicense, userId: string): Promise<ProjectSoftwareLicenseWithUsers | undefined> {
  const [updated] = await db.update(projectSoftwareLicenses)
    .set({ ...(updates as any), updatedBy: userId, updatedAt: new Date() })
    .where(eq(projectSoftwareLicenses.id, id))
    .returning();
  if (!updated) return undefined;
  const [enriched] = await enrich([updated]);
  return enriched;
}

export async function deleteProjectSoftwareLicense(id: number): Promise<void> {
  await db.delete(projectSoftwareLicenses).where(eq(projectSoftwareLicenses.id, id));
}
