import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  PieChart as PieChartIcon, BarChart3, Briefcase, DollarSign, Users, 
  TrendingUp, FolderKanban, Layers, Target, Wallet
} from "lucide-react";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip, Legend, Treemap, CartesianGrid
} from "recharts";

import { formatCurrency } from "@/lib/format";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export function PortfolioAllocationDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);

  const projects = projectsData || [];

  const allocationMetrics = useMemo(() => {
    const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
    const totalProjects = projects.length;
    const portfolioCount = portfolios?.length || 0;
    
    const unallocatedProjects = projects.filter(p => !p.portfolioId).length;
    const allocatedProjects = totalProjects - unallocatedProjects;

    const avgProjectsPerPortfolio = portfolioCount > 0 
      ? (allocatedProjects / portfolioCount).toFixed(1)
      : '0';

    return {
      totalBudget,
      totalProjects,
      portfolioCount,
      unallocatedProjects,
      allocatedProjects,
      avgProjectsPerPortfolio,
      allocationRate: totalProjects > 0 ? Math.round((allocatedProjects / totalProjects) * 100) : 0,
    };
  }, [projects, portfolios]);

  const budgetByPortfolio = useMemo(() => {
    const result: { name: string; budget: number; projects: number; color: string }[] = [];
    
    if (portfolios?.length) {
      portfolios.forEach((portfolio, i) => {
        const portfolioProjects = projects.filter(p => p.portfolioId === portfolio.id);
        const budget = portfolioProjects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
        if (budget > 0 || portfolioProjects.length > 0) {
          result.push({
            name: portfolio.name.length > 20 ? portfolio.name.substring(0, 20) + '...' : portfolio.name,
            budget,
            projects: portfolioProjects.length,
            color: COLORS[i % COLORS.length],
          });
        }
      });
    }

    const unallocated = projects.filter(p => !p.portfolioId);
    if (unallocated.length > 0) {
      result.push({
        name: 'Unallocated',
        budget: unallocated.reduce((sum, p) => sum + Number(p.budget || 0), 0),
        projects: unallocated.length,
        color: '#94a3b8',
      });
    }

    return result.sort((a, b) => b.budget - a.budget);
  }, [projects, portfolios]);

  const projectsByStatus = useMemo(() => {
    const statusGroups: Record<string, { count: number; budget: number }> = {};
    projects.forEach(p => {
      const status = p.status || 'Unknown';
      if (!statusGroups[status]) {
        statusGroups[status] = { count: 0, budget: 0 };
      }
      statusGroups[status].count++;
      statusGroups[status].budget += Number(p.budget || 0);
    });
    
    return Object.entries(statusGroups).map(([name, data], i) => ({
      name,
      count: data.count,
      budget: data.budget,
      color: COLORS[i % COLORS.length],
    }));
  }, [projects]);

  const projectsByPriority = useMemo(() => {
    const priorityGroups: Record<string, { count: number; budget: number }> = {};
    projects.forEach(p => {
      const priority = p.priority || 'Medium';
      if (!priorityGroups[priority]) {
        priorityGroups[priority] = { count: 0, budget: 0 };
      }
      priorityGroups[priority].count++;
      priorityGroups[priority].budget += Number(p.budget || 0);
    });
    
    const priorityOrder = ['Critical', 'High', 'Medium', 'Low'];
    return priorityOrder
      .filter(p => priorityGroups[p])
      .map((name, i) => ({
        name,
        count: priorityGroups[name].count,
        budget: priorityGroups[name].budget,
        color: name === 'Critical' ? '#ef4444' : name === 'High' ? '#f59e0b' : name === 'Medium' ? '#3b82f6' : '#10b981',
      }));
  }, [projects]);

  const treemapData = useMemo(() => {
    return budgetByPortfolio.map((p, i) => ({
      name: p.name,
      size: p.budget || 1,
      color: p.color,
    }));
  }, [budgetByPortfolio]);

  const formatCompact = (value: number) => formatCurrency(value, { compact: true });

  const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, name, color, size } = props;
    if (width < 40 || height < 25) return null;

    const showBudget = width > 90 && height > 55;
    const cx = x + width / 2;
    const cy = showBudget ? y + height / 2 - 8 : y + height / 2;
    const truncated = width < 80 ? (name?.length > 10 ? name.substring(0, 10) + '…' : name) : name;

    const textProps = {
      x: cx,
      textAnchor: "middle" as const,
      fontWeight: "bold",
    };

    return (
      <g>
        <rect x={x} y={y} width={width} height={height} style={{ fill: color, stroke: '#fff', strokeWidth: 2 }} />
        <text {...textProps} y={cy} stroke="rgba(0,0,0,0.5)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke" fill="#fff" fontSize={13}>
          {truncated}
        </text>
        {showBudget && (
          <text {...textProps} y={cy + 18} stroke="rgba(0,0,0,0.4)" strokeWidth={2} strokeLinejoin="round" paintOrder="stroke" fill="rgba(255,255,255,0.9)" fontSize={11}>
            {formatCompact(size)}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Portfolio Allocation Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            Resource and budget allocation analysis across portfolios
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {allocationMetrics.portfolioCount} Portfolios
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-total-budget">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Wallet className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Budget</span>
          </div>
          <div className="text-2xl font-bold">{formatCompact(allocationMetrics.totalBudget)}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Across all projects</p>
        </Card>

        <Card className="p-4" data-testid="kpi-portfolios">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <FolderKanban className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Portfolios</span>
          </div>
          <div className="text-2xl font-bold">{allocationMetrics.portfolioCount}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Active portfolios</p>
        </Card>

        <Card className="p-4" data-testid="kpi-allocated-projects">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Briefcase className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Allocated</span>
          </div>
          <div className="text-2xl font-bold">{allocationMetrics.allocatedProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{allocationMetrics.allocationRate}% allocation rate</p>
        </Card>

        <Card className="p-4" data-testid="kpi-unallocated">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Target className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Unallocated</span>
          </div>
          <div className="text-2xl font-bold">{allocationMetrics.unallocatedProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Need portfolio assignment</p>
        </Card>

        <Card className="p-4" data-testid="kpi-total-projects">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Layers className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Projects</span>
          </div>
          <div className="text-2xl font-bold">{allocationMetrics.totalProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">In organization</p>
        </Card>

        <Card className="p-4" data-testid="kpi-avg-per-portfolio">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <TrendingUp className="h-4 w-4 text-pink-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg per Portfolio</span>
          </div>
          <div className="text-2xl font-bold">{allocationMetrics.avgProjectsPerPortfolio}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Projects per portfolio</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-budget-by-portfolio">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              Budget Distribution by Portfolio
            </CardTitle>
            <CardDescription className="text-xs">
              Investment allocation across portfolios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={budgetByPortfolio}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                    dataKey="budget"
                    nameKey="name"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {budgetByPortfolio.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number) => formatCompact(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-projects-by-portfolio">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Projects by Portfolio
            </CardTitle>
            <CardDescription className="text-xs">
              Project count and budget comparison
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={budgetByPortfolio} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={100} fontSize={10} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number, name: string) => 
                      name === 'budget' ? formatCompact(value) : value
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="projects" fill="#3b82f6" name="Projects" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-projects-by-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Allocation by Status
            </CardTitle>
            <CardDescription className="text-xs">
              Project distribution by lifecycle stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectsByStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="count" fill="#3b82f6" name="Projects" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-projects-by-priority">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Allocation by Priority
            </CardTitle>
            <CardDescription className="text-xs">
              Strategic priority distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectsByPriority}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number, name: string) => 
                      name === 'Budget' ? formatCompact(value) : value
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]}>
                    {projectsByPriority.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {treemapData.length > 0 && (
        <Card data-testid="chart-budget-treemap">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Budget Allocation Treemap
            </CardTitle>
            <CardDescription className="text-xs">
              Visual representation of budget proportions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  aspectRatio={4/3}
                  stroke="#fff"
                  content={<CustomTreemapContent />}
                />
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
