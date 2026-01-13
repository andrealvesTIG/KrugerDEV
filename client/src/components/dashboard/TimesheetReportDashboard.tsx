import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "./KpiCard";
import { DashboardChartCard } from "./DashboardChartCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Loader2, Clock, Target, CheckCircle2, AlertCircle, FileCheck, TrendingUp } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import type { TimesheetEntry, Resource } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
};

export function TimesheetReportDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const startDate = startOfMonth.toISOString().split('T')[0];
  const endDate = endOfMonth.toISOString().split('T')[0];

  const { data: timesheetEntries, isLoading: timesheetsLoading } = useQuery<TimesheetEntry[]>({
    queryKey: ['/api/timesheets/all', currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets?organizationId=${currentOrganization?.id}&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  if (resourcesLoading || timesheetsLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = resources?.filter(r => r.isActive) || [];
  const entries = timesheetEntries || [];

  const totalLoggedHours = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  const expectedHoursPerResource = 160;
  const totalExpectedHours = activeResources.length * expectedHoursPerResource;
  const billableTarget = totalExpectedHours * 0.75;
  
  const submittedEntries = entries.filter(e => e.status === "Submitted" || e.status === "Approved");
  const approvedEntries = entries.filter(e => e.status === "Approved");
  const pendingEntries = entries.filter(e => e.status === "Draft" || e.status === "Submitted");
  
  const complianceRate = totalExpectedHours > 0 
    ? Math.round((totalLoggedHours / totalExpectedHours) * 100)
    : 0;

  const approvalRate = submittedEntries.length > 0
    ? Math.round((approvedEntries.length / submittedEntries.length) * 100)
    : 0;

  const statusDistribution = [
    { name: "Draft", value: entries.filter(e => e.status === "Draft").length, color: COLORS.Yellow },
    { name: "Submitted", value: entries.filter(e => e.status === "Submitted").length, color: COLORS.Blue },
    { name: "Approved", value: entries.filter(e => e.status === "Approved").length, color: COLORS.Green },
    { name: "Rejected", value: entries.filter(e => e.status === "Rejected").length, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const generateWeeklyHours = () => {
    const weeks = [];
    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    for (let week = 0; week < 4; week++) {
      const weekStart = new Date(startOfCurrentMonth);
      weekStart.setDate(startOfCurrentMonth.getDate() + (week * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const weekEntries = entries.filter(e => {
        const entryDate = new Date(e.entryDate);
        return entryDate >= weekStart && entryDate <= weekEnd;
      });
      
      const weekHours = weekEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
      
      weeks.push({
        week: `Week ${week + 1}`,
        logged: Math.round(weekHours),
        target: activeResources.length * 40,
      });
    }
    return weeks;
  };

  const weeklyHours = generateWeeklyHours();

  const resourceHours = activeResources.reduce((acc, resource) => {
    const resourceEntries = entries.filter(e => e.resourceId === resource.id);
    const totalHours = resourceEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
    acc[resource.id] = {
      name: resource.displayName,
      email: resource.email,
      department: resource.department,
      hours: totalHours,
      entries: resourceEntries.length,
      submitted: resourceEntries.filter(e => e.status !== "Draft").length,
    };
    return acc;
  }, {} as Record<number, { name: string; email: string | null; department: string | null; hours: number; entries: number; submitted: number }>);

  const resourcesWithMissingTime = activeResources
    .filter(r => {
      const data = resourceHours[r.id];
      return !data || data.hours < 32;
    })
    .map(r => ({
      id: r.id,
      name: r.displayName,
      email: r.email,
      department: r.department,
      loggedHours: resourceHours[r.id]?.hours || 0,
      expectedHours: 40,
    }));

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Hours Logged"
          value={Math.round(totalLoggedHours)}
          subtitle={`Target: ${Math.round(totalExpectedHours)} hrs`}
          icon={Clock}
          iconColor="text-blue-500"
          borderColor="border-l-blue-500"
          href="/timesheets"
          testId="kpi-total-hours"
        />
        <KpiCard
          title="Compliance Rate"
          value={`${complianceRate}%`}
          subtitle="Hours logged vs expected"
          icon={Target}
          iconColor={complianceRate >= 80 ? "text-emerald-500" : complianceRate >= 60 ? "text-amber-500" : "text-rose-500"}
          borderColor={complianceRate >= 80 ? "border-l-emerald-500" : complianceRate >= 60 ? "border-l-amber-500" : "border-l-rose-500"}
          delay={0.2}
          testId="kpi-compliance-rate"
        />
        <KpiCard
          title="Approval Rate"
          value={`${approvalRate}%`}
          subtitle={`${approvedEntries.length} of ${submittedEntries.length} approved`}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          borderColor="border-l-emerald-500"
          delay={0.3}
          testId="kpi-approval-rate"
        />
        <KpiCard
          title="Pending Review"
          value={pendingEntries.length}
          subtitle="Entries awaiting action"
          icon={FileCheck}
          iconColor="text-purple-500"
          borderColor="border-l-purple-500"
          delay={0.4}
          testId="kpi-pending-review"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DashboardChartCard
          title="Weekly Hours Trend"
          description="Logged hours vs target by week"
          testId="chart-weekly-hours"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyHours}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="week" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Bar dataKey="logged" fill={COLORS.Blue} radius={[4, 4, 0, 0]} name="Logged Hours" />
              <Bar dataKey="target" fill={COLORS.Green} radius={[4, 4, 0, 0]} name="Target" opacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Entry Status Distribution"
          description="Timesheet entries by approval status"
          testId="chart-status-distribution"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {statusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Hours by Week"
          description="Cumulative hours logged over the month"
          testId="chart-cumulative-hours"
          className="md:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyHours}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="week" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Line type="monotone" dataKey="logged" stroke={COLORS.Blue} strokeWidth={2} dot={{ r: 4 }} name="Hours Logged" />
              <Line type="monotone" dataKey="target" stroke={COLORS.Green} strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target" />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChartCard>
      </div>

      <Card data-testid="card-missing-submissions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Missing Submissions
          </CardTitle>
          <CardDescription>Resources with incomplete time entries this week</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Logged</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Compliance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resourcesWithMissingTime.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      All resources have submitted time
                    </TableCell>
                  </TableRow>
                ) : (
                  resourcesWithMissingTime.map((resource) => {
                    const compliance = Math.round((resource.loggedHours / resource.expectedHours) * 100);
                    return (
                      <TableRow key={resource.id} data-testid={`row-missing-${resource.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {getInitials(resource.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{resource.name}</div>
                              {resource.email && (
                                <div className="text-xs text-muted-foreground">{resource.email}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{resource.department || "-"}</TableCell>
                        <TableCell>{resource.loggedHours} hrs</TableCell>
                        <TableCell>{resource.expectedHours} hrs</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={compliance} className="w-16 h-2" />
                            <Badge 
                              variant={compliance >= 80 ? "default" : compliance >= 50 ? "secondary" : "destructive"}
                            >
                              {compliance}%
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
