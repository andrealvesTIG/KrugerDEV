import { useState, useCallback, useRef, useEffect } from "react";
import { useOrganization } from "./use-organization";

export interface JarvisMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const STORAGE_KEY = "friday_agent_messages";
const MAX_STORED_MESSAGES = 100;

function loadPersistedMessages(): JarvisMessage[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    const messages = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
    const hasLegacyName = messages.some((m: JarvisMessage) =>
      m.role === "assistant" && /\bJARVIS\b/i.test(m.content)
    );
    if (hasLegacyName) {
      sessionStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return messages;
  } catch {
    return [];
  }
}

function persistMessages(messages: JarvisMessage[]) {
  try {
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
  }
}

let globalMessages: JarvisMessage[] = loadPersistedMessages();
let globalListeners: Set<(msgs: JarvisMessage[]) => void> = new Set();

function setGlobalMessages(updater: JarvisMessage[] | ((prev: JarvisMessage[]) => JarvisMessage[])) {
  if (typeof updater === "function") {
    globalMessages = updater(globalMessages);
  } else {
    globalMessages = updater;
  }
  persistMessages(globalMessages);
  globalListeners.forEach(fn => fn(globalMessages));
}

function useGlobalMessages(): [JarvisMessage[], typeof setGlobalMessages] {
  const [localMessages, setLocalMessages] = useState<JarvisMessage[]>(globalMessages);

  useEffect(() => {
    const listener = (msgs: JarvisMessage[]) => setLocalMessages(msgs);
    globalListeners.add(listener);
    setLocalMessages(globalMessages);
    return () => { globalListeners.delete(listener); };
  }, []);

  return [localMessages, setGlobalMessages];
}

export function useJarvis() {
  const [messages, setMessages] = useGlobalMessages();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [conciseMode, setConciseMode] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const { currentOrganization } = useOrganization();

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!currentOrganization?.id || isLoading) return;

    const userMessage: JarvisMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    const assistantMessage: JarvisMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    const currentMessages = globalMessages;
    const allMessages = currentMessages.slice(0, -1).slice(-40).map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      abortRef.current = new AbortController();
      const response = await fetch("/api/jarvis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: allMessages,
          organizationId: currentOrganization.id,
          concise: conciseMode,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Request failed" }));
        throw new Error(err.message || "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  last.content = `Error: ${data.error}`;
                }
                return updated;
              });
              break;
            }
            if (data.done) break;
            if (data.content) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  last.content += data.content;
                }
                return updated;
              });
            }
          } catch {
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            last.content = "*(Response stopped)*";
          } else if (last?.role === "assistant" && last.content) {
            last.content += "\n\n*(Stopped)*";
          }
          return updated;
        });
        return;
      }
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content) {
          last.content = `Sorry, I encountered an error: ${err.message}. Please try again.`;
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [currentOrganization?.id, isLoading, conciseMode]);

  const clearMessages = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setIsLoading(false);
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    isOpen,
    setIsOpen,
    toggleOpen,
    isLoading,
    sendMessage,
    clearMessages,
    stopGeneration,
    conciseMode,
    setConciseMode,
  };
}
