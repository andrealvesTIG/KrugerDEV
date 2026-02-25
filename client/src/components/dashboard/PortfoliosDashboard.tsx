import { useState, useMemo } from "react";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { useLocation } from "wouter";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { ProjectCardCompact } from "./ProjectCardCompact";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FolderKanban, Target, TrendingUp, DollarSign, ArrowRight, Activity, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { isWithinInterval } from "date-fns";
import { formatCurrency } from "@/lib/format";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Indigo: "#6366f1",
  Pink: "#ec4899",
  Teal: "#14b8a6",
  Cyan: "#06b6d4",
};

const PORTFOLIO_COLORS = [COLORS.Blue, COLORS.Purple, COLORS.Teal, COLORS.Pink, COLORS.Indigo, COLORS.Green, COLORS.Cyan];

export function PortfoliosDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: portfoliosData, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());

  const portfolios = useMemo(() => {
    return (portfoliosData ?? [])
      .filter(p => {
        if (filters.portfolioId !== null && filters.portfolioId !== -1 && p.id !== filters.portfolioId) return false;
        return true;
      })
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [portfoliosData, filters.portfolioId]);

  const projects = useMemo(() => {
    return (projectsData ?? []).filter(p => {
      if (filters.portfolioId === -1 && p.portfolioId) return false;
      if (filters.portfolioId !== null && filters.portfolioId !== -1 && p.portfolioId !== filters.portfolioId) return false;
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

  const portfolioData = useMemo(() => {
    const data = (portfolios || []).map((portfolio, index) => {
      const portfolioProjects = projects?.filter(p => p.portfolioId === portfolio.id) || [];
      const budget = portfolioProjects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
      const greenCount = portfolioProjects.filter(p => p.health === "Green").length;
      const healthPercentage = portfolioProjects.length > 0 ? Math.round((greenCount / portfolioProjects.length) * 100) : 0;
      const avgCompletion = portfolioProjects.length 
        ? Math.round(portfolioProjects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / portfolioProjects.length) 
        : 0;
      
      return {
        id: portfolio.id,
        name: portfolio.name,
        shortName: portfolio.name.length > 12 ? portfolio.name.substring(0, 12) + "..." : portfolio.name,
        projectCount: portfolioProjects.length,
        activeCount: portfolioProjects.filter(p => p.status !== "Closing").length,
        budget,
        healthPercentage,
        avgCompletion,
        color: PORTFOLIO_COLORS[index % PORTFOLIO_COLORS.length],
        projects: portfolioProjects,
        isUnassigned: false,
      };
    });

    const unassignedProjects = (projects || []).filter(p => !p.portfolioId);
    const budget = unassignedProjects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
    const greenCount = unassignedProjects.filter(p => p.health === "Green").length;
    const healthPercentage = unassignedProjects.length > 0 ? Math.round((greenCount / unassignedProjects.length) * 100) : 0;
    const avgCompletion = unassignedProjects.length > 0 ? Math.round(unassignedProjects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / unassignedProjects.length) : 0;
    data.push({
      id: -1,
      name: "No Portfolio",
      shortName: "No Portfolio",
      projectCount: unassignedProjects.length,
      activeCount: unassignedProjects.filter(p => p.status !== "Closing").length,
      budget,
      healthPercentage,
      avgCompletion,
      color: "#94a3b8",
      projects: unassignedProjects,
      isUnassigned: true,
    });

    return data;
  }, [portfolios, projects]);

  const portfolioBudgets = portfolioData.filter(p => p.budget > 0);
  const portfolioProjectCounts = portfolioData.filter(p => p.projectCount > 0);
  const realPortfolios = portfolioData.filter(p => !p.isUnassigned);
  const unassignedEntry = portfolioData.find(p => p.isUnassigned);

  if (portfoliosLoading || projectsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const formatBudget = (amount: number) => formatCurrency(amount, { compact: true });

  const handleExportCsv = () => {
    const headers = ["Portfolio", "Projects", "Active", "Completed", "Budget", "Avg Completion", "Health Score"];
    const rows = portfolioData.map(p => {
      return [p.name, p.projectCount, p.activeCount, p.projectCount - p.activeCount, p.budget, `${p.avgCompletion}%`, `${p.healthPercentage}%`];
    });
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "portfolios_dashboard.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPortfolios = portfolios?.length || 0;
  const totalProjects = projects?.length || 0;
  const activeProjects = projects?.filter(p => p.status !== "Closing")?.length || 0;
  const completedProjects = projects?.filter(p => p.status === "Closing")?.length || 0;
  const totalBudget = projects?.reduce((sum, p) => sum + Number(p.budget || 0), 0) || 0;
  const avgCompletionRate = projects?.length 
    ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / projects.length)
    : 0;
  const healthyProjects = projects?.filter(p => p.health === "Green").length || 0;
  const atRiskProjects = projects?.filter(p => p.health === "Yellow").length || 0;
  const criticalProjects = projects?.filter(p => p.health === "Red").length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Portfolio Overview</h2>
          <p className="text-sm text-muted-foreground">Portfolio health, budgets, and project distribution.</p>
        </div>
        <DashboardActionBar title="Portfolios Dashboard" dashboardType="portfolios" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <DashboardFilters
        portfolios={portfoliosData || []}
        projects={filters.portfolioId !== null
          ? (projectsData || []).filter(p => filters.portfolioId === -1 ? !p.portfolioId : p.portfolioId === filters.portfolioId) 
          : (projectsData || [])}
        filters={filters}
        onFiltersChange={setFilters}
        showResource={false}
        showPriority={false}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/portfolios")} data-testid="kpi-total-portfolios">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <FolderKanban className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Portfolios</span>
          </div>
          <div className="text-2xl font-bold">{totalPortfolios}</div>
          <div className="text-xs text-muted-foreground">{totalProjects} projects</div>
        </Card>

        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/projects")} data-testid="kpi-active-projects">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Activity className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Active</span>
          </div>
          <div className="text-2xl font-bold">{activeProjects}</div>
          <div className="text-xs text-muted-foreground">{completedProjects} completed</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-avg-completion">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Progress</span>
          </div>
          <div className="text-2xl font-bold">{avgCompletionRate}%</div>
          <Progress value={avgCompletionRate} className="h-1.5 mt-1" />
        </Card>

        <Card className="p-3 hover-elevate cursor-pointer" onClick={() => setLocation("/projects")} data-testid="kpi-total-budget">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <DollarSign className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Budget</span>
          </div>
          <div className="text-2xl font-bold">{formatBudget(totalBudget)}</div>
          <div className="text-xs text-muted-foreground">allocated</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-healthy">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <Target className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Healthy</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{healthyProjects}</div>
          <div className="text-xs text-muted-foreground">{atRiskProjects} at risk</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-critical">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-destructive/10">
              <BarChart3 className="h-3.5 w-3.5 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Critical</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{criticalProjects}</div>
          <div className="text-xs text-muted-foreground">need attention</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="chart-projects-by-portfolio">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
              Projects by Portfolio
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolioProjectCounts} layout="vertical">
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis dataKey="shortName" type="category" fontSize={10} tickLine={false} axisLine={false} width={80} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number, name: string, props: any) => [value, props.payload.name]}
                  />
                  <Bar dataKey="projectCount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-budget-allocation">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Budget Allocation
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={portfolioBudgets} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={45} 
                    outerRadius={75} 
                    paddingAngle={2} 
                    dataKey="budget"
                  >
                    {portfolioBudgets.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number, name: string) => [formatBudget(value), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-portfolio-health">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Portfolio Health
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[180px]">
              <div className="space-y-3">
                {[...realPortfolios.slice(0, 5), ...(unassignedEntry ? [unassignedEntry] : [])].map((portfolio) => (
                  <div key={portfolio.id} className="space-y-1" data-testid={`health-item-${portfolio.id}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate max-w-[140px]" title={portfolio.name}>{portfolio.shortName}</span>
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] h-5"
                        style={{ 
                          backgroundColor: `${portfolio.healthPercentage >= 70 ? COLORS.Green : portfolio.healthPercentage >= 40 ? COLORS.Yellow : COLORS.Red}15`,
                          color: portfolio.healthPercentage >= 70 ? COLORS.Green : portfolio.healthPercentage >= 40 ? COLORS.Yellow : COLORS.Red,
                        }}
                      >
                        {portfolio.healthPercentage}%
                      </Badge>
                    </div>
                    <Progress value={portfolio.healthPercentage} className="h-1.5" />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{portfolio.projectCount} projects</span>
                      <span>{portfolio.avgCompletion}% complete</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {[...realPortfolios.slice(0, 4), ...(unassignedEntry ? [unassignedEntry] : [])].map((portfolio) => (
          <Card key={portfolio.id} data-testid={`card-portfolio-${portfolio.id}`}>
            <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: portfolio.color }} />
                <CardTitle className="text-sm font-medium">{portfolio.name}</CardTitle>
                <Badge variant="outline" className="text-[10px] h-5">{portfolio.projectCount} projects</Badge>
              </div>
              {!portfolio.isUnassigned && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs gap-1"
                  data-testid={`button-view-portfolio-${portfolio.id}`} 
                  onClick={() => setLocation(`/portfolios/${portfolio.id}`)}
                >
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {portfolio.projects.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">No projects in this portfolio</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {portfolio.projects.slice(0, 6).map(project => (
                    <ProjectCardCompact key={project.id} project={project} showBudget={false} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
