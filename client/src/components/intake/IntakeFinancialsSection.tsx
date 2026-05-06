import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import {
  useIntakeFinancials,
  useCreateIntakeFinancial,
  useUpdateIntakeFinancial,
  useDeleteIntakeFinancial,
} from "@/hooks/use-intake-financials";
import type { IntakeFinancial } from "@shared/schema";

interface Props {
  intakeId: number;
  readOnly?: boolean;
}

export function IntakeFinancialsSection({ intakeId, readOnly = false }: Props) {
  const { toast } = useToast();
  const { data: rows, isLoading } = useIntakeFinancials(intakeId);
  const createMut = useCreateIntakeFinancial(intakeId);
  const updateMut = useUpdateIntakeFinancial(intakeId);
  const deleteMut = useDeleteIntakeFinancial(intakeId);

  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ fiscalYear: new Date().getFullYear(), capexAmount: 0, opexAmount: 0 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ fiscalYear: number; capexAmount: number; opexAmount: number }>({
    fiscalYear: 0,
    capexAmount: 0,
    opexAmount: 0,
  });

  const total = useMemo(() => {
    return (rows ?? []).reduce(
      (acc, r) => {
        acc.capex += Number(r.capexAmount);
        acc.opex += Number(r.opexAmount);
        return acc;
      },
      { capex: 0, opex: 0 },
    );
  }, [rows]);

  const startEdit = (row: IntakeFinancial) => {
    setEditingId(row.id);
    setEditValues({
      fiscalYear: row.fiscalYear,
      capexAmount: Number(row.capexAmount),
      opexAmount: Number(row.opexAmount),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (id: number) => {
    if (!editValues.fiscalYear || editValues.fiscalYear < 1900) {
      toast({ title: "Invalid year", description: "Enter a valid fiscal year.", variant: "destructive" });
      return;
    }
    if ((rows ?? []).some(r => r.id !== id && r.fiscalYear === editValues.fiscalYear)) {
      toast({ title: "Duplicate year", description: `An estimate for fiscal year ${editValues.fiscalYear} already exists.`, variant: "destructive" });
      return;
    }
    updateMut.mutate(
      {
        id,
        fiscalYear: editValues.fiscalYear,
        capexAmount: editValues.capexAmount,
        opexAmount: editValues.opexAmount,
      },
      {
        onSuccess: () => setEditingId(null),
        onError: (err: any) => toast({ title: "Failed to save", description: err?.message ?? String(err), variant: "destructive" }),
      },
    );
  };

  const handleCreate = () => {
    if (!newRow.fiscalYear || newRow.fiscalYear < 1900) {
      toast({ title: "Invalid year", description: "Enter a valid fiscal year.", variant: "destructive" });
      return;
    }
    if ((rows ?? []).some(r => r.fiscalYear === newRow.fiscalYear)) {
      toast({ title: "Duplicate year", description: `An estimate for fiscal year ${newRow.fiscalYear} already exists.`, variant: "destructive" });
      return;
    }
    createMut.mutate(
      {
        fiscalYear: newRow.fiscalYear,
        capexAmount: newRow.capexAmount,
        opexAmount: newRow.opexAmount,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setNewRow({ fiscalYear: new Date().getFullYear(), capexAmount: 0, opexAmount: 0 });
        },
        onError: (err: any) => toast({ title: "Failed to add", description: err?.message ?? String(err), variant: "destructive" }),
      },
    );
  };

  return (
    <Card data-testid="card-intake-financials">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Intake Estimates</CardTitle>
          <CardDescription>Financial estimates (CapEx and OpEx) for this intake, broken down by fiscal year.</CardDescription>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdding((v) => !v)}
            data-testid="button-new-intake-financial"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Intake Financial
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-intake-financials">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Year</th>
                <th className="text-right px-3 py-2 font-medium">Intake Capex</th>
                <th className="text-right px-3 py-2 font-medium">Intake Opex</th>
                <th className="text-right px-3 py-2 font-medium">Intake Total</th>
                <th className="px-2 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && (rows ?? []).length === 0 && !adding && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No financial estimates yet.{!readOnly && ' Click "New Intake Financial" to add one.'}
                  </td>
                </tr>
              )}
              {(rows ?? []).map((row) => {
                const isEditing = editingId === row.id;
                const capex = isEditing ? editValues.capexAmount : Number(row.capexAmount);
                const opex = isEditing ? editValues.opexAmount : Number(row.opexAmount);
                return (
                  <tr key={row.id} className="border-b hover:bg-muted/30" data-testid={`row-intake-financial-${row.id}`}>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editValues.fiscalYear}
                          onChange={(e) => setEditValues({ ...editValues, fiscalYear: Number(e.target.value) })}
                          className="h-8 w-24"
                          data-testid={`input-edit-year-${row.id}`}
                        />
                      ) : (
                        row.fiscalYear
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editValues.capexAmount}
                          onChange={(e) => setEditValues({ ...editValues, capexAmount: Number(e.target.value) })}
                          className="h-8 w-32 ml-auto text-right"
                          data-testid={`input-edit-capex-${row.id}`}
                        />
                      ) : capex === 0 ? (
                        <span className="text-muted-foreground">---</span>
                      ) : (
                        formatCurrency(capex)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editValues.opexAmount}
                          onChange={(e) => setEditValues({ ...editValues, opexAmount: Number(e.target.value) })}
                          className="h-8 w-32 ml-auto text-right"
                          data-testid={`input-edit-opex-${row.id}`}
                        />
                      ) : opex === 0 ? (
                        <span className="text-muted-foreground">---</span>
                      ) : (
                        formatCurrency(opex)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {capex + opex === 0 ? <span className="text-muted-foreground">---</span> : formatCurrency(capex + opex)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-0.5">
                        {!readOnly && isEditing && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(row.id)} data-testid={`button-save-${row.id}`}>
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit} data-testid={`button-cancel-${row.id}`}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {!readOnly && !isEditing && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(row)} data-testid={`button-edit-${row.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(row.id)} data-testid={`button-delete-${row.id}`}>
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
                <tr className="border-b bg-muted/20" data-testid="row-new-intake-financial">
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      value={newRow.fiscalYear}
                      onChange={(e) => setNewRow({ ...newRow, fiscalYear: Number(e.target.value) })}
                      className="h-8 w-24"
                      data-testid="input-new-year"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      value={newRow.capexAmount}
                      onChange={(e) => setNewRow({ ...newRow, capexAmount: Number(e.target.value) })}
                      className="h-8 w-32 ml-auto text-right"
                      data-testid="input-new-capex"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      value={newRow.opexAmount}
                      onChange={(e) => setNewRow({ ...newRow, opexAmount: Number(e.target.value) })}
                      className="h-8 w-32 ml-auto text-right"
                      data-testid="input-new-opex"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatCurrency(newRow.capexAmount + newRow.opexAmount)}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreate} disabled={createMut.isPending} data-testid="button-save-new">
                        {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdding(false)} data-testid="button-cancel-new">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {(rows ?? []).length > 0 && (
                <tr className="font-medium bg-muted/20">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.capex === 0 ? '---' : formatCurrency(total.capex)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.opex === 0 ? '---' : formatCurrency(total.opex)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total.capex + total.opex)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
