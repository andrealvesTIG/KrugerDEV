/**
 * Server-side custom-agent model allowlist test. Verifies that
 * POST/PATCH /api/agents reject any model not in the org's enabled set,
 * regardless of what the UI sends (defense against client tampering).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const ORG = 7;
const USER = "user-a";

const fridayAgentConfigByOrg: Record<number, any> = {};
const selectOrgConfigMock = vi.fn(async () => {
  return [{ fridayAgentConfig: fridayAgentConfigByOrg[ORG] ?? null }];
});
const orgMembersInOrg: Record<string, number[]> = { [USER]: [ORG] };

vi.mock("../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (_pred: any) => selectOrgConfigMock(),
      }),
    }),
  },
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

vi.mock("../server/routes/helpers", () => ({
  getUserIdFromRequest: (req: any) => req.headers?.["x-test-user-id"] as string | undefined,
  getUserOrgIds: async (userId: string | undefined) => (userId && orgMembersInOrg[userId]) || [],
  getUserOrgRole: async () => "manager",
  logUserActivity: vi.fn().mockResolvedValue(undefined),
  classifyError: (e: unknown) => ({ status: 500, message: String(e) }),
  hasAdminAccess: () => false,
  userHasOrgAccess: async () => true,
  requireEmailVerified: async () => ({ verified: true }),
  decryptApiKey: (s: string) => s,
}));

vi.mock("../server/storage/customAgentStorage", () => ({
  listVisibleAgents: vi.fn().mockResolvedValue([]),
  getAgentForUser: vi.fn().mockResolvedValue({ id: 1, organizationId: ORG, name: "x", description: null, systemPrompt: "x", type: "chat", model: "gpt-4o-mini" }),
  canEditAgent: vi.fn().mockResolvedValue(true),
  createAgent: vi.fn(async (insert: any) => ({ id: 999, ...insert })),
  updateAgent: vi.fn(async (id: number, patch: any) => ({ id, organizationId: ORG, name: patch.name ?? "x", description: null, systemPrompt: patch.systemPrompt ?? "x", type: "chat", ...patch })),
  archiveAgent: vi.fn(), deleteAgent: vi.fn(),
  listAgentMembers: vi.fn().mockResolvedValue([]),
  listAgentLogs: vi.fn().mockResolvedValue([]),
  listAgentConversations: vi.fn().mockResolvedValue([]),
  getAgentConversation: vi.fn(), getAgentMessages: vi.fn().mockResolvedValue([]),
  createAgentConversation: vi.fn(), addAgentMessage: vi.fn(),
  updateAgentConversationTitle: vi.fn(), archiveAgentConversation: vi.fn(), deleteAgentConversation: vi.fn(),
  setAgentMessageMetadata: vi.fn(),
  userIsOrgAdmin: vi.fn().mockResolvedValue(true),
  listAllOrgAgentsForAdmin: vi.fn().mockResolvedValue([]),
  reassignAgentOwner: vi.fn(),
  getOrgAgentUsageStats: vi.fn().mockResolvedValue([]),
}));

vi.mock("../server/services/customAgentService", () => ({
  runScheduledAgent: vi.fn(),
  computeNextRun: vi.fn().mockReturnValue(null),
}));

vi.mock("../server/services/jarvisService", () => ({
  streamJarvisResponse: vi.fn(),
  getOrgOpenAIClient: vi.fn().mockResolvedValue({ client: {}, deployment: "", isAzure: false }),
}));

vi.mock("../server/services/aiCredits", () => ({
  enforceAiCredits: vi.fn(),
  recordAiCredits: vi.fn(),
  sendLimitExceeded: vi.fn().mockReturnValue(false),
  writeSseLimitExceeded: vi.fn().mockReturnValue(false),
  AiCreditsLimitError: class extends Error {},
  newAiRequestId: () => "req-1",
}));

// Stub Drizzle's chained select(...).from(...).where(...) used in
// validateModelForOrg(). We only care about the call against `organizations`.
vi.mock("../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (_pred: any) => selectOrgConfigMock(ORG),
      }),
    }),
  },
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

async function buildApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  const { registerCustomAgentRoutes } = await import("../server/routes/customAgentRoutes");
  registerCustomAgentRoutes(app);
  return app;
}

beforeEach(() => {
  for (const k of Object.keys(fridayAgentConfigByOrg)) delete fridayAgentConfigByOrg[Number(k)];
  selectOrgConfigMock.mockClear();
});

describe("custom-agent model allowlist (server-side enforcement)", () => {
  it("POST /api/agents — rejects an off-list model with 400 even when the UI sends it", async () => {
    fridayAgentConfigByOrg[ORG] = { provider: "openai", useOrgAzure: false };
    const app = await buildApp();
    const res = await request(app)
      .post("/api/agents")
      .set("x-test-user-id", USER)
      .send({
        organizationId: ORG,
        type: "chat",
        name: "Hostile",
        systemPrompt: "go",
        model: "gpt-5-secret-preview",
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enabled/);
  });

  it("POST /api/agents — accepts an allowed model (gpt-4o)", async () => {
    fridayAgentConfigByOrg[ORG] = { provider: "openai", useOrgAzure: false };
    const app = await buildApp();
    const res = await request(app)
      .post("/api/agents")
      .set("x-test-user-id", USER)
      .send({
        organizationId: ORG,
        type: "chat",
        name: "OK",
        systemPrompt: "go",
        model: "gpt-4o",
      });
    expect(res.status).toBe(201);
  });

  it("POST /api/agents — Azure-pinned org accepts ONLY its azureDeployment, rejects the static allowlist", async () => {
    fridayAgentConfigByOrg[ORG] = {
      provider: "openai", useOrgAzure: true, azureEndpoint: "https://x", azureApiKey: "k",
      azureDeployment: "corp-gpt-4o-deploy",
    };
    const app = await buildApp();
    const ok = await request(app).post("/api/agents").set("x-test-user-id", USER)
      .send({ organizationId: ORG, type: "chat", name: "A", systemPrompt: "x", model: "corp-gpt-4o-deploy" });
    expect(ok.status).toBe(201);

    const bad = await request(app).post("/api/agents").set("x-test-user-id", USER)
      .send({ organizationId: ORG, type: "chat", name: "B", systemPrompt: "x", model: "gpt-4o-mini" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/corp-gpt-4o-deploy/);
  });

  it("PATCH /api/agents/:id — rejects off-list model with 400", async () => {
    fridayAgentConfigByOrg[ORG] = { provider: "openai", useOrgAzure: false };
    const app = await buildApp();
    const res = await request(app)
      .patch("/api/agents/1")
      .set("x-test-user-id", USER)
      .send({ organizationId: ORG, model: "definitely-not-allowed" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enabled/);
  });

  it("PATCH /api/agents/:id — accepts an allowed model", async () => {
    fridayAgentConfigByOrg[ORG] = { provider: "openai", useOrgAzure: false };
    const app = await buildApp();
    const res = await request(app)
      .patch("/api/agents/1")
      .set("x-test-user-id", USER)
      .send({ organizationId: ORG, model: "gpt-4o" });
    expect(res.status).toBe(200);
  });
});
