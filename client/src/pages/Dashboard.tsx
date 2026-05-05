import { useState, useEffect, useMemo, useRef } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLocation, useSearch } from "wouter";
import { useUserJourney } from "@/hooks/use-user-journey";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  PortfoliosDashboard, 
  ExecutiveDashboard, 
  StrategicKPIsDashboard,
  TrendAnalysisDashboard,
  FinancialsOverviewDashboard,
  SCurveDashboard,
  EVAnalysisDashboard,
  ForecastingDashboard,
  CashFlowDashboard,
  VarianceTrendsDashboard,
  PortfolioRollupDashboard,
  PortfolioHealthDashboard,
  PortfolioAllocationDashboard,
  PortfolioTimelineDashboard,
  IntakePipelineDashboard,
  IntakeApprovalDashboard,
  IntakeCapacityDashboard,
  RiskMatrixDashboard,
  IssueTrackerDashboard,
  MitigationStatusDashboard,
  RisksIssuesDashboard,
  ResourceDashboard,
  ResourceManagementDashboard,
  ResourceAllocationDashboard,
  ResourceUtilizationDashboard,
  ResourceCapacityDashboard,
  TimesheetReportDashboard,
  TimesheetWeeklySummaryDashboard,
  TimesheetProjectHoursDashboard,
  TimesheetResourceHoursDashboard,
  IntakeDashboard,
  CustomDashboard,
  CreateCustomDashboardDialog,
  AddPowerBIDialog,
  KpiAnalyticsDashboard,
  AgentReportsDashboard,
  AgentDashboardsDashboard,
} from "@/components/dashboard";
import { 
  LayoutDashboard, 
  FolderKanban, 
  ShieldAlert, 
  Users, 
  Clock,
  FileInput,
  MoreVertical,
  Plus,
  Sparkles,
  BarChart3,
  Eye,
  EyeOff,
  ChevronDown,
  TrendingUp,
  DollarSign,
  Target,
  Activity,
  PieChart,
  Calendar,
  Workflow,
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  UserCheck,
  Gauge,
  CalendarDays,
  FileBarChart,
  Timer,
  GripVertical,
  Bookmark,
} from "lucide-react";
import { SiTableau, SiLooker, SiMetabase } from "react-icons/si";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CustomDashboard as CustomDashboardType } from "@shared/schema";
import { cn } from "@/lib/utils";
import { 
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SubMenuItem = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type DashboardTab = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  submenus: SubMenuItem[];
};

