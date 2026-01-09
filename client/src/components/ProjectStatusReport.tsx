import { useMemo } from "react";
import { format } from "date-fns";
import type { Project, Risk, Issue, Milestone, ProjectFinancial, Task } from "@shared/schema";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectStatusReportProps {
  project: Project;
  risks: Risk[];
  issues: Issue[];
  milestones: Milestone[];
  financials: ProjectFinancial[];
  tasks: Task[];
  executiveSummary?: string;
}

function HealthIndicator({ value, label }: { value: "Green" | "Yellow" | "Red" | string; label: string }) {
  const getColor = () => {
    switch (value) {
      case "Green": return "bg-green-500";
      case "Yellow": return "bg-yellow-500";
      case "Red": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  const getIcon = () => {
    switch (value) {
      case "Green": return <CheckCircle2 className="h-5 w-5 text-white" />;
      case "Yellow": return <Clock className="h-5 w-5 text-white" />;
      case "Red": return <AlertTriangle className="h-5 w-5 text-white" />;
      default: return <Circle className="h-5 w-5 text-white" />;
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", getColor())}>
        {getIcon()}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function ProjectStatusReport({
  project,
  risks,
  issues,
  milestones,
  financials,
  tasks,
  executiveSummary
}: ProjectStatusReportProps) {
  const taskStats = useMemo(() => {
    const completed = tasks.filter(t => t.status === "Completed" || t.progress === 100).length;
    const inProgress = tasks.filter(t => t.status === "In Progress").length;
    const notStarted = tasks.filter(t => t.status === "Not Started" || (!t.status && t.progress === 0)).length;
    const total = tasks.length || 1;
    return {
      completed,
      inProgress,
      notStarted,
      completedPercent: (completed / total) * 100,
      inProgressPercent: (inProgress / total) * 100,
      notStartedPercent: (notStarted / total) * 100
    };
  }, [tasks]);

  const financialSummary = useMemo(() => {
    const budget = financials.reduce((sum, f) => sum + parseFloat(f.budgetAmount || "0"), 0);
    const actual = financials.reduce((sum, f) => sum + parseFloat(f.actualAmount || "0"), 0);
    const planned = financials.reduce((sum, f) => sum + parseFloat(f.plannedAmount || "0"), 0);
    const projectBudget = parseFloat(project.budget?.toString() || "0");
    const totalBudget = budget > 0 ? budget : projectBudget;
    return {
      budget: totalBudget,
      actual,
      forecast: planned > 0 ? planned : totalBudget,
      budgetPercent: totalBudget > 0 ? Math.min((actual / totalBudget) * 100, 100) : 0,
      actualPercent: totalBudget > 0 ? Math.min((actual / totalBudget) * 100, 100) : 0,
      forecastPercent: totalBudget > 0 ? Math.min((planned / totalBudget) * 100, 100) : 0
    };
  }, [financials, project.budget]);

  const topRisksAndIssues = useMemo(() => {
    const openRisks = risks
      .filter(r => r.status === "Open" && !r.deletedAt)
      .slice(0, 3);
    const openIssues = issues
      .filter(i => (i.status === "Open" || i.status === "In Progress") && !i.deletedAt)
      .slice(0, 3);
    return [...openRisks.map(r => ({ type: "risk", title: r.title, priority: r.impact })), 
            ...openIssues.map(i => ({ type: "issue", title: i.title, priority: i.priority }))].slice(0, 5);
  }, [risks, issues]);

  const majorMilestones = useMemo(() => {
    return milestones
      .filter(m => !m.deletedAt)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 4);
  }, [milestones]);

  const getMilestoneStatus = (milestone: Milestone) => {
    if (milestone.completed || milestone.status === "Done") return "Complete";
    const dueDate = new Date(milestone.dueDate);
    const today = new Date();
    if (dueDate < today) return "At Risk";
    return "On Track";
  };

  const getMilestoneStatusColor = (status: string) => {
    switch (status) {
      case "Complete": return "text-green-600";
      case "At Risk": return "text-red-600";
      default: return "text-muted-foreground";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="bg-background" data-testid="project-status-report">
      <div className="bg-primary text-primary-foreground p-6 rounded-t-lg">
        <h1 className="text-2xl font-bold">PROJECT STATUS REPORT</h1>
        <p className="text-primary-foreground/80">{format(new Date(), "MMMM d, yyyy")}</p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-2">Executive Summary</h2>
            <p className="text-sm text-muted-foreground">
              {executiveSummary || project.description || "No executive summary provided for this project."}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Project Schedule</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm w-24">Complete</span>
                <div className="flex-1">
                  <Progress value={taskStats.completedPercent} className="h-3" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-24">In progress</span>
                <div className="flex-1">
                  <Progress value={taskStats.inProgressPercent} className="h-3" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-24">Not started</span>
                <div className="flex-1">
                  <Progress value={taskStats.notStartedPercent} className="h-3" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Financials</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Budget</span>
                <span className="text-sm font-medium">{formatCurrency(financialSummary.budget)}</span>
              </div>
              <Progress value={100} className="h-3" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Actual</span>
                <span className="text-sm font-medium">{formatCurrency(financialSummary.actual)}</span>
              </div>
              <Progress value={financialSummary.actualPercent} className="h-3" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Forecast</span>
                <span className="text-sm font-medium">{formatCurrency(financialSummary.forecast)}</span>
              </div>
              <Progress value={financialSummary.forecastPercent} className="h-3" />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Project Timeline</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "Not set"}</span>
              <span>→</span>
              <span>{project.endDate ? format(new Date(project.endDate), "MMM d, yyyy") : "Not set"}</span>
            </div>
            <div className="mt-2">
              <Progress value={project.completionPercentage || 0} className="h-4" />
              <p className="text-xs text-muted-foreground mt-1">{project.completionPercentage || 0}% Complete</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-3">Project Health</h2>
            <div className="flex items-center justify-around">
              <HealthIndicator value={project.health || "Green"} label="Overall" />
              <HealthIndicator value={project.health || "Green"} label="Schedule" />
              <HealthIndicator value={financialSummary.actual > financialSummary.budget ? "Red" : "Green"} label="Budget" />
              <HealthIndicator value="Green" label="Resources" />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Key Risks & Issues</h2>
            <div className="space-y-2">
              {topRisksAndIssues.length > 0 ? (
                topRisksAndIssues.map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-4 w-4 mt-0.5 flex-shrink-0",
                      item.priority === "High" || item.priority === "Critical" ? "text-red-500" : 
                      item.priority === "Medium" ? "text-yellow-500" : "text-muted-foreground"
                    )} />
                    <span className="text-sm">{item.title}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No open risks or issues</p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Major Milestones</h2>
            <div className="space-y-2">
              {majorMilestones.length > 0 ? (
                <table className="w-full text-sm">
                  <tbody>
                    {majorMilestones.map((milestone) => {
                      const status = getMilestoneStatus(milestone);
                      return (
                        <tr key={milestone.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-2">{milestone.title}</td>
                          <td className="py-2 pr-2 text-muted-foreground">
                            {format(new Date(milestone.dueDate), "MMM d, yyyy")}
                          </td>
                          <td className={cn("py-2 text-right", getMilestoneStatusColor(status))}>
                            {status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">No milestones defined</p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Status</h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{project.status}</Badge>
              <Badge variant={project.priority === "Critical" ? "destructive" : "secondary"}>
                {project.priority}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t text-center text-xs text-muted-foreground">
        Generated by FridayReport.AI on {format(new Date(), "MMMM d, yyyy 'at' h:mm a")}
      </div>
    </div>
  );
}

export type { ProjectStatusReportProps };
