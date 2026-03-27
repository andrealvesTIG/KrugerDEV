import type { RiskSignal } from "@/components/radar/RadarCanvas";

function seededRandom(seed: number): number {
  let h = seed * 2654435761;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h & 0x7fffffff) / 0x7fffffff;
}

export type SimulationLogAction = "closed" | "mitigated" | "escalated" | "in_progress" | "new_emerged" | "removed";

export interface SimulationLogEntry {
  action: SimulationLogAction;
  signalId: string;
  title: string;
  project: string;
  itemType: "risk" | "issue";
  category: string;
  approximateMonth: number;
  originalRiskScore?: number;
  projectedRiskScore?: number;
  originalCostExposure?: number;
  projectedCostExposure?: number;
  isSimulated: boolean;
}

export interface SimulationResult {
  signals: RiskSignal[];
  closedCount: number;
  newCount: number;
  escalatedCount: number;
  log: SimulationLogEntry[];
}

const SYNTHETIC_TITLE_PREFIXES: Record<string, string[]> = {
  schedule: [
    "Timeline slippage on",
    "Milestone delay for",
    "Schedule overrun in",
    "Deadline risk for",
    "Sprint delay on",
  ],
  budget: [
    "Budget overrun on",
    "Cost escalation for",
    "Funding shortfall in",
    "Expense growth on",
    "Budget variance in",
  ],
  dependency: [
    "Vendor delay for",
    "External dependency on",
    "API integration risk for",
    "Third-party outage in",
    "Supply chain risk for",
  ],
  resource: [
    "Staff shortage on",
    "Resource contention for",
    "Key person risk in",
    "Capacity issue on",
    "Skill gap in",
  ],
  technical: [
    "Tech debt in",
    "Performance issue on",
    "Security vulnerability in",
    "Architecture risk for",
    "Scalability concern in",
  ],
  scope: [
    "Scope creep on",
    "Requirements change in",
    "Feature bloat on",
    "Scope expansion for",
    "Unclear requirements in",
  ],
};

const SIGNAL_TYPES: RiskSignal["type"][] = ["schedule", "budget", "dependency", "resource", "technical", "scope"];

interface DatasetPatterns {
  avgRiskScore: number;
  avgCostExposure: number;
  medianCostExposure: number;
  categoryDistribution: Record<string, number>;
  projectIds: number[];
  projectNames: Map<number, string>;
  projectPortfolios: Map<number, number>;
  portfolioNames: Map<number, string>;
  riskToIssueRatio: number;
  avgImpactScore: number;
  avgProbability: number;
}

function analyzeDatasetPatterns(signals: RiskSignal[]): DatasetPatterns {
  const activeSignals = signals.filter(s => s.status !== "Closed" && s.status !== "Mitigated");
  const n = activeSignals.length || 1;

  let totalRisk = 0;
  let totalCost = 0;
  let totalImpact = 0;
  let totalProb = 0;
  const costs: number[] = [];
  const catCounts: Record<string, number> = {};
  const pIds = new Set<number>();
  const pNames = new Map<number, string>();
  const pPortfolios = new Map<number, number>();
  const pfNames = new Map<number, string>();
  let riskCount = 0;
  let issueCount = 0;

  signals.forEach(s => {
    pIds.add(s.projectId);
    pNames.set(s.projectId, s.project);
    if (s.portfolioId) {
      pPortfolios.set(s.projectId, s.portfolioId);
      if (s.portfolioName) pfNames.set(s.portfolioId, s.portfolioName);
    }
    if (s.itemType === "risk") riskCount++;
    else issueCount++;
    catCounts[s.type] = (catCounts[s.type] || 0) + 1;
  });

  activeSignals.forEach(s => {
    totalRisk += s.riskScore;
    totalImpact += s.impactScore;
    totalProb += s.probability;
    if (s.costExposureRaw > 0) {
      totalCost += s.costExposureRaw;
      costs.push(s.costExposureRaw);
    }
  });

  costs.sort((a, b) => a - b);
  const medianCost = costs.length > 0 ? costs[Math.floor(costs.length / 2)] : 25000;

  return {
    avgRiskScore: totalRisk / n,
    avgCostExposure: costs.length > 0 ? totalCost / costs.length : 25000,
    medianCostExposure: medianCost,
    categoryDistribution: catCounts,
    projectIds: Array.from(pIds),
    projectNames: pNames,
    projectPortfolios: pPortfolios,
    portfolioNames: pfNames,
    riskToIssueRatio: riskCount / Math.max(issueCount, 1),
    avgImpactScore: totalImpact / n,
    avgProbability: totalProb / n,
  };
}

