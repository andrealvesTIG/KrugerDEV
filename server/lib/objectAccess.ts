import { db } from "../db";
import { objectUploads, organizationMembers, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Record an upload's owner so subsequent /objects GETs can be tenant-scoped.
 * Idempotent on `objectPath` — re-issuing a request URL for the same path
 * (rare; e.g. retries) updates uploader+org rather than failing.
 */
export async function recordObjectUpload(args: {
  objectPath: string;
  uploadedBy: string;
  organizationId?: number | null;
}): Promise<void> {
  // Throws on failure. Upstream callers must fail the upload-URL allocation
  // if metadata can't be persisted — otherwise the resulting object would be
  // unreadable through `canUserAccessObject` (deny-by-default) and we'd be
  // handing the user a path they can never fetch.
  await db.insert(objectUploads).values({
    objectPath: args.objectPath,
    uploadedBy: args.uploadedBy,
    organizationId: args.organizationId ?? null,
  }).onConflictDoUpdate({
    target: objectUploads.objectPath,
    set: { uploadedBy: args.uploadedBy, organizationId: args.organizationId ?? null },
  });
}

export async function getObjectUpload(objectPath: string) {
  try {
    const [row] = await db.select().from(objectUploads).where(eq(objectUploads.objectPath, objectPath));
    return row;
  } catch (err) {
    // Defensive: a deploy that hasn't run `db:push` yet won't have the
    // table. Treat as "no metadata" so legacy uploads keep serving while
    // surfacing the boot-time schema drift check separately.
    console.error("[objectAccess] getObjectUpload failed (table missing?):", err);
    return undefined;
  }
}

/**
 * Stamp an organisation id on an object's metadata row when the file is first
 * bound to an entity in that organisation. Won't downgrade an existing
 * binding to a different organisation — that surfaces as an error to the
 * caller.
 */
export async function bindObjectToOrganization(objectPath: string, organizationId: number): Promise<{ ok: true } | { ok: false; reason: "missing" | "cross_org" }> {
  const row = await getObjectUpload(objectPath);
  if (!row) return { ok: false, reason: "missing" };
  if (row.organizationId != null && row.organizationId !== organizationId) {
    return { ok: false, reason: "cross_org" };
  }
  if (row.organizationId == null) {
    await db.update(objectUploads).set({ organizationId }).where(eq(objectUploads.objectPath, objectPath));
  }
  return { ok: true };
}

/**
 * Returns true when `userId` is allowed to read the file at `objectPath`.
 * Rules:
 *   - Super admins bypass.
 *   - If we have no metadata row, deny (deny-by-default — no cross-tenant
 *     read of unrecorded files). Upstream code SHOULD record every upload
 *     via `recordObjectUpload`; a missing row indicates either a legacy
 *     pre-hotfix upload or an attempt to fetch a path that never went
 *     through our request-url flow. Either way we refuse.
 *   - Otherwise require either uploader match or membership in the bound org.
 */
export async function canUserAccessObject(userId: string, objectPath: string): Promise<boolean> {
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (u?.role === "super_admin") return true;
  const row = await getObjectUpload(objectPath);
  if (!row) return false;
  if (row.uploadedBy === userId) return true;
  if (row.organizationId != null) {
    const [m] = await db.select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, row.organizationId)));
    if (m) return true;
  }
  return false;
}
