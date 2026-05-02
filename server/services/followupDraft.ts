import OpenAI from "openai";
import { db } from "../db";
import { sql, eq, desc } from "drizzle-orm";
import { userFollowupDrafts, type UserFollowupDraft } from "@shared/schema";
import type { UserEnrichment } from "@shared/schema";
import { withAiCredits } from "./aiCredits";

export type DraftTone = 'friendly' | 'formal' | 'brief';

export interface DraftContext {
  user: {
    id: string;
    fullName: string | null;
    firstName?: string | null;
    email: string | null;
    detectedCompany?: string | null;
    detectedIndustry?: string | null;
    jobTitle?: string | null;
    createdAt?: string | Date | null;
  };
  enrichment?: UserEnrichment | null;
  acquisition?: {
    referrerHost?: string | null;
    utmSource?: string | null;
    utmCampaign?: string | null;
    landingPath?: string | null;
    country?: string | null;
  } | null;
  summary?: {
    salesTemperature?: string;
    daysActiveLast7?: number;
    projectsCount?: number;
    tasksCount?: number;
    issuesCount?: number;
    risksCount?: number;
    eventCount?: number;
    actionCount?: number;
    integrationsCount?: number;
    aiEventCount?: number;
    lastSeenAt?: string | null;
    onboardingCompleted?: boolean;
    planName?: string | null;
  };
  topActions?: Array<{ action: string; count: number }>;
  topPages?: Array<{ path: string; count: number }>;
  recentTimeline?: Array<{ kind: string; path?: string | null; element?: string | null; label?: string | null; occurredAt: string }>;
}

const TONE_INSTRUCTIONS: Record<DraftTone, string> = {
  friendly: 'Warm, conversational, first-name basis, short sentences. Sound like a helpful peer, not a vendor.',
  formal:   'Polished and professional. Use the recipient\'s full title where natural. No emojis or slang.',
  brief:    'Maximum 90 words. Skip pleasantries. One short paragraph plus the meeting ask.',
};

export interface DraftOutput {
  subject: string;
  body: string;
}

export async function generateFollowupDraft(opts: {
  context: DraftContext;
  tone: DraftTone;
  adminUserId: string;
}): Promise<DraftOutput> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    // Deterministic non-AI fallback so the feature still works without keys.
    return fallbackDraft(opts.context, opts.tone);
  }
  const client = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

  const compact = compactContext(opts.context);
  const sys = `You are a sales development rep for FridayReport.AI, a project portfolio management product. Your one and only objective is to land a follow-up meeting with the recipient. Output JSON {"subject": string, "body": string}. The body must:
- Open with a personal hook tied to 2-3 specific things the person actually did in the product (use the data provided, do not invent activity).
- Reference one relevant signal from their LinkedIn / role / company / industry if available.
- End with a clear meeting ask and TWO suggested time-slot phrasings (e.g. "Tue 10am or Thu 3pm your time"). Times must be relative ("next Tuesday morning") not specific dates.
- Use the chosen tone strictly: ${TONE_INSTRUCTIONS[opts.tone]}
- Sign with the sender's first name placeholder "[Your name]" — do not invent a name.
- Never invent product features, pricing, or facts not present in the context. If a field is missing, omit gracefully.
- Subject line must be under 70 chars and reference something concrete.`;

  const completion = await withAiCredits(
    { userId: opts.adminUserId, orgId: null, action: "followup_draft" },
    () => client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify(compact) },
      ],
    }),
  );
  const text = completion.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(text) as { subject?: string; body?: string };
    const subject = (parsed.subject || '').slice(0, 200) || `Quick follow-up — FridayReport.AI`;
    const body = (parsed.body || '').slice(0, 6000) || fallbackDraft(opts.context, opts.tone).body;
    return { subject, body };
  } catch {
    return fallbackDraft(opts.context, opts.tone);
  }
}

function compactContext(ctx: DraftContext): Record<string, unknown> {
  const e = ctx.enrichment;
  return {
    recipient: {
      name: ctx.user.fullName,
      firstName: ctx.user.firstName || (ctx.user.fullName?.split(' ')[0] ?? null),
      email: ctx.user.email,
      jobTitle: ctx.user.jobTitle,
      detectedCompany: ctx.user.detectedCompany,
      detectedIndustry: ctx.user.detectedIndustry,
      signedUp: ctx.user.createdAt,
    },
    linkedin: e ? {
      status: e.status,
      headline: e.headline,
      currentRole: e.currentRole,
      currentCompany: e.currentCompany,
      industry: e.currentCompanyIndustry,
      location: e.location,
      profileUrl: e.linkedinUrl,
      recentPositions: e.recentPositions ?? [],
    } : null,
    acquisition: ctx.acquisition || null,
    engagement: ctx.summary || null,
    topActions: (ctx.topActions || []).slice(0, 8),
    topPages: (ctx.topPages || []).slice(0, 8),
    recentTimeline: (ctx.recentTimeline || []).slice(0, 25),
    objective: 'Book a follow-up meeting. End with two relative time-slot options and a single clear CTA.',
  };
}

