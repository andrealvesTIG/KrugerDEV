import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";

export type HorizontalMetric = "riskScore" | "impactScore" | "probability" | "costExposureNorm";

export const HORIZONTAL_METRICS: { value: HorizontalMetric; label: string; axisLabel: string; max: number }[] = [
  { value: "riskScore", label: "Risk Score", axisLabel: "RISK SCORE (0\u2013100)", max: 100 },
  { value: "impactScore", label: "Impact", axisLabel: "IMPACT (0\u2013100)", max: 100 },
  { value: "probability", label: "Probability", axisLabel: "PROBABILITY (0\u2013100)", max: 100 },
  { value: "costExposureNorm", label: "Cost Exposure", axisLabel: "COST EXPOSURE ($)", max: 100 },
];

export type RiskSignal = {
  id: string;
  title: string;
  project: string;
  projectId: number;
  portfolioId?: number;
  portfolioName?: string;
  riskScore: number;
  timeOffsetDays: number;
  impactScore: number;
  probability: number;
  costExposureNorm: number;
  costExposureRaw: number;
  confidence: number;
  type: "schedule" | "budget" | "dependency" | "resource" | "technical" | "scope";
  costExposure: number | null;
  dueDate: string | null;
  status: string;
  itemType: "risk" | "issue";
  isSimulated?: boolean;
};

interface RadarCanvasProps {
  signals: RiskSignal[];
  onSignalClick: (signal: RiskSignal | null) => void;
  isDark: boolean;
  centerLabel?: string;
  horizontalMetric?: HorizontalMetric;
  maxCostExposure?: number;
  width?: number;
  height?: number;
  readOnly?: boolean;
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

function formatCompactCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
  return `$${val}`;
}

type Star = { x: number; y: number; size: number; brightness: number; twinkleSpeed: number; twinkleOffset: number };
type Cloud = { x: number; y: number; rx: number; ry: number; opacity: number; speed: number; blobs: { dx: number; dy: number; rx: number; ry: number }[] };

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateStars(count: number, w: number, h: number): Star[] {
  const rng = seededRandom(42);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng() * w,
      y: rng() * h,
      size: rng() * 1.8 + 0.4,
      brightness: rng() * 0.6 + 0.4,
      twinkleSpeed: rng() * 2 + 1,
      twinkleOffset: rng() * Math.PI * 2,
    });
  }
  return stars;
}

