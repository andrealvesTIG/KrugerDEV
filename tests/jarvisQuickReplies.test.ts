/**
 * Friday Yes/No quick-reply chip behaviour.
 *
 * These tests guard the contract introduced by task-126: when Friday asks a
 * Yes/No question or asks the user to confirm a non-destructive write
 * action, the system prompt must REQUIRE a `quick-replies` chip block (or,
 * for confirmations, an equivalent friday-card with Confirm/Cancel
 * buttons), and the existing UI parser must keep handling those chip
 * blocks end-to-end.
 *
 * We can't deterministically test what an LLM emits at runtime, so the
 * server-side checks instead pin down the prompt directives that drive
 * that behaviour. The parser checks lock in the chip-rendering contract
 * the side-panel and AI-mode page rely on.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tryParseQuickReplies } from "../client/src/components/jarvis/jarvis-shared";
import { createAnthropicMock } from "./helpers/anthropicMock";

// --- DB stub (shared by the integration block below). Mirrors the
// minimal in-memory shape used by tests/jarvisServiceAnthropic.test.ts so
// streamJarvisResponse can resolve the org's Anthropic config + verify
// project ownership without touching a real database.
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
    insert: () => ({
      values: () => ({ returning: async () => [{ id: 1 }] }),
    }),
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

import {
  __testExports__,
  FRIDAY_DEFAULT_SYSTEM_PROMPT,
} from "../server/services/jarvisService";

const { QUICK_REPLIES_DIRECTIVE } = __testExports__;

describe("QUICK_REPLIES_DIRECTIVE — Yes/No + non-destructive confirmation requirements", () => {
  it("declares the directive as REQUIRED for any Yes/No question, with default Yes/No labels", () => {
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/REQUIRED/);
    // Spell out the trigger explicitly so the LLM can't mistake it for a
    // soft preference.
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/Yes\/No question/i);
    // Default labels for a plain Yes/No question.
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/"Yes"/);
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/"No"/);
  });

  it("requires either a friday-card OR a quick-replies block for non-destructive write confirmations, never neither", () => {
    // The non-destructive write actions enumerated in the task spec.
    const requiredActions = [
      "create_task",
      "create_mitigation",
      "assign_owner",
      "add_note",
      "flag_for_review",
      "update_status",
    ];
    for (const action of requiredActions) {
      expect(QUICK_REPLIES_DIRECTIVE).toContain(action);
    }
    // Confirmation chip labels are mandated.
    expect(QUICK_REPLIES_DIRECTIVE).toContain("Yes, proceed");
    expect(QUICK_REPLIES_DIRECTIVE).toContain("No, cancel");
    // The "either friday-card or chips, never neither" rule must be
    // explicit so the model treats it as binding.
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/with neither|never neither/i);
    expect(QUICK_REPLIES_DIRECTIVE.toLowerCase()).toContain("friday-card");
  });

  it("still excludes open-ended free-form answers and destructive deletes", () => {
    // Open-ended → typing only.
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/DO NOT|Do NOT/);
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/free-form|open-ended/i);
    // Destructive deletes keep the existing destructive-card pattern.
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/delete_/);
    expect(QUICK_REPLIES_DIRECTIVE.toLowerCase()).toContain("destructive");
  });

  it("requires multi-choice clarifying questions to offer chips when the answer set is small + discrete", () => {
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/Which project\?/);
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/Which timeframe\?/);
  });

  it("keeps the supplement-not-replace rule so the question text always stays in the prose", () => {
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/supplement.*(not|never)\s+replace/i);
  });

  it("declares an explicit PRECEDENCE rule so a friday-card with Confirm/Cancel always wins over chips for the same action", () => {
    // The precedence section must call itself out so the model treats it
    // as binding, and must say the card wins (not the other way around).
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/PRECEDENCE/);
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/friday-card always wins over chips/i);
    // The exception MUST be wired into the Yes/No bullet too, otherwise
    // the model can read "MUST emit on every Yes/No question" as
    // overriding the precedence note above.
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/EXCEPTION/);
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/the card IS the answer surface/);
    // And the closing reminder reinforces the same tiebreaker.
    expect(QUICK_REPLIES_DIRECTIVE).toMatch(/when in doubt, the friday-card wins/i);
  });
});

describe("FRIDAY_DEFAULT_SYSTEM_PROMPT — confirmation guideline references chips", () => {
  it("includes the strengthened QUICK_REPLIES_DIRECTIVE verbatim", () => {
    expect(FRIDAY_DEFAULT_SYSTEM_PROMPT).toContain(QUICK_REPLIES_DIRECTIVE);
  });

  it("requires non-destructive confirmation prompts to ship with EITHER a friday-card OR a quick-replies block", () => {
    // The bullet must mention both options + the "never neither" wording
    // so the model treats the chip/card pair as a closed choice.
    const guidelines = FRIDAY_DEFAULT_SYSTEM_PROMPT;
    expect(guidelines).toMatch(/non-destructive write actions/i);
    expect(guidelines).toMatch(/quick-replies/);
    expect(guidelines).toMatch(/Confirm \+ Cancel|Confirm and Cancel/);
    expect(guidelines).toMatch(/never neither/i);
  });

  it("still steers destructive actions to the destructive friday-card pattern (no behaviour change)", () => {
    expect(FRIDAY_DEFAULT_SYSTEM_PROMPT).toMatch(/Destructive actions.*destructive friday-card pattern/i);
  });
});

describe("tryParseQuickReplies — UI chip parser still handles the expected payload shapes", () => {
  it("accepts the canonical {options:[...]} object emitted by the directive's example", () => {
    const json = '{"options":["Yes, proceed","No, cancel","Show me more details"]}';
    expect(tryParseQuickReplies(json)).toEqual([
      "Yes, proceed",
      "No, cancel",
      "Show me more details",
    ]);
  });

  it("accepts a bare JSON array as a tolerant fallback", () => {
    expect(tryParseQuickReplies('["Yes","No"]')).toEqual(["Yes", "No"]);
  });

  it("accepts {label} object entries (richer chip shape)", () => {
    const json = '{"options":[{"label":"Yes, proceed"},{"label":"No, cancel"}]}';
    expect(tryParseQuickReplies(json)).toEqual(["Yes, proceed", "No, cancel"]);
  });

  it("trims whitespace and skips empty/non-string entries instead of dropping the whole block", () => {
    const json = '{"options":["  Yes  ","",null,"No"]}';
    expect(tryParseQuickReplies(json)).toEqual(["Yes", "No"]);
  });

  it("returns null for malformed JSON so the renderer can fall back to a raw code block", () => {
    expect(tryParseQuickReplies("not json at all")).toBeNull();
  });

  it("caps the chip count at 8 so the row never explodes", () => {
    const opts = Array.from({ length: 12 }, (_, i) => `opt${i}`);
    const parsed = tryParseQuickReplies(JSON.stringify({ options: opts }));
    expect(parsed).not.toBeNull();
    expect(parsed!.length).toBe(8);
  });
});

// =====================================================================
// Integration-style tests: drive `streamJarvisResponse` through the
// Anthropic mock and confirm
//   (a) the system prompt actually carried to the model contains the
//       Yes/No + non-destructive-confirmation chip requirements, and
//   (b) when the model emits a quick-replies fenced block (as the
//       directive instructs it to), the SSE/onChunk stream forwards the
//       block intact so the side-panel + AI-mode parser can render it.
//
// We can't deterministically test what an LLM produces; what we CAN
// test is that the contract Friday hands the model is the right one,
// and that the rendering pipeline accepts a directive-shaped reply.
// =====================================================================
const TEST_USER = "user-qr-int";
const TEST_ORG = 99;
const ANTHROPIC_KEY = "sk-ant-qr-int";
const ANTHROPIC_MODEL = "claude-qr-int";

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
  dbState.projectInOrg = true;
  anthropicHarness = createAnthropicMock([]);
});

async function runFriday(userPrompt: string, scriptedReply: string) {
  anthropicHarness = createAnthropicMock([
    { blocks: [{ type: "text", text: scriptedReply }], stopReason: "end_turn" },
  ]);
  const { streamJarvisResponse } = await import("../server/services/jarvisService");
  const meter = async <T>(_round: number, fn: () => Promise<T>) => ({
    result: await fn(),
    recordSuccess: async () => 100,
  });
  const chunks: string[] = [];
  let full = "";
  let lastError: Error | null = null;
  await streamJarvisResponse(
    TEST_ORG,
    TEST_USER,
    [{ role: "user", content: userPrompt }],
    true,
    (s) => chunks.push(s),
    (f) => {
      full = f;
    },
    (e) => {
      lastError = e;
    },
    meter,
  );
  return { chunks, full, lastError, streamArgs: anthropicHarness.streamCalls[0] };
}

describe("streamJarvisResponse — system prompt carries the chip requirement to the model", () => {
  it.each([
    ["Yes/No question prompt", "Should we include closed projects in the report?"],
    ["non-destructive create_task confirmation prompt", "Create a task called Foo on project 42"],
    ["non-destructive update_status prompt", "Mark issue #7 as resolved"],
    ["non-destructive assign_owner prompt", "Assign Jane as owner of task 3"],
  ])(
    "for %s, the system prompt sent to Anthropic includes the Yes/No + non-destructive chip requirements",
    async (_label, userPrompt) => {
      const { streamArgs, lastError } = await runFriday(
        userPrompt,
        "Got it. (mocked reply — chip emission is the LLM's job, contract is asserted on the prompt.)",
      );
      expect(lastError).toBeNull();
      const system = streamArgs.system as string;
      expect(typeof system).toBe("string");
      // The chip directive itself must travel to the model on every call,
      // verbatim, so the LLM sees the binding "REQUIRED" rule.
      expect(system).toContain(QUICK_REPLIES_DIRECTIVE);
      // Both the Yes/No question rule AND the non-destructive write
      // confirmation rule must be in scope for these prompts.
      expect(system).toMatch(/Yes\/No question/);
      expect(system).toMatch(/non-destructive write/);
      expect(system).toContain("Yes, proceed");
      expect(system).toContain("No, cancel");
    },
  );

  it("for an open-ended free-form prompt, the same prompt still carries the 'Do NOT use chips for free-form answers' exclusion", async () => {
    const { streamArgs, lastError } = await runFriday(
      "What should the new task be called?",
      "Sure — what name would you like? (mocked open-ended reply)",
    );
    expect(lastError).toBeNull();
    const system = streamArgs.system as string;
    // The exclusion that prevents chips on free-form answers must be
    // present so the model knows not to attach a chip block here.
    expect(system).toMatch(/Do NOT/);
    expect(system).toMatch(/free-form|open-ended/i);
  });
});

describe("streamJarvisResponse — chip-bearing model replies survive the SSE pipeline intact", () => {
  it("forwards a fenced quick-replies block (Yes/No defaults) end-to-end so the renderer parses two chip options", async () => {
    const reply =
      "Sure — should I include closed projects?\n\n" +
      "```quick-replies\n" +
      '{"options":["Yes","No"]}\n' +
      "```";
    const { chunks, full, lastError } = await runFriday(
      "Should I include closed projects in the report?",
      reply,
    );
    expect(lastError).toBeNull();
    // The SSE consumer sees the chip fence + payload character-for-character.
    expect(chunks.join("")).toContain("```quick-replies");
    expect(chunks.join("")).toContain('{"options":["Yes","No"]}');
    expect(full).toContain("```quick-replies");
    // And the renderer's parser actually accepts what came out the other
    // side — closing the loop from Anthropic stream → SSE → MarkdownContent.
    const fenceStart = full.indexOf("```quick-replies\n");
    const payloadStart = fenceStart + "```quick-replies\n".length;
    const fenceEnd = full.indexOf("\n```", payloadStart);
    const jsonText = full.slice(payloadStart, fenceEnd).trim();
    expect(tryParseQuickReplies(jsonText)).toEqual(["Yes", "No"]);
  });

  it("forwards a non-destructive confirmation chip block ('Yes, proceed' / 'No, cancel') intact", async () => {
    const reply =
      "I'll create a task called \"Foo\" on project 42. Confirm?\n\n" +
      "```quick-replies\n" +
      '{"options":["Yes, proceed","No, cancel"]}\n' +
      "```";
    const { full, lastError } = await runFriday(
      "Create a task called Foo on project 42",
      reply,
    );
    expect(lastError).toBeNull();
    const fenceStart = full.indexOf("```quick-replies\n");
    expect(fenceStart).toBeGreaterThanOrEqual(0);
    const payloadStart = fenceStart + "```quick-replies\n".length;
    const fenceEnd = full.indexOf("\n```", payloadStart);
    const jsonText = full.slice(payloadStart, fenceEnd).trim();
    const parsed = tryParseQuickReplies(jsonText);
    expect(parsed).toEqual(["Yes, proceed", "No, cancel"]);
    // Confirmation chips MUST contain at least these two options per the
    // directive contract.
    expect(parsed).toContain("Yes, proceed");
    expect(parsed).toContain("No, cancel");
    expect(parsed!.length).toBeGreaterThanOrEqual(2);
  });

  it("forwards a chip-less open-ended reply unchanged so no chips are rendered for free-form questions", async () => {
    const reply = "What name would you like for the task?";
    const { full, lastError } = await runFriday(
      "What should the new task be called?",
      reply,
    );
    expect(lastError).toBeNull();
    // No fence at all — the renderer will fall through to plain text.
    expect(full).not.toContain("```quick-replies");
  });
});
