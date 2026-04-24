import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Workflow, ArrowRight, CheckCircle2, Clock,
  FileInput, Target, TrendingUp, Users, Calendar, BarChart3
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Funnel, FunnelChart, LabelList
} from "recharts";
import { format, subMonths, eachMonthOfInterval, differenceInDays } from "date-fns";
import type { ProjectIntake } from "@shared/schema";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const STATUS_COLORS: Record<string, string> = {
  'New': '#3b82f6',
  'Under Review': '#8b5cf6',
  'Approved': '#10b981',
  'Rejected': '#ef4444',
  'On Hold': '#f59e0b',
  'Pending': '#64748b',
};

export function IntakePipelineDashboard() {
  const { currentOrganization } = useOrganization();

  const { data: intakes = [] } = useQuery<ProjectIntake[]>({
    queryKey: ['/api/project-intakes', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const pipelineMetrics = useMemo(() => {
    const total = intakes.length;
    const newCount = intakes.filter(i => i.status === 'New' || i.status === 'Submitted').length;
    const inReview = intakes.filter(i => i.status === 'Under Review' || i.status === 'In Progress').length;
    const approved = intakes.filter(i => i.status === 'Approved').length;
    const rejected = intakes.filter(i => i.status === 'Rejected').length;
    const onHold = intakes.filter(i => i.status === 'On Hold').length;

    const cycleTimeSamples = intakes
      .map(i => {
        if (!i.createdAt) return null;
        const start = new Date(i.createdAt);
        const end = i.approvedAt ? new Date(i.approvedAt) : new Date();
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
        return differenceInDays(end, start);
      })
      .filter((d): d is number => d !== null);
    const avgCycleTime = cycleTimeSamples.length > 0
      ? Math.round(cycleTimeSamples.reduce((sum, d) => sum + d, 0) / cycleTimeSamples.length)
      : 0;

    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    const throughput = approved + rejected;

    return {
      total,
      newCount,
      inReview,
      approved,
      rejected,
      onHold,
      avgCycleTime,
      approvalRate,
      throughput,
    };
  }, [intakes]);

  const pipelineStages = [
    { name: 'Submitted', value: pipelineMetrics.newCount, fill: '#3b82f6' },
    { name: 'In Review', value: pipelineMetrics.inReview, fill: '#8b5cf6' },
    { name: 'Approved', value: pipelineMetrics.approved, fill: '#10b981' },
  ].filter(s => s.value > 0);

  const statusDistribution = useMemo(() => {
    const statusGroups: Record<string, number> = {};
    intakes.forEach(i => {
      const status = i.status || 'Unknown';
      statusGroups[status] = (statusGroups[status] || 0) + 1;
    });
    return Object.entries(statusGroups).map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || '#94a3b8',
    }));
  }, [intakes]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(now, 5),
      end: now,
    });

    return months.map(month => {
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const submitted = intakes.filter(i => {
        if (!i.createdAt) return false;
        const date = new Date(i.createdAt);
        if (isNaN(date.getTime())) return false;
        return date >= monthStart && date <= monthEnd;
      }).length;

      const approved = intakes.filter(i => {
        if (!i.approvedAt) return false;
        const date = new Date(i.approvedAt);
        return date >= monthStart && date <= monthEnd;
      }).length;

      return {
        month: format(month, 'MMM'),
        submitted,
        approved,
      };
    });
  }, [intakes]);

  // Note: intake_records has no priority column today, so we skip the priority
  // chart. If a priority field is added later, restore the priorityDistribution
  // memo and the corresponding card below.

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            Request Pipeline Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">
            Intake request flow and pipeline analytics
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {pipelineMetrics.total} Total Requests
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4" data-testid="kpi-total-requests">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <FileInput className="h-4 w-4 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Requests</span>
          </div>
          <div className="text-2xl font-bold">{pipelineMetrics.total}</div>
          <p className="text-[10px] text-muted-foreground mt-1">In pipeline</p>
        </Card>

        <Card className="p-4" data-testid="kpi-new-requests">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Clock className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Awaiting Review</span>
          </div>
          <div className="text-2xl font-bold">{pipelineMetrics.newCount}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Newly submitted</p>
        </Card>

        <Card className="p-4" data-testid="kpi-in-review">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Users className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">In Review</span>
          </div>
          <div className="text-2xl font-bold">{pipelineMetrics.inReview}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Being evaluated</p>
        </Card>

        <Card className="p-4" data-testid="kpi-approved">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Approved</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{pipelineMetrics.approved}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{pipelineMetrics.approvalRate}% rate</p>
        </Card>

        <Card className="p-4" data-testid="kpi-cycle-time">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Calendar className="h-4 w-4 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Cycle Time</span>
          </div>
          <div className="text-2xl font-bold">{pipelineMetrics.avgCycleTime}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Days to decision</p>
        </Card>

        <Card className="p-4" data-testid="kpi-throughput">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <TrendingUp className="h-4 w-4 text-pink-500" />
            </div>
            <span className="text-xs text-muted-foreground">Throughput</span>
          </div>
          <div className="text-2xl font-bold">{pipelineMetrics.throughput}</div>
          <p className="text-[10px] text-muted-foreground mt-1">Decisions made</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-pipeline-funnel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              Pipeline Funnel
            </CardTitle>
            <CardDescription className="text-xs">
              Request flow through stages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineStages} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="name" width={80} fontSize={10} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {pipelineStages.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-status-distribution">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Status Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Current request status breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
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
      </div>

      <Card data-testid="chart-monthly-trend">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Monthly Intake Trend
          </CardTitle>
          <CardDescription className="text-xs">
            Submissions vs approvals over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Area type="monotone" dataKey="submitted" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Submitted" />
                <Area type="monotone" dataKey="approved" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Approved" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
