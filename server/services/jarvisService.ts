import { db } from "../db";
import { projects, portfolios, issues, tasks, taskDependencies, resources, statusReportHistory, healthStatusHistory, organizationMembers, taskResourceAssignments } from "@shared/schema";
import { eq, and, sql, inArray, isNull, desc } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are Friday Agent, an AI portfolio and project management agent embedded in this application. Your name is "Friday Agent" or simply "Friday" — never refer to yourself as "JARVIS" or any other name. You help users understand project health, risks, issues, mitigations, tasks, dependencies, and priorities using real application data. You do not invent facts. You clearly separate observations, risks, and recommendations. You speak in natural, professional language. When suggesting updates or actions, you require confirmation before any write operation.

Guidelines:
- When referencing projects, use their names and codes.
- If data is missing or insufficient, say so explicitly.
- When asked about trends, base them only on available historical data.
- For write actions (create task, create mitigation, assign owner, add note, flag for review), describe exactly what you would do and ask the user to confirm with "Yes, proceed" before executing.
- Never fabricate data points, percentages, or metrics not present in the provided context.
- Format dates in a human-readable way.
- Use markdown formatting for readability.
- IMPORTANT: When mentioning specific projects, tasks, issues, risks, milestones, portfolios, or resources, ALWAYS make them clickable by using markdown links with the app's internal routes. Use the object's ID from the data context. Format examples:
  - Projects: [Project Name](/projects/{projectId})
  - Portfolios: [Portfolio Name](/portfolios/{portfolioId})
  - Tasks/Milestones: reference them with their project link [Task Name](/projects/{projectId}) since tasks are viewed within projects
  - Issues/Risks: reference them with their project link [Issue Title](/projects/{projectId}) since issues/risks are viewed within projects
  - Resources: [Resource Name](/resources/{resourceId})
  - For list items, make the name/title the link, e.g.: "- [Website Redesign](/projects/42) — Health: Red, 3 overdue tasks"
  - Always prefer linking the entity name rather than adding a separate "View" link.`;

export interface JarvisContext {
  projects: any[];
  portfolios: any[];
  risks: any[];
  issues: any[];
  tasks: any[];
  milestones: any[];
  dependencies: any[];
  resources: any[];
  statusReports: any[];
  healthHistory: any[];
}

export async function gatherOrganizationContext(orgId: number): Promise<JarvisContext> {
  const [orgProjects, orgPortfolios, orgResources] = await Promise.all([
    db.select().from(projects).where(
      and(eq(projects.organizationId, orgId), isNull(projects.deletedAt))
    ),
    db.select().from(portfolios).where(
      and(eq(portfolios.organizationId, orgId), isNull(portfolios.deletedAt))
    ),
    db.select({
      id: resources.id,
      displayName: resources.displayName,
      resourceType: resources.resourceType,
      title: resources.title,
      department: resources.department,
    }).from(resources).where(
      and(eq(resources.organizationId, orgId), isNull(resources.deletedAt))
    ),
  ]);

  const projectIds = orgProjects.map(p => p.id);
  if (projectIds.length === 0) {
    return {
      projects: [],
      portfolios: orgPortfolios.map(summarizePortfolio),
      risks: [],
      issues: [],
      tasks: [],
      milestones: [],
      dependencies: [],
      resources: orgResources,
      statusReports: [],
      healthHistory: [],
    };
  }

  const MAX_ISSUES = 200;
  const MAX_TASKS = 300;
  const MAX_DEPS = 100;

  const [allIssues, allTasks, allDeps, recentReports, recentHealth] = await Promise.all([
    db.select({
      id: issues.id,
      projectId: issues.projectId,
      itemType: issues.itemType,
      issueNumber: issues.issueNumber,
      title: issues.title,
      description: issues.description,
      category: issues.category,
      priority: issues.priority,
      severity: issues.severity,
      status: issues.status,
      assignee: issues.assignee,
      targetResolutionDate: issues.targetResolutionDate,
      actualResolutionDate: issues.actualResolutionDate,
      probability: issues.probability,
      impact: issues.impact,
      riskScore: issues.riskScore,
      responseStrategy: issues.responseStrategy,
      mitigationPlan: issues.mitigationPlan,
      contingencyPlan: issues.contingencyPlan,
      escalatedToPortfolio: issues.escalatedToPortfolio,
      dueDate: issues.dueDate,
      proximity: issues.proximity,
    }).from(issues).where(
      and(inArray(issues.projectId, projectIds), isNull(issues.deletedAt))
    ).limit(MAX_ISSUES),
    db.select({
      id: tasks.id,
      projectId: tasks.projectId,
      name: tasks.name,
      status: tasks.status,
      priority: tasks.priority,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      progress: tasks.progress,
      assignee: tasks.assignee,
      isMilestone: tasks.isMilestone,
      isCritical: tasks.isCritical,
      milestoneType: tasks.milestoneType,
      deliverables: tasks.deliverables,
    }).from(tasks).where(
      and(inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt))
    ).limit(MAX_TASKS),
    db.select().from(taskDependencies).where(
      inArray(taskDependencies.taskId, sql`(SELECT id FROM tasks WHERE project_id IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)}) AND deleted_at IS NULL)`)
    ).limit(MAX_DEPS).catch(() => []),
    db.select({
      id: statusReportHistory.id,
      projectId: statusReportHistory.projectId,
      reportDate: statusReportHistory.reportDate,
      executiveSummary: statusReportHistory.executiveSummary,
      projectHealth: statusReportHistory.projectHealth,
      completionPercentage: statusReportHistory.completionPercentage,
      openRisksCount: statusReportHistory.openRisksCount,
      openIssuesCount: statusReportHistory.openIssuesCount,
    }).from(statusReportHistory).where(
      inArray(statusReportHistory.projectId, projectIds)
    ).orderBy(desc(statusReportHistory.createdAt)).limit(50),
    db.select().from(healthStatusHistory).where(
      inArray(healthStatusHistory.projectId, projectIds)
    ).orderBy(desc(healthStatusHistory.createdAt)).limit(30),
  ]);

  const risksData = allIssues.filter(i => i.itemType === "risk");
  const issuesData = allIssues.filter(i => i.itemType === "issue");
  const tasksData = allTasks.filter(t => !t.isMilestone);
  const milestonesData = allTasks.filter(t => t.isMilestone);

  return {
    projects: orgProjects.map(summarizeProject),
    portfolios: orgPortfolios.map(summarizePortfolio),
    risks: risksData,
    issues: issuesData,
    tasks: tasksData,
    milestones: milestonesData,
    dependencies: allDeps,
    resources: orgResources,
    statusReports: recentReports,
    healthHistory: recentHealth,
  };
}

function summarizeProject(p: any) {
  return {
    id: p.id,
    name: p.name,
    projectCode: p.projectCode,
    status: p.status,
    priority: p.priority,
    health: p.health,
    healthReason: p.healthReason,
    completionPercentage: p.completionPercentage,
    startDate: p.startDate,
    endDate: p.endDate,
    budget: p.budget,
    actualCost: p.actualCost,
    forecastCost: p.forecastCost,
    portfolioId: p.portfolioId,
    managerId: p.managerId,
    businessSponsorId: p.businessSponsorId,
    riskLevel: p.riskLevel,
    department: p.department,
    category: p.category,
    scheduleVariance: p.scheduleVariance,
    costVariance: p.costVariance,
    billableStatus: p.billableStatus,
  };
}

function summarizePortfolio(p: any) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    healthScore: p.healthScore,
    budgetAllocated: p.budgetAllocated,
    budgetSpent: p.budgetSpent,
    riskTolerance: p.riskTolerance,
    department: p.department,
    strategicObjective: p.strategicObjective,
    targetStartDate: p.targetStartDate,
    targetEndDate: p.targetEndDate,
  };
}

function buildDataContext(ctx: JarvisContext): string {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const projectCount = ctx.projects.length;
  const atRisk = ctx.projects.filter(p => p.health === "Red");
  const amber = ctx.projects.filter(p => p.health === "Yellow");
  const openRisks = ctx.risks.filter(r => !["Closed", "Mitigated"].includes(r.status));
  const openIssues = ctx.issues.filter(i => !["Resolved", "Closed"].includes(i.status));
  const overdueTasks = ctx.tasks.filter(t =>
    t.endDate && new Date(t.endDate) < now && t.status !== "Completed" && t.status !== "Cancelled"
  );
  const upcomingMilestones = ctx.milestones.filter(m => {
    if (!m.endDate) return false;
    const d = new Date(m.endDate);
    return d >= now && d <= new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) && m.status !== "Completed";
  });
  const risksWithoutMitigation = openRisks.filter(r => !r.mitigationPlan && !r.responseStrategy);
  const projectsWithoutManager = ctx.projects.filter(p => !p.managerId);

  let summary = `## Current Data Snapshot (as of ${todayStr})\n\n`;
  summary += `**Organization Overview:** ${projectCount} projects, ${ctx.portfolios.length} portfolios, ${ctx.resources.length} resources\n`;
  summary += `**Health:** ${atRisk.length} Red, ${amber.length} Yellow, ${projectCount - atRisk.length - amber.length} Green\n`;
  summary += `**Open Risks:** ${openRisks.length} | **Open Issues:** ${openIssues.length}\n`;
  summary += `**Overdue Tasks:** ${overdueTasks.length} | **Upcoming Milestones (14d):** ${upcomingMilestones.length}\n`;
  summary += `**Risks without mitigation plan:** ${risksWithoutMitigation.length}\n`;
  summary += `**Projects without manager:** ${projectsWithoutManager.length}\n\n`;

  summary += `### Projects\n${JSON.stringify(ctx.projects, null, 1)}\n\n`;

  if (ctx.portfolios.length > 0) {
    summary += `### Portfolios\n${JSON.stringify(ctx.portfolios, null, 1)}\n\n`;
  }

  if (openRisks.length > 0) {
    summary += `### Open Risks (${openRisks.length})\n${JSON.stringify(openRisks, null, 1)}\n\n`;
  }

  if (openIssues.length > 0) {
    summary += `### Open Issues (${openIssues.length})\n${JSON.stringify(openIssues, null, 1)}\n\n`;
  }

  if (overdueTasks.length > 0) {
    summary += `### Overdue Tasks (${overdueTasks.length})\n${JSON.stringify(overdueTasks, null, 1)}\n\n`;
  }

  const activeTasks = ctx.tasks.filter(t => t.status === "In Progress").slice(0, 30);
  if (activeTasks.length > 0) {
    summary += `### In-Progress Tasks (${activeTasks.length})\n${JSON.stringify(activeTasks, null, 1)}\n\n`;
  }

  if (upcomingMilestones.length > 0) {
    summary += `### Upcoming Milestones\n${JSON.stringify(upcomingMilestones, null, 1)}\n\n`;
  }

  if (ctx.dependencies.length > 0) {
    summary += `### Task Dependencies (${ctx.dependencies.length})\n${JSON.stringify(ctx.dependencies.slice(0, 30), null, 1)}\n\n`;
  }

  if (ctx.statusReports.length > 0) {
    summary += `### Recent Status Reports\n${JSON.stringify(ctx.statusReports.slice(0, 10), null, 1)}\n\n`;
  }

  if (ctx.healthHistory.length > 0) {
    summary += `### Recent Health Changes\n${JSON.stringify(ctx.healthHistory.slice(0, 10), null, 1)}\n\n`;
  }

  return summary;
}

