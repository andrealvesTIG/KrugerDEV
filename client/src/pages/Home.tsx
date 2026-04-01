import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { GettingStartedChecklist } from "@/components/GettingStartedChecklist";
import { GuidedTour } from "@/components/GuidedTour";
import { FirstProjectWizard } from "@/components/FirstProjectWizard";
import { useAssignedTasks, useCurrentUserResource, useTimesheetEntries } from "@/hooks/use-timesheets";
import { useAllIssues, useCreateIssue } from "@/hooks/use-issues";
import { useAllMilestones } from "@/hooks/use-milestones";
import { useProjects } from "@/hooks/use-projects";
import { useCreateTask } from "@/hooks/use-tasks";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  FolderPlus,
  Users,
  Upload,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, startOfWeek, endOfWeek, addDays, isAfter, isBefore, parseISO, differenceInDays, formatDistanceToNow } from "date-fns";
import type { Task, Issue, Project, Milestone } from "@shared/schema";
import { PageTransition, FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/page-transition";

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
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);

  const generateDemoMutation = useMutation({
    mutationFn: async () => {
      setIsGeneratingDemo(true);
      const res = await apiRequest("POST", "/api/onboarding/generate-sample-data", {});
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Sample data created",
        description: "We've generated sample portfolios, projects, and tasks for you to explore.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setIsGeneratingDemo(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate sample data. Please try again.",
        variant: "destructive",
      });
      setIsGeneratingDemo(false);
    },
  });

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

  const CLOSED_PROJECT_STATUSES = useMemo(() => ["Closing", "Closed", "Billing"], []);

  const assignedTasks = useMemo(() => {
    if (!assignedTasksData) return [];
    return assignedTasksData.filter((item) => {
      const status = item.task.status?.toLowerCase();
      if (status === "completed" || status === "done" || status === "closed") return false;
      const projectStatus = item.project?.status || "";
      if (CLOSED_PROJECT_STATUSES.includes(projectStatus)) return false;
      return true;
    });
  }, [assignedTasksData, CLOSED_PROJECT_STATUSES]);

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
      rawId: number;
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
          rawId: item.task.id,
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
          rawId: m.id,
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

  const taskStatusDistribution = useMemo(() => {
    if (!assignedTasksData || assignedTasksData.length === 0) return [];
    const counts: Record<string, number> = {};
    assignedTasksData.forEach((item) => {
      const status = item.task.status || "Not Started";
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [assignedTasksData]);

  const recentlyCompletedTasks = useMemo(() => {
    if (!assignedTasksData) return [];
    return assignedTasksData
      .filter((item) => {
        const status = item.task.status?.toLowerCase();
        return status === "completed" || status === "done" || status === "closed";
      })
      .slice(0, 5);
  }, [assignedTasksData]);

  const projectHealthBreakdown = useMemo(() => {
    const breakdown = { green: 0, yellow: 0, red: 0 };
    myProjects.forEach((p: Project) => {
      const h = p.health?.toLowerCase();
      if (h === "green") breakdown.green++;
      else if (h === "yellow") breakdown.yellow++;
      else if (h === "red") breakdown.red++;
    });
    return breakdown;
  }, [myProjects]);

  const isEmptyState = (allProjects?.length || 0) === 0 && totalTasksCount === 0 && (allIssues?.length || 0) === 0;

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
    <PageTransition className="space-y-3 p-4">
      <GuidedTour />
      <FirstProjectWizard />
      <FadeIn className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-greeting">
            {greeting}, {user?.firstName || user?.username || "there"}
          </h1>
          <p className="text-sm text-muted-foreground">{format(today, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <Link href="/timesheets">
            <Button variant="outline" size="sm" className="whitespace-nowrap" data-testid="button-quick-log-time">
              <Timer className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Log Time</span>
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => setShowCreateTask(true)} data-testid="button-quick-create-task">
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Create Task</span>
          </Button>
          <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => setShowCreateIssue(true)} data-testid="button-quick-create-issue">
            <Bug className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Report Issue</span>
          </Button>
        </div>
      </FadeIn>

      <GettingStartedChecklist />

      {isEmptyState && (
        <div className="space-y-4" data-testid="onboarding-section">
          <div className="text-center py-4">
            <h2 className="text-lg font-bold text-foreground" data-testid="text-welcome-heading">Welcome to FridayReport.AI</h2>
            <p className="text-sm text-muted-foreground mt-1">Let's get you started with project management. Here are a few things you can do:</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/10 flex-shrink-0">
                    <FolderPlus className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">Create a Project</div>
                    <p className="text-xs text-muted-foreground mt-0.5">Start by creating your first project to organize your work.</p>
                    <Link href="/projects">
                      <Button variant="outline" size="sm" className="mt-2" data-testid="button-onboarding-projects">
                        Go to Projects
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-green-500/10 flex-shrink-0">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">Add Team Members</div>
                    <p className="text-xs text-muted-foreground mt-0.5">Add your team so you can assign tasks and track work.</p>
                    <Link href="/resources">
                      <Button variant="outline" size="sm" className="mt-2" data-testid="button-onboarding-resources">
                        Manage Resources
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-500/10 flex-shrink-0">
                    <Upload className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">Import from MS Project</div>
                    <p className="text-xs text-muted-foreground mt-0.5">Already have project data? Import it directly.</p>
                    <Link href="/projects">
                      <Button variant="outline" size="sm" className="mt-2" data-testid="button-onboarding-import">
                        Import Project
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/10 flex-shrink-0">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">Log Time</div>
                    <p className="text-xs text-muted-foreground mt-0.5">Track your hours with timesheets.</p>
                    <Link href="/timesheets">
                      <Button variant="outline" size="sm" className="mt-2" data-testid="button-onboarding-timesheets">
                        Open Timesheets
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          {currentOrganization && (
            <Card className="border-0 shadow-sm bg-primary/5 dark:bg-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 flex-shrink-0">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground">Quick Start with Sample Data</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Generate sample portfolios, projects, tasks, and key dates so you can explore the platform right away.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => generateDemoMutation.mutate()}
                    disabled={isGeneratingDemo}
                    data-testid="button-generate-sample-data"
                  >
                    {isGeneratingDemo ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {(overdueTasks.length > 0 || overdueIssues.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {overdueTasks.length > 0 && (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium" data-testid="text-overdue-tasks-alert">
                  {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}
                </span>
              </div>
              {overdueTasks.map((item) => {
                const endDate = item.task.endDate ? (typeof item.task.endDate === "string" ? parseISO(item.task.endDate) : item.task.endDate) : null;
                return (
                  <Link key={item.task.id} href={`/projects/${item.task.projectId}?tab=tasks&taskId=${item.task.id}`}>
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover-elevate cursor-pointer text-sm"
                      data-testid={`link-overdue-task-${item.task.id}`}
                    >
                      <span className="text-red-700 dark:text-red-400 font-medium truncate flex-1">{item.task.name}</span>
                      {endDate && (
                        <span className="text-red-600 dark:text-red-400 text-xs flex-shrink-0">Due {format(endDate, "MMM d")}</span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {overdueIssues.length > 0 && (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 text-sm">
                <Bug className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium" data-testid="text-overdue-issues-alert">
                  {overdueIssues.length} overdue issue{overdueIssues.length > 1 ? "s" : ""}
                </span>
              </div>
              {overdueIssues.map((issue: Issue) => {
                const resDate = issue.targetResolutionDate
                  ? (typeof issue.targetResolutionDate === "string" ? parseISO(issue.targetResolutionDate) : issue.targetResolutionDate)
                  : null;
                return (
                  <Link key={issue.id} href={`/projects/${issue.projectId}?tab=issues&issueId=${issue.id}`}>
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 hover-elevate cursor-pointer text-sm"
                      data-testid={`link-overdue-issue-${issue.id}`}
                    >
                      <span className="text-orange-700 dark:text-orange-400 font-medium truncate flex-1">{issue.title}</span>
                      {resDate && (
                        <span className="text-orange-600 dark:text-orange-400 text-xs flex-shrink-0">Due {format(resDate, "MMM d")}</span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      <StaggerContainer className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StaggerItem>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10 flex-shrink-0">
                  <ListTodo className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground leading-tight" data-testid="text-active-tasks-count">{assignedTasks.length}</div>
                  <div className="text-xs text-muted-foreground">Active Tasks</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 flex-shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground leading-tight" data-testid="text-open-issues-count">{myIssues.length}</div>
                  <div className="text-xs text-muted-foreground">Open Issues</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10 flex-shrink-0">
                  <FolderOpen className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground leading-tight" data-testid="text-my-projects-count">{myProjects.length}</div>
                  <div className="text-xs text-muted-foreground">Projects</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10 flex-shrink-0">
                  <Clock className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground leading-tight" data-testid="text-hours-this-week">
                    {totalHoursThisWeek}h
                  </div>
                  <div className="text-xs text-muted-foreground">Hours / {weeklyTarget}h</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </StaggerItem>
        {totalTasksCount > 0 && (
          <StaggerItem>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10 flex-shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-bold text-foreground leading-tight" data-testid="text-task-completion-rate">{taskCompletionRate}%</div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                  </div>
                </div>
                <Progress value={taskCompletionRate} className="mt-2 h-1" />
              </CardContent>
            </Card>
          </StaggerItem>
        )}
      </StaggerContainer>

      {!isEmptyState && totalTasksCount > 0 && taskStatusDistribution.length > 0 && (
        <Card className="border-0 shadow-sm" data-testid="card-task-status-breakdown">
          <CardContent className="p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Task Status Breakdown</div>
            <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
              {taskStatusDistribution.map(({ status, count }) => {
                const pct = (count / totalTasksCount) * 100;
                const s = status.toLowerCase();
                let barColor = "bg-gray-400";
                if (s === "completed" || s === "done" || s === "closed") barColor = "bg-green-500";
                else if (s === "in_progress" || s === "in progress" || s === "active" || s === "execution" || s === "monitoring") barColor = "bg-blue-500";
                else if (s === "on_hold" || s === "on hold" || s === "blocked") barColor = "bg-amber-500";
                else if (s === "not_started" || s === "not started" || s === "pending" || s === "open" || s === "initiation" || s === "planning") barColor = "bg-gray-400";
                return (
                  <div key={status} className={`${barColor} rounded-sm`} style={{ width: `${pct}%` }} title={`${status}: ${count}`} />
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 flex-wrap">
              {taskStatusDistribution.map(({ status, count }, idx) => (
                <span key={status} className="flex items-center gap-1 flex-wrap">
                  {idx > 0 && <span>·</span>}
                  <span className={getStatusColor(status).split(" ").filter(c => c.startsWith("text-")).join(" ")}>{count}</span>
                  <span>{status}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isEmptyState && myProjects.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="px-4 py-2">
            <div className="flex items-center justify-between gap-1">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-sm font-semibold">My Projects</CardTitle>
                {(projectHealthBreakdown.green > 0 || projectHealthBreakdown.yellow > 0 || projectHealthBreakdown.red > 0) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap" data-testid="project-health-summary">
                    {projectHealthBreakdown.green > 0 && (
                      <span className="text-green-600 dark:text-green-400">{projectHealthBreakdown.green} Green</span>
                    )}
                    {projectHealthBreakdown.green > 0 && (projectHealthBreakdown.yellow > 0 || projectHealthBreakdown.red > 0) && <span>·</span>}
                    {projectHealthBreakdown.yellow > 0 && (
                      <span className="text-yellow-600 dark:text-yellow-400">{projectHealthBreakdown.yellow} Yellow</span>
                    )}
                    {projectHealthBreakdown.yellow > 0 && projectHealthBreakdown.red > 0 && <span>·</span>}
                    {projectHealthBreakdown.red > 0 && (
                      <span className="text-red-600 dark:text-red-400">{projectHealthBreakdown.red} Red</span>
                    )}
                  </div>
                )}
              </div>
              <Link href="/projects">
                <Button variant="ghost" size="sm" data-testid="link-view-all-projects">
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {myProjects.slice(0, 8).map((project: Project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <div
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`project-card-${project.id}`}
                  >
                    <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${getHealthColor(project.health)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{project.name}</div>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{project.completionPercentage || 0}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isEmptyState && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="border-0 shadow-sm">
          <CardHeader className="px-4 py-2">
            <div className="flex items-center justify-between gap-1">
              <CardTitle className="text-sm font-semibold">My Tasks</CardTitle>
              <Link href="/tasks">
                <Button variant="ghost" size="sm" data-testid="link-view-all-tasks">
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            {assignedTasks.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-center">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                <p className="text-sm text-muted-foreground">No active tasks — create one from your project page</p>
              </div>
            ) : (
              <div className="space-y-1.5">
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
                  .slice(0, 4)
                  .map((item) => {
                    const endDate = item.task.endDate ? (typeof item.task.endDate === "string" ? parseISO(item.task.endDate) : item.task.endDate) : null;
                    const isOverdue = endDate && isBefore(endDate, today);
                    return (
                      <Link key={item.task.id} href={`/projects/${item.task.projectId}?tab=tasks&taskId=${item.task.id}`}>
                        <div
                          className={`flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer ${
                            isOverdue 
                              ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" 
                              : "bg-muted/50"
                          }`}
                          data-testid={`task-item-${item.task.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-foreground truncate">{item.task.name}</span>
                              {isOverdue && (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">Overdue</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                              <span className="truncate">{item.project.name}</span>
                              {endDate && (
                                <>
                                  <span>·</span>
                                  <span className={isOverdue ? "text-red-600 dark:text-red-400" : ""}>
                                    {format(endDate, "MMM d")}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                {assignedTasks.length > 4 && (
                  <Link href="/tasks">
                    <div className="text-center py-1">
                      <span className="text-xs text-muted-foreground">+{assignedTasks.length - 4} more</span>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="px-4 py-2">
            <div className="flex items-center justify-between gap-1">
              <CardTitle className="text-sm font-semibold">My Issues</CardTitle>
              <Link href="/issues">
                <Button variant="ghost" size="sm" data-testid="link-view-all-issues">
                  View All <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            {myIssues.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-center">
                <CheckCircle2 className="h-5 w-5 text-green-500 mr-2" />
                <p className="text-sm text-muted-foreground">No open issues — report one from your project page</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {[...myIssues]
                  .sort((a: Issue, b: Issue) => {
                    const aOverdue = a.targetResolutionDate && isBefore(typeof a.targetResolutionDate === "string" ? parseISO(a.targetResolutionDate) : a.targetResolutionDate, today);
                    const bOverdue = b.targetResolutionDate && isBefore(typeof b.targetResolutionDate === "string" ? parseISO(b.targetResolutionDate) : b.targetResolutionDate, today);
                    if (aOverdue && !bOverdue) return -1;
                    if (!aOverdue && bOverdue) return 1;
                    return 0;
                  })
                  .slice(0, 4).map((issue: Issue) => {
                  const isOverdueIssue = issue.targetResolutionDate && isBefore(
                    typeof issue.targetResolutionDate === "string" ? parseISO(issue.targetResolutionDate) : issue.targetResolutionDate,
                    today
                  );
                  return (
                    <Link key={issue.id} href={`/projects/${issue.projectId}?tab=issues&issueId=${issue.id}`}>
                      <div
                        className={`flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer ${
                          isOverdueIssue
                            ? "bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                            : "bg-muted/50"
                        }`}
                        data-testid={`issue-item-${issue.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-foreground truncate">{issue.title}</span>
                            <Badge variant="outline" className={`text-[10px] px-1 py-0 ${getPriorityColor(issue.priority)}`}>
                              {issue.priority || "Medium"}
                            </Badge>
                            {isOverdueIssue && (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400 text-[10px] px-1 py-0">
                                Overdue
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{issue.itemType === "risk" ? "Risk" : "Issue"}</span>
                            <span>·</span>
                            <span className="truncate">{issue.status || "Open"}</span>
                          </div>
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      </div>
                    </Link>
                  );
                })}
                {myIssues.length > 4 && (
                  <Link href="/issues">
                    <div className="text-center py-1">
                      <span className="text-xs text-muted-foreground">+{myIssues.length - 4} more</span>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </>
      )}

      {!isEmptyState && recentlyCompletedTasks.length > 0 && (
        <Card className="border-0 shadow-sm" data-testid="card-recently-completed">
          <CardHeader className="px-4 py-2">
            <CardTitle className="text-sm font-semibold">Recently Completed</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="space-y-1.5">
              {recentlyCompletedTasks.map((item) => (
                <Link key={item.task.id} href={`/projects/${item.task.projectId}?tab=tasks&taskId=${item.task.id}`}>
                  <div
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`completed-task-${item.task.id}`}
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{item.task.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.project.name}</div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isEmptyState && (
      <div className={`grid grid-cols-1 gap-3 ${upcomingMilestones.length > 0 && recentActivity && recentActivity.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="px-4 py-2">
            <div className="flex items-center justify-between gap-1">
              <CardTitle className="text-sm font-semibold">Upcoming Deadlines</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            {upcomingDeadlines.length === 0 ? (
              <div className="flex items-center justify-center py-4 text-center">
                <Calendar className="h-5 w-5 text-muted-foreground mr-2" />
                <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingDeadlines.slice(0, 5).map((deadline) => {
                  const daysUntil = differenceInDays(deadline.dueDate, today);
                  const isUrgent = daysUntil <= 3;
                  return (
                    <Link key={deadline.id} href={deadline.type === "task" ? `/projects/${deadline.projectId}?tab=tasks&taskId=${deadline.rawId}` : `/projects/${deadline.projectId}?tab=milestones`}>
                      <div
                        className="flex items-center gap-2 p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                        data-testid={`deadline-item-${deadline.id}`}
                      >
                        <div className={`flex h-6 w-6 items-center justify-center rounded flex-shrink-0 ${
                          deadline.type === "milestone" ? "bg-purple-500/10" : "bg-blue-500/10"
                        }`}>
                          {deadline.type === "milestone" ? (
                            <Target className="h-3.5 w-3.5 text-purple-600" />
                          ) : (
                            <ListTodo className="h-3.5 w-3.5 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{deadline.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{deadline.projectName}</div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1 py-0 flex-shrink-0 ${isUrgent ? "bg-red-500/10 text-red-700 dark:text-red-400" : daysUntil <= 7 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-blue-500/10 text-blue-700 dark:text-blue-400"}`}
                        >
                          {daysUntil === 0 ? "Today" : daysUntil === 1 ? "1d" : `${daysUntil}d`}
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
          <CardHeader className="px-4 py-2">
            <div className="flex items-center justify-between gap-1">
              <CardTitle className="text-sm font-semibold">Timesheet</CardTitle>
              <Link href="/timesheets">
                <Button variant="ghost" size="sm" data-testid="link-view-timesheets">
                  Open <ChevronRight className="ml-0.5 h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{totalHoursThisWeek}h / {weeklyTarget}h</span>
                <span className="text-muted-foreground">{Math.round(progressPercent)}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
              <div className="grid grid-cols-7 gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                  const date = addDays(weekStart, dayOffset);
                  const dateKey = format(date, "yyyy-MM-dd");
                  const dayHours = timesheetEntries?.filter((e) => e.entryDate === dateKey).reduce((sum, e) => sum + (Number(e.hours) || 0), 0) || 0;
                  const isToday = format(today, "yyyy-MM-dd") === dateKey;
                  return (
                    <div key={dayOffset} className="text-center">
                      <div className={`text-[10px] ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                        {format(date, "EEE")}
                      </div>
                      <div
                        className={`rounded p-1 text-xs font-medium ${
                          dayHours > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        } ${isToday ? "ring-1 ring-primary" : ""}`}
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

        {upcomingMilestones.length > 0 && (
          <Card className="border-0 shadow-sm" data-testid="card-upcoming-milestones">
            <CardHeader className="px-4 py-2">
              <CardTitle className="text-sm font-semibold">Upcoming Key Dates</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <div className="space-y-1.5">
                {upcomingMilestones.map((m) => {
                  const project = allProjects?.find((p: Project) => p.id === m.projectId);
                  const daysUntil = m.parsedDueDate ? differenceInDays(m.parsedDueDate, today) : null;
                  return (
                    <Link key={m.id} href={`/projects/${m.projectId}?tab=milestones`}>
                      <div
                        className="flex items-center gap-2 p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                        data-testid={`milestone-item-${m.id}`}
                      >
                        <div className="flex h-6 w-6 items-center justify-center rounded flex-shrink-0 bg-purple-500/10">
                          <Target className="h-3.5 w-3.5 text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{m.title}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                            <span className="truncate">{project?.name || "Unknown"}</span>
                            {m.parsedDueDate && (
                              <>
                                <span>·</span>
                                <span>{format(m.parsedDueDate, "MMM d")}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {daysUntil !== null && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 flex-shrink-0 ${daysUntil <= 3 ? "bg-red-500/10 text-red-700 dark:text-red-400" : daysUntil <= 7 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-purple-500/10 text-purple-700 dark:text-purple-400"}`}
                          >
                            {daysUntil === 0 ? "Today" : daysUntil === 1 ? "1d" : `${daysUntil}d`}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {recentActivity && recentActivity.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="px-4 py-2">
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <div className="space-y-1.5">
                {recentActivity.slice(0, 5).map((activity) => (
                  <Link key={activity.id} href={`/projects/${activity.entityId}`}>
                    <div
                      className="flex items-start gap-2 p-2 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                      data-testid={`activity-item-${activity.id}`}
                    >
                      <Activity className="h-3.5 w-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground">
                          <span className="font-medium">{activity.changedBy}</span>{" "}
                          <span className="text-muted-foreground">{activity.summary}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {activity.entityName}
                          {activity.changedAt && ` · ${formatDistanceToNow(new Date(activity.changedAt), { addSuffix: true })}`}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
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
    </PageTransition>
  );
}

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
}

function HomeQuickAddTaskDialog({ open, onOpenChange, projects }: QuickAddDialogProps) {
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

function HomeQuickAddIssueDialog({ open, onOpenChange, projects }: QuickAddDialogProps) {
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
