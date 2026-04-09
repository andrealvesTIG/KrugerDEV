import { useState, useCallback, useRef, useEffect } from "react";

export interface JarvisMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

let moduleMessages: JarvisMessage[] = [];

function loadFromStorage(): JarvisMessage[] {
  try {
    const stored = sessionStorage.getItem("friday-copilot-history");
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return [];
}

function saveToStorage(messages: JarvisMessage[]) {
  try {
    sessionStorage.setItem("friday-copilot-history", JSON.stringify(messages.slice(-50)));
  } catch {}
}

export function useJarvis() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<JarvisMessage[]>(() => {
    if (moduleMessages.length > 0) return moduleMessages;
    const stored = loadFromStorage();
    moduleMessages = stored;
    return stored;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [conciseMode, setConciseMode] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    moduleMessages = messages;
    saveToStorage(messages);
  }, [messages]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: JarvisMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: content.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const conversationHistory = [...messages, userMessage]
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/jarvis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: content.trim(),
          conversationHistory,
          conciseMode,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error("Failed to get response");
      }

      const data = await res.json();

      const assistantMessage: JarvisMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: data.response,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      return assistantMessage;
    } catch (error: any) {
      if (error.name === "AbortError") return;
      const errorMessage: JarvisMessage = {
        id: `msg-${Date.now()}-error`,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, isLoading, conciseMode]);

  const stopResponse = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    moduleMessages = [];
    sessionStorage.removeItem("friday-copilot-history");
  }, []);

  const toggleOpen = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return {
    isOpen,
    setIsOpen,
    toggleOpen,
    messages,
    isLoading,
    sendMessage,
    stopResponse,
    stopGeneration: stopResponse,
    clearHistory,
    clearMessages: clearHistory,
    conciseMode,
    setConciseMode,
  };
}
