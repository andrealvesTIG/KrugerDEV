import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface IssueExportRow {
  id: number;
  itemType?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  severity?: string | null;
  status?: string | null;
  type?: string | null;
  assignee?: string | null;
  dueDate?: string | null;
  costExposure?: string | null;
  impactCost?: string | number | null;
  riskScore?: number | null;
  probability?: string | null;
  impact?: string | null;
  mitigationPlan?: string | null;
  responseStrategy?: string | null;
  projectId: number;
}

const EXPORT_COLUMNS = [
  { header: 'Type (Issue/Risk)', key: 'itemType' },
  { header: 'Title', key: 'title' },
  { header: 'Description', key: 'description' },
  { header: 'Priority', key: 'priority' },
  { header: 'Status', key: 'status' },
  { header: 'Issue Type', key: 'type' },
  { header: 'Category', key: 'category' },
  { header: 'Severity', key: 'severity' },
  { header: 'Assignee', key: 'assignee' },
  { header: 'Due Date', key: 'dueDate' },
  { header: 'Cost Exposure', key: 'costExposure' },
  { header: 'Impact Cost', key: 'impactCost' },
  { header: 'Risk Score', key: 'riskScore' },
  { header: 'Probability', key: 'probability' },
  { header: 'Impact', key: 'impact' },
  { header: 'Mitigation Plan', key: 'mitigationPlan' },
  { header: 'Response Strategy', key: 'responseStrategy' },
  { header: 'Project', key: 'projectName' },
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
}

