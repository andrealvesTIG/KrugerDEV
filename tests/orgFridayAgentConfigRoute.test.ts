/**
 * Route-level coverage for the new Anthropic fields on
 * `/api/organizations/:id/friday-agent-config`. Verifies:
 *
 *   - PUT with `provider:"anthropic"` + plaintext `anthropicApiKey` persists
 *     ENCRYPTED ciphertext (never the raw key) and forwards the model.
 *   - GET returns the key MASKED (first/last 4 chars + bullets) — never raw.
 *   - PUT with the masked placeholder is treated as "no change", so the
 *     stored ciphertext survives.
 *   - PUT with `provider:"anthropic"` and an empty key is rejected when no
 *     key is already stored.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const TEST_USER = "user-99";
const TEST_ORG = 31;

// Mock the lower-level helpers we don't care about (auth + db) but keep
// the real encrypt/decrypt path so we exercise the actual round-trip.
vi.mock("../server/db", () => ({
  db: {
    // The route's fallback admin check (`db.select().from(users).where(...)`)
    // never fires for our happy-path tests because we hand back an
    // owner/admin membership from storage. Return [] so any unexpected
    // hit doesn't blow up.
    select: () => ({
      from: () => ({ where: () => Promise.resolve([]) }),
    }),
  },
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

// In-memory storage stub so the PUT handler's read-merge-write cycle
// behaves like a real DB (the second GET observes the first PUT).
const storedOrg: { fridayAgentConfig: any } = { fridayAgentConfig: null };
vi.mock("../server/storage", () => ({
  storage: {
    getUser: vi.fn().mockResolvedValue({ id: TEST_USER, role: "user" }),
    getOrganization: vi.fn(async (id: number) =>
      id === TEST_ORG ? { id: TEST_ORG, fridayAgentConfig: storedOrg.fridayAgentConfig } : null,
    ),
    getUserOrganizations: vi.fn(async () => [{ organizationId: TEST_ORG, role: "owner" }]),
    updateOrganization: vi.fn(async (id: number, updates: any) => {
      if ("fridayAgentConfig" in updates) {
        storedOrg.fridayAgentConfig = updates.fridayAgentConfig;
      }
      return { id, fridayAgentConfig: storedOrg.fridayAgentConfig };
    }),
  },
}));

// Patch ONLY the auth helpers — keep the real `encryptApiKey`/`decryptApiKey`
// so this test exercises the actual crypto round-trip.
vi.mock("../server/routes/helpers", async () => {
  const actual = await vi.importActual<any>("../server/routes/helpers");
  return {
    ...actual,
    getUserIdFromRequest: (req: any) => req.headers?.["x-test-user-id"] as string | undefined,
    userHasOrgAccess: async () => true,
    hasAdminAccess: () => false,
  };
});

async function buildApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  const { registerOrganizationRoutes } = await import("../server/routes/organizationRoutes");
  registerOrganizationRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  storedOrg.fridayAgentConfig = null;
});

describe("PUT /api/organizations/:id/friday-agent-config — Anthropic fields", () => {
  it("persists the plaintext anthropicApiKey as ENCRYPTED ciphertext (never raw) and forwards the model + provider", async () => {
    const app = await buildApp();
    const RAW_KEY = "sk-ant-fresh-plaintext-key-987654";

    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG}/friday-agent-config`)
      .set("x-test-user-id", TEST_USER)
      .send({
        provider: "anthropic",
        anthropicApiKey: RAW_KEY,
        anthropicModel: "claude-3-5-haiku-latest",
      });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("anthropic");
    expect(res.body.anthropicModel).toBe("claude-3-5-haiku-latest");
    // The ciphertext is `<ivHex>:<encryptedHex>` — both hex-only, never the
    // raw key. Critical: the stored value is NOT the plaintext.
    expect(res.body.anthropicApiKey).not.toBe(RAW_KEY);
    expect(res.body.anthropicApiKey).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(storedOrg.fridayAgentConfig.anthropicApiKey).toBe(res.body.anthropicApiKey);

    // Round-trip: the real decryptApiKey must recover the original plaintext.
    const { decryptApiKey } = await import("../server/routes/helpers");
    expect(decryptApiKey(storedOrg.fridayAgentConfig.anthropicApiKey)).toBe(RAW_KEY);
  });

  it("GET returns the saved Anthropic key MASKED (first 4 + bullets + last 4) — never the ciphertext or plaintext", async () => {
    const app = await buildApp();
    const RAW_KEY = "sk-ant-fresh-plaintext-key-987654";

    await request(app)
      .put(`/api/organizations/${TEST_ORG}/friday-agent-config`)
      .set("x-test-user-id", TEST_USER)
      .send({
        provider: "anthropic",
        anthropicApiKey: RAW_KEY,
        anthropicModel: "claude-3-5-haiku-latest",
      });

    const getRes = await request(app)
      .get(`/api/organizations/${TEST_ORG}/friday-agent-config`)
      .set("x-test-user-id", TEST_USER);

    expect(getRes.status).toBe(200);
    expect(getRes.body.provider).toBe("anthropic");
    // Mask format = first 4 chars + bullets + last 4 chars.
    expect(getRes.body.anthropicApiKey).toBe(
      RAW_KEY.slice(0, 4) + "••••••••" + RAW_KEY.slice(-4),
    );
    expect(getRes.body.anthropicApiKey).not.toContain(RAW_KEY.slice(4, -4));
  });

  it("PUT with the masked placeholder string preserves the existing ciphertext (no re-encrypt, no clobber)", async () => {
    const app = await buildApp();
    const RAW_KEY = "sk-ant-original-secret-pre-saved";

    // Seed: save a real key.
    await request(app)
      .put(`/api/organizations/${TEST_ORG}/friday-agent-config`)
      .set("x-test-user-id", TEST_USER)
      .send({ provider: "anthropic", anthropicApiKey: RAW_KEY });
    const cipherBefore = storedOrg.fridayAgentConfig.anthropicApiKey;

    // Submit again with the masked placeholder + a model change.
    const masked = RAW_KEY.slice(0, 4) + "••••••••" + RAW_KEY.slice(-4);
    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG}/friday-agent-config`)
      .set("x-test-user-id", TEST_USER)
      .send({
        provider: "anthropic",
        anthropicApiKey: masked,
        anthropicModel: "claude-3-opus-20240229",
      });

    expect(res.status).toBe(200);
    // Same ciphertext as before — the masked placeholder must NEVER be
    // encrypted and stored, otherwise a future decrypt would fail and the
    // user would silently lose their key on every settings save.
    expect(storedOrg.fridayAgentConfig.anthropicApiKey).toBe(cipherBefore);
    // Non-secret fields still update.
    expect(storedOrg.fridayAgentConfig.anthropicModel).toBe("claude-3-opus-20240229");
  });

  it("rejects PUT with provider=anthropic + empty key when no key has been saved yet", async () => {
    const app = await buildApp();
    const res = await request(app)
      .put(`/api/organizations/${TEST_ORG}/friday-agent-config`)
      .set("x-test-user-id", TEST_USER)
      .send({ provider: "anthropic", anthropicApiKey: "" });

    expect(res.status).toBe(400);
    expect(String(res.body.message)).toMatch(/Anthropic API key is required/i);
    // And nothing was persisted.
    expect(storedOrg.fridayAgentConfig).toBeNull();
  });
});
