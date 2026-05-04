import { useMemo, useState, useRef, useCallback } from "react";
import DOMPurify from "dompurify";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/use-organization";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText,
  Copy,
  Printer,
  Download,
  FileDown,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClipboardItemConstructor {
  new (items: Record<string, Blob>): unknown;
}
type ClipboardCapableWindow = Window & { ClipboardItem?: ClipboardItemConstructor };

function getClipboardItemCtor(): ClipboardItemConstructor | undefined {
  return (window as ClipboardCapableWindow).ClipboardItem;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

export interface FridayReportData {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  html: string;
}

interface FridayReportCardProps {
  report: FridayReportData;
  variant?: "panel" | "page";
  onNavigate?: (path: string) => void;
}

const COLLAPSED_MAX_PX = 600;

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "div", "span", "section", "article", "header", "footer", "main", "aside", "nav",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "strong", "em", "b", "i", "u", "s", "small", "sub", "sup", "mark", "del", "ins",
  "code", "pre", "blockquote", "kbd", "samp", "var", "abbr", "cite", "q",
  "a", "img", "figure", "figcaption", "dl", "dt", "dd",
];

const ALLOWED_ATTR = [
  "href", "title", "alt", "src", "width", "height",
  "colspan", "rowspan", "scope", "align", "valign",
  "class", "style", "id",
  "target", "rel",
  "data-testid",
];

const ALLOWED_STYLE_PROPS = new Set([
  "color", "background", "background-color",
  "text-align", "vertical-align",
  "font-weight", "font-style", "font-size", "font-family",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-width", "border-style", "border-radius", "border-collapse",
  "width", "max-width", "min-width", "height",
  "line-height", "letter-spacing", "text-decoration", "text-transform",
  "white-space", "word-break", "list-style", "list-style-type",
]);

function sanitizeStyle(style: string): string {
  return style
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => decl.length > 0)
    .filter((decl) => {
      const colon = decl.indexOf(":");
      if (colon < 0) return false;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      const val = decl.slice(colon + 1).trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPS.has(prop)) return false;
      if (/url\s*\(/.test(val)) return false;
      if (/expression\s*\(/.test(val)) return false;
      if (/javascript:/.test(val)) return false;
      return true;
    })
    .join("; ");
}

