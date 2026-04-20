import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Building2, Users, CreditCard, Wallet, FileCheck, Activity, BarChart3, HelpCircle, ShieldAlert, Crown, GraduationCap, MousePointerClick, Newspaper, UserPlus } from "lucide-react";
import { OrganizationsTab } from "@/components/admin/OrganizationsTab";
import { AllUsersTab } from "@/components/admin/AllUsersTab";
import { PlansTab } from "@/components/admin/PlansTab";
import { CreditCostsTab } from "@/components/admin/CreditCostsTab";
import { ConsentsTab } from "@/components/admin/ConsentsTab";
import { MonitoringTab } from "@/components/admin/MonitoringTab";
import { HelpTicketsTab } from "@/components/admin/HelpTicketsTab";
import { FeatureComparisonTab } from "@/components/FeatureComparisonTab";
import { TrainingManagementTab } from "@/components/TrainingManagementTab";
import { UserActivityTab } from "@/components/admin/UserActivityTab";
import { BlogManagementTab } from "@/components/admin/BlogManagementTab";
import { NewSignupsTab } from "@/components/admin/NewSignupsTab";

const VALID_TABS = new Set([
  'monitoring', 'organizations', 'users', 'plans', 'credits',
  'consents', 'help-tickets', 'feature-comparison', 'training', 'user-activity', 'media',
]);

const ANALYTICS_SUB_TABS = new Set(['overview', 'new-signups']);

function readInitialState(): { tab: string; analyticsSubTab: string } {
  if (typeof window === 'undefined') return { tab: 'monitoring', analyticsSubTab: 'new-signups' };
  try {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('tab');
    if (t === 'new-signups') return { tab: 'monitoring', analyticsSubTab: 'new-signups' };
    if (t && VALID_TABS.has(t)) {
      return { tab: t, analyticsSubTab: t === 'monitoring' ? 'overview' : 'new-signups' };
    }
    const sub = url.searchParams.get('sub');
    if (sub && ANALYTICS_SUB_TABS.has(sub)) {
      return { tab: 'monitoring', analyticsSubTab: sub };
    }
  } catch { /* ignore */ }
  return { tab: 'monitoring', analyticsSubTab: 'new-signups' };
}

export default function SuperAdmin() {
  const { user, isLoading: authLoading } = useAuth();
  const initial = readInitialState();
  const [tab, setTab] = useState<string>(initial.tab);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<string>(initial.analyticsSubTab);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (tab === 'monitoring') {
        url.searchParams.set('tab', analyticsSubTab === 'new-signups' ? 'new-signups' : 'monitoring');
      } else {
        url.searchParams.set('tab', tab);
      }
      window.history.replaceState({}, '', url.toString());
    } catch { /* ignore */ }
  }, [tab, analyticsSubTab]);

  if (authLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isSuperAdmin = user?.role === "super_admin";
  const isMarketing = user?.role === "marketing";
  const hasAdminAccess = isSuperAdmin || isMarketing;

  if (!hasAdminAccess) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground/50" />
        <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">You need Super Admin or Marketing privileges to access this page.</p>
        <Badge variant="outline" className="text-sm">
          Current role: {user?.role || "user"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-3xl font-display font-bold text-foreground truncate">Super Admin Console</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage all organizations and system users</p>
        </div>
        <a href="/investor-room" className="shrink-0">
          <Button variant="outline" size="sm" className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950">
            <BarChart3 className="h-4 w-4 mr-1" />
            Investor Room
          </Button>
        </a>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
          <TabsList className="bg-muted p-1 rounded-xl inline-flex w-auto min-w-full sm:w-full">
            <TabsTrigger value="monitoring" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-monitoring">
              <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="organizations" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2">
              <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Orgs
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="plans" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2">
              <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Plans
            </TabsTrigger>
            <TabsTrigger value="credits" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2">
              <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Credits
            </TabsTrigger>
            <TabsTrigger value="consents" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2">
              <FileCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Consents
            </TabsTrigger>
            <TabsTrigger value="help-tickets" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-help-tickets">
              <HelpCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Tickets
            </TabsTrigger>
            <TabsTrigger value="feature-comparison" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-feature-comparison">
              <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Features
            </TabsTrigger>
            <TabsTrigger value="training" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-training">
              <GraduationCap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Training
            </TabsTrigger>
            <TabsTrigger value="user-activity" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-user-activity">
              <MousePointerClick className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              User Activity
            </TabsTrigger>
            <TabsTrigger value="media" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-media">
              <Newspaper className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Media
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="mt-6">
          <TabsContent value="monitoring">
            <Tabs value={analyticsSubTab} onValueChange={setAnalyticsSubTab} className="w-full">
              <TabsList className="bg-muted p-1 rounded-xl inline-flex">
                <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-monitoring">
                  <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="new-signups" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-new-signups">
                  <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  New Signups
                </TabsTrigger>
              </TabsList>
              <div className="mt-4">
                <TabsContent value="overview">
                  <MonitoringTab />
                </TabsContent>
                <TabsContent value="new-signups">
                  <NewSignupsTab />
                </TabsContent>
              </div>
            </Tabs>
          </TabsContent>
          <TabsContent value="organizations">
            <OrganizationsTab />
          </TabsContent>
          <TabsContent value="users">
            <AllUsersTab />
          </TabsContent>
          <TabsContent value="plans">
            <PlansTab />
          </TabsContent>
          <TabsContent value="credits">
            <CreditCostsTab />
          </TabsContent>
          <TabsContent value="consents">
            <ConsentsTab />
          </TabsContent>
          <TabsContent value="help-tickets">
            <HelpTicketsTab />
          </TabsContent>
          <TabsContent value="feature-comparison">
            <FeatureComparisonTab />
          </TabsContent>
          <TabsContent value="training">
            <TrainingManagementTab />
          </TabsContent>
          <TabsContent value="user-activity">
            <UserActivityTab />
          </TabsContent>
          <TabsContent value="media">
            <BlogManagementTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
