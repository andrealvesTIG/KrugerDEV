import type { Request, Response, NextFunction } from "express";

/**
 * CSRF / Origin enforcement for state-changing requests.
 *
 * Cookies are `sameSite: lax`, which still permits a top-level POST/PUT/DELETE
 * navigated from another origin to carry the session. We close that gap by
 * verifying that the request's `Origin` (or, when absent, `Referer`) header
 * resolves to one of the app's configured origins.
 *
 * Allow list is derived from:
 *  - APP_ORIGIN — preferred, can be comma-separated.
 *  - REPLIT_DOMAINS — comma-separated list set by the Replit runtime.
 *  - REPLIT_DEV_DOMAIN — single dev domain.
 *
 * GET/HEAD/OPTIONS requests are always allowed. Same-origin requests (no
 * Origin / Referer set, e.g. server-side health checks) are allowed because
 * a browser-driven cross-origin request always carries one of those headers.
 *
 * API clients with `Bearer` auth bypass this guard — they don't rely on
 * cookies and can't be CSRF'd.
 */
export function buildOriginGuard() {
  const allowed = buildAllowList();
  return function originGuard(req: Request, res: Response, next: NextFunction) {
    const method = (req.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }
    // API clients with a Bearer token aren't cookie-authenticated.
    const authHeader = req.headers["authorization"];
    if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
      return next();
    }
    const origin = (req.headers.origin as string | undefined)
      || (req.headers.referer as string | undefined);
    if (!origin) {
      // No browser-origin header. Cookies still get sent for top-level
      // navigations, but POST/PUT/DELETE from a browser always set Origin
      // (or at minimum Referer for older clients). Treat the absence as
      // suspicious unless it's an explicit server-to-server call (handled
      // above by the Bearer bypass).
      return res.status(403).json({ message: "Missing Origin header" });
    }
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return res.status(403).json({ message: "Invalid Origin header" });
    }
    if (allowed.size === 0) {
      // No allow-list configured (local dev with no env vars set). Fall
      // back to host header match — still blocks classic CSRF because an
      // attacker page can't influence the Host header of the request.
      if (originHost === req.headers.host) return next();
      return res.status(403).json({ message: "Origin not allowed" });
    }
    if (allowed.has(originHost)) return next();
    // Also allow Host-match (covers the typical single-domain deploy).
    if (originHost === req.headers.host) return next();
    return res.status(403).json({ message: "Origin not allowed" });
  };
}

function buildAllowList(): Set<string> {
  const out = new Set<string>();
  const collect = (raw: string | undefined) => {
    if (!raw) return;
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        out.add(new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).host);
      } catch {
        // ignore malformed
      }
    }
  };
  collect(process.env.APP_ORIGIN);
  collect(process.env.REPLIT_DOMAINS);
  collect(process.env.REPLIT_DEV_DOMAIN);
  return out;
}
