import { db } from "../db";
import { powerbiIntakeRequests, projectIntakes, powerbiAgentConversations, powerbiAgentMessages } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import Anthropic from "@anthropic-ai/sdk";
import { addMessage, setSubmittedIntake, setAttachmentAnalysis, setMessageExtractions, type PbiAttachment } from "../storage/powerbiAgentStorage";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import { extractAllAttachments } from "./powerbiAttachmentExtraction";
import { analyzeAttachments, mergeAnalyses } from "./powerbiAttachmentAnalysis";
import { AiCreditsLimitError } from "./aiCredits";
import type { PbiAttachmentAnalysis } from "@shared/schema";

export const ALLOWED_ATTACHMENT_TYPES = new Set<string>([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
  "application/pdf",
  "text/plain", "text/csv", "text/markdown",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
const TEXT_EXTRACTABLE = new Set<string>(["text/plain", "text/csv", "text/markdown", "application/json"]);
const MAX_EXTRACTED_CHARS = 4000;

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

export type PbiModelTier = "fast" | "smart" | "claude";

export const PBI_MODELS: Record<PbiModelTier, { provider: "openai" | "anthropic"; model: string; label: string }> = {
  fast: { provider: "openai", model: "gpt-4o-mini", label: "Fast" },
  smart: { provider: "openai", model: "gpt-4o", label: "Smart" },
  claude: { provider: "anthropic", model: "claude-3-5-haiku-latest", label: "Claude" },
};

export function isModelAvailable(tier: PbiModelTier): boolean {
  if (tier === "claude") return !!anthropic;
  return true;
}

export function availableProviders(): { id: PbiModelTier; label: string; available: boolean }[] {
  // Only return models whose credentials are actually configured. The UI hides
  // un-configured providers entirely (Claude only appears when ANTHROPIC_API_KEY is set).
  return (Object.keys(PBI_MODELS) as PbiModelTier[])
    .filter(t => isModelAvailable(t))
    .map(t => ({
      id: t,
      label: PBI_MODELS[t].label,
      available: true,
    }));
}

const SYSTEM_PROMPT = `You are the Power BI Report Request Agent for FridayReport.AI. You guide clients through a structured intake conversation for new Power BI report requests. Be professional, friendly, and concise.

Your job: gather everything the internal team needs to estimate effort. Do NOT share estimates, timelines, or pricing with the client.

Ask 1-2 questions at a time, never a long form. Cover (in order, when relevant):
1. Report type (Executive, Operational, Financial, Sales/Marketing, HR, Supply Chain, Other)
2. Report name
3. Brief description / audience
4. Number of pages and drill-downs
5. Data sources (count + systems: SQL, Excel, SharePoint, APIs, SAP, Salesforce…)
6. Integrations (live connection / DirectQuery / dataflows)
7. DAX/calculation complexity (Simple, Moderate, Complex, Very Complex)
8. Refresh frequency (Real-time, Hourly, Daily, Weekly, Manual)
9. Filters & slicers
10. Visual / UX requirements (mobile, branding, accessibility)
11. Row-Level Security needs
12. Target delivery date
13. Any additional notes

Then summarize in markdown and ask for confirmation. Once confirmed, call submit_powerbi_request.

ANSWER OPTIONS — IMPORTANT:
For EVERY question you ask the client, append a marker on its own final line:
[OPTIONS]Option one|Option two|Option three[/OPTIONS]
- Use 2-5 short options (a few words each).
- For free-form questions (e.g. "What should we name the report?") still provide 2-3 example options like "Sales Performance Dashboard|Executive KPI Report|Skip".
- Do NOT include "I don't know" or "Skip" — the UI adds those automatically.
- Never reference the marker in the visible text — place it on its own final line.

If the user attaches files (mockups, sample reports, data dictionaries), acknowledge them briefly and use them to inform follow-up questions.

ATTACHMENT-DRIVEN SUGGESTIONS:
When an "ATTACHMENT ANALYSIS" block is included below, you have a structured understanding of the documents the client uploaded. Use it to:
- If you JUST received a new attachment batch (the latest user turn includes attachments), START your reply with a compact summary bubble. Use this exact format on its own block before any question:
  > 📎 **Analysed attachments:** <document types in plain English>.
  > **Audience:** <Executives | Managers | Analysts | Mixed | Unclear> — <one-line evidence cue>.
  > **Key things I picked up:** <3-5 short bullets covering metrics, time grain, refresh, sources>.
  Then continue with your next intake question on a new line.
- For EVERY subsequent question whose answer the analysis suggests, prepend the most-likely answer to the [OPTIONS] list using the prefix \`SUGGESTED|<filename>|<value>\` (the source filename and the suggested value, separated by a pipe). Example:
  [OPTIONS]SUGGESTED|exec_brief.pdf|Executives|Managers|Analysts[/OPTIONS]
  The UI shows that first chip with a distinct "Suggested from <filename>" label.
- Only emit the SUGGESTED chip when you have real evidence in the analysis. Never guess.
- If the analysis flagged conflicts (openQuestions), ask ONE disambiguating question first, with both conflicting values as plain options (not SUGGESTED).
- If confidence is "low", say so plainly and ask a clarifying question instead of asserting a tier.`;

export interface PowerBIAgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: PbiAttachment[];
}

const powerbiTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "submit_powerbi_request",
      description: "Submit the completed Power BI report intake request. Call this ONLY after presenting a summary and receiving the client's explicit confirmation.",
      parameters: {
        type: "object",
        properties: {
          reportType: { type: "string" },
          reportName: { type: "string" },
          description: { type: "string" },
          numberOfPages: { type: "number" },
          numberOfDrillDownPages: { type: "number" },
          numberOfDataSources: { type: "number" },
          dataSources: { type: "string" },
          integrations: { type: "string" },
          calculationComplexity: { type: "string", enum: ["Simple", "Moderate", "Complex", "Very Complex"] },
          refreshFrequency: { type: "string" },
          filtersAndSlicers: { type: "string" },
          visualRequirements: { type: "string" },
          securityRequirements: { type: "string" },
          targetDeliveryDate: { type: "string" },
          additionalNotes: { type: "string" },
        },
        required: ["reportType", "reportName", "description"],
      },
    },
  },
];

