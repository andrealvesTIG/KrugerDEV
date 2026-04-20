// Export the project financial grid (per-item monthly amounts × scenarios)
// using the org's fiscal calendar so the downloaded file matches what users
// see on screen. Headers, column order, and quarter/year hints all derive
// from `shared/lib/fiscalCalendar.ts` — never hardcoded to October.

import ExcelJS from "exceljs";
import type { FinancialEntry, FinancialType } from "@shared/schema";
import {
  buildFiscalMonths,
  buildFiscalQuarters,
  buildFiscalYearColumn,
} from "@shared/lib/fiscalCalendar";

export type FinancialExportViewMode = "month" | "quarter" | "year";

export interface FinancialGridExportOptions {
  projectId: number;
  projectName?: string;
  fiscalYear: number;
  fiscalYearStartMonth: number;
  viewMode: FinancialExportViewMode;
  /** Visible scenarios in render order (e.g. AOP, FCST, ACT, EAC). */
  displayedTypes: FinancialType[];
  /** Visible per-period scenarios (EAC excluded — only meaningful as totals). */
  monthDisplayedTypes: FinancialType[];
  /** Raw entries (after any client-side filtering, e.g. search). */
  entries: FinancialEntry[];
  /** Pre-computed EAC monthly per item (itemKey → 12 numbers), if EAC visible. */
  eacByItem?: Record<string, number[]>;
}

interface ExportItem {
  itemKey: string;
  itemName: string;
  financialView: string;
  costCategory: string;
  costSpecification: string;
  category: string | null;
  wbs: string | null;
  comments: string | null;
  sortOrder: number;
  /** monthlyByType[typeKey][0..11] */
  monthlyByType: Record<string, number[]>;
}

function aggregateItems(opts: FinancialGridExportOptions): ExportItem[] {
  const visibleKeys = new Set(opts.monthDisplayedTypes.map(t => t.key));
  const items = new Map<string, ExportItem>();
  for (const e of opts.entries) {
    if (!visibleKeys.has(e.scenario) && e.scenario !== "eac") continue;
    let it = items.get(e.itemKey);
    if (!it) {
      it = {
        itemKey: e.itemKey,
        itemName: e.itemName,
        financialView: e.financialView || "Uncategorized",
        costCategory: e.costCategory || "Uncategorized",
        costSpecification: e.costSpecification || "—",
        category: e.category,
        wbs: e.wbs,
        comments: e.comments,
        sortOrder: e.sortOrder ?? 0,
        monthlyByType: {},
      };
      items.set(e.itemKey, it);
    }
    if (!it.monthlyByType[e.scenario]) it.monthlyByType[e.scenario] = new Array(12).fill(0);
    it.monthlyByType[e.scenario][e.month - 1] = Number(e.amount) || 0;
  }
  // Splice in the virtual EAC series when it's a displayed (total-only) type.
  const showsEac = opts.displayedTypes.some(t => t.key === "eac");
  if (showsEac && opts.eacByItem) {
    for (const it of items.values()) {
      const eac = opts.eacByItem[it.itemKey];
      if (eac && eac.length === 12) it.monthlyByType.eac = eac.slice();
    }
  }
  return Array.from(items.values()).sort((a, b) => {
    const v = a.financialView.localeCompare(b.financialView);
    if (v !== 0) return v;
    const c = a.costCategory.localeCompare(b.costCategory);
    if (c !== 0) return c;
    const s = a.costSpecification.localeCompare(b.costSpecification);
    if (s !== 0) return s;
    return (a.sortOrder - b.sortOrder) || a.itemName.localeCompare(b.itemName);
  });
}

/**
 * Build period columns from the org's fiscal calendar. Each period carries
 * the fiscal-month indices it aggregates so we can sum the right cells
 * regardless of where the FY starts (Oct, Apr, Jan, …).
 */
function buildPeriods(opts: FinancialGridExportOptions) {
  const { fiscalYear, fiscalYearStartMonth, viewMode } = opts;
  if (viewMode === "quarter") {
    return buildFiscalQuarters(fiscalYear, fiscalYearStartMonth).map(q => ({
      key: q.key,
      // Header keeps the calendar-month hint so April-start orgs show
      // "Q1 (Apr–Jun)" instead of the legacy "Q1 (Oct–Dec)".
      header: `${q.label} (${q.hint})`,
      monthIndices: q.monthIndices,
    }));
  }
  if (viewMode === "year") {
    const fy = buildFiscalYearColumn(fiscalYear, fiscalYearStartMonth);
    return [{ key: fy.key, header: `${fy.label} (${fy.hint})`, monthIndices: fy.monthIndices }];
  }
  return buildFiscalMonths(fiscalYear, fiscalYearStartMonth).map((m, i) => ({
    key: `m${m.monthNum}`,
    // Append the calendar year so multi-year fiscal periods stay unambiguous.
    header: `${m.label} ${m.year}`,
    monthIndices: [i],
  }));
}

function sumPeriod(arr: number[] | undefined, indices: number[]): number {
  if (!arr) return 0;
  let s = 0;
  for (const i of indices) s += arr[i] || 0;
  return s;
}

