import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PdfCanvasRendererProps {
  fileUrl: string;
  onDimensionsReady?: (width: number, height: number) => void;
}

export default function PdfCanvasRenderer({ fileUrl, onDimensionsReady }: PdfCanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const renderPage = useCallback(async (pageNum: number) => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || !canvasRef.current) return;

    const page = await pdfDoc.getPage(pageNum);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    onDimensionsReady?.(viewport.width, viewport.height);
  }, [onDimensionsReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      try {
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setPageCount(pdfDoc.numPages);
        setCurrentPage(1);
        await renderPage(1);
      } catch (err) {
        console.error("[PdfCanvasRenderer] Failed to load PDF:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    if (pdfDocRef.current && !loading) {
      renderPage(currentPage);
    }
  }, [currentPage, renderPage, loading]);

  return (
    <div className="inline-block">
      {loading && (
        <div className="w-[800px] h-[600px] flex items-center justify-center bg-muted/30">
          <span className="text-sm text-muted-foreground">Loading PDF...</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="max-w-none"
        style={{ display: loading ? "none" : "block" }}
      />
      {pageCount > 1 && !loading && (
        <div className="flex items-center justify-center gap-2 mt-2 bg-background/80 rounded px-3 py-1 text-sm absolute bottom-4 left-1/2 -translate-x-1/2 z-10 shadow border">
          <button
            className="px-2 py-0.5 rounded hover:bg-muted disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(1, p - 1)); }}
          >
            Prev
          </button>
          <span className="text-xs">
            Page {currentPage} of {pageCount}
          </span>
          <button
            className="px-2 py-0.5 rounded hover:bg-muted disabled:opacity-40"
            disabled={currentPage >= pageCount}
            onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(pageCount, p + 1)); }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
