import { db } from "../db";
import { projects, portfolios, issues, tasks, taskDependencies, resources, statusReportHistory, healthStatusHistory, organizationMembers } from "@shared/schema";
import { eq, and, sql, inArray, isNull, desc } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are Friday Copilot, an AI portfolio and project management copilot embedded in this application. Your name is "Friday Copilot" or simply "Friday" — never refer to yourself as "JARVIS" or any other name. You help users understand project health, risks, issues, mitigations, tasks, dependencies, and priorities using real application data. You do not invent facts. You clearly separate observations, risks, and recommendations. You speak in natural, professional language. When suggesting updates or actions, you require confirmation before any write operation.

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
  const now = new Date();

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

export async function streamJarvisResponse(
  orgId: number,
  messages: JarvisMessage[],
  concise: boolean,
  onChunk: (content: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (error: Error) => void,
) {
  try {
    const context = await gatherOrganizationContext(orgId);
    const dataContext = buildDataContext(context);

    const conciseDirective = concise
      ? `\n\nIMPORTANT — Concise mode is ON. Keep every reply SHORT: max 3-5 bullet points or 2-3 short sentences. No lengthy explanations. Omit sections that have nothing notable. If the user needs more detail, they will ask.`
      : `\n\nDetailed mode is ON. Provide thorough, structured responses. Use sections (Observations, Risks/Concerns, Recommendations) when helpful. Include relevant data points and context. Use bullet points for clarity.`;

    const systemMessage = `${SYSTEM_PROMPT}${conciseDirective}\n\n---\n\n${dataContext}`;

    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemMessage },
      ...messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: apiMessages,
      stream: true,
      max_completion_tokens: concise ? 800 : 4096,
      temperature: 0.3,
    });

    let fullResponse = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullResponse += content;
        onChunk(content);
      }
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
        healthReason: (action.data.reason || "Flagged for review by Friday Copilot").slice(0, 1000),
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
