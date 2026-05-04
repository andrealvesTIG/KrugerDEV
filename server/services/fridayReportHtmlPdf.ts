import PDFDocument from "pdfkit";
import sanitizeHtml from "sanitize-html";
import { Window } from "happy-dom";

const PAGE_MARGIN = 50;
const TITLE_COLOR = "#0f172a";
const TEXT_COLOR = "#1f2937";
const MUTED_COLOR = "#64748b";
const HEADING_COLOR = "#0f172a";
const LINK_COLOR = "#2563eb";
const BORDER_COLOR = "#e2e8f0";
const HEADER_BG = "#f8fafc";
const CODE_BG = "#f1f5f9";
const QUOTE_BORDER = "#cbd5e1";

const HEADING_SIZES: Record<string, number> = {
  h1: 18, h2: 15, h3: 13, h4: 12, h5: 11, h6: 10,
};

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside", "nav",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "blockquote", "pre", "hr", "figure", "figcaption", "dl", "dt", "dd",
]);

interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
  code?: boolean;
  color?: string;
}

export interface FridayReportPdfInput {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  html: string;
}

export function sanitizeReportHtmlForPdf(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr", "div", "span", "section", "article", "header", "footer", "main", "aside",
      "ul", "ol", "li", "dl", "dt", "dd",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
      "strong", "em", "b", "i", "u", "s", "small", "sub", "sup", "mark", "del", "ins",
      "code", "pre", "blockquote",
      "a", "figure", "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "title", "style"],
      td: ["colspan", "align", "style"],
      th: ["colspan", "align", "scope", "style"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        color: [/^#(0x)?[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i, /^[a-z]+$/i],
        "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
        "font-style": [/^(normal|italic|oblique)$/i],
        "text-decoration": [/^[a-z\s-]+$/i],
        "text-decoration-line": [/^[a-z\s-]+$/i],
        "text-align": [/^(left|center|right|justify)$/i],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
  });
}

interface ParsedStyle {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: "left" | "center" | "right";
}

function parseInlineStyle(raw: string | null | undefined): ParsedStyle {
  const out: ParsedStyle = {};
  if (!raw) return out;
  for (const decl of raw.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim().toLowerCase();
    if (!val || val.length > 80) continue;
    if (prop === "color") {
      // pdfkit accepts named CSS colors and #hex; pass through values our
      // sanitizer has already validated.
      if (/^#[0-9a-f]{3,8}$/i.test(val) || /^[a-z]+$/i.test(val) || /^rgb\(/i.test(val)) {
        out.color = val;
      }
    } else if (prop === "font-weight") {
      const n = parseInt(val, 10);
      if (val === "bold" || val === "bolder" || (!isNaN(n) && n >= 600)) out.bold = true;
    } else if (prop === "font-style") {
      if (val === "italic" || val === "oblique") out.italic = true;
    } else if (prop === "text-decoration" || prop === "text-decoration-line") {
      if (val.includes("underline")) out.underline = true;
      if (val.includes("line-through")) out.strike = true;
    } else if (prop === "text-align") {
      if (val === "center" || val === "right" || val === "left") out.align = val;
    }
  }
  return out;
}

function fontFor(bold?: boolean, italic?: boolean, code?: boolean): string {
  if (code) {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag);
}

interface NodeLike {
  nodeType: number;
  tagName?: string;
  textContent?: string | null;
  childNodes: ArrayLike<NodeLike>;
  getAttribute?: (name: string) => string | null;
}

