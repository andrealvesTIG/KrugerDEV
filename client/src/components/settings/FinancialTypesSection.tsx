import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Plus, Trash2, ArrowUp, ArrowDown, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { FinancialTypesConfig, FinancialType } from "@shared/schema";
import { SYSTEM_FINANCIAL_TYPE_KEYS, DEFAULT_FINANCIAL_TYPES } from "@shared/schema";

const SYSTEM_KEYS = new Set<string>(SYSTEM_FINANCIAL_TYPE_KEYS as readonly string[]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function FinancialTypesSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [types, setTypes] = useState<FinancialType[]>(DEFAULT_FINANCIAL_TYPES.types);
  const [isSaving, setIsSaving] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const { data, isLoading } = useQuery<FinancialTypesConfig>({
    queryKey: ['/api/organizations', organizationId, 'financial-types'],
  });

  useEffect(() => {
    if (data?.types && data.types.length > 0) {
      setTypes(data.types);
    }
  }, [data]);

  const updateType = (idx: number, patch: Partial<FinancialType>) => {
    setTypes(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= types.length) return;
    const next = types.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    setTypes(next);
  };

  const removeType = (idx: number) => {
    const s = types[idx];
    if (SYSTEM_KEYS.has(s.key)) {
      toast({ title: "System types cannot be deleted", description: "Disable it instead by toggling Enabled off.", variant: "destructive" });
      return;
    }
    setTypes(prev => prev.filter((_, i) => i !== idx));
  };

  const addType = () => {
    const label = newLabel.trim();
    if (!label) {
      toast({ title: "Enter a label first", variant: "destructive" });
      return;
    }
    let key = slugify(label);
    if (!key) {
      toast({ title: "Label must contain at least one letter or digit", variant: "destructive" });
      return;
    }
    const existing = new Set(types.map(s => s.key));
    if (existing.has(key)) {
      let i = 2;
      while (existing.has(`${key}-${i}`)) i++;
      key = `${key}-${i}`;
    }
    setTypes(prev => [...prev, { key, label, enabled: true, editable: true, isSystem: false }]);
    setNewLabel("");
  };

  const handleSave = async () => {
    if (!types.some(s => s.enabled)) {
      toast({ title: "At least one type must be enabled", variant: "destructive" });
      return;
    }
    for (const sysKey of SYSTEM_KEYS) {
      if (!types.find(s => s.key === sysKey)) {
        toast({ title: `System type "${sysKey}" is missing`, description: "Reload the page to restore defaults.", variant: "destructive" });
        return;
      }
    }
    for (const s of types) {
      if (!s.label.trim()) {
        toast({ title: `Type "${s.key}" needs a label`, variant: "destructive" });
        return;
      }
    }

    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/organizations/${organizationId}/financial-types`, { types });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'financial-types'] });
      toast({ title: "Saved", description: "Financial types updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save types", variant: "destructive" });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Financial Type
        </CardTitle>
        <CardDescription>
          Configure the financial types shown in the project Financials grid (e.g. AOP, FCST, ACT).
          Rename labels, change order, enable/disable types, or add custom ones. The three
          system types can be renamed and disabled but never deleted, so historical entries
          stay valid.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {types.map((s, idx) => (
            <div
              key={s.key}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              data-testid={`type-row-${s.key}`}
            >
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  data-testid={`button-move-up-${s.key}`}
                  title="Move up"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={idx === types.length - 1}
                  onClick={() => move(idx, 1)}
                  data-testid={`button-move-down-${s.key}`}
                  title="Move down"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              <div className="min-w-[180px] flex-1">
                <Label className="text-xs text-muted-foreground">Label</Label>
                <Input
                  value={s.label}
                  onChange={(e) => updateType(idx, { label: e.target.value })}
                  data-testid={`input-label-${s.key}`}
                  className="h-8"
                />
              </div>

              <div className="min-w-[140px]">
                <Label className="text-xs text-muted-foreground">Key</Label>
                <div className="h-8 flex items-center">
                  <code className="text-xs px-2 py-1 bg-muted rounded font-mono">{s.key}</code>
                  {SYSTEM_KEYS.has(s.key) && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">System</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor={`enabled-${s.key}`} className="text-xs">Enabled</Label>
                <Switch
                  id={`enabled-${s.key}`}
                  checked={s.enabled}
                  onCheckedChange={(checked) => updateType(idx, { enabled: checked })}
                  data-testid={`switch-enabled-${s.key}`}
                />
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor={`editable-${s.key}`} className="text-xs">Editable</Label>
                <Switch
                  id={`editable-${s.key}`}
                  checked={s.editable}
                  onCheckedChange={(checked) => updateType(idx, { editable: checked })}
                  data-testid={`switch-editable-${s.key}`}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                disabled={SYSTEM_KEYS.has(s.key)}
                onClick={() => removeType(idx)}
                data-testid={`button-delete-${s.key}`}
                title={SYSTEM_KEYS.has(s.key) ? "System types can't be deleted" : "Delete type"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 rounded-lg border border-dashed p-3">
          <div className="flex-1">
            <Label htmlFor="new-type-label" className="text-xs">New financial type label</Label>
            <Input
              id="new-type-label"
              placeholder="e.g. Reforecast Q2"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addType(); } }}
              data-testid="input-new-type-label"
              className="h-8"
            />
          </div>
          <Button onClick={addType} variant="outline" size="sm" data-testid="button-add-type">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Adding a type backfills empty cells across every existing project so the grid is ready to edit.
            Disabling a type hides it from the grid without deleting any data.
          </p>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-types">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
