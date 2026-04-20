import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, Area, ReferenceLine } from "recharts";
import { FinancialsScope, EmptyState } from "./shared";
import type { FinancialAnalyticsResponse } from "@/hooks/use-financial-analytics";
import { formatCurrency } from "@/lib/format";
import { Download } from "lucide-react";
import { downloadCsv } from "./csvExport";

type Period = "monthly" | "quarterly";
const ALL_SERIES = ["Planned", "Earned", "Actual", "EAC"] as const;
type SeriesKey = typeof ALL_SERIES[number];
const SERIES_COLORS: Record<SeriesKey, string> = {
  Planned: "#3b82f6",
  Earned: "#8b5cf6",
  Actual: "#10b981",
  EAC: "#f59e0b",
};

export function SCurveDashboard() {
  return <FinancialsScope render={({ data }) => <SCurveBody data={data} />} />;
}

function SCurveBody({ data }: { data: FinancialAnalyticsResponse }) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [scopeProjectId, setScopeProjectId] = useState<string>("ALL");
  const [enabled, setEnabled] = useState<Record<SeriesKey, boolean>>({
    Planned: true, Earned: true, Actual: true, EAC: true,
  });
  const fmt = (v: number) => formatCurrency(v, { compact: true });
  const noData = data.totals.bac === 0 && data.totals.ac === 0;

  const baseMonthly = useMemo(() => {
    if (scopeProjectId === "ALL") {
      return data.series.map((s, i) => ({
        label: s.label,
        idx: i,
        Planned: Math.round(s.pvCum),
        Earned: Math.round(s.evCum),
        Actual: Math.round(s.acCum),
        EAC: Math.round(s.eacCum),
      }));
    }
    const proj = data.projects.find(p => String(p.projectId) === scopeProjectId);
    if (!proj) return [];
    return data.months.map((m, i) => ({
      label: m.label,
      idx: i,
      Planned: Math.round(proj.pvCum[i] ?? 0),
      Earned: Math.round(proj.evCum[i] ?? 0),
      Actual: Math.round(proj.acCum[i] ?? 0),
      EAC: Math.round(proj.eacCum[i] ?? 0),
    }));
  }, [data, scopeProjectId]);

  // Aggregate to quarterly: cumulative values just take the last month of
  // each quarter (Q1 = months 1-3, Q2 = 4-6, etc.).
  const series = useMemo(() => {
    if (period === "monthly") return baseMonthly;
    return [0, 1, 2, 3].map(qi => {
      const last = baseMonthly[qi * 3 + 2];
      return {
        label: `Q${qi + 1}`,
        idx: qi * 3 + 2,
        Planned: last?.Planned ?? 0,
        Earned: last?.Earned ?? 0,
        Actual: last?.Actual ?? 0,
        EAC: last?.EAC ?? 0,
      };
    });
  }, [baseMonthly, period]);

  const todayLabel = useMemo(() => {
    if (data.asOfMonth <= 0) return null;
    const monthIdx = Math.max(0, data.asOfMonth - 1);
    if (period === "monthly") return data.months[monthIdx]?.label ?? null;
    return `Q${Math.floor(monthIdx / 3) + 1}`;
  }, [data, period]);

  const exportCsv = () => {
    const header = ["Period", ...ALL_SERIES.filter(k => enabled[k])];
    const rows = series.map(r => [r.label, ...ALL_SERIES.filter(k => enabled[k]).map(k => r[k])]);
    const scopeName = scopeProjectId === "ALL" ? "all-projects" : `proj-${scopeProjectId}`;
    downloadCsv(`s-curve-${scopeName}-fy${data.fiscalYear}-${period}.csv`, [header, ...rows]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium">S-Curve Controls</CardTitle>
              <CardDescription className="text-xs">Toggle series, change period grain, or scope to a single project.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={series.length === 0} data-testid="button-export-scurve-csv">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">Scope</Label>
              <Select value={scopeProjectId} onValueChange={setScopeProjectId}>
                <SelectTrigger className="h-9 mt-1" data-testid="select-scurve-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All projects (rolled up)</SelectItem>
                  {[...data.projects].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                    <SelectItem key={p.projectId} value={String(p.projectId)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="h-9 mt-1" data-testid="select-scurve-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Series</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {ALL_SERIES.map(k => (
                  <label key={k} className="flex items-center gap-1.5 text-xs cursor-pointer" data-testid={`toggle-scurve-${k.toLowerCase()}`}>
                    <Checkbox checked={enabled[k]} onCheckedChange={(v) => setEnabled(s => ({ ...s, [k]: !!v }))} />
                    <span style={{ color: SERIES_COLORS[k] }}>● </span>{k}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {noData ? <EmptyState message={`No financial data for FY ${data.fiscalYear}.`} /> : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">S-Curve (Cumulative {period === "monthly" ? "Monthly" : "Quarterly"})</CardTitle>
            <CardDescription className="text-xs">
              Planned (PV) shown as area; Earned (EV), Actual (AC), and Forecast (EAC) overlaid as lines. Vertical reference marks today.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series}>
                  <defs>
                    <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES_COLORS.Planned} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={SERIES_COLORS.Planned} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={fmt} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {todayLabel && (
                    <ReferenceLine x={todayLabel} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "Today", position: "top", fontSize: 10 }} />
                  )}
                  {enabled.Planned && (
                    <Area type="monotone" dataKey="Planned" stroke={SERIES_COLORS.Planned} strokeWidth={2} fill="url(#pvFill)" />
                  )}
                  {enabled.Earned && (
                    <Line type="monotone" dataKey="Earned" stroke={SERIES_COLORS.Earned} strokeWidth={2} dot={{ r: 3 }} />
                  )}
                  {enabled.Actual && (
                    <Line type="monotone" dataKey="Actual" stroke={SERIES_COLORS.Actual} strokeWidth={2} dot={{ r: 3 }} />
                  )}
                  {enabled.EAC && (
                    <Line type="monotone" dataKey="EAC" stroke={SERIES_COLORS.EAC} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
