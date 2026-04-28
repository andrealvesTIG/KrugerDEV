import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import type { PbiAttachment } from "../storage/powerbiAgentStorage";
import type { PbiAttachmentExtraction } from "@shared/schema";

const MAX_TEXT_PER_FILE = 12000;

const TEXTUAL_TYPES = new Set<string>([
  "text/plain", "text/csv", "text/markdown", "application/json",
]);
const PDF_TYPE = "application/pdf";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_TYPE = "application/msword";
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_TYPE = "application/vnd.ms-excel";

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_PER_FILE) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_PER_FILE), truncated: true };
}

async function extractFromPdf(buffer: Buffer): Promise<{ text: string; pageCount?: number }> {
  // Use the legacy build for Node.js compatibility (no DOM/Worker required).
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdf.js requires a fresh Uint8Array; pass a copy to avoid the underlying
  // ArrayBuffer being detached after parsing (which would break callers that
  // re-use the same Buffer).
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;
  const pageCount: number = doc.numPages;
  const out: string[] = [];
  const maxPages = Math.min(pageCount, 30);
  for (let i = 1; i <= maxPages; i++) {
    try {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const pageText = tc.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
      out.push(pageText);
      if (out.join("\n\n").length >= MAX_TEXT_PER_FILE) break;
    } catch {
      // Skip unreadable pages but keep going.
    }
  }
  try { await doc.destroy?.(); } catch {}
  return { text: out.join("\n\n").trim(), pageCount };
}

async function extractFromDocx(buffer: Buffer): Promise<string> {
  const mammoth: any = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return String(result?.value || "").trim();
}

async function extractFromXlsx(buffer: Buffer): Promise<{ text: string; sheetCount: number }> {
  const ExcelJS: any = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const lines: string[] = [];
  let sheetCount = 0;
  wb.eachSheet((sheet: any) => {
    sheetCount++;
    lines.push(`# Sheet: ${sheet.name}`);
    let header: string[] = [];
    const sample: string[] = [];
    let row = 0;
    sheet.eachRow({ includeEmpty: false }, (r: any) => {
      row++;
      const cells: string[] = [];
      r.eachCell({ includeEmpty: true }, (c: any) => {
        const v = c?.value;
        cells.push(v == null ? "" : typeof v === "object" && "text" in v ? String(v.text) : String(v));
      });
      if (header.length === 0) header = cells;
      else if (sample.length < 20) sample.push(cells.join(" | "));
    });
    if (header.length) lines.push(`Headers: ${header.join(" | ")}`);
    if (sample.length) lines.push(sample.join("\n"));
    lines.push("");
  });
  return { text: lines.join("\n").trim(), sheetCount };
}

function extractFromCsv(buffer: Buffer): string {
  const text = buffer.toString("utf-8");
  // Cap at first 200 lines so we capture headers + a representative sample.
  const lines = text.split(/\r?\n/).slice(0, 200).join("\n");
  return lines.trim();
}

export async function extractAttachmentText(att: PbiAttachment): Promise<PbiAttachmentExtraction> {
  const base: PbiAttachmentExtraction = {
    name: att.name, objectPath: att.objectPath, contentType: att.contentType, size: att.size,
    text: null,
  };
  try {
    const objStorage = new ObjectStorageService();
    const file = await objStorage.getObjectEntityFile("/" + att.objectPath.replace(/^\/+/, ""));
    const [buf] = await file.download();
    const ct = (att.contentType || "").toLowerCase();

    if (ct.startsWith("image/")) {
      // Images are handled by vision-capable models directly; no text extraction here.
      return { ...base, text: null };
    }
    if (TEXTUAL_TYPES.has(ct)) {
      const t = truncate(buf.toString("utf-8"));
      return { ...base, text: t.text, truncated: t.truncated };
    }
    if (ct === "text/csv" || att.name.toLowerCase().endsWith(".csv")) {
      const t = truncate(extractFromCsv(buf));
      return { ...base, text: t.text, truncated: t.truncated };
    }
    if (ct === PDF_TYPE) {
      const r = await extractFromPdf(buf);
      const t = truncate(r.text);
      return { ...base, text: t.text, truncated: t.truncated, pageCount: r.pageCount };
    }
    if (ct === DOCX_TYPE) {
      const raw = await extractFromDocx(buf);
      const t = truncate(raw);
      return { ...base, text: t.text, truncated: t.truncated };
    }
    if (ct === DOC_TYPE) {
      // Legacy .doc isn't natively supported; do best-effort string scrape.
      const raw = buf.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]+/g, " ").replace(/\s{3,}/g, " ").trim();
      const t = truncate(raw);
      return { ...base, text: t.text, truncated: t.truncated, error: raw ? undefined : "Could not extract text from .doc" };
    }
    if (ct === XLSX_TYPE || ct === XLS_TYPE) {
      const r = await extractFromXlsx(buf);
      const t = truncate(r.text);
      return { ...base, text: t.text, truncated: t.truncated, sheetCount: r.sheetCount };
    }
    return { ...base, text: null, error: `Unsupported content type: ${ct}` };
  } catch (e: any) {
    return { ...base, text: null, error: e?.message || "Extraction failed" };
  }
}

export async function extractAllAttachments(atts: PbiAttachment[]): Promise<PbiAttachmentExtraction[]> {
  const results: PbiAttachmentExtraction[] = [];
  for (const att of atts) {
    results.push(await extractAttachmentText(att));
  }
  return results;
}
