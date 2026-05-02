import OpenAI from "openai";
import type { PbiIntakeState, PbiAttachmentAnalysis } from "@shared/schema";
import type { PbiAttachment } from "../storage/powerbiAgentStorage";
import { withAiCredits, AiCreditsLimitError } from "./aiCredits";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export const PBI_INTAKE_FIELDS: { key: keyof PbiIntakeState; label: string; section: string; type: "string" | "number" }[] = [
  { key: "reportName",            label: "Report Name",            section: "Overview",   type: "string" },
  { key: "reportType",            label: "Report Type",            section: "Overview",   type: "string" },
  { key: "description",           label: "Description / Audience", section: "Overview",   type: "string" },
  { key: "dataSources",           label: "Data Sources",           section: "Data",       type: "string" },
  { key: "integrations",          label: "Integrations",           section: "Data",       type: "string" },
  { key: "numberOfPages",         label: "Number of Pages",        section: "Complexity", type: "number" },
  { key: "numberOfDrillDownPages",label: "Drill-down Pages",       section: "Complexity", type: "number" },
  { key: "calculationComplexity", label: "Calculation Complexity", section: "Complexity", type: "string" },
  { key: "filtersAndSlicers",     label: "Filters & Slicers",      section: "Complexity", type: "string" },
  { key: "visualRequirements",    label: "Visual Requirements",    section: "Complexity", type: "string" },
  { key: "securityRequirements",  label: "Security (RLS)",         section: "Complexity", type: "string" },
  { key: "refreshFrequency",      label: "Refresh Frequency",      section: "Delivery",   type: "string" },
  { key: "targetDeliveryDate",    label: "Target Delivery Date",   section: "Delivery",   type: "string" },
  { key: "additionalNotes",       label: "Additional Notes",       section: "Delivery",   type: "string" },
];

export const PBI_INTAKE_SECTIONS = ["Overview", "Data", "Complexity", "Delivery"] as const;

export function emptyIntakeState(): PbiIntakeState {
  return {
    reportName: null,
    reportType: null,
    description: null,
    numberOfPages: null,
    numberOfDrillDownPages: null,
    dataSources: null,
    integrations: null,
    calculationComplexity: null,
    refreshFrequency: null,
    filtersAndSlicers: null,
    visualRequirements: null,
    securityRequirements: null,
    targetDeliveryDate: null,
    additionalNotes: null,
    submittedRequestNumber: null,
    submittedIntakeNumber: null,
  };
}

const EXTRACTION_PROMPT = `You analyze a Power BI report intake conversation and extract the user's current best-known answer for each scoping field.

Rules:
- Only extract values the USER (or their attachments) clearly provided. Do NOT make up values, do NOT use the assistant's example options as values.
- If the user has not yet answered a field, use null.
- Preserve the user's wording. Trim whitespace; keep values concise.
- For numeric fields, return an integer or null. If the user said "a few" or "several", return null.
- For "I don't know" / "Skip" / similar non-answers, return null for that field.
- Always respond with the exact JSON schema, no markdown, no commentary.`;

const EXTRACTION_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    reportName:             { type: ["string", "null"] },
    reportType:             { type: ["string", "null"] },
    description:            { type: ["string", "null"] },
    numberOfPages:          { type: ["integer", "null"] },
    numberOfDrillDownPages: { type: ["integer", "null"] },
    dataSources:            { type: ["string", "null"] },
    integrations:           { type: ["string", "null"] },
    calculationComplexity:  { type: ["string", "null"] },
    refreshFrequency:       { type: ["string", "null"] },
    filtersAndSlicers:      { type: ["string", "null"] },
    visualRequirements:     { type: ["string", "null"] },
    securityRequirements:   { type: ["string", "null"] },
    targetDeliveryDate:     { type: ["string", "null"] },
    additionalNotes:        { type: ["string", "null"] },
  },
  required: [
    "reportName", "reportType", "description", "numberOfPages", "numberOfDrillDownPages",
    "dataSources", "integrations", "calculationComplexity", "refreshFrequency",
    "filtersAndSlicers", "visualRequirements", "securityRequirements",
    "targetDeliveryDate", "additionalNotes",
  ],
};

export interface ExtractionMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: PbiAttachment[] | null;
}

function formatTranscript(messages: ExtractionMessage[]): string {
  return messages.map(m => {
    const att = m.attachments && m.attachments.length
      ? ` [attachments: ${m.attachments.map(a => a.name).join(", ")}]`
      : "";
    return `${m.role.toUpperCase()}:${att} ${m.content}`;
  }).join("\n\n");
}

