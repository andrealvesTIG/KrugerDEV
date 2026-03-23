import { db } from "../db";
import { calculateEndDate, formatDateStr } from "../lib/workingDays";
import {
  projectIntakes, mppImports, mppImportTasks, changeRequests,
  intakeWorkflowSteps, projects, tasks, taskDependencies,
  type ProjectIntake, type InsertProjectIntake, type UpdateProjectIntakeRequest,
  type MppImport, type InsertMppImport,
  type MppImportTask, type InsertMppImportTask,
  type ChangeRequest, type InsertChangeRequest, type UpdateChangeRequestRequest,
  type IntakeWorkflowStep, type InsertIntakeWorkflowStep,
  type Project, type Task,
} from "@shared/schema";
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import { getProject } from "./projectStorage";
import { getTasks, deleteAllTasksForProject } from "./taskStorage";

export async function getProjectIntakes(organizationId: number): Promise<ProjectIntake[]> {
  return await db.select().from(projectIntakes)
    .where(and(
      eq(projectIntakes.organizationId, organizationId),
      isNull(projectIntakes.deletedAt)
    ))
    .orderBy(desc(projectIntakes.createdAt));
}

export async function getProjectIntake(id: number): Promise<ProjectIntake | undefined> {
  const [intake] = await db.select().from(projectIntakes).where(eq(projectIntakes.id, id));
  return intake;
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

export async function updateProjectIntake(id: number, updates: UpdateProjectIntakeRequest): Promise<ProjectIntake> {
  const [updated] = await db.update(projectIntakes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projectIntakes.id, id))
    .returning();
  return updated;
}

export async function deleteProjectIntake(id: number): Promise<void> {
  await db.delete(projectIntakes).where(eq(projectIntakes.id, id));
}

export async function approveProjectIntake(id: number, approvedBy: string): Promise<Project> {
  const intake = await getProjectIntake(id);
  if (!intake) {
    throw new Error("Project intake not found");
  }

  const [newProject] = await db.insert(projects).values({
    organizationId: intake.organizationId,
    portfolioId: intake.portfolioId,
    name: intake.projectName,
    description: intake.description,
    budget: intake.estimatedBudget || "0",
    status: "Initiation",
    priority: "Medium",
    health: "Green",
  }).returning();

  await db.update(projectIntakes)
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
  return await db.insert(mppImportTasks).values(taskList).returning();
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
  }
): Promise<{ project: Project; taskCount: number }> {
  const mppImportRecord = await getMppImport(importId);
  if (!mppImportRecord) {
    throw new Error("Import not found");
  }

  const importedTasks = await getMppImportTasks(importId);
  
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
      budget: "0",
      completionPercentage: 0,
      source: "imported",
      sourceFileName: mppImportRecord.fileName,
      sourceFileUrl: mppImportRecord.fileUrl,
    }).returning();

    const taskIdMapping: Map<number, number> = new Map();
    
    for (let i = 0; i < importedTasks.length; i++) {
      const importedTask = importedTasks[i];
      const startDate = importedTask.startDate || today;
      const endDate = importedTask.finishDate || 
        (importedTask.durationDays 
          ? formatDateStr(calculateEndDate(new Date(startDate), importedTask.durationDays))
          : defaultEndDate);

      const isSummary = importedTask.isSummary || false;
      const isMilestone = importedTask.isMilestone || false;
      const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";
      const workHoursStr = importedTask.workHours ? importedTask.workHours.toString() : null;
      const actualWorkHoursStr = importedTask.actualWorkHours ? importedTask.actualWorkHours.toString() : null;
      const remainingWorkHoursStr = importedTask.remainingWorkHours ? importedTask.remainingWorkHours.toString() : null;

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
        estimatedHours: workHoursStr,
        actualHours: actualWorkHoursStr,
        remainingHours: remainingWorkHoursStr,
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

        const typeMap: Record<string, string> = {
          'FS': 'finish-to-start',
          'SS': 'start-to-start',
          'FF': 'finish-to-finish',
          'SF': 'start-to-finish',
        };

        try {
          await tx.insert(taskDependencies).values({
            taskId: newTaskId,
            dependsOnTaskId: depTaskId,
            dependencyType: typeMap[pred.type] || 'finish-to-start',
            lagDays: pred.lagDays || 0,
          });
        } catch (depError) {
          console.log(`Skipped duplicate dependency: task ${newTaskId} -> ${depTaskId}`);
        }
      }
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

    return { project: newProject, taskCount: importedTasks.length };
  });
}

export async function syncMppImportToProject(
  importId: number,
  projectId: number,
  options?: {
    syncMode?: 'merge' | 'replace';
  }
): Promise<{ project: Project; tasksAdded: number; tasksUpdated: number; tasksRemoved: number }> {
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
    const endDate = importedTask.finishDate || 
      (importedTask.durationDays 
        ? formatDateStr(calculateEndDate(new Date(startDate), importedTask.durationDays))
        : defaultEndDate);

    const isSummary = importedTask.isSummary || false;
    const isMilestone = importedTask.isMilestone || false;
    const taskType = isSummary ? "Summary" : isMilestone ? "Milestone" : "Work";
    const workHoursStr = importedTask.workHours ? importedTask.workHours.toString() : null;
    const actualWorkHoursStr = importedTask.actualWorkHours ? importedTask.actualWorkHours.toString() : null;
    const remainingWorkHoursStr = importedTask.remainingWorkHours ? importedTask.remainingWorkHours.toString() : null;

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
      estimatedHours: workHoursStr,
      actualHours: actualWorkHoursStr,
      remainingHours: remainingWorkHoursStr,
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

      const typeMap: Record<string, string> = {
        'FS': 'finish-to-start',
        'SS': 'start-to-start',
        'FF': 'finish-to-finish',
        'SF': 'start-to-finish',
      };

      try {
        await db.insert(taskDependencies).values({
          taskId: newTaskId,
          dependsOnTaskId: depTaskId,
          dependencyType: typeMap[pred.type] || 'finish-to-start',
          lagDays: pred.lagDays || 0,
        });
      } catch (depError) {
        console.log(`Skipped duplicate dependency: task ${newTaskId} -> ${depTaskId}`);
      }
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

  return { 
    project: updatedProject!, 
    tasksAdded, 
    tasksUpdated, 
    tasksRemoved 
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

export async function getIntakeWorkflowSteps(organizationId: number): Promise<IntakeWorkflowStep[]> {
  return await db.select().from(intakeWorkflowSteps)
    .where(eq(intakeWorkflowSteps.organizationId, organizationId))
    .orderBy(intakeWorkflowSteps.position);
}

export async function upsertIntakeWorkflowSteps(organizationId: number, steps: InsertIntakeWorkflowStep[]): Promise<IntakeWorkflowStep[]> {
  await db.delete(intakeWorkflowSteps).where(eq(intakeWorkflowSteps.organizationId, organizationId));
  
  if (steps.length === 0) {
    return [];
  }
  
  const stepsWithOrg = steps.map(step => ({
    ...step,
    organizationId,
  }));
  
  const inserted = await db.insert(intakeWorkflowSteps).values(stepsWithOrg).returning();
  return inserted;
}

export async function resetIntakeWorkflowToDefaults(organizationId: number): Promise<IntakeWorkflowStep[]> {
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
    },
  ];
  
  return upsertIntakeWorkflowSteps(organizationId, defaultSteps);
}
