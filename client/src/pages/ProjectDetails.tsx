import { useState, useMemo, useEffect, useRef } from "react";
import { formatDuration } from "@/lib/workingDays";
import plannerLogoPath from "@/assets/planner-logo.png";
import { useRoute, Link } from "wouter";
import { useProject, useUpdateProject, useProjectHistory, useProjects, useDeleteProject } from "@/hooks/use-projects";
import { usePortfolios, useCreatePortfolio } from "@/hooks/use-portfolios";
import { useRisks } from "@/hooks/use-risks";
import { useIssues } from "@/hooks/use-issues";
import { useTasks } from "@/hooks/use-tasks";
import { useMilestones } from "@/hooks/use-milestones";
import { useChangeRequests } from "@/hooks/use-change-requests";
import { useProjectDocuments } from "@/hooks/use-project-documents";
import { useProjectComments, useCreateProjectComment, useDeleteProjectComment } from "@/hooks/use-project-comments";
import { useBillableStatusComments, useCreateBillableStatusComment } from "@/hooks/use-billable-status-comments";
import { useHealthStatusHistory } from "@/hooks/use-health-status-history";
import { useCustomFieldDefinitions, useProjectCustomFieldValues, useUpdateProjectCustomFieldValue } from "@/hooks/use-custom-fields";
import { useCustomProjectTabs, useFullCustomTab } from "@/hooks/use-custom-tabs";
import type { CustomFieldDefinition, CustomTabField } from "@shared/schema";
import { useProjectFinancials } from "@/hooks/use-project-financials";
import { useResources, useProjectTaskAssignments } from "@/hooks/use-resources";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { ResourceSelector } from "@/components/ResourceSelector";
import { StatusReportDialog } from "@/components/StatusReportDialog";
import { CrossProjectReferences } from "@/components/CrossProjectReferences";
import TasksTab from "@/components/project/ProjectTasksTab";
import RisksTab from "@/components/project/ProjectRisksTab";
import { IssuesTab, FinancialsTab, ChangeRequestsTab, DocumentsTab, StatusReportTab, ScoringTab, BenefitsTab, DecisionsTab, LessonsLearnedTab, InvoicesTab } from "@/components/project/ProjectTabs";
import ProjectAgentTab from "@/components/project/ProjectAgentTab";
import DailyLogsTab from "@/components/project/DailyLogsTab";
import RFIsTab from "@/components/project/RFIsTab";
import SubmittalsTab from "@/components/project/SubmittalsTab";
import DrawingsTab from "@/components/project/DrawingsTab";
import PunchListTab from "@/components/project/PunchListTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar as CalendarIcon, DollarSign, Plus, Trash2, FileText, Pencil, Check, X, LayoutGrid, GanttChart, History, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, ClipboardList, ExternalLink, Download, Upload, ArrowDownUp, Eye, EyeOff, CheckCircle2, Circle, ArrowRight, MessageSquare, Send, Reply, ArrowDown, Crown, Pin, PinOff, Lock as LockIcon, LockOpen, Cloud, GitBranch, Shield, User as UserIcon, Users, UserPlus, Flag, FlagTriangleRight, ImageDown, Mail, Briefcase, ZoomIn, ZoomOut, Maximize2, ListTodo, MoreVertical, UserMinus, PanelLeft } from "lucide-react";
import { toPng } from "html-to-image";
import ExcelJS from "exceljs";
import { GANTT_COLUMNS, type GanttColumn } from "@/components/project/ProjectGanttView";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { format, addDays, addWeeks, addMonths, addQuarters, addYears, differenceInDays, parseISO, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, endOfDay } from "date-fns";
import type { Task, ProjectFinancial, Risk, User } from "@shared/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AICreateButton } from "@/components/layout/AICreateButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useLocation } from "wouter";

const PROJECT_STAGES = [
  { value: "Initiation", label: "Initiation", description: "Project kickoff" },
  { value: "Planning", label: "Planning", description: "Define scope & schedule" },
  { value: "Execution", label: "Execution", description: "Active development" },
  { value: "Monitoring", label: "Monitoring", description: "Track & control" },
  { value: "Closing", label: "Closing", description: "Project completion" },
  { value: "Billing", label: "Billing", description: "Pending invoices & accounting" },
  { value: "Closed", label: "Closed", description: "Project archived & locked", isTerminal: true },
];

// Helper to check if a project status is the terminal locked state
const isProjectStatusLocked = (status: string) => status === "Closed";

