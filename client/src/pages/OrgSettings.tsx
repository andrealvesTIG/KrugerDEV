import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings, Users, ShieldAlert, Trash2, Eye, FileText, GitBranch, Plug, Calendar, Sparkles, Building2, Zap, LayoutGrid, Columns, Code2, UserCheck, Bell, Target, Bot, DollarSign, KeyRound } from "lucide-react";
import { ChevronDown, PanelLeftClose, PanelLeft } from "lucide-react";
import type { Organization } from "@shared/schema";
import IntegrationsPage from "@/pages/Integrations";
import { BillingContent } from "@/pages/Billing";
import { NoAdminAccessView } from "@/components/settings/NoAdminAccessView";
import { GeneralSection } from "@/components/settings/GeneralSection";
import { SchedulingDefaultsSection } from "@/components/settings/SchedulingDefaultsSection";
import { ModuleVisibilitySection } from "@/components/settings/ModuleVisibilitySection";
import { SystemViewsSection } from "@/components/settings/SystemViewsSection";
import { CustomFieldsSection } from "@/components/settings/CustomFieldsSection";
import { ProjectTabsSection } from "@/components/settings/ProjectTabsSection";
import { GovernanceSection } from "@/components/settings/GovernanceSection";
import { MembersSection } from "@/components/settings/MembersSection";
import { RecycleBinSection } from "@/components/settings/RecycleBinSection";
import { DemoDataSection } from "@/components/settings/DemoDataSection";
import { ReminderSettingsSection } from "@/components/settings/ReminderSettingsSection";
import { RiskAssessmentConfigSection } from "@/components/settings/RiskAssessmentConfigSection";
import { FridayAgentConfigSection } from "@/components/settings/FridayAgentConfigSection";
import { OrgAgentsSection } from "@/components/settings/OrgAgentsSection";
import { FinancialTypesSection } from "@/components/settings/FinancialTypesSection";
import { FiscalYearStartSection } from "@/components/settings/FiscalYearStartSection";
import { CostItemCategoriesSection } from "@/components/settings/CostItemCategoriesSection";
import { FinancialLockdownsSection } from "@/components/settings/FinancialLockdownsSection";
import { DeveloperSection } from "@/components/settings/DeveloperSection";
import { ActAsSection } from "@/components/settings/ActAsSection";
import { ScoringCriteriaSection } from "@/components/settings/ScoringCriteriaSection";
import RolesAndPermissionsPage from "@/pages/RolesAndPermissions";
import Calendars from "@/pages/Calendars";
import { ApplyTemplateButton } from "@/components/settings/ApplyTemplateButton";

export default function OrgSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { currentOrganization, memberships, organizations, isLoading: orgLoading } = useOrganization();

  const hasAdminAccess = user?.role === 'super_admin' || 
    memberships?.some(m => m.organizationId === currentOrganization?.id && (m.role === 'org_admin' || m.role === 'owner'));

  if (authLoading || orgLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentOrganization) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Manage your organization and team members</p>
          </div>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Users className="h-16 w-16 text-muted-foreground/50" />
            <h2 className="text-xl font-semibold text-foreground">No Organization Selected</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Please select an organization from the dropdown in the top bar to manage its settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return <NoAdminAccessView organization={currentOrganization} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Managing: <strong>{currentOrganization.name}</strong></p>
          </div>
        </div>
        <ApplyTemplateButton organizationId={currentOrganization.id} />
      </div>

      <OrgSettingsTabs currentOrganization={currentOrganization} />
    </div>
  );
}

const settingsTabs = [
  { value: "general", label: "General", icon: Building2 },
  { value: "billing", label: "Billing", icon: Zap },
  { value: "scheduling", label: "Scheduling", icon: Calendar },
  { value: "calendars", label: "Calendars", icon: Calendar },
  { value: "financial-types", label: "Financials", icon: DollarSign },
  { value: "modules", label: "Module Visibility", icon: Eye },
  { value: "system-views", label: "System Views", icon: Columns },
  { value: "custom-fields", label: "Custom Fields", icon: FileText },
  { value: "custom-tabs", label: "Project Tabs", icon: LayoutGrid },
  { value: "governance", label: "Governance", icon: GitBranch },
  { value: "members", label: "Team Members", icon: Users },
  { value: "roles", label: "Roles & Permissions", icon: KeyRound },
  { value: "recycle", label: "Recycle Bin", icon: Trash2 },
  { value: "demo", label: "Demo Data", icon: Sparkles },
  { value: "reminders", label: "Reminders & Escalation", icon: Bell },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "agents", label: "Agents", icon: Bot },
  { value: "risk-assessment", label: "Risk Assessment", icon: ShieldAlert },
  { value: "scoring", label: "Portfolio Scoring", icon: Target },
  { value: "developer", label: "Developer", icon: Code2 },
  { value: "act-as", label: "Act As User", icon: UserCheck },
];

