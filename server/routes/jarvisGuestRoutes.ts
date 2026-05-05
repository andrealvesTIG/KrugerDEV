import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../db";
import { fridayConversations, organizationMembers, organizations, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { getUserIdFromRequest } from "./helpers";
import { ensureUserOrganization } from "../services/onboarding";
import {
  appendGuestExchange,
  claimGuestForAdoption,
  ensureGuestConversation,
  getGuestConversation,
  getGuestQuestionCountByIp,
  hashIp,
  linkGuestAdoptedConversation,
  refundGuestQuestionSlot,
  reserveGuestQuestionSlot,
  setGuestPendingQuestion,
  type GuestMessage,
} from "../storage/fridayGuestConversationStorage";
import { addMessage as fcAddMessage, createConversation as fcCreate } from "../storage/fridayConversationStorage";
import { streamGuestFridayResponse } from "../services/guestFridayService";

// Hard limits matched to the public route's contract. The 2-question cap
// is the product rule — everything else is a safety belt so abuse can't
// turn the public endpoint into a free chatbot host.
const GUEST_QUESTION_LIMIT = 2;
const MAX_GUEST_HISTORY = 10;
const MAX_GUEST_MESSAGE_LEN = 4000;
const GUEST_SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Defense-in-depth cap applied per source IP across all guest sessions
// in a 24-hour window. A legit visitor on a single browser is bounded
// by GUEST_QUESTION_LIMIT (=2). The IP cap (=8) leaves room for a few
// people sharing a NAT'd egress while making it pointless to clear
// localStorage and mint fresh `guestSessionId`s to keep going.
const GUEST_IP_QUESTION_LIMIT = 8;
const GUEST_IP_WINDOW_MINUTES = 24 * 60;

// Per-IP throttle for chat. Rate limit is intentionally tight because
// each request triggers an LLM call. The session-based 2-question cap
// is enforced separately and DB-backed; this is just abuse defense.
const guestChatIpRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: "rate_limited", message: "Too many requests — give Friday a moment, then try again." },
});

// Per-guestSessionId throttle on top of the per-IP one. Stops a single
// session from hammering the LLM endpoint even from rotating IPs (and
// makes accidental double-submits cheap to ignore). Keyed off the body
// rather than the request IP so two visitors behind the same NAT don't
// stomp on each other's allowance.
const guestChatSessionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 4,
  standardHeaders: false,
  legacyHeaders: false,
  message: { code: "rate_limited", message: "Too many messages from this session — please slow down." },
  keyGenerator: (req) => {
    const id = (req.body && typeof (req.body as { guestSessionId?: unknown }).guestSessionId === "string")
      ? (req.body as { guestSessionId: string }).guestSessionId
      : null;
    // Fall back to IP when the body hasn't been parsed yet so the
    // limiter still has something to key on.
    return id && GUEST_SESSION_RE.test(id) ? `gs:${id}` : `ip:${req.ip ?? "unknown"}`;
  },
});

// Adoption is a one-shot operation per session and gated by auth too,
// but we still rate-limit it so a logged-in account can't spam the
// adoption write path against random session ids.
const guestAdoptRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: "rate_limited", message: "Too many adoption attempts. Please try again shortly." },
});

const chatBodySchema = z.object({
  guestSessionId: z.string().regex(GUEST_SESSION_RE, "Invalid guest session id"),
  // Full client-side transcript so the streamed reply has context. The
  // server still uses its own DB-backed counter for the cap, but the
  // model needs the prior turns to keep the conversation coherent.
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(MAX_GUEST_MESSAGE_LEN),
      }),
    )
    .min(1)
    .max(MAX_GUEST_HISTORY),
});

const adoptBodySchema = z.object({
  guestSessionId: z.string().regex(GUEST_SESSION_RE, "Invalid guest session id"),
});

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!;
  return req.ip ?? null;
}

function userAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua : null;
}

// Express's Response inherits flushHeaders() from http.ServerResponse,
// and the optional `flush()` method is added at runtime by the
// `compression` middleware. Both are typed as optional here so we can
// invoke them safely without an `as any` cast that would defeat the
// rest of the type checking on the response object.
type FlushableResponse = Response & {
  flush?: () => void;
  flushHeaders?: () => void;
};

