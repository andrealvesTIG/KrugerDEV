import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Link } from "wouter";
import plannerLogoPath from "@/assets/planner-logo.png";
import msprojectLogoPath from "@/assets/msproject-logo.png"; 
import { usePaginatedTasks, useTasks, useCreateTask, useUpdateTask, useDeleteTask, useTaskHistory } from "@/hooks/use-tasks";
import { TaskDependenciesSection, type TaskDependenciesSectionHandle, type PendingDepChange } from "@/components/TaskDependenciesSection";
import { CrossProjectReferences } from "@/components/CrossProjectReferences";
import { useUpdateTaskDependency } from "@/hooks/use-tasks"; 
import { useExternalTasks } from "@/hooks/use-external-shares";
import { ExternalBadge } from "@/components/ExternalBadge";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { useTaskResourceAssignments, useUpdateTaskResourceAssignments, useResources, useAllTaskResourceAssignments, useOrgFullTaskAssignments } from "@/hooks/use-resources";
import type { TaskResourceAssignment, Resource } from "@shared/schema";
import { ResourceAssignment, ResourceAllocation } from "@/components/ResourceAssignment";
import { MicrosoftContactCard } from "@/components/MicrosoftContactCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DurationInput } from "@/components/ui/duration-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, Trash2, GanttChart, Columns3, Calendar as CalendarIcon, History, Clock, Filter, Layers, ChevronDown, ChevronRight, FolderKanban, Briefcase, MoreVertical, ZoomIn, ZoomOut, Check, X, Indent, Outdent, MoreHorizontal, Search, User as UserIcon, TrendingUp, TrendingDown, Timer, RefreshCw, Lock as LockIcon, Crown, Cloud, FileSpreadsheet, Milestone as MilestoneIcon } from "lucide-react";
import { PageTransition, FadeIn } from "@/components/ui/page-transition";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, addDays, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, parseISO } from "date-fns";
import { calculateEndDateFromWorkingDays, calculateDurationInWorkingDays, parseDurationInput, formatDuration } from "@/lib/workingDays";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertTaskSchema, type Task, TASK_STATUSES, TASK_STATUS, DEFAULT_TASK_STATUS } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { applyServerErrorsToForm } from "@/lib/serverErrors";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";

const ProjectGanttView = lazy(() => import("@/components/project/ProjectGanttView"));

