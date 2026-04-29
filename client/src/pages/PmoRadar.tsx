import { useState, useEffect, useMemo, useCallback } from "react";
import { formatCurrency } from "@/lib/format";
import { CompactCurrency } from "@/components/CompactCurrency";
import { useQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useProjects } from "@/hooks/use-projects";
import { useUpdateRisk, useRiskHistory, useAiMitigationSuggestion, useDeleteRisk, useConvertRiskToIssue } from "@/hooks/use-risks";
import { useUpdateIssue, useDeleteIssue, useIssueHistory } from "@/hooks/use-issues";
import { useRiskResourceAssignments, useUpdateRiskResourceAssignments, useIssueResourceAssignments, useUpdateIssueResourceAssignments } from "@/hooks/use-resources";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { Radio, Loader2, History, ChevronUp, ChevronDown, FileText } from "lucide-react";
import { ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, ReferenceLine, Area, AreaChart } from "recharts";
import { Link } from "wouter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import RadarCanvas, { type RiskSignal, type HorizontalMetric } from "@/components/radar/RadarCanvas";
import FiltersPanel, { type RadarFilters, type SimulationSummary } from "@/components/radar/FiltersPanel";
import DetailsDrawer from "@/components/radar/DetailsDrawer";
import { runSimulation, runExposureSimulation } from "@/lib/simulationEngine";
import { type SimulationScenario } from "@/lib/simulationScenarios";
import SimulationReportDialog from "@/components/radar/SimulationReportDialog";
import { EditRiskDialog, type RiskFormData } from "@/components/EditRiskDialog";

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

const SEVERITY_MAP: Record<string, number> = {
  "Blocker": 95,
  "Critical": 85,
  "Major": 65,
  "Moderate": 45,
  "Minor": 25,
};

const PRIORITY_SCORE_MAP: Record<string, number> = {
  "Critical": 90,
  "High": 75,
  "Medium": 50,
  "Low": 25,
};

function transformIssueToSignal(
  issue: any,
  projectsMap: Map<number, string>,
  projectPortfolioMap: Map<number, number>,
  portfolioNamesMap: Map<number, string>
): EnrichedSignal {
  const sevScore = SEVERITY_MAP[issue.severity] || 50;
  const priScore = PRIORITY_SCORE_MAP[issue.priority] || 50;
  const impactScore = Math.max(sevScore, priScore);
  const riskScore = Math.round((priScore * sevScore) / 100) || priScore;

  const costExp = issue.impactCost != null ? parseFloat(issue.impactCost) : null;
  const costExpVal = costExp != null && !isNaN(costExp) ? costExp : 0;

  return {
    id: `issue-${issue.id}`,
    title: issue.title || "Untitled Issue",
    project: projectsMap.get(issue.projectId) || "Unknown Project",
    projectId: issue.projectId,
    riskScore: Math.min(riskScore, 100),
    timeOffsetDays: computeTimeOffsetDays({
      ...issue,
      dueDate: issue.targetResolutionDate || issue.dueDate,
    }),
    impactScore,
    probability: priScore,
    costExposureNorm: costExpVal,
    costExposureRaw: costExpVal,
    confidence: computeConfidence(issue),
    type: CATEGORY_TYPE_MAP[issue.category] || "technical",
    costExposure: costExpVal > 0 ? costExpVal : null,
    dueDate: issue.targetResolutionDate || issue.dueDate || null,
    status: issue.status || "Open",
    itemType: "issue",
    portfolioId: projectPortfolioMap?.get(issue.projectId),
    portfolioName: projectPortfolioMap?.get(issue.projectId) && portfolioNamesMap
      ? portfolioNamesMap.get(projectPortfolioMap.get(issue.projectId)!)
      : undefined,
  };
}

type EnrichedSignal = RiskSignal & { portfolioId?: number };

