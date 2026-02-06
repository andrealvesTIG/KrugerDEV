import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useAssignedTasks, useCurrentUserResource, useTimesheetEntries } from "@/hooks/use-timesheets";
import { useAllIssues, useCreateIssue } from "@/hooks/use-issues";
import { useAllMilestones } from "@/hooks/use-milestones";
import { useProjects } from "@/hooks/use-projects";
import { useCreateTask } from "@/hooks/use-tasks";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import {
  Clock,
  ListTodo,
  AlertTriangle,
  Target,
  ChevronRight,
  Calendar,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Play,
  Loader2,
  FolderOpen,
  Flag,
  Plus,
  Timer,
  Bug,
  Activity,
  Zap,
  CircleDot,
  ArrowUpRight,
  BarChart3,
} from "lucide-react";
import { Link } from "wouter";
import { format, startOfWeek, endOfWeek, addDays, isAfter, isBefore, parseISO, differenceInDays, formatDistanceToNow } from "date-fns";
import type { Task, Issue, Project, Milestone } from "@shared/schema";

function getStatusColor(status: string | null | undefined): string {
  switch (status?.toLowerCase()) {
    case "completed":
    case "done":
    case "closed":
      return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "in_progress":
    case "in progress":
    case "active":
    case "execution":
    case "monitoring":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "on_hold":
    case "on hold":
    case "blocked":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "not_started":
    case "not started":
    case "pending":
    case "open":
    case "initiation":
    case "planning":
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
  }
}

function getPriorityColor(priority: string | null | undefined): string {
  switch (priority?.toLowerCase()) {
    case "critical":
    case "urgent":
      return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "high":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "medium":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    case "low":
      return "bg-green-500/10 text-green-700 dark:text-green-400";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
  }
}

