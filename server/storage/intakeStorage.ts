import { db } from "../db";
import { calculateEndDateCal, formatDateStr } from "../lib/workingDays";
import { getResolvedCalendarForProject, getOrgDefaultResolvedCalendar } from "./calendarStorage";
import {
  projectIntakes, mppImports, mppImportTasks, changeRequests,
  intakeWorkflows, intakeWorkflowSteps, projectWorkflows, projectWorkflowSteps,
  projects, tasks, taskDependencies, powerbiIntakeRequests,
  intakeCustomFieldValues, projectCustomFieldValues,
  customFieldDefinitions, resources, users,
  type ProjectIntake, type InsertProjectIntake, type UpdateProjectIntakeRequest,
  type MppImport, type InsertMppImport,
  type MppImportTask, type InsertMppImportTask,
  type ChangeRequest, type InsertChangeRequest, type UpdateChangeRequestRequest,
  type IntakeWorkflow, type InsertIntakeWorkflow,
  type IntakeWorkflowStep, type InsertIntakeWorkflowStep,
  type ProjectWorkflow, type InsertProjectWorkflow,
  type ProjectWorkflowStep, type InsertProjectWorkflowStep,
  type Project, type Task,
} from "@shared/schema";
import { eq, and, desc, asc, isNull, sql, inArray } from "drizzle-orm";
import { getProject } from "./projectStorage";
import { getTasks, deleteAllTasksForProject } from "./taskStorage";
import { createScheduleVersionFromImportTasks } from "./scheduleVersionStorage";
import { assignAutonumberValuesForEntity } from "./miscStorage";

// Compose a friendly display name for a user row, falling back through
// firstName + lastName → email → null.
function formatUserDisplayName(u: { firstName: string | null; lastName: string | null; email: string | null } | null | undefined): string | null {
  if (!u) return null;
  const composed = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return composed || u.email || null;
}

// Resolve a friendly "Current step" label by looking up the workflow step
// row that matches the intake's workflowId + currentStep key. Falls back to
// any matching step row for the organization when no workflow is set, and
// finally to the raw key so callers always get a non-null display string
// when the intake has a current step.
async function resolveCurrentStepLabel(intake: { organizationId: number; workflowId: number | null; currentStep: string | null }): Promise<string | null> {
  if (!intake.currentStep) return null;
  const conditions = [
    eq(intakeWorkflowSteps.organizationId, intake.organizationId),
    eq(intakeWorkflowSteps.stepKey, intake.currentStep),
  ];
  if (intake.workflowId != null) {
    conditions.push(eq(intakeWorkflowSteps.workflowId, intake.workflowId));
  }
  const [row] = await db.select({ label: intakeWorkflowSteps.label })
    .from(intakeWorkflowSteps)
    .where(and(...conditions))
    .limit(1);
  return row?.label ?? intake.currentStep;
}

async function enrichIntakeWithAuditNames<T extends ProjectIntake>(intake: T): Promise<T & { createdByName: string | null; updatedByName: string | null; currentStepLabel: string | null }> {
  const ids = Array.from(new Set([intake.submitterId, intake.updatedBy].filter((v): v is string => !!v)));
  let byId = new Map<string, { firstName: string | null; lastName: string | null; email: string | null }>();
  if (ids.length > 0) {
    const rows = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    }).from(users).where(inArray(users.id, ids));
    byId = new Map(rows.map(r => [r.id, r]));
  }
  const currentStepLabel = await resolveCurrentStepLabel(intake);
  return {
    ...intake,
    createdByName: formatUserDisplayName(intake.submitterId ? byId.get(intake.submitterId) : null),
    updatedByName: formatUserDisplayName(intake.updatedBy ? byId.get(intake.updatedBy) : null),
    currentStepLabel,
  };
}

export async function getProjectIntakes(organizationId: number): Promise<ProjectIntake[]> {
  const rows = await db.select().from(projectIntakes)
    .where(and(
      eq(projectIntakes.organizationId, organizationId),
      isNull(projectIntakes.deletedAt)
    ))
    .orderBy(desc(projectIntakes.createdAt));
  // Batch-load the display names so list views can show "Last modified by"
  // without N+1 round-trips.
  const ids = Array.from(new Set(
    rows.flatMap(r => [r.submitterId, r.updatedBy]).filter((v): v is string => !!v)
  ));
  let byId = new Map<string, { firstName: string | null; lastName: string | null; email: string | null }>();
  if (ids.length > 0) {
    const userRows = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    }).from(users).where(inArray(users.id, ids));
    byId = new Map(userRows.map(r => [r.id, r]));
  }
  // Batch-load step labels keyed by (workflowId|null, stepKey) so list
  // views can show "Current step" without an extra round-trip per row.
  const stepKeys = Array.from(new Set(rows.map(r => r.currentStep).filter((v): v is string => !!v)));
  const stepLabelByKey = new Map<string, string>();
  if (stepKeys.length > 0) {
    const stepRows = await db.select({
      workflowId: intakeWorkflowSteps.workflowId,
      stepKey: intakeWorkflowSteps.stepKey,
      label: intakeWorkflowSteps.label,
    }).from(intakeWorkflowSteps)
      .where(and(
        eq(intakeWorkflowSteps.organizationId, organizationId),
        inArray(intakeWorkflowSteps.stepKey, stepKeys),
      ));
    for (const s of stepRows) {
      stepLabelByKey.set(`${s.workflowId ?? "null"}|${s.stepKey}`, s.label);
    }
  }
  const labelFor = (r: typeof rows[number]): string | null => {
    if (!r.currentStep) return null;
    return stepLabelByKey.get(`${r.workflowId ?? "null"}|${r.currentStep}`)
      ?? stepLabelByKey.get(`null|${r.currentStep}`)
      ?? r.currentStep;
  };
  return rows.map(r => ({
    ...r,
    createdByName: formatUserDisplayName(r.submitterId ? byId.get(r.submitterId) : null),
    updatedByName: formatUserDisplayName(r.updatedBy ? byId.get(r.updatedBy) : null),
    currentStepLabel: labelFor(r),
  })) as ProjectIntake[];
}

export async function getProjectIntake(id: number): Promise<ProjectIntake | undefined> {
  const [intake] = await db.select().from(projectIntakes).where(eq(projectIntakes.id, id));
  if (!intake) return undefined;
  return await enrichIntakeWithAuditNames(intake) as ProjectIntake;
}

export async function getProjectIntakeByCreatedProjectId(projectId: number): Promise<ProjectIntake | undefined> {
  const [intake] = await db.select().from(projectIntakes).where(eq(projectIntakes.createdProjectId, projectId));
  if (!intake) return undefined;
  return await enrichIntakeWithAuditNames(intake) as ProjectIntake;
}

export async function createProjectIntake(intake: InsertProjectIntake): Promise<ProjectIntake> {
  const year = new Date().getFullYear();
  const existingCount = await db.select({ count: sql<number>`count(*)` })
    .from(projectIntakes)
    .where(sql`EXTRACT(YEAR FROM ${projectIntakes.createdAt}) = ${year}`);
  const count = Number(existingCount[0]?.count || 0) + 1;
  const intakeNumber = `INT-${year}-${String(count).padStart(3, '0')}`;
  
  const [newIntake] = await db.insert(projectIntakes)
    .values({ ...intake, intakeNumber })
    .returning();
  return newIntake;
}

export async function updateProjectIntake(id: number, updates: UpdateProjectIntakeRequest, actorUserId?: string | null): Promise<ProjectIntake> {
  const [updated] = await db.update(projectIntakes)
    .set({
      ...updates,
      updatedAt: new Date(),
      // Stamp the actor (if known) so the "Last modified by" field can
      // surface a real user. Internal callers that don't pass an actor leave
      // the existing value untouched.
      ...(actorUserId ? { updatedBy: actorUserId } : {}),
    })
    .where(eq(projectIntakes.id, id))
    .returning();
  return updated;
}

