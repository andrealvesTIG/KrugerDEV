import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useJarvis, type FileAttachment } from "@/hooks/use-jarvis";
import { useSpeechRecognition, useSpeechSynthesis } from "@/hooks/use-speech";
import {
  Mic, MicOff, Send, Square,
  ChevronRight, X, MessageSquare, Minimize2, Zap, FileText,
  Paperclip, Plus, Compass,
  MessageCircle, AudioLines, PenLine,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  MessageBubble,
  getSuggestedPrompts,
  getContextIcon,
  getContextLabel,
  OnboardingPrompts,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  CSV_CHUNK_BYTES,
  splitCsvIntoChunks,
} from "./jarvis-shared";
import { useOrgSetupStatus } from "@/hooks/use-needs-org-setup";
import { RecentChatsMenu } from "./RecentChatsMenu";
import AgentPicker from "./AgentPicker";
import { useActiveAgentName } from "@/hooks/use-active-agent-name";
import { useAgentSuggestedPrompts } from "@/hooks/use-agent-prompts";
import ThemedGif from "@/components/ui/themed-gif";
import running_man from "@assets/runcycle18_1772300373437.gif";

type InteractionMode = "chat" | "voice" | "dictate";


const MODE_CONFIG: Record<InteractionMode, { icon: typeof MessageCircle; label: string; description: string }> = {
  chat: { icon: MessageCircle, label: "Chat", description: "Type your questions" },
  voice: { icon: AudioLines, label: "Voice", description: "Hands-free conversation" },
  dictate: { icon: PenLine, label: "Dictate", description: "Speak, review, then send" },
};

interface JarvisPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoListen?: boolean;
  onAutoListenConsumed?: () => void;
}

