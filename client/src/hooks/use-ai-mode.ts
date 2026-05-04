import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

const STORAGE_KEY = "friday_ai_mode";

// AI Mode is the default landing experience after login. It persists in two
// places: localStorage for instant first paint, and the server (per-user
// `ui_preferences.aiMode`) so the choice follows the user across devices.
// Server wins on hydration; explicit user toggles update both.
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
let hydratedForUserId: string | null = null;
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
  // Once the user has explicitly toggled, treat the local value as
  // authoritative so a late server hydration doesn't overwrite it.
  hasHydratedFromServer = true;
  persistLocal(value);
  void persistServer(value);
  listeners.forEach(fn => fn(value));
}

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

type AuthUserWithPrefs = User & { uiPreferences?: { aiMode?: boolean } };

// Mount once near the top of the React tree. Watches the auth-user query and,
// the first time it resolves for a given user id, hydrates AI Mode from the
// server. On logout or different-user login the guard resets so the next
// login hydrates fresh.
export function useAiModeServerSync(): null {
  const queryClient = useQueryClient();

  useEffect(() => {
    const apply = () => {
      const user = queryClient.getQueryData<AuthUserWithPrefs | null>(["/api/auth/user"]);

      if (!user) {
        if (hydratedForUserId !== null) {
          hydratedForUserId = null;
          hasHydratedFromServer = false;
        }
        return;
      }

      if (hydratedForUserId !== null && hydratedForUserId !== user.id) {
        hasHydratedFromServer = false;
      }
      if (hasHydratedFromServer) return;

      hydratedForUserId = user.id;
      const serverValue = user.uiPreferences?.aiMode;
      // Missing server pref → keep the default (AI Mode on) and mark hydrated
      // so subsequent toggles aren't second-guessed.
      applyServerValue(typeof serverValue === "boolean" ? serverValue : true);
    };

    apply();
    const unsub = queryClient.getQueryCache().subscribe(event => {
      if (event.query.queryKey[0] === "/api/auth/user") apply();
    });
    return () => unsub();
  }, [queryClient]);

  return null;
}
