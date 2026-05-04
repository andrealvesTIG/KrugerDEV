import { useEffect, useState } from "react";

const STORAGE_KEY = "friday_ai_mode";

// AI Mode is the default landing experience after login. We persist both the
// "on" ("1") and "off" ("0") choices so a user who explicitly opts out of AI
// Mode stays opted out across reloads. Only an absent key — i.e. a brand-new
// or returning visitor who has never toggled — falls back to the default.
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
const listeners = new Set<(v: boolean) => void>();

function persist(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function setAiMode(value: boolean) {
  if (globalAiMode === value) return;
  globalAiMode = value;
  persist(value);
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