const firstTool = powerbiTools[0];
const submitToolFn = firstTool.type === "function" ? firstTool.function : (firstTool as any).function;
const anthropicTools: Anthropic.Tool[] = [{
  name: submitToolFn.name,
  description: submitToolFn.description!,
  input_schema: submitToolFn.parameters as Anthropic.Tool.InputSchema,
}];

function calculateEffortEstimate(args: Record<string, any>): { totalHours: number; breakdown: Record<string, number> } {
  let breakdown: Record<string, number> = {};
  const pages = (args.numberOfPages || 1);
  const drillDownPages = (args.numberOfDrillDownPages || 0);
  const dataSources = (args.numberOfDataSources || 1);
  breakdown["Requirements & Design"] = Math.max(4, Math.ceil(pages * 1.5));
  breakdown["Data Model & ETL"] = Math.max(4, dataSources * 4);
  const cMult: Record<string, number> = { "Simple": 1, "Moderate": 1.5, "Complex": 2.5, "Very Complex": 4 };
  const m = cMult[args.calculationComplexity] || 1.5;
  breakdown["DAX Measures & Calculations"] = Math.ceil(pages * 2 * m);
  breakdown["Report Pages Development"] = Math.ceil(pages * 4 + drillDownPages * 3);
  const visualReqs = (args.visualRequirements || "").toLowerCase();
  let visualExtra = 0;
  if (visualReqs.includes("mobile")) visualExtra += 4;
  if (visualReqs.includes("brand") || visualReqs.includes("theme") || visualReqs.includes("custom")) visualExtra += 3;
  if (visualReqs.includes("accessib")) visualExtra += 2;
  breakdown["Visual Design & Branding"] = Math.max(2, visualExtra + Math.ceil(pages * 0.5));
  const secReqs = (args.securityRequirements || "").toLowerCase();
  if (secReqs && secReqs !== "none" && secReqs !== "n/a" && secReqs !== "no") {
    breakdown["Row-Level Security (RLS)"] = Math.max(4, dataSources * 2);
  }
  const refreshReq = (args.refreshFrequency || "").toLowerCase();
  breakdown["Data Refresh & Gateway Configuration"] =
    refreshReq.includes("real") || refreshReq.includes("direct") || refreshReq.includes("hourly") ? 6 : 3;
  breakdown["Testing & QA"] = Math.max(4, Math.ceil((pages + drillDownPages) * 1.5));
  breakdown["Documentation & Handover"] = Math.max(2, Math.ceil(pages * 0.5));
  const totalHours = Object.values(breakdown).reduce((s, h) => s + h, 0);
  return { totalHours, breakdown };
}

// Compute the next sequence number for a given prefix/year by parsing the
// numeric suffix of any existing identifiers. We scan globally (not per-org)
// because request_number has a global UNIQUE index, and intake_number is
// presented to users as a global identifier as well.
// Identifier format: `${prefix}-${YYYY}-${NNN}` (split_part index 3 = NNN).
async function nextSequenceFor(
  table: typeof powerbiIntakeRequests | typeof projectIntakes,
  column: any,
  prefix: string,
  year: number,
  executor: { execute: (q: any) => Promise<any> } = db,
): Promise<number> {
  const like = `${prefix}-${year}-%`;
  // Guard against malformed legacy identifiers (e.g., 'PBI-2026-ABC'): only
  // cast suffixes that are purely numeric, otherwise the ::int cast would throw.
  const result: any = await executor.execute(sql`
    SELECT COALESCE(MAX(split_part(${column}, '-', 3)::int), 0)::int AS max_seq
    FROM ${table}
    WHERE ${column} LIKE ${like}
      AND split_part(${column}, '-', 3) ~ '^[0-9]+$'
  `);
  const rows: Array<{ max_seq: number }> = Array.isArray(result) ? result : (result?.rows ?? []);
  return Number(rows[0]?.max_seq || 0) + 1;
}