function getHealthColor(health: string | null | undefined): string {
  switch (health?.toLowerCase()) {
    case "green":
      return "bg-green-500";
    case "yellow":
      return "bg-yellow-500";
    case "red":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

function getHealthBadgeColor(health: string | null | undefined): string {
  switch (health?.toLowerCase()) {
    case "green":
      return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "yellow":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    case "red":
      return "bg-red-500/10 text-red-700 dark:text-red-400";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
  }
}

interface ActivityItem {
  id: string;
  type: string;
  entityName: string;
  entityId: number;
  action: string;
  summary: string;
  changedBy: string;
  changedAt: string;
}

export default function Home() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const organizationId = currentOrganization?.id || null;
  const { toast } = useToast();
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateIssue, setShowCreateIssue] = useState(false);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const startDateStr = format(weekStart, "yyyy-MM-dd");
  const endDateStr = format(weekEnd, "yyyy-MM-dd");

  const { data: currentResource, isLoading: resourceLoading } = useCurrentUserResource(organizationId, user?.id);
  const { data: assignedTasksData, isLoading: tasksLoading } = useAssignedTasks(organizationId, user?.id);
  const { data: timesheetEntries, isLoading: timesheetsLoading } = useTimesheetEntries(user?.id, organizationId, startDateStr, endDateStr);
  const { data: allIssues, isLoading: issuesLoading } = useAllIssues(organizationId ?? undefined);
  const { data: allMilestones, isLoading: milestonesLoading } = useAllMilestones(organizationId ?? undefined);
  const { data: allProjects, isLoading: projectsLoading } = useProjects(organizationId ?? null);

  const { data: recentActivity } = useQuery<ActivityItem[]>({
    queryKey: ['/api/home/recent-activity', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const res = await fetch(`/api/home/recent-activity?organizationId=${organizationId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!organizationId,
  });

  const assignedTasks = useMemo(() => {
    if (!assignedTasksData) return [];
    return assignedTasksData.filter((item) => {
      const status = item.task.status?.toLowerCase();
      return status !== "completed" && status !== "done" && status !== "closed";
    });
  }, [assignedTasksData]);

  const completedTasksCount = useMemo(() => {
    if (!assignedTasksData) return 0;
    return assignedTasksData.filter((item) => {
      const status = item.task.status?.toLowerCase();
      return status === "completed" || status === "done" || status === "closed";
    }).length;
  }, [assignedTasksData]);

  const totalTasksCount = assignedTasksData?.length || 0;

  const myIssues = useMemo(() => {
    if (!allIssues || !currentResource) return [];
    return allIssues.filter((issue: Issue) => {
      const isAssigned = issue.ownerId === String(currentResource.id) || issue.ownerId === currentResource.userId;
      const isOpen = issue.status?.toLowerCase() !== "closed" && issue.status?.toLowerCase() !== "resolved";
      return isAssigned && isOpen;
    });
  }, [allIssues, currentResource]);

  const overdueIssues = useMemo(() => {
    return myIssues.filter((issue: Issue) => {
      if (!issue.targetResolutionDate) return false;
      const targetDate = typeof issue.targetResolutionDate === "string" ? parseISO(issue.targetResolutionDate) : issue.targetResolutionDate;
      return isBefore(targetDate, today);
    });
  }, [myIssues]);

  const myProjectIds = useMemo(() => {
    if (!assignedTasksData) return new Set<number>();
    return new Set(assignedTasksData.map((item) => item.task.projectId).filter(Boolean) as number[]);
  }, [assignedTasksData]);

  const myProjects = useMemo(() => {
    if (!allProjects) return [];
    return allProjects.filter((p: Project) => {
      const isInvolved = myProjectIds.has(p.id) ||
        p.managerId === user?.id ||
        p.businessSponsorId === user?.id ||
        p.businessOwnerId === user?.id ||
        p.technicalLeadId === user?.id;
      const isActive = p.status?.toLowerCase() !== "closing" && !p.deletedAt;
      return isInvolved && isActive;
    });
  }, [allProjects, myProjectIds, user?.id]);

  const upcomingMilestones = useMemo(() => {
    if (!allMilestones) return [];
    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);
    
    const parseDueDate = (dueDate: string | Date | null | undefined): Date | null => {
      if (!dueDate) return null;
      try {
        const parsed = typeof dueDate === "string" ? parseISO(dueDate) : new Date(dueDate);
        return isNaN(parsed.getTime()) ? null : parsed;
      } catch {
        return null;
      }
    };
    
    return allMilestones
      .map((m: Milestone) => ({ ...m, parsedDueDate: parseDueDate(m.dueDate) }))
      .filter((m) => {
        if (!m.parsedDueDate) return false;
        if (!m.projectId || !myProjectIds.has(m.projectId)) return false;
        return isAfter(m.parsedDueDate, now) && isBefore(m.parsedDueDate, thirtyDaysFromNow) && m.status !== "Done" && m.status !== "Completed";
      })
      .sort((a, b) => a.parsedDueDate!.getTime() - b.parsedDueDate!.getTime())
      .slice(0, 5);
  }, [allMilestones, myProjectIds]);

  const upcomingDeadlines = useMemo(() => {
    const deadlines: Array<{
      id: string;
      type: "task" | "milestone";
      name: string;
      projectName: string;
      projectId: number;
      dueDate: Date;
      status: string | null;
      priority?: string | null;
    }> = [];

    const now = new Date();
    const fourteenDaysFromNow = addDays(now, 14);

    assignedTasks.forEach((item) => {
      if (!item.task.endDate) return;
      const endDate = typeof item.task.endDate === "string" ? parseISO(item.task.endDate) : item.task.endDate;
      if (isAfter(endDate, now) && isBefore(endDate, fourteenDaysFromNow)) {
        deadlines.push({
          id: `task-${item.task.id}`,
          type: "task",
          name: item.task.name,
          projectName: item.project.name,
          projectId: item.task.projectId,
          dueDate: endDate,
          status: item.task.status,
          priority: item.task.priority,
        });
      }
    });

    upcomingMilestones.forEach((m) => {
      if (!m.parsedDueDate) return;
      if (isBefore(m.parsedDueDate, fourteenDaysFromNow)) {
        const project = allProjects?.find((p: Project) => p.id === m.projectId);
        deadlines.push({
          id: `milestone-${m.id}`,
          type: "milestone",
          name: m.title,
          projectName: project?.name || "Unknown Project",
          projectId: m.projectId,
          dueDate: m.parsedDueDate,
          status: m.status,
        });
      }
    });

    deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return deadlines.slice(0, 8);
  }, [assignedTasks, upcomingMilestones, allProjects]);

  const totalHoursThisWeek = useMemo(() => {
    if (!timesheetEntries) return 0;
    return timesheetEntries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
  }, [timesheetEntries]);

  const weeklyTarget = Number(currentResource?.weeklyCapacity) || 40;
  const progressPercent = Math.min((totalHoursThisWeek / weeklyTarget) * 100, 100);

  const overdueTasks = useMemo(() => {
    return assignedTasks.filter((item) => {
      if (!item.task.endDate) return false;
      const endDate = typeof item.task.endDate === "string" ? parseISO(item.task.endDate) : item.task.endDate;
      return isBefore(endDate, today);
    });
  }, [assignedTasks]);

  const isLoading = resourceLoading || tasksLoading || timesheetsLoading || issuesLoading || milestonesLoading || projectsLoading;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const greeting = getGreeting();
  const taskCompletionRate = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-greeting">
            {greeting}, {user?.firstName || user?.username || "there"}
          </h1>
          <p className="text-muted-foreground">Your personal workspace at a glance</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground mr-2">
            {format(today, "EEEE, MMMM d, yyyy")}
          </div>
          <Link href="/timesheets">
            <Button variant="outline" size="sm" data-testid="button-quick-log-time">
              <Timer className="h-4 w-4 mr-1" />
              Log Time
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setShowCreateTask(true)} data-testid="button-quick-create-task">
            <Plus className="h-4 w-4 mr-1" />
            Create Task
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreateIssue(true)} data-testid="button-quick-create-issue">
            <Bug className="h-4 w-4 mr-1" />
            Report Issue
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <ListTodo className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground" data-testid="text-active-tasks-count">{assignedTasks.length}</div>
                <div className="text-sm text-muted-foreground">Active Tasks</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground" data-testid="text-open-issues-count">{myIssues.length}</div>
                <div className="text-sm text-muted-foreground">Open Issues</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <FolderOpen className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground" data-testid="text-my-projects-count">{myProjects.length}</div>
                <div className="text-sm text-muted-foreground">My Projects</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground" data-testid="text-hours-this-week">
                  {totalHoursThisWeek}h <span className="text-sm font-normal text-muted-foreground">/ {weeklyTarget}h</span>
                </div>
                <div className="text-sm text-muted-foreground">Hours This Week</div>
              </div>
            </div>
            <Progress value={progressPercent} className="mt-3 h-1.5" />
          </CardContent>
        </Card>
      </div>

      {(overdueTasks.length > 0 || overdueIssues.length > 0) && (
        <div className="space-y-2">
          {overdueTasks.length > 0 && (
            <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium" data-testid="text-overdue-tasks-alert">
                      You have {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <Link href="/tasks">
                    <Button variant="ghost" size="sm" className="text-red-700 dark:text-red-400" data-testid="link-overdue-tasks">
                      View <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
          {overdueIssues.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-900/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                    <Bug className="h-5 w-5" />
                    <span className="font-medium" data-testid="text-overdue-issues-alert">
                      You have {overdueIssues.length} overdue issue{overdueIssues.length > 1 ? "s" : ""} past resolution date
                    </span>
                  </div>
                  <Link href="/issues">
                    <Button variant="ghost" size="sm" className="text-orange-700 dark:text-orange-400" data-testid="link-overdue-issues">
                      View <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {myProjects.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <CardTitle className="text-lg">My Projects</CardTitle>
                <CardDescription>Projects you're involved in</CardDescription>
              </div>
              <Link href="/projects">
                <Button variant="ghost" size="sm" data-testid="link-view-all-projects">
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {myProjects.slice(0, 6).map((project: Project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`project-card-${project.id}`}
                  >
                    <div className={`h-3 w-3 rounded-full flex-shrink-0 ${getHealthColor(project.health)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">{project.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-xs ${getStatusColor(project.status)}`}>
                          {project.status || "Planning"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{project.completionPercentage || 0}%</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Progress value={project.completionPercentage || 0} className="h-1.5 w-16" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalTasksCount > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <CardTitle className="text-lg">Task Progress</CardTitle>
                <CardDescription>Your completion snapshot</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {completedTasksCount} done
                </Badge>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400">
                  <Play className="h-3 w-3 mr-1" />
                  {assignedTasks.length} active
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Overall completion</span>
                  <span className="text-sm font-semibold text-foreground" data-testid="text-task-completion-rate">{taskCompletionRate}%</span>
                </div>
                <Progress value={taskCompletionRate} className="h-2.5" />
              </div>
              <div className="flex gap-4 text-center">
                <div>
                  <div className="text-lg font-bold text-foreground">{totalTasksCount}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600">{completedTasksCount}</div>
                  <div className="text-xs text-muted-foreground">Done</div>
                </div>
                {overdueTasks.length > 0 && (
                  <div>
                    <div className="text-lg font-bold text-red-600">{overdueTasks.length}</div>
                    <div className="text-xs text-muted-foreground">Overdue</div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <CardTitle className="text-lg">My Tasks</CardTitle>
                <CardDescription>Tasks assigned to you</CardDescription>
              </div>
              <Link href="/tasks">
                <Button variant="ghost" size="sm" data-testid="link-view-all-tasks">
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {assignedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
                <p className="text-muted-foreground">No active tasks assigned to you</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...assignedTasks]
                  .sort((a, b) => {
                    const aEndDate = a.task.endDate ? (typeof a.task.endDate === "string" ? parseISO(a.task.endDate) : a.task.endDate) : null;
                    const bEndDate = b.task.endDate ? (typeof b.task.endDate === "string" ? parseISO(b.task.endDate) : b.task.endDate) : null;
                    const aOverdue = aEndDate && isBefore(aEndDate, today);
                    const bOverdue = bEndDate && isBefore(bEndDate, today);
                    if (aOverdue && !bOverdue) return -1;
                    if (!aOverdue && bOverdue) return 1;
                    if (aEndDate && bEndDate) return aEndDate.getTime() - bEndDate.getTime();
                    return 0;
                  })
                  .slice(0, 5)
                  .map((item) => {
                    const endDate = item.task.endDate ? (typeof item.task.endDate === "string" ? parseISO(item.task.endDate) : item.task.endDate) : null;
                    const isOverdue = endDate && isBefore(endDate, today);
                    return (
                      <Link key={item.task.id} href={`/projects/${item.task.projectId}`}>
                        <div
                          className={`flex items-center justify-between p-3 rounded-lg hover-elevate cursor-pointer ${
                            isOverdue 
                              ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" 
                              : "bg-muted/50"
                          }`}
                          data-testid={`task-item-${item.task.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground truncate">{item.task.name}</span>
                              <Badge variant="outline" className={getStatusColor(item.task.status)}>
                                {item.task.status || "Not Started"}
                              </Badge>
                              {isOverdue && (
                                <Badge variant="destructive" className="text-xs">
                                  Overdue
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                              <FolderOpen className="h-3 w-3" />
                              <span className="truncate">{item.project.name}</span>
                              {endDate && (
                                <>
                                  <span>·</span>
                                  <Calendar className={`h-3 w-3 ${isOverdue ? "text-red-500" : ""}`} />
                                  <span className={isOverdue ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                                    {isOverdue ? "Was due" : "Due"} {format(endDate, "MMM d")}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                        </div>
                      </Link>
                    );
                  })}
                {assignedTasks.length > 5 && (
                  <div className="text-center pt-2">
                    <span className="text-sm text-muted-foreground">
                      +{assignedTasks.length - 5} more tasks
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <CardTitle className="text-lg">My Issues</CardTitle>
                <CardDescription>Issues & risks assigned to you</CardDescription>
              </div>
              <Link href="/issues">
                <Button variant="ghost" size="sm" data-testid="link-view-all-issues">
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {myIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
                <p className="text-muted-foreground">No open issues assigned to you</p>
              </div>
            ) : (
              <div className="space-y-3">
                {[...myIssues]
                  .sort((a: Issue, b: Issue) => {
                    const aOverdue = a.targetResolutionDate && isBefore(typeof a.targetResolutionDate === "string" ? parseISO(a.targetResolutionDate) : a.targetResolutionDate, today);
                    const bOverdue = b.targetResolutionDate && isBefore(typeof b.targetResolutionDate === "string" ? parseISO(b.targetResolutionDate) : b.targetResolutionDate, today);
                    if (aOverdue && !bOverdue) return -1;
                    if (!aOverdue && bOverdue) return 1;
                    return 0;
                  })
                  .slice(0, 5).map((issue: Issue) => {
                  const isOverdueIssue = issue.targetResolutionDate && isBefore(
                    typeof issue.targetResolutionDate === "string" ? parseISO(issue.targetResolutionDate) : issue.targetResolutionDate,
                    today
                  );
                  return (
                    <Link key={issue.id} href={`/projects/${issue.projectId}`}>
                      <div
                        className={`flex items-center justify-between p-3 rounded-lg hover-elevate cursor-pointer ${
                          isOverdueIssue
                            ? "bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                            : "bg-muted/50"
                        }`}
                        data-testid={`issue-item-${issue.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground truncate">{issue.title}</span>
                            <Badge variant="outline" className={getPriorityColor(issue.priority)}>
                              {issue.priority || "Medium"}
                            </Badge>
                            {isOverdueIssue && (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400 text-xs">
                                Overdue
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                            <Flag className="h-3 w-3" />
                            <span>{issue.itemType === "risk" ? "Risk" : "Issue"}</span>
                            <span>·</span>
                            <span className="truncate">{issue.status || "Open"}</span>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                      </div>
                    </Link>
                  );
                })}
                {myIssues.length > 5 && (
                  <div className="text-center pt-2">
                    <span className="text-sm text-muted-foreground">
                      +{myIssues.length - 5} more issues
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <CardTitle className="text-lg">Upcoming Deadlines</CardTitle>
                <CardDescription>Tasks & milestones due in the next 14 days</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {upcomingDeadlines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No upcoming deadlines</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingDeadlines.map((deadline) => {
                  const daysUntil = differenceInDays(deadline.dueDate, today);
                  const isUrgent = daysUntil <= 3;
                  return (
                    <Link key={deadline.id} href={`/projects/${deadline.projectId}`}>
                      <div
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                        data-testid={`deadline-item-${deadline.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0 ${
                            deadline.type === "milestone" 
                              ? "bg-purple-500/10" 
                              : "bg-blue-500/10"
                          }`}>
                            {deadline.type === "milestone" ? (
                              <Target className="h-4 w-4 text-purple-600" />
                            ) : (
                              <ListTodo className="h-4 w-4 text-blue-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground truncate">{deadline.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {deadline.type === "milestone" ? "Milestone" : "Task"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <FolderOpen className="h-3 w-3" />
                              <span className="truncate">{deadline.projectName}</span>
                              <span>·</span>
                              <span>{format(deadline.dueDate, "MMM d")}</span>
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={isUrgent ? "bg-red-500/10 text-red-700 dark:text-red-400" : daysUntil <= 7 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-400"}
                        >
                          {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <CardTitle className="text-lg">Timesheet Summary</CardTitle>
                <CardDescription>Week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d")}</CardDescription>
              </div>
              <Link href="/timesheets">
                <Button variant="ghost" size="sm" data-testid="link-view-timesheets">
                  Open Timesheet <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Hours Logged</span>
                <span className="font-semibold text-foreground">{totalHoursThisWeek}h / {weeklyTarget}h</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {progressPercent >= 100 ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> Target reached!
                    </span>
                  ) : (
                    `${(weeklyTarget - totalHoursThisWeek).toFixed(1)}h remaining`
                  )}
                </span>
                <span className="text-muted-foreground">{Math.round(progressPercent)}% complete</span>
              </div>

              <div className="grid grid-cols-7 gap-1 mt-4">
                {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                  const date = addDays(weekStart, dayOffset);
                  const dateKey = format(date, "yyyy-MM-dd");
                  const dayHours = timesheetEntries?.filter((e) => e.entryDate === dateKey).reduce((sum, e) => sum + (Number(e.hours) || 0), 0) || 0;
                  const isToday = format(today, "yyyy-MM-dd") === dateKey;
                  return (
                    <div key={dayOffset} className="text-center">
                      <div className={`text-xs mb-1 ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                        {format(date, "EEE")}
                      </div>
                      <div
                        className={`rounded-md p-2 text-sm font-medium ${
                          dayHours > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        } ${isToday ? "ring-2 ring-primary" : ""}`}
                      >
                        {dayHours > 0 ? `${dayHours}h` : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {recentActivity && recentActivity.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-1">
              <div>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
                <CardDescription>Latest changes across your projects</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {recentActivity.slice(0, 8).map((activity) => (
                <Link key={activity.id} href={`/projects/${activity.entityId}`}>
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`activity-item-${activity.id}`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10 flex-shrink-0 mt-0.5">
                      <Activity className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground">
                        <span className="font-medium">{activity.changedBy}</span>{" "}
                        <span className="text-muted-foreground">{activity.summary}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <FolderOpen className="h-3 w-3" />
                        <span className="truncate">{activity.entityName}</span>
                        {activity.changedAt && (
                          <>
                            <span>·</span>
                            <span>{formatDistanceToNow(new Date(activity.changedAt), { addSuffix: true })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <HomeQuickAddTaskDialog
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        projects={allProjects || []}
      />
      <HomeQuickAddIssueDialog
        open={showCreateIssue}
        onOpenChange={setShowCreateIssue}
        projects={allProjects || []}
      />
    </div>
  );
}

function HomeQuickAddTaskDialog({ open, onOpenChange, projects }: { open: boolean; onOpenChange: (open: boolean) => void; projects: Project[] }) {
  const { toast } = useToast();
  const createTask = useCreateTask();
  const form = useForm({
    defaultValues: { name: "", projectId: null as number | null },
  });

  const onSubmit = async (data: { name: string; projectId: number | null }) => {
    if (!data.projectId) {
      toast({ title: "Error", description: "Please select a project", variant: "destructive" });
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await createTask.mutateAsync({
        projectId: data.projectId,
        name: data.name,
        startDate: today,
        endDate: nextWeek,
        status: "Not Started",
        priority: "Medium",
        progress: 0,
      });
      toast({ title: "Success", description: "Task created" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>Quickly add a new task to a project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Controller
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                  <SelectTrigger data-testid="select-home-task-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Task Name</Label>
            <Input {...form.register("name", { required: true })} placeholder="Task name" data-testid="input-home-task-name" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createTask.isPending} data-testid="button-home-create-task">
              {createTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HomeQuickAddIssueDialog({ open, onOpenChange, projects }: { open: boolean; onOpenChange: (open: boolean) => void; projects: Project[] }) {
  const { toast } = useToast();
  const createIssue = useCreateIssue();
  const form = useForm({
    defaultValues: { title: "", projectId: null as number | null, severity: "Medium" },
  });

  const onSubmit = async (data: { title: string; projectId: number | null; severity: string }) => {
    if (!data.projectId) {
      toast({ title: "Error", description: "Please select a project", variant: "destructive" });
      return;
    }
    try {
      await createIssue.mutateAsync({
        projectId: data.projectId,
        title: data.title,
        status: "Open",
        priority: "Medium",
        severity: data.severity,
        itemType: "issue",
      });
      toast({ title: "Success", description: "Issue reported" });
      form.reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Report Issue</DialogTitle>
          <DialogDescription>Quickly report an issue for a project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Project</Label>
            <Controller
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value?.toString() || ""}>
                  <SelectTrigger data-testid="select-home-issue-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>Issue Title</Label>
            <Input {...form.register("title", { required: true })} placeholder="Describe the issue" data-testid="input-home-issue-title" />
          </div>
          <div className="space-y-2">
            <Label>Severity</Label>
            <Controller
              control={form.control}
              name="severity"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger data-testid="select-home-issue-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createIssue.isPending} data-testid="button-home-create-issue">
              {createIssue.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
