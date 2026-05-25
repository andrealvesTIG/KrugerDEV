/**
 * Authorization service — central permission resolution for the RBAC system.
 *
 * Concepts:
 *   - Permissions = stable string keys (see shared/permissionCatalog.ts).
 *   - Roles = org-scoped, hold a set of permissions.
 *   - Users hold zero or more roles per organization.
 *   - super_admin users (users.role) bypass all checks. No other platform
 *     role grants a global bypass.
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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
import { getUserIdFromRequest } from "../routes/helpers";

/**
 * Strict membership check used by `requirePermission`. Unlike
 * `helpers.userHasOrgAccess`, this does NOT honour the legacy
 * `marketing` platform-role bypass — only `super_admin` may transcend
 * org membership, and that branch is handled separately in
 * `userHasPermission`. Looks up an active (non-deleted) row in
 * `organization_members`.
 */
async function userIsSuperAdmin(userId: string, req?: Request): Promise<boolean> {
  if (req) {
    const cache = reqCache(req);
    const cached = (cache as any).__superAdmin?.get(userId);
    if (cached !== undefined) return cached;
  }
  const [u] = await db.select({ role: users.role, deactivatedAt: users.deactivatedAt })
    .from(users).where(eq(users.id, userId));
  // Deactivated user accounts can never be super-admin, even if their
  // `users.role` still says so — the deactivation gate wins.
  const result = !!u && !u.deactivatedAt && SUPER_USER_ROLES.has(String(u.role));
  if (req) {
    const cache = reqCache(req);
    if (!(cache as any).__superAdmin) (cache as any).__superAdmin = new Map();
    (cache as any).__superAdmin.set(userId, result);
  }
  return result;
}

/**
 * Confirm the user account still exists and has not been deactivated.
 * Memoised onto the per-request permission cache so the same request only
 * does one lookup. Returns `false` when the user row is missing or
 * `deactivatedAt` is set — callers must treat that as a hard deny.
 */
export async function assertUserStillActive(userId: string, req?: Request): Promise<boolean> {
  if (req) {
    const cache = reqCache(req);
    const map: Map<string, boolean> | undefined = (cache as any).__activeUser;
    if (map?.has(userId)) return map.get(userId)!;
  }
  const [u] = await db.select({ id: users.id, deactivatedAt: users.deactivatedAt })
    .from(users).where(eq(users.id, userId));
  const result = !!u && !u.deactivatedAt;
  if (req) {
    const cache = reqCache(req);
    if (!(cache as any).__activeUser) (cache as any).__activeUser = new Map<string, boolean>();
    (cache as any).__activeUser.set(userId, result);
  }
  return result;
}

