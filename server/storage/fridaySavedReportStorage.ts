import { db } from "../db";
import { fridaySavedReports } from "@shared/schema";
import { and, desc, eq, isNull, or, sql, gt } from "drizzle-orm";
import crypto from "crypto";

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
      shareToken: fridaySavedReports.shareToken,
      sharedAt: fridaySavedReports.sharedAt,
      sharedByUserId: fridaySavedReports.sharedByUserId,
      shareExpiresAt: fridaySavedReports.shareExpiresAt,
      shareRevokedAt: fridaySavedReports.shareRevokedAt,
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

// 32 random bytes → 64 hex chars. Long enough to be unguessable while still
// fitting comfortably in a URL.
function newShareToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface SetShareTokenInput {
  reportId: number;
  organizationId: number;
  sharedByUserId: string;
  expiresAt?: Date | null;
}

/**
 * Mint (or rotate) a public share token for a saved report. Each call
 * generates a fresh token, which automatically invalidates any link
 * previously copied for this report.
 */
export async function setShareToken(input: SetShareTokenInput) {
  const token = newShareToken();
  const [row] = await db
    .update(fridaySavedReports)
    .set({
      shareToken: token,
      sharedAt: new Date(),
      sharedByUserId: input.sharedByUserId,
      shareExpiresAt: input.expiresAt ?? null,
      shareRevokedAt: null,
    })
    .where(
      and(
        eq(fridaySavedReports.id, input.reportId),
        eq(fridaySavedReports.organizationId, input.organizationId),
      ),
    )
    .returning();
  return row;
}

/**
 * Revoke an existing share token. Clears the token (so the row can be
 * re-shared later with a fresh URL) and stamps the revocation time so the
 * UI can explain why an old link stopped working.
 */
export async function revokeShareToken(reportId: number, organizationId: number) {
  const [row] = await db
    .update(fridaySavedReports)
    .set({
      shareToken: null,
      shareRevokedAt: new Date(),
      shareExpiresAt: null,
    })
    .where(
      and(
        eq(fridaySavedReports.id, reportId),
        eq(fridaySavedReports.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}

/**
 * Look up a saved report by its public share token. Returns undefined when
 * the token is unknown, has been revoked, or has passed its expiry — the
 * route handler treats all three the same way (404 to the visitor) so we
 * don't leak whether a token ever existed.
 */
export async function getReportByShareToken(token: string) {
  if (!token || typeof token !== "string") return undefined;
  const now = new Date();
  const [row] = await db
    .select()
    .from(fridaySavedReports)
    .where(
      and(
        eq(fridaySavedReports.shareToken, token),
        isNull(fridaySavedReports.shareRevokedAt),
        or(
          isNull(fridaySavedReports.shareExpiresAt),
          gt(fridaySavedReports.shareExpiresAt, now),
        ),
      ),
    )
    .limit(1);
  return row;
}
