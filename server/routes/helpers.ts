import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import type { User } from "@shared/models/auth";
import { z } from "zod";
import { eq } from "drizzle-orm";
import multer from "multer";
import xml2js from "xml2js";
import Papa from "papaparse";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const ENCRYPTION_KEY = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production for encryption');
  }
  console.warn('[SECURITY WARNING] SESSION_SECRET not set — using insecure fallback key. Set SESSION_SECRET before deploying.');
  return 'fridayreport-default-encryption-key-32ch';
})();

function encryptApiKey(plaintext: string): string {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}
function decryptApiKey(ciphertext: string, cryptoMod?: typeof crypto): string {
  const c = cryptoMod || crypto;
  const key = c.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const [ivHex, encrypted] = ciphertext.split(':');
  if (!ivHex || !encrypted) return ciphertext;
  const decipher = c.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Configure multer for file uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for MPP files
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xml', '.csv', '.mpp'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only MPP, XML, and CSV files are allowed'));
    }
  }
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
    }
  }
});

// Classify database/validation errors to return proper HTTP status codes
function formatZodErrors(err: z.ZodError): string {
  return err.errors.map(e => {
    const field = e.path.length > 0 ? e.path.join('.') : null;
    return field ? `${field}: ${e.message}` : e.message;
  }).join('; ');
}

function classifyError(err: unknown): { status: number; message: string } {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errCode = (err as any)?.code;

  // PostgreSQL constraint violations → 400 Bad Request
  if (errCode === '23505') {
    // Unique constraint violation
    const detail = (err as any)?.detail || '';
    const match = detail.match(/Key \((\w+)\)=\((.+?)\) already exists/);
    if (match) {
      return { status: 400, message: `A record with this ${match[1].replace(/_/g, ' ')} already exists` };
    }
    return { status: 400, message: 'A record with these values already exists' };
  }
  if (errCode === '23503') {
    // Foreign key violation
    const detail = (err as any)?.detail || '';
    const match = detail.match(/Key \((\w+)\)=\((.+?)\) is not present in table "(\w+)"/);
    if (match) {
      return { status: 400, message: `Invalid ${match[1].replace(/_/g, ' ')}: referenced ${match[3].replace(/_/g, ' ')} does not exist` };
    }
    return { status: 400, message: 'Referenced record does not exist' };
  }
  if (errCode === '23502') {
    // Not-null violation
    const col = (err as any)?.column || '';
    return { status: 400, message: `Missing required field: ${col.replace(/_/g, ' ')}` };
  }
  if (errCode === '23514') {
    // Check constraint violation
    const constraint = (err as any)?.constraint || '';
    return { status: 400, message: `Value does not meet validation rules${constraint ? ` (${constraint})` : ''}` };
  }
  if (errCode === '22P02') {
    // Invalid text representation (e.g., invalid integer)
    return { status: 400, message: 'Invalid data format: one or more fields have incorrect types' };
  }
  if (errCode === '22003') {
    // Numeric value out of range
    return { status: 400, message: 'Numeric value is out of range' };
  }
  if (errCode === '22001') {
    // String too long
    return { status: 400, message: 'One or more text fields exceed the maximum length' };
  }

  // Zod validation errors
  if (err instanceof z.ZodError) {
    return { status: 400, message: formatZodErrors(err) };
  }

  // Default: genuine server error
  return { status: 500, message: errMsg };
}

// Parse MPP file using MPXJ Java library
interface ParsedMppTask {
  taskId?: number;
  wbs?: string;
  taskName: string;
  startDate?: string;
  finishDate?: string;
  duration?: string;
  durationDays?: number;
  percentComplete?: number;
  outlineLevel?: number;
  parentTaskId?: number;
  isSummary?: boolean;
  isMilestone?: boolean;
  notes?: string;
  workHours?: number;
  actualWorkHours?: number;
  remainingWorkHours?: number;
  predecessors?: Array<{ predecessorTaskId: number; type: string; lagDays: number }>;
}

