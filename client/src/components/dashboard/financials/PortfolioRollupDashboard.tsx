import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, PieChart, Pie, Cell } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { FinancialsScope, EmptyState, COLORS } from "./shared";
import { formatCurrency } from "@/lib/format";

export function PortfolioRollupDashboard() {
  return (
    <FinancialsScope render={({ data }) => {
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

      return (
        <div className="space-y-6">
          {noData ? <EmptyState message="No portfolios with financial entries to roll up." /> : (
            <>
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
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
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
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
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
                  <CardTitle className="text-sm font-medium">Portfolio Rollup Detail</CardTitle>
                  <CardDescription className="text-xs">Aggregated EVM metrics per portfolio for FY {data.fiscalYear}.</CardDescription>
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
