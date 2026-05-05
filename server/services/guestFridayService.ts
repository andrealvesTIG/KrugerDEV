import OpenAI, { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getBuiltinAgentPromptOverride } from "../storage/builtinAgentSettingsStorage";

// Lightweight, dependency-free guest LLM client. Mirrors the platform-default
// resolution path used by the authenticated jarvisService but skips all org
// config lookups — guests have no org. Org-level Friday Agent settings,
// Anthropic, and per-org Azure deployments are intentionally not consulted
// here so we never accidentally bill a real org for an anonymous visitor.
function createGuestOpenAIClient(): { client: OpenAI; deployment: string; isAzure: boolean } {
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1";
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    return {
      client: new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
      }),
      deployment: azureDeployment,
      isAzure: true,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return { client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), deployment: "gpt-4o-mini", isAzure: false };
  }
  return {
    client: new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    }),
    deployment: "gpt-4o-mini",
    isAzure: false,
  };
}

const guestClient = createGuestOpenAIClient();

// Public-preview "Onboarding Agent" persona. Mirrors the in-app
// onboarding experience (which greets brand-new orgs and walks them
// through industry/focus selection) but stripped of every capability
// that requires an authenticated session — no tool calls, no
// configure_organization cards, no writes. The goal is for a curious
// visitor to feel exactly what they'd get after signing up: a warm,
// product-aware Friday who understands capital projects + project
// controls and can help them decide whether to create an account.
//
// This is the *default*. The voice/body portion is super-admin
// overridable via the "onboarding" key in builtin_agent_settings —
// the same knob that controls the post-signin onboarding directive,
// so admins edit the onboarding voice in one place and it affects
// both the public preview and the in-app first-time experience. The
// "enabled" toggle on the onboarding agent intentionally does NOT
// disable the public preview — guests are the entry point of the
// whole onboarding funnel, and an accidental admin click shouldn't
// take down the landing page. The toggle only suppresses the post-
// adoption directive (see jarvisService.ts).
export const FRIDAY_GUEST_SYSTEM_PROMPT = `You are Friday Report — the Onboarding Agent for FridayReport.AI, a Capital Projects PPM purpose-built for owners, EPCs, project controls teams, industrial automation / OT engineers, and construction GCs. Your name is "Friday Report" or simply "Friday." You are warm, professional, and genuinely excited to help.

You are talking to a visitor who has NOT signed in yet. They are trying out a free public preview to see what FridayReport.AI feels like before creating an account.

Your job in this conversation:
1. On the first turn, introduce yourself briefly as Friday and ask which of the four focus areas best fits their work — Capital Projects, Project Controls, Industrial Automation, or Construction — and what they're hoping to do (manage a portfolio, stand up project controls, run earned value, track risks/RFIs/issues, or just explore). Skip the question if they've already told you.
2. Once they share a focus, briefly confirm what you heard and tell them — in plain language — the kinds of projects, milestones, risks, and metrics FridayReport.AI would seed for them after signup. Tailor the example to their focus:
   - Capital Projects → FEL 1/2/3, FEED, Class 3 estimate, FID, IFC, mechanical completion, care-custody-control turnover.
   - Project Controls → PV/EV/AC, CPI, SPI, EAC, VAC, baselines, DCMA-14 schedule quality.
   - Industrial Automation → FAT, SAT, loop checks, ISA-88 / IEC 61511 / IEC 62443, hot cutover.
   - Construction → CSI MasterFormat, RFIs, submittals, punch list, substantial completion.
   - "Something else" / not listed → start with a generic Strategic Initiatives portfolio they can customize, and mention they can swap to one of the four focus areas later.
3. Answer follow-up questions about how FridayReport.AI handles portfolios, projects, risks, RFIs, change orders, EVM, status reports, dashboards, resources, financials, etc. Speak about features the product actually has — do NOT promise features you don't know about. If you're unsure, say so and suggest they sign up to explore.
4. When it's natural (after a focus is picked, after a feature question, or when they ask "what next?"), invite them warmly to create a free account. Phrase it as a benefit — e.g. "If you'd like, sign up and I'll seed a full demo portfolio tuned to {focus} so you can poke around with realistic data." Don't be pushy; one nudge per topic is plenty.

Hard constraints (very important):
- You have NO access to this visitor's projects, portfolios, risks, resources, dashboards, or any data. Never invent specific project names, IDs, owners, dates, percentages, EVM numbers, or any other metric. If they ask "what are my risks?" or "show my projects," politely explain you need them to sign in first to read their workspace, then offer the most helpful generic answer you can.
- You CANNOT call tools, create accounts, configure workspaces, send emails, or perform any write action in this preview. Never claim to have done so.
- Do NOT emit JSON cards, action buttons, "friday-card" / "friday-report" / "friday-gantt" fenced blocks, or any in-app links (no /portfolios/123, /projects/456, etc). Plain markdown only — headings, bullet lists, short tables — and only when they make the answer easier to scan.
- Keep replies focused and conversational: usually one or two short paragraphs plus a small list. This is a preview, not a research paper.`;

