// Helpers for the `?org=<slug-or-id>` URL parameter that scopes every
// authenticated page to an organization. The client uses these in a single
// place (the OrganizationProvider + a Link/setLocation wrapper) so we never
// have to remember to thread the param manually at every call site.
//
// Design notes:
// - `?org=` accepts either the org slug ("acme") OR the numeric id ("10").
//   Generated links always use the slug (human-readable); the numeric form is
//   accepted for backwards compatibility with anything users type by hand.
// - These helpers operate on the "href" portion (path + search + hash). They
//   never touch protocol/host because wouter's history API works on hrefs.
// - "External" hrefs (anything starting with a scheme or `//`) are passed
//   through unchanged so we don't accidentally rewrite mailto:, tel:, or
//   third-party https:// URLs.

export const ORG_QUERY_PARAM = "org";

// Routes that must NEVER carry `?org=`. These are public marketing pages,
// auth flows, and shared/embed pages where the param is meaningless and would
// confuse the URL.
const PUBLIC_PATH_PREFIXES = [
  "/auth",
  "/signin",
  "/reset-password",
  "/verify-email",
  "/resource-invite",
  "/account-setup",
  "/onboarding",
  "/terms",
  "/privacy",
  "/guide",
  "/friday",
  "/signup",
  "/healthcare",
  "/financial-services",
  "/manufacturing",
  "/industrial-automation",
  "/construction",
  "/capital-projects",
  "/energy",
  "/government",
  "/partners",
  "/uncon2026",
  "/badges/",
  "/media",
  "/media/",
  "/investor-room",
  "/compare/",
  "/embed",
  "/risk-assessment/share/",
  "/project-risk-assessment/share/",
];

function isExternalHref(href: string): boolean {
  // Matches absolute URLs (http://, https://, mailto:, etc.) and
  // protocol-relative (//host/path).
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href);
}

export function isOrgScopedPath(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  // `/badges` and `/media` are exact matches handled above; the prefix list
  // catches their nested variants too.
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (prefix.endsWith("/")) {
      if (path === prefix.slice(0, -1) || path.startsWith(prefix)) return false;
    } else {
      if (path === prefix || path.startsWith(prefix + "/")) return false;
    }
  }
  return true;
}

// Splits an href into [pathname, search, hash] without depending on a base
// URL (the `URL` constructor requires one for relative paths).
function splitHref(href: string): { path: string; search: string; hash: string } {
  let rest = href;
  let hash = "";
  const hashIdx = rest.indexOf("#");
  if (hashIdx >= 0) {
    hash = rest.slice(hashIdx);
    rest = rest.slice(0, hashIdx);
  }
  let search = "";
  const qIdx = rest.indexOf("?");
  if (qIdx >= 0) {
    search = rest.slice(qIdx);
    rest = rest.slice(0, qIdx);
  }
  return { path: rest, search, hash };
}

function joinHref(path: string, search: string, hash: string): string {
  return `${path}${search || ""}${hash || ""}`;
}

// Read the current `?org=` value from the live browser URL. Returns null
// when the param is absent or empty.
export function getOrgFromCurrentUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const v = params.get(ORG_QUERY_PARAM);
  return v && v.trim() ? v.trim() : null;
}

// Read `?org=` from a search string (e.g. "?foo=bar&org=acme").
export function getOrgFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const v = params.get(ORG_QUERY_PARAM);
  return v && v.trim() ? v.trim() : null;
}

// Append (or replace) `?org=<slug>` on an href while preserving any other
// query params and the hash. Pass an empty/null slug to leave the href alone.
export function withOrg(href: string, slug: string | null | undefined): string {
  if (!href) return href;
  if (!slug) return href;
  if (isExternalHref(href)) return href;
  const { path, search, hash } = splitHref(href);
  if (!isOrgScopedPath(path)) return href;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set(ORG_QUERY_PARAM, slug);
  return joinHref(path, `?${params.toString()}`, hash);
}

// Strip `?org=` from an href (used when copying a public/share link).
export function stripOrg(href: string): string {
  if (!href) return href;
  if (isExternalHref(href)) return href;
  const { path, search, hash } = splitHref(href);
  if (!search) return href;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete(ORG_QUERY_PARAM);
  const next = params.toString();
  return joinHref(path, next ? `?${next}` : "", hash);
}

// When switching orgs from the dropdown, an entity id in the path is almost
// always invalid in the new org (e.g. `/projects/123` → 404 in another org).
// Strip the entity-id portion so the user lands on the parent collection
// (`/projects`) instead.
//
// IMPORTANT: we only strip when the segment immediately after a known
// collection prefix LOOKS like an entity id (numeric, uuid, cuid). Static
// sub-routes like `/training/schedule-management` are preserved as-is —
// otherwise we'd silently kick the user off perfectly valid module pages
// just because they switched orgs.
const COLLECTION_PREFIXES_WITH_ENTITY = [
  "/projects",
  "/portfolios",
  "/intakes",
  "/resources",
  "/admin/users",
  "/training",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Cuid (`c...`) and similar opaque short ids: ≥ 16 chars of alphanumerics
// with no separators. Conservative on purpose — short alphanumeric segments
// like "new" or "edit" are NOT treated as ids.
const OPAQUE_ID_RE = /^[A-Za-z0-9_]{16,}$/;

function looksLikeEntityId(segment: string): boolean {
  if (!segment) return false;
  if (/^\d+$/.test(segment)) return true; // numeric id
  if (UUID_RE.test(segment)) return true;
  if (OPAQUE_ID_RE.test(segment)) return true;
  return false;
}

export function stripTrailingEntityId(path: string): string {
  if (!path) return path;
  for (const prefix of COLLECTION_PREFIXES_WITH_ENTITY) {
    // Exact `/projects` or `/projects/` — already at collection root, leave it.
    if (path === prefix || path === prefix + "/") return path;
    if (!path.startsWith(prefix + "/")) continue;
    const remainder = path.slice(prefix.length + 1); // text after the slash
    const firstSeg = remainder.split("/")[0];
    if (looksLikeEntityId(firstSeg)) {
      // Strip the id (and anything below it) so we land on the parent
      // collection. Covers both `/projects/123` and `/projects/123/tasks`.
      return prefix;
    }
    // First segment is a static sub-route (e.g. `/training/schedule-management`)
    // — keep the user where they are.
    return path;
  }
  return path;
}
