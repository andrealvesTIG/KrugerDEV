import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  RisksIssuesDashboard,
  ResourceDashboard,
  ResourceManagementDashboard,
  TimesheetReportDashboard,
  IntakeDashboard,
  CustomDashboard,
  CreateCustomDashboardDialog,
  AddPowerBIDialog,
} from "@/components/dashboard";
import { 
  LayoutDashboard, 
  FolderKanban, 
  ShieldAlert, 
  Users, 
  UserCog, 
  Clock,
  FileInput,
  MoreVertical,
  Plus,
  Sparkles,
  BarChart3,
  Eye,
  EyeOff,
} from "lucide-react";
import { SiTableau, SiLooker, SiMetabase } from "react-icons/si";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CustomDashboard as CustomDashboardType } from "@shared/schema";
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

const DASHBOARD_TABS = [
  { id: "executive", label: "Executive", icon: LayoutDashboard },
  { id: "portfolios", label: "Portfolios", icon: FolderKanban },
  { id: "intake", label: "Intake", icon: FileInput },
  { id: "risks-issues", label: "Risks & Issues", icon: ShieldAlert },
  { id: "resource", label: "Resource", icon: Users },
  { id: "resource-management", label: "Resource Management", icon: UserCog },
  { id: "timesheet", label: "Timesheet Report", icon: Clock },
] as const;

type TabId = typeof DASHBOARD_TABS[number]["id"] | `custom-${number}`;

const STORAGE_KEY = "dashboard-active-tab";

interface SortableTabProps {
  tab: typeof DASHBOARD_TABS[number];
  isAdmin: boolean;
}

