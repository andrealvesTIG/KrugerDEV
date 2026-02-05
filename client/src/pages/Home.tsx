import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useAssignedTasks, useCurrentUserResource, useTimesheetEntries } from "@/hooks/use-timesheets";
import { useAllIssues } from "@/hooks/use-issues";
import { useAllMilestones } from "@/hooks/use-milestones";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { Link } from "wouter";
import { format, startOfWeek, endOfWeek, addDays, isAfter, isBefore, parseISO, differenceInDays } from "date-fns";
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
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "on_hold":
    case "on hold":
    case "blocked":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "not_started":
    case "not started":
    case "pending":
    case "open":
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

export default function Home() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const organizationId = currentOrganization?.id || null;

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

  const assignedTasks = useMemo(() => {
    if (!assignedTasksData) return [];
    return assignedTasksData.filter((item) => {
      const status = item.task.status?.toLowerCase();
      return status !== "completed" && status !== "done" && status !== "closed";
    });
  }, [assignedTasksData]);

  const myIssues = useMemo(() => {
    if (!allIssues || !currentResource) return [];
    return allIssues.filter((issue: Issue) => {
      const isAssigned = issue.ownerId === String(currentResource.id) || issue.ownerId === currentResource.userId;
      const isOpen = issue.status?.toLowerCase() !== "closed" && issue.status?.toLowerCase() !== "resolved";
      return isAssigned && isOpen;
    });
  }, [allIssues, currentResource]);

  // Get the set of project IDs where user has assigned tasks
  const myProjectIds = useMemo(() => {
    if (!assignedTasksData) return new Set<number>();
    return new Set(assignedTasksData.map((item) => item.task.projectId).filter(Boolean) as number[]);
  }, [assignedTasksData]);

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
        // Only show milestones from projects where the user has assigned tasks
        if (!m.projectId || !myProjectIds.has(m.projectId)) return false;
        return isAfter(m.parsedDueDate, now) && isBefore(m.parsedDueDate, thirtyDaysFromNow) && m.status !== "Done" && m.status !== "Completed";
      })
      .sort((a, b) => a.parsedDueDate!.getTime() - b.parsedDueDate!.getTime())
      .slice(0, 5);
  }, [allMilestones, myProjectIds]);

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

  const isLoading = resourceLoading || tasksLoading || timesheetsLoading || issuesLoading || milestonesLoading;

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const greeting = getGreeting();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {user?.firstName || user?.username || "there"}
          </h1>
          <p className="text-muted-foreground">Here's what's on your plate today</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {format(today, "EEEE, MMMM d, yyyy")}
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
                <div className="text-2xl font-bold text-foreground">{assignedTasks.length}</div>
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
                <div className="text-2xl font-bold text-foreground">{myIssues.length}</div>
                <div className="text-sm text-muted-foreground">Open Issues</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{upcomingMilestones.length}</div>
                <div className="text-sm text-muted-foreground">Upcoming Milestones</div>
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
                <div className="text-2xl font-bold text-foreground">
                  {totalHoursThisWeek}h <span className="text-sm font-normal text-muted-foreground">/ {weeklyTarget}h</span>
                </div>
                <div className="text-sm text-muted-foreground">Hours This Week</div>
              </div>
            </div>
            <Progress value={progressPercent} className="mt-3 h-1.5" />
          </CardContent>
        </Card>
      </div>

      {overdueTasks.length > 0 && (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">You have {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
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
                {assignedTasks.slice(0, 5).map((item) => (
                  <div
                    key={item.task.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`task-item-${item.task.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{item.task.name}</span>
                        <Badge variant="outline" className={getStatusColor(item.task.status)}>
                          {item.task.status || "Not Started"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <FolderOpen className="h-3 w-3" />
                        <span className="truncate">{item.project.name}</span>
                        {item.task.endDate && (
                          <>
                            <span>•</span>
                            <Calendar className="h-3 w-3" />
                            <span>
                              Due {format(typeof item.task.endDate === "string" ? parseISO(item.task.endDate) : item.task.endDate, "MMM d")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
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
            <div className="flex items-center justify-between">
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
                {myIssues.slice(0, 5).map((issue: Issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`issue-item-${issue.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{issue.title}</span>
                        <Badge variant="outline" className={getPriorityColor(issue.priority)}>
                          {issue.priority || "Medium"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Flag className="h-3 w-3" />
                        <span>{issue.itemType === "risk" ? "Risk" : "Issue"}</span>
                        <span>•</span>
                        <span className="truncate">{issue.status || "Open"}</span>
                      </div>
                    </div>
                  </div>
                ))}
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Upcoming Milestones</CardTitle>
                <CardDescription>Key dates in the next 30 days</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {upcomingMilestones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Target className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No upcoming milestones</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingMilestones.map((milestone) => {
                  const dueDate = milestone.parsedDueDate!;
                  const daysUntil = differenceInDays(dueDate, today);
                  return (
                    <div
                      key={milestone.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      data-testid={`milestone-item-${milestone.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate">{milestone.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{format(dueDate, "MMM d, yyyy")}</span>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={daysUntil <= 7 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-400"}
                      >
                        {daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil} days`}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
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
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