function formatSeq(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
}

export type IntakeSubmittedInfo = {
  intakeId: number;
  intakeNumber: string;
  requestNumber: string;
  reportName: string;
};

async function handleSubmitTool(
  orgId: number,
  userId: string,
  args: Record<string, any>,
  conversationLog: string,
  conversationDbId: number | null,
  onIntakeSubmitted?: (info: IntakeSubmittedInfo) => void,
): Promise<string> {
  // If the conversation produced an attachment analysis, surface its derived
  // fields without overwriting anything the user explicitly typed.
  let analysis: PbiAttachmentAnalysis | null = null;
  let editedFields: string[] = [];
  let intakeState: any = null;
  if (conversationDbId) {
    try {
      const [row] = await db.select({
        analysis: powerbiAgentConversations.attachmentAnalysis,
        intakeState: powerbiAgentConversations.intakeState,
      })
        .from(powerbiAgentConversations)
        .where(eq(powerbiAgentConversations.id, conversationDbId));
      if (row?.analysis) analysis = row.analysis as PbiAttachmentAnalysis;
      if (row?.intakeState) {
        intakeState = row.intakeState as any;
        if (Array.isArray(intakeState.editedFields)) editedFields = intakeState.editedFields;
      }
    } catch {}
  }
  // User edits from the side panel always win over what the LLM produced.
  if (intakeState && editedFields.length) {
    for (const k of editedFields) {
      const v = intakeState[k];
      if (v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "")) {
        args[k] = v;
      } else {
        delete args[k];
      }
    }
  }
  const editedSet = new Set(editedFields);
  if (analysis) {
    // Skip analysis-derived enrichment for any field the user explicitly edited
    // in the side panel — even when they cleared it, that null is intentional.
    if (!editedSet.has("dataSources") && !args.dataSources && analysis.suggestedDataSources.length) {
      args.dataSources = analysis.suggestedDataSources.join(", ");
    }
    if (!editedSet.has("refreshFrequency") && !args.refreshFrequency && analysis.suggestedRefreshCadence && analysis.suggestedRefreshCadence !== "Unknown") {
      args.refreshFrequency = analysis.suggestedRefreshCadence;
    }
    if (!editedSet.has("additionalNotes")) {
      const derivedNotes: string[] = [];
      if (analysis.audienceTier && analysis.audienceTier !== "unknown") {
        derivedNotes.push(`Derived audience tier (from attachments): ${analysis.audienceTier} (confidence ${analysis.confidence})${analysis.audienceEvidence ? ` — "${analysis.audienceEvidence}"` : ""}`);
      }
      if (analysis.suggestedMetrics.length) derivedNotes.push(`Suggested KPIs: ${analysis.suggestedMetrics.join(", ")}`);
      if (analysis.suggestedDimensions.length) derivedNotes.push(`Suggested dimensions: ${analysis.suggestedDimensions.join(", ")}`);
      if (analysis.suggestedTimeGrain && analysis.suggestedTimeGrain !== "Unknown") derivedNotes.push(`Suggested time grain: ${analysis.suggestedTimeGrain}`);
      if (analysis.sourceFiles.length) derivedNotes.push(`Source attachments: ${analysis.sourceFiles.join(", ")}`);
      if (derivedNotes.length) {
        const block = derivedNotes.join("\n");
        args.additionalNotes = args.additionalNotes ? `${args.additionalNotes}\n\n${block}` : block;
      }
    }
  }

  const effort = calculateEffortEstimate(args);

  const buildDescription = (requestNumber: string): string => {
    const descParts: string[] = [];
    if (args.description) descParts.push(args.description);
    descParts.push(`\n--- Power BI Scoping Details ---`);
    descParts.push(`Report Type: ${args.reportType || "N/A"}`);
    if (args.numberOfPages) descParts.push(`Pages: ${args.numberOfPages} main${args.numberOfDrillDownPages ? ` + ${args.numberOfDrillDownPages} drill-down` : ""}`);
    if (args.numberOfDataSources) descParts.push(`Data Sources (${args.numberOfDataSources}): ${args.dataSources || "N/A"}`);
    if (args.integrations) descParts.push(`Integrations: ${args.integrations}`);
    if (args.calculationComplexity) descParts.push(`Calculation Complexity: ${args.calculationComplexity}`);
    if (args.refreshFrequency) descParts.push(`Refresh Frequency: ${args.refreshFrequency}`);
    if (args.filtersAndSlicers) descParts.push(`Filters & Slicers: ${args.filtersAndSlicers}`);
    if (args.visualRequirements) descParts.push(`Visual/UX Requirements: ${args.visualRequirements}`);
    if (args.securityRequirements) descParts.push(`Security / RLS: ${args.securityRequirements}`);
    if (args.targetDeliveryDate) descParts.push(`Target Delivery: ${args.targetDeliveryDate}`);
    if (args.additionalNotes) descParts.push(`Additional Notes: ${args.additionalNotes}`);
    descParts.push(`\nPower BI Request Ref: ${requestNumber}`);
    return descParts.join("\n");
  };

  // Sequence numbers (INT-YYYY-NNN, PBI-YYYY-NNN) are globally unique. With
  // concurrent submissions the SELECT-then-INSERT can race and hit a unique
  // violation on request_number; on collision we recompute and retry.
  let result: { pbiRecord: any; projectIntake: any; requestNumber: string } | null = null;
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await db.transaction(async (tx) => {
        const year = new Date().getFullYear();
        const [pbiSeq, intakeSeq] = await Promise.all([
          nextSequenceFor(powerbiIntakeRequests, powerbiIntakeRequests.requestNumber, "PBI", year, tx),
          nextSequenceFor(projectIntakes, projectIntakes.intakeNumber, "INT", year, tx),
        ]);
        const requestNumber = formatSeq("PBI", year, pbiSeq);
        const intakeNumber = formatSeq("INT", year, intakeSeq);

        const [projectIntake] = await tx.insert(projectIntakes).values({
          organizationId: orgId,
          intakeNumber,
          projectName: args.reportName || "Untitled Power BI Report",
          submitterId: userId,
          description: buildDescription(requestNumber),
          status: "draft",
          currentStep: "intake_capture",
          resourceRequirements: `Estimated effort: ${effort.totalHours} hours\n${Object.entries(effort.breakdown).map(([k, v]) => `${k}: ${v}h`).join("\n")}`,
          implementationTimeline: args.targetDeliveryDate || null,
        }).returning();

        const [pbiRecord] = await tx.insert(powerbiIntakeRequests).values({
          organizationId: orgId,
          requestNumber,
          submittedBy: userId,
          status: "new",
          reportType: args.reportType?.slice(0, 200) || null,
          reportName: args.reportName?.slice(0, 500) || "Untitled Report",
          description: args.description?.slice(0, 5000) || null,
          numberOfPages: args.numberOfPages || null,
          numberOfDrillDownPages: args.numberOfDrillDownPages || null,
          numberOfDataSources: args.numberOfDataSources || null,
          dataSources: args.dataSources?.slice(0, 2000) || null,
          integrations: args.integrations?.slice(0, 2000) || null,
          calculationComplexity: args.calculationComplexity || null,
          refreshFrequency: args.refreshFrequency?.slice(0, 500) || null,
          filtersAndSlicers: args.filtersAndSlicers?.slice(0, 2000) || null,
          visualRequirements: args.visualRequirements?.slice(0, 2000) || null,
          securityRequirements: args.securityRequirements?.slice(0, 2000) || null,
          targetDeliveryDate: args.targetDeliveryDate?.slice(0, 200) || null,
          additionalNotes: args.additionalNotes?.slice(0, 5000) || null,
          conversationLog: conversationLog.slice(0, 50000),
          estimatedEffortHours: effort.totalHours,
          effortBreakdown: effort.breakdown,
          projectIntakeId: projectIntake.id,
        }).returning();

        return { pbiRecord, projectIntake, requestNumber };
      });
      break;
    } catch (err: any) {
      lastErr = err;
      const code = err?.cause?.code || err?.code || err?.original?.code;
      const isUniqueViolation = code === "23505" || /duplicate key value/i.test(err?.message || "");
      if (isUniqueViolation && attempt < 2) {
        console.warn(`[PowerBI Agent] Unique violation generating intake/request number (attempt ${attempt + 1}/3), retrying:`, err?.message);
        continue;
      }
      console.error("[PowerBI Agent] handleSubmitTool transaction failed:", err);
      throw err;
    }
  }
  if (!result) throw lastErr || new Error("Failed to create intake after retries");
  const requestNumber = result.requestNumber;

  if (conversationDbId) {
    try {
      await setSubmittedIntake(conversationDbId, result.projectIntake.id, {
        requestNumber,
        intakeNumber: result.projectIntake.intakeNumber,
      });
    } catch {}
  }

  console.log(`[PowerBI Agent] Created intake ${result.projectIntake.intakeNumber} + PBI ${requestNumber}`);

  if (onIntakeSubmitted) {
    try {
      onIntakeSubmitted({
        intakeId: result.projectIntake.id,
        intakeNumber: result.projectIntake.intakeNumber,
        requestNumber,
        reportName: result.pbiRecord.reportName,
      });
    } catch {}
  }

  // Encourage the model to surface a clickable link to the new intake in its
  // user-facing reply. The client also renders a dedicated "Open intake" button.
  const intakeUrl = `/intakes/${result.projectIntake.id}`;
  return JSON.stringify({
    success: true,
    message: `Power BI report request "${result.pbiRecord.reportName}" submitted with reference ${requestNumber}. Project intake ${result.projectIntake.intakeNumber} created. View it at ${intakeUrl}.`,
    requestNumber,
    intakeNumber: result.projectIntake.intakeNumber,
    intakeId: result.projectIntake.id,
    intakeUrl,
  });
}

