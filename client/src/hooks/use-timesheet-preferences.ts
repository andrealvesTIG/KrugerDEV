import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

const STORAGE_KEY = "friday_timesheet_show_planned";

// Per-user "show Planned hours row" preference for the Timesheets grid.
// Mirrors the use-ai-mode pattern: localStorage for instant first paint,
// server (`ui_preferences.timesheetShowPlanned`) so the choice follows the
// user across devices. Server wins on hydration; explicit user toggles
// update both. Default: off (legacy behaviour).
function loadInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return false;
  } catch {
    return false;
  }
}

let globalShowPlanned: boolean = loadInitial();
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
      body: JSON.stringify({ timesheetShowPlanned: value }),
    });
  } catch {
    /* non-fatal — localStorage still has the value */
  }
}

export function setTimesheetShowPlanned(value: boolean) {
  if (globalShowPlanned === value) return;
  globalShowPlanned = value;
  hasHydratedFromServer = true;
  persistLocal(value);
  void persistServer(value);
  listeners.forEach(fn => fn(value));
}

function applyServerValue(value: boolean) {
  if (hasHydratedFromServer) return;
  hasHydratedFromServer = true;
  if (globalShowPlanned === value) return;
  globalShowPlanned = value;
  persistLocal(value);
  listeners.forEach(fn => fn(value));
}

export function useTimesheetShowPlanned(): {
  showPlanned: boolean;
  setShowPlanned: (v: boolean) => void;
  toggleShowPlanned: () => void;
} {
  const [value, setValue] = useState<boolean>(globalShowPlanned);

  useEffect(() => {
    const fn = (v: boolean) => setValue(v);
    listeners.add(fn);
    setValue(globalShowPlanned);
    return () => { listeners.delete(fn); };
  }, []);

  return {
    showPlanned: value,
    setShowPlanned: setTimesheetShowPlanned,
    toggleShowPlanned: () => setTimesheetShowPlanned(!globalShowPlanned),
  };
}

type AuthUserWithPrefs = User & { uiPreferences?: { timesheetShowPlanned?: boolean } };

// Mount once near the top of the React tree. Watches the auth-user query
// and, the first time it resolves for a given user id, hydrates the
// preference from the server. Mirrors useAiModeServerSync.
export function useTimesheetShowPlannedServerSync(): null {
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
      const serverValue = user.uiPreferences?.timesheetShowPlanned;
      applyServerValue(typeof serverValue === "boolean" ? serverValue : false);
    };

    apply();
    const unsub = queryClient.getQueryCache().subscribe(event => {
      if (event.query.queryKey[0] === "/api/auth/user") apply();
    });
    return () => unsub();
  }, [queryClient]);

  return null;
}
