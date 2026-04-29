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

const p6Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xer', '.xml'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Primavera P6 .xer or .xml files are allowed'));
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
  cost?: number; // Budgeted / planned total cost
  actualCost?: number; // Actual cost to date
  remainingCost?: number; // Remaining cost
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

// Parse CSV format using papaparse for robust RFC-compliant parsing
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
}> {
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim().toLowerCase(),
  });
  
  if (parseResult.errors.length > 0 || !parseResult.data.length) {
    console.error('CSV parsing errors:', parseResult.errors);
    return [];
  }
  
  const tasks: any[] = [];
  const headers = parseResult.meta.fields || [];
  
  // Find column names (flexible matching)
  const findColumn = (patterns: string[]): string | undefined => {
    return headers.find(h => patterns.some(p => h.includes(p)));
  };
  
  const nameCol = findColumn(['name', 'task']);
  const startCol = findColumn(['start']);
  const finishCol = findColumn(['finish', 'end']);
  const durationCol = findColumn(['duration']);
  const percentCol = findColumn(['percent', '%', 'complete']);
  const wbsCol = findColumn(['wbs']);
  const outlineLevelCol = findColumn(['outline level', 'outline_level', 'outlinelevel']);
  const typeCol = findColumn(['type']);
  const priorityCol = findColumn(['priority']);
  const assignedCol = findColumn(['assigned', 'resource']);
  const descriptionCol = findColumn(['description', 'notes']);
  
  const parentStack: { taskId: number; level: number }[] = [];

  parseResult.data.forEach((row: any, index: number) => {
    const rawName = nameCol ? row[nameCol] || '' : '';
    const taskName = rawName.trim();
    
    if (!taskName) return;
    
    const typeValue = typeCol ? (row[typeCol] || '').trim().toLowerCase() : '';
    if (typeValue === 'project') return;
    
    let durationDays: number | undefined;
    const durationStr = durationCol ? row[durationCol] || '' : '';
    const hoursExcelMatch = durationStr.match(/(\d+(?:\.\d+)?)\s*(?:hours?|h)/i);
    const daysExcelMatch = durationStr.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)/i);
    if (hoursExcelMatch && daysExcelMatch) {
      durationDays = parseFloat(daysExcelMatch[1]) + parseFloat(hoursExcelMatch[1]) / 8;
    } else if (hoursExcelMatch) {
      durationDays = parseFloat(hoursExcelMatch[1]) / 8;
    } else if (daysExcelMatch) {
      durationDays = parseFloat(daysExcelMatch[1]);
    } else {
      const numMatch = durationStr.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        durationDays = parseFloat(numMatch[1]);
      }
    }
    
    let percentComplete = 0;
    if (percentCol && row[percentCol]) {
      const pctStr = row[percentCol].replace('%', '').trim();
      percentComplete = parseInt(pctStr) || 0;
    }
    
    let outlineLevel = 1;
    if (outlineLevelCol && row[outlineLevelCol]) {
      const parsed = parseInt(row[outlineLevelCol]);
      if (!isNaN(parsed) && parsed >= 1) outlineLevel = parsed;
    } else if (rawName !== taskName) {
      const leadingSpaces = rawName.length - rawName.trimStart().length;
      if (leadingSpaces > 0) {
        outlineLevel = Math.floor(leadingSpaces / 4) + 1;
      }
    }

    const isSummary = typeValue === 'summary';
    const isMilestone = typeValue === 'milestone';

    const taskId = tasks.length + 1;

    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= outlineLevel) {
      parentStack.pop();
    }
    const parentTaskId = parentStack.length > 0 ? parentStack[parentStack.length - 1].taskId : undefined;

    parentStack.push({ taskId, level: outlineLevel });
    
    tasks.push({
      taskId,
      wbs: wbsCol ? row[wbsCol]?.trim() : undefined,
      taskName,
      startDate: startCol ? parseDate(row[startCol]) : undefined,
      finishDate: finishCol ? parseDate(row[finishCol]) : undefined,
      duration: durationStr,
      durationDays,
      percentComplete,
      outlineLevel,
      parentTaskId,
      isSummary,
      isMilestone,
      notes: descriptionCol ? row[descriptionCol]?.trim() : undefined,
    });
  });
  
  return tasks;
}

