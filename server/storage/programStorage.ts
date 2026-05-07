import { db } from "../db";
import {
  programs, projects,
  type Program, type InsertProgram, type UpdateProgramRequest,
} from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

export async function getPrograms(organizationId?: number): Promise<Program[]> {
  if (organizationId) {
    return await db.select().from(programs).where(
      and(eq(programs.organizationId, organizationId), isNull(programs.deletedAt))
    );
  }
  return await db.select().from(programs).where(isNull(programs.deletedAt));
}

export async function getProgram(id: number): Promise<Program | undefined> {
  const [program] = await db.select().from(programs).where(
    and(eq(programs.id, id), isNull(programs.deletedAt))
  );
  return program;
}

export async function createProgram(program: InsertProgram): Promise<Program> {
  const [created] = await db.insert(programs).values(program as any).returning();
  return created;
}

export async function updateProgram(id: number, updates: UpdateProgramRequest): Promise<Program> {
  const [updated] = await db.update(programs)
    .set({ ...(updates as any), updatedAt: new Date() })
    .where(eq(programs.id, id))
    .returning();
  return updated;
}

export async function deleteProgram(id: number, deletedBy?: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(projects).set({ programId: null }).where(eq(projects.programId, id));
    await tx.update(programs)
      .set({ deletedAt: new Date(), deletedBy: deletedBy ?? null })
      .where(eq(programs.id, id));
  });
}

export async function getProgramProjects(programId: number): Promise<(typeof projects.$inferSelect)[]> {
  return await db.select().from(projects).where(
    and(eq(projects.programId, programId), isNull(projects.deletedAt))
  );
}

export async function setProgramProjects(programId: number, projectIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    // Detach all currently attached projects from this program
    await tx.update(projects)
      .set({ programId: null })
      .where(eq(projects.programId, programId));
    // Attach the requested projects
    if (projectIds.length > 0) {
      await tx.update(projects)
        .set({ programId })
        .where(inArray(projects.id, projectIds));
    }
  });
}

export async function addProjectToProgram(programId: number, projectId: number): Promise<void> {
  await db.update(projects)
    .set({ programId })
    .where(eq(projects.id, projectId));
}

export async function removeProjectFromProgram(projectId: number): Promise<void> {
  await db.update(projects)
    .set({ programId: null })
    .where(eq(projects.id, projectId));
}
