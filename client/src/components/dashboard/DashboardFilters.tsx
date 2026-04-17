import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  CalendarIcon,
  Filter,
  X,
  FolderKanban,
  Briefcase,
  Users,
  AlertTriangle,
  RotateCcw,
  Check,
  ChevronsUpDown,
  HeartPulse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format,
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  isSameDay,
} from "date-fns";
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
];

export const getDefaultFilters = (): DashboardFilterState => ({
  dateRange: { from: undefined, to: undefined },
  portfolioId: null,
  projectId: null,
  resourceId: null,
  priority: null,
  health: null,
});

// Truncate long names so trigger buttons stay a sensible size
const trim = (s: string, n = 18) => (s.length > n ? s.substring(0, n - 1) + "…" : s);

interface ComboBoxProps<T> {
  value: number | null;
  onChange: (val: number | null) => void;
  items: T[];
  itemId: (item: T) => number;
  itemLabel: (item: T) => string;
  itemSubLabel?: (item: T) => string | undefined;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  width?: string;
  testId?: string;
  /** Optional extra leading items (e.g. a synthetic "No Portfolio" entry with id -1) */
  extraItems?: { id: number; label: string }[];
  disabled?: boolean;
  disabledReason?: string;
}

function ComboBox<T>({
  value,
  onChange,
  items,
  itemId,
  itemLabel,
  itemSubLabel,
  label,
  icon,
  placeholder,
  searchPlaceholder,
  emptyText,
  width = "w-[200px]",
  testId,
  extraItems = [],
  disabled,
  disabledReason,
}: ComboBoxProps<T>) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    if (value === null) return null;
    const extra = extraItems.find(e => e.id === value);
    if (extra) return { id: extra.id, label: extra.label };
    const item = items.find(i => itemId(i) === value);
    return item ? { id: itemId(item), label: itemLabel(item) } : null;
  }, [value, items, extraItems, itemId, itemLabel]);

  const isActive = value !== null;

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          variant={isActive ? "secondary" : "outline"}
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          className={cn("h-9 justify-between gap-2 px-3", width)}
          data-testid={testId}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {icon}
            <span className="text-xs text-muted-foreground shrink-0">{label}:</span>
            <span className="text-sm font-medium truncate">
              {selected ? trim(selected.label) : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[280px]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`__all__ ${placeholder}`}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground">{placeholder}</span>
              </CommandItem>
              {extraItems.map((extra) => (
                <CommandItem
                  key={`extra-${extra.id}`}
                  value={extra.label}
                  onSelect={() => {
                    onChange(extra.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === extra.id ? "opacity-100" : "opacity-0")} />
                  <span className="italic text-muted-foreground">{extra.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {items.length > 0 && (
              <CommandGroup>
                {items.map((item) => {
                  const id = itemId(item);
                  const lbl = itemLabel(item);
                  const sub = itemSubLabel?.(item);
                  return (
                    <CommandItem
                      key={id}
                      value={`${lbl} ${sub ?? ""}`}
                      onSelect={() => {
                        onChange(id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === id ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate text-sm">{lbl}</span>
                        {sub && <span className="truncate text-[11px] text-muted-foreground">{sub}</span>}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
    if (filters.portfolioId !== null) count++;
    if (filters.projectId) count++;
    if (filters.resourceId) count++;
    if (filters.priority) count++;
    if (filters.health) count++;
    return count;
  }, [filters]);

  const filteredProjects = useMemo(() => {
    if (filters.portfolioId === null) return projects;
    if (filters.portfolioId === -1) return projects.filter(p => !p.portfolioId);
    return projects.filter(p => p.portfolioId === filters.portfolioId);
  }, [projects, filters.portfolioId]);

  const portfolioById = useMemo(() => new Map(portfolios.map(p => [p.id, p])), [portfolios]);

  const updateFilter = <K extends keyof DashboardFilterState>(
    key: K,
    value: DashboardFilterState[K],
  ) => {
    const newFilters = { ...filters, [key]: value };
    if (key === "portfolioId" && value !== filters.portfolioId) {
      newFilters.projectId = null;
    }
    onFiltersChange(newFilters);
  };

  const resetFilters = () => onFiltersChange(getDefaultFilters());

  // ---- Date range label helpers ----
  const matchedPreset = useMemo(() => {
    const { from, to } = filters.dateRange;
    if (!from || !to) return null;
    return TIME_PRESETS.find(p => {
      const v = p.getValue();
      return v.from && v.to && isSameDay(v.from, from) && isSameDay(v.to, to);
    })?.label || null;
  }, [filters.dateRange]);

  const dateLabel = () => {
    const { from, to } = filters.dateRange;
    if (!from && !to) return "Any time";
    if (matchedPreset) return matchedPreset;
    if (from && to) return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
    if (from) return `From ${format(from, "MMM d, yyyy")}`;
    return `Until ${format(to as Date, "MMM d, yyyy")}`;
  };

  const dateActive = !!(filters.dateRange.from || filters.dateRange.to);

  // ---- Lookups for chip labels ----
  const portfolioLabel = (id: number) => (id === -1 ? "No Portfolio" : portfolioById.get(id)?.name || `#${id}`);
  const projectLabel = (id: number) => projects.find(p => p.id === id)?.name || `#${id}`;
  const resourceLabel = (id: number) => resources.find(r => r.id === id)?.displayName || `#${id}`;

  // ---- Active filter chips ----
  type Chip = { key: string; label: string; onRemove: () => void; testId: string };
  const chips: Chip[] = [];
  if (dateActive) {
    chips.push({
      key: "date",
      label: `Date: ${dateLabel()}`,
      onRemove: () => updateFilter("dateRange", { from: undefined, to: undefined }),
      testId: "chip-date",
    });
  }
  if (filters.portfolioId !== null) {
    chips.push({
      key: "portfolio",
      label: `Portfolio: ${portfolioLabel(filters.portfolioId)}`,
      onRemove: () => updateFilter("portfolioId", null),
      testId: "chip-portfolio",
    });
  }
  if (filters.projectId) {
    chips.push({
      key: "project",
      label: `Project: ${projectLabel(filters.projectId)}`,
      onRemove: () => updateFilter("projectId", null),
      testId: "chip-project",
    });
  }
  if (filters.resourceId) {
    chips.push({
      key: "resource",
      label: `Resource: ${resourceLabel(filters.resourceId)}`,
      onRemove: () => updateFilter("resourceId", null),
      testId: "chip-resource",
    });
  }
  if (filters.priority) {
    chips.push({
      key: "priority",
      label: `Priority: ${filters.priority}`,
      onRemove: () => updateFilter("priority", null),
      testId: "chip-priority",
    });
  }
  if (filters.health) {
    chips.push({
      key: "health",
      label: `Health: ${filters.health}`,
      onRemove: () => updateFilter("health", null),
      testId: "chip-health",
    });
  }

  // When a portfolio is selected, ALWAYS scope to its projects (even if empty),
  // so we never show unrelated projects under a filtered portfolio.
  const portfolioFilterActive = filters.portfolioId !== null;
  const projectListForCombo = portfolioFilterActive ? filteredProjects : projects;
  const projectComboDisabled = projectListForCombo.length === 0;
  const projectDisabledReason = portfolioFilterActive
    ? "No projects in the selected portfolio"
    : "No projects available";

  return (
    <div className="space-y-2" data-testid="dashboard-filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground pr-1">
          <Filter className="h-4 w-4" />
          <span className="text-sm font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs" data-testid="filter-count">
              {activeFilterCount}
            </Badge>
          )}
        </div>

        <Separator orientation="vertical" className="h-6" />

        {showDateRange && (
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={dateActive ? "secondary" : "outline"}
                size="sm"
                className="h-9 gap-2 px-3"
                data-testid="filter-date-range"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="text-xs text-muted-foreground">Date:</span>
                <span className="text-sm font-medium">{dateLabel()}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex">
                <div className="border-r p-2 space-y-0.5 min-w-[140px]">
                  <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Quick ranges</div>
                  {TIME_PRESETS.map((preset) => {
                    const isMatched = matchedPreset === preset.label;
                    return (
                      <button
                        key={preset.label}
                        className={cn(
                          "block w-full text-left text-xs px-2 py-1.5 rounded transition-colors",
                          isMatched
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                        onClick={() => {
                          updateFilter("dateRange", preset.getValue());
                          setDatePickerOpen(false);
                        }}
                        data-testid={`preset-${preset.label.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                  <Separator className="my-1" />
                  <button
                    className="block w-full text-left text-xs px-2 py-1.5 rounded transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => {
                      updateFilter("dateRange", { from: undefined, to: undefined });
                      setDatePickerOpen(false);
                    }}
                    data-testid="preset-clear-date"
                  >
                    Clear date
                  </button>
                </div>
                <div className="p-2">
                  <Calendar
                    mode="range"
                    selected={{ from: filters.dateRange.from, to: filters.dateRange.to }}
                    defaultMonth={filters.dateRange.from}
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
          <ComboBox
            value={filters.portfolioId}
            onChange={(v) => updateFilter("portfolioId", v)}
            items={portfolios}
            itemId={(p) => p.id}
            itemLabel={(p) => p.name}
            extraItems={[{ id: -1, label: "No Portfolio" }]}
            label="Portfolio"
            icon={<FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />}
            placeholder="All portfolios"
            searchPlaceholder="Search portfolios…"
            emptyText="No portfolios found."
            width="w-[210px]"
            testId="filter-portfolio"
          />
        )}

        {showProject && projects.length > 0 && (
          <ComboBox
            value={filters.projectId}
            onChange={(v) => updateFilter("projectId", v)}
            items={projectListForCombo}
            itemId={(p) => p.id}
            itemLabel={(p) => p.name}
            itemSubLabel={(p) => {
              const pf = p.portfolioId ? portfolioById.get(p.portfolioId)?.name : undefined;
              return pf ? `${pf} • ${p.status}` : p.status;
            }}
            label="Project"
            icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
            placeholder="All projects"
            searchPlaceholder="Search projects…"
            emptyText="No projects found."
            width="w-[210px]"
            testId="filter-project"
            disabled={projectComboDisabled}
            disabledReason={projectDisabledReason}
          />
        )}

        {showResource && resources.length > 0 && (
          <ComboBox
            value={filters.resourceId}
            onChange={(v) => updateFilter("resourceId", v)}
            items={resources.filter(r => r.isActive)}
            itemId={(r) => r.id}
            itemLabel={(r) => r.displayName}
            itemSubLabel={(r) => r.department || r.email || undefined}
            label="Resource"
            icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
            placeholder="All resources"
            searchPlaceholder="Search resources…"
            emptyText="No resources found."
            width="w-[210px]"
            testId="filter-resource"
          />
        )}

        {showPriority && (
          <Select
            value={filters.priority || "all"}
            onValueChange={(value) => updateFilter("priority", value === "all" ? null : value)}
          >
            <SelectTrigger
              className={cn(
                "h-9 w-[150px] text-sm gap-1",
                filters.priority && "bg-secondary text-secondary-foreground border-secondary",
              )}
              data-testid="filter-priority"
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Priority:</span>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority</SelectItem>
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
            <SelectTrigger
              className={cn(
                "h-9 w-[140px] text-sm gap-1",
                filters.health && "bg-secondary text-secondary-foreground border-secondary",
              )}
              data-testid="filter-health"
            >
              <HeartPulse className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Health:</span>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any health</SelectItem>
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
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground ml-auto"
            onClick={resetFilters}
            data-testid="filter-reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-xs">Clear all</span>
          </Button>
        )}
      </div>

      {/* Active filter chips: clear individual filters with one click */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">Active</span>
          {chips.map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              className="h-6 pl-2 pr-1 gap-1 font-normal"
              data-testid={chip.testId}
            >
              <span className="text-xs truncate max-w-[220px]">{chip.label}</span>
              <button
                onClick={chip.onRemove}
                className="ml-0.5 rounded-sm hover:bg-background/60 p-0.5 transition-colors"
                aria-label={`Remove filter: ${chip.label}`}
                data-testid={`${chip.testId}-remove`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
