import { useState, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO, differenceInDays } from "date-fns";
import { calculateEndDateFromWorkingDays, calculateDurationInWorkingDays, parseDurationInput, formatDuration } from "@/lib/workingDays";
import { computeWbsValues } from "@/lib/taskWbs";
import plannerLogoPath from "@/assets/planner-logo.png";
import msprojectLogoPath from "@/assets/msproject-logo.png";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { useTaskResourceAssignments, useUpdateTaskResourceAssignments, useResources } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { useSidebarState } from "@/components/layout/Sidebar";
import { useForm, Controller } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn, normalizeSearch } from "@/lib/utils";
import { insertTaskSchema } from "@shared/schema";
import type { Task, TaskResourceAssignment, Resource } from "@shared/schema";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { TaskDependenciesSection, type TaskDependenciesSectionHandle, type PendingDepChange } from "@/components/TaskDependenciesSection";
import { CrossProjectReferences } from "@/components/CrossProjectReferences";
import { useUpdateTaskDependency, useAddTaskDependency, useRemoveTaskDependency } from "@/hooks/use-tasks";
const ProjectGanttView = lazy(() => import("@/components/project/ProjectGanttView"));
import ProjectKanbanView, { ProjectTaskHistoryDialog } from "@/components/project/ProjectKanbanView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DurationInput } from "@/components/ui/duration-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertCircle, Calendar as CalendarIcon, Plus, Pencil, GanttChartSquare, Table, Milestone as MilestoneIcon, History, Maximize2, Minimize2, Columns3, RefreshCw, Download, Upload, ExternalLink, Search, Link2, User as UserIcon } from "lucide-react";

