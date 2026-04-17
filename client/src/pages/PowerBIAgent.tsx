import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { usePowerBIAgent, type PowerBIAgentMessage } from "@/hooks/use-powerbi-agent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send, Square, Trash2, BarChart3, User, Sparkles,
  FileBarChart, Database, Shield, Clock, Filter, Palette, CalendarDays,
  HelpCircle, Mic, MicOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const SUGGESTED_PROMPTS = [
  "I need a new Power BI report",
  "I want to build an executive dashboard",
  "I need a financial reporting solution",
  "Help me scope a sales analytics report",
];

const FEATURE_CARDS = [
  { icon: FileBarChart, title: "Report Scoping", desc: "Define pages, drill-downs & layout" },
  { icon: Database, title: "Data Sources", desc: "Identify connections & integrations" },
  { icon: Sparkles, title: "DAX Complexity", desc: "Assess calculation requirements" },
  { icon: Clock, title: "Refresh Schedule", desc: "Set data refresh frequency" },
  { icon: Filter, title: "Filters & Slicers", desc: "Define interactive filtering" },
  { icon: Palette, title: "Visual Design", desc: "Branding & UX requirements" },
  { icon: Shield, title: "Security (RLS)", desc: "Row-level access controls" },
  { icon: CalendarDays, title: "Timeline", desc: "Target delivery planning" },
];