// === Build OpenAI multimodal content ===
async function buildOpenAIUserContent(text: string, attachments?: PbiAttachment[]): Promise<any> {
  if (!attachments?.length) return text;
  const parts: any[] = [{ type: "text", text: text || "(see attachments)" }];
  const objStorage = new ObjectStorageService();
  for (const att of attachments) {
    if (att.contentType.startsWith("image/")) {
      try {
        const file = await objStorage.getObjectEntityFile("/" + att.objectPath.replace(/^\/+/, ""));
        const [buf] = await file.download();
        const b64 = buf.toString("base64");
        parts.push({
          type: "image_url",
          image_url: { url: `data:${att.contentType};base64,${b64}` },
        });
      } catch (e: any) {
        parts.push({ type: "text", text: `[Attached image: ${att.name} (${att.size} bytes) — could not load]` });
      }
    } else if (TEXT_EXTRACTABLE.has(att.contentType)) {
      try {
        const file = await objStorage.getObjectEntityFile("/" + att.objectPath.replace(/^\/+/, ""));
        const [buf] = await file.download();
        const txt = buf.toString("utf-8").slice(0, MAX_EXTRACTED_CHARS);
        parts.push({ type: "text", text: `[Attached file ${att.name}]\n${txt}${buf.length > MAX_EXTRACTED_CHARS ? "\n…(truncated)" : ""}` });
      } catch {
        parts.push({ type: "text", text: `[Attached file: ${att.name} (${att.contentType}, ${att.size} bytes) — could not read]` });
      }
    } else {
      parts.push({ type: "text", text: `[Attached file: ${att.name} (${att.contentType}, ${att.size} bytes)]` });
    }
  }
  return parts;
}