function fallbackDraft(ctx: DraftContext, tone: DraftTone): DraftOutput {
  const first = ctx.user.firstName || ctx.user.fullName?.split(' ')[0] || 'there';
  const company = ctx.enrichment?.currentCompany || ctx.user.detectedCompany || 'your team';
  const projects = ctx.summary?.projectsCount ?? 0;
  const tasks = ctx.summary?.tasksCount ?? 0;
  const greet = tone === 'formal' ? `Dear ${first},` : `Hi ${first},`;
  const activity = projects || tasks
    ? `I noticed you've already spun up ${projects} project${projects === 1 ? '' : 's'} and added ${tasks} task${tasks === 1 ? '' : 's'} in FridayReport.AI`
    : `I noticed you've been exploring FridayReport.AI`;
  const ctx2 = ctx.enrichment?.headline ? ` — given your work as ${ctx.enrichment.headline}` : '';
  const ask = tone === 'brief'
    ? `Worth a 20-minute walk-through? Tue morning or Thu afternoon (your time) — either work?`
    : `Would a 20-minute walk-through of what fits ${company}'s setup be useful? I can do early next week — Tuesday morning or Thursday afternoon (your time). Reply with whichever works and I'll send an invite.`;
  const body = `${greet}\n\n${activity}${ctx2}. Happy to share how other PMOs are using it for similar work.\n\n${ask}\n\n— [Your name]`;
  return { subject: `Quick follow-up on your FridayReport.AI trial`, body };
}

// --- Persistence helpers ---

export async function saveDraft(opts: {
  userId: string;
  authorId: string | null;
  authorName?: string | null;
  tone: DraftTone;
  subject: string | null;
  content: string;
  status: 'draft' | 'edited' | 'sent' | 'copied';
  meta?: Record<string, unknown> | null;
}): Promise<UserFollowupDraft> {
  const [row] = await db.insert(userFollowupDrafts).values({
    userId: opts.userId,
    authorId: opts.authorId,
    authorName: opts.authorName ?? null,
    tone: opts.tone,
    subject: opts.subject,
    content: opts.content,
    status: opts.status,
    meta: (opts.meta ?? null) as unknown as UserFollowupDraft['meta'],
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row;
}

export async function listDrafts(userId: string, limit = 20): Promise<UserFollowupDraft[]> {
  return await db
    .select()
    .from(userFollowupDrafts)
    .where(eq(userFollowupDrafts.userId, userId))
    .orderBy(desc(userFollowupDrafts.createdAt))
    .limit(limit);
}

export async function updateDraftStatus(id: number, status: 'draft' | 'edited' | 'sent' | 'copied'): Promise<void> {
  await db.update(userFollowupDrafts)
    .set({ status, updatedAt: new Date() })
    .where(eq(userFollowupDrafts.id, id));
}

export async function updateDraftContent(id: number, opts: {
  userId: string;
  subject?: string | null;
  content?: string;
  status?: 'draft' | 'edited' | 'sent' | 'copied';
}): Promise<UserFollowupDraft | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (opts.subject !== undefined) patch.subject = opts.subject;
  if (opts.content !== undefined) patch.content = opts.content;
  if (opts.status !== undefined) patch.status = opts.status;
  const [row] = await db.update(userFollowupDrafts)
    .set(patch)
    .where(sql`${userFollowupDrafts.id} = ${id} AND ${userFollowupDrafts.userId} = ${opts.userId}`)
    .returning();
  return row || null;
}

// --- Per-admin daily quota for enrichment + generation ---
const QUOTA_PER_DAY = Number(process.env.SALES_AI_DAILY_QUOTA || 100);

export interface QuotaReservation {
  ok: boolean;
  used: number;
  limit: number;
  reservationId?: number;
}

export async function checkAndIncrementQuota(adminId: string, kind: 'enrichment' | 'draft'): Promise<QuotaReservation> {
  // Atomic check-and-reserve using user_activity_logs as both audit record
  // AND counting source. The count and reservation insert run in the same
  // transaction so concurrent requests cannot both observe `used < limit`
  // and overshoot the cap. The reservation row IS the audit row — callers
  // enrich it via logSalesAdminAction(reservationId, ...).
  const action = 'sales.' + kind;
  return await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT COUNT(*)::int as count FROM user_activity_logs
      WHERE user_id = ${adminId}
        AND action = ${action}
        AND created_at >= NOW() - INTERVAL '1 day'
    `);
    const used = Number((result.rows[0] as { count?: number })?.count || 0);
    if (used >= QUOTA_PER_DAY) {
      return { ok: false, used, limit: QUOTA_PER_DAY };
    }
    const inserted = await tx.execute(sql`
      INSERT INTO user_activity_logs (user_id, action, entity_type, entity_id, metadata)
      VALUES (${adminId}, ${action}, 'quota', ${adminId}, '{}'::jsonb)
      RETURNING id
    `);
    const reservationId = Number((inserted.rows[0] as { id?: number })?.id || 0);
    return { ok: true, used, limit: QUOTA_PER_DAY, reservationId };
  }, { isolationLevel: 'serializable' });
}

export async function logSalesAdminAction(opts: {
  adminId: string;
  kind: 'enrichment' | 'draft';
  targetUserId: string;
  reservationId?: number;
  meta?: Record<string, unknown>;
  ip?: string | null;
  ua?: string | null;
}): Promise<void> {
  // Prefer to enrich the reservation row created during the quota check so
  // each user-visible action corresponds to exactly one audit row.
  if (opts.reservationId) {
    await db.execute(sql`
      UPDATE user_activity_logs
      SET entity_type = 'user',
          entity_id = ${opts.targetUserId},
          metadata = ${JSON.stringify(opts.meta || {})}::jsonb,
          ip_address = ${opts.ip || null},
          user_agent = ${opts.ua || null}
      WHERE id = ${opts.reservationId}
    `);
    return;
  }
  // Fallback path (no reservation): record a fresh audit row.
  await db.execute(sql`
    INSERT INTO user_activity_logs (user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
    VALUES (
      ${opts.adminId},
      ${'sales.' + opts.kind},
      ${'user'},
      ${opts.targetUserId},
      ${JSON.stringify(opts.meta || {})}::jsonb,
      ${opts.ip || null},
      ${opts.ua || null}
    )
  `);
}
