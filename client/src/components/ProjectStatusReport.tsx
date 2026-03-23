import { useMemo, useState } from "react";
import { format, differenceInDays, isAfter, isBefore } from "date-fns";
import type { Project, Risk, Issue, ProjectFinancial, Task, ChangeRequest, ProjectDocument } from "@shared/schema";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Circle, Clock, Target, TrendingUp, Users, DollarSign, Calendar, Flag, FileText, GitPullRequest, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface ProjectStatusReportProps {
  project: Project;
  risks: Risk[];
  issues: Issue[];
  financials: ProjectFinancial[];
  tasks: Task[];
  changeRequests?: ChangeRequest[];
  documents?: ProjectDocument[];
  executiveSummary?: string;
}

function HealthIndicator({ value, label, icon: Icon }: { value: "Green" | "Yellow" | "Red" | string; label: string; icon?: React.ElementType }) {
  const getColor = () => {
    switch (value) {
      case "Green": return "bg-green-500";
      case "Yellow": return "bg-yellow-500";
      case "Red": return "bg-red-500";
      default: return "bg-muted";
    }
  };

  const getIcon = () => {
    if (Icon) return <Icon className="h-5 w-5 text-white" />;
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

const COLORS = {
  completed: "#22c55e",
  inProgress: "#3b82f6",
  notStarted: "#94a3b8",
  atRisk: "#ef4444",
  onTrack: "#22c55e"
};

export function ProjectStatusReport({
  project,
  risks,
  issues,
  financials,
  tasks,
  changeRequests = [],
  documents = [],
  executiveSummary
}: ProjectStatusReportProps) {
  const MILESTONE_PREVIEW_COUNT = 5;
  const [showAllMilestones, setShowAllMilestones] = useState(false);

  const taskStats = useMemo(() => {
    const leafTasks = tasks.filter(t => !t.isSummary && !t.isMilestone);
    const completed = leafTasks.filter(t => t.status === "Completed").length;
    const inProgress = leafTasks.filter(t => t.status === "In Progress").length;
    const notStarted = leafTasks.filter(t => t.status === "Not Started" || (!t.status && t.progress === 0)).length;
    const total = leafTasks.length || 1;
    const totalProgress = tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
    const overallCompletion = tasks.length > 0 ? Math.round(totalProgress / tasks.length) : 0;
    return {
      completed,
      inProgress,
      notStarted,
      total: leafTasks.length,
      completedPercent: (completed / total) * 100,
      inProgressPercent: (inProgress / total) * 100,
      notStartedPercent: (notStarted / total) * 100,
      overallCompletion
    };
  }, [tasks]);

  const taskChartData = useMemo(() => [
    { name: "Completed", value: taskStats.completed, color: COLORS.completed },
    { name: "In Progress", value: taskStats.inProgress, color: COLORS.inProgress },
    { name: "Not Started", value: taskStats.notStarted, color: COLORS.notStarted }
  ].filter(d => d.value > 0), [taskStats]);

  const financialSummary = useMemo(() => {
    const budget = financials.reduce((sum, f) => sum + (f.budgetAmount || 0), 0);
    const actual = financials.reduce((sum, f) => sum + (f.actualAmount || 0), 0);
    const planned = financials.reduce((sum, f) => sum + (f.plannedAmount || 0), 0);
    const projectBudget = project.budget || 0;
    const totalBudget = budget > 0 ? budget : projectBudget;
    return {
      budget: totalBudget,
      actual,
      forecast: planned > 0 ? planned : totalBudget,
      variance: totalBudget - actual,
      budgetPercent: totalBudget > 0 ? Math.min((actual / totalBudget) * 100, 100) : 0,
      actualPercent: totalBudget > 0 ? Math.min((actual / totalBudget) * 100, 100) : 0,
      forecastPercent: totalBudget > 0 ? Math.min((planned / totalBudget) * 100, 100) : 0
    };
  }, [financials, project.budget]);

  const financialChartData = useMemo(() => [
    { name: "Budget", value: financialSummary.budget, fill: "#3b82f6" },
    { name: "Actual", value: financialSummary.actual, fill: financialSummary.actual > financialSummary.budget ? "#ef4444" : "#22c55e" },
    { name: "Forecast", value: financialSummary.forecast, fill: "#f59e0b" }
  ], [financialSummary]);

  const riskStats = useMemo(() => {
    const closedStatuses = ["Closed", "Mitigated", "Accepted"];
    const openRisks = risks.filter(r => !closedStatuses.includes(r.status || "") && !r.deletedAt);
    const high = openRisks.filter(r => r.impact === "High" || r.probability === "High").length;
    const medium = openRisks.filter(r => r.impact === "Medium" && r.probability !== "High").length;
    const low = openRisks.filter(r => r.impact === "Low" && r.probability === "Low").length;
    return { total: openRisks.length, high, medium, low, openRisks };
  }, [risks]);

  const issueStats = useMemo(() => {
    const closedStatuses = ["Closed", "Resolved"];
    const openIssues = issues.filter(i => !closedStatuses.includes(i.status || "") && !i.deletedAt);
    const critical = openIssues.filter(i => i.priority === "Critical").length;
    const high = openIssues.filter(i => i.priority === "High").length;
    const medium = openIssues.filter(i => i.priority === "Medium").length;
    return { total: openIssues.length, critical, high, medium, openIssues };
  }, [issues]);

  const topRisksAndIssues = useMemo(() => {
    const riskClosedStatuses = ["Closed", "Mitigated", "Accepted"];
    const issueClosedStatuses = ["Closed", "Resolved"];
    const openRisks = risks
      .filter(r => !riskClosedStatuses.includes(r.status || "") && !r.deletedAt)
      .slice(0, 3);
    const openIssues = issues
      .filter(i => !issueClosedStatuses.includes(i.status || "") && !i.deletedAt)
      .slice(0, 3);
    return [...openRisks.map(r => ({ type: "risk", title: r.title, priority: r.impact })), 
            ...openIssues.map(i => ({ type: "issue", title: i.title, priority: i.priority }))].slice(0, 5);
  }, [risks, issues]);

  const majorMilestones = useMemo(() => {
    return tasks
      .filter(t => t.isMilestone && !t.deletedAt && (t.endDate || t.startDate))
      .sort((a, b) => new Date(a.endDate || a.startDate!).getTime() - new Date(b.endDate || b.startDate!).getTime());
  }, [tasks]);

  const timelineData = useMemo(() => {
    if (!project.startDate || !project.endDate) return null;
    
    const start = new Date(project.startDate);
    const end = new Date(project.endDate);
    const today = new Date();
    const totalDays = differenceInDays(end, start) || 1;
    const elapsedDays = Math.max(0, differenceInDays(today, start));
    const progressPercent = Math.min((elapsedDays / totalDays) * 100, 100);
    
    const milestonesOnTimeline = majorMilestones.map(m => {
      const mDate = new Date((m.endDate || m.startDate)!);
      const position = Math.max(0, Math.min(100, (differenceInDays(mDate, start) / totalDays) * 100));
      const isComplete = m.status === "Completed" || m.progress === 100;
      const isPast = isBefore(mDate, today);
      const isAtRisk = isPast && !isComplete;
      return { ...m, position, isComplete, isAtRisk };
    });

    return {
      start,
      end,
      today,
      totalDays,
      elapsedDays,
      progressPercent,
      daysRemaining: Math.max(0, differenceInDays(end, today)),
      milestones: milestonesOnTimeline
    };
  }, [project.startDate, project.endDate, majorMilestones]);

  const getMilestoneStatus = (task: Task) => {
    if (task.status === "Completed" || task.progress === 100) return "Complete";
    const date = task.endDate || task.startDate;
    if (date) {
      const dueDate = new Date(date);
      const today = new Date();
      if (dueDate < today) return "At Risk";
    }
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

  const budgetHealth = financialSummary.actual > financialSummary.budget ? "Red" : 
                       financialSummary.actual > financialSummary.budget * 0.9 ? "Yellow" : "Green";
  
  const scheduleHealth = timelineData && timelineData.progressPercent > taskStats.overallCompletion + 10 ? "Yellow" : 
                         project.health || "Green";

  return (
    <div className="bg-background" data-testid="project-status-report">
      <div className="bg-primary text-primary-foreground p-6 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PROJECT STATUS REPORT</h1>
            <p className="text-primary-foreground/80 text-lg mt-1">{project.name}</p>
          </div>
          <div className="text-right">
            <p className="text-primary-foreground/80">{format(new Date(), "MMMM d, yyyy")}</p>
            <div className="flex items-center gap-2 mt-1 justify-end">
              <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0">
                {project.status}
              </Badge>
              <Badge variant="secondary" className={cn(
                "border-0",
                project.priority === "Critical" ? "bg-red-500/20 text-red-100" : "bg-primary-foreground/20 text-primary-foreground"
              )}>
                {project.priority}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Executive Summary
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {executiveSummary || project.description || "No executive summary provided for this project."}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Project Health</h2>
            <div className="flex items-center justify-around">
              <HealthIndicator value={project.health || "Green"} label="Overall" icon={Target} />
              <HealthIndicator value={scheduleHealth} label="Schedule" icon={Calendar} />
              <HealthIndicator value={budgetHealth} label="Budget" icon={DollarSign} />
              <HealthIndicator value={riskStats.high > 2 ? "Red" : riskStats.high > 0 ? "Yellow" : "Green"} label="Risk" icon={AlertTriangle} />
            </div>
          </div>
        </div>

        {timelineData && (
          <div className="border rounded-lg p-4 bg-muted/30">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Project Timeline
            </h2>
            
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">{format(timelineData.start, "MMM d, yyyy")}</span>
              <span className="text-muted-foreground">{timelineData.daysRemaining} days remaining</span>
              <span className="font-medium">{format(timelineData.end, "MMM d, yyyy")}</span>
            </div>

            <div className="relative h-12 bg-muted rounded-lg overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-primary/30 transition-all"
                style={{ width: `${timelineData.progressPercent}%` }}
              />
              <div 
                className="absolute top-0 left-0 h-full bg-primary transition-all"
                style={{ width: `${taskStats.overallCompletion}%` }}
              />
              
              <div 
                className="absolute top-0 w-0.5 h-full bg-red-500 z-10"
                style={{ left: `${timelineData.progressPercent}%` }}
              />

              {timelineData.milestones.map((m, idx) => (
                <div
                  key={m.id}
                  className="absolute top-1/2 -translate-y-1/2 z-20"
                  style={{ left: `${m.position}%` }}
                  title={m.title}
                >
                  <Flag 
                    className={cn(
                      "h-4 w-4 drop-shadow-sm",
                      m.isComplete ? "text-green-500 fill-green-500" : m.isAtRisk ? "text-red-500 fill-red-500" : "text-yellow-500 fill-yellow-500"
                    )}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-primary rounded" /> Completed
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-primary/30 rounded" /> Time Passed
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-0.5 h-3 bg-red-500" /> Today
                </span>
                <span className="flex items-center gap-1">
                  <Flag className="h-3 w-3 text-yellow-500 fill-yellow-500" /> Milestone
                </span>
              </div>
              <span>{taskStats.overallCompletion}% Complete</span>
            </div>

            {timelineData.milestones.length > 0 && (
              <div className="mt-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(showAllMilestones ? timelineData.milestones : timelineData.milestones.slice(0, MILESTONE_PREVIEW_COUNT)).map(m => (
                    <div key={m.id} className="flex items-center gap-2 text-xs">
                      <Flag className={cn(
                        "h-3 w-3 shrink-0",
                        m.isComplete ? "text-green-500" : m.isAtRisk ? "text-red-500" : "text-yellow-500"
                      )} />
                      <span className="truncate">{m.title}</span>
                    </div>
                  ))}
                </div>
                {timelineData.milestones.length > MILESTONE_PREVIEW_COUNT && (
                  <button
                    onClick={() => setShowAllMilestones(!showAllMilestones)}
                    className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {showAllMilestones ? (
                      <>Show less <ChevronUp className="h-3 w-3" /></>
                    ) : (
                      <>Show all {timelineData.milestones.length} milestones <ChevronDown className="h-3 w-3" /></>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Task Progress
            </h2>
            
            <div className="flex items-center justify-center">
              {taskStats.total > 0 ? (
                <div className="relative">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={taskChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {taskChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value} tasks`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-2xl font-bold">{taskStats.total}</span>
                      <span className="text-xs text-muted-foreground block">Tasks</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8">No tasks</p>
              )}
            </div>

            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.completed }} />
                  Completed
                </span>
                <span className="font-medium">{taskStats.completed}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.inProgress }} />
                  In Progress
                </span>
                <span className="font-medium">{taskStats.inProgress}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.notStarted }} />
                  Not Started
                </span>
                <span className="font-medium">{taskStats.notStarted}</span>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Budget Overview
            </h2>
            
            {financialSummary.budget > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={financialChartData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={60} fontSize={12} />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                    <Bar dataKey="value" radius={4} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="space-y-2 mt-2 pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span>Variance</span>
                    <span className={cn(
                      "font-medium",
                      financialSummary.variance < 0 ? "text-red-600" : "text-green-600"
                    )}>
                      {formatCurrency(financialSummary.variance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Burn Rate</span>
                    <span className="font-medium">
                      {financialSummary.budgetPercent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No budget data</p>
            )}
          </div>

          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Risks & Issues
            </h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <span className="text-2xl font-bold text-orange-500">{riskStats.total}</span>
                <span className="text-xs text-muted-foreground block">Open Risks</span>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <span className="text-2xl font-bold text-red-500">{issueStats.total}</span>
                <span className="text-xs text-muted-foreground block">Open Issues</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>High/Critical</span>
                <span className="font-medium text-red-600">{riskStats.high + issueStats.critical + issueStats.high}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Medium</span>
                <span className="font-medium text-yellow-600">{riskStats.medium + issueStats.medium}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span>Low</span>
                <span className="font-medium text-green-600">{riskStats.low}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Flag className="h-5 w-5 text-primary" />
              Major Milestones
            </h2>
            <div className="space-y-2">
              {majorMilestones.length > 0 ? (
                <>
                  <table className="w-full text-sm">
                    <tbody>
                      {(showAllMilestones ? majorMilestones : majorMilestones.slice(0, MILESTONE_PREVIEW_COUNT)).map((milestone) => {
                        const status = getMilestoneStatus(milestone);
                        return (
                          <tr key={milestone.id} className="border-b border-border last:border-0">
                            <td className="py-2 pr-2">{milestone.title}</td>
                            <td className="py-2 pr-2 text-muted-foreground">
                              {(milestone.endDate || milestone.startDate) ? format(new Date((milestone.endDate || milestone.startDate)!), "MMM d, yyyy") : "—"}
                            </td>
                            <td className={cn("py-2 text-right font-medium", getMilestoneStatusColor(status))}>
                              {status}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {majorMilestones.length > MILESTONE_PREVIEW_COUNT && (
                    <button
                      onClick={() => setShowAllMilestones(!showAllMilestones)}
                      className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {showAllMilestones ? (
                        <>Show less <ChevronUp className="h-3 w-3" /></>
                      ) : (
                        <>Show all {majorMilestones.length} milestones <ChevronDown className="h-3 w-3" /></>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No milestones defined</p>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Key Risks & Issues</h2>
            <div className="space-y-2">
              {topRisksAndIssues.length > 0 ? (
                topRisksAndIssues.map((item, index) => (
                  <div key={index} className="flex items-start gap-2 py-1">
                    <Badge variant="outline" className={cn(
                      "text-xs shrink-0",
                      item.type === "risk" ? "border-orange-500 text-orange-600" : "border-red-500 text-red-600"
                    )}>
                      {item.type === "risk" ? "Risk" : "Issue"}
                    </Badge>
                    <span className="text-sm">{item.title}</span>
                    <Badge variant="secondary" className={cn(
                      "ml-auto text-xs shrink-0",
                      item.priority === "High" || item.priority === "Critical" ? "bg-red-100 text-red-700" : 
                      item.priority === "Medium" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                    )}>
                      {item.priority}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No open risks or issues</p>
              )}
            </div>
          </div>
        </div>

        {/* Change Requests Section */}
        {changeRequests.length > 0 && (
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <GitPullRequest className="h-5 w-5 text-primary" />
              Change Requests ({changeRequests.length})
            </h2>
            <div className="space-y-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Title</th>
                    <th className="py-2 text-left font-medium">Type</th>
                    <th className="py-2 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {changeRequests.slice(0, 5).map((cr) => (
                    <tr key={cr.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-2">{cr.title || 'Untitled change request'}</td>
                      <td className="py-2 pr-2 capitalize">{cr.type?.replace('_', ' ') || 'Scope'}</td>
                      <td className="py-2 pr-2">
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          cr.status === "approved" ? "border-green-500 text-green-600" :
                          cr.status === "rejected" ? "border-red-500 text-red-600" :
                          cr.status === "implemented" ? "border-blue-500 text-blue-600" :
                          "border-yellow-500 text-yellow-600"
                        )}>
                          {cr.status?.replace('_', ' ') || 'pending'}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <Badge variant="secondary" className={cn(
                          "text-xs",
                          cr.priority === "high" || cr.priority === "critical" ? "bg-red-100 text-red-700" :
                          cr.priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                        )}>
                          {cr.priority || 'normal'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {changeRequests.length > 5 && (
                <p className="text-xs text-muted-foreground mt-2">+ {changeRequests.length - 5} more change requests</p>
              )}
            </div>
          </div>
        )}

        {/* Documents Section */}
        {documents.length > 0 && (
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Project Documents ({documents.length})
            </h2>
            <div className="space-y-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Title</th>
                    <th className="py-2 text-left font-medium">Category</th>
                    <th className="py-2 text-left font-medium">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.slice(0, 5).map((doc) => (
                    <tr key={doc.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-2">{doc.title || 'Untitled document'}</td>
                      <td className="py-2 pr-2 capitalize">{doc.category?.replace('_', ' ') || 'General'}</td>
                      <td className="py-2">{doc.version || '1.0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {documents.length > 5 && (
                <p className="text-xs text-muted-foreground mt-2">+ {documents.length - 5} more documents</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="border rounded-lg p-4 text-center">
            <span className="text-3xl font-bold text-primary">{taskStats.total}</span>
            <span className="text-sm text-muted-foreground block">Total Tasks</span>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <span className="text-3xl font-bold text-green-600">{taskStats.overallCompletion}%</span>
            <span className="text-sm text-muted-foreground block">Complete</span>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <span className="text-3xl font-bold text-blue-600">{majorMilestones.length}</span>
            <span className="text-sm text-muted-foreground block">Milestones</span>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <span className="text-3xl font-bold text-orange-600">{riskStats.total}</span>
            <span className="text-sm text-muted-foreground block">Open Risks</span>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <span className="text-3xl font-bold text-red-600">{issueStats.total}</span>
            <span className="text-sm text-muted-foreground block">Open Issues</span>
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