async function buildAnthropicUserContent(text: string, attachments?: PbiAttachment[]): Promise<any> {
  if (!attachments?.length) return text;
  const parts: any[] = [];
  const objStorage = new ObjectStorageService();
  for (const att of attachments) {
    if (att.contentType.startsWith("image/")) {
      try {
        const file = await objStorage.getObjectEntityFile("/" + att.objectPath.replace(/^\/+/, ""));
        const [buf] = await file.download();
        parts.push({
          type: "image",
          source: { type: "base64", media_type: att.contentType, data: buf.toString("base64") },
        });
      } catch (e: any) {
        parts.push({ type: "text", text: `[Attached image: ${att.name} — could not load]` });
      }
    } else if (TEXT_EXTRACTABLE.has(att.contentType)) {
      try {
        const file = await objStorage.getObjectEntityFile("/" + att.objectPath.replace(/^\/+/, ""));
        const [buf] = await file.download();
        const txt = buf.toString("utf-8").slice(0, MAX_EXTRACTED_CHARS);
        parts.push({ type: "text", text: `[Attached file ${att.name}]\n${txt}${buf.length > MAX_EXTRACTED_CHARS ? "\n…(truncated)" : ""}` });
      } catch {
        parts.push({ type: "text", text: `[Attached file: ${att.name} (${att.contentType}, ${att.size} bytes) — could not read]` });
      }
    } else {
      parts.push({ type: "text", text: `[Attached file: ${att.name} (${att.contentType}, ${att.size} bytes)]` });
    }
  }
  parts.push({ type: "text", text: text || "(see attachments)" });
  return parts;
}

