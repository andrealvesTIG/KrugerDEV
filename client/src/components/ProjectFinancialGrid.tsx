import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useIsFetching } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, DollarSign, FileSpreadsheet, Maximize2, Minimize2, Search, ArrowUpDown, Lock, MoreVertical, ChevronsDownUp, ChevronsUpDown, Loader2, Undo2, Redo2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Activity, Sparkles, Target, Flame, Gauge } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FinancialEntry, FinancialTypesConfig, FinancialType, CostItemCategoriesConfig } from "@shared/schema";
import { DEFAULT_FINANCIAL_TYPES, DEFAULT_COST_ITEM_CATEGORIES } from "@shared/schema";
import { CompactCurrency } from "@/components/CompactCurrency";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";

interface ProjectFinancialGridProps {
  projectId: number;
}

type FinancialTypeKey = string;

// Per–financial-type color palette. The three system keys (aop/fcst/act) get
// dedicated brand colors; custom keys cycle through the fallback palette so any
// admin-added type still pops visibly in the toolbar.
const TYPE_PALETTES: Record<string, {
  activeBg: string; activeText: string; activeRing: string; dotOn: string; dotOff: string;
}> = {
  aop: {
    activeBg: "bg-blue-500/15 dark:bg-blue-400/20",
    activeText: "text-blue-700 dark:text-blue-200",
    activeRing: "ring-1 ring-inset ring-blue-500/40",
    dotOn: "bg-blue-500",
    dotOff: "bg-blue-500/30",
  },
  fcst: {
    activeBg: "bg-amber-500/15 dark:bg-amber-400/20",
    activeText: "text-amber-800 dark:text-amber-200",
    activeRing: "ring-1 ring-inset ring-amber-500/40",
    dotOn: "bg-amber-500",
    dotOff: "bg-amber-500/30",
  },
  act: {
    activeBg: "bg-emerald-500/15 dark:bg-emerald-400/20",
    activeText: "text-emerald-700 dark:text-emerald-200",
    activeRing: "ring-1 ring-inset ring-emerald-500/40",
    dotOn: "bg-emerald-500",
    dotOff: "bg-emerald-500/30",
  },
  eac: {
    activeBg: "bg-slate-500/15 dark:bg-slate-400/20",
    activeText: "text-slate-700 dark:text-slate-200",
    activeRing: "ring-1 ring-inset ring-slate-500/40",
    dotOn: "bg-slate-500",
    dotOff: "bg-slate-500/30",
  },
};
const FALLBACK_TYPE_PALETTES = [
  { activeBg: "bg-violet-500/15 dark:bg-violet-400/20", activeText: "text-violet-700 dark:text-violet-200", activeRing: "ring-1 ring-inset ring-violet-500/40", dotOn: "bg-violet-500", dotOff: "bg-violet-500/30" },
  { activeBg: "bg-pink-500/15 dark:bg-pink-400/20",     activeText: "text-pink-700 dark:text-pink-200",     activeRing: "ring-1 ring-inset ring-pink-500/40",   dotOn: "bg-pink-500",   dotOff: "bg-pink-500/30" },
  { activeBg: "bg-cyan-500/15 dark:bg-cyan-400/20",     activeText: "text-cyan-700 dark:text-cyan-200",     activeRing: "ring-1 ring-inset ring-cyan-500/40",   dotOn: "bg-cyan-500",   dotOff: "bg-cyan-500/30" },
  { activeBg: "bg-rose-500/15 dark:bg-rose-400/20",     activeText: "text-rose-700 dark:text-rose-200",     activeRing: "ring-1 ring-inset ring-rose-500/40",   dotOn: "bg-rose-500",   dotOff: "bg-rose-500/30" },
  { activeBg: "bg-teal-500/15 dark:bg-teal-400/20",     activeText: "text-teal-700 dark:text-teal-200",     activeRing: "ring-1 ring-inset ring-teal-500/40",   dotOn: "bg-teal-500",   dotOff: "bg-teal-500/30" },
];
function getTypePalette(key: string) {
  if (TYPE_PALETTES[key]) return TYPE_PALETTES[key];
  // Stable hash so the same custom key always gets the same color.
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return FALLBACK_TYPE_PALETTES[Math.abs(h) % FALLBACK_TYPE_PALETTES.length];
}

const MONTHS = [
  { num: 1, label: "Oct" },
  { num: 2, label: "Nov" },
  { num: 3, label: "Dec" },
  { num: 4, label: "Jan" },
  { num: 5, label: "Feb" },
  { num: 6, label: "Mar" },
  { num: 7, label: "Apr" },
  { num: 8, label: "May" },
  { num: 9, label: "Jun" },
  { num: 10, label: "Jul" },
  { num: 11, label: "Aug" },
  { num: 12, label: "Sep" },
];

// Legacy free-form category list — no longer surfaced in the UI. The
// configurable Financial View → Cost Category → Cost Specification
// hierarchy from CostItemCategoriesConfig replaces it. The DB column
// `category` is preserved for backward-compat reads of existing rows.
const _LEGACY_CATEGORIES_DEPRECATED = [
  "Direct Expense",
  "Licenses",
  "Outside Services",
  "Travel/Meals",
  "Project Material",
  "Labor",
  "Equipment",
  "Other",
];

// ----- Tree types built from flat entries -----
type RowType = "view" | "category" | "specification" | "item";

interface GridRow {
  type: RowType;
  level: number;
  key: string;            // unique row id (e.g., "view::Capital")
  label: string;
  // For "item" rows we carry the dimensions + monthly values per scenario.
  itemKey?: string;
  itemName?: string;
  category?: string | null;
  wbs?: string | null;
  comments?: string | null;
  // monthlyByType[typeKey] = number[12]
  monthlyByType: Record<string, number[]>;
  // totalByType[typeKey] = sum of 12 cells for this row in that scenario
  totalByType: Record<string, number>;
  hasChildren: boolean;
}

