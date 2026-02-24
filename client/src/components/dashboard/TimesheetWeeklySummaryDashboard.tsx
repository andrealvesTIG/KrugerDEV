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
import { Progress } from "@/components/ui/progress";
import { Loader2, Clock, Calendar, TrendingUp, TrendingDown, CheckCircle2, AlertCircle, ArrowUp, ArrowDown, Minus, Eye } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line, Area, AreaChart } from "recharts";
import type { TimesheetEntry } from "@shared/schema";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, differenceInDays } from "date-fns";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
  Cyan: "#06b6d4",
};

export function TimesheetWeeklySummaryDashboard() {
  const { currentOrganization, memberships } = useOrganization();
  const { user } = useAuth();
  const { data: currentResource } = useCurrentUserResource(currentOrganization?.id ?? null, user?.id);
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0);
  
  // Determine if user can view team data
  const isSuperAdmin = user?.role === 'super_admin';
  const currentMembership = memberships.find(m => m.organizationId === currentOrganization?.id);
  const isOrgAdmin = currentMembership?.role === 'org_admin' || currentMembership?.role === 'owner';
  const isApprover = currentResource?.isApprover === true;
  const canViewTeam = isSuperAdmin || isOrgAdmin || isApprover;

  const today = new Date();
  const currentWeekStart = startOfWeek(addWeeks(today, selectedWeekOffset), { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(addWeeks(today, selectedWeekOffset), { weekStartsOn: 1 });
  
  const fetchStartDate = subWeeks(currentWeekStart, 4).toISOString().split('T')[0];
  const fetchEndDate = currentWeekEnd.toISOString().split('T')[0];

  const { data: teamEntries = [], isLoading: teamLoading } = useTeamTimesheetEntries(
    canViewTeam ? (currentOrganization?.id ?? null) : null,
    fetchStartDate,
    fetchEndDate
  );
  const { data: personalEntries = [], isLoading: personalLoading } = useTimesheetEntries(
    canViewTeam ? undefined : user?.id,
    canViewTeam ? null : (currentOrganization?.id ?? null),
    fetchStartDate,
    fetchEndDate
  );
  const timesheetEntries = canViewTeam ? teamEntries : personalEntries;
  const timesheetsLoading = canViewTeam ? teamLoading : personalLoading;

  const filteredResources = useMemo(() => {
    return (resources ?? []).filter(r => {
      if (!r.isActive) return false;
      if (r.timesheetHidden) return false;
      if (filters.resourceId && r.id !== filters.resourceId) return false;
      return true;
    });
  }, [resources, filters]);

  const filteredEntries = useMemo(() => {
    const hiddenIds = new Set((resources ?? []).filter(r => r.timesheetHidden).map(r => r.id));
    return (timesheetEntries ?? []).filter(e => {
      if (hiddenIds.has(e.resourceId)) return false;
      if (filters.resourceId && e.resourceId !== filters.resourceId) return false;
      if (filters.projectId && e.projectId !== filters.projectId) return false;
      return true;
    });
  }, [timesheetEntries, filters, resources]);

  if (resourcesLoading || timesheetsLoading || projectsLoading || portfoliosLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = filteredResources;
  const entries = filteredEntries;

  const parseHoursSafe = (hours: any): number => {
    const num = Number(hours || 0);
    if (!isFinite(num) || isNaN(num) || num < 0 || num > 24) return 0;
    return num;
  };

  const getWeekEntries = (weekStart: Date, weekEnd: Date) => {
    return entries.filter(e => {
      const entryDate = new Date(e.entryDate);
      return entryDate >= weekStart && entryDate <= weekEnd;
    });
  };

  const currentWeekEntries = getWeekEntries(currentWeekStart, currentWeekEnd);
  const previousWeekEntries = getWeekEntries(subWeeks(currentWeekStart, 1), subWeeks(currentWeekEnd, 1));

  const currentWeekHours = currentWeekEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const previousWeekHours = previousWeekEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const hoursChange = previousWeekHours > 0 ? ((currentWeekHours - previousWeekHours) / previousWeekHours * 100) : 0;

  const expectedWeeklyHours = activeResources.length * 40;
  const complianceRate = expectedWeeklyHours > 0 ? Math.round((currentWeekHours / expectedWeeklyHours) * 100) : 0;

  const currentWeekSubmitted = currentWeekEntries.filter(e => e.status === "Submitted" || e.status === "Approved").length;
  const currentWeekApproved = currentWeekEntries.filter(e => e.status === "Approved").length;

  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: currentWeekEnd });
  const dailyBreakdown = weekDays.map(day => {
    const dayEntries = currentWeekEntries.filter(e => {
      const entryDate = new Date(e.entryDate);
      return entryDate.toDateString() === day.toDateString();
    });
    const hours = dayEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    return {
      day: format(day, 'EEE'),
      date: format(day, 'MMM d'),
      hours: Math.round(hours * 10) / 10,
      entries: dayEntries.length,
    };
  });

  const weeklyTrend = Array.from({ length: 5 }, (_, i) => {
    const weekStart = subWeeks(currentWeekStart, 4 - i);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekEntries = getWeekEntries(weekStart, weekEnd);
    const hours = weekEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    return {
      week: format(weekStart, 'MMM d'),
      hours: Math.round(hours),
      target: activeResources.length * 40,
    };
  });

  const resourceWeeklyHours = activeResources.map(r => {
    const resourceEntries = currentWeekEntries.filter(e => e.resourceId === r.id);
    const hours = resourceEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    const prevResourceEntries = previousWeekEntries.filter(e => e.resourceId === r.id);
    const prevHours = prevResourceEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    return {
      id: r.id,
      name: r.displayName,
      department: r.department,
      hours: Math.round(hours * 10) / 10,
      prevHours: Math.round(prevHours * 10) / 10,
      change: prevHours > 0 ? Math.round((hours - prevHours) / prevHours * 100) : 0,
      compliance: Math.round((hours / 40) * 100),
    };
  }).sort((a, b) => b.hours - a.hours);

  const handleExportCsv = () => {
    const headers = ["Resource", "Department", "This Week Hours", "Last Week Hours", "Change %", "Compliance %"];
    const rows = resourceWeeklyHours.map(r => [
      r.name, r.department || "", r.hours, r.prevHours, `${r.change}%`, `${r.compliance}%`
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weekly_summary_${format(currentWeekStart, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold">Weekly Summary</h2>
            <p className="text-sm text-muted-foreground">
              Week of {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d, yyyy')}
            </p>
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedWeekOffset(prev => prev - 1)}
            className="p-2 rounded-md hover:bg-muted"
            data-testid="button-prev-week"
          >
            <ArrowDown className="h-4 w-4 rotate-90" />
          </button>
          <button
            onClick={() => setSelectedWeekOffset(0)}
            className="px-3 py-1 text-sm rounded-md hover:bg-muted"
            disabled={selectedWeekOffset === 0}
            data-testid="button-current-week"
          >
            Current Week
          </button>
          <button
            onClick={() => setSelectedWeekOffset(prev => prev + 1)}
            className="p-2 rounded-md hover:bg-muted"
            disabled={selectedWeekOffset >= 0}
            data-testid="button-next-week"
          >
            <ArrowUp className="h-4 w-4 rotate-90" />
          </button>
          <DashboardActionBar title="Weekly Summary" dashboardType="timesheet-weekly" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
        </div>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-week-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Week Hours</span>
          </div>
          <div className="text-2xl font-bold">{Math.round(currentWeekHours)}</div>
          <div className="flex items-center gap-1 text-xs">
            {hoursChange > 0 ? (
              <TrendingUp className="h-3 w-3 text-emerald-500" />
            ) : hoursChange < 0 ? (
              <TrendingDown className="h-3 w-3 text-rose-500" />
            ) : (
              <Minus className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={hoursChange > 0 ? "text-emerald-600" : hoursChange < 0 ? "text-rose-600" : "text-muted-foreground"}>
              {hoursChange > 0 ? "+" : ""}{Math.round(hoursChange)}% vs last week
            </span>
          </div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-compliance">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: `${complianceRate >= 80 ? COLORS.Green : complianceRate >= 60 ? COLORS.Yellow : COLORS.Red}15` }}>
              <Calendar className="h-3.5 w-3.5" style={{ color: complianceRate >= 80 ? COLORS.Green : complianceRate >= 60 ? COLORS.Yellow : COLORS.Red }} />
            </div>
            <span className="text-xs text-muted-foreground">Compliance</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: complianceRate >= 80 ? COLORS.Green : complianceRate >= 60 ? COLORS.Yellow : COLORS.Red }}>{complianceRate}%</div>
          <Progress value={complianceRate} className="h-1.5 mt-1" />
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-submitted">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <CheckCircle2 className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Submitted</span>
          </div>
          <div className="text-2xl font-bold">{currentWeekSubmitted}</div>
          <div className="text-xs text-muted-foreground">{currentWeekApproved} approved</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-resources">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-teal-500/10">
              <AlertCircle className="h-3.5 w-3.5 text-teal-500" />
            </div>
            <span className="text-xs text-muted-foreground">Resources</span>
          </div>
          <div className="text-2xl font-bold">{activeResources.length}</div>
          <div className="text-xs text-muted-foreground">tracking time</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-daily-breakdown">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Daily Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number) => [`${value}h`, 'Hours']}
                  />
                  <Bar dataKey="hours" fill={COLORS.Blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-weekly-trend">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              5-Week Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="hours" stroke={COLORS.Blue} fill={COLORS.Blue} fillOpacity={0.2} />
                  <Line type="monotone" dataKey="target" stroke={COLORS.Green} strokeDasharray="5 5" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="table-resource-hours">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Resource Weekly Hours</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {resourceWeeklyHours.map((resource) => (
                <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`row-resource-${resource.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{resource.name}</div>
                    <div className="text-xs text-muted-foreground">{resource.department || "No department"}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">{resource.hours}h</div>
                      <div className="text-xs text-muted-foreground">prev: {resource.prevHours}h</div>
                    </div>
                    <div className="flex items-center gap-1 min-w-[60px]">
                      {resource.change > 0 ? (
                        <ArrowUp className="h-3 w-3 text-emerald-500" />
                      ) : resource.change < 0 ? (
                        <ArrowDown className="h-3 w-3 text-rose-500" />
                      ) : null}
                      <span className={`text-xs ${resource.change > 0 ? "text-emerald-600" : resource.change < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                        {resource.change > 0 ? "+" : ""}{resource.change}%
                      </span>
                    </div>
                    <Badge 
                      variant="secondary" 
                      className="text-[10px] h-5 min-w-[45px] justify-center" 
                      style={{ 
                        backgroundColor: `${resource.compliance >= 80 ? COLORS.Green : resource.compliance >= 50 ? COLORS.Yellow : COLORS.Red}15`, 
                        color: resource.compliance >= 80 ? COLORS.Green : resource.compliance >= 50 ? COLORS.Yellow : COLORS.Red 
                      }}
                    >
                      {resource.compliance}%
                    </Badge>
                    <div className="w-16">
                      <Progress value={Math.min(100, resource.compliance)} className="h-1.5" />
                    </div>
                  </div>
                </div>
              ))}
              {resourceWeeklyHours.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No resources found</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
