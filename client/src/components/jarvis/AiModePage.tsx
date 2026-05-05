import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { useJarvis, type FileAttachment } from "@/hooks/use-jarvis";
import { useSpeechRecognition } from "@/hooks/use-speech";
import { setAiMode, useAiModeEscapeHandler } from "@/hooks/use-ai-mode";
import {
  Send, Square, X, Paperclip, Mic, MicOff,
  Sparkles, Zap, Feather, ArrowRight, Plus,
} from "lucide-react";
import { ModeToggle } from "@/components/layout/ModeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { LandingFooter } from "@/components/layout/LandingFooter";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  MessageBubble,
  getSuggestedPrompts,
  OnboardingPrompts,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  CSV_CHUNK_BYTES,
  splitCsvIntoChunks,
  FILE_ACCEPT_ATTR,
  FILE_ALLOWED_EXTENSIONS,
} from "./jarvis-shared";
import { useOrgSetupStatus } from "@/hooks/use-needs-org-setup";
import { RecentChatsMenu } from "./RecentChatsMenu";
import { SavedReportsMenu } from "./SavedReportsMenu";
import AgentPicker from "./AgentPicker";
import { useActiveAgentName } from "@/hooks/use-active-agent-name";
import { useAgentSuggestedPrompts } from "@/hooks/use-agent-prompts";
import logoIcon from "@assets/image_1777744172216.png";
import logoBlack from "@assets/FridayReportAI_logo_black_1770231034490.png";
import logoWhite from "@assets/FridayReportAI_logo_white_1770231063709.png";
import FridayThinking from "./FridayThinking";

