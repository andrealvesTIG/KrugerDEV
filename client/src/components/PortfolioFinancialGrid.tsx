import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Loader2, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FinancialEntry, FinancialTypesConfig, FinancialType, CostItemCategoriesConfig } from "@shared/schema";
import { DEFAULT_FINANCIAL_TYPES, DEFAULT_COST_ITEM_CATEGORIES } from "@shared/schema";
import {
  buildFiscalMonths,
  buildFiscalQuarters,
  buildFiscalYearColumn,
  currentFiscalYear,
  DEFAULT_FISCAL_YEAR_START_MONTH,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";

// Unified period column: monthly views get a 1-element monthIndices, quarterly
// gets 3 indices, yearly gets all 12. Lets one render path handle all modes.
interface PeriodCol {
  key: string;
  label: string;
  monthIndices: number[];
}

type ViewMode = "month" | "quarter" | "year";
import { useOrganization } from "@/hooks/use-organization";
import {
  buildGridRows,
  formatCurrency,
  getTypePalette,
  type GridRow,
} from "@/components/ProjectFinancialGrid";

// Mirrors the row palette used by ProjectFinancialGrid so the two views feel
// like the same product. Sticky variants must be opaque so the frozen first
// column doesn't bleed values from the scrollable side.
const ROW_PALETTE: Record<string, { row: string; sticky: string; stickyHover: string }> = {
  view:          { row: "bg-muted/30 font-semibold", sticky: "bg-muted",     stickyHover: "group-hover:bg-accent" },
  category:      { row: "bg-muted/15 font-medium",   sticky: "bg-muted",     stickyHover: "group-hover:bg-accent" },
  specification: { row: "bg-muted/[0.04]",           sticky: "bg-secondary", stickyHover: "group-hover:bg-accent" },
  item:          { row: "bg-card",                   sticky: "bg-card",      stickyHover: "group-hover:bg-accent" },
};

// Renders a money value with the same "—" muted-dash convention as the
// per-project grid so empty cells read as quiet rather than as "$0".
function MoneyCell({ value }: { value: number }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  return <span>{formatCurrency(value)}</span>;
}

type PortfolioFinancialEntry = FinancialEntry & { projectName: string };

interface PortfolioFinancialGridProps {
  portfolioId: number;
}

interface ProjectGroup {
  projectId: number;
  projectName: string;
  rows: GridRow[];
  grandTotalByType: Record<string, number>;
  // monthlyByType[typeKey][fiscalIdx 0..11] = sum of all entries for the
  // project in that fiscal-month / scenario. Used to populate the project
  // header row's per-period cells.
  monthlyByType: Record<string, number[]>;
  expandedKeys: Set<string>;
}

export default function PortfolioFinancialGrid({ portfolioId }: PortfolioFinancialGridProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const fiscalYearStartMonth = normalizeFiscalYearStartMonth(
    currentOrganization?.fiscalYearStartMonth ?? DEFAULT_FISCAL_YEAR_START_MONTH,
  );
  const todayFiscalYear = currentFiscalYear(new Date(), fiscalYearStartMonth);
  const [fiscalYear, setFiscalYear] = useState(todayFiscalYear);

  // Re-sync default FY when org changes if user hasn't picked manually.
  const [userPicked, setUserPicked] = useState(false);
  useEffect(() => {
    setUserPicked(false);
    setFiscalYear(currentFiscalYear(new Date(), fiscalYearStartMonth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);
  useEffect(() => {
    if (!userPicked) setFiscalYear(todayFiscalYear);
  }, [todayFiscalYear, userPicked]);

  const monthsLayout = useMemo(
    () => buildFiscalMonths(fiscalYear, fiscalYearStartMonth),
    [fiscalYear, fiscalYearStartMonth],
  );
  // Calendar month (1..12) -> fiscal-month index (0..11) so we can drop a
  // raw entry (or today's date) into the right per-period column. NOTE: must
  // key by `p.month` (the *calendar* month), not `p.monthNum` (the fiscal-
  // month number 1..12). Those are only equal for Jan-start FYs; for an
  // Oct-FY they differ and we'd otherwise highlight the wrong column.
  const calendarToFiscalIdx = useMemo(() => {
    const m = new Map<number, number>();
    monthsLayout.forEach((p, idx) => m.set(p.month, idx));
    return m;
  }, [monthsLayout]);

  // View-mode toggle (month / quarter / year), persisted per browser so
  // returning users see their last preference.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "month";
    const v = window.localStorage.getItem("portfolioGrid.viewMode");
    return v === "quarter" || v === "year" ? v : "month";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("portfolioGrid.viewMode", viewMode);
    }
  }, [viewMode]);

  // Period columns derived from the current view mode. Each period exposes
  // the fiscal-month indices it covers so cell rendering is uniform.
  const periodCols: PeriodCol[] = useMemo(() => {
    if (viewMode === "year") {
      const c = buildFiscalYearColumn(fiscalYear, fiscalYearStartMonth);
      return [{ key: c.key, label: c.label, monthIndices: c.monthIndices }];
    }
    if (viewMode === "quarter") {
      return buildFiscalQuarters(fiscalYear, fiscalYearStartMonth).map(q => ({
        key: q.key, label: q.label, monthIndices: q.monthIndices,
      }));
    }
    return monthsLayout.map((m, i) => ({
      key: `m${m.monthNum}`,
      label: m.label,
      monthIndices: [i],
    }));
  }, [viewMode, fiscalYear, fiscalYearStartMonth, monthsLayout]);

  // Index of the period that contains today's calendar month, used to draw a
  // soft highlight ring across that column. -1 when viewing a non-current FY.
  const currentPeriodIdx = useMemo(() => {
    const now = new Date();
    const idx = calendarToFiscalIdx.get(now.getMonth() + 1);
    if (idx == null) return -1;
    // Only valid when the displayed FY actually contains today's month —
    // verify by matching the calendar year of that fiscal-month slot.
    const slot = monthsLayout[idx];
    if (!slot || slot.year !== now.getFullYear()) return -1;
    return periodCols.findIndex(p => p.monthIndices.includes(idx));
  }, [periodCols, calendarToFiscalIdx, monthsLayout]);

  const { data: typesConfig } = useQuery<FinancialTypesConfig>({
    queryKey: ["/api/organizations", orgId, "financial-types"],
    enabled: !!orgId,
  });
  const { data: costCatConfig } = useQuery<CostItemCategoriesConfig>({
    queryKey: ["/api/organizations", orgId, "cost-item-categories"],
    enabled: !!orgId,
  });
  const costConfig: CostItemCategoriesConfig = useMemo(
    () => costCatConfig ?? DEFAULT_COST_ITEM_CATEGORIES,
    [costCatConfig],
  );
  const orgTypes: FinancialType[] = useMemo(
    () => typesConfig?.types ?? DEFAULT_FINANCIAL_TYPES.types,
    [typesConfig],
  );
  // Per-browser visibility override so users can hide AOP/FCST/ACT etc.
  // without changing the org config (mirrors the per-project grid).
  const [visibilityOverride, setVisibilityOverride] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("portfolioGrid.typeVisibility") || "{}");
    } catch { return {}; }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("portfolioGrid.typeVisibility", JSON.stringify(visibilityOverride));
    }
  }, [visibilityOverride]);
  const allTypes: FinancialType[] = useMemo(
    () => orgTypes.map(t => ({
      ...t,
      enabled: visibilityOverride[t.key] ?? t.enabled,
    })),
    [orgTypes, visibilityOverride],
  );
  const enabledTypes = useMemo(() => allTypes.filter(t => t.enabled), [allTypes]);
  const typeKeys = useMemo(() => enabledTypes.map(t => t.key), [enabledTypes]);

  const { data: entries = [], isLoading, isError } = useQuery<PortfolioFinancialEntry[]>({
    queryKey: ["/api/portfolios", portfolioId, "financial-entries", fiscalYear],
    queryFn: async () => {
      const res = await fetch(`/api/portfolios/${portfolioId}/financial-entries?fiscalYear=${fiscalYear}`);
      if (!res.ok) throw new Error("Failed to fetch portfolio financial entries");
      return res.json();
    },
  });

  // Lightweight project list, used to distinguish "portfolio has no projects"
  // from "portfolio has projects but no financial entries" in the empty state.
  const { data: portfolioProjects = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/portfolios", portfolioId, "projects"],
  });

  // Track per-project expansion (collapsed by default for performance).
  const [openProjects, setOpenProjects] = useState<Set<number>>(new Set());
  const toggleProject = (pid: number) => {
    setOpenProjects(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  // Per-project inner expanded keys (view/category/specification rows).
  const [innerExpanded, setInnerExpanded] = useState<Record<number, Set<string>>>({});
  const toggleInner = (pid: number, key: string) => {
    setInnerExpanded(prev => {
      const cur = new Set(prev[pid] ?? []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...prev, [pid]: cur };
    });
  };

  // Group entries by project, then build rows per group.
  const projectGroups: ProjectGroup[] = useMemo(() => {
    const byProject = new Map<number, { name: string; entries: PortfolioFinancialEntry[] }>();
    for (const e of entries) {
      let g = byProject.get(e.projectId);
      if (!g) {
        g = { name: e.projectName || `Project ${e.projectId}`, entries: [] };
        byProject.set(e.projectId, g);
      }
      g.entries.push(e);
    }
    const groups: ProjectGroup[] = [];
    for (const [pid, g] of byProject) {
      const expanded = innerExpanded[pid] ?? new Set<string>();
      const { rows, grandTotalByType } = buildGridRows(
        g.entries as FinancialEntry[],
        typeKeys,
        expanded,
        costConfig,
      );
      // Per-project monthly aggregates: walk the raw entries once and bucket
      // amounts into [typeKey][fiscalIdx]. Cheap (O(entries)) and avoids
      // re-deriving from the rendered row tree.
      const monthlyByType: Record<string, number[]> = {};
      for (const k of typeKeys) monthlyByType[k] = Array(12).fill(0);
      for (const e of g.entries) {
        const idx = calendarToFiscalIdx.get(e.month);
        if (idx == null) continue;
        const bucket = monthlyByType[e.scenario];
        if (!bucket) continue;
        bucket[idx] += Number(e.amount) || 0;
      }
      groups.push({ projectId: pid, projectName: g.name, rows, grandTotalByType, monthlyByType, expandedKeys: expanded });
    }
    groups.sort((a, b) => a.projectName.localeCompare(b.projectName));
    return groups;
  }, [entries, typeKeys, costConfig, innerExpanded, calendarToFiscalIdx]);

  // Portfolio-level totals across all included projects (year totals + monthly).
  const portfolioTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const k of typeKeys) totals[k] = 0;
    for (const g of projectGroups) {
      for (const k of typeKeys) totals[k] += g.grandTotalByType[k] ?? 0;
    }
    return totals;
  }, [projectGroups, typeKeys]);

  const portfolioMonthlyByType = useMemo(() => {
    const m: Record<string, number[]> = {};
    for (const k of typeKeys) m[k] = Array(12).fill(0);
    for (const g of projectGroups) {
      for (const k of typeKeys) {
        const src = g.monthlyByType[k];
        if (!src) continue;
        for (let i = 0; i < 12; i++) m[k][i] += src[i] ?? 0;
      }
    }
    return m;
  }, [projectGroups, typeKeys]);

  // FY picker: today's FY ± 5 years.
  const fiscalYearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = todayFiscalYear - 5; y <= todayFiscalYear + 5; y++) years.push(y);
    return years;
  }, [todayFiscalYear]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">
        Failed to load portfolio financial entries. Please try again.
      </div>
    );
  }

  if (projectGroups.length === 0) {
    return (
      <div className="space-y-4">
        <FiscalYearToolbar
          fiscalYear={fiscalYear}
          fiscalYearOptions={fiscalYearOptions}
          onChange={(fy) => { setUserPicked(true); setFiscalYear(fy); }}
        />
        <div className="rounded-lg border border-dashed bg-muted/30 p-10 text-center" data-testid="empty-portfolio-financials">
          <FolderKanban className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            {portfolioProjects.length === 0
              ? "No projects in this portfolio yet. Add projects to see their combined financials here."
              : `No financial entries found across the ${portfolioProjects.length} project${portfolioProjects.length === 1 ? "" : "s"} in this portfolio for FY${fiscalYear}.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FiscalYearToolbar
            fiscalYear={fiscalYear}
            fiscalYearOptions={fiscalYearOptions}
            onChange={(fy) => { setUserPicked(true); setFiscalYear(fy); }}
          />

          {/* View-mode segmented control: month / quarter / year */}
          <div
            className="inline-flex h-8 items-center rounded-md border bg-muted/40 p-0.5 gap-0.5"
            role="group"
            aria-label="View mode"
          >
            {([
              { key: "month",   label: "Month"   },
              { key: "quarter", label: "Quarter" },
              { key: "year",    label: "Year"    },
            ] as { key: ViewMode; label: string }[]).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setViewMode(opt.key)}
                className={`px-2.5 h-7 text-[11px] font-semibold rounded-sm transition-all ${
                  viewMode === opt.key
                    ? "bg-background text-foreground shadow-sm ring-1 ring-inset ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }`}
                data-testid={`button-portfolio-view-${opt.key}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Per-financial-type visibility toggles (AOP / FCST / ACT / EAC).
              Each chip uses its scenario palette so on/off reads instantly. */}
          <div className="inline-flex h-8 items-center gap-1" role="group" aria-label="Financial types">
            {orgTypes.map(t => {
              const palette = getTypePalette(t.key);
              const on = visibilityOverride[t.key] ?? t.enabled;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setVisibilityOverride(prev => ({ ...prev, [t.key]: !on }))}
                  className={`px-2 h-7 text-[10px] font-extrabold uppercase tracking-wider rounded-sm transition-all border ${
                    on
                      ? `${palette.activeBg} ${palette.activeText} border-transparent ring-1 ring-inset ${palette.activeRing}`
                      : "bg-muted/30 text-muted-foreground border-border/60 hover:bg-muted/60"
                  }`}
                  aria-pressed={on}
                  data-testid={`toggle-portfolio-type-${t.key}`}
                  title={`${on ? "Hide" : "Show"} ${t.label}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenProjects(new Set(projectGroups.map(g => g.projectId)))}
            data-testid="button-expand-all-projects"
          >
            Expand all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenProjects(new Set())}
            data-testid="button-collapse-all-projects"
          >
            Collapse all
          </Button>
        </div>
      </div>

      {/* Match the per-project grid: rounded card, frozen first column with a
          subtle right-edge shadow, monthBorder/typeBorder distinction so each
          period reads as a group of scenario sub-cells. */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            {/* Header row 1: month name (or "TOTAL") spanning all enabled scenarios */}
            <tr className="bg-muted">
              <th
                rowSpan={2}
                className="text-left px-3 py-2 font-bold uppercase tracking-wider text-[11px] min-w-[300px] sticky left-0 bg-muted z-30 border-r border-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
              >
                Project / View / Category / Specification / Item
              </th>
              <th
                colSpan={enabledTypes.length}
                className="px-2 py-1.5 text-center font-extrabold uppercase tracking-wider text-[11px] text-amber-900 dark:text-amber-100 border-l-2 border-r-2 border-amber-500/60 bg-amber-100/80 dark:bg-amber-900/40 shadow-[inset_0_-2px_0_0_rgba(245,158,11,0.5)]"
              >
                Total
              </th>
              {periodCols.map((p, pi) => {
                const isCurrent = pi === currentPeriodIdx;
                return (
                  <th
                    key={`mh-${p.key}`}
                    colSpan={enabledTypes.length}
                    className={`px-2 py-1.5 text-center font-bold uppercase tracking-tight text-[11px] border-l border-border whitespace-nowrap ${isCurrent ? "bg-blue-500/10 dark:bg-blue-400/10 text-blue-700 dark:text-blue-300" : "text-foreground/90"}`}
                    data-testid={`portfolio-period-header-${p.key}`}
                  >
                    {p.label}
                    {isCurrent && (
                      <span className="ml-1 text-[8px] font-semibold align-middle text-blue-600 dark:text-blue-400">●</span>
                    )}
                  </th>
                );
              })}
            </tr>
            {/* Header row 2: scenario chips, tinted per-type to match the per-project grid */}
            <tr className="bg-card">
              {enabledTypes.map((t, i) => {
                const palette = getTypePalette(t.key);
                const isLast = i === enabledTypes.length - 1;
                return (
                  <th
                    key={`th-total-${t.key}`}
                    className={`px-1.5 py-1 text-center font-extrabold uppercase tracking-wider text-[9px] whitespace-nowrap ${i === 0 ? "border-l-2 border-amber-500/60" : "border-l border-border/40"} ${isLast ? "border-r-2 border-amber-500/60" : ""} ${palette.activeBg} ${palette.activeText}`}
                  >
                    {t.label}
                  </th>
                );
              })}
              {periodCols.map((p, pi) => (
                enabledTypes.map((t, i) => {
                  const palette = getTypePalette(t.key);
                  const isCurrent = pi === currentPeriodIdx;
                  return (
                    <th
                      key={`th-${p.key}-${t.key}`}
                      className={`px-1.5 py-1 text-center font-extrabold uppercase tracking-wider text-[9px] whitespace-nowrap ${i === 0 ? "border-l border-border" : "border-l border-border/40"} ${palette.activeBg} ${palette.activeText} ${isCurrent ? "ring-1 ring-inset ring-blue-500/40" : ""}`}
                    >
                      {t.label}
                    </th>
                  );
                })
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Portfolio Total pinned at top — mirrors the project grid's
                "Grand Total" row. Each <td> is individually sticky with a `top`
                offset that clears the two-row header (~64px) so the row stays
                visible when scrolling the body. */}
            <tr className="font-bold" data-testid="row-portfolio-total">
              <td
                className="px-3 py-2 sticky left-0 bg-muted z-30 border-r border-b-2 border-border text-sm uppercase tracking-wider shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                style={{ top: "64px", position: "sticky" }}
              >
                Portfolio Total ({projectGroups.length} {projectGroups.length === 1 ? "project" : "projects"})
              </td>
              {enabledTypes.map((t, ti) => {
                const isLast = ti === enabledTypes.length - 1;
                return (
                  <td
                    key={`pt-total-${t.key}`}
                    className={`px-1.5 py-1.5 text-center text-[11px] font-extrabold tabular-nums bg-amber-100/70 dark:bg-amber-900/30 text-amber-950 dark:text-amber-50 z-10 border-b-2 border-border ${ti === 0 ? "border-l-2 border-amber-500/60" : "border-l border-amber-500/20"} ${isLast ? "border-r-2 border-amber-500/60" : ""}`}
                    style={{ top: "64px", position: "sticky" }}
                    data-testid={`portfolio-total-${t.key}`}
                  >
                    <MoneyCell value={portfolioTotals[t.key] ?? 0} />
                  </td>
                );
              })}
              {periodCols.map((p, pi) => (
                enabledTypes.map((t, ti) => {
                  const arr = portfolioMonthlyByType[t.key];
                  let value = 0;
                  if (arr) for (const mi of p.monthIndices) value += arr[mi] ?? 0;
                  const isCurrent = pi === currentPeriodIdx;
                  return (
                    <td
                      key={`pt-${p.key}-${t.key}`}
                      className={`px-1.5 py-1.5 text-center text-[11px] font-bold tabular-nums bg-muted z-10 border-b-2 border-border ${ti === 0 ? "border-l border-border" : "border-l border-border/40"} ${isCurrent ? "bg-blue-500/10 dark:bg-blue-400/10" : ""}`}
                      style={{ top: "64px", position: "sticky" }}
                      data-testid={`portfolio-monthly-${p.key}-${t.key}`}
                    >
                      <MoneyCell value={value} />
                    </td>
                  );
                })
              ))}
            </tr>

            {projectGroups.map(group => {
              const isOpen = openProjects.has(group.projectId);
              return (
                <ProjectGroupRows
                  key={group.projectId}
                  group={group}
                  isOpen={isOpen}
                  toggle={() => toggleProject(group.projectId)}
                  toggleInner={(k) => toggleInner(group.projectId, k)}
                  enabledTypes={enabledTypes}
                  periodCols={periodCols}
                  currentPeriodIdx={currentPeriodIdx}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FiscalYearToolbar({
  fiscalYear,
  fiscalYearOptions,
  onChange,
}: {
  fiscalYear: number;
  fiscalYearOptions: number[];
  onChange: (fy: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Fiscal Year:</span>
      <Select value={String(fiscalYear)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-9 w-32" data-testid="select-portfolio-fiscal-year">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fiscalYearOptions.map(y => (
            <SelectItem key={y} value={String(y)}>FY{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Badge variant="secondary" className="text-xs">Read-only</Badge>
    </div>
  );
}

function ProjectGroupRows({
  group,
  isOpen,
  toggle,
  toggleInner,
  enabledTypes,
  periodCols,
  currentPeriodIdx,
}: {
  group: ProjectGroup;
  isOpen: boolean;
  toggle: () => void;
  toggleInner: (key: string) => void;
  enabledTypes: FinancialType[];
  periodCols: PeriodCol[];
  currentPeriodIdx: number;
}) {
  const periodCount = periodCols.length;
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <>
      {/* Project header row — visually parallel to a top-level "View" row in
          the per-project grid: muted band, semibold, sticky-opaque first cell. */}
      <tr
        className="group bg-muted/40 hover:bg-accent cursor-pointer border-t border-border"
        onClick={toggle}
        data-testid={`row-portfolio-project-${group.projectId}`}
      >
        <td className="px-3 py-1.5 sticky left-0 bg-muted/40 group-hover:bg-accent z-10 border-r border-border font-semibold shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2">
            <Chevron className="h-4 w-4 text-muted-foreground" />
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{group.projectName}</span>
            <Badge variant="outline" className="ml-1 text-[10px] font-normal">
              {group.rows.filter(r => r.type === "item").length} items
            </Badge>
          </div>
        </td>
        {enabledTypes.map((t, ti) => {
          const isLast = ti === enabledTypes.length - 1;
          return (
            <td
              key={`pg-total-${t.key}`}
              className={`px-1.5 py-1 text-center text-[11px] font-extrabold tabular-nums bg-amber-50/80 dark:bg-amber-900/20 text-amber-950 dark:text-amber-50 ${ti === 0 ? "border-l-2 border-amber-500/60" : "border-l border-amber-500/20"} ${isLast ? "border-r-2 border-amber-500/60" : ""}`}
              data-testid={`project-total-${group.projectId}-${t.key}`}
            >
              <MoneyCell value={group.grandTotalByType[t.key] ?? 0} />
            </td>
          );
        })}
        {periodCols.map((p, pi) => (
          enabledTypes.map((t, ti) => {
            const arr = group.monthlyByType[t.key];
            let value = 0;
            if (arr) for (const mi of p.monthIndices) value += arr[mi] ?? 0;
            const isCurrent = pi === currentPeriodIdx;
            return (
              <td
                key={`pg-${p.key}-${t.key}`}
                className={`px-1.5 py-1 text-center text-[11px] font-semibold tabular-nums ${ti === 0 ? "border-l border-border" : "border-l border-border/40"} ${isCurrent ? "bg-blue-500/5 dark:bg-blue-400/5" : ""}`}
                data-testid={`project-monthly-${group.projectId}-${p.key}-${t.key}`}
              >
                <MoneyCell value={value} />
              </td>
            );
          })
        ))}
      </tr>
      {isOpen && group.rows.length === 0 && (
        <tr>
          <td
            colSpan={1 + periodCount * enabledTypes.length + enabledTypes.length}
            className="px-6 py-3 text-xs text-muted-foreground italic"
          >
            No financial entries for this project in the selected fiscal year.
          </td>
        </tr>
      )}
      {isOpen && group.rows.map(row => (
        <InnerRow
          key={`${group.projectId}-${row.key}`}
          row={row}
          enabledTypes={enabledTypes}
          periodCols={periodCols}
          currentPeriodIdx={currentPeriodIdx}
          onToggle={() => toggleInner(row.key)}
          isExpanded={group.expandedKeys.has(row.key)}
        />
      ))}
    </>
  );
}

function InnerRow({
  row,
  enabledTypes,
  periodCols,
  currentPeriodIdx,
  onToggle,
  isExpanded,
}: {
  row: GridRow;
  enabledTypes: FinancialType[];
  periodCols: PeriodCol[];
  currentPeriodIdx: number;
  onToggle: () => void;
  isExpanded: boolean;
}) {
  // +1 to nest under the project header row, matching the indent step
  // used by the per-project grid (16 base + 14 per level).
  const indent = 16 + (row.level + 1) * 14;
  const isGroup = row.type !== "item";
  const palette = ROW_PALETTE[row.type] ?? ROW_PALETTE.item;

  return (
    <tr
      className={`group ${palette.row} hover:bg-accent/40 ${isGroup ? "cursor-pointer" : ""} border-t border-border/60`}
      onClick={isGroup ? onToggle : undefined}
      data-testid={`row-portfolio-${row.type}-${row.key}`}
    >
      <td
        className={`py-1 sticky left-0 z-10 border-r border-border ${palette.sticky} ${palette.stickyHover} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
        style={{ paddingLeft: indent, paddingRight: 12 }}
      >
        <div className="flex items-center gap-1 min-w-0">
          {row.hasChildren ? (
            isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <span className="inline-block w-3.5 shrink-0" />
          )}
          <span className="truncate">{row.label}</span>
        </div>
      </td>
      {enabledTypes.map((t, ti) => {
        const isLast = ti === enabledTypes.length - 1;
        return (
          <td
            key={`${row.key}-total-${t.key}`}
            className={`px-1.5 py-1 text-center text-[11px] font-bold tabular-nums bg-amber-50/60 dark:bg-amber-900/15 text-amber-950 dark:text-amber-50 ${ti === 0 ? "border-l-2 border-amber-500/60" : "border-l border-amber-500/20"} ${isLast ? "border-r-2 border-amber-500/60" : ""}`}
          >
            <MoneyCell value={row.totalByType[t.key] ?? 0} />
          </td>
        );
      })}
      {periodCols.map((p, pi) => (
        enabledTypes.map((t, ti) => {
          const arr = row.monthlyByType[t.key];
          let val = 0;
          if (arr) for (const mi of p.monthIndices) val += arr[mi] ?? 0;
          const isCurrent = pi === currentPeriodIdx;
          return (
            <td
              key={`${row.key}-${p.key}-${t.key}`}
              className={`px-1.5 py-1 text-center text-[11px] tabular-nums ${ti === 0 ? "border-l border-border" : "border-l border-border/40"} ${isCurrent ? "bg-blue-500/5 dark:bg-blue-400/5" : ""}`}
            >
              <MoneyCell value={val} />
            </td>
          );
        })
      ))}
    </tr>
  );
}
