import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  users, userAcquisition, userPageEvents, userEnrichment,
} from "@shared/schema";
import { getUserIdFromRequest, hasAdminAccess } from "./helpers";
import { computeSalesTemperature } from "../services/sales-temperature";
import { extractClientIp } from "../services/acquisition";
import {
  enrichUser, getCachedEnrichment, normalizeLinkedInUrl, setManualLinkedInUrl,
} from "../services/linkedinEnrichment";
import {
  generateFollowupDraft, saveDraft, listDrafts, updateDraftContent,
  checkAndIncrementQuota, logSalesAdminAction, type DraftTone,
} from "../services/followupDraft";

interface TrackEventInput {
  eventType?: string;
  path?: string;
  element?: string;
  label?: string;
  metadata?: Record<string, unknown> | null;
  occurredAt?: string;
  anonymousId?: string;
  sessionId?: string;
}

interface InsertablePageEvent {
  userId: string | null;
  anonymousId: string | null;
  sessionId: string | null;
  eventType: string;
  path: string | null;
  element: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export function registerUserInsightsRoutes(app: Express) {
  // In-memory IP rate limiter for /api/track (anonymous abuse protection).
  // Sliding window of 60s, max 60 batches per IP.
  const trackIpHits: Map<string, number[]> = new Map();
  const TRACK_IP_WINDOW_MS = 60_000;
  const TRACK_IP_MAX = 60;
  const checkTrackRate = (ip: string | null): boolean => {
    if (!ip) return true;
    const now = Date.now();
    const hits = (trackIpHits.get(ip) || []).filter(t => now - t < TRACK_IP_WINDOW_MS);
    if (hits.length >= TRACK_IP_MAX) {
      trackIpHits.set(ip, hits);
      return false;
    }
    hits.push(now);
    trackIpHits.set(ip, hits);
    // periodic GC
    if (trackIpHits.size > 5000) {
      for (const [k, v] of trackIpHits.entries()) {
        const live = v.filter(t => now - t < TRACK_IP_WINDOW_MS);
        if (live.length === 0) trackIpHits.delete(k);
        else trackIpHits.set(k, live);
      }
    }
    return true;
  };

  const MAX_METADATA_BYTES = 2048;

  // POST /api/track - frontend event ingestion
  app.post('/api/track', async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromRequest(req);
      const ip = extractClientIp(req);
      if (!checkTrackRate(ip)) {
        return res.status(429).json({ message: 'Too many requests' });
      }

      const body = (req.body ?? {}) as { events?: unknown };
      const events: TrackEventInput[] = Array.isArray(body.events)
        ? (body.events as TrackEventInput[])
        : [];
      if (events.length === 0) return res.json({ accepted: 0 });
      if (events.length > 50) return res.status(400).json({ message: 'Too many events in batch (max 50)' });

      const ua = (req.headers['user-agent'] as string | undefined) || null;
      const now = Date.now();
      const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
      const PAST_TOLERANCE_MS = 7 * 24 * 60 * 60 * 1000;

      const sanitized: InsertablePageEvent[] = events.slice(0, 50).map((e) => {
        const eventType = String(e.eventType || 'page_view');
        if (!['page_view', 'click', 'custom', 'error'].includes(eventType)) return null;

        let occurredAt = new Date();
        if (e.occurredAt) {
          const d = new Date(e.occurredAt);
          if (!isNaN(d.getTime())) {
            const t = d.getTime();
            if (t > now + FUTURE_TOLERANCE_MS || t < now - PAST_TOLERANCE_MS) {
              // Outside acceptable window — clamp to now to prevent timestamp shenanigans
              occurredAt = new Date(now);
            } else {
              occurredAt = d;
            }
          }
        }

        // Validate metadata size
        let metadata: Record<string, unknown> | null = null;
        if (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata)) {
          try {
            const json = JSON.stringify(e.metadata);
            if (json.length <= MAX_METADATA_BYTES) {
              metadata = e.metadata as Record<string, unknown>;
            }
          } catch {
            metadata = null;
          }
        }

        // Reject sentinel / malformed anonymous IDs to prevent cross-user
        // telemetry attribution if the client falls back to a constant string.
        const SENTINEL_IDS = new Set(['unknown', 'null', 'undefined', '0', 'anonymous']);
        const rawAnon = e.anonymousId ? String(e.anonymousId).slice(0, 64).trim() : '';
        const looksLikeId = rawAnon.length >= 8 && /^[A-Za-z0-9_\-:.]+$/.test(rawAnon);
        const anonymousId = (rawAnon && !SENTINEL_IDS.has(rawAnon.toLowerCase()) && looksLikeId)
          ? rawAnon
          : null;

        // Privacy/retention: drop events that have neither a user nor a stable
        // anonymous identifier — they cannot be attributed and would just
        // accumulate as orphan rows.
        if (!userId && !anonymousId) return null;

        return {
          userId: userId || null,
          anonymousId,
          sessionId: e.sessionId ? String(e.sessionId).slice(0, 64) : null,
          eventType,
          path: e.path ? String(e.path).slice(0, 500) : null,
          element: e.element ? String(e.element).slice(0, 200) : null,
          label: e.label ? String(e.label).slice(0, 200) : null,
          metadata,
          occurredAt,
          ipAddress: ip,
          userAgent: ua,
        };
      }).filter((x): x is InsertablePageEvent => x !== null);

      if (sanitized.length === 0) return res.json({ accepted: 0 });

      // Daily cap (200/user/day) - uses server-side created_at column to
      // prevent bypass via client-controlled occurredAt timestamps.
      let dropped = 0;
      let capHit = false;
      const requested = sanitized.length;
      if (userId) {
        const result = await db.execute(
          sql`SELECT COUNT(*)::int as count FROM user_page_events WHERE user_id = ${userId} AND created_at >= NOW() - INTERVAL '1 day'`
        );
        const count = Number((result.rows[0] as { count?: number })?.count || 0);
        const remaining = Math.max(0, 200 - count);
        if (remaining === 0) {
          // Already over cap — write a single overflow summary row (at most one per day per user)
          await maybeWriteOverflowSummary(userId, requested);
          return res.json({ accepted: 0, capped: true });
        }
        if (sanitized.length > remaining) {
          dropped = sanitized.length - remaining;
          sanitized.length = remaining;
          capHit = true;
        }
      } else {
        // Anonymous traffic: never accept more than 20 events per request and
        // rely on the per-IP rate limiter above.
        if (sanitized.length > 20) {
          sanitized.length = 20;
        }
      }

      await db.insert(userPageEvents).values(sanitized);

      if (capHit && userId && dropped > 0) {
        await maybeWriteOverflowSummary(userId, dropped);
      }

      res.json({ accepted: sanitized.length, dropped, capped: capHit });
    } catch (err) {
      console.error('POST /api/track failed:', err);
      res.status(500).json({ message: 'Failed to record events' });
    }
  });

  // Writes at most one cap_overflow summary row per user per day; subsequent
  // overflow batches in the same day update that row's metadata.dropped count.
  async function maybeWriteOverflowSummary(userId: string, dropped: number) {
    try {
      const existing = await db.execute(sql`
        SELECT id, metadata FROM user_page_events
        WHERE user_id = ${userId}
          AND event_type = 'cap_overflow'
          AND created_at >= DATE_TRUNC('day', NOW())
        LIMIT 1
      `);
      const row = existing.rows[0] as { id?: number; metadata?: { dropped?: number } } | undefined;
      if (row?.id) {
        const prev = Number(row.metadata?.dropped || 0);
        await db.execute(sql`
          UPDATE user_page_events
          SET metadata = jsonb_build_object('dropped', ${prev + dropped}, 'updatedAt', ${new Date().toISOString()})
          WHERE id = ${row.id}
        `);
      } else {
        await db.insert(userPageEvents).values([{
          userId,
          anonymousId: null,
          sessionId: null,
          eventType: 'cap_overflow',
          path: null,
          element: null,
          label: null,
          metadata: { dropped },
          occurredAt: new Date(),
          ipAddress: null,
          userAgent: null,
        }]);
      }
    } catch (e) {
      console.error('cap_overflow summary write failed:', e);
    }
  }

  // GET /api/admin/users/recent-signups - list view for the new tab
  app.get('/api/admin/users/recent-signups', async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
      const q = String(req.query.q || '').toLowerCase().trim();
      const tempFilter = String(req.query.temp || '');
      const sourceFilter = String(req.query.source || '');
      const countryFilter = String(req.query.country || '').trim();
      const planFilter = String(req.query.plan || '').trim().toLowerCase();

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const result = await db.execute(sql`
        SELECT
          u.id, u.email, u.first_name, u.last_name, u.detected_company,
          u.detected_industry, u.job_title, u.signup_source, u.created_at,
          u.role, u.email_verified,
          (SELECT p.code FROM subscriptions s
            JOIN plans p ON p.id = s.plan_id
            JOIN organization_members om2 ON om2.organization_id = s.org_id
            WHERE om2.user_id = u.id
            ORDER BY s.id DESC LIMIT 1) as plan,
          a.country, a.city, a.utm_source, a.utm_medium, a.utm_campaign,
          a.referrer_host, a.signup_method,
          (SELECT MAX(occurred_at) FROM user_page_events WHERE user_id = u.id) as last_event_at,
          (SELECT MAX(created_at) FROM user_activity_logs WHERE user_id = u.id) as last_action_at,
          (SELECT COUNT(*)::int FROM user_page_events WHERE user_id = u.id) as event_count,
          (SELECT COUNT(*)::int FROM user_activity_logs WHERE user_id = u.id) as action_count,
          (SELECT COUNT(*)::int FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = u.id AND p.deleted_at IS NULL) as projects_created,
          (SELECT COUNT(*)::int FROM tasks t
            JOIN projects p ON t.project_id = p.id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = u.id AND t.deleted_at IS NULL) as tasks_created,
          (SELECT COUNT(DISTINCT DATE(occurred_at))::int FROM user_page_events
            WHERE user_id = u.id AND occurred_at >= NOW() - INTERVAL '7 days') as days_active_7d
        FROM users u
        LEFT JOIN user_acquisition a ON a.user_id = u.id
        WHERE u.created_at >= ${cutoff}
        ORDER BY u.created_at DESC
        LIMIT 500
      `);

      type SignupRow = {
        id: string; email: string; first_name: string | null; last_name: string | null;
        detected_company: string | null; detected_industry: string | null; job_title: string | null;
        signup_source: string | null; created_at: string; role: string | null; email_verified: boolean;
        plan: string | null; country: string | null; city: string | null;
        utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
        referrer_host: string | null; signup_method: string | null;
        last_event_at: string | null; last_action_at: string | null;
        event_count: number | string | null; action_count: number | string | null;
        projects_created: number | string | null; tasks_created: number | string | null;
        days_active_7d: number | string | null;
      };
      let rows = (result.rows as SignupRow[]).map((r) => {
        const temp = computeSalesTemperature({
          daysActiveLast7: Number(r.days_active_7d ?? 0),
          projectsCreated: Number(r.projects_created ?? 0),
          tasksCreated: Number(r.tasks_created ?? 0),
          totalEvents: Number(r.event_count ?? 0) + Number(r.action_count ?? 0),
        });
        return {
          id: r.id,
          email: r.email,
          firstName: r.first_name,
          lastName: r.last_name,
          fullName: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
          detectedCompany: r.detected_company,
          detectedIndustry: r.detected_industry,
          jobTitle: r.job_title,
          signupSource: r.signup_source,
          signupMethod: r.signup_method,
          createdAt: r.created_at,
          role: r.role,
          emailVerified: r.email_verified,
          country: r.country,
          plan: r.plan || null,
          city: r.city,
          utmSource: r.utm_source,
          utmMedium: r.utm_medium,
          utmCampaign: r.utm_campaign,
          referrerHost: r.referrer_host,
          lastEventAt: r.last_event_at || r.last_action_at || null,
          eventCount: Number(r.event_count ?? 0),
          actionCount: Number(r.action_count ?? 0),
          projectsCreated: Number(r.projects_created ?? 0),
          tasksCreated: Number(r.tasks_created ?? 0),
          daysActive7d: Number(r.days_active_7d ?? 0),
          salesTemperature: temp,
        };
      });

      if (q) {
        rows = rows.filter(r => {
          const hay = `${r.email || ''} ${r.fullName || ''} ${r.detectedCompany || ''} ${r.detectedIndustry || ''} ${r.jobTitle || ''}`.toLowerCase();
          return hay.includes(q);
        });
      }
      if (tempFilter && ['cold', 'warm', 'hot'].includes(tempFilter)) {
        rows = rows.filter(r => r.salesTemperature === tempFilter);
      }
      if (sourceFilter) {
        rows = rows.filter(r => (r.signupSource || r.signupMethod || '').toLowerCase().includes(sourceFilter.toLowerCase()));
      }
      if (countryFilter) {
        const cf = countryFilter.toLowerCase();
        rows = rows.filter(r => (r.country || '').toLowerCase() === cf);
      }
      if (planFilter) {
        rows = rows.filter(r => (r.plan || '').toLowerCase() === planFilter);
      }

      res.json({ users: rows, total: rows.length, days });
    } catch (err) {
      console.error('GET /api/admin/users/recent-signups failed:', err);
      res.status(500).json({ message: 'Failed to fetch recent signups' });
    }
  });

  // GET /api/admin/users/:userId/insights
  app.get('/api/admin/users/:userId/insights', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const [user] = await db.select().from(users).where(eq(users.id, targetId));
      if (!user) return res.status(404).json({ message: 'User not found' });

      const [acq] = await db.select().from(userAcquisition).where(eq(userAcquisition.userId, targetId));
      const [enrichment] = await db.select().from(userEnrichment).where(eq(userEnrichment.userId, targetId));

      // Memberships + orgs
      const memberships = await db.execute(sql`
        SELECT om.organization_id, om.role, o.name as org_name, o.slug as org_slug
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.user_id = ${targetId}
      `);

      // Engagement summary
      const summary = await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM user_page_events WHERE user_id = ${targetId} AND event_type <> 'cap_overflow') as event_count,
          (SELECT COUNT(*)::int FROM user_activity_logs WHERE user_id = ${targetId}) as action_count,
          (SELECT COUNT(DISTINCT session_id)::int FROM user_page_events WHERE user_id = ${targetId} AND session_id IS NOT NULL) as session_count,
          (SELECT COUNT(DISTINCT DATE(occurred_at))::int FROM user_page_events WHERE user_id = ${targetId}) as days_active,
          (SELECT COUNT(DISTINCT DATE(occurred_at))::int FROM user_page_events WHERE user_id = ${targetId} AND occurred_at >= NOW() - INTERVAL '7 days') as days_active_7d,
          (SELECT MAX(occurred_at) FROM user_page_events WHERE user_id = ${targetId}) as last_event_at,
          (SELECT MAX(created_at) FROM user_activity_logs WHERE user_id = ${targetId}) as last_action_at,
          (SELECT COUNT(*)::int FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND p.deleted_at IS NULL) as projects_count,
          (SELECT COUNT(*)::int FROM tasks t
            JOIN projects p ON t.project_id = p.id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND t.deleted_at IS NULL) as tasks_count,
          (SELECT COUNT(*)::int FROM issues i
            JOIN projects p ON i.project_id = p.id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND i.deleted_at IS NULL AND i.item_type = 'risk') as risks_count,
          (SELECT COUNT(*)::int FROM issues i
            JOIN projects p ON i.project_id = p.id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND i.deleted_at IS NULL AND i.item_type = 'issue') as issues_count
      `);
      const s = summary.rows[0] as Record<string, unknown>;
      const num = (k: string) => Number((s[k] as number | string | null | undefined) ?? 0);

      // Sales-actionable signals: AI usage, integrations, billing/plan info if available
      const aiUsageRes = await db.execute(sql`
        SELECT COUNT(*)::int as ai_event_count,
               MAX(created_at) as last_ai_event_at
        FROM feature_usage_logs
        WHERE user_id = ${targetId}
          AND (feature_name ILIKE '%ai%' OR feature_name ILIKE '%agent%' OR feature_name ILIKE '%gpt%')
      `).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
      const aiRow = (aiUsageRes.rows[0] as Record<string, unknown> | undefined) ?? {};

      const integrationsRes = await db.execute(sql`
        SELECT COUNT(DISTINCT oi.integration_type)::int as integrations_count
        FROM organization_integrations oi
        JOIN organization_members om ON om.organization_id = oi.organization_id
        WHERE om.user_id = ${targetId}
      `).catch(() => ({ rows: [{ integrations_count: 0 }] as Array<Record<string, unknown>> }));
      const integrationsCount = Number((integrationsRes.rows[0] as Record<string, unknown> | undefined)?.integrations_count ?? 0);

      const helpTicketsRes = await db.execute(sql`
        SELECT COUNT(*)::int as ticket_count, MAX(created_at) as last_ticket_at
        FROM help_tickets WHERE user_id = ${targetId}
      `).catch(() => ({ rows: [{ ticket_count: 0, last_ticket_at: null }] as Array<Record<string, unknown>> }));
      const helpRow = (helpTicketsRes.rows[0] as Record<string, unknown> | undefined) ?? {};

      const lastSeen = (s.last_event_at as string | null) || (s.last_action_at as string | null) || null;
      const temp = computeSalesTemperature({
        daysActiveLast7: num('days_active_7d'),
        projectsCreated: num('projects_count'),
        tasksCreated: num('tasks_count'),
        totalEvents: num('event_count') + num('action_count'),
      });

      // Top features they touched (by activity action)
      const topActionsRes = await db.execute(sql`
        SELECT action, COUNT(*)::int as count FROM user_activity_logs
        WHERE user_id = ${targetId}
        GROUP BY action ORDER BY count DESC LIMIT 8
      `);

      // Top pages
      const topPagesRes = await db.execute(sql`
        SELECT path, COUNT(*)::int as count FROM user_page_events
        WHERE user_id = ${targetId} AND event_type = 'page_view' AND path IS NOT NULL
        GROUP BY path ORDER BY count DESC LIMIT 8
      `);

      const userRecord = user as Record<string, unknown>;
      const safeUser: Record<string, unknown> = {};
      const SENSITIVE_KEYS = new Set([
        'passwordHash', 'emailVerificationToken', 'emailVerificationExpiry',
        'apiKey', 'magicLinkToken', 'passwordResetToken',
      ]);
      for (const [k, v] of Object.entries(userRecord)) {
        if (!SENSITIVE_KEYS.has(k)) safeUser[k] = v;
      }

      // Surface sales-actionable fields on the user record (best-effort; may be undefined
      // if the column doesn't exist on this deployment).
      const planName = (userRecord.subscriptionPlan as string | undefined)
        ?? (userRecord.planName as string | undefined)
        ?? null;
      const trialEndsAt = (userRecord.trialEndsAt as string | undefined)
        ?? (userRecord.trialExpiresAt as string | undefined)
        ?? null;
      const aiCredits = (userRecord.aiCreditsRemaining as number | undefined)
        ?? (userRecord.credits as number | undefined)
        ?? null;

      res.json({
        user: safeUser,
        acquisition: acq || null,
        enrichment: enrichment || null,
        organizations: memberships.rows,
        summary: {
          eventCount: num('event_count'),
          actionCount: num('action_count'),
          sessionCount: num('session_count'),
          daysActive: num('days_active'),
          daysActiveLast7: num('days_active_7d'),
          lastSeenAt: lastSeen,
          projectsCount: num('projects_count'),
          tasksCount: num('tasks_count'),
          risksCount: num('risks_count'),
          issuesCount: num('issues_count'),
          salesTemperature: temp,
          // Sales-actionable signals
          aiEventCount: Number((aiRow.ai_event_count as number | string | undefined) ?? 0),
          lastAiEventAt: (aiRow.last_ai_event_at as string | null) ?? null,
          integrationsCount,
          helpTicketCount: Number((helpRow.ticket_count as number | string | undefined) ?? 0),
          lastHelpTicketAt: (helpRow.last_ticket_at as string | null) ?? null,
          planName,
          trialEndsAt,
          aiCreditsRemaining: aiCredits,
          onboardingCompleted: Boolean(userRecord.onboardingCompleted),
        },
        topActions: (topActionsRes.rows as Array<Record<string, unknown>>).map(r => ({
          action: String(r.action ?? ''), count: Number(r.count ?? 0),
        })),
        topPages: (topPagesRes.rows as Array<Record<string, unknown>>).map(r => ({
          path: String(r.path ?? ''), count: Number(r.count ?? 0),
        })),
      });
    } catch (err) {
      console.error('GET /api/admin/users/:userId/insights failed:', err);
      res.status(500).json({ message: 'Failed to fetch user insights' });
    }
  });

  // POST /api/admin/users/:userId/send-email — send a one-off sales email from the admin
  app.post('/api/admin/users/:userId/send-email', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      if (!target?.email) return res.status(404).json({ message: 'User has no email on file' });

      const body = (req.body ?? {}) as { subject?: string; message?: string };
      const subject = String(body.subject || '').trim();
      const message = String(body.message || '').trim();
      if (!subject || subject.length > 200) {
        return res.status(400).json({ message: 'Subject is required (max 200 chars)' });
      }
      if (!message || message.length > 8000) {
        return res.status(400).json({ message: 'Message is required (max 8000 chars)' });
      }

      const adminName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim()
        || currentUser?.email
        || 'FridayReport.AI Team';

      const { sendEmailDetailed } = await import("../services/email");
      const text = `${message}\n\n— ${adminName}`;
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#111">`
        + message.replace(/\n/g, '<br/>')
        + `<br/><br/>— ${adminName}</div>`;

      const result = await sendEmailDetailed({
        to: target.email,
        subject,
        text,
        html,
      });

      if (!result.ok) {
        const friendly = result.code === 'daily_quota_exceeded'
          ? 'Daily email sending quota reached. Try again tomorrow or upgrade your Resend plan.'
          : result.code === 'email_not_configured'
            ? result.message
            : `${result.message} (${result.code})`;
        const status = result.status === 429 ? 429 : (result.status === 503 ? 503 : 502);
        return res.status(status).json({ message: friendly, code: result.code });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('POST /api/admin/users/:userId/send-email failed:', err);
      res.status(500).json({ message: 'Failed to send email' });
    }
  });

  // GET /api/admin/users/:userId/timeline
  app.get('/api/admin/users/:userId/timeline', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 200));
      const filterType = String(req.query.type || 'all'); // all | page | action | error

      // Cursor format: "<isoTs>|<source>|<id>" for deterministic keyset pagination
      let cursorTs: Date | null = null;
      let cursorSource: string | null = null;
      let cursorId: string | null = null;
      if (req.query.cursor) {
        const parts = String(req.query.cursor).split('|');
        const d = parts[0] ? new Date(parts[0]) : null;
        if (d && !isNaN(d.getTime())) {
          cursorTs = d;
          cursorSource = parts[1] || null;
          cursorId = parts[2] || null;
        }
      }

      const cursorClause = cursorTs
        ? (cursorSource && cursorId
            ? sql`AND (ts < ${cursorTs.toISOString()}::timestamp
                      OR (ts = ${cursorTs.toISOString()}::timestamp AND source < ${cursorSource})
                      OR (ts = ${cursorTs.toISOString()}::timestamp AND source = ${cursorSource} AND id < ${cursorId}))`
            : sql`AND ts < ${cursorTs.toISOString()}::timestamp`)
        : sql``;

      let typeClause = sql``;
      if (filterType === 'page') typeClause = sql`AND source = 'page'`;
      else if (filterType === 'action') typeClause = sql`AND source = 'action'`;
      else if (filterType === 'error') {
        // Errors come from either side: page events with eventType 'error' or
        // activity logs whose action begins with 'error.'
        typeClause = sql`AND (
          (source = 'page' AND kind = 'error')
          OR (source = 'action' AND kind LIKE 'error.%')
        )`;
      }

      const result = await db.execute(sql`
        SELECT * FROM (
          SELECT
            'page'::text as source,
            id::text as id,
            event_type as kind,
            path,
            element,
            label,
            metadata,
            session_id,
            occurred_at as ts
          FROM user_page_events WHERE user_id = ${targetId} AND event_type <> 'cap_overflow'
          UNION ALL
          SELECT
            'action'::text as source,
            id::text as id,
            action as kind,
            NULL::text as path,
            entity_type as element,
            entity_id::text as label,
            metadata,
            NULL::text as session_id,
            created_at as ts
          FROM user_activity_logs WHERE user_id = ${targetId}
        ) merged
        WHERE ts IS NOT NULL ${cursorClause} ${typeClause}
        ORDER BY ts DESC, source DESC, id DESC
        LIMIT ${limit + 1}
      `);

      type TimelineRow = {
        source: 'page' | 'action';
        id: string;
        kind: string;
        path: string | null;
        element: string | null;
        label: string | null;
        metadata: Record<string, unknown> | null;
        session_id: string | null;
        ts: string;
      };
      const rows = result.rows as TimelineRow[];
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(r => ({
        source: r.source,
        id: r.id,
        kind: r.kind,
        path: r.path,
        element: r.element,
        label: r.label,
        metadata: r.metadata,
        sessionId: r.session_id,
        occurredAt: r.ts,
      }));
      const last = items[items.length - 1];
      const nextCursor = hasMore && last
        ? `${new Date(last.occurredAt).toISOString()}|${last.source}|${last.id}`
        : null;

      res.json({ items, nextCursor, hasMore });
    } catch (err) {
      console.error('GET /api/admin/users/:userId/timeline failed:', err);
      res.status(500).json({ message: 'Failed to fetch timeline' });
    }
  });

  // === LinkedIn Enrichment (Task #25) ===

  // PUT /api/admin/users/:userId/linkedin-url — set/update the LinkedIn URL
  app.put('/api/admin/users/:userId/linkedin-url', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      if (!target) return res.status(404).json({ message: 'User not found' });

      const body = (req.body ?? {}) as { linkedinUrl?: string | null };
      const raw = (body.linkedinUrl ?? '').toString().trim();
      let normalized: string | null = null;
      if (raw) {
        normalized = normalizeLinkedInUrl(raw);
        if (!normalized) {
          return res.status(400).json({ message: 'That doesn\'t look like a valid LinkedIn URL' });
        }
      }
      await db.update(users).set({ linkedinUrl: normalized }).where(eq(users.id, targetId));
      let enrichment = await setManualLinkedInUrl(targetId, normalized);

      // Auto-trigger fresh enrichment when a URL is set/changed (subject to quota).
      let quotaInfo: { used: number; limit: number } | undefined;
      let enrichSkipped: string | undefined;
      if (normalized) {
        const quota = await checkAndIncrementQuota(adminId, 'enrichment');
        if (!quota.ok) {
          enrichSkipped = `Daily enrichment limit reached (${quota.used}/${quota.limit}). URL saved; refresh manually tomorrow.`;
        } else {
          enrichment = await enrichUser({
            userId: targetId,
            force: true,
            input: {
              linkedinUrl: normalized,
              email: target.email || null,
              fullName: [target.firstName, target.lastName].filter(Boolean).join(' ') || null,
              jobTitle: target.jobTitle || null,
              detectedCompany: target.detectedCompany || null,
            },
          });
          await logSalesAdminAction({
            adminId, kind: 'enrichment', targetUserId: targetId,
            reservationId: quota.reservationId,
            meta: { source: enrichment?.source, status: enrichment?.status, trigger: 'linkedin-url-update' },
            ip: extractClientIp(req),
            ua: (req.headers['user-agent'] as string | undefined) || null,
          });
          quotaInfo = { used: quota.used + 1, limit: quota.limit };
        }
      }

      res.json({ ok: true, linkedinUrl: normalized, enrichment, quota: quotaInfo, enrichSkipped });
    } catch (err) {
      console.error('PUT /api/admin/users/:userId/linkedin-url failed:', err);
      res.status(500).json({ message: 'Failed to update LinkedIn URL' });
    }
  });

  // POST /api/admin/users/:userId/enrich — trigger enrichment refresh
  app.post('/api/admin/users/:userId/enrich', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      if (!target) return res.status(404).json({ message: 'User not found' });

      const quota = await checkAndIncrementQuota(adminId, 'enrichment');
      if (!quota.ok) {
        return res.status(429).json({ message: `Daily enrichment limit reached (${quota.used}/${quota.limit}). Try again tomorrow.` });
      }

      const force = req.body?.force === true || String(req.query.force || '') === '1';
      const enrichment = await enrichUser({
        userId: targetId,
        force,
        input: {
          linkedinUrl: target.linkedinUrl || null,
          email: target.email || null,
          fullName: [target.firstName, target.lastName].filter(Boolean).join(' ') || null,
          jobTitle: target.jobTitle || null,
          detectedCompany: target.detectedCompany || null,
        },
      });

      await logSalesAdminAction({
        adminId, kind: 'enrichment', targetUserId: targetId,
        reservationId: quota.reservationId,
        meta: { source: enrichment.source, status: enrichment.status, force },
        ip: extractClientIp(req),
        ua: (req.headers['user-agent'] as string | undefined) || null,
      });

      res.json({ enrichment, quota: { used: quota.used + 1, limit: quota.limit } });
    } catch (err) {
      console.error('POST /api/admin/users/:userId/enrich failed:', err);
      res.status(500).json({ message: 'Failed to enrich user profile' });
    }
  });

  // === Follow-up draft generation (Task #25) ===

  // POST /api/admin/users/:userId/followup-draft — generate a new draft
  app.post('/api/admin/users/:userId/followup-draft', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const [target] = await db.select().from(users).where(eq(users.id, targetId));
      if (!target) return res.status(404).json({ message: 'User not found' });

      const quota = await checkAndIncrementQuota(adminId, 'draft');
      if (!quota.ok) {
        return res.status(429).json({ message: `Daily AI draft limit reached (${quota.used}/${quota.limit}). Try again tomorrow.` });
      }

      const tone = (String(req.body?.tone || 'friendly') as DraftTone);
      if (!['friendly', 'formal', 'brief'].includes(tone)) {
        return res.status(400).json({ message: 'Invalid tone' });
      }

      // Pull all the context we need.
      const [acq] = await db.select().from(userAcquisition).where(eq(userAcquisition.userId, targetId));
      const enrichment = await getCachedEnrichment(targetId);

      const sumRes = await db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM user_page_events WHERE user_id = ${targetId} AND event_type <> 'cap_overflow') as event_count,
          (SELECT COUNT(*)::int FROM user_activity_logs WHERE user_id = ${targetId}) as action_count,
          (SELECT COUNT(DISTINCT DATE(occurred_at))::int FROM user_page_events WHERE user_id = ${targetId} AND occurred_at >= NOW() - INTERVAL '7 days') as days_active_7d,
          (SELECT MAX(occurred_at) FROM user_page_events WHERE user_id = ${targetId}) as last_event_at,
          (SELECT COUNT(*)::int FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND p.deleted_at IS NULL) as projects_count,
          (SELECT COUNT(*)::int FROM tasks t
            JOIN projects p ON t.project_id = p.id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND t.deleted_at IS NULL) as tasks_count,
          (SELECT COUNT(*)::int FROM issues i
            JOIN projects p ON i.project_id = p.id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND i.deleted_at IS NULL AND i.item_type = 'issue') as issues_count,
          (SELECT COUNT(*)::int FROM issues i
            JOIN projects p ON i.project_id = p.id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = ${targetId} AND i.deleted_at IS NULL AND i.item_type = 'risk') as risks_count
      `);
      const sRow = (sumRes.rows[0] as Record<string, unknown>) || {};
      const sn = (k: string) => Number((sRow[k] as number | string | null | undefined) ?? 0);

      const topActionsRes = await db.execute(sql`
        SELECT action, COUNT(*)::int as count FROM user_activity_logs
        WHERE user_id = ${targetId}
        GROUP BY action ORDER BY count DESC LIMIT 8
      `);
      const topPagesRes = await db.execute(sql`
        SELECT path, COUNT(*)::int as count FROM user_page_events
        WHERE user_id = ${targetId} AND event_type = 'page_view' AND path IS NOT NULL
        GROUP BY path ORDER BY count DESC LIMIT 8
      `);
      const recentRes = await db.execute(sql`
        SELECT event_type as kind, path, element, label, occurred_at as ts
        FROM user_page_events
        WHERE user_id = ${targetId} AND event_type <> 'cap_overflow'
        ORDER BY occurred_at DESC LIMIT 25
      `);

      const temp = computeSalesTemperature({
        daysActiveLast7: sn('days_active_7d'),
        projectsCreated: sn('projects_count'),
        tasksCreated: sn('tasks_count'),
        totalEvents: sn('event_count') + sn('action_count'),
      });

      const fullName = [target.firstName, target.lastName].filter(Boolean).join(' ').trim() || null;
      const draft = await generateFollowupDraft({
        tone,
        context: {
          user: {
            id: target.id,
            fullName,
            firstName: target.firstName,
            email: target.email,
            jobTitle: target.jobTitle,
            detectedCompany: target.detectedCompany,
            detectedIndustry: target.detectedIndustry,
            createdAt: target.createdAt as unknown as string,
          },
          enrichment,
          acquisition: acq ? {
            referrerHost: acq.referrerHost,
            utmSource: acq.utmSource,
            utmCampaign: acq.utmCampaign,
            landingPath: acq.landingPath,
            country: acq.country,
          } : null,
          summary: {
            salesTemperature: temp,
            daysActiveLast7: sn('days_active_7d'),
            projectsCount: sn('projects_count'),
            tasksCount: sn('tasks_count'),
            issuesCount: sn('issues_count'),
            risksCount: sn('risks_count'),
            eventCount: sn('event_count'),
            actionCount: sn('action_count'),
            lastSeenAt: (sRow.last_event_at as string | null) || null,
          },
          topActions: (topActionsRes.rows as Array<Record<string, unknown>>).map(r => ({
            action: String(r.action ?? ''), count: Number(r.count ?? 0),
          })),
          topPages: (topPagesRes.rows as Array<Record<string, unknown>>).map(r => ({
            path: String(r.path ?? ''), count: Number(r.count ?? 0),
          })),
          recentTimeline: (recentRes.rows as Array<Record<string, unknown>>).map(r => ({
            kind: String(r.kind ?? ''),
            path: (r.path as string | null) ?? null,
            element: (r.element as string | null) ?? null,
            label: (r.label as string | null) ?? null,
            occurredAt: String(r.ts ?? ''),
          })),
        },
      });

      const adminName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ').trim()
        || currentUser?.email
        || null;

      const saved = await saveDraft({
        userId: targetId,
        authorId: adminId,
        authorName: adminName,
        tone,
        subject: draft.subject,
        content: draft.body,
        status: 'draft',
        meta: { generated: true, model: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? 'gpt-4o-mini' : 'fallback' },
      });

      await logSalesAdminAction({
        adminId, kind: 'draft', targetUserId: targetId,
        reservationId: quota.reservationId,
        meta: { tone, draftId: saved.id },
        ip: extractClientIp(req),
        ua: (req.headers['user-agent'] as string | undefined) || null,
      });

      res.json({ draft: saved, quota: { used: quota.used + 1, limit: quota.limit } });
    } catch (err) {
      console.error('POST /api/admin/users/:userId/followup-draft failed:', err);
      res.status(500).json({ message: 'Failed to generate follow-up draft' });
    }
  });

  // GET /api/admin/users/:userId/followup-drafts — list recent drafts
  app.get('/api/admin/users/:userId/followup-drafts', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const drafts = await listDrafts(targetId, 20);
      res.json({ drafts });
    } catch (err) {
      console.error('GET /api/admin/users/:userId/followup-drafts failed:', err);
      res.status(500).json({ message: 'Failed to fetch drafts' });
    }
  });

  // PATCH /api/admin/users/:userId/followup-drafts/:id — update status and/or content (subject/body edits)
  app.patch('/api/admin/users/:userId/followup-drafts/:id', async (req: Request, res: Response) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const id = Number(req.params.id);
      if (!id || isNaN(id)) return res.status(400).json({ message: 'Invalid draft id' });
      const body = (req.body ?? {}) as { status?: string; subject?: string | null; content?: string };

      const patch: { status?: 'draft' | 'edited' | 'sent' | 'copied'; subject?: string | null; content?: string } = {};
      if (body.status !== undefined) {
        if (!['draft', 'edited', 'sent', 'copied'].includes(String(body.status))) {
          return res.status(400).json({ message: 'Invalid status' });
        }
        patch.status = body.status as 'draft' | 'edited' | 'sent' | 'copied';
      }
      if (body.subject !== undefined) {
        patch.subject = body.subject == null ? null : String(body.subject).slice(0, 500);
      }
      if (body.content !== undefined) {
        const c = String(body.content);
        if (c.length > 20000) return res.status(400).json({ message: 'Draft content too large' });
        patch.content = c;
        // If caller is saving content edits but didn't specify status, mark as edited.
        if (patch.status === undefined) patch.status = 'edited';
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ message: 'Nothing to update' });
      }

      const targetUserId = String(req.params.userId);
      const updated = await updateDraftContent(id, { ...patch, userId: targetUserId });
      if (!updated) return res.status(404).json({ message: 'Draft not found' });
      res.json({ ok: true, draft: updated });
    } catch (err) {
      console.error('PATCH followup-draft status failed:', err);
      res.status(500).json({ message: 'Failed to update draft' });
    }
  });
}
