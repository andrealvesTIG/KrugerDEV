import React, { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useExcludedEmailDomains } from "@/hooks/use-excluded-email-domains";
import { EmailDomainExclusionControl } from "@/components/dashboard/EmailDomainExclusionControl";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, ComposedChart, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import {
  Users, UserCheck, TrendingUp, Activity, MousePointerClick, Building2,
  Search, FolderKanban, ListTodo, AlertTriangle, Bug, Clock, ChevronDown, ChevronRight,
} from "lucide-react";

const COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#6366f1", "#14b8a6", "#f97316", "#84cc16", "#a855f7",
];

interface CohortPeriod {
  label: string;
  key: string;
  totalUsers: number;
  activeUsers: number;
  totalActions: number;
  avgActionsPerUser: number;
  retentionRate: number;
  topActions: { action: string; count: number }[];
}

interface UserCohort {
  cohortLabel: string;
  cohortStart: string;
  totalUsers: number;
  periods: CohortPeriod[];
}

interface KpiData {
  totalUsers: number;
  activeUsersLast7d: number;
  activeUsersLast30d: number;
  avgActionsPerUser: number;
  overallRetentionRate: number;
  newUsersThisWeek: number;
  newUsersLastWeek: number;
  cohorts: UserCohort[];
  actionBreakdown: { action: string; count: number; percentage: number }[];
  dailyActiveUsers: { date: string; count: number }[];
  weeklyRetentionTrend: { week: string; rate: number }[];
}

interface OrgMetrics {
  projectsCreated: number;
  tasksCreated: number;
  risksCreated: number;
  issuesCreated: number;
  timesheetEntries: number;
  timesheetHours: number;
  reportsGenerated: number;
  importsExports: number;
  integrationsSetUp: number;
  resourcesManaged: number;
  portfoliosCreated: number;
  totalActivityLogs: number;
  activeUsers: number;
  topActions: { action: string; count: number }[];
}

interface OrgData {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  metrics: OrgMetrics;
}

interface OrgResponse {
  organizations: OrgData[];
  totals: Record<string, number>;
  period: string;
}

type TabKey = "overview" | "cohorts" | "retention" | "engagement" | "organizations";

const fadeIn = (delay: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
});

function KpiCard({ title, value, subtitle, icon: Icon, borderClass, delay }: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: typeof Users;
  borderClass: string;
  delay: number;
}) {
  return (
    <motion.div {...fadeIn(delay)}>
      <Card className={`${borderClass} border-l-4`}>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground font-medium">{title}</p>
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-l-4 border-l-muted animate-pulse">
            <CardContent className="pt-5 pb-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent><Skeleton className="h-64 w-full" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OrgLoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
      ))}
    </div>
  );
}

const tooltipStyle = { borderRadius: "8px", fontSize: "12px" };

