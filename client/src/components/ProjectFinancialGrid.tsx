import { useState, useMemo } from "react";
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
import type { FinancialEntry } from "@shared/schema";
import { CompactCurrency } from "@/components/CompactCurrency";

interface ProjectFinancialGridProps {
  projectId: number;
}

type Scenario = "aop" | "fcst" | "act";

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
  // For "item" rows we carry the dimensions + the 12 month values for the active scenario
  itemKey?: string;
  itemName?: string;
  category?: string | null;
  wbs?: string | null;
  comments?: string | null;
  monthly: number[];      // length 12 (for the active scenario)
  total: number;          // sum of monthly for this row
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
 * entries for the active scenario. Grouping order:
 *   Financial View → Cost Category → Cost Specification → Item
 * Subtotals at every level are computed from the leaf cells.
 */
function buildGridRows(
  entries: FinancialEntry[],
  scenario: Scenario,
  expanded: Set<string>,
): { rows: GridRow[]; grandTotal: number } {
  // Filter to the active scenario; group all 12 cells per (itemKey).
  const scoped = entries.filter(e => e.scenario === scenario);

  // First, fold cells of the same item into one record with monthly[12].
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
    monthly: number[];
  };
  const items = new Map<string, ItemAgg>();
  for (const e of scoped) {
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
        monthly: new Array(12).fill(0),
      };
      items.set(e.itemKey, agg);
    }
    agg.monthly[e.month - 1] = Number(e.amount) || 0;
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
  let grandTotal = 0;
  const sumMonthly = (acc: number[], add: number[]) => {
    for (let i = 0; i < 12; i++) acc[i] += add[i];
  };

  const sortedViews = Object.keys(tree).sort();
  for (const v of sortedViews) {
    const viewKey = `view::${v}`;
    const viewMonthly = new Array(12).fill(0);
    let viewTotal = 0;

    const sortedCats = Object.keys(tree[v]).sort();
    const catRows: GridRow[] = [];
    for (const c of sortedCats) {
      const catKey = `${viewKey}::cat::${c}`;
      const catMonthly = new Array(12).fill(0);
      let catTotal = 0;

      const sortedSpecs = Object.keys(tree[v][c]).sort();
      const specRows: GridRow[] = [];
      for (const s of sortedSpecs) {
        const specKey = `${catKey}::spec::${s}`;
        const specMonthly = new Array(12).fill(0);
        let specTotal = 0;

        const itemList = tree[v][c][s].slice().sort(
          (a, b) => (a.sortOrder - b.sortOrder) || a.itemName.localeCompare(b.itemName),
        );
        const itemRows: GridRow[] = [];
        for (const it of itemList) {
          const itemTotal = it.monthly.reduce((a, b) => a + b, 0);
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
            monthly: it.monthly,
            total: itemTotal,
            hasChildren: false,
          });
          sumMonthly(specMonthly, it.monthly);
          specTotal += itemTotal;
        }

        specRows.push({
          type: "specification",
          level: 2,
          key: specKey,
          label: s,
          monthly: specMonthly,
          total: specTotal,
          hasChildren: itemRows.length > 0,
        });
        if (expanded.has(specKey)) specRows.push(...itemRows);
        sumMonthly(catMonthly, specMonthly);
        catTotal += specTotal;
      }

      catRows.push({
        type: "category",
        level: 1,
        key: catKey,
        label: c,
        monthly: catMonthly,
        total: catTotal,
        hasChildren: specRows.length > 0,
      });
      if (expanded.has(catKey)) catRows.push(...specRows);
      sumMonthly(viewMonthly, catMonthly);
      viewTotal += catTotal;
    }

    rows.push({
      type: "view",
      level: 0,
      key: viewKey,
      label: v,
      monthly: viewMonthly,
      total: viewTotal,
      hasChildren: catRows.length > 0,
    });
    if (expanded.has(viewKey)) rows.push(...catRows);
    grandTotal += viewTotal;
  }

  return { rows, grandTotal };
}

