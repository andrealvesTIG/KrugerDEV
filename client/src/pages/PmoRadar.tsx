import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useProjects } from "@/hooks/use-projects";
import { useTheme } from "@/components/theme-provider";
import { Zap, Radio, AlertTriangle, Shield, Activity, Clock } from "lucide-react";
import RadarCanvas, { type RiskSignal, type HorizontalMetric } from "@/components/radar/RadarCanvas";
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
  const h1 = hashId(risk.id);
  const h2 = hashId(risk.id + 9999);
  const jitter = (h1 - 0.5) * 20;

  if (risk.dueDate) {
    const due = new Date(risk.dueDate);
    const days = Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(-85, Math.min(85, days + Math.round(jitter * 0.3)));
  }

  if (risk.proximity) {
    const proximityMap: Record<string, number> = {
      "Imminent": 7,
      "Near-term": 25,
      "Mid-term": 50,
      "Long-term": 80,
    };
    const base = proximityMap[risk.proximity] || 30;
    return Math.round(base + jitter * 0.8);
  }

  const createdAtRaw = risk.createdAt ? new Date(risk.createdAt) : null;
  const createdAt = createdAtRaw && !isNaN(createdAtRaw.getTime()) ? createdAtRaw : null;
  const ageInDays = createdAt
    ? Math.max(0, Math.round((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (risk.status === "Closed" || risk.status === "Mitigated") {
    const ageFactor = Math.min(ageInDays / 180, 1);
    const base = -10 - ageFactor * 70;
    return Math.max(-85, Math.round(base + jitter * 0.5));
  }

  if (createdAt) {
    let offset: number;
    if (ageInDays <= 7) {
      offset = 30 + h2 * 40 + jitter * 0.6;
    } else if (ageInDays <= 30) {
      offset = 15 + h2 * 30 + jitter * 0.7;
    } else if (ageInDays <= 90) {
      const drift = h2 < 0.5 ? (5 + h2 * 20) : (-5 - (h2 - 0.5) * 20);
      offset = drift + jitter * 0.8;
    } else {
      const ageFactor = Math.min((ageInDays - 90) / 180, 1);
      offset = -8 - ageFactor * 50 - h2 * 15 + jitter * 0.4;
    }
    return Math.max(-85, Math.min(85, Math.round(offset)));
  }

  return Math.max(-85, Math.min(85, Math.round((h2 - 0.5) * 60 + jitter)));
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

  const rawCost = parseFloat(risk.impactCost) || 0;

  return {
    id: String(risk.id),
    title: risk.title || "Untitled Risk",
    project: projectsMap.get(risk.projectId) || "Unknown Project",
    riskScore: Math.min(riskScore, 100),
    timeOffsetDays: computeTimeOffsetDays(risk),
    impactScore: impScore,
    probability: probScore,
    impactCost: rawCost,
    impactCostRaw: rawCost,
    confidence: computeConfidence(risk),
    type: CATEGORY_TYPE_MAP[risk.category] || "technical",
    portfolioId: projectPortfolioMap?.get(risk.projectId),
  };
}

export default function PmoRadar() {
  const { currentOrganization } = useOrganization();
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && (typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true));

  const [filters, setFilters] = useState<RadarFilters>({
    minRiskScore: 0,
    futureOnly: false,
    highRiskOnly: false,
    signalType: "all",
    portfolioId: "all",
  });

  const [selectedSignal, setSelectedSignal] = useState<RiskSignal | null>(null);
  const [simOverrides, setSimOverrides] = useState<Map<string, number>>(new Map());
  const [timeProjectionMonths, setTimeProjectionMonths] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [horizontalMetric, setHorizontalMetric] = useState<HorizontalMetric>("riskScore");

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    const raw = risksData.map((risk: any) => {
      const signal = transformRiskToSignal(risk, projectsMap, projectPortfolioMap);
      const override = simOverrides.get(signal.id);
      if (override !== undefined) {
        return { ...signal, riskScore: override };
      }
      return signal;
    });

    const maxCost = Math.max(1, ...raw.map((s) => s.impactCost));
    return raw.map((s) => ({
      ...s,
      impactCost: maxCost > 0 ? Math.round((s.impactCost / maxCost) * 100) : 0,
    }));
  }, [risksData, projectsMap, projectPortfolioMap, simOverrides]);

  const projectionOffsetDays = Math.round(timeProjectionMonths * 30.44);

  const projectedDate = useMemo(() => {
    const d = new Date(currentTime);
    d.setDate(d.getDate() + projectionOffsetDays);
    return d;
  }, [currentTime, projectionOffsetDays]);

  const projectedSignals = useMemo(() => {
    if (projectionOffsetDays === 0) return allSignals;
    return allSignals.map((s) => ({
      ...s,
      timeOffsetDays: s.timeOffsetDays - projectionOffsetDays,
    }));
  }, [allSignals, projectionOffsetDays]);

  const filteredSignals = useMemo(() => {
    return projectedSignals.filter((s: EnrichedSignal) => {
      if (s.riskScore < filters.minRiskScore) return false;
      if (filters.futureOnly && s.timeOffsetDays < 0) return false;
      if (filters.highRiskOnly && s.riskScore <= 70) return false;
      if (filters.signalType !== "all" && s.type !== filters.signalType) return false;
      if (filters.portfolioId !== "all") {
        if (!s.portfolioId || String(s.portfolioId) !== filters.portfolioId) return false;
      }
      return true;
    });
  }, [projectedSignals, filters]);

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

  const pageBg = isDark ? "bg-[#0f172a]" : "bg-slate-100";
  const headerBg = isDark ? "bg-slate-900/60 border-green-500/10" : "bg-white/80 border-green-600/10";
  const titleColor = isDark ? "text-green-400" : "text-green-700";
  const statBg = isDark ? "bg-slate-800/80 border-slate-700/50" : "bg-white border-slate-200";
  const statLabel = isDark ? "text-slate-400" : "text-slate-500";
  const accentGreen = isDark ? "text-green-400" : "text-green-600";
  const accentRed = isDark ? "text-red-400" : "text-red-600";
  const accentYellow = isDark ? "text-yellow-400" : "text-yellow-600";
  const simBtnCls = isDark
    ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
    : "bg-green-500/10 border-green-500/30 text-green-700 hover:bg-green-500/20";

  const clockStr = currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = currentTime.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

  const projectedDateStr = timeProjectionMonths > 0
    ? projectedDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : null;

  const centerLabel = timeProjectionMonths > 0
    ? projectedDate.toLocaleDateString([], { month: "short", year: "numeric" })
    : undefined;

  return (
    <div className={`flex flex-col h-full w-full ${pageBg}`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${headerBg}`}>
        <div className="flex items-center gap-3">
          <Radio className={`w-5 h-5 animate-pulse ${titleColor}`} />
          <h1 className={`text-lg font-semibold tracking-wider uppercase ${titleColor}`}>
            PMO Radar
          </h1>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ml-2 ${statBg}`}>
            <Clock className={`w-3.5 h-3.5 ${accentGreen}`} />
            <div className="flex flex-col leading-none">
              <span className={`text-xs font-mono font-semibold ${accentGreen}`}>{clockStr}</span>
              <span className={`text-[10px] ${statLabel}`}>{dateStr}</span>
            </div>
          </div>
          {timeProjectionMonths > 0 && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${isDark ? "bg-amber-500/10 border-amber-500/30" : "bg-amber-50 border-amber-300"}`}>
              <span className={`text-xs font-semibold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                Projecting: {projectedDateStr}
              </span>
              <span className={`text-[10px] ${isDark ? "text-amber-500/70" : "text-amber-500"}`}>
                (+{timeProjectionMonths}mo)
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-xs">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${statBg}`}>
              <Activity className={`w-3.5 h-3.5 ${accentGreen}`} />
              <span className={statLabel}>Signals:</span>
              <span className={`font-semibold ${accentGreen}`}>{stats.total}</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${statBg}`}>
              <AlertTriangle className={`w-3.5 h-3.5 ${accentRed}`} />
              <span className={statLabel}>High:</span>
              <span className={`font-semibold ${accentRed}`}>{stats.high}</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${statBg}`}>
              <Shield className={`w-3.5 h-3.5 ${accentYellow}`} />
              <span className={statLabel}>Med:</span>
              <span className={`font-semibold ${accentYellow}`}>{stats.medium}</span>
            </div>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${statBg}`}>
              <Shield className={`w-3.5 h-3.5 ${accentGreen}`} />
              <span className={statLabel}>Low:</span>
              <span className={`font-semibold ${accentGreen}`}>{stats.low}</span>
            </div>
          </div>
          <button
            onClick={handleSimulateUpdate}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${simBtnCls}`}
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
          isDark={isDark}
          timeProjectionMonths={timeProjectionMonths}
          onTimeProjectionChange={setTimeProjectionMonths}
          horizontalMetric={horizontalMetric}
          onHorizontalMetricChange={setHorizontalMetric}
        />

        <div className="flex-1 relative p-2 min-w-0">
          <RadarCanvas signals={filteredSignals} onSignalClick={setSelectedSignal} isDark={isDark} centerLabel={centerLabel} horizontalMetric={horizontalMetric} />
        </div>

        <DetailsDrawer signal={selectedSignal} onClose={() => setSelectedSignal(null)} isDark={isDark} />
      </div>
    </div>
  );
}
