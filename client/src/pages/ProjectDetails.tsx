import { useState, useMemo, useEffect } from "react";
import { useRoute } from "wouter";
import { useProject, useUpdateProject, useProjectHistory } from "@/hooks/use-projects";
import { useRisks, useCreateRisk, useUpdateRisk, useDeleteRisk, useRiskHistory } from "@/hooks/use-risks";
import { useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue, useIssueHistory } from "@/hooks/use-issues";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { useMilestones } from "@/hooks/use-milestones";
import { useChangeRequests, useCreateChangeRequest, useUpdateChangeRequest, useDeleteChangeRequest } from "@/hooks/use-change-requests";
import { useProjectDocuments, useCreateProjectDocument, useUpdateProjectDocument, useDeleteProjectDocument } from "@/hooks/use-project-documents";
import { useProjectFinancials, useCreateProjectFinancial, useUpdateProjectFinancial, useDeleteProjectFinancial } from "@/hooks/use-project-financials";
import { useRiskResourceAssignments, useUpdateRiskResourceAssignments, useTaskResourceAssignments, useUpdateTaskResourceAssignments, useIssueResourceAssignments, useUpdateIssueResourceAssignments, useResources } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import ProjectFinancialGrid from "@/components/ProjectFinancialGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, CheckSquare, Calendar as CalendarIcon, DollarSign, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, FileText, Pencil, Check, X, LayoutGrid, GanttChartSquare, Table, GripVertical, User, Flag, GanttChart, Columns3, History, Clock, MoreVertical, ZoomIn, ZoomOut, ChevronDown, ChevronRight, Milestone as MilestoneIcon, ClipboardList, FolderOpen, ExternalLink, Download, Upload, Link as LinkIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { useTaskHistory } from "@/hooks/use-tasks";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays, differenceInDays, parseISO, isAfter, isBefore, startOfDay, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRiskSchema, insertIssueSchema, insertTaskSchema } from "@shared/schema";
import type { Task, ProjectFinancial, Risk, Issue, ChangeRequest, ProjectDocument } from "@shared/schema";
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
  const { data: financials } = useProjectFinancials(id);
  const { mutate: updateProject } = useUpdateProject();
  const { toast } = useToast();
  const [isProjectHistoryOpen, setIsProjectHistoryOpen] = useState(false);

  // Calculate financial budget total if financials exist
  const financialBudgetTotal = useMemo(() => {
    if (!financials || financials.length === 0) return 0;
    return financials.reduce((sum: number, item: ProjectFinancial) => sum + Number(item.budgetAmount || 0), 0);
  }, [financials]);

  // Use financial budget total if available, otherwise use project budget
  const displayBudget = financialBudgetTotal > 0 ? financialBudgetTotal : Number(project?.budget || 0);

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
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setIsProjectHistoryOpen(true)}
                data-testid="button-project-history"
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View History</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
              Budget
              {financialBudgetTotal > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal">From Financials</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center"><DollarSign className="h-5 w-5 mr-1 text-slate-400" />{displayBudget.toLocaleString()}</div>
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

      {/* Timeline Section */}
      <ProjectTimeline 
        projectId={project.id}
        startDate={project.startDate}
        endDate={project.endDate}
      />

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="bg-muted p-1 rounded-xl flex-wrap">
          <TabsTrigger value="summary" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Project Summary</TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Tasks</TabsTrigger>
          <TabsTrigger value="risks" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Risks Log</TabsTrigger>
          <TabsTrigger value="issues" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Issues</TabsTrigger>
          <TabsTrigger value="financials" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Financials</TabsTrigger>
          <TabsTrigger value="change-requests" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Change Requests</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Documents</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="summary">
            <ProjectSummaryTab project={project} onUpdate={updateProject} />
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
          <TabsContent value="financials">
            <FinancialsTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="change-requests">
            <ChangeRequestsTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab projectId={project.id} />
          </TabsContent>
        </div>
      </Tabs>

      <ProjectHistoryDialog 
        projectId={project.id} 
        open={isProjectHistoryOpen} 
        onOpenChange={setIsProjectHistoryOpen} 
      />
    </div>
  );
}

