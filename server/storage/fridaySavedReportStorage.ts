import { db } from "../db";
import { fridaySavedReports } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

export interface SaveReportInput {
  organizationId: number;
  savedByUserId: string;
  title: string;
  subtitle?: string | null;
  generatedAt?: Date | null;
  html: string;
}

export async function createSavedReport(input: SaveReportInput) {
  const [row] = await db
    .insert(fridaySavedReports)
    .values({
      organizationId: input.organizationId,
      savedByUserId: input.savedByUserId,
      title: input.title.slice(0, 500),
      subtitle: input.subtitle ? input.subtitle.slice(0, 500) : null,
      generatedAt: input.generatedAt ?? null,
      html: input.html,
    })
    .returning();
  return row;
}

export async function listSavedReports(orgId: number, limit = 100) {
  return db
    .select({
      id: fridaySavedReports.id,
      organizationId: fridaySavedReports.organizationId,
      savedByUserId: fridaySavedReports.savedByUserId,
      title: fridaySavedReports.title,
      subtitle: fridaySavedReports.subtitle,
      generatedAt: fridaySavedReports.generatedAt,
      createdAt: fridaySavedReports.createdAt,
    })
    .from(fridaySavedReports)
    .where(eq(fridaySavedReports.organizationId, orgId))
    .orderBy(desc(fridaySavedReports.createdAt))
    .limit(limit);
}

export async function getSavedReport(id: number, orgId: number) {
  const [row] = await db
    .select()
    .from(fridaySavedReports)
    .where(
      and(
        eq(fridaySavedReports.id, id),
        eq(fridaySavedReports.organizationId, orgId),
      ),
    );
  return row;
}

export async function deleteSavedReport(id: number, orgId: number) {
  const [row] = await db
    .delete(fridaySavedReports)
    .where(
      and(
        eq(fridaySavedReports.id, id),
        eq(fridaySavedReports.organizationId, orgId),
      ),
    )
    .returning();
  return row;
}
