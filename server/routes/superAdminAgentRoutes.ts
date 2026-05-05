import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  customAgents,
  customAgentLogs,
  customAgentConversations,
  organizations,
  users,
  BUILTIN_AGENT_KEYS,
  builtinAgentProviderConfigSchema,
  DEFAULT_GUEST_QUESTION_LIMIT,
  type BuiltinAgentKey,
  type InsertCustomAgent,
} from "@shared/schema";
import { storage } from "../storage";
import { getUserIdFromRequest, logUserActivity } from "./helpers";
import { apiRoute, body, r200, stdRes } from "../route-registry";
import {
  archiveAgent,
  deleteAgent,
  updateAgent,
  listAgentMembers,
  listAgentLogs,
} from "../storage/customAgentStorage";
import {
  listAllBuiltinAgentSettings,
  upsertBuiltinAgentSetting,
} from "../storage/builtinAgentSettingsStorage";
import { computeNextRun } from "../services/customAgentService";
import { baseSchema as customAgentBaseSchema } from "./customAgentRoutes";
import { FRIDAY_DEFAULT_SYSTEM_PROMPT } from "../services/jarvisService";
import { POWERBI_DEFAULT_SYSTEM_PROMPT } from "../services/powerbiAgentService";
import {
  PROJECT_AGENT_DEFAULT_SYSTEM_PROMPT,
  PROJECT_AGENT_DEFAULT_MODEL,
} from "../services/projectAgentService";

// Catalog metadata for the three platform-built-in agents. The negative ids
// are stable client-side keys for UI cards; they are never persisted.
const BUILTIN_AGENTS: Array<{
  id: number;
  key: BuiltinAgentKey;
  name: string;
  description: string;
  defaultPrompt: string;
  defaultModel: string;
}> = [
  {
    id: -1,
    key: "friday",
    name: "Friday",
    description: "Friday Report assistant — answers questions about projects, tasks, risks and renders status reports.",
    defaultPrompt: FRIDAY_DEFAULT_SYSTEM_PROMPT,
    defaultModel: "gpt-4o",
  },
  {
    id: -2,
    key: "powerbi",
    name: "Power BI Request",
    description: "Structured intake conversation for new Power BI report requests.",
    defaultPrompt: POWERBI_DEFAULT_SYSTEM_PROMPT,
    defaultModel: "gpt-4o-mini",
  },
  {
    id: -3,
    key: "project_agent",
    name: "Project Agent",
    description: "Scheduled per-project agent: meeting agendas, task follow-ups, status reports.",
    defaultPrompt: PROJECT_AGENT_DEFAULT_SYSTEM_PROMPT,
    defaultModel: PROJECT_AGENT_DEFAULT_MODEL,
  },
];

async function requireSuperAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  const user = await storage.getUser(userId);
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ message: "Super admin access required" });
    return null;
  }
  return userId;
}

// Reuse the org-admin custom-agent edit surface so this stays in lock-step
// with /api/agents PATCH (single source of truth for validation rules).
// `organizationId` is forced from the existing row, not the body — super
// admins should never accidentally re-home an agent.
const adminCustomAgentPatchSchema = customAgentBaseSchema
  .partial({ organizationId: true, type: true, systemPrompt: true, name: true });

const upsertBuiltinSchema = z.object({
  enabled: z.boolean().optional(),
  defaultSystemPrompt: z.string().max(20000).nullable().optional(),
  defaultModel: z.string().max(120).nullable().optional(),
  providerConfig: builtinAgentProviderConfigSchema.nullable().optional(),
  // Friday-only: per-session free-question cap for /ai. Other built-in
  // agents accept the field but ignore it. NULL clears the override and
  // falls back to DEFAULT_GUEST_QUESTION_LIMIT.
  guestQuestionLimit: z.number().int().min(0).max(100).nullable().optional(),
});

