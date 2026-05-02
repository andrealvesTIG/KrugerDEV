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

async function userIsOrgAdmin(userId: string, orgId: number): Promise<boolean> {
  const [m] = await db.select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, orgId)));
  return !!m && (m.role === "owner" || m.role === "admin");
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
