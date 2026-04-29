import { db } from "../db";
import {
  scheduleVersions, scheduleVersionTasks, mppImportTasks, mppImports, projects, tasks, taskDependencies,
  type ScheduleVersion, type InsertScheduleVersion,
  type ScheduleVersionTask, type InsertScheduleVersionTask,
  type MppImportTask,
} from "@shared/schema";
import { and, eq, desc, sql, isNull } from "drizzle-orm";
import { calculateEndDate, formatDateStr } from "../lib/workingDays";

export async function getNextScheduleVersionNumber(
  projectId: number,
  tx?: any,
): Promise<number> {
  const exec = tx ?? db;
  const rows = await exec.select({ max: sql<number>`COALESCE(MAX(${scheduleVersions.versionNumber}), 0)` })
    .from(scheduleVersions)
    .where(eq(scheduleVersions.projectId, projectId));
  return Number(rows[0]?.max || 0) + 1;
}

function importTasksToVersionTaskRows(
  versionId: number,
  importedTasks: MppImportTask[],
): InsertScheduleVersionTask[] {
  return importedTasks.map((t, i) => ({
    versionId,
    externalId: t.taskId ?? null,
    wbs: t.wbs ?? null,
    name: t.taskName,
    startDate: t.startDate ?? null,
    endDate: t.finishDate ?? null,
    duration: t.duration ?? null,
    durationDays: t.durationDays != null ? String(t.durationDays) : null,
    progress: t.percentComplete ?? 0,
    status: t.percentComplete === 100 ? "Completed" :
            (t.percentComplete && t.percentComplete > 0) ? "In Progress" : "Not Started",
    isSummary: t.isSummary ?? false,
    isMilestone: t.isMilestone ?? false,
    outlineLevel: t.outlineLevel ?? 1,
    parentExternalId: t.parentTaskId ?? null,
    predecessors: t.predecessors ?? null,
    notes: t.notes ?? null,
    workHours: t.workHours != null ? String(t.workHours) : null,
    actualWorkHours: t.actualWorkHours != null ? String(t.actualWorkHours) : null,
    remainingWorkHours: t.remainingWorkHours != null ? String(t.remainingWorkHours) : null,
    taskIndex: i + 1,
  }));
}

/**
 * Create a new schedule version snapshot for a project, given a set of
 * imported (file-derived) tasks. Marks this version as the current one and
 * un-marks any previously-current version for the same project.
 *
 * Designed to be called from inside an existing transaction (pass `tx`) but
 * also works stand-alone.
 */
export async function createScheduleVersionFromImportTasks(
  params: {
    projectId: number;
    organizationId: number;
    mppImportId: number | null;
    fileName: string;
    fileType: string;
    fileUrl: string | null;
    importedBy: string | null;
    importedTasks: MppImportTask[];
    summary?: string;
    restoreOfVersionId?: number | null;
  },
  tx?: any,
): Promise<ScheduleVersion> {
  const exec = tx ?? db;

  const versionNumber = await getNextScheduleVersionNumber(params.projectId, exec);

  // Un-mark any previous current versions for this project
  await exec.update(scheduleVersions)
    .set({ isCurrent: false })
    .where(and(
      eq(scheduleVersions.projectId, params.projectId),
      eq(scheduleVersions.isCurrent, true),
    ));

  const insertValues: InsertScheduleVersion = {
    projectId: params.projectId,
    organizationId: params.organizationId,
    versionNumber,
    mppImportId: params.mppImportId ?? null,
    fileName: params.fileName,
    fileType: params.fileType,
    fileUrl: params.fileUrl ?? null,
    importedBy: params.importedBy ?? null,
    taskCount: params.importedTasks.length,
    isCurrent: true,
    restoreOfVersionId: params.restoreOfVersionId ?? null,
    summary: params.summary ?? null,
  };

  const [newVersion] = await exec.insert(scheduleVersions)
    .values(insertValues)
    .returning();

  if (params.importedTasks.length > 0) {
    const rows = importTasksToVersionTaskRows(newVersion.id, params.importedTasks);
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await exec.insert(scheduleVersionTasks).values(rows.slice(i, i + CHUNK_SIZE));
    }
  }

  return newVersion;
}