function formatCurrency(value: number): string {
  if (!value) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ===== Variance & Insights helpers =====
type VarianceMode = "off" | "forecast" | "budget";
type VarianceStatus = "ok" | "risk" | "over" | "under" | "none";

interface VarianceCalc {
  varDollar: number;
  varPct: number;        // signed; positive = bad (over budget / actuals exceed forecast)
  status: VarianceStatus;
  available: boolean;
  baseline: number;      // denominator used for varPct (FCST YTD or AOP)
  current: number;       // numerator (ACT YTD or EAC)
  pctAvailable: boolean; // false when baseline is 0 (var % is N/A)
}

function statusFromPct(pct: number, baseline: number): VarianceStatus {
  if (baseline === 0 && pct === 0) return "none";
  const abs = Math.abs(pct);
  if (abs <= 0.05) return "ok";
  if (pct < 0 && abs > 0.05) return "under"; // meaningfully under baseline (favorable)
  if (abs <= 0.15) return "risk";
  return "over";
}

// FY position relative to "today": "past" (FY ended) → YTD = full year,
// "current" (today is in this FY) → YTD up to currentMonthIdx,
// "future" (FY hasn't started) → YTD = 0.
type FyPosition = "past" | "current" | "future";

function computeVariance(
  monthly: Record<string, number[]> | undefined,
  totals: Record<string, number> | undefined,
  mode: VarianceMode,
  currentMonthIdx: number,
  fyPosition: FyPosition = "current",
): VarianceCalc {
  const empty: VarianceCalc = { varDollar: 0, varPct: 0, status: "none", available: false, baseline: 0, current: 0, pctAvailable: false };
  if (mode === "off" || !monthly || !totals) return empty;
  const actArr = monthly["act"] ?? new Array(12).fill(0);
  const fcstArr = monthly["fcst"] ?? new Array(12).fill(0);
  const aopTotal = totals["aop"] ?? 0;

  // Effective month cutoff: -1 means "no months counted yet" (future FY),
  // 11 means "all months counted" (past FY).
  const cutoff = fyPosition === "past" ? 11
    : fyPosition === "future" ? -1
    : currentMonthIdx;

  if (mode === "forecast") {
    let actYTD = 0, fcstYTD = 0;
    for (let i = 0; i <= cutoff; i++) {
      actYTD += actArr[i] ?? 0;
      fcstYTD += fcstArr[i] ?? 0;
    }
    const v = actYTD - fcstYTD;
    const pctAvailable = fcstYTD !== 0;
    const pct = pctAvailable ? v / fcstYTD : 0;
    return {
      varDollar: v,
      varPct: pct,
      status: pctAvailable ? statusFromPct(pct, fcstYTD) : (v === 0 ? "none" : "risk"),
      available: !!(fcstYTD || actYTD),
      baseline: fcstYTD,
      current: actYTD,
      pctAvailable,
    };
  }
  // budget mode: EAC vs AOP
  let actYTD = 0;
  let fcstRemaining = 0;
  for (let i = 0; i <= cutoff; i++) actYTD += actArr[i] ?? 0;
  for (let i = cutoff + 1; i < 12; i++) fcstRemaining += fcstArr[i] ?? 0;
  const eac = actYTD + fcstRemaining;
  const v = eac - aopTotal;
  const pctAvailable = aopTotal !== 0;
  const pct = pctAvailable ? v / aopTotal : 0;
  return {
    varDollar: v,
    varPct: pct,
    status: pctAvailable ? statusFromPct(pct, aopTotal) : (v === 0 ? "none" : "risk"),
    available: !!(aopTotal || eac),
    baseline: aopTotal,
    current: eac,
    pctAvailable,
  };
}

const STATUS_STYLES: Record<VarianceStatus, { dot: string; pill: string; accent: string; label: string }> = {
  ok:    { dot: "bg-emerald-500",  pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/30", accent: "border-emerald-500", label: "On Track" },
  under: { dot: "bg-emerald-500",  pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/30", accent: "border-emerald-500", label: "Under" },
  risk:  { dot: "bg-amber-500",    pill: "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30",       accent: "border-amber-500",   label: "At Risk" },
  over:  { dot: "bg-red-500",      pill: "bg-red-500/15 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-500/30",                accent: "border-red-500",     label: "Over" },
  none:  { dot: "bg-muted-foreground/40", pill: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",                            accent: "border-transparent", label: "—" },
};

function formatPct(p: number): string {
  if (!isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(1)}%`;
}

// Per-cell tone for ACT-vs-FCST and FCST-vs-AOP comparison.
// Returns Tailwind classes to apply to the cell's container.
function getCellTone(
  typeKey: string,
  monthVal: number,
  baselineMonthVal: number,
  thresholds: { warn: number; bad: number },
): string {
  if (typeKey !== "act" && typeKey !== "fcst") return "";
  if (baselineMonthVal === 0) return "";
  const diff = monthVal - baselineMonthVal;
  const pct = diff / Math.abs(baselineMonthVal);
  const abs = Math.abs(pct);
  if (abs <= thresholds.warn) return "";
  if (pct > 0 && abs > thresholds.bad)  return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (pct > 0 && abs > thresholds.warn) return "bg-amber-500/10 text-amber-800 dark:text-amber-300";
  if (pct < 0 && abs > thresholds.bad)  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (pct < 0 && abs > thresholds.warn) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  return "";
}

/**
 * Build the grouped + flattened grid rows from the flat list of financial
 * entries across ALL enabled scenarios. Each row carries 12 monthly values
 * per scenario so the grid can render scenario sub-columns under each month.
 * Grouping order: Financial View → Cost Category → Cost Specification → Item.
 * Subtotals at every level are computed from the leaf cells, per scenario.
 */
function buildGridRows(
  entries: FinancialEntry[],
  typeKeys: string[],
  expanded: Set<string>,
  costConfig: CostItemCategoriesConfig,
): { rows: GridRow[]; grandTotalByType: Record<string, number> } {
  const emptyMonthly = () => {
    const obj: Record<string, number[]> = {};
    for (const k of typeKeys) obj[k] = new Array(12).fill(0);
    return obj;
  };
  const emptyTotal = () => {
    const obj: Record<string, number> = {};
    for (const k of typeKeys) obj[k] = 0;
    return obj;
  };
  const typeSet = new Set(typeKeys);

  // Fold cells of the same item into one record with per-scenario monthly arrays.
  type ItemAgg = {
    itemKey: string;
    itemName: string;
    financialView: string;
    costCategory: string;
    costSpecification: string;
    category: string | null;
    wbs: string | null;
    comments: string | null;
    sortOrder: number;
    monthlyByType: Record<string, number[]>;
  };
  const items = new Map<string, ItemAgg>();
  for (const e of entries) {
    if (!typeSet.has(e.scenario)) continue;
    let agg = items.get(e.itemKey);
    if (!agg) {
      agg = {
        itemKey: e.itemKey,
        itemName: e.itemName,
        financialView: e.financialView || "Uncategorized",
        costCategory: e.costCategory || "Uncategorized",
        costSpecification: e.costSpecification || "—",
        category: e.category,
        wbs: e.wbs,
        comments: e.comments,
        sortOrder: e.sortOrder ?? 0,
        monthlyByType: emptyMonthly(),
      };
      items.set(e.itemKey, agg);
    }
    agg.monthlyByType[e.scenario][e.month - 1] = Number(e.amount) || 0;
  }

  // Group by view → category → specification → item
  const tree: Record<string, Record<string, Record<string, ItemAgg[]>>> = {};
  for (const it of items.values()) {
    const v = it.financialView;
    const c = it.costCategory;
    const s = it.costSpecification;
    tree[v] ??= {};
    tree[v][c] ??= {};
    tree[v][c][s] ??= [];
    tree[v][c][s].push(it);
  }

  const rows: GridRow[] = [];
  const grandTotalByType = emptyTotal();
  const addMonthly = (acc: Record<string, number[]>, add: Record<string, number[]>) => {
    for (const k of typeKeys) {
      for (let i = 0; i < 12; i++) acc[k][i] += add[k][i];
    }
  };
  const addTotals = (acc: Record<string, number>, add: Record<string, number>) => {
    for (const k of typeKeys) acc[k] += add[k];
  };
  const sumRow = (m: Record<string, number[]>): Record<string, number> => {
    const out = emptyTotal();
    for (const k of typeKeys) out[k] = m[k].reduce((a, b) => a + b, 0);
    return out;
  };

  // Order Financial Views by configured order first; any view label that shows
  // up in entries but isn't in config (renamed/disabled/legacy) appears at the
  // end, alphabetically, so historical rows still render.
  const enabledViewLabels = costConfig.views
    .filter(v => v.enabled)
    .sort((a, b) => a.order - b.order)
    .map(v => v.label);
  const presentViewLabels = Object.keys(tree);
  const presentSet = new Set(presentViewLabels);
  const orderedViews: string[] = [];
  for (const lbl of enabledViewLabels) {
    if (presentSet.has(lbl) && !orderedViews.includes(lbl)) orderedViews.push(lbl);
  }
  for (const lbl of presentViewLabels.sort()) {
    if (!orderedViews.includes(lbl)) orderedViews.push(lbl);
  }
  // For category ordering within a view, use config order when matched by label.
  const categoryOrderForView = (viewLabel: string): string[] => {
    const view = costConfig.views.find(v => v.label === viewLabel);
    if (!view) return [];
    return costConfig.categories
      .filter(c => c.viewKey === view.key && c.enabled)
      .sort((a, b) => a.order - b.order)
      .map(c => c.label);
  };
  const specificationOrderForCategory = (viewLabel: string, catLabel: string): string[] => {
    const view = costConfig.views.find(v => v.label === viewLabel);
    if (!view) return [];
    const cat = costConfig.categories.find(c => c.viewKey === view.key && c.label === catLabel);
    if (!cat) return [];
    return costConfig.specifications
      .filter(s => s.categoryKey === cat.key && s.enabled)
      .sort((a, b) => a.order - b.order)
      .map(s => s.label);
  };

  const sortedViews = orderedViews;
  for (const v of sortedViews) {
    const viewKey = `view::${v}`;
    const viewMonthly = emptyMonthly();
    const viewTotals = emptyTotal();

    const presentCats = Object.keys(tree[v]);
    const catOrder = categoryOrderForView(v);
    const sortedCats: string[] = [];
    for (const lbl of catOrder) {
      if (presentCats.includes(lbl) && !sortedCats.includes(lbl)) sortedCats.push(lbl);
    }
    for (const lbl of presentCats.sort()) {
      if (!sortedCats.includes(lbl)) sortedCats.push(lbl);
    }
    const catRows: GridRow[] = [];
    for (const c of sortedCats) {
      const catKey = `${viewKey}::cat::${c}`;
      const catMonthly = emptyMonthly();
      const catTotals = emptyTotal();

      const presentSpecs = Object.keys(tree[v][c]);
      const specOrder = specificationOrderForCategory(v, c);
      const sortedSpecs: string[] = [];
      for (const lbl of specOrder) {
        if (presentSpecs.includes(lbl) && !sortedSpecs.includes(lbl)) sortedSpecs.push(lbl);
      }
      for (const lbl of presentSpecs.sort()) {
        if (!sortedSpecs.includes(lbl)) sortedSpecs.push(lbl);
      }
      const specRows: GridRow[] = [];
      for (const s of sortedSpecs) {
        const specKey = `${catKey}::spec::${s}`;
        const specMonthly = emptyMonthly();
        const specTotals = emptyTotal();

        const itemList = tree[v][c][s].slice().sort(
          (a, b) => (a.sortOrder - b.sortOrder) || a.itemName.localeCompare(b.itemName),
        );
        const itemRows: GridRow[] = [];
        for (const it of itemList) {
          const itemTotals = sumRow(it.monthlyByType);
          itemRows.push({
            type: "item",
            level: 3,
            key: `${specKey}::item::${it.itemKey}`,
            label: it.itemName,
            itemKey: it.itemKey,
            itemName: it.itemName,
            category: it.category,
            wbs: it.wbs,
            comments: it.comments,
            monthlyByType: it.monthlyByType,
            totalByType: itemTotals,
            hasChildren: false,
          });
          addMonthly(specMonthly, it.monthlyByType);
          addTotals(specTotals, itemTotals);
        }

        specRows.push({
          type: "specification",
          level: 2,
          key: specKey,
          label: s,
          monthlyByType: specMonthly,
          totalByType: specTotals,
          hasChildren: itemRows.length > 0,
        });
        if (expanded.has(specKey)) specRows.push(...itemRows);
        addMonthly(catMonthly, specMonthly);
        addTotals(catTotals, specTotals);
      }

      catRows.push({
        type: "category",
        level: 1,
        key: catKey,
        label: c,
        monthlyByType: catMonthly,
        totalByType: catTotals,
        hasChildren: specRows.length > 0,
      });
      if (expanded.has(catKey)) catRows.push(...specRows);
      addMonthly(viewMonthly, catMonthly);
      addTotals(viewTotals, catTotals);
    }

    rows.push({
      type: "view",
      level: 0,
      key: viewKey,
      label: v,
      monthlyByType: viewMonthly,
      totalByType: viewTotals,
      hasChildren: catRows.length > 0,
    });
    if (expanded.has(viewKey)) rows.push(...catRows);
    addTotals(grandTotalByType, viewTotals);
  }

  return { rows, grandTotalByType };
}

export default function ProjectFinancialGrid({ projectId }: ProjectFinancialGridProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  // Period view-mode: collapses the 12-month column model into 4 quarters or
  // a single fiscal-year column. Editing is only allowed in `month` view since
  // entries are still stored per-month server-side; quarter/year cells render
  // as read-only aggregates. Persisted in-memory only (per task spec).
  type ViewMode = "month" | "quarter" | "year";
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const isMonthView = viewMode === "month";

  const orgId = currentOrganization?.id;
  const { data: typesConfig } = useQuery<FinancialTypesConfig>({
    queryKey: ["/api/organizations", orgId, "financial-types"],
    enabled: !!orgId,
  });

  // Configurable Financial View / Cost Category / Cost Specification hierarchy
  // (managed in Org Settings → Financials → Cost Item Categories).
  const { data: costCatConfig } = useQuery<CostItemCategoriesConfig>({
    queryKey: ["/api/organizations", orgId, "cost-item-categories"],
    enabled: !!orgId,
  });
  const costConfig: CostItemCategoriesConfig = useMemo(
    () => costCatConfig ?? DEFAULT_COST_ITEM_CATEGORIES,
    [costCatConfig],
  );
  const enabledViews = useMemo(
    () => [...costConfig.views].filter(v => v.enabled).sort((a, b) => a.order - b.order),
    [costConfig],
  );
  const enabledCategoriesByViewLabel = (viewLabel: string) => {
    const view = costConfig.views.find(v => v.label === viewLabel);
    if (!view) return [];
    return costConfig.categories
      .filter(c => c.viewKey === view.key && c.enabled)
      .sort((a, b) => a.order - b.order);
  };
  const enabledSpecsByCategoryLabel = (viewLabel: string, categoryLabel: string) => {
    const view = costConfig.views.find(v => v.label === viewLabel);
    if (!view) return [];
    const cat = costConfig.categories.find(c => c.viewKey === view.key && c.label === categoryLabel);
    if (!cat) return [];
    return costConfig.specifications
      .filter(s => s.categoryKey === cat.key && s.enabled)
      .sort((a, b) => a.order - b.order);
  };

  // Server-defined scenarios (which exist + editable flag are org-wide).
  // Visibility (enabled flag) is overridden per-browser via localStorage so each
  // user's column show/hide preference doesn't affect teammates.
  const visibilityStorageKey = orgId ? `fr.financial-type-visibility.${orgId}` : null;
  const [visibilityOverride, setVisibilityOverride] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined" || !visibilityStorageKey) return {};
    try {
      const raw = window.localStorage.getItem(visibilityStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Re-load override when org changes
  useEffect(() => {
    if (typeof window === "undefined" || !visibilityStorageKey) return;
    try {
      const raw = window.localStorage.getItem(visibilityStorageKey);
      setVisibilityOverride(raw ? JSON.parse(raw) : {});
    } catch {
      setVisibilityOverride({});
    }
  }, [visibilityStorageKey]);

  const allTypes: FinancialType[] = useMemo(() => {
    const base = typesConfig?.types ?? DEFAULT_FINANCIAL_TYPES.types;
    return base.map(s =>
      Object.prototype.hasOwnProperty.call(visibilityOverride, s.key)
        ? { ...s, enabled: !!visibilityOverride[s.key] }
        : s,
    );
  }, [typesConfig, visibilityOverride]);

  const enabledTypes: FinancialType[] = useMemo(
    () => allTypes.filter(s => s.enabled),
    [allTypes],
  );

  const toggleTypeVisibility = (typeKey: string) => {
    const current = allTypes.find(s => s.key === typeKey);
    if (!current) return;
    const nextEnabled = !current.enabled;
    // Don't allow hiding the last visible scenario.
    const remaining = allTypes.filter(s =>
      s.key === typeKey ? nextEnabled : s.enabled,
    );
    if (remaining.length === 0) {
      toast({ title: "At least one financial type must stay visible", variant: "destructive" });
      return;
    }
    setVisibilityOverride(prev => {
      const next = { ...prev, [typeKey]: nextEnabled };
      if (typeof window !== "undefined" && visibilityStorageKey) {
        try { window.localStorage.setItem(visibilityStorageKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  // Resizable splitter between the frozen left section (Cost Item / Comments /
  // WBS) and the scrollable right section. The offset is added to COL_COST and
  // persisted per-org in localStorage.
  const splitterStorageKey = orgId ? `fr.financial-grid-frozen-offset.${orgId}` : null;
  // Tracks an in-flight drag so unmount can cleanly tear down listeners
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      if (dragCleanupRef.current) {
        dragCleanupRef.current();
        dragCleanupRef.current = null;
      }
    };
  }, []);
  const [frozenOffsetPx, setFrozenOffsetPx] = useState<number>(() => {
    if (typeof window === "undefined" || !splitterStorageKey) return 0;
    try {
      const raw = window.localStorage.getItem(splitterStorageKey);
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !splitterStorageKey) return;
    try {
      const raw = window.localStorage.getItem(splitterStorageKey);
      const n = raw ? Number(raw) : 0;
      setFrozenOffsetPx(Number.isFinite(n) ? n : 0);
    } catch {
      setFrozenOffsetPx(0);
    }
  }, [splitterStorageKey]);

  const { user } = useAuth();
  const expandedStorageKey = useMemo(
    () => (user?.id ? `financial-grid-expanded-${user.id}-${projectId}` : null),
    [user?.id, projectId],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const key = user?.id ? `financial-grid-expanded-${user.id}-${projectId}` : null;
      if (!key) return new Set();
      const saved = window.localStorage.getItem(key);
      if (!saved) return new Set();
      const arr = JSON.parse(saved);
      return Array.isArray(arr) ? new Set<string>(arr) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist expand/collapse state per user + project so reopening the grid
  // restores the same view. Reload from storage when the scope changes
  // (different user or project).
  useEffect(() => {
    if (!expandedStorageKey) return;
    try {
      const saved = window.localStorage.getItem(expandedStorageKey);
      setExpanded(saved ? new Set<string>(JSON.parse(saved)) : new Set());
    } catch {
      setExpanded(new Set());
    }
  }, [expandedStorageKey]);

  useEffect(() => {
    if (!expandedStorageKey) return;
    try {
      window.localStorage.setItem(
        expandedStorageKey,
        JSON.stringify(Array.from(expanded)),
      );
    } catch {}
  }, [expanded, expandedStorageKey]);

  const [editingCell, setEditingCell] = useState<{ itemKey: string; month: number; typeKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  // Inline text-field editing for Cost Item / Comments / WBS columns.
  const [editingText, setEditingText] = useState<{ itemKey: string; field: "itemName" | "comments" | "wbs" } | null>(null);
  const [editTextValue, setEditTextValue] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GridRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<GridRow | null>(null);

  // Inline "quick-add" placeholder row inserted directly under a source item
  // when the user clicks its "+" button. The user types the new item's name
  // in-grid and presses Enter to save (Esc / empty blur cancels). The new
  // item inherits the source row's grouping fields so no dialog is needed.
  const [placeholder, setPlaceholder] = useState<{
    afterItemKey: string;
    level: number;
    financialView: string | null;
    costCategory: string | null;
    costSpecification: string | null;
    category: string | null;
  } | null>(null);
  const [placeholderName, setPlaceholderName] = useState("");

  // Permanent "blank" new-item row appended after the last cost item in
  // every leaf specification group. Type a name + Enter creates the item
  // with the group's Financial View / Cost Category / Specification
  // inherited automatically — no dialog needed. Keyed by specKey so each
  // group keeps its own draft input.
  const [quickAddInputs, setQuickAddInputs] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    itemName: "",
    financialView: "Capital",
    costCategory: "",
    costSpecification: "",
    category: "",
    wbs: "",
    comments: "",
  });

  const { data: entries = [], isLoading } = useQuery<FinancialEntry[]>({
    queryKey: ["/api/projects", projectId, "financial-entries", fiscalYear],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/financial-entries?fiscalYear=${fiscalYear}`);
      if (!res.ok) throw new Error("Failed to fetch financial entries");
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "financial-entries"] });
  };

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", `/api/projects/${projectId}/financial-items`, data),
    onSuccess: () => {
      invalidate();
      toast({ title: "Item created" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) =>
      toast({ title: "Failed to create item", description: err?.message, variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemKey, data }: { itemKey: string; data: any }) =>
      apiRequest("PATCH", `/api/projects/${projectId}/financial-items/${itemKey}`, { ...data, fiscalYear }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Item updated" });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: any) =>
      toast({ title: "Failed to update item", description: err?.message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemKey: string) =>
      apiRequest("DELETE", `/api/projects/${projectId}/financial-items/${itemKey}?fiscalYear=${fiscalYear}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Item deleted" });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: (err: any) =>
      toast({ title: "Failed to delete item", description: err?.message, variant: "destructive" }),
  });

  const updateCellMutation = useMutation({
    mutationFn: async (data: { itemKey: string; type: FinancialTypeKey; month: number; amount: number }) =>
      apiRequest("PUT", `/api/projects/${projectId}/financial-cells`, { fiscalYear, ...data }),
    onSuccess: () => invalidate(),
    onError: (err: any) =>
      toast({ title: "Failed to update cell", description: err?.message, variant: "destructive" }),
  });

  // ---------- Undo / Redo ----------
  // The history endpoint returns every change-log row for the project, each with
  // an `undone` flag. canUndo = at least one active row exists; canRedo = at
  // least one undone row exists. Any new edit on the server clears the redo
  // stack, so canRedo flips back to false naturally on the next refetch.
  const { data: history = [] } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "financial-entries", "history"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/financial-entries/history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const isLegacyUndoRow = (h: any) => {
    try {
      const a = h.newValues ? JSON.parse(h.newValues) : null;
      if (a && a.__undo) return true;
      const b = h.previousValues ? JSON.parse(h.previousValues) : null;
      if (b && b.__undo) return true;
    } catch {}
    return false;
  };
  const canUndo = useMemo(
    // Deletions are now undoable — the server snapshots cells when an item is
    // deleted and restores them on undo.
    () => history.some(h => !h.undone && !isLegacyUndoRow(h)),
    [history],
  );
  const canRedo = useMemo(
    () => history.some(h => h.undone && !isLegacyUndoRow(h)),
    [history],
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "financial-entries"] });
  };

  const undoMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/projects/${projectId}/financial-entries/undo`),
    onSuccess: async (res: any) => {
      const data = await (res?.json ? res.json() : res);
      invalidateAll();
      toast({ title: "Undone", description: data?.message });
    },
    onError: (err: any) =>
      toast({ title: "Nothing to undo", description: err?.message, variant: "destructive" }),
  });

  const redoMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/projects/${projectId}/financial-entries/redo`),
    onSuccess: async (res: any) => {
      const data = await (res?.json ? res.json() : res);
      invalidateAll();
      toast({ title: "Redone", description: data?.message });
    },
    onError: (err: any) =>
      toast({ title: "Nothing to redo", description: err?.message, variant: "destructive" }),
  });

  // Keyboard shortcuts: Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z or Ctrl+Y to redo.
  // We deliberately ignore the event when focus is in an editable element so we
  // don't hijack the browser's native undo for text inputs (incl. cell editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tgt?.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        if (canUndo && !undoMutation.isPending) {
          e.preventDefault();
          undoMutation.mutate();
        }
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        if (canRedo && !redoMutation.isPending) {
          e.preventDefault();
          redoMutation.mutate();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, canRedo, undoMutation, redoMutation]);

  // Background-activity indicator: lights up when the entries query is
  // refetching OR any project-financials mutation is in flight, so the
  // user always knows the grid is syncing with the server.
  const fetchingEntries = useIsFetching({
    queryKey: ["/api/projects", projectId, "financial-entries"],
  });
  const localBusy =
    createItemMutation.isPending ||
    updateItemMutation.isPending ||
    deleteItemMutation.isPending ||
    updateCellMutation.isPending;
  const isBusy = fetchingEntries > 0 || localBusy;

  const enabledTypeKeys = useMemo(() => enabledTypes.map(s => s.key), [enabledTypes]);
  const editableTypeKeys = useMemo(
    () => enabledTypes.filter(s => s.editable).map(s => s.key),
    [enabledTypes],
  );

  // EAC (Estimate at Completion) — virtual scenario blending Actuals through the
  // current month with Forecast for remaining months. Toggle is per-browser
  // and persists alongside the other scenario visibility preferences.
  const eacStorageKey = orgId ? `fr.financial-grid-show-eac.${orgId}` : null;
  const [showEac, setShowEacState] = useState<boolean>(() => {
    if (typeof window === "undefined" || !eacStorageKey) return false;
    try {
      return window.localStorage.getItem(eacStorageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !eacStorageKey) return;
    try {
      setShowEacState(window.localStorage.getItem(eacStorageKey) === "1");
    } catch {
      setShowEacState(false);
    }
  }, [eacStorageKey]);
  const toggleShowEac = () => {
    setShowEacState(prev => {
      const next = !prev;
      if (typeof window !== "undefined" && eacStorageKey) {
        try { window.localStorage.setItem(eacStorageKey, next ? "1" : "0"); } catch {}
      }
      return next;
    });
  };

  // ===== Variance + Insights persisted preferences (per-org) =====
  const varianceStorageKey = orgId ? `fr.financial-variance-mode.${orgId}` : null;
  const insightsStorageKey = orgId ? `fr.financial-insights-show.${orgId}` : null;
  const [varianceMode, setVarianceModeState] = useState<VarianceMode>(() => {
    if (typeof window === "undefined" || !varianceStorageKey) return "off";
    try {
      const v = window.localStorage.getItem(varianceStorageKey) as VarianceMode | null;
      return v === "forecast" || v === "budget" || v === "off" ? v : "off";
    } catch { return "off"; }
  });
  const [showInsights, setShowInsightsState] = useState<boolean>(() => {
    if (typeof window === "undefined" || !insightsStorageKey) return true;
    try { return window.localStorage.getItem(insightsStorageKey) !== "0"; } catch { return true; }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !varianceStorageKey) return;
    try {
      const v = window.localStorage.getItem(varianceStorageKey) as VarianceMode | null;
      setVarianceModeState(v === "forecast" || v === "budget" || v === "off" ? v : "off");
    } catch { setVarianceModeState("off"); }
  }, [varianceStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined" || !insightsStorageKey) return;
    try { setShowInsightsState(window.localStorage.getItem(insightsStorageKey) !== "0"); } catch { setShowInsightsState(true); }
  }, [insightsStorageKey]);
  const setVarianceMode = (m: VarianceMode) => {
    setVarianceModeState(m);
    if (typeof window !== "undefined" && varianceStorageKey) {
      try { window.localStorage.setItem(varianceStorageKey, m); } catch {}
    }
  };
  const toggleInsights = () => {
    setShowInsightsState(prev => {
      const next = !prev;
      if (typeof window !== "undefined" && insightsStorageKey) {
        try { window.localStorage.setItem(insightsStorageKey, next ? "1" : "0"); } catch {}
      }
      return next;
    });
  };
  // Variance columns appended after the financial-type columns in the Total
  // block. Only present when variance mode is on. Each is read-only, derived.
  const varianceCols = useMemo(() => {
    if (varianceMode === "off") return [] as { key: string; label: string }[];
    return [
      { key: "var_dollar", label: "Var $" },
      { key: "var_pct", label: "Var %" },
      { key: "var_status", label: "Status" },
    ];
  }, [varianceMode]);
  // Cell-tone thresholds for ACT-vs-FCST and FCST-vs-AOP comparisons.
  const toneThresholds = { warn: 0.10, bad: 0.25 };

  // For EAC, variance, and insights computation we need aop+act+fcst aggregated
  // regardless of whether the user has hidden them, otherwise the derived
  // values (EAC blend, EAC, variance, KPI tiles) would be missing inputs.
  const aggregationTypeKeys = useMemo(() => {
    const set = new Set(enabledTypeKeys);
    if (showEac || varianceMode !== "off" || showInsights) {
      set.add("act");
      set.add("fcst");
      set.add("aop");
    }
    return Array.from(set);
  }, [enabledTypeKeys, showEac, varianceMode, showInsights]);

  const EAC_TYPE: FinancialType = useMemo(
    () => ({ key: "eac", label: "EAC", enabled: true, editable: false }),
    [],
  );
  // What the grid renders in the TOTAL column block. EAC is appended when
  // toggled on so it doesn't disturb the ordering of real scenarios.
  const displayedTypes: FinancialType[] = useMemo(
    () => (showEac ? [...enabledTypes, EAC_TYPE] : enabledTypes),
    [enabledTypes, EAC_TYPE, showEac],
  );
  // What the grid renders for each MONTH. EAC is intentionally excluded —
  // it's only meaningful as a yearly roll-up (Actuals + remaining Forecast),
  // so we surface it only in the Total column.
  const monthDisplayedTypes: FinancialType[] = enabledTypes;

  // Search filter: any token match on item name / wbs / comments / category /
  // financial view / cost category / cost specification keeps the entire item.
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    const matchingItemKeys = new Set<string>();
    for (const e of entries) {
      const hay = [
        e.itemName, e.wbs, e.comments, e.category,
        e.financialView, e.costCategory, e.costSpecification,
      ].filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(q)) matchingItemKeys.add(e.itemKey);
    }
    return entries.filter(e => matchingItemKeys.has(e.itemKey));
  }, [entries, searchQuery]);

  const { rows: rawRows, grandTotalByType: rawGrandTotalByType } = useMemo(
    () => buildGridRows(filteredEntries, aggregationTypeKeys, expanded, costConfig),
    [filteredEntries, aggregationTypeKeys, expanded, costConfig],
  );

  // Map each fiscal-month index → calendar (year, month). FY starts in Oct,
  // so idx 0..2 belong to fiscalYear-1 and idx 3..11 belong to fiscalYear.
  const monthCalendar = useMemo(() => {
    return MONTHS.map((_, i) => {
      if (i < 3) return { year: fiscalYear - 1, month: 10 + i };
      return { year: fiscalYear, month: i - 2 };
    });
  }, [fiscalYear]);

  // Highlight today's column (only when today falls inside the displayed FY).
  const currentMonthIdx = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    return monthCalendar.findIndex(mc => mc.year === cy && mc.month === cm);
  }, [monthCalendar]);

  // Inject the virtual EAC series into each row + the grand total. EAC blends
  // act (months ≤ current month) with fcst (months > current month). When the
  // current month is outside the displayed FY we clamp: future FY → all fcst,
  // past FY → all act. When EAC is off these are no-ops on a shallow clone.
  const { rows, grandTotalByType } = useMemo(() => {
    if (!showEac) return { rows: rawRows, grandTotalByType: rawGrandTotalByType };
    const cutoff = currentMonthIdx < 0
      // Negative → today is outside FY. If FY is fully in the past (i.e. its
      // last month is before today's calendar month), treat all months as
      // "past" → EAC = act. Otherwise FY is fully in the future → EAC = fcst.
      ? (() => {
          const last = monthCalendar[monthCalendar.length - 1];
          const now = new Date();
          const beforeNow =
            last.year < now.getFullYear() ||
            (last.year === now.getFullYear() && last.month < now.getMonth() + 1);
          return beforeNow ? 12 : -1;
        })()
      : currentMonthIdx;
    const buildEac = (monthly: Record<string, number[]>): number[] => {
      const act = monthly["act"] ?? new Array(12).fill(0);
      const fcst = monthly["fcst"] ?? new Array(12).fill(0);
      const out = new Array(12).fill(0);
      for (let i = 0; i < 12; i++) out[i] = i <= cutoff ? (act[i] || 0) : (fcst[i] || 0);
      return out;
    };
    const newRows = rawRows.map(r => {
      const eacArr = buildEac(r.monthlyByType);
      const eacTotal = eacArr.reduce((a, b) => a + b, 0);
      const monthlyByType: Record<string, number[]> = { ...r.monthlyByType, eac: eacArr };
      const totalByType: Record<string, number> = { ...r.totalByType, eac: eacTotal };
      return { ...r, monthlyByType, totalByType };
    });
    // Grand total EAC: derive from view rows so it stays consistent with the
    // per-row hierarchy roll-up the rest of the grid renders.
    const gtEac = new Array(12).fill(0);
    for (const r of newRows) {
      if (r.type !== "view") continue;
      for (let i = 0; i < 12; i++) gtEac[i] += r.monthlyByType.eac[i];
    }
    const newGrand: Record<string, number> = {
      ...rawGrandTotalByType,
      eac: gtEac.reduce((a, b) => a + b, 0),
    };
    return { rows: newRows, grandTotalByType: newGrand };
  }, [rawRows, rawGrandTotalByType, showEac, currentMonthIdx, monthCalendar]);

  // ===== Project-level grand monthly totals per type, used by Insights strip =====
  const grandMonthly = useMemo(() => {
    const out: Record<string, number[]> = {
      aop: new Array(12).fill(0),
      fcst: new Array(12).fill(0),
      act: new Array(12).fill(0),
    };
    for (const r of rows) {
      if (r.type !== "view") continue;
      for (const k of ["aop", "fcst", "act"]) {
        const arr = r.monthlyByType[k];
        if (!arr) continue;
        for (let i = 0; i < 12; i++) out[k][i] += arr[i] ?? 0;
      }
    }
    return out;
  }, [rows]);

  // FY position: past / current / future. Drives YTD cutoff in variance and
  // insights so a future FY shows 0 YTD (not full-year totals as YTD).
  const fyPosition: FyPosition = useMemo(() => {
    if (currentMonthIdx >= 0) return "current";
    // currentMonthIdx is -1 when "today" is outside this fiscal year.
    // Compare today vs FY start (Oct 1 of fiscalYear - 1) and FY end (Sep 30 of fiscalYear).
    const today = new Date();
    const fyStart = new Date(fiscalYear - 1, 9, 1); // Oct = month 9
    const fyEnd = new Date(fiscalYear, 8, 30, 23, 59, 59);
    if (today < fyStart) return "future";
    if (today > fyEnd) return "past";
    return "current";
  }, [currentMonthIdx, fiscalYear]);

  const grandVariance = useMemo(
    () => computeVariance(grandMonthly, grandTotalByType, varianceMode === "off" ? "budget" : varianceMode, currentMonthIdx, fyPosition),
    [grandMonthly, grandTotalByType, varianceMode, currentMonthIdx, fyPosition],
  );

  const insights = useMemo(() => {
    const aopTotal = grandTotalByType["aop"] ?? 0;
    const fcstTotal = grandTotalByType["fcst"] ?? 0;
    const actTotal = grandTotalByType["act"] ?? 0;
    const cutoff = fyPosition === "past" ? 11 : fyPosition === "future" ? -1 : currentMonthIdx;
    let actYTD = 0, fcstYTD = 0, fcstRemaining = 0;
    for (let i = 0; i <= cutoff; i++) {
      actYTD += grandMonthly.act[i] ?? 0;
      fcstYTD += grandMonthly.fcst[i] ?? 0;
    }
    for (let i = cutoff + 1; i < 12; i++) fcstRemaining += grandMonthly.fcst[i] ?? 0;
    const eac = actYTD + fcstRemaining;
    const eacVar = eac - aopTotal;
    const eacPct = aopTotal ? eacVar / aopTotal : 0;
    // Forecast accuracy: 1 − |ACT − FCST| / FCST_YTD (clamped 0..1)
    const accuracy = fcstYTD ? Math.max(0, 1 - Math.abs(actYTD - fcstYTD) / Math.abs(fcstYTD)) : null;
    // Burn rate: avg monthly ACT over last 3 completed months vs prior 3
    let burn = 0, burnPrev = 0, burnMonths = 0, burnPrevMonths = 0;
    const cm = fyPosition === "past" ? 11 : currentMonthIdx;
    if (cm >= 0) {
      for (let i = Math.max(0, cm - 2); i <= cm; i++) { burn += grandMonthly.act[i] ?? 0; burnMonths++; }
      for (let i = Math.max(0, cm - 5); i < cm - 2; i++) { burnPrev += grandMonthly.act[i] ?? 0; burnPrevMonths++; }
    }
    const burnAvg = burnMonths ? burn / burnMonths : 0;
    const burnPrevAvg = burnPrevMonths ? burnPrev / burnPrevMonths : 0;
    const burnTrendPct = burnPrevAvg ? (burnAvg - burnPrevAvg) / burnPrevAvg : 0;
    // Months of runway at current burn (vs remaining AOP budget)
    const runway = burnAvg > 0 ? Math.max(0, (aopTotal - actYTD) / burnAvg) : null;
    // Top variance driver across item rows
    let topDriver: { itemKey: string; itemName: string; varDollar: number; status: VarianceStatus } | null = null;
    let topAbs = 0;
    for (const r of rows) {
      if (r.type !== "item" || !r.itemKey) continue;
      const v = computeVariance(r.monthlyByType, r.totalByType, varianceMode === "off" ? "budget" : varianceMode, currentMonthIdx, fyPosition);
      if (!v.available) continue;
      const a = Math.abs(v.varDollar);
      if (a > topAbs) {
        topAbs = a;
        topDriver = { itemKey: r.itemKey, itemName: r.itemName ?? r.label, varDollar: v.varDollar, status: v.status };
      }
    }
    return {
      aopTotal, fcstTotal, actTotal,
      actYTD, fcstYTD, eac, eacVar, eacPct,
      accuracy,
      burnAvg, burnPrevAvg, burnTrendPct,
      runway,
      topDriver,
    };
  }, [grandMonthly, grandTotalByType, currentMonthIdx, rows, varianceMode, fyPosition]);

  // Build period columns based on view mode. Each period carries the set of
  // fiscal-month indices (0..11) it aggregates and the calendar year used by
  // the year-grouping header row.
  type PeriodCol = {
    key: string;
    label: string;
    hint: string;
    monthIndices: number[];
    year: number;
  };
  const periodCols: PeriodCol[] = useMemo(() => {
    if (viewMode === "quarter") {
      return [
        { key: "q1", label: "Q1", hint: "Oct–Dec", monthIndices: [0, 1, 2], year: fiscalYear - 1 },
        { key: "q2", label: "Q2", hint: "Jan–Mar", monthIndices: [3, 4, 5], year: fiscalYear },
        { key: "q3", label: "Q3", hint: "Apr–Jun", monthIndices: [6, 7, 8], year: fiscalYear },
        { key: "q4", label: "Q4", hint: "Jul–Sep", monthIndices: [9, 10, 11], year: fiscalYear },
      ];
    }
    if (viewMode === "year") {
      return [{
        key: "fy",
        label: `FY ${fiscalYear}`,
        hint: "Oct–Sep",
        monthIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        year: fiscalYear,
      }];
    }
    return MONTHS.map((m, i) => ({
      key: `m${m.num}`,
      label: m.label,
      hint: "",
      monthIndices: [i],
      year: monthCalendar[i].year,
    }));
  }, [viewMode, fiscalYear, monthCalendar]);

  // Year-row groupings derived from the active period columns.
  const periodYearGroups = useMemo(() => {
    const groups: { year: number; count: number }[] = [];
    for (const p of periodCols) {
      const last = groups[groups.length - 1];
      if (last && last.year === p.year) last.count += 1;
      else groups.push({ year: p.year, count: 1 });
    }
    return groups;
  }, [periodCols]);

  // Current-period index (the period containing today's month, if any).
  const currentPeriodIdx = useMemo(() => {
    if (currentMonthIdx < 0) return -1;
    return periodCols.findIndex(p => p.monthIndices.includes(currentMonthIdx));
  }, [periodCols, currentMonthIdx]);

  const editableRows = useMemo(() => rows.filter(r => r.type === "item"), [rows]);

  // All expandable group keys (view / category / specification) derived from
  // the current filtered entries. Used by Expand / Collapse All controls.
  const allGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const e of filteredEntries) {
      const v = e.financialView ?? "Uncategorized";
      const c = e.costCategory ?? "Uncategorized";
      const s = e.costSpecification ?? "Uncategorized";
      const viewKey = `view::${v}`;
      const catKey = `${viewKey}::cat::${c}`;
      const specKey = `${catKey}::spec::${s}`;
      keys.add(viewKey);
      keys.add(catKey);
      keys.add(specKey);
    }
    return keys;
  }, [filteredEntries]);

  const allExpanded = allGroupKeys.size > 0 &&
    Array.from(allGroupKeys).every(k => expanded.has(k));

  const expandAll = () => setExpanded(new Set(allGroupKeys));
  const collapseAll = () => setExpanded(new Set());

  const toggleExpand = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  const resetForm = () => {
    setFormData({
      itemName: "",
      financialView: enabledViews[0]?.label ?? "Capital",
      costCategory: "",
      costSpecification: "",
      category: "",
      wbs: "",
      comments: "",
    });
    setEditingItem(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  // Insert an inline placeholder row directly below the source row instead
  // of opening the Add Item dialog. The placeholder inherits the source
  // row's grouping fields (financial view / cost category / specification /
  // category) so the user only has to type the new item's name in-grid and
  // press Enter to save. Esc or blur with empty name discards it. The
  // dialog flow is still available via the toolbar's main "Add Item" button
  // for users who want to fill every field.
  const openAddSiblingPlaceholder = (row: GridRow) => {
    if (row.type !== "item" || !row.itemKey) return;
    const sample = entries.find(e => e.itemKey === row.itemKey);
    setPlaceholderName("");
    setPlaceholder({
      afterItemKey: row.itemKey,
      level: row.level,
      financialView: sample?.financialView ?? null,
      costCategory: sample?.costCategory ?? null,
      costSpecification: sample?.costSpecification ?? null,
      category: row.category ?? null,
    });
  };

  const cancelPlaceholder = () => {
    setPlaceholder(null);
    setPlaceholderName("");
  };

  const savePlaceholder = () => {
    if (!placeholder) return;
    const name = placeholderName.trim();
    if (!name) {
      cancelPlaceholder();
      return;
    }
    createItemMutation.mutate({
      fiscalYear,
      itemName: name,
      financialView: placeholder.financialView,
      costCategory: placeholder.costCategory,
      costSpecification: placeholder.costSpecification,
      category: placeholder.category,
      wbs: null,
      comments: null,
    });
    setPlaceholder(null);
    setPlaceholderName("");
  };

  const openEditDialog = (row: GridRow) => {
    if (row.type !== "item" || !row.itemKey) return;
    // Look up the source entry to recover dimensions
    const sample = entries.find(e => e.itemKey === row.itemKey);
    setEditingItem(row);
    setFormData({
      itemName: row.itemName || "",
      financialView: sample?.financialView || enabledViews[0]?.label || "Capital",
      costCategory: sample?.costCategory || "",
      costSpecification: sample?.costSpecification || "",
      category: row.category || "",
      wbs: row.wbs || "",
      comments: row.comments || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.itemName.trim()) {
      toast({ title: "Item name is required", variant: "destructive" });
      return;
    }
    if (!formData.costCategory.trim()) {
      toast({ title: "Cost Category is required", variant: "destructive" });
      return;
    }
    if (!formData.costSpecification.trim()) {
      toast({ title: "Cost Specification is required", variant: "destructive" });
      return;
    }
    const payload = {
      itemName: formData.itemName,
      financialView: formData.financialView || null,
      costCategory: formData.costCategory || null,
      costSpecification: formData.costSpecification || null,
      category: formData.category || null,
      wbs: formData.wbs || null,
      comments: formData.comments || null,
    };
    if (editingItem?.itemKey) {
      updateItemMutation.mutate({ itemKey: editingItem.itemKey, data: payload });
    } else {
      createItemMutation.mutate({ fiscalYear, ...payload });
    }
  };

  const beginTextEdit = (row: GridRow, field: "itemName" | "comments" | "wbs") => {
    if (row.type !== "item" || !row.itemKey) return;
    const current =
      field === "itemName" ? (row.itemName || row.label || "") :
      field === "comments" ? (row.comments || "") :
      (row.wbs || "");
    setEditTextValue(current);
    setEditingText({ itemKey: row.itemKey, field });
  };

  const cancelTextEdit = () => {
    setEditingText(null);
    setEditTextValue("");
  };

  const saveTextEdit = () => {
    if (!editingText) return;
    const { itemKey, field } = editingText;
    const sample = entries.find(e => e.itemKey === itemKey);
    if (!sample) { cancelTextEdit(); return; }
    const next = editTextValue.trim();
    const currentVal =
      field === "itemName" ? (sample.itemName || "") :
      field === "comments" ? (sample.comments || "") :
      (sample.wbs || "");
    if (next === currentVal.trim()) { cancelTextEdit(); return; }
    if (field === "itemName" && !next) {
      toast({ title: "Item name is required", variant: "destructive" });
      return;
    }
    const payload: any = {
      itemName: sample.itemName,
      financialView: sample.financialView ?? null,
      costCategory: sample.costCategory ?? null,
      costSpecification: sample.costSpecification ?? null,
      category: sample.category ?? null,
      wbs: sample.wbs ?? null,
      comments: sample.comments ?? null,
      [field]: next || null,
    };
    if (field === "itemName") payload.itemName = next;
    updateItemMutation.mutate({ itemKey, data: payload });
    cancelTextEdit();
  };

  const handleCellClick = (row: GridRow, monthIdx: number, typeKey: string) => {
    if (row.type !== "item" || !row.itemKey) return;
    const value = row.monthlyByType[typeKey]?.[monthIdx] ?? 0;
    setEditValue(String(value || 0));
    setEditingCell({ itemKey: row.itemKey, month: monthIdx + 1, typeKey });
  };

  const saveCellEdit = (next?: { itemKey: string; month: number; typeKey: string } | null) => {
    if (!editingCell) return;
    const amount = parseFloat(editValue) || 0;
    updateCellMutation.mutate({
      itemKey: editingCell.itemKey,
      type: editingCell.typeKey,
      month: editingCell.month,
      amount,
    });
    if (next) {
      const nextRow = editableRows.find(r => r.itemKey === next.itemKey);
      if (nextRow) {
        const v = nextRow.monthlyByType[next.typeKey]?.[next.month - 1] ?? 0;
        setEditValue(String(v || 0));
        setEditingCell(next);
        return;
      }
    }
    setEditingCell(null);
    setEditValue("");
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // Excel-like navigation across only editable item rows AND editable scenario sub-cols.
  // Sub-column index = monthIdx * editableScenarioCount + editableScenarioPositionForRow.
  const getNeighborCell = (
    direction: "up" | "down" | "left" | "right",
  ): { itemKey: string; month: number; typeKey: string } | null => {
    if (!editingCell) return null;
    if (editableTypeKeys.length === 0) return null;

    const rowIdx = editableRows.findIndex(r => r.itemKey === editingCell.itemKey);
    if (rowIdx === -1) return null;
    const monthIdx = editingCell.month - 1;
    const sceIdx = editableTypeKeys.indexOf(editingCell.typeKey);
    if (sceIdx === -1) return null;

    const sceCount = editableTypeKeys.length;
    const totalSubCols = 12 * sceCount;
    const subColIdx = monthIdx * sceCount + sceIdx;

    let nextRow = rowIdx;
    let nextSubCol = subColIdx;

    if (direction === "up") nextRow = Math.max(0, rowIdx - 1);
    if (direction === "down") nextRow = Math.min(editableRows.length - 1, rowIdx + 1);
    if (direction === "left") {
      if (subColIdx > 0) nextSubCol = subColIdx - 1;
      else if (rowIdx > 0) { nextRow = rowIdx - 1; nextSubCol = totalSubCols - 1; }
    }
    if (direction === "right") {
      if (subColIdx < totalSubCols - 1) nextSubCol = subColIdx + 1;
      else if (rowIdx < editableRows.length - 1) { nextRow = rowIdx + 1; nextSubCol = 0; }
    }

    if (nextRow === rowIdx && nextSubCol === subColIdx) return null;
    return {
      itemKey: editableRows[nextRow].itemKey!,
      month: Math.floor(nextSubCol / sceCount) + 1,
      typeKey: editableTypeKeys[nextSubCol % sceCount],
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading financial data...</div>
      </div>
    );
  }

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-background p-6 overflow-auto space-y-4"
          : "space-y-4"
      }
      data-testid="financial-grid-container"
    >
      {/* Title row: brand + Add Item */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Financial Grid</h3>
        </div>

        <Button onClick={openCreateDialog} data-testid="button-add-cost-item">
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>

      {/* Toolbar row: search, scenario toggles, FY selector — fullscreen on right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items, WBS, comments…"
              className="pl-8 h-9 w-72 bg-muted/40 border-transparent focus-visible:bg-background focus-visible:border-input"
              data-testid="input-search-financial"
            />
          </div>

          {/* Undo / Redo (Ctrl/Cmd+Z, Ctrl+Shift+Z or Ctrl+Y) */}
          <div className="inline-flex h-9 rounded-md border bg-muted/40 p-0.5 gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => undoMutation.mutate()}
              disabled={!canUndo || undoMutation.isPending}
              title="Undo (Ctrl/Cmd+Z)"
              aria-label="Undo last change"
              data-testid="button-undo-financial"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => redoMutation.mutate()}
              disabled={!canRedo || redoMutation.isPending}
              title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
              aria-label="Redo last undone change"
              data-testid="button-redo-financial"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Expand / Collapse all groups */}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={allExpanded ? collapseAll : expandAll}
            disabled={allGroupKeys.size === 0}
            title={allExpanded ? "Collapse all groups" : "Expand all groups"}
            aria-label={allExpanded ? "Collapse all groups" : "Expand all groups"}
            data-testid="button-toggle-expand-all"
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" />
            )}
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>

          {/* Background-activity indicator: visible whenever the grid is
             refetching or any item/cell mutation is in flight. */}
          <div
            className={`inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-[11px] font-medium border transition-opacity ${
              isBusy
                ? "opacity-100 border-primary/40 bg-primary/5 text-primary"
                : "opacity-0 pointer-events-none border-transparent"
            }`}
            role="status"
            aria-live="polite"
            aria-hidden={!isBusy}
            data-testid="indicator-grid-busy"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Syncing…</span>
          </div>

          {/* Segmented financial-type toggle — colored per type for quick scanning */}
          <div className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5 gap-0.5">
            {allTypes.map((s) => {
              const palette = getTypePalette(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleTypeVisibility(s.key)}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-sm transition-all ${
                    s.enabled
                      ? `${palette.activeBg} ${palette.activeText} ${palette.activeRing} shadow-sm`
                      : `text-muted-foreground hover:text-foreground hover:bg-background/60`
                  }`}
                  data-testid={`button-view-${s.key}`}
                  title={
                    s.enabled
                      ? `${s.label} — ${s.editable ? "editable" : "read-only"}. Click to hide.`
                      : `${s.label} — hidden. Click to show.`
                  }
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      s.enabled ? palette.dotOn : palette.dotOff
                    }`}
                    aria-hidden="true"
                  />
                  {s.enabled && !s.editable && <Lock className="h-3 w-3 opacity-60" />}
                  <span className="uppercase tracking-wide">{s.label}</span>
                </button>
              );
            })}
            {/* EAC: virtual blended scenario (act through current month +
                fcst after). Read-only column; toggleable independently. */}
            {(() => {
              const palette = getTypePalette("eac");
              return (
                <button
                  type="button"
                  onClick={toggleShowEac}
                  className={`inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-sm transition-all ${
                    showEac
                      ? `${palette.activeBg} ${palette.activeText} ${palette.activeRing} shadow-sm`
                      : `text-muted-foreground hover:text-foreground hover:bg-background/60`
                  }`}
                  data-testid="button-view-eac"
                  title={
                    showEac
                      ? "EAC — Estimate at Completion (Actuals through current month + Forecast after). Read-only. Click to hide."
                      : "EAC — Estimate at Completion. Click to show."
                  }
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      showEac ? palette.dotOn : palette.dotOff
                    }`}
                    aria-hidden="true"
                  />
                  {showEac && <Lock className="h-3 w-3 opacity-60" />}
                  <span className="uppercase tracking-wide">EAC</span>
                </button>
              );
            })()}
          </div>

          {/* Period view-mode switcher: Month / Quarter / Year. Quarter and
              Year are read-only aggregates of the underlying monthly cells. */}
          <div className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5 gap-0.5" role="group" aria-label="Grid period view">
            {([
              { key: "month", label: "Month" },
              { key: "quarter", label: "Quarter" },
              { key: "year", label: "Year" },
            ] as { key: ViewMode; label: string }[]).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setViewMode(opt.key)}
                aria-pressed={viewMode === opt.key}
                className={`px-3 h-8 text-xs font-semibold rounded-sm transition-all ${
                  viewMode === opt.key
                    ? "bg-background text-foreground shadow-sm ring-1 ring-inset ring-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }`}
                title={
                  opt.key === "month"
                    ? "Show 12 month columns"
                    : opt.key === "quarter"
                    ? "Collapse to 4 quarter columns (read-only totals)"
                    : "Collapse to a single fiscal-year column (read-only total)"
                }
                data-testid={`button-view-mode-${opt.key}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Variance mode + Insights toggle */}
          <div className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5 gap-0.5" role="group" aria-label="Variance & insights">
            <Select value={varianceMode} onValueChange={(v) => setVarianceMode(v as VarianceMode)}>
              <SelectTrigger
                className="h-8 px-2 text-xs font-semibold border-0 bg-transparent shadow-none gap-1.5 w-auto min-w-[120px]"
                data-testid="select-variance-mode"
                title="Variance columns: compare ACT/EAC to a baseline"
              >
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Variance" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Variance: Off</SelectItem>
                <SelectItem value="forecast">Forecast accuracy (ACT − FCST YTD)</SelectItem>
                <SelectItem value="budget">Budget health (EAC − AOP)</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={toggleInsights}
              aria-pressed={showInsights}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold rounded-sm transition-all ${
                showInsights
                  ? "bg-background text-foreground shadow-sm ring-1 ring-inset ring-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
              title={showInsights ? "Hide the insights strip above the grid" : "Show the insights strip above the grid"}
              data-testid="button-toggle-insights"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Insights
            </button>
          </div>

          <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
            <SelectTrigger className="w-28 h-9" data-testid="select-fiscal-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                <SelectItem key={y} value={String(y)}>FY {y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsFullscreen(v => !v)}
          title={isFullscreen ? "Exit full screen" : "Expand to full screen"}
          data-testid="button-toggle-fullscreen"
          className="h-9 w-9"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      {showInsights && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 mb-3" data-testid="insights-strip">
          {/* EAC vs AOP */}
          {(() => {
            const status = statusFromPct(insights.eacPct, insights.aopTotal);
            const styles = STATUS_STYLES[status];
            const Icon = status === "over" ? TrendingUp : status === "risk" ? AlertTriangle : status === "under" ? TrendingDown : CheckCircle2;
            return (
              <div className={`rounded-lg border bg-card px-3 py-2.5 flex items-start gap-2 border-l-4 ${styles.accent}`} data-testid="insight-eac">
                <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">EAC vs AOP</div>
                  <div className="text-sm font-bold tabular-nums truncate flex items-center gap-1.5">
                    <CompactCurrency value={insights.eac} />
                    <Icon className="h-3 w-3 opacity-70" />
                  </div>
                  <div className="text-[11px] tabular-nums text-muted-foreground">
                    <span className={insights.eacVar > 0 ? "text-red-600 dark:text-red-400 font-semibold" : insights.eacVar < 0 ? "text-emerald-700 dark:text-emerald-400 font-semibold" : ""}>
                      {insights.eacVar !== 0 ? formatCurrency(insights.eacVar) : "$0"}
                    </span>
                    {insights.aopTotal !== 0 && <span className="ml-1">({formatPct(insights.eacPct)})</span>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Forecast accuracy */}
          <div className="rounded-lg border bg-card px-3 py-2.5 flex items-start gap-2" data-testid="insight-accuracy">
            <Activity className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Forecast Accuracy YTD</div>
              <div className="text-sm font-bold tabular-nums">
                {insights.accuracy === null ? <span className="text-muted-foreground/50">—</span> : `${(insights.accuracy * 100).toFixed(1)}%`}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums truncate">
                ACT <CompactCurrency value={insights.actYTD} /> vs FCST <CompactCurrency value={insights.fcstYTD} />
              </div>
            </div>
          </div>

          {/* Burn rate */}
          <div className="rounded-lg border bg-card px-3 py-2.5 flex items-start gap-2" data-testid="insight-burn">
            <Flame className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Burn Rate (3-mo avg)</div>
              <div className="text-sm font-bold tabular-nums truncate">
                {insights.burnAvg ? <CompactCurrency value={insights.burnAvg} /> : <span className="text-muted-foreground/50">—</span>}
                <span className="text-[10px] text-muted-foreground font-normal ml-1">/mo</span>
              </div>
              <div className="text-[11px] tabular-nums">
                {insights.burnPrevAvg ? (
                  <span className={insights.burnTrendPct > 0.05 ? "text-red-600 dark:text-red-400" : insights.burnTrendPct < -0.05 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
                    {insights.burnTrendPct > 0 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
                    {formatPct(insights.burnTrendPct)} vs prior 3mo
                  </span>
                ) : <span className="text-muted-foreground/60">No prior period</span>}
              </div>
            </div>
          </div>

          {/* Runway */}
          <div className="rounded-lg border bg-card px-3 py-2.5 flex items-start gap-2" data-testid="insight-runway">
            <Gauge className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Budget Runway</div>
              <div className="text-sm font-bold tabular-nums">
                {insights.runway === null ? <span className="text-muted-foreground/50">—</span> :
                  insights.runway > 24 ? "24+ mo" : `${insights.runway.toFixed(1)} mo`}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums truncate">
                Remaining AOP <CompactCurrency value={insights.aopTotal - insights.actYTD} />
              </div>
            </div>
          </div>

          {/* Top variance driver */}
          <div className="rounded-lg border bg-card px-3 py-2.5 flex items-start gap-2 col-span-2 md:col-span-1" data-testid="insight-top-driver">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Top Variance Driver</div>
              {insights.topDriver ? (
                <>
                  <div className="text-sm font-semibold truncate" title={insights.topDriver.itemName}>
                    {insights.topDriver.itemName}
                  </div>
                  <div className="text-[11px] tabular-nums">
                    <span className={insights.topDriver.varDollar > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-emerald-700 dark:text-emerald-400 font-semibold"}>
                      {formatCurrency(insights.topDriver.varDollar)}
                    </span>
                    <span className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${STATUS_STYLES[insights.topDriver.status].pill}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[insights.topDriver.status].dot}`} />
                      {STATUS_STYLES[insights.topDriver.status].label}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground/60">No variance data yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {(() => {
        const N_TOTAL = Math.max(displayedTypes.length, 1);
        const N_MONTH = Math.max(monthDisplayedTypes.length, 1);
        // Cost Item column accepts a user-driven offset from the splitter drag.
        const COL_COST_BASE = 300;
        const COL_COST_MIN = 160;
        const COL_COST_MAX = 700;
        const COL_COST = Math.max(COL_COST_MIN, Math.min(COL_COST_MAX, COL_COST_BASE + frozenOffsetPx));

        // Content-aware widths: compute column widths from actual data so
        // empty cells don't reserve as much space as long ones.
        // Tightened for a dense, technical look — minimum padding, narrow
        // numeric cells, single-character per-glyph budget.
        const CHAR_PX = 6.2;        // approx px per char at text-[11px] tabular-nums (slight safety margin)
        const HDR_CHAR_PX = 6.6;    // header text is slightly wider (uppercase tracking)
        const PAD_X = 22;           // px-1 (8px) + ~7px gap on each side so adjacent values have clear breathing room
        // Frozen columns (Comments, WBS) keep px-3 padding (24px each side)
        // and have a sort icon in the header, so they need a wider floor than
        // the dense numeric columns.
        const MIN_COMM = 120, MAX_COMM = 240;
        const MIN_WBS = 88, MAX_WBS = 140;
        const FROZEN_PAD_X = 24 * 2; // px-3 left + right
        const SORT_ICON_PX = 16;     // ArrowUpDown 12px + 4px gap
        // Caps are generous so that even very large numbers (e.g. trillions)
        // fit entirely in the cell without truncation. Columns still shrink
        // when data is small because the widths are content-driven.
        const MIN_MONTH_SUB = 30, MAX_MONTH_SUB = 200;
        const MIN_TOTAL_SUB = 44, MAX_TOTAL_SUB = 220;

        // Compute widths from the underlying item-level data (filteredEntries)
        // so they don't change when groups are expanded/collapsed.
        let commMaxChars = "Comments".length + 2;  // header + sort icon
        let wbsMaxChars  = "WBS".length + 2;
        // itemTotalSum[itemKey][typeKey] = sum across 12 months
        const itemTotalSum = new Map<string, Record<string, number>>();
        // itemMonthly[itemKey][typeKey] = number[12] (used to size period cols)
        const itemMonthly = new Map<string, Record<string, number[]>>();
        // Per-item longest comments/wbs across all entries for that item
        // (data may be inconsistent across rows for the same itemKey)
        const itemCommentMax = new Map<string, number>();
        const itemWbsMax = new Map<string, number>();

        for (const e of filteredEntries) {
          if (!enabledTypeKeys.includes(e.scenario)) continue;
          if (e.comments) {
            const cap = Math.min(e.comments.length, 32);
            const prev = itemCommentMax.get(e.itemKey) ?? 0;
            if (cap > prev) itemCommentMax.set(e.itemKey, cap);
          }
          if (e.wbs) {
            const prev = itemWbsMax.get(e.itemKey) ?? 0;
            if (e.wbs.length > prev) itemWbsMax.set(e.itemKey, e.wbs.length);
          }
          const amt = Number(e.amount) || 0;
          const mi = (e.month ?? 1) - 1;
          if (mi >= 0 && mi < 12) {
            let agg = itemMonthly.get(e.itemKey);
            if (!agg) { agg = {}; itemMonthly.set(e.itemKey, agg); }
            if (!agg[e.scenario]) agg[e.scenario] = new Array(12).fill(0);
            agg[e.scenario][mi] = amt;
          }
          let perItem = itemTotalSum.get(e.itemKey);
          if (!perItem) { perItem = {}; itemTotalSum.set(e.itemKey, perItem); }
          perItem[e.scenario] = (perItem[e.scenario] ?? 0) + amt;
        }

        // Per-period per-type max formatted-char length and grand sum, used
        // to size the dynamic columns regardless of view mode (1, 4, or 12).
        const periodMaxChars: Record<string, number>[] = periodCols.map(() => ({}));
        const periodGrandSum: Record<string, number>[] = periodCols.map(() => ({}));
        for (let pi = 0; pi < periodCols.length; pi++) {
          const idxs = periodCols[pi].monthIndices;
          for (const k of enabledTypeKeys) {
            let grand = 0;
            for (const agg of itemMonthly.values()) {
              const arr = agg[k];
              if (!arr) continue;
              let s = 0;
              for (const mi of idxs) s += arr[mi] ?? 0;
              grand += s;
              if (s !== 0) {
                const len = formatCurrency(s).length;
                const cur = periodMaxChars[pi][k] ?? 0;
                if (len > cur) periodMaxChars[pi][k] = len;
              }
            }
            if (grand !== 0) periodGrandSum[pi][k] = grand;
          }
        }

        // EAC isn't a real scenario so it never appears in filteredEntries.
        // It's only displayed in the Total column, so we just need to feed
        // its per-item total into itemTotalSum for totalSubPx sizing.
        if (showEac) {
          for (const r of rows) {
            if (r.type !== "item" || !r.itemKey) continue;
            const arr = r.monthlyByType.eac ?? new Array(12).fill(0);
            let perItem = itemTotalSum.get(r.itemKey);
            if (!perItem) { perItem = {}; itemTotalSum.set(r.itemKey, perItem); }
            let itemSum = 0;
            for (let mi = 0; mi < 12; mi++) itemSum += arr[mi] || 0;
            perItem["eac"] = (perItem["eac"] ?? 0) + itemSum;
          }
        }

        // Fold per-item longest values into global maxes
        for (const v of itemCommentMax.values()) if (v > commMaxChars) commMaxChars = v;
        for (const v of itemWbsMax.values()) if (v > wbsMaxChars) wbsMaxChars = v;

        const COL_COMMENTS = Math.round(Math.min(MAX_COMM, Math.max(MIN_COMM, commMaxChars * CHAR_PX + FROZEN_PAD_X + SORT_ICON_PX)));
        const COL_WBS      = Math.round(Math.min(MAX_WBS,  Math.max(MIN_WBS,  wbsMaxChars  * CHAR_PX + FROZEN_PAD_X + SORT_ICON_PX)));

        // Per-scenario TOTAL sub-cols. Totals render via <CompactCurrency>
        // (e.g. "$1.2M", "$3.4B", "-$234K"), so measure the rendered compact
        // length per value — not the raw digit count — so the column only
        // widens when the actual on-screen text needs more room.
        const compactLen = (v: number): number => {
          if (!v) return 1; // "-"
          const abs = Math.abs(v);
          const sign = v < 0 ? 1 : 0;
          // "$" + 1-3 mantissa digits + optional ".YZ" + suffix
          if (abs >= 1e12) return sign + 6;   // $1.23T
          if (abs >= 1e9)  return sign + 6;   // $1.23B
          if (abs >= 1e6)  return sign + 6;   // $1.23M
          if (abs >= 1e3)  return sign + 5;   // $123K
          return sign + 1 + String(Math.round(abs)).length; // "$123"
        };
        const totalSubPx: number[] = displayedTypes.map((s) => {
          let chars = (s.label.length + (!s.editable ? 1 : 0)) + 1;
          let typeGrand = 0;
          for (const perItem of itemTotalSum.values()) {
            const v = perItem[s.key] ?? 0;
            if (v !== 0) chars = Math.max(chars, compactLen(v));
            typeGrand += v;
          }
          if (typeGrand !== 0) chars = Math.max(chars, compactLen(typeGrand));
          return Math.round(Math.min(MAX_TOTAL_SUB, Math.max(MIN_TOTAL_SUB, chars * CHAR_PX + PAD_X)));
        });

        // Per-period per-scenario sub-cols (1, 4, or 12 periods depending on
        // view). EAC is excluded from period columns — it only renders in the
        // Total column.
        const periodSubPx: number[] = [];
        for (let pi = 0; pi < periodCols.length; pi++) {
          for (const s of monthDisplayedTypes) {
            let chars = (s.label.length + (!s.editable ? 1 : 0)) + 1;
            const cellMax = periodMaxChars[pi][s.key] ?? 0;
            if (cellMax > chars) chars = cellMax;
            const gtm = periodGrandSum[pi][s.key] ?? 0;
            if (gtm !== 0) chars = Math.max(chars, formatCurrency(gtm).length);
            periodSubPx.push(Math.round(Math.min(MAX_MONTH_SUB, Math.max(MIN_MONTH_SUB, chars * CHAR_PX + PAD_X))));
          }
        }

        // Ensure the sub-cols for each period are wide enough for the period
        // header label (e.g. "OCT", "Q1", "FY 2026").
        for (let pi = 0; pi < periodCols.length; pi++) {
          const start = pi * N_MONTH;
          const sum = periodSubPx.slice(start, start + N_MONTH).reduce((a, b) => a + b, 0);
          const needed = Math.ceil(periodCols[pi].label.length * HDR_CHAR_PX + PAD_X);
          if (sum < needed) {
            const extra = Math.ceil((needed - sum) / N_MONTH);
            for (let k = 0; k < N_MONTH; k++) periodSubPx[start + k] += extra;
          }
        }

        // If a cell is currently being edited (only possible in month view),
        // widen its column so the whole typed value stays visible as the user
        // types. Growing the column (not just overlaying the input) keeps the
        // grid layout consistent and avoids overlap with neighboring cells.
        if (editingCell && isMonthView) {
          const editSIdx = monthDisplayedTypes.findIndex(t => t.key === editingCell.typeKey);
          const editPi = periodCols.findIndex(p => p.monthIndices[0] === editingCell.month - 1);
          if (editSIdx >= 0 && editPi >= 0) {
            const colIdx = editPi * N_MONTH + editSIdx;
            const chars = Math.max(8, editValue.length + 2);
            const needed = Math.round(Math.min(320, chars * CHAR_PX + PAD_X + 10));
            if (needed > periodSubPx[colIdx]) periodSubPx[colIdx] = needed;
          }
        }

        // Variance columns sit just after the per-type Total cols. Widths are
        // fixed-ish so they don't dominate the layout: $ wider than %, Status
        // narrowest (just a pill).
        const varianceSubPx: number[] = varianceCols.map(c => {
          if (c.key === "var_dollar") return 84;
          if (c.key === "var_pct") return 64;
          return 86; // var_status (room for "On Track")
        });
        const N_VAR = varianceCols.length;

        const totalColsTpl = totalSubPx.map(p => `${p}px`).join(" ");
        const varianceColsTpl = varianceSubPx.map(p => `${p}px`).join(" ");
        const periodColsTpl = periodSubPx.map(p => `${p}px`).join(" ");
        const gridTemplate = `${COL_COST}px ${COL_COMMENTS}px ${COL_WBS}px ${totalColsTpl}${varianceColsTpl ? " " + varianceColsTpl : ""} ${periodColsTpl}`;
        const minWidthPx =
          COL_COST + COL_COMMENTS + COL_WBS +
          totalSubPx.reduce((a, b) => a + b, 0) +
          varianceSubPx.reduce((a, b) => a + b, 0) +
          periodSubPx.reduce((a, b) => a + b, 0);

        // Sticky-left offsets for the first three "frozen" columns
        const stickyL1 = 0;
        const stickyL2 = COL_COST;
        const stickyL3 = COL_COST + COL_COMMENTS;
        // Last sticky col gets a soft right shadow to indicate scrollable area
        const stickyEdgeShadow = "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";

        const isCurrentMonth = (idx: number) => idx === currentMonthIdx;
        const monthHi = (idx: number) => isCurrentMonth(idx) ? "bg-amber-50 dark:bg-amber-950/20" : "";
        const isCurrentPeriod = (idx: number) => idx === currentPeriodIdx;
        const periodHi = (idx: number) => isCurrentPeriod(idx) ? "bg-amber-50 dark:bg-amber-950/20" : "";

        // Border classes: strong divider between months, faint between scenarios
        const monthBorder = "border-l border-border";
        const typeBorder = "border-l border-border/40";

        const sortableHeader = (label: string) => (
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            <span>{label}</span>
            <ArrowUpDown className="h-3 w-3 opacity-50" />
          </div>
        );

        // Container scroll height: respect fullscreen
        const tableMaxH = isFullscreen ? "max-h-[calc(100vh-180px)]" : "max-h-[calc(100vh-260px)]";

        const frozenWidthPx = COL_COST + COL_COMMENTS + COL_WBS;

        const startSplitterDrag = (e: React.MouseEvent) => {
          e.preventDefault();
          // If a previous drag somehow didn't clean up, do it now.
          if (dragCleanupRef.current) {
            dragCleanupRef.current();
            dragCleanupRef.current = null;
          }
          const startX = e.clientX;
          const startOffset = frozenOffsetPx;
          const minOffset = COL_COST_MIN - COL_COST_BASE;
          const maxOffset = COL_COST_MAX - COL_COST_BASE;
          let latest = startOffset;
          let persisted = false;
          const onMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            latest = Math.max(minOffset, Math.min(maxOffset, startOffset + delta));
            setFrozenOffsetPx(latest);
          };
          const teardown = (persist: boolean) => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            window.removeEventListener("blur", onCancel);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            if (persist && !persisted) {
              persisted = true;
              try {
                if (typeof window !== "undefined" && splitterStorageKey) {
                  window.localStorage.setItem(splitterStorageKey, String(latest));
                }
              } catch {}
            }
            dragCleanupRef.current = null;
          };
          const onUp = () => teardown(true);
          const onCancel = () => teardown(true);
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
          window.addEventListener("blur", onCancel);
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          // Expose teardown so an unmount mid-drag can cancel cleanly.
          dragCleanupRef.current = () => teardown(false);
        };

        return (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden relative">
            {/* Draggable vertical splitter between frozen and scrollable sections */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize cost item / comments / WBS section"
              onMouseDown={startSplitterDrag}
              onDoubleClick={() => {
                setFrozenOffsetPx(0);
                try {
                  if (typeof window !== "undefined" && splitterStorageKey) {
                    window.localStorage.setItem(splitterStorageKey, "0");
                  }
                } catch {}
              }}
              title="Drag to resize. Double-click to reset."
              className="absolute top-0 bottom-0 w-1.5 -ml-[3px] cursor-col-resize z-40 group/splitter"
              style={{ left: `${frozenWidthPx}px` }}
              data-testid="splitter-frozen"
            >
              <div className="h-full w-full bg-transparent group-hover/splitter:bg-primary/40 group-active/splitter:bg-primary/60 transition-colors" />
            </div>
            <div className={`relative overflow-auto ${tableMaxH}`}>
              <div className="text-sm" style={{ minWidth: `${minWidthPx}px` }}>
                {/* Header row 1: column titles + year groupings (sticky top) */}
                <div
                  className="grid bg-muted border-b sticky top-0 z-30 h-10"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div
                    className={`px-4 flex items-center bg-muted sticky z-10`}
                    style={{ left: `${stickyL1}px` }}
                  >
                    {sortableHeader("Cost Item")}
                  </div>
                  <div
                    className="px-3 flex items-center bg-muted sticky z-10"
                    style={{ left: `${stickyL2}px` }}
                  >
                    {sortableHeader("Comments")}
                  </div>
                  <div
                    className={`px-3 flex items-center bg-muted sticky z-10 ${stickyEdgeShadow}`}
                    style={{ left: `${stickyL3}px` }}
                  >
                    {sortableHeader("WBS")}
                  </div>
                  <div
                    className={`flex items-center justify-center ${monthBorder}`}
                    style={{ gridColumn: `span ${N_TOTAL + N_VAR}` }}
                  ></div>
                  {periodYearGroups.map((g, gi) => (
                    <div
                      key={`y-${g.year}-${gi}`}
                      className={`flex items-center justify-center text-xs font-semibold tracking-wide text-muted-foreground ${monthBorder}`}
                      style={{ gridColumn: `span ${g.count * N_MONTH}` }}
                    >
                      {g.year}
                    </div>
                  ))}
                </div>

                {/* Header row 2: TOTAL + month names (sticky top) */}
                <div
                  className="grid bg-muted border-b sticky z-30 h-9"
                  style={{ gridTemplateColumns: gridTemplate, top: "40px" }}
                >
                  <div
                    className="bg-muted sticky z-10"
                    style={{ left: `${stickyL1}px` }}
                  ></div>
                  <div
                    className="bg-muted sticky z-10"
                    style={{ left: `${stickyL2}px` }}
                  ></div>
                  <div
                    className={`bg-muted sticky z-10 ${stickyEdgeShadow}`}
                    style={{ left: `${stickyL3}px` }}
                  ></div>
                  <div
                    className={`flex items-center justify-center text-[11px] font-bold uppercase tracking-wider text-foreground ${monthBorder}`}
                    style={{ gridColumn: `span ${N_TOTAL}` }}
                  >
                    Total
                  </div>
                  {N_VAR > 0 && (
                    <div
                      className={`flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider text-foreground ${monthBorder} bg-muted/60`}
                      style={{ gridColumn: `span ${N_VAR}` }}
                      title={varianceMode === "forecast"
                        ? "Forecast variance: Actuals YTD − Forecast YTD"
                        : "Budget variance: EAC (ACT YTD + remaining FCST) − AOP"}
                    >
                      <Gauge className="h-3 w-3 opacity-70" />
                      {varianceMode === "forecast" ? "Forecast Var" : "Budget Var"}
                    </div>
                  )}
                  {periodCols.map((p, idx) => (
                    <div
                      key={`mn-${p.key}`}
                      className={`flex flex-col items-center justify-center text-xs font-semibold uppercase tracking-wider ${monthBorder} ${
                        isCurrentPeriod(idx) ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200" : "text-muted-foreground"
                      }`}
                      style={{ gridColumn: `span ${N_MONTH}` }}
                      title={p.hint || undefined}
                    >
                      <span>{p.label}</span>
                      {viewMode === "quarter" && p.hint && (
                        <span className="text-[9px] font-normal normal-case tracking-normal opacity-70 leading-tight">
                          {p.hint}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Header row 3: scenario sub-labels (sticky top) — tinted per type */}
                <div
                  className="grid bg-card border-b sticky z-30 h-7 text-[10px] uppercase tracking-wide font-semibold"
                  style={{ gridTemplateColumns: gridTemplate, top: "76px" }}
                >
                  <div className="bg-card sticky z-10" style={{ left: `${stickyL1}px` }}></div>
                  <div className="bg-card sticky z-10" style={{ left: `${stickyL2}px` }}></div>
                  <div className={`bg-card sticky z-10 ${stickyEdgeShadow}`} style={{ left: `${stickyL3}px` }}></div>
                  {displayedTypes.map((s, i) => {
                    const palette = getTypePalette(s.key);
                    return (
                      <div
                        key={`tlab-${s.key}`}
                        className={`flex items-center justify-center gap-1 ${i === 0 ? monthBorder : typeBorder} ${palette.activeBg} ${palette.activeText}`}
                        title={s.editable ? `${s.label} (editable)` : `${s.label} (read-only)`}
                      >
                        {!s.editable && <Lock className="h-2.5 w-2.5 opacity-60" />}
                        <span>{s.label}</span>
                      </div>
                    );
                  })}
                  {varianceCols.map((c, i) => (
                    <div
                      key={`vlab-${c.key}`}
                      className={`flex items-center justify-center gap-1 ${i === 0 ? monthBorder : typeBorder} bg-slate-500/10 text-slate-700 dark:text-slate-300`}
                      title={
                        c.key === "var_dollar" ? "Variance in dollars (current − baseline)" :
                        c.key === "var_pct" ? "Variance as percent of baseline" :
                        "Status pill: On Track / At Risk / Over / Under"
                      }
                    >
                      <Lock className="h-2.5 w-2.5 opacity-60" />
                      <span>{c.label}</span>
                    </div>
                  ))}
                  {periodCols.map((p, idx) => (
                    monthDisplayedTypes.map((s, i) => {
                      const palette = getTypePalette(s.key);
                      const current = isCurrentPeriod(idx);
                      return (
                        <div
                          key={`mlab-${p.key}-${s.key}`}
                          className={`flex items-center justify-center gap-1 ${i === 0 ? monthBorder : typeBorder} ${palette.activeBg} ${palette.activeText} ${current ? "ring-1 ring-inset ring-amber-500/40" : ""}`}
                          title={s.editable ? `${s.label} (editable)` : `${s.label} (read-only)`}
                        >
                          {!s.editable && <Lock className="h-2.5 w-2.5 opacity-60" />}
                          <span>{s.label}</span>
                        </div>
                      );
                    })
                  ))}
                </div>

                {rows.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground bg-card">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">
                      {searchQuery
                        ? `No items match "${searchQuery}"`
                        : `No financial entries for FY${fiscalYear}`}
                    </p>
                    {!searchQuery && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={openCreateDialog}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add First Item
                      </Button>
                    )}
                  </div>
                ) : (
                  rows.flatMap((row, rowIdx) => {
                    const isItem = row.type === "item";
                    const showPlaceholderAfter =
                      isItem && placeholder?.afterItemKey === row.itemKey;
                    const rowBgClass =
                      row.type === "view" ? "bg-muted/30 font-semibold" :
                      row.type === "category" ? "bg-muted/15 font-medium" :
                      row.type === "specification" ? "bg-muted/[0.04]" :
                      (rowIdx % 2 === 0 ? "bg-card" : "bg-muted/[0.03]");
                    // Opaque equivalents for sticky-left cells so they fully occlude scrolling content
                    const stickyBgClass =
                      row.type === "view" ? "bg-muted font-semibold" :
                      row.type === "category" ? "bg-muted font-medium" :
                      row.type === "specification" ? "bg-secondary" :
                      "bg-card";
                    const stickyHover = "group-hover:bg-accent";
                    const rowEl = (
                      <div
                        key={row.key}
                        className={`grid border-b border-border/60 group hover:bg-accent/40 transition-colors ${rowBgClass}`}
                        style={{ gridTemplateColumns: gridTemplate }}
                        data-testid={`row-${row.type}-${row.key}`}
                      >
                        {/* Cost Item (sticky) */}
                        <div
                          className={`flex flex-nowrap items-center gap-1.5 py-1.5 pr-2 overflow-hidden sticky z-[1] ${stickyBgClass} ${stickyHover}`}
                          style={{ left: `${stickyL1}px`, paddingLeft: `${16 + row.level * 14}px` }}
                        >
                          {row.hasChildren ? (
                            <button
                              onClick={() => toggleExpand(row.key)}
                              className="p-0.5 rounded hover:bg-muted-foreground/10 transition-colors shrink-0"
                              data-testid={`button-expand-${row.key}`}
                            >
                              {expanded.has(row.key) ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          {row.type === "view" ? (
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide font-semibold whitespace-nowrap">
                              {row.label}
                            </Badge>
                          ) : isItem && editingText?.itemKey === row.itemKey && editingText?.field === "itemName" ? (
                            <Input
                              autoFocus
                              value={editTextValue}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setEditTextValue(e.target.value)}
                              onBlur={saveTextEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveTextEdit(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelTextEdit(); }
                              }}
                              className="h-6 text-xs px-1 py-0 ring-2 ring-primary/40 min-w-0 flex-1"
                              data-testid={`input-itemname-${row.itemKey}`}
                            />
                          ) : isItem ? (
                            <span
                              className="truncate cursor-text rounded-sm px-1 -mx-1 text-xs font-normal text-foreground/90 hover:ring-1 hover:ring-primary/30 hover:bg-background"
                              onClick={() => beginTextEdit(row, "itemName")}
                              title="Click to rename"
                              data-testid={`label-itemname-${row.itemKey}`}
                            >
                              {row.label}
                            </span>
                          ) : row.type === "category" ? (
                            <span className="truncate text-sm font-semibold tracking-tight">{row.label}</span>
                          ) : row.type === "specification" ? (
                            <span className="truncate text-[13px] font-medium text-foreground/80">{row.label}</span>
                          ) : (
                            <span className="truncate">{row.label}</span>
                          )}
                        </div>

                        {/* Comments (sticky) — click to edit when on an item row */}
                        <div
                          className={`px-3 py-1.5 text-xs text-muted-foreground flex items-center sticky z-[1] ${stickyBgClass} ${stickyHover}`}
                          style={{ left: `${stickyL2}px` }}
                          title={row.comments || ""}
                        >
                          {isItem && editingText?.itemKey === row.itemKey && editingText?.field === "comments" ? (
                            <Input
                              autoFocus
                              value={editTextValue}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setEditTextValue(e.target.value)}
                              onBlur={saveTextEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveTextEdit(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelTextEdit(); }
                              }}
                              className="h-6 text-xs px-1 py-0 ring-2 ring-primary/40 w-full"
                              data-testid={`input-comments-${row.itemKey}`}
                            />
                          ) : isItem ? (
                            <span
                              className="truncate cursor-text rounded-sm px-1 -mx-1 w-full hover:ring-1 hover:ring-primary/30 hover:bg-background min-h-[1.25rem]"
                              onClick={() => beginTextEdit(row, "comments")}
                              data-testid={`label-comments-${row.itemKey}`}
                            >
                              {row.comments || <span className="opacity-40">—</span>}
                            </span>
                          ) : ""}
                        </div>

                        {/* WBS (sticky, last frozen col → edge shadow) — click to edit */}
                        <div
                          className={`px-3 py-1.5 text-xs text-muted-foreground tabular-nums flex items-center sticky z-[1] ${stickyBgClass} ${stickyHover} ${stickyEdgeShadow}`}
                          style={{ left: `${stickyL3}px` }}
                        >
                          {isItem && editingText?.itemKey === row.itemKey && editingText?.field === "wbs" ? (
                            <Input
                              autoFocus
                              value={editTextValue}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setEditTextValue(e.target.value)}
                              onBlur={saveTextEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveTextEdit(); }
                                else if (e.key === "Escape") { e.preventDefault(); cancelTextEdit(); }
                              }}
                              className="h-6 text-xs px-1 py-0 ring-2 ring-primary/40 w-full tabular-nums"
                              data-testid={`input-wbs-${row.itemKey}`}
                            />
                          ) : isItem ? (
                            <span
                              className="truncate cursor-text rounded-sm px-1 -mx-1 flex-1 min-w-0 hover:ring-1 hover:ring-primary/30 hover:bg-background min-h-[1.25rem]"
                              onClick={() => beginTextEdit(row, "wbs")}
                              data-testid={`label-wbs-${row.itemKey}`}
                            >
                              {row.wbs || <span className="opacity-40">—</span>}
                            </span>
                          ) : ""}
                          {isItem && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                                  title="Row actions"
                                  aria-label="Row actions"
                                  onClick={(e) => e.stopPropagation()}
                                  data-testid={`button-row-menu-${row.itemKey}`}
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem
                                  onClick={() => openAddSiblingPlaceholder(row)}
                                  data-testid={`menu-add-sibling-${row.itemKey}`}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-2" />
                                  Add another with same categories
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openEditDialog(row)}
                                  data-testid={`menu-edit-${row.itemKey}`}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Edit item details…
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => { setItemToDelete(row); setDeleteDialogOpen(true); }}
                                  data-testid={`menu-delete-${row.itemKey}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete item
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>

                        {/* Per-scenario row totals */}
                        {displayedTypes.map((s, sIdx) => {
                          const v = row.totalByType[s.key] ?? 0;
                          return (
                            <div
                              key={`total-${s.key}`}
                              className={`px-1 py-1 text-center text-[11px] font-semibold tabular-nums flex items-center justify-center ${sIdx === 0 ? monthBorder : typeBorder}`}
                            >
                              {v !== 0 ? <CompactCurrency value={v} /> : <span className="text-muted-foreground/40">—</span>}
                            </div>
                          );
                        })}

                        {/* Variance cells (read-only, derived) */}
                        {(() => {
                          if (N_VAR === 0) return null;
                          // Only show variance for rows that have meaningful
                          // numeric data (item rows + roll-up rows).
                          const showVar = row.type !== "view" || true;
                          const vc = showVar
                            ? computeVariance(row.monthlyByType, row.totalByType, varianceMode, currentMonthIdx, fyPosition)
                            : { available: false, varDollar: 0, varPct: 0, status: "none" as VarianceStatus, pctAvailable: false, baseline: 0, current: 0 };
                          const styles = STATUS_STYLES[vc.status];
                          return varianceCols.map((c, i) => {
                            const borderCls = i === 0 ? monthBorder : typeBorder;
                            if (!vc.available) {
                              return (
                                <div key={`var-${c.key}`} className={`px-1 py-1 text-center text-[11px] tabular-nums flex items-center justify-center text-muted-foreground/30 ${borderCls}`}>—</div>
                              );
                            }
                            if (c.key === "var_dollar") {
                              const cls = vc.status === "over" ? "text-red-600 dark:text-red-400" : vc.status === "risk" ? "text-amber-700 dark:text-amber-400" : vc.status === "under" || vc.status === "ok" ? "text-emerald-700 dark:text-emerald-400" : "";
                              return (
                                <div key={`var-${c.key}`} className={`px-1 py-1 text-center text-[11px] font-semibold tabular-nums flex items-center justify-center ${borderCls} ${cls}`} title={`${formatCurrency(vc.varDollar)} (${formatPct(vc.varPct)})`}>
                                  {vc.varDollar !== 0 ? <CompactCurrency value={vc.varDollar} /> : "—"}
                                </div>
                              );
                            }
                            if (c.key === "var_pct") {
                              if (!vc.pctAvailable) {
                                return (
                                  <div key={`var-${c.key}`} className={`px-1 py-1 text-center text-[10px] tabular-nums flex items-center justify-center text-muted-foreground/50 ${borderCls}`} title="No baseline to compute percent">
                                    N/A
                                  </div>
                                );
                              }
                              const cls = vc.status === "over" ? "text-red-600 dark:text-red-400" : vc.status === "risk" ? "text-amber-700 dark:text-amber-400" : vc.status === "under" || vc.status === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/40";
                              return (
                                <div key={`var-${c.key}`} className={`px-1 py-1 text-center text-[11px] font-semibold tabular-nums flex items-center justify-center ${borderCls} ${cls}`}>
                                  {formatPct(vc.varPct)}
                                </div>
                              );
                            }
                            // status pill
                            return (
                              <div key={`var-${c.key}`} className={`px-1 py-1 flex items-center justify-center ${borderCls}`}>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${styles.pill}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                                  {styles.label}
                                </span>
                              </div>
                            );
                          });
                        })()}

                        {/* Per-period per-scenario cells (1, 4, or 12 cols).
                            EAC excluded — only renders in the Total column. */}
                        {periodCols.map((p, pIdx) => (
                          monthDisplayedTypes.map((s, sIdx) => {
                            const arr = row.monthlyByType[s.key];
                            let value = 0;
                            if (arr) for (const mi of p.monthIndices) value += arr[mi] ?? 0;
                            const borderCls = sIdx === 0 ? monthBorder : typeBorder;
                            const hi = periodHi(pIdx);
                            // Per-cell tone: ACT vs FCST (same period), FCST vs AOP
                            let baselineVal = 0;
                            if (s.key === "act") {
                              const fcstArr = row.monthlyByType["fcst"];
                              if (fcstArr) for (const mi of p.monthIndices) baselineVal += fcstArr[mi] ?? 0;
                            } else if (s.key === "fcst") {
                              const aopArr = row.monthlyByType["aop"];
                              if (aopArr) for (const mi of p.monthIndices) baselineVal += aopArr[mi] ?? 0;
                            }
                            const tone = (row.type === "item" || row.type === "view") ? getCellTone(s.key, value, baselineVal, toneThresholds) : "";
                            // Aggregated periods (quarter/year) are read-only
                            // since entries are stored per-month server-side.
                            if (!isItem || !isMonthView) {
                              return (
                                <div
                                  key={`${p.key}-${s.key}`}
                                  className={`px-1 py-1 text-center text-[11px] tabular-nums flex items-center justify-center ${borderCls} ${hi} ${tone}`}
                                >
                                  {value !== 0 ? formatCurrency(value) : <span className="text-muted-foreground/30">—</span>}
                                </div>
                              );
                            }
                            const m = MONTHS[p.monthIndices[0]];
                            const isEditing =
                              editingCell?.itemKey === row.itemKey &&
                              editingCell?.month === m.num &&
                              editingCell?.typeKey === s.key;
                            const editable = s.editable;
                            return (
                              <div key={`${p.key}-${s.key}`} className={`p-0.5 ${borderCls} ${hi}`}>
                                {isEditing ? (
                                  <Input
                                    autoFocus
                                    type="number"
                                    value={editValue}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => saveCellEdit()}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        saveCellEdit(getNeighborCell(e.shiftKey ? "up" : "down"));
                                      } else if (e.key === "Tab") {
                                        e.preventDefault();
                                        saveCellEdit(getNeighborCell(e.shiftKey ? "left" : "right"));
                                      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                        e.preventDefault();
                                        saveCellEdit(getNeighborCell(e.key === "ArrowUp" ? "up" : "down"));
                                      } else if (e.key === "Escape") {
                                        cancelCellEdit();
                                      }
                                    }}
                                    // The containing column itself grows with the
                                    // typed value length (see gridTemplate build),
                                    // so the input can just fill its cell.
                                    className="h-6 w-full text-[11px] text-center px-1 py-0 tabular-nums ring-2 ring-primary/40 bg-card"
                                    data-testid={`input-${s.key}-m${m.num}-${row.itemKey}`}
                                  />
                                ) : (
                                  <div
                                    className={`h-6 flex items-center justify-center px-1 text-[11px] tabular-nums rounded-sm transition-all ${
                                      editable
                                        ? "cursor-cell hover:ring-1 hover:ring-primary/40 hover:bg-background"
                                        : "text-muted-foreground"
                                    }`}
                                    onClick={() => editable && handleCellClick(row, p.monthIndices[0], s.key)}
                                    data-testid={`cell-${s.key}-m${m.num}-${row.itemKey}`}
                                  >
                                    {value !== 0 ? formatCurrency(value) : <span className="text-muted-foreground/30">—</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ))}
                      </div>
                    );
                    // Determine whether this is the LAST item in its
                    // specification group. If so, append a quick-add input
                    // row so users can rapid-add siblings into this group.
                    let quickAddEl: React.ReactNode = null;
                    if (isItem) {
                      const myParentSpec = row.key.includes("::item::")
                        ? row.key.split("::item::")[0]
                        : null;
                      const nextRow = rows[rowIdx + 1];
                      const nextIsSiblingItem =
                        !!myParentSpec
                        && !!nextRow
                        && nextRow.type === "item"
                        && nextRow.key.startsWith(`${myParentSpec}::item::`);
                      if (myParentSpec && !nextIsSiblingItem) {
                        const sample = entries.find(e => e.itemKey === row.itemKey);
                        const inheritedView = sample?.financialView ?? null;
                        const inheritedCat = sample?.costCategory ?? null;
                        const inheritedSpec = sample?.costSpecification ?? null;
                        const draft = quickAddInputs[myParentSpec] ?? "";
                        const setDraft = (val: string) =>
                          setQuickAddInputs(prev => ({ ...prev, [myParentSpec]: val }));
                        const clearDraft = () =>
                          setQuickAddInputs(prev => {
                            const { [myParentSpec]: _, ...rest } = prev;
                            return rest;
                          });
                        const submitDraft = () => {
                          const name = draft.trim();
                          if (!name) return;
                          createItemMutation.mutate({
                            fiscalYear,
                            itemName: name,
                            financialView: inheritedView,
                            costCategory: inheritedCat,
                            costSpecification: inheritedSpec,
                            category: row.category ?? null,
                            wbs: null,
                            comments: null,
                          });
                          clearDraft();
                        };
                        quickAddEl = (
                          <div
                            key={`quick-add-${myParentSpec}`}
                            className="grid border-b border-border/60 bg-muted/[0.02]"
                            style={{ gridTemplateColumns: gridTemplate }}
                            data-testid={`row-quick-add-${myParentSpec}`}
                          >
                            <div
                              className="flex flex-nowrap items-center gap-1.5 py-1.5 pr-2 overflow-hidden sticky z-[1] bg-card"
                              style={{ left: `${stickyL1}px`, paddingLeft: `${16 + row.level * 14}px` }}
                            >
                              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <Input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    submitDraft();
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    clearDraft();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                placeholder="Add item — type name and press Enter"
                                className="h-6 text-xs px-1 py-0 min-w-0 flex-1 border-dashed focus:border-solid focus:ring-2 focus:ring-primary/40"
                                data-testid={`input-quick-add-${myParentSpec}`}
                              />
                            </div>
                            <div
                              className="px-3 py-1.5 sticky z-[1] bg-card"
                              style={{ left: `${stickyL2}px` }}
                            />
                            <div
                              className={`px-3 py-1.5 sticky z-[1] bg-card ${stickyEdgeShadow}`}
                              style={{ left: `${stickyL3}px` }}
                            />
                            {displayedTypes.map((s, sIdx) => (
                              <div
                                key={`qa-total-${s.key}`}
                                className={`px-1 py-1 ${sIdx === 0 ? monthBorder : typeBorder}`}
                              />
                            ))}
                            {varianceCols.map((c, i) => (
                              <div key={`qa-var-${c.key}`} className={`px-1 py-1 ${i === 0 ? monthBorder : typeBorder}`} />
                            ))}
                            {periodCols.map((p, idx) => (
                              monthDisplayedTypes.map((s, sIdx) => (
                                <div
                                  key={`qa-${p.key}-${s.key}`}
                                  className={`px-1 py-1 ${sIdx === 0 ? monthBorder : typeBorder} ${periodHi(idx)}`}
                                />
                              ))
                            ))}
                          </div>
                        );
                      }
                    }
                    if (!showPlaceholderAfter) return quickAddEl ? [rowEl, quickAddEl] : [rowEl];
                    const phLevel = placeholder!.level;
                    const placeholderEl = (
                      <div
                        key={`placeholder-${row.itemKey}`}
                        className="grid border-b border-border/60 bg-card"
                        style={{ gridTemplateColumns: gridTemplate }}
                        data-testid="row-placeholder"
                      >
                        <div
                          className="flex flex-nowrap items-center gap-1.5 py-1.5 pr-2 overflow-hidden sticky z-[1] bg-card"
                          style={{ left: `${stickyL1}px`, paddingLeft: `${16 + phLevel * 14}px` }}
                        >
                          <span className="w-4 shrink-0" />
                          <Input
                            autoFocus
                            value={placeholderName}
                            onChange={(e) => setPlaceholderName(e.target.value)}
                            onBlur={savePlaceholder}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                savePlaceholder();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelPlaceholder();
                              }
                            }}
                            placeholder="New item name…"
                            className="h-6 text-xs px-1 py-0 ring-2 ring-primary/40 min-w-0 flex-1"
                            data-testid="input-placeholder-itemname"
                          />
                        </div>
                        <div
                          className="px-3 py-1.5 sticky z-[1] bg-card"
                          style={{ left: `${stickyL2}px` }}
                        />
                        <div
                          className={`px-3 py-1.5 sticky z-[1] bg-card ${stickyEdgeShadow}`}
                          style={{ left: `${stickyL3}px` }}
                        />
                        {displayedTypes.map((s, sIdx) => (
                          <div
                            key={`ph-total-${s.key}`}
                            className={`px-1 py-1 ${sIdx === 0 ? monthBorder : typeBorder}`}
                          />
                        ))}
                        {varianceCols.map((c, i) => (
                          <div key={`ph-var-${c.key}`} className={`px-1 py-1 ${i === 0 ? monthBorder : typeBorder}`} />
                        ))}
                        {periodCols.map((p, idx) => (
                          monthDisplayedTypes.map((s, sIdx) => (
                            <div
                              key={`ph-${p.key}-${s.key}`}
                              className={`px-1 py-1 ${sIdx === 0 ? monthBorder : typeBorder} ${periodHi(idx)}`}
                            />
                          ))
                        ))}
                      </div>
                    );
                    return [rowEl, placeholderEl];
                  })
                )}

                {/* Grand total row (sticky top, just under headers) */}
                {rows.length > 0 && (
                  <div
                    className="grid bg-muted font-semibold border-b-2 border-border sticky z-20"
                    style={{ gridTemplateColumns: gridTemplate, top: "104px" }}
                  >
                    <div
                      className="px-4 py-2 sticky z-[1] bg-muted text-sm uppercase tracking-wider"
                      style={{ left: `${stickyL1}px` }}
                    >
                      Grand Total
                    </div>
                    <div
                      className="sticky z-[1] bg-muted"
                      style={{ left: `${stickyL2}px` }}
                    ></div>
                    <div
                      className={`sticky z-[1] bg-muted ${stickyEdgeShadow}`}
                      style={{ left: `${stickyL3}px` }}
                    ></div>
                    {displayedTypes.map((s, sIdx) => {
                      const v = grandTotalByType[s.key] ?? 0;
                      return (
                        <div
                          key={`gt-total-${s.key}`}
                          className={`px-1 py-1.5 text-center text-[11px] font-bold tabular-nums flex items-center justify-center ${sIdx === 0 ? monthBorder : typeBorder}`}
                        >
                          {v !== 0 ? <CompactCurrency value={v} /> : <span className="text-muted-foreground/40">—</span>}
                        </div>
                      );
                    })}
                    {N_VAR > 0 && varianceCols.map((c, i) => {
                      const borderCls = i === 0 ? monthBorder : typeBorder;
                      if (!grandVariance.available) {
                        return <div key={`gt-var-${c.key}`} className={`px-1 py-1.5 text-center text-[11px] tabular-nums flex items-center justify-center text-muted-foreground/30 ${borderCls}`}>—</div>;
                      }
                      const styles = STATUS_STYLES[grandVariance.status];
                      if (c.key === "var_dollar") {
                        const cls = grandVariance.status === "over" ? "text-red-600 dark:text-red-400" : grandVariance.status === "risk" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400";
                        return (
                          <div key={`gt-var-${c.key}`} className={`px-1 py-1.5 text-center text-[11px] font-bold tabular-nums flex items-center justify-center ${borderCls} ${cls}`} title={`${formatCurrency(grandVariance.varDollar)} (${formatPct(grandVariance.varPct)})`}>
                            {grandVariance.varDollar !== 0 ? <CompactCurrency value={grandVariance.varDollar} /> : "—"}
                          </div>
                        );
                      }
                      if (c.key === "var_pct") {
                        const cls = grandVariance.status === "over" ? "text-red-600 dark:text-red-400" : grandVariance.status === "risk" ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400";
                        return (
                          <div key={`gt-var-${c.key}`} className={`px-1 py-1.5 text-center text-[11px] font-bold tabular-nums flex items-center justify-center ${borderCls} ${cls}`}>
                            {formatPct(grandVariance.varPct)}
                          </div>
                        );
                      }
                      return (
                        <div key={`gt-var-${c.key}`} className={`px-1 py-1.5 flex items-center justify-center ${borderCls}`}>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${styles.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                            {styles.label}
                          </span>
                        </div>
                      );
                    })}
                    {periodCols.map((p, idx) => (
                      monthDisplayedTypes.map((s, sIdx) => {
                        const grandPeriodForType = rows
                          .filter(r => r.type === "view")
                          .reduce((acc, r) => {
                            const arr = r.monthlyByType[s.key];
                            if (!arr) return acc;
                            let s2 = 0;
                            for (const mi of p.monthIndices) s2 += arr[mi] ?? 0;
                            return acc + s2;
                          }, 0);
                        return (
                          <div
                            key={`gt-${p.key}-${s.key}`}
                            className={`px-1 py-1.5 text-center text-[11px] font-bold tabular-nums flex items-center justify-center ${sIdx === 0 ? monthBorder : typeBorder} ${periodHi(idx)}`}
                          >
                            {grandPeriodForType !== 0 ? formatCurrency(grandPeriodForType) : <span className="text-muted-foreground/40">—</span>}
                          </div>
                        );
                      })
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Cost Item"}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update the item details. Monthly amounts are edited inline in the grid."
                : "Define a new cost item. Monthly amounts can be entered inline in the grid after creation."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Item Name</Label>
              <Input
                id="itemName"
                value={formData.itemName}
                onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                placeholder="e.g., AWS hosting"
                data-testid="input-cost-item-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="financialView">Financial View</Label>
                <Select
                  value={formData.financialView}
                  onValueChange={(v) => setFormData({ ...formData, financialView: v, costCategory: "", costSpecification: "" })}
                >
                  <SelectTrigger data-testid="select-financial-view">
                    <SelectValue placeholder="Select view" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledViews.map((v) => (
                      <SelectItem key={v.key} value={v.label}>{v.label}</SelectItem>
                    ))}
                    {/* Preserve a non-config view label when editing legacy items. */}
                    {formData.financialView && !enabledViews.some(v => v.label === formData.financialView) && (
                      <SelectItem value={formData.financialView}>{formData.financialView} (legacy)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costCategory">Cost Category <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.costCategory}
                  onValueChange={(v) => setFormData({ ...formData, costCategory: v, costSpecification: "" })}
                >
                  <SelectTrigger data-testid="select-cost-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledCategoriesByViewLabel(formData.financialView).map((c) => (
                      <SelectItem key={c.key} value={c.label}>{c.label}</SelectItem>
                    ))}
                    {formData.costCategory && !enabledCategoriesByViewLabel(formData.financialView).some(c => c.label === formData.costCategory) && (
                      <SelectItem value={formData.costCategory}>{formData.costCategory} (legacy)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costSpecification">Cost Specification <span className="text-destructive">*</span></Label>
                {(() => {
                  const specs = enabledSpecsByCategoryLabel(formData.financialView, formData.costCategory);
                  const hasConfigured = specs.length > 0
                    || (formData.costSpecification && !specs.some(s => s.label === formData.costSpecification));
                  if (!hasConfigured) {
                    // No configured specifications for this category — fall back
                    // to free text so the workflow doesn't break.
                    return (
                      <Input
                        id="costSpecification"
                        value={formData.costSpecification}
                        onChange={(e) => setFormData({ ...formData, costSpecification: e.target.value })}
                        placeholder="e.g., Production cluster"
                        data-testid="input-cost-specification"
                      />
                    );
                  }
                  return (
                    <Select
                      value={formData.costSpecification}
                      onValueChange={(v) => setFormData({ ...formData, costSpecification: v })}
                    >
                      <SelectTrigger data-testid="select-cost-specification">
                        <SelectValue placeholder="Select specification" />
                      </SelectTrigger>
                      <SelectContent>
                        {specs.map((s) => (
                          <SelectItem key={s.key} value={s.label}>{s.label}</SelectItem>
                        ))}
                        {formData.costSpecification && !specs.some(s => s.label === formData.costSpecification) && (
                          <SelectItem value={formData.costSpecification}>{formData.costSpecification} (legacy)</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="wbs">WBS Code</Label>
                <Input
                  id="wbs"
                  value={formData.wbs}
                  onChange={(e) => setFormData({ ...formData, wbs: e.target.value })}
                  placeholder="e.g., 1.2.3"
                  data-testid="input-cost-item-wbs"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comments">Comments</Label>
              <Textarea
                id="comments"
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                placeholder="Optional notes..."
                data-testid="input-cost-item-comments"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createItemMutation.isPending || updateItemMutation.isPending}
              data-testid="button-save-cost-item"
            >
              {editingItem ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
            <DialogDescription>
              Delete "{itemToDelete?.itemName}"? This removes all 36 monthly cells for this item.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => itemToDelete?.itemKey && deleteItemMutation.mutate(itemToDelete.itemKey)}
              disabled={deleteItemMutation.isPending}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