export default function AiModePage() {
  const {
    messages, isLoading, sendMessage, selectQuickReply, stopGeneration,
    conciseMode, setConciseMode, pageContext,
    conversations, activeConversationId, switchConversation, newConversation,
    startOnboardingAgent, forceOnboarding,
    activeAgentId, switchAgent,
  } = useJarvis();
  const activeAgentName = useActiveAgentName(activeAgentId);

  useAiModeEscapeHandler();

  const [input, setInput] = useState("");
  const [interimText, setInterimText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [csvChunkQueue, setCsvChunkQueue] = useState<Array<{ name: string; chunks: string[] }>>([]);
  const [micError, setMicError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chunkQueueRef = useRef<Array<{ name: string; chunks: string[] }>>([]);
  const [, setLocation] = useLocation();

  const handleNavigate = useCallback((path: string) => {
    setAiMode(false);
    setTimeout(() => setLocation(path), 100);
  }, [setLocation]);

  // When a link inside the embedded LandingFooter is clicked, exit AI mode
  // first so the destination page is actually visible (otherwise the AI Mode
  // overlay stays mounted on top of the new route). External links (target=
  // _blank) are left alone.
  const handleFooterNavCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement | null)?.closest("a");
    if (!anchor) return;
    if (anchor.target === "_blank") return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("http://") || href.startsWith("https://")) return;
    setAiMode(false);
  }, []);

  const handleVoiceResult = useCallback((transcript: string) => {
    setInterimText("");
    if (!transcript.trim()) return;
    setInput(prev => (prev ? prev + " " : "") + transcript.trim());
  }, []);

  const handleInterimResult = useCallback((transcript: string) => {
    setInterimText(transcript);
  }, []);

  const handleSpeechError = useCallback((error: string) => {
    setMicError(error);
    setTimeout(() => setMicError(null), 6000);
  }, []);

  const {
    isListening, isSupported: micSupported,
    startListening, stopListening,
  } = useSpeechRecognition({
    onResult: handleVoiceResult,
    onInterimResult: handleInterimResult,
    onError: handleSpeechError,
  });

  const handleMicToggle = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  // Auto-scroll on new messages — target the end-of-messages sentinel so the
  // detailed footer below the conversation isn't pulled into view. When the
  // conversation transitions to empty (new chat / switched to empty
  // conversation), reset the scroll container to the top so the centered
  // welcome/onboarding hero is actually visible and the footer stays below
  // the fold until the user scrolls down.
  useEffect(() => {
    if (messages.length === 0) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      return;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ block: "end" });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Autofocus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Stop listening when leaving the page
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  const processNextChunk = useCallback(() => {
    const queue = chunkQueueRef.current;
    if (queue.length === 0 || isLoading) return;
    const [item, ...rest] = queue;
    const [chunkText, ...remainingChunks] = item.chunks;
    const nextQueue = remainingChunks.length > 0 ? [{ ...item, chunks: remainingChunks }, ...rest] : rest;
    chunkQueueRef.current = nextQueue;
    setCsvChunkQueue(nextQueue);

    const chunkBytes = new Blob([chunkText]).size;
    const b64 = btoa(unescape(encodeURIComponent(chunkText)));
    const attachment: FileAttachment = {
      name: item.name,
      type: "text/csv",
      size: chunkBytes,
      content: b64,
    };
    sendMessage(`Here is the next chunk of "${item.name}". Please continue processing it the same way as before.`, [attachment]);
  }, [sendMessage, isLoading]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const isCsvExtension = /\.csv$/i;

    Array.from(files).forEach(file => {
      if (!FILE_ALLOWED_EXTENSIONS.test(file.name) && !ALLOWED_FILE_TYPES.includes(file.type)) {
        alert(`File type "${file.name}" is not supported. Please use text, CSV, JSON, PDF, or similar files.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE && isCsvExtension.test(file.name)) {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          const chunks = splitCsvIntoChunks(text, CSV_CHUNK_BYTES);
          if (chunks.length > 1) {
            setCsvChunkQueue(prev => {
              const updated = [...prev, { name: file.name, chunks: chunks.slice(1) }];
              chunkQueueRef.current = updated;
              return updated;
            });
            const firstChunk = chunks[0];
            const firstBytes = new Blob([firstChunk]).size;
            const firstB64 = btoa(unescape(encodeURIComponent(firstChunk)));
            sendMessage(
              `This CSV file ("${file.name}") is large and has been split into ${chunks.length} chunks. Here is chunk 1 of ${chunks.length}. Please parse and show a summary — I'll send the rest after confirming. Do not import yet.`,
              [{ name: file.name, type: "text/csv", size: firstBytes, content: firstB64 }],
            );
          } else {
            const b64 = btoa(unescape(encodeURIComponent(text)));
            setPendingFiles(prev => {
              if (prev.length >= 5 || prev.some(f => f.name === file.name)) return prev;
              return [...prev, { name: file.name, type: "text/csv", size: file.size, content: b64 }];
            });
          }
        };
        reader.readAsText(file);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" exceeds the 500KB limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1] || "";
        setPendingFiles(prev => {
          if (prev.length >= 5) return prev;
          if (prev.some(f => f.name === file.name)) return prev;
          return [...prev, { name: file.name, type: file.type || "application/octet-stream", size: file.size, content: base64 }];
        });
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [sendMessage]);

  // Stable callback identity so MessageBubble's memo comparator skips
  // completed bubbles while a new response streams in. Persists the
  // selection on the source assistant bubble (so the chip styles
  // survive a refresh / conversation switch) AND fires the user's
  // reply in parallel — the PATCH is fire-and-forget and the chat UX
  // shouldn't wait on it.
  const handleQuickReply = useCallback((messageId: string, text: string) => {
    void selectQuickReply(messageId, text);
    sendMessage(text);
  }, [selectQuickReply, sendMessage]);

  const removeFile = useCallback((name: string) => {
    setPendingFiles(prev => prev.filter(f => f.name !== name));
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && pendingFiles.length === 0) || isLoading) return;
    setInput("");
    const files = pendingFiles.length > 0 ? [...pendingFiles] : undefined;
    setPendingFiles([]);
    sendMessage(trimmed || "Please analyze the attached file(s).", files);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [input, pendingFiles, isLoading, sendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = useCallback(() => {
    newConversation();
    setInput("");
    setPendingFiles([]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [newConversation]);

  const handleStartOnboardingAgent = useCallback(() => {
    startOnboardingAgent();
    setInput("");
    setPendingFiles([]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [startOnboardingAgent]);

  const handleSwitchConversation = useCallback((id: number) => {
    switchConversation(id);
    setInput("");
    setPendingFiles([]);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [switchConversation]);

  // For custom agents we prefer their LLM-generated starter prompts (derived
  // from the agent's systemPrompt). Fall back to Friday's page-context prompts
  // for built-in Friday or while a new custom agent is still generating.
  const customAgentPrompts = useAgentSuggestedPrompts(activeAgentId);
  const suggestedPrompts = customAgentPrompts ?? getSuggestedPrompts(pageContext.entityType);
  const hasMessages = messages.length > 0;
  const { needsSetup: needsOrgSetup } = useOrgSetupStatus();
  const showOnboarding =
    forceOnboarding || (needsOrgSetup && pageContext.entityType === null);

  const composedTextareaValue =
    isListening && interimText
      ? input + (input ? " " : "") + interimText
      : input;

  // Composer is rendered in two places: a prominent "hero" version in the
  // middle of the welcome screen (no messages yet), and a compact sticky
  // bar at the bottom once a chat is in progress. Same controls, different
  // emphasis.
  const renderComposer = (hero: boolean) => (
    <div className={cn("w-full mx-auto", hero ? "max-w-2xl" : "max-w-3xl px-4 md:px-6 py-3")}>
      <input
        ref={hero ? undefined : fileInputRef}
        type="file"
        multiple
        accept={FILE_ACCEPT_ATTR}
        onChange={handleFileSelect}
        className="hidden"
      />

      <AnimatePresence>
        {csvChunkQueue.length > 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 p-2 rounded border border-border bg-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3 inline mr-1" />
                {csvChunkQueue[0]?.name} — {csvChunkQueue[0]?.chunks.length} chunk{csvChunkQueue[0]?.chunks.length !== 1 ? "s" : ""} remaining
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={processNextChunk}
              >
                Send next chunk
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex flex-wrap gap-1.5"
          >
            {pendingFiles.map(f => (
              <span
                key={f.name}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-muted text-foreground border border-border"
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[180px] truncate">{f.name}</span>
                <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)}KB)</span>
                <button
                  onClick={() => removeFile(f.name)}
                  className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {micError && (
        <div className="mb-2 text-xs text-destructive text-center px-3 py-1.5 rounded bg-destructive/10 border border-destructive/30">
          {micError}
        </div>
      )}

      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl bg-card dark:bg-slate-800 transition-all",
          hero
            ? "px-3 py-2.5 border-2 border-primary/40 dark:border-primary/50 shadow-2xl shadow-primary/10 dark:shadow-primary/20 ring-4 ring-primary/10 dark:ring-primary/15 focus-within:border-primary/70 focus-within:ring-primary/25 dark:focus-within:ring-primary/30"
            : "px-2 py-1.5 border border-border dark:border-slate-600 shadow-sm focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 dark:focus-within:border-primary/60 dark:focus-within:ring-primary/30"
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={pendingFiles.length >= 5}
              className={cn(
                "rounded-full text-muted-foreground hover:text-foreground flex-shrink-0",
                hero ? "h-10 w-10" : "h-9 w-9"
              )}
              aria-label="Attach files"
              data-testid={hero ? "button-ai-attach-hero" : "button-ai-attach"}
            >
              <Paperclip className={hero ? "h-5 w-5" : "h-4 w-4"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Attach files (max 5, 500KB each)</p>
          </TooltipContent>
        </Tooltip>

        {micSupported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleMicToggle}
                className={cn(
                  "rounded-full flex-shrink-0 transition-colors",
                  hero ? "h-10 w-10" : "h-9 w-9",
                  isListening
                    ? "bg-destructive/15 text-destructive hover:bg-destructive/25 ring-2 ring-destructive/40"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-label={isListening ? "Stop dictation" : "Dictate"}
                data-testid={hero ? "button-ai-mic-hero" : "button-ai-mic"}
              >
                {isListening
                  ? <MicOff className={hero ? "h-5 w-5" : "h-4 w-4"} />
                  : <Mic className={hero ? "h-5 w-5" : "h-4 w-4"} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{isListening ? "Stop dictation" : "Dictate (push to talk)"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        <Textarea
          ref={hero ? undefined : textareaRef}
          value={composedTextareaValue}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isListening
              ? "Listening... speak now"
              : (pageContext.entityType
                ? `Ask about this ${pageContext.entityType}...`
                : hero
                  ? "Ask Friday anything — type a question, paste data, or drop a file…"
                  : "Message Friday…")
          }
          className={cn(
            "flex-1 resize-y border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none",
            hero
              ? "min-h-[140px] max-h-[360px] px-3 py-3 text-base placeholder:text-muted-foreground/80"
              : "min-h-[96px] max-h-[320px] px-2 py-2 text-sm"
          )}
          rows={hero ? 5 : 4}
          disabled={isListening}
          data-testid={hero ? "input-ai-message-hero" : "input-ai-message"}
          autoFocus={hero}
        />

        {isLoading ? (
          <Button
            size="icon"
            onClick={stopGeneration}
            className={cn(
              "rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 flex-shrink-0",
              hero ? "h-11 w-11" : "h-9 w-9"
            )}
            title="Stop response"
            data-testid={hero ? "button-ai-stop-hero" : "button-ai-stop"}
          >
            <Square className={hero ? "h-5 w-5" : "h-4 w-4"} />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!input.trim() && pendingFiles.length === 0) || isListening}
            className={cn(
              "rounded-full flex-shrink-0 shadow-md",
              hero ? "h-11 w-11" : "h-9 w-9"
            )}
            aria-label="Send message"
            data-testid={hero ? "button-ai-send-hero" : "button-ai-send"}
          >
            <Send className={hero ? "h-5 w-5" : "h-4 w-4"} />
          </Button>
        )}
      </div>

      <p className={cn(
        "text-muted-foreground dark:text-slate-400 text-center tracking-wide",
        hero ? "mt-3 text-[11px]" : "mt-2 text-[10px]"
      )}>
        AI-generated. Press <kbd className="px-1 py-0.5 rounded border border-border dark:border-slate-600 bg-muted dark:bg-slate-700 dark:text-slate-200 text-[10px]">Esc</kbd> to exit AI Mode.
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background dark:bg-slate-950">
      {/* Slim header */}
      <header className="flex h-12 items-center justify-between border-b border-border dark:border-slate-700 bg-background/95 dark:bg-slate-900/95 px-3 md:px-4 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,200,255,0.6)] flex-shrink-0" />
          <AgentPicker
            activeAgentId={activeAgentId}
            onSelect={switchAgent}
            variant="page"
            onStartOnboarding={handleStartOnboardingAgent}
            onboardingActive={showOnboarding && activeAgentId === null}
          />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <div
            role="group"
            aria-label="Response mode"
            className="inline-flex items-center h-8 p-0.5 rounded-full bg-muted border border-border"
            data-testid="button-ai-concise-toggle"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={conciseMode}
                  aria-label="Use Lite response mode"
                  onClick={() => setConciseMode(true)}
                  className={cn(
                    "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                    conciseMode
                      ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.55)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="button-ai-mode-light"
                >
                  <Feather className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Lite</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px]">
                <p className="text-xs leading-relaxed">
                  Lite — short, fast replies. Same per-round credit cost as Power, but Lite tends to use fewer credits per conversation because it does less work.
                </p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={!conciseMode}
                  aria-label="Use Power response mode"
                  onClick={() => setConciseMode(false)}
                  className={cn(
                    "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                    !conciseMode
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-[0_0_12px_rgba(249,115,22,0.6)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="button-ai-mode-power"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Power</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[260px]">
                <p className="text-xs leading-relaxed">
                  Power — detailed, thorough replies. Same per-round credit cost as Lite, but Power tends to use more credits per conversation because it does more work.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewChat}
                className="h-8 px-2 gap-1"
                data-testid="button-ai-new-chat"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="text-xs">New</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Start a new conversation</p>
            </TooltipContent>
          </Tooltip>
          <RecentChatsMenu
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSwitch={handleSwitchConversation}
            onNew={handleNewChat}
            align="end"
            alwaysVisibleLabel="Conversation History"
          />
          <SavedReportsMenu align="end" alwaysVisibleLabel="Saved" />
          <ModeToggle />
          <ThemeToggle />
          <UserMenu exitAiModeOnNavigate />
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
              {/* Eyebrow, headline, and subtitle are derived once so every
                  agent in AgentPicker (built-in Friday, the Onboarding agent,
                  and any custom agent) gets the same hero shell. The eyebrow
                  shows the agent's full name; the headline strips a trailing
                  " Agent" so it reads naturally ("How can Friday help…" vs
                  "How can Friday Agent help…"). The Onboarding agent gets a
                  setup-themed headline + subtitle and shows the industry/goal
                  cards in place of the suggested-prompts grid below. */}
              {(() => {
                const eyebrowText = showOnboarding ? "Onboarding Agent" : activeAgentName;
                const headlineName =
                  (showOnboarding ? "Friday" : activeAgentName)
                    .replace(/\s+Agent$/i, "")
                    .trim() || "Friday";
                const headline = showOnboarding
                  ? "Welcome — let's set up your workspace"
                  : `How can ${headlineName} help today?`;
                const subtitle = showOnboarding
                  ? "Pick a focus that fits your work and I'll seed portfolios, projects, milestones, risks, and starter resources tuned to it."
                  : "Ask anything about your portfolios, projects, risks, or resources.";
                return (
                  <>
                    <p
                      className="text-xs font-semibold tracking-[0.25em] text-primary uppercase mb-2"
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                      data-testid="text-ai-active-agent"
                    >
                      {eyebrowText}
                    </p>
                    <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground dark:text-white mb-2">
                      {headline}
                    </h1>
                    <p className="text-sm text-muted-foreground dark:text-slate-300 mb-6">
                      {subtitle}
                    </p>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                      className="mb-8"
                    >
                      {renderComposer(true)}
                    </motion.div>
                    {showOnboarding ? (
                      <OnboardingPrompts
                        variant="page"
                        hideGreeting
                        onPick={(message) => sendMessage(message)}
                      />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {suggestedPrompts.map((prompt, idx) => (
                          <motion.button
                            key={prompt}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.2 + idx * 0.05 }}
                            onClick={() => sendMessage(prompt)}
                            className="group flex items-start gap-3 text-left p-4 rounded-xl border border-border dark:border-slate-700 bg-card dark:bg-slate-900 hover:bg-accent hover:border-primary/40 dark:hover:bg-slate-800 dark:hover:border-primary/60 transition-all shadow-sm dark:shadow-none"
                            data-testid={`button-ai-suggested-${idx}`}
                          >
                            <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground dark:text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                            <span className="text-sm text-foreground dark:text-slate-100">{prompt}</span>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </div>
        ) : (
          <div className="min-h-full w-full max-w-3xl mx-auto px-4 md:px-6 pt-6 pb-32">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                index={i}
                onNavigate={handleNavigate}
                variant="page"
                onQuickReply={handleQuickReply}
              />
            ))}
            {isLoading && (() => {
              const last = messages[messages.length - 1];
              const noTokensYet = !last || last.role === "user" || (last.role === "assistant" && !last.content);
              if (!noTokensYet) return null;
              return (
                <div className="flex items-center gap-2 py-3 px-1" data-testid="friday-thinking">
                  <FridayThinking className="h-10 w-10" size={40} />
                  <span className="text-xs text-muted-foreground">{activeAgentName} is working on it like there is no tomorrow...</span>
                </div>
              );
            })()}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
        )}
        {/* Composer — sticky to viewport bottom while in chat; the welcome
            screen renders its own larger "hero" version inline above. */}
        {hasMessages && (
          <div className="sticky bottom-0 z-10 border-t border-border dark:border-slate-700 bg-background/95 dark:bg-slate-900/95 backdrop-blur-sm">
            {renderComposer(false)}
          </div>
        )}
        <div onClickCapture={handleFooterNavCapture}>
          <LandingFooter />
        </div>
      </div>
    </div>
  );
}
