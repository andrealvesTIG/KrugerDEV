import { JSX, memo, useEffect, useState } from "react";
import {
  Paperclip,
  FolderOpen,
  Briefcase,
  User2,
  Building2,
  LineChart,
  Bot,
  HardHat,
  Sparkles,
  Compass,
  AlertTriangle,
  TrendingUp,
  ClipboardList,
  Wallet,
  Check,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { JarvisMessage } from "@/hooks/use-jarvis";
import { FridayCard, tryParseFridayCard } from "./FridayCard";
import { FridayGanttChart, tryParseFridayGanttChart } from "./FridayGanttChart";
import {
  FridayBurndownChart,
  FridaySCurveChart,
  tryParseFridayBurndownChart,
  tryParseFridaySCurveChart,
} from "./FridayProgressCharts";
import { FridayReportCard, tryParseFridayReport } from "./FridayReportCard";

export const GLOBAL_PROMPTS = [
  "Which projects are at risk?",
  "What issues are blocking delivery?",
  "Summarize overall project health",
  "Draft an executive weekly update",
];

// Industry choices shown during Friday's onboarding empty state. Keys must
// stay in sync with `SUPPORTED_ONBOARDING_INDUSTRIES` on the backend; the
// trailing "Other" option falls back to the General template.
export const ONBOARDING_INDUSTRY_OPTIONS: Array<{
  key: string;
  label: string;
  message: string;
  icon: typeof Briefcase;
}> = [
  { key: "Capital Projects", label: "Capital Projects", message: "I work on Capital Projects (FEL / EPC / owner-side) — I'd like to set up the workspace.", icon: Building2 },
  { key: "Project Controls", label: "Project Controls", message: "I work in Project Controls (cost, schedule, EVM) — I'd like to set up the workspace.", icon: LineChart },
  { key: "Industrial Automation", label: "Industrial Automation", message: "I work in Industrial Automation (PLC / SCADA / OT) — I'd like to set up the workspace.", icon: Bot },
  { key: "Construction", label: "Construction", message: "I work in Construction (GC / sub / owner) — I'd like to set up the workspace.", icon: HardHat },
  { key: "Other", label: "Something else", message: "My industry isn't listed — can you ask me a few questions to help set things up?", icon: Sparkles },
];

// "What are you trying to do" suggestions shown on the second row.
export const ONBOARDING_GOAL_OPTIONS: Array<{
  key: string;
  label: string;
  message: string;
  icon: typeof Briefcase;
}> = [
  { key: "portfolio", label: "Manage a capital project portfolio", message: "I want to manage a portfolio of capital projects across my team.", icon: Briefcase },
  { key: "controls", label: "Stand up project controls", message: "I want to stand up project controls — cost, schedule, change, and reporting.", icon: ClipboardList },
  { key: "explore", label: "Just exploring", message: "I'm just exploring the app for now — show me what it can do.", icon: Compass },
  { key: "evm", label: "Run earned value (EVM / CPI / SPI)", message: "I want to run earned value management with CPI and SPI on my projects.", icon: TrendingUp },
  { key: "risks", label: "Track risks, RFIs, and issues", message: "I want to track risks, RFIs, submittals, and issues across my projects.", icon: AlertTriangle },
];

interface OnboardingPromptsProps {
  variant?: "panel" | "page";
  onPick: (message: string) => void;
  // When true, omit the internal greeting headline and the trailing
  // "Or just type your own message below." footnote so the parent shell
  // (e.g. AI Mode's standard hero) can own the headline/subtitle and the
  // composer is the obvious next step on its own.
  hideGreeting?: boolean;
}

export function OnboardingPrompts({ variant = "page", onPick, hideGreeting = false }: OnboardingPromptsProps) {
  const isPanel = variant === "panel";

  const sectionLabelClass = isPanel
    ? "text-[10px] font-medium text-cyan-300 uppercase tracking-widest mb-2"
    : "text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3";

  const buttonClass = isPanel
    ? "group flex items-center gap-2 px-3 py-2 text-xs text-left rounded border border-cyan-900/30 text-cyan-100 hover:text-cyan-300 hover:bg-cyan-900/20 hover:border-cyan-700/30 transition-all"
    : "group flex items-center gap-3 text-left p-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all shadow-sm";

  const iconWrapClass = isPanel
    ? "flex items-center justify-center h-6 w-6 rounded-md bg-cyan-900/30 text-cyan-300 group-hover:text-cyan-200 transition-colors flex-shrink-0"
    : "flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors flex-shrink-0";

  const labelClass = isPanel
    ? "truncate text-cyan-100 group-hover:text-cyan-200"
    : "text-sm text-foreground";

  const greetingTitle = isPanel
    ? "text-sm font-semibold text-cyan-100 mb-1"
    : "text-xl md:text-2xl font-semibold text-foreground mb-2";

  const greetingSubtitle = isPanel
    ? "text-xs text-cyan-300/80 mb-4 leading-relaxed"
    : "text-sm text-muted-foreground mb-6 leading-relaxed";

  return (
    <div className={isPanel ? "w-full max-w-xs px-2" : "w-full max-w-2xl mx-auto"}>
      {!hideGreeting && (
        <div className={isPanel ? "text-center" : "text-center"}>
          <p className={greetingTitle}>Welcome — let's set up your workspace</p>
          <p className={greetingSubtitle}>
            FridayReport.AI is built for capital projects, project controls, industrial automation, and construction. Pick the focus that fits best and I'll seed portfolios, projects, milestones, risks, and starter resources tuned to it.
          </p>
        </div>
      )}

      <div className={isPanel ? "mb-3" : "mb-6"}>
        <p className={sectionLabelClass}>Pick your industry</p>
        <div className={isPanel ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-2 sm:grid-cols-3 gap-2"}>
          {ONBOARDING_INDUSTRY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onPick(opt.message)}
                className={buttonClass}
                data-testid={`button-friday-onboard-industry-${opt.key.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span className={iconWrapClass}>
                  <Icon className={isPanel ? "h-3 w-3" : "h-4 w-4"} />
                </span>
                <span className={labelClass}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={sectionLabelClass}>What do you want to do?</p>
        <div className={isPanel ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
          {ONBOARDING_GOAL_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            // "Just exploring" sits in the middle of the 5-card grid and
            // we want it visually centered on its own row in the page
            // variant (2-col grid). Spanning both columns with a
            // half-width cap and `mx-auto` keeps the card the same size
            // as its peers while centering it under the rows above and
            // below. Skipped in the panel variant (single column) where
            // everything is already centered.
            const isExplore = opt.key === "explore";
            const cellClass = !isPanel && isExplore
              ? "sm:col-span-2 sm:mx-auto sm:w-[calc(50%-0.25rem)]"
              : "";
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onPick(opt.message)}
                className={cn(buttonClass, cellClass)}
                data-testid={`button-friday-onboard-goal-${opt.key}`}
              >
                <span className={iconWrapClass}>
                  <Icon className={isPanel ? "h-3 w-3" : "h-4 w-4"} />
                </span>
                <span className={labelClass}>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!hideGreeting && (
        <p className={cn(
          "mt-4 text-center",
          isPanel ? "text-[10px] text-cyan-400/70" : "text-xs text-muted-foreground",
        )}>
          Or just type your own message below.
        </p>
      )}
    </div>
  );
}

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
  onQuickReply?: (text: string) => void;
  /**
   * Which chip on this bubble's `quick-replies` block was clicked
   * previously, if any. When set, the chip block renders the matching
   * option as "selected" (filled + check) and the others muted, and all
   * chips are disabled — Friday's confirmation flows are one-shot.
   * Undefined means "no selection yet" — render the chips in their
   * default unselected, clickable state.
   */
  quickReplySelection?: string;
}

// One-time discoverability tip for the new clickable Yes/No (and other small
// discrete-answer) chips Friday now sends by default. We show a small inline
// hint above the very first chip row a user sees, then never again. Persist
// the seen flag in localStorage so it survives reloads, and use a module-level
// flag so only one chip row in the current page session ever claims the tip
// (subsequent rows render plain).
// We *also* suppress the tip for users who have already used Friday's chat
// (i.e. their account already has prior chat history when this feature
// shipped). The panel/page mount-time effects call `markChatStarted()` as
// soon as they observe a non-empty conversation list at load time, so
// returning users never get a tip about a behaviour they're already
// familiar with — only true first-timers see it.
const QUICK_REPLY_TIP_STORAGE_KEY = "friday:quickRepliesTipSeen";
const CHAT_STARTED_STORAGE_KEY = "friday:hasUsedChat";
let quickReplyTipClaimed = false;

function hasSeenQuickReplyTip(): boolean {
  try {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(QUICK_REPLY_TIP_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

function markQuickReplyTipSeen(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(QUICK_REPLY_TIP_STORAGE_KEY, "1");
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

function hasUsedFridayChat(): boolean {
  try {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(CHAT_STARTED_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

// Called by the panel/page hosts the moment they observe any prior
// conversation history at load time. Idempotent — safe to call on every
// render.
export function markChatStarted(): void {
  try {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(CHAT_STARTED_STORAGE_KEY) === "1") return;
    window.localStorage.setItem(CHAT_STARTED_STORAGE_KEY, "1");
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

interface QuickRepliesBlockProps {
  options: string[];
  variant: Variant;
  onQuickReply?: (text: string) => void;
  /**
   * Which chip on this bubble's `quick-replies` block was clicked
   * previously, if any. When set, the matching option renders as
   * "selected" (filled + check) and the others render muted; all
   * chips are disabled — Friday's confirmation flows are one-shot.
   */
  quickReplySelection?: string;
}

function QuickRepliesBlock({ options, variant, onQuickReply, quickReplySelection }: QuickRepliesBlockProps) {
  const hasSelection = typeof quickReplySelection === "string" && quickReplySelection.length > 0;

  // Decide once on mount whether *this* chip row gets to be the tip-bearer.
  // After this row claims it, no other row in the session will show the tip.
  // We also skip the tip entirely on rows that already have a previous
  // selection — there's nothing to discover when every chip is locked.
  // Independent gates:
  //   1. No prior selection on this row.
  //   2. The user hasn't already dismissed/seen the tip (localStorage).
  //   3. The user hasn't already used Friday's chat — returning users
  //      with prior history skip the tip entirely.
  //   4. No earlier chip row in this page session has claimed the tip.
  const [showTip, setShowTip] = useState<boolean>(() => {
    if (hasSelection) return false;
    if (hasSeenQuickReplyTip()) return false;
    if (hasUsedFridayChat()) return false;
    if (quickReplyTipClaimed) return false;
    quickReplyTipClaimed = true;
    return true;
  });

  // Auto-dismiss the tip after a few seconds even if the user never clicks a
  // chip, so it doesn't linger forever next to a stale message.
  useEffect(() => {
    if (!showTip) return;
    const timer = window.setTimeout(() => {
      setShowTip(false);
      markQuickReplyTipSeen();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [showTip]);

  const dismissTip = () => {
    if (!showTip) return;
    setShowTip(false);
    markQuickReplyTipSeen();
  };

  const handleClick = (opt: string) => {
    if (hasSelection) return;
    dismissTip();
    onQuickReply?.(opt);
  };

  // Three visual states:
  //  - default (no selection yet): clickable chip with the standard hover
  //    affordance.
  //  - selected (this option was the user's pick): filled, checkmarked,
  //    disabled — the visual anchor when scrolling back through history.
  //  - muted (a sibling of the selected option): low opacity, disabled,
  //    no hover — clearly "rejected" without deleting the alternatives.
  // Disabled-because-no-handler (e.g. SSR / printing) reuses the muted
  // style so the row never looks half-interactive.
  const chipBase = "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-all";
  const defaultChipClass = variant === "page"
    ? `${chipBase} border border-border bg-card hover:bg-accent hover:border-primary/40 text-foreground shadow-sm disabled:opacity-50 disabled:cursor-not-allowed`
    : `${chipBase} border border-cyan-700/40 bg-cyan-900/20 text-cyan-100 hover:bg-cyan-800/40 hover:border-cyan-500/60 hover:text-cyan-50 disabled:opacity-50 disabled:cursor-not-allowed`;
  const selectedChipClass = variant === "page"
    ? `${chipBase} border border-primary bg-primary text-primary-foreground shadow-sm cursor-default font-medium`
    : `${chipBase} border border-cyan-400/80 bg-cyan-500/30 text-cyan-50 cursor-default font-medium`;
  const mutedChipClass = variant === "page"
    ? `${chipBase} border border-border/60 bg-muted/40 text-muted-foreground line-through cursor-not-allowed opacity-60`
    : `${chipBase} border border-cyan-900/30 bg-cyan-950/30 text-cyan-300/50 line-through cursor-not-allowed opacity-60`;

  const tipClass = variant === "page"
    ? "mb-1.5 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] text-foreground/80"
    : "mb-1.5 inline-flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100";

  const tipDismissClass = variant === "page"
    ? "rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    : "rounded p-0.5 text-cyan-300/70 hover:text-cyan-100 hover:bg-cyan-800/40 transition-colors";

  return (
    <div className="my-2" data-testid="quick-replies-block">
      {showTip && (
        <div className={tipClass} data-testid="quick-replies-tip" role="status">
          <Sparkles className="h-3 w-3 flex-shrink-0" />
          <span>New: tap an answer to send it instantly.</span>
          <button
            type="button"
            onClick={dismissTip}
            aria-label="Dismiss tip"
            className={tipDismissClass}
            data-testid="button-dismiss-quick-replies-tip"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div
        className="flex flex-wrap gap-1.5"
        data-testid="quick-replies"
        data-quick-reply-selection={hasSelection ? quickReplySelection : undefined}
      >
        {options.map((opt, idx) => {
          const isSelected = hasSelection && opt === quickReplySelection;
          const isMuted = hasSelection && !isSelected;
          const cls = isSelected
            ? selectedChipClass
            : isMuted
              ? mutedChipClass
              : defaultChipClass;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleClick(opt)}
              disabled={!onQuickReply || hasSelection}
              aria-pressed={isSelected || undefined}
              className={cls}
              data-testid={`quick-reply-${idx}`}
              data-state={isSelected ? "selected" : isMuted ? "muted" : "default"}
            >
              {isSelected && <Check className="h-3 w-3" aria-hidden="true" />}
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function tryParseQuickReplies(jsonText: string): string[] | null {
  try {
    const parsed = JSON.parse(jsonText);
    let opts: unknown;
    if (Array.isArray(parsed)) opts = parsed;
    else if (parsed && typeof parsed === "object") opts = (parsed as any).options;
    if (!Array.isArray(opts)) return null;
    const cleaned = opts
      .map((o) => (typeof o === "string" ? o : typeof o === "object" && o && typeof (o as any).label === "string" ? (o as any).label : null))
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 8);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
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

export function MarkdownContent({ content, onNavigate, variant = "panel", onQuickReply, quickReplySelection }: MarkdownContentProps) {
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

    // Detect fenced gantt-chart block
    if (line.trim().startsWith("```gantt-chart")) {
      const jsonLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("```")) {
        jsonLines.push(lines[j]);
        j++;
      }
      const jsonText = jsonLines.join("\n").trim();
      const hasClose = j < lines.length && lines[j].trim().startsWith("```");
      if (hasClose && jsonText.length > 0) {
        const chart = tryParseFridayGanttChart(jsonText);
        if (chart) {
          elements.push(
            <FridayGanttChart key={`gc-${i}`} data={chart} onNavigate={onNavigate} variant={variant} />
          );
        } else {
          elements.push(
            <div
              key={`gc-fallback-${i}`}
              className="my-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              I couldn't render this Gantt chart. Open the project's Gantt view to see the full schedule.
            </div>
          );
        }
        i = j;
        continue;
      }
      elements.push(
        <div key={`gc-pending-${i}`} className="my-2 h-32 rounded-md border border-border bg-muted/40 animate-pulse" />
      );
      i = j - 1;
      continue;
    }

    // Detect fenced burndown-chart block
    if (line.trim().startsWith("```burndown-chart")) {
      const jsonLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("```")) {
        jsonLines.push(lines[j]);
        j++;
      }
      const jsonText = jsonLines.join("\n").trim();
      const hasClose = j < lines.length && lines[j].trim().startsWith("```");
      if (hasClose && jsonText.length > 0) {
        const chart = tryParseFridayBurndownChart(jsonText);
        if (chart) {
          elements.push(
            <FridayBurndownChart key={`bd-${i}`} data={chart} onNavigate={onNavigate} variant={variant} />
          );
        } else {
          elements.push(
            <div
              key={`bd-fallback-${i}`}
              className="my-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              I couldn't render this burndown chart.
            </div>
          );
        }
        i = j;
        continue;
      }
      elements.push(
        <div key={`bd-pending-${i}`} className="my-2 h-32 rounded-md border border-border bg-muted/40 animate-pulse" />
      );
      i = j - 1;
      continue;
    }

    // Detect fenced s-curve block
    if (line.trim().startsWith("```s-curve")) {
      const jsonLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("```")) {
        jsonLines.push(lines[j]);
        j++;
      }
      const jsonText = jsonLines.join("\n").trim();
      const hasClose = j < lines.length && lines[j].trim().startsWith("```");
      if (hasClose && jsonText.length > 0) {
        const chart = tryParseFridaySCurveChart(jsonText);
        if (chart) {
          elements.push(
            <FridaySCurveChart key={`sc-${i}`} data={chart} onNavigate={onNavigate} variant={variant} />
          );
        } else {
          elements.push(
            <div
              key={`sc-fallback-${i}`}
              className="my-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              I couldn't render this S-curve chart.
            </div>
          );
        }
        i = j;
        continue;
      }
      elements.push(
        <div key={`sc-pending-${i}`} className="my-2 h-32 rounded-md border border-border bg-muted/40 animate-pulse" />
      );
      i = j - 1;
      continue;
    }

    // Detect fenced quick-replies block
    if (line.trim().startsWith("```quick-replies")) {
      const jsonLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("```")) {
        jsonLines.push(lines[j]);
        j++;
      }
      const jsonText = jsonLines.join("\n").trim();
      const hasClose = j < lines.length && lines[j].trim().startsWith("```");
      if (hasClose) {
        // Closed block: render chips on success, raw code-block fallback on
        // parse failure, and nothing for an empty payload (so we never leave
        // a permanent shimmer behind once streaming is complete).
        if (jsonText.length > 0) {
          const options = tryParseQuickReplies(jsonText);
          if (options && options.length > 0) {
            elements.push(
              <QuickRepliesBlock
                key={`qr-${i}`}
                options={options}
                variant={variant}
                onQuickReply={onQuickReply}
                quickReplySelection={quickReplySelection}
              />
            );
          } else {
            // Malformed JSON: fall back to raw code block so the user can see
            // the model's output instead of a silent disappearance.
            elements.push(
              <pre key={`qr-raw-${i}`} className="my-2 rounded-md border border-border bg-muted/40 p-2 text-xs overflow-x-auto">
                <code>{jsonText}</code>
              </pre>
            );
          }
        }
        i = j;
        continue;
      }
      // Streaming-incomplete (no closing fence yet): show shimmer placeholder
      elements.push(
        <div key={`qr-pending-${i}`} className="my-2 h-8 w-40 rounded-full border border-border bg-muted/40 animate-pulse" />
      );
      i = j - 1;
      continue;
    }

    // Detect fenced report block (rich HTML report)
    if (line.trim().startsWith("```report")) {
      const bodyLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "```") {
        bodyLines.push(lines[j]);
        j++;
      }
      const bodyText = bodyLines.join("\n");
      const hasClose = j < lines.length && lines[j].trim() === "```";
      if (hasClose && bodyText.trim().length > 0) {
        const report = tryParseFridayReport(bodyText);
        if (report) {
          elements.push(
            <FridayReportCard
              key={`rp-${i}`}
              report={report}
              variant={variant}
              onNavigate={onNavigate}
            />
          );
        } else {
          elements.push(
            <div
              key={`rp-fallback-${i}`}
              className="my-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              I couldn't render this report. The header may be malformed — please ask me to regenerate it.
            </div>
          );
        }
        i = j;
        continue;
      }
      // Streaming-incomplete: show shimmer placeholder
      elements.push(
        <div
          key={`rp-pending-${i}`}
          className="my-3 h-40 rounded-md border border-border bg-muted/40 animate-pulse"
        />
      );
      i = j - 1;
      continue;
    }

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
  /**
   * Fired when the user clicks a chip on this bubble. The first arg is
   * the bubble's message id (e.g. `srv-123`) so the parent can persist
   * the selection against the right server row before/while sending the
   * follow-up user message.
   */
  onQuickReply?: (messageId: string, text: string) => void;
}

