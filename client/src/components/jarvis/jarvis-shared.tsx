import { JSX } from "react";
import { Paperclip, FolderOpen, Briefcase, User2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { JarvisMessage } from "@/hooks/use-jarvis";
import { FridayCard, tryParseFridayCard } from "./FridayCard";

export const GLOBAL_PROMPTS = [
  "Which projects are at risk?",
  "What issues are blocking delivery?",
  "Summarize overall project health",
  "Draft an executive weekly update",
];

export const PROJECT_PROMPTS = [
  "Summarize this project's status",
  "What are the open risks for this project?",
  "List overdue tasks in this project",
  "Draft a status update for this project",
];

export const PORTFOLIO_PROMPTS = [
  "Summarize this portfolio's health",
  "Which projects in this portfolio are at risk?",
  "Show budget vs actual across this portfolio",
  "What are the top risks in this portfolio?",
];

export const RESOURCE_PROMPTS = [
  "What projects is this person assigned to?",
  "Show this resource's workload summary",
  "Are there any overdue tasks for this person?",
  "Summarize this resource's current assignments",
];

export function getSuggestedPrompts(entityType: string | null): string[] {
  switch (entityType) {
    case "project": return PROJECT_PROMPTS;
    case "portfolio": return PORTFOLIO_PROMPTS;
    case "resource": return RESOURCE_PROMPTS;
    default: return GLOBAL_PROMPTS;
  }
}

export function getContextIcon(entityType: string | null) {
  switch (entityType) {
    case "project": return FolderOpen;
    case "portfolio": return Briefcase;
    case "resource": return User2;
    default: return null;
  }
}

export function getContextLabel(entityType: string | null): string {
  switch (entityType) {
    case "project": return "Project scope";
    case "portfolio": return "Portfolio scope";
    case "resource": return "Resource scope";
    default: return "Organization scope";
  }
}

export const MAX_FILE_SIZE = 500 * 1024;
export const CSV_CHUNK_BYTES = 450 * 1024;

export const ALLOWED_FILE_TYPES = [
  "text/plain", "text/csv", "text/html", "text/xml", "text/markdown",
  "application/json", "application/xml", "application/csv",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const FILE_ACCEPT_ATTR = ".txt,.csv,.json,.xml,.md,.log,.yaml,.yml,.html,.htm,.sql,.js,.ts,.py,.pdf,.xls,.xlsx,.tsv,.ini,.conf,.cfg";

export const FILE_ALLOWED_EXTENSIONS = /\.(txt|csv|json|xml|md|log|yaml|yml|ini|conf|cfg|tsv|html|htm|sql|js|ts|py|rb|go|java|c|cpp|h|css|scss|less|pdf|xls|xlsx)$/i;

export function splitCsvIntoChunks(text: string, maxBytes: number): string[] {
  const lines = text.split(/\r?\n/);
  const header = lines[0] ?? "";
  const dataRows = lines.slice(1).filter(l => l.trim());
  const chunks: string[] = [];
  let current = header;
  for (const row of dataRows) {
    const candidate = current + "\n" + row;
    if (new Blob([candidate]).size > maxBytes && current !== header) {
      chunks.push(current);
      current = header + "\n" + row;
    } else {
      current = candidate;
    }
  }
  if (current !== header) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

type Variant = "panel" | "page";

interface MarkdownContentProps {
  content: string;
  onNavigate?: (path: string) => void;
  variant?: Variant;
}

let inlineKeyCounter = 0;

function renderInline(
  text: string,
  onNavigate: ((path: string) => void) | undefined,
  variant: Variant,
): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /(\*\*\[([^\]]+)\]\((\/.+?)\)\*\*)|(\*\*(.+?)\*\*)|(`(.+?)`)|(\[([^\]]+)\]\((\/.+?)\))/g;
  let lastIndex = 0;
  let match;

  const linkClass = variant === "page"
    ? "text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/40 hover:decoration-primary/60 transition-colors cursor-pointer font-semibold"
    : "text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/40 hover:decoration-cyan-400/60 transition-colors cursor-pointer font-semibold";

  const linkClassPlain = variant === "page"
    ? "text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/40 hover:decoration-primary/60 transition-colors cursor-pointer font-medium"
    : "text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/40 hover:decoration-cyan-400/60 transition-colors cursor-pointer font-medium";

  const strongClass = variant === "page"
    ? "font-semibold text-foreground"
    : "font-semibold text-cyan-200";

  const codeClass = variant === "page"
    ? "bg-muted border border-border px-1 py-0.5 rounded text-xs font-mono text-foreground"
    : "bg-cyan-900/30 border border-cyan-700/30 px-1 py-0.5 rounded text-xs font-mono text-cyan-300";

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      const linkText = match[2];
      const linkPath = match[3];
      const isDownload = linkPath.startsWith("/api/");
      parts.push(
        isDownload ? (
          <a
            key={`il-${inlineKeyCounter++}`}
            href={linkPath}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
            data-testid="link-friday-download"
          >
            {linkText}
          </a>
        ) : (
          <button
            key={`il-${inlineKeyCounter++}`}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate?.(linkPath);
            }}
            className={linkClass}
          >
            {linkText}
          </button>
        )
      );
    } else if (match[5]) {
      parts.push(
        <strong key={`il-${inlineKeyCounter++}`} className={strongClass}>
          {renderInline(match[5], onNavigate, variant)}
        </strong>
      );
    } else if (match[7]) {
      parts.push(
        <code key={`il-${inlineKeyCounter++}`} className={codeClass}>{match[7]}</code>
      );
    } else if (match[9] && match[10]) {
      const linkText = match[9];
      const linkPath = match[10];
      const isDownload = linkPath.startsWith("/api/");
      parts.push(
        isDownload ? (
          <a
            key={`il-${inlineKeyCounter++}`}
            href={linkPath}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassPlain}
            data-testid="link-friday-download"
          >
            {linkText}
          </a>
        ) : (
          <button
            key={`il-${inlineKeyCounter++}`}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNavigate?.(linkPath);
            }}
            className={linkClassPlain}
          >
            {linkText}
          </button>
        )
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

