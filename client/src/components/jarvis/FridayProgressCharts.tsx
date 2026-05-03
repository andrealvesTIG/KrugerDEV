import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FridayBurndownPoint {
  label: string;
  ideal?: number | null;
  actual?: number | null;
  projected?: number | null;
}

export interface FridayBurndownChartData {
  title?: string;
  subtitle?: string;
  href?: string | null;
  unit?: string | null;
  points: FridayBurndownPoint[];
  asOfIndex?: number | null;
}

export interface FridaySCurvePoint {
  label: string;
  plannedValue?: number | null;
  earnedValue?: number | null;
  actualCost?: number | null;
  eac?: number | null;
}

export interface FridaySCurveChartData {
  title?: string;
  subtitle?: string;
  href?: string | null;
  currency?: string | null;
  points: FridaySCurvePoint[];
  asOfIndex?: number | null;
}

const PANEL_HEIGHT = 160;
const PAGE_HEIGHT = 200;
const PANEL_WIDTH = 320;
const PAGE_WIDTH = 520;
const PAD_L = 38;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 22;

interface SeriesSpec<P> {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  get: (p: P) => number | null | undefined;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  let nice: number;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

function compactNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  NZD: "$",
  HKD: "$",
  SGD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  KRW: "₩",
  CHF: "CHF ",
  SEK: "kr ",
  NOK: "kr ",
  DKK: "kr ",
  ZAR: "R",
  BRL: "R$",
  MXN: "$",
};

function formatCurrencyCompact(v: number, currency?: string | null): string {
  const code = (currency ?? "USD").toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] ?? `${code} `;
  return `${sym}${compactNumber(v)}`;
}

interface ChartShellProps {
  title?: string;
  subtitle?: string;
  href?: string | null;
  variant: "panel" | "page";
  legend: Array<{ label: string; color: string; dashed?: boolean }>;
  onNavigate?: (path: string) => void;
  testId: string;
  empty?: boolean;
  emptyText?: string;
  children?: (size: { w: number; h: number; innerW: number; innerH: number }) => React.ReactNode;
}

