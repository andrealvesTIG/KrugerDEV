import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, ScatterChart, CartesianGrid, XAxis, YAxis, Tooltip, Scatter, ReferenceLine, ZAxis } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { FinancialsScope, EmptyState, KpiTile } from "./shared";
import { Activity, TrendingUp, AlertTriangle, CheckCircle2, Download, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { downloadCsv } from "./csvExport";

export function EVAnalysisDashboard() {
  return (
    <FinancialsScope render={({ data }) => {
      const noData = data.totals.bac === 0 && data.totals.ac === 0;
      const t = data.totals;
      const sv = t.ev - t.pv;
      const cv = t.ev - t.ac;
      const projects = [...data.projects].filter(p => p.bac > 0 || p.ac > 0);
      // TCPI for each project: efficiency required to finish at BAC.
      const withDerived = projects.map(p => {
        const tcpi = (p.bac - p.ac) > 0 ? (p.bac - p.ev) / (p.bac - p.ac) : null;
        return { ...p, cv: p.ev - p.ac, sv: p.ev - p.pv, tcpi };
      });
      const sorted = [...withDerived].sort((a, b) => b.bac - a.bac);
      const scatter = projects.map(p => ({
        x: p.spi,
        y: p.cpi,
        z: Math.max(40, Math.min(400, p.bac / Math.max(1, t.bac / projects.length))),
        name: p.name,
      }));

      const exportCsv = () => {
        const header = ["Project", "BAC", "PV", "EV", "AC", "CV", "SV", "CPI", "SPI", "EAC", "ETC", "VAC", "TCPI"];
        const rows = sorted.map(p => [
          p.name,
          p.bac.toFixed(2),
          p.pv.toFixed(2),
          p.ev.toFixed(2),
          p.ac.toFixed(2),
          p.cv.toFixed(2),
          p.sv.toFixed(2),
          p.cpi.toFixed(3),
          p.spi.toFixed(3),
          p.eacComputed.toFixed(2),
          p.etc.toFixed(2),
          p.vac.toFixed(2),
          p.tcpi == null ? "" : p.tcpi.toFixed(3),
        ]);
        downloadCsv(`ev-analysis-fy${data.fiscalYear}.csv`, [header, ...rows]);
      };

      return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiTile label="CPI" value={t.cpi.toFixed(2)} tone={t.cpi >= 1 ? "good" : "bad"} icon={<Activity className="h-4 w-4 text-amber-500" />} hint={t.cpi >= 1 ? "Spending efficiently" : "Over running cost"} />
            <KpiTile label="SPI" value={t.spi.toFixed(2)} tone={t.spi >= 1 ? "good" : "bad"} icon={<TrendingUp className="h-4 w-4 text-cyan-500" />} hint={t.spi >= 1 ? "On / ahead of plan" : "Behind schedule"} />
            <KpiTile label="Cost Variance (CV)" value={<><span>{cv >= 0 ? "+" : ""}</span><CompactCurrency value={cv} /></>} tone={cv >= 0 ? "good" : "bad"} icon={cv >= 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />} hint="EV − AC" />
            <KpiTile label="Schedule Variance (SV)" value={<><span>{sv >= 0 ? "+" : ""}</span><CompactCurrency value={sv} /></>} tone={sv >= 0 ? "good" : "bad"} icon={sv >= 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-destructive" />} hint="EV − PV" />
          </div>

          {noData ? <EmptyState message={`No financial entries for FY ${data.fiscalYear}.`} /> : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">CPI vs SPI Quadrant</CardTitle>
                  <CardDescription className="text-xs">
                    Top-right quadrant (CPI ≥ 1 and SPI ≥ 1) is healthy. Bubble size = relative BAC.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="x" name="SPI" domain={[0.5, 1.5]} fontSize={11} label={{ value: "SPI", position: "insideBottom", offset: -5, fontSize: 11 }} />
                        <YAxis type="number" dataKey="y" name="CPI" domain={[0.5, 1.5]} fontSize={11} label={{ value: "CPI", angle: -90, position: "insideLeft", fontSize: 11 }} />
                        <ZAxis type="number" dataKey="z" range={[60, 400]} />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ borderRadius: 8, fontSize: 11 }} content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as { name: string; x: number; y: number };
                          return (
                            <div className="bg-background border rounded-md p-2 text-xs shadow">
                              <div className="font-medium">{p.name}</div>
                              <div>SPI: {p.x.toFixed(2)} · CPI: {p.y.toFixed(2)}</div>
                            </div>
                          );
                        }} />
                        <ReferenceLine x={1} stroke="#94a3b8" />
                        <ReferenceLine y={1} stroke="#94a3b8" />
                        <Scatter data={scatter} fill="#8b5cf6" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-medium">Project EVM Detail</CardTitle>
                    <CardDescription className="text-xs">Per-project EVM metrics for FY {data.fiscalYear}. Click a row to drill into the project's Financials grid.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-evm-csv">
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">BAC</TableHead>
                        <TableHead className="text-right">PV</TableHead>
                        <TableHead className="text-right">EV</TableHead>
                        <TableHead className="text-right">AC</TableHead>
                        <TableHead className="text-right">CV</TableHead>
                        <TableHead className="text-right">SV</TableHead>
                        <TableHead className="text-right">CPI</TableHead>
                        <TableHead className="text-right">SPI</TableHead>
                        <TableHead className="text-right">EAC</TableHead>
                        <TableHead className="text-right">ETC</TableHead>
                        <TableHead className="text-right">VAC</TableHead>
                        <TableHead className="text-right">TCPI</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map(p => (
                        <TableRow key={p.projectId} data-testid={`row-evm-${p.projectId}`}>
                          <TableCell className="max-w-[260px] truncate font-medium">
                            <Link href={`/projects/${p.projectId}?tab=financials`} className="hover:underline" data-testid={`link-project-${p.projectId}`}>
                              {p.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.bac} /></TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.pv} /></TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.ev} /></TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.ac} /></TableCell>
                          <TableCell className={`text-right ${p.cv >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {p.cv >= 0 ? "+" : ""}<CompactCurrency value={p.cv} />
                          </TableCell>
                          <TableCell className={`text-right ${p.sv >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {p.sv >= 0 ? "+" : ""}<CompactCurrency value={p.sv} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={p.cpi >= 1 ? "default" : p.cpi >= 0.95 ? "secondary" : "destructive"} className="font-mono">{p.cpi.toFixed(2)}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={p.spi >= 1 ? "default" : p.spi >= 0.95 ? "secondary" : "destructive"} className="font-mono">{p.spi.toFixed(2)}</Badge>
                          </TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.eacComputed} /></TableCell>
                          <TableCell className="text-right"><CompactCurrency value={p.etc} /></TableCell>
                          <TableCell className={`text-right ${p.vac >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {p.vac >= 0 ? "+" : ""}<CompactCurrency value={p.vac} />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{p.tcpi == null ? "—" : p.tcpi.toFixed(2)}</TableCell>
                          <TableCell>
                            <Link href={`/projects/${p.projectId}?tab=financials`} className="text-muted-foreground hover:text-primary inline-flex">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
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
