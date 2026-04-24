import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Link } from "wouter";
import { usePowerBIAgent, type PowerBIAgentMessage, type PowerBIAttachment, type PowerBIAgentModel } from "@/hooks/use-powerbi-agent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send, Square, Trash2, User, Sparkles,
  FileBarChart, Database, Shield, Clock, Filter, Palette, CalendarDays,
  HelpCircle, Mic, MicOff, Paperclip, X, History, Plus, Pencil, Image as ImageIcon, FileText,
  ClipboardList,
} from "lucide-react";
import { RequestSummaryPanel } from "@/components/powerbi/RequestSummaryPanel";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import logoIcon from "@assets/FridayReportAI_logo_F-symbol_1770231051194.png";

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

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024;
// Mirrors server-side ALLOWED_ATTACHMENT_TYPES so users get pre-send feedback.
const ALLOWED_ATTACHMENT_MIME = new Set<string>([
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv", "text/plain", "text/markdown", "application/json",
]);

function renderInlineMarkdown(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++}>{match[4]}</em>);
    else if (match[5]) parts.push(<code key={key++} className="bg-muted px-1 py-0.5 rounded text-xs">{match[6]}</code>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) elements.push(<h3 key={i} className="font-semibold text-sm mt-3 mb-1">{renderInlineMarkdown(line.slice(4))}</h3>);
    else if (line.startsWith("## ")) elements.push(<h2 key={i} className="font-semibold text-base mt-3 mb-1">{renderInlineMarkdown(line.slice(3))}</h2>);
    else if (line.startsWith("# ")) elements.push(<h1 key={i} className="font-bold text-lg mt-3 mb-1">{renderInlineMarkdown(line.slice(2))}</h1>);
    else if (line.startsWith("- ") || line.startsWith("* ")) elements.push(
      <div key={i} className="flex gap-1.5 ml-2 mb-0.5">
        <span className="text-orange-500 mt-0.5 flex-shrink-0">•</span>
        <span>{renderInlineMarkdown(line.slice(2))}</span>
      </div>
    );
    else if (/^\d+\.\s/.test(line)) {
      const m = line.match(/^(\d+)\.\s(.*)$/);
      if (m) elements.push(
        <div key={i} className="flex gap-1.5 ml-2 mb-0.5">
          <span className="text-orange-500 font-medium flex-shrink-0">{m[1]}.</span>
          <span>{renderInlineMarkdown(m[2])}</span>
        </div>
      );
    }
    else if (line.trim() === "") elements.push(<div key={i} className="h-2" />);
    else elements.push(<p key={i} className="mb-1">{renderInlineMarkdown(line)}</p>);
  }
  return <>{elements}</>;
}

const OPTIONS_REGEX = /\[OPTIONS\]([\s\S]*?)\[\/OPTIONS\]/i;

export type ParsedOption = { value: string; suggestedFrom?: string };

function extractOptions(content: string): { cleanContent: string; options: ParsedOption[] } {
  const match = content.match(OPTIONS_REGEX);
  if (!match) return { cleanContent: content, options: [] };
  // Parse `SUGGESTED|<filename>|<value>` triples as a single suggested chip
  // (with the filename surfaced on hover/badge), and normal `value` items as
  // plain chips. Tokens are pipe-separated.
  const tokens = match[1].split("|").map(s => s.trim()).filter(Boolean);
  const out: ParsedOption[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^suggested$/i.test(t) && i + 2 < tokens.length) {
      const fname = tokens[i + 1];
      const value = tokens[i + 2];
      if (value && !/^i\s*don'?t\s*know$/i.test(value) && !/^skip$/i.test(value)) {
        out.push({ value, suggestedFrom: fname });
      }
      i += 2;
      continue;
    }
    if (/^i\s*don'?t\s*know$/i.test(t) || /^skip$/i.test(t)) continue;
    out.push({ value: t });
  }
  const cleanContent = content.replace(OPTIONS_REGEX, "").trimEnd();
  return { cleanContent, options: out };
}

// Detect when the assistant has actually submitted the request — in that case we don't show reply chips.
function looksSubmitted(text: string): boolean {
  return /submitted with reference|request has been submitted|PBI-\d{4}-\d{3}|INT-\d{4}-\d{3}/i.test(text);
}