// Strip raw IPs and any header bag from logs so abusive traffic is logged
// without dragging PII into the server log stream.
function logSafeError(prefix: string, err: unknown): void {
  const e = err as { message?: string; status?: number; code?: string } | null;
  console.error(`[friday-guest] ${prefix}: status=${e?.status ?? "?"} code=${e?.code ?? "?"} msg=${e?.message ?? String(err)}`);
}

export interface GuestChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamGuestResponseOptions {
  history: GuestChatTurn[];
  onToken: (token: string) => void;
  onDone: (full: string) => void;
  onError: (err: Error) => void;
}

// Streams a single assistant turn from the platform-default LLM. Pure
// Q&A — no tool loop, no per-org config, no token-usage metering. The
// route caps history length BEFORE calling us so we trust the caller.
//
// System prompt resolution: super-admin override on the "onboarding"
// built-in agent (Super Admin → Agents → Built-in agents → Onboarding
// Agent → Default system prompt override) wins over the baked-in
// FRIDAY_GUEST_SYSTEM_PROMPT. Cached for 5s by
// builtinAgentSettingsStorage, so per-message lookup is effectively
// free.
export async function streamGuestFridayResponse({
  history,
  onToken,
  onDone,
  onError,
}: StreamGuestResponseOptions): Promise<void> {
  // Pull the admin override (if any) before opening the stream. We
  // resolve once per turn so prompt edits show up on the next message
  // rather than requiring a redeploy.
  const promptOverride = await getBuiltinAgentPromptOverride("onboarding").catch(() => null);
  const systemPrompt = promptOverride ?? FRIDAY_GUEST_SYSTEM_PROMPT;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const isAzure = guestClient.isAzure;
  // The Azure SDK requires the deployment id where the OpenAI SDK takes
  // a model name; pass-through preserves whichever the operator
  // configured.
  const model = guestClient.deployment;

  let fullText = "";
  try {
    // Streaming overload: passing `stream: true` returns an async
    // iterable of completion chunks. Typing it explicitly keeps the
    // chunk type honest without resorting to `as any` casts.
    const stream = await guestClient.client.chat.completions.create({
      model,
      messages,
      // Friday's voice is conversational; cap to keep guest replies snappy
      // and prevent runaway token bills on free traffic.
      temperature: 0.4,
      max_tokens: 700,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        fullText += delta;
        onToken(delta);
      }
    }
    onDone(fullText);
  } catch (err) {
    logSafeError(`stream failed (azure=${isAzure})`, err);
    const message =
      (err as { status?: number })?.status === 429
        ? "Friday is a little busy right now — please try again in a moment."
        : "Friday couldn't reply just now. Please try again.";
    onError(new Error(message));
  }
}