export async function deleteProjectIntake(id: number): Promise<void> {
  // Power BI requests reference project_intakes.id with NO ACTION on delete,
  // so a raw delete fails with a foreign-key violation whenever the intake
  // was created via the Power BI agent. Nullify the link first (preserving
  // the captured request data so it can still be viewed/converted from the
  // Power BI Requests tab), then delete the intake itself.
  await db.transaction(async (tx) => {
    await tx.update(powerbiIntakeRequests)
      .set({ projectIntakeId: null })
      .where(eq(powerbiIntakeRequests.projectIntakeId, id));
    await tx.delete(projectIntakes).where(eq(projectIntakes.id, id));
  });
}

export async function approveProjectIntake(id: number, approvedBy: string): Promise<Project> {
  return await db.transaction(async (tx) => {
    const [intake] = await tx.select().from(projectIntakes).where(eq(projectIntakes.id, id));
    if (!intake) {
      throw new Error("Project intake not found");
    }

    // Resolve the proposed Project Manager from the intake's
    // `managerResourceId` to the new project's `managerResourceId` (always)
    // and `managerId` (only when the resource is linked to a platform user).
    // Org-guarded so a tampered value pointing at another tenant is ignored.
    let intakeManagerResourceId: number | null = null;
    let intakeManagerUserId: string | null = null;
    if (intake.managerResourceId) {
      const [resource] = await tx.select().from(resources).where(and(
        eq(resources.id, intake.managerResourceId),
        eq(resources.organizationId, intake.organizationId),
      ));
      if (resource) {
        intakeManagerResourceId = resource.id;
        intakeManagerUserId = resource.userId ?? null;
      }
    }

    const [newProject] = await tx.insert(projects).values({
      organizationId: intake.organizationId,
      portfolioId: intake.portfolioId,
      programId: intake.programId,
      name: intake.projectName,
      description: intake.description,
      businessUnit: intake.businessUnit,
      budget: intake.estimatedBudget ?? 0,
      status: "Initiation",
      priority: "Medium",
      health: "Green",
      managerResourceId: intakeManagerResourceId,
      managerId: intakeManagerUserId,
    }).returning();

    // Carry forward any custom field values captured on the intake (definitions
    // with entityType='intake') onto the new project. Both tables key off the
    // same fieldDefinitionId, so the same field appears on the project with
    // the captured value already populated.
    const intakeValues = await tx.select().from(intakeCustomFieldValues)
      .where(eq(intakeCustomFieldValues.intakeId, id));
    if (intakeValues.length > 0) {
      await tx.insert(projectCustomFieldValues).values(
        intakeValues.map(v => ({
          projectId: newProject.id,
          fieldDefinitionId: v.fieldDefinitionId,
          value: v.value,
        }))
      ).onConflictDoNothing({
        target: [projectCustomFieldValues.projectId, projectCustomFieldValues.fieldDefinitionId],
      });

      // Map intake-typed `resource` custom fields named "Project Manager" onto
      // the project's built-in `managerId` user column. The custom field stores
      // a resource id; the column expects a user id, so resolve via
      // resources.userId. If multiple PM-like CFs exist, prefer an exact-name
      // match. Silently skip if the resource is not linked to a user.
      const defIds = Array.from(new Set(intakeValues.map(v => v.fieldDefinitionId)));
      const defs = defIds.length > 0
        ? await tx.select().from(customFieldDefinitions).where(inArray(customFieldDefinitions.id, defIds))
        : [];
      // Only fall back to the legacy custom-field-based PM mapping when the
      // new built-in `managerResourceId` field didn't already set the
      // project's manager. Keeps existing orgs working without overwriting
      // an explicit built-in selection.
      const pmDef = defs.find(d =>
        d.entityType === 'intake'
        && d.fieldType === 'resource'
        && (d.name || '').trim().toLowerCase() === 'project manager'
      );
      if (pmDef && !newProject.managerId) {
        const pmValueRow = intakeValues.find(v => v.fieldDefinitionId === pmDef.id);
        const resourceId = Number(pmValueRow?.value ?? '');
        if (Number.isFinite(resourceId) && resourceId > 0) {
          // Org guard: never resolve a resource id from a different tenant
          // even if a tampered CF value points there.
          const [resource] = await tx.select().from(resources).where(and(
            eq(resources.id, resourceId),
            eq(resources.organizationId, intake.organizationId),
          ));
          if (resource?.userId) {
            await tx.update(projects)
              .set({ managerId: resource.userId })
              .where(eq(projects.id, newProject.id));
            newProject.managerId = resource.userId;
          }
        }
      }
    }

    await tx.update(projectIntakes)
      .set({
        status: "approved",
        currentStep: "submit_to_pmo",
        pmoSubmitted: true,
        approvedAt: new Date(),
        approvedBy: approvedBy,
        createdProjectId: newProject.id,
        updatedAt: new Date(),
      })
      .where(eq(projectIntakes.id, id));

    return newProject;
  }).then(async (newProject) => {
    // After the conversion transaction commits, assign any project-typed
    // autonumber custom field values for the brand-new project. (The intake
    // captures intake-typed autonumbers; project-typed ones are issued on
    // first existence of the project, mirroring the regular project-create
    // route's behavior.)
    try {
      await assignAutonumberValuesForEntity({
        organizationId: newProject.organizationId,
        entityType: 'project',
        entityId: newProject.id,
      });
    } catch (err) {
      // Don't fail the whole conversion if autonumber assignment hits an issue;
      // the project already exists and downstream UI will surface missing
      // autonumber values.
      console.error('Failed to assign project autonumber values during intake conversion:', err);
    }
    return newProject;
  });
}

export async function getMppImports(organizationId: number): Promise<MppImport[]> {
  return await db.select().from(mppImports)
    .where(and(
      eq(mppImports.organizationId, organizationId),
      eq(mppImports.status, "active")
    ))
    .orderBy(desc(mppImports.lastSyncedAt));
}

export async function getMppImport(id: number): Promise<MppImport | undefined> {
  const [mppImport] = await db.select().from(mppImports).where(eq(mppImports.id, id));
  return mppImport;
}

export async function createMppImport(mppImport: InsertMppImport): Promise<MppImport> {
  const [newImport] = await db.insert(mppImports).values(mppImport).returning();
  return newImport;
}

export async function updateMppImport(id: number, updates: Partial<InsertMppImport>): Promise<MppImport> {
  const [updated] = await db.update(mppImports)
    .set({ ...updates, lastSyncedAt: new Date() })
    .where(eq(mppImports.id, id))
    .returning();
  return updated;
}

export async function deleteMppImport(id: number): Promise<void> {
  await db.delete(mppImportTasks).where(eq(mppImportTasks.importId, id));
  await db.delete(mppImports).where(eq(mppImports.id, id));
}

export async function getMppImportTasks(importId: number): Promise<MppImportTask[]> {
  return await db.select().from(mppImportTasks)
    .where(eq(mppImportTasks.importId, importId))
    .orderBy(mppImportTasks.taskId);
}

export async function createMppImportTask(task: InsertMppImportTask): Promise<MppImportTask> {
  const [newTask] = await db.insert(mppImportTasks).values(task).returning();
  return newTask;
}

