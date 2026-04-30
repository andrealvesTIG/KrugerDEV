import { useMemo } from "react";
import { Milestone as MilestoneIcon, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/workingDays";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TemplateGanttItem {
  id: number;
  taskId: number | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  outlineLevel: number;
  parentTaskId: number | null;
  isSummary: boolean;
  isMilestone: boolean;
  predecessors: string | null;
}

interface PredecessorRef {
  predecessorTaskId: number;
  type?: string;
  lagDays?: number;
}

interface ScheduledItem {
  item: TemplateGanttItem;
  startDay: number;
  endDay: number;
}

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 44;
const LABEL_WIDTH = 280;
const MIN_BAR_PX = 4;
const MILESTONE_SIZE = 12;

function parsePredecessors(raw: string | null): PredecessorRef[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((p) => p && typeof p === "object" && typeof p.predecessorTaskId === "number")
        .map((p) => ({
          predecessorTaskId: p.predecessorTaskId,
          type: typeof p.type === "string" ? p.type : "finish-to-start",
          lagDays: typeof p.lagDays === "number" ? p.lagDays : 0,
        }));
    }
  } catch {
    // Could be a comma-separated string of taskIds or names — best-effort
    const parts = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const refs: PredecessorRef[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (Number.isFinite(n)) {
        refs.push({ predecessorTaskId: n, type: "finish-to-start", lagDays: 0 });
      }
    }
    return refs;
  }
  return [];
}

