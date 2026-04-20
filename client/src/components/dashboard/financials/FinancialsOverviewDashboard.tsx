import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, CreditCard, Calculator, Percent, TrendingUp, AlertTriangle, Banknote, Target, CheckCircle2, Activity, Calendar, Scale, Gauge, CalendarClock } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ComposedChart, Line, RadialBarChart, RadialBar, PolarAngleAxis, PieChart, Pie, Cell } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Progress } from "@/components/ui/progress";
import { FinancialsScope, KpiTile, EmptyState, fmtPct } from "./shared";
import { formatCurrency } from "@/lib/format";
import { Link } from "wouter";

const PMI_HEALTH_COLORS = {
  healthy: "#10b981",
  atRisk: "#f59e0b",
  inTrouble: "#ef4444",
};

export function FinancialsOverviewDashboard() {
  return (
    <FinancialsScope dashboardType="financials-overview" title="Financials Overview" render={({ data }) => {
      const t = data.totals;
      const fmtCompact = (v: number) => formatCurrency(v, { compact: true });
      // Weighted org-level % complete (BAC-weighted) and forecast completion.
      const totalBac = data.projects.reduce((s, p) => s + (p.bac || 0), 0);
      const pctCompleteWeighted = totalBac > 0
        ? data.projects.reduce((s, p) => s + (p.bac || 0) * (p.completionPercentage || 0), 0) / totalBac
        : data.projects.length > 0
          ? data.projects.reduce((s, p) => s + (p.completionPercentage || 0), 0) / data.projects.length
          : 0;
      // PMI Forecast Completion: latest scheduled finish stretched by 1/SPI.
      const baselineFinishMs = data.projects.reduce((mx, p) => {
        const d = p.endDate ? new Date(p.endDate).getTime() : NaN;
        return isFinite(d) && d > mx ? d : mx;
      }, 0);
      const earliestStartMs = data.projects.reduce((mn, p) => {
        const d = p.startDate ? new Date(p.startDate).getTime() : NaN;
        if (!isFinite(d)) return mn;
        return mn === 0 || d < mn ? d : mn;
      }, 0);
      let forecastCompletionLabel = "—";
      if (baselineFinishMs > 0 && t.spi > 0) {
        const planDur = Math.max(1, baselineFinishMs - (earliestStartMs || baselineFinishMs));
        const forecastMs = (earliestStartMs || baselineFinishMs) + planDur / t.spi;
        forecastCompletionLabel = new Date(forecastMs).toLocaleDateString(undefined, { month: "short", year: "numeric" });
      }
      const baselineFinishLabel = baselineFinishMs > 0
        ? new Date(baselineFinishMs).toLocaleDateString(undefined, { month: "short", year: "numeric" })
        : "—";
      const overBudget = data.projects.filter(p => p.eacComputed > p.bac && p.bac > 0).length;
      const onBudget = data.projects.filter(p => p.bac > 0 && Math.abs(p.eacComputed - p.bac) / p.bac <= 0.05).length;
      const underBudget = data.projects.filter(p => p.bac > 0 && p.eacComputed < p.bac * 0.95).length;
      const noData = t.bac === 0 && t.ac === 0;

      // PMI EVM health buckets, applied jointly to CPI and SPI: a project is
      // only "Healthy" if both indices are ≥ 0.95; "In Trouble" if either is
      // < 0.85; "At Risk" otherwise.
      const projectsWithMetrics = data.projects.filter(p => p.bac > 0);
      const pmiBuckets = projectsWithMetrics.reduce((acc, p) => {
        const worst = Math.min(p.cpi, p.spi);
        if (worst >= 0.95) acc.healthy++;
        else if (worst < 0.85) acc.inTrouble++;
        else acc.atRisk++;
        return acc;
      }, { healthy: 0, atRisk: 0, inTrouble: 0 });
      const pmiPie = [
        { name: "Healthy (≥ 0.95)", value: pmiBuckets.healthy, color: PMI_HEALTH_COLORS.healthy },
        { name: "At Risk (0.85–0.94)", value: pmiBuckets.atRisk, color: PMI_HEALTH_COLORS.atRisk },
        { name: "In Trouble (< 0.85)", value: pmiBuckets.inTrouble, color: PMI_HEALTH_COLORS.inTrouble },
      ].filter(s => s.value > 0);

      const seriesForChart = data.series.map(s => ({
        label: s.label,
        PV: Math.round(s.pvCum),
        EV: Math.round(s.evCum),
        AC: Math.round(s.acCum),
        EAC: Math.round(s.eacCum),
      }));

      // Top-5 worst-performing projects
      const topOverBudget = [...projectsWithMetrics]
        .sort((a, b) => a.vac - b.vac)
        .slice(0, 5);
      const topBehindSchedule = [...projectsWithMetrics]
        .sort((a, b) => a.spi - b.spi)
        .slice(0, 5);

      // CPI/SPI gauges use a 0-1.5 domain centered on 1.0.
      const gaugeData = (label: string, value: number) => ([{
        name: label,
        value: Math.max(0, Math.min(1.5, value)),
        fill: value >= 1 ? "#10b981" : value >= 0.85 ? "#f59e0b" : "#ef4444",
      }]);

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiTile label="BAC (Budget at Completion)" icon={<Wallet className="h-4 w-4 text-blue-500" />}
              value={<CompactCurrency value={t.bac} />}
              hint={`${data.projects.length} project${data.projects.length === 1 ? "" : "s"} · FY ${data.fiscalYear}`} />
            <KpiTile label="Actual Cost (AC)" icon={<CreditCard className="h-4 w-4 text-emerald-500" />}
              value={<CompactCurrency value={t.ac} />}
              hint={`${t.bac > 0 ? ((t.ac / t.bac) * 100).toFixed(1) : "0.0"}% of BAC`} />
            <KpiTile label="Earned Value (EV)" icon={<Activity className="h-4 w-4 text-purple-500" />}
              value={<CompactCurrency value={t.ev} />}
              hint={`Through M${data.asOfMonth || "—"}`} />
            <KpiTile label="EAC Forecast" icon={<Target className="h-4 w-4 text-indigo-500" />}
              value={<CompactCurrency value={t.eacComputed} />}
              hint={`VAC ${t.vac >= 0 ? "+" : ""}${formatCurrency(t.vac, { compact: true })}`}
              tone={t.vac >= 0 ? "good" : "bad"} />
            <KpiTile label="CPI" icon={<Percent className="h-4 w-4 text-amber-500" />}
              value={t.cpi.toFixed(2)} tone={t.cpi >= 1 ? "good" : t.cpi >= 0.95 ? "warn" : "bad"}
              hint={t.cpi >= 1 ? "Cost efficient" : "Over spending"} />
            <KpiTile label="SPI" icon={<TrendingUp className="h-4 w-4 text-cyan-500" />}
              value={t.spi.toFixed(2)} tone={t.spi >= 1 ? "good" : t.spi >= 0.95 ? "warn" : "bad"}
              hint={t.spi >= 1 ? "On / ahead of plan" : "Behind schedule"} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4" data-testid="row-overview-secondary-kpis">
            <KpiTile
              label="Variance at Completion (VAC)"
              icon={<Scale className="h-4 w-4 text-rose-500" />}
              value={<><span>{t.vac >= 0 ? "+" : ""}</span><CompactCurrency value={t.vac} /></>}
              tone={t.vac >= 0 ? "good" : "bad"}
              hint={`BAC − EAC · ${t.bac > 0 ? ((t.vac / t.bac) * 100).toFixed(1) : "0.0"}% of BAC`}
            />
            <KpiTile
              label="% Complete (BAC-weighted)"
              icon={<Gauge className="h-4 w-4 text-violet-500" />}
              value={`${pctCompleteWeighted.toFixed(1)}%`}
              tone={pctCompleteWeighted >= 75 ? "good" : pctCompleteWeighted >= 25 ? "warn" : undefined}
              hint={`Across ${data.projects.length} project${data.projects.length === 1 ? "" : "s"}`}
            />
            <KpiTile
              label="Forecast Completion"
              icon={<CalendarClock className="h-4 w-4 text-sky-500" />}
              value={forecastCompletionLabel}
              tone={t.spi >= 1 ? "good" : t.spi >= 0.85 ? "warn" : "bad"}
              hint={`Plan finish ${baselineFinishLabel} · SPI ${t.spi.toFixed(2)}`}
            />
          </div>

          {noData ? (
            <EmptyState message={`No financial entries found for FY ${data.fiscalYear}.`} />
          ) : (
            <>
              {/* Gauges + PMI health */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Cost Performance Index</CardTitle>
                    <CardDescription className="text-xs">Target = 1.0 (EV / AC).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[180px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart data={gaugeData("CPI", t.cpi)} innerRadius="65%" outerRadius="95%" startAngle={210} endAngle={-30}>
                          <PolarAngleAxis type="number" domain={[0, 1.5]} tick={false} />
                          <RadialBar dataKey="value" background cornerRadius={6} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-3xl font-bold">{t.cpi.toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">CPI</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Schedule Performance Index</CardTitle>
                    <CardDescription className="text-xs">Target = 1.0 (EV / PV).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[180px] relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart data={gaugeData("SPI", t.spi)} innerRadius="65%" outerRadius="95%" startAngle={210} endAngle={-30}>
                          <PolarAngleAxis type="number" domain={[0, 1.5]} tick={false} />
                          <RadialBar dataKey="value" background cornerRadius={6} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-3xl font-bold">{t.spi.toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">SPI</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Project Health (PMI EVM)</CardTitle>
                    <CardDescription className="text-xs">Worst of CPI &amp; SPI per project.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pmiPie.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-4">No projects with measurable health yet.</div>
                    ) : (
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pmiPie} dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={3} label={(d: { value?: number }) => `${d.value ?? 0}`}>
                              {pmiPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Top-5 lists */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" /> Top 5 Over Budget
                    </CardTitle>
                    <CardDescription className="text-xs">Largest negative VAC (EAC − BAC).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topOverBudget.length === 0 ? <p className="text-xs text-muted-foreground">No projects over budget.</p> : (
                      <ul className="divide-y">
                        {topOverBudget.map(p => (
                          <li key={p.projectId} className="py-2 flex items-center justify-between gap-3" data-testid={`row-overbudget-${p.projectId}`}>
                            <Link href={`/projects/${p.projectId}?tab=financials`} className="text-sm font-medium truncate hover:underline">{p.name}</Link>
                            <span className={`text-xs font-mono ${p.vac < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {p.vac >= 0 ? "+" : ""}<CompactCurrency value={p.vac} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-amber-500" /> Top 5 Behind Schedule
                    </CardTitle>
                    <CardDescription className="text-xs">Lowest SPI (EV / PV).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topBehindSchedule.length === 0 ? <p className="text-xs text-muted-foreground">No projects behind schedule.</p> : (
                      <ul className="divide-y">
                        {topBehindSchedule.map(p => (
                          <li key={p.projectId} className="py-2 flex items-center justify-between gap-3" data-testid={`row-behind-${p.projectId}`}>
                            <Link href={`/projects/${p.projectId}?tab=financials`} className="text-sm font-medium truncate hover:underline">{p.name}</Link>
                            <span className={`text-xs font-mono ${p.spi < 1 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              SPI {p.spi.toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Curves + budget health */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" /> EVM Curves (Cumulative)
                    </CardTitle>
                    <CardDescription className="text-xs">Planned (PV), Earned (EV), Actual (AC), and Forecast EAC by fiscal month.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={seriesForChart}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" fontSize={10} />
                          <YAxis fontSize={10} tickFormatter={fmtCompact} />
                          <Tooltip formatter={(v: any) => fmtCompact(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="PV" stroke="#3b82f6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="EV" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="AC" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="EAC" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Budget Health</CardTitle>
                    <CardDescription className="text-xs">Projects by EAC vs BAC.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-md bg-emerald-500/10">
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> <span className="text-sm">On Budget (±5%)</span></div>
                        <span className="font-semibold">{onBudget}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-md bg-blue-500/10">
                        <div className="flex items-center gap-2"><Banknote className="h-4 w-4 text-blue-500" /> <span className="text-sm">Under Budget</span></div>
                        <span className="font-semibold">{underBudget}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-md bg-destructive/10">
                        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> <span className="text-sm">Over Budget</span></div>
                        <span className="font-semibold">{overBudget}</span>
                      </div>
                      <div className="text-xs text-muted-foreground pt-2">
                        Variance at Completion (VAC): <span className={t.vac >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                          {t.vac >= 0 ? "+" : ""}<CompactCurrency value={t.vac} />
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Top Projects by Budget</CardTitle>
                  <CardDescription className="text-xs">BAC vs Actual Cost · sorted by BAC.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={[...data.projects].sort((a, b) => b.bac - a.bac).slice(0, 10).map(p => ({
                        name: p.name.length > 28 ? p.name.slice(0, 28) + "…" : p.name,
                        BAC: Math.round(p.bac),
                        AC: Math.round(p.ac),
                        EAC: Math.round(p.eacComputed),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" fontSize={10} tickFormatter={fmtCompact} />
                        <YAxis type="category" dataKey="name" width={160} fontSize={10} />
                        <Tooltip formatter={(v: any) => fmtCompact(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="BAC" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="AC" fill="#10b981" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="EAC" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Earned Value Management Detail</CardTitle>
                  <CardDescription className="text-xs">
                    Org-wide PMI EVM indicators at as-of fiscal month {data.asOfMonth || "—"}. See <a href="https://www.pmi.org/standards/earned-value-management" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary">PMBOK / PMI EVM</a>.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <EVMTile label="Planned Value (PV)" value={t.pv} />
                    <EVMTile label="Earned Value (EV)" value={t.ev} />
                    <EVMTile label="Actual Cost (AC)" value={t.ac} />
                    <EVMTile label="Estimate at Completion" value={t.eacComputed} sub={`ETC ${formatCurrency(t.etc, { compact: true })}`} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <EVMNumberTile label="Schedule Variance (SV)" value={t.ev - t.pv} />
                    <EVMNumberTile label="Cost Variance (CV)" value={t.ev - t.ac} />
                    <EVMNumberTile label="Variance at Completion (VAC)" value={t.vac} />
                    <div className="p-4 rounded-lg border">
                      <div className="text-xs text-muted-foreground mb-1">Budget Utilization</div>
                      <div className="text-xl font-bold">{t.bac > 0 ? fmtPct(t.ac / t.bac) : "0.0%"}</div>
                      <Progress value={t.bac > 0 ? Math.min(100, (t.ac / t.bac) * 100) : 0} className="h-1 mt-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      );
    }} />
  );
}

function EVMTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="p-4 rounded-lg border">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-bold"><CompactCurrency value={value} /></div>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function EVMNumberTile({ label, value }: { label: string; value: number }) {
  const tone = value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
  return (
    <div className="p-4 rounded-lg border">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>
        {value >= 0 ? "+" : ""}<CompactCurrency value={value} />
      </div>
    </div>
  );
}
