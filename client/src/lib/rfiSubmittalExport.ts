import ExcelJS from "exceljs";
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

export async function exportRfisToFile(rfis: Rfi[], format: "csv" | "xlsx", projectName?: string) {
  const headers = ["RFI #", "Subject", "Question", "Status", "Priority", "Category", "Assigned To", "Due Date", "Cost Impact", "Schedule Impact", "References", "Created"];

  if (format === "csv") {
    const rows = [headers.map(escapeCSV).join(",")];
    for (const rfi of rfis) {
      rows.push([
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
      ].map(escapeCSV).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadFile(blob, `${projectName ? projectName + "_" : ""}rfis.csv`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("RFIs");
  sheet.columns = headers.map((h, i) => ({ header: h, key: `col${i}`, width: i < 3 ? 30 : 15 }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const rfi of rfis) {
    sheet.addRow({
      col0: rfi.rfiNumber,
      col1: rfi.subject,
      col2: rfi.question,
      col3: rfi.status,
      col4: rfi.priority || "",
      col5: rfi.category || "",
      col6: rfi.assignedToName || "",
      col7: rfi.dueDate || "",
      col8: rfi.costImpact || "",
      col9: rfi.scheduleImpact || "",
      col10: rfi.references || "",
      col11: rfi.createdAt ? new Date(rfi.createdAt).toLocaleDateString() : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadFile(blob, `${projectName ? projectName + "_" : ""}rfis.xlsx`);
}

export async function exportSubmittalsToFile(submittals: Submittal[], format: "csv" | "xlsx", projectName?: string) {
  const headers = ["Submittal #", "Title", "Description", "Status", "Type", "Priority", "Spec Section", "Submitted By", "Reviewer", "Submit Date", "Required Date", "Lead Time (days)", "Cost Impact", "Schedule Impact", "Revision", "Created"];

  if (format === "csv") {
    const rows = [headers.map(escapeCSV).join(",")];
    for (const sub of submittals) {
      rows.push([
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
      ].map(escapeCSV).join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadFile(blob, `${projectName ? projectName + "_" : ""}submittals.csv`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Submittals");
  sheet.columns = headers.map((h, i) => ({ header: h, key: `col${i}`, width: i < 3 ? 30 : 15 }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  for (const sub of submittals) {
    sheet.addRow({
      col0: sub.submittalNumber,
      col1: sub.title,
      col2: sub.description || "",
      col3: sub.status,
      col4: sub.type || "",
      col5: sub.priority || "",
      col6: sub.specSection || "",
      col7: sub.submittedByName || "",
      col8: sub.reviewerName || "",
      col9: sub.submitDate || "",
      col10: sub.requiredDate || "",
      col11: sub.leadTime != null ? sub.leadTime : "",
      col12: sub.costImpact || "",
      col13: sub.scheduleImpact || "",
      col14: sub.currentRevision || 1,
      col15: sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadFile(blob, `${projectName ? projectName + "_" : ""}submittals.xlsx`);
}
