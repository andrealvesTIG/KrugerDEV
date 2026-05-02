import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../server/db", () => ({
  db: {},
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

const enforceAiCreditsMock = vi.fn();
const recordAiCreditsMock = vi.fn();
const sendLimitExceededMock = vi.fn();
const writeSseLimitExceededMock = vi.fn();

class FakeAiCreditsLimitError extends Error {
  readonly limitExceeded = true as const;
  readonly resourceType = "ai_runs" as const;
  readonly status = 403 as const;
  constructor(message: string) {
    super(message);
    this.name = "AiCreditsLimitError";
  }
}

vi.mock("../server/services/aiCredits", () => ({
  enforceAiCredits: (...args: any[]) => enforceAiCreditsMock(...args),
  recordAiCredits: (...args: any[]) => recordAiCreditsMock(...args),
  sendLimitExceeded: (res: any, err: any) => {
    sendLimitExceededMock(err);
    if (err instanceof FakeAiCreditsLimitError) {
      if (!res.headersSent) {
        res.status(403).json({
          message: err.message,
          limitExceeded: true,
          resourceType: "ai_runs",
        });
      }
      return true;
    }
    return false;
  },
  writeSseLimitExceeded: (...args: any[]) => writeSseLimitExceededMock(...args),
  AiCreditsLimitError: FakeAiCreditsLimitError,
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
  getConversation: vi.fn().mockResolvedValue(null),
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
  enforceAiCreditsMock.mockReset();
  recordAiCreditsMock.mockReset();
  sendLimitExceededMock.mockReset();
  writeSseLimitExceededMock.mockReset();
  streamJarvisResponseMock.mockReset();
  executeJarvisActionMock.mockReset();
});

describe("POST /api/jarvis/chat — credit metering integration", () => {
  it("enforces credits before SSE, then records ONE credit per OpenAI call via meterPerCall (round-suffixed requestId)", async () => {
    enforceAiCreditsMock.mockResolvedValue({ chargeUserId: TEST_USER });
    recordAiCreditsMock.mockResolvedValue(undefined);

    // Simulate a single OpenAI call (no tool loop): meterPerCall(0) once,
    // then onDone. Per-call metering happens inside the stream via the
    // `meterPerCall` callback the route passes in.
    streamJarvisResponseMock.mockImplementation(
      async (
        _orgId: number,
        _uid: string,
        _msgs: any[],
        _concise: boolean,
        onChunk: (s: string) => void,
        onDone: (s: string) => void,
        _onError: any,
        meterPerCall: (round: number) => Promise<void>,
      ) => {
        await meterPerCall(0);
        onChunk("hello ");
        onChunk("world");
        onDone("hello world");
      },
    );

    const app = await buildApp();

    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        messages: [{ role: "user", content: "What is the status of project X?" }],
      });

    expect(res.status).toBe(200);
    expect(enforceAiCreditsMock).toHaveBeenCalledTimes(1);
    const enforceCtx = enforceAiCreditsMock.mock.calls[0][0];
    expect(enforceCtx.userId).toBe(TEST_USER);
    expect(enforceCtx.orgId).toBe(TEST_ORG);
    expect(enforceCtx.action).toBe("friday_chat");
    expect(enforceCtx.requestId).toMatch(/^friday_chat_\d+_[a-f0-9]{16}$/);

    // Exactly one OpenAI call -> exactly one recordAiCredits, with the
    // round-0 suffix derived from the upfront enforce requestId.
    expect(recordAiCreditsMock).toHaveBeenCalledTimes(1);
    expect(recordAiCreditsMock.mock.calls[0][0]).toBe(TEST_USER);
    const recordCtx = recordAiCreditsMock.mock.calls[0][1];
    expect(recordCtx.requestId).toBe(`${enforceCtx.requestId}_r0`);
  });

  it("records ONE credit PER OpenAI call when the model issues a tool loop (not just one credit per HTTP turn)", async () => {
    enforceAiCreditsMock.mockResolvedValue({ chargeUserId: TEST_USER });
    recordAiCreditsMock.mockResolvedValue(undefined);

    // Simulate a 3-round tool loop: 3 OpenAI calls in one HTTP request.
    streamJarvisResponseMock.mockImplementation(
      async (
        _orgId,
        _uid,
        _msgs,
        _concise,
        _onChunk,
        onDone,
        _onError,
        meterPerCall,
      ) => {
        await meterPerCall(0);
        await meterPerCall(1);
        await meterPerCall(2);
        onDone("done");
      },
    );

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        messages: [{ role: "user" as const, content: "Use the tools, please." }],
      });

    expect(res.status).toBe(200);
    expect(recordAiCreditsMock).toHaveBeenCalledTimes(3);
    const enforceReqId = enforceAiCreditsMock.mock.calls[0][0].requestId;
    expect(recordAiCreditsMock.mock.calls[0][1].requestId).toBe(`${enforceReqId}_r0`);
    expect(recordAiCreditsMock.mock.calls[1][1].requestId).toBe(`${enforceReqId}_r1`);
    expect(recordAiCreditsMock.mock.calls[2][1].requestId).toBe(`${enforceReqId}_r2`);
  });

  it("returns 403 limitExceeded JSON BEFORE opening SSE when credits are exhausted", async () => {
    enforceAiCreditsMock.mockRejectedValue(
      new FakeAiCreditsLimitError("AI credits exhausted"),
    );

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        messages: [{ role: "user", content: "hi" }],
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      limitExceeded: true,
      resourceType: "ai_runs",
    });
    expect(streamJarvisResponseMock).not.toHaveBeenCalled();
    expect(recordAiCreditsMock).not.toHaveBeenCalled();
  });

  it("derives a stable per-turn requestId — same conversation + same last message produce the same id", async () => {
    enforceAiCreditsMock.mockResolvedValue({ chargeUserId: TEST_USER });
    recordAiCreditsMock.mockResolvedValue(undefined);
    streamJarvisResponseMock.mockImplementation(
      async (_a, _b, _c, _d, _onChunk, onDone, _onErr, meterPerCall) => {
        await meterPerCall(0);
        onDone("ok");
      },
    );

    const fcMod = await import("../server/storage/fridayConversationStorage");
    (fcMod.getConversation as any).mockResolvedValue({ id: 100, title: "x" });

    const app = await buildApp();
    const payload = {
      organizationId: TEST_ORG,
      conversationId: 100,
      messages: [{ role: "user" as const, content: "Same message twice" }],
    };

    await request(app).post("/api/jarvis/chat").set("x-test-user-id", TEST_USER).send(payload);
    await request(app).post("/api/jarvis/chat").set("x-test-user-id", TEST_USER).send(payload);

    expect(enforceAiCreditsMock).toHaveBeenCalledTimes(2);
    const id1 = enforceAiCreditsMock.mock.calls[0][0].requestId;
    const id2 = enforceAiCreditsMock.mock.calls[1][0].requestId;
    expect(id1).toBe(id2);
  });
});

