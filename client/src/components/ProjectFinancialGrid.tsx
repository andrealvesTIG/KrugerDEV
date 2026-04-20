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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, DollarSign, FileSpreadsheet, Maximize2, Minimize2 } from "lucide-react";
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

  const allScenarios: FinancialScenario[] = useMemo(() => {
    return scenariosConfig?.scenarios ?? DEFAULT_FINANCIAL_SCENARIOS.scenarios;
  }, [scenariosConfig]);

  const enabledScenarios: FinancialScenario[] = useMemo(
    () => allScenarios.filter(s => s.enabled),
    [allScenarios],
  );

  const toggleScenarioMutation = useMutation({
    mutationFn: async (scenarioKey: string) => {
      if (!orgId) throw new Error("No organization");
      const next = allScenarios.map(s =>
        s.key === scenarioKey ? { ...s, enabled: !s.enabled } : s,
      );
      // Don't allow turning off the last enabled scenario.
      if (!next.some(s => s.enabled)) {
        throw new Error("At least one scenario must stay enabled");
      }
      await apiRequest("PUT", `/api/organizations/${orgId}/financial-scenarios`, { scenarios: next });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", orgId, "financial-scenarios"] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update scenario", description: err?.message || "Please try again", variant: "destructive" });
    },
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ itemKey: string; month: number; scenarioKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const { rows, grandTotalByScenario } = useMemo(
    () => buildGridRows(entries, enabledScenarioKeys, expanded),
    [entries, enabledScenarioKeys, expanded],
  );

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Financial Grid</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={String(fiscalYear)} onValueChange={(v) => setFiscalYear(Number(v))}>
            <SelectTrigger className="w-32" data-testid="select-fiscal-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                <SelectItem key={y} value={String(y)}>FY{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-md border overflow-hidden">
            {allScenarios.map((s, i) => (
              <Button
                key={s.key}
                variant={s.enabled ? "secondary" : "ghost"}
                size="sm"
                onClick={() => toggleScenarioMutation.mutate(s.key)}
                disabled={toggleScenarioMutation.isPending}
                className={`rounded-none ${i > 0 ? "border-l" : ""} ${!s.enabled ? "opacity-40 line-through" : ""}`}
                data-testid={`button-view-${s.key}`}
                title={
                  s.enabled
                    ? `${s.label} — ${s.editable ? "editable" : "read-only"}. Click to hide this column.`
                    : `${s.label} — hidden. Click to show this column.`
                }
              >
                {s.label}
              </Button>
            ))}
          </div>

          <Button size="sm" onClick={openCreateDialog} data-testid="button-add-cost-item">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullscreen(v => !v)}
            title={isFullscreen ? "Exit full screen" : "Expand to full screen"}
            data-testid="button-toggle-fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {(() => {
        const N = Math.max(enabledScenarios.length, 1);
        const SUB_COL_PX = 60;
        const TOTAL_SUB_COL_PX = 90;
        const gridTemplate = `280px 80px 100px repeat(${N * 12}, ${SUB_COL_PX}px) repeat(${N}, ${TOTAL_SUB_COL_PX}px) 40px`;
        const minWidthPx = 280 + 80 + 100 + N * 12 * SUB_COL_PX + N * TOTAL_SUB_COL_PX + 40;

        return (
          <div className="border rounded-md">
            <ScrollArea className="w-full">
              <div style={{ minWidth: `${minWidthPx}px` }}>
                {/* Top header: months span N sub-cols each, plus a Total spanning N */}
                <div
                  className="grid bg-muted/50 border-b text-sm font-medium"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="p-2 pl-4">Cost Item</div>
                  <div className="p-2 text-center">WBS</div>
                  <div className="p-2 text-center">Category</div>
                  {MONTHS.map((m) => (
                    <div
                      key={m.num}
                      className="p-2 text-center border-l"
                      style={{ gridColumn: `span ${N}` }}
                    >
                      {m.label}
                    </div>
                  ))}
                  <div
                    className="p-2 text-center font-semibold border-l"
                    style={{ gridColumn: `span ${N}` }}
                  >
                    Total
                  </div>
                  <div className="p-2"></div>
                </div>

                {/* Sub-header: scenario labels per month and per total (only when N > 1) */}
                {N > 1 && (
                  <div
                    className="grid bg-muted/30 border-b text-[10px] uppercase tracking-wide font-medium text-muted-foreground"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div></div>
                    <div></div>
                    <div></div>
                    {MONTHS.map((m) => (
                      enabledScenarios.map((s, i) => (
                        <div
                          key={`${m.num}-${s.key}`}
                          className={`p-1 text-center ${i === 0 ? "border-l" : ""}`}
                          title={s.editable ? `${s.label} (editable)` : `${s.label} (read-only)`}
                        >
                          {s.label}
                        </div>
                      ))
                    ))}
                    {enabledScenarios.map((s, i) => (
                      <div
                        key={`total-${s.key}`}
                        className={`p-1 text-center ${i === 0 ? "border-l" : ""}`}
                      >
                        {s.label}
                      </div>
                    ))}
                    <div></div>
                  </div>
                )}

                {rows.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No financial entries for FY{fiscalYear}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={openCreateDialog}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  rows.map((row) => {
                    const isItem = row.type === "item";
                    const rowBg =
                      row.type === "view" ? "bg-muted/40 font-semibold" :
                      row.type === "category" ? "bg-muted/20 font-medium" :
                      row.type === "specification" ? "bg-muted/10" : "";
                    return (
                      <div
                        key={row.key}
                        className={`grid border-b hover-elevate group ${rowBg}`}
                        style={{ gridTemplateColumns: gridTemplate }}
                        data-testid={`row-${row.type}-${row.key}`}
                      >
                        <div
                          className="p-2 flex items-center gap-1"
                          style={{ paddingLeft: `${16 + row.level * 16}px` }}
                        >
                          {row.hasChildren ? (
                            <button
                              onClick={() => toggleExpand(row.key)}
                              className="p-0.5 hover-elevate rounded"
                              data-testid={`button-expand-${row.key}`}
                            >
                              {expanded.has(row.key) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="w-5" />
                          )}
                          <span className="truncate">{row.label}</span>
                        </div>

                        <div className="p-2 text-center text-xs text-muted-foreground">
                          {isItem ? (row.wbs || "-") : ""}
                        </div>

                        <div className="p-2 text-center">
                          {isItem && row.category && (
                            <Badge variant="outline" className="text-xs truncate max-w-full">
                              {row.category}
                            </Badge>
                          )}
                        </div>

                        {MONTHS.map((m, idx) => (
                          enabledScenarios.map((s, sIdx) => {
                            const value = row.monthlyByScenario[s.key]?.[idx] ?? 0;
                            const borderClass = sIdx === 0 ? "border-l" : "";
                            if (!isItem) {
                              return (
                                <div
                                  key={`${m.num}-${s.key}`}
                                  className={`p-2 text-center text-xs ${borderClass}`}
                                >
                                  {value !== 0 ? formatCurrency(value) : ""}
                                </div>
                              );
                            }
                            const isEditing =
                              editingCell?.itemKey === row.itemKey &&
                              editingCell?.month === m.num &&
                              editingCell?.scenarioKey === s.key;
                            const editable = isItem && s.editable;
                            return (
                              <div key={`${m.num}-${s.key}`} className={`p-1 ${borderClass}`}>
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
                                    className="h-7 text-xs text-center p-1"
                                    data-testid={`input-${s.key}-m${m.num}-${row.itemKey}`}
                                  />
                                ) : (
                                  <div
                                    className={`h-7 flex items-center justify-center text-xs rounded ${editable ? "cursor-pointer hover:bg-muted/50" : "text-muted-foreground"}`}
                                    onClick={() => editable && handleCellClick(row, idx, s.key)}
                                    data-testid={`cell-${s.key}-m${m.num}-${row.itemKey}`}
                                  >
                                    {value !== 0 ? formatCurrency(value) : "-"}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ))}

                        {enabledScenarios.map((s, sIdx) => (
                          <div
                            key={`total-${s.key}`}
                            className={`p-2 text-center text-sm ${sIdx === 0 ? "border-l" : ""}`}
                          >
                            <CompactCurrency value={row.totalByScenario[s.key] ?? 0} />
                          </div>
                        ))}

                        <div className="p-1 flex items-center gap-0.5">
                          {isItem && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                onClick={() => openEditDialog(row)}
                                data-testid={`button-edit-${row.itemKey}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                                onClick={() => { setItemToDelete(row); setDeleteDialogOpen(true); }}
                                data-testid={`button-delete-${row.itemKey}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {rows.length > 0 && (
                  <div
                    className="grid bg-muted/50 font-semibold border-t-2"
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div className="p-2 pl-4">Grand Total</div>
                    <div className="p-2"></div>
                    <div className="p-2"></div>
                    {MONTHS.map((m) => (
                      enabledScenarios.map((s, sIdx) => (
                        <div
                          key={`gt-${m.num}-${s.key}`}
                          className={`p-2 ${sIdx === 0 ? "border-l" : ""}`}
                        ></div>
                      ))
                    ))}
                    {enabledScenarios.map((s, sIdx) => (
                      <div
                        key={`gt-total-${s.key}`}
                        className={`p-2 text-center ${sIdx === 0 ? "border-l" : ""}`}
                      >
                        <CompactCurrency value={grandTotalByScenario[s.key] ?? 0} />
                      </div>
                    ))}
                    <div className="p-2"></div>
                  </div>
                )}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
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
