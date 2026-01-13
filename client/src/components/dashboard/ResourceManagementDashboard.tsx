import { useOrganization } from "@/hooks/use-organization";
import { useResources } from "@/hooks/use-resources";
import { useAllTasks } from "@/hooks/use-tasks";
import { useQuery } from "@tanstack/react-query";
import { KpiCard } from "./KpiCard";
import { DashboardChartCard } from "./DashboardChartCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users, TrendingUp, AlertTriangle, BarChart3, Calendar, Gauge } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from "recharts";
import type { Task, Resource } from "@shared/schema";

const COLORS = {
  Green: "#10b981",
  Yellow: "#f59e0b",
  Red: "#ef4444",
  Blue: "#3b82f6",
  Purple: "#8b5cf6",
  Teal: "#14b8a6",
};

export function ResourceManagementDashboard() {
  const { currentOrganization } = useOrganization();
  const { data: resources, isLoading: resourcesLoading } = useResources(currentOrganization?.id ?? null);
  const { data: tasks, isLoading: tasksLoading } = useAllTasks();

  const { data: timesheetData, isLoading: timesheetLoading } = useQuery<{ weekStart: string; hours: number }[]>({
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
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeResources = resources?.filter(r => r.isActive) || [];
  const allTasks = tasks || [];
  
  const activeTasks = allTasks.filter(t => t.status === "In Progress" || t.status === "Not Started");
  const totalCapacity = activeResources.length * 40;
  
  const taskHours = activeTasks.reduce((sum, task) => {
    const days = task.durationDays || 5;
    return sum + (days * 8);
  }, 0);
  
  const utilizationRate = totalCapacity > 0 ? Math.min(100, Math.round((taskHours / totalCapacity) * 100 / 4)) : 0;
  
  const overallocatedResources = activeResources.filter(r => {
    const resourceTasks = allTasks.filter(t => t.assignee === r.displayName && (t.status === "In Progress" || t.status === "Not Started"));
    return resourceTasks.length > 5;
  }).length;

  const upcomingDeadlines = allTasks
    .filter(t => {
      if (!t.endDate) return false;
      const endDate = new Date(t.endDate);
      const today = new Date();
      const daysUntil = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7 && t.status !== "Completed";
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
      
      weeks.push({
        week: weekLabel,
        demand: Math.min(demand, capacity * 1.5),
        capacity: capacity,
      });
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
    if (resourceTasks.length > 0) {
      acc[dept].assigned += 1;
    }
    return acc;
  }, {} as Record<string, { name: string; capacity: number; assigned: number }>);

  const deptUtilData = Object.values(departmentUtilization).map(d => ({
    name: d.name.length > 12 ? d.name.substring(0, 12) + "..." : d.name,
    utilization: d.capacity > 0 ? Math.round((d.assigned / d.capacity) * 100) : 0,
    capacity: d.capacity,
    assigned: d.assigned,
  }));

  const bottlenecks = activeResources
    .map(resource => {
      const resourceTasks = allTasks.filter(t => 
        t.assignee === resource.displayName && 
        (t.status === "In Progress" || t.status === "Not Started")
      );
      
      const upcomingDue = resourceTasks.filter(t => {
        if (!t.endDate) return false;
        const endDate = new Date(t.endDate);
        const today = new Date();
        const daysUntil = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntil >= 0 && daysUntil <= 14;
      }).length;

      return {
        id: resource.id,
        name: resource.displayName,
        department: resource.department || "Unassigned",
        activeTasks: resourceTasks.length,
        upcomingDue,
        riskLevel: resourceTasks.length > 5 ? "High" : resourceTasks.length > 3 ? "Medium" : "Low",
      };
    })
    .filter(r => r.activeTasks > 3)
    .sort((a, b) => b.activeTasks - a.activeTasks)
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Utilization Rate"
          value={`${utilizationRate}%`}
          subtitle="Current capacity usage"
          icon={Gauge}
          iconColor="text-blue-500"
          borderColor="border-l-blue-500"
          testId="kpi-utilization-rate"
        />
        <KpiCard
          title="Active Tasks"
          value={activeTasks.length}
          subtitle="In progress or pending"
          icon={BarChart3}
          iconColor="text-purple-500"
          borderColor="border-l-purple-500"
          delay={0.2}
          testId="kpi-active-tasks"
        />
        <KpiCard
          title="Overallocated"
          value={overallocatedResources}
          subtitle="Resources over capacity"
          icon={AlertTriangle}
          iconColor="text-rose-500"
          borderColor="border-l-rose-500"
          delay={0.3}
          testId="kpi-overallocated"
        />
        <KpiCard
          title="Due This Week"
          value={upcomingDeadlines}
          subtitle="Tasks with deadlines"
          icon={Calendar}
          iconColor="text-amber-500"
          borderColor="border-l-amber-500"
          delay={0.4}
          testId="kpi-upcoming-deadlines"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DashboardChartCard
          title="Capacity vs Demand"
          description="12-week resource allocation forecast"
          testId="chart-capacity-demand"
          className="md:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="week" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend />
              <Area type="monotone" dataKey="capacity" stroke={COLORS.Green} fill={COLORS.Green} fillOpacity={0.2} name="Capacity" />
              <Area type="monotone" dataKey="demand" stroke={COLORS.Blue} fill={COLORS.Blue} fillOpacity={0.4} name="Demand" />
            </AreaChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Department Utilization"
          description="Percentage of resources assigned per department"
          testId="chart-dept-utilization"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deptUtilData}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`${value}%`, "Utilization"]}
              />
              <Bar dataKey="utilization" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartCard>

        <DashboardChartCard
          title="Workload Trend"
          description="Active tasks over the past 12 weeks"
          testId="chart-workload-trend"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="week" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="demand" stroke={COLORS.Blue} strokeWidth={2} dot={{ r: 4 }} name="Workload" />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChartCard>
      </div>

      <Card data-testid="card-bottlenecks">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Potential Bottlenecks
          </CardTitle>
          <CardDescription>Resources with high workload that may impact delivery</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px]">
            {bottlenecks.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No bottlenecks detected
              </div>
            ) : (
              <div className="space-y-4">
                {bottlenecks.map((resource) => (
                  <div
                    key={resource.id}
                    className="flex items-center gap-4 rounded-lg border p-3"
                    data-testid={`bottleneck-${resource.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{resource.name}</div>
                      <div className="text-sm text-muted-foreground">{resource.department}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">{resource.activeTasks} active tasks</div>
                        <div className="text-xs text-muted-foreground">{resource.upcomingDue} due soon</div>
                      </div>
                      <Badge 
                        variant={resource.riskLevel === "High" ? "destructive" : resource.riskLevel === "Medium" ? "secondary" : "outline"}
                      >
                        {resource.riskLevel}
                      </Badge>
                      <div className="w-20">
                        <Progress 
                          value={Math.min(100, (resource.activeTasks / 8) * 100)} 
                          className="h-2"
                        />
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
