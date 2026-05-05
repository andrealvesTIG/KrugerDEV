import { db } from "../db";
import {
  customAgents,
  customAgentMembers,
  customAgentConversations,
  customAgentMessages,
  customAgentLogs,
  organizationMembers,
  users,
  type CustomAgent,
  type InsertCustomAgent,
} from "@shared/schema";
import { and, desc, eq, isNull, inArray, or, sql } from "drizzle-orm";

export type AgentVisibilityRow = CustomAgent & { isOwner: boolean; isAdmin: boolean; createdByName?: string | null };

export async function userIsOrgAdmin(userId: string, orgId: number): Promise<boolean> {
  const [m] = await db.select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, orgId)));
  if (!m) return false;
  // Org-level roles vary across the codebase: 'owner', 'org_admin', or
  // legacy 'admin'. Accept any of them (super_admin is granted at the
  // platform level and is checked separately by callers when needed).
  return m.role === "owner" || m.role === "admin" || m.role === "org_admin";
}

// Admin-only listing: every custom (non-archived) agent in the org with
// the owner's display info, regardless of visibility or member allowlist.
export async function listAllOrgAgentsForAdmin(orgId: number): Promise<AgentVisibilityRow[]> {
  const rows = await db.select({
    agent: customAgents,
    creatorFirst: users.firstName,
    creatorLast: users.lastName,
    creatorEmail: users.email,
  }).from(customAgents)
    .leftJoin(users, eq(users.id, customAgents.createdBy))
    .where(and(eq(customAgents.organizationId, orgId), isNull(customAgents.archivedAt)))
    .orderBy(desc(customAgents.updatedAt));

  return rows.map(({ agent: a, creatorFirst, creatorLast, creatorEmail }) => ({
    ...a,
    isOwner: false,
    isAdmin: true,
    createdByName: `${creatorFirst ?? ""} ${creatorLast ?? ""}`.trim() || creatorEmail || null,
    createdByEmail: creatorEmail ?? null,
  }));
}

export interface OrgAgentUsageStat {
  agentId: number;
  conversationCount30d: number;
  runCount30d: number;
  usageCount30d: number;
  lastUsedAt: string | null;
}

// Per-agent usage roll-up for an org's admin view: conversations started in
// the last 30 days, scheduled runs logged in the last 30 days, and the most
// recent activity timestamp across either source.
interface UsageStatRow {
  agent_id: number;
  conversation_count_30d: number | string;
  run_count_30d: number | string;
  last_used_at: string | Date | null;
  [key: string]: unknown;
}

export async function getOrgAgentUsageStats(orgId: number): Promise<OrgAgentUsageStat[]> {
  const result = await db.execute<UsageStatRow>(sql`
    WITH agent_ids AS (
      SELECT id FROM ${customAgents}
      WHERE ${customAgents.organizationId} = ${orgId} AND ${customAgents.archivedAt} IS NULL
    ),
    conv AS (
      SELECT ${customAgentConversations.agentId} AS agent_id,
             COUNT(*) FILTER (WHERE ${customAgentConversations.createdAt} >= NOW() - INTERVAL '30 days') AS cnt,
             MAX(${customAgentConversations.lastMessageAt}) AS last_at
      FROM ${customAgentConversations}
      WHERE ${customAgentConversations.organizationId} = ${orgId}
      GROUP BY ${customAgentConversations.agentId}
    ),
    runs AS (
      SELECT ${customAgentLogs.agentId} AS agent_id,
             COUNT(*) FILTER (WHERE ${customAgentLogs.createdAt} >= NOW() - INTERVAL '30 days') AS cnt,
             MAX(${customAgentLogs.createdAt}) AS last_at
      FROM ${customAgentLogs}
      WHERE ${customAgentLogs.agentId} IN (SELECT id FROM agent_ids)
      GROUP BY ${customAgentLogs.agentId}
    )
    SELECT a.id AS agent_id,
           COALESCE(conv.cnt, 0) AS conversation_count_30d,
           COALESCE(runs.cnt, 0) AS run_count_30d,
           CASE
             WHEN conv.last_at IS NULL AND runs.last_at IS NULL THEN NULL
             ELSE GREATEST(COALESCE(conv.last_at, runs.last_at), COALESCE(runs.last_at, conv.last_at))
           END AS last_used_at
    FROM agent_ids a
    LEFT JOIN conv ON conv.agent_id = a.id
    LEFT JOIN runs ON runs.agent_id = a.id
  `);

  return result.rows.map((r) => {
    const conv = Number(r.conversation_count_30d ?? 0);
    const runs = Number(r.run_count_30d ?? 0);
    const last = r.last_used_at ? new Date(r.last_used_at).toISOString() : null;
    return {
      agentId: Number(r.agent_id),
      conversationCount30d: conv,
      runCount30d: runs,
      usageCount30d: conv + runs,
      lastUsedAt: last,
    };
  });
}

