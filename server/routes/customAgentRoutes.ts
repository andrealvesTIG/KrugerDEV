import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { customAgents, organizations, organizationMembers, users, type FridayAgentConfig, type InsertCustomAgent } from "@shared/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  listVisibleAgents, getAgentForUser, canEditAgent, createAgent, updateAgent, archiveAgent, deleteAgent,
  listAgentMembers, listAgentLogs, listAgentConversations, getAgentConversation, getAgentMessages,
  createAgentConversation, addAgentMessage, updateAgentConversationTitle, archiveAgentConversation, deleteAgentConversation,
  userIsOrgAdmin, listAllOrgAgentsForAdmin, reassignAgentOwner, getOrgAgentUsageStats,
} from "../storage/customAgentStorage";
import { runScheduledAgent, computeNextRun } from "../services/customAgentService";
import { streamJarvisResponse, getOrgOpenAIClient, type CustomAgentRuntimeConfig } from "../services/jarvisService";
import {
  enforceAiCredits, recordAiCredits, sendLimitExceeded, writeSseLimitExceeded,
  AiCreditsLimitError, newAiRequestId, type MeterPerCall,
} from "../services/aiCredits";
import { getUserIdFromRequest, getUserOrgIds, getUserOrgRole } from "./helpers";
import { apiRoute, body, r200, stdRes, authRes } from "../route-registry";

export const ALLOWED_MODELS = ["gpt-4o", "gpt-4o-mini"] as const;
// Safe write surface exposed to custom agents — these are the user-facing
// action names defined in the product spec (task #71). Each maps to an
// existing Friday tool function so no new write capabilities are introduced.
export const ALLOWED_AGENT_ACTIONS = [
  "create_task",
  "create_mitigation",
  "assign_owner",
  "add_note",
  "flag_for_review",
  // scheduled-only — gates whether the agent's report is actually emailed
  "send_email",
] as const;
export type AllowedAgentAction = (typeof ALLOWED_AGENT_ACTIONS)[number];

// Map public action name → underlying jarvisService tool function name.
// `send_email` is intentionally NOT mapped to any chat-tool: it's only used
// by the scheduled runner to gate email delivery.
export const AGENT_ACTION_TO_TOOL: Record<Exclude<AllowedAgentAction, "send_email">, string> = {
  create_task: "create_task",
  create_mitigation: "create_risk",
  assign_owner: "assign_resources_to_task",
  add_note: "add_project_note",
  flag_for_review: "flag_project_for_review",
};

interface BuiltinAgentEntry {
  id: number;
  kind: "builtin";
  category: "builtin";
  name: string;
  description: string;
  icon: string;
  type: "chat" | "scheduled";
  href: string | null;
}

const BUILTIN_AGENTS: BuiltinAgentEntry[] = [
  { id: -1, kind: "builtin", category: "builtin", name: "Friday", description: "Default chat agent across the app.", icon: "Sparkles", type: "chat", href: null },
  { id: -2, kind: "builtin", category: "builtin", name: "Power BI Request", description: "Convert plain language into structured Power BI requests.", icon: "BarChart3", type: "chat", href: "/powerbi-agent" },
  { id: -3, kind: "builtin", category: "builtin", name: "Project Agent", description: "Per-project scheduled summaries.", icon: "ClipboardList", type: "scheduled", href: "/projects" },
];
export const ALLOWED_ICONS = ["Bot","Sparkles","BrainCircuit","Bookmark","ClipboardList","FileText","BarChart3","Calendar","Users","Mail","Wand2","Rocket","ShieldCheck","Lightbulb","Zap"] as const;

export const dataScopeSchema = z.object({
  type: z.enum(["org","portfolios","projects"]),
  portfolioIds: z.array(z.number().int().positive()).max(200).nullable().optional(),
  projectIds: z.array(z.number().int().positive()).max(500).nullable().optional(),
});