function ProjectHistoryDialog({ projectId, open, onOpenChange }: { projectId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useProjectHistory(projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Project Change History
          </DialogTitle>
          <DialogDescription>
            View all changes made to this project over time.
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
                    data-testid={`project-history-entry-${log.id}`}
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

interface TimelineEvent {
  id: number;
  type: 'milestone' | 'task-milestone';
  title: string;
  date: Date;
  completed: boolean;
}

function ProjectTimeline({ 
  projectId, 
  startDate, 
  endDate 
}: { 
  projectId: number;
  startDate: string | null;
  endDate: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const { data: milestones } = useMilestones(projectId);
  
  // Parse project dates
  const projectStart = startDate ? parseISO(startDate) : null;
  const projectEnd = endDate ? parseISO(endDate) : null;
  
  // Get milestones from milestones table
  const allEvents = useMemo(() => {
    const events: TimelineEvent[] = [];
    
    // Add milestones from milestones table
    milestones?.forEach((m) => {
      events.push({
        id: m.id,
        type: 'milestone',
        title: m.title,
        date: parseISO(m.dueDate),
        completed: m.completed || false,
      });
    });
    
    // Sort by date
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [milestones]);
  
  // Calculate timeline range
  const timelineRange = useMemo(() => {
    if (!projectStart || !projectEnd) return null;
    
    const today = startOfDay(new Date());
    const totalDays = differenceInDays(projectEnd, projectStart);
    
    if (totalDays <= 0) return null;
    
    return {
      start: projectStart,
      end: projectEnd,
      totalDays,
      today,
      todayPosition: Math.max(0, Math.min(100, (differenceInDays(today, projectStart) / totalDays) * 100)),
    };
  }, [projectStart, projectEnd]);
  
  // Generate year markers for the timeline
  const yearMarkers = useMemo(() => {
    if (!timelineRange) return [];
    
    const markers: { year: number; position: number }[] = [];
    const startYear = timelineRange.start.getFullYear();
    const endYear = timelineRange.end.getFullYear();
    
    for (let year = startYear; year <= endYear; year++) {
      const yearStart = new Date(year, 0, 1);
      let position: number;
      
      if (year === startYear) {
        position = 0;
      } else {
        position = (differenceInDays(yearStart, timelineRange.start) / timelineRange.totalDays) * 100;
      }
      
      if (position >= 0 && position <= 100) {
        markers.push({ year, position });
      }
    }
    
    return markers;
  }, [timelineRange]);
  
  if (!projectStart || !projectEnd || !timelineRange) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GanttChart className="h-4 w-4" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Set project start and end dates to view the timeline.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover-elevate flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <GanttChart className="h-4 w-4" />
              Timeline
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Flag className="h-3 w-3 text-primary" />
                {format(projectStart, 'M/d/yyyy')}
              </span>
              <span className="flex items-center gap-1">
                {format(projectEnd, 'M/d/yyyy')}
                <Flag className="h-3 w-3 text-green-600" />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Year markers */}
            <div className="relative h-6 mb-1">
              {yearMarkers.map((marker) => (
                <span 
                  key={marker.year}
                  className="absolute text-xs text-muted-foreground"
                  style={{ left: `${marker.position}%` }}
                >
                  {marker.year}
                </span>
              ))}
            </div>
            
            {/* Timeline bar */}
            <div className="relative h-10">
              {/* Background bar */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-5 bg-muted rounded-full" />
              
              {/* Progress bar (from start to today if today is within range) */}
              {timelineRange.todayPosition >= 0 && timelineRange.todayPosition <= 100 && (
                <div 
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 h-5 bg-slate-400 dark:bg-slate-600",
                    timelineRange.todayPosition < 100 ? "rounded-l-full" : "rounded-full"
                  )}
                  style={{ left: 0, width: `${Math.max(1, timelineRange.todayPosition)}%` }}
                />
              )}
              
              {/* Today indicator */}
              {timelineRange.todayPosition >= 0 && timelineRange.todayPosition <= 100 && (
                <div 
                  className="absolute top-0 bottom-0 w-0.5 bg-green-600 z-10"
                  style={{ left: `${timelineRange.todayPosition}%` }}
                >
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-green-600 font-medium whitespace-nowrap">
                    {format(timelineRange.today, 'MMM dd')}
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-green-600" />
                </div>
              )}
              
              {/* Milestone markers */}
              {allEvents.map((event) => {
                const position = (differenceInDays(event.date, timelineRange.start) / timelineRange.totalDays) * 100;
                
                if (position < 0 || position > 100) return null;
                
                return (
                  <Tooltip key={`${event.type}-${event.id}`}>
                    <TooltipTrigger asChild>
                      <div 
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-sm rotate-45 cursor-pointer z-20 border",
                          event.completed 
                            ? "bg-green-600 border-green-700" 
                            : "bg-red-500 border-red-600"
                        )}
                        style={{ left: `${position}%` }}
                        data-testid={`timeline-milestone-${event.id}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(event.date, 'MMM d, yyyy')}
                        {event.completed && ' - Completed'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              
              {/* Start marker */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2">
                <Flag className="h-4 w-4 text-primary" />
              </div>
              
              {/* End marker */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
                <Flag className="h-4 w-4 text-green-600" />
              </div>
            </div>
            
            {/* Legend */}
            {allEvents.length > 0 && (
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-600 rounded-sm rotate-45" />
                  <span>Completed Milestone</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-sm rotate-45" />
                  <span>Pending Milestone</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-green-600" />
                  <span>Today</span>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
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
  const { currentOrganization } = useOrganization();
  const { data: risks, isLoading } = useRisks(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [deleteRiskData, setDeleteRiskData] = useState<Risk | null>(null);
  const [historyRiskId, setHistoryRiskId] = useState<number | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();
  const updateRiskResources = useUpdateRiskResourceAssignments();
  const { data: riskAssignments } = useRiskResourceAssignments(editingRisk?.id ?? null);
  const { toast } = useToast();

  useEffect(() => {
    if (riskAssignments && editingRisk) {
      setSelectedResourceIds(riskAssignments.map(a => a.resourceId));
    }
  }, [riskAssignments, editingRisk]);

  const form = useForm({
    resolver: zodResolver(insertRiskSchema),
    defaultValues: {
      projectId,
      title: "",
      description: "",
      probability: "Medium",
      impact: "Medium",
      status: "Open",
      mitigationPlan: ""
    }
  });

  const openEditDialog = (risk: Risk) => {
    setEditingRisk(risk);
    form.reset({
      projectId: risk.projectId,
      title: risk.title,
      description: risk.description || "",
      probability: risk.probability || "Medium",
      impact: risk.impact || "Medium",
      status: risk.status || "Open",
      mitigationPlan: risk.mitigationPlan || ""
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingRisk(null);
    setSelectedResourceIds([]);
    form.reset({
      projectId,
      title: "",
      description: "",
      probability: "Medium",
      impact: "Medium",
      status: "Open",
      mitigationPlan: ""
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: any) => {
    if (editingRisk) {
      updateRisk.mutate({ id: editingRisk.id, projectId, ...data }, {
        onSuccess: () => {
          updateRiskResources.mutate({ riskId: editingRisk.id, resourceIds: selectedResourceIds });
          toast({ title: "Success", description: "Risk updated" });
          setIsDialogOpen(false);
          setEditingRisk(null);
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error?.message || "Failed to update risk", variant: "destructive" });
        }
      });
    } else {
      createRisk.mutate(data, {
        onSuccess: (newRisk: any) => {
          if (selectedResourceIds.length > 0 && newRisk?.id) {
            updateRiskResources.mutate({ riskId: newRisk.id, resourceIds: selectedResourceIds });
          }
          toast({ title: "Success", description: "Risk added" });
          setIsDialogOpen(false);
        }
      });
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Project Risks</CardTitle>
          <CardDescription>Track and mitigate potential issues.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingRisk(null); }}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreateDialog}><Plus className="mr-2 h-4 w-4" /> Add Risk</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingRisk ? "Edit Risk" : "Add New Risk"}</DialogTitle>
              <DialogDescription>{editingRisk ? "Modify the risk details below." : "Identify and track potential project risks."}</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} data-testid="input-risk-title" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Probability</Label>
                  <Controller control={form.control} name="probability" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                       <SelectTrigger data-testid="select-risk-probability"><SelectValue /></SelectTrigger>
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
                       <SelectTrigger data-testid="select-risk-impact"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Low">Low</SelectItem>
                         <SelectItem value="Medium">Medium</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                   <Controller control={form.control} name="status" render={({field}) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                       <SelectTrigger data-testid="select-risk-status"><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Open">Open</SelectItem>
                         <SelectItem value="Mitigated">Mitigated</SelectItem>
                         <SelectItem value="Closed">Closed</SelectItem>
                       </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea {...form.register("description")} data-testid="input-risk-description" />
              </div>
              <div className="space-y-2">
                <Label>Mitigation Plan</Label>
                <Textarea {...form.register("mitigationPlan")} placeholder="How will this risk be mitigated?" data-testid="input-risk-mitigation" />
              </div>
              <ResourceAssignment
                organizationId={currentOrganization?.id || null}
                selectedResourceIds={selectedResourceIds}
                onSelectionChange={setSelectedResourceIds}
                label="Assigned Resources"
              />
              <DialogFooter className="gap-2">
                {editingRisk && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={() => {
                      deleteRisk.mutate({ id: editingRisk.id, projectId }, {
                        onSuccess: () => {
                          toast({ title: "Deleted", description: "Risk deleted" });
                          setIsDialogOpen(false);
                          setEditingRisk(null);
                        }
                      });
                    }}
                  >
                    Delete
                  </Button>
                )}
                <Button type="submit" data-testid="button-save-risk" disabled={createRisk.isPending || updateRisk.isPending}>
                  {(createRisk.isPending || updateRisk.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingRisk ? "Update Risk" : "Save Risk"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {risks?.map(risk => (
            <div 
              key={risk.id} 
              className="flex items-start justify-between rounded-lg border p-4 cursor-pointer hover-elevate transition-colors"
              onClick={() => openEditDialog(risk)}
              data-testid={`risk-card-${risk.id}`}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                   <span className="font-semibold">{risk.title}</span>
                   <Badge variant="outline" className={cn(
                     risk.probability === 'High' ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-slate-50 dark:bg-slate-800"
                   )}>{risk.probability} Prob</Badge>
                   <Badge variant="outline" className={cn(
                     risk.impact === 'High' ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-slate-50 dark:bg-slate-800"
                   )}>{risk.impact} Impact</Badge>
                   <Badge variant="outline" className={cn(
                     risk.status === 'Open' ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                     risk.status === 'Mitigated' ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                     "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                   )}>{risk.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{risk.description}</p>
                {risk.mitigationPlan && (
                  <p className="text-xs text-muted-foreground mt-2">
                    <span className="font-medium">Mitigation:</span> {risk.mitigationPlan}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`button-menu-risk-${risk.id}`}
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem 
                    onClick={() => setHistoryRiskId(risk.id)}
                    data-testid={`button-history-risk-${risk.id}`}
                  >
                    <History className="h-4 w-4 mr-2" />
                    View History
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setDeleteRiskData(risk)}
                    data-testid={`button-delete-risk-${risk.id}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          {risks?.length === 0 && <div className="text-center py-8 text-muted-foreground">No risks recorded.</div>}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteRiskData !== null} onOpenChange={(open) => !open && setDeleteRiskData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Risk</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this risk? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRiskData(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deleteRiskData) {
                  deleteRisk.mutate({ id: deleteRiskData.id, projectId }, {
                    onSuccess: () => {
                      toast({ title: "Success", description: "Risk moved to recycle bin" });
                      setDeleteRiskData(null);
                    }
                  });
                }
              }}
              disabled={deleteRisk.isPending}
              data-testid="button-confirm-delete-risk"
            >
              {deleteRisk.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RiskHistoryDialog 
        riskId={historyRiskId || 0} 
        open={historyRiskId !== null} 
        onOpenChange={(open) => !open && setHistoryRiskId(null)} 
      />
    </Card>
  );
}

function RiskHistoryDialog({ riskId, open, onOpenChange }: { riskId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useRiskHistory(riskId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Risk Change History
          </DialogTitle>
          <DialogDescription>
            View all changes made to this risk over time.
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
                    data-testid={`risk-history-entry-${log.id}`}
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

const taskStatusColors = {
  "Not Started": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Completed": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

function TasksTab({ projectId }: { projectId: number }) {
  const { currentOrganization } = useOrganization();
  const { data: tasks, isLoading } = useTasks(projectId);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const { toast } = useToast();
  
  const [view, setView] = useState<"gantt" | "kanban">("gantt");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [durationDays, setDurationDays] = useState(7);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const { data: taskAssignments } = useTaskResourceAssignments(editingTask?.id ?? null);
  
  useEffect(() => {
    if (taskAssignments && editingTask) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
    }
  }, [taskAssignments, editingTask]);

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
    setSelectedResourceIds([]);
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
          updateTaskResources.mutate({ taskId: editingTask.id, resourceIds: selectedResourceIds });
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

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year' | '5year';
const zoomLevels: ZoomLevel[] = ['day', 'week', 'month', 'quarter', 'year', '5year'];
const zoomLabels: Record<ZoomLevel, string> = {
  'day': 'Daily',
  'week': 'Weekly',
  'month': 'Monthly',
  'quarter': 'Quarterly',
  'year': 'Yearly',
  '5year': '5 Years'
};

function ProjectGanttView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (task: Task) => void }) {
  const today = new Date();
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('month');
  
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
      minDate = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
      maxDate = new Date(maxDate.getFullYear(), Math.ceil((maxDate.getMonth() + 1) / 3) * 3, 0);
    } else if (zoomLevel === 'year') {
      minDate = new Date(minDate.getFullYear(), 0, 1);
      maxDate = new Date(maxDate.getFullYear(), 11, 31);
    } else if (zoomLevel === '5year') {
      const startYear = minDate.getFullYear();
      minDate = new Date(startYear, 0, 1);
      maxDate = new Date(startYear + 4, 11, 31);
    }
    
    const dateRange = eachDayOfInterval({ start: minDate, end: maxDate });
    return { minDate, maxDate, dateRange };
  }, [tasks, today, zoomLevel]);

  const { filteredDates, dateFormat, columnWidth } = useMemo(() => {
    switch (zoomLevel) {
      case 'day':
        return {
          filteredDates: dateRange,
          dateFormat: 'd',
          columnWidth: 'min-w-[40px]'
        };
      case 'week':
        return {
          filteredDates: dateRange.filter((_, i) => i % 7 === 0),
          dateFormat: 'MMM d',
          columnWidth: 'min-w-[100px]'
        };
      case 'month':
        return {
          filteredDates: dateRange.filter((date) => date.getDate() === 1),
          dateFormat: 'MMM yyyy',
          columnWidth: 'min-w-[100px]'
        };
      case 'quarter':
        return {
          filteredDates: dateRange.filter((date) => date.getDate() === 1 && date.getMonth() % 3 === 0),
          dateFormat: 'QQQ yyyy',
          columnWidth: 'min-w-[80px]'
        };
      case 'year':
        return {
          filteredDates: dateRange.filter((date) => date.getDate() === 1 && date.getMonth() === 0),
          dateFormat: 'yyyy',
          columnWidth: 'min-w-[80px]'
        };
      case '5year':
        return {
          filteredDates: dateRange.filter((date) => date.getDate() === 1 && date.getMonth() === 0),
          dateFormat: 'yyyy',
          columnWidth: 'min-w-[60px]'
        };
    }
  }, [dateRange, zoomLevel]);

  const handleZoomIn = () => {
    const idx = zoomLevels.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(zoomLevels[idx - 1]);
  };

  const handleZoomOut = () => {
    const idx = zoomLevels.indexOf(zoomLevel);
    if (idx < zoomLevels.length - 1) setZoomLevel(zoomLevels[idx + 1]);
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
        <div className="flex items-center justify-between gap-4 p-3 border-b bg-muted/30">
          <span className="text-sm font-medium text-muted-foreground">
            View: {zoomLabels[zoomLevel]}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoomLevels.indexOf(zoomLevel) === 0}
              data-testid="button-gantt-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoomLevels.indexOf(zoomLevel) === zoomLevels.length - 1}
              data-testid="button-gantt-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
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
  const { currentOrganization } = useOrganization();
  const { data: issues, isLoading } = useIssues(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [deleteIssueData, setDeleteIssueData] = useState<Issue | null>(null);
  const [historyIssueId, setHistoryIssueId] = useState<number | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const updateIssueResources = useUpdateIssueResourceAssignments();
  const { data: issueAssignments } = useIssueResourceAssignments(editingIssue?.id ?? null);
  const { toast } = useToast();
  
  useEffect(() => {
    if (issueAssignments && editingIssue) {
      setSelectedResourceIds(issueAssignments.map(a => a.resourceId));
    }
  }, [issueAssignments, editingIssue]);

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

  const openEditDialog = (issue: Issue) => {
    setEditingIssue(issue);
    form.reset({
      projectId: issue.projectId,
      title: issue.title,
      description: issue.description || "",
      priority: issue.priority || "Medium",
      status: issue.status || "Open",
      type: issue.type || "Bug",
      assignee: issue.assignee || ""
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingIssue(null);
    setSelectedResourceIds([]);
    form.reset({
      projectId,
      title: "",
      description: "",
      priority: "Medium",
      status: "Open",
      type: "Bug",
      assignee: ""
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: any) => {
    if (editingIssue) {
      updateIssue.mutate({ id: editingIssue.id, projectId, ...data }, {
        onSuccess: () => {
          updateIssueResources.mutate({ issueId: editingIssue.id, resourceIds: selectedResourceIds });
          toast({ title: "Success", description: "Issue updated" });
          setIsDialogOpen(false);
          setEditingIssue(null);
        },
        onError: (error: any) => {
          toast({ title: "Error", description: error?.message || "Failed to update issue", variant: "destructive" });
        }
      });
    } else {
      createIssue.mutate(data, {
        onSuccess: (newIssue: any) => {
          if (selectedResourceIds.length > 0 && newIssue?.id) {
            updateIssueResources.mutate({ issueId: newIssue.id, resourceIds: selectedResourceIds });
          }
          toast({ title: "Success", description: "Issue created" });
          setIsDialogOpen(false);
        }
      });
    }
  };

  if (isLoading) return <Loader2 className="animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Project Issues</CardTitle>
          <CardDescription>Track bugs, tasks, and enhancements.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingIssue(null); }}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreateDialog} data-testid="button-add-issue"><Plus className="mr-2 h-4 w-4" /> Add Issue</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingIssue ? "Edit Issue" : "Add New Issue"}</DialogTitle>
              <DialogDescription>{editingIssue ? "Modify the issue details below." : "Create a new bug, task, or enhancement."}</DialogDescription>
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
                <Label>Status</Label>
                 <Controller control={form.control} name="status" render={({field}) => (
                  <Select onValueChange={field.onChange} value={field.value || "Open"}>
                     <SelectTrigger data-testid="select-issue-status"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="Open">Open</SelectItem>
                       <SelectItem value="In Progress">In Progress</SelectItem>
                       <SelectItem value="Resolved">Resolved</SelectItem>
                       <SelectItem value="Closed">Closed</SelectItem>
                     </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea {...form.register("description")} data-testid="input-issue-description" />
              </div>
              <ResourceAssignment
                organizationId={currentOrganization?.id || null}
                selectedResourceIds={selectedResourceIds}
                onSelectionChange={setSelectedResourceIds}
                label="Assigned Resources"
              />
              <DialogFooter className="gap-2">
                {editingIssue && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={() => {
                      deleteIssue.mutate({ id: editingIssue.id, projectId }, {
                        onSuccess: () => {
                          toast({ title: "Deleted", description: "Issue deleted" });
                          setIsDialogOpen(false);
                          setEditingIssue(null);
                        }
                      });
                    }}
                  >
                    Delete
                  </Button>
                )}
                <Button type="submit" data-testid="button-save-issue" disabled={createIssue.isPending || updateIssue.isPending}>
                  {(createIssue.isPending || updateIssue.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingIssue ? "Update Issue" : "Save Issue"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {issues?.map(issue => {
            const TypeIcon = typeIcons[issue.type as keyof typeof typeIcons] || Bug;
            return (
              <div 
                key={issue.id} 
                className="flex items-start justify-between rounded-lg border p-4 cursor-pointer hover-elevate transition-colors" 
                onClick={() => openEditDialog(issue)}
                data-testid={`card-issue-${issue.id}`}
              >
                <div className="flex gap-3">
                  <div className="mt-0.5">
                    <TypeIcon className="h-5 w-5 text-muted-foreground" />
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
                    <p className="text-sm text-muted-foreground">{issue.description}</p>
                    {issue.assignee && <p className="text-xs text-muted-foreground">Assigned to: {issue.assignee}</p>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-menu-issue-${issue.id}`}
                    >
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem 
                      onClick={() => setHistoryIssueId(issue.id)}
                      data-testid={`button-history-issue-${issue.id}`}
                    >
                      <History className="h-4 w-4 mr-2" />
                      View History
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeleteIssueData(issue)}
                      data-testid={`button-delete-issue-${issue.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {issues?.length === 0 && <div className="text-center py-8 text-muted-foreground">No issues recorded.</div>}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteIssueData !== null} onOpenChange={(open) => !open && setDeleteIssueData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Issue</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this issue? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteIssueData(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deleteIssueData) {
                  deleteIssue.mutate({ id: deleteIssueData.id, projectId }, {
                    onSuccess: () => {
                      toast({ title: "Success", description: "Issue moved to recycle bin" });
                      setDeleteIssueData(null);
                    }
                  });
                }
              }}
              disabled={deleteIssue.isPending}
              data-testid="button-confirm-delete-issue"
            >
              {deleteIssue.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IssueHistoryDialog 
        issueId={historyIssueId || 0} 
        open={historyIssueId !== null} 
        onOpenChange={(open) => !open && setHistoryIssueId(null)} 
      />
    </Card>
  );
}

function IssueHistoryDialog({ issueId, open, onOpenChange }: { issueId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useIssueHistory(issueId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Issue Change History
          </DialogTitle>
          <DialogDescription>
            View all changes made to this issue over time.
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
                    data-testid={`issue-history-entry-${log.id}`}
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

function FinancialsTab({ projectId }: { projectId: number }) {
  const { data: financials, isLoading } = useProjectFinancials(projectId);
  const createFinancial = useCreateProjectFinancial(projectId);
  const updateFinancial = useUpdateProjectFinancial(projectId);
  const deleteFinancial = useDeleteProjectFinancial(projectId);
  const { toast } = useToast();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<ProjectFinancial>>({});

  const currentYear = new Date().getFullYear();

  const form = useForm({
    defaultValues: {
      category: "CapEx" as string,
      lineItem: "",
      description: "",
      fiscalYear: currentYear,
      fiscalPeriod: "Full Year",
      budgetAmount: "0",
      plannedAmount: "0",
      actualAmount: "0",
      notes: "",
    }
  });

  const onSubmit = (data: any) => {
    createFinancial.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Financial record added" });
        setShowAddDialog(false);
        form.reset();
      }
    });
  };

  const startEdit = (financial: ProjectFinancial) => {
    setEditingId(financial.id);
    setEditValues({
      budgetAmount: financial.budgetAmount,
      plannedAmount: financial.plannedAmount,
      actualAmount: financial.actualAmount,
      notes: financial.notes,
    });
  };

  const saveEdit = (id: number) => {
    updateFinancial.mutate({ id, ...editValues }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Financial record updated" });
        setEditingId(null);
        setEditValues({});
      }
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const capexItems = financials?.filter(f => f.category === "CapEx") || [];
  const opexItems = financials?.filter(f => f.category === "OpEx") || [];

  const calculateTotals = (items: ProjectFinancial[]) => {
    return items.reduce((acc, item) => ({
      budget: acc.budget + Number(item.budgetAmount || 0),
      planned: acc.planned + Number(item.plannedAmount || 0),
      actual: acc.actual + Number(item.actualAmount || 0),
    }), { budget: 0, planned: 0, actual: 0 });
  };

  const capexTotals = calculateTotals(capexItems);
  const opexTotals = calculateTotals(opexItems);
  const grandTotals = {
    budget: capexTotals.budget + opexTotals.budget,
    planned: capexTotals.planned + opexTotals.planned,
    actual: capexTotals.actual + opexTotals.actual,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getVariance = (budget: number, actual: number) => {
    const variance = budget - actual;
    const percent = budget > 0 ? (variance / budget) * 100 : 0;
    return { variance, percent };
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Tracking
          </CardTitle>
          <CardDescription>
            Budget, Plan, and Actuals by Capital (CapEx) and Operational (OpEx) expenses
          </CardDescription>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-financial">
              <Plus className="h-4 w-4 mr-2" />
              Add Line Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Financial Line Item</DialogTitle>
              <DialogDescription>Add a new budget/expense line item for this project</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Controller control={form.control} name="category" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-financial-category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CapEx">Capital (CapEx)</SelectItem>
                        <SelectItem value="OpEx">Operational (OpEx)</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Fiscal Year</Label>
                  <Controller control={form.control} name="fiscalYear" render={({ field }) => (
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value.toString()}>
                      <SelectTrigger data-testid="select-fiscal-year"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Line Item</Label>
                  <Input {...form.register("lineItem")} placeholder="e.g., Software Licenses" data-testid="input-line-item" />
                </div>
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Controller control={form.control} name="fiscalPeriod" render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Full Year"}>
                      <SelectTrigger data-testid="select-fiscal-period"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full Year">Full Year</SelectItem>
                        <SelectItem value="Q1">Q1</SelectItem>
                        <SelectItem value="Q2">Q2</SelectItem>
                        <SelectItem value="Q3">Q3</SelectItem>
                        <SelectItem value="Q4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input {...form.register("description")} placeholder="Optional description" data-testid="input-financial-description" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Budget</Label>
                  <Input type="number" {...form.register("budgetAmount")} data-testid="input-budget-amount" />
                </div>
                <div className="space-y-2">
                  <Label>Planned</Label>
                  <Input type="number" {...form.register("plannedAmount")} data-testid="input-planned-amount" />
                </div>
                <div className="space-y-2">
                  <Label>Actual</Label>
                  <Input type="number" {...form.register("actualAmount")} data-testid="input-actual-amount" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input {...form.register("notes")} placeholder="Optional notes" data-testid="input-financial-notes" />
              </div>
              <DialogFooter>
                <Button type="submit" data-testid="button-save-financial" disabled={createFinancial.isPending}>
                  {createFinancial.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">Line Item</th>
                <th className="text-center px-2 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-16">Year</th>
                <th className="text-center px-2 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-20">Period</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Budget</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Planned</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Actual</th>
                <th className="text-right px-3 py-2 font-semibold text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300 w-28">Variance</th>
                <th className="w-16 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {capexItems.length > 0 && (
                <>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                    <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      CapEx - Capital Expenditures
                    </td>
                  </tr>
                  {capexItems.map((item) => (
                    <FinancialTableRow
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      startEdit={startEdit}
                      saveEdit={saveEdit}
                      cancelEdit={cancelEdit}
                      deleteFinancial={deleteFinancial}
                      formatCurrency={formatCurrency}
                      getVariance={getVariance}
                    />
                  ))}
                  <tr className="border-b bg-slate-50/50 dark:bg-slate-800/30">
                    <td colSpan={3} className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">CapEx Subtotal</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(capexTotals.budget)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(capexTotals.planned)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(capexTotals.actual)}</td>
                    <td className={cn("px-3 py-1.5 text-right text-xs font-medium tabular-nums", capexTotals.budget - capexTotals.actual >= 0 ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400")}>
                      {formatCurrency(capexTotals.budget - capexTotals.actual)}
                    </td>
                    <td className="px-2 py-1.5"></td>
                  </tr>
                </>
              )}
              {opexItems.length > 0 && (
                <>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
                    <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      OpEx - Operational Expenditures
                    </td>
                  </tr>
                  {opexItems.map((item) => (
                    <FinancialTableRow
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      editValues={editValues}
                      setEditValues={setEditValues}
                      startEdit={startEdit}
                      saveEdit={saveEdit}
                      cancelEdit={cancelEdit}
                      deleteFinancial={deleteFinancial}
                      formatCurrency={formatCurrency}
                      getVariance={getVariance}
                    />
                  ))}
                  <tr className="border-b bg-slate-50/50 dark:bg-slate-800/30">
                    <td colSpan={3} className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">OpEx Subtotal</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(opexTotals.budget)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(opexTotals.planned)}</td>
                    <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatCurrency(opexTotals.actual)}</td>
                    <td className={cn("px-3 py-1.5 text-right text-xs font-medium tabular-nums", opexTotals.budget - opexTotals.actual >= 0 ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400")}>
                      {formatCurrency(opexTotals.budget - opexTotals.actual)}
                    </td>
                    <td className="px-2 py-1.5"></td>
                  </tr>
                </>
              )}
              {capexItems.length === 0 && opexItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No financial items recorded. Add a line item to get started.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 dark:bg-slate-700 border-t-2 border-slate-300 dark:border-slate-600">
                <td colSpan={3} className="px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100 text-right">Grand Total</td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(grandTotals.budget)}</td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(grandTotals.planned)}</td>
                <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatCurrency(grandTotals.actual)}</td>
                <td className={cn("px-3 py-2 text-right text-sm font-bold tabular-nums", grandTotals.budget - grandTotals.actual >= 0 ? "text-slate-800 dark:text-slate-100" : "text-red-700 dark:text-red-400")}>
                  {formatCurrency(grandTotals.budget - grandTotals.actual)}
                </td>
                <td className="px-2 py-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>

      <CardContent className="pt-8 border-t">
        <ProjectFinancialGrid projectId={projectId} />
      </CardContent>
    </Card>
  );
}

function FinancialTableRow({
  item,
  isEditing,
  editValues,
  setEditValues,
  startEdit,
  saveEdit,
  cancelEdit,
  deleteFinancial,
  formatCurrency,
  getVariance,
}: {
  item: ProjectFinancial;
  isEditing: boolean;
  editValues: Partial<ProjectFinancial>;
  setEditValues: (values: Partial<ProjectFinancial>) => void;
  startEdit: (financial: ProjectFinancial) => void;
  saveEdit: (id: number) => void;
  cancelEdit: () => void;
  deleteFinancial: any;
  formatCurrency: (value: number) => string;
  getVariance: (budget: number, actual: number) => { variance: number; percent: number };
}) {
  const variance = getVariance(Number(item.budgetAmount), Number(item.actualAmount));
  
  return (
    <tr className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-financial-${item.id}`}>
      <td className="px-3 py-2">
        <div className="text-sm font-medium">{item.lineItem}</div>
        {item.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</div>}
      </td>
      <td className="px-2 py-2 text-center text-xs tabular-nums">{item.fiscalYear}</td>
      <td className="px-2 py-2 text-center text-xs">{item.fiscalPeriod}</td>
      <td className="px-3 py-2 text-right">
        {isEditing ? (
          <Input
            type="number"
            value={editValues.budgetAmount || ""}
            onChange={(e) => setEditValues({ ...editValues, budgetAmount: e.target.value })}
            className="w-24 h-7 text-xs text-right"
            data-testid="input-edit-budget"
          />
        ) : (
          <span className="text-xs tabular-nums">{formatCurrency(Number(item.budgetAmount))}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {isEditing ? (
          <Input
            type="number"
            value={editValues.plannedAmount || ""}
            onChange={(e) => setEditValues({ ...editValues, plannedAmount: e.target.value })}
            className="w-24 h-7 text-xs text-right"
            data-testid="input-edit-planned"
          />
        ) : (
          <span className="text-xs tabular-nums">{formatCurrency(Number(item.plannedAmount))}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {isEditing ? (
          <Input
            type="number"
            value={editValues.actualAmount || ""}
            onChange={(e) => setEditValues({ ...editValues, actualAmount: e.target.value })}
            className="w-24 h-7 text-xs text-right"
            data-testid="input-edit-actual"
          />
        ) : (
          <span className="text-xs tabular-nums">{formatCurrency(Number(item.actualAmount))}</span>
        )}
      </td>
      <td className={cn(
        "px-3 py-2 text-right text-xs tabular-nums",
        variance.variance >= 0 ? "text-slate-700 dark:text-slate-300" : "text-red-600 dark:text-red-400"
      )}>
        {formatCurrency(variance.variance)}
        <span className="text-[10px] ml-0.5 text-muted-foreground">({variance.percent.toFixed(0)}%)</span>
      </td>
      <td className="px-2 py-2">
        <div className="flex justify-end gap-0.5">
          {isEditing ? (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveEdit(item.id)} data-testid="button-save-edit">
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEdit} data-testid="button-cancel-edit">
                <X className="h-3 w-3 text-slate-400" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(item)} data-testid={`button-edit-financial-${item.id}`}>
                <Pencil className="h-3 w-3 text-slate-400" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-6 w-6"
                onClick={() => deleteFinancial.mutate(item.id)}
                data-testid={`button-delete-financial-${item.id}`}
              >
                <Trash2 className="h-3 w-3 text-slate-400" />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ChangeRequestsTab({ projectId }: { projectId: number }) {
  const { data: changeRequests, isLoading } = useChangeRequests(projectId);
  const createChangeRequest = useCreateChangeRequest(projectId);
  const updateChangeRequest = useUpdateChangeRequest(projectId);
  const deleteChangeRequest = useDeleteChangeRequest(projectId);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ChangeRequest | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'scope' as 'scope' | 'schedule' | 'budget' | 'resource' | 'other',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    impact: '',
    justification: '',
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'scope',
      priority: 'medium',
      impact: '',
      justification: '',
    });
    setEditingRequest(null);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    if (editingRequest) {
      updateChangeRequest.mutate({ id: editingRequest.id, data: formData }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Change request updated" });
          setIsDialogOpen(false);
          resetForm();
        }
      });
    } else {
      createChangeRequest.mutate(formData, {
        onSuccess: () => {
          toast({ title: "Success", description: "Change request created" });
          setIsDialogOpen(false);
          resetForm();
        }
      });
    }
  };

  const handleEdit = (request: ChangeRequest) => {
    setEditingRequest(request);
    setFormData({
      title: request.title,
      description: request.description || '',
      type: request.type as any,
      priority: request.priority as any,
      impact: request.impact || '',
      justification: request.justification || '',
    });
    setIsDialogOpen(true);
  };

  const handleStatusChange = (request: ChangeRequest, status: string) => {
    updateChangeRequest.mutate({ id: request.id, data: { status } }, {
      onSuccess: () => {
        toast({ title: "Status Updated", description: `Change request marked as ${status}` });
      }
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
      under_review: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
      rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
      implemented: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    };
    return styles[status] || styles.pending;
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
      medium: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
      high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      critical: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    };
    return styles[priority] || styles.medium;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Change Requests
          </CardTitle>
          <CardDescription>Track and manage project change requests</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-change-request">
              <Plus className="h-4 w-4 mr-1" /> New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingRequest ? 'Edit Change Request' : 'New Change Request'}</DialogTitle>
              <DialogDescription>
                {editingRequest ? 'Update the change request details' : 'Submit a new change request for this project'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Brief title for the change request"
                  data-testid="input-change-request-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as any })}>
                    <SelectTrigger data-testid="select-change-request-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scope">Scope</SelectItem>
                      <SelectItem value="schedule">Schedule</SelectItem>
                      <SelectItem value="budget">Budget</SelectItem>
                      <SelectItem value="resource">Resource</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as any })}>
                    <SelectTrigger data-testid="select-change-request-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed description of the proposed change"
                  rows={3}
                  data-testid="input-change-request-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Impact Assessment</Label>
                <Textarea
                  value={formData.impact}
                  onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                  placeholder="Describe the impact of this change on the project"
                  rows={2}
                  data-testid="input-change-request-impact"
                />
              </div>
              <div className="space-y-2">
                <Label>Justification</Label>
                <Textarea
                  value={formData.justification}
                  onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                  placeholder="Why is this change necessary?"
                  rows={2}
                  data-testid="input-change-request-justification"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={createChangeRequest.isPending || updateChangeRequest.isPending}
                data-testid="button-submit-change-request"
              >
                {(createChangeRequest.isPending || updateChangeRequest.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRequest ? 'Update' : 'Submit'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!changeRequests || changeRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No change requests yet. Click "New Request" to submit one.
          </div>
        ) : (
          <div className="space-y-3">
            {changeRequests.map((request) => (
              <div 
                key={request.id}
                className="border rounded-lg p-4 space-y-3"
                data-testid={`change-request-${request.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium truncate">{request.title}</h4>
                      <Badge className={cn("text-xs", getStatusBadge(request.status))}>{request.status.replace('_', ' ')}</Badge>
                      <Badge className={cn("text-xs", getPriorityBadge(request.priority))}>{request.priority}</Badge>
                      <Badge variant="outline" className="text-xs">{request.type}</Badge>
                    </div>
                    {request.description && (
                      <p className="text-sm text-muted-foreground mt-1">{request.description}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-change-request-menu-${request.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(request)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'under_review')}>
                        <Clock className="h-4 w-4 mr-2" /> Mark Under Review
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'approved')}>
                        <Check className="h-4 w-4 mr-2" /> Approve
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'rejected')}>
                        <X className="h-4 w-4 mr-2" /> Reject
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(request, 'implemented')}>
                        <CheckSquare className="h-4 w-4 mr-2" /> Mark Implemented
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deleteChangeRequest.mutate(request.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {(request.impact || request.justification) && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {request.impact && (
                      <div>
                        <span className="text-muted-foreground">Impact:</span>
                        <p className="text-slate-700 dark:text-slate-300">{request.impact}</p>
                      </div>
                    )}
                    {request.justification && (
                      <div>
                        <span className="text-muted-foreground">Justification:</span>
                        <p className="text-slate-700 dark:text-slate-300">{request.justification}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Created: {format(new Date(request.createdAt), 'MMM d, yyyy')}</span>
                  {request.reviewedAt && <span>Reviewed: {format(new Date(request.reviewedAt), 'MMM d, yyyy')}</span>}
                  {request.implementedAt && <span>Implemented: {format(new Date(request.implementedAt), 'MMM d, yyyy')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ projectId }: { projectId: number }) {
  const { data: documents, isLoading } = useProjectDocuments(projectId);
  const createDocument = useCreateProjectDocument(projectId);
  const updateDocument = useUpdateProjectDocument(projectId);
  const deleteDocument = useDeleteProjectDocument(projectId);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ProjectDocument | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'general' as 'general' | 'contract' | 'requirement' | 'design' | 'test' | 'report' | 'other',
    fileUrl: '',
    version: '1.0',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'general',
      fileUrl: '',
      version: '1.0',
    });
    setEditingDocument(null);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Document name is required", variant: "destructive" });
      return;
    }

    if (editingDocument) {
      updateDocument.mutate({ id: editingDocument.id, data: formData }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Document updated" });
          setIsDialogOpen(false);
          resetForm();
        }
      });
    } else {
      createDocument.mutate(formData, {
        onSuccess: () => {
          toast({ title: "Success", description: "Document added" });
          setIsDialogOpen(false);
          resetForm();
        }
      });
    }
  };

  const handleEdit = (doc: ProjectDocument) => {
    setEditingDocument(doc);
    setFormData({
      name: doc.name,
      description: doc.description || '',
      category: doc.category as any,
      fileUrl: doc.fileUrl || '',
      version: doc.version || '1.0',
    });
    setIsDialogOpen(true);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'contract': return <FileText className="h-4 w-4" />;
      case 'requirement': return <ClipboardList className="h-4 w-4" />;
      case 'design': return <LayoutGrid className="h-4 w-4" />;
      case 'test': return <CheckSquare className="h-4 w-4" />;
      case 'report': return <FileText className="h-4 w-4" />;
      default: return <FolderOpen className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Project Documents
          </CardTitle>
          <CardDescription>Manage project documentation and files</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-document">
              <Plus className="h-4 w-4 mr-1" /> Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingDocument ? 'Edit Document' : 'Add Document'}</DialogTitle>
              <DialogDescription>
                {editingDocument ? 'Update the document details' : 'Add a new document reference to this project'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Document Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Project Charter, Requirements Spec"
                  data-testid="input-document-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v as any })}>
                    <SelectTrigger data-testid="select-document-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="requirement">Requirement</SelectItem>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="test">Test</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Version</Label>
                  <Input
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    placeholder="e.g., 1.0, 2.1"
                    data-testid="input-document-version"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the document"
                  rows={2}
                  data-testid="input-document-description"
                />
              </div>
              <div className="space-y-2">
                <Label>File URL / Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.fileUrl}
                    onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                    placeholder="https://... or path to file"
                    className="flex-1"
                    data-testid="input-document-url"
                  />
                  <Button variant="outline" size="icon">
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button 
                onClick={handleSubmit} 
                disabled={createDocument.isPending || updateDocument.isPending}
                data-testid="button-submit-document"
              >
                {(createDocument.isPending || updateDocument.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingDocument ? 'Update' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!documents || documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No documents yet. Click "Add Document" to add one.
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div 
                key={doc.id}
                className="flex items-center justify-between gap-4 border rounded-lg p-3 hover-elevate"
                data-testid={`document-${doc.id}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-md bg-muted">
                    {getCategoryIcon(doc.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{doc.name}</h4>
                      <Badge variant="outline" className="text-xs">{doc.category}</Badge>
                      {doc.version && <span className="text-xs text-muted-foreground">v{doc.version}</span>}
                    </div>
                    {doc.description && (
                      <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Added {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {doc.fileUrl && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => window.open(doc.fileUrl!, '_blank')}
                          data-testid={`button-open-document-${doc.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Open document</TooltipContent>
                    </Tooltip>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleEdit(doc)}
                    data-testid={`button-edit-document-${doc.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => deleteDocument.mutate(doc.id)}
                    data-testid={`button-delete-document-${doc.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
