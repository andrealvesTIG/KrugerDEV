import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, PieChart, Pie, Cell, LineChart, Line, ReferenceLine } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { FinancialsScope, EmptyState, COLORS } from "./shared";
import { formatCurrency } from "@/lib/format";
import { Download } from "lucide-react";
import { downloadCsv } from "./csvExport";

function indexCellClass(v: number | null): string {
  if (v == null || v === 0) return "bg-muted/40 text-muted-foreground";
  if (v >= 0.95) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
  if (v >= 0.85) return "bg-amber-500/20 text-amber-700 dark:text-amber-300";
  return "bg-destructive/20 text-destructive";
}

export function PortfolioRollupDashboard() {
  return (
    <FinancialsScope dashboardType="financials-portfolio" title="Portfolio Rollup" render={({ data }) => {
      const fmt = (v: number) => formatCurrency(v, { compact: true });
      const noData = data.portfolios.length === 0 || (data.totals.bac === 0 && data.totals.ac === 0);
      const rollup = data.portfolios;

      const barData = rollup.map(p => ({
        name: p.name.length > 18 ? p.name.slice(0, 18) + "…" : p.name,
        BAC: Math.round(p.bac),
        AC: Math.round(p.ac),
        EAC: Math.round(p.eacComputed),
      }));

      const pieData = rollup.filter(p => p.bac > 0).map((p, i) => ({
        name: p.name,
        value: p.bac,
        color: COLORS[i % COLORS.length],
      }));

      // Aggregate S-curve across all visible portfolios (data already scoped
      // by the user's selected portfolio if any).
      const aggregateSeries = data.series.map(s => ({
        label: s.label,
        Planned: Math.round(s.pvCum),
        Earned: Math.round(s.evCum),
        Actual: Math.round(s.acCum),
        EAC: Math.round(s.eacCum),
      }));

      // Portfolio × Period CPI heatmap. Per-month CPI per portfolio is
      // aggregated client-side from the per-project monthly arrays.
      const portfolioMonthly = rollup.map(pf => {
        const ev = Array(12).fill(0);
        const ac = Array(12).fill(0);
        for (const proj of data.projects) {
          if ((proj.portfolioId ?? null) !== pf.portfolioId) continue;
          for (let i = 0; i < 12; i++) {
            ev[i] += proj.evCum[i];
            ac[i] += proj.acCum[i];
          }
        }
        const cells = data.months.map((_, i) => {
          if (i + 1 > data.asOfMonth) return null;
          if (ac[i] <= 0) return null;
          return Number((ev[i] / ac[i]).toFixed(2));
        });
        return { ...pf, cells };
      });

      const exportRollupCsv = () => {
        const header = ["Portfolio", "Projects", "BAC", "AC", "EV", "CPI", "SPI", "EAC", "VAC"];
        const rows = rollup.map(p => [
          p.name, p.projectCount, p.bac.toFixed(2), p.ac.toFixed(2), p.ev.toFixed(2),
          p.cpi.toFixed(3), p.spi.toFixed(3), p.eacComputed.toFixed(2), p.vac.toFixed(2),
        ]);
        downloadCsv(`portfolio-rollup-fy${data.fiscalYear}.csv`, [header, ...rows]);
      };

      return (
        <div className="space-y-6">
          {noData ? <EmptyState message="No portfolios with financial entries to roll up." /> : (
            <>
              {/* Weighted KPI cards per portfolio */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {rollup.slice(0, 6).map(p => (
                  <Card key={`${p.portfolioId ?? "none"}`} data-testid={`card-portfolio-${p.portfolioId ?? "unassigned"}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium truncate">{p.name}</CardTitle>
                      <CardDescription className="text-xs">{p.projectCount} project{p.projectCount === 1 ? "" : "s"} · BAC {fmt(p.bac)}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-[10px] text-muted-foreground">CPI (weighted)</div>
                          <Badge variant={p.cpi >= 1 ? "default" : p.cpi >= 0.95 ? "secondary" : "destructive"} className="font-mono">{p.cpi.toFixed(2)}</Badge>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">SPI (weighted)</div>
                          <Badge variant={p.spi >= 1 ? "default" : p.spi >= 0.95 ? "secondary" : "destructive"} className="font-mono">{p.spi.toFixed(2)}</Badge>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">EAC</div>
                          <div className="font-semibold"><CompactCurrency value={p.eacComputed} /></div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">VAC</div>
                          <div className={`font-semibold ${p.vac >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {p.vac >= 0 ? "+" : ""}<CompactCurrency value={p.vac} />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Budget Allocation</CardTitle>
                    <CardDescription className="text-xs">BAC distribution across portfolios.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={90} paddingAngle={3}>
                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">BAC vs AC vs EAC by Portfolio</CardTitle>
                    <CardDescription className="text-xs">Compare planned, actual, and forecast cost per portfolio.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={10} />
                          <YAxis fontSize={10} tickFormatter={fmt} />
                          <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="BAC" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="AC" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="EAC" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Aggregate S-Curve</CardTitle>
                  <CardDescription className="text-xs">Cumulative PV / EV / AC / EAC across the selected portfolios for FY {data.fiscalYear}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={aggregateSeries}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={fmt} />
                        <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {data.asOfMonth > 0 && (
                          <ReferenceLine x={data.months[Math.max(0, data.asOfMonth - 1)].label} stroke="#94a3b8" strokeDasharray="4 4" />
                        )}
                        <Line type="monotone" dataKey="Planned" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Earned" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="EAC" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Portfolio CPI Heatmap by Period</CardTitle>
                  <CardDescription className="text-xs">Weighted cumulative CPI per portfolio per fiscal month.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="text-xs w-full" data-testid="table-portfolio-heatmap">
                    <thead>
                      <tr>
                        <th className="text-left font-medium pb-2 pr-3 sticky left-0 bg-background">Portfolio</th>
                        {data.months.map(m => <th key={m.monthNum} className="font-medium pb-2 px-1 text-center w-10">{m.label.slice(0, 3)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioMonthly.map(pf => (
                        <tr key={`${pf.portfolioId ?? "none"}`} data-testid={`row-pf-heatmap-${pf.portfolioId ?? "unassigned"}`}>
                          <td className="py-1 pr-3 max-w-[220px] truncate sticky left-0 bg-background font-medium">{pf.name}</td>
                          {pf.cells.map((c, i) => (
                            <td key={i} className={`py-1 px-1 text-center font-mono ${indexCellClass(c)}`} title={c == null ? "no data" : `CPI ${c.toFixed(2)}`}>
                              {c == null ? "—" : c.toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium">Portfolio Rollup Detail</CardTitle>
                    <CardDescription className="text-xs">Aggregated EVM metrics per portfolio for FY {data.fiscalYear}.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportRollupCsv} data-testid="button-export-portfolio-csv">
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Portfolio</TableHead>
                        <TableHead className="text-right">Projects</TableHead>
                        <TableHead className="text-right">BAC</TableHead>
                        <TableHead className="text-right">AC</TableHead>
                        <TableHead className="text-right">EV</TableHead>
                        <TableHead className="text-right">CPI</TableHead>
                        <TableHead className="text-right">SPI</TableHead>
                        <TableHead className="text-right">EAC</TableHead>
                        <TableHead className="text-right">VAC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rollup.map(p => (
                        <TableRow key={`${p.portfolioId ?? "none"}`} data-testid={`row-portfolio-${p.portfolioId ?? "unassigned"}`}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right">{p.projectCount}</TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.bac} /></TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.ac} /></TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.ev} /></TableCell>
                          <TableCell className="text-right">
                            <Badge variant={p.cpi >= 1 ? "default" : p.cpi >= 0.95 ? "secondary" : "destructive"} className="font-mono">{p.cpi.toFixed(2)}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={p.spi >= 1 ? "default" : p.spi >= 0.95 ? "secondary" : "destructive"} className="font-mono">{p.spi.toFixed(2)}</Badge>
                          </TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.eacComputed} /></TableCell>
                          <TableCell className={`text-right ${p.vac >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {p.vac >= 0 ? "+" : ""}<CompactCurrency value={p.vac} />
                          </TableCell>
                        </TableRow>
                      ))}
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
