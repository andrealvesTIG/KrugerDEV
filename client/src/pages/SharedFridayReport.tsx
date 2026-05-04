import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Printer, Download, Copy, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  sanitizeReportHtml,
  buildStandaloneReportHtml,
  type FridayReportData,
} from "@/components/jarvis/FridayReportCard";

interface SharedReportPayload {
  id: number;
  title: string;
  subtitle: string | null;
  generatedAt: string | null;
  sharedAt: string | null;
  shareExpiresAt: string | null;
  createdAt: string;
  html: string;
}

const PAGE_CSS = `
  .friday-shared-body { color: #0f172a; font-size: 0.95rem; line-height: 1.65; }
  .friday-shared-body h1 { font-size: 1.6rem; font-weight: 700; margin: 1.25rem 0 0.6rem; }
  .friday-shared-body h2 { font-size: 1.3rem; font-weight: 700; margin: 1.1rem 0 0.5rem; }
  .friday-shared-body h3 { font-size: 1.1rem; font-weight: 600; margin: 0.9rem 0 0.4rem; }
  .friday-shared-body h4 { font-size: 1rem; font-weight: 600; margin: 0.8rem 0 0.4rem; }
  .friday-shared-body p { margin: 0.6rem 0; }
  .friday-shared-body ul, .friday-shared-body ol { margin: 0.6rem 0; padding-left: 1.5rem; }
  .friday-shared-body li { margin: 0.25rem 0; }
  .friday-shared-body blockquote { border-left: 3px solid #cbd5e1; padding: 0.25rem 0.85rem; margin: 0.6rem 0; color: #475569; }
  .friday-shared-body code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-size: 0.85em; }
  .friday-shared-body pre { background: #f1f5f9; padding: 0.85rem; border-radius: 0.5rem; overflow-x: auto; }
  .friday-shared-body a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
  .friday-shared-body table { border-collapse: collapse; width: 100%; margin: 0.85rem 0; font-size: 0.9rem; }
  .friday-shared-body th, .friday-shared-body td { border: 1px solid #e2e8f0; padding: 0.55rem 0.7rem; text-align: left; vertical-align: top; }
  .friday-shared-body th { background: #f8fafc; font-weight: 600; }
  .friday-shared-body tr:nth-child(even) td { background: #f8fafc; }
  .friday-shared-body hr { border: 0; border-top: 1px solid #e2e8f0; margin: 1.25rem 0; }
  .friday-shared-body img { max-width: 100%; height: auto; border-radius: 0.25rem; }
  @media print {
    .friday-shared-actions, .friday-shared-footer { display: none !important; }
    .friday-shared-shell { max-width: none !important; padding: 0.5in !important; }
  }
`;

export default function SharedFridayReport() {
  const [, params] = useRoute<{ token: string }>("/r/friday-report/:token");
  const token = params?.token ?? "";
  const { toast } = useToast();
  const [report, setReport] = useState<SharedReportPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "missing" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    fetch(`/api/public/friday-reports/${encodeURIComponent(token)}`, {
      // No credentials — this is a public endpoint and we don't want
      // accidental cookie leakage if someone embeds it.
      credentials: "omit",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setStatus("missing");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const data = (await res.json()) as SharedReportPayload;
        setReport(data);
        setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const sanitized = useMemo(
    () => (report ? sanitizeReportHtml(report.html) : ""),
    [report],
  );

  useEffect(() => {
    if (report?.title) document.title = `${report.title} — Friday Report`;
  }, [report?.title]);

  const reportData: FridayReportData | null = report
    ? {
        title: report.title,
        subtitle: report.subtitle ?? undefined,
        generatedAt: report.generatedAt ?? report.createdAt,
        html: report.html,
      }
    : null;

  const handlePrint = () => window.print();

  const handleDownload = () => {
    if (!reportData) return;
    const standalone = buildStandaloneReportHtml(reportData, sanitized);
    const safeName = (reportData.title || "report").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "report";
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

  const handleCopy = async () => {
    if (!reportData) return;
    try {
      const standalone = buildStandaloneReportHtml(reportData, sanitized);
      const tmp = document.createElement("div");
      tmp.innerHTML = sanitized;
      const plainBody = tmp.innerText || tmp.textContent || "";
      const plain = `${reportData.title}\n${reportData.subtitle ? reportData.subtitle + "\n" : ""}\n${plainBody}`.trim();
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

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading report…
        </div>
      </div>
    );
  }

  if (status === "missing" || status === "error") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-xl font-semibold mb-2 text-slate-900" data-testid="shared-report-missing-title">
            {status === "missing" ? "This link isn't active" : "Couldn't load report"}
          </h1>
          <p className="text-sm text-slate-600">
            {status === "missing"
              ? "The link may have expired or been revoked. Ask the person who shared it for a fresh link."
              : "Something went wrong loading this report. Please try again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  if (!report || !reportData) return null;

  const generated = report.generatedAt
    ? new Date(report.generatedAt).toLocaleString()
    : new Date(report.createdAt).toLocaleString();
  const sharedOn = report.sharedAt ? new Date(report.sharedAt).toLocaleDateString() : null;
  const expiresOn = report.shareExpiresAt
    ? new Date(report.shareExpiresAt).toLocaleDateString()
    : null;

  return (
    <div className="min-h-screen bg-white" data-testid="shared-friday-report">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <header className="friday-shared-actions border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-2.5 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Shared via <span className="font-medium text-slate-700">FridayReport.AI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleCopy} data-testid="shared-report-copy">
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="shared-report-print">
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} data-testid="shared-report-download">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download
            </Button>
          </div>
        </div>
      </header>
      <div className="friday-shared-shell max-w-4xl mx-auto px-4 md:px-8 py-8">
        <div className="border-b border-slate-200 pb-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900" data-testid="shared-report-title">
            {report.title}
          </h1>
          {report.subtitle && (
            <p className="text-sm md:text-base text-slate-600 mt-1">{report.subtitle}</p>
          )}
          <p className="text-xs text-slate-500 mt-2">
            Generated {generated}
            {sharedOn ? ` • Shared ${sharedOn}` : ""}
            {expiresOn ? ` • Link expires ${expiresOn}` : ""}
          </p>
        </div>
        <div
          className="friday-shared-body"
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
        <footer className="friday-shared-footer mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between gap-4">
          <span>This report was shared with you publicly via FridayReport.AI.</span>
          <a href="/" className="text-blue-600 hover:underline">
            Learn more
          </a>
        </footer>
      </div>
    </div>
  );
}