function collectInline(node: NodeLike | null | undefined, ctx: Partial<InlineRun> = {}): InlineRun[] {
  const runs: InlineRun[] = [];
  if (!node) return runs;
  if (node.nodeType === 3) {
    const t = (node.textContent || "").replace(/\s+/g, " ");
    if (t.trim().length === 0 && t.length === 0) return runs;
    if (t) runs.push({ text: t, ...ctx });
    return runs;
  }
  if (node.nodeType !== 1) return runs;
  const tag = String(node.tagName || "").toLowerCase();
  if (isBlockTag(tag) && tag !== "br") {
    // Treat nested block as plain inline text (best effort)
    for (let i = 0; i < node.childNodes.length; i++) {
      runs.push(...collectInline(node.childNodes[i], ctx));
    }
    return runs;
  }
  const next: Partial<InlineRun> = { ...ctx };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i" || tag === "cite") next.italic = true;
  if (tag === "u" || tag === "ins") next.underline = true;
  if (tag === "s" || tag === "del" || tag === "strike") next.strike = true;
  if (tag === "code" || tag === "kbd" || tag === "samp" || tag === "var") next.code = true;
  if (tag === "a") {
    const href = node.getAttribute?.("href") || "";
    if (href) next.link = href;
    next.color = LINK_COLOR;
    next.underline = true;
  }
  // Apply inline style attribute (color/bold/italic/underline/strike).
  const style = parseInlineStyle(node.getAttribute?.("style"));
  if (style.bold) next.bold = true;
  if (style.italic) next.italic = true;
  if (style.underline) next.underline = true;
  if (style.strike) next.strike = true;
  if (style.color) next.color = style.color;
  if (tag === "br") {
    runs.push({ text: "\n", ...ctx });
    return runs;
  }
  for (let i = 0; i < node.childNodes.length; i++) {
    runs.push(...collectInline(node.childNodes[i], next));
  }
  return runs;
}

function trimRuns(runs: InlineRun[]): InlineRun[] {
  const cleaned = runs.filter((r) => r.text.length > 0);
  if (cleaned.length === 0) return cleaned;
  // Trim leading whitespace on first run, trailing on last.
  cleaned[0] = { ...cleaned[0], text: cleaned[0].text.replace(/^\s+/, "") };
  const last = cleaned.length - 1;
  cleaned[last] = { ...cleaned[last], text: cleaned[last].text.replace(/\s+$/, "") };
  return cleaned.filter((r) => r.text.length > 0);
}

function emitInline(
  doc: PDFKit.PDFDocument,
  runs: InlineRun[],
  opts: { x?: number; width?: number; baseFontSize?: number; baseColor?: string; baseFont?: string; align?: "left" | "center" | "right"; indent?: number } = {},
): void {
  const cleaned = trimRuns(runs);
  if (cleaned.length === 0) {
    return;
  }
  const baseFontSize = opts.baseFontSize ?? 10;
  const baseColor = opts.baseColor ?? TEXT_COLOR;
  const baseFont = opts.baseFont ?? "Helvetica";
  for (let i = 0; i < cleaned.length; i++) {
    const r = cleaned[i];
    const isLast = i === cleaned.length - 1;
    doc
      .font(fontFor(r.bold, r.italic, r.code) || baseFont)
      .fontSize(baseFontSize)
      .fillColor(r.color || baseColor);
    const textOpts: PDFKit.Mixins.TextOptions = {
      continued: !isLast,
    };
    if (opts.width !== undefined) textOpts.width = opts.width;
    if (opts.align) textOpts.align = opts.align;
    if (opts.indent !== undefined) textOpts.indent = opts.indent;
    if (r.underline) textOpts.underline = true;
    if (r.strike) textOpts.strike = true;
    if (r.link) textOpts.link = r.link;
    if (i === 0 && opts.x !== undefined) {
      doc.text(r.text, opts.x, doc.y, textOpts);
    } else {
      doc.text(r.text, textOpts);
    }
  }
  // Reset
  doc.fillColor(baseColor).font(baseFont).fontSize(baseFontSize);
}

function drawHr(doc: PDFKit.PDFDocument): void {
  const y = doc.y + 2;
  doc.save();
  doc.strokeColor(BORDER_COLOR).lineWidth(0.5)
    .moveTo(PAGE_MARGIN, y)
    .lineTo(doc.page.width - PAGE_MARGIN, y)
    .stroke();
  doc.restore();
  doc.y = y + 4;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
}

