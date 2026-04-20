import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, Area, AreaChart, ReferenceLine } from "recharts";
import { FinancialsScope, EmptyState } from "./shared";
import { formatCurrency } from "@/lib/format";

export function SCurveDashboard() {
  return (
    <FinancialsScope render={({ data }) => {
      const fmt = (v: number) => formatCurrency(v, { compact: true });
      const noData = data.totals.bac === 0 && data.totals.ac === 0;
      const series = data.series.map(s => ({
        label: s.label,
        Planned: Math.round(s.pvCum),
        Earned: Math.round(s.evCum),
        Actual: Math.round(s.acCum),
      }));

      return (
        <div className="space-y-6">
          {noData ? <EmptyState message={`No financial data for FY ${data.fiscalYear}.`} /> : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Cost S-Curve (Cumulative)</CardTitle>
                  <CardDescription className="text-xs">
                    PV vs EV vs AC over the fiscal year. Vertical line marks the as-of period.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={series}>
                        <defs>
                          <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={fmt} />
                        <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {data.asOfMonth > 0 && (
                          <ReferenceLine x={data.months[Math.max(0, data.asOfMonth - 1)].label} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "Today", position: "top", fontSize: 10 }} />
                        )}
                        <Area type="monotone" dataKey="Planned" stroke="#3b82f6" strokeWidth={2} fill="url(#pvFill)" />
                        <Line type="monotone" dataKey="Earned" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Cumulative Spend (Actual)</CardTitle>
                    <CardDescription className="text-xs">Period burn against the planned baseline.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={series}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" fontSize={10} />
                          <YAxis fontSize={10} tickFormatter={fmt} />
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                          <Area type="monotone" dataKey="Actual" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                          <Area type="monotone" dataKey="Planned" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Earned Value Curve</CardTitle>
                    <CardDescription className="text-xs">Cumulative work earned (BAC × % complete distributed across periods).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={series}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" fontSize={10} />
                          <YAxis fontSize={10} tickFormatter={fmt} />
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                          <Area type="monotone" dataKey="Earned" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      );
    }} />
  );
}