/**
 * Snapshot a project's tasks from a re-imported file into a new version using
 * the rows already stored in mpp_import_tasks.
 */
export async function createScheduleVersionFromMppImport(
  params: {
    projectId: number;
    organizationId: number;
    mppImportId: number;
    fileName: string;
    fileType: string;
    fileUrl: string | null;
    importedBy: string | null;
    summary?: string;
    restoreOfVersionId?: number | null;
  },
  tx?: any,
): Promise<ScheduleVersion> {
  const exec = tx ?? db;
  const importedTasks = await exec.select().from(mppImportTasks)
    .where(eq(mppImportTasks.importId, params.mppImportId))
    .orderBy(mppImportTasks.taskId);

  return createScheduleVersionFromImportTasks({
    ...params,
    importedTasks: importedTasks as MppImportTask[],
  }, exec);
}

export class ScheduleVersionDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ScheduleVersionDeleteError";
    this.status = status;
  }
}

/**
 * Hard-delete a schedule version row. The accompanying snapshot rows in
 * `schedule_version_tasks` are removed automatically via the `onDelete:
 * "cascade"` foreign key.
 *
 * Refuses to delete:
 *  - the version that is currently marked as `isCurrent`
 *  - the very first version (versionNumber === 1) so the original baseline is
 *    always preserved
 */
export async function deleteScheduleVersion(versionId: number): Promise<{
  deletedVersionNumber: number;
  projectId: number;
}> {
  const version = await getScheduleVersion(versionId);
  if (!version) {
    throw new ScheduleVersionDeleteError("Schedule version not found", 404);
  }
  if (version.isCurrent) {
    throw new ScheduleVersionDeleteError(
      "Cannot delete the current schedule version. Restore a different version first.",
    );
  }
  if (version.versionNumber === 1) {
    throw new ScheduleVersionDeleteError(
      "Cannot delete the original schedule version (v1).",
    );
  }

  await db.delete(scheduleVersions).where(eq(scheduleVersions.id, versionId));

  return {
    deletedVersionNumber: version.versionNumber,
    projectId: version.projectId,
  };
}

export async function listScheduleVersionsForProject(projectId: number): Promise<ScheduleVersion[]> {
  return await db.select().from(scheduleVersions)
    .where(eq(scheduleVersions.projectId, projectId))
    .orderBy(desc(scheduleVersions.versionNumber));
}

export async function getScheduleVersion(versionId: number): Promise<ScheduleVersion | undefined> {
  const [row] = await db.select().from(scheduleVersions).where(eq(scheduleVersions.id, versionId));
  return row;
}

export async function getScheduleVersionTasks(versionId: number): Promise<ScheduleVersionTask[]> {
  return await db.select().from(scheduleVersionTasks)
    .where(eq(scheduleVersionTasks.versionId, versionId))
    .orderBy(scheduleVersionTasks.taskIndex);
}

// === Diff ===

/** Spec-shaped diff payload returned by GET /schedule-versions/diff. */
export type ScheduleDiff = {
  fromVersion: ScheduleVersion;
  toVersion: ScheduleVersion;
  /** Snapshot tasks present in `to` but not matched in `from`. */
  added: ScheduleVersionTask[];
  /** Snapshot tasks present in `from` but not matched in `to`. */
  removed: ScheduleVersionTask[];
  /** Tasks matched on both sides whose tracked fields differ. */
  changed: Array<{
    before: ScheduleVersionTask;
    after: ScheduleVersionTask;
    /** Names of fields (from DIFF_FIELDS) whose values differ. */
    changedFields: string[];
  }>;
  unchangedCount: number;
};

