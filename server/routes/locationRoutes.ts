import type { Express } from "express";
import { storage } from "../storage";
import { apiRoute, qStr, pathId, body, r200, authRes, e400 } from "../route-registry";
import { userHasOrgAccess } from "./helpers";

let lastNominatimCall = 0;
const NOMINATIM_MIN_INTERVAL_MS = 1100;

async function rateLimit() {
  const now = Date.now();
  const wait = NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimCall = Date.now();
}

type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
};

const GEOCODE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GEOCODE_CACHE_MAX_ENTRIES = 1000;
const geocodeCache = new Map<string, { value: GeocodeResult; expiresAt: number }>();

function normalizeAddress(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCachedGeocode(key: string): GeocodeResult | null {
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    geocodeCache.delete(key);
    return null;
  }
  geocodeCache.delete(key);
  geocodeCache.set(key, entry);
  return entry.value;
}

function setCachedGeocode(key: string, value: GeocodeResult) {
  if (geocodeCache.has(key)) geocodeCache.delete(key);
  geocodeCache.set(key, { value, expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS });
  while (geocodeCache.size > GEOCODE_CACHE_MAX_ENTRIES) {
    const oldestKey = geocodeCache.keys().next().value;
    if (oldestKey === undefined) break;
    geocodeCache.delete(oldestKey);
  }
}

function getUserIdFromRequest(req: any): string | null {
  return req.session?.userId || req.user?.claims?.sub || req.user?.id || null;
}