export async function reassignAgentOwner(agentId: number, newOwnerId: string): Promise<CustomAgent | null> {
  const [a] = await db.update(customAgents)
    .set({ createdBy: newOwnerId, updatedAt: new Date() })
    .where(eq(customAgents.id, agentId))
    .returning();
  return a ?? null;
}

export async function listVisibleAgents(orgId: number, userId: string): Promise<AgentVisibilityRow[]> {
  const isAdmin = await userIsOrgAdmin(userId, orgId);
  // Admins see all in-org agents; otherwise: owned + org-shared + member-allowlisted
  const memberAgentIdsRows = await db.select({ id: customAgentMembers.agentId })
    .from(customAgentMembers).where(eq(customAgentMembers.userId, userId));
  const memberAgentIds = memberAgentIdsRows.map(r => r.id);

  const baseConditions = [
    eq(customAgents.organizationId, orgId),
    isNull(customAgents.archivedAt),
  ];
  if (!isAdmin) {
    const visibilityClause = or(
      eq(customAgents.createdBy, userId),
      eq(customAgents.visibility, "org"),
      memberAgentIds.length > 0
        ? and(eq(customAgents.visibility, "members"), inArray(customAgents.id, memberAgentIds))
        : sql`false`,
    );
    if (visibilityClause) baseConditions.push(visibilityClause);
  }
  const rows = await db.select({
    agent: customAgents,
    creatorFirst: users.firstName,
    creatorLast: users.lastName,
    creatorEmail: users.email,
  }).from(customAgents)
    .leftJoin(users, eq(users.id, customAgents.createdBy))
    .where(and(...baseConditions))
    .orderBy(desc(customAgents.updatedAt));

  return rows.map(({ agent: a, creatorFirst, creatorLast, creatorEmail }) => ({
    ...a,
    isOwner: a.createdBy === userId,
    isAdmin,
    createdByName: `${creatorFirst ?? ""} ${creatorLast ?? ""}`.trim() || creatorEmail || null,
  }));
}

export async function getAgentForUser(agentId: number, orgId: number, userId: string): Promise<AgentVisibilityRow | null> {
  const [a] = await db.select().from(customAgents)
    .where(and(eq(customAgents.id, agentId), eq(customAgents.organizationId, orgId), isNull(customAgents.archivedAt)));
  if (!a) return null;
  const isAdmin = await userIsOrgAdmin(userId, orgId);
  const isOwner = a.createdBy === userId;
  if (isOwner || isAdmin) return { ...a, isOwner, isAdmin };
  if (a.visibility === "org") return { ...a, isOwner, isAdmin };
  if (a.visibility === "members") {
    const [m] = await db.select().from(customAgentMembers)
      .where(and(eq(customAgentMembers.agentId, agentId), eq(customAgentMembers.userId, userId)));
    if (m) return { ...a, isOwner, isAdmin };
  }
  return null;
}

export async function canEditAgent(agentId: number, orgId: number, userId: string): Promise<boolean> {
  const [a] = await db.select({ createdBy: customAgents.createdBy }).from(customAgents)
    .where(and(eq(customAgents.id, agentId), eq(customAgents.organizationId, orgId)));
  if (!a) return false;
  if (a.createdBy === userId) return true;
  return userIsOrgAdmin(userId, orgId);
}

export async function createAgent(input: InsertCustomAgent, memberIds: string[] = []): Promise<CustomAgent> {
  const [a] = await db.insert(customAgents).values(input).returning();
  if (input.visibility === "members" && memberIds.length > 0) {
    await db.insert(customAgentMembers).values(memberIds.map(uid => ({ agentId: a.id, userId: uid }))).onConflictDoNothing();
  }
  return a;
}

export async function updateAgent(agentId: number, patch: Partial<InsertCustomAgent>, memberIds?: string[]): Promise<CustomAgent | null> {
  const [a] = await db.update(customAgents)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(customAgents.id, agentId))
    .returning();
  if (!a) return null;
  if (memberIds !== undefined) {
    await db.delete(customAgentMembers).where(eq(customAgentMembers.agentId, agentId));
    if (a.visibility === "members" && memberIds.length > 0) {
      await db.insert(customAgentMembers).values(memberIds.map(uid => ({ agentId, userId: uid }))).onConflictDoNothing();
    }
  }
  return a;
}

export async function archiveAgent(agentId: number): Promise<void> {
  await db.update(customAgents).set({ archivedAt: new Date(), enabled: false, nextRun: null, updatedAt: new Date() }).where(eq(customAgents.id, agentId));
}

export async function deleteAgent(agentId: number): Promise<void> {
  await db.delete(customAgents).where(eq(customAgents.id, agentId));
}

export async function listAgentMembers(agentId: number): Promise<string[]> {
  const rows = await db.select({ userId: customAgentMembers.userId }).from(customAgentMembers).where(eq(customAgentMembers.agentId, agentId));
  return rows.map(r => r.userId);
}

// ----- Conversations -----

export async function createAgentConversation(agentId: number, orgId: number, userId: string, title: string | null) {
  const [row] = await db.insert(customAgentConversations).values({ agentId, organizationId: orgId, userId, title }).returning();
  return row;
}

