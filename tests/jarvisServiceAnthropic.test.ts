/**
 * Anthropic-branch parity for the Friday Agent service:
 *
 *  - One-round Anthropic streaming meters credits the same way the OpenAI
 *    branch does (round-suffixed requestId, exactly one record per call).
 *  - Multi-round Anthropic tool loops fire `handleToolCall` and bill once
 *    per round (proving streamJarvisResponse never under-bills the loop on
 *    the Anthropic side).
 *  - `getOrgLlmProvider` returns the right discriminated-union shape for
 *    no-config / Azure-OpenAI / Anthropic configs.
 *  - The OpenAI→Anthropic tool-shape adapter preserves every entry in
 *    `jarvisTools` losslessly (name, description, schema).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAnthropicMock, type ScriptedRound } from "./helpers/anthropicMock";

// --- Mocks installed before importing the service-under-test ----------

// Mutable holders so each test can swap in different db responses without
// re-installing the module mock.
const dbState = {
  fridayAgentConfig: null as any,
  fiscalYearStartMonth: 1,
  onboardingCompleted: true as boolean,
  projects: [] as Array<{ id: number }>,
  // Used by `verifyProjectBelongsToOrg` and the empty-org early-return
  // path inside `gatherOrganizationContext`.
  projectInOrg: true as boolean,
};
const insertedTaskRows: any[] = [];

function makeQueryBuilder(getResult: () => any[]) {
  // A minimal chainable Drizzle stand-in. Every chainer returns the same
  // builder, which is itself thenable, so `await db.select().from(...).where(...).limit(N)`
  // resolves to `getResult()` regardless of how many chain steps run.
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
      // Decide what data the query returns based on the projected columns.
      // Drizzle table-column refs are objects, so we key off the alias keys
      // the caller chose — those are stable in jarvisService.
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
        } else if (
          // verifyProjectBelongsToOrg: db.select({ id: projects.id }).from(projects).where(...)
          "id" in cols &&
          Object.keys(cols).length === 1
        ) {
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

// Don't ship real emails or auth lookups in tests.
vi.mock("../server/routes/helpers", () => ({
  // Treat the stored value as plaintext so tests don't need to round-trip
  // through real crypto. The route-test file below covers real
  // encrypt/decrypt round-trips against the actual helpers module.
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

// Anthropic SDK swap: shared holder so each test can swap a fresh script.
let anthropicHarness: ReturnType<typeof createAnthropicMock> = createAnthropicMock([]);
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages: any;
      constructor(opts: any) {
        const inner = new anthropicHarness.MockAnthropic(opts);
        this.messages = inner.messages;
      }
    },
  };
});

// Real aiCredits — we want to exercise the actual MeterPerCall plumbing
// since it's the contract the route relies on. Imports below pick up the
// mocked billing module so no real DB writes happen.
import {
  enforceAiCredits,
  recordAiCredits,
  newAiRequestId,
  type MeterPerCall,
  type AiCreditContext,
} from "../server/services/aiCredits";

const TEST_ORG = 7;
const TEST_USER = "user-123";
const ANTHROPIC_KEY = "sk-ant-test-12345";
const ANTHROPIC_MODEL = "claude-test-model";

function makeMeterPerCall(creditCtx: AiCreditContext) {
  // Mirrors the per-round meter the chat route builds for streamJarvisResponse.
  const enforceCalls: AiCreditContext[] = [];
  const recordCalls: Array<{ userId: string | null | undefined; ctx: AiCreditContext }> = [];
  const meter: MeterPerCall = async <T>(round: number, fn: () => Promise<T>) => {
    const ctx = { ...creditCtx, requestId: `${creditCtx.requestId}_r${round}` };
    enforceCalls.push(ctx);
    const { chargeUserId } = await enforceAiCredits(ctx);
    const result = await fn();
    return {
      result,
      recordSuccess: async () => {
        recordCalls.push({ userId: chargeUserId, ctx });
        return await recordAiCredits(chargeUserId, ctx);
      },
    };
  };
  return { meter, enforceCalls, recordCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  dbState.projects = [];
  dbState.projectInOrg = true;
  insertedTaskRows.length = 0;
  anthropicHarness = createAnthropicMock([]);
});

// =====================================================================
// (a) Single-round metering — Anthropic mirror of the OpenAI integration.
// =====================================================================
describe("streamJarvisResponse — Anthropic branch credit metering", () => {
  it("single round: one anthropic.messages.stream call, exactly one recordAiCredits with round-0 suffixed requestId", async () => {
    anthropicHarness = createAnthropicMock([
      { blocks: [{ type: "text", text: "Hello from Claude." }], stopReason: "end_turn" },
    ]);

    const { streamJarvisResponse } = await import("../server/services/jarvisService");
    const baseRequestId = `friday_chat_42_${newAiRequestId()}`;
    const { meter, enforceCalls, recordCalls } = makeMeterPerCall({
      userId: TEST_USER,
      orgId: TEST_ORG,
      action: "friday_chat",
      requestId: baseRequestId,
    });

    const chunks: string[] = [];
    let fullResponse = "";
    let lastError: Error | null = null;
    await streamJarvisResponse(
      TEST_ORG,
      TEST_USER,
      [{ role: "user", content: "say hi" }],
      true,
      (s) => chunks.push(s),
      (full) => {
        fullResponse = full;
      },
      (err) => {
        lastError = err;
      },
      meter,
    );

    expect(lastError).toBeNull();
    expect(anthropicHarness.callCount).toBe(1);

    // Anthropic SDK constructor was given the decrypted org-scoped key.
    expect(anthropicHarness.constructorCalls).toEqual([{ apiKey: ANTHROPIC_KEY }]);
    // Stream args carry the org's chosen model + the system prompt.
    const streamArgs = anthropicHarness.streamCalls[0];
    expect(streamArgs.model).toBe(ANTHROPIC_MODEL);
    expect(typeof streamArgs.system).toBe("string");
    expect(Array.isArray(streamArgs.messages)).toBe(true);
    // Tools are advertised on every Anthropic call (mirrors OpenAI's tools).
    expect(Array.isArray(streamArgs.tools)).toBe(true);
    expect(streamArgs.tools.length).toBeGreaterThan(0);

    // Streaming surface: text deltas reached the SSE consumer.
    expect(chunks.join("")).toContain("Hello from Claude.");
    expect(fullResponse).toContain("Hello from Claude.");

    // Metering contract: one enforce + one record per Anthropic call,
    // round-0 suffixed requestId — same shape as the OpenAI branch.
    expect(enforceCalls).toHaveLength(1);
    expect(enforceCalls[0].requestId).toBe(`${baseRequestId}_r0`);
    expect(recordCalls).toHaveLength(1);
    expect(recordCalls[0].ctx.requestId).toBe(`${baseRequestId}_r0`);
  });

  // ===================================================================
  // (b) Multi-round tool loop — proves handleToolCall fires + per-round
  // metering on the Anthropic branch.
  // ===================================================================
  it("tool loop: round-0 tool_use → handleToolCall → round-1 final text; bills both rounds and forwards tool_result back to Anthropic", async () => {
    anthropicHarness = createAnthropicMock([
      // Round 0: model emits text + a tool_use block, asks to call create_task.
      {
        blocks: [
          { type: "text", text: "Sure — creating that task now. " },
          {
            type: "tool_use",
            id: "toolu_round0_create",
            name: "create_task",
            input: { projectId: 1, name: "New onboarding task", priority: "Medium" },
          },
        ],
        stopReason: "tool_use",
      },
      // Round 1: after tool result is folded back in, model wraps up.
      {
        blocks: [{ type: "text", text: "All done — task created." }],
        stopReason: "end_turn",
      },
    ]);

    const { streamJarvisResponse } = await import("../server/services/jarvisService");
    const baseRequestId = `friday_chat_55_${newAiRequestId()}`;
    const { meter, enforceCalls, recordCalls } = makeMeterPerCall({
      userId: TEST_USER,
      orgId: TEST_ORG,
      action: "friday_chat",
      requestId: baseRequestId,
    });

    const chunks: string[] = [];
    let fullResponse = "";
    let lastError: Error | null = null;
    await streamJarvisResponse(
      TEST_ORG,
      TEST_USER,
      [{ role: "user", content: "Create a task" }],
      true,
      (s) => chunks.push(s),
      (full) => {
        fullResponse = full;
      },
      (err) => {
        lastError = err;
      },
      meter,
    );

    expect(lastError).toBeNull();

    // Two Anthropic calls = two rounds in the tool loop.
    expect(anthropicHarness.callCount).toBe(2);

    // handleToolCall ran: the tool actually inserted a task row through
    // the mocked db.insert, with the args the model supplied.
    expect(insertedTaskRows).toHaveLength(1);
    expect(insertedTaskRows[0]).toMatchObject({
      projectId: 1,
      name: "New onboarding task",
      organizationId: TEST_ORG,
    });

    // Round 1 was sent BACK to Anthropic with the tool_use echo + tool_result
    // user message (Anthropic's required ordering for follow-up turns).
    const round1Args = anthropicHarness.streamCalls[1];
    const round1Messages = round1Args.messages as any[];
    // Last two entries are the assistant tool_use echo + the user tool_result.
    const assistantEcho = round1Messages[round1Messages.length - 2];
    const userToolResult = round1Messages[round1Messages.length - 1];
    expect(assistantEcho.role).toBe("assistant");
    expect(Array.isArray(assistantEcho.content)).toBe(true);
    expect(assistantEcho.content.some((b: any) => b.type === "tool_use" && b.name === "create_task")).toBe(true);
    expect(userToolResult.role).toBe("user");
    expect(Array.isArray(userToolResult.content)).toBe(true);
    expect(
      userToolResult.content.some(
        (b: any) => b.type === "tool_result" && b.tool_use_id === "toolu_round0_create",
      ),
    ).toBe(true);

    // Final answer reached the SSE consumer (round 1's text only — fullResponse
    // is reset at the end of round 0 so the round-0 text was already streamed
    // out via onChunk and isn't double-counted in fullResponse).
    expect(chunks.join("")).toContain("Sure — creating that task now.");
    expect(chunks.join("")).toContain("All done — task created.");
    expect(fullResponse).toContain("All done — task created.");

    // Per-round metering: one enforce + one record per Anthropic call,
    // each with the round-suffixed requestId. Critically, the record count
    // equals the number of Anthropic calls (NOT 1 per HTTP turn).
    expect(enforceCalls).toHaveLength(2);
    expect(recordCalls).toHaveLength(2);
    expect(enforceCalls[0].requestId).toBe(`${baseRequestId}_r0`);
    expect(enforceCalls[1].requestId).toBe(`${baseRequestId}_r1`);
    expect(recordCalls[0].ctx.requestId).toBe(`${baseRequestId}_r0`);
    expect(recordCalls[1].ctx.requestId).toBe(`${baseRequestId}_r1`);
  });
});

// =====================================================================
// (c) getOrgLlmProvider unit cases — three branches.
// =====================================================================
describe("getOrgLlmProvider", () => {
  it("returns the default OpenAI client when the org has no Friday Agent config", async () => {
    dbState.fridayAgentConfig = null;
    const { getOrgLlmProvider } = await import("../server/services/jarvisService");
    const provider = await getOrgLlmProvider(TEST_ORG);
    expect(provider.provider).toBe("openai");
    if (provider.provider !== "openai") throw new Error("type narrow failed");
    expect(provider.client).toBeDefined();
    expect(typeof provider.deployment).toBe("string");
    expect(typeof provider.isAzure).toBe("boolean");
  });

  it("returns an Azure OpenAI client when provider=openai + useOrgAzure with valid endpoint+key", async () => {
    dbState.fridayAgentConfig = {
      provider: "openai",
      useOrgAzure: true,
      azureEndpoint: "https://example-azure.openai.azure.com",
      azureApiKey: "azure-secret-plaintext",
      azureDeployment: "gpt-4.1-test-deployment",
      azureApiVersion: "2024-12-01-preview",
      anthropicApiKey: "",
      anthropicModel: "claude-3-5-sonnet-latest",
    };
    const { getOrgLlmProvider } = await import("../server/services/jarvisService");
    const provider = await getOrgLlmProvider(TEST_ORG);
    expect(provider.provider).toBe("openai");
    if (provider.provider !== "openai") throw new Error("type narrow failed");
    expect(provider.isAzure).toBe(true);
    expect(provider.deployment).toBe("gpt-4.1-test-deployment");
  });

  it("throws OrgLlmKeyError when provider=anthropic but the stored key cannot be decrypted (no silent OpenAI fallback)", async () => {
    // Swap the decryptApiKey mock to one that throws — mirrors a rotated
    // API_KEY_ENCRYPTION_KEY or a corrupted ciphertext in production.
    vi.resetModules();
    vi.doMock("../server/routes/helpers", () => ({
      decryptApiKey: () => {
        throw new Error("bad ciphertext");
      },
      requireEmailVerified: async () => ({ verified: true }),
      getUserOrgRole: async () => "manager",
      logUserActivity: vi.fn().mockResolvedValue(undefined),
    }));
    dbState.fridayAgentConfig = {
      provider: "anthropic",
      useOrgAzure: false,
      azureEndpoint: "",
      azureApiKey: "",
      azureDeployment: "",
      azureApiVersion: "2024-12-01-preview",
      anthropicApiKey: "garbled-ciphertext",
      anthropicModel: "claude-3-5-haiku-latest",
    };
    const { getOrgLlmProvider, OrgLlmKeyError } = await import("../server/services/jarvisService");
    await expect(getOrgLlmProvider(TEST_ORG)).rejects.toBeInstanceOf(OrgLlmKeyError);
    try {
      await getOrgLlmProvider(TEST_ORG);
    } catch (err: any) {
      expect(err.code).toBe("ORG_LLM_KEY_DECRYPT_FAILED");
      expect(err.provider).toBe("anthropic");
      expect(String(err.message)).toMatch(/Anthropic/i);
      expect(String(err.message)).toMatch(/re-enter/i);
    }
    // Restore the identity mock so later tests keep working.
    vi.doUnmock("../server/routes/helpers");
    vi.resetModules();
  });

  it("returns the Anthropic provider with decrypted key + configured model when provider=anthropic", async () => {
    dbState.fridayAgentConfig = {
      provider: "anthropic",
      useOrgAzure: false,
      azureEndpoint: "",
      azureApiKey: "",
      azureDeployment: "",
      azureApiVersion: "2024-12-01-preview",
      anthropicApiKey: "sk-ant-from-db",
      anthropicModel: "claude-3-5-haiku-latest",
    };
    const { getOrgLlmProvider } = await import("../server/services/jarvisService");
    const provider = await getOrgLlmProvider(TEST_ORG);
    expect(provider.provider).toBe("anthropic");
    if (provider.provider !== "anthropic") throw new Error("type narrow failed");
    expect(provider.apiKey).toBe("sk-ant-from-db"); // mocked decryptApiKey is identity
    expect(provider.model).toBe("claude-3-5-haiku-latest");
  });
});

// =====================================================================
// (d) Tool-shape adapter — every entry in jarvisTools survives intact.
// =====================================================================
describe("getAnthropicJarvisTools", () => {
  it("converts every OpenAI function tool into an Anthropic tool with name/description/input_schema preserved", async () => {
    const mod = await import("../server/services/jarvisService");
    const { jarvisTools, getAnthropicJarvisTools } = mod.__testExports__;
    const anthropicTools = getAnthropicJarvisTools();

    const openaiFns = jarvisTools.filter((t: any) => t.type === "function");
    expect(openaiFns.length).toBeGreaterThan(0);
    expect(anthropicTools).toHaveLength(openaiFns.length);

    for (let i = 0; i < openaiFns.length; i++) {
      const src: any = openaiFns[i].function;
      const dst: any = anthropicTools[i];
      expect(dst.name).toBe(src.name);
      expect(typeof dst.description).toBe("string");
      expect(dst.description.length).toBeGreaterThan(0);
      expect(dst.description).toBe(src.description);
      // The schema must round-trip verbatim — no field drops, no
      // re-typing — so the model gets the same tool contract on both
      // providers.
      expect(dst.input_schema).toEqual(src.parameters);
    }
  });

  it("returns a stable cached instance on subsequent calls (no per-request rebuild)", async () => {
    const { __testExports__ } = await import("../server/services/jarvisService");
    const a = __testExports__.getAnthropicJarvisTools();
    const b = __testExports__.getAnthropicJarvisTools();
    expect(a).toBe(b);
  });
});
