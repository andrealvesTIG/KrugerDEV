import crypto from "crypto";
import { db } from "../db";
import { fridayGuestConversations, type FridayGuestConversation } from "@shared/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

export type GuestMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

// Hard cap on transcript size kept in the DB row. Two questions × two
// roles is the steady-state payload; we leave a tiny bit of headroom for
// concurrent writes but never let a guest balloon a row by spamming.
const MAX_TRANSCRIPT_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 8000;

// SHA-256 of the visitor IP. Matches `crypto.randomUUID`-style anonymity:
// we can correlate sessions across requests for abuse triage but never
// recover the original IP.
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function getGuestConversation(
  guestSessionId: string,
): Promise<FridayGuestConversation | null> {
  const [row] = await db
    .select()
    .from(fridayGuestConversations)
    .where(eq(fridayGuestConversations.guestSessionId, guestSessionId))
    .limit(1);
  return row ?? null;
}

// Idempotent upsert keyed by session id. Returns the row in its
// pre-write state (count BEFORE increment) so the caller can decide
// whether the request is allowed or should trip the login wall.
export async function ensureGuestConversation(params: {
  guestSessionId: string;
  ipHash: string | null;
  userAgent: string | null;
}): Promise<FridayGuestConversation> {
  const existing = await getGuestConversation(params.guestSessionId);
  if (existing) return existing;
  const [row] = await db
    .insert(fridayGuestConversations)
    .values({
      guestSessionId: params.guestSessionId,
      ipHash: params.ipHash,
      userAgent: params.userAgent?.slice(0, 500) ?? null,
      questionCount: 0,
      messages: [],
    })
    .onConflictDoNothing({ target: fridayGuestConversations.guestSessionId })
    .returning();
  // Race: another request inserted between our SELECT and our INSERT.
  return row ?? (await getGuestConversation(params.guestSessionId))!;
}

// Atomically reserve one question against the per-session cap BEFORE
// the LLM call runs. Uses a conditional UPDATE so two concurrent
// requests racing to ask their 2nd-and-3rd question can't both pass
// the check and slip past the cap — exactly one will see the row come
// back, the other gets `null` and must be 402'd by the caller.
//
// Returns the freshly-incremented row when the reservation succeeded,
// or null when the row was missing, already adopted, or already at the
// cap.
export async function reserveGuestQuestionSlot(params: {
  guestSessionId: string;
  questionLimit: number;
}): Promise<FridayGuestConversation | null> {
  const [row] = await db
    .update(fridayGuestConversations)
    .set({
      questionCount: sql`${fridayGuestConversations.questionCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fridayGuestConversations.guestSessionId, params.guestSessionId),
        isNull(fridayGuestConversations.adoptedAt),
        sql`${fridayGuestConversations.questionCount} < ${params.questionLimit}`,
      ),
    )
    .returning();
  return row ?? null;
}

// Roll back a reservation when the model call hard-fails before any
// tokens are streamed to the user. Best-effort — we never decrement
// below zero, and we leave the row alone if it was adopted in between.
export async function refundGuestQuestionSlot(guestSessionId: string): Promise<void> {
  await db
    .update(fridayGuestConversations)
    .set({
      questionCount: sql`GREATEST(${fridayGuestConversations.questionCount} - 1, 0)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fridayGuestConversations.guestSessionId, guestSessionId),
        isNull(fridayGuestConversations.adoptedAt),
      ),
    );
}

// Append a (user, assistant) pair to the transcript. Question counter
// has ALREADY been bumped by `reserveGuestQuestionSlot` before the LLM
// call — this only persists the produced text. Capped per-row so a
// guest can't grow a single jsonb document unboundedly.
export async function appendGuestExchange(
  guestSessionId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  const userMsg: GuestMessage = {
    role: "user",
    content: userContent.slice(0, MAX_MESSAGE_LENGTH),
    createdAt: new Date().toISOString(),
  };
  const assistantMsg: GuestMessage = {
    role: "assistant",
    content: assistantContent.slice(0, MAX_MESSAGE_LENGTH),
    createdAt: new Date().toISOString(),
  };
  await db
    .update(fridayGuestConversations)
    .set({
      messages: sql`(
        CASE
          WHEN jsonb_array_length(${fridayGuestConversations.messages}) >= ${MAX_TRANSCRIPT_MESSAGES}
          THEN ${fridayGuestConversations.messages}
          ELSE ${fridayGuestConversations.messages} || ${JSON.stringify([userMsg, assistantMsg])}::jsonb
        END
      )`,
      updatedAt: new Date(),
    })
    .where(eq(fridayGuestConversations.guestSessionId, guestSessionId));
}

// Stash the 3rd unsent question so the post-signin handoff can replay
// it as the user's first authenticated message.
export async function setGuestPendingQuestion(
  guestSessionId: string,
  pendingQuestion: string | null,
): Promise<void> {
  await db
    .update(fridayGuestConversations)
    .set({
      pendingQuestion: pendingQuestion ? pendingQuestion.slice(0, MAX_MESSAGE_LENGTH) : null,
      updatedAt: new Date(),
    })
    .where(eq(fridayGuestConversations.guestSessionId, guestSessionId));
}

// Sum of questions issued by this IP across all sessions in the last
// 24h. Used as a defense-in-depth cap so a visitor who clears their
// localStorage can't endlessly mint fresh `guestSessionId`s and keep
// asking. Returns 0 when the IP can't be hashed (shouldn't happen in
// practice, but we never want to fail-closed on a missing header).
export async function getGuestQuestionCountByIp(
  ipHash: string | null,
  windowMinutes = 24 * 60,
): Promise<number> {
  if (!ipHash) return 0;
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${fridayGuestConversations.questionCount}), 0)::int`,
    })
    .from(fridayGuestConversations)
    .where(
      and(
        eq(fridayGuestConversations.ipHash, ipHash),
        gt(
          fridayGuestConversations.createdAt,
          sql`now() - (${windowMinutes} || ' minutes')::interval`,
        ),
      ),
    );
  return Number(row?.total ?? 0);
}

// Atomically claim a guest session for adoption by the given user. Uses
// `WHERE adopted_at IS NULL` so two concurrent adoption requests can't
// both win — only the first conditional UPDATE returns a row, and the
// loser sees an empty result and must reconcile by re-reading.
//
// Returns:
//   - the row (with the new adoptedAt set) when the caller won the race
//   - null when the row was already claimed by someone else (or didn't
//     exist). The route distinguishes the two by re-reading the row.
export async function claimGuestForAdoption(params: {
  guestSessionId: string;
  userId: string;
}): Promise<FridayGuestConversation | null> {
  const now = new Date();
  const [row] = await db
    .update(fridayGuestConversations)
    .set({
      adoptedAt: now,
      adoptedByUserId: params.userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(fridayGuestConversations.guestSessionId, params.guestSessionId),
        isNull(fridayGuestConversations.adoptedAt),
      ),
    )
    .returning();
  return row ?? null;
}

// Second half of the two-phase adoption: now that the conversation row
// exists, link it to the claimed guest session. Separate from
// `claimGuestForAdoption` so a crash between the two is recoverable —
// the guest row stays "claimed but unlinked" and a retry by the same
// user can re-link it.
export async function linkGuestAdoptedConversation(params: {
  guestSessionId: string;
  userId: string;
  conversationId: number;
}): Promise<void> {
  await db
    .update(fridayGuestConversations)
    .set({
      adoptedConversationId: params.conversationId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fridayGuestConversations.guestSessionId, params.guestSessionId),
        eq(fridayGuestConversations.adoptedByUserId, params.userId),
      ),
    );
}
