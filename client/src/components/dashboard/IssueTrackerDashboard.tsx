import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ClipboardList, AlertCircle, CheckCircle2, Clock, TrendingUp, 
  BarChart3, Target, Calendar, Users, AlertTriangle
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from "recharts";
import { format, subMonths, eachMonthOfInterval, differenceInDays } from "date-fns";
import type { Issue } from "@shared/schema";

const STATUS_COLORS: Record<string, string> = {
  'Open': '#ef4444',
  'In Progress': '#f59e0b',
  'Resolved': '#10b981',
  'Closed': '#6b7280',
  'On Hold': '#8b5cf6',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Critical': '#dc2626',
  'High': '#f59e0b',
  'Medium': '#3b82f6',
  'Low': '#10b981',
};

export function IssueTrackerDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: projectsData } = useProjects(currentOrganization?.id);

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

  const issueMetrics = useMemo(() => {
    const total = allIssues.length;
    const open = allIssues.filter(i => i.status === 'Open').length;
    const inProgress = allIssues.filter(i => i.status === 'In Progress').length;
    const resolved = allIssues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
    const critical = allIssues.filter(i => 
      (i.status === 'Open' || i.status === 'In Progress') && 
      (i.priority === 'Critical' || i.priority === 'High')
    ).length;

    const avgResolutionTime = resolved > 0
      ? Math.round(allIssues
          .filter(i => i.status === 'Resolved' || i.status === 'Closed')
          .filter(i => i.createdAt && i.resolvedAt)
          .reduce((sum, i) => sum + differenceInDays(new Date(i.resolvedAt!), new Date(i.createdAt!)), 0) / resolved)
      : 0;

    const overdueIssues = allIssues.filter(i => {
      if (i.status === 'Resolved' || i.status === 'Closed') return false;
      if (!i.dueDate) return false;
      return new Date(i.dueDate) < new Date();
    }).length;

    return {
      total,
      open,
      inProgress,
      resolved,
      critical,
      avgResolutionTime,
      overdueIssues,
      resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
    };
  }, [allIssues]);

  const statusDistribution = useMemo(() => {
    const groups: Record<string, number> = {};
    allIssues.forEach(i => {
      const status = i.status || 'Open';
      groups[status] = (groups[status] || 0) + 1;
    });
    return Object.entries(groups).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || '#94a3b8',
    }));
  }, [allIssues]);

  const priorityDistribution = useMemo(() => {
    const openIssues = allIssues.filter(i => i.status === 'Open' || i.status === 'In Progress');
    const groups: Record<string, number> = {};
    openIssues.forEach(i => {
      const priority = i.priority || 'Medium';
      groups[priority] = (groups[priority] || 0) + 1;
    });
    
    const priorityOrder = ['Critical', 'High', 'Medium', 'Low'];
    return priorityOrder
      .filter(p => groups[p])
      .map(name => ({
        name,
        value: groups[name],
        color: PRIORITY_COLORS[name],
      }));
  }, [allIssues]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(now, 5),
      end: now,
    });

    return months.map(month => {
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const created = allIssues.filter(i => {
        if (!i.createdAt) return false;
        const date = new Date(i.createdAt);
        return date >= monthStart && date <= monthEnd;
      }).length;

      const resolved = allIssues.filter(i => {
        if (!i.resolvedAt) return false;
        const date = new Date(i.resolvedAt);
        return date >= monthStart && date <= monthEnd;
      }).length;

      return {
        month: format(month, 'MMM'),
        created,
        resolved,
        net: created - resolved,
      };
    });
  }, [allIssues]);

  const topIssueProjects = useMemo(() => {
    const projectIssues: Record<number, { name: string; count: number }> = {};
    
    allIssues.filter(i => i.status === 'Open' || i.status === 'In Progress').forEach(issue => {
      if (issue.projectId) {
        const project = projects.find(p => p.id === issue.projectId);
        if (project) {
          if (!projectIssues[issue.projectId]) {
            projectIssues[issue.projectId] = { name: project.name, count: 0 };
          }
          projectIssues[issue.projectId].count++;
        }
      }
    });

    return Object.values(projectIssues)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(p => ({
        name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
        issues: p.count,
      }));
  }, [allIssues, projects]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Issue Tracker Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            Comprehensive issue management and resolution tracking
          </p>
        </div>
        <Badge variant={issueMetrics.critical > 5 ? 'destructive' : 'outline'} className="text-xs">
          {issueMetrics.open} Open Issues
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-total-issues">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <ClipboardList className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Issues</span>
          </div>
          <div className="text-2xl font-bold">{issueMetrics.total}</div>
          <p className="text-[10px] text-muted-foreground mt-1">All time</p>
        </Card>

        <Card className="p-4" data-testid="kpi-open-issues">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">Open</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{issueMetrics.open}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Needs attention</p>
        </Card>

        <Card className="p-4" data-testid="kpi-in-progress">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">In Progress</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{issueMetrics.inProgress}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Being worked</p>
        </Card>

        <Card className="p-4" data-testid="kpi-resolved">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Resolved</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{issueMetrics.resolved}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{issueMetrics.resolutionRate}% rate</p>
        </Card>

        <Card className="p-4" data-testid="kpi-critical">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <AlertTriangle className="h-4 w-4 text-pink-500" />
            </div>
            <span className="text-xs text-muted-foreground">Critical/High</span>
          </div>
          <div className="text-2xl font-bold text-pink-600">{issueMetrics.critical}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Priority issues</p>
        </Card>

        <Card className="p-4" data-testid="kpi-avg-resolution">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Calendar className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Resolution</span>
          </div>
          <div className="text-2xl font-bold">{issueMetrics.avgResolutionTime}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Days to resolve</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-testid="chart-status-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Status Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Issues by current status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, i) => (
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

        <Card className="lg:col-span-1" data-testid="chart-priority-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Open by Priority
            </CardTitle>
            <CardDescription className="text-xs">
              Active issues by priority level
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Bar dataKey="value" name="Issues" radius={[4, 4, 0, 0]}>
                    {priorityDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-testid="chart-project-issues">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Top Projects by Issues
            </CardTitle>
            <CardDescription className="text-xs">
              Projects with most open issues
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topIssueProjects} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={100} fontSize={9} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Bar dataKey="issues" fill="#ef4444" name="Issues" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="chart-monthly-trend">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Monthly Issue Trend
          </CardTitle>
          <CardDescription className="text-xs">
            Created vs resolved issues over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Area type="monotone" dataKey="created" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Created" />
                <Area type="monotone" dataKey="resolved" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Resolved" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
