import { db } from "../db";
import {
  pmoComments,
  projectPmoComments,
  users,
  type PmoComment,
  type InsertPmoComment,
  type UpdatePmoComment,
} from "@shared/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export type PmoCommentWithUsers = PmoComment & {
  createdByName: string | null;
  updatedByName: string | null;
};

const userDisplay = (u: { firstName: string | null; lastName: string | null; email: string | null } | undefined): string | null => {
  if (!u) return null;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email || null;
};

async function enrich(rows: PmoComment[]): Promise<PmoCommentWithUsers[]> {
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

export async function listPmoCommentsForOrg(organizationId: number): Promise<PmoCommentWithUsers[]> {
  const rows = await db.select().from(pmoComments)
    .where(eq(pmoComments.organizationId, organizationId))
    .orderBy(desc(pmoComments.createdAt));
  return enrich(rows);
}

export async function listPmoCommentsForProject(projectId: number): Promise<PmoCommentWithUsers[]> {
  const rows = await db
    .select({ pc: pmoComments })
    .from(projectPmoComments)
    .innerJoin(pmoComments, eq(projectPmoComments.pmoCommentId, pmoComments.id))
    .where(eq(projectPmoComments.projectId, projectId))
    .orderBy(desc(pmoComments.createdAt));
  return enrich(rows.map(r => r.pc));
}

export async function getPmoComment(id: number): Promise<PmoComment | undefined> {
  const [row] = await db.select().from(pmoComments).where(eq(pmoComments.id, id));
  return row;
}

export async function createPmoCommentForProject(
  projectId: number,
  data: InsertPmoComment,
  userId: string,
): Promise<PmoCommentWithUsers> {
  return await db.transaction(async (tx) => {
    const [created] = await tx.insert(pmoComments)
      .values({ ...(data as any), createdBy: userId, updatedBy: userId })
      .returning();
    await tx.insert(projectPmoComments)
      .values({ projectId, pmoCommentId: created.id })
      .onConflictDoNothing();
    const [enriched] = await enrich([created]);
    return enriched;
  });
}

export async function linkPmoCommentToProject(projectId: number, pmoCommentId: number): Promise<void> {
  await db.insert(projectPmoComments)
    .values({ projectId, pmoCommentId })
    .onConflictDoNothing();
}

export async function unlinkPmoCommentFromProject(projectId: number, pmoCommentId: number): Promise<void> {
  await db.delete(projectPmoComments)
    .where(and(
      eq(projectPmoComments.projectId, projectId),
      eq(projectPmoComments.pmoCommentId, pmoCommentId),
    ));
}

export async function updatePmoComment(id: number, updates: UpdatePmoComment, userId: string): Promise<PmoCommentWithUsers | undefined> {
  const [updated] = await db.update(pmoComments)
    .set({ ...(updates as any), updatedBy: userId, updatedAt: new Date() })
    .where(eq(pmoComments.id, id))
    .returning();
  if (!updated) return undefined;
  const [enriched] = await enrich([updated]);
  return enriched;
}

export async function deletePmoComment(id: number): Promise<void> {
  await db.delete(pmoComments).where(eq(pmoComments.id, id));
}
