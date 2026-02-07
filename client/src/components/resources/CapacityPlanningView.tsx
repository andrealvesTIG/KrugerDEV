import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, AlertTriangle } from "lucide-react";
import { useResourceUtilization, type ResourceUtilizationData } from "@/hooks/use-resources";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { format, startOfWeek, addWeeks } from "date-fns";

interface CapacityPlanningViewProps {
  organizationId: number;
}

function getWeekRange(weeksOut: number) {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = addWeeks(start, weeksOut);
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
    startLabel: format(start, "MMM d, yyyy"),
    endLabel: format(end, "MMM d, yyyy"),
  };
}

function getUtilizationColor(pct: number) {
  if (pct > 100) return "bg-rose-500 dark:bg-rose-600";
  if (pct >= 80) return "bg-amber-500 dark:bg-amber-600";
  return "bg-emerald-500 dark:bg-emerald-600";
}

function getUtilizationBadgeVariant(pct: number): "destructive" | "secondary" | "default" {
  if (pct > 100) return "destructive";
  if (pct >= 80) return "secondary";
  return "default";
}

export default function CapacityPlanningView({ organizationId }: CapacityPlanningViewProps) {
  const [startDate, setStartDate] = useState(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(start, "yyyy-MM-dd");
  });
  const [endDate, setEndDate] = useState(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = addWeeks(start, 4);
    return format(end, "yyyy-MM-dd");
  });

  const { data, isLoading } = useResourceUtilization(organizationId, startDate, endDate);

  const summaryStats = useMemo(() => {
    if (!data?.resources || data.resources.length === 0) {
      return { totalCapacity: 0, totalAllocated: 0, overallUtilization: 0 };
    }
    const totalCapacity = data.resources.reduce((sum, r) => sum + r.effectiveWeeklyHours, 0);
    const totalAllocated = data.resources.reduce((sum, r) => sum + r.allocatedHoursPerWeek, 0);
    const overallUtilization = totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0;
    return { totalCapacity, totalAllocated, overallUtilization };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.resources || data.resources.length === 0) {
    return (
      <Card data-testid="empty-state">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground text-sm">No resources found for capacity planning.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="capacity-planning-view">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <CardTitle className="text-lg">Capacity Planning Timeline</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-muted-foreground whitespace-nowrap">From</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-auto"
              data-testid="input-start-date"
            />
            <label className="text-sm text-muted-foreground whitespace-nowrap">To</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-auto"
              data-testid="input-end-date"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card data-testid="stat-total-capacity">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">Total Team Capacity</p>
                <p className="text-2xl font-bold tabular-nums">{summaryStats.totalCapacity.toFixed(1)}h</p>
                <p className="text-xs text-muted-foreground">per week</p>
              </CardContent>
            </Card>
            <Card data-testid="stat-total-allocated">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">Total Allocated</p>
                <p className="text-2xl font-bold tabular-nums">{summaryStats.totalAllocated.toFixed(1)}h</p>
                <p className="text-xs text-muted-foreground">per week</p>
              </CardContent>
            </Card>
            <Card data-testid="stat-overall-utilization">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm text-muted-foreground">Overall Utilization</p>
                <p className="text-2xl font-bold tabular-nums">{summaryStats.overallUtilization}%</p>
                <Progress
                  value={Math.min(summaryStats.overallUtilization, 100)}
                  className="mt-2 h-2"
                  data-testid="progress-overall-utilization"
                />
              </CardContent>
            </Card>
          </div>

          <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1" data-testid="resource-rows-container">
            {data.resources.map((resource) => {
              const barWidthPct = Math.min(resource.utilizationPct, 150);
              const colorClass = getUtilizationColor(resource.utilizationPct);

              return (
                <div
                  key={resource.resourceId}
                  className="flex flex-col gap-2 rounded-md border p-3"
                  data-testid={`resource-row-${resource.resourceId}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate" data-testid={`text-resource-name-${resource.resourceId}`}>
                        {resource.displayName}
                      </span>
                      {resource.department && (
                        <Badge variant="secondary" className="text-xs shrink-0" data-testid={`badge-department-${resource.resourceId}`}>
                          {resource.department}
                        </Badge>
                      )}
                      {resource.isOverAllocated && (
                        <Badge variant="destructive" className="text-xs shrink-0 gap-1" data-testid={`badge-over-allocated-${resource.resourceId}`}>
                          <AlertTriangle className="h-3 w-3" />
                          Over-allocated
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span data-testid={`text-capacity-${resource.resourceId}`}>
                        {resource.effectiveWeeklyHours.toFixed(1)}h capacity
                      </span>
                      <span data-testid={`text-allocated-${resource.resourceId}`}>
                        {resource.allocatedHoursPerWeek.toFixed(1)}h allocated
                      </span>
                      <span className="font-medium tabular-nums" data-testid={`text-utilization-${resource.resourceId}`}>
                        {resource.utilizationPct}%
                      </span>
                    </div>
                  </div>
                  <div
                    className="relative h-5 w-full rounded-sm bg-muted overflow-hidden"
                    data-testid={`bar-capacity-${resource.resourceId}`}
                  >
                    <div
                      className={`absolute inset-y-0 left-0 rounded-sm transition-all ${colorClass}`}
                      style={{ width: `${Math.min(barWidthPct, 100)}%` }}
                    />
                    {resource.utilizationPct > 100 && (
                      <div
                        className="absolute inset-y-0 bg-rose-500/30 dark:bg-rose-600/30 border-l-2 border-rose-700 dark:border-rose-400"
                        style={{
                          left: "100%",
                          width: `${Math.min(barWidthPct - 100, 50)}%`,
                          transform: `translateX(-${Math.min(barWidthPct - 100, 50)}%)`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