export interface JarvisMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const jarvisTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task in a project. Call this ONLY after the user has explicitly confirmed (e.g. said 'yes', 'proceed', 'do it', 'go ahead').",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID to create the task in" },
          name: { type: "string", description: "The task name" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], description: "Task priority" },
          description: { type: "string", description: "Optional task description" },
          assignee: { type: "string", description: "Optional assignee name" },
        },
        required: ["projectId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_risk",
      description: "Create a new risk/mitigation entry in a project. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          title: { type: "string", description: "The risk title" },
          description: { type: "string", description: "Risk description" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          probability: { type: "string", enum: ["Very Low", "Low", "Medium", "High", "Very High"] },
          impact: { type: "string", enum: ["Very Low", "Low", "Medium", "High", "Very High"] },
          responseStrategy: { type: "string", enum: ["Avoid", "Transfer", "Mitigate", "Accept"] },
          mitigationPlan: { type: "string", description: "The mitigation plan" },
        },
        required: ["projectId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_issue",
      description: "Create a new issue in a project. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          title: { type: "string", description: "The issue title" },
          description: { type: "string", description: "Issue description" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
        },
        required: ["projectId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project_note",
      description: "Add or update notes on a project. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          note: { type: "string", description: "The note content" },
        },
        required: ["projectId", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flag_project_for_review",
      description: "Flag a project for review by setting its health to Red. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID" },
          reason: { type: "string", description: "The reason for flagging" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task's metadata. You can change status, priority, assignee, dates, progress, description, and other fields. Call this ONLY after the user has explicitly confirmed. Use the task ID from the data context.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "number", description: "The task ID to update" },
          projectId: { type: "number", description: "The project ID the task belongs to" },
          name: { type: "string", description: "New task name" },
          description: { type: "string", description: "New task description" },
          status: { type: "string", enum: ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"], description: "New task status" },
          priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], description: "New task priority" },
          assignee: { type: "string", description: "New assignee name (text field)" },
          progress: { type: "number", description: "Progress percentage (0-100)" },
          startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
          endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
          isMilestone: { type: "boolean", description: "Whether this is a milestone" },
          isCritical: { type: "boolean", description: "Whether this is on the critical path" },
        },
        required: ["taskId", "projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_resources_to_task",
      description: "Assign one or more resources (people) to a task. This replaces all current resource assignments on the task. Use the resource IDs from the data context. Call this ONLY after the user has explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "number", description: "The task ID to assign resources to" },
          projectId: { type: "number", description: "The project ID the task belongs to" },
          resourceIds: {
            type: "array",
            items: { type: "number" },
            description: "Array of resource IDs to assign to the task. Pass an empty array to remove all assignments.",
          },
          allocations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                resourceId: { type: "number" },
                allocationPercentage: { type: "number", description: "Allocation percentage (0-100), default 100" },
              },
              required: ["resourceId"],
            },
            description: "Optional allocation percentages per resource. If not provided, defaults to 100% for each.",
          },
        },
        required: ["taskId", "projectId", "resourceIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_create_tasks",
      description: "Create multiple tasks in a project at once from structured data (e.g. parsed from a CSV file). Call this ONLY after presenting the parsed data to the user and receiving explicit confirmation. Each task object should have at minimum a name.",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "number", description: "The project ID to create all tasks in" },
          tasks: {
            type: "array",
            description: "Array of task objects to create",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "The task name (required)" },
                description: { type: "string", description: "Task description" },
                priority: { type: "string", enum: ["Low", "Medium", "High", "Critical"], description: "Task priority" },
                status: { type: "string", enum: ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"], description: "Task status" },
                assignee: { type: "string", description: "Assignee name" },
                startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
                endDate: { type: "string", description: "End date / due date in YYYY-MM-DD format" },
                isMilestone: { type: "boolean", description: "Whether this is a milestone" },
              },
              required: ["name"],
            },
          },
        },
        required: ["projectId", "tasks"],
      },
    },
  },
];