export async function createMppImportTasks(taskList: InsertMppImportTask[]): Promise<MppImportTask[]> {
  if (taskList.length === 0) return [];
  // Postgres has a hard limit of 65,535 bind parameters per query. With ~19
  // columns per row this caps a single insert at ~3,400 rows. Chunk well below
  // that to leave headroom for future schema additions and to avoid memory
  // spikes on very large schedules (e.g. P6 imports with thousands of tasks).
  const CHUNK_SIZE = 1000;
  if (taskList.length <= CHUNK_SIZE) {
    return await db.insert(mppImportTasks).values(taskList).returning();
  }
  // Wrap the chunked inserts in a transaction so partial failures don't leave
  // a half-imported task list under the parent import record.
  return await db.transaction(async (tx) => {
    const inserted: MppImportTask[] = [];
    for (let i = 0; i < taskList.length; i += CHUNK_SIZE) {
      const chunk = taskList.slice(i, i + CHUNK_SIZE);
      const rows = await tx.insert(mppImportTasks).values(chunk).returning();
      inserted.push(...rows);
    }
    return inserted;
  });
}

export async function deleteMppImportTasks(importId: number): Promise<void> {
  await db.delete(mppImportTasks).where(eq(mppImportTasks.importId, importId));
}

export async function convertMppImportToProject(
  importId: number,
  projectData: {
    organizationId: number;
    portfolioId?: number;
    name: string;
    description?: string;
    status?: string;
    priority?: string;
    importedBy?: string | null;
  }
): Promise<{ project: Project; taskCount: number }> {
  const mppImportRecord = await getMppImport(importId);
  if (!mppImportRecord) {
    throw new Error("Import not found");
  }

  const importedTasks = await getMppImportTasks(importId);
  const importErrors: Array<{ row: number; taskName: string; error: string }> = [];

  // No project exists yet — fall back to the org's default calendar so MPP
  // duration math respects org holidays/weekends instead of legacy Mon–Fri.
  // Note: project-level rollup dates (projectStartDate / projectEndDate
  // below) come from the explicit imported startDate / finishDate columns
  // and are intentionally NOT recomputed via the calendar — only per-task
  // end dates derived from a duration are calendar-aware.
  const importCal = await getOrgDefaultResolvedCalendar(projectData.organizationId);

  const today = new Date().toISOString().split('T')[0];
  const defaultEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let projectStartDate = today;
  let projectEndDate = defaultEndDate;
  
  const validStartDates = importedTasks.filter(t => t.startDate).map(t => t.startDate as string);
  const validEndDates = importedTasks.filter(t => t.finishDate).map(t => t.finishDate as string);
  
  if (validStartDates.length > 0) {
    projectStartDate = validStartDates.sort()[0];
  }
  if (validEndDates.length > 0) {
    projectEndDate = validEndDates.sort().reverse()[0];
  }

  // Project budget = sum of leaf-task budgeted costs from the imported file.
  // We sum only non-summary tasks to avoid double-counting WBS rollups that
  // the parser already aggregated.
  const projectBudgetTotal = importedTasks
    .filter(t => !t.isSummary && t.cost != null)
    .reduce((sum, t) => sum + (Number(t.cost) || 0), 0);

  return await db.transaction(async (tx) => {
    const [newProject] = await tx.insert(projects).values({
      organizationId: projectData.organizationId,
      portfolioId: projectData.portfolioId && projectData.portfolioId > 0 ? projectData.portfolioId : null,
      name: projectData.name,
      description: projectData.description || mppImportRecord.fileName,
      status: projectData.status || "Initiation",
      priority: projectData.priority || "Medium",
      startDate: projectStartDate,
      endDate: projectEndDate,
      health: "Green",
      budget: projectBudgetTotal > 0 ? projectBudgetTotal : 0,
      completionPercentage: 0,
      source: "imported",
      sourceFileName: mppImportRecord.fileName,
      sourceFileUrl: mppImportRecord.fileUrl,
    }).returning();

    const taskIdMapping: Map<number, number> = new Map();
    
    for (let i = 0; i < importedTasks.length; i++) {
      const importedTask = importedTasks[i];
      const startDate = importedTask.startDate || today;
      // Reject malformed durations (NaN, Infinity, negative). Previously a
      // bad value silently fell through to calculateEndDateCal and produced
      // endDate == startDate, hiding the corrupted row.
      let derivedEndDate: string | undefined;
      if (importedTask.finishDate) {
        derivedEndDate = importedTask.finishDate;
      } else if (importedTask.durationDays != null) {
        const dur = Number(importedTask.durationDays);
        if (!Number.isFinite(dur) || dur < 0) {
          importErrors.push({
            row: i + 1,
            taskName: importedTask.taskName,
            error: `Invalid durationDays (${importedTask.durationDays}); expected a non-negative finite number`,
          });
        } else {
          derivedEndDate = formatDateStr(calculateEndDateCal(importCal, new Date(startDate), dur));
        }
      }
      const endDate = derivedEndDate ?? defaultEndDate;

      const isSummary = importedTask.isSummary || false;
      const isMilestone = importedTask.isMilestone || false;
      const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";
      const workHoursNum = importedTask.workHours != null ? Number(importedTask.workHours) : null;
      const actualWorkHoursNum = importedTask.actualWorkHours != null ? Number(importedTask.actualWorkHours) : null;
      const remainingWorkHoursNum = importedTask.remainingWorkHours != null ? Number(importedTask.remainingWorkHours) : null;
      // Cost columns are nullable numerics on the imported tasks. Pass them
      // through to tasks.cost / tasks.actualCost so they show in the Gantt
      // view's Cost / Actual Cost columns.
      const importedCostNum = importedTask.cost != null ? Number(importedTask.cost) : null;
      const importedActualCostNum = importedTask.actualCost != null ? Number(importedTask.actualCost) : null;
      const costNum = importedCostNum != null && !isNaN(importedCostNum) ? importedCostNum : null;
      const actualCostNum = importedActualCostNum != null && !isNaN(importedActualCostNum) ? importedActualCostNum : null;

      const [newTask] = await tx.insert(tasks).values({
        projectId: newProject.id,
        name: importedTask.taskName,
        wbs: importedTask.wbs || undefined,
        description: importedTask.notes || undefined,
        startDate,
        endDate,
        durationDays: importedTask.durationDays,
        progress: importedTask.percentComplete || 0,
        status: importedTask.percentComplete === 100 ? "Completed" : 
                importedTask.percentComplete && importedTask.percentComplete > 0 ? "In Progress" : "Not Started",
        outlineLevel: importedTask.outlineLevel || 1,
        taskIndex: i + 1,
        isSummary,
        isMilestone,
        taskType,
        estimatedHours: workHoursNum,
        actualHours: actualWorkHoursNum,
        remainingHours: remainingWorkHoursNum,
        cost: costNum,
        actualCost: actualCostNum,
        parentId: null,
      }).returning();

      if (importedTask.taskId) {
        taskIdMapping.set(importedTask.taskId, newTask.id);
      }
    }

    for (const importedTask of importedTasks) {
      if (importedTask.parentTaskId && importedTask.taskId) {
        const newTaskId = taskIdMapping.get(importedTask.taskId);
        const newParentId = taskIdMapping.get(importedTask.parentTaskId);
        
        if (newTaskId && newParentId) {
          await tx.update(tasks)
            .set({ parentId: newParentId })
            .where(eq(tasks.id, newTaskId));
        }
      }
    }

    // Collect all dependencies in memory, deduping (newTaskId, depTaskId) pairs
    // and dropping self-references. This avoids per-row inserts whose individual
    // failures would poison the outer transaction (Postgres aborts the whole
    // tx on any failed statement, code 25P02), which previously caused the
    // final mppImports UPDATE to fail for larger XER files.
    const depTypeMap: Record<string, string> = {
      'FS': 'finish-to-start',
      'SS': 'start-to-start',
      'FF': 'finish-to-finish',
      'SF': 'start-to-finish',
    };
    const allDepRows: Array<{ taskId: number; dependsOnTaskId: number; dependencyType: string; lagDays: number }> = [];
    const seenDepKeys = new Set<string>();
    let skippedSelfRefs = 0;
    let skippedDupes = 0;

    for (const importedTask of importedTasks) {
      if (!importedTask.taskId) continue;
      const newTaskId = taskIdMapping.get(importedTask.taskId);
      if (!newTaskId) continue;

      let predecessorList: Array<{ predecessorTaskId: number; type: string; lagDays: number }> = [];
      if (importedTask.predecessors) {
        try {
          predecessorList = typeof importedTask.predecessors === 'string'
            ? JSON.parse(importedTask.predecessors)
            : [];
        } catch (e) {
          predecessorList = [];
        }
      }

      for (const pred of predecessorList) {
        const depTaskId = taskIdMapping.get(pred.predecessorTaskId);
        if (!depTaskId) continue;
        if (depTaskId === newTaskId) { skippedSelfRefs++; continue; }

        const key = `${newTaskId}->${depTaskId}`;
        if (seenDepKeys.has(key)) { skippedDupes++; continue; }
        seenDepKeys.add(key);

        allDepRows.push({
          taskId: newTaskId,
          dependsOnTaskId: depTaskId,
          dependencyType: depTypeMap[pred.type] || 'finish-to-start',
          // taskDependencies.lagDays is an integer column. The XER parser keeps
          // sub-day precision (e.g. 3.75 days for a 30-hour lag), so round to
          // the nearest whole day to satisfy the column type. MS Project XML
          // already rounds at parse time.
          lagDays: Math.round(Number(pred.lagDays) || 0),
        });
      }
    }

    if (allDepRows.length > 0) {
      const DEP_CHUNK_SIZE = 500;
      for (let i = 0; i < allDepRows.length; i += DEP_CHUNK_SIZE) {
        await tx.insert(taskDependencies).values(allDepRows.slice(i, i + DEP_CHUNK_SIZE));
      }
    }
    if (skippedSelfRefs > 0 || skippedDupes > 0) {
      console.log(`[convertMppImportToProject] dependencies: inserted ${allDepRows.length}, skipped ${skippedSelfRefs} self-refs, ${skippedDupes} duplicates`);
    }

    const actualTaskCount = importedTasks.length;
    await tx.update(mppImports)
      .set({ projectId: newProject.id, status: "converted", taskCount: actualTaskCount })
      .where(eq(mppImports.id, importId));

    const leafTasks = importedTasks.filter(t => !t.isSummary);
    const avgProgress = leafTasks.length > 0
      ? Math.round(leafTasks.reduce((sum, t) => sum + (t.percentComplete || 0), 0) / leafTasks.length)
      : 0;
    
    let derivedStatus = projectData.status || "Initiation";
    if (avgProgress >= 100) {
      derivedStatus = "Closing";
    } else if (avgProgress > 0) {
      derivedStatus = "Execution";
    } else {
      const hasAnyProgress = leafTasks.some(t => (t.percentComplete || 0) > 0);
      if (hasAnyProgress) {
        derivedStatus = "Execution";
      }
    }

    await tx.update(projects)
      .set({ completionPercentage: avgProgress, status: derivedStatus })
      .where(eq(projects.id, newProject.id));

    // Create initial schedule version snapshot for this project
    try {
      await createScheduleVersionFromImportTasks({
        projectId: newProject.id,
        organizationId: projectData.organizationId,
        mppImportId: importId,
        fileName: mppImportRecord.fileName,
        fileType: mppImportRecord.fileType || 'xml',
        fileUrl: mppImportRecord.fileUrl ?? null,
        importedBy: projectData.importedBy ?? mppImportRecord.importedBy ?? null,
        importedTasks,
        summary: 'Initial import',
      }, tx);
    } catch (snapshotErr) {
      console.error('[convertMppImportToProject] schedule version snapshot failed:', snapshotErr);
      throw snapshotErr;
    }

    return { project: newProject, taskCount: importedTasks.length, importErrors };
  });
}

