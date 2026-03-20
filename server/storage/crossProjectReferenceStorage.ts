import { db } from "../db";
import {
  crossProjectReferences,
  tasks,
  projects,
  type CrossProjectReference,
  type InsertCrossProjectReference,
} from "@shared/schema";
import { eq, and, or, desc } from "drizzle-orm";

async function enrichRef(ref: CrossProjectReference) {
  const [sourceProject, targetProject] = await Promise.all([
    db.select({ name: projects.name, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, ref.sourceProjectId)).then(r => r[0]),
    db.select({ name: projects.name, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, ref.targetProjectId)).then(r => r[0]),
  ]);

  let sourceName = sourceProject?.name;
  let targetName = targetProject?.name;

  if (ref.sourceType === "task") {
    const t = await db.select({ name: tasks.name }).from(tasks).where(eq(tasks.id, ref.sourceId)).then(r => r[0]);
    sourceName = t?.name;
  }

  if (ref.targetType === "task") {
    const t = await db.select({ name: tasks.name }).from(tasks).where(eq(tasks.id, ref.targetId)).then(r => r[0]);
    targetName = t?.name;
  }

  return {
    ...ref,
    sourceName,
    targetName,
    sourceProjectName: sourceProject?.name,
    targetProjectName: targetProject?.name,
  };
}

export async function getCrossProjectReferences(
  entityType: "task" | "project",
  entityId: number,
) {
  const refs = await db
    .select()
    .from(crossProjectReferences)
    .where(
      or(
        and(
          eq(crossProjectReferences.sourceType, entityType),
          eq(crossProjectReferences.sourceId, entityId),
        ),
        and(
          eq(crossProjectReferences.targetType, entityType),
          eq(crossProjectReferences.targetId, entityId),
        ),
      ),
    )
    .orderBy(desc(crossProjectReferences.createdAt));

  return Promise.all(refs.map(enrichRef));
}

export async function getCrossProjectReferencesByProject(projectId: number) {
  const refs = await db
    .select()
    .from(crossProjectReferences)
    .where(
      or(
        eq(crossProjectReferences.sourceProjectId, projectId),
        eq(crossProjectReferences.targetProjectId, projectId),
      ),
    )
    .orderBy(desc(crossProjectReferences.createdAt));

  return Promise.all(refs.map(enrichRef));
}

export async function createCrossProjectReference(
  data: InsertCrossProjectReference,
): Promise<CrossProjectReference> {
  const existing = await db
    .select({ id: crossProjectReferences.id })
    .from(crossProjectReferences)
    .where(
      and(
        eq(crossProjectReferences.organizationId, data.organizationId),
        eq(crossProjectReferences.sourceType, data.sourceType),
        eq(crossProjectReferences.sourceId, data.sourceId),
        eq(crossProjectReferences.targetType, data.targetType),
        eq(crossProjectReferences.targetId, data.targetId),
        eq(crossProjectReferences.relationshipType, data.relationshipType),
      ),
    )
    .then(r => r[0]);

  if (existing) {
    throw new Error("This reference already exists");
  }

  const [ref] = await db.insert(crossProjectReferences).values(data).returning();
  return ref;
}

export async function deleteCrossProjectReference(id: number): Promise<void> {
  await db.delete(crossProjectReferences).where(eq(crossProjectReferences.id, id));
}

export async function getCrossProjectReference(id: number): Promise<CrossProjectReference | undefined> {
  const [ref] = await db.select().from(crossProjectReferences).where(eq(crossProjectReferences.id, id));
  return ref;
}

export async function validateTaskBelongsToProject(taskId: number, projectId: number): Promise<boolean> {
  const task = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .then(r => r[0]);
  return !!task;
}
