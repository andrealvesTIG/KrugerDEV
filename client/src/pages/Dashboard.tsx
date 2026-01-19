import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
  Trash2,
} from "lucide-react";
import { useOrganization } from "@/hooks/use-organization";
import type { CustomDashboard as CustomDashboardType } from "@shared/schema";

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

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const viewParam = searchParams.get("view") as TabId | null;
  const { currentOrganization } = useOrganization();
  
  const [activeTab, setActiveTab] = useState<TabId>("executive");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCustomDashboard, setSelectedCustomDashboard] = useState<number | null>(null);

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
          {DASHBOARD_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 data-[state=active]:bg-background"
                data-testid={`tab-${tab.id}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
          
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
    </div>
  );
}
