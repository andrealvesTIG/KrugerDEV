/**
 * Real-service test for the OpenAI tool-loop refund-on-failure contract.
 *
 * Exercises the actual `streamJarvisResponse` OpenAI branch (no
 * `streamJarvisResponse` mock) and asserts that when a tool returns a
 * structured `{success:false,...}` payload — i.e. a non-throw logical
 * failure, the most common case for validation / not-found / permission
 * errors — the round's credit is NOT debited. The route-level
 * `jarvisRoutesBilling.integration.test.ts` covers the wire-up; this
 * test covers the service-internal decision.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dbState = {
  fridayAgentConfig: null as any,
  fiscalYearStartMonth: 1,
  onboardingCompleted: true as boolean,
  projectInOrg: true as boolean,
};

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
    insert: () => ({ values: () => ({ returning: async () => [{ id: 1 }] }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    delete: () => ({ where: async () => undefined }),
  },
  pool: { on: () => {}, query: () => Promise.resolve() },
}));

vi.mock("../server/routes/helpers", () => ({
  decryptApiKey: (s: string) => s,
  requireEmailVerified: async () => ({ verified: true }),
  getUserOrgRole: async () => "manager",
  logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

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

// Scripted OpenAI stream. Each round returns an async iterable producing
// the deltas + finish_reason we want streamJarvisResponse to observe.
type Round =
  | { kind: "tool_call"; toolName: string; toolArgs: Record<string, any>; callId: string }
  | { kind: "final"; text: string };

let scriptedRounds: Round[] = [];
let createCallCount = 0;
const createCalls: any[] = [];

function buildStream(round: Round): AsyncIterable<any> {
  return {
    async *[Symbol.asyncIterator]() {
      if (round.kind === "final") {
        yield { choices: [{ index: 0, delta: { content: round.text }, finish_reason: null }] };
        yield { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
        return;
      }
      // tool_call round — emit a single tool_calls delta then finish_reason
      yield {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: round.callId,
                  function: { name: round.toolName, arguments: JSON.stringify(round.toolArgs) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
      yield { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] };
    },
  };
}

vi.mock("openai", () => {
  class FakeOpenAI {
    chat: any;
    constructor(_opts: any) {
      this.chat = {
        completions: {
          create: async (args: any) => {
            createCalls.push(args);
            const round = scriptedRounds[createCallCount] ?? { kind: "final", text: "" };
            createCallCount++;
            return buildStream(round);
          },
        },
      };
    }
  }
  return { default: FakeOpenAI, AzureOpenAI: FakeOpenAI };
});

import {
  enforceAiCredits,
  recordAiCredits,
  newAiRequestId,
  type MeterPerCall,
  type AiCreditContext,
} from "../server/services/aiCredits";

function makeMeterPerCall(creditCtx: AiCreditContext) {
  const enforceCalls: AiCreditContext[] = [];
  const recordCalls: Array<{ ctx: AiCreditContext }> = [];
  const meter: MeterPerCall = async <T>(round: number, fn: () => Promise<T>) => {
    const ctx = { ...creditCtx, requestId: `${creditCtx.requestId}_r${round}` };
    enforceCalls.push(ctx);
    const { chargeUserId } = await enforceAiCredits(ctx);
    const result = await fn();
    return {
      result,
      recordSuccess: async () => {
        recordCalls.push({ ctx });
        return await recordAiCredits(chargeUserId, ctx);
      },
    };
  };
  return { meter, enforceCalls, recordCalls };
}

const TEST_ORG = 7;
const TEST_USER = "user-tool-fail";

beforeEach(() => {
  vi.clearAllMocks();
  dbState.fridayAgentConfig = null; // → built-in OpenAI provider
  dbState.fiscalYearStartMonth = 1;
  dbState.onboardingCompleted = true;
  dbState.projectInOrg = true;
  scriptedRounds = [];
  createCallCount = 0;
  createCalls.length = 0;
  process.env.OPENAI_API_KEY = "sk-test-fake";
});

describe("streamJarvisResponse — OpenAI tool loop refund-on-failure", () => {
  it("non-throw tool failure ({success:false}) skips the round's credit debit", async () => {
    // Round 0: model asks to create_task WITHOUT a projectId. The real
    // handleToolCall short-circuits and returns
    // `{success:false,message:"Valid projectId is required."}` — a
    // logical failure that does NOT throw.
    // Round 1: model wraps up with plain text.
    scriptedRounds = [
      {
        kind: "tool_call",
        toolName: "create_task",
        toolArgs: { name: "missing project id task" },
        callId: "call_round0",
      },
      { kind: "final", text: "Sorry, I could not create that task." },
    ];

    const { streamJarvisResponse } = await import("../server/services/jarvisService");
    const baseRequestId = `friday_chat_test_${newAiRequestId()}`;
    const { meter, enforceCalls, recordCalls } = makeMeterPerCall({
      userId: TEST_USER,
      orgId: TEST_ORG,
      action: "friday_chat",
      requestId: baseRequestId,
    });

    let lastError: Error | null = null;
    let fullResponse = "";
    await streamJarvisResponse(
      TEST_ORG,
      TEST_USER,
      [{ role: "user", content: "Create a task please" }],
      true,
      () => {},
      (full) => { fullResponse = full; },
      (err) => { lastError = err; },
      meter,
    );

    expect(lastError).toBeNull();
    // Two OpenAI calls = two tool-loop rounds.
    expect(createCallCount).toBe(2);

    // The tool result the service fed back into round 1 must be the
    // structured failure payload (proves handleToolCall actually ran
    // and returned the non-throw `{success:false}` shape).
    const round1Args = createCalls[1];
    const toolMsg = (round1Args.messages as any[]).find(
      (m) => m.role === "tool" && m.tool_call_id === "call_round0",
    );
    expect(toolMsg).toBeTruthy();
    const parsedToolResult = JSON.parse(toolMsg.content);
    expect(parsedToolResult.success).toBe(false);
    expect(typeof parsedToolResult.message).toBe("string");

    // Metering contract — the heart of the test:
    //   - enforce ran on BOTH rounds (pre-flight credit check is mandatory)
    //   - record ran ONLY on round 1 (round 0 was skipped because its
    //     follow-up tool failed structurally)
    expect(enforceCalls).toHaveLength(2);
    expect(recordCalls).toHaveLength(1);
    expect(recordCalls[0].ctx.requestId).toBe(`${baseRequestId}_r1`);

    // Final text reached the consumer.
    expect(fullResponse).toContain("Sorry, I could not create that task.");
  });

  it("baseline: when the tool succeeds, both rounds ARE debited", async () => {
    // Sanity check that we aren't accidentally always skipping. Round 0
    // asks to flag_project_for_review with a valid projectId; the mocked
    // db sees `projectInOrg=true` so handleToolCall returns a success
    // payload and round 0 IS debited.
    scriptedRounds = [
      {
        kind: "tool_call",
        toolName: "flag_project_for_review",
        toolArgs: { projectId: 1, reason: "needs PMO eyes" },
        callId: "call_ok",
      },
      { kind: "final", text: "Flagged for review." },
    ];

    const { streamJarvisResponse } = await import("../server/services/jarvisService");
    const baseRequestId = `friday_chat_ok_${newAiRequestId()}`;
    const { meter, recordCalls } = makeMeterPerCall({
      userId: TEST_USER,
      orgId: TEST_ORG,
      action: "friday_chat",
      requestId: baseRequestId,
    });

    await streamJarvisResponse(
      TEST_ORG,
      TEST_USER,
      [{ role: "user", content: "Flag project 1 for review" }],
      true,
      () => {},
      () => {},
      () => {},
      meter,
    );

    // Both rounds debited — this exact same code path is what the
    // failing-tool case turns off, so the contrast proves the
    // refund-by-skip is gated on the tool's success payload.
    expect(recordCalls).toHaveLength(2);
  });
});