function SortableTab({ tab, isAdmin }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id, disabled: !isAdmin });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isAdmin ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
  };

  const Icon = tab.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center"
      {...(isAdmin ? { ...attributes, ...listeners } : {})}
    >
      <TabsTrigger
        value={tab.id}
        className="flex items-center gap-2 data-[state=active]:bg-background"
        data-testid={`tab-${tab.id}`}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">{tab.label}</span>
      </TabsTrigger>
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
  
  const [activeTab, setActiveTab] = useState<TabId>("executive");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPowerBIDialog, setShowPowerBIDialog] = useState(false);
  const [showComingSoonDialog, setShowComingSoonDialog] = useState<string | null>(null);
  const [selectedCustomDashboard, setSelectedCustomDashboard] = useState<number | null>(null);
  const [hiddenCustomDashboards, setHiddenCustomDashboards] = useState<number[]>(() => {
    const stored = localStorage.getItem(`hidden-custom-dashboards-${currentOrganization?.id}`);
    return stored ? JSON.parse(stored) : [];
  });

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

  // Get sorted tabs based on saved order, separating visible and hidden
  const { visibleTabs, hiddenTabs } = useMemo(() => {
    const savedOrder = tabOrderData?.tabOrder || [];
    const hiddenTabIds = tabOrderData?.hiddenTabs || [];
    
    // Sort all tabs based on saved order
    const allSorted = [...DASHBOARD_TABS].sort((a, b) => {
      const aIndex = savedOrder.indexOf(a.id);
      const bIndex = savedOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    // Separate visible and hidden tabs
    const visible = allSorted.filter(tab => !hiddenTabIds.includes(tab.id));
    const hidden = allSorted.filter(tab => hiddenTabIds.includes(tab.id));
    
    return { visibleTabs: visible, hiddenTabs: hidden };
  }, [tabOrderData?.tabOrder, tabOrderData?.hiddenTabs]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 1000, tolerance: 5 } }),
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

  const { data: customDashboards } = useQuery<CustomDashboardType[]>({
    queryKey: [`/api/custom-dashboards?organizationId=${currentOrganization?.id}`],
    enabled: !!currentOrganization?.id,
  });

  const getInitialTab = (): TabId => {
    if (viewParam) {
      if (DASHBOARD_TABS.some(t => t.id === viewParam)) {
        return viewParam as TabId;
      }
      if (viewParam.startsWith('custom-')) {
        return viewParam as TabId;
      }
    }
    const stored = localStorage.getItem(STORAGE_KEY) as TabId | null;
    if (stored) {
      if (DASHBOARD_TABS.some(t => t.id === stored)) {
        return stored;
      }
      if (stored.startsWith('custom-')) {
        return stored;
      }
    }
    return "executive";
  };

  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [viewParam]);

  const handleTabChange = (value: string) => {
    const tabId = value as TabId;
    setActiveTab(tabId);
    localStorage.setItem(STORAGE_KEY, tabId);
    setLocation(`/?view=${tabId}`, { replace: true });
    
    if (tabId.startsWith('custom-')) {
      const dashboardId = Number(tabId.replace('custom-', ''));
      setSelectedCustomDashboard(dashboardId);
    } else {
      setSelectedCustomDashboard(null);
    }
  };

  const handleCustomDashboardCreated = (dashboardId: number) => {
    const tabId = `custom-${dashboardId}` as TabId;
    setActiveTab(tabId);
    setSelectedCustomDashboard(dashboardId);
    localStorage.setItem(STORAGE_KEY, tabId);
    setLocation(`/?view=${tabId}`, { replace: true });
  };

  const handleSelectCustomDashboard = (dashboardId: number) => {
    const tabId = `custom-${dashboardId}` as TabId;
    setActiveTab(tabId);
    setSelectedCustomDashboard(dashboardId);
    localStorage.setItem(STORAGE_KEY, tabId);
    setLocation(`/?view=${tabId}`, { replace: true });
  };

  const isCustomTab = activeTab.startsWith('custom-');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1" data-testid="dashboard-tabs">
          <DndContext
            sensors={sensors}
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
                />
              ))}
            </SortableContext>
          </DndContext>
          
          {/* Show visible (non-hidden) custom dashboards as tabs */}
          {customDashboards?.filter(d => !hiddenCustomDashboards.includes(d.id)).map((dashboard) => (
            <TabsTrigger
              key={dashboard.id}
              value={`custom-${dashboard.id}`}
              className="flex items-center gap-2 data-[state=active]:bg-background"
              data-testid={`tab-custom-${dashboard.id}`}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline truncate max-w-32">
                {dashboard.name}
              </span>
            </TabsTrigger>
          ))}

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
        </TabsList>

        <TabsContent value="executive" className="mt-6" data-testid="content-executive">
          <ExecutiveDashboard />
        </TabsContent>

        <TabsContent value="portfolios" className="mt-6" data-testid="content-portfolios">
          <PortfoliosDashboard />
        </TabsContent>

        <TabsContent value="intake" className="mt-6" data-testid="content-intake">
          <IntakeDashboard />
        </TabsContent>

        <TabsContent value="risks-issues" className="mt-6" data-testid="content-risks-issues">
          <RisksIssuesDashboard />
        </TabsContent>

        <TabsContent value="resource" className="mt-6" data-testid="content-resource">
          <ResourceDashboard />
        </TabsContent>

        <TabsContent value="resource-management" className="mt-6" data-testid="content-resource-management">
          <ResourceManagementDashboard />
        </TabsContent>

        <TabsContent value="timesheet" className="mt-6" data-testid="content-timesheet">
          <TimesheetReportDashboard />
        </TabsContent>

        {isCustomTab && selectedCustomDashboard && (
          <TabsContent value={`custom-${selectedCustomDashboard}`} className="mt-6" data-testid={`content-custom-${selectedCustomDashboard}`}>
            <CustomDashboard 
              dashboardId={selectedCustomDashboard} 
              onDelete={() => {
                setActiveTab("executive");
                setSelectedCustomDashboard(null);
                setLocation('/?view=executive', { replace: true });
              }}
            />
          </TabsContent>
        )}
      </Tabs>

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
    </div>
  );
}
