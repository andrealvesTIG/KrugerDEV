import { useEffect, useState } from "react";

const STORAGE_KEY = "friday_ai_mode";

function loadInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let globalAiMode: boolean = loadInitial();
const listeners = new Set<(v: boolean) => void>();

function persist(value: boolean) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
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