function AttachmentChip({
  att, onRemove, compact = false,
}: { att: PowerBIAttachment; onRemove?: () => void; compact?: boolean }) {
  const isImage = att.contentType.startsWith("image/");
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1 text-xs",
      compact ? "max-w-[180px]" : "max-w-[260px]",
    )}>
      {isImage ? <ImageIcon className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" /> : <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
      {att.objectPath ? (
        <a
          href={att.objectPath}
          download={att.name}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="truncate underline-offset-2 hover:underline"
          title={`Download ${att.name}`}
          data-testid="attachment-download"
        >
          {att.name}
        </a>
      ) : (
        <span className="truncate" title={att.name}>{att.name}</span>
      )}
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-foreground" aria-label="Remove">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: PowerBIAgentMessage }) {
  const isUser = message.role === "user";
  const { cleanContent } = isUser ? { cleanContent: message.content } : extractOptions(message.content);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("flex gap-3 mb-4", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-white flex items-center justify-center shadow-sm border border-border/50 overflow-hidden">
          <img src={logoIcon} alt="Friday Report" className="w-full h-full object-contain" />
        </div>
      )}
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted/60 border border-border/50"
      )}>
        {isUser ? (
          <>
            {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.attachments.map((att, i) => <AttachmentChip key={i} att={att} compact />)}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm max-w-none">
            {cleanContent ? <SimpleMarkdown content={cleanContent} /> : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs" data-testid="thinking-indicator">
                  {message.phase === "analyzing" ? "Analyzing attachments…" : "Thinking..."}
                </span>
              </div>
            )}
            {message.intake && (
              <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3" data-testid="intake-link-card">
                {(message.intake.intakeNumber || message.intake.requestNumber) && (
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Submitted{message.intake.intakeNumber ? `: ${message.intake.intakeNumber}` : ""}
                    {message.intake.requestNumber ? ` · ${message.intake.requestNumber}` : ""}
                  </p>
                )}
                {message.intake.reportName && (
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2 truncate">
                    {message.intake.reportName}
                  </p>
                )}
                <Link href={`/intakes/${message.intake.intakeId}`}>
                  <Button
                    size="sm"
                    className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                    data-testid="button-open-intake"
                  >
                    Open intake
                  </Button>
                </Link>
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

function HistoryDrawer({
  conversations, currentId, onLoad, onRename, onDelete, onNew,
}: {
  conversations: ReturnType<typeof usePowerBIAgent>["conversations"];
  currentId: number | null;
  onLoad: (id: number) => void;
  onRename: (id: number, t: string) => void;
  onDelete: (id: number) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (id: number, current: string | null) => {
    setEditingId(id);
    setEditValue(current || "");
  };
  const commitEdit = (id: number) => {
    const t = editValue.trim();
    if (t) onRename(id, t);
    setEditingId(null);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="button-history">
          <History className="w-3.5 h-3.5 mr-1.5" /> History
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[340px] sm:w-[380px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Past requests</SheetTitle>
        </SheetHeader>
        <div className="mt-3">
          <Button
            size="sm"
            className="w-full bg-gradient-to-br from-orange-500 to-amber-600 text-white hover:from-orange-600 hover:to-amber-700"
            onClick={() => { onNew(); setOpen(false); }}
            data-testid="button-new-from-history"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New request
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto mt-4 -mx-6 px-6 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No saved conversations yet.</p>
          )}
          {conversations.map(c => {
            const isActive = c.id === currentId;
            return (
              <div
                key={c.id}
                className={cn(
                  "group rounded-lg border px-2.5 py-2 cursor-pointer transition-colors",
                  isActive ? "border-orange-500/50 bg-orange-500/5" : "border-border/60 hover:border-orange-500/30 hover:bg-muted/40",
                )}
                onClick={() => { onLoad(c.id); setOpen(false); }}
                data-testid={`conversation-${c.id}`}
              >
                {editingId === c.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => commitEdit(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-full bg-transparent outline-none text-sm font-medium"
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.title || "Untitled request"}</p>
                      {c.snippet && (
                        <p className="text-[11px] text-muted-foreground/90 mt-0.5 line-clamp-2">
                          {c.snippet}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {c.model || "fast"}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          {c.lastMessageAt ? formatDistanceToNow(new Date(c.lastMessageAt), { addSuffix: true }) : ""}
                          {c.submittedIntakeId && <span className="ml-1.5 text-emerald-600">• submitted</span>}
                        </p>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                      <button
                        className="p-1 hover:bg-muted rounded"
                        onClick={(e) => { e.stopPropagation(); startEdit(c.id, c.title); }}
                        aria-label="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="p-1 hover:bg-muted rounded text-destructive"
                        onClick={(e) => { e.stopPropagation(); if (confirm("Delete this conversation?")) onDelete(c.id); }}
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PowerBIAgent() {
  const {
    messages, isLoading, sendMessage, startNewConversation, stopGeneration,
    conversationId, conversations, loadConversation, renameConversation, deleteConversation,
    isReadOnly, continueConversation,
    model, setModel, providers, uploadAttachment,
    intakeState, intakeFields, intakeSections, isExtracting, isSubmitted,
    editIntakeField,
  } = usePowerBIAgent();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PowerBIAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseInputRef = useRef<string>("");

  const SpeechRecognitionCtor = typeof window !== "undefined"
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null;
  const speechSupported = !!SpeechRecognitionCtor;

  useEffect(() => () => { if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {} }, []);

  const toggleVoiceInput = useCallback(() => {
    if (!speechSupported) {
      toast({ title: "Voice input not supported", description: "Try Chrome, Edge, or Safari.", variant: "destructive" });
      return;
    }
    if (isListening) { try { recognitionRef.current?.stop(); } catch {} return; }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    baseInputRef.current = input ? input.trimEnd() + (input.trimEnd() ? " " : "") : "";
    recognition.onresult = (event: any) => {
      let finalT = "", interimT = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalT += t; else interimT += t;
      }
      if (finalT) {
        baseInputRef.current = (baseInputRef.current + finalT).replace(/\s+/g, " ");
        if (!baseInputRef.current.endsWith(" ")) baseInputRef.current += " ";
      }
      const next = (baseInputRef.current + interimT).trimStart();
      setInput(next);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
      }
    };
    recognition.onerror = (event: any) => {
      setIsListening(false); recognitionRef.current = null;
      if (event.error === "not-allowed" || event.error === "service-not-allowed")
        toast({ title: "Microphone blocked", description: "Allow microphone access.", variant: "destructive" });
      else if (event.error !== "no-speech" && event.error !== "aborted")
        toast({ title: "Voice input error", description: event.error || "Something went wrong.", variant: "destructive" });
    };
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; textareaRef.current?.focus(); };
    recognitionRef.current = recognition;
    try { recognition.start(); setIsListening(true); }
    catch (err: any) {
      setIsListening(false); recognitionRef.current = null;
      toast({ title: "Could not start voice input", description: err?.message || "Please try again.", variant: "destructive" });
    }
  }, [SpeechRecognitionCtor, speechSupported, isListening, input, toast]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (!isLoading && textareaRef.current) textareaRef.current.focus(); }, [isLoading]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (pendingAttachments.length + files.length > MAX_ATTACHMENTS) {
      toast({ title: "Too many attachments", description: `Maximum ${MAX_ATTACHMENTS} files per message.`, variant: "destructive" });
      return;
    }
    setIsUploading(true);
    const uploaded: PowerBIAttachment[] = [];
    let runningTotal = pendingAttachments.reduce((s, a) => s + (a.size || 0), 0);
    for (const f of files) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast({ title: `${f.name} is too large`, description: "Max 20 MB per file.", variant: "destructive" });
        continue;
      }
      const ct = (f.type || "").toLowerCase();
      if (!ct || !ALLOWED_ATTACHMENT_MIME.has(ct)) {
        toast({
          title: `${f.name} is an unsupported file type`,
          description: "Allowed: images, PDF, Word, Excel, CSV, TXT, Markdown, JSON.",
          variant: "destructive",
        });
        continue;
      }
      if (runningTotal + f.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        toast({
          title: "Attachment total too large",
          description: `Combined attachments must stay under ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
          variant: "destructive",
        });
        break;
      }
      const att = await uploadAttachment(f);
      if (att) {
        uploaded.push(att);
        runningTotal += f.size;
      } else {
        toast({ title: `Failed to upload ${f.name}`, variant: "destructive" });
      }
    }
    if (uploaded.length) setPendingAttachments(prev => [...prev, ...uploaded]);
    setIsUploading(false);
  }, [pendingAttachments.length, toast, uploadAttachment]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isLoading) return;
    setInput("");
    const atts = pendingAttachments;
    setPendingAttachments([]);
    sendMessage(trimmed, atts.length ? atts : undefined);
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.focus(); }
  }, [input, isLoading, sendMessage, pendingAttachments]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handlePromptClick = useCallback((prompt: string) => { sendMessage(prompt); }, [sendMessage]);

  const hasMessages = messages.length > 0;
  const lastMsg = messages[messages.length - 1];
  const lastIsAssistant = !!lastMsg && lastMsg.role === "assistant" && !isLoading && lastMsg.content.length > 0;
  const { options: parsedOptions, cleanContent: lastCleanContent } = lastIsAssistant
    ? extractOptions(lastMsg!.content) : { options: [] as ParsedOption[], cleanContent: "" };
  // Always offer reply chips on a terminal assistant turn unless the request was just submitted.
  // Suppress entirely while resuming a past conversation in read-only mode.
  const shouldOfferQuickReplies = lastIsAssistant && !looksSubmitted(lastCleanContent) && !isReadOnly;
  // When the model didn't supply options, fall back to generic conversational chips so the user always has chips.
  const GENERIC_FALLBACK_OPTIONS: ParsedOption[] = [{ value: "Yes" }, { value: "No" }, { value: "Tell me more" }];
  const effectiveOptions = parsedOptions.length > 0 ? parsedOptions : GENERIC_FALLBACK_OPTIONS;

  // Hide unavailable providers entirely (e.g. Claude only appears when the
  // server confirms credentials are configured).
  const availableProviders = (providers.length > 0 ? providers : [
    { id: "fast" as const, label: "Fast", available: true },
    { id: "smart" as const, label: "Smart", available: true },
  ]).filter(p => p.available);

  return (
    <div className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">
    <div className="flex flex-col h-full flex-1 min-w-0">
      <div className="border-b bg-background/95 backdrop-blur-sm px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md border border-border/50 overflow-hidden">
            <img src={logoIcon} alt="Friday Report" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">Power BI Report Request</h1>
            <p className="text-xs text-muted-foreground">AI-guided intake for new report requests</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSummaryOpen(true)}
              data-testid="button-open-summary"
            >
              <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Summary
            </Button>
            <Select value={model} onValueChange={(v) => setModel(v as PowerBIAgentModel)} disabled={isLoading}>
              <SelectTrigger className="h-8 w-[110px] text-xs" data-testid="select-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map(p => (
                  <SelectItem key={p.id} value={p.id} disabled={!p.available} data-testid={`model-option-${p.id}`}>
                    {p.label}{!p.available ? " (off)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <HistoryDrawer
              conversations={conversations}
              currentId={conversationId}
              onLoad={loadConversation}
              onRename={renameConversation}
              onDelete={deleteConversation}
              onNew={startNewConversation}
            />
            {isLoading && (
              <Button variant="outline" size="sm" onClick={stopGeneration}>
                <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
              </Button>
            )}
            {/* Confirm only when there is real progress to discard. Empty/read-only
                conversations reset immediately without a dialog. */}
            {hasMessages && !isReadOnly ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="button-reset" disabled={isLoading}>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Start a new request?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your current chat will be saved to history. You can pick it back up any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => startNewConversation()} data-testid="button-reset-confirm">
                      Start new
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                data-testid="button-reset"
                disabled={isLoading}
                onClick={() => startNewConversation()}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset
              </Button>
            )}
          </div>
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
              <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-lg border border-border/50 overflow-hidden">
                <img src={logoIcon} alt="Friday Report" className="w-full h-full object-contain" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Power BI Report Request</h2>
              <p className="text-muted-foreground max-w-md">
                Tell me about the Power BI report you need, and I'll guide you through the intake process to capture all the details for your project team.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 w-full max-w-2xl">
              {FEATURE_CARDS.map((card, i) => (
                <motion.div key={card.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.2 }}>
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
                <motion.div key={prompt} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.05 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs hover:border-orange-500/50 hover:bg-orange-500/5"
                    onClick={() => handlePromptClick(prompt)}
                    disabled={isLoading}
                  >
                    <Sparkles className="w-3 h-3 mr-1.5 text-orange-500" /> {prompt}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <AnimatePresence>
              {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
            </AnimatePresence>
            {shouldOfferQuickReplies && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="ml-11 mb-4 flex flex-wrap gap-2"
                data-testid="answer-options"
              >
                {effectiveOptions.map((opt, idx) => {
                  const isSuggested = !!opt.suggestedFrom;
                  return (
                    <Card
                      key={`${opt.value}-${idx}`}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSuggested
                          ? "border-emerald-500/60 bg-emerald-500/10 hover:border-emerald-500 hover:bg-emerald-500/15"
                          : "border-border/60 hover:border-orange-500/50 hover:bg-orange-500/5",
                      )}
                      onClick={() => handlePromptClick(opt.value)}
                      title={isSuggested ? `Suggested from ${opt.suggestedFrom}` : undefined}
                      data-testid={`option-${opt.value.replace(/\s+/g, "-").toLowerCase()}`}
                      data-suggested={isSuggested ? "true" : undefined}
                    >
                      <CardContent className="px-3 py-2 flex flex-col items-start gap-0.5">
                        {isSuggested && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5" />
                            Suggested from {opt.suggestedFrom}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Sparkles className={cn("w-3 h-3 flex-shrink-0", isSuggested ? "text-emerald-600" : "text-orange-500")} />
                          <span className="text-xs font-medium">{opt.value}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
                <Card
                  className="cursor-pointer border-dashed border-border/60 hover:border-muted-foreground/50 hover:bg-muted/40 transition-colors"
                  onClick={() => handlePromptClick("Skip this question")}
                  data-testid="option-skip"
                >
                  <CardContent className="px-3 py-2 flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Skip</span>
                  </CardContent>
                </Card>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t bg-background/95 backdrop-blur-sm px-6 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          {isReadOnly && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                You're viewing a past conversation. Continue to send a new message.
              </p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={continueConversation}
                  data-testid="button-continue-conversation"
                >
                  Continue conversation
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={startNewConversation}
                  data-testid="button-new-from-readonly"
                >
                  New request
                </Button>
              </div>
            </div>
          )}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2" data-testid="pending-attachments">
              {pendingAttachments.map((att, i) => (
                <AttachmentChip
                  key={i}
                  att={att}
                  onRemove={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleFileSelect}
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json"
              data-testid="input-file"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isReadOnly || isUploading || pendingAttachments.length >= MAX_ATTACHMENTS}
              size="icon"
              variant="outline"
              className="h-11 w-11 rounded-xl flex-shrink-0"
              title="Attach files (mockups, samples, data dictionaries)"
              data-testid="button-attach"
            >
              <Paperclip className={cn("w-4 h-4", isUploading && "animate-pulse")} />
            </Button>
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
              disabled={isLoading || isReadOnly}
            />
            <Button
              onClick={toggleVoiceInput}
              disabled={isLoading || !speechSupported}
              size="icon"
              variant={isListening ? "default" : "outline"}
              className={cn("h-11 w-11 rounded-xl flex-shrink-0",
                isListening && "bg-red-500 hover:bg-red-600 text-white border-red-500 animate-pulse")}
              title={!speechSupported ? "Voice input not supported in this browser" : isListening ? "Stop voice input" : "Start voice input"}
              data-testid="button-voice-input"
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && pendingAttachments.length === 0) || isLoading || isReadOnly}
              size="icon"
              className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 flex-shrink-0"
              data-testid="button-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          {isListening
            ? "Listening… click the mic again to stop."
            : "This agent captures your requirements — the team will follow up with a quote and timeline."}
        </p>
      </div>
    </div>
    {/* Right side: Request Summary panel (visible >= lg) */}
    <aside
      className="hidden lg:flex flex-col w-[320px] xl:w-[360px] border-l bg-muted/20 flex-shrink-0"
      data-testid="summary-panel-desktop"
    >
      <RequestSummaryPanel
        fields={intakeFields}
        sections={intakeSections}
        state={intakeState}
        isExtracting={isExtracting}
        isSubmitted={isSubmitted}
        onEditField={editIntakeField}
      />
    </aside>
    {/* Mobile/tablet: drawer */}
    <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
      <SheetContent side="right" className="w-[340px] sm:w-[380px] p-0 lg:hidden">
        <SheetHeader className="sr-only">
          <SheetTitle>Request Summary</SheetTitle>
        </SheetHeader>
        <RequestSummaryPanel
          fields={intakeFields}
          sections={intakeSections}
          state={intakeState}
          isExtracting={isExtracting}
          isSubmitted={isSubmitted}
          onEditField={editIntakeField}
        />
      </SheetContent>
    </Sheet>
    </div>
  );
}
