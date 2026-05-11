import { db } from "../db";
import {
  executiveSummaries,
  projectExecutiveSummaries,
  users,
  type ExecutiveSummary,
  type InsertExecutiveSummary,
  type UpdateExecutiveSummary,
} from "@shared/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export type ExecutiveSummaryWithUsers = ExecutiveSummary & {
  createdByName: string | null;
  updatedByName: string | null;
};

const userDisplay = (u: { firstName: string | null; lastName: string | null; email: string | null } | undefined): string | null => {
  if (!u) return null;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || null;
};

async function enrich(rows: ExecutiveSummary[]): Promise<ExecutiveSummaryWithUsers[]> {
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

export async function listExecutiveSummariesForOrg(organizationId: number): Promise<ExecutiveSummaryWithUsers[]> {
  const rows = await db.select().from(executiveSummaries)
    .where(eq(executiveSummaries.organizationId, organizationId))
    .orderBy(desc(executiveSummaries.createdAt));
  return enrich(rows);
}

export async function listExecutiveSummariesForProject(projectId: number): Promise<ExecutiveSummaryWithUsers[]> {
  const rows = await db
    .select({ es: executiveSummaries })
    .from(projectExecutiveSummaries)
    .innerJoin(executiveSummaries, eq(projectExecutiveSummaries.executiveSummaryId, executiveSummaries.id))
    .where(eq(projectExecutiveSummaries.projectId, projectId))
    .orderBy(desc(executiveSummaries.createdAt));
  return enrich(rows.map(r => r.es));
}

export async function getExecutiveSummary(id: number): Promise<ExecutiveSummary | undefined> {
  const [row] = await db.select().from(executiveSummaries).where(eq(executiveSummaries.id, id));
  return row;
}

export async function createExecutiveSummaryForProject(
  projectId: number,
  data: InsertExecutiveSummary,
  userId: string,
): Promise<ExecutiveSummaryWithUsers> {
  return await db.transaction(async (tx) => {
    const [created] = await tx.insert(executiveSummaries)
      .values({ ...(data as any), createdBy: userId, updatedBy: userId })
      .returning();
    await tx.insert(projectExecutiveSummaries)
      .values({ projectId, executiveSummaryId: created.id })
      .onConflictDoNothing();
    const [enriched] = await enrich([created]);
    return enriched;
  });
}

export async function linkExecutiveSummaryToProject(projectId: number, executiveSummaryId: number): Promise<void> {
  await db.insert(projectExecutiveSummaries)
    .values({ projectId, executiveSummaryId })
    .onConflictDoNothing();
}

export async function unlinkExecutiveSummaryFromProject(projectId: number, executiveSummaryId: number): Promise<void> {
  await db.delete(projectExecutiveSummaries)
    .where(and(
      eq(projectExecutiveSummaries.projectId, projectId),
      eq(projectExecutiveSummaries.executiveSummaryId, executiveSummaryId),
    ));
}

export async function updateExecutiveSummary(id: number, updates: UpdateExecutiveSummary, userId: string): Promise<ExecutiveSummaryWithUsers | undefined> {
  const [updated] = await db.update(executiveSummaries)
    .set({ ...(updates as any), updatedBy: userId, updatedAt: new Date() })
    .where(eq(executiveSummaries.id, id))
    .returning();
  if (!updated) return undefined;
  const [enriched] = await enrich([updated]);
  return enriched;
}

export async function deleteExecutiveSummary(id: number): Promise<void> {
  await db.delete(executiveSummaries).where(eq(executiveSummaries.id, id));
}
