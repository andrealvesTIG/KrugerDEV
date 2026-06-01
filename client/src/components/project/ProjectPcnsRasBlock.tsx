import { useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Pencil, Trash2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useProjectPcnsRas,
  useCreateProjectPcnRa,
  useUpdateProjectPcnRa,
  useDeleteProjectPcnRa,
  type ProjectPcnRaWithUsers,
  type PcnRaInput,
} from "@/hooks/use-project-pcns-ras";

const toNum = (v: string | number | null | undefined): number => {
  if (v == null || v === "") return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isNaN(n) ? 0 : n;
};

const fmtMoney = (v: string | number | null | undefined) => {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 2 });
};

export function ProjectPcnsRasBlock({
  projectId,
  isLocked,
}: {
  projectId: number;
  organizationId: number | undefined;
  isLocked: boolean;
}) {
  const { toast } = useToast();
  const { data: rows = [], isLoading, refetch, isFetching } = useProjectPcnsRas(projectId);
  const [filter, setFilter] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ProjectPcnRaWithUsers | null>(null);

  const createMut = useCreateProjectPcnRa();
  const updateMut = useUpdateProjectPcnRa();
  const deleteMut = useDeleteProjectPcnRa();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [
      r.year != null ? String(r.year) : "", r.pcnId, r.raId,
    ].some(v => (v || "").toLowerCase().includes(q)));
  }, [rows, filter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.pcn += toNum(r.pcnAmount);
        acc.ra += toNum(r.raAmount);
        return acc;
      },
      { pcn: 0, ra: 0 },
    );
  }, [filtered]);

  const onDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync({ id, projectId });
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3" data-testid="project-pcns-ras-block">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowNew(true)} disabled={isLocked} data-testid="button-new-pcn-ra">
          <Plus className="h-4 w-4 mr-1" /> New PCN / RA
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-pcns-ras">
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by year or ID" className="pl-8 h-8" data-testid="input-filter-pcns-ras" />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Year</TableHead>
              <TableHead className="w-[160px]">PCN</TableHead>
              <TableHead>PCN ID</TableHead>
              <TableHead className="w-[160px]">RA</TableHead>
              <TableHead>RA ID</TableHead>
              <TableHead className="w-[80px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline-block text-muted-foreground" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="text-sm text-muted-foreground">No data available.</div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(r => (
                <TableRow key={r.id} data-testid={`row-pcn-ra-${r.id}`}>
                  <TableCell>
                    <button
                      className="text-left hover:underline font-medium"
                      onClick={() => setEditing(r)}
                      disabled={isLocked}
                      data-testid={`link-pcn-ra-${r.id}`}
                    >
                      {r.year != null ? r.year : "—"}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{fmtMoney(r.pcnAmount)}</TableCell>
                  <TableCell className="text-sm">{r.pcnId || "—"}</TableCell>
                  <TableCell className="text-sm">{fmtMoney(r.raAmount)}</TableCell>
                  <TableCell className="text-sm">{r.raId || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)} disabled={isLocked} data-testid={`button-edit-pcn-ra-${r.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(r.id)} disabled={isLocked} data-testid={`button-delete-pcn-ra-${r.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {filtered.length > 0 && (
            <TableFooter>
              <TableRow data-testid="row-pcns-ras-totals">
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-sm font-semibold" data-testid="text-pcns-total">{fmtMoney(totals.pcn)}</TableCell>
                <TableCell />
                <TableCell className="text-sm font-semibold" data-testid="text-ras-total">{fmtMoney(totals.ra)}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {showNew && (
        <PcnRaDialog
          title="New PCN / RA"
          onClose={() => setShowNew(false)}
          onSubmit={async (input) => {
            await createMut.mutateAsync({ projectId, input });
            toast({ title: "Created" });
            setShowNew(false);
          }}
          submitting={createMut.isPending}
        />
      )}
      {editing && (
        <PcnRaDialog
          title="Edit PCN / RA"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            await updateMut.mutateAsync({ id: editing.id, input });
            toast({ title: "Saved" });
            setEditing(null);
          }}
          submitting={updateMut.isPending}
        />
      )}
    </div>
  );
}

function PcnRaDialog({
  title, initial, onClose, onSubmit, submitting,
}: {
  title: string;
  initial?: ProjectPcnRaWithUsers;
  onClose: () => void;
  onSubmit: (input: PcnRaInput) => Promise<void>;
  submitting: boolean;
}) {
  const [year, setYear] = useState(initial?.year != null ? String(initial.year) : "");
  const [pcnAmount, setPcnAmount] = useState(initial?.pcnAmount != null ? String(initial.pcnAmount) : "");
  const [pcnId, setPcnId] = useState(initial?.pcnId || "");
  const [raAmount, setRaAmount] = useState(initial?.raAmount != null ? String(initial.raAmount) : "");
  const [raId, setRaId] = useState(initial?.raId || "");

  const submit = () => {
    onSubmit({
      year: year.trim() === "" ? null : year.trim(),
      pcnAmount: pcnAmount.trim() === "" ? null : pcnAmount.trim(),
      pcnId: pcnId.trim() || null,
      raAmount: raAmount.trim() === "" ? null : raAmount.trim(),
      raId: raId.trim() || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Capture per-year PCN (Project Change Notice) and RA (Risk Allowance) amounts for this project.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Year</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} data-testid="input-pcnra-year" autoFocus />
          </div>
          <div>
            <Label>PCN</Label>
            <Input type="number" step="0.01" value={pcnAmount} onChange={(e) => setPcnAmount(e.target.value)} data-testid="input-pcnra-pcn-amount" />
          </div>
          <div>
            <Label>PCN ID</Label>
            <Input value={pcnId} onChange={(e) => setPcnId(e.target.value)} data-testid="input-pcnra-pcn-id" />
          </div>
          <div>
            <Label>RA</Label>
            <Input type="number" step="0.01" value={raAmount} onChange={(e) => setRaAmount(e.target.value)} data-testid="input-pcnra-ra-amount" />
          </div>
          <div>
            <Label>RA ID</Label>
            <Input value={raId} onChange={(e) => setRaId(e.target.value)} data-testid="input-pcnra-ra-id" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-pcnra">Cancel</Button>
          <Button onClick={submit} disabled={submitting} data-testid="button-save-pcnra">
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