function transformRiskToSignal(
  risk: any,
  projectsMap: Map<number, string>,
  projectPortfolioMap: Map<number, number>,
  portfolioNamesMap: Map<number, string>
): EnrichedSignal {
  const probScore = PROBABILITY_MAP[risk.probability] || 50;
  const impScore = IMPACT_MAP[risk.impact] || 50;
  const riskScore = risk.riskScore || Math.round((probScore * impScore) / 100);

  const costExp = risk.costExposure != null ? parseFloat(risk.costExposure) : null;
  const costExpVal = costExp != null && !isNaN(costExp) ? costExp : 0;

  return {
    id: String(risk.id),
    title: risk.title || "Untitled Risk",
    project: projectsMap.get(risk.projectId) || "Unknown Project",
    projectId: risk.projectId,
    riskScore: Math.min(riskScore, 100),
    timeOffsetDays: computeTimeOffsetDays(risk),
    impactScore: impScore,
    probability: probScore,
    costExposureNorm: costExpVal,
    costExposureRaw: costExpVal,
    confidence: computeConfidence(risk),
    type: CATEGORY_TYPE_MAP[risk.category] || "technical",
    costExposure: costExpVal > 0 ? costExpVal : null,
    dueDate: risk.dueDate || null,
    status: risk.status || "Open",
    itemType: "risk",
    portfolioId: projectPortfolioMap?.get(risk.projectId),
    portfolioName: projectPortfolioMap?.get(risk.projectId) && portfolioNamesMap
      ? portfolioNamesMap.get(projectPortfolioMap.get(risk.projectId)!)
      : undefined,
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
    projectId: "all",
    portfolioId: "all",
    itemType: "all",
  });

  const [selectedSignal, setSelectedSignal] = useState<RiskSignal | null>(null);
  const [simOverrides, setSimOverrides] = useState<Map<string, number>>(new Map());
  const [timeProjectionMonths, setTimeProjectionMonths] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [horizontalMetric, setHorizontalMetric] = useState<HorizontalMetric>("costExposureNorm");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<any>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<any>(null);
  const [issueResourceIds, setIssueResourceIds] = useState<number[]>([]);
  const [showIssueHistory, setShowIssueHistory] = useState(false);
  const [costChartsExpanded, setCostChartsExpanded] = useState(false);
  const [generateNewItems, setGenerateNewItems] = useState(true);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  const handleScenarioLoad = useCallback((scenario: SimulationScenario) => {
    setFilters(scenario.filters);
    setTimeProjectionMonths(scenario.timeProjectionMonths);
    setGenerateNewItems(scenario.generateNewItems);
  }, []);
  const [simulationReportOpen, setSimulationReportOpen] = useState(false);

  const { toast } = useToast();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();
  const convertRiskToIssue = useConvertRiskToIssue();
  const aiMitigationSuggestion = useAiMitigationSuggestion();
  const updateRiskResources = useUpdateRiskResourceAssignments();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const updateIssueResources = useUpdateIssueResourceAssignments();
  const { data: riskHistory, isLoading: historyLoading } = useRiskHistory(editingRisk?.id || 0);
  const { data: riskAssignments } = useRiskResourceAssignments(editingRisk?.id ?? null);
  const { data: issueHistory, isLoading: issueHistoryLoading } = useIssueHistory(editingIssue?.id || 0);
  const { data: issueAssignments } = useIssueResourceAssignments(editingIssue?.id ?? null);

  const issueForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      type: "Bug",
      priority: "Medium",
      status: "Open",
      dueDate: "",
      impactCost: "",
    },
  });

  useEffect(() => {
    if (editingIssue) {
      issueForm.reset({
        title: editingIssue.title || "",
        description: editingIssue.description || "",
        type: editingIssue.type || "Bug",
        priority: editingIssue.priority || "Medium",
        status: editingIssue.status || "Open",
        dueDate: editingIssue.dueDate ? editingIssue.dueDate.split("T")[0] : "",
        impactCost: editingIssue.impactCost ? String(editingIssue.impactCost) : "",
      });
    }
  }, [editingIssue]);

  useEffect(() => {
    if (riskAssignments) {
      setSelectedResourceIds(riskAssignments.map((a: any) => a.resourceId));
    }
  }, [riskAssignments]);

  useEffect(() => {
    if (issueAssignments) {
      setIssueResourceIds(issueAssignments.map((a: any) => a.resourceId));
    }
  }, [issueAssignments]);

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

  const { data: issuesData = [] } = useQuery<any[]>({
    queryKey: [`/api/issues?itemType=issue&organizationId=${currentOrganization?.id}`],
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

  const projectBudgetMap = useMemo(() => {
    const m = new Map<number, number>();
    projectsData.forEach((p: any) => {
      const budget = parseFloat(p.budget) || 0;
      if (budget > 0) m.set(p.id, budget);
    });
    return m;
  }, [projectsData]);

  const portfolioNamesMap = useMemo(() => {
    const m = new Map<number, string>();
    portfolios.forEach((p: any) => m.set(p.id, p.name));
    return m;
  }, [portfolios]);

  const { allSignals, maxCostExposure } = useMemo(() => {
    const riskSignals = risksData.map((risk: any) => {
      const signal = transformRiskToSignal(risk, projectsMap, projectPortfolioMap, portfolioNamesMap);
      const override = simOverrides.get(signal.id);
      if (override !== undefined) {
        return { ...signal, riskScore: override };
      }
      return signal;
    });

    const issueSignals = issuesData.map((issue: any) =>
      transformIssueToSignal(issue, projectsMap, projectPortfolioMap, portfolioNamesMap)
    );

    const raw = [...riskSignals, ...issueSignals];

    const maxCost = Math.max(1, ...raw.map((s) => s.costExposureRaw));
    const normalized = raw.map((s) => ({
      ...s,
      costExposureNorm: maxCost > 0 ? Math.round((s.costExposureRaw / maxCost) * 100) : 0,
    }));
    return { allSignals: normalized, maxCostExposure: maxCost };
  }, [risksData, issuesData, projectsMap, projectPortfolioMap, portfolioNamesMap, simOverrides]);

  const projectionOffsetDays = Math.round(timeProjectionMonths * 30.44);

  const projectedDate = useMemo(() => {
    const d = new Date(currentTime);
    d.setDate(d.getDate() + projectionOffsetDays);
    return d;
  }, [currentTime, projectionOffsetDays]);

  const simulationResult = useMemo(() => {
    return runSimulation(allSignals, timeProjectionMonths, generateNewItems);
  }, [allSignals, timeProjectionMonths, generateNewItems]);

  const projectedSignals = useMemo(() => {
    const sigs = simulationResult.signals;
    if (timeProjectionMonths === 0) return sigs;
    const maxCost = Math.max(1, ...sigs.map(s => s.costExposureRaw));
    return sigs.map(s => ({
      ...s,
      costExposureNorm: maxCost > 0 ? Math.round((s.costExposureRaw / maxCost) * 100) : 0,
    }));
  }, [simulationResult, timeProjectionMonths]);

  const simulationSummary: SimulationSummary = useMemo(() => ({
    closedCount: simulationResult.closedCount,
    newCount: simulationResult.newCount,
    escalatedCount: simulationResult.escalatedCount,
  }), [simulationResult]);

  const reportStats = useMemo(() => {
    const sigs = projectedSignals;
    const total = sigs.length;
    const high = sigs.filter(s => s.riskScore > 70).length;
    const medium = sigs.filter(s => s.riskScore > 30 && s.riskScore <= 70).length;
    const low = sigs.filter(s => s.riskScore <= 30).length;
    let costTotal = 0;
    sigs.forEach(s => {
      const ce = s.costExposure ?? 0;
      if (ce > 0 && s.status !== "Closed" && s.status !== "Mitigated") costTotal += ce;
    });
    return { total, high, medium, low, costTotal };
  }, [projectedSignals]);

  const applyBaseFilters = useCallback((s: EnrichedSignal) => {
    if (filters.itemType !== "all" && s.itemType !== filters.itemType) return false;
    if (s.riskScore < filters.minRiskScore) return false;
    if (filters.highRiskOnly && s.riskScore <= 70) return false;
    if (filters.signalType !== "all" && s.type !== filters.signalType) return false;
    if (filters.projectId !== "all" && String(s.projectId) !== filters.projectId) return false;
    if (filters.portfolioId !== "all") {
      if (!s.portfolioId || String(s.portfolioId) !== filters.portfolioId) return false;
    }
    return true;
  }, [filters]);

  const baseFilteredSignals = useMemo(() => {
    return allSignals.filter(applyBaseFilters);
  }, [allSignals, applyBaseFilters]);

  const filteredSignals = useMemo(() => {
    return projectedSignals.filter((s: EnrichedSignal) => {
      if (!applyBaseFilters(s)) return false;
      if (filters.futureOnly && s.timeOffsetDays < 0) return false;
      return true;
    });
  }, [projectedSignals, filters, applyBaseFilters]);

  const stats = useMemo(() => {
    const total = filteredSignals.length;
    const high = filteredSignals.filter((s) => s.riskScore > 70).length;
    const medium = filteredSignals.filter((s) => s.riskScore > 30 && s.riskScore <= 70).length;
    const low = filteredSignals.filter((s) => s.riskScore <= 30).length;
    const future = filteredSignals.filter((s) => s.timeOffsetDays > 0).length;
    let costExposureFuture = 0;
    let costExposurePast = 0;
    filteredSignals.forEach((s) => {
      const ce = s.costExposure ?? 0;
      if (ce > 0) {
        if (s.timeOffsetDays >= 0) costExposureFuture += ce;
        else costExposurePast += ce;
      }
    });
    const costExposureTotal = costExposureFuture + costExposurePast;
    return { total, high, medium, low, future, costExposureFuture, costExposurePast, costExposureTotal };
  }, [filteredSignals]);

  const costChartData = useMemo(() => {
    const maxSimMonths = Math.max(12, Math.ceil(timeProjectionMonths) + 3);
    const exposureOverSim = runExposureSimulation(baseFilteredSignals, maxSimMonths, generateNewItems, projectBudgetMap);

    return { exposureOverSim };
  }, [timeProjectionMonths, baseFilteredSignals, generateNewItems, projectBudgetMap]);

  const handleEditSignal = useCallback((signal: RiskSignal) => {
    if (signal.itemType === "issue") {
      const rawId = signal.id.replace("issue-", "");
      const issue = issuesData.find((r: any) => String(r.id) === rawId);
      if (issue) {
        setEditingIssue(issue);
        setShowIssueHistory(false);
        setIssueDialogOpen(true);
      }
    } else {
      const risk = risksData.find((r: any) => String(r.id) === signal.id);
      if (risk) {
        setEditingRisk(risk);
        setEditDialogOpen(true);
      }
    }
  }, [risksData, issuesData]);

  const handleIssueSubmit = useCallback((data: any) => {
    if (!editingIssue) return;
    const submitData = { ...data };
    if (!submitData.dueDate) delete submitData.dueDate;
    if (!submitData.impactCost) delete submitData.impactCost;
    updateIssue.mutate({ id: editingIssue.id, projectId: editingIssue.projectId, ...submitData }, {
      onSuccess: () => {
        updateIssueResources.mutate({ issueId: editingIssue.id, resourceIds: issueResourceIds });
        toast({ title: "Success", description: "Issue updated" });
        setIssueDialogOpen(false);
        setEditingIssue(null);
        queryClient.invalidateQueries({ queryKey: [`/api/issues?itemType=issue&organizationId=${currentOrganization?.id}`] });
      },
      onError: (error: any) => {
        toast({ title: "Error", description: error?.message || "Failed to update issue", variant: "destructive" });
      }
    });
  }, [editingIssue, updateIssue, updateIssueResources, issueResourceIds, toast, currentOrganization]);

  const handleRiskSubmit = useCallback((data: RiskFormData) => {
    if (!editingRisk) return;
    updateRisk.mutate({ id: editingRisk.id, projectId: editingRisk.projectId, ...data, costExposure: data.costExposure ? Number(data.costExposure) : null, riskScore: data.riskScore ? Number(data.riskScore) : null }, {
      onSuccess: () => {
        updateRiskResources.mutate({ riskId: editingRisk.id, resourceIds: selectedResourceIds });
        toast({ title: "Success", description: "Item updated" });
        setEditDialogOpen(false);
        setEditingRisk(null);
        queryClient.invalidateQueries({ queryKey: [`/api/issues?itemType=risk&organizationId=${currentOrganization?.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/issues?itemType=issue&organizationId=${currentOrganization?.id}`] });
      },
      onError: (error: any) => {
        toast({ title: "Error", description: error?.message || "Failed to update", variant: "destructive" });
      }
    });
  }, [editingRisk, updateRisk, updateRiskResources, selectedResourceIds, toast, currentOrganization]);

  function formatCompactCurrency(val: number): string {
    return formatCurrency(val, { autoCompact: true });
  }

  const showCostTiles = horizontalMetric === "costExposureNorm";

  const pageBg = isDark ? "bg-[#0f172a]" : "bg-slate-100";
  const headerBg = isDark ? "bg-slate-900/60 border-green-500/10" : "bg-white/80 border-green-600/10";
  const titleColor = isDark ? "text-green-400" : "text-green-700";
  const statBg = isDark ? "bg-slate-800/80 border-slate-700/50" : "bg-white border-slate-200";
  const statLabel = isDark ? "text-slate-400" : "text-slate-500";
  const accentGreen = isDark ? "text-green-400" : "text-green-600";
  const accentRed = isDark ? "text-red-400" : "text-red-600";
  const accentYellow = isDark ? "text-yellow-400" : "text-yellow-600";


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
      <div className={`flex flex-wrap items-center justify-between gap-2 px-3 md:px-4 py-2 border-b shrink-0 ${headerBg}`}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Radio className={`w-4 h-4 md:w-5 md:h-5 animate-pulse shrink-0 ${titleColor}`} />
          <Tooltip>
            <TooltipTrigger asChild>
              <h1 className={`text-sm md:text-lg font-semibold tracking-wider uppercase cursor-default ${titleColor}`}>
                PMO Radar
              </h1>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Risk scanning radar — dots represent risks positioned by time and severity</p></TooltipContent>
          </Tooltip>
          {timeProjectionMonths > 0 && (
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] ${isDark ? "bg-amber-500/10 border-amber-500/30" : "bg-amber-50 border-amber-300"}`}>
              <span className={`font-semibold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                {projectedDateStr}
              </span>
              <span className={isDark ? "text-amber-500/70" : "text-amber-500"}>
                +{timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)}mo
              </span>
            </div>
          )}
          {showCostTiles && costChartData.exposureOverSim.length > 1 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setCostChartsExpanded(!costChartsExpanded)}
                  className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-medium cursor-pointer select-none transition-colors ${
                    costChartsExpanded
                      ? isDark ? "bg-green-500/15 border-green-500/30 text-green-400" : "bg-green-50 border-green-300 text-green-700"
                      : isDark ? "bg-slate-800/60 border-slate-600/30 text-slate-400 hover:text-slate-300" : "bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-600"
                  }`}
                >
                  Charts
                  {costChartsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{costChartsExpanded ? "Hide" : "Show"} cost exposure charts</p></TooltipContent>
            </Tooltip>
          )}
          {timeProjectionMonths > 0 && simulationResult.log.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setSimulationReportOpen(true)}
                  className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-medium cursor-pointer select-none transition-colors ${
                    isDark ? "bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25" : "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  <FileText className="h-3 w-3" />
                  Report
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>View simulation report and export PDF</p></TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 text-xs overflow-x-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-md ${isDark ? "bg-slate-800/80" : "bg-slate-100"} cursor-default`}>
                <span className={`text-xs md:text-sm font-bold ${statLabel}`}>{stats.total}</span>
                <span className={`hidden sm:inline text-xs ${statLabel} opacity-70`}>Total Signals</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Total active risk signals on the radar</p></TooltipContent>
          </Tooltip>

          <div className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-md ${isDark ? "bg-slate-800/80" : "bg-slate-100"}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-red-500 font-bold text-xs md:text-sm cursor-default">{stats.high} <span className="hidden sm:inline font-medium opacity-80 text-xs">High</span></span>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>High severity risks (score &gt; 70)</p></TooltipContent>
            </Tooltip>
            <span className={`text-xs ${statLabel} opacity-40`}>/</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-yellow-500 font-bold text-xs md:text-sm cursor-default">{stats.medium} <span className="hidden sm:inline font-medium opacity-80 text-xs">Med</span></span>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Medium severity risks (score 31-70)</p></TooltipContent>
            </Tooltip>
            <span className={`text-xs ${statLabel} opacity-40`}>/</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-green-500 font-bold text-xs md:text-sm cursor-default">{stats.low} <span className="hidden sm:inline font-medium opacity-80 text-xs">Low</span></span>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Low severity risks (score &le; 30)</p></TooltipContent>
            </Tooltip>
          </div>

          {showCostTiles && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md ${isDark ? "bg-slate-800/80" : "bg-slate-100"} cursor-default`}>
                    <span className={`text-xs ${statLabel} opacity-70`}>Cost Exposure</span>
                    <span className={`font-bold text-sm ${accentGreen}`}><CompactCurrency value={stats.costExposureFuture} /></span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>Cost exposure from upcoming risks (not yet due)</p></TooltipContent>
              </Tooltip>
              {stats.costExposurePast > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md cursor-default ${isDark ? "bg-red-950/40 border border-red-500/20" : "bg-red-50 border border-red-200"}`}>
                      <span className="text-xs text-red-400 opacity-80">Overdue Exposure</span>
                      <span className="font-bold text-sm text-red-500"><CompactCurrency value={stats.costExposurePast} /></span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>Cost exposure from overdue risks (past due date)</p></TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      {showCostTiles && costChartData.exposureOverSim.length > 1 && (
        <div
          className={`shrink-0 border-b overflow-hidden transition-all duration-300 ease-in-out ${isDark ? "bg-slate-900/40 border-green-500/10" : "bg-white/60 border-green-600/10"}`}
          style={{ height: costChartsExpanded ? 210 : 0, opacity: costChartsExpanded ? 1 : 0 }}
        >
            <div className="flex gap-3 h-full px-4 pb-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Exposure Cost (Cumulative)
                    </div>
                    <ResponsiveContainer width="100%" height="85%">
                      <AreaChart data={costChartData.exposureOverSim} margin={{ top: 8, right: 12, bottom: 4, left: 10 }}>
                        <defs>
                          <linearGradient id="existingExpGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isDark ? "#f59e0b" : "#d97706"} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={isDark ? "#f59e0b" : "#d97706"} stopOpacity={0.03} />
                          </linearGradient>
                          <linearGradient id="simulatedExpGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isDark ? "#a78bfa" : "#7c3aed"} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={isDark ? "#a78bfa" : "#7c3aed"} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                        <XAxis dataKey="month" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(costChartData.exposureOverSim.length / 6) - 1)} />
                        <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} width={50} />
                        <RechartsTooltip
                          formatter={(value: number, name: string) => {
                            const labels: Record<string, string> = { existingExposure: "Existing", simulatedExposure: "Simulated", totalExposure: "Total" };
                            return [formatCompactCurrency(value), labels[name] || name];
                          }}
                          contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`, borderRadius: 6, fontSize: 11 }}
                          labelStyle={{ color: isDark ? "#e2e8f0" : "#1e293b" }}
                        />
                        {timeProjectionMonths > 0 && (
                          <ReferenceLine x={`+${Math.round(timeProjectionMonths)}mo`} stroke={isDark ? "#f59e0b" : "#d97706"} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `+${timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)}mo`, position: "top", fill: isDark ? "#f59e0b" : "#d97706", fontSize: 9, fontWeight: 600 }} />
                        )}
                        <Area type="monotone" dataKey="existingExposure" name="existingExposure" stackId="exposure" stroke={isDark ? "#f59e0b" : "#d97706"} strokeWidth={1.5} fill="url(#existingExpGrad)" dot={false} activeDot={{ fill: isDark ? "#f59e0b" : "#d97706", r: 3, stroke: isDark ? "#0f172a" : "#fff", strokeWidth: 2 }} />
                        {generateNewItems && <Area type="monotone" dataKey="simulatedExposure" name="simulatedExposure" stackId="exposure" stroke={isDark ? "#a78bfa" : "#7c3aed"} strokeWidth={1.5} fill="url(#simulatedExpGrad)" dot={false} activeDot={{ fill: isDark ? "#a78bfa" : "#7c3aed", r: 3, stroke: isDark ? "#0f172a" : "#fff", strokeWidth: 2 }} strokeDasharray="3 3" />}
                        <Area type="monotone" dataKey="totalExposure" name="totalExposure" stroke={isDark ? "#22d3ee" : "#0891b2"} strokeWidth={2} fill="none" dot={false} activeDot={{ fill: isDark ? "#22d3ee" : "#0891b2", r: 4, stroke: isDark ? "#0f172a" : "#fff", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={`w-px shrink-0 ${isDark ? "bg-slate-700/50" : "bg-slate-200"}`} />
                  <div className="flex-1 min-w-[180px]">
                    <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 flex items-center gap-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Budget vs Cumulative Exposure
                      {costChartData.exposureOverSim[0]?.projectCost > 0 && (
                        <span className={`text-[9px] font-normal px-1.5 py-0.5 rounded ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
                          Budget: {formatCompactCurrency(costChartData.exposureOverSim[0].projectCost)}
                        </span>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height="85%">
                      <AreaChart data={costChartData.exposureOverSim} margin={{ top: 8, right: 12, bottom: 4, left: 10 }}>
                        <defs>
                          <linearGradient id="cumExpGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isDark ? "#f59e0b" : "#d97706"} stopOpacity={0.35} />
                            <stop offset="95%" stopColor={isDark ? "#f59e0b" : "#d97706"} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                        <XAxis dataKey="month" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(costChartData.exposureOverSim.length / 6) - 1)} />
                        <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} width={50} />
                        <RechartsTooltip
                          formatter={(value: number, name: string) => {
                            const labels: Record<string, string> = { cumulativeExposure: "Cumulative Exposure", projectCost: "Project Budget" };
                            return [formatCompactCurrency(value), labels[name] || name];
                          }}
                          contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`, borderRadius: 6, fontSize: 11 }}
                          labelStyle={{ color: isDark ? "#e2e8f0" : "#1e293b" }}
                        />
                        {timeProjectionMonths > 0 && (
                          <ReferenceLine x={`+${Math.round(timeProjectionMonths)}mo`} stroke={isDark ? "#f59e0b" : "#d97706"} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `+${timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)}mo`, position: "top", fill: isDark ? "#f59e0b" : "#d97706", fontSize: 9, fontWeight: 600 }} />
                        )}
                        {costChartData.exposureOverSim[0]?.projectCost > 0 && (
                          <ReferenceLine y={costChartData.exposureOverSim[0].projectCost} stroke={isDark ? "#3b82f6" : "#2563eb"} strokeDasharray="6 3" strokeWidth={2} label={{ value: `Budget: ${formatCompactCurrency(costChartData.exposureOverSim[0].projectCost)}`, position: "insideTopRight", fill: isDark ? "#3b82f6" : "#2563eb", fontSize: 9, fontWeight: 600 }} />
                        )}
                        <Area type="monotone" dataKey="cumulativeExposure" name="cumulativeExposure" stroke={isDark ? "#f59e0b" : "#d97706"} strokeWidth={2} fill="url(#cumExpGrad)" dot={false} activeDot={{ fill: isDark ? "#f59e0b" : "#d97706", r: 4, stroke: isDark ? "#0f172a" : "#fff", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={`w-px shrink-0 ${isDark ? "bg-slate-700/50" : "bg-slate-200"}`} />
                  <div className="flex-1 min-w-[180px]">
                    <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      Risk vs Issues Exposure
                    </div>
                    <ResponsiveContainer width="100%" height="85%">
                      <AreaChart data={costChartData.exposureOverSim} margin={{ top: 8, right: 12, bottom: 4, left: 10 }}>
                        <defs>
                          <linearGradient id="riskTypeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isDark ? "#f97316" : "#ea580c"} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={isDark ? "#f97316" : "#ea580c"} stopOpacity={0.03} />
                          </linearGradient>
                          <linearGradient id="issueTypeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isDark ? "#3b82f6" : "#2563eb"} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={isDark ? "#3b82f6" : "#2563eb"} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                        <XAxis dataKey="month" tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(costChartData.exposureOverSim.length / 6) - 1)} />
                        <YAxis tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompactCurrency(v)} width={50} />
                        <RechartsTooltip
                          formatter={(value: number, name: string) => {
                            const labels: Record<string, string> = { riskTypeExposure: "Risks", issueTypeExposure: "Issues" };
                            return [formatCompactCurrency(value), labels[name] || name];
                          }}
                          contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`, borderRadius: 6, fontSize: 11 }}
                          labelStyle={{ color: isDark ? "#e2e8f0" : "#1e293b" }}
                        />
                        {timeProjectionMonths > 0 && (
                          <ReferenceLine x={`+${Math.round(timeProjectionMonths)}mo`} stroke={isDark ? "#f59e0b" : "#d97706"} strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `+${timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)}mo`, position: "top", fill: isDark ? "#f59e0b" : "#d97706", fontSize: 9, fontWeight: 600 }} />
                        )}
                        <Area type="monotone" dataKey="riskTypeExposure" name="riskTypeExposure" stroke={isDark ? "#f97316" : "#ea580c"} strokeWidth={2} fill="url(#riskTypeGrad)" dot={false} activeDot={{ fill: isDark ? "#f97316" : "#ea580c", r: 4, stroke: isDark ? "#0f172a" : "#fff", strokeWidth: 2 }} />
                        <Area type="monotone" dataKey="issueTypeExposure" name="issueTypeExposure" stroke={isDark ? "#3b82f6" : "#2563eb"} strokeWidth={2} fill="url(#issueTypeGrad)" dot={false} activeDot={{ fill: isDark ? "#3b82f6" : "#2563eb", r: 4, stroke: isDark ? "#0f172a" : "#fff", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
            </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative">
        <FiltersPanel
          filters={filters}
          onChange={setFilters}
          projects={projectsData.map((p: any) => ({ id: p.id, name: p.name })).sort((a: {name: string}, b: {name: string}) => a.name.localeCompare(b.name))}
          portfolios={portfolios.map((p: any) => ({ id: p.id, name: p.name }))}
          isDark={isDark}
          timeProjectionMonths={timeProjectionMonths}
          onTimeProjectionChange={setTimeProjectionMonths}
          horizontalMetric={horizontalMetric}
          onHorizontalMetricChange={setHorizontalMetric}
          generateNewItems={generateNewItems}
          onGenerateNewItemsChange={setGenerateNewItems}
          simulationSummary={simulationSummary}
          reportStats={reportStats}
          orgId={currentOrganization?.id}
          activeScenarioId={activeScenarioId}
          onScenarioLoad={handleScenarioLoad}
          onScenarioChange={setActiveScenarioId}
        />

        <div className="flex-1 relative p-1 md:p-2 min-w-0 min-h-[300px]">
          <RadarCanvas signals={filteredSignals} onSignalClick={(s) => setSelectedSignal(s)} isDark={isDark} centerLabel={centerLabel} horizontalMetric={horizontalMetric} maxCostExposure={maxCostExposure} />
        </div>

        <DetailsDrawer signal={selectedSignal} onClose={() => setSelectedSignal(null)} isDark={isDark} onEdit={handleEditSignal} />
      </div>

      <EditRiskDialog
        open={editDialogOpen}
        onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingRisk(null); }}
        risk={editingRisk}
        onSubmit={handleRiskSubmit}
        isSubmitting={updateRisk.isPending}
        projectLink={editingRisk ? { name: projectsMap.get(editingRisk.projectId) || "Unknown", id: editingRisk.projectId } : null}
        portfolioLink={editingRisk?.projectId && projectPortfolioMap.get(editingRisk.projectId) ? {
          name: portfolioNamesMap.get(projectPortfolioMap.get(editingRisk.projectId)!) || "Portfolio",
          id: projectPortfolioMap.get(editingRisk.projectId)!,
        } : null}
        organizationId={currentOrganization?.id}
        resourceIds={selectedResourceIds}
        onResourcesChange={setSelectedResourceIds}
        projectName={editingRisk ? projectsMap.get(editingRisk.projectId) : undefined}
        portfolioId={editingRisk?.projectId ? projectPortfolioMap.get(editingRisk.projectId) : undefined}
        portfolioName={editingRisk?.projectId && projectPortfolioMap.get(editingRisk.projectId) ? portfolioNamesMap.get(projectPortfolioMap.get(editingRisk.projectId)!) : undefined}
        onConvertToIssue={() => {
          if (editingRisk) {
            convertRiskToIssue.mutate({ id: editingRisk.id, projectId: editingRisk.projectId }, {
              onSuccess: () => {
                toast({ title: "Success", description: "Risk converted to issue" });
                setEditDialogOpen(false);
                setEditingRisk(null);
                queryClient.invalidateQueries({ queryKey: [`/api/issues?itemType=risk&organizationId=${currentOrganization?.id}`] });
              },
              onError: (err: any) => {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              }
            });
          }
        }}
        isConverting={convertRiskToIssue.isPending}
        history={riskHistory || []}
        historyLoading={historyLoading}
        onAiSuggest={(data) => aiMitigationSuggestion.mutateAsync(data)}
        isAiSuggesting={aiMitigationSuggestion.isPending}
        onDelete={() => {
          if (editingRisk) {
            deleteRisk.mutate({ id: editingRisk.id, projectId: editingRisk.projectId }, {
              onSuccess: () => {
                toast({ title: "Deleted", description: "Risk deleted" });
                setEditDialogOpen(false);
                setEditingRisk(null);
                queryClient.invalidateQueries({ queryKey: [`/api/issues?itemType=risk&organizationId=${currentOrganization?.id}`] });
              }
            });
          }
        }}
        isDeleting={deleteRisk.isPending}
      />

      <Dialog open={issueDialogOpen} onOpenChange={(open) => { setIssueDialogOpen(open); if (!open) setEditingIssue(null); }}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Issue</DialogTitle>
            <DialogDescription>Modify the issue details below.</DialogDescription>
          </DialogHeader>

          {editingIssue && (() => {
            const project = projectsData.find((p: any) => p.id === editingIssue.projectId);
            const portfolio = project?.portfolioId ? portfolios.find((pf: any) => pf.id === project.portfolioId) : null;
            return (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground border-b pb-3">
                <span>Project:</span>
                <Link href={`/projects/${editingIssue.projectId}`} className="text-primary hover:underline font-medium truncate max-w-[200px]" title={project?.name || ""}>
                  {project?.name || `Project #${editingIssue.projectId}`}
                </Link>
                {portfolio && (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    <span>Portfolio:</span>
                    <Link href={`/portfolios/${portfolio.id}`} className="text-primary hover:underline font-medium truncate max-w-[200px]" title={portfolio.name}>
                      {portfolio.name}
                    </Link>
                  </>
                )}
              </div>
            );
          })()}

          <form onSubmit={issueForm.handleSubmit(handleIssueSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-col gap-4 pt-4 flex-1 overflow-y-auto pr-1 [&_input]:focus-visible:ring-offset-0 [&_button[role=combobox]]:focus-visible:ring-offset-0">
              <div className="space-y-1.5 pb-2">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input {...issueForm.register("title")} />
              </div>

              <div className="grid grid-cols-2 gap-3 pb-2">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Controller
                    control={issueForm.control}
                    name="type"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Bug"}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bug">Bug</SelectItem>
                          <SelectItem value="Enhancement">Enhancement</SelectItem>
                          <SelectItem value="Task">Task</SelectItem>
                          <SelectItem value="Question">Question</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Controller
                    control={issueForm.control}
                    name="priority"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pb-2">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Controller
                    control={issueForm.control}
                    name="status"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Open"}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Open">Open</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Resolved">Resolved</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" {...issueForm.register("dueDate")} />
                </div>
              </div>

              <div className="space-y-1.5 pb-2">
                <Label>Cost Exposure ($)</Label>
                <Input type="number" min="0" step="0.01" {...issueForm.register("impactCost")} placeholder="$ amount" />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea {...issueForm.register("description")} />
              </div>

              <ResourceAssignment
                organizationId={currentOrganization?.id || null}
                selectedResourceIds={issueResourceIds}
                onSelectionChange={setIssueResourceIds}
                label="Assigned Resources"
                projectId={editingIssue?.projectId}
              />

              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between px-0 hover:bg-transparent"
                  onClick={() => setShowIssueHistory(!showIssueHistory)}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <History className="h-4 w-4" />
                    Change History
                  </span>
                  {showIssueHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                {showIssueHistory && (
                  <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
                    {issueHistoryLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : issueHistory && issueHistory.length > 0 ? (
                      issueHistory.map((log: any) => (
                        <div key={log.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="font-medium text-foreground">{log.changedByName || 'System'}</span>
                            <span>•</span>
                            <span>{new Date(log.changedAt!).toLocaleDateString()} {new Date(log.changedAt!).toLocaleTimeString()}</span>
                          </div>
                          <div className="mt-1">{log.changeSummary}</div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No change history available</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex justify-between gap-2 pt-4 border-t mt-4 shrink-0">
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (editingIssue) {
                      deleteIssue.mutate({ id: editingIssue.id, projectId: editingIssue.projectId }, {
                        onSuccess: () => {
                          toast({ title: "Deleted", description: "Issue deleted" });
                          setIssueDialogOpen(false);
                          setEditingIssue(null);
                          queryClient.invalidateQueries({ queryKey: [`/api/issues?itemType=issue&organizationId=${currentOrganization?.id}`] });
                        }
                      });
                    }
                  }}
                  disabled={deleteIssue.isPending}
                >
                  {deleteIssue.isPending ? "Deleting..." : "Delete"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIssueDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateIssue.isPending}>
                  {updateIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Issue
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SimulationReportDialog
        open={simulationReportOpen}
        onOpenChange={setSimulationReportOpen}
        log={simulationResult.log}
        summary={simulationSummary}
        timeProjectionMonths={timeProjectionMonths}
        projectedDate={projectedDate}
        totalSignals={reportStats.total}
        totalCostExposure={reportStats.costTotal}
        highCount={reportStats.high}
        mediumCount={reportStats.medium}
        lowCount={reportStats.low}
      />
    </div>
  );
}
