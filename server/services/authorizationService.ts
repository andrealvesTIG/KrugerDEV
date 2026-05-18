/**
 * Authorization service — central permission resolution for the RBAC system.
 *
 * Concepts:
 *   - Permissions = stable string keys (see shared/permissionCatalog.ts).
 *   - Roles = org-scoped, hold a set of permissions.
 *   - Users hold zero or more roles per organization.
 *   - super_admin / marketing users (users.role) bypass all checks.
 *
 * Public surface used by routes:
 *   - getUserPermissions(userId, orgId) -> Set<string>
 *   - userHasPermission(userId, orgId, key)
 *   - requirePermission(key) -> express middleware
 *   - syncPermissionCatalog() — seed/refresh global permissions table.
 *   - seedDefaultRolesForOrg(orgId, ownerUserId?) — seed built-in roles +
 *     backfill user_roles from legacy organization_members.role values.
 *
 * In-request cache: a `req` may resolve the same permission many times for
 * the same user/org; we attach `req.__permCache` to memoise within a request.
 */

import type { Request, Response, NextFunction } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  permissions as permissionsTable,
  roles as rolesTable,
  rolePermissions as rolePermissionsTable,
  userRoles as userRolesTable,
  organizationMembers,
  users,
} from "@shared/schema";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@shared/permissionCatalog";
import { BUILTIN_ROLES, mapLegacyMemberRole } from "@shared/permissionDefaults";
import { getUserIdFromRequest, userHasOrgAccess } from "../routes/helpers";

/* ------------------------------------------------------------------ */
/* Catalog sync — runs on boot                                         */
/* ------------------------------------------------------------------ */

let catalogSynced = false;

export async function syncPermissionCatalog(): Promise<void> {
  // Upsert every permission row from the catalog. We rely on the unique
  // index on `key` for idempotency.
  for (const p of PERMISSION_CATALOG) {
    await db.insert(permissionsTable)
      .values({ key: p.key, area: p.area, label: p.label, description: p.description })
      .onConflictDoUpdate({
        target: permissionsTable.key,
        set: { area: p.area, label: p.label, description: p.description },
      });
  }
  catalogSynced = true;
}

/* ------------------------------------------------------------------ */
/* Per-org role seeding                                                */
/* ------------------------------------------------------------------ */

/**
 * Idempotently seed the 10 built-in roles into the org, refresh their
 * permission sets to match the latest defaults, then backfill `user_roles`
 * from any legacy `organization_members.role` rows that don't yet have a
 * mapped role assignment.
 *
 * Safe to call repeatedly on boot.
 */
export async function seedDefaultRolesForOrg(orgId: number): Promise<void> {
  // 1. Upsert built-in role rows.
  const builtInKeys = BUILTIN_ROLES.map(r => r.key);
  const existing = await db.select().from(rolesTable).where(eq(rolesTable.organizationId, orgId));
  const existingByKey = new Map(existing.map(r => [r.key, r] as const));

  for (const def of BUILTIN_ROLES) {
    const cur = existingByKey.get(def.key);
    if (!cur) {
      await db.insert(rolesTable).values({
        organizationId: orgId,
        key: def.key,
        name: def.name,
        description: def.description,
        isSystem: true,
      });
    } else if (!cur.isSystem) {
      // Promote a previously-created custom role with the same key to system.
      await db.update(rolesTable)
        .set({ isSystem: true, name: def.name, description: def.description })
        .where(eq(rolesTable.id, cur.id));
    }
  }

  // 2. Refresh role->permission rows for system roles only. Custom roles
  // (isSystem=false) are left alone — admins own them.
  const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.organizationId, orgId));
  for (const def of BUILTIN_ROLES) {
    const role = allRoles.find(r => r.key === def.key);
    if (!role) continue;
    const wantedSet = new Set(def.permissions);
    const have = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, role.id));
    const haveSet = new Set(have.map(rp => rp.permissionKey));

    const toAdd = [...wantedSet].filter(k => !haveSet.has(k));
    const toRemove = [...haveSet].filter(k => !wantedSet.has(k));
    if (toAdd.length > 0) {
      await db.insert(rolePermissionsTable).values(
        toAdd.map(permissionKey => ({ roleId: role.id, permissionKey })),
      ).onConflictDoNothing();
    }
    if (toRemove.length > 0) {
      await db.delete(rolePermissionsTable).where(
        and(eq(rolePermissionsTable.roleId, role.id), inArray(rolePermissionsTable.permissionKey, toRemove)),
      );
    }
  }

  // 3. Backfill user_roles from legacy organization_members.role for users
  // who don't yet have any role assignment in this org.
  const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, orgId));
  if (members.length === 0) return;
  const existingAssignments = await db.select().from(userRolesTable).where(eq(userRolesTable.organizationId, orgId));
  const haveByUser = new Set(existingAssignments.map(a => a.userId));
  const rolesByKey = new Map(allRoles.filter(r => builtInKeys.includes(r.key)).map(r => [r.key, r] as const));

  for (const m of members) {
    if (haveByUser.has(m.userId)) continue;
    const targetKey = mapLegacyMemberRole(m.role);
    const targetRole = rolesByKey.get(targetKey);
    if (!targetRole) continue;
    await db.insert(userRolesTable).values({
      organizationId: orgId,
      userId: m.userId,
      roleId: targetRole.id,
    }).onConflictDoNothing();
  }
}

