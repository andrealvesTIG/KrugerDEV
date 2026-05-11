import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, RefreshCw, Search, Pencil, Trash2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useProjectSoftwareLicenses,
  useCreateProjectSoftwareLicense,
  useUpdateProjectSoftwareLicense,
  useDeleteProjectSoftwareLicense,
  type ProjectSoftwareLicenseWithUsers,
  type SoftwareLicenseInput,
} from "@/hooks/use-project-software-licenses";

const RENEWAL_OPTIONS = ["Monthly", "Quarterly", "Semi-Annual", "Annual", "Biennial", "One-Time"];
const SOFTWARE_TYPE_OPTIONS = ["SaaS", "On-Premise", "Perpetual License", "Subscription", "Open Source", "Other"];

const fmtDate = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy");
};

const fmtMoney = (v: string | number | null | undefined) => {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
};

export function ProjectSoftwareLicensesBlock({
  projectId,
  isLocked,
}: {
  projectId: number;
  organizationId: number | undefined;
  isLocked: boolean;
}) {
  const { toast } = useToast();
  const { data: rows = [], isLoading, refetch, isFetching } = useProjectSoftwareLicenses(projectId);
  const [groupBy, setGroupBy] = useState<string>("none");
  const [filter, setFilter] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<ProjectSoftwareLicenseWithUsers | null>(null);

  const createMut = useCreateProjectSoftwareLicense();
  const updateMut = useUpdateProjectSoftwareLicense();
  const deleteMut = useDeleteProjectSoftwareLicense();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [
      r.vendor, r.softwareName, r.frequencyOfRenewal, r.softwareType,
    ].some(v => (v || "").toLowerCase().includes(q)));
  }, [rows, filter]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", items: filtered }];
    const map = new Map<string, ProjectSoftwareLicenseWithUsers[]>();
    for (const r of filtered) {
      const k =
        groupBy === "vendor" ? r.vendor || "(no vendor)"
        : groupBy === "frequency" ? r.frequencyOfRenewal || "(no frequency)"
        : groupBy === "type" ? r.softwareType || "(no type)"
        : "";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [filtered, groupBy]);

  const onDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync({ id, projectId });
      toast({ title: "Deleted" });
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3" data-testid="project-software-licenses-block">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShowNew(true)} disabled={isLocked} data-testid="button-new-software-license">
          <Plus className="h-4 w-4 mr-1" /> New Software / Licenses
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-software-licenses">
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold">Group By:</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-[180px]" data-testid="select-group-by-software-licenses">
              <SelectValue placeholder="(no grouping)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(no grouping)</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="frequency">Frequency of Renewal</SelectItem>
              <SelectItem value="type">Software Type</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by keyword" className="pl-8 h-8" data-testid="input-filter-software-licenses" />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor / Software name / Opex trail Start date</TableHead>
              <TableHead className="w-[200px]">Total Software / Licenses Cost</TableHead>
              <TableHead className="w-[180px]">Frequency of Renewal</TableHead>
              <TableHead className="w-[180px]">Software Type</TableHead>
              <TableHead className="w-[80px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline-block text-muted-foreground" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="text-sm text-muted-foreground">No data available.</div>
                </TableCell>
              </TableRow>
            ) : (
              grouped.map(group => (
                <>
                  {group.label && (
                    <TableRow key={`g-${group.key}`} className="bg-muted/40">
                      <TableCell colSpan={5} className="font-medium text-sm">{group.label} ({group.items.length})</TableCell>
                    </TableRow>
                  )}
                  {group.items.map(r => (
                    <TableRow key={r.id} data-testid={`row-software-license-${r.id}`}>
                      <TableCell>
                        <button
                          className="text-left hover:underline space-y-0.5"
                          onClick={() => setEditing(r)}
                          disabled={isLocked}
                          data-testid={`link-software-license-${r.id}`}
                        >
                          <div className="font-medium">{r.vendor || "—"}</div>
                          <div className="text-sm text-muted-foreground">{r.softwareName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{fmtDate(r.opexTrailStartDate)}</div>
                        </button>
                      </TableCell>
                      <TableCell className="text-sm">{fmtMoney(r.totalCost)}</TableCell>
                      <TableCell className="text-sm">{r.frequencyOfRenewal || "—"}</TableCell>
                      <TableCell className="text-sm">{r.softwareType || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)} disabled={isLocked} data-testid={`button-edit-software-license-${r.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(r.id)} disabled={isLocked} data-testid={`button-delete-software-license-${r.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showNew && (
        <SoftwareLicenseDialog
          title="New Software / Licenses"
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
        <SoftwareLicenseDialog
          title="Edit Software / Licenses"
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

function toDateInputValue(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function SoftwareLicenseDialog({
  title, initial, onClose, onSubmit, submitting,
}: {
  title: string;
  initial?: ProjectSoftwareLicenseWithUsers;
  onClose: () => void;
  onSubmit: (input: SoftwareLicenseInput) => Promise<void>;
  submitting: boolean;
}) {
  const [vendor, setVendor] = useState(initial?.vendor || "");
  const [softwareName, setSoftwareName] = useState(initial?.softwareName || "");
  const [opexTrailStartDate, setOpex] = useState(toDateInputValue(initial?.opexTrailStartDate));
  const [totalCost, setTotalCost] = useState(initial?.totalCost != null ? String(initial.totalCost) : "");
  const [frequencyOfRenewal, setFrequency] = useState(initial?.frequencyOfRenewal || "");
  const [softwareType, setSoftwareType] = useState(initial?.softwareType || "");

  const submit = () => {
    onSubmit({
      vendor: vendor.trim() || null,
      softwareName: softwareName.trim() || null,
      opexTrailStartDate: opexTrailStartDate || null,
      totalCost: totalCost.trim() === "" ? null : totalCost.trim(),
      frequencyOfRenewal: frequencyOfRenewal || null,
      softwareType: softwareType || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Capture vendor and licensing details for this project.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Vendor</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} data-testid="input-sl-vendor" autoFocus />
          </div>
          <div className="col-span-2">
            <Label>Software Name</Label>
            <Input value={softwareName} onChange={(e) => setSoftwareName(e.target.value)} data-testid="input-sl-software-name" />
          </div>
          <div>
            <Label>Opex Trail Start Date</Label>
            <Input type="date" value={opexTrailStartDate} onChange={(e) => setOpex(e.target.value)} data-testid="input-sl-opex-start" />
          </div>
          <div>
            <Label>Total Software / Licenses Cost</Label>
            <Input type="number" step="0.01" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} data-testid="input-sl-total-cost" />
          </div>
          <div>
            <Label>Frequency of Renewal</Label>
            <Select value={frequencyOfRenewal} onValueChange={setFrequency}>
              <SelectTrigger data-testid="select-sl-frequency"><SelectValue placeholder="Select frequency" /></SelectTrigger>
              <SelectContent>
                {RENEWAL_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Software Type</Label>
            <Select value={softwareType} onValueChange={setSoftwareType}>
              <SelectTrigger data-testid="select-sl-type"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {SOFTWARE_TYPE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-sl">Cancel</Button>
          <Button onClick={submit} disabled={submitting} data-testid="button-save-sl">
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
