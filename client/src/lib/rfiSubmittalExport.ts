import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Rfi, Submittal } from "@shared/schema";

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSV(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const RFI_HEADERS = ["RFI #", "Subject", "Question", "Status", "Priority", "Category", "Assigned To", "Due Date", "Cost Impact", "Schedule Impact", "References", "Created"];

function rfiToRow(rfi: Rfi): string[] {
  return [
    rfi.rfiNumber,
    rfi.subject,
    rfi.question,
    rfi.status,
    rfi.priority || "",
    rfi.category || "",
    rfi.assignedToName || "",
    rfi.dueDate || "",
    rfi.costImpact || "",
    rfi.scheduleImpact || "",
    rfi.references || "",
    rfi.createdAt ? new Date(rfi.createdAt).toLocaleDateString() : "",
  ];
}

export async function exportRfisToFile(rfis: Rfi[], format: "csv" | "xlsx" | "pdf", projectName?: string) {
  const prefix = projectName ? projectName + "_" : "";

  if (format === "csv") {
    const rows = [RFI_HEADERS.map(escapeCSV).join(",")];
    for (const rfi of rfis) {
      rows.push(rfiToRow(rfi).map(escapeCSV).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadFile(blob, `${prefix}rfis.csv`);
    return;
  }

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("RFIs Report", 14, 15);
    if (projectName) {
      doc.setFontSize(10);
      doc.text(`Project: ${projectName}`, 14, 22);
    }
    autoTable(doc, {
      startY: projectName ? 26 : 20,
      head: [RFI_HEADERS],
      body: rfis.map(rfiToRow),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [68, 114, 196], textColor: 255 },
      columnStyles: {
        2: { cellWidth: 50 },
      },
    });
    doc.save(`${prefix}rfis.pdf`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("RFIs");
  sheet.columns = RFI_HEADERS.map((h, i) => ({ header: h, key: `col${i}`, width: i < 3 ? 30 : 15 }));

  const headerRow = sheet.getRow(1);
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const rfi of rfis) {
    const row = rfiToRow(rfi);
    const obj: Record<string, string> = {};
    row.forEach((v, i) => { obj[`col${i}`] = v; });
    sheet.addRow(obj);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadFile(blob, `${prefix}rfis.xlsx`);
}

const SUBMITTAL_HEADERS = ["Submittal #", "Title", "Description", "Status", "Type", "Priority", "Spec Section", "Submitted By", "Reviewer", "Submit Date", "Required Date", "Lead Time (days)", "Cost Impact", "Schedule Impact", "Revision", "Created"];

function submittalToRow(sub: Submittal): string[] {
  return [
    sub.submittalNumber,
    sub.title,
    sub.description || "",
    sub.status,
    sub.type || "",
    sub.priority || "",
    sub.specSection || "",
    sub.submittedByName || "",
    sub.reviewerName || "",
    sub.submitDate || "",
    sub.requiredDate || "",
    sub.leadTime != null ? String(sub.leadTime) : "",
    sub.costImpact || "",
    sub.scheduleImpact || "",
    String(sub.currentRevision || 1),
    sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "",
  ];
}

export async function exportSubmittalsToFile(submittals: Submittal[], format: "csv" | "xlsx" | "pdf", projectName?: string) {
  const prefix = projectName ? projectName + "_" : "";

  if (format === "csv") {
    const rows = [SUBMITTAL_HEADERS.map(escapeCSV).join(",")];
    for (const sub of submittals) {
      rows.push(submittalToRow(sub).map(escapeCSV).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadFile(blob, `${prefix}submittals.csv`);
    return;
  }

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Submittals Report", 14, 15);
    if (projectName) {
      doc.setFontSize(10);
      doc.text(`Project: ${projectName}`, 14, 22);
    }
    autoTable(doc, {
      startY: projectName ? 26 : 20,
      head: [SUBMITTAL_HEADERS],
      body: submittals.map(submittalToRow),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [68, 114, 196], textColor: 255 },
      columnStyles: {
        2: { cellWidth: 40 },
      },
    });
    doc.save(`${prefix}submittals.pdf`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Submittals");
  sheet.columns = SUBMITTAL_HEADERS.map((h, i) => ({ header: h, key: `col${i}`, width: i < 3 ? 30 : 15 }));

  const headerRow = sheet.getRow(1);
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const sub of submittals) {
    const row = submittalToRow(sub);
    const obj: Record<string, string> = {};
    row.forEach((v, i) => { obj[`col${i}`] = v; });
    sheet.addRow(obj);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadFile(blob, `${prefix}submittals.xlsx`);
}
