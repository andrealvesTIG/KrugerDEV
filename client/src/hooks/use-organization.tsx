import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import type { Organization, OrganizationMember } from "@shared/schema";
import { ORG_QUERY_PARAM, getOrgFromCurrentUrl, withOrg, isOrgScopedPath } from "@/lib/orgUrl";
import { setCurrentOrgSlug } from "@/lib/orgRouter";

interface OrganizationContextType {
  currentOrganization: Organization | null;
  setCurrentOrganization: (org: Organization | null) => void;
  organizations: Organization[];
  memberships: OrganizationMember[];
  isLoading: boolean;
  // True when the URL's `?org=` resolves to a real org but the current user
  // is not a member. The app shows a dedicated access-denied screen in this
  // case (see `OrgAccessGate`).
  accessDeniedOrg: { id: number; slug: string; name: string } | null;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

interface ResolvedOrgPayload {
  id: number;
  slug: string;
  name: string;
  isMember: boolean;
}

// Read `?org=` synchronously off window.location so SSR / first-render is
// stable. Returns null when the param is absent.
function readOrgFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return getOrgFromCurrentUrl();
}

// Subscribe to history changes (push/replace + popstate) so a same-tab
// navigation that swaps `?org=` is picked up immediately. Wouter's location
// hook only exposes the pathname, so we monkey-patch history methods to emit
// a custom event we can listen to here.
const ORG_URL_EVENT = "org-url-changed";
function emitOrgUrlChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ORG_URL_EVENT));
}
let historyPatched = false;
function ensureHistoryPatched(): void {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;
  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;
  window.history.pushState = function (this: History, ...args: unknown[]) {
    const result = originalPush.apply(this, args as Parameters<History["pushState"]>);
    emitOrgUrlChanged();
    return result;
  } as typeof window.history.pushState;
  window.history.replaceState = function (this: History, ...args: unknown[]) {
    const result = originalReplace.apply(this, args as Parameters<History["replaceState"]>);
    emitOrgUrlChanged();
    return result;
  } as typeof window.history.replaceState;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentOrganization, setCurrentOrganizationState] = useState<Organization | null>(null);
  const [accessDeniedOrg, setAccessDeniedOrg] = useState<OrganizationContextType["accessDeniedOrg"]>(null);
  // Tracks the most recent `?org=` value we've seen in the URL so we can
  // re-resolve only when it actually changes.
  const [urlOrgKey, setUrlOrgKey] = useState<string | null>(() => readOrgFromLocation());

  useEffect(() => {
    ensureHistoryPatched();
    const handler = () => {
      const next = readOrgFromLocation();
      setUrlOrgKey(prev => (prev === next ? prev : next));
    };
    window.addEventListener(ORG_URL_EVENT, handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener(ORG_URL_EVENT, handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<OrganizationMember[]>({
    queryKey: ['/api/users', user?.id, 'organizations'],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/organizations`);
      return res.json();
    },
    enabled: !!user?.id
  });

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ['/api/organizations'],
    enabled: !!user?.id
  });

  // Resolve `?org=` (slug or numeric id) into a concrete org. Fast-path: if
  // the slug matches an org we already have in the loaded list, skip the
  // network round-trip. Slow path: hit the resolver endpoint.
  const { data: resolvedFromUrl, isLoading: resolveLoading } = useQuery<ResolvedOrgPayload | null>({
    queryKey: ['/api/organizations/resolve', urlOrgKey],
    queryFn: async () => {
      if (!urlOrgKey) return null;
      // Fast path: is the value the slug or id of an org in our loaded list?
      const local = organizations.find(o =>
        o.slug === urlOrgKey || String(o.id) === urlOrgKey
      );
      if (local) {
        return { id: local.id, slug: local.slug, name: local.name, isMember: true };
      }
      const res = await fetch(`/api/organizations/resolve?key=${encodeURIComponent(urlOrgKey)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to resolve organization from URL');
      return res.json();
    },
    enabled: !!user?.id && !!urlOrgKey && !orgsLoading,
    staleTime: 1000 * 60 * 5,
  });

  // Wrapper around setCurrentOrganization that also syncs the global
  // `currentOrgSlug` ref consumed by the wouter router integration. Keeping
  // this a single setter avoids drift between context and router state.
  const setCurrentOrganization = useCallback((org: Organization | null) => {
    setCurrentOrganizationState(org);
    setCurrentOrgSlug(org?.slug ?? null);
  }, []);

  // Initial selection: prefer the URL's `?org=` (when it resolves to an org
  // the user belongs to); otherwise fall back to the last-used org from
  // localStorage; finally land on the user's first org.
  //
  // Note: the URL-driven branch runs even when `organizations.length === 0`,
  // so a user with zero memberships who follows a `?org=` link still sees
  // the access-denied screen instead of a blank page.
  useEffect(() => {
    if (orgsLoading || resolveLoading) return;

    // URL-driven selection (handled before the empty-orgs early return so
    // non-member access-denied still works for users with zero orgs).
    if (urlOrgKey) {
      if (resolvedFromUrl) {
        if (resolvedFromUrl.isMember) {
          // Prefer the org from the loaded list (full record) over the
          // slim resolver payload.
          const fullOrg = organizations.find(o => o.id === resolvedFromUrl.id);
          if (fullOrg) {
            if (currentOrganization?.id !== fullOrg.id) {
              setCurrentOrganization(fullOrg);
            }
            if (accessDeniedOrg) setAccessDeniedOrg(null);
            return;
          }
          // Edge case: org exists + user is a member, but isn't yet in the
          // loaded list (e.g. just-accepted invite). Re-fetch the list.
          queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
          return;
        }
        // Resolved but not a member → access-denied screen.
        setAccessDeniedOrg({ id: resolvedFromUrl.id, slug: resolvedFromUrl.slug, name: resolvedFromUrl.name });
        return;
      }
      // resolvedFromUrl === null: org doesn't exist (or 404). Fall through
      // to the localStorage-based selection so the rest of the app still
      // loads. We deliberately don't show an access-denied for "unknown" —
      // this matches old behaviour where bad ?org= values were ignored.
    }

    if (accessDeniedOrg) setAccessDeniedOrg(null);

    // localStorage-based fallback (unchanged from previous behaviour).
    if (organizations.length === 0) return;
    if (!currentOrganization) {
      const savedOrgId = localStorage.getItem('currentOrgId');
      const savedOrg = savedOrgId ? organizations.find(o => o.id === Number(savedOrgId)) : null;
      setCurrentOrganization(savedOrg || organizations[0]);
    }
  }, [
    organizations,
    orgsLoading,
    resolveLoading,
    resolvedFromUrl,
    urlOrgKey,
    currentOrganization,
    accessDeniedOrg,
    setCurrentOrganization,
    queryClient,
  ]);

  // Persist selection to localStorage as a soft fallback for sessions that
  // open without `?org=` in the URL.
  useEffect(() => {
    if (currentOrganization) {
      localStorage.setItem('currentOrgId', String(currentOrganization.id));
    }
  }, [currentOrganization]);

  // Keep the URL's `?org=` synchronised with the active org. We use
  // history.replaceState (no extra history entry) so the back button still
  // works the way users expect.
  //
  // Race-condition guard: when the URL itself changes (`urlOrgKey` updates)
  // we wait for the resolver and the selection effect to settle. Otherwise
  // we'd briefly rewrite a freshly-pasted `?org=newslug` back to the OLD
  // active org's slug before the selection effect has a chance to swap it.
  const lastSyncedSlug = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!currentOrganization) return;
    if (accessDeniedOrg) return; // Don't rewrite the URL while the gate is up.
    if (resolveLoading) return; // Still resolving a URL-driven org switch.
    // If the URL points at a DIFFERENT org than the one currently active,
    // hold off — the selection effect will swap currentOrganization to
    // match the URL momentarily, and we'll re-run with the right value.
    if (urlOrgKey
      && urlOrgKey !== currentOrganization.slug
      && urlOrgKey !== String(currentOrganization.id)) {
      return;
    }
    const slug = currentOrganization.slug;
    if (!isOrgScopedPath(window.location.pathname)) return;
    const currentParam = getOrgFromCurrentUrl();
    if (currentParam === slug && lastSyncedSlug.current === slug) return;
    const next = withOrg(window.location.pathname + window.location.search + window.location.hash, slug);
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(window.history.state, "", next);
    }
    lastSyncedSlug.current = slug;
  }, [currentOrganization, accessDeniedOrg, urlOrgKey, resolveLoading]);

  // Sync currentOrganization with fresh data from organizations list (covers
  // background-refetched updates to the org's name/settings).
  useEffect(() => {
    if (currentOrganization && organizations.length > 0) {
      const updatedOrg = organizations.find(o => o.id === currentOrganization.id);
      if (updatedOrg) {
        const currentStr = JSON.stringify(currentOrganization);
        const updatedStr = JSON.stringify(updatedOrg);
        if (currentStr !== updatedStr) {
          setCurrentOrganization(updatedOrg);
        }
      }
    }
  }, [organizations, currentOrganization, setCurrentOrganization]);

  // Prefetch assigned tasks when organization changes for faster Timesheets/My Assignments
  useEffect(() => {
    if (currentOrganization && user?.id) {
      queryClient.prefetchQuery({
        queryKey: ["/api/timesheets/assigned-tasks", currentOrganization.id, user.id],
        queryFn: async () => {
          const response = await fetch(`/api/timesheets/assigned-tasks?organizationId=${currentOrganization.id}`);
          if (!response.ok) throw new Error("Failed to fetch assigned tasks");
          return response.json();
        },
        staleTime: 1000 * 60 * 5,
      });
      queryClient.prefetchQuery({
        queryKey: ["/api/timesheets/current-resource", currentOrganization.id, user.id],
        queryFn: async () => {
          const response = await fetch(`/api/timesheets/current-resource?organizationId=${currentOrganization.id}`);
          if (!response.ok) return null;
          const data = await response.json();
          if (data && typeof data === 'object' && 'resource' in data) {
            return data.resource;
          }
          return data;
        },
        staleTime: 1000 * 60 * 10,
      });
    }
  }, [currentOrganization, user?.id, queryClient]);

  return (
    <OrganizationContext.Provider value={{
      currentOrganization,
      setCurrentOrganization,
      organizations,
      memberships,
      isLoading: membershipsLoading || orgsLoading,
      accessDeniedOrg,
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
}

// Re-export for the access-denied screen so callers can use a fresh URL
// param without depending on a separate import path.
export { ORG_QUERY_PARAM };
