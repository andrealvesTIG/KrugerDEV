// Lightweight client-side event queue that POSTs to /api/track.
// Reuses the existing session cookie for auth attribution; works for
// anonymous users by carrying an anonymousId stored in localStorage.

const ANON_KEY = 'fr_anon_id';
const SESSION_KEY = 'fr_session_id';
const SESSION_LAST_KEY = 'fr_session_last_at';
const FIRST_TOUCH_KEY = 'fr_first_touch';
const FIRST_TOUCH_COOKIE = 'fr_first_touch';
const ANALYTICS_CONSENT_KEY = 'fr_analytics_consent'; // 'granted' | 'denied'
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min
const FIRST_TOUCH_COOKIE_DAYS = 30;

type EventType = 'page_view' | 'click' | 'custom';

interface QueuedEvent {
  eventType: EventType;
  path?: string | null;
  element?: string | null;
  label?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
  anonymousId: string;
  sessionId: string;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 30;

interface CryptoWithRandomUUID extends Crypto {
  randomUUID(): string;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as CryptoWithRandomUUID).randomUUID === 'function') {
    return (crypto as CryptoWithRandomUUID).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function setCookie(name: string, value: string, days: number) {
  try {
    const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

// In-memory fallbacks: used only when localStorage / sessionStorage are not
// available (e.g., privacy mode, partitioned cookies). They are unique per
// page-load — never the literal string 'unknown' — so they cannot be used to
// cross-link unrelated visitors. Privacy-by-default: an event with one of
// these IDs lives in memory only for the page lifetime and gets a fresh value
// on the next page load.
let memoryAnonId: string | null = null;
let memorySessionId: string | null = null;
let memorySessionLast = 0;

export function getAnonymousId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    if (!memoryAnonId) memoryAnonId = uuid();
    return memoryAnonId;
  }
}

export function getSessionId(): string {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(SESSION_LAST_KEY) || '0');
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || now - last > SESSION_GAP_MS) {
      id = uuid();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    sessionStorage.setItem(SESSION_LAST_KEY, String(now));
    return id;
  } catch {
    const now = Date.now();
    if (!memorySessionId || now - memorySessionLast > SESSION_GAP_MS) {
      memorySessionId = uuid();
    }
    memorySessionLast = now;
    return memorySessionId;
  }
}

export interface FirstTouchData {
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

function persistFirstTouch(data: FirstTouchData) {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(FIRST_TOUCH_KEY, json);
    // Also persist as a cookie so OAuth redirects (Google/Microsoft) can see it server-side.
    setCookie(FIRST_TOUCH_COOKIE, json, FIRST_TOUCH_COOKIE_DAYS);
  } catch {
    // ignore
  }
}

export function captureFirstTouch(): FirstTouchData {
  try {
    const existing = localStorage.getItem(FIRST_TOUCH_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as FirstTouchData;
      // Always refresh anonymousId in case it was rotated.
      parsed.anonymousId = getAnonymousId();
      // Refresh cookie so it survives a clean cookie wipe / OAuth redirect.
      persistFirstTouch(parsed);
      return parsed;
    }
    const params = new URLSearchParams(window.location.search);
    const data: FirstTouchData = {
      referrer: document.referrer || null,
      landingPath: window.location.pathname + window.location.search,
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      utmTerm: params.get('utm_term'),
      utmContent: params.get('utm_content'),
      gclid: params.get('gclid'),
      anonymousId: getAnonymousId(),
      firstSeenAt: new Date().toISOString(),
    };
    persistFirstTouch(data);
    return data;
  } catch {
    return { anonymousId: getAnonymousId(), firstSeenAt: new Date().toISOString() };
  }
}

export function getFirstTouch(): FirstTouchData {
  try {
    const existing = localStorage.getItem(FIRST_TOUCH_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as FirstTouchData;
      parsed.anonymousId = getAnonymousId();
      return parsed;
    }
  } catch {}
  return captureFirstTouch();
}

// --- Consent gating ----------------------------------------------------------

let analyticsConsentGranted: boolean | null = null;

export function setAnalyticsConsent(granted: boolean) {
  analyticsConsentGranted = granted;
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, granted ? 'granted' : 'denied');
  } catch {
    // ignore
  }
}

export function getAnalyticsConsent(): boolean | null {
  if (analyticsConsentGranted !== null) return analyticsConsentGranted;
  try {
    const v = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    if (v === 'granted') return true;
    if (v === 'denied') return false;
  } catch {
    // ignore
  }
  return null;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    const body = JSON.stringify({ events: batch });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/track', blob);
      if (!ok) await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'include', keepalive: true });
    } else {
      await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'include', keepalive: true });
    }
  } catch {
    // drop batch on failure to avoid retry storms
  }
  if (queue.length > 0) scheduleFlush();
}

export function trackToServer(eventType: EventType, opts: {
  path?: string | null;
  element?: string | null;
  label?: string | null;
  metadata?: Record<string, unknown> | null;
} = {}) {
  try {
    queue.push({
      eventType,
      path: opts.path ?? null,
      element: opts.element ?? null,
      label: opts.label ?? null,
      metadata: opts.metadata ?? null,
      occurredAt: new Date().toISOString(),
      anonymousId: getAnonymousId(),
      sessionId: getSessionId(),
    });
    if (queue.length >= MAX_BATCH) {
      void flush();
    } else {
      scheduleFlush();
    }
  } catch {
    // swallow
  }
}

export function trackPageViewServer(path: string) {
  // Page views are essential telemetry — always allowed.
  trackToServer('page_view', { path });
}

let clickListenerInstalled = false;
let clickHandler: ((ev: Event) => void) | null = null;

function consentAllowsClicks(): boolean {
  // If the user has explicitly granted analytics consent, capture clicks.
  // If consent has not been determined yet, treat as denied (privacy-default).
  return getAnalyticsConsent() === true;
}

export function installGlobalClickTracker() {
  if (clickListenerInstalled || typeof document === 'undefined') return;
  clickListenerInstalled = true;
  clickHandler = (ev: Event) => {
    if (!consentAllowsClicks()) return;
    try {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      // Walk up to find an interactive element with a label
      let el: HTMLElement | null = target;
      let element: string | null = null;
      let label: string | null = null;
      for (let depth = 0; depth < 5 && el; depth++) {
        const testid = el.getAttribute('data-testid');
        const role = el.getAttribute('role');
        const tag = el.tagName.toLowerCase();
        if (testid || tag === 'button' || tag === 'a' || role === 'button' || role === 'menuitem' || role === 'tab') {
          element = testid || `${tag}${role ? `[role=${role}]` : ''}`;
          const txt = (el.innerText || el.textContent || '').trim().slice(0, 80);
          const aria = el.getAttribute('aria-label');
          label = aria || txt || null;
          break;
        }
        el = el.parentElement;
      }
      if (!element) return;
      trackToServer('click', { path: window.location.pathname, element, label });
    } catch {
      // swallow
    }
  };
  document.addEventListener('click', clickHandler, { capture: true, passive: true });

  // Best-effort flush on page hide
  window.addEventListener('pagehide', () => { void flush(); });
  window.addEventListener('beforeunload', () => { void flush(); });
}

export function flushNow() {
  void flush();
}
