import { format } from "date-fns";
import type { Task, ScheduleVersionTask, TaskDependency } from "@shared/schema";

/**
 * View-model returned by {@link snapshotsToPreviewSchedule}. Both arrays use
 * negative synthetic IDs so they can never collide with real task IDs in the
 * caller's caches.
 */
export type PreviewSchedule = {
  tasks: Task[];
  dependencies: TaskDependency[];
};

/**
 * Convert a full set of ScheduleVersionTask snapshots into the Task-shaped
 * objects + TaskDependency rows that ProjectGanttView expects, so the
 * snapshot can be rendered read-only with hierarchy and dependency lines
 * intact.
 *
 * - `parentId` is reconstructed by mapping each row's `parentExternalId`
 *   back to the synthetic id of the row whose `externalId` matches.
 * - Dependencies are parsed from each row's JSON `predecessors` field and
 *   mapped through the same external→synthetic id table.
 */
export function snapshotsToPreviewSchedule(
  snapshots: ScheduleVersionTask[],
): PreviewSchedule {
  const externalToSyntheticId = new Map<number, number>();
  snapshots.forEach((t, i) => {
    if (t.externalId != null) {
      externalToSyntheticId.set(t.externalId, -(i + 1));
    }
  });

  const tasks: Task[] = snapshots.map((t, i) => {
    const syntheticId = -(i + 1);
    const startDate = t.startDate ?? format(new Date(), "yyyy-MM-dd");
    const endDate = t.endDate ?? startDate;
    const dur = t.durationDays != null ? Number(t.durationDays) : null;
    const parentId =
      t.parentExternalId != null
        ? externalToSyntheticId.get(t.parentExternalId) ?? null
        : null;
    const isSummary = t.isSummary ?? false;
    const isMilestone = t.isMilestone ?? false;
    const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";

    const task: Task = {
      id: syntheticId,
      projectId: 0,
      taskIndex: t.taskIndex ?? i + 1,
      taskNumber: null,
      wbs: t.wbs ?? null,
      name: t.name,
      description: t.notes ?? null,
      taskType,
      priority: "Medium",
      startDate,
      endDate,
      baselineStartDate: null,
      baselineEndDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: dur != null && Number.isFinite(dur) ? dur : null,
      estimatedHours: t.workHours != null ? Number(t.workHours) : null,
      actualHours: t.actualWorkHours != null ? Number(t.actualWorkHours) : null,
      remainingHours:
        t.remainingWorkHours != null ? Number(t.remainingWorkHours) : null,
      progress: t.progress ?? 0,
      status: t.status ?? "Not Started",
      constraintType: null,
      constraintDate: null,
      assignee: null,
      ownerId: null,
      outlineLevel: t.outlineLevel ?? 1,
      parentId,
      isMilestone,
      isSummary,
      isCritical: false,
      isOngoing: false,
      schedulingMode: "auto",
      cost: null,
      actualCost: null,
      phase: null,
      category: null,
      labels: null,
      notes: t.notes ?? null,
      notesUpdatedAt: null,
      notesUpdatedBy: null,
      notesUpdatedByName: null,
      timesheetBlocked: false,
      externalId: t.externalId != null ? String(t.externalId) : null,
      completionOverridden: false,
      milestoneNumber: null,
      milestoneType: null,
      deliverables: null,
      acceptanceCriteria: null,
      successMetrics: null,
      stakeholders: null,
      updatedAt: null,
      organizationId: null,
      createdAt: null,
      deletedAt: null,
      deletedBy: null,
      isDemo: false,
    };
    return task;
  });

  const depTypeMap: Record<string, string> = {
    FS: "finish-to-start",
    SS: "start-to-start",
    FF: "finish-to-finish",
    SF: "start-to-finish",
  };
  const dependencies: TaskDependency[] = [];
  const seen = new Set<string>();
  let nextDepId = -1;

  for (const t of snapshots) {
    if (t.externalId == null) continue;
    const taskId = externalToSyntheticId.get(t.externalId);
    if (taskId == null) continue;
    if (!t.predecessors) continue;

    let preds: Array<{ predecessorTaskId: number; type: string; lagDays: number }> = [];
    try {
      const parsed = JSON.parse(t.predecessors);
      if (Array.isArray(parsed)) preds = parsed;
    } catch {
      preds = [];
    }

    for (const p of preds) {
      const dependsOnTaskId = externalToSyntheticId.get(p.predecessorTaskId);
      if (dependsOnTaskId == null || dependsOnTaskId === taskId) continue;
      const key = `${taskId}->${dependsOnTaskId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const dep: TaskDependency = {
        id: nextDepId--,
        taskId,
        dependsOnTaskId,
        dependencyType: depTypeMap[p.type] || "finish-to-start",
        lagDays: Math.round(Number(p.lagDays) || 0),
        createdAt: null,
      };
      dependencies.push(dep);
    }
  }

  return { tasks, dependencies };
}