async function handleToolCall(
  orgId: number,
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  const projectId = args.projectId;
  if (!projectId || typeof projectId !== "number") {
    return JSON.stringify({ success: false, message: "Valid projectId is required." });
  }
  const projectInOrg = await verifyProjectBelongsToOrg(projectId, orgId);
  if (!projectInOrg) {
    return JSON.stringify({ success: false, message: "Project not found in this organization." });
  }

  switch (toolName) {
    case "create_task": {
      const result = await executeJarvisAction(orgId, "", {
        type: "create_task",
        projectId,
        data: { name: args.name, priority: args.priority, description: args.description, assignee: args.assignee },
      });
      return JSON.stringify(result);
    }
    case "create_risk": {
      const result = await executeJarvisAction(orgId, "", {
        type: "create_mitigation",
        projectId,
        data: {
          title: args.title, description: args.description, priority: args.priority,
          probability: args.probability, impact: args.impact,
          responseStrategy: args.responseStrategy, mitigationPlan: args.mitigationPlan,
        },
      });
      return JSON.stringify(result);
    }
    case "create_issue": {
      const [newIssue] = await db.insert(issues).values({
        projectId,
        itemType: "issue",
        title: (args.title || "Untitled Issue").slice(0, 500),
        description: args.description?.slice(0, 5000) || null,
        priority: ["Low", "Medium", "High", "Critical"].includes(args.priority) ? args.priority : "Medium",
        severity: ["Low", "Medium", "High", "Critical"].includes(args.severity) ? args.severity : "Medium",
        status: "Open",
      }).returning();
      return JSON.stringify({ success: true, message: `Issue "${newIssue.title}" created successfully.`, entityId: newIssue.id });
    }
    case "add_project_note": {
      const result = await executeJarvisAction(orgId, "", {
        type: "add_note",
        projectId,
        data: { note: args.note },
      });
      return JSON.stringify(result);
    }
    case "flag_project_for_review": {
      const result = await executeJarvisAction(orgId, "", {
        type: "flag_for_review",
        projectId,
        data: { reason: args.reason },
      });
      return JSON.stringify(result);
    }
    case "update_task": {
      const taskId = args.taskId;
      if (!taskId || typeof taskId !== "number") {
        return JSON.stringify({ success: false, message: "Valid taskId is required." });
      }

      const [existingTask] = await db.select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
      if (!existingTask) {
        return JSON.stringify({ success: false, message: "Task not found in this project." });
      }

      const validStatuses = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
      const validPriorities = ["Low", "Medium", "High", "Critical"];

      function parseDateField(val: unknown): string | null | undefined {
        if (val === undefined) return undefined;
        if (typeof val !== "string") return undefined;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return undefined;
        const d = new Date(val + "T00:00:00Z");
        if (isNaN(d.getTime())) return undefined;
        return val;
      }

      const updates: Record<string, any> = {};
      if (typeof args.name === "string" && args.name.trim()) updates.name = args.name.trim().slice(0, 500);
      if (typeof args.description === "string") updates.description = args.description.slice(0, 5000);
      if (typeof args.priority === "string" && validPriorities.includes(args.priority)) updates.priority = args.priority;
      if (typeof args.assignee === "string") updates.assignee = args.assignee.slice(0, 200);

      if (typeof args.progress === "number" && args.progress >= 0 && args.progress <= 100) {
        updates.progress = Math.round(args.progress);
      }
      if (typeof args.status === "string" && validStatuses.includes(args.status)) {
        updates.status = args.status;
      }

      if (updates.status === "Completed") updates.progress = 100;
      else if (updates.status === "Not Started") updates.progress = 0;
      else if (updates.progress === 100 && !updates.status) updates.status = "Completed";
      else if (updates.progress === 0 && !updates.status) updates.status = "Not Started";
      else if (typeof updates.progress === "number" && updates.progress > 0 && !updates.status) updates.status = "In Progress";

      const parsedStart = parseDateField(args.startDate);
      const parsedEnd = parseDateField(args.endDate);
      if (parsedStart !== undefined) updates.startDate = parsedStart;
      if (parsedEnd !== undefined) updates.endDate = parsedEnd;
      if (parsedStart && parsedEnd && new Date(parsedStart) > new Date(parsedEnd)) {
        return JSON.stringify({ success: false, message: "Start date cannot be after end date." });
      }

      if (typeof args.isMilestone === "boolean") updates.isMilestone = args.isMilestone;
      if (typeof args.isCritical === "boolean") updates.isCritical = args.isCritical;

      if (Object.keys(updates).length === 0) {
        return JSON.stringify({ success: false, message: "No valid fields to update." });
      }

      updates.updatedAt = new Date();
      await db.update(tasks).set(updates).where(eq(tasks.id, taskId));

      const changedFields = Object.keys(updates).filter(k => k !== "updatedAt").join(", ");
      return JSON.stringify({ success: true, message: `Task updated successfully. Changed: ${changedFields}.`, taskId });
    }
    case "assign_resources_to_task": {
      const taskId = args.taskId;
      if (!taskId || typeof taskId !== "number") {
        return JSON.stringify({ success: false, message: "Valid taskId is required." });
      }

      const [existingTask] = await db.select({ id: tasks.id, projectId: tasks.projectId })
        .from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
      if (!existingTask) {
        return JSON.stringify({ success: false, message: "Task not found in this project." });
      }

      const rawResourceIds = args.resourceIds;
      if (!Array.isArray(rawResourceIds)) {
        return JSON.stringify({ success: false, message: "resourceIds must be an array." });
      }
      const resourceIds = [...new Set(rawResourceIds.filter((id: any) => typeof id === "number" && Number.isFinite(id)))];
      if (resourceIds.length > 20) {
        return JSON.stringify({ success: false, message: "Maximum 20 resources can be assigned to a single task." });
      }

      if (resourceIds.length > 0) {
        const validResources = await db.select({ id: resources.id, displayName: resources.displayName })
          .from(resources)
          .where(and(
            inArray(resources.id, resourceIds),
            eq(resources.organizationId, orgId),
            isNull(resources.deletedAt)
          ));
        const validIds = new Set(validResources.map(r => r.id));
        const invalidIds = resourceIds.filter((id: number) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return JSON.stringify({ success: false, message: `Invalid resource IDs: ${invalidIds.join(", ")}. Resources must exist in this organization.` });
        }

        await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, taskId));

        const rawAllocations = Array.isArray(args.allocations) ? args.allocations : [];
        const assignmentData = resourceIds.map((resId: number) => {
          const alloc = rawAllocations.find((a: any) => typeof a === "object" && a && a.resourceId === resId);
          const pct = typeof alloc?.allocationPercentage === "number" && Number.isFinite(alloc.allocationPercentage)
            ? Math.min(100, Math.max(0, Math.round(alloc.allocationPercentage)))
            : 100;
          return { taskId, resourceId: resId, allocationPercentage: pct };
        });

        await db.insert(taskResourceAssignments).values(assignmentData);

        const names = validResources.filter(r => resourceIds.includes(r.id)).map(r => r.displayName).join(", ");
        return JSON.stringify({ success: true, message: `Assigned ${resourceIds.length} resource(s) to the task: ${names}.`, taskId, resourceIds });
      } else {
        await db.delete(taskResourceAssignments).where(eq(taskResourceAssignments.taskId, taskId));
        return JSON.stringify({ success: true, message: "All resource assignments removed from the task.", taskId });
      }
    }
    case "bulk_create_tasks": {
      const taskList = args.tasks;
      if (!Array.isArray(taskList) || taskList.length === 0) {
        return JSON.stringify({ success: false, message: "No tasks provided." });
      }
      if (taskList.length > 200) {
        return JSON.stringify({ success: false, message: "Maximum 200 tasks can be created at once." });
      }

      const validStatuses = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
      const validPriorities = ["Low", "Medium", "High", "Critical"];

      function parseDate(val: unknown): string | null {
        if (typeof val !== "string") return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;
        const d = new Date(val + "T00:00:00Z");
        if (isNaN(d.getTime())) return null;
        return val;
      }

      const skipped: string[] = [];
      const taskValues = taskList
        .filter((t: any, idx: number) => {
          if (!t.name || typeof t.name !== "string" || !t.name.trim()) {
            skipped.push(`Row ${idx + 1}: missing or invalid task name`);
            return false;
          }
          return true;
        })
        .map((t: any) => ({
          projectId,
          name: String(t.name).trim().slice(0, 500),
          description: typeof t.description === "string" ? t.description.slice(0, 5000) : null,
          status: typeof t.status === "string" && validStatuses.includes(t.status) ? t.status : "Not Started",
          priority: typeof t.priority === "string" && validPriorities.includes(t.priority) ? t.priority : "Medium",
          assignee: typeof t.assignee === "string" ? t.assignee.slice(0, 200) : null,
          startDate: parseDate(t.startDate),
          endDate: parseDate(t.endDate),
          isMilestone: t.isMilestone === true,
          organizationId: orgId,
        }));

      if (taskValues.length === 0) {
        return JSON.stringify({ success: false, message: "No valid tasks found — each task needs at least a name." });
      }

      const created = await db.insert(tasks).values(taskValues).returning({ id: tasks.id, name: tasks.name });
      const result: Record<string, any> = {
        success: true,
        message: `Successfully created ${created.length} task(s) in the project.`,
        taskCount: created.length,
        tasks: created.slice(0, 20).map(t => ({ id: t.id, name: t.name })),
      };
      if (skipped.length > 0) {
        result.message += ` ${skipped.length} row(s) were skipped.`;
        result.skipped = skipped.slice(0, 10);
      }
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ success: false, message: "Unknown tool." });
  }
}