// Strip provider-config secrets when surfacing settings to the UI: the
// admin sees whether each section is set, and (for non-secret fields) the
// configured value, but never the raw API key.
function redactProviderConfig(cfg: any): any {
  if (!cfg || typeof cfg !== "object") return cfg ?? null;
  const out: any = {};
  if (cfg.azure) {
    out.azure = {
      endpoint: cfg.azure.endpoint ?? null,
      deployment: cfg.azure.deployment ?? null,
      apiVersion: cfg.azure.apiVersion ?? null,
      apiKeySet: typeof cfg.azure.apiKey === "string" && cfg.azure.apiKey.length > 0,
    };
  }
  if (cfg.openai) {
    out.openai = {
      baseURL: cfg.openai.baseURL ?? null,
      apiKeySet: typeof cfg.openai.apiKey === "string" && cfg.openai.apiKey.length > 0,
    };
  }
  if (cfg.anthropic) {
    out.anthropic = {
      apiKeySet: typeof cfg.anthropic.apiKey === "string" && cfg.anthropic.apiKey.length > 0,
    };
  }
  return out;
}

// Pull the most-recent log per agent in one query so the admin list can
// show last-run timestamp + status without an N+1 fan-out.
async function loadLatestLogByAgent(agentIds: number[]): Promise<Map<number, { status: string; createdAt: Date | null; errorMessage: string | null }>> {
  const map = new Map<number, { status: string; createdAt: Date | null; errorMessage: string | null }>();
  if (agentIds.length === 0) return map;
  const rows = await db.execute<{
    agent_id: number;
    status: string;
    created_at: Date | string | null;
    error_message: string | null;
  }>(sql`
    SELECT DISTINCT ON (${customAgentLogs.agentId})
      ${customAgentLogs.agentId} AS agent_id,
      ${customAgentLogs.status} AS status,
      ${customAgentLogs.createdAt} AS created_at,
      ${customAgentLogs.errorMessage} AS error_message
    FROM ${customAgentLogs}
    WHERE ${customAgentLogs.agentId} IN (${sql.join(agentIds.map((id) => sql`${id}`), sql`, `)})
    ORDER BY ${customAgentLogs.agentId}, ${customAgentLogs.createdAt} DESC
  `);
  for (const r of rows.rows) {
    map.set(Number(r.agent_id), {
      status: String(r.status),
      createdAt: r.created_at ? new Date(r.created_at as any) : null,
      errorMessage: r.error_message ?? null,
    });
  }
  return map;
}

