import { useEffect, useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  readReportForFullView,
  sanitizeReportHtml,
  buildStandaloneReportHtml,
  type FridayReportData,
} from "@/components/jarvis/FridayReportCard";

const PAGE_CSS = `
  .friday-report-fullview-body { color: hsl(var(--foreground)); font-size: 0.95rem; line-height: 1.6; }
  .friday-report-fullview-body h1 { font-size: 1.6rem; font-weight: 700; margin: 1.25rem 0 0.6rem; }
  .friday-report-fullview-body h2 { font-size: 1.3rem; font-weight: 700; margin: 1.1rem 0 0.5rem; }
  .friday-report-fullview-body h3 { font-size: 1.1rem; font-weight: 600; margin: 0.9rem 0 0.4rem; }
  .friday-report-fullview-body h4 { font-size: 1rem; font-weight: 600; margin: 0.8rem 0 0.4rem; }
  .friday-report-fullview-body p { margin: 0.6rem 0; }
  .friday-report-fullview-body ul, .friday-report-fullview-body ol { margin: 0.6rem 0; padding-left: 1.5rem; }
  .friday-report-fullview-body li { margin: 0.25rem 0; }
  .friday-report-fullview-body blockquote { border-left: 3px solid hsl(var(--border)); padding: 0.25rem 0.85rem; margin: 0.6rem 0; color: hsl(var(--muted-foreground)); }
  .friday-report-fullview-body code { background: hsl(var(--muted)); padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.85em; }
  .friday-report-fullview-body pre { background: hsl(var(--muted)); padding: 0.85rem; border-radius: 0.5rem; overflow-x: auto; }
  .friday-report-fullview-body a { color: hsl(var(--primary)); text-decoration: underline; text-underline-offset: 2px; }
  .friday-report-fullview-body table { border-collapse: collapse; width: 100%; margin: 0.85rem 0; font-size: 0.9rem; }
  .friday-report-fullview-body th, .friday-report-fullview-body td { border: 1px solid hsl(var(--border)); padding: 0.55rem 0.7rem; text-align: left; vertical-align: top; }
  .friday-report-fullview-body th { background: hsl(var(--muted)); font-weight: 600; }
  .friday-report-fullview-body tr:nth-child(even) td { background: hsl(var(--muted) / 0.4); }
  .friday-report-fullview-body hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 1.25rem 0; }
  .friday-report-fullview-body img { max-width: 100%; height: auto; border-radius: 0.25rem; }
  @media print {
    .friday-report-fullview-actions { display: none !important; }
    .friday-report-fullview-shell { max-width: none !important; padding: 0.5in !important; }
  }
`;

export default function FridayReportPage() {
  const [, params] = useRoute<{ id: string }>("/friday-report/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [report, setReport] = useState<FridayReportData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const id = params?.id;
    if (!id) {
      setNotFound(true);
      return;
    }
    const r = readReportForFullView(id);
    if (!r) setNotFound(true);
    else setReport(r);
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
          </div>
        </div>
      </header>
      <div className="friday-report-fullview-shell max-w-4xl mx-auto px-4 md:px-8 py-8">
        <div className="border-b border-border pb-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">{report.title}</h1>
          {report.subtitle && (
            <p className="text-sm md:text-base text-muted-foreground mt-1">{report.subtitle}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">Generated {generated}</p>
        </div>
        <div
          className="friday-report-fullview-body"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      </div>
    </div>
  );
}
