import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import {
  useIntakeCostingChecklist,
  useCreateIntakeCostingChecklistRow,
  useUpdateIntakeCostingChecklistRow,
  useDeleteIntakeCostingChecklistRow,
} from "@/hooks/use-intake-costing-checklist";
import {
  COSTING_CHECKLIST_CATEGORIES,
  FTE_PERMANENT_RATE_PER_DAY,
  FTE_CONSULTANT_RATE_PER_DAY,
} from "@shared/intakeCostingDefaults";
import type { IntakeCostingChecklistRow } from "@shared/schema";

interface Props {
  intakeId: number;
  readOnly?: boolean;
}

interface RowDraft {
  category: string;
  question: string;
  resourceName: string;
  costType: "" | "opex" | "capex";
  ftePermanentDays: string;
  fteConsultantDays: string;
  projectCost: string;
  comments: string;
}

const EMPTY_DRAFT: RowDraft = {
  category: COSTING_CHECKLIST_CATEGORIES[0],
  question: "",
  resourceName: "",
  costType: "",
  ftePermanentDays: "",
  fteConsultantDays: "",
  projectCost: "",
  comments: "",
};

const numOrNull = (v: string): number | null => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const numOrZero = (v: string | number | null | undefined): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const draftFromRow = (row: IntakeCostingChecklistRow): RowDraft => ({
  category: row.category,
  question: row.question,
  resourceName: row.resourceName ?? "",
  costType: (row.costType === "opex" || row.costType === "capex") ? row.costType : "",
  ftePermanentDays: row.ftePermanentDays != null ? String(row.ftePermanentDays) : "",
  fteConsultantDays: row.fteConsultantDays != null ? String(row.fteConsultantDays) : "",
  projectCost: row.projectCost != null ? String(row.projectCost) : "",
  comments: row.comments ?? "",
});

const draftToPayload = (d: RowDraft) => ({
  category: d.category,
  question: d.question.trim(),
  resourceName: d.resourceName.trim() || null,
  costType: d.costType === "" ? null : d.costType,
  ftePermanentDays: numOrNull(d.ftePermanentDays),
  fteConsultantDays: numOrNull(d.fteConsultantDays),
  projectCost: numOrNull(d.projectCost),
  comments: d.comments.trim() || null,
});

