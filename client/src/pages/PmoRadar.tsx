import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useProjects } from "@/hooks/use-projects";
import { Zap, Radio, AlertTriangle, Shield, Activity } from "lucide-react";
import RadarCanvas, { type RiskSignal } from "@/components/radar/RadarCanvas";
import FiltersPanel, { type RadarFilters } from "@/components/radar/FiltersPanel";
import DetailsDrawer from "@/components/radar/DetailsDrawer";

const PROBABILITY_MAP: Record<string, number> = {
  "Very Low": 10,
  "Low": 25,
  "Medium": 50,
  "High": 75,
  "Very High": 90,
};

const IMPACT_MAP: Record<string, number> = {
  "Very Low": 10,
  "Low": 25,
  "Medium": 50,
  "High": 75,
  "Very High": 90,
};

const CATEGORY_TYPE_MAP: Record<string, RiskSignal["type"]> = {
  "Schedule": "schedule",
  "Schedule Risk": "schedule",
  "Budget": "budget",
  "Budget Risk": "budget",
  "Financial": "budget",
  "Dependency": "dependency",
  "Resource": "resource",
  "Resource Risk": "resource",
  "Technical": "technical",
  "Technical Risk": "technical",
  "Scope": "scope",
  "Scope Risk": "scope",
};

