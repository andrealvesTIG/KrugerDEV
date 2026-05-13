import { differenceInDays, parseISO, addDays, format } from "date-fns";
import { addWorkingDays, workingDaysBetween, isWorkingDay } from "./workingDays";
import { addWorkingDaysCal, workingDaysBetweenCal, isWorkingDayCal } from "./workingDays";
import type { ResolvedCalendar } from "@shared/lib/calendarEngine";

// Server / DB only persists the long-form values. The shorthand forms ("FS"
// etc.) are accepted by the CPM engine for input convenience and normalized
// by `normalizeDependencyType`, but must NOT be sent over the wire — anything
// posted to /api/task-dependencies must use a `WireDependencyType`.
export type WireDependencyType = "finish-to-start" | "start-to-start" | "finish-to-finish" | "start-to-finish";
export type DependencyTypeShortform = "FS" | "SS" | "FF" | "SF";
export type DependencyType = WireDependencyType | DependencyTypeShortform;

const SHORT_TO_LONG: Record<DependencyTypeShortform, WireDependencyType> = {
  FS: "finish-to-start",
  SS: "start-to-start",
  FF: "finish-to-finish",
  SF: "start-to-finish",
};

const VALID_WIRE_TYPES: ReadonlySet<WireDependencyType> = new Set([
  "finish-to-start",
  "start-to-start",
  "finish-to-finish",
  "start-to-finish",
]);

/**
 * Convert any DependencyType (long or short) to its wire-safe long form.
 * Use this anywhere a CPM result is persisted via the API. Unknown / invalid
 * inputs default to "finish-to-start" — never let a raw client string reach
 * the server unchecked.
 */
export function toWireDependencyType(type: DependencyType | string | null | undefined): WireDependencyType {
  if (!type) return "finish-to-start";
  const short = (SHORT_TO_LONG as Record<string, WireDependencyType>)[type];
  if (short) return short;
  if (VALID_WIRE_TYPES.has(type as WireDependencyType)) {
    return type as WireDependencyType;
  }
  // Tolerate alternative spellings ("FinishToStart", "finish_to_start", etc.)
  const collapsed = String(type).toLowerCase().replace(/[-_\s]/g, "");
  if (collapsed === "finishtostart" || collapsed === "fs") return "finish-to-start";
  if (collapsed === "starttostart" || collapsed === "ss") return "start-to-start";
  if (collapsed === "finishtofinish" || collapsed === "ff") return "finish-to-finish";
  if (collapsed === "starttofinish" || collapsed === "sf") return "start-to-finish";
  return "finish-to-start";
}

export interface CPMTask {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  isMilestone?: boolean | null;
  isSummary?: boolean | null;
  constraintType?: string | null;
  constraintDate?: string | null;
}

export interface CPMDependency {
  taskId: number;
  dependsOnTaskId: number;
  dependencyType: DependencyType | string | null;
  lagDays?: number | null;
}

export interface CPMResult {
  id: number;
  ES: number; // Earliest Start (working days from project start)
  EF: number; // Earliest Finish
  LS: number; // Latest Start
  LF: number; // Latest Finish
  TF: number; // Total Float
  isCritical: boolean;
  esDate: string; // Actual date string
  efDate: string;
  lsDate: string;
  lfDate: string;
}

export interface CPMCalculationResult {
  results: Map<number, CPMResult>;
  criticalPath: number[]; // Task IDs in critical path order
  projectStart: Date;
  projectFinish: Date;
  error?: string;
  cycleTaskIds?: number[]; // Tasks involved in cycle if detected
}

function normalizeDependencyType(type: string | null): "FS" | "SS" | "FF" | "SF" {
  if (!type) return "FS";
  const normalized = type.toLowerCase().replace(/-/g, "").replace(/ /g, "");
  if (normalized === "finishtostart" || normalized === "fs") return "FS";
  if (normalized === "starttostart" || normalized === "ss") return "SS";
  if (normalized === "finishtofinish" || normalized === "ff") return "FF";
  if (normalized === "starttofinish" || normalized === "sf") return "SF";
  return "FS";
}