export async function syncMppImportToProject(
  importId: number,
  projectId: number,
  options?: {
    syncMode?: 'merge' | 'replace';
    importedBy?: string | null;
  }
): Promise<{ project: Project; tasksAdded: number; tasksUpdated: number; tasksRemoved: number; scheduleVersionId?: number; scheduleVersionNumber?: number; importErrors?: Array<{ row: number; taskName: string; error: string }> }> {
  const mppImportRecord = await getMppImport(importId);
  if (!mppImportRecord) {
    throw new Error("Import not found");
  }

  const project = await getProject(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const importedTasks = await getMppImportTasks(importId);
  const existingTasks = await getTasks(projectId);
  const importErrors: Array<{ row: number; taskName: string; error: string }> = [];

  // Project exists — resolve its calendar (project.calendarId → org default)
  // so re-sync duration math honours the same holidays/weekends as the rest
  // of the project's scheduling.
  const importCal = await getResolvedCalendarForProject(projectId);

  const syncMode = options?.syncMode || 'merge';
  let tasksAdded = 0;
  let tasksUpdated = 0;
  let tasksRemoved = 0;

  const today = new Date().toISOString().split('T')[0];
  const defaultEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const existingByName = new Map<string, typeof existingTasks[0]>();
  const existingByWbs = new Map<string, typeof existingTasks[0]>();
  
  for (const task of existingTasks) {
    existingByName.set(task.name.toLowerCase().trim(), task);
    if (task.description?.startsWith('WBS: ')) {
      const wbs = task.description.replace('WBS: ', '').split('\n')[0].trim();
      existingByWbs.set(wbs, task);
    }
  }

  if (syncMode === 'replace') {
    tasksRemoved = existingTasks.length;
    await deleteAllTasksForProject(projectId);
    existingByName.clear();
    existingByWbs.clear();
  }

  const matchedExistingIds = new Set<number>();
  const taskIdMapping = new Map<number, number>();

  for (let i = 0; i < importedTasks.length; i++) {
    const importedTask = importedTasks[i];
    const startDate = importedTask.startDate || today;
    // Reject malformed durations (NaN, Infinity, negative) — mirror
    // convertMppImportToProject above so re-syncs surface the same per-row
    // errors instead of silently collapsing endDate onto startDate.
    let derivedEndDate: string | undefined;
    if (importedTask.finishDate) {
      derivedEndDate = importedTask.finishDate;
    } else if (importedTask.durationDays != null) {
      const dur = Number(importedTask.durationDays);
      if (!Number.isFinite(dur) || dur < 0) {
        importErrors.push({
          row: i + 1,
          taskName: importedTask.taskName,
          error: `Invalid durationDays (${importedTask.durationDays}); expected a non-negative finite number`,
        });
      } else {
        derivedEndDate = formatDateStr(calculateEndDateCal(importCal, new Date(startDate), dur));
      }
    }
    const endDate = derivedEndDate ?? defaultEndDate;

    const isSummary = importedTask.isSummary || false;
    const isMilestone = importedTask.isMilestone || false;
    const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";
    const workHoursNum = importedTask.workHours != null ? Number(importedTask.workHours) : null;
    const actualWorkHoursNum = importedTask.actualWorkHours != null ? Number(importedTask.actualWorkHours) : null;
    const remainingWorkHoursNum = importedTask.remainingWorkHours != null ? Number(importedTask.remainingWorkHours) : null;
    // Mirror cost handling from convertMppImportToProject above so re-syncs
    // also update tasks.cost / tasks.actualCost from the latest P6 file.
    const importedCostNum = importedTask.cost != null ? Number(importedTask.cost) : null;
    const importedActualCostNum = importedTask.actualCost != null ? Number(importedTask.actualCost) : null;
    const costNum = importedCostNum != null && !isNaN(importedCostNum) ? importedCostNum : null;
    const actualCostNum = importedActualCostNum != null && !isNaN(importedActualCostNum) ? importedActualCostNum : null;

    const taskData = {
      name: importedTask.taskName,
      wbs: importedTask.wbs || undefined,
      description: importedTask.notes || undefined,
      startDate,
      endDate,
      durationDays: importedTask.durationDays,
      progress: importedTask.percentComplete || 0,
      status: importedTask.percentComplete === 100 ? "Completed" : 
              importedTask.percentComplete && importedTask.percentComplete > 0 ? "In Progress" : "Not Started",
      outlineLevel: importedTask.outlineLevel || 1,
      taskIndex: i + 1,
      isSummary,
      isMilestone,
      taskType,
      estimatedHours: workHoursNum,
      actualHours: actualWorkHoursNum,
      remainingHours: remainingWorkHoursNum,
      cost: costNum,
      actualCost: actualCostNum,
    };

    let existingTask = importedTask.wbs ? existingByWbs.get(importedTask.wbs) : undefined;
    if (!existingTask) {
      existingTask = existingByName.get(importedTask.taskName.toLowerCase().trim());
    }

    if (existingTask && syncMode === 'merge') {
      await db.update(tasks)
        .set(taskData)
        .where(eq(tasks.id, existingTask.id));
      matchedExistingIds.add(existingTask.id);
      tasksUpdated++;
      if (importedTask.taskId) {
        taskIdMapping.set(importedTask.taskId, existingTask.id);
      }
    } else {
      const [newTask] = await db.insert(tasks).values({
        projectId,
        ...taskData,
        parentId: null,
      }).returning();
      tasksAdded++;
      if (importedTask.taskId) {
        taskIdMapping.set(importedTask.taskId, newTask.id);
      }
    }
  }

  for (const importedTask of importedTasks) {
    if (importedTask.parentTaskId && importedTask.taskId) {
      const newTaskId = taskIdMapping.get(importedTask.taskId);
      const newParentId = taskIdMapping.get(importedTask.parentTaskId);
      
      if (newTaskId && newParentId) {
        await db.update(tasks)
          .set({ parentId: newParentId })
          .where(eq(tasks.id, newTaskId));
      }
    }
  }

  // Same pre-dedupe + bulk insert approach as convertMppImportToProject above.
  const syncDepTypeMap: Record<string, string> = {
    'FS': 'finish-to-start',
    'SS': 'start-to-start',
    'FF': 'finish-to-finish',
    'SF': 'start-to-finish',
  };
  const syncDepRows: Array<{ taskId: number; dependsOnTaskId: number; dependencyType: string; lagDays: number }> = [];
  const syncSeenDepKeys = new Set<string>();

  for (const importedTask of importedTasks) {
    if (!importedTask.taskId) continue;
    const newTaskId = taskIdMapping.get(importedTask.taskId);
    if (!newTaskId) continue;

    let predecessorList: Array<{ predecessorTaskId: number; type: string; lagDays: number }> = [];
    if (importedTask.predecessors) {
      try {
        predecessorList = typeof importedTask.predecessors === 'string'
          ? JSON.parse(importedTask.predecessors)
          : [];
      } catch (e) {
        predecessorList = [];
      }
    }

    for (const pred of predecessorList) {
      const depTaskId = taskIdMapping.get(pred.predecessorTaskId);
      if (!depTaskId) continue;
      if (depTaskId === newTaskId) continue;

      const key = `${newTaskId}->${depTaskId}`;
      if (syncSeenDepKeys.has(key)) continue;
      syncSeenDepKeys.add(key);

      syncDepRows.push({
        taskId: newTaskId,
        dependsOnTaskId: depTaskId,
        dependencyType: syncDepTypeMap[pred.type] || 'finish-to-start',
        // Same integer-coercion as convertMppImportToProject above — XER
        // predecessors can carry sub-day lag values that must be rounded.
        lagDays: Math.round(Number(pred.lagDays) || 0),
      });
    }
  }

  if (syncDepRows.length > 0) {
    const SYNC_DEP_CHUNK_SIZE = 500;
    for (let i = 0; i < syncDepRows.length; i += SYNC_DEP_CHUNK_SIZE) {
      await db.insert(taskDependencies).values(syncDepRows.slice(i, i + SYNC_DEP_CHUNK_SIZE));
    }
  }

  await db.update(mppImports)
    .set({ 
      projectId, 
      status: "synced", 
      taskCount: importedTasks.length,
      lastSyncedAt: new Date()
    })
    .where(eq(mppImports.id, importId));

  const validStartDates = importedTasks.filter(t => t.startDate).map(t => t.startDate as string);
  const validEndDates = importedTasks.filter(t => t.finishDate).map(t => t.finishDate as string);
  
  const projectUpdates: any = {};
  if (validStartDates.length > 0) {
    projectUpdates.startDate = validStartDates.sort()[0];
  }
  if (validEndDates.length > 0) {
    projectUpdates.endDate = validEndDates.sort().reverse()[0];
  }

  const leafTasks = importedTasks.filter(t => !t.isSummary);
  const avgProgress = leafTasks.length > 0
    ? Math.round(leafTasks.reduce((sum, t) => sum + (t.percentComplete || 0), 0) / leafTasks.length)
    : project.completionPercentage || 0;
  
  projectUpdates.completionPercentage = avgProgress;

  // Refresh project budget from the rolled-up cost of all leaf tasks in this
  // import. We only set this when the file actually carried cost data so a
  // file without cost doesn't zero out a manually-entered budget.
  const importedBudgetTotal = leafTasks
    .filter(t => t.cost != null)
    .reduce((sum, t) => sum + (Number(t.cost) || 0), 0);
  if (importedBudgetTotal > 0) {
    projectUpdates.budget = importedBudgetTotal.toString();
  }

  if (avgProgress >= 100) {
    projectUpdates.status = "Closing";
  } else if (avgProgress > 0) {
    projectUpdates.status = "Execution";
  } else {
    const hasAnyProgress = leafTasks.some(t => (t.percentComplete || 0) > 0);
    if (hasAnyProgress) {
      projectUpdates.status = "Execution";
    }
  }

  if (Object.keys(projectUpdates).length > 0) {
    await db.update(projects)
      .set(projectUpdates)
      .where(eq(projects.id, projectId));
  }

  const updatedProject = await getProject(projectId);

  // Create a new schedule version snapshot for this re-import. Per task spec,
  // every successful re-import must produce a numbered ScheduleVersion, so
  // any failure here propagates to the route handler instead of being
  // silently swallowed.
  const summary = `Re-import (${syncMode}): ${tasksAdded} added, ${tasksUpdated} updated, ${tasksRemoved} removed`;
  const newVersion = await createScheduleVersionFromImportTasks({
    projectId,
    organizationId: mppImportRecord.organizationId,
    mppImportId: importId,
    fileName: mppImportRecord.fileName,
    fileType: mppImportRecord.fileType || 'xml',
    fileUrl: mppImportRecord.fileUrl ?? null,
    importedBy: options?.importedBy ?? mppImportRecord.importedBy ?? null,
    importedTasks,
    summary,
  });

  return {
    project: updatedProject!,
    tasksAdded,
    tasksUpdated,
    tasksRemoved,
    scheduleVersionId: newVersion.id,
    scheduleVersionNumber: newVersion.versionNumber,
    importErrors: importErrors.length > 0 ? importErrors : undefined,
  };
}

export async function getChangeRequests(projectId: number): Promise<ChangeRequest[]> {
  return await db.select().from(changeRequests)
    .where(eq(changeRequests.projectId, projectId))
    .orderBy(desc(changeRequests.createdAt));
}

export async function getChangeRequest(id: number): Promise<ChangeRequest | undefined> {
  const [changeRequest] = await db.select().from(changeRequests).where(eq(changeRequests.id, id));
  return changeRequest;
}

export async function createChangeRequest(changeRequest: InsertChangeRequest): Promise<ChangeRequest> {
  const [created] = await db.insert(changeRequests).values(changeRequest).returning();
  return created;
}

export async function updateChangeRequest(id: number, updates: UpdateChangeRequestRequest): Promise<ChangeRequest> {
  const [updated] = await db.update(changeRequests)
    .set(updates)
    .where(eq(changeRequests.id, id))
    .returning();
  return updated;
}

export async function deleteChangeRequest(id: number): Promise<void> {
  await db.delete(changeRequests).where(eq(changeRequests.id, id));
}

export async function getIntakeWorkflowSteps(organizationId: number, workflowId?: number | null): Promise<IntakeWorkflowStep[]> {
  if (workflowId != null) {
    return await db.select().from(intakeWorkflowSteps)
      .where(and(
        eq(intakeWorkflowSteps.organizationId, organizationId),
        eq(intakeWorkflowSteps.workflowId, workflowId),
      ))
      .orderBy(intakeWorkflowSteps.position);
  }
  // Backward-compat: return any unscoped steps for this org (legacy single-workflow data)
  return await db.select().from(intakeWorkflowSteps)
    .where(and(
      eq(intakeWorkflowSteps.organizationId, organizationId),
      isNull(intakeWorkflowSteps.workflowId),
    ))
    .orderBy(intakeWorkflowSteps.position);
}

export async function upsertIntakeWorkflowSteps(organizationId: number, steps: InsertIntakeWorkflowStep[], workflowId?: number | null): Promise<IntakeWorkflowStep[]> {
  // Wrap the delete + insert in a single transaction so concurrent requests
  // (e.g. two browser tabs hitting GET /api/organizations/:id/intake-workflow
  // when no steps yet exist) cannot race and leave the table in a half-empty
  // state, which previously surfaced as 500s on the GET endpoint.
  return await db.transaction(async (tx) => {
    if (workflowId != null) {
      await tx.delete(intakeWorkflowSteps).where(and(
        eq(intakeWorkflowSteps.organizationId, organizationId),
        eq(intakeWorkflowSteps.workflowId, workflowId),
      ));
    } else {
      await tx.delete(intakeWorkflowSteps).where(and(
        eq(intakeWorkflowSteps.organizationId, organizationId),
        isNull(intakeWorkflowSteps.workflowId),
      ));
    }

    if (steps.length === 0) {
      return [];
    }

    const stepsWithOrg = steps.map(step => ({
      ...step,
      organizationId,
      workflowId: workflowId ?? step.workflowId ?? null,
    }));

    const inserted = await tx.insert(intakeWorkflowSteps).values(stepsWithOrg).returning();
    return inserted;
  });
}

export async function resetIntakeWorkflowToDefaults(organizationId: number, workflowId?: number | null): Promise<IntakeWorkflowStep[]> {
  const defaultSteps: InsertIntakeWorkflowStep[] = [
    {
      organizationId,
      stepKey: "intake_capture",
      position: 0,
      label: "Intake Capture",
      description: "Capture the initial idea and basic information",
      helpText: "Document the initial request, problem statement, and desired outcome.",
      requiredFields: ["projectName", "description"],
    },
    {
      organizationId,
      stepKey: "triage",
      position: 1,
      label: "Triage",
      description: "Classify and prioritize the intake request",
      helpText: "Determine if this is a new initiative or backlog item, and assign to appropriate portfolio.",
      requiredFields: ["portfolioId", "fundingSource"],
    },
    {
      organizationId,
      stepKey: "business_case",
      position: 2,
      label: "Business Case",
      description: "Define business justification and expected benefits",
      helpText: "Document the business case including ROI, benefits, and stakeholder alignment.",
      requiredFields: ["estimatedBudget", "financialJustification"],
    },
    {
      organizationId,
      stepKey: "technical_evaluation",
      position: 3,
      label: "Technical Evaluation",
      description: "Assess technical feasibility and resource requirements",
      helpText: "Evaluate technical requirements, architecture impact, and resource availability.",
      requiredFields: ["itCostEstimate", "resourceRequirements"],
    },
    {
      organizationId,
      stepKey: "governance_review",
      position: 4,
      label: "Governance Review",
      description: "Security, compliance, and architecture approval",
      helpText: "Complete security assessment, compliance review, and architecture sign-off.",
      requiredFields: ["cyberRiskAssessment"],
    },
    {
      organizationId,
      stepKey: "decision",
      position: 5,
      label: "Decision",
      description: "Final PMO review and approval decision",
      helpText: "PMO reviews the complete intake and makes approval, deferral, or rejection decision.",
      requiredFields: [],
      // The final "Decision" step is where PM approval naturally belongs.
      // Defaulting it on for fresh / reset workflows means orgs see the PM
      // Approval card in the same place it used to live (the legacy
      // `pm_approval` layout block) without any admin action.
      requiresPmApproval: true,
    },
  ];
  
  return upsertIntakeWorkflowSteps(organizationId, defaultSteps, workflowId ?? null);
}

// ============================================================
// Intake Workflows (multi-workflow management)
// ============================================================

const DEFAULT_INTAKE_WORKFLOW_NAME = "Standard Intake";

export async function getIntakeWorkflows(organizationId: number): Promise<IntakeWorkflow[]> {
  return await db.select().from(intakeWorkflows)
    .where(eq(intakeWorkflows.organizationId, organizationId))
    .orderBy(desc(intakeWorkflows.isDefault), asc(intakeWorkflows.name));
}

export async function getIntakeWorkflow(id: number): Promise<IntakeWorkflow | undefined> {
  const [wf] = await db.select().from(intakeWorkflows).where(eq(intakeWorkflows.id, id));
  return wf;
}

export async function createIntakeWorkflow(data: InsertIntakeWorkflow): Promise<IntakeWorkflow> {
  return await db.transaction(async (tx) => {
    if (data.isDefault) {
      await tx.update(intakeWorkflows)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(intakeWorkflows.organizationId, data.organizationId));
    }
    const [wf] = await tx.insert(intakeWorkflows).values(data).returning();
    return wf;
  });
}

