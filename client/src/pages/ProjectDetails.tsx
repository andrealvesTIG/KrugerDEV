import { useState, useMemo, useEffect } from "react";
import { useRoute } from "wouter";
import { useProject, useUpdateProject } from "@/hooks/use-projects";
import { useRisks, useCreateRisk, useDeleteRisk } from "@/hooks/use-risks";
import { useMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone } from "@/hooks/use-milestones";
import { useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue } from "@/hooks/use-issues";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, CheckSquare, Calendar as CalendarIcon, DollarSign, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, FileText, Pencil, Check, X, LayoutGrid, GanttChartSquare, Table, GripVertical, User, Flag, GanttChart, Columns3, History, Clock } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useTaskHistory } from "@/hooks/use-tasks";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays, differenceInDays, parseISO, isAfter, isBefore, startOfDay, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRiskSchema, insertMilestoneSchema, insertIssueSchema, insertTaskSchema } from "@shared/schema";
import type { Milestone, Task } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const id = parseInt(params?.id || "0");
  const { data: project, isLoading } = useProject(id);
  const { mutate: updateProject } = useUpdateProject();
  const { toast } = useToast();

  if (isLoading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!project) return <div>Project not found</div>;

  const handleStatusChange = (status: string) => {
    updateProject({ id: project.id, status }, {
      onSuccess: () => toast({ title: "Status Updated", description: `Project status changed to ${status}` })
    });
  };

  const handleHealthChange = (health: string) => {
    updateProject({ id: project.id, health }, {
      onSuccess: () => toast({ title: "Health Updated", description: `Project health changed to ${health}` })
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-display font-bold text-slate-900">{project.name}</h1>
            <Badge className={cn(
              "text-sm px-3 py-1",
              project.health === 'Green' ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" :
              project.health === 'Yellow' ? "bg-amber-100 text-amber-800 hover:bg-amber-100" :
              "bg-rose-100 text-rose-800 hover:bg-rose-100"
            )}>
              {project.health} Health
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-slate-500">{project.description}</p>
        </div>
        <div className="flex gap-3">
           <Select value={project.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Initiation">Initiation</SelectItem>
              <SelectItem value="Planning">Planning</SelectItem>
              <SelectItem value="Execution">Execution</SelectItem>
              <SelectItem value="Monitoring">Monitoring</SelectItem>
              <SelectItem value="Closing">Closing</SelectItem>
            </SelectContent>
          </Select>
          
           <Select value={project.health || "Green"} onValueChange={handleHealthChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Green">Green</SelectItem>
              <SelectItem value="Yellow">Yellow</SelectItem>
              <SelectItem value="Red">Red</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Budget</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><DollarSign className="h-5 w-5 mr-1 text-slate-400" />{Number(project.budget).toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Progress</CardTitle></CardHeader>
          <CardContent>
             <div className="text-2xl font-bold">{project.completionPercentage}%</div>
             <Progress value={project.completionPercentage || 0} className="h-2 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Start Date</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><CalendarIcon className="h-5 w-5 mr-2 text-slate-400" />{project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : '-'}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">End Date</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><CalendarIcon className="h-5 w-5 mr-2 text-slate-400" />{project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : '-'}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="bg-muted p-1 rounded-xl">
          <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Project Summary</TabsTrigger>
          <TabsTrigger value="milestones" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Milestones</TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Tasks</TabsTrigger>
          <TabsTrigger value="risks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Risks Log</TabsTrigger>
          <TabsTrigger value="issues" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Issues</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="summary">
            <ProjectSummaryTab project={project} onUpdate={updateProject} />
          </TabsContent>
          <TabsContent value="milestones">
            <MilestonesTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="tasks">
            <TasksTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="risks">
            <RisksTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesTab projectId={project.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function ProjectSummaryTab({ project, onUpdate }: { project: any; onUpdate: any }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  
  const form = useForm({
    defaultValues: {
      name: project.name || "",
      description: project.description || "",
      status: project.status || "Initiation",
      priority: project.priority || "Medium",
      startDate: project.startDate ? format(new Date(project.startDate), 'yyyy-MM-dd') : "",
      endDate: project.endDate ? format(new Date(project.endDate), 'yyyy-MM-dd') : "",
      budget: project.budget || "0",
      health: project.health || "Green",
      completionPercentage: project.completionPercentage || 0,
    }
  });

  const onSubmit = (data: any) => {
    onUpdate({ id: project.id, ...data }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project updated successfully" });
        setIsEditing(false);
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Project Summary</CardTitle>
          <CardDescription>View and edit project details</CardDescription>
        </div>
        <Button 
          variant={isEditing ? "outline" : "default"} 
          onClick={() => setIsEditing(!isEditing)}
          data-testid="button-edit-project"
        >
          {isEditing ? "Cancel" : "Edit Project"}
        </Button>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input {...form.register("name")} data-testid="input-project-name" />
              </div>
              <div className="space-y-2">
                <Label>Budget</Label>
                <Input type="number" {...form.register("budget")} data-testid="input-project-budget" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Controller control={form.control} name="status" render={({field}) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Initiation">Initiation</SelectItem>
                      <SelectItem value="Planning">Planning</SelectItem>
                      <SelectItem value="Execution">Execution</SelectItem>
                      <SelectItem value="Monitoring">Monitoring</SelectItem>
                      <SelectItem value="Closing">Closing</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Controller control={form.control} name="priority" render={({field}) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" {...form.register("startDate")} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" {...form.register("endDate")} />
              </div>
              <div className="space-y-2">
                <Label>Health</Label>
                <Controller control={form.control} name="health" render={({field}) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Green">Green</SelectItem>
                      <SelectItem value="Yellow">Yellow</SelectItem>
                      <SelectItem value="Red">Red</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Completion (%)</Label>
                <Input type="number" min="0" max="100" {...form.register("completionPercentage", { valueAsNumber: true })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea {...form.register("description")} className="min-h-[100px]" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" data-testid="button-save-project">Save Changes</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <Label className="text-xs text-slate-500">Project Name</Label>
                <p className="font-medium">{project.name}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Status</Label>
                <p className="font-medium">{project.status}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Priority</Label>
                <p className="font-medium">{project.priority}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Budget</Label>
                <p className="font-medium">${Number(project.budget).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Health</Label>
                <Badge className={cn(
                  project.health === 'Green' ? "bg-emerald-100 text-emerald-800" :
                  project.health === 'Yellow' ? "bg-amber-100 text-amber-800" :
                  "bg-rose-100 text-rose-800"
                )}>{project.health}</Badge>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Completion</Label>
                <p className="font-medium">{project.completionPercentage}%</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">Start Date</Label>
                <p className="font-medium">{project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : 'Not set'}</p>
              </div>
              <div>
                <Label className="text-xs text-slate-500">End Date</Label>
                <p className="font-medium">{project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : 'Not set'}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Description</Label>
              <p className="mt-1 text-slate-600">{project.description || 'No description provided.'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RisksTab({ projectId }: { projectId: number }) {
  const { data: risks, isLoading } = useRisks(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createRisk = useCreateRisk();
  const deleteRisk = useDeleteRisk();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertRiskSchema),
    defaultValues: {
      projectId,
      title: "",
      description: "",
      probability: "Medium",
      impact: "Medium",
      status: "Open"
    }
  });

  const onSubmit = (data: any) => {
    createRisk.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Risk added" });
        setIsDialogOpen(false);
        form.reset({ projectId, title: "", description: "", probability: "Medium", impact: "Medium", status: "Open" });
      }
    });
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Project Risks</CardTitle>
          <CardDescription>Track and mitigate potential issues.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Risk</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Risk</DialogTitle>
              <DialogDescription>Identify and track potential project risks.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Probability</Label>
                  <Controller control={form.control} name="probability" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Low">Low</SelectItem>
                         <SelectItem value="Medium">Medium</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Impact</Label>
                   <Controller control={form.control} name="impact" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Low">Low</SelectItem>
                         <SelectItem value="Medium">Medium</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input {...form.register("description")} />
              </div>
              <DialogFooter><Button type="submit">Save Risk</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {risks?.map(risk => (
            <div key={risk.id} className="flex items-start justify-between rounded-lg border p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                   <span className="font-semibold">{risk.title}</span>
                   <Badge variant="outline" className={cn(
                     risk.probability === 'High' ? "bg-red-50 text-red-700" : "bg-slate-50"
                   )}>{risk.probability} Prob</Badge>
                   <Badge variant="outline" className={cn(
                     risk.impact === 'High' ? "bg-red-50 text-red-700" : "bg-slate-50"
                   )}>{risk.impact} Impact</Badge>
                </div>
                <p className="text-sm text-slate-500">{risk.description}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteRisk.mutate({id: risk.id, projectId})}><Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" /></Button>
            </div>
          ))}
          {risks?.length === 0 && <div className="text-center py-8 text-slate-500">No risks recorded.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

const MILESTONE_STATUSES = ["Backlog", "To Do", "In Progress", "Done"] as const;
type MilestoneStatus = typeof MILESTONE_STATUSES[number];

const statusColors: Record<MilestoneStatus, string> = {
  "Backlog": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "To Do": "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  "In Progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  "Done": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
};

const priorityColorsMs: Record<string, string> = {
  Low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  High: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
};

function SortableMilestoneCard({ 
  milestone, 
  projectId, 
  onUpdate, 
  onDelete,
  onEdit 
}: { 
  milestone: Milestone; 
  projectId: number; 
  onUpdate: any; 
  onDelete: any;
  onEdit: (milestone: Milestone) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: milestone.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dueDate = new Date(milestone.dueDate);
  const isOverdue = !milestone.completed && isBefore(startOfDay(dueDate), startOfDay(new Date()));
  const daysUntilDue = differenceInDays(dueDate, new Date());

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border bg-card p-3 shadow-sm transition-all cursor-pointer",
        isDragging && "shadow-lg ring-2 ring-primary/20",
        isOverdue && "border-red-300 dark:border-red-800"
      )}
      data-testid={`milestone-card-${milestone.id}`}
    >
      <div className="flex items-start gap-2">
        <div 
          {...attributes} 
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`drag-handle-milestone-${milestone.id}`}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => onUpdate.mutate({ id: milestone.id, projectId, completed: !milestone.completed })}
              className={cn(
                "h-5 w-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
                milestone.completed 
                  ? "bg-primary border-primary text-white" 
                  : "border-slate-300 dark:border-slate-600"
              )}
              data-testid={`checkbox-milestone-${milestone.id}`}
            >
              {milestone.completed && <Check className="h-3.5 w-3.5" />}
            </button>
            <span 
              className={cn(
                "font-medium text-sm truncate flex-1 cursor-pointer",
                milestone.completed && "line-through text-muted-foreground"
              )}
              onClick={() => onEdit(milestone)}
              data-testid={`title-milestone-${milestone.id}`}
            >
              {milestone.title}
            </span>
          </div>

          {milestone.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{milestone.description}</p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
                    isOverdue 
                      ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" 
                      : "bg-muted text-muted-foreground"
                  )}
                  data-testid={`duedate-milestone-${milestone.id}`}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {format(dueDate, 'MMM d')}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isOverdue 
                  ? `Overdue by ${Math.abs(daysUntilDue)} days`
                  : daysUntilDue === 0 
                    ? "Due today" 
                    : `Due in ${daysUntilDue} days`
                }
              </TooltipContent>
            </Tooltip>

            {milestone.priority && milestone.priority !== "Medium" && (
              <Badge variant="outline" className={cn("text-xs", priorityColorsMs[milestone.priority])}>
                <Flag className="h-3 w-3 mr-1" />
                {milestone.priority}
              </Badge>
            )}

            {milestone.assignee && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex items-center gap-1 text-xs text-muted-foreground" data-testid={`assignee-milestone-${milestone.id}`}>
                    <User className="h-3 w-3" />
                    <span className="truncate max-w-[80px]">{milestone.assignee}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Assigned to {milestone.assignee}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-7 w-7"
            onClick={() => onEdit(milestone)} 
            data-testid={`button-edit-milestone-${milestone.id}`}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-7 w-7"
            onClick={() => onDelete.mutate({ id: milestone.id, projectId })} 
            data-testid={`button-delete-milestone-${milestone.id}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function BoardColumn({ 
  status, 
  milestones, 
  projectId, 
  onUpdate, 
  onDelete,
  onEdit 
}: { 
  status: MilestoneStatus; 
  milestones: Milestone[]; 
  projectId: number; 
  onUpdate: any; 
  onDelete: any;
  onEdit: (milestone: Milestone) => void;
}) {
  const columnMilestones = milestones.filter(m => (m.status || "Backlog") === status);

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] flex-1" data-testid={`board-column-${status.toLowerCase().replace(' ', '-')}`}>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs font-medium", statusColors[status])}>
            {status}
          </Badge>
          <span className="text-xs text-muted-foreground">{columnMilestones.length}</span>
        </div>
      </div>
      
      <ScrollArea className="flex-1 pr-2">
        <div className="space-y-2 pb-4 min-h-[200px]">
          <SortableContext items={columnMilestones.map(m => m.id)} strategy={verticalListSortingStrategy}>
            {columnMilestones.map(milestone => (
              <SortableMilestoneCard
                key={milestone.id}
                milestone={milestone}
                projectId={projectId}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))}
          </SortableContext>
          {columnMilestones.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
              Drop milestones here
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MilestoneGanttChart({ milestones, projectId, onEdit }: { milestones: Milestone[]; projectId: number; onEdit: (milestone: Milestone) => void }) {
  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [milestones]);

  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (milestones.length === 0) {
      const today = new Date();
      return { 
        minDate: today, 
        maxDate: addDays(today, 30), 
        totalDays: 30 
      };
    }
    
    const dates = milestones.flatMap(m => {
      const start = m.startDate ? new Date(m.startDate) : new Date(m.dueDate);
      const end = new Date(m.dueDate);
      return [start, end];
    });
    
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    
    const paddedMin = addDays(min, -7);
    const paddedMax = addDays(max, 14);
    
    return {
      minDate: paddedMin,
      maxDate: paddedMax,
      totalDays: Math.max(differenceInDays(paddedMax, paddedMin), 30)
    };
  }, [milestones]);

  const getBarPosition = (milestone: Milestone) => {
    const startDate = milestone.startDate ? new Date(milestone.startDate) : addDays(new Date(milestone.dueDate), -7);
    const endDate = new Date(milestone.dueDate);
    
    const startOffset = differenceInDays(startDate, minDate);
    const duration = Math.max(differenceInDays(endDate, startDate), 1);
    
    const left = (startOffset / totalDays) * 100;
    const width = (duration / totalDays) * 100;
    
    return { left: Math.max(0, left), width: Math.min(width, 100 - left) };
  };

  const monthMarkers = useMemo(() => {
    const markers: { date: Date; label: string; position: number }[] = [];
    let current = new Date(minDate);
    current.setDate(1);
    
    while (isBefore(current, maxDate)) {
      const position = (differenceInDays(current, minDate) / totalDays) * 100;
      if (position >= 0 && position <= 100) {
        markers.push({
          date: current,
          label: format(current, 'MMM yyyy'),
          position
        });
      }
      current = addDays(current, 32);
      current.setDate(1);
    }
    return markers;
  }, [minDate, maxDate, totalDays]);

  const todayPosition = useMemo(() => {
    const today = new Date();
    const position = (differenceInDays(today, minDate) / totalDays) * 100;
    return position >= 0 && position <= 100 ? position : null;
  }, [minDate, totalDays]);

  if (milestones.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No milestones to display. Add milestones to see the Gantt chart.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative border rounded-lg overflow-hidden">
        <div className="flex border-b bg-muted/50">
          <div className="w-64 flex-shrink-0 p-3 font-medium text-sm border-r">Milestone</div>
          <div className="flex-1 relative h-10">
            {monthMarkers.map((marker, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-border"
                style={{ left: `${marker.position}%` }}
              >
                <span className="absolute top-2 left-2 text-xs text-muted-foreground whitespace-nowrap">
                  {marker.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {sortedMilestones.map((milestone, index) => {
          const { left, width } = getBarPosition(milestone);
          const barColor = milestone.completed 
            ? "bg-emerald-500" 
            : milestone.status === "In Progress" 
              ? "bg-amber-500" 
              : "bg-blue-500";

          return (
            <div 
              key={milestone.id} 
              className={cn(
                "flex border-b last:border-b-0 group cursor-pointer",
                index % 2 === 0 ? "bg-background" : "bg-muted/20"
              )}
              onClick={() => onEdit(milestone)}
              data-testid={`gantt-row-milestone-${milestone.id}`}
            >
              <div className="w-64 flex-shrink-0 p-3 border-r">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-4 w-4 rounded-full flex items-center justify-center text-white",
                    milestone.completed ? "bg-emerald-500" : "bg-blue-500"
                  )}>
                    {milestone.completed && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <span className={cn(
                    "text-sm font-medium truncate",
                    milestone.completed && "line-through text-muted-foreground"
                  )}>
                    {milestone.title}
                  </span>
                </div>
              </div>
              <div className="flex-1 relative h-12 flex items-center">
                {todayPosition !== null && (
                  <div 
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
                    style={{ left: `${todayPosition}%` }}
                  />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "absolute h-6 rounded-full transition-all",
                        barColor,
                        "group-hover:ring-2 group-hover:ring-primary/30"
                      )}
                      style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                      data-testid={`gantt-bar-milestone-${milestone.id}`}
                    >
                      <div className="flex items-center h-full px-2 overflow-hidden">
                        <span className="text-xs text-white font-medium truncate">
                          {milestone.title}
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-sm">
                      <div className="font-medium">{milestone.title}</div>
                      <div className="text-xs text-muted-foreground">
                        Due: {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
                      </div>
                      {milestone.assignee && (
                        <div className="text-xs text-muted-foreground">
                          Assignee: {milestone.assignee}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <span>Planned</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-amber-500" />
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-px bg-red-500" />
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

function MilestoneEditDialog({ 
  milestone, 
  projectId, 
  open, 
  onOpenChange, 
  onUpdate 
}: { 
  milestone: Milestone | null; 
  projectId: number;
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onUpdate: any;
}) {
  const [title, setTitle] = useState(milestone?.title || "");
  const [description, setDescription] = useState(milestone?.description || "");
  const [dueDate, setDueDate] = useState(milestone?.dueDate ? format(new Date(milestone.dueDate), 'yyyy-MM-dd') : "");
  const [startDate, setStartDate] = useState(milestone?.startDate ? format(new Date(milestone.startDate), 'yyyy-MM-dd') : "");
  const [status, setStatus] = useState(milestone?.status || "Backlog");
  const [priority, setPriority] = useState(milestone?.priority || "Medium");
  const [assignee, setAssignee] = useState(milestone?.assignee || "");

  useMemo(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDescription(milestone.description || "");
      setDueDate(milestone.dueDate ? format(new Date(milestone.dueDate), 'yyyy-MM-dd') : "");
      setStartDate(milestone.startDate ? format(new Date(milestone.startDate), 'yyyy-MM-dd') : "");
      setStatus(milestone.status || "Backlog");
      setPriority(milestone.priority || "Medium");
      setAssignee(milestone.assignee || "");
    }
  }, [milestone]);

  const handleSave = () => {
    if (!milestone) return;
    onUpdate.mutate({
      id: milestone.id,
      projectId,
      title,
      description: description || null,
      dueDate,
      startDate: startDate || null,
      status,
      priority,
      assignee: assignee || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Milestone</DialogTitle>
          <DialogDescription>Update the milestone details below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              data-testid="input-milestone-title-dialog"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="Add description..."
              className="resize-none"
              data-testid="input-milestone-description-dialog"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                data-testid="input-milestone-start-dialog"
              />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input 
                type="date" 
                value={dueDate} 
                onChange={(e) => setDueDate(e.target.value)} 
                data-testid="input-milestone-due-dialog"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="select-milestone-status-dialog">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-milestone-priority-dialog">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assignee</Label>
            <Input 
              value={assignee} 
              onChange={(e) => setAssignee(e.target.value)} 
              placeholder="Enter assignee name"
              data-testid="input-milestone-assignee-dialog"
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim()} data-testid="button-save-milestone-dialog">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ViewMode = "board" | "gantt" | "table";

function MilestonesTab({ projectId }: { projectId: number }) {
  const { data: milestones, isLoading } = useMilestones(projectId);
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDueDate, setNewDueDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [newStatus, setNewStatus] = useState<MilestoneStatus>("Backlog");
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const milestone = milestones?.find(m => m.id === active.id);
    if (!milestone) return;

    const overStatus = MILESTONE_STATUSES.find(status => {
      const columnMilestones = milestones?.filter(m => (m.status || "Backlog") === status) || [];
      return columnMilestones.some(m => m.id === over.id);
    });

    if (overStatus && overStatus !== (milestone.status || "Backlog")) {
      const newCompleted = overStatus === "Done";
      updateMilestone.mutate({
        id: milestone.id,
        projectId,
        status: overStatus,
        completed: newCompleted,
      });
      toast({
        title: "Milestone Updated",
        description: `Moved to ${overStatus}`,
      });
    }
  };

  const handleAddMilestone = () => {
    if (!newTitle.trim()) return;
    createMilestone.mutate({
      projectId,
      title: newTitle,
      dueDate: newDueDate || format(new Date(), 'yyyy-MM-dd'),
      completed: false,
      status: newStatus,
    }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Milestone added" });
        setNewTitle("");
        setNewDueDate(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
        setNewStatus("Backlog");
        setIsAdding(false);
      }
    });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>;

  const activeMilestone = activeDragId ? milestones?.find(m => m.id === activeDragId) : null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>
              Key deliverables and dates. Drag cards to change status. Click to edit details.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-lg p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={viewMode === "board" ? "secondary" : "ghost"} 
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("board")}
                    data-testid="button-view-board"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Board View</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={viewMode === "gantt" ? "secondary" : "ghost"} 
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("gantt")}
                    data-testid="button-view-gantt"
                  >
                    <GanttChartSquare className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Gantt Chart</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={viewMode === "table" ? "secondary" : "ghost"} 
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode("table")}
                    data-testid="button-view-table"
                  >
                    <Table className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Table View</TooltipContent>
              </Tooltip>
            </div>
            <Button size="sm" onClick={() => setIsAdding(true)} disabled={isAdding} data-testid="button-add-milestone">
              <Plus className="mr-2 h-4 w-4" /> Add Milestone
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isAdding && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30" data-testid="form-add-milestone">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Input 
                    value={newTitle} 
                    onChange={(e) => setNewTitle(e.target.value)} 
                    placeholder="Milestone title..."
                    autoFocus
                    data-testid="input-milestone-title-new"
                  />
                </div>
                <div>
                  <Input 
                    type="date" 
                    value={newDueDate} 
                    onChange={(e) => setNewDueDate(e.target.value)} 
                    data-testid="input-milestone-date-new"
                  />
                </div>
                <div>
                  <Select value={newStatus} onValueChange={(v) => setNewStatus(v as MilestoneStatus)}>
                    <SelectTrigger data-testid="select-milestone-status-new">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MILESTONE_STATUSES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={handleAddMilestone} disabled={!newTitle.trim()} data-testid="button-save-milestone-new">
                  <Check className="mr-2 h-4 w-4" /> Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewTitle(""); }} data-testid="button-cancel-milestone-new">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {viewMode === "board" && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex gap-4 overflow-x-auto pb-4">
                {MILESTONE_STATUSES.map(status => (
                  <BoardColumn
                    key={status}
                    status={status}
                    milestones={milestones || []}
                    projectId={projectId}
                    onUpdate={updateMilestone}
                    onDelete={deleteMilestone}
                    onEdit={setEditingMilestone}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeMilestone && (
                  <div className="rounded-lg border bg-card p-3 shadow-lg opacity-90">
                    <span className="font-medium text-sm">{activeMilestone.title}</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {viewMode === "gantt" && (
            <MilestoneGanttChart 
              milestones={milestones || []} 
              projectId={projectId}
              onEdit={setEditingMilestone}
            />
          )}

          {viewMode === "table" && (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="border-b">
                    <th className="p-2 w-10"></th>
                    <th className="p-2 text-left text-sm font-medium text-muted-foreground">Title</th>
                    <th className="p-2 text-left text-sm font-medium text-muted-foreground w-28">Status</th>
                    <th className="p-2 text-left text-sm font-medium text-muted-foreground w-24">Priority</th>
                    <th className="p-2 text-left text-sm font-medium text-muted-foreground w-32">Due Date</th>
                    <th className="p-2 text-left text-sm font-medium text-muted-foreground w-28">Assignee</th>
                    <th className="p-2 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {milestones?.map(ms => (
                    <tr 
                      key={ms.id} 
                      className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setEditingMilestone(ms)}
                      data-testid={`row-milestone-${ms.id}`}
                    >
                      <td className="p-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMilestone.mutate({ id: ms.id, projectId, completed: !ms.completed });
                          }}
                          className={cn(
                            "h-5 w-5 rounded border flex items-center justify-center transition-colors",
                            ms.completed ? "bg-primary border-primary text-white" : "border-slate-300"
                          )}
                          data-testid={`checkbox-milestone-${ms.id}`}
                        >
                          {ms.completed && <Check className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className={cn("p-2 font-medium text-sm", ms.completed && "line-through text-muted-foreground")}>
                        {ms.title}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={cn("text-xs", statusColors[(ms.status as MilestoneStatus) || "Backlog"])}>
                          {ms.status || "Backlog"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={cn("text-xs", priorityColorsMs[ms.priority || "Medium"])}>
                          {ms.priority || "Medium"}
                        </Badge>
                      </td>
                      <td className="p-2 text-sm text-muted-foreground">
                        {format(new Date(ms.dueDate), 'MMM d, yyyy')}
                      </td>
                      <td className="p-2 text-sm text-muted-foreground truncate max-w-[100px]">
                        {ms.assignee || "-"}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={(e) => { e.stopPropagation(); setEditingMilestone(ms); }} 
                            data-testid={`button-edit-milestone-${ms.id}`}
                          >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={(e) => { e.stopPropagation(); deleteMilestone.mutate({ id: ms.id, projectId }); }} 
                            data-testid={`button-delete-milestone-${ms.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {milestones?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No milestones set. Click "Add Milestone" to create one.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <MilestoneEditDialog
        milestone={editingMilestone}
        projectId={projectId}
        open={!!editingMilestone}
        onOpenChange={(open) => !open && setEditingMilestone(null)}
        onUpdate={updateMilestone}
      />
    </>
  );
}

const taskStatusColors = {
  "Not Started": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Completed": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function TasksTab({ projectId }: { projectId: number }) {
  const { data: tasks, isLoading } = useTasks(projectId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { toast } = useToast();
  
  const [view, setView] = useState<"gantt" | "kanban">("gantt");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [durationDays, setDurationDays] = useState(7);

  const form = useForm({
    resolver: zodResolver(insertTaskSchema),
    mode: "onChange",
    defaultValues: {
      projectId: projectId,
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

  const startDate = form.watch("startDate");
  
  // Sync endDate when startDate or durationDays changes (match global Tasks behavior)
  useEffect(() => {
    if (startDate && durationDays > 0) {
      const start = parseISO(startDate);
      const end = addDays(start, durationDays - 1);
      form.setValue("endDate", format(end, 'yyyy-MM-dd'));
      form.setValue("durationDays", durationDays);
    }
  }, [startDate, durationDays, form]);
  
  const handleDurationChange = (days: number) => {
    setDurationDays(Math.max(1, days));
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
    form.reset({
      projectId: projectId,
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
          toast({ title: "Success", description: "Task updated" });
          setIsDialogOpen(false);
          setEditingTask(null);
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error?.message || "Failed to update task", variant: "destructive" });
        }
      });
    } else {
      createTask.mutate(taskData, {
        onSuccess: () => {
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              <DialogDescription>
                {editingTask ? "Modify the task details below." : "Fill in the details to create a new task."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Task Name</Label>
                <Input {...form.register("name")} data-testid="input-task-name" className={cn(form.formState.errors.name && "border-destructive")} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" {...form.register("startDate")} data-testid="input-task-start" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Duration (days)
                  </Label>
                  <Input 
                    type="number" 
                    min="1" 
                    max="365" 
                    value={durationDays}
                    onChange={(e) => handleDurationChange(Math.max(1, Number(e.target.value) || 1))}
                    data-testid="input-task-duration" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" {...form.register("endDate")} data-testid="input-task-end" disabled className="bg-muted" />
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
                  <Label className="flex items-center justify-between">
                    Progress
                    <span className="text-muted-foreground text-xs font-normal">{form.watch("progress") || 0}%</span>
                  </Label>
                  <Controller control={form.control} name="progress" render={({field}) => (
                    <Slider
                      value={[field.value || 0]}
                      onValueChange={(v) => field.onChange(v[0])}
                      min={0}
                      max={100}
                      step={5}
                      className="py-2"
                      data-testid="slider-task-progress"
                    />
                  )} />
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
                <Button 
                  type="submit" 
                  data-testid="button-save-task" 
                  disabled={createTask.isPending || updateTask.isPending || !form.formState.isValid}
                >
                  {(createTask.isPending || updateTask.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingTask ? "Update Task" : "Save Task"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        
        <ProjectTaskHistoryDialog 
          taskId={editingTask?.id || 0} 
          open={isHistoryOpen} 
          onOpenChange={setIsHistoryOpen} 
        />
      </div>

      {view === "gantt" ? (
        <ProjectGanttView tasks={tasks || []} onTaskClick={openEditDialog} />
      ) : (
        <ProjectKanbanView 
          tasks={tasks || []} 
          onTaskClick={openEditDialog}
          onStatusChange={(taskId, newStatus) => {
            const task = tasks?.find(t => t.id === taskId);
            if (task) {
              updateTask.mutate({ 
                id: taskId, 
                projectId: task.projectId, 
                status: newStatus 
              });
            }
          }}
        />
      )}
    </div>
  );
}

function ProjectGanttView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (task: Task) => void }) {
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
                    <div className="text-xs text-muted-foreground truncate">{task.assignee || "Unassigned"}</div>
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

function ProjectKanbanView({ 
  tasks, 
  onTaskClick, 
  onStatusChange 
}: { 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
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
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map(column => (
          <ProjectKanbanColumn
            key={column.id}
            column={column}
            tasks={tasks.filter(t => (t.status || "Not Started") === column.id)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="opacity-80">
            <Card className="shadow-lg border-primary">
              <CardContent className="p-4">
                <div className="font-medium text-sm">{activeTask.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{activeTask.assignee || "Unassigned"}</div>
              </CardContent>
            </Card>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function ProjectKanbanColumn({ 
  column, 
  tasks, 
  onTaskClick 
}: { 
  column: { id: string; label: string; color: string }; 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
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
          <ProjectDraggableTaskCard
            key={task.id}
            task={task}
            onTaskClick={onTaskClick}
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

function ProjectDraggableTaskCard({ 
  task, 
  onTaskClick 
}: { 
  task: Task; 
  onTaskClick: (task: Task) => void;
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
        className="cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing"
        onClick={() => onTaskClick(task)}
        data-testid={`kanban-task-${task.id}`}
      >
        <CardContent className="p-4">
          <div className="font-medium text-sm">{task.name}</div>
          <div className="text-xs text-muted-foreground mt-1">{task.assignee || "Unassigned"}</div>
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

function ProjectTaskHistoryDialog({ taskId, open, onOpenChange }: { taskId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
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
                      <Badge variant="outline" className="text-xs capitalize">{log.changeType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {log.changedAt ? format(new Date(log.changedAt), 'MMM d, yyyy h:mm a') : ''}
                      </span>
                    </div>
                    {log.changeSummary && (
                      <div className="text-sm mt-1">{log.changeSummary}</div>
                    )}
                    {log.previousValues && log.newValues && (
                      <div className="text-sm mt-1">
                        <span className="text-muted-foreground line-through">{log.previousValues}</span>
                        {' → '}
                        <span className="text-foreground">{log.newValues}</span>
                      </div>
                    )}
                    {log.changedByName && (
                      <div className="text-xs text-muted-foreground mt-1">by {log.changedByName}</div>
                    )}
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

const issuePriorityColors = {
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-amber-100 text-amber-700",
  Critical: "bg-rose-100 text-rose-700",
};

const issueStatusColors = {
  Open: "bg-red-100 text-red-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Resolved: "bg-emerald-100 text-emerald-700",
  Closed: "bg-slate-100 text-slate-700",
};

const typeIcons = {
  Bug: Bug,
  Enhancement: Sparkles,
  Task: ListTodo,
  Question: HelpCircle,
};

function IssuesTab({ projectId }: { projectId: number }) {
  const { data: issues, isLoading } = useIssues(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertIssueSchema),
    defaultValues: {
      projectId,
      title: "",
      description: "",
      priority: "Medium",
      status: "Open",
      type: "Bug",
      assignee: ""
    }
  });

  const onSubmit = (data: any) => {
    createIssue.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Issue created" });
        setIsDialogOpen(false);
        form.reset({ projectId, title: "", description: "", priority: "Medium", status: "Open", type: "Bug", assignee: "" });
      }
    });
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Project Issues</CardTitle>
          <CardDescription>Track bugs, tasks, and enhancements.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button size="sm" data-testid="button-add-issue"><Plus className="mr-2 h-4 w-4" /> Add Issue</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Issue</DialogTitle>
              <DialogDescription>Create a new bug, task, or enhancement.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} data-testid="input-issue-title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Controller control={form.control} name="type" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value || "Bug"}>
                       <SelectTrigger data-testid="select-issue-type"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Bug">Bug</SelectItem>
                         <SelectItem value="Enhancement">Enhancement</SelectItem>
                         <SelectItem value="Task">Task</SelectItem>
                         <SelectItem value="Question">Question</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                   <Controller control={form.control} name="priority" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                       <SelectTrigger data-testid="select-issue-priority"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Low">Low</SelectItem>
                         <SelectItem value="Medium">Medium</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                         <SelectItem value="Critical">Critical</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input {...form.register("description")} data-testid="input-issue-description" />
              </div>
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Input {...form.register("assignee")} data-testid="input-issue-assignee" placeholder="Name of assignee" />
              </div>
              <DialogFooter><Button type="submit" data-testid="button-save-issue">Save Issue</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {issues?.map(issue => {
            const TypeIcon = typeIcons[issue.type as keyof typeof typeIcons] || Bug;
            return (
              <div key={issue.id} className="flex items-start justify-between rounded-lg border p-4" data-testid={`card-issue-${issue.id}`}>
                <div className="flex gap-3">
                  <div className="mt-0.5">
                    <TypeIcon className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{issue.title}</span>
                      <Badge variant="outline" className={cn("text-xs", issuePriorityColors[issue.priority as keyof typeof issuePriorityColors])}>
                        {issue.priority}
                      </Badge>
                      <Badge variant="outline" className={cn("text-xs", issueStatusColors[issue.status as keyof typeof issueStatusColors])}>
                        {issue.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500">{issue.description}</p>
                    {issue.assignee && <p className="text-xs text-slate-400">Assigned to: {issue.assignee}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Select 
                    value={issue.status || "Open"} 
                    onValueChange={(status) => updateIssue.mutate({ id: issue.id, projectId, status })}
                  >
                    <SelectTrigger className="w-[120px] h-8 text-xs" data-testid={`select-status-${issue.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => deleteIssue.mutate({id: issue.id, projectId})} data-testid={`button-delete-issue-${issue.id}`}>
                    <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
          {issues?.length === 0 && <div className="text-center py-8 text-slate-500">No issues recorded.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