function renderList(doc: PDFKit.PDFDocument, listNode: NodeLike, ordered: boolean, depth: number): void {
  const items: NodeLike[] = [];
  for (let i = 0; i < listNode.childNodes.length; i++) {
    const child = listNode.childNodes[i];
    if (child.nodeType === 1 && String(child.tagName || "").toLowerCase() === "li") {
      items.push(child);
    }
  }
  let idx = 1;
  for (const li of items) {
    const indent = depth * 14;
    const x = PAGE_MARGIN + indent;
    const bullet = ordered ? `${idx}. ` : "•  ";
    const usableWidth = doc.page.width - PAGE_MARGIN - x;
    // Collect inline runs and any nested lists
    const inlineRuns: InlineRun[] = [];
    const subLists: NodeLike[] = [];
    for (let j = 0; j < li.childNodes.length; j++) {
      const child = li.childNodes[j];
      if (child.nodeType === 1) {
        const t = String(child.tagName || "").toLowerCase();
        if (t === "ul" || t === "ol") {
          subLists.push(child);
          continue;
        }
      }
      inlineRuns.push(...collectInline(child));
    }
    const cleaned = trimRuns(inlineRuns);
    ensureSpace(doc, 14);
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_COLOR);
    if (cleaned.length === 0) {
      doc.text(bullet, x, doc.y, { width: usableWidth });
    } else {
      doc.text(bullet, x, doc.y, { continued: true, width: usableWidth });
      for (let k = 0; k < cleaned.length; k++) {
        const r = cleaned[k];
        const isLast = k === cleaned.length - 1;
        doc
          .font(fontFor(r.bold, r.italic, r.code))
          .fontSize(10)
          .fillColor(r.color || TEXT_COLOR);
        const textOpts: PDFKit.Mixins.TextOptions = { continued: !isLast };
        if (r.underline) textOpts.underline = true;
        if (r.strike) textOpts.strike = true;
        if (r.link) textOpts.link = r.link;
        doc.text(r.text, textOpts);
      }
      // Reset
      doc.font("Helvetica").fillColor(TEXT_COLOR);
    }
    doc.moveDown(0.15);
    for (const sub of subLists) {
      const isOl = String(sub.tagName || "").toLowerCase() === "ol";
      renderList(doc, sub, isOl, depth + 1);
    }
    idx++;
  }
}

function renderBlockquote(doc: PDFKit.PDFDocument, node: NodeLike): void {
  const runs = collectInline(node);
  if (trimRuns(runs).length === 0) return;
  const startY = doc.y + 2;
  const x = PAGE_MARGIN + 12;
  const width = doc.page.width - PAGE_MARGIN - x;
  doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED_COLOR);
  doc.text("", x, startY); // position cursor
  emitInline(doc, runs, {
    x,
    width,
    baseFontSize: 10,
    baseColor: MUTED_COLOR,
    baseFont: "Helvetica-Oblique",
  });
  const endY = doc.y;
  doc.save();
  doc.strokeColor(QUOTE_BORDER).lineWidth(2)
    .moveTo(PAGE_MARGIN + 4, startY)
    .lineTo(PAGE_MARGIN + 4, endY)
    .stroke();
  doc.restore();
  doc.fillColor(TEXT_COLOR).font("Helvetica");
  doc.moveDown(0.4);
}

function renderPre(doc: PDFKit.PDFDocument, node: NodeLike): void {
  const text = (node.textContent || "").replace(/\r\n/g, "\n").replace(/\s+$/g, "");
  if (!text) return;
  const padding = 8;
  const x = PAGE_MARGIN;
  const width = doc.page.width - PAGE_MARGIN * 2;
  doc.font("Courier").fontSize(9).fillColor(TEXT_COLOR);
  const innerWidth = width - padding * 2;
  const h = doc.heightOfString(text, { width: innerWidth }) + padding * 2;
  ensureSpace(doc, h + 6);
  const startY = doc.y;
  doc.save();
  doc.rect(x, startY, width, h).fillColor(CODE_BG).fill();
  doc.restore();
  doc.fillColor(TEXT_COLOR).font("Courier").fontSize(9);
  doc.text(text, x + padding, startY + padding, { width: innerWidth });
  doc.y = startY + h;
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10);
}