// ===== Streaming via OpenAI =====
async function streamWithOpenAI(
  modelTier: PbiModelTier,
  orgId: number,
  userId: string,
  messages: PowerBIAgentMessage[],
  conversationLog: string,
  conversationDbId: number | null,
  onChunk: (s: string) => void,
  meterPerCall: <T>(round: number, fn: () => Promise<T>) => Promise<T>,
  onIntakeSubmitted?: (info: IntakeSubmittedInfo) => void,
): Promise<string> {
  const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  for (const m of messages) {
    if (m.role === "user") {
      apiMessages.push({ role: "user", content: await buildOpenAIUserContent(m.content, m.attachments) });
    } else {
      apiMessages.push({ role: "assistant", content: m.content });
    }
  }

  let fullResponse = "";
  let allStreamedText = "";
  const MAX_ROUNDS = 3;
  // For tool-call submission step, force smart model.
  let modelToUse = PBI_MODELS[modelTier].model;

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    // Per-call enforcement + recording so tool-loop rounds cannot exceed
    // the user's AI-credit budget. AiCreditsLimitError thrown here aborts
    // the loop and bubbles up to onError in the caller.
    const stream = await meterPerCall(round, () => openai.chat.completions.create({
      model: modelToUse,
      messages: apiMessages,
      stream: true,
      max_completion_tokens: 2048,
      temperature: 0.4,
      tools: powerbiTools,
    }));

    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let hasToolCalls = false;
    let finishReason = "";

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const c = choice.delta?.content || "";
      if (c) { fullResponse += c; allStreamedText += c; onChunk(c); }
      if (choice.delta?.tool_calls) {
        hasToolCalls = true;
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) toolCalls.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: "" });
          const ex = toolCalls.get(idx)!;
          if (tc.id) ex.id = tc.id;
          if (tc.function?.name) ex.name = tc.function.name;
          if (tc.function?.arguments) ex.arguments += tc.function.arguments;
        }
      }
    }

    if (!hasToolCalls || finishReason !== "tool_calls") break;

    // Force smart model for the synthesis turn after tool execution (keeps message quality high).
    modelToUse = PBI_MODELS.smart.model;

    apiMessages.push({
      role: "assistant",
      content: fullResponse || null,
      tool_calls: Array.from(toolCalls.values()).map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const [, tc] of toolCalls) {
      try {
        const args = JSON.parse(tc.arguments);
        const result = await handleSubmitTool(orgId, userId, args, conversationLog, conversationDbId, onIntakeSubmitted);
        apiMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
      } catch (err: any) {
        apiMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ success: false, message: err.message || "Tool failed" }) });
      }
    }
    // Mark a separator between rounds so the persisted log retains both halves.
    allStreamedText += "\n\n";
    fullResponse = "";
  }

  // Return the final visible response for the last round, but preserve everything streamed for persistence.
  return allStreamedText.trim() || fullResponse;
}

// ===== Streaming via Anthropic =====
async function streamWithAnthropic(
  orgId: number,
  userId: string,
  messages: PowerBIAgentMessage[],
  conversationLog: string,
  conversationDbId: number | null,
  onChunk: (s: string) => void,
  meterPerCall: <T>(round: number, fn: () => Promise<T>) => Promise<T>,
  onIntakeSubmitted?: (info: IntakeSubmittedInfo) => void,
): Promise<string> {
  if (!anthropic) throw new Error("Claude is not configured");

  const apiMessages: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      apiMessages.push({ role: "user", content: await buildAnthropicUserContent(m.content, m.attachments) });
    } else {
      apiMessages.push({ role: "assistant", content: m.content });
    }
  }

  let fullResponse = "";
  let allStreamedText = "";
  const MAX_ROUNDS = 3;

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    // Per-call enforcement + recording mirrors the OpenAI path so an
    // over-limit user cannot drain extra credits via Claude tool loops.
    const stream = await meterPerCall(round, async () => anthropic!.messages.stream({
      model: PBI_MODELS.claude.model,
      max_tokens: 2048,
      temperature: 0.4,
      system: SYSTEM_PROMPT,
      messages: apiMessages,
      tools: anthropicTools,
    }));

    let assistantBlocks: Anthropic.ContentBlock[] = [];
    let stopReason = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullResponse += event.delta.text;
        allStreamedText += event.delta.text;
        onChunk(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    assistantBlocks = final.content;
    stopReason = final.stop_reason || "";

    const toolUses = assistantBlocks.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (stopReason !== "tool_use" || toolUses.length === 0) break;

    apiMessages.push({ role: "assistant", content: assistantBlocks });

    const toolResults: any[] = [];
    for (const tu of toolUses) {
      try {
        const result = await handleSubmitTool(orgId, userId, tu.input as any, conversationLog, conversationDbId, onIntakeSubmitted);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
      } catch (err: any) {
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify({ success: false, message: err.message || "Tool failed" }), is_error: true });
      }
    }
    apiMessages.push({ role: "user", content: toolResults });
    allStreamedText += "\n\n";
    fullResponse = "";
  }

  return allStreamedText.trim() || fullResponse;
}

const OPTIONS_RE = /\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/i;
function extractOptionsFromText(text: string): string[] | null {
  const m = text.match(OPTIONS_RE);
  if (!m) return null;
  const opts = m[1].split("|").map(s => s.trim()).filter(Boolean);
  return opts.length ? opts : null;
}

function formatAnalysisForPrompt(a: PbiAttachmentAnalysis): string {
  const lines: string[] = [
    "ATTACHMENT ANALYSIS (derived from documents the client uploaded earlier in this conversation):",
    `- Audience tier: ${a.audienceTier}${a.audienceEvidence ? ` — evidence: "${a.audienceEvidence}"` : ""}`,
    `- Confidence: ${a.confidence}`,
    `- Document types: ${a.documentTypes.join(", ") || "(none)"}`,
    `- Topics: ${a.topics.join(", ") || "(none)"}`,
    `- Suggested metrics / KPIs: ${a.suggestedMetrics.join(", ") || "(none)"}`,
    `- Suggested dimensions: ${a.suggestedDimensions.join(", ") || "(none)"}`,
    `- Suggested time grain: ${a.suggestedTimeGrain}`,
    `- Suggested refresh cadence: ${a.suggestedRefreshCadence}`,
    `- Suggested data sources: ${a.suggestedDataSources.join(", ") || "(none)"}`,
    `- Source files: ${a.sourceFiles.join(", ") || "(none)"}`,
  ];
  if (a.openQuestions.length) lines.push(`- CONFLICTS / open questions: ${a.openQuestions.join(" | ")}`);
  if (a.summary) lines.push(`- One-line summary: ${a.summary}`);
  return lines.join("\n");
}