function hashId(id: number): number {
  let h = id * 2654435761;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function computeTimeOffsetDays(risk: any): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const jitter = (hashId(risk.id) - 0.5) * 10;

  if (risk.dueDate) {
    const due = new Date(risk.dueDate);
    return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) + Math.round(jitter * 0.3);
  }

  if (risk.proximity) {
    const proximityMap: Record<string, number> = {
      "Imminent": 7,
      "Near-term": 25,
      "Mid-term": 50,
      "Long-term": 80,
    };
    return (proximityMap[risk.proximity] || 30) + Math.round(jitter);
  }

  if (risk.status === "Closed" || risk.status === "Mitigated") {
    const created = new Date(risk.createdAt || now);
    const daysSince = Math.round((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return -Math.min(daysSince, 85) + Math.round(jitter * 0.5);
  }

  if (risk.createdAt) {
    const created = new Date(risk.createdAt);
    const daysSinceCreated = Math.round((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

    const probWeight = risk.probability === "Very High" ? 0.9
      : risk.probability === "High" ? 0.7
      : risk.probability === "Medium" ? 0.5
      : risk.probability === "Low" ? 0.3
      : 0.4;

    if (daysSinceCreated < 14) {
      return Math.round(30 + probWeight * 40 + jitter);
    } else if (daysSinceCreated < 60) {
      return Math.round(10 + probWeight * 25 + jitter);
    } else {
      return Math.round(-10 - (daysSinceCreated / 365) * 40 + jitter);
    }
  }

  return Math.round(jitter * 3);
}

function computeConfidence(risk: any): number {
  let score = 0.5;
  if (risk.probability) score += 0.1;
  if (risk.impact) score += 0.1;
  if (risk.description) score += 0.1;
  if (risk.mitigationPlan) score += 0.1;
  if (risk.category) score += 0.1;
  return Math.min(score, 1);
}

type EnrichedSignal = RiskSignal & { portfolioId?: number };

function transformRiskToSignal(
  risk: any,
  projectsMap: Map<number, string>,
  projectPortfolioMap: Map<number, number>
): EnrichedSignal {
  const probScore = PROBABILITY_MAP[risk.probability] || 50;
  const impScore = IMPACT_MAP[risk.impact] || 50;
  const riskScore = risk.riskScore || Math.round((probScore * impScore) / 100);

  return {
    id: String(risk.id),
    title: risk.title || "Untitled Risk",
    project: projectsMap.get(risk.projectId) || "Unknown Project",
    riskScore: Math.min(riskScore, 100),
    timeOffsetDays: computeTimeOffsetDays(risk),
    impactScore: impScore,
    confidence: computeConfidence(risk),
    type: CATEGORY_TYPE_MAP[risk.category] || "technical",
    portfolioId: projectPortfolioMap?.get(risk.projectId),
  };
}

export default function PmoRadar() {
  const { currentOrganization } = useOrganization();

  const [filters, setFilters] = useState<RadarFilters>({
    minRiskScore: 0,
    futureOnly: false,
    highRiskOnly: false,
    signalType: "all",
    portfolioId: "all",
  });

  const [selectedSignal, setSelectedSignal] = useState<RiskSignal | null>(null);
  const [simOverrides, setSimOverrides] = useState<Map<string, number>>(new Map());

  const { data: portfoliosData } = usePortfolios(currentOrganization?.id);
  const portfolios = portfoliosData || [];

  const { data: projectsDataRaw } = useProjects(currentOrganization?.id);
  const projectsData = projectsDataRaw || [];

  const { data: risksData = [] } = useQuery<any[]>({
    queryKey: [`/api/issues?itemType=risk&organizationId=${currentOrganization?.id}`],
    enabled: !!currentOrganization?.id,
  });

  const projectsMap = useMemo(() => {
    const m = new Map<number, string>();
    projectsData.forEach((p: any) => m.set(p.id, p.name));
    return m;
  }, [projectsData]);

  const projectPortfolioMap = useMemo(() => {
    const m = new Map<number, number>();
    projectsData.forEach((p: any) => {
      if (p.portfolioId) m.set(p.id, p.portfolioId);
    });
    return m;
  }, [projectsData]);

  const allSignals = useMemo(() => {
    return risksData.map((risk: any) => {
      const signal = transformRiskToSignal(risk, projectsMap, projectPortfolioMap);
      const override = simOverrides.get(signal.id);
      if (override !== undefined) {
        return { ...signal, riskScore: override };
      }
      return signal;
    });
  }, [risksData, projectsMap, projectPortfolioMap, simOverrides]);

  const filteredSignals = useMemo(() => {
    return allSignals.filter((s: EnrichedSignal) => {
      if (s.riskScore < filters.minRiskScore) return false;
      if (filters.futureOnly && s.timeOffsetDays < 0) return false;
      if (filters.highRiskOnly && s.riskScore <= 70) return false;
      if (filters.signalType !== "all" && s.type !== filters.signalType) return false;
      if (filters.portfolioId !== "all") {
        if (!s.portfolioId || String(s.portfolioId) !== filters.portfolioId) return false;
      }
      return true;
    });
  }, [allSignals, filters]);

  const stats = useMemo(() => {
    const total = filteredSignals.length;
    const high = filteredSignals.filter((s) => s.riskScore > 70).length;
    const medium = filteredSignals.filter((s) => s.riskScore > 30 && s.riskScore <= 70).length;
    const low = filteredSignals.filter((s) => s.riskScore <= 30).length;
    const future = filteredSignals.filter((s) => s.timeOffsetDays > 0).length;
    return { total, high, medium, low, future };
  }, [filteredSignals]);

  const handleSimulateUpdate = useCallback(() => {
    const newOverrides = new Map(simOverrides);
    const count = Math.min(5, allSignals.length);
    const indices = new Set<number>();
    while (indices.size < count && indices.size < allSignals.length) {
      indices.add(Math.floor(Math.random() * allSignals.length));
    }
    indices.forEach((i) => {
      const signal = allSignals[i];
      const delta = Math.round((Math.random() - 0.3) * 30);
      const newScore = Math.max(0, Math.min(100, signal.riskScore + delta));
      newOverrides.set(signal.id, newScore);
    });
    setSimOverrides(newOverrides);
  }, [allSignals, simOverrides]);

  return (
    <div className="flex flex-col h-full w-full" style={{ backgroundColor: "#0f172a" }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-green-500/10 bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-green-400 animate-pulse" />
          <h1 className="text-lg font-semibold text-green-400 tracking-wider uppercase">
            PMO Radar
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/50">
              <Activity className="w-3.5 h-3.5 text-green-400" />
              <span className="text-slate-400">Signals:</span>
              <span className="text-green-400 font-semibold">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/50">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-slate-400">High:</span>
              <span className="text-red-400 font-semibold">{stats.high}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/50">
              <Shield className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-slate-400">Med:</span>
              <span className="text-yellow-400 font-semibold">{stats.medium}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/50">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              <span className="text-slate-400">Low:</span>
              <span className="text-green-400 font-semibold">{stats.low}</span>
            </div>
          </div>
          <button
            onClick={handleSimulateUpdate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Simulate Update
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        <FiltersPanel
          filters={filters}
          onChange={setFilters}
          portfolios={portfolios.map((p: any) => ({ id: p.id, name: p.name }))}
        />

        <div className="flex-1 relative p-4 min-w-0">
          <RadarCanvas signals={filteredSignals} onSignalClick={setSelectedSignal} />
        </div>

        <DetailsDrawer signal={selectedSignal} onClose={() => setSelectedSignal(null)} />
      </div>
    </div>
  );
}
