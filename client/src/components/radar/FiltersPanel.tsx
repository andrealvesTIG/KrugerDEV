import { useState, useEffect, useRef, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FastForward, RotateCcw, Play, Pause, SkipBack, PanelLeftClose, PanelLeftOpen, Save, FolderOpen, Trash2, Check, X, Layers } from "lucide-react";
import { type HorizontalMetric, HORIZONTAL_METRICS } from "./RadarCanvas";
import { type SimulationScenario, loadScenarios, saveScenario, deleteScenario } from "@/lib/simulationScenarios";

export type RadarFilters = {
  minRiskScore: number;
  futureOnly: boolean;
  highRiskOnly: boolean;
  signalType: string;
  projectId: string;
  portfolioId: string;
  itemType: string;
};

export interface SimulationSummary {
  closedCount: number;
  newCount: number;
  escalatedCount: number;
}

interface FiltersPanelProps {
  filters: RadarFilters;
  onChange: (filters: RadarFilters) => void;
  projects: { id: number; name: string }[];
  portfolios: { id: number; name: string }[];
  isDark: boolean;
  timeProjectionMonths: number;
  onTimeProjectionChange: (months: number) => void;
  horizontalMetric: HorizontalMetric;
  onHorizontalMetricChange: (metric: HorizontalMetric) => void;
  generateNewItems?: boolean;
  onGenerateNewItemsChange?: (val: boolean) => void;
  simulationSummary?: SimulationSummary;
  reportStats?: { total: number; high: number; medium: number; low: number; costTotal: number };
  orgId?: number;
  activeScenarioId?: string | null;
  onScenarioLoad?: (scenario: SimulationScenario) => void;
  onScenarioChange?: (id: string | null) => void;
}

const SIGNAL_TYPES = [
  { value: "all", label: "All Types" },
  { value: "schedule", label: "Schedule" },
  { value: "budget", label: "Budget" },
  { value: "dependency", label: "Dependency" },
  { value: "resource", label: "Resource" },
  { value: "technical", label: "Technical" },
  { value: "scope", label: "Scope" },
];

const WEEK_IN_MONTHS = 7 / 30.44;
const MAX_WEEKS = Math.round(12 / WEEK_IN_MONTHS);

const PLAYBACK_SPEEDS = [
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 4, label: "4x" },
  { value: 8, label: "8x" },
  { value: 16, label: "16x" },
];