/**
 * Inspect the latest user turn for fresh attachments. If any are present,
 * extract their text, run a single structured analysis pass, persist both,
 * and merge with any pre-existing analysis on the conversation.
 */
async function ensureAttachmentAnalysis(
  conversationDbId: number | null,
  messages: PowerBIAgentMessage[],
  modelTier: PbiModelTier,
  orgId: number,
  userId: string,
  onPhase?: (phase: { phase: "analyzing" | "analyzed"; fileCount?: number }) => void,
): Promise<PbiAttachmentAnalysis | null> {
  if (!conversationDbId) return null;
  const last = messages[messages.length - 1];
  const newAttachments = (last?.role === "user" ? last.attachments : null) ?? null;

  // Always load existing analysis (so we can re-use it on follow-up turns).
  // Auth was enforced at the route layer; do a direct id lookup here.
  let existing: PbiAttachmentAnalysis | null = null;
  try {
    const [row] = await db.select({ analysis: powerbiAgentConversations.attachmentAnalysis })
      .from(powerbiAgentConversations)
      .where(eq(powerbiAgentConversations.id, conversationDbId));
    if (row?.analysis) existing = row.analysis as PbiAttachmentAnalysis;
  } catch {}

  if (!newAttachments || newAttachments.length === 0) return existing;

  onPhase?.({ phase: "analyzing", fileCount: newAttachments.length });

  // Persist the user message first so we can attach extractions to its row.
  let messageId: number | null = null;
  try {
    const [row] = await db.select({ id: powerbiAgentMessages.id })
      .from(powerbiAgentMessages)
      .where(eq(powerbiAgentMessages.conversationId, conversationDbId))
      .orderBy(desc(powerbiAgentMessages.createdAt))
      .limit(1);
    if (row?.id) messageId = row.id;
  } catch {}

  const extractions = await extractAllAttachments(newAttachments);
  if (messageId) {
    try { await setMessageExtractions(messageId, extractions); } catch {}
  }

  // Don't meter the inner analysis call — the parent chat turn is charged
  // exactly once at the route layer (powerbiAgentRoutes.ts).
  const fresh = await analyzeAttachments(extractions, modelTier, orgId, userId, { meter: false });
  const merged = mergeAnalyses(existing, fresh);
  try { await setAttachmentAnalysis(conversationDbId, merged); } catch {}
  onPhase?.({ phase: "analyzed", fileCount: newAttachments.length });
  return merged;
}

