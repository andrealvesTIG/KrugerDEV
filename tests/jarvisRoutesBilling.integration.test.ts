/**
 * End-to-end billing-integrity test for the Friday chat route.
 *
 * Unlike `tests/jarvisRoutes.integration.test.ts`, this suite mocks ONLY
 * the lower-level `server/services/billing` module — `aiCredits.ts` runs
 * for real. That way we verify the full pipeline:
 *
 *   route → enforceAiCredits/recordAiCredits → billing.recordCreditUsage
 *
 * In particular this asserts the underlying `recordCreditUsage` is invoked
 * with a per-request requestId that:
 *   - Differs across two distinct identical-payload requests (so two
 *     usage_events rows would be written, not deduped).
 *   - Matches across two requests sharing an `Idempotency-Key` header
 *     (so a true network retry dedupes at the usage_events PK).
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

vi.mock("../server/storage/fridayConversationStorage", () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 100 }),
  listConversations: vi.fn().mockResolvedValue([]),
  getConversation: vi.fn().mockResolvedValue({ id: 100, title: "x" }),
  getMessages: vi.fn().mockResolvedValue([]),
  addMessage: vi.fn().mockResolvedValue(undefined),
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
  it("writes a usage event with a fresh per-request requestId for each distinct request (no content-hash dedup)", async () => {
    const app = await buildApp();
    const payload = {
      organizationId: TEST_ORG,
      conversationId: 100,
      messages: [{ role: "user" as const, content: "Same message twice" }],
    };

    await request(app).post("/api/jarvis/chat").set("x-test-user-id", TEST_USER).send(payload);
    await request(app).post("/api/jarvis/chat").set("x-test-user-id", TEST_USER).send(payload);

    // Stream mock invokes recordSuccess once per request → recordAiCredits
    // calls billing.recordCreditUsage exactly once per request.
    expect(recordCreditUsageMock).toHaveBeenCalledTimes(2);

    // recordCreditUsage signature: (userId, resourceType, resourceId, orgId, requestId)
    const [c1, c2] = recordCreditUsageMock.mock.calls;
    expect(c1[0]).toBe(TEST_USER);
    expect(c1[1]).toBe("ai_runs");
    expect(c1[3]).toBe(TEST_ORG);
    // The 5th arg is the requestId — must differ between the two calls so
    // the usage_events table records both, not dedupes.
    expect(c1[4]).not.toBe(c2[4]);
    // resourceId (3rd arg) is also the requestId in our recorder, so it
    // also differs — the unique key is honored at both DB columns.
    expect(c1[2]).not.toBe(c2[2]);
    // Each requestId is the route-derived format: friday_chat_<conv>_<uuid>_r0
    expect(c1[4]).toMatch(
      /^friday_chat_100_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_r0$/,
    );
  });

  it("explicit Idempotency-Key header → billing.recordCreditUsage gets the SAME requestId across attempts (true retry dedup)", async () => {
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
    // Both attempts share the same requestId — the underlying usage_events
    // table will dedupe via its requestId unique constraint.
    expect(reqId1).toBe(reqId2);
    expect(reqId1).toContain(idemKey);
  });

  it("does NOT call billing.recordCreditUsage when the user is over the AI-credits limit (no double-billing on 403)", async () => {
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
});