function MessageBubbleImpl({ message, index, onNavigate, variant = "panel", onQuickReply }: MessageBubbleProps) {
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

  if (!isUser && !message.content) {
    return null;
  }

  // Friday stamps `creditsUsed` on completed assistant replies (in
  // display credits, summed across every round). Show it as a small
  // muted indicator under the bubble so users can see what each reply
  // cost without leaving the chat. Hidden for user messages, missing
  // values, and limit-exceeded errors (where creditsUsed is undefined).
  const showCredits =
    !isUser && typeof message.creditsUsed === "number" && message.creditsUsed > 0;
  const creditsLabel = showCredits
    ? `Used ${formatCredits(message.creditsUsed!)} credit${message.creditsUsed === 1 ? "" : "s"}`
    : null;
  const creditsClass = variant === "page"
    ? "mt-0.5 ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
    : "mt-0.5 ml-1 inline-flex items-center gap-1 text-[10px] text-slate-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className={cn("flex gap-2 py-2", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div className={cn(
        "min-w-0",
        isUser ? "" : "w-full",
      )}>
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
          ) : (
            <MarkdownContent
              content={message.content}
              onNavigate={onNavigate}
              variant={variant}
              // Bind the message id at the bubble boundary so MarkdownContent
              // (and the chip render inside it) doesn't need to know about
              // server ids — it just calls `onQuickReply(opt)`.
              onQuickReply={onQuickReply ? (text) => onQuickReply(message.id, text) : undefined}
              quickReplySelection={message.quickReplySelection}
            />
          )}
        </div>
        {creditsLabel && (
          <div
            className={creditsClass}
            data-testid={`text-friday-reply-credits-${index}`}
            title="Credits charged for this reply, summed across every round and tool call. Matches the entry in your Billing ledger."
          >
            <Wallet className="h-2.5 w-2.5" />
            {creditsLabel}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Preserve the full ledger precision (credits are tracked in hundredths,
// so up to 2 decimal places). Whole numbers render without a decimal
// (e.g. "3"), fractional values render with the minimum decimals needed
// to match the ledger exactly (e.g. "2.25", "0.5"). Uses toLocaleString
// so larger numbers get a thousands separator.
function formatCredits(value: number): string {
  // Snap to the nearest hundredth to absorb any float jitter from the
  // hundredths → display-credit divide on the wire, without ever
  // rounding away meaningful precision the ledger recorded.
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toLocaleString();
  // Trim a trailing zero on tenth-precision values (2.50 → "2.5") while
  // keeping true hundredth-precision values intact (2.25 → "2.25").
  const oneDecimal = Math.round(rounded * 10) / 10 === rounded;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: oneDecimal ? 1 : 2,
    maximumFractionDigits: 2,
  });
}

// Memoize MessageBubble so completed messages don't re-render every time
// the streaming bubble's content grows. The streaming bubble is the last
// in the list; its content prop changes per rAF flush. Every other bubble
// has stable props, so React skips the entire markdown re-parse.
//
// `quickReplySelection` is included in the comparator so a freshly
// clicked chip flips to its "selected" state on the very next render
// instead of being skipped by the memo.
export const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.message.content === next.message.content &&
    prev.message.quickReplySelection === next.message.quickReplySelection &&
    prev.index === next.index &&
    prev.variant === next.variant &&
    prev.onNavigate === next.onNavigate &&
    prev.onQuickReply === next.onQuickReply
  );
});