export async function streamPowerBIAgentResponse(
  orgId: number,
  userId: string,
  messages: PowerBIAgentMessage[],
  modelTier: PbiModelTier,
  conversationDbId: number | null,
  onChunk: (content: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (error: Error) => void,
  /**
   * Higher-order metering hook: enforces + records 1 credit per inner
   * OpenAI / Anthropic streaming call so a tool loop cannot exceed the
   * user's remaining AI-credit budget.
   */
  meterPerCall: <T>(round: number, fn: () => Promise<T>) => Promise<T>,
  onIntakeSubmitted?: (info: IntakeSubmittedInfo) => void,
  onPhase?: (phase: { phase: "analyzing" | "analyzed"; fileCount?: number }) => void,
) {
  try {
    if (!isModelAvailable(modelTier)) {
      modelTier = "fast";
    }

    // Run extraction + analysis BEFORE the chat call so the model can use it.
    const analysis = await ensureAttachmentAnalysis(conversationDbId, messages, modelTier, orgId, userId, onPhase);
    if (analysis) {
      // Splice the analysis into the system prompt for THIS turn by prepending
      // a synthetic system message. We do it here so the active system prompt
      // string remains the same for everyone else.
      messages = [
        { role: "system", content: formatAnalysisForPrompt(analysis) },
        ...messages,
      ];
    }
    // Include attachment references in the persisted intake conversation log so the
    // internal team can trace back which files the client supplied during intake.
    const conversationLog = messages.map(m => {
      const attLine = m.attachments && m.attachments.length
        ? `\n[attachments: ${m.attachments.map(a => `${a.name} (${a.contentType}, ${Math.round((a.size || 0) / 1024)}KB) -> ${a.objectPath}`).join("; ")}]`
        : "";
      return `${m.role}: ${m.content}${attLine}`;
    }).join("\n\n");

    let final: string;
    try {
      if (modelTier === "claude") {
        final = await streamWithAnthropic(orgId, userId, messages, conversationLog, conversationDbId, onChunk, meterPerCall, onIntakeSubmitted);
      } else {
        final = await streamWithOpenAI(modelTier, orgId, userId, messages, conversationLog, conversationDbId, onChunk, meterPerCall, onIntakeSubmitted);
      }
    } catch (err) {
      if (err instanceof AiCreditsLimitError) {
        console.warn("[PBI Agent] Tool loop aborted — AI credit limit reached");
        onError(err);
        return;
      }
      throw err;
    }

    if (conversationDbId && final) {
      try {
        const opts = extractOptionsFromText(final);
        await addMessage(conversationDbId, "assistant", final, null, opts);
      } catch (e) { console.error("[PBI] persist assistant failed", e); }
    }

    onDone(final);
  } catch (err: any) {
    onError(err);
  }
}

export async function getPowerBIIntakeRequests(orgId: number) {
  return db.select().from(powerbiIntakeRequests)
    .where(eq(powerbiIntakeRequests.organizationId, orgId))
    .orderBy(desc(powerbiIntakeRequests.createdAt));
}

export async function getPowerBIIntakeRequest(id: number, orgId: number) {
  const [request] = await db.select().from(powerbiIntakeRequests)
    .where(and(eq(powerbiIntakeRequests.id, id), eq(powerbiIntakeRequests.organizationId, orgId)));
  return request;
}

export async function convertPowerBIRequestToIntake(id: number, orgId: number, userId: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(powerbiIntakeRequests)
      .where(and(eq(powerbiIntakeRequests.id, id), eq(powerbiIntakeRequests.organizationId, orgId)))
      .for("update");
    if (!request) throw new Error("Power BI request not found");
    if (request.projectIntakeId) throw new Error("This request already has a linked project intake");

    const dp: string[] = [];
    if (request.description) dp.push(request.description);
    dp.push(`\n--- Power BI Scoping Details ---`);
    dp.push(`Report Type: ${request.reportType || "N/A"}`);
    if (request.numberOfPages) dp.push(`Pages: ${request.numberOfPages} main${request.numberOfDrillDownPages ? ` + ${request.numberOfDrillDownPages} drill-down` : ""}`);
    if (request.numberOfDataSources) dp.push(`Data Sources (${request.numberOfDataSources}): ${request.dataSources || "N/A"}`);
    if (request.integrations) dp.push(`Integrations: ${request.integrations}`);
    if (request.calculationComplexity) dp.push(`Calculation Complexity: ${request.calculationComplexity}`);
    if (request.refreshFrequency) dp.push(`Refresh Frequency: ${request.refreshFrequency}`);
    if (request.filtersAndSlicers) dp.push(`Filters & Slicers: ${request.filtersAndSlicers}`);
    if (request.visualRequirements) dp.push(`Visual/UX Requirements: ${request.visualRequirements}`);
    if (request.securityRequirements) dp.push(`Security / RLS: ${request.securityRequirements}`);
    if (request.targetDeliveryDate) dp.push(`Target Delivery: ${request.targetDeliveryDate}`);
    if (request.additionalNotes) dp.push(`Additional Notes: ${request.additionalNotes}`);
    dp.push(`\nPower BI Request Ref: ${request.requestNumber}`);

    const eb = request.effortBreakdown as Record<string, number> | null;
    const rr = request.estimatedEffortHours
      ? `Estimated effort: ${request.estimatedEffortHours} hours${eb ? "\n" + Object.entries(eb).map(([k, v]) => `${k}: ${v}h`).join("\n") : ""}`
      : null;

    const year = new Date().getFullYear();
    const ec = await tx.select({ count: sql<number>`count(*)` })
      .from(projectIntakes)
      .where(sql`EXTRACT(YEAR FROM ${projectIntakes.createdAt}) = ${year}`);
    const intakeNumber = `INT-${year}-${String(Number(ec[0]?.count || 0) + 1).padStart(3, '0')}`;

    const [pi] = await tx.insert(projectIntakes).values({
      organizationId: orgId,
      intakeNumber,
      projectName: request.reportName || "Untitled Power BI Report",
      submitterId: userId,
      description: dp.join("\n"),
      status: "draft",
      currentStep: "intake_capture",
      resourceRequirements: rr,
      implementationTimeline: request.targetDeliveryDate || null,
    }).returning();

    await tx.update(powerbiIntakeRequests).set({ projectIntakeId: pi.id }).where(eq(powerbiIntakeRequests.id, id));
    return pi;
  });
}

export async function deletePowerBIIntakeRequest(id: number, orgId: number) {
  const [r] = await db.select().from(powerbiIntakeRequests)
    .where(and(eq(powerbiIntakeRequests.id, id), eq(powerbiIntakeRequests.organizationId, orgId)));
  if (!r) throw new Error("Power BI request not found");
  await db.delete(powerbiIntakeRequests)
    .where(and(eq(powerbiIntakeRequests.id, id), eq(powerbiIntakeRequests.organizationId, orgId)));
  return r;
}
