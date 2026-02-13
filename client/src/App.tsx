import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { OrganizationProvider, useOrganization } from "@/hooks/use-organization";
import { ThemeProvider } from "@/components/theme-provider";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { TermsConsentModal } from "@/components/TermsConsentModal";
import NotFound from "@/pages/not-found";
import { ReactNode, useEffect } from "react";
import { initGA } from "@/lib/analytics";
import { useAnalytics } from "@/hooks/use-analytics";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// Pages
import Dashboard from "@/pages/Dashboard";
import Portfolios from "@/pages/Portfolios";
import PortfolioDetails from "@/pages/PortfolioDetails";
import Projects from "@/pages/Projects";
import ProjectDetails from "@/pages/ProjectDetails";
import Calendar from "@/pages/Calendar";
import Issues from "@/pages/Issues";
import LessonsLearned from "@/pages/LessonsLearned";
import Invoices from "@/pages/Invoices";
import Tasks from "@/pages/Tasks";
import Admin from "@/pages/Admin";
import SuperAdmin from "@/pages/SuperAdmin";
import OrgSettings from "@/pages/OrgSettings";
import Profile from "@/pages/Profile";
import UserGuide from "@/pages/UserGuide";
import Resources from "@/pages/Resources";
import ResourceDetails from "@/pages/ResourceDetails";
import ProjectIntakes from "@/pages/ProjectIntakes";
import IntakeDetails from "@/pages/IntakeDetails";
import Integrations from "@/pages/Integrations";
import Timesheets from "@/pages/Timesheets";
import Billing from "@/pages/Billing";
import AuthPage from "@/pages/AuthPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import VerifyMagicLinkPage from "@/pages/VerifyMagicLinkPage";
import SignInPage from "@/pages/SignInPage";
import LandingPage from "@/pages/LandingPage";
import SignInWaitingPage from "@/pages/SignInWaitingPage";
import VerifySignInPage from "@/pages/VerifySignInPage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";
import ResourceInvitePage from "@/pages/ResourceInvitePage";
import OnboardingPage from "@/pages/OnboardingPage";
import AccountSetupPage from "@/pages/AccountSetupPage";
import Embed from "@/pages/Embed";
import TermsOfService from "@/pages/TermsOfService";
import PrivacyStatement from "@/pages/PrivacyStatement";
import PublicUserGuide from "@/pages/PublicUserGuide";
import FridayPage from "@/pages/FridayPage";
import Simulation from "@/pages/Simulation";
import ReportSubscriptions from "@/pages/ReportSubscriptions"
import SharedRiskAssessment from "@/pages/SharedRiskAssessment"
import SharedProjectRiskAssessment from "@/pages/SharedProjectRiskAssessment"
import Home from "@/pages/Home"

function ModuleGuard({ children, moduleKey }: { children: ReactNode; moduleKey: string }) {
  const { currentOrganization, isLoading } = useOrganization();
  const [, setLocation] = useLocation();
  
  // Check sidebarStructure (new) first, fallback to hiddenModules (legacy)
  const sidebarStructure = currentOrganization?.sidebarStructure as Array<{ items: Array<{ type: string; key?: string; hidden?: boolean }> }> | null;
  
  let isHidden = false;
  if (sidebarStructure && Array.isArray(sidebarStructure)) {
    // Find the module in sidebarStructure and check its hidden status
    for (const group of sidebarStructure) {
      const item = group.items?.find(i => i.type === "module" && i.key === moduleKey);
      if (item) {
        isHidden = item.hidden === true;
        break;
      }
    }
  } else {
    // Fallback to legacy hiddenModules array
    const hiddenModules = currentOrganization?.hiddenModules || [];
    isHidden = hiddenModules.includes(moduleKey);
  }
  
  useEffect(() => {
    if (!isLoading && isHidden) {
      setLocation("/org-settings");
    }
  }, [isLoading, isHidden, setLocation]);
  
  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (isHidden) {
    return null;
  }
  
  return <>{children}</>;
}

function GuardedRoute({ path, component: Component, moduleKey }: { path: string; component: React.ComponentType; moduleKey: string }) {
  return (
    <Route path={path}>
      <ModuleGuard moduleKey={moduleKey}>
        <Component />
      </ModuleGuard>
    </Route>
  );
}

// Redirect from /dashboard to /dashboards for backward compatibility
function DashboardRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboards");
  }, [setLocation]);
  return null;
}