export interface PageContext {
  path: string;
  entityType: "project" | "portfolio" | "resource" | null;
  entityId: number | null;
}

export interface FileAttachment {
  name: string;
  type: string;
  size: number;
  content: string;
}

function buildPageContextDirective(pageContext: PageContext | undefined, ctx: JarvisContext): string {
  if (!pageContext?.entityType || !pageContext.entityId) return "";

  if (pageContext.entityType === "project") {
    const project = ctx.projects.find((p: any) => p.id === pageContext.entityId);
    if (!project) return "";

    const projectTasks = ctx.tasks.filter((t: any) => t.projectId === pageContext.entityId);
    const projectMilestones = ctx.milestones.filter((m: any) => m.projectId === pageContext.entityId);
    const projectRisks = ctx.risks.filter((r: any) => r.projectId === pageContext.entityId);
    const projectIssues = ctx.issues.filter((i: any) => i.projectId === pageContext.entityId);
    const projectReports = ctx.statusReports.filter((r: any) => r.projectId === pageContext.entityId);

    return `\n\nCURRENT PAGE CONTEXT: The user is currently viewing project [${project.name}](/projects/${project.id}) (ID: ${project.id}).
Prioritize answering questions about THIS project. When the user says "this project" or asks about tasks, risks, issues without specifying a project, assume they mean this one.

**Focused Project Detail:**
- Project: ${JSON.stringify(project, null, 1)}
- Tasks (${projectTasks.length}): ${JSON.stringify(projectTasks.slice(0, 50), null, 1)}
- Milestones (${projectMilestones.length}): ${JSON.stringify(projectMilestones.slice(0, 20), null, 1)}
- Risks (${projectRisks.length}): ${JSON.stringify(projectRisks, null, 1)}
- Issues (${projectIssues.length}): ${JSON.stringify(projectIssues, null, 1)}
- Recent Status Reports: ${JSON.stringify(projectReports.slice(0, 5), null, 1)}
`;
  }

  if (pageContext.entityType === "portfolio") {
    const portfolio = ctx.portfolios.find((p: any) => p.id === pageContext.entityId);
    if (!portfolio) return "";

    const portfolioProjects = ctx.projects.filter((p: any) => p.portfolioId === pageContext.entityId);
    return `\n\nCURRENT PAGE CONTEXT: The user is currently viewing portfolio [${portfolio.name}](/portfolios/${portfolio.id}) (ID: ${portfolio.id}).
Prioritize answering questions about THIS portfolio and its projects. When the user says "this portfolio" or asks general questions, assume they mean this one.

**Focused Portfolio Detail:**
- Portfolio: ${JSON.stringify(portfolio, null, 1)}
- Projects in Portfolio (${portfolioProjects.length}): ${JSON.stringify(portfolioProjects, null, 1)}
`;
  }

  if (pageContext.entityType === "resource") {
    const resource = ctx.resources.find((r: any) => r.id === pageContext.entityId);
    if (!resource) return "";

    return `\n\nCURRENT PAGE CONTEXT: The user is currently viewing resource [${resource.displayName}](/resources/${resource.id}) (ID: ${resource.id}).
Prioritize answering questions about THIS resource. When the user says "this person" or "this resource", assume they mean this one.

**Focused Resource Detail:**
- Resource: ${JSON.stringify(resource, null, 1)}
`;
  }

  return "";
}

