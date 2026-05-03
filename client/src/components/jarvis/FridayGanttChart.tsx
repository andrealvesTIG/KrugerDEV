import { useMemo } from "react";
import { Milestone as MilestoneIcon, ListTree, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface FridayGanttTask {
  id: number | string;
  name: string;
  start?: string | null;
  end?: string | null;
  percentComplete?: number | null;
  isMilestone?: boolean;
  isSummary?: boolean;
  isCritical?: boolean;
  outlineLevel?: number | null;
  parentId?: number | string | null;
  assignee?: string | null;
  href?: string | null;
}

export interface FridayGanttDependency {
  from: number | string;
  to: number | string;
  type?: "FS" | "SS" | "FF" | "SF";
}

export interface FridayGanttChartData {
  title?: string;
  subtitle?: string;
  href?: string | null;
  tasks: FridayGanttTask[];
  dependencies?: FridayGanttDependency[];
  truncatedCount?: number;
}

interface ScheduledTask {
  task: FridayGanttTask;
  startDay: number;
  endDay: number;
  rowIndex: number;
}

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 36;
const MIN_BAR_PX = 4;
const MILESTONE_SIZE = 10;

function dayDiff(a: Date, b: Date): number {
  const aUTC = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUTC = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUTC - aUTC) / 86400000);
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildSchedule(tasks: FridayGanttTask[]): {
  scheduled: ScheduledTask[];
  origin: Date | null;
  totalDays: number;
} {
  const datedTasks = tasks
    .map((t) => ({ task: t, start: parseDate(t.start), end: parseDate(t.end ?? t.start) }))
    .filter((x) => x.start !== null);

  if (datedTasks.length === 0) {
    return { scheduled: [], origin: null, totalDays: 0 };
  }

  let minDate = datedTasks[0].start!;
  let maxDate = datedTasks[0].end ?? datedTasks[0].start!;
  for (const x of datedTasks) {
    if (x.start! < minDate) minDate = x.start!;
    const e = x.end ?? x.start!;
    if (e > maxDate) maxDate = e;
  }

  const totalDays = Math.max(1, dayDiff(minDate, maxDate) + 1);

  const scheduled: ScheduledTask[] = datedTasks.map((x, idx) => {
    const startDay = dayDiff(minDate, x.start!);
    const isMs = !!x.task.isMilestone;
    const endDay = isMs
      ? startDay
      : Math.max(startDay + 1, dayDiff(minDate, x.end ?? x.start!) + 1);
    return { task: x.task, startDay, endDay, rowIndex: idx };
  });

  return { scheduled, origin: minDate, totalDays };
}

interface AxisTick {
  day: number;
  label: string;
}

function buildTicks(totalDays: number, origin: Date): AxisTick[] {
  let stepDays: number;
  if (totalDays <= 14) stepDays = 1;
  else if (totalDays <= 60) stepDays = 7;
  else if (totalDays <= 365) stepDays = 30;
  else stepDays = 90;

  const ticks: AxisTick[] = [];
  for (let d = 0; d <= totalDays; d += stepDays) {
    const date = new Date(origin.getTime() + d * 86400000);
    const label =
      stepDays >= 30
        ? date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
        : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    ticks.push({ day: d, label });
  }
  return ticks;
}

interface DepLink {
  from: ScheduledTask;
  to: ScheduledTask;
  type: "FS" | "SS" | "FF" | "SF";
}

function buildPath(
  link: DepLink,
  pxPerDay: number,
  rowHeight: number,
): string {
  const t = link.type;
  const fy = link.from.rowIndex * rowHeight + rowHeight / 2;
  const ty = link.to.rowIndex * rowHeight + rowHeight / 2;
  const fxStart = link.from.startDay * pxPerDay;
  const fxEnd = link.from.endDay * pxPerDay;
  const txStart = link.to.startDay * pxPerDay;
  const txEnd = link.to.endDay * pxPerDay;
  const fx = t === "SS" || t === "SF" ? fxStart : fxEnd;
  const tx = t === "SS" || t === "FS" ? txStart : txEnd;
  const stub = 8;
  if (t === "FS") {
    if (tx >= fx + stub * 2) {
      const midX = (fx + tx) / 2;
      return `M ${fx} ${fy} L ${midX} ${fy} L ${midX} ${ty} L ${tx} ${ty}`;
    }
    return `M ${fx} ${fy} L ${fx + stub} ${fy} L ${fx + stub} ${(fy + ty) / 2} L ${tx - stub} ${(fy + ty) / 2} L ${tx - stub} ${ty} L ${tx} ${ty}`;
  }
  return `M ${fx} ${fy} L ${tx} ${ty}`;
}

