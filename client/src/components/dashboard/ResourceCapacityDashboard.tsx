import { useState, useMemo } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
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
import { Loader2, Users, UserCheck, Calendar, TrendingUp, AlertTriangle, Filter, Search, X, Clock, BarChart3, ArrowUp, ArrowDown } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line, Cell } from "recharts";
import type { Task, Resource, TaskResourceAssignment } from "@shared/schema";
import { format, addWeeks, startOfWeek, endOfWeek, differenceInDays, parseISO } from "date-fns";

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

export function ResourceCapacityDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: projectsData, isLoading: projectsLoading } = useProjects(currentOrganization?.id);
  const { data: tasks, isLoading: tasksLoading } = useAllTasks();
  
  const [filters, setFilters] = useState<ResourceFilters>({
    resourceId: null,
    department: null,
    skill: null,
    searchQuery: "",
  });
  
  const [planningHorizon, setPlanningHorizon] = useState<'4' | '8' | '12'>('8');

  const { data: allAssignments = [], isLoading: assignmentsLoading } = useQuery<(TaskResourceAssignment & { resource: Resource })[]>({
    queryKey: ['/api/resource-assignments/all', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/resource-assignments?organizationId=${currentOrganization?.id}`);
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
      if (filters.resourceId && r.id !== filters.resourceId) return false;
      if (filters.department && r.department !== filters.department) return false;
      if (filters.skill) {
        const resourceSkills = r.skills?.split(",").map(s => s.trim().toLowerCase()) || [];
        if (!resourceSkills.includes(filters.skill.toLowerCase())) return false;
      }
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesName = r.displayName.toLowerCase().includes(query);
        const matchesEmail = r.email?.toLowerCase().includes(query);
        const matchesDept = r.department?.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesDept) return false;
      }
      return true;
    });
  }, [resources, filters]);

  const clearFilters = () => {
    setFilters({ resourceId: null, department: null, skill: null, searchQuery: "" });
  };

  const hasActiveFilters = filters.resourceId || filters.department || filters.skill || filters.searchQuery;

  if (resourcesLoading || tasksLoading || assignmentsLoading || projectsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = filteredResources;
  const allTasks = (tasks || []).filter(t => t.status !== "Completed");
  const weeks = parseInt(planningHorizon);

  const today = new Date();
  const weeklyCapacityData = Array.from({ length: weeks }, (_, i) => {
    const weekStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    
    const weekTasks = allTasks.filter(t => {
      if (!t.startDate || !t.endDate) return false;
      const taskStart = parseISO(t.startDate);
      const taskEnd = parseISO(t.endDate);
      return taskStart <= weekEnd && taskEnd >= weekStart;
    });
    
    const resourceIdsWithTasks = new Set<number>();
    weekTasks.forEach(task => {
      const assignments = allAssignments.filter(a => a.taskId === task.id);
      assignments.forEach(a => {
        if (activeResources.some(r => r.id === a.resourceId)) {
          resourceIdsWithTasks.add(a.resourceId);
        }
      });
      const assignedResource = activeResources.find(r => r.displayName === task.assignee);
      if (assignedResource) {
        resourceIdsWithTasks.add(assignedResource.id);
      }
    });
    
    const demand = resourceIdsWithTasks.size * 40;
    const capacity = activeResources.length * 40;
    const available = Math.max(0, capacity - demand);
    
    return {
      week: `W${i + 1}`,
      weekLabel: format(weekStart, 'MMM d'),
      demand,
      capacity,
      available,
      utilization: capacity > 0 ? Math.round((demand / capacity) * 100) : 0,
    };
  });

  const totalCapacity = activeResources.length * 40 * weeks;
  const totalDemand = weeklyCapacityData.reduce((sum, w) => sum + w.demand, 0);
  const totalAvailable = totalCapacity - totalDemand;
  const avgUtilization = Math.round((totalDemand / totalCapacity) * 100) || 0;

  const upcomingDeadlines = allTasks.filter(t => {
    if (!t.endDate) return false;
    const endDate = parseISO(t.endDate);
    const daysUntil = differenceInDays(endDate, today);
    return daysUntil >= 0 && daysUntil <= 14;
  }).length;

  const overallocatedWeeks = weeklyCapacityData.filter(w => w.utilization > 100).length;

  const resourceCapacityMap = activeResources.map(resource => {
    const resourceTasks = allTasks.filter(t => {
      const isAssigned = t.assignee === resource.displayName;
      const hasAssignment = allAssignments.some(a => a.resourceId === resource.id && a.taskId === t.id);
      return isAssigned || hasAssignment;
    });
    
    const totalTaskDays = resourceTasks.reduce((sum, t) => {
      if (!t.startDate || !t.endDate) return sum;
      const taskStart = parseISO(t.startDate);
      const taskEnd = parseISO(t.endDate);
      const days = Math.max(0, differenceInDays(taskEnd, taskStart) + 1);
      return sum + days;
    }, 0);
    
    const capacityDays = weeks * 5;
    const demandPercent = capacityDays > 0 ? Math.round((totalTaskDays / capacityDays) * 100) : 0;
    
    return {
      id: resource.id,
      name: resource.displayName,
      department: resource.department,
      skills: resource.skills,
      activeTasks: resourceTasks.length,
      taskDays: totalTaskDays,
      capacityDays,
      demandPercent,
      status: demandPercent > 100 ? 'overallocated' : demandPercent > 80 ? 'high' : demandPercent > 40 ? 'balanced' : 'available',
    };
  }).sort((a, b) => b.demandPercent - a.demandPercent);

  const departmentCapacity = activeResources.reduce((acc, resource) => {
    const dept = resource.department || "Unassigned";
    if (!acc[dept]) {
      acc[dept] = { name: dept, resources: 0, capacity: 0, demand: 0 };
    }
    acc[dept].resources += 1;
    acc[dept].capacity += weeks * 5;
    
    const resourceTasks = allTasks.filter(t => t.assignee === resource.displayName);
    const taskDays = resourceTasks.reduce((sum, t) => {
      if (!t.startDate || !t.endDate) return sum;
      return sum + Math.max(0, differenceInDays(parseISO(t.endDate), parseISO(t.startDate)) + 1);
    }, 0);
    acc[dept].demand += taskDays;
    
    return acc;
  }, {} as Record<string, { name: string; resources: number; capacity: number; demand: number }>);

  const departmentChartData = Object.values(departmentCapacity)
    .map(d => ({
      ...d,
      available: Math.max(0, d.capacity - d.demand),
      utilization: d.capacity > 0 ? Math.round((d.demand / d.capacity) * 100) : 0,
    }))
    .sort((a, b) => b.resources - a.resources)
    .slice(0, 8);

  const handleExportCsv = () => {
    const headers = ["Name", "Department", "Skills", "Active Tasks", "Task Days", "Capacity Days", "Demand %", "Status"];
    const rows = resourceCapacityMap.map(r => [
      r.name, r.department || "", r.skills || "", r.activeTasks, r.taskDays, r.capacityDays, `${r.demandPercent}%`, r.status
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resource_capacity.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'overallocated': return { color: COLORS.Red, label: 'Overallocated' };
      case 'high': return { color: COLORS.Yellow, label: 'High Demand' };
      case 'balanced': return { color: COLORS.Green, label: 'Balanced' };
      default: return { color: COLORS.Blue, label: 'Available' };
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Capacity Planning</h2>
          <p className="text-sm text-muted-foreground">Forecast resource demand and availability</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Horizon:</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(['4', '8', '12'] as const).map(h => (
              <button
                key={h}
                onClick={() => setPlanningHorizon(h)}
                className={`px-3 py-1 text-xs ${planningHorizon === h ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                data-testid={`button-horizon-${h}`}
              >
                {h} weeks
              </button>
            ))}
          </div>
          <DashboardActionBar title="Capacity Planning" dashboardType="resource-capacity" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
        </div>
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
        <Card className="p-3 hover-elevate" data-testid="kpi-capacity">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Users className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Total Capacity</span>
          </div>
          <div className="text-2xl font-bold">{totalCapacity}h</div>
          <div className="text-xs text-muted-foreground">{activeResources.length} resources x {weeks}w</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-available">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-emerald-500/10">
              <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{Math.max(0, totalAvailable)}h</div>
          <div className="text-xs text-muted-foreground">unallocated capacity</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-utilization">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md" style={{ backgroundColor: `${avgUtilization >= 90 ? COLORS.Red : avgUtilization >= 70 ? COLORS.Yellow : COLORS.Green}15` }}>
              <TrendingUp className="h-3.5 w-3.5" style={{ color: avgUtilization >= 90 ? COLORS.Red : avgUtilization >= 70 ? COLORS.Yellow : COLORS.Green }} />
            </div>
            <span className="text-xs text-muted-foreground">Avg Utilization</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: avgUtilization >= 90 ? COLORS.Red : avgUtilization >= 70 ? COLORS.Yellow : COLORS.Green }}>{avgUtilization}%</div>
          <Progress value={Math.min(100, avgUtilization)} className="h-1.5 mt-1" />
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-deadlines">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Deadlines</span>
          </div>
          <div className="text-2xl font-bold">{upcomingDeadlines}</div>
          <div className="text-xs text-muted-foreground">next 2 weeks</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="chart-capacity-forecast">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              {weeks}-Week Capacity Forecast
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyCapacityData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="weekLabel" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="capacity" stroke={COLORS.Blue} fill={COLORS.Blue} fillOpacity={0.1} name="Capacity" />
                  <Area type="monotone" dataKey="demand" stroke={COLORS.Purple} fill={COLORS.Purple} fillOpacity={0.3} name="Demand" />
                  <Line type="monotone" dataKey="available" stroke={COLORS.Green} strokeWidth={2} dot={false} name="Available" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-weekly-utilization">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Weekly Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyCapacityData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} domain={[0, 150]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    formatter={(value: number) => [`${value}%`, 'Utilization']}
                  />
                  <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
                    {weeklyCapacityData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.utilization > 100 ? COLORS.Red : entry.utilization > 80 ? COLORS.Yellow : COLORS.Green} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="chart-department-capacity">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Capacity by Department
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentChartData} layout="vertical" margin={{ left: 70 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
                <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={65} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="demand" stackId="a" fill={COLORS.Purple} name="Demand (days)" />
                <Bar dataKey="available" stackId="a" fill={COLORS.Green} name="Available (days)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="table-resource-capacity">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Resource Capacity Details</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {resourceCapacityMap.map((resource) => {
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
                        <div className="text-sm font-medium">{resource.activeTasks} tasks</div>
                        <div className="text-xs text-muted-foreground">{resource.taskDays}d / {resource.capacityDays}d</div>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] h-5 min-w-[80px] justify-center" 
                        style={{ backgroundColor: `${statusBadge.color}15`, color: statusBadge.color }}
                      >
                        {statusBadge.label}
                      </Badge>
                      <div className="flex items-center gap-1 min-w-[50px]">
                        {resource.demandPercent > 100 ? (
                          <ArrowUp className="h-3 w-3 text-destructive" />
                        ) : resource.demandPercent < 40 ? (
                          <ArrowDown className="h-3 w-3 text-blue-500" />
                        ) : null}
                        <span className="text-xs font-medium">{resource.demandPercent}%</span>
                      </div>
                      <div className="w-16">
                        <Progress value={Math.min(100, resource.demandPercent)} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
              {resourceCapacityMap.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No resources match filters</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
