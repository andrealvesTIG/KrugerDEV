import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Square, Lock, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/hooks/use-auth";
import { setAiMode } from "@/hooks/use-ai-mode";
import {
  MessageBubble,
  OnboardingPrompts,
} from "@/components/jarvis/jarvis-shared";
import type { JarvisMessage } from "@/hooks/use-jarvis";
import FridayThinking from "@/components/jarvis/FridayThinking";
import { LandingFooter } from "@/components/layout/LandingFooter";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import logoWhite from "@assets/FridayReportAI_logo_white_1770231063709.png";

// Persistent guest session id. Created once on first visit so the
// 2-question cap survives page reloads (and so the post-signin handoff
// can find the right guest row to adopt). UUID without dashes keeps it
// inside the [A-Za-z0-9_-]{8,64} regex the server enforces.
const GUEST_SESSION_KEY = "friday_guest_session_id";
const PENDING_QUESTION_KEY = "friday_pending_user_message";
const PENDING_ADOPT_KEY = "friday_pending_guest_adopt";

function loadGuestSessionId(): string {
  try {
    const existing = localStorage.getItem(GUEST_SESSION_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  } catch {
    // ignore
  }
  // crypto.randomUUID is available in every browser this app supports
  // (the rest of the codebase already relies on it). Strip dashes so the
  // value matches the server-side regex without conversion.
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `guest-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  ).replace(/-/g, "");
  try {
    localStorage.setItem(GUEST_SESSION_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

function clearGuestSession(): void {
  try {
    localStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    // ignore
  }
}

const QUESTION_LIMIT = 2;

interface AdoptResponse {
  adopted: boolean;
  conversationId: number | null;
  organizationId: number | null;
  pendingQuestion: string | null;
}

// Shape of the SSE frames the guest chat endpoint emits. All fields are
// optional because each frame typically carries only one of:
//   - `content` (a streamed model token)
//   - `done` + counters (final frame after a successful stream)
//   - `error` (hard failure mid-stream)
// The first frame also includes the session counters to keep the UI
// in sync with the server-side cap.
interface GuestSsePayload {
  content?: string;
  done?: boolean;
  error?: string;
  guestSessionId?: string;
  questionsUsed?: number;
  questionLimit?: number;
  questionsRemaining?: number;
}

export default function PublicAiModePage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // ---------------------------- post-signin adoption hand-off
  // When a logged-in user lands on /ai (most often after the signin
  // redirect), migrate any local guest transcript into a real Friday
  // conversation server-side, stash the pending 3rd question for the
  // chat surface to auto-send, and bounce them into the authenticated
  // app. We skip the public UI entirely in that case.
  const [adopting, setAdopting] = useState(false);
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    let cancelled = false;
    let guestSessionId: string | null = null;
    try {
      guestSessionId = localStorage.getItem(GUEST_SESSION_KEY);
    } catch {
      guestSessionId = null;
    }
    // The user explicitly came to /ai — they expect to land in the
    // chat surface, not the dashboard. Flip AI Mode on for every
    // authenticated /ai visit, regardless of whether there is a
    // guest transcript to adopt.
    setAiMode(true);
    if (!guestSessionId) {
      setLocation("/");
      return;
    }
    setAdopting(true);
    (async () => {
      try {
        const res = await fetch("/api/jarvis/guest/adopt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ guestSessionId }),
        });
        const data: AdoptResponse = res.ok
          ? await res.json()
          : { adopted: false, conversationId: null, organizationId: null, pendingQuestion: null };

        if (data.adopted && data.conversationId && data.organizationId) {
          try {
            // Match the key format used by useJarvis so the migrated
            // conversation is the active one when the chat hook mounts.
            sessionStorage.setItem(
              `friday_active_conversation_${data.organizationId}_friday`,
              String(data.conversationId),
            );
          } catch {
            // ignore
          }
          if (data.pendingQuestion) {
            try {
              sessionStorage.setItem(PENDING_QUESTION_KEY, data.pendingQuestion);
            } catch {
              // ignore
            }
          }
          // AI Mode was already forced on above for every /ai visit;
          // the post-adopt flag tells AiModePage that any pending
          // sessionStorage question is the one we just adopted.
          try {
            sessionStorage.setItem(PENDING_ADOPT_KEY, "1");
          } catch {
            // ignore
          }
          trackEvent("guest_conversation_adopted", "friday-public", "success");
        }
        // Clear the guest session id either way: success means it's
        // been claimed; failure means we should let the user start
        // fresh rather than retry against a broken session.
        clearGuestSession();
        if (!cancelled) setLocation("/");
      } catch {
        // Network/auth failures shouldn't trap the user on /ai. AI
        // Mode was already forced on above; just bounce home and let
        // the normal hooks take over.
        clearGuestSession();
        if (!cancelled) setLocation("/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, setLocation]);

  // ------------------------------ guest chat state
  const [messages, setMessages] = useState<JarvisMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const [showLoginWall, setShowLoginWall] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const guestSessionIdRef = useRef<string>("");

  // Land event + lazy session id init. Skipped when the user is logged
  // in (we're going to redirect them through the adoption flow above).
  useEffect(() => {
    if (authLoading || user) return;
    guestSessionIdRef.current = loadGuestSessionId();
    trackEvent("guest_landed", "friday-public");
  }, [authLoading, user]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (messages.length === 0) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isLoading]);

  // Stop any in-flight request on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const remaining = Math.max(0, QUESTION_LIMIT - questionsUsed);

  const goToAuth = useCallback(
    (mode: "login" | "register") => {
      const ret = encodeURIComponent("/ai");
      const path =
        mode === "register"
          ? `/auth?mode=register&return=${ret}`
          : `/auth?return=${ret}`;
      setLocation(path);
    },
    [setLocation],
  );

  const openLoginWall = useCallback(
    (pendingQuestion: string | null) => {
      if (pendingQuestion) {
        try {
          sessionStorage.setItem(PENDING_QUESTION_KEY, pendingQuestion);
        } catch {
          // ignore
        }
      }
      setShowLoginWall(true);
      trackEvent("guest_login_wall_shown", "friday-public", pendingQuestion ? "with_pending" : "no_pending");
    },
    [],
  );

  // Streams a single assistant turn from the public guest endpoint and
  // appends it to the local transcript. The endpoint enforces the
  // 2-question cap server-side; on the cap we surface the login wall.
  const sendGuestMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoading) return;

      // Hard guard before any network call: if the user already used
      // both free questions, the next ask is the login-wall trigger.
      if (questionsUsed >= QUESTION_LIMIT) {
        openLoginWall(trimmed);
        return;
      }

      const userMsg: JarvisMessage = {
        id: `guest-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };
      const assistantMsg: JarvisMessage = {
        id: `guest-assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setErrorBanner(null);
      setInput("");

      // Build the history payload — last few turns plus this one, all in
      // the simple {role, content} shape the server expects. Cap to 10
      // entries to match server-side validation.
      const history = [...messages, userMsg]
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      trackEvent("guest_question_sent", "friday-public", `q${questionsUsed + 1}`);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/jarvis/guest/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestSessionId: guestSessionIdRef.current,
            messages: history,
          }),
          signal: controller.signal,
        });

        if (res.status === 402) {
          // Cap reached — server stashed the pending question already.
          // Roll back the optimistic bubbles and open the login wall.
          setMessages((prev) => prev.slice(0, -2));
          setQuestionsUsed(QUESTION_LIMIT);
          openLoginWall(trimmed);
          return;
        }
        if (res.status === 410) {
          setMessages((prev) => prev.slice(0, -2));
          setErrorBanner("This guest session has been transferred to an account. Please sign in.");
          return;
        }
        if (!res.ok) {
          let msg = "Friday couldn't reply just now. Please try again.";
          try {
            const j = await res.json();
            if (j?.message) msg = j.message;
          } catch {
            // ignore
          }
          setMessages((prev) => prev.slice(0, -2));
          setErrorBanner(msg);
          return;
        }

        // Parse the SSE stream by hand — it's tiny and avoids pulling
        // in eventsource just for the public preview.
        const reader = res.body?.getReader();
        if (!reader) {
          setErrorBanner("Friday couldn't reply just now. Please try again.");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const json = dataLine.slice(5).trim();
            if (!json) continue;
            let payload: GuestSsePayload;
            try {
              payload = JSON.parse(json) as GuestSsePayload;
            } catch {
              continue;
            }
            if (payload.error) {
              setErrorBanner(String(payload.error));
              continue;
            }
            if (typeof payload.content === "string") {
              assistantText += payload.content;
              setMessages((prev) => {
                const next = prev.slice();
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { ...last, content: assistantText };
                }
                return next;
              });
            }
            if (typeof payload.questionsUsed === "number") {
              setQuestionsUsed(payload.questionsUsed);
            }
            if (payload.done) {
              if (typeof payload.questionsUsed === "number" && payload.questionsUsed >= QUESTION_LIMIT) {
                // Cap reached on the way out — keep the reply visible
                // but require the login wall on the next interaction.
                trackEvent("guest_cap_reached", "friday-public");
              }
            }
          }
        }
      } catch (err) {
        if ((err as DOMException)?.name !== "AbortError") {
          setErrorBanner("Friday couldn't reply just now. Please try again.");
          setMessages((prev) => prev.slice(0, -1)); // drop empty assistant bubble
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    },
    [messages, questionsUsed, isLoading, openLoginWall],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    void sendGuestMessage(trimmed);
  }, [input, sendGuestMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const hasMessages = messages.length > 0;

  // ---------------------------- render guards
  if (authLoading || adopting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <FridayThinking className="h-8 w-8" size={32} />
          <span className="text-sm">Just a moment…</span>
        </div>
      </div>
    );
  }
  if (user) {
    // The adoption useEffect above will redirect us. This branch only
    // renders for the brief instant before that fires.
    return null;
  }

  const composer = (hero: boolean) => (
    <div className={cn("w-full mx-auto", hero ? "max-w-2xl" : "max-w-3xl px-4 md:px-6 py-3")}>
      {errorBanner && (
        <div className="mb-2 text-xs text-destructive text-center px-3 py-1.5 rounded bg-destructive/10 border border-destructive/30">
          {errorBanner}
        </div>
      )}
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl bg-card dark:bg-slate-800 transition-all",
          hero
            ? "px-3 py-2.5 border-2 border-primary/40 dark:border-primary/50 shadow-2xl shadow-primary/10 dark:shadow-primary/20 ring-4 ring-primary/10 dark:ring-primary/15 focus-within:border-primary/70 focus-within:ring-primary/25"
            : "px-2 py-1.5 border border-border dark:border-slate-600 shadow-sm focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20",
        )}
      >
        <Textarea
          ref={hero ? undefined : textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            remaining > 0
              ? hero
                ? "Try Friday — type a project management question to get started…"
                : "Message Friday…"
              : "Sign in to keep chatting with Friday."
          }
          className={cn(
            "flex-1 resize-y border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none",
            hero
              ? "min-h-[140px] max-h-[360px] px-3 py-3 text-base placeholder:text-muted-foreground/80"
              : "min-h-[96px] max-h-[320px] px-2 py-2 text-sm",
          )}
          rows={hero ? 5 : 4}
          data-testid={hero ? "input-public-ai-hero" : "input-public-ai"}
          autoFocus={hero}
        />
        {isLoading ? (
          <Button
            size="icon"
            onClick={stopGeneration}
            className={cn(
              "rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 flex-shrink-0",
              hero ? "h-11 w-11" : "h-9 w-9",
            )}
            aria-label="Stop response"
            data-testid="button-public-ai-stop"
          >
            <Square className={hero ? "h-5 w-5" : "h-4 w-4"} />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim()}
            className={cn(
              "rounded-full flex-shrink-0 shadow-md",
              hero ? "h-11 w-11" : "h-9 w-9",
            )}
            aria-label="Send message"
            data-testid="button-public-ai-send"
          >
            <Send className={hero ? "h-5 w-5" : "h-4 w-4"} />
          </Button>
        )}
      </div>
      <p
        className={cn(
          "text-muted-foreground dark:text-slate-400 text-center tracking-wide",
          hero ? "mt-3 text-[11px]" : "mt-2 text-[10px]",
        )}
      >
        Free preview — {remaining} of {QUESTION_LIMIT} questions left.{" "}
        {remaining === 0 && (
          <button
            type="button"
            onClick={() => openLoginWall(input.trim() || null)}
            className="underline hover:text-foreground"
            data-testid="link-public-ai-signin-inline"
          >
            Sign in to keep going.
          </button>
        )}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background dark:bg-slate-950">
      <Helmet>
        <title>Try Friday AI — Free Project Management Assistant | FridayReport.AI</title>
        <meta
          name="description"
          content="Try Friday, FridayReport.AI's AI assistant for project portfolio management — free, no sign-up required for the first 2 questions. Get help with risks, schedules, status reports, and more."
        />
        <meta property="og:title" content="Try Friday AI — Free Project Management Assistant" />
        <meta
          property="og:description"
          content="Ask Friday anything about projects, portfolios, risks, or resources. Free preview — 2 questions, no sign-up."
        />
        <link rel="canonical" href="https://fridayreport.ai/ai" />
      </Helmet>

      {/* Slim public header */}
      <header className="flex h-12 items-center justify-between border-b border-border dark:border-slate-700 bg-background/95 dark:bg-slate-900/95 px-3 md:px-4 backdrop-blur-sm flex-shrink-0">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 min-w-0"
          aria-label="FridayReport.AI home"
          data-testid="button-public-ai-home"
        >
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,200,255,0.6)] flex-shrink-0" />
          <img
            src={logoBlack}
            alt="FridayReport.AI"
            className="block dark:hidden h-6 w-auto object-contain"
          />
          <img
            src={logoWhite}
            alt="FridayReport.AI"
            className="hidden dark:block h-6 w-auto object-contain"
          />
        </button>
        <div className="flex items-center gap-1 sm:gap-2">
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30"
            data-testid="badge-public-ai-preview"
          >
            <Sparkles className="h-3 w-3" /> Free preview
          </span>
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToAuth("login")}
            className="h-8 px-3 text-xs"
            data-testid="button-public-ai-signin"
          >
            Sign in
          </Button>
          <Button
            size="sm"
            onClick={() => goToAuth("register")}
            className="h-8 px-3 text-xs"
            data-testid="button-public-ai-signup"
          >
            Sign up
          </Button>
        </div>
      </header>

      {/* Conversation surface */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-2xl mx-auto text-center"
            >
              <div className="flex items-center justify-center mb-6">
                <img
                  src={logoBlack}
                  alt="FridayReport.AI"
                  className="block dark:hidden h-14 md:h-16 w-auto max-w-full object-contain mx-auto"
                />
                <img
                  src={logoWhite}
                  alt="FridayReport.AI"
                  className="hidden dark:block h-14 md:h-16 w-auto max-w-full object-contain mx-auto"
                />
              </div>
              <p
                className="text-xs font-semibold tracking-[0.25em] text-primary uppercase mb-2"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Onboarding Agent — free preview
              </p>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground dark:text-white mb-2">
                Welcome — let's see how Friday can help
              </h1>
              <p className="text-sm text-muted-foreground dark:text-slate-300 mb-6">
                FridayReport.AI is built for capital projects, project controls, industrial automation, and construction. Pick the focus that fits your work — or ask Friday anything. {QUESTION_LIMIT} free questions, no sign-up required.
              </p>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mb-8"
              >
                {composer(true)}
              </motion.div>
              <OnboardingPrompts
                variant="page"
                hideGreeting
                onPick={(message) => sendGuestMessage(message)}
              />
            </motion.div>
          </div>
        ) : (
          <div className="min-h-full w-full max-w-3xl mx-auto px-4 md:px-6 pt-6 pb-32">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                index={i}
                variant="page"
              />
            ))}
            {isLoading && (() => {
              const last = messages[messages.length - 1];
              const noTokensYet = !last || last.role === "user" || (last.role === "assistant" && !last.content);
              if (!noTokensYet) return null;
              return (
                <div className="flex items-center gap-2 py-3 px-1" data-testid="public-ai-thinking">
                  <FridayThinking className="h-10 w-10" size={40} />
                  <span className="text-xs text-muted-foreground">Friday is working on it…</span>
                </div>
              );
            })()}
            {/* In-conversation sign-in / sign-up CTA. Appears once the
                user has spent both free questions and the assistant has
                finished streaming, so the next step is visible in the
                transcript itself rather than buried in a placeholder or
                gated behind clicking Send a 3rd time. The login-wall
                dialog still fires if they try to send anyway. */}
            {remaining === 0 && !isLoading && (
              <div
                className="my-4 rounded-2xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 md:p-5"
                data-testid="card-public-ai-inline-cta"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Lock className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground dark:text-white mb-1">
                      You've used your {QUESTION_LIMIT} free questions
                    </h3>
                    <p className="text-xs text-muted-foreground dark:text-slate-300 mb-3 leading-relaxed">
                      Sign in or create a free account to keep chatting. Your conversation so far will be saved and Friday will pick up exactly where you left off.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          trackEvent("guest_converted", "friday-public", "signup_inline");
                          goToAuth("register");
                        }}
                        className="w-full sm:flex-1"
                        data-testid="button-public-ai-inline-signup"
                      >
                        Create free account
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          trackEvent("guest_converted", "friday-public", "signin_inline");
                          goToAuth("login");
                        }}
                        className="w-full sm:flex-1"
                        data-testid="button-public-ai-inline-signin"
                      >
                        Sign in
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        )}

        {hasMessages && (
          <div className="sticky bottom-0 z-10 border-t border-border dark:border-slate-700 bg-background/95 dark:bg-slate-900/95 backdrop-blur-sm">
            {composer(false)}
          </div>
        )}
        <LandingFooter />
      </div>

      {/* Login wall — fired when the user tries to ask a 3rd question. */}
      <AnimatePresence>
        {showLoginWall && (
          <Dialog open={showLoginWall} onOpenChange={setShowLoginWall}>
            <DialogContent className="sm:max-w-md" data-testid="dialog-public-ai-login-wall">
              <DialogHeader>
                <div className="flex items-center justify-center mb-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <DialogTitle className="text-center">You've used your {QUESTION_LIMIT} free questions</DialogTitle>
                <DialogDescription className="text-center">
                  Sign in or create a free account to keep chatting with Friday. Your conversation so far will be saved to your account, and Friday will pick up exactly where you left off.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setShowLoginWall(false)}
                  data-testid="button-public-ai-wall-dismiss"
                >
                  <X className="h-4 w-4 mr-1" /> Not now
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:flex-1"
                  onClick={() => {
                    trackEvent("guest_converted", "friday-public", "signin");
                    goToAuth("login");
                  }}
                  data-testid="button-public-ai-wall-signin"
                >
                  Sign in
                </Button>
                <Button
                  className="w-full sm:flex-1"
                  onClick={() => {
                    trackEvent("guest_converted", "friday-public", "signup");
                    goToAuth("register");
                  }}
                  data-testid="button-public-ai-wall-signup"
                >
                  Create free account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