// SSE helper — keep responses chunked to the client even when the
// reverse proxy wants to buffer.
function openSse(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as FlushableResponse).flushHeaders?.();
}

function sseSend(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  (res as FlushableResponse).flush?.();
}

export function registerJarvisGuestRoutes(app: Express): void {
  // ---------------------------------------------------------------- chat
  // POST /api/jarvis/guest/chat
  // Public, no auth. Streams an SSE response. Enforces the 2-question
  // cap server-side based on the durable counter — the client copy is
  // advisory only.
  app.post(
    "/api/jarvis/guest/chat",
    guestChatIpRateLimit,
    guestChatSessionRateLimit,
    async (req, res) => {
    let parsed;
    try {
      parsed = chatBodySchema.safeParse(req.body);
    } catch {
      return res.status(400).json({ code: "bad_request", message: "Invalid request body." });
    }
    if (!parsed.success) {
      return res
        .status(400)
        .json({ code: "bad_request", message: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const { guestSessionId, messages } = parsed.data;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return res.status(400).json({ code: "bad_request", message: "Missing user message." });
    }

    const ipHash = hashIp(clientIp(req));

    let row;
    try {
      row = await ensureGuestConversation({
        guestSessionId,
        ipHash,
        userAgent: userAgent(req),
      });
    } catch (err) {
      console.error("[friday-guest] ensureGuestConversation failed:", (err as Error).message);
      return res.status(500).json({ code: "internal", message: "Couldn't start a guest session." });
    }

    if (row.adoptedAt) {
      // Guest sessions are single-use: once adopted by a real user
      // account, the public endpoint must stop serving them so an
      // attacker who steals the session id can't keep using the cap.
      return res.status(410).json({ code: "session_adopted", message: "This guest session has been transferred to an account." });
    }

    // Per-IP question cap, checked BEFORE the atomic reservation so we
    // can issue a friendly 429 without consuming a slot. Skipped when
    // we couldn't compute an ipHash (proxy issues, local-dev request
    // without X-Forwarded-For, etc.) so we never fail-closed on a
    // missing header.
    if (ipHash) {
      try {
        const ipTotal = await getGuestQuestionCountByIp(ipHash, GUEST_IP_WINDOW_MINUTES);
        if (ipTotal >= GUEST_IP_QUESTION_LIMIT) {
          setGuestPendingQuestion(guestSessionId, lastUser.content).catch(() => {
            // best effort — ignore
          });
          return res.status(429).json({
            code: "ip_question_cap",
            message: "Too many free questions from this network. Please sign in or try again later.",
          });
        }
      } catch (err) {
        // Read failure is non-fatal — log and proceed; the per-session
        // cap is still enforced and the LLM call is still rate-limited.
        console.error("[friday-guest] getGuestQuestionCountByIp failed:", (err as Error).message);
      }
    }

    // Atomic reservation: this is the source of truth for the
    // 2-question cap. A conditional UPDATE bumps question_count only
    // when it is still < limit AND the row hasn't been adopted, so two
    // concurrent requests racing on the same session can't both pass.
    // The loser sees `null` and gets the same 402 a sequential 3rd
    // request would have seen.
    let reserved;
    try {
      reserved = await reserveGuestQuestionSlot({
        guestSessionId,
        questionLimit: GUEST_QUESTION_LIMIT,
      });
    } catch (err) {
      console.error("[friday-guest] reserveGuestQuestionSlot failed:", (err as Error).message);
      return res.status(500).json({ code: "internal", message: "Couldn't reserve a question slot." });
    }
    if (!reserved) {
      // Either at the cap, or the session was adopted between our read
      // and the reserve. Surface the cap message either way — a 410
      // would be the only way to distinguish, and the client treats
      // both as "go sign in" so it doesn't matter.
      setGuestPendingQuestion(guestSessionId, lastUser.content).catch((err) => {
        console.error("[friday-guest] setGuestPendingQuestion failed:", (err as Error).message);
      });
      return res.status(402).json({
        code: "login_required",
        message: "You've used your 2 free questions. Sign in or sign up to keep chatting with Friday.",
        questionsUsed: GUEST_QUESTION_LIMIT,
        questionLimit: GUEST_QUESTION_LIMIT,
      });
    }

    openSse(res);
    sseSend(res, {
      guestSessionId,
      questionsUsed: reserved.questionCount,
      questionLimit: GUEST_QUESTION_LIMIT,
    });

    let assistantText = "";
    let modelHardFailed = false;
    await streamGuestFridayResponse({
      history: messages,
      onToken: (token) => {
        assistantText += token;
        sseSend(res, { content: token });
      },
      onDone: async () => {
        const remaining = Math.max(0, GUEST_QUESTION_LIMIT - reserved.questionCount);
        sseSend(res, {
          done: true,
          questionsUsed: reserved.questionCount,
          questionLimit: GUEST_QUESTION_LIMIT,
          questionsRemaining: remaining,
        });
        res.end();
        try {
          await appendGuestExchange(guestSessionId, lastUser.content, assistantText);
        } catch (err) {
          console.error("[friday-guest] appendGuestExchange failed:", (err as Error).message);
        }
      },
      onError: (err) => {
        // Hard failure with no tokens delivered — refund the reserved
        // slot so the user isn't penalized for our outage. If we've
        // already streamed partial output, keep the slot consumed:
        // they got value out of it and refunding could let them ask
        // the same question twice and exhaust the cap on retries.
        modelHardFailed = assistantText.length === 0;
        if (!res.headersSent) {
          res.status(502).json({ code: "model_error", message: err.message });
          return;
        }
        sseSend(res, { error: err.message });
        res.end();
      },
    });
    if (modelHardFailed) {
      try {
        await refundGuestQuestionSlot(guestSessionId);
      } catch (err) {
        console.error("[friday-guest] refundGuestQuestionSlot failed:", (err as Error).message);
      }
    }
  });

  // ------------------------------------------------------------ adoption
  // POST /api/jarvis/guest/adopt
  // Authenticated. Migrates the guest transcript into a real Friday
  // conversation owned by the current user (and their primary org —
  // creating one if needed via the standard onboarding helper).
  // Idempotent and concurrency-safe: a conditional UPDATE on
  // adopted_at IS NULL ensures only one caller wins the claim, even
  // when two requests race; losers reconcile by re-reading the row.
  app.post("/api/jarvis/guest/adopt", guestAdoptRateLimit, async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ code: "unauthenticated", message: "Sign in to continue your conversation." });
    }
    const parsed = adoptBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ code: "bad_request", message: parsed.error.issues.map((i) => i.message).join(", ") });
    }
    const { guestSessionId } = parsed.data;

    const guest = await getGuestConversation(guestSessionId);
    if (!guest) {
      // Unknown session id — treat as a no-op so the post-signin path
      // never blows up if the cookie expired or never existed.
      return res.json({ adopted: false, conversationId: null, organizationId: null, pendingQuestion: null });
    }

    // ----- Concurrency-safe adoption claim -----
    // We use a conditional UPDATE so two simultaneous requests can't
    // both pass the "is this adopted yet?" check and both go on to
    // create a conversation. Exactly one will win the claim; the other
    // sees `claimed === null` and reconciles by re-reading the row.
    let claimed = guest.adoptedAt
      ? null
      : await claimGuestForAdoption({ guestSessionId, userId });

    // Already-adopted (either by a previous request from this same user
    // or by a concurrent request that beat us). Re-fetch and figure out
    // who the rightful owner is.
    if (!claimed) {
      const fresh = await getGuestConversation(guestSessionId);
      if (!fresh || !fresh.adoptedByUserId) {
        return res.status(500).json({ code: "internal", message: "Couldn't claim your guest session." });
      }
      // Another user owns this session — refuse silently. The current
      // user just shouldn't have access to that transcript.
      if (fresh.adoptedByUserId !== userId) {
        return res.status(409).json({ code: "session_claimed", message: "This guest session was already adopted." });
      }
      // Owned by us — return the previously-linked conversation.
      if (fresh.adoptedConversationId) {
        const [conv] = await db
          .select({ id: fridayConversations.id, organizationId: fridayConversations.organizationId })
          .from(fridayConversations)
          .where(and(eq(fridayConversations.id, fresh.adoptedConversationId), eq(fridayConversations.userId, userId)))
          .limit(1);
        if (conv) {
          return res.json({
            adopted: true,
            conversationId: conv.id,
            organizationId: conv.organizationId,
            pendingQuestion: fresh.pendingQuestion ?? null,
          });
        }
      }
      // We claimed it earlier but never linked a conversation (crash
      // between phases). Fall through and create one now using the
      // re-read row as the source of truth for the transcript.
      claimed = fresh;
    }

    // From here on, `claimed` is the row we own. Resolve the user's
    // organization. Most signed-in users will already belong to one
    // (created during signup); brand-new accounts get a workspace via
    // the same helper used by the email-auth flow.
    const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return res.status(401).json({ code: "unauthenticated", message: "User not found." });
    }
    let organizationId: number | null = null;
    try {
      const ensured = await ensureUserOrganization(userId, user.email ?? `${userId}@unknown.local`);
      organizationId = ensured.organization?.id ?? null;
    } catch (err) {
      console.error("[friday-guest] ensureUserOrganization failed:", (err as Error).message);
    }
    // Fallback: if ensureUserOrganization couldn't land an org for any
    // reason, fall back to the user's first membership row directly.
    if (!organizationId) {
      const [member] = await db
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, userId))
        .limit(1);
      organizationId = member?.organizationId ?? null;
    }
    if (!organizationId) {
      return res.status(409).json({ code: "no_organization", message: "We couldn't find an organization for your account." });
    }
    // Sanity-check the org actually exists before we write into it.
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!org) {
      return res.status(409).json({ code: "no_organization", message: "Your organization could not be loaded." });
    }

    // Build a friendly conversation title from the first user prompt.
    const transcript: GuestMessage[] = Array.isArray(claimed.messages) ? claimed.messages : [];
    const firstUser = transcript.find((m) => m.role === "user");
    const title = firstUser?.content ? firstUser.content.slice(0, 60).trim() : "Continued from public preview";

    let conversationId: number;
    try {
      const conv = await fcCreate(organizationId, userId, title || "Continued from public preview");
      conversationId = conv.id;
    } catch (err) {
      console.error("[friday-guest] fcCreate failed:", (err as Error).message);
      return res.status(500).json({ code: "internal", message: "Couldn't open your saved conversation." });
    }

    // Replay the transcript into friday_messages preserving order. Wrap
    // each insert so a single bad row can't strand the whole adoption.
    for (const msg of transcript) {
      try {
        await fcAddMessage(conversationId, msg.role, msg.content, null, null, null);
      } catch (err) {
        console.error("[friday-guest] fcAddMessage failed for one row:", (err as Error).message);
      }
    }

    try {
      await linkGuestAdoptedConversation({ guestSessionId, userId, conversationId });
    } catch (err) {
      // Non-fatal: the user already has the migrated conversation.
      // Worst-case the guest row stays "claimed but unlinked" and a
      // retry by the same user will re-link it from the branch above.
      console.error("[friday-guest] linkGuestAdoptedConversation failed:", (err as Error).message);
    }

    return res.json({
      adopted: true,
      conversationId,
      organizationId,
      pendingQuestion: claimed.pendingQuestion ?? null,
    });
  });

  // ------------------------------------------------------------ helper
  // Optional: ping endpoint the client can hit to mint a new session id
  // on first visit when localStorage is unavailable. Not strictly
  // required (the client generates one too), but having it avoids a
  // round-trip to the chat endpoint just to discover the cap counter.
  app.get("/api/jarvis/guest/session", (req, res) => {
    const idParam = typeof req.query.id === "string" ? req.query.id : null;
    const id = idParam && GUEST_SESSION_RE.test(idParam) ? idParam : crypto.randomUUID().replace(/-/g, "");
    res.json({ guestSessionId: id, questionLimit: GUEST_QUESTION_LIMIT });
  });
}