export function MarkdownContent({ content, onNavigate, variant = "panel" }: MarkdownContentProps) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];

  const h3Class = variant === "page" ? "font-semibold text-sm mt-3 mb-1 text-foreground" : "font-semibold text-sm mt-3 mb-1 text-cyan-300";
  const h2Class = variant === "page" ? "font-semibold text-base mt-3 mb-1 text-foreground" : "font-semibold text-base mt-3 mb-1 text-cyan-200";
  const h1Class = variant === "page" ? "font-bold text-lg mt-3 mb-1 text-foreground" : "font-bold text-lg mt-3 mb-1 text-cyan-100";
  const bulletClass = variant === "page" ? "text-muted-foreground mt-0.5 flex-shrink-0" : "text-cyan-500 mt-0.5 flex-shrink-0";
  const subBulletClass = variant === "page" ? "text-muted-foreground mt-0.5 flex-shrink-0" : "text-cyan-300 mt-0.5 flex-shrink-0";
  const orderedNumClass = variant === "page" ? "text-muted-foreground flex-shrink-0 font-medium" : "text-cyan-400 flex-shrink-0 font-medium";
  const quoteClass = variant === "page"
    ? "border-l-2 border-border pl-3 py-0.5 text-muted-foreground italic"
    : "border-l-2 border-cyan-500/40 pl-3 py-0.5 text-cyan-300/80 italic";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect fenced friday-card block
    if (line.trim().startsWith("```friday-card")) {
      const jsonLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("```")) {
        jsonLines.push(lines[j]);
        j++;
      }
      const jsonText = jsonLines.join("\n").trim();
      // If we found a closing fence, render the card; otherwise skip rendering until streaming completes
      const hasClose = j < lines.length && lines[j].trim().startsWith("```");
      if (hasClose && jsonText.length > 0) {
        const card = tryParseFridayCard(jsonText);
        if (card) {
          elements.push(
            <FridayCard key={`fc-${i}`} card={card} onNavigate={onNavigate} />
          );
        } else {
          // Fall back to raw code block if JSON parse fails
          elements.push(
            <pre key={`fc-raw-${i}`} className="my-2 rounded-md border border-border bg-muted/40 p-2 text-xs overflow-x-auto">
              <code>{jsonText}</code>
            </pre>
          );
        }
        i = j; // skip past the closing fence
        continue;
      }
      // Streaming-incomplete: show shimmer placeholder
      elements.push(
        <div key={`fc-pending-${i}`} className="my-2 h-12 rounded-md border border-border bg-muted/40 animate-pulse" />
      );
      i = j - 1; // we consumed up to j-1; outer loop will i++
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className={h3Class}>{renderInline(line.slice(4), onNavigate, variant)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className={h2Class}>{renderInline(line.slice(3), onNavigate, variant)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className={h1Class}>{renderInline(line.slice(2), onNavigate, variant)}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className={bulletClass}>&#9670;</span>
          <span>{renderInline(line.slice(2), onNavigate, variant)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1.5 ml-2">
            <span className={orderedNumClass}>{match[1]}.</span>
            <span>{renderInline(match[2], onNavigate, variant)}</span>
          </div>
        );
      }
    } else if (line.startsWith("  - ") || line.startsWith("  * ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 ml-6">
          <span className={subBulletClass}>&#9672;</span>
          <span>{renderInline(line.slice(4), onNavigate, variant)}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
    } else if (line.startsWith("> ")) {
      elements.push(
        <div key={i} className={quoteClass}>
          {renderInline(line.slice(2), onNavigate, variant)}
        </div>
      );
    } else {
      elements.push(<p key={i}>{renderInline(line, onNavigate, variant)}</p>);
    }
  }

  return <div className="space-y-0.5 text-sm leading-relaxed">{elements}</div>;
}

