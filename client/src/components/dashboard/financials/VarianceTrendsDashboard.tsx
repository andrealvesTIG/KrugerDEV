import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, ReferenceLine } from "recharts";
import { FinancialsScope, EmptyState, KpiTile } from "./shared";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Activity, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export function VarianceTrendsDashboard() {
  return (
    <FinancialsScope render={({ data }) => {
      const t = data.totals;
      const noData = t.bac === 0 && t.ac === 0;
      const fmt = (v: number) => formatCurrency(v, { compact: true });

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
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={fmt} />
                        <Tooltip formatter={(v: any) => v == null ? "—" : fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="#94a3b8" />
                        <Line type="monotone" dataKey="CV" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                        <Line type="monotone" dataKey="SV" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                      </LineChart>
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
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} domain={[0.5, 1.5]} />
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: "On Plan", position: "right", fontSize: 10 }} />
                        <Line type="monotone" dataKey="CPI" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                        <Line type="monotone" dataKey="SPI" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
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
