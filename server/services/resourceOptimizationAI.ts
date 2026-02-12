import OpenAI from "openai";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ResourceOptimizationSuggestion {
  type: "overallocation" | "underutilization" | "skill_mismatch" | "rebalance" | "bottleneck" | "cost_saving" | "timeline_risk";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  affectedResources: string[];
  affectedProjects: string[];
  suggestedAction: string;
  estimatedImpact: string;
}

export interface ResourceOptimizationResult {
  suggestions: ResourceOptimizationSuggestion[];
  summary: string;
  generatedAt: string;
}

const SYSTEM_PROMPT = `You are an expert resource management consultant analyzing project portfolio resource allocation data. Your job is to identify inefficiencies, risks, and optimization opportunities in how resources are assigned across projects.

Analyze the provided data and return a JSON object with:
- "summary": A 2-3 sentence executive summary of the overall resource allocation health
- "suggestions": An array of optimization suggestions, each with:
  - "type": One of "overallocation", "underutilization", "skill_mismatch", "rebalance", "bottleneck", "cost_saving", "timeline_risk"
  - "severity": "high", "medium", or "low"
  - "title": Short title (max 80 chars)
  - "description": Detailed explanation of the issue (2-3 sentences)
  - "affectedResources": Array of resource names affected
  - "affectedProjects": Array of project names affected
  - "suggestedAction": Specific actionable recommendation (1-2 sentences)
  - "estimatedImpact": Expected benefit of implementing this suggestion (1 sentence)

Focus on actionable, specific suggestions. Prioritize by severity. Return 3-8 suggestions.
If data is insufficient for meaningful analysis, still provide general best-practice suggestions based on what's available.

Return ONLY valid JSON. No markdown formatting.`;

export async function generateResourceOptimization(organizationId: number): Promise<ResourceOptimizationResult> {
  const [resources, projects, allAssignments, availability] = await Promise.all([
    storage.getResources(organizationId),
    storage.getProjects(organizationId),
    storage.getAllTaskResourceAssignments(organizationId),
    storage.getResourceAvailabilityByOrg(organizationId),
  ]);

  const activeResources = resources.filter(r => r.isActive && !r.deletedAt);
  const activeProjects = projects.filter(p => !p.deletedAt && p.status !== "Completed" && p.status !== "Cancelled");

  const allTasks = await storage.getAllTasks();
  const orgTaskIds = new Set(activeProjects.map(p => p.id));
  const orgTasks = allTasks.filter(t => orgTaskIds.has(t.projectId) && !t.deletedAt);

  const resourceMap = new Map(activeResources.map(r => [r.id, r]));
  const projectMap = new Map(activeProjects.map(p => [p.id, p]));
  const taskMap = new Map(orgTasks.map(t => [t.id, t]));

  const resourceSummaries = activeResources.map(r => {
    const assignments = allAssignments.filter(a => a.resourceId === r.id);
    const totalAllocation = assignments.reduce((sum, a) => sum + (a.allocationPercentage || 100), 0);
    const taskDetails = assignments.map(a => {
      const task = taskMap.get(a.taskId);
      const project = task ? projectMap.get(task.projectId) : null;
      return {
        taskName: task?.name || "Unknown",
        projectName: project?.name || "Unknown",
        allocation: a.allocationPercentage || 100,
        status: task?.status || "Unknown",
        priority: task?.priority || "Medium",
        startDate: task?.startDate,
        endDate: task?.endDate,
      };
    }).filter(t => t.projectName !== "Unknown");

    const leaveEntries = availability.filter(a => a.resourceId === r.id);

    return {
      name: r.displayName,
      title: r.title || "N/A",
      department: r.department || "N/A",
      weeklyCapacity: r.weeklyCapacity || 40,
      hourlyRate: r.hourlyRate ? Number(r.hourlyRate) : null,
      totalAllocationPercent: totalAllocation,
      assignmentCount: taskDetails.length,
      tasks: taskDetails.slice(0, 10),
      plannedLeave: leaveEntries.length,
      skills: r.skills || [],
    };
  });

  const projectSummaries = activeProjects.map(p => {
    const projectTasks = orgTasks.filter(t => t.projectId === p.id);
    const projectAssignments = allAssignments.filter(a => {
      const task = taskMap.get(a.taskId);
      return task && task.projectId === p.id;
    });
    const uniqueResourceSet = new Set<string>();
    projectAssignments.forEach(a => {
      const r = resourceMap.get(a.resourceId);
      uniqueResourceSet.add(r?.displayName || "Unknown");
    });
    const uniqueResources = Array.from(uniqueResourceSet);

    return {
      name: p.name,
      status: p.status || "Active",
      health: p.health || "Green",
      priority: p.priority || "Medium",
      totalTasks: projectTasks.length,
      completedTasks: projectTasks.filter(t => t.status === "Completed").length,
      assignedResources: uniqueResources,
      startDate: p.startDate,
      endDate: p.endDate,
      budget: p.budget ? Number(p.budget) : null,
    };
  });

  const dataPayload = {
    totalResources: activeResources.length,
    totalProjects: activeProjects.length,
    totalAssignments: allAssignments.length,
    resources: resourceSummaries,
    projects: projectSummaries,
  };

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Analyze the following resource allocation data and provide optimization suggestions:\n\n${JSON.stringify(dataPayload, null, 2)}` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 3000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Failed to parse AI response. Please try again.");
  }

  return {
    suggestions: (parsed.suggestions || []).map((s: any) => ({
      type: s.type || "rebalance",
      severity: s.severity || "medium",
      title: s.title || "Optimization suggestion",
      description: s.description || "",
      affectedResources: s.affectedResources || [],
      affectedProjects: s.affectedProjects || [],
      suggestedAction: s.suggestedAction || "",
      estimatedImpact: s.estimatedImpact || "",
    })),
    summary: parsed.summary || "Analysis complete.",
    generatedAt: new Date().toISOString(),
  };
}
