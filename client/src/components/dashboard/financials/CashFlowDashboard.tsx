import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line, ReferenceLine } from "recharts";
import { FinancialsScope, EmptyState, KpiTile } from "./shared";
import { CompactCurrency } from "@/components/CompactCurrency";
import { Banknote, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export function CashFlowDashboard() {
  return (
    <FinancialsScope dashboardType="financials-cashflow" title="Cash Flow Forecast" render={({ data }) => {
      const fmt = (v: number) => formatCurrency(v, { compact: true });
      const t = data.totals;
      const noData = t.bac === 0 && t.ac === 0;

      // Per-month outflow: Actual when month is in the past, Forecast (FCST or
      // remaining ETC distributed evenly) for future months.
      const remainingMonths = Math.max(0, 12 - data.asOfMonth);
      const evenETC = remainingMonths > 0 ? t.etc / remainingMonths : 0;
      const rows = data.series.map((s, i) => {
        const isFuture = i + 1 > data.asOfMonth;
        const planned = s.pv;
        const actual = isFuture ? 0 : s.ac;
        const forecast = isFuture ? (s.fcst > 0 ? s.fcst : evenETC) : 0;
        return {
          label: s.label,
          Planned: Math.round(planned),
          Actual: Math.round(actual),
          Forecast: Math.round(forecast),
          NetOutflow: Math.round(actual + forecast),
          Cumulative: 0, // filled below
        };
      });
      let cum = 0;
      for (const r of rows) { cum += r.NetOutflow; r.Cumulative = Math.round(cum); }

      const peakMonth = rows.reduce<{ label: string; v: number }>((acc, r) => r.NetOutflow > acc.v ? { label: r.label, v: r.NetOutflow } : acc, { label: "—", v: 0 });

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="Total Cash Out (FY)" value={<CompactCurrency value={cum} />} icon={<TrendingDown className="h-4 w-4 text-destructive" />} />
            <KpiTile label="Spent To Date" value={<CompactCurrency value={t.ac} />} icon={<Banknote className="h-4 w-4 text-emerald-500" />} hint={`Through M${data.asOfMonth || "—"}`} />
            <KpiTile label="Remaining Forecast" value={<CompactCurrency value={t.etc} />} icon={<Wallet className="h-4 w-4 text-amber-500" />} hint={`Over ${remainingMonths} month${remainingMonths === 1 ? "" : "s"}`} />
            <KpiTile label="Peak Month" value={<CompactCurrency value={peakMonth.v} />} icon={<TrendingUp className="h-4 w-4 text-purple-500" />} hint={peakMonth.label} />
          </div>

          {noData ? <EmptyState message={`No cash flow data for FY ${data.fiscalYear}.`} /> : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Cash Flow</CardTitle>
                  <CardDescription className="text-xs">Planned vs Actual outflows; future months show Forecast.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={rows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={fmt} />
                        <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {data.asOfMonth > 0 && data.asOfMonth < 12 && (
                          <ReferenceLine x={data.months[data.asOfMonth - 1].label} stroke="#94a3b8" strokeDasharray="3 3" />
                        )}
                        <Bar dataKey="Planned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Actual" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Forecast" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Cumulative Cash Outflow</CardTitle>
                  <CardDescription className="text-xs">Running total of Actual + Forecast spend.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={rows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={fmt} />
                        <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Line type="monotone" dataKey="Cumulative" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3 }} />
                      </ComposedChart>
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
