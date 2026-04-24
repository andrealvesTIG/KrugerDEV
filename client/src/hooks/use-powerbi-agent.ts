import { useState, useCallback, useRef, useEffect } from "react";
import { useOrganization } from "./use-organization";
import type { PbiIntakeState } from "@shared/schema";

export type PowerBIAgentModel = "fast" | "smart" | "claude";

export interface PbiIntakeFieldMeta {
  key: keyof PbiIntakeState;
  label: string;
  section: string;
  type: "string" | "number";
}

export interface PowerBIAttachment {
  name: string;
  objectPath: string;
  contentType: string;
  size: number;
}

export interface PowerBIIntakeRef {
  intakeId: number;
  intakeNumber: string;
  requestNumber: string;
  reportName: string;
}

export interface PowerBIAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: PowerBIAttachment[];
  intake?: PowerBIIntakeRef;
  timestamp: Date;
  phase?: "analyzing" | null;
}

export interface PowerBIAttachmentAnalysis {
  audienceTier: "executive" | "manager" | "analyst" | "mixed" | "unknown";
  audienceEvidence: string;
  documentTypes: string[];
  topics: string[];
  suggestedMetrics: string[];
  suggestedDimensions: string[];
  suggestedTimeGrain: string;
  suggestedRefreshCadence: string;
  suggestedDataSources: string[];
  openQuestions: string[];
  confidence: "low" | "medium" | "high";
  summary: string;
  sourceFiles: string[];
}

export interface PowerBIAgentConversation {
  id: number;
  title: string | null;
  model: string | null;
  lastMessageAt: string | null;
  submittedIntakeId: number | null;
  snippet?: string | null;
}

export interface ProviderInfo {
  id: PowerBIAgentModel;
  label: string;
  available: boolean;
}

const MODEL_PREF_KEY = "powerbi_agent_model";

function loadModelPref(): PowerBIAgentModel {
  try {
    const v = localStorage.getItem(MODEL_PREF_KEY);
    if (v === "fast" || v === "smart" || v === "claude") return v;
  } catch {}
  return "fast";
}

