import { useState, useMemo } from "react";
import { normalizeSearch } from "@/lib/utils";
import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useAllTasks } from "@/hooks/use-tasks";
import { useQuery } from "@tanstack/react-query";
import { DashboardActionBar } from "./DashboardActionBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Gauge, TrendingUp, AlertTriangle, Target, Filter, Search, X, Clock, BarChart3 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import type { Task, Resource, TimesheetEntry } from "@shared/schema";
import { format, subWeeks, startOfWeek, endOfWeek } from "date-fns";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
  Cyan: "#06b6d4",
};

const COLOR_PALETTE = [COLORS.Blue, COLORS.Purple, COLORS.Teal, COLORS.Cyan, COLORS.Green, COLORS.Yellow];

interface ResourceFilters {
  resourceId: number | null;
  department: string | null;
  skill: string | null;
  searchQuery: string;
}

export function ResourceUtilizationDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: tasks, isLoading: tasksLoading } = useAllTasks(currentOrganization?.id);
  
  const [filters, setFilters] = useState<ResourceFilters>({
    resourceId: null,
    department: null,
    skill: null,
    searchQuery: "",
  });

  const today = new Date();
  const startDate = subWeeks(startOfWeek(today, { weekStartsOn: 1 }), 8).toISOString().split('T')[0];
  const endDate = endOfWeek(today, { weekStartsOn: 1 }).toISOString().split('T')[0];

  const { data: timesheetEntries = [], isLoading: timesheetsLoading } = useQuery<TimesheetEntry[]>({
    queryKey: ['/api/timesheets/utilization', currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets?organizationId=${currentOrganization?.id}&startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const departments = useMemo(() => {
    const depts = new Set<string>();
    (resources || []).forEach(r => {
      if (r.department) depts.add(r.department);
    });
    return Array.from(depts).sort();
  }, [resources]);

  const allSkills = useMemo(() => {
    const skillSet = new Set<string>();
    (resources || []).forEach(r => {
      if (r.skills) {
        r.skills.split(",").map(s => s.trim()).filter(Boolean).forEach(skill => skillSet.add(skill));
      }
    });
    return Array.from(skillSet).sort();
  }, [resources]);

  const filteredResources = useMemo(() => {
    return (resources ?? []).filter(r => {
      if (!r.isActive) return false;
      if (r.timesheetHidden) return false;
      if (filters.resourceId && r.id !== filters.resourceId) return false;
      if (filters.department && r.department !== filters.department) return false;
      if (filters.skill) {
        const resourceSkills = r.skills?.split(",").map(s => normalizeSearch(s.trim())) || [];
        if (!resourceSkills.includes(normalizeSearch(filters.skill))) return false;
      }
      if (filters.searchQuery) {
        const query = normalizeSearch(filters.searchQuery);
        const matchesName = normalizeSearch(r.displayName).includes(query);
        const matchesEmail = normalizeSearch(r.email).includes(query);
        const matchesDept = normalizeSearch(r.department).includes(query);
        if (!matchesName && !matchesEmail && !matchesDept) return false;
      }
      return true;
    });
  }, [resources, filters]);

  const filteredTimesheets = useMemo(() => {
    const resourceIds = new Set(filteredResources.map(r => r.id));
    return timesheetEntries.filter(e => resourceIds.has(e.resourceId));
  }, [timesheetEntries, filteredResources]);

  const clearFilters = () => {
    setFilters({ resourceId: null, department: null, skill: null, searchQuery: "" });
  };

  const hasActiveFilters = filters.resourceId || filters.department || filters.skill || filters.searchQuery;

  if (resourcesLoading || tasksLoading || timesheetsLoading || projectsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = filteredResources;
  const allTasks = tasks || [];

  const parseHoursSafe = (hours: any): number => {
    const num = Number(hours || 0);
    if (!isFinite(num) || isNaN(num) || num < 0 || num > 24) return 0;
    return num;
  };

  const totalLoggedHours = filteredTimesheets.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
  const expectedWeeklyHours = activeResources.length * 40;
  const weeksInRange = 8;
  const totalExpectedHours = expectedWeeklyHours * weeksInRange;
  const overallUtilization = totalExpectedHours > 0 ? Math.round((totalLoggedHours / totalExpectedHours) * 100) : 0;

  const resourceUtilizationMap = activeResources.map(resource => {
    const resourceEntries = filteredTimesheets.filter(e => e.resourceId === resource.id);
    const hours = resourceEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    const expected = 40 * weeksInRange;
    const utilization = Math.round((hours / expected) * 100);
    
    const resourceTasks = allTasks.filter(t => t.assignee === resource.displayName && t.status !== "Completed");
    
    return {
      id: resource.id,
      name: resource.displayName,
      department: resource.department,
      skills: resource.skills,
      hours: Math.round(hours),
      expected,
      utilization,
      activeTasks: resourceTasks.length,
      status: utilization >= 90 ? 'overutilized' : utilization >= 70 ? 'optimal' : utilization >= 40 ? 'underutilized' : 'idle',
    };
  }).sort((a, b) => b.utilization - a.utilization);

  const utilizationDistribution = [
    { name: "Overutilized (90%+)", value: resourceUtilizationMap.filter(r => r.utilization >= 90).length, color: COLORS.Red },
    { name: "Optimal (70-89%)", value: resourceUtilizationMap.filter(r => r.utilization >= 70 && r.utilization < 90).length, color: COLORS.Green },
    { name: "Underutilized (40-69%)", value: resourceUtilizationMap.filter(r => r.utilization >= 40 && r.utilization < 70).length, color: COLORS.Yellow },
    { name: "Idle (<40%)", value: resourceUtilizationMap.filter(r => r.utilization < 40).length, color: COLORS.Blue },
  ].filter(d => d.value > 0);

  const weeklyTrend = Array.from({ length: 8 }, (_, i) => {
    const weekStart = subWeeks(startOfWeek(today, { weekStartsOn: 1 }), 7 - i);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    
    const weekEntries = filteredTimesheets.filter(e => {
      const entryDate = new Date(e.entryDate);
      return entryDate >= weekStart && entryDate <= weekEnd;
    });
    
    const hours = weekEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    const capacity = activeResources.length * 40;
    const utilization = capacity > 0 ? Math.round((hours / capacity) * 100) : 0;
    
    return {
      week: format(weekStart, 'MMM d'),
      hours: Math.round(hours),
      capacity,
      utilization,
    };
  });

  const departmentUtilization = activeResources.reduce((acc, resource) => {
    const dept = resource.department || "Unassigned";
    if (!acc[dept]) {
      acc[dept] = { name: dept, hours: 0, capacity: 0, resources: 0 };
    }
    const resourceEntries = filteredTimesheets.filter(e => e.resourceId === resource.id);
    const hours = resourceEntries.reduce((sum, e) => sum + parseHoursSafe(e.hours), 0);
    acc[dept].hours += hours;
    acc[dept].capacity += 40 * weeksInRange;
    acc[dept].resources += 1;
    return acc;
  }, {} as Record<string, { name: string; hours: number; capacity: number; resources: number }>);

  const departmentChartData = Object.values(departmentUtilization)
    .map(d => ({
      ...d,
      hours: Math.round(d.hours),
      utilization: d.capacity > 0 ? Math.round((d.hours / d.capacity) * 100) : 0,
    }))
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, 8);

  const handleExportCsv = () => {
    const headers = ["Name", "Department", "Skills", "Logged Hours", "Expected Hours", "Utilization %", "Active Tasks", "Status"];
    const rows = resourceUtilizationMap.map(r => [
      r.name, r.department || "", r.skills || "", r.hours, r.expected, `${r.utilization}%`, r.activeTasks, r.status
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resource_utilization.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'overutilized': return { color: COLORS.Red, label: 'Overutilized' };
      case 'optimal': return { color: COLORS.Green, label: 'Optimal' };
      case 'underutilized': return { color: COLORS.Yellow, label: 'Underutilized' };
      default: return { color: COLORS.Blue, label: 'Idle' };
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Resource Utilization</h2>
          <p className="text-sm text-muted-foreground">Track time utilization and workload distribution</p>
        </div>
        <DashboardActionBar title="Resource Utilization" dashboardType="resource-utilization" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search resources..."
              value={filters.searchQuery}
              onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
              className="pl-8 w-48 h-9"
              data-testid="input-search-resources"
            />
          </div>

          <Select
            value={filters.resourceId?.toString() || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, resourceId: value === "all" ? null : Number(value) }))}
          >
            <SelectTrigger className="w-48 h-9" data-testid="select-resource">
              <SelectValue placeholder="All Resources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Resources</SelectItem>
              {(resources || []).filter(r => r.isActive).map(r => (
                <SelectItem key={r.id} value={r.id.toString()}>{r.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.department || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, department: value === "all" ? null : value }))}
          >
            <SelectTrigger className="w-40 h-9" data-testid="select-department">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.skill || "all"}
            onValueChange={(value) => setFilters(prev => ({ ...prev, skill: value === "all" ? null : value }))}
          >
            <SelectTrigger className="w-40 h-9" data-testid="select-skill">
              <SelectValue placeholder="All Skills" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Skills</SelectItem>
              {allSkills.map(skill => (
                <SelectItem key={skill} value={skill}>{skill}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              data-testid="button-clear-filters"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-utilization">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: `${overallUtilization >= 80 ? COLORS.Green : overallUtilization >= 60 ? COLORS.Yellow : COLORS.Red}15` }}>
              <Gauge className="h-3.5 w-3.5" style={{ color: overallUtilization >= 80 ? COLORS.Green : overallUtilization >= 60 ? COLORS.Yellow : COLORS.Red }} />
            </div>
            <span className="text-xs text-muted-foreground">Utilization</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: overallUtilization >= 80 ? COLORS.Green : overallUtilization >= 60 ? COLORS.Yellow : COLORS.Red }}>{overallUtilization}%</div>
          <Progress value={overallUtilization} className="h-1.5 mt-1" />
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-logged-hours">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Logged Hours</span>
          </div>
          <div className="text-2xl font-bold">{Math.round(totalLoggedHours)}</div>
          <div className="text-xs text-muted-foreground">last 8 weeks</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-optimal">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <Target className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Optimal</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{resourceUtilizationMap.filter(r => r.status === 'optimal').length}</div>
          <div className="text-xs text-muted-foreground">70-89% utilized</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-at-risk">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">At Risk</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{resourceUtilizationMap.filter(r => r.status === 'overutilized' || r.status === 'idle').length}</div>
          <div className="text-xs text-muted-foreground">needs attention</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="chart-weekly-trend">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              8-Week Utilization Trend
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
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="hours" stroke={COLORS.Blue} fill={COLORS.Blue} fillOpacity={0.2} name="Logged Hours" />
                  <Line type="monotone" dataKey="capacity" stroke={COLORS.Green} strokeDasharray="5 5" dot={false} name="Capacity" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-utilization-distribution">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={utilizationDistribution} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={40} 
                    outerRadius={65} 
                    paddingAngle={3} 
                    dataKey="value"
                  >
                    {utilizationDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '9px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="chart-department-utilization">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Utilization by Department
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  formatter={(value: number, name: string) => [name === 'utilization' ? `${value}%` : `${value}h`, name === 'utilization' ? 'Utilization' : 'Hours']}
                />
                <Bar dataKey="utilization" fill={COLORS.Purple} radius={[4, 4, 0, 0]} name="Utilization %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="table-resource-utilization">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Resource Utilization Details</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {resourceUtilizationMap.map((resource) => {
                const statusBadge = getStatusBadge(resource.status);
                return (
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
                        <div className="text-xs text-muted-foreground">{resource.activeTasks} tasks</div>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] h-5 min-w-[80px] justify-center" 
                        style={{ backgroundColor: `${statusBadge.color}15`, color: statusBadge.color }}
                      >
                        {statusBadge.label}
                      </Badge>
                      <div className="text-right min-w-[40px]">
                        <div className="text-xs font-medium">{resource.utilization}%</div>
                      </div>
                      <div className="w-16">
                        <Progress value={Math.min(100, resource.utilization)} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
              {resourceUtilizationMap.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No resources match filters</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
