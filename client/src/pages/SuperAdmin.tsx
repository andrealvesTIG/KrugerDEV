import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Building2, Users, CreditCard, Wallet, FileCheck, Activity, BarChart3, HelpCircle, ShieldAlert, Crown, GraduationCap, TrendingUp } from "lucide-react";
import { OrganizationsTab } from "@/components/admin/OrganizationsTab";
import { AllUsersTab } from "@/components/admin/AllUsersTab";
import { PlansTab } from "@/components/admin/PlansTab";
import { CreditCostsTab } from "@/components/admin/CreditCostsTab";
import { ConsentsTab } from "@/components/admin/ConsentsTab";
import { MonitoringTab } from "@/components/admin/MonitoringTab";
import { HelpTicketsTab } from "@/components/admin/HelpTicketsTab";
import { KpiAnalyticsTab } from "@/components/admin/KpiAnalyticsTab";
import { FeatureComparisonTab } from "@/components/FeatureComparisonTab";
import { TrainingManagementTab } from "@/components/TrainingManagementTab";

export default function SuperAdmin() {
  const { user, isLoading: authLoading } = useAuth();

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
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-display font-bold text-foreground truncate">Super Admin Console</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage all organizations and system users</p>
        </div>
      </div>

      <Tabs defaultValue="monitoring" className="w-full">
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
            <TabsTrigger value="kpi-analytics" className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm gap-1.5 whitespace-nowrap text-xs sm:text-sm sm:gap-2" data-testid="tab-kpi-analytics">
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              KPI Analytics
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="mt-6">
          <TabsContent value="monitoring">
            <MonitoringTab />
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
          <TabsContent value="kpi-analytics">
            <KpiAnalyticsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
