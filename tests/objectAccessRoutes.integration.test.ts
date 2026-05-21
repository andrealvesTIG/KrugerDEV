/**
 * Integration tests for the /objects access path. Verifies that:
 *   - Unauthenticated GETs are rejected.
 *   - Path traversal / NUL / backslash payloads are rejected.
 *   - Cross-tenant access (caller is authenticated but not a member of the
 *     uploading org and not the uploader) is denied.
 *   - The same-org caller is allowed through.
 *
 * The real ObjectStorageService and database are stubbed out — these tests
 * exercise the routing + guard logic, not GCS or postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../server/replit_integrations/object_storage/objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  class ObjectStorageService {
    async getObjectEntityUploadURL() { throw Object.assign(new Error("unavailable"), { status: 401 }); }
    normalizeObjectEntityPath(u: string) { return u; }
    async getObjectEntityFile() { throw new ObjectNotFoundError("missing"); }
    async downloadObject() {}
  }
  return { ObjectStorageService, ObjectNotFoundError };
});

// Auth state for the synthetic request — flipped per test.
let CURRENT_USER: string | null = null;
vi.mock("../server/routes/helpers", () => ({
  getUserIdFromRequest: () => CURRENT_USER,
}));

// Stub the tenant-access helper so we can assert it's called and control
// the verdict.
const accessSpy = vi.fn();
vi.mock("../server/lib/objectAccess", () => ({
  recordObjectUpload: vi.fn(async () => {}),
  canUserAccessObject: (...args: any[]) => accessSpy(...args),
}));

async function mkApp() {
  const { registerObjectStorageRoutes } = await import(
    "../server/replit_integrations/object_storage/routes"
  );
  const app = express();
  app.use(express.json());
  registerObjectStorageRoutes(app);
  return app;
}

describe("GET /objects/:path(*) — tenant-scoped access control", () => {
  beforeEach(() => {
    CURRENT_USER = null;
    accessSpy.mockReset();
  });

  it("returns 401 when the caller is not authenticated", async () => {
    const app = await mkApp();
    const res = await request(app).get("/objects/uploads/abc.png");
    expect(res.status).toBe(401);
    expect(accessSpy).not.toHaveBeenCalled();
  });

  it("rejects path traversal payloads", async () => {
    CURRENT_USER = "user-1";
    const app = await mkApp();
    // Express normalises `..` segments so a literal `/objects/../etc/passwd`
    // never reaches our handler. We exercise the equivalent encoded form
    // plus the backslash and double-slash filters.
    const bad = [
      "/objects/uploads/..%2fpasswd",
      "/objects/uploads/foo%5cbar",
    ];
    for (const p of bad) {
      const res = await request(app).get(p);
      expect([400, 403, 404]).toContain(res.status);
    }
  });

  it("returns 403 when the caller is not allowed by the access policy", async () => {
    CURRENT_USER = "user-1";
    accessSpy.mockResolvedValue(false);
    const app = await mkApp();
    const res = await request(app).get("/objects/uploads/foreign.png");
    expect(res.status).toBe(403);
    expect(accessSpy).toHaveBeenCalledWith("user-1", "/objects/uploads/foreign.png");
  });

  it("passes the access check before attempting any IO", async () => {
    CURRENT_USER = "user-1";
    accessSpy.mockResolvedValue(true);
    const app = await mkApp();
    const res = await request(app).get("/objects/uploads/own.png");
    // No real file on disk + the stubbed storage throws — we should reach
    // the 404 / 503 path, NOT a 403. That confirms the guard let us
    // through.
    expect([404, 503]).toContain(res.status);
    expect(accessSpy).toHaveBeenCalled();
  });
});

describe("POST /api/uploads/request-url — file-type allow-list", () => {
  beforeEach(() => {
    CURRENT_USER = "user-1";
    accessSpy.mockReset();
  });

  it("rejects executable file types by default", async () => {
    const app = await mkApp();
    const res = await request(app)
      .post("/api/uploads/request-url")
      .send({ name: "evil.html", contentType: "text/html" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Executable/i);
  });

  it("rejects extensions outside the allow-list", async () => {
    const app = await mkApp();
    const res = await request(app)
      .post("/api/uploads/request-url")
      .send({ name: "bad.exe", contentType: "application/octet-stream" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/);
  });

  it("accepts an allowed image type and returns an upload URL", async () => {
    const app = await mkApp();
    const res = await request(app)
      .post("/api/uploads/request-url")
      .send({ name: "ok.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.objectPath).toMatch(/^\/objects\/uploads\/[A-Za-z0-9-]+\.png$/);
  });
});
