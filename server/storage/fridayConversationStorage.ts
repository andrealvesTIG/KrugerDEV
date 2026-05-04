import { db } from "../db";
import { fridayConversations, fridayMessages } from "@shared/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type FridayAttachment = { name: string; type: string; size: number };
export type FridayPageContext = { path?: string; entityType?: string; entityId?: number | string };

// Row shape returned by the addMessage CTE — matches the friday_messages
// schema with snake_case columns aliased back to camelCase so callers see
// the same shape Drizzle would normally produce from a select.
interface AddMessageRow {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  attachments: FridayAttachment[] | null;
  pageContext: FridayPageContext | null;
  creditsUsed: number | null;
  createdAt: Date | string;
}

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
  creditsUsed: number | null = null,
) {
  // Single-statement CTE so the message INSERT and the conversation
  // lastMessageAt/updatedAt UPDATE are atomic — either both happen or
  // neither does. This is one DB round trip (faster than two sequential
  // queries) AND avoids the failure mode where the timestamp bump could
  // succeed without a corresponding message row.
  const attachmentsJson = attachments ? JSON.stringify(attachments) : null;
  const pageContextJson = pageContext ? JSON.stringify(pageContext) : null;
  const result = await db.execute(sql`
    WITH inserted AS (
      INSERT INTO friday_messages (conversation_id, role, content, attachments, page_context, credits_used)
      VALUES (
        ${conversationId},
        ${role},
        ${content},
        ${attachmentsJson}::jsonb,
        ${pageContextJson}::jsonb,
        ${creditsUsed}
      )
      RETURNING id, conversation_id, role, content, attachments, page_context, credits_used, created_at
    ), updated AS (
      UPDATE friday_conversations
      SET last_message_at = NOW(), updated_at = NOW()
      WHERE id = ${conversationId} AND EXISTS (SELECT 1 FROM inserted)
      RETURNING id
    )
    SELECT
      inserted.id,
      inserted.conversation_id      AS "conversationId",
      inserted.role,
      inserted.content,
      inserted.attachments,
      inserted.page_context         AS "pageContext",
      inserted.credits_used         AS "creditsUsed",
      inserted.created_at           AS "createdAt"
    FROM inserted
  `);
  // Drizzle's neon-http and pg drivers both expose rows on `.rows`; on
  // older variants the result IS the row array. Narrow against an
  // explicit row interface so the caller gets a typed value, not any.
  // The CTE's RETURNING ... AS "camelCase" guarantees the row shape.
  const raw: unknown = result;
  const rows: AddMessageRow[] = Array.isArray(raw)
    ? (raw as unknown as AddMessageRow[])
    : ((raw as { rows?: unknown[] }).rows as AddMessageRow[] | undefined) ?? [];
  return rows[0];
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
