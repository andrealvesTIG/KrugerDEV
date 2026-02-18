import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  CalendarIcon, Filter, X, FolderKanban, Briefcase, 
  Users, AlertTriangle, RotateCcw 
} from "lucide-react";
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import type { Portfolio, Project, Resource } from "@shared/schema";

export interface DashboardFilterState {
  dateRange: { from: Date | undefined; to: Date | undefined };
  portfolioId: number | null;
  projectId: number | null;
  resourceId: number | null;
  priority: string | null;
  health: string | null;
}

interface DashboardFiltersProps {
  portfolios?: Portfolio[];
  projects?: Project[];
  resources?: Resource[];
  filters: DashboardFilterState;
  onFiltersChange: (filters: DashboardFilterState) => void;
  showPortfolio?: boolean;
  showProject?: boolean;
  showResource?: boolean;
  showPriority?: boolean;
  showHealth?: boolean;
  showDateRange?: boolean;
}

const TIME_PRESETS = [
  { label: "Last 7 days", getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: "Last 30 days", getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "This Month", getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: "Last Month", getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: "This Quarter", getValue: () => ({ from: startOfQuarter(new Date()), to: endOfQuarter(new Date()) }) },
  { label: "This Year", getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
  { label: "All Time", getValue: () => ({ from: undefined, to: undefined }) },
];

export const getDefaultFilters = (): DashboardFilterState => ({
  dateRange: { from: undefined, to: undefined },
  portfolioId: null,
  projectId: null,
  resourceId: null,
  priority: null,
  health: null,
});

export function DashboardFilters({
  portfolios = [],
  projects = [],
  resources = [],
  filters,
  onFiltersChange,
  showPortfolio = true,
  showProject = true,
  showResource = false,
  showPriority = true,
  showHealth = true,
  showDateRange = true,
}: DashboardFiltersProps) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange.from || filters.dateRange.to) count++;
    if (filters.portfolioId) count++;
    if (filters.projectId) count++;
    if (filters.resourceId) count++;
    if (filters.priority) count++;
    if (filters.health) count++;
    return count;
  }, [filters]);

  const filteredProjects = useMemo(() => {
    if (!filters.portfolioId) return projects;
    return projects.filter(p => p.portfolioId === filters.portfolioId);
  }, [projects, filters.portfolioId]);

  const updateFilter = <K extends keyof DashboardFilterState>(
    key: K,
    value: DashboardFilterState[K]
  ) => {
    const newFilters = { ...filters, [key]: value };
    if (key === "portfolioId" && value !== filters.portfolioId) {
      newFilters.projectId = null;
    }
    onFiltersChange(newFilters);
  };

  const resetFilters = () => {
    onFiltersChange(getDefaultFilters());
  };

  const formatDateRange = () => {
    if (!filters.dateRange.from && !filters.dateRange.to) return "All Time";
    if (filters.dateRange.from && filters.dateRange.to) {
      return `${format(filters.dateRange.from, "MMM d")} - ${format(filters.dateRange.to, "MMM d, yyyy")}`;
    }
    if (filters.dateRange.from) return `From ${format(filters.dateRange.from, "MMM d, yyyy")}`;
    if (filters.dateRange.to) return `Until ${format(filters.dateRange.to, "MMM d, yyyy")}`;
    return "Select dates";
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filters</span>
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {activeFilterCount}
          </Badge>
        )}
      </div>

      <Separator orientation="vertical" className="h-6" />

      {showDateRange && (
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={filters.dateRange.from || filters.dateRange.to ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1.5"
              data-testid="filter-date-range"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              <span className="text-xs">{formatDateRange()}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex">
              <div className="border-r p-1 space-y-0">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className="block w-full text-left text-[10px] px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      const range = preset.getValue();
                      updateFilter("dateRange", range);
                      setDatePickerOpen(false);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="p-2">
                <Calendar
                  mode="range"
                  selected={{ from: filters.dateRange.from, to: filters.dateRange.to }}
                  onSelect={(range) => {
                    updateFilter("dateRange", { from: range?.from, to: range?.to });
                  }}
                  numberOfMonths={2}
                  className="text-xs"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {showPortfolio && portfolios.length > 0 && (
        <Select
          value={filters.portfolioId?.toString() || "all"}
          onValueChange={(value) => updateFilter("portfolioId", value === "all" ? null : parseInt(value))}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="filter-portfolio">
            <FolderKanban className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Portfolio" />
          </SelectTrigger>
          <SelectContent className="max-w-[300px]">
            <SelectItem value="all">All Portfolios</SelectItem>
            {portfolios.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                <span className="truncate block max-w-[250px]">{p.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showProject && (filteredProjects.length > 0 || projects.length > 0) && (
        <Select
          value={filters.projectId?.toString() || "all"}
          onValueChange={(value) => updateFilter("projectId", value === "all" ? null : parseInt(value))}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="filter-project">
            <Briefcase className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent className="max-w-[300px]">
            <SelectItem value="all">All Projects</SelectItem>
            {(filteredProjects.length > 0 ? filteredProjects : projects).map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                <span className="truncate block max-w-[250px]">{p.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showResource && resources.length > 0 && (
        <Select
          value={filters.resourceId?.toString() || "all"}
          onValueChange={(value) => updateFilter("resourceId", value === "all" ? null : parseInt(value))}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="filter-resource">
            <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Resource" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {resources.filter(r => r.isActive).map((r) => (
              <SelectItem key={r.id} value={r.id.toString()}>
                {r.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showPriority && (
        <Select
          value={filters.priority || "all"}
          onValueChange={(value) => updateFilter("priority", value === "all" ? null : value)}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="filter-priority">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
      )}

      {showHealth && (
        <Select
          value={filters.health || "all"}
          onValueChange={(value) => updateFilter("health", value === "all" ? null : value)}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs" data-testid="filter-health">
            <SelectValue placeholder="Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Health</SelectItem>
            <SelectItem value="Green">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                Green
              </div>
            </SelectItem>
            <SelectItem value="Yellow">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                Yellow
              </div>
            </SelectItem>
            <SelectItem value="Red">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-destructive" />
                Red
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      )}

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={resetFilters}
          data-testid="filter-reset"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="text-xs">Reset</span>
        </Button>
      )}
    </div>
  );
}
