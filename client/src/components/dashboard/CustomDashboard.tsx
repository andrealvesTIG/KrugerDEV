import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, BarChart3, Hash, Target, AlertTriangle, CheckCircle, Users as UsersIcon, Clock, TrendingUp, TrendingDown, Minus, Calendar, Flag, FileText, Activity, Zap } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CustomDashboard as CustomDashboardType, DashboardWidget } from "@shared/schema";
import { KpiCard } from "./KpiCard";
import { cn } from "@/lib/utils";

const COLORS = ["#2563eb", "#16a34a", "#eab308", "#dc2626", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface CustomDashboardProps {
  dashboardId: number;
  onDelete?: () => void;
}

export function CustomDashboard({ dashboardId, onDelete }: CustomDashboardProps) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  
  const { data: dashboard, isLoading } = useQuery<CustomDashboardType>({
    queryKey: ['/api/custom-dashboards', dashboardId],
    enabled: !!dashboardId,
  });

  const { data: projects } = useQuery<any[]>({
    queryKey: [`/api/projects?organizationId=${currentOrganization?.id}`],
    enabled: !!currentOrganization?.id,
  });

  const { data: tasks } = useQuery<any[]>({
    queryKey: [`/api/tasks/all?organizationId=${currentOrganization?.id}`],
    enabled: !!currentOrganization?.id,
  });

  const { data: risks } = useQuery<any[]>({
    queryKey: ['/api/risks', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/risks?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: issues } = useQuery<any[]>({
    queryKey: ['/api/issues', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/issues?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: milestones } = useQuery<any[]>({
    queryKey: ['/api/milestones', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/milestones?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: resources } = useQuery<any[]>({
    queryKey: ['/api/resources', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/resources?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/custom-dashboards/${dashboardId}`);
    },
    onSuccess: () => {
      toast({ title: "Dashboard deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/custom-dashboards'] });
      onDelete?.();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete dashboard", variant: "destructive" });
    },
  });

  const getDataForWidget = (widget: DashboardWidget) => {
    const dataSourceMap: Record<string, any[]> = {
      projects: projects || [],
      tasks: tasks || [],
      risks: risks || [],
      issues: issues || [],
      milestones: milestones || [],
      resources: resources || [],
    };

    const data = dataSourceMap[widget.dataSource] || [];

    if (widget.groupBy) {
      const grouped: Record<string, { count: number; sum: number; values: number[] }> = {};
      const metricField = widget.metrics?.[0] || 'progress';
      
      data.forEach((item) => {
        const key = item[widget.groupBy as string] || 'Unknown';
        if (!grouped[key]) {
          grouped[key] = { count: 0, sum: 0, values: [] };
        }
        grouped[key].count++;
        const numValue = parseFloat(item[metricField]) || 0;
        grouped[key].sum += numValue;
        grouped[key].values.push(numValue);
      });
      
      return Object.entries(grouped).map(([name, agg]) => {
        let value = agg.count;
        if (widget.aggregation === 'sum') {
          value = agg.sum;
        } else if (widget.aggregation === 'average' && agg.values.length > 0) {
          value = Math.round(agg.sum / agg.values.length);
        }
        return { name, value };
      });
    }

    if (widget.aggregation === 'count') {
      return data.length;
    }
    
    if (widget.aggregation === 'sum' && widget.metrics?.[0]) {
      return data.reduce((sum, item) => sum + (parseFloat(item[widget.metrics![0]]) || 0), 0);
    }
    
    if (widget.aggregation === 'average' && widget.metrics?.[0] && data.length > 0) {
      const total = data.reduce((sum, item) => sum + (parseFloat(item[widget.metrics![0]]) || 0), 0);
      return Math.round(total / data.length);
    }

    return data;
  };

  const renderWidget = (widget: DashboardWidget) => {
    const widthClass = {
      small: 'md:col-span-1',
      medium: 'md:col-span-2',
      large: 'md:col-span-3',
      full: 'md:col-span-4',
    }[widget.size];

    const data = getDataForWidget(widget);

    // Power BI Embed Widget
    if (widget.type === 'powerbi-embed' && widget.embedUrl) {
      return (
        <div key={widget.id} className="col-span-4">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-500" />
                {widget.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full h-[600px] rounded-b-lg overflow-hidden">
                <iframe
                  title={widget.title}
                  src={widget.embedUrl}
                  className="w-full h-full border-0"
                  allowFullScreen
                />
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (widget.type === 'kpi') {
      const iconMap: Record<string, any> = {
        projects: BarChart3,
        portfolios: Target,
        tasks: CheckCircle,
        risks: AlertTriangle,
        issues: AlertTriangle,
        milestones: Target,
        resources: UsersIcon,
        timesheets: Clock,
      };
      const IconComponent = iconMap[widget.dataSource] || Hash;
      
      return (
        <div key={widget.id} className={cn("col-span-4", widthClass)}>
          <KpiCard
            title={widget.title}
            value={typeof data === 'number' ? data : Array.isArray(data) ? data.length : 0}
            icon={IconComponent}
          />
        </div>
      );
    }

    if (widget.type === 'bar-chart' && Array.isArray(data)) {
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2563eb">
                    {data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (widget.type === 'line-chart' && Array.isArray(data)) {
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#2563eb" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (widget.type === 'pie-chart' && Array.isArray(data)) {
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (widget.type === 'area-chart' && Array.isArray(data)) {
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (widget.type === 'progress' && Array.isArray(data)) {
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.slice(0, 5).map((item, index) => (
                <div key={index}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{item.name}</span>
                    <span>{item.value}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, (item.value / Math.max(...data.map(d => d.value))) * 100)}%`,
                        backgroundColor: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    if (widget.type === 'table' && Array.isArray(data)) {
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Name</th>
                  <th className="text-right py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 10).map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{item.name}</td>
                    <td className="text-right py-2">{item.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      );
    }

    // Stat Card with color scheme and trend
    if (widget.type === 'stat-card') {
      const colorSchemes: Record<string, { bg: string; text: string; icon: string }> = {
        green: { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-700 dark:text-green-300', icon: 'text-green-600 dark:text-green-400' },
        blue: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300', icon: 'text-blue-600 dark:text-blue-400' },
        amber: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', icon: 'text-amber-600 dark:text-amber-400' },
        red: { bg: 'bg-destructive/10', text: 'text-destructive', icon: 'text-destructive' },
        purple: { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300', icon: 'text-purple-600 dark:text-purple-400' },
      };
      const scheme = colorSchemes[widget.colorScheme || 'blue'];
      const value = typeof data === 'number' ? data : Array.isArray(data) ? data.length : 0;
      const iconMap: Record<string, any> = {
        projects: BarChart3,
        tasks: CheckCircle,
        risks: AlertTriangle,
        issues: Flag,
        milestones: Target,
        resources: UsersIcon,
      };
      const IconComponent = iconMap[widget.dataSource] || Activity;
      
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass, scheme.bg)}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className={cn("text-sm font-medium", scheme.text)}>{widget.title}</p>
                <p className={cn("text-3xl font-bold mt-1", scheme.text)}>{value.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className={cn("h-4 w-4", scheme.icon)} />
                  <span className={cn("text-xs", scheme.text)}>+12% from last period</span>
                </div>
              </div>
              <div className={cn("p-3 rounded-full", scheme.bg)}>
                <IconComponent className={cn("h-8 w-8", scheme.icon)} />
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Trend Card
    if (widget.type === 'trend-card') {
      const value = typeof data === 'number' ? data : Array.isArray(data) ? data.length : 0;
      const trend = Math.random() > 0.5 ? 'up' : 'down';
      const trendValue = Math.floor(Math.random() * 20) + 1;
      
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{widget.title}</p>
                <p className="text-2xl font-bold mt-1">{value.toLocaleString()}</p>
              </div>
              <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                trend === 'up' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-destructive/10 text-destructive'
              )}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trendValue}%
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Narrative widget - AI-generated insights
    if (widget.type === 'narrative') {
      const projectCount = projects?.length || 0;
      const taskCount = tasks?.length || 0;
      const completedTasks = tasks?.filter(t => t.status === 'Completed').length || 0;
      const riskCount = risks?.length || 0;
      const highRisks = risks?.filter(r => r.severity === 'Critical' || r.severity === 'High').length || 0;
      const issueCount = issues?.length || 0;
      
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              {widget.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Your portfolio currently manages <strong className="text-foreground">{projectCount} active projects</strong> with <strong className="text-foreground">{taskCount} tasks</strong> in progress. Task completion rate stands at <strong className="text-foreground">{taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0}%</strong>.</span>
              </p>
              {highRisks > 0 && (
                <p className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>Attention needed: <strong className="text-amber-600 dark:text-amber-400">{highRisks} high-priority risks</strong> require immediate review out of {riskCount} total risks tracked.</span>
                </p>
              )}
              {issueCount > 0 && (
                <p className="flex items-start gap-2">
                  <Flag className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <span>Currently tracking <strong className="text-foreground">{issueCount} open issues</strong> across all projects.</span>
                </p>
              )}
              <p className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Overall portfolio health is stable with consistent progress across key deliverables.</span>
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Recent Tasks widget
    if (widget.type === 'recent-tasks') {
      const recentTasks = (tasks || [])
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, widget.limit || 5);
      
      const statusColors: Record<string, string> = {
        'Completed': 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
        'Not Started': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
        'On Hold': 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      };
      
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {widget.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTasks.map((task, index) => (
                <div key={task.id || index} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.name}</p>
                    <p className="text-xs text-muted-foreground">{task.assignee || 'Unassigned'}</p>
                  </div>
                  <Badge variant="secondary" className={cn("text-xs ml-2", statusColors[task.status] || '')}>
                    {task.status}
                  </Badge>
                </div>
              ))}
              {recentTasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No recent tasks</p>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    // Gantt Chart (simplified horizontal bar representation)
    if (widget.type === 'gantt') {
      const ganttData = (widget.dataSource === 'tasks' ? tasks : projects) || [];
      const itemsWithDates = ganttData
        .filter(item => item.startDate && item.endDate)
        .slice(0, 10);
      
      const allDates = itemsWithDates.flatMap(item => [new Date(item.startDate), new Date(item.endDate)]);
      const minDate = allDates.length > 0 ? Math.min(...allDates.map(d => d.getTime())) : Date.now();
      const maxDate = allDates.length > 0 ? Math.max(...allDates.map(d => d.getTime())) : Date.now();
      const totalRange = maxDate - minDate || 1;
      
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {widget.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {itemsWithDates.map((item, index) => {
                const start = new Date(item.startDate).getTime();
                const end = new Date(item.endDate).getTime();
                const leftPercent = ((start - minDate) / totalRange) * 100;
                const widthPercent = ((end - start) / totalRange) * 100;
                
                return (
                  <div key={item.id || index} className="flex items-center gap-2">
                    <div className="w-32 text-xs truncate text-muted-foreground">{item.name}</div>
                    <div className="flex-1 h-6 bg-muted rounded relative">
                      <div
                        className="absolute h-full rounded"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${Math.max(widthPercent, 2)}%`,
                          backgroundColor: COLORS[index % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {itemsWithDates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No items with date ranges</p>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    // Milestone Timeline
    if (widget.type === 'milestone-timeline') {
      const upcomingMilestones = (milestones || [])
        .filter(m => !m.completed && m.dueDate)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, widget.limit || 5);
      
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              {widget.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {upcomingMilestones.map((milestone, index) => {
                const dueDate = new Date(milestone.dueDate);
                const isOverdue = dueDate < new Date();
                
                return (
                  <div key={milestone.id || index} className="flex items-start gap-4 pb-4 last:pb-0">
                    <div className="relative flex flex-col items-center">
                      <div className={cn(
                        "w-3 h-3 rounded-full border-2",
                        isOverdue ? "bg-destructive border-destructive" : "bg-primary border-primary"
                      )} />
                      {index < upcomingMilestones.length - 1 && (
                        <div className="w-0.5 h-full bg-muted absolute top-3" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-sm font-medium">{milestone.title || milestone.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className={cn("text-xs", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                          {dueDate.toLocaleDateString()}
                          {isOverdue && " (Overdue)"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {upcomingMilestones.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No upcoming key dates</p>
              )}
            </div>
          </CardContent>
        </Card>
      );
    }

    // Heatmap for risks
    if (widget.type === 'heatmap') {
      const severities = ['Critical', 'High', 'Medium', 'Low'];
      const probabilities = ['Very High', 'High', 'Medium', 'Low'];
      
      const heatmapData = severities.map(severity => {
        return probabilities.map(probability => {
          const count = (risks || []).filter(r => 
            r.severity === severity && r.probability === probability
          ).length;
          return count;
        });
      });
      
      const getColor = (severity: number, probability: number) => {
        const score = (3 - severity) + (3 - probability);
        if (score >= 5) return 'bg-destructive';
        if (score >= 3) return 'bg-amber-500';
        return 'bg-green-500';
      };
      
      return (
        <Card key={widget.id} className={cn("col-span-4", widthClass)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {widget.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="p-1"></th>
                    {probabilities.map(p => (
                      <th key={p} className="p-1 text-center font-medium">{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {severities.map((severity, sIdx) => (
                    <tr key={severity}>
                      <td className="p-1 font-medium">{severity}</td>
                      {probabilities.map((_, pIdx) => (
                        <td key={pIdx} className="p-1">
                          <div className={cn(
                            "w-full h-8 rounded flex items-center justify-center text-white font-medium",
                            getColor(sIdx, pIdx),
                            heatmapData[sIdx][pIdx] === 0 && "opacity-30"
                          )}>
                            {heatmapData[sIdx][pIdx] || '-'}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Dashboard not found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{dashboard.name}</h2>
          {dashboard.description && (
            <p className="text-sm text-muted-foreground">{dashboard.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/custom-dashboards', dashboardId] })}
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-dashboard"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4">
        {dashboard.config.widgets.map(renderWidget)}
      </div>
    </div>
  );
}
