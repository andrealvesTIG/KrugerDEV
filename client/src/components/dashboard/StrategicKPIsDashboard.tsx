import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Target, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, 
  DollarSign, Clock, Users, Briefcase, Award, Gauge, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, Calendar, Shield
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line, CartesianGrid } from "recharts";
import type { Risk, Issue, Task } from "@shared/schema";

export function StrategicKPIsDashboard() {
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

  const { data: allTasksData } = useQuery<{ tasks: Task[]; total: number; hasMore: boolean }>({
    queryKey: ['/api/tasks', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/tasks?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return { tasks: [], total: 0, hasMore: false };
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const projects = projectsData || [];
  const allTasks = allTasksData?.tasks || [];

  const kpis = useMemo(() => {
    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.status === 'Execution' || p.status === 'Planning').length;
    const completedProjects = projects.filter(p => p.status === 'Closed').length;
    const onTrackProjects = projects.filter(p => p.health === 'Green').length;
    const atRiskProjects = projects.filter(p => p.health === 'Yellow').length;
    const criticalProjects = projects.filter(p => p.health === 'Red').length;
    
    const totalBudget = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0);
    const totalActualCost = projects.reduce((sum, p) => sum + Number(p.actualCost || 0), 0);
    const avgCompletion = totalProjects > 0 
      ? Math.round(projects.reduce((sum, p) => sum + (p.completionPercentage || 0), 0) / totalProjects)
      : 0;
    
    const openRisks = allRisks.filter(r => r.status === 'Open' || r.status === 'Identified').length;
    const highRisks = allRisks.filter(r => (r.status === 'Open' || r.status === 'Identified') && r.severity === 'High').length;
    
    const completedTasks = allTasks.filter(t => t.status === 'Completed').length;
    const totalTasks = allTasks.length;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const projectSuccessRate = totalProjects > 0 ? Math.round((onTrackProjects / totalProjects) * 100) : 0;
    const budgetVariance = totalBudget > 0 ? Math.round(((totalBudget - totalActualCost) / totalBudget) * 100) : 0;
    const schedulePerformanceIndex = avgCompletion > 0 ? (avgCompletion / 100) * 1.0 : 1.0;

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      onTrackProjects,
      atRiskProjects,
      criticalProjects,
      totalBudget,
      totalActualCost,
      avgCompletion,
      openRisks,
      highRisks,
      taskCompletionRate,
      projectSuccessRate,
      budgetVariance,
      schedulePerformanceIndex,
      portfolioCount: portfolios?.length || 0,
    };
  }, [projects, allRisks, allTasks, portfolios, allTasksData]);

  const healthDistribution = [
    { name: 'On Track', value: kpis.onTrackProjects, color: '#10b981' },
    { name: 'At Risk', value: kpis.atRiskProjects, color: '#f59e0b' },
    { name: 'Critical', value: kpis.criticalProjects, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const balancedScorecardData = [
    { subject: 'Financial', A: Math.min(100, kpis.budgetVariance + 50), fullMark: 100 },
    { subject: 'Customer', A: kpis.projectSuccessRate, fullMark: 100 },
    { subject: 'Process', A: kpis.taskCompletionRate, fullMark: 100 },
    { subject: 'Learning', A: Math.min(100, kpis.avgCompletion + 20), fullMark: 100 },
    { subject: 'Risk Mgmt', A: Math.max(0, 100 - (kpis.highRisks * 10)), fullMark: 100 },
  ];

  const maturityData = [
    { category: 'Scope', current: 75, target: 90 },
    { category: 'Schedule', current: 68, target: 85 },
    { category: 'Cost', current: 82, target: 90 },
    { category: 'Quality', current: 70, target: 85 },
    { category: 'Risk', current: 65, target: 80 },
    { category: 'Resource', current: 72, target: 85 },
  ];

  const getTrendIcon = (value: number, threshold: number = 0) => {
    if (value > threshold + 5) return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
    if (value < threshold - 5) return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-amber-500" />;
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Strategic KPIs Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            PMI PMBOK & Gartner aligned metrics for strategic decision-making
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Based on PMI PMBOK 7th Edition
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-project-success-rate">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Award className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Project Success Rate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpis.projectSuccessRate}%</span>
            {getTrendIcon(kpis.projectSuccessRate, 75)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">PMI Target: 75%+</p>
        </Card>

        <Card className="p-4" data-testid="kpi-schedule-performance">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Schedule Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpis.schedulePerformanceIndex.toFixed(2)}</span>
            {getTrendIcon(kpis.schedulePerformanceIndex * 100, 100)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">SPI Target: 1.0</p>
        </Card>

        <Card className="p-4" data-testid="kpi-budget-variance">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <DollarSign className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Budget Variance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${kpis.budgetVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {kpis.budgetVariance >= 0 ? '+' : ''}{kpis.budgetVariance}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Target: Within ±5%</p>
        </Card>

        <Card className="p-4" data-testid="kpi-task-completion">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <CheckCircle2 className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Task Completion</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpis.taskCompletionRate}%</span>
            {getTrendIcon(kpis.taskCompletionRate, 80)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Deliverables on target</p>
        </Card>

        <Card className="p-4" data-testid="kpi-risk-exposure">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Shield className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Risk Exposure</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpis.highRisks}</span>
            <Badge variant={kpis.highRisks > 3 ? 'destructive' : 'secondary'} className="text-[10px]">
              High Severity
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{kpis.openRisks} total open</p>
        </Card>

        <Card className="p-4" data-testid="kpi-portfolio-health">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Gauge className="h-4 w-4 text-indigo-500" />
            </div>
            <span className="text-xs text-muted-foreground">Portfolio Health</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{kpis.avgCompletion}%</span>
            {getTrendIcon(kpis.avgCompletion, 50)}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Avg. completion</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="card-balanced-scorecard">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Balanced Scorecard
            </CardTitle>
            <CardDescription className="text-xs">
              Gartner PPM Framework alignment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={balancedScorecardData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="Score" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="card-health-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Project Health Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              PRINCE2 Health Gate status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={healthDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {healthDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center p-2 rounded-md bg-emerald-500/10">
                <div className="text-lg font-semibold text-emerald-600">{kpis.onTrackProjects}</div>
                <div className="text-[10px] text-muted-foreground">On Track</div>
              </div>
              <div className="text-center p-2 rounded-md bg-amber-500/10">
                <div className="text-lg font-semibold text-amber-600">{kpis.atRiskProjects}</div>
                <div className="text-[10px] text-muted-foreground">At Risk</div>
              </div>
              <div className="text-center p-2 rounded-md bg-red-500/10">
                <div className="text-lg font-semibold text-red-600">{kpis.criticalProjects}</div>
                <div className="text-[10px] text-muted-foreground">Critical</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="card-maturity-assessment">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              PMO Maturity Assessment
            </CardTitle>
            <CardDescription className="text-xs">
              OPM3 Knowledge Area scores
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={maturityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} fontSize={10} />
                  <YAxis type="category" dataKey="category" width={60} fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="current" fill="#3b82f6" name="Current" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="target" fill="#e5e7eb" name="Target" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-strategic-objectives">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Strategic Objectives Alignment</CardTitle>
            <CardDescription className="text-xs">
              PMI Benefits Realization tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Revenue Growth', progress: 72, target: 85, status: 'On Track' },
                { name: 'Cost Optimization', progress: 68, target: 75, status: 'At Risk' },
                { name: 'Digital Transformation', progress: 55, target: 70, status: 'Behind' },
                { name: 'Customer Satisfaction', progress: 82, target: 90, status: 'On Track' },
                { name: 'Operational Excellence', progress: 78, target: 80, status: 'On Track' },
              ].map((obj, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{obj.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={obj.status === 'On Track' ? 'default' : obj.status === 'At Risk' ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {obj.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{obj.progress}% / {obj.target}%</span>
                    </div>
                  </div>
                  <div className="relative">
                    <Progress value={obj.progress} className="h-2" />
                    <div 
                      className="absolute top-0 h-2 w-0.5 bg-foreground/50" 
                      style={{ left: `${obj.target}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-governance-metrics">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Governance Metrics</CardTitle>
            <CardDescription className="text-xs">
              PRINCE2 Governance compliance indicators
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Gate Reviews Completed</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold">92%</div>
                  <Progress value={92} className="h-1 mt-2" />
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Stakeholder Satisfaction</span>
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-xl font-bold">4.2/5</div>
                  <Progress value={84} className="h-1 mt-2" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Change Request Efficiency</span>
                    <Calendar className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="text-xl font-bold">8.5 days</div>
                  <p className="text-[10px] text-muted-foreground">Avg. processing time</p>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Business Case Approval</span>
                    <Briefcase className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="text-xl font-bold">85%</div>
                  <p className="text-[10px] text-muted-foreground">First-pass approval rate</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