export function IntakeCostingChecklistSection({ intakeId, readOnly = false }: Props) {
  const { toast } = useToast();
  const { data: rows, isLoading } = useIntakeCostingChecklist(intakeId);
  const createMut = useCreateIntakeCostingChecklistRow(intakeId);
  const updateMut = useUpdateIntakeCostingChecklistRow(intakeId);
  const deleteMut = useDeleteIntakeCostingChecklistRow(intakeId);

  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<RowDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<RowDraft>(EMPTY_DRAFT);

  const startEdit = (row: IntakeCostingChecklistRow) => {
    setEditingId(row.id);
    setEditValues(draftFromRow(row));
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = (id: number) => {
    if (!editValues.question.trim()) {
      toast({ title: "Question is required", variant: "destructive" });
      return;
    }
    if (!editValues.category.trim()) {
      toast({ title: "Category is required", variant: "destructive" });
      return;
    }
    updateMut.mutate(
      { id, ...draftToPayload(editValues) },
      {
        onSuccess: () => setEditingId(null),
        onError: (err: any) =>
          toast({ title: "Failed to save", description: err?.message ?? String(err), variant: "destructive" }),
      },
    );
  };

  const handleCreate = () => {
    if (!newRow.question.trim()) {
      toast({ title: "Question is required", variant: "destructive" });
      return;
    }
    if (!newRow.category.trim()) {
      toast({ title: "Category is required", variant: "destructive" });
      return;
    }
    const nextPosition = (rows ?? []).reduce((max, r) => Math.max(max, r.position ?? 0), -1) + 1;
    createMut.mutate(
      { ...draftToPayload(newRow), position: nextPosition },
      {
        onSuccess: () => {
          setAdding(false);
          setNewRow(EMPTY_DRAFT);
        },
        onError: (err: any) =>
          toast({ title: "Failed to add", description: err?.message ?? String(err), variant: "destructive" }),
      },
    );
  };

  const renderCategoryCell = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 min-w-[180px]">
        <SelectValue placeholder="Select category…" />
      </SelectTrigger>
      <SelectContent>
        {COSTING_CHECKLIST_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>{c}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderCostTypeCell = (value: "" | "opex" | "capex", onChange: (v: "" | "opex" | "capex") => void) => (
    <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : (v as "opex" | "capex"))}>
      <SelectTrigger className="h-8 w-28">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">—</SelectItem>
        <SelectItem value="opex">OPEX</SelectItem>
        <SelectItem value="capex">CAPEX</SelectItem>
      </SelectContent>
    </Select>
  );

  const renderRowCells = (
    draft: RowDraft,
    set: (d: RowDraft) => void,
  ) => (
    <>
      <td className="px-2 py-2">{renderCategoryCell(draft.category, (v) => set({ ...draft, category: v }))}</td>
      <td className="px-2 py-2">
        <Input
          value={draft.question}
          onChange={(e) => set({ ...draft, question: e.target.value })}
          className="h-8 min-w-[220px]"
          placeholder="Question…"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          value={draft.resourceName}
          onChange={(e) => set({ ...draft, resourceName: e.target.value })}
          className="h-8 min-w-[140px]"
          placeholder="Resource…"
        />
      </td>
      <td className="px-2 py-2">{renderCostTypeCell(draft.costType, (v) => set({ ...draft, costType: v }))}</td>
      <td className="px-2 py-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          value={draft.ftePermanentDays}
          onChange={(e) => set({ ...draft, ftePermanentDays: e.target.value })}
          className="h-8 w-24 text-right"
          placeholder="days"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          value={draft.fteConsultantDays}
          onChange={(e) => set({ ...draft, fteConsultantDays: e.target.value })}
          className="h-8 w-24 text-right"
          placeholder="days"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={draft.projectCost}
          onChange={(e) => set({ ...draft, projectCost: e.target.value })}
          className="h-8 w-28 text-right"
          placeholder="0.00"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          value={draft.comments}
          onChange={(e) => set({ ...draft, comments: e.target.value })}
          className="h-8 min-w-[160px]"
          placeholder="Comments…"
        />
      </td>
    </>
  );

  const totals = (rows ?? []).reduce(
    (acc, r) => {
      const perm = numOrZero(r.ftePermanentDays) * FTE_PERMANENT_RATE_PER_DAY;
      const cons = numOrZero(r.fteConsultantDays) * FTE_CONSULTANT_RATE_PER_DAY;
      const proj = numOrZero(r.projectCost);
      acc.permanent += perm;
      acc.consultant += cons;
      acc.project += proj;
      acc.total += perm + cons + proj;
      return acc;
    },
    { permanent: 0, consultant: 0, project: 0, total: 0 },
  );

  return (
    <Card data-testid="card-intake-costing-checklist">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Costing Checklist</CardTitle>
          <CardDescription>
            Itemize the effort and external costs needed to deliver this intake. FTE columns multiply days by the
            standard daily rates ({formatCurrency(FTE_PERMANENT_RATE_PER_DAY)} permanent, {formatCurrency(FTE_CONSULTANT_RATE_PER_DAY)} consultant).
          </CardDescription>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdding((v) => !v)}
            data-testid="button-new-costing-checklist"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Costing Checklist Item
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-intake-costing-checklist">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left px-2 py-2 font-medium">Cost Question Category</th>
                <th className="text-left px-2 py-2 font-medium">Question</th>
                <th className="text-left px-2 py-2 font-medium">Resource Name</th>
                <th className="text-left px-2 py-2 font-medium">OPEX/CAPEX</th>
                <th className="text-right px-2 py-2 font-medium">FTE Permanent Rate × {FTE_PERMANENT_RATE_PER_DAY} $/day</th>
                <th className="text-right px-2 py-2 font-medium">FTE Consultant Rate × {FTE_CONSULTANT_RATE_PER_DAY} $/day</th>
                <th className="text-right px-2 py-2 font-medium">Project/VT Cost</th>
                <th className="text-left px-2 py-2 font-medium">Comments</th>
                <th className="px-2 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && (rows ?? []).length === 0 && !adding && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No costing items yet.{!readOnly && ` Click "New Costing Checklist Item" to add one.`}
                  </td>
                </tr>
              )}
              {(rows ?? []).map((row) => {
                const isEditing = editingId === row.id;
                const permCost = numOrZero(row.ftePermanentDays) * FTE_PERMANENT_RATE_PER_DAY;
                const consCost = numOrZero(row.fteConsultantDays) * FTE_CONSULTANT_RATE_PER_DAY;
                const projCost = numOrZero(row.projectCost);
                return (
                  <tr key={row.id} className="border-b hover:bg-muted/30" data-testid={`row-costing-${row.id}`}>
                    {isEditing ? (
                      renderRowCells(editValues, setEditValues)
                    ) : (
                      <>
                        <td className="px-2 py-2 font-medium">{row.category}</td>
                        <td className="px-2 py-2">{row.question}</td>
                        <td className="px-2 py-2">{row.resourceName || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-2 py-2">
                          {row.costType ? row.costType.toUpperCase() : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(permCost)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(consCost)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(projCost)}</td>
                        <td className="px-2 py-2 text-muted-foreground">{row.comments || ""}</td>
                      </>
                    )}
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5">
                        {!readOnly && isEditing && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(row.id)} data-testid={`button-save-costing-${row.id}`}>
                              {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} data-testid={`button-cancel-costing-${row.id}`}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {!readOnly && !isEditing && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(row)} data-testid={`button-edit-costing-${row.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(row.id)} data-testid={`button-delete-costing-${row.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {adding && !readOnly && (
                <tr className="border-b bg-muted/20" data-testid="row-new-costing">
                  {renderRowCells(newRow, setNewRow)}
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreate} disabled={createMut.isPending} data-testid="button-save-new-costing">
                        {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setAdding(false); setNewRow(EMPTY_DRAFT); }} data-testid="button-cancel-new-costing">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
            {(rows ?? []).length > 0 && (
              <tfoot>
                <tr className="border-t font-medium bg-muted/20" data-testid="row-costing-totals">
                  <td className="px-2 py-2" colSpan={4}>Totals</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(totals.permanent)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(totals.consultant)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(totals.project)}</td>
                  <td className="px-2 py-2 text-right tabular-nums" colSpan={2}>
                    Grand total: {formatCurrency(totals.total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