// Home page that shows SignIn for unauthenticated users, Home (My Work) for authenticated
function HomePage() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
    return <LandingPage />;
  }
  
  return (
    <AppLayout>
      <TermsConsentModal />
      <OnboardingDialog />
      <Home />
    </AppLayout>
  );
}

function Router() {
  // Track page views when routes change
  useAnalytics();
  
  return (
    <AppLayout>
      <TermsConsentModal />
      <OnboardingDialog />
      <Switch>
        <Route path="/dashboard"><DashboardRedirect /></Route>
        <GuardedRoute path="/dashboards" component={Dashboard} moduleKey="dashboard" />
        <GuardedRoute path="/portfolios" component={Portfolios} moduleKey="portfolios" />
        <Route path="/portfolios/:id">
          <ModuleGuard moduleKey="portfolios"><PortfolioDetails /></ModuleGuard>
        </Route>
        <GuardedRoute path="/projects" component={Projects} moduleKey="projects" />
        <Route path="/projects/:id">
          <ModuleGuard moduleKey="projects"><ProjectDetails /></ModuleGuard>
        </Route>
        <GuardedRoute path="/intakes" component={ProjectIntakes} moduleKey="intakes" />
        <Route path="/intakes/:id">
          <ModuleGuard moduleKey="intakes"><IntakeDetails /></ModuleGuard>
        </Route>
        <GuardedRoute path="/tasks" component={Tasks} moduleKey="tasks" />
        <GuardedRoute path="/issues" component={Issues} moduleKey="issues" />
        <GuardedRoute path="/simulation" component={Simulation} moduleKey="simulation" />
        <GuardedRoute path="/lessons-learned" component={LessonsLearned} moduleKey="lessons-learned" />
        <GuardedRoute path="/invoices" component={Invoices} moduleKey="invoices" />
        <GuardedRoute path="/timesheets" component={Timesheets} moduleKey="timesheets" />
        <GuardedRoute path="/resources" component={Resources} moduleKey="resources" />
        <Route path="/resources/:id">
          <ModuleGuard moduleKey="resources"><ResourceDetails /></ModuleGuard>
        </Route>
        <GuardedRoute path="/calendar" component={Calendar} moduleKey="calendar" />
        <GuardedRoute path="/integrations" component={Integrations} moduleKey="integrations" />
        <Route path="/billing" component={Billing} />
        <Route path="/admin" component={Admin} />
        <Route path="/super-admin" component={SuperAdmin} />
        <Route path="/org-settings" component={OrgSettings} />
        <Route path="/profile" component={Profile} />
        <Route path="/user-guide" component={UserGuide} />
        <Route path="/scheduled-reports" component={ReportSubscriptions} />
        <Route path="/risk-assessment/share/:token" component={SharedRiskAssessment} />
        <Route path="/project-risk-assessment/share/:token" component={SharedProjectRiskAssessment} />
        <Route path="/embed" component={Embed} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  // Initialize Google Analytics when app loads
  useEffect(() => {
    if (!import.meta.env.VITE_GA_MEASUREMENT_ID) {
      console.warn('Missing required Google Analytics key: VITE_GA_MEASUREMENT_ID');
    } else {
      initGA();
    }
  }, []);

  return (
    <ThemeProvider defaultTheme="light" storageKey="ppm-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <OrganizationProvider>
            <Toaster />
            <Switch>
              <Route path="/" component={HomePage} />
              <Route path="/auth" component={AuthPage} />
              <Route path="/auth/verify" component={VerifyMagicLinkPage} />
              <Route path="/signin" component={SignInPage} />
              <Route path="/signin/waiting" component={SignInWaitingPage} />
              <Route path="/signin/verify" component={VerifySignInPage} />
              <Route path="/reset-password" component={ResetPasswordPage} />
              <Route path="/verify-email" component={VerifyEmailPage} />
              <Route path="/resource-invite" component={ResourceInvitePage} />
              <Route path="/account-setup" component={AccountSetupPage} />
              <Route path="/onboarding" component={OnboardingPage} />
              <Route path="/terms" component={TermsOfService} />
              <Route path="/privacy" component={PrivacyStatement} />
              <Route path="/guide" component={PublicUserGuide} />
              <Route path="/friday" component={FridayPage} />
              <Route>
                <Router />
              </Route>
            </Switch>
          </OrganizationProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
