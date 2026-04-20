import { useState, useMemo, useEffect } from "react";
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
import type { FinancialEntry, FinancialScenariosConfig, FinancialScenario } from "@shared/schema";
import { DEFAULT_FINANCIAL_SCENARIOS } from "@shared/schema";
import { CompactCurrency } from "@/components/CompactCurrency";
import { useOrganization } from "@/hooks/use-organization";

interface ProjectFinancialGridProps {
  projectId: number;
}

type Scenario = string;

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

const CATEGORIES = [
  "Direct Expense",
  "Licenses",
  "Outside Services",
  "Travel/Meals",
  "Project Material",
  "Labor",
  "Equipment",
  "Other",
];

const FINANCIAL_VIEWS = ["Capital", "Direct Expense", "Labor"];

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
  // monthlyByScenario[scenarioKey] = number[12]
  monthlyByScenario: Record<string, number[]>;
  // totalByScenario[scenarioKey] = sum of 12 cells for this row in that scenario
  totalByScenario: Record<string, number>;
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
  scenarioKeys: string[],
  expanded: Set<string>,
): { rows: GridRow[]; grandTotalByScenario: Record<string, number> } {
  const emptyMonthly = () => {
    const obj: Record<string, number[]> = {};
    for (const k of scenarioKeys) obj[k] = new Array(12).fill(0);
    return obj;
  };
  const emptyTotal = () => {
    const obj: Record<string, number> = {};
    for (const k of scenarioKeys) obj[k] = 0;
    return obj;
  };
  const scenarioSet = new Set(scenarioKeys);

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
    monthlyByScenario: Record<string, number[]>;
  };
  const items = new Map<string, ItemAgg>();
  for (const e of entries) {
    if (!scenarioSet.has(e.scenario)) continue;
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
        monthlyByScenario: emptyMonthly(),
      };
      items.set(e.itemKey, agg);
    }
    agg.monthlyByScenario[e.scenario][e.month - 1] = Number(e.amount) || 0;
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
  const grandTotalByScenario = emptyTotal();
  const addMonthly = (acc: Record<string, number[]>, add: Record<string, number[]>) => {
    for (const k of scenarioKeys) {
      for (let i = 0; i < 12; i++) acc[k][i] += add[k][i];
    }
  };
  const addTotals = (acc: Record<string, number>, add: Record<string, number>) => {
    for (const k of scenarioKeys) acc[k] += add[k];
  };
  const sumRow = (m: Record<string, number[]>): Record<string, number> => {
    const out = emptyTotal();
    for (const k of scenarioKeys) out[k] = m[k].reduce((a, b) => a + b, 0);
    return out;
  };

  const sortedViews = Object.keys(tree).sort();
  for (const v of sortedViews) {
    const viewKey = `view::${v}`;
    const viewMonthly = emptyMonthly();
    const viewTotals = emptyTotal();

    const sortedCats = Object.keys(tree[v]).sort();
    const catRows: GridRow[] = [];
    for (const c of sortedCats) {
      const catKey = `${viewKey}::cat::${c}`;
      const catMonthly = emptyMonthly();
      const catTotals = emptyTotal();

      const sortedSpecs = Object.keys(tree[v][c]).sort();
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
          const itemTotals = sumRow(it.monthlyByScenario);
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
            monthlyByScenario: it.monthlyByScenario,
            totalByScenario: itemTotals,
            hasChildren: false,
          });
          addMonthly(specMonthly, it.monthlyByScenario);
          addTotals(specTotals, itemTotals);
        }

        specRows.push({
          type: "specification",
          level: 2,
          key: specKey,
          label: s,
          monthlyByScenario: specMonthly,
          totalByScenario: specTotals,
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
        monthlyByScenario: catMonthly,
        totalByScenario: catTotals,
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
      monthlyByScenario: viewMonthly,
      totalByScenario: viewTotals,
      hasChildren: catRows.length > 0,
    });
    if (expanded.has(viewKey)) rows.push(...catRows);
    addTotals(grandTotalByScenario, viewTotals);
  }

  return { rows, grandTotalByScenario };
}