const DASHBOARD_TABS: DashboardTab[] = [
  { 
    id: "executive", 
    label: "Executive", 
    icon: LayoutDashboard,
    submenus: [
      { id: "executive-overview", label: "Overview", icon: LayoutDashboard },
      { id: "executive-strategic", label: "Strategic KPIs", icon: Target },
      { id: "executive-trends", label: "Trend Analysis", icon: TrendingUp },
    ]
  },
  {
    id: "financials",
    label: "Financials",
    icon: DollarSign,
    submenus: [
      { id: "financials-overview", label: "Overview", icon: LayoutDashboard },
      { id: "financials-scurves", label: "S-Curves", icon: TrendingUp },
      { id: "financials-ev", label: "EV Analysis", icon: Activity },
      { id: "financials-forecasting", label: "Forecasting", icon: Target },
      { id: "financials-cashflow", label: "Cash Flow", icon: DollarSign },
      { id: "financials-variance", label: "Variance Trends", icon: AlertTriangle },
      { id: "financials-portfolio", label: "Portfolio Rollup", icon: PieChart },
    ]
  },
  { 
    id: "portfolios", 
    label: "Portfolios", 
    icon: FolderKanban,
    submenus: [
      { id: "portfolios-overview", label: "Overview", icon: FolderKanban },
      { id: "portfolios-health", label: "Portfolio Health", icon: Activity },
      { id: "portfolios-allocation", label: "Allocation", icon: PieChart },
      { id: "portfolios-timeline", label: "Timeline", icon: Calendar },
    ]
  },
  { 
    id: "intake", 
    label: "Intake", 
    icon: FileInput,
    submenus: [
      { id: "intake-overview", label: "Overview", icon: FileInput },
      { id: "intake-pipeline", label: "Request Pipeline", icon: Workflow },
      { id: "intake-approvals", label: "Approval Workflow", icon: CheckCircle },
      { id: "intake-capacity", label: "Capacity Analysis", icon: Gauge },
    ]
  },
  { 
    id: "risks-issues", 
    label: "Risks & Issues", 
    icon: ShieldAlert,
    submenus: [
      { id: "risks-issues-overview", label: "Overview", icon: ShieldAlert },
      { id: "risks-issues-matrix", label: "Risk Matrix", icon: AlertTriangle },
      { id: "risks-issues-tracker", label: "Issue Tracker", icon: ClipboardList },
      { id: "risks-issues-mitigation", label: "Mitigation Status", icon: CheckCircle },
    ]
  },
  { 
    id: "resources", 
    label: "Resources", 
    icon: Users,
    submenus: [
      { id: "resources-overview", label: "Overview", icon: Users },
      { id: "resources-allocation", label: "Allocation", icon: PieChart },
      { id: "resources-utilization", label: "Utilization", icon: Gauge },
      { id: "resources-capacity", label: "Capacity Planning", icon: UserCheck },
    ]
  },
  { 
    id: "timesheet", 
    label: "Timesheet", 
    icon: Clock,
    submenus: [
      { id: "timesheet-overview", label: "Overview", icon: Clock },
      { id: "timesheet-weekly", label: "Weekly Summary", icon: CalendarDays },
      { id: "timesheet-project", label: "Project Hours", icon: FileBarChart },
      { id: "timesheet-resource", label: "Resource Hours", icon: Timer },
    ]
  },
  {
    id: "kpi-analytics",
    label: "KPI Analytics",
    icon: BarChart3,
    submenus: [
      { id: "kpi-analytics-overview", label: "Overview", icon: BarChart3 },
    ]
  },
  {
    id: "agent-reports",
    label: "Agent Reports",
    icon: Bookmark,
    submenus: [
      { id: "agent-reports-overview", label: "Overview", icon: Bookmark },
    ]
  },
  {
    id: "agent-dashboards",
    label: "Agent Dashboards",
    icon: Sparkles,
    submenus: [
      { id: "agent-dashboards-overview", label: "Overview", icon: Sparkles },
    ]
  },
];

type TabId = string | `custom-${number}`;

const STORAGE_KEY = "dashboard-active-tab";

type UnifiedTab = {
  id: string;
  type: 'builtin' | 'custom';
  label: string;
  icon?: typeof LayoutDashboard;
  dashboardId?: number;
  submenus?: SubMenuItem[];
};

interface SortableTabProps {
  tab: UnifiedTab;
  isAdmin: boolean;
  isReorderMode: boolean;
  activeSubmenu: string;
  onSubmenuChange: (submenuId: string) => void;
}