export function isSafeImageSrc(src: string): boolean {
  if (!src) return false;
  // Reject protocol-relative URLs (e.g. "//evil.com/x.png") — they load from
  // an arbitrary external origin.
  if (src.startsWith("//")) return false;
  if (src.startsWith("data:image/")) return true;
  // Root-relative same-origin path.
  if (src.startsWith("/")) return true;
  try {
    const url = new URL(src, window.location.origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function sanitizeReportHtml(rawHtml: string): string {
  if (typeof window === "undefined") return "";
  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "style", "link", "meta", "base"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "onkeydown", "onkeyup", "onkeypress"],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
  });

  const doc = new DOMParser().parseFromString(`<div>${clean}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";

  // Belt-and-braces: remove any element whose tag is not in our allow-list,
  // unwrapping its text content. DOMPurify should already do this, but some
  // engines/test environments treat ALLOWED_TAGS less strictly than expected.
  const allowedTagSet = new Set(ALLOWED_TAGS);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const offenders: Element[] = [];
  let cur: Node | null = walker.currentNode;
  while ((cur = walker.nextNode())) {
    const el = cur as Element;
    if (!allowedTagSet.has(el.tagName.toLowerCase())) offenders.push(el);
  }
  // Process from deepest first so we don't try to operate on nodes that have
  // already been detached when an ancestor was replaced.
  const depth = (n: Element): number => {
    let d = 0;
    let p: Node | null = n.parentNode;
    while (p) { d++; p = p.parentNode; }
    return d;
  };
  offenders.sort((a, b) => depth(b) - depth(a));
  for (const el of offenders) {
    const parent = el.parentNode;
    if (!parent || !root.contains(el)) continue;
    const text = doc.createTextNode(el.textContent || "");
    try {
      parent.replaceChild(text, el);
    } catch {
      try { parent.removeChild(el); } catch { /* noop */ }
    }
  }

  root.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (/^\s*javascript:/i.test(href)) {
      a.removeAttribute("href");
    } else if (/^https?:\/\//i.test(href)) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  });

  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (!isSafeImageSrc(src)) {
      img.remove();
    } else {
      img.setAttribute("loading", "lazy");
      img.removeAttribute("srcset");
    }
  });

  root.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const cleaned = sanitizeStyle(el.getAttribute("style") || "");
    if (cleaned) el.setAttribute("style", cleaned);
    else el.removeAttribute("style");
  });

  return root.innerHTML;
}

const REPORT_BASE_CSS = `
  .friday-report-body { color: inherit; font-family: inherit; line-height: 1.55; font-size: 0.9rem; }
  .friday-report-body h1 { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.5rem; line-height: 1.25; }
  .friday-report-body h2 { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; line-height: 1.3; }
  .friday-report-body h3 { font-size: 1.05rem; font-weight: 600; margin: 0.85rem 0 0.4rem; }
  .friday-report-body h4 { font-size: 0.95rem; font-weight: 600; margin: 0.75rem 0 0.35rem; }
  .friday-report-body p { margin: 0.5rem 0; }
  .friday-report-body ul, .friday-report-body ol { margin: 0.5rem 0; padding-left: 1.5rem; }
  .friday-report-body li { margin: 0.2rem 0; }
  .friday-report-body blockquote { border-left: 3px solid hsl(var(--border)); padding: 0.25rem 0.75rem; margin: 0.5rem 0; color: hsl(var(--muted-foreground)); }
  .friday-report-body code { background: hsl(var(--muted)); padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.85em; }
  .friday-report-body pre { background: hsl(var(--muted)); padding: 0.75rem; border-radius: 0.5rem; overflow-x: auto; font-size: 0.85em; margin: 0.5rem 0; }
  .friday-report-body pre code { background: transparent; padding: 0; }
  .friday-report-body a { color: hsl(var(--primary)); text-decoration: underline; text-underline-offset: 2px; }
  .friday-report-body table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; font-size: 0.85rem; }
  .friday-report-body th, .friday-report-body td { border: 1px solid hsl(var(--border)); padding: 0.5rem 0.65rem; text-align: left; vertical-align: top; }
  .friday-report-body th { background: hsl(var(--muted)); font-weight: 600; }
  .friday-report-body tr:nth-child(even) td { background: hsl(var(--muted) / 0.4); }
  .friday-report-body hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 1rem 0; }
  .friday-report-body img { max-width: 100%; height: auto; border-radius: 0.25rem; }
  .friday-report-body figure { margin: 0.75rem 0; }
  .friday-report-body figcaption { font-size: 0.8rem; color: hsl(var(--muted-foreground)); text-align: center; margin-top: 0.25rem; }
  @media print {
    .friday-report-card-actions { display: none !important; }
    .friday-report-card-collapse { display: none !important; }
    .friday-report-body-wrapper { max-height: none !important; overflow: visible !important; }
  }
`;

const STANDALONE_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; background: #ffffff; margin: 0; padding: 0; }
  .friday-report-shell { max-width: 880px; margin: 0 auto; padding: 2.5rem 2rem; }
  .friday-report-header { border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .friday-report-title { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.25rem; color: #0f172a; }
  .friday-report-subtitle { color: #475569; font-size: 0.95rem; margin: 0; }
  .friday-report-meta { color: #64748b; font-size: 0.8rem; margin-top: 0.5rem; }
  .friday-report-body { color: #0f172a; font-size: 0.95rem; line-height: 1.6; }
  .friday-report-body h1 { font-size: 1.5rem; font-weight: 700; margin: 1.25rem 0 0.6rem; }
  .friday-report-body h2 { font-size: 1.25rem; font-weight: 700; margin: 1.1rem 0 0.5rem; }
  .friday-report-body h3 { font-size: 1.05rem; font-weight: 600; margin: 0.9rem 0 0.4rem; }
  .friday-report-body p { margin: 0.6rem 0; }
  .friday-report-body ul, .friday-report-body ol { margin: 0.6rem 0; padding-left: 1.5rem; }
  .friday-report-body li { margin: 0.25rem 0; }
  .friday-report-body blockquote { border-left: 3px solid #cbd5e1; padding: 0.25rem 0.75rem; margin: 0.6rem 0; color: #475569; }
  .friday-report-body code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.85em; }
  .friday-report-body pre { background: #f1f5f9; padding: 0.75rem; border-radius: 0.5rem; overflow-x: auto; }
  .friday-report-body a { color: #2563eb; text-decoration: underline; }
  .friday-report-body table { border-collapse: collapse; width: 100%; margin: 0.85rem 0; font-size: 0.9rem; }
  .friday-report-body th, .friday-report-body td { border: 1px solid #e2e8f0; padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
  .friday-report-body th { background: #f8fafc; font-weight: 600; }
  .friday-report-body hr { border: 0; border-top: 1px solid #e2e8f0; margin: 1.25rem 0; }
  .friday-report-body img { max-width: 100%; height: auto; }
  @media print { .friday-report-shell { padding: 0.5in; max-width: none; } }
`;