export async function updateIntakeWorkflow(id: number, updates: Partial<InsertIntakeWorkflow>): Promise<IntakeWorkflow> {
  return await db.transaction(async (tx) => {
    if (updates.isDefault === true) {
      const [existing] = await tx.select().from(intakeWorkflows).where(eq(intakeWorkflows.id, id));
      if (existing) {
        await tx.update(intakeWorkflows)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(
            eq(intakeWorkflows.organizationId, existing.organizationId),
            sql`${intakeWorkflows.id} <> ${id}`,
          ));
      }
    }
    const [updated] = await tx.update(intakeWorkflows)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(intakeWorkflows.id, id))
      .returning();
    return updated;
  });
}

export async function deleteIntakeWorkflow(id: number): Promise<void> {
  await db.delete(intakeWorkflows).where(eq(intakeWorkflows.id, id));
}

/**
 * Ensures the organization has at least one intake workflow. If legacy
 * unscoped (workflowId IS NULL) intake_workflow_steps exist, they are
 * adopted by the newly-created default workflow so existing customizations
 * are preserved.
 */
export async function backfillRequiresPmApprovalForOrg(organizationId: number): Promise<number> {
  const workflows = await db.select().from(intakeWorkflows)
    .where(eq(intakeWorkflows.organizationId, organizationId));
  let updated = 0;
  for (const wf of workflows) {
    const steps = await db.select().from(intakeWorkflowSteps)
      .where(and(
        eq(intakeWorkflowSteps.organizationId, organizationId),
        eq(intakeWorkflowSteps.workflowId, wf.id),
      ))
      .orderBy(asc(intakeWorkflowSteps.position));
    if (steps.length === 0) continue;
    if (steps.some(s => s.requiresPmApproval)) continue;
    const last = steps[steps.length - 1];
    await db.update(intakeWorkflowSteps)
      .set({ requiresPmApproval: true, updatedAt: new Date() })
      .where(eq(intakeWorkflowSteps.id, last.id));
    updated++;
  }
  return updated;
}