function parseMppFile(fileBuffer: Buffer): ParsedMppTask[] {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `mpp_${Date.now()}.mpp`);
  
  try {
    // Write buffer to temp file
    fs.writeFileSync(tempFile, fileBuffer);
    
    // Build classpath for MPXJ
    const libDir = path.join(process.cwd(), 'lib');
    const jars = [
      'mpxj.jar', 'poi.jar', 'poi-ooxml.jar', 'commons-io.jar',
      'commons-collections4.jar', 'commons-compress.jar', 'log4j-api.jar', 'xmlbeans.jar',
      'rtfparserkit.jar'
    ].map(jar => path.join(libDir, jar)).join(':');
    
    const classpath = `${jars}:${libDir}`;
    
    // Execute Java parser
    const result = execSync(`java -cp "${classpath}" MppParser "${tempFile}"`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000,
    });
    
    const parsed = JSON.parse(result);
    return parsed.tasks || [];
    
  } catch (error: any) {
    console.error('Error parsing MPP file:', error.message);
    if (error.stderr) {
      console.error('STDERR:', error.stderr);
    }
    if (error.stdout) {
      console.error('STDOUT:', error.stdout);
    }
    console.error('Full error:', error);
    throw new Error(`Failed to parse MPP file: ${error.message || 'Unknown error'}. Please ensure it is a valid Microsoft Project file.`);
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Parse MSPDI XML (MS Project XML format)
async function parseXmlMspdi(xmlContent: string): Promise<ParsedMppTask[]> {
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlContent);
  
  const tasks: ParsedMppTask[] = [];
  
  // Handle MSPDI format (Microsoft Project XML)
  if (result.Project?.Tasks?.Task) {
    const xmlTasks = Array.isArray(result.Project.Tasks.Task) 
      ? result.Project.Tasks.Task 
      : [result.Project.Tasks.Task];
    
    for (const task of xmlTasks) {
      // Skip project summary (UID 0) which is typically the project itself
      if (task.UID === '0' || task.UID === 0) continue;
      
      const taskName = task.Name || task.Title || 'Unnamed Task';
      if (!taskName) continue;
      
      let durationDays: number | undefined;
      let durationStr = task.Duration || '';
      if (durationStr.startsWith('PT')) {
        const hoursMatch = durationStr.match(/(\d+)H/);
        const minsMatch = durationStr.match(/(\d+)M/);
        const totalHours = (hoursMatch ? parseInt(hoursMatch[1]) : 0) +
                           (minsMatch ? parseInt(minsMatch[1]) / 60 : 0);
        if (totalHours > 0) {
          durationDays = totalHours / 8;
        }
      }

      // Parse Work field (e.g., "PT40H0M0S" for 40 hours of effort)
      let workHours: number | undefined;
      const workStr = task.Work || '';
      if (workStr.startsWith('PT')) {
        const workHoursMatch = workStr.match(/(\d+)H/);
        const workMinsMatch = workStr.match(/(\d+)M/);
        if (workHoursMatch || workMinsMatch) {
          workHours = (workHoursMatch ? parseInt(workHoursMatch[1]) : 0) +
                      (workMinsMatch ? parseInt(workMinsMatch[1]) / 60 : 0);
        }
      }

      // Parse ActualWork field (e.g., "PT16H0M0S" for 16 actual hours)
      let actualWorkHours: number | undefined;
      const actualWorkStr = task.ActualWork || '';
      if (actualWorkStr.startsWith('PT')) {
        const actHoursMatch = actualWorkStr.match(/(\d+)H/);
        const actMinsMatch = actualWorkStr.match(/(\d+)M/);
        if (actHoursMatch || actMinsMatch) {
          actualWorkHours = (actHoursMatch ? parseInt(actHoursMatch[1]) : 0) +
                            (actMinsMatch ? parseInt(actMinsMatch[1]) / 60 : 0);
        }
      }

      // Parse RemainingWork field (e.g., "PT24H0M0S" for 24 remaining hours)
      let remainingWorkHours: number | undefined;
      const remainingWorkStr = task.RemainingWork || '';
      if (remainingWorkStr.startsWith('PT')) {
        const remHoursMatch = remainingWorkStr.match(/(\d+)H/);
        const remMinsMatch = remainingWorkStr.match(/(\d+)M/);
        if (remHoursMatch || remMinsMatch) {
          remainingWorkHours = (remHoursMatch ? parseInt(remHoursMatch[1]) : 0) +
                               (remMinsMatch ? parseInt(remMinsMatch[1]) / 60 : 0);
        }
      }

      // Parse PredecessorLink elements
      const predecessors: Array<{ predecessorTaskId: number; type: string; lagDays: number }> = [];
      if (task.PredecessorLink) {
        const predLinks = Array.isArray(task.PredecessorLink) ? task.PredecessorLink : [task.PredecessorLink];
        for (const link of predLinks) {
          const predUid = link.PredecessorUID ? parseInt(link.PredecessorUID) : undefined;
          if (predUid === undefined || predUid === 0) continue;
          // Type: 0=FF, 1=FS, 2=SF, 3=SS (MS Project convention)
          const linkType = link.Type ? parseInt(link.Type) : 1;
          const typeMap: Record<number, string> = { 0: 'FF', 1: 'FS', 2: 'SF', 3: 'SS' };
          const type = typeMap[linkType] || 'FS';
          // Lag in tenths of minutes in MSPDI
          let lagDays = 0;
          if (link.LinkLag) {
            const lagTenthsMins = parseInt(link.LinkLag);
            lagDays = Math.round(lagTenthsMins / (10 * 60 * 8)); // Convert to days (8h workday)
          }
          predecessors.push({ predecessorTaskId: predUid, type, lagDays });
        }
      }
      
      tasks.push({
        taskId: task.UID ? parseInt(task.UID) : undefined,
        wbs: task.WBS || task.OutlineNumber,
        taskName,
        startDate: task.Start ? task.Start.split('T')[0] : undefined,
        finishDate: task.Finish ? task.Finish.split('T')[0] : undefined,
        duration: task.Duration,
        durationDays,
        percentComplete: task.PercentComplete ? parseInt(task.PercentComplete) : 0,
        outlineLevel: task.OutlineLevel ? parseInt(task.OutlineLevel) : 1,
        isSummary: task.Summary === '1' || task.Summary === 'true' || task.Summary === true,
        isMilestone: task.Milestone === '1' || task.Milestone === 'true' || task.Milestone === true,
        notes: task.Notes,
        workHours,
        actualWorkHours,
        remainingWorkHours,
        predecessors,
      });
    }
  }
  
  return tasks;
}

// Structured CSV-import error: surfaced as 400 by upload routes.
export interface CsvImportRowError {
  row: number;          // 1-based, excluding header
  column?: string;      // original header text
  value?: string;       // offending raw value
  message: string;      // human-readable reason
}

export class CsvImportError extends Error {
  status = 400;
  errors: CsvImportRowError[];
  constructor(errors: CsvImportRowError[], message?: string) {
    super(message || `CSV import failed with ${errors.length} error(s)`);
    this.name = 'CsvImportError';
    this.errors = errors;
  }
}

// Canonical task-field aliases. Each entry: standard field key -> recognised header tokens (lowercased).
// Anything NOT in this map is preserved on `customFields` (e.g. Asana "Section", "Tags", custom columns).
const FIELD_ALIASES: Record<string, string[]> = {
  taskName:      ['task name', 'name', 'task', 'title', 'summary', 'subject'],
  wbs:           ['wbs', 'outline number', 'work breakdown structure'],
  startDate:     ['start date', 'start', 'begin', 'begin date', 'planned start'],
  finishDate:    ['finish date', 'finish', 'end date', 'end', 'due date', 'due', 'completion date', 'planned finish'],
  duration:      ['duration', 'estimated duration'],
  percentComplete: ['percent complete', '% complete', 'progress', 'completion', '% done', 'percent done'],
  outlineLevel:  ['outline level', 'outlinelevel', 'level', 'indent level', 'hierarchy level'],
  type:          ['type', 'task type', 'item type'],
  priority:      ['priority'],
  assigned:      ['assigned to', 'assignee', 'assigned', 'resource names', 'resources', 'owner'],
  notes:         ['notes', 'description', 'comments'],
  workHours:     ['work', 'work hours', 'effort', 'estimated hours', 'estimated work'],
  actualWork:    ['actual work', 'actual hours'],
  remainingWork: ['remaining work', 'remaining hours'],
  predecessors:  ['predecessors', 'depends on', 'dependencies'],
  milestoneFlag: ['milestone'],
  summaryFlag:   ['summary task', 'is summary'],
};

// Build reverse lookup: lowercased header -> standard field key.
function buildHeaderMap(headers: string[]): { mapped: Map<string, string>; customHeaders: string[] } {
  const mapped = new Map<string, string>();
  const customHeaders: string[] = [];
  for (const original of headers) {
    if (!original) continue;
    const norm = original.trim().toLowerCase();
    let matchedKey: string | undefined;
    for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(norm)) { matchedKey = key; break; }
    }
    if (!matchedKey) {
      // Looser fallback: substring match for the most common ones.
      for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.some(a => norm === a || norm.includes(a))) { matchedKey = key; break; }
      }
    }
    if (matchedKey && !Array.from(mapped.values()).includes(matchedKey)) {
      mapped.set(original, matchedKey);
    } else if (!matchedKey) {
      customHeaders.push(original);
    }
  }
  return { mapped, customHeaders };
}

