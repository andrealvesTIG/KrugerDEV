import { describe, it, expect } from "vitest";
import { withOrg, stripOrg } from "../client/src/lib/orgUrl";

// Mirrors how `ShareLinkButton` builds the URL it copies. The component
// composes `pathname + search + hash`, then applies `withOrg(slug)` for the
// primary one-click action or `stripOrg` for the secondary "public link"
// menu item, then prefixes `window.location.origin`.

function buildShareUrl(
  origin: string,
  pathname: string,
  search: string,
  hash: string,
  variant: "with-org" | "public",
  orgSlug: string | null,
): string {
  const suffix = pathname + search + hash;
  const href =
    variant === "with-org" && orgSlug ? withOrg(suffix, orgSlug) : stripOrg(suffix);
  return origin + href;
}

describe("ShareLinkButton URL composition", () => {
  const origin = "https://app.example.com";

  it("primary 'Copy link' adds ?org=<slug> on a project detail page", () => {
    const url = buildShareUrl(
      origin,
      "/projects/123",
      "",
      "",
      "with-org",
      "acme",
    );
    expect(url).toBe("https://app.example.com/projects/123?org=acme");
  });

  it("primary 'Copy link' replaces an existing ?org= with the active org", () => {
    const url = buildShareUrl(
      origin,
      "/portfolios/9",
      "?org=oldorg&tab=summary",
      "#health",
      "with-org",
      "acme",
    );
    expect(url).toBe(
      "https://app.example.com/portfolios/9?org=acme&tab=summary#health",
    );
  });

  it("primary 'Copy link' preserves other query params and hash", () => {
    const url = buildShareUrl(
      origin,
      "/intakes/42",
      "?tab=questions",
      "#section-2",
      "with-org",
      "acme",
    );
    expect(url).toBe(
      "https://app.example.com/intakes/42?tab=questions&org=acme#section-2",
    );
  });

  it("'Copy public link' strips ?org= but keeps other params and hash", () => {
    const url = buildShareUrl(
      origin,
      "/dashboards",
      "?org=acme&view=executive",
      "#kpis",
      "public",
      "acme",
    );
    expect(url).toBe(
      "https://app.example.com/dashboards?view=executive#kpis",
    );
  });

  it("'Copy public link' is a no-op when there was no ?org= to strip", () => {
    const url = buildShareUrl(
      origin,
      "/projects/123",
      "",
      "",
      "public",
      "acme",
    );
    expect(url).toBe("https://app.example.com/projects/123");
  });

  it("canonicalizes a stale ?org= in the URL to the active org's slug", () => {
    // The component prefers `currentOrganization.slug` over whatever
    // happens to be in the address bar, so a stale/invalid `?org=` is
    // overwritten with the resolved active org.
    const url = buildShareUrl(
      origin,
      "/projects/123",
      "?org=stale-or-invalid&tab=tasks",
      "",
      "with-org",
      "acme",
    );
    expect(url).toBe(
      "https://app.example.com/projects/123?org=acme&tab=tasks",
    );
  });

  it("'Copy public link' still works when no org slug is available", () => {
    // The primary button is disabled when there's no slug, but the
    // dropdown's "Copy public link" remains usable and just produces
    // the URL with `?org=` stripped.
    const url = buildShareUrl(
      origin,
      "/projects/123",
      "?foo=bar",
      "",
      "public",
      null,
    );
    expect(url).toBe("https://app.example.com/projects/123?foo=bar");
  });
});