function TasksTab({ projectId, projectName, projectStartDate, projectEndDate, projectSource, plannerPlanId, sourceFileName, sourceFileUrl, dataverseOrgId, dataverseTenantId, urlTaskId, readOnly = false, projectUpdatedAt }: { 
  projectId: number; 
  projectName?: string; 
  projectStartDate?: string | null; 
  projectEndDate?: string | null;
  projectSource?: string | null;
  plannerPlanId?: string | null;
  sourceFileName?: string | null;
  sourceFileUrl?: string | null;
  dataverseOrgId?: string | null;
  dataverseTenantId?: string | null;
  urlTaskId?: string | null;
  readOnly?: boolean;
  projectUpdatedAt?: Date | string | null;
}) {
  const { currentOrganization } = useOrganization();
  const { data: tasks, isLoading, refetch: refetchTasks } = useTasks(projectId);
  const { data: resources } = useResources(currentOrganization?.id ?? null);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const { toast } = useToast();
  
  const isPlannerProject = (projectSource === "planner" || projectSource === "planner_premium") && !!plannerPlanId;
  // Detect Premium plans by source OR by GUID-style plannerPlanId (Dataverse uses GUIDs)
  const isGuidPlanId = plannerPlanId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plannerPlanId);
  const isPremiumPlan = projectSource === "planner_premium" || (projectSource === "planner" && isGuidPlanId);
  const isMsProjectImported = projectSource === "imported" && !!sourceFileUrl;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(projectUpdatedAt ? new Date(projectUpdatedAt) : null);
  const hasSyncedRef = useRef(false);
  
  // MS Project re-import state
  const [isReimportDialogOpen, setIsReimportDialogOpen] = useState(false);
  const [isReimporting, setIsReimporting] = useState(false);
  const [selectedReimportFile, setSelectedReimportFile] = useState<File | null>(null);
  const reimportFileInputRef = useRef<HTMLInputElement>(null);
  
  // Make Editable state (convert imported/planner to native tasks)
  const [isMakeEditableDialogOpen, setIsMakeEditableDialogOpen] = useState(false);
  
  const makeEditableMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/projects/${projectId}/make-editable`);
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "Project detached successfully. You can now add, edit, and delete tasks." });
      queryClient.invalidateQueries({ queryKey: [api.projects.get.path, projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'history'] });
      await refetchTasks();
      setIsMakeEditableDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to detach project", variant: "destructive" });
    }
  });

  // Dataverse reconnect mutation
  const reconnectDataverseMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/dataverse/connect", {
        returnUrl: `/projects/${projectId}`
      });
      return response.json();
    },
    onSuccess: (data: { authUrl: string }) => {
      window.location.href = data.authUrl;
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reconnect to Dataverse", variant: "destructive" });
    },
  });
  
  // Planner sync handler - not memoized, called manually
  const handlePlannerSync = async (silent = false) => {
    if (!isPlannerProject) return;
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/sync-planner`, {
        method: 'POST',
        credentials: 'include',
      });
      let data;
      try {
        data = await response.json();
      } catch {
        data = { message: "Failed to parse response" };
      }
      if (!response.ok) {
        if (!silent) {
          // Check if it's a Dataverse connection issue
          if (response.status === 401 && data.message?.includes("Dataverse")) {
            setSyncError("Not connected to Dataverse. Please reconnect.");
          } else {
            toast({ title: "Sync failed", description: data.message || "Unknown error", variant: "destructive" });
          }
        }
      } else {
        setSyncError(null);
        setLastSyncedAt(new Date());
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'dependencies'] });
        queryClient.invalidateQueries({ queryKey: ['/api/resources'] });
        refetchTasks();
        if (!silent) {
          toast({ title: "Synced", description: data.message });
        }
      }
    } catch (err) {
      if (!silent) {
        toast({ title: "Sync failed", description: "Failed to sync from Planner", variant: "destructive" });
      }
    } finally {
      setIsSyncing(false);
    }
  };
  
  // Auto-sync on mount for Planner projects (once only)
  useEffect(() => {
    if (isPlannerProject && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      setIsSyncing(true);
      // Inline async to avoid callback dependencies
      (async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/sync-planner`, {
            method: 'POST',
            credentials: 'include',
          });
          if (response.ok) {
            const data = await response.json();
            setLastSyncedAt(new Date());
            queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
            queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'dependencies'] });
            toast({ 
              title: "Synced with Planner", 
              description: `${data.synced || 0} tasks synced successfully` 
            });
          }
        } catch {
          // Silent fail on auto-sync
        } finally {
          setIsSyncing(false);
        }
      })();
    }
  }, [projectId, isPlannerProject, toast]);

  // MS Project re-import handler
  const handleMsProjectReimport = async () => {
    if (!selectedReimportFile) {
      toast({ title: "Select a File", description: "Please select an MS Project file to re-import", variant: "destructive" });
      return;
    }

    setIsReimporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedReimportFile);
      formData.append("projectId", projectId.toString());
      if (currentOrganization?.id) {
        formData.append("organizationId", currentOrganization.id.toString());
      }

      // First upload the file to create an import record
      const uploadResponse = await fetch("/api/mpp-imports/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.message || "Upload failed");
      }

      const importRecord = await uploadResponse.json();
      
      // Now sync the import to the existing project (replace mode)
      const syncResponse = await fetch(`/api/mpp-imports/${importRecord.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId,
          syncMode: "replace",
        }),
        credentials: "include",
      });

      if (!syncResponse.ok) {
        const error = await syncResponse.json();
        throw new Error(error.message || "Sync failed");
      }

      const result = await syncResponse.json();
      toast({ title: "Success", description: result.message || "Tasks updated successfully" });
      refetchTasks();
      setIsReimportDialogOpen(false);
      setSelectedReimportFile(null);
    } catch (err: any) {
      toast({ title: "Re-import Failed", description: err.message || "Could not re-import MS Project file", variant: "destructive" });
    } finally {
      setIsReimporting(false);
      if (reimportFileInputRef.current) reimportFileInputRef.current.value = "";
    }
  };

  const [showMsProjectEditDialog, setShowMsProjectEditDialog] = useState(false);
  
  const [view, setView] = useState<"table" | "gantt" | "kanban">("gantt");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeDialogTab, setActiveDialogTab] = useState<string>("details");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlannerEditDialog, setShowPlannerEditDialog] = useState(false);
  const [durationInput, setDurationInput] = useState<string>("1d");
  const [isMilestone, setIsMilestone] = useState(false);
  const [isOngoingTask, setIsOngoingTask] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { data: taskAssignments } = useTaskResourceAssignments(editingTask?.id ?? null);
  const lastInitializedTaskId = useRef<number | null>(null);
  const inviteAssignedRef = useRef(false);
  const depsRef = useRef<TaskDependenciesSectionHandle>(null);
  const [pendingDepChanges, setPendingDepChanges] = useState<Map<number, PendingDepChange>>(new Map());
  const updateDependency = useUpdateTaskDependency();
  const addDependency = useAddTaskDependency();
  const removeDependency = useRemoveTaskDependency();
  
  // Get sidebar state to calculate fullscreen positioning
  // Sidebar is w-72 (288px) when expanded, w-20 (80px) when collapsed
  const { isCollapsed, setIsCollapsed: setSidebarCollapsed } = useSidebarState();
  const sidebarWasCollapsed = useRef(false);
  const sidebarWidth = isCollapsed ? 80 : 288;

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarCollapsed(sidebarWasCollapsed.current);
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen, setSidebarCollapsed]);
  
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (!searchQuery.trim()) return tasks;
    const query = normalizeSearch(searchQuery);
    return tasks.filter(task => 
      normalizeSearch(task.name).includes(query) ||
      normalizeSearch(task.description).includes(query) ||
      normalizeSearch(task.assignee).includes(query) ||
      normalizeSearch(task.status).includes(query)
    );
  }, [tasks, searchQuery]);
  
  // Only sync selectedResourceIds from server on INITIAL load for a task
  // Don't overwrite user changes when query refetches
  useEffect(() => {
    if (taskAssignments && editingTask && lastInitializedTaskId.current !== editingTask.id) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
      lastInitializedTaskId.current = editingTask.id;
    }
  }, [taskAssignments, editingTask]);

  const taskAutoOpenRef = useRef(false);

  const taskFormSchema = insertTaskSchema.extend({
    name: z.string().min(1, "Task name is required")
  });

  const form = useForm({
    resolver: zodResolver(taskFormSchema),
    mode: "onChange",
    defaultValues: {
      projectId: projectId,
      name: "",
      description: "",
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: calculateEndDateFromWorkingDays(format(new Date(), 'yyyy-MM-dd'), 1),
      durationDays: 1,
      progress: 0,
      status: "Not Started",
      assignee: "",
      baselineStartDate: null as string | null,
      baselineEndDate: null as string | null,
      timesheetBlocked: false,
    }
  });
  
  const setBaselineFromCurrentDates = () => {
    const currentStart = form.getValues("startDate");
    const currentEnd = form.getValues("endDate");
    if (currentStart) form.setValue("baselineStartDate", currentStart);
    if (currentEnd) form.setValue("baselineEndDate", currentEnd);
  };
  
  const clearBaseline = () => {
    form.setValue("baselineStartDate", null);
    form.setValue("baselineEndDate", null);
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

  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  
  const durationDays = parseDurationInput(durationInput);
  
  useEffect(() => {
    if (startDate && durationDays !== null && durationDays >= 0) {
      if (durationDays === 0) {
        form.setValue("endDate", startDate);
        setIsMilestone(true);
      } else {
        const newEnd = calculateEndDateFromWorkingDays(startDate, durationDays);
        form.setValue("endDate", newEnd);
        setIsMilestone(false);
      }
      form.setValue("durationDays", durationDays);
    }
  }, [startDate, durationDays, form]);
  
  const handleDurationInputChange = (value: string) => {
    setDurationInput(value);
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
  
  const handleEndDateChange = (newEndDate: string) => {
    form.setValue("endDate", newEndDate);
    if (startDate && newEndDate) {
      const newDuration = calculateDurationInWorkingDays(startDate, newEndDate);
      if (newDuration >= 0) {
        setDurationInput(formatDuration(newDuration));
        form.setValue("durationDays", newDuration);
      }
    }
  };

  const openEditDialog = (task: Task, tab: string = "details") => {
    setPendingDepChanges(new Map());
    setEditingTask(task);
    setActiveDialogTab(tab);
    const taskDuration = task.durationDays ?? (task.startDate && task.endDate 
      ? (task.startDate === task.endDate ? 0 : calculateDurationInWorkingDays(task.startDate, task.endDate))
      : 1);
    setDurationInput(formatDuration(taskDuration));
    setIsMilestone(task.isMilestone || false);
    setIsOngoingTask(task.isOngoing || false);
    form.reset({
      projectId: task.projectId,
      name: task.name,
      description: task.description || "",
      startDate: task.startDate || format(new Date(), 'yyyy-MM-dd'),
      endDate: task.endDate || calculateEndDateFromWorkingDays(format(new Date(), 'yyyy-MM-dd'), 1),
      durationDays: taskDuration,
      progress: task.progress || 0,
      status: task.status || "Not Started",
      assignee: task.assignee || "",
      baselineStartDate: task.baselineStartDate || null,
      baselineEndDate: task.baselineEndDate || null,
      timesheetBlocked: task.timesheetBlocked || false,
    });
    setIsDialogOpen(true);
  };

  // Auto-open task dialog from URL parameter
  useEffect(() => {
    if (urlTaskId && tasks && tasks.length > 0 && !taskAutoOpenRef.current) {
      const taskId = parseInt(urlTaskId);
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        openEditDialog(task);
        taskAutoOpenRef.current = true;
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('taskId');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [urlTaskId, tasks]);

  const openCreateDialog = () => {
    setEditingTask(null);
    setDurationInput("1d");
    setIsMilestone(false);
    setIsOngoingTask(false);
    setSelectedResourceIds([]);
    lastInitializedTaskId.current = null;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    form.reset({
      projectId: projectId,
      name: "",
      description: "",
      startDate: todayStr,
      endDate: calculateEndDateFromWorkingDays(todayStr, 1),
      durationDays: 1,
      progress: 0,
      status: "Not Started",
      assignee: "",
      baselineStartDate: null,
      baselineEndDate: null,
      timesheetBlocked: false,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: any) => {
    const taskData = {
      projectId,
      name: data.name,
      description: data.description || null,
      startDate: isOngoingTask ? null : data.startDate,
      endDate: isOngoingTask ? null : data.endDate,
      durationDays: isOngoingTask ? null : (durationDays ?? 1),
      progress: data.progress || 0,
      status: data.status || "Not Started",
      assignee: data.assignee || null,
      isMilestone: isOngoingTask ? false : isMilestone,
      baselineStartDate: data.baselineStartDate || null,
      baselineEndDate: data.baselineEndDate || null,
      timesheetBlocked: data.timesheetBlocked || false,
      isOngoing: isOngoingTask,
      taskType: isOngoingTask ? "Ongoing" : (editingTask?.taskType === "Ongoing" ? "Work" : undefined),
    };

    if (editingTask) {
      const allDepChanges = Array.from(pendingDepChanges.values());
      const newDeps = allDepChanges.filter(c => c.isNew);
      const removedDeps = allDepChanges.filter(c => c.isRemoved);
      const updatedDeps = allDepChanges.filter(c => !c.isNew && !c.isRemoved);

      updateTask.mutate({ id: editingTask.id, ...taskData }, {
        onSuccess: (result) => {
          if (!inviteAssignedRef.current) {
            updateTaskResources.mutate({ taskId: editingTask.id, resourceIds: selectedResourceIds });
          }
          inviteAssignedRef.current = false;

          const totalDepOps = newDeps.length + updatedDeps.length + removedDeps.length;
          if (totalDepOps > 0) {
            let completed = 0;
            const onDepComplete = () => {
              completed++;
              if (completed === totalDepOps) {
                toast({ title: "Success", description: "Task and dependencies updated" });
              }
            };
            const onDepError = (error: any) => {
              toast({ title: "Error", description: error?.message || "Failed to update dependency", variant: "destructive" });
            };

            for (const change of newDeps) {
              addDependency.mutate(
                { taskId: editingTask.id, dependsOnTaskId: change.dependsOnTaskId, projectId, dependencyType: change.dependencyType, lagDays: change.lagDays },
                { onSuccess: onDepComplete, onError: onDepError }
              );
            }
            for (const change of removedDeps) {
              removeDependency.mutate(
                { taskId: editingTask.id, dependsOnTaskId: change.dependsOnTaskId, projectId },
                { onSuccess: onDepComplete, onError: onDepError }
              );
            }
            for (const change of updatedDeps) {
              updateDependency.mutate(
                { taskId: editingTask.id, dependsOnTaskId: change.dependsOnTaskId, dependencyType: change.dependencyType, lagDays: change.lagDays, projectId },
                { onSuccess: onDepComplete, onError: onDepError }
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
          toast({ title: "Error", description: error?.message || "Failed to update task", variant: "destructive" });
        }
      });
    } else {
      createTask.mutate(taskData, {
        onSuccess: (newTask: any) => {
          if (selectedResourceIds.length > 0 && newTask?.id) {
            updateTaskResources.mutate({ taskId: newTask.id, resourceIds: selectedResourceIds });
          }
          toast({ title: "Success", description: "Task created" });
          setIsDialogOpen(false);
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error?.message || "Failed to create task", variant: "destructive" });
        }
      });
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div 
      data-schedule-export="true"
      className={cn(
        "space-y-4",
        isFullscreen && "fixed top-14 right-0 bottom-0 z-40 bg-background p-4 flex flex-col overflow-hidden"
      )}
      style={isFullscreen ? { left: sidebarWidth } : undefined}
    >
      {/* Planner project banner */}
      {isPlannerProject && (
        <div className="space-y-2">
          <div className="p-3 rounded-lg border bg-muted/50 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <img src={plannerLogoPath} alt="Microsoft Planner" className="h-6 w-6 shrink-0" />
                <div className="min-w-0">
                  <span className="font-medium">Planner Premium Task Management Options:</span>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">1. Sync Now – Edit tasks in Planner (view-only in FridayReport)</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">2. Detach & Edit – Disconnect from Planner and continue managing tasks directly in FridayReport</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <a 
                  href={(() => {
                    if (!plannerPlanId) return "https://planner.cloud.microsoft";
                    if (isPremiumPlan) {
                      let url = `https://planner.cloud.microsoft/webui/premiumplan/${plannerPlanId}`;
                      if (dataverseOrgId) {
                        url += `/org/${dataverseOrgId}`;
                      }
                      if (dataverseTenantId) {
                        url += `?tid=${dataverseTenantId}`;
                      }
                      return url;
                    }
                    return `https://planner.cloud.microsoft/webui/plan/${plannerPlanId}/view/board`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  {isPremiumPlan ? "Open in Project" : "Open in Planner"}
                </a>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handlePlannerSync(false)} 
                  disabled={isSyncing}
                  data-testid="button-sync-planner"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-1", isSyncing && "animate-spin")} />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMakeEditableDialogOpen(true)}
                      data-testid="button-make-editable-planner"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Detach & Edit
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p>Detach this project from {isPremiumPlan ? "Project for the Web" : "Planner"} and make it fully editable. This removes the sync link but keeps all tasks and data.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            {lastSyncedAt && (
              <p className="text-xs text-muted-foreground pl-9" data-testid="text-last-synced">
                Last Synced: {format(new Date(lastSyncedAt), "MM/dd/yyyy h:mm a")}
              </p>
            )}
          </div>
          {syncError && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{syncError}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reconnectDataverseMutation.mutate()}
                  disabled={reconnectDataverseMutation.isPending}
                  className="text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                  data-testid="button-reconnect-dataverse"
                >
                  {reconnectDataverseMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Reconnect
                    </>
                  )}
                </Button>
                <a 
                  href="/integrations" 
                  className="text-sm text-red-700 dark:text-red-300 hover:underline flex items-center gap-1"
                >
                  Go to Integrations
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}
      {/* MS Project imported project banner */}
      {isMsProjectImported && (
        <div className="p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 space-y-3">
          <div className="flex items-start gap-3">
            <img src={msprojectLogoPath} alt="Microsoft Project" className="h-6 w-6 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="font-medium text-emerald-800 dark:text-emerald-200">Microsoft Project Task Management Options:</span>
              <div className="mt-1 space-y-0.5"> 
                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">1. Re-Import – Edit tasks in MS Project (view-only in FridayReport)</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">2. Detach & Edit – Disconnect from MS Project and continue managing tasks directly in FridayReport</p> 
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReimportDialogOpen(true)}
              data-testid="button-reimport-msproject"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-Import
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMakeEditableDialogOpen(true)}
                  data-testid="button-make-editable"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Detach & Edit
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>Detach this project from the imported file and make it fully editable. This removes the import link but keeps all tasks and data.</p>
              </TooltipContent>
            </Tooltip>
            {sourceFileUrl && (
              <a 
                href={sourceFileUrl}
                download={sourceFileName || "project.mpp"}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-700 text-emerald-700 dark:text-emerald-200 text-sm font-medium transition-colors border border-emerald-300 dark:border-emerald-700"
                data-testid="button-download-source-file"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
            )}
          </div>
        </div>
      )}
      {/* MS Project Re-Import Dialog */}
      <Dialog open={isReimportDialogOpen} onOpenChange={setIsReimportDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={msprojectLogoPath} alt="MS Project" className="h-5 w-5" />
              Re-Import MS Project File
            </DialogTitle>
            <DialogDescription>
              Upload an updated MS Project file to replace all task data for this project.
            </DialogDescription>
          </DialogHeader>
          
          <input
            type="file"
            ref={reimportFileInputRef}
            onChange={(e) => setSelectedReimportFile(e.target.files?.[0] || null)}
            accept=".mpp,.xml,.csv"
            className="hidden"
            data-testid="input-reimport-file"
          />

          <div className="space-y-4 py-4">
            <div 
              className={cn(
                "flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-all hover-elevate",
                selectedReimportFile 
                  ? "border-emerald-500 bg-emerald-500/5" 
                  : "border-border hover:border-emerald-500/50"
              )}
              onClick={() => reimportFileInputRef.current?.click()}
              data-testid="dropzone-reimport"
            >
              {selectedReimportFile ? (
                <>
                  <div className="flex items-center gap-2">
                    <img src={msprojectLogoPath} alt="MS Project" className="h-5 w-5" />
                    <span className="font-medium">{selectedReimportFile.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(selectedReimportFile.size / 1024).toFixed(1)} KB
                  </p>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedReimportFile(null);
                      if (reimportFileInputRef.current) reimportFileInputRef.current.value = "";
                    }}
                  >
                    Choose Different File
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to select a file</p>
                  <p className="text-xs text-muted-foreground">Supports .mpp, .xml, .csv</p>
                </>
              )}
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
              <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>This will replace all existing task data. Project settings will remain unchanged.</span>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReimportDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleMsProjectReimport}
              disabled={!selectedReimportFile || isReimporting}
              data-testid="button-confirm-reimport"
            >
              {isReimporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Re-Importing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-Import Tasks
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Detach & Edit Confirmation Dialog */}
      <AlertDialog open={isMakeEditableDialogOpen} onOpenChange={setIsMakeEditableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Detach & Make Editable
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Detaching this project will disconnect it from the original source system and allow you to add, edit, and delete tasks directly in the app.
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-amber-800 dark:text-amber-200 text-sm">
                <strong>Important:</strong> After detaching, the link to the original source will be removed. Re-importing or syncing will no longer be available. All your tasks and project data will be preserved.
              </div>
              <p className="text-sm">
                This action cannot be undone. Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={makeEditableMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => makeEditableMutation.mutate()}
              disabled={makeEditableMutation.isPending}
            >
              {makeEditableMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Detaching...
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Detach & Edit
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* MS Project Read-Only Task Dialog */}
      <Dialog open={showMsProjectEditDialog} onOpenChange={setShowMsProjectEditDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={msprojectLogoPath} alt="MS Project" className="h-5 w-5" />
              Read-Only Task
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground mb-4">
              This task was imported from MS Project and is read-only. To update task data, use the <strong>Re-Import</strong> button to upload an updated MS Project file.
            </p>
            {editingTask && (
              <div className="p-3 bg-muted/50 rounded-md space-y-2">
                <p className="font-medium">{editingTask.name}</p>
                <div className="text-sm text-muted-foreground grid grid-cols-2 gap-2">
                  <span>Status: {editingTask.status}</span>
                  <span>Progress: {editingTask.progress || 0}%</span>
                  {editingTask.startDate && <span>Start: {editingTask.startDate}</span>}
                  {editingTask.endDate && <span>End: {editingTask.endDate}</span>}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMsProjectEditDialog(false)}>
              Close
            </Button>
            <Button onClick={() => { setShowMsProjectEditDialog(false); setIsReimportDialogOpen(true); }}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div data-schedule-toolbar="true" className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as "table" | "gantt" | "kanban")}>
          <TabsList>
            <TabsTrigger value="gantt" className="gap-2">
              <GanttChartSquare className="h-4 w-4" />
              Gantt
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-2">
              <Table className="h-4 w-4" />
              Table
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-2">
              <Columns3 className="h-4 w-4" />
              Kanban
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
          <div className="relative max-w-xs w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full sm:w-60"
              data-testid="input-task-search"
            />
          </div>
          {<Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setPendingDepChanges(new Map()); setEditingTask(null); } }}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} disabled={readOnly} data-testid="button-add-task">
                <Plus className="mr-2 h-4 w-4" /> Add Task
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingTask ? "Edit Task" : "Add New Task"}</DialogTitle>
              <DialogDescription className="sr-only">
                {editingTask ? "Modify the task details below." : "Fill in the details to create a new task."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
              {/* Task Name - always visible at top */}
              <div className="space-y-2 pb-3">
                <Label>Task Name</Label>
                <Input {...form.register("name")} data-testid="input-task-name" className={cn(form.formState.errors.name && "border-destructive")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              
              {/* Tabbed content */}
              <Tabs value={activeDialogTab} onValueChange={setActiveDialogTab} className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
                  <TabsTrigger value="schedule" className="text-xs">Schedule</TabsTrigger>
                  <TabsTrigger value="resources" className="text-xs">Resources</TabsTrigger>
                  <TabsTrigger value="dependencies" className="text-xs" disabled={!editingTask || isOngoingTask}>Dependencies</TabsTrigger>
                </TabsList>
                
                <div className="flex-1 overflow-y-auto py-4 min-h-[280px]">
                  {/* Details Tab */}
                  <TabsContent value="details" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Controller control={form.control} name="status" render={({field}) => (
                          <Select onValueChange={(val) => {
                            const prevStatus = field.value;
                            field.onChange(val);
                            if (val === "Not Started") {
                              form.setValue("progress", 0);
                            } else if (val === "Completed") {
                              form.setValue("progress", 100);
                            } else if (val === "In Progress" && prevStatus === "Completed") {
                              form.setValue("progress", 50);
                            }
                          }} value={field.value || "Not Started"}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Not Started">Not Started</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
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
                                  form.setValue("status", "Completed");
                                } else if (newProgress === 0) {
                                  form.setValue("status", "Not Started");
                                } else {
                                  if (currentStatus === "Completed" || currentStatus === "Not Started") {
                                    form.setValue("status", "In Progress");
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
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="edit-task-isOngoing" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 text-violet-500" />
                          Ongoing Task
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          For operations or internal work without scheduled dates
                        </p>
                      </div>
                      <Switch
                        id="edit-task-isOngoing"
                        checked={isOngoingTask}
                        onCheckedChange={setIsOngoingTask}
                        data-testid="switch-task-ongoing"
                      />
                    </div>
                    {!isOngoingTask && (
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
                    )}
                    <div className="flex items-center space-x-2">
                      <Controller 
                        control={form.control} 
                        name="timesheetBlocked" 
                        render={({field}) => (
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
                  
                  {/* Schedule Tab */}
                  <TabsContent value="schedule" className="mt-0 space-y-4">
                    {isOngoingTask ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                        <RefreshCw className="h-8 w-8 text-violet-400" />
                        <p className="text-sm font-medium">Ongoing Task</p>
                        <p className="text-xs text-muted-foreground max-w-[300px]">
                          This task has no scheduled dates. It represents continuous or operational work that runs indefinitely.
                        </p>
                      </div>
                    ) : (
                    <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" {...form.register("startDate")} data-testid="input-task-start" />
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
                        <Input 
                          type="date" 
                          value={endDate || ""}
                          onChange={(e) => handleEndDateChange(e.target.value)}
                          min={startDate || undefined}
                          data-testid="input-task-end" 
                        />
                      </div>
                    </div>
                    
                    {/* Baseline Section */}
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
                    </>
                    )}
                  </TabsContent>
                  
                  {/* Resources Tab */}
                  <TabsContent value="resources" className="mt-0">
                    {editingTask && (() => {
                      const editLevel = editingTask.outlineLevel || 1;
                      const idx = tasks?.findIndex(x => x.id === editingTask.id) ?? -1;
                      const hasChildren = idx >= 0 && tasks && idx < tasks.length - 1 && ((tasks[idx + 1].outlineLevel || 1) > editLevel);
                      return hasChildren;
                    })() ? (
                      <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md flex items-center gap-2">
                        <UserIcon className="h-4 w-4" />
                        <span>Resource assignments are only available for leaf tasks. This is a summary task.</span>
                      </div>
                    ) : (
                      <ResourceAssignment
                        organizationId={currentOrganization?.id || null}
                        selectedResourceIds={selectedResourceIds}
                        onSelectionChange={setSelectedResourceIds}
                        label="Assigned Resources"
                        projectId={projectId}
                        projectName={projectName}
                        taskId={editingTask?.id}
                        taskName={editingTask?.name}
                        onInviteAssigned={() => { inviteAssignedRef.current = true; }}
                      />
                    )}
                  </TabsContent>
                  
                  {/* Dependencies Tab */}
                  <TabsContent value="dependencies" className="mt-0">
                    {editingTask && (() => {
                      const editLevel = editingTask.outlineLevel || 1;
                      const idx = tasks?.findIndex(x => x.id === editingTask.id) ?? -1;
                      const hasChildren = idx >= 0 && tasks && idx < tasks.length - 1 && ((tasks[idx + 1].outlineLevel || 1) > editLevel);
                      return hasChildren;
                    })() ? (
                      <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        <span>Dependencies are only available for leaf tasks. This is a summary task with children.</span>
                      </div>
                    ) : editingTask ? (
                      <div className="space-y-6">
                        <TaskDependenciesSection 
                          ref={depsRef}
                          taskId={editingTask.id} 
                          projectId={projectId}
                          allTasks={tasks || []}
                          pendingChanges={pendingDepChanges}
                          onPendingChangesUpdate={setPendingDepChanges}
                        />
                        {currentOrganization?.id && (
                          <div className="border-t pt-4">
                            <CrossProjectReferences
                              entityType="task"
                              entityId={editingTask.id}
                              entityProjectId={projectId}
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
          </Dialog>}
          
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isFullscreen) {
                setSidebarCollapsed(sidebarWasCollapsed.current);
                setIsFullscreen(false);
              } else {
                sidebarWasCollapsed.current = isCollapsed;
                setSidebarCollapsed(true);
                setIsFullscreen(true);
              }
            }}
            data-testid="button-tasks-fullscreen"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
        
        <ProjectTaskHistoryDialog 
          taskId={editingTask?.id || 0} 
          open={isHistoryOpen} 
          onOpenChange={setIsHistoryOpen} 
        />
      </div>
      {view === "table" ? (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        <ProjectGanttView 
          tasks={filteredTasks} 
          onTaskClick={openEditDialog}
          projectId={projectId}
          organizationId={currentOrganization?.id || null}
          projectName={projectName}
          isFullscreen={isFullscreen}
          projectStartDate={projectStartDate}
          projectEndDate={projectEndDate}
          hideTimeline={true}
          isReadOnly={false}
          onCreateTask={(name) => {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            createTask.mutate({
              projectId,
              name,
              startDate: todayStr,
              endDate: calculateEndDateFromWorkingDays(todayStr, 1),
              durationDays: 1,
              status: "Not Started",
              progress: 0,
            });
          }}
        />
        </Suspense>
      ) : view === "gantt" ? (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        <ProjectGanttView 
          tasks={filteredTasks} 
          onTaskClick={openEditDialog}
          onDependencyLineClick={(task) => openEditDialog(task, "dependencies")}
          projectId={projectId}
          organizationId={currentOrganization?.id || null}
          projectName={projectName}
          isFullscreen={isFullscreen}
          projectStartDate={projectStartDate}
          projectEndDate={projectEndDate}
          isReadOnly={false}
          onCreateTask={(name) => {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            createTask.mutate({
              projectId,
              name,
              startDate: todayStr,
              endDate: calculateEndDateFromWorkingDays(todayStr, 1),
              durationDays: 1,
              status: "Not Started",
              progress: 0,
            });
          }}
        />
        </Suspense>
      ) : (
        <ProjectKanbanView 
          tasks={filteredTasks} 
          onTaskClick={openEditDialog}
          isFullscreen={isFullscreen}
          organizationId={currentOrganization?.id ?? null}
          projectId={projectId}
          resources={resources}
          isReadOnly={false}
          onResourceAssign={(taskId, resourceIds) => {
            updateTaskResources.mutate({ taskId, resourceIds });
          }}
          onStatusChange={(taskId, newStatus) => {
            const task = tasks?.find(t => t.id === taskId);
            if (task) {
              // Auto-update progress based on status
              let progressUpdate: number | undefined;
              if (newStatus === "Not Started") {
                progressUpdate = 0;
              } else if (newStatus === "In Progress") {
                progressUpdate = 50;
              } else if (newStatus === "Completed") {
                progressUpdate = 100;
              }
              
              updateTask.mutate({ 
                id: taskId, 
                projectId: task.projectId, 
                status: newStatus,
                ...(progressUpdate !== undefined && { progress: progressUpdate })
              });
            }
          }}
        />
      )}
    </div>
  );
}

export default TasksTab;