export function exportIssuesToFile(
  issues: IssueExportRow[],
  projectNameMap: Record<number, string>,
  fileFormat: 'csv' | 'xlsx',
  filterLabel: string = 'All'
) {
  const headers = EXPORT_COLUMNS.map(c => c.header);

  const rows = issues.map(issue => [
    issue.itemType === 'risk' ? 'Risk' : 'Issue',
    issue.title || '',
    issue.description || '',
    issue.priority || '',
    issue.status || '',
    issue.type || '',
    issue.category || '',
    issue.severity || '',
    issue.assignee || '',
    formatDate(issue.dueDate),
    issue.costExposure ? String(issue.costExposure) : '',
    issue.impactCost ? String(issue.impactCost) : '',
    issue.riskScore ? String(issue.riskScore) : '',
    issue.probability || '',
    issue.impact || '',
    issue.mitigationPlan || '',
    issue.responseStrategy || '',
    projectNameMap[issue.projectId] || `Project #${issue.projectId}`,
  ]);

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] || '').length));
    return { wch: Math.min(Math.max(maxLen, 10), 50) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Issues & Risks');

  const dateStamp = format(new Date(), 'yyyy-MM-dd');
  const filename = `issues-risks-${filterLabel.toLowerCase()}-${dateStamp}`;

  if (fileFormat === 'csv') {
    XLSX.writeFile(wb, `${filename}.csv`, { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, `${filename}.xlsx`, { bookType: 'xlsx' });
  }
}

const HEADER_MAP: Record<string, string> = {
  'type (issue/risk)': 'itemType',
  'type': 'itemType',
  'item type': 'itemType',
  'title': 'title',
  'name': 'title',
  'description': 'description',
  'priority': 'priority',
  'status': 'status',
  'issue type': 'type',
  'category': 'category',
  'severity': 'severity',
  'assignee': 'assignee',
  'assigned to': 'assignee',
  'due date': 'dueDate',
  'due': 'dueDate',
  'cost exposure': 'costExposure',
  'impact cost': 'impactCost',
  'risk score': 'riskScore',
  'score': 'riskScore',
  'probability': 'probability',
  'impact': 'impact',
  'mitigation plan': 'mitigationPlan',
  'mitigation': 'mitigationPlan',
  'response strategy': 'responseStrategy',
  'project': 'projectName',
  'project name': 'projectName',
};

export interface ImportedIssue {
  itemType: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  type?: string;
  category?: string;
  severity?: string;
  assignee?: string;
  dueDate?: string;
  costExposure?: string;
  impactCost?: string;
  riskScore?: number;
  probability?: string;
  impact?: string;
  mitigationPlan?: string;
  responseStrategy?: string;
  projectName?: string;
}

export interface ImportResult {
  items: ImportedIssue[];
  errors: string[];
  warnings: string[];
}

function normalizeItemType(val: string): string {
  const lower = val.toLowerCase().trim();
  if (lower === 'risk' || lower === 'risks') return 'risk';
  return 'issue';
}

function normalizeValue(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

export function parseImportFile(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });

        if (jsonData.length === 0) {
          resolve({ items: [], errors: ['File is empty or has no data rows'], warnings: [] });
          return;
        }

        const rawHeaders = Object.keys(jsonData[0]);
        const columnMapping: Record<string, string> = {};
        const unmappedHeaders: string[] = [];

        for (const header of rawHeaders) {
          const normalized = header.toLowerCase().trim();
          if (HEADER_MAP[normalized]) {
            columnMapping[header] = HEADER_MAP[normalized];
          } else {
            unmappedHeaders.push(header);
          }
        }

        const mappedFields = new Set(Object.values(columnMapping));
        if (!mappedFields.has('title')) {
          resolve({ items: [], errors: ['Could not find a "Title" column. Please ensure your file has a column named "Title" or "Name".'], warnings: [] });
          return;
        }

        const items: ImportedIssue[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];

        if (unmappedHeaders.length > 0) {
          warnings.push(`Skipped unrecognized columns: ${unmappedHeaders.join(', ')}`);
        }

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          const rowNum = i + 2;

          const mapped: Record<string, string> = {};
          for (const [rawHeader, fieldKey] of Object.entries(columnMapping)) {
            mapped[fieldKey] = normalizeValue(row[rawHeader]);
          }

          if (!mapped.title) {
            errors.push(`Row ${rowNum}: Missing title, skipped`);
            continue;
          }

          const item: ImportedIssue = {
            itemType: mapped.itemType ? normalizeItemType(mapped.itemType) : 'issue',
            title: mapped.title,
          };

          if (mapped.description) item.description = mapped.description;
          if (mapped.priority) item.priority = mapped.priority;
          if (mapped.status) item.status = mapped.status;
          if (mapped.type) item.type = mapped.type;
          if (mapped.category) item.category = mapped.category;
          if (mapped.severity) item.severity = mapped.severity;
          if (mapped.assignee) item.assignee = mapped.assignee;
          if (mapped.dueDate) item.dueDate = mapped.dueDate;
          if (mapped.costExposure) item.costExposure = mapped.costExposure;
          if (mapped.impactCost) item.impactCost = mapped.impactCost;
          if (mapped.riskScore) {
            const score = parseInt(mapped.riskScore);
            if (!isNaN(score)) item.riskScore = score;
          }
          if (mapped.probability) item.probability = mapped.probability;
          if (mapped.impact) item.impact = mapped.impact;
          if (mapped.mitigationPlan) item.mitigationPlan = mapped.mitigationPlan;
          if (mapped.responseStrategy) item.responseStrategy = mapped.responseStrategy;
          if (mapped.projectName) item.projectName = mapped.projectName;

          items.push(item);
        }

        resolve({ items, errors, warnings });
      } catch (err: any) {
        reject(new Error(`Failed to parse file: ${err.message}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function generateTemplate(fileFormat: 'csv' | 'xlsx') {
  const headers = EXPORT_COLUMNS.map(c => c.header);
  const sampleIssue = [
    'Issue', 'Sample Issue Title', 'Description of the issue', 'High', 'Open',
    'Bug', '', '', '', '2026-04-01', '', '5000', '', '', '', '', '', 'Project Name',
  ];
  const sampleRisk = [
    'Risk', 'Sample Risk Title', 'Description of the risk', 'Medium', 'Open',
    '', '', '', '', '2026-05-01', '10000', '', '42', 'High', 'Medium',
    'Mitigation steps here', 'Mitigate', 'Project Name',
  ];

  const wsData = [headers, sampleIssue, sampleRisk];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 15) }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  if (fileFormat === 'csv') {
    XLSX.writeFile(wb, 'issues-risks-template.csv', { bookType: 'csv' });
  } else {
    XLSX.writeFile(wb, 'issues-risks-template.xlsx', { bookType: 'xlsx' });
  }
}
