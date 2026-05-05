import { useCallback, useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download, FileDown, Copy, CalendarClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { setAiMode } from "@/hooks/use-ai-mode";
import {
  readReportForFullView,
  sanitizeReportHtml,
  buildStandaloneReportHtml,
  downloadReportAsPdf,
  type FridayReportData,
} from "@/components/jarvis/FridayReportCard";
import { buildReportCss } from "@/components/jarvis/fridayReportTheme";

interface ServerSavedReport {
  id: number;
  organizationId: number;
  title: string;
  subtitle: string | null;
  generatedAt: string | null;
  html: string;
  createdAt: string;
}

async function fetchSavedReportFromServer(id: string): Promise<FridayReportData | null> {
  // Server-persisted reports always have numeric ids; locally-stashed ones
  // use a "r…" prefix. Skip the round-trip when the id obviously isn't a
  // server id.
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`/api/jarvis/saved-reports/${id}`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ServerSavedReport;
    return {
      title: data.title,
      subtitle: data.subtitle ?? undefined,
      generatedAt: data.generatedAt ?? data.createdAt,
      html: data.html,
    };
  } catch {
    return null;
  }
}

const PAGE_CSS = `
${buildReportCss(".friday-report-fullview-body")}
.friday-report-fullview-card {
  position: relative;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -16px rgba(15,23,42,0.18);
}
.friday-report-fullview-card::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px;
  background: linear-gradient(90deg, #6366f1, #0ea5e9, #06b6d4);
}
.friday-report-fullview-header {
  padding: 1.75rem 2rem 1.25rem;
  background: linear-gradient(135deg, hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.01));
  border-bottom: 1px solid hsl(var(--border));
}
.friday-report-fullview-meta {
  display: inline-flex; align-items: center; gap: 0.4rem;
  color: hsl(var(--muted-foreground)); font-size: 0.7rem;
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  margin-top: 0.9rem; padding: 0.2rem 0.6rem;
  background: hsl(var(--muted)); border-radius: 999px;
  border: 1px solid hsl(var(--border));
}
.friday-report-fullview-body { padding: 1.5rem 2rem 2rem; }
@media print {
  .friday-report-fullview-actions { display: none !important; }
  .friday-report-fullview-card { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }
  .friday-report-fullview-card::before { display: none !important; }
  .friday-report-fullview-header { background: none !important; padding: 0.5in 0.5in 0.25in !important; }
  .friday-report-fullview-body { padding: 0.25in 0.5in 0.5in !important; }
}
`;

export default function FridayReportPage() {
  const [, params] = useRoute<{ id: string }>("/friday-report/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [report, setReport] = useState<FridayReportData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Internal links inside the server-rendered report HTML would otherwise
  // trigger a full browser navigation. Since AI Mode is the default landing
  // experience, the reload would re-enter AI Mode instead of showing the
  // destination page. Intercept and route through wouter.
  const handleBodyClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = (e.target as HTMLElement | null)?.closest("a");
    if (!anchor) return;
    if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return;
    const href = anchor.getAttribute("href") || "";
    if (!href.startsWith("/")) return;
    if (href.startsWith("/api/")) return;
    e.preventDefault();
    e.stopPropagation();
    setAiMode(false);
    setTimeout(() => setLocation(href), 0);
  }, [setLocation]);

  useEffect(() => {
    const id = params?.id;
    if (!id) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    // Try the local cache first — that path covers cards just opened from
    // the chat panel and avoids a round-trip when the data is right there.
    const local = readReportForFullView(id);
    if (local) {
      setReport(local);
      return;
    }
    // Fall back to the server: links to saved reports must keep working
    // after the browser session ends or in an entirely different browser.
    fetchSavedReportFromServer(id).then((r) => {
      if (cancelled) return;
      if (r) setReport(r);
      else setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  const sanitized = useMemo(() => (report ? sanitizeReportHtml(report.html) : ""), [report]);

  useEffect(() => {
    if (report?.title) document.title = `${report.title} — Friday Report`;
  }, [report?.title]);

  const handlePrint = () => window.print();

  const handleDownload = () => {
    if (!report) return;
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
  };

  const handleDownloadPdf = async () => {
    if (!report || pdfBusy) return;
    setPdfBusy(true);
    try {
      await downloadReportAsPdf(report);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not export PDF.";
      toast({ title: "PDF export failed", description: msg, variant: "destructive" });
    } finally {
      setPdfBusy(false);
    }
  };

  const bodyTextRef = (() => {
    // Extract a plain-text version of the report body for the clipboard
    // fallback path (browsers without ClipboardItem support).
    const tmp = typeof document !== "undefined" ? document.createElement("div") : null;
    if (tmp) tmp.innerHTML = sanitized;
    return tmp?.innerText || tmp?.textContent || "";
  });

  const handleCopy = async () => {
    if (!report) return;
    try {
      const standalone = buildStandaloneReportHtml(report, sanitized);
      const plain = `${report.title}\n${report.subtitle ? report.subtitle + "\n" : ""}\n${bodyTextRef()}`.trim();
      type ClipboardItemCtor = new (items: Record<string, Blob>) => unknown;
      const Ctor = (window as Window & { ClipboardItem?: ClipboardItemCtor }).ClipboardItem;
      if (navigator.clipboard && Ctor) {
        const item = new Ctor({
          "text/html": new Blob([standalone], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        });
        await (navigator.clipboard as Clipboard & {
          write: (items: unknown[]) => Promise<void>;
        }).write([item]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      toast({ title: "Copied", description: "Report copied to clipboard." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not copy.";
      toast({ title: "Copy failed", description: msg, variant: "destructive" });
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Report not available</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This report has expired or was opened in a different browser session. Ask Friday to regenerate it.
          </p>
          <Button onClick={() => window.close()} variant="outline">Close window</Button>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading report…</div>
      </div>
    );
  }

  const generated = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div className="min-h-screen bg-background" data-testid="friday-report-fullview">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <header className="friday-report-fullview-actions border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-2.5 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else setLocation("/");
            }}
            data-testid="friday-report-fullview-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleCopy} data-testid="friday-report-fullview-copy">
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="friday-report-fullview-print">
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} data-testid="friday-report-fullview-download">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={pdfBusy}
              data-testid="friday-report-fullview-download-pdf"
            >
              <FileDown className="h-3.5 w-3.5 mr-1.5" /> {pdfBusy ? "Download PDF…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </header>
      <div className="friday-report-fullview-shell max-w-4xl mx-auto px-3 md:px-6 py-6 md:py-8">
        <div className="friday-report-fullview-card">
          <div className="friday-report-fullview-header">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              {report.title}
            </h1>
            {report.subtitle && (
              <p className="text-sm md:text-base text-muted-foreground mt-1">
                {report.subtitle}
              </p>
            )}
            <span className="friday-report-fullview-meta">
              <CalendarClock className="h-3 w-3" />
              {generated}
            </span>
          </div>
          <div
            className="friday-report-fullview-body"
            onClickCapture={handleBodyClickCapture}
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        </div>
      </div>
    </div>
  );
}