export default function JarvisPanel({ open, onOpenChange, autoListen, onAutoListenConsumed }: JarvisPanelProps) {
  const {
    messages, isLoading, sendMessage, stopGeneration, conciseMode, setConciseMode, pageContext,
    conversations, activeConversationId, switchConversation, newConversation,
    startOnboardingAgent, forceOnboarding,
    activeAgentId, switchAgent,
  } = useJarvis();
  const activeAgentName = useActiveAgentName(activeAgentId);
  const customAgentPrompts = useAgentSuggestedPrompts(activeAgentId);
  const { needsSetup: needsOrgSetup } = useOrgSetupStatus();
  const showOnboarding =
    forceOnboarding || (needsOrgSetup && pageContext.entityType === null);
  const [input, setInput] = useState("");
  const [interimText, setInterimText] = useState("");
  const [mode, setMode] = useState<InteractionMode>("chat");
  const [showChat, setShowChat] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageCountRef = useRef(0);
  const lastSpokenRef = useRef("");
  const autoListenHandledRef = useRef(false);
  const autoListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setLocation] = useLocation();

  const handleNavigate = useCallback((path: string) => {
    onOpenChange(false);
    setTimeout(() => setLocation(path), 150);
  }, [onOpenChange, setLocation]);

  const stopSpeakingRef = useRef<() => void>(() => {});
  const isLoadingRef = useRef(false);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  const handleVoiceResult = useCallback((transcript: string) => {
    setInterimText("");
    if (!transcript.trim()) return;

    if (mode === "voice" || mode === "dictate") {
      stopSpeakingRef.current();
      window.speechSynthesis.cancel();
      if (isLoadingRef.current) stopGeneration();
      sendMessage(transcript.trim());
    }
  }, [mode, sendMessage, stopGeneration]);

  const handleInterimResult = useCallback((transcript: string) => {
    setInterimText(transcript);
    if (mode === "voice" && transcript.trim() && window.speechSynthesis.speaking) {
      stopSpeakingRef.current();
      window.speechSynthesis.cancel();
    }
  }, [mode]);

  const handleSpeechError = useCallback((error: string) => {
    setMicError(error);
    setTimeout(() => setMicError(null), 6000);
  }, []);

  const { isListening, isSupported: micSupported, startListening, stopListening } = useSpeechRecognition({
    onResult: handleVoiceResult,
    onInterimResult: handleInterimResult,
    onError: handleSpeechError,
  });

  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis();
  useEffect(() => { stopSpeakingRef.current = stopSpeaking; }, [stopSpeaking]);

  useEffect(() => {
    if (isSpeaking && isListening && mode === "voice") {
      stopListening();
    }
  }, [isSpeaking, isListening, stopListening, mode]);

  const voiceEnabled = mode === "voice";

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking || isLoading) {
        stopSpeaking();
        stopGeneration();
      }
      startListening();
    }
  }, [isListening, isSpeaking, isLoading, stopListening, stopSpeaking, stopGeneration, startListening]);

  useEffect(() => {
    if (!voiceEnabled || !messages.length) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant" && lastMsg.content && !isLoading) {
      if (lastMsg.content !== lastSpokenRef.current && !lastMsg.content.startsWith("Error:")) {
        lastSpokenRef.current = lastMsg.content;
        speak(lastMsg.content);
      }
    }
  }, [messages, isLoading, voiceEnabled, speak]);

  useEffect(() => {
    if ((mode === "voice" || mode === "dictate") && !isSpeaking && !isLoading && !isListening && open && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && lastMsg.content) {
        const timer = setTimeout(() => {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
          }
          if (!isListening && !isSpeaking && !isLoading) {
            startListening();
          }
        }, mode === "dictate" ? 400 : 800);
        return () => clearTimeout(timer);
      }
    }
  }, [isSpeaking, isLoading, isListening, mode, open, messages, startListening]);

  useEffect(() => {
    if (open && autoListen && !autoListenHandledRef.current) {
      autoListenHandledRef.current = true;
      setMode("voice");
      autoListenTimerRef.current = setTimeout(() => {
        autoListenTimerRef.current = null;
        startListening();
      }, 400);
      onAutoListenConsumed?.();
    }
    if (!open) {
      autoListenHandledRef.current = false;
      if (autoListenTimerRef.current) {
        clearTimeout(autoListenTimerRef.current);
        autoListenTimerRef.current = null;
      }
      stopListening();
      stopSpeaking();
      window.speechSynthesis.cancel();
      setInterimText("");
    }
  }, [open, autoListen, startListening, stopListening, stopSpeaking, onAutoListenConsumed]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopListening();
        stopSpeaking();
        window.speechSynthesis.cancel();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [stopListening, stopSpeaking]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, showChat]);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && messages.length > 0) {
      setShowChat(true);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (mode === "chat" || mode === "dictate") {
      if (isSpeaking) stopSpeaking();
    }
    if (mode === "chat") {
      if (isListening) stopListening();
    }
    if ((mode === "voice" || mode === "dictate") && open && !isListening && !isLoading && !isSpeaking) {
      const timer = setTimeout(() => startListening(), 300);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  const [pendingFiles, setPendingFiles] = useState<FileAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvChunkQueue, setCsvChunkQueue] = useState<Array<{ name: string; chunks: string[] }>>([]);
  const chunkQueueRef = useRef<Array<{ name: string; chunks: string[] }>>([]);

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

    const allowedExtensions = /\.(txt|csv|json|xml|md|log|yaml|yml|ini|conf|cfg|tsv|html|htm|sql|js|ts|py|rb|go|java|c|cpp|h|css|scss|less|pdf|xls|xlsx)$/i;
    const isCsvExtension = /\.csv$/i;

    Array.from(files).forEach(file => {
      if (!allowedExtensions.test(file.name) && !ALLOWED_FILE_TYPES.includes(file.type)) {
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

  const handleSend = () => {
    const trimmed = input.trim();
    if ((!trimmed && pendingFiles.length === 0) || isLoading) return;
    setInput("");
    const files = pendingFiles.length > 0 ? [...pendingFiles] : undefined;
    setPendingFiles([]);
    sendMessage(trimmed || "Please analyze the attached file(s).", files);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[520px] md:w-[580px] sm:!max-w-[580px] p-0 flex flex-col gap-0 border-l border-cyan-900/30 bg-[#0f172a] [&>button]:hidden overflow-hidden"
      >
        <VisuallyHidden.Root>
          <SheetTitle>Friday Report</SheetTitle>
          <SheetDescription>AI-powered project management agent</SheetDescription>
        </VisuallyHidden.Root>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,150,255,0.05),transparent_60%)]" />
          <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="jarvis-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="cyan" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#jarvis-grid)" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-cyan-900/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,200,255,0.6)]" />
              <span className="text-sm font-medium text-cyan-300 tracking-wide" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Friday Agent
              </span>
              <AgentPicker activeAgentId={activeAgentId} onSelect={switchAgent} />
              
              {pageContext.entityType && (() => {
                const CtxIcon = getContextIcon(pageContext.entityType);
                return (
                  <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[10px] bg-cyan-900/30 text-cyan-500 border border-cyan-800/30">
                    {CtxIcon && <CtxIcon className="h-2.5 w-2.5" />}
                    {getContextLabel(pageContext.entityType)}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConciseMode(!conciseMode)}
                    className={cn(
                      "h-7 px-2 hover:bg-cyan-900/20",
                      conciseMode ? "text-cyan-100" : "text-cyan-300"
                    )}
                  >
                    {conciseMode ? <Zap className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                    <span className="text-xs">{conciseMode ? "Brief" : "Detailed"}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">{conciseMode ? "Short replies (click for detailed)" : "Detailed replies (click for brief)"}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      newConversation();
                      setShowChat(false);
                      lastSpokenRef.current = "";
                      stopSpeaking();
                    }}
                    className="h-7 px-2 gap-1 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-900/20"
                    data-testid="button-friday-new-chat"
                  >
                    <Plus className="h-3 w-3" />
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
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      startOnboardingAgent();
                      setShowChat(false);
                      lastSpokenRef.current = "";
                      stopSpeaking();
                    }}
                    className={cn(
                      "h-7 px-2 gap-1 text-cyan-300 hover:text-cyan-100 hover:bg-cyan-900/20 border border-transparent",
                      forceOnboarding && "border-cyan-500/50 text-cyan-100 bg-cyan-900/30",
                    )}
                    data-testid="button-friday-onboarding-agent"
                  >
                    <Compass className="h-3 w-3" />
                    <span className="text-xs">Onboarding</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Launch the onboarding agent to set up your workspace</p>
                </TooltipContent>
              </Tooltip>
              <RecentChatsMenu
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSwitch={(id) => {
                  switchConversation(id);
                  setShowChat(true);
                  lastSpokenRef.current = "";
                  stopSpeaking();
                }}
                onNew={() => {
                  newConversation();
                  setShowChat(false);
                  lastSpokenRef.current = "";
                  stopSpeaking();
                }}
                size="sm"
                alwaysVisibleLabel="Conversation History"
                triggerClassName="text-cyan-300 hover:text-cyan-100 hover:bg-cyan-900/20"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 text-cyan-300 hover:text-cyan-400 hover:bg-cyan-900/20"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-cyan-900/15 bg-slate-900/30">
            {(Object.keys(MODE_CONFIG) as InteractionMode[]).map((m) => {
              const cfg = MODE_CONFIG[m];
              const Icon = cfg.icon;
              const isActive = mode === m;
              const isDisabled = (m === "voice" || m === "dictate") && !micSupported;
              return (
                <button
                  key={m}
                  onClick={() => !isDisabled && setMode(m)}
                  disabled={isDisabled}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all",
                    isActive
                      ? "bg-cyan-500/20 text-cyan-50 border border-cyan-400/50 shadow-[0_0_10px_rgba(0,200,255,0.2)]"
                      : "text-cyan-300 hover:text-cyan-100 hover:bg-cyan-900/30 border border-transparent",
                    isDisabled && "opacity-30 cursor-not-allowed"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {mode === "voice" && (
            <div className={cn(
              "flex flex-col items-center justify-center transition-all duration-300 flex-shrink-0",
              showChat && messages.length > 0 ? "py-4" : "py-10 flex-1"
            )}>
              <div className="flex flex-col items-center gap-5">
                <div className="relative">
                  <Button
                    size="icon"
                    onClick={handleMicToggle}
                    className={cn(
                      "h-20 w-20 rounded-full transition-colors",
                      isListening
                        ? "bg-red-500/15 text-red-400 hover:bg-red-500/25 ring-2 ring-red-500/50"
                        : isLoading
                        ? "bg-cyan-900/30 text-cyan-300 border border-cyan-800/40"
                        : "bg-cyan-900/30 text-cyan-400 hover:bg-cyan-800/40 border border-cyan-700/40"
                    )}
                  >
                    {isListening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </Button>
                  {isListening && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                  )}
                </div>

                <div className="text-center">
                  <p className={cn(
                    "text-sm font-medium",
                    isListening ? "text-red-400" : isSpeaking ? "text-green-400" : isLoading ? "text-cyan-500" : "text-cyan-300"
                  )}>
                    {isListening ? "Listening..." : isSpeaking ? "Speaking..." : isLoading ? "Thinking..." : "Tap to speak"}
                  </p>
                  {interimText && (
                    <p className="text-xs text-cyan-500/60 mt-1.5 max-w-[260px] truncate italic">
                      "{interimText}"
                    </p>
                  )}
                  {!showChat && messages.length === 0 && !isListening && !isLoading && !isSpeaking && (
                    <p className="text-xs text-cyan-400 mt-2 max-w-[220px]">
                      Friday will listen and respond automatically
                    </p>
                  )}
                </div>

                {(isLoading || isSpeaking) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { stopGeneration(); stopSpeaking(); }}
                    className="text-orange-400 hover:bg-orange-900/20 hover:text-orange-300 h-8 px-3"
                  >
                    <Square className="h-3.5 w-3.5 mr-1.5" />
                    <span className="text-xs">Stop</span>
                  </Button>
                )}

                {micError && (
                  <p className="text-xs text-red-300 text-center max-w-[260px] px-3 py-1.5 rounded bg-red-900/20 border border-red-800/30">
                    {micError}
                  </p>
                )}
              </div>
            </div>
          )}

          {mode !== "voice" && (
            <div className={cn(
              "flex flex-col items-center justify-center transition-all duration-300 flex-shrink-0",
              showChat && messages.length > 0 ? "py-2" : "py-6"
            )}>
              {!(showChat && messages.length > 0) && messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-full px-4"
                >
                  {showOnboarding ? (
                    <OnboardingPrompts
                      variant="panel"
                      onPick={(message) => sendMessage(message)}
                    />
                  ) : (
                    <div className="w-full max-w-xs mx-auto">
                      <p className="text-[10px] font-medium text-cyan-300 uppercase tracking-widest mb-2 text-center">
                        Suggested
                      </p>
                      <div className="space-y-1.5">
                        {(customAgentPrompts ?? getSuggestedPrompts(pageContext.entityType)).map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => sendMessage(prompt)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded border border-cyan-900/30 text-cyan-100 hover:text-cyan-300 hover:bg-cyan-900/20 hover:border-cyan-700/30 transition-all group"
                          >
                            <ChevronRight className="h-3 w-3 text-cyan-300 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
                            <span className="truncate">{prompt}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}

          {showChat && messages.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col border-t border-cyan-900/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-cyan-900/10 flex-shrink-0">
                <span className="text-[10px] text-cyan-300 uppercase tracking-widest">Conversation</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowChat(false)}
                  className="h-6 px-1.5 text-cyan-300 hover:text-cyan-400 hover:bg-cyan-900/20"
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
                <div className="py-2">
                  {messages.map((msg, i) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      index={i}
                      onNavigate={handleNavigate}
                      onQuickReply={(text) => sendMessage(text)}
                    />
                  ))}
                  {isLoading && (() => {
                    const last = messages[messages.length - 1];
                    const noTokensYet = !last || last.role === "user" || (last.role === "assistant" && !last.content);
                    if (!noTokensYet) return null;
                    return (
                      <div className="flex items-center gap-2 py-2 px-1" data-testid="friday-thinking-panel">
                        <ThemedGif src={running_man} alt="Running" className="h-8 w-8 object-contain" />
                        <span className="text-[11px] text-cyan-300/70">{activeAgentName} is working on it like there is no tomorrow...</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {!showChat && messages.length > 0 && (
            <div className="px-4 pb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChat(true)}
                className="w-full h-8 text-cyan-300 hover:text-cyan-400 hover:bg-cyan-900/20 border border-cyan-900/20"
              >
                <MessageSquare className="h-3 w-3 mr-1.5" />
                <span className="text-xs">Show conversation ({messages.length})</span>
              </Button>
            </div>
          )}

          {mode !== "voice" && (
            <div className="flex-shrink-0 border-t border-cyan-900/20 p-3 bg-[#0f172a]/80 backdrop-blur">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.csv,.json,.xml,.md,.log,.yaml,.yml,.html,.htm,.sql,.js,.ts,.py,.pdf,.xls,.xlsx,.tsv,.ini,.conf,.cfg"
                onChange={handleFileSelect}
                className="hidden"
              />
              <AnimatePresence>
                {csvChunkQueue.length > 0 && !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 p-2 rounded border border-cyan-700/30 bg-cyan-900/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-cyan-400">
                        <Paperclip className="h-2.5 w-2.5 inline mr-1" />
                        {csvChunkQueue[0]?.name} — {csvChunkQueue[0]?.chunks.length} chunk{csvChunkQueue[0]?.chunks.length !== 1 ? "s" : ""} remaining
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-cyan-400 hover:text-cyan-200 hover:bg-cyan-900/40 border border-cyan-700/30"
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
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-cyan-900/30 text-cyan-400 border border-cyan-800/30"
                      >
                        <Paperclip className="h-2.5 w-2.5" />
                        <span className="max-w-[120px] truncate">{f.name}</span>
                        <span className="text-cyan-300">({(f.size / 1024).toFixed(0)}KB)</span>
                        <button
                          onClick={() => removeFile(f.name)}
                          className="ml-0.5 text-cyan-300 hover:text-red-400 transition-colors"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              {micError && mode === "dictate" && (
                <div className="mb-2 text-xs text-red-300 text-center px-3 py-1.5 rounded bg-red-900/20 border border-red-800/30">
                  {micError}
                </div>
              )}
              <div className="flex items-center gap-2 mb-1.5">
                {mode === "dictate" && micSupported && (
                  <div className="relative flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleMicToggle}
                      className={cn(
                        "h-9 w-9 rounded-full transition-colors flex-shrink-0",
                        isListening
                          ? "bg-red-500/15 text-red-400 hover:bg-red-500/25 ring-2 ring-red-500/50"
                          : "text-cyan-500 hover:bg-cyan-900/30 hover:text-cyan-400"
                      )}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    {isListening && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                    )}
                  </div>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isListening || pendingFiles.length >= 5}
                      className="h-9 w-9 rounded-full text-cyan-500 hover:bg-cyan-900/30 hover:text-cyan-400 disabled:opacity-30 flex-shrink-0"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Attach files (max 5, 500KB each)</p>
                  </TooltipContent>
                </Tooltip>
                <div className="flex-1 min-w-0 relative">
                  <Textarea
                    ref={textareaRef}
                    value={mode === "dictate" && isListening && interimText ? input + (input ? " " : "") + interimText : input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      mode === "dictate"
                        ? (isListening ? "Listening... speak now" : "Speak or type here")
                        : (pageContext.entityType ? `Ask about this ${pageContext.entityType}...` : "Ask Friday anything...")
                    }
                    className="min-h-[38px] max-h-[80px] resize-none text-sm bg-slate-900/50 border-cyan-900/30 text-cyan-100 placeholder:text-cyan-400 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-700/50 pr-2"
                    rows={1}
                    disabled={mode === "dictate" && isListening}
                  />
                </div>
                {isLoading ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { stopGeneration(); stopSpeaking(); }}
                    title="Stop response"
                    className="h-9 w-9 rounded-full text-orange-400 hover:bg-orange-900/20 flex-shrink-0"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={(!input.trim() && pendingFiles.length === 0) || (mode === "dictate" && isListening)}
                    className="h-9 w-9 rounded-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-30 disabled:bg-transparent border border-cyan-500/20 flex-shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-[9px] text-cyan-500 tracking-wide text-center">
                AI-GENERATED
              </p>
            </div>
          )}

          {mode === "voice" && (
            <div className="flex-shrink-0 border-t border-cyan-900/20 py-2 px-3 bg-[#0f172a]/80">
              <p className="text-[9px] text-cyan-500 tracking-wide text-center">
                AI-GENERATED
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
