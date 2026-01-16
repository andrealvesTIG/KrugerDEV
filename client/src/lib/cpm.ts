import { differenceInDays, parseISO, addDays, format } from "date-fns";

export type DependencyType = "finish-to-start" | "start-to-start" | "finish-to-finish" | "start-to-finish" | "FS" | "SS" | "FF" | "SF";

export interface CPMTask {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  isMilestone?: boolean | null;
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
  ES: number; // Earliest Start (days from project start)
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

function getDurationDays(task: CPMTask): number {
  if (task.isMilestone) return 0;
  if (task.durationDays != null && task.durationDays >= 0) return task.durationDays;
  if (task.startDate && task.endDate) {
    const start = parseISO(task.startDate);
    const end = parseISO(task.endDate);
    return Math.max(0, differenceInDays(end, start) + 1);
  }
  return 1; // Default duration
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
        // Found cycle - extract the cycle portion
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

  // Check for cycles first
  for (const id of nodeIds) {
    if (!visited.has(id)) {
      const cycle = detectCycle(nodes, id, visited, recStack, []);
      if (cycle) {
        return { sorted: [], cycle };
      }
    }
  }

  // Now do actual topological sort using Kahn's algorithm
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

export function calculateCPM(tasks: CPMTask[], dependencies: CPMDependency[]): CPMCalculationResult {
  if (tasks.length === 0) {
    return {
      results: new Map(),
      criticalPath: [],
      projectStart: new Date(),
      projectFinish: new Date(),
    };
  }

  // Filter tasks with valid dates
  const validTasks = tasks.filter(t => t.startDate && t.endDate);
  if (validTasks.length === 0) {
    return {
      results: new Map(),
      criticalPath: [],
      projectStart: new Date(),
      projectFinish: new Date(),
    };
  }

  // Determine project start date (earliest start among all tasks)
  const projectStartDate = validTasks.reduce((min, t) => {
    const start = parseISO(t.startDate!);
    return start < min ? start : min;
  }, parseISO(validTasks[0].startDate!));

  // Build dependency graph
  const nodes = new Map<number, GraphNode>();
  const taskMap = new Map<number, CPMTask>();

  for (const task of validTasks) {
    taskMap.set(task.id, task);
    const duration = getDurationDays(task);
    
    // Check if task has pinned/fixed constraint
    let isPinned = false;
    let pinnedStart: number | undefined;
    if (task.constraintType && task.constraintDate) {
      const constraintDate = parseISO(task.constraintDate);
      if (task.constraintType === "Must Start On" || task.constraintType === "Start No Earlier Than") {
        isPinned = true;
        pinnedStart = differenceInDays(constraintDate, projectStartDate);
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

  // Build predecessor/successor relationships
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

  // Topological sort with cycle detection
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

  // Forward Pass: Calculate ES and EF
  for (const taskId of sorted) {
    const node = nodes.get(taskId)!;
    
    // If pinned, use pinned start
    if (node.isPinned && node.pinnedStart !== undefined) {
      node.ES = Math.max(node.ES, node.pinnedStart);
    }
    
    // If no predecessors, ES starts at 0 (or pinned date)
    if (node.predecessors.length === 0 && !node.isPinned) {
      // Use task's actual start date relative to project start
      const task = taskMap.get(taskId)!;
      node.ES = differenceInDays(parseISO(task.startDate!), projectStartDate);
    }
    
    // Calculate from predecessors
    for (const pred of node.predecessors) {
      const predNode = nodes.get(pred.taskId);
      if (!predNode) continue;

      let candidateES: number;
      let candidateEF: number;

      switch (pred.type) {
        case "FS": // Finish-to-Start: successor starts after predecessor finishes + lag
          candidateES = predNode.EF + pred.lag;
          node.ES = Math.max(node.ES, candidateES);
          break;
        case "SS": // Start-to-Start: successor starts after predecessor starts + lag
          candidateES = predNode.ES + pred.lag;
          node.ES = Math.max(node.ES, candidateES);
          break;
        case "FF": // Finish-to-Finish: successor finishes after predecessor finishes + lag
          candidateEF = predNode.EF + pred.lag;
          // EF = max(EF, pred.EF + lag), then ES = EF - duration
          const impliedEF = Math.max(node.ES + node.duration, candidateEF);
          node.ES = Math.max(node.ES, impliedEF - node.duration);
          break;
        case "SF": // Start-to-Finish: successor finishes after predecessor starts + lag
          candidateEF = predNode.ES + pred.lag;
          const impliedEF2 = Math.max(node.ES + node.duration, candidateEF);
          node.ES = Math.max(node.ES, impliedEF2 - node.duration);
          break;
      }
    }
    
    node.EF = node.ES + node.duration;
  }

  // Find project finish (maximum EF)
  let projectFinishDays = 0;
  const allNodes = Array.from(nodes.values());
  for (const node of allNodes) {
    projectFinishDays = Math.max(projectFinishDays, node.EF);
  }
  const projectFinishDate = addDays(projectStartDate, projectFinishDays);

  // Backward Pass: Calculate LS and LF
  // Initialize terminal tasks (no successors) with LF = project finish
  for (const node of allNodes) {
    if (node.successors.length === 0) {
      node.LF = projectFinishDays;
      node.LS = node.LF - node.duration;
    }
  }

  // Traverse in reverse topological order
  for (let i = sorted.length - 1; i >= 0; i--) {
    const taskId = sorted[i];
    const node = nodes.get(taskId)!;

    // Calculate from successors
    for (const succ of node.successors) {
      const succNode = nodes.get(succ.taskId);
      if (!succNode) continue;

      let candidateLF: number;
      let candidateLS: number;

      switch (succ.type) {
        case "FS": // Finish-to-Start: pred must finish before succ starts - lag
          candidateLF = succNode.LS - succ.lag;
          node.LF = Math.min(node.LF, candidateLF);
          break;
        case "SS": // Start-to-Start: pred must start before succ starts - lag
          candidateLS = succNode.LS - succ.lag;
          // LS = min(LS, succ.LS - lag), then LF = LS + duration
          const impliedLS = Math.min(node.LF - node.duration, candidateLS);
          node.LF = Math.min(node.LF, impliedLS + node.duration);
          break;
        case "FF": // Finish-to-Finish: pred must finish before succ finishes - lag
          candidateLF = succNode.LF - succ.lag;
          node.LF = Math.min(node.LF, candidateLF);
          break;
        case "SF": // Start-to-Finish: pred must start before succ finishes - lag
          candidateLS = succNode.LF - succ.lag;
          const impliedLS2 = Math.min(node.LF - node.duration, candidateLS);
          node.LF = Math.min(node.LF, impliedLS2 + node.duration);
          break;
      }
    }

    node.LS = node.LF - node.duration;
  }

  // Calculate Total Float and determine critical tasks
  const FLOAT_TOLERANCE = 0.0001;
  const results = new Map<number, CPMResult>();
  const finalNodes = Array.from(nodes.values());

  for (const node of finalNodes) {
    node.TF = node.LS - node.ES;
    const isCritical = Math.abs(node.TF) <= FLOAT_TOLERANCE;

    results.set(node.id, {
      id: node.id,
      ES: node.ES,
      EF: node.EF,
      LS: node.LS,
      LF: node.LF,
      TF: node.TF,
      isCritical,
      esDate: format(addDays(projectStartDate, node.ES), "yyyy-MM-dd"),
      efDate: format(addDays(projectStartDate, node.EF), "yyyy-MM-dd"),
      lsDate: format(addDays(projectStartDate, node.LS), "yyyy-MM-dd"),
      lfDate: format(addDays(projectStartDate, node.LF), "yyyy-MM-dd"),
    });
  }

  // Build critical path chain
  const criticalPath: number[] = [];
  const criticalNodes = Array.from(nodes.values())
    .filter(n => Math.abs(n.TF) <= FLOAT_TOLERANCE)
    .sort((a, b) => a.ES - b.ES);

  // Start from earliest critical task and follow the chain
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

export function useCPMResults(tasks: CPMTask[], dependencies: CPMDependency[]): CPMCalculationResult {
  return calculateCPM(tasks, dependencies);
}
