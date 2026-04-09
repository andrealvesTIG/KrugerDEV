import { useEffect, useRef } from "react";

interface JarvisOrbProps {
  state: "idle" | "listening" | "thinking" | "speaking";
  size?: number;
}

export function JarvisOrb({ state, size = 200 }: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;

    function draw() {
      timeRef.current += 0.016;
      const t = timeRef.current;
      ctx.clearRect(0, 0, size, size);

      const baseAlpha = state === "idle" ? 0.3 : 0.6;
      const pulseSpeed = state === "listening" ? 3 : state === "speaking" ? 4 : state === "thinking" ? 2 : 1;
      const pulseAmp = state === "listening" ? 0.4 : state === "speaking" ? 0.5 : state === "thinking" ? 0.3 : 0.15;

      const coreRadius = size * 0.08;
      const pulse = Math.sin(t * pulseSpeed) * pulseAmp + 1;
      const coreGlow = coreRadius * pulse;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreGlow * 3);
      grad.addColorStop(0, `rgba(0, 200, 255, ${0.3 * pulse})`);
      grad.addColorStop(0.5, `rgba(0, 150, 255, ${0.1 * pulse})`);
      grad.addColorStop(1, "rgba(0, 100, 255, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreGlow * 3, 0, Math.PI * 2);
      ctx.fill();

      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreGlow);
      coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      coreGrad.addColorStop(0.3, "rgba(100, 220, 255, 0.8)");
      coreGrad.addColorStop(0.7, "rgba(0, 160, 255, 0.5)");
      coreGrad.addColorStop(1, "rgba(0, 100, 200, 0.1)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreGlow, 0, Math.PI * 2);
      ctx.fill();

      const ringCount = 3;
      for (let r = 0; r < ringCount; r++) {
        const baseR = size * (0.2 + r * 0.12);
        const wobble = state === "idle" ? 0 : Math.sin(t * (2 + r) + r * 1.5) * (size * 0.01 * (state === "speaking" ? 3 : state === "listening" ? 2.5 : 1));
        const radius = baseR + wobble;
        const alpha = baseAlpha - r * 0.08;
        const rotation = t * (0.3 + r * 0.15) * (r % 2 === 0 ? 1 : -1);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);

        ctx.strokeStyle = `rgba(0, 180, 255, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);

        const segments = state === "speaking" ? 8 : state === "listening" ? 6 : 4;
        const gapAngle = Math.PI * 2 / segments;
        const arcLength = gapAngle * 0.7;

        for (let s = 0; s < segments; s++) {
          const startAngle = s * gapAngle;
          let segRadius = radius;

          if (state === "speaking" || state === "listening") {
            segRadius += Math.sin(t * 5 + s * 1.2 + r) * (size * 0.015);
          }

          ctx.beginPath();
          ctx.arc(0, 0, segRadius, startAngle, startAngle + arcLength);
          ctx.stroke();
        }

        ctx.restore();
      }

      if (state === "listening" || state === "speaking") {
        const waveCount = 32;
        const waveRadius = size * 0.38;
        ctx.save();
        ctx.translate(cx, cy);

        for (let i = 0; i < waveCount; i++) {
          const angle = (i / waveCount) * Math.PI * 2;
          const freq = state === "speaking" ? 8 : 5;
          const amp = state === "speaking"
            ? (Math.sin(t * freq + i * 0.5) * 0.5 + 0.5) * size * 0.06
            : (Math.sin(t * freq + i * 0.3) * 0.3 + 0.3) * size * 0.04;

          const x1 = Math.cos(angle) * waveRadius;
          const y1 = Math.sin(angle) * waveRadius;
          const x2 = Math.cos(angle) * (waveRadius + amp);
          const y2 = Math.sin(angle) * (waveRadius + amp);

          const barAlpha = 0.3 + (amp / (size * 0.06)) * 0.5;
          ctx.strokeStyle = `rgba(0, 200, 255, ${barAlpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        ctx.restore();
      }

      if (state === "thinking") {
        ctx.save();
        ctx.translate(cx, cy);
        const scanAngle = (t * 2) % (Math.PI * 2);
        const scanRadius = size * 0.42;

        const scanGrad = ctx.createConicGradient(scanAngle, 0, 0);
        scanGrad.addColorStop(0, "rgba(0, 200, 255, 0.3)");
        scanGrad.addColorStop(0.1, "rgba(0, 200, 255, 0)");
        scanGrad.addColorStop(0.9, "rgba(0, 200, 255, 0)");
        scanGrad.addColorStop(1, "rgba(0, 200, 255, 0.3)");

        ctx.fillStyle = scanGrad;
        ctx.beginPath();
        ctx.arc(0, 0, scanRadius, 0, Math.PI * 2);
        ctx.fill();

        const dotCount = 6;
        for (let d = 0; d < dotCount; d++) {
          const dotAngle = scanAngle - d * 0.15;
          const dotR = scanRadius - d * 2;
          const dx = Math.cos(dotAngle) * dotR;
          const dy = Math.sin(dotAngle) * dotR;
          const dotAlpha = 0.6 - d * 0.08;

          ctx.fillStyle = `rgba(0, 220, 255, ${dotAlpha})`;
          ctx.beginPath();
          ctx.arc(dx, dy, 2.5 - d * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      const particleCount = state === "idle" ? 8 : 16;
      for (let p = 0; p < particleCount; p++) {
        const speed = state === "idle" ? 0.3 : 0.8;
        const pAngle = (p / particleCount) * Math.PI * 2 + t * speed;
        const pRadius = size * (0.3 + Math.sin(t * 0.5 + p * 2) * 0.1);
        const px = cx + Math.cos(pAngle) * pRadius;
        const py = cy + Math.sin(pAngle) * pRadius;
        const pAlpha = 0.2 + Math.sin(t * 2 + p) * 0.15;

        ctx.fillStyle = `rgba(100, 220, 255, ${pAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [state, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="select-none"
    />
  );
}
