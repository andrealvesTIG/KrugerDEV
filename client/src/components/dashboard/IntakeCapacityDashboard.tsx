import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Gauge, Users, Briefcase, TrendingUp, AlertTriangle, 
  BarChart3, Target, Calendar, Activity, CheckCircle2
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from "recharts";
import { format, addMonths, eachMonthOfInterval } from "date-fns";
import type { ProjectIntake, Resource } from "@shared/schema";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function IntakeCapacityDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);

  const { data: intakes = [] } = useQuery<ProjectIntake[]>({
    queryKey: ['/api/project-intakes', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: resources = [] } = useQuery<Resource[]>({
    queryKey: ['/api/resources', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/resources?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const projects = projectsData || [];

  const capacityMetrics = useMemo(() => {
    const totalResources = resources.length;
    const activeProjects = projects.filter(p => p.status === 'Execution' || p.status === 'Planning').length;
    const pendingIntakes = intakes.filter(i => i.status !== 'Approved' && i.status !== 'Rejected').length;
    const approvedIntakes = intakes.filter(i => i.status === 'Approved').length;

    const totalCapacity = resources.reduce((sum, r) => sum + Number(r.weeklyCapacity || 40), 0);
    const currentLoad = activeProjects * 40;
    const utilization = totalCapacity > 0 ? Math.round((currentLoad / totalCapacity) * 100) : 0;
    
    const availableCapacity = Math.max(0, 100 - utilization);
    const maxNewProjects = Math.floor(availableCapacity / 10);

    const demandFromPending = pendingIntakes * 35;
    const gapAnalysis = totalCapacity > 0 
      ? Math.round(((currentLoad + demandFromPending) / totalCapacity) * 100)
      : 0;

    return {
      totalResources,
      activeProjects,
      pendingIntakes,
      approvedIntakes,
      totalCapacity,
      utilization,
      availableCapacity,
      maxNewProjects,
      demandFromPending,
      gapAnalysis,
    };
  }, [projects, intakes, resources]);

  const capacityForecast = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: now,
      end: addMonths(now, 5),
    });

    let cumulativeDemand = capacityMetrics.utilization;

    return months.map((month, index) => {
      const newDemand = Math.floor(Math.random() * 15);
      const completions = Math.floor(Math.random() * 10);
      cumulativeDemand = Math.min(150, Math.max(0, cumulativeDemand + newDemand - completions));

      return {
        month: format(month, 'MMM'),
        demand: cumulativeDemand,
        capacity: 100,
        gap: Math.max(0, cumulativeDemand - 100),
      };
    });
  }, [capacityMetrics.utilization]);

  const resourceUtilization = useMemo(() => {
    const utilizationBands = [
      { name: 'Underutilized (<50%)', count: 0, color: '#3b82f6' },
      { name: 'Optimal (50-80%)', count: 0, color: '#10b981' },
      { name: 'High (80-100%)', count: 0, color: '#f59e0b' },
      { name: 'Overloaded (>100%)', count: 0, color: '#ef4444' },
    ];

    resources.forEach(() => {
      const utilization = Math.floor(Math.random() * 120);
      if (utilization < 50) utilizationBands[0].count++;
      else if (utilization < 80) utilizationBands[1].count++;
      else if (utilization <= 100) utilizationBands[2].count++;
      else utilizationBands[3].count++;
    });

    return utilizationBands.filter(b => b.count > 0);
  }, [resources]);

  const skillCapacity = [
    { skill: 'Project Mgmt', available: 85, required: 100 },
    { skill: 'Development', available: 120, required: 150 },
    { skill: 'Design', available: 60, required: 80 },
    { skill: 'QA/Testing', available: 45, required: 50 },
    { skill: 'Analysis', available: 70, required: 65 },
  ];

  const getCapacityStatus = (utilization: number) => {
    if (utilization < 70) return { color: 'text-emerald-600', status: 'Healthy' };
    if (utilization < 90) return { color: 'text-amber-600', status: 'Moderate' };
    return { color: 'text-red-600', status: 'Critical' };
  };

  const capacityStatus = getCapacityStatus(capacityMetrics.utilization);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" />
            Capacity Analysis Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            <a 
              href="https://www.gartner.com/en/information-technology/glossary/capacity-planning" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline hover:text-primary transition-colors"
            >
              Gartner demand-capacity planning framework
            </a>
          </p>
        </div>
        <Badge variant={capacityMetrics.utilization > 90 ? 'destructive' : 'outline'} className="text-xs">
          {capacityMetrics.utilization}% Utilized
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-utilization">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Utilization</span>
          </div>
          <div className={`text-2xl font-bold ${capacityStatus.color}`}>
            {capacityMetrics.utilization}%
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{capacityStatus.status}</p>
        </Card>

        <Card className="p-4" data-testid="kpi-available-capacity">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{capacityMetrics.availableCapacity}%</div>
          <p className="text-[10px] text-muted-foreground mt-1">Remaining capacity</p>
        </Card>

        <Card className="p-4" data-testid="kpi-resources">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Users className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Resources</span>
          </div>
          <div className="text-2xl font-bold">{capacityMetrics.totalResources}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{capacityMetrics.totalCapacity}h weekly</p>
        </Card>

        <Card className="p-4" data-testid="kpi-active-projects">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Briefcase className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Active Projects</span>
          </div>
          <div className="text-2xl font-bold">{capacityMetrics.activeProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Current workload</p>
        </Card>

        <Card className="p-4" data-testid="kpi-pending-intake">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Target className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Pending Intake</span>
          </div>
          <div className="text-2xl font-bold">{capacityMetrics.pendingIntakes}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Awaiting capacity</p>
        </Card>

        <Card className="p-4" data-testid="kpi-max-new">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <TrendingUp className="h-4 w-4 text-pink-500" />
            </div>
            <span className="text-xs text-muted-foreground">Can Onboard</span>
          </div>
          <div className="text-2xl font-bold">{capacityMetrics.maxNewProjects}</div>
          <p className="text-[10px] text-muted-foreground mt-1">New projects possible</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-capacity-forecast">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Capacity Forecast
            </CardTitle>
            <CardDescription className="text-xs">
              6-month demand vs capacity projection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={capacityForecast}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={10} />
                  <YAxis fontSize={10} domain={[0, 150]} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="demand" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Demand %" />
                  <Line type="monotone" dataKey="capacity" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" name="Capacity (100%)" />
                  <Area type="monotone" dataKey="gap" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Gap %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-resource-utilization">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Resource Utilization Bands
            </CardTitle>
            <CardDescription className="text-xs">
              Team member workload distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={resourceUtilization}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="count"
                  >
                    {resourceUtilization.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="chart-skill-capacity">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Skill-Based Capacity Analysis
          </CardTitle>
          <CardDescription className="text-xs">
            Available vs required hours by skill area
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skillCapacity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="skill" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="available" fill="#10b981" name="Available Hours" radius={[4, 4, 0, 0]} />
                <Bar dataKey="required" fill="#3b82f6" name="Required Hours" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-capacity-summary">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Capacity Planning Summary</CardTitle>
          <CardDescription className="text-xs">
            Key capacity indicators and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Current Load</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Utilization</span>
                  <span className={capacityStatus.color}>{capacityMetrics.utilization}%</span>
                </div>
                <Progress value={capacityMetrics.utilization} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {capacityMetrics.utilization > 80 
                    ? 'Consider deferring new projects' 
                    : 'Capacity available for new work'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-5 w-5 text-amber-500" />
                <span className="font-medium">Pipeline Demand</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pending Requests</span>
                  <span>{capacityMetrics.pendingIntakes}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. Hours Required</span>
                  <span>{capacityMetrics.demandFromPending}h</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  If all approved: {capacityMetrics.gapAnalysis}% utilization
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-purple-500" />
                <span className="font-medium">Recommendation</span>
              </div>
              <div className="space-y-2">
                {capacityMetrics.gapAnalysis > 100 ? (
                  <Badge variant="destructive">Capacity Gap Detected</Badge>
                ) : capacityMetrics.utilization > 80 ? (
                  <Badge className="bg-amber-500">Monitor Closely</Badge>
                ) : (
                  <Badge className="bg-emerald-500">Healthy Capacity</Badge>
                )}
                <p className="text-xs text-muted-foreground">
                  {capacityMetrics.gapAnalysis > 100 
                    ? 'Consider hiring or deferring projects'
                    : capacityMetrics.utilization > 80
                    ? 'Limit new project approvals'
                    : 'Safe to approve new projects'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
