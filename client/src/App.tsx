import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { OrganizationProvider } from "@/hooks/use-organization";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

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

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/portfolios" component={Portfolios} />
        <Route path="/portfolios/:id" component={PortfolioDetails} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetails} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/issues" component={Issues} />
        <Route path="/calendar" component={Calendar} />
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
