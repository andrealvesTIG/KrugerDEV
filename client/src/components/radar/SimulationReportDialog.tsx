import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, ArrowUpCircle, ArrowDownCircle, XCircle, PlusCircle, PlayCircle, Filter } from "lucide-react";
import type { SimulationLogEntry, SimulationLogAction } from "@/lib/simulationEngine";
import type { SimulationSummary } from "./FiltersPanel";
import { formatCurrency as sharedFmtCurrency } from "@/lib/format";
import { CompactCurrency } from "@/components/CompactCurrency";

interface SimulationReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: SimulationLogEntry[];
  summary: SimulationSummary;
  timeProjectionMonths: number;
  projectedDate: Date;
  totalSignals: number;
  totalCostExposure: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

const ACTION_CONFIG: Record<SimulationLogAction, { label: string; color: string; bgColor: string; icon: typeof ArrowUpCircle }> = {
  closed: { label: "Closed", color: "text-green-600", bgColor: "bg-green-50 border-green-200", icon: XCircle },
  mitigated: { label: "Mitigated", color: "text-emerald-600", bgColor: "bg-emerald-50 border-emerald-200", icon: ArrowDownCircle },
  escalated: { label: "Escalated", color: "text-red-600", bgColor: "bg-red-50 border-red-200", icon: ArrowUpCircle },
  in_progress: { label: "In Progress", color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200", icon: PlayCircle },
  new_emerged: { label: "New Emerged", color: "text-purple-600", bgColor: "bg-purple-50 border-purple-200", icon: PlusCircle },
  removed: { label: "Fully Resolved", color: "text-slate-500", bgColor: "bg-slate-50 border-slate-200", icon: XCircle },
};

type FilterType = "all" | SimulationLogAction;

const fmtCurrency = (val: number) => sharedFmtCurrency(val, { autoCompact: true });

export default function SimulationReportDialog({
  open,
  onOpenChange,
  log,
  summary,
  timeProjectionMonths,
  projectedDate,
  totalSignals,
  totalCostExposure,
  highCount,
  mediumCount,
  lowCount,
}: SimulationReportDialogProps) {
  const [filterAction, setFilterAction] = useState<FilterType>("all");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const filteredLog = filterAction === "all" ? log : log.filter(e => e.action === filterAction);

  const actionCounts = log.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.action] = (acc[entry.action] || 0) + 1;
    return acc;
  }, {});

  const handleExportPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 35, "F");
      doc.setTextColor(74, 222, 128);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("PMO Radar — Simulation Report", margin, 15);
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}`, margin, 23);
      doc.text(`Projection: +${timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)} months → ${projectedDate.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}`, margin, 30);
      y = 45;

      doc.setFillColor(241, 245, 249);
      doc.roundedRect(margin, y, contentWidth, 28, 3, 3, "F");
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", margin + 5, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      const summaryItems = [
        `Total Signals: ${totalSignals}`,
        `High: ${highCount}  |  Medium: ${mediumCount}  |  Low: ${lowCount}`,
        `Cost Exposure: ${fmtCurrency(totalCostExposure)}`,
        `Resolved: ${summary.closedCount}  |  Escalated: ${summary.escalatedCount}  |  New: ${summary.newCount}`,
      ];
      summaryItems.forEach((item, i) => {
        doc.text(item, margin + 5, y + 14 + i * 4);
      });
      y += 35;

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`Simulation Event Log (${log.length} events)`, margin, y);
      y += 7;

      doc.setFillColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 6, "F");
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("MONTH", margin + 2, y + 4);
      doc.text("ACTION", margin + 18, y + 4);
      doc.text("ITEM", margin + 42, y + 4);
      doc.text("PROJECT", margin + 105, y + 4);
      doc.text("SCORE", margin + 145, y + 4);
      doc.text("COST", margin + 163, y + 4);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);

      for (let idx = 0; idx < log.length; idx++) {
        const entry = log[idx];
        if (y > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = margin;
        }

        const isEven = idx % 2 === 0;
        if (isEven) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y - 2, contentWidth, 7, "F");
        }

        doc.setTextColor(100, 116, 139);
        doc.text(`+${entry.approximateMonth % 1 === 0 ? entry.approximateMonth : entry.approximateMonth.toFixed(1)}mo`, margin + 2, y + 2);

        const cfg = ACTION_CONFIG[entry.action];
        if (entry.action === "escalated") doc.setTextColor(220, 38, 38);
        else if (entry.action === "closed" || entry.action === "mitigated" || entry.action === "removed") doc.setTextColor(22, 163, 74);
        else if (entry.action === "new_emerged") doc.setTextColor(147, 51, 234);
        else doc.setTextColor(37, 99, 235);
        doc.setFont("helvetica", "bold");
        doc.text(cfg.label.toUpperCase(), margin + 18, y + 2);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 41, 59);
        const titleText = entry.title.length > 38 ? entry.title.slice(0, 36) + "…" : entry.title;
        doc.text(`[${entry.itemType.toUpperCase()}] ${titleText}`, margin + 42, y + 2);

        doc.setTextColor(100, 116, 139);
        const projText = entry.project.length > 22 ? entry.project.slice(0, 20) + "…" : entry.project;
        doc.text(projText, margin + 105, y + 2);

        let scoreText = "";
        if (entry.originalRiskScore !== undefined && entry.projectedRiskScore !== undefined) {
          scoreText = `${entry.originalRiskScore} → ${entry.projectedRiskScore}`;
        } else if (entry.projectedRiskScore !== undefined) {
          scoreText = String(entry.projectedRiskScore);
        } else if (entry.originalRiskScore !== undefined) {
          scoreText = String(entry.originalRiskScore);
        }
        doc.text(scoreText, margin + 145, y + 2);

        let costText = "";
        if (entry.originalCostExposure !== undefined && entry.projectedCostExposure !== undefined) {
          costText = `${fmtCurrency(entry.originalCostExposure)} → ${fmtCurrency(entry.projectedCostExposure)}`;
        } else if (entry.projectedCostExposure !== undefined) {
          costText = fmtCurrency(entry.projectedCostExposure);
        } else if (entry.originalCostExposure !== undefined) {
          costText = fmtCurrency(entry.originalCostExposure);
        }
        doc.text(costText, margin + 163, y + 2);

        y += 7;
      }

      y += 5;
      if (y > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        y = margin;
      }
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7);
      doc.text("This report was generated by FridayReport.AI PMO Radar simulation engine. All projected data is deterministic and for planning purposes only.", margin, y);

      doc.save(`PMO_Radar_Simulation_Report_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const filterButtons: { value: FilterType; label: string; count: number }[] = ([
    { value: "all" as FilterType, label: "All", count: log.length },
    { value: "closed" as FilterType, label: "Closed", count: actionCounts["closed"] || 0 },
    { value: "mitigated" as FilterType, label: "Mitigated", count: actionCounts["mitigated"] || 0 },
    { value: "removed" as FilterType, label: "Resolved", count: actionCounts["removed"] || 0 },
    { value: "escalated" as FilterType, label: "Escalated", count: actionCounts["escalated"] || 0 },
    { value: "in_progress" as FilterType, label: "In Progress", count: actionCounts["in_progress"] || 0 },
    { value: "new_emerged" as FilterType, label: "New", count: actionCounts["new_emerged"] || 0 },
  ] as { value: FilterType; label: string; count: number }[]).filter(f => f.value === "all" || f.count > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              <div>
                <DialogTitle>Simulation Report</DialogTitle>
                <DialogDescription>
                  Projection +{timeProjectionMonths % 1 === 0 ? timeProjectionMonths : timeProjectionMonths.toFixed(1)} months → {projectedDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={isGeneratingPdf || log.length === 0}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {isGeneratingPdf ? "Generating..." : "Export PDF"}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Signals</div>
              <div className="text-xl font-bold">{totalSignals}</div>
            </div>
            <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <div className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 mb-1">Resolved</div>
              <div className="text-xl font-bold text-green-700 dark:text-green-400">{summary.closedCount}</div>
            </div>
            <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <div className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">Escalated</div>
              <div className="text-xl font-bold text-red-700 dark:text-red-400">{summary.escalatedCount}</div>
            </div>
            <div className="rounded-lg border p-3 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
              <div className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">New Emerged</div>
              <div className="text-xl font-bold text-purple-700 dark:text-purple-400">{summary.newCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-2 text-center">
              <span className="text-xs text-red-500 font-bold">{highCount}</span>
              <span className="text-[10px] text-muted-foreground ml-1">High</span>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <span className="text-xs text-yellow-500 font-bold">{mediumCount}</span>
              <span className="text-[10px] text-muted-foreground ml-1">Medium</span>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <span className="text-xs text-green-500 font-bold">{lowCount}</span>
              <span className="text-[10px] text-muted-foreground ml-1">Low</span>
            </div>
          </div>

          {totalCostExposure > 0 && (
            <div className="rounded-lg border p-3 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
              <div className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">Projected Total Cost Exposure</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400"><CompactCurrency value={totalCostExposure} /></div>
            </div>
          )}

          <div className="flex items-center gap-2 border-t pt-3">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex flex-wrap gap-1">
              {filterButtons.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilterAction(f.value)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                    filterAction === f.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-1.5 pr-4">
              {filteredLog.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {log.length === 0
                    ? "No simulation events. Move the time projection slider to generate events."
                    : "No events match this filter."}
                </div>
              ) : (
                filteredLog.map((entry, i) => {
                  const cfg = ACTION_CONFIG[entry.action];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={`${entry.signalId}-${entry.action}-${i}`}
                      className={`flex items-start gap-3 rounded-lg border p-2.5 text-xs ${cfg.bgColor} dark:bg-opacity-10`}
                    >
                      <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                        <Icon className={`h-4 w-4 ${cfg.color}`} />
                        <span className="text-[9px] text-muted-foreground font-mono">+{entry.approximateMonth % 1 === 0 ? entry.approximateMonth : entry.approximateMonth.toFixed(1)}mo</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`font-semibold uppercase text-[9px] tracking-wider ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          <span className={`px-1.5 py-0 rounded text-[9px] font-bold uppercase ${
                            entry.itemType === "issue" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                          }`}>
                            {entry.itemType}
                          </span>
                          {entry.isSimulated && (
                            <span className="px-1.5 py-0 rounded text-[9px] font-bold uppercase bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 border border-dashed border-purple-300">
                              SIM
                            </span>
                          )}
                          <span className="px-1.5 py-0 rounded text-[9px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 capitalize">
                            {entry.category}
                          </span>
                        </div>
                        <div className="font-medium text-foreground truncate">{entry.title}</div>
                        <div className="text-muted-foreground mt-0.5">
                          {entry.project}
                          {entry.originalRiskScore !== undefined && entry.projectedRiskScore !== undefined && (
                            <span className="ml-2">Score: {entry.originalRiskScore} → {entry.projectedRiskScore}</span>
                          )}
                          {entry.originalRiskScore !== undefined && entry.projectedRiskScore === undefined && (
                            <span className="ml-2">Score: {entry.originalRiskScore}</span>
                          )}
                          {entry.projectedRiskScore !== undefined && entry.originalRiskScore === undefined && (
                            <span className="ml-2">Score: {entry.projectedRiskScore}</span>
                          )}
                          {(entry.originalCostExposure !== undefined || entry.projectedCostExposure !== undefined) && (
                            <span className="ml-2">
                              Cost: {entry.originalCostExposure !== undefined && entry.projectedCostExposure !== undefined
                                ? <><CompactCurrency value={entry.originalCostExposure} /> → <CompactCurrency value={entry.projectedCostExposure} /></>
                                : <CompactCurrency value={entry.originalCostExposure ?? entry.projectedCostExposure ?? 0} />
                              }
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
