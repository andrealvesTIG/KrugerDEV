import { db } from "../db";
import { eq } from "drizzle-orm";
import { userEnrichment, type UserEnrichment, type InsertUserEnrichment } from "@shared/schema";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type EnrichmentStatus = 'ok' | 'error' | 'not_configured' | 'pending';

export interface NormalizedProfile {
  source: string;
  status: EnrichmentStatus;
  errorMessage?: string | null;
  linkedinUrl?: string | null;
  headline?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  currentCompanyIndustry?: string | null;
  location?: string | null;
  photoUrl?: string | null;
  recentPositions?: Array<{ title?: string; company?: string; startDate?: string; endDate?: string }>;
  rawPayload?: unknown;
}

export interface EnrichmentInput {
  linkedinUrl?: string | null;
  email?: string | null;
  detectedCompany?: string | null;
  jobTitle?: string | null;
  fullName?: string | null;
}

export interface LinkedInProvider {
  readonly name: string;
  isConfigured(): boolean;
  enrich(input: EnrichmentInput): Promise<NormalizedProfile>;
}

// --- Provider: Proxycurl (default paid provider) ---
class ProxycurlProvider implements LinkedInProvider {
  readonly name = 'proxycurl';
  isConfigured(): boolean {
    return !!process.env.LINKEDIN_ENRICHMENT_API_KEY;
  }
  async enrich(input: EnrichmentInput): Promise<NormalizedProfile> {
    const apiKey = process.env.LINKEDIN_ENRICHMENT_API_KEY;
    if (!apiKey) {
      return { source: this.name, status: 'not_configured', errorMessage: 'LINKEDIN_ENRICHMENT_API_KEY not set' };
    }
    if (!input.linkedinUrl) {
      return { source: this.name, status: 'error', errorMessage: 'LinkedIn URL required for Proxycurl lookup' };
    }
    try {
      const url = new URL('https://nubela.co/proxycurl/api/v2/linkedin');
      url.searchParams.set('url', input.linkedinUrl);
      url.searchParams.set('use_cache', 'if-present');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return { source: this.name, status: 'error', errorMessage: `Proxycurl ${res.status}: ${txt.slice(0, 300)}` };
      }
      const raw = await res.json() as Record<string, unknown>;
      const exp = Array.isArray(raw.experiences) ? raw.experiences as Array<Record<string, unknown>> : [];
      const current = exp[0] || {};
      const positions = exp.slice(0, 5).map(p => ({
        title: (p.title as string | undefined) || undefined,
        company: (p.company as string | undefined) || undefined,
        startDate: formatYM(p.starts_at),
        endDate: formatYM(p.ends_at),
      }));
      const city = (raw.city as string | undefined) || '';
      const region = (raw.state as string | undefined) || '';
      const country = (raw.country_full_name as string | undefined) || '';
      const location = [city, region, country].filter(Boolean).join(', ') || null;
      return {
        source: this.name,
        status: 'ok',
        linkedinUrl: input.linkedinUrl,
        headline: (raw.headline as string | undefined) || null,
        currentRole: (current.title as string | undefined) || null,
        currentCompany: (current.company as string | undefined) || null,
        currentCompanyIndustry: (raw.industry as string | undefined) || null,
        location,
        photoUrl: (raw.profile_pic_url as string | undefined) || null,
        recentPositions: positions,
        rawPayload: raw,
      };
    } catch (err) {
      return { source: this.name, status: 'error', errorMessage: err instanceof Error ? err.message : String(err) };
    }
  }
}

function formatYM(d: unknown): string | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const o = d as { year?: number; month?: number };
  if (!o.year) return undefined;
  return `${o.year}-${String(o.month || 1).padStart(2, '0')}`;
}

// LinkedIn enrichment must be sourced from a real LinkedIn data provider.
// When none is configured, we return a `not_configured` status so the UI can
// show explicit guidance instead of silently substituting AI-inferred data.
class NotConfiguredProvider implements LinkedInProvider {
  readonly name = 'none';
  isConfigured(): boolean { return false; }
  async enrich(_input: EnrichmentInput): Promise<NormalizedProfile> {
    return {
      source: this.name,
      status: 'not_configured',
      errorMessage: 'No LinkedIn data provider is configured. Set LINKEDIN_ENRICHMENT_API_KEY (Proxycurl) to enable.',
    };
  }
}

function selectProvider(): LinkedInProvider {
  const proxycurl = new ProxycurlProvider();
  if (proxycurl.isConfigured()) return proxycurl;
  return new NotConfiguredProvider();
}

export function isLinkedInUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(?:^|\.)linkedin\.com$/i.test(u.hostname);
  } catch { return false; }
}

export function normalizeLinkedInUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/(?:^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/+$/, '');
  } catch { return null; }
}

export async function getCachedEnrichment(userId: string): Promise<UserEnrichment | null> {
  const [row] = await db.select().from(userEnrichment).where(eq(userEnrichment.userId, userId));
  return row || null;
}

export function isCacheFresh(row: UserEnrichment | null): boolean {
  if (!row || !row.fetchedAt) return false;
  if (row.status !== 'ok') return false;
  const age = Date.now() - new Date(row.fetchedAt as unknown as string).getTime();
  return age < CACHE_TTL_MS;
}

export async function enrichUser(opts: {
  userId: string;
  input: EnrichmentInput;
  force?: boolean;
}): Promise<UserEnrichment> {
  const cached = await getCachedEnrichment(opts.userId);
  if (!opts.force && isCacheFresh(cached)) return cached!;

  const provider = selectProvider();
  const profile = await provider.enrich(opts.input);

  const values: InsertUserEnrichment = {
    userId: opts.userId,
    source: profile.source,
    status: profile.status,
    errorMessage: profile.errorMessage ?? null,
    linkedinUrl: profile.linkedinUrl ?? opts.input.linkedinUrl ?? null,
    headline: profile.headline ?? null,
    currentRole: profile.currentRole ?? null,
    currentCompany: profile.currentCompany ?? null,
    currentCompanyIndustry: profile.currentCompanyIndustry ?? null,
    location: profile.location ?? null,
    photoUrl: profile.photoUrl ?? null,
    recentPositions: (profile.recentPositions ?? []) as unknown as InsertUserEnrichment['recentPositions'],
    rawPayload: (profile.rawPayload ?? null) as unknown as InsertUserEnrichment['rawPayload'],
    fetchedAt: new Date(),
    updatedAt: new Date(),
  };

  if (cached) {
    await db.update(userEnrichment).set(values).where(eq(userEnrichment.userId, opts.userId));
  } else {
    await db.insert(userEnrichment).values(values);
  }
  const [row] = await db.select().from(userEnrichment).where(eq(userEnrichment.userId, opts.userId));
  return row!;
}

export async function setManualLinkedInUrl(userId: string, url: string | null): Promise<UserEnrichment | null> {
  const cached = await getCachedEnrichment(userId);
  if (cached) {
    await db.update(userEnrichment)
      .set({ linkedinUrl: url, updatedAt: new Date() })
      .where(eq(userEnrichment.userId, userId));
  } else if (url) {
    await db.insert(userEnrichment).values({
      userId, source: 'manual', status: 'pending', linkedinUrl: url,
      fetchedAt: new Date(), updatedAt: new Date(),
    });
  }
  return await getCachedEnrichment(userId);
}