interface Props {
  data: FridayGanttChartData;
  onNavigate?: (path: string) => void;
  variant?: "panel" | "page";
}

const MAX_LABEL_PX = 180;
const MIN_LABEL_PX = 110;

export function FridayGanttChart({ data, onNavigate, variant = "page" }: Props) {
  const { scheduled, origin, totalDays } = useMemo(
    () => buildSchedule(data.tasks ?? []),
    [data.tasks],
  );

  const isPanel = variant === "panel";
  const labelWidth = isPanel ? MIN_LABEL_PX : MAX_LABEL_PX;

  const ticks = useMemo(
    () => (origin ? buildTicks(totalDays, origin) : []),
    [origin, totalDays],
  );

  const idToScheduled = useMemo(() => {
    const m = new Map<string, ScheduledTask>();
    scheduled.forEach((s) => m.set(String(s.task.id), s));
    return m;
  }, [scheduled]);

  const links: DepLink[] = useMemo(() => {
    const out: DepLink[] = [];
    for (const dep of data.dependencies ?? []) {
      const f = idToScheduled.get(String(dep.from));
      const t = idToScheduled.get(String(dep.to));
      if (!f || !t) continue;
      const type =
        dep.type === "SS" || dep.type === "FF" || dep.type === "SF"
          ? dep.type
          : "FS";
      out.push({ from: f, to: t, type });
    }
    return out;
  }, [data.dependencies, idToScheduled]);

  if (scheduled.length === 0) {
    return (
      <div
        className="my-2 rounded-lg border border-border bg-card px-3 py-3 text-sm"
        data-testid="friday-gantt-empty"
      >
        <div className="font-medium text-foreground">{data.title ?? "Gantt chart"}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          No tasks with start and end dates were available to plot.
          {data.href ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => data.href && onNavigate?.(data.href)}
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Open the full project Gantt
              </button>
              .
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // Pixel sizing — chat bubbles are narrow so cap aggressively but keep
  // readable. We let horizontal scrolling kick in for long timelines.
  const desiredPxPerDay = totalDays <= 14 ? 32 : totalDays <= 60 ? 14 : totalDays <= 365 ? 3 : 1.2;
  const minChartWidth = isPanel ? 260 : 420;
  const chartWidth = Math.max(minChartWidth, Math.round(totalDays * desiredPxPerDay));
  const pxPerDay = chartWidth / totalDays;
  const chartHeight = scheduled.length * ROW_HEIGHT;

  const headerClickable = !!data.href;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="my-2 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        data-testid="friday-gantt-chart"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {data.title ?? "Gantt chart"}
            </div>
            {data.subtitle ? (
              <div className="truncate text-xs text-muted-foreground">{data.subtitle}</div>
            ) : null}
          </div>
          {headerClickable ? (
            <button
              type="button"
              onClick={() => data.href && onNavigate?.(data.href)}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              data-testid="friday-gantt-open-full"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="relative max-h-[420px] overflow-auto">
          <div className="flex" style={{ width: labelWidth + chartWidth }}>
            {/* Sticky label column */}
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-border bg-card"
              style={{ width: labelWidth }}
            >
              <div
                className="sticky top-0 z-10 flex items-end border-b border-border bg-card px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                style={{ height: HEADER_HEIGHT }}
              >
                Task
              </div>
              {scheduled.map((s) => {
                const indent = Math.max(0, (s.task.outlineLevel ?? 1) - 1) * 10;
                const clickable = !!s.task.href;
                const Inner = (
                  <span
                    className={cn(
                      "truncate",
                      s.task.isSummary && "font-semibold",
                      s.task.isMilestone && "italic",
                      clickable && "text-primary group-hover:underline",
                    )}
                    title={s.task.name}
                  >
                    {s.task.name}
                  </span>
                );
                return (
                  <div
                    key={`label-${s.task.id}`}
                    className={cn(
                      "group flex items-center gap-1.5 border-b border-border/60 px-2 text-xs",
                      clickable && "cursor-pointer hover:bg-accent/50",
                    )}
                    style={{ height: ROW_HEIGHT, paddingLeft: 8 + indent }}
                    onClick={() => {
                      if (clickable && s.task.href) onNavigate?.(s.task.href);
                    }}
                    data-testid={`friday-gantt-label-${s.task.id}`}
                  >
                    {s.task.isSummary ? (
                      <ListTree className="h-3 w-3 shrink-0 text-blue-500" />
                    ) : s.task.isMilestone ? (
                      <MilestoneIcon className="h-3 w-3 shrink-0 text-amber-500" />
                    ) : null}
                    {Inner}
                  </div>
                );
              })}
            </div>

            {/* Chart */}
            <div className="relative" style={{ width: chartWidth }}>
              {/* Header / axis */}
              <div
                className="sticky top-0 z-10 border-b border-border bg-card"
                style={{ height: HEADER_HEIGHT, width: chartWidth }}
              >
                <svg width={chartWidth} height={HEADER_HEIGHT} className="block" aria-hidden="true">
                  {ticks.map((t, i) => {
                    const x = Math.round(t.day * pxPerDay);
                    return (
                      <g key={`tick-${i}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={HEADER_HEIGHT - 6}
                          y2={HEADER_HEIGHT}
                          className="stroke-border"
                        />
                        <text
                          x={x + 3}
                          y={HEADER_HEIGHT - 12}
                          className="fill-muted-foreground"
                          style={{ fontSize: 9 }}
                        >
                          {t.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Body */}
              <div className="relative" style={{ height: chartHeight, width: chartWidth }}>
                {/* Grid + row separators + dependency links */}
                <svg
                  width={chartWidth}
                  height={chartHeight}
                  className="absolute inset-0"
                  aria-hidden="true"
                >
                  {ticks.map((t, i) => {
                    const x = Math.round(t.day * pxPerDay);
                    return (
                      <line
                        key={`grid-${i}`}
                        x1={x}
                        x2={x}
                        y1={0}
                        y2={chartHeight}
                        className="stroke-border/40"
                      />
                    );
                  })}
                  {scheduled.map((_, idx) => (
                    <line
                      key={`row-${idx}`}
                      x1={0}
                      x2={chartWidth}
                      y1={(idx + 1) * ROW_HEIGHT}
                      y2={(idx + 1) * ROW_HEIGHT}
                      className="stroke-border/40"
                    />
                  ))}
                  <defs>
                    <marker
                      id="friday-gantt-arrow"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
                    </marker>
                  </defs>
                  {links.map((link, i) => (
                    <path
                      key={`dep-${i}`}
                      d={buildPath(link, pxPerDay, ROW_HEIGHT)}
                      fill="none"
                      strokeWidth={1}
                      className="stroke-muted-foreground/50"
                      markerEnd="url(#friday-gantt-arrow)"
                    />
                  ))}
                </svg>

                {/* Bars */}
                {scheduled.map((s, idx) => {
                  const top = idx * ROW_HEIGHT;
                  const left = Math.round(s.startDay * pxPerDay);
                  const rawWidth = Math.round((s.endDay - s.startDay) * pxPerDay);
                  const width = Math.max(MIN_BAR_PX, rawWidth);
                  const startDate = origin
                    ? new Date(origin.getTime() + s.startDay * 86400000)
                    : null;
                  const endDate = origin
                    ? new Date(origin.getTime() + Math.max(s.endDay - 1, s.startDay) * 86400000)
                    : null;

                  const tooltipBody = (
                    <div className="space-y-0.5 text-xs">
                      <div className="font-medium">{s.task.name}</div>
                      {startDate ? (
                        <div className="text-muted-foreground">
                          {s.task.isMilestone || s.startDay === s.endDay
                            ? fmtDay(startDate)
                            : `${fmtDay(startDate)} – ${fmtDay(endDate!)}`}
                        </div>
                      ) : null}
                      {typeof s.task.percentComplete === "number" ? (
                        <div className="text-muted-foreground">
                          {Math.round(s.task.percentComplete)}% complete
                        </div>
                      ) : null}
                      {s.task.assignee ? (
                        <div className="text-muted-foreground">{s.task.assignee}</div>
                      ) : null}
                    </div>
                  );

                  const handleClick = () => {
                    if (s.task.href) onNavigate?.(s.task.href);
                  };

                  if (s.task.isMilestone) {
                    const cx = left;
                    const cy = top + ROW_HEIGHT / 2;
                    return (
                      <Tooltip key={`bar-${s.task.id}`}>
                        <TooltipTrigger asChild>
                          <svg
                            className={cn("absolute", s.task.href && "cursor-pointer")}
                            style={{
                              left: cx - MILESTONE_SIZE,
                              top: cy - MILESTONE_SIZE,
                              width: MILESTONE_SIZE * 2,
                              height: MILESTONE_SIZE * 2,
                            }}
                            onClick={handleClick}
                            data-testid={`friday-gantt-milestone-${s.task.id}`}
                          >
                            <polygon
                              points={`${MILESTONE_SIZE},2 ${MILESTONE_SIZE * 2 - 2},${MILESTONE_SIZE} ${MILESTONE_SIZE},${MILESTONE_SIZE * 2 - 2} 2,${MILESTONE_SIZE}`}
                              className="fill-amber-500 stroke-amber-700"
                              strokeWidth={1}
                            />
                          </svg>
                        </TooltipTrigger>
                        <TooltipContent side="top">{tooltipBody}</TooltipContent>
                      </Tooltip>
                    );
                  }

                  if (s.task.isSummary) {
                    return (
                      <Tooltip key={`bar-${s.task.id}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "absolute rounded-sm bg-foreground/70",
                              s.task.href && "cursor-pointer hover:bg-foreground",
                            )}
                            style={{
                              left,
                              top: top + 4,
                              width,
                              height: 6,
                            }}
                            onClick={handleClick}
                            data-testid={`friday-gantt-summary-${s.task.id}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top">{tooltipBody}</TooltipContent>
                      </Tooltip>
                    );
                  }

                  const pct = typeof s.task.percentComplete === "number"
                    ? Math.max(0, Math.min(100, s.task.percentComplete))
                    : null;
                  const barColor = s.task.isCritical
                    ? "bg-rose-500"
                    : "bg-primary";
                  const barFill = s.task.isCritical
                    ? "bg-rose-700"
                    : "bg-primary-foreground/40";

                  return (
                    <Tooltip key={`bar-${s.task.id}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "absolute overflow-hidden rounded-sm",
                            barColor,
                            s.task.href && "cursor-pointer hover:opacity-90",
                          )}
                          style={{
                            left,
                            top: top + 4,
                            width,
                            height: ROW_HEIGHT - 10,
                          }}
                          onClick={handleClick}
                          data-testid={`friday-gantt-bar-${s.task.id}`}
                        >
                          {pct !== null && pct > 0 ? (
                            <div
                              className={cn("h-full", barFill)}
                              style={{ width: `${pct}%` }}
                            />
                          ) : null}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">{tooltipBody}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {data.truncatedCount && data.truncatedCount > 0 ? (
          <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            Showing {scheduled.length} of {scheduled.length + data.truncatedCount} tasks.
            {data.href ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => data.href && onNavigate?.(data.href)}
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  Open the full project Gantt
                </button>
                .
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

export function tryParseFridayGanttChart(json: string): FridayGanttChartData | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.tasks)) return null;
    const tasks: FridayGanttTask[] = [];
    for (const t of parsed.tasks) {
      if (!t || typeof t !== "object") continue;
      if (t.id == null || typeof t.name !== "string") continue;
      tasks.push({
        id: t.id,
        name: t.name,
        start: typeof t.start === "string" ? t.start : null,
        end: typeof t.end === "string" ? t.end : null,
        percentComplete: typeof t.percentComplete === "number" ? t.percentComplete : null,
        isMilestone: !!t.isMilestone,
        isSummary: !!t.isSummary,
        isCritical: !!t.isCritical,
        outlineLevel: typeof t.outlineLevel === "number" ? t.outlineLevel : null,
        parentId: t.parentId ?? null,
        assignee: typeof t.assignee === "string" ? t.assignee : null,
        href: typeof t.href === "string" ? t.href : null,
      });
    }
    const dependencies: FridayGanttDependency[] = [];
    if (Array.isArray(parsed.dependencies)) {
      for (const d of parsed.dependencies) {
        if (!d || typeof d !== "object") continue;
        if (d.from == null || d.to == null) continue;
        dependencies.push({
          from: d.from,
          to: d.to,
          type:
            d.type === "SS" || d.type === "FF" || d.type === "SF" || d.type === "FS"
              ? d.type
              : "FS",
        });
      }
    }
    return {
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : undefined,
      href: typeof parsed.href === "string" ? parsed.href : null,
      tasks,
      dependencies,
      truncatedCount:
        typeof parsed.truncatedCount === "number" && parsed.truncatedCount > 0
          ? parsed.truncatedCount
          : undefined,
    };
  } catch {
    return null;
  }
}