function safeFilenamePart(s: string): string {
  return (s || "report").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "report";
}

export function buildReportPdfFilename(report: FridayReportData): string {
  const dateSrc = report.generatedAt ? new Date(report.generatedAt) : new Date();
  const date = isNaN(dateSrc.getTime()) ? new Date() : dateSrc;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${safeFilenamePart(report.title)}_${yyyy}-${mm}-${dd}.pdf`;
}

export async function downloadReportAsPdf(report: FridayReportData): Promise<void> {
  const res = await fetch("/api/jarvis/friday-report/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      title: report.title || "Report",
      subtitle: report.subtitle || undefined,
      generatedAt: report.generatedAt || undefined,
      html: report.html || "",
    }),
  });
  if (!res.ok) {
    let message = `PDF export failed (${res.status})`;
    try {
      const j = await res.json();
      if (j && typeof j.message === "string") message = j.message;
    } catch { /* noop */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildReportPdfFilename(report);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildStandaloneReportHtml(report: FridayReportData, sanitizedHtml: string): string {
  const safeTitle = (report.title || "Report").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
  const safeSub = report.subtitle ? report.subtitle.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)) : "";
  const generated = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString()
    : new Date().toLocaleString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle}</title>
<style>${STANDALONE_CSS}</style>
</head>
<body>
<div class="friday-report-shell">
  <header class="friday-report-header">
    <h1 class="friday-report-title">${safeTitle}</h1>
    ${safeSub ? `<p class="friday-report-subtitle">${safeSub}</p>` : ""}
    <p class="friday-report-meta">Generated ${generated}</p>
  </header>
  <div class="friday-report-body">${sanitizedHtml}</div>
</div>
</body>
</html>`;
}

// Cross-tab handoff uses localStorage (sessionStorage is NOT shared with
// tabs opened via window.open(..., 'noopener')). We keep `noopener` for
// security and instead persist the sanitized payload to localStorage with a
// TTL and an LRU-style cap so it never grows unbounded.
const FULL_VIEW_STORAGE_PREFIX = "friday_report_view_";
const FULL_VIEW_INDEX_KEY = "friday_report_view__index";
const FULL_VIEW_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FULL_VIEW_MAX_ENTRIES = 20;