export function registerSuperAdminAgentRoutes(app: Express) {
  // ---------------------------------------------------------------------------
  // Custom agents — cross-org list with filters/search
  //
  // Query params:
  //   search, organizationId, enabled (true|false), visibility (private|org|members),
  //   type (chat|scheduled), archived (true|false), errored7d (true),
  //   limit (max 200), offset.
  // Each row includes computed lastRunAt / lastRunStatus / nextRun and a
  // `status` enum for the UI badge: archived | disabled | errored | scheduled | active.
  // ---------------------------------------------------------------------------
  apiRoute(app, "get", "/api/admin/agents/custom", {
    tag: "Admin: Agents",
    summary: "Super admin: cross-org list of custom agents (filterable)",
    responses: { ...r200("Agents page", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;

    const search = String(req.query.search ?? "").trim();
    const orgIdParam = req.query.organizationId ? Number(req.query.organizationId) : null;
    const enabledFilter = req.query.enabled === "true" ? true : req.query.enabled === "false" ? false : null;
    const visibility = typeof req.query.visibility === "string" && ["private", "org", "members"].includes(req.query.visibility)
      ? (req.query.visibility as string)
      : null;
    const type = req.query.type === "chat" || req.query.type === "scheduled" ? (req.query.type as string) : null;
    const archivedFilter = req.query.archived === "true" ? true : req.query.archived === "false" ? false : null;
    const erroredOnly = req.query.errored7d === "true";
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const conditions: SQL[] = [];
    if (orgIdParam) conditions.push(eq(customAgents.organizationId, orgIdParam));
    if (enabledFilter !== null) conditions.push(eq(customAgents.enabled, enabledFilter));
    if (visibility) conditions.push(eq(customAgents.visibility, visibility));
    if (type) conditions.push(eq(customAgents.type, type));
    if (archivedFilter === true) conditions.push(sql`${customAgents.archivedAt} IS NOT NULL`);
    else if (archivedFilter === false) conditions.push(sql`${customAgents.archivedAt} IS NULL`);
    if (erroredOnly) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM ${customAgentLogs}
        WHERE ${customAgentLogs.agentId} = ${customAgents.id}
          AND ${customAgentLogs.status} = 'error'
          AND ${customAgentLogs.createdAt} >= NOW() - INTERVAL '7 days'
      )`);
    }
    if (search) {
      const pat = `%${search}%`;
      conditions.push(or(ilike(customAgents.name, pat), ilike(customAgents.description, pat))!);
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select({
      agent: customAgents,
      orgName: organizations.name,
      creatorFirst: users.firstName,
      creatorLast: users.lastName,
      creatorEmail: users.email,
    }).from(customAgents)
      .leftJoin(organizations, eq(organizations.id, customAgents.organizationId))
      .leftJoin(users, eq(users.id, customAgents.createdBy))
      .where(where)
      .orderBy(desc(customAgents.updatedAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(customAgents)
      .where(where);

    const latestByAgent = await loadLatestLogByAgent(rows.map(r => r.agent.id));

    res.json({
      total: count,
      limit,
      offset,
      items: rows.map(r => {
        const last = latestByAgent.get(r.agent.id) ?? null;
        const erroredLast7d = last?.status === "error" && last.createdAt
          ? Date.now() - last.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000
          : false;
        let status: "archived" | "disabled" | "errored" | "scheduled" | "active";
        if (r.agent.archivedAt) status = "archived";
        else if (!r.agent.enabled) status = "disabled";
        else if (erroredLast7d) status = "errored";
        else if (r.agent.type === "scheduled" && r.agent.nextRun) status = "scheduled";
        else status = "active";
        return {
          ...r.agent,
          organizationName: r.orgName,
          createdByName: `${r.creatorFirst ?? ""} ${r.creatorLast ?? ""}`.trim() || r.creatorEmail || null,
          createdByEmail: r.creatorEmail,
          lastRunAt: last?.createdAt ?? null,
          lastRunStatus: last?.status ?? null,
          lastRunError: last?.errorMessage ?? null,
          erroredLast7d,
          status,
        };
      }),
    });
  });

  // ---------------------------------------------------------------------------
  // Custom agent — full detail (system prompt, data scope, members, recent
  // logs). Used by the Agents tab "View" drawer.
  // ---------------------------------------------------------------------------
  apiRoute(app, "get", "/api/admin/agents/custom/:id", {
    tag: "Admin: Agents",
    summary: "Super admin: get a custom agent with members + recent run logs",
    responses: { ...r200("Agent detail", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid agent id" });

    const [row] = await db.select({
      agent: customAgents,
      orgName: organizations.name,
      creatorFirst: users.firstName,
      creatorLast: users.lastName,
      creatorEmail: users.email,
    }).from(customAgents)
      .leftJoin(organizations, eq(organizations.id, customAgents.organizationId))
      .leftJoin(users, eq(users.id, customAgents.createdBy))
      .where(eq(customAgents.id, id));
    if (!row) return res.status(404).json({ message: "Agent not found" });

    const memberIds = await listAgentMembers(id);
    const recentLogs = await listAgentLogs(id, 10);

    // Recent conversation count is a useful "are people using this?" signal.
    const [{ convCount }] = await db.select({
      convCount: sql<number>`count(*)::int`,
    }).from(customAgentConversations).where(eq(customAgentConversations.agentId, id));

    // Derive the same status badge fields the list endpoint exposes so the
    // edit drawer can render Status / Last run without crashing on undefined.
    const latestMap = await loadLatestLogByAgent([id]);
    const last = latestMap.get(id) ?? null;
    const erroredLast7d = last?.status === "error" && last.createdAt
      ? Date.now() - last.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000
      : false;
    let status: "archived" | "disabled" | "errored" | "scheduled" | "active";
    if (row.agent.archivedAt) status = "archived";
    else if (!row.agent.enabled) status = "disabled";
    else if (erroredLast7d) status = "errored";
    else if (row.agent.type === "scheduled" && row.agent.nextRun) status = "scheduled";
    else status = "active";

    res.json({
      ...row.agent,
      organizationName: row.orgName,
      createdByName: `${row.creatorFirst ?? ""} ${row.creatorLast ?? ""}`.trim() || row.creatorEmail || null,
      createdByEmail: row.creatorEmail,
      memberIds,
      recentLogs,
      conversationCount: convCount,
      lastRunAt: last?.createdAt ?? null,
      lastRunStatus: last?.status ?? null,
      lastRunError: last?.errorMessage ?? null,
      erroredLast7d,
      status,
    });
  });

  // ---------------------------------------------------------------------------
  // Custom agent — full edit (reuses the org-admin baseSchema so validation
  // and field semantics stay in sync). Forces organizationId from the
  // existing row so super admins can't accidentally re-home an agent.
  // ---------------------------------------------------------------------------
  apiRoute(app, "patch", "/api/admin/agents/custom/:id", {
    tag: "Admin: Agents",
    summary: "Super admin: edit a custom agent (cross-org)",
    requestBody: body({ type: "object" }),
    responses: { ...r200("Updated agent", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid agent id" });

    const [existing] = await db.select().from(customAgents).where(eq(customAgents.id, id));
    if (!existing) return res.status(404).json({ message: "Agent not found" });

    // Force organizationId so the shared schema's required field is satisfied
    // without trusting the request body to specify it.
    const parsed = adminCustomAgentPatchSchema.safeParse({
      ...req.body,
      organizationId: existing.organizationId,
    });
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join(", "),
      });
    }
    const { organizationId: _ignore, memberIds, dataScope, ...patchData } = parsed.data;
    if (Object.keys(patchData).length === 0 && memberIds === undefined && dataScope === undefined) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const patch: Partial<InsertCustomAgent> = { ...patchData };
    if (dataScope) {
      patch.dataScope = {
        type: dataScope.type,
        portfolioIds: dataScope.portfolioIds ?? undefined,
        projectIds: dataScope.projectIds ?? undefined,
      };
    }
    if (
      patch.type === "scheduled" ||
      patchData.scheduleDay !== undefined ||
      patchData.scheduleTime !== undefined ||
      patchData.timezone !== undefined
    ) {
      patch.nextRun = computeNextRun(
        patch.scheduleDay ?? existing.scheduleDay ?? null,
        patch.scheduleTime ?? existing.scheduleTime ?? null,
        patch.timezone ?? existing.timezone ?? null,
      );
    }

    const updated = await updateAgent(id, patch, memberIds);
    if (!updated) return res.status(404).json({ message: "Agent not found" });

    await logUserActivity(userId, "super_admin_custom_agent_update", "custom_agent", id, {
      organizationId: existing.organizationId,
      changes: Object.keys(patchData),
      memberIdsChanged: memberIds !== undefined,
      dataScopeChanged: dataScope !== undefined,
    }, req);

    res.json(updated);
  });

  // ---------------------------------------------------------------------------
  // Custom agent — disable (sets enabled = false; audit logged)
  // ---------------------------------------------------------------------------
  apiRoute(app, "post", "/api/admin/agents/custom/:id/disable", {
    tag: "Admin: Agents",
    summary: "Super admin: disable a custom agent",
    responses: { ...r200("Disabled", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid agent id" });

    const [existing] = await db.select().from(customAgents).where(eq(customAgents.id, id));
    if (!existing) return res.status(404).json({ message: "Agent not found" });

    const [updated] = await db.update(customAgents)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(customAgents.id, id))
      .returning();

    await logUserActivity(userId, "super_admin_custom_agent_disable", "custom_agent", id, {
      organizationId: existing.organizationId,
      name: existing.name,
    }, req);

    res.json(updated);
  });

  // ---------------------------------------------------------------------------
  // Custom agent — archive
  // ---------------------------------------------------------------------------
  apiRoute(app, "post", "/api/admin/agents/custom/:id/archive", {
    tag: "Admin: Agents",
    summary: "Super admin: archive a custom agent",
    responses: { ...r200("Archived", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid agent id" });

    const [existing] = await db.select().from(customAgents).where(eq(customAgents.id, id));
    if (!existing) return res.status(404).json({ message: "Agent not found" });

    await archiveAgent(id);

    await logUserActivity(userId, "super_admin_custom_agent_archive", "custom_agent", id, {
      organizationId: existing.organizationId,
      name: existing.name,
    }, req);

    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Custom agent — unarchive (clears archivedAt; recomputes nextRun for
  // scheduled agents). Stays disabled until the admin re-enables it via
  // PATCH so an archived-then-restored agent doesn't unexpectedly resume
  // emailing recipients.
  // ---------------------------------------------------------------------------
  apiRoute(app, "post", "/api/admin/agents/custom/:id/unarchive", {
    tag: "Admin: Agents",
    summary: "Super admin: restore an archived custom agent",
    responses: { ...r200("Unarchived", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid agent id" });

    const [existing] = await db.select().from(customAgents).where(eq(customAgents.id, id));
    if (!existing) return res.status(404).json({ message: "Agent not found" });
    if (!existing.archivedAt) return res.status(400).json({ message: "Agent is not archived" });

    const nextRun = existing.type === "scheduled"
      ? computeNextRun(existing.scheduleDay, existing.scheduleTime, existing.timezone)
      : null;

    const [updated] = await db.update(customAgents)
      .set({ archivedAt: null, nextRun, updatedAt: new Date() })
      .where(eq(customAgents.id, id))
      .returning();

    await logUserActivity(userId, "super_admin_custom_agent_unarchive", "custom_agent", id, {
      organizationId: existing.organizationId,
      name: existing.name,
    }, req);

    res.json(updated);
  });

  // ---------------------------------------------------------------------------
  // Custom agent — delete (cascades via FK)
  // ---------------------------------------------------------------------------
  apiRoute(app, "delete", "/api/admin/agents/custom/:id", {
    tag: "Admin: Agents",
    summary: "Super admin: permanently delete a custom agent",
    responses: { ...r200("Deleted", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid agent id" });

    const [existing] = await db.select().from(customAgents).where(eq(customAgents.id, id));
    if (!existing) return res.status(404).json({ message: "Agent not found" });

    await deleteAgent(id);

    await logUserActivity(userId, "super_admin_custom_agent_delete", "custom_agent", id, {
      organizationId: existing.organizationId,
      name: existing.name,
      type: existing.type,
    }, req);

    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // Built-in agents — list + per-key upsert
  // Provider-config secrets are redacted on read (returns *Set booleans).
  // ---------------------------------------------------------------------------
  apiRoute(app, "get", "/api/admin/agents/builtin", {
    tag: "Admin: Agents",
    summary: "Super admin: list built-in agent settings (Friday / Power BI / Project Agent)",
    responses: { ...r200("Built-in agents", { type: "array" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const settings = await listAllBuiltinAgentSettings();
    res.json(BUILTIN_AGENTS.map(a => {
      const s = settings[a.key];
      return {
        id: a.id,
        key: a.key,
        name: a.name,
        description: a.description,
        builtinDefaultPrompt: a.defaultPrompt,
        builtinDefaultModel: a.defaultModel,
        enabled: s?.enabled ?? true,
        defaultSystemPrompt: s?.defaultSystemPrompt ?? null,
        defaultModel: s?.defaultModel ?? null,
        providerConfig: redactProviderConfig(s?.providerConfig ?? null),
        // Surfaced for the Friday card; null on the others.
        guestQuestionLimit: a.key === "friday" ? (s?.guestQuestionLimit ?? null) : null,
        builtinDefaultGuestQuestionLimit: a.key === "friday" ? DEFAULT_GUEST_QUESTION_LIMIT : null,
        updatedAt: s?.updatedAt ?? null,
        updatedBy: s?.updatedBy ?? null,
      };
    }));
  });

  apiRoute(app, "patch", "/api/admin/agents/builtin/:key", {
    tag: "Admin: Agents",
    summary: "Super admin: update a built-in agent (toggle / default prompt / default model / provider config)",
    requestBody: body({ type: "object" }),
    responses: { ...r200("Updated", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    const key = String(req.params.key) as BuiltinAgentKey;
    if (!BUILTIN_AGENT_KEYS.includes(key)) {
      return res.status(400).json({ message: "Unknown built-in agent" });
    }
    const parsed = upsertBuiltinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join(", ") });
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    // Merge provider-config patches with the existing row so a UI that
    // only knows about (say) Anthropic can update its key without
    // clobbering Azure credentials it never received.
    let nextProviderConfig: any = undefined;
    if (parsed.data.providerConfig !== undefined) {
      const existingRow = (await listAllBuiltinAgentSettings())[key];
      const existingCfg = (existingRow?.providerConfig as any) ?? null;
      if (parsed.data.providerConfig === null) {
        nextProviderConfig = null;
      } else {
        nextProviderConfig = { ...(existingCfg ?? {}) };
        for (const section of ["azure", "openai", "anthropic"] as const) {
          const incoming = parsed.data.providerConfig[section];
          if (incoming === undefined) continue;
          if (incoming === null) {
            delete nextProviderConfig[section];
            continue;
          }
          nextProviderConfig[section] = {
            ...(existingCfg?.[section] ?? {}),
            ...incoming,
          };
        }
      }
    }

    // The guest-question-limit field is Friday-only; silently ignore
    // it for the other built-in keys so a stray patch can't pollute
    // their row with a meaningless setting.
    const guestQuestionLimit =
      key === "friday" ? parsed.data.guestQuestionLimit : undefined;

    const updated = await upsertBuiltinAgentSetting(key, {
      enabled: parsed.data.enabled,
      defaultSystemPrompt: parsed.data.defaultSystemPrompt,
      defaultModel: parsed.data.defaultModel,
      providerConfig: nextProviderConfig,
      guestQuestionLimit,
      updatedBy: userId,
    });
    await logUserActivity(userId, "super_admin_builtin_agent_update", "builtin_agent", undefined, {
      key,
      changes: {
        enabled: parsed.data.enabled,
        defaultSystemPrompt: parsed.data.defaultSystemPrompt !== undefined,
        defaultModel: parsed.data.defaultModel !== undefined,
        providerConfig: parsed.data.providerConfig !== undefined,
        guestQuestionLimit: guestQuestionLimit !== undefined,
      },
    }, req);
    res.json({
      ...updated,
      providerConfig: redactProviderConfig(updated.providerConfig),
    });
  });

  // ---------------------------------------------------------------------------
  // Run history — cross-org custom_agent_logs feed
  //
  // Query params: organizationId, agentId, status (success|error|skipped),
  // from / to (ISO date strings), limit (max 200), offset.
  // ---------------------------------------------------------------------------
  apiRoute(app, "get", "/api/admin/agents/run-history", {
    tag: "Admin: Agents",
    summary: "Super admin: cross-org custom agent run history",
    responses: { ...r200("Run history page", { type: "object" }), ...stdRes },
  }, async (req: Request, res: Response) => {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;

    const orgIdParam = req.query.organizationId ? Number(req.query.organizationId) : null;
    const agentIdParam = req.query.agentId ? Number(req.query.agentId) : null;
    const status = typeof req.query.status === "string" && ["success", "error", "skipped"].includes(req.query.status)
      ? (req.query.status as string)
      : null;
    const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
    const toRaw = typeof req.query.to === "string" ? req.query.to : null;
    const fromDate = fromRaw ? new Date(fromRaw) : null;
    const toDate = toRaw ? new Date(toRaw) : null;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ message: "Invalid 'from' date" });
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ message: "Invalid 'to' date" });
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const conditions: SQL[] = [];
    if (orgIdParam) conditions.push(eq(customAgents.organizationId, orgIdParam));
    if (agentIdParam) conditions.push(eq(customAgentLogs.agentId, agentIdParam));
    if (status) conditions.push(eq(customAgentLogs.status, status));
    if (fromDate) conditions.push(gte(customAgentLogs.createdAt, fromDate));
    if (toDate) conditions.push(lte(customAgentLogs.createdAt, toDate));

    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db.select({
      log: customAgentLogs,
      agentName: customAgents.name,
      agentType: customAgents.type,
      orgId: customAgents.organizationId,
      orgName: organizations.name,
    }).from(customAgentLogs)
      .leftJoin(customAgents, eq(customAgents.id, customAgentLogs.agentId))
      .leftJoin(organizations, eq(organizations.id, customAgents.organizationId))
      .where(where)
      .orderBy(desc(customAgentLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(customAgentLogs)
      .leftJoin(customAgents, eq(customAgents.id, customAgentLogs.agentId))
      .where(where);

    res.json({
      total: count,
      limit,
      offset,
      items: rows.map(r => ({
        ...r.log,
        agentName: r.agentName,
        agentType: r.agentType,
        organizationId: r.orgId,
        organizationName: r.orgName,
      })),
    });
  });
}