export function registerLocationRoutes(app: Express) {
  apiRoute(app, 'get', '/api/geocode/suggest', {
    tag: 'Geocoding',
    summary: 'Get up to 5 address suggestions for a query (Nominatim)',
    parameters: [qStr('q', true, 'Partial address')],
    responses: {
      ...r200('Suggestions', {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                displayName: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                addressLine1: { type: 'string' },
                city: { type: 'string' },
                region: { type: 'string' },
                country: { type: 'string' },
                postalCode: { type: 'string' },
              },
            },
          },
        },
      }),
      ...authRes,
      ...e400,
    },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });
      const q = String(req.query.q || '').trim();
      if (q.length < 3) return res.json({ results: [] });
      if (q.length > 200) return res.status(400).json({ message: 'Query too long' });

      await rateLimit();
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'FridayReport.AI/1.0 (project location autocomplete)',
          'Accept': 'application/json',
        },
      });
      if (!resp.ok) return res.status(502).json({ message: `Suggest failed (${resp.status})` });
      const data = await resp.json() as Array<any>;
      const results = (Array.isArray(data) ? data : []).map((r) => {
        const a = r.address || {};
        const houseNumber = a.house_number || '';
        const road = a.road || a.pedestrian || a.footway || a.path || '';
        const addressLine1 = [houseNumber, road].filter(Boolean).join(' ').trim();
        return {
          displayName: r.display_name || '',
          latitude: parseFloat(r.lat),
          longitude: parseFloat(r.lon),
          addressLine1,
          city: a.city || a.town || a.village || a.hamlet || a.suburb || '',
          region: a.state || a.region || a.state_district || '',
          country: a.country || '',
          postalCode: a.postcode || '',
        };
      });
      res.json({ results });
    } catch (err: any) {
      console.error('[geocode/suggest] Error:', err?.message || err);
      res.status(500).json({ message: 'Suggest failed' });
    }
  });

  apiRoute(app, 'get', '/api/geocode', {
    tag: 'Geocoding',
    summary: 'Geocode an address to lat/lng using OpenStreetMap Nominatim',
    parameters: [qStr('q', true, 'Free-form address to geocode')],
    responses: {
      ...r200('Geocoding result', {
        type: 'object',
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          displayName: { type: 'string' },
        },
      }),
      ...authRes,
      ...e400,
    },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const q = String(req.query.q || '').trim();
      if (!q) return res.status(400).json({ message: 'Query is required' });
      if (q.length > 300) return res.status(400).json({ message: 'Query too long' });

      const cacheKey = normalizeAddress(q);
      const cached = getCachedGeocode(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const callNominatim = async (query: string) => {
        await rateLimit();
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'FridayReport.AI/1.0 (project location geocoder)',
            'Accept': 'application/json',
          },
        });
        if (!resp.ok) throw new Error(`Geocoder returned ${resp.status}`);
        const data = await resp.json() as Array<{ lat: string; lon: string; display_name: string }>;
        return Array.isArray(data) && data.length > 0 ? data[0] : null;
      };

      // Build progressively simpler fallback queries. Nominatim often fails on
      // apartment/unit numbers and extraneous tokens, so we try the original
      // first, then strip them, then drop street-level details entirely.
      const candidates: string[] = [];
      const seen = new Set<string>();
      const push = (s: string) => {
        const trimmed = s.replace(/^[\s,]+|[\s,]+$/g, '').replace(/,\s*,/g, ',').trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          candidates.push(trimmed);
        }
      };
      push(q);
      // Strip "Unit/Suite/Apt/# ..." and stray bare numbers between commas (e.g., ", 303,")
      const stripped = q
        .replace(/\b(?:apt|apartment|suite|ste|unit|#)\.?\s*[\w-]+/gi, '')
        .replace(/,\s*\d+\s*,/g, ', ');
      push(stripped);
      // Drop the first comma-separated segment (likely the street address with unit)
      const parts = q.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) push(parts.slice(1).join(', '));
      // Last-ditch: city/region/country only (last up to 3 segments)
      if (parts.length > 2) push(parts.slice(-3).join(', '));

      let top: { lat: string; lon: string; display_name: string } | null = null;
      let lastErr: unknown = null;
      for (const query of candidates) {
        try {
          top = await callNominatim(query);
          if (top) break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!top) {
        if (lastErr) return res.status(502).json({ message: String((lastErr as Error).message || 'Geocoder error') });
        return res.status(404).json({ message: 'No results found for that address' });
      }

      const result: GeocodeResult = {
        latitude: parseFloat(top.lat),
        longitude: parseFloat(top.lon),
        displayName: top.display_name,
      };
      setCachedGeocode(cacheKey, result);
      res.json(result);
    } catch (err: any) {
      console.error('[geocode] Error:', err?.message || err);
      res.status(500).json({ message: 'Geocoding failed' });
    }
  });

  apiRoute(app, 'post', '/api/projects/:id/images/upload-url', {
    tag: 'Projects',
    summary: 'Get a presigned URL for uploading a project image',
    parameters: [pathId()],
    responses: {
      ...r200('Upload URL generated', {
        type: 'object',
        properties: {
          uploadURL: { type: 'string' },
          objectPath: { type: 'string' },
        },
      }),
      ...authRes,
    },
  }, async (req, res) => {
    try {
      const userId = getUserIdFromRequest(req);
      if (!userId) return res.status(401).json({ message: 'Authentication required' });

      const rawId = String(req.params.id);
      if (rawId !== 'new' && rawId !== '0') {
        const projectId = Number(rawId);
        if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid project id' });
        const project = await storage.getProject(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });
        if (!project.organizationId || !(await userHasOrgAccess(userId, project.organizationId))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
      } else {
        const userOrgs = await storage.getUserOrganizations(userId);
        if (!userOrgs || userOrgs.length === 0) {
          return res.status(403).json({ message: 'Forbidden' });
        }
      }

      const contentType = String((req.body && req.body.contentType) || '').toLowerCase();
      const ALLOWED_IMAGE_TYPES = new Set([
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/gif',
      ]);
      if (contentType && !ALLOWED_IMAGE_TYPES.has(contentType)) {
        return res.status(400).json({ message: 'Unsupported image type. Allowed: PNG, JPEG, WebP, GIF.' });
      }

      const { ObjectStorageService } = await import('../replit_integrations/object_storage/objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (err: any) {
      console.error('[project-image-upload-url] Error:', err?.message || err);
      res.status(500).json({ message: 'Failed to generate upload URL' });
    }
  });
}
