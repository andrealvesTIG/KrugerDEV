import type { Request } from "express";

export interface FirstTouch {
  referrer?: string | null;
  landingPath?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  anonymousId?: string | null;
  firstSeenAt?: string | null;
}

export function parseFirstTouch(input: unknown): FirstTouch {
  if (!input || typeof input !== 'object') return {};
  const obj = input as Record<string, unknown>;
  const s = (v: unknown): string | null => {
    if (v == null) return null;
    const str = String(v).trim();
    if (!str) return null;
    return str.slice(0, 500);
  };
  return {
    referrer: s(obj.referrer),
    landingPath: s(obj.landingPath),
    utmSource: s(obj.utmSource),
    utmMedium: s(obj.utmMedium),
    utmCampaign: s(obj.utmCampaign),
    utmTerm: s(obj.utmTerm),
    utmContent: s(obj.utmContent),
    gclid: s(obj.gclid),
    anonymousId: s(obj.anonymousId),
    firstSeenAt: s(obj.firstSeenAt),
  };
}

export function referrerHostFromUrl(referrer?: string | null): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function parseUserAgent(ua?: string | null): { browser: string | null; os: string | null; deviceType: string | null } {
  if (!ua) return { browser: null, os: null, deviceType: null };
  const u = ua.toLowerCase();

  let browser: string | null = null;
  if (u.includes('edg/') || u.includes('edge/')) browser = 'Edge';
  else if (u.includes('chrome/') && !u.includes('chromium/')) browser = 'Chrome';
  else if (u.includes('firefox/')) browser = 'Firefox';
  else if (u.includes('safari/') && !u.includes('chrome/')) browser = 'Safari';
  else if (u.includes('opera') || u.includes('opr/')) browser = 'Opera';

  let os: string | null = null;
  if (u.includes('windows nt')) os = 'Windows';
  else if (u.includes('mac os x') || u.includes('macintosh')) os = 'macOS';
  else if (u.includes('android')) os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad') || u.includes('ipod')) os = 'iOS';
  else if (u.includes('linux')) os = 'Linux';

  let deviceType: string | null = 'Desktop';
  if (u.includes('mobile') || u.includes('iphone') || u.includes('android')) deviceType = 'Mobile';
  if (u.includes('ipad') || u.includes('tablet')) deviceType = 'Tablet';
  if (u.includes('bot') || u.includes('crawler') || u.includes('spider')) deviceType = 'Bot';

  return { browser, os, deviceType };
}

export function extractGeoFromHeaders(req: Request): { country: string | null; region: string | null; city: string | null } {
  const h = req.headers as Record<string, string | string[] | undefined>;
  const get = (k: string): string | null => {
    const v = h[k.toLowerCase()];
    if (!v) return null;
    return Array.isArray(v) ? v[0] : v;
  };
  // Cloudflare and common CDN headers
  const country = get('cf-ipcountry') || get('x-vercel-ip-country') || null;
  const region = get('cf-region') || get('x-vercel-ip-country-region') || null;
  const city = get('cf-ipcity') || get('x-vercel-ip-city') || null;
  return { country, region, city };
}

export function extractClientIp(req: Request): string | null {
  const h = req.headers as Record<string, string | string[] | undefined>;
  const xff = h['x-forwarded-for'];
  if (xff) {
    const ip = (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
    if (ip) return ip;
  }
  return req.ip || null;
}

export async function recordAcquisition(opts: {
  userId: string;
  signupMethod: string;
  firstTouch?: FirstTouch | null;
  req: Request;
}) {
  try {
    const { userAcquisition } = await import("@shared/schema");
    const { db } = await import("../db");
    const ft = opts.firstTouch || {};
    const ua = (opts.req.headers['user-agent'] as string | undefined) || null;
    const { browser, os, deviceType } = parseUserAgent(ua);
    const geo = extractGeoFromHeaders(opts.req);
    const ip = extractClientIp(opts.req);
    const referrerHost = referrerHostFromUrl(ft.referrer || null);

    let firstSeenAt: Date | null = null;
    if (ft.firstSeenAt) {
      const d = new Date(ft.firstSeenAt);
      if (!isNaN(d.getTime())) firstSeenAt = d;
    }

    await db.insert(userAcquisition).values({
      userId: opts.userId,
      referrer: ft.referrer || null,
      referrerHost,
      landingPath: ft.landingPath || null,
      utmSource: ft.utmSource || null,
      utmMedium: ft.utmMedium || null,
      utmCampaign: ft.utmCampaign || null,
      utmTerm: ft.utmTerm || null,
      utmContent: ft.utmContent || null,
      gclid: ft.gclid || null,
      ipAddress: ip,
      userAgent: ua,
      country: geo.country,
      region: geo.region,
      city: geo.city,
      deviceType,
      browser,
      os,
      signupMethod: opts.signupMethod,
      anonymousId: ft.anonymousId || null,
      firstSeenAt,
    }).onConflictDoNothing();

    // Backfill anonymous events to this user
    if (ft.anonymousId) {
      const { userPageEvents } = await import("@shared/schema");
      const { eq, and, isNull } = await import("drizzle-orm");
      await db.update(userPageEvents)
        .set({ userId: opts.userId })
        .where(and(eq(userPageEvents.anonymousId, ft.anonymousId), isNull(userPageEvents.userId)));
    }
  } catch (e) {
    // Non-critical
    console.error('recordAcquisition failed:', e);
  }
}
