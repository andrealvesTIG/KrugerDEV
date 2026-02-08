import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentUserResource, useTeamTimesheetEntries, useTimesheetEntries } from "@/hooks/use-timesheets";
import { useQuery } from "@tanstack/react-query";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Loader2, Clock, Target, CheckCircle2, AlertCircle, FileCheck, TrendingUp, Calendar, Users, Eye, Zap, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import type { TimesheetEntry } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
  Cyan: "#06b6d4",
};

export function TimesheetReportDashboard() {
  const { currentOrganization, memberships } = useOrganization();
  const { user } = useAuth();
  const { data: currentResource } = useCurrentUserResource(currentOrganization?.id ?? null, user?.id);
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());
  
  // Determine if user can view team data (admin, owner, or approver)
  const isSuperAdmin = user?.role === 'super_admin';
  const currentMembership = memberships.find(m => m.organizationId === currentOrganization?.id);
  const isOrgAdmin = currentMembership?.role === 'org_admin' || currentMembership?.role === 'owner';
  const isApprover = currentResource?.isApprover === true;
  const canViewTeam = isSuperAdmin || isOrgAdmin || isApprover;

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const startDate = startOfMonth.toISOString().split('T')[0];
  const endDate = endOfMonth.toISOString().split('T')[0];

  const { data: teamEntries = [], isLoading: teamLoading } = useTeamTimesheetEntries(
    canViewTeam ? (currentOrganization?.id ?? null) : null,
    startDate,
    endDate
  );
  const { data: personalEntries = [], isLoading: personalLoading } = useTimesheetEntries(
    canViewTeam ? undefined : user?.id,
    canViewTeam ? null : (currentOrganization?.id ?? null),
    startDate,
    endDate
  );
  const timesheetEntries = canViewTeam ? teamEntries : personalEntries;
  const timesheetsLoading = canViewTeam ? teamLoading : personalLoading;

  const filteredResources = useMemo(() => {
    return (resources ?? []).filter(r => {
      if (!r.isActive) return false;
      if (filters.resourceId && r.id !== filters.resourceId) return false;
      return true;
    });
  }, [resources, filters]);

  const filteredEntries = useMemo(() => {
    return (timesheetEntries ?? []).filter(e => {
      if (filters.resourceId && e.resourceId !== filters.resourceId) return false;
      if (filters.projectId && e.projectId !== filters.projectId) return false;
      return true;
    });
  }, [timesheetEntries, filters]);

  if (resourcesLoading || timesheetsLoading || projectsLoading || portfoliosLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = filteredResources;
  const entries = filteredEntries;

  const handleExportCsv = () => {
    const headers = ["Resource", "Department", "Logged Hours", "Expected", "Compliance", "Status"];
    const rows = activeResources.map(r => {
      const data = resourceHours[r.id] || { hours: 0, submitted: 0 };
      const compliance = Math.round((data.hours / 40) * 100);
      return [r.displayName, r.department || "", data.hours, 40, `${compliance}%`, data.submitted > 0 ? "Submitted" : "Pending"];
    });
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "timesheet_report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper to safely parse hours - filters out NaN, Infinity, and values outside valid range
  const parseHoursSafe = (hours: any): number => {
    const num = Number(hours || 0);
    if (!isFinite(num) || isNaN(num) || num < 0 || num > 24) {
      return 0;
    }
    return num;
  };

  const totalLoggedHours = entries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const expectedHoursPerResource = 160;
  const totalExpectedHours = activeResources.length * expectedHoursPerResource;
  
  const submittedEntries = entries.filter(e => e.status === "Submitted" || e.status === "Approved");
  const approvedEntries = entries.filter(e => e.status === "Approved");
  const pendingEntries = entries.filter(e => e.status === "Draft" || e.status === "Submitted");
  const rejectedEntries = entries.filter(e => e.status === "Rejected");
  
  const complianceRate = totalExpectedHours > 0 ? Math.round((totalLoggedHours / totalExpectedHours) * 100) : 0;
  const approvalRate = submittedEntries.length > 0 ? Math.round((approvedEntries.length / submittedEntries.length) * 100) : 0;
  const avgHoursPerEntry = entries.length > 0 ? Math.round(totalLoggedHours / entries.length * 10) / 10 : 0;
  
  // Team speed/velocity metrics
  const avgHoursPerResource = activeResources.length > 0 
    ? Math.round((totalLoggedHours / activeResources.length) * 10) / 10 
    : 0;
  const targetHoursPerResource = 40; // weekly target
  const velocityScore = targetHoursPerResource > 0 
    ? Math.round((avgHoursPerResource / targetHoursPerResource) * 100) 
    : 0;
  
  // Calculate week-over-week trend
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - today.getDay());
  const lastWeekStart = new Date(currentWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(currentWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  
  const currentWeekEntries = entries.filter(e => {
    const entryDate = new Date(e.entryDate);
    return entryDate >= currentWeekStart && entryDate <= today;
  });
  const lastWeekEntries = entries.filter(e => {
    const entryDate = new Date(e.entryDate);
    return entryDate >= lastWeekStart && entryDate <= lastWeekEnd;
  });
  
  const currentWeekHours = currentWeekEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const lastWeekHours = lastWeekEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const weekOverWeekChange = lastWeekHours > 0 
    ? Math.round(((currentWeekHours - lastWeekHours) / lastWeekHours) * 100) 
    : 0;
  
  // Calculate daily average for the team
  const daysInMonth = Math.ceil((today.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24)) || 1;
  const avgDailyHours = Math.round((totalLoggedHours / daysInMonth) * 10) / 10;

  const statusDistribution = [
    { name: "Draft", value: entries.filter(e => e.status === "Draft").length, color: COLORS.Yellow },
    { name: "Submitted", value: entries.filter(e => e.status === "Submitted").length, color: COLORS.Blue },
    { name: "Approved", value: approvedEntries.length, color: COLORS.Green },
    { name: "Rejected", value: rejectedEntries.length, color: COLORS.Red },
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
      
      const weekHours = weekEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
      
      weeks.push({ week: `Week ${week + 1}`, logged: Math.round(weekHours), target: activeResources.length * 40 });
    }
    return weeks;
  };

  const weeklyHours = generateWeeklyHours();

  const resourceHours = activeResources.reduce((acc, resource) => {
    const resourceEntries = entries.filter(e => e.resourceId === resource.id);
    const totalHours = resourceEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
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

  const topContributors = activeResources
    .map(r => ({ ...r, hours: resourceHours[r.id]?.hours || 0 }))
    .filter(r => r.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold">Timesheet Overview</h2>
            <p className="text-sm text-muted-foreground">Monthly compliance, approval status, and team performance.</p>
          </div>
          <Badge 
            variant="outline" 
            className="flex items-center gap-1.5 h-6"
            data-testid="badge-view-scope"
          >
            <Eye className="h-3 w-3" />
            {canViewTeam ? "Team View" : "Personal View"}
          </Badge>
        </div>
        <DashboardActionBar title="Timesheet Overview Dashboard" dashboardType="timesheet" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <DashboardFilters
        portfolios={portfolios || []}
        projects={filters.portfolioId 
          ? (projectsData || []).filter(p => p.portfolioId === filters.portfolioId) 
          : (projectsData || [])}
        resources={resources || []}
        filters={filters}
        onFiltersChange={setFilters}
        showHealth={false}
        showPriority={false}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-total-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Hours</span>
          </div>
          <div className="text-2xl font-bold">{Math.round(totalLoggedHours)}</div>
          <div className="text-xs text-muted-foreground">of {Math.round(totalExpectedHours)}</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-team-velocity">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: `${velocityScore >= 80 ? COLORS.Green : velocityScore >= 50 ? COLORS.Yellow : COLORS.Red}15` }}>
              <Zap className="h-3.5 w-3.5" style={{ color: velocityScore >= 80 ? COLORS.Green : velocityScore >= 50 ? COLORS.Yellow : COLORS.Red }} />
            </div>
            <span className="text-xs text-muted-foreground">Team Speed</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: velocityScore >= 80 ? COLORS.Green : velocityScore >= 50 ? COLORS.Yellow : COLORS.Red }}>{velocityScore}%</div>
          <div className="text-xs text-muted-foreground">{avgHoursPerResource}h avg/member</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-week-trend">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: `${weekOverWeekChange >= 0 ? COLORS.Green : COLORS.Red}15` }}>
              {weekOverWeekChange > 0 ? (
                <ArrowUp className="h-3.5 w-3.5" style={{ color: COLORS.Green }} />
              ) : weekOverWeekChange < 0 ? (
                <ArrowDown className="h-3.5 w-3.5" style={{ color: COLORS.Red }} />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <span className="text-xs text-muted-foreground">Week Trend</span>
          </div>
          <div className="text-2xl font-bold flex items-center gap-1" style={{ color: weekOverWeekChange >= 0 ? COLORS.Green : COLORS.Red }}>
            {weekOverWeekChange > 0 ? "+" : ""}{weekOverWeekChange}%
          </div>
          <div className="text-xs text-muted-foreground">{Math.round(currentWeekHours)}h this week</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-daily-avg">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <TrendingUp className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Daily Avg</span>
          </div>
          <div className="text-2xl font-bold">{avgDailyHours}h</div>
          <div className="text-xs text-muted-foreground">team total/day</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-approval">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Approval Rate</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{approvalRate}%</div>
          <div className="text-xs text-muted-foreground">{approvedEntries.length} approved</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-missing">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Missing</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{resourcesWithMissingTime.length}</div>
          <div className="text-xs text-muted-foreground">incomplete</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="chart-weekly-hours">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Weekly Hours Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyHours}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="logged" fill={COLORS.Blue} radius={[4, 4, 0, 0]} name="Logged" />
                  <Bar dataKey="target" fill={COLORS.Green} radius={[4, 4, 0, 0]} name="Target" opacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-status-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-muted-foreground" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                    {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-top-contributors">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Top Contributors
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[220px]">
              <div className="space-y-2">
                {topContributors.map((resource) => {
                  const compliance = Math.round((resource.hours / 40) * 100);
                  return (
                    <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`row-contributor-${resource.id}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{getInitials(resource.displayName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{resource.displayName}</div>
                        <div className="text-xs text-muted-foreground">{resource.department || "No department"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xs font-medium">{resource.hours}h</div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] h-5" style={{ backgroundColor: `${compliance >= 80 ? COLORS.Green : compliance >= 50 ? COLORS.Yellow : COLORS.Red}15`, color: compliance >= 80 ? COLORS.Green : compliance >= 50 ? COLORS.Yellow : COLORS.Red }}>
                          {compliance}%
                        </Badge>
                        <div className="w-12">
                          <Progress value={Math.min(100, compliance)} className="h-1.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card data-testid="card-missing-submissions">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Missing Submissions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[220px]">
              {resourcesWithMissingTime.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-6 w-6 mr-2 text-emerald-500" />
                  All submissions complete
                </div>
              ) : (
                <div className="space-y-2">
                  {resourcesWithMissingTime.map((resource) => {
                    const compliance = Math.round((resource.loggedHours / resource.expectedHours) * 100);
                    return (
                      <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`row-missing-${resource.id}`}>
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(resource.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{resource.name}</div>
                          <div className="text-xs text-muted-foreground">{resource.department || "No department"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right text-xs">
                            <span className="font-medium">{resource.loggedHours}h</span>
                            <span className="text-muted-foreground"> / {resource.expectedHours}h</span>
                          </div>
                          <Badge variant={compliance >= 50 ? "secondary" : "destructive"} className="text-[10px] h-5">
                            {compliance}%
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
