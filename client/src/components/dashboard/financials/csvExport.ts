/**
 * Minimal CSV export helper for the Financials dashboards. Quotes any cell
 * that contains commas, quotes, or newlines and downloads the result as a
 * .csv file in the user's browser.
 */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v) : v;
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = rows.map(r => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
