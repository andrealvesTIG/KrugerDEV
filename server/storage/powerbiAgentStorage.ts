import { db } from "../db";
import { powerbiAgentConversations, powerbiAgentMessages } from "@shared/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

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
  return db.select().from(powerbiAgentConversations)
    .where(and(
      eq(powerbiAgentConversations.organizationId, orgId),
      eq(powerbiAgentConversations.userId, userId),
      isNull(powerbiAgentConversations.archivedAt),
    ))
    .orderBy(desc(powerbiAgentConversations.lastMessageAt));
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

export async function addMessage(conversationId: number, role: "user" | "assistant", content: string, attachments: PbiAttachment[] | null = null) {
  const [row] = await db.insert(powerbiAgentMessages).values({
    conversationId,
    role,
    content,
    attachments: attachments ?? null,
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

export async function setSubmittedIntake(id: number, intakeId: number) {
  await db.update(powerbiAgentConversations)
    .set({ submittedIntakeId: intakeId, updatedAt: new Date() })
    .where(eq(powerbiAgentConversations.id, id));
}

export async function deleteConversation(id: number, orgId: number, userId: string) {
  await db.delete(powerbiAgentConversations)
    .where(and(
      eq(powerbiAgentConversations.id, id),
      eq(powerbiAgentConversations.organizationId, orgId),
      eq(powerbiAgentConversations.userId, userId),
    ));
}
