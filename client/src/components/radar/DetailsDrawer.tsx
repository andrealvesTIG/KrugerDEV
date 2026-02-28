import { X } from "lucide-react";
import type { RiskSignal } from "./RadarCanvas";

interface DetailsDrawerProps {
  signal: RiskSignal | null;
  onClose: () => void;
  isDark: boolean;
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

export default function DetailsDrawer({ signal, onClose, isDark }: DetailsDrawerProps) {
  const panelBg = isDark ? "bg-slate-900 border-l border-green-500/10 shadow-black/50" : "bg-white border-l border-green-600/10 shadow-slate-300/50";
  const heading = isDark ? "text-green-400" : "text-green-700";
  const closeBtn = isDark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600";
  const metaLabel = isDark ? "text-slate-500" : "text-slate-400";
  const titleText = isDark ? "text-slate-200" : "text-slate-800";
  const subtitleText = isDark ? "text-slate-300" : "text-slate-600";
  const cardBg = isDark ? "bg-slate-800/50" : "bg-slate-100/80";
  const metaSmall = isDark ? "text-slate-500" : "text-slate-400";
  const barBg = isDark ? "bg-slate-700" : "bg-slate-200";

  return (
    <div
      className={`absolute top-0 right-0 h-full w-80 shadow-2xl z-50 transition-transform duration-300 ease-in-out ${panelBg} ${
        signal ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {signal && (
        <div className="flex flex-col h-full p-4 overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
            <h3 className={`text-sm font-semibold uppercase tracking-wider ${heading}`}>
              Signal Details
            </h3>
            <button
              onClick={onClose}
              className={`transition-colors p-1 ${closeBtn}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>Title</div>
              <div className={`text-sm font-medium ${titleText}`}>{signal.title}</div>
            </div>

            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${metaLabel}`}>Project</div>
              <div className={`text-sm ${subtitleText}`}>{signal.project}</div>
            </div>

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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
