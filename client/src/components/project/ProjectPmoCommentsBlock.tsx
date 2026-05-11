import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, RefreshCw, Search, Pencil, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useProjectPmoComments,
  useOrgPmoComments,
  useCreateProjectPmoComment,
  useLinkPmoComment,
  useUnlinkPmoComment,
  useUpdatePmoComment,
  type PmoCommentWithUsers,
} from "@/hooks/use-pmo-comments";

const fmtDate = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy h:mm a");
};

const truncate = (s: string | null, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
};

export function ProjectPmoCommentsBlock({
  projectId,
  organizationId,
  isLocked,
}: {
  projectId: number;
  organizationId: number | undefined;
  isLocked: boolean;
}) {
  const { toast } = useToast();
  const { data: rows = [], isLoading, refetch, isFetching } = useProjectPmoComments(projectId);
  const [groupBy, setGroupBy] = useState<string>("none");
  const [filter, setFilter] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [editing, setEditing] = useState<PmoCommentWithUsers | null>(null);

  const createMut = useCreateProjectPmoComment();
  const linkMut = useLinkPmoComment();
  const unlinkMut = useUnlinkPmoComment();
  const updateMut = useUpdatePmoComment();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.comment || "").toLowerCase().includes(q) ||
      (r.createdByName || "").toLowerCase().includes(q) ||
      (r.updatedByName || "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", items: filtered }];
    const map = new Map<string, PmoCommentWithUsers[]>();
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

  const onUnlink = async (commentId: number) => {
    try {
      await unlinkMut.mutateAsync({ projectId, commentId });
      toast({ title: "Removed from project" });
    } catch {
      toast({ title: "Error", description: "Failed to remove", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3" data-testid="project-pmo-comments-block">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNew(true)}
          disabled={isLocked}
          data-testid="button-new-pmo-comment"
        >
          <Plus className="h-4 w-4 mr-1" /> New PMO Comment
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddExisting(true)}
          disabled={isLocked || !organizationId}
          data-testid="button-add-existing-pmo-comment"
        >
          <Plus className="h-4 w-4 mr-1" /> Add Existing PMO Comment
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh-pmo-comments"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold">Group By:</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-[180px]" data-testid="select-group-by-pmo-comments">
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
            data-testid="input-filter-pmo-comments"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead>PMO Comment</TableHead>
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
                  <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="text-sm text-muted-foreground">We didn't find anything to show here.</div>
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
                    <TableRow key={r.id} data-testid={`row-pmo-comment-${r.id}`}>
                      <TableCell className="font-medium">
                        <button
                          className="text-left hover:underline"
                          onClick={() => setEditing(r)}
                          disabled={isLocked}
                          data-testid={`link-pmo-comment-${r.id}`}
                        >
                          {r.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{truncate(r.comment)}</TableCell>
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
                          data-testid={`button-edit-pmo-comment-${r.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => onUnlink(r.id)}
                          disabled={isLocked}
                          data-testid={`button-remove-pmo-comment-${r.id}`}
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
        <NewPmoCommentDialog
          onClose={() => setShowNew(false)}
          onCreate={async (name, comment) => {
            await createMut.mutateAsync({ projectId, name, comment });
            toast({ title: "PMO comment created" });
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
            await linkMut.mutateAsync({ projectId, commentId: id });
            toast({ title: "Linked to project" });
            setShowAddExisting(false);
          }}
          submitting={linkMut.isPending}
        />
      )}

      {editing && (
        <EditPmoCommentDialog
          comment={editing}
          onClose={() => setEditing(null)}
          onSave={async (name, comment) => {
            await updateMut.mutateAsync({ id: editing.id, name, comment });
            toast({ title: "Saved" });
            setEditing(null);
          }}
          submitting={updateMut.isPending}
        />
      )}
    </div>
  );
}

function NewPmoCommentDialog({
  onClose, onCreate, submitting,
}: { onClose: () => void; onCreate: (name: string, comment: string) => Promise<void>; submitting: boolean }) {
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New PMO Comment</DialogTitle>
          <DialogDescription>Create a new PMO comment and attach it to this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-new-pc-name" autoFocus />
          </div>
          <div>
            <Label>PMO Comment</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={6} data-testid="input-new-pc-comment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-new-pc">Cancel</Button>
          <Button
            disabled={!name.trim() || submitting}
            onClick={() => onCreate(name.trim(), comment)}
            data-testid="button-save-new-pc"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPmoCommentDialog({
  comment, onClose, onSave, submitting,
}: { comment: PmoCommentWithUsers; onClose: () => void; onSave: (name: string, comment: string) => Promise<void>; submitting: boolean }) {
  const [name, setName] = useState(comment.name);
  const [text, setText] = useState(comment.comment || "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit PMO Comment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-edit-pc-name" autoFocus />
          </div>
          <div>
            <Label>PMO Comment</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} data-testid="input-edit-pc-comment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-edit-pc">Cancel</Button>
          <Button
            disabled={!name.trim() || submitting}
            onClick={() => onSave(name.trim(), text)}
            data-testid="button-save-edit-pc"
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
  const { data: orgRows = [], isLoading } = useOrgPmoComments(organizationId);
  const [filter, setFilter] = useState("");
  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return orgRows.filter(r => !existingIds.has(r.id) && (
      !q || r.name.toLowerCase().includes(q) || (r.comment || "").toLowerCase().includes(q)
    ));
  }, [orgRows, existingIds, filter]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Add Existing PMO Comment</DialogTitle>
          <DialogDescription>Pick a PMO comment from this organization to link to the project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by keyword" className="pl-8 h-8" data-testid="input-filter-add-existing-pc" />
          </div>
          <div className="max-h-[400px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>PMO Comment</TableHead>
                  <TableHead className="w-[80px] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
                ) : candidates.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No available PMO comments.</TableCell></TableRow>
                ) : (
                  candidates.map(r => (
                    <TableRow key={r.id} data-testid={`row-add-existing-pc-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{truncate(r.comment, 60)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => onAdd(r.id)} disabled={submitting} data-testid={`button-link-existing-pc-${r.id}`}>
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
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-add-existing-pc">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