function parsePercent(raw: string): { value?: number; error?: string } {
  const cleaned = raw.replace('%', '').trim();
  if (cleaned === '') return { value: undefined };
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return { error: `not a valid percent value` };
  if (num < 0 || num > 100) return { error: `percent must be between 0 and 100` };
  return { value: Math.round(num) };
}

function parseDuration(raw: string): { days?: number; error?: string } {
  const str = (raw || '').trim();
  if (!str) return { days: undefined };
  const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const daysMatch  = str.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)\b/i);
  const weeksMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:weeks?|wks?|w)\b/i);
  let days = 0;
  let matched = false;
  if (weeksMatch) { days += parseFloat(weeksMatch[1]) * 5; matched = true; }
  if (daysMatch)  { days += parseFloat(daysMatch[1]); matched = true; }
  if (hoursMatch) { days += parseFloat(hoursMatch[1]) / 8; matched = true; }
  if (matched) return { days };
  const num = Number(str);
  if (Number.isFinite(num)) return { days: num };
  return { error: `unrecognised duration format` };
}

// Parse CSV format using papaparse for robust RFC-compliant parsing.
// Maps every detected header to either a standard task field or a customFields entry.
// Validates row data; throws CsvImportError if any validation issues are found.
function parseCsv(csvContent: string): Array<{
  taskId?: number;
  wbs?: string;
  taskName: string;
  startDate?: string;
  finishDate?: string;
  duration?: string;
  durationDays?: number;
  percentComplete?: number;
  outlineLevel?: number;
  parentTaskId?: number;
  isSummary?: boolean;
  isMilestone?: boolean;
  notes?: string;
  workHours?: number;
  actualWorkHours?: number;
  remainingWorkHours?: number;
  customFields?: Record<string, string>;
}> {
  const parseResult = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  const errors: CsvImportRowError[] = [];

  if (parseResult.errors.length > 0) {
    for (const e of parseResult.errors) {
      errors.push({
        row: typeof e.row === 'number' ? e.row + 1 : 0,
        message: `CSV parse error: ${e.message}`,
      });
    }
  }

  const headers = (parseResult.meta.fields || []).filter(Boolean);
  if (headers.length === 0) {
    throw new CsvImportError([{ row: 0, message: 'CSV has no header row' }], 'CSV has no header row');
  }

  const { mapped, customHeaders } = buildHeaderMap(headers);

  // Reverse lookup: standardKey -> original header (so we can read row[header])
  const colFor: Record<string, string | undefined> = {};
  for (const [hdr, key] of mapped.entries()) colFor[key] = hdr;

  if (!colFor.taskName) {
    throw new CsvImportError(
      [{ row: 0, message: 'No task name column detected. Expected one of: Name, Task Name, Title, Summary.' }],
      'No task name column detected'
    );
  }

  const tasks: any[] = [];
  const parentStack: { taskId: number; level: number }[] = [];

  parseResult.data.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const rawName = row[colFor.taskName!] ?? '';
    const taskName = String(rawName).trim();
    if (!taskName) return; // skip blank lines silently

    const typeValue = colFor.type ? String(row[colFor.type] || '').trim().toLowerCase() : '';
    if (typeValue === 'project') return;

    // Duration
    let durationDays: number | undefined;
    const durationStr = colFor.duration ? String(row[colFor.duration] || '') : '';
    if (durationStr.trim()) {
      const dRes = parseDuration(durationStr);
      if (dRes.error) errors.push({ row: rowNum, column: colFor.duration, value: durationStr, message: dRes.error });
      else durationDays = dRes.days;
    }

    // Percent complete
    let percentComplete = 0;
    if (colFor.percentComplete) {
      const raw = String(row[colFor.percentComplete] || '');
      if (raw.trim()) {
        const pRes = parsePercent(raw);
        if (pRes.error) errors.push({ row: rowNum, column: colFor.percentComplete, value: raw, message: pRes.error });
        else if (pRes.value !== undefined) percentComplete = pRes.value;
      }
    }

    // Outline level
    let outlineLevel = 1;
    if (colFor.outlineLevel) {
      const raw = String(row[colFor.outlineLevel] || '').trim();
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed) || parsed < 1) {
          errors.push({ row: rowNum, column: colFor.outlineLevel, value: raw, message: 'outline level must be a positive integer' });
        } else {
          outlineLevel = parsed;
        }
      }
    } else if (String(rawName) !== taskName) {
      const leadingSpaces = String(rawName).length - String(rawName).trimStart().length;
      if (leadingSpaces > 0) outlineLevel = Math.floor(leadingSpaces / 4) + 1;
    }

    // Dates
    let startDate: string | undefined;
    if (colFor.startDate) {
      const raw = String(row[colFor.startDate] || '').trim();
      if (raw) {
        startDate = parseDate(raw);
        if (!startDate) errors.push({ row: rowNum, column: colFor.startDate, value: raw, message: 'unrecognised date format (use YYYY-MM-DD or MM/DD/YYYY)' });
      }
    }
    let finishDate: string | undefined;
    if (colFor.finishDate) {
      const raw = String(row[colFor.finishDate] || '').trim();
      if (raw) {
        finishDate = parseDate(raw);
        if (!finishDate) errors.push({ row: rowNum, column: colFor.finishDate, value: raw, message: 'unrecognised date format (use YYYY-MM-DD or MM/DD/YYYY)' });
      }
    }
    if (startDate && finishDate && finishDate < startDate) {
      errors.push({ row: rowNum, column: colFor.finishDate, value: finishDate, message: 'finish date is before start date' });
    }

    // Work hours
    const parseHours = (key: 'workHours' | 'actualWork' | 'remainingWork'): number | undefined => {
      const col = colFor[key];
      if (!col) return undefined;
      const raw = String(row[col] || '').trim();
      if (!raw) return undefined;
      const dRes = parseDuration(raw);
      if (dRes.error || dRes.days === undefined) {
        errors.push({ row: rowNum, column: col, value: raw, message: 'unrecognised work/effort value' });
        return undefined;
      }
      return dRes.days * 8; // duration parser returns days; convert back to hours
    };
    const workHours = parseHours('workHours');
    const actualWorkHours = parseHours('actualWork');
    const remainingWorkHours = parseHours('remainingWork');

    const isSummary   = typeValue === 'summary'   || (colFor.summaryFlag   ? /^(true|yes|1)$/i.test(String(row[colFor.summaryFlag]   || '').trim()) : false);
    const isMilestone = typeValue === 'milestone' || (colFor.milestoneFlag ? /^(true|yes|1)$/i.test(String(row[colFor.milestoneFlag] || '').trim()) : false);

    const taskId = tasks.length + 1;
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= outlineLevel) {
      parentStack.pop();
    }
    const parentTaskId = parentStack.length > 0 ? parentStack[parentStack.length - 1].taskId : undefined;
    parentStack.push({ taskId, level: outlineLevel });

    // Capture all unmapped headers as custom fields (preserves "Section", "Tags", etc.)
    const customFields: Record<string, string> = {};
    for (const hdr of customHeaders) {
      const val = row[hdr];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        customFields[hdr] = String(val).trim();
      }
    }

    tasks.push({
      taskId,
      wbs: colFor.wbs ? String(row[colFor.wbs] || '').trim() || undefined : undefined,
      taskName,
      startDate,
      finishDate,
      duration: durationStr || undefined,
      durationDays,
      percentComplete,
      outlineLevel,
      parentTaskId,
      isSummary,
      isMilestone,
      notes: colFor.notes ? String(row[colFor.notes] || '').trim() || undefined : undefined,
      workHours,
      actualWorkHours,
      remainingWorkHours,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    });
  });

  if (errors.length > 0) {
    throw new CsvImportError(errors);
  }

  return tasks;
}

