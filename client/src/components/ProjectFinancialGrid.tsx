import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, DollarSign, FileSpreadsheet, Maximize2, Minimize2, Search, ArrowUpDown, Lock } from "lucide-react";
import type { FinancialEntry, FinancialTypesConfig, FinancialType, CostItemCategoriesConfig } from "@shared/schema";
import { DEFAULT_FINANCIAL_TYPES, DEFAULT_COST_ITEM_CATEGORIES } from "@shared/schema";
import { CompactCurrency } from "@/components/CompactCurrency";
import { useOrganization } from "@/hooks/use-organization";

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

// Legacy free-form category dropdown — kept as-is for backward compatibility.
// The new configurable hierarchy (Financial View → Cost Category → Cost
// Specification) is sourced from the org's CostItemCategoriesConfig instead.
const LEGACY_CATEGORIES = [
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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ itemKey: string; month: number; typeKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GridRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<GridRow | null>(null);

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
    onError: () => toast({ title: "Failed to create item", variant: "destructive" }),
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
    onError: () => toast({ title: "Failed to update item", variant: "destructive" }),
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
    onError: () => toast({ title: "Failed to delete item", variant: "destructive" }),
  });

  const updateCellMutation = useMutation({
    mutationFn: async (data: { itemKey: string; type: FinancialTypeKey; month: number; amount: number }) =>
      apiRequest("PUT", `/api/projects/${projectId}/financial-cells`, { fiscalYear, ...data }),
    onSuccess: () => invalidate(),
    onError: () => toast({ title: "Failed to update cell", variant: "destructive" }),
  });

  const enabledTypeKeys = useMemo(() => enabledTypes.map(s => s.key), [enabledTypes]);
  const editableTypeKeys = useMemo(
    () => enabledTypes.filter(s => s.editable).map(s => s.key),
    [enabledTypes],
  );

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

  const { rows, grandTotalByType } = useMemo(
    () => buildGridRows(filteredEntries, enabledTypeKeys, expanded, costConfig),
    [filteredEntries, enabledTypeKeys, expanded, costConfig],
  );

  // Map each fiscal-month index → calendar (year, month). FY starts in Oct,
  // so idx 0..2 belong to fiscalYear-1 and idx 3..11 belong to fiscalYear.
  const monthCalendar = useMemo(() => {
    return MONTHS.map((_, i) => {
      if (i < 3) return { year: fiscalYear - 1, month: 10 + i };
      return { year: fiscalYear, month: i - 2 };
    });
  }, [fiscalYear]);

  // Group consecutive months by calendar year for the year-row header.
  const yearGroups = useMemo(() => {
    const groups: { year: number; count: number }[] = [];
    for (const m of monthCalendar) {
      const last = groups[groups.length - 1];
      if (last && last.year === m.year) last.count += 1;
      else groups.push({ year: m.year, count: 1 });
    }
    return groups;
  }, [monthCalendar]);

  // Highlight today's column (only when today falls inside the displayed FY).
  const currentMonthIdx = useMemo(() => {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    return monthCalendar.findIndex(mc => mc.year === cy && mc.month === cm);
  }, [monthCalendar]);

  const editableRows = useMemo(() => rows.filter(r => r.type === "item"), [rows]);

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

      {(() => {
        const N = Math.max(enabledTypes.length, 1);
        // Cost Item column accepts a user-driven offset from the splitter drag.
        const COL_COST_BASE = 300;
        const COL_COST_MIN = 160;
        const COL_COST_MAX = 700;
        const COL_COST = Math.max(COL_COST_MIN, Math.min(COL_COST_MAX, COL_COST_BASE + frozenOffsetPx));

        // Content-aware widths: compute column widths from actual data so
        // empty cells don't reserve as much space as long ones.
        const CHAR_PX = 6.8;        // approx px per char at text-xs tabular-nums
        const HDR_CHAR_PX = 7.2;    // header text is slightly wider (uppercase tracking)
        const PAD_X = 16;
        const MIN_COMM = 120, MAX_COMM = 240;
        const MIN_WBS = 64,  MAX_WBS = 140;
        const MIN_MONTH_SUB = 44, MAX_MONTH_SUB = 110;
        const MIN_TOTAL_SUB = 72, MAX_TOTAL_SUB = 140;

        // Compute widths from the underlying item-level data (filteredEntries)
        // so they don't change when groups are expanded/collapsed.
        let commMaxChars = "Comments".length + 2;  // header + sort icon
        let wbsMaxChars  = "WBS".length + 2;
        // monthMax[mi][typeKey] = max |amount| char-length seen at that cell
        const monthMaxChars: Record<string, number>[] = Array.from({ length: 12 }, () => ({}));
        // itemTotalSum[itemKey][typeKey] = sum across 12 months
        const itemTotalSum = new Map<string, Record<string, number>>();
        // monthGrandSum[mi][typeKey] = grand total per month/scenario
        const monthGrandSum: Record<string, number>[] = Array.from({ length: 12 }, () => ({}));
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
          if (mi >= 0 && mi < 12 && amt !== 0) {
            const len = formatCurrency(amt).length;
            const cur = monthMaxChars[mi][e.scenario] ?? 0;
            if (len > cur) monthMaxChars[mi][e.scenario] = len;
            monthGrandSum[mi][e.scenario] = (monthGrandSum[mi][e.scenario] ?? 0) + amt;
          }
          let perItem = itemTotalSum.get(e.itemKey);
          if (!perItem) { perItem = {}; itemTotalSum.set(e.itemKey, perItem); }
          perItem[e.scenario] = (perItem[e.scenario] ?? 0) + amt;
        }

        // Fold per-item longest values into global maxes
        for (const v of itemCommentMax.values()) if (v > commMaxChars) commMaxChars = v;
        for (const v of itemWbsMax.values()) if (v > wbsMaxChars) wbsMaxChars = v;

        const COL_COMMENTS = Math.round(Math.min(MAX_COMM, Math.max(MIN_COMM, commMaxChars * CHAR_PX + PAD_X)));
        const COL_WBS      = Math.round(Math.min(MAX_WBS,  Math.max(MIN_WBS,  wbsMaxChars  * CHAR_PX + PAD_X)));

        // Per-scenario TOTAL sub-cols (CompactCurrency: e.g. "$1.2M" ≈ digits+3)
        const totalSubPx: number[] = enabledTypes.map((s) => {
          let chars = (s.label.length + (!s.editable ? 1 : 0)) + 1;
          let typeGrand = 0;
          for (const perItem of itemTotalSum.values()) {
            const v = perItem[s.key] ?? 0;
            if (v !== 0) chars = Math.max(chars, String(Math.round(v)).length + 2);
            typeGrand += v;
          }
          if (typeGrand !== 0) chars = Math.max(chars, String(Math.round(typeGrand)).length + 2);
          return Math.round(Math.min(MAX_TOTAL_SUB, Math.max(MIN_TOTAL_SUB, chars * CHAR_PX + PAD_X)));
        });

        // Per-month per-scenario sub-cols
        const monthSubPx: number[] = [];
        for (let mi = 0; mi < 12; mi++) {
          for (const s of enabledTypes) {
            let chars = (s.label.length + (!s.editable ? 1 : 0)) + 1;
            const cellMax = monthMaxChars[mi][s.key] ?? 0;
            if (cellMax > chars) chars = cellMax;
            const gtm = monthGrandSum[mi][s.key] ?? 0;
            if (gtm !== 0) chars = Math.max(chars, formatCurrency(gtm).length);
            monthSubPx.push(Math.round(Math.min(MAX_MONTH_SUB, Math.max(MIN_MONTH_SUB, chars * CHAR_PX + PAD_X))));
          }
        }

        // Ensure the sub-cols for each month are wide enough for the month header label (e.g. "OCT")
        for (let mi = 0; mi < 12; mi++) {
          const start = mi * N;
          const sum = monthSubPx.slice(start, start + N).reduce((a, b) => a + b, 0);
          const needed = Math.ceil("SEP".length * HDR_CHAR_PX + PAD_X);
          if (sum < needed) {
            const extra = Math.ceil((needed - sum) / N);
            for (let k = 0; k < N; k++) monthSubPx[start + k] += extra;
          }
        }

        const totalColsTpl = totalSubPx.map(p => `${p}px`).join(" ");
        const monthColsTpl = monthSubPx.map(p => `${p}px`).join(" ");
        const gridTemplate = `${COL_COST}px ${COL_COMMENTS}px ${COL_WBS}px ${totalColsTpl} ${monthColsTpl}`;
        const minWidthPx =
          COL_COST + COL_COMMENTS + COL_WBS +
          totalSubPx.reduce((a, b) => a + b, 0) +
          monthSubPx.reduce((a, b) => a + b, 0);

        // Sticky-left offsets for the first three "frozen" columns
        const stickyL1 = 0;
        const stickyL2 = COL_COST;
        const stickyL3 = COL_COST + COL_COMMENTS;
        // Last sticky col gets a soft right shadow to indicate scrollable area
        const stickyEdgeShadow = "shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";

        const isCurrentMonth = (idx: number) => idx === currentMonthIdx;
        const monthHi = (idx: number) => isCurrentMonth(idx) ? "bg-amber-50 dark:bg-amber-950/20" : "";

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
                    style={{ gridColumn: `span ${N}` }}
                  ></div>
                  {yearGroups.map((g, gi) => (
                    <div
                      key={`y-${g.year}-${gi}`}
                      className={`flex items-center justify-center text-xs font-semibold tracking-wide text-muted-foreground ${monthBorder}`}
                      style={{ gridColumn: `span ${g.count * N}` }}
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
                    style={{ gridColumn: `span ${N}` }}
                  >
                    Total
                  </div>
                  {MONTHS.map((m, idx) => (
                    <div
                      key={`mn-${m.num}`}
                      className={`flex items-center justify-center text-xs font-semibold uppercase tracking-wider ${monthBorder} ${
                        isCurrentMonth(idx) ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200" : "text-muted-foreground"
                      }`}
                      style={{ gridColumn: `span ${N}` }}
                    >
                      {m.label}
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
                  {enabledTypes.map((s, i) => {
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
                  {MONTHS.map((m, idx) => (
                    enabledTypes.map((s, i) => {
                      const palette = getTypePalette(s.key);
                      const current = isCurrentMonth(idx);
                      return (
                        <div
                          key={`mlab-${m.num}-${s.key}`}
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
                  rows.map((row, rowIdx) => {
                    const isItem = row.type === "item";
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
                    return (
                      <div
                        key={row.key}
                        className={`grid border-b border-border/60 group hover:bg-accent/40 transition-colors ${rowBgClass}`}
                        style={{ gridTemplateColumns: gridTemplate }}
                        data-testid={`row-${row.type}-${row.key}`}
                      >
                        {/* Cost Item (sticky) */}
                        <div
                          className={`flex items-center gap-1.5 py-1.5 pr-2 sticky z-[1] ${stickyBgClass} ${stickyHover}`}
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
                          ) : (
                            <span className="truncate">{row.label}</span>
                          )}
                          {isItem && row.category && (
                            <Badge variant="outline" className="text-[10px] whitespace-nowrap shrink-0">
                              {row.category}
                            </Badge>
                          )}
                          {isItem && (
                            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => openEditDialog(row)}
                                data-testid={`button-edit-${row.itemKey}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => { setItemToDelete(row); setDeleteDialogOpen(true); }}
                                data-testid={`button-delete-${row.itemKey}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Comments (sticky) */}
                        <div
                          className={`px-3 py-1.5 text-xs text-muted-foreground truncate flex items-center sticky z-[1] ${stickyBgClass} ${stickyHover}`}
                          style={{ left: `${stickyL2}px` }}
                          title={row.comments || ""}
                        >
                          {isItem ? (row.comments || "") : ""}
                        </div>

                        {/* WBS (sticky, last frozen col → edge shadow) */}
                        <div
                          className={`px-3 py-1.5 text-xs text-muted-foreground tabular-nums truncate flex items-center sticky z-[1] ${stickyBgClass} ${stickyHover} ${stickyEdgeShadow}`}
                          style={{ left: `${stickyL3}px` }}
                        >
                          {isItem ? (row.wbs || "") : ""}
                        </div>

                        {/* Per-scenario row totals */}
                        {enabledTypes.map((s, sIdx) => {
                          const v = row.totalByType[s.key] ?? 0;
                          return (
                            <div
                              key={`total-${s.key}`}
                              className={`px-2 py-1.5 text-right text-xs font-semibold tabular-nums flex items-center justify-end ${sIdx === 0 ? monthBorder : typeBorder}`}
                            >
                              {v !== 0 ? <CompactCurrency value={v} /> : <span className="text-muted-foreground/40">—</span>}
                            </div>
                          );
                        })}

                        {/* Per-month per-scenario cells */}
                        {MONTHS.map((m, idx) => (
                          enabledTypes.map((s, sIdx) => {
                            const value = row.monthlyByType[s.key]?.[idx] ?? 0;
                            const borderCls = sIdx === 0 ? monthBorder : typeBorder;
                            const hi = monthHi(idx);
                            if (!isItem) {
                              return (
                                <div
                                  key={`${m.num}-${s.key}`}
                                  className={`px-1.5 py-1.5 text-right text-xs tabular-nums flex items-center justify-end ${borderCls} ${hi}`}
                                >
                                  {value !== 0 ? formatCurrency(value) : <span className="text-muted-foreground/30">—</span>}
                                </div>
                              );
                            }
                            const isEditing =
                              editingCell?.itemKey === row.itemKey &&
                              editingCell?.month === m.num &&
                              editingCell?.typeKey === s.key;
                            const editable = s.editable;
                            return (
                              <div key={`${m.num}-${s.key}`} className={`p-0.5 ${borderCls} ${hi}`}>
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
                                    className="h-7 text-xs text-right p-1 tabular-nums ring-2 ring-primary/40"
                                    data-testid={`input-${s.key}-m${m.num}-${row.itemKey}`}
                                  />
                                ) : (
                                  <div
                                    className={`h-7 flex items-center justify-end px-1.5 text-xs tabular-nums rounded-sm transition-all ${
                                      editable
                                        ? "cursor-cell hover:ring-1 hover:ring-primary/40 hover:bg-background"
                                        : "text-muted-foreground"
                                    }`}
                                    onClick={() => editable && handleCellClick(row, idx, s.key)}
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
                  })
                )}

                {/* Grand total row (sticky bottom) */}
                {rows.length > 0 && (
                  <div
                    className="grid bg-muted font-semibold border-t-2 border-border sticky bottom-0 z-20"
                    style={{ gridTemplateColumns: gridTemplate }}
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
                    {enabledTypes.map((s, sIdx) => {
                      const v = grandTotalByType[s.key] ?? 0;
                      return (
                        <div
                          key={`gt-total-${s.key}`}
                          className={`px-2 py-2 text-right text-sm font-bold tabular-nums flex items-center justify-end ${sIdx === 0 ? monthBorder : typeBorder}`}
                        >
                          {v !== 0 ? <CompactCurrency value={v} /> : <span className="text-muted-foreground/40">—</span>}
                        </div>
                      );
                    })}
                    {MONTHS.map((m, idx) => (
                      enabledTypes.map((s, sIdx) => {
                        const grandMonthForType = rows
                          .filter(r => r.type === "view")
                          .reduce((acc, r) => acc + (r.monthlyByType[s.key]?.[idx] ?? 0), 0);
                        return (
                          <div
                            key={`gt-${m.num}-${s.key}`}
                            className={`px-1.5 py-2 text-right text-xs tabular-nums flex items-center justify-end ${sIdx === 0 ? monthBorder : typeBorder} ${monthHi(idx)}`}
                          >
                            {grandMonthForType !== 0 ? formatCurrency(grandMonthForType) : <span className="text-muted-foreground/40">—</span>}
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
                <Label htmlFor="costCategory">Cost Category</Label>
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
                <Label htmlFor="costSpecification">Cost Specification</Label>
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
                <Label htmlFor="category">Category (legacy)</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger data-testid="select-cost-item-category">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGACY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
