/**
 * Chat-route parity for the Anthropic provider.
 *
 * The existing jarvisRoutes.integration.test.ts mocks `streamJarvisResponse`
 * directly, so it doesn't actually exercise the Anthropic branch of the
 * service. This file plugs the real `jarvisService` into the route and the
 * mocked Anthropic SDK underneath, then drives end-to-end requests against
 * `/api/jarvis/chat` to prove the credit-metering contract is identical to
 * the OpenAI path:
 *
 *   - One pre-flight `enforceAiCredits` before any SSE bytes (with the
 *     base requestId).
 *   - Per Anthropic call: one `enforceAiCredits` + one `recordAiCredits`,
 *     each with the SAME round-suffixed requestId (`<base>_r0`, `_r1`, …).
 *   - Total `recordAiCredits` count == number of Anthropic calls (NOT one
 *     per HTTP turn).
 *
 * This is the route-level mirror of jarvisServiceAnthropic.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createAnthropicMock } from "./helpers/anthropicMock";

// --- DB stub: returns the org's Anthropic Friday config + the project +
// supports the create_task insert path used by the tool-loop test.
const dbState = {
  fridayAgentConfig: null as any,
  fiscalYearStartMonth: 1,
  onboardingCompleted: true as boolean,
  projectInOrg: true as boolean,
};
const insertedTaskRows: any[] = [];

function makeQueryBuilder(getResult: () => any[]) {
  const b: any = {};
  const asPromise = () => Promise.resolve(getResult());
  b.from = () => b;
  b.leftJoin = () => b;
  b.innerJoin = () => b;
  b.where = () => b;
  b.orderBy = () => b;
  b.groupBy = () => b;
  b.limit = () => b;
  b.then = (resolve: any, reject: any) => asPromise().then(resolve, reject);
  b.catch = (handler: any) => asPromise().catch(handler);
  return b;
}

vi.mock("../server/db", () => ({
  db: {
    select: (cols?: any) => {
      let result: any[] = [];
      if (cols && typeof cols === "object") {
        if ("fridayAgentConfig" in cols) {
          result = dbState.fridayAgentConfig
            ? [{ fridayAgentConfig: dbState.fridayAgentConfig }]
            : [];
        } else if ("fiscalYearStartMonth" in cols) {
          result = [{ fiscalYearStartMonth: dbState.fiscalYearStartMonth }];
        } else if ("onboardingCompleted" in cols) {
          result = [{ onboardingCompleted: dbState.onboardingCompleted }];
        } else if ("id" in cols && Object.keys(cols).length === 1) {
          result = dbState.projectInOrg ? [{ id: 1 }] : [];
        }
      }
      return makeQueryBuilder(() => result);
    },
    insert: (_table: any) => ({
      values: (vals: any) => ({
        returning: async () => {
          const row = { id: 999, ...vals };
          insertedTaskRows.push(row);
          return [row];
        },
      }),
    }),
    update: (_table: any) => ({
      set: () => ({ where: async () => undefined }),
    }),
    delete: (_table: any) => ({ where: async () => undefined }),
  },
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

const TEST_USER = "user-anthropic-route";
const TEST_ORG = 77;
const ANTHROPIC_KEY = "sk-ant-route-int-key";
const ANTHROPIC_MODEL = "claude-route-int-model";

// --- Mock helpers used by both the route and the service. We keep
// `decryptApiKey` as identity so the SDK constructor receives the raw
// stored value verbatim and we can assert it directly.
vi.mock("../server/routes/helpers", () => ({
  getUserIdFromRequest: (req: any) => req.headers?.["x-test-user-id"] as string | undefined,
  getUserOrgIds: async (userId: string | undefined) => (userId ? [TEST_ORG] : []),
  getUserOrgRole: async () => "manager",
  logUserActivity: vi.fn().mockResolvedValue(undefined),
  decryptApiKey: (s: string) => s,
  requireEmailVerified: async () => ({ verified: true }),
  classifyError: (e: unknown) => ({ status: 500, message: String(e) }),
  hasAdminAccess: () => false,
  userHasOrgAccess: async () => true,
}));

// Real aiCredits — we want to exercise the actual MeterPerCall plumbing
// the route builds. Spy on enforce/record so we can assert the contract.
const enforceSpy = vi.fn();
const recordSpy = vi.fn();
vi.mock("../server/services/aiCredits", async () => {
  const actual = await vi.importActual<any>("../server/services/aiCredits");
  return {
    ...actual,
    enforceAiCredits: async (ctx: any) => {
      enforceSpy(ctx);
      return { chargeUserId: ctx.userId };
    },
    recordAiCredits: async (userId: any, ctx: any) => {
      recordSpy(userId, ctx);
      return 100; // 1 credit (hundredths)
    },
  };
});

// Don't ship real billing / emails / heavy storage in tests.
vi.mock("../server/services/billing", () => ({
  checkAndEnforceLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordResourceUsage: vi.fn().mockResolvedValue(undefined),
  recordCreditUsage: vi.fn().mockResolvedValue(undefined),
  checkSeatLimit: vi.fn().mockResolvedValue({ allowed: true }),
  METER_CODES: { AI_RUNS: "ai_runs" },
  RESOURCE_TYPES: { AI_RUN: "ai_runs", TASK: "tasks" },
}));

vi.mock("../server/services/email", () => ({
  sendOrganizationInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getUser: vi.fn().mockResolvedValue(null),
    getOrganization: vi.fn().mockResolvedValue(null),
    getOrganizations: vi.fn().mockResolvedValue([]),
    getUserOrganizations: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../server/services/projectAnalytics", () => ({
  gatherProjectEvmSeries: vi.fn().mockResolvedValue([]),
  gatherProjectBurndowns: vi.fn().mockResolvedValue([]),
}));

// Friday conversation storage: in-memory so the route's pre-stream create
// resolves and the fire-and-forget addMessage doesn't blow up.
vi.mock("../server/storage/fridayConversationStorage", () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 4242 }),
  listConversations: vi.fn().mockResolvedValue([]),
  getConversation: vi.fn().mockResolvedValue(null),
  getMessages: vi.fn().mockResolvedValue([]),
  addMessage: vi.fn().mockResolvedValue(undefined),
  updateConversationTitle: vi.fn().mockResolvedValue(undefined),
  archiveConversation: vi.fn().mockResolvedValue(undefined),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}));

// Anthropic SDK swap — each test rebinds the harness with a fresh script.
let anthropicHarness: ReturnType<typeof createAnthropicMock> = createAnthropicMock([]);
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages: any;
    constructor(opts: any) {
      const inner = new anthropicHarness.MockAnthropic(opts);
      this.messages = inner.messages;
    }
  },
}));

async function buildApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  const { registerJarvisRoutes } = await import("../server/routes/jarvisRoutes");
  registerJarvisRoutes(app);
  return app;
}

// SSE responses come back as `data: {json}\n\n` chunks. Parse them into
// the structured payloads the client would see.
function parseSseEvents(body: string): any[] {
  return body
    .split("\n\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("data:"))
    .map((s) => {
      try {
        return JSON.parse(s.slice("data:".length).trim());
      } catch {
        return null;
      }
    })
    .filter((v) => v != null);
}

beforeEach(() => {
  vi.clearAllMocks();
  enforceSpy.mockReset();
  recordSpy.mockReset();
  dbState.fridayAgentConfig = {
    provider: "anthropic",
    useOrgAzure: false,
    azureEndpoint: "",
    azureApiKey: "",
    azureDeployment: "",
    azureApiVersion: "2024-12-01-preview",
    anthropicApiKey: ANTHROPIC_KEY,
    anthropicModel: ANTHROPIC_MODEL,
  };
  dbState.fiscalYearStartMonth = 1;
  dbState.onboardingCompleted = true;
  dbState.projectInOrg = true;
  insertedTaskRows.length = 0;
  anthropicHarness = createAnthropicMock([]);
});

describe("POST /api/jarvis/chat — Anthropic provider parity (route-level)", () => {
  it("single-round Anthropic call: one pre-flight enforce + one round-0 enforce/record pair via meterPerCall", async () => {
    anthropicHarness = createAnthropicMock([
      { blocks: [{ type: "text", text: "Hi from Claude over SSE." }], stopReason: "end_turn" },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        messages: [{ role: "user", content: "say hi" }],
      });

    expect(res.status).toBe(200);

    // The service actually hit the Anthropic SDK exactly once (proves we
    // really went down the Anthropic branch, not OpenAI).
    expect(anthropicHarness.callCount).toBe(1);
    expect(anthropicHarness.constructorCalls).toEqual([{ apiKey: ANTHROPIC_KEY }]);
    expect(anthropicHarness.streamCalls[0].model).toBe(ANTHROPIC_MODEL);

    // Pre-flight enforce (1) + per-call enforce inside meterPerCall (1) = 2.
    expect(enforceSpy).toHaveBeenCalledTimes(2);
    const baseCtx = enforceSpy.mock.calls[0][0];
    expect(baseCtx.userId).toBe(TEST_USER);
    expect(baseCtx.orgId).toBe(TEST_ORG);
    expect(baseCtx.action).toBe("friday_chat");
    expect(baseCtx.requestId).toMatch(
      /^friday_chat_(?:\d+|new)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Per-round enforce uses the round-0 suffix, identical contract to OpenAI.
    expect(enforceSpy.mock.calls[1][0].requestId).toBe(`${baseCtx.requestId}_r0`);

    // Exactly one Anthropic call -> exactly one recordAiCredits, with the
    // matching round-0 suffix.
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy.mock.calls[0][0]).toBe(TEST_USER);
    expect(recordSpy.mock.calls[0][1].requestId).toBe(`${baseCtx.requestId}_r0`);

    // SSE surface: text reached the client and the done frame includes
    // creditsUsed (the dollar-amount the route accumulates from per-round
    // record results) so the inline indicator can render.
    const events = parseSseEvents(res.text);
    const contentEvents = events.filter((e) => typeof e.content === "string");
    expect(contentEvents.map((e) => e.content).join("")).toContain("Hi from Claude over SSE.");
    const done = events.find((e) => e.done === true);
    expect(done).toBeTruthy();
    expect(done.creditsUsed).toBe(1); // 100 hundredths recorded once.
  });

  it("multi-round Anthropic tool loop: one enforce+record PER Anthropic call (not per HTTP turn), with monotonically suffixed requestIds", async () => {
    anthropicHarness = createAnthropicMock([
      // Round 0: model decides to call create_task.
      {
        blocks: [
          { type: "text", text: "Creating it now. " },
          {
            type: "tool_use",
            id: "toolu_route_r0",
            name: "create_task",
            input: { projectId: 1, name: "Route-int task", priority: "Medium" },
          },
        ],
        stopReason: "tool_use",
      },
      // Round 1: model wraps up after seeing the tool_result.
      {
        blocks: [{ type: "text", text: "Done — task created." }],
        stopReason: "end_turn",
      },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        messages: [{ role: "user", content: "Create a task in project 1" }],
      });

    expect(res.status).toBe(200);

    // Two Anthropic calls = two rounds in the tool loop, executed end-to-end
    // through the real service (not a mock).
    expect(anthropicHarness.callCount).toBe(2);
    // The tool actually fired (real handleToolCall path).
    expect(insertedTaskRows).toHaveLength(1);
    expect(insertedTaskRows[0]).toMatchObject({
      projectId: 1,
      name: "Route-int task",
      organizationId: TEST_ORG,
    });

    // Pre-flight enforce (1) + per-round enforce (2) = 3 enforce calls.
    expect(enforceSpy).toHaveBeenCalledTimes(3);
    // recordAiCredits fires ONCE PER Anthropic call — NOT once per HTTP
    // request. This is the single most important billing invariant.
    expect(recordSpy).toHaveBeenCalledTimes(2);

    const baseRequestId = enforceSpy.mock.calls[0][0].requestId;
    expect(enforceSpy.mock.calls[1][0].requestId).toBe(`${baseRequestId}_r0`);
    expect(enforceSpy.mock.calls[2][0].requestId).toBe(`${baseRequestId}_r1`);
    expect(recordSpy.mock.calls[0][1].requestId).toBe(`${baseRequestId}_r0`);
    expect(recordSpy.mock.calls[1][1].requestId).toBe(`${baseRequestId}_r1`);

    // SSE surface: text from BOTH rounds reached the client (round-0 text
    // streamed before the tool fired, round-1 final answer after).
    const events = parseSseEvents(res.text);
    const allText = events
      .filter((e) => typeof e.content === "string")
      .map((e) => e.content)
      .join("");
    expect(allText).toContain("Creating it now.");
    expect(allText).toContain("Done — task created.");
    const done = events.find((e) => e.done === true);
    expect(done).toBeTruthy();
    // Two rounds × 100 hundredths each = 2 credits accumulated.
    expect(done.creditsUsed).toBe(2);
  });

  it("returns 403 limitExceeded BEFORE opening SSE when pre-flight enforce throws — never opens an Anthropic stream", async () => {
    const aiCredits: any = await import("../server/services/aiCredits");
    enforceSpy.mockImplementationOnce(() => {
      throw new aiCredits.AiCreditsLimitError("AI credits exhausted");
    });

    anthropicHarness = createAnthropicMock([
      { blocks: [{ type: "text", text: "should never be sent" }], stopReason: "end_turn" },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post("/api/jarvis/chat")
      .set("x-test-user-id", TEST_USER)
      .send({
        organizationId: TEST_ORG,
        messages: [{ role: "user", content: "hi" }],
      });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ limitExceeded: true, resourceType: "ai_runs" });
    // No Anthropic calls, no recordAiCredits — the route bailed cleanly
    // before the stream opened, identical to the OpenAI behavior.
    expect(anthropicHarness.callCount).toBe(0);
    expect(recordSpy).not.toHaveBeenCalled();
  });
});