export async function listAgentConversations(agentId: number, orgId: number, userId: string, limit = 50) {
  return db.select({
    id: customAgentConversations.id,
    title: customAgentConversations.title,
    createdAt: customAgentConversations.createdAt,
    lastMessageAt: customAgentConversations.lastMessageAt,
    snippet: sql<string | null>`(SELECT substring(content from 1 for 140) FROM ${customAgentMessages} WHERE ${customAgentMessages.conversationId} = ${customAgentConversations.id} ORDER BY ${customAgentMessages.createdAt} DESC LIMIT 1)`,
  }).from(customAgentConversations)
    .where(and(
      eq(customAgentConversations.agentId, agentId),
      eq(customAgentConversations.organizationId, orgId),
      eq(customAgentConversations.userId, userId),
      isNull(customAgentConversations.archivedAt),
    ))
    .orderBy(desc(customAgentConversations.lastMessageAt))
    .limit(limit);
}

export async function getAgentConversation(id: number, agentId: number, orgId: number, userId: string) {
  const [row] = await db.select().from(customAgentConversations)
    .where(and(
      eq(customAgentConversations.id, id),
      eq(customAgentConversations.agentId, agentId),
      eq(customAgentConversations.organizationId, orgId),
      eq(customAgentConversations.userId, userId),
    ));
  return row ?? null;
}

export async function getAgentMessages(conversationId: number) {
  return db.select().from(customAgentMessages)
    .where(eq(customAgentMessages.conversationId, conversationId))
    .orderBy(customAgentMessages.createdAt);
}

export async function addAgentMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  attachments: { name: string; type: string; size: number }[] | null = null,
  pageContext: Record<string, any> | null = null,
) {
  const [row] = await db.insert(customAgentMessages).values({
    conversationId, role, content, attachments, pageContext,
  }).returning();
  await db.update(customAgentConversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(customAgentConversations.id, conversationId));
  return row;
}

export type CustomAgentMessageMetadata = { quickReplySelection?: string };

/**
 * Merge a small JSON patch into a custom-agent message's `metadata`
 * column. Mirrors `setFridayMessageMetadata` so chip-selection
 * persistence works the same way for both built-in Friday and custom
 * chat agents.
 *
 * Scoped to assistant messages only — chips only ever live on
 * assistant bubbles, and a user message should never gain a
 * "quickReplySelection" marker.
 */
export async function setAgentMessageMetadata(
  messageId: number,
  conversationId: number,
  patch: CustomAgentMessageMetadata,
): Promise<{ id: number; metadata: CustomAgentMessageMetadata | null } | null> {
  const patchJson = JSON.stringify(patch);
  const result = await db.execute(sql`
    UPDATE custom_agent_messages
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${patchJson}::jsonb
    WHERE id = ${messageId}
      AND conversation_id = ${conversationId}
      AND role = 'assistant'
    RETURNING id, metadata
  `);
  const raw: unknown = result;
  const rows = Array.isArray(raw)
    ? (raw as unknown as { id: number; metadata: CustomAgentMessageMetadata | null }[])
    : ((raw as { rows?: unknown[] }).rows as { id: number; metadata: CustomAgentMessageMetadata | null }[] | undefined) ?? [];
  return rows[0] ?? null;
}

export async function updateAgentConversationTitle(id: number, title: string) {
  await db.update(customAgentConversations).set({ title: title.slice(0, 200), updatedAt: new Date() }).where(eq(customAgentConversations.id, id));
}

export async function archiveAgentConversation(id: number, orgId: number, userId: string) {
  await db.update(customAgentConversations).set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(customAgentConversations.id, id), eq(customAgentConversations.organizationId, orgId), eq(customAgentConversations.userId, userId)));
}

export async function deleteAgentConversation(id: number, orgId: number, userId: string) {
  await db.delete(customAgentConversations)
    .where(and(eq(customAgentConversations.id, id), eq(customAgentConversations.organizationId, orgId), eq(customAgentConversations.userId, userId)));
}

// ----- Logs -----

export async function logAgentRun(input: {
  agentId: number;
  status: "success" | "error" | "skipped";
  subject?: string | null;
  recipientEmails?: string[] | null;
  emailPreview?: string | null;
  errorMessage?: string | null;
  triggeredBy?: string | null;
}) {
  await db.insert(customAgentLogs).values({
    agentId: input.agentId,
    status: input.status,
    subject: input.subject ?? null,
    recipientEmails: input.recipientEmails ?? null,
    emailPreview: input.emailPreview?.slice(0, 2000) ?? null,
    errorMessage: input.errorMessage ?? null,
    triggeredBy: input.triggeredBy ?? "cron",
  });
}

export async function listAgentLogs(agentId: number, limit = 50) {
  return db.select().from(customAgentLogs)
    .where(eq(customAgentLogs.agentId, agentId))
    .orderBy(desc(customAgentLogs.createdAt))
    .limit(limit);
}