// Helper to parse various date formats
function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split('T')[0];
  }
  
  // Try MM/DD/YYYY or DD/MM/YYYY
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(p => parseInt(p));
    // Assume MM/DD/YYYY if first number is <= 12
    if (a <= 12 && c > 1900) {
      return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
    }
    // Try DD/MM/YYYY
    if (b <= 12 && c > 1900) {
      return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    }
  }
  
  return undefined;
}

// Seed data function with software development focused demo data
async function seedDatabase() {
  const portfolios = await storage.getPortfolios();
  if (portfolios.length === 0) {
    
    const orgs = await storage.getOrganizations();
    const seedOrgId = orgs.length > 0 ? orgs[0].id : null;
    if (!seedOrgId) {
      console.log("No organizations found - skipping seed data.");
      return;
    }
    
    // ==================== PORTFOLIOS ====================
    const mobilePortfolio = await storage.createPortfolio({
      organizationId: seedOrgId,
      name: "Mobile Applications",
      description: "Native and cross-platform mobile app development initiatives.",
      strategy: "React Native first with native modules for performance-critical features.",
      managerId: null
    });

    const webPlatformPortfolio = await storage.createPortfolio({
      organizationId: seedOrgId,
      name: "Web Platform",
      description: "Enterprise web applications and customer-facing portals.",
      strategy: "Modern React/TypeScript stack with microservices backend.",
      managerId: null
    });

    const infraPortfolio = await storage.createPortfolio({
      organizationId: seedOrgId,
      name: "Infrastructure & DevOps",
      description: "Cloud infrastructure, CI/CD pipelines, and developer tooling.",
      strategy: "AWS-first with Kubernetes orchestration and GitOps practices.",
      managerId: null
    });

    // ==================== PROJECTS ====================
    
    // Mobile Portfolio Projects
    const ecommerceApp = await storage.createProject({
      portfolioId: mobilePortfolio.id,
      organizationId: seedOrgId,
      name: "E-Commerce Mobile App",
      description: "Full-featured shopping app with payment integration, push notifications, and AR product preview.",
      status: "Execution",
      priority: "High",
      startDate: "2025-01-01",
      endDate: "2025-06-30",
      budget: "450000",
      managerId: null,
      health: "Green",
      completionPercentage: 45
    });
    await storage.createProjectChangeLog({ projectId: ecommerceApp.id, changedBy: null, changedByName: 'System', changeType: 'created', changeSummary: `Project "${ecommerceApp.name}" created by System — seeded demo data`, previousValues: null, newValues: null });

    const bankingApp = await storage.createProject({
      portfolioId: mobilePortfolio.id,
      organizationId: seedOrgId,
      name: "Mobile Banking App v2.0",
      description: "Redesign of the banking app with biometric auth, real-time notifications, and investment tracking.",
      status: "Planning",
      priority: "Critical",
      startDate: "2025-02-15",
      endDate: "2025-09-15",
      budget: "800000",
      managerId: null,
      health: "Yellow",
      completionPercentage: 15
    });
    await storage.createProjectChangeLog({ projectId: bankingApp.id, changedBy: null, changedByName: 'System', changeType: 'created', changeSummary: `Project "${bankingApp.name}" created by System — seeded demo data`, previousValues: null, newValues: null });

    // Web Platform Projects
    const saasApp = await storage.createProject({
      portfolioId: webPlatformPortfolio.id,
      organizationId: seedOrgId,
      name: "SaaS Analytics Dashboard",
      description: "Real-time analytics platform with customizable dashboards, reports, and data visualizations.",
      status: "Execution",
      priority: "High",
      startDate: "2024-11-01",
      endDate: "2025-05-31",
      budget: "350000",
      managerId: null,
      health: "Green",
      completionPercentage: 60
    });
    await storage.createProjectChangeLog({ projectId: saasApp.id, changedBy: null, changedByName: 'System', changeType: 'created', changeSummary: `Project "${saasApp.name}" created by System — seeded demo data`, previousValues: null, newValues: null });

    const crmApp = await storage.createProject({
      portfolioId: webPlatformPortfolio.id,
      organizationId: seedOrgId,
      name: "CRM Platform Modernization",
      description: "Migrating legacy CRM to modern React frontend with GraphQL API.",
      status: "Execution",
      priority: "Medium",
      startDate: "2024-10-15",
      endDate: "2025-04-30",
      budget: "280000",
      managerId: null,
      health: "Red",
      completionPercentage: 35
    });
    await storage.createProjectChangeLog({ projectId: crmApp.id, changedBy: null, changedByName: 'System', changeType: 'created', changeSummary: `Project "${crmApp.name}" created by System — seeded demo data`, previousValues: null, newValues: null });

    const apiGateway = await storage.createProject({
      portfolioId: webPlatformPortfolio.id,
      organizationId: seedOrgId,
      name: "API Gateway Implementation",
      description: "Centralized API gateway with rate limiting, authentication, and request routing.",
      status: "Initiation",
      priority: "High",
      startDate: "2025-03-01",
      endDate: "2025-07-31",
      budget: "180000",
      managerId: null,
      health: "Green",
      completionPercentage: 5
    });
    await storage.createProjectChangeLog({ projectId: apiGateway.id, changedBy: null, changedByName: 'System', changeType: 'created', changeSummary: `Project "${apiGateway.name}" created by System — seeded demo data`, previousValues: null, newValues: null });

    // Infrastructure Projects
    const k8sMigration = await storage.createProject({
      portfolioId: infraPortfolio.id,
      organizationId: seedOrgId,
      name: "Kubernetes Migration",
      description: "Migrating microservices from EC2 to EKS with Helm charts and ArgoCD.",
      status: "Execution",
      priority: "Critical",
      startDate: "2024-12-01",
      endDate: "2025-06-30",
      budget: "400000",
      managerId: null,
      health: "Yellow",
      completionPercentage: 40
    });
    await storage.createProjectChangeLog({ projectId: k8sMigration.id, changedBy: null, changedByName: 'System', changeType: 'created', changeSummary: `Project "${k8sMigration.name}" created by System — seeded demo data`, previousValues: null, newValues: null });

    const cicdPipeline = await storage.createProject({
      portfolioId: infraPortfolio.id,
      organizationId: seedOrgId,
      name: "CI/CD Pipeline Overhaul",
      description: "Implementing GitHub Actions workflows with automated testing, security scanning, and deployments.",
      status: "Closing",
      priority: "Medium",
      startDate: "2024-09-01",
      endDate: "2025-01-31",
      budget: "120000",
      managerId: null,
      health: "Green",
      completionPercentage: 90
    });
    await storage.createProjectChangeLog({ projectId: cicdPipeline.id, changedBy: null, changedByName: 'System', changeType: 'created', changeSummary: `Project "${cicdPipeline.name}" created by System — seeded demo data`, previousValues: null, newValues: null });

    // ==================== TASKS ====================
    
    // E-Commerce App Tasks
    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Implement product search with filters",
      description: "Add search functionality with category, price range, and brand filters using Algolia.",
      startDate: "2025-01-15",
      endDate: "2025-02-01",
      progress: 100,
      status: "Completed",
      assignee: "Alex Chen"
    });

    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Integrate Stripe payment gateway",
      description: "Setup Stripe SDK for iOS/Android with Apple Pay and Google Pay support.",
      startDate: "2025-02-01",
      endDate: "2025-02-28",
      progress: 75,
      status: "In Progress",
      assignee: "Maria Garcia"
    });

    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Build shopping cart with persistence",
      description: "Implement cart state management with Redux and AsyncStorage for offline support.",
      startDate: "2025-02-15",
      endDate: "2025-03-15",
      progress: 40,
      status: "In Progress",
      assignee: "James Wilson"
    });

    await storage.createTask({
      projectId: ecommerceApp.id,
      name: "Push notification system",
      description: "Integrate Firebase Cloud Messaging for order updates and promotional notifications.",
      startDate: "2025-03-01",
      endDate: "2025-03-31",
      progress: 0,
      status: "Not Started",
      assignee: "Sarah Kim"
    });

    // SaaS Dashboard Tasks
    await storage.createTask({
      projectId: saasApp.id,
      name: "Build chart component library",
      description: "Create reusable D3.js chart components for line, bar, pie, and scatter plots.",
      startDate: "2024-11-15",
      endDate: "2024-12-31",
      progress: 100,
      status: "Completed",
      assignee: "David Park"
    });

    await storage.createTask({
      projectId: saasApp.id,
      name: "Implement real-time data streaming",
      description: "Set up WebSocket connections for live dashboard updates using Socket.io.",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      progress: 85,
      status: "In Progress",
      assignee: "Emma Thompson"
    });

    await storage.createTask({
      projectId: saasApp.id,
      name: "Create PDF export functionality",
      description: "Allow users to export dashboards and reports to PDF with custom branding.",
      startDate: "2025-02-01",
      endDate: "2025-02-28",
      progress: 20,
      status: "In Progress",
      assignee: "Michael Brown"
    });

    // Kubernetes Migration Tasks
    await storage.createTask({
      projectId: k8sMigration.id,
      name: "Create Helm charts for services",
      description: "Write Helm templates for all 12 microservices with configurable values.",
      startDate: "2024-12-15",
      endDate: "2025-01-31",
      progress: 100,
      status: "Completed",
      assignee: "Chris Lee"
    });

    await storage.createTask({
      projectId: k8sMigration.id,
      name: "Setup ArgoCD for GitOps",
      description: "Configure ArgoCD to sync deployments from GitHub repositories automatically.",
      startDate: "2025-01-15",
      endDate: "2025-02-15",
      progress: 60,
      status: "In Progress",
      assignee: "Jennifer Wu"
    });

    await storage.createTask({
      projectId: k8sMigration.id,
      name: "Configure horizontal pod autoscaling",
      description: "Set up HPA for all services based on CPU and memory metrics.",
      startDate: "2025-02-01",
      endDate: "2025-03-15",
      progress: 10,
      status: "In Progress",
      assignee: "Robert Taylor"
    });

    // ==================== MILESTONES ====================
    
    // E-Commerce App Milestones
    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "MVP Release - Core Shopping Features",
      description: "Product browsing, cart, and basic checkout functionality",
      dueDate: "2025-02-28",
      startDate: "2025-01-01",
      completed: true,
      status: "Done",
      priority: "Critical",
      assignee: "Alex Chen"
    });

    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "Payment Integration Complete",
      description: "Stripe, Apple Pay, and Google Pay fully tested and deployed",
      dueDate: "2025-03-31",
      startDate: "2025-02-01",
      completed: false,
      status: "In Progress",
      priority: "High",
      assignee: "Maria Garcia"
    });

    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "Beta Launch - App Store Submission",
      description: "Submit to iOS App Store and Google Play for beta testing",
      dueDate: "2025-05-15",
      startDate: "2025-04-01",
      completed: false,
      status: "To Do",
      priority: "High",
      assignee: "Product Team"
    });

    await storage.createMilestone({
      projectId: ecommerceApp.id,
      title: "Production Launch",
      description: "Full public release with marketing campaign",
      dueDate: "2025-06-30",
      startDate: "2025-05-15",
      completed: false,
      status: "Backlog",
      priority: "Critical",
      assignee: null
    });

    // SaaS Dashboard Milestones
    await storage.createMilestone({
      projectId: saasApp.id,
      title: "Dashboard Builder v1.0",
      description: "Drag-and-drop dashboard creation with widget library",
      dueDate: "2025-01-31",
      startDate: "2024-11-01",
      completed: true,
      status: "Done",
      priority: "Critical",
      assignee: "David Park"
    });

    await storage.createMilestone({
      projectId: saasApp.id,
      title: "Real-time Analytics Engine",
      description: "Live data streaming with sub-second latency",
      dueDate: "2025-02-28",
      startDate: "2025-01-15",
      completed: false,
      status: "In Progress",
      priority: "High",
      assignee: "Emma Thompson"
    });

    await storage.createMilestone({
      projectId: saasApp.id,
      title: "Enterprise SSO Integration",
      description: "SAML and OAuth2 support for enterprise customers",
      dueDate: "2025-04-30",
      startDate: "2025-03-01",
      completed: false,
      status: "Backlog",
      priority: "Medium",
      assignee: null
    });

    // Kubernetes Migration Milestones
    await storage.createMilestone({
      projectId: k8sMigration.id,
      title: "Dev Environment on EKS",
      description: "All services running in development Kubernetes cluster",
      dueDate: "2025-01-31",
      startDate: "2024-12-01",
      completed: true,
      status: "Done",
      priority: "High",
      assignee: "Chris Lee"
    });

    await storage.createMilestone({
      projectId: k8sMigration.id,
      title: "Staging Environment Migration",
      description: "Full staging environment with production-like configuration",
      dueDate: "2025-03-31",
      startDate: "2025-02-01",
      completed: false,
      status: "In Progress",
      priority: "High",
      assignee: "Jennifer Wu"
    });

    await storage.createMilestone({
      projectId: k8sMigration.id,
      title: "Production Cutover",
      description: "Zero-downtime migration of production workloads to EKS",
      dueDate: "2025-06-30",
      startDate: "2025-04-01",
      completed: false,
      status: "Backlog",
      priority: "Critical",
      assignee: null
    });

    // ==================== RISKS ====================
    
    await storage.createRisk({
      projectId: ecommerceApp.id,
      title: "App Store Rejection",
      description: "Apple may reject the app due to payment guideline violations or privacy concerns.",
      probability: "Medium",
      impact: "High",
      status: "Open",
      mitigationPlan: "Early review of App Store guidelines, implement in-app purchase where required, thorough privacy policy review.",
      costExposure: "75000",
    });

    await storage.createRisk({
      projectId: ecommerceApp.id,
      title: "Payment Processing Downtime",
      description: "Stripe API outages could prevent customers from completing purchases.",
      probability: "Low",
      impact: "High",
      status: "Mitigated",
      mitigationPlan: "Implement fallback payment processor (PayPal), add offline cart persistence, display helpful error messages.",
      costExposure: "120000",
    });

    await storage.createRisk({
      projectId: saasApp.id,
      title: "Real-time Performance Degradation",
      description: "High user concurrency may cause WebSocket connection drops and delayed updates.",
      probability: "High",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "Implement connection pooling, add Redis pub/sub for horizontal scaling, load testing at 10x expected traffic.",
      costExposure: "45000",
    });

    await storage.createRisk({
      projectId: crmApp.id,
      title: "Data Migration Errors",
      description: "Legacy CRM data may have inconsistencies causing migration failures.",
      probability: "High",
      impact: "High",
      status: "Open",
      mitigationPlan: "Extensive data validation scripts, parallel run of old and new systems, rollback plan within 24 hours.",
      costExposure: "200000",
    });

    await storage.createRisk({
      projectId: k8sMigration.id,
      title: "Service Mesh Complexity",
      description: "Istio configuration may cause networking issues between services.",
      probability: "Medium",
      impact: "High",
      status: "Open",
      mitigationPlan: "Start with basic Kubernetes networking, gradually introduce Istio features, extensive monitoring with Prometheus/Grafana.",
      costExposure: "85000",
    });

    await storage.createRisk({
      projectId: k8sMigration.id,
      title: "Cost Overrun",
      description: "EKS cluster costs may exceed budget due to resource over-provisioning.",
      probability: "Medium",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "Implement Kubecost for cost monitoring, use spot instances for non-critical workloads, regular right-sizing reviews.",
      costExposure: "60000",
    });

    await storage.createRisk({
      projectId: bankingApp.id,
      title: "Security Audit Failure",
      description: "Third-party security audit may identify critical vulnerabilities delaying release.",
      probability: "Medium",
      impact: "Critical",
      status: "Open",
      mitigationPlan: "Continuous security scanning with Snyk, internal penetration testing before audit, dedicated security sprint buffer.",
      costExposure: "350000",
    });

    // ==================== ISSUES ====================
    
    // E-Commerce App Issues
    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Image loading slow on 3G networks",
      description: "Product images take too long to load on slower mobile networks, causing poor UX.",
      priority: "High",
      status: "In Progress",
      type: "Bug",
      assignee: "James Wilson",
      costExposure: "15000",
    });

    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Add wishlist functionality",
      description: "Users want to save products for later without adding to cart.",
      priority: "Medium",
      status: "Open",
      type: "Enhancement",
      assignee: null,
      costExposure: "8000",
    });

    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Checkout crashes on Android 12",
      description: "App crashes when completing checkout on certain Android 12 devices.",
      priority: "Critical",
      status: "Open",
      type: "Bug",
      assignee: "Maria Garcia",
      costExposure: "95000",
    });

    // SaaS Dashboard Issues
    await storage.createIssue({
      projectId: saasApp.id,
      title: "Dashboard widgets not responsive on mobile",
      description: "Charts overlap and become unreadable on screens smaller than 768px.",
      priority: "Medium",
      status: "In Progress",
      type: "Bug",
      assignee: "David Park",
      costExposure: "12000",
    });

    await storage.createIssue({
      projectId: saasApp.id,
      title: "Add data refresh interval setting",
      description: "Users want to customize how often the dashboard auto-refreshes (currently fixed at 30s).",
      priority: "Low",
      status: "Open",
      type: "Enhancement",
      assignee: null,
      costExposure: "3000",
    });

    await storage.createIssue({
      projectId: saasApp.id,
      title: "Memory leak in chart component",
      description: "Long-running dashboard sessions show increasing memory usage, eventually causing browser crash.",
      priority: "High",
      status: "Open",
      type: "Bug",
      assignee: "Emma Thompson",
      costExposure: "35000",
    });

    // CRM Issues
    await storage.createIssue({
      projectId: crmApp.id,
      title: "GraphQL query N+1 problem",
      description: "Contact list query makes separate database call for each contact's organization.",
      priority: "High",
      status: "In Progress",
      type: "Bug",
      assignee: "Backend Team",
      costExposure: "20000",
    });

    await storage.createIssue({
      projectId: crmApp.id,
      title: "Implement contact import from CSV",
      description: "Bulk import functionality for migrating from spreadsheets or other CRMs.",
      priority: "Medium",
      status: "Open",
      type: "Task",
      assignee: null,
      costExposure: "10000",
    });

    // Kubernetes Issues
    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Persistent volume claims failing in us-west-2",
      description: "EBS volumes not attaching correctly to pods in us-west-2c availability zone.",
      priority: "Critical",
      status: "In Progress",
      type: "Bug",
      assignee: "Chris Lee",
      costExposure: "150000",
    });

    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Document disaster recovery procedures",
      description: "Create runbook for cluster recovery, database restores, and failover procedures.",
      priority: "Medium",
      status: "Open",
      type: "Task",
      assignee: "Jennifer Wu",
      costExposure: "5000",
    });

    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Add Prometheus alerting rules",
      description: "Configure alerts for pod crashes, high latency, and resource exhaustion.",
      priority: "High",
      status: "Open",
      type: "Enhancement",
      assignee: "Robert Taylor",
      costExposure: "25000",
    });

    // CI/CD Issues
    await storage.createIssue({
      projectId: cicdPipeline.id,
      title: "Flaky integration tests blocking deployments",
      description: "Some integration tests randomly fail causing unnecessary deployment blocks.",
      priority: "High",
      status: "Resolved",
      type: "Bug",
      assignee: "DevOps Team",
      costExposure: "18000",
    });

    await storage.createIssue({
      projectId: cicdPipeline.id,
      title: "Add code coverage reporting",
      description: "Integrate code coverage reports into PR comments and fail builds below 80%.",
      priority: "Medium",
      status: "Closed",
      type: "Enhancement",
      assignee: "DevOps Team",
      costExposure: "7000",
    });

  }
}

