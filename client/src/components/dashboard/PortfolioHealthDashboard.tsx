import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, HeartPulse, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Target, Shield, Gauge, BarChart3, ArrowUpRight, ArrowDownRight, Minus
} from "lucide-react";
import { 
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis, CartesianGrid
} from "recharts";
import type { Risk } from "@shared/schema";

const HEALTH_COLORS = {
  Green: '#10b981',
  Yellow: '#f59e0b',
  Red: '#ef4444',
};

export function PortfolioHealthDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);
  const { data: portfolios } = usePortfolios(currentOrganization?.id);

  const { data: allRisks = [] } = useQuery<Risk[]>({
    queryKey: ['/api/risks', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/risks?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const projects = projectsData || [];

  const healthMetrics = useMemo(() => {
    const totalProjects = projects.length;
    const greenProjects = projects.filter(p => p.health === 'Green').length;
    const yellowProjects = projects.filter(p => p.health === 'Yellow').length;
    const redProjects = projects.filter(p => p.health === 'Red').length;

    const overallHealthScore = totalProjects > 0 
      ? Math.round(((greenProjects * 100) + (yellowProjects * 60) + (redProjects * 20)) / totalProjects)
      : 0;

    const avgCompletion = totalProjects > 0
      ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / totalProjects)
      : 0;

    const onSchedule = projects.filter(p => {
      if (!p.endDate) return true;
      return new Date(p.endDate) >= new Date();
    }).length;

    const onBudget = projects.filter(p => 
      Number(p.actualCost || 0) <= Number(p.budget || 0)
    ).length;

    return {
      totalProjects,
      greenProjects,
      yellowProjects,
      redProjects,
      overallHealthScore,
      avgCompletion,
      onSchedule,
      onBudget,
      scheduleCompliance: totalProjects > 0 ? Math.round((onSchedule / totalProjects) * 100) : 0,
      budgetCompliance: totalProjects > 0 ? Math.round((onBudget / totalProjects) * 100) : 0,
    };
  }, [projects]);

  const portfolioHealthData = useMemo(() => {
    if (!portfolios?.length) return [];

    return portfolios.map(portfolio => {
      const portfolioProjects = projects.filter(p => p.portfolioId === portfolio.id);
      const total = portfolioProjects.length;
      const green = portfolioProjects.filter(p => p.health === 'Green').length;
      const yellow = portfolioProjects.filter(p => p.health === 'Yellow').length;
      const red = portfolioProjects.filter(p => p.health === 'Red').length;
      
      const healthScore = total > 0 
        ? Math.round(((green * 100) + (yellow * 60) + (red * 20)) / total)
        : 0;

      return {
        name: portfolio.name.length > 15 ? portfolio.name.substring(0, 15) + '...' : portfolio.name,
        fullName: portfolio.name,
        green,
        yellow,
        red,
        total,
        healthScore,
        completion: total > 0 
          ? Math.round(portfolioProjects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / total)
          : 0,
      };
    }).filter(p => p.total > 0);
  }, [portfolios, projects]);

  const healthDistribution = [
    { name: 'On Track', value: healthMetrics.greenProjects, color: HEALTH_COLORS.Green },
    { name: 'At Risk', value: healthMetrics.yellowProjects, color: HEALTH_COLORS.Yellow },
    { name: 'Critical', value: healthMetrics.redProjects, color: HEALTH_COLORS.Red },
  ].filter(d => d.value > 0);

  const healthDimensions = [
    { dimension: 'Schedule', score: healthMetrics.scheduleCompliance, fullMark: 100 },
    { dimension: 'Budget', score: healthMetrics.budgetCompliance, fullMark: 100 },
    { dimension: 'Quality', score: Math.min(100, healthMetrics.overallHealthScore + 10), fullMark: 100 },
    { dimension: 'Risk', score: Math.max(0, 100 - (allRisks.filter(r => r.severity === 'High').length * 10)), fullMark: 100 },
    { dimension: 'Resources', score: 75, fullMark: 100 },
    { dimension: 'Scope', score: healthMetrics.avgCompletion > 0 ? Math.min(100, healthMetrics.avgCompletion + 30) : 70, fullMark: 100 },
  ];

  const riskHealthMatrix = useMemo(() => {
    return projects.map(p => {
      const projectRisks = allRisks.filter(r => r.projectId === p.id);
      const riskScore = projectRisks.reduce((sum, r) => {
        if (r.severity === 'High') return sum + 30;
        if (r.severity === 'Medium') return sum + 15;
        return sum + 5;
      }, 0);

      return {
        name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name,
        completion: p.completionPercentage || 0,
        riskScore: Math.min(100, riskScore),
        health: p.health,
        size: Number(p.budget || 100000) / 100000,
      };
    });
  }, [projects, allRisks]);

  const getHealthColor = (score: number) => {
    if (score >= 75) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  const getHealthBadge = (health: string) => {
    switch (health) {
      case 'Green': return <Badge className="bg-emerald-500">Healthy</Badge>;
      case 'Yellow': return <Badge className="bg-amber-500">At Risk</Badge>;
      case 'Red': return <Badge className="bg-red-500">Critical</Badge>;
      default: return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-primary" />
            Portfolio Health Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            <a 
              href="https://www.prince2.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline hover:text-primary transition-colors"
            >
              PRINCE2 Health Check
            </a>
            {" and "}
            <a 
              href="https://www.gartner.com/en/information-technology/role/strategic-portfolio-management" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline hover:text-primary transition-colors"
            >
              Gartner Portfolio Health Assessment
            </a>
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Health Score: {healthMetrics.overallHealthScore}%
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-overall-health">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Gauge className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">Overall Health</span>
          </div>
          <div className={`text-2xl font-bold ${getHealthColor(healthMetrics.overallHealthScore)}`}>
            {healthMetrics.overallHealthScore}%
          </div>
          <Progress value={healthMetrics.overallHealthScore} className="h-1 mt-2" />
        </Card>

        <Card className="p-4" data-testid="kpi-green-projects">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">On Track</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{healthMetrics.greenProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {healthMetrics.totalProjects > 0 
              ? Math.round((healthMetrics.greenProjects / healthMetrics.totalProjects) * 100) 
              : 0}% of total
          </p>
        </Card>

        <Card className="p-4" data-testid="kpi-yellow-projects">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">At Risk</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{healthMetrics.yellowProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Needs attention</p>
        </Card>

        <Card className="p-4" data-testid="kpi-red-projects">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Shield className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs text-muted-foreground">Critical</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{healthMetrics.redProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Requires intervention</p>
        </Card>

        <Card className="p-4" data-testid="kpi-schedule-compliance">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Target className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Schedule Compliance</span>
          </div>
          <div className="text-2xl font-bold">{healthMetrics.scheduleCompliance}%</div>
          <p className="text-[10px] text-muted-foreground mt-1">{healthMetrics.onSchedule} on schedule</p>
        </Card>

        <Card className="p-4" data-testid="kpi-budget-compliance">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Budget Compliance</span>
          </div>
          <div className="text-2xl font-bold">{healthMetrics.budgetCompliance}%</div>
          <p className="text-[10px] text-muted-foreground mt-1">{healthMetrics.onBudget} on budget</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="chart-health-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Health Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              <a 
                href="https://www.prince2.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline hover:text-primary transition-colors"
              >
                PRINCE2 Traffic Light
              </a>
              {" status"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={healthDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {healthDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-health-radar">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Health Dimensions
            </CardTitle>
            <CardDescription className="text-xs">
              Multi-dimensional health assessment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={healthDimensions}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-risk-health-matrix">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Risk vs Completion Matrix
            </CardTitle>
            <CardDescription className="text-xs">
              Project positioning analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="completion" name="Completion" unit="%" fontSize={10} domain={[0, 100]} />
                  <YAxis type="number" dataKey="riskScore" name="Risk Score" fontSize={10} domain={[0, 100]} />
                  <ZAxis type="number" dataKey="size" range={[50, 400]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', fontSize: '11px' }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Scatter 
                    data={riskHealthMatrix} 
                    fill="#3b82f6"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {portfolioHealthData.length > 0 && (
        <Card data-testid="chart-portfolio-health-comparison">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Health Comparison</CardTitle>
            <CardDescription className="text-xs">
              Health status breakdown by portfolio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={portfolioHealthData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={100} fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="green" stackId="a" fill={HEALTH_COLORS.Green} name="On Track" />
                  <Bar dataKey="yellow" stackId="a" fill={HEALTH_COLORS.Yellow} name="At Risk" />
                  <Bar dataKey="red" stackId="a" fill={HEALTH_COLORS.Red} name="Critical" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-health-details">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Project Health Details</CardTitle>
          <CardDescription className="text-xs">
            Individual project health status with key metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {projects.slice(0, 10).map((project) => (
              <div key={project.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{project.name}</span>
                    {getHealthBadge(project.health || 'Unknown')}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {project.status} • {project.completionPercentage || 0}% complete
                  </p>
                </div>
                <div className="flex items-center gap-4 ml-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Schedule</div>
                    <div className="text-sm font-medium">
                      {project.endDate ? (
                        new Date(project.endDate) >= new Date() ? (
                          <span className="text-emerald-600">On Track</span>
                        ) : (
                          <span className="text-red-600">Overdue</span>
                        )
                      ) : 'N/A'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Budget</div>
                    <div className="text-sm font-medium">
                      {Number(project.actualCost || 0) <= Number(project.budget || 0) ? (
                        <span className="text-emerald-600">On Budget</span>
                      ) : (
                        <span className="text-red-600">Over</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
