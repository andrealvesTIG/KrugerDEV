import { useState, useCallback, useRef, useEffect } from "react";
import { useOrganization } from "./use-organization";

export interface PowerBIAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const STORAGE_KEY_PREFIX = "powerbi_agent_messages_";
const MAX_STORED_MESSAGES = 100;

function getStorageKey(orgId: number | undefined): string {
  return `${STORAGE_KEY_PREFIX}${orgId || "unknown"}`;
}

function loadPersistedMessages(orgId: number | undefined): PowerBIAgentMessage[] {
  try {
    const stored = sessionStorage.getItem(getStorageKey(orgId));
    if (!stored) return [];
    return JSON.parse(stored).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function persistMessages(messages: PowerBIAgentMessage[], orgId: number | undefined) {
  try {
    sessionStorage.setItem(getStorageKey(orgId), JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {}
}

export function usePowerBIAgent() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [messages, setMessages] = useState<PowerBIAgentMessage[]>(() => loadPersistedMessages(orgId));
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const prevOrgIdRef = useRef(orgId);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (prevOrgIdRef.current !== orgId) {
      setMessages(loadPersistedMessages(orgId));
      prevOrgIdRef.current = orgId;
    }
  }, [orgId]);

  useEffect(() => {
    persistMessages(messages, orgId);
  }, [messages, orgId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!currentOrganization?.id || isLoading) return;

    const userMessage: PowerBIAgentMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date(),
    };

    const assistantMessage: PowerBIAgentMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    const currentMessages = messagesRef.current;
    const allMessages = [...currentMessages, userMessage].slice(-40).map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      abortRef.current = new AbortController();
      const response = await fetch("/api/powerbi-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: allMessages,
          organizationId: currentOrganization.id,
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
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            last.content = "*(Response stopped)*";
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
  }, [currentOrganization?.id, isLoading]);

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
    isLoading,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}
