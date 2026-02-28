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

export default function FiltersPanel({ filters, onChange, portfolios }: FiltersPanelProps) {
  const update = (partial: Partial<RadarFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className="w-64 shrink-0 bg-slate-900/80 border-r border-green-500/10 p-4 flex flex-col gap-6 overflow-y-auto">
      <div>
        <h3 className="text-green-400 text-sm font-semibold uppercase tracking-wider mb-4">
          Filters
        </h3>
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300 text-xs">Min Risk Score: {filters.minRiskScore}</Label>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[filters.minRiskScore]}
          onValueChange={([val]) => update({ minRiskScore: val })}
          className="[&_[role=slider]]:bg-green-500 [&_[role=slider]]:border-green-400"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-slate-300 text-xs">Future Risks Only</Label>
        <Switch
          checked={filters.futureOnly}
          onCheckedChange={(val) => update({ futureOnly: val })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-slate-300 text-xs">High Risk Only (&gt;70)</Label>
        <Switch
          checked={filters.highRiskOnly}
          onCheckedChange={(val) => update({ highRiskOnly: val })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300 text-xs">Signal Type</Label>
        <Select value={filters.signalType} onValueChange={(val) => update({ signalType: val })}>
          <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-300 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {SIGNAL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-slate-300 text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300 text-xs">Portfolio</Label>
        <Select
          value={filters.portfolioId}
          onValueChange={(val) => update({ portfolioId: val })}
        >
          <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-300 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-300 text-xs">
              All Portfolios
            </SelectItem>
            {portfolios.map((p) => (
              <SelectItem
                key={p.id}
                value={String(p.id)}
                className="text-slate-300 text-xs"
              >
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-auto pt-4 border-t border-slate-700/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-xs text-slate-400">Low Risk (&lt;30)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className="text-xs text-slate-400">Medium Risk (30-70)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-xs text-slate-400">High Risk (&gt;70)</span>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 bg-slate-500 rounded" />
            <span className="text-[10px] text-slate-500">Dot size = Impact</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 bg-slate-500/50 rounded" />
            <span className="text-[10px] text-slate-500">Opacity = Confidence</span>
          </div>
        </div>
      </div>
    </div>
  );
}
