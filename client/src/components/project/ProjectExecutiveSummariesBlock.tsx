import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, RefreshCw, Search, Pencil, Trash2, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useProjectExecutiveSummaries,
  useOrgExecutiveSummaries,
  useCreateProjectExecutiveSummary,
  useLinkExecutiveSummary,
  useUnlinkExecutiveSummary,
  useUpdateExecutiveSummary,
  type ExecutiveSummaryWithUsers,
} from "@/hooks/use-executive-summaries";

const fmtDate = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy h:mm a");
};

const truncate = (s: string | null, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
};

export function ProjectExecutiveSummariesBlock({
  projectId,
  organizationId,
  isLocked,
}: {
  projectId: number;
  organizationId: number | undefined;
  isLocked: boolean;
}) {
  const { toast } = useToast();
  const { data: rows = [], isLoading, refetch, isFetching } = useProjectExecutiveSummaries(projectId);
  const [groupBy, setGroupBy] = useState<string>("none");
  const [filter, setFilter] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [editing, setEditing] = useState<ExecutiveSummaryWithUsers | null>(null);

  const createMut = useCreateProjectExecutiveSummary();
  const linkMut = useLinkExecutiveSummary();
  const unlinkMut = useUnlinkExecutiveSummary();
  const updateMut = useUpdateExecutiveSummary();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.summary || "").toLowerCase().includes(q) ||
      (r.createdByName || "").toLowerCase().includes(q) ||
      (r.updatedByName || "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", items: filtered }];
    const map = new Map<string, ExecutiveSummaryWithUsers[]>();
    for (const r of filtered) {
      const k =
        groupBy === "createdBy" ? r.createdByName || "Unassigned"
        : groupBy === "modifiedBy" ? r.updatedByName || "Unassigned"
        : "";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [filtered, groupBy]);

  const onUnlink = async (summaryId: number) => {
    try {
      await unlinkMut.mutateAsync({ projectId, summaryId });
      toast({ title: "Removed from project" });
    } catch {
      toast({ title: "Error", description: "Failed to remove", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3" data-testid="project-executive-summaries-block">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNew(true)}
          disabled={isLocked}
          data-testid="button-new-executive-summary"
        >
          <Plus className="h-4 w-4 mr-1" /> New Executive Summary
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddExisting(true)}
          disabled={isLocked || !organizationId}
          data-testid="button-add-existing-executive-summary"
        >
          <Plus className="h-4 w-4 mr-1" /> Add Existing Executive Summary
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-executive-summaries"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold">Group By:</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-[180px]" data-testid="select-group-by-executive-summaries">
              <SelectValue placeholder="(no grouping)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">(no grouping)</SelectItem>
              <SelectItem value="createdBy">Created By</SelectItem>
              <SelectItem value="modifiedBy">Modified By</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by keyword"
            className="pl-8 h-8"
            data-testid="input-filter-executive-summaries"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead>Executive Summary</TableHead>
              <TableHead className="w-[170px]">Created On</TableHead>
              <TableHead className="w-[140px]">Created By</TableHead>
              <TableHead className="w-[140px]">Modified By</TableHead>
              <TableHead className="w-[170px]">Modified On</TableHead>
              <TableHead className="w-[80px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="text-sm text-muted-foreground">No data available.</div>
                </TableCell>
              </TableRow>
            ) : (
              grouped.map(group => (
                <>
                  {group.label && (
                    <TableRow key={`g-${group.key}`} className="bg-muted/40">
                      <TableCell colSpan={7} className="font-medium text-sm">{group.label} ({group.items.length})</TableCell>
                    </TableRow>
                  )}
                  {group.items.map(r => (
                    <TableRow key={r.id} data-testid={`row-executive-summary-${r.id}`}>
                      <TableCell className="font-medium">
                        <button
                          className="text-left hover:underline"
                          onClick={() => setEditing(r)}
                          disabled={isLocked}
                          data-testid={`link-executive-summary-${r.id}`}
                        >
                          {r.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{truncate(r.summary)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(r.createdAt)}</TableCell>
                      <TableCell className="text-sm">{r.createdByName || "—"}</TableCell>
                      <TableCell className="text-sm">{r.updatedByName || "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(r.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditing(r)}
                          disabled={isLocked}
                          data-testid={`button-edit-executive-summary-${r.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onUnlink(r.id)}
                          disabled={isLocked}
                          data-testid={`button-remove-executive-summary-${r.id}`}
                        >
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
        <NewExecutiveSummaryDialog
          onClose={() => setShowNew(false)}
          onCreate={async (name, summary) => {
            await createMut.mutateAsync({ projectId, name, summary });
            toast({ title: "Executive summary created" });
            setShowNew(false);
          }}
          submitting={createMut.isPending}
        />
      )}

      {showAddExisting && organizationId != null && (
        <AddExistingDialog
          organizationId={organizationId}
          existingIds={new Set(rows.map(r => r.id))}
          onClose={() => setShowAddExisting(false)}
          onAdd={async (id) => {
            await linkMut.mutateAsync({ projectId, summaryId: id });
            toast({ title: "Linked to project" });
            setShowAddExisting(false);
          }}
          submitting={linkMut.isPending}
        />
      )}

      {editing && (
        <EditExecutiveSummaryDialog
          summary={editing}
          onClose={() => setEditing(null)}
          onSave={async (name, summary) => {
            await updateMut.mutateAsync({ id: editing.id, name, summary });
            toast({ title: "Saved" });
            setEditing(null);
          }}
          submitting={updateMut.isPending}
        />
      )}
    </div>
  );
}

function NewExecutiveSummaryDialog({
  onClose, onCreate, submitting,
}: { onClose: () => void; onCreate: (name: string, summary: string) => Promise<void>; submitting: boolean }) {
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New Executive Summary</DialogTitle>
          <DialogDescription>Create a new executive summary and attach it to this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-new-es-name" autoFocus />
          </div>
          <div>
            <Label>Executive Summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={6} data-testid="input-new-es-summary" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-new-es">Cancel</Button>
          <Button
            disabled={!name.trim() || submitting}
            onClick={() => onCreate(name.trim(), summary)}
            data-testid="button-save-new-es"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditExecutiveSummaryDialog({
  summary, onClose, onSave, submitting,
}: { summary: ExecutiveSummaryWithUsers; onClose: () => void; onSave: (name: string, summary: string) => Promise<void>; submitting: boolean }) {
  const [name, setName] = useState(summary.name);
  const [text, setText] = useState(summary.summary || "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Executive Summary</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-edit-es-name" autoFocus />
          </div>
          <div>
            <Label>Executive Summary</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} data-testid="input-edit-es-summary" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-edit-es">Cancel</Button>
          <Button
            disabled={!name.trim() || submitting}
            onClick={() => onSave(name.trim(), text)}
            data-testid="button-save-edit-es"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddExistingDialog({
  organizationId, existingIds, onClose, onAdd, submitting,
}: {
  organizationId: number;
  existingIds: Set<number>;
  onClose: () => void;
  onAdd: (id: number) => Promise<void>;
  submitting: boolean;
}) {
  const { data: orgRows = [], isLoading } = useOrgExecutiveSummaries(organizationId);
  const [filter, setFilter] = useState("");
  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return orgRows.filter(r => !existingIds.has(r.id) && (
      !q || r.name.toLowerCase().includes(q) || (r.summary || "").toLowerCase().includes(q)
    ));
  }, [orgRows, existingIds, filter]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Add Existing Executive Summary</DialogTitle>
          <DialogDescription>Pick an executive summary from this organization to link to the project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by keyword" className="pl-8 h-8" data-testid="input-filter-add-existing-es" />
          </div>
          <div className="max-h-[400px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Executive Summary</TableHead>
                  <TableHead className="w-[80px] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                ) : candidates.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No available executive summaries.</TableCell></TableRow>
                ) : (
                  candidates.map(r => (
                    <TableRow key={r.id} data-testid={`row-add-existing-es-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{truncate(r.summary, 60)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => onAdd(r.id)} disabled={submitting} data-testid={`button-link-existing-es-${r.id}`}>
                          <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-add-existing-es">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
