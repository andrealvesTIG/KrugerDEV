import { useRef, useEffect, useCallback, useState } from "react";

export type RiskSignal = {
  id: string;
  title: string;
  project: string;
  riskScore: number;
  timeOffsetDays: number;
  impactScore: number;
  confidence: number;
  type: "schedule" | "budget" | "dependency" | "resource" | "technical" | "scope";
};

interface RadarCanvasProps {
  signals: RiskSignal[];
  onSignalClick: (signal: RiskSignal) => void;
  width?: number;
  height?: number;
}

function getRiskColor(score: number): string {
  if (score > 70) return "#ef4444";
  if (score > 30) return "#eab308";
  return "#22c55e";
}

function getRiskColorRgb(score: number): [number, number, number] {
  if (score > 70) return [239, 68, 68];
  if (score > 30) return [234, 179, 8];
  return [34, 197, 94];
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function mapSignalToCanvas(
  signal: RiskSignal,
  cx: number,
  cy: number,
  radius: number
): { x: number; y: number } {
  const xNorm = clamp(signal.riskScore, 0, 100) / 100;
  const x = cx - radius + xNorm * 2 * radius;

  const yNorm = clamp(signal.timeOffsetDays, -90, 90) / 90;
  const y = cy - yNorm * radius;

  return { x, y };
}

export default function RadarCanvas({
  signals,
  onSignalClick,
}: RadarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const [tooltip, setTooltip] = useState<{
    signal: RiskSignal;
    x: number;
    y: number;
  } | null>(null);
  const [dims, setDims] = useState({ width: 600, height: 600 });

  const prevScoresRef = useRef<Map<string, number>>(new Map());
  const pulseRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        const size = Math.min(width, height);
        setDims({ width: size, height: size });
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const newScores = new Map<string, number>();
    signals.forEach((s) => {
      const prev = prevScoresRef.current.get(s.id);
      if (prev === undefined || s.riskScore > prev) {
        pulseRef.current.set(s.id, Date.now());
      }
      newScores.set(s.id, s.riskScore);
    });
    prevScoresRef.current = newScores;
  }, [signals]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.width * dpr;
    canvas.height = dims.height * dpr;
    canvas.style.width = `${dims.width}px`;
    canvas.style.height = `${dims.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [dims]);

  const draw = useCallback(
    (timestamp: number) => {
      if (document.hidden) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = dims.width;
      const h = dims.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) * 0.85;

      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const rotationPeriod = 5000;
      angleRef.current += (dt / rotationPeriod) * Math.PI * 2;

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      for (let i = 1; i <= 4; i++) {
        const r = (radius / 4) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(34,197,94,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.strokeStyle = "rgba(34,197,94,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.strokeStyle = "rgba(34,197,94,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const sweepAngle = angleRef.current;
      const trailSpan = Math.PI / 3;
      const gradient = ctx.createConicGradient(
        sweepAngle - trailSpan,
        cx,
        cy
      );
      gradient.addColorStop(0, "rgba(34,197,94,0)");
      gradient.addColorStop(0.8, "rgba(34,197,94,0.08)");
      gradient.addColorStop(1, "rgba(34,197,94,0.2)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, sweepAngle - trailSpan, sweepAngle);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const sx = cx + Math.cos(sweepAngle) * radius;
      const sy = cy + Math.sin(sweepAngle) * radius;
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = "rgba(34,197,94,0.7)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#22c55e";
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const now = Date.now();
      signals.forEach((signal) => {
        const pos = mapSignalToCanvas(signal, cx, cy, radius);
        const dist = Math.sqrt((pos.x - cx) ** 2 + (pos.y - cy) ** 2);
        if (dist > radius) return;

        const dotRadius = clamp(signal.impactScore * 0.06 + 3, 3, 12);
        const [r, g, b] = getRiskColorRgb(signal.riskScore);
        const alpha = clamp(signal.confidence, 0.3, 1);

        const pulseStart = pulseRef.current.get(signal.id);
        let scale = 1;
        if (pulseStart) {
          const elapsed = now - pulseStart;
          if (elapsed < 1500) {
            scale = 1 + 0.5 * Math.sin((elapsed / 1500) * Math.PI * 3) * (1 - elapsed / 1500);
          } else {
            pulseRef.current.delete(signal.id);
          }
        }

        if (signal.riskScore > 75) {
          ctx.shadowColor = `rgba(${r},${g},${b},0.6)`;
          ctx.shadowBlur = 16;
        }

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, dotRadius * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.8})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(34,197,94,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "rgba(34,197,94,0.7)";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("FUTURE", cx, cy - radius - 8);
      ctx.fillText("PAST", cx, cy + radius + 18);
      ctx.textAlign = "left";
      ctx.fillText("LOW RISK", cx - radius + 4, cy - 8);
      ctx.textAlign = "right";
      ctx.fillText("HIGH RISK", cx + radius - 4, cy - 8);

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(34,197,94,0.5)";
      ctx.font = "10px sans-serif";
      ctx.fillText("NOW", cx + 14, cy + 14);

      animRef.current = requestAnimationFrame(draw);
    },
    [signals, dims]
  );

  useEffect(() => {
    lastTimeRef.current = performance.now();
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = dims.width / 2;
      const cy = dims.height / 2;
      const radius = Math.min(cx, cy) * 0.85;

      let found: RiskSignal | null = null;
      for (const signal of signals) {
        const pos = mapSignalToCanvas(signal, cx, cy, radius);
        const dotRadius = clamp(signal.impactScore * 0.06 + 3, 3, 12);
        const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
        if (dist <= dotRadius + 4) {
          found = signal;
          break;
        }
      }

      if (found) {
        const pos = mapSignalToCanvas(found, cx, cy, radius);
        setTooltip({ signal: found, x: pos.x, y: pos.y });
        canvas.style.cursor = "pointer";
      } else {
        setTooltip(null);
        canvas.style.cursor = "default";
      }
    },
    [signals, dims]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = dims.width / 2;
      const cy = dims.height / 2;
      const radius = Math.min(cx, cy) * 0.85;

      for (const signal of signals) {
        const pos = mapSignalToCanvas(signal, cx, cy, radius);
        const dotRadius = clamp(signal.impactScore * 0.06 + 3, 3, 12);
        const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
        if (dist <= dotRadius + 4) {
          onSignalClick(signal);
          break;
        }
      }
    },
    [signals, dims, onSignalClick]
  );

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-slate-900/95 border border-green-500/30 rounded-lg px-3 py-2 text-xs shadow-lg shadow-green-500/10"
          style={{
            left: tooltip.x + 16,
            top: tooltip.y - 10,
            maxWidth: 220,
          }}
        >
          <div className="font-semibold text-green-400 mb-1">{tooltip.signal.title}</div>
          <div className="text-slate-300">Project: {tooltip.signal.project}</div>
          <div className="text-slate-300">
            Risk Score:{" "}
            <span style={{ color: getRiskColor(tooltip.signal.riskScore) }}>
              {tooltip.signal.riskScore}
            </span>
          </div>
          <div className="text-slate-300">
            Time:{" "}
            {tooltip.signal.timeOffsetDays > 0
              ? `+${tooltip.signal.timeOffsetDays}d (future)`
              : `${tooltip.signal.timeOffsetDays}d (past)`}
          </div>
          <div className="text-slate-300">Type: {tooltip.signal.type}</div>
        </div>
      )}
    </div>
  );
}