function generateClouds(count: number, w: number, h: number): Cloud[] {
  const rng = seededRandom(77);
  const clouds: Cloud[] = [];
  for (let i = 0; i < count; i++) {
    const blobCount = Math.floor(rng() * 4) + 3;
    const blobs: Cloud["blobs"] = [];
    for (let b = 0; b < blobCount; b++) {
      blobs.push({
        dx: (rng() - 0.5) * 40,
        dy: (rng() - 0.5) * 14,
        rx: rng() * 25 + 18,
        ry: rng() * 12 + 8,
      });
    }
    clouds.push({
      x: rng() * w,
      y: rng() * h * 1.2,
      rx: rng() * 30 + 30,
      ry: rng() * 12 + 8,
      opacity: rng() * 0.12 + 0.04,
      speed: rng() * 6 + 3,
      blobs,
    });
  }
  return clouds;
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], w: number, h: number, time: number, driftOffset: number) {
  for (const star of stars) {
    const y = ((star.y + driftOffset * star.size * 0.3) % (h * 1.1)) - h * 0.05;
    const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
    const alpha = star.brightness * (0.4 + twinkle * 0.6);
    ctx.beginPath();
    ctx.arc(star.x, y, star.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,220,255,${alpha})`;
    ctx.fill();
    if (star.size > 1.2) {
      ctx.beginPath();
      ctx.arc(star.x, y, star.size * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,210,255,${alpha * 0.12})`;
      ctx.fill();
    }
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, clouds: Cloud[], w: number, h: number, driftOffset: number) {
  for (const cloud of clouds) {
    const y = ((cloud.y + driftOffset * cloud.speed * 0.06) % (h * 1.4)) - h * 0.2;
    for (const blob of cloud.blobs) {
      ctx.beginPath();
      ctx.ellipse(cloud.x + blob.dx, y + blob.dy, blob.rx, blob.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210,220,235,${cloud.opacity * 0.8})`;
      ctx.fill();
    }
  }
}

function mapSignalToCanvas(
  signal: RiskSignal,
  cx: number,
  cy: number,
  radius: number,
  metric: HorizontalMetric = "riskScore"
): { x: number; y: number } {
  const xVal = signal[metric] ?? signal.riskScore;
  const xNorm = clamp(xVal, 0, 100) / 100;
  const x = cx - radius + xNorm * 2 * radius;

  const yNorm = clamp(signal.timeOffsetDays, -90, 90) / 90;
  const y = cy - yNorm * radius;

  return { x, y };
}

function getMetricValue(signal: RiskSignal, metric: HorizontalMetric): number {
  return signal[metric] ?? signal.riskScore;
}

export default function RadarCanvas({
  signals,
  onSignalClick,
  isDark,
  centerLabel,
  horizontalMetric = "riskScore",
  maxCostExposure = 0,
  readOnly = false,
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
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panStartOffsetRef = useRef({ x: 0, y: 0 });
  const didPanRef = useRef(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  const handlePanMove = useCallback((clientX: number, clientY: number) => {
    if (!isPanningRef.current) return;
    const dx = clientX - panStartRef.current.x;
    const dy = clientY - panStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      didPanRef.current = true;
    }
    setPanOffset({
      x: panStartOffsetRef.current.x + dx,
      y: panStartOffsetRef.current.y + dy,
    });
  }, []);

  const handlePanEnd = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (isPanningRef.current) {
        handlePanMove(e.clientX, e.clientY);
      }
    };
    const onWindowMouseUp = () => {
      if (isPanningRef.current) {
        handlePanEnd();
      }
    };
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [handlePanMove, handlePanEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (zoom <= 1) return;
    isPanningRef.current = true;
    didPanRef.current = false;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panStartOffsetRef.current = { ...panOffset };
  }, [zoom, panOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1 && zoom > 1) {
        e.preventDefault();
        isPanningRef.current = true;
        didPanRef.current = false;
        panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panStartOffsetRef.current = { ...panOffset };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isPanningRef.current) {
        e.preventDefault();
        handlePanMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => {
      handlePanEnd();
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [zoom, panOffset, handlePanMove, handlePanEnd]);

  const prevScoresRef = useRef<Map<string, number>>(new Map());
  const pulseRef = useRef<Map<string, number>>(new Map());
  const bgTimeRef = useRef(0);

  const stars = useMemo(() => generateStars(120, dims.width, dims.height), [dims.width, dims.height]);
  const clouds = useMemo(() => generateClouds(14, dims.width, dims.height), [dims.width, dims.height]);

  const accentR = isDark ? 34 : 16;
  const accentG = isDark ? 197 : 140;
  const accentB = isDark ? 94 : 60;
  const accent = `${accentR},${accentG},${accentB}`;
  const labelColor = isDark ? `rgba(${accent},0.9)` : `rgba(${accentR},${accentG},${accentB},1)`;
  const tickColor = isDark ? `rgba(${accent},0.7)` : `rgba(${accentR},${accentG},${accentB},1)`;
  const gridAlpha = isDark ? 0.3 : 0.55;
  const axisAlpha = isDark ? 0.5 : 0.75;
  const sweepTrailAlpha = isDark ? 0.2 : 0.15;
  const sweepLineAlpha = isDark ? 0.7 : 0.7;
  const borderAlpha = isDark ? 0.4 : 0.6;

  const baseRadius = (w: number, h: number) => Math.min(w / 2, h / 2) * 0.80;
  const getRadius = (w: number, h: number) => baseRadius(w, h) * zoom;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDims({ width: Math.floor(width), height: Math.floor(height) });
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

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((prev) => {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      return clamp(prev + delta, 0.5, 3);
    });
  }, []);

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
      const cx = w / 2 + panOffset.x;
      const cy = h / 2 + panOffset.y;
      const radius = getRadius(w, h);
      const clipRadius = zoom > 1 ? Math.max(radius, Math.max(w, h)) : baseRadius(w, h);

      const dt = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const rotationPeriod = 5000;
      angleRef.current += (dt / rotationPeriod) * Math.PI * 2;

      bgTimeRef.current += dt * 0.001;
      const driftOffset = bgTimeRef.current * 12;

      if (isDark) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#070d1f");
        grad.addColorStop(0.5, "#0f172a");
        grad.addColorStop(1, "#0a1020");
        ctx.fillStyle = grad;
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.35, "#fcfcfd");
        grad.addColorStop(0.65, "#fafbfc");
        grad.addColorStop(1, "#f8f9fb");
        ctx.fillStyle = grad;
      }
      ctx.fillRect(0, 0, w, h);

      if (isDark) {
        drawStars(ctx, stars, w, h, bgTimeRef.current, driftOffset);
      } else {
        drawClouds(ctx, clouds, w, h, driftOffset);
      }

      ctx.save();
      ctx.beginPath();
      const clipPad = 40;
      ctx.rect(cx - clipRadius - clipPad, cy - clipRadius - clipPad, clipRadius * 2 + clipPad * 2, clipRadius * 2 + clipPad * 2);
      ctx.clip();

      const gridLineWidth = isDark ? 1.5 : 2;
      const axisLineWidth = isDark ? 1.5 : 2.5;

      for (let i = 1; i <= 4; i++) {
        const r = (radius / 4) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${accent},${gridAlpha})`;
        ctx.lineWidth = gridLineWidth;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.strokeStyle = `rgba(${accent},${axisAlpha})`;
      ctx.lineWidth = axisLineWidth;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.strokeStyle = `rgba(${accent},${axisAlpha})`;
      ctx.lineWidth = axisLineWidth;
      ctx.stroke();

      for (const val of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
        const xPos = cx - radius + (val / 100) * 2 * radius;
        if (xPos < cx - clipRadius - 1 || xPos > cx + clipRadius + 1) continue;
        ctx.beginPath();
        ctx.moveTo(xPos, cy - 4);
        ctx.lineTo(xPos, cy + 4);
        ctx.strokeStyle = `rgba(${accent},${axisAlpha * 0.8})`;
        ctx.lineWidth = isDark ? 1.5 : 2;
        ctx.stroke();
      }

      for (const val of [-90, -60, -30, 30, 60, 90]) {
        const yPos = cy - (val / 90) * radius;
        if (yPos < cy - clipRadius - 1 || yPos > cy + clipRadius + 1) continue;
        ctx.beginPath();
        ctx.moveTo(cx - 4, yPos);
        ctx.lineTo(cx + 4, yPos);
        ctx.strokeStyle = `rgba(${accent},${axisAlpha * 0.8})`;
        ctx.lineWidth = isDark ? 1.5 : 2;
        ctx.stroke();
      }

      const sweepAngle = angleRef.current;

      const afterglowSpan = Math.PI * 0.8;
      const afterglowGrad = ctx.createConicGradient(
        sweepAngle - afterglowSpan,
        cx,
        cy
      );
      afterglowGrad.addColorStop(0, `rgba(${accent},0)`);
      afterglowGrad.addColorStop(0.5, `rgba(${accent},${sweepTrailAlpha * 0.08})`);
      afterglowGrad.addColorStop(0.85, `rgba(${accent},${sweepTrailAlpha * 0.15})`);
      afterglowGrad.addColorStop(1, `rgba(${accent},${sweepTrailAlpha * 0.25})`);
      ctx.fillStyle = afterglowGrad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, sweepAngle - afterglowSpan, sweepAngle);
      ctx.closePath();
      ctx.fill();

      const trailSpan = Math.PI / 3;
      const gradient = ctx.createConicGradient(
        sweepAngle - trailSpan,
        cx,
        cy
      );
      gradient.addColorStop(0, `rgba(${accent},0)`);
      gradient.addColorStop(0.8, `rgba(${accent},${sweepTrailAlpha * 0.4})`);
      gradient.addColorStop(1, `rgba(${accent},${sweepTrailAlpha})`);
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
      ctx.strokeStyle = `rgba(${accent},${sweepLineAlpha})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = `rgb(${accent})`;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const now = Date.now();
      const pendingLabels: { x: number; y: number; r: number; g: number; b: number; dotRadius: number; title: string; riskScore: number }[] = [];
      signals.forEach((signal) => {
        const pos = mapSignalToCanvas(signal, cx, cy, radius, horizontalMetric);
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        if (Math.abs(dx) > clipRadius + clipPad || Math.abs(dy) > clipRadius + clipPad) return;

        const dotAngle = Math.atan2(dy, dx);
        let angleDiff = sweepAngle - dotAngle;
        angleDiff = ((angleDiff % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const sweepHit = angleDiff < 0.15;
        if (sweepHit && !pulseRef.current.has(signal.id)) {
          pulseRef.current.set(signal.id, now);
        }

        const isOverdue = signal.timeOffsetDays < 0;
        const dotRadius = clamp(signal.impactScore * 0.07 + 4, 4, 14);
        const [r, g, b] = isOverdue ? [239, 68, 68] as [number, number, number] : getRiskColorRgb(signal.riskScore);
        const alpha = isOverdue ? 1 : clamp(signal.confidence, 0.3, 1);

        const pulseStart = pulseRef.current.get(signal.id);
        let scale = 1;
        let extraGlow = 0;
        if (pulseStart) {
          const elapsed = now - pulseStart;
          if (elapsed < 800) {
            const t = elapsed / 800;
            scale = 1 + 0.4 * Math.sin(t * Math.PI);
            extraGlow = (1 - t) * 20;
          } else {
            pulseRef.current.delete(signal.id);
          }
        }

        if (isOverdue) {
          ctx.shadowColor = `rgba(239,68,68,0.8)`;
          ctx.shadowBlur = 20 + extraGlow;
        } else if (extraGlow > 0) {
          ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
          ctx.shadowBlur = extraGlow;
        } else if (signal.riskScore > 75) {
          ctx.shadowColor = `rgba(${r},${g},${b},0.6)`;
          ctx.shadowBlur = 16;
        }

        ctx.fillStyle = signal.isSimulated
          ? `rgba(${r},${g},${b},${alpha * 0.5})`
          : `rgba(${r},${g},${b},${alpha})`;
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.8})`;
        ctx.lineWidth = isOverdue ? 2.5 : signal.isSimulated ? 2 : 1.5;
        if (signal.isSimulated) {
          ctx.setLineDash([3, 3]);
        }
        if (signal.itemType === "issue") {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, dotRadius * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const s = dotRadius * scale;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - s * 1.2);
          ctx.lineTo(pos.x + s, pos.y + s * 0.7);
          ctx.lineTo(pos.x - s, pos.y + s * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        if (signal.isSimulated) {
          ctx.setLineDash([]);
        }
        ctx.shadowBlur = 0;

        if (isOverdue && signal.costExposure != null && signal.costExposure > 0) {
          const label = formatCompactCurrency(signal.costExposure);
          ctx.font = "bold 10px sans-serif";
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "left";
          ctx.fillText(label, pos.x + dotRadius * scale + 5, pos.y + 4);
        }

        pendingLabels.push({
          x: pos.x, y: pos.y, r: r, g: g, b: b,
          dotRadius: dotRadius * scale,
          title: signal.title,
          riskScore: signal.riskScore,
        });
      });

      ctx.restore();

      const maxLabels = 20;
      const labelCandidates = pendingLabels
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, maxLabels);

      const placedLabelRects: { x: number; y: number; w: number; h: number }[] = [];
      ctx.font = `${isDark ? "500" : "600"} 9px system-ui, sans-serif`;
      const labelH = 11;

      for (const lb of labelCandidates) {
        const labelText = lb.title.length > 18 ? lb.title.slice(0, 17) + "\u2026" : lb.title;
        const calloutLen = lb.dotRadius + 10;
        const goRight = lb.x <= cx;
        const goUp = lb.y >= cy;
        const calloutDx = goRight ? calloutLen : -calloutLen;
        const calloutDy = goUp ? -calloutLen * 0.6 : calloutLen * 0.6;
        let labelX = lb.x + calloutDx;
        let labelY = lb.y + calloutDy;

        labelX = clamp(labelX, 30, w - 30);
        labelY = clamp(labelY, 12, h - 12);

        const textW = ctx.measureText(labelText).width + 6;
        const rectX = goRight ? labelX : labelX - textW;
        const rect = { x: rectX, y: labelY - labelH / 2, w: textW, h: labelH };

        let resolved = false;
        for (let attempt = 0; attempt < 4; attempt++) {
          let overlaps = false;
          for (const pr of placedLabelRects) {
            if (rect.x < pr.x + pr.w && rect.x + rect.w > pr.x && rect.y < pr.y + pr.h && rect.y + rect.h > pr.y) {
              overlaps = true;
              const shiftY = goUp ? -(pr.y + pr.h - rect.y + 2) : (pr.y + pr.h - rect.y + 2);
              labelY += shiftY;
              labelY = clamp(labelY, 12, h - 12);
              rect.y = labelY - labelH / 2;
              break;
            }
          }
          if (!overlaps) { resolved = true; break; }
        }
        if (!resolved) continue;
        placedLabelRects.push(rect);

        ctx.beginPath();
        ctx.moveTo(lb.x + (goRight ? lb.dotRadius + 2 : -lb.dotRadius - 2), lb.y);
        ctx.lineTo(labelX, labelY);
        ctx.strokeStyle = `rgba(${lb.r},${lb.g},${lb.b},${isDark ? 0.35 : 0.3})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = goRight ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isDark ? `rgba(226,232,240,0.7)` : `rgba(51,65,85,0.75)`;
        ctx.fillText(labelText, labelX + (goRight ? 3 : -3), labelY);
      }

      ctx.font = isDark ? "bold 10px sans-serif" : "bold 11px sans-serif";
      ctx.fillStyle = tickColor;

      const xTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const isCostMetric = horizontalMetric === "costExposureNorm";
      for (const val of xTicks) {
        const xPos = cx - radius + (val / 100) * 2 * radius;
        if (xPos < cx - clipRadius - 1 || xPos > cx + clipRadius + 1) continue;

        if (val % 20 === 0 || val === 50) {
          ctx.textAlign = "center";
          if (isCostMetric && maxCostExposure > 0) {
            const dollarVal = (val / 100) * maxCostExposure;
            ctx.fillText(formatCompactCurrency(dollarVal), xPos, cy + 16);
          } else {
            ctx.fillText(String(val), xPos, cy + 16);
          }
        }
      }

      const yTicks = [-90, -60, -30, 0, 30, 60, 90];
      for (const val of yTicks) {
        if (val === 0) continue;
        const yPos = cy - (val / 90) * radius;
        if (yPos < cy - clipRadius - 1 || yPos > cy + clipRadius + 1) continue;

        ctx.textAlign = "left";
        const label = val > 0 ? `+${val}d` : `${val}d`;
        ctx.fillText(label, cx + 8, yPos + 4);
      }

      const metricLabels: Record<HorizontalMetric, [string, string]> = {
        riskScore: ["LOW RISK", "HIGH RISK"],
        impactScore: ["LOW IMPACT", "HIGH IMPACT"],
        probability: ["LOW PROB", "HIGH PROB"],
        costExposureNorm: ["LOW COST", "HIGH COST"],
      };
      const [leftLabel, rightLabel] = metricLabels[horizontalMetric] || metricLabels.riskScore;
      const compact = clipRadius < 160;
      const labelFontSize = compact ? 9 : (isDark ? 11 : 12);
      const titleFontSize = compact ? 10 : (isDark ? 12 : 13);
      const titleOffset = compact ? 18 : 30;
      const cornerOffset = compact ? 6 : 14;

      ctx.fillStyle = labelColor;
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(leftLabel, cx - clipRadius + 4, cy - clipRadius - cornerOffset);
      ctx.textAlign = "right";
      ctx.fillText(rightLabel, cx + clipRadius - 4, cy - clipRadius - cornerOffset);

      ctx.fillStyle = labelColor;
      ctx.font = `bold ${titleFontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("FUTURE (+days)", cx, cy - clipRadius - titleOffset);
      ctx.fillText("PAST (-days)", cx, cy + clipRadius + titleOffset - 2);
      ctx.save();
      ctx.translate(cx - clipRadius - 18, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      const metricMeta = HORIZONTAL_METRICS.find((m) => m.value === horizontalMetric) || HORIZONTAL_METRICS[0];
      ctx.fillText(metricMeta.axisLabel, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.translate(cx, cy);

      const boatHeading = -Math.PI / 2;

      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? "rgba(34,211,238,0.12)" : "rgba(8,145,178,0.1)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? "rgba(34,211,238,0.08)" : "rgba(8,145,178,0.06)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      const headingLen = 20;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(boatHeading) * headingLen, Math.sin(boatHeading) * headingLen);
      ctx.strokeStyle = isDark ? "rgba(34,211,238,0.25)" : "rgba(8,145,178,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.rotate(boatHeading + Math.PI / 2);

      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(4, -10, 6, -4);
      ctx.lineTo(7, 4);
      ctx.quadraticCurveTo(7, 10, 4, 12);
      ctx.lineTo(-4, 12);
      ctx.quadraticCurveTo(-7, 10, -7, 4);
      ctx.lineTo(-6, -4);
      ctx.quadraticCurveTo(-4, -10, 0, -14);
      ctx.closePath();

      const hullGrad = ctx.createLinearGradient(0, -14, 0, 12);
      if (isDark) {
        hullGrad.addColorStop(0, "rgba(34,211,238,0.5)");
        hullGrad.addColorStop(0.5, "rgba(34,211,238,0.35)");
        hullGrad.addColorStop(1, "rgba(34,211,238,0.2)");
      } else {
        hullGrad.addColorStop(0, "rgba(8,145,178,0.45)");
        hullGrad.addColorStop(0.5, "rgba(8,145,178,0.3)");
        hullGrad.addColorStop(1, "rgba(8,145,178,0.18)");
      }
      ctx.fillStyle = hullGrad;
      ctx.fill();
      ctx.strokeStyle = isDark ? "rgba(34,211,238,0.65)" : "rgba(8,145,178,0.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 8);
      ctx.strokeStyle = isDark ? "rgba(34,211,238,0.3)" : "rgba(8,145,178,0.25)";
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-4.5, -1);
      ctx.lineTo(4.5, -1);
      ctx.strokeStyle = isDark ? "rgba(34,211,238,0.2)" : "rgba(8,145,178,0.18)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-3.5, 4);
      ctx.lineTo(3.5, 4);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, -2, 2.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? "rgba(34,211,238,0.4)" : "rgba(8,145,178,0.35)";
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(0, 7, 1.8, 2.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? "rgba(34,211,238,0.25)" : "rgba(8,145,178,0.2)";
      ctx.fill();

      ctx.restore();

      ctx.save();
      const wt = bgTimeRef.current * 0.8;
      for (let ring = 0; ring < 3; ring++) {
        const phase = (wt + ring * 0.7) % 2;
        if (phase < 1.6) {
          const rr = 10 + phase * 10;
          const alpha = (1 - phase / 1.6) * (isDark ? 0.15 : 0.12);
          ctx.beginPath();
          ctx.arc(0, 0, rr, 0, Math.PI * 2);
          ctx.strokeStyle = isDark ? `rgba(34,211,238,${alpha})` : `rgba(8,145,178,${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
      ctx.restore();

      ctx.restore();

      ctx.textAlign = "center";
      if (centerLabel) {
        ctx.fillStyle = isDark ? "rgba(245,158,11,0.7)" : "rgba(217,119,6,0.8)";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(centerLabel, cx + 20, cy + 14);
      } else {
        ctx.fillStyle = isDark ? `rgba(${accent},0.5)` : `rgba(${accent},0.6)`;
        ctx.font = "10px sans-serif";
        ctx.fillText("NOW", cx + 14, cy + 14);
      }

      animRef.current = requestAnimationFrame(draw);
    },
    [signals, dims, isDark, accent, labelColor, tickColor, gridAlpha, axisAlpha, sweepTrailAlpha, sweepLineAlpha, borderAlpha, centerLabel, zoom, horizontalMetric, maxCostExposure, stars, clouds, panOffset]
  );

  useEffect(() => {
    lastTimeRef.current = performance.now();
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const isInClip = useCallback(
    (px: number, py: number) => {
      const cx = dims.width / 2 + panOffset.x;
      const cy = dims.height / 2 + panOffset.y;
      const cr = zoom > 1 ? Math.max(getRadius(dims.width, dims.height), Math.max(dims.width, dims.height)) : baseRadius(dims.width, dims.height);
      return Math.abs(px - cx) <= cr + 40 && Math.abs(py - cy) <= cr + 40;
    },
    [dims, panOffset, zoom]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanningRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = dims.width / 2 + panOffset.x;
      const cy = dims.height / 2 + panOffset.y;
      const radius = getRadius(dims.width, dims.height);

      let found: RiskSignal | null = null;
      for (const signal of signals) {
        const pos = mapSignalToCanvas(signal, cx, cy, radius, horizontalMetric);
        if (!isInClip(pos.x, pos.y)) continue;
        const dotRadius = clamp(signal.impactScore * 0.07 + 4, 4, 14);
        const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
        if (dist <= dotRadius + 5) {
          found = signal;
          break;
        }
      }

      if (found) {
        const pos = mapSignalToCanvas(found, cx, cy, radius, horizontalMetric);
        setTooltip({ signal: found, x: pos.x, y: pos.y });
        canvas.style.cursor = "pointer";
      } else {
        setTooltip(null);
        canvas.style.cursor = zoom > 1 ? "grab" : "default";
      }
    },
    [signals, dims, zoom, isInClip, horizontalMetric, panOffset]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (didPanRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = dims.width / 2 + panOffset.x;
      const cy = dims.height / 2 + panOffset.y;
      const radius = getRadius(dims.width, dims.height);

      let hit = false;
      for (const signal of signals) {
        const pos = mapSignalToCanvas(signal, cx, cy, radius, horizontalMetric);
        if (!isInClip(pos.x, pos.y)) continue;
        const dotRadius = clamp(signal.impactScore * 0.07 + 4, 4, 14);
        const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
        if (dist <= dotRadius + 5) {
          onSignalClick(signal);
          hit = true;
          break;
        }
      }
      if (!hit) onSignalClick(null);
    },
    [signals, dims, onSignalClick, zoom, isInClip, horizontalMetric, panOffset]
  );

  const tooltipBg = isDark ? "bg-slate-900/95 border-green-500/30 shadow-green-500/10" : "bg-white/95 border-green-600/30 shadow-green-600/10";
  const tooltipTitle = isDark ? "text-green-400" : "text-green-700";
  const tooltipText = isDark ? "text-slate-300" : "text-slate-600";
  const zoomBtnCls = isDark
    ? "bg-slate-800/80 border-slate-700/50 text-slate-300 hover:bg-slate-700/80 hover:text-green-400"
    : "bg-white/80 border-slate-300/50 text-slate-600 hover:bg-slate-100 hover:text-green-600";

  return (
    <div ref={containerRef} className={`relative w-full h-full flex items-center justify-center overflow-hidden ${isFullscreen ? (isDark ? "bg-[#0f172a]" : "bg-slate-100") : ""}`}>
      <canvas
        ref={canvasRef}
        className="block max-w-full max-h-full"
        onMouseDown={readOnly ? undefined : handleMouseDown}
        onMouseMove={handleMouseMove}
        onClick={readOnly ? undefined : handleClick}
        onMouseLeave={() => setTooltip(null)}
        onWheel={readOnly ? undefined : handleWheel}
        style={{ cursor: readOnly ? "default" : zoom > 1 ? "grab" : "default" }}
      />
      {!readOnly && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 z-40">
          <button
            onClick={toggleFullscreen}
            className={`p-1.5 rounded border transition-colors ${zoomBtnCls}`}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setZoom((z) => clamp(z + 0.2, 0.5, 3))}
            className={`p-1.5 rounded border transition-colors ${zoomBtnCls}`}
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => clamp(z - 0.2, 0.5, 3))}
            className={`p-1.5 rounded border transition-colors ${zoomBtnCls}`}
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
            className={`p-1.5 rounded border transition-colors ${zoomBtnCls}`}
            title="Reset Zoom & Pan"
          >
            <span className={`text-[9px] font-bold ${isDark ? "text-slate-300" : "text-slate-600"}`}>1:1</span>
          </button>
          <div className={`text-[9px] text-center font-mono mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            {Math.round(zoom * 100)}%
          </div>
        </div>
      )}
      {tooltip && (
        <div
          className={`absolute pointer-events-none z-50 border rounded-lg px-3 py-2 text-xs shadow-lg ${tooltipBg}`}
          style={{
            left: tooltip.x + 16,
            top: tooltip.y - 10,
            maxWidth: 220,
          }}
        >
          <div className={`font-semibold mb-1 ${tooltipTitle}`}>
            {tooltip.signal.title}
            <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded ${
              tooltip.signal.itemType === "issue"
                ? "text-blue-500 bg-blue-500/15"
                : "text-orange-500 bg-orange-500/15"
            }`}>
              {tooltip.signal.itemType === "issue" ? "ISSUE" : "RISK"}
            </span>
            {tooltip.signal.timeOffsetDays < 0 && tooltip.signal.dueDate && (
              <span className="ml-1 text-[10px] font-bold text-red-500 bg-red-500/15 px-1.5 py-0.5 rounded">OVERDUE</span>
            )}
          </div>
          <div className={tooltipText}>Project: {tooltip.signal.project}</div>
          <div className={tooltipText}>
            Score:{" "}
            <span style={{ color: getRiskColor(tooltip.signal.riskScore) }}>
              {tooltip.signal.riskScore}
            </span>
          </div>
          {tooltip.signal.costExposure != null && tooltip.signal.costExposure > 0 && (
            <div className={tooltipText}>
              Cost Exposure:{" "}
              <span className="font-medium" style={{ color: tooltip.signal.timeOffsetDays < 0 ? "#ef4444" : undefined }}>
                ${tooltip.signal.costExposure.toLocaleString()}
              </span>
            </div>
          )}
          {horizontalMetric !== "riskScore" && horizontalMetric !== "costExposureNorm" && (
            <div className={tooltipText}>
              {(HORIZONTAL_METRICS.find((m) => m.value === horizontalMetric) || HORIZONTAL_METRICS[0]).label}:{" "}
              <span className="font-medium">
                {getMetricValue(tooltip.signal, horizontalMetric)}
              </span>
            </div>
          )}
          {tooltip.signal.dueDate && (() => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const due = new Date(tooltip.signal.dueDate!);
            const diffMs = due.getTime() - now.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            const absDays = Math.abs(diffDays);
            let label: string;
            if (diffDays === 0) label = "Due today";
            else if (diffDays === 1) label = "Due tomorrow";
            else if (diffDays > 0 && diffDays < 30) label = `Due in ${diffDays} days`;
            else if (diffDays >= 30 && diffDays < 365) {
              const months = Math.floor(diffDays / 30);
              const remainDays = diffDays % 30;
              label = remainDays > 0 ? `Due in ${months}mo ${remainDays}d` : `Due in ${months}mo`;
            } else if (diffDays >= 365) {
              const years = Math.floor(diffDays / 365);
              const months = Math.floor((diffDays % 365) / 30);
              label = months > 0 ? `Due in ${years}y ${months}mo` : `Due in ${years}y`;
            } else if (diffDays === -1) label = "1 day overdue";
            else if (absDays < 30) label = `${absDays} days overdue`;
            else if (absDays < 365) {
              const months = Math.floor(absDays / 30);
              const remainDays = absDays % 30;
              label = remainDays > 0 ? `${months}mo ${remainDays}d overdue` : `${months}mo overdue`;
            } else {
              const years = Math.floor(absDays / 365);
              const months = Math.floor((absDays % 365) / 30);
              label = months > 0 ? `${years}y ${months}mo overdue` : `${years}y overdue`;
            }
            const isOverdue = diffDays < 0;
            return (
              <div className={tooltipText}>
                Due Date:{" "}
                <span className={`font-medium ${isOverdue ? "text-red-500" : ""}`}>
                  {due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className={`ml-1 text-[10px] ${isOverdue ? "text-red-400" : isDark ? "text-slate-400" : "text-slate-500"}`}>
                  ({label})
                </span>
              </div>
            );
          })()}
          <div className={tooltipText}>
            Time:{" "}
            {tooltip.signal.timeOffsetDays > 0
              ? `+${tooltip.signal.timeOffsetDays}d (future)`
              : `${tooltip.signal.timeOffsetDays}d (past)`}
          </div>
          <div className={tooltipText}>Type: {tooltip.signal.type}</div>
        </div>
      )}
    </div>
  );
}
