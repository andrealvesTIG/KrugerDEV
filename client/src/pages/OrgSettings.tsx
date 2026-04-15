import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Settings, Users, ShieldAlert, Trash2, Eye, FileText, GitBranch, Plug, Calendar, Sparkles, Building2, Zap, LayoutGrid, Columns, Code2, UserCheck, Bell, Target } from "lucide-react";
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
import { CustomTabsSection } from "@/components/settings/CustomTabsSection";
import { GovernanceSection } from "@/components/settings/GovernanceSection";
import { MembersSection } from "@/components/settings/MembersSection";
import { RecycleBinSection } from "@/components/settings/RecycleBinSection";
import { DemoDataSection } from "@/components/settings/DemoDataSection";
import { ReminderSettingsSection } from "@/components/settings/ReminderSettingsSection";
import { RiskAssessmentConfigSection } from "@/components/settings/RiskAssessmentConfigSection";
import { DeveloperSection } from "@/components/settings/DeveloperSection";
import { ActAsSection } from "@/components/settings/ActAsSection";
import { ScoringCriteriaSection } from "@/components/settings/ScoringCriteriaSection";

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Organization Settings</h1>
            <p className="text-muted-foreground">Managing: <strong>{currentOrganization.name}</strong></p>
          </div>
        </div>
      </div>

      <OrgSettingsTabs currentOrganization={currentOrganization} />
    </div>
  );
}

const settingsTabs = [
  { value: "general", label: "General", icon: Building2 },
  { value: "billing", label: "Billing", icon: Zap },
  { value: "scheduling", label: "Scheduling", icon: Calendar },
  { value: "modules", label: "Module Visibility", icon: Eye },
  { value: "system-views", label: "System Views", icon: Columns },
  { value: "custom-fields", label: "Custom Fields", icon: FileText },
  { value: "custom-tabs", label: "Custom Tabs", icon: LayoutGrid },
  { value: "governance", label: "Governance", icon: GitBranch },
  { value: "members", label: "Team Members", icon: Users },
  { value: "recycle", label: "Recycle Bin", icon: Trash2 },
  { value: "demo", label: "Demo Data", icon: Sparkles },
  { value: "reminders", label: "Reminders & Escalation", icon: Bell },
  { value: "integrations", label: "Integrations", icon: Plug },
  { value: "risk-assessment", label: "Risk Assessment", icon: ShieldAlert },
  { value: "scoring", label: "Portfolio Scoring", icon: Target },
  { value: "developer", label: "Developer", icon: Code2 },
  { value: "act-as", label: "Act As User", icon: UserCheck },
];

function OrgSettingsTabs({ currentOrganization }: { currentOrganization: Organization }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  
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
    return true;
  });
  
  const activeTabInfo = filteredTabs.find(t => t.value === activeTab) || filteredTabs[0];
  const ActiveIcon = activeTabInfo.icon;

  return (
    <Tabs value={activeTab} onValueChange={(value) => {
      setActiveTab(value);
      setIsMobileMenuOpen(false);
    }} orientation="vertical" className="flex flex-col md:flex-row gap-4 md:gap-6">
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
          <CustomTabsSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="governance" className="mt-0">
          <GovernanceSection organizationId={currentOrganization.id} />
        </TabsContent>
        <TabsContent value="members" className="mt-0">
          <MembersSection organizationId={currentOrganization.id} orgName={currentOrganization.name} />
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