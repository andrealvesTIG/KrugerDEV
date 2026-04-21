import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentUserResource, useTeamTimesheetEntries, useTimesheetEntries } from "@/hooks/use-timesheets";
import { DashboardActionBar } from "./DashboardActionBar";
import { DashboardFilters, getDefaultFilters, type DashboardFilterState } from "./DashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Clock, Users, TrendingUp, Target, BarChart3, AlertCircle, CheckCircle2, Eye } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, isWeekend } from "date-fns";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
  Cyan: "#06b6d4",
  Indigo: "#6366f1",
  Pink: "#ec4899",
  Orange: "#f97316",
};

const COLOR_PALETTE = [COLORS.Blue, COLORS.Purple, COLORS.Teal, COLORS.Cyan, COLORS.Indigo, COLORS.Pink, COLORS.Orange, COLORS.Green, COLORS.Yellow];

export function TimesheetResourceHoursDashboard() {
  const { currentOrganization, memberships } = useOrganization();
  const { user } = useAuth();
  const { data: currentResource } = useCurrentUserResource(currentOrganization?.id ?? null, user?.id);
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: portfolios, isLoading: portfoliosLoading } = usePortfolios(currentOrganization?.id);
  const [filters, setFilters] = useState<DashboardFilterState>(getDefaultFilters());
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year'>('month');
  
  // Determine if user can view team data
  const isSuperAdmin = user?.role === 'super_admin';
  const currentMembership = memberships.find(m => m.organizationId === currentOrganization?.id);
  const isOrgAdmin = currentMembership?.role === 'org_admin' || currentMembership?.role === 'owner';
  const isApprover = currentResource?.isApprover === true;
  const canViewTeam = isSuperAdmin || isOrgAdmin || isApprover;

  const today = new Date();
  const getDateRange = () => {
    switch (dateRange) {
      case 'month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'quarter':
        return { start: subMonths(startOfMonth(today), 2), end: endOfMonth(today) };
      case 'year':
        return { start: subMonths(startOfMonth(today), 11), end: endOfMonth(today) };
    }
  };
  
  const { start: rangeStart, end: rangeEnd } = getDateRange();
  const startDate = rangeStart.toISOString().split('T')[0];
  const endDate = rangeEnd.toISOString().split('T')[0];


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

  const projects = projectsData || [];

  const filteredResources = useMemo(() => {
    return (resources ?? []).filter(r => {
      if (!r.isActive) return false;
      if (r.timesheetHidden) return false;
      if (filters.resourceId && r.id !== filters.resourceId) return false;
      return true;
    });
  }, [resources, filters]);

  const hiddenResourceIds = useMemo(() => {
    return new Set((resources ?? []).filter(r => r.timesheetHidden).map(r => r.id));
  }, [resources]);

  const filteredEntries = useMemo(() => {
    return (timesheetEntries ?? []).filter(e => {
      if (hiddenResourceIds.has(e.resourceId)) return false;
      if (filters.resourceId && e.resourceId !== filters.resourceId) return false;
      if (filters.projectId && e.projectId !== filters.projectId) return false;
      if (filters.portfolioId !== null) {
        const project = projects.find(p => p.id === e.projectId);
        if (filters.portfolioId === -1) {
          if (!project || project.portfolioId) return false;
        } else {
          if (!project || project.portfolioId !== filters.portfolioId) return false;
        }
      }
      return true;
    });
  }, [timesheetEntries, filters, projects, hiddenResourceIds]);

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

  const parseRate = (v: any): number => {
    const num = Number(v ?? 0);
    if (!isFinite(num) || isNaN(num) || num < 0) return 0;
    return num;
  };

  // Working days (Mon–Fri) in the selected date range
  const workingDaysInRange = (() => {
    let count = 0;
    const d = new Date(rangeStart);
    d.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd);
    end.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (!isWeekend(d)) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  })();

  // Per-resource expected hours over the selected range:
  // dailyCapacity = (weeklyCapacity / 5) * (availability%) * actual working days in the date range.
  const expectedHoursForResource = (r: any): number => {
    const weekly = parseRate(r.weeklyCapacity ?? 40) || 40;
    const avail = ((r.availability ?? 100) as number) / 100;
    return (weekly / 5) * avail * workingDaysInRange;
  };

  const totalHours = entries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const totalExpectedHours = activeResources.reduce((s, r) => s + expectedHoursForResource(r), 0);
  const overallCompliance = totalExpectedHours > 0 ? Math.round((totalHours / totalExpectedHours) * 100) : 0;
  const avgHoursPerResource = activeResources.length > 0 ? Math.round(totalHours / activeResources.length) : 0;

  const resourceHoursMap = activeResources.map(resource => {
    const resourceEntries = entries.filter(e => e.resourceId === resource.id);
    const hours = resourceEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    const projectsWorked = new Set(resourceEntries.map(e => e.projectId)).size;
    const approvedEntries = resourceEntries.filter(e => e.status === "Approved").length;
    const pendingEntries = resourceEntries.filter(e => e.status === "Draft" || e.status === "Submitted").length;
    const expected = expectedHoursForResource(resource);

    return {
      id: resource.id,
      name: resource.displayName,
      email: resource.email,
      department: resource.department,
      hours: Math.round(hours * 10) / 10,
      expected: Math.round(expected * 10) / 10,
      compliance: expected > 0 ? Math.round((hours / expected) * 100) : 0,
      projectsWorked,
      entries: resourceEntries.length,
      approved: approvedEntries,
      pending: pendingEntries,
    };
  }).sort((a, b) => b.hours - a.hours);

  const complianceDistribution = [
    { name: 'Excellent (90%+)', value: resourceHoursMap.filter(r => r.compliance >= 90).length, color: COLORS.Green },
    { name: 'Good (70-89%)', value: resourceHoursMap.filter(r => r.compliance >= 70 && r.compliance < 90).length, color: COLORS.Blue },
    { name: 'Fair (50-69%)', value: resourceHoursMap.filter(r => r.compliance >= 50 && r.compliance < 70).length, color: COLORS.Yellow },
    { name: 'Low (<50%)', value: resourceHoursMap.filter(r => r.compliance < 50).length, color: COLORS.Red },
  ].filter(d => d.value > 0);

  const departmentHours = resourceHoursMap.reduce((acc, r) => {
    const dept = r.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = { name: dept, hours: 0, resources: 0, expected: 0 };
    }
    acc[dept].hours += r.hours;
    acc[dept].expected += r.expected;
    acc[dept].resources += 1;
    return acc;
  }, {} as Record<string, { name: string; hours: number; resources: number; expected: number }>);

  const departmentChartData = Object.values(departmentHours)
    .sort((a, b) => b.hours - a.hours)
    .map((d, i) => ({
      ...d,
      hours: Math.round(d.hours),
      compliance: Math.round((d.hours / d.expected) * 100),
      fill: COLOR_PALETTE[i % COLOR_PALETTE.length],
    }));

  const top10Resources = resourceHoursMap.slice(0, 10);
  const topPerformersData = top10Resources.map((r, i) => ({
    name: r.name.split(' ')[0],
    hours: r.hours,
    fill: COLOR_PALETTE[i % COLOR_PALETTE.length],
  }));

  const lowComplianceResources = resourceHoursMap.filter(r => r.compliance < 70).slice(0, 10);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  const handleExportCsv = () => {
    const headers = ["Resource", "Department", "Hours", "Expected", "Compliance %", "Projects", "Entries", "Approved", "Pending"];
    const rows = resourceHoursMap.map(r => [
      r.name, r.department || "", r.hours, r.expected, `${r.compliance}%`, r.projectsWorked, r.entries, r.approved, r.pending
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resource_hours_${format(today, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold">Resource Hours vs Goals</h2>
            <p className="text-sm text-muted-foreground">
              Time logged by resources against targets ({format(rangeStart, 'MMM d')} - {format(rangeEnd, 'MMM d, yyyy')})
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
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['month', 'quarter', 'year'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1 text-xs capitalize ${dateRange === range ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                data-testid={`button-range-${range}`}
              >
                {range}
              </button>
            ))}
          </div>
          <DashboardActionBar title="Resource Hours" dashboardType="timesheet-resource" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
        </div>
      </div>

      <DashboardFilters
        portfolios={portfolios || []}
        projects={filters.portfolioId !== null
          ? (projectsData || []).filter(p => filters.portfolioId === -1 ? !p.portfolioId : p.portfolioId === filters.portfolioId) 
          : (projectsData || [])}
        resources={resources || []}
        filters={filters}
        onFiltersChange={setFilters}
        showHealth={false}
        showPriority={false}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-total-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Hours</span>
          </div>
          <div className="text-2xl font-bold">{Math.round(totalHours)}</div>
          <div className="text-xs text-muted-foreground">of {Math.round(totalExpectedHours)} expected</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-compliance">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: `${overallCompliance >= 80 ? COLORS.Green : overallCompliance >= 60 ? COLORS.Yellow : COLORS.Red}15` }}>
              <Target className="h-3.5 w-3.5" style={{ color: overallCompliance >= 80 ? COLORS.Green : overallCompliance >= 60 ? COLORS.Yellow : COLORS.Red }} />
            </div>
            <span className="text-xs text-muted-foreground">Compliance</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: overallCompliance >= 80 ? COLORS.Green : overallCompliance >= 60 ? COLORS.Yellow : COLORS.Red }}>{overallCompliance}%</div>
          <Progress value={overallCompliance} className="h-1.5 mt-1" />
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-resources">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Users className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Resources</span>
          </div>
          <div className="text-2xl font-bold">{activeResources.length}</div>
          <div className="text-xs text-muted-foreground">active team members</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-avg-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-teal-500/10">
              <TrendingUp className="h-3.5 w-3.5 text-teal-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg Hours</span>
          </div>
          <div className="text-2xl font-bold">{avgHoursPerResource}h</div>
          <div className="text-xs text-muted-foreground">per resource</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-testid="chart-top-resources">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPerformersData} layout="vertical" margin={{ left: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={45} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number) => [`${value}h`, 'Hours']}
                  />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {topPerformersData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-compliance-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Compliance Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={complianceDistribution} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={45} 
                    outerRadius={70} 
                    paddingAngle={3} 
                    dataKey="value"
                  >
                    {complianceDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number) => [`${value} resources`, 'Count']}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-department-hours">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              By Department
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number, name: string) => [name === 'hours' ? `${value}h` : `${value}%`, name === 'hours' ? 'Hours' : 'Compliance']}
                  />
                  <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                    {departmentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="table-all-resources">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              All Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[280px]">
              <div className="space-y-2">
                {resourceHoursMap.map((resource) => (
                  <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`row-resource-${resource.id}`}>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{getInitials(resource.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{resource.name}</div>
                      <div className="text-xs text-muted-foreground">{resource.department || "No department"}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-medium">{resource.hours}h</div>
                        <div className="text-xs text-muted-foreground">{resource.projectsWorked} projects</div>
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
                      <div className="w-14">
                        <Progress value={Math.min(100, resource.compliance)} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                ))}
                {resourceHoursMap.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">No resources found</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card data-testid="table-low-compliance">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Needs Attention (Below 70%)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="h-[280px]">
              {lowComplianceResources.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm py-12">
                  <CheckCircle2 className="h-6 w-6 mr-2 text-emerald-500" />
                  All resources meeting compliance
                </div>
              ) : (
                <div className="space-y-2">
                  {lowComplianceResources.map((resource) => (
                    <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`row-low-${resource.id}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{getInitials(resource.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{resource.name}</div>
                        <div className="text-xs text-muted-foreground">{resource.department || "No department"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-xs">
                          <span className="font-medium">{resource.hours}h</span>
                          <span className="text-muted-foreground"> / {resource.expected}h</span>
                        </div>
                        <Badge 
                          variant={resource.compliance >= 50 ? "secondary" : "destructive"} 
                          className="text-[10px] h-5 min-w-[45px] justify-center"
                        >
                          {resource.compliance}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
