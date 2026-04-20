import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Lock, Pencil, X, Save, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { FinancialTypesConfig, FinancialLockdown } from "@shared/schema";
import { DEFAULT_FINANCIAL_TYPES } from "@shared/schema";

interface Props {
  organizationId: number;
}

export function FinancialLockdownsSection({ organizationId }: Props) {
  const { toast } = useToast();

  const { data: typesConfig, isLoading: typesLoading } = useQuery<FinancialTypesConfig>({
    queryKey: ["/api/organizations", organizationId, "financial-types"],
  });
  const { data: lockdowns, isLoading: lockdownsLoading } = useQuery<FinancialLockdown[]>({
    queryKey: ["/api/organizations", organizationId, "financial-lockdowns"],
  });

  // Lockdowns can be set per enabled financial type (AOP, FCST, ACT, and any
  // custom enabled types). Disabled types are intentionally excluded.
  const enabledTypes = useMemo(
    () => (typesConfig?.types ?? DEFAULT_FINANCIAL_TYPES.types).filter(t => t.enabled),
    [typesConfig],
  );

  const grouped = useMemo(() => {
    const map: Record<string, FinancialLockdown[]> = {};
    for (const t of enabledTypes) map[t.key] = [];
    for (const l of lockdowns ?? []) {
      if (!map[l.financialTypeKey]) map[l.financialTypeKey] = [];
      map[l.financialTypeKey].push(l);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.lockdownDate < b.lockdownDate ? 1 : -1));
    }
    return map;
  }, [enabledTypes, lockdowns]);

  // Add form state
  const [addTypeKey, setAddTypeKey] = useState<string>("");
  const [addDate, setAddDate] = useState<string>("");
  const [addNote, setAddNote] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTypeKey, setEditTypeKey] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/organizations", organizationId, "financial-lockdowns"] });
    // Also invalidate any project-scoped lockdown caches so open grids
    // immediately re-render lock indicators.
    queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey)
        && q.queryKey[0] === "/api/projects"
        && q.queryKey[2] === "financial-lockdowns",
    });
  };

  const handleAdd = async () => {
    if (!addTypeKey) { toast({ title: "Pick a financial type", variant: "destructive" }); return; }
    if (!addDate) { toast({ title: "Pick a lockdown date", variant: "destructive" }); return; }
    setIsSaving(true);
    try {
      await apiRequest("POST", `/api/organizations/${organizationId}/financial-lockdowns`, {
        financialTypeKey: addTypeKey,
        lockdownDate: addDate,
        note: addNote.trim() ? addNote.trim() : null,
      });
      setAddTypeKey("");
      setAddDate("");
      setAddNote("");
      refresh();
      toast({ title: "Lockdown added" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add lockdown";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this lockdown? Edits will become possible again for affected periods.")) return;
    try {
      await apiRequest("DELETE", `/api/organizations/${organizationId}/financial-lockdowns/${id}`);
      refresh();
      toast({ title: "Lockdown removed" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete lockdown";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const startEdit = (l: FinancialLockdown) => {
    setEditingId(l.id);
    setEditTypeKey(l.financialTypeKey);
    setEditDate(l.lockdownDate);
    setEditNote(l.note ?? "");
  };
  const cancelEdit = () => { setEditingId(null); setEditTypeKey(""); setEditDate(""); setEditNote(""); };
  const saveEdit = async () => {
    if (!editingId) return;
    if (!editTypeKey) { toast({ title: "Pick a financial type", variant: "destructive" }); return; }
    if (!editDate) { toast({ title: "Pick a lockdown date", variant: "destructive" }); return; }
    try {
      await apiRequest("PUT", `/api/organizations/${organizationId}/financial-lockdowns/${editingId}`, {
        financialTypeKey: editTypeKey,
        lockdownDate: editDate,
        note: editNote.trim() ? editNote.trim() : null,
      });
      cancelEdit();
      refresh();
      toast({ title: "Lockdown updated" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update lockdown";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const labelOf = (key: string) =>
    enabledTypes.find(t => t.key === key)?.label ??
    (typesConfig?.types ?? DEFAULT_FINANCIAL_TYPES.types).find(t => t.key === key)?.label ??
    key.toUpperCase();

  if (typesLoading || lockdownsLoading) {
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
          <Lock className="h-5 w-5 text-primary" />
          Financial Lockdowns
        </CardTitle>
        <CardDescription>
          Freeze financial periods after monthly close. For each financial type, set the most recent
          lockdown date — every cell whose period falls on or before that date becomes read-only for
          that type. Removing a lockdown re-opens those periods immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
          <div className="min-w-[180px]">
            <Label className="text-xs">Financial Type</Label>
            <Select value={addTypeKey} onValueChange={setAddTypeKey}>
              <SelectTrigger className="h-8" data-testid="select-lockdown-type">
                <SelectValue placeholder="Choose type" />
              </SelectTrigger>
              <SelectContent>
                {enabledTypes.map(t => (
                  <SelectItem key={t.key} value={t.key} data-testid={`option-lockdown-type-${t.key}`}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Label className="text-xs">Lockdown Date</Label>
            <Input
              type="date"
              value={addDate}
              onChange={e => setAddDate(e.target.value)}
              className="h-8"
              data-testid="input-lockdown-date"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={addNote}
              onChange={e => setAddNote(e.target.value)}
              placeholder="e.g. Q1 close"
              className="h-8"
              data-testid="input-lockdown-note"
            />
          </div>
          <Button onClick={handleAdd} size="sm" disabled={isSaving} data-testid="button-add-lockdown">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Add
          </Button>
        </div>

        <div className="space-y-4">
          {enabledTypes.length === 0 && (
            <p className="text-sm text-muted-foreground">No enabled financial types. Enable types in the Financials tab first.</p>
          )}
          {enabledTypes.map(t => {
            const list = grouped[t.key] ?? [];
            return (
              <div key={t.key} className="rounded-lg border" data-testid={`lockdown-group-${t.key}`}>
                <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{t.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {list.length === 0 ? "No lockdowns" : `${list.length} lockdown${list.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>
                {list.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    No lockdowns set for {t.label}. Add one above to lock periods through a date.
                  </div>
                ) : (
                  <div className="divide-y">
                    {list.map(l => (
                      <div key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid={`lockdown-row-${l.id}`}>
                        {editingId === l.id ? (
                          <>
                            <Select value={editTypeKey} onValueChange={setEditTypeKey}>
                              <SelectTrigger className="h-8 w-[140px]" data-testid={`select-edit-lockdown-type-${l.id}`}>
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                {enabledTypes.map(t => (
                                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                              <Input
                                type="date"
                                value={editDate}
                                onChange={e => setEditDate(e.target.value)}
                                className="h-8 w-[160px]"
                                data-testid={`input-edit-lockdown-date-${l.id}`}
                              />
                            </div>
                            <Input
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              placeholder="Note"
                              className="h-8 flex-1 min-w-[200px]"
                              data-testid={`input-edit-lockdown-note-${l.id}`}
                            />
                            <Button size="sm" onClick={saveEdit} data-testid={`button-save-lockdown-${l.id}`}>
                              <Save className="h-4 w-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit} data-testid={`button-cancel-lockdown-${l.id}`}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 min-w-[160px]">
                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium tabular-nums">
                                {format(new Date(l.lockdownDate + "T00:00:00"), "MMM d, yyyy")}
                              </span>
                            </div>
                            <div className="flex-1 text-sm text-muted-foreground min-w-[160px]">
                              {l.note || <span className="italic">No note</span>}
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(l)} data-testid={`button-edit-lockdown-${l.id}`} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(l.id)} data-testid={`button-delete-lockdown-${l.id}`} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