// Parse Primavera P6 XER (tab-delimited) format
// Reuses ParsedMppTask shape so existing convertMppImportToProject works as-is.
function parseXerFile(fileBuffer: Buffer): ParsedMppTask[] {
  // XER files are typically Windows-1252 encoded. Decode using latin1 (lossless byte-preserving)
  // so accented characters in names are not mangled at the byte level.
  const content = fileBuffer.toString('latin1');
  const lines = content.split(/\r?\n/);

  type Section = { name: string; fields: string[]; rows: Record<string, string>[] };
  const sections: Record<string, Section> = {};
  let current: Section | null = null;

  for (const line of lines) {
    if (!line) continue;
    const cells = line.split('\t');
    const tag = cells[0];

    if (tag === '%T') {
      current = { name: cells[1] || '', fields: [], rows: [] };
      if (current.name) sections[current.name] = current;
    } else if (tag === '%F' && current) {
      current.fields = cells.slice(1);
    } else if (tag === '%R' && current && current.fields.length > 0) {
      const values = cells.slice(1);
      const row: Record<string, string> = {};
      for (let i = 0; i < current.fields.length; i++) {
        row[current.fields[i]] = values[i] ?? '';
      }
      current.rows.push(row);
    }
  }

  const wbsRows = sections['PROJWBS']?.rows || [];
  const taskRows = sections['TASK']?.rows || [];
  const predRows = sections['TASKPRED']?.rows || [];
  const rsrcRows = sections['TASKRSRC']?.rows || [];
  const expRows = sections['TASKEXP']?.rows || [];

  if (taskRows.length === 0) return [];

  // Aggregate per-activity cost from resource assignments and expenses.
  // P6 stores costs on the TASKRSRC (resource assignment) and TASKEXP
  // (expense item) tables, keyed by task_id (the activity). The activity's
  // total = sum across both. Activity's actual = act_reg_cost + act_ot_cost
  // (resources) + act_cost (expenses).
  type CostBucket = { cost: number; actualCost: number; remainingCost: number };
  const taskCosts = new Map<string, CostBucket>();
  const addCost = (taskIdStr: string, c: number, a: number, r: number) => {
    if (!taskIdStr) return;
    if (c === 0 && a === 0 && r === 0) return;
    const cur = taskCosts.get(taskIdStr) || { cost: 0, actualCost: 0, remainingCost: 0 };
    cur.cost += c; cur.actualCost += a; cur.remainingCost += r;
    taskCosts.set(taskIdStr, cur);
  };
  for (const r of rsrcRows) {
    const target = parseFloat(r.target_cost) || 0;
    const actReg = parseFloat(r.act_reg_cost) || 0;
    const actOt = parseFloat(r.act_ot_cost) || 0;
    const remain = parseFloat(r.remain_cost) || 0;
    addCost(r.task_id, target, actReg + actOt, remain);
  }
  for (const r of expRows) {
    const target = parseFloat(r.target_cost) || 0;
    const actual = parseFloat(r.act_cost) || 0;
    const remain = parseFloat(r.remain_cost) || 0;
    addCost(r.task_id, target, actual, remain);
  }

  // Build WBS hierarchy: wbs_id -> node
  type WbsNode = {
    wbsId: string;
    parentId: string | null;
    name: string;
    shortName: string;
    level: number;
  };
  const wbsMap = new Map<string, WbsNode>();
  for (const w of wbsRows) {
    if (!w.wbs_id) continue;
    wbsMap.set(w.wbs_id, {
      wbsId: w.wbs_id,
      parentId: w.parent_wbs_id && w.parent_wbs_id !== '' ? w.parent_wbs_id : null,
      name: w.wbs_name || w.wbs_short_name || 'WBS',
      shortName: w.wbs_short_name || '',
      level: 1,
    });
  }
  // Compute depths (root = 1)
  const computeLevel = (node: WbsNode): number => {
    let lvl = 1;
    let p = node.parentId;
    const seen = new Set<string>();
    while (p && wbsMap.has(p) && !seen.has(p)) {
      seen.add(p);
      lvl++;
      p = wbsMap.get(p)!.parentId;
    }
    return lvl;
  };
  for (const node of wbsMap.values()) {
    node.level = computeLevel(node);
  }

  // Allocate synthetic taskIds for WBS summaries above max real task_id to avoid collision
  let maxTaskId = 0;
  for (const t of taskRows) {
    const tid = parseInt(t.task_id);
    if (!isNaN(tid) && tid > maxTaskId) maxTaskId = tid;
  }
  let wbsIdCounter = maxTaskId + 1000;
  const wbsToSyntheticId = new Map<string, number>();
  for (const node of wbsMap.values()) {
    wbsToSyntheticId.set(node.wbsId, wbsIdCounter++);
  }

  const tasks: ParsedMppTask[] = [];
  // Emit WBS summaries first, in level order so parents precede children
  const sortedWbs = Array.from(wbsMap.values()).sort((a, b) => a.level - b.level);
  for (const node of sortedWbs) {
    const parentSyntheticId = node.parentId && wbsToSyntheticId.has(node.parentId)
      ? wbsToSyntheticId.get(node.parentId)
      : undefined;
    tasks.push({
      taskId: wbsToSyntheticId.get(node.wbsId)!,
      wbs: node.shortName || undefined,
      taskName: node.name,
      outlineLevel: node.level,
      parentTaskId: parentSyntheticId,
      isSummary: true,
      isMilestone: false,
      percentComplete: 0,
    });
  }

  // Build predecessor lookup keyed by successor task_id (string)
  const predMap = new Map<string, Array<{ predecessorTaskId: number; type: string; lagDays: number }>>();
  const xerTypeMap: Record<string, string> = {
    PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF',
  };
  for (const p of predRows) {
    const succId = p.task_id;
    const predId = parseInt(p.pred_task_id);
    if (!succId || isNaN(predId)) continue;
    const type = xerTypeMap[p.pred_type] || 'FS';
    const lagHours = parseFloat(p.lag_hr_cnt) || 0;
    const lagDays = Math.round((lagHours / 8) * 100) / 100;
    if (!predMap.has(succId)) predMap.set(succId, []);
    predMap.get(succId)!.push({ predecessorTaskId: predId, type, lagDays });
  }

  // Emit TASK rows
  for (const t of taskRows) {
    const taskId = parseInt(t.task_id);
    if (isNaN(taskId)) continue;

    const wbsNode = t.wbs_id ? wbsMap.get(t.wbs_id) : undefined;
    const outlineLevel = wbsNode ? wbsNode.level + 1 : 1;
    const parentTaskId = wbsNode ? wbsToSyntheticId.get(wbsNode.wbsId) : undefined;

    const targetDrtnHr = parseFloat(t.target_drtn_hr_cnt) || 0;
    const durationDays = targetDrtnHr > 0 ? Math.round((targetDrtnHr / 8) * 100) / 100 : undefined;

    const isMilestone = t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile';

    // P6 phys_complete_pct stored as 0-100 percentage
    let pct = parseFloat(t.phys_complete_pct);
    if (isNaN(pct)) pct = 0;
    if (pct > 0 && pct <= 1) pct = pct * 100; // tolerate 0-1 fractional schemas
    const percentComplete = Math.max(0, Math.min(100, Math.round(pct)));

    const pickDate = (s: string | undefined) => {
      if (!s) return undefined;
      const trimmed = s.trim();
      if (!trimmed) return undefined;
      return trimmed.split(' ')[0];
    };
    const startDate = pickDate(t.act_start_date) || pickDate(t.target_start_date) || pickDate(t.early_start_date);
    const finishDate = pickDate(t.act_end_date) || pickDate(t.target_end_date) || pickDate(t.early_end_date);

    const taskName = (t.task_name || '').trim() || (t.task_code || '').trim() || `Task ${t.task_id}`;

    const costs = taskCosts.get(t.task_id);

    tasks.push({
      taskId,
      wbs: wbsNode?.shortName || undefined,
      taskName,
      startDate,
      finishDate,
      duration: durationDays !== undefined ? `${durationDays}d` : undefined,
      durationDays,
      percentComplete,
      outlineLevel,
      parentTaskId,
      isSummary: false,
      isMilestone,
      cost: costs?.cost,
      actualCost: costs?.actualCost,
      remainingCost: costs?.remainingCost,
      predecessors: predMap.get(t.task_id),
    });
  }

  rollupCostsToSummaries(tasks);
  return tasks;
}