export async function ensureDefaultIntakeWorkflow(organizationId: number): Promise<IntakeWorkflow> {
  const existing = await db.select().from(intakeWorkflows)
    .where(eq(intakeWorkflows.organizationId, organizationId))
    .limit(1);
  if (existing.length > 0) {
    const def = existing.find(w => w.isDefault) || existing[0];
    return def;
  }

  const [wf] = await db.insert(intakeWorkflows).values({
    organizationId,
    name: DEFAULT_INTAKE_WORKFLOW_NAME,
    description: "Default intake workflow",
    isDefault: true,
    isActive: true,
    creationMode: "dialog",
  }).returning();

  // Adopt any pre-existing legacy steps (workflowId IS NULL) for this org
  const legacy = await db.select().from(intakeWorkflowSteps)
    .where(and(
      eq(intakeWorkflowSteps.organizationId, organizationId),
      isNull(intakeWorkflowSteps.workflowId),
    ));

  if (legacy.length > 0) {
    await db.update(intakeWorkflowSteps)
      .set({ workflowId: wf.id })
      .where(and(
        eq(intakeWorkflowSteps.organizationId, organizationId),
        isNull(intakeWorkflowSteps.workflowId),
      ));
  } else {
    await resetIntakeWorkflowToDefaults(organizationId, wf.id);
  }

  return wf;
}