export default function ProjectFinancialGrid({ projectId }: ProjectFinancialGridProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [scenario, setScenario] = useState<Scenario>("fcst");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ itemKey: string; month: number } | null>(null);
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

  const { rows, grandTotal } = useMemo(
    () => buildGridRows(entries, scenario, expanded),
    [entries, scenario, expanded],
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

  const handleCellClick = (row: GridRow, monthIdx: number) => {
    if (row.type !== "item" || !row.itemKey) return;
    setEditValue(String(row.monthly[monthIdx] || 0));
    setEditingCell({ itemKey: row.itemKey, month: monthIdx + 1 });
  };

  const saveCellEdit = (next?: { itemKey: string; month: number } | null) => {
    if (!editingCell) return;
    const amount = parseFloat(editValue) || 0;
    updateCellMutation.mutate({
      itemKey: editingCell.itemKey,
      scenario,
      month: editingCell.month,
      amount,
    });
    if (next) {
      const nextRow = editableRows.find(r => r.itemKey === next.itemKey);
      if (nextRow) {
        setEditValue(String(nextRow.monthly[next.month - 1] || 0));
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

  // Excel-like navigation across only editable item rows.
  const getNeighborCell = (
    direction: "up" | "down" | "left" | "right",
  ): { itemKey: string; month: number } | null => {
    if (!editingCell) return null;

    const rowIdx = editableRows.findIndex(r => r.itemKey === editingCell.itemKey);
    if (rowIdx === -1) return null;
    const colIdx = editingCell.month - 1;

    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (direction === "up") nextRow = Math.max(0, rowIdx - 1);
    if (direction === "down") nextRow = Math.min(editableRows.length - 1, rowIdx + 1);
    if (direction === "left") {
      if (colIdx > 0) nextCol = colIdx - 1;
      else if (rowIdx > 0) { nextRow = rowIdx - 1; nextCol = 11; }
    }
    if (direction === "right") {
      if (colIdx < 11) nextCol = colIdx + 1;
      else if (rowIdx < editableRows.length - 1) { nextRow = rowIdx + 1; nextCol = 0; }
    }

    if (nextRow === rowIdx && nextCol === colIdx) return null;
    return { itemKey: editableRows[nextRow].itemKey!, month: nextCol + 1 };
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

          <div className="flex rounded-md border">
            <Button
              variant={scenario === "aop" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setScenario("aop")}
              className="rounded-r-none"
              data-testid="button-view-aop"
            >AOP</Button>
            <Button
              variant={scenario === "fcst" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setScenario("fcst")}
              className="rounded-none border-x"
              data-testid="button-view-fcst"
            >FCST</Button>
            <Button
              variant={scenario === "act" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setScenario("act")}
              className="rounded-l-none"
              data-testid="button-view-act"
            >ACT</Button>
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

      <div className="border rounded-md">
        <ScrollArea className="w-full">
          <div className="min-w-[1200px]">
            <div className="grid grid-cols-[280px_80px_100px_repeat(12,70px)_90px_40px] bg-muted/50 border-b text-sm font-medium">
              <div className="p-2 pl-4">Cost Item</div>
              <div className="p-2 text-center">WBS</div>
              <div className="p-2 text-center">Category</div>
              {MONTHS.map((m) => (
                <div key={m.num} className="p-2 text-center">{m.label}</div>
              ))}
              <div className="p-2 text-center font-semibold">Total</div>
              <div className="p-2"></div>
            </div>

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
                    className={`grid grid-cols-[280px_80px_100px_repeat(12,70px)_90px_40px] border-b hover-elevate group ${rowBg}`}
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

                    {MONTHS.map((m, idx) => {
                      const value = row.monthly[idx];
                      if (!isItem) {
                        return (
                          <div key={m.num} className="p-2 text-center text-xs">
                            {value !== 0 ? formatCurrency(value) : ""}
                          </div>
                        );
                      }
                      const isEditing = editingCell?.itemKey === row.itemKey && editingCell?.month === m.num;
                      const editable = isItem;
                      return (
                        <div key={m.num} className="p-1">
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
                              data-testid={`input-${scenario}-m${m.num}-${row.itemKey}`}
                            />
                          ) : (
                            <div
                              className={`h-7 flex items-center justify-center text-xs rounded ${editable ? "cursor-pointer hover:bg-muted/50" : "text-muted-foreground"}`}
                              onClick={() => editable && handleCellClick(row, idx)}
                              data-testid={`cell-${scenario}-m${m.num}-${row.itemKey}`}
                            >
                              {value !== 0 ? formatCurrency(value) : "-"}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="p-2 text-center text-sm">
                      <CompactCurrency value={row.total} />
                    </div>

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
              <div className="grid grid-cols-[280px_80px_100px_repeat(12,70px)_90px_40px] bg-muted/50 font-semibold border-t-2">
                <div className="p-2 pl-4">Grand Total</div>
                <div className="p-2"></div>
                <div className="p-2"></div>
                {MONTHS.map((m) => (
                  <div key={m.num} className="p-2"></div>
                ))}
                <div className="p-2 text-center"><CompactCurrency value={grandTotal} /></div>
                <div className="p-2"></div>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

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
