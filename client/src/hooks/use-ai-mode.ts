import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

const STORAGE_KEY = "friday_ai_mode";

// AI Mode is the default landing experience after login. We persist the user's
// last-used mode in two places:
//   - localStorage (instant, per-browser, used for the very first paint before
//     the auth round-trip resolves)
//   - server (`users.ui_preferences.aiMode`, follows the user across devices)
//
// On hydration the SERVER value wins, since it represents "the latest mode the
// user was in last" anywhere. Toggling the mode writes to both places.
function loadInitial(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true;
  } catch {
    return true;
  }
}

let globalAiMode: boolean = loadInitial();
let hasHydratedFromServer = false;
const listeners = new Set<(v: boolean) => void>();

function persistLocal(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

async function persistServer(value: boolean): Promise<void> {
  try {
    await fetch("/api/profile/ui-preferences", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiMode: value }),
    });
  } catch {
    /* network/auth failures are non-fatal — localStorage still has the value */
  }
}

export function setAiMode(value: boolean) {
  if (globalAiMode === value) return;
  globalAiMode = value;
  // Once the user has explicitly toggled in this session, treat the local
  // value as authoritative — don't let a stale server hydration overwrite it.
  hasHydratedFromServer = true;
  persistLocal(value);
  void persistServer(value);
  listeners.forEach(fn => fn(value));
}

// Internal: applied by the server-sync component when the auth payload first
// resolves. Only takes effect once and only if the user hasn't already toggled.
function applyServerValue(value: boolean) {
  if (hasHydratedFromServer) return;
  hasHydratedFromServer = true;
  if (globalAiMode === value) return;
  globalAiMode = value;
  persistLocal(value);
  listeners.forEach(fn => fn(value));
}

export function useAiMode(): { aiMode: boolean; setAiMode: (v: boolean) => void; toggleAiMode: () => void } {
  const [value, setValue] = useState<boolean>(globalAiMode);

  useEffect(() => {
    const fn = (v: boolean) => setValue(v);
    listeners.add(fn);
    setValue(globalAiMode);
    return () => { listeners.delete(fn); };
  }, []);

  return {
    aiMode: value,
    setAiMode,
    toggleAiMode: () => setAiMode(!globalAiMode),
  };
}

export function useAiModeEscapeHandler() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && globalAiMode) {
        e.preventDefault();
        setAiMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// Tracks which user id the global state was last hydrated for. When the
// authenticated user changes (logout → login as different user on the same
// browser, no full reload), we reset the hydration guard so the new user's
// server preference takes effect.
let hydratedForUserId: string | null = null;

// Mount once near the top of the React tree. Watches the cached auth user and,
// the first time it sees a value, hydrates AI Mode from the server-side
// `uiPreferences.aiMode` field. If the user has no stored preference yet
// (first-ever login) AI Mode stays on by default.
export function useAiModeServerSync(): null {
  const queryClient = useQueryClient();

  useEffect(() => {
    const apply = () => {
      const user = queryClient.getQueryData<(User & { uiPreferences?: { aiMode?: boolean } }) | null>([
        "/api/auth/user",
      ]);

      // User logged out (or session expired) — clear the guard so the next
      // login can hydrate fresh from that user's server prefs.
      if (!user) {
        if (hydratedForUserId !== null) {
          hydratedForUserId = null;
          hasHydratedFromServer = false;
        }
        return;
      }

      // Different user logged in on the same browser — reset and rehydrate.
      const userId = user.id;
      if (hydratedForUserId !== null && hydratedForUserId !== userId) {
        hasHydratedFromServer = false;
      }
      if (hasHydratedFromServer) return;

      hydratedForUserId = userId;
      const serverValue = user.uiPreferences?.aiMode;
      if (typeof serverValue === "boolean") {
        applyServerValue(serverValue);
      } else {
        // No stored preference → keep the default (AI Mode on) AND mark
        // hydration as complete so subsequent toggles aren't second-guessed.
        applyServerValue(true);
      }
    };

    apply();
    const unsub = queryClient.getQueryCache().subscribe(event => {
      if (event.query.queryKey[0] === "/api/auth/user") apply();
    });
    return () => unsub();
  }, [queryClient]);

  return null;
}