function getDurationDays(task: CPMTask, cal?: ResolvedCalendar | null): number {
  if (task.isMilestone) return 0;
  if (task.durationDays != null && task.durationDays >= 0) return task.durationDays;
  if (task.startDate && task.endDate) {
    const start = parseISO(task.startDate);
    const end = parseISO(task.endDate);
    return Math.max(0, workingDaysBetweenCal(cal, start, end));
  }
  return 1; // Default duration
}

function workingDaysFromProjectStart(projectStart: Date, targetDate: Date, cal?: ResolvedCalendar | null): number {
  if (targetDate <= projectStart) return 0;
  const count = workingDaysBetweenCal(cal, projectStart, targetDate);
  return count > 0 ? count - 1 : 0;
}

function dateFromWorkingDayOffset(baseDate: Date, offset: number, cal?: ResolvedCalendar | null): Date {
  if (offset === 0) return baseDate;
  return addWorkingDaysCal(cal, baseDate, offset);
}

interface GraphNode {
  id: number;
  duration: number;
  predecessors: { taskId: number; type: "FS" | "SS" | "FF" | "SF"; lag: number }[];
  successors: { taskId: number; type: "FS" | "SS" | "FF" | "SF"; lag: number }[];
  ES: number;
  EF: number;
  LS: number;
  LF: number;
  TF: number;
  isPinned: boolean;
  pinnedStart?: number;
}

function detectCycle(
  nodes: Map<number, GraphNode>,
  startId: number,
  visited: Set<number>,
  recStack: Set<number>,
  path: number[]
): number[] | null {
  visited.add(startId);
  recStack.add(startId);
  path.push(startId);

  const node = nodes.get(startId);
  if (node) {
    for (const succ of node.successors) {
      if (!visited.has(succ.taskId)) {
        const cycle = detectCycle(nodes, succ.taskId, visited, recStack, path);
        if (cycle) return cycle;
      } else if (recStack.has(succ.taskId)) {
        const cycleStart = path.indexOf(succ.taskId);
        return path.slice(cycleStart);
      }
    }
  }

  path.pop();
  recStack.delete(startId);
  return null;
}

function topologicalSort(nodes: Map<number, GraphNode>): { sorted: number[]; cycle: number[] | null } {
  const visited = new Set<number>();
  const recStack = new Set<number>();
  const result: number[] = [];
  const nodeIds = Array.from(nodes.keys());

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      const cycle = detectCycle(nodes, id, visited, recStack, []);
      if (cycle) {
        return { sorted: [], cycle };
      }
    }
  }

  const inDegree = new Map<number, number>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }

  const nodeValues = Array.from(nodes.values());
  for (const node of nodeValues) {
    for (const succ of node.successors) {
      inDegree.set(succ.taskId, (inDegree.get(succ.taskId) || 0) + 1);
    }
  }

  const queue: number[] = [];
  const inDegreeEntries = Array.from(inDegree.entries());
  for (const [id, degree] of inDegreeEntries) {
    if (degree === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const node = nodes.get(current);
    if (node) {
      for (const succ of node.successors) {
        const newDegree = (inDegree.get(succ.taskId) || 0) - 1;
        inDegree.set(succ.taskId, newDegree);
        if (newDegree === 0) queue.push(succ.taskId);
      }
    }
  }

  return { sorted: result, cycle: null };
}

