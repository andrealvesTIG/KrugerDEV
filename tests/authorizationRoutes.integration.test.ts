/**
 * Integration test suite for the permission middleware as it is actually
 * mounted on the roles router. Unlike `authorizationMiddleware.test.ts`,
 * which exercises `requirePermission` against a synthetic two-route app
 * with a barebones db stub, this file:
 *
 *   - Mounts the real `registerRoleRoutes` onto an in-memory Express app.
 *   - Uses a stateful in-memory fake db so we can exercise the multi-step
 *     handler paths (membership lookup, role assignment validation, etc.)
 *     and verify `seedDefaultRolesForOrg` is genuinely idempotent across
 *     repeated boot cycles.
 *
 * Covered cases:
 *   - Unauthenticated request → 401
 *   - Non-numeric organizationId in the URL → 400
 *   - Member without the required permission → 403 with
 *     `code: 'FORBIDDEN_PERMISSION'` and `required: '<perm>'`
 *   - super_admin bypasses both the membership and permission gates → 200
 *   - PUT /members/:userId/roles rejects assignment to a user who is not
 *     a member of the org (the documented "no side-door around membership"
 *     guard in `roleRoutes.ts`).
 *   - `seedDefaultRolesForOrg` is a no-op on the second invocation
 *     (no extra inserts/updates/deletes; legacy member backfill happens
 *     exactly once).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import * as schema from "@shared/schema";
import { BUILTIN_ROLES } from "@shared/permissionDefaults";

// ---------------------------------------------------------------------------
// Mock drizzle-orm operators so the fake db can introspect WHERE predicates.
// pgTable / column builders are preserved from the real module so the schema
// import keeps working.
// ---------------------------------------------------------------------------
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<any>("drizzle-orm");
  return {
    ...actual,
    eq: (col: any, val: any) => ({ __op: "eq", col, val }),
    and: (...args: any[]) => ({ __op: "and", args: args.filter(Boolean) }),
    inArray: (col: any, vals: any[]) => ({ __op: "inArray", col, vals }),
    isNull: (col: any) => ({ __op: "isNull", col }),
    isNotNull: (col: any) => ({ __op: "isNotNull", col }),
    sql: Object.assign(
      (..._args: any[]) => ({ __op: "sql" }),
      { raw: (..._args: any[]) => ({ __op: "sql" }) },
    ),
  };
});

// ---------------------------------------------------------------------------
// In-memory fake db keyed by drizzle table reference.
// ---------------------------------------------------------------------------
const state = new Map<any, any[]>();
let nextRoleId = 1;

function rowsFor(table: any): any[] {
  if (!state.has(table)) state.set(table, []);
  return state.get(table)!;
}

// Drizzle column `.name` is the SQL column name (e.g. `organization_id`).
// Our in-memory rows use the schema's JS property names (e.g.
// `organizationId`). Resolve a column to its JS key on the parent table.
const colKeyCache = new WeakMap<any, string>();
function jsKey(col: any): string {
  const cached = colKeyCache.get(col);
  if (cached) return cached;
  const table = col?.table;
  if (table) {
    for (const [k, v] of Object.entries(table)) {
      if (v === col) {
        colKeyCache.set(col, k);
        return k;
      }
    }
  }
  return col?.name;
}

function evalPred(pred: any, row: any): boolean {
  if (pred == null) return true;
  if (pred.__op === "eq") return row[jsKey(pred.col)] === pred.val;
  if (pred.__op === "inArray") return pred.vals.includes(row[jsKey(pred.col)]);
  if (pred.__op === "isNull") return row[jsKey(pred.col)] == null;
  if (pred.__op === "isNotNull") return row[jsKey(pred.col)] != null;
  if (pred.__op === "and") return pred.args.every((p: any) => evalPred(p, row));
  return true;
}

function project(fields: any, rows: any[]): any[] {
  if (!fields) return rows.map(r => ({ ...r }));
  return rows.map(r => {
    const out: any = {};
    for (const [k, col] of Object.entries(fields)) {
      out[k] = r[jsKey(col)];
    }
    return out;
  });
}

const insertSpy = vi.fn();
const updateSpy = vi.fn();
const deleteSpy = vi.fn();

const fakeDb: any = {
  select: (fields?: any) => ({
    from: (table: any) => {
      const exec = (pred?: any) =>
        Promise.resolve(project(fields, rowsFor(table).filter(r => evalPred(pred, r))));
      const thenable: any = {
        where: (pred: any) => exec(pred),
        then: (resolve: any, reject: any) => exec().then(resolve, reject),
      };
      return thenable;
    },
  }),
  insert: (table: any) => ({
    values: (vals: any) => {
      const arr = Array.isArray(vals) ? vals : [vals];
      const inserted: any[] = [];
      for (const v of arr) {
        const row: any = { ...v };
        if (table === schema.roles && row.id == null) row.id = nextRoleId++;
        rowsFor(table).push(row);
        inserted.push(row);
        insertSpy(table, row);
      }
      const op: any = {
        onConflictDoNothing: () => Promise.resolve(),
        onConflictDoUpdate: () => Promise.resolve(),
        returning: () => Promise.resolve(inserted.map(r => ({ ...r }))),
        then: (resolve: any, reject: any) =>
          Promise.resolve(inserted).then(resolve, reject),
      };
      return op;
    },
  }),
  update: (table: any) => ({
    set: (updates: any) => ({
      where: (pred: any) => {
        const matches = rowsFor(table).filter(r => evalPred(pred, r));
        for (const m of matches) {
          Object.assign(m, updates);
          updateSpy(table, m);
        }
        return Promise.resolve();
      },
    }),
  }),
  delete: (table: any) => ({
    where: (pred: any) => {
      const all = rowsFor(table);
      const keep: any[] = [];
      for (const r of all) {
        if (evalPred(pred, r)) deleteSpy(table, r);
        else keep.push(r);
      }
      state.set(table, keep);
      return Promise.resolve();
    },
  }),
};

vi.mock("../server/db", () => ({
  db: fakeDb,
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

vi.mock("../server/routes/helpers", () => ({
  getUserIdFromRequest: (req: any) =>
    req.headers["x-test-user-id"] as string | undefined,
  classifyError: (e: any) => ({ status: 500, message: String(e) }),
  validateUserInOrg: async (userId: string, orgId: number) => {
    return rowsFor(schema.organizationMembers).some(
      r => r.userId === userId && r.organizationId === orgId,
    );
  },
}));

// Imports must come AFTER vi.mock setup so they see the mocked db/helpers.
const { registerRoleRoutes } = await import("../server/routes/roleRoutes");
const { seedDefaultRolesForOrg, requirePermission } = await import(
  "../server/services/authorizationService"
);

function buildApp() {
  const app = express();
  app.use(express.json());
  registerRoleRoutes(app);
  return app;
}

beforeEach(() => {
  state.clear();
  nextRoleId = 1;
  insertSpy.mockReset();
  updateSpy.mockReset();
  deleteSpy.mockReset();
});

describe("registerRoleRoutes — permission middleware integration", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    const app = buildApp();
    const r = await request(app).get("/api/organizations/5/roles");
    expect(r.status).toBe(401);
  });

  it("returns 400 when the organizationId in the URL is not numeric", async () => {
    rowsFor(schema.users).push({ id: "u1", role: null });
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/not-a-number/roles")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(400);
    expect(String(r.body.message || "")).toMatch(/organizationId/i);
  });

  it("returns 403 FORBIDDEN_PERMISSION when an org member lacks the required permission", async () => {
    rowsFor(schema.users).push({ id: "u1", role: null });
    rowsFor(schema.organizationMembers).push({
      id: 1,
      userId: "u1",
      organizationId: 5,
    });
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/roles")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN_PERMISSION");
    expect(r.body.required).toBe("roles.view");
  });

  it("returns 403 when a previously-active member has been soft-deleted from the org", async () => {
    // User exists and was an org member, but their membership row now has
    // a non-null deletedAt. RBAC must treat them as a non-member, even
    // if user_roles still grants the permission — that's the whole point
    // of the soft-delete revocation flow.
    rowsFor(schema.users).push({ id: "ex", role: null, deactivatedAt: null });
    rowsFor(schema.organizationMembers).push({
      id: 1,
      userId: "ex",
      organizationId: 5,
      role: "member",
      deletedAt: new Date(),
      deletedBy: "admin",
    });
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "auditor",
      name: "Auditor",
      isSystem: false,
    });
    rowsFor(schema.rolePermissions).push({ roleId: 1, permissionKey: "roles.view" });
    rowsFor(schema.userRoles).push({ organizationId: 5, userId: "ex", roleId: 1 });
    nextRoleId = 2;

    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/roles")
      .set("x-test-user-id", "ex");
    expect(r.status).toBe(403);
    // Membership gate fires first, so no FORBIDDEN_PERMISSION code.
    expect(r.body.code).toBeUndefined();
  });

  it("returns 403 when a user account is deactivated, even if membership + permission rows still grant access", async () => {
    rowsFor(schema.users).push({ id: "frozen", role: null, deactivatedAt: new Date() });
    rowsFor(schema.organizationMembers).push({
      id: 1,
      userId: "frozen",
      organizationId: 5,
      role: "member",
    });
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "auditor",
      name: "Auditor",
      isSystem: false,
    });
    rowsFor(schema.rolePermissions).push({ roleId: 1, permissionKey: "roles.view" });
    rowsFor(schema.userRoles).push({ organizationId: 5, userId: "frozen", roleId: 1 });
    nextRoleId = 2;

    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/roles")
      .set("x-test-user-id", "frozen");
    expect(r.status).toBe(403);
  });

  it("returns 403 (without FORBIDDEN_PERMISSION) when the caller is not a member of the org", async () => {
    // The user exists but has zero rows in organization_members for org 5.
    rowsFor(schema.users).push({ id: "stranger", role: null });
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/roles")
      .set("x-test-user-id", "stranger");
    expect(r.status).toBe(403);
    expect(r.body.code).toBeUndefined();
  });

  it("super_admin platform role bypasses both the membership and the permission gate", async () => {
    rowsFor(schema.users).push({ id: "admin", role: "super_admin" });
    // Intentionally NOT a member of org 5 and NOT holding any user_roles.
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/roles")
      .set("x-test-user-id", "admin");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("PUT /members/:userId/roles rejects role assignment to a non-member", async () => {
    // super_admin caller so we get past the permission gate.
    rowsFor(schema.users).push({ id: "admin", role: "super_admin" });
    // A real role exists in the org — to ensure the rejection is about
    // membership of the *target*, not about the role being unknown.
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "pm",
      name: "PM",
      description: null,
      isSystem: false,
    });
    nextRoleId = 2;

    const app = buildApp();
    const r = await request(app)
      .put("/api/organizations/5/members/stranger/roles")
      .set("x-test-user-id", "admin")
      .send({ roleIds: [1] });

    expect(r.status).toBe(400);
    expect(String(r.body.message || "")).toMatch(/not a member/i);
    // No user_roles row should have been inserted.
    expect(rowsFor(schema.userRoles).length).toBe(0);
  });

  it("returns 400 on a route where organizationId is absent from params, body, AND query", async () => {
    // Synthetic route with no :orgId in the path — exercises the
    // params/body/query fallback chain in requirePermission.
    rowsFor(schema.users).push({ id: "u1", role: null });
    const app = express();
    app.use(express.json());
    app.post(
      "/api/widgets",
      requirePermission("project.create"),
      (_req, res) => res.json({ ok: true }),
    );
    const r = await request(app)
      .post("/api/widgets")
      .set("x-test-user-id", "u1")
      .send({}); // no organizationId in body
    expect(r.status).toBe(400);
    expect(String(r.body.message || "")).toMatch(/organizationId/i);
  });

  it("allows a regular org member with the granted permission through (positive path)", async () => {
    // Plain user (no super_admin), member of org 5, holding a role that
    // grants roles.view. Verifies the full happy-path through the
    // middleware: membership check passes AND permission check passes.
    rowsFor(schema.users).push({ id: "viewer", role: null });
    rowsFor(schema.organizationMembers).push({
      id: 1,
      userId: "viewer",
      organizationId: 5,
    });
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "auditor",
      name: "Auditor",
      description: null,
      isSystem: false,
    });
    rowsFor(schema.rolePermissions).push({
      roleId: 1,
      permissionKey: "roles.view",
    });
    rowsFor(schema.userRoles).push({
      organizationId: 5,
      userId: "viewer",
      roleId: 1,
    });
    nextRoleId = 2;

    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/roles")
      .set("x-test-user-id", "viewer");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("PUT /members/:userId/roles succeeds when the target IS a member", async () => {
    rowsFor(schema.users).push({ id: "admin", role: "super_admin" });
    rowsFor(schema.users).push({ id: "alice", role: null });
    rowsFor(schema.organizationMembers).push({
      id: 1,
      userId: "alice",
      organizationId: 5,
      role: "member",
    });
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "pm",
      name: "PM",
      description: null,
      isSystem: false,
    });
    nextRoleId = 2;

    const app = buildApp();
    const r = await request(app)
      .put("/api/organizations/5/members/alice/roles")
      .set("x-test-user-id", "admin")
      .send({ roleIds: [1] });

    expect(r.status).toBe(200);
    expect(rowsFor(schema.userRoles).some(
      ur => ur.userId === "alice" && ur.roleId === 1,
    )).toBe(true);
  });
});

describe("seedDefaultRolesForOrg — idempotency", () => {
  it("seeds the full built-in role catalog on first call and performs zero writes on the second call", async () => {
    const orgId = 42;

    await seedDefaultRolesForOrg(orgId);

    // First call: every built-in role inserted, with its permission rows.
    const seededRoleKeys = new Set(
      rowsFor(schema.roles).map(r => r.key),
    );
    for (const def of BUILTIN_ROLES) {
      expect(seededRoleKeys.has(def.key)).toBe(true);
    }
    expect(rowsFor(schema.roles).length).toBe(BUILTIN_ROLES.length);
    expect(insertSpy.mock.calls.length).toBeGreaterThan(0);

    const rolesAfterFirst = rowsFor(schema.roles).length;
    const rolePermsAfterFirst = rowsFor(schema.rolePermissions).length;

    insertSpy.mockClear();
    updateSpy.mockClear();
    deleteSpy.mockClear();

    // Second call must be a no-op.
    await seedDefaultRolesForOrg(orgId);

    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(rowsFor(schema.roles).length).toBe(rolesAfterFirst);
    expect(rowsFor(schema.rolePermissions).length).toBe(rolePermsAfterFirst);
  });

  it("does NOT clobber an admin-edited built-in role on a subsequent boot", async () => {
    // Boot 1: full seed populates every built-in role + its default
    // permissions.
    const orgId = 101;
    await seedDefaultRolesForOrg(orgId);

    // Admin edits the built-in `read_only` role (e.g. via a future
    // direct-edit UI, or by manually patching rows): strip every default
    // permission and replace with a single custom one.
    const readOnly = rowsFor(schema.roles).find(
      (r) => r.organizationId === orgId && r.key === "read_only",
    );
    expect(readOnly).toBeDefined();
    state.set(
      schema.rolePermissions,
      rowsFor(schema.rolePermissions).filter((p) => p.roleId !== readOnly!.id),
    );
    rowsFor(schema.rolePermissions).push({
      roleId: readOnly!.id,
      permissionKey: "roles.view",
    });

    insertSpy.mockClear();
    updateSpy.mockClear();
    deleteSpy.mockClear();

    // Boot 2: seeder runs again. The edited built-in role's permission
    // rows must NOT be reverted to the BUILTIN_ROLES default.
    await seedDefaultRolesForOrg(orgId);

    const after = rowsFor(schema.rolePermissions)
      .filter((p) => p.roleId === readOnly!.id)
      .map((p) => p.permissionKey);
    expect(after).toEqual(["roles.view"]);
    // No inserts and no deletes touched the rolePermissions table for
    // this role.
    expect(insertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("backfills legacy organization_members.role into user_roles exactly once", async () => {
    const orgId = 7;
    rowsFor(schema.organizationMembers).push({
      id: 1,
      userId: "legacy-user",
      organizationId: orgId,
      role: "member", // → maps to project_manager via mapLegacyMemberRole
    });

    await seedDefaultRolesForOrg(orgId);

    const backfilled = rowsFor(schema.userRoles).filter(
      r => r.userId === "legacy-user" && r.organizationId === orgId,
    );
    expect(backfilled.length).toBe(1);
    const pmRoleId = rowsFor(schema.roles).find(
      r => r.key === "project_manager",
    )?.id;
    expect(backfilled[0].roleId).toBe(pmRoleId);

    insertSpy.mockClear();
    updateSpy.mockClear();
    deleteSpy.mockClear();

    await seedDefaultRolesForOrg(orgId);

    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(rowsFor(schema.userRoles).filter(
      r => r.userId === "legacy-user" && r.organizationId === orgId,
    ).length).toBe(1);
  });
});

describe("roles admin API — CRUD & helpers", () => {
  // All scenarios authenticate as a super_admin so we bypass the
  // membership / permission gates (already covered above) and exercise
  // the handler bodies directly.
  function seedAdmin() {
    rowsFor(schema.users).push({ id: "admin", role: "super_admin" });
  }

  it("POST /roles validates snake_case key", async () => {
    seedAdmin();
    const app = buildApp();
    const r = await request(app)
      .post("/api/organizations/5/roles")
      .set("x-test-user-id", "admin")
      .send({ key: "Bad Key", name: "Bad", permissions: [] });
    expect(r.status).toBe(400);
    expect(String(r.body.message || "")).toMatch(/snake_case/i);
    expect(rowsFor(schema.roles).length).toBe(0);
  });

  it("POST /roles requires key and name", async () => {
    seedAdmin();
    const app = buildApp();
    const r = await request(app)
      .post("/api/organizations/5/roles")
      .set("x-test-user-id", "admin")
      .send({ key: "auditor" });
    expect(r.status).toBe(400);
    expect(String(r.body.message || "")).toMatch(/key and name/i);
  });

  it("POST /roles persists only catalog-valid permissions and returns 201", async () => {
    seedAdmin();
    const app = buildApp();
    const r = await request(app)
      .post("/api/organizations/5/roles")
      .set("x-test-user-id", "admin")
      .send({
        key: "auditor",
        name: "Auditor",
        description: "Read-only auditor",
        permissions: ["roles.view", "not.a.real.permission", "project.view"],
      });
    expect(r.status).toBe(201);
    expect(r.body.organizationId).toBe(5);
    expect(r.body.key).toBe("auditor");
    expect(r.body.isSystem).toBe(false);
    expect([...r.body.permissions].sort()).toEqual(["project.view", "roles.view"]);

    const stored = rowsFor(schema.rolePermissions).filter(p => p.roleId === r.body.id);
    expect(stored.map(p => p.permissionKey).sort()).toEqual(["project.view", "roles.view"]);
    expect(stored.some(p => p.permissionKey === "not.a.real.permission")).toBe(false);
  });

  it("PUT on a built-in role returns 400 BUILTIN_ROLE_IMMUTABLE", async () => {
    seedAdmin();
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "pmo_admin",
      name: "PMO Admin",
      description: null,
      isSystem: true,
    });
    nextRoleId = 2;
    const app = buildApp();
    const r = await request(app)
      .put("/api/organizations/5/roles/1")
      .set("x-test-user-id", "admin")
      .send({ name: "Hacked", permissions: ["roles.view"] });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("BUILTIN_ROLE_IMMUTABLE");
    expect(rowsFor(schema.roles).find(row => row.id === 1)!.name).toBe("PMO Admin");
    expect(rowsFor(schema.rolePermissions).length).toBe(0);
  });

  it("PUT on a custom role replaces the permission set (adds + removes)", async () => {
    seedAdmin();
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "auditor",
      name: "Auditor",
      description: null,
      isSystem: false,
    });
    nextRoleId = 2;
    rowsFor(schema.rolePermissions).push({ roleId: 1, permissionKey: "roles.view" });
    rowsFor(schema.rolePermissions).push({ roleId: 1, permissionKey: "project.view" });

    const app = buildApp();
    const r = await request(app)
      .put("/api/organizations/5/roles/1")
      .set("x-test-user-id", "admin")
      .send({
        name: "Renamed Auditor",
        description: "now with create",
        permissions: ["roles.view", "project.create", "not.real"],
      });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe("Renamed Auditor");
    expect(r.body.description).toBe("now with create");
    expect([...r.body.permissions].sort()).toEqual(["project.create", "roles.view"]);

    const stored = rowsFor(schema.rolePermissions)
      .filter(p => p.roleId === 1)
      .map(p => p.permissionKey)
      .sort();
    expect(stored).toEqual(["project.create", "roles.view"]);
  });

  it("DELETE refuses a built-in role", async () => {
    seedAdmin();
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "pmo_admin",
      name: "PMO Admin",
      description: null,
      isSystem: true,
    });
    nextRoleId = 2;
    const app = buildApp();
    const r = await request(app)
      .delete("/api/organizations/5/roles/1")
      .set("x-test-user-id", "admin");
    expect(r.status).toBe(400);
    expect(String(r.body.message || "")).toMatch(/cannot be deleted/i);
    expect(rowsFor(schema.roles).length).toBe(1);
  });

  it("DELETE succeeds for a custom role", async () => {
    seedAdmin();
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "auditor",
      name: "Auditor",
      description: null,
      isSystem: false,
    });
    nextRoleId = 2;
    const app = buildApp();
    const r = await request(app)
      .delete("/api/organizations/5/roles/1")
      .set("x-test-user-id", "admin");
    expect(r.status).toBe(204);
    expect(rowsFor(schema.roles).length).toBe(0);
  });

  it("DELETE returns 404 when the role does not belong to the org", async () => {
    seedAdmin();
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 99,
      key: "auditor",
      name: "Auditor",
      description: null,
      isSystem: false,
    });
    nextRoleId = 2;
    const app = buildApp();
    const r = await request(app)
      .delete("/api/organizations/5/roles/1")
      .set("x-test-user-id", "admin");
    expect(r.status).toBe(404);
    expect(rowsFor(schema.roles).length).toBe(1);
  });

  it("POST /:roleId/clone copies the source role's permissions onto a new custom role", async () => {
    seedAdmin();
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "pmo_admin",
      name: "PMO Admin",
      description: "built-in",
      isSystem: true,
    });
    nextRoleId = 2;
    rowsFor(schema.rolePermissions).push({ roleId: 1, permissionKey: "roles.view" });
    rowsFor(schema.rolePermissions).push({ roleId: 1, permissionKey: "roles.manage" });
    rowsFor(schema.rolePermissions).push({ roleId: 1, permissionKey: "project.view" });

    const app = buildApp();
    const r = await request(app)
      .post("/api/organizations/5/roles/1/clone")
      .set("x-test-user-id", "admin")
      .send({ key: "pmo_admin_copy", name: "PMO Admin (copy)" });
    expect(r.status).toBe(201);
    expect(r.body.key).toBe("pmo_admin_copy");
    expect(r.body.isSystem).toBe(false);
    expect(r.body.organizationId).toBe(5);
    expect([...r.body.permissions].sort()).toEqual(
      ["project.view", "roles.manage", "roles.view"],
    );

    const newRoleId = r.body.id;
    const clonedRows = rowsFor(schema.rolePermissions)
      .filter(p => p.roleId === newRoleId)
      .map(p => p.permissionKey)
      .sort();
    expect(clonedRows).toEqual(["project.view", "roles.manage", "roles.view"]);
    expect(rowsFor(schema.rolePermissions).filter(p => p.roleId === 1).length).toBe(3);
  });

  it("POST /:roleId/clone validates the snake_case key", async () => {
    seedAdmin();
    rowsFor(schema.roles).push({
      id: 1,
      organizationId: 5,
      key: "pmo_admin",
      name: "PMO Admin",
      description: null,
      isSystem: true,
    });
    nextRoleId = 2;
    const app = buildApp();
    const r = await request(app)
      .post("/api/organizations/5/roles/1/clone")
      .set("x-test-user-id", "admin")
      .send({ key: "Bad Key", name: "Copy" });
    expect(r.status).toBe(400);
    expect(String(r.body.message || "")).toMatch(/snake_case/i);
  });

  it("GET /role-assignments returns the org's user_roles rows", async () => {
    seedAdmin();
    rowsFor(schema.userRoles).push({ organizationId: 5, userId: "alice", roleId: 1 });
    rowsFor(schema.userRoles).push({ organizationId: 5, userId: "bob", roleId: 2 });
    // Different org — must NOT appear in the response.
    rowsFor(schema.userRoles).push({ organizationId: 99, userId: "carol", roleId: 1 });

    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/role-assignments")
      .set("x-test-user-id", "admin");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBe(2);
    const pairs = (r.body as any[])
      .map(row => `${row.userId}:${row.roleId}`)
      .sort();
    expect(pairs).toEqual(["alice:1", "bob:2"]);
    expect((r.body as any[]).some(row => row.userId === "carol")).toBe(false);
  });

  it("POST /roles/reset-defaults reseeds the catalog without duplicating rows", async () => {
    seedAdmin();
    const app = buildApp();

    const r1 = await request(app)
      .post("/api/organizations/5/roles/reset-defaults")
      .set("x-test-user-id", "admin")
      .send({});
    expect(r1.status).toBe(200);
    expect(r1.body.ok).toBe(true);

    const rolesAfterFirst = rowsFor(schema.roles).length;
    const permsAfterFirst = rowsFor(schema.rolePermissions).length;
    expect(rolesAfterFirst).toBe(BUILTIN_ROLES.length);
    expect(permsAfterFirst).toBeGreaterThan(0);

    insertSpy.mockClear();
    updateSpy.mockClear();
    deleteSpy.mockClear();

    const r2 = await request(app)
      .post("/api/organizations/5/roles/reset-defaults")
      .set("x-test-user-id", "admin")
      .send({});
    expect(r2.status).toBe(200);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(rowsFor(schema.roles).length).toBe(rolesAfterFirst);
    expect(rowsFor(schema.rolePermissions).length).toBe(permsAfterFirst);
  });
});
