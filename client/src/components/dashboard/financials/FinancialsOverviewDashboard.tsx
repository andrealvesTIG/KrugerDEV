import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, CreditCard, Calculator, Percent, TrendingUp, AlertTriangle, Banknote, Target, CheckCircle2, Activity } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ComposedChart, Line, AreaChart, Area } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Progress } from "@/components/ui/progress";
import { FinancialsScope, KpiTile, EmptyState, COLORS, fmtPct } from "./shared";
import { formatCurrency } from "@/lib/format";

export function FinancialsOverviewDashboard() {
  return (
    <FinancialsScope render={({ data }) => {
      const t = data.totals;
      const fmtCompact = (v: number) => formatCurrency(v, { compact: true });
      const overBudget = data.projects.filter(p => p.eacComputed > p.bac && p.bac > 0).length;
      const onBudget = data.projects.filter(p => p.bac > 0 && Math.abs(p.eacComputed - p.bac) / p.bac <= 0.05).length;
      const underBudget = data.projects.filter(p => p.bac > 0 && p.eacComputed < p.bac * 0.95).length;
      const noData = t.bac === 0 && t.ac === 0;

      const seriesForChart = data.series.map(s => ({
        label: s.label,
        PV: Math.round(s.pvCum),
        EV: Math.round(s.evCum),
        AC: Math.round(s.acCum),
        EAC: Math.round(s.eacCum),
      }));

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
            <KpiTile label="CPI" icon={<Percent className="h-4 w-4 text-amber-500" />}
              value={t.cpi.toFixed(2)} tone={t.cpi >= 1 ? "good" : t.cpi >= 0.95 ? "warn" : "bad"}
              hint={t.cpi >= 1 ? "Cost efficient" : "Over spending"} />
            <KpiTile label="SPI" icon={<TrendingUp className="h-4 w-4 text-cyan-500" />}
              value={t.spi.toFixed(2)} tone={t.spi >= 1 ? "good" : t.spi >= 0.95 ? "warn" : "bad"}
              hint={t.spi >= 1 ? "On / ahead of plan" : "Behind schedule"} />
            <KpiTile label="EAC Forecast" icon={<Target className="h-4 w-4 text-indigo-500" />}
              value={<CompactCurrency value={t.eacComputed} />}
              hint={`VAC ${t.vac >= 0 ? "+" : ""}${formatCurrency(t.vac, { compact: true })}`}
              tone={t.vac >= 0 ? "good" : "bad"} />
          </div>

          {noData ? (
            <EmptyState message={`No financial entries found for FY ${data.fiscalYear}.`} />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" /> EVM Curves (Cumulative)
                    </CardTitle>
                    <CardDescription className="text-xs">Planned (PV), Earned (EV), Actual (AC), and Forecast EAC by fiscal month.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={seriesForChart}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" fontSize={10} />
                          <YAxis fontSize={10} tickFormatter={fmtCompact} />
                          <Tooltip formatter={(v: number) => fmtCompact(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
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
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> <span className="text-sm">On Budget</span></div>
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
                        <Tooltip formatter={(v: number) => fmtCompact(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
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
                  <CardDescription className="text-xs">Org-wide PMI EVM indicators at as-of fiscal month {data.asOfMonth || "—"}.</CardDescription>
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
