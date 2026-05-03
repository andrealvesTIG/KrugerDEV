import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/use-projects";
import { useTasks } from "@/hooks/use-tasks";
import {
  FridayBurndownChart,
  type FridayBurndownChartData,
  type FridayBurndownPoint,
} from "@/components/jarvis/FridayProgressCharts";
import type { Task } from "@shared/schema";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_POINTS = 24;

function parseDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const dt = typeof d === "string" ? new Date(d) : d;
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isCompleted(t: Task): boolean {
  const status = (t.status || "").toLowerCase();
  if (status === "completed" || status === "done" || status === "closed") return true;
  return (t.progress ?? 0) >= 100;
}

function completionDate(t: Task): Date | null {
  const actual = parseDate(t.actualEndDate);
  if (actual) return actual;
  if (isCompleted(t)) {
    return parseDate(t.endDate);
  }
  return null;
}

interface BurndownComputation {
  data: FridayBurndownChartData;
  totalScope: number;
  hasDates: boolean;
}

function buildBurndown(projectName: string, projectCode: string | null, tasks: Task[]): BurndownComputation {
  // Exclude summary rows (their child tasks already represent the work).
  const workTasks = tasks.filter((t) => !t.isSummary && !t.deletedAt);

  // Decide whether to weight by estimated hours or task counts. Falls back to
  // "1 unit per task" when no estimates exist anywhere.
  const totalEstimated = workTasks.reduce((sum, t) => sum + (Number(t.estimatedHours) || 0), 0);
  const useHours = totalEstimated > 0;
  const unit = useHours ? "hrs" : "tasks";
  const weightOf = (t: Task) => (useHours ? Number(t.estimatedHours) || 0 : 1);
  const totalScope = workTasks.reduce((sum, t) => sum + weightOf(t), 0);

  // Determine project window from task dates. Without any dates we can't draw
  // a meaningful timeline.
  const startCandidates = workTasks
    .map((t) => parseDate(t.startDate) ?? parseDate(t.actualStartDate))
    .filter((d): d is Date => d !== null);
  const endCandidates = workTasks
    .map((t) => parseDate(t.endDate) ?? parseDate(t.actualEndDate))
    .filter((d): d is Date => d !== null);

  if (totalScope === 0 || startCandidates.length === 0 || endCandidates.length === 0) {
    return {
      data: {
        title: `${projectName} — Burndown`,
        subtitle: projectCode ?? undefined,
        unit,
        points: [],
      },
      totalScope,
      hasDates: false,
    };
  }

  const startDate = new Date(Math.min(...startCandidates.map((d) => d.getTime())));
  const endDate = new Date(Math.max(...endCandidates.map((d) => d.getTime())));
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY));

  // Bucket the timeline into ~MAX_POINTS evenly-spaced periods so the X-axis
  // stays readable for both short sprints and multi-month projects.
  const periodCount = Math.min(MAX_POINTS, Math.max(2, totalDays + 1));
  const periodDays = totalDays / (periodCount - 1);

  // Pre-aggregate completed work by day so we can sweep the timeline.
  const completedByDay = new Map<string, number>();
  for (const t of workTasks) {
    const cd = completionDate(t);
    if (!cd) continue;
    cd.setHours(0, 0, 0, 0);
    const key = dayKey(cd);
    completedByDay.set(key, (completedByDay.get(key) ?? 0) + weightOf(t));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const points: FridayBurndownPoint[] = [];
  let asOfIndex = -1;
  let cumulativeDone = 0;
  // Walk each period boundary, summing completions that fell on or before it.
  for (let i = 0; i < periodCount; i++) {
    const offset = Math.round(i * periodDays);
    const d = new Date(startDate.getTime() + offset * MS_PER_DAY);
    const ideal = totalScope * (1 - i / (periodCount - 1));

    // Tally completions inside (previous boundary, current boundary].
    const prevOffset = i === 0 ? -1 : Math.round((i - 1) * periodDays);
    for (let off = prevOffset + 1; off <= offset; off++) {
      const dayDate = new Date(startDate.getTime() + off * MS_PER_DAY);
      cumulativeDone += completedByDay.get(dayKey(dayDate)) ?? 0;
    }

    const point: FridayBurndownPoint = {
      label: formatLabel(d),
      ideal: Math.max(0, Number(ideal.toFixed(2))),
    };
    if (d.getTime() <= today.getTime()) {
      point.actual = Math.max(0, Number((totalScope - cumulativeDone).toFixed(2)));
      asOfIndex = i;
    }
    points.push(point);
  }

  // Linear projection from current actual to project end date so the user can
  // eyeball whether the team is trending toward the deadline.
  if (asOfIndex >= 0 && asOfIndex < points.length - 1) {
    const currentActual = points[asOfIndex].actual ?? totalScope - cumulativeDone;
    const remainingPeriods = points.length - 1 - asOfIndex;
    if (remainingPeriods > 0) {
      const burnPerPeriod = asOfIndex > 0
        ? Math.max(0, (totalScope - currentActual) / asOfIndex)
        : 0;
      let projected = currentActual;
      points[asOfIndex].projected = Math.max(0, Number(currentActual.toFixed(2)));
      for (let i = asOfIndex + 1; i < points.length; i++) {
        projected = Math.max(0, projected - burnPerPeriod);
        points[i].projected = Number(projected.toFixed(2));
      }
    }
  }

  return {
    data: {
      title: `${projectName} — Burndown`,
      subtitle: projectCode
        ? `${projectCode} • Remaining ${unit} by period`
        : `Remaining ${unit} by period`,
      unit,
      asOfIndex: asOfIndex >= 0 ? asOfIndex : null,
      points,
    },
    totalScope,
    hasDates: true,
  };
}

export default function ProjectBurndown() {
  const [, params] = useRoute("/projects/:id/burndown");
  const projectId = parseInt(params?.id || "0", 10);
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: tasks, isLoading: tasksLoading } = useTasks(projectId);

  const projectCode = project?.projectCode ?? null;
  const projectName = project?.name ?? "Project";

  const computation = useMemo(
    () => buildBurndown(projectName, projectCode, tasks ?? []),
    [projectName, projectCode, tasks],
  );

  const loading = projectLoading || tasksLoading;
  const projectHref = `/projects/${projectId}`;

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-4" data-testid="project-burndown-page">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="sm" data-testid="button-back-to-project">
            <Link href={projectHref}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to project
            </Link>
          </Button>
          <h1 className="text-lg font-semibold truncate">
            {projectName}
            <span className="text-muted-foreground font-normal"> — Burndown</span>
          </h1>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading burndown…
          </CardContent>
        </Card>
      ) : !project ? (
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Project not found or you don't have access.
          </CardContent>
        </Card>
      ) : !computation.hasDates ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">No schedule data yet</CardTitle>
            <CardDescription className="text-xs">
              Add start and end dates (or estimated hours) to this project's tasks to draw a burndown.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Project Burndown</CardTitle>
            <CardDescription className="text-xs">
              Ideal line burns total scope evenly across the project window. Actual line tracks remaining work
              based on completed tasks; projected extends today's pace to project end.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FridayBurndownChart data={computation.data} variant="page" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
