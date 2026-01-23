import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import plannerLogoPath from "@/assets/planner-logo.png";
import msprojectLogoPath from "@/assets/msproject-logo.png";
import { useRoute } from "wouter";
import { useProject, useUpdateProject, useProjectHistory } from "@/hooks/use-projects";
import { usePortfolios, useCreatePortfolio } from "@/hooks/use-portfolios";
import { useRisks, useCreateRisk, useUpdateRisk, useDeleteRisk, useRiskHistory, useConvertRiskToIssue, useAiMitigationSuggestion } from "@/hooks/use-risks";
import { useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue, useIssueHistory } from "@/hooks/use-issues";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, useTaskDependencies, useAddTaskDependency, useRemoveTaskDependency, useProjectDependencies, useReorderTask } from "@/hooks/use-tasks";
import { calculateCPM, type CPMResult } from "@/lib/cpm";
import { useMilestones } from "@/hooks/use-milestones";
import { useChangeRequests, useCreateChangeRequest, useUpdateChangeRequest, useDeleteChangeRequest } from "@/hooks/use-change-requests";
import { useProjectDocuments, useCreateProjectDocument, useUpdateProjectDocument, useDeleteProjectDocument } from "@/hooks/use-project-documents";
import { useProjectComments, useCreateProjectComment, useDeleteProjectComment } from "@/hooks/use-project-comments";
import { useBillableStatusComments, useCreateBillableStatusComment } from "@/hooks/use-billable-status-comments";
import { useHealthStatusHistory } from "@/hooks/use-health-status-history";
import { useProjectFinancials, useCreateProjectFinancial, useUpdateProjectFinancial, useDeleteProjectFinancial } from "@/hooks/use-project-financials";
import { useRiskResourceAssignments, useUpdateRiskResourceAssignments, useTaskResourceAssignments, useUpdateTaskResourceAssignments, useIssueResourceAssignments, useUpdateIssueResourceAssignments, useResources, useAllTaskResourceAssignments } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { ResourceSelector } from "@/components/ResourceSelector";
import { StatusReportDialog } from "@/components/StatusReportDialog";
import { ProjectStatusReport } from "@/components/ProjectStatusReport";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, AlertCircle, CheckSquare, Calendar as CalendarIcon, DollarSign, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, FileText, Pencil, Check, X, LayoutGrid, GanttChartSquare, Table, GripVertical, User as UserIcon, Flag, GanttChart, Columns3, History, Clock, MoreVertical, ZoomIn, ZoomOut, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Milestone as MilestoneIcon, ClipboardList, FolderOpen, ExternalLink, Download, Upload, Link as LinkIcon, Link2, Eye, Search, CheckCircle2, Circle, ArrowRight, MessageSquare, Send, Reply, ArrowUpDown, ArrowUp, ArrowDown, Maximize2, Minimize2, Undo2, Redo2, FolderKanban, RefreshCw, Focus, GitBranch, Share2, Mail } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useTaskHistory } from "@/hooks/use-tasks";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays, differenceInDays, parseISO, isAfter, isBefore, startOfDay, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertRiskSchema, insertIssueSchema, insertTaskSchema } from "@shared/schema";
import type { Task, ProjectFinancial, Risk, Issue, ChangeRequest, ProjectDocument, User } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, closestCorners, useSensor, useSensors, PointerSensor, useDroppable, useDraggable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { GanttDependencyLinks } from "@/components/GanttDependencyLinks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useLocation } from "wouter";
import { useSidebarState } from "@/components/layout/Sidebar";

const PROJECT_STAGES = [
  { value: "Initiation", label: "Initiation", description: "Project kickoff" },
  { value: "Planning", label: "Planning", description: "Define scope & schedule" },
  { value: "Execution", label: "Execution", description: "Active development" },
  { value: "Monitoring", label: "Monitoring", description: "Track & control" },
  { value: "Closing", label: "Closing", description: "Project completion" },
  { value: "Billing", label: "Billing", description: "Financial/accounting completion" },
];

