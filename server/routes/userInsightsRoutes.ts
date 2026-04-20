import type { Express } from "express";
import { db } from "../db";
import { eq, sql, and, desc, gte, lt, isNull } from "drizzle-orm";
import {
  users, organizations, organizationMembers, projects, tasks,
  userActivityLogs, userAcquisition, userPageEvents,
} from "@shared/schema";
import { getUserIdFromRequest, hasAdminAccess } from "./helpers";
import { computeSalesTemperature, type SalesTemperature } from "../services/sales-temperature";
import {
  parseFirstTouch, parseUserAgent, extractGeoFromHeaders, extractClientIp,
} from "../services/acquisition";

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
  app.post('/api/track', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      const ip = extractClientIp(req);
      if (!checkTrackRate(ip)) {
        return res.status(429).json({ message: 'Too many requests' });
      }

      const body = req.body || {};
      const events = Array.isArray(body.events) ? body.events : [];
      if (events.length === 0) return res.json({ accepted: 0 });
      if (events.length > 50) return res.status(400).json({ message: 'Too many events in batch (max 50)' });

      const ua = (req.headers['user-agent'] as string | undefined) || null;
      const now = Date.now();
      const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
      const PAST_TOLERANCE_MS = 7 * 24 * 60 * 60 * 1000;

      const sanitized = events.slice(0, 50).map((e: any) => {
        const eventType = String(e.eventType || 'page_view');
        if (!['page_view', 'click', 'custom'].includes(eventType)) return null;

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
        let metadata: any = null;
        if (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata)) {
          try {
            const json = JSON.stringify(e.metadata);
            if (json.length <= MAX_METADATA_BYTES) metadata = e.metadata;
          } catch {
            metadata = null;
          }
        }

        return {
          userId: userId || null,
          anonymousId: e.anonymousId ? String(e.anonymousId).slice(0, 64) : null,
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
      }).filter(Boolean) as any[];

      if (sanitized.length === 0) return res.json({ accepted: 0 });

      // Daily cap (200/user/day) - uses server-side created_at column to
      // prevent bypass via client-controlled occurredAt timestamps.
      if (userId) {
        const result = await db.execute(
          sql`SELECT COUNT(*)::int as count FROM user_page_events WHERE user_id = ${userId} AND created_at >= NOW() - INTERVAL '1 day'`
        );
        const count = Number((result.rows[0] as any)?.count || 0);
        const remaining = Math.max(0, 200 - count);
        if (remaining === 0) return res.json({ accepted: 0, capped: true });
        sanitized.length = Math.min(sanitized.length, remaining);
      } else {
        // Anonymous traffic: never accept more than 20 events per request and
        // rely on the per-IP rate limiter above.
        sanitized.length = Math.min(sanitized.length, 20);
      }

      await db.insert(userPageEvents).values(sanitized);
      res.json({ accepted: sanitized.length });
    } catch (err) {
      console.error('POST /api/track failed:', err);
      res.status(500).json({ message: 'Failed to record events' });
    }
  });

  // GET /api/admin/users/recent-signups - list view for the new tab
  app.get('/api/admin/users/recent-signups', async (req: any, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
      const q = String(req.query.q || '').toLowerCase().trim();
      const tempFilter = String(req.query.temp || '');
      const sourceFilter = String(req.query.source || '');

      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const result = await db.execute(sql`
        SELECT
          u.id, u.email, u.first_name, u.last_name, u.detected_company,
          u.detected_industry, u.job_title, u.signup_source, u.created_at,
          u.role, u.email_verified,
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

      let rows = (result.rows as any[]).map((r) => {
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

      res.json({ users: rows, total: rows.length, days });
    } catch (err) {
      console.error('GET /api/admin/users/recent-signups failed:', err);
      res.status(500).json({ message: 'Failed to fetch recent signups' });
    }
  });

  // GET /api/admin/users/:userId/insights
  app.get('/api/admin/users/:userId/insights', async (req: any, res) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const [user] = await db.select().from(users).where(eq(users.id, targetId));
      if (!user) return res.status(404).json({ message: 'User not found' });

      const [acq] = await db.select().from(userAcquisition).where(eq(userAcquisition.userId, targetId));

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
          (SELECT COUNT(*)::int FROM user_page_events WHERE user_id = ${targetId}) as event_count,
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
      const s = summary.rows[0] as Record<string, any>;

      const lastSeen = s.last_event_at || s.last_action_at || null;
      const temp = computeSalesTemperature({
        daysActiveLast7: Number(s.days_active_7d ?? 0),
        projectsCreated: Number(s.projects_count ?? 0),
        tasksCreated: Number(s.tasks_count ?? 0),
        totalEvents: Number(s.event_count ?? 0) + Number(s.action_count ?? 0),
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

      const { passwordHash, emailVerificationToken, emailVerificationExpiry, apiKey, ...safeUser } = user as any;

      res.json({
        user: safeUser,
        acquisition: acq || null,
        organizations: memberships.rows,
        summary: {
          eventCount: Number(s.event_count ?? 0),
          actionCount: Number(s.action_count ?? 0),
          sessionCount: Number(s.session_count ?? 0),
          daysActive: Number(s.days_active ?? 0),
          daysActiveLast7: Number(s.days_active_7d ?? 0),
          lastSeenAt: lastSeen,
          projectsCount: Number(s.projects_count ?? 0),
          tasksCount: Number(s.tasks_count ?? 0),
          risksCount: Number(s.risks_count ?? 0),
          issuesCount: Number(s.issues_count ?? 0),
          salesTemperature: temp,
        },
        topActions: (topActionsRes.rows as any[]).map(r => ({
          action: String(r.action), count: Number(r.count),
        })),
        topPages: (topPagesRes.rows as any[]).map(r => ({
          path: String(r.path), count: Number(r.count),
        })),
      });
    } catch (err) {
      console.error('GET /api/admin/users/:userId/insights failed:', err);
      res.status(500).json({ message: 'Failed to fetch user insights' });
    }
  });

  // GET /api/admin/users/:userId/timeline
  app.get('/api/admin/users/:userId/timeline', async (req: any, res) => {
    try {
      const adminId = getUserIdFromRequest(req);
      if (!adminId) return res.status(401).json({ message: 'Authentication required' });
      const [currentUser] = await db.select().from(users).where(eq(users.id, adminId));
      if (!hasAdminAccess(currentUser)) return res.status(403).json({ message: 'Admin access required' });

      const targetId = String(req.params.userId);
      const limit = Math.max(10, Math.min(500, Number(req.query.limit) || 200));
      const filterType = String(req.query.type || 'all'); // all | page | action

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
          FROM user_page_events WHERE user_id = ${targetId}
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

      const rows = result.rows as any[];
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
}
