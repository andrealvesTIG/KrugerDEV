import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { PbiAttachmentAnalysis, PbiAttachmentExtraction } from "@shared/schema";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import { withAiCredits } from "./aiCredits";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

const ANALYSIS_SYSTEM = `You are a Power BI scoping analyst. The client has uploaded one or more documents (briefs, sample reports, screenshots, mockups, data dictionaries, CSVs). Your job is to extract a structured understanding so a chat agent can pre-fill answers to its intake questions.

Return STRICT JSON matching this exact shape (no commentary):
{
  "audienceTier": "executive" | "manager" | "analyst" | "mixed" | "unknown",
  "audienceEvidence": "short snippet/cue from the document that justifies the audience choice",
  "documentTypes": ["e.g. one-pager exec brief", "operational runbook", "raw transactional CSV"],
  "topics": ["short topic phrases"],
  "suggestedMetrics": ["KPI / measure names mentioned or implied"],
  "suggestedDimensions": ["common slicing dimensions: region, product, channel, time…"],
  "suggestedTimeGrain": "Daily | Weekly | Monthly | Quarterly | Annual | Real-time | Unknown",
  "suggestedRefreshCadence": "Real-time | Hourly | Daily | Weekly | Monthly | Manual | Unknown",
  "suggestedDataSources": ["systems mentioned: SAP, Salesforce, SQL, Excel, Sharepoint, Snowflake…"],
  "openQuestions": ["specific clarifying questions if files conflict or are ambiguous"],
  "confidence": "low" | "medium" | "high",
  "summary": "2-4 short sentences plainly summarising what the documents are and what the report is meant to do"
}

Heuristics:
- "Executive" → KPI summary, quarterly trends, scorecards, one-page, high-level commentary, board / C-suite words.
- "Manager" → operational detail, weekly cadence, drill-downs by team / region, action lists.
- "Analyst" → raw transactional fields, full schema / column listings, ad-hoc exploration cues, granular CSV.
- "Mixed" → clearly different audiences across files.
- "Unknown" → not enough signal. Confidence "low".
- If multiple files conflict (e.g. one says weekly refresh, another daily), DO NOT silently pick one — add a precise question to openQuestions and pick the most-evidenced value (or "Unknown").
- Keep arrays short (3-6 items). Use the document's own wording when possible.
- Never invent metrics that aren't supported by the text.`;

function buildExtractionPrompt(extractions: PbiAttachmentExtraction[]): string {
  const parts: string[] = [];
  for (const ex of extractions) {
    parts.push(`--- FILE: ${ex.name} (${ex.contentType}, ${ex.size} bytes)${ex.pageCount ? `, ${ex.pageCount} pages` : ""}${ex.sheetCount ? `, ${ex.sheetCount} sheets` : ""} ---`);
    if (ex.error) parts.push(`[extraction error: ${ex.error}]`);
    if (ex.text) {
      parts.push(ex.text);
      if (ex.truncated) parts.push("\n[…truncated for length]");
    } else if (!ex.error && ex.contentType.startsWith("image/")) {
      parts.push("[image attached — see image content]");
    } else if (!ex.error) {
      parts.push("[no text content extracted]");
    }
    parts.push("");
  }
  return parts.join("\n");
}

function emptyAnalysis(reason: string): PbiAttachmentAnalysis {
  return {
    audienceTier: "unknown",
    audienceEvidence: "",
    documentTypes: [],
    topics: [],
    suggestedMetrics: [],
    suggestedDimensions: [],
    suggestedTimeGrain: "Unknown",
    suggestedRefreshCadence: "Unknown",
    suggestedDataSources: [],
    openQuestions: [reason],
    confidence: "low",
    summary: reason,
    sourceFiles: [],
    attachmentIds: [],
  };
}

function coerce(raw: any, sourceFiles: string[]): PbiAttachmentAnalysis {
  const arr = (v: any): string[] => Array.isArray(v) ? v.map(x => String(x)).filter(Boolean).slice(0, 8) : [];
  const tier = String(raw?.audienceTier || "unknown").toLowerCase();
  const validTier = (["executive", "manager", "analyst", "mixed", "unknown"].includes(tier) ? tier : "unknown") as PbiAttachmentAnalysis["audienceTier"];
  const conf = String(raw?.confidence || "low").toLowerCase();
  const validConf = (["low", "medium", "high"].includes(conf) ? conf : "low") as PbiAttachmentAnalysis["confidence"];
  return {
    audienceTier: validTier,
    audienceEvidence: String(raw?.audienceEvidence || "").slice(0, 500),
    documentTypes: arr(raw?.documentTypes),
    topics: arr(raw?.topics),
    suggestedMetrics: arr(raw?.suggestedMetrics),
    suggestedDimensions: arr(raw?.suggestedDimensions),
    suggestedTimeGrain: String(raw?.suggestedTimeGrain || "Unknown").slice(0, 60),
    suggestedRefreshCadence: String(raw?.suggestedRefreshCadence || "Unknown").slice(0, 60),
    suggestedDataSources: arr(raw?.suggestedDataSources),
    openQuestions: arr(raw?.openQuestions),
    confidence: validConf,
    summary: String(raw?.summary || "").slice(0, 1200),
    sourceFiles,
    attachmentIds: [],
  };
}