function buildAttachmentContext(attachments?: FileAttachment[]): string {
  if (!attachments || attachments.length === 0) return "";

  let ctx = `\n\nATTACHED FILES: The user has attached ${attachments.length} file(s) to this message. Analyze their contents and incorporate them into your response.\n`;

  for (const att of attachments) {
    const isTextBased = att.type.startsWith("text/") ||
      att.type === "application/json" ||
      att.type === "application/xml" ||
      att.type === "text/csv" ||
      att.type === "application/csv" ||
      att.name.match(/\.(txt|csv|json|xml|md|log|yaml|yml|ini|conf|cfg|tsv|html|htm|sql|js|ts|py|rb|go|java|c|cpp|h|css|scss|less)$/i);

    if (isTextBased) {
      let decoded: string;
      try {
        decoded = Buffer.from(att.content, "base64").toString("utf-8");
      } catch {
        decoded = att.content;
      }
      const truncated = decoded.length > 50000 ? decoded.slice(0, 50000) + "\n...(truncated)" : decoded;
      ctx += `\n### File: ${att.name} (${att.type}, ${(att.size / 1024).toFixed(1)} KB)\n\`\`\`\n${truncated}\n\`\`\`\n`;
    } else {
      ctx += `\n### File: ${att.name} (${att.type}, ${(att.size / 1024).toFixed(1)} KB)\n[Binary file — contents cannot be displayed as text]\n`;
    }
  }

  return ctx;
}

