import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, ReferenceLine, BarChart, Bar } from "recharts";
import { FinancialsScope, EmptyState, KpiTile } from "./shared";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Activity, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Link } from "wouter";

/**
 * PMI EVM color thresholds for the heatmap. Values ≥ 0.95 are green, 0.85–0.94
 * are amber, < 0.85 are red, and 0 (or missing) is rendered neutral.
 */
function indexCellClass(v: number | null): string {
  if (v == null || v === 0) return "bg-muted/40 text-muted-foreground";
  if (v >= 0.95) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
  if (v >= 0.85) return "bg-amber-500/20 text-amber-700 dark:text-amber-300";
  return "bg-destructive/20 text-destructive";
}

export function VarianceTrendsDashboard() {
  return (
    <FinancialsScope dashboardType="financials-variance" title="Variance & Trends" render={({ data }) => {
      const t = data.totals;
      const noData = t.bac === 0 && t.ac === 0;
      const fmt = (v: number) => formatCurrency(v, { compact: true });

      // Org-level monthly CV/SV/CPI/SPI series (cumulative through each month).
      const series = data.series.map((s, i) => {
        const isFuture = i + 1 > data.asOfMonth;
        return {
          label: s.label,
          CV: isFuture ? null : Math.round(s.evCum - s.acCum),
          SV: isFuture ? null : Math.round(s.evCum - s.pvCum),
          CPI: isFuture ? null : (s.acCum > 0 ? Number((s.evCum / s.acCum).toFixed(3)) : null),
          SPI: isFuture ? null : (s.pvCum > 0 ? Number((s.evCum / s.pvCum).toFixed(3)) : null),
        };
      });

      // Project × Period heatmaps (cumulative CPI and SPI per fiscal month per
      // project, only past/current months).
      const heatmapProjects = [...data.projects].filter(p => p.bac > 0 || p.ac > 0).slice(0, 25);
      const cpiHeatmap = heatmapProjects.map(p => {
        const cells = data.months.map((_, i) => {
          if (i + 1 > data.asOfMonth) return null;
          const ac = p.acCum[i];
          const ev = p.evCum[i];
          if (ac <= 0) return null;
          return Number((ev / ac).toFixed(2));
        });
        return { name: p.name, projectId: p.projectId, cells };
      });
      const spiHeatmap = heatmapProjects.map(p => {
        const cells = data.months.map((_, i) => {
          if (i + 1 > data.asOfMonth) return null;
          const pv = p.pvCum[i];
          const ev = p.evCum[i];
          if (pv <= 0) return null;
          return Number((ev / pv).toFixed(2));
        });
        return { name: p.name, projectId: p.projectId, cells };
      });

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="Current CV" value={<CompactCurrency value={t.ev - t.ac} />} tone={t.ev - t.ac >= 0 ? "good" : "bad"} icon={<Activity className="h-4 w-4 text-emerald-500" />} />
            <KpiTile label="Current SV" value={<CompactCurrency value={t.ev - t.pv} />} tone={t.ev - t.pv >= 0 ? "good" : "bad"} icon={<Activity className="h-4 w-4 text-cyan-500" />} />
            <KpiTile label="CPI Trend" value={t.cpi.toFixed(2)} tone={t.cpi >= 1 ? "good" : "bad"} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
            <KpiTile label="SPI Trend" value={t.spi.toFixed(2)} tone={t.spi >= 1 ? "good" : "bad"} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} />
          </div>

          {noData ? <EmptyState message={`No variance data to display for FY ${data.fiscalYear}.`} /> : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Cost &amp; Schedule Variance Over Time</CardTitle>
                  <CardDescription className="text-xs">Positive values are favorable. CV = EV − AC, SV = EV − PV.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={series.filter(s => s.CV !== null)} stackOffset="sign">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={fmt} />
                        <Tooltip formatter={(v: any) => v == null ? "—" : fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="#94a3b8" />
                        <Bar dataKey="CV" fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="SV" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Performance Index Trends (CPI &amp; SPI)</CardTitle>
                  <CardDescription className="text-xs">Index = 1.0 means on plan; below 1.0 indicates trouble.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} domain={[0.5, 1.5]} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: "On Plan", position: "right", fontSize: 10 }} />
                        <Line type="monotone" dataKey="CPI" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                        <Line type="monotone" dataKey="SPI" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <HeatmapCard
                title="CPI Heatmap by Project & Period"
                indexLabel="CPI"
                rows={cpiHeatmap}
                months={data.months}
                limited={heatmapProjects.length === 25}
                testIdSuffix="cpi"
              />

              <HeatmapCard
                title="SPI Heatmap by Project & Period"
                indexLabel="SPI"
                rows={spiHeatmap}
                months={data.months}
                limited={heatmapProjects.length === 25}
                testIdSuffix="spi"
              />
            </>
          )}
        </div>
      );
    }} />
  );
}

interface HeatmapRow { name: string; projectId: number; cells: (number | null)[]; }
interface HeatmapMonth { monthNum: number; label: string; }

function HeatmapCard({
  title,
  indexLabel,
  rows,
  months,
  limited,
  testIdSuffix,
}: {
  title: string;
  indexLabel: string;
  rows: HeatmapRow[];
  months: HeatmapMonth[];
  limited: boolean;
  testIdSuffix: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardDescription className="text-xs">
          Cumulative {indexLabel} per project per fiscal month. Green ≥ 0.95, Amber 0.85–0.94, Red &lt; 0.85.
          {limited && " Showing the first 25 projects."}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No project-level {indexLabel} data yet.</p>
        ) : (
          <table className="text-xs w-full" data-testid={`table-${testIdSuffix}-heatmap`}>
            <thead>
              <tr>
                <th className="text-left font-medium pb-2 pr-3 sticky left-0 bg-background">Project</th>
                {months.map(m => (
                  <th key={m.monthNum} className="font-medium pb-2 px-1 text-center w-10">
                    {m.label.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.projectId} data-testid={`row-${testIdSuffix}-heatmap-${row.projectId}`}>
                  <td className="py-1 pr-3 max-w-[220px] truncate sticky left-0 bg-background">
                    <Link href={`/projects/${row.projectId}?tab=financials`} className="hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  {row.cells.map((c, i) => (
                    <td
                      key={i}
                      className={`py-1 px-1 text-center font-mono ${indexCellClass(c)}`}
                      title={c == null ? "no data" : `${indexLabel} ${c.toFixed(2)}`}
                    >
                      {c == null ? "—" : c.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
