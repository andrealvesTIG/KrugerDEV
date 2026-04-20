import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useExcludedEmailDomains } from "@/hooks/use-excluded-email-domains";
import { EmailDomainExclusionControl } from "@/components/dashboard/EmailDomainExclusionControl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, ScatterChart, Scatter,
} from "recharts";
import {
  CheckCircle2, ListTodo, FolderPlus, AlertTriangle, Clock, Users, Zap, Activity,
  TrendingUp, TrendingDown, Minus, UserPlus, Building2,
} from "lucide-react";

type CohortData = {
  label: string;
  newSignups: number;
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
  newSignups: number;
  tasksCreated: number;
  tasksCompleted: number;
  projectsCreated: number;
  issuesRaised: number;
  issuesResolved: number;
  hoursLogged: number;
  featureUsage: number;
  totalUsers: number;
  totalActivities: number;
};

type FeatureUsageData = {
  feature: string;
  totalRequests: number;
  reads: number;
  writes: number;
  uniqueUsers: number;
  avgDurationMs: number;
};

type ErrorHotspot = {
  feature: string;
  errorCount: number;
  affectedUsers: number;
  errorRate: number;
  mostCommonStatus: number;
};

type FrictionTrend = {
  week: string;
  errors: number;
  total: number;
  errorRate: number;
  activeUsers: number;
};

type UserActivityData = {
  totalUsers: number;
  activeUsers7d: number;
  avgActionsPerUser: number;
  overallRetention: number;
  newSignupsThisWeek: number;
  dauMauRatio: number;
  retentionWoW: number;
  dailyActiveUsers: { date: string; label: string; count: number }[];
  retentionByLifecycle: { label: string; retentionPct: number; avgActions: number; cohortSize: number }[];
  weeklyRetention: { week: string; retentionPct: number; activeUsers: number }[];
  topActions: { action: string; count: number; uniqueUsers: number }[];
  orgBreakdown: { orgId: number; orgName: string; memberCount: number; activeCount: number }[];
};

type AdminKpiMetricsResponse = {
  cohorts: CohortData[];
  totals: KpiTotals;
  topFeatures: FeatureUsageData[];
  errorHotspots: ErrorHotspot[];
  frictionTrend: FrictionTrend[];
  userActivity: UserActivityData;
};

type SubTab = "overview" | "cohorts" | "retention" | "engagement" | "organizations";

const BORDER_COLORS = {
  green: "border-l-4 border-l-green-400",
  purple: "border-l-4 border-l-purple-400",
  red: "border-l-4 border-l-red-400",
  blue: "border-l-4 border-l-blue-400",
  amber: "border-l-4 border-l-amber-400",
};

