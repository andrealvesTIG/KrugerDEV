import ExcelJS from 'exceljs';
import { format } from 'date-fns';

interface TimesheetExportData {
  resource: string;
  project: string;
  task: string;
  date: string;
  hours: number;
  status: string;
  notes?: string;
}

interface ExportOptions {
  filename?: string;
  sheetName?: string;
  includeNotes?: boolean;
}

function downloadBuffer(buffer: ArrayBuffer | Buffer, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportTimesheetToExcel(
  data: TimesheetExportData[],
  options: ExportOptions = {}
): Promise<void> {
  const {
    filename = `timesheet-export-${format(new Date(), 'yyyy-MM-dd')}`,
    sheetName = 'Timesheet',
    includeNotes = true
  } = options;

  const headers = ['Resource', 'Project', 'Task', 'Date', 'Hours', 'Status'];
  if (includeNotes) headers.push('Notes');

  const rows = data.map(entry => {
    const row: (string | number)[] = [
      entry.resource,
      entry.project,
      entry.task,
      entry.date,
      entry.hours,
      entry.status
    ];
    if (includeNotes) row.push(entry.notes || '');
    return row;
  });

  const totalHours = data.reduce((sum, entry) => sum + entry.hours, 0);
  const totalRow: (string | number)[] = ['', '', '', 'TOTAL', totalHours, ''];
  if (includeNotes) totalRow.push('');
  rows.push(totalRow);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.addRow(headers);
  rows.forEach(row => worksheet.addRow(row));

  const colWidths = [20, 25, 30, 12, 8, 12];
  if (includeNotes) colWidths.push(40);
  worksheet.columns = colWidths.map(width => ({ width }));

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as Buffer, `${filename}.xlsx`);
}

export async function exportWeeklyTimesheetToExcel(
  entries: Array<{
    taskName: string;
    projectName: string;
    resourceName: string;
    dailyHours: Record<string, number>;
    status: string;
  }>,
  dates: Date[],
  options: ExportOptions = {}
): Promise<void> {
  const {
    filename = `weekly-timesheet-${format(new Date(), 'yyyy-MM-dd')}`,
    sheetName = 'Weekly Timesheet'
  } = options;

  const dateHeaders = dates.map(d => format(d, 'EEE MM/dd'));
  const headers = ['Resource', 'Project', 'Task', ...dateHeaders, 'Total', 'Status'];

  const rows = entries.map(entry => {
    const dailyValues = dates.map(d => {
      const dateKey = format(d, 'yyyy-MM-dd');
      return entry.dailyHours[dateKey] || 0;
    });
    const total = dailyValues.reduce((sum, h) => sum + h, 0);

    return [
      entry.resourceName,
      entry.projectName,
      entry.taskName,
      ...dailyValues,
      total,
      entry.status
    ];
  });

  const totalsRow: (string | number)[] = ['', '', 'DAILY TOTAL'];
  dates.forEach(d => {
    const dateKey = format(d, 'yyyy-MM-dd');
    const dailyTotal = entries.reduce((sum, entry) => sum + (entry.dailyHours[dateKey] || 0), 0);
    totalsRow.push(dailyTotal);
  });
  const grandTotal = entries.reduce((sum, entry) =>
    sum + Object.values(entry.dailyHours).reduce((s, h) => s + h, 0), 0
  );
  totalsRow.push(grandTotal);
  totalsRow.push('');

  rows.push(totalsRow);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.addRow(headers);
  rows.forEach(row => worksheet.addRow(row));

  const colWidths = [18, 22, 28, ...dates.map(() => 10), 8, 12];
  worksheet.columns = colWidths.map(width => ({ width }));

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as Buffer, `${filename}.xlsx`);
}