async function userIsOrgMember(userId: string, orgId: number, req?: Request): Promise<boolean> {
  // Active user check first — a deactivated user is never a member of any
  // org for RBAC purposes, even if their membership row is intact.
  if (!(await assertUserStillActive(userId, req))) return false;
  const rows = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, orgId),
        isNull(organizationMembers.deletedAt),
      ),
    );
  return rows.length > 0;
}

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

  // Track which built-in roles we just created in *this* run so we only
  // seed default permissions for them. Previously-existing rows — whether
  // admins have edited them down to a smaller set, an empty set, or left
  // them at the defaults — are left strictly alone. This is the only
  // safe rule that survives the "admin edited to empty permissions" edge
  // case (which a "skip when role_permissions is empty" heuristic would
  // wrongly reseed on the next boot).
  const newlyCreatedKeys = new Set<string>();
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
      newlyCreatedKeys.add(def.key);
    } else if (!cur.isSystem) {
      // Promote a previously-created custom role with the same key to system.
      await db.update(rolesTable)
        .set({ isSystem: true, name: def.name, description: def.description })
        .where(eq(rolesTable.id, cur.id));
    }
  }

  // 2. Seed role->permission rows ONLY for built-in roles inserted by
  // this exact invocation (`newlyCreatedKeys`). Custom roles
  // (isSystem=false) were already left alone above; previously-existing
  // built-in roles are never touched so admin edits — including
  // deliberately empty permission sets — survive every subsequent boot.
  const allRoles = await db.select().from(rolesTable).where(eq(rolesTable.organizationId, orgId));
  for (const def of BUILTIN_ROLES) {
    if (!newlyCreatedKeys.has(def.key)) continue;
    const role = allRoles.find(r => r.key === def.key);
    if (!role) continue;
    if (def.permissions.length === 0) continue;
    await db.insert(rolePermissionsTable).values(
      def.permissions.map(permissionKey => ({ roleId: role.id, permissionKey })),
    ).onConflictDoNothing();
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
 * org. Platform super_admin users get the entire catalog.
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

  // Active-user gate: a deactivated account has zero effective permissions
  // anywhere in the system, even if it still holds super_admin on users.role
  // or has user_roles rows lingering in an org.
  if (!(await assertUserStillActive(userId, req))) {
    const empty = new Set<string>();
    if (req) reqCache(req).set(cacheKey, empty);
    return empty;
  }

  // Super-admin bypass.
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (u && SUPER_USER_ROLES.has(u.role || "")) {
    const all = new Set(PERMISSION_KEYS);
    if (req) reqCache(req).set(cacheKey, all);
    return all;
  }

  // Membership gate: a user with no active row in organization_members for
  // this org has no permissions in it, even if user_roles still holds an
  // assignment (e.g. they were soft-deleted from the org).
  if (!(await userIsOrgMember(userId, orgId, req))) {
    const empty = new Set<string>();
    if (req) reqCache(req).set(cacheKey, empty);
    return empty;
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
    // Platform super_admin can bypass everything (membership included).
    // We resolve this via the cached permission lookup, which returns the
    // full catalog for super_admin.
    const ok = await userHasPermission(userId, orgId, permissionKey, req);

    // Membership-first gate: even if a stale `user_roles` row would grant
    // the permission, the user must currently be a member of the org.
    // super_admin still gets through because their bypass is computed
    // without touching organization_members (they only need `ok=true`).
    const isSuperAdmin = await userIsSuperAdmin(userId, req);
    if (!isSuperAdmin) {
      if (!(await userIsOrgMember(userId, orgId, req))) {
        return res.status(403).json({ message: "Access denied to this organization" });
      }
    } else if (!(await userIsOrgMember(userId, orgId, req))) {
      // Structured audit trail when a super_admin acts on a tenant they
      // are NOT a member of. Mutating routes show up here too — grep for
      // `[super-admin-override]` to review.
      console.warn('[super-admin-override]', JSON.stringify({
        userId, orgId, permissionKey,
        method: req.method, path: (req as any).originalUrl || req.url,
        at: new Date().toISOString(),
      }));
    }

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

/**
 * Inline equivalent of `requirePermission` for routes that already loaded
 * the org id from a related entity (e.g. fetched a program first). Sends
 * the 401/403 response itself and returns `true` when the request should
 * stop processing. Returns `false` to indicate "all good, continue".
 */
export async function enforcePermission(
  req: Request,
  res: Response,
  userId: string | undefined,
  orgId: number,
  permissionKey: string,
): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return true;
  }
  const ok = await userHasPermission(userId, orgId, permissionKey, req);
  const isSuperAdmin = await userIsSuperAdmin(userId, req);
  if (!isSuperAdmin) {
    if (!(await userIsOrgMember(userId, orgId, req))) {
      res.status(403).json({ message: "Access denied to this organization" });
      return true;
    }
  } else if (!(await userIsOrgMember(userId, orgId, req))) {
    console.warn('[super-admin-override]', JSON.stringify({
      userId, orgId, permissionKey,
      method: req.method, path: (req as any).originalUrl || req.url,
      at: new Date().toISOString(),
    }));
  }
  if (!ok) {
    res.status(403).json({
      message: "You do not have permission to perform this action.",
      code: "FORBIDDEN_PERMISSION",
      required: permissionKey,
    });
    return true;
  }
  return false;
}

/**
 * Strict membership-only gate (no permission check). Used by read endpoints
 * like `/api/me/permissions` that just need to confirm the caller belongs
 * to the org without honouring the legacy `marketing` platform bypass.
 */
export async function enforceMembership(
  req: Request,
  res: Response,
  userId: string | undefined,
  orgId: number,
): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return true;
  }
  if (!(await assertUserStillActive(userId, req))) {
    res.status(401).json({ message: "Account is deactivated" });
    return true;
  }
  if (await userIsSuperAdmin(userId, req)) return false;
  if (!(await userIsOrgMember(userId, orgId, req))) {
    res.status(403).json({ message: "Access denied to this organization" });
    return true;
  }
  return false;
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
