import { db } from "../db";
import { fridayConversations, fridayMessages } from "@shared/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type FridayAttachment = { name: string; type: string; size: number };
export type FridayPageContext = { path?: string; entityType?: string; entityId?: number | string };

export async function createConversation(
  orgId: number,
  userId: string,
  title: string | null = null,
) {
  const [row] = await db
    .insert(fridayConversations)
    .values({
      organizationId: orgId,
      userId,
      title,
    })
    .returning();
  return row;
}

export async function listConversations(orgId: number, userId: string, limit = 50) {
  const rows = await db
    .select({
      id: fridayConversations.id,
      organizationId: fridayConversations.organizationId,
      userId: fridayConversations.userId,
      title: fridayConversations.title,
      archivedAt: fridayConversations.archivedAt,
      lastMessageAt: fridayConversations.lastMessageAt,
      createdAt: fridayConversations.createdAt,
      updatedAt: fridayConversations.updatedAt,
      snippet: sql<string | null>`(
        SELECT substring(content from 1 for 140)
        FROM ${fridayMessages}
        WHERE ${fridayMessages.conversationId} = ${fridayConversations.id}
        ORDER BY ${fridayMessages.createdAt} DESC
        LIMIT 1
      )`,
    })
    .from(fridayConversations)
    .where(
      and(
        eq(fridayConversations.organizationId, orgId),
        eq(fridayConversations.userId, userId),
        isNull(fridayConversations.archivedAt),
      ),
    )
    .orderBy(desc(fridayConversations.lastMessageAt))
    .limit(limit);
  return rows;
}

export async function getConversation(id: number, orgId: number, userId: string) {
  const [row] = await db
    .select()
    .from(fridayConversations)
    .where(
      and(
        eq(fridayConversations.id, id),
        eq(fridayConversations.organizationId, orgId),
        eq(fridayConversations.userId, userId),
      ),
    );
  return row;
}

export async function getMessages(conversationId: number) {
  return db
    .select()
    .from(fridayMessages)
    .where(eq(fridayMessages.conversationId, conversationId))
    .orderBy(fridayMessages.createdAt);
}

export async function addMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  attachments: FridayAttachment[] | null = null,
  pageContext: FridayPageContext | null = null,
) {
  const [row] = await db
    .insert(fridayMessages)
    .values({
      conversationId,
      role,
      content,
      attachments: attachments ?? null,
      pageContext: pageContext ?? null,
    })
    .returning();
  await db
    .update(fridayConversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(fridayConversations.id, conversationId));
  return row;
}

export async function updateConversationTitle(
  id: number,
  orgId: number,
  userId: string,
  title: string,
) {
  const [row] = await db
    .update(fridayConversations)
    .set({ title: title.slice(0, 200), updatedAt: new Date() })
    .where(
      and(
        eq(fridayConversations.id, id),
        eq(fridayConversations.organizationId, orgId),
        eq(fridayConversations.userId, userId),
      ),
    )
    .returning();
  return row;
}

export async function archiveConversation(id: number, orgId: number, userId: string) {
  const [row] = await db
    .update(fridayConversations)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(fridayConversations.id, id),
        eq(fridayConversations.organizationId, orgId),
        eq(fridayConversations.userId, userId),
      ),
    )
    .returning();
  return row;
}

export async function deleteConversation(id: number, orgId: number, userId: string) {
  const [row] = await db
    .delete(fridayConversations)
    .where(
      and(
        eq(fridayConversations.id, id),
        eq(fridayConversations.organizationId, orgId),
        eq(fridayConversations.userId, userId),
      ),
    )
    .returning();
  return row;
}