export async function extractIntakeState(
  messages: ExtractionMessage[],
  previous: PbiIntakeState | null | undefined,
  analysis: PbiAttachmentAnalysis | null | undefined,
  orgId: number,
  userId: string,
): Promise<PbiIntakeState> {
  const base = previous && typeof previous === "object" ? { ...emptyIntakeState(), ...previous } : emptyIntakeState();
  const editedFields = Array.isArray(base.editedFields) ? base.editedFields : [];
  const hasUser = messages.some(m => m.role === "user" && (m.content || (m.attachments?.length ?? 0) > 0));
  if (!hasUser) {
    return { ...base, updatedAt: new Date().toISOString() };
  }

  const transcript = formatTranscript(messages.slice(-30));

  const runOpenAI = () => openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 800,
    response_format: {
      type: "json_schema",
      json_schema: { name: "powerbi_intake_state", strict: true, schema: EXTRACTION_SCHEMA },
    },
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: `Conversation transcript:\n\n${transcript}\n\nReturn the current intake state.` },
    ],
  });

  let extracted: Partial<PbiIntakeState> = {};
  try {
    const completion = await withAiCredits(
      { userId, orgId, action: "powerbi_intake_extract" },
      runOpenAI,
    );
    const raw = completion.choices[0]?.message?.content;
    if (raw) extracted = JSON.parse(raw) as Partial<PbiIntakeState>;
  } catch (e: any) {
    if (e instanceof AiCreditsLimitError) throw e;
    console.error("[PBI Extract] failed:", e.message);
  }

  // Re-apply user edits — they always win over LLM extraction.
  const next: PbiIntakeState = {
    ...base,
    ...extracted,
    submittedRequestNumber: base.submittedRequestNumber ?? null,
    submittedIntakeNumber: base.submittedIntakeNumber ?? null,
    editedFields,
    updatedAt: new Date().toISOString(),
  };
  for (const k of editedFields) {
    (next as any)[k] = (base as any)[k] ?? null;
  }

  next.attachmentSourcedFields = computeAttachmentSourcedFields(next, analysis ?? null, editedFields);
  return next;
}

function normalize(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

// Determine which currently-captured fields trace back to attachment analysis
// rather than to the chat transcript. Mirrors the field-derivation logic in
// handleSubmitTool so the side-panel source labels stay consistent with what
// would actually be submitted.
export function computeAttachmentSourcedFields(
  state: PbiIntakeState,
  analysis: PbiAttachmentAnalysis | null,
  editedFields: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!analysis) return out;
  const fileLabel = (analysis.sourceFiles || []).filter(Boolean).join(", ") || "uploaded file";
  const edited = new Set(editedFields);

  // dataSources: comma/and joined list
  if (!edited.has("dataSources") && state.dataSources) {
    const v = normalize(state.dataSources);
    const tokens = (analysis.suggestedDataSources || []).map(normalize).filter(Boolean);
    if (tokens.length && tokens.some(t => v.includes(t))) {
      out.dataSources = fileLabel;
    }
  }

  // refreshFrequency: single value
  if (!edited.has("refreshFrequency") && state.refreshFrequency && analysis.suggestedRefreshCadence) {
    if (normalize(state.refreshFrequency) === normalize(analysis.suggestedRefreshCadence)) {
      out.refreshFrequency = fileLabel;
    }
  }

  // additionalNotes: handleSubmitTool appends derived notes; if the captured
  // notes mention a derived marker we treat them as attachment-sourced.
  if (!edited.has("additionalNotes") && state.additionalNotes) {
    const v = String(state.additionalNotes);
    if (/Derived audience tier|Suggested KPIs|Suggested dimensions|Source attachments/i.test(v)) {
      out.additionalNotes = fileLabel;
    }
  }

  // reportType (audience tier) — when user accepted the SUGGESTED chip from
  // the attachment-analysis-aware question.
  if (!edited.has("reportType") && state.reportType && analysis.audienceTier && analysis.audienceTier !== "unknown") {
    if (normalize(state.reportType).includes(normalize(analysis.audienceTier))) {
      out.reportType = fileLabel;
    }
  }

  return out;
}

export function countCaptured(state: PbiIntakeState | null | undefined): { captured: number; total: number } {
  const total = PBI_INTAKE_FIELDS.length;
  if (!state) return { captured: 0, total };
  let captured = 0;
  for (const f of PBI_INTAKE_FIELDS) {
    const v = (state as any)[f.key];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    captured++;
  }
  return { captured, total };
}
