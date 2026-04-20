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
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2, DollarSign, TrendingUp, FileSpreadsheet } from "lucide-react";
import type { CostItem } from "@shared/schema";
import { CompactCurrency } from "@/components/CompactCurrency";

interface ProjectFinancialGridProps {
  projectId: number;
}

type ViewMode = "fcst" | "act" | "aop";

interface CostItemNode extends CostItem {
  children: CostItemNode[];
  level: number;
}

const MONTHS = [
  { key: "M1", label: "Oct" },
  { key: "M2", label: "Nov" },
  { key: "M3", label: "Dec" },
  { key: "M4", label: "Jan" },
  { key: "M5", label: "Feb" },
  { key: "M6", label: "Mar" },
  { key: "M7", label: "Apr" },
  { key: "M8", label: "May" },
  { key: "M9", label: "Jun" },
  { key: "M10", label: "Jul" },
  { key: "M11", label: "Aug" },
  { key: "M12", label: "Sep" },
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

function buildTree(items: CostItem[]): CostItemNode[] {
  const itemMap = new Map<number, CostItemNode>();
  const roots: CostItemNode[] = [];

  items.forEach((item) => {
    itemMap.set(item.id, { ...item, children: [], level: 0 });
  });

  items.forEach((item) => {
    const node = itemMap.get(item.id)!;
    if (item.parentId && itemMap.has(item.parentId)) {
      const parent = itemMap.get(item.parentId)!;
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function flattenTree(nodes: CostItemNode[], expanded: Set<number>): CostItemNode[] {
  const result: CostItemNode[] = [];
  
  function traverse(node: CostItemNode) {
    result.push(node);
    if (node.children.length > 0 && expanded.has(node.id)) {
      node.children.forEach(traverse);
    }
  }
  
  nodes.forEach(traverse);
  return result;
}

function formatCurrency(value: string | number | null | undefined): string {
  const num = parseFloat(String(value || 0));
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function getMonthValue(item: CostItem, month: string, viewMode: ViewMode): number {
  const prefix = viewMode === "fcst" ? "fcst" : viewMode === "act" ? "act" : "aop";
  const key = `${prefix}${month}` as keyof CostItem;
  return parseFloat(String(item[key] || 0)) || 0;
}

function getTotalValue(item: CostItem, viewMode: ViewMode): number {
  if (viewMode === "aop") return parseFloat(String(item.aopTotal || 0)) || 0;
  if (viewMode === "fcst") return parseFloat(String(item.fcstTotal || 0)) || 0;
  return parseFloat(String(item.actTotal || 0)) || 0;
}

export default function ProjectFinancialGrid({ projectId }: ProjectFinancialGridProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(currentYear);
  const [viewMode, setViewMode] = useState<ViewMode>("fcst");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CostItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CostItem | null>(null);
  const [parentIdForNew, setParentIdForNew] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    wbs: "",
    category: "",
    comments: "",
    aopTotal: "0",
  });

  const { data: costItems = [], isLoading } = useQuery<CostItem[]>({
    queryKey: ["/api/projects", projectId, "cost-items", fiscalYear],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/cost-items?fiscalYear=${fiscalYear}`);
      if (!res.ok) throw new Error("Failed to fetch cost items");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<CostItem>) => {
      return apiRequest("POST", `/api/projects/${projectId}/cost-items`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "cost-items"] });
      toast({ title: "Cost item created" });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to create cost item", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CostItem> }) => {
      return apiRequest("PUT", `/api/cost-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "cost-items"] });
    },
    onError: () => {
      toast({ title: "Failed to update cost item", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/cost-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "cost-items"] });
      toast({ title: "Cost item deleted" });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: () => {
      toast({ title: "Failed to delete cost item", variant: "destructive" });
    },
  });

  const tree = useMemo(() => buildTree(costItems), [costItems]);
  const flatItems = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpanded(next);
  };

  const hasChildren = (id: number) => {
    return costItems.some((item) => item.parentId === id);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      wbs: "",
      category: "",
      comments: "",
      aopTotal: "0",
    });
    setEditItem(null);
    setParentIdForNew(null);
  };

  const openCreateDialog = (parentId: number | null = null) => {
    resetForm();
    setParentIdForNew(parentId);
    setDialogOpen(true);
  };

  const openEditDialog = (item: CostItem) => {
    setEditItem(item);
    setFormData({
      name: item.name,
      wbs: item.wbs || "",
      category: item.category || "",
      comments: item.comments || "",
      aopTotal: String(item.aopTotal || "0"),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    if (editItem) {
      updateMutation.mutate({
        id: editItem.id,
        data: {
          name: formData.name,
          wbs: formData.wbs || null,
          category: formData.category || null,
          comments: formData.comments || null,
          aopTotal: parseFloat(formData.aopTotal) || 0,
        },
      });
      setDialogOpen(false);
      resetForm();
    } else {
      createMutation.mutate({
        name: formData.name,
        wbs: formData.wbs || null,
        category: formData.category || null,
        comments: formData.comments || null,
        fiscalYear,
        parentId: parentIdForNew,
        aopTotal: parseFloat(formData.aopTotal) || 0,
      });
    }
  };

  const handleCellEdit = (item: CostItem, field: string) => {
    const value = getMonthValue(item, field.replace("fcst", "").replace("act", ""), viewMode);
    setEditValue(String(value));
    setEditingCell({ id: item.id, field });
  };

  const saveCellEdit = () => {
    if (!editingCell) return;
    
    const numValue = parseFloat(editValue) || 0;
    const updates: Partial<CostItem> = {
      [editingCell.field]: numValue,
    };
    
    // Recalculate total
    const item = costItems.find((i) => i.id === editingCell.id);
    if (item) {
      const prefix = viewMode === "act" ? "act" : "fcst";
      let total = 0;
      MONTHS.forEach((m) => {
        const key = `${prefix}${m.key}` as keyof CostItem;
        if (editingCell.field === `${prefix}${m.key}`) {
          total += numValue;
        } else {
          total += parseFloat(String(item[key] || 0)) || 0;
        }
      });
      updates[viewMode === "act" ? "actTotal" : "fcstTotal"] = total;
    }

    updateMutation.mutate({ id: editingCell.id, data: updates });
    setEditingCell(null);
    setEditValue("");
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const grandTotal = useMemo(() => {
    return costItems
      .filter((item) => !item.parentId)
      .reduce((sum, item) => sum + getTotalValue(item, viewMode), 0);
  }, [costItems, viewMode]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading financial data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                <SelectItem key={y} value={String(y)}>
                  FY{y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "aop" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("aop")}
              className="rounded-r-none"
              data-testid="button-view-aop"
            >
              AOP
            </Button>
            <Button
              variant={viewMode === "fcst" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("fcst")}
              className="rounded-none border-x"
              data-testid="button-view-fcst"
            >
              FCST
            </Button>
            <Button
              variant={viewMode === "act" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("act")}
              className="rounded-l-none"
              data-testid="button-view-act"
            >
              ACT
            </Button>
          </div>

          <Button size="sm" onClick={() => openCreateDialog(null)} data-testid="button-add-cost-item">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>
      </div>

      <div className="border rounded-md">
        <ScrollArea className="w-full">
          <div className="min-w-[1200px]">
            <div className="grid grid-cols-[250px_80px_100px_repeat(12,70px)_90px_40px] bg-muted/50 border-b text-sm font-medium">
              <div className="p-2 pl-4">Cost Item</div>
              <div className="p-2 text-center">WBS</div>
              <div className="p-2 text-center">Category</div>
              {MONTHS.map((m) => (
                <div key={m.key} className="p-2 text-center">{m.label}</div>
              ))}
              <div className="p-2 text-center font-semibold">Total</div>
              <div className="p-2"></div>
            </div>

            {flatItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No cost items for FY{fiscalYear}</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => openCreateDialog(null)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add First Item
                </Button>
              </div>
            ) : (
              flatItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[250px_80px_100px_repeat(12,70px)_90px_40px] border-b hover-elevate group"
                  data-testid={`row-cost-item-${item.id}`}
                >
                  <div
                    className="p-2 flex items-center gap-1"
                    style={{ paddingLeft: `${16 + item.level * 20}px` }}
                  >
                    {hasChildren(item.id) ? (
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="p-0.5 hover-elevate rounded"
                        data-testid={`button-expand-${item.id}`}
                      >
                        {expanded.has(item.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}
                    <span className="truncate font-medium">{item.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => openCreateDialog(item.id)}
                      data-testid={`button-add-child-${item.id}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="p-2 text-center text-xs text-muted-foreground">
                    {item.wbs || "-"}
                  </div>
                  
                  <div className="p-2 text-center">
                    {item.category && (
                      <Badge variant="outline" className="text-xs truncate max-w-full">
                        {item.category}
                      </Badge>
                    )}
                  </div>

                  {viewMode === "aop" ? (
                    <>
                      {MONTHS.map((m) => {
                        const distributedValue = getMonthValue(item, m.key, viewMode);
                        return (
                          <div 
                            key={m.key} 
                            className="p-2 text-center text-xs text-muted-foreground"
                            data-testid={`cell-aop-${m.key}-${item.id}`}
                          >
                            {distributedValue > 0 ? formatCurrency(distributedValue) : "-"}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    MONTHS.map((m) => {
                      const field = `${viewMode}${m.key}`;
                      const value = getMonthValue(item, m.key, viewMode);
                      const isEditing = editingCell?.id === item.id && editingCell?.field === field;

                      return (
                        <div key={m.key} className="p-1">
                          {isEditing ? (
                            <Input
                              autoFocus
                              type="number"
                              value={editValue}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveCellEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveCellEdit();
                                if (e.key === "Escape") cancelCellEdit();
                              }}
                              className="h-7 text-xs text-center p-1"
                              data-testid={`input-${field}-${item.id}`}
                            />
                          ) : (
                            <div
                              className="h-7 flex items-center justify-center text-xs cursor-pointer hover:bg-muted/50 rounded"
                              onClick={() => handleCellEdit(item, field)}
                              data-testid={`cell-${field}-${item.id}`}
                            >
                              {value !== 0 ? formatCurrency(value) : "-"}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  <div className="p-2 text-center font-medium text-sm">
                    <CompactCurrency value={getTotalValue(item, viewMode)} />
                  </div>

                  <div className="p-1 flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => openEditDialog(item)}
                      data-testid={`button-edit-${item.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={() => {
                        setItemToDelete(item);
                        setDeleteDialogOpen(true);
                      }}
                      data-testid={`button-delete-${item.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}

            {flatItems.length > 0 && (
              <div className="grid grid-cols-[250px_80px_100px_repeat(12,70px)_90px_40px] bg-muted/30 font-semibold">
                <div className="p-2 pl-4">Grand Total</div>
                <div className="p-2"></div>
                <div className="p-2"></div>
                {MONTHS.map((m) => (
                  <div key={m.key} className="p-2"></div>
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
            <DialogTitle>
              {editItem ? "Edit Cost Item" : parentIdForNew ? "Add Sub-Item" : "Add Cost Item"}
            </DialogTitle>
            <DialogDescription>
              {editItem
                ? "Update the cost item details below."
                : "Enter the details for the new cost item."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Cost item name"
                data-testid="input-cost-item-name"
              />
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
              
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger data-testid="select-cost-item-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aopTotal">AOP Budget</Label>
              <Input
                id="aopTotal"
                type="number"
                value={formData.aopTotal}
                onChange={(e) => setFormData({ ...formData, aopTotal: e.target.value })}
                placeholder="0"
                data-testid="input-cost-item-aop"
              />
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-cost-item"
            >
              {editItem ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Cost Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{itemToDelete?.name}"? This will also delete all child items.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => itemToDelete && deleteMutation.mutate(itemToDelete.id)}
              disabled={deleteMutation.isPending}
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