interface ProjectionResult {
  signal: RiskSignal | null;
  escalated: boolean;
}

function projectExistingSignal(
  signal: RiskSignal,
  timeProjectionMonths: number,
  projectionOffsetDays: number
): ProjectionResult {
  const projected = signal.timeOffsetDays - projectionOffsetDays;
  const isAlreadyResolved = signal.status === "Closed" || signal.status === "Mitigated";

  if (isAlreadyResolved) {
    return { signal: { ...signal, timeOffsetDays: projected }, escalated: false };
  }

  const numericId = parseInt(signal.id.replace(/^(issue|risk)-/, "")) || 0;
  const h = seededRandom(numericId + 7777);
  const resolveMonth = 1 + h * 10;
  const fate = seededRandom(numericId + 3333);
  const escalateSeed = seededRandom(numericId + 5555);

  if (timeProjectionMonths >= resolveMonth) {
    const monthsPastResolve = timeProjectionMonths - resolveMonth;

    if (fate < 0.3) {
      const fadeProgress = Math.min(monthsPastResolve / 1.5, 1);
      if (fadeProgress >= 1 && seededRandom(numericId + 1111) < 0.8) {
        return { signal: null, escalated: false };
      }
      return {
        signal: {
          ...signal,
          timeOffsetDays: projected,
          status: "Closed",
          riskScore: Math.round(signal.riskScore * (1 - fadeProgress)),
          confidence: signal.confidence * (1 - fadeProgress * 0.8),
        },
        escalated: false,
      };
    } else if (fate < 0.6) {
      return {
        signal: {
          ...signal,
          timeOffsetDays: Math.max(projected, -85),
          status: "Mitigated",
          riskScore: Math.max(5, Math.round(signal.riskScore * 0.3)),
        },
        escalated: false,
      };
    } else if (fate < 0.75 && escalateSeed > 0.4) {
      const escalation = 1 + escalateSeed * 0.4;
      return {
        signal: {
          ...signal,
          timeOffsetDays: Math.max(projected, -85),
          status: "In Progress",
          riskScore: Math.min(100, Math.round(signal.riskScore * escalation)),
          costExposureRaw: signal.costExposureRaw > 0
            ? Math.round(signal.costExposureRaw * (1 + escalateSeed * 0.3))
            : signal.costExposureRaw,
          costExposure: signal.costExposure != null && signal.costExposure > 0
            ? Math.round(signal.costExposure * (1 + escalateSeed * 0.3))
            : signal.costExposure,
        },
        escalated: true,
      };
    }
  }

  const progressSeed = seededRandom(numericId + 4444);
  if (timeProjectionMonths > 0.5 && progressSeed < 0.3) {
    return {
      signal: {
        ...signal,
        timeOffsetDays: Math.max(projected, -85),
        status: "In Progress",
      },
      escalated: false,
    };
  }

  return {
    signal: {
      ...signal,
      timeOffsetDays: Math.max(projected, -85),
    },
    escalated: false,
  };
}

