import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useJarvis, type JarvisMessage } from "@/hooks/use-jarvis";
import { useSpeechRecognition, useSpeechSynthesis } from "@/hooks/use-speech";
import { JarvisOrb } from "./JarvisOrb";
import {
  Mic, MicOff, Send, Square, Trash2, Volume2, VolumeX,
  ChevronRight, X, MessageSquare, Minimize2, Radio, Zap, FileText,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

const SUGGESTED_PROMPTS = [
  "Which projects are at risk?",
  "What issues are blocking delivery?",
  "Summarize overall project health",
  "Draft an executive weekly update",
];

function MarkdownContent({ content, onNavigate }: { content: string; onNavigate?: (path: string) => void }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="font-semibold text-sm mt-3 mb-1 text-cyan-300">{renderInline(line.slice(4), onNavigate)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="font-semibold text-base mt-3 mb-1 text-cyan-200">{renderInline(line.slice(3), onNavigate)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="font-bold text-lg mt-3 mb-1 text-cyan-100">{renderInline(line.slice(2), onNavigate)}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-cyan-500 mt-0.5 flex-shrink-0">&#9670;</span>
          <span>{renderInline(line.slice(2), onNavigate)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1.5 ml-2">
            <span className="text-cyan-400 flex-shrink-0 font-medium">{match[1]}.</span>
            <span>{renderInline(match[2], onNavigate)}</span>
          </div>
        );
      }
    } else if (line.startsWith("  - ") || line.startsWith("  * ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-6">
          <span className="text-cyan-600 mt-0.5 flex-shrink-0">&#9672;</span>
          <span>{renderInline(line.slice(4), onNavigate)}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    } else if (line.startsWith("> ")) {
      elements.push(
        <div key={i} className="border-l-2 border-cyan-500/40 pl-3 py-0.5 text-cyan-300/80 italic">
          {renderInline(line.slice(2), onNavigate)}
        </div>
      );
    } else {
      elements.push(<p key={i}>{renderInline(line, onNavigate)}</p>);
    }
  }

  return <div className="space-y-0.5 text-sm leading-relaxed">{elements}</div>;
}

let inlineKeyCounter = 0;

function renderInline(text: string, onNavigate?: (path: string) => void): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*\*\[([^\]]+)\]\((\/.+?)\)\*\*)|(\*\*(.+?)\*\*)|(`(.+?)`)|(\[([^\]]+)\]\((\/.+?)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      const linkText = match[2];
      const linkPath = match[3];
      parts.push(
        <button
          key={`il-${inlineKeyCounter++}`}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigate?.(linkPath);
          }}
          className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/40 hover:decoration-cyan-400/60 transition-colors cursor-pointer font-semibold"
        >
          {linkText}
        </button>
      );
    } else if (match[5]) {
      parts.push(<strong key={`il-${inlineKeyCounter++}`} className="font-semibold text-cyan-200">{renderInline(match[5], onNavigate)}</strong>);
    } else if (match[7]) {
      parts.push(
        <code key={`il-${inlineKeyCounter++}`} className="bg-cyan-900/30 border border-cyan-700/30 px-1 py-0.5 rounded text-xs font-mono text-cyan-300">{match[7]}</code>
      );
    } else if (match[9] && match[10]) {
      const linkText = match[9];
      const linkPath = match[10];
      parts.push(
        <button
          key={`il-${inlineKeyCounter++}`}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNavigate?.(linkPath);
          }}
          className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/40 hover:decoration-cyan-400/60 transition-colors cursor-pointer font-medium"
        >
          {linkText}
        </button>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function MessageBubble({ message, index, onNavigate }: { message: JarvisMessage; index: number; onNavigate?: (path: string) => void }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className={cn("flex gap-2 py-2", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div className={cn(
        "min-w-0 rounded-lg px-4 py-2.5",
        isUser
          ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-100 ml-8 max-w-[85%]"
          : "bg-slate-800/50 border border-slate-700/30 text-slate-200 w-full"
      )}>
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : message.content ? (
          <MarkdownContent content={message.content} onNavigate={onNavigate} />
        ) : (
          <div className="flex items-center gap-2 text-sm text-cyan-400/60">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            Analyzing data...
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface JarvisPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoListen?: boolean;
  onAutoListenConsumed?: () => void;
}

export default function JarvisPanel({ open, onOpenChange, autoListen, onAutoListenConsumed }: JarvisPanelProps) {
  const { messages, isLoading, sendMessage, clearMessages, stopGeneration, conciseMode, setConciseMode } = useJarvis();
  const [input, setInput] = useState("");
  const [interimText, setInterimText] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [showChat, setShowChat] = useState(false);
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
    if (transcript.trim()) {
      stopSpeakingRef.current();
      window.speechSynthesis.cancel();
      if (isLoadingRef.current) stopGeneration();
      sendMessage(transcript.trim());
    }
  }, [sendMessage, stopGeneration]);

  const handleInterimResult = useCallback((transcript: string) => {
    setInterimText(transcript);
    if (transcript.trim() && window.speechSynthesis.speaking) {
      stopSpeakingRef.current();
      window.speechSynthesis.cancel();
    }
  }, []);

  const { isListening, isSupported: micSupported, startListening, toggleListening, stopListening } = useSpeechRecognition({
    onResult: handleVoiceResult,
    onInterimResult: handleInterimResult,
  });

  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis();
  useEffect(() => { stopSpeakingRef.current = stopSpeaking; }, [stopSpeaking]);

  useEffect(() => {
    if (isListening && (isSpeaking || window.speechSynthesis.speaking)) {
      stopSpeaking();
      window.speechSynthesis.cancel();
    }
  }, [isListening, isSpeaking, stopSpeaking]);

  const interruptAndListen = useCallback(() => {
    stopSpeaking();
    stopGeneration();
    if (!isListening) {
      startListening();
    }
  }, [stopSpeaking, stopGeneration, isListening, startListening]);

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking || isLoading) {
        interruptAndListen();
      } else {
        startListening();
      }
    }
  }, [isListening, isSpeaking, isLoading, stopListening, interruptAndListen, startListening]);
  const [continuousVoice, setContinuousVoice] = useState(false);

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
    if (continuousVoice && voiceEnabled && !isSpeaking && !isLoading && !isListening && open && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && lastMsg.content) {
        const timer = setTimeout(() => {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
          }
          if (!isListening && !isSpeaking && !isLoading) {
            startListening();
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [isSpeaking, isLoading, isListening, continuousVoice, voiceEnabled, open, messages, startListening]);

  useEffect(() => {
    if (open && autoListen && !autoListenHandledRef.current) {
      autoListenHandledRef.current = true;
      setContinuousVoice(true);
      autoListenTimerRef.current = setTimeout(() => {
        autoListenTimerRef.current = null;
        startListening();
      }, 400);
      onAutoListenConsumed?.();
    }
    if (!open) {
      autoListenHandledRef.current = false;
      setContinuousVoice(false);
      if (autoListenTimerRef.current) {
        clearTimeout(autoListenTimerRef.current);
        autoListenTimerRef.current = null;
      }
      stopListening();
      stopSpeaking();
      setInterimText("");
    }
  }, [open, autoListen, startListening, stopListening, stopSpeaking, onAutoListenConsumed]);

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

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    sendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const orbState: "idle" | "listening" | "thinking" | "speaking" =
    isListening ? "listening"
    : isSpeaking ? "speaking"
    : isLoading ? "thinking"
    : "idle";

  const statusText =
    isListening ? (interimText || "Listening...")
    : isSpeaking ? "Speaking..."
    : isLoading ? "Analyzing..."
    : "Ready";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[520px] md:w-[580px] sm:!max-w-[580px] p-0 flex flex-col gap-0 border-l border-cyan-900/30 bg-[#0a0e1a] [&>button]:hidden overflow-hidden"
      >
        <VisuallyHidden.Root>
          <SheetTitle>Friday Agent</SheetTitle>
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
              <span className="text-sm font-medium text-cyan-300 tracking-wider uppercase" style={{ fontFamily: "'Outfit', sans-serif" }}>
                F.R.I.D.A.Y.
              </span>
              <span className="text-xs text-cyan-600">Agent</span>
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
                      conciseMode ? "text-cyan-400" : "text-cyan-700"
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
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { clearMessages(); setShowChat(false); lastSpokenRef.current = ""; stopSpeaking(); }}
                  className="h-7 px-2 text-cyan-600 hover:text-cyan-400 hover:bg-cyan-900/20"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  <span className="text-xs">New</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 text-cyan-600 hover:text-cyan-400 hover:bg-cyan-900/20"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className={cn(
            "flex flex-col items-center justify-center transition-all duration-500 ease-out flex-shrink-0",
            showChat && messages.length > 0 ? "py-3" : "py-8 flex-1"
          )}>
            <div className="relative">
              <JarvisOrb state={orbState} size={showChat && messages.length > 0 ? 80 : 200} />

              <AnimatePresence>
                {isListening && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1"
                  >
                    <span className="text-xs text-cyan-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                      REC
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.div
              key={statusText}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-center"
            >
              <p className={cn(
                "text-sm tracking-wide",
                orbState === "idle" ? "text-cyan-600" : "text-cyan-400"
              )}>
                {statusText}
              </p>
              {interimText && (
                <p className="text-xs text-cyan-500/60 mt-1 max-w-[280px] truncate italic">
                  "{interimText}"
                </p>
              )}
            </motion.div>

            {!showChat && messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-6 w-full max-w-xs px-4"
              >
                <p className="text-[10px] font-medium text-cyan-700 uppercase tracking-widest mb-2 text-center">
                  Suggested
                </p>
                <div className="space-y-1.5">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded border border-cyan-900/30 text-cyan-400/80 hover:text-cyan-300 hover:bg-cyan-900/20 hover:border-cyan-700/30 transition-all group"
                    >
                      <ChevronRight className="h-3 w-3 text-cyan-700 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
                      <span className="truncate">{prompt}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {showChat && messages.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col border-t border-cyan-900/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-cyan-900/10 flex-shrink-0">
                <span className="text-[10px] text-cyan-700 uppercase tracking-widest">Conversation</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowChat(false)}
                  className="h-6 px-1.5 text-cyan-700 hover:text-cyan-400 hover:bg-cyan-900/20"
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
                <div className="py-2">
                  {messages.map((msg, i) => (
                    <MessageBubble key={msg.id} message={msg} index={i} onNavigate={handleNavigate} />
                  ))}
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
                className="w-full h-8 text-cyan-600 hover:text-cyan-400 hover:bg-cyan-900/20 border border-cyan-900/20"
              >
                <MessageSquare className="h-3 w-3 mr-1.5" />
                <span className="text-xs">Show conversation ({messages.length})</span>
              </Button>
            </div>
          )}

          <div className="flex-shrink-0 border-t border-cyan-900/20 p-3 bg-[#0a0e1a]/80 backdrop-blur">
            <div className="flex items-center gap-2 mb-2">
              {micSupported && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleMicToggle}
                  className={cn(
                    "h-9 w-9 rounded-full transition-all flex-shrink-0",
                    isListening
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-2 ring-red-500/40 animate-pulse"
                      : "text-cyan-500 hover:bg-cyan-900/30 hover:text-cyan-400"
                  )}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <div className="flex-1 min-w-0 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? "Listening..." : "Ask Friday anything..."}
                  className="min-h-[38px] max-h-[80px] resize-none text-sm bg-slate-900/50 border-cyan-900/30 text-cyan-100 placeholder:text-cyan-800 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-700/50 pr-2"
                  rows={1}
                  disabled={isListening}
                />
              </div>
              {(isLoading || isSpeaking) ? (
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
                  disabled={!input.trim() || isListening}
                  className="h-9 w-9 rounded-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-30 disabled:bg-transparent border border-cyan-500/20 flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (voiceEnabled && isSpeaking) stopSpeaking();
                  setVoiceEnabled(!voiceEnabled);
                }}
                className={cn(
                  "h-6 px-2 rounded",
                  voiceEnabled
                    ? "text-cyan-500 hover:bg-cyan-900/30"
                    : "text-cyan-800 hover:bg-cyan-900/20"
                )}
              >
                {voiceEnabled ? <Volume2 className="h-3 w-3 mr-1" /> : <VolumeX className="h-3 w-3 mr-1" />}
                <span className="text-[10px]">{voiceEnabled ? "Voice on" : "Voice off"}</span>
              </Button>
              <span className="text-cyan-900">·</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setContinuousVoice(!continuousVoice)}
                title={continuousVoice ? "Hands-free mode ON" : "Hands-free mode OFF"}
                className={cn(
                  "h-6 px-2 rounded relative",
                  continuousVoice
                    ? "text-green-400 hover:bg-green-900/20"
                    : "text-cyan-800 hover:bg-cyan-900/20"
                )}
              >
                <Radio className="h-3 w-3 mr-1" />
                <span className="text-[10px]">{continuousVoice ? "Hands-free" : "Hands-free"}</span>
                {continuousVoice && (
                  <span className="ml-1 w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                )}
              </Button>
              <span className="text-cyan-900">·</span>
              <p className="text-[9px] text-cyan-900 tracking-wide">
                AI-GENERATED
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
