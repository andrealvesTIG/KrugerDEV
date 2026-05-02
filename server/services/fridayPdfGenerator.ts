import PDFDocument from "pdfkit";

const PAGE_MARGIN = 50;
const HEADER_COLOR = "#2563eb";
const TEXT_COLOR = "#1f2937";
const MUTED_COLOR = "#6b7280";

function writeInline(doc: PDFKit.PDFDocument, text: string, opts: PDFKit.Mixins.TextOptions = {}) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  let first = true;
  for (const seg of segments) {
    if (!seg) continue;
    const isBold = seg.startsWith("**") && seg.endsWith("**");
    const value = isBold ? seg.slice(2, -2) : seg;
    doc.font(isBold ? "Helvetica-Bold" : "Helvetica");
    doc.text(value, { ...opts, continued: true });
    first = false;
  }
  if (first) doc.text("", opts);
  else doc.text("", { continued: false });
}

export async function renderMarkdownToPdfBuffer(title: string, markdown: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      info: { Title: title, Creator: "FridayReport.AI", Producer: "FridayReport.AI" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor(HEADER_COLOR).font("Helvetica-Bold").fontSize(20).text(title);
    doc.moveDown(0.2);
    doc.fillColor(MUTED_COLOR).font("Helvetica").fontSize(9)
      .text(`Generated ${new Date().toLocaleString()} · FridayReport.AI`);
    doc.moveDown(0.6);
    doc.strokeColor("#e5e7eb").lineWidth(0.5)
      .moveTo(PAGE_MARGIN, doc.y).lineTo(doc.page.width - PAGE_MARGIN, doc.y).stroke();
    doc.moveDown(0.6);
    doc.fillColor(TEXT_COLOR);

    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        doc.moveDown(0.4);
        continue;
      }
      if (line.startsWith("### ")) {
        doc.moveDown(0.3);
        doc.fillColor(TEXT_COLOR).font("Helvetica-Bold").fontSize(12);
        writeInline(doc, line.slice(4));
        doc.moveDown(0.1);
      } else if (line.startsWith("## ")) {
        doc.moveDown(0.4);
        doc.fillColor(TEXT_COLOR).font("Helvetica-Bold").fontSize(14);
        writeInline(doc, line.slice(3));
        doc.moveDown(0.1);
      } else if (line.startsWith("# ")) {
        doc.moveDown(0.5);
        doc.fillColor(HEADER_COLOR).font("Helvetica-Bold").fontSize(16);
        writeInline(doc, line.slice(2));
        doc.moveDown(0.1);
      } else if (/^\s*[-*]\s+/.test(line)) {
        const indent = (line.match(/^\s*/)?.[0].length ?? 0) >= 2 ? 16 : 0;
        const text = line.replace(/^\s*[-*]\s+/, "");
        doc.fillColor(TEXT_COLOR).font("Helvetica").fontSize(10);
        const x = PAGE_MARGIN + indent;
        doc.text("• ", x, doc.y, { continued: true, width: doc.page.width - PAGE_MARGIN - indent - PAGE_MARGIN });
        writeInline(doc, text, { width: doc.page.width - PAGE_MARGIN - indent - PAGE_MARGIN - 12 });
      } else if (/^\s*\d+\.\s+/.test(line)) {
        const m = line.match(/^\s*(\d+)\.\s+(.*)$/)!;
        doc.fillColor(TEXT_COLOR).font("Helvetica").fontSize(10);
        doc.text(`${m[1]}. `, { continued: true });
        writeInline(doc, m[2]);
      } else if (line.startsWith("> ")) {
        doc.fillColor(MUTED_COLOR).font("Helvetica-Oblique").fontSize(10);
        writeInline(doc, line.slice(2));
      } else {
        doc.fillColor(TEXT_COLOR).font("Helvetica").fontSize(10);
        writeInline(doc, line);
      }
    }

    doc.end();
  });
}