function generateSyntheticSignal(
  index: number,
  monthOffset: number,
  patterns: DatasetPatterns,
  timeProjectionMonths: number
): RiskSignal {
  const seed = index * 31337 + Math.round(monthOffset * 1000);
  const r1 = seededRandom(seed);
  const r2 = seededRandom(seed + 1);
  const r3 = seededRandom(seed + 2);
  const r4 = seededRandom(seed + 3);
  const r5 = seededRandom(seed + 4);
  const r6 = seededRandom(seed + 5);
  const r7 = seededRandom(seed + 6);

  const catKeys = Object.keys(patterns.categoryDistribution);
  const totalCatWeight = Object.values(patterns.categoryDistribution).reduce((a, b) => a + b, 0);
  let cumWeight = 0;
  let selectedType: RiskSignal["type"] = "technical";
  for (const key of catKeys) {
    cumWeight += patterns.categoryDistribution[key];
    if (r1 <= cumWeight / totalCatWeight) {
      selectedType = key as RiskSignal["type"];
      break;
    }
  }
  if (!SIGNAL_TYPES.includes(selectedType)) {
    selectedType = SIGNAL_TYPES[Math.floor(r1 * SIGNAL_TYPES.length)];
  }

  const titles = SYNTHETIC_TITLE_PREFIXES[selectedType] || SYNTHETIC_TITLE_PREFIXES.technical;
  const titleIdx = Math.floor(r2 * titles.length);
  const projIdx = Math.floor(r3 * patterns.projectIds.length);
  const projectId = patterns.projectIds[projIdx] || 1;
  const projectName = patterns.projectNames.get(projectId) || "Unknown Project";
  const portfolioId = patterns.projectPortfolios.get(projectId);
  const portfolioName = portfolioId ? patterns.portfolioNames.get(portfolioId) : undefined;

  const baseScore = patterns.avgRiskScore * (0.5 + r4);
  const riskScore = Math.min(100, Math.max(5, Math.round(baseScore)));

  const baseCost = patterns.medianCostExposure * (0.3 + r5 * 2);
  const costExposure = r6 < 0.7 ? Math.round(baseCost) : 0;

  const impactScore = Math.min(100, Math.max(10, Math.round(patterns.avgImpactScore * (0.6 + r4 * 0.8))));
  const probability = Math.min(100, Math.max(10, Math.round(patterns.avgProbability * (0.6 + r7 * 0.8))));
  const confidence = 0.4 + r7 * 0.4;

  const itemType: "risk" | "issue" = r6 < (patterns.riskToIssueRatio / (1 + patterns.riskToIssueRatio)) ? "risk" : "issue";

  const remainingMonths = timeProjectionMonths - monthOffset;
  const initialFutureDays = Math.round(20 + r7 * 60);
  const agedDays = Math.round(remainingMonths * 30.44);
  const timeOffsetDays = Math.max(-85, initialFutureDays - agedDays);

  const title = `${titles[titleIdx]} ${projectName}`;

  return {
    id: `sim-${index}-${Math.round(monthOffset * 10)}`,
    title,
    project: projectName,
    projectId,
    portfolioId,
    portfolioName,
    riskScore,
    timeOffsetDays,
    impactScore,
    probability,
    costExposureNorm: 0,
    costExposureRaw: costExposure,
    confidence,
    type: selectedType,
    costExposure: costExposure > 0 ? costExposure : null,
    dueDate: null,
    status: "Open",
    itemType,
    isSimulated: true,
  };
}

export function runSimulation(
  allSignals: RiskSignal[],
  timeProjectionMonths: number,
  generateNewItems: boolean = true
): SimulationResult {
  if (timeProjectionMonths === 0) {
    return { signals: allSignals, closedCount: 0, newCount: 0, escalatedCount: 0, log: [] };
  }

  const projectionOffsetDays = Math.round(timeProjectionMonths * 30.44);
  const patterns = analyzeDatasetPatterns(allSignals);

  let closedCount = 0;
  let escalatedCount = 0;
  const projectedSignals: RiskSignal[] = [];
  const log: SimulationLogEntry[] = [];

  for (const signal of allSignals) {
    const isAlreadyResolved = signal.status === "Closed" || signal.status === "Mitigated";
    const { signal: projected, escalated } = projectExistingSignal(signal, timeProjectionMonths, projectionOffsetDays);

    if (projected === null) {
      closedCount++;
      const numericId = parseInt(signal.id.replace(/^(issue|risk)-/, "")) || 0;
      const resolveMonth = 1 + seededRandom(numericId + 7777) * 10;
      log.push({
        action: "removed",
        signalId: signal.id,
        title: signal.title,
        project: signal.project,
        itemType: signal.itemType,
        category: signal.type,
        approximateMonth: Math.round(resolveMonth * 10) / 10,
        originalRiskScore: signal.riskScore,
        originalCostExposure: signal.costExposure ?? undefined,
        isSimulated: false,
      });
      continue;
    }

    if (!isAlreadyResolved && (projected.status === "Closed" || projected.status === "Mitigated")) {
      closedCount++;
      const numericId = parseInt(signal.id.replace(/^(issue|risk)-/, "")) || 0;
      const resolveMonth = 1 + seededRandom(numericId + 7777) * 10;
      log.push({
        action: projected.status === "Closed" ? "closed" : "mitigated",
        signalId: signal.id,
        title: signal.title,
        project: signal.project,
        itemType: signal.itemType,
        category: signal.type,
        approximateMonth: Math.round(resolveMonth * 10) / 10,
        originalRiskScore: signal.riskScore,
        projectedRiskScore: projected.riskScore,
        originalCostExposure: signal.costExposure ?? undefined,
        isSimulated: false,
      });
    }

    if (escalated) {
      escalatedCount++;
      const numericId = parseInt(signal.id.replace(/^(issue|risk)-/, "")) || 0;
      const resolveMonth = 1 + seededRandom(numericId + 7777) * 10;
      log.push({
        action: "escalated",
        signalId: signal.id,
        title: signal.title,
        project: signal.project,
        itemType: signal.itemType,
        category: signal.type,
        approximateMonth: Math.round(resolveMonth * 10) / 10,
        originalRiskScore: signal.riskScore,
        projectedRiskScore: projected.riskScore,
        originalCostExposure: signal.costExposure ?? undefined,
        projectedCostExposure: projected.costExposure ?? undefined,
        isSimulated: false,
      });
    }

    if (!isAlreadyResolved && !escalated && projected.status === "In Progress" && signal.status !== "In Progress") {
      log.push({
        action: "in_progress",
        signalId: signal.id,
        title: signal.title,
        project: signal.project,
        itemType: signal.itemType,
        category: signal.type,
        approximateMonth: Math.round(timeProjectionMonths * 0.3 * 10) / 10,
        originalRiskScore: signal.riskScore,
        projectedRiskScore: projected.riskScore,
        isSimulated: false,
      });
    }

    projectedSignals.push(projected);
  }

  let newCount = 0;
  if (generateNewItems && patterns.projectIds.length > 0) {
    const activeCount = allSignals.filter(s => s.status !== "Closed" && s.status !== "Mitigated").length;
    const newItemRate = Math.max(1, Math.round(activeCount * 0.08));
    const totalNewItems = Math.round(newItemRate * timeProjectionMonths);
    const interval = timeProjectionMonths / Math.max(totalNewItems, 1);

    for (let i = 0; i < totalNewItems; i++) {
      const monthOffset = interval * (i + 0.5);
      if (monthOffset > timeProjectionMonths) break;

      const synth = generateSyntheticSignal(i, monthOffset, patterns, timeProjectionMonths);
      projectedSignals.push(synth);
      newCount++;

      log.push({
        action: "new_emerged",
        signalId: synth.id,
        title: synth.title,
        project: synth.project,
        itemType: synth.itemType,
        category: synth.type,
        approximateMonth: Math.round(monthOffset * 10) / 10,
        projectedRiskScore: synth.riskScore,
        projectedCostExposure: synth.costExposure ?? undefined,
        isSimulated: true,
      });
    }
  }

  log.sort((a, b) => a.approximateMonth - b.approximateMonth);

  return { signals: projectedSignals, closedCount, newCount, escalatedCount, log };
}