export const baseSchema = z.object({
  organizationId: z.number().int().positive(),
  type: z.enum(["chat","scheduled"]),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  icon: z.enum(ALLOWED_ICONS).optional(),
  systemPrompt: z.string().min(1).max(50000),
  model: z.enum(ALLOWED_MODELS).default("gpt-4o-mini"),
  dataScope: dataScopeSchema.default({ type: "org" }),
  allowedTools: z.array(z.enum(ALLOWED_AGENT_ACTIONS)).max(20).default([]),
  visibility: z.enum(["private","org","members"]).default("private"),
  memberIds: z.array(z.string()).max(200).optional(),
  enabled: z.boolean().optional(),
  scheduleDay: z.number().int().min(0).max(6).nullable().optional(),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  timezone: z.string().max(80).nullable().optional(),
  recipientEmails: z.array(z.string().email()).max(50).nullable().optional(),
  emailSubject: z.string().max(200).nullable().optional(),
});

// Generate 4 short, ready-to-send template questions for a custom agent based
// on its system prompt + name + description. Returns null on any failure so
// the caller can ignore it without blocking agent create/update.
async function generateSuggestedPromptsForAgent(
  orgId: number,
  agent: { name: string; description?: string | null; systemPrompt: string; type: string },
): Promise<string[] | null> {
  try {
    const { client, deployment, isAzure } = await getOrgOpenAIClient(orgId);
    const sys = `You write short starter prompts that a user might click to begin a conversation with a custom AI agent. Respond with STRICT JSON in this exact shape: {"prompts":["...","...","...","..."]}. Rules: exactly 4 prompts; each is a complete first-person question or request the user would send (e.g. "Show me my at-risk projects", not "Risk overview"); 4–10 words; no numbering, quotes, emojis, or trailing punctuation other than "?"; cover distinct angles of what this agent does best (do not paraphrase the same question 4 times); never invent specific entity names — keep them generic (e.g. "Which projects are slipping this month?").`;
    const user = `Agent name: ${agent.name}
Type: ${agent.type}
Description: ${agent.description ?? "(none)"}
System prompt:
"""
${agent.systemPrompt.slice(0, 6000)}
"""

Return the JSON now.`;
    const completion = await client.chat.completions.create({
      model: isAzure ? deployment : "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_completion_tokens: 400,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : parsed?.prompts;
    if (!Array.isArray(arr)) return null;
    const cleaned = arr
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0 && s.length <= 140)
      .slice(0, 4);
    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.error(`[customAgent] Suggested-prompt generation failed for org ${orgId}:`, err);
    return null;
  }
}

async function refreshAgentPromptsAsync(
  agentId: number,
  orgId: number,
  agent: { name: string; description?: string | null; systemPrompt: string; type: string },
): Promise<void> {
  const prompts = await generateSuggestedPromptsForAgent(orgId, agent);
  if (!prompts) return;
  try {
    await updateAgent(agentId, { suggestedPrompts: prompts });
  } catch (err) {
    console.error(`[customAgent] Failed to persist suggested prompts for agent ${agentId}:`, err);
  }
}

async function ensureOrgAccess(req: Request, res: Response, orgId: number): Promise<string | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) { res.status(401).json({ message: "Authentication required" }); return null; }
  const orgs = await getUserOrgIds(userId);
  if (!orgs.includes(orgId)) { res.status(403).json({ message: "Access denied" }); return null; }
  return userId;
}

// Org admin / owner / super_admin gate. Returns the userId on success and
// writes a 401/403 response (returning null) otherwise.
async function ensureOrgAdmin(req: Request, res: Response, orgId: number): Promise<string | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) { res.status(401).json({ message: "Authentication required" }); return null; }
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (u?.role === "super_admin") return userId;
  const orgs = await getUserOrgIds(userId);
  if (!orgs.includes(orgId)) { res.status(403).json({ message: "Access denied" }); return null; }
  if (!(await userIsOrgAdmin(userId, orgId))) {
    res.status(403).json({ message: "Org admin permission required" });
    return null;
  }
  return userId;
}

