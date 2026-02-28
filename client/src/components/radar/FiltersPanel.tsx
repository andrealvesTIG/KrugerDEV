import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FastForward, RotateCcw } from "lucide-react";
import { type HorizontalMetric, HORIZONTAL_METRICS } from "./RadarCanvas";

export type RadarFilters = {
  minRiskScore: number;
  futureOnly: boolean;
  highRiskOnly: boolean;
  signalType: string;
  portfolioId: string;
};

interface FiltersPanelProps {
  filters: RadarFilters;
  onChange: (filters: RadarFilters) => void;
  portfolios: { id: number; name: string }[];
  isDark: boolean;
  timeProjectionMonths: number;
  onTimeProjectionChange: (months: number) => void;
  horizontalMetric: HorizontalMetric;
  onHorizontalMetricChange: (metric: HorizontalMetric) => void;
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

export default function FiltersPanel({ filters, onChange, portfolios, isDark, timeProjectionMonths, onTimeProjectionChange, horizontalMetric, onHorizontalMetricChange }: FiltersPanelProps) {
  const update = (partial: Partial<RadarFilters>) => {
    onChange({ ...filters, ...partial });
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
  const projectionActive = timeProjectionMonths > 0;
  const projectionAccent = isDark ? "text-amber-400" : "text-amber-600";
  const projectionBg = isDark ? "bg-amber-500/5 border border-amber-500/20 rounded-lg p-3" : "bg-amber-50 border border-amber-300/30 rounded-lg p-3";

  return (
    <div className={`w-64 shrink-0 p-4 flex flex-col gap-6 overflow-y-auto ${panelBg}`}>
      <div>
        <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${heading}`}>
          Filters
        </h3>
      </div>

      <div className={projectionActive ? projectionBg : "space-y-2"}>
        <div className="flex items-center justify-between mb-2">
          <Label className={`text-xs font-semibold flex items-center gap-1.5 ${projectionActive ? projectionAccent : labelCls}`}>
            <FastForward className="w-3.5 h-3.5" />
            Time Projection: {timeProjectionMonths === 0 ? "Now" : `+${timeProjectionMonths}mo`}
          </Label>
          {projectionActive && (
            <button
              onClick={() => onTimeProjectionChange(0)}
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
          step={1}
          value={[timeProjectionMonths]}
          onValueChange={([val]) => onTimeProjectionChange(val)}
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
            <span className={`text-xs ${legendLabel}`}>Low Risk (&lt;30)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className={`text-xs ${legendLabel}`}>Medium Risk (30-70)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className={`text-xs ${legendLabel}`}>High Risk (&gt;70)</span>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`w-4 h-1 rounded ${isDark ? "bg-slate-500" : "bg-slate-400"}`} />
            <span className={`text-[10px] ${subText}`}>Dot size = Impact</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-4 h-1 rounded ${isDark ? "bg-slate-500/50" : "bg-slate-400/50"}`} />
            <span className={`text-[10px] ${subText}`}>Opacity = Confidence</span>
          </div>
        </div>
      </div>
    </div>
  );
}