interface StoredReport {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  html: string;
  savedAt: number;
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(FULL_VIEW_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  try {
    localStorage.setItem(FULL_VIEW_INDEX_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function pruneExpired(): void {
  const now = Date.now();
  const ids = readIndex();
  const keep: string[] = [];
  for (const id of ids) {
    try {
      const raw = localStorage.getItem(FULL_VIEW_STORAGE_PREFIX + id);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredReport;
      if (typeof parsed?.savedAt === "number" && now - parsed.savedAt < FULL_VIEW_TTL_MS) {
        keep.push(id);
      } else {
        localStorage.removeItem(FULL_VIEW_STORAGE_PREFIX + id);
      }
    } catch {
      localStorage.removeItem(FULL_VIEW_STORAGE_PREFIX + id);
    }
  }
  if (keep.length !== ids.length) writeIndex(keep);
}

export function stashReportForFullView(report: FridayReportData, sanitizedHtml: string): string {
  const id = `r${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (typeof window === "undefined") return id;
  try {
    pruneExpired();
    const payload: StoredReport = {
      title: report.title,
      subtitle: report.subtitle,
      generatedAt: report.generatedAt,
      html: sanitizedHtml,
      savedAt: Date.now(),
    };
    const serialized = JSON.stringify(payload);

    // Try to write; if quota is exceeded, drop oldest entries and retry.
    const writeWithRetry = (attempt = 0): boolean => {
      try {
        localStorage.setItem(FULL_VIEW_STORAGE_PREFIX + id, serialized);
        return true;
      } catch {
        const ids = readIndex();
        if (ids.length === 0 || attempt > 5) return false;
        const oldest = ids.shift()!;
        localStorage.removeItem(FULL_VIEW_STORAGE_PREFIX + oldest);
        writeIndex(ids);
        return writeWithRetry(attempt + 1);
      }
    };
    if (!writeWithRetry()) return id;

    let ids = readIndex();
    ids = ids.filter((x) => x !== id);
    ids.push(id);
    while (ids.length > FULL_VIEW_MAX_ENTRIES) {
      const oldest = ids.shift()!;
      try { localStorage.removeItem(FULL_VIEW_STORAGE_PREFIX + oldest); } catch { /* noop */ }
    }
    writeIndex(ids);
  } catch {
    // ignore — full view will simply show the "not available" fallback
  }
  return id;
}

export function readReportForFullView(id: string): FridayReportData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FULL_VIEW_STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReport;
    if (typeof parsed?.title !== "string" || typeof parsed?.html !== "string") return null;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > FULL_VIEW_TTL_MS) {
      try { localStorage.removeItem(FULL_VIEW_STORAGE_PREFIX + id); } catch { /* noop */ }
      return null;
    }
    return {
      title: parsed.title,
      subtitle: parsed.subtitle,
      generatedAt: parsed.generatedAt,
      html: parsed.html,
    };
  } catch {
    return null;
  }
}

function FridayReportFallback({ report }: { report: FridayReportData }) {
  const [showRaw, setShowRaw] = useState(false);
  const { toast } = useToast();

  const handleCopyRaw = async () => {
    try {
      await navigator.clipboard.writeText(report.html);
      toast({ title: "Copied", description: "Raw source copied to clipboard." });
    } catch (err: unknown) {
      toast({ title: "Copy failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  return (
    <div
      className="friday-report-card my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
      data-testid="friday-report-failed"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-xs text-foreground">
          <div className="font-semibold mb-1">Report could not be rendered safely</div>
          <div className="text-muted-foreground">
            The report content was blocked by the safety filter. You can view or copy the original source to inspect what was sent.
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowRaw((v) => !v)}
              data-testid="friday-report-view-raw"
            >
              {showRaw ? "Hide raw source" : "View raw source"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleCopyRaw}
              data-testid="friday-report-copy-raw"
            >
              <Copy className="h-3 w-3 mr-1" /> Copy raw
            </Button>
          </div>
          {showRaw && (
            <pre className="mt-2 max-h-64 overflow-auto rounded border border-border bg-muted p-2 text-[11px]">
              <code>{report.html}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function FridayReportCard({ report, variant = "panel" }: FridayReportCardProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [savedReportId, setSavedReportId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const sanitized = useMemo(() => sanitizeReportHtml(report.html || ""), [report.html]);
  const renderFailed = sanitized.trim().length === 0 && (report.html || "").trim().length > 0;

  const measureRef = useCallback((el: HTMLDivElement | null) => {
    bodyRef.current = el;
    if (el) {
      requestAnimationFrame(() => {
        if (bodyRef.current) {
          setOverflowing(bodyRef.current.scrollHeight > COLLAPSED_MAX_PX + 4);
        }
      });
    }
  }, [sanitized]);

  const handleCopy = async () => {
    try {
      const standalone = buildStandaloneReportHtml(report, sanitized);
      const Ctor = getClipboardItemCtor();
      if (navigator.clipboard && Ctor) {
        const item = new Ctor({
          "text/html": new Blob([standalone], { type: "text/html" }),
          "text/plain": new Blob([bodyRef.current?.innerText || report.title], { type: "text/plain" }),
        });
        // navigator.clipboard.write expects a list of ClipboardItem instances;
        // the runtime accepts our typed wrapper.
        await (navigator.clipboard as Clipboard & {
          write: (items: unknown[]) => Promise<void>;
        }).write([item]);
      } else {
        await navigator.clipboard.writeText(bodyRef.current?.innerText || report.title);
      }
      toast({ title: "Copied", description: "Report copied to clipboard." });
    } catch (err: unknown) {
      toast({ title: "Copy failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const [pdfBusy, setPdfBusy] = useState(false);

  const handleDownload = () => {
    try {
      const standalone = buildStandaloneReportHtml(report, sanitized);
      const safeName = (report.title || "report").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "report";
      const blob = new Blob([standalone], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      toast({ title: "Download failed", description: errorMessage(err), variant: "destructive" });
    }
  };

  const handleDownloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadReportAsPdf(report);
    } catch (err: unknown) {
      toast({ title: "PDF export failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setPdfBusy(false);
    }
  };

  const handleOpenFull = () => {
    // If the report is already saved server-side, link directly to its
    // permanent /friday-report/{numericId} URL — those resolve from the DB
    // even after the local browser session ends or in another tab/device.
    if (savedReportId) {
      window.open(`/friday-report/${savedReportId}`, "_blank", "noopener");
      return;
    }
    const id = stashReportForFullView(report, sanitized);
    window.open(`/friday-report/${id}`, "_blank", "noopener");
  };

  const handleSave = async () => {
    if (savedReportId || isSaving) return;
    if (!currentOrganization?.id) {
      toast({
        title: "Couldn't save report",
        description: "No active organization. Try refreshing the page.",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    try {
      const res = await apiRequest("POST", "/api/jarvis/saved-reports", {
        organizationId: currentOrganization.id,
        title: report.title || "Report",
        subtitle: report.subtitle ?? null,
        generatedAt: report.generatedAt ?? null,
        // Persist the sanitized HTML so the saved copy is exactly what the
        // user sees in the chat panel — no further rewriting on render.
        html: sanitized || report.html,
      });
      const created = (await res.json()) as { id: number };
      setSavedReportId(created.id);
      queryClient.invalidateQueries({
        queryKey: ["/api/jarvis/saved-reports", currentOrganization.id],
      });
      toast({
        title: "Report saved",
        description: "You can re-open it from the Saved Reports menu.",
      });
    } catch (err: unknown) {
      toast({
        title: "Save failed",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    try {
      const standalone = buildStandaloneReportHtml(report, sanitized);
      const w = window.open("", "_blank", "noopener,width=900,height=1100");
      if (!w) {
        window.print();
        return;
      }
      w.document.open();
      w.document.write(standalone);
      w.document.close();
      w.focus();
      setTimeout(() => {
        try { w.print(); } catch { /* noop */ }
      }, 250);
    } catch {
      window.print();
    }
  };

  const generatedLabel = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString()
    : null;

  if (renderFailed) {
    return <FridayReportFallback report={report} />;
  }

  return (
    <div
      className={cn(
        "friday-report-card my-3 rounded-lg border bg-card overflow-hidden shadow-sm",
        variant === "panel" ? "border-cyan-900/30" : "border-border",
      )}
      data-testid="friday-report-card"
    >
      <style dangerouslySetInnerHTML={{ __html: REPORT_BASE_CSS }} />
      <div
        className={cn(
          "flex items-start gap-2 px-3 py-2 border-b",
          variant === "panel" ? "border-cyan-900/20 bg-slate-900/40" : "border-border bg-muted/40",
        )}
      >
        <div
          className={cn(
            "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center",
            variant === "panel"
              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-700/30"
              : "bg-primary/10 text-primary border border-primary/20",
          )}
        >
          <FileText className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-sm font-semibold truncate",
              variant === "panel" ? "text-cyan-100" : "text-foreground",
            )}
            data-testid="friday-report-title"
          >
            {report.title || "Report"}
          </div>
          {(report.subtitle || generatedLabel) && (
            <div
              className={cn(
                "text-[11px] truncate",
                variant === "panel" ? "text-cyan-400/80" : "text-muted-foreground",
              )}
            >
              {report.subtitle}
              {report.subtitle && generatedLabel ? " • " : ""}
              {generatedLabel}
            </div>
          )}
        </div>
        <div className="friday-report-card-actions flex items-center gap-1 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleCopy}
            data-testid="friday-report-copy"
          >
            <Copy className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">Copy</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handlePrint}
            data-testid="friday-report-print"
          >
            <Printer className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">Print</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleDownload}
            data-testid="friday-report-download"
          >
            <Download className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">Download</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleDownloadPdf}
            disabled={pdfBusy}
            data-testid="friday-report-download-pdf"
          >
            <FileDown className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">{pdfBusy ? "Download PDF…" : "Download PDF"}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-xs",
              savedReportId && "text-emerald-500 dark:text-emerald-400",
            )}
            onClick={handleSave}
            disabled={isSaving || !!savedReportId || !currentOrganization?.id}
            data-testid="friday-report-save"
            title={
              savedReportId
                ? "Already saved — re-open from the Saved Reports menu"
                : "Save this report to your organization"
            }
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
            ) : savedReportId ? (
              <BookmarkCheck className="h-3 w-3 sm:mr-1" />
            ) : (
              <Bookmark className="h-3 w-3 sm:mr-1" />
            )}
            <span className="hidden sm:inline">
              {savedReportId ? "Saved" : isSaving ? "Saving…" : "Save"}
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleOpenFull}
            data-testid="friday-report-open-full"
          >
            <ExternalLink className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">Open</span>
          </Button>
        </div>
      </div>

      <div
        className="friday-report-body-wrapper relative bg-card"
        style={{
          maxHeight: expanded || !overflowing ? undefined : COLLAPSED_MAX_PX,
          overflow: expanded || !overflowing ? "visible" : "hidden",
        }}
      >
        <div
          ref={measureRef}
          className="friday-report-body px-4 py-3 text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
        {!expanded && overflowing && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent"
            aria-hidden
          />
        )}
      </div>

      {overflowing && (
        <div className="friday-report-card-collapse border-t border-border bg-muted/30 px-3 py-1.5 flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setExpanded((v) => !v)}
            data-testid="friday-report-toggle"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" /> Show full report
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Parse the body of a fenced ```report block.
 *
 * Format:
 *   ```report
 *   {"title":"...","subtitle":"...","generatedAt":"..."}
 *   ---
 *   <h1>...</h1> ... raw HTML body ...
 *   ```
 *
 * The JSON header is required (must contain `title`). Everything after the
 * first `---` line is the raw HTML body. If no `---` is found, the agent may
 * have provided only a JSON object — in that case we treat any `html` field
 * inside the JSON as the body.
 */
export function tryParseFridayReport(blockBody: string): FridayReportData | null {
  const text = blockBody.replace(/\r\n/g, "\n").trim();
  if (!text) return null;

  const sepIdx = (() => {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/^-{3,}\s*$/.test(lines[i].trim())) return i;
    }
    return -1;
  })();

  let headerText = text;
  let bodyText = "";
  if (sepIdx >= 0) {
    const lines = text.split("\n");
    headerText = lines.slice(0, sepIdx).join("\n").trim();
    bodyText = lines.slice(sepIdx + 1).join("\n").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(headerText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const header = parsed as {
    title?: unknown;
    subtitle?: unknown;
    generatedAt?: unknown;
    html?: unknown;
  };
  if (typeof header.title !== "string") return null;

  const html = bodyText || (typeof header.html === "string" ? header.html : "");
  if (!html.trim()) return null;

  return {
    title: header.title,
    subtitle: typeof header.subtitle === "string" ? header.subtitle : undefined,
    generatedAt: typeof header.generatedAt === "string" ? header.generatedAt : undefined,
    html,
  };
}
