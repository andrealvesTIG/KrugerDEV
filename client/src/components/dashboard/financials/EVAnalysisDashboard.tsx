import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, ScatterChart, CartesianGrid, XAxis, YAxis, Tooltip, Scatter, ReferenceLine, ZAxis } from "recharts";
import { CompactCurrency } from "@/components/CompactCurrency";
import { FinancialsScope, EmptyState, KpiTile } from "./shared";
import { Activity, TrendingUp, AlertTriangle, CheckCircle2, Download, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Link } from "wouter";
import { useMemo, useState } from "react";
import { downloadCsv } from "./csvExport";

type EvSortKey = "name" | "bac" | "pv" | "ev" | "ac" | "cv" | "sv" | "cpi" | "spi" | "eacComputed" | "etc" | "vac" | "tcpi";

export function EVAnalysisDashboard() {
  // Body is a real child component so internal hooks (useState/useMemo for
  // sorting) follow the rules of hooks even though FinancialsScope passes
  // data through a render prop that may be conditionally invoked.
  return <FinancialsScope dashboardType="financials-ev" title="Earned Value Analysis" render={({ data }) => <EVAnalysisBody data={data} />} />;
}

function EVAnalysisBody({ data }: { data: import("@/hooks/use-financial-analytics").FinancialAnalyticsResponse }) {
      const noData = data.totals.bac === 0 && data.totals.ac === 0;
      const t = data.totals;
      const sv = t.ev - t.pv;
      const cv = t.ev - t.ac;
      const projects = [...data.projects].filter(p => p.bac > 0 || p.ac > 0);
      // TCPI for each project: efficiency required to finish at BAC.
      const withDerived = useMemo(() => projects.map(p => {
        const tcpi = (p.bac - p.ac) > 0 ? (p.bac - p.ev) / (p.bac - p.ac) : null;
        return { ...p, cv: p.ev - p.ac, sv: p.ev - p.pv, tcpi };
      }), [projects]);

      // User-controlled sort over the EVM table. Default: BAC descending.
      const [sortKey, setSortKey] = useState<EvSortKey>("bac");
      const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
      const onSort = (k: EvSortKey) => {
        if (k === sortKey) {
          setSortDir(d => (d === "asc" ? "desc" : "asc"));
        } else {
          setSortKey(k);
          setSortDir(k === "name" ? "asc" : "desc");
        }
      };
      const sorted = useMemo(() => {
        const sign = sortDir === "asc" ? 1 : -1;
        return [...withDerived].sort((a, b) => {
          const av = a[sortKey] as number | string | null;
          const bv = b[sortKey] as number | string | null;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === "string" && typeof bv === "string") return sign * av.localeCompare(bv);
          return sign * (Number(av) - Number(bv));
        });
      }, [withDerived, sortKey, sortDir]);

      const SortIcon = ({ k }: { k: EvSortKey }) => {
        if (k !== sortKey) return <ArrowUpDown className="h-3 w-3 inline-block ml-1 opacity-40" />;
        return sortDir === "asc"
          ? <ArrowUp className="h-3 w-3 inline-block ml-1" />
          : <ArrowDown className="h-3 w-3 inline-block ml-1" />;
      };
      const sortBtn = (label: string, k: EvSortKey, align: "left" | "right" = "right") => (
        <button
          type="button"
          onClick={() => onSort(k)}
          className={`hover:text-foreground transition-colors ${align === "right" ? "text-right w-full" : "text-left"} font-medium`}
          data-testid={`button-sort-${k}`}
        >
          {label}
          <SortIcon k={k} />
        </button>
      );
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
                        <TableHead>{sortBtn("Project", "name", "left")}</TableHead>
                        <TableHead className="text-right">{sortBtn("BAC", "bac")}</TableHead>
                        <TableHead className="text-right">{sortBtn("PV", "pv")}</TableHead>
                        <TableHead className="text-right">{sortBtn("EV", "ev")}</TableHead>
                        <TableHead className="text-right">{sortBtn("AC", "ac")}</TableHead>
                        <TableHead className="text-right">{sortBtn("CV", "cv")}</TableHead>
                        <TableHead className="text-right">{sortBtn("SV", "sv")}</TableHead>
                        <TableHead className="text-right">{sortBtn("CPI", "cpi")}</TableHead>
                        <TableHead className="text-right">{sortBtn("SPI", "spi")}</TableHead>
                        <TableHead className="text-right">{sortBtn("EAC", "eacComputed")}</TableHead>
                        <TableHead className="text-right">{sortBtn("ETC", "etc")}</TableHead>
                        <TableHead className="text-right">{sortBtn("VAC", "vac")}</TableHead>
                        <TableHead className="text-right">{sortBtn("TCPI", "tcpi")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Grand Total pinned at top — sums dollars; recomputes ratios bottom-up
                          so they remain BAC/AC-weighted instead of a naive average. */}
                      {(() => {
                        const tot = sorted.reduce((acc, p) => {
                          acc.bac += p.bac; acc.pv += p.pv; acc.ev += p.ev; acc.ac += p.ac;
                          acc.eac += p.eacComputed; acc.etc += p.etc;
                          return acc;
                        }, { bac: 0, pv: 0, ev: 0, ac: 0, eac: 0, etc: 0 });
                        const cvT = tot.ev - tot.ac;
                        const svT = tot.ev - tot.pv;
                        const cpiT = tot.ac > 0 ? tot.ev / tot.ac : 0;
                        const spiT = tot.pv > 0 ? tot.ev / tot.pv : 0;
                        const vacT = tot.bac - tot.eac;
                        const tcpiDen = tot.bac - tot.ac;
                        const tcpiT = tcpiDen > 0 ? (tot.bac - tot.ev) / tcpiDen : null;
                        return (
                          <TableRow data-testid="row-evm-grand-total" className="font-semibold bg-muted/60 border-b-2 border-border">
                            <TableCell className="font-semibold">Grand Total ({sorted.length} project{sorted.length === 1 ? "" : "s"})</TableCell>
                            <TableCell className="text-right"><CompactCurrency value={tot.bac} /></TableCell>
                            <TableCell className="text-right"><CompactCurrency value={tot.pv} /></TableCell>
                            <TableCell className="text-right"><CompactCurrency value={tot.ev} /></TableCell>
                            <TableCell className="text-right"><CompactCurrency value={tot.ac} /></TableCell>
                            <TableCell className={`text-right ${cvT >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                              {cvT >= 0 ? "+" : ""}<CompactCurrency value={cvT} />
                            </TableCell>
                            <TableCell className={`text-right ${svT >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                              {svT >= 0 ? "+" : ""}<CompactCurrency value={svT} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={cpiT >= 1 ? "default" : cpiT >= 0.95 ? "secondary" : "destructive"} className="font-mono">{cpiT.toFixed(2)}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={spiT >= 1 ? "default" : spiT >= 0.95 ? "secondary" : "destructive"} className="font-mono">{spiT.toFixed(2)}</Badge>
                            </TableCell>
                            <TableCell className="text-right"><CompactCurrency value={tot.eac} /></TableCell>
                            <TableCell className="text-right"><CompactCurrency value={tot.etc} /></TableCell>
                            <TableCell className={`text-right ${vacT >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                              {vacT >= 0 ? "+" : ""}<CompactCurrency value={vacT} />
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{tcpiT == null ? "—" : tcpiT.toFixed(2)}</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        );
                      })()}
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
}
