import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Trash2, BarChart3, Hash, Target, AlertTriangle, CheckCircle, Users as UsersIcon, Clock } from "lucide-react";
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
    queryKey: ['/api/projects', { organizationId: currentOrganization?.id }],
    enabled: !!currentOrganization?.id,
  });

  const { data: tasks } = useQuery<any[]>({
    queryKey: ['/api/tasks/all', { organizationId: currentOrganization?.id }],
    enabled: !!currentOrganization?.id,
  });

  const { data: risks } = useQuery<any[]>({
    queryKey: ['/api/risks/organization', currentOrganization?.id],
    enabled: !!currentOrganization?.id,
  });

  const { data: issues } = useQuery<any[]>({
    queryKey: ['/api/issues/organization', currentOrganization?.id],
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
    };

    const data = dataSourceMap[widget.dataSource] || [];

    if (widget.groupBy) {
      const grouped: Record<string, number> = {};
      data.forEach((item) => {
        const key = item[widget.groupBy as string] || 'Unknown';
        grouped[key] = (grouped[key] || 0) + 1;
      });
      return Object.entries(grouped).map(([name, value]) => ({ name, value }));
    }

    if (widget.aggregation === 'count') {
      return data.length;
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