function BusinessProcessFlow({ 
  currentStatus, 
  onStatusChange 
}: { 
  currentStatus: string; 
  onStatusChange: (status: string) => void;
}) {
  const currentIndex = PROJECT_STAGES.findIndex(s => s.value === currentStatus);
  
  return (
    <div className="flex items-center justify-between">
      {PROJECT_STAGES.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;
          
          return (
            <div key={stage.value} className="flex items-center flex-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onStatusChange(stage.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 group cursor-pointer transition-all",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md p-2"
                    )}
                    data-testid={`status-stage-${stage.value.toLowerCase()}`}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-all border-2",
                      isCompleted && "bg-primary border-primary text-primary-foreground",
                      isCurrent && "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20",
                      isUpcoming && "bg-muted border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50 group-hover:bg-muted/80"
                    )}>
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isCurrent ? (
                        <span className="text-sm font-bold">{index + 1}</span>
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </div>
                    <span className={cn(
                      "text-xs font-medium transition-colors",
                      (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}>
                      {stage.label}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{stage.label}</p>
                  <p className="text-xs text-muted-foreground">{stage.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">Click to set status</p>
                </TooltipContent>
              </Tooltip>
              
              {index < PROJECT_STAGES.length - 1 && (
                <div className={cn(
                  "flex-1 h-1 mx-2 rounded-full transition-colors",
                  index < currentIndex ? "bg-primary" : "bg-muted-foreground/20"
                )} />
              )}
            </div>
          );
        })}
    </div>
  );
}

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const id = parseInt(params?.id || "0");
  const { data: project, isLoading } = useProject(id);
  const { data: financials } = useProjectFinancials(id);
  const { data: projectTasks } = useTasks(id);
  const { data: projectRisks } = useRisks(id);
  const { data: projectIssues } = useIssues(id);
  const { data: projectMilestones } = useMilestones(id);
  const { data: projectChangeRequests } = useChangeRequests(id);
  const { data: projectDocuments } = useProjectDocuments(id);
  const { mutate: updateProject } = useUpdateProject();
  const { toast } = useToast();
  const [isProjectHistoryOpen, setIsProjectHistoryOpen] = useState(false);
  const [isStatusReportOpen, setIsStatusReportOpen] = useState(false);
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    workflow: false,
    stats: false,
    timeline: false,
    tabs: false,
  });

  const toggleSection = (section: keyof typeof sectionsCollapsed) => {
    setSectionsCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const collapseAll = () => {
    setSectionsCollapsed({ workflow: true, stats: true, timeline: true, tabs: true });
  };

  const expandAll = () => {
    setSectionsCollapsed({ workflow: false, stats: false, timeline: false, tabs: false });
  };

  const allCollapsed = Object.values(sectionsCollapsed).every(v => v);
  const allExpanded = Object.values(sectionsCollapsed).every(v => !v);
  const { currentOrganization } = useOrganization();
  const [, setLocation] = useLocation();

  // Read tab from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || 'summary';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Redirect if project doesn't belong to current organization
  useEffect(() => {
    if (project && currentOrganization && project.organizationId !== currentOrganization.id) {
      toast({
        title: "Organization Changed",
        description: "Redirecting to dashboard - this project belongs to a different organization.",
        variant: "default"
      });
      setLocation("/");
    }
  }, [project, currentOrganization, setLocation, toast]);

  // Calculate financial budget total if financials exist
  const financialBudgetTotal = useMemo(() => {
    if (!financials || financials.length === 0) return 0;
    return financials.reduce((sum: number, item: ProjectFinancial) => sum + Number(item.budgetAmount || 0), 0);
  }, [financials]);

  // Use financial budget total if available, otherwise use project budget
  const displayBudget = financialBudgetTotal > 0 ? financialBudgetTotal : Number(project?.budget || 0);

  // Calculate progress based on task averages (or fall back to manual completionPercentage)
  const calculatedProgress = useMemo(() => {
    if (!projectTasks || projectTasks.length === 0) {
      return project?.completionPercentage || 0;
    }
    const totalProgress = projectTasks.reduce((sum, t) => sum + (t.progress || 0), 0);
    return Math.round(totalProgress / projectTasks.length);
  }, [projectTasks, project?.completionPercentage]);

  if (isLoading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!project) return <div>Project not found</div>;
  
  // Don't render if project doesn't match current organization (will redirect)
  if (currentOrganization && project.organizationId !== currentOrganization.id) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

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
            <h1 className="text-3xl font-display font-bold text-foreground">{project.name}</h1>
            <Badge className={cn(
              "text-sm px-3 py-1",
              project.health === 'Green' ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" :
              project.health === 'Yellow' ? "bg-amber-100 text-amber-800 hover:bg-amber-100" :
              "bg-rose-100 text-rose-800 hover:bg-rose-100"
            )}>
              {project.health} Health
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-muted-foreground">{project.description}</p>
        </div>
        <div className="flex items-center gap-3">
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
                onClick={() => setIsStatusReportOpen(true)}
                data-testid="button-status-report"
              >
                <ClipboardList className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Status Report</TooltipContent>
          </Tooltip>
          
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" data-testid="button-download-project">
                    <Download className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Download Project</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => setIsStatusReportOpen(true)}
                data-testid="menu-comprehensive-report"
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Comprehensive Status Report
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  window.open(`/api/projects/${project.id}/export?format=csv`, '_blank');
                }}
                data-testid="menu-download-csv"
              >
                <FileText className="h-4 w-4 mr-2" />
                Download as CSV
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  window.open(`/api/projects/${project.id}/export?format=mspdi`, '_blank');
                }}
                data-testid="menu-download-mspdi"
              >
                <GanttChart className="h-4 w-4 mr-2" />
                Download as MS Project XML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
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

      {/* Business Process Flow */}
      <Collapsible open={!sectionsCollapsed.workflow} onOpenChange={() => toggleSection('workflow')}>
        <div className="bg-muted/50 border border-border rounded-lg">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover-elevate rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium">
                {sectionsCollapsed.workflow ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <GitBranch className="h-4 w-4" />
                Project Workflow
              </div>
              <Badge variant="outline" className="text-xs">
                {project.status}
              </Badge>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4">
              <BusinessProcessFlow 
                currentStatus={project.status} 
                onStatusChange={handleStatusChange} 
              />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="py-2">
          <CardHeader className="py-1 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              Budget
              {financialBudgetTotal > 0 && (
                <Badge variant="outline" className="text-[9px] font-normal py-0">From Financials</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 px-4">
            <div className="text-base font-semibold flex items-center"><DollarSign className="h-4 w-4 mr-1 text-muted-foreground" />{displayBudget.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardHeader className="py-1 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              Progress
              {projectTasks && projectTasks.length > 0 && (
                <Badge variant="outline" className="text-[9px] font-normal py-0">From Tasks</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1 px-4">
             <div className="text-base font-semibold">{calculatedProgress}%</div>
             <Progress value={calculatedProgress} className="h-1.5 mt-1" />
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardHeader className="py-1 px-4"><CardTitle className="text-xs font-medium text-muted-foreground">Start Date</CardTitle></CardHeader>
          <CardContent className="py-1 px-4">
            <div className="text-base font-semibold flex items-center"><CalendarIcon className="h-4 w-4 mr-1 text-muted-foreground" />{project.startDate ? format(new Date(project.startDate), 'MMM d, yyyy') : '-'}</div>
          </CardContent>
        </Card>
        <Card className="py-2">
          <CardHeader className="py-1 px-4"><CardTitle className="text-xs font-medium text-muted-foreground">End Date</CardTitle></CardHeader>
          <CardContent className="py-1 px-4">
            <div className="text-base font-semibold flex items-center"><CalendarIcon className="h-4 w-4 mr-1 text-muted-foreground" />{project.endDate ? format(new Date(project.endDate), 'MMM d, yyyy') : '-'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Section */}
      <ProjectTimeline 
        projectId={project.id}
        startDate={project.startDate}
        endDate={project.endDate}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/80 border border-border p-1.5 rounded-xl flex-wrap gap-1 h-auto">
          <TabsTrigger value="summary" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-summary">Project Summary</TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-tasks">Tasks</TabsTrigger>
          <TabsTrigger value="risks" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-risks">Risks Log</TabsTrigger>
          <TabsTrigger value="issues" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-issues">Issues</TabsTrigger>
          <TabsTrigger value="financials" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-financials">Financials</TabsTrigger>
          <TabsTrigger value="change-requests" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-change-requests">Change Requests</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-documents">Documents</TabsTrigger>
          <TabsTrigger value="status-report" className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" data-testid="tab-status-report">Status Report</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="summary">
            <ProjectSummaryTab project={project} onUpdate={updateProject} />
          </TabsContent>
          <TabsContent value="tasks" className="relative">
            <TasksTab projectId={project.id} projectName={project.name} projectStartDate={project.startDate} projectEndDate={project.endDate} projectSource={project.source} plannerPlanId={project.plannerPlanId} sourceFileName={project.sourceFileName} sourceFileUrl={project.sourceFileUrl} dataverseOrgId={project.dataverseOrgId} dataverseTenantId={project.dataverseTenantId} />
          </TabsContent>
          <TabsContent value="risks">
            <RisksTab projectId={project.id} projectName={project.name} />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesTab projectId={project.id} projectName={project.name} />
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
          <TabsContent value="status-report">
            <StatusReportTab 
              project={project}
              risks={projectRisks || []}
              issues={projectIssues || []}
              milestones={projectMilestones || []}
              financials={financials || []}
              tasks={projectTasks || []}
              changeRequests={projectChangeRequests || []}
              documents={projectDocuments || []}
            />
          </TabsContent>
        </div>
      </Tabs>

      <ProjectHistoryDialog 
        projectId={project.id} 
        open={isProjectHistoryOpen} 
        onOpenChange={setIsProjectHistoryOpen} 
      />

      <StatusReportDialog
        open={isStatusReportOpen}
        onOpenChange={setIsStatusReportOpen}
        project={project}
        risks={projectRisks || []}
        issues={projectIssues || []}
        milestones={projectMilestones || []}
        financials={financials || []}
        tasks={projectTasks || []}
        changeRequests={projectChangeRequests || []}
        documents={projectDocuments || []}
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
  const { data: tasks } = useTasks(projectId);
  
  // Parse project dates
  const projectStart = startDate ? parseISO(startDate) : null;
  const projectEnd = endDate ? parseISO(endDate) : null;
  
  // Get milestones from milestones table AND tasks marked as milestones
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
    
    // Add tasks marked as milestones (use end date or start date as the milestone date)
    tasks?.filter(t => t.isMilestone && (t.endDate || t.startDate)).forEach((t) => {
      const dateStr = t.endDate || t.startDate;
      if (!dateStr) return;
      events.push({
        id: t.id,
        type: 'task-milestone',
        title: t.name,
        date: parseISO(dateStr),
        completed: t.status === 'Completed',
      });
    });
    
    // Sort by date
    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [milestones, tasks]);
  
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
      <Card className="py-2">
        <CardHeader className="py-1 px-4">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <GanttChart className="h-3 w-3" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-4">
          <p className="text-xs text-muted-foreground">Set project start and end dates to view the timeline.</p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="py-2">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-2 px-4 cursor-pointer hover-elevate flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <GanttChart className="h-4 w-4" />
              Timeline
            </CardTitle>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Flag className="h-3.5 w-3.5 text-primary" />
                {format(projectStart, 'MMM d, yyyy')}
              </span>
              <span className="flex items-center gap-1.5">
                {format(projectEnd, 'MMM d, yyyy')}
                <Flag className="h-3.5 w-3.5 text-green-600" />
              </span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-2 px-4 pb-3">
            {/* Year markers */}
            <div className="relative h-5 mb-2">
              {yearMarkers.map((marker) => (
                <span 
                  key={marker.year}
                  className="absolute text-xs font-medium text-muted-foreground -translate-x-1/2"
                  style={{ left: `${marker.position}%` }}
                >
                  {marker.year}
                </span>
              ))}
            </div>
            
            {/* Timeline bar with padding for markers */}
            <div className="relative h-10 mx-4">
              {/* Background bar */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 bg-muted rounded-full" />
              
              {/* Progress bar (from start to today if today is within range) */}
              {timelineRange.todayPosition >= 0 && timelineRange.todayPosition <= 100 && (
                <div 
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 h-4 bg-slate-400 dark:bg-slate-600",
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
                  <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-green-600 font-medium whitespace-nowrap bg-background px-1 rounded">
                    {format(timelineRange.today, 'MMM dd')}
                  </div>
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
                          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-sm rotate-45 cursor-pointer z-20 border-2",
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
              <div className="absolute -left-4 top-1/2 -translate-y-1/2">
                <Flag className="h-4 w-4 text-primary" />
              </div>
              
              {/* End marker */}
              <div className="absolute -right-4 top-1/2 -translate-y-1/2">
                <Flag className="h-4 w-4 text-green-600" />
              </div>
            </div>
            
            {/* Legend */}
            <div className="flex items-center justify-between mt-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-green-600 rounded-sm rotate-45" />
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-red-500 rounded-sm rotate-45" />
                  <span>Pending</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-green-600" />
                  <span>Today</span>
                </div>
              </div>
              <span className="text-muted-foreground/70">
                {allEvents.length} milestone{allEvents.length !== 1 ? 's' : ''}
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function BillableStatusCommentLog({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: comments, isLoading } = useBillableStatusComments(projectId);
  const createComment = useCreateBillableStatusComment(projectId);
  const { data: users } = useQuery<User[]>({ queryKey: ['/api/users'] });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    createComment.mutate({ content: newComment.trim() }, {
      onSuccess: () => {
        setNewComment("");
        toast({ title: "Comment added to billable status log" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add comment", variant: "destructive" });
      }
    });
  };

  // Use stored userName from the comment, fallback to lookup if needed
  const getAuthorName = (userName: string | null, userId: string | null) => {
    if (userName) return userName;
    if (!userId) return 'Unknown';
    const user = users?.find(u => u.id === userId);
    if (!user) return 'Unknown';
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.username || user.email || 'Unknown';
  };

  return (
    <div className="border rounded-lg bg-muted/30">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button 
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
            data-testid="button-billable-status-comments-toggle"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Billable Status Updates</span>
              <Badge variant="secondary" className="text-xs">
                {comments?.length || 0}
              </Badge>
            </div>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                placeholder="Add an update..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1"
                data-testid="input-billable-status-comment"
              />
              <Button 
                type="submit" 
                size="sm" 
                disabled={!newComment.trim() || createComment.isPending}
                data-testid="button-add-billable-status-comment"
              >
                {createComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : comments && comments.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {comments.map((entry) => (
                  <div 
                    key={entry.id} 
                    className="flex items-start gap-3 p-2 rounded-md bg-background border"
                    data-testid={`billable-status-comment-${entry.id}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <UserIcon className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{getAuthorName(entry.userName, entry.userId)}</span>
                        <span className="text-xs text-muted-foreground">
                          {entry.createdAt ? format(new Date(entry.createdAt), 'MMM d, yyyy h:mm a') : ''}
                        </span>
                        {entry.billableStatus && (
                          <Badge variant="outline" className="text-xs">
                            {entry.billableStatus}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1">{entry.comment}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">No updates yet</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function HealthStatusHistoryLog({ projectId }: { projectId: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: history, isLoading } = useHealthStatusHistory(projectId);

  const getHealthColor = (health: string | null) => {
    switch (health) {
      case 'Green': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
      case 'Yellow': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      case 'Red': return 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="border rounded-lg bg-muted/30">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button 
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
            data-testid="button-health-status-history-toggle"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Health Status History</span>
              <Badge variant="secondary" className="text-xs">
                {history?.length || 0}
              </Badge>
            </div>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : history && history.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map((entry) => (
                  <div 
                    key={entry.id} 
                    className="flex items-start gap-3 p-3 rounded-md bg-background border"
                    data-testid={`health-status-history-${entry.id}`}
                  >
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <Badge className={cn("text-xs px-2 py-0.5", getHealthColor(entry.previousHealth))}>
                        {entry.previousHealth || 'None'}
                      </Badge>
                      <ArrowDown className="h-3 w-3 text-muted-foreground" />
                      <Badge className={cn("text-xs px-2 py-0.5", getHealthColor(entry.newHealth))}>
                        {entry.newHealth}
                      </Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{entry.changedByName || 'Unknown'}</span>
                        <span className="text-xs text-muted-foreground">
                          {entry.createdAt ? format(new Date(entry.createdAt), 'MMM d, yyyy h:mm a') : ''}
                        </span>
                      </div>
                      {entry.comment && (
                        <p className="text-sm text-muted-foreground mt-1">{entry.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">No health status changes recorded yet</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ProjectSummaryTab({ project, onUpdate }: { project: any; onUpdate: any }) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { data: resources } = useResources(currentOrganization?.id ?? null);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const createPortfolio = useCreatePortfolio();
  const [managerResourceId, setManagerResourceId] = useState<number | null>(null);
  const [showNewPortfolioDialog, setShowNewPortfolioDialog] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showHealthReasonDialog, setShowHealthReasonDialog] = useState(false);
  const [pendingHealth, setPendingHealth] = useState<string | null>(null);
  const [healthReason, setHealthReason] = useState(project.healthReason || "");
  const [editValues, setEditValues] = useState({
    name: project.name || "",
    description: project.description || "",
    budget: project.budget || "0",
    completionPercentage: project.completionPercentage || 0,
  });
  
  useEffect(() => {
    if (project.managerResourceId) {
      setManagerResourceId(project.managerResourceId);
    } else if (project.managerId && resources) {
      const managerResource = resources.find(r => r.userId === project.managerId);
      if (managerResource) {
        setManagerResourceId(managerResource.id);
      }
    }
  }, [project.managerResourceId, project.managerId, resources]);

  useEffect(() => {
    setEditValues({
      name: project.name || "",
      description: project.description || "",
      budget: project.budget || "0",
      completionPercentage: project.completionPercentage || 0,
    });
  }, [project]);

  const autoSave = (field: string, value: any) => {
    onUpdate({ 
      id: project.id, 
      [field]: value 
    }, {
      onSuccess: () => {
        toast({ title: "Saved" });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
      }
    });
  };

  const handleFieldBlur = (field: string) => {
    const value = editValues[field as keyof typeof editValues];
    if (value !== project[field]) {
      autoSave(field, value);
    }
    setEditingField(null);
  };

  const handleSelectChange = (field: string, value: string) => {
    autoSave(field, value);
  };

  const handleHealthChange = (newHealth: string) => {
    if (newHealth !== project.health) {
      setPendingHealth(newHealth);
      setShowHealthReasonDialog(true);
    }
  };

  const saveHealthWithReason = () => {
    if (!pendingHealth) return;
    onUpdate({ 
      id: project.id, 
      health: pendingHealth,
      healthReason: healthReason.trim() || null,
      healthReasonUpdatedAt: new Date().toISOString()
    }, {
      onSuccess: () => {
        toast({ title: "Health status updated" });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] });
        setShowHealthReasonDialog(false);
        setPendingHealth(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update health", variant: "destructive" });
      }
    });
  };

  const skipHealthReason = () => {
    if (!pendingHealth) return;
    onUpdate({ 
      id: project.id, 
      health: pendingHealth
    }, {
      onSuccess: () => {
        toast({ title: "Health status updated" });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] });
        setShowHealthReasonDialog(false);
        setPendingHealth(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update health", variant: "destructive" });
      }
    });
  };

  const handlePortfolioChange = (value: string) => {
    if (value === "new") {
      setShowNewPortfolioDialog(true);
      return;
    }
    const portfolioId = value === "none" ? null : Number(value);
    autoSave("portfolioId", portfolioId);
  };

  const handleCreatePortfolio = async () => {
    if (!newPortfolioName.trim() || !currentOrganization?.id) return;
    try {
      const newPortfolio = await createPortfolio.mutateAsync({
        organizationId: currentOrganization.id,
        name: newPortfolioName.trim(),
        status: "Active",
        healthScore: "Green",
      });
      toast({ title: "Portfolio created" });
      setShowNewPortfolioDialog(false);
      setNewPortfolioName("");
      autoSave("portfolioId", newPortfolio.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDateChange = (field: string, date: Date | undefined) => {
    if (date) {
      autoSave(field, format(date, 'yyyy-MM-dd'));
    }
  };

  const currentPortfolio = portfolios?.find(p => p.id === project.portfolioId);

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Project Summary</CardTitle>
              <CardDescription className="text-xs">Click any field to edit</CardDescription>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Project Name</Label>
              {editingField === 'name' ? (
                <Input
                  value={editValues.name}
                  onChange={(e) => setEditValues(prev => ({ ...prev, name: e.target.value }))}
                  onBlur={() => handleFieldBlur('name')}
                  onKeyDown={(e) => e.key === 'Enter' && handleFieldBlur('name')}
                  autoFocus
                  className="h-9 text-base font-semibold mt-1"
                  data-testid="input-project-name"
                />
              ) : (
                <p className="text-base font-semibold cursor-pointer hover:bg-muted/50 rounded px-1 py-1 -mx-1 transition-colors mt-1" onClick={() => setEditingField('name')} data-testid="text-project-name">
                  {project.name}
                </p>
              )}
            </div>
            <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Health Status</Label>
              <div className="flex rounded-md border border-border bg-muted/30 p-0.5 mt-1" data-testid="toggle-project-health">
                {[
                  { value: 'Green', bg: 'bg-emerald-500', bgLight: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
                  { value: 'Yellow', bg: 'bg-amber-500', bgLight: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
                  { value: 'Red', bg: 'bg-rose-500', bgLight: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300' },
                ].map((option) => {
                  const isSelected = project.health === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleHealthChange(option.value)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all",
                        isSelected ? `${option.bgLight} ${option.text}` : "text-muted-foreground hover:bg-muted/80"
                      )}
                      data-testid={`health-option-${option.value.toLowerCase()}`}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", isSelected ? option.bg : "bg-muted-foreground/30")} />
                      {option.value}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Billable Status</Label>
              <Select 
                value={project.billableStatus || "N/A"} 
                onValueChange={(v) => handleSelectChange('billableStatus', v)}
              >
                <SelectTrigger className="mt-1" data-testid="select-billable-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N/A">N/A</SelectItem>
                  <SelectItem value="On Track">On Track</SelectItem>
                  <SelectItem value="Waiting for Approval">Waiting for Approval</SelectItem>
                  <SelectItem value="Verbal Approval">Verbal Approval</SelectItem>
                  <SelectItem value="Email Approval">Email Approval</SelectItem>
                  <SelectItem value="SOW Signed">SOW Signed</SelectItem>
                  <SelectItem value="PO Received">PO Received</SelectItem>
                  <SelectItem value="Partially Invoiced">Partially Invoiced</SelectItem>
                  <SelectItem value="At Risk">At Risk</SelectItem>
                  <SelectItem value="Ready for Invoice">Ready for Invoice</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="Invoiced">Invoiced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
          </div>
        </div>
        {project.healthReason && (
          <p className="text-xs text-muted-foreground italic mt-1">"{project.healthReason}"</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Portfolio</Label>
              <Select value={project.portfolioId?.toString() || "none"} onValueChange={handlePortfolioChange}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-project-portfolio">
                  <SelectValue>{currentPortfolio?.name || "None"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Portfolio</SelectItem>
                  {portfolios?.map((p) => (<SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>))}
                  <SelectItem value="new" className="text-primary font-medium"><Plus className="h-3 w-3 inline mr-1" />New</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Priority</Label>
              <Select value={project.priority || "Medium"} onValueChange={(v) => handleSelectChange('priority', v)}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-project-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget</Label>
              {editingField === 'budget' ? (
                <Input type="number" value={editValues.budget} onChange={(e) => setEditValues(prev => ({ ...prev, budget: e.target.value }))} onBlur={() => handleFieldBlur('budget')} onKeyDown={(e) => e.key === 'Enter' && handleFieldBlur('budget')} autoFocus className="h-8 text-sm" data-testid="input-project-budget" />
              ) : (
                <p className="text-sm font-medium cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors" onClick={() => setEditingField('budget')} data-testid="text-project-budget">${Number(project.budget).toLocaleString()}</p>
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Completion</Label>
              {editingField === 'completionPercentage' ? (
                <Input type="number" min="0" max="100" value={editValues.completionPercentage} onChange={(e) => setEditValues(prev => ({ ...prev, completionPercentage: Number(e.target.value) }))} onBlur={() => handleFieldBlur('completionPercentage')} onKeyDown={(e) => e.key === 'Enter' && handleFieldBlur('completionPercentage')} autoFocus className="h-8 text-sm" data-testid="input-project-completion" />
              ) : (
                <p className="text-sm font-medium cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors" onClick={() => setEditingField('completionPercentage')} data-testid="text-project-completion">{project.completionPercentage}%</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-8 justify-start text-left text-sm font-normal px-2" data-testid="button-start-date">
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {project.startDate ? format(new Date(project.startDate), 'MMM d, yy') : 'Set'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={project.startDate ? new Date(project.startDate) : undefined} onSelect={(date) => handleDateChange('startDate', date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">End</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-8 justify-start text-left text-sm font-normal px-2" data-testid="button-end-date">
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {project.endDate ? format(new Date(project.endDate), 'MMM d, yy') : 'Set'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={project.endDate ? new Date(project.endDate) : undefined} onSelect={(date) => handleDateChange('endDate', date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Manager</Label>
              <ResourceSelector
                organizationId={currentOrganization?.id ?? 0}
                projectId={project.id}
                selectedResourceId={managerResourceId}
                onSelectionChange={(resourceId) => {
                  const selectedResource = resources?.find(r => r.id === resourceId);
                  setManagerResourceId(resourceId);
                  onUpdate({ id: project.id, managerId: selectedResource?.userId || null, managerResourceId: resourceId }, {
                    onSuccess: () => { toast({ title: "Manager updated" }); queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] }); },
                    onError: () => { toast({ title: "Error", description: "Failed to update manager", variant: "destructive" }); }
                  });
                }}
                placeholder="Assign"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="project-timesheet-blocked"
              checked={project.timesheetBlocked || false}
              onCheckedChange={(checked) => handleSelectChange('timesheetBlocked', checked === true)}
              data-testid="checkbox-project-timesheet-blocked"
            />
            <Label htmlFor="project-timesheet-blocked" className="text-xs text-muted-foreground cursor-pointer">
              Block timesheet entries
            </Label>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Description</Label>
            {editingField === 'description' ? (
              <Textarea value={editValues.description} onChange={(e) => setEditValues(prev => ({ ...prev, description: e.target.value }))} onBlur={() => handleFieldBlur('description')} className="min-h-[60px] text-sm" autoFocus data-testid="input-project-description" />
            ) : (
              <p className="text-sm text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors line-clamp-2" onClick={() => setEditingField('description')} data-testid="text-project-description">
                {project.description || 'Click to add description...'}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          {((project as any).createdByName || project.createdAt) && (
            <span data-testid="text-created-by">
              Created{(project as any).createdByName ? ` by ${(project as any).createdByName}` : ''}{project.createdAt ? ` on ${format(new Date(project.createdAt), 'MMM d, yyyy')}` : ''}
            </span>
          )}
          {((project as any).updatedByName || (project as any).updatedAt) && (
            <span data-testid="text-modified-by">
              Modified{(project as any).updatedByName ? ` by ${(project as any).updatedByName}` : ''}{(project as any).updatedAt ? ` on ${format(new Date((project as any).updatedAt), 'MMM d, yyyy')}` : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
    
    <Dialog open={showHealthReasonDialog} onOpenChange={(open) => {
        if (!open) {
          setShowHealthReasonDialog(false);
          setPendingHealth(null);
        }
      }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Change Health Status
            {pendingHealth && (
              <Badge className={cn(
                "text-xs",
                pendingHealth === 'Green' ? "bg-emerald-100 text-emerald-800" :
                pendingHealth === 'Yellow' ? "bg-amber-100 text-amber-800" :
                "bg-rose-100 text-rose-800"
              )}>{pendingHealth}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Optionally provide a reason for this health status change.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={healthReason}
            onChange={(e) => setHealthReason(e.target.value)}
            placeholder="e.g., Budget overrun by 15%, Key milestone delayed..."
            className="min-h-[80px]"
            data-testid="input-health-reason"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={skipHealthReason} data-testid="button-skip-reason">
            Skip
          </Button>
          <Button onClick={saveHealthWithReason} data-testid="button-save-reason">
            Save with Reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    <Dialog open={showNewPortfolioDialog} onOpenChange={setShowNewPortfolioDialog}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create New Portfolio</DialogTitle>
          <DialogDescription>Add a new portfolio to organize your projects.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Portfolio Name</Label>
            <Input
              value={newPortfolioName}
              onChange={(e) => setNewPortfolioName(e.target.value)}
              placeholder="Enter portfolio name"
              data-testid="input-new-portfolio-name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewPortfolioDialog(false)}>Cancel</Button>
          <Button onClick={handleCreatePortfolio} disabled={!newPortfolioName.trim() || createPortfolio.isPending} data-testid="button-create-new-portfolio">
            {createPortfolio.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Portfolio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    
    <div className="space-y-4">
      <ProjectCommentsFeed projectId={project.id} />
      <BillableStatusCommentLog projectId={project.id} />
      <HealthStatusHistoryLog projectId={project.id} />
    </div>
  </>
  );
}

function ProjectCommentsFeed({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionTarget, setMentionTarget] = useState<'new' | 'reply'>('new');
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: comments, isLoading } = useProjectComments(projectId);
  const { data: users } = useQuery<User[]>({ queryKey: ['/api/users'] });
  const createComment = useCreateProjectComment(projectId);
  const deleteComment = useDeleteProjectComment(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  // Filter users based on mention search
  const filteredUsers = users?.filter(u => {
    const searchLower = mentionSearch.toLowerCase();
    return (
      u.username?.toLowerCase().includes(searchLower) ||
      u.email?.toLowerCase().includes(searchLower) ||
      u.firstName?.toLowerCase().includes(searchLower) ||
      u.lastName?.toLowerCase().includes(searchLower)
    );
  }).slice(0, 5) || [];

  const handleInputChange = (value: string, target: 'new' | 'reply') => {
    if (target === 'new') {
      setNewComment(value);
    } else {
      setReplyContent(value);
    }
    
    // Check if user is typing a mention
    const cursorPos = target === 'new' ? inputRef.current?.selectionStart : replyInputRef.current?.selectionStart;
    if (cursorPos !== undefined && cursorPos !== null) {
      const textBeforeCursor = value.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
      if (mentionMatch) {
        setShowMentions(true);
        setMentionSearch(mentionMatch[1]);
        setMentionTarget(target);
      } else {
        setShowMentions(false);
      }
    }
  };

  const insertMention = (user: User) => {
    const mentionText = user.username || user.email || '';
    const currentValue = mentionTarget === 'new' ? newComment : replyContent;
    const inputElement = mentionTarget === 'new' ? inputRef.current : replyInputRef.current;
    const cursorPos = inputElement?.selectionStart || currentValue.length;
    
    // Find the @ symbol position
    const textBeforeCursor = currentValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const insertedMention = '@' + mentionText + ' ';
      const newValue = currentValue.slice(0, atIndex) + insertedMention + currentValue.slice(cursorPos);
      const newCursorPos = atIndex + insertedMention.length;
      
      if (mentionTarget === 'new') {
        setNewComment(newValue);
      } else {
        setReplyContent(newValue);
      }
      
      // Restore cursor position after React updates
      requestAnimationFrame(() => {
        if (inputElement) {
          inputElement.focus();
          inputElement.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    }
    setShowMentions(false);
  };

  // Group comments by parent - top level first, then replies
  const topLevelComments = comments?.filter(c => !c.parentId) || [];
  const repliesByParent = comments?.reduce((acc, c) => {
    if (c.parentId) {
      if (!acc[c.parentId]) acc[c.parentId] = [];
      acc[c.parentId].push(c);
    }
    return acc;
  }, {} as Record<number, typeof comments>) || {};

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    createComment.mutate({ content: newComment.trim() }, {
      onSuccess: () => {
        setNewComment("");
        toast({ title: "Comment added" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add comment", variant: "destructive" });
      }
    });
  };

  const handleReplySubmit = (parentId: number) => {
    if (!replyContent.trim()) return;
    
    createComment.mutate({ content: replyContent.trim(), parentId }, {
      onSuccess: () => {
        setReplyContent("");
        setReplyingTo(null);
        toast({ title: "Reply added" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add reply", variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteComment.mutate(id, {
      onSuccess: () => {
        toast({ title: "Comment deleted" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete comment", variant: "destructive" });
      }
    });
  };

  // Highlight @mentions in comment text
  const renderContent = (content: string) => {
    const mentionRegex = /@(\w+(?:\.\w+)*(?:@[\w.-]+)?)/g;
    const result: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        result.push(content.slice(lastIndex, match.index));
      }
      // Add the highlighted mention (match[0] includes the @)
      result.push(
        <span key={match.index} className="text-primary font-medium">{match[0]}</span>
      );
      lastIndex = mentionRegex.lastIndex;
    }
    // Add remaining text after last match
    if (lastIndex < content.length) {
      result.push(content.slice(lastIndex));
    }
    
    return result.length > 0 ? result : content;
  };

  const renderComment = (comment: typeof topLevelComments[0], isReply = false) => (
    <div 
      key={comment.id} 
      className={`flex items-start gap-3 group p-2 rounded-md hover-elevate ${isReply ? 'ml-8 border-l-2 border-muted' : ''}`} 
      data-testid={`comment-${comment.id}`}
    >
      <div className={`${isReply ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0`}>
        <UserIcon className={`${isReply ? 'h-3 w-3' : 'h-4 w-4'} text-primary`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{comment.authorName}</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(comment.createdAt!), 'MMM d, yyyy h:mm a')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 break-words">{renderContent(comment.content)}</p>
        {!isReply && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 mt-1 text-xs text-muted-foreground"
            onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
            data-testid={`button-reply-${comment.id}`}
          >
            <Reply className="h-3 w-3 mr-1" />
            Reply
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => handleDelete(comment.id)}
        data-testid={`button-delete-comment-${comment.id}`}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );

  return (
    <div className="border rounded-lg bg-muted/30 mt-4">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button 
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
            data-testid="button-comments-toggle"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Comments</span>
              <Badge variant="secondary" className="text-xs">
                {comments?.length || 0}
              </Badge>
            </div>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={newComment}
              onChange={(e) => handleInputChange(e.target.value, 'new')}
              placeholder="Add a comment... (type @ to mention someone)"
              className="flex-1"
              data-testid="input-new-comment"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={!newComment.trim() || createComment.isPending}
              data-testid="button-submit-comment"
            >
              {createComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {showMentions && mentionTarget === 'new' && filteredUsers.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-md z-50 max-h-40 overflow-y-auto">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="px-3 py-2 cursor-pointer hover-elevate flex items-center gap-2"
                  onClick={() => insertMention(user)}
                  data-testid={`mention-user-${user.id}`}
                >
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="h-3 w-3 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username || user.email}
                    </p>
                    {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </form>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : topLevelComments.length > 0 ? (
          <div className="space-y-3">
            {topLevelComments.map((comment) => (
              <div key={comment.id}>
                {renderComment(comment)}
                
                {/* Reply form */}
                {replyingTo === comment.id && (
                  <div className="ml-8 mt-2 relative">
                    <div className="flex gap-2">
                      <Input
                        ref={replyInputRef}
                        value={replyContent}
                        onChange={(e) => handleInputChange(e.target.value, 'reply')}
                        placeholder="Write a reply... (type @ to mention someone)"
                        className="flex-1"
                        autoFocus
                        data-testid={`input-reply-${comment.id}`}
                      />
                      <Button
                        size="icon"
                        onClick={() => handleReplySubmit(comment.id)}
                        disabled={!replyContent.trim() || createComment.isPending}
                        data-testid={`button-submit-reply-${comment.id}`}
                      >
                        {createComment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setReplyingTo(null); setReplyContent(""); setShowMentions(false); }}
                        data-testid={`button-cancel-reply-${comment.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {showMentions && mentionTarget === 'reply' && filteredUsers.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-md z-50 max-h-40 overflow-y-auto">
                        {filteredUsers.map((user) => (
                          <div
                            key={user.id}
                            className="px-3 py-2 cursor-pointer hover-elevate flex items-center gap-2"
                            onClick={() => insertMention(user)}
                            data-testid={`mention-reply-user-${user.id}`}
                          >
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <UserIcon className="h-3 w-3 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username || user.email}
                              </p>
                              {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Replies */}
                {repliesByParent[comment.id]?.map((reply) => renderComment(reply, true))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first to add one!</p>
        )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function RisksTab({ projectId, projectName }: { projectId: number; projectName?: string }) {
  const { currentOrganization } = useOrganization();
  const { data: risks, isLoading } = useRisks(projectId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [deleteRiskData, setDeleteRiskData] = useState<Risk | null>(null);
  const [historyRiskId, setHistoryRiskId] = useState<number | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();
  const convertRiskToIssue = useConvertRiskToIssue();
  const aiMitigationSuggestion = useAiMitigationSuggestion();
  const updateRiskResources = useUpdateRiskResourceAssignments();
  const { data: riskHistory, isLoading: historyLoading } = useRiskHistory(editingRisk?.id || 0);
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
    setShowHistory(false);
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
    setShowHistory(false);
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
        },
        onError: (error: any) => {
          if (error?.limitExceeded) {
            toast({ 
              title: "Credit Limit Reached", 
              description: error.message || "Please upgrade your plan to create more risks.",
              variant: "destructive"
            });
            setIsDialogOpen(false);
          } else {
            toast({ title: "Error", description: error?.message || "Failed to create risk", variant: "destructive" });
          }
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
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input {...form.register("title")} data-testid="input-risk-title" />
                {form.formState.errors.title && (
                  <p className="text-xs text-destructive">{form.formState.errors.title.message as string || "Title is required"}</p>
                )}
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
                <div className="flex items-center justify-between">
                  <Label>Mitigation Plan</Label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const title = form.getValues("title");
                      if (!title) {
                        toast({ title: "Title Required", description: "Please enter a risk title first to get AI suggestions", variant: "destructive" });
                        return;
                      }
                      aiMitigationSuggestion.mutate({
                        title,
                        description: form.getValues("description"),
                        probability: form.getValues("probability"),
                        impact: form.getValues("impact"),
                        projectContext: projectName
                      }, {
                        onSuccess: (data) => {
                          form.setValue("mitigationPlan", data.suggestion);
                          toast({ title: "AI Suggestion Generated", description: "Mitigation plan has been populated" });
                        },
                        onError: (err: any) => {
                          toast({ title: "Error", description: err.message || "Failed to generate suggestions", variant: "destructive" });
                        }
                      });
                    }}
                    disabled={aiMitigationSuggestion.isPending}
                    data-testid="button-ai-suggest-mitigation"
                  >
                    {aiMitigationSuggestion.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" />
                        AI Suggest
                      </>
                    )}
                  </Button>
                </div>
                <Textarea {...form.register("mitigationPlan")} placeholder="How will this risk be mitigated?" data-testid="input-risk-mitigation" />
              </div>
              <ResourceAssignment
                organizationId={currentOrganization?.id || null}
                selectedResourceIds={selectedResourceIds}
                onSelectionChange={setSelectedResourceIds}
                label="Assigned Resources"
                projectId={projectId}
                projectName={projectName}
              />
              
              {/* Change History Section */}
              {editingRisk && (
                <div className="border-t pt-4">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full justify-between px-0 hover:bg-transparent"
                    onClick={() => setShowHistory(!showHistory)}
                    data-testid="button-toggle-risk-history"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <History className="h-4 w-4" />
                      Change History
                    </span>
                    {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  {showHistory && (
                    <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
                      {historyLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : riskHistory && riskHistory.length > 0 ? (
                        riskHistory.map((log) => (
                          <div key={log.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span className="font-medium text-foreground">{log.changedByName || 'System'}</span>
                              <span>•</span>
                              <span>{new Date(log.changedAt!).toLocaleDateString()} {new Date(log.changedAt!).toLocaleTimeString()}</span>
                            </div>
                            <div className="mt-1">{log.changeSummary}</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No change history available</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="flex justify-between gap-2">
                <div>
                  {editingRisk && (
                    <Button 
                      type="button" 
                      variant="secondary"
                      onClick={() => {
                        if (editingRisk) {
                          convertRiskToIssue.mutate({ id: editingRisk.id, projectId }, {
                            onSuccess: () => {
                              toast({ title: "Success", description: "Risk converted to issue" });
                              setIsDialogOpen(false);
                              setEditingRisk(null);
                            },
                            onError: (err: any) => {
                              toast({ title: "Error", description: err.message, variant: "destructive" });
                            }
                          });
                        }
                      }}
                      disabled={convertRiskToIssue.isPending}
                      data-testid="button-convert-risk-to-issue"
                    >
                      {convertRiskToIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Convert to Issue
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
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
                </div>
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
                    onClick={() => {
                      convertRiskToIssue.mutate({ id: risk.id, projectId }, {
                        onSuccess: () => {
                          toast({ title: "Success", description: "Risk converted to issue" });
                        },
                        onError: () => {
                          toast({ title: "Error", description: "Failed to convert risk to issue", variant: "destructive" });
                        }
                      });
                    }}
                    disabled={convertRiskToIssue.isPending}
                    data-testid={`button-convert-risk-${risk.id}`}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Convert to Issue
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

// Compute WBS (Work Breakdown Structure) values based on task hierarchy
// Returns a Map of task.id -> computed WBS string
function computeWbsValues(tasks: Task[]): Map<number, string> {
  const wbsMap = new Map<number, string>();
  if (!tasks || tasks.length === 0) return wbsMap;
  
  // Track counters for each level
  const levelCounters: number[] = [0, 0, 0, 0, 0, 0]; // 6 levels max
  let lastLevel = 0;
  
  for (const task of tasks) {
    const level = (task.outlineLevel || 1) - 1; // Convert to 0-indexed
    
    // If we're going to a higher level (lower number), reset all lower level counters
    if (level <= lastLevel) {
      for (let i = level + 1; i < levelCounters.length; i++) {
        levelCounters[i] = 0;
      }
    }
    
    // Increment counter for current level
    levelCounters[level]++;
    
    // Ensure all parent levels have at least 1 if this is a child task
    // This prevents WBS like "0.1" when a child appears without a parent
    for (let i = 0; i < level; i++) {
      if (levelCounters[i] === 0) {
        levelCounters[i] = 1;
      }
    }
    
    // Build WBS string from level counters
    const wbsParts: number[] = [];
    for (let i = 0; i <= level; i++) {
      wbsParts.push(levelCounters[i]);
    }
    
    wbsMap.set(task.id, wbsParts.join('.'));
    lastLevel = level;
  }
  
  return wbsMap;
}

function TasksTab({ projectId, projectName, projectStartDate, projectEndDate, projectSource, plannerPlanId, sourceFileName, sourceFileUrl, dataverseOrgId, dataverseTenantId }: { 
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
      return apiRequest(`/api/projects/${projectId}/make-editable`, { method: 'POST' });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Project is now editable. You can add, edit, and delete tasks." });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setIsMakeEditableDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to convert project", variant: "destructive" });
    }
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
          toast({ title: "Sync failed", description: data.message || "Unknown error", variant: "destructive" });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
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
            queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPlannerEditDialog, setShowPlannerEditDialog] = useState(false);
  const [durationInput, setDurationInput] = useState<string>("7");
  const [isMilestone, setIsMilestone] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { data: taskAssignments } = useTaskResourceAssignments(editingTask?.id ?? null);
  const lastInitializedTaskId = useRef<number | null>(null);
  const inviteAssignedRef = useRef(false);
  
  // Get sidebar state to calculate fullscreen positioning
  // Sidebar is w-72 (288px) when expanded, w-20 (80px) when collapsed
  const { isCollapsed } = useSidebarState();
  const sidebarWidth = isCollapsed ? 80 : 288;
  
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (!searchQuery.trim()) return tasks;
    const query = searchQuery.toLowerCase();
    return tasks.filter(task => 
      task.name.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query) ||
      task.assignee?.toLowerCase().includes(query) ||
      task.status?.toLowerCase().includes(query)
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
      endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      durationDays: 7,
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

  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  
  // Compute numeric duration from input (supports empty string during typing)
  const durationDays = durationInput === "" ? null : parseInt(durationInput, 10);
  
  // Sync endDate when startDate or durationDays changes
  useEffect(() => {
    if (startDate && durationDays !== null && !isNaN(durationDays) && durationDays >= 0) {
      const start = parseISO(startDate);
      // Duration 0 = milestone (end date = start date)
      // Duration 1+ = regular task (end date = start + duration - 1)
      const end = durationDays === 0 ? start : addDays(start, durationDays - 1);
      form.setValue("endDate", format(end, 'yyyy-MM-dd'));
      form.setValue("durationDays", durationDays);
    }
  }, [startDate, durationDays, form]);
  
  // Handle duration input change - allow empty during typing
  const handleDurationInputChange = (value: string) => {
    setDurationInput(value);
  };
  
  // Handle duration blur - persist valid numeric value
  const handleDurationBlur = () => {
    const num = parseInt(durationInput, 10);
    if (durationInput === "" || isNaN(num) || num < 0) {
      // Reset to 1 if invalid
      setDurationInput("1");
    } else if (num > 365) {
      setDurationInput("365");
    }
  };
  
  // Handle end date change - recalculate duration
  const handleEndDateChange = (newEndDate: string) => {
    form.setValue("endDate", newEndDate);
    if (startDate && newEndDate) {
      const start = parseISO(startDate);
      const end = parseISO(newEndDate);
      const diff = differenceInDays(end, start);
      if (diff >= 0) {
        // Duration = diff + 1 (same day = 1 day duration, not 0)
        const newDuration = diff + 1;
        setDurationInput(String(newDuration));
        form.setValue("durationDays", newDuration);
      }
    }
  };

  const openEditDialog = (task: Task) => {
    // For Planner projects, show a message dialog instead of allowing edits
    if (isPlannerProject) {
      setEditingTask(task);
      setShowPlannerEditDialog(true);
      return;
    }
    
    // For MS Project imported projects, show a message dialog instead of allowing edits
    if (isMsProjectImported) {
      setEditingTask(task);
      setShowMsProjectEditDialog(true);
      return;
    }
    
    setEditingTask(task);
    const taskDuration = task.durationDays ?? (task.startDate && task.endDate 
      ? differenceInDays(parseISO(task.endDate), parseISO(task.startDate)) + 1 
      : 7);
    setDurationInput(String(taskDuration));
    setIsMilestone(task.isMilestone || false);
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
      baselineStartDate: task.baselineStartDate || null,
      baselineEndDate: task.baselineEndDate || null,
      timesheetBlocked: task.timesheetBlocked || false,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTask(null);
    setDurationInput("7");
    setIsMilestone(false);
    setSelectedResourceIds([]);
    lastInitializedTaskId.current = null; // Reset to allow re-initialization
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
      startDate: data.startDate,
      endDate: data.endDate,
      durationDays: durationDays ?? 1,
      progress: data.progress || 0,
      status: data.status || "Not Started",
      assignee: data.assignee || null,
      isMilestone: isMilestone,
      baselineStartDate: data.baselineStartDate || null,
      baselineEndDate: data.baselineEndDate || null,
      timesheetBlocked: data.timesheetBlocked || false,
    };

    if (editingTask) {
      updateTask.mutate({ id: editingTask.id, ...taskData }, {
        onSuccess: () => {
          // Only update resources if invite didn't already handle it
          if (!inviteAssignedRef.current) {
            updateTaskResources.mutate({ taskId: editingTask.id, resourceIds: selectedResourceIds });
          }
          inviteAssignedRef.current = false;
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
    <div 
      className={cn(
        "space-y-4",
        isFullscreen && "fixed top-0 right-0 bottom-0 z-40 bg-background p-4 overflow-auto"
      )}
      style={isFullscreen ? { left: sidebarWidth } : undefined}
    >
      {/* Planner project banner */}
      {isPlannerProject && (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
          <div className="flex items-center gap-3">
            <img src={plannerLogoPath} alt="Microsoft Planner" className="h-6 w-6" />
            <div>
              <span className="font-medium">Synced from {isPremiumPlan ? "Planner Premium" : "Microsoft Planner"}</span>
              <p className="text-sm text-muted-foreground">Tasks are read-only. Edit in {isPremiumPlan ? "Project for the Web" : "Planner"} or make editable to enable editing here.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              onClick={() => setIsMakeEditableDialogOpen(true)}
              data-testid="button-make-editable-planner"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Make Editable
            </Button>
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
          </div>
        </div>
      )}
      {/* MS Project imported project banner */}
      {isMsProjectImported && (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-3">
            <img src={msprojectLogoPath} alt="Microsoft Project" className="h-6 w-6" />
            <div>
              <span className="font-medium text-emerald-800 dark:text-emerald-200">Imported from Microsoft Project</span>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Tasks are read-only. Re-import to update or make editable to enable editing.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMakeEditableDialogOpen(true)}
              data-testid="button-make-editable"
            >
              <Pencil className="h-4 w-4 mr-2" />
              Make Editable
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReimportDialogOpen(true)}
              data-testid="button-reimport-msproject"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-Import
            </Button>
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

      {/* Make Editable Confirmation Dialog */}
      <AlertDialog open={isMakeEditableDialogOpen} onOpenChange={setIsMakeEditableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Make Schedule Editable
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Converting this project to editable mode will allow you to add, edit, and delete tasks directly in the app.
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-amber-800 dark:text-amber-200 text-sm">
                <strong>Important:</strong> After conversion, re-importing or syncing from the original source will no longer be available. The source file reference will be kept for historical purposes.
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
                  Converting...
                </>
              ) : (
                <>
                  <Pencil className="mr-2 h-4 w-4" />
                  Make Editable
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
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          {!isPlannerProject && !isMsProjectImported && <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingTask(null); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} data-testid="button-add-task">
                <Plus className="mr-2 h-4 w-4" /> Add Task
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingTask ? "Edit Task" : "Add New Task"}</DialogTitle>
              <DialogDescription>
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
              <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
                  <TabsTrigger value="schedule" className="text-xs">Schedule</TabsTrigger>
                  <TabsTrigger value="resources" className="text-xs">Resources</TabsTrigger>
                  <TabsTrigger value="dependencies" className="text-xs" disabled={!editingTask}>Dependencies</TabsTrigger>
                </TabsList>
                
                <div className="flex-1 overflow-y-auto py-4 min-h-[280px]">
                  {/* Details Tab */}
                  <TabsContent value="details" className="mt-0 space-y-4">
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
                          <div className="h-9 flex items-center">
                            <Slider
                              value={[field.value || 0]}
                              onValueChange={(v) => field.onChange(v[0])}
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
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Start Date</Label>
                        <Input type="date" {...form.register("startDate")} data-testid="input-task-start" />
                      </div>
                      <div className="space-y-2">
                        <Label>Duration (days)</Label>
                        <Input 
                          type="number" 
                          min="0" 
                          max="365" 
                          value={durationInput}
                          onChange={(e) => handleDurationInputChange(e.target.value)}
                          onBlur={handleDurationBlur}
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
                      
                      {(form.watch("baselineStartDate") || form.watch("baselineEndDate")) && (
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
                      )}
                    </div>
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
                      <TaskDependenciesSection 
                        taskId={editingTask.id} 
                        projectId={projectId}
                        allTasks={tasks || []}
                      />
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
                      Delete
                    </Button>
                  )}
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
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
            onClick={() => setIsFullscreen(!isFullscreen)}
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
          isReadOnly={isPlannerProject || isMsProjectImported}
          onCreateTask={(name) => {
            createTask.mutate({
              projectId,
              name,
              startDate: format(new Date(), 'yyyy-MM-dd'),
              endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
              status: "Not Started",
              progress: 0,
            });
          }}
        />
      ) : view === "gantt" ? (
        <ProjectGanttView 
          tasks={filteredTasks} 
          onTaskClick={openEditDialog}
          projectId={projectId}
          organizationId={currentOrganization?.id || null}
          projectName={projectName}
          isFullscreen={isFullscreen}
          projectStartDate={projectStartDate}
          projectEndDate={projectEndDate}
          isReadOnly={isPlannerProject || isMsProjectImported}
          onCreateTask={(name) => {
            createTask.mutate({
              projectId,
              name,
              startDate: format(new Date(), 'yyyy-MM-dd'),
              endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
              status: "Not Started",
              progress: 0,
            });
          }}
        />
      ) : (
        <ProjectKanbanView 
          tasks={filteredTasks} 
          onTaskClick={openEditDialog}
          isFullscreen={isFullscreen}
          organizationId={currentOrganization?.id ?? null}
          projectId={projectId}
          resources={resources}
          isReadOnly={isPlannerProject || isMsProjectImported}
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

type GanttColumn = 
  | 'taskIndex' | 'task' | 'taskNumber' | 'wbs' | 'outlineLevel' | 'description'
  | 'startDate' | 'endDate' | 'baselineStartDate' | 'baselineEndDate' | 'actualStartDate' | 'actualEndDate'
  | 'durationDays' | 'progress' | 'status' | 'priority' | 'taskType'
  | 'estimatedHours' | 'actualHours' | 'remainingHours'
  | 'cost' | 'actualCost'
  | 'resources' | 'assignee' 
  | 'constraintType' | 'constraintDate'
  | 'isMilestone' | 'isCritical' | 'isSummary'
  | 'phase' | 'category' | 'labels' | 'notes';

type GanttColumnConfig = { 
  id: GanttColumn; 
  label: string; 
  width: string; 
  widthPx: number;
  category: 'basic' | 'schedule' | 'baseline' | 'effort' | 'cost' | 'assignment' | 'constraints' | 'flags' | 'metadata';
};

const GANTT_COLUMNS: GanttColumnConfig[] = [
  // Basic
  { id: 'taskIndex', label: '#', width: 'w-12', widthPx: 48, category: 'basic' },
  { id: 'wbs', label: 'WBS', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'outlineLevel', label: 'Outline Level', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'task', label: 'Task Name', width: 'w-48', widthPx: 192, category: 'basic' },
  { id: 'taskNumber', label: 'Task #', width: 'w-24', widthPx: 96, category: 'basic' },
  { id: 'description', label: 'Description', width: 'w-48', widthPx: 192, category: 'basic' },
  // Schedule
  { id: 'startDate', label: 'Start Date', width: 'w-24', widthPx: 96, category: 'schedule' },
  { id: 'endDate', label: 'End Date', width: 'w-24', widthPx: 96, category: 'schedule' },
  { id: 'durationDays', label: 'Duration', width: 'w-20', widthPx: 80, category: 'schedule' },
  { id: 'actualStartDate', label: 'Actual Start', width: 'w-24', widthPx: 96, category: 'schedule' },
  { id: 'actualEndDate', label: 'Actual End', width: 'w-24', widthPx: 96, category: 'schedule' },
  // Baseline
  { id: 'baselineStartDate', label: 'Baseline Start', width: 'w-28', widthPx: 112, category: 'baseline' },
  { id: 'baselineEndDate', label: 'Baseline End', width: 'w-28', widthPx: 112, category: 'baseline' },
  // Progress & Status
  { id: 'progress', label: 'Progress %', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'status', label: 'Status', width: 'w-28', widthPx: 112, category: 'basic' },
  { id: 'priority', label: 'Priority', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'taskType', label: 'Type', width: 'w-24', widthPx: 96, category: 'basic' },
  // Effort
  { id: 'estimatedHours', label: 'Est. Hours', width: 'w-24', widthPx: 96, category: 'effort' },
  { id: 'actualHours', label: 'Actual Hrs', width: 'w-24', widthPx: 96, category: 'effort' },
  { id: 'remainingHours', label: 'Remain Hrs', width: 'w-24', widthPx: 96, category: 'effort' },
  // Cost
  { id: 'cost', label: 'Budget', width: 'w-24', widthPx: 96, category: 'cost' },
  { id: 'actualCost', label: 'Actual Cost', width: 'w-24', widthPx: 96, category: 'cost' },
  // Assignment
  { id: 'resources', label: 'Resources', width: 'w-32', widthPx: 128, category: 'assignment' },
  { id: 'assignee', label: 'Assignee', width: 'w-28', widthPx: 112, category: 'assignment' },
  // Constraints
  { id: 'constraintType', label: 'Constraint', width: 'w-32', widthPx: 128, category: 'constraints' },
  { id: 'constraintDate', label: 'Constraint Date', width: 'w-28', widthPx: 112, category: 'constraints' },
  // Flags
  { id: 'isMilestone', label: 'Milestone', width: 'w-20', widthPx: 80, category: 'flags' },
  { id: 'isCritical', label: 'Critical', width: 'w-18', widthPx: 72, category: 'flags' },
  { id: 'isSummary', label: 'Summary', width: 'w-20', widthPx: 80, category: 'flags' },
  // Metadata
  { id: 'phase', label: 'Phase', width: 'w-24', widthPx: 96, category: 'metadata' },
  { id: 'category', label: 'Category', width: 'w-24', widthPx: 96, category: 'metadata' },
  { id: 'labels', label: 'Labels', width: 'w-32', widthPx: 128, category: 'metadata' },
  { id: 'notes', label: 'Notes', width: 'w-48', widthPx: 192, category: 'metadata' },
];

const COLUMN_CATEGORIES: { id: GanttColumnConfig['category']; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'baseline', label: 'Baseline' },
  { id: 'effort', label: 'Effort' },
  { id: 'cost', label: 'Cost' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'flags', label: 'Flags' },
  { id: 'metadata', label: 'Metadata' },
];

const DEFAULT_GANTT_COLUMNS: GanttColumn[] = ['taskIndex', 'wbs', 'task', 'startDate', 'endDate', 'progress', 'resources'];

// NOTE: Legacy ProjectGanttTaskRow removed - use ProjectGanttTaskRowMeta + ProjectGanttTaskRowTimeline instead

// Inline Editable Cell Component for Gantt
type InlineEditType = 'date' | 'select' | 'number' | 'text' | 'progress' | 'boolean';

interface InlineEditCellProps {
  value: string | number | boolean | null | undefined;
  displayValue: React.ReactNode;
  editType: InlineEditType;
  options?: { value: string; label: string }[];
  onSave: (newValue: string | number | boolean | null) => void;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  suffix?: string;
}

function InlineEditCell({ 
  value, 
  displayValue, 
  editType, 
  options, 
  onSave, 
  className,
  disabled = false,
  min,
  max,
  suffix = ''
}: InlineEditCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>('');
  const [selectOpen, setSelectOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing && editType === 'select') {
      setSelectOpen(true);
    }
  }, [isEditing, editType]);

  const handleStartEdit = () => {
    if (disabled) return;
    if (editType === 'date') {
      setEditValue(value ? String(value) : '');
    } else if (editType === 'number' || editType === 'progress') {
      setEditValue(value != null ? String(value) : '');
    } else if (editType === 'boolean') {
      const newVal = !value;
      onSave(newVal);
      return;
    } else {
      setEditValue(value ? String(value) : '');
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    if (editType === 'date') {
      onSave(editValue || null);
    } else if (editType === 'number' || editType === 'progress') {
      const numVal = editValue === '' ? null : parseFloat(editValue);
      if (numVal !== null && !isNaN(numVal)) {
        const clampedVal = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, numVal));
        onSave(clampedVal);
      } else {
        onSave(null);
      }
    } else {
      onSave(editValue || null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleSelectChange = (newVal: string) => {
    setSelectOpen(false);
    setIsEditing(false);
    onSave(newVal);
  };

  const handleSelectOpenChange = (open: boolean) => {
    setSelectOpen(open);
    if (!open) {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    if (editType === 'select' && options) {
      return (
        <Select value={String(value || '')} onValueChange={handleSelectChange} open={selectOpen} onOpenChange={handleSelectOpenChange}>
          <SelectTrigger className="text-[10px] px-1 min-h-0 py-0.5" data-testid="inline-edit-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (editType === 'date') {
      const selectedDate = editValue ? parseISO(editValue) : undefined;
      return (
        <Popover open={true} onOpenChange={(open) => { if (!open) { setIsEditing(false); } }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] px-1 w-full min-h-0 h-6 justify-start font-normal"
              data-testid="inline-edit-date"
            >
              <CalendarIcon className="mr-1 h-3 w-3" />
              {selectedDate ? format(selectedDate, 'MM/dd/yyyy') : 'Select date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" side="bottom">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  onSave(dateStr);
                }
                setIsEditing(false);
              }}
              initialFocus
            />
            <div className="border-t p-2 flex justify-between">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  onSave(null);
                  setIsEditing(false);
                }}
              >
                Clear
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    if (editType === 'number' || editType === 'progress') {
      return (
        <Input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          min={min}
          max={max}
          className="text-[10px] px-1 w-full min-h-0 py-0.5"
          data-testid="inline-edit-number"
        />
      );
    }

    return (
      <Input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="text-[10px] px-1 w-full min-h-0 py-0.5"
        data-testid="inline-edit-text"
      />
    );
  }

  return (
    <div 
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-colors rounded px-0.5 min-h-[18px] flex items-center w-full",
        disabled && "cursor-default hover:bg-transparent",
        className
      )}
      onClick={handleStartEdit}
      data-testid="inline-edit-display"
    >
      {displayValue}
    </div>
  );
}

// Task name cell with horizontal drag for indent/outdent (MS Project style)
function TaskNameCell({
  task,
  colWidth,
  currentLevel,
  hasChildren,
  isCollapsed,
  canIndent,
  canOutdent,
  onToggleCollapse,
  onIndent,
  onOutdent,
  onSetBaseline,
  onClearBaseline,
  onEditDependencies,
  onUpdateName,
  onEdit,
  isReadOnly,
}: {
  task: Task;
  colWidth: number;
  currentLevel: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  onToggleCollapse: (taskId: number) => void;
  onIndent: (task: Task) => void;
  onOutdent: (task: Task) => void;
  onSetBaseline: (task: Task) => void;
  onClearBaseline: (task: Task) => void;
  onEditDependencies: (task: Task) => void;
  onUpdateName: (taskId: number, name: string) => void;
  onEdit: (task: Task) => void;
  isReadOnly?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    if (isReadOnly) return;
    e.stopPropagation();
    setEditValue(task.name);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editValue.trim() && editValue !== task.name) {
      onUpdateName(task.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(task.name);
      setIsEditing(false);
    }
  };

  return (
    <div 
      style={{ width: `${colWidth}px`, paddingLeft: `${4 + (currentLevel - 1) * 12}px` }}
      className={cn(
        "flex-shrink-0 border-r px-1 flex items-center overflow-hidden min-w-0 group/taskname relative",
        hasChildren && "font-semibold bg-muted/30"
      )}
    >
      {/* Left arrow button (outdent) */}
      {canOutdent && (
        <button 
          className="absolute left-0 top-0 bottom-0 flex items-center justify-center w-5 opacity-0 group-hover/taskname:opacity-100 transition-opacity cursor-pointer z-10 hover:bg-primary/20"
          onClick={(e) => { e.stopPropagation(); onOutdent(task); }}
          data-testid={`task-outdent-btn-${task.id}`}
        >
          <ChevronLeft className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      
      {/* Right arrow button (indent) */}
      {canIndent && (
        <button 
          className="absolute right-6 top-0 bottom-0 flex items-center justify-center w-5 opacity-0 group-hover/taskname:opacity-100 transition-opacity cursor-pointer z-10 hover:bg-primary/20"
          onClick={(e) => { e.stopPropagation(); onIndent(task); }}
          data-testid={`task-indent-btn-${task.id}`}
        >
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
      )}

      <div className="truncate flex items-center gap-0.5 flex-1 min-w-0">
        {hasChildren ? (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-4 w-4 p-0 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(task.id); }}
            data-testid={`task-toggle-${task.id}`}
          >
            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        {task.isMilestone && <MilestoneIcon className="h-3 w-3 text-primary flex-shrink-0" />}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-background border border-primary rounded px-1 text-[11px] h-5 outline-none"
            data-testid={`task-name-input-${task.id}`}
          />
        ) : (
          <span 
            className="truncate cursor-text hover:bg-muted/50 px-0.5 rounded"
            onClick={handleStartEdit}
            data-testid={`task-name-${task.id}`}
          >
            {task.name}
          </span>
        )}
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-5 w-5 p-0 flex-shrink-0 opacity-0 group-hover/taskname:opacity-100 transition-opacity" 
            onClick={(e) => e.stopPropagation()}
            data-testid={`task-actions-${task.id}`}
          >
            <MoreVertical className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(task); }} data-testid={`task-edit-${task.id}`}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditDependencies(task); }} data-testid={`task-dependencies-${task.id}`}>
            <Link2 className="h-3.5 w-3.5 mr-2" />
            Dependencies
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetBaseline(task); }} disabled={!task.startDate || !task.endDate} data-testid={`task-set-baseline-${task.id}`}>
            <Flag className="h-3.5 w-3.5 mr-2" />
            Set Baseline
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClearBaseline(task); }} disabled={!task.baselineStartDate && !task.baselineEndDate} data-testid={`task-clear-baseline-${task.id}`}>
            <X className="h-3.5 w-3.5 mr-2" />
            Clear Baseline
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onIndent(task); }} disabled={!canIndent} data-testid={`task-indent-${task.id}`}>
            <ChevronRight className="h-3.5 w-3.5 mr-2" />
            Indent
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOutdent(task); }} disabled={!canOutdent} data-testid={`task-outdent-${task.id}`}>
            <ChevronLeft className="h-3.5 w-3.5 mr-2" />
            Outdent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Sortable task row wrapper for drag and drop reordering
function SortableTaskRow({ 
  task, 
  children,
  disabled = false,
}: { 
  task: Task; 
  children: (dragHandleProps: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) => React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style as React.CSSProperties}>
      {children({ listeners: listeners || {}, attributes: attributes || {} })}
    </div>
  );
}

// Split-pane Gantt: Metadata row (left pane)
function ProjectGanttTaskRowMeta({ 
  task, 
  rowIndex,
  visibleColumns,
  organizationId,
  onIndent,
  onOutdent,
  hasChildren,
  isCollapsed,
  dragHandleProps,
  onToggleCollapse,
  projectName,
  onSetBaseline,
  onClearBaseline,
  onEditDependencies,
  onEdit,
  columnWidths,
  showBaseline,
  baselineSelectionMode,
  isSelectedForBaseline,
  onToggleBaselineSelection,
  showCriticalPath,
  isOnCriticalPath,
  onTrackChange,
  prevTaskLevel,
  isSelected,
  onToggleSelection,
  hasDependencies,
  computedWbs,
  isReadOnly,
}: { 
  task: Task;
  rowIndex: number;
  visibleColumns: GanttColumn[];
  organizationId: number | null;
  onIndent: (task: Task) => void;
  onOutdent: (task: Task) => void;
  hasChildren: boolean;
  isCollapsed: boolean;
  dragHandleProps?: { listeners: Record<string, unknown>; attributes: Record<string, unknown> };
  onToggleCollapse: (taskId: number) => void;
  projectName?: string;
  onSetBaseline: (task: Task) => void;
  onClearBaseline: (task: Task) => void;
  onEditDependencies: (task: Task) => void;
  onEdit: (task: Task) => void;
  columnWidths?: Record<GanttColumn, number>;
  showBaseline: boolean;
  baselineSelectionMode: boolean;
  isSelectedForBaseline: boolean;
  onToggleBaselineSelection: (taskId: number, hasChildren: boolean) => void;
  showCriticalPath: boolean;
  isOnCriticalPath: boolean;
  onTrackChange?: (taskId: number, projectId: number, field: string, oldValue: unknown, newValue: unknown) => void;
  prevTaskLevel?: number;
  isSelected: boolean;
  onToggleSelection: (taskId: number) => void;
  hasDependencies?: boolean;
  computedWbs?: string;
  isReadOnly?: boolean;
}) {
  const { data: taskAssignments, isLoading: assignmentsLoading } = useTaskResourceAssignments(task.id);
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const updateTask = useUpdateTask();
  const { toast } = useToast();
  const [isEditingResources, setIsEditingResources] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const inviteAssignedRef = useRef(false);
  
  const handleInlineUpdate = (field: string, value: string | number | boolean | null, oldValue?: unknown) => {
    // Prevent updates for read-only projects (Planner and MS Project imports)
    if (isReadOnly) return;
    
    // Track the change for undo/redo if callback provided (track even if oldValue is undefined/null)
    if (onTrackChange) {
      onTrackChange(task.id, task.projectId, field, oldValue ?? null, value);
    }
    
    updateTask.mutate({
      id: task.id,
      projectId: task.projectId,
      [field]: value,
    }, {
      onError: (error) => {
        toast({ 
          title: "Update failed", 
          description: error instanceof Error ? error.message : "Failed to update task", 
          variant: "destructive" 
        });
      }
    });
  };

  useEffect(() => {
    if (taskAssignments && !hasInitialized) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
      setHasInitialized(true);
    }
  }, [taskAssignments, hasInitialized]);

  useEffect(() => {
    if (!isEditingResources) {
      setHasInitialized(false);
    }
  }, [isEditingResources]);

  useEffect(() => {
    if (isEditingResources && taskAssignments) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
    }
  }, [isEditingResources, taskAssignments]);

  const assignedNames = taskAssignments && taskAssignments.length > 0
    ? taskAssignments.map(a => a.resource.displayName).join(", ")
    : "—";

  const handleSaveResources = () => {
    if (!inviteAssignedRef.current) {
      updateTaskResources.mutate({ taskId: task.id, resourceIds: selectedResourceIds });
    }
    inviteAssignedRef.current = false;
    setIsEditingResources(false);
  };

  const progressPercent = task.progress || 0;
  const currentLevel = task.outlineLevel || 1;
  // canIndent: Check max level (6) AND hierarchy rule (can only indent one level deeper than previous task)
  // First task (no previous) cannot be indented past level 1
  const maxAllowedLevel = prevTaskLevel !== undefined ? Math.min(6, prevTaskLevel + 1) : 1;
  const canIndent = currentLevel < maxAllowedLevel;
  const canOutdent = currentLevel > 1;

  // Match timeline row height when baseline is shown
  const hasBaseline = task.baselineStartDate && task.baselineEndDate;
  const rowHeight = showBaseline && hasBaseline ? 'h-[36px]' : 'h-[28px]';

  const hasValidDates = task.startDate && task.endDate;
  
  // Critical path styling: highlight critical tasks in red, grey out non-critical tasks
  const isNonCritical = showCriticalPath && !isOnCriticalPath;
  const isCritical = showCriticalPath && isOnCriticalPath;

  return (
    <div 
      className={cn(
        "flex border-b hover:bg-muted/30 transition-colors group", 
        rowHeight,
        isSelectedForBaseline && baselineSelectionMode && "bg-primary/5",
        isNonCritical && "opacity-40",
        isCritical && "bg-red-50 dark:bg-red-950/30 border-l-2 border-l-red-500",
        hasDependencies && !isCritical && "bg-amber-50/50 dark:bg-amber-950/20"
      )}
      data-testid={`gantt-task-meta-${task.id}`}
    >
      {/* Bulk selection checkbox column */}
      <div className="w-8 flex-shrink-0 border-r flex items-center justify-center">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(task.id)}
          data-testid={`bulk-select-${task.id}`}
        />
      </div>
      {/* Baseline selection checkbox column */}
      {baselineSelectionMode && (
        <div className="w-8 flex-shrink-0 border-r flex items-center justify-center">
          <Checkbox
            checked={isSelectedForBaseline}
            onCheckedChange={() => onToggleBaselineSelection(task.id, hasChildren)}
            disabled={!hasValidDates}
            data-testid={`baseline-select-${task.id}`}
          />
        </div>
      )}
      {/* Drag handle column */}
      <div className="w-8 flex-shrink-0 border-r flex items-center justify-center">
        <button
          className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground touch-none"
          data-testid={`task-drag-handle-${task.id}`}
          {...(dragHandleProps?.listeners || {})}
          {...(dragHandleProps?.attributes || {})}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </div>
      
      {/* Dynamic column rendering */}
      {visibleColumns.map(colId => {
        const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
        if (!colConfig) return null;
        
        const colWidth = columnWidths?.[colId] || colConfig.widthPx;
        
        if (colId === 'task') {
          return (
            <TaskNameCell
              key={colId}
              task={task}
              colWidth={colWidth}
              currentLevel={currentLevel}
              hasChildren={hasChildren}
              isCollapsed={isCollapsed}
              canIndent={canIndent}
              canOutdent={canOutdent}
              onToggleCollapse={onToggleCollapse}
              onIndent={onIndent}
              onOutdent={onOutdent}
              onSetBaseline={onSetBaseline}
              onClearBaseline={onClearBaseline}
              onEditDependencies={onEditDependencies}
              onUpdateName={(taskId, name) => handleInlineUpdate('name', name, task.name)}
              onEdit={onEdit}
              isReadOnly={isReadOnly}
            />
          );
        }
        
        if (colId === 'resources') {
          return (
            <div key={colId}>
              <div 
                style={{ width: `${colWidth}px` }}
                className={cn(
                  "flex-shrink-0 border-r px-1 text-muted-foreground flex items-center h-[28px] overflow-hidden min-w-0",
                  !hasChildren && !isReadOnly && "cursor-pointer hover:bg-muted/50"
                )}
                onClick={(e) => { e.stopPropagation(); if (!hasChildren && !isReadOnly) setIsEditingResources(true); }}
              >
                {hasChildren ? (
                  <span className="text-muted-foreground/70 italic truncate w-full">Summary</span>
                ) : (
                  <span className="truncate w-full">{assignedNames}</span>
                )}
              </div>
              <Dialog open={isEditingResources} onOpenChange={setIsEditingResources}>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Assign Resources</DialogTitle>
                    <DialogDescription>Assign team members to task "{task.name}"</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <ResourceAssignment
                      organizationId={organizationId}
                      selectedResourceIds={selectedResourceIds}
                      onSelectionChange={setSelectedResourceIds}
                      label="Assigned Resources"
                      projectId={task.projectId}
                      projectName={projectName}
                      taskId={task.id}
                      taskName={task.name}
                      onInviteAssigned={() => { inviteAssignedRef.current = true; }}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditingResources(false)}>Cancel</Button>
                    <Button onClick={handleSaveResources} disabled={assignmentsLoading}>{assignmentsLoading ? "Loading..." : "Save"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          );
        }
        
        const centerAlign = ['progress', 'isMilestone', 'isCritical', 'isSummary', 'durationDays'].includes(colId);
        const isSummaryTask = hasChildren;
        
        const statusOptions = [
          { value: 'Not Started', label: 'Not Started' },
          { value: 'In Progress', label: 'In Progress' },
          { value: 'Completed', label: 'Completed' },
        ];
        
        const priorityOptions = [
          { value: 'Low', label: 'Low' },
          { value: 'Medium', label: 'Medium' },
          { value: 'High', label: 'High' },
          { value: 'Critical', label: 'Critical' },
        ];
        
        const taskTypeOptions = [
          { value: 'Work', label: 'Work' },
          { value: 'Milestone', label: 'Milestone' },
          { value: 'Summary', label: 'Summary' },
        ];
        
        const constraintTypeOptions = [
          { value: 'As Soon As Possible', label: 'ASAP' },
          { value: 'As Late As Possible', label: 'ALAP' },
          { value: 'Must Start On', label: 'MSO' },
          { value: 'Must Finish On', label: 'MFO' },
          { value: 'Start No Earlier Than', label: 'SNET' },
          { value: 'Start No Later Than', label: 'SNLT' },
          { value: 'Finish No Earlier Than', label: 'FNET' },
          { value: 'Finish No Later Than', label: 'FNLT' },
        ];

        const renderEditableCell = () => {
          switch (colId) {
            case 'taskIndex':
              return (
                <div className="text-center font-mono text-muted-foreground">
                  {rowIndex}
                </div>
              );
            case 'taskNumber':
              return (
                <InlineEditCell
                  value={task.taskNumber}
                  displayValue={<span className="truncate">{task.taskNumber || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('taskNumber', val as string | null, task.taskNumber)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'wbs':
              // Use computed WBS if available, otherwise fall back to stored value
              const displayWbs = computedWbs || task.wbs || '—';
              return (
                <span className="truncate font-mono text-muted-foreground">{displayWbs}</span>
              );
            case 'outlineLevel':
              return (
                <span className="truncate text-muted-foreground">{task.outlineLevel || 1}</span>
              );
            case 'description':
              return (
                <InlineEditCell
                  value={task.description}
                  displayValue={<span className="truncate">{task.description || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('description', val as string | null, task.description)}
                  disabled={isReadOnly}
                />
              );
            case 'startDate':
              return (
                <InlineEditCell
                  value={task.startDate}
                  displayValue={task.startDate ? format(parseISO(task.startDate), 'MM/dd/yyyy') : '—'}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('startDate', val as string | null, task.startDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'endDate':
              return (
                <InlineEditCell
                  value={task.endDate}
                  displayValue={task.endDate ? format(parseISO(task.endDate), 'MM/dd/yyyy') : '—'}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('endDate', val as string | null, task.endDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'baselineStartDate':
              return (
                <InlineEditCell
                  value={task.baselineStartDate}
                  displayValue={task.baselineStartDate ? format(parseISO(task.baselineStartDate), 'MM/dd/yyyy') : '—'}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('baselineStartDate', val as string | null, task.baselineStartDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'baselineEndDate':
              return (
                <InlineEditCell
                  value={task.baselineEndDate}
                  displayValue={task.baselineEndDate ? format(parseISO(task.baselineEndDate), 'MM/dd/yyyy') : '—'}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('baselineEndDate', val as string | null, task.baselineEndDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'actualStartDate':
              return (
                <InlineEditCell
                  value={task.actualStartDate}
                  displayValue={task.actualStartDate ? format(parseISO(task.actualStartDate), 'MM/dd/yyyy') : '—'}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('actualStartDate', val as string | null, task.actualStartDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'actualEndDate':
              return (
                <InlineEditCell
                  value={task.actualEndDate}
                  displayValue={task.actualEndDate ? format(parseISO(task.actualEndDate), 'MM/dd/yyyy') : '—'}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('actualEndDate', val as string | null, task.actualEndDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'durationDays':
              return (
                <InlineEditCell
                  value={task.durationDays}
                  displayValue={task.durationDays != null ? `${task.durationDays}d` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('durationDays', val as number | null, task.durationDays)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'progress':
              return (
                <InlineEditCell
                  value={progressPercent}
                  displayValue={`${progressPercent}%`}
                  editType="progress"
                  min={0}
                  max={100}
                  onSave={(val) => handleInlineUpdate('progress', val as number | null, task.progress)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'status':
              const statusBadge = task.status ? (
                <Badge variant="outline" className={cn("text-[9px] px-1 py-0", 
                  task.status === 'Completed' && "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-700",
                  task.status === 'In Progress' && "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:border-blue-700",
                  task.status === 'Not Started' && "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                )}>
                  {task.status === 'In Progress' ? 'WIP' : task.status === 'Not Started' ? 'New' : 'Done'}
                </Badge>
              ) : '—';
              return (
                <InlineEditCell
                  value={task.status}
                  displayValue={statusBadge}
                  editType="select"
                  options={statusOptions}
                  onSave={(val) => handleInlineUpdate('status', val as string | null, task.status)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'priority':
              const priorityBadge = task.priority ? (
                <Badge variant="outline" className={cn("text-[9px] px-1 py-0",
                  task.priority === 'Critical' && "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-400 dark:border-red-700",
                  task.priority === 'High' && "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-400 dark:border-orange-700",
                  task.priority === 'Medium' && "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-700",
                  task.priority === 'Low' && "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                )}>
                  {task.priority[0]}
                </Badge>
              ) : '—';
              return (
                <InlineEditCell
                  value={task.priority}
                  displayValue={priorityBadge}
                  editType="select"
                  options={priorityOptions}
                  onSave={(val) => handleInlineUpdate('priority', val as string | null, task.priority)}
                  disabled={isReadOnly}
                />
              );
            case 'taskType':
              return (
                <InlineEditCell
                  value={task.taskType}
                  displayValue={<span className="truncate">{task.taskType || '—'}</span>}
                  editType="select"
                  options={taskTypeOptions}
                  onSave={(val) => handleInlineUpdate('taskType', val as string | null, task.taskType)}
                  disabled={isReadOnly}
                />
              );
            case 'estimatedHours':
              return (
                <InlineEditCell
                  value={task.estimatedHours}
                  displayValue={task.estimatedHours != null ? `${task.estimatedHours}h` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('estimatedHours', val as number | null, task.estimatedHours)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'actualHours':
              return (
                <InlineEditCell
                  value={task.actualHours}
                  displayValue={task.actualHours != null ? `${task.actualHours}h` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('actualHours', val as number | null, task.actualHours)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'remainingHours':
              return (
                <InlineEditCell
                  value={task.remainingHours}
                  displayValue={task.remainingHours != null ? `${task.remainingHours}h` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('remainingHours', val as number | null, task.remainingHours)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'cost':
              return (
                <InlineEditCell
                  value={task.cost != null ? Number(task.cost) : null}
                  displayValue={task.cost != null ? `$${Number(task.cost).toLocaleString()}` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('cost', val != null ? String(val) : null, task.cost)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'actualCost':
              return (
                <InlineEditCell
                  value={task.actualCost != null ? Number(task.actualCost) : null}
                  displayValue={task.actualCost != null ? `$${Number(task.actualCost).toLocaleString()}` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('actualCost', val != null ? String(val) : null, task.actualCost)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'assignee':
              return (
                <InlineEditCell
                  value={task.assignee}
                  displayValue={<span className="truncate">{task.assignee || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('assignee', val as string | null, task.assignee)}
                  disabled={isReadOnly}
                />
              );
            case 'constraintType':
              return (
                <InlineEditCell
                  value={task.constraintType}
                  displayValue={<span className="truncate">{task.constraintType || '—'}</span>}
                  editType="select"
                  options={constraintTypeOptions}
                  onSave={(val) => handleInlineUpdate('constraintType', val as string | null, task.constraintType)}
                  disabled={isReadOnly}
                />
              );
            case 'constraintDate':
              return (
                <InlineEditCell
                  value={task.constraintDate}
                  displayValue={task.constraintDate ? format(parseISO(task.constraintDate), 'MM/dd/yyyy') : '—'}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('constraintDate', val as string | null, task.constraintDate)}
                  disabled={isReadOnly}
                />
              );
            case 'isMilestone':
              return (
                <InlineEditCell
                  value={task.isMilestone}
                  displayValue={task.isMilestone ? <Check className="h-3 w-3 text-primary mx-auto" /> : <span className="text-muted-foreground/50">—</span>}
                  editType="boolean"
                  onSave={(val) => handleInlineUpdate('isMilestone', val as boolean, task.isMilestone)}
                  disabled={isReadOnly}
                />
              );
            case 'isCritical':
              return (
                <InlineEditCell
                  value={task.isCritical}
                  displayValue={task.isCritical ? <Check className="h-3 w-3 text-red-500 mx-auto" /> : <span className="text-muted-foreground/50">—</span>}
                  editType="boolean"
                  onSave={(val) => handleInlineUpdate('isCritical', val as boolean, task.isCritical)}
                  disabled={isReadOnly}
                />
              );
            case 'isSummary':
              return task.isSummary ? <Check className="h-3 w-3 text-blue-500 mx-auto" /> : <span className="text-muted-foreground/50">—</span>;
            case 'phase':
              return (
                <InlineEditCell
                  value={task.phase}
                  displayValue={<span className="truncate">{task.phase || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('phase', val as string | null, task.phase)}
                  disabled={isReadOnly}
                />
              );
            case 'category':
              return (
                <InlineEditCell
                  value={task.category}
                  displayValue={<span className="truncate">{task.category || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('category', val as string | null, task.category)}
                  disabled={isReadOnly}
                />
              );
            case 'labels':
              return (
                <InlineEditCell
                  value={task.labels}
                  displayValue={<span className="truncate">{task.labels || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('labels', val as string | null, task.labels)}
                  disabled={isReadOnly}
                />
              );
            case 'notes':
              return (
                <InlineEditCell
                  value={task.notes}
                  displayValue={<span className="truncate">{task.notes || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('notes', val as string | null, task.notes)}
                  disabled={isReadOnly}
                />
              );
            default:
              return '—';
          }
        };
        
        return (
          <div 
            key={colId}
            style={{ width: `${colWidth}px` }}
            className={cn(
              "flex-shrink-0 border-r px-1 text-muted-foreground flex items-center h-[28px] overflow-hidden min-w-0",
              centerAlign && "justify-center",
              colId === 'progress' && "font-medium"
            )}
          >
            <span className="truncate w-full">{renderEditableCell()}</span>
          </div>
        );
      })}
    </div>
  );
}

// Split-pane Gantt: Timeline row (right pane)
function ProjectGanttTaskRowTimeline({ 
  task, 
  onTaskClick, 
  minDate, 
  maxDate,
  hasChildren,
  showBaseline,
  showCriticalPath,
  isOnCriticalPath,
  hasDependencies,
}: { 
  task: Task; 
  onTaskClick: (task: Task) => void;
  minDate: Date;
  maxDate: Date;
  hasChildren: boolean;
  showBaseline: boolean;
  showCriticalPath: boolean;
  isOnCriticalPath: boolean;
  hasDependencies?: boolean;
}) {
  const hasValidDates = task.startDate && task.endDate;
  const start = hasValidDates ? parseISO(task.startDate) : null;
  const end = hasValidDates ? parseISO(task.endDate) : null;
  
  // Calculate baseline bar position
  const hasBaseline = task.baselineStartDate && task.baselineEndDate;
  const baselineStart = hasBaseline ? parseISO(task.baselineStartDate!) : null;
  const baselineEnd = hasBaseline ? parseISO(task.baselineEndDate!) : null;
  
  let leftPercent = 0;
  let widthPercent = 0;
  let baselineLeftPercent = 0;
  let baselineWidthPercent = 0;
  
  const totalDays = differenceInDays(maxDate, minDate) || 1;
  
  if (start && end) {
    const startOffset = differenceInDays(start, minDate);
    const duration = differenceInDays(end, start) + 1;
    leftPercent = (startOffset / totalDays) * 100;
    widthPercent = (duration / totalDays) * 100;
  }
  
  if (baselineStart && baselineEnd) {
    const baselineStartOffset = differenceInDays(baselineStart, minDate);
    const baselineDuration = differenceInDays(baselineEnd, baselineStart) + 1;
    baselineLeftPercent = (baselineStartOffset / totalDays) * 100;
    baselineWidthPercent = (baselineDuration / totalDays) * 100;
  }

  const progressPercent = task.progress || 0;
  
  // Determine row height - taller when showing baseline
  const rowHeight = showBaseline && hasBaseline ? 'h-[36px]' : 'h-[28px]';
  
  // Critical path styling: highlight critical tasks in red, grey out non-critical tasks
  const isNonCritical = showCriticalPath && !isOnCriticalPath;
  const isCritical = showCriticalPath && isOnCriticalPath;
  
  // Check if this is a milestone (explicitly marked as milestone OR durationDays is explicitly 0)
  // Note: A 1-day task has same start/end date but durationDays=1, not a milestone
  const isMilestoneTask = task.isMilestone || (task.durationDays !== null && task.durationDays !== undefined && task.durationDays === 0);

  return (
    <div 
      className={cn(
        "relative border-b hover:bg-muted/30 transition-colors", 
        rowHeight, 
        hasChildren && "bg-muted/20",
        isNonCritical && "opacity-40",
        isCritical && "bg-red-50 dark:bg-red-950/30",
        hasDependencies && !isCritical && "bg-amber-50/50 dark:bg-amber-950/20"
      )}
      data-testid={`gantt-task-timeline-${task.id}`}
    >
      {/* Baseline bar (rendered below main bar) */}
      {showBaseline && hasBaseline && (
        <div
          className="absolute rounded-sm bg-muted-foreground/30 dark:bg-muted-foreground/20"
          style={{
            left: `${Math.max(0, baselineLeftPercent)}%`,
            width: `${Math.min(100 - Math.max(0, baselineLeftPercent), baselineWidthPercent)}%`,
            minWidth: '8px',
            top: '22px',
            height: '6px',
          }}
          title={`Baseline: ${task.baselineStartDate} - ${task.baselineEndDate}`}
        />
      )}
      
      {/* Main task bar or milestone diamond */}
      {hasValidDates ? (
        isMilestoneTask ? (
          <div
            className="absolute cursor-pointer flex items-center justify-center"
            style={{
              left: `calc(${Math.max(0, leftPercent)}% - 8px)`,
              top: '4px',
              height: showBaseline && hasBaseline ? '16px' : '20px',
            }}
            onClick={() => onTaskClick(task)}
            title={`Milestone: ${task.name}`}
          >
            <div
              className={cn(
                "rotate-45 border-2",
                isCritical ? "bg-red-500 border-red-700" :
                task.status === "Completed" ? "bg-emerald-500 border-emerald-700" :
                task.status === "In Progress" ? "bg-blue-500 border-blue-700" : "bg-purple-500 border-purple-700"
              )}
              style={{
                width: showBaseline && hasBaseline ? '12px' : '14px',
                height: showBaseline && hasBaseline ? '12px' : '14px',
              }}
            />
          </div>
        ) : (
          <div
            className={cn(
              "absolute rounded-sm overflow-hidden cursor-pointer",
              isCritical ? "bg-red-200 dark:bg-red-900 ring-1 ring-red-500" :
              task.status === "Completed" ? "bg-emerald-200 dark:bg-emerald-900" :
              task.status === "In Progress" ? "bg-blue-200 dark:bg-blue-900" : "bg-slate-200 dark:bg-slate-700"
            )}
            style={{
              left: `${Math.max(0, leftPercent)}%`,
              width: `${Math.min(100 - Math.max(0, leftPercent), widthPercent)}%`,
              minWidth: '24px',
              top: '4px',
              height: showBaseline && hasBaseline ? '16px' : '20px',
            }}
            onClick={() => onTaskClick(task)}
          >
            <div 
              className={cn(
                "h-full transition-all",
                isCritical ? "bg-red-500" :
                task.status === "Completed" ? "bg-emerald-500" :
                task.status === "In Progress" ? "bg-blue-500" : "bg-slate-400"
              )}
              style={{ width: `${progressPercent}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground">
              {progressPercent}%
            </span>
          </div>
        )
      ) : (
        <div className="h-full flex items-center px-1" onClick={() => onTaskClick(task)}>
          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
            No dates
          </Badge>
        </div>
      )}
    </div>
  );
}

// Task Dependencies Section Component
function TaskDependenciesSection({ 
  taskId, 
  projectId,
  allTasks 
}: { 
  taskId: number; 
  projectId: number;
  allTasks: Task[];
}) {
  const { data: dependencies, isLoading } = useTaskDependencies(taskId);
  const addDependency = useAddTaskDependency();
  const removeDependency = useRemoveTaskDependency();
  const { toast } = useToast();
  const [selectedPredecessor, setSelectedPredecessor] = useState<string>("");

  // Get tasks that can be predecessors (exclude self, existing predecessors, and parent tasks)
  const availablePredecessors = allTasks.filter((task, index) => {
    if (task.id === taskId) return false;
    if (dependencies?.some(d => d.dependsOnTaskId === task.id)) return false;
    // Exclude tasks with children (parent/summary tasks)
    const taskLevel = task.outlineLevel || 1;
    const hasChildren = index < allTasks.length - 1 && ((allTasks[index + 1].outlineLevel || 1) > taskLevel);
    if (hasChildren) return false;
    return true;
  });

  const handleAddDependency = () => {
    if (!selectedPredecessor) return;
    const predecessorId = Number(selectedPredecessor);
    addDependency.mutate(
      { taskId, dependsOnTaskId: predecessorId, projectId },
      {
        onSuccess: (data: any) => {
          if (data?.dateAdjusted) {
            toast({ 
              title: "Dependency added", 
              description: `Task dates automatically adjusted to start after predecessor (${data.newStartDate} - ${data.newEndDate})`,
            });
          } else {
            toast({ title: "Success", description: "Dependency added" });
          }
          setSelectedPredecessor("");
        },
        onError: (error: any) => {
          toast({ 
            title: "Error", 
            description: error?.message || "Failed to add dependency", 
            variant: "destructive" 
          });
        }
      }
    );
  };

  const handleRemoveDependency = (predecessorId: number) => {
    removeDependency.mutate(
      { taskId, dependsOnTaskId: predecessorId },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Dependency removed" });
        },
        onError: (error: any) => {
          toast({ 
            title: "Error", 
            description: error?.message || "Failed to remove dependency", 
            variant: "destructive" 
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Predecessors
        </Label>
        <p className="text-xs text-muted-foreground">
          Tasks that must be completed before this task can start
        </p>
      </div>

      {/* Current dependencies */}
      {dependencies && dependencies.length > 0 ? (
        <div className="space-y-2">
          {dependencies.map((dep) => {
            const predecessorTask = allTasks.find(t => t.id === dep.dependsOnTaskId);
            return (
              <div 
                key={dep.id} 
                className="flex items-center justify-between p-2 rounded-md bg-muted/50 border"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">
                    {predecessorTask?.name || `Task #${dep.dependsOnTaskId}`}
                  </span>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {dep.dependencyType || "Finish-to-Start"}
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveDependency(dep.dependsOnTaskId)}
                  disabled={removeDependency.isPending}
                  data-testid={`remove-dependency-${dep.dependsOnTaskId}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-4 border rounded-md bg-muted/30">
          No predecessors defined
        </div>
      )}

      {/* Add new dependency */}
      <div className="flex gap-2">
        <Select value={selectedPredecessor} onValueChange={setSelectedPredecessor}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a predecessor task..." />
          </SelectTrigger>
          <SelectContent>
            {availablePredecessors.length === 0 ? (
              <SelectItem value="none" disabled>No available tasks</SelectItem>
            ) : (
              availablePredecessors.map(task => (
                <SelectItem key={task.id} value={String(task.id)}>
                  {task.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={handleAddDependency}
          disabled={!selectedPredecessor || addDependency.isPending}
          data-testid="button-add-dependency"
        >
          {addDependency.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function SortableColumnItem({ 
  id, 
  label, 
  isFirst, 
  isLast, 
  onMoveUp, 
  onMoveDown 
}: { 
  id: string; 
  label: string; 
  isFirst: boolean; 
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "flex items-center gap-2 p-2 bg-background border rounded-md",
        isDragging && "shadow-md"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="flex-1 text-sm">{label}</span>
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={onMoveUp} 
          disabled={isFirst}
          data-testid={`column-move-up-${id}`}
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={onMoveDown} 
          disabled={isLast}
          data-testid={`column-move-down-${id}`}
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function ProjectGanttView({ 
  tasks, 
  onTaskClick, 
  projectId, 
  organizationId,
  onCreateTask,
  projectName,
  isFullscreen,
  projectStartDate,
  projectEndDate,
  hideTimeline = false,
  isReadOnly = false,
}: { 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
  projectId: number;
  organizationId: number | null;
  onCreateTask: (name: string) => void;
  projectName?: string;
  isFullscreen?: boolean;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  hideTimeline?: boolean;
  isReadOnly?: boolean;
}) {
  const updateTask = useUpdateTask();
  const reorderTask = useReorderTask();
  const { toast } = useToast();
  const today = new Date();
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('month');
  const [visibleColumns, setVisibleColumns] = useState<GanttColumn[]>(DEFAULT_GANTT_COLUMNS);
  const [newTaskName, setNewTaskName] = useState('');
  
  // Scroll sync refs for left/right panes
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const isScrollingSyncedRef = useRef(false);
  
  // Sync vertical scroll between left and right panes
  const handleLeftScroll = useCallback(() => {
    if (isScrollingSyncedRef.current) return;
    if (leftPaneRef.current && rightPaneRef.current) {
      isScrollingSyncedRef.current = true;
      rightPaneRef.current.scrollTop = leftPaneRef.current.scrollTop;
      requestAnimationFrame(() => { isScrollingSyncedRef.current = false; });
    }
  }, []);
  
  const handleRightScroll = useCallback(() => {
    if (isScrollingSyncedRef.current) return;
    if (leftPaneRef.current && rightPaneRef.current) {
      isScrollingSyncedRef.current = true;
      leftPaneRef.current.scrollTop = rightPaneRef.current.scrollTop;
      requestAnimationFrame(() => { isScrollingSyncedRef.current = false; });
    }
  }, []);
  
  // Baseline state
  const [showBaseline, setShowBaseline] = useState(false);
  const [isBaselineDialogOpen, setIsBaselineDialogOpen] = useState(false);
  const [baselineMode, setBaselineMode] = useState<'entire' | 'selected'>('entire');
  const [selectedTasksForBaseline, setSelectedTasksForBaseline] = useState<Set<number>>(new Set());
  const [isBaselinePending, setIsBaselinePending] = useState(false);
  const [baselineSelectionMode, setBaselineSelectionMode] = useState(false);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showProjectSummary, setShowProjectSummary] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  
  // Function to recalculate schedule based on dependencies
  const handleRecalculateSchedule = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/recalculate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      
      if (response.ok) {
        // Invalidate tasks to refresh the view
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
        
        if (data.adjustedCount > 0) {
          toast({
            title: "Schedule Updated",
            description: `${data.adjustedCount} task(s) adjusted based on dependencies`,
          });
        } else {
          toast({
            title: "Schedule Up-to-Date",
            description: "All tasks already comply with dependency constraints",
          });
        }
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to recalculate schedule",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to recalculate schedule",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  };
  
  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  
  const toggleTaskSelection = (taskId: number) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };
  
  const selectAllTasks = () => {
    setSelectedTaskIds(new Set(tasks.map(t => t.id)));
  };
  
  const clearTaskSelection = () => {
    setSelectedTaskIds(new Set());
  };
  
  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    
    setBulkDeletePending(true);
    const tasksToDelete = Array.from(selectedTaskIds);
    let successCount = 0;
    let errorCount = 0;
    
    for (const taskId of tasksToDelete) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteTask.mutate({ id: taskId, projectId }, {
            onSuccess: () => { successCount++; resolve(); },
            onError: () => { errorCount++; resolve(); }
          });
        });
      } catch {
        errorCount++;
      }
    }
    
    setBulkDeletePending(false);
    clearTaskSelection();
    
    if (errorCount === 0) {
      toast({ title: "Deleted", description: `${successCount} task${successCount !== 1 ? 's' : ''} deleted successfully` });
    } else {
      toast({ title: "Partial success", description: `${successCount} deleted, ${errorCount} failed`, variant: "destructive" });
    }
  };
  
  // Undo/redo history for all Gantt chart changes
  type GanttAction = 
    | { type: 'reorder'; taskId: number; fromIndex: number; toIndex: number }
    | { type: 'update'; taskId: number; projectId: number; field: string; oldValue: unknown; newValue: unknown };
  const [undoStack, setUndoStack] = useState<GanttAction[]>([]);
  const [redoStack, setRedoStack] = useState<GanttAction[]>([]);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  // Handle task reorder on drag end
  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const activeIndex = tasks.findIndex(t => t.id === active.id);
    const overIndex = tasks.findIndex(t => t.id === over.id);
    
    if (activeIndex === -1 || overIndex === -1) return;
    
    // Save to undo stack
    setUndoStack(prev => [...prev, { type: 'reorder', taskId: Number(active.id), fromIndex: activeIndex, toIndex: overIndex }]);
    setRedoStack([]); // Clear redo stack on new action
    
    reorderTask.mutate({
      projectId,
      taskId: Number(active.id),
      newIndex: overIndex,
    }, {
      onSuccess: () => {
        toast({ title: "Task reordered", description: "Task order updated successfully" });
      },
      onError: () => {
        // Remove from undo stack on error
        setUndoStack(prev => prev.slice(0, -1));
        toast({ title: "Error", description: "Failed to reorder task", variant: "destructive" });
      }
    });
  };
  
  // Push a task update to undo stack (for tracking all changes)
  const pushToUndoStack = (taskId: number, projectId: number, field: string, oldValue: unknown, newValue: unknown) => {
    setUndoStack(prev => [...prev, { type: 'update', taskId, projectId, field, oldValue, newValue }]);
    setRedoStack([]); // Clear redo stack on new action
  };
  
  // Undo last action (reorder or update)
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, lastAction]);
    
    if (lastAction.type === 'reorder') {
      // Reorder back to original position
      reorderTask.mutate({
        projectId,
        taskId: lastAction.taskId,
        newIndex: lastAction.fromIndex,
      }, {
        onSuccess: () => {
          toast({ title: "Undone", description: "Task order restored" });
        },
        onError: () => {
          setUndoStack(prev => [...prev, lastAction]);
          setRedoStack(prev => prev.slice(0, -1));
          toast({ title: "Error", description: "Failed to undo", variant: "destructive" });
        }
      });
    } else if (lastAction.type === 'update') {
      // Restore previous field value
      updateTask.mutate({
        id: lastAction.taskId,
        projectId: lastAction.projectId,
        [lastAction.field]: lastAction.oldValue,
      }, {
        onSuccess: () => {
          toast({ title: "Undone", description: `Task ${lastAction.field} restored` });
        },
        onError: () => {
          setUndoStack(prev => [...prev, lastAction]);
          setRedoStack(prev => prev.slice(0, -1));
          toast({ title: "Error", description: "Failed to undo", variant: "destructive" });
        }
      });
    }
  };
  
  // Redo last undone action
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    
    const lastAction = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, lastAction]);
    
    if (lastAction.type === 'reorder') {
      // Reorder to the target position again
      reorderTask.mutate({
        projectId,
        taskId: lastAction.taskId,
        newIndex: lastAction.toIndex,
      }, {
        onSuccess: () => {
          toast({ title: "Redone", description: "Task order reapplied" });
        },
        onError: () => {
          setRedoStack(prev => [...prev, lastAction]);
          setUndoStack(prev => prev.slice(0, -1));
          toast({ title: "Error", description: "Failed to redo", variant: "destructive" });
        }
      });
    } else if (lastAction.type === 'update') {
      // Reapply the change
      updateTask.mutate({
        id: lastAction.taskId,
        projectId: lastAction.projectId,
        [lastAction.field]: lastAction.newValue,
      }, {
        onSuccess: () => {
          toast({ title: "Redone", description: `Task ${lastAction.field} reapplied` });
        },
        onError: () => {
          setRedoStack(prev => [...prev, lastAction]);
          setUndoStack(prev => prev.slice(0, -1));
          toast({ title: "Error", description: "Failed to redo", variant: "destructive" });
        }
      });
    }
  };
  
  // Fetch project dependencies and calculate CPM
  const { data: projectDependenciesData } = useProjectDependencies(projectId);
  const projectDependencies = Array.isArray(projectDependenciesData) ? projectDependenciesData : [];
  
  // Calculate CPM results when tasks or dependencies change
  const cpmResults = useMemo(() => {
    if (tasks.length === 0) return { results: new Map<number, CPMResult>(), criticalPath: [] };
    
    const cpmTasks = tasks.map(t => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      durationDays: t.durationDays,
      isMilestone: t.isMilestone,
      constraintType: t.constraintType,
      constraintDate: t.constraintDate,
    }));
    
    const safeDeps = Array.isArray(projectDependencies) ? projectDependencies : [];
    const cpmDependencies = safeDeps.map(d => ({
      taskId: d.taskId,
      dependsOnTaskId: d.dependsOnTaskId,
      dependencyType: d.dependencyType,
      lagDays: d.lagDays,
    }));
    
    return calculateCPM(cpmTasks, cpmDependencies);
  }, [tasks, projectDependencies]);
  
  // Map of task ID to whether it's on critical path (from CPM calculation)
  const criticalTaskIds = useMemo(() => {
    const ids = new Set<number>();
    for (const [taskId, result] of Array.from(cpmResults.results.entries())) {
      if (result.isCritical) ids.add(taskId);
    }
    return ids;
  }, [cpmResults]);
  
  // Set of task IDs that have dependencies (dependent tasks)
  const tasksWithDependencies = useMemo(() => {
    const ids = new Set<number>();
    for (const dep of projectDependencies) {
      ids.add(dep.taskId); // The dependent task (successor)
    }
    return ids;
  }, [projectDependencies]);
  
  // Centralized list of tasks valid for baselining (have start and end dates)
  const validBaselineTasks = useMemo(() => 
    tasks.filter(t => t.startDate && t.endDate), 
    [tasks]
  );
  const validBaselineTaskIds = useMemo(() => 
    new Set(validBaselineTasks.map(t => t.id)),
    [validBaselineTasks]
  );
  
  // Column widths - use fixed pixel widths (no scaling)
  const [columnWidths, setColumnWidths] = useState<Record<GanttColumn, number>>(() => {
    const initial: Record<string, number> = {};
    GANTT_COLUMNS.forEach(col => {
      initial[col.id] = col.widthPx;
    });
    return initial as Record<GanttColumn, number>;
  });
  
  // Calculate total width of visible columns (for min-width of scrollable container)
  const totalColumnsWidth = useMemo(() => {
    // 32px for actions column + 32px for add column button
    return 64 + visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || 96), 0);
  }, [visibleColumns, columnWidths]);
  
  // Resize state
  const [resizingColumn, setResizingColumn] = useState<GanttColumn | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  
  // Column add dropdown state
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  
  // Column DnD state for direct header reordering
  const [draggingColumn, setDraggingColumn] = useState<GanttColumn | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<GanttColumn | null>(null);
  
  // Right-click context menu state
  const [contextMenuColumn, setContextMenuColumn] = useState<GanttColumn | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Handle column resize - adjusts only the resized column's width (panel scrolls if needed)
  const handleResizeStart = (e: React.MouseEvent, colId: GanttColumn) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(colId);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[colId] || 96);
  };
  
  useEffect(() => {
    if (!resizingColumn) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const pixelDiff = e.clientX - resizeStartX;
      const newWidth = Math.max(40, resizeStartWidth + pixelDiff);
      
      // Only update the resized column - other columns keep their widths
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };
    
    const handleMouseUp = () => {
      setResizingColumn(null);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);
  
  // Column context menu (right-click to remove)
  const handleColumnContextMenu = (e: React.MouseEvent, colId: GanttColumn) => {
    e.preventDefault();
    if (colId === 'task') return; // Can't remove task column
    setContextMenuColumn(colId);
    // Constrain to viewport bounds (assuming menu is ~150px wide and ~40px tall)
    const menuWidth = 150;
    const menuHeight = 40;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenuPosition({ x: Math.max(10, x), y: Math.max(10, y) });
  };
  
  const removeColumn = (colId: GanttColumn) => {
    if (colId === 'task') return;
    setVisibleColumns(prev => prev.filter(c => c !== colId));
    setContextMenuColumn(null);
    setContextMenuPosition(null);
  };
  
  // Close context menu on click outside or Escape key
  useEffect(() => {
    if (!contextMenuPosition) return;
    const handleClick = () => {
      setContextMenuColumn(null);
      setContextMenuPosition(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuColumn(null);
        setContextMenuPosition(null);
      }
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuPosition]);
  
  // Add column from available fields
  const availableColumnsToAdd = useMemo(() => {
    return GANTT_COLUMNS.filter(col => !visibleColumns.includes(col.id));
  }, [visibleColumns]);
  
  const filteredColumnsToAdd = useMemo(() => {
    if (!columnSearchQuery.trim()) return availableColumnsToAdd;
    const query = columnSearchQuery.toLowerCase();
    return availableColumnsToAdd.filter(col => 
      col.label.toLowerCase().includes(query) || col.id.toLowerCase().includes(query)
    );
  }, [availableColumnsToAdd, columnSearchQuery]);
  
  const addColumn = (colId: GanttColumn) => {
    setVisibleColumns(prev => [...prev, colId]);
    setIsAddColumnOpen(false);
    setColumnSearchQuery('');
  };
  
  // Column drag-and-drop reordering
  const handleColumnDragStart = (e: React.DragEvent, colId: GanttColumn) => {
    if (colId === 'task') return; // Can't drag task column
    setDraggingColumn(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colId);
  };
  
  const handleColumnDragOver = (e: React.DragEvent, colId: GanttColumn) => {
    e.preventDefault();
    if (draggingColumn && draggingColumn !== colId) {
      setDragOverColumn(colId);
    }
  };
  
  const handleColumnDragLeave = () => {
    setDragOverColumn(null);
  };
  
  const handleColumnDrop = (e: React.DragEvent, targetColId: GanttColumn) => {
    e.preventDefault();
    if (!draggingColumn || draggingColumn === targetColId) {
      setDraggingColumn(null);
      setDragOverColumn(null);
      return;
    }
    
    setVisibleColumns(prev => {
      const newCols = [...prev];
      const dragIdx = newCols.indexOf(draggingColumn);
      const targetIdx = newCols.indexOf(targetColId);
      if (dragIdx > -1 && targetIdx > -1) {
        newCols.splice(dragIdx, 1);
        newCols.splice(targetIdx, 0, draggingColumn);
      }
      return newCols;
    });
    
    setDraggingColumn(null);
    setDragOverColumn(null);
  };
  
  const handleColumnDragEnd = () => {
    setDraggingColumn(null);
    setDragOverColumn(null);
  };

  const handleIndent = (task: Task) => {
    const currentLevel = Math.max(1, Math.min(6, task.outlineLevel || 1));
    const newLevel = Math.min(6, currentLevel + 1);
    
    // Check max level
    if (currentLevel >= 6 || newLevel > 6) {
      toast({ title: "Cannot indent", description: "Maximum outline level (6) reached", variant: "destructive" });
      return;
    }
    
    // Validate hierarchy: can only indent one level deeper than the previous task
    const taskIndex = tasks.findIndex(t => t.id === task.id);
    if (taskIndex > 0) {
      const prevTask = tasks[taskIndex - 1];
      const prevLevel = prevTask.outlineLevel || 1;
      // New level cannot exceed previous task's level + 1
      if (newLevel > prevLevel + 1) {
        toast({ title: "Cannot indent", description: "Task can only be one level deeper than the task above", variant: "destructive" });
        return;
      }
    } else if (taskIndex === 0 && newLevel > 1) {
      // First task cannot be indented past level 1
      toast({ title: "Cannot indent", description: "First task cannot be a child", variant: "destructive" });
      return;
    }
    
    // Push to undo stack before making the change
    pushToUndoStack(task.id, task.projectId, 'outlineLevel', currentLevel, newLevel);
    
    updateTask.mutate({ 
      id: task.id, 
      projectId: task.projectId, 
      outlineLevel: newLevel 
    }, {
      onSuccess: () => {
        toast({ title: "Updated", description: `Task indented to level ${newLevel}` });
      },
      onError: () => {
        // Remove from undo stack on error
        setUndoStack(prev => prev.slice(0, -1));
        toast({ title: "Error", description: "Failed to indent task", variant: "destructive" });
      }
    });
  };

  const handleOutdent = (task: Task) => {
    const currentLevel = Math.max(1, Math.min(6, task.outlineLevel || 1));
    const newLevel = Math.max(1, currentLevel - 1);
    if (currentLevel <= 1 || newLevel < 1) {
      toast({ title: "Cannot outdent", description: "Minimum outline level (1) reached", variant: "destructive" });
      return;
    }
    
    // Push to undo stack before making the change
    pushToUndoStack(task.id, task.projectId, 'outlineLevel', currentLevel, newLevel);
    
    updateTask.mutate({ 
      id: task.id, 
      projectId: task.projectId, 
      outlineLevel: newLevel 
    }, {
      onSuccess: () => {
        toast({ title: "Updated", description: `Task outdented to level ${newLevel}` });
      },
      onError: () => {
        // Remove from undo stack on error
        setUndoStack(prev => prev.slice(0, -1));
        toast({ title: "Error", description: "Failed to outdent task", variant: "destructive" });
      }
    });
  };

  // Collapse/expand state management
  const [collapsedTasks, setCollapsedTasks] = useState<Set<number>>(new Set());

  const toggleCollapse = (taskId: number) => {
    setCollapsedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Determine which tasks have children, filter visible tasks, and compute WBS
  // Uses tasks in their original order to preserve hierarchy
  const { visibleTasks, taskHasChildren, wbsMap } = useMemo(() => {
    const taskHasChildren: Record<number, boolean> = {};

    // First pass: determine which tasks have children based on outline levels
    for (let i = 0; i < tasks.length; i++) {
      const currentTask = tasks[i];
      const currentLevel = currentTask.outlineLevel || 1;
      
      // Check if next task is a child (higher level)
      if (i + 1 < tasks.length) {
        const nextTask = tasks[i + 1];
        const nextLevel = nextTask.outlineLevel || 1;
        if (nextLevel > currentLevel) {
          taskHasChildren[currentTask.id] = true;
        }
      }
    }

    // Second pass: filter out collapsed children
    const visibleTasks: Task[] = [];
    let skipUntilLevel = -1;

    for (const task of tasks) {
      const taskLevel = task.outlineLevel || 1;

      // If we're skipping and this task is still a child, skip it
      if (skipUntilLevel > 0 && taskLevel > skipUntilLevel) {
        continue;
      } else {
        skipUntilLevel = -1;
      }

      visibleTasks.push(task);

      // If this task is collapsed and has children, skip its children
      if (collapsedTasks.has(task.id) && taskHasChildren[task.id]) {
        skipUntilLevel = taskLevel;
      }
    }

    // Compute WBS values based on task hierarchy (using ALL tasks, not just visible)
    const wbsMap = computeWbsValues(tasks);

    return { visibleTasks, taskHasChildren, wbsMap };
  }, [tasks, collapsedTasks]);

  // Calculate project summary task (aggregated from all tasks)
  const projectSummaryTask = useMemo((): Task | null => {
    if (!tasks || tasks.length === 0) return null;
    
    // Find earliest start date and latest end date
    let earliestStart: string | null = null;
    let latestEnd: string | null = null;
    let totalProgress = 0;
    let taskCount = 0;
    let totalEstimatedHours = 0;
    let totalActualHours = 0;
    let totalCost = 0;
    let totalActualCost = 0;
    
    for (const task of tasks) {
      if (task.startDate) {
        if (!earliestStart || task.startDate < earliestStart) {
          earliestStart = task.startDate;
        }
      }
      if (task.endDate) {
        if (!latestEnd || task.endDate > latestEnd) {
          latestEnd = task.endDate;
        }
      }
      if (task.progress !== null && task.progress !== undefined) {
        totalProgress += task.progress;
        taskCount++;
      }
      if (task.estimatedHours) totalEstimatedHours += Number(task.estimatedHours);
      if (task.actualHours) totalActualHours += Number(task.actualHours);
      if (task.cost) totalCost += Number(task.cost);
      if (task.actualCost) totalActualCost += Number(task.actualCost);
    }
    
    const avgProgress = taskCount > 0 ? Math.round(totalProgress / taskCount) : 0;
    
    return {
      id: -1, // Special ID for project summary
      projectId: projectId,
      name: projectName || 'Project Summary',
      description: null,
      taskNumber: null,
      taskIndex: 0,
      wbs: '0',
      taskType: null,
      priority: 'Medium',
      startDate: earliestStart,
      endDate: latestEnd,
      baselineStartDate: null,
      baselineEndDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: earliestStart && latestEnd ? 
        Math.ceil((new Date(latestEnd).getTime() - new Date(earliestStart).getTime()) / (1000 * 60 * 60 * 24)) + 1 : null,
      estimatedHours: totalEstimatedHours > 0 ? String(totalEstimatedHours) : null,
      actualHours: totalActualHours > 0 ? String(totalActualHours) : null,
      remainingHours: null,
      progress: avgProgress,
      status: 'In Progress',
      constraintType: null,
      constraintDate: null,
      assignee: null,
      ownerId: null,
      outlineLevel: 0,
      parentId: null,
      isMilestone: false,
      isSummary: true,
      isCritical: false,
      cost: totalCost > 0 ? String(totalCost) : null,
      actualCost: totalActualCost > 0 ? String(totalActualCost) : null,
      phase: null,
      category: null,
      labels: null,
      notes: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      deletedBy: null,
      isDemo: false,
    };
  }, [tasks, projectId, projectName]);

  const handleAddTask = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTaskName.trim()) {
      onCreateTask(newTaskName.trim());
      setNewTaskName('');
    }
  };

  // State for dependencies dialog
  const [dependenciesDialogTask, setDependenciesDialogTask] = useState<Task | null>(null);

  const handleSetBaseline = (task: Task) => {
    if (!task.startDate || !task.endDate) {
      toast({ title: "Cannot set baseline", description: "Task must have start and end dates", variant: "destructive" });
      return;
    }
    updateTask.mutate({
      id: task.id,
      projectId: task.projectId,
      baselineStartDate: task.startDate,
      baselineEndDate: task.endDate,
    }, {
      onSuccess: () => {
        toast({ title: "Baseline set", description: "Current dates saved as baseline" });
      }
    });
  };

  const handleClearBaseline = (task: Task) => {
    updateTask.mutate({
      id: task.id,
      projectId: task.projectId,
      baselineStartDate: null,
      baselineEndDate: null,
    }, {
      onSuccess: () => {
        toast({ title: "Baseline cleared", description: "Baseline dates removed" });
      }
    });
  };

  const handleEditDependencies = (task: Task) => {
    setDependenciesDialogTask(task);
  };

  const toggleColumn = (col: GanttColumn) => {
    if (col === 'task') return;
    setVisibleColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  // Column reordering state and dialog
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  const [reorderColumns, setReorderColumns] = useState<GanttColumn[]>([]);

  const openReorderDialog = () => {
    setReorderColumns([...visibleColumns]);
    setIsReorderDialogOpen(true);
  };

  const handleReorderDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setReorderColumns((cols) => {
        const oldIndex = cols.indexOf(active.id as GanttColumn);
        const newIndex = cols.indexOf(over.id as GanttColumn);
        const newCols = [...cols];
        newCols.splice(oldIndex, 1);
        newCols.splice(newIndex, 0, active.id as GanttColumn);
        return newCols;
      });
    }
  };

  const applyColumnOrder = () => {
    setVisibleColumns(reorderColumns);
    setIsReorderDialogOpen(false);
  };

  const moveColumnUp = (col: GanttColumn) => {
    const idx = reorderColumns.indexOf(col);
    if (idx > 0) {
      const newCols = [...reorderColumns];
      [newCols[idx - 1], newCols[idx]] = [newCols[idx], newCols[idx - 1]];
      setReorderColumns(newCols);
    }
  };

  const moveColumnDown = (col: GanttColumn) => {
    const idx = reorderColumns.indexOf(col);
    if (idx < reorderColumns.length - 1) {
      const newCols = [...reorderColumns];
      [newCols[idx], newCols[idx + 1]] = [newCols[idx + 1], newCols[idx]];
      setReorderColumns(newCols);
    }
  };

  // Baseline handlers
  const openBaselineDialog = () => {
    setBaselineMode('entire');
    setSelectedTasksForBaseline(new Set());
    setIsBaselineDialogOpen(true);
  };

  const toggleTaskForBaseline = (taskId: number, includeChildren: boolean = false) => {
    setSelectedTasksForBaseline(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
        // Also remove children if this is a summary task
        if (includeChildren) {
          const taskIndex = tasks.findIndex(t => t.id === taskId);
          const task = tasks[taskIndex];
          if (task) {
            const taskLevel = task.outlineLevel || 1;
            for (let i = taskIndex + 1; i < tasks.length; i++) {
              const childTask = tasks[i];
              const childLevel = childTask.outlineLevel || 1;
              if (childLevel > taskLevel) {
                next.delete(childTask.id);
              } else {
                break;
              }
            }
          }
        }
      } else {
        next.add(taskId);
        // Also add children if this is a summary task
        if (includeChildren) {
          const taskIndex = tasks.findIndex(t => t.id === taskId);
          const task = tasks[taskIndex];
          if (task) {
            const taskLevel = task.outlineLevel || 1;
            for (let i = taskIndex + 1; i < tasks.length; i++) {
              const childTask = tasks[i];
              const childLevel = childTask.outlineLevel || 1;
              if (childLevel > taskLevel) {
                next.add(childTask.id);
              } else {
                break;
              }
            }
          }
        }
      }
      return next;
    });
  };

  const handleBaselineSubmit = async (): Promise<boolean> => {
    setIsBaselinePending(true);
    try {
      const taskIds = baselineMode === 'selected' ? Array.from(selectedTasksForBaseline) : undefined;
      const response = await fetch(`/api/projects/${projectId}/tasks/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskIds }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to set baseline');
      }
      
      const result = await response.json();
      toast({ 
        title: "Baseline Set", 
        description: `${result.updatedCount} task(s) baselined successfully` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setIsBaselineDialogOpen(false);
      setShowBaseline(true);
      return true;
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to set baseline", 
        variant: "destructive" 
      });
      return false;
    } finally {
      setIsBaselinePending(false);
    }
  };

  const handleClearAllBaselines = async () => {
    setIsBaselinePending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clearBaseline: true }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear baselines');
      }
      
      toast({ title: "Baselines Cleared", description: "All task baselines have been removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setShowBaseline(false);
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to clear baselines", 
        variant: "destructive" 
      });
    } finally {
      setIsBaselinePending(false);
    }
  };

  // Check if any tasks have baselines
  const hasAnyBaselines = useMemo(() => {
    return tasks.some(t => t.baselineStartDate && t.baselineEndDate);
  }, [tasks]);
  
  const { minDate, maxDate, dateRange, autoZoomLevel } = useMemo(() => {
    let minDate: Date;
    let maxDate: Date;
    
    // Prefer project start/end dates if available
    if (projectStartDate && projectEndDate) {
      const projStart = parseISO(projectStartDate);
      const projEnd = parseISO(projectEndDate);
      
      const totalDays = differenceInDays(projEnd, projStart);
      let autoZoom: ZoomLevel = 'month';
      if (totalDays <= 14) autoZoom = 'day';
      else if (totalDays <= 60) autoZoom = 'week';
      else if (totalDays <= 180) autoZoom = 'month';
      else if (totalDays <= 365) autoZoom = 'quarter';
      else if (totalDays <= 730) autoZoom = 'year';
      else autoZoom = '5year';
      
      minDate = startOfMonth(projStart);
      maxDate = endOfMonth(projEnd);
      
      return { minDate, maxDate, dateRange: eachDayOfInterval({ start: minDate, end: maxDate }), autoZoomLevel: autoZoom };
    }
    
    // Fall back to task dates
    const tasksWithDates = tasks.filter(t => t.startDate && t.endDate);
    
    if (tasksWithDates.length > 0) {
      const dates = tasksWithDates.flatMap(t => [parseISO(t.startDate), parseISO(t.endDate)]);
      const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const latestDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      const totalDays = differenceInDays(latestDate, earliestDate);
      let autoZoom: ZoomLevel = 'month';
      if (totalDays <= 14) autoZoom = 'day';
      else if (totalDays <= 60) autoZoom = 'week';
      else if (totalDays <= 180) autoZoom = 'month';
      else if (totalDays <= 365) autoZoom = 'quarter';
      else if (totalDays <= 730) autoZoom = 'year';
      else autoZoom = '5year';
      
      minDate = startOfMonth(earliestDate);
      maxDate = endOfMonth(latestDate);
      
      return { minDate, maxDate, dateRange: eachDayOfInterval({ start: minDate, end: maxDate }), autoZoomLevel: autoZoom };
    } else {
      minDate = startOfMonth(today);
      maxDate = endOfMonth(addDays(today, 60));
      return { minDate, maxDate, dateRange: eachDayOfInterval({ start: minDate, end: maxDate }), autoZoomLevel: 'month' as ZoomLevel };
    }
  }, [tasks, today, projectStartDate, projectEndDate]);

  useEffect(() => {
    setZoomLevel(autoZoomLevel);
  }, [autoZoomLevel]);

  const { adjustedMinDate, adjustedMaxDate, adjustedDateRange } = useMemo(() => {
    let adjMinDate = minDate;
    let adjMaxDate = maxDate;
    
    if (zoomLevel === 'quarter') {
      adjMinDate = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
      adjMaxDate = new Date(maxDate.getFullYear(), Math.ceil((maxDate.getMonth() + 1) / 3) * 3, 0);
    } else if (zoomLevel === 'year') {
      adjMinDate = new Date(minDate.getFullYear(), 0, 1);
      adjMaxDate = new Date(maxDate.getFullYear(), 11, 31);
    } else if (zoomLevel === '5year') {
      const startYear = minDate.getFullYear();
      const endYear = maxDate.getFullYear();
      adjMinDate = new Date(startYear, 0, 1);
      // Ensure we show all years up to maxDate, with at least 5 years span
      adjMaxDate = new Date(Math.max(startYear + 4, endYear), 11, 31);
    }
    
    const adjustedDateRange = eachDayOfInterval({ start: adjMinDate, end: adjMaxDate });
    return { adjustedMinDate: adjMinDate, adjustedMaxDate: adjMaxDate, adjustedDateRange };
  }, [minDate, maxDate, zoomLevel]);

  const { filteredDates, dateFormat, columnWidth } = useMemo(() => {
    switch (zoomLevel) {
      case 'day':
        return {
          filteredDates: adjustedDateRange,
          dateFormat: 'd',
          columnWidth: 'min-w-[40px]'
        };
      case 'week':
        return {
          filteredDates: adjustedDateRange.filter((_, i) => i % 7 === 0),
          dateFormat: 'MMM d',
          columnWidth: 'min-w-[100px]'
        };
      case 'month':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1),
          dateFormat: 'MMM yyyy',
          columnWidth: 'min-w-[100px]'
        };
      case 'quarter':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1 && date.getMonth() % 3 === 0),
          dateFormat: 'QQQ yyyy',
          columnWidth: 'min-w-[80px]'
        };
      case 'year':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1 && date.getMonth() === 0),
          dateFormat: 'yyyy',
          columnWidth: 'min-w-[80px]'
        };
      case '5year':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1 && date.getMonth() === 0),
          dateFormat: 'yyyy',
          columnWidth: 'min-w-[60px]'
        };
    }
  }, [adjustedDateRange, zoomLevel]);

  const handleZoomIn = () => {
    const idx = zoomLevels.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(zoomLevels[idx - 1]);
  };

  const handleZoomOut = () => {
    const idx = zoomLevels.indexOf(zoomLevel);
    if (idx < zoomLevels.length - 1) setZoomLevel(zoomLevels[idx + 1]);
  };

  const handleScrollToSelectedTask = () => {
    // Get the first selected task
    const selectedId = selectedTaskIds.size > 0 ? Array.from(selectedTaskIds)[0] : null;
    const selectedTask = selectedId ? tasks.find(t => t.id === selectedId) : null;
    
    if (selectedTask && selectedTask.startDate && selectedTask.endDate) {
      // Calculate optimal zoom level to show the task
      const taskStart = parseISO(selectedTask.startDate);
      const taskEnd = parseISO(selectedTask.endDate);
      const taskDays = differenceInDays(taskEnd, taskStart) + 1;
      
      // Choose zoom level based on task duration
      let optimalZoom: ZoomLevel = 'month';
      if (taskDays <= 7) optimalZoom = 'day';
      else if (taskDays <= 30) optimalZoom = 'week';
      else if (taskDays <= 90) optimalZoom = 'month';
      else if (taskDays <= 365) optimalZoom = 'quarter';
      else optimalZoom = 'year';
      
      setZoomLevel(optimalZoom);
      
      // Scroll to the task row in the Gantt view
      setTimeout(() => {
        const taskElement = document.querySelector(`[data-testid="gantt-task-timeline-${selectedTask.id}"]`);
        if (taskElement) {
          taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      // No task selected or task has no dates - just fit to project timeline
      setZoomLevel(autoZoomLevel);
    }
  };

  return (
    <Card className="overflow-hidden transition-all duration-200">
      <CardContent className={cn(
        "p-0 flex flex-col",
        isFullscreen && "h-full"
      )}>
        <div className="flex items-center justify-between gap-4 p-3 border-b bg-muted/30 flex-wrap">
          <div className="flex items-center gap-2">
            {!hideTimeline && (
              <span className="text-sm font-medium text-muted-foreground">
                View: {zoomLabels[zoomLevel]}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Columns3 className="h-3.5 w-3.5" />
                  Columns
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[400px] overflow-y-auto w-56">
                {COLUMN_CATEGORIES.map(cat => (
                  <div key={cat.id}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                      {cat.label}
                    </div>
                    {GANTT_COLUMNS.filter(col => col.category === cat.id).map(col => (
                      <DropdownMenuItem 
                        key={col.id}
                        onClick={() => toggleColumn(col.id)}
                        className="gap-2"
                      >
                        <Checkbox 
                          checked={visibleColumns.includes(col.id)} 
                          disabled={col.id === 'task'}
                        />
                        {col.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={openReorderDialog}
              data-testid="button-reorder-columns"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Reorder
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={openBaselineDialog}
              data-testid="button-baseline-schedule"
            >
              <Flag className="h-3.5 w-3.5" />
              Baseline Schedule
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={showProjectSummary}
                onCheckedChange={setShowProjectSummary}
                data-testid="toggle-show-project-summary"
              />
              <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => setShowProjectSummary(!showProjectSummary)}>
                Project Summary
              </Label>
            </div>
            {!hideTimeline && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={showCriticalPath}
                  onCheckedChange={setShowCriticalPath}
                  data-testid="toggle-show-critical-path"
                />
                <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => setShowCriticalPath(!showCriticalPath)}>
                  Critical Path
                </Label>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecalculateSchedule}
                  disabled={isRecalculating}
                  data-testid="button-recalculate-schedule"
                  className="gap-1"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isRecalculating && "animate-spin")} />
                  <span className="text-xs">Refresh Schedule</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recalculate all task dates based on dependencies</TooltipContent>
            </Tooltip>
            {!hideTimeline && hasAnyBaselines && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={showBaseline}
                  onCheckedChange={setShowBaseline}
                  data-testid="toggle-show-baseline"
                />
                <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => setShowBaseline(!showBaseline)}>
                  Show Baseline
                </Label>
              </div>
            )}
            <div className="flex items-center gap-1 border-l pl-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0 || reorderTask.isPending}
                    data-testid="button-undo-reorder"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo reorder</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0 || reorderTask.isPending}
                    data-testid="button-redo-reorder"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo reorder</TooltipContent>
              </Tooltip>
            </div>
            {!hideTimeline && (
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleScrollToSelectedTask}
                      disabled={selectedTaskIds.size === 0}
                      data-testid="button-gantt-scroll-to-task"
                    >
                      <Focus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Scroll to selected task</TooltipContent>
                </Tooltip>
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
            )}
          </div>
        </div>
        {/* Split-pane Gantt layout with resizable panels */}
        {/* Key changes based on hideTimeline to force complete remount and avoid ResizablePanel index errors */}
        <ResizablePanelGroup key={hideTimeline ? "table-mode" : "gantt-mode"} direction="horizontal" className={cn("text-[11px]", isFullscreen ? "flex-1" : "h-[500px]")}>
          {/* Left pane: Metadata columns (horizontal scroll if columns exceed panel width) */}
          <ResizablePanel defaultSize={hideTimeline ? 100 : 50} minSize={20} maxSize={hideTimeline ? 100 : 80}>
            <div ref={leftPaneRef} onScroll={handleLeftScroll} className="h-full overflow-x-auto overflow-y-scroll relative scrollbar-thin scrollbar-hide-y">
              <div style={{ minWidth: `${totalColumnsWidth}px` }}>
              {/* Bulk actions bar - appears when tasks are selected */}
              {selectedTaskIds.size > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 bg-primary/10 border-b">
                  <span className="text-sm font-medium">{selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllTasks}
                    data-testid="button-select-all-tasks"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearTaskSelection}
                    data-testid="button-clear-selection"
                  >
                    Clear
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    disabled={bulkDeletePending || isReadOnly}
                    data-testid="button-bulk-delete"
                  >
                    {bulkDeletePending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete
                  </Button>
                </div>
              )}
              {/* Header row - height must match timeline header */}
              <div className="flex border-b bg-muted/50 sticky top-0 z-10 h-[28px]">
                {/* Bulk selection header column */}
                <div className="w-8 flex-shrink-0 border-r p-1 flex items-center justify-center">
                  <Checkbox
                    checked={selectedTaskIds.size === tasks.length && tasks.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAllTasks();
                      } else {
                        clearTaskSelection();
                      }
                    }}
                    data-testid="bulk-select-all"
                  />
                </div>
                {/* Baseline selection header column */}
                {baselineSelectionMode && (
                  <div className="w-8 flex-shrink-0 border-r p-1 flex items-center justify-center">
                    <Checkbox
                      checked={selectedTasksForBaseline.size === validBaselineTasks.length && validBaselineTasks.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTasksForBaseline(new Set(validBaselineTasks.map(t => t.id)));
                        } else {
                          setSelectedTasksForBaseline(new Set());
                        }
                      }}
                      data-testid="baseline-select-all"
                    />
                  </div>
                )}
                <div className="w-8 flex-shrink-0 border-r p-1"></div>
                {visibleColumns.map(colId => {
                  const col = GANTT_COLUMNS.find(c => c.id === colId);
                  if (!col) return null;
                  const colWidth = columnWidths[colId] || col.widthPx;
                  const isDraggable = col.id !== 'task';
                  return (
                    <div 
                      key={col.id}
                      style={{ width: `${colWidth}px` }}
                      className={cn(
                        "flex-shrink-0 border-r font-semibold text-[10px] text-foreground relative select-none flex items-center overflow-hidden",
                        ['progress', 'isMilestone', 'isCritical', 'isSummary'].includes(col.id) && "justify-center",
                        draggingColumn === col.id && "opacity-50",
                        dragOverColumn === col.id && "bg-muted"
                      )}
                      onDragOver={(e) => handleColumnDragOver(e, col.id)}
                      onDragLeave={handleColumnDragLeave}
                      onDrop={(e) => handleColumnDrop(e, col.id)}
                      onContextMenu={(e) => handleColumnContextMenu(e, col.id)}
                      data-testid={`column-header-${col.id}`}
                    >
                      {/* Drag grip area */}
                      {isDraggable && (
                        <div
                          className="flex-shrink-0 px-0.5 cursor-grab text-muted-foreground"
                          draggable
                          onDragStart={(e) => handleColumnDragStart(e, col.id)}
                          onDragEnd={handleColumnDragEnd}
                        >
                          <GripVertical className="h-3 w-3" />
                        </div>
                      )}
                      <div className="flex-1 p-1 truncate min-w-0">
                        {col.label}
                      </div>
                      {/* Resize handle */}
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20"
                        draggable={false}
                        onMouseDown={(e) => handleResizeStart(e, col.id)}
                        data-testid={`column-resize-${col.id}`}
                      >
                        <div className="absolute inset-y-1 right-0.5 w-0.5 bg-border" />
                      </div>
                    </div>
                  );
                })}
                {/* Add column button - fixed at right edge */}
                <div className="flex-shrink-0 border-l p-1 bg-muted/50">
                  <DropdownMenu open={isAddColumnOpen} onOpenChange={setIsAddColumnOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5"
                        data-testid="button-add-column"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="p-2">
                        <Input
                          placeholder="Search fields..."
                          value={columnSearchQuery}
                          onChange={(e) => setColumnSearchQuery(e.target.value)}
                          className="h-7 text-xs"
                          data-testid="input-column-search"
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {filteredColumnsToAdd.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground text-center">
                            {availableColumnsToAdd.length === 0 ? "All columns added" : "No matching fields"}
                          </div>
                        ) : (
                          filteredColumnsToAdd.map(col => (
                            <DropdownMenuItem 
                              key={col.id}
                              onClick={() => addColumn(col.id)}
                              className="text-xs"
                              data-testid={`add-column-${col.id}`}
                            >
                              {col.label}
                              <span className="ml-auto text-muted-foreground text-[10px]">{col.category}</span>
                            </DropdownMenuItem>
                          ))
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {/* Context menu for column removal */}
                {contextMenuPosition && contextMenuColumn && (
                  <div
                    className="fixed z-50 bg-popover border rounded-md shadow-lg py-1"
                    style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
                    data-testid="column-context-menu"
                  >
                    <button
                      className="w-full px-3 py-1.5 text-left text-sm hover-elevate flex items-center gap-2"
                      onClick={() => removeColumn(contextMenuColumn)}
                      data-testid="button-remove-column"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove Column
                    </button>
                  </div>
                )}
                {/* Project Summary Row (when enabled) - conditions must match timeline side */}
                {showProjectSummary && projectSummaryTask && projectSummaryTask.startDate && projectSummaryTask.endDate && (
                  <div 
                    className="flex border-b bg-primary/10 font-semibold h-[28px]"
                    data-testid="project-summary-row"
                  >
                    {/* Bulk selection column placeholder */}
                    <div className="w-8 flex-shrink-0 border-r p-1" />
                    {/* Baseline selection column (conditional) */}
                    {baselineSelectionMode && <div className="w-8 flex-shrink-0 border-r p-1" />}
                    {/* Icon column (same position as drag handle) */}
                    <div className="w-8 flex-shrink-0 border-r p-1 flex items-center justify-center">
                      <FolderKanban className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {visibleColumns.map(colId => {
                      const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
                      if (!colConfig) return null;
                      const colWidth = columnWidths[colId] || colConfig.widthPx;
                      
                      if (colId === 'taskIndex') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center justify-center">
                            <span className="text-[11px] font-mono">0</span>
                          </div>
                        );
                      }
                      if (colId === 'wbs') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px] font-mono">0</span>
                          </div>
                        );
                      }
                      if (colId === 'task') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center overflow-hidden">
                            <span className="truncate text-[11px]">{projectSummaryTask.name}</span>
                          </div>
                        );
                      }
                      if (colId === 'startDate') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.startDate ? format(new Date(projectSummaryTask.startDate), 'MM/dd/yyyy') : '—'}</span>
                          </div>
                        );
                      }
                      if (colId === 'endDate') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.endDate ? format(new Date(projectSummaryTask.endDate), 'MM/dd/yyyy') : '—'}</span>
                          </div>
                        );
                      }
                      if (colId === 'progress') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.progress}%</span>
                          </div>
                        );
                      }
                      if (colId === 'duration') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.durationDays ? `${projectSummaryTask.durationDays}d` : '—'}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                          <span className="text-[11px] text-muted-foreground">—</span>
                        </div>
                      );
                    })}
                    <div className="flex-shrink-0 p-1 w-8" />
                  </div>
                )}
                
                {/* Task rows - metadata only with drag and drop */}
                <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleTaskDragEnd}>
                  {visibleTasks.length === 0 && tasks.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground">
                      No tasks yet. Add your first task below.
                    </div>
                  ) : (
                    <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      {visibleTasks.map((task, index) => (
                        <SortableTaskRow key={task.id} task={task}>
                          {(dragHandleProps) => (
                            <ProjectGanttTaskRowMeta
                              task={task}
                              rowIndex={index + 1}
                              visibleColumns={visibleColumns}
                              organizationId={organizationId}
                              onIndent={handleIndent}
                              onOutdent={handleOutdent}
                              hasChildren={!!taskHasChildren[task.id]}
                              isCollapsed={collapsedTasks.has(task.id)}
                              dragHandleProps={dragHandleProps}
                              onToggleCollapse={toggleCollapse}
                              projectName={projectName}
                              onSetBaseline={handleSetBaseline}
                              onClearBaseline={handleClearBaseline}
                              onEditDependencies={handleEditDependencies}
                              onEdit={onTaskClick}
                              columnWidths={columnWidths}
                              showBaseline={showBaseline}
                              baselineSelectionMode={baselineSelectionMode}
                              isSelectedForBaseline={selectedTasksForBaseline.has(task.id)}
                              onToggleBaselineSelection={toggleTaskForBaseline}
                              showCriticalPath={showCriticalPath}
                              isOnCriticalPath={criticalTaskIds.has(task.id)}
                              onTrackChange={pushToUndoStack}
                              prevTaskLevel={index > 0 ? (visibleTasks[index - 1].outlineLevel || 1) : undefined}
                              isSelected={selectedTaskIds.has(task.id)}
                              onToggleSelection={toggleTaskSelection}
                              hasDependencies={tasksWithDependencies.has(task.id)}
                              computedWbs={wbsMap.get(task.id)}
                              isReadOnly={isReadOnly}
                            />
                          )}
                        </SortableTaskRow>
                      ))}
                    </SortableContext>
                  )}
                </DndContext>
                {/* Add task row - hidden for read-only projects, height must match timeline side */}
                {!isReadOnly && (
                <div className="flex border-t bg-muted/20 h-[28px]">
                  <div className="w-8 flex-shrink-0 border-r p-1" />
                  {baselineSelectionMode && <div className="w-8 flex-shrink-0 border-r p-1" />}
                  <div className="w-8 flex-shrink-0 border-r p-1" />
                  {visibleColumns.map(colId => {
                    const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
                    if (!colConfig) return null;
                    const colWidth = columnWidths[colId] || colConfig.widthPx;
                    return colId === 'task' ? (
                      <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r p-1">
                        <Input
                          placeholder="Add task..."
                          value={newTaskName}
                          onChange={(e) => setNewTaskName(e.target.value)}
                          onKeyDown={handleAddTask}
                          className="h-6 text-[11px]"
                          data-testid="input-new-task"
                        />
                      </div>
                    ) : (
                      <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r p-1" />
                    );
                  })}
                  {/* Spacer for add column button */}
                  <div className="flex-shrink-0 p-1 w-8" />
                </div>
                )}
              </div>
            </div>
          </ResizablePanel>
          
          {/* Resizable handle with grip - hidden in table view */}
          {!hideTimeline && <ResizableHandle withHandle />}
          
          {/* Right pane: Timeline (resizable + scrollable) - hidden in table view */}
          {!hideTimeline && (
            <ResizablePanel defaultSize={50} minSize={20}>
              <div ref={rightPaneRef} onScroll={handleRightScroll} className="h-full flex overflow-y-auto scrollbar-thin">
                <div className="flex-1 overflow-x-auto">
                <div 
                  className="relative"
                  style={{ minWidth: `${filteredDates.length * 60}px` }}
                >
                  {/* Timeline header - height must match metadata header */}
                  <div className="flex border-b bg-muted/50 sticky top-0 z-10 h-[28px]">
                    {filteredDates.map((date, i) => (
                      <div key={i} className={cn("flex-1 p-1 text-center text-[10px] font-medium text-muted-foreground border-l", columnWidth)}>
                        {format(date, dateFormat)}
                      </div>
                    ))}
                  </div>
                  {/* Project Summary Timeline Row */}
                  {showProjectSummary && projectSummaryTask && projectSummaryTask.startDate && projectSummaryTask.endDate && (
                    <div className="flex h-[28px] border-b bg-primary/10 relative" data-testid="project-summary-timeline">
                      {filteredDates.map((_, i) => (
                        <div key={i} className={cn("flex-1 border-l border-gray-200 dark:border-gray-700", columnWidth)} />
                      ))}
                      {(() => {
                        const startDate = new Date(projectSummaryTask.startDate!);
                        const endDate = new Date(projectSummaryTask.endDate!);
                        const totalDays = differenceInDays(adjustedMaxDate, adjustedMinDate) || 1;
                        const startOffset = differenceInDays(startDate, adjustedMinDate);
                        const duration = differenceInDays(endDate, startDate) + 1;
                        const leftPercent = (startOffset / totalDays) * 100;
                        const widthPercent = (duration / totalDays) * 100;
                        
                        return (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-4 rounded bg-primary/60 border border-primary"
                            style={{
                              left: `${Math.max(0, leftPercent)}%`,
                              width: `${Math.min(100 - leftPercent, widthPercent)}%`,
                            }}
                          />
                        );
                      })()}
                    </div>
                  )}
                  
                  {/* Timeline bars */}
                  {visibleTasks.length === 0 && tasks.length === 0 ? (
                    <div className="h-[28px]" />
                  ) : (
                    visibleTasks.map(task => (
                      <ProjectGanttTaskRowTimeline
                        key={task.id}
                        task={task}
                        onTaskClick={onTaskClick}
                        minDate={adjustedMinDate}
                        maxDate={adjustedMaxDate}
                        hasChildren={!!taskHasChildren[task.id]}
                        showBaseline={showBaseline}
                        showCriticalPath={showCriticalPath}
                        isOnCriticalPath={criticalTaskIds.has(task.id)}
                        hasDependencies={tasksWithDependencies.has(task.id)}
                      />
                    ))
                  )}
                  {/* Empty row for add task alignment - must match left pane condition */}
                  {!isReadOnly && <div className="h-[28px] border-t bg-muted/20" />}
                  
                </div>
                </div>
              </div>
            </ResizablePanel>
          )}
        </ResizablePanelGroup>

        {/* Action bar for baseline selection mode */}
        {baselineSelectionMode && (
          <div className="bg-background border-t p-3 flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <Flag className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedTasksForBaseline.size} task{selectedTasksForBaseline.size !== 1 ? 's' : ''} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedTasksForBaseline(new Set(validBaselineTasks.map(t => t.id)))}
                data-testid="button-select-all-baseline"
              >
                Select All
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedTasksForBaseline(new Set())}
                data-testid="button-clear-baseline-selection"
              >
                Clear
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button 
                variant="outline" 
                onClick={() => {
                  setBaselineSelectionMode(false);
                  setSelectedTasksForBaseline(new Set());
                }}
                data-testid="button-cancel-baseline-selection"
              >
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  setBaselineMode('selected');
                  const success = await handleBaselineSubmit();
                  if (success) {
                    setBaselineSelectionMode(false);
                    setSelectedTasksForBaseline(new Set());
                  }
                }}
                disabled={selectedTasksForBaseline.size === 0 || isBaselinePending}
                data-testid="button-apply-baseline-selection"
              >
                {isBaselinePending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Flag className="h-4 w-4 mr-2" />
                    Apply Baseline
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Dependencies Dialog */}
      <Dialog open={!!dependenciesDialogTask} onOpenChange={(open) => !open && setDependenciesDialogTask(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Task Dependencies
            </DialogTitle>
            <DialogDescription>
              Manage predecessor tasks for "{dependenciesDialogTask?.name}"
            </DialogDescription>
          </DialogHeader>
          {dependenciesDialogTask && (
            <div className="py-4">
              <TaskDependenciesSection
                taskId={dependenciesDialogTask.id}
                projectId={dependenciesDialogTask.projectId}
                allTasks={tasks}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDependenciesDialogTask(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Reorder Dialog */}
      <Dialog open={isReorderDialogOpen} onOpenChange={setIsReorderDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5" />
              Reorder Columns
            </DialogTitle>
            <DialogDescription>
              Drag columns or use arrows to change the display order
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-y-auto">
            <DndContext collisionDetection={closestCorners} onDragEnd={handleReorderDragEnd}>
              <SortableContext items={reorderColumns} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {reorderColumns.map((colId, idx) => {
                    const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
                    return (
                      <SortableColumnItem 
                        key={colId} 
                        id={colId} 
                        label={colConfig?.label || colId}
                        isFirst={idx === 0}
                        isLast={idx === reorderColumns.length - 1}
                        onMoveUp={() => moveColumnUp(colId)}
                        onMoveDown={() => moveColumnDown(colId)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReorderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyColumnOrder} data-testid="button-apply-column-order">
              Apply Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Baseline Schedule Dialog */}
      <Dialog open={isBaselineDialogOpen} onOpenChange={setIsBaselineDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Baseline Schedule
            </DialogTitle>
            <DialogDescription>
              Capture the current schedule as a baseline for comparison
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Baseline Options</Label>
              <div className="space-y-2">
                <div 
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    baselineMode === 'entire' ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setBaselineMode('entire')}
                  data-testid="baseline-option-entire"
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                    baselineMode === 'entire' ? "border-primary" : "border-muted-foreground"
                  )}>
                    {baselineMode === 'entire' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm">Baseline Entire Schedule</div>
                    <div className="text-xs text-muted-foreground">Set baseline for all {tasks.length} tasks in this project</div>
                  </div>
                </div>
                <div 
                  className="flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors border-border hover:bg-muted/50"
                  onClick={() => {
                    // Enter inline selection mode in the grid
                    setSelectedTasksForBaseline(new Set());
                    setBaselineSelectionMode(true);
                    setIsBaselineDialogOpen(false);
                  }}
                  data-testid="baseline-option-selected"
                >
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">Baseline Selected Tasks</div>
                    <div className="text-xs text-muted-foreground">Select tasks directly in the Gantt grid</div>
                  </div>
                </div>
              </div>
            </div>

            {hasAnyBaselines && (
              <div className="pt-2 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-destructive hover:text-destructive"
                  onClick={handleClearAllBaselines}
                  disabled={isBaselinePending}
                  data-testid="button-clear-all-baselines"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear All Baselines
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBaselineDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBaselineSubmit}
              disabled={isBaselinePending || (baselineMode === 'selected' && selectedTasksForBaseline.size === 0)}
              data-testid="button-apply-baseline"
            >
              {isBaselinePending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 mr-2" />
                  Set Baseline
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type GroupByField = 'status' | 'priority' | 'assignee' | 'phase';

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'phase', label: 'Phase' },
];

const STATUS_COLUMNS = [
  { id: "Not Started", label: "Not Started", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { id: "In Progress", label: "In Progress", color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
  { id: "Completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200" },
];

const PRIORITY_COLUMNS = [
  { id: "Low", label: "Low", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { id: "Medium", label: "Medium", color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
  { id: "High", label: "High", color: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200" },
  { id: "Critical", label: "Critical", color: "bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200" },
];

function ProjectKanbanView({ 
  tasks, 
  onTaskClick, 
  onStatusChange,
  isFullscreen,
  organizationId,
  projectId,
  resources,
  onResourceAssign,
  isReadOnly = false,
}: { 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  isFullscreen?: boolean;
  organizationId: number | null;
  projectId: number;
  resources?: Array<{ id: number; displayName: string; resourceCode?: string | null }>;
  onResourceAssign?: (taskId: number, resourceIds: number[]) => void;
  isReadOnly?: boolean;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeOverColumn, setActiveOverColumn] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [filterResourceId, setFilterResourceId] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<GroupByField>('status');
  
  // Fetch all task assignments for the organization to enable filtering at parent level
  const { data: allTaskAssignments } = useAllTaskResourceAssignments(organizationId);
  
  // Get all task IDs for this project
  const projectTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  
  // Map of taskId to list of assigned resourceIds - filtered to this project's tasks only
  const taskAssignmentsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    if (allTaskAssignments) {
      for (const assignment of allTaskAssignments) {
        // Only include assignments for tasks in this project
        if (!projectTaskIds.has(assignment.taskId)) continue;
        if (!map.has(assignment.taskId)) {
          map.set(assignment.taskId, []);
        }
        map.get(assignment.taskId)!.push(assignment.resourceId);
      }
    }
    return map;
  }, [allTaskAssignments, projectTaskIds]);
  
  // Calculate which tasks are summary tasks (have children)
  const summaryTaskIds = useMemo(() => {
    const parentIds = new Set<number>();
    for (const task of tasks) {
      if (task.parentId) {
        parentIds.add(task.parentId);
      }
    }
    return parentIds;
  }, [tasks]);
  
  // Build columns based on groupBy field
  const columns = useMemo(() => {
    if (groupBy === 'status') {
      return STATUS_COLUMNS;
    } else if (groupBy === 'priority') {
      return PRIORITY_COLUMNS;
    } else if (groupBy === 'assignee') {
      // Dynamic columns based on assigned resources + Unassigned
      const assigneeSet = new Set<string>();
      tasks.forEach(t => {
        if (t.assignee) assigneeSet.add(t.assignee);
      });
      const cols = [{ id: "Unassigned", label: "Unassigned", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" }];
      Array.from(assigneeSet).sort().forEach(name => {
        cols.push({ id: name, label: name, color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" });
      });
      return cols;
    } else if (groupBy === 'phase') {
      const phaseSet = new Set<string>();
      tasks.forEach(t => {
        if (t.phase) phaseSet.add(t.phase);
      });
      const cols = [{ id: "No Phase", label: "No Phase", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" }];
      Array.from(phaseSet).sort().forEach(phase => {
        cols.push({ id: phase, label: phase, color: "bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200" });
      });
      return cols;
    }
    return STATUS_COLUMNS;
  }, [groupBy, tasks]);
  
  // Filter tasks: only show leaf tasks (no children) by default, and filter by resource
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (!showSummary) {
      result = result.filter(t => !summaryTaskIds.has(t.id));
    }
    // Apply resource filter at parent level
    if (filterResourceId !== null) {
      result = result.filter(t => {
        const assignedIds = taskAssignmentsMap.get(t.id);
        return assignedIds && assignedIds.includes(filterResourceId);
      });
    }
    return result;
  }, [tasks, showSummary, summaryTaskIds, filterResourceId, taskAssignmentsMap]);
  
  // Get field value for grouping
  const getGroupValue = (task: Task): string => {
    if (groupBy === 'status') {
      return task.status || "Not Started";
    } else if (groupBy === 'priority') {
      return task.priority || "Medium";
    } else if (groupBy === 'assignee') {
      return task.assignee || "Unassigned";
    } else if (groupBy === 'phase') {
      return task.phase || "No Phase";
    }
    return task.status || "Not Started";
  };
  
  // Only enable drag and drop when grouping by status (the only field we update on drag)
  const isDragEnabled = groupBy === 'status';
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: isDragEnabled ? 8 : 999999, // Effectively disable drag when not grouping by status
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (!isDragEnabled) return;
    const taskId = Number(event.active.id);
    const task = tasks.find(t => t.id === taskId);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setActiveOverColumn(null);
      return;
    }
    
    const overData = over.data.current;
    if (overData?.type === 'column') {
      setActiveOverColumn(overData.columnId);
    } else if (overData?.type === 'task') {
      setActiveOverColumn(overData.columnId);
    } else if (columns.some(c => c.id === String(over.id))) {
      setActiveOverColumn(String(over.id));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    setActiveOverColumn(null);
    // Prevent drag-drop changes for read-only projects
    if (isReadOnly) return;
    const { active, over } = event;
    if (!over) return;
    
    const taskId = Number(active.id);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Determine the target column - either dropped on a column directly or on a task within a column
    let targetColumnId: string | null = null;
    
    const overData = over.data.current;
    if (overData?.type === 'column') {
      targetColumnId = overData.columnId;
    } else if (overData?.type === 'task') {
      targetColumnId = overData.columnId;
    } else if (columns.some(c => c.id === String(over.id))) {
      // Fallback: check if over.id is a column id
      targetColumnId = String(over.id);
    }
    
    // Only handle status changes when grouping by status
    if (targetColumnId && groupBy === 'status') {
      const currentValue = task.status || "Not Started";
      if (currentValue !== targetColumnId) {
        onStatusChange(taskId, targetColumnId);
      }
    }
  };
  
  const handleDragCancel = () => {
    setActiveTask(null);
    setActiveOverColumn(null);
  };

  return (
    <Card className="overflow-hidden transition-all duration-200">
      <CardContent className={cn(
        "p-0 flex flex-col",
        isFullscreen && "h-full"
      )}>
        {/* Filter bar */}
        <div className="flex items-center gap-3 p-3 border-b bg-muted/30 flex-wrap">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-summary"
              checked={showSummary}
              onCheckedChange={(checked) => setShowSummary(!!checked)}
              data-testid="kanban-show-summary"
            />
            <label htmlFor="show-summary" className="text-sm cursor-pointer select-none">
              Show Summary
            </label>
          </div>
          
          {/* Group By dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group by:</span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByField)}>
              <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="kanban-group-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Filter by Resource dropdown */}
          {resources && resources.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Resource:</span>
              <Select 
                value={filterResourceId?.toString() || "all"} 
                onValueChange={(v) => setFilterResourceId(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="kanban-filter-resource">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Resources</SelectItem>
                  {resources.map(r => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={cn("p-4", isFullscreen && "flex-1 overflow-auto")}>
          {!isDragEnabled && (
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded mb-3 inline-block">
              Drag and drop is only available when grouping by Status
            </div>
          )}
          <DndContext 
            sensors={isDragEnabled ? sensors : []} 
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div 
              className={cn("grid gap-6 overflow-x-auto pb-2", isFullscreen && "h-full")}
              style={{ 
                gridTemplateColumns: `repeat(${columns.length}, minmax(280px, 1fr))` 
              }}
            >
              {columns.map(column => (
                <ProjectKanbanColumn
                  key={column.id}
                  column={column}
                  tasks={filteredTasks.filter(t => getGroupValue(t) === column.id)}
                  onTaskClick={onTaskClick}
                  isActiveOver={activeOverColumn === column.id && isDragEnabled}
                  resources={resources}
                  onResourceAssign={onResourceAssign}
                  isDragEnabled={isDragEnabled}
                  taskAssignmentsMap={taskAssignmentsMap}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask && isDragEnabled && (
                <div className="opacity-80">
                  <Card className="shadow-lg border-primary">
                    <CardContent className="p-4">
                      <div className="font-medium text-sm">{activeTask.name}</div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectKanbanColumn({ 
  column, 
  tasks, 
  onTaskClick,
  isActiveOver,
  resources,
  onResourceAssign,
  isDragEnabled,
  taskAssignmentsMap,
}: { 
  column: { id: string; label: string; color: string }; 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
  isActiveOver: boolean;
  resources?: Array<{ id: number; displayName: string; resourceCode?: string | null }>;
  onResourceAssign?: (taskId: number, resourceIds: number[]) => void;
  isDragEnabled?: boolean;
  taskAssignmentsMap?: Map<number, number[]>;
}) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: 'column',
      columnId: column.id,
    },
    disabled: !isDragEnabled,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "space-y-4 min-h-[200px] rounded-lg transition-colors p-2",
        isActiveOver && "bg-primary/10 ring-2 ring-primary ring-dashed"
      )}
    >
      <div className={cn("rounded-lg p-3 font-semibold", column.color)}>
        {column.label} ({tasks.length})
      </div>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {tasks.map(task => (
            <ProjectDraggableTaskCard
              key={task.id}
              task={task}
              onTaskClick={onTaskClick}
              columnId={column.id}
              resources={resources}
              onResourceAssign={onResourceAssign}
              isDragEnabled={isDragEnabled}
              assignedResourceIds={taskAssignmentsMap?.get(task.id) || []}
            />
          ))}
          {tasks.length === 0 && isDragEnabled && (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              Drop tasks here
            </div>
          )}
          {tasks.length === 0 && !isDragEnabled && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No tasks
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function ProjectDraggableTaskCard({ 
  task, 
  onTaskClick,
  columnId,
  resources,
  onResourceAssign,
  isDragEnabled,
  assignedResourceIds,
}: { 
  task: Task; 
  onTaskClick: (task: Task) => void;
  columnId: string;
  resources?: Array<{ id: number; displayName: string; resourceCode?: string | null }>;
  onResourceAssign?: (taskId: number, resourceIds: number[]) => void;
  isDragEnabled?: boolean;
  assignedResourceIds: number[];
}) {
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'task',
      task,
      columnId,
    },
    disabled: !isDragEnabled,
  });

  const style: React.CSSProperties = isDragEnabled ? {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  } : {};

  // Get assigned resource names from the resources list
  const assignedResources = useMemo(() => {
    if (!resources) return [];
    return resources.filter(r => assignedResourceIds.includes(r.id));
  }, [resources, assignedResourceIds]);

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onTaskClick(task);
  };
  
  const handleQuickAssign = (resourceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onResourceAssign) {
      const newIds = assignedResourceIds.includes(resourceId)
        ? assignedResourceIds.filter(id => id !== resourceId)
        : [...assignedResourceIds, resourceId];
      onResourceAssign(task.id, newIds);
    }
    setIsAssignOpen(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isDragEnabled ? { ...attributes, ...listeners } : {})}
      className={cn(
        isDragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        isDragging && "opacity-50"
      )}
    >
      <Card 
        className="hover:shadow-md transition-shadow"
        onClick={handleClick}
        data-testid={`kanban-task-${task.id}`}
      >
        <CardContent className="p-4">
          <div className="font-medium text-sm flex items-center gap-1.5">
            {task.isMilestone && <MilestoneIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
            {task.name}
          </div>
          {/* Resource assignment row */}
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {assignedResources.length > 0 ? (
              assignedResources.map(r => (
                <Badge key={r.id} variant="secondary" className="text-[10px] py-0">
                  {r.displayName}
                </Badge>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground">No resources</span>
            )}
            {resources && resources.length > 0 && onResourceAssign && (
              <DropdownMenu open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 ml-1"
                    data-testid={`kanban-assign-${task.id}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>
                  {resources.map(r => (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={(e) => handleQuickAssign(r.id, e)}
                      className="text-xs"
                    >
                      <Check className={cn("h-3 w-3 mr-2", assignedResourceIds.includes(r.id) ? "opacity-100" : "opacity-0")} />
                      {r.displayName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
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

function IssuesTab({ projectId, projectName }: { projectId: number; projectName?: string }) {
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
                projectId={projectId}
                projectName={projectName}
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
                  <Label>Line Item <span className="text-destructive">*</span></Label>
                  <Input {...form.register("lineItem")} placeholder="e.g., Software Licenses" data-testid="input-line-item" />
                  {form.formState.errors.lineItem && (
                    <p className="text-xs text-destructive">{form.formState.errors.lineItem.message as string || "Line Item is required"}</p>
                  )}
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
  const [limitError, setLimitError] = useState<{ resourceType: string; message?: string } | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'scope' as 'scope' | 'schedule' | 'budget' | 'resource' | 'other',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    status: 'Draft' as 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Implemented',
    impact: '',
    justification: '',
  });

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'scope',
      priority: 'medium',
      status: 'Draft',
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
        },
        onError: (err: any) => {
          if (err.limitExceeded) {
            setLimitError({ resourceType: err.resourceType || "change_requests", message: err.message });
            setIsDialogOpen(false);
          } else {
            toast({ title: "Error", description: err.message, variant: "destructive" });
          }
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
      status: (request.status || 'Draft') as any,
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

  const getStatusBadge = (status: string | null) => {
    const styles: Record<string, string> = {
      Draft: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
      Submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      "Under Review": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
      Approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
      Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-300",
      Implemented: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    };
    return styles[status || 'Draft'] || styles.Draft;
  };

  const getPriorityBadge = (priority: string | null) => {
    const styles: Record<string, string> = {
      Low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
      Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
      High: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    };
    return styles[priority || 'Medium'] || styles.Medium;
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
              <div className={editingRequest ? "grid grid-cols-3 gap-4" : "grid grid-cols-2 gap-4"}>
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
                {editingRequest && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as any })}>
                      <SelectTrigger data-testid="select-change-request-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Submitted">Submitted</SelectItem>
                        <SelectItem value="Under Review">Under Review</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                        <SelectItem value="Implemented">Implemented</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                      <Badge className={cn("text-xs", getStatusBadge(request.status))}>{request.status || 'Draft'}</Badge>
                      <Badge className={cn("text-xs", getPriorityBadge(request.priority))}>{request.priority || 'Medium'}</Badge>
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
                  {request.createdAt && <span>Created: {format(new Date(request.createdAt), 'MMM d, yyyy')}</span>}
                  {request.reviewedDate && <span>Reviewed: {format(new Date(request.reviewedDate), 'MMM d, yyyy')}</span>}
                  {request.implementedDate && <span>Implemented: {format(new Date(request.implementedDate), 'MMM d, yyyy')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <LimitExceededDialog
        open={!!limitError}
        onOpenChange={(o) => !o && setLimitError(null)}
        resourceType={limitError?.resourceType || "change_requests"}
        message={limitError?.message}
      />
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; status: 'uploading' | 'done' | 'error' }[]>([]);
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'General' as string,
    fileUrl: '',
    version: '1.0',
    fileName: '',
  });

  const getFileUrl = (doc: ProjectDocument) => {
    if (!doc.fileUrl) return null;
    return doc.fileUrl.startsWith('/objects/') 
      ? doc.fileUrl 
      : doc.fileUrl.startsWith('http') 
        ? doc.fileUrl 
        : `/objects/${doc.fileUrl}`;
  };

  const canPreview = (doc: ProjectDocument) => {
    const mimeType = doc.mimeType?.toLowerCase() || '';
    const fileName = doc.fileName?.toLowerCase() || '';
    const ext = fileName.split('.').pop() || '';
    
    const previewableTypes = [
      'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/ogg'
    ];
    const previewableExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'txt', 'html', 'css', 'js', 'json', 'mp4', 'webm', 'mp3', 'wav', 'ogg'];
    
    return previewableTypes.includes(mimeType) || previewableExts.includes(ext);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: 'General',
      fileUrl: '',
      version: '1.0',
      fileName: '',
    });
    setEditingDocument(null);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({ title: "Error", description: "Document title is required", variant: "destructive" });
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
      title: doc.title,
      description: doc.description || '',
      category: doc.category || 'General',
      fileUrl: doc.fileUrl || '',
      version: doc.version || '1.0',
      fileName: doc.fileName || '',
    });
    setIsDialogOpen(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const uploadFileToStorage = async (file: File): Promise<string> => {
    const urlResponse = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });

    if (!urlResponse.ok) {
      throw new Error("Failed to get upload URL");
    }

    const { uploadURL, objectPath } = await urlResponse.json();

    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });

    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file");
    }

    return objectPath;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      setUploadingFiles(prev => [...prev, { name: file.name, status: 'uploading' }]);
      
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      let category = 'General';
      if (['pdf', 'doc', 'docx'].includes(fileExtension)) category = 'General';
      else if (['xls', 'xlsx', 'csv'].includes(fileExtension)) category = 'Report';
      else if (['ppt', 'pptx'].includes(fileExtension)) category = 'Design';
      else if (['txt', 'md'].includes(fileExtension)) category = 'Requirements';

      try {
        const objectPath = await uploadFileToStorage(file);
        
        await createDocument.mutateAsync({
          title: file.name.replace(/\.[^/.]+$/, ''),
          description: `Uploaded file: ${file.name}`,
          category,
          fileName: file.name,
          fileUrl: objectPath,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          version: '1.0',
        });
        
        setUploadingFiles(prev => 
          prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f)
        );
        
        toast({ title: "Document Uploaded", description: `${file.name} has been uploaded` });
      } catch (error) {
        setUploadingFiles(prev => 
          prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
        );
        toast({ title: "Error", description: `Failed to upload ${file.name}`, variant: "destructive" });
      }
    }

    setTimeout(() => {
      setUploadingFiles([]);
    }, 3000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    setFormData({
      ...formData,
      title: formData.title || file.name.replace(/\.[^/.]+$/, ''),
      fileName: file.name,
    });
  };

  const getCategoryIcon = (category: string | null) => {
    switch (category?.toLowerCase()) {
      case 'contract': return <FileText className="h-4 w-4" />;
      case 'requirement':
      case 'requirements': return <ClipboardList className="h-4 w-4" />;
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
                <Label>Document Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Project Charter, Requirements Spec"
                  data-testid="input-document-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger data-testid="select-document-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General">General</SelectItem>
                      <SelectItem value="Charter">Charter</SelectItem>
                      <SelectItem value="Plan">Plan</SelectItem>
                      <SelectItem value="Requirements">Requirements</SelectItem>
                      <SelectItem value="Design">Design</SelectItem>
                      <SelectItem value="Test">Test</SelectItem>
                      <SelectItem value="Training">Training</SelectItem>
                      <SelectItem value="Report">Report</SelectItem>
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
                <Label>File</Label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    onChange={handleFileSelect}
                    className="flex-1"
                    data-testid="input-document-file"
                  />
                </div>
                {formData.fileName && (
                  <p className="text-xs text-muted-foreground">Selected: {formData.fileName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>File URL / Link (optional)</Label>
                <Input
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  placeholder="https://... or external link"
                  data-testid="input-document-url"
                />
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
      <CardContent className="space-y-4">
        {/* Drag and Drop Zone */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
            isDragOver 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="dropzone-documents"
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag and drop files here to add documents
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PDF, Word, Excel, PowerPoint, and text files supported
          </p>
        </div>

        {/* Upload Progress */}
        {uploadingFiles.length > 0 && (
          <div className="space-y-2">
            {uploadingFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-md">
                {file.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {file.status === 'done' && <Check className="h-4 w-4 text-green-600" />}
                {file.status === 'error' && <X className="h-4 w-4 text-red-600" />}
                <span className="text-sm truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {file.status === 'uploading' ? 'Adding...' : file.status === 'done' ? 'Added' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Document List */}
        {!documents || documents.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No documents yet. Drag files here or click "Add Document" to add one.
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium truncate">{doc.title}</h4>
                      {doc.category && <Badge variant="outline" className="text-xs">{doc.category}</Badge>}
                      {doc.version && <span className="text-xs text-muted-foreground">v{doc.version}</span>}
                    </div>
                    {doc.description && (
                      <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
                    )}
                    {doc.fileName && (
                      <span className="text-xs text-muted-foreground">File: {doc.fileName}</span>
                    )}
                    {doc.createdAt && (
                      <span className="text-xs text-muted-foreground block">
                        Added {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {doc.fileUrl && canPreview(doc) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setPreviewDoc(doc)}
                          data-testid={`button-preview-document-${doc.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview document</TooltipContent>
                    </Tooltip>
                  )}
                  {doc.fileUrl && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            const url = getFileUrl(doc);
                            if (url) window.open(url, '_blank');
                          }}
                          data-testid={`button-open-document-${doc.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Download document</TooltipContent>
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

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {previewDoc?.title || 'Document Preview'}
            </DialogTitle>
            <DialogDescription>
              {previewDoc?.fileName || 'Viewing document'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-[400px]">
            {previewDoc && (() => {
              const url = getFileUrl(previewDoc);
              if (!url) return <div className="text-center py-8 text-muted-foreground">No file available</div>;
              
              const mimeType = previewDoc.mimeType?.toLowerCase() || '';
              const ext = (previewDoc.fileName?.split('.').pop() || '').toLowerCase();
              
              if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
                return <img src={url} alt={previewDoc.title} className="max-w-full h-auto mx-auto" />;
              }
              
              if (mimeType === 'application/pdf' || ext === 'pdf') {
                return <iframe src={url} className="w-full h-[600px] border-0" title={previewDoc.title} />;
              }
              
              if (mimeType.startsWith('video/') || ['mp4', 'webm'].includes(ext)) {
                return (
                  <video controls className="max-w-full mx-auto">
                    <source src={url} type={mimeType || 'video/mp4'} />
                    Your browser does not support the video tag.
                  </video>
                );
              }
              
              if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext)) {
                return (
                  <div className="py-8 flex justify-center">
                    <audio controls>
                      <source src={url} type={mimeType || 'audio/mpeg'} />
                      Your browser does not support the audio tag.
                    </audio>
                  </div>
                );
              }
              
              if (mimeType.startsWith('text/') || ['txt', 'html', 'css', 'js', 'json'].includes(ext)) {
                return <iframe src={url} className="w-full h-[600px] border rounded-md bg-muted" title={previewDoc.title} />;
              }
              
              return (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Preview not available for this file type.</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => window.open(url, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download to view
                  </Button>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDoc(null)}>Close</Button>
            {previewDoc && getFileUrl(previewDoc) && (
              <Button onClick={() => window.open(getFileUrl(previewDoc)!, '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface StatusReportTabProps {
  project: any;
  risks: Risk[];
  issues: Issue[];
  milestones: any[];
  financials: ProjectFinancial[];
  tasks: Task[];
  changeRequests: ChangeRequest[];
  documents: ProjectDocument[];
}

function StatusReportTab({
  project,
  risks,
  issues,
  milestones,
  financials,
  tasks,
  changeRequests,
  documents
}: StatusReportTabProps) {
  const { toast } = useToast();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const combinedMilestones = useMemo(() => {
    const taskMilestones = tasks
      .filter(t => t.isMilestone && !t.deletedAt)
      .map(t => ({
        id: t.id,
        projectId: t.projectId,
        title: t.name,
        description: t.description || null,
        dueDate: t.endDate || t.startDate || new Date().toISOString().split('T')[0],
        status: t.status === 'Completed' ? 'Done' : t.status === 'In Progress' ? 'In Progress' : 'Not Started',
        completed: t.status === 'Completed',
        notes: t.notes || null,
        createdAt: t.createdAt,
        deletedAt: null,
        deletedBy: null,
      }));
    return [...milestones, ...taskMilestones];
  }, [milestones, tasks]);

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ProjectStatusReportPDF } = await import("@/components/ProjectStatusReportPDF");
      
      const doc = (
        <ProjectStatusReportPDF
          project={project}
          risks={risks}
          issues={issues}
          milestones={combinedMilestones}
          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={project.description || ""}
        />
      );
      
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Status_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download Started",
        description: "Your PDF report is being downloaded."
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Download Failed",
        description: "Could not generate the PDF. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail) {
      toast({
        title: "Email Required",
        description: "Please enter a recipient email address.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSendingEmail(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { ProjectStatusReportPDF } = await import("@/components/ProjectStatusReportPDF");
      
      const doc = (
        <ProjectStatusReportPDF
          project={project}
          risks={risks}
          issues={issues}
          milestones={combinedMilestones}
          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={project.description || ""}
        />
      );
      
      const blob = await pdf(doc).toBlob();
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      const pdfFileName = `${project.name.replace(/[^a-z0-9]/gi, "_")}_Status_Report.pdf`;
      
      await apiRequest("POST", `/api/projects/${project.id}/status-report/email`, {
        recipientEmail,
        executiveSummary: project.description || "",
        pdfBase64: base64,
        pdfFileName
      });
      
      toast({
        title: "Report Sent",
        description: `Status report sent to ${recipientEmail}`
      });
      setShowEmailDialog(false);
      setRecipientEmail("");
    } catch (error: any) {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send the status report. Please check email settings.",
        variant: "destructive"
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Comprehensive Project Status Report
            </CardTitle>
            <CardDescription>
              Complete overview of project status, progress, risks, issues, and financials
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              data-testid="button-download-status-report"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-share-status-report">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share Status Report</DialogTitle>
                  <DialogDescription>
                    Send this status report as a PDF attachment via email.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipient-email">Recipient Email</Label>
                    <Input
                      id="recipient-email"
                      type="email"
                      placeholder="Enter email address"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      data-testid="input-recipient-email"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSendEmail} 
                    disabled={isSendingEmail}
                    data-testid="button-send-status-report"
                  >
                    {isSendingEmail ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4 mr-2" />
                    )}
                    Send Email
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ProjectStatusReport
          project={project}
          risks={risks}
          issues={issues}
          milestones={combinedMilestones}
          financials={financials}
          tasks={tasks}
          changeRequests={changeRequests}
          documents={documents}
          executiveSummary={project.description || ""}
        />
      </CardContent>
    </Card>
  );
}