async function buildOpenAIImageParts(extractions: PbiAttachmentExtraction[]): Promise<any[]> {
  const parts: any[] = [];
  const objStorage = new ObjectStorageService();
  for (const ex of extractions) {
    if (!ex.contentType.startsWith("image/")) continue;
    try {
      const file = await objStorage.getObjectEntityFile("/" + ex.objectPath.replace(/^\/+/, ""));
      const [buf] = await file.download();
      parts.push({
        type: "image_url",
        image_url: { url: `data:${ex.contentType};base64,${buf.toString("base64")}` },
      });
    } catch {
      parts.push({ type: "text", text: `[image ${ex.name} could not be loaded]` });
    }
  }
  return parts;
}

async function analyzeWithOpenAI(extractions: PbiAttachmentExtraction[]): Promise<PbiAttachmentAnalysis> {
  const sourceFiles = extractions.map(e => e.name);
  const prompt = buildExtractionPrompt(extractions);
  const imageParts = await buildOpenAIImageParts(extractions);

  const userContent: any = imageParts.length
    ? [{ type: "text", text: prompt || "(see attached images)" }, ...imageParts]
    : prompt;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_completion_tokens: 1200,
    response_format: { type: "json_object" },
  });
  const content = resp.choices[0]?.message?.content || "{}";
  let parsed: any = {};
  try { parsed = JSON.parse(content); } catch { /* leave empty */ }
  return coerce(parsed, sourceFiles);
}

async function analyzeWithAnthropic(extractions: PbiAttachmentExtraction[]): Promise<PbiAttachmentAnalysis> {
  if (!anthropic) return analyzeWithOpenAI(extractions);
  const sourceFiles = extractions.map(e => e.name);
  const prompt = buildExtractionPrompt(extractions);

  const objStorage = new ObjectStorageService();
  const blocks: any[] = [];
  for (const ex of extractions) {
    if (!ex.contentType.startsWith("image/")) continue;
    try {
      const file = await objStorage.getObjectEntityFile("/" + ex.objectPath.replace(/^\/+/, ""));
      const [buf] = await file.download();
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: ex.contentType, data: buf.toString("base64") },
      });
    } catch {}
  }
  blocks.push({ type: "text", text: `${prompt}\n\nReturn the JSON now.` });

  const resp = await anthropic.messages.create({
    model: "claude-3-5-haiku-latest",
    max_tokens: 1200,
    temperature: 0.2,
    system: ANALYSIS_SYSTEM + "\n\nReturn ONLY the JSON object — no prose, no code fences.",
    messages: [{ role: "user", content: blocks }],
  });
  const text = resp.content
    .map(b => b.type === "text" ? b.text : "")
    .join("\n")
    .trim();
  // Strip code fences if the model added them anyway
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let parsed: any = {};
  try { parsed = JSON.parse(cleaned); } catch { /* leave empty */ }
  return coerce(parsed, sourceFiles);
}

export async function analyzeAttachments(
  extractions: PbiAttachmentExtraction[],
  modelTier: "fast" | "smart" | "claude",
  orgId: number,
  userId: string,
  options?: { meter?: boolean },
): Promise<PbiAttachmentAnalysis> {
  if (!extractions.length) return emptyAnalysis("No attachments to analyse.");
  const hasAnyContent = extractions.some(e => e.text || e.contentType.startsWith("image/"));
  if (!hasAnyContent) {
    const errs = extractions.map(e => `${e.name}: ${e.error || "no readable content"}`).join("; ");
    return {
      ...emptyAnalysis(`Couldn't read the attached file(s). ${errs}`),
      sourceFiles: extractions.map(e => e.name),
    };
  }
  const meter = options?.meter !== false;
  const run = () => modelTier === "claude" && anthropic
    ? analyzeWithAnthropic(extractions)
    : analyzeWithOpenAI(extractions);
  try {
    if (meter) {
      return await withAiCredits(
        { userId, orgId, action: "powerbi_attachment_analyze" },
        run,
      );
    }
    return await run();
  } catch (e: any) {
    console.error("[PBI Analysis] failed:", e?.message);
    return {
      ...emptyAnalysis(`Analysis failed: ${e?.message || "unknown error"}`),
      sourceFiles: extractions.map(e => e.name),
    };
  }
}

export function mergeAnalyses(prior: PbiAttachmentAnalysis | null | undefined, next: PbiAttachmentAnalysis): PbiAttachmentAnalysis {
  if (!prior) return next;
  const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).slice(0, 10);
  // Keep the latest analysis as the source of truth for tier/cadence, but
  // accumulate union of source files / topics / metrics so older context isn't lost.
  return {
    ...next,
    documentTypes: uniq([...prior.documentTypes, ...next.documentTypes]),
    topics: uniq([...prior.topics, ...next.topics]),
    suggestedMetrics: uniq([...prior.suggestedMetrics, ...next.suggestedMetrics]),
    suggestedDimensions: uniq([...prior.suggestedDimensions, ...next.suggestedDimensions]),
    suggestedDataSources: uniq([...prior.suggestedDataSources, ...next.suggestedDataSources]),
    sourceFiles: uniq([...(prior.sourceFiles || []), ...(next.sourceFiles || [])]),
    openQuestions: uniq([...prior.openQuestions, ...next.openQuestions]),
  };
}
