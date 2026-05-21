/**
 * Regression tests for the multi-tenant + upload security hotfix
 * (`.local/tasks/task-6.md`). One test per (route, attack vector):
 *
 *   - updateProjectSchema / updateProgramSchema silently drop a client-
 *     supplied `organizationId`.
 *   - originGuard rejects state-changing requests with a missing or
 *     foreign Origin header and passes browser-origin requests through.
 *   - validateAttachmentValue rejects path-traversal, non-`/objects/`
 *     URLs, and recomputes size/type rather than trusting client input.
 *   - validateResourceValue rejects a resource id that lives in a
 *     different organisation from the entity being edited.
 *
 * These tests are deliberately pure-unit (no DB, no real HTTP server) so
 * they run in milliseconds and can't bit-rot when the integration harness
 * changes shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

import { updateProjectSchema, updateProgramSchema } from "@shared/schema";
import { buildOriginGuard } from "../server/lib/originGuard";

// The validator imports `../db` and `@shared/schema` for the resource
// look-up. Mock both so the test stays hermetic.
vi.mock("../server/db", () => ({ db: { select: vi.fn() } }));

describe("update schemas drop tenant fields", () => {
  it("updateProjectSchema strips organizationId / isDemo from PUT body", () => {
    const parsed = updateProjectSchema.parse({
      name: "Renamed project",
      organizationId: 99999,
      isDemo: true,
    });
    expect((parsed as any).organizationId).toBeUndefined();
    expect((parsed as any).isDemo).toBeUndefined();
    expect(parsed.name).toBe("Renamed project");
  });

  it("updateProgramSchema strips organizationId / createdBy / isDemo", () => {
    const parsed = updateProgramSchema.parse({
      name: "Renamed program",
      organizationId: 99999,
      createdBy: "attacker",
      isDemo: true,
    });
    expect((parsed as any).organizationId).toBeUndefined();
    expect((parsed as any).createdBy).toBeUndefined();
    expect((parsed as any).isDemo).toBeUndefined();
  });
});

describe("originGuard", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://example.test";
    delete process.env.REPLIT_DOMAINS;
    delete process.env.REPLIT_DEV_DOMAIN;
  });

  function mkApp() {
    const app = express();
    app.use(express.json());
    app.use(buildOriginGuard());
    app.get("/ping", (_req, res) => res.json({ ok: true }));
    app.post("/ping", (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("allows GETs unconditionally", async () => {
    const res = await request(mkApp()).get("/ping");
    expect(res.status).toBe(200);
  });

  it("rejects a POST with no Origin / Referer", async () => {
    const res = await request(mkApp()).post("/ping").send({});
    expect(res.status).toBe(403);
  });

  it("rejects a POST whose Origin is a foreign host", async () => {
    const res = await request(mkApp())
      .post("/ping")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(403);
  });

  it("allows a POST whose Origin matches APP_ORIGIN", async () => {
    const res = await request(mkApp())
      .post("/ping")
      .set("Origin", "https://example.test")
      .send({});
    expect(res.status).toBe(200);
  });

  it("allows a POST carrying a Bearer token regardless of Origin", async () => {
    const res = await request(mkApp())
      .post("/ping")
      .set("Authorization", "Bearer abc")
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("custom-field value validators", () => {
  it("validateAttachmentValue rejects non-/objects/ paths", async () => {
    const { validateAttachmentValue, CustomFieldValueError } = await import(
      "../server/lib/customFieldValueValidator"
    );
    await expect(
      validateAttachmentValue(JSON.stringify({ path: "/etc/passwd" })),
    ).rejects.toBeInstanceOf(CustomFieldValueError);
    await expect(
      validateAttachmentValue(JSON.stringify({ path: "https://evil/x.png" })),
    ).rejects.toBeInstanceOf(CustomFieldValueError);
  });

  it("validateAttachmentValue rejects path traversal", async () => {
    const { validateAttachmentValue, CustomFieldValueError } = await import(
      "../server/lib/customFieldValueValidator"
    );
    await expect(
      validateAttachmentValue(JSON.stringify({ path: "/objects/../../etc/passwd" })),
    ).rejects.toBeInstanceOf(CustomFieldValueError);
  });

  it("validateAttachmentValue recomputes size/type from storage metadata and drops client-supplied values", async () => {
    vi.resetModules();
    vi.doMock(
      "../server/replit_integrations/object_storage/objectStorage",
      () => ({
        ObjectStorageService: class {
          async getObjectEntityFile() {
            return {
              getMetadata: async () => [
                { size: 4321, contentType: "image/png" },
              ],
            };
          }
        },
      }),
    );
    const { validateAttachmentValue } = await import(
      "../server/lib/customFieldValueValidator"
    );
    const out = await validateAttachmentValue(
      JSON.stringify({
        path: "/objects/cloud/abc.png",
        name: "abc.png",
        size: 99999, // attacker-supplied — replaced from storage metadata
        type: "text/html", // attacker-supplied — replaced from storage metadata
      }),
    );
    const parsed = JSON.parse(out!);
    expect(parsed.path).toBe("/objects/cloud/abc.png");
    expect(parsed.type).toBe("image/png");
    expect(parsed.size).toBe(4321);
  });

  it("validateAttachmentValue rejects a cloud path whose object does not exist in storage", async () => {
    vi.resetModules();
    vi.doMock(
      "../server/replit_integrations/object_storage/objectStorage",
      () => ({
        ObjectStorageService: class {
          async getObjectEntityFile() {
            throw new Error("ObjectNotFoundError");
          }
        },
      }),
    );
    const { validateAttachmentValue, CustomFieldValueError } = await import(
      "../server/lib/customFieldValueValidator"
    );
    await expect(
      validateAttachmentValue(
        JSON.stringify({ path: "/objects/cloud/missing.png", name: "missing.png" }),
      ),
    ).rejects.toBeInstanceOf(CustomFieldValueError);
  });

  it("validateAttachmentValue treats null/empty as a cleared value", async () => {
    const { validateAttachmentValue } = await import(
      "../server/lib/customFieldValueValidator"
    );
    await expect(validateAttachmentValue(null)).resolves.toBeNull();
    await expect(validateAttachmentValue("")).resolves.toBeNull();
  });

  it("validateResourceValue rejects a cross-org resource id", async () => {
    vi.resetModules();
    vi.doMock("../server/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ orgId: 2 }]),
          }),
        }),
      },
    }));
    const { validateResourceValue, CustomFieldValueError } = await import(
      "../server/lib/customFieldValueValidator"
    );
    await expect(validateResourceValue("42", /* entityOrgId */ 1)).rejects.toBeInstanceOf(
      CustomFieldValueError,
    );
  });

  it("validateResourceValue accepts a same-org resource id", async () => {
    vi.resetModules();
    vi.doMock("../server/db", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ orgId: 7 }]),
          }),
        }),
      },
    }));
    const { validateResourceValue } = await import(
      "../server/lib/customFieldValueValidator"
    );
    await expect(validateResourceValue("42", /* entityOrgId */ 7)).resolves.toBe("42");
  });
});