// Walk the parent chain from each leaf task and accumulate cost / actualCost /
// remainingCost into ancestor summary tasks. Mutates the array in place.
function rollupCostsToSummaries(tasks: ParsedMppTask[]): void {
  const byId = new Map<number, ParsedMppTask>();
  for (const t of tasks) {
    if (t.taskId !== undefined) byId.set(t.taskId, t);
  }
  for (const t of tasks) {
    if (t.isSummary) continue;
    const c = t.cost || 0;
    const a = t.actualCost || 0;
    const r = t.remainingCost || 0;
    if (c === 0 && a === 0 && r === 0) continue;

    let pid = t.parentTaskId;
    const seen = new Set<number>();
    while (pid !== undefined && byId.has(pid) && !seen.has(pid)) {
      seen.add(pid);
      const parent = byId.get(pid)!;
      if (parent.isSummary) {
        parent.cost = (parent.cost || 0) + c;
        parent.actualCost = (parent.actualCost || 0) + a;
        parent.remainingCost = (parent.remainingCost || 0) + r;
      }
      pid = parent.parentTaskId;
    }
  }
}

// Parse Primavera P6 PM XML format
async function parseP6Xml(xmlContent: string): Promise<ParsedMppTask[]> {
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlContent);

  const tasks: ParsedMppTask[] = [];

  // Root may be <APIBusinessObjects> (P6 PM XML) or just <Project>
  const root = result.APIBusinessObjects || result;
  let projects = root.Project;
  if (!projects) return [];
  if (!Array.isArray(projects)) projects = [projects];

  const p6XmlTypeMap: Record<string, string> = {
    'Finish to Start': 'FS', 'Start to Start': 'SS',
    'Finish to Finish': 'FF', 'Start to Finish': 'SF',
    FS: 'FS', SS: 'SS', FF: 'FF', SF: 'SF',
  };

  for (const project of projects) {
    let wbsItems = project.WBS;
    let activities = project.Activity;
    let relationships = project.Relationship;
    let resourceAssignments = project.ResourceAssignment;
    let expenseItems = project.ExpenseItem || project.Expense;

    if (wbsItems && !Array.isArray(wbsItems)) wbsItems = [wbsItems];
    if (activities && !Array.isArray(activities)) activities = [activities];
    if (relationships && !Array.isArray(relationships)) relationships = [relationships];
    if (resourceAssignments && !Array.isArray(resourceAssignments)) resourceAssignments = [resourceAssignments];
    if (expenseItems && !Array.isArray(expenseItems)) expenseItems = [expenseItems];

    wbsItems = wbsItems || [];
    activities = activities || [];
    relationships = relationships || [];
    resourceAssignments = resourceAssignments || [];
    expenseItems = expenseItems || [];

    // Some P6 PMXML exports nest <ResourceAssignment> / <ExpenseItem> inside
    // each <Activity> rather than at the <Project> level. Pull those up too.
    for (const a of activities) {
      const nestedRas = a.ResourceAssignment;
      if (nestedRas) {
        const arr = Array.isArray(nestedRas) ? nestedRas : [nestedRas];
        for (const ra of arr) {
          if (ra && ra.ActivityObjectId === undefined) ra.ActivityObjectId = a.ObjectId;
          resourceAssignments.push(ra);
        }
      }
      const nestedExps = a.ExpenseItem || a.Expense;
      if (nestedExps) {
        const arr = Array.isArray(nestedExps) ? nestedExps : [nestedExps];
        for (const ex of arr) {
          if (ex && ex.ActivityObjectId === undefined) ex.ActivityObjectId = a.ObjectId;
          expenseItems.push(ex);
        }
      }
    }

    // Aggregate cost per Activity from resource assignments + expense items.
    const num = (v: any): number => {
      if (v === undefined || v === null || v === '') return 0;
      const n = parseFloat(String(v));
      return isNaN(n) ? 0 : n;
    };
    type CostBucket = { cost: number; actualCost: number; remainingCost: number };
    const activityCosts = new Map<string, CostBucket>();
    const addActivityCost = (aid: any, c: number, a: number, r: number) => {
      const key = aid !== undefined && aid !== '' ? String(aid) : '';
      if (!key) return;
      if (c === 0 && a === 0 && r === 0) return;
      const cur = activityCosts.get(key) || { cost: 0, actualCost: 0, remainingCost: 0 };
      cur.cost += c; cur.actualCost += a; cur.remainingCost += r;
      activityCosts.set(key, cur);
    };
    for (const ra of resourceAssignments) {
      if (!ra) continue;
      // Field names vary across P6 versions: prefer PlannedCost / ActualCost /
      // RemainingCost, fall back to *TotalCost variants.
      const planned = num(ra.PlannedCost ?? ra.PlannedTotalCost ?? ra.BudgetedCost);
      const actualReg = num(ra.ActualRegularCost);
      const actualOt = num(ra.ActualOvertimeCost);
      const actualTotal = num(ra.ActualCost ?? ra.ActualTotalCost);
      const actual = actualTotal > 0 ? actualTotal : (actualReg + actualOt);
      const remaining = num(ra.RemainingCost ?? ra.RemainingTotalCost ?? ra.RemainingEarlyCost);
      addActivityCost(ra.ActivityObjectId, planned, actual, remaining);
    }
    for (const ex of expenseItems) {
      if (!ex) continue;
      const planned = num(ex.PlannedCost ?? ex.PlannedTotalCost ?? ex.BudgetedCost);
      const actual = num(ex.ActualCost ?? ex.ActualTotalCost);
      const remaining = num(ex.RemainingCost ?? ex.RemainingTotalCost);
      addActivityCost(ex.ActivityObjectId, planned, actual, remaining);
    }

    type WbsNode = { id: string; parentId: string | null; name: string; code: string; level: number };
    const wbsMap = new Map<string, WbsNode>();
    for (const w of wbsItems) {
      const id = w.ObjectId !== undefined ? String(w.ObjectId) : '';
      if (!id) continue;
      wbsMap.set(id, {
        id,
        parentId: w.ParentObjectId !== undefined && w.ParentObjectId !== '' ? String(w.ParentObjectId) : null,
        name: w.Name || w.Code || 'WBS',
        code: w.Code || '',
        level: 1,
      });
    }
    const computeLevel = (node: WbsNode): number => {
      let lvl = 1;
      let p = node.parentId;
      const seen = new Set<string>();
      while (p && wbsMap.has(p) && !seen.has(p)) { seen.add(p); lvl++; p = wbsMap.get(p)!.parentId; }
      return lvl;
    };
    for (const n of wbsMap.values()) n.level = computeLevel(n);

    let maxActivityId = 0;
    for (const a of activities) {
      const aid = parseInt(a.ObjectId);
      if (!isNaN(aid) && aid > maxActivityId) maxActivityId = aid;
    }
    let wbsIdCounter = maxActivityId + 1000;
    const wbsSyntheticIds = new Map<string, number>();
    for (const n of wbsMap.values()) wbsSyntheticIds.set(n.id, wbsIdCounter++);

    const sortedWbs = Array.from(wbsMap.values()).sort((a, b) => a.level - b.level);
    for (const n of sortedWbs) {
      const parentSyntheticId = n.parentId && wbsSyntheticIds.has(n.parentId)
        ? wbsSyntheticIds.get(n.parentId)
        : undefined;
      tasks.push({
        taskId: wbsSyntheticIds.get(n.id)!,
        wbs: n.code || undefined,
        taskName: n.name,
        outlineLevel: n.level,
        parentTaskId: parentSyntheticId,
        isSummary: true,
        isMilestone: false,
        percentComplete: 0,
      });
    }

    const predMap = new Map<string, Array<{ predecessorTaskId: number; type: string; lagDays: number }>>();
    for (const r of relationships) {
      const succ = r.SuccessorActivityObjectId !== undefined ? String(r.SuccessorActivityObjectId) : '';
      const pred = parseInt(r.PredecessorActivityObjectId);
      if (!succ || isNaN(pred)) continue;
      const type = p6XmlTypeMap[r.Type] || 'FS';
      const lagHours = parseFloat(r.Lag) || 0;
      const lagDays = Math.round((lagHours / 8) * 100) / 100;
      if (!predMap.has(succ)) predMap.set(succ, []);
      predMap.get(succ)!.push({ predecessorTaskId: pred, type, lagDays });
    }

    for (const a of activities) {
      const taskId = parseInt(a.ObjectId);
      if (isNaN(taskId)) continue;

      const wbsId = a.WBSObjectId !== undefined && a.WBSObjectId !== '' ? String(a.WBSObjectId) : null;
      const wbsNode = wbsId ? wbsMap.get(wbsId) : undefined;
      const outlineLevel = wbsNode ? wbsNode.level + 1 : 1;
      const parentTaskId = wbsNode ? wbsSyntheticIds.get(wbsNode.id) : undefined;

      const isMilestone = a.Type === 'Start Milestone' || a.Type === 'Finish Milestone'
        || a.Type === 'TT_Mile' || a.Type === 'TT_FinMile';

      const pickDate = (s: any) => {
        if (!s) return undefined;
        const str = String(s).trim();
        if (!str) return undefined;
        return str.split('T')[0].split(' ')[0];
      };
      const startDate = pickDate(a.ActualStartDate) || pickDate(a.PlannedStartDate)
        || pickDate(a.StartDate) || pickDate(a.EarlyStartDate);
      const finishDate = pickDate(a.ActualFinishDate) || pickDate(a.PlannedFinishDate)
        || pickDate(a.FinishDate) || pickDate(a.EarlyFinishDate);

      const plannedDur = parseFloat(a.PlannedDuration) || parseFloat(a.AtCompletionDuration) || 0;
      const durationDays = plannedDur > 0 ? Math.round((plannedDur / 8) * 100) / 100 : undefined;

      let pct = parseFloat(a.PercentComplete);
      if (isNaN(pct)) pct = 0;
      if (pct > 0 && pct <= 1) pct = pct * 100;
      const percentComplete = Math.max(0, Math.min(100, Math.round(pct)));

      // Prefer aggregated cost from resource assignments + expenses; if none
      // were provided, fall back to activity-level total cost fields. P6 PMXML
      // emits these as PlannedTotalCost / ActualTotalCost / RemainingTotalCost
      // (or PlannedCost / ActualCost / RemainingCost in some exports).
      let costs = activityCosts.get(String(a.ObjectId));
      if (!costs) {
        const planned = num(a.PlannedTotalCost ?? a.PlannedCost ?? a.BudgetedTotalCost);
        const actual = num(a.ActualTotalCost ?? a.ActualCost);
        const remaining = num(a.RemainingTotalCost ?? a.RemainingCost);
        if (planned > 0 || actual > 0 || remaining > 0) {
          costs = { cost: planned, actualCost: actual, remainingCost: remaining };
        }
      }

      tasks.push({
        taskId,
        wbs: wbsNode?.code || undefined,
        taskName: a.Name || a.Id || `Activity ${a.ObjectId}`,
        startDate,
        finishDate,
        duration: durationDays !== undefined ? `${durationDays}d` : undefined,
        durationDays,
        percentComplete,
        outlineLevel,
        parentTaskId,
        isSummary: false,
        isMilestone,
        cost: costs?.cost,
        actualCost: costs?.actualCost,
        remainingCost: costs?.remainingCost,
        predecessors: predMap.get(String(a.ObjectId)),
      });
    }
  }

  rollupCostsToSummaries(tasks);
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
      budget: 450000,
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
      budget: 800000,
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
      budget: 350000,
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
      budget: 280000,
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
      budget: 180000,
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
      budget: 400000,
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
      budget: 120000,
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
      status: "Completed",
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
      status: "Completed",
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
      status: "Completed",
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
      costExposure: 75000,
    });

    await storage.createRisk({
      projectId: ecommerceApp.id,
      title: "Payment Processing Downtime",
      description: "Stripe API outages could prevent customers from completing purchases.",
      probability: "Low",
      impact: "High",
      status: "Mitigated",
      mitigationPlan: "Implement fallback payment processor (PayPal), add offline cart persistence, display helpful error messages.",
      costExposure: 120000,
    });

    await storage.createRisk({
      projectId: saasApp.id,
      title: "Real-time Performance Degradation",
      description: "High user concurrency may cause WebSocket connection drops and delayed updates.",
      probability: "High",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "Implement connection pooling, add Redis pub/sub for horizontal scaling, load testing at 10x expected traffic.",
      costExposure: 45000,
    });

    await storage.createRisk({
      projectId: crmApp.id,
      title: "Data Migration Errors",
      description: "Legacy CRM data may have inconsistencies causing migration failures.",
      probability: "High",
      impact: "High",
      status: "Open",
      mitigationPlan: "Extensive data validation scripts, parallel run of old and new systems, rollback plan within 24 hours.",
      costExposure: 200000,
    });

    await storage.createRisk({
      projectId: k8sMigration.id,
      title: "Service Mesh Complexity",
      description: "Istio configuration may cause networking issues between services.",
      probability: "Medium",
      impact: "High",
      status: "Open",
      mitigationPlan: "Start with basic Kubernetes networking, gradually introduce Istio features, extensive monitoring with Prometheus/Grafana.",
      costExposure: 85000,
    });

    await storage.createRisk({
      projectId: k8sMigration.id,
      title: "Cost Overrun",
      description: "EKS cluster costs may exceed budget due to resource over-provisioning.",
      probability: "Medium",
      impact: "Medium",
      status: "Open",
      mitigationPlan: "Implement Kubecost for cost monitoring, use spot instances for non-critical workloads, regular right-sizing reviews.",
      costExposure: 60000,
    });

    await storage.createRisk({
      projectId: bankingApp.id,
      title: "Security Audit Failure",
      description: "Third-party security audit may identify critical vulnerabilities delaying release.",
      probability: "Medium",
      impact: "Critical",
      status: "Open",
      mitigationPlan: "Continuous security scanning with Snyk, internal penetration testing before audit, dedicated security sprint buffer.",
      costExposure: 350000,
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
      costExposure: 15000,
    });

    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Add wishlist functionality",
      description: "Users want to save products for later without adding to cart.",
      priority: "Medium",
      status: "Open",
      type: "Enhancement",
      assignee: null,
      costExposure: 8000,
    });

    await storage.createIssue({
      projectId: ecommerceApp.id,
      title: "Checkout crashes on Android 12",
      description: "App crashes when completing checkout on certain Android 12 devices.",
      priority: "Critical",
      status: "Open",
      type: "Bug",
      assignee: "Maria Garcia",
      costExposure: 95000,
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
      costExposure: 12000,
    });

    await storage.createIssue({
      projectId: saasApp.id,
      title: "Add data refresh interval setting",
      description: "Users want to customize how often the dashboard auto-refreshes (currently fixed at 30s).",
      priority: "Low",
      status: "Open",
      type: "Enhancement",
      assignee: null,
      costExposure: 3000,
    });

    await storage.createIssue({
      projectId: saasApp.id,
      title: "Memory leak in chart component",
      description: "Long-running dashboard sessions show increasing memory usage, eventually causing browser crash.",
      priority: "High",
      status: "Open",
      type: "Bug",
      assignee: "Emma Thompson",
      costExposure: 35000,
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
      costExposure: 20000,
    });

    await storage.createIssue({
      projectId: crmApp.id,
      title: "Implement contact import from CSV",
      description: "Bulk import functionality for migrating from spreadsheets or other CRMs.",
      priority: "Medium",
      status: "Open",
      type: "Task",
      assignee: null,
      costExposure: 10000,
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
      costExposure: 150000,
    });

    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Document disaster recovery procedures",
      description: "Create runbook for cluster recovery, database restores, and failover procedures.",
      priority: "Medium",
      status: "Open",
      type: "Task",
      assignee: "Jennifer Wu",
      costExposure: 5000,
    });

    await storage.createIssue({
      projectId: k8sMigration.id,
      title: "Add Prometheus alerting rules",
      description: "Configure alerts for pod crashes, high latency, and resource exhaustion.",
      priority: "High",
      status: "Open",
      type: "Enhancement",
      assignee: "Robert Taylor",
      costExposure: 25000,
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
      costExposure: 18000,
    });

    await storage.createIssue({
      projectId: cicdPipeline.id,
      title: "Add code coverage reporting",
      description: "Integrate code coverage reports into PR comments and fail builds below 80%.",
      priority: "Medium",
      status: "Closed",
      type: "Enhancement",
      assignee: "DevOps Team",
      costExposure: 7000,
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
      entityId: entityId !== undefined ? String(entityId) : null,
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
  p6Upload,
  imageUpload,
  formatZodErrors,
  classifyError,
  parseMppFile,
  parseXmlMspdi,
  parseCsv,
  parseXerFile,
  parseP6Xml,
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
  validateUserInOrg,
};

async function validateUserInOrg(targetUserId: string, orgId: number): Promise<boolean> {
  const membership = await storage.getUserOrganizations(targetUserId);
  return membership.some(m => m.organizationId === orgId);
}

export type { ParsedMppTask, TeamMemberAccessData };