// ============================================================
// Project Workflows (multi-workflow management)
// ============================================================

const DEFAULT_PROJECT_WORKFLOW_NAME = "Standard Project Lifecycle";

const DEFAULT_PROJECT_WORKFLOW_STEPS: Omit<InsertProjectWorkflowStep, "organizationId" | "workflowId">[] = [
  { stepKey: "Initiation",  position: 0, label: "Initiation",  description: "Project chartered and kicked off",     helpText: null, requiredFields: [], isTerminal: false, isActive: true },
  { stepKey: "Planning",    position: 1, label: "Planning",    description: "Scope, schedule, and resources defined", helpText: null, requiredFields: [], isTerminal: false, isActive: true },
  { stepKey: "Execution",   position: 2, label: "Execution",   description: "Project work in progress",                helpText: null, requiredFields: [], isTerminal: false, isActive: true },
  { stepKey: "Monitoring",  position: 3, label: "Monitoring",  description: "Tracking progress and performance",       helpText: null, requiredFields: [], isTerminal: false, isActive: true },
  { stepKey: "Closing",     position: 4, label: "Closing",     description: "Project closed out and lessons captured", helpText: null, requiredFields: [], isTerminal: true,  isActive: true },
];

export async function getProjectWorkflows(organizationId: number): Promise<ProjectWorkflow[]> {
  return await db.select().from(projectWorkflows)
    .where(eq(projectWorkflows.organizationId, organizationId))
    .orderBy(desc(projectWorkflows.isDefault), asc(projectWorkflows.name));
}

export async function getProjectWorkflow(id: number): Promise<ProjectWorkflow | undefined> {
  const [wf] = await db.select().from(projectWorkflows).where(eq(projectWorkflows.id, id));
  return wf;
}

export async function createProjectWorkflow(data: InsertProjectWorkflow): Promise<ProjectWorkflow> {
  return await db.transaction(async (tx) => {
    if (data.isDefault) {
      await tx.update(projectWorkflows)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(projectWorkflows.organizationId, data.organizationId));
    }
    const [wf] = await tx.insert(projectWorkflows).values(data).returning();
    return wf;
  });
}

export async function updateProjectWorkflow(id: number, updates: Partial<InsertProjectWorkflow>): Promise<ProjectWorkflow> {
  return await db.transaction(async (tx) => {
    if (updates.isDefault === true) {
      const [existing] = await tx.select().from(projectWorkflows).where(eq(projectWorkflows.id, id));
      if (existing) {
        await tx.update(projectWorkflows)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(
            eq(projectWorkflows.organizationId, existing.organizationId),
            sql`${projectWorkflows.id} <> ${id}`,
          ));
      }
    }
    const [updated] = await tx.update(projectWorkflows)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projectWorkflows.id, id))
      .returning();
    return updated;
  });
}

export async function deleteProjectWorkflow(id: number): Promise<void> {
  await db.delete(projectWorkflows).where(eq(projectWorkflows.id, id));
}

export async function getProjectWorkflowSteps(organizationId: number, workflowId: number): Promise<ProjectWorkflowStep[]> {
  return await db.select().from(projectWorkflowSteps)
    .where(and(
      eq(projectWorkflowSteps.organizationId, organizationId),
      eq(projectWorkflowSteps.workflowId, workflowId),
    ))
    .orderBy(asc(projectWorkflowSteps.position));
}

export async function upsertProjectWorkflowSteps(
  organizationId: number,
  workflowId: number,
  steps: Array<Omit<InsertProjectWorkflowStep, 'organizationId' | 'workflowId'>>,
): Promise<ProjectWorkflowStep[]> {
  return await db.transaction(async (tx) => {
    await tx.delete(projectWorkflowSteps).where(and(
      eq(projectWorkflowSteps.organizationId, organizationId),
      eq(projectWorkflowSteps.workflowId, workflowId),
    ));
    if (steps.length === 0) return [];
    const rows = steps.map(s => ({ ...s, organizationId, workflowId }));
    return await tx.insert(projectWorkflowSteps).values(rows).returning();
  });
}

export async function resetProjectWorkflowToDefaults(organizationId: number, workflowId: number): Promise<ProjectWorkflowStep[]> {
  await db.delete(projectWorkflowSteps).where(and(
    eq(projectWorkflowSteps.organizationId, organizationId),
    eq(projectWorkflowSteps.workflowId, workflowId),
  ));
  const rows = DEFAULT_PROJECT_WORKFLOW_STEPS.map(s => ({
    ...s,
    organizationId,
    workflowId,
  }));
  return await db.insert(projectWorkflowSteps).values(rows).returning();
}

export async function ensureDefaultProjectWorkflow(organizationId: number): Promise<ProjectWorkflow> {
  const existing = await db.select().from(projectWorkflows)
    .where(eq(projectWorkflows.organizationId, organizationId))
    .limit(1);
  if (existing.length > 0) {
    const def = existing.find(w => w.isDefault) || existing[0];
    return def;
  }

  const [wf] = await db.insert(projectWorkflows).values({
    organizationId,
    name: DEFAULT_PROJECT_WORKFLOW_NAME,
    description: "Default project lifecycle workflow",
    isDefault: true,
    isActive: true,
    creationMode: "dialog",
  }).returning();

  await resetProjectWorkflowToDefaults(organizationId, wf.id);
  return wf;
}

// =============== INTAKE TAB LAYOUT (configurable form) ===============

import {
  intakeTabs as _intakeTabs,
  intakeTabSections as _intakeTabSections,
  intakeTabItems as _intakeTabItems,
  type IntakeTab as _IntakeTab,
  type IntakeTabSection as _IntakeTabSection,
  type IntakeTabItem as _IntakeTabItem,
  type IntakeTabLayoutTabDTO,
} from "@shared/schema";
import { DEFAULT_INTAKE_TABS } from "@shared/intakeTabDefaults";

export interface IntakeTabLayoutItemFull { id: number; itemType: string; itemKey: string; width: string; position: number; displayName: string | null; isRequired: boolean; }
export interface IntakeTabLayoutSectionFull { id: number; title: string | null; description: string | null; position: number; items: IntakeTabLayoutItemFull[]; }
export interface IntakeTabLayoutTabFull { id: number; key: string; label: string; icon: string | null; isActive: boolean; position: number; sections: IntakeTabLayoutSectionFull[]; }

