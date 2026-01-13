import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  PortfoliosDashboard, 
  ExecutiveDashboard, 
  RisksIssuesDashboard,
  ResourceDashboard,
  ResourceManagementDashboard,
  TimesheetReportDashboard,
  IntakeDashboard
} from "@/components/dashboard";
import { 
  LayoutDashboard, 
  FolderKanban, 
  ShieldAlert, 
  Users, 
  UserCog, 
  Clock,
  FileInput
} from "lucide-react";

const DASHBOARD_TABS = [
  { id: "executive", label: "Executive", icon: LayoutDashboard },
  { id: "portfolios", label: "Portfolios", icon: FolderKanban },
  { id: "intake", label: "Intake", icon: FileInput },
  { id: "risks-issues", label: "Risks & Issues", icon: ShieldAlert },
  { id: "resource", label: "Resource", icon: Users },
  { id: "resource-management", label: "Resource Management", icon: UserCog },
  { id: "timesheet", label: "Timesheet Report", icon: Clock },
] as const;

type TabId = typeof DASHBOARD_TABS[number]["id"];

const STORAGE_KEY = "dashboard-active-tab";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const viewParam = searchParams.get("view") as TabId | null;
  
  const getInitialTab = (): TabId => {
    if (viewParam && DASHBOARD_TABS.some(t => t.id === viewParam)) {
      return viewParam;
    }
    const stored = localStorage.getItem(STORAGE_KEY) as TabId | null;
    if (stored && DASHBOARD_TABS.some(t => t.id === stored)) {
      return stored;
    }
    return "executive";
  };

  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab);

  useEffect(() => {
    if (viewParam && DASHBOARD_TABS.some(t => t.id === viewParam)) {
      setActiveTab(viewParam);
      localStorage.setItem(STORAGE_KEY, viewParam);
    }
  }, [viewParam]);

  const handleTabChange = (value: string) => {
    const tabId = value as TabId;
    setActiveTab(tabId);
    localStorage.setItem(STORAGE_KEY, tabId);
    setLocation(`/?view=${tabId}`, { replace: true });
  };

  const getTabLabel = (id: TabId): string => {
    const tab = DASHBOARD_TABS.find(t => t.id === id);
    return tab?.label || "Dashboard";
  };

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
      </Tabs>
    </div>
  );
}
