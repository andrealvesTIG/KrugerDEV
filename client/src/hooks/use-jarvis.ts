import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "./use-organization";
import { useLocation } from "wouter";

export interface JarvisMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: { name: string; type: string; size: number }[];
}

export interface PageContext {
  path: string;
  entityType: "project" | "portfolio" | "resource" | null;
  entityId: number | null;
  label: string | null;
}

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  content: string;
}

export interface FridayConversationSummary {
  id: number;
  title: string | null;
  lastMessageAt: string;
  createdAt: string;
  snippet: string | null;
}

const ACTIVE_CONV_KEY_PREFIX = "friday_active_conversation_";

function parsePageContext(pathname: string): PageContext {
  const projectMatch = pathname.match(/^\/projects\/(\d+)/);
  if (projectMatch) {
    return { path: pathname, entityType: "project", entityId: parseInt(projectMatch[1]), label: null };
  }
  const portfolioMatch = pathname.match(/^\/portfolios\/(\d+)/);
  if (portfolioMatch) {
    return { path: pathname, entityType: "portfolio", entityId: parseInt(portfolioMatch[1]), label: null };
  }
  const resourceMatch = pathname.match(/^\/resources\/(\d+)/);
  if (resourceMatch) {
    return { path: pathname, entityType: "resource", entityId: parseInt(resourceMatch[1]), label: null };
  }
  return { path: pathname, entityType: null, entityId: null, label: null };
}

function loadActiveConversationId(orgId: number | undefined): number | null {
  if (!orgId) return null;
  try {
    const v = sessionStorage.getItem(ACTIVE_CONV_KEY_PREFIX + orgId);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function saveActiveConversationId(orgId: number | undefined, id: number | null) {
  if (!orgId) return;
  try {
    if (id) sessionStorage.setItem(ACTIVE_CONV_KEY_PREFIX + orgId, String(id));
    else sessionStorage.removeItem(ACTIVE_CONV_KEY_PREFIX + orgId);
  } catch {
    // ignore
  }
}

// ----- Cross-component shared state for the active conversation + open state -----
//
// `_activeConversationId` is keyed implicitly by `_activeOrgId`. When the user
// switches organizations we MUST drop the previous org's conversationId so we
// don't request a conversation that belongs to a different org (which would
// 404 on the server-side org check and confuse the UI).

let _activeConversationId: number | null = null;
let _activeOrgId: number | undefined = undefined;
let _isOpen = false;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

function setActiveConversationIdGlobal(orgId: number | undefined, id: number | null) {
  _activeConversationId = id;
  _activeOrgId = orgId;
  saveActiveConversationId(orgId, id);
  notify();
}

function setIsOpenGlobal(open: boolean) {
  _isOpen = open;
  notify();
}

function useFridaySharedState() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    _listeners.add(fn);
    return () => {
      _listeners.delete(fn);
    };
  }, []);
  return { activeConversationId: _activeConversationId, isOpen: _isOpen };
}

// ----- Server message shape -----

interface ServerMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  attachments: { name: string; type: string; size: number }[] | null;
  createdAt: string;
}

interface ServerConversationDetail {
  id: number;
  title: string | null;
  messages: ServerMessage[];
}

function serverMessageToJarvis(m: ServerMessage): JarvisMessage {
  return {
    id: `srv-${m.id}`,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.createdAt),
    attachments: m.attachments ?? undefined,
  };
}

