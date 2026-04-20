import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, ReferenceLine, BarChart, Bar, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FinancialsScope, EmptyState, KpiTile } from "./shared";
import { Target, Calculator, AlertTriangle, TrendingUp, Download } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { downloadCsv } from "./csvExport";

/**
 * Compute the four common EAC scenarios per PMI EVM:
 *  - CPI-only: BAC / CPI (assumes current cost performance continues)
 *  - CPI×SPI: AC + (BAC − EV) / (CPI × SPI) (cost + schedule degrade further)
 *  - Optimistic: AC + (BAC − EV) (remaining work at planned rate)
 *  - Pessimistic: AC + (BAC − EV) / max(CPI × 0.9, 0.1)
 */
function computeScenarios(bac: number, ac: number, ev: number, cpi: number, spi: number) {
  const remaining = Math.max(0, bac - ev);
  const cpiOnly = cpi > 0 ? bac / cpi : bac;
  const cpiSpi = cpi > 0 && spi > 0 ? ac + remaining / (cpi * spi) : bac;
  const optimistic = ac + remaining;
  const pessFactor = Math.max(0.1, cpi * 0.9);
  const pessimistic = ac + remaining / pessFactor;
  return { cpiOnly, cpiSpi, optimistic, pessimistic };
}

export function ForecastingDashboard() {
  const [tcpiTarget, setTcpiTarget] = useState<number>(1.0); // default target = on-budget
  return (
    <FinancialsScope dashboardType="financials-forecasting" title="Forecasting & EAC" render={({ data }) => {
      const t = data.totals;
      const fmt = (v: number) => formatCurrency(v, { compact: true });
      const noData = t.bac === 0 && t.ac === 0;

      const scenarios = computeScenarios(t.bac, t.ac, t.ev, t.cpi, t.spi);
      // TCPI to hit the editable target EAC (default = BAC).
      const targetEAC = t.bac * tcpiTarget; // tcpiTarget is multiplier of BAC
      const tcpiToTarget = (targetEAC - t.ac) > 0 ? (t.bac - t.ev) / (targetEAC - t.ac) : null;

      // Forecast Completion Date: scale the planned end date by 1/SPI from
      // today, when both project plan dates and SPI are usable.
      const projectsWithDates = data.projects.filter(p => p.endDate && p.spi > 0);
      const today = new Date();
      const slips = projectsWithDates.map(p => {
        const planEnd = new Date(p.endDate as string);
        const remainingDays = Math.max(0, (planEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const adjusted = remainingDays / Math.max(0.2, p.spi);
        const forecastEnd = new Date(today.getTime() + adjusted * 24 * 60 * 60 * 1000);
        const slipDays = Math.round((forecastEnd.getTime() - planEnd.getTime()) / (1000 * 60 * 60 * 24));
        return { project: p, planEnd, forecastEnd, slipDays };
      });
      const avgSlip = slips.length > 0
        ? Math.round(slips.reduce((s, x) => s + x.slipDays, 0) / slips.length)
        : 0;

      // Spend forecast curve with optimistic/pessimistic bands.
      const asOf = data.asOfMonth;
      const forecast = data.series.map((s, i) => {
        const isFuture = i + 1 > asOf;
        let acProjected: number | null = null;
        let optBand: number | null = null;
        let pessBand: number | null = null;
        if (asOf > 0 && asOf < 12 && isFuture) {
          const acAtAsOf = data.series[asOf - 1].acCum;
          const remainingMonths = 12 - asOf;
          const stepsAhead = i + 1 - asOf;
          const f = stepsAhead / remainingMonths;
          acProjected = Math.round(acAtAsOf + (scenarios.cpiOnly - acAtAsOf) * f);
          optBand = Math.round(acAtAsOf + (scenarios.optimistic - acAtAsOf) * f);
          pessBand = Math.round(acAtAsOf + (scenarios.pessimistic - acAtAsOf) * f);
        } else if (i + 1 === asOf) {
          acProjected = Math.round(s.acCum);
          optBand = Math.round(s.acCum);
          pessBand = Math.round(s.acCum);
        }
        return {
          label: s.label,
          PlannedBAC: Math.round(s.pvCum),
          Actual: isFuture ? null : Math.round(s.acCum),
          Forecast: acProjected,
          Optimistic: optBand,
          Pessimistic: pessBand,
          EnteredEAC: s.eacCum > 0 ? Math.round(s.eacCum) : null,
        };
      });

      const scenarioBars = [
        { name: "CPI", value: Math.round(scenarios.cpiOnly), fill: "#3b82f6" },
        { name: "CPI × SPI", value: Math.round(scenarios.cpiSpi), fill: "#8b5cf6" },
        { name: "Optimistic", value: Math.round(scenarios.optimistic), fill: "#10b981" },
        { name: "Pessimistic", value: Math.round(scenarios.pessimistic), fill: "#ef4444" },
      ];

      const exportSlipCsv = () => {
        const header = ["Project", "Planned End", "Forecast End", "Slip (days)", "SPI"];
        downloadCsv(`forecast-completion-fy${data.fiscalYear}.csv`,
          [header, ...slips.map(s => [
            s.project.name,
            s.planEnd.toISOString().slice(0, 10),
            s.forecastEnd.toISOString().slice(0, 10),
            s.slipDays,
            s.project.spi.toFixed(3),
          ])]
        );
      };

      const tcpiGaugeData = [{
        name: "TCPI",
        value: tcpiToTarget == null ? 0 : Math.max(0, Math.min(1.5, tcpiToTarget)),
        fill: tcpiToTarget == null ? "#94a3b8" : tcpiToTarget <= 1 ? "#10b981" : tcpiToTarget <= 1.1 ? "#f59e0b" : "#ef4444",
      }];

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="BAC" value={<CompactCurrency value={t.bac} />} icon={<Target className="h-4 w-4 text-blue-500" />} hint="Approved baseline" />
            <KpiTile label="EAC (CPI)" value={<CompactCurrency value={scenarios.cpiOnly} />} icon={<Calculator className="h-4 w-4 text-amber-500" />} hint="BAC ÷ CPI" />
            <KpiTile label="EAC (entered)" value={<CompactCurrency value={t.eacEntered} />} icon={<Calculator className="h-4 w-4 text-purple-500" />} hint="From EAC type entries" />
            <KpiTile label="ETC (To Complete)" value={<CompactCurrency value={t.etc} />} icon={<TrendingUp className="h-4 w-4 text-cyan-500" />} hint={`Remaining work · ${12 - data.asOfMonth} months left`} tone={t.etc > t.bac - t.ac ? "warn" : "default"} />
          </div>

          {noData ? <EmptyState message={`No financial data to forecast for FY ${data.fiscalYear}.`} /> : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">EAC Scenarios</CardTitle>
                    <CardDescription className="text-xs">Four standard PMI EVM forecasting formulas applied to org totals.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scenarioBars}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={10} tickFormatter={fmt} />
                          <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                          <ReferenceLine y={Math.round(t.bac)} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: "BAC", position: "right", fontSize: 10 }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">TCPI Gauge</CardTitle>
                    <CardDescription className="text-xs">Cost performance required to finish at the target.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[160px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart data={tcpiGaugeData} innerRadius="65%" outerRadius="95%" startAngle={210} endAngle={-30}>
                          <PolarAngleAxis type="number" domain={[0, 1.5]} tick={false} />
                          <RadialBar dataKey="value" background cornerRadius={6} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-2xl font-bold">{tcpiToTarget == null ? "—" : tcpiToTarget.toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">TCPI</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label htmlFor="tcpi-target" className="text-xs">Target EAC (× BAC)</Label>
                      <Input id="tcpi-target" type="number" step="0.05" min="0.5" max="1.5" value={tcpiTarget}
                        onChange={(e) => setTcpiTarget(Math.max(0.1, Number(e.target.value) || 1))}
                        className="h-8 mt-1 text-sm" data-testid="input-tcpi-target" />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Target: {fmt(targetEAC)} · &lt;1 favorable, &gt;1.1 unrealistic
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Spend Forecast vs Baseline (with bands)</CardTitle>
                  <CardDescription className="text-xs">Solid = actual spend; dashed = projected EAC; shaded band = optimistic / pessimistic envelope.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={forecast}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={fmt} />
                        <Tooltip formatter={(v: any) => v == null ? "—" : fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {data.asOfMonth > 0 && data.asOfMonth < 12 && (
                          <ReferenceLine x={data.months[data.asOfMonth - 1].label} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: "Forecast →", position: "top", fontSize: 10 }} />
                        )}
                        <Line type="monotone" dataKey="PlannedBAC" stroke="#3b82f6" strokeWidth={2} dot={false} name="Planned (PV)" />
                        <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Actual (AC)" />
                        <Line type="monotone" dataKey="Forecast" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast (CPI)" />
                        <Line type="monotone" dataKey="Optimistic" stroke="#10b981" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="2 4" dot={false} name="Optimistic" />
                        <Line type="monotone" dataKey="Pessimistic" stroke="#ef4444" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="2 4" dot={false} name="Pessimistic" />
                        <Line type="monotone" dataKey="EnteredEAC" stroke="#8b5cf6" strokeWidth={2} dot={false} name="EAC (entered)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium">Forecast Completion Dates</CardTitle>
                    <CardDescription className="text-xs">Schedule slip projected by SPI · average slip {avgSlip} day{avgSlip === 1 ? "" : "s"}.</CardDescription>
                  </div>
                  {slips.length > 0 && (
                    <Button variant="outline" size="sm" onClick={exportSlipCsv} data-testid="button-export-slip-csv">
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {slips.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No projects with planned end dates.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Planned End</TableHead>
                          <TableHead>Forecast End</TableHead>
                          <TableHead className="text-right">Slip</TableHead>
                          <TableHead className="text-right">SPI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...slips].sort((a, b) => b.slipDays - a.slipDays).slice(0, 15).map(s => (
                          <TableRow key={s.project.projectId} data-testid={`row-slip-${s.project.projectId}`}>
                            <TableCell className="max-w-[280px] truncate font-medium">{s.project.name}</TableCell>
                            <TableCell className="text-xs">{s.planEnd.toISOString().slice(0, 10)}</TableCell>
                            <TableCell className="text-xs">{s.forecastEnd.toISOString().slice(0, 10)}</TableCell>
                            <TableCell className={`text-right ${s.slipDays > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {s.slipDays > 0 ? "+" : ""}{s.slipDays}d
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{s.project.spi.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" /> Forecast Risk by Project
                    </CardTitle>
                    <CardDescription className="text-xs">Projects whose computed EAC exceeds BAC are flagged. Sorted by VAC severity.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-export-risk-csv" onClick={() => {
                    const header = ["Project", "BAC", "AC", "EAC", "ETC", "VAC", "Risk"];
                    const rows = [...data.projects].filter(p => p.bac > 0).sort((a, b) => a.vac - b.vac).map(p => {
                      const overrun = p.vac < 0;
                      const severe = p.bac > 0 && p.vac < -0.1 * p.bac;
                      return [p.name, p.bac.toFixed(2), p.ac.toFixed(2), p.eacComputed.toFixed(2), p.etc.toFixed(2), p.vac.toFixed(2), severe ? "Critical" : overrun ? "Watch" : "On track"];
                    });
                    downloadCsv(`forecast-risk-fy${data.fiscalYear}.csv`, [header, ...rows]);
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">BAC</TableHead>
                        <TableHead className="text-right">AC to date</TableHead>
                        <TableHead className="text-right">EAC</TableHead>
                        <TableHead className="text-right">ETC</TableHead>
                        <TableHead className="text-right">VAC</TableHead>
                        <TableHead>Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...data.projects].filter(p => p.bac > 0).sort((a, b) => a.vac - b.vac).map(p => {
                        const overrun = p.vac < 0;
                        const severe = p.bac > 0 && p.vac < -0.1 * p.bac;
                        return (
                          <TableRow key={p.projectId} data-testid={`row-forecast-${p.projectId}`}>
                            <TableCell className="max-w-[280px] truncate font-medium">{p.name}</TableCell>
                            <TableCell className="text-right"><CompactCurrency value={p.bac} /></TableCell>
                            <TableCell className="text-right"><CompactCurrency value={p.ac} /></TableCell>
                            <TableCell className="text-right"><CompactCurrency value={p.eacComputed} /></TableCell>
                            <TableCell className="text-right"><CompactCurrency value={p.etc} /></TableCell>
                            <TableCell className={`text-right ${p.vac >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                              {p.vac >= 0 ? "+" : ""}<CompactCurrency value={p.vac} />
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${severe ? "bg-destructive/10 text-destructive" : overrun ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                                {severe ? "Critical" : overrun ? "Watch" : "On track"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      );
    }} />
  );
}