export async function streamJarvisResponse(
  orgId: number,
  messages: JarvisMessage[],
  concise: boolean,
  onChunk: (content: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (error: Error) => void,
  pageContext?: PageContext,
  attachments?: FileAttachment[],
) {
  try {
    const context = await gatherOrganizationContext(orgId);
    const dataContext = buildDataContext(context);
    const pageDirective = buildPageContextDirective(pageContext, context);
    const attachmentContext = buildAttachmentContext(attachments);

    const conciseDirective = concise
      ? `\n\nIMPORTANT — Concise mode is ON. Keep every reply SHORT: max 3-5 bullet points or 2-3 short sentences. No lengthy explanations. Omit sections that have nothing notable. If the user needs more detail, they will ask.`
      : `\n\nDetailed mode is ON. Provide thorough, structured responses. Use sections (Observations, Risks/Concerns, Recommendations) when helpful. Include relevant data points and context. Use bullet points for clarity.`;

    const actionDirective = `\n\nACTION EXECUTION RULES:
- When the user asks you to create a task, risk, issue, note, or flag a project, first describe what you will do and ask for confirmation.
- When the user confirms (says "yes", "proceed", "do it", "go ahead", "ok", "sure", "confirm", etc.), you MUST call the appropriate tool function to actually execute the action. Do NOT just say you did it — you must use the tool.
- After the tool executes, report the result to the user based on the tool response.
- The project IDs are available in the data context above. Match project names to their IDs.

TASK UPDATE & RESOURCE ASSIGNMENT RULES:
- When the user asks to update a task (change status, priority, assignee, dates, progress, etc.), identify the task by name or ID from the data context, describe the change, and ask for confirmation before calling update_task.
- When the user asks to assign resources/people to a task, match the resource name to the resource ID from the data context. Use assign_resources_to_task to set assignments. This replaces all current assignments — include all desired resources, not just new ones.
- When asked to assign resources during bulk task import (e.g. from CSV with an "Assignee" column), first create the tasks, then use assign_resources_to_task for each task that has a matching resource in the organization. Also set the assignee text field via update_task or during creation.
- The resources list with IDs and names is available in the data context. Always match resource names case-insensitively and report if a name doesn't match any known resource.

CSV FILE IMPORT RULES:
- When a CSV file is attached, parse its content to identify task data. Look for columns like: name/title/task, description, priority, status, assignee, start date, end date, due date.
- Be flexible with column names — map variations like "Task Name", "Title", "Activity" → name; "Owner", "Assigned To" → assignee; "Due Date", "End", "Deadline" → endDate; "Start", "Begin" → startDate.
- Present a summary table of the parsed tasks to the user showing what will be created (task name, priority, assignee, dates, etc.).
- Ask for confirmation before executing. If the user is on a project page, use that project. Otherwise ask which project to import into.
- Use the bulk_create_tasks tool to create all tasks at once — do NOT call create_task repeatedly.
- After creation, report how many tasks were created successfully.`;

    const systemMessage = `${SYSTEM_PROMPT}${pageDirective}${conciseDirective}${actionDirective}${attachmentContext}\n\n---\n\n${dataContext}`;

    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemMessage },
      ...messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    let fullResponse = "";
    const MAX_TOOL_ROUNDS = 5;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: apiMessages,
        stream: true,
        max_completion_tokens: concise ? 2048 : 4096,
        temperature: 0.3,
        tools: jarvisTools,
      });

      let currentToolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let hasToolCalls = false;
      let finishReason = "";

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const content = choice.delta?.content || "";
        if (content) {
          fullResponse += content;
          onChunk(content);
        }

        if (choice.delta?.tool_calls) {
          hasToolCalls = true;
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index;
            if (!currentToolCalls.has(idx)) {
              currentToolCalls.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: "" });
            }
            const existing = currentToolCalls.get(idx)!;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          }
        }
      }

      if (!hasToolCalls || finishReason !== "tool_calls") {
        break;
      }

      apiMessages.push({
        role: "assistant",
        content: fullResponse || null,
        tool_calls: Array.from(currentToolCalls.values()).map(tc => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      for (const [, tc] of currentToolCalls) {
        try {
          const args = JSON.parse(tc.arguments);
          const result = await handleToolCall(orgId, tc.name, args);
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        } catch (err: any) {
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ success: false, message: err.message || "Tool execution failed." }),
          });
        }
      }

      fullResponse = "";
    }

    onDone(fullResponse);
  } catch (err: any) {
    onError(err);
  }
}

