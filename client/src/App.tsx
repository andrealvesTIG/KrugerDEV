import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { OrganizationProvider, useOrganization } from "@/hooks/use-organization";
import { UserJourneyProvider } from "@/hooks/use-user-journey";
import { ThemeProvider } from "@/components/theme-provider";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { TermsConsentModal } from "@/components/TermsConsentModal";
import NotFound from "@/pages/not-found";
import { ReactNode, useEffect, lazy, Suspense } from "react";
import { initGA } from "@/lib/analytics";
import { useAnalytics } from "@/hooks/use-analytics";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// Lazy-loaded pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Portfolios = lazy(() => import("@/pages/Portfolios"));
const PortfolioDetails = lazy(() => import("@/pages/PortfolioDetails"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetails = lazy(() => import("@/pages/ProjectDetails"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Issues = lazy(() => import("@/pages/Issues"));
const LessonsLearned = lazy(() => import("@/pages/LessonsLearned"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Admin = lazy(() => import("@/pages/Admin"));
const SuperAdmin = lazy(() => import("@/pages/SuperAdmin"));
const OrgSettings = lazy(() => import("@/pages/OrgSettings"));
const Profile = lazy(() => import("@/pages/Profile"));
const UserGuide = lazy(() => import("@/pages/UserGuide"));
const Resources = lazy(() => import("@/pages/Resources"));
const ResourceDetails = lazy(() => import("@/pages/ResourceDetails"));
const ProjectIntakes = lazy(() => import("@/pages/ProjectIntakes"));
const IntakeDetails = lazy(() => import("@/pages/IntakeDetails"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const Timesheets = lazy(() => import("@/pages/Timesheets"));
const Billing = lazy(() => import("@/pages/Billing"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const VerifyMagicLinkPage = lazy(() => import("@/pages/VerifyMagicLinkPage"));
const SignInPage = lazy(() => import("@/pages/SignInPage"));
const SignInWaitingPage = lazy(() => import("@/pages/SignInWaitingPage"));
const VerifySignInPage = lazy(() => import("@/pages/VerifySignInPage"));
const VerifyEmailPage = lazy(() => import("@/pages/VerifyEmailPage"));
const ResourceInvitePage = lazy(() => import("@/pages/ResourceInvitePage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const AccountSetupPage = lazy(() => import("@/pages/AccountSetupPage"));
const Embed = lazy(() => import("@/pages/Embed"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const PrivacyStatement = lazy(() => import("@/pages/PrivacyStatement"));
const PublicUserGuide = lazy(() => import("@/pages/PublicUserGuide"));
const FridayPage = lazy(() => import("@/pages/FridayPage"));
const Simulation = lazy(() => import("@/pages/Simulation"));
const PmoRadar = lazy(() => import("@/pages/PmoRadar"));
const ReportSubscriptions = lazy(() => import("@/pages/ReportSubscriptions"));
const SharedRiskAssessment = lazy(() => import("@/pages/SharedRiskAssessment"));
const SharedProjectRiskAssessment = lazy(() => import("@/pages/SharedProjectRiskAssessment"));
const PublicBadgeProfile = lazy(() => import("@/pages/PublicBadgeProfile"));
const Home = lazy(() => import("@/pages/Home"));
const LandingPageNew = lazy(() => import("@/pages/LandingPageNew"));
const HealthcareLandingPage = lazy(() => import("@/pages/HealthcareLandingPage"));
const FinancialServicesLandingPage = lazy(() => import("@/pages/FinancialServicesLandingPage"));
const ManufacturingLandingPage = lazy(() => import("@/pages/ManufacturingLandingPage"));
const IndustrialAutomationLandingPage = lazy(() => import("@/pages/IndustrialAutomationLandingPage"));
const ConstructionLandingPage = lazy(() => import("@/pages/ConstructionLandingPage"));
const EnergyLandingPage = lazy(() => import("@/pages/EnergyLandingPage"));
const GovernmentLandingPage = lazy(() => import("@/pages/GovernmentLandingPage"));
const UnCon2026LandingPage = lazy(() => import("@/pages/UnCon2026LandingPage"));
const UnCon2026SelfiePage = lazy(() => import("@/pages/UnCon2026SelfiePage"));
const PartnerProgramPage = lazy(() => import("@/pages/PartnerProgramPage"));
const Training = lazy(() => import("@/pages/Training"));
const TrainingModule = lazy(() => import("@/pages/TrainingModule"));
const Templates = lazy(() => import("@/pages/Templates"));
const InvestorRoom = lazy(() => import("@/pages/InvestorRoom"));
const Blog = lazy(() => import("@/pages/Blog"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));

function PageLoader() {
  return (
    <div className="flex h-96 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

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
    return (
      <Suspense fallback={<PageLoader />}>
        <SignInPage />
      </Suspense>
    );
  }
  
  return (
    <AppLayout>
      <TermsConsentModal />
      <OnboardingDialog />
      <Suspense fallback={<PageLoader />}>
        <Home />
      </Suspense>
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
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/dashboard"><DashboardRedirect /></Route>
          <GuardedRoute path="/dashboards" component={Dashboard} moduleKey="dashboard" />
          <Route path="/portfolios/:id">
            <ModuleGuard moduleKey="portfolios"><PortfolioDetails /></ModuleGuard>
          </Route>
          <GuardedRoute path="/portfolios" component={Portfolios} moduleKey="portfolios" />
          <Route path="/projects/:id">
            <ModuleGuard moduleKey="projects"><ProjectDetails /></ModuleGuard>
          </Route>
          <GuardedRoute path="/projects" component={Projects} moduleKey="projects" />
          <Route path="/intakes/:id">
            <ModuleGuard moduleKey="intakes"><IntakeDetails /></ModuleGuard>
          </Route>
          <GuardedRoute path="/intakes" component={ProjectIntakes} moduleKey="intakes" />
          <GuardedRoute path="/tasks" component={Tasks} moduleKey="tasks" />
          <GuardedRoute path="/issues" component={Issues} moduleKey="issues" />
          <GuardedRoute path="/simulation" component={Simulation} moduleKey="simulation" />
          <GuardedRoute path="/pmo-radar" component={PmoRadar} moduleKey="pmo-radar" />
          <GuardedRoute path="/lessons-learned" component={LessonsLearned} moduleKey="lessons-learned" />
          <GuardedRoute path="/invoices" component={Invoices} moduleKey="invoices" />
          <GuardedRoute path="/templates" component={Templates} moduleKey="templates" />
          <GuardedRoute path="/timesheets" component={Timesheets} moduleKey="timesheets" />
          <Route path="/resources/:id">
            <ModuleGuard moduleKey="resources"><ResourceDetails /></ModuleGuard>
          </Route>
          <GuardedRoute path="/resources" component={Resources} moduleKey="resources" />
          <GuardedRoute path="/calendar" component={Calendar} moduleKey="calendar" />
          <GuardedRoute path="/integrations" component={Integrations} moduleKey="integrations" />
          <Route path="/billing" component={Billing} />
          <Route path="/admin" component={Admin} />
          <Route path="/super-admin" component={SuperAdmin} />
          <Route path="/org-settings" component={OrgSettings} />
          <Route path="/profile" component={Profile} />
          <Route path="/user-guide" component={UserGuide} />
          <GuardedRoute path="/training/schedule-management" component={TrainingModule} moduleKey="training" />
          <GuardedRoute path="/training/:moduleId" component={TrainingModule} moduleKey="training" />
          <GuardedRoute path="/training" component={Training} moduleKey="training" />
          <Route path="/scheduled-reports" component={ReportSubscriptions} />
          <Route path="/risk-assessment/share/:token" component={SharedRiskAssessment} />
          <Route path="/project-risk-assessment/share/:token" component={SharedProjectRiskAssessment} />
          <Route path="/embed" component={Embed} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
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
            <UserJourneyProvider>
            <Toaster />
            <Suspense fallback={<PageLoader />}>
              <Switch>
                <Route path="/" component={HomePage} />
                <Route path="/auth">
                  <Suspense fallback={<PageLoader />}><AuthPage /></Suspense>
                </Route>
                <Route path="/auth/verify">
                  <Suspense fallback={<PageLoader />}><VerifyMagicLinkPage /></Suspense>
                </Route>
                <Route path="/signin">
                  <Suspense fallback={<PageLoader />}><SignInPage /></Suspense>
                </Route>
                <Route path="/signin/waiting">
                  <Suspense fallback={<PageLoader />}><SignInWaitingPage /></Suspense>
                </Route>
                <Route path="/signin/verify">
                  <Suspense fallback={<PageLoader />}><VerifySignInPage /></Suspense>
                </Route>
                <Route path="/reset-password">
                  <Suspense fallback={<PageLoader />}><ResetPasswordPage /></Suspense>
                </Route>
                <Route path="/verify-email">
                  <Suspense fallback={<PageLoader />}><VerifyEmailPage /></Suspense>
                </Route>
                <Route path="/resource-invite">
                  <Suspense fallback={<PageLoader />}><ResourceInvitePage /></Suspense>
                </Route>
                <Route path="/account-setup">
                  <Suspense fallback={<PageLoader />}><AccountSetupPage /></Suspense>
                </Route>
                <Route path="/onboarding">
                  <Suspense fallback={<PageLoader />}><OnboardingPage /></Suspense>
                </Route>
                <Route path="/terms">
                  <Suspense fallback={<PageLoader />}><TermsOfService /></Suspense>
                </Route>
                <Route path="/privacy">
                  <Suspense fallback={<PageLoader />}><PrivacyStatement /></Suspense>
                </Route>
                <Route path="/guide">
                  <Suspense fallback={<PageLoader />}><PublicUserGuide /></Suspense>
                </Route>
                <Route path="/friday">
                  <Suspense fallback={<PageLoader />}><FridayPage /></Suspense>
                </Route>
                <Route path="/signup">
                  <Suspense fallback={<PageLoader />}><LandingPageNew /></Suspense>
                </Route>
                <Route path="/healthcare">
                  <Suspense fallback={<PageLoader />}><HealthcareLandingPage /></Suspense>
                </Route>
                <Route path="/financial-services">
                  <Suspense fallback={<PageLoader />}><FinancialServicesLandingPage /></Suspense>
                </Route>
                <Route path="/manufacturing">
                  <Suspense fallback={<PageLoader />}><ManufacturingLandingPage /></Suspense>
                </Route>
                <Route path="/industrial-automation">
                  <Suspense fallback={<PageLoader />}><IndustrialAutomationLandingPage /></Suspense>
                </Route>
                <Route path="/construction">
                  <Suspense fallback={<PageLoader />}><ConstructionLandingPage /></Suspense>
                </Route>
                <Route path="/energy">
                  <Suspense fallback={<PageLoader />}><EnergyLandingPage /></Suspense>
                </Route>
                <Route path="/government">
                  <Suspense fallback={<PageLoader />}><GovernmentLandingPage /></Suspense>
                </Route>
                <Route path="/partners">
                  <Suspense fallback={<PageLoader />}><PartnerProgramPage /></Suspense>
                </Route>
                <Route path="/uncon2026/selfie">
                  <Suspense fallback={<PageLoader />}><UnCon2026SelfiePage /></Suspense>
                </Route>
                <Route path="/uncon2026">
                  <Suspense fallback={<PageLoader />}><UnCon2026LandingPage /></Suspense>
                </Route>
                <Route path="/badges/:userId/:badgeId">
                  <Suspense fallback={<PageLoader />}><PublicBadgeProfile /></Suspense>
                </Route>
                <Route path="/badges/:userId">
                  <Suspense fallback={<PageLoader />}><PublicBadgeProfile /></Suspense>
                </Route>
                <Route path="/blog/:slug">
                  <Suspense fallback={<PageLoader />}><BlogPost /></Suspense>
                </Route>
                <Route path="/blog">
                  <Suspense fallback={<PageLoader />}><Blog /></Suspense>
                </Route>
                <Route path="/investor-room">
                  <Suspense fallback={<PageLoader />}><InvestorRoom /></Suspense>
                </Route>
                <Route>
                  <Router />
                </Route>
              </Switch>
            </Suspense>
            </UserJourneyProvider>
          </OrganizationProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