function KpiCard({ title, value, subtitle, icon: Icon, borderColor }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Users;
  borderColor: string;
}) {
  return (
    <Card className={borderColor}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center">
            <Icon className="h-4.5 w-4.5 text-muted-foreground" />
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
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-l-4 border-l-muted">
            <CardContent className="pt-5 pb-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
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
  primary: "#6366f1",
  green: "#10b981",
  blue: "#3b82f6",
  amber: "#f59e0b",
  pink: "#ec4899",
  purple: "#8b5cf6",
  teal: "#14b8a6",
  orange: "#f97316",
  red: "#ef4444",
};

function OverviewTab({ ua, cohorts }: { ua: UserActivityData; cohorts: CohortData[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Total Users"
          value={ua.totalUsers.toLocaleString()}
          subtitle={`${ua.newSignupsThisWeek} new this week`}
          icon={Users}
          borderColor={BORDER_COLORS.green}
        />
        <KpiCard
          title="Active Users (7d)"
          value={ua.activeUsers7d.toLocaleString()}
          subtitle={`${ua.dauMauRatio}% WAU/MAU ratio`}
          icon={Users}
          borderColor={BORDER_COLORS.green}
        />
        <KpiCard
          title="Avg Actions/User"
          value={ua.avgActionsPerUser.toLocaleString()}
          subtitle="Across all active users"
          icon={Zap}
          borderColor={BORDER_COLORS.purple}
        />
        <KpiCard
          title="Overall Retention"
          value={`${ua.overallRetention}%`}
          subtitle={`${ua.retentionWoW >= 0 ? '+' : ''}${ua.retentionWoW}% WoW growth`}
          icon={TrendingUp}
          borderColor={BORDER_COLORS.red}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Daily Active Users</CardTitle>
            <CardDescription>Unique active users over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart data={ua.dailyActiveUsers}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  className="text-xs"
                  tick={{ fontSize: 11 }}
                  interval={Math.floor(ua.dailyActiveUsers.length / 5)}
                />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  labelFormatter={(_, payload) => {
                    if (payload && payload.length > 0) return payload[0]?.payload?.label || '';
                    return '';
                  }}
                />
                <Scatter dataKey="count" name="Active Users" fill={CHART_COLORS.blue} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Retention by Lifecycle Period</CardTitle>
            <CardDescription>User retention rate at each stage since activation</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={ua.retentionByLifecycle}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="retention" className="text-xs" tick={{ fontSize: 11 }} label={{ value: 'Retention %', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                <YAxis yAxisId="actions" orientation="right" className="text-xs" tick={{ fontSize: 11 }} label={{ value: 'Avg Actions', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar yAxisId="actions" dataKey="avgActions" name="Avg Actions" fill={CHART_COLORS.purple} radius={[4, 4, 0, 0]} />
                <Line yAxisId="retention" type="monotone" dataKey="retentionPct" name="Retention %" stroke={CHART_COLORS.green} strokeWidth={2} dot={{ r: 5, fill: CHART_COLORS.green, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Weekly Retention Trend</CardTitle>
            <CardDescription>Overall retention rate trend over recent weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={ua.weeklyRetention}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Area type="monotone" dataKey="retentionPct" name="Retention %" stroke={CHART_COLORS.teal} fill={CHART_COLORS.teal} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Top User Actions</CardTitle>
            <CardDescription>Most common actions performed by users</CardDescription>
          </CardHeader>
          <CardContent>
            {ua.topActions.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ua.topActions} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="action" type="category" width={110} className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="count" name="Actions" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No action data available yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CohortsTab({ cohorts }: { cohorts: CohortData[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Signups & Active Users</CardTitle>
            <CardDescription>New registrations and active users by cohort period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar dataKey="newSignups" name="New Signups" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} />
                <Bar dataKey="activeUsers" name="Active Users" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Task Activity</CardTitle>
            <CardDescription>Tasks created vs completed across cohorts</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar dataKey="tasksCreated" name="Created" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="tasksCompleted" name="Completed" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Activity Breakdown by Cohort</CardTitle>
          <CardDescription>Detailed metrics for each time period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Period</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Signups</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Tasks Created</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Tasks Done</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Projects</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Issues</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Hours</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Active Users</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.label} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium"><Badge variant="outline">{c.label}</Badge></td>
                    <td className="text-right py-3 px-2">{c.newSignups}</td>
                    <td className="text-right py-3 px-2">{c.tasksCreated}</td>
                    <td className="text-right py-3 px-2">{c.tasksCompleted}</td>
                    <td className="text-right py-3 px-2">{c.projectsCreated}</td>
                    <td className="text-right py-3 px-2">{c.issuesRaised}</td>
                    <td className="text-right py-3 px-2">{Math.round(c.hoursLogged)}</td>
                    <td className="text-right py-3 px-2">{c.activeUsers}</td>
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

function RetentionTab({ ua }: { ua: UserActivityData }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard
          title="Overall Retention"
          value={`${ua.overallRetention}%`}
          subtitle="All-time retention rate"
          icon={TrendingUp}
          borderColor={BORDER_COLORS.green}
        />
        <KpiCard
          title="Active Users (7d)"
          value={ua.activeUsers7d.toLocaleString()}
          subtitle={`${ua.retentionWoW >= 0 ? '+' : ''}${ua.retentionWoW}% WoW`}
          icon={Users}
          borderColor={BORDER_COLORS.blue}
        />
        <KpiCard
          title="Total Users"
          value={ua.totalUsers.toLocaleString()}
          subtitle={`${ua.newSignupsThisWeek} new this week`}
          icon={UserPlus}
          borderColor={BORDER_COLORS.purple}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Retention by Lifecycle</CardTitle>
            <CardDescription>Retention % and avg actions at each lifecycle stage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={ua.retentionByLifecycle}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="pct" className="text-xs" tick={{ fontSize: 11 }} unit="%" />
                <YAxis yAxisId="actions" orientation="right" className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar yAxisId="actions" dataKey="avgActions" name="Avg Actions" fill={CHART_COLORS.purple} radius={[4, 4, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="retentionPct" name="Retention %" stroke={CHART_COLORS.green} strokeWidth={2} dot={{ r: 5, fill: CHART_COLORS.green, stroke: '#fff', strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Weekly Retention Trend</CardTitle>
            <CardDescription>Retention rate over recent weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={ua.weeklyRetention}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Area type="monotone" dataKey="retentionPct" name="Retention %" stroke={CHART_COLORS.teal} fill={CHART_COLORS.teal} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Lifecycle Stage Breakdown</CardTitle>
          <CardDescription>Cohort sizes and retention at each stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Stage</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Cohort Size</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Retention %</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Avg Actions</th>
                </tr>
              </thead>
              <tbody>
                {ua.retentionByLifecycle.map((r) => (
                  <tr key={r.label} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-2 font-medium"><Badge variant="outline">{r.label}</Badge></td>
                    <td className="text-right py-3 px-2">{r.cohortSize}</td>
                    <td className="text-right py-3 px-2">
                      <span className={r.retentionPct > 50 ? "text-green-600 font-semibold" : r.retentionPct > 20 ? "text-amber-600" : "text-red-500"}>
                        {r.retentionPct}%
                      </span>
                    </td>
                    <td className="text-right py-3 px-2">{r.avgActions}</td>
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

function EngagementTab({ topFeatures, errorHotspots, frictionTrend, cohorts }: {
  topFeatures: FeatureUsageData[];
  errorHotspots: ErrorHotspot[];
  frictionTrend: FrictionTrend[];
  cohorts: CohortData[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Platform Engagement</CardTitle>
            <CardDescription>Feature usage and platform activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Area type="monotone" dataKey="featureUsage" name="Feature Usage" stroke={CHART_COLORS.orange} fill={CHART_COLORS.orange} fillOpacity={0.2} />
                <Area type="monotone" dataKey="projectUpdates" name="Project Updates" stroke={CHART_COLORS.purple} fill={CHART_COLORS.purple} fillOpacity={0.2} />
                <Area type="monotone" dataKey="taskUpdates" name="Task Updates" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Most Used Features</CardTitle>
            <CardDescription>Top features by request volume (30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            {topFeatures.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topFeatures.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="feature" type="category" width={110} className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Bar dataKey="reads" name="Reads" fill={CHART_COLORS.primary} stackId="a" />
                  <Bar dataKey="writes" name="Writes" fill={CHART_COLORS.green} stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No feature usage data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Error Rate Over Time</CardTitle>
            <CardDescription>Weekly error rate and active users (90 days)</CardDescription>
          </CardHeader>
          <CardContent>
            {frictionTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={frictionTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="rate" className="text-xs" tick={{ fontSize: 11 }} unit="%" />
                  <YAxis yAxisId="users" orientation="right" className="text-xs" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                  <Legend />
                  <Line yAxisId="rate" type="monotone" dataKey="errorRate" name="Error Rate %" stroke={CHART_COLORS.red} strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="users" type="monotone" dataKey="activeUsers" name="Active Users" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No trend data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Productivity</CardTitle>
            <CardDescription>Hours logged and active users by cohort</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cohorts}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="hours" className="text-xs" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="users" orientation="right" className="text-xs" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Line yAxisId="hours" type="monotone" dataKey="hoursLogged" name="Hours Logged" stroke={CHART_COLORS.pink} strokeWidth={2} dot={{ r: 4 }} />
                <Line yAxisId="users" type="monotone" dataKey="activeUsers" name="Active Users" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {topFeatures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Feature Usage Details</CardTitle>
            <CardDescription>Feature breakdown with engagement depth (30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Feature</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Total</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Reads</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Writes</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Users</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Avg ms</th>
                  </tr>
                </thead>
                <tbody>
                  {topFeatures.map((f) => (
                    <tr key={f.feature} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{f.feature}</td>
                      <td className="text-right py-3 px-2">{f.totalRequests.toLocaleString()}</td>
                      <td className="text-right py-3 px-2">{f.reads.toLocaleString()}</td>
                      <td className="text-right py-3 px-2">{f.writes.toLocaleString()}</td>
                      <td className="text-right py-3 px-2">{f.uniqueUsers}</td>
                      <td className="text-right py-3 px-2">{f.avgDurationMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {errorHotspots.length > 0 && (
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Friction Points
            </CardTitle>
            <CardDescription>Features with high error rates (30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Feature</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Errors</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Affected</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Rate</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {errorHotspots.map((e) => (
                    <tr key={e.feature} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{e.feature}</td>
                      <td className="text-right py-3 px-2">
                        <Badge variant="destructive" className="text-xs">{e.errorCount}</Badge>
                      </td>
                      <td className="text-right py-3 px-2">{e.affectedUsers}</td>
                      <td className="text-right py-3 px-2">
                        <span className={e.errorRate > 10 ? "text-red-500 font-semibold" : e.errorRate > 5 ? "text-amber-500" : ""}>
                          {e.errorRate}%
                        </span>
                      </td>
                      <td className="text-right py-3 px-2">
                        <Badge variant="outline" className="text-xs">{e.mostCommonStatus}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OrganizationsTab({ ua }: { ua: UserActivityData }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Organization Activity</CardTitle>
          <CardDescription>User and activity breakdown by organization</CardDescription>
        </CardHeader>
        <CardContent>
          {ua.orgBreakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Organization</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Members</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Active (7d)</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Activity Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {ua.orgBreakdown.map((o) => (
                    <tr key={o.orgId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {o.orgName}
                      </td>
                      <td className="text-right py-3 px-2">{o.memberCount}</td>
                      <td className="text-right py-3 px-2">{o.activeCount}</td>
                      <td className="text-right py-3 px-2">
                        <span className={
                          o.memberCount > 0 && (o.activeCount / o.memberCount) > 0.5
                            ? "text-green-600 font-semibold"
                            : (o.memberCount > 0 && (o.activeCount / o.memberCount) > 0.2
                              ? "text-amber-600"
                              : "text-muted-foreground")
                        }>
                          {o.memberCount > 0 ? Math.round((o.activeCount / o.memberCount) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No organizations found</p>
          )}
        </CardContent>
      </Card>

      {ua.orgBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Members vs Active Users</CardTitle>
            <CardDescription>Comparing total members to 7-day active users per org</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ua.orgBreakdown.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="orgName" className="text-xs" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar dataKey="memberCount" name="Total Members" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                <Bar dataKey="activeCount" name="Active (7d)" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "cohorts", label: "Cohorts" },
  { key: "retention", label: "Retention" },
  { key: "engagement", label: "Engagement" },
  { key: "organizations", label: "Organizations" },
];

export function KpiAnalyticsTab() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const { appendToUrl, queryKeyPart } = useExcludedEmailDomains();

  const { data, isLoading, error } = useQuery<AdminKpiMetricsResponse>({
    queryKey: ["/api/admin/kpi-metrics", queryKeyPart],
    queryFn: async () => {
      const url = appendToUrl("/api/admin/kpi-metrics");
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch admin KPI metrics");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Unable to load platform KPI metrics</p>
        </CardContent>
      </Card>
    );
  }

  const cohorts = data.cohorts ?? [];
  const topFeatures = data.topFeatures ?? [];
  const errorHotspots = data.errorHotspots ?? [];
  const frictionTrend = data.frictionTrend ?? [];
  const ua: UserActivityData = {
    totalUsers: data.userActivity?.totalUsers ?? data.totals?.totalUsers ?? 0,
    activeUsers7d: data.userActivity?.activeUsers7d ?? 0,
    avgActionsPerUser: data.userActivity?.avgActionsPerUser ?? 0,
    overallRetention: data.userActivity?.overallRetention ?? 0,
    newSignupsThisWeek: data.userActivity?.newSignupsThisWeek ?? 0,
    dauMauRatio: data.userActivity?.dauMauRatio ?? 0,
    retentionWoW: data.userActivity?.retentionWoW ?? 0,
    dailyActiveUsers: data.userActivity?.dailyActiveUsers ?? [],
    retentionByLifecycle: data.userActivity?.retentionByLifecycle ?? [],
    weeklyRetention: data.userActivity?.weeklyRetention ?? [],
    topActions: data.userActivity?.topActions ?? [],
    orgBreakdown: data.userActivity?.orgBreakdown ?? [],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">User Activity KPIs</h2>
          <p className="text-muted-foreground">
            Platform-wide user engagement analysis from activation through their lifecycle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EmailDomainExclusionControl />
        </div>
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                subTab === t.key
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === "overview" && <OverviewTab ua={ua} cohorts={cohorts} />}
      {subTab === "cohorts" && <CohortsTab cohorts={cohorts} />}
      {subTab === "retention" && <RetentionTab ua={ua} />}
      {subTab === "engagement" && <EngagementTab topFeatures={topFeatures} errorHotspots={errorHotspots} frictionTrend={frictionTrend} cohorts={cohorts} />}
      {subTab === "organizations" && <OrganizationsTab ua={ua} />}
    </div>
  );
}
