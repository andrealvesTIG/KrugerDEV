import * as XLSX from 'xlsx';
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

export function exportTimesheetToExcel(
  data: TimesheetExportData[],
  options: ExportOptions = {}
): void {
  const {
    filename = `timesheet-export-${format(new Date(), 'yyyy-MM-dd')}`,
    sheetName = 'Timesheet',
    includeNotes = true
  } = options;

  const headers = ['Resource', 'Project', 'Task', 'Date', 'Hours', 'Status'];
  if (includeNotes) headers.push('Notes');

  const rows = data.map(entry => {
    const row = [
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

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const colWidths = [
    { wch: 20 },
    { wch: 25 },
    { wch: 30 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
  ];
  if (includeNotes) colWidths.push({ wch: 40 });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportWeeklyTimesheetToExcel(
  entries: Array<{
    taskName: string;
    projectName: string;
    resourceName: string;
    dailyHours: Record<string, number>;
    status: string;
  }>,
  dates: Date[],
  options: ExportOptions = {}
): void {
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

  const totalsRow = ['', '', 'DAILY TOTAL'];
  dates.forEach((d, i) => {
    const dateKey = format(d, 'yyyy-MM-dd');
    const dailyTotal = entries.reduce((sum, entry) => sum + (entry.dailyHours[dateKey] || 0), 0);
    totalsRow.push(dailyTotal as unknown as string);
  });
  const grandTotal = entries.reduce((sum, entry) => 
    sum + Object.values(entry.dailyHours).reduce((s, h) => s + h, 0), 0
  );
  totalsRow.push(grandTotal as unknown as string);
  totalsRow.push('');
  
  rows.push(totalsRow as (string | number)[]);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  const colWidths = [
    { wch: 18 },
    { wch: 22 },
    { wch: 28 },
    ...dates.map(() => ({ wch: 10 })),
    { wch: 8 },
    { wch: 12 },
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