function normName(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

/**
 * Pair up snapshot tasks across two versions using a 3-stage fallback so that
 * tasks which have shifted identity (e.g. lost their externalId between
 * imports, or were renamed but kept the same WBS) still match instead of
 * showing up spuriously as added/removed.
 *
 * Stages, in priority order:
 *   1. externalId — only when both sides have one
 *   2. WBS code   — only when both sides have one (case/whitespace normalized)
 *   3. name       — case/whitespace normalized
 *
 * Returns paired (`pairs`) and unmatched buckets per side.
 */
function pairSnapshotTasks(
  fromTasks: ScheduleVersionTask[],
  toTasks: ScheduleVersionTask[],
): {
  pairs: Array<{ from: ScheduleVersionTask; to: ScheduleVersionTask; key: string }>;
  unmatchedFrom: ScheduleVersionTask[];
  unmatchedTo: ScheduleVersionTask[];
} {
  const pairs: Array<{ from: ScheduleVersionTask; to: ScheduleVersionTask; key: string }> = [];
  const usedFrom = new Set<number>();
  const usedTo = new Set<number>();

  // Stage 1: externalId
  const fromByExt = new Map<number, ScheduleVersionTask>();
  for (const t of fromTasks) {
    if (t.externalId != null) fromByExt.set(t.externalId, t);
  }
  for (const t of toTasks) {
    if (t.externalId == null) continue;
    const m = fromByExt.get(t.externalId);
    if (m && !usedFrom.has(m.id)) {
      pairs.push({ from: m, to: t, key: `ext:${t.externalId}` });
      usedFrom.add(m.id);
      usedTo.add(t.id);
    }
  }

  // Stage 2: WBS, only over the still-unmatched
  const fromByWbs = new Map<string, ScheduleVersionTask>();
  for (const t of fromTasks) {
    if (usedFrom.has(t.id)) continue;
    if (t.wbs) fromByWbs.set(normName(t.wbs), t);
  }
  for (const t of toTasks) {
    if (usedTo.has(t.id)) continue;
    if (!t.wbs) continue;
    const m = fromByWbs.get(normName(t.wbs));
    if (m && !usedFrom.has(m.id)) {
      pairs.push({ from: m, to: t, key: `wbs:${normName(t.wbs)}` });
      usedFrom.add(m.id);
      usedTo.add(t.id);
    }
  }

  // Stage 3: normalized name
  const fromByName = new Map<string, ScheduleVersionTask>();
  for (const t of fromTasks) {
    if (usedFrom.has(t.id)) continue;
    fromByName.set(normName(t.name), t);
  }
  for (const t of toTasks) {
    if (usedTo.has(t.id)) continue;
    const m = fromByName.get(normName(t.name));
    if (m && !usedFrom.has(m.id)) {
      pairs.push({ from: m, to: t, key: `name:${normName(t.name)}` });
      usedFrom.add(m.id);
      usedTo.add(t.id);
    }
  }

  const unmatchedFrom = fromTasks.filter((t) => !usedFrom.has(t.id));
  const unmatchedTo = toTasks.filter((t) => !usedTo.has(t.id));
  return { pairs, unmatchedFrom, unmatchedTo };
}

// User-visible diff fields: name, start/end, duration, % complete, status, wbs,
// predecessors, parent, milestone — per task spec.
const DIFF_FIELDS: Array<keyof ScheduleVersionTask> = [
  "name", "startDate", "endDate", "durationDays", "progress",
  "status", "wbs", "predecessors", "parentExternalId", "isMilestone",
];

function diffTaskFieldNames(a: ScheduleVersionTask, b: ScheduleVersionTask): string[] {
  const names: string[] = [];
  for (const field of DIFF_FIELDS) {
    const before = a[field];
    const after = b[field];
    const beforeStr = before == null ? null : String(before);
    const afterStr = after == null ? null : String(after);
    if (beforeStr !== afterStr) {
      names.push(field as string);
    }
  }
  return names;
}

export async function diffScheduleVersions(
  fromVersionId: number,
  toVersionId: number,
): Promise<ScheduleDiff> {
  const [fromVersion, toVersion] = await Promise.all([
    getScheduleVersion(fromVersionId),
    getScheduleVersion(toVersionId),
  ]);
  if (!fromVersion) throw new Error("From version not found");
  if (!toVersion) throw new Error("To version not found");
  if (fromVersion.projectId !== toVersion.projectId) {
    throw new Error("Versions belong to different projects");
  }

  const [fromTasks, toTasks] = await Promise.all([
    getScheduleVersionTasks(fromVersionId),
    getScheduleVersionTasks(toVersionId),
  ]);

  const { pairs, unmatchedFrom, unmatchedTo } = pairSnapshotTasks(fromTasks, toTasks);

  const added: ScheduleVersionTask[] = unmatchedTo;
  const removed: ScheduleVersionTask[] = unmatchedFrom;

  const changed: ScheduleDiff["changed"] = [];
  let unchangedCount = 0;
  for (const { from, to } of pairs) {
    const changedFields = diffTaskFieldNames(from, to);
    if (changedFields.length > 0) {
      changed.push({ before: from, after: to, changedFields });
    } else {
      unchangedCount++;
    }
  }

  return { fromVersion, toVersion, added, removed, changed, unchangedCount };
}

/**
 * Restore a schedule version: replace the project's live tasks (soft-delete
 * existing) with the snapshot tasks, then create a new schedule version row
 * that points back at the source version via restoreOfVersionId.
 */
export async function restoreScheduleVersion(
  versionId: number,
  userId: string | null,
): Promise<{ project: { id: number; organizationId: number }; newVersion: ScheduleVersion; tasksRestored: number }> {
  const sourceVersion = await getScheduleVersion(versionId);
  if (!sourceVersion) throw new Error("Version not found");

  const snapshotTasks = await getScheduleVersionTasks(versionId);
  const today = new Date().toISOString().split('T')[0];
  const defaultEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const projectId = sourceVersion.projectId;

  return await db.transaction(async (tx) => {
    // Soft-delete existing live tasks for this project
    await tx.update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));

    // Insert tasks from snapshot, mapping external task IDs to new IDs for
    // parent + dependency wiring.
    const externalToNewId = new Map<number, number>();

    for (let i = 0; i < snapshotTasks.length; i++) {
      const t = snapshotTasks[i];
      const startDate = t.startDate || today;
      const endDate = t.endDate ||
        (t.durationDays
          ? formatDateStr(calculateEndDate(new Date(startDate), Number(t.durationDays)))
          : defaultEndDate);

      const isSummary = t.isSummary ?? false;
      const isMilestone = t.isMilestone ?? false;
      const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";

      const [newTask] = await tx.insert(tasks).values({
        projectId,
        name: t.name,
        wbs: t.wbs ?? undefined,
        description: t.notes ?? undefined,
        startDate,
        endDate,
        durationDays: t.durationDays ? Number(t.durationDays) : undefined,
        progress: t.progress ?? 0,
        status: t.status ?? (t.progress === 100 ? "Completed" : (t.progress && t.progress > 0 ? "In Progress" : "Not Started")),
        outlineLevel: t.outlineLevel ?? 1,
        taskIndex: i + 1,
        isSummary,
        isMilestone,
        taskType,
        estimatedHours: t.workHours ? String(t.workHours) : null,
        actualHours: t.actualWorkHours ? String(t.actualWorkHours) : null,
        remainingHours: t.remainingWorkHours ? String(t.remainingWorkHours) : null,
        parentId: null,
      }).returning();

      if (t.externalId != null) {
        externalToNewId.set(t.externalId, newTask.id);
      }
    }

    // Wire up parents
    for (const t of snapshotTasks) {
      if (t.parentExternalId != null && t.externalId != null) {
        const newId = externalToNewId.get(t.externalId);
        const newParentId = externalToNewId.get(t.parentExternalId);
        if (newId && newParentId) {
          await tx.update(tasks)
            .set({ parentId: newParentId })
            .where(eq(tasks.id, newId));
        }
      }
    }

    // Wire up dependencies from snapshot predecessors
    const depTypeMap: Record<string, string> = {
      'FS': 'finish-to-start', 'SS': 'start-to-start',
      'FF': 'finish-to-finish', 'SF': 'start-to-finish',
    };
    const depRows: Array<{ taskId: number; dependsOnTaskId: number; dependencyType: string; lagDays: number }> = [];
    const seen = new Set<string>();
    for (const t of snapshotTasks) {
      if (t.externalId == null) continue;
      const newTaskId = externalToNewId.get(t.externalId);
      if (!newTaskId) continue;
      let predecessorList: Array<{ predecessorTaskId: number; type: string; lagDays: number }> = [];
      if (t.predecessors) {
        try {
          predecessorList = typeof t.predecessors === 'string' ? JSON.parse(t.predecessors) : [];
        } catch { predecessorList = []; }
      }
      for (const pred of predecessorList) {
        const depTaskId = externalToNewId.get(pred.predecessorTaskId);
        if (!depTaskId || depTaskId === newTaskId) continue;
        const key = `${newTaskId}->${depTaskId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        depRows.push({
          taskId: newTaskId,
          dependsOnTaskId: depTaskId,
          dependencyType: depTypeMap[pred.type] || 'finish-to-start',
          lagDays: Math.round(Number(pred.lagDays) || 0),
        });
      }
    }
    if (depRows.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < depRows.length; i += CHUNK) {
        await tx.insert(taskDependencies).values(depRows.slice(i, i + CHUNK));
      }
    }

    // Re-attach the project to the import source if it was previously detached
    // (Detach & Edit sets source -> "manual" but keeps sourceFileName/Url for
    // historical reference). Restoring intentionally re-links the project to
    // the imported file so re-import / read-only behavior come back online.
    const [project] = await tx.select({ source: projects.source })
      .from(projects)
      .where(eq(projects.id, projectId));

    const projectUpdates: Record<string, unknown> = {};
    if (project && project.source !== "imported") {
      projectUpdates.source = "imported";
    }
    if (sourceVersion.fileName) projectUpdates.sourceFileName = sourceVersion.fileName;
    if (sourceVersion.fileUrl) projectUpdates.sourceFileUrl = sourceVersion.fileUrl;
    if (Object.keys(projectUpdates).length > 0) {
      await tx.update(projects)
        .set(projectUpdates)
        .where(eq(projects.id, projectId));
    }

    // Re-link mpp_imports row to this project if it was unlinked, so that
    // the imported-state UI banner / re-import flow stays aligned.
    if (sourceVersion.mppImportId) {
      await tx.update(mppImports)
        .set({ projectId })
        .where(and(
          eq(mppImports.id, sourceVersion.mppImportId),
          isNull(mppImports.projectId),
        ));
    }

    // Mark previous current versions as not current
    await tx.update(scheduleVersions)
      .set({ isCurrent: false })
      .where(and(
        eq(scheduleVersions.projectId, projectId),
        eq(scheduleVersions.isCurrent, true),
      ));

    // Create the new version row that records the restore
    const versionNumber = await getNextScheduleVersionNumber(projectId, tx);
    const [newVersion] = await tx.insert(scheduleVersions).values({
      projectId,
      organizationId: sourceVersion.organizationId,
      versionNumber,
      mppImportId: sourceVersion.mppImportId ?? null,
      fileName: sourceVersion.fileName,
      fileType: sourceVersion.fileType,
      fileUrl: sourceVersion.fileUrl ?? null,
      importedBy: userId ?? null,
      taskCount: snapshotTasks.length,
      isCurrent: true,
      restoreOfVersionId: sourceVersion.id,
      summary: `Restored from v${sourceVersion.versionNumber}`,
    }).returning();

    // Copy the snapshot tasks under the new version row so the restored
    // version is itself replay-able.
    if (snapshotTasks.length > 0) {
      const importedShape: MppImportTask[] = snapshotTasks.map((t) => ({
        id: 0,
        importId: 0,
        taskId: t.externalId ?? null,
        wbs: t.wbs ?? null,
        taskName: t.name,
        startDate: t.startDate ?? null,
        finishDate: t.endDate ?? null,
        duration: t.duration ?? null,
        durationDays: t.durationDays ?? null,
        percentComplete: t.progress ?? 0,
        outlineLevel: t.outlineLevel ?? 1,
        parentTaskId: t.parentExternalId ?? null,
        isSummary: t.isSummary ?? false,
        isMilestone: t.isMilestone ?? false,
        notes: t.notes ?? null,
        workHours: t.workHours ?? null,
        actualWorkHours: t.actualWorkHours ?? null,
        remainingWorkHours: t.remainingWorkHours ?? null,
        predecessors: t.predecessors ?? null,
        createdAt: new Date(),
      } as MppImportTask));
      const rows = importTasksToVersionTaskRows(newVersion.id, importedShape);
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.insert(scheduleVersionTasks).values(rows.slice(i, i + CHUNK));
      }
    }

    return {
      project: { id: projectId, organizationId: sourceVersion.organizationId },
      newVersion,
      tasksRestored: snapshotTasks.length,
    };
  });
}