interface BuiltTable {
  headers: string[];
  rows: (string | number)[][];
  /** Column count of the dimension (non-numeric) prefix. */
  dimensionColCount: number;
  /** Filename stem (no extension). */
  filename: string;
  /** Subtitle line summarizing the fiscal calendar context. */
  subtitle: string;
}

function buildTable(opts: FinancialGridExportOptions): BuiltTable {
  const months = buildFiscalMonths(opts.fiscalYear, opts.fiscalYearStartMonth);
  const periods = buildPeriods(opts);
  const items = aggregateItems(opts);
  const types = opts.viewMode === "month" ? opts.monthDisplayedTypes : opts.displayedTypes;

  const dimHeaders = [
    "Financial View", "Cost Category", "Cost Specification",
    "Item", "WBS", "Comments",
  ];
  const periodHeaders: string[] = [];
  for (const p of periods) {
    for (const t of types) {
      periodHeaders.push(`${p.header} — ${t.label}`);
    }
  }
  const totalHeaders = types.map(t => `Total — ${t.label}`);
  const headers = [...dimHeaders, ...periodHeaders, ...totalHeaders];

  const rows: (string | number)[][] = items.map(it => {
    const row: (string | number)[] = [
      it.financialView,
      it.costCategory,
      it.costSpecification,
      it.itemName,
      it.wbs ?? "",
      it.comments ?? "",
    ];
    for (const p of periods) {
      for (const t of types) {
        row.push(sumPeriod(it.monthlyByType[t.key], p.monthIndices));
      }
    }
    for (const t of types) {
      row.push(sumPeriod(it.monthlyByType[t.key], [0,1,2,3,4,5,6,7,8,9,10,11]));
    }
    return row;
  });

  // Grand total row across all items.
  if (items.length > 0) {
    const totalRow: (string | number)[] = ["TOTAL", "", "", "", "", ""];
    for (const p of periods) {
      for (const t of types) {
        let s = 0;
        for (const it of items) s += sumPeriod(it.monthlyByType[t.key], p.monthIndices);
        totalRow.push(s);
      }
    }
    for (const t of types) {
      let s = 0;
      for (const it of items) s += sumPeriod(it.monthlyByType[t.key], [0,1,2,3,4,5,6,7,8,9,10,11]);
      totalRow.push(s);
    }
    rows.push(totalRow);
  }

  const projSlug = (opts.projectName || `project-${opts.projectId}`)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || `project-${opts.projectId}`;
  const filename = `${projSlug}-financials-fy${opts.fiscalYear}-${opts.viewMode}`;

  const fyHint = `${months[0].label} ${months[0].year} – ${months[11].label} ${months[11].year}`;
  const subtitle = `FY ${opts.fiscalYear} (${fyHint}) · Fiscal year starts in ${months[0].longLabel}`;

  return { headers, rows, dimensionColCount: dimHeaders.length, filename, subtitle };
}

function csvEscape(v: string | number): string {
  // Numbers (including negative numbers) are emitted as-is so spreadsheets
  // treat them as numeric and downstream calculations keep working. Only
  // untrusted string fields get the formula-injection prefix.
  if (typeof v === "number") {
    return Number.isFinite(v) ? String(v) : "";
  }
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportFinancialGridToCsv(opts: FinancialGridExportOptions): void {
  const t = buildTable(opts);
  // Self-documenting metadata row so the file makes sense detached from the UI.
  const lines: string[] = [
    `# ${t.subtitle}`,
    t.headers.map(csvEscape).join(","),
    ...t.rows.map(r => r.map(csvEscape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t.filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportFinancialGridToExcel(opts: FinancialGridExportOptions): Promise<void> {
  const t = buildTable(opts);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Financials");

  ws.addRow([t.subtitle]);
  ws.mergeCells(1, 1, 1, t.headers.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.font = { italic: true, color: { argb: "FF6B7280" } };

  ws.addRow(t.headers);
  const headerRow = ws.getRow(2);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3F4F6" },
  };

  for (const r of t.rows) ws.addRow(r);

  // Format numeric cells (everything past the dimension columns).
  const startCol = t.dimensionColCount + 1;
  const endCol = t.headers.length;
  for (let rIdx = 3; rIdx <= t.rows.length + 2; rIdx++) {
    for (let cIdx = startCol; cIdx <= endCol; cIdx++) {
      const cell = ws.getCell(rIdx, cIdx);
      cell.numFmt = '"$"#,##0;[Red]-"$"#,##0';
    }
  }

  // Auto-size columns to a sensible band.
  ws.columns = t.headers.map((h, i) => ({
    width: i < t.dimensionColCount ? Math.max(14, Math.min(40, h.length + 4)) : 16,
  }));

  // Bold the trailing TOTAL row if present.
  if (t.rows.length > 0 && t.rows[t.rows.length - 1][0] === "TOTAL") {
    const lastRow = ws.getRow(t.rows.length + 2);
    lastRow.font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${t.filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
