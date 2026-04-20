// Lightweight client-side event queue that POSTs to /api/track.
// Reuses the existing session cookie for auth attribution; works for
// anonymous users by carrying an anonymousId stored in localStorage.

const ANON_KEY = 'fr_anon_id';
const SESSION_KEY = 'fr_session_id';
const SESSION_LAST_KEY = 'fr_session_last_at';
const FIRST_TOUCH_KEY = 'fr_first_touch';
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min

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

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getAnonymousId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
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
    return 'unknown';
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

export function captureFirstTouch(): FirstTouchData {
  try {
    const existing = localStorage.getItem(FIRST_TOUCH_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      // Always refresh anonymousId in case it was rotated.
      parsed.anonymousId = getAnonymousId();
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
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(data));
    return data;
  } catch {
    return { anonymousId: getAnonymousId(), firstSeenAt: new Date().toISOString() };
  }
}

export function getFirstTouch(): FirstTouchData {
  try {
    const existing = localStorage.getItem(FIRST_TOUCH_KEY);
    if (existing) {
      const parsed = JSON.parse(existing);
      parsed.anonymousId = getAnonymousId();
      return parsed;
    }
  } catch {}
  return captureFirstTouch();
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
  trackToServer('page_view', { path });
}

let clickListenerInstalled = false;
export function installGlobalClickTracker() {
  if (clickListenerInstalled || typeof document === 'undefined') return;
  clickListenerInstalled = true;
  document.addEventListener('click', (ev) => {
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
  }, { capture: true, passive: true });

  // Best-effort flush on page hide
  window.addEventListener('pagehide', () => { void flush(); });
  window.addEventListener('beforeunload', () => { void flush(); });
}

export function flushNow() {
  void flush();
}