const statusColors = {
  [TASK_STATUS.NOT_STARTED]: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  [TASK_STATUS.IN_PROGRESS]: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  [TASK_STATUS.COMPLETED]: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type GroupBy = "project" | "portfolio" | "resource";

export default function Tasks() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { tasks: allTasks, isLoading, hasMore, isLoadingMore, loadMore, total, refetch } = usePaginatedTasks(100, currentOrganization?.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: externalTasks } = useExternalTasks();
  const { data: projects } = useProjects(currentOrganization?.id);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const [view, setView] = useState<"gantt" | "kanban">("gantt");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [durationInput, setDurationInput] = useState<string>("1d");
  const [filterProjectId, setFilterProjectId] = useState<number | null>(null);
  const [projectFilterSearch, setProjectFilterSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("project");
  const [searchQuery, setSearchQuery] = useState("");
  const [myAssignmentsOnly, setMyAssignmentsOnly] = useState(false);
  const [deleteTaskData, setDeleteTaskData] = useState<Task | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMilestone, setIsMilestone] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [resourceAllocations, setResourceAllocations] = useState<ResourceAllocation[]>([]);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const { data: editingTaskProjectTasks } = useTasks(editingTask?.projectId || 0);
  const { data: taskAssignments } = useTaskResourceAssignments(editingTask?.id ?? null);
  const { data: orgResources } = useResources(currentOrganization?.id ?? null);
  const { data: allTaskAssignments } = useAllTaskResourceAssignments(currentOrganization?.id ?? null);
  const { toast } = useToast();
  const lastInitializedTaskId = useRef<number | null>(null);
  // Track when an invite already assigned resources to prevent form from overwriting
  const inviteAssignedRef = useRef(false);
  const depsRef = useRef<TaskDependenciesSectionHandle>(null);
  const [pendingDepChanges, setPendingDepChanges] = useState<Map<number, PendingDepChange>>(new Map());
  const updateDependency = useUpdateTaskDependency();

  // Only sync selectedResourceIds and allocations from server on INITIAL load for a task
  // Don't overwrite user changes when query refetches
  useEffect(() => {
    if (taskAssignments && editingTask && lastInitializedTaskId.current !== editingTask.id) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
      setResourceAllocations(taskAssignments.map(a => ({
        resourceId: a.resourceId,
        allocationPercentage: a.allocationPercentage ?? 100
      })));
      lastInitializedTaskId.current = editingTask.id;
    }
  }, [taskAssignments, editingTask]);

  const handleDeleteTaskFromKanban = (task: Task) => {
    setDeleteTaskData(task);
  };

  // Find current user's resource ID for "My Assignments" filter
  // Try matching by userId first, then fall back to matching by email
  const myResourceId = useMemo(() => {
    if (!user?.id || !orgResources) return null;
    // First try to find by userId (direct link)
    let myResource = orgResources.find(r => r.userId === user.id);
    // If not found, try matching by email address
    if (!myResource && user.email) {
      myResource = orgResources.find(r => normalizeSearch(r.email) === normalizeSearch(user.email));
    }
    return myResource?.id ?? null;
  }, [user?.id, user?.email, orgResources]);

  // Build set of task IDs assigned to current user
  const myTaskIds = useMemo(() => {
    if (!myResourceId || !allTaskAssignments) return new Set<number>();
    return new Set(
      allTaskAssignments
        .filter(a => a.resourceId === myResourceId)
        .map(a => a.taskId)
    );
  }, [myResourceId, allTaskAssignments]);

  const projectIds = useMemo(() => new Set(projects?.map(p => p.id) || []), [projects]);
  const tasks = useMemo(() => {
    // Combine org tasks with external tasks
    let filteredTasks = [
      ...(allTasks || []),
      ...(externalTasks || [])
    ];
    
    // Filter by project
    if (filterProjectId) {
      filteredTasks = filteredTasks.filter(task => task.projectId === filterProjectId);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = normalizeSearch(searchQuery).trim();
      filteredTasks = filteredTasks.filter(task => 
        normalizeSearch(task.name).includes(query) ||
        normalizeSearch(task.description).includes(query) ||
        normalizeSearch(task.assignee).includes(query) ||
        normalizeSearch(task.status).includes(query)
      );
    }
    
    // Filter to only my assignments
    if (myAssignmentsOnly && myResourceId) {
      filteredTasks = filteredTasks.filter(task => myTaskIds.has(task.id));
    }
    
    return filteredTasks;
  }, [allTasks, externalTasks, filterProjectId, searchQuery, myAssignmentsOnly, myResourceId, myTaskIds]);

  const projectMap = useMemo(() => {
    const map = new Map<number, { name: string; portfolioId: number | null; source?: string | null }>();
    projects?.forEach(p => map.set(p.id, { name: p.name, portfolioId: p.portfolioId, source: p.source }));
    return map;
  }, [projects]);

  const portfolioMap = useMemo(() => {
    const map = new Map<number, string>();
    portfolios?.forEach(p => map.set(p.id, p.name));
    return map;
  }, [portfolios]);

  type TaskGroup = { id: string; name: string; icon: "project" | "portfolio" | "resource"; tasks: Task[]; projectId?: number; source?: string | null };

  // Build map of taskId -> resourceIds for resource grouping
  const taskToResources = useMemo(() => {
    const map = new Map<number, { resourceId: number; resourceName: string }[]>();
    allTaskAssignments?.forEach(a => {
      if (!map.has(a.taskId)) map.set(a.taskId, []);
      map.get(a.taskId)!.push({ resourceId: a.resourceId, resourceName: a.resourceName });
    });
    return map;
  }, [allTaskAssignments]);

  const groupedTasks = useMemo((): TaskGroup[] => {
    if (groupBy === "project") {
      const groups = new Map<number, Task[]>();
      tasks.forEach(task => {
        if (!groups.has(task.projectId)) groups.set(task.projectId, []);
        groups.get(task.projectId)!.push(task);
      });
      return Array.from(groups.entries()).map(([projectId, projectTasks]) => {
        const project = projectMap.get(projectId);
        return {
          id: `project-${projectId}`,
          name: project?.name || "Unknown Project",
          icon: "project" as const,
          tasks: projectTasks,
          projectId,
          source: project?.source,
        };
      });
    }
    
    if (groupBy === "portfolio") {
      const groups = new Map<number | null, Task[]>();
      tasks.forEach(task => {
        const portfolioId = projectMap.get(task.projectId)?.portfolioId || null;
        if (!groups.has(portfolioId)) groups.set(portfolioId, []);
        groups.get(portfolioId)!.push(task);
      });
      return Array.from(groups.entries()).map(([portfolioId, portfolioTasks]) => ({
        id: portfolioId ? `portfolio-${portfolioId}` : "no-portfolio",
        name: portfolioId ? (portfolioMap.get(portfolioId) || "Unknown Portfolio") : "Unassigned",
        icon: "portfolio" as const,
        tasks: portfolioTasks,
      }));
    }
    
    if (groupBy === "resource") {
      const groups = new Map<number | null, Task[]>();
      const resourceNames = new Map<number, string>();
      
      tasks.forEach(task => {
        const assignments = taskToResources.get(task.id);
        if (assignments && assignments.length > 0) {
          // Add task to each assigned resource's group
          assignments.forEach(a => {
            if (!groups.has(a.resourceId)) groups.set(a.resourceId, []);
            groups.get(a.resourceId)!.push(task);
            resourceNames.set(a.resourceId, a.resourceName);
          });
        } else {
          // Unassigned tasks
          if (!groups.has(null)) groups.set(null, []);
          groups.get(null)!.push(task);
        }
      });
      
      return Array.from(groups.entries()).map(([resourceId, resourceTasks]) => ({
        id: resourceId ? `resource-${resourceId}` : "unassigned",
        name: resourceId ? (resourceNames.get(resourceId) || "Unknown Resource") : "Unassigned",
        icon: "resource" as const,
        tasks: resourceTasks,
      }));
    }
    
    // Default to project grouping
    const groups = new Map<number, Task[]>();
    tasks.forEach(task => {
      if (!groups.has(task.projectId)) groups.set(task.projectId, []);
      groups.get(task.projectId)!.push(task);
    });
    return Array.from(groups.entries()).map(([projectId, projectTasks]) => {
      const project = projectMap.get(projectId);
      return {
        id: `project-${projectId}`,
        name: project?.name || "Unknown Project",
        icon: "project" as const,
        tasks: projectTasks,
        projectId,
        source: project?.source,
      };
    });
  }, [tasks, groupBy, projectMap, portfolioMap, taskToResources]);

  const taskFormSchema = insertTaskSchema.extend({
    name: z.string().min(1, "Task name is required")
  });

  const form = useForm({
    resolver: zodResolver(taskFormSchema),
    mode: "onChange",
    defaultValues: {
      projectId: undefined as any,
      name: "",
      description: "",
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: calculateEndDateFromWorkingDays(format(new Date(), 'yyyy-MM-dd'), 1),
      durationDays: 1,
      progress: 0,
      status: DEFAULT_TASK_STATUS,
      assignee: "",
      baselineStartDate: null as string | null,
      baselineEndDate: null as string | null,
      timesheetBlocked: false,
    }
  });

  const durationDays = parseDurationInput(durationInput);
  
  const recalculateEndDate = (newStartDate: string, newDuration: number | null) => {
    if (newStartDate && newDuration !== null && newDuration >= 0) {
      if (newDuration === 0) {
        form.setValue("endDate", newStartDate, { shouldDirty: true, shouldValidate: true });
      } else {
        const newEnd = calculateEndDateFromWorkingDays(newStartDate, newDuration);
        form.setValue("endDate", newEnd, { shouldDirty: true, shouldValidate: true });
      }
      form.setValue("durationDays", newDuration, { shouldDirty: true, shouldValidate: true });
    }
  };
  
  const handleDurationBlur = () => {
    const parsed = parseDurationInput(durationInput);
    if (parsed === null || parsed < 0) {
      setDurationInput("1d");
    } else if (parsed > 365) {
      setDurationInput("365d");
    } else {
      setDurationInput(formatDuration(parsed));
    }
  };

  const openEditDialog = (task: Task) => {
    setPendingDepChanges(new Map());
    setEditingTask(task);
    const taskDuration = task.durationDays ?? (task.startDate && task.endDate 
      ? calculateDurationInWorkingDays(task.startDate, task.endDate) 
      : 1);
    setDurationInput(formatDuration(taskDuration));
    setIsMilestone(task.isMilestone || false);
    form.reset({
      projectId: task.projectId,
      name: task.name,
      description: task.description || "",
      startDate: task.startDate ?? undefined,
      endDate: task.endDate ?? undefined,
      durationDays: taskDuration,
      progress: task.progress || 0,
      status: task.status || DEFAULT_TASK_STATUS,
      assignee: task.assignee || "",
      baselineStartDate: task.baselineStartDate || null,
      baselineEndDate: task.baselineEndDate || null,
      timesheetBlocked: task.timesheetBlocked || false,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTask(null);
    setDurationInput("1d");
    setIsMilestone(false);
    setSelectedResourceIds([]);
    lastInitializedTaskId.current = null; // Reset to allow re-initialization
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    form.reset({
      projectId: projects && projects.length > 0 ? projects[0].id : undefined as any,
      name: "",
      description: "",
      startDate: todayStr,
      endDate: calculateEndDateFromWorkingDays(todayStr, 1),
      durationDays: 1,
      progress: 0,
      status: DEFAULT_TASK_STATUS,
      assignee: "",
      baselineStartDate: null,
      baselineEndDate: null,
      timesheetBlocked: false,
    });
    setIsDialogOpen(true);
  };

  const setBaselineFromCurrentDates = () => {
    const startDate = form.getValues("startDate");
    const endDate = form.getValues("endDate");
    form.setValue("baselineStartDate", startDate, { shouldDirty: true });
    form.setValue("baselineEndDate", endDate, { shouldDirty: true });
    toast({ 
      title: "Baseline Set", 
      description: "Current dates have been saved as baseline" 
    });
  };

  const clearBaseline = () => {
    form.setValue("baselineStartDate", null, { shouldDirty: true });
    form.setValue("baselineEndDate", null, { shouldDirty: true });
    toast({ 
      title: "Baseline Cleared", 
      description: "Baseline dates have been removed" 
    });
  };

  const calculateVariance = () => {
    const baselineEnd = form.watch("baselineEndDate");
    const actualEnd = form.watch("endDate");
    if (!baselineEnd || !actualEnd) return null;
    try {
      const baseline = parseISO(baselineEnd);
      const actual = parseISO(actualEnd);
      return differenceInDays(actual, baseline);
    } catch {
      return null;
    }
  };

  const onSubmit = (data: any) => {
    const projectId = Number(data.projectId);
    if (!projectId || isNaN(projectId)) {
      toast({ 
        title: "Validation Error", 
        description: "Please select a valid project.", 
        variant: "destructive" 
      });
      return;
    }

    const taskData = {
      projectId,
      name: data.name,
      description: data.description || null,
      startDate: data.startDate,
      endDate: data.endDate,
      durationDays: durationDays ?? 1,
      progress: data.progress || 0,
      status: data.status || DEFAULT_TASK_STATUS,
      assignee: data.assignee || null,
      baselineStartDate: data.baselineStartDate || null,
      baselineEndDate: data.baselineEndDate || null,
      isMilestone: isMilestone,
    };

    if (editingTask) {
      const depChangesToApply = Array.from(pendingDepChanges.values());

      updateTask.mutate({ id: editingTask.id, ...taskData }, {
        onSuccess: (result) => {
          if (!inviteAssignedRef.current) {
            updateTaskResources.mutate({ 
              taskId: editingTask.id, 
              resourceIds: selectedResourceIds,
              allocations: resourceAllocations,
              expectedUpdatedAt: editingTask.updatedAt ? new Date(editingTask.updatedAt).toISOString() : undefined,
            });
          }
          inviteAssignedRef.current = false;

          if (depChangesToApply.length > 0) {
            let completed = 0;
            for (const change of depChangesToApply) {
              updateDependency.mutate(
                { taskId: editingTask.id, dependsOnTaskId: change.dependsOnTaskId, dependencyType: change.dependencyType, lagDays: change.lagDays, projectId: editingTask.projectId },
                {
                  onSuccess: () => {
                    completed++;
                    if (completed === depChangesToApply.length) {
                      toast({ title: "Success", description: "Task and dependencies updated" });
                    }
                  },
                  onError: (error: any) => {
                    toast({ title: "Error", description: error?.message || "Failed to update dependency", variant: "destructive" });
                  }
                }
              );
            }
          } else if (result?.datesCorrectedByDependency) {
            toast({ title: "Dates adjusted", description: "The start date was adjusted to respect task dependencies", variant: "default" });
          } else {
            toast({ title: "Success", description: "Task updated" });
          }

          setPendingDepChanges(new Map());
          setIsDialogOpen(false);
          setEditingTask(null);
        },
        onError: (error: any) => {
          const msg = error?.message || "Failed to update task";
          // Map server-side validation errors (e.g. invalid status enum) to
          // their form fields so users see them inline.
          const { appliedFields, unknownMessage } = applyServerErrorsToForm(
            form,
            msg,
            ["name", "description", "status", "progress", "projectId", "startDate", "endDate", "durationDays", "baselineStartDate", "baselineEndDate"],
          );
          if (appliedFields.length === 0 || unknownMessage) {
            toast({ title: "Error", description: unknownMessage || msg, variant: "destructive" });
          }
        }
      });
    } else {
      createTask.mutate(taskData, {
        onSuccess: (newTask: any) => {
          if (selectedResourceIds.length > 0 && newTask?.id) {
            updateTaskResources.mutate({ 
              taskId: newTask.id, 
              resourceIds: selectedResourceIds,
              allocations: resourceAllocations 
            });
          }
          toast({ title: "Success", description: "Task created" });
          setIsDialogOpen(false);
        },
        onError: (error: any) => {
          if (error?.limitExceeded) {
            setLimitError({ message: error.message, resourceType: error.resourceType });
            setLimitDialogOpen(true);
            setIsDialogOpen(false);
          } else {
            const msg = error?.message || "Failed to create task";
            const { appliedFields, unknownMessage } = applyServerErrorsToForm(
              form,
              msg,
              ["name", "description", "status", "progress", "projectId", "startDate", "endDate", "durationDays", "baselineStartDate", "baselineEndDate"],
            );
            if (appliedFields.length === 0 || unknownMessage) {
              toast({ title: "Error", description: unknownMessage || msg, variant: "destructive" });
            }
          }
        }
      });
    }
  };

  if (isLoading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <>
      <LimitExceededDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        resourceType={limitError?.resourceType}
        message={limitError?.message}
      />
    <PageTransition className="space-y-4">
      {(() => {
        const tasksWithEffort = (allTasks || []).filter(t => t.estimatedHours || t.actualHours);
        if (tasksWithEffort.length === 0) return null;
        const totalEstimated = (allTasks || []).reduce((sum, t) => sum + (t.estimatedHours ? Number(t.estimatedHours) : 0), 0);
        const totalActual = (allTasks || []).reduce((sum, t) => sum + (t.actualHours ? Number(t.actualHours) : 0), 0);
        const variance = totalActual - totalEstimated;
        const ratio = totalEstimated > 0 ? Math.round((totalActual / totalEstimated) * 100) : 0;
        const isOver = variance > 0;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="effort-summary-section">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Estimated Hours</span>
                </div>
                <div className="text-xl font-semibold text-foreground" data-testid="text-total-estimated-hours">
                  {totalEstimated.toFixed(1)}h
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Actual Hours</span>
                </div>
                <div className="text-xl font-semibold text-foreground" data-testid="text-total-actual-hours">
                  {totalActual.toFixed(1)}h
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  {isOver ? <TrendingUp className="h-4 w-4 text-rose-500" /> : <TrendingDown className="h-4 w-4 text-emerald-500" />}
                  <span className="text-xs text-muted-foreground">Variance</span>
                </div>
                <div className={cn("text-xl font-semibold", isOver ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")} data-testid="text-effort-variance">
                  {isOver ? '+' : ''}{variance.toFixed(1)}h
                </div>
                <Badge variant="outline" className={cn("mt-1 text-xs", isOver ? "text-rose-600 border-rose-200 dark:text-rose-400 dark:border-rose-800" : "text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800")}>
                  {isOver ? 'Over budget' : 'Under budget'}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">Utilization</span>
                </div>
                <div className="text-xl font-semibold text-foreground" data-testid="text-effort-ratio">
                  {ratio}%
                </div>
                <Progress value={Math.min(ratio, 100)} className="mt-2 h-2" />
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-display font-bold text-foreground">Tasks</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              setIsRefreshing(true);
              await refetch();
              setIsRefreshing(false);
            }}
            disabled={isRefreshing}
            data-testid="button-refresh-tasks"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[140px] h-9"
              data-testid="input-search-tasks"
            />
          </div>
          <Tabs value={view} onValueChange={(v) => setView(v as "gantt" | "kanban")}>
            <TabsList className="h-9">
              <TabsTrigger value="gantt" className="gap-1.5 px-2.5" data-testid="tab-gantt">
                <GanttChart className="h-4 w-4" />
                Gantt
              </TabsTrigger>
              <TabsTrigger value="kanban" className="gap-1.5 px-2.5" data-testid="tab-kanban">
                <Columns3 className="h-4 w-4" />
                Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button
            variant={myAssignmentsOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setMyAssignmentsOnly(!myAssignmentsOnly)}
            disabled={!myResourceId}
            className="gap-2"
            data-testid="button-my-assignments"
          >
            <UserIcon className="h-4 w-4" />
            <span className="hidden sm:inline">My Assignments</span>
            {myAssignmentsOnly && myResourceId && (
              <Badge variant="secondary" className="text-xs">
                {tasks.length}
              </Badge>
            )}
          </Button>
          
          <DropdownMenu onOpenChange={(open) => { if (!open) setProjectFilterSearch(""); }}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" data-testid="button-task-options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="max-w-[240px]">
                  <Filter className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">
                    Filter: {filterProjectId ? projects?.find(p => p.id === filterProjectId)?.name || "Project" : "All Projects"}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-0 w-64">
                  <div className="p-2 border-b" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search projects..."
                        value={projectFilterSearch}
                        onChange={(e) => setProjectFilterSearch(e.target.value)}
                        className="h-8 pl-8 text-sm"
                        aria-label="Search projects"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto p-1" style={{ maxHeight: '300px' }}>
                    <DropdownMenuRadioGroup value={filterProjectId ? String(filterProjectId) : "all"} onValueChange={(v) => setFilterProjectId(v === "all" ? null : Number(v))}>
                      <DropdownMenuRadioItem value="all">All Projects</DropdownMenuRadioItem>
                      {projects
                        ?.filter(p => !projectFilterSearch || normalizeSearch(p.name).includes(normalizeSearch(projectFilterSearch)))
                        .map(p => (
                          <DropdownMenuRadioItem key={p.id} value={String(p.id)}>
                            <div className="truncate max-w-[200px]" title={p.name}>{p.name}</div>
                          </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                    {projects?.filter(p => !projectFilterSearch || normalizeSearch(p.name).includes(normalizeSearch(projectFilterSearch))).length === 0 && (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">No projects found</div>
                    )}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Layers className="h-4 w-4 mr-2" />
                  Group: {groupBy === "project" ? "By Project" : groupBy === "portfolio" ? "By Portfolio" : "By Resource"}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                    <DropdownMenuRadioItem value="project">
                      <FolderKanban className="h-4 w-4 mr-2" />
                      By Project
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="portfolio">
                      <Briefcase className="h-4 w-4 mr-2" />
                      By Portfolio
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="resource">
                      <UserIcon className="h-4 w-4 mr-2" />
                      By Resource
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" data-testid="button-add-task">
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Add Task</span>
          </Button>

          <CreateTaskDialog
            open={isCreateDialogOpen}
            onOpenChange={setIsCreateDialogOpen}
            organizationId={currentOrganization?.id ?? null}
          />

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setPendingDepChanges(new Map()); setEditingTask(null); } }}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>{editingTask ? "Edit Task" : "Add New Task"}</DialogTitle>
                <DialogDescription className="sr-only">
                  {editingTask ? "Modify the task details below." : "Fill in the details to create a new task."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
                <div className="space-y-2 pb-3">
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Controller control={form.control} name="projectId" render={({field, fieldState}) => (
                      <div className="space-y-1">
                        <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                          <SelectTrigger data-testid="select-task-project" className={cn(fieldState.error && "border-destructive")}>
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects?.map(p => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                <div className="truncate max-w-[400px]" title={p.name}>{p.name}</div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                      </div>
                    )} />
                  </div>
                  <div className="space-y-2">
                    <Label>Task Name</Label>
                    <Input {...form.register("name")} data-testid="input-task-name" className={cn(form.formState.errors.name && "border-destructive")} />
                    {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                  </div>
                </div>

                <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
                  <TabsList className="flex w-full flex-wrap h-auto gap-1 justify-start">
                    <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
                    <TabsTrigger value="schedule" className="text-xs">Schedule</TabsTrigger>
                    <TabsTrigger value="resources" className="text-xs">Resources</TabsTrigger>
                    <TabsTrigger value="dependencies" className="text-xs" disabled={!editingTask}>
                      <span className="sm:hidden">Deps</span>
                      <span className="hidden sm:inline">Dependencies</span>
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-y-auto py-4 min-h-[280px]">
                    <TabsContent value="details" className="mt-0 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Controller control={form.control} name="status" render={({field, fieldState}) => (
                            <>
                              <Select onValueChange={(val) => {
                                const prevStatus = field.value;
                                field.onChange(val);
                                if (val === TASK_STATUS.NOT_STARTED) {
                                  form.setValue("progress", 0);
                                } else if (val === TASK_STATUS.COMPLETED) {
                                  form.setValue("progress", 100);
                                } else if (val === TASK_STATUS.IN_PROGRESS && prevStatus === TASK_STATUS.COMPLETED) {
                                  form.setValue("progress", 50);
                                }
                              }} value={field.value || DEFAULT_TASK_STATUS}>
                                <SelectTrigger className={cn(fieldState.error && "border-destructive")}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {TASK_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>{status}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {fieldState.error && (
                                <p className="text-xs text-destructive">{fieldState.error.message}</p>
                              )}
                            </>
                          )} />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center justify-between">
                            Progress
                            <span className="text-muted-foreground text-xs font-normal">{form.watch("progress") || 0}%</span>
                          </Label>
                          <Controller control={form.control} name="progress" render={({field}) => (
                            <div className="h-9 flex items-center">
                              <Slider
                                value={[field.value || 0]}
                                onValueChange={(v) => {
                                  const newProgress = v[0];
                                  field.onChange(newProgress);
                                  const currentStatus = form.getValues("status");
                                  if (newProgress === 100) {
                                    form.setValue("status", TASK_STATUS.COMPLETED);
                                  } else if (newProgress === 0) {
                                    form.setValue("status", TASK_STATUS.NOT_STARTED);
                                  } else {
                                    if (currentStatus === TASK_STATUS.COMPLETED || currentStatus === TASK_STATUS.NOT_STARTED) {
                                      form.setValue("status", TASK_STATUS.IN_PROGRESS);
                                    }
                                  }
                                }}
                                min={0}
                                max={100}
                                step={5}
                                className="w-full"
                                data-testid="slider-task-progress"
                              />
                            </div>
                          )} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea {...form.register("description")} className="min-h-[80px] focus-visible:ring-inset" />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="isMilestone"
                          checked={isMilestone}
                          onCheckedChange={(checked) => setIsMilestone(checked === true)}
                          data-testid="checkbox-task-milestone"
                        />
                        <Label htmlFor="isMilestone" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                          <MilestoneIcon className="h-4 w-4 text-primary" />
                          Mark as Milestone
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Controller
                          control={form.control}
                          name="timesheetBlocked"
                          render={({ field }) => (
                            <Checkbox
                              id="task-timesheet-blocked"
                              checked={field.value || false}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                              data-testid="checkbox-task-timesheet-blocked"
                            />
                          )}
                        />
                        <Label htmlFor="task-timesheet-blocked" className="text-sm font-normal cursor-pointer">
                          Block timesheet entries
                        </Label>
                      </div>
                    </TabsContent>

                    <TabsContent value="schedule" className="mt-0 space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Controller 
                            control={form.control} 
                            name="startDate" 
                            render={({field}) => (
                              <Input 
                                type="date" 
                                value={field.value || ""}
                                onChange={(e) => {
                                  const newStartDate = e.target.value;
                                  field.onChange(newStartDate);
                                  recalculateEndDate(newStartDate, durationDays);
                                }}
                                onBlur={field.onBlur}
                                data-testid="input-task-start" 
                              />
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Duration</Label>
                          <DurationInput
                            value={durationInput}
                            onChange={(value, parsed) => {
                              setDurationInput(value);
                              if (parsed !== null && parsed >= 0) {
                                const currentStartDate = form.getValues("startDate");
                                recalculateEndDate(currentStartDate, parsed);
                              }
                            }}
                            data-testid="input-task-duration" 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>End Date</Label>
                          <Controller 
                            control={form.control} 
                            name="endDate" 
                            render={({field}) => {
                              const currentStartDate = form.getValues("startDate");
                              return (
                                <Input 
                                  type="date" 
                                  value={field.value || ""}
                                  min={currentStartDate || undefined}
                                  onChange={(e) => {
                                    const newEndDate = e.target.value;
                                    field.onChange(newEndDate);
                                    if (currentStartDate && newEndDate && newEndDate.length === 10) {
                                      try {
                                        const newDuration = calculateDurationInWorkingDays(currentStartDate, newEndDate);
                                        if (newDuration >= 0) {
                                          setDurationInput(formatDuration(newDuration));
                                          form.setValue("durationDays", newDuration, { shouldDirty: true, shouldValidate: true });
                                        }
                                      } catch {
                                      }
                                    }
                                  }}
                                  onBlur={field.onBlur}
                                  data-testid="input-task-end" 
                                />
                              );
                            }}
                          />
                        </div>
                      </div>

                      <div className="border-2 border-orange-200 dark:border-orange-800 rounded-md p-3 bg-orange-50/50 dark:bg-orange-950/30 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <Label className="text-sm font-medium flex items-center gap-2">
                              <CalendarIcon className="h-4 w-4 text-orange-600" />
                              Baseline Dates
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Track schedule variance against the original plan
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={setBaselineFromCurrentDates}
                              data-testid="button-set-baseline"
                            >
                              Set Baseline
                            </Button>
                            {(form.watch("baselineStartDate") || form.watch("baselineEndDate")) && (
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={clearBaseline}
                                data-testid="button-clear-baseline"
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {(form.watch("baselineStartDate") || form.watch("baselineEndDate")) ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Baseline Start</Label>
                                <Controller 
                                  control={form.control} 
                                  name="baselineStartDate" 
                                  render={({field}) => (
                                    <Input 
                                      type="date" 
                                      className="h-8 text-sm"
                                      value={field.value || ""}
                                      onChange={(e) => field.onChange(e.target.value || null)}
                                      data-testid="input-baseline-start" 
                                    />
                                  )}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Baseline End</Label>
                                <Controller 
                                  control={form.control} 
                                  name="baselineEndDate" 
                                  render={({field}) => (
                                    <Input 
                                      type="date" 
                                      className="h-8 text-sm"
                                      value={field.value || ""}
                                      onChange={(e) => field.onChange(e.target.value || null)}
                                      data-testid="input-baseline-end" 
                                    />
                                  )}
                                />
                              </div>
                            </div>
                            {(() => {
                              const variance = calculateVariance();
                              if (variance === null) return null;
                              return (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">Schedule Variance:</span>
                                  <Badge 
                                    variant={variance > 0 ? "destructive" : variance < 0 ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {variance > 0 ? `+${variance} days (late)` : variance < 0 ? `${variance} days (early)` : "On schedule"}
                                  </Badge>
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No baseline set. Click "Set Baseline" to save the current dates as baseline.
                          </p>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="resources" className="mt-0">
                      <ResourceAssignment
                        organizationId={currentOrganization?.id || null}
                        selectedResourceIds={selectedResourceIds}
                        onSelectionChange={setSelectedResourceIds}
                        allocations={resourceAllocations}
                        onAllocationsChange={setResourceAllocations}
                        showAllocations={true}
                        label="Assigned Resources"
                        projectId={editingTask?.projectId || form.watch("projectId")}
                        projectName={projectMap.get(editingTask?.projectId || form.watch("projectId") || 0)?.name}
                        taskId={editingTask?.id}
                        taskName={editingTask?.name || form.watch("name")}
                        onInviteAssigned={() => { inviteAssignedRef.current = true; }}
                      />
                    </TabsContent>

                    <TabsContent value="dependencies" className="mt-0">
                      {editingTask ? (
                        <div className="space-y-6">
                          <TaskDependenciesSection
                            ref={depsRef}
                            taskId={editingTask.id}
                            projectId={editingTask.projectId}
                            allTasks={editingTaskProjectTasks || []}
                            pendingChanges={pendingDepChanges}
                            onPendingChangesUpdate={setPendingDepChanges}
                          />
                          {currentOrganization?.id && (
                            <div className="border-t pt-4">
                              <CrossProjectReferences
                                entityType="task"
                                entityId={editingTask.id}
                                entityProjectId={editingTask.projectId}
                                organizationId={currentOrganization.id}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-8">
                          Save the task first to add dependencies
                        </div>
                      )}
                    </TabsContent>
                  </div>
                </Tabs>
                
                <DialogFooter className="pt-4 border-t sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {editingTask && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => setIsHistoryOpen(true)}
                        data-testid="button-view-history"
                      >
                        <History className="mr-2 h-4 w-4" />
                        History
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      type="submit" 
                      data-testid="button-save-task" 
                      disabled={createTask.isPending || updateTask.isPending || !form.formState.isValid}
                    >
                      {(createTask.isPending || updateTask.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingTask ? "Update Task" : "Save Task"}
                    </Button>
                    {editingTask && (
                      <Button 
                        type="button" 
                        variant="destructive" 
                        onClick={() => setShowDeleteConfirm(true)}
                        data-testid="button-delete-task"
                      >
                        Delete Task
                      </Button>
                    )}
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setPendingDepChanges(new Map());
                        setIsDialogOpen(false);
                        setEditingTask(null);
                      }}
                      data-testid="button-cancel-task"
                    >
                      Cancel
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          
          <TaskHistoryDialog 
            taskId={editingTask?.id || 0} 
            open={isHistoryOpen} 
            onOpenChange={setIsHistoryOpen} 
          />
          
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Task</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this task?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-delete-cancel">No</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (editingTask) {
                      deleteTask.mutate({ id: editingTask.id, projectId: editingTask.projectId }, {
                        onSuccess: () => {
                          toast({ title: "Deleted", description: "Task deleted" });
                          setShowDeleteConfirm(false);
                          setIsDialogOpen(false);
                          setEditingTask(null);
                        }
                      });
                    }
                  }}
                  data-testid="button-delete-confirm"
                >
                  Yes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <GroupedTasksView
        groupedTasks={groupedTasks}
        view={view}
        projects={projects || []}
        onTaskClick={openEditDialog}
        onStatusChange={(taskId, newStatus) => {
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            updateTask.mutate({ 
              id: taskId, 
              projectId: task.projectId, 
              status: newStatus 
            });
          }
        }}
        onDeleteTask={handleDeleteTaskFromKanban}
        organizationId={currentOrganization?.id ?? null}
      />

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <Button 
            onClick={() => loadMore()} 
            disabled={isLoadingMore}
            variant="outline"
            data-testid="button-load-more-tasks"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>Load More ({tasks.length} of {total} tasks)</>
            )}
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTaskData !== null} onOpenChange={(open) => !open && setDeleteTaskData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this task? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTaskData(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deleteTaskData) {
                  deleteTask.mutate({ id: deleteTaskData.id, projectId: deleteTaskData.projectId }, {
                    onSuccess: () => {
                      toast({ title: "Success", description: "Task moved to recycle bin" });
                      setDeleteTaskData(null);
                    }
                  });
                }
              }}
              disabled={deleteTask.isPending}
              data-testid="button-confirm-delete-task"
            >
              {deleteTask.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
    </>
  );
}

type TaskGroup = { id: string; name: string; icon: "project" | "portfolio" | "resource"; tasks: Task[]; projectId?: number; source?: string | null };

function GroupedTasksView({
  groupedTasks,
  view,
  projects,
  onTaskClick,
  onStatusChange,
  onDeleteTask,
  organizationId,
}: {
  groupedTasks: TaskGroup[];
  view: "gantt" | "kanban";
  projects: any[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onDeleteTask: (task: Task) => void;
  organizationId: number | null;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groupedTasks.map(g => g.id)));

  useEffect(() => {
    setExpandedGroups(new Set(groupedTasks.map(g => g.id)));
  }, [groupedTasks]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {groupedTasks.map(group => (
        <Card key={group.id}>
          <CardHeader 
            className="cursor-pointer py-3 hover-elevate"
            onClick={() => toggleGroup(group.id)}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <div className="flex items-center gap-2 pt-0.5 flex-shrink-0">
                  {expandedGroups.has(group.id) ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  {group.icon === "portfolio" ? (
                    <Briefcase className="h-4 w-4 text-primary" />
                  ) : group.icon === "resource" ? (
                    <UserIcon className="h-4 w-4 text-primary" />
                  ) : (
                    <FolderKanban className="h-4 w-4 text-primary" />
                  )}
                </div>
                <CardTitle className="text-base leading-snug flex-1 flex items-baseline gap-2 flex-wrap" title={group.name}>
                  <span>{group.name}</span>
                  {group.icon === "project" && group.projectId && (
                    <Link
                      href={`/projects/${group.projectId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-normal text-muted-foreground hover:text-primary hover:underline"
                    >
                      View project
                    </Link>
                  )}
                </CardTitle>
                <Badge variant="secondary" className="flex-shrink-0 mt-0.5">
                  {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          {expandedGroups.has(group.id) && (
            <CardContent className="pt-0">
              {view === "gantt" ? (
                <GroupGanttContent group={group} organizationId={organizationId} onTaskClick={onTaskClick} projects={projects} />
              ) : (
                <KanbanView 
                  tasks={group.tasks} 
                  projects={projects} 
                  onTaskClick={onTaskClick}
                  onStatusChange={onStatusChange}
                  onDeleteTask={onDeleteTask}
                  organizationId={organizationId}
                />
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

function GroupGanttContent({ group, organizationId, onTaskClick, projects }: { group: TaskGroup; organizationId: number | null; onTaskClick: (task: Task) => void; projects: any[] }) {
  const createTask = useCreateTask();

  const sortByTaskIndex = (taskList: Task[]) =>
    [...taskList].sort((a, b) => (a.taskIndex ?? 999999) - (b.taskIndex ?? 999999));

  const renderGantt = (projectId: number, tasks: Task[]) => (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ProjectGanttView
        tasks={sortByTaskIndex(tasks)}
        projectId={projectId}
        organizationId={organizationId}
        onTaskClick={onTaskClick}
        onDependencyLineClick={onTaskClick}
        onCreateTask={(name) => {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          createTask.mutate({
            projectId,
            name,
            startDate: todayStr,
            endDate: calculateEndDateFromWorkingDays(todayStr, 1),
            durationDays: 1,
            status: DEFAULT_TASK_STATUS,
            progress: 0,
          });
        }}
      />
    </Suspense>
  );

  if (group.projectId != null) {
    return renderGantt(group.projectId, group.tasks);
  }

  const subGroups = new Map<number, Task[]>();
  group.tasks.forEach(task => {
    if (!subGroups.has(task.projectId)) subGroups.set(task.projectId, []);
    subGroups.get(task.projectId)!.push(task);
  });

  return (
    <div className="space-y-4">
      {Array.from(subGroups.entries()).map(([projectId, tasks]) => {
        const project = projects.find(p => p.id === projectId);
        return (
          <div key={projectId}>
            <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <FolderKanban className="h-3.5 w-3.5" />
              {project?.name || "Unknown Project"}
            </div>
            {renderGantt(projectId, tasks)}
          </div>
        );
      })}
    </div>
  );
}

function KanbanView({ 
  tasks, 
  projects, 
  onTaskClick, 
  onStatusChange,
  onDeleteTask,
  organizationId = null,
}: { 
  tasks: Task[]; 
  projects: any[]; 
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onDeleteTask: (task: Task) => void;
  organizationId?: number | null;
}) {
  const { data: orgTaskAssignments } = useOrgFullTaskAssignments(organizationId);
  const { data: orgResources } = useResources(organizationId);
  const [filterResourceId, setFilterResourceId] = useState<number | null>(null);
  const columns = [
    { id: TASK_STATUS.NOT_STARTED, label: TASK_STATUS.NOT_STARTED, color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
    { id: TASK_STATUS.IN_PROGRESS, label: TASK_STATUS.IN_PROGRESS, color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
    { id: TASK_STATUS.COMPLETED, label: TASK_STATUS.COMPLETED, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200" },
  ];

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const getProjectName = (projectId: number) => {
    return projects.find(p => p.id === projectId)?.name || "Unknown";
  };

  const filteredTasks = useMemo(() => {
    if (filterResourceId === null) return tasks;
    return tasks.filter(t => {
      const assignments = orgTaskAssignments?.filter(a => a.taskId === t.id);
      return assignments && assignments.some(a => a.resourceId === filterResourceId);
    });
  }, [tasks, filterResourceId, orgTaskAssignments]);

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = Number(event.active.id);
    const task = filteredTasks.find(t => t.id === taskId);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    
    const taskId = Number(active.id);
    const newStatus = String(over.id);
    const task = filteredTasks.find(t => t.id === taskId);
    
    if (task && task.status !== newStatus && columns.some(c => c.id === newStatus)) {
      onStatusChange(taskId, newStatus);
    }
  };

  const handleKeyboardMove = useCallback((taskId: number, direction: 'left' | 'right') => {
    const task = filteredTasks.find(t => t.id === taskId);
    if (!task) return;
    const currentStatus = task.status || "Not Started";
    const currentIdx = columns.findIndex(c => c.id === currentStatus);
    if (currentIdx === -1) return;
    const newIdx = direction === 'left' ? currentIdx - 1 : currentIdx + 1;
    if (newIdx < 0 || newIdx >= columns.length) return;
    onStatusChange(taskId, columns[newIdx].id);
  }, [filteredTasks, columns, onStatusChange]);

  return (
    <div className="space-y-3">
      {orgResources && orgResources.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Resource:</span>
          <Select 
            value={filterResourceId?.toString() || "all"} 
            onValueChange={(v) => setFilterResourceId(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="h-8 w-full sm:w-[180px] text-xs">
              <SelectValue placeholder="All Resources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Resources</SelectItem>
              {[...orgResources].sort((a, b) => a.displayName.localeCompare(b.displayName)).map(r => (
                <SelectItem key={r.id} value={r.id.toString()}>{r.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Columns3 className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No tasks to display</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {filterResourceId !== null ? "Try clearing the resource filter or add tasks to this group." : "Tasks will appear here once they are created."}
          </p>
        </div>
      ) : (
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map(column => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={filteredTasks.filter(t => (t.status || DEFAULT_TASK_STATUS) === column.id)}
                getProjectName={getProjectName}
                onTaskClick={onTaskClick}
                onDeleteTask={onDeleteTask}
                orgTaskAssignments={orgTaskAssignments}
                onKeyboardMove={handleKeyboardMove}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <div className="opacity-80">
                <Card className="shadow-lg border-primary">
                  <CardContent className="p-4">
                    <div className="font-medium text-sm">{activeTask.name}</div>
                    <Link 
                      href={`/projects/${activeTask.projectId}`}
                      className="text-xs text-muted-foreground mt-1 hover:text-primary hover:underline block"
                    >
                      {getProjectName(activeTask.projectId)}
                    </Link>
                  </CardContent>
                </Card>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function KanbanColumn({ 
  column, 
  tasks, 
  getProjectName, 
  onTaskClick,
  onDeleteTask,
  orgTaskAssignments,
  onKeyboardMove,
}: { 
  column: { id: string; label: string; color: string }; 
  tasks: Task[]; 
  getProjectName: (id: number) => string;
  onTaskClick: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  orgTaskAssignments?: (TaskResourceAssignment & { resource: Resource })[];
  onKeyboardMove?: (taskId: number, direction: 'left' | 'right') => void;
}) {
  const { setNodeRef, isOver } = useSortable({
    id: column.id,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "space-y-4 min-h-[200px] rounded-lg transition-colors",
        isOver && "bg-primary/5 ring-2 ring-primary ring-dashed"
      )}
    >
      <div className={cn("rounded-lg p-3 font-semibold flex items-center justify-between", column.color)}>
        <span>{column.label}</span>
        <Badge variant="secondary" className="text-xs font-medium ml-2">{tasks.length}</Badge>
      </div>
      <div className="space-y-3">
        {tasks.map(task => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            getProjectName={getProjectName}
            onTaskClick={onTaskClick}
            onDeleteTask={onDeleteTask}
            preloadedAssignments={orgTaskAssignments?.filter(a => a.taskId === task.id)}
            onKeyboardMove={onKeyboardMove}
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
            Drop tasks here
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableTaskCard({ 
  task, 
  getProjectName, 
  onTaskClick,
  onDeleteTask,
  preloadedAssignments,
  onKeyboardMove,
}: { 
  task: Task; 
  getProjectName: (id: number) => string;
  onTaskClick: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  preloadedAssignments?: (TaskResourceAssignment & { resource: Resource })[];
  onKeyboardMove?: (taskId: number, direction: 'left' | 'right') => void;
}) {
  const taskAssignments = preloadedAssignments;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyboardMove && (e.ctrlKey || e.metaKey)) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onKeyboardMove(task.id, 'left');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onKeyboardMove(task.id, 'right');
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(isDragging && "opacity-50")}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <Card 
        className={cn(
          "cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing group relative border-l-[3px]",
          task.priority === 'Critical' ? "border-l-rose-500" :
          task.priority === 'High' ? "border-l-amber-500" :
          task.priority === 'Medium' ? "border-l-blue-400" :
          "border-l-slate-300 dark:border-l-slate-600"
        )}
        onClick={() => onTaskClick(task)}
        data-testid={`kanban-task-${task.id}`}
      >
        <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:pointer-events-none md:group-hover:pointer-events-auto transition-opacity z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`button-menu-task-${task.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onDeleteTask(task); }}
                className="text-red-600 focus:text-red-600"
                data-testid={`menu-delete-task-${task.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardContent className="p-4">
          <div className="font-medium text-sm truncate flex items-center gap-1" title={task.name}>
            {task.timesheetBlocked && <LockIcon className="h-3 w-3 text-amber-500 flex-shrink-0" />}
            <span className="truncate">{task.name}</span>
          </div>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Link 
              href={`/projects/${task.projectId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-muted-foreground hover:text-primary hover:underline break-words"
              title={getProjectName(task.projectId)}
              data-testid={`kanban-link-project-${task.projectId}`}
            >
              {getProjectName(task.projectId)}
            </Link>
            {task.priority && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] py-0 ml-auto",
                  task.priority === 'Critical' ? "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300" :
                  task.priority === 'High' ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" :
                  task.priority === 'Medium' ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                  task.priority === 'Low' ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" :
                  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                )}
                data-testid={`badge-priority-task-${task.id}`}
              >
                {task.priority}
              </Badge>
            )}
          </div>
          {taskAssignments && taskAssignments.length > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-muted-foreground">Assigned:</span>
              <div className="flex -space-x-1.5">
                {taskAssignments.slice(0, 3).map((a) => (
                  <MicrosoftContactCard
                    key={a.id}
                    displayName={a.resource.displayName}
                    email={a.resource.email}
                    title={a.resource.title}
                    department={a.resource.department}
                    phone={a.resource.phone}
                    photoUrl={a.resource.photoUrl}
                    side="top"
                  >
                    <div 
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold border border-background cursor-pointer hover:bg-primary/20 transition-colors hover:z-10"
                      title={a.resource.displayName}
                    >
                      {a.resource.displayName.charAt(0).toUpperCase()}
                    </div>
                  </MicrosoftContactCard>
                ))}
                {taskAssignments.length > 3 && (
                  <div 
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-medium border border-background"
                    title={taskAssignments.slice(3).map(a => a.resource.displayName).join(", ")}
                  >
                    +{taskAssignments.length - 3}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <Badge variant="outline" className="text-xs">
              {task.progress || 0}%
            </Badge>
            {task.endDate && (
              <span className={cn(
                "text-xs",
                task.status !== 'Completed' && parseISO(task.endDate) < new Date(new Date().toDateString()) ? "text-destructive font-medium" : "text-muted-foreground"
              )}>
                Due: {format(parseISO(task.endDate), 'MMM d')}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TaskHistoryDialog({ taskId, open, onOpenChange }: { taskId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useTaskHistory(taskId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Task Change History
          </DialogTitle>
          <DialogDescription>
            View all changes made to this task over time.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No changes recorded yet
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {history.map((log) => (
                  <div 
                    key={log.id} 
                    className="border-l-2 border-muted-foreground/30 pl-4 pb-4"
                    data-testid={`history-entry-${log.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-xs">
                        {log.changeType === 'created' ? 'Created' : 'Updated'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(String(log.changedAt)), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="font-medium">{log.changedByName}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground break-all">
                      {log.changeSummary}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
