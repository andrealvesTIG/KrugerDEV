import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";

// Pages
import Dashboard from "@/pages/Dashboard";
import Portfolios from "@/pages/Portfolios";
import Projects from "@/pages/Projects";
import ProjectDetails from "@/pages/ProjectDetails";
import Calendar from "@/pages/Calendar";
import Issues from "@/pages/Issues";
import Tasks from "@/pages/Tasks";
import Admin from "@/pages/Admin";
import SuperAdmin from "@/pages/SuperAdmin";
import OrgSettings from "@/pages/OrgSettings";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/portfolios" component={Portfolios} />
        <Route path="/portfolios/:id" component={(params) => <div>Portfolio Details {params.params.id} (Impl similar to Projects)</div>} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/:id" component={ProjectDetails} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/issues" component={Issues} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/admin" component={Admin} />
        <Route path="/super-admin" component={SuperAdmin} />
        <Route path="/org-settings" component={OrgSettings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
