import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Calendar } from "lucide-react";
import { useResourceUtilization } from "@/hooks/use-resources";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { useResources, useAllTaskResourceAssignments } from "@/hooks/use-resources";
import { format, startOfWeek, addWeeks, addDays } from "date-fns";

interface DemandForecastProps {
  organizationId: number;
}

type PeriodOption = 4 | 8 | 12;

interface WeekData {
  week: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  availableCapacity: number;
  projectedDemand: number;
  gap: number;
  utilizationPct: number;
}

function getStatusInfo(gap: number): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (gap > 5) return { label: "Surplus", variant: "default" };
  if (gap >= -5) return { label: "Balanced", variant: "secondary" };
  return { label: "Deficit", variant: "destructive" };
}

export default function DemandForecast({ organizationId }: DemandForecastProps) {
  const [period, setPeriod] = useState<PeriodOption>(8);

  const { data: utilizationData, isLoading: utilizationLoading } = useResourceUtilization(organizationId);
  const { data: resources, isLoading: resourcesLoading } = useResources(organizationId);
  const { data: assignments, isLoading: assignmentsLoading } = useAllTaskResourceAssignments(organizationId);

  const isLoading = utilizationLoading || resourcesLoading || assignmentsLoading;

  const weeklyData = useMemo(() => {
    if (!utilizationData?.resources || utilizationData.resources.length === 0) return [];

    const totalCapacity = utilizationData.resources.reduce((sum, r) => sum + r.effectiveWeeklyHours, 0);
    const totalDemand = utilizationData.resources.reduce((sum, r) => sum + r.allocatedHoursPerWeek, 0);

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });

    const weeks: WeekData[] = [];
    for (let i = 0; i < period; i++) {
      const start = addWeeks(weekStart, i);
      const end = addDays(start, 6);
      const weekLabel = `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
      const shortLabel = format(start, "MMM d");

      const utilizationPct = totalCapacity > 0 ? Math.round((totalDemand / totalCapacity) * 100) : 0;
      const gap = totalCapacity - totalDemand;

      weeks.push({
        week: shortLabel,
        weekLabel,
        startDate: format(start, "yyyy-MM-dd"),
        endDate: format(end, "yyyy-MM-dd"),
        availableCapacity: Math.round(totalCapacity * 10) / 10,
        projectedDemand: Math.round(totalDemand * 10) / 10,
        gap: Math.round(gap * 10) / 10,
        utilizationPct,
      });
    }

    return weeks;
  }, [utilizationData, period]);

  const summaryStats = useMemo(() => {
    if (weeklyData.length === 0) return { avgCapacity: 0, avgDemand: 0, avgGap: 0, avgUtilization: 0 };
    const avgCapacity = weeklyData.reduce((sum, w) => sum + w.availableCapacity, 0) / weeklyData.length;
    const avgDemand = weeklyData.reduce((sum, w) => sum + w.projectedDemand, 0) / weeklyData.length;
    const avgGap = weeklyData.reduce((sum, w) => sum + w.gap, 0) / weeklyData.length;
    const avgUtilization = weeklyData.reduce((sum, w) => sum + w.utilizationPct, 0) / weeklyData.length;
    return { avgCapacity, avgDemand, avgGap, avgUtilization: Math.round(avgUtilization) };
  }, [weeklyData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!utilizationData?.resources || utilizationData.resources.length === 0) {
    return (
      <Card data-testid="empty-state">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-sm">No resource data available for demand forecasting.</p>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(
    ...weeklyData.map((w) => Math.max(w.availableCapacity, w.projectedDemand))
  );
  const referenceValue = weeklyData.length > 0 ? weeklyData[0].availableCapacity : 0;

  return (
    <div className="space-y-4" data-testid="demand-forecast-view">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Demand vs Supply Forecast</CardTitle>
          </div>
          <div className="flex items-center gap-1" data-testid="period-selector">
            {([4, 8, 12] as PeriodOption[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
                data-testid={`button-period-${p}`}
              >
                {p} weeks
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <Card data-testid="stat-avg-capacity">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">Avg Weekly Capacity</p>
                <p className="text-2xl font-bold tabular-nums">{summaryStats.avgCapacity.toFixed(1)}h</p>
              </CardContent>
            </Card>
            <Card data-testid="stat-avg-demand">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">Avg Weekly Demand</p>
                <p className="text-2xl font-bold tabular-nums">{summaryStats.avgDemand.toFixed(1)}h</p>
              </CardContent>
            </Card>
            <Card data-testid="stat-avg-gap">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">Avg Gap</p>
                <p className={`text-2xl font-bold tabular-nums ${summaryStats.avgGap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {summaryStats.avgGap >= 0 ? "+" : ""}{summaryStats.avgGap.toFixed(1)}h
                </p>
              </CardContent>
            </Card>
            <Card data-testid="stat-avg-utilization">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">Avg Utilization</p>
                <p className="text-2xl font-bold tabular-nums">{summaryStats.avgUtilization}%</p>
              </CardContent>
            </Card>
          </div>

          <div className="h-80 w-full" data-testid="forecast-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  label={{ value: "Hours", angle: -90, position: "insideLeft", style: { fontSize: 12 } }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(1)}h`,
                    name,
                  ]}
                  labelFormatter={(label) => {
                    const week = weeklyData.find((w) => w.week === label);
                    return week ? week.weekLabel : label;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <ReferenceLine
                  y={referenceValue}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                  label={{ value: "100% Capacity", position: "right", style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
                />
                <Bar
                  dataKey="availableCapacity"
                  name="Available Capacity"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="projectedDemand"
                  name="Projected Demand"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="forecast-summary-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Weekly Forecast Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Week</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Available (h)</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Demand (h)</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Gap (h)</th>
                  <th className="pb-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.map((week, index) => {
                  const status = getStatusInfo(week.gap);
                  return (
                    <tr
                      key={week.startDate}
                      className="border-b last:border-b-0"
                      data-testid={`row-week-${index}`}
                    >
                      <td className="py-2 pr-4 whitespace-nowrap" data-testid={`text-week-range-${index}`}>
                        {week.weekLabel}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums" data-testid={`text-available-${index}`}>
                        {week.availableCapacity.toFixed(1)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums" data-testid={`text-demand-${index}`}>
                        {week.projectedDemand.toFixed(1)}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right tabular-nums font-medium ${
                          week.gap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                        data-testid={`text-gap-${index}`}
                      >
                        {week.gap >= 0 ? "+" : ""}{week.gap.toFixed(1)}
                      </td>
                      <td className="py-2" data-testid={`badge-status-${index}`}>
                        <Badge variant={status.variant} className="text-xs">
                          {status.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
