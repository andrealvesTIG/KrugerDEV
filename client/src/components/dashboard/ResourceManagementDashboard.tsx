import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useAllTasks } from "@/hooks/use-tasks";
import { useQuery } from "@tanstack/react-query";
import { DashboardActionBar } from "./DashboardActionBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Users, TrendingUp, AlertTriangle, BarChart3, Calendar, Gauge, Clock, Target } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from "recharts";
import type { Task, Resource } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
  Cyan: "#06b6d4",
};

export function ResourceManagementDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: tasks, isLoading: tasksLoading } = useAllTasks();

  const { data: timesheetData = [], isLoading: timesheetLoading } = useQuery<{ weekStart: string; hours: number }[]>({
    queryKey: ['/api/dashboard/utilization', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/utilization?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  if (resourcesLoading || tasksLoading || timesheetLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleExportCsv = () => {
    const headers = ["Resource", "Department", "Active Tasks", "Due Soon", "Risk Level"];
    const rows = bottlenecks.map(r => [r.name, r.department, r.activeTasks, r.upcomingDue, r.riskLevel]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resource_management_dashboard.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeResources = resources?.filter(r => r.isActive) || [];
  const allTasks = tasks || [];
  
  const activeTasks = allTasks.filter(t => t.status === "In Progress" || t.status === "Not Started");
  const completedTasks = allTasks.filter(t => t.status === "Completed");
  const totalCapacity = activeResources.length * 40;
  
  const taskHours = activeTasks.reduce((sum, task) => sum + ((task.durationDays || 5) * 8), 0);
  const utilizationRate = totalCapacity > 0 ? Math.min(100, Math.round((taskHours / totalCapacity) * 100 / 4)) : 0;
  
  const overallocatedResources = activeResources.filter(r => {
    const resourceTasks = allTasks.filter(t => t.assignee === r.displayName && (t.status === "In Progress" || t.status === "Not Started"));
    return resourceTasks.length > 5;
  }).length;

  const underutilizedResources = activeResources.filter(r => {
    const resourceTasks = allTasks.filter(t => t.assignee === r.displayName && (t.status === "In Progress" || t.status === "Not Started"));
    return resourceTasks.length === 0;
  }).length;

  const upcomingDeadlines = allTasks.filter(t => {
    if (!t.endDate) return false;
    const endDate = new Date(t.endDate);
    const today = new Date();
    const daysUntil = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntil >= 0 && daysUntil <= 7 && t.status !== "Completed";
  }).length;

  const overdueTasksCount = allTasks.filter(t => {
    if (!t.endDate || t.status === "Completed") return false;
    return new Date(t.endDate) < new Date();
  }).length;

  const generateWeeklyData = () => {
    const weeks = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - (i * 7));
      const weekLabel = `W${12 - i}`;
      
      const weekTasks = allTasks.filter(t => {
        if (!t.startDate || !t.endDate) return false;
        const taskStart = new Date(t.startDate);
        const taskEnd = new Date(t.endDate);
        return taskStart <= weekStart && taskEnd >= weekStart;
      });
      
      const demand = weekTasks.length * 20;
      const capacity = activeResources.length * 40;
      
      weeks.push({ week: weekLabel, demand: Math.min(demand, capacity * 1.5), capacity });
    }
    return weeks;
  };

  const weeklyData = generateWeeklyData();

  const departmentUtilization = activeResources.reduce((acc, resource) => {
    const dept = resource.department || "Unassigned";
    if (!acc[dept]) {
      acc[dept] = { name: dept, capacity: 0, assigned: 0 };
    }
    acc[dept].capacity += 1;
    const resourceTasks = allTasks.filter(t => t.assignee === resource.displayName && t.status !== "Completed");
    if (resourceTasks.length > 0) acc[dept].assigned += 1;
    return acc;
  }, {} as Record<string, { name: string; capacity: number; assigned: number }>);

  const deptUtilData = Object.values(departmentUtilization).map(d => ({
    name: d.name.length > 10 ? d.name.substring(0, 10) + "..." : d.name,
    utilization: d.capacity > 0 ? Math.round((d.assigned / d.capacity) * 100) : 0,
    capacity: d.capacity,
    assigned: d.assigned,
  }));

  const bottlenecks = activeResources
    .map(resource => {
      const resourceTasks = allTasks.filter(t => t.assignee === resource.displayName && (t.status === "In Progress" || t.status === "Not Started"));
      const upcomingDue = resourceTasks.filter(t => {
        if (!t.endDate) return false;
        const endDate = new Date(t.endDate);
        const daysUntil = Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil >= 0 && daysUntil <= 14;
      }).length;

      return {
        id: resource.id,
        name: resource.displayName,
        department: resource.department || "Unassigned",
        activeTasks: resourceTasks.length,
        upcomingDue,
        riskLevel: resourceTasks.length > 5 ? "High" : resourceTasks.length > 3 ? "Medium" : "Low" as const,
      };
    })
    .filter(r => r.activeTasks > 2)
    .sort((a, b) => b.activeTasks - a.activeTasks)
    .slice(0, 10);

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <DashboardActionBar title="Resource Management Dashboard" dashboardType="resource-management" organizationId={currentOrganization?.id || 0} onExportCsv={handleExportCsv} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 hover-elevate" data-testid="kpi-utilization">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <Gauge className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-muted-foreground">Utilization</span>
          </div>
          <div className="text-2xl font-bold">{utilizationRate}%</div>
          <Progress value={utilizationRate} className="h-1.5 mt-1" />
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-active-tasks">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-purple-500/10">
              <BarChart3 className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-muted-foreground">Active Tasks</span>
          </div>
          <div className="text-2xl font-bold">{activeTasks.length}</div>
          <div className="text-xs text-muted-foreground">{completedTasks.length} completed</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-overallocated">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            </div>
            <span className="text-xs text-muted-foreground">Overallocated</span>
          </div>
          <div className="text-2xl font-bold text-red-500">{overallocatedResources}</div>
          <div className="text-xs text-muted-foreground">resources</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-underutilized">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Users className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span className="text-xs text-muted-foreground">Underutilized</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{underutilizedResources}</div>
          <div className="text-xs text-muted-foreground">idle resources</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-due-soon">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-cyan-500/10">
              <Calendar className="h-3.5 w-3.5 text-cyan-500" />
            </div>
            <span className="text-xs text-muted-foreground">Due This Week</span>
          </div>
          <div className="text-2xl font-bold">{upcomingDeadlines}</div>
          <div className="text-xs text-muted-foreground">tasks</div>
        </Card>

        <Card className="p-3 hover-elevate" data-testid="kpi-overdue">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-md bg-red-500/10">
              <Clock className="h-3.5 w-3.5 text-red-500" />
            </div>
            <span className="text-xs text-muted-foreground">Overdue</span>
          </div>
          <div className="text-2xl font-bold text-red-500">{overdueTasksCount}</div>
          <div className="text-xs text-muted-foreground">past deadline</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2" data-testid="chart-capacity-demand">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Capacity vs Demand (12 Weeks)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Area type="monotone" dataKey="capacity" stroke={COLORS.Green} fill={COLORS.Green} fillOpacity={0.2} name="Capacity" />
                  <Area type="monotone" dataKey="demand" stroke={COLORS.Blue} fill={COLORS.Blue} fillOpacity={0.4} name="Demand" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-dept-utilization">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              Department Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptUtilData}>
                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} formatter={(value: number) => [`${value}%`, "Utilization"]} />
                  <Bar dataKey="utilization" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-workload-trend">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Workload Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="week" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="demand" stroke={COLORS.Blue} strokeWidth={2} dot={{ r: 3 }} name="Workload" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-bottlenecks">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Potential Bottlenecks
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <ScrollArea className="h-[220px]">
            {bottlenecks.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No bottlenecks detected</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {bottlenecks.map((resource) => (
                  <div key={resource.id} className="flex items-center gap-3 p-2 rounded-lg border hover-elevate" data-testid={`bottleneck-${resource.id}`}>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{getInitials(resource.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{resource.name}</div>
                      <div className="text-xs text-muted-foreground">{resource.department}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs font-medium">{resource.activeTasks} tasks</div>
                        <div className="text-[10px] text-muted-foreground">{resource.upcomingDue} due soon</div>
                      </div>
                      <Badge variant={resource.riskLevel === "High" ? "destructive" : resource.riskLevel === "Medium" ? "secondary" : "outline"} className="text-[10px] h-5">
                        {resource.riskLevel}
                      </Badge>
                      <div className="w-12">
                        <Progress value={Math.min(100, (resource.activeTasks / 8) * 100)} className="h-1.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
