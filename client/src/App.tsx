import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { OrganizationProvider, useOrganization } from "@/hooks/use-organization";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import { ReactNode } from "react";

// Pages
import Dashboard from "@/pages/Dashboard";
import Portfolios from "@/pages/Portfolios";
import PortfolioDetails from "@/pages/PortfolioDetails";
import Projects from "@/pages/Projects";
import ProjectDetails from "@/pages/ProjectDetails";
import Calendar from "@/pages/Calendar";
import Issues from "@/pages/Issues";
import Tasks from "@/pages/Tasks";
import Admin from "@/pages/Admin";
import SuperAdmin from "@/pages/SuperAdmin";
import OrgSettings from "@/pages/OrgSettings";
import Profile from "@/pages/Profile";
import UserSettings from "@/pages/UserSettings";
import UserGuide from "@/pages/UserGuide";
import Resources from "@/pages/Resources";
import ProjectIntakes from "@/pages/ProjectIntakes";
import IntakeDetails from "@/pages/IntakeDetails";
import Integrations from "@/pages/Integrations";

const moduleRouteMap: Record<string, string> = {
  "/": "dashboard",
  "/portfolios": "portfolios",
  "/projects": "projects",
  "/intakes": "intakes",
  "/tasks": "tasks",
  "/issues": "issues",
  "/resources": "resources",
  "/calendar": "calendar",
  "/integrations": "integrations",
};

function ModuleGuard({ children, moduleKey }: { children: ReactNode; moduleKey: string }) {
  const { currentOrganization, isLoading } = useOrganization();
  
  if (isLoading) return null;
  
  const hiddenModules = currentOrganization?.hiddenModules || [];
  if (hiddenModules.includes(moduleKey)) {
    return <Redirect to="/org-settings" />;
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

function Router() {
  return (
    <AppLayout>
      <Switch>
        <GuardedRoute path="/" component={Dashboard} moduleKey="dashboard" />
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
        <GuardedRoute path="/resources" component={Resources} moduleKey="resources" />
        <GuardedRoute path="/calendar" component={Calendar} moduleKey="calendar" />
        <GuardedRoute path="/integrations" component={Integrations} moduleKey="integrations" />
        <Route path="/admin" component={Admin} />
        <Route path="/super-admin" component={SuperAdmin} />
        <Route path="/org-settings" component={OrgSettings} />
        <Route path="/profile" component={Profile} />
        <Route path="/user-settings" component={UserSettings} />
        <Route path="/user-guide" component={UserGuide} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="ppm-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <OrganizationProvider>
            <Toaster />
            <Router />
          </OrganizationProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