export interface ExposureDataPoint {
  month: string;
  projectCost: number;
  existingExposure: number;
  simulatedExposure: number;
  totalExposure: number;
  cumulativeExposure: number;
  cumulativeBudgetPlusExposure: number;
  riskTypeExposure: number;
  issueTypeExposure: number;
  combined: number;
}

export function runExposureSimulation(
  allSignals: RiskSignal[],
  maxMonths: number,
  generateNewItems: boolean = true,
  projectBudgets?: Map<number, number>
): ExposureDataPoint[] {
  let totalProjectCost = 0;
  if (projectBudgets && projectBudgets.size > 0) {
    const involvedProjectIds = new Set<number>();
    allSignals.forEach(s => involvedProjectIds.add(s.projectId));
    involvedProjectIds.forEach(pid => {
      totalProjectCost += projectBudgets.get(pid) || 0;
    });
  }

  const result: ExposureDataPoint[] = [];
  let cumulativeExposure = 0;

  for (let m = 0; m <= maxMonths; m += 1) {
    const sim = runSimulation(allSignals, m, generateNewItems);
    let existingExposure = 0;
    let simulatedExposure = 0;
    let riskTypeExposure = 0;
    let issueTypeExposure = 0;

    sim.signals.forEach(s => {
      const ce = s.costExposure ?? 0;
      if (ce <= 0) return;
      if (s.status === "Closed" || s.status === "Mitigated") return;

      if (s.isSimulated) simulatedExposure += ce;
      else existingExposure += ce;

      if (s.itemType === "risk") riskTypeExposure += ce;
      else issueTypeExposure += ce;
    });

    const totalExposure = existingExposure + simulatedExposure;
    cumulativeExposure += totalExposure;

    result.push({
      month: `+${m}mo`,
      projectCost: Math.round(totalProjectCost),
      existingExposure: Math.round(existingExposure),
      simulatedExposure: Math.round(simulatedExposure),
      totalExposure: Math.round(totalExposure),
      cumulativeExposure: Math.round(cumulativeExposure),
      cumulativeBudgetPlusExposure: Math.round(totalProjectCost + cumulativeExposure),
      riskTypeExposure: Math.round(riskTypeExposure),
      issueTypeExposure: Math.round(issueTypeExposure),
      combined: Math.round(totalProjectCost + totalExposure),
    });
  }

  return result;
}
