import { useState, useMemo } from "react";
import { useAllTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, GanttChart, Columns3, Calendar as CalendarIcon } from "lucide-react";
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

export default function Tasks() {
  const { currentOrganization } = useOrganization();
  const { data: tasks, isLoading } = useAllTasks();
  const { data: projects } = useProjects(currentOrganization?.id);
  const [view, setView] = useState<"gantt" | "kanban">("gantt");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      projectId: 0,
      name: "",
      description: "",
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      progress: 0,
      status: "Not Started",
      assignee: "",
    }
  });

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    form.reset({
      projectId: task.projectId,
      name: task.name,
      description: task.description || "",
      startDate: task.startDate,
      endDate: task.endDate,
      progress: task.progress || 0,
      status: task.status || "Not Started",
      assignee: task.assignee || "",
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTask(null);
    form.reset({
      projectId: projects?.[0]?.id || 0,
      name: "",
      description: "",
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      progress: 0,
      status: "Not Started",
      assignee: "",
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: any) => {
    if (data.projectId === 0) {
      toast({ title: "Error", description: "Please select a project", variant: "destructive" });
      return;
    }
    
    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, projectId: editingTask.projectId, ...data }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Task updated" });
          setIsDialogOpen(false);
          setEditingTask(null);
        }
      });
    } else {
      createTask.mutate(data, {
        onSuccess: () => {
          toast({ title: "Success", description: "Task created" });
          setIsDialogOpen(false);
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
        <div className="flex gap-3">
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
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingTask(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} data-testid="button-add-task">
                <Plus className="mr-2 h-4 w-4" /> Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editingTask ? "Edit Task" : "Add New Task"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Controller control={form.control} name="projectId" render={({field}) => (
                    <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value || "")}>
                      <SelectTrigger data-testid="select-task-project"><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>
                        {projects?.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Task Name</Label>
                  <Input {...form.register("name")} data-testid="input-task-name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" {...form.register("startDate")} data-testid="input-task-start" />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" {...form.register("endDate")} data-testid="input-task-end" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Controller control={form.control} name="status" render={({field}) => (
                      <Select onValueChange={field.onChange} value={field.value || "Not Started"}>
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
                    <Label>Progress (%)</Label>
                    <Input type="number" min="0" max="100" {...form.register("progress", { valueAsNumber: true })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea {...form.register("description")} />
                </div>
                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Input {...form.register("assignee")} placeholder="Name of assignee" />
                </div>
                <DialogFooter>
                  {editingTask && (
                    <Button 
                      type="button" 
                      variant="destructive" 
                      onClick={() => {
                        deleteTask.mutate({ id: editingTask.id, projectId: editingTask.projectId }, {
                          onSuccess: () => {
                            toast({ title: "Deleted", description: "Task deleted" });
                            setIsDialogOpen(false);
                            setEditingTask(null);
                          }
                        });
                      }}
                    >
                      Delete
                    </Button>
                  )}
                  <Button type="submit" data-testid="button-save-task">
                    {editingTask ? "Update Task" : "Save Task"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === "gantt" ? (
        <GanttView tasks={tasks || []} projects={projects || []} onTaskClick={openEditDialog} />
      ) : (
        <KanbanView tasks={tasks || []} projects={projects || []} onTaskClick={openEditDialog} />
      )}
    </div>
  );
}

function GanttView({ tasks, projects, onTaskClick }: { tasks: Task[]; projects: any[]; onTaskClick: (task: Task) => void }) {
  const today = new Date();
  
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
    
    const dateRange = eachDayOfInterval({ start: minDate, end: maxDate });
    return { minDate, maxDate, dateRange };
  }, [tasks, today]);

  const getProjectName = (projectId: number) => {
    return projects.find(p => p.id === projectId)?.name || "Unknown";
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No tasks yet. Add your first task to see the Gantt chart.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex border-b bg-muted/50">
              <div className="w-64 flex-shrink-0 border-r p-3 font-semibold text-sm text-foreground">Task</div>
              <div className="flex-1 flex">
                {dateRange.filter((_, i) => i % 7 === 0).map((date, i) => (
                  <div key={i} className="flex-1 min-w-[100px] p-2 text-center text-xs font-medium text-muted-foreground border-l">
                    {format(date, 'MMM d')}
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
                    <div className="text-xs text-muted-foreground truncate">{getProjectName(task.projectId)}</div>
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
      </CardContent>
    </Card>
  );
}

function KanbanView({ tasks, projects, onTaskClick }: { tasks: Task[]; projects: any[]; onTaskClick: (task: Task) => void }) {
  const columns = [
    { id: "Not Started", label: "Not Started", color: "bg-slate-100" },
    { id: "In Progress", label: "In Progress", color: "bg-blue-100" },
    { id: "Completed", label: "Completed", color: "bg-emerald-100" },
  ];

  const getProjectName = (projectId: number) => {
    return projects.find(p => p.id === projectId)?.name || "Unknown";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {columns.map(column => {
        const columnTasks = tasks.filter(t => (t.status || "Not Started") === column.id);
        return (
          <div key={column.id} className="space-y-4">
            <div className={cn("rounded-lg p-3 font-semibold", column.color)}>
              {column.label} ({columnTasks.length})
            </div>
            <div className="space-y-3">
              {columnTasks.map(task => (
                <Card 
                  key={task.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onTaskClick(task)}
                  data-testid={`kanban-task-${task.id}`}
                >
                  <CardContent className="p-4">
                    <div className="font-medium text-sm">{task.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{getProjectName(task.projectId)}</div>
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
              ))}
              {columnTasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No tasks
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
