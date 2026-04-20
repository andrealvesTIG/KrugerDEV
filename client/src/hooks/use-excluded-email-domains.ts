import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_EXCLUDED_EMAIL_DOMAINS,
  normalizeDomain,
  serializeExcludedDomainsParam,
} from "@shared/lib/emailDomains";

const STORAGE_PREFIX = "excludedEmailDomains:";

interface UserState {
  domains: string[];
  enabled: boolean;
}

const cache = new Map<string, UserState>();
const listeners = new Map<string, Set<() => void>>();

function readStoredDomains(userKey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userKey);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const cleaned: string[] = [];
    for (const v of parsed) {
      if (typeof v !== "string") continue;
      const n = normalizeDomain(v);
      if (n && !cleaned.includes(n)) cleaned.push(n);
    }
    return cleaned;
  } catch {
    return null;
  }
}

function readStoredEnabled(userKey: string): boolean {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(STORAGE_PREFIX + userKey + ":enabled");
  if (raw == null) return true;
  return raw !== "false";
}

function writeStoredDomains(userKey: string, domains: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + userKey,
      JSON.stringify(domains),
    );
  } catch {
    /* ignore */
  }
}

function writeStoredEnabled(userKey: string, enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + userKey + ":enabled",
      enabled ? "true" : "false",
    );
  } catch {
    /* ignore */
  }
}

function getInitialState(userKey: string): UserState {
  const stored = readStoredDomains(userKey);
  return {
    domains: stored ?? [...DEFAULT_EXCLUDED_EMAIL_DOMAINS],
    enabled: readStoredEnabled(userKey),
  };
}

function ensureState(userKey: string): UserState {
  let state = cache.get(userKey);
  if (!state) {
    state = getInitialState(userKey);
    cache.set(userKey, state);
  }
  return state;
}

function notify(userKey: string) {
  const set = listeners.get(userKey);
  if (!set) return;
  for (const fn of set) fn();
}

function subscribe(userKey: string, listener: () => void): () => void {
  let set = listeners.get(userKey);
  if (!set) {
    set = new Set();
    listeners.set(userKey, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(userKey);
  };
}

function setState(userKey: string, next: UserState) {
  cache.set(userKey, next);
  notify(userKey);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(STORAGE_PREFIX)) return;
    const rest = e.key.slice(STORAGE_PREFIX.length);
    const userKey = rest.endsWith(":enabled")
      ? rest.slice(0, -":enabled".length)
      : rest;
    if (!cache.has(userKey)) return;
    cache.set(userKey, getInitialState(userKey));
    notify(userKey);
  });
}

export interface UseExcludedEmailDomainsResult {
  domains: string[];
  enabled: boolean;
  setDomains: (next: string[]) => void;
  addDomain: (domain: string) => void;
  removeDomain: (domain: string) => void;
  setEnabled: (enabled: boolean) => void;
  resetToDefaults: () => void;
  toQueryParam: () => string;
  appendToUrl: (url: string) => string;
  queryKeyPart: string;
}

export function useExcludedEmailDomains(): UseExcludedEmailDomainsResult {
  const { user } = useAuth();
  const userKey = user?.id || "anonymous";

  useEffect(() => {
    ensureState(userKey);
  }, [userKey]);

  const state = useSyncExternalStore(
    useCallback((listener) => subscribe(userKey, listener), [userKey]),
    useCallback(() => ensureState(userKey), [userKey]),
    useCallback(() => ensureState(userKey), [userKey]),
  );

  const { domains, enabled } = state;

  const setDomains = useCallback(
    (next: string[]) => {
      const cleaned: string[] = [];
      for (const v of next) {
        const n = normalizeDomain(v);
        if (n && !cleaned.includes(n)) cleaned.push(n);
      }
      writeStoredDomains(userKey, cleaned);
      setState(userKey, { ...ensureState(userKey), domains: cleaned });
    },
    [userKey],
  );

  const addDomain = useCallback(
    (domain: string) => {
      const n = normalizeDomain(domain);
      if (!n) return;
      const current = ensureState(userKey);
      if (current.domains.includes(n)) return;
      const next = [...current.domains, n];
      writeStoredDomains(userKey, next);
      setState(userKey, { ...current, domains: next });
    },
    [userKey],
  );

  const removeDomain = useCallback(
    (domain: string) => {
      const n = normalizeDomain(domain);
      const current = ensureState(userKey);
      const next = current.domains.filter((d) => d !== n);
      writeStoredDomains(userKey, next);
      setState(userKey, { ...current, domains: next });
    },
    [userKey],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      writeStoredEnabled(userKey, next);
      setState(userKey, { ...ensureState(userKey), enabled: next });
    },
    [userKey],
  );

  const resetToDefaults = useCallback(() => {
    const next: UserState = {
      domains: [...DEFAULT_EXCLUDED_EMAIL_DOMAINS],
      enabled: true,
    };
    writeStoredDomains(userKey, next.domains);
    writeStoredEnabled(userKey, true);
    setState(userKey, next);
  }, [userKey]);

  const effective = useMemo(
    () => (enabled ? domains : []),
    [enabled, domains],
  );

  const toQueryParam = useCallback(
    () => serializeExcludedDomainsParam(effective),
    [effective],
  );

  const appendToUrl = useCallback(
    (url: string) => {
      const value = serializeExcludedDomainsParam(effective);
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}excludedEmailDomains=${encodeURIComponent(value)}`;
    },
    [effective],
  );

  const queryKeyPart = useMemo(
    () => `excludedEmailDomains=${effective.join(",")}`,
    [effective],
  );

  return {
    domains,
    enabled,
    setDomains,
    addDomain,
    removeDomain,
    setEnabled,
    resetToDefaults,
    toQueryParam,
    appendToUrl,
    queryKeyPart,
  };
}
