import { X } from "lucide-react";
import type { RiskSignal } from "./RadarCanvas";

interface DetailsDrawerProps {
  signal: RiskSignal | null;
  onClose: () => void;
}

function getRiskLabel(score: number) {
  if (score > 70) return "High";
  if (score > 30) return "Medium";
  return "Low";
}

function getRiskColor(score: number) {
  if (score > 70) return "text-red-400";
  if (score > 30) return "text-yellow-400";
  return "text-green-400";
}

function getRiskBg(score: number) {
  if (score > 70) return "bg-red-500/10 border-red-500/30";
  if (score > 30) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-green-500/10 border-green-500/30";
}

export default function DetailsDrawer({ signal, onClose }: DetailsDrawerProps) {
  return (
    <div
      className={`absolute top-0 right-0 h-full w-80 bg-slate-900/95 border-l border-green-500/10 shadow-2xl shadow-black/50 z-50 transition-transform duration-300 ease-in-out ${
        signal ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {signal && (
        <div className="flex flex-col h-full p-4 overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-green-400 text-sm font-semibold uppercase tracking-wider">
              Signal Details
            </h3>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Title</div>
              <div className="text-slate-200 text-sm font-medium">{signal.title}</div>
            </div>

            <div>
              <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Project</div>
              <div className="text-slate-300 text-sm">{signal.project}</div>
            </div>

            <div className={`rounded-lg border p-3 ${getRiskBg(signal.riskScore)}`}>
              <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                Risk Score
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${getRiskColor(signal.riskScore)}`}>
                  {signal.riskScore}
                </span>
                <span className={`text-xs ${getRiskColor(signal.riskScore)}`}>
                  {getRiskLabel(signal.riskScore)}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
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
              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                  Time Offset
                </div>
                <div className="text-slate-200 text-sm font-medium">
                  {signal.timeOffsetDays > 0
                    ? `+${signal.timeOffsetDays}d`
                    : `${signal.timeOffsetDays}d`}
                </div>
                <div className="text-slate-500 text-[10px]">
                  {signal.timeOffsetDays > 0 ? "In the future" : "In the past"}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                  Impact
                </div>
                <div className="text-slate-200 text-sm font-medium">{signal.impactScore}</div>
                <div className="text-slate-500 text-[10px]">Impact score</div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                  Confidence
                </div>
                <div className="text-slate-200 text-sm font-medium">
                  {Math.round(signal.confidence * 100)}%
                </div>
                <div className="text-slate-500 text-[10px]">Signal confidence</div>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                  Type
                </div>
                <div className="text-slate-200 text-sm font-medium capitalize">{signal.type}</div>
                <div className="text-slate-500 text-[10px]">Risk category</div>
              </div>
            </div>

            <div>
              <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">
                Radar Position
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Quadrant</span>
                  <span className="text-slate-200">
                    {signal.timeOffsetDays >= 0 ? "Future" : "Past"} /{" "}
                    {signal.riskScore > 50 ? "High" : "Low"} Risk
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Distance from center</span>
                  <span className="text-slate-200">
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
