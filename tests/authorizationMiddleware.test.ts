/**
 * Integration tests for the `requirePermission` middleware and the
 * authorization service. We mock the DB and helpers so the tests run
 * fast and deterministically; the goal is to verify the middleware's
 * runtime contract:
 *
 *   - 401 when unauthenticated
 *   - 400 when no organizationId is in params/body/query
 *   - 403 (membership-first) when the user is not an org member
 *   - 403 { code: 'FORBIDDEN_PERMISSION', required } when missing permission
 *   - super_admin (users.role) bypasses everything; `marketing` does NOT
 *   - 200 / next() when the user has the permission
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

let mockMembership = true;
let mockPermissions = new Set<string>();
let mockUserPlatformRole: string | null = null;

vi.mock("../server/routes/helpers", async () => {
  const actual = await vi.importActual<any>("../server/routes/helpers");
  return {
    ...actual,
    getUserIdFromRequest: (req: any) => req.headers["x-test-user-id"] as string | undefined,
  };
});

vi.mock("../server/db", async () => {
  const schema = await vi.importActual<any>("../shared/schema");
  return {
    db: {
      select: (_fields?: any) => ({
        from: (table: any) => ({
          where: () => {
            if (table === schema.users) {
              return Promise.resolve(
                mockUserPlatformRole ? [{ role: mockUserPlatformRole }] : [],
              );
            }
            if (table === schema.userRoles) {
              return Promise.resolve(mockPermissions.size > 0 ? [{ roleId: 1 }] : []);
            }
            if (table === schema.rolePermissions) {
              return Promise.resolve(
                Array.from(mockPermissions).map(k => ({ permissionKey: k })),
              );
            }
            if (table === schema.organizationMembers) {
              return Promise.resolve(mockMembership ? [{ id: 1 }] : []);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    },
    pool: { on: () => {}, query: () => Promise.resolve() },
  };
});

import { requirePermission } from "../server/services/authorizationService";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get(
    "/api/organizations/:orgId/secret",
    requirePermission("project.delete"),
    (_req, res) => res.json({ ok: true }),
  );
  app.post(
    "/api/widgets",
    requirePermission("project.create"),
    (_req, res) => res.json({ ok: true }),
  );
  return app;
}

beforeEach(() => {
  mockMembership = true;
  mockPermissions = new Set();
  mockUserPlatformRole = null;
});

describe("requirePermission middleware", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const r = await request(app).get("/api/organizations/5/secret");
    expect(r.status).toBe(401);
  });

  it("returns 400 when no organizationId can be resolved", async () => {
    const app = buildApp();
    const r = await request(app)
      .post("/api/widgets")
      .set("x-test-user-id", "u1")
      .send({});
    expect(r.status).toBe(400);
  });

  it("returns 403 (no FORBIDDEN_PERMISSION code) when user is NOT a member", async () => {
    mockMembership = false;
    mockPermissions = new Set(["project.delete"]); // even with the perm
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/secret")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(403);
    expect(r.body.code).toBeUndefined();
  });

  it("returns 403 with FORBIDDEN_PERMISSION when member lacks the perm", async () => {
    mockMembership = true;
    mockPermissions = new Set(); // no perms
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/secret")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN_PERMISSION");
    expect(r.body.required).toBe("project.delete");
  });

  it("allows the request when member has the permission", async () => {
    mockMembership = true;
    mockPermissions = new Set(["project.delete"]);
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/secret")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it("super_admin bypasses permission check entirely", async () => {
    mockMembership = true;
    mockPermissions = new Set(); // no perms
    mockUserPlatformRole = "super_admin";
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/secret")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(200);
  });

  it("marketing platform role does NOT bypass (regression guard)", async () => {
    mockMembership = true;
    mockPermissions = new Set(); // no perms
    mockUserPlatformRole = "marketing";
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/secret")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN_PERMISSION");
  });

  it("marketing platform role without membership is denied (no org-access shortcut)", async () => {
    mockMembership = false; // critically: NOT a member
    mockPermissions = new Set(["project.delete"]);
    mockUserPlatformRole = "marketing";
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/secret")
      .set("x-test-user-id", "u1");
    // Either way it must NOT succeed; the marketing platform role does not
    // grant access to orgs it doesn't belong to.
    expect(r.status).toBe(403);
  });

  it("stale user_roles after membership removal cannot authorize access", async () => {
    // Simulates: user previously held perms via user_roles, then was
    // removed from organization_members. They must be blocked.
    mockMembership = false;
    mockPermissions = new Set(["project.delete"]); // stale assignment
    mockUserPlatformRole = null;
    const app = buildApp();
    const r = await request(app)
      .get("/api/organizations/5/secret")
      .set("x-test-user-id", "u1");
    expect(r.status).toBe(403);
  });

  it("resolves organizationId from request body when not in URL", async () => {
    mockMembership = true;
    mockPermissions = new Set(["project.create"]);
    const app = buildApp();
    const r = await request(app)
      .post("/api/widgets")
      .set("x-test-user-id", "u1")
      .send({ organizationId: 7 });
    expect(r.status).toBe(200);
  });
});