function ChartShell({
  title,
  subtitle,
  href,
  variant,
  legend,
  onNavigate,
  testId,
  empty,
  emptyText,
  children,
}: ChartShellProps) {
  const isPanel = variant === "panel";
  const w = isPanel ? PANEL_WIDTH : PAGE_WIDTH;
  const h = isPanel ? PANEL_HEIGHT : PAGE_HEIGHT;
  const innerW = w - PAD_L - PAD_R;
  const innerH = h - PAD_T - PAD_B;

  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {title ?? "Chart"}
          </div>
          {subtitle ? (
            <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {href ? (
          <button
            type="button"
            onClick={() => href && onNavigate?.(href)}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            data-testid={`${testId}-open-full`}
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {empty ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          {emptyText ?? "No data points were available to plot."}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              className="block"
              role="img"
              aria-label={title ?? "Chart"}
            >
              {children?.({ w, h, innerW, innerH })}
            </svg>
          </div>
          {legend.length > 0 ? (
            <div className="flex flex-wrap gap-3 border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
              {legend.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5">
                  <svg width="14" height="6" aria-hidden="true">
                    <line
                      x1="0"
                      x2="14"
                      y1="3"
                      y2="3"
                      stroke={l.color}
                      strokeWidth="2"
                      strokeDasharray={l.dashed ? "3 2" : undefined}
                    />
                  </svg>
                  {l.label}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

interface LinesProps<P> {
  points: P[];
  series: SeriesSpec<P>[];
  innerW: number;
  innerH: number;
  asOfIndex?: number | null;
  format: (v: number) => string;
  variant: "panel" | "page";
  testId: string;
}

function LineLayers<P>({
  points,
  series,
  innerW,
  innerH,
  asOfIndex,
  format,
  variant,
  testId,
}: LinesProps<P>) {
  const n = points.length;
  if (n === 0) return null;

  const allValues: number[] = [];
  for (const p of points) {
    for (const s of series) {
      const v = s.get(p);
      if (typeof v === "number" && Number.isFinite(v)) allValues.push(v);
    }
  }
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const rawMin = allValues.length > 0 ? Math.min(0, ...allValues) : 0;
  const yMax = niceMax(rawMax);
  const yMin = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;
  const range = yMax - yMin || 1;

  const xStep = n > 1 ? innerW / (n - 1) : innerW;
  const xAt = (i: number) => PAD_L + i * xStep;
  const yAt = (v: number) => PAD_T + (1 - (v - yMin) / range) * innerH;

  const gridSteps = 4;
  const gridYs: Array<{ y: number; v: number }> = [];
  for (let i = 0; i <= gridSteps; i++) {
    const v = yMin + ((yMax - yMin) * i) / gridSteps;
    gridYs.push({ y: yAt(v), v });
  }

  const isPanel = variant === "panel";
  const labelEvery = Math.max(1, Math.ceil(n / (isPanel ? 4 : 7)));

  const seriesPaths = series.map((s) => {
    const segs: string[] = [];
    let inSeg = false;
    for (let i = 0; i < n; i++) {
      const v = s.get(points[i]);
      if (typeof v !== "number" || !Number.isFinite(v)) {
        inSeg = false;
        continue;
      }
      const cmd = inSeg ? "L" : "M";
      segs.push(`${cmd} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`);
      inSeg = true;
    }
    return { spec: s, d: segs.join(" ") };
  });

  return (
    <>
      {gridYs.map((g, i) => (
        <g key={`grid-${i}`}>
          <line
            x1={PAD_L}
            x2={PAD_L + innerW}
            y1={g.y}
            y2={g.y}
            className="stroke-border/40"
          />
          <text
            x={PAD_L - 4}
            y={g.y + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            style={{ fontSize: 9 }}
          >
            {format(g.v)}
          </text>
        </g>
      ))}
      <line
        x1={PAD_L}
        x2={PAD_L + innerW}
        y1={PAD_T + innerH}
        y2={PAD_T + innerH}
        className="stroke-border"
      />

      {points.map((p, i) => {
        if (i % labelEvery !== 0 && i !== n - 1) return null;
        return (
          <text
            key={`xl-${i}`}
            x={xAt(i)}
            y={PAD_T + innerH + 12}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 9 }}
          >
            {(p as { label?: string }).label ?? ""}
          </text>
        );
      })}

      {typeof asOfIndex === "number" && asOfIndex >= 0 && asOfIndex < n ? (
        <line
          x1={xAt(asOfIndex)}
          x2={xAt(asOfIndex)}
          y1={PAD_T}
          y2={PAD_T + innerH}
          className="stroke-amber-500/70"
          strokeDasharray="3 2"
        />
      ) : null}

      {seriesPaths.map((sp) => (
        <path
          key={`line-${sp.spec.key}`}
          d={sp.d}
          fill="none"
          stroke={sp.spec.color}
          strokeWidth={1.6}
          strokeDasharray={sp.spec.dashed ? "4 3" : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {points.map((p, i) => {
        const tooltip = (
          <div className="space-y-0.5 text-xs">
            <div className="font-medium">{(p as { label?: string }).label}</div>
            {series.map((s) => {
              const v = s.get(p);
              if (typeof v !== "number" || !Number.isFinite(v)) return null;
              return (
                <div key={s.key} className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span>
                    {s.label}: <span className="text-foreground">{format(v)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        );
        const cx = xAt(i);
        return (
          <Tooltip key={`hot-${i}`}>
            <TooltipTrigger asChild>
              <rect
                x={cx - xStep / 2}
                y={PAD_T}
                width={xStep || 1}
                height={innerH}
                fill="transparent"
                className={cn("cursor-default")}
                data-testid={`${testId}-hot-${i}`}
              />
            </TooltipTrigger>
            <TooltipContent side="top">{tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

interface BurndownProps {
  data: FridayBurndownChartData;
  onNavigate?: (path: string) => void;
  variant?: "panel" | "page";
}

export function FridayBurndownChart({ data, onNavigate, variant = "page" }: BurndownProps) {
  const points = data.points ?? [];
  const empty = points.length === 0;
  const series: SeriesSpec<FridayBurndownPoint>[] = useMemo(
    () => [
      { key: "ideal", label: "Ideal", color: "#94a3b8", dashed: true, get: (p) => p.ideal ?? null },
      { key: "actual", label: "Actual", color: "#3b82f6", get: (p) => p.actual ?? null },
      { key: "projected", label: "Projected", color: "#f59e0b", dashed: true, get: (p) => p.projected ?? null },
    ],
    [],
  );
  const activeSeries = series.filter((s) => points.some((p) => typeof s.get(p) === "number"));
  const unit = data.unit ?? "";
  const fmt = (v: number) => (unit ? `${compactNumber(v)} ${unit}` : compactNumber(v));

  return (
    <TooltipProvider delayDuration={200}>
      <ChartShell
        title={data.title ?? "Burndown"}
        subtitle={data.subtitle}
        href={data.href}
        variant={variant}
        onNavigate={onNavigate}
        legend={activeSeries.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))}
        testId="friday-burndown-chart"
        empty={empty}
        emptyText="No burndown data points were available to plot."
      >
        {({ innerW, innerH }) => (
          <LineLayers
            points={points}
            series={activeSeries}
            innerW={innerW}
            innerH={innerH}
            asOfIndex={data.asOfIndex ?? null}
            format={fmt}
            variant={variant}
            testId="friday-burndown-chart"
          />
        )}
      </ChartShell>
    </TooltipProvider>
  );
}

interface SCurveProps {
  data: FridaySCurveChartData;
  onNavigate?: (path: string) => void;
  variant?: "panel" | "page";
}

export function FridaySCurveChart({ data, onNavigate, variant = "page" }: SCurveProps) {
  const points = data.points ?? [];
  const empty = points.length === 0;
  const series: SeriesSpec<FridaySCurvePoint>[] = useMemo(
    () => [
      { key: "pv", label: "Planned (PV)", color: "#3b82f6", get: (p) => p.plannedValue ?? null },
      { key: "ev", label: "Earned (EV)", color: "#8b5cf6", get: (p) => p.earnedValue ?? null },
      { key: "ac", label: "Actual (AC)", color: "#10b981", get: (p) => p.actualCost ?? null },
      { key: "eac", label: "EAC", color: "#f59e0b", dashed: true, get: (p) => p.eac ?? null },
    ],
    [],
  );
  const activeSeries = series.filter((s) => points.some((p) => typeof s.get(p) === "number"));
  const fmt = (v: number) => formatCurrencyCompact(v, data.currency);

  return (
    <TooltipProvider delayDuration={200}>
      <ChartShell
        title={data.title ?? "S-Curve"}
        subtitle={data.subtitle}
        href={data.href}
        variant={variant}
        onNavigate={onNavigate}
        legend={activeSeries.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))}
        testId="friday-scurve-chart"
        empty={empty}
        emptyText="No S-curve data points were available to plot."
      >
        {({ innerW, innerH }) => (
          <LineLayers
            points={points}
            series={activeSeries}
            innerW={innerW}
            innerH={innerH}
            asOfIndex={data.asOfIndex ?? null}
            format={fmt}
            variant={variant}
            testId="friday-scurve-chart"
          />
        )}
      </ChartShell>
    </TooltipProvider>
  );
}

function toNumOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toAsOfIndex(v: unknown, length: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const i = Math.trunc(v);
  if (length <= 0) return null;
  if (i < 0) return 0;
  if (i >= length) return length - 1;
  return i;
}

function toStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function tryParseFridayBurndownChart(json: string): FridayBurndownChartData | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.points)) return null;
    const points: FridayBurndownPoint[] = [];
    for (const p of parsed.points) {
      if (!p || typeof p !== "object") continue;
      points.push({
        label: toStr(p.label),
        ideal: toNumOrNull(p.ideal),
        actual: toNumOrNull(p.actual),
        projected: toNumOrNull(p.projected),
      });
    }
    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : undefined,
      href: typeof parsed.href === "string" ? parsed.href : null,
      unit: typeof parsed.unit === "string" ? parsed.unit : null,
      points,
      asOfIndex: toAsOfIndex(parsed.asOfIndex, points.length),
    };
  } catch {
    return null;
  }
}

export function tryParseFridaySCurveChart(json: string): FridaySCurveChartData | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.points)) return null;
    const points: FridaySCurvePoint[] = [];
    for (const p of parsed.points) {
      if (!p || typeof p !== "object") continue;
      points.push({
        label: toStr(p.label),
        plannedValue: toNumOrNull(p.plannedValue ?? p.pv),
        earnedValue: toNumOrNull(p.earnedValue ?? p.ev),
        actualCost: toNumOrNull(p.actualCost ?? p.ac),
        eac: toNumOrNull(p.eac),
      });
    }
    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : undefined,
      href: typeof parsed.href === "string" ? parsed.href : null,
      currency: typeof parsed.currency === "string" ? parsed.currency : null,
      points,
      asOfIndex: toAsOfIndex(parsed.asOfIndex, points.length),
    };
  } catch {
    return null;
  }
}
