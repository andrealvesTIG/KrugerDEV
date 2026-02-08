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
import { Loader2, Clock, Folder, TrendingUp, Users, BarChart3, Target, Eye } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, Treemap } from "recharts";
import type { TimesheetEntry, Project } from "@shared/schema";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

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

export function TimesheetProjectHoursDashboard() {
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

  const filteredEntries = useMemo(() => {
    return (timesheetEntries ?? []).filter(e => {
      if (filters.resourceId && e.resourceId !== filters.resourceId) return false;
      if (filters.projectId && e.projectId !== filters.projectId) return false;
      if (filters.portfolioId) {
        const project = projects.find(p => p.id === e.projectId);
        if (!project || project.portfolioId !== filters.portfolioId) return false;
      }
      return true;
    });
  }, [timesheetEntries, filters, projects]);

  if (resourcesLoading || timesheetsLoading || projectsLoading || portfoliosLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const entries = filteredEntries;

  const parseHoursSafe = (hours: any): number => {
    const num = Number(hours || 0);
    if (!isFinite(num) || isNaN(num) || num < 0 || num > 24) return 0;
    return num;
  };

  const totalHours = entries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const projectsWithTime = new Set(entries.map(e => e.projectId)).size;
  const resourcesLogging = new Set(entries.map(e => e.resourceId)).size;
  const avgHoursPerProject = projectsWithTime > 0 ? Math.round(totalHours / projectsWithTime) : 0;

  const projectHoursMap = entries.reduce((acc, entry) => {
    const projectId = entry.projectId;
    if (!acc[projectId]) {
      const project = projects.find(p => p.id === projectId);
      acc[projectId] = {
        id: projectId,
        name: project?.name || `Project ${projectId}`,
        status: project?.status || 'Unknown',
        portfolio: portfolios?.find(pf => pf.id === project?.portfolioId)?.name || 'No Portfolio',
        hours: 0,
        entries: 0,
        resources: new Set<number>(),
      };
    }
    acc[projectId].hours += parseHoursSafe(entry.hours);
    acc[projectId].entries += 1;
    acc[projectId].resources.add(entry.resourceId);
    return acc;
  }, {} as Record<number, { id: number; name: string; status: string; portfolio: string; hours: number; entries: number; resources: Set<number> }>);

  const projectHoursList = Object.values(projectHoursMap)
    .map(p => ({ ...p, resourceCount: p.resources.size }))
    .sort((a, b) => b.hours - a.hours);

  const top10Projects = projectHoursList.slice(0, 10);
  const otherHours = projectHoursList.slice(10).reduce((sum, p) => sum + p.hours, 0);

  const chartData = [
    ...top10Projects.map((p, i) => ({
      name: p.name.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
      hours: Math.round(p.hours),
      fill: COLOR_PALETTE[i % COLOR_PALETTE.length],
    })),
    ...(otherHours > 0 ? [{ name: 'Other', hours: Math.round(otherHours), fill: '#94a3b8' }] : [])
  ];

  const pieData = chartData.map(d => ({ name: d.name, value: d.hours, fill: d.fill }));

  const portfolioHours = Object.values(projectHoursMap).reduce((acc, project) => {
    if (!acc[project.portfolio]) {
      acc[project.portfolio] = { name: project.portfolio, hours: 0, projects: 0 };
    }
    acc[project.portfolio].hours += project.hours;
    acc[project.portfolio].projects += 1;
    return acc;
  }, {} as Record<string, { name: string; hours: number; projects: number }>);

  const portfolioChartData = Object.values(portfolioHours)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8)
    .map((p, i) => ({ ...p, hours: Math.round(p.hours), fill: COLOR_PALETTE[i % COLOR_PALETTE.length] }));

  const handleExportCsv = () => {
    const headers = ["Project", "Portfolio", "Status", "Total Hours", "Entries", "Resources"];
    const rows = projectHoursList.map(p => [
      p.name, p.portfolio, p.status, Math.round(p.hours), p.entries, p.resourceCount
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project_hours_${format(today, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold">Project Hours</h2>
            <p className="text-sm text-muted-foreground">
              Time distribution across projects ({format(rangeStart, 'MMM d')} - {format(rangeEnd, 'MMM d, yyyy')})
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
          <DashboardActionBar title="Project Hours" dashboardType="timesheet-project" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
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
        <Card className="p-3 hover-elevate" data-testid="kpi-total-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Hours</span>
          </div>
          <div className="text-2xl font-bold">{Math.round(totalHours)}</div>
          <div className="text-xs text-muted-foreground">{entries.length} entries</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-projects">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <Folder className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Projects</span>
          </div>
          <div className="text-2xl font-bold">{projectsWithTime}</div>
          <div className="text-xs text-muted-foreground">with logged time</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-resources">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-teal-500/10">
              <Users className="h-3.5 w-3.5 text-teal-500" />
            </div>
            <span className="text-xs text-muted-foreground">Resources</span>
          </div>
          <div className="text-2xl font-bold">{resourcesLogging}</div>
          <div className="text-xs text-muted-foreground">logging time</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-avg-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <Target className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Avg/Project</span>
          </div>
          <div className="text-2xl font-bold">{avgHoursPerProject}h</div>
          <div className="text-xs text-muted-foreground">average hours</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="chart-project-hours">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Hours by Project
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={75} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number) => [`${value}h`, 'Hours']}
                  />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-project-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Hours Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={pieData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={50} 
                    outerRadius={80} 
                    paddingAngle={2} 
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number) => [`${value}h`, 'Hours']}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="chart-portfolio-hours">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Folder className="h-4 w-4 text-muted-foreground" />
            Hours by Portfolio
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={portfolioChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  formatter={(value: number) => [`${value}h`, 'Hours']}
                />
                <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                  {portfolioChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="table-project-details">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {projectHoursList.map((project, index) => {
                const percentage = totalHours > 0 ? Math.round((project.hours / totalHours) * 100) : 0;
                return (
                  <div key={project.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`row-project-${project.id}`}>
                    <div 
                      className="w-1 h-10 rounded-full" 
                      style={{ backgroundColor: COLOR_PALETTE[index % COLOR_PALETTE.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{project.name}</div>
                      <div className="text-xs text-muted-foreground">{project.portfolio}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">{project.status}</Badge>
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <div className="text-sm font-medium">{Math.round(project.hours)}h</div>
                        <div className="text-xs text-muted-foreground">{project.resourceCount} resources</div>
                      </div>
                      <div className="w-16">
                        <div className="text-xs text-right mb-1">{percentage}%</div>
                        <Progress value={percentage} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
              {projectHoursList.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No project hours found</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
