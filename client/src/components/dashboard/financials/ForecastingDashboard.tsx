import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, ReferenceLine } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FinancialsScope, EmptyState, KpiTile } from "./shared";
import { Target, Calculator, AlertTriangle, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export function ForecastingDashboard() {
  return (
    <FinancialsScope render={({ data }) => {
      const t = data.totals;
      const fmt = (v: number) => formatCurrency(v, { compact: true });
      const noData = t.bac === 0 && t.ac === 0;

      // Build forecast curve: keep AC up to as-of, then extrapolate using
      // straight-line burn-rate to total EAC across remaining months.
      const asOf = data.asOfMonth;
      const forecast = data.series.map((s, i) => {
        const isFuture = i + 1 > asOf;
        let acProjected: number | null = null;
        if (asOf > 0 && asOf < 12 && isFuture) {
          // Straight-line to EAC over remaining months.
          const acAtAsOf = data.series[asOf - 1].acCum;
          const remainingMonths = 12 - asOf;
          const stepsAhead = i + 1 - asOf;
          const projection = acAtAsOf + (t.eacComputed - acAtAsOf) * (stepsAhead / remainingMonths);
          acProjected = Math.round(projection);
        } else if (i + 1 === asOf) {
          acProjected = Math.round(s.acCum);
        }
        return {
          label: s.label,
          PlannedBAC: Math.round(s.pvCum),
          Actual: isFuture ? null : Math.round(s.acCum),
          Forecast: acProjected,
          EnteredEAC: s.eacCum > 0 ? Math.round(s.eacCum) : null,
        };
      });

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="BAC" value={<CompactCurrency value={t.bac} />} icon={<Target className="h-4 w-4 text-blue-500" />} hint="Approved baseline" />
            <KpiTile label="EAC (computed)" value={<CompactCurrency value={t.eacComputed} />} icon={<Calculator className="h-4 w-4 text-amber-500" />} hint="BAC ÷ CPI when CPI > 0" />
            <KpiTile label="EAC (entered)" value={<CompactCurrency value={t.eacEntered} />} icon={<Calculator className="h-4 w-4 text-purple-500" />} hint="From EAC type entries" />
            <KpiTile label="ETC (To Complete)" value={<CompactCurrency value={t.etc} />} icon={<TrendingUp className="h-4 w-4 text-cyan-500" />} hint={`Remaining work · ${12 - data.asOfMonth} months left`} tone={t.etc > t.bac - t.ac ? "warn" : "default"} />
          </div>

          {noData ? <EmptyState message={`No financial data to forecast for FY ${data.fiscalYear}.`} /> : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Spend Forecast vs Baseline</CardTitle>
                  <CardDescription className="text-xs">Solid line = actual spend; dashed line = projected spend assuming current performance.</CardDescription>
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
                        <Line type="monotone" dataKey="Forecast" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" />
                        <Line type="monotone" dataKey="EnteredEAC" stroke="#8b5cf6" strokeWidth={2} dot={false} name="EAC (entered)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Forecast Risk by Project
                  </CardTitle>
                  <CardDescription className="text-xs">Projects whose computed EAC exceeds BAC are flagged. Sorted by VAC severity.</CardDescription>
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
