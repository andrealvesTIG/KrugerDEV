import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Plus, Trash2, ArrowUp, ArrowDown, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CostItemCategoriesConfig, FinancialView, CostCategory, CostSpecification } from "@shared/schema";
import {
  DEFAULT_COST_ITEM_CATEGORIES,
  SYSTEM_FINANCIAL_VIEW_KEYS,
  SYSTEM_COST_CATEGORY_KEYS,
} from "@shared/schema";

const SYS_VIEW_KEYS = new Set<string>(SYSTEM_FINANCIAL_VIEW_KEYS as readonly string[]);
const SYS_CAT_KEYS = new Set<string>(SYSTEM_COST_CATEGORY_KEYS as readonly string[]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function CostItemCategoriesSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [views, setViews] = useState<FinancialView[]>(DEFAULT_COST_ITEM_CATEGORIES.views);
  const [categories, setCategories] = useState<CostCategory[]>(DEFAULT_COST_ITEM_CATEGORIES.categories);
  const [specifications, setSpecifications] = useState<CostSpecification[]>(DEFAULT_COST_ITEM_CATEGORIES.specifications);
  const [isSaving, setIsSaving] = useState(false);
  const [newViewLabel, setNewViewLabel] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatViewKey, setNewCatViewKey] = useState("");
  const [newSpecLabel, setNewSpecLabel] = useState("");
  const [newSpecCategoryKey, setNewSpecCategoryKey] = useState("");

  const { data, isLoading } = useQuery<CostItemCategoriesConfig>({
    queryKey: ['/api/organizations', organizationId, 'cost-item-categories'],
  });

  useEffect(() => {
    if (data?.views?.length) {
      setViews([...data.views].sort((a, b) => a.order - b.order));
      setCategories([...data.categories].sort((a, b) => a.order - b.order));
      setSpecifications([...data.specifications].sort((a, b) => a.order - b.order));
    }
  }, [data]);

  // ---- Views ----
  const updateView = (idx: number, patch: Partial<FinancialView>) => {
    setViews(prev => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };
  const moveView = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= views.length) return;
    const next = views.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    setViews(next.map((v, i) => ({ ...v, order: i })));
  };
  const removeView = (idx: number) => {
    const v = views[idx];
    if (SYS_VIEW_KEYS.has(v.key)) {
      toast({ title: "System views cannot be deleted", description: "Disable it instead.", variant: "destructive" });
      return;
    }
    if (categories.some(c => c.viewKey === v.key)) {
      toast({ title: "Move or delete its categories first", description: `View "${v.label}" still has cost categories.`, variant: "destructive" });
      return;
    }
    setViews(prev => prev.filter((_, i) => i !== idx).map((x, i) => ({ ...x, order: i })));
  };
  const addView = () => {
    const label = newViewLabel.trim();
    if (!label) { toast({ title: "Enter a label first", variant: "destructive" }); return; }
    const slug = slugify(label);
    if (!slug) { toast({ title: "Label needs at least one letter or digit", variant: "destructive" }); return; }
    const key = uniqueKey(slug, new Set(views.map(v => v.key)));
    setViews(prev => [...prev, { key, label, enabled: true, order: prev.length, isSystem: false }]);
    setNewViewLabel("");
  };

  // ---- Categories ----
  const updateCategory = (idx: number, patch: Partial<CostCategory>) => {
    setCategories(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const moveCategory = (idx: number, dir: -1 | 1) => {
    // Reorder only within the same parent view.
    const cur = categories[idx];
    const siblings = categories
      .map((c, i) => ({ c, i }))
      .filter(x => x.c.viewKey === cur.viewKey);
    const pos = siblings.findIndex(x => x.i === idx);
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= siblings.length) return;
    const swapWith = siblings[targetPos].i;
    const next = categories.slice();
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    // Re-stamp order within each viewKey group.
    const grouped = new Map<string, CostCategory[]>();
    for (const c of next) {
      const arr = grouped.get(c.viewKey) ?? [];
      arr.push(c);
      grouped.set(c.viewKey, arr);
    }
    const reordered: CostCategory[] = [];
    for (const c of next) {
      const arr = grouped.get(c.viewKey)!;
      const order = arr.indexOf(c);
      reordered.push({ ...c, order });
    }
    setCategories(reordered);
  };
  const removeCategory = (idx: number) => {
    const c = categories[idx];
    if (SYS_CAT_KEYS.has(c.key)) {
      toast({ title: "System categories cannot be deleted", description: "Disable it instead.", variant: "destructive" });
      return;
    }
    if (specifications.some(s => s.categoryKey === c.key)) {
      toast({ title: "Move or delete its specifications first", description: `Category "${c.label}" still has cost specifications.`, variant: "destructive" });
      return;
    }
    setCategories(prev => prev.filter((_, i) => i !== idx));
  };
  const addCategory = () => {
    const label = newCatLabel.trim();
    const viewKey = newCatViewKey;
    if (!label) { toast({ title: "Enter a category label first", variant: "destructive" }); return; }
    if (!viewKey) { toast({ title: "Pick a parent Financial View", variant: "destructive" }); return; }
    const slug = slugify(label);
    if (!slug) { toast({ title: "Label needs at least one letter or digit", variant: "destructive" }); return; }
    const key = uniqueKey(`cat-${slug}`, new Set(categories.map(c => c.key)));
    const orderInView = categories.filter(c => c.viewKey === viewKey).length;
    setCategories(prev => [...prev, { key, label, viewKey, enabled: true, order: orderInView, isSystem: false }]);
    setNewCatLabel("");
  };

  // ---- Specifications ----
  const updateSpec = (idx: number, patch: Partial<CostSpecification>) => {
    setSpecifications(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const moveSpec = (idx: number, dir: -1 | 1) => {
    const cur = specifications[idx];
    const siblings = specifications.map((s, i) => ({ s, i })).filter(x => x.s.categoryKey === cur.categoryKey);
    const pos = siblings.findIndex(x => x.i === idx);
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= siblings.length) return;
    const swapWith = siblings[targetPos].i;
    const next = specifications.slice();
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    const grouped = new Map<string, CostSpecification[]>();
    for (const s of next) {
      const arr = grouped.get(s.categoryKey) ?? [];
      arr.push(s);
      grouped.set(s.categoryKey, arr);
    }
    const reordered: CostSpecification[] = [];
    for (const s of next) {
      const arr = grouped.get(s.categoryKey)!;
      reordered.push({ ...s, order: arr.indexOf(s) });
    }
    setSpecifications(reordered);
  };
  const removeSpec = (idx: number) => {
    setSpecifications(prev => prev.filter((_, i) => i !== idx));
  };
  const addSpec = () => {
    const label = newSpecLabel.trim();
    const categoryKey = newSpecCategoryKey;
    if (!label) { toast({ title: "Enter a specification label first", variant: "destructive" }); return; }
    if (!categoryKey) { toast({ title: "Pick a parent Cost Category", variant: "destructive" }); return; }
    const slug = slugify(label);
    if (!slug) { toast({ title: "Label needs at least one letter or digit", variant: "destructive" }); return; }
    const key = uniqueKey(`spec-${slug}`, new Set(specifications.map(s => s.key)));
    const orderInCat = specifications.filter(s => s.categoryKey === categoryKey).length;
    setSpecifications(prev => [...prev, { key, label, categoryKey, enabled: true, order: orderInCat, isSystem: false }]);
    setNewSpecLabel("");
  };

  const handleSave = async () => {
    // Light client-side checks; server re-validates.
    for (const v of views) {
      if (!v.label.trim()) { toast({ title: `View "${v.key}" needs a label`, variant: "destructive" }); return; }
    }
    for (const c of categories) {
      if (!c.label.trim()) { toast({ title: `Category "${c.key}" needs a label`, variant: "destructive" }); return; }
    }
    for (const s of specifications) {
      if (!s.label.trim()) { toast({ title: `Specification "${s.key}" needs a label`, variant: "destructive" }); return; }
    }
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/organizations/${organizationId}/cost-item-categories`, {
        views, categories, specifications,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'cost-item-categories'] });
      toast({ title: "Saved", description: "Cost item categories updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sortedViews = [...views].sort((a, b) => a.order - b.order);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          Cost Item Categories
        </CardTitle>
        <CardDescription>
          Configure the three-level hierarchy used in the project Financials grid:
          Financial View → Cost Category → Cost Specification. Built-in entries can
          be renamed and disabled but never deleted, so historical financial
          entries keep displaying. Disabled or removed entries no longer show as
          options when adding new cost items.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ---------------- Financial Views ---------------- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Financial Views</h3>
            <Badge variant="outline" className="text-[10px]">Top level</Badge>
          </div>
          <div className="space-y-2">
            {sortedViews.map((v, sortedIdx) => {
              const idx = views.indexOf(v);
              return (
                <div
                  key={v.key}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                  data-testid={`view-row-${v.key}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={sortedIdx === 0}
                      onClick={() => moveView(idx, -1)} data-testid={`button-view-up-${v.key}`} title="Move up">
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" disabled={sortedIdx === sortedViews.length - 1}
                      onClick={() => moveView(idx, 1)} data-testid={`button-view-down-${v.key}`} title="Move down">
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <Label className="text-xs text-muted-foreground">Label</Label>
                    <Input
                      value={v.label}
                      onChange={(e) => updateView(idx, { label: e.target.value })}
                      data-testid={`input-view-label-${v.key}`}
                      className="h-8"
                    />
                  </div>
                  <div className="min-w-[140px]">
                    <Label className="text-xs text-muted-foreground">Key</Label>
                    <div className="h-8 flex items-center">
                      <code className="text-xs px-2 py-1 bg-muted rounded font-mono">{v.key}</code>
                      {SYS_VIEW_KEYS.has(v.key) && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">System</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`view-enabled-${v.key}`} className="text-xs">Enabled</Label>
                    <Switch
                      id={`view-enabled-${v.key}`}
                      checked={v.enabled}
                      onCheckedChange={(checked) => updateView(idx, { enabled: checked })}
                      data-testid={`switch-view-enabled-${v.key}`}
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                    disabled={SYS_VIEW_KEYS.has(v.key)}
                    onClick={() => removeView(idx)}
                    data-testid={`button-view-delete-${v.key}`}
                    title={SYS_VIEW_KEYS.has(v.key) ? "System views can't be deleted" : "Delete view"}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="flex items-end gap-2 rounded-lg border border-dashed p-3">
            <div className="flex-1">
              <Label htmlFor="new-view-label" className="text-xs">New Financial View label</Label>
              <Input id="new-view-label" placeholder="e.g. R&D" value={newViewLabel}
                onChange={(e) => setNewViewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addView(); } }}
                data-testid="input-new-view-label" className="h-8" />
            </div>
            <Button onClick={addView} variant="outline" size="sm" data-testid="button-add-view">
              <Plus className="h-4 w-4 mr-1" /> Add View
            </Button>
          </div>
        </section>

        {/* ---------------- Cost Categories ---------------- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Cost Categories</h3>
            <Badge variant="outline" className="text-[10px]">Grouped by view</Badge>
          </div>
          <div className="space-y-4">
            {sortedViews.map(v => {
              const inView = categories
                .map((c, i) => ({ c, i }))
                .filter(x => x.c.viewKey === v.key)
                .sort((a, b) => a.c.order - b.c.order);
              return (
                <div key={v.key} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {v.label} {!v.enabled && <span className="ml-1 italic">(disabled)</span>}
                  </div>
                  {inView.length === 0 && (
                    <p className="text-xs text-muted-foreground italic pl-3">No categories yet.</p>
                  )}
                  {inView.map(({ c, i: idx }, sortedIdx) => (
                    <div key={c.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                      data-testid={`category-row-${c.key}`}>
                      <div className="flex flex-col gap-0.5">
                        <Button variant="ghost" size="icon" className="h-5 w-5" disabled={sortedIdx === 0}
                          onClick={() => moveCategory(idx, -1)} title="Move up">
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5" disabled={sortedIdx === inView.length - 1}
                          onClick={() => moveCategory(idx, 1)} title="Move down">
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="min-w-[180px] flex-1">
                        <Label className="text-xs text-muted-foreground">Label</Label>
                        <Input value={c.label}
                          onChange={(e) => updateCategory(idx, { label: e.target.value })}
                          data-testid={`input-category-label-${c.key}`} className="h-8" />
                      </div>
                      <div className="min-w-[140px]">
                        <Label className="text-xs text-muted-foreground">Parent View</Label>
                        <Select value={c.viewKey}
                          onValueChange={(val) => updateCategory(idx, { viewKey: val })}>
                          <SelectTrigger className="h-8" data-testid={`select-category-view-${c.key}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sortedViews.map(pv => (
                              <SelectItem key={pv.key} value={pv.key}>{pv.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-[140px]">
                        <Label className="text-xs text-muted-foreground">Key</Label>
                        <div className="h-8 flex items-center">
                          <code className="text-xs px-2 py-1 bg-muted rounded font-mono">{c.key}</code>
                          {SYS_CAT_KEYS.has(c.key) && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">System</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`cat-enabled-${c.key}`} className="text-xs">Enabled</Label>
                        <Switch id={`cat-enabled-${c.key}`} checked={c.enabled}
                          onCheckedChange={(checked) => updateCategory(idx, { enabled: checked })}
                          data-testid={`switch-category-enabled-${c.key}`} />
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        disabled={SYS_CAT_KEYS.has(c.key)}
                        onClick={() => removeCategory(idx)}
                        data-testid={`button-category-delete-${c.key}`}
                        title={SYS_CAT_KEYS.has(c.key) ? "System categories can't be deleted" : "Delete category"}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="new-cat-label" className="text-xs">New Cost Category label</Label>
              <Input id="new-cat-label" placeholder="e.g. Cloud Services" value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
                data-testid="input-new-category-label" className="h-8" />
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs">Parent Financial View</Label>
              <Select value={newCatViewKey} onValueChange={setNewCatViewKey}>
                <SelectTrigger className="h-8" data-testid="select-new-category-view">
                  <SelectValue placeholder="Select view" />
                </SelectTrigger>
                <SelectContent>
                  {sortedViews.map(v => <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addCategory} variant="outline" size="sm" data-testid="button-add-category">
              <Plus className="h-4 w-4 mr-1" /> Add Category
            </Button>
          </div>
        </section>

        {/* ---------------- Cost Specifications ---------------- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Cost Specifications</h3>
            <Badge variant="outline" className="text-[10px]">Grouped by category</Badge>
          </div>
          <div className="space-y-4">
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Add a cost category before creating specifications.</p>
            )}
            {[...categories].sort((a, b) => a.order - b.order).map(c => {
              const inCat = specifications
                .map((s, i) => ({ s, i }))
                .filter(x => x.s.categoryKey === c.key)
                .sort((a, b) => a.s.order - b.s.order);
              if (inCat.length === 0) return null;
              const parentView = views.find(v => v.key === c.viewKey);
              return (
                <div key={c.key} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {parentView?.label ?? c.viewKey} › {c.label}
                  </div>
                  {inCat.map(({ s, i: idx }, sortedIdx) => (
                    <div key={s.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                      data-testid={`spec-row-${s.key}`}>
                      <div className="flex flex-col gap-0.5">
                        <Button variant="ghost" size="icon" className="h-5 w-5" disabled={sortedIdx === 0}
                          onClick={() => moveSpec(idx, -1)} title="Move up">
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5" disabled={sortedIdx === inCat.length - 1}
                          onClick={() => moveSpec(idx, 1)} title="Move down">
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="min-w-[180px] flex-1">
                        <Label className="text-xs text-muted-foreground">Label</Label>
                        <Input value={s.label}
                          onChange={(e) => updateSpec(idx, { label: e.target.value })}
                          data-testid={`input-spec-label-${s.key}`} className="h-8" />
                      </div>
                      <div className="min-w-[160px]">
                        <Label className="text-xs text-muted-foreground">Parent Category</Label>
                        <Select value={s.categoryKey}
                          onValueChange={(val) => updateSpec(idx, { categoryKey: val })}>
                          <SelectTrigger className="h-8" data-testid={`select-spec-category-${s.key}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[...categories].sort((a, b) => a.order - b.order).map(pc => (
                              <SelectItem key={pc.key} value={pc.key}>{pc.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="min-w-[140px]">
                        <Label className="text-xs text-muted-foreground">Key</Label>
                        <div className="h-8 flex items-center">
                          <code className="text-xs px-2 py-1 bg-muted rounded font-mono">{s.key}</code>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`spec-enabled-${s.key}`} className="text-xs">Enabled</Label>
                        <Switch id={`spec-enabled-${s.key}`} checked={s.enabled}
                          onCheckedChange={(checked) => updateSpec(idx, { enabled: checked })}
                          data-testid={`switch-spec-enabled-${s.key}`} />
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => removeSpec(idx)}
                        data-testid={`button-spec-delete-${s.key}`} title="Delete specification">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="new-spec-label" className="text-xs">New Cost Specification label</Label>
              <Input id="new-spec-label" placeholder="e.g. Production Cluster" value={newSpecLabel}
                onChange={(e) => setNewSpecLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSpec(); } }}
                data-testid="input-new-spec-label" className="h-8" />
            </div>
            <div className="min-w-[180px]">
              <Label className="text-xs">Parent Cost Category</Label>
              <Select value={newSpecCategoryKey} onValueChange={setNewSpecCategoryKey}>
                <SelectTrigger className="h-8" data-testid="select-new-spec-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {[...categories].sort((a, b) => a.order - b.order).map(c => {
                    const pv = views.find(v => v.key === c.viewKey);
                    return <SelectItem key={c.key} value={c.key}>{pv?.label ?? c.viewKey} › {c.label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addSpec} variant="outline" size="sm" data-testid="button-add-spec">
              <Plus className="h-4 w-4 mr-1" /> Add Specification
            </Button>
          </div>
        </section>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Disabled or deleted entries stop appearing as options when adding new cost items.
            Existing financial entries that reference them still display.
          </p>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-cost-item-categories">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
