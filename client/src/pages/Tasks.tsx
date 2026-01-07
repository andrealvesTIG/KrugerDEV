import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useAllTasks, useCreateTask, useUpdateTask, useDeleteTask, useTaskHistory } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useTaskResourceAssignments, useUpdateTaskResourceAssignments } from "@/hooks/use-resources";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Trash2, GanttChart, Columns3, Calendar as CalendarIcon, History, Clock, Filter, Layers, ChevronDown, ChevronRight, FolderKanban, Briefcase, MoreVertical, ZoomIn, ZoomOut } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, addDays, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, parseISO } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema, type Task } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const statusColors = {
  "Not Started": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Completed": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

type GroupBy = "none" | "project" | "portfolio";

export default function Tasks() {
  const { currentOrganization } = useOrganization();
  const { data: allTasks, isLoading } = useAllTasks();
  const { data: projects } = useProjects(currentOrganization?.id);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const [view, setView] = useState<"gantt" | "kanban">("gantt");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [durationDays, setDurationDays] = useState(7);
  const [filterProjectId, setFilterProjectId] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [deleteTaskData, setDeleteTaskData] = useState<Task | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const { data: taskAssignments } = useTaskResourceAssignments(editingTask?.id ?? null);
  const { toast } = useToast();

  useEffect(() => {
    if (taskAssignments && editingTask) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
    }
  }, [taskAssignments, editingTask]);

  const handleDeleteTaskFromKanban = (task: Task) => {
    setDeleteTaskData(task);
  };

  const projectIds = useMemo(() => new Set(projects?.map(p => p.id) || []), [projects]);
  const tasks = useMemo(() => {
    const orgTasks = allTasks?.filter(task => projectIds.has(task.projectId)) || [];
    if (filterProjectId) {
      return orgTasks.filter(task => task.projectId === filterProjectId);
    }
    return orgTasks;
  }, [allTasks, projectIds, filterProjectId]);

  const projectMap = useMemo(() => {
    const map = new Map<number, { name: string; portfolioId: number | null }>();
    projects?.forEach(p => map.set(p.id, { name: p.name, portfolioId: p.portfolioId }));
    return map;
  }, [projects]);

  const portfolioMap = useMemo(() => {
    const map = new Map<number, string>();
    portfolios?.forEach(p => map.set(p.id, p.name));
    return map;
  }, [portfolios]);

  type TaskGroup = { id: string; name: string; icon: "project" | "portfolio"; tasks: Task[] };

  const groupedTasks = useMemo((): TaskGroup[] => {
    if (groupBy === "none") {
      return [{ id: "all", name: "All Tasks", icon: "project", tasks }];
    }
    
    if (groupBy === "project") {
      const groups = new Map<number, Task[]>();
      tasks.forEach(task => {
        if (!groups.has(task.projectId)) groups.set(task.projectId, []);
        groups.get(task.projectId)!.push(task);
      });
      return Array.from(groups.entries()).map(([projectId, projectTasks]) => ({
        id: `project-${projectId}`,
        name: projectMap.get(projectId)?.name || "Unknown Project",
        icon: "project" as const,
        tasks: projectTasks,
      }));
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
    
    return [{ id: "all", name: "All Tasks", icon: "project", tasks }];
  }, [tasks, groupBy, projectMap, portfolioMap]);

  const form = useForm({
    resolver: zodResolver(insertTaskSchema),
    mode: "onChange",
    defaultValues: {
      projectId: undefined as any,
      name: "",
      description: "",
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      durationDays: 7,
      progress: 0,
      status: "Not Started",
      assignee: "",
    }
  });

  const recalculateEndDate = (newStartDate: string, newDuration: number) => {
    if (newStartDate && newDuration > 0) {
      const start = parseISO(newStartDate);
      const end = addDays(start, newDuration - 1);
      form.setValue("endDate", format(end, 'yyyy-MM-dd'), { shouldDirty: true, shouldValidate: true });
      form.setValue("durationDays", newDuration, { shouldDirty: true, shouldValidate: true });
    }
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    const taskDuration = task.durationDays || (task.startDate && task.endDate 
      ? differenceInDays(parseISO(task.endDate), parseISO(task.startDate)) + 1 
      : 7);
    setDurationDays(taskDuration);
    form.reset({
      projectId: task.projectId,
      name: task.name,
      description: task.description || "",
      startDate: task.startDate,
      endDate: task.endDate,
      durationDays: taskDuration,
      progress: task.progress || 0,
      status: task.status || "Not Started",
      assignee: task.assignee || "",
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTask(null);
    setDurationDays(7);
    setSelectedResourceIds([]);
    form.reset({
      projectId: projects && projects.length > 0 ? projects[0].id : undefined as any,
      name: "",
      description: "",
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      durationDays: 7,
      progress: 0,
      status: "Not Started",
      assignee: "",
    });
    setIsDialogOpen(true);
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
      durationDays: durationDays,
      progress: data.progress || 0,
      status: data.status || "Not Started",
      assignee: data.assignee || null,
    };

    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, ...taskData }, {
        onSuccess: () => {
          updateTaskResources.mutate({ taskId: editingTask.id, resourceIds: selectedResourceIds });
          toast({ title: "Success", description: "Task updated" });
          setIsDialogOpen(false);
          setEditingTask(null);
        },
        onError: (error: any) => {
          const msg = error?.message || "Failed to update task";
          toast({ title: "Error", description: msg, variant: "destructive" });
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
          const msg = error?.message || "Failed to create task";
          toast({ title: "Error", description: msg, variant: "destructive" });
        }
      });
    }
  };

  if (isLoading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground">Manage tasks with Gantt Chart and Kanban views</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Tabs value={view} onValueChange={(v) => setView(v as "gantt" | "kanban")}>
            <TabsList>
              <TabsTrigger value="gantt" className="gap-2">
                <GanttChart className="h-4 w-4" />
                Gantt
              </TabsTrigger>
              <TabsTrigger value="kanban" className="gap-2">
                <Columns3 className="h-4 w-4" />
                Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select 
            value={filterProjectId ? String(filterProjectId) : "all"} 
            onValueChange={(v) => setFilterProjectId(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-[180px]" data-testid="select-filter-project">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select 
            value={groupBy} 
            onValueChange={(v) => setGroupBy(v as GroupBy)}
          >
            <SelectTrigger className="w-[180px]" data-testid="select-group-by">
              <Layers className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="project">
                <span className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4" />
                  By Project
                </span>
              </SelectItem>
              <SelectItem value="portfolio">
                <span className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  By Portfolio
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingTask(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} data-testid="button-add-task">
                <Plus className="mr-2 h-4 w-4" /> Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editingTask ? "Edit Task" : "Add New Task"}</DialogTitle>
                <DialogDescription>
                  {editingTask ? "Modify the task details below." : "Fill in the details to create a new task."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 pt-2 text-sm">
                <div className="space-y-1">
                  <Label className="text-xs">Project</Label>
                  <Controller control={form.control} name="projectId" render={({field, fieldState}) => (
                    <div className="space-y-1">
                      <Select onValueChange={(v) => field.onChange(Number(v))} value={field.value ? String(field.value) : ""}>
                        <SelectTrigger data-testid="select-task-project" className={cn("h-8 text-sm", fieldState.error && "border-destructive")}>
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects?.map(p => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                    </div>
                  )} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Task Name</Label>
                  <Input {...form.register("name")} data-testid="input-task-name" className={cn("h-8 text-sm", form.formState.errors.name && "border-destructive")} />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Date</Label>
                    <Controller 
                      control={form.control} 
                      name="startDate" 
                      render={({field}) => (
                        <Input 
                          type="date" 
                          className="h-8 text-sm"
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
                  <div className="space-y-1">
                    <Label className="text-xs">Duration (days)</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="365" 
                      className="h-8 text-sm"
                      value={durationDays}
                      onChange={(e) => {
                        const newDuration = Math.max(1, Number(e.target.value) || 1);
                        setDurationDays(newDuration);
                        const currentStartDate = form.getValues("startDate");
                        recalculateEndDate(currentStartDate, newDuration);
                      }}
                      data-testid="input-task-duration" 
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Date</Label>
                    <Controller 
                      control={form.control} 
                      name="endDate" 
                      render={({field}) => {
                        const currentStartDate = form.getValues("startDate");
                        return (
                          <Input 
                            type="date" 
                            className="h-8 text-sm"
                            value={field.value || ""}
                            min={currentStartDate || undefined}
                            onChange={(e) => {
                              const newEndDate = e.target.value;
                              field.onChange(newEndDate);
                              if (currentStartDate && newEndDate && newEndDate.length === 10) {
                                try {
                                  const start = parseISO(currentStartDate);
                                  const end = parseISO(newEndDate);
                                  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                                    const newDuration = differenceInDays(end, start) + 1;
                                    if (newDuration >= 1) {
                                      setDurationDays(newDuration);
                                      form.setValue("durationDays", newDuration, { shouldDirty: true, shouldValidate: true });
                                    }
                                  }
                                } catch {
                                  // Ignore parse errors during typing
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Controller control={form.control} name="status" render={({field}) => (
                      <Select onValueChange={field.onChange} value={field.value || "Not Started"}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Not Started">Not Started</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center justify-between">
                      Progress
                      <span className="text-muted-foreground font-normal">{form.watch("progress") || 0}%</span>
                    </Label>
                    <Controller control={form.control} name="progress" render={({field}) => (
                      <Slider
                        value={[field.value || 0]}
                        onValueChange={(v) => field.onChange(v[0])}
                        min={0}
                        max={100}
                        step={5}
                        className="py-1"
                        data-testid="slider-task-progress"
                      />
                    )} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea {...form.register("description")} className="text-sm min-h-[60px]" />
                </div>
                <ResourceAssignment
                  organizationId={currentOrganization?.id || null}
                  selectedResourceIds={selectedResourceIds}
                  onSelectionChange={setSelectedResourceIds}
                  label="Assigned Resources"
                />
                <DialogFooter className="flex items-center gap-2">
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
                  <div className="flex-1" />
                  <Button 
                    type="submit" 
                    size="sm"
                    data-testid="button-save-task" 
                    disabled={createTask.isPending || updateTask.isPending || !form.formState.isValid}
                  >
                    {(createTask.isPending || updateTask.isPending) && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    {editingTask ? "Update Task" : "Save Task"}
                  </Button>
                  {editingTask && (
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="sm"
                      onClick={() => {
                        deleteTask.mutate({ id: editingTask.id, projectId: editingTask.projectId }, {
                          onSuccess: () => {
                            toast({ title: "Deleted", description: "Task deleted" });
                            setIsDialogOpen(false);
                            setEditingTask(null);
                          }
                        });
                      }}
                      data-testid="button-delete-task"
                    >
                      Delete Task
                    </Button>
                  )}
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingTask(null);
                    }}
                    data-testid="button-cancel-task"
                  >
                    Cancel
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          
          <TaskHistoryDialog 
            taskId={editingTask?.id || 0} 
            open={isHistoryOpen} 
            onOpenChange={setIsHistoryOpen} 
          />
        </div>
      </div>

      {groupBy === "none" ? (
        view === "gantt" ? (
          <GanttView tasks={tasks || []} projects={projects || []} onTaskClick={openEditDialog} />
        ) : (
          <KanbanView 
            tasks={tasks || []} 
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
          />
        )
      ) : (
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
        />
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
    </div>
  );
}

type TaskGroup = { id: string; name: string; icon: "project" | "portfolio"; tasks: Task[] };

function GroupedTasksView({
  groupedTasks,
  view,
  projects,
  onTaskClick,
  onStatusChange,
  onDeleteTask,
}: {
  groupedTasks: TaskGroup[];
  view: "gantt" | "kanban";
  projects: any[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onDeleteTask: (task: Task) => void;
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
            <div className="flex items-center gap-3">
              {expandedGroups.has(group.id) ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
              {group.icon === "portfolio" ? (
                <Briefcase className="h-5 w-5 text-primary" />
              ) : (
                <FolderKanban className="h-5 w-5 text-primary" />
              )}
              <CardTitle className="text-lg">{group.name}</CardTitle>
              <Badge variant="secondary" className="ml-auto">
                {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}
              </Badge>
            </div>
          </CardHeader>
          {expandedGroups.has(group.id) && (
            <CardContent className="pt-0">
              {view === "gantt" ? (
                <GanttView tasks={group.tasks} projects={projects} onTaskClick={onTaskClick} embedded />
              ) : (
                <KanbanView 
                  tasks={group.tasks} 
                  projects={projects} 
                  onTaskClick={onTaskClick}
                  onStatusChange={onStatusChange}
                  onDeleteTask={onDeleteTask}
                />
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

type TaskZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year' | '5year';
const taskZoomLevels: TaskZoomLevel[] = ['day', 'week', 'month', 'quarter', 'year', '5year'];
const taskZoomLabels: Record<TaskZoomLevel, string> = {
  'day': 'Day',
  'week': 'Week',
  'month': 'Month',
  'quarter': 'Quarter',
  'year': 'Year',
  '5year': '5 Years'
};

function GanttView({ tasks, projects, onTaskClick, embedded = false }: { tasks: Task[]; projects: any[]; onTaskClick: (task: Task) => void; embedded?: boolean }) {
  const today = new Date();
  const [zoomLevel, setZoomLevel] = useState<TaskZoomLevel>('month');
  
  const { minDate, maxDate, dateRange } = useMemo(() => {
    const tasksWithDates = tasks.filter(t => t.startDate && t.endDate);
    
    let minDate: Date;
    let maxDate: Date;
    
    if (tasksWithDates.length > 0) {
      const dates = tasksWithDates.flatMap(t => [parseISO(t.startDate), parseISO(t.endDate)]);
      minDate = startOfMonth(new Date(Math.min(...dates.map(d => d.getTime()))));
      maxDate = endOfMonth(new Date(Math.max(...dates.map(d => d.getTime()))));
    } else {
      minDate = startOfMonth(today);
      maxDate = endOfMonth(addDays(today, 60));
    }
    
    // Extend range based on zoom level
    if (zoomLevel === 'quarter') {
      maxDate = addDays(maxDate, 90);
    } else if (zoomLevel === 'year') {
      maxDate = addDays(maxDate, 365);
    } else if (zoomLevel === '5year') {
      maxDate = addDays(maxDate, 1825);
    }
    
    const dateRange = eachDayOfInterval({ start: minDate, end: maxDate });
    return { minDate, maxDate, dateRange };
  }, [tasks, today, zoomLevel]);

  const { filteredDates, dateFormat, columnWidth } = useMemo(() => {
    switch (zoomLevel) {
      case 'day':
        return { filteredDates: dateRange, dateFormat: 'd', columnWidth: 'min-w-[40px]' };
      case 'week':
        return { filteredDates: dateRange.filter((_, i) => i % 7 === 0), dateFormat: 'MMM d', columnWidth: 'min-w-[100px]' };
      case 'month':
        return { filteredDates: dateRange.filter((_, i) => i % 30 === 0), dateFormat: 'MMM yyyy', columnWidth: 'min-w-[100px]' };
      case 'quarter':
        return { filteredDates: dateRange.filter((_, i) => i % 90 === 0), dateFormat: 'QQQ yyyy', columnWidth: 'min-w-[80px]' };
      case 'year':
        return { filteredDates: dateRange.filter((_, i) => i % 365 === 0), dateFormat: 'yyyy', columnWidth: 'min-w-[80px]' };
      case '5year':
        return { filteredDates: dateRange.filter((_, i) => i % 365 === 0), dateFormat: 'yyyy', columnWidth: 'min-w-[60px]' };
      default:
        return { filteredDates: dateRange.filter((_, i) => i % 7 === 0), dateFormat: 'MMM d', columnWidth: 'min-w-[100px]' };
    }
  }, [dateRange, zoomLevel]);

  const handleZoomIn = () => {
    const idx = taskZoomLevels.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(taskZoomLevels[idx - 1]);
  };

  const handleZoomOut = () => {
    const idx = taskZoomLevels.indexOf(zoomLevel);
    if (idx < taskZoomLevels.length - 1) setZoomLevel(taskZoomLevels[idx + 1]);
  };

  const getProjectName = (projectId: number) => {
    return projects.find(p => p.id === projectId)?.name || "Unknown";
  };

  if (tasks.length === 0) {
    if (embedded) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          No tasks in this group.
        </div>
      );
    }
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No tasks yet. Add your first task to see the Gantt chart.
        </CardContent>
      </Card>
    );
  }

  const zoomControls = (
    <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
      <span className="text-xs text-muted-foreground">
        View: {taskZoomLabels[zoomLevel]}
      </span>
      <div className="flex items-center gap-1 ml-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          disabled={taskZoomLevels.indexOf(zoomLevel) === 0}
          data-testid="button-task-gantt-zoom-in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          disabled={taskZoomLevels.indexOf(zoomLevel) === taskZoomLevels.length - 1}
          data-testid="button-task-gantt-zoom-out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const ganttContent = (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {!embedded && zoomControls}
        <div className="flex border-b bg-muted/50">
          <div className="w-64 flex-shrink-0 border-r p-3 font-semibold text-sm text-foreground">Task</div>
          <div className="flex-1 flex">
            {filteredDates.map((date, i) => (
              <div key={i} className={cn("flex-1 p-2 text-center text-xs font-medium text-muted-foreground border-l", columnWidth)}>
                {format(date, dateFormat)}
              </div>
            ))}
          </div>
        </div>
        {tasks.map(task => {
          const hasValidDates = task.startDate && task.endDate;
          const start = hasValidDates ? parseISO(task.startDate) : null;
          const end = hasValidDates ? parseISO(task.endDate) : null;
          
          let leftPercent = 0;
          let widthPercent = 0;
          
          if (start && end) {
            const totalDays = differenceInDays(maxDate, minDate) || 1;
            const startOffset = differenceInDays(start, minDate);
            const duration = differenceInDays(end, start) + 1;
            leftPercent = (startOffset / totalDays) * 100;
            widthPercent = (duration / totalDays) * 100;
          }

          return (
            <div 
              key={task.id} 
              className="flex border-b hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => onTaskClick(task)}
              data-testid={`gantt-task-${task.id}`}
            >
              <div className="w-64 flex-shrink-0 border-r p-3">
                <div className="font-medium text-sm truncate">{task.name}</div>
                <Link 
                  href={`/projects/${task.projectId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-muted-foreground truncate hover:text-primary hover:underline block"
                  data-testid={`link-project-${task.projectId}`}
                >
                  {getProjectName(task.projectId)}
                </Link>
              </div>
              <div className="flex-1 relative p-2">
                {hasValidDates ? (
                  <div
                    className={cn(
                      "absolute top-2 bottom-2 rounded-md flex items-center px-2 text-xs text-white font-medium",
                      task.status === "Completed" ? "bg-emerald-500" :
                      task.status === "In Progress" ? "bg-blue-500" : "bg-slate-400"
                    )}
                    style={{
                      left: `${Math.max(0, leftPercent)}%`,
                      width: `${Math.min(100 - leftPercent, widthPercent)}%`,
                      minWidth: '60px'
                    }}
                  >
                    <span className="truncate">{task.progress || 0}%</span>
                  </div>
                ) : (
                  <div className="h-full flex items-center">
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                      <CalendarIcon className="h-3 w-3 mr-1" />
                      No dates set
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (embedded) {
    return <div className="border rounded-md">{ganttContent}</div>;
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {ganttContent}
      </CardContent>
    </Card>
  );
}

function KanbanView({ 
  tasks, 
  projects, 
  onTaskClick, 
  onStatusChange,
  onDeleteTask 
}: { 
  tasks: Task[]; 
  projects: any[]; 
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  onDeleteTask: (task: Task) => void;
}) {
  const columns = [
    { id: "Not Started", label: "Not Started", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
    { id: "In Progress", label: "In Progress", color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
    { id: "Completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200" },
  ];

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const getProjectName = (projectId: number) => {
    return projects.find(p => p.id === projectId)?.name || "Unknown";
  };

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = Number(event.active.id);
    const task = tasks.find(t => t.id === taskId);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    
    const taskId = Number(active.id);
    const newStatus = String(over.id);
    const task = tasks.find(t => t.id === taskId);
    
    if (task && task.status !== newStatus && columns.some(c => c.id === newStatus)) {
      onStatusChange(taskId, newStatus);
    }
  };

  return (
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
            tasks={tasks.filter(t => (t.status || "Not Started") === column.id)}
            getProjectName={getProjectName}
            onTaskClick={onTaskClick}
            onDeleteTask={onDeleteTask}
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
  );
}

function KanbanColumn({ 
  column, 
  tasks, 
  getProjectName, 
  onTaskClick,
  onDeleteTask 
}: { 
  column: { id: string; label: string; color: string }; 
  tasks: Task[]; 
  getProjectName: (id: number) => string;
  onTaskClick: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
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
      <div className={cn("rounded-lg p-3 font-semibold", column.color)}>
        {column.label} ({tasks.length})
      </div>
      <div className="space-y-3">
        {tasks.map(task => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            getProjectName={getProjectName}
            onTaskClick={onTaskClick}
            onDeleteTask={onDeleteTask}
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
  onDeleteTask 
}: { 
  task: Task; 
  getProjectName: (id: number) => string;
  onTaskClick: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(isDragging && "opacity-50")}
    >
      <Card 
        className="cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing group relative"
        onClick={() => onTaskClick(task)}
        data-testid={`kanban-task-${task.id}`}
      >
        <div className="absolute top-2 right-2 invisible group-hover:visible z-10">
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
          <div className="font-medium text-sm">{task.name}</div>
          <Link 
            href={`/projects/${task.projectId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-muted-foreground mt-1 hover:text-primary hover:underline block"
            data-testid={`kanban-link-project-${task.projectId}`}
          >
            {getProjectName(task.projectId)}
          </Link>
          {task.assignee && (
            <div className="text-xs text-muted-foreground mt-2">Assigned: {task.assignee}</div>
          )}
          <div className="flex items-center justify-between mt-3">
            <Badge variant="outline" className="text-xs">
              {task.progress || 0}%
            </Badge>
            {task.endDate && (
              <span className="text-xs text-muted-foreground">
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
                    <div className="mt-1 text-sm text-muted-foreground break-words">
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