export function calculateCPM(
  tasks: CPMTask[],
  dependencies: CPMDependency[],
  calendar?: ResolvedCalendar | null,
): CPMCalculationResult {
  const cal = calendar ?? null;
  if (tasks.length === 0) {
    return {
      results: new Map(),
      criticalPath: [],
      projectStart: new Date(),
      projectFinish: new Date(),
    };
  }

  const validTasks = tasks.filter(t => t.startDate && t.endDate && !t.isSummary);
  if (validTasks.length === 0) {
    return {
      results: new Map(),
      criticalPath: [],
      projectStart: new Date(),
      projectFinish: new Date(),
    };
  }

  const projectStartDate = validTasks.reduce((min, t) => {
    const start = parseISO(t.startDate!);
    return start < min ? start : min;
  }, parseISO(validTasks[0].startDate!));

  const nodes = new Map<number, GraphNode>();
  const taskMap = new Map<number, CPMTask>();

  for (const task of validTasks) {
    taskMap.set(task.id, task);
    const duration = getDurationDays(task, cal);
    
    let isPinned = false;
    let pinnedStart: number | undefined;
    if (task.constraintType && task.constraintDate) {
      const constraintDate = parseISO(task.constraintDate);
      if (task.constraintType === "Must Start On" || task.constraintType === "Start No Earlier Than") {
        isPinned = true;
        pinnedStart = workingDaysFromProjectStart(projectStartDate, constraintDate, cal);
      }
    }

    nodes.set(task.id, {
      id: task.id,
      duration,
      predecessors: [],
      successors: [],
      ES: 0,
      EF: 0,
      LS: Infinity,
      LF: Infinity,
      TF: 0,
      isPinned,
      pinnedStart,
    });
  }

  for (const dep of dependencies) {
    const succNode = nodes.get(dep.taskId);
    const predNode = nodes.get(dep.dependsOnTaskId);
    
    if (succNode && predNode) {
      const type = normalizeDependencyType(dep.dependencyType);
      const lag = dep.lagDays ?? 0;
      
      succNode.predecessors.push({ taskId: dep.dependsOnTaskId, type, lag });
      predNode.successors.push({ taskId: dep.taskId, type, lag });
    }
  }

  const { sorted, cycle } = topologicalSort(nodes);
  if (cycle) {
    return {
      results: new Map(),
      criticalPath: [],
      projectStart: projectStartDate,
      projectFinish: projectStartDate,
      error: `Circular dependency detected involving tasks: ${cycle.map(id => taskMap.get(id)?.name || id).join(" → ")}`,
      cycleTaskIds: cycle,
    };
  }

  // Forward Pass: Calculate ES and EF (in working day units)
  for (const taskId of sorted) {
    const node = nodes.get(taskId)!;
    
    if (node.isPinned && node.pinnedStart !== undefined) {
      node.ES = Math.max(node.ES, node.pinnedStart);
    }
    
    if (node.predecessors.length === 0 && !node.isPinned) {
      const task = taskMap.get(taskId)!;
      node.ES = workingDaysFromProjectStart(projectStartDate, parseISO(task.startDate!), cal);
    }
    
    for (const pred of node.predecessors) {
      const predNode = nodes.get(pred.taskId);
      if (!predNode) continue;

      let candidateES: number;
      let candidateEF: number;

      switch (pred.type) {
        case "FS":
          candidateES = predNode.EF + pred.lag;
          node.ES = Math.max(node.ES, candidateES);
          break;
        case "SS":
          candidateES = predNode.ES + pred.lag;
          node.ES = Math.max(node.ES, candidateES);
          break;
        case "FF":
          candidateEF = predNode.EF + pred.lag;
          const impliedEF = Math.max(node.ES + node.duration, candidateEF);
          node.ES = Math.max(node.ES, impliedEF - node.duration);
          break;
        case "SF":
          candidateEF = predNode.ES + pred.lag;
          const impliedEF2 = Math.max(node.ES + node.duration, candidateEF);
          node.ES = Math.max(node.ES, impliedEF2 - node.duration);
          break;
      }
    }
    
    node.EF = node.ES + node.duration;
  }

  let projectFinishDays = 0;
  const allNodes = Array.from(nodes.values());
  for (const node of allNodes) {
    projectFinishDays = Math.max(projectFinishDays, node.EF);
  }
  const projectFinishOffset = projectFinishDays > 0 ? Math.ceil(projectFinishDays) - 1 : 0;
  const projectFinishDate = dateFromWorkingDayOffset(projectStartDate, projectFinishOffset, cal);

  // Backward Pass
  for (const node of allNodes) {
    if (node.successors.length === 0) {
      node.LF = projectFinishDays;
      node.LS = node.LF - node.duration;
    }
  }

  for (let i = sorted.length - 1; i >= 0; i--) {
    const taskId = sorted[i];
    const node = nodes.get(taskId)!;

    for (const succ of node.successors) {
      const succNode = nodes.get(succ.taskId);
      if (!succNode) continue;

      let candidateLF: number;
      let candidateLS: number;

      switch (succ.type) {
        case "FS":
          candidateLF = succNode.LS - succ.lag;
          node.LF = Math.min(node.LF, candidateLF);
          break;
        case "SS":
          candidateLS = succNode.LS - succ.lag;
          const impliedLS = Math.min(node.LF - node.duration, candidateLS);
          node.LF = Math.min(node.LF, impliedLS + node.duration);
          break;
        case "FF":
          candidateLF = succNode.LF - succ.lag;
          node.LF = Math.min(node.LF, candidateLF);
          break;
        case "SF":
          candidateLS = succNode.LF - succ.lag;
          const impliedLS2 = Math.min(node.LF - node.duration, candidateLS);
          node.LF = Math.min(node.LF, impliedLS2 + node.duration);
          break;
      }
    }

    node.LS = node.LF - node.duration;
  }

  const FLOAT_TOLERANCE = 0.0001;
  const results = new Map<number, CPMResult>();
  const finalNodes = Array.from(nodes.values());

  for (const node of finalNodes) {
    node.TF = node.LS - node.ES;
    const hasConnections = node.predecessors.length > 0 || node.successors.length > 0;
    const isCritical = hasConnections && Math.abs(node.TF) <= FLOAT_TOLERANCE;

    results.set(node.id, {
      id: node.id,
      ES: node.ES,
      EF: node.EF,
      LS: node.LS,
      LF: node.LF,
      TF: node.TF,
      isCritical,
      esDate: format(dateFromWorkingDayOffset(projectStartDate, Math.floor(node.ES), cal), "yyyy-MM-dd"),
      efDate: format(dateFromWorkingDayOffset(projectStartDate, node.duration > 0 ? Math.ceil(node.EF) - 1 : Math.floor(node.EF), cal), "yyyy-MM-dd"),
      lsDate: format(dateFromWorkingDayOffset(projectStartDate, Math.floor(node.LS), cal), "yyyy-MM-dd"),
      lfDate: format(dateFromWorkingDayOffset(projectStartDate, node.duration > 0 ? Math.ceil(node.LF) - 1 : Math.floor(node.LF), cal), "yyyy-MM-dd"),
    });
  }

  const criticalPath: number[] = [];
  const criticalNodes = Array.from(nodes.values())
    .filter(n => {
      const hasConnections = n.predecessors.length > 0 || n.successors.length > 0;
      return hasConnections && Math.abs(n.TF) <= FLOAT_TOLERANCE;
    })
    .sort((a, b) => a.ES - b.ES);

  const visited = new Set<number>();
  for (const node of criticalNodes) {
    if (!visited.has(node.id)) {
      criticalPath.push(node.id);
      visited.add(node.id);
    }
  }

  return {
    results,
    criticalPath,
    projectStart: projectStartDate,
    projectFinish: projectFinishDate,
  };
}

export function useCPMResults(
  tasks: CPMTask[],
  dependencies: CPMDependency[],
  calendar?: ResolvedCalendar | null,
): CPMCalculationResult {
  return calculateCPM(tasks, dependencies, calendar);
}