/* ------------------------------------------------------------------ */
/* Effective permission resolution                                     */
/* ------------------------------------------------------------------ */

// Only the platform super_admin bypasses RBAC. `marketing` and other elevated
// users.role values do NOT get a blanket pass — they must be explicit org
// members and hold the right permissions.
const SUPER_USER_ROLES = new Set(["super_admin"]);

function reqCache(req: Request): Map<string, Set<string>> {
  const r = req as any;
  if (!r.__permCache) r.__permCache = new Map();
  return r.__permCache as Map<string, Set<string>>;
}

/**
 * Return the full set of permission keys the user effectively has in the
 * org. Super-admin / marketing users get the entire catalog.
 */
export async function getUserPermissions(
  userId: string,
  orgId: number,
  req?: Request,
): Promise<Set<string>> {
  const cacheKey = `${userId}::${orgId}`;
  if (req) {
    const c = reqCache(req);
    if (c.has(cacheKey)) return c.get(cacheKey)!;
  }

  // Super-admin bypass.
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (u && SUPER_USER_ROLES.has(u.role || "")) {
    const all = new Set(PERMISSION_KEYS);
    if (req) reqCache(req).set(cacheKey, all);
    return all;
  }

  // Pull all roles for the user in this org, then their permissions.
  const userRoleRows = await db.select({ roleId: userRolesTable.roleId })
    .from(userRolesTable)
    .where(and(
      eq(userRolesTable.userId, userId),
      eq(userRolesTable.organizationId, orgId),
    ));
  const roleIds = userRoleRows.map(r => r.roleId);
  if (roleIds.length === 0) {
    const empty = new Set<string>();
    if (req) reqCache(req).set(cacheKey, empty);
    return empty;
  }
  const permRows = await db.select({ permissionKey: rolePermissionsTable.permissionKey })
    .from(rolePermissionsTable)
    .where(inArray(rolePermissionsTable.roleId, roleIds));
  const out = new Set(permRows.map(r => r.permissionKey));
  if (req) reqCache(req).set(cacheKey, out);
  return out;
}

export async function userHasPermission(
  userId: string,
  orgId: number,
  permissionKey: string,
  req?: Request,
): Promise<boolean> {
  const perms = await getUserPermissions(userId, orgId, req);
  return perms.has(permissionKey);
}

/* ------------------------------------------------------------------ */
/* Express middleware                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build an Express middleware that requires the given permission. The
 * organization id is resolved from (in order): `req.params.orgId`,
 * `req.params.organizationId`, `req.body.organizationId`,
 * `req.query.organizationId`.
 *
 * On deny: 403 `{ message, code: 'FORBIDDEN_PERMISSION', required }`.
 */
export function requirePermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const orgIdRaw =
      (req.params as any).orgId ??
      (req.params as any).organizationId ??
      (req.body && (req.body as any).organizationId) ??
      (req.query as any).organizationId;
    const orgId = Number(orgIdRaw);
    if (!orgId || Number.isNaN(orgId)) {
      return res.status(400).json({ message: "organizationId is required" });
    }
    // Membership-first gate: a permission alone is not enough — the user
    // must currently be a member of (or admin over) the organization. This
    // keeps the existing org-access model as the foundation and stops stale
    // `user_roles` rows from granting access after a member is removed.
    if (!(await userHasOrgAccess(userId, orgId))) {
      return res.status(403).json({ message: "Access denied to this organization" });
    }
    const ok = await userHasPermission(userId, orgId, permissionKey, req);
    if (!ok) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
        code: "FORBIDDEN_PERMISSION",
        required: permissionKey,
      });
    }
    next();
  };
}

/** Manually assign a role to a user in an org (admin operation). */
export async function assignRoleToUser(orgId: number, userId: string, roleId: number, assignedBy?: string) {
  await db.insert(userRolesTable).values({
    organizationId: orgId,
    userId,
    roleId,
    assignedBy: assignedBy ?? null,
  }).onConflictDoNothing();
}

export async function removeRoleFromUser(orgId: number, userId: string, roleId: number) {
  await db.delete(userRolesTable).where(and(
    eq(userRolesTable.organizationId, orgId),
    eq(userRolesTable.userId, userId),
    eq(userRolesTable.roleId, roleId),
  ));
}

export function catalogIsSynced(): boolean {
  return catalogSynced;
}