export default function FiltersPanel({ filters, onChange, projects, portfolios, isDark, timeProjectionMonths, onTimeProjectionChange, horizontalMetric, onHorizontalMetricChange, generateNewItems = true, onGenerateNewItemsChange, simulationSummary, reportStats, orgId, activeScenarioId, onScenarioLoad, onScenarioChange }: FiltersPanelProps) {
  const update = (partial: Partial<RadarFilters>) => {
    onChange({ ...filters, ...partial });
  };

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const [scenarios, setScenarios] = useState<SimulationScenario[]>(() => orgId ? loadScenarios(orgId) : []);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showScenarioList, setShowScenarioList] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshScenarios = useCallback(() => {
    if (orgId) {
      setScenarios(loadScenarios(orgId));
    } else {
      setScenarios([]);
    }
  }, [orgId]);

  useEffect(() => {
    refreshScenarios();
    onScenarioChange?.(null);
  }, [orgId]);

  const getPortfolioName = useCallback(() => {
    if (filters.portfolioId === "all") return "All Portfolios";
    const p = portfolios.find(p => String(p.id) === filters.portfolioId);
    return p?.name || "Unknown";
  }, [filters.portfolioId, portfolios]);

  const getProjectName = useCallback(() => {
    if (filters.projectId === "all") return "All Projects";
    const p = projects.find(p => String(p.id) === filters.projectId);
    return p?.name || "Unknown";
  }, [filters.projectId, projects]);

  const handleSaveScenario = () => {
    if (!scenarioName.trim() || !orgId) return;
    const newScenario = saveScenario(orgId, {
      name: scenarioName.trim(),
      description: scenarioDescription.trim(),
      portfolioName: getPortfolioName(),
      projectName: getProjectName(),
      timeProjectionMonths,
      generateNewItems,
      filters,
      summary: {
        totalSignals: reportStats?.total ?? 0,
        closedCount: simulationSummary?.closedCount ?? 0,
        escalatedCount: simulationSummary?.escalatedCount ?? 0,
        newCount: simulationSummary?.newCount ?? 0,
        highCount: reportStats?.high ?? 0,
        mediumCount: reportStats?.medium ?? 0,
        lowCount: reportStats?.low ?? 0,
        costExposure: reportStats?.costTotal ?? 0,
      },
    });
    onScenarioChange?.(newScenario.id);
    setScenarioName("");
    setScenarioDescription("");
    setShowSaveForm(false);
    refreshScenarios();
  };

  const handleLoadScenario = (scenario: SimulationScenario) => {
    onScenarioLoad?.(scenario);
    onScenarioChange?.(scenario.id);
    setShowScenarioList(false);
  };

  const handleDeleteScenario = (id: string) => {
    if (!orgId) return;
    deleteScenario(orgId, id);
    if (activeScenarioId === id) onScenarioChange?.(null);
    setDeletingId(null);
    refreshScenarios();
  };
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monthRef = useRef(timeProjectionMonths);
  const currentWeekRef = useRef(0);

  useEffect(() => {
    monthRef.current = timeProjectionMonths;
    currentWeekRef.current = Math.round(timeProjectionMonths / WEEK_IN_MONTHS);
  }, [timeProjectionMonths]);

  const currentWeek = Math.round(timeProjectionMonths / WEEK_IN_MONTHS);

  const stepToNextWeek = useCallback(() => {
    const nextWeek = currentWeekRef.current + 1;
    if (nextWeek > MAX_WEEKS) {
      onTimeProjectionChange(12);
      setIsPlaying(false);
      return;
    }

    const nextMonths = Math.round(nextWeek * WEEK_IN_MONTHS * 10) / 10;
    currentWeekRef.current = nextWeek;
    onTimeProjectionChange(Math.min(nextMonths, 12));

    const intervalMs = Math.max(50, 800 / playbackSpeed);
    animRef.current = setTimeout(stepToNextWeek, intervalMs);
  }, [playbackSpeed, onTimeProjectionChange]);

  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(50, 800 / playbackSpeed);
      animRef.current = setTimeout(stepToNextWeek, intervalMs);
    } else {
      if (animRef.current) clearTimeout(animRef.current);
    }
    return () => {
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, [isPlaying, stepToNextWeek, playbackSpeed]);

  const handlePlayPause = () => {
    if (timeProjectionMonths >= 12) {
      onTimeProjectionChange(0);
      setTimeout(() => setIsPlaying(true), 50);
    } else {
      setIsPlaying((p) => !p);
    }
  };

  const handleRewind = () => {
    setIsPlaying(false);
    onTimeProjectionChange(0);
  };

  const handleSliderChange = ([val]: number[]) => {
    setIsPlaying(false);
    const snappedWeek = Math.round(val / WEEK_IN_MONTHS);
    const snappedMonths = Math.round(snappedWeek * WEEK_IN_MONTHS * 10) / 10;
    onTimeProjectionChange(Math.min(snappedMonths, 12));
  };

  const panelBg = isDark ? "bg-slate-900/80 border-r border-green-500/10" : "bg-white/90 border-r border-green-600/10";
  const heading = isDark ? "text-green-400" : "text-green-700";
  const labelCls = isDark ? "text-slate-300" : "text-slate-600";
  const subText = isDark ? "text-slate-500" : "text-slate-400";
  const selectTrigger = isDark ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-slate-100 border-slate-300 text-slate-700";
  const selectContent = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200";
  const selectItem = isDark ? "text-slate-300" : "text-slate-700";
  const legendBorder = isDark ? "border-slate-700/50" : "border-slate-200";
  const legendLabel = isDark ? "text-slate-400" : "text-slate-500";
  const projectionActive = timeProjectionMonths > 0 || isPlaying;
  const projectionAccent = isDark ? "text-amber-400" : "text-amber-600";
  const projectionBg = isDark ? "bg-amber-500/5 border border-amber-500/20 rounded-lg p-3" : "bg-amber-50 border border-amber-300/30 rounded-lg p-3";

  const collapsedBtnCls = isDark
    ? "text-slate-400 hover:text-green-400 hover:bg-slate-800"
    : "text-slate-400 hover:text-green-600 hover:bg-slate-100";

  if (collapsed) {
    return (
      <div className={`shrink-0 flex flex-col items-center py-4 px-1.5 gap-3 ${panelBg}`}>
        <button
          onClick={() => setCollapsed(false)}
          className={`p-1.5 rounded transition-colors ${collapsedBtnCls}`}
          title="Expand Filters"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <span className={`text-[10px] font-semibold uppercase tracking-wider writing-mode-vertical ${heading}`}
          style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}
        >
          Filters
        </span>
      </div>
    );
  }

  return (
    <div className={`w-64 shrink-0 p-4 flex flex-col gap-6 overflow-y-auto ${panelBg}`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${heading}`}>
          Filters
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className={`p-1 rounded transition-colors ${collapsedBtnCls}`}
          title="Collapse Filters"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      <div className={projectionActive ? projectionBg : "space-y-2"}>
        <div className="flex items-center justify-between mb-2">
          <Label className={`text-xs font-semibold flex items-center gap-1.5 ${projectionActive ? projectionAccent : labelCls}`}>
            <FastForward className="w-3.5 h-3.5" />
            Time Projection: {timeProjectionMonths === 0 ? "Now" : `+${timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)}mo (Wk ${currentWeek})`}
          </Label>
          {projectionActive && !isPlaying && (
            <button
              onClick={handleRewind}
              className={`p-1 rounded hover:bg-amber-500/20 transition-colors ${projectionAccent}`}
              title="Reset to Now"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
        <Slider
          min={0}
          max={12}
          step={0.1}
          value={[timeProjectionMonths]}
          onValueChange={handleSliderChange}
          className={projectionActive
            ? "[&_[role=slider]]:bg-amber-500 [&_[role=slider]]:border-amber-400"
            : "[&_[role=slider]]:bg-green-500 [&_[role=slider]]:border-green-400"
          }
        />
        <div className={`flex justify-between text-[10px] mt-1 ${subText}`}>
          <span>Now</span>
          <span>6mo</span>
          <span>12mo</span>
        </div>

        <div className="flex items-center gap-1.5 mt-3">
          <button
            onClick={handleRewind}
            className={`p-1.5 rounded transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500"}`}
            title="Rewind to Now"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handlePlayPause}
            className={`p-1.5 rounded-full transition-colors ${
              isPlaying
                ? (isDark ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : "bg-amber-100 text-amber-600 hover:bg-amber-200")
                : (isDark ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-green-100 text-green-600 hover:bg-green-200")
            }`}
            title={isPlaying ? "Pause" : "Play Timeline"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <div className="flex gap-0.5 ml-auto">
            {PLAYBACK_SPEEDS.map((s) => (
              <button
                key={s.value}
                onClick={() => setPlaybackSpeed(s.value)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  playbackSpeed === s.value
                    ? (isDark ? "bg-amber-500/30 text-amber-300" : "bg-amber-200 text-amber-700")
                    : (isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600")
                }`}
                title={`Speed ${s.label}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {isPlaying && (
          <div className={`text-[10px] mt-1 text-center ${projectionAccent}`}>
            Simulating week {currentWeek} of {MAX_WEEKS} at {playbackSpeed}x...
          </div>
        )}

        {onGenerateNewItemsChange && projectionActive && (
          <div className="flex items-center justify-between mt-3">
            <Label className={`text-[11px] ${labelCls}`}>Generate New Items</Label>
            <Switch
              checked={generateNewItems}
              onCheckedChange={onGenerateNewItemsChange}
            />
          </div>
        )}

        {simulationSummary && projectionActive && (simulationSummary.closedCount > 0 || simulationSummary.newCount > 0 || simulationSummary.escalatedCount > 0) && (
          <div className={`mt-3 rounded-md p-2 text-[10px] space-y-1 ${isDark ? "bg-slate-800/60 border border-slate-700/50" : "bg-slate-100 border border-slate-200"}`}>
            <div className={`font-semibold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Simulation Summary
            </div>
            {simulationSummary.closedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isDark ? "bg-green-400" : "bg-green-500"}`} />
                <span className={isDark ? "text-green-400" : "text-green-600"}>
                  {simulationSummary.closedCount} closed/mitigated
                </span>
              </div>
            )}
            {simulationSummary.newCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isDark ? "bg-cyan-400" : "bg-cyan-500"}`} />
                <span className={isDark ? "text-cyan-400" : "text-cyan-600"}>
                  {simulationSummary.newCount} new emerged
                </span>
              </div>
            )}
            {simulationSummary.escalatedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isDark ? "bg-red-400" : "bg-red-500"}`} />
                <span className={isDark ? "text-red-400" : "text-red-600"}>
                  {simulationSummary.escalatedCount} escalated
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`space-y-2 border-t pt-4 ${legendBorder}`}>
        <div className="flex items-center justify-between">
          <Label className={`text-xs font-semibold flex items-center gap-1.5 ${labelCls}`}>
            <Layers className="w-3.5 h-3.5" />
            Scenarios
          </Label>
          <div className="flex gap-1">
            <button
              onClick={() => { setShowSaveForm(!showSaveForm); setShowScenarioList(false); }}
              className={`p-1 rounded transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500"}`}
              title="Save Current Scenario"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setShowScenarioList(!showScenarioList); setShowSaveForm(false); refreshScenarios(); }}
              className={`p-1 rounded transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500"}`}
              title="Load Scenario"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {activeScenarioId && scenarios.find(s => s.id === activeScenarioId) && (
          <div className={`rounded-md p-2 text-[10px] flex items-center justify-between ${isDark ? "bg-green-500/10 border border-green-500/20" : "bg-green-50 border border-green-200"}`}>
            <div>
              <span className={`font-semibold ${isDark ? "text-green-400" : "text-green-700"}`}>
                {scenarios.find(s => s.id === activeScenarioId)?.name}
              </span>
            </div>
            <button
              onClick={() => onScenarioChange?.(null)}
              className={`p-0.5 rounded ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-slate-200 text-slate-500"}`}
              title="Deselect scenario"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {showSaveForm && (
          <div className={`rounded-md p-2.5 space-y-2 ${isDark ? "bg-slate-800/80 border border-slate-700/50" : "bg-slate-50 border border-slate-200"}`}>
            <Input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Scenario name"
              className={`text-xs h-7 ${isDark ? "bg-slate-900 border-slate-600" : "bg-white border-slate-300"}`}
            />
            <Textarea
              value={scenarioDescription}
              onChange={(e) => setScenarioDescription(e.target.value)}
              placeholder="Description (optional)"
              className={`text-xs min-h-[40px] resize-none ${isDark ? "bg-slate-900 border-slate-600" : "bg-white border-slate-300"}`}
              rows={2}
            />
            <div className={`text-[9px] space-y-0.5 ${subText}`}>
              <div>Portfolio: {getPortfolioName()}</div>
              <div>Project: {getProjectName()}</div>
              <div>Projection: +{timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)} months</div>
              {reportStats && <div>Signals: {reportStats.total} | Cost: {new Intl.NumberFormat("en", { notation: "compact", style: "currency", currency: "USD" }).format(reportStats.costTotal)}</div>}
            </div>
            <div className="flex gap-1.5 justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => { setShowSaveForm(false); setScenarioName(""); setScenarioDescription(""); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={handleSaveScenario}
                disabled={!scenarioName.trim()}
              >
                <Check className="w-3 h-3 mr-1" />
                Save
              </Button>
            </div>
          </div>
        )}

        {showScenarioList && (
          <div className={`rounded-md overflow-hidden border ${isDark ? "border-slate-700/50" : "border-slate-200"}`}>
            {scenarios.length === 0 ? (
              <div className={`p-3 text-center text-[10px] ${subText}`}>No saved scenarios</div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto">
                {scenarios.map(s => (
                  <div
                    key={s.id}
                    className={`p-2 border-b last:border-b-0 cursor-pointer transition-colors ${
                      s.id === activeScenarioId
                        ? isDark ? "bg-green-500/10 border-green-500/20" : "bg-green-50 border-green-200"
                        : isDark ? "hover:bg-slate-800/80 border-slate-700/30" : "hover:bg-slate-50 border-slate-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0" onClick={() => handleLoadScenario(s)}>
                        <div className={`text-xs font-medium truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {s.name}
                        </div>
                        {s.description && (
                          <div className={`text-[9px] mt-0.5 truncate ${subText}`}>{s.description}</div>
                        )}
                        <div className={`text-[9px] mt-1 flex flex-wrap gap-x-2 ${subText}`}>
                          <span>{s.portfolioName}</span>
                          <span>+{s.timeProjectionMonths % 1 === 0 ? s.timeProjectionMonths : s.timeProjectionMonths.toFixed(1)}mo</span>
                          <span>{new Date(s.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                        </div>
                        <div className={`text-[9px] flex gap-x-2 ${subText}`}>
                          <span>{s.summary.totalSignals} signals</span>
                          <span className="text-red-400">{s.summary.highCount} high</span>
                          {s.summary.costExposure > 0 && <span>{new Intl.NumberFormat("en", { notation: "compact", style: "currency", currency: "USD" }).format(s.summary.costExposure)}</span>}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {deletingId === s.id ? (
                          <div className="flex gap-0.5">
                            <button onClick={() => handleDeleteScenario(s.id)} className="p-0.5 rounded text-red-500 hover:bg-red-500/10" title="Confirm delete">
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setDeletingId(null)} className={`p-0.5 rounded ${isDark ? "text-slate-400 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-200"}`} title="Cancel">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeletingId(s.id)} className={`p-0.5 rounded ${isDark ? "text-slate-500 hover:text-red-400 hover:bg-slate-700" : "text-slate-400 hover:text-red-500 hover:bg-slate-100"}`} title="Delete scenario">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className={`text-xs font-semibold ${labelCls}`}>X-Axis Metric</Label>
        <Select value={horizontalMetric} onValueChange={(val) => onHorizontalMetricChange(val as HorizontalMetric)}>
          <SelectTrigger className={`text-xs ${selectTrigger}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContent}>
            {HORIZONTAL_METRICS.map((m) => (
              <SelectItem key={m.value} value={m.value} className={`text-xs ${selectItem}`}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className={`text-xs ${labelCls}`}>Min Risk Score: {filters.minRiskScore}</Label>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[filters.minRiskScore]}
          onValueChange={([val]) => update({ minRiskScore: val })}
          className="[&_[role=slider]]:bg-green-500 [&_[role=slider]]:border-green-400"
        />
        <div className={`flex justify-between text-[10px] ${subText}`}>
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className={`text-xs ${labelCls}`}>Future Risks Only</Label>
        <Switch
          checked={filters.futureOnly}
          onCheckedChange={(val) => update({ futureOnly: val })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className={`text-xs ${labelCls}`}>High Risk Only (&gt;70)</Label>
        <Switch
          checked={filters.highRiskOnly}
          onCheckedChange={(val) => update({ highRiskOnly: val })}
        />
      </div>

      <div className="space-y-2">
        <Label className={`text-xs ${labelCls}`}>Item Type</Label>
        <Select value={filters.itemType} onValueChange={(val) => update({ itemType: val })}>
          <SelectTrigger className={`text-xs ${selectTrigger}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContent}>
            <SelectItem value="all" className={`text-xs ${selectItem}`}>All Items</SelectItem>
            <SelectItem value="risk" className={`text-xs ${selectItem}`}>Risks Only</SelectItem>
            <SelectItem value="issue" className={`text-xs ${selectItem}`}>Issues Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className={`text-xs ${labelCls}`}>Signal Type</Label>
        <Select value={filters.signalType} onValueChange={(val) => update({ signalType: val })}>
          <SelectTrigger className={`text-xs ${selectTrigger}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContent}>
            {SIGNAL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className={`text-xs ${selectItem}`}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className={`text-xs ${labelCls}`}>Project</Label>
        <Select
          value={filters.projectId}
          onValueChange={(val) => update({ projectId: val })}
        >
          <SelectTrigger className={`text-xs ${selectTrigger}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContent}>
            <SelectItem value="all" className={`text-xs ${selectItem}`}>
              All Projects
            </SelectItem>
            {projects.map((p) => (
              <SelectItem
                key={p.id}
                value={String(p.id)}
                className={`text-xs ${selectItem}`}
              >
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className={`text-xs ${labelCls}`}>Portfolio</Label>
        <Select
          value={filters.portfolioId}
          onValueChange={(val) => update({ portfolioId: val })}
        >
          <SelectTrigger className={`text-xs ${selectTrigger}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContent}>
            <SelectItem value="all" className={`text-xs ${selectItem}`}>
              All Portfolios
            </SelectItem>
            {portfolios.map((p) => (
              <SelectItem
                key={p.id}
                value={String(p.id)}
                className={`text-xs ${selectItem}`}
              >
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={`mt-auto pt-4 border-t ${legendBorder}`}>
        <div className={`text-[10px] uppercase tracking-wider mb-2 ${subText}`}>Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className={`text-xs ${legendLabel}`}>Low Score (&lt;30)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className={`text-xs ${legendLabel}`}>Medium Score (30-70)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className={`text-xs ${legendLabel}`}>High Score (&gt;70)</span>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-60 shrink-0">
              <polygon points="5,1 9,8 1,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <span className={`text-xs ${legendLabel}`}>Risk (triangle)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-current opacity-60" />
            <span className={`text-xs ${legendLabel}`}>Issue (circle)</span>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`w-4 h-1 rounded ${isDark ? "bg-slate-500" : "bg-slate-400"}`} />
            <span className={`text-[10px] ${subText}`}>Size = Impact</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-4 h-1 rounded ${isDark ? "bg-slate-500/50" : "bg-slate-400/50"}`} />
            <span className={`text-[10px] ${subText}`}>Opacity = Confidence</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full border-2 border-dashed ${isDark ? "border-cyan-400/60" : "border-cyan-500/60"}`} />
            <span className={`text-[10px] ${subText}`}>Simulated (projected)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
