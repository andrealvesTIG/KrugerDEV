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
  GripVertical,
  BarChart3,
} from "lucide-react";
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
  };

  const Icon = tab.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center"
    >
      {isAdmin && (
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab hover:text-foreground text-muted-foreground px-1"
          data-testid={`drag-handle-${tab.id}`}
        >
          <GripVertical className="h-3 w-3" />
        </span>
      )}
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
  const [selectedCustomDashboard, setSelectedCustomDashboard] = useState<number | null>(null);

  // Check if user is org admin or super admin
  const isOrgAdmin = useMemo(() => {
    if (!currentOrganization || !user) return false;
    if (user.role === 'super_admin') return true;
    return memberships.some(
      m => m.organizationId === currentOrganization.id && m.role === 'org_admin'
    );
  }, [currentOrganization, user, memberships]);

  // Fetch tab order for current organization
  const { data: tabOrderData } = useQuery<{ tabOrder: string[] }>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'dashboard-tab-order'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${currentOrganization?.id}/dashboard-tab-order`);
      if (!res.ok) throw new Error('Failed to fetch tab order');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  // Mutation to update tab order
  const updateTabOrderMutation = useMutation({
    mutationFn: async (tabOrder: string[]) => {
      return apiRequest('PUT', `/api/organizations/${currentOrganization?.id}/dashboard-tab-order`, { tabOrder });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', currentOrganization?.id, 'dashboard-tab-order'] });
    },
  });

  // Get sorted tabs based on saved order
  const sortedTabs = useMemo(() => {
    const savedOrder = tabOrderData?.tabOrder || [];
    if (savedOrder.length === 0) return [...DASHBOARD_TABS];
    
    // Sort tabs based on saved order, unknown tabs go to the end
    return [...DASHBOARD_TABS].sort((a, b) => {
      const aIndex = savedOrder.indexOf(a.id);
      const bIndex = savedOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [tabOrderData?.tabOrder]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedTabs.findIndex(t => t.id === active.id);
    const newIndex = sortedTabs.findIndex(t => t.id === over.id);
    
    const newOrder = arrayMove(sortedTabs.map(t => t.id), oldIndex, newIndex);
    updateTabOrderMutation.mutate(newOrder);
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
              items={sortedTabs.map(t => t.id)}
              strategy={horizontalListSortingStrategy}
            >
              {sortedTabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isAdmin={isOrgAdmin}
                />
              ))}
            </SortableContext>
          </DndContext>
          
          {selectedCustomDashboard && (
            <TabsTrigger
              value={`custom-${selectedCustomDashboard}`}
              className="flex items-center gap-2 data-[state=active]:bg-background"
              data-testid={`tab-custom-${selectedCustomDashboard}`}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">
                {customDashboards?.find(d => d.id === selectedCustomDashboard)?.name || 'Custom'}
              </span>
            </TabsTrigger>
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
            <DropdownMenuContent align="end" className="w-64">
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
              
              {customDashboards && customDashboards.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Saved Dashboards
                  </div>
                  {customDashboards.map((dashboard) => (
                    <DropdownMenuItem
                      key={dashboard.id}
                      onClick={() => handleSelectCustomDashboard(dashboard.id)}
                      data-testid={`menu-item-dashboard-${dashboard.id}`}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      <span className="flex-1 truncate">{dashboard.name}</span>
                    </DropdownMenuItem>
                  ))}
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
    </div>
  );
}
