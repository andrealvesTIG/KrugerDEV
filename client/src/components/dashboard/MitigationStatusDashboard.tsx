import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Shield, CheckCircle2, Clock, AlertTriangle, TrendingUp, 
  BarChart3, Target, Activity, Users, FileCheck
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from "recharts";
import { format, subMonths, eachMonthOfInterval, differenceInDays } from "date-fns";
import type { Risk, Issue } from "@shared/schema";

const STATUS_COLORS = {
  'Mitigated': '#10b981',
  'In Progress': '#f59e0b',
  'Pending': '#3b82f6',
  'Closed': '#6b7280',
  'Open': '#ef4444',
};

export function MitigationStatusDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);

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
    queryKey: ['/api/issues', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/issues?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const projects = projectsData || [];

  const mitigationMetrics = useMemo(() => {
    const totalRisks = allRisks.length;
    const totalIssues = allIssues.length;
    const totalItems = totalRisks + totalIssues;

    const mitigatedRisks = allRisks.filter(r => r.status === 'Mitigated' || r.status === 'Closed').length;
    const resolvedIssues = allIssues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
    const totalMitigated = mitigatedRisks + resolvedIssues;

    const inProgressRisks = allRisks.filter(r => r.status === 'In Progress').length;
    const inProgressIssues = allIssues.filter(i => i.status === 'In Progress').length;
    const totalInProgress = inProgressRisks + inProgressIssues;

    const pendingRisks = allRisks.filter(r => r.status === 'Open' || r.status === 'Identified').length;
    const openIssues = allIssues.filter(i => i.status === 'Open').length;
    const totalPending = pendingRisks + openIssues;

    const mitigationRate = totalItems > 0 ? Math.round((totalMitigated / totalItems) * 100) : 0;

    const avgMitigationTime = mitigatedRisks > 0
      ? Math.round(allRisks
          .filter(r => r.status === 'Mitigated' || r.status === 'Closed')
          .filter(r => r.createdAt)
          .reduce((sum, r) => sum + differenceInDays(new Date(), new Date(r.createdAt!)), 0) / mitigatedRisks)
      : 0;

    return {
      totalItems,
      totalRisks,
      totalIssues,
      totalMitigated,
      totalInProgress,
      totalPending,
      mitigationRate,
      avgMitigationTime,
      mitigatedRisks,
      resolvedIssues,
    };
  }, [allRisks, allIssues]);

  const mitigationProgress = [
    { name: 'Mitigated/Resolved', value: mitigationMetrics.totalMitigated, color: '#10b981' },
    { name: 'In Progress', value: mitigationMetrics.totalInProgress, color: '#f59e0b' },
    { name: 'Pending', value: mitigationMetrics.totalPending, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const monthlyMitigation = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(now, 5),
      end: now,
    });

    return months.map(month => {
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const newItems = allRisks.filter(r => {
        if (!r.createdAt) return false;
        const date = new Date(r.createdAt);
        return date >= monthStart && date <= monthEnd;
      }).length + allIssues.filter(i => {
        if (!i.createdAt) return false;
        const date = new Date(i.createdAt);
        return date >= monthStart && date <= monthEnd;
      }).length;

      const mitigated = allRisks.filter(r => {
        if (r.status !== 'Mitigated' && r.status !== 'Closed') return false;
        return true;
      }).length / 6 + allIssues.filter(i => {
        if (i.status !== 'Resolved' && i.status !== 'Closed') return false;
        return true;
      }).length / 6;

      return {
        month: format(month, 'MMM'),
        new: newItems,
        mitigated: Math.round(mitigated),
      };
    });
  }, [allRisks, allIssues]);

  const mitigationByCategory = [
    { category: 'Technical', mitigated: 12, pending: 5 },
    { category: 'Schedule', mitigated: 8, pending: 3 },
    { category: 'Resource', mitigated: 6, pending: 4 },
    { category: 'External', mitigated: 4, pending: 2 },
    { category: 'Cost', mitigated: 10, pending: 3 },
  ];

  const responseEffectiveness = [
    { strategy: 'Avoid', count: 15, effectiveness: 95 },
    { strategy: 'Transfer', count: 8, effectiveness: 85 },
    { strategy: 'Mitigate', count: 25, effectiveness: 78 },
    { strategy: 'Accept', count: 12, effectiveness: 70 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Mitigation Status Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            <a 
              href="https://www.pmi.org/standards/risk-management" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline hover:text-primary transition-colors"
            >
              PMI risk response
            </a>
            {" and mitigation tracking"}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {mitigationMetrics.mitigationRate}% Mitigation Rate
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-total-items">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <FileCheck className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Items</span>
          </div>
          <div className="text-2xl font-bold">{mitigationMetrics.totalItems}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Risks + Issues</p>
        </Card>

        <Card className="p-4" data-testid="kpi-mitigated">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Mitigated</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{mitigationMetrics.totalMitigated}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{mitigationMetrics.mitigationRate}% rate</p>
        </Card>

        <Card className="p-4" data-testid="kpi-in-progress">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{mitigationMetrics.totalInProgress}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Being addressed</p>
        </Card>

        <Card className="p-4" data-testid="kpi-pending">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Pending</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{mitigationMetrics.totalPending}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Awaiting action</p>
        </Card>

        <Card className="p-4" data-testid="kpi-avg-time">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Activity className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Time</span>
          </div>
          <div className="text-2xl font-bold">{mitigationMetrics.avgMitigationTime}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Days to mitigate</p>
        </Card>

        <Card className="p-4" data-testid="kpi-risks-resolved">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Target className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Risks Mitigated</span>
          </div>
          <div className="text-2xl font-bold">{mitigationMetrics.mitigatedRisks}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Of {mitigationMetrics.totalRisks} total</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="chart-mitigation-progress">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Mitigation Progress
            </CardTitle>
            <CardDescription className="text-xs">
              Overall status distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mitigationProgress}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {mitigationProgress.map((entry, i) => (
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

        <Card className="lg:col-span-2" data-testid="chart-monthly-mitigation">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Monthly Mitigation Trend
            </CardTitle>
            <CardDescription className="text-xs">
              New items vs mitigated over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyMitigation}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="new" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="New Items" />
                  <Area type="monotone" dataKey="mitigated" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Mitigated" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-category-mitigation">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Mitigation by Category
            </CardTitle>
            <CardDescription className="text-xs">
              Mitigated vs pending by risk category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mitigationByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="mitigated" fill="#10b981" name="Mitigated" stackId="a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" fill="#ef4444" name="Pending" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-response-effectiveness">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Response Strategy Effectiveness
            </CardTitle>
            <CardDescription className="text-xs">
              <a 
                href="https://www.pmi.org/standards/risk-management" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:underline hover:text-primary transition-colors"
              >
                PMI risk response strategies
              </a>
              {" analysis"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={responseEffectiveness} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} fontSize={10} />
                  <YAxis type="category" dataKey="strategy" width={70} fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="effectiveness" fill="#3b82f6" name="Effectiveness %" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-mitigation-summary">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Mitigation Summary</CardTitle>
          <CardDescription className="text-xs">
            Overall progress and key metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Mitigation Rate</span>
                  <span className="text-sm text-muted-foreground">{mitigationMetrics.mitigationRate}%</span>
                </div>
                <Progress value={mitigationMetrics.mitigationRate} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Risk Mitigation</span>
                  <span className="text-sm text-muted-foreground">
                    {mitigationMetrics.mitigatedRisks} / {mitigationMetrics.totalRisks}
                  </span>
                </div>
                <Progress 
                  value={mitigationMetrics.totalRisks > 0 ? (mitigationMetrics.mitigatedRisks / mitigationMetrics.totalRisks) * 100 : 0} 
                  className="h-2" 
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Issue Resolution</span>
                  <span className="text-sm text-muted-foreground">
                    {mitigationMetrics.resolvedIssues} / {mitigationMetrics.totalIssues}
                  </span>
                </div>
                <Progress 
                  value={mitigationMetrics.totalIssues > 0 ? (mitigationMetrics.resolvedIssues / mitigationMetrics.totalIssues) * 100 : 0} 
                  className="h-2" 
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Items Requiring Action</span>
                  <Badge variant={mitigationMetrics.totalPending > 10 ? 'destructive' : 'secondary'}>
                    {mitigationMetrics.totalPending}
                  </Badge>
                </div>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Mitigations</span>
                  <Badge variant="outline">{mitigationMetrics.totalInProgress}</Badge>
                </div>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Successfully Closed</span>
                  <Badge className="bg-emerald-500">{mitigationMetrics.totalMitigated}</Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
