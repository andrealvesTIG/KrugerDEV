import { X, ExternalLink, Pencil } from "lucide-react";
import { Link } from "wouter";
import type { RiskSignal } from "./RadarCanvas";

interface DetailsDrawerProps {
  signal: RiskSignal | null;
  onClose: () => void;
  isDark: boolean;
  onEdit?: (signal: RiskSignal) => void;
}

function getRiskLabel(score: number) {
  if (score > 70) return "High";
  if (score > 30) return "Medium";
  return "Low";
}

function getRiskColor(score: number, isDark: boolean) {
  if (score > 70) return isDark ? "text-red-400" : "text-red-600";
  if (score > 30) return isDark ? "text-yellow-400" : "text-yellow-600";
  return isDark ? "text-green-400" : "text-green-600";
}

function getRiskBg(score: number) {
  if (score > 70) return "bg-red-500/10 border-red-500/30";
  if (score > 30) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-green-500/10 border-green-500/30";
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export default function DetailsDrawer({ signal, onClose, isDark, onEdit }: DetailsDrawerProps) {
  const panelBg = isDark ? "bg-slate-900 border-l border-green-500/10 shadow-black/50" : "bg-white border-l border-green-600/10 shadow-slate-300/50";
  const heading = isDark ? "text-green-400" : "text-green-700";
  const closeBtn = isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600";
  const metaLabel = isDark ? "text-slate-500" : "text-slate-400";
  const titleText = isDark ? "text-slate-200" : "text-slate-800";
  const subtitleText = isDark ? "text-slate-300" : "text-slate-600";
  const cardBg = isDark ? "bg-slate-800/50" : "bg-slate-100/80";
  const metaSmall = isDark ? "text-slate-500" : "text-slate-400";
  const barBg = isDark ? "bg-slate-700" : "bg-slate-200";
  const linkColor = isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-500";
  const isOverdue = signal && signal.timeOffsetDays < 0 && signal.dueDate;

  return (
    <div
      className={`absolute top-0 right-0 h-full shadow-2xl z-50 transition-all duration-300 ease-in-out ${panelBg} ${
        signal ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ width: "min(20rem, 85vw)" }}
    >
      {signal && (
        <div className="flex flex-col h-full p-4 overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${heading}`}>
              Signal Details
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={onClose}
                className={`transition-colors p-1 ${closeBtn}`}
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>Title</div>
              <div className={`text-sm font-medium ${titleText}`}>{signal.title}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                  signal.itemType === "issue"
                    ? "bg-blue-500/20 text-blue-500"
                    : "bg-orange-500/20 text-orange-500"
                }`}>
                  {signal.itemType === "issue" ? "Issue" : "Risk"}
                </span>
                {isOverdue && (
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-500 rounded">
                    Overdue
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>Project</div>
              <Link
                href={`/projects/${signal.projectId}`}
                className={`text-sm font-medium inline-flex items-center gap-1 underline underline-offset-2 transition-colors ${linkColor}`}
              >
                {signal.project}
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {signal.portfolioId && signal.portfolioName && (
              <div>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>Portfolio</div>
                <Link
                  href={`/portfolios/${signal.portfolioId}`}
                  className={`text-sm font-medium inline-flex items-center gap-1 underline underline-offset-2 transition-colors ${linkColor}`}
                >
                  {signal.portfolioName}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            )}

            <div className={`rounded-lg border p-3 ${getRiskBg(signal.riskScore)}`}>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>
                Risk Score
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${getRiskColor(signal.riskScore, isDark)}`}>
                  {signal.riskScore}
                </span>
                <span className={`text-xs ${getRiskColor(signal.riskScore, isDark)}`}>
                  {getRiskLabel(signal.riskScore)}
                </span>
              </div>
              <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${barBg}`}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${signal.riskScore}%`,
                    backgroundColor:
                      signal.riskScore > 70
                        ? "#ef4444"
                        : signal.riskScore > 30
                          ? "#eab308"
                          : "#22c55e",
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg p-3 ${cardBg}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>
                  Time Offset
                </div>
                <div className={`text-sm font-medium ${titleText}`}>
                  {signal.timeOffsetDays > 0
                    ? `+${signal.timeOffsetDays}d`
                    : `${signal.timeOffsetDays}d`}
                </div>
                <div className={`text-[10px] ${metaSmall}`}>
                  {signal.timeOffsetDays > 0 ? "In the future" : "In the past"}
                </div>
              </div>

              <div className={`rounded-lg p-3 ${cardBg}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>
                  Impact
                </div>
                <div className={`text-sm font-medium ${titleText}`}>{signal.impactScore}</div>
                <div className={`text-[10px] ${metaSmall}`}>Impact score</div>
              </div>

              <div className={`rounded-lg p-3 ${cardBg}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>
                  Confidence
                </div>
                <div className={`text-sm font-medium ${titleText}`}>
                  {Math.round(signal.confidence * 100)}%
                </div>
                <div className={`text-[10px] ${metaSmall}`}>Signal confidence</div>
              </div>

              <div className={`rounded-lg p-3 ${cardBg}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>
                  Type
                </div>
                <div className={`text-sm font-medium capitalize ${titleText}`}>{signal.type}</div>
                <div className={`text-[10px] ${metaSmall}`}>Risk category</div>
              </div>
            </div>

            {signal.costExposure != null && signal.costExposure > 0 && (
              <div className={`rounded-lg p-3 ${isOverdue ? "bg-red-500/10 border border-red-500/30" : cardBg}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>
                  Cost Exposure
                </div>
                <div className={`text-lg font-bold ${isOverdue ? "text-red-500" : titleText}`}>
                  {formatCurrency(signal.costExposure)}
                </div>
              </div>
            )}

            {signal.dueDate && (
              <div className={`rounded-lg p-3 ${isOverdue ? "bg-red-500/10 border border-red-500/30" : cardBg}`}>
                <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>
                  Due Date
                </div>
                <div className={`text-sm font-medium ${isOverdue ? "text-red-500" : titleText}`}>
                  {new Date(signal.dueDate + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
            )}

            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-2 ${metaLabel}`}>
                Radar Position
              </div>
              <div className={`rounded-lg p-3 space-y-1 ${cardBg}`}>
                <div className="flex justify-between text-xs">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>Quadrant</span>
                  <span className={titleText}>
                    {signal.timeOffsetDays >= 0 ? "Future" : "Past"} /{" "}
                    {signal.riskScore > 50 ? "High" : "Low"} Risk
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>Distance from center</span>
                  <span className={titleText}>
                    {Math.abs(signal.timeOffsetDays)}d
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>Status</span>
                  <span className={`font-medium ${
                    signal.status === "Closed" ? (isDark ? "text-slate-500" : "text-slate-400") :
                    signal.status === "Mitigated" ? (isDark ? "text-green-400" : "text-green-600") :
                    titleText
                  }`}>
                    {signal.status}
                  </span>
                </div>
              </div>
            </div>

            {onEdit && (
              <button
                onClick={() => onEdit(signal)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  isDark
                    ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                    : "bg-green-500/10 border-green-500/30 text-green-700 hover:bg-green-500/20"
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                {signal.itemType === "issue" ? "Edit Issue" : "Edit Risk"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