function renderInlineMarkdown(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key++}>{match[4]}</em>);
    } else if (match[5]) {
      parts.push(<code key={key++} className="bg-muted px-1 py-0.5 rounded text-xs">{match[6]}</code>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="font-semibold text-sm mt-3 mb-1">{renderInlineMarkdown(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="font-semibold text-base mt-3 mb-1">{renderInlineMarkdown(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="font-bold text-lg mt-3 mb-1">{renderInlineMarkdown(line.slice(2))}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2 mb-0.5">
          <span className="text-orange-500 mt-0.5 flex-shrink-0">•</span>
          <span>{renderInlineMarkdown(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1.5 ml-2 mb-0.5">
            <span className="text-orange-500 font-medium flex-shrink-0">{match[1]}.</span>
            <span>{renderInlineMarkdown(match[2])}</span>
          </div>
        );
      }
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="mb-1">{renderInlineMarkdown(line)}</p>);
    }
  }

  return <>{elements}</>;
}

const OPTIONS_REGEX = /\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/i;

function extractOptions(content: string): { cleanContent: string; options: string[] } {
  const match = content.match(OPTIONS_REGEX);
  if (!match) return { cleanContent: content, options: [] };
  const options = match[1]
    .split("|")
    .map(o => o.trim())
    .filter(o => o.length > 0 && o.toLowerCase() !== "i don't know" && o.toLowerCase() !== "i dont know");
  const cleanContent = content.replace(OPTIONS_REGEX, "").trimEnd();
  return { cleanContent, options };
}

function MessageBubble({ message }: { message: PowerBIAgentMessage }) {
  const isUser = message.role === "user";
  const { cleanContent } = isUser
    ? { cleanContent: message.content }
    : extractOptions(message.content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex gap-3 mb-4", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/60 border border-border/50"
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-sm max-w-none">
            {cleanContent ? (
              <SimpleMarkdown content={cleanContent} />
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs">Thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-4 h-4 text-primary" />
        </div>
      )}
    </motion.div>
  );
}

export default function PowerBIAgent() {
  const { messages, isLoading, sendMessage, clearMessages, stopGeneration } = usePowerBIAgent();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseInputRef = useRef<string>("");

  const SpeechRecognitionCtor =
    typeof window !== "undefined"
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;
  const speechSupported = !!SpeechRecognitionCtor;

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (!speechSupported) {
      toast({
        title: "Voice input not supported",
        description: "Your browser doesn't support speech recognition. Try Chrome, Edge, or Safari.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      try { recognitionRef.current?.stop(); } catch {}
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    baseInputRef.current = input ? input.trimEnd() + (input.trimEnd() ? " " : "") : "";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (finalTranscript) {
        baseInputRef.current = (baseInputRef.current + finalTranscript).replace(/\s+/g, " ");
        if (!baseInputRef.current.endsWith(" ")) baseInputRef.current += " ";
      }
      const next = (baseInputRef.current + interimTranscript).trimStart();
      setInput(next);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      recognitionRef.current = null;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        toast({
          title: "Microphone blocked",
          description: "Allow microphone access in your browser to use voice input.",
          variant: "destructive",
        });
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        toast({
          title: "Voice input error",
          description: event.error || "Something went wrong with speech recognition.",
          variant: "destructive",
        });
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      textareaRef.current?.focus();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (err: any) {
      setIsListening(false);
      recognitionRef.current = null;
      toast({
        title: "Could not start voice input",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  }, [SpeechRecognitionCtor, speechSupported, isListening, input, toast]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    sendMessage(trimmed);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }, [input, isLoading, sendMessage]);

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isLoading]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handlePromptClick = useCallback((prompt: string) => {
    sendMessage(prompt);
  }, [sendMessage]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">
      <div className="border-b bg-background/95 backdrop-blur-sm px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Power BI Report Request</h1>
            <p className="text-xs text-muted-foreground">AI-guided intake for new report requests</p>
          </div>
          {hasMessages && (
            <div className="ml-auto flex items-center gap-2">
              {isLoading && (
                <Button variant="outline" size="sm" onClick={stopGeneration}>
                  <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearMessages}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> New Request
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center mb-8"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Power BI Report Request</h2>
              <p className="text-muted-foreground max-w-md">
                Tell me about the Power BI report you need, and I'll guide you through the intake process to capture all the details for your project team.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 w-full max-w-2xl">
              {FEATURE_CARDS.map((card, i) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                >
                  <Card className="border-border/50 hover:border-orange-500/30 transition-colors">
                    <CardContent className="p-3 text-center">
                      <card.icon className="w-5 h-5 mx-auto mb-1.5 text-orange-500" />
                      <p className="text-xs font-medium">{card.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{card.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <motion.div
                  key={prompt}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs hover:border-orange-500/50 hover:bg-orange-500/5"
                    onClick={() => handlePromptClick(prompt)}
                    disabled={isLoading}
                  >
                    <Sparkles className="w-3 h-3 mr-1.5 text-orange-500" />
                    {prompt}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <AnimatePresence>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </AnimatePresence>
            {(() => {
              const last = messages[messages.length - 1];
              if (!last || last.role !== "assistant" || isLoading) return null;
              const { options } = extractOptions(last.content);
              if (options.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-11 mb-4 flex flex-wrap gap-2"
                  data-testid="answer-options"
                >
                  {options.map((opt) => (
                    <Card
                      key={opt}
                      className="cursor-pointer border-border/60 hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors"
                      onClick={() => handlePromptClick(opt)}
                      data-testid={`option-${opt.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <CardContent className="px-3 py-2 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-orange-500 flex-shrink-0" />
                        <span className="text-xs font-medium">{opt}</span>
                      </CardContent>
                    </Card>
                  ))}
                  <Card
                    className="cursor-pointer border-dashed border-border/60 hover:border-muted-foreground/50 hover:bg-muted/40 transition-colors"
                    onClick={() => handlePromptClick("I don't know")}
                    data-testid="option-i-dont-know"
                  >
                    <CardContent className="px-3 py-2 flex items-center gap-1.5">
                      <HelpCircle className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium text-muted-foreground">I don't know</span>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })()}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t bg-background/95 backdrop-blur-sm px-6 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening… speak now" : "Describe the Power BI report you need..."}
            className="resize-none min-h-[44px] max-h-[120px] rounded-xl"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={toggleVoiceInput}
            disabled={isLoading || !speechSupported}
            size="icon"
            variant={isListening ? "default" : "outline"}
            className={cn(
              "h-11 w-11 rounded-xl flex-shrink-0",
              isListening && "bg-red-500 hover:bg-red-600 text-white border-red-500 animate-pulse",
            )}
            title={
              !speechSupported
                ? "Voice input not supported in this browser"
                : isListening
                ? "Stop voice input"
                : "Start voice input"
            }
            data-testid="button-voice-input"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          {isListening
            ? "Listening… click the mic again to stop."
            : "This agent captures your requirements — the team will follow up with a quote and timeline."}
        </p>
      </div>
    </div>
  );
}
