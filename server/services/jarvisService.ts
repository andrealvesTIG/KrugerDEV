import OpenAI from "openai";
import { db } from "../db";
import { projects, tasks, issues, resources, taskDependencies } from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

const MAX_ISSUES = 200;
const MAX_TASKS = 300;
const MAX_DEPS = 100;

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface ProjectContext {
  projects: Array<{ id: number; name: string; status: string | null; health: string | null; startDate: string | null; endDate: string | null; description: string | null }>;
  tasks: Array<{ id: number; name: string; status: string | null; projectId: number; assigneeId: number | null; startDate: string | null; endDate: string | null; isMilestone: boolean | null; percentComplete: number | null }>;
  issues: Array<{ id: number; title: string; itemType: string | null; status: string | null; priority: string | null; severity: string | null; projectId: number; assignee: string | null }>;
  resources: Array<{ id: number; displayName: string; email: string | null; title: string | null; department: string | null }>;
  dependencies: Array<{ taskId: number; dependsOnTaskId: number; type: string | null }>;
}

async function getProjectContext(organizationId: number): Promise<ProjectContext> {
  const orgProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      health: projects.health,
      startDate: projects.startDate,
      endDate: projects.endDate,
      description: projects.description,
    })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));

  const projectIds = orgProjects.map(p => p.id);
  if (projectIds.length === 0) {
    return { projects: orgProjects, tasks: [], issues: [], resources: [], dependencies: [] };
  }

  const orgTasks = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      status: tasks.status,
      projectId: tasks.projectId,
      assigneeId: tasks.assigneeId,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      isMilestone: tasks.isMilestone,
      percentComplete: tasks.percentComplete,
    })
    .from(tasks)
    .where(and(inArray(tasks.projectId, projectIds), isNull(tasks.deletedAt)))
    .limit(MAX_TASKS);

  const orgIssues = await db
    .select({
      id: issues.id,
      title: issues.title,
      itemType: issues.itemType,
      status: issues.status,
      priority: issues.priority,
      severity: issues.severity,
      projectId: issues.projectId,
      assignee: issues.assignee,
    })
    .from(issues)
    .where(and(inArray(issues.projectId, projectIds), isNull(issues.deletedAt)))
    .limit(MAX_ISSUES);

  const orgResources = await db
    .select({
      id: resources.id,
      displayName: resources.displayName,
      email: resources.email,
      title: resources.title,
      department: resources.department,
    })
    .from(resources)
    .where(and(eq(resources.organizationId, organizationId), isNull(resources.deletedAt)));

  const taskIds = orgTasks.map(t => t.id);
  let orgDeps: Array<{ taskId: number; dependsOnTaskId: number; type: string | null }> = [];
  if (taskIds.length > 0) {
    orgDeps = await db
      .select({
        taskId: taskDependencies.taskId,
        dependsOnTaskId: taskDependencies.dependsOnTaskId,
        type: taskDependencies.type,
      })
      .from(taskDependencies)
      .where(inArray(taskDependencies.taskId, taskIds))
      .limit(MAX_DEPS);
  }

  return {
    projects: orgProjects,
    tasks: orgTasks,
    issues: orgIssues,
    resources: orgResources,
    dependencies: orgDeps,
  };
}

function buildSystemPrompt(context: ProjectContext): string {
  const projectSummary = context.projects.map(p =>
    `- Project #${p.id} "${p.name}" | Status: ${p.status || 'N/A'} | Health: ${p.health || 'N/A'} | Start: ${p.startDate || 'N/A'} | End: ${p.endDate || 'N/A'}`
  ).join('\n');

  const taskSummary = context.tasks.slice(0, 50).map(t =>
    `- Task #${t.id} "${t.name}" in Project #${t.projectId} | Status: ${t.status || 'N/A'} | ${t.isMilestone ? 'MILESTONE' : ''} | ${t.percentComplete || 0}% complete`
  ).join('\n');

  const issueSummary = context.issues.slice(0, 50).map(i =>
    `- ${i.itemType === 'risk' ? 'Risk' : 'Issue'} #${i.id} "${i.title}" in Project #${i.projectId} | Status: ${i.status || 'N/A'} | Priority: ${i.priority || 'N/A'} | Severity: ${i.severity || 'N/A'}`
  ).join('\n');

  const resourceSummary = context.resources.map(r =>
    `- Resource #${r.id} "${r.displayName}" | Title: ${r.title || 'N/A'} | Department: ${r.department || 'N/A'}`
  ).join('\n');

  return `You are Friday Copilot, an AI assistant for FridayReport.AI — a project portfolio management platform.
You help users understand their project data, answer questions about tasks, issues, risks, resources, and project health.
Be concise, helpful, and reference specific project data when answering.

When referencing projects, always mention them as "Project #ID - Name" so they can be linked.
When referencing tasks, always mention them as "Task #ID - Name" so they can be linked.

CURRENT PROJECT DATA:

PROJECTS (${context.projects.length} total):
${projectSummary || 'No projects found.'}

TASKS (${context.tasks.length} total, showing up to 50):
${taskSummary || 'No tasks found.'}

ISSUES & RISKS (${context.issues.length} total, showing up to 50):
${issueSummary || 'No issues found.'}

RESOURCES (${context.resources.length} total):
${resourceSummary || 'No resources found.'}

DEPENDENCIES (${context.dependencies.length} total):
${context.dependencies.slice(0, 20).map(d => `- Task #${d.taskId} depends on Task #${d.dependsOnTaskId} (${d.type || 'FS'})`).join('\n') || 'No dependencies found.'}

STATS SUMMARY:
- Total projects: ${context.projects.length}
- Total tasks: ${context.tasks.length}
- Total issues/risks: ${context.issues.length}
- Total resources: ${context.resources.length}
- Open tasks: ${context.tasks.filter(t => t.status !== 'Completed' && t.status !== 'Done').length}
- Open issues: ${context.issues.filter(i => i.status !== 'Closed' && i.status !== 'Resolved' && i.itemType !== 'risk').length}
- Open risks: ${context.issues.filter(i => i.itemType === 'risk' && i.status !== 'Closed' && i.status !== 'Mitigated').length}
`;
}

export async function chat(
  message: string,
  organizationId: number,
  conversationHistory: Array<{ role: string; content: string }> = [],
  conciseMode: boolean = false
): Promise<string> {
  try {
    const context = await getProjectContext(organizationId);
    let systemPrompt = buildSystemPrompt(context);

    if (conciseMode) {
      systemPrompt += '\n\nIMPORTANT: The user has enabled concise mode. Keep responses very brief — 1-3 sentences max. Be direct and skip pleasantries.';
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of conversationHistory.slice(-10)) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    messages.push({ role: "user", content: message });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: conciseMode ? 500 : 2000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "I'm sorry, I couldn't process that request.";
  } catch (error: any) {
    console.error("[jarvis] Chat error:", error.message);
    throw new Error("Failed to get AI response: " + error.message);
  }
}
