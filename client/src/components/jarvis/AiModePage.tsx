import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { useJarvis, type FileAttachment } from "@/hooks/use-jarvis";
import { useSpeechRecognition } from "@/hooks/use-speech";
import { setAiMode, useAiModeEscapeHandler } from "@/hooks/use-ai-mode";
import {
  Send, Square, X, Paperclip, Mic, MicOff,
  Sparkles, Zap, Feather, ArrowRight, Plus, Compass,
} from "lucide-react";
import { ModeToggle } from "@/components/layout/ModeToggle";
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
import AgentPicker from "./AgentPicker";
import logoIcon from "@assets/image_1777744172216.png";
import ThemedGif from "@/components/ui/themed-gif";
import running_man from "@assets/runcycle18_1772300373437.gif";

export default function AiModePage() {
  const {
    messages, isLoading, sendMessage, stopGeneration,
    conciseMode, setConciseMode, pageContext,
    conversations, activeConversationId, switchConversation, newConversation,
    startOnboardingAgent, forceOnboarding,
    activeAgentId, switchAgent,
  } = useJarvis();

  useAiModeEscapeHandler();

  const [input, setInput] = useState("");
  const [interimText, setInterimText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const [csvChunkQueue, setCsvChunkQueue] = useState<Array<{ name: string; chunks: string[] }>>([]);
  const [micError, setMicError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chunkQueueRef = useRef<Array<{ name: string; chunks: string[] }>>([]);
  const [, setLocation] = useLocation();

  const handleNavigate = useCallback((path: string) => {
    setAiMode(false);
    setTimeout(() => setLocation(path), 100);
  }, [setLocation]);

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

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
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

  const suggestedPrompts = getSuggestedPrompts(pageContext.entityType);
  const hasMessages = messages.length > 0;
  const { needsSetup: needsOrgSetup } = useOrgSetupStatus();
  const showOnboarding =
    forceOnboarding || (needsOrgSetup && pageContext.entityType === null);

  const composedTextareaValue =
    isListening && interimText
      ? input + (input ? " " : "") + interimText
      : input;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background dark:bg-slate-950">
      {/* Slim header */}
      <header className="flex h-12 items-center justify-between border-b border-border dark:border-slate-700 bg-background/95 dark:bg-slate-900/95 px-3 md:px-4 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,200,255,0.6)] flex-shrink-0" />
          <span
            className="text-sm font-semibold text-cyan-600 dark:text-cyan-300 tracking-wide"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Friday Agent
          </span>
          <AgentPicker activeAgentId={activeAgentId} onSelect={switchAgent} variant="page" />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                role="radiogroup"
                aria-label="Response mode"
                className="inline-flex items-center h-8 p-0.5 rounded-full bg-muted border border-border"
                data-testid="button-ai-concise-toggle"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={conciseMode}
                  onClick={() => setConciseMode(true)}
                  className={cn(
                    "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold transition-all",
                    conciseMode
                      ? "bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.55)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="button-ai-mode-light"
                >
                  <Feather className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Light</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!conciseMode}
                  onClick={() => setConciseMode(false)}
                  className={cn(
                    "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold transition-all",
                    !conciseMode
                      ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-[0_0_12px_rgba(249,115,22,0.6)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="button-ai-mode-power"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Power</span>
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">
                {conciseMode
                  ? "Light Mode — short, fast replies"
                  : "Power Mode — detailed, thorough replies"}
              </p>
            </TooltipContent>
          </Tooltip>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartOnboardingAgent}
                className={cn(
                  "h-8 px-2 gap-1 border-primary/30 hover:bg-primary/10",
                  forceOnboarding && "bg-primary/10 border-primary/50 text-primary",
                )}
                data-testid="button-ai-onboarding-agent"
              >
                <Compass className="h-3.5 w-3.5" />
                <span className="text-xs hidden sm:inline">Onboarding agent</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Launch the onboarding agent to set up your workspace</p>
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
          <ModeToggle />
          <ThemeToggle />
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
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-border dark:ring-slate-700 mb-5 shadow-sm">
                <img
                  src={logoIcon}
                  alt="FridayReport.AI"
                  className="h-11 w-11 object-contain"
                />
              </div>
              <p
                className="text-xs font-semibold tracking-[0.25em] text-primary uppercase mb-2"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Friday Agent
              </p>
              {showOnboarding ? (
                <OnboardingPrompts
                  variant="page"
                  onPick={(message) => sendMessage(message)}
                />
              ) : (
                <>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground dark:text-white mb-2">
                    How can Friday help today?
                  </h1>
                  <p className="text-sm text-muted-foreground dark:text-slate-300 mb-8">
                    Ask anything about your portfolios, projects, risks, or resources.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {suggestedPrompts.map((prompt, idx) => (
                      <motion.button
                        key={prompt}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 + idx * 0.05 }}
                        onClick={() => sendMessage(prompt)}
                        className="group flex items-start gap-3 text-left p-4 rounded-xl border border-border dark:border-slate-700 bg-card dark:bg-slate-900 hover:bg-accent hover:border-primary/40 dark:hover:bg-slate-800 dark:hover:border-primary/60 transition-all shadow-sm dark:shadow-none"
                        data-testid={`button-ai-suggested-${idx}`}
                      >
                        <ArrowRight className="h-4 w-4 mt-0.5 text-muted-foreground dark:text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                        <span className="text-sm text-foreground dark:text-slate-100">{prompt}</span>
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-6">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                index={i}
                onNavigate={handleNavigate}
                variant="page"
              />
            ))}
            {isLoading && (() => {
              const last = messages[messages.length - 1];
              const noTokensYet = !last || last.role === "user" || (last.role === "assistant" && !last.content);
              if (!noTokensYet) return null;
              return (
                <div className="flex items-center gap-2 py-3 px-1" data-testid="friday-thinking">
                  <ThemedGif src={running_man} alt="Running" className="h-10 w-10 object-contain" />
                  <span className="text-xs text-muted-foreground">Friday Agent is thinking like there is no tomorow...</span>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-border dark:border-slate-700 bg-background/95 dark:bg-slate-900/95 backdrop-blur-sm">
        <div className="w-full max-w-3xl mx-auto px-4 md:px-6 py-3">
          <input
            ref={fileInputRef}
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

          <div className="flex items-end gap-2 rounded-2xl border border-border dark:border-slate-600 bg-card dark:bg-slate-800 px-2 py-1.5 shadow-sm focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 dark:focus-within:border-primary/60 dark:focus-within:ring-primary/30 transition-all">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pendingFiles.length >= 5}
                  className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground flex-shrink-0"
                  aria-label="Attach files"
                  data-testid="button-ai-attach"
                >
                  <Paperclip className="h-4 w-4" />
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
                      "h-9 w-9 rounded-full flex-shrink-0 transition-colors",
                      isListening
                        ? "bg-destructive/15 text-destructive hover:bg-destructive/25 ring-2 ring-destructive/40"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label={isListening ? "Stop dictation" : "Dictate"}
                    data-testid="button-ai-mic"
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{isListening ? "Stop dictation" : "Dictate (push to talk)"}</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Textarea
              ref={textareaRef}
              value={composedTextareaValue}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? "Listening... speak now"
                  : (pageContext.entityType
                    ? `Ask about this ${pageContext.entityType}...`
                    : "Message Friday…")
              }
              className="flex-1 min-h-[40px] max-h-[200px] resize-none border-0 bg-transparent px-2 py-2 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
              rows={1}
              disabled={isListening}
              data-testid="input-ai-message"
            />

            {isLoading ? (
              <Button
                size="icon"
                onClick={stopGeneration}
                className="h-9 w-9 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 flex-shrink-0"
                title="Stop response"
                data-testid="button-ai-stop"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={(!input.trim() && pendingFiles.length === 0) || isListening}
                className="h-9 w-9 rounded-full flex-shrink-0"
                aria-label="Send message"
                data-testid="button-ai-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>

          <p className="mt-2 text-[10px] text-muted-foreground dark:text-slate-400 text-center tracking-wide">
            AI-generated. Press <kbd className="px-1 py-0.5 rounded border border-border dark:border-slate-600 bg-muted dark:bg-slate-700 dark:text-slate-200 text-[10px]">Esc</kbd> to exit AI Mode.
          </p>

          <div className="mt-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4">
            <p className="text-[10px] text-muted-foreground">Copyright Friday Report LLC</p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => handleNavigate("/terms")}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-ai-terms"
              >
                Terms of Service
              </button>
              <button
                type="button"
                onClick={() => handleNavigate("/privacy")}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-ai-privacy"
              >
                Privacy Statement
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