function dayDiff(aIso: string, bIso: string): number {
  const a = Date.UTC(
    Number(aIso.slice(0, 4)),
    Number(aIso.slice(5, 7)) - 1,
    Number(aIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(bIso.slice(0, 4)),
    Number(bIso.slice(5, 7)) - 1,
    Number(bIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86400000);
}

/**
 * Compute a (day-offset) schedule for each item.
 *
 * Strategy:
 *   1. If every leaf item has both startDate and endDate, use those — the
 *      origin (day 0) is the earliest start date.
 *   2. Otherwise compute startDay/endDay from predecessors via a topological
 *      pass. Items with no predecessors fall back to running sequentially in
 *      the order they were stored (which matches the seed/import order).
 *   3. Summary items span the min/max of their children.
 */
export function scheduleTemplateItems(items: TemplateGanttItem[]): {
  scheduled: ScheduledItem[];
  totalDays: number;
  origin: Date | null;
} {
  return scheduleItems(items);
}

function scheduleItems(items: TemplateGanttItem[]): {
  scheduled: ScheduledItem[];
  totalDays: number;
  origin: Date | null;
} {
  if (items.length === 0) {
    return { scheduled: [], totalDays: 0, origin: null };
  }

  const leafItems = items.filter((i) => !i.isSummary);
  const allLeavesHaveDates =
    leafItems.length > 0 &&
    leafItems.every((i) => !!i.startDate && (!!i.endDate || i.isMilestone));

  let scheduledByItemId = new Map<number, ScheduledItem>();
  let origin: Date | null = null;
  let totalDays = 0;

  if (allLeavesHaveDates) {
    let minIso = leafItems[0].startDate!;
    let maxIso = leafItems[0].endDate || leafItems[0].startDate!;
    for (const item of leafItems) {
      if (item.startDate && item.startDate < minIso) minIso = item.startDate;
      const end = item.endDate || item.startDate!;
      if (end > maxIso) maxIso = end;
    }
    origin = new Date(`${minIso}T00:00:00Z`);
    totalDays = Math.max(1, dayDiff(minIso, maxIso) + 1);

    for (const item of items) {
      if (item.isSummary) continue;
      const startIso = item.startDate || minIso;
      const endIso = item.endDate || startIso;
      const startDay = dayDiff(minIso, startIso);
      const endDay = dayDiff(minIso, endIso) + 1;
      scheduledByItemId.set(item.id, {
        item,
        startDay,
        endDay: item.isMilestone ? startDay : Math.max(endDay, startDay + 1),
      });
    }
  } else {
    // Topological pass keyed off taskId. Items without an entry get pushed
    // after their predecessor list resolves (or after the previous sibling).
    const itemByTaskId = new Map<number, TemplateGanttItem>();
    for (const item of items) {
      if (item.taskId != null) itemByTaskId.set(item.taskId, item);
    }

    const orderedLeaves = items.filter((i) => !i.isSummary);
    const computed = new Map<number, { startDay: number; endDay: number }>();
    let prevLeafEnd = 0;

    for (const item of orderedLeaves) {
      const preds = parsePredecessors(item.predecessors);
      let earliestStart = 0;
      let usedPredecessor = false;
      for (const p of preds) {
        const predItem = itemByTaskId.get(p.predecessorTaskId);
        if (!predItem) continue;
        const predSched = computed.get(predItem.id);
        if (!predSched) continue;
        const lag = p.lagDays ?? 0;
        const candidate = predSched.endDay + lag;
        if (candidate > earliestStart) earliestStart = candidate;
        usedPredecessor = true;
      }
      if (!usedPredecessor) {
        // Sequential fallback so the bars stack readably even when a template
        // has no recorded dependencies.
        earliestStart = prevLeafEnd;
      }
      const dur = item.isMilestone
        ? 0
        : Math.max(0, Number(item.durationDays ?? 0));
      const startDay = earliestStart;
      const endDay = item.isMilestone ? startDay : startDay + Math.max(dur, 1);
      computed.set(item.id, { startDay, endDay });
      scheduledByItemId.set(item.id, { item, startDay, endDay });
      prevLeafEnd = endDay;
      if (endDay > totalDays) totalDays = endDay;
    }
  }

  // Resolve summaries from their children (descendants by parentTaskId chain).
  const childrenByParentId = new Map<number, TemplateGanttItem[]>();
  for (const item of items) {
    if (item.parentTaskId == null) continue;
    const parent = items.find((p) => p.taskId === item.parentTaskId);
    if (!parent) continue;
    const list = childrenByParentId.get(parent.id) ?? [];
    list.push(item);
    childrenByParentId.set(parent.id, list);
  }

  const resolveSummary = (summary: TemplateGanttItem): { startDay: number; endDay: number } | null => {
    const children = childrenByParentId.get(summary.id) ?? [];
    if (children.length === 0) return null;
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const child of children) {
      const sched = child.isSummary ? resolveSummary(child) : scheduledByItemId.get(child.id);
      if (!sched) continue;
      if (sched.startDay < minStart) minStart = sched.startDay;
      if (sched.endDay > maxEnd) maxEnd = sched.endDay;
    }
    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return null;
    return { startDay: minStart, endDay: maxEnd };
  };

  for (const item of items) {
    if (!item.isSummary) continue;
    const sched = resolveSummary(item);
    if (sched) {
      scheduledByItemId.set(item.id, { item, startDay: sched.startDay, endDay: sched.endDay });
      if (sched.endDay > totalDays) totalDays = sched.endDay;
    }
  }

  const scheduled: ScheduledItem[] = items.map((item) =>
    scheduledByItemId.get(item.id) ?? { item, startDay: 0, endDay: 0 },
  );

  return { scheduled, totalDays: Math.max(1, totalDays), origin };
}

interface AxisTick {
  day: number;
  label: string;
  major: boolean;
}

function buildAxisTicks(totalDays: number, origin: Date | null): { ticks: AxisTick[]; unitLabel: string } {
  if (totalDays <= 0) return { ticks: [], unitLabel: "" };

  // Pick a granularity that keeps the axis readable.
  let stepDays: number;
  let unitLabel: string;
  if (totalDays <= 21) {
    stepDays = 1;
    unitLabel = "Days";
  } else if (totalDays <= 84) {
    stepDays = 7;
    unitLabel = "Weeks";
  } else if (totalDays <= 365) {
    stepDays = 30;
    unitLabel = "Months";
  } else {
    stepDays = 90;
    unitLabel = "Quarters";
  }

  const ticks: AxisTick[] = [];
  for (let d = 0; d <= totalDays; d += stepDays) {
    if (origin) {
      const date = new Date(origin.getTime() + d * 86400000);
      const label =
        stepDays >= 30
          ? date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
          : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      ticks.push({ day: d, label, major: stepDays >= 30 });
    } else {
      let label: string;
      if (stepDays === 1) label = `D${d + 1}`;
      else if (stepDays === 7) label = `W${Math.floor(d / 7) + 1}`;
      else if (stepDays === 30) label = `M${Math.floor(d / 30) + 1}`;
      else label = `Q${Math.floor(d / 90) + 1}`;
      ticks.push({ day: d, label, major: stepDays >= 30 });
    }
  }
  return { ticks, unitLabel };
}

interface Props {
  items: TemplateGanttItem[];
}

export function TemplateGanttPreview({ items }: Props) {
  const { scheduled, totalDays, origin } = useMemo(() => scheduleItems(items), [items]);
  const { ticks, unitLabel } = useMemo(
    () => buildAxisTicks(totalDays, origin),
    [totalDays, origin],
  );

  if (scheduled.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No schedulable items in this template.</p>
    );
  }

  // Pick a comfortable pixel-per-day. Cap the chart width so very long
  // templates don't blow up the page, and floor it so short ones still feel
  // chunky.
  const desiredChartWidth = Math.min(2400, Math.max(560, totalDays * 18));
  const pxPerDay = desiredChartWidth / totalDays;
  const chartWidth = Math.round(totalDays * pxPerDay);
  const chartHeight = scheduled.length * ROW_HEIGHT;

  const formatDayRange = (s: ScheduledItem): string => {
    if (origin) {
      const start = new Date(origin.getTime() + s.startDay * 86400000);
      const end = new Date(origin.getTime() + Math.max(s.endDay - 1, s.startDay) * 86400000);
      const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (s.item.isMilestone || s.startDay === s.endDay) return fmt(start);
      return `${fmt(start)} – ${fmt(end)}`;
    }
    if (s.item.isMilestone || s.startDay === s.endDay) return `Day ${s.startDay + 1}`;
    return `Day ${s.startDay + 1} – Day ${s.endDay}`;
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
          <span>
            {origin
              ? `Schedule preview · ${origin.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} +`
              : "Schedule preview · relative timeline"}
          </span>
          <span>
            {totalDays} {totalDays === 1 ? "day" : "days"} · {unitLabel.toLowerCase()}
          </span>
        </div>
        <div className="relative max-h-[640px] overflow-auto">
          <div className="flex" style={{ width: LABEL_WIDTH + chartWidth }}>
            {/* Sticky label column */}
            <div
              className="sticky left-0 z-20 shrink-0 border-r bg-background"
              style={{ width: LABEL_WIDTH }}
            >
              <div
                className="sticky top-0 z-10 flex items-end border-b bg-background px-3 pb-1 text-xs font-medium text-muted-foreground"
                style={{ height: HEADER_HEIGHT }}
              >
                Item
              </div>
              {scheduled.map((s) => (
                <div
                  key={`label-${s.item.id}`}
                  className="flex items-center gap-2 border-b px-3 text-sm"
                  style={{
                    height: ROW_HEIGHT,
                    paddingLeft: 12 + Math.max(0, (s.item.outlineLevel || 1) - 1) * 14,
                  }}
                  data-testid={`gantt-label-${s.item.id}`}
                >
                  {s.item.isSummary ? (
                    <ListTree className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                  ) : s.item.isMilestone ? (
                    <MilestoneIcon className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  ) : null}
                  <span
                    className={cn(
                      "truncate",
                      s.item.isSummary && "font-semibold",
                      s.item.isMilestone && "italic",
                    )}
                    title={s.item.name}
                  >
                    {s.item.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="relative" style={{ width: chartWidth }}>
              {/* Header / axis */}
              <div
                className="sticky top-0 z-10 border-b bg-background"
                style={{ height: HEADER_HEIGHT, width: chartWidth }}
              >
                <svg
                  width={chartWidth}
                  height={HEADER_HEIGHT}
                  className="block"
                  aria-hidden="true"
                >
                  {ticks.map((t, i) => {
                    const x = Math.round(t.day * pxPerDay);
                    return (
                      <g key={`tick-${i}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={HEADER_HEIGHT - 8}
                          y2={HEADER_HEIGHT}
                          className="stroke-border"
                        />
                        <text
                          x={x + 4}
                          y={HEADER_HEIGHT - 14}
                          className="fill-muted-foreground text-[10px]"
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
                {/* Vertical grid lines */}
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
                        className={cn(
                          "stroke-border/60",
                          t.major && "stroke-border",
                        )}
                      />
                    );
                  })}
                  {/* Row separators */}
                  {scheduled.map((_, idx) => (
                    <line
                      key={`row-${idx}`}
                      x1={0}
                      x2={chartWidth}
                      y1={(idx + 1) * ROW_HEIGHT}
                      y2={(idx + 1) * ROW_HEIGHT}
                      className="stroke-border/60"
                    />
                  ))}
                </svg>

                {/* Bars */}
                {scheduled.map((s, idx) => {
                  const top = idx * ROW_HEIGHT;
                  const left = Math.round(s.startDay * pxPerDay);
                  const rawWidth = Math.round((s.endDay - s.startDay) * pxPerDay);
                  const width = Math.max(MIN_BAR_PX, rawWidth);

                  const tooltipBody = (
                    <div className="space-y-0.5 text-xs">
                      <div className="font-medium">{s.item.name}</div>
                      <div className="text-muted-foreground">{formatDayRange(s)}</div>
                      {!s.item.isMilestone && s.item.durationDays != null && (
                        <div className="text-muted-foreground">
                          Duration: {formatDuration(Number(s.item.durationDays))}
                        </div>
                      )}
                    </div>
                  );

                  if (s.item.isMilestone) {
                    const cx = left;
                    const cy = top + ROW_HEIGHT / 2;
                    return (
                      <Tooltip key={`bar-${s.item.id}`}>
                        <TooltipTrigger asChild>
                          <svg
                            className="absolute"
                            style={{
                              left: cx - MILESTONE_SIZE,
                              top: cy - MILESTONE_SIZE,
                              width: MILESTONE_SIZE * 2,
                              height: MILESTONE_SIZE * 2,
                            }}
                            data-testid={`gantt-milestone-${s.item.id}`}
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

                  if (s.item.isSummary) {
                    return (
                      <Tooltip key={`bar-${s.item.id}`}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute"
                            style={{
                              left,
                              top: top + 6,
                              width,
                              height: ROW_HEIGHT - 12,
                            }}
                            data-testid={`gantt-summary-${s.item.id}`}
                          >
                            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-slate-700 dark:bg-slate-300" />
                            <div
                              className="absolute left-0 top-0 h-2 w-2 rotate-45 bg-slate-700 dark:bg-slate-300"
                              style={{ transform: "translate(-1px, 2px) rotate(45deg)" }}
                            />
                            <div
                              className="absolute right-0 top-0 h-2 w-2 rotate-45 bg-slate-700 dark:bg-slate-300"
                              style={{ transform: "translate(1px, 2px) rotate(45deg)" }}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">{tooltipBody}</TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Tooltip key={`bar-${s.item.id}`}>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute rounded bg-primary/80 hover:bg-primary"
                          style={{
                            left,
                            top: top + 5,
                            width,
                            height: ROW_HEIGHT - 10,
                          }}
                          data-testid={`gantt-bar-${s.item.id}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top">{tooltipBody}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded bg-primary/80" />
            Task
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1 w-4 rounded bg-slate-700 dark:bg-slate-300" />
            Phase / summary
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width={12} height={12} aria-hidden="true">
              <polygon
                points="6,1 11,6 6,11 1,6"
                className="fill-amber-500 stroke-amber-700"
                strokeWidth={1}
              />
            </svg>
            Milestone
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
