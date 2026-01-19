import OpenAI from "openai";
import type { CustomDashboardConfig, DashboardWidget } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are an AI assistant that generates dashboard configurations for a project portfolio management application.

Available data sources:
- projects: Project data (name, status, health, budget, completionPercentage, startDate, endDate, priority)
- portfolios: Portfolio data (name, status, totalBudget, projectCount)
- tasks: Task data (name, status, progress, priority, startDate, endDate, assignee)
- risks: Risk data (title, severity, probability, status, impact)
- issues: Issue data (title, priority, status, severity, assignee)
- milestones: Milestone data (title, dueDate, completed)
- resources: Resource data (name, role, rate, availability)
- timesheets: Timesheet entries (hours, date, resourceId, projectId, taskId)

Widget types:
- kpi: Single number display (count, sum, average)
- bar-chart: Bar chart for comparisons
- line-chart: Line chart for trends over time
- pie-chart: Pie chart for distributions
- area-chart: Area chart for cumulative data
- table: Data table with rows
- progress: Progress bars

Aggregation types: count, sum, average, percentage
Size options: small (1/4 width), medium (1/2 width), large (3/4 width), full (full width)

Based on the user's description, generate a dashboard configuration with appropriate widgets.
Return ONLY valid JSON matching this structure:
{
  "name": "Dashboard Name",
  "widgets": [
    {
      "id": "unique-id",
      "type": "widget-type",
      "title": "Widget Title",
      "dataSource": "data-source",
      "metrics": ["metric1", "metric2"],
      "aggregation": "aggregation-type",
      "groupBy": "field-name",
      "size": "size-option"
    }
  ],
  "layout": "grid"
}`;

export async function generateDashboardConfig(userDescription: string): Promise<{ name: string; config: CustomDashboardConfig }> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Create a dashboard for: ${userDescription}` }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    
    // Validate and ensure widgets have unique IDs
    const widgets: DashboardWidget[] = (parsed.widgets || []).map((w: any, index: number) => ({
      id: w.id || `widget-${Date.now()}-${index}`,
      type: validateWidgetType(w.type),
      title: w.title || `Widget ${index + 1}`,
      dataSource: validateDataSource(w.dataSource),
      metrics: w.metrics || [],
      filters: w.filters || {},
      aggregation: validateAggregation(w.aggregation),
      groupBy: w.groupBy,
      size: validateSize(w.size),
    }));

    return {
      name: parsed.name || "Custom Dashboard",
      config: {
        widgets,
        layout: parsed.layout || "grid",
      },
    };
  } catch (error) {
    console.error("Error generating dashboard:", error);
    // Return a fallback dashboard
    return {
      name: "Custom Dashboard",
      config: {
        widgets: [
          {
            id: `widget-${Date.now()}-1`,
            type: "kpi",
            title: "Total Projects",
            dataSource: "projects",
            aggregation: "count",
            size: "small",
          },
          {
            id: `widget-${Date.now()}-2`,
            type: "bar-chart",
            title: "Projects by Status",
            dataSource: "projects",
            groupBy: "status",
            aggregation: "count",
            size: "medium",
          },
          {
            id: `widget-${Date.now()}-3`,
            type: "pie-chart",
            title: "Project Health Distribution",
            dataSource: "projects",
            groupBy: "health",
            aggregation: "count",
            size: "medium",
          },
        ],
        layout: "grid",
      },
    };
  }
}

function validateWidgetType(type: string): DashboardWidget["type"] {
  const valid: DashboardWidget["type"][] = ["kpi", "bar-chart", "line-chart", "pie-chart", "area-chart", "table", "progress"];
  return valid.includes(type as any) ? (type as DashboardWidget["type"]) : "kpi";
}

function validateDataSource(source: string): DashboardWidget["dataSource"] {
  const valid: DashboardWidget["dataSource"][] = ["projects", "portfolios", "tasks", "risks", "issues", "milestones", "resources", "timesheets"];
  return valid.includes(source as any) ? (source as DashboardWidget["dataSource"]) : "projects";
}

function validateAggregation(agg: string): DashboardWidget["aggregation"] {
  const valid: DashboardWidget["aggregation"][] = ["count", "sum", "average", "percentage"];
  return valid.includes(agg as any) ? (agg as DashboardWidget["aggregation"]) : "count";
}

function validateSize(size: string): DashboardWidget["size"] {
  const valid: DashboardWidget["size"][] = ["small", "medium", "large", "full"];
  return valid.includes(size as any) ? (size as DashboardWidget["size"]) : "medium";
}