function OverviewView({ data }: { data: KpiData }) {
  const lifecycleData = useMemo(() => {
    if (!data.cohorts.length) return [];
    const allPeriods = data.cohorts[0]?.periods ?? [];
    return allPeriods.map((p, i) => {
      let totalRetention = 0;
      let totalActions = 0;
      let count = 0;
      for (const c of data.cohorts) {
        if (c.periods[i] && c.totalUsers > 0) {
          totalRetention += c.periods[i].retentionRate;
          totalActions += c.periods[i].avgActionsPerUser;
          count++;
        }
      }
      return {
        label: p.label,
        retentionRate: count > 0 ? Math.round(totalRetention / count) : 0,
        avgActions: count > 0 ? Math.round(totalActions / count) : 0,
      };
    });
  }, [data.cohorts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div {...fadeIn(0)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Active Users</CardTitle>
            <CardDescription>Unique active users over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyActiveUsers}>
                <defs>
                  <linearGradient id="dauGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" name="Active Users" stroke="#3b82f6" fill="url(#dauGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeIn(0.05)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Retention by Lifecycle Period</CardTitle>
            <CardDescription>User retention rate at each stage since activation</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={lifecycleData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' } as React.SVGProps<SVGTextElement> & { angle: number }} height={60} />
                <YAxis yAxisId="retention" tick={{ fontSize: 11 }} label={{ value: 'Retention %', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                <YAxis yAxisId="actions" orientation="right" tick={{ fontSize: 11 }} label={{ value: 'Avg Actions', angle: 90, position: 'insideRight', style: { fontSize: 11 } }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar yAxisId="actions" dataKey="avgActions" name="Avg Actions" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Line yAxisId="retention" type="monotone" dataKey="retentionRate" name="Retention %" stroke="#10b981" strokeWidth={2} dot={{ r: 5, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeIn(0.1)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Retention Trend</CardTitle>
            <CardDescription>Overall retention rate trend over recent weeks</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyRetentionTrend}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="rate" name="Retention %" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeIn(0.15)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top User Actions</CardTitle>
            <CardDescription>Most common actions performed by users</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {data.actionBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.actionBreakdown.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="action" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Actions" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No action data recorded yet</div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function CohortsView({ data }: { data: KpiData }) {
  const [selectedCohort, setSelectedCohort] = useState("all");

  const displayedCohorts = useMemo(() => {
    if (selectedCohort === "all") return data.cohorts;
    return data.cohorts.filter(c => c.cohortLabel === selectedCohort);
  }, [data.cohorts, selectedCohort]);

  const chartData = useMemo(() => {
    if (!data.cohorts.length) return [];
    const periods = data.cohorts[0]?.periods ?? [];
    return periods.map((p, i) => {
      const point: Record<string, unknown> = { label: p.label };
      for (const c of displayedCohorts) {
        if (c.periods[i]) {
          point[c.cohortLabel] = c.periods[i].activeUsers;
        }
      }
      return point;
    });
  }, [displayedCohorts, data.cohorts]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={selectedCohort} onValueChange={setSelectedCohort}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select cohort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cohorts</SelectItem>
            {data.cohorts.map(c => (
              <SelectItem key={c.cohortLabel} value={c.cohortLabel}>
                {c.cohortLabel} ({c.totalUsers} users)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <motion.div {...fadeIn(0)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cohort Activity Over Time</CardTitle>
            <CardDescription>Active users by cohort across lifecycle periods</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' } as React.SVGProps<SVGTextElement> & { angle: number }} height={60} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {displayedCohorts.map((c, i) => (
                  <Line key={c.cohortLabel} type="monotone" dataKey={c.cohortLabel} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayedCohorts.map((cohort, ci) => (
          <motion.div key={cohort.cohortLabel} {...fadeIn(ci * 0.1)}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{cohort.cohortLabel}</CardTitle>
                  <Badge variant="secondary">{cohort.totalUsers} users</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {cohort.periods.slice(0, 6).map(p => {
                  const color = p.retentionRate >= 50 ? "bg-green-500" : p.retentionRate >= 25 ? "bg-amber-500" : "bg-red-500";
                  return (
                    <div key={p.key} className="flex items-center gap-2 text-sm">
                      <span className="w-20 text-muted-foreground truncate">{p.label}</span>
                      <div className="flex-1">
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(p.retentionRate, 100)}%` }} />
                        </div>
                      </div>
                      <span className="w-10 text-right text-xs font-medium">{p.retentionRate}%</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function RetentionView({ data }: { data: KpiData }) {
  const periodLabels = useMemo(() => {
    if (!data.cohorts.length) return [];
    return (data.cohorts[0]?.periods ?? []).map(p => {
      const short: Record<string, string> = { "Week 1": "Wk 1", "Week 2": "Wk 2", "Week 3-4": "Wk 3-4", "Month 2": "Mo 2", "Month 3": "Mo 3", "Months 4-6": "Mo 4-6", "Months 7-12": "Mo 7-12", "12+ months": "Yr 2+" };
      return short[p.label] || p.label;
    });
  }, [data.cohorts]);

  const avgRetention = useMemo(() => {
    if (!data.cohorts.length) return [];
    const periods = data.cohorts[0]?.periods ?? [];
    return periods.map((p, i) => {
      let total = 0, count = 0;
      for (const c of data.cohorts) {
        if (c.periods[i] && c.totalUsers > 0) { total += c.periods[i].retentionRate; count++; }
      }
      return { label: p.label, rate: count > 0 ? Math.round(total / count) : 0 };
    });
  }, [data.cohorts]);

  const cohortSizes = useMemo(() => data.cohorts.map(c => ({ label: c.cohortLabel, users: c.totalUsers })), [data.cohorts]);

  return (
    <div className="space-y-6">
      <motion.div {...fadeIn(0)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Retention Heatmap</CardTitle>
            <CardDescription>Retention rates across cohorts and lifecycle periods</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground sticky left-0 bg-background z-10 min-w-[100px]">Cohort</th>
                    {periodLabels.map(l => (
                      <th key={l} className="text-center py-2 px-1 font-medium text-muted-foreground min-w-[60px]">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map(c => (
                    <tr key={c.cohortLabel} className="border-b last:border-0">
                      <td className="py-2 px-2 font-medium sticky left-0 bg-background z-10">{c.cohortLabel}</td>
                      {c.periods.map(p => {
                        let bg = "bg-muted/30";
                        let text = "text-muted-foreground";
                        if (p.retentionRate >= 75) { bg = "bg-green-500/80"; text = "text-white"; }
                        else if (p.retentionRate >= 50) { bg = "bg-green-500/50"; text = "text-white"; }
                        else if (p.retentionRate >= 25) { bg = "bg-amber-500/50"; text = "text-foreground"; }
                        else if (p.retentionRate > 0) { bg = "bg-red-500/30"; text = "text-foreground"; }
                        return (
                          <td key={p.key} className={`text-center py-2 px-1 ${bg} ${text} font-medium`} title={`${p.activeUsers} active users`}>
                            {p.retentionRate > 0 ? `${p.retentionRate}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div {...fadeIn(0.05)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Retention Curve</CardTitle>
              <CardDescription>Average retention across all cohorts</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={avgRetention}>
                  <defs>
                    <linearGradient id="retGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="rate" name="Retention %" stroke="#10b981" fill="url(#retGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeIn(0.1)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cohort Size Trend</CardTitle>
              <CardDescription>Number of users per cohort</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cohortSizes}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' } as React.SVGProps<SVGTextElement> & { angle: number }} height={60} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="users" name="Users" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function EngagementView({ data }: { data: KpiData }) {
  const intensityData = useMemo(() => {
    if (!data.cohorts.length) return [];
    const periods = data.cohorts[0]?.periods ?? [];
    return periods.map((p, i) => {
      let total = 0, count = 0;
      for (const c of data.cohorts) {
        if (c.periods[i] && c.totalUsers > 0) { total += c.periods[i].avgActionsPerUser; count++; }
      }
      return { label: p.label, avgActions: count > 0 ? Math.round(total / count) : 0 };
    });
  }, [data.cohorts]);

  const donutData = useMemo(() => data.actionBreakdown.slice(0, 8), [data.actionBreakdown]);

  const radarData = useMemo(() => {
    if (!data.cohorts.length) return [];
    const periods = data.cohorts[0]?.periods ?? [];
    return periods.slice(0, 8).map((p, i) => {
      let totalRet = 0, totalEng = 0, count = 0;
      for (const c of data.cohorts) {
        if (c.periods[i] && c.totalUsers > 0) {
          totalRet += c.periods[i].retentionRate;
          totalEng += c.periods[i].avgActionsPerUser;
          count++;
        }
      }
      const maxEng = Math.max(...intensityData.map(d => d.avgActions), 1);
      return {
        label: p.label,
        retention: count > 0 ? Math.round(totalRet / count) : 0,
        engagement: count > 0 ? Math.round((totalEng / count / maxEng) * 100) : 0,
      };
    });
  }, [data.cohorts, intensityData]);

  const activeUsersByPeriod = useMemo(() => {
    if (!data.cohorts.length) return [];
    const periods = data.cohorts[0]?.periods ?? [];
    return periods.map((p, i) => {
      let total = 0;
      for (const c of data.cohorts) {
        if (c.periods[i]) total += c.periods[i].activeUsers;
      }
      return { label: p.label, activeUsers: total };
    });
  }, [data.cohorts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div {...fadeIn(0)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Engagement Intensity by Period</CardTitle>
            <CardDescription>Average actions per user at each lifecycle stage</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={intensityData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' } as React.SVGProps<SVGTextElement> & { angle: number }} height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="avgActions" name="Avg Actions/User" radius={[4, 4, 0, 0]}>
                  {intensityData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeIn(0.05)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Action Distribution</CardTitle>
            <CardDescription>Top action types by volume</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="count" nameKey="action" innerRadius={60} outerRadius={100} paddingAngle={3} label={({ action, percentage }) => `${action} (${percentage}%)`}>
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No action data available</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeIn(0.1)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Engagement vs Retention</CardTitle>
            <CardDescription>Normalized comparison across lifecycle periods</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="label" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar name="Engagement" dataKey="engagement" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
                <Radar name="Retention" dataKey="retention" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                <Legend />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...fadeIn(0.15)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active Users by Period</CardTitle>
            <CardDescription>Total active users at each lifecycle stage</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeUsersByPeriod}>
                <defs>
                  <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="label" tick={{ fontSize: 10, angle: -30, textAnchor: 'end' } as React.SVGProps<SVGTextElement> & { angle: number }} height={60} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="activeUsers" name="Active Users" stroke="#f59e0b" fill="url(#activeGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function OrganizationsView() {
  const [period, setPeriod] = useState("30d");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("activity");
  const [expandedOrg, setExpandedOrg] = useState<number | null>(null);

  const { appendToUrl, queryKeyPart } = useExcludedEmailDomains();
  const { data, isLoading, error } = useQuery<OrgResponse>({
    queryKey: ["/api/admin/user-activity-kpi/organizations", period, queryKeyPart],
    queryFn: async () => {
      const url = appendToUrl(`/api/admin/user-activity-kpi/organizations?period=${period}`);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organization data");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredOrgs = useMemo(() => {
    if (!data?.organizations) return [];
    let orgs = data.organizations.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
    switch (sortBy) {
      case "activity": orgs.sort((a, b) => b.metrics.totalActivityLogs - a.metrics.totalActivityLogs); break;
      case "projects": orgs.sort((a, b) => b.metrics.projectsCreated - a.metrics.projectsCreated); break;
      case "tasks": orgs.sort((a, b) => b.metrics.tasksCreated - a.metrics.tasksCreated); break;
      case "members": orgs.sort((a, b) => b.memberCount - a.memberCount); break;
      case "timesheets": orgs.sort((a, b) => b.metrics.timesheetEntries - a.metrics.timesheetEntries); break;
      case "name": orgs.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return orgs;
  }, [data?.organizations, search, sortBy]);

  const maxActivity = useMemo(() => Math.max(...(filteredOrgs.map(o => o.metrics.totalActivityLogs)), 1), [filteredOrgs]);

  if (isLoading) return <OrgLoadingSkeleton />;
  if (error || !data) {
    return (
      <Card><CardContent className="py-12 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <h3 className="font-semibold mb-1">Unable to Load Organization Data</h3>
        <p className="text-sm text-muted-foreground">Could not fetch organization metrics. Please try again.</p>
      </CardContent></Card>
    );
  }

  const summaryCards = [
    { label: "Organizations", value: data.totals.totalOrgs, icon: Building2, color: "text-blue-500" },
    { label: "Projects", value: data.totals.totalProjects, icon: FolderKanban, color: "text-indigo-500" },
    { label: "Tasks", value: data.totals.totalTasks, icon: ListTodo, color: "text-purple-500" },
    { label: "Risks", value: data.totals.totalRisks, icon: AlertTriangle, color: "text-amber-500" },
    { label: "Issues", value: data.totals.totalIssues, icon: Bug, color: "text-red-500" },
    { label: "Timesheets", value: data.totals.totalTimesheetEntries, icon: Clock, color: "text-green-500" },
  ];

  const top10 = filteredOrgs.slice(0, 10);
  const stackedData = top10.map(o => ({
    name: o.name.length > 15 ? o.name.slice(0, 15) + "…" : o.name,
    Projects: o.metrics.projectsCreated,
    Tasks: o.metrics.tasksCreated,
    Risks: o.metrics.risksCreated,
    Issues: o.metrics.issuesCreated,
  }));

  const pieData = [
    { name: "Projects", value: data.totals.totalProjects, color: "#3b82f6" },
    { name: "Tasks", value: data.totals.totalTasks, color: "#8b5cf6" },
    { name: "Risks", value: data.totals.totalRisks, color: "#f59e0b" },
    { name: "Issues", value: data.totals.totalIssues, color: "#ef4444" },
    { name: "Timesheets", value: data.totals.totalTimesheetEntries, color: "#10b981" },
    { name: "Resources", value: data.totals.totalResources, color: "#06b6d4" },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search organizations..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 days</SelectItem>
            <SelectItem value="14d">14 days</SelectItem>
            <SelectItem value="30d">30 days</SelectItem>
            <SelectItem value="90d">90 days</SelectItem>
            <SelectItem value="6m">6 months</SelectItem>
            <SelectItem value="1y">1 year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="activity">Most Active</SelectItem>
            <SelectItem value="projects">Most Projects</SelectItem>
            <SelectItem value="tasks">Most Tasks</SelectItem>
            <SelectItem value="members">Most Members</SelectItem>
            <SelectItem value="timesheets">Most Timesheets</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {summaryCards.map((c, i) => (
          <motion.div key={c.label} {...fadeIn(i * 0.05)}>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <c.icon className={`h-5 w-5 mx-auto mb-1 ${c.color}`} />
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-xl font-bold">{(c.value ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div {...fadeIn(0)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activity by Organization (Top 10)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              {stackedData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stackedData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="Projects" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Tasks" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="Risks" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="Issues" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No organization data</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...fadeIn(0.05)}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Platform Activity Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3} label={({ name, value }) => `${name}: ${value}`}>
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data available</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization Details</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrgs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No organizations found matching your search.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Organization</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Members</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Projects</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Tasks</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Risks</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Issues</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Timesheets</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Hours</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground min-w-[150px]">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.map(org => (
                    <Fragment key={org.id}>
                      <tr
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                      >
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            {expandedOrg === org.id ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                            <div>
                              <p className="font-medium">{org.name}</p>
                              <p className="text-xs text-muted-foreground">{org.metrics.activeUsers} active</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right py-3 px-2">{org.memberCount}</td>
                        <td className="text-right py-3 px-2">{org.metrics.projectsCreated}</td>
                        <td className="text-right py-3 px-2">{org.metrics.tasksCreated}</td>
                        <td className="text-right py-3 px-2">{org.metrics.risksCreated}</td>
                        <td className="text-right py-3 px-2">{org.metrics.issuesCreated}</td>
                        <td className="text-right py-3 px-2">{org.metrics.timesheetEntries}</td>
                        <td className="text-right py-3 px-2">{org.metrics.timesheetHours}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${(org.metrics.totalActivityLogs / maxActivity) * 100}%` }} />
                            </div>
                            <span className="text-xs w-8 text-right">{org.metrics.totalActivityLogs}</span>
                          </div>
                        </td>
                      </tr>
                      {expandedOrg === org.id && (
                        <tr key={`${org.id}-expanded`} className="border-b bg-muted/30">
                          <td colSpan={9} className="py-4 px-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground font-medium mb-1">Portfolio & Resources</p>
                                <p>Portfolios: {org.metrics.portfoliosCreated}</p>
                                <p>Resources: {org.metrics.resourcesManaged}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground font-medium mb-1">Project Work</p>
                                <p>Total items: {org.metrics.projectsCreated + org.metrics.tasksCreated + org.metrics.risksCreated + org.metrics.issuesCreated}</p>
                                <p>Risk/Issue ratio: {org.metrics.issuesCreated > 0 ? (org.metrics.risksCreated / org.metrics.issuesCreated).toFixed(1) : "N/A"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground font-medium mb-1">Time Tracking</p>
                                <p>Entries: {org.metrics.timesheetEntries}</p>
                                <p>Avg hrs/entry: {org.metrics.timesheetEntries > 0 ? (org.metrics.timesheetHours / org.metrics.timesheetEntries).toFixed(1) : "0"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground font-medium mb-1">Top Actions</p>
                                {org.metrics.topActions.length > 0 ? (
                                  <ul className="space-y-0.5">
                                    {org.metrics.topActions.map(a => (
                                      <li key={a.action} className="text-xs">{a.action}: {a.count}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No activity logged</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "cohorts", label: "Cohorts" },
  { key: "retention", label: "Retention" },
  { key: "engagement", label: "Engagement" },
  { key: "organizations", label: "Organizations" },
];

export function UserActivityTab() {
  const [tab, setTab] = useState<TabKey>("overview");
  const { appendToUrl, queryKeyPart } = useExcludedEmailDomains();

  const { data, isLoading, error } = useQuery<KpiData>({
    queryKey: ["/api/admin/user-activity-kpi", queryKeyPart],
    queryFn: async () => {
      const url = appendToUrl("/api/admin/user-activity-kpi");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch user activity KPI");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <Card><CardContent className="py-12 text-center">
        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <h3 className="font-semibold mb-1">Unable to Load Activity Data</h3>
        <p className="text-sm text-muted-foreground">Could not fetch user activity metrics. Please try again.</p>
      </CardContent></Card>
    );
  }

  const dauMauRatio = data.activeUsersLast30d > 0
    ? Math.round((data.activeUsersLast7d / data.activeUsersLast30d) * 100)
    : 0;

  const wowGrowth = data.newUsersLastWeek > 0
    ? Math.round(((data.newUsersThisWeek - data.newUsersLastWeek) / data.newUsersLastWeek) * 100)
    : (data.newUsersThisWeek > 0 ? 100 : 0);

  const retentionBorderClass = data.overallRetentionRate >= 50
    ? "border-l-green-500"
    : data.overallRetentionRate >= 25
      ? "border-l-amber-500"
      : "border-l-red-500";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">User Activity KPIs</h2>
          <p className="text-muted-foreground">Platform-wide user engagement analysis from activation through their lifecycle</p>
        </div>
        <div className="flex items-center gap-2">
          <EmailDomainExclusionControl />
        </div>
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.key ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Total Users" value={data.totalUsers.toLocaleString()} subtitle={`${data.newUsersThisWeek} new this week`} icon={Users} borderClass="border-l-blue-500" delay={0} />
        <KpiCard title="Active Users (7d)" value={data.activeUsersLast7d.toLocaleString()} subtitle={`${dauMauRatio}% DAU/MAU ratio`} icon={UserCheck} borderClass="border-l-green-500" delay={0.1} />
        <KpiCard title="Avg Actions/User" value={data.avgActionsPerUser.toLocaleString()} subtitle="Across all active users" icon={MousePointerClick} borderClass="border-l-purple-500" delay={0.2} />
        <KpiCard
          title="Overall Retention"
          value={`${data.overallRetentionRate}%`}
          subtitle={wowGrowth > 0 ? `+${wowGrowth}% WoW growth` : wowGrowth < 0 ? `${wowGrowth}% WoW growth` : "Stable WoW"}
          icon={TrendingUp}
          borderClass={retentionBorderClass}
          delay={0.3}
        />
      </div>

      {tab === "overview" && <OverviewView data={data} />}
      {tab === "cohorts" && <CohortsView data={data} />}
      {tab === "retention" && <RetentionView data={data} />}
      {tab === "engagement" && <EngagementView data={data} />}
      {tab === "organizations" && <OrganizationsView />}
    </div>
  );
}
