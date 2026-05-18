/**
 * Roles & Permissions admin API. Every endpoint except `/api/me/permissions`
 * requires the `roles.manage` permission (super-admin bypasses).
 */
import type { Express } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  roles as rolesTable,
  rolePermissions as rolePermissionsTable,
  userRoles as userRolesTable,
  permissions as permissionsTable,
  users,
} from "@shared/schema";
import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@shared/permissionCatalog";
import { BUILTIN_ROLES } from "@shared/permissionDefaults";
import {
  getUserPermissions,
  requirePermission,
  assignRoleToUser,
  removeRoleFromUser,
} from "../services/authorizationService";
import { getUserIdFromRequest, classifyError, validateUserInOrg } from "./helpers";
import { enforceMembership } from "../services/authorizationService";

export function registerRoleRoutes(app: Express) {
  // -------- /api/me/permissions ----------
  // Returns the current user's effective permissions in the requested org.
  app.get("/api/me/permissions", async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    const orgId = Number(req.query.organizationId);
    if (!orgId) {
      return res.json({ organizationId: null, permissions: [], catalog: PERMISSION_CATALOG });
    }
    if (await enforceMembership(req, res, userId, orgId)) return;
    const perms = await getUserPermissions(userId, orgId, req);
    res.json({
      organizationId: orgId,
      permissions: Array.from(perms),
      catalog: PERMISSION_CATALOG,
    });
  });

  // -------- Catalog ----------
  app.get("/api/permissions/catalog", async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ message: "Authentication required" });
    res.json(PERMISSION_CATALOG);
  });

  // -------- List roles in an org (with permission keys) ----------
  app.get(
    "/api/organizations/:orgId/roles",
    requirePermission("roles.view"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const orgRoles = await db.select().from(rolesTable).where(eq(rolesTable.organizationId, orgId));
        const ids = orgRoles.map(r => r.id);
        const permRows = ids.length > 0
          ? await db.select().from(rolePermissionsTable).where(inArray(rolePermissionsTable.roleId, ids))
          : [];
        const byRole = new Map<number, string[]>();
        for (const r of permRows) {
          (byRole.get(r.roleId) || byRole.set(r.roleId, []).get(r.roleId)!).push(r.permissionKey);
        }
        res.json(orgRoles.map(r => ({
          ...r,
          permissions: byRole.get(r.id) || [],
        })));
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // -------- Create a custom role ----------
  app.post(
    "/api/organizations/:orgId/roles",
    requirePermission("roles.manage"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const { key, name, description, permissions: permList } = req.body || {};
        if (!key || !name) return res.status(400).json({ message: "key and name are required" });
        if (!/^[a-z0-9_]+$/.test(String(key))) {
          return res.status(400).json({ message: "key must be snake_case (a-z, 0-9, _)" });
        }
        const wanted = Array.isArray(permList) ? permList.filter((p: string) => PERMISSION_KEYS.includes(p)) : [];
        const [created] = await db.insert(rolesTable).values({
          organizationId: orgId,
          key: String(key),
          name: String(name),
          description: description ? String(description) : null,
          isSystem: false,
        }).returning();
        if (wanted.length > 0) {
          await db.insert(rolePermissionsTable).values(
            wanted.map((permissionKey: string) => ({ roleId: created.id, permissionKey })),
          ).onConflictDoNothing();
        }
        res.status(201).json({ ...created, permissions: wanted });
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // -------- Update a role (name/desc + permission set replacement) ----------
  app.put(
    "/api/organizations/:orgId/roles/:roleId",
    requirePermission("roles.manage"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const roleId = Number(req.params.roleId);
        const [role] = await db.select().from(rolesTable).where(and(eq(rolesTable.id, roleId), eq(rolesTable.organizationId, orgId)));
        if (!role) return res.status(404).json({ message: "Role not found" });
        if (role.isSystem) {
          return res.status(400).json({
            message: "Built-in roles are read-only. Clone this role to make a customizable copy.",
            code: "BUILTIN_ROLE_IMMUTABLE",
          });
        }

        const { name, description, permissions: permList } = req.body || {};
        const updates: any = { updatedAt: new Date() };
        if (typeof name === "string" && name.trim()) updates.name = name.trim();
        if (typeof description === "string") updates.description = description;
        await db.update(rolesTable).set(updates).where(eq(rolesTable.id, roleId));

        if (Array.isArray(permList)) {
          const wanted = new Set(permList.filter((p: string) => PERMISSION_KEYS.includes(p)));
          const current = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
          const have = new Set(current.map(r => r.permissionKey));
          const toAdd = [...wanted].filter(k => !have.has(k));
          const toRemove = [...have].filter(k => !wanted.has(k));
          if (toAdd.length > 0) {
            await db.insert(rolePermissionsTable).values(
              toAdd.map(permissionKey => ({ roleId, permissionKey })),
            ).onConflictDoNothing();
          }
          for (const k of toRemove) {
            await db.delete(rolePermissionsTable).where(and(
              eq(rolePermissionsTable.roleId, roleId),
              eq(rolePermissionsTable.permissionKey, k),
            ));
          }
        }
        const fresh = await db.select().from(rolesTable).where(eq(rolesTable.id, roleId));
        const perms = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
        res.json({ ...fresh[0], permissions: perms.map(p => p.permissionKey) });
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // -------- Delete a custom role ----------
  app.delete(
    "/api/organizations/:orgId/roles/:roleId",
    requirePermission("roles.manage"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const roleId = Number(req.params.roleId);
        const [role] = await db.select().from(rolesTable).where(and(eq(rolesTable.id, roleId), eq(rolesTable.organizationId, orgId)));
        if (!role) return res.status(404).json({ message: "Role not found" });
        if (role.isSystem) {
          return res.status(400).json({ message: "Built-in roles cannot be deleted" });
        }
        await db.delete(rolesTable).where(eq(rolesTable.id, roleId));
        res.status(204).end();
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // -------- Clone a role (typically a built-in) into a new custom role ----------
  app.post(
    "/api/organizations/:orgId/roles/:roleId/clone",
    requirePermission("roles.manage"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const roleId = Number(req.params.roleId);
        const [source] = await db.select().from(rolesTable).where(and(eq(rolesTable.id, roleId), eq(rolesTable.organizationId, orgId)));
        if (!source) return res.status(404).json({ message: "Role not found" });
        const { name, key } = req.body || {};
        if (!name || !key) return res.status(400).json({ message: "name and key are required" });
        if (!/^[a-z0-9_]+$/.test(String(key))) {
          return res.status(400).json({ message: "key must be snake_case (a-z, 0-9, _)" });
        }
        const [created] = await db.insert(rolesTable).values({
          organizationId: orgId,
          key: String(key),
          name: String(name),
          description: source.description,
          isSystem: false,
        }).returning();
        const sourcePerms = await db.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, source.id));
        if (sourcePerms.length > 0) {
          await db.insert(rolePermissionsTable).values(
            sourcePerms.map(p => ({ roleId: created.id, permissionKey: p.permissionKey })),
          ).onConflictDoNothing();
        }
        res.status(201).json({ ...created, permissions: sourcePerms.map(p => p.permissionKey) });
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // -------- Member -> roles ----------
  // List a user's role assignments in the org.
  app.get(
    "/api/organizations/:orgId/members/:userId/roles",
    requirePermission("roles.view"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const targetUserId = String(req.params.userId);
        const rows = await db.select().from(userRolesTable).where(and(
          eq(userRolesTable.organizationId, orgId),
          eq(userRolesTable.userId, targetUserId),
        ));
        res.json(rows);
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // Replace a user's role set in the org.
  app.put(
    "/api/organizations/:orgId/members/:userId/roles",
    requirePermission("roles.manage"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const targetUserId = String(req.params.userId);
        const { roleIds } = req.body || {};
        if (!Array.isArray(roleIds)) {
          return res.status(400).json({ message: "roleIds must be an array" });
        }
        // Refuse to grant roles to a user who is not a member of this org —
        // role assignment must not become a side-door around organization
        // membership.
        const isMember = await validateUserInOrg(targetUserId, orgId);
        if (!isMember) {
          return res.status(400).json({
            message: "Target user is not a member of this organization. Add them as a member first.",
          });
        }
        const numericIds: number[] = roleIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
        // Validate that all the role IDs belong to this org.
        const orgRoles = await db.select().from(rolesTable).where(eq(rolesTable.organizationId, orgId));
        const validIds = new Set(orgRoles.map(r => r.id));
        for (const id of numericIds) {
          if (!validIds.has(id)) {
            return res.status(400).json({ message: `Role ${id} does not belong to this organization` });
          }
        }
        const actorId = getUserIdFromRequest(req)!;
        const current = await db.select().from(userRolesTable).where(and(
          eq(userRolesTable.organizationId, orgId),
          eq(userRolesTable.userId, targetUserId),
        ));
        const currentSet = new Set(current.map(r => r.roleId));
        const wantedSet = new Set(numericIds);
        for (const id of numericIds) {
          if (!currentSet.has(id)) await assignRoleToUser(orgId, targetUserId, id, actorId);
        }
        for (const id of currentSet) {
          if (!wantedSet.has(id)) await removeRoleFromUser(orgId, targetUserId, id);
        }
        const fresh = await db.select().from(userRolesTable).where(and(
          eq(userRolesTable.organizationId, orgId),
          eq(userRolesTable.userId, targetUserId),
        ));
        res.json(fresh);
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // -------- List org members with their assigned roles (for admin UI) ----------
  app.get(
    "/api/organizations/:orgId/role-assignments",
    requirePermission("roles.view"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const rows = await db.select().from(userRolesTable).where(eq(userRolesTable.organizationId, orgId));
        res.json(rows);
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );

  // -------- Reset built-in roles to defaults ----------
  app.post(
    "/api/organizations/:orgId/roles/reset-defaults",
    requirePermission("roles.manage"),
    async (req, res) => {
      try {
        const orgId = Number(req.params.orgId);
        const { seedDefaultRolesForOrg } = await import("../services/authorizationService");
        await seedDefaultRolesForOrg(orgId);
        res.json({ ok: true });
      } catch (err) {
        const c = classifyError(err);
        res.status(c.status).json({ message: c.message });
      }
    },
  );
}