export function usePowerBIAgent() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const [messages, setMessages] = useState<PowerBIAgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<PowerBIAgentConversation[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [model, setModelState] = useState<PowerBIAgentModel>(() => loadModelPref());
  // Resumed history starts read-only; user clicks "Continue" to participate again.
  const [isReadOnly, setIsReadOnly] = useState(false);
  // Intake the active conversation has produced (if any). Drives the "Open intake" link.
  const [submittedIntakeId, setSubmittedIntakeId] = useState<number | null>(null);
  const [intakeState, setIntakeState] = useState<PbiIntakeState | null>(null);
  const [intakeFields, setIntakeFields] = useState<PbiIntakeFieldMeta[]>([]);
  const [intakeSections, setIntakeSections] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationIdRef = useRef<number | null>(null);
  conversationIdRef.current = conversationId;

  const setModel = useCallback((m: PowerBIAgentModel) => {
    setModelState(m);
    try { localStorage.setItem(MODEL_PREF_KEY, m); } catch {}
  }, []);

  // Load static intake field metadata (labels + grouping) once
  useEffect(() => {
    fetch("/api/powerbi-agent/intake-fields", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setIntakeFields(d.fields || []);
          setIntakeSections(d.sections || []);
        }
      })
      .catch(() => {});
  }, []);

  // Load providers once
  useEffect(() => {
    fetch("/api/powerbi-agent/providers", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((p: ProviderInfo[]) => {
        setProviders(p);
        // Fallback if previously selected model is now unavailable
        const cur = loadModelPref();
        const match = p.find(x => x.id === cur);
        if (!match || !match.available) {
          const firstAvail = p.find(x => x.available);
          if (firstAvail) setModel(firstAvail.id);
        }
      })
      .catch(() => {});
  }, [setModel]);

  const refreshConversations = useCallback(async () => {
    if (!orgId) return;
    try {
      const r = await fetch(`/api/powerbi-agent/conversations?organizationId=${orgId}`, { credentials: "include" });
      if (r.ok) setConversations(await r.json());
    } catch {}
  }, [orgId]);

  // Read the *current* model preference inside the migration without making the
  // org-change effect depend on `model` (which would wipe chat on model switch).
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    if (!orgId) return;
    refreshConversations();
    // When org changes, drop in-memory chat
    setMessages([]);
    setConversationId(null);
    setIsReadOnly(false);
    setSubmittedIntakeId(null);
    setIntakeState(null);
    setIsSubmitted(false);
    // One-time migration: import any sessionStorage-cached chat from the legacy
    // client-only implementation into a server-backed conversation, then delete the key.
    void (async () => {
      try {
        const legacyKey = `powerbi_agent_messages_${orgId}`;
        const raw = sessionStorage.getItem(legacyKey);
        if (!raw) return;
        const legacy = JSON.parse(raw) as Array<{ role?: string; content?: string; timestamp?: string }>;
        if (!Array.isArray(legacy) || legacy.length === 0) {
          sessionStorage.removeItem(legacyKey);
          return;
        }
        const createRes = await fetch(`/api/powerbi-agent/conversations?organizationId=${orgId}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelRef.current, title: "Imported chat" }),
        });
        if (!createRes.ok) return;
        const conv = await createRes.json();
        for (const m of legacy) {
          if ((m.role !== "user" && m.role !== "assistant") || !m.content) continue;
          await fetch(`/api/powerbi-agent/conversations/${conv.id}/messages?organizationId=${orgId}`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: m.role, content: m.content }),
          }).catch(() => {});
        }
        sessionStorage.removeItem(legacyKey);
        await refreshConversations();
      } catch {
        // best-effort migration; swallow errors
      }
    })();
  }, [orgId, refreshConversations]);

  const startNewConversation = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setConversationId(null);
    setIsLoading(false);
    setIsReadOnly(false);
    setSubmittedIntakeId(null);
    setIntakeState(null);
    setIsSubmitted(false);
  }, []);

  const continueConversation = useCallback(() => {
    setIsReadOnly(false);
  }, []);

  const loadConversation = useCallback(async (id: number) => {
    if (!orgId) return;
    try {
      const r = await fetch(`/api/powerbi-agent/conversations/${id}?organizationId=${orgId}`, { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      setConversationId(data.conversation.id);
      if (data.conversation.model) setModel(data.conversation.model as PowerBIAgentModel);
      const loaded: PowerBIAgentMessage[] = (data.messages || []).map((m: any) => ({
        id: `m-${m.id}`,
        role: m.role,
        content: m.content,
        attachments: m.attachments || undefined,
        timestamp: new Date(m.createdAt),
      }));
      // If this conversation already produced an intake, surface the "Open intake"
      // link on the last assistant turn so resumed history shows the action too.
      const intakeId = data.conversation.submittedIntakeId ?? null;
      if (intakeId) {
        for (let i = loaded.length - 1; i >= 0; i--) {
          if (loaded[i].role === "assistant") {
            loaded[i].intake = {
              intakeId,
              intakeNumber: "",
              requestNumber: "",
              reportName: data.conversation.title || "",
            };
            break;
          }
        }
      }
      setMessages(loaded);
      setSubmittedIntakeId(intakeId);
      setIntakeState(data.intakeState || null);
      setIsSubmitted(!!intakeId);
      // Resumed conversations land in read-only mode until the user clicks "Continue".
      setIsReadOnly(true);
    } catch {}
  }, [orgId, setModel]);

  const editIntakeField = useCallback(async (field: string, value: string | number | null) => {
    const id = conversationIdRef.current;
    if (!orgId || !id) return false;
    try {
      const r = await fetch(`/api/powerbi-agent/conversations/${id}/intake-state?organizationId=${orgId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      if (!r.ok) return false;
      const d = await r.json();
      if (d?.intakeState) setIntakeState(d.intakeState);
      return true;
    } catch {
      return false;
    }
  }, [orgId]);

  const refreshIntakeState = useCallback(async () => {
    const id = conversationIdRef.current;
    if (!orgId || !id) return;
    try {
      const r = await fetch(`/api/powerbi-agent/conversations/${id}/intake-state?organizationId=${orgId}`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const d = await r.json();
      setIntakeState(d.intakeState || null);
      setIsSubmitted(!!d.submitted);
    } catch {}
  }, [orgId]);

  const renameConversation = useCallback(async (id: number, title: string) => {
    if (!orgId) return;
    await fetch(`/api/powerbi-agent/conversations/${id}?organizationId=${orgId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    refreshConversations();
  }, [orgId, refreshConversations]);

  const deleteConversation = useCallback(async (id: number) => {
    if (!orgId) return;
    await fetch(`/api/powerbi-agent/conversations/${id}?organizationId=${orgId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (conversationIdRef.current === id) startNewConversation();
    refreshConversations();
  }, [orgId, refreshConversations, startNewConversation]);

  const uploadAttachment = useCallback(async (file: File): Promise<PowerBIAttachment | null> => {
    try {
      const r = await fetch("/api/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!r.ok) return null;
      const { uploadURL, objectPath: serverObjectPath } = await r.json();
      const put = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) return null;
      const objectPath: string = serverObjectPath || new URL(uploadURL).pathname;
      return {
        name: file.name,
        objectPath,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      };
    } catch {
      return null;
    }
  }, []);

  const sendMessage = useCallback(async (content: string, attachments?: PowerBIAttachment[]) => {
    if (!currentOrganization?.id || isLoading) return;
    if (!content.trim() && !(attachments && attachments.length)) return;

    const userMessage: PowerBIAgentMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      attachments,
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
    setIsExtracting(true);

    const allMessages = [...messagesRef.current, userMessage].slice(-40).map(m => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
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
          model,
          conversationId: conversationIdRef.current,
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
            if (data.conversationId && !conversationIdRef.current) {
              setConversationId(data.conversationId);
              conversationIdRef.current = data.conversationId;
            }
            if (data.error) {
              setMessages(prev => {
                const u = [...prev];
                const last = u[u.length - 1];
                if (last?.role === "assistant") last.content = `Error: ${data.error}`;
                return u;
              });
              break;
            }
            if (data.phase === "analyzing") {
              setMessages(prev => {
                const u = [...prev];
                const last = u[u.length - 1];
                if (last?.role === "assistant") last.phase = "analyzing";
                return u;
              });
              continue;
            }
            if (data.phase === "analyzed") {
              setMessages(prev => {
                const u = [...prev];
                const last = u[u.length - 1];
                if (last?.role === "assistant") last.phase = null;
                return u;
              });
              continue;
            }
            if (data.intake) {
              const info = data.intake as PowerBIIntakeRef;
              setMessages(prev => {
                const u = [...prev];
                const last = u[u.length - 1];
                if (last?.role === "assistant") last.intake = info;
                return u;
              });
              setSubmittedIntakeId(info.intakeId);
              setIsSubmitted(true);
              // Update conversation list so submitted state is reflected immediately.
              setConversations(prev => prev.map(c =>
                c.id === conversationIdRef.current ? { ...c, submittedIntakeId: info.intakeId } : c
              ));
            }
            if (data.intakeState) {
              setIntakeState(data.intakeState);
              setIsExtracting(false);
              if (data.intakeState.submittedRequestNumber || data.intakeState.submittedIntakeNumber) {
                setIsSubmitted(true);
              }
            }
            if (data.done) break;
            if (data.content) {
              setMessages(prev => {
                const u = [...prev];
                const last = u[u.length - 1];
                if (last?.role === "assistant") last.content += data.content;
                return u;
              });
            }
          } catch {}
        }
      }
      refreshConversations();
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages(prev => {
          const u = [...prev];
          const last = u[u.length - 1];
          if (last?.role === "assistant" && !last.content) last.content = "*(Response stopped)*";
          return u;
        });
        return;
      }
      setMessages(prev => {
        const u = [...prev];
        const last = u[u.length - 1];
        if (last?.role === "assistant" && !last.content) last.content = `Sorry, I encountered an error: ${err.message}. Please try again.`;
        return u;
      });
    } finally {
      setIsLoading(false);
      setIsExtracting(false);
      abortRef.current = null;
    }
  }, [currentOrganization?.id, isLoading, model, refreshConversations]);

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
    startNewConversation,
    stopGeneration,
    // history
    conversationId,
    conversations,
    refreshConversations,
    loadConversation,
    renameConversation,
    deleteConversation,
    // resume
    isReadOnly,
    continueConversation,
    submittedIntakeId,
    // models
    model,
    setModel,
    providers,
    // attachments
    uploadAttachment,
    // intake state
    intakeState,
    intakeFields,
    intakeSections,
    isExtracting,
    isSubmitted,
    refreshIntakeState,
    editIntakeField,
  };
}
