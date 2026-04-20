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
  currentFiscalYear,
  DEFAULT_FISCAL_YEAR_START_MONTH,
  normalizeFiscalYearStartMonth,
} from "@shared/lib/fiscalCalendar";
import { useOrganization } from "@/hooks/use-organization";
import {
  buildGridRows,
  formatCurrency,
  type GridRow,
} from "@/components/ProjectFinancialGrid";

type PortfolioFinancialEntry = FinancialEntry & { projectName: string };

interface PortfolioFinancialGridProps {
  portfolioId: number;
}

interface ProjectGroup {
  projectId: number;
  projectName: string;
  rows: GridRow[];
  grandTotalByType: Record<string, number>;
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
  const allTypes: FinancialType[] = useMemo(
    () => typesConfig?.types ?? DEFAULT_FINANCIAL_TYPES.types,
    [typesConfig],
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
      groups.push({ projectId: pid, projectName: g.name, rows, grandTotalByType, expandedKeys: expanded });
    }
    groups.sort((a, b) => a.projectName.localeCompare(b.projectName));
    return groups;
  }, [entries, typeKeys, costConfig, innerExpanded]);

  // Portfolio-level totals across all included projects.
  const portfolioTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const k of typeKeys) totals[k] = 0;
    for (const g of projectGroups) {
      for (const k of typeKeys) totals[k] += g.grandTotalByType[k] ?? 0;
    }
    return totals;
  }, [projectGroups, typeKeys]);

  // FY picker: today's FY ± 5 years.
  const fiscalYearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = todayFiscalYear - 5; y <= todayFiscalYear + 5; y++) years.push(y);
    return years;
  }, [todayFiscalYear]);

  const periodCols = monthsLayout;

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
        <FiscalYearToolbar
          fiscalYear={fiscalYear}
          fiscalYearOptions={fiscalYearOptions}
          onChange={(fy) => { setUserPicked(true); setFiscalYear(fy); }}
        />
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

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 font-medium min-w-[280px] sticky left-0 bg-muted/40 z-20 border-r">
                Project / View / Category / Specification / Item
              </th>
              {periodCols.map(p => (
                enabledTypes.map(t => (
                  <th
                    key={`${p.monthNum}-${t.key}`}
                    className="px-2 py-2 text-right font-medium whitespace-nowrap border-l"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.label}</div>
                    <div className="text-[10px]">{t.label}</div>
                  </th>
                ))
              ))}
              {enabledTypes.map(t => (
                <th key={`total-${t.key}`} className="px-2 py-2 text-right font-medium whitespace-nowrap border-l bg-muted/60">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
                  <div className="text-[10px]">{t.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
                  periodCount={periodCols.length}
                />
              );
            })}
            {/* Portfolio totals row */}
            <tr className="bg-primary/5 font-semibold border-t-2">
              <td className="px-3 py-2 sticky left-0 bg-primary/5 z-10 border-r">
                Portfolio Total ({projectGroups.length} {projectGroups.length === 1 ? "project" : "projects"})
              </td>
              {periodCols.map((_, i) => (
                enabledTypes.map(t => (
                  <td key={`pt-${i}-${t.key}`} className="px-2 py-2 text-right text-muted-foreground border-l">—</td>
                ))
              ))}
              {enabledTypes.map(t => (
                <td
                  key={`pt-total-${t.key}`}
                  className="px-2 py-2 text-right border-l bg-primary/10"
                  data-testid={`portfolio-total-${t.key}`}
                >
                  {formatCurrency(portfolioTotals[t.key] ?? 0)}
                </td>
              ))}
            </tr>
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
  periodCount,
}: {
  group: ProjectGroup;
  isOpen: boolean;
  toggle: () => void;
  toggleInner: (key: string) => void;
  enabledTypes: FinancialType[];
  periodCount: number;
}) {
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <>
      <tr
        className="bg-accent/40 hover:bg-accent/60 cursor-pointer border-t"
        onClick={toggle}
        data-testid={`row-portfolio-project-${group.projectId}`}
      >
        <td className="px-3 py-2 sticky left-0 bg-accent/40 z-10 border-r font-semibold">
          <div className="flex items-center gap-2">
            <Chevron className="h-4 w-4" />
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
            <span>{group.projectName}</span>
            <Badge variant="outline" className="ml-2 text-[10px]">
              {group.rows.filter(r => r.type === "item").length} items
            </Badge>
          </div>
        </td>
        {Array.from({ length: periodCount }).map((_, i) => (
          enabledTypes.map(t => (
            <td key={`pg-${i}-${t.key}`} className="px-2 py-2 text-right text-muted-foreground border-l">—</td>
          ))
        ))}
        {enabledTypes.map(t => (
          <td
            key={`pg-total-${t.key}`}
            className="px-2 py-2 text-right border-l font-semibold bg-accent/60"
            data-testid={`project-total-${group.projectId}-${t.key}`}
          >
            {formatCurrency(group.grandTotalByType[t.key] ?? 0)}
          </td>
        ))}
      </tr>
      {isOpen && group.rows.length === 0 && (
        <tr>
          <td
            colSpan={1 + periodCount * enabledTypes.length + enabledTypes.length}
            className="px-6 py-3 text-sm text-muted-foreground italic border-l"
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
          periodCount={periodCount}
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
  periodCount,
  onToggle,
  isExpanded,
}: {
  row: GridRow;
  enabledTypes: FinancialType[];
  periodCount: number;
  onToggle: () => void;
  isExpanded: boolean;
}) {
  const indent = (row.level + 1) * 16; // +1 to nest under project header
  const isGroup = row.type !== "item";

  const bgByType: Record<string, string> = {
    view: "bg-muted/20 font-semibold",
    category: "bg-muted/10 font-medium",
    specification: "",
    item: "",
  };

  return (
    <tr
      className={`${bgByType[row.type] || ""} ${isGroup ? "cursor-pointer hover:bg-muted/30" : ""} border-t`}
      onClick={isGroup ? onToggle : undefined}
    >
      <td className="px-3 py-1.5 sticky left-0 z-10 border-r bg-card">
        <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
          {row.hasChildren ? (
            isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <span className="inline-block w-3.5" />
          )}
          <span>{row.label}</span>
        </div>
      </td>
      {Array.from({ length: periodCount }).map((_, i) => (
        enabledTypes.map(t => {
          const val = row.monthlyByType[t.key]?.[i] ?? 0;
          return (
            <td key={`${row.key}-${i}-${t.key}`} className="px-2 py-1.5 text-right border-l tabular-nums">
              {formatCurrency(val)}
            </td>
          );
        })
      ))}
      {enabledTypes.map(t => (
        <td key={`${row.key}-total-${t.key}`} className="px-2 py-1.5 text-right border-l bg-muted/30 tabular-nums">
          {formatCurrency(row.totalByType[t.key] ?? 0)}
        </td>
      ))}
    </tr>
  );
}