function getInitialTabFromLocation(): { tab: string; agentsSubTab: "custom" | "friday" } {
  if (typeof window === "undefined") {
    return { tab: "general", agentsSubTab: "custom" };
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("tab") || window.location.hash.replace(/^#/, "");
  if (raw === "friday-agent") {
    return { tab: "agents", agentsSubTab: "friday" };
  }
  if (raw === "agents") {
    return { tab: "agents", agentsSubTab: "custom" };
  }
  if (raw) {
    return { tab: raw, agentsSubTab: "custom" };
  }
  return { tab: "general", agentsSubTab: "custom" };
}

function OrgSettingsTabs({ currentOrganization }: { currentOrganization: Organization }) {
  const { user } = useAuth();
  const initial = getInitialTabFromLocation();
  const [activeTab, setActiveTab] = useState(initial.tab);
  const [agentsSubTab, setAgentsSubTab] = useState<"custom" | "friday">(initial.agentsSubTab);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      const next = getInitialTabFromLocation();
      setActiveTab(next.tab);
      setAgentsSubTab(next.agentsSubTab);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleTabChange = (value: string) => {
    if (value === "friday-agent") {
      setActiveTab("agents");
      setAgentsSubTab("friday");
    } else if (value === "agents") {
      setActiveTab("agents");
      setAgentsSubTab("custom");
    } else {
      setActiveTab(value);
    }
    setIsMobileMenuOpen(false);
  };
  
  const memberships = useOrganization().memberships;
  const userOrgRole = memberships?.find(m => m.organizationId === currentOrganization?.id)?.role;
  const isAdminOrOwner = user?.role === 'super_admin' || userOrgRole === 'org_admin' || userOrgRole === 'owner';

  const filteredTabs = settingsTabs.filter(tab => {
    if (tab.value === 'billing' && currentOrganization.billingHidden && user?.role !== 'super_admin') {
      return false;
    }
    if (tab.value === 'act-as' && !isAdminOrOwner) {
      return false;
    }
    if (tab.value === 'agents' && !isAdminOrOwner) {
      return false;
    }
    if (tab.value === 'calendars' && !isAdminOrOwner) {
      return false;
    }
    return true;
  });
  
  const activeTabInfo = filteredTabs.find(t => t.value === activeTab) || filteredTabs[0];
  const ActiveIcon = activeTabInfo.icon;

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} orientation="vertical" className="flex flex-col md:flex-row gap-4 md:gap-6">
      <div className="md:hidden">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-between w-full p-3 bg-card border rounded-lg"
          data-testid="button-mobile-settings-menu"
        >
          <div className="flex items-center gap-3">
            <ActiveIcon className="h-4 w-4" />
            <span className="font-medium">{activeTabInfo.label}</span>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        
        <div className={`overflow-hidden transition-all duration-200 ${isMobileMenuOpen ? 'max-h-96 mt-2' : 'max-h-0'}`}>
          <TabsList className="flex flex-col h-fit w-full bg-card border rounded-lg p-1">
            {filteredTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger 
                  key={tab.value}
                  value={tab.value} 
                  className="w-full justify-start gap-3" 
                  data-testid={`nav-mobile-${tab.value}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </div>

      <div className={`hidden md:flex flex-col transition-all duration-200 ${isDesktopSidebarCollapsed ? 'w-12' : 'w-56'}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)}
          className="h-7 w-7 mb-2 self-end"
          data-testid="button-toggle-settings-sidebar"
          title={isDesktopSidebarCollapsed ? "Expand menu" : "Collapse menu"}
        >
          {isDesktopSidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span className="sr-only">Toggle Settings Menu</span>
        </Button>
        
        <TabsList className={`flex flex-col h-fit bg-card border rounded-lg p-1 ${isDesktopSidebarCollapsed ? 'w-12' : 'w-56'}`}>
          {filteredTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger 
                key={tab.value}
                value={tab.value} 
                className={`w-full gap-3 ${isDesktopSidebarCollapsed ? 'justify-center px-2' : 'justify-start'}`}
                data-testid={`nav-${tab.value}`}
                title={isDesktopSidebarCollapsed ? tab.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isDesktopSidebarCollapsed && <span>{tab.label}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      <div className="flex-1 min-w-0">
        <TabsContent value="general" className="mt-0">
          <GeneralSection organization={currentOrganization} />
        </TabsContent>
        {(!currentOrganization.billingHidden || user?.role === 'super_admin') && (
          <TabsContent value="billing" className="mt-0">
            <BillingContent />
          </TabsContent>
        )}
        <TabsContent value="scheduling" className="mt-0">
          <SchedulingDefaultsSection organizationId={currentOrganization.id} />
        </TabsContent>
        {isAdminOrOwner && (
          <TabsContent value="calendars" className="mt-0">
            <Calendars />
          </TabsContent>
        )}
        <TabsContent value="financial-types" className="mt-0">
          <div className="space-y-4">
            <FiscalYearStartSection organization={currentOrganization} />
            <Tabs defaultValue="types" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="types" data-testid="tab-financial-types">Financial Types</TabsTrigger>
                <TabsTrigger value="categories" data-testid="tab-cost-item-categories">Cost Item Categories</TabsTrigger>
                <TabsTrigger value="lockdowns" data-testid="tab-financial-lockdowns">Lockdowns</TabsTrigger>
              </TabsList>
              <TabsContent value="types" className="mt-0">
                <FinancialTypesSection organizationId={currentOrganization.id} />
              </TabsContent>
              <TabsContent value="categories" className="mt-0">
                <CostItemCategoriesSection organizationId={currentOrganization.id} />
              </TabsContent>
              <TabsContent value="lockdowns" className="mt-0">
                <FinancialLockdownsSection organizationId={currentOrganization.id} />
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>
        <TabsContent value="modules" className="mt-0">
          <ModuleVisibilitySection organization={currentOrganization} />
        </TabsContent>
        <TabsContent value="system-views" className="mt-0">
          <SystemViewsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="custom-fields" className="mt-0">
          <CustomFieldsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="custom-tabs" className="mt-0">
          <ProjectTabsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="governance" className="mt-0">
          <GovernanceSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="members" className="mt-0">
          <MembersSection organizationId={currentOrganization.id} orgName={currentOrganization.name} />
        </TabsContent>
        <TabsContent value="roles" className="mt-0">
          <RolesAndPermissionsPage />
        </TabsContent>
        <TabsContent value="recycle" className="mt-0">
          <RecycleBinSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="demo" className="mt-0">
          <DemoDataSection organizationId={currentOrganization.id} orgName={currentOrganization.name} />
        </TabsContent>
        <TabsContent value="reminders" className="mt-0">
          <ReminderSettingsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="integrations" className="mt-0">
          <IntegrationsPage />
        </TabsContent>
        {isAdminOrOwner && (
          <TabsContent value="agents" className="mt-0 space-y-4">
            <AiModeToggleCard />
            <Tabs
              value={agentsSubTab}
              onValueChange={(v) => setAgentsSubTab(v as "custom" | "friday")}
              className="w-full"
            >
              <TabsList className="mb-4">
                <TabsTrigger value="custom" data-testid="tab-agents-custom">Custom Agents</TabsTrigger>
                <TabsTrigger value="friday" data-testid="tab-agents-friday">Friday Agent</TabsTrigger>
              </TabsList>
              <TabsContent value="custom" className="mt-0">
                <OrgAgentsSection organizationId={currentOrganization.id} />
              </TabsContent>
              <TabsContent value="friday" className="mt-0">
                <FridayAgentConfigSection organizationId={currentOrganization.id} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}
        <TabsContent value="risk-assessment" className="mt-0">
          <RiskAssessmentConfigSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="scoring" className="mt-0">
          <ScoringCriteriaSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="developer" className="mt-0">
          <DeveloperSection />
        </TabsContent>
        <TabsContent value="act-as" className="mt-0">
          <ActAsSection organizationId={currentOrganization.id} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function AiModeToggleCard() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const checked = currentOrganization?.showAiMode ?? true;

  const handleToggle = async (next: boolean) => {
    if (!currentOrganization) return;
    try {
      await apiRequest("PUT", `/api/organizations/${currentOrganization.id}`, {
        showAiMode: next,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Saved",
        description: next
          ? "AI Mode is now available. Users land in AI Mode by default after signing in."
          : "AI Mode is now hidden. Users land on the dashboard and the AI Mode toggle is removed.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to update setting",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Mode
        </CardTitle>
        <CardDescription>
          Controls all AI features for everyone in this organization. When
          off, users land on the dashboard, the AI Mode toggle is hidden, the
          floating Friday assistant is hidden, and the Agents and Power BI
          Request entries are removed from the sidebar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="show-ai-mode" className="text-sm">
            Enable AI Mode as the default landing experience
          </Label>
          <Switch
            id="show-ai-mode"
            checked={checked}
            onCheckedChange={handleToggle}
            data-testid="switch-show-ai-mode"
          />
        </div>
      </CardContent>
    </Card>
  );
}