function TabContent({ tab, activeSubmenu, onSubmenuChange, showGrip }: { tab: UnifiedTab; activeSubmenu: string; onSubmenuChange: (id: string) => void; showGrip?: boolean }) {
  if (tab.type === 'custom') {
    const isActive = activeSubmenu === tab.id;
    return (
      <>
        {showGrip && <GripVertical className="h-4 w-4 text-muted-foreground mr-1" />}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSubmenuChange(tab.id)}
          className={`flex items-center gap-1 sm:gap-2 h-auto sm:h-9 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${isActive ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
          data-testid={`tab-${tab.id}`}
        >
          <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span className="text-[11px] sm:text-sm whitespace-nowrap">{tab.label}</span>
        </Button>
      </>
    );
  }

  const Icon = tab.icon!;
  const isActive = activeSubmenu.startsWith(tab.id);

  return (
    <>
      {showGrip && <GripVertical className="h-4 w-4 text-muted-foreground mr-1" />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`flex items-center gap-1 sm:gap-1.5 h-auto sm:h-9 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${isActive ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
            data-testid={`tab-${tab.id}`}
          >
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="text-[11px] sm:text-sm whitespace-nowrap">{tab.label}</span>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 max-w-[300px]">
            {tab.submenus?.map((submenu) => {
              const SubIcon = submenu.icon;
              const isSubmenuActive = activeSubmenu === submenu.id;
              return (
                <DropdownMenuItem
                  key={submenu.id}
                  onClick={() => onSubmenuChange(submenu.id)}
                  className={cn("flex items-center gap-2", isSubmenuActive ? 'bg-accent' : '')}
                  data-testid={`submenu-${submenu.id}`}
                >
                  <SubIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1" title={submenu.label}>
                    {submenu.label}
                  </span>
                  {isSubmenuActive && <CheckCircle className="h-3 w-3 ml-auto text-primary shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function SortableTab({ tab, isAdmin, isReorderMode, activeSubmenu, onSubmenuChange }: SortableTabProps) {
  const canDrag = isAdmin && isReorderMode;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center shrink-0"
      {...attributes}
      {...listeners}
    >
      <TabContent tab={tab} activeSubmenu={activeSubmenu} onSubmenuChange={onSubmenuChange} showGrip />
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const viewParam = searchParams.get("view") as TabId | null;
  const { currentOrganization, memberships } = useOrganization();
  const { user } = useAuth();
  const { trackChecklistEvent } = useUserJourney();

  useEffect(() => {
    trackChecklistEvent("explore_dashboard");
  }, [trackChecklistEvent]);
  
  const [activeSubmenu, setActiveSubmenu] = useState<string>("executive-overview");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPowerBIDialog, setShowPowerBIDialog] = useState(false);
  const [showComingSoonDialog, setShowComingSoonDialog] = useState<string | null>(null);
  const [selectedCustomDashboard, setSelectedCustomDashboard] = useState<number | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [hiddenCustomDashboards, setHiddenCustomDashboards] = useState<number[]>(() => {
    const stored = localStorage.getItem(`hidden-custom-dashboards-${currentOrganization?.id}`);
    return stored ? JSON.parse(stored) : [];
  });

  // Easter egg: "friday" secret code for comic
  const [showComic, setShowComic] = useState(false);
  const [comicData, setComicData] = useState<{ img: string; title: string; alt: string; num: number } | null>(null);
  const [comicLoading, setComicLoading] = useState(false);
  const secretCodeRef = useRef<string>("");
  const SECRET_CODE = "friday";

  // Fetch random XKCD comic via server proxy (bypasses CORS)
  const fetchRandomComic = async () => {
    setComicLoading(true);
    try {
      const res = await fetch('/api/xkcd/random');
      const comic = await res.json();
      setComicData({
        img: comic.img,
        title: comic.title,
        alt: comic.alt,
        num: comic.num
      });
    } catch (error) {
      console.error('Failed to fetch comic:', error);
      // Fallback to a known good comic
      setComicData({
        img: 'https://imgs.xkcd.com/comics/compiling.png',
        title: 'Compiling',
        alt: 'Are you stealing those LCDs? Yeah, but I\'m doing it while my code compiles.',
        num: 303
      });
    }
    setComicLoading(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only track letter keys, ignore modifiers
      if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
        secretCodeRef.current += e.key.toLowerCase();
        // Keep only the last N characters where N is the secret code length
        if (secretCodeRef.current.length > SECRET_CODE.length) {
          secretCodeRef.current = secretCodeRef.current.slice(-SECRET_CODE.length);
        }
        // Check if secret code is entered
        if (secretCodeRef.current === SECRET_CODE) {
          fetchRandomComic();
          setShowComic(true);
          secretCodeRef.current = "";
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Update localStorage when hidden custom dashboards change
  useEffect(() => {
    if (currentOrganization?.id) {
      localStorage.setItem(`hidden-custom-dashboards-${currentOrganization.id}`, JSON.stringify(hiddenCustomDashboards));
    }
  }, [hiddenCustomDashboards, currentOrganization?.id]);

  // Toggle custom dashboard visibility
  const toggleCustomDashboardVisibility = (dashboardId: number) => {
    setHiddenCustomDashboards(prev => 
      prev.includes(dashboardId) 
        ? prev.filter(id => id !== dashboardId)
        : [...prev, dashboardId]
    );
  };

  // Check if user is org admin or super admin
  const isOrgAdmin = useMemo(() => {
    if (!currentOrganization || !user) return false;
    if (user.role === 'super_admin') return true;
    return memberships.some(
      m => m.organizationId === currentOrganization.id && m.role === 'org_admin'
    );
  }, [currentOrganization, user, memberships]);

  // Fetch tab order and hidden tabs for current organization
  const { data: tabOrderData } = useQuery<{ tabOrder: string[]; hiddenTabs: string[] }>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'dashboard-tab-order'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${currentOrganization?.id}/dashboard-tab-order`);
      if (!res.ok) throw new Error('Failed to fetch tab order');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  // Mutation to update tab order and hidden tabs
  const updateTabOrderMutation = useMutation({
    mutationFn: async (data: { tabOrder?: string[]; hiddenTabs?: string[] }) => {
      return apiRequest('PUT', `/api/organizations/${currentOrganization?.id}/dashboard-tab-order`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentOrganization?.id, 'dashboard-tab-order'] });
    },
  });

  // Pin a tab (remove from hidden)
  const handlePinTab = (tabId: string) => {
    const currentHidden = tabOrderData?.hiddenTabs || [];
    const newHidden = currentHidden.filter(id => id !== tabId);
    updateTabOrderMutation.mutate({ hiddenTabs: newHidden });
  };

  // Hide a tab (add to hidden)
  const handleHideTab = (tabId: string) => {
    const currentHidden = tabOrderData?.hiddenTabs || [];
    if (!currentHidden.includes(tabId)) {
      updateTabOrderMutation.mutate({ hiddenTabs: [...currentHidden, tabId] });
    }
  };

  const { data: customDashboards } = useQuery<CustomDashboardType[]>({
    queryKey: [`/api/custom-dashboards?organizationId=${currentOrganization?.id}`],
    enabled: !!currentOrganization?.id,
  });

  // Get sorted tabs based on saved order, separating visible and hidden
  const { visibleTabs, hiddenTabs } = useMemo(() => {
    const savedOrder = tabOrderData?.tabOrder || [];
    const hiddenTabIds = tabOrderData?.hiddenTabs || [];
    
    // Create unified tabs from built-in tabs (include submenus)
    const builtinUnified: UnifiedTab[] = DASHBOARD_TABS.map(tab => ({
      id: tab.id,
      type: 'builtin' as const,
      label: tab.label,
      icon: tab.icon,
      submenus: tab.submenus,
    }));
    
    // Create unified tabs from custom dashboards (visible ones only in tab bar)
    const customUnified: UnifiedTab[] = (customDashboards || [])
      .filter(d => !hiddenCustomDashboards.includes(d.id))
      .map(d => ({
        id: `custom-${d.id}`,
        type: 'custom' as const,
        label: d.name,
        dashboardId: d.id,
      }));
    
    // Combine all tabs
    const allTabs = [...builtinUnified, ...customUnified];
    
    // Sort all tabs based on saved order
    const allSorted = allTabs.sort((a, b) => {
      const aIndex = savedOrder.indexOf(a.id);
      const bIndex = savedOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    // Separate visible and hidden tabs (only built-in tabs can be hidden via hiddenTabIds)
    const visible = allSorted.filter(tab => {
      if (tab.type === 'builtin') {
        return !hiddenTabIds.includes(tab.id);
      }
      return true; // Custom dashboards are shown if not in hiddenCustomDashboards
    });
    const hidden = allSorted.filter(tab => tab.type === 'builtin' && hiddenTabIds.includes(tab.id));
    
    return { visibleTabs: visible, hiddenTabs: hidden };
  }, [tabOrderData?.tabOrder, tabOrderData?.hiddenTabs, customDashboards, hiddenCustomDashboards]);

  // DnD sensors - only used when reorder mode is enabled
  const activeSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Check if dropping on the "hide" dropzone
    if (over.id === 'hide-dropzone') {
      handleHideTab(active.id as string);
      return;
    }

    const oldIndex = visibleTabs.findIndex(t => t.id === active.id);
    const newIndex = visibleTabs.findIndex(t => t.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(visibleTabs.map(t => t.id), oldIndex, newIndex);
      updateTabOrderMutation.mutate({ tabOrder: newOrder });
    }
  };

  const getInitialSubmenu = (): string => {
    if (viewParam) {
      // Legacy alias: the Executive → Financial Summary submenu has been
      // absorbed into the dedicated Financials → Overview report. Remap old
      // bookmarks (`?view=executive-financial`) to the new submenu so the
      // Financials parent tab activates correctly.
      if (viewParam === "executive-financial") {
        return "financials-overview";
      }
      // Check if it's a submenu ID
      for (const tab of DASHBOARD_TABS) {
        if (tab.submenus.some(s => s.id === viewParam)) {
          return viewParam;
        }
      }
      // Check if it's a custom dashboard
      if (viewParam.startsWith('custom-')) {
        return viewParam;
      }
      // Legacy support: if it's a main tab ID, return its first submenu
      const mainTab = DASHBOARD_TABS.find(t => t.id === viewParam);
      if (mainTab) {
        return mainTab.submenus[0].id;
      }
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Check if stored value is a valid submenu
      for (const tab of DASHBOARD_TABS) {
        if (tab.submenus.some(s => s.id === stored)) {
          return stored;
        }
      }
      if (stored.startsWith('custom-')) {
        return stored;
      }
    }
    return "executive-overview";
  };

  useEffect(() => {
    const initialSubmenu = getInitialSubmenu();
    setActiveSubmenu(initialSubmenu);
    // Also set selectedCustomDashboard if it's a custom tab
    if (initialSubmenu.startsWith('custom-')) {
      const dashboardId = Number(initialSubmenu.replace('custom-', ''));
      setSelectedCustomDashboard(dashboardId);
    }
  }, [viewParam]);

  const handleSubmenuChange = (submenuId: string) => {
    setActiveSubmenu(submenuId);
    localStorage.setItem(STORAGE_KEY, submenuId);
    setLocation(`/dashboards?view=${submenuId}`, { replace: true });
    
    if (submenuId.startsWith('custom-')) {
      const dashboardId = Number(submenuId.replace('custom-', ''));
      setSelectedCustomDashboard(dashboardId);
    } else {
      setSelectedCustomDashboard(null);
    }
  };

  const handleCustomDashboardCreated = (dashboardId: number) => {
    const tabId = `custom-${dashboardId}`;
    setActiveSubmenu(tabId);
    setSelectedCustomDashboard(dashboardId);
    localStorage.setItem(STORAGE_KEY, tabId);
    setLocation(`/dashboards?view=${tabId}`, { replace: true });
  };

  const handleSelectCustomDashboard = (dashboardId: number) => {
    const tabId = `custom-${dashboardId}`;
    setActiveSubmenu(tabId);
    setSelectedCustomDashboard(dashboardId);
    localStorage.setItem(STORAGE_KEY, tabId);
    setLocation(`/dashboards?view=${tabId}`, { replace: true });
  };

  const isCustomTab = activeSubmenu.startsWith('custom-');

  return (
    <div className="space-y-6">
      <div className="w-full flex flex-wrap items-center h-auto gap-1 bg-muted/50 p-1 rounded-lg" data-testid="dashboard-tabs">
        {isReorderMode ? (
          <DndContext
            sensors={activeSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleTabs.map(t => t.id)}
              strategy={horizontalListSortingStrategy}
            >
              {visibleTabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isAdmin={isOrgAdmin}
                  isReorderMode={isReorderMode}
                  activeSubmenu={activeSubmenu}
                  onSubmenuChange={handleSubmenuChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          visibleTabs.map((tab) => (
            <div key={tab.id} className="flex items-center">
              <TabContent tab={tab} activeSubmenu={activeSubmenu} onSubmenuChange={handleSubmenuChange} />
            </div>
          ))
        )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-lg"
                data-testid="button-custom-dashboards-menu"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 min-w-64">
              {isOrgAdmin && (
                <DropdownMenuItem 
                  onClick={() => setIsReorderMode(!isReorderMode)}
                  data-testid="menu-item-reorder"
                >
                  <GripVertical className="h-4 w-4 mr-2" />
                  {isReorderMode ? 'Done Reordering' : 'Reorder'}
                </DropdownMenuItem>
              )}
              {isOrgAdmin && <DropdownMenuSeparator />}
              <DropdownMenuItem 
                onClick={() => setShowCreateDialog(true)}
                data-testid="menu-item-create-dashboard"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Custom Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowPowerBIDialog(true)}
                data-testid="menu-item-add-powerbi"
              >
                <BarChart3 className="h-4 w-4 mr-2 text-amber-500" />
                Add Power BI Report
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowComingSoonDialog("Tableau")}
                data-testid="menu-item-add-tableau"
              >
                <SiTableau className="h-4 w-4 mr-2 text-[#E97627]" />
                Add Tableau Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowComingSoonDialog("Looker")}
                data-testid="menu-item-add-looker"
              >
                <SiLooker className="h-4 w-4 mr-2 text-[#4285F4]" />
                Add Looker Report
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowComingSoonDialog("Qlik")}
                data-testid="menu-item-add-qlik"
              >
                <BarChart3 className="h-4 w-4 mr-2 text-[#009845]" />
                Add Qlik Visualization
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowComingSoonDialog("Metabase")}
                data-testid="menu-item-add-metabase"
              >
                <SiMetabase className="h-4 w-4 mr-2 text-[#509EE3]" />
                Add Metabase Dashboard
              </DropdownMenuItem>
              
              {/* All Tabs Section - Admin can toggle visibility */}
              {isOrgAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Dashboard Tabs
                  </div>
                  {DASHBOARD_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isHidden = (tabOrderData?.hiddenTabs || []).includes(tab.id);
                    return (
                      <DropdownMenuItem
                        key={tab.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          if (isHidden) {
                            handlePinTab(tab.id);
                          } else {
                            handleHideTab(tab.id);
                          }
                        }}
                        data-testid={`menu-item-toggle-${tab.id}`}
                      >
                        {isHidden ? (
                          <EyeOff className="h-4 w-4 mr-2 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 mr-2 text-green-500" />
                        )}
                        <Icon className="h-4 w-4 mr-2" />
                        <span className={`flex-1 ${isHidden ? 'text-muted-foreground' : ''}`}>{tab.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}

              {customDashboards && customDashboards.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Saved Dashboards
                  </div>
                  {customDashboards.map((dashboard) => {
                    const isHidden = hiddenCustomDashboards.includes(dashboard.id);
                    return (
                      <DropdownMenuItem
                        key={dashboard.id}
                        onSelect={(e) => {
                          if (isOrgAdmin) {
                            e.preventDefault();
                            toggleCustomDashboardVisibility(dashboard.id);
                          } else {
                            handleSelectCustomDashboard(dashboard.id);
                          }
                        }}
                        data-testid={`menu-item-dashboard-${dashboard.id}`}
                      >
                        {isOrgAdmin && (
                          isHidden ? (
                            <EyeOff className="h-4 w-4 mr-2 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 mr-2 text-green-500" />
                          )
                        )}
                        <Sparkles className="h-4 w-4 mr-2" />
                        <span className={`flex-1 truncate ${isHidden ? 'text-muted-foreground' : ''}`}>{dashboard.name}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
      </div>

      {/* Dashboard Content - render based on activeSubmenu */}
      <div className="mt-6" data-testid={`content-${activeSubmenu}`}>
        {/* Executive Dashboard submenus */}
        {activeSubmenu === 'executive-overview' && <ExecutiveDashboard />}
        {activeSubmenu === 'executive-strategic' && <StrategicKPIsDashboard />}
        {activeSubmenu === 'executive-trends' && <TrendAnalysisDashboard />}
        {/* Legacy redirect: the Executive → Financial Summary tab has been
            absorbed into the dedicated Financials → Overview report. */}

        {/* Financials Dashboard submenus (Project Controls / EVM) */}
        {activeSubmenu === 'financials-overview' && <FinancialsOverviewDashboard />}
        {activeSubmenu === 'financials-scurves' && <SCurveDashboard />}
        {activeSubmenu === 'financials-ev' && <EVAnalysisDashboard />}
        {activeSubmenu === 'financials-forecasting' && <ForecastingDashboard />}
        {activeSubmenu === 'financials-cashflow' && <CashFlowDashboard />}
        {activeSubmenu === 'financials-variance' && <VarianceTrendsDashboard />}
        {activeSubmenu === 'financials-portfolio' && <PortfolioRollupDashboard />}

        {/* Portfolios Dashboard submenus */}
        {activeSubmenu === 'portfolios-overview' && <PortfoliosDashboard />}
        {activeSubmenu === 'portfolios-health' && <PortfolioHealthDashboard />}
        {activeSubmenu === 'portfolios-allocation' && <PortfolioAllocationDashboard />}
        {activeSubmenu === 'portfolios-timeline' && <PortfolioTimelineDashboard />}
        
        {/* Intake Dashboard submenus */}
        {activeSubmenu === 'intake-overview' && <IntakeDashboard />}
        {activeSubmenu === 'intake-pipeline' && <IntakePipelineDashboard />}
        {activeSubmenu === 'intake-approvals' && <IntakeApprovalDashboard />}
        {activeSubmenu === 'intake-capacity' && <IntakeCapacityDashboard />}
        
        {/* Risks & Issues Dashboard submenus */}
        {activeSubmenu === 'risks-issues-overview' && <RisksIssuesDashboard />}
        {activeSubmenu === 'risks-issues-matrix' && <RiskMatrixDashboard />}
        {activeSubmenu === 'risks-issues-tracker' && <IssueTrackerDashboard />}
        {activeSubmenu === 'risks-issues-mitigation' && <MitigationStatusDashboard />}
        
        {/* Resources Dashboard submenus */}
        {activeSubmenu === 'resources-overview' && <ResourceDashboard />}
        {activeSubmenu === 'resources-allocation' && <ResourceAllocationDashboard />}
        {activeSubmenu === 'resources-utilization' && <ResourceUtilizationDashboard />}
        {activeSubmenu === 'resources-capacity' && <ResourceCapacityDashboard />}
        
        {/* Timesheet Dashboard submenus */}
        {activeSubmenu === 'timesheet-overview' && <TimesheetReportDashboard />}
        {activeSubmenu === 'timesheet-weekly' && <TimesheetWeeklySummaryDashboard />}
        {activeSubmenu === 'timesheet-project' && <TimesheetProjectHoursDashboard />}
        {activeSubmenu === 'timesheet-resource' && <TimesheetResourceHoursDashboard />}

        {/* KPI Analytics Dashboard */}
        {activeSubmenu === 'kpi-analytics-overview' && <ErrorBoundary><KpiAnalyticsDashboard /></ErrorBoundary>}

        {/* Agent Reports & Agent Dashboards */}
        {activeSubmenu === 'agent-reports-overview' && (
          <ErrorBoundary><AgentReportsDashboard /></ErrorBoundary>
        )}
        {activeSubmenu === 'agent-dashboards-overview' && (
          <ErrorBoundary>
            <AgentDashboardsDashboard onOpenDashboard={handleSelectCustomDashboard} />
          </ErrorBoundary>
        )}
        
        {/* Custom Dashboards */}
        {activeSubmenu.startsWith('custom-') && selectedCustomDashboard && (
          <CustomDashboard 
            dashboardId={selectedCustomDashboard} 
            onDelete={() => {
              setActiveSubmenu("executive-overview");
              setSelectedCustomDashboard(null);
              setLocation('/dashboards?view=executive-overview', { replace: true });
            }}
          />
        )}
      </div>

      <CreateCustomDashboardDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleCustomDashboardCreated}
      />

      <AddPowerBIDialog
        open={showPowerBIDialog}
        onOpenChange={setShowPowerBIDialog}
        onCreated={handleCustomDashboardCreated}
      />

      <Dialog open={!!showComingSoonDialog} onOpenChange={() => setShowComingSoonDialog(null)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-coming-soon">
          <DialogHeader>
            <DialogTitle>{showComingSoonDialog} Integration</DialogTitle>
            <DialogDescription>
              {showComingSoonDialog} integration is coming soon! We're working hard to bring you seamless integration with {showComingSoonDialog} dashboards and reports.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Button onClick={() => setShowComingSoonDialog(null)} data-testid="button-coming-soon-close">
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Easter Egg: Comic Dialog */}
      <Dialog open={showComic} onOpenChange={setShowComic}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl flex items-center justify-center gap-2">
              <span className="text-3xl">🎉</span> Happy Friday!
            </DialogTitle>
            <DialogDescription className="text-center">
              You discovered the secret code! Here's a random comic for you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {comicLoading ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Loading comic...</p>
              </div>
            ) : comicData ? (
              <>
                <div className="bg-white rounded-lg border-2 border-amber-200 shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/50 px-4 py-2 border-b border-amber-200">
                    <p className="font-bold text-center text-amber-800 dark:text-amber-200">
                      #{comicData.num}: {comicData.title}
                    </p>
                  </div>
                  <div className="p-4 bg-white">
                    <img 
                      src={comicData.img} 
                      alt={comicData.title}
                      className="max-w-full h-auto mx-auto"
                      title={comicData.alt}
                    />
                  </div>
                  <div className="bg-slate-50 px-4 py-3 border-t">
                    <p className="text-xs text-slate-600 italic text-center">
                      {comicData.alt}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
            
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <Button 
                variant="outline" 
                onClick={fetchRandomComic}
                disabled={comicLoading}
                data-testid="button-comic-random"
              >
                🎲 Another Comic
              </Button>
              {comicData && (
                <Button
                  variant="outline"
                  onClick={() => window.open(`https://xkcd.com/${comicData.num}`, '_blank')}
                >
                  View on xkcd.com ↗
                </Button>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              xkcd by Randall Munroe • Type "friday" anytime on the dashboard!
            </p>
          </div>
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => setShowComic(false)} data-testid="button-comic-close">
              Back to Work 💼
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