export async function getIntakeTabLayout(organizationId: number): Promise<IntakeTabLayoutTabFull[]> {
  const tabRows = await db.select().from(_intakeTabs)
    .where(eq(_intakeTabs.organizationId, organizationId))
    .orderBy(asc(_intakeTabs.position), asc(_intakeTabs.id));
  if (tabRows.length === 0) return [];
  const tabIds = tabRows.map(t => t.id);
  const sectionRows = await db.select().from(_intakeTabSections)
    .where(inArray(_intakeTabSections.tabId, tabIds))
    .orderBy(asc(_intakeTabSections.tabId), asc(_intakeTabSections.position), asc(_intakeTabSections.id));
  const sectionIds = sectionRows.map(s => s.id);
  const itemRows = sectionIds.length === 0
    ? []
    : await db.select().from(_intakeTabItems)
        .where(inArray(_intakeTabItems.sectionId, sectionIds))
        .orderBy(asc(_intakeTabItems.sectionId), asc(_intakeTabItems.position), asc(_intakeTabItems.id));

  const itemsBySection = new Map<number, IntakeTabLayoutItemFull[]>();
  for (const i of itemRows) {
    const arr = itemsBySection.get(i.sectionId) ?? [];
    arr.push({ id: i.id, itemType: i.itemType, itemKey: i.itemKey, width: i.width, position: i.position, displayName: i.displayName ?? null, isRequired: i.isRequired ?? false });
    itemsBySection.set(i.sectionId, arr);
  }
  const sectionsByTab = new Map<number, IntakeTabLayoutSectionFull[]>();
  for (const s of sectionRows) {
    const arr = sectionsByTab.get(s.tabId) ?? [];
    arr.push({ id: s.id, title: s.title ?? null, description: s.description ?? null, position: s.position, items: itemsBySection.get(s.id) ?? [] });
    sectionsByTab.set(s.tabId, arr);
  }
  return tabRows.map(t => ({
    id: t.id, key: t.key, label: t.label, icon: t.icon ?? null,
    isActive: t.isActive, position: t.position,
    sections: sectionsByTab.get(t.id) ?? [],
  }));
}

export async function replaceIntakeTabLayout(organizationId: number, tabs: IntakeTabLayoutTabDTO[]): Promise<IntakeTabLayoutTabFull[]> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${0x494E544C}, ${organizationId})`);
    await tx.delete(_intakeTabs).where(eq(_intakeTabs.organizationId, organizationId));
    for (let ti = 0; ti < tabs.length; ti++) {
      const t = tabs[ti];
      const [tabRow] = await tx.insert(_intakeTabs).values({
        organizationId, position: ti, key: t.key, label: t.label,
        icon: t.icon ?? null, isActive: t.isActive ?? true,
      }).returning();
      for (let si = 0; si < (t.sections ?? []).length; si++) {
        const s = t.sections[si];
        const [secRow] = await tx.insert(_intakeTabSections).values({
          tabId: tabRow.id, position: si, title: s.title ?? null, description: s.description ?? null,
        }).returning();
        const items = s.items ?? [];
        if (items.length > 0) {
          await tx.insert(_intakeTabItems).values(items.map((it, ii) => ({
            sectionId: secRow.id, position: ii, itemType: it.itemType, itemKey: it.itemKey, width: it.width ?? "full",
            displayName: it.displayName?.trim() ? it.displayName.trim() : null,
            isRequired: !!it.isRequired,
          })));
        }
      }
    }
  });
  return await getIntakeTabLayout(organizationId);
}

export async function seedDefaultIntakeTabLayoutIfMissing(organizationId: number): Promise<IntakeTabLayoutTabFull[]> {
  const existing = await getIntakeTabLayout(organizationId);
  if (existing.length > 0) return existing;
  const dto: IntakeTabLayoutTabDTO[] = DEFAULT_INTAKE_TABS.map(t => ({
    key: t.key, label: t.label, icon: t.icon, isActive: true,
    sections: t.sections.map(s => ({
      title: s.title, description: s.description ?? null,
      items: s.items.map(i => ({ itemType: i.itemType, itemKey: i.itemKey, width: i.width, isRequired: !!i.isRequired })),
    })),
  }));
  return await replaceIntakeTabLayout(organizationId, dto);
}

/**
 * One-time idempotent backfill: mark `projectName` and `description` as required
 * on intake form layouts that pre-date the per-item Required toggle (rollout:
 * 2026-05-13). New/reset layouts already carry these defaults via
 * DEFAULT_INTAKE_TABS. The cutoff guard ensures admins who intentionally toggle
 * these fields back to optional after rollout aren't reverted on subsequent
 * server restarts — `replaceIntakeTabLayout` deletes and re-inserts items, so
 * any admin save bumps `created_at` past the cutoff.
 */
const INTAKE_REQUIRED_BACKFILL_CUTOFF = "2026-05-13 20:00:00";
export async function backfillIntakeRequiredFlags(): Promise<{ updated: number }> {
  const result = await db.execute(sql`
    UPDATE intake_tab_items
       SET is_required = true
     WHERE item_type = 'field'
       AND item_key IN ('projectName', 'description')
       AND is_required = false
       AND created_at < ${INTAKE_REQUIRED_BACKFILL_CUTOFF}::timestamp
  `);
  const updated = (result as any).rowCount ?? 0;
  return { updated };
}

/**
 * One-time idempotent backfill: the "Related Program" intake field used to be a
 * free-text column (`programName`). It's now a lookup against the org's
 * programs (`programId`). Rewrite legacy layout rows and any workflow-step
 * required-field arrays so the picker continues to work for existing orgs.
 */
export async function backfillIntakeProgramFieldKey(): Promise<{ layoutItems: number; workflowSteps: number; workflowConfigs: number }> {
  // 1) Layout items: programName -> programId (no-op if it would create a
  //    duplicate row in the same section).
  const layoutRes = await db.execute(sql`
    UPDATE intake_tab_items AS t
       SET item_key = 'programId'
     WHERE t.item_type = 'field'
       AND t.item_key = 'programName'
       AND NOT EXISTS (
         SELECT 1 FROM intake_tab_items AS o
          WHERE o.section_id = t.section_id
            AND o.item_type = 'field'
            AND o.item_key = 'programId'
       )
  `);
  // Delete any leftover programName rows where programId now coexists, so the
  // legacy text field doesn't render alongside the new lookup.
  await db.execute(sql`
    DELETE FROM intake_tab_items
     WHERE item_type = 'field'
       AND item_key = 'programName'
  `);

  // 2) intake_workflow_steps.required_fields is a text[] — swap entries.
  const stepsRes = await db.execute(sql`
    UPDATE intake_workflow_steps
       SET required_fields = array_replace(required_fields, 'programName', 'programId')
     WHERE 'programName' = ANY(required_fields)
  `);

  return {
    layoutItems: (layoutRes as any).rowCount ?? 0,
    workflowSteps: (stepsRes as any).rowCount ?? 0,
    workflowConfigs: 0,
  };
}

export async function resetIntakeTabLayoutToDefaults(organizationId: number): Promise<IntakeTabLayoutTabFull[]> {
  const dto: IntakeTabLayoutTabDTO[] = DEFAULT_INTAKE_TABS.map(t => ({
    key: t.key, label: t.label, icon: t.icon, isActive: true,
    sections: t.sections.map(s => ({
      title: s.title, description: s.description ?? null,
      items: s.items.map(i => ({ itemType: i.itemType, itemKey: i.itemKey, width: i.width, isRequired: !!i.isRequired })),
    })),
  }));
  return await replaceIntakeTabLayout(organizationId, dto);
}
