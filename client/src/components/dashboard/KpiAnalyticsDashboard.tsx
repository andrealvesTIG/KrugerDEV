import { useOrganization } from "@/hooks/use-organization";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart,
} from "recharts";
import {
  CheckCircle2, ListTodo, FolderPlus, AlertTriangle, Clock, Users, Zap, Activity,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";

type CohortData = {
  label: string;
  tasksCreated: number;
  tasksCompleted: number;
  projectsCreated: number;
  issuesRaised: number;
  issuesResolved: number;
  hoursLogged: number;
  featureUsage: number;
  activeUsers: number;
  projectUpdates: number;
  taskUpdates: number;
};

type KpiTotals = {
  tasksCreated: number;
  tasksCompleted: number;
  projectsCreated: number;
  issuesRaised: number;
  issuesResolved: number;
  hoursLogged: number;
  featureUsage: number;
  totalMembers: number;
  totalActivities: number;
};

type KpiMetricsResponse = {
  cohorts: CohortData[];
  totals: KpiTotals;
};

function SummaryCard({ title, value, icon: Icon, subtitle, trend }: {
  title: string;
  value: string | number;
  icon: typeof CheckCircle2;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                {trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                {trend === "neutral" && <Minus className="h-3 w-3 text-muted-foreground" />}
                {subtitle}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent><Skeleton className="h-64 w-full" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

const CHART_COLORS = {
  tasksCreated: "#6366f1",
  tasksCompleted: "#10b981",
  projectsCreated: "#8b5cf6",
  issuesRaised: "#f59e0b",
  issuesResolved: "#06b6d4",
  hoursLogged: "#ec4899",
  featureUsage: "#f97316",
  activeUsers: "#3b82f6",
};

export function KpiAnalyticsDashboard() {
  const { currentOrganization } = useOrganization();

  const { data, isLoading, error } = useQuery<KpiMetricsResponse>({
    queryKey: ["/api/dashboard/kpi-metrics", currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/kpi-metrics?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error("Failed to fetch KPI metrics");
      return res.json();
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Unable to load KPI metrics</p>
        </CardContent>
      </Card>
    );
  }

  const { cohorts, totals } = data;

  const recentCohort = cohorts.length > 0 ? cohorts[cohorts.length - 1] : null;
  const prevCohort = cohorts.length > 1 ? cohorts[cohorts.length - 2] : null;

  function getTrend(current: number, previous: number | undefined): "up" | "down" | "neutral" {
    if (previous === undefined || previous === 0) return current > 0 ? "up" : "neutral";
    if (current > previous) return "up";
    if (current < previous) return "down";
    return "neutral";
  }

  const taskCompletionRate = totals.tasksCreated > 0
    ? Math.round((totals.tasksCompleted / totals.tasksCreated) * 100)
    : 0;

  const issueResolutionRate = totals.issuesRaised > 0
    ? Math.round((totals.issuesResolved / totals.issuesRaised) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">KPI Analytics</h2>
        <p className="text-muted-foreground">
          Track user activities and platform engagement across time cohorts
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          title="Tasks Created"
          value={totals.tasksCreated}
          icon={ListTodo}
          subtitle={recentCohort ? `${recentCohort.tasksCreated} this week` : undefined}
          trend={recentCohort && prevCohort ? getTrend(recentCohort.tasksCreated, prevCohort.tasksCreated) : undefined}
        />
        <SummaryCard
          title="Tasks Completed"
          value={totals.tasksCompleted}
          icon={CheckCircle2}
          subtitle={`${taskCompletionRate}% completion rate`}
          trend={taskCompletionRate >= 50 ? "up" : "down"}
        />
        <SummaryCard
          title="Projects Created"
          value={totals.projectsCreated}
          icon={FolderPlus}
          subtitle={recentCohort ? `${recentCohort.projectsCreated} this week` : undefined}
          trend={recentCohort && prevCohort ? getTrend(recentCohort.projectsCreated, prevCohort.projectsCreated) : undefined}
        />
        <SummaryCard
          title="Issues Raised"
          value={totals.issuesRaised}
          icon={AlertTriangle}
          subtitle={`${issueResolutionRate}% resolved`}
          trend={issueResolutionRate >= 50 ? "up" : "down"}
        />
        <SummaryCard
          title="Hours Logged"
          value={totals.hoursLogged.toLocaleString()}
          icon={Clock}
          subtitle={recentCohort ? `${Math.round(recentCohort.hoursLogged)} this week` : undefined}
          trend={recentCohort && prevCohort ? getTrend(recentCohort.hoursLogged, prevCohort.hoursLogged) : undefined}
        />
        <SummaryCard
          title="Team Members"
          value={totals.totalMembers}
          icon={Users}
          subtitle={recentCohort ? `${recentCohort.activeUsers} active this week` : undefined}
          trend={recentCohort ? getTrend(recentCohort.activeUsers, 0) : undefined}
        />
        <SummaryCard
          title="Feature Usage"
          value={totals.featureUsage.toLocaleString()}
          icon={Zap}
          subtitle={recentCohort ? `${recentCohort.featureUsage} this week` : undefined}
          trend={recentCohort && prevCohort ? getTrend(recentCohort.featureUsage, prevCohort.featureUsage) : undefined}
        />
        <SummaryCard
          title="Total Activities"
          value={totals.totalActivities.toLocaleString()}
          icon={Activity}
          subtitle="Project + task updates"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task Activity by Cohort</CardTitle>
            <CardDescription>Tasks created vs completed over time periods</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Bar dataKey="tasksCreated" name="Created" fill={CHART_COLORS.tasksCreated} radius={[4, 4, 0, 0]} />
                <Bar dataKey="tasksCompleted" name="Completed" fill={CHART_COLORS.tasksCompleted} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Issues & Resolution Trend</CardTitle>
            <CardDescription>Issues raised vs resolved across time periods</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Bar dataKey="issuesRaised" name="Raised" fill={CHART_COLORS.issuesRaised} radius={[4, 4, 0, 0]} />
                <Bar dataKey="issuesResolved" name="Resolved" fill={CHART_COLORS.issuesResolved} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Productivity</CardTitle>
            <CardDescription>Hours logged and active users over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="hours" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="users" orientation="right" className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Line yAxisId="hours" type="monotone" dataKey="hoursLogged" name="Hours Logged" stroke={CHART_COLORS.hoursLogged} strokeWidth={2} dot={{ r: 4 }} />
                <Line yAxisId="users" type="monotone" dataKey="activeUsers" name="Active Users" stroke={CHART_COLORS.activeUsers} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform Engagement</CardTitle>
            <CardDescription>Feature usage and platform activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                />
                <Legend />
                <Area type="monotone" dataKey="featureUsage" name="Feature Usage" stroke={CHART_COLORS.featureUsage} fill={CHART_COLORS.featureUsage} fillOpacity={0.2} />
                <Area type="monotone" dataKey="projectUpdates" name="Project Updates" stroke={CHART_COLORS.projectsCreated} fill={CHART_COLORS.projectsCreated} fillOpacity={0.2} />
                <Area type="monotone" dataKey="taskUpdates" name="Task Updates" stroke={CHART_COLORS.tasksCreated} fill={CHART_COLORS.tasksCreated} fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity Breakdown by Cohort</CardTitle>
          <CardDescription>Detailed metrics for each time period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Period</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Tasks Created</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Tasks Done</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Projects</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Issues</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Resolved</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Hours</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Active Users</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Features Used</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr key={cohort.label} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium">
                      <Badge variant="outline">{cohort.label}</Badge>
                    </td>
                    <td className="text-right py-3 px-2">{cohort.tasksCreated}</td>
                    <td className="text-right py-3 px-2">{cohort.tasksCompleted}</td>
                    <td className="text-right py-3 px-2">{cohort.projectsCreated}</td>
                    <td className="text-right py-3 px-2">{cohort.issuesRaised}</td>
                    <td className="text-right py-3 px-2">{cohort.issuesResolved}</td>
                    <td className="text-right py-3 px-2">{Math.round(cohort.hoursLogged)}</td>
                    <td className="text-right py-3 px-2">{cohort.activeUsers}</td>
                    <td className="text-right py-3 px-2">{cohort.featureUsage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
