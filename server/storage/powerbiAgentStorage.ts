import { db } from "../db";
import { powerbiAgentConversations, powerbiAgentMessages, type PbiIntakeState } from "@shared/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type PbiAttachment = { name: string; objectPath: string; contentType: string; size: number };

export async function createConversation(orgId: number, userId: string, model: string = "fast", title: string | null = null) {
  const [row] = await db.insert(powerbiAgentConversations).values({
    organizationId: orgId,
    userId,
    model,
    title,
  }).returning();
  return row;
}

export async function listConversations(orgId: number, userId: string) {
  // Include latest message snippet for richer history list
  const rows = await db.select({
    id: powerbiAgentConversations.id,
    organizationId: powerbiAgentConversations.organizationId,
    userId: powerbiAgentConversations.userId,
    title: powerbiAgentConversations.title,
    model: powerbiAgentConversations.model,
    submittedIntakeId: powerbiAgentConversations.submittedIntakeId,
    archivedAt: powerbiAgentConversations.archivedAt,
    lastMessageAt: powerbiAgentConversations.lastMessageAt,
    createdAt: powerbiAgentConversations.createdAt,
    updatedAt: powerbiAgentConversations.updatedAt,
    snippet: sql<string | null>`(
      SELECT substring(content from 1 for 140)
      FROM ${powerbiAgentMessages}
      WHERE ${powerbiAgentMessages.conversationId} = ${powerbiAgentConversations.id}
      ORDER BY ${powerbiAgentMessages.createdAt} DESC
      LIMIT 1
    )`,
  }).from(powerbiAgentConversations)
    .where(and(
      eq(powerbiAgentConversations.organizationId, orgId),
      eq(powerbiAgentConversations.userId, userId),
      isNull(powerbiAgentConversations.archivedAt),
    ))
    .orderBy(desc(powerbiAgentConversations.lastMessageAt));
  return rows;
}

export async function getConversation(id: number, orgId: number, userId: string) {
  const [row] = await db.select().from(powerbiAgentConversations)
    .where(and(
      eq(powerbiAgentConversations.id, id),
      eq(powerbiAgentConversations.organizationId, orgId),
      eq(powerbiAgentConversations.userId, userId),
    ));
  return row;
}

export async function getMessages(conversationId: number) {
  return db.select().from(powerbiAgentMessages)
    .where(eq(powerbiAgentMessages.conversationId, conversationId))
    .orderBy(powerbiAgentMessages.createdAt);
}

export async function addMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  attachments: PbiAttachment[] | null = null,
  options: string[] | null = null,
) {
  const [row] = await db.insert(powerbiAgentMessages).values({
    conversationId,
    role,
    content,
    attachments: attachments ?? null,
    options: options ?? null,
  }).returning();
  await db.update(powerbiAgentConversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(powerbiAgentConversations.id, conversationId));
  return row;
}

export async function updateConversationTitle(id: number, orgId: number, userId: string, title: string) {
  const [row] = await db.update(powerbiAgentConversations)
    .set({ title: title.slice(0, 200), updatedAt: new Date() })
    .where(and(
      eq(powerbiAgentConversations.id, id),
      eq(powerbiAgentConversations.organizationId, orgId),
      eq(powerbiAgentConversations.userId, userId),
    ))
    .returning();
  return row;
}

export async function updateConversationModel(id: number, model: string) {
  await db.update(powerbiAgentConversations)
    .set({ model, updatedAt: new Date() })
    .where(eq(powerbiAgentConversations.id, id));
}

export async function setSubmittedIntake(
  id: number,
  intakeId: number,
  meta?: { requestNumber?: string | null; intakeNumber?: string | null },
) {
  await db.update(powerbiAgentConversations)
    .set({ submittedIntakeId: intakeId, updatedAt: new Date() })
    .where(eq(powerbiAgentConversations.id, id));
  if (meta) {
    const [row] = await db.select({ intakeState: powerbiAgentConversations.intakeState })
      .from(powerbiAgentConversations)
      .where(eq(powerbiAgentConversations.id, id));
    const current = (row?.intakeState as PbiIntakeState | null) ?? null;
    if (current) {
      const next: PbiIntakeState = {
        ...current,
        submittedRequestNumber: meta.requestNumber ?? current.submittedRequestNumber ?? null,
        submittedIntakeNumber: meta.intakeNumber ?? current.submittedIntakeNumber ?? null,
      };
      await db.update(powerbiAgentConversations)
        .set({ intakeState: next, updatedAt: new Date() })
        .where(eq(powerbiAgentConversations.id, id));
    }
  }
}

export async function updateConversationIntakeState(id: number, state: PbiIntakeState) {
  await db.update(powerbiAgentConversations)
    .set({ intakeState: state, updatedAt: new Date() })
    .where(eq(powerbiAgentConversations.id, id));
}

export async function getConversationIntakeState(id: number): Promise<PbiIntakeState | null> {
  const [row] = await db.select({ intakeState: powerbiAgentConversations.intakeState })
    .from(powerbiAgentConversations)
    .where(eq(powerbiAgentConversations.id, id));
  return (row?.intakeState as PbiIntakeState | null) ?? null;
}

export async function deleteConversation(id: number, orgId: number, userId: string) {
  await db.delete(powerbiAgentConversations)
    .where(and(
      eq(powerbiAgentConversations.id, id),
      eq(powerbiAgentConversations.organizationId, orgId),
      eq(powerbiAgentConversations.userId, userId),
    ));
}