function BusinessProcessFlow({ 
  currentStatus, 
  onStatusChange 
}: { 
  currentStatus: string; 
  onStatusChange: (status: string) => void;
}) {
  const currentIndex = PROJECT_STAGES.findIndex(s => s.value === currentStatus);
  const isCurrentlyLocked = isProjectStatusLocked(currentStatus);
  
  return (
    <>
      <div className="hidden sm:flex items-center justify-between">
        {PROJECT_STAGES.map((stage, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isUpcoming = index > currentIndex;
            const isTerminalStage = (stage as any).isTerminal;
            const isClickDisabled = isCurrent;
            
            return (
              <div key={stage.value} className="flex items-center flex-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => !isClickDisabled && onStatusChange(stage.value)}
                      disabled={isClickDisabled}
                      className={cn(
                        "flex flex-col items-center gap-1 group transition-all",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md p-2",
                        isClickDisabled 
                          ? "cursor-default" 
                          : "cursor-pointer"
                      )}
                      data-testid={`status-stage-${stage.value.toLowerCase()}`}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all border-2",
                        isCompleted && "bg-primary border-primary text-primary-foreground",
                        isCurrent && !isTerminalStage && "bg-primary border-primary text-primary-foreground ring-4 ring-primary/20",
                        isCurrent && isTerminalStage && "bg-amber-600 border-amber-600 text-white ring-4 ring-amber-600/20",
                        isUpcoming && !isTerminalStage && "bg-muted border-muted-foreground/30 text-muted-foreground group-hover:border-primary/50 group-hover:bg-muted/80",
                        isUpcoming && isTerminalStage && "bg-muted border-amber-500/30 text-amber-600 group-hover:border-amber-500/50 group-hover:bg-amber-50 dark:group-hover:bg-amber-950/20",
                        isCurrentlyLocked && !isTerminalStage && !isCurrent && "group-hover:border-emerald-500/50 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/20"
                      )}>
                        {isTerminalStage ? (
                          <LockIcon className="h-5 w-5" />
                        ) : isCompleted ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : isCurrent ? (
                          <span className="text-sm font-bold">{index + 1}</span>
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </div>
                      <span className={cn(
                        "text-xs font-medium transition-colors",
                        isCurrent && isTerminalStage && "text-amber-600",
                        (isCompleted || isCurrent) && !isTerminalStage && "text-foreground",
                        isUpcoming && "text-muted-foreground group-hover:text-foreground",
                        isCurrentlyLocked && !isTerminalStage && !isCurrent && "group-hover:text-emerald-600"
                      )}>
                        {stage.label}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{stage.label}</p>
                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                    {isCurrentlyLocked && !isTerminalStage ? (
                      <p className="text-xs text-emerald-600 mt-1">Click to reopen project at this stage</p>
                    ) : isTerminalStage && !isCurrent ? (
                      <p className="text-xs text-amber-600 mt-1">Setting this will lock the project</p>
                    ) : isCurrent ? (
                      <p className="text-xs text-muted-foreground mt-1">Current status</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Click to set status</p>
                    )}
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

      <div className="sm:hidden grid grid-cols-4 gap-2">
        {PROJECT_STAGES.map((stage, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isUpcoming = index > currentIndex;
            const isTerminalStage = (stage as any).isTerminal;
            const isClickDisabled = isCurrent;
            
            return (
              <button
                key={stage.value}
                onClick={() => !isClickDisabled && onStatusChange(stage.value)}
                disabled={isClickDisabled}
                className={cn(
                  "flex flex-col items-center gap-1 group transition-all rounded-md p-1.5",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isClickDisabled ? "cursor-default" : "cursor-pointer"
                )}
                data-testid={`status-stage-mobile-${stage.value.toLowerCase()}`}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all border-2",
                  isCompleted && "bg-primary border-primary text-primary-foreground",
                  isCurrent && !isTerminalStage && "bg-primary border-primary text-primary-foreground ring-2 ring-primary/20",
                  isCurrent && isTerminalStage && "bg-amber-600 border-amber-600 text-white ring-2 ring-amber-600/20",
                  isUpcoming && !isTerminalStage && "bg-muted border-muted-foreground/30 text-muted-foreground",
                  isUpcoming && isTerminalStage && "bg-muted border-amber-500/30 text-amber-600",
                  isCurrentlyLocked && !isTerminalStage && !isCurrent && "group-hover:border-emerald-500/50"
                )}>
                  {isTerminalStage ? (
                    <LockIcon className="h-4 w-4" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isCurrent ? (
                    <span className="text-xs font-bold">{index + 1}</span>
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium transition-colors text-center leading-tight",
                  isCurrent && isTerminalStage && "text-amber-600",
                  (isCompleted || isCurrent) && !isTerminalStage && "text-foreground",
                  isUpcoming && "text-muted-foreground",
                  isCurrentlyLocked && !isTerminalStage && !isCurrent && "group-hover:text-emerald-600"
                )}>
                  {stage.label}
                </span>
              </button>
            );
          })}
      </div>
    </>
  );
}

export default function ProjectDetails() {
  const [, params] = useRoute("/projects/:id");
  const id = parseInt(params?.id || "0");
  const { data: project, isLoading, refetch: refetchProject } = useProject(id);
  const { data: financials } = useProjectFinancials(id);
  const { data: projectTasks } = useTasks(id);
  const { data: projectTaskAssignments } = useProjectTaskAssignments(id);
  const { data: projectRisks } = useRisks(id);
  const { data: projectIssues } = useIssues(id);
  const { data: projectMilestones } = useMilestones(id);
  const { data: projectChangeRequests } = useChangeRequests(id);
  const { data: projectDocuments } = useProjectDocuments(id);
  const { mutate: updateProject } = useUpdateProject();
  const { toast } = useToast();

  const { data: latestHeaderProjectAssessment } = useQuery<{ riskScore: number; generatedAt: string; summary: string } | null>({
    queryKey: ["/api/projects", id, "risk-assessment", "latest"],
  });

  const headerProjectRiskBadge = useMemo(() => {
    if (latestHeaderProjectAssessment?.riskScore === undefined || latestHeaderProjectAssessment?.riskScore === null || !latestHeaderProjectAssessment?.generatedAt) return null;
    const generatedAt = new Date(latestHeaderProjectAssessment.generatedAt);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    if (generatedAt <= tenDaysAgo) return null;
    return latestHeaderProjectAssessment;
  }, [latestHeaderProjectAssessment]);

  const getProjectRiskBadgeColor = (score: number) => {
    if (score <= 25) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    if (score <= 50) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    if (score <= 75) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
  };
  const [isProjectHistoryOpen, setIsProjectHistoryOpen] = useState(false);
  const [isStatusReportOpen, setIsStatusReportOpen] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const csvImportInputRef = useRef<HTMLInputElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const deleteProjectMutation = useDeleteProject();
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
  const { currentOrganization, setCurrentOrganization, organizations } = useOrganization();
  const { user } = useAuth();
  const { data: customTabs = [] } = useCustomProjectTabs(currentOrganization?.id);
  const [, setLocation] = useLocation();

  const [projectListOpen, setProjectListOpen] = useState(false);
  const { data: allOrgProjects } = useProjects(currentOrganization?.id);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const currentPortfolio = portfolios?.find(p => p.id === project?.portfolioId);
  const sortedProjects = useMemo(() => {
    if (!allOrgProjects) return [];
    return [...allOrgProjects].sort((a, b) => a.name.localeCompare(b.name));
  }, [allOrgProjects]);
  const { prevProject, nextProject } = useMemo(() => {
    if (!allOrgProjects || allOrgProjects.length < 2) return { prevProject: null, nextProject: null };
    const sorted = [...allOrgProjects].sort((a, b) => a.name.localeCompare(b.name));
    const idx = sorted.findIndex(p => p.id === id);
    if (idx === -1) return { prevProject: null, nextProject: null };
    return {
      prevProject: idx > 0 ? sorted[idx - 1] : null,
      nextProject: idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [allOrgProjects, id]);

  useEffect(() => {
    if (!id || !currentOrganization?.id) return;
    try {
      const key = `project-visits-${currentOrganization.id}`;
      const raw = localStorage.getItem(key);
      const counts: Record<number, number> = raw ? JSON.parse(raw) : {};
      counts[id] = (counts[id] || 0) + 1;
      localStorage.setItem(key, JSON.stringify(counts));
    } catch {}
  }, [id, currentOrganization?.id]);

  // Read tab and item IDs from URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const urlTab = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(urlTab || 'summary');
  const [hasSetInitialTab, setHasSetInitialTab] = useState(false);
  const urlTaskId = urlParams.get('taskId');
  const urlIssueId = urlParams.get('issueId');
  const urlRiskId = urlParams.get('riskId');

  // Default tab order - main tabs first, then "More" tabs
  const defaultMainTabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'team', label: 'Team' },
    { id: 'risks', label: 'Risks' },
    { id: 'issues', label: 'Issues' },
    { id: 'financials', label: 'Financials' },
  ];
  
  const isModuleHidden = (moduleKey: string): boolean => {
    const sidebarStructure = currentOrganization?.sidebarStructure as Array<{ items: Array<{ type: string; key?: string; hidden?: boolean }> }> | null;
    if (sidebarStructure && Array.isArray(sidebarStructure)) {
      for (const group of sidebarStructure) {
        const item = group.items?.find(i => i.type === "module" && i.key === moduleKey);
        if (item) return item.hidden === true;
      }
    } else {
      const hiddenModules = (currentOrganization as Record<string, unknown>)?.hiddenModules as string[] | undefined;
      if (hiddenModules?.includes(moduleKey)) return true;
    }
    return false;
  };

  const moduleGatedTabs: Record<string, string> = {
    'daily-logs': 'daily-logs',
    'rfis': 'rfis',
    'submittals': 'submittals',
    'drawings': 'drawings',
    'punch-list': 'punch-list',
  };

  // Available tabs for pinning from the More menu
  const moreTabItems = [
    { id: 'scoring', label: 'Scoring' },
    { id: 'benefits', label: 'Benefits' },
    { id: 'decisions', label: 'Decisions' },
    { id: 'lessons-learned', label: 'Lessons Learned' },
    { id: 'change-requests', label: 'Change Requests' },
    { id: 'documents', label: 'Documents' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'status-report', label: 'Status Report' },
    { id: 'ai-agent', label: 'AI Agent' },
    { id: 'daily-logs', label: 'Daily Logs' },
    { id: 'rfis', label: 'RFIs' },
    { id: 'submittals', label: 'Submittals' },
    { id: 'drawings', label: 'Drawings' },
    { id: 'punch-list', label: 'Punch List' },
  ].filter(tab => {
    const moduleKey = moduleGatedTabs[tab.id];
    return !moduleKey || !isModuleHidden(moduleKey);
  });
  
  // All available tab IDs for ordering
  const allTabIds = [...defaultMainTabs.map(t => t.id), ...moreTabItems.map(t => t.id)];

  // Pinned tabs state - persisted in localStorage per project per user
  const getPinnedTabsKey = (projectId: number, userId: string) => `project-pinned-tabs-${userId}-${projectId}`;
  const getTabOrderKey = (projectId: number, userId: string) => `project-tab-order-${userId}-${projectId}`;
  
  const [pinnedTabs, setPinnedTabs] = useState<string[]>(() => {
    if (!project?.id || !user?.id) return [];
    try {
      const saved = localStorage.getItem(getPinnedTabsKey(project.id, user.id));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  // Tab order state - persisted in localStorage per project per user
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    if (!project?.id || !user?.id) return allTabIds;
    try {
      const saved = localStorage.getItem(getTabOrderKey(project.id, user.id));
      if (saved) {
        const savedOrder = JSON.parse(saved);
        // Merge with any new tabs that might have been added
        const newTabs = allTabIds.filter(id => !savedOrder.includes(id));
        return [...savedOrder, ...newTabs];
      }
      return allTabIds;
    } catch {
      return allTabIds;
    }
  });
  
  // Drag state for reordering
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  // Update pinned tabs and tab order when project or user changes
  // Also set the active tab to the first tab in the order (if no URL tab specified)
  useEffect(() => {
    if (project?.id && user?.id) {
      try {
        const savedPinned = localStorage.getItem(getPinnedTabsKey(project.id, user.id));
        setPinnedTabs(savedPinned ? JSON.parse(savedPinned) : []);
        
        const savedOrder = localStorage.getItem(getTabOrderKey(project.id, user.id));
        let newOrder = allTabIds;
        if (savedOrder) {
          const parsed = JSON.parse(savedOrder);
          const newTabs = allTabIds.filter(id => !parsed.includes(id));
          newOrder = [...parsed, ...newTabs];
        }
        setTabOrder(newOrder);
        
        // Set active tab to first tab in order (only on initial load, not URL-specified)
        if (!hasSetInitialTab && !urlTab) {
          const firstMainTab = newOrder.find(id => defaultMainTabs.some(t => t.id === id));
          if (firstMainTab) {
            setActiveTab(firstMainTab);
          }
          setHasSetInitialTab(true);
        }
      } catch {
        setPinnedTabs([]);
        setTabOrder(allTabIds);
      }
    }
  }, [project?.id, user?.id]);

  const togglePinTab = (tabId: string) => {
    if (!project?.id || !user?.id) return;
    setPinnedTabs(prev => {
      const newPinned = prev.includes(tabId) 
        ? prev.filter(t => t !== tabId) 
        : [...prev, tabId];
      localStorage.setItem(getPinnedTabsKey(project.id, user.id), JSON.stringify(newPinned));
      return newPinned;
    });
  };
  
  // Drag and drop handlers for tab reordering
  const handleTabDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  };
  
  const handleTabDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    if (draggedTab && draggedTab !== tabId) {
      setDragOverTab(tabId);
    }
  };
  
  const handleTabDragLeave = () => {
    setDragOverTab(null);
  };
  
  const handleTabDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (!draggedTab || !project?.id || !user?.id || draggedTab === targetTabId) {
      setDraggedTab(null);
      setDragOverTab(null);
      return;
    }
    
    setTabOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedTab);
      const targetIndex = newOrder.indexOf(targetTabId);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      // Remove dragged item and insert at target position
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedTab);
      
      // Save to localStorage
      localStorage.setItem(getTabOrderKey(project.id, user.id), JSON.stringify(newOrder));
      return newOrder;
    });
    
    setDraggedTab(null);
    setDragOverTab(null);
  };
  
  const handleTabDragEnd = () => {
    setDraggedTab(null);
    setDragOverTab(null);
  };
  
  // Get ordered main tabs based on user's custom order
  const orderedMainTabs = useMemo(() => {
    const mainTabIds = defaultMainTabs.map(t => t.id);
    return tabOrder
      .filter(id => mainTabIds.includes(id))
      .map(id => defaultMainTabs.find(t => t.id === id)!)
      .filter(Boolean);
  }, [tabOrder]);
  
  // Get ordered pinned tabs based on user's custom order
  const orderedPinnedTabs = useMemo(() => {
    return tabOrder
      .filter(id => pinnedTabs.includes(id) && moreTabItems.some(t => t.id === id))
      .map(id => moreTabItems.find(t => t.id === id)!)
      .filter(Boolean);
  }, [tabOrder, pinnedTabs]);

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
    const leafTasks = projectTasks.filter(t => !t.isSummary && !t.isMilestone);
    if (leafTasks.length === 0) {
      return project?.completionPercentage || 0;
    }
    const totalProgress = leafTasks.reduce((sum, t) => sum + (t.progress || 0), 0);
    return Math.round(totalProgress / leafTasks.length);
  }, [projectTasks, project?.completionPercentage]);

  const autoSwitchedForProjectRef = useRef<number | null>(null);
  const lastProjectIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!project || !organizations.length) return;
    if (project.id !== lastProjectIdRef.current) {
      lastProjectIdRef.current = project.id;
      autoSwitchedForProjectRef.current = null;
    }
    if (currentOrganization && project.organizationId === currentOrganization.id) return;
    if (autoSwitchedForProjectRef.current === project.id) return;
    const targetOrg = organizations.find(o => o.id === project.organizationId);
    if (targetOrg) {
      autoSwitchedForProjectRef.current = project.id;
      setCurrentOrganization(targetOrg);
    }
  }, [project, organizations, currentOrganization, setCurrentOrganization]);

  if (isLoading) return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!project) return <div className="flex h-96 items-center justify-center text-muted-foreground">Project not found</div>;
  
  // If project belongs to a different org: either switching (brief spinner) or no access
  if (currentOrganization && project.organizationId !== currentOrganization.id) {
    const orgLoaded = organizations.length > 0;
    const hasAccess = organizations.some(o => o.id === project.organizationId);
    if (orgLoaded && !hasAccess) {
      return <div className="flex h-96 items-center justify-center text-muted-foreground">You do not have access to this project.</div>;
    }
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  // Check if project is in locked (terminal) state
  const isProjectLocked = isProjectStatusLocked(project.status);

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !project) return;

    setIsImportingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/projects/${project.id}/import-csv`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: data.message || "Failed to import CSV", variant: "destructive" });
      } else {
        toast({ title: "Import successful", description: data.message });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id, 'tasks'] });
      }
    } catch (err) {
      toast({ title: "Import failed", description: "An error occurred while importing the CSV file", variant: "destructive" });
    } finally {
      setIsImportingCsv(false);
      if (csvImportInputRef.current) {
        csvImportInputRef.current.value = '';
      }
    }
  };

  const handleExportPng = async () => {
    if (!project) return;
    setIsExportingPng(true);
    try {
      const previousTab = activeTab;
      let needsTabSwitch = false;

      let targetEl = document.querySelector('[data-gantt-export="true"]') as HTMLElement | null
        || document.querySelector('[data-schedule-export="true"]') as HTMLElement | null;

      if (!targetEl) {
        needsTabSwitch = true;
        setActiveTab('tasks');
        await new Promise<void>((resolve) => {
          const maxAttempts = 50;
          let attempts = 0;
          const check = () => {
            attempts++;
            const el = document.querySelector('[data-gantt-export="true"]') as HTMLElement | null
              || document.querySelector('[data-schedule-export="true"]') as HTMLElement | null;
            if (el) {
              targetEl = el;
              resolve();
            } else if (attempts < maxAttempts) {
              requestAnimationFrame(check);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(check);
        });
      }

      if (!targetEl) {
        toast({ title: "Export failed", description: "Could not find the schedule view to export", variant: "destructive" });
        return;
      }

      window.dispatchEvent(new Event('gantt-export-start'));
      await new Promise(r => setTimeout(r, 100));

      const savedStyles: { el: HTMLElement; props: Record<string, string> }[] = [];
      const removedClasses: { el: HTMLElement; cls: string }[] = [];
      const expandForExport = () => {
        const card = targetEl!;
        const panels = card.querySelectorAll<HTMLElement>('[data-panel]');
        const panelGroup = card.querySelector<HTMLElement>('[data-panel-group]');
        const resizeHandles = card.querySelectorAll<HTMLElement>('[data-resize-handle-active],.resize-handle,[data-panel-resize-handle-id]');
        const scrollContainers = card.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-hidden, .overflow-y-auto, .overflow-hidden');
        const truncated = card.querySelectorAll<HTMLElement>('.truncate');

        if (panelGroup) {
          savedStyles.push({ el: panelGroup, props: { height: panelGroup.style.height, maxHeight: panelGroup.style.maxHeight, overflow: panelGroup.style.overflow, display: panelGroup.style.display, width: panelGroup.style.width, maxWidth: panelGroup.style.maxWidth } });
          panelGroup.style.height = 'auto';
          panelGroup.style.maxHeight = 'none';
          panelGroup.style.overflow = 'visible';
          panelGroup.style.display = 'flex';
          panelGroup.style.width = 'max-content';
          panelGroup.style.maxWidth = 'none';
          ['h-[500px]', 'flex-1'].forEach(cls => {
            if (panelGroup.classList.contains(cls)) {
              removedClasses.push({ el: panelGroup, cls });
              panelGroup.classList.remove(cls);
            }
          });
        }

        resizeHandles.forEach(handle => {
          savedStyles.push({ el: handle, props: { display: handle.style.display } });
          handle.style.display = 'none';
        });

        panels.forEach((panel, panelIndex) => {
          savedStyles.push({ el: panel, props: { overflow: panel.style.overflow, flex: panel.style.flex, minWidth: panel.style.minWidth, width: panel.style.width, maxWidth: panel.style.maxWidth, height: panel.style.height } });
          panel.style.overflow = 'visible';
          panel.style.flex = 'none';
          panel.style.height = 'auto';
          panel.style.maxWidth = 'none';
          const innerContent = panel.querySelector<HTMLElement>('[style*="min-width"]');
          if (innerContent) {
            const currentMinW = parseInt(innerContent.style.minWidth) || innerContent.scrollWidth;
            const isTimelinePanel = panelIndex > 0 || (!panel.querySelector('input[data-testid="input-new-task"]') && innerContent.style.minWidth);
            const exportWidth = isTimelinePanel ? Math.max(currentMinW, currentMinW * 2.5) : currentMinW;
            const minW = `${exportWidth}px`;
            savedStyles.push({ el: innerContent, props: { minWidth: innerContent.style.minWidth, width: innerContent.style.width } });
            innerContent.style.minWidth = minW;
            innerContent.style.width = minW;
            panel.style.width = minW;
            panel.style.minWidth = minW;
          } else {
            panel.style.width = 'max-content';
            panel.style.minWidth = 'max-content';
          }
        });

        scrollContainers.forEach(el => {
          const isGanttBar = el.classList.contains('absolute') && el.classList.contains('rounded-sm');
          if (isGanttBar) return;
          savedStyles.push({ el, props: { overflow: el.style.overflow, overflowX: el.style.overflowX, overflowY: el.style.overflowY, height: el.style.height, maxHeight: el.style.maxHeight, width: el.style.width, maxWidth: el.style.maxWidth } });
          el.style.overflow = 'visible';
          el.style.overflowX = 'visible';
          el.style.overflowY = 'visible';
          el.style.height = 'auto';
          el.style.maxHeight = 'none';
          el.style.maxWidth = 'none';
          if (el.scrollWidth > el.clientWidth) {
            el.style.width = `${el.scrollWidth}px`;
          }
        });

        truncated.forEach(el => {
          savedStyles.push({ el, props: { overflow: el.style.overflow, textOverflow: el.style.textOverflow, whiteSpace: el.style.whiteSpace } });
          el.style.overflow = 'visible';
          el.style.textOverflow = 'unset';
          el.style.whiteSpace = 'nowrap';
        });

        savedStyles.push({ el: card, props: { width: card.style.width, maxWidth: card.style.maxWidth, overflow: card.style.overflow, height: card.style.height, maxHeight: card.style.maxHeight, position: card.style.position } });
        card.style.width = 'max-content';
        card.style.maxWidth = 'none';
        card.style.overflow = 'visible';
        card.style.height = 'auto';
        card.style.maxHeight = 'none';

        const allFixedHeightEls = card.querySelectorAll<HTMLElement>('.h-full');
        allFixedHeightEls.forEach(el => {
          const isBarFill = el.closest('[class*="absolute"][class*="rounded-sm"]');
          const isInlineDecorative = el.closest('[class*="absolute"][style*="height"]');
          if (isBarFill || isInlineDecorative) return;
          savedStyles.push({ el, props: { height: el.style.height } });
          el.style.height = 'auto';
        });

        const allElements = card.querySelectorAll<HTMLElement>('*');
        allElements.forEach(el => {
          const cls = el.className;
          if (typeof cls !== 'string') return;
          const hasColorClass = /\b(bg-|text-|border-)(emerald|blue|slate|red|purple|amber|muted|primary|green|yellow|orange|rose|destructive|foreground|gray|zinc|neutral|stone|cyan|teal|indigo|violet|pink|fuchsia|lime|sky)\b/.test(cls);
          if (!hasColorClass) return;
          const computed = window.getComputedStyle(el);
          savedStyles.push({ el, props: { 
            backgroundColor: el.style.backgroundColor, 
            borderColor: el.style.borderColor, 
            color: el.style.color,
            opacity: el.style.opacity,
          }});
          if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            el.style.backgroundColor = computed.backgroundColor;
          }
          if (computed.borderColor) {
            el.style.borderColor = computed.borderColor;
          }
          if (computed.color) {
            el.style.color = computed.color;
          }
          if (computed.opacity) {
            el.style.opacity = computed.opacity;
          }
        });
      };

      const restoreAfterExport = () => {
        savedStyles.forEach(({ el, props }) => {
          Object.entries(props).forEach(([key, value]) => {
            (el.style as any)[key] = value;
          });
        });
        removedClasses.forEach(({ el, cls }) => {
          el.classList.add(cls);
        });
      };

      expandForExport();
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 50));

      let dataUrl: string;
      try {
        dataUrl = await toPng(targetEl, {
          backgroundColor: '#ffffff',
          pixelRatio: 2,
          filter: (node: HTMLElement) => {
            if (node.dataset?.scheduleToolbar === 'true') return false;
            if (node.dataset?.ganttToolbar === 'true') return false;
            if (node.dataset?.testid === 'button-tasks-fullscreen') return false;
            if (node.dataset?.addTaskRow === 'true') return false;
            return true;
          },
        });
      } finally {
        restoreAfterExport();
      }

      if (needsTabSwitch) {
        setActiveTab(previousTab);
      }

      const link = document.createElement('a');
      link.download = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_schedule.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Export complete", description: "Schedule exported as PNG image" });
    } catch (err) {
      console.error('PNG export failed:', err);
      toast({ title: "Export failed", description: "An error occurred while generating the PNG image", variant: "destructive" });
    } finally {
      window.dispatchEvent(new Event('gantt-export-end'));
      setIsExportingPng(false);
    }
  };

  const handleExportExcel = async () => {
    if (!project || !projectTasks) return;
    try {
      const ganttEl = document.querySelector('[data-gantt-export="true"]');
      let activeColumns: GanttColumn[] = [];
      if (ganttEl) {
        const headerCells = ganttEl.querySelectorAll<HTMLElement>('[data-column-id]');
        headerCells.forEach(cell => {
          const colId = cell.getAttribute('data-column-id') as GanttColumn;
          if (colId) activeColumns.push(colId);
        });
      }
      if (activeColumns.length === 0) {
        activeColumns = ['taskIndex', 'wbs', 'task', 'startDate', 'endDate', 'durationDays', 'progress', 'estimatedHours', 'resources'];
      }

      const columnConfigs = activeColumns
        .map(colId => GANTT_COLUMNS.find(c => c.id === colId))
        .filter(Boolean) as typeof GANTT_COLUMNS;

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'FridayReport';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('Schedule');

      const totalCols = columnConfigs.length;
      const exportDate = format(new Date(), 'MMMM d, yyyy');

      const titleRow = sheet.addRow([project.name || 'Project Schedule']);
      titleRow.font = { size: 16, bold: true, color: { argb: 'FF1A1A2E' } };
      titleRow.height = 30;
      sheet.mergeCells(1, 1, 1, totalCols);
      titleRow.getCell(1).alignment = { vertical: 'middle' };

      const overallProgress = project.completionPercentage || 0;
      const subRow = sheet.addRow([`Overall Progress: ${overallProgress}%   |   Export Date: ${exportDate}   |   Status: ${project.status || 'N/A'}`]);
      subRow.font = { size: 11, color: { argb: 'FF555555' } };
      subRow.height = 22;
      sheet.mergeCells(2, 1, 2, totalCols);
      subRow.getCell(1).alignment = { vertical: 'middle' };

      sheet.addRow([]);

      const headerValues = columnConfigs.map(col => col.label);
      const headerRow = sheet.addRow(headerValues);
      headerRow.height = 24;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1D4ED8' } },
          bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } },
          left: { style: 'thin', color: { argb: 'FF1D4ED8' } },
          right: { style: 'thin', color: { argb: 'FF1D4ED8' } },
        };
      });

      const taskResourceMap = new Map<number, string>();
      if (projectTaskAssignments) {
        for (const assignment of projectTaskAssignments) {
          const existing = taskResourceMap.get(assignment.taskId);
          const name = assignment.resource?.displayName || '';
          if (name) {
            taskResourceMap.set(assignment.taskId, existing ? `${existing}, ${name}` : name);
          }
        }
      }

      const getTaskValue = (task: Task, colId: GanttColumn, index: number): string | number => {
        switch (colId) {
          case 'taskIndex': return index + 1;
          case 'wbs': return task.wbs || '';
          case 'task': return task.name || '';
          case 'taskNumber': return task.taskNumber || '';
          case 'outlineLevel': return task.outlineLevel || '';
          case 'description': return task.description || '';
          case 'startDate': return task.startDate || '';
          case 'endDate': return task.endDate || '';
          case 'baselineStartDate': return task.baselineStartDate || '';
          case 'baselineEndDate': return task.baselineEndDate || '';
          case 'actualStartDate': return task.actualStartDate || '';
          case 'actualEndDate': return task.actualEndDate || '';
          case 'durationDays': return task.durationDays != null ? formatDuration(task.durationDays) : '';
          case 'progress': return task.progress != null ? task.progress : '';
          case 'status': return task.status || '';
          case 'priority': return task.priority || '';
          case 'taskType': return task.taskType || '';
          case 'estimatedHours': return task.estimatedHours != null ? task.estimatedHours : '';
          case 'actualHours': return task.actualHours != null ? task.actualHours : '';
          case 'remainingHours': return task.remainingHours != null ? task.remainingHours : '';
          case 'cost': return task.cost != null ? task.cost : '';
          case 'actualCost': return task.actualCost != null ? task.actualCost : '';
          case 'resources': return taskResourceMap.get(task.id) || '';
          case 'assignee': return task.assignee || '';
          case 'constraintType': return task.constraintType || '';
          case 'constraintDate': return task.constraintDate || '';
          case 'isMilestone': return task.isMilestone ? 'Yes' : 'No';
          case 'isCritical': return task.isCritical ? 'Yes' : 'No';
          case 'isSummary': return task.isSummary ? 'Yes' : 'No';
          case 'timesheetBlocked': return task.timesheetBlocked ? 'Yes' : 'No';
          case 'phase': return task.phase || '';
          case 'category': return task.category || '';
          case 'labels': return task.labels || '';
          case 'notes': return task.notes || '';
          default: return '';
        }
      };

      const getProgressColor = (progress: number): string => {
        if (progress >= 100) return 'FF16A34A';
        if (progress >= 50) return 'FF2563EB';
        if (progress > 0) return 'FFF59E0B';
        return 'FF94A3B8';
      };

      const getStatusColor = (status: string): string => {
        switch (status) {
          case 'Completed': return 'FFDCFCE7';
          case 'In Progress': return 'FFDBEAFE';
          case 'Not Started': return 'FFF1F5F9';
          case 'On Hold': return 'FFFEF3C7';
          case 'Cancelled': return 'FFFEE2E2';
          default: return 'FFFFFFFF';
        }
      };

      projectTasks.forEach((task, index) => {
        const rowValues = columnConfigs.map(col => getTaskValue(task, col.id, index));
        const dataRow = sheet.addRow(rowValues);
        dataRow.height = 20;

        const isEvenRow = index % 2 === 0;
        dataRow.eachCell((cell, colNumber) => {
          const colConfig = columnConfigs[colNumber - 1];
          cell.font = { size: 10 };
          cell.alignment = { vertical: 'middle', wrapText: false };
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };

          if (colConfig?.id === 'progress' && typeof cell.value === 'number') {
            cell.font = { size: 10, bold: true, color: { argb: getProgressColor(cell.value as number) } };
            cell.value = `${cell.value}%`;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (colConfig?.id === 'status') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: getStatusColor(String(cell.value)) } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (colConfig?.id === 'taskIndex') {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (isEvenRow) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }

          if (colConfig?.id === 'task' && task.outlineLevel && task.outlineLevel > 1) {
            const indent = '  '.repeat(task.outlineLevel - 1);
            cell.value = `${indent}${cell.value}`;
          }
        });
      });

      columnConfigs.forEach((col, i) => {
        const colNum = i + 1;
        let width: number;
        switch (col.id) {
          case 'taskIndex': width = 6; break;
          case 'wbs': width = 10; break;
          case 'task': width = 35; break;
          case 'description': width = 30; break;
          case 'notes': width = 30; break;
          case 'resources': width = 20; break;
          case 'assignee': width = 18; break;
          default: width = 14; break;
        }
        sheet.getColumn(colNum).width = width;
      });

      sheet.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: 4, column: totalCols },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${(project.name || 'project').replace(/[^a-zA-Z0-9]/g, '_')}_schedule.xlsx`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Schedule exported as Excel file" });
    } catch (err) {
      console.error('Excel export failed:', err);
      toast({ title: "Export failed", description: "An error occurred while generating the Excel file", variant: "destructive" });
    }
  };

  const handleStatusChange = (status: string) => {
    // If trying to lock the project, show confirmation
    if (status === "Closed" && !isProjectLocked) {
      const confirmed = window.confirm(
        "Are you sure you want to close this project?\n\n" +
        "This will:\n" +
        "• Lock the project from all edits\n" +
        "• Remove it from Active Projects listings\n" +
        "• Archive it for historical reference\n\n" +
        "You can reopen the project later if needed."
      );
      if (!confirmed) return;
    }
    
    // If project is locked and trying to reopen (change to anything other than Closed)
    if (isProjectLocked && status !== "Closed") {
      const confirmed = window.confirm(
        `Are you sure you want to reopen this project?\n\n` +
        `This will:\n` +
        `• Set the status to "${status}"\n` +
        `• Unlock the project for editing\n` +
        `• Return it to Active Projects listings\n\n` +
        `The project will become editable again.`
      );
      if (!confirmed) return;
    }
    
    updateProject({ id: project.id, status }, {
      onSuccess: () => {
        if (status === "Closed") {
          toast({ 
            title: "Project Closed & Locked", 
            description: "This project is now archived and protected from changes."
          });
        } else if (isProjectLocked) {
          toast({ 
            title: "Project Reopened", 
            description: `Project has been unlocked and status set to ${status}.`
          });
        } else {
          toast({ title: "Status Updated", description: `Project status changed to ${status}` });
        }
      }
    });
  };

  const handleHealthChange = (health: string) => {
    updateProject({ id: project.id, health }, {
      onSuccess: () => toast({ title: "Health Updated", description: `Project health changed to ${health}` })
    });
  };

  return (
    <div className="flex -ml-4 -mr-4 md:-ml-8 md:-mr-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 h-[calc(100vh-64px)] overflow-hidden">
      <div
        className={cn(
          "flex-shrink-0 border-r border-border bg-muted/30 transition-all duration-300 ease-in-out overflow-hidden",
          projectListOpen ? "w-64" : "w-0"
        )}
      >
        <div className="w-64 h-full flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">Projects</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setProjectListOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1" ref={sidebarScrollRef}>
            <div className="py-1">
              {sortedProjects.map(p => {
                const isCurrent = p.id === id;
                const healthDot = p.health === 'Green' ? 'bg-emerald-500' : p.health === 'Yellow' ? 'bg-amber-500' : 'bg-rose-500';
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 cursor-pointer text-sm transition-colors",
                      isCurrent ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
                    )}
                    onClick={() => setLocation(`/projects/${p.id}`)}
                    data-testid={`sidebar-project-${p.id}`}
                  >
                    <div className={cn("h-2 w-2 rounded-full flex-shrink-0", healthDot)} />
                    <span className="truncate">{p.name}</span>
                    {isCurrent && <ChevronRight className="h-3 w-3 ml-auto flex-shrink-0 text-primary" />}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div ref={mainContentRef} className="flex-1 min-w-0 overflow-y-auto">
        <div className="px-4 py-4 md:px-8 md:py-8 space-y-8">
      {/* Header */}
      <div>
        {sortedProjects.length > 1 && (
          <div className="flex items-center gap-1 mb-1 -mt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground"
                  onClick={() => setProjectListOpen(!projectListOpen)}
                  data-testid="button-project-list-sidebar"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{projectListOpen ? 'Hide Projects' : 'Browse Projects'}</TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground/40 text-[11px]">|</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 gap-0.5 text-[11px] text-muted-foreground"
                  disabled={!prevProject}
                  onClick={() => prevProject && setLocation(`/projects/${prevProject.id}`)}
                  data-testid="button-prev-project"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Prev
                </Button>
              </TooltipTrigger>
              {prevProject && <TooltipContent>{prevProject.name}</TooltipContent>}
            </Tooltip>
            <span className="text-muted-foreground/40 text-[11px]">|</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 gap-0.5 text-[11px] text-muted-foreground"
                  disabled={!nextProject}
                  onClick={() => nextProject && setLocation(`/projects/${nextProject.id}`)}
                  data-testid="button-next-project"
                >
                  Next
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              {nextProject && <TooltipContent>{nextProject.name}</TooltipContent>}
            </Tooltip>
          </div>
        )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 max-w-full lg:max-w-[60%]">
          {currentPortfolio && (
            <Breadcrumb className="mb-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={`/portfolios/${currentPortfolio.id}`} data-testid="breadcrumb-portfolio">
                      {currentPortfolio.name}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{project.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-display font-bold text-foreground truncate max-w-full" title={project.name}>{project.name}</h1>
            <Badge className={cn(
              "text-sm px-3 py-1",
              project.health === 'Green' ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" :
              project.health === 'Yellow' ? "bg-amber-100 text-amber-800 hover:bg-amber-100" :
              "bg-rose-100 text-rose-800 hover:bg-rose-100"
            )}>
              {project.health} Health
            </Badge>
            {headerProjectRiskBadge && (
              <Badge
                variant="secondary"
                className={`gap-1 shrink-0 ${getProjectRiskBadgeColor(headerProjectRiskBadge.riskScore)}`}
                data-testid="badge-project-risk-score"
                title={headerProjectRiskBadge.summary}
              >
                <Shield className="h-3 w-3" />
                Risk Score: {headerProjectRiskBadge.riskScore}
              </Badge>
            )}
            {isProjectLocked && (
              <>
                <Badge className="text-sm px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900 gap-1">
                  <LockIcon className="h-3 w-3" />
                  Locked
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange("Billing")}
                  className="h-7 text-xs gap-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  data-testid="button-reopen-project"
                >
                  <LockOpen className="h-3 w-3" />
                  Reopen Project
                </Button>
              </>
            )}
            {/* Planner Badge */}
            {project.source === "planner" && project.plannerPlanId && (
              <button
                type="button"
                onClick={() => window.open(`https://planner.cloud.microsoft/webui/plan/${project.plannerPlanId}/view/board`, '_blank')}
                className="flex items-center gap-1.5 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
                title="Synced from Microsoft Planner - Click to open in Planner"
                data-testid="planner-badge-header"
              >
                <img src={plannerLogoPath} alt="Planner" className="h-4 w-4" />
                <Cloud className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Planner</span>
                <ExternalLink className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
              </button>
            )}
            {/* Planner Premium Badge */}
            {(project.source === "planner-premium" || project.source === "planner_premium") && project.plannerPlanId && (
              <button
                type="button"
                onClick={() => {
                  const tenantId = project.dataverseTenantId || '';
                  const planId = project.plannerPlanId;
                  const premiumUrl = tenantId 
                    ? `https://planner.cloud.microsoft/${tenantId}/en-US/Home/Planner/#/plantaskboard?planId=${planId}`
                    : `https://planner.cloud.microsoft/webui/plan/${planId}/view/board`;
                  window.open(premiumUrl, '_blank');
                }}
                className="flex items-center gap-1.5 px-2 py-1 bg-purple-100 dark:bg-purple-900/50 rounded-md hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors"
                title="Synced from Planner Premium - Click to open in Planner"
                data-testid="planner-premium-badge-header"
              >
                <img src={plannerLogoPath} alt="Planner Premium" className="h-4 w-4" />
                <Crown className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Planner Premium</span>
                <ExternalLink className="h-3 w-3 text-purple-600 dark:text-purple-400" />
              </button>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-muted-foreground">{project.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" data-testid="button-project-menu">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Project Options</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="menu-health">
                  <div className={cn("h-2 w-2 rounded-full mr-2", (project.health || 'Green') === 'Green' ? 'bg-emerald-500' : project.health === 'Yellow' ? 'bg-amber-500' : 'bg-rose-500')} />
                  Health: {project.health || 'Green'}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleHealthChange('Green')} data-testid="menu-health-green">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 mr-2" /> Green
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleHealthChange('Yellow')} data-testid="menu-health-yellow">
                    <div className="h-2 w-2 rounded-full bg-amber-500 mr-2" /> Yellow
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleHealthChange('Red')} data-testid="menu-health-red">
                    <div className="h-2 w-2 rounded-full bg-rose-500 mr-2" /> Red
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setIsStatusReportOpen(true)}
                data-testid="menu-status-report"
              >
                <ClipboardList className="h-4 w-4 mr-2" />
                Status Report
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsProjectHistoryOpen(true)}
                data-testid="menu-project-history"
              >
                <History className="h-4 w-4 mr-2" />
                View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="menu-export-import">
                  <ArrowDownUp className="h-4 w-4 mr-2" />
                  Export / Import
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem 
                    onClick={() => window.open(`/api/projects/${project.id}/export?format=csv`, '_blank')}
                    data-testid="menu-download-csv"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Download as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleExportExcel}
                    data-testid="menu-export-excel"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => window.open(`/api/projects/${project.id}/export?format=mspdi`, '_blank')}
                    data-testid="menu-download-mspdi"
                  >
                    <GanttChart className="h-4 w-4 mr-2" />
                    Download as MS Project XML
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleExportPng}
                    disabled={isExportingPng}
                    data-testid="menu-download-png"
                  >
                    {isExportingPng ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImageDown className="h-4 w-4 mr-2" />}
                    {isExportingPng ? 'Exporting...' : 'Download Schedule as PNG'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => csvImportInputRef.current?.click()}
                    disabled={isImportingCsv}
                    data-testid="menu-import-csv"
                  >
                    {isImportingCsv ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isImportingCsv ? 'Importing...' : 'Import from CSV'}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="text-destructive focus:text-destructive"
                data-testid="menu-delete-project"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={csvImportInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvImport}
          />
        </div>
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
        onMilestoneClick={(taskId) => {
          setActiveTab('tasks');
          window.history.replaceState(null, '', `?tab=tasks&taskId=${taskId}`);
          window.dispatchEvent(new CustomEvent('openTaskDialog', { detail: { taskId } }));
        }}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/80 border border-border p-1.5 rounded-xl gap-1 h-auto flex-wrap">
          {/* Render main tabs in user-defined order with drag-drop support */}
          {orderedMainTabs.map(tab => (
            <TabsTrigger 
              key={tab.id}
              value={tab.id} 
              className={cn(
                "rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md cursor-grab active:cursor-grabbing transition-all",
                draggedTab === tab.id && "opacity-50",
                dragOverTab === tab.id && "ring-2 ring-primary ring-offset-1"
              )}
              data-testid={`tab-${tab.id}`}
              draggable
              onDragStart={(e) => handleTabDragStart(e, tab.id)}
              onDragOver={(e) => handleTabDragOver(e, tab.id)}
              onDragLeave={handleTabDragLeave}
              onDrop={(e) => handleTabDrop(e, tab.id)}
              onDragEnd={handleTabDragEnd}
            >
              {tab.label}
            </TabsTrigger>
          ))}
          
          {/* Render pinned tabs as visible TabsTriggers with drag-drop support */}
          {orderedPinnedTabs.map(item => (
            <div 
              key={item.id} 
              className={cn(
                "flex items-center gap-0.5 transition-all",
                dragOverTab === item.id && "ring-2 ring-primary ring-offset-1 rounded-lg"
              )}
              draggable
              onDragStart={(e) => handleTabDragStart(e, item.id)}
              onDragOver={(e) => handleTabDragOver(e, item.id)}
              onDragLeave={handleTabDragLeave}
              onDrop={(e) => handleTabDrop(e, item.id)}
              onDragEnd={handleTabDragEnd}
            >
              <TabsTrigger 
                value={item.id} 
                className={cn(
                  "rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md cursor-grab active:cursor-grabbing",
                  draggedTab === item.id && "opacity-50"
                )}
                data-testid={`tab-pinned-${item.id}`}
              >
                {item.label}
              </TabsTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinTab(item.id);
                }}
                data-testid={`button-unpin-${item.id}`}
              >
                <PinOff className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
          
          {/* Render pinned custom tabs */}
          {customTabs.filter(tab => pinnedTabs.includes(`custom-${tab.id}`)).map(tab => (
            <div key={tab.id} className="flex items-center gap-0.5">
              <TabsTrigger 
                value={`custom-${tab.id}`} 
                className="rounded-lg px-4 py-2 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md" 
                data-testid={`tab-pinned-custom-${tab.id}`}
              >
                {tab.name}
              </TabsTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-md"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinTab(`custom-${tab.id}`);
                }}
                data-testid={`button-unpin-custom-${tab.id}`}
              >
                <PinOff className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant={['change-requests', 'documents', 'invoices', 'status-report', 'scoring', 'benefits', 'decisions', 'lessons-learned', 'ai-agent', ...customTabs.map(t => `custom-${t.id}`)].filter(t => !pinnedTabs.includes(t)).includes(activeTab) ? 'default' : 'ghost'} 
                size="sm" 
                className="rounded-lg px-4 py-2 font-medium gap-1"
                data-testid="button-more-tabs"
              >
                {!pinnedTabs.includes(activeTab) && activeTab === 'change-requests' ? 'Change Requests' : 
                 !pinnedTabs.includes(activeTab) && activeTab === 'documents' ? 'Documents' : 
                 !pinnedTabs.includes(activeTab) && activeTab === 'invoices' ? 'Invoices' :
                 !pinnedTabs.includes(activeTab) && activeTab === 'status-report' ? 'Status Report' :
                 !pinnedTabs.includes(activeTab) && activeTab === 'scoring' ? 'Scoring' :
                 !pinnedTabs.includes(activeTab) && activeTab === 'benefits' ? 'Benefits' :
                 !pinnedTabs.includes(activeTab) && activeTab === 'decisions' ? 'Decisions' :
                 !pinnedTabs.includes(activeTab) && activeTab === 'ai-agent' ? 'AI Agent' :
                 !pinnedTabs.includes(activeTab) && activeTab === 'daily-logs' ? 'Daily Logs' :
                 !pinnedTabs.includes(activeTab) && activeTab === 'lessons-learned' ? 'Lessons Learned' :
                 activeTab.startsWith('custom-') && !pinnedTabs.includes(activeTab) ? customTabs.find(t => `custom-${t.id}` === activeTab)?.name :
                 'More'}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              {moreTabItems.filter(item => !pinnedTabs.includes(item.id)).map(item => (
                <DropdownMenuItem 
                  key={item.id} 
                  className="flex items-center justify-between gap-2"
                  data-testid={`menu-tab-${item.id}`}
                >
                  <span onClick={() => setActiveTab(item.id)} className="flex-1 cursor-pointer">
                    {item.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinTab(item.id);
                    }}
                    data-testid={`button-pin-${item.id}`}
                  >
                    <Pin className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
              {customTabs.filter(tab => !pinnedTabs.includes(`custom-${tab.id}`)).map((tab) => (
                <DropdownMenuItem 
                  key={tab.id} 
                  className="flex items-center justify-between gap-2"
                  data-testid={`menu-tab-custom-${tab.id}`}
                >
                  <span onClick={() => setActiveTab(`custom-${tab.id}`)} className="flex-1 cursor-pointer">
                    {tab.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinTab(`custom-${tab.id}`);
                    }}
                    data-testid={`button-pin-custom-${tab.id}`}
                  >
                    <Pin className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="summary">
            <ProjectSummaryTab project={project} onUpdate={updateProject} tasks={projectTasks || []} readOnly={isProjectLocked} />
          </TabsContent>
          <TabsContent value="tasks" className="relative">
            <TasksTab projectId={project.id} projectName={project.name} projectStartDate={project.startDate} projectEndDate={project.endDate} projectSource={project.source} plannerPlanId={project.plannerPlanId} sourceFileName={project.sourceFileName} sourceFileUrl={project.sourceFileUrl} dataverseOrgId={project.dataverseOrgId} dataverseTenantId={project.dataverseTenantId} urlTaskId={urlTaskId} readOnly={isProjectLocked} projectUpdatedAt={project.updatedAt} />
          </TabsContent>
          <TabsContent value="risks">
            <RisksTab projectId={project.id} projectName={project.name} portfolioId={project.portfolioId} urlRiskId={urlRiskId} readOnly={isProjectLocked} />
          </TabsContent>
          <TabsContent value="issues">
            <IssuesTab projectId={project.id} projectName={project.name} portfolioId={project.portfolioId} urlIssueId={urlIssueId} readOnly={isProjectLocked} />
          </TabsContent>
          <TabsContent value="financials">
            <FinancialsTab projectId={project.id} readOnly={isProjectLocked} />
          </TabsContent>
          <TabsContent value="team">
            <ProjectTeamTab 
              projectId={project.id} 
              organizationId={project.organizationId} 
              projectTaskAssignments={projectTaskAssignments || []} 
              projectName={project.name}
              readOnly={isProjectLocked}
            />
          </TabsContent>
          <TabsContent value="scoring">
            {project.organizationId && <ScoringTab projectId={project.id} organizationId={project.organizationId} />}
          </TabsContent>
          <TabsContent value="benefits">
            <BenefitsTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="decisions">
            <DecisionsTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="lessons-learned">
            {project.organizationId && <LessonsLearnedTab projectId={project.id} organizationId={project.organizationId} />}
          </TabsContent>
          <TabsContent value="change-requests">
            <ChangeRequestsTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab projectId={project.id} />
          </TabsContent>
          <TabsContent value="invoices">
            <InvoicesTab projectId={project.id} organizationId={project.organizationId} contractTotal={project.contractTotal} />
          </TabsContent>
          <TabsContent value="status-report">
            <StatusReportTab 
              project={project}
              risks={projectRisks || []}
              issues={projectIssues || []}
              financials={financials || []}
              tasks={projectTasks || []}
              changeRequests={projectChangeRequests || []}
              documents={projectDocuments || []}
            />
          </TabsContent>
          <TabsContent value="ai-agent">
            <ProjectAgentTab projectId={project.id} />
          </TabsContent>
          {!isModuleHidden('daily-logs') && (
            <TabsContent value="daily-logs">
              <DailyLogsTab projectId={project.id} />
            </TabsContent>
          )}
          {!isModuleHidden('rfis') && (
            <TabsContent value="rfis">
              <RFIsTab projectId={project.id} />
            </TabsContent>
          )}
          {!isModuleHidden('submittals') && (
            <TabsContent value="submittals">
              <SubmittalsTab projectId={project.id} />
            </TabsContent>
          )}
          {!isModuleHidden('drawings') && (
            <TabsContent value="drawings">
              <DrawingsTab projectId={project.id} />
            </TabsContent>
          )}
          {!isModuleHidden('punch-list') && (
            <TabsContent value="punch-list">
              <PunchListTab projectId={project.id} />
            </TabsContent>
          )}
          {customTabs.map((tab) => (
            <TabsContent key={tab.id} value={`custom-${tab.id}`}>
              <CustomTabRenderer tabId={tab.id} project={project} onUpdate={updateProject} />
            </TabsContent>
          ))}
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
        financials={financials || []}
        tasks={projectTasks || []}
        changeRequests={projectChangeRequests || []}
        documents={projectDocuments || []}
      />

      <AICreateButton projectId={project.id} projectName={project.name} variant="fab" />

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{project.name}</strong>? This action cannot be undone. All tasks, risks, issues, and other data associated with this project will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteProjectMutation.isPending}
              onClick={() => {
                deleteProjectMutation.mutate(project.id, {
                  onSuccess: () => {
                    setIsDeleteConfirmOpen(false);
                    toast({ title: "Project deleted", description: `"${project.name}" has been deleted.` });
                    setLocation('/');
                  },
                  onError: () => {
                    toast({ title: "Error", description: "Failed to delete project.", variant: "destructive" });
                  },
                });
              }}
              data-testid="button-confirm-delete-project"
            >
              {deleteProjectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </div>
      </div>
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
  type: 'point';
  title: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
}


function ProjectTimeline({ 
  projectId, 
  startDate, 
  endDate,
  onMilestoneClick 
}: { 
  projectId: number;
  startDate: string | null;
  endDate: string | null;
  onMilestoneClick?: (taskId: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [showAllMilestones, setShowAllMilestones] = useState(false);
  const TIMELINE_MILESTONE_LIMIT = 10;
  const { data: tasks } = useTasks(projectId);
  
  const getHiddenTasksKey = () => `project-timeline-hidden-${projectId}`;
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(getHiddenTasksKey());
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  
  const hideTaskFromTimeline = (taskId: number) => {
    const newHidden = new Set(hiddenTaskIds);
    newHidden.add(taskId);
    setHiddenTaskIds(newHidden);
    try {
      localStorage.setItem(getHiddenTasksKey(), JSON.stringify([...newHidden]));
    } catch {}
  };
  
  const showTaskOnTimeline = (taskId: number) => {
    const newHidden = new Set(hiddenTaskIds);
    newHidden.delete(taskId);
    setHiddenTaskIds(newHidden);
    try {
      localStorage.setItem(getHiddenTasksKey(), JSON.stringify([...newHidden]));
    } catch {}
  };
  
  const showAllTasks = () => {
    setHiddenTaskIds(new Set());
    try {
      localStorage.removeItem(getHiddenTasksKey());
    } catch {}
  };
  
  const projectStart = startDate ? parseISO(startDate) : null;
  const projectEnd = endDate ? parseISO(endDate) : null;

  const scheduleBounds = useMemo(() => {
    if (!tasks || tasks.length === 0) return null;
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    const isReasonableDate = (d: Date) => {
      const y = d.getFullYear();
      return y >= 1970 && y <= 2100 && !isNaN(d.getTime());
    };
    for (const t of tasks) {
      if (t.startDate) {
        const d = parseISO(t.startDate);
        if (isReasonableDate(d) && (!minDate || d < minDate)) minDate = d;
      }
      if (t.endDate) {
        const d = parseISO(t.endDate);
        if (isReasonableDate(d) && (!maxDate || d > maxDate)) maxDate = d;
      }
    }
    if (!minDate || !maxDate) return null;
    return { start: minDate, end: maxDate };
  }, [tasks]);

  const effectiveStart = useMemo(() => {
    if (projectStart && scheduleBounds) {
      return projectStart < scheduleBounds.start ? projectStart : scheduleBounds.start;
    }
    return projectStart || scheduleBounds?.start || null;
  }, [projectStart, scheduleBounds]);

  const effectiveEnd = useMemo(() => {
    if (projectEnd && scheduleBounds) {
      return projectEnd > scheduleBounds.end ? projectEnd : scheduleBounds.end;
    }
    return projectEnd || scheduleBounds?.end || null;
  }, [projectEnd, scheduleBounds]);

  const allEvents = useMemo(() => {
    const events: TimelineEvent[] = [];
    
    tasks?.filter(t => {
      if (!t.startDate && !t.endDate) return false;
      if (t.isMilestone) return true;
      return false;
    }).forEach((t) => {
      const start = t.startDate ? parseISO(t.startDate) : null;
      const end = t.endDate ? parseISO(t.endDate) : null;
      const effectiveStartDate = start || end!;
      const effectiveEndDate = end || start!;
      
      events.push({
        id: t.id,
        type: 'point' as const,
        title: t.name,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        completed: t.status === 'Completed',
      });
    });
    
    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [tasks]);
  
  const nonHiddenEvents = useMemo(() => {
    return allEvents.filter(e => !hiddenTaskIds.has(e.id));
  }, [allEvents, hiddenTaskIds]);

  const visibleEvents = useMemo(() => {
    if (showAllMilestones || nonHiddenEvents.length <= TIMELINE_MILESTONE_LIMIT) {
      return nonHiddenEvents;
    }
    const today = new Date();
    const scored = nonHiddenEvents.map(e => {
      const daysDiff = Math.abs(differenceInDays(e.endDate, today));
      return { event: e, score: daysDiff };
    });
    scored.sort((a, b) => a.score - b.score);
    const selected = scored.slice(0, TIMELINE_MILESTONE_LIMIT).map(s => s.event);
    selected.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return selected;
  }, [nonHiddenEvents, showAllMilestones]);
  
  const hiddenEvents = useMemo(() => {
    return allEvents.filter(e => hiddenTaskIds.has(e.id));
  }, [allEvents, hiddenTaskIds]);

  const pointEvents = visibleEvents;

  const timelineRange = useMemo(() => {
    if (!effectiveStart || !effectiveEnd) return null;
    
    const today = startOfDay(new Date());
    let rangeStart = effectiveStart;
    let rangeEnd = effectiveEnd;
    const rawDays = differenceInDays(rangeEnd, rangeStart);
    if (rawDays < 14) {
      const midpoint = new Date((rangeStart.getTime() + rangeEnd.getTime()) / 2);
      rangeStart = new Date(midpoint);
      rangeStart.setDate(rangeStart.getDate() - 14);
      rangeEnd = new Date(midpoint);
      rangeEnd.setDate(rangeEnd.getDate() + 14);
    }
    const totalDays = differenceInDays(rangeEnd, rangeStart);
    
    if (totalDays <= 0) return null;
    
    const rawTodayPosition = (differenceInDays(today, rangeStart) / totalDays) * 100;
    
    return {
      start: rangeStart,
      end: rangeEnd,
      totalDays,
      today,
      todayPosition: rawTodayPosition,
      todayInRange: rawTodayPosition >= 0 && rawTodayPosition <= 100,
      todayBefore: rawTodayPosition < 0,
      todayAfter: rawTodayPosition > 100,
    };
  }, [effectiveStart, effectiveEnd]);
  
  const timeScaleMarks = useMemo(() => {
    if (!timelineRange) return { scale: 'months' as const, marks: [] as { label: string; position: number; isMinor: boolean }[] };
    
    const { totalDays, start, end } = timelineRange;
    const marks: { label: string; position: number; isMinor: boolean }[] = [];
    
    let scale: 'days' | 'weeks' | 'months' | 'quarters' | 'years';
    if (totalDays <= 14) {
      scale = 'days';
    } else if (totalDays <= 60) {
      scale = 'weeks';
    } else if (totalDays <= 365) {
      scale = 'months';
    } else if (totalDays <= 730) {
      scale = 'quarters';
    } else {
      scale = 'years';
    }
    
    if (scale === 'days') {
      let current = new Date(start);
      while (current <= end) {
        const position = (differenceInDays(current, start) / totalDays) * 100;
        if (position >= 0 && position <= 100) {
          marks.push({
            label: format(current, 'd'),
            position,
            isMinor: current.getDay() !== 1,
          });
        }
        current = addDays(current, 1);
      }
    } else if (scale === 'weeks') {
      let current = new Date(start);
      while (current.getDay() !== 1) {
        current = addDays(current, 1);
      }
      while (current <= end) {
        const position = (differenceInDays(current, start) / totalDays) * 100;
        if (position >= 0 && position <= 100) {
          marks.push({
            label: format(current, 'MMM d'),
            position,
            isMinor: false,
          });
        }
        current = addDays(current, 7);
      }
    } else if (scale === 'months') {
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const position = (differenceInDays(current, start) / totalDays) * 100;
        if (position >= 0 && position <= 100) {
          marks.push({
            label: format(current, 'MMMM yyyy'),
            position,
            isMinor: current.getMonth() !== 0,
          });
        }
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
    } else if (scale === 'quarters') {
      const quarterMonths = [0, 3, 6, 9];
      let year = start.getFullYear();
      while (year <= end.getFullYear() + 1) {
        for (const month of quarterMonths) {
          const quarterStart = new Date(year, month, 1);
          if (quarterStart >= start && quarterStart <= end) {
            const position = (differenceInDays(quarterStart, start) / totalDays) * 100;
            if (position >= 0 && position <= 100) {
              const quarterNum = Math.floor(month / 3) + 1;
              marks.push({
                label: `Q${quarterNum} ${format(quarterStart, 'yy')}`,
                position,
                isMinor: month !== 0,
              });
            }
          }
        }
        year++;
      }
    } else {
      let year = start.getFullYear();
      while (year <= end.getFullYear() + 1) {
        const yearStart = new Date(year, 0, 1);
        if (yearStart >= start && yearStart <= end) {
          const position = (differenceInDays(yearStart, start) / totalDays) * 100;
          if (position >= 0 && position <= 100) {
            marks.push({
              label: String(year),
              position,
              isMinor: false,
            });
          }
        }
        year++;
      }
    }
    
    return { scale, marks };
  }, [timelineRange]);

  const pointsWithLayout = useMemo(() => {
    if (!timelineRange || pointEvents.length === 0) return { points: [] as any[], topRowCount: 0, bottomRowCount: 0 };
    
    const CHAR_WIDTH_PX = 5;
    const MAX_LABEL_PX = 100;
    const PADDING_PX = 12;
    const CONTAINER_WIDTH_PX = 700;

    const points = pointEvents.map(event => {
      const position = Math.max(0, Math.min(100, (differenceInDays(event.endDate, timelineRange.start) / timelineRange.totalDays) * 100));
      const titleWidth = Math.min(event.title.length * CHAR_WIDTH_PX, MAX_LABEL_PX);
      const dateWidth = 24;
      const labelWidthPx = Math.max(titleWidth, dateWidth) + PADDING_PX;
      const halfWidthPct = (labelWidthPx / 2 / CONTAINER_WIDTH_PX) * 100;
      return {
        ...event,
        position,
        side: 'bottom' as 'top' | 'bottom',
        labelRow: 0,
        leftEdge: position - halfWidthPct,
        rightEdge: position + halfWidthPct,
      };
    });

    type RowSlot = { rightEdge: number };
    const topRows: RowSlot[][] = [];
    const bottomRows: RowSlot[][] = [];

    const fitsInRow = (row: RowSlot[], pt: typeof points[0]) => {
      return row.every(slot => pt.leftEdge >= slot.rightEdge);
    };

    for (const point of points) {
      let placed = false;

      if (bottomRows.length === 0 || fitsInRow(bottomRows[0], point)) {
        point.side = 'bottom';
        point.labelRow = 0;
        if (!bottomRows[0]) bottomRows[0] = [];
        bottomRows[0].push({ rightEdge: point.rightEdge });
        placed = true;
      } else if (topRows.length === 0 || fitsInRow(topRows[0] || [], point)) {
        point.side = 'top';
        point.labelRow = 0;
        if (!topRows[0]) topRows[0] = [];
        topRows[0].push({ rightEdge: point.rightEdge });
        placed = true;
      }

      if (!placed) {
        for (let r = 1; r < bottomRows.length; r++) {
          if (fitsInRow(bottomRows[r], point)) {
            point.side = 'bottom';
            point.labelRow = r;
            bottomRows[r].push({ rightEdge: point.rightEdge });
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        for (let r = 1; r < topRows.length; r++) {
          if (fitsInRow(topRows[r], point)) {
            point.side = 'top';
            point.labelRow = r;
            topRows[r].push({ rightEdge: point.rightEdge });
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        if (bottomRows.length <= topRows.length) {
          point.side = 'bottom';
          point.labelRow = bottomRows.length;
          bottomRows.push([{ rightEdge: point.rightEdge }]);
        } else {
          point.side = 'top';
          point.labelRow = topRows.length;
          topRows.push([{ rightEdge: point.rightEdge }]);
        }
      }
    }

    return { points, topRowCount: topRows.length, bottomRowCount: bottomRows.length };
  }, [pointEvents, timelineRange]);

  if (!timelineRange) {
    return (
      <Card className="py-2">
        <CardHeader className="py-1 px-4">
          <CardTitle className="text-xs font-medium flex items-center gap-2">
            <GanttChart className="h-3 w-3" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="py-1 px-4">
          <p className="text-xs text-muted-foreground">Set project start and end dates or add tasks with dates to view the timeline.</p>
        </CardContent>
      </Card>
    );
  }
  
  const trackHeight = 36;
  
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
            <span className="text-xs text-muted-foreground">
              {format(timelineRange.start, 'MMM d, yyyy')} — {format(timelineRange.end, 'MMM d, yyyy')}
            </span>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-2 px-4 pb-3">
            <div className="relative h-6 mb-1 mx-8">
              {timeScaleMarks.marks.map((mark, index) => (
                <div
                  key={`${mark.label}-${index}`}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${mark.position}%`, transform: 'translateX(-50%)' }}
                >
                  <span 
                    className={cn(
                      "text-[10px] whitespace-nowrap",
                      mark.isMinor 
                        ? "text-muted-foreground/50" 
                        : "text-muted-foreground font-medium"
                    )}
                  >
                    {mark.label}
                  </span>
                  <div 
                    className={cn(
                      "w-px mt-0.5",
                      mark.isMinor 
                        ? "h-1.5 bg-muted-foreground/20" 
                        : "h-2.5 bg-muted-foreground/40"
                    )}
                  />
                </div>
              ))}
            </div>
            
            {pointsWithLayout.points.filter(p => p.side === 'top').length > 0 && (() => {
              const topPoints = pointsWithLayout.points.filter(p => p.side === 'top');
              const ROW_HEIGHT = 32;
              return (
                <div className="relative mx-8 mb-0.5" style={{ height: `${pointsWithLayout.topRowCount * ROW_HEIGHT}px` }}>
                  {topPoints.map((point) => (
                    <div
                      key={`point-label-top-${point.id}`}
                      className="absolute flex flex-col items-center"
                      style={{
                        left: `${point.position}%`,
                        transform: 'translateX(-50%)',
                        bottom: `${point.labelRow * ROW_HEIGHT}px`,
                        maxWidth: '120px',
                      }}
                    >
                      <span className="text-[9px] text-muted-foreground/50">
                        {format(point.endDate, 'M/d')}
                      </span>
                      <span className={cn(
                        "text-[9px] leading-tight text-center mb-0.5 max-w-[100px] truncate",
                        point.completed ? "text-muted-foreground/60" : "text-muted-foreground"
                      )}>
                        {point.title}
                      </span>
                      <div className="w-px bg-muted-foreground/30" style={{ height: `${4 + point.labelRow * 2}px` }} />
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="relative mx-8" style={{ height: `${trackHeight}px` }}>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-muted rounded-full" />
              
              {pointsWithLayout.points.map((point) => (
                <Tooltip key={`point-${point.id}`}>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 cursor-pointer z-20 flex items-center justify-center"
                      style={{ left: `calc(${point.position}% - 7px)` }}
                      onClick={() => onMilestoneClick?.(point.id)}
                      data-testid={`timeline-milestone-${point.id}`}
                    >
                      <div
                        className={cn(
                          "w-[14px] h-[14px] rotate-45 border-2",
                          point.completed
                            ? "bg-emerald-500 border-emerald-700"
                            : "bg-purple-500 border-purple-700"
                        )}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="space-y-2">
                    <button
                      className="font-medium text-primary hover:underline cursor-pointer text-left"
                      onClick={() => onMilestoneClick?.(point.id)}
                    >
                      {point.title}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {point.startDate.getTime() !== point.endDate.getTime()
                        ? `${format(point.startDate, 'MMM d, yyyy')} — ${format(point.endDate, 'MMM d, yyyy')}`
                        : format(point.endDate, 'MMM d, yyyy')}
                      {point.completed && ' (Completed)'}
                    </p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full h-6 text-xs text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        hideTaskFromTimeline(point.id);
                      }}
                    >
                      <EyeOff className="h-3 w-3 mr-1" />
                      Hide from timeline
                    </Button>
                  </TooltipContent>
                </Tooltip>
              ))}
              
              {timelineRange.todayInRange && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className="absolute top-0 bottom-0 w-1.5 z-10 cursor-default group"
                      style={{ left: `calc(${timelineRange.todayPosition}% - 2px)` }}
                    >
                      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-green-600" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Today — {format(timelineRange.today, 'MMM d, yyyy')}
                  </TooltipContent>
                </Tooltip>
              )}

              {timelineRange.todayBefore && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 z-30 cursor-default"
                      style={{ left: '-4px', transform: 'translate(-100%, -50%)' }}
                    >
                      <div className="flex items-center gap-1 bg-green-600 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                        <span>Today {format(timelineRange.today, 'M/d')}</span>
                        <ArrowRight className="h-2.5 w-2.5" />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Today ({format(timelineRange.today, 'MMM d, yyyy')}) — project has not started yet
                  </TooltipContent>
                </Tooltip>
              )}

              {timelineRange.todayAfter && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 z-30 cursor-default"
                      style={{ right: '-4px', transform: 'translate(100%, -50%)' }}
                    >
                      <div className="flex items-center gap-1 bg-amber-600 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                        <ArrowRight className="h-2.5 w-2.5 rotate-180" />
                        <span>Today {format(timelineRange.today, 'M/d')}</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Today ({format(timelineRange.today, 'MMM d, yyyy')}) — project timeline has ended
                  </TooltipContent>
                </Tooltip>
              )}
              
              <div className="absolute top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground flex flex-col items-center leading-tight" style={{ right: '100%', marginRight: '6px' }}>
                <Flag className="h-3.5 w-3.5 text-emerald-600 mb-0.5" />
                <span>Start</span>
                <span className="text-[9px] text-muted-foreground/70 whitespace-nowrap">{format(timelineRange.start, 'M/d')}</span>
              </div>
              <div className="absolute top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground flex flex-col items-center leading-tight" style={{ left: '100%', marginLeft: '6px' }}>
                <FlagTriangleRight className="h-3.5 w-3.5 text-red-500 mb-0.5" />
                <span>Finish</span>
                <span className="text-[9px] text-muted-foreground/70 whitespace-nowrap">{format(timelineRange.end, 'M/d')}</span>
              </div>
            </div>

            {pointsWithLayout.points.filter(p => p.side === 'bottom').length > 0 && (() => {
              const bottomPoints = pointsWithLayout.points.filter(p => p.side === 'bottom');
              const ROW_HEIGHT = 32;
              return (
                <div className="relative mx-8 mt-0.5" style={{ height: `${pointsWithLayout.bottomRowCount * ROW_HEIGHT}px` }}>
                  {bottomPoints.map((point) => (
                    <div
                      key={`point-label-${point.id}`}
                      className="absolute flex flex-col items-center"
                      style={{
                        left: `${point.position}%`,
                        transform: 'translateX(-50%)',
                        top: `${point.labelRow * ROW_HEIGHT}px`,
                        maxWidth: '120px',
                      }}
                    >
                      <div className="w-px bg-muted-foreground/30" style={{ height: `${4 + point.labelRow * 2}px` }} />
                      <span className={cn(
                        "text-[9px] leading-tight text-center mt-0.5 max-w-[100px] truncate",
                        point.completed ? "text-muted-foreground/60" : "text-muted-foreground"
                      )}>
                        {point.title}
                      </span>
                      <span className="text-[9px] text-muted-foreground/50">
                        {format(point.endDate, 'M/d')}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
            
            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Flag className="h-3 w-3 text-emerald-600" />
                  <span>Start</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FlagTriangleRight className="h-3 w-3 text-red-500" />
                  <span>Finish</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-[10px] h-[10px] rotate-45 bg-purple-500 border-2 border-purple-700" />
                  <span>Key Date</span>
                </div>
                {timelineRange.todayInRange && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-green-600" />
                    <span>Today</span>
                  </div>
                )}
                {timelineRange.todayBefore && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 bg-green-600 rounded-sm" />
                    <span>Today (not started)</span>
                  </div>
                )}
                {timelineRange.todayAfter && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 bg-amber-600 rounded-sm" />
                    <span>Today (after timeline)</span>
                  </div>
                )}
                {hiddenEvents.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" data-testid="button-show-hidden-milestones">
                        <EyeOff className="h-3 w-3" />
                        {hiddenEvents.length} hidden
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <DropdownMenuLabel className="text-xs">Hidden from timeline</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {hiddenEvents.map((event) => (
                        <DropdownMenuItem
                          key={event.id}
                          onClick={() => showTaskOnTimeline(event.id)}
                          className="text-xs cursor-pointer"
                          data-testid={`button-show-milestone-${event.id}`}
                        >
                          <Eye className="h-3 w-3 mr-2" />
                          {event.title}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={showAllTasks} className="text-xs cursor-pointer" data-testid="button-show-all-milestones">
                        <Eye className="h-3 w-3 mr-2" />
                        Show all
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex items-center gap-2">
                {nonHiddenEvents.length > TIMELINE_MILESTONE_LIMIT && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => setShowAllMilestones(!showAllMilestones)}
                  >
                    {showAllMilestones ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Show fewer
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Show all {nonHiddenEvents.length}
                      </>
                    )}
                  </Button>
                )}
                <span className="text-muted-foreground/70">
                  {visibleEvents.length} key date{visibleEvents.length !== 1 ? 's' : ''}
                  {nonHiddenEvents.length > visibleEvents.length && !showAllMilestones && ` of ${nonHiddenEvents.length}`}
                  {hiddenEvents.length > 0 && ` (${hiddenEvents.length} hidden)`}
                </span>
              </div>
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
                      {entry.previousHealth === entry.newHealth ? (
                        <>
                          <Badge className={cn("text-xs px-2 py-0.5", getHealthColor(entry.newHealth))}>
                            {entry.newHealth}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">Note</span>
                        </>
                      ) : (
                        <>
                          <Badge className={cn("text-xs px-2 py-0.5", getHealthColor(entry.previousHealth))}>
                            {entry.previousHealth || 'None'}
                          </Badge>
                          <ArrowDown className="h-3 w-3 text-muted-foreground" />
                          <Badge className={cn("text-xs px-2 py-0.5", getHealthColor(entry.newHealth))}>
                            {entry.newHealth}
                          </Badge>
                        </>
                      )}
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
              <p className="text-sm text-muted-foreground text-center py-2">No health status updates recorded yet</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function ProjectCustomFieldsSection({ projectId, organizationId }: { projectId: number; organizationId: number | undefined }) {
  const { toast } = useToast();
  const { data: allDefinitions = [], isLoading: definitionsLoading } = useCustomFieldDefinitions(organizationId);
  const definitions = useMemo(() => allDefinitions.filter(d => (d.entityType || 'project') === 'project'), [allDefinitions]);
  const { data: values = [], isLoading: valuesLoading } = useProjectCustomFieldValues(projectId);
  const updateValue = useUpdateProjectCustomFieldValue();
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  if (!organizationId) return null;
  if (definitionsLoading || valuesLoading) return null;
  if (definitions.length === 0) return null;

  const getFieldValue = (fieldId: number): string => {
    const val = values.find(v => v.fieldDefinitionId === fieldId);
    return val?.value || "";
  };

  const handleEdit = (field: CustomFieldDefinition) => {
    setEditingFieldId(field.id);
    setEditValue(getFieldValue(field.id));
  };

  const handleSave = async (fieldId: number) => {
    try {
      await updateValue.mutateAsync({
        projectId,
        fieldDefinitionId: fieldId,
        value: editValue || null,
      });
      toast({ title: "Saved" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
    setEditingFieldId(null);
  };

  const handleCancel = () => {
    setEditingFieldId(null);
    setEditValue("");
  };

  const parseMultiSelectValue = (value: string): string[] => {
    if (!value) return [];
    try {
      return JSON.parse(value);
    } catch {
      return value ? [value] : [];
    }
  };

  const toggleMultiSelectOption = (opt: string) => {
    const current = parseMultiSelectValue(editValue);
    const updated = current.includes(opt)
      ? current.filter(v => v !== opt)
      : [...current, opt];
    setEditValue(JSON.stringify(updated));
  };

  const renderFieldInput = (field: CustomFieldDefinition) => {
    switch (field.fieldType) {
      case "checkbox":
        return (
          <Checkbox
            checked={editValue === "true"}
            onCheckedChange={(checked) => {
              setEditValue(checked ? "true" : "false");
            }}
            data-testid={`input-custom-field-${field.id}`}
          />
        );
      case "select":
        return (
          <Select value={editValue} onValueChange={setEditValue}>
            <SelectTrigger data-testid={`select-custom-field-${field.id}`}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options as string[] || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multiselect":
        const selectedValues = parseMultiSelectValue(editValue);
        return (
          <div className="flex flex-wrap gap-1" data-testid={`multiselect-custom-field-${field.id}`}>
            {(field.options as string[] || []).map((opt) => (
              <Badge
                key={opt}
                variant={selectedValues.includes(opt) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleMultiSelectOption(opt)}
                data-testid={`option-${field.id}-${opt}`}
              >
                {opt}
              </Badge>
            ))}
          </div>
        );
      case "date":
        return (
          <Input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            data-testid={`input-custom-field-${field.id}`}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            data-testid={`input-custom-field-${field.id}`}
          />
        );
      case "url":
        return (
          <Input
            type="url"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="https://..."
            data-testid={`input-custom-field-${field.id}`}
          />
        );
      default:
        return (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            data-testid={`input-custom-field-${field.id}`}
          />
        );
    }
  };

  const renderFieldValue = (field: CustomFieldDefinition) => {
    const value = getFieldValue(field.id);
    if (!value) return <span className="text-muted-foreground text-sm" data-testid={`value-empty-${field.id}`}>Not set</span>;

    switch (field.fieldType) {
      case "checkbox":
        return value === "true" ? <Check className="h-4 w-4 text-green-600" data-testid={`value-check-${field.id}`} /> : <X className="h-4 w-4 text-muted-foreground" data-testid={`value-uncheck-${field.id}`} />;
      case "url":
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="underline text-sm flex items-center gap-1" data-testid={`link-custom-field-${field.id}`}>
            {value.length > 30 ? value.substring(0, 30) + "..." : value}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
      case "multiselect":
        const selected = parseMultiSelectValue(value);
        return (
          <div className="flex flex-wrap gap-1" data-testid={`value-multiselect-${field.id}`}>
            {selected.map((v) => (
              <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
            ))}
          </div>
        );
      case "date":
        return <span className="text-sm" data-testid={`value-date-${field.id}`}>{format(new Date(value), 'MMM d, yyyy')}</span>;
      default:
        return <span className="text-sm" data-testid={`value-text-${field.id}`}>{value}</span>;
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border" data-testid="section-custom-fields">
      <div className="flex items-center gap-2 mb-3">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Custom Fields</Label>
        <Badge variant="secondary" className="text-[10px]">{definitions.length}</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
        {definitions.map((field) => (
          <div key={field.id} className="space-y-1" data-testid={`custom-field-${field.id}`}>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              {field.name}
              {field.isRequired && <span className="text-destructive">*</span>}
            </Label>
            {editingFieldId === field.id ? (
              <div className="flex items-center gap-2">
                {renderFieldInput(field)}
                <Button size="icon" variant="ghost" onClick={() => handleSave(field.id)} data-testid={`button-save-field-${field.id}`}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={handleCancel} data-testid={`button-cancel-field-${field.id}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center justify-between p-1 rounded cursor-pointer hover-elevate min-h-[28px]"
                onClick={() => handleEdit(field)}
                data-testid={`button-edit-field-${field.id}`}
              >
                {renderFieldValue(field)}
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomTabRenderer({ tabId, project, onUpdate }: { tabId: number; project: any; onUpdate: any }) {
  const { toast } = useToast();
  const { data: fullTabData, isLoading } = useFullCustomTab(tabId);
  const { currentOrganization } = useOrganization();
  const { data: allCustomFieldDefs = [] } = useCustomFieldDefinitions(currentOrganization?.id);
  const customFieldDefs = useMemo(() => allCustomFieldDefs.filter(d => (d.entityType || 'project') === 'project'), [allCustomFieldDefs]);
  const { data: customFieldValues = [] } = useProjectCustomFieldValues(project.id);
  const updateCustomFieldValue = useUpdateProjectCustomFieldValue();
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const tab = fullTabData?.tab;
  const sections = fullTabData?.sections ?? [];

  if (isLoading) {
    return <Card className="p-6"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>;
  }

  if (!tab) {
    return <Card className="p-6 text-center text-muted-foreground">Tab configuration not found</Card>;
  }

  const getFieldValue = (fieldKey: string, fieldType: string): any => {
    if (fieldType === 'custom') {
      const customFieldId = parseInt(fieldKey.replace('customField:', ''));
      const val = customFieldValues.find(v => v.fieldDefinitionId === customFieldId);
      return val?.value || '';
    }
    return project[fieldKey] ?? '';
  };

  const handleEdit = (field: CustomTabField) => {
    setEditingFieldId(field.id);
    setEditValue(String(getFieldValue(field.fieldKey, field.fieldType) ?? ''));
  };

  const handleSave = async (field: CustomTabField) => {
    try {
      if (field.fieldType === 'custom') {
        const customFieldId = parseInt(field.fieldKey.replace('customField:', ''));
        await updateCustomFieldValue.mutateAsync({
          projectId: project.id,
          fieldDefinitionId: customFieldId,
          value: editValue || null,
        });
      } else {
        await onUpdate({ [field.fieldKey]: editValue || null });
      }
      toast({ title: "Saved" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
    setEditingFieldId(null);
  };

  const handleCancel = () => {
    setEditingFieldId(null);
    setEditValue("");
  };

  const getFieldLabel = (field: CustomTabField): string => {
    if (field.label) return field.label;
    if (field.fieldType === 'custom') {
      const customFieldId = parseInt(field.fieldKey.replace('customField:', ''));
      const def = customFieldDefs.find(d => d.id === customFieldId);
      return def?.name || field.fieldKey;
    }
    const projectFieldLabels: Record<string, string> = {
      name: 'Project Name', projectCode: 'Project Code', description: 'Description', status: 'Status', priority: 'Priority',
      health: 'Health', healthReason: 'Health Reason', projectType: 'Project Type', methodology: 'Methodology',
      department: 'Department', category: 'Category', startDate: 'Start Date', endDate: 'End Date',
      baselineStartDate: 'Baseline Start', baselineEndDate: 'Baseline End', actualStartDate: 'Actual Start',
      actualEndDate: 'Actual End', budget: 'Budget', actualCost: 'Actual Cost', forecastCost: 'Forecast Cost',
      completionPercentage: 'Completion %', scheduleVariance: 'Schedule Variance', costVariance: 'Cost Variance',
      scope: 'Scope', objectives: 'Objectives', successCriteria: 'Success Criteria', constraints: 'Constraints',
      assumptions: 'Assumptions', dependencies: 'Dependencies', businessValue: 'Business Value',
      riskLevel: 'Risk Level', notes: 'Notes', billableStatus: 'Billable Status', source: 'Source',
    };
    return projectFieldLabels[field.fieldKey] || field.fieldKey;
  };

  const formatDisplayValue = (value: any, fieldKey: string): string => {
    if (value === null || value === undefined || value === '') return 'Not set';
    if (fieldKey.endsWith('Date') && value) {
      try {
        return format(new Date(value), 'MMM d, yyyy');
      } catch { return String(value); }
    }
    if (fieldKey === 'budget' || fieldKey === 'actualCost' || fieldKey === 'forecastCost') {
      return `$${Number(value).toLocaleString()}`;
    }
    if (fieldKey === 'completionPercentage') {
      return `${value}%`;
    }
    return String(value);
  };

  const renderFieldInput = (field: CustomTabField) => {
    const isDateField = field.fieldKey.endsWith('Date');
    const isCurrencyField = ['budget', 'actualCost', 'forecastCost'].includes(field.fieldKey);
    const isNumberField = ['completionPercentage', 'scheduleVariance', 'costVariance'].includes(field.fieldKey) || isCurrencyField;
    const isTextArea = ['description', 'scope', 'objectives', 'successCriteria', 'constraints', 'assumptions', 'dependencies', 'notes', 'healthReason'].includes(field.fieldKey);
    const isSelect = ['status', 'priority', 'health', 'riskLevel', 'billableStatus'].includes(field.fieldKey);

    if (isDateField) {
      return <Input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 text-sm" data-testid={`input-${field.fieldKey}`} />;
    }
    if (isNumberField) {
      return <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 text-sm" data-testid={`input-${field.fieldKey}`} />;
    }
    if (isTextArea) {
      return <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} className="min-h-[60px] text-sm" data-testid={`input-${field.fieldKey}`} />;
    }
    if (isSelect) {
      const options: Record<string, string[]> = {
        status: ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closing', 'Billing', 'On Hold', 'Cancelled'],
        priority: ['Low', 'Medium', 'High', 'Critical'],
        health: ['Green', 'Yellow', 'Red'],
        riskLevel: ['Low', 'Medium', 'High'],
        billableStatus: ['Billable', 'Non-Billable', 'N/A'],
      };
      return (
        <Select value={editValue} onValueChange={setEditValue}>
          <SelectTrigger className="h-8 text-sm" data-testid={`select-${field.fieldKey}`}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(options[field.fieldKey] || []).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 text-sm" data-testid={`input-${field.fieldKey}`} />;
  };

  const getGridCols = (columns: number | null): string => {
    switch (columns) {
      case 1: return 'grid-cols-1';
      case 3: return 'grid-cols-1 md:grid-cols-3';
      case 4: return 'grid-cols-2 md:grid-cols-4';
      default: return 'grid-cols-1 md:grid-cols-2';
    }
  };

  return (
    <div className="space-y-6" data-testid={`custom-tab-content-${tabId}`}>
      {sections.map((section) => (
        <Card key={section.id} data-testid={`custom-section-${section.id}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {section.name}
              <Badge variant="secondary" className="text-xs">{section.fields.length} fields</Badge>
            </CardTitle>
            {section.description && <CardDescription>{section.description}</CardDescription>}
          </CardHeader>
          <CardContent>
            {section.fields.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No fields in this section</div>
            ) : (
              <div className={`grid gap-4 ${getGridCols(section.columns)}`}>
                {section.fields.map((field) => {
                  const value = getFieldValue(field.fieldKey, field.fieldType);
                  const isEditing = editingFieldId === field.id;
                  return (
                    <div key={field.id} className="space-y-1" data-testid={`custom-field-${field.id}`}>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        {getFieldLabel(field)}
                      </Label>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">{renderFieldInput(field)}</div>
                          <Button size="icon" variant="ghost" onClick={() => handleSave(field)} data-testid={`button-save-${field.fieldKey}`}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={handleCancel} data-testid={`button-cancel-${field.fieldKey}`}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center justify-between p-2 rounded min-h-[36px] border border-transparent cursor-pointer hover-elevate"
                          onClick={() => handleEdit(field)}
                          data-testid={`button-edit-${field.fieldKey}`}
                        >
                          <span className="text-sm">{formatDisplayValue(value, field.fieldKey)}</span>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {sections.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <LayoutGrid className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>This tab has no sections yet.</p>
          <p className="text-sm mt-2">Go to Organization Settings to add sections and fields.</p>
        </Card>
      )}
    </div>
  );
}

function ProjectTeamTab({ 
  projectId, 
  organizationId, 
  projectTaskAssignments, 
  projectName,
  readOnly = false 
}: { 
  projectId: number; 
  organizationId: number | null; 
  projectTaskAssignments: (import("@shared/schema").TaskResourceAssignment & { resource: import("@shared/schema").Resource })[]; 
  projectName: string;
  readOnly?: boolean;
}) {
  const { data: allResources } = useResources(organizationId);
  const { data: projectTasks } = useTasks(projectId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const summaryTaskIds = useMemo(() => {
    const ids = new Set<number>();
    if (!projectTasks) return ids;
    for (let i = 0; i < projectTasks.length; i++) {
      const currentLevel = projectTasks[i].outlineLevel || 1;
      if (i + 1 < projectTasks.length) {
        const nextLevel = projectTasks[i + 1].outlineLevel || 1;
        if (nextLevel > currentLevel) {
          ids.add(projectTasks[i].id);
        }
      }
    }
    return ids;
  }, [projectTasks]);

  const teamMembers = useMemo(() => {
    const resourceMap = new Map<number, {
      resource: import("@shared/schema").Resource;
      taskCount: number;
      taskNames: string[];
      taskIds: Set<number>;
      totalAllocation: number;
    }>();

    for (const assignment of projectTaskAssignments) {
      if (!assignment.resource) continue;
      const task = projectTasks?.find(t => t.id === assignment.taskId);
      if (!task) continue;
      const isSummary = summaryTaskIds.has(task.id);
      const existing = resourceMap.get(assignment.resourceId);
      if (existing) {
        if (!existing.taskIds.has(assignment.taskId)) {
          existing.taskIds.add(assignment.taskId);
          if (!isSummary) {
            existing.taskCount++;
            if (task.name && !existing.taskNames.includes(task.name)) {
              existing.taskNames.push(task.name);
            }
          }
        }
        existing.totalAllocation += assignment.allocationPercentage || 100;
      } else {
        resourceMap.set(assignment.resourceId, {
          resource: assignment.resource,
          taskCount: isSummary ? 0 : 1,
          taskNames: (!isSummary && task.name) ? [task.name] : [],
          taskIds: new Set([assignment.taskId]),
          totalAllocation: assignment.allocationPercentage || 100,
        });
      }
    }

    if (allResources) {
      for (const resource of allResources) {
        if (resourceMap.has(resource.id)) continue;
        if (resource.invitedProjectIds && resource.invitedProjectIds.includes(projectId)) {
          resourceMap.set(resource.id, {
            resource,
            taskCount: 0,
            taskNames: [],
            taskIds: new Set<number>(),
            totalAllocation: 0,
          });
        }
      }
    }

    return Array.from(resourceMap.values()).sort((a, b) => 
      a.resource.displayName.localeCompare(b.resource.displayName)
    );
  }, [projectTaskAssignments, projectTasks, allResources, projectId, summaryTaskIds]);

  const availableResources = useMemo(() => {
    if (!allResources) return [];
    const assignedIds = new Set(teamMembers.map(m => m.resource.id));
    return allResources
      .filter(r => r.isActive && !assignedIds.has(r.id))
      .filter(r => {
        if (!searchValue) return true;
        const search = searchValue.toLowerCase();
        return (
          r.displayName.toLowerCase().includes(search) ||
          (r.email && r.email.toLowerCase().includes(search)) ||
          (r.title && r.title.toLowerCase().includes(search)) ||
          (r.department && r.department.toLowerCase().includes(search))
        );
      });
  }, [allResources, teamMembers, searchValue]);

  const addResourceToProject = async (resourceId: number) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/team-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add team member");
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "task-resource-assignments"] });
      qc.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({ title: "Team member added", description: "Resource has been added to the project team." });
      setSearchValue("");
    } catch {
      toast({ title: "Error", description: "Failed to add team member", variant: "destructive" });
    }
  };

  const removeFromTeam = async (resourceId: number) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/team-members/${resourceId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove team member");
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "task-resource-assignments"] });
      qc.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({ title: "Removed", description: "Team member removed from the project." });
    } catch {
      toast({ title: "Error", description: "Failed to remove team member", variant: "destructive" });
    }
  };

  type TeamTimeScale = "day" | "week" | "month" | "quarter" | "year";
  type TeamDisplayUnit = "hours" | "percent" | "fte";

  const DEFAULT_TEAM_PERIODS: Record<TeamTimeScale, number> = { day: 14, week: 12, month: 6, quarter: 4, year: 2 };

  const [teamTimeScale, setTeamTimeScale] = useState<TeamTimeScale>("week");
  const [teamPeriodCount, setTeamPeriodCount] = useState(12);
  const [teamDisplayUnit, setTeamDisplayUnit] = useState<TeamDisplayUnit>("hours");
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set());

  const today = useMemo(() => new Date(), []);

  const teamPeriods = useMemo(() => {
    const result: { start: Date; end: Date; label: string; workDays: number }[] = [];
    for (let i = 0; i < teamPeriodCount; i++) {
      let periodStart: Date, periodEnd: Date, label: string, workDays: number;
      switch (teamTimeScale) {
        case "day":
          periodStart = startOfDay(addDays(today, i));
          periodEnd = endOfDay(addDays(today, i));
          label = format(periodStart, "MMM d");
          workDays = [0, 6].includes(periodStart.getDay()) ? 0 : 1;
          break;
        case "week":
          periodStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
          periodEnd = endOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
          label = format(periodStart, "MMM d");
          workDays = 5;
          break;
        case "month":
          periodStart = startOfMonth(addMonths(today, i));
          periodEnd = endOfMonth(addMonths(today, i));
          label = format(periodStart, "MMM yy");
          workDays = 22;
          break;
        case "quarter":
          periodStart = startOfQuarter(addQuarters(today, i));
          periodEnd = endOfQuarter(addQuarters(today, i));
          label = `Q${Math.floor(periodStart.getMonth() / 3) + 1} ${format(periodStart, "yy")}`;
          workDays = 65;
          break;
        case "year":
          periodStart = startOfYear(addYears(today, i));
          periodEnd = endOfYear(addYears(today, i));
          label = format(periodStart, "yyyy");
          workDays = 260;
          break;
      }
      result.push({ start: periodStart, end: periodEnd, label, workDays });
    }
    return result;
  }, [teamTimeScale, teamPeriodCount, today]);

  const getTeamPeriodCapacity = (weeklyCapacity: number, period: { workDays: number }) => {
    switch (teamTimeScale) {
      case "day": return weeklyCapacity / 5;
      case "week": return weeklyCapacity;
      case "month": return weeklyCapacity * 4.33;
      case "quarter": return weeklyCapacity * 13;
      case "year": return weeklyCapacity * 52;
    }
  };

  const getAssignmentAllocation = (task: Task, allocationPct: number, weeklyCapacity: number) => {
    return teamPeriods.map(period => {
      if (!task.startDate || !task.endDate) return { allocation: 0, active: false };
      const taskStart = parseISO(task.startDate);
      const taskEnd = parseISO(task.endDate);
      if (taskStart > period.end || taskEnd < period.start) return { allocation: 0, active: false };
      const overlapStart = taskStart > period.start ? taskStart : period.start;
      const overlapEnd = taskEnd < period.end ? taskEnd : period.end;
      const overlapDays = Math.max(0, differenceInDays(overlapEnd, overlapStart) + 1);
      let workDaysInPeriod = teamTimeScale === "day"
        ? ([0, 6].includes(overlapStart.getDay()) ? 0 : 1)
        : Math.min(overlapDays, period.workDays) * (5 / 7);
      const periodCapacity = getTeamPeriodCapacity(weeklyCapacity, period);
      const allocationRatio = workDaysInPeriod / period.workDays;
      const periodAllocation = (allocationPct / 100) * allocationRatio * periodCapacity;
      return { allocation: periodAllocation, active: true };
    });
  };

  interface TeamMemberHeatmapData {
    resource: import("@shared/schema").Resource;
    taskCount: number;
    taskNames: string[];
    weeklyCapacity: number;
    weeks: { allocation: number; tasks: { name: string; allocation: number; taskId: number }[] }[];
    taskDetails: { task: Task; allocation: number; weeks: { allocation: number; active: boolean }[] }[];
  }

  const teamHeatmapData = useMemo((): TeamMemberHeatmapData[] => {
    const memberMap = new Map<number, TeamMemberHeatmapData>();

    for (const member of teamMembers) {
      const weeklyCapacity = member.resource.weeklyCapacity ? Number(member.resource.weeklyCapacity) : 40;
      memberMap.set(member.resource.id, {
        resource: member.resource,
        taskCount: member.taskCount,
        taskNames: member.taskNames,
        weeklyCapacity,
        weeks: teamPeriods.map(() => ({ allocation: 0, tasks: [] })),
        taskDetails: [],
      });
    }

    for (const assignment of projectTaskAssignments) {
      if (!assignment.resource) continue;
      const memberData = memberMap.get(assignment.resourceId);
      if (!memberData) continue;
      const task = projectTasks?.find(t => t.id === assignment.taskId);
      if (!task) continue;
      if (summaryTaskIds.has(task.id)) continue;

      const allocationPct = assignment.allocationPercentage || 100;
      const weekAlloc = getAssignmentAllocation(task, allocationPct, memberData.weeklyCapacity);

      const existingTask = memberData.taskDetails.find(td => td.task.id === task.id);
      if (!existingTask) {
        memberData.taskDetails.push({ task, allocation: allocationPct, weeks: weekAlloc });
        weekAlloc.forEach((w, idx) => {
          if (w.active) {
            memberData.weeks[idx].allocation += w.allocation;
            memberData.weeks[idx].tasks.push({ name: task.name, allocation: allocationPct, taskId: task.id });
          }
        });
      }
    }

    return Array.from(memberMap.values()).sort((a, b) =>
      a.resource.displayName.localeCompare(b.resource.displayName)
    );
  }, [teamMembers, projectTaskAssignments, projectTasks, summaryTaskIds, teamPeriods]);

  const getHeatColor = (allocation: number, capacity: number) => {
    if (allocation === 0) return "bg-slate-50 dark:bg-slate-900";
    const utilization = allocation / capacity;
    if (utilization <= 0.5) return "bg-emerald-100 dark:bg-emerald-900/30";
    if (utilization <= 0.75) return "bg-emerald-200 dark:bg-emerald-800/40";
    if (utilization <= 0.9) return "bg-emerald-300 dark:bg-emerald-700/50";
    if (utilization <= 1.0) return "bg-emerald-400 dark:bg-emerald-600/60";
    if (utilization <= 1.1) return "bg-yellow-300 dark:bg-yellow-700/50";
    if (utilization <= 1.25) return "bg-orange-300 dark:bg-orange-700/50";
    return "bg-red-400 dark:bg-red-600/60";
  };

  const getTextColor = (allocation: number, capacity: number) => {
    if (allocation === 0) return "text-muted-foreground";
    const utilization = allocation / capacity;
    if (utilization > 1.0) return "text-red-900 dark:text-red-100 font-medium";
    if (utilization > 0.75) return "text-emerald-900 dark:text-emerald-100";
    return "text-emerald-800 dark:text-emerald-200";
  };

  const formatTeamCellValue = (allocation: number, capacity: number): string => {
    if (allocation === 0) return "-";
    switch (teamDisplayUnit) {
      case "hours": return `${allocation.toFixed(0)}h`;
      case "percent": return `${((allocation / capacity) * 100).toFixed(0)}%`;
      case "fte": return (allocation / capacity).toFixed(2);
    }
  };

  const teamDataRange = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();
    for (const member of teamHeatmapData) {
      for (const td of member.taskDetails) {
        if (td.task.startDate) {
          const s = parseISO(td.task.startDate);
          if (s < minDate) minDate = s;
        }
        if (td.task.endDate) {
          const e = parseISO(td.task.endDate);
          if (e > maxDate) maxDate = e;
        }
      }
    }
    return { minDate, maxDate };
  }, [teamHeatmapData]);

  const handleTeamAutofit = () => {
    const { minDate, maxDate } = teamDataRange;
    const daysDiff = differenceInDays(maxDate, minDate);
    if (daysDiff <= 21) { setTeamTimeScale("day"); setTeamPeriodCount(Math.min(Math.max(daysDiff + 7, 14), 30)); }
    else if (daysDiff <= 90) { setTeamTimeScale("week"); setTeamPeriodCount(Math.min(Math.ceil(daysDiff / 7) + 2, 16)); }
    else if (daysDiff <= 365) { setTeamTimeScale("month"); setTeamPeriodCount(Math.min(Math.ceil(daysDiff / 30) + 1, 12)); }
    else if (daysDiff <= 730) { setTeamTimeScale("quarter"); setTeamPeriodCount(Math.min(Math.ceil(daysDiff / 90) + 1, 8)); }
    else { setTeamTimeScale("year"); setTeamPeriodCount(Math.min(Math.ceil(daysDiff / 365) + 1, 5)); }
  };

  const handleTeamZoomIn = () => {
    const scales: TeamTimeScale[] = ["year", "quarter", "month", "week", "day"];
    const idx = scales.indexOf(teamTimeScale);
    if (idx < scales.length - 1) { const ns = scales[idx + 1]; setTeamTimeScale(ns); setTeamPeriodCount(DEFAULT_TEAM_PERIODS[ns]); }
    else setTeamPeriodCount(Math.min(teamPeriodCount + 7, 30));
  };

  const handleTeamZoomOut = () => {
    const scales: TeamTimeScale[] = ["year", "quarter", "month", "week", "day"];
    const idx = scales.indexOf(teamTimeScale);
    if (idx > 0) { const ns = scales[idx - 1]; setTeamTimeScale(ns); setTeamPeriodCount(DEFAULT_TEAM_PERIODS[ns]); }
    else setTeamPeriodCount(Math.max(teamPeriodCount - 1, 2));
  };

  const toggleMemberExpanded = (resourceId: number) => {
    setExpandedMembers(prev => {
      const next = new Set(prev);
      if (next.has(resourceId)) next.delete(resourceId);
      else next.add(resourceId);
      return next;
    });
  };

  const totalAssignments = useMemo(() =>
    teamHeatmapData.reduce((sum, m) => sum + m.taskDetails.length, 0),
    [teamHeatmapData]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg">
                  Resource Assignments
                  <Badge variant="secondary" className="ml-2 text-xs">{totalAssignments} assignment{totalAssignments !== 1 ? 's' : ''}</Badge>
                </CardTitle>
              </div>
            </div>
            {!readOnly && (
              <Dialog open={addMemberOpen} onOpenChange={(open) => { setAddMemberOpen(open); if (!open) setSearchValue(""); }}>
                <Button size="sm" className="gap-2" onClick={() => setAddMemberOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                  Add Team Member
                </Button>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Add Team Member
                    </DialogTitle>
                    <DialogDescription>
                      Select a resource to add to the project team.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-2">
                    <Input
                      placeholder="Search by name, email, title, or department..."
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      className="mb-3"
                      autoFocus
                    />
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-1">
                        {availableResources.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            {searchValue ? "No matching resources found" : "All resources are already on the team"}
                          </div>
                        ) : (
                          availableResources.map(resource => (
                            <div
                              key={resource.id}
                              className="flex items-center justify-between p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                              onClick={() => {
                                addResourceToProject(resource.id);
                                setAddMemberOpen(false);
                              }}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-sm font-semibold shrink-0">
                                  {resource.displayName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-medium text-sm">{resource.displayName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {[resource.title, resource.department].filter(Boolean).join(' · ') || resource.email || 'No details'}
                                  </div>
                                </div>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {teamMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-medium text-muted-foreground">No team members yet</h3>
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
                Resources assigned to tasks will automatically appear here. You can also add team members manually.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 pb-2 border-b">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Scale:</span>
                    <Select value={teamTimeScale} onValueChange={(v) => { setTeamTimeScale(v as TeamTimeScale); setTeamPeriodCount(DEFAULT_TEAM_PERIODS[v as TeamTimeScale]); }}>
                      <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Days</SelectItem>
                        <SelectItem value="week">Weeks</SelectItem>
                        <SelectItem value="month">Months</SelectItem>
                        <SelectItem value="quarter">Quarters</SelectItem>
                        <SelectItem value="year">Years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select value={teamDisplayUnit} onValueChange={(v) => setTeamDisplayUnit(v as TeamDisplayUnit)}>
                      <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="percent">% Utilization</SelectItem>
                        <SelectItem value="fte">FTE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleTeamZoomOut} title="Zoom out">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleTeamZoomIn} title="Zoom in">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={handleTeamAutofit} title="Autofit to data range">
                    <Maximize2 className="h-4 w-4 mr-1" />
                    Autofit
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="flex border-b sticky top-0 bg-background z-10">
                    <div className="w-64 flex-shrink-0 p-2 font-medium text-sm border-r">
                      Resource / Task
                    </div>
                    <div className="flex-1 flex">
                      {teamPeriods.map((period, idx) => (
                        <div key={idx} className={`flex-1 p-2 text-center text-xs font-medium border-r text-muted-foreground ${teamTimeScale === "day" ? "min-w-[50px]" : "min-w-[65px]"}`}>
                          {period.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <ScrollArea className="h-[500px]">
                    {teamHeatmapData.map((member) => {
                      const isExpanded = expandedMembers.has(member.resource.id);
                      return (
                        <div key={member.resource.id}>
                          <div
                            className="flex border-b bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => toggleMemberExpanded(member.resource.id)}
                          >
                            <div className="w-64 flex-shrink-0 p-2 border-r">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
                                  {member.resource.displayName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">{member.resource.displayName}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {member.taskDetails.length} assignment{member.taskDetails.length !== 1 ? 's' : ''} • {member.weeklyCapacity}h/week
                                  </p>
                                </div>
                                {!readOnly && member.taskDetails.length === 0 && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="p-1 rounded hover:bg-background/80 transition-colors flex-shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => removeFromTeam(member.resource.id)}
                                      >
                                        <UserMinus className="h-4 w-4 mr-2" />
                                        Remove Resource
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </div>
                            <div className="flex-1 flex">
                              {member.weeks.map((weekData, weekIdx) => {
                                const periodCap = getTeamPeriodCapacity(member.weeklyCapacity, teamPeriods[weekIdx]);
                                return (
                                  <div
                                    key={weekIdx}
                                    className={`flex-1 p-1.5 border-r min-w-[65px] ${getHeatColor(weekData.allocation, periodCap)} transition-colors`}
                                    title={weekData.tasks.length > 0
                                      ? `${weekData.tasks.map(t => `${t.name} (${t.allocation}%)`).join('\n')}\n\nTotal: ${formatTeamCellValue(weekData.allocation, periodCap)}`
                                      : "No assignments"
                                    }
                                  >
                                    <div className={`text-center text-xs ${getTextColor(weekData.allocation, periodCap)}`}>
                                      {formatTeamCellValue(weekData.allocation, periodCap)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {isExpanded && member.taskDetails.map((td) => (
                            <div key={td.task.id} className="flex border-b bg-background hover:bg-muted/10 transition-colors">
                              <div className="w-64 flex-shrink-0 p-2 border-r pl-10">
                                <div className="flex items-center gap-2">
                                  <ListTodo className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{td.task.name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {td.allocation}% allocation
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 flex">
                                {td.weeks.map((w, weekIdx) => {
                                  const periodCap = getTeamPeriodCapacity(member.weeklyCapacity, teamPeriods[weekIdx]);
                                  return (
                                    <div
                                      key={weekIdx}
                                      className={`flex-1 p-1.5 border-r min-w-[65px] ${w.active ? 'bg-primary/10' : 'bg-slate-50 dark:bg-slate-900'} transition-colors`}
                                    >
                                      <div className={`text-center text-xs ${w.active ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                        {w.active ? formatTeamCellValue(w.allocation, periodCap) : "-"}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </ScrollArea>

                  <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground flex-wrap">
                    <span className="font-medium">Utilization:</span>
                    <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-900/30" /><span>0-50%</span></div>
                    <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-emerald-300 dark:bg-emerald-700/50" /><span>50-90%</span></div>
                    <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-emerald-400 dark:bg-emerald-600/60" /><span>90-100%</span></div>
                    <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-yellow-300 dark:bg-yellow-700/50" /><span>100-110%</span></div>
                    <div className="flex items-center gap-1"><div className="w-4 h-4 rounded bg-red-400 dark:bg-red-600/60" /><span>&gt;125%</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectSummaryTab({ project, onUpdate, tasks, readOnly = false }: { project: any; onUpdate: any; tasks: Task[]; readOnly?: boolean }) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { data: resources } = useResources(currentOrganization?.id ?? null);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const createPortfolio = useCreatePortfolio();
  const [managerResourceId, setManagerResourceId] = useState<number | null>(null);
  const [sponsorResourceId, setSponsorResourceId] = useState<number | null>(null);
  const [techLeadResourceId, setTechLeadResourceId] = useState<number | null>(null);
  const [showNewPortfolioDialog, setShowNewPortfolioDialog] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showHealthReasonDialog, setShowHealthReasonDialog] = useState(false);
  const [pendingHealth, setPendingHealth] = useState<string | null>(null);
  const [healthReason, setHealthReason] = useState(project.healthReason || "");

  const { data: summaryRiskAssessment } = useQuery<{ riskScore: number; generatedAt: string; summary: string } | null>({
    queryKey: ["/api/projects", project.id, "risk-assessment", "latest"],
  });

  const summaryRiskBadge = useMemo(() => {
    if (summaryRiskAssessment?.riskScore === undefined || summaryRiskAssessment?.riskScore === null || !summaryRiskAssessment?.generatedAt) return null;
    const generatedAt = new Date(summaryRiskAssessment.generatedAt);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    if (generatedAt <= tenDaysAgo) return null;
    return summaryRiskAssessment;
  }, [summaryRiskAssessment]);
  
  // Calculate completion percentage from tasks (leaf tasks only - those without children)
  const { calculatedCompletion, leafTaskCount } = useMemo(() => {
    if (!tasks || tasks.length === 0) return { calculatedCompletion: 0, leafTaskCount: 0 };
    
    // Find parent task IDs to identify leaf tasks
    const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));
    const leafTasks = tasks.filter(t => !parentIds.has(t.id));
    
    if (leafTasks.length === 0) return { calculatedCompletion: 0, leafTaskCount: 0 };
    
    const totalProgress = leafTasks.reduce((sum, task) => {
      const progress = task.progress ?? 0;
      return sum + Math.max(0, Math.min(100, progress)); // Clamp between 0-100
    }, 0);
    return { 
      calculatedCompletion: Math.round(totalProgress / leafTasks.length),
      leafTaskCount: leafTasks.length 
    };
  }, [tasks]);
  
  // User has overridden if they've explicitly set the override flag
  const storedValue = project.completionPercentage;
  const isOverridden = project.completionOverridden === true;
  
  // Display value: use stored value only if override flag is set, otherwise show calculated
  const displayCompletion = isOverridden ? (storedValue ?? 0) : calculatedCompletion;
  
  const [editValues, setEditValues] = useState({
    name: project.name || "",
    description: project.description || "",
    budget: project.budget || "0",
    completionPercentage: displayCompletion,
  });
  
  useEffect(() => {
    if (project.managerResourceId) {
      setManagerResourceId(project.managerResourceId);
    } else if (project.managerId && resources) {
      const managerResource = resources.find(r => r.userId === project.managerId);
      setManagerResourceId(managerResource ? managerResource.id : null);
    } else {
      setManagerResourceId(null);
    }
  }, [project.managerResourceId, project.managerId, resources]);

  useEffect(() => {
    if (project.sponsorResourceId) {
      setSponsorResourceId(project.sponsorResourceId);
    } else if (project.businessSponsorId && resources) {
      const sponsorResource = resources.find(r => r.userId === project.businessSponsorId);
      setSponsorResourceId(sponsorResource ? sponsorResource.id : null);
    } else {
      setSponsorResourceId(null);
    }
  }, [project.sponsorResourceId, project.businessSponsorId, resources]);

  useEffect(() => {
    if (project.technicalLeadResourceId) {
      setTechLeadResourceId(project.technicalLeadResourceId);
    } else if (project.technicalLeadId && resources) {
      const techLeadResource = resources.find(r => r.userId === project.technicalLeadId);
      setTechLeadResourceId(techLeadResource ? techLeadResource.id : null);
    } else {
      setTechLeadResourceId(null);
    }
  }, [project.technicalLeadResourceId, project.technicalLeadId, resources]);

  useEffect(() => {
    setEditValues({
      name: project.name || "",
      description: project.description || "",
      budget: project.budget || "0",
      completionPercentage: displayCompletion,
    });
  }, [project, displayCompletion]);

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

  // Reset completion to calculated value from tasks
  const resetToCalculated = () => {
    setEditValues(prev => ({ ...prev, completionPercentage: calculatedCompletion }));
    // Save with override flag set to false
    onUpdate({ 
      id: project.id, 
      completionPercentage: calculatedCompletion,
      completionOverridden: false
    }, {
      onSuccess: () => {
        toast({ title: "Reset to calculated value" });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to reset completion", variant: "destructive" });
      }
    });
  };

  const handleFieldBlur = (field: string) => {
    const value = editValues[field as keyof typeof editValues];
    if (value !== project[field as keyof typeof project]) {
      // For completion percentage, also set the override flag
      if (field === 'completionPercentage') {
        onUpdate({ 
          id: project.id, 
          completionPercentage: Number(value),
          completionOverridden: true
        }, {
          onSuccess: () => {
            toast({ title: "Saved" });
            queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] });
          },
          onError: () => {
            toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
          }
        });
      } else {
        autoSave(field, value);
      }
    }
    setEditingField(null);
  };

  const handleSelectChange = (field: string, value: string) => {
    autoSave(field, value);
  };

  const handleHealthChange = (newHealth: string) => {
    if (newHealth !== project.health) {
      setPendingHealth(newHealth);
      setHealthReason("");
      setShowHealthReasonDialog(true);
    }
  };

  const handleAddStatusNote = () => {
    setPendingHealth(null);
    setHealthReason("");
    setShowHealthReasonDialog(true);
  };

  const saveHealthWithReason = () => {
    const updatePayload: Record<string, any> = { 
      id: project.id,
      healthReason: healthReason.trim() || null,
      healthReasonUpdatedAt: new Date().toISOString()
    };
    if (pendingHealth) {
      updatePayload.health = pendingHealth;
    }
    onUpdate(updatePayload, {
      onSuccess: () => {
        toast({ title: pendingHealth ? "Health status updated" : "Status note added" });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] });
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id, 'health-status-history'] });
        setShowHealthReasonDialog(false);
        setPendingHealth(null);
      },
      onError: () => {
        toast({ title: "Error", description: pendingHealth ? "Failed to update health" : "Failed to add status note", variant: "destructive" });
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
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id, 'health-status-history'] });
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
        <CardTitle className="text-lg">Project Summary</CardTitle>
        <CardDescription className="text-xs">Click any field to edit</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
            <div className="col-span-2 overflow-hidden">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Project Name</Label>
              {editingField === 'name' ? (
                <Input
                  value={editValues.name}
                  onChange={(e) => setEditValues(prev => ({ ...prev, name: e.target.value }))}
                  onBlur={() => handleFieldBlur('name')}
                  onKeyDown={(e) => e.key === 'Enter' && handleFieldBlur('name')}
                  autoFocus
                  className="h-8 text-sm font-semibold"
                  data-testid="input-project-name"
                />
              ) : (
                <p className="text-sm font-semibold cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-1 transition-colors h-8 flex items-center truncate" onClick={() => setEditingField('name')} title={project.name} data-testid="text-project-name">
                  {project.name}
                </p>
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Health Status</Label>
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-1" data-testid="toggle-project-health">
                {[
                  { value: 'Green', label: 'Green', bg: 'bg-emerald-500', bgLight: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30' },
                  { value: 'Yellow', label: 'Yellow', bg: 'bg-amber-500', bgLight: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', ring: 'ring-amber-500/30' },
                  { value: 'Red', label: 'Red', bg: 'bg-rose-500', bgLight: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', ring: 'ring-rose-500/30' },
                ].map((option) => {
                  const isSelected = project.health === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleHealthChange(option.value)}
                      className={cn(
                        "flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all",
                        isSelected
                          ? `${option.bgLight} ${option.text} ring-2 ${option.ring} shadow-sm`
                          : "text-muted-foreground hover:bg-muted/80"
                      )}
                      data-testid={`health-option-${option.value.toLowerCase()}`}
                    >
                      <span className={cn(
                        "w-2.5 h-2.5 rounded-full transition-all shrink-0",
                        isSelected ? `${option.bg} shadow-sm` : "bg-muted-foreground/30"
                      )} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleAddStatusNote}
                className="text-[10px] text-primary hover:underline flex items-center gap-1 mt-1"
                data-testid="button-add-status-note"
              >
                <Pencil className="w-3 h-3" />
                {project.healthReason ? "Update note" : "Add status note"}
              </button>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Billable Status</Label>
              <Select 
                value={project.billableStatus || "N/A"} 
                onValueChange={(v) => handleSelectChange('billableStatus', v)}
              >
                <SelectTrigger className="h-8 text-sm" data-testid="select-billable-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N/A"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-400" />N/A</span></SelectItem>
                  <SelectItem value="On Track"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />On Track</span></SelectItem>
                  <SelectItem value="Waiting for Approval"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" />Waiting for Approval</span></SelectItem>
                  <SelectItem value="Verbal Approval"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" />Verbal Approval</span></SelectItem>
                  <SelectItem value="Email Approval"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />Email Approval</span></SelectItem>
                  <SelectItem value="SOW Signed"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />SOW Signed</span></SelectItem>
                  <SelectItem value="PO Received"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />PO Received</span></SelectItem>
                  <SelectItem value="Partially Invoiced"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" />Partially Invoiced</span></SelectItem>
                  <SelectItem value="At Risk"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500" />At Risk</span></SelectItem>
                  <SelectItem value="Ready for Invoice"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />Ready for Invoice</span></SelectItem>
                  <SelectItem value="Critical"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500" />Critical</span></SelectItem>
                  <SelectItem value="Invoiced"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" />Invoiced</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            {project.healthReason && (
              <div className="col-span-2 md:col-span-4">
                <p className="text-xs text-muted-foreground italic">"{project.healthReason}"</p>
              </div>
            )}
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Portfolio
                {currentPortfolio && (
                  <Link href={`/portfolios/${currentPortfolio.id}`} className="text-[10px] text-primary hover:underline ml-1" data-testid="link-portfolio">
                    (view)
                  </Link>
                )}
              </Label>
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
                <p className="text-sm font-medium cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-1 transition-colors h-8 flex items-center" onClick={() => setEditingField('budget')} data-testid="text-project-budget">${Number(project.budget).toLocaleString()}</p>
              )}
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Completion
                {leafTaskCount > 0 && !isOverridden && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[9px] text-muted-foreground/70 cursor-help ml-1">(from tasks)</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Calculated from {leafTaskCount} task(s)</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {isOverridden && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={resetToCalculated}
                        className="text-[9px] text-primary hover:underline cursor-pointer ml-1"
                        data-testid="button-reset-completion"
                      >
                        (reset to {calculatedCompletion}%)
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click to reset to calculated value from tasks</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </Label>
              {editingField === 'completionPercentage' ? (
                <Input type="number" min="0" max="100" value={editValues.completionPercentage} onChange={(e) => setEditValues(prev => ({ ...prev, completionPercentage: Number(e.target.value) }))} onBlur={() => handleFieldBlur('completionPercentage')} onKeyDown={(e) => e.key === 'Enter' && handleFieldBlur('completionPercentage')} autoFocus className="h-8 text-sm" data-testid="input-project-completion" />
              ) : (
                <p className="text-sm font-medium cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-1 transition-colors h-8 flex items-center" onClick={() => setEditingField('completionPercentage')} data-testid="text-project-completion">{displayCompletion}%</p>
              )}
            </div>
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
                  <Calendar mode="single" selected={project.startDate ? new Date(project.startDate) : undefined} defaultMonth={project.startDate ? new Date(project.startDate) : undefined} showDateInput onDateInputSelect={(date) => handleDateChange('startDate', date)} onSelect={(date) => handleDateChange('startDate', date)} initialFocus />
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
                  <Calendar mode="single" selected={project.endDate ? new Date(project.endDate) : undefined} defaultMonth={project.endDate ? new Date(project.endDate) : undefined} showDateInput onDateInputSelect={(date) => handleDateChange('endDate', date)} onSelect={(date) => handleDateChange('endDate', date)} initialFocus />
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
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Business Sponsor</Label>
              <ResourceSelector
                organizationId={currentOrganization?.id ?? 0}
                projectId={project.id}
                selectedResourceId={sponsorResourceId}
                onSelectionChange={(resourceId) => {
                  const selectedResource = resources?.find(r => r.id === resourceId);
                  setSponsorResourceId(resourceId);
                  onUpdate({ id: project.id, businessSponsorId: selectedResource?.userId || null, sponsorResourceId: resourceId }, {
                    onSuccess: () => { toast({ title: "Business Sponsor updated" }); queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] }); },
                    onError: () => { toast({ title: "Error", description: "Failed to update business sponsor", variant: "destructive" }); }
                  });
                }}
                placeholder="Assign"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Technical Lead</Label>
              <ResourceSelector
                organizationId={currentOrganization?.id ?? 0}
                projectId={project.id}
                selectedResourceId={techLeadResourceId}
                onSelectionChange={(resourceId) => {
                  const selectedResource = resources?.find(r => r.id === resourceId);
                  setTechLeadResourceId(resourceId);
                  onUpdate({ id: project.id, technicalLeadId: selectedResource?.userId || null, technicalLeadResourceId: resourceId }, {
                    onSuccess: () => { toast({ title: "Technical Lead updated" }); queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id] }); },
                    onError: () => { toast({ title: "Error", description: "Failed to update technical lead", variant: "destructive" }); }
                  });
                }}
                placeholder="Assign"
                className="h-8 text-sm"
              />
            </div>
            {summaryRiskBadge && (
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">AI Risk Score</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md cursor-help h-8",
                      summaryRiskBadge.riskScore <= 25 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      summaryRiskBadge.riskScore <= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                      summaryRiskBadge.riskScore <= 75 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" :
                      "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                    )} data-testid="summary-risk-score-badge">
                      <Shield className="h-3.5 w-3.5" />
                      <span className="text-sm font-semibold">{summaryRiskBadge.riskScore}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-xs">{summaryRiskBadge.summary}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
          {(() => {
            const totalEstimated = tasks.reduce((sum, t) => sum + (t.estimatedHours ? Number(t.estimatedHours) : 0), 0);
            const totalActual = tasks.reduce((sum, t) => sum + (t.actualHours ? Number(t.actualHours) : 0), 0);
            if (totalEstimated === 0 && totalActual === 0) return null;
            const variance = totalActual - totalEstimated;
            const ratio = totalEstimated > 0 ? Math.round((totalActual / totalEstimated) * 100) : 0;
            const isOver = variance > 0;
            return (
              <div className="rounded-md border p-3 bg-muted/20" data-testid="project-effort-summary">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 block">Effort Summary</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Estimated</span>
                    <p className="text-sm font-semibold" data-testid="text-project-estimated-hours">{totalEstimated.toFixed(1)}h</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Actual</span>
                    <p className="text-sm font-semibold" data-testid="text-project-actual-hours">{totalActual.toFixed(1)}h</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Variance</span>
                    <p className={cn("text-sm font-semibold", isOver ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")} data-testid="text-project-effort-variance">
                      {isOver ? '+' : ''}{variance.toFixed(1)}h
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Utilization</span>
                    <p className="text-sm font-semibold" data-testid="text-project-utilization">{ratio}%</p>
                    <Progress value={Math.min(ratio, 100)} className="mt-1 h-1.5" />
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="project-is-internal"
                checked={(project as any).isInternal || false}
                onCheckedChange={(checked) => autoSave('isInternal', checked === true)}
                data-testid="checkbox-project-is-internal"
              />
              <Label htmlFor="project-is-internal" className="text-xs text-muted-foreground cursor-pointer">
                Internal project
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="project-timesheet-blocked"
                checked={project.timesheetBlocked || false}
                onCheckedChange={(checked) => autoSave('timesheetBlocked', checked === true)}
                data-testid="checkbox-project-timesheet-blocked"
              />
              <Label htmlFor="project-timesheet-blocked" className="text-xs text-muted-foreground cursor-pointer">
                Block timesheet entries
              </Label>
            </div>
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
        <ProjectCustomFieldsSection projectId={project.id} organizationId={currentOrganization?.id} />
      </CardContent>
    </Card>

    {currentOrganization?.id && (
      <Card className="mt-4">
        <CardContent className="pt-4">
          <CrossProjectReferences
            entityType="project"
            entityId={project.id}
            entityProjectId={project.id}
            organizationId={currentOrganization.id}
          />
        </CardContent>
      </Card>
    )}
    
    <Dialog open={showHealthReasonDialog} onOpenChange={(open) => {
        if (!open) {
          setShowHealthReasonDialog(false);
          setPendingHealth(null);
        }
      }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {pendingHealth ? "Change Health Status" : "Add Status Note"}
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
            {pendingHealth 
              ? "Optionally provide a reason for this health status change."
              : "Add a status update note. This will be recorded in the health status history."
            }
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={healthReason}
            onChange={(e) => setHealthReason(e.target.value)}
            placeholder={pendingHealth 
              ? "e.g., Budget overrun by 15%, Key milestone delayed..."
              : "e.g., Sprint 3 completed on schedule, awaiting client feedback..."
            }
            className="min-h-[80px]"
            data-testid="input-health-reason"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {pendingHealth ? (
            <Button variant="ghost" onClick={skipHealthReason} data-testid="button-skip-reason">
              Skip
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => { setShowHealthReasonDialog(false); setPendingHealth(null); }}>
              Cancel
            </Button>
          )}
          <Button 
            onClick={saveHealthWithReason} 
            disabled={!pendingHealth && !healthReason.trim()}
            data-testid="button-save-reason"
          >
            {pendingHealth ? "Save with Reason" : "Save Note"}
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
    const searchLower = normalizeSearch(mentionSearch);
    return (
      normalizeSearch(u.username).includes(searchLower) ||
      normalizeSearch(u.email).includes(searchLower) ||
      normalizeSearch(u.firstName).includes(searchLower) ||
      normalizeSearch(u.lastName).includes(searchLower)
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
