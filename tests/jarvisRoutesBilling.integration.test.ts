/**
 * End-to-end billing-integrity test: mocks ONLY `server/services/billing`,
 * lets the real `aiCredits` service run, and asserts `recordCreditUsage`
 * is invoked with the expected per-request requestId.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../server/db", () => ({
  db: {},
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

const checkAndEnforceLimitMock = vi.fn();
const recordCreditUsageMock = vi.fn();

vi.mock("../server/services/billing", () => ({
  checkAndEnforceLimit: (...args: any[]) => checkAndEnforceLimitMock(...args),
  recordCreditUsage: (...args: any[]) => recordCreditUsageMock(...args),
  METER_CODES: { AI_RUNS: "ai_runs" },
  RESOURCE_TYPES: { AI_RUN: "ai_runs" },
}));

const streamJarvisResponseMock = vi.fn();
const executeJarvisActionMock = vi.fn();
vi.mock("../server/services/jarvisService", () => ({
  streamJarvisResponse: (...args: any[]) => streamJarvisResponseMock(...args),
  executeJarvisAction: (...args: any[]) => executeJarvisActionMock(...args),
}));

const createConversationMock = vi.fn().mockResolvedValue({ id: 100 });
const addMessageMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../server/storage/fridayConversationStorage", () => ({
  createConversation: (...args: any[]) => createConversationMock(...args),
  listConversations: vi.fn().mockResolvedValue([]),
  getConversation: vi.fn().mockResolvedValue({ id: 100, title: "x" }),
  getMessages: vi.fn().mockResolvedValue([]),
  addMessage: (...args: any[]) => addMessageMock(...args),
  updateConversationTitle: vi.fn().mockResolvedValue(undefined),
  archiveConversation: vi.fn().mockResolvedValue(undefined),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}));

const TEST_USER = "user-1";
const TEST_ORG = 9;
const TEST_ROLE = "manager";

vi.mock("../server/routes/helpers", () => ({
  getUserIdFromRequest: (req: any) => req.headers?.["x-test-user-id"] as string | undefined,
  getUserOrgIds: async (userId: string | undefined) => (userId ? [TEST_ORG] : []),
  getUserOrgRole: async () => TEST_ROLE,
  logUserActivity: vi.fn().mockResolvedValue(undefined),
  classifyError: (e: unknown) => ({ status: 500, message: String(e) }),
  hasAdminAccess: () => false,
  userHasOrgAccess: async () => true,
  requireEmailVerified: async () => ({ verified: true }),
}));

async function buildApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  const { registerJarvisRoutes } = await import("../server/routes/jarvisRoutes");
  registerJarvisRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  checkAndEnforceLimitMock.mockReset();
  recordCreditUsageMock.mockReset();
  streamJarvisResponseMock.mockReset();
  executeJarvisActionMock.mockReset();
  createConversationMock.mockClear();
  addMessageMock.mockClear();

  // Default: under limit.
  checkAndEnforceLimitMock.mockResolvedValue({ allowed: true });
  recordCreditUsageMock.mockResolvedValue(undefined);

  // Default stream: one round, success → service triggers recordSuccess.
  streamJarvisResponseMock.mockImplementation(
    async (
      _orgId: number,
      _uid: string,
      _msgs: any[],
      _concise: boolean,
      _onChunk: any,
      onDone: any,
      _onError: any,
      meterPerCall: any,
    ) => {
      const { recordSuccess } = await meterPerCall(0, async () => undefined);
      await recordSuccess();
      onDone("ok");
    },
  );
});

describe("Friday chat route → real aiCredits → billing.recordCreditUsage (end-to-end billing)", () => {
  it("two distinct requests → two separate usage events with different requestIds", async () => {
    const app = await buildApp();
    const payload = {
      organizationId: TEST_ORG,
      conversationId: 100,
      messages: [{ role: "user" as const, content: "Same message twice" }],
    };

    await request(app).post("/api/jarvis/chat").set("x-test-user-id", TEST_USER).send(payload);
    await request(app).post("/api/jarvis/chat").set("x-test-user-id", TEST_USER).send(payload);

    expect(recordCreditUsageMock).toHaveBeenCalledTimes(2);
    // recordCreditUsage(userId, resourceType, resourceId, orgId, requestId)
    const [c1, c2] = recordCreditUsageMock.mock.calls;
    expect(c1[0]).toBe(TEST_USER);
    expect(c1[1]).toBe("ai_runs");
    expect(c1[3]).toBe(TEST_ORG);
    expect(c1[4]).not.toBe(c2[4]);
    expect(c1[2]).not.toBe(c2[2]);
    expect(c1[4]).toMatch(
      /^friday_chat_100_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_r0$/,
    );
  });

  it("client-supplied Idempotency-Key is IGNORED for billing — each request gets a fresh server requestId so OpenAI cannot be re-run for free", async () => {
    const app = await buildApp();
    const payload = {
      organizationId: TEST_ORG,
      conversationId: 100,
      messages: [{ role: "user" as const, content: "Retry me" }],
    };
    const idemKey = "client-supplied-key-xyz";

    await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .set("Idempotency-Key", idemKey)
      .send(payload);
    await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .set("Idempotency-Key", idemKey)
      .send(payload);

    expect(recordCreditUsageMock).toHaveBeenCalledTimes(2);
    const reqId1 = recordCreditUsageMock.mock.calls[0][4];
    const reqId2 = recordCreditUsageMock.mock.calls[1][4];
    // Critical billing-bypass guard: the server must NOT honor the
    // client-supplied key, so the two requestIds differ and the
    // usage_events table records both charges.
    expect(reqId1).not.toBe(reqId2);
    expect(reqId1).not.toContain(idemKey);
    expect(reqId2).not.toContain(idemKey);
  });

  it("over-limit user → 403 limitExceeded, recordCreditUsage never called", async () => {
    checkAndEnforceLimitMock.mockResolvedValueOnce({ allowed: false, error: "out of credits" });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        conversationId: 100,
        messages: [{ role: "user" as const, content: "hi" }],
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ limitExceeded: true, resourceType: "ai_runs" });
    expect(streamJarvisResponseMock).not.toHaveBeenCalled();
    expect(recordCreditUsageMock).not.toHaveBeenCalled();
  });

  it("over-limit user → no conversation created and no user message persisted (clean 403, no orphan state)", async () => {
    checkAndEnforceLimitMock.mockResolvedValueOnce({ allowed: false, error: "out of credits" });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        // No conversationId — would normally trigger createConversation.
        messages: [{ role: "user" as const, content: "first message" }],
      });

    expect(res.status).toBe(403);
    // Critical: enforce runs BEFORE persistence so the over-limit user
    // doesn't leave an orphan conversation/user message in the DB.
    expect(createConversationMock).not.toHaveBeenCalled();
    expect(addMessageMock).not.toHaveBeenCalled();
  });
});