export function registerCustomAgentRoutes(app: Express) {
  // ----- Catalog: list visible (custom) agents -----
  apiRoute(app, 'get', '/api/agents', {
    tag: 'Agents', summary: 'List custom agents visible to the user in an org',
    responses: { ...r200('Agents', { type: 'array' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const rows = await listVisibleAgents(orgId, userId);
    const customWithMeta = rows.map(r => ({
      ...r,
      kind: "custom" as const,
      category: r.isOwner ? "mine" as const : "shared" as const,
      href: null,
    }));
    res.json([...BUILTIN_AGENTS, ...customWithMeta]);
  });

  apiRoute(app, 'post', '/api/agents', {
    tag: 'Agents', summary: 'Create a custom agent',
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Created', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const parsed = baseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join(", ") });
    const { organizationId, memberIds, ...rest } = parsed.data;
    const userId = await ensureOrgAccess(req, res, organizationId);
    if (!userId) return;
    if (rest.visibility === "members" && memberIds && memberIds.length > 0) {
      const valid = await db.select({ userId: organizationMembers.userId }).from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, organizationId), inArray(organizationMembers.userId, memberIds)));
      const validIds = new Set(valid.map(v => v.userId));
      for (const id of memberIds) if (!validIds.has(id)) return res.status(400).json({ message: "Member is not in this organization" });
    }
    const insert: InsertCustomAgent = {
      organizationId, createdBy: userId,
      type: rest.type,
      name: rest.name, description: rest.description ?? null,
      icon: rest.icon ?? "Bot",
      systemPrompt: rest.systemPrompt,
      model: rest.model,
      dataScope: {
        type: rest.dataScope.type,
        portfolioIds: rest.dataScope.portfolioIds ?? undefined,
        projectIds: rest.dataScope.projectIds ?? undefined,
      },
      allowedTools: rest.allowedTools,
      visibility: rest.visibility,
      enabled: rest.enabled ?? true,
      scheduleDay: rest.type === "scheduled" ? (rest.scheduleDay ?? null) : null,
      scheduleTime: rest.type === "scheduled" ? (rest.scheduleTime ?? null) : null,
      timezone: rest.timezone ?? "America/New_York",
      recipientEmails: rest.type === "scheduled" ? (rest.recipientEmails ?? null) : null,
      emailSubject: rest.emailSubject ?? null,
      nextRun: rest.type === "scheduled" ? computeNextRun(rest.scheduleDay ?? null, rest.scheduleTime ?? null, rest.timezone ?? null) : null,
    };
    const agent = await createAgent(insert, memberIds ?? []);
    // Fire-and-forget: generate starter prompts from the systemPrompt so the
    // agent's empty-state landing page shows tailored cards. Don't block the
    // create response on the LLM call.
    void refreshAgentPromptsAsync(agent.id, organizationId, {
      name: agent.name, description: agent.description, systemPrompt: agent.systemPrompt, type: agent.type,
    });
    res.status(201).json(agent);
  });

  apiRoute(app, 'post', '/api/agents/:id/regenerate-prompts', {
    tag: 'Agents', summary: 'Regenerate the agent\'s starter prompts from its system prompt',
    responses: { ...r200('Regenerated', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const orgId = Number(req.body.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    if (!(await canEditAgent(id, orgId, userId))) return res.status(403).json({ message: "You can't edit this agent" });
    const a = await getAgentForUser(id, orgId, userId);
    if (!a) return res.status(404).json({ message: "Not found" });
    const prompts = await generateSuggestedPromptsForAgent(orgId, {
      name: a.name, description: a.description, systemPrompt: a.systemPrompt, type: a.type,
    });
    if (!prompts) return res.status(502).json({ message: "Could not generate starter prompts. Please try again." });
    const updated = await updateAgent(id, { suggestedPrompts: prompts });
    res.json(updated);
  });

  apiRoute(app, 'get', '/api/agents/:id', {
    tag: 'Agents', summary: 'Get a custom agent',
    responses: { ...r200('Agent', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const id = Number(req.params.id);
    const agent = await getAgentForUser(id, orgId, userId);
    if (!agent) return res.status(404).json({ message: "Not found" });
    const memberIds = await listAgentMembers(id);
    res.json({ ...agent, memberIds });
  });

  apiRoute(app, 'patch', '/api/agents/:id', {
    tag: 'Agents', summary: 'Update a custom agent',
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Updated', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = baseSchema.partial({ type: true, systemPrompt: true, name: true }).safeParse({ ...req.body, organizationId: req.body.organizationId });
    if (!parsed.success) {
      console.error("[customAgent] PATCH validation failed:", JSON.stringify(parsed.error.issues, null, 2), "body keys:", Object.keys(req.body));
      return res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join(", ") });
    }
    const orgId = parsed.data.organizationId!;
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    if (!(await canEditAgent(id, orgId, userId))) return res.status(403).json({ message: "You can't edit this agent" });
    const { organizationId: _ignore, memberIds, dataScope, ...patchData } = parsed.data;
    const patch: Partial<InsertCustomAgent> = { ...patchData };
    if (dataScope) {
      patch.dataScope = {
        type: dataScope.type,
        portfolioIds: dataScope.portfolioIds ?? undefined,
        projectIds: dataScope.projectIds ?? undefined,
      };
    }
    if (patch.type === "scheduled" || patchData.scheduleDay !== undefined || patchData.scheduleTime !== undefined) {
      patch.nextRun = computeNextRun(patch.scheduleDay ?? null, patch.scheduleTime ?? null, patch.timezone ?? null);
    }
    const updated = await updateAgent(id, patch, memberIds);
    if (!updated) return res.status(404).json({ message: "Not found" });
    // Regenerate starter prompts when the systemPrompt, name, or description
    // changes — those are the inputs to the prompt generator. Fire-and-forget.
    if (patchData.systemPrompt !== undefined || patchData.name !== undefined || patchData.description !== undefined) {
      void refreshAgentPromptsAsync(id, orgId, {
        name: updated.name, description: updated.description, systemPrompt: updated.systemPrompt, type: updated.type,
      });
    }
    res.json(updated);
  });

  apiRoute(app, 'delete', '/api/agents/:id', {
    tag: 'Agents', summary: 'Delete a custom agent',
    responses: { ...r200('Deleted', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    if (!(await canEditAgent(id, orgId, userId))) return res.status(403).json({ message: "You can't delete this agent" });
    await deleteAgent(id);
    res.json({ success: true });
  });

  apiRoute(app, 'post', '/api/agents/:id/archive', {
    tag: 'Agents', summary: 'Archive a custom agent',
    responses: { ...r200('Archived', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const orgId = Number(req.body.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    if (!(await canEditAgent(id, orgId, userId))) return res.status(403).json({ message: "You can't archive this agent" });
    await archiveAgent(id);
    res.json({ success: true });
  });

  apiRoute(app, 'post', '/api/agents/:id/duplicate', {
    tag: 'Agents', summary: 'Duplicate a custom agent',
    responses: { ...r200('Duplicated', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const orgId = Number(req.body.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const a = await getAgentForUser(id, orgId, userId);
    if (!a) return res.status(404).json({ message: "Not found" });
    const memberIds = await listAgentMembers(id);
    const dup = await createAgent({
      organizationId: a.organizationId, createdBy: userId,
      type: a.type, name: `${a.name} (copy)`, description: a.description, icon: a.icon ?? "Bot",
      systemPrompt: a.systemPrompt, model: a.model, dataScope: a.dataScope, allowedTools: a.allowedTools,
      visibility: "private", enabled: a.enabled, scheduleDay: a.scheduleDay, scheduleTime: a.scheduleTime,
      timezone: a.timezone, recipientEmails: a.recipientEmails, emailSubject: a.emailSubject,
      nextRun: a.type === "scheduled" ? computeNextRun(a.scheduleDay, a.scheduleTime, a.timezone) : null,
    }, []);
    res.json(dup);
  });

  // ----- Scheduled-agent run-now + logs -----
  apiRoute(app, 'post', '/api/agents/:id/run', {
    tag: 'Agents', summary: 'Run a scheduled agent now',
    responses: { ...r200('Run result', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const orgId = Number(req.body.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const a = await getAgentForUser(id, orgId, userId);
    if (!a) return res.status(404).json({ message: "Not found" });
    if (a.type !== "scheduled") return res.status(400).json({ message: "Not a scheduled agent" });
    // Manual `Run now` would email recipients on the agent's behalf — only
    // the agent owner or an org admin may trigger that.
    if (!(await canEditAgent(id, orgId, userId))) {
      return res.status(403).json({ message: "Only the agent owner or an org admin can run this agent." });
    }
    const result = await runScheduledAgent(a, userId);
    res.json(result);
  });

  apiRoute(app, 'get', '/api/agents/:id/logs', {
    tag: 'Agents', summary: 'List run logs for a scheduled agent',
    responses: { ...r200('Logs', { type: 'array' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const a = await getAgentForUser(id, orgId, userId);
    if (!a) return res.status(404).json({ message: "Not found" });
    res.json(await listAgentLogs(id));
  });

  // ----- Chat agent conversations -----
  apiRoute(app, 'get', '/api/agents/:id/conversations', {
    tag: 'Agents', summary: 'List chat conversations for an agent',
    responses: { ...r200('Conversations', { type: 'array' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const a = await getAgentForUser(id, orgId, userId);
    if (!a) return res.status(404).json({ message: "Not found" });
    res.json(await listAgentConversations(id, orgId, userId));
  });

  apiRoute(app, 'get', '/api/agents/:id/conversations/:cid', {
    tag: 'Agents', summary: 'Get a chat conversation with messages',
    responses: { ...r200('Conversation detail', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const cid = Number(req.params.cid);
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const conv = await getAgentConversation(cid, id, orgId, userId);
    if (!conv) return res.status(404).json({ message: "Not found" });
    const messages = await getAgentMessages(cid);
    res.json({ id: conv.id, title: conv.title, messages });
  });

  apiRoute(app, 'delete', '/api/agents/:id/conversations/:cid', {
    tag: 'Agents', summary: 'Delete a chat conversation',
    responses: { ...r200('Deleted', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const cid = Number(req.params.cid);
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    await deleteAgentConversation(cid, orgId, userId);
    res.json({ success: true });
  });

  // ----- Chat agent streaming -----
  const chatSchema = z.object({
    messages: z.array(z.object({ role: z.enum(["user","assistant"]), content: z.string().max(200000) })).min(1).max(50),
    organizationId: z.number().int().positive(),
    concise: z.boolean().optional(),
    conversationId: z.number().int().positive().optional(),
    pageContext: z.object({ path: z.string(), entityType: z.enum(["project","portfolio","resource"]).nullable(), entityId: z.number().int().positive().nullable() }).optional(),
  });

  apiRoute(app, 'post', '/api/agents/:id/chat', {
    tag: 'Agents', summary: 'Stream a custom agent chat response',
    requestBody: body({ type: 'object' }),
    responses: { ...r200('SSE stream', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join(", ") });
      const { messages, organizationId, concise, conversationId: incomingCid, pageContext } = parsed.data;
      const userId = await ensureOrgAccess(req, res, organizationId);
      if (!userId) return;
      const agent = await getAgentForUser(id, organizationId, userId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.type !== "chat") return res.status(400).json({ message: "Not a chat agent" });

      const baseRequestId = `custom_chat_agent_${id}_${incomingCid ?? "new"}_${newAiRequestId()}`;
      const creditCtx = { userId, orgId: organizationId, action: "custom_chat_agent", entityId: id, requestId: baseRequestId };
      // Pre-flight: check credits up-front so we can return a clean 402
      // BEFORE opening the SSE stream. The actual credit charge happens
      // exactly once per user turn inside meterPerCall (round 0 only),
      // so a single turn that triggers tool rounds still costs one credit.
      try { await enforceAiCredits(creditCtx); } catch (err) { if (sendLimitExceeded(res, err)) return; throw err; }

      let conversationId: number | null = null;
      if (incomingCid) {
        const conv = await getAgentConversation(incomingCid, id, organizationId, userId);
        if (conv) conversationId = conv.id;
      }
      const lastUser = [...messages].reverse().find(m => m.role === "user");
      if (!conversationId) {
        const created = await createAgentConversation(id, organizationId, userId, lastUser?.content?.slice(0, 60) || "New conversation");
        conversationId = created.id;
      } else if (lastUser) {
        await updateAgentConversationTitle(conversationId, lastUser.content.slice(0, 60)).catch(() => {});
      }
      if (lastUser) {
        await addAgentMessage(conversationId, "user", lastUser.content, null, pageContext ?? null);
      }

      // Per-turn metering: charge exactly one `custom_chat_agent` credit on
      // round 0 (the first OpenAI call for this user turn). Subsequent
      // rounds in the same turn are tool-loop continuations and are NOT
      // billed as additional chat credits — confirmed write actions are
      // metered separately under `custom_chat_agent_action`.
      const meterPerCall: MeterPerCall = async <T>(round: number, fn: () => Promise<T>) => {
        if (round === 0) {
          const ctx = { ...creditCtx, requestId: `${baseRequestId}_r0` };
          const { chargeUserId } = await enforceAiCredits(ctx);
          const result = await fn();
          return { result, recordSuccess: () => recordAiCredits(chargeUserId, ctx) };
        }
        const result = await fn();
        return { result, recordSuccess: async () => 0 };
      };

      // Confirmed write actions are billed as `custom_chat_agent_action` —
      // separate from the per-round chat metering.
      let actionSeq = 0;
      const meterAction = async (): Promise<void> => {
        actionSeq += 1;
        const actCtx = {
          userId,
          orgId: organizationId,
          action: "custom_chat_agent_action",
          entityId: id,
          requestId: `${baseRequestId}_act_${actionSeq}_${newAiRequestId()}`,
        };
        const { chargeUserId } = await enforceAiCredits(actCtx);
        await recordAiCredits(chargeUserId, actCtx);
      };

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);

      // Translate the agent's public action names into the underlying
      // jarvisService tool function names that the streaming loop consumes.
      // `send_email` is scheduled-only and not exposed as a chat tool.
      const runtimeToolNames = (agent.allowedTools as AllowedAgentAction[])
        .filter((a): a is Exclude<AllowedAgentAction, "send_email"> => a !== "send_email")
        .map(a => AGENT_ACTION_TO_TOOL[a])
        .filter((t): t is string => Boolean(t));

      const runtime: CustomAgentRuntimeConfig = {
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        allowedTools: runtimeToolNames,
        dataScope: agent.dataScope as CustomAgentRuntimeConfig["dataScope"],
        meterAction,
      };

      await streamJarvisResponse(
        organizationId, userId, messages as any, concise ?? false,
        (content) => { res.write(`data: ${JSON.stringify({ content })}\n\n`); },
        (full) => {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          if (conversationId && full) {
            addAgentMessage(conversationId, "assistant", full, null, null).catch(e => console.error("[customAgent] persist assistant failed", e));
          }
        },
        (err: any) => {
          if (writeSseLimitExceeded(res, err)) return;
          if (sendLimitExceeded(res, err)) return;
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: err.message || "Error" })}\n\n`);
            res.end();
          } else {
            res.status(500).json({ message: err.message || "Error" });
          }
        },
        meterPerCall,
        pageContext as any, undefined, undefined, runtime,
      );
    } catch (err: any) {
      if (err instanceof AiCreditsLimitError) { if (sendLimitExceeded(res, err)) return; }
      console.error("[customAgent] chat route error:", err);
      if (!res.headersSent) res.status(500).json({ message: err?.message || "Internal server error" });
    }
  });

  // ----- Admin: list every custom agent in the org -----
  apiRoute(app, 'get', '/api/agents/admin/list', {
    tag: 'Agents', summary: 'Admin-only: list every custom agent in the org',
    responses: { ...r200('Agents', { type: 'array' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAdmin(req, res, orgId);
    if (!userId) return;
    const rows = await listAllOrgAgentsForAdmin(orgId);
    res.json(rows.map(r => ({ ...r, kind: "custom" as const, category: "shared" as const, href: null })));
  });

  // ----- Admin: per-agent usage stats (last 30 days) -----
  apiRoute(app, 'get', '/api/agents/admin/usage-stats', {
    tag: 'Agents', summary: 'Admin-only: per-agent conversation + run counts and last-used timestamp',
    responses: { ...r200('Usage stats', { type: 'array' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAdmin(req, res, orgId);
    if (!userId) return;
    res.json(await getOrgAgentUsageStats(orgId));
  });

  // ----- Admin: reassign agent owner -----
  const reassignSchema = z.object({
    organizationId: z.number().int().positive(),
    newOwnerId: z.string().min(1),
  });
  apiRoute(app, 'post', '/api/agents/:id/reassign-owner', {
    tag: 'Agents', summary: 'Admin-only: change a custom agent owner',
    requestBody: body({ type: 'object' }),
    responses: { ...r200('Reassigned', { type: 'object' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const parsed = reassignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join(", ") });
    const { organizationId, newOwnerId } = parsed.data;
    const userId = await ensureOrgAdmin(req, res, organizationId);
    if (!userId) return;
    // The target user must belong to the same organization.
    const [m] = await db.select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, newOwnerId)));
    if (!m) return res.status(400).json({ message: "Selected user is not a member of this organization" });
    // Confirm the agent belongs to this org before updating.
    const [a] = await db.select({ id: customAgents.id }).from(customAgents)
      .where(and(eq(customAgents.id, id), eq(customAgents.organizationId, organizationId)));
    if (!a) return res.status(404).json({ message: "Agent not found" });
    const updated = await reassignAgentOwner(id, newOwnerId);
    if (!updated) return res.status(404).json({ message: "Agent not found" });
    res.json(updated);
  });

  // ----- Helper: list models available to custom agents in this org -----
  // The platform offers two base models (gpt-4o, gpt-4o-mini). If the org
  // has configured its own Azure deployment for Friday, we surface that
  // deployment as an additional choice so custom agents can use the same
  // backing model the rest of Friday uses.
  apiRoute(app, 'get', '/api/agents/_helpers/models', {
    tag: 'Agents', summary: 'List models available to custom agents in this org',
    responses: { ...r200('Models', { type: 'array' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const models: { id: string; label: string; source: "platform" | "org-azure" }[] =
      ALLOWED_MODELS.map(m => ({ id: m, label: m, source: "platform" as const }));
    try {
      const [org] = await db.select({ cfg: organizations.fridayAgentConfig }).from(organizations).where(eq(organizations.id, orgId));
      const cfg = org?.cfg as FridayAgentConfig | null;
      if (cfg?.useOrgAzure && cfg.azureDeployment) {
        models.unshift({ id: cfg.azureDeployment, label: `${cfg.azureDeployment} (org Azure)`, source: "org-azure" });
      }
    } catch (e) {
      console.error("[customAgent] failed to load org friday cfg:", e);
    }
    res.json(models);
  });

  // ----- Helper: list org members (for member allowlist UI) -----
  apiRoute(app, 'get', '/api/agents/_helpers/org-members', {
    tag: 'Agents', summary: 'List org members for allowlist picker',
    responses: { ...r200('Members', { type: 'array' }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const orgId = Number(req.query.organizationId);
    if (!orgId) return res.status(400).json({ message: "organizationId required" });
    const userId = await ensureOrgAccess(req, res, orgId);
    if (!userId) return;
    const rows = await db.select({
      userId: organizationMembers.userId, role: organizationMembers.role,
      firstName: users.firstName, lastName: users.lastName, email: users.email,
    }).from(organizationMembers)
      .leftJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, orgId));
    res.json(rows);
  });
}
