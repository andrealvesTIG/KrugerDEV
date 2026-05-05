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
import { buildReportCss, STANDALONE_THEME_VARS } from "./fridayReportTheme";

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
${buildReportCss(".friday-report-body")}
@media print {
  .friday-report-card-actions { display: none !important; }
  .friday-report-card-collapse { display: none !important; }
  .friday-report-body-wrapper { max-height: none !important; overflow: visible !important; }
}
`;

const STANDALONE_CSS = `
:root {
${STANDALONE_THEME_VARS}
}
body {
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: hsl(var(--foreground));
  background: #f8fafc;
  margin: 0; padding: 0;
}
.friday-report-shell {
  max-width: 920px; margin: 1.5rem auto; padding: 0;
  background: #ffffff;
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -16px rgba(15,23,42,0.18);
}
.friday-report-header {
  position: relative;
  padding: 1.5rem 2rem 1.25rem;
  background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(14,165,233,0.04));
  border-bottom: 1px solid hsl(var(--border));
}
.friday-report-header::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px;
  background: linear-gradient(90deg, #6366f1, #0ea5e9, #06b6d4);
}
.friday-report-title {
  font-size: 1.65rem; font-weight: 800; letter-spacing: -0.02em;
  margin: 0 0 0.2rem; color: hsl(var(--foreground));
}
.friday-report-subtitle {
  color: hsl(var(--muted-foreground)); font-size: 0.92rem;
  margin: 0; font-weight: 500;
}
.friday-report-meta {
  display: inline-flex; align-items: center; gap: 0.4rem;
  color: hsl(var(--muted-foreground)); font-size: 0.72rem;
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  margin-top: 0.85rem; padding: 0.2rem 0.55rem;
  background: hsl(var(--muted)); border-radius: 999px;
  border: 1px solid hsl(var(--border));
}
.friday-report-meta::before {
  content: ""; width: 6px; height: 6px; border-radius: 999px;
  background: linear-gradient(180deg, #6366f1, #0ea5e9);
}
.friday-report-shell .friday-report-body { padding: 1.25rem 2rem 1.75rem; }
${buildReportCss(".friday-report-shell .friday-report-body")}
@media print {
  body { background: #ffffff; }
  .friday-report-shell {
    box-shadow: none; border: 0; border-radius: 0;
    margin: 0; max-width: none;
  }
  .friday-report-header { padding: 0.5in 0.5in 0.25in; }
  .friday-report-shell .friday-report-body { padding: 0.25in 0.5in 0.5in; }
}
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

// Render the report to a PDF that visually matches the on-screen HTML
// report (hero, KPIs, callouts, badges, gradients, fonts — full design
// system fidelity). We mount the same standalone HTML used by Print/Save
// in an off-screen iframe, snapshot it with html2canvas, and slice the
// tall canvas into letter-sized pages embedded in a jsPDF document.
export async function downloadReportAsPdf(report: FridayReportData): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const sanitized = sanitizeReportHtml(report.html || "");
  const standalone = buildStandaloneReportHtml(report, sanitized);

  // Letter @ 96dpi = 816 x 1056 px. We render the iframe at the shell's
  // natural max width (920px) so the layout matches the on-screen view,
  // then scale the snapshot to fit the page width.
  const RENDER_WIDTH = 960;
  const PAGE_W_PX = 816;
  const PAGE_H_PX = 1056;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-100000px";
  iframe.style.top = "0";
  iframe.style.width = `${RENDER_WIDTH}px`;
  iframe.style.height = "100px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument;
    if (!idoc) throw new Error("Could not create render frame");
    idoc.open();
    idoc.write(standalone);
    idoc.close();

    // Strip lazy-loading: off-screen iframes can defer it forever and stall
    // the export. We need every image to start loading immediately.
    idoc.querySelectorAll<HTMLImageElement>("img[loading='lazy']").forEach((img) => {
      img.removeAttribute("loading");
    });

    // Wait for fonts and images inside the iframe to settle, with an
    // overall timeout so a stalled asset can't hang the export.
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race<T | null>([
        p.then((v) => v),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]);
    await new Promise((r) => setTimeout(r, 50));
    const ifonts = (idoc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (ifonts?.ready) {
      await withTimeout(ifonts.ready as Promise<unknown>, 2000);
    }
    const imgs = Array.from(idoc.images || []);
    if (imgs.length) {
      await withTimeout(
        Promise.all(
          imgs.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                }),
          ),
        ),
        4000,
      );
    }

    // html2canvas can't render `-webkit-background-clip: text` (the hero
    // title gradient renders blank). For each hero title we (a) drop the
    // gradient/clip so the text becomes visible again, and (b) preserve
    // the *variant* color (good/warn/danger) by reading what the
    // surrounding `.hero--*` class maps to, falling back to the inherited
    // foreground color when no variant is set.
    const variantColor = (el: HTMLElement): string | null => {
      let host: HTMLElement | null = el;
      while (host && host !== idoc.body) {
        if (host.classList?.contains("hero--good")) return "rgb(16,185,129)";
        if (host.classList?.contains("hero--warn")) return "rgb(245,158,11)";
        if (host.classList?.contains("hero--danger")) return "rgb(244,63,94)";
        host = host.parentElement;
      }
      return null;
    };
    idoc
      .querySelectorAll<HTMLElement>(
        ".hero__title, [style*='background-clip'], [style*='-webkit-background-clip']",
      )
      .forEach((el) => {
        el.style.background = "none";
        el.style.backgroundImage = "none";
        el.style.backgroundClip = "border-box";
        (el.style as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip = "border-box";
        const color = variantColor(el) || "#0f172a";
        (el.style as CSSStyleDeclaration & { webkitTextFillColor?: string }).webkitTextFillColor = color;
        el.style.color = color;
      });

    // Allow the iframe layout to settle at full content height.
    iframe.style.height = `${Math.max(idoc.body.scrollHeight, idoc.documentElement.scrollHeight)}px`;
    await new Promise((r) => setTimeout(r, 60));

    const target = idoc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: RENDER_WIDTH,
      windowHeight: target.scrollHeight,
      logging: false,
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error("Failed to render report content");
    }

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [PAGE_W_PX, PAGE_H_PX],
      hotfixes: ["px_scaling"],
    });

    // canvas was rendered at RENDER_WIDTH * scale. Each PDF page should
    // contain a slice of equal aspect ratio — height in *canvas* px equals
    // (PAGE_H_PX / PAGE_W_PX) * canvas.width.
    const sliceHeightCanvasPx = Math.floor((PAGE_H_PX / PAGE_W_PX) * canvas.width);
    const totalSlices = Math.max(1, Math.ceil(canvas.height / sliceHeightCanvasPx));

    for (let i = 0; i < totalSlices; i++) {
      const sy = i * sliceHeightCanvasPx;
      const sh = Math.min(sliceHeightCanvasPx, canvas.height - sy);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sh;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);

      // PNG (lossless) keeps small text, badge borders, status dots, and
      // table rules crisp — JPEG was visibly artifacted at 0.92.
      const imgData = sliceCanvas.toDataURL("image/png");
      const drawHpx = (sh / canvas.width) * PAGE_W_PX;

      if (i > 0) pdf.addPage([PAGE_W_PX, PAGE_H_PX], "portrait");
      pdf.addImage(imgData, "PNG", 0, 0, PAGE_W_PX, drawHpx, undefined, "FAST");
    }

    pdf.save(buildReportPdfFilename(report));
  } finally {
    try { document.body.removeChild(iframe); } catch { /* noop */ }
  }
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
  const [openingFull, setOpeningFull] = useState(false);
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

  const handleOpenFull = async () => {
    if (openingFull || isSaving) return;
    // Already-saved reports have a stable, server-backed permalink that any
    // tab on any device can resolve.
    if (savedReportId) {
      window.open(`/friday-report/${savedReportId}`, "_blank", "noopener");
      return;
    }
    // Open the popup synchronously to preserve the user-gesture popup
    // permission, then navigate it once we know the destination URL.
    // Without this, browsers block the window opened after `await`.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      // Popup blocker hit — fall back to the synchronous localStorage
      // handoff path. Best-effort: works only when the new tab shares
      // origin and has the entry in storage.
      const id = stashReportForFullView(report, sanitized);
      window.open(`/friday-report/${id}`, "_blank", "noopener");
      return;
    }
    setOpeningFull(true);
    try {
      if (currentOrganization?.id) {
        // Persist server-side first so the new tab can always re-load the
        // report from `/api/jarvis/saved-reports/:id`, even when the
        // localStorage handoff isn't available (cross-origin iframe,
        // quota exceeded, original tab closed, different device).
        const res = await apiRequest("POST", "/api/jarvis/saved-reports", {
          organizationId: currentOrganization.id,
          title: report.title || "Report",
          subtitle: report.subtitle ?? null,
          generatedAt: report.generatedAt ?? null,
          html: sanitized || report.html,
        });
        const created = (await res.json()) as { id: number };
        setSavedReportId(created.id);
        queryClient.invalidateQueries({
          queryKey: ["/api/jarvis/saved-reports", currentOrganization.id],
        });
        popup.location.href = `/friday-report/${created.id}`;
        return;
      }
      // No active org → fall back to the localStorage stash so the user
      // still gets something rather than a blank popup.
      const id = stashReportForFullView(report, sanitized);
      popup.location.href = `/friday-report/${id}`;
    } catch {
      const id = stashReportForFullView(report, sanitized);
      popup.location.href = `/friday-report/${id}`;
    } finally {
      setOpeningFull(false);
    }
  };

  const handleSave = async () => {
    if (savedReportId || isSaving || openingFull) return;
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
            disabled={isSaving || openingFull || !!savedReportId || !currentOrganization?.id}
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
            disabled={openingFull || isSaving}
            data-testid="friday-report-open-full"
          >
            {openingFull ? (
              <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3 sm:mr-1" />
            )}
            <span className="hidden sm:inline">{openingFull ? "Opening…" : "Open"}</span>
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
