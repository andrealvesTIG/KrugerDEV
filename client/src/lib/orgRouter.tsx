// Wouter integration that automatically threads `?org=<slug>` through every
// internal navigation — both `<Link>` clicks and programmatic `setLocation`
// calls — without having to touch every call site individually.
//
// How it works:
// - `currentOrgSlugRef` is a module-level ref kept in sync by
//   `OrganizationProvider` whenever the active org changes. We use a ref (not
//   React state) because `hrefs` is a synchronous formatter that runs deep
//   inside wouter without any context.
// - `useOrgAwareLocation` wraps wouter's default browser hook so every
//   programmatic navigate(...) call automatically appends `?org=<slug>` to
//   the target path (preserving any other query params and the hash).
// - `formatOrgHref` is wired to the `<Router hrefs>` prop so the visible
//   `href` attribute on `<Link>` anchors carries the param too. That keeps
//   middle-click / cmd-click / "copy link address" behaviour consistent with
//   regular clicks.

import { useBrowserLocation } from "wouter/use-browser-location";
import { withOrg } from "./orgUrl";

let currentOrgSlug: string | null = null;

/** Called by OrganizationProvider whenever the active org changes. */
export function setCurrentOrgSlug(slug: string | null): void {
  currentOrgSlug = slug && slug.trim() ? slug.trim() : null;
}

export function getCurrentOrgSlug(): string | null {
  return currentOrgSlug;
}

// Custom location hook for wouter's <Router hook={...}> prop. Returns the
// same [path, navigate] tuple as the default browser hook, but `navigate` is
// wrapped so every target path automatically gains `?org=<slug>` when an org
// is active.
export const useOrgAwareLocation = (options?: { ssrPath?: string }) => {
  const [path, navigate] = useBrowserLocation(options);
  const wrappedNavigate: typeof navigate = (to, navOpts) => {
    if (!currentOrgSlug) {
      return navigate(to, navOpts);
    }
    const target = typeof to === "string" ? to : to.toString();
    const next = withOrg(target, currentOrgSlug);
    return navigate(next, navOpts);
  };
  return [path, wrappedNavigate] as ReturnType<typeof useBrowserLocation>;
};

// Hrefs formatter for <Router hrefs={...}>. Wouter calls this to build the
// visible href on every <Link>, so middle/cmd-click and "copy link address"
// pick up `?org=`.
export function formatOrgHref(href: string): string {
  if (!currentOrgSlug) return href;
  return withOrg(href, currentOrgSlug);
}
