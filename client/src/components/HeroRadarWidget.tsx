import { useEffect, useRef } from "react";

interface Signal {
  label: string;
  distance: number;
  angle: number;
  color: string;
}

const DEMO_SIGNALS: Signal[] = [
  { label: "Budget Risk", distance: 0.3, angle: 30, color: "#ef4444" },
  { label: "Timeline", distance: 0.55, angle: 75, color: "#f59e0b" },
  { label: "Scope Creep", distance: 0.4, angle: 140, color: "#ef4444" },
  { label: "Resources", distance: 0.7, angle: 200, color: "#10b981" },
  { label: "Quality", distance: 0.6, angle: 260, color: "#f59e0b" },
  { label: "Compliance", distance: 0.8, angle: 320, color: "#10b981" },
  { label: "Dependencies", distance: 0.45, angle: 180, color: "#ef4444" },
  { label: "Stakeholder", distance: 0.65, angle: 350, color: "#10b981" },
];

export function HeroRadarWidget({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
    });
    resizeObserver.observe(canvas);

    let frame = 0;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      frame++;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(cx, cy) * 0.85;
      const dpr = window.devicePixelRatio;

      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(99, 102, 241, 0.12)";
      ctx.lineWidth = dpr;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * (i / 4), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(99, 102, 241, 0.08)";
      for (let a = 0; a < 360; a += 45) {
        const rad = (a * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * maxR, cy + Math.sin(rad) * maxR);
        ctx.stroke();
      }

      const sweepAngle = ((frame * 0.5) % 360) * (Math.PI / 180);
      const sweepWidth = 0.4;
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
      sweepGrad.addColorStop(0, "rgba(99, 102, 241, 0.01)");
      sweepGrad.addColorStop(0.5, "rgba(99, 102, 241, 0.06)");
      sweepGrad.addColorStop(1, "rgba(99, 102, 241, 0.02)");
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, sweepAngle - sweepWidth, sweepAngle);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(99, 102, 241, 0.6)";
      ctx.beginPath();
      ctx.arc(cx, cy, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();

      const placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];

      DEMO_SIGNALS.forEach((signal) => {
        const rad = (signal.angle * Math.PI) / 180;
        const r = signal.distance * maxR;
        const sx = cx + Math.cos(rad) * r;
        const sy = cy + Math.sin(rad) * r;

        const pulse = Math.sin(frame * 0.03 + signal.angle) * 0.3 + 0.7;

        ctx.globalAlpha = pulse;
        ctx.fillStyle = signal.color;
        ctx.beginPath();
        ctx.arc(sx, sy, 4 * dpr, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = pulse * 0.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 8 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        const fontSize = 10 * dpr;
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        const textWidth = ctx.measureText(signal.label).width;
        const padding = 4 * dpr;
        const labelW = textWidth + padding * 2;
        const labelH = fontSize + padding * 2;

        const candidates = [
          { x: sx + 10 * dpr, y: sy - labelH / 2 },
          { x: sx - labelW - 10 * dpr, y: sy - labelH / 2 },
          { x: sx - labelW / 2, y: sy - labelH - 8 * dpr },
          { x: sx - labelW / 2, y: sy + 8 * dpr },
        ];

        let bestPos = candidates[0];
        for (const pos of candidates) {
          const rect = { x: pos.x, y: pos.y, w: labelW, h: labelH };
          const overlaps = placedLabels.some(p =>
            rect.x < p.x + p.w && rect.x + rect.w > p.x &&
            rect.y < p.y + p.h && rect.y + rect.h > p.y
          );
          if (!overlaps && pos.x > 0 && pos.x + labelW < w && pos.y > 0 && pos.y + labelH < h) {
            bestPos = pos;
            break;
          }
        }

        placedLabels.push({ x: bestPos.x, y: bestPos.y, w: labelW, h: labelH });

        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(bestPos.x, bestPos.y, labelW, labelH);

        ctx.fillStyle = "#374151";
        ctx.fillText(signal.label, bestPos.x + padding, bestPos.y + fontSize + padding / 2);
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className={`relative ${className || ""}`} style={{ aspectRatio: "16/10", maxHeight: "min(480px, 50vh)" }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-xl"
        style={{ background: "linear-gradient(135deg, #f8fafc, #eef2ff)" }}
      />
    </div>
  );
}