async function verifyProjectBelongsToOrg(projectId: number, orgId: number): Promise<boolean> {
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));
  return !!project;
}

export async function executeJarvisAction(
  orgId: number,
  userId: string,
  action: {
    type: "create_task" | "create_mitigation" | "assign_owner" | "add_note" | "flag_for_review";
    projectId: number;
    data: Record<string, any>;
  }
): Promise<{ success: boolean; message: string; entityId?: number }> {
  const validTypes = ["create_task", "create_mitigation", "assign_owner", "add_note", "flag_for_review"];
  if (!validTypes.includes(action.type)) {
    return { success: false, message: "Unknown action type." };
  }

  if (!action.projectId || typeof action.projectId !== "number") {
    return { success: false, message: "Valid projectId is required." };
  }

  const projectInOrg = await verifyProjectBelongsToOrg(action.projectId, orgId);
  if (!projectInOrg) {
    return { success: false, message: "Project not found in this organization." };
  }

  switch (action.type) {
    case "create_task": {
      if (!action.data.name || typeof action.data.name !== "string") {
        return { success: false, message: "Task name is required." };
      }
      const [newTask] = await db.insert(tasks).values({
        projectId: action.projectId,
        name: action.data.name.slice(0, 500),
        description: action.data.description?.slice(0, 5000) || null,
        status: "Not Started",
        priority: ["Low", "Medium", "High", "Critical"].includes(action.data.priority) ? action.data.priority : "Medium",
        startDate: action.data.startDate || null,
        endDate: action.data.endDate || null,
        assignee: action.data.assignee?.slice(0, 200) || null,
        organizationId: orgId,
      }).returning();
      return { success: true, message: `Task "${newTask.name}" created successfully.`, entityId: newTask.id };
    }

    case "create_mitigation": {
      if (!action.data.title || typeof action.data.title !== "string") {
        return { success: false, message: "Risk/mitigation title is required." };
      }
      const [newRisk] = await db.insert(issues).values({
        projectId: action.projectId,
        itemType: "risk",
        title: action.data.title.slice(0, 500),
        description: action.data.description?.slice(0, 5000) || null,
        priority: ["Low", "Medium", "High", "Critical"].includes(action.data.priority) ? action.data.priority : "Medium",
        status: "Identified",
        responseStrategy: ["Avoid", "Transfer", "Mitigate", "Accept"].includes(action.data.responseStrategy) ? action.data.responseStrategy : "Mitigate",
        mitigationPlan: action.data.mitigationPlan?.slice(0, 5000) || null,
        probability: ["Very Low", "Low", "Medium", "High", "Very High"].includes(action.data.probability) ? action.data.probability : "Medium",
        impact: ["Very Low", "Low", "Medium", "High", "Very High"].includes(action.data.impact) ? action.data.impact : "Medium",
      }).returning();
      return { success: true, message: `Risk/mitigation "${newRisk.title}" created successfully.`, entityId: newRisk.id };
    }

    case "add_note": {
      if (!action.data.note || typeof action.data.note !== "string") {
        return { success: false, message: "Note content is required." };
      }
      await db.update(projects).set({
        notes: action.data.note.slice(0, 10000),
        updatedAt: new Date(),
      }).where(and(eq(projects.id, action.projectId), eq(projects.organizationId, orgId)));
      return { success: true, message: `Note added to project.` };
    }

    case "flag_for_review": {
      await db.update(projects).set({
        health: "Red",
        healthReason: (action.data.reason || "Flagged for review by Friday Agent").slice(0, 1000),
        healthReasonUpdatedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(projects.id, action.projectId), eq(projects.organizationId, orgId)));
      return { success: true, message: `Project flagged for review with Red health status.` };
    }

    case "assign_owner": {
      if (!action.data.userId || typeof action.data.userId !== "string") {
        return { success: false, message: "Valid userId is required for assignment." };
      }
      const [member] = await db.select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, action.data.userId)
        ));
      if (!member) {
        return { success: false, message: "User is not a member of this organization." };
      }
      await db.update(projects).set({
        managerId: action.data.userId,
        updatedAt: new Date(),
      }).where(and(eq(projects.id, action.projectId), eq(projects.organizationId, orgId)));
      return { success: true, message: `Project manager assigned.` };
    }

    default:
      return { success: false, message: "Unknown action type." };
  }
}
