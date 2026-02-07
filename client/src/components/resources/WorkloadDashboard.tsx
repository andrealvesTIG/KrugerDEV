import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, TrendingUp, TrendingDown, AlertTriangle, ArrowUpDown } from "lucide-react";
import { useResourceUtilization } from "@/hooks/use-resources";
import { Progress } from "@/components/ui/progress";
import type { ResourceUtilizationData } from "@/hooks/use-resources";

interface WorkloadDashboardProps {
  organizationId: number;
}

type SortField = "name" | "utilization" | "allocation" | "department";
type FilterMode = "all" | "over-allocated" | "under-utilized";

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

export default function WorkloadDashboard({ organizationId }: WorkloadDashboardProps) {
  const { data, isLoading } = useResourceUtilization(organizationId);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const underUtilizedCount = useMemo(() => {
    if (!data?.resources) return 0;
    return data.resources.filter((r) => r.utilizationPct < 50).length;
  }, [data]);

  const filteredAndSorted = useMemo(() => {
    if (!data?.resources) return [];

    let filtered = [...data.resources];

    if (filterMode === "over-allocated") {
      filtered = filtered.filter((r) => r.isOverAllocated);
    } else if (filterMode === "under-utilized") {
      filtered = filtered.filter((r) => r.utilizationPct < 50);
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        case "utilization":
          cmp = a.utilizationPct - b.utilizationPct;
          break;
        case "allocation":
          cmp = a.totalAllocationPct - b.totalAllocationPct;
          break;
        case "department":
          cmp = (a.department || "").localeCompare(b.department || "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return filtered;
  }, [data, sortField, sortAsc, filterMode]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

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
          <p className="text-muted-foreground text-sm">No resources found for workload balancing.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="workload-dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="summary-cards">
        <Card data-testid="card-total-resources">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Resources</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-total-resources">
              {data.summary.totalResources}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-utilization">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Utilization</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums" data-testid="text-avg-utilization">
              {data.summary.avgUtilization}%
            </p>
            <Progress
              value={Math.min(data.summary.avgUtilization, 100)}
              className="mt-2 h-2"
              data-testid="progress-avg-utilization"
            />
          </CardContent>
        </Card>

        <Card data-testid="card-over-allocated">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-rose-600 dark:text-rose-400">Over-Allocated</CardTitle>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400" data-testid="text-over-allocated">
              {data.summary.overAllocated}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-under-utilized">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">Under-Utilized</CardTitle>
            <TrendingDown className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400" data-testid="text-under-utilized">
              {underUtilizedCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
          <CardTitle className="text-lg">Resource Workload</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterMode} onValueChange={(val) => setFilterMode(val as FilterMode)}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter">
                <SelectValue placeholder="Filter resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="filter-all">All</SelectItem>
                <SelectItem value="over-allocated" data-testid="filter-over-allocated">Over-allocated only</SelectItem>
                <SelectItem value="under-utilized" data-testid="filter-under-utilized">Under-utilized only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="sort-controls">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            <Button
              variant={sortField === "name" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSort("name")}
              data-testid="sort-name"
            >
              Name
              {sortField === "name" && <ArrowUpDown className="ml-1 h-3 w-3" />}
            </Button>
            <Button
              variant={sortField === "utilization" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSort("utilization")}
              data-testid="sort-utilization"
            >
              Utilization %
              {sortField === "utilization" && <ArrowUpDown className="ml-1 h-3 w-3" />}
            </Button>
            <Button
              variant={sortField === "allocation" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSort("allocation")}
              data-testid="sort-allocation"
            >
              Allocation %
              {sortField === "allocation" && <ArrowUpDown className="ml-1 h-3 w-3" />}
            </Button>
            <Button
              variant={sortField === "department" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSort("department")}
              data-testid="sort-department"
            >
              Department
              {sortField === "department" && <ArrowUpDown className="ml-1 h-3 w-3" />}
            </Button>
          </div>

          <div className="max-h-[600px] overflow-y-auto space-y-2 pr-1" data-testid="resource-list">
            {filteredAndSorted.length === 0 ? (
              <div className="flex items-center justify-center py-8" data-testid="empty-filtered">
                <p className="text-sm text-muted-foreground">No resources match the selected filter.</p>
              </div>
            ) : (
              filteredAndSorted.map((resource) => {
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
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 flex-wrap">
                        <span data-testid={`text-hours-${resource.resourceId}`}>
                          {resource.allocatedHoursPerWeek.toFixed(1)}h / {resource.effectiveWeeklyHours.toFixed(1)}h
                        </span>
                        <Badge
                          variant={getUtilizationBadgeVariant(resource.utilizationPct)}
                          className="text-xs"
                          data-testid={`badge-utilization-${resource.resourceId}`}
                        >
                          {resource.utilizationPct}%
                        </Badge>
                        <span data-testid={`text-assignments-${resource.resourceId}`}>
                          {resource.assignmentCount} task{resource.assignmentCount !== 1 ? "s" : ""}
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
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