function sanitizeUser(user: any) {
  if (!user) return user;
  const { passwordHash, emailVerificationToken, emailVerificationExpiry, apiKey, ...safe } = user;
  return safe;
}

function sanitizeUsers(users: any[]) {
  return users.map(sanitizeUser);
}

function getUserIdFromRequest(req: any): string | undefined {
  // First check Replit OAuth format
  const replitUserId = req.user?.claims?.sub;
  if (replitUserId) return replitUserId;
  
  // Fall back to session-based auth (email/password)
  return req.session?.userId;
}

function normalizeSearchStr(str: string | null | undefined): string {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function logUserActivity(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: number,
  metadata?: Record<string, any>,
  req?: any
) {
  try {
    const { userActivityLogs } = await import("@shared/schema");
    const { db } = await import("../db");
    await db.insert(userActivityLogs).values({
      userId,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? null,
      ipAddress: req?.ip ?? null,
      userAgent: req?.headers?.['user-agent'] ?? null,
    });
  } catch (e) {
    // Non-critical - don't let logging failures break the app
  }
}

// Helper to check if user has elevated system role (super_admin or marketing)
function hasAdminAccess(user: User | undefined | null): boolean {
  return user?.role === 'super_admin' || user?.role === 'marketing';
}

// Helper to check if user has access to an organization
async function userHasOrgAccess(userId: string | undefined, orgId: number): Promise<boolean> {
  if (!userId) return false;
  
  // Check if user has admin role (super_admin or marketing) - has access to all orgs
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (hasAdminAccess(user)) return true;
  
  // Check if user is a member of this organization
  const membership = await storage.getUserOrganizations(userId);
  return membership.some(m => m.organizationId === orgId);
}

// Helper to get user's accessible organization IDs
async function getUserOrgIds(userId: string | undefined): Promise<number[]> {
  if (!userId) return [];
  
  // Check if user has admin role
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (hasAdminAccess(user)) {
    const allOrgs = await storage.getOrganizations();
    return allOrgs.map(o => o.id);
  }
  
  const membership = await storage.getUserOrganizations(userId);
  return membership.map(m => m.organizationId);
}

// Helper to check if user has any organization membership
async function userHasAnyOrgAccess(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  
  // Admin roles always have access
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (hasAdminAccess(user)) return true;
  
  // Check if user is a member of at least one organization
  const membership = await storage.getUserOrganizations(userId);
  return membership.length > 0;
}

// Helper to check if user's email is verified (required for creating records)
async function requireEmailVerified(userId: string | undefined): Promise<{ verified: boolean; error?: string }> {
  if (!userId) return { verified: false, error: 'Authentication required' };
  
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { verified: false, error: 'User not found' };
  
  if (!user.emailVerified) {
    return { 
      verified: false, 
      error: 'Email verification required. Please verify your email before creating new items.' 
    };
  }
  
  return { verified: true };
}

// Helper to get user's membership role in an organization
async function getUserOrgRole(userId: string | undefined, orgId: number): Promise<string | null> {
  if (!userId) return null;
  const membership = await storage.getUserOrganizations(userId);
  const orgMembership = membership.find(m => m.organizationId === orgId);
  return orgMembership?.role || null;
}

// Helper to check if user is a team_member in any of their orgs
async function isTeamMemberInOrg(userId: string | undefined, orgId: number): Promise<boolean> {
  const role = await getUserOrgRole(userId, orgId);
  return role === 'team_member';
}

async function getUserResourceIds(userId: string, orgId: number): Promise<number[]> {
  const userResources = await storage.getResourcesByUserId(userId, orgId);
  return userResources.map(r => r.id);
}

interface TeamMemberAccessData {
  resourceIds: number[];
  projectIds: Set<number>;
  invitedProjectIds: Set<number>;
  taskIds: Set<number>;
}

async function getTeamMemberAccessData(userId: string, orgId: number): Promise<TeamMemberAccessData> {
  const userResources = await storage.getResourcesByUserId(userId, orgId);
  const resourceIds = userResources.map(r => r.id);
  
  if (resourceIds.length === 0) {
    return { resourceIds: [], projectIds: new Set(), invitedProjectIds: new Set(), taskIds: new Set() };
  }
  
  const resourceIdSet = new Set(resourceIds);
  
  const [orgTasks, allAssignments] = await Promise.all([
    storage.getTasksByOrganization(orgId),
    storage.getTaskResourceAssignmentsByOrgId(orgId)
  ]);
  
  const orgTaskProjectIds = new Set(orgTasks.map(t => t.projectId));
  
  const assignmentsByTaskId = new Map<number, number[]>();
  for (const a of allAssignments) {
    const existing = assignmentsByTaskId.get(a.taskId);
    if (existing) {
      existing.push(a.resourceId);
    } else {
      assignmentsByTaskId.set(a.taskId, [a.resourceId]);
    }
  }
  
  const projectIdSet = new Set<number>();
  const taskIdSet = new Set<number>();
  const invitedProjectIdSet = new Set<number>();
  
  for (const resource of userResources) {
    if (resource.invitedProjectIds && Array.isArray(resource.invitedProjectIds)) {
      for (const projectId of resource.invitedProjectIds) {
        if (orgTaskProjectIds.has(projectId)) {
          projectIdSet.add(projectId);
          invitedProjectIdSet.add(projectId);
        }
      }
    }
  }
  
  for (const task of orgTasks) {
    if (invitedProjectIdSet.has(task.projectId)) {
      taskIdSet.add(task.id);
    } else {
      const taskAssignmentResourceIds = assignmentsByTaskId.get(task.id);
      if (taskAssignmentResourceIds && taskAssignmentResourceIds.some(rid => resourceIdSet.has(rid))) {
        projectIdSet.add(task.projectId);
        taskIdSet.add(task.id);
      }
    }
  }
  
  return { resourceIds, projectIds: projectIdSet, invitedProjectIds: invitedProjectIdSet, taskIds: taskIdSet };
}

// Helper to get project IDs that a team_member has access to (assigned via resources)
async function getTeamMemberProjectIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  return Array.from(accessData.projectIds);
}

