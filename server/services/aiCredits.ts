/**
 * Single source of truth for metering AI calls against the credits system.
 *
 * Every server-side OpenAI/Anthropic call should go through `withAiCredits`
 * (or the lower-level `enforceAiCredits` + `recordAiCredits` pair when the
 * call is streamed and credits should only be charged after the stream
 * starts producing output).
 *
 * Cost model: 1 RESOURCE_TYPES.AI_RUN per request, regardless of model,
 * tokens, or modality. We rely on the central `resource_credit_costs` table
 * for the actual unit cost.
 */
import type { Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { organizationMembers } from "@shared/schema";
import {
  checkAndEnforceLimit,
  recordCreditUsage,
  METER_CODES,
  RESOURCE_TYPES,
} from "./billing";

export interface AiCreditContext {
  /** End-user that initiated the action. May be null for scheduled jobs — pass `orgId` instead. */
  userId: string | null | undefined;
  /** Organization the action belongs to. Required so we charge the right subscription. */
  orgId?: number | null;
  /**
   * Short, stable identifier for the call site (e.g. "friday_chat",
   * "powerbi_agent", "risk_assessment", "image_generate"). Used for the
   * idempotency key so retries don't double-charge.
   */
  action: string;
  /**
   * Optional secondary id (entity id, conversation id, message id, etc.)
   * to make the requestId more unique across concurrent requests.
   */
  entityId?: string | number | null;
  /**
   * Optional pre-computed requestId. When supplied, this is used verbatim
   * — useful when the caller already has a per-attempt request id and
   * wants to dedupe across retries.
   */
  requestId?: string;
}

/**
 * Per-call credit metering hook for streaming endpoints. The route enforces
 * credits BEFORE each inner stream opens, runs `fn` (which returns the
 * stream object), and returns a `recordSuccess` callback the service must
 * invoke AFTER the stream completes successfully so failed streams aren't billed.
 */
export type MeterPerCall = <T>(
  round: number,
  fn: () => Promise<T>,
) => Promise<{ result: T; recordSuccess: () => Promise<void> }>;

export class AiCreditsLimitError extends Error {
  readonly limitExceeded = true as const;
  readonly resourceType = "ai_runs" as const;
  readonly status = 403 as const;
  constructor(message: string) {
    super(message);
    this.name = "AiCreditsLimitError";
  }
}

/**
 * Resolve a charging userId for scheduled / system jobs that don't have an
 * acting user. We prefer the org owner; if none exists we fall back to any
 * org admin, and finally any member. Returns null if the org has no
 * members at all (caller should warn-and-skip in that case).
 */
export async function resolveSystemUserId(orgId: number): Promise<string | null> {
  if (!orgId || !Number.isFinite(orgId)) return null;
  const members = await db
    .select({ userId: organizationMembers.userId, role: organizationMembers.role })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId));
  if (members.length === 0) return null;
  const owner = members.find((m) => m.role === "owner");
  if (owner) return owner.userId;
  const admin = members.find((m) => m.role === "org_admin" || m.role === "admin");
  if (admin) return admin.userId;
  return members[0].userId;
}

function buildRequestId(ctx: AiCreditContext): string {
  if (ctx.requestId) return ctx.requestId;
  const parts: Array<string | number> = [ctx.action];
  if (ctx.entityId !== undefined && ctx.entityId !== null && ctx.entityId !== "") {
    parts.push(String(ctx.entityId));
  }
  parts.push(Date.now());
  parts.push(Math.random().toString(36).slice(2, 8));
  return parts.join("_");
}

/**
 * Resolve the userId to charge. Falls back to org owner for system jobs.
 * Throws if no chargeable user can be resolved.
 */
async function resolveChargeUserId(ctx: AiCreditContext): Promise<string> {
  if (ctx.userId) return ctx.userId;
  if (ctx.orgId) {
    const sysUser = await resolveSystemUserId(ctx.orgId);
    if (sysUser) return sysUser;
  }
  throw new AiCreditsLimitError(
    "AI credits cannot be charged: no acting user and no organization owner could be resolved.",
  );
}

/**
 * Throw `AiCreditsLimitError` if the user/org is over their AI credit limit.
 * Otherwise resolve and return the userId we'll charge later.
 */
export async function enforceAiCredits(ctx: AiCreditContext): Promise<{ chargeUserId: string }> {
  const chargeUserId = await resolveChargeUserId(ctx);
  const check = await checkAndEnforceLimit(
    chargeUserId,
    METER_CODES.AI_RUNS,
    1,
    ctx.orgId ?? null,
  );
  if (!check.allowed) {
    throw new AiCreditsLimitError(
      check.error || "AI credits limit reached. Please upgrade your plan.",
    );
  }
  return { chargeUserId };
}

/**
 * Record AI usage. Safe to call multiple times with the same `requestId` —
 * the underlying `usage_events` table dedupes on requestId.
 *
 * `chargeUserId` should be the value returned from `enforceAiCredits` so we
 * always charge the same subject we checked.
 */
export async function recordAiCredits(
  chargeUserId: string,
  ctx: AiCreditContext,
): Promise<void> {
  const requestId = buildRequestId(ctx);
  // Pass requestId verbatim so callers that supply a stable `ctx.requestId`
  // get true idempotency across retries (the underlying usage_events table
  // dedupes on requestId).
  await recordCreditUsage(
    chargeUserId,
    RESOURCE_TYPES.AI_RUN,
    requestId,
    ctx.orgId ?? null,
    requestId,
  );
}

/**
 * Wrap a non-streaming AI call: enforce, run, then record. Credits are
 * only charged after the wrapped function resolves successfully.
 *
 * For streaming endpoints, prefer the explicit `enforceAiCredits` /
 * `recordAiCredits` pair so you can record only after the first chunk.
 */
export async function withAiCredits<T>(
  ctx: AiCreditContext,
  fn: () => Promise<T>,
): Promise<T> {
  const { chargeUserId } = await enforceAiCredits(ctx);
  const result = await fn();
  await recordAiCredits(chargeUserId, ctx);
  return result;
}

/**
 * Helper for Express routes. Sends a 403 JSON payload that the frontend
 * already understands (`limitExceeded:true, resourceType:"ai_runs"`).
 * Returns true if the error was handled.
 */
export function sendLimitExceeded(res: Response, err: unknown): boolean {
  if (err instanceof AiCreditsLimitError) {
    if (!res.headersSent) {
      res.status(err.status).json({
        message: err.message,
        limitExceeded: true,
        resourceType: err.resourceType,
      });
    }
    return true;
  }
  return false;
}

/**
 * SSE-friendly variant: writes a `limitExceeded` data event into an
 * already-open SSE stream. Returns true if the error was handled.
 */
export function writeSseLimitExceeded(res: Response, err: unknown): boolean {
  if (err instanceof AiCreditsLimitError) {
    try {
      res.write(
        `data: ${JSON.stringify({
          error: err.message,
          limitExceeded: true,
          resourceType: err.resourceType,
        })}\n\n`,
      );
      res.end();
    } catch {
      // socket already closed — nothing to do
    }
    return true;
  }
  return false;
}

export { METER_CODES, RESOURCE_TYPES };