interface MessageBubbleProps {
  message: JarvisMessage;
  index: number;
  onNavigate?: (path: string) => void;
  variant?: Variant;
}

export function MessageBubble({ message, index, onNavigate, variant = "panel" }: MessageBubbleProps) {
  const isUser = message.role === "user";

  const userBubbleClass = variant === "page"
    ? "bg-primary text-primary-foreground ml-8 max-w-[85%]"
    : "bg-cyan-500/10 border border-cyan-500/20 text-cyan-100 ml-8 max-w-[85%]";

  const assistantBubbleClass = variant === "page"
    ? "bg-transparent text-foreground w-full"
    : "bg-slate-800/50 border border-slate-700/30 text-slate-200 w-full";

  const attachmentChipClass = variant === "page"
    ? "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-primary-foreground/10 text-primary-foreground/90 border border-primary-foreground/20"
    : "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-cyan-900/20 text-cyan-500 border border-cyan-800/20";

  const loadingTextClass = variant === "page" ? "text-muted-foreground" : "text-cyan-400/60";
  const loadingDotClass = variant === "page" ? "bg-muted-foreground" : "bg-cyan-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className={cn("flex gap-2 py-2", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div className={cn(
        "min-w-0 rounded-lg px-4 py-2.5",
        isUser ? userBubbleClass : assistantBubbleClass
      )}>
        {isUser ? (
          <div>
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {message.attachments.map(a => (
                  <span key={a.name} className={attachmentChipClass}>
                    <Paperclip className="h-2 w-2" />
                    {a.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : message.content ? (
          <MarkdownContent content={message.content} onNavigate={onNavigate} variant={variant} />
        ) : (
          <div className={cn("flex items-center gap-2 text-sm", loadingTextClass)}>
            <div className="flex gap-1">
              <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", loadingDotClass)} style={{ animationDelay: "0ms" }} />
              <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", loadingDotClass)} style={{ animationDelay: "150ms" }} />
              <span className={cn("w-1.5 h-1.5 rounded-full animate-bounce", loadingDotClass)} style={{ animationDelay: "300ms" }} />
            </div>
            Analyzing data...
          </div>
        )}
      </div>
    </motion.div>
  );
}