function renderTable(doc: PDFKit.PDFDocument, tableNode: NodeLike): void {
  interface Cell { runs: InlineRun[]; isHeader: boolean; colspan: number; align?: string }
  interface Row { cells: Cell[] }
  const rows: Row[] = [];

  function processRow(trNode: NodeLike, isHeaderSection: boolean): void {
    const cells: Cell[] = [];
    for (let i = 0; i < trNode.childNodes.length; i++) {
      const cn = trNode.childNodes[i];
      if (cn.nodeType !== 1) continue;
      const t = String(cn.tagName || "").toLowerCase();
      if (t !== "td" && t !== "th") continue;
      const colspanStr = cn.getAttribute?.("colspan") || "1";
      const colspan = Math.max(1, Math.min(10, parseInt(colspanStr, 10) || 1));
      const align = cn.getAttribute?.("align") || undefined;
      cells.push({
        runs: collectInline(cn),
        isHeader: isHeaderSection || t === "th",
        colspan,
        align: align || undefined,
      });
    }
    if (cells.length > 0) rows.push({ cells });
  }

  function walk(parent: NodeLike, headerSection: boolean): void {
    for (let i = 0; i < parent.childNodes.length; i++) {
      const c = parent.childNodes[i];
      if (c.nodeType !== 1) continue;
      const t = String(c.tagName || "").toLowerCase();
      if (t === "thead") walk(c, true);
      else if (t === "tbody" || t === "tfoot") walk(c, false);
      else if (t === "tr") processRow(c, headerSection);
    }
  }
  walk(tableNode, false);

  if (rows.length === 0) return;

  const colCount = Math.max(...rows.map((r) => r.cells.reduce((s, c) => s + c.colspan, 0)));
  if (colCount === 0) return;

  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidth = tableWidth / colCount;
  const padding = 5;

  doc.moveDown(0.3);

  for (const row of rows) {
    // Compute row height
    const heights: number[] = [];
    for (const cell of row.cells) {
      const text = cell.runs.map((r) => r.text).join("").trim() || " ";
      const w = colWidth * cell.colspan - padding * 2;
      doc.font(cell.isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9.5);
      heights.push(doc.heightOfString(text, { width: w }));
    }
    const rowH = Math.max(...heights, 0) + padding * 2;
    ensureSpace(doc, rowH + 2);
    const startY = doc.y;

    // Draw cells
    let cx = PAGE_MARGIN;
    for (const cell of row.cells) {
      const w = colWidth * cell.colspan;
      // Header background
      if (cell.isHeader) {
        doc.save();
        doc.rect(cx, startY, w, rowH).fillColor(HEADER_BG).fill();
        doc.restore();
      }
      // Border
      doc.save();
      doc.rect(cx, startY, w, rowH).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
      doc.restore();
      // Text
      const text = cell.runs.map((r) => r.text).join("").trim() || " ";
      doc.font(cell.isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(TEXT_COLOR);
      const align: "left" | "center" | "right" =
        cell.align === "center" ? "center" : cell.align === "right" ? "right" : "left";
      doc.text(text, cx + padding, startY + padding, { width: w - padding * 2, align });
      cx += w;
    }

    doc.y = startY + rowH;
  }

  // Reset font/fill
  doc.font("Helvetica").fontSize(10).fillColor(TEXT_COLOR);
  doc.moveDown(0.5);
}

function renderBlock(doc: PDFKit.PDFDocument, node: NodeLike): void {
  if (node.nodeType === 3) {
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_COLOR);
    doc.text(text, { width: doc.page.width - PAGE_MARGIN * 2 });
    doc.moveDown(0.3);
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = String(node.tagName || "").toLowerCase();

  const blockStyle = parseInlineStyle(node.getAttribute?.("style"));

  // Headings
  if (HEADING_SIZES[tag]) {
    const size = HEADING_SIZES[tag];
    doc.moveDown(tag === "h1" || tag === "h2" ? 0.5 : 0.35);
    const runs = collectInline(node);
    if (trimRuns(runs).length === 0) return;
    ensureSpace(doc, size + 8);
    doc.font("Helvetica-Bold").fontSize(size).fillColor(blockStyle.color || HEADING_COLOR);
    emitInline(doc, runs, {
      baseFontSize: size,
      baseColor: blockStyle.color || HEADING_COLOR,
      baseFont: "Helvetica-Bold",
      width: doc.page.width - PAGE_MARGIN * 2,
      align: blockStyle.align,
    });
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(10).fillColor(TEXT_COLOR);
    return;
  }

  switch (tag) {
    case "br":
      doc.moveDown(0.4);
      return;
    case "hr":
      drawHr(doc);
      return;
    case "ul":
      renderList(doc, node, false, 0);
      doc.moveDown(0.3);
      return;
    case "ol":
      renderList(doc, node, true, 0);
      doc.moveDown(0.3);
      return;
    case "blockquote":
      renderBlockquote(doc, node);
      return;
    case "pre":
      renderPre(doc, node);
      return;
    case "table":
      renderTable(doc, node);
      return;
    case "p":
    case "figcaption":
    case "dt":
    case "dd": {
      const runs = collectInline(node);
      if (trimRuns(runs).length === 0) return;
      const baseColor = blockStyle.color || TEXT_COLOR;
      doc.font("Helvetica").fontSize(10).fillColor(baseColor);
      emitInline(doc, runs, {
        baseFontSize: 10,
        baseColor,
        width: doc.page.width - PAGE_MARGIN * 2,
        align: blockStyle.align,
      });
      doc.moveDown(tag === "p" ? 0.4 : 0.2);
      return;
    }
    default: {
      // Container — recurse into children
      for (let i = 0; i < node.childNodes.length; i++) {
        renderBlock(doc, node.childNodes[i]);
      }
    }
  }
}

function safeFilenamePart(s: string): string {
  return (s || "report").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "report";
}

export function buildReportPdfFilename(input: FridayReportPdfInput): string {
  const dateSrc = input.generatedAt ? new Date(input.generatedAt) : new Date();
  const date = isNaN(dateSrc.getTime()) ? new Date() : dateSrc;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${safeFilenamePart(input.title)}_${yyyy}-${mm}-${dd}.pdf`;
}

export async function renderHtmlReportToPdfBuffer(input: FridayReportPdfInput): Promise<Buffer> {
  const sanitized = sanitizeReportHtmlForPdf(input.html || "");
  // Parse into a DOM tree using happy-dom.
  const window = new Window();
  const document = window.document;
  // Wrap in a container so we can iterate top-level children.
  document.body.innerHTML = `<div id="__root">${sanitized}</div>`;
  const root = document.getElementById("__root") as unknown as NodeLike | null;

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      info: {
        Title: input.title || "Report",
        Creator: "FridayReport.AI",
        Producer: "FridayReport.AI",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    try {
      // Header: title, subtitle, generated meta, divider
      doc.fillColor(TITLE_COLOR).font("Helvetica-Bold").fontSize(20)
        .text(input.title || "Report", { width: doc.page.width - PAGE_MARGIN * 2 });

      if (input.subtitle && input.subtitle.trim()) {
        doc.moveDown(0.2);
        doc.fillColor(MUTED_COLOR).font("Helvetica").fontSize(11)
          .text(input.subtitle.trim(), { width: doc.page.width - PAGE_MARGIN * 2 });
      }

      const generatedDate = input.generatedAt ? new Date(input.generatedAt) : new Date();
      const generatedLabel = isNaN(generatedDate.getTime())
        ? new Date().toLocaleString()
        : generatedDate.toLocaleString();
      doc.moveDown(0.2);
      doc.fillColor(MUTED_COLOR).font("Helvetica").fontSize(8.5)
        .text(`Generated ${generatedLabel} · FridayReport.AI`, { width: doc.page.width - PAGE_MARGIN * 2 });

      doc.moveDown(0.6);
      doc.save();
      doc.strokeColor(BORDER_COLOR).lineWidth(0.5)
        .moveTo(PAGE_MARGIN, doc.y)
        .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
        .stroke();
      doc.restore();
      doc.moveDown(0.6);

      // Body
      doc.fillColor(TEXT_COLOR).font("Helvetica").fontSize(10);
      if (root) {
        for (let i = 0; i < root.childNodes.length; i++) {
          renderBlock(doc, root.childNodes[i]);
        }
      } else {
        // Fallback: dump plain text
        const fallback = (document.body.textContent || "").trim();
        if (fallback) doc.text(fallback);
      }

      doc.end();
      // Best-effort cleanup of happy-dom timers/resources.
      try { (window as unknown as { close?: () => void }).close?.(); } catch { /* noop */ }
    } catch (err) {
      reject(err);
    }
  });
}

