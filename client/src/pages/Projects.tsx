import { useState } from "react";
import { useProjects, useCreateProject, useUpdateProject } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema } from "@shared/schema";
import type { InsertProject, Project } from "@shared/schema";
import { Link } from "wouter";
import { Plus, Search, Calendar, Target, AlertCircle, TrendingUp, List, LayoutGrid, GanttChart, MoreVertical, Trash2, Eye, Upload, PenTool } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, differenceInDays, parseISO, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function Projects() {
  const { currentOrganization } = useOrganization();
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const { data: projects, isLoading } = useProjects(currentOrganization?.id, selectedPortfolio !== "all" ? parseInt(selectedPortfolio) : undefined);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban" | "gantt">("list");
  const updateProject = useUpdateProject();
  const { toast } = useToast();
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);

  const deleteProject = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Success", description: "Project moved to recycle bin" });
      setDeleteProjectId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const filteredProjects = projects?.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesSource = sourceFilter === "all" || 
      (sourceFilter === "manual" && (p.source === "manual" || !p.source)) ||
      (sourceFilter === "imported" && p.source === "imported");
    return matchesSearch && matchesSource;
  });

  const handleStatusChange = (projectId: number, newStatus: string) => {
    updateProject.mutate(
      { id: projectId, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Project updated", description: `Status changed to ${newStatus}` });
        },
        onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Projects</h1>
          <p className="mt-1 text-muted-foreground">Track execution and health of all initiatives.</p>
        </div>
        <CreateProjectDialog 
          open={isDialogOpen} 
          onOpenChange={setIsDialogOpen} 
          portfolios={portfolios || []}
          organizationId={currentOrganization?.id}
        />
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            className="pl-10 border-border" 
            placeholder="Search projects..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-projects"
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={selectedPortfolio} onValueChange={setSelectedPortfolio}>
            <SelectTrigger data-testid="select-portfolio-filter">
              <SelectValue placeholder="Filter by Portfolio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Portfolios</SelectItem>
              {portfolios?.map(p => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[180px]">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger data-testid="select-source-filter">
              <SelectValue placeholder="Filter by Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              <SelectItem value="manual">
                <span className="flex items-center gap-2">
                  <PenTool className="h-3 w-3" />
                  Created in App
                </span>
              </SelectItem>
              <SelectItem value="imported">
                <span className="flex items-center gap-2">
                  <Upload className="h-3 w-3" />
                  Imported
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* View Toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("list")}
            className="rounded-none"
            data-testid="button-view-list"
          >
            <List className="h-4 w-4 mr-2" />
            List
          </Button>
          <Button
            variant={view === "kanban" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("kanban")}
            className="rounded-none"
            data-testid="button-view-kanban"
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            Kanban
          </Button>
          <Button
            variant={view === "gantt" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("gantt")}
            className="rounded-none"
            data-testid="button-view-gantt"
          >
            <GanttChart className="h-4 w-4 mr-2" />
            Gantt
          </Button>
        </div>
      </div>

      {/* Projects View */}
      {view === "list" ? (
        <div className="space-y-6">
          {filteredProjects?.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Link href={`/projects/${project.id}`}>
                <div className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-card p-7 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 sm:flex-row sm:items-center cursor-pointer">
                  
                  {/* Status Indicator Stripe */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl transition-all duration-300 group-hover:w-2",
                    project.health === 'Green' && "bg-gradient-to-b from-emerald-400 to-emerald-600",
                    project.health === 'Yellow' && "bg-gradient-to-b from-amber-400 to-amber-600",
                    project.health === 'Red' && "bg-gradient-to-b from-rose-400 to-rose-600",
                  )} />

                  <div className="flex-1 pl-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-200">
                        {project.name}
                      </h3>
                      <Badge variant="outline" className="font-medium text-xs px-3 py-1 rounded-full border-slate-300 dark:border-slate-600">
                        {project.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>Due {project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : 'TBD'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                project.health === 'Green' && "bg-emerald-500",
                                project.health === 'Yellow' && "bg-amber-500",
                                project.health === 'Red' && "bg-rose-500",
                              )}
                              style={{ width: `${project.completionPercentage}%` }}
                            />
                          </div>
                          <span className="font-medium">{project.completionPercentage}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pl-5 sm:pl-0 mt-4 sm:mt-0">
                    <div className="text-right hidden sm:block">
                      <div className="flex items-center gap-1.5 justify-end text-muted-foreground mb-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium uppercase tracking-wide">Budget</span>
                      </div>
                      <p className="text-lg font-bold text-foreground">${Number(project.budget).toLocaleString()}</p>
                    </div>
                    <Badge className={cn(
                      "ml-auto sm:ml-0 px-4 py-1.5 text-xs font-semibold rounded-full",
                      project.priority === 'Critical' && "bg-rose-500 text-white hover:bg-rose-500",
                      project.priority === 'High' && "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400",
                      project.priority === 'Medium' && "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
                      project.priority === 'Low' && "bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                      {project.priority}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={(e) => e.preventDefault()}
                          data-testid={`button-menu-project-${project.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/projects/${project.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={(e) => { e.preventDefault(); setDeleteProjectId(project.id); }} 
                          className="text-red-600 focus:text-red-600"
                          data-testid={`menu-delete-project-${project.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}

          {!isLoading && filteredProjects?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-border rounded-xl">
              <div className="rounded-full bg-muted p-4 mb-4">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No projects found</h3>
              <p className="text-muted-foreground mt-1 mb-4">Try adjusting your filters or create a new project.</p>
            </div>
          )}
        </div>
      ) : view === "kanban" ? (
        <ProjectsKanbanView 
          projects={filteredProjects || []} 
          onStatusChange={handleStatusChange} 
        />
      ) : (
        <ProjectsGanttView projects={filteredProjects || []} />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteProjectId !== null} onOpenChange={() => setDeleteProjectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this project? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteProjectId && deleteProject.mutate(deleteProjectId)}
              disabled={deleteProject.isPending}
              data-testid="button-confirm-delete-project"
            >
              {deleteProject.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateProjectDialog({ open, onOpenChange, portfolios, organizationId }: { open: boolean, onOpenChange: (o: boolean) => void, portfolios: any[], organizationId?: number }) {
  const { toast } = useToast();
  const createMutation = useCreateProject();
  
  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      priority: "Medium",
      status: "Initiation",
      budget: "0",
      organizationId: organizationId || undefined,
    }
  });

  const onSubmit = (data: InsertProject) => {
    createMutation.mutate({ ...data, organizationId: organizationId || null }, {
      onSuccess: () => {
        toast({ title: "Success", description: "Project created successfully" });
        onOpenChange(false);
        form.reset();
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="name">Project Name</Label>
              <Input id="name" {...form.register("name")} placeholder="Project Alpha" />
              {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
            </div>
            
            <div className="space-y-2 col-span-2">
              <Label htmlFor="portfolioId">Portfolio</Label>
              <Controller
                control={form.control}
                name="portfolioId"
                render={({ field }) => (
                  <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString()}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      {portfolios.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Priority" />
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

            <div className="space-y-2">
              <Label htmlFor="budget">Budget ($)</Label>
              <Input id="budget" type="number" {...form.register("budget")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input id="startDate" type="date" {...form.register("startDate")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input id="endDate" type="date" {...form.register("endDate")} />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...form.register("description")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Kanban View Components
const PROJECT_STATUSES = [
  { id: "Initiation", label: "Initiation", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { id: "Planning", label: "Planning", color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
  { id: "Execution", label: "Execution", color: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200" },
  { id: "Monitoring", label: "Monitoring", color: "bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200" },
  { id: "Closing", label: "Closing", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200" },
];

function ProjectsKanbanView({ 
  projects, 
  onStatusChange 
}: { 
  projects: Project[]; 
  onStatusChange: (projectId: number, newStatus: string) => void;
}) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const projectId = Number(event.active.id);
    const project = projects.find(p => p.id === projectId);
    if (project) setActiveProject(project);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProject(null);
    const { active, over } = event;
    if (!over) return;
    
    const projectId = Number(active.id);
    const newStatus = String(over.id);
    const project = projects.find(p => p.id === projectId);
    
    if (project && project.status !== newStatus && PROJECT_STATUSES.some(s => s.id === newStatus)) {
      onStatusChange(projectId, newStatus);
    }
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {PROJECT_STATUSES.map(status => (
          <ProjectKanbanColumn
            key={status.id}
            column={status}
            projects={projects.filter(p => p.status === status.id)}
          />
        ))}
      </div>
      <DragOverlay>
        {activeProject && (
          <div className="opacity-80">
            <Card className="shadow-lg border-primary">
              <CardContent className="p-4">
                <div className="font-medium text-sm">{activeProject.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{activeProject.completionPercentage}% complete</div>
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
  projects 
}: { 
  column: { id: string; label: string; color: string }; 
  projects: Project[];
}) {
  const { setNodeRef, isOver } = useSortable({
    id: column.id,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "space-y-3 min-h-[300px] rounded-lg transition-colors p-2",
        isOver && "bg-primary/5 ring-2 ring-primary ring-dashed"
      )}
    >
      <div className={cn("rounded-lg p-3 font-semibold text-center", column.color)}>
        {column.label} ({projects.length})
      </div>
      <div className="space-y-3">
        {projects.map(project => (
          <DraggableProjectCard key={project.id} project={project} />
        ))}
        {projects.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
            Drop projects here
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableProjectCard({ project }: { project: Project }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: project.id,
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
      <Link href={`/projects/${project.id}`}>
        <Card 
          className="cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing"
          data-testid={`kanban-project-${project.id}`}
        >
          <CardContent className="p-4">
            <div className="font-medium text-sm line-clamp-2">{project.name}</div>
            
            <div className="flex items-center gap-2 mt-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full",
                    project.health === 'Green' && "bg-emerald-500",
                    project.health === 'Yellow' && "bg-amber-500",
                    project.health === 'Red' && "bg-rose-500",
                  )}
                  style={{ width: `${project.completionPercentage}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{project.completionPercentage}%</span>
            </div>

            <div className="flex items-center justify-between mt-3 gap-2">
              <Badge className={cn(
                "text-xs",
                project.priority === 'Critical' && "bg-rose-500 text-white hover:bg-rose-500",
                project.priority === 'High' && "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400",
                project.priority === 'Medium' && "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
                project.priority === 'Low' && "bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
              )}>
                {project.priority}
              </Badge>
              {project.endDate && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(project.endDate), 'MMM d')}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

// Gantt View Component
type ZoomLevel = 30 | 60 | 90 | 180 | 365 | 730 | 1095 | 1825;
type RangePreset = "month" | "quarter" | "year" | "2year" | "3year" | "5year" | "custom";
const zoomDaysArray: ZoomLevel[] = [30, 60, 90, 180, 365, 730, 1095, 1825];
const zoomDaysLabels: Record<ZoomLevel, string> = {
  30: '1 Month',
  60: '2 Months',
  90: '3 Months',
  180: '6 Months',
  365: '1 Year',
  730: '2 Years',
  1095: '3 Years',
  1825: '5 Years'
};

function ProjectsGanttView({ projects }: { projects: Project[] }) {
  const [zoomDays, setZoomDays] = useState<ZoomLevel>(90);
  const [rangePreset, setRangePreset] = useState<RangePreset>("custom");
  const [timelineStart, setTimelineStart] = useState(() => {
    const projectsWithDates = projects.filter(p => p.startDate);
    if (projectsWithDates.length > 0) {
      const earliestStart = projectsWithDates.reduce((earliest, p) => {
        const start = parseISO(p.startDate!);
        return start < earliest ? start : earliest;
      }, parseISO(projectsWithDates[0].startDate!));
      return startOfMonth(earliestStart);
    }
    return startOfMonth(new Date());
  });

  const timelineEnd = addDays(timelineStart, zoomDays - 1);
  const days = eachDayOfInterval({ start: timelineStart, end: timelineEnd });
  const totalDays = days.length;

  const getBarPosition = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    
    const startOffset = Math.max(0, differenceInDays(start, timelineStart));
    const duration = differenceInDays(end, start) + 1;
    const endOffset = startOffset + duration;
    
    if (endOffset <= 0 || startOffset >= totalDays) return null;
    
    const clampedStart = Math.max(0, startOffset);
    const clampedEnd = Math.min(totalDays, endOffset);
    
    return {
      left: `${(clampedStart / totalDays) * 100}%`,
      width: `${((clampedEnd - clampedStart) / totalDays) * 100}%`,
    };
  };

  const getTimeMarkers = () => {
    return days.reduce((acc, day, index) => {
      if (zoomDays <= 60) {
        if (day.getDate() === 1 || day.getDate() === 15 || index === 0) {
          acc.push({ index, label: format(day, 'MMM d') });
        }
      } else if (zoomDays <= 180) {
        if (day.getDate() === 1 || index === 0) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else if (zoomDays <= 365) {
        if (day.getDate() === 1 && (day.getMonth() % 3 === 0 || index === 0)) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else if (zoomDays <= 1095) {
        // 2-3 years: show every 6 months
        if (day.getDate() === 1 && (day.getMonth() % 6 === 0 || index === 0)) {
          acc.push({ index, label: format(day, 'MMM yyyy') });
        }
      } else {
        // 5 years: show yearly
        if (day.getDate() === 1 && day.getMonth() === 0) {
          acc.push({ index, label: format(day, 'yyyy') });
        }
      }
      return acc;
    }, [] as { index: number; label: string }[]);
  };

  const handleZoomIn = () => {
    setRangePreset("custom");
    const idx = zoomDaysArray.indexOf(zoomDays);
    if (idx > 0) setZoomDays(zoomDaysArray[idx - 1]);
  };

  const handleZoomOut = () => {
    setRangePreset("custom");
    const idx = zoomDaysArray.indexOf(zoomDays);
    if (idx < zoomDaysArray.length - 1) setZoomDays(zoomDaysArray[idx + 1]);
  };

  const handleRangePreset = (preset: RangePreset) => {
    setRangePreset(preset);
    const today = new Date();
    if (preset === "month") {
      setTimelineStart(startOfMonth(today));
      setZoomDays(30);
    } else if (preset === "quarter") {
      const quarterStart = startOfMonth(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1));
      setTimelineStart(quarterStart);
      setZoomDays(90);
    } else if (preset === "year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(365);
    } else if (preset === "2year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(730);
    } else if (preset === "3year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(1095);
    } else if (preset === "5year") {
      setTimelineStart(new Date(today.getFullYear(), 0, 1));
      setZoomDays(1825);
    }
  };

  const navigateTimeline = (direction: 'prev' | 'next') => {
    setRangePreset("custom");
    const step = zoomDays <= 60 ? 30 : zoomDays <= 180 ? 30 : 90;
    setTimelineStart(prev => addDays(prev, direction === 'next' ? step : -step));
  };

  const goToToday = () => {
    setRangePreset("custom");
    setTimelineStart(startOfMonth(new Date()));
  };

  const timeMarkers = getTimeMarkers();

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateTimeline('prev')} data-testid="button-gantt-prev">
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-gantt-today">
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateTimeline('next')} data-testid="button-gantt-next">
              Next
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">Range:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <Button
                variant={rangePreset === "month" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none text-xs px-3"
                onClick={() => handleRangePreset("month")}
                data-testid="button-range-month"
              >
                Month
              </Button>
              <Button
                variant={rangePreset === "quarter" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none text-xs px-3"
                onClick={() => handleRangePreset("quarter")}
                data-testid="button-range-quarter"
              >
                Quarter
              </Button>
              <Button
                variant={rangePreset === "year" ? "secondary" : "ghost"}
                size="sm"
                className="rounded-none text-xs px-3"
                onClick={() => handleRangePreset("year")}
                data-testid="button-range-year"
              >
                Year
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">Zoom:</span>
            <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoomDaysArray.indexOf(zoomDays) === 0} data-testid="button-zoom-in">
              +
            </Button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">{zoomDaysLabels[zoomDays]}</span>
            <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoomDaysArray.indexOf(zoomDays) === zoomDaysArray.length - 1} data-testid="button-zoom-out">
              -
            </Button>
          </div>

          <span className="text-sm text-muted-foreground">
            {format(timelineStart, 'MMM d, yyyy')} - {format(timelineEnd, 'MMM d, yyyy')}
          </span>
        </div>

        <div className="relative overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="flex border-b border-border mb-2">
              <div className="w-64 flex-shrink-0 p-2 font-semibold text-sm">Project</div>
              <div className="flex-1 relative h-8">
                {timeMarkers.map((marker, i) => (
                  <div 
                    key={i}
                    className="absolute text-xs text-muted-foreground"
                    style={{ left: `${(marker.index / totalDays) * 100}%` }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {projects.map(project => {
                const barPosition = getBarPosition(project.startDate, project.endDate);
                
                return (
                  <div key={project.id} className="flex items-center">
                    <div className="w-64 flex-shrink-0 p-2">
                      <Link href={`/projects/${project.id}`}>
                        <div className="hover:text-primary cursor-pointer">
                          <div className="font-medium text-sm truncate">{project.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{project.status}</Badge>
                            <span className="text-xs text-muted-foreground">{project.completionPercentage}%</span>
                          </div>
                        </div>
                      </Link>
                    </div>
                    <div className="flex-1 relative h-10 bg-muted/30 rounded">
                      {barPosition ? (
                        <div
                          className={cn(
                            "absolute top-1 bottom-1 rounded-md flex items-center justify-center text-xs font-medium text-white",
                            project.health === 'Green' && "bg-emerald-500",
                            project.health === 'Yellow' && "bg-amber-500",
                            project.health === 'Red' && "bg-rose-500",
                            !project.health && "bg-primary"
                          )}
                          style={barPosition}
                          data-testid={`gantt-bar-${project.id}`}
                        >
                          <div className="truncate px-2">
                            {project.startDate && project.endDate && (
                              <span>{differenceInDays(parseISO(project.endDate), parseISO(project.startDate)) + 1}d</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                          No dates set
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {projects.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No projects to display
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