// Helper to get task IDs that a team_member has access to (directly assigned)
async function getTeamMemberTaskIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  return Array.from(accessData.taskIds);
}

// Helper to get risk IDs that a team_member has access to (assigned or in invited projects)
async function getTeamMemberRiskIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  if (accessData.resourceIds.length === 0) return [];
  
  const resourceIdSet = new Set(accessData.resourceIds);
  const riskIdSet = new Set<number>();
  const projectIds = Array.from(accessData.projectIds);
  
  const risksByProject = await Promise.all(projectIds.map(pid => storage.getRisks(pid)));
  const risksNeedingAssignmentCheck: number[] = [];
  
  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i];
    const risks = risksByProject[i];
    for (const risk of risks) {
      if (accessData.invitedProjectIds.has(projectId)) {
        riskIdSet.add(risk.id);
      } else {
        risksNeedingAssignmentCheck.push(risk.id);
      }
    }
  }
  
  if (risksNeedingAssignmentCheck.length > 0) {
    const assignmentResults = await Promise.all(
      risksNeedingAssignmentCheck.map(riskId => storage.getRiskResourceAssignments(riskId))
    );
    for (let i = 0; i < risksNeedingAssignmentCheck.length; i++) {
      if (assignmentResults[i].some(a => resourceIdSet.has(a.resourceId))) {
        riskIdSet.add(risksNeedingAssignmentCheck[i]);
      }
    }
  }
  
  return Array.from(riskIdSet);
}

