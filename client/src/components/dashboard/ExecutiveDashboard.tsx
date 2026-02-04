import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { ProjectCardCompact, ProjectCardCompactSkeleton } from "./ProjectCardCompact";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Loader2, Briefcase, AlertTriangle, TrendingUp, CheckCircle2, 
  FileInput, Clock, Upload, PenTool, DollarSign,
  FolderKanban, ArrowRight, Activity, Target, BarChart3
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, Area, AreaChart } from "recharts";
import { isWithinInterval, parseISO } from "date-fns";
import type { ProjectIntake, Risk, Issue } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Cyan: "#06b6d4",
};

export function ExecutiveDashboard() {
  const { currentOrganization } = useOrganization();
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());
  const [, setLocation] = useLocation();
  
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  
  const { data: allRisks = [] } = useQuery<Risk[]>({
    queryKey: ['/api/risks', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/risks?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: allIssues = [] } = useQuery<Issue[]>({
    queryKey: ['/api/issues-all', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/issues?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const projects = useMemo(() => {
    return (projectsData ?? []).filter(p => {
      if (filters.portfolioId && p.portfolioId !== filters.portfolioId) return false;
      if (filters.projectId && p.id !== filters.projectId) return false;
      if (filters.health && p.health !== filters.health) return false;
      if (filters.dateRange.from || filters.dateRange.to) {
        const startDate = p.startDate ? new Date(p.startDate) : null;
        if (startDate) {
          if (filters.dateRange.from && filters.dateRange.to) {
            if (!isWithinInterval(startDate, { start: filters.dateRange.from, end: filters.dateRange.to })) {
              return false;
            }
          } else if (filters.dateRange.from && startDate < filters.dateRange.from) {
            return false;
          } else if (filters.dateRange.to && startDate > filters.dateRange.to) {
            return false;
          }
        }
      }
      return true;
    });
  }, [projectsData, filters]);

  const { data: intakes = [], isLoading: intakesLoading } = useQuery<ProjectIntake[]>({
    queryKey: ['/api/project-intakes', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const handleExportCsv = () => {
    const headers = ["Project Name", "Status", "Health", "Progress", "Budget", "Start Date", "End Date"];
    const rows = projects.map(p => [
      p.name,
      p.status,
      p.health,
      `${p.completionPercentage || 0}%`,
      p.budget || "0",
      p.startDate || "",
      p.endDate || ""
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "executive_dashboard.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (projectsLoading || portfoliosLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatBudget = (amount: number) => formatCurrency(amount, { compact: true });

  const totalProjects = projects?.length || 0;
  const totalPortfolios = portfolios?.length || 0;
  const healthyProjects = projects?.filter(p => p.health === "Green").length || 0;
  const atRiskProjects = projects?.filter(p => p.health === "Yellow").length || 0;
  const criticalProjects = projects?.filter(p => p.health === "Red").length || 0;
  const completedProjects = projects?.filter(p => p.status === "Closing").length || 0;
  const activeProjects = projects?.filter(p => p.status === "Execution").length || 0;
  const planningProjects = projects?.filter(p => p.status === "Planning").length || 0;
  const totalBudget = projects?.reduce((sum, p) => sum + Number(p.budget || 0), 0) || 0;
  const avgCompletion = projects?.length ? Math.round(projects.reduce((s, p) => s + (p.completionPercentage || 0), 0) / projects.length) : 0;
  
  const openRisks = allRisks.filter(r => r.status === "Open" || r.status === "Identified").length;
  const highRisks = allRisks.filter(r => r.probability === "High" || r.impact === "High").length;
  // Filter out risks (itemType='risk') from issues count - only count actual issues
  const actualIssues = allIssues.filter(i => i.itemType !== 'risk');
  const openIssues = actualIssues.filter(i => i.status === "Open" || i.status === "In Progress").length;
  const criticalIssues = actualIssues.filter(i => i.priority === "Critical" || i.priority === "High").length;
  
  const totalIntakes = intakes?.length || 0;
  const intakesInReview = intakes?.filter(i => i.status === "draft" || i.status === "in_progress").length || 0;
  const approvedIntakes = intakes?.filter(i => i.status === "approved").length || 0;

  const healthData = [
    { name: "Healthy", value: healthyProjects, color: COLORS.Green },
    { name: "At Risk", value: atRiskProjects, color: COLORS.Yellow },
    { name: "Critical", value: criticalProjects, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const statusData = [
    { name: "Planning", count: planningProjects, fill: COLORS.Blue },
    { name: "Execution", count: activeProjects, fill: COLORS.Purple },
    { name: "Closing", count: completedProjects, fill: COLORS.Green },
  ].filter(d => d.count > 0);

  const priorityProjects = [...projects]
    .filter(p => p.health === "Red" || p.health === "Yellow")
    .sort((a, b) => {
      if (a.health === "Red" && b.health !== "Red") return -1;
      if (b.health === "Red" && a.health !== "Red") return 1;
      return (b.completionPercentage || 0) - (a.completionPercentage || 0);
    })
    .slice(0, 6);

  const topProjects = [...projects]
    .sort((a, b) => Number(b.budget || 0) - Number(a.budget || 0))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div>
          <h2 className="text-xl font-semibold">Executive Overview</h2>
          <p className="text-sm text-muted-foreground">High-level view of projects, portfolios, and organizational health.</p>
        </div>
        <div className="flex items-center gap-2">
          <DashboardActionBar title="Executive Dashboard" dashboardType="executive" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
        </div>
      </div>

      <DashboardFilters
        portfolios={portfolios || []}
        projects={filters.portfolioId 
          ? (projectsData || []).filter(p => p.portfolioId === filters.portfolioId) 
          : (projectsData || [])}
        filters={filters}
        onFiltersChange={setFilters}
        showResource={false}
        showPriority={false}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/projects")} data-testid="kpi-total-projects">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">Projects</span>
          </div>
          <div className="text-2xl font-bold">{totalProjects}</div>
          <div className="text-xs text-muted-foreground">{totalPortfolios} portfolios</div>
        </Card>

        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/projects?health=Red")} data-testid="kpi-critical">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-destructive/10">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Critical</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{criticalProjects}</div>
          <div className="text-xs text-muted-foreground">{atRiskProjects} at risk</div>
        </Card>

        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/projects?status=Execution")} data-testid="kpi-active">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Activity className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
          <div className="text-2xl font-bold">{activeProjects}</div>
          <div className="text-xs text-muted-foreground">{avgCompletion}% avg progress</div>
        </Card>

        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/projects")} data-testid="kpi-budget">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Budget</span>
          </div>
          <div className="text-2xl font-bold">{formatBudget(totalBudget)}</div>
          <div className="text-xs text-muted-foreground">total allocated</div>
        </Card>

        <Card className="p-3 hover-elevate cursor-pointer" data-testid="kpi-risks">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Target className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Risks</span>
          </div>
          <div className="text-2xl font-bold">{openRisks}</div>
          <div className="text-xs text-muted-foreground">{highRisks} high priority</div>
        </Card>

        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/intakes")} data-testid="kpi-intakes">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <FileInput className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Intakes</span>
          </div>
          <div className="text-2xl font-bold">{totalIntakes}</div>
          <div className="text-xs text-muted-foreground">{intakesInReview} pending</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="chart-health-overview">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Health Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {healthData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center p-2 rounded-md bg-emerald-500/10">
                <div className="text-lg font-semibold text-emerald-600">{healthyProjects}</div>
                <div className="text-[10px] text-muted-foreground">Healthy</div>
              </div>
              <div className="text-center p-2 rounded-md bg-amber-500/10">
                <div className="text-lg font-semibold text-amber-600">{atRiskProjects}</div>
                <div className="text-[10px] text-muted-foreground">At Risk</div>
              </div>
              <div className="text-center p-2 rounded-md bg-destructive/10">
                <div className="text-lg font-semibold text-destructive">{criticalProjects}</div>
                <div className="text-[10px] text-muted-foreground">Critical</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-project-pipeline">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Project Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} layout="vertical">
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={60} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Planning</span>
                <Badge variant="outline" className="text-[10px] h-5">{planningProjects}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Execution</span>
                <Badge variant="outline" className="text-[10px] h-5">{activeProjects}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Completed</span>
                <Badge variant="outline" className="text-[10px] h-5">{completedProjects}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-risk-issue-summary">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Risk & Issue Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Open Risks</span>
                  <Badge variant="secondary" className="text-[10px] h-5 bg-amber-500/10 text-amber-700">{openRisks}</Badge>
                </div>
                <Progress value={openRisks > 0 ? Math.min((highRisks / openRisks) * 100, 100) : 0} className="h-1.5" />
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span>{highRisks} high priority</span>
                  <span>{allRisks.length} total</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Open Issues</span>
                  <Badge variant="secondary" className="text-[10px] h-5 bg-destructive/10 text-destructive">{openIssues}</Badge>
                </div>
                <Progress value={openIssues > 0 ? Math.min((criticalIssues / openIssues) * 100, 100) : 0} className="h-1.5" />
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span>{criticalIssues} critical/high</span>
                  <span>{actualIssues.length} total</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Intake Pipeline</span>
                  <Badge variant="secondary" className="text-[10px] h-5 bg-cyan-500/10 text-cyan-700">{intakesInReview}</Badge>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span>{approvedIntakes} approved</span>
                  <span>{totalIntakes} total</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-priority-attention">
          <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Priority Attention
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setLocation("/projects?health=Red,Yellow")} data-testid="button-view-priority">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {priorityProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                All projects are healthy!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {priorityProjects.map(project => (
                  <ProjectCardCompact key={project.id} project={project} showBudget={false} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-top-projects">
          <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Top Projects by Budget
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setLocation("/projects")} data-testid="button-view-projects">
              View All <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {topProjects.map(project => (
                <ProjectCardCompact key={project.id} project={project} showProgress={false} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