describe("POST /api/jarvis/action — credit metering integration", () => {
  it("enforces and records exactly one credit on a successful action with a stable requestId", async () => {
    enforceAiCreditsMock.mockResolvedValue({ chargeUserId: TEST_USER });
    recordAiCreditsMock.mockResolvedValue(undefined);
    executeJarvisActionMock.mockResolvedValue({ success: true, message: "ok", entityId: 5 });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/action")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        action: { type: "create_task", projectId: 1, data: { name: "T" } },
      });

    expect(res.status).toBe(200);
    expect(enforceAiCreditsMock).toHaveBeenCalledTimes(1);
    const ctx = enforceAiCreditsMock.mock.calls[0][0];
    expect(ctx.action).toBe("friday_action");
    expect(ctx.requestId).toMatch(/^friday_action_create_task_1_[a-f0-9]{16}$/);
    expect(recordAiCreditsMock).toHaveBeenCalledTimes(1);
    expect(recordAiCreditsMock.mock.calls[0][1].requestId).toBe(ctx.requestId);
  });

  it("does NOT record a credit when the action fails (no double-billing on no-op errors)", async () => {
    enforceAiCreditsMock.mockResolvedValue({ chargeUserId: TEST_USER });
    recordAiCreditsMock.mockResolvedValue(undefined);
    executeJarvisActionMock.mockResolvedValue({ success: false, message: "Project not in org" });

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/action")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        action: { type: "create_task", projectId: 1, data: { name: "T" } },
      });

    expect(res.status).toBe(200);
    expect(enforceAiCreditsMock).toHaveBeenCalledTimes(1);
    expect(recordAiCreditsMock).not.toHaveBeenCalled();
  });

  it("returns 403 limitExceeded JSON when credits are exhausted, without executing the action", async () => {
    enforceAiCreditsMock.mockRejectedValue(
      new FakeAiCreditsLimitError("AI credits exhausted"),
    );

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/action")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        action: { type: "create_task", projectId: 1, data: { name: "T" } },
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ limitExceeded: true, resourceType: "ai_runs" });
    expect(executeJarvisActionMock).not.toHaveBeenCalled();
    expect(recordAiCreditsMock).not.toHaveBeenCalled();
  });
});