export function useJarvis() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const { activeConversationId, isOpen } = useFridaySharedState();

  // Sync active conversation id with the current organization. When orgId
  // changes (org switcher), discard any previous-org conversationId and
  // re-hydrate from sessionStorage scoped to the new org. Sending a request
  // with a conversationId that belongs to another org would be rejected
  // server-side (org+user gate in fcGet) and would confuse the UI.
  useEffect(() => {
    if (!orgId) return;
    if (_activeOrgId !== orgId) {
      _activeOrgId = orgId;
      const saved = loadActiveConversationId(orgId);
      _activeConversationId = saved ?? null;
      notify();
    }
  }, [orgId]);

  // Local in-flight overlay (optimistic user msg + streaming assistant msg)
  const [pendingMessages, setPendingMessages] = useState<JarvisMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conciseMode, setConciseMode] = useState(false);
  // When true, the next chat requests force the onboarding directive on the
  // server even if the org isn't auto-detected as empty. Set by the
  // "Onboarding agent" launcher; cleared whenever the user switches to a
  // different existing conversation.
  const [forceOnboarding, setForceOnboarding] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const pageContext = parsePageContext(location);

  // Conversations list
  const conversationsQuery = useQuery<FridayConversationSummary[]>({
    queryKey: ["/api/jarvis/conversations", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`/api/jarvis/conversations?organizationId=${orgId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load conversations");
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // Active conversation messages
  const conversationQuery = useQuery<ServerConversationDetail | null>({
    queryKey: ["/api/jarvis/conversations", orgId, activeConversationId],
    queryFn: async () => {
      if (!orgId || !activeConversationId) return null;
      const res = await fetch(
        `/api/jarvis/conversations/${activeConversationId}?organizationId=${orgId}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to load conversation");
      }
      return res.json();
    },
    enabled: !!orgId && !!activeConversationId,
    staleTime: 5_000,
  });

  const persistedMessages: JarvisMessage[] = useMemo(() => {
    return (conversationQuery.data?.messages ?? []).map(serverMessageToJarvis);
  }, [conversationQuery.data]);

  // Final messages = persisted (when not actively streaming) + pending overlay (when sending)
  const messages: JarvisMessage[] = useMemo(() => {
    if (pendingMessages.length > 0) {
      // Hide persisted versions of the user's currently-pending message to avoid dupes:
      // pending only exists during the request; once complete we clear it and refetch.
      return [...persistedMessages, ...pendingMessages];
    }
    return persistedMessages;
  }, [persistedMessages, pendingMessages]);

  const setIsOpen = useCallback((open: boolean) => setIsOpenGlobal(open), []);
  const toggleOpen = useCallback(() => setIsOpenGlobal(!_isOpen), []);

  const switchConversation = useCallback(
    (id: number | null, opts?: { forceOnboarding?: boolean }) => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setIsLoading(false);
      setPendingMessages([]);
      setForceOnboarding(opts?.forceOnboarding === true);
      setActiveConversationIdGlobal(orgId, id);
    },
    [orgId],
  );

  const newConversation = useCallback(() => {
    switchConversation(null);
  }, [switchConversation]);

  // Start a fresh conversation with the onboarding directive forced ON,
  // regardless of whether the org is auto-detected as empty. This powers the
  // "Onboarding agent" launcher button.
  const startOnboardingAgent = useCallback(() => {
    switchConversation(null, { forceOnboarding: true });
  }, [switchConversation]);

  const sendMessage = useCallback(
    async (content: string, attachments?: FileAttachment[]) => {
      if (!orgId || isLoading) return;

      const userOverlay: JarvisMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
        attachments: attachments?.map((a) => ({ name: a.name, type: a.type, size: a.size })),
      };
      const assistantOverlay: JarvisMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setPendingMessages([userOverlay, assistantOverlay]);
      setIsLoading(true);

      // Compose the conversation history sent to the model: persisted history + new user msg.
      const history = persistedMessages.slice(-40).map((m) => ({ role: m.role, content: m.content }));
      const allMessages = [...history, { role: "user" as const, content }];

      const currentPageContext = parsePageContext(window.location.pathname);
      let resolvedConversationId: number | null = activeConversationId;
      // AI-limit error messages are only in the pending overlay (never
      // persisted), so the finally cleanup must keep them on screen.
      let preservePendingOnFinish = false;

      try {
        abortRef.current = new AbortController();
        const response = await fetch("/api/jarvis/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messages: allMessages,
            organizationId: orgId,
            concise: conciseMode,
            conversationId: activeConversationId ?? undefined,
            pageContext: {
              path: currentPageContext.path,
              entityType: currentPageContext.entityType,
              entityId: currentPageContext.entityId,
            },
            attachments: attachments?.map((a) => ({
              name: a.name,
              type: a.type,
              size: a.size,
              content: a.content,
            })),
            forceOnboarding: forceOnboarding || undefined,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ message: "Request failed" }));
          if (response.status === 403 && err?.limitExceeded && err?.resourceType === "ai_runs") {
            const friendly =
              "You've used all your AI credits for this billing cycle. " +
              "Upgrade your plan in [Billing settings](/settings/billing) to continue using Friday.";
            setPendingMessages((prev) => {
              if (prev.length === 0) return prev;
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === "assistant") last.content = friendly;
              return updated;
            });
            preservePendingOnFinish = true;
            return;
          }
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
                const isAiLimit =
                  data.limitExceeded === true && data.resourceType === "ai_runs";
                const errText = isAiLimit
                  ? "You've used all your AI credits for this billing cycle. " +
                    "Upgrade your plan in [Billing settings](/settings/billing) to continue using Friday."
                  : `Error: ${data.error}`;
                setPendingMessages((prev) => {
                  if (prev.length === 0) return prev;
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") last.content = errText;
                  return updated;
                });
                if (isAiLimit) preservePendingOnFinish = true;
                continue;
              }
              if (data.conversationId && !resolvedConversationId) {
                resolvedConversationId = data.conversationId;
                setActiveConversationIdGlobal(orgId, data.conversationId);
              }
              if (data.done) continue;
              if (data.content) {
                setPendingMessages((prev) => {
                  if (prev.length === 0) return prev;
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") last.content += data.content;
                  return updated;
                });
              }
            } catch {
              // ignore parse errors on heartbeat lines
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          setPendingMessages((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant" && !last.content) {
              last.content = "*(Response stopped)*";
            } else if (last?.role === "assistant" && last.content) {
              last.content += "\n\n*(Stopped)*";
            }
            return updated;
          });
        } else {
          setPendingMessages((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant" && !last.content) {
              const msg = err.message || "";
              const isOversize = /character|too large|size/i.test(msg);
              last.content = isOversize
                ? `Sorry, the content is too large to process in one go. If you're uploading a large CSV file, try splitting it into smaller files and uploading each one separately. I can process up to 500KB per file.`
                : `Sorry, I encountered an error: ${msg.replace(/\.+$/, "")}. Please try again.`;
            }
            return updated;
          });
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
        // Refetch to swap in persisted versions, then clear overlay
        if (resolvedConversationId && orgId) {
          await queryClient.invalidateQueries({
            queryKey: ["/api/jarvis/conversations", orgId, resolvedConversationId],
          });
          await queryClient.invalidateQueries({
            queryKey: ["/api/jarvis/conversations", orgId],
          });
        }
        if (!preservePendingOnFinish) setPendingMessages([]);
      }
    },
    [orgId, isLoading, conciseMode, activeConversationId, persistedMessages, queryClient, forceOnboarding],
  );

  const clearMessages = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setPendingMessages([]);
    setIsLoading(false);
    setActiveConversationIdGlobal(orgId, null);
  }, [orgId]);

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
    pageContext,
    // New: server-backed conversation controls
    conversations: conversationsQuery.data ?? [],
    conversationsLoading: conversationsQuery.isLoading,
    activeConversationId,
    switchConversation,
    newConversation,
    startOnboardingAgent,
    forceOnboarding,
  };
}