export default function ProjectFinancialGrid({ projectId }: ProjectFinancialGridProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);

  const orgId = currentOrganization?.id;
  const { data: scenariosConfig } = useQuery<FinancialScenariosConfig>({
    queryKey: ["/api/organizations", orgId, "financial-scenarios"],
    enabled: !!orgId,
  });

  // Server-defined scenarios (which exist + editable flag are org-wide).
  // Visibility (enabled flag) is overridden per-browser via localStorage so each
  // user's column show/hide preference doesn't affect teammates.
  const visibilityStorageKey = orgId ? `fr.financial-scenario-visibility.${orgId}` : null;
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

  const allScenarios: FinancialScenario[] = useMemo(() => {
    const base = scenariosConfig?.scenarios ?? DEFAULT_FINANCIAL_SCENARIOS.scenarios;
    return base.map(s =>
      Object.prototype.hasOwnProperty.call(visibilityOverride, s.key)
        ? { ...s, enabled: !!visibilityOverride[s.key] }
        : s,
    );
  }, [scenariosConfig, visibilityOverride]);

  const enabledScenarios: FinancialScenario[] = useMemo(
    () => allScenarios.filter(s => s.enabled),
    [allScenarios],
  );

  const toggleScenarioVisibility = (scenarioKey: string) => {
    const current = allScenarios.find(s => s.key === scenarioKey);
    if (!current) return;
    const nextEnabled = !current.enabled;
    // Don't allow hiding the last visible scenario.
    const remaining = allScenarios.filter(s =>
      s.key === scenarioKey ? nextEnabled : s.enabled,
    );
    if (remaining.length === 0) {
      toast({ title: "At least one scenario must stay visible", variant: "destructive" });
      return;
    }
    setVisibilityOverride(prev => {
      const next = { ...prev, [scenarioKey]: nextEnabled };
      if (typeof window !== "undefined" && visibilityStorageKey) {
        try { window.localStorage.setItem(visibilityStorageKey, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ itemKey: string; month: number; scenarioKey: string } | null>(null);
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
    mutationFn: async (data: { itemKey: string; scenario: Scenario; month: number; amount: number }) =>
      apiRequest("PUT", `/api/projects/${projectId}/financial-cells`, { fiscalYear, ...data }),
    onSuccess: () => invalidate(),
    onError: () => toast({ title: "Failed to update cell", variant: "destructive" }),
  });

  const enabledScenarioKeys = useMemo(() => enabledScenarios.map(s => s.key), [enabledScenarios]);
  const editableScenarioKeys = useMemo(
    () => enabledScenarios.filter(s => s.editable).map(s => s.key),
    [enabledScenarios],
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

  const { rows, grandTotalByScenario } = useMemo(
    () => buildGridRows(filteredEntries, enabledScenarioKeys, expanded),
    [filteredEntries, enabledScenarioKeys, expanded],
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
      financialView: "Capital",
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
      financialView: sample?.financialView || "Capital",
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

  const handleCellClick = (row: GridRow, monthIdx: number, scenarioKey: string) => {
    if (row.type !== "item" || !row.itemKey) return;
    const value = row.monthlyByScenario[scenarioKey]?.[monthIdx] ?? 0;
    setEditValue(String(value || 0));
    setEditingCell({ itemKey: row.itemKey, month: monthIdx + 1, scenarioKey });
  };

  const saveCellEdit = (next?: { itemKey: string; month: number; scenarioKey: string } | null) => {
    if (!editingCell) return;
    const amount = parseFloat(editValue) || 0;
    updateCellMutation.mutate({
      itemKey: editingCell.itemKey,
      scenario: editingCell.scenarioKey,
      month: editingCell.month,
      amount,
    });
    if (next) {
      const nextRow = editableRows.find(r => r.itemKey === next.itemKey);
      if (nextRow) {
        const v = nextRow.monthlyByScenario[next.scenarioKey]?.[next.month - 1] ?? 0;
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
  ): { itemKey: string; month: number; scenarioKey: string } | null => {
    if (!editingCell) return null;
    if (editableScenarioKeys.length === 0) return null;

    const rowIdx = editableRows.findIndex(r => r.itemKey === editingCell.itemKey);
    if (rowIdx === -1) return null;
    const monthIdx = editingCell.month - 1;
    const sceIdx = editableScenarioKeys.indexOf(editingCell.scenarioKey);
    if (sceIdx === -1) return null;

    const sceCount = editableScenarioKeys.length;
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
      scenarioKey: editableScenarioKeys[nextSubCol % sceCount],
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

          {/* Segmented scenario toggle */}
          <div className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5 gap-0.5">
            {allScenarios.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleScenarioVisibility(s.key)}
                className={`inline-flex items-center gap-1 px-3 h-8 text-xs font-medium rounded-sm transition-all ${
                  s.enabled
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }`}
                data-testid={`button-view-${s.key}`}
                title={
                  s.enabled
                    ? `${s.label} — ${s.editable ? "editable" : "read-only"}. Click to hide.`
                    : `${s.label} — hidden. Click to show.`
                }
              >
                {s.enabled && !s.editable && <Lock className="h-3 w-3 opacity-60" />}
                {s.label}
              </button>
            ))}
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
        const N = Math.max(enabledScenarios.length, 1);
        const COL_COST = 300;

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
        // monthMax[mi][scenarioKey] = max |amount| char-length seen at that cell
        const monthMaxChars: Record<string, number>[] = Array.from({ length: 12 }, () => ({}));
        // itemTotalSum[itemKey][scenarioKey] = sum across 12 months
        const itemTotalSum = new Map<string, Record<string, number>>();
        // monthGrandSum[mi][scenarioKey] = grand total per month/scenario
        const monthGrandSum: Record<string, number>[] = Array.from({ length: 12 }, () => ({}));
        // Per-item longest comments/wbs across all entries for that item
        // (data may be inconsistent across rows for the same itemKey)
        const itemCommentMax = new Map<string, number>();
        const itemWbsMax = new Map<string, number>();

        for (const e of filteredEntries) {
          if (!enabledScenarioKeys.includes(e.scenario)) continue;
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
        const totalSubPx: number[] = enabledScenarios.map((s) => {
          let chars = (s.label.length + (!s.editable ? 1 : 0)) + 1;
          let scenarioGrand = 0;
          for (const perItem of itemTotalSum.values()) {
            const v = perItem[s.key] ?? 0;
            if (v !== 0) chars = Math.max(chars, String(Math.round(v)).length + 2);
            scenarioGrand += v;
          }
          if (scenarioGrand !== 0) chars = Math.max(chars, String(Math.round(scenarioGrand)).length + 2);
          return Math.round(Math.min(MAX_TOTAL_SUB, Math.max(MIN_TOTAL_SUB, chars * CHAR_PX + PAD_X)));
        });

        // Per-month per-scenario sub-cols
        const monthSubPx: number[] = [];
        for (let mi = 0; mi < 12; mi++) {
          for (const s of enabledScenarios) {
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
        const scenarioBorder = "border-l border-border/40";

        const sortableHeader = (label: string) => (
          <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            <span>{label}</span>
            <ArrowUpDown className="h-3 w-3 opacity-50" />
          </div>
        );

        // Container scroll height: respect fullscreen
        const tableMaxH = isFullscreen ? "max-h-[calc(100vh-180px)]" : "max-h-[calc(100vh-260px)]";

        return (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
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

                {/* Header row 3: scenario sub-labels (sticky top) */}
                <div
                  className="grid bg-card border-b sticky z-30 h-7 text-[10px] uppercase tracking-wide font-medium text-muted-foreground"
                  style={{ gridTemplateColumns: gridTemplate, top: "76px" }}
                >
                  <div className="bg-card sticky z-10" style={{ left: `${stickyL1}px` }}></div>
                  <div className="bg-card sticky z-10" style={{ left: `${stickyL2}px` }}></div>
                  <div className={`bg-card sticky z-10 ${stickyEdgeShadow}`} style={{ left: `${stickyL3}px` }}></div>
                  {enabledScenarios.map((s, i) => (
                    <div
                      key={`tlab-${s.key}`}
                      className={`flex items-center justify-center gap-1 ${i === 0 ? monthBorder : scenarioBorder}`}
                      title={s.editable ? `${s.label} (editable)` : `${s.label} (read-only)`}
                    >
                      {!s.editable && <Lock className="h-2.5 w-2.5 opacity-60" />}
                      <span>{s.label}</span>
                    </div>
                  ))}
                  {MONTHS.map((m, idx) => (
                    enabledScenarios.map((s, i) => (
                      <div
                        key={`mlab-${m.num}-${s.key}`}
                        className={`flex items-center justify-center gap-1 ${i === 0 ? monthBorder : scenarioBorder} ${monthHi(idx)}`}
                        title={s.editable ? `${s.label} (editable)` : `${s.label} (read-only)`}
                      >
                        {!s.editable && <Lock className="h-2.5 w-2.5 opacity-60" />}
                        <span>{s.label}</span>
                      </div>
                    ))
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
                        {enabledScenarios.map((s, sIdx) => {
                          const v = row.totalByScenario[s.key] ?? 0;
                          return (
                            <div
                              key={`total-${s.key}`}
                              className={`px-2 py-1.5 text-right text-xs font-semibold tabular-nums flex items-center justify-end ${sIdx === 0 ? monthBorder : scenarioBorder}`}
                            >
                              {v !== 0 ? <CompactCurrency value={v} /> : <span className="text-muted-foreground/40">—</span>}
                            </div>
                          );
                        })}

                        {/* Per-month per-scenario cells */}
                        {MONTHS.map((m, idx) => (
                          enabledScenarios.map((s, sIdx) => {
                            const value = row.monthlyByScenario[s.key]?.[idx] ?? 0;
                            const borderCls = sIdx === 0 ? monthBorder : scenarioBorder;
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
                              editingCell?.scenarioKey === s.key;
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
                    {enabledScenarios.map((s, sIdx) => {
                      const v = grandTotalByScenario[s.key] ?? 0;
                      return (
                        <div
                          key={`gt-total-${s.key}`}
                          className={`px-2 py-2 text-right text-sm font-bold tabular-nums flex items-center justify-end ${sIdx === 0 ? monthBorder : scenarioBorder}`}
                        >
                          {v !== 0 ? <CompactCurrency value={v} /> : <span className="text-muted-foreground/40">—</span>}
                        </div>
                      );
                    })}
                    {MONTHS.map((m, idx) => (
                      enabledScenarios.map((s, sIdx) => {
                        const grandMonthForScenario = rows
                          .filter(r => r.type === "view")
                          .reduce((acc, r) => acc + (r.monthlyByScenario[s.key]?.[idx] ?? 0), 0);
                        return (
                          <div
                            key={`gt-${m.num}-${s.key}`}
                            className={`px-1.5 py-2 text-right text-xs tabular-nums flex items-center justify-end ${sIdx === 0 ? monthBorder : scenarioBorder} ${monthHi(idx)}`}
                          >
                            {grandMonthForScenario !== 0 ? formatCurrency(grandMonthForScenario) : <span className="text-muted-foreground/40">—</span>}
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
                  onValueChange={(v) => setFormData({ ...formData, financialView: v })}
                >
                  <SelectTrigger data-testid="select-financial-view">
                    <SelectValue placeholder="Select view" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCIAL_VIEWS.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costCategory">Cost Category</Label>
                <Input
                  id="costCategory"
                  value={formData.costCategory}
                  onChange={(e) => setFormData({ ...formData, costCategory: e.target.value })}
                  placeholder="e.g., Infrastructure"
                  data-testid="input-cost-category"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costSpecification">Cost Specification</Label>
                <Input
                  id="costSpecification"
                  value={formData.costSpecification}
                  onChange={(e) => setFormData({ ...formData, costSpecification: e.target.value })}
                  placeholder="e.g., Production cluster"
                  data-testid="input-cost-specification"
                />
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
                    {CATEGORIES.map((c) => (
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