async function getTeamMemberIssueIds(userId: string, orgId: number): Promise<number[]> {
  const accessData = await getTeamMemberAccessData(userId, orgId);
  if (accessData.resourceIds.length === 0) return [];
  
  const resourceIdSet = new Set(accessData.resourceIds);
  const issueIdSet = new Set<number>();
  const projectIds = Array.from(accessData.projectIds);
  
  const issuesByProject = await Promise.all(projectIds.map(pid => storage.getIssues(pid)));
  const issuesNeedingAssignmentCheck: number[] = [];
  
  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i];
    const issues = issuesByProject[i];
    for (const issue of issues) {
      if (accessData.invitedProjectIds.has(projectId)) {
        issueIdSet.add(issue.id);
      } else {
        issuesNeedingAssignmentCheck.push(issue.id);
      }
    }
  }
  
  if (issuesNeedingAssignmentCheck.length > 0) {
    const assignmentResults = await Promise.all(
      issuesNeedingAssignmentCheck.map(issueId => storage.getIssueResourceAssignments(issueId))
    );
    for (let i = 0; i < issuesNeedingAssignmentCheck.length; i++) {
      if (assignmentResults[i].some(a => resourceIdSet.has(a.resourceId))) {
        issueIdSet.add(issuesNeedingAssignmentCheck[i]);
      }
    }
  }
  
  return Array.from(issueIdSet);
}

// Helper to get portfolio IDs that a team_member has access to
// Team members can see portfolios if:
// 1. They created the portfolio (createdBy matches their userId)
// 2. Their resource ID is in the portfolio's teamMemberResourceIds array
async function getTeamMemberPortfolioIds(userId: string, orgId: number): Promise<number[]> {
  const portfolios = await storage.getPortfolios(orgId);
  const userResourceIds = await getUserResourceIds(userId, orgId);
  
  const accessiblePortfolioIds: number[] = [];
  
  for (const portfolio of portfolios) {
    // Check if user created this portfolio
    if (portfolio.createdBy === userId) {
      accessiblePortfolioIds.push(portfolio.id);
      continue;
    }
    
    // Check if user's resource ID is in teamMemberResourceIds
    if (portfolio.teamMemberResourceIds && Array.isArray(portfolio.teamMemberResourceIds)) {
      const hasAccess = userResourceIds.some(resourceId => 
        portfolio.teamMemberResourceIds!.includes(resourceId)
      );
      if (hasAccess) {
        accessiblePortfolioIds.push(portfolio.id);
      }
    }
  }
  
  return accessiblePortfolioIds;
}

export {
  encryptApiKey,
  decryptApiKey,
  openai,
  upload,
  imageUpload,
  formatZodErrors,
  classifyError,
  parseMppFile,
  parseXmlMspdi,
  parseCsv,
  parseDate,
  seedDatabase,
  sanitizeUser,
  sanitizeUsers,
  getUserIdFromRequest,
  normalizeSearchStr,
  logUserActivity,
  hasAdminAccess,
  userHasOrgAccess,
  getUserOrgIds,
  userHasAnyOrgAccess,
  requireEmailVerified,
  getUserOrgRole,
  isTeamMemberInOrg,
  getUserResourceIds,
  getTeamMemberAccessData,
  getTeamMemberProjectIds,
  getTeamMemberTaskIds,
  getTeamMemberRiskIds,
  getTeamMemberIssueIds,
  getTeamMemberPortfolioIds,
};

export type { ParsedMppTask, TeamMemberAccessData };
