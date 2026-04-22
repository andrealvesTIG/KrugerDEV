import { useState } from "react";
import { useSubmittals, useSubmittal, useCreateSubmittal, useUpdateSubmittal, useDeleteSubmittal, useCreateSubmittalRevision, useReviewSubmittalRevision } from "@/hooks/use-submittals";
import type { CreateSubmittalInput, UpdateSubmittalInput, SubmittalWithRevisions, ReviewRevisionInput } from "@/hooks/use-submittals";
import type { Submittal } from "@shared/schema";
import { exportSubmittalsToFile } from "@/lib/rfiSubmittalExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, Pencil, Eye, Search, Loader2, CheckCircle, XCircle, RefreshCw, Download, Paperclip, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const SUBMITTAL_STATUSES = ["Pending", "Under Review", "Approved", "Rejected", "Revise & Resubmit"] as const;
const SUBMITTAL_TYPES = ["Product Data", "Shop Drawings", "Samples", "Design Data", "Test Reports", "Certificates", "Manufacturer Instructions", "Other"] as const;
const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

function getStatusColor(status: string) {
  switch (status) {
    case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "Under Review": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "Revise & Resubmit": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "Critical": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "High": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "Medium": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "Low": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    default: return "";
  }
}

export default function SubmittalsTab({ projectId }: { projectId: number }) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: allSubmittals = [], isLoading } = useSubmittals(projectId, statusFilter || undefined);
  const createMutation = useCreateSubmittal(projectId);
  const deleteMutation = useDeleteSubmittal(projectId);
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSubmittalId, setSelectedSubmittalId] = useState<number | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const filtered = allSubmittals.filter(s =>
    !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.submittalNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusCounts = {
    all: allSubmittals.length,
    Pending: allSubmittals.filter(s => s.status === "Pending").length,
    "Under Review": allSubmittals.filter(s => s.status === "Under Review").length,
    Approved: allSubmittals.filter(s => s.status === "Approved").length,
    Rejected: allSubmittals.filter(s => s.status === "Rejected").length,
    "Revise & Resubmit": allSubmittals.filter(s => s.status === "Revise & Resubmit").length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Submittals</h3>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportSubmittalsToFile(filtered, "csv")}>Export CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSubmittalsToFile(filtered, "xlsx")}>Export Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSubmittalsToFile(filtered, "pdf")}>Export PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Submittal
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search submittals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button variant={statusFilter === "" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("")}>
            All ({statusCounts.all})
          </Button>
          {SUBMITTAL_STATUSES.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s} ({statusCounts[s]})
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <RefreshCw className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No submittals found</p>
            <Button variant="outline" className="mt-3" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create First Submittal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((submittal) => (
            <SubmittalRow
              key={submittal.id}
              submittal={submittal}
              onView={() => { setSelectedSubmittalId(submittal.id); setIsViewOpen(true); }}
              onEdit={() => { setSelectedSubmittalId(submittal.id); setIsEditOpen(true); }}
              onDelete={() => setDeleteConfirmId(submittal.id)}
            />
          ))}
        </div>
      )}

      <CreateSubmittalDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (data) => {
          try {
            await createMutation.mutateAsync(data);
            toast({ title: "Submittal created" });
            setIsCreateOpen(false);
          } catch (err) {
            toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create submittal", variant: "destructive" });
          }
        }}
        isLoading={createMutation.isPending}
      />

      {selectedSubmittalId && isViewOpen && (
        <ViewSubmittalDialog
          open={isViewOpen}
          onClose={() => { setIsViewOpen(false); setSelectedSubmittalId(null); }}
          projectId={projectId}
          submittalId={selectedSubmittalId}
        />
      )}

      {selectedSubmittalId && isEditOpen && (
        <EditSubmittalDialog
          open={isEditOpen}
          onClose={() => { setIsEditOpen(false); setSelectedSubmittalId(null); }}
          projectId={projectId}
          submittalId={selectedSubmittalId}
        />
      )}

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Submittal</DialogTitle>
            <DialogDescription>Are you sure? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                if (deleteConfirmId) {
                  try {
                    await deleteMutation.mutateAsync(deleteConfirmId);
                    toast({ title: "Submittal deleted" });
                    setDeleteConfirmId(null);
                  } catch (err) {
                    toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to delete", variant: "destructive" });
                  }
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmittalRow({ submittal, onView, onEdit, onDelete }: { submittal: Submittal; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="shrink-0">
              <Badge variant="outline" className="text-xs font-mono">{submittal.submittalNumber}</Badge>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{submittal.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className={cn("text-xs", getStatusColor(submittal.status))}>{submittal.status}</Badge>
                {submittal.priority && <Badge className={cn("text-xs", getPriorityColor(submittal.priority))}>{submittal.priority}</Badge>}
                {submittal.type && <span className="text-xs text-muted-foreground">{submittal.type}</span>}
                {submittal.specSection && <span className="text-xs text-muted-foreground">Spec: {submittal.specSection}</span>}
                {submittal.reviewerName && <span className="text-xs text-muted-foreground">Reviewer: {submittal.reviewerName}</span>}
                <span className="text-xs text-muted-foreground">Rev {submittal.currentRevision}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView}><Eye className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubmittalForm({
  initialData,
  onSubmit,
  isLoading,
  submitLabel,
}: {
  initialData?: SubmittalWithRevisions;
  onSubmit: (data: CreateSubmittalInput) => void;
  isLoading: boolean;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [specSection, setSpecSection] = useState(initialData?.specSection || "");
  const [type, setType] = useState(initialData?.type || "Product Data");
  const [priority, setPriority] = useState(initialData?.priority || "Medium");
  const [reviewerName, setReviewerName] = useState(initialData?.reviewerName || "");
  const [submitDate, setSubmitDate] = useState(initialData?.submitDate || "");
  const [requiredDate, setRequiredDate] = useState(initialData?.requiredDate || "");
  const [leadTime, setLeadTime] = useState<string>(initialData?.leadTime?.toString() || "");
  const [costImpact, setCostImpact] = useState(initialData?.costImpact || "");
  const [scheduleImpact, setScheduleImpact] = useState(initialData?.scheduleImpact || "");
  const [attachments, setAttachments] = useState<Array<{ name: string; url: string }>>(
    (initialData?.attachments as Array<{ name: string; url: string }>) || []
  );
  const [newAttachName, setNewAttachName] = useState("");
  const [newAttachUrl, setNewAttachUrl] = useState("");

  const addAttachment = () => {
    if (newAttachName && newAttachUrl && /^https?:\/\//i.test(newAttachUrl)) {
      setAttachments([...attachments, { name: newAttachName, url: newAttachUrl }]);
      setNewAttachName("");
      setNewAttachUrl("");
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    onSubmit({
      title,
      description: description || null,
      specSection: specSection || null,
      type: type as CreateSubmittalInput["type"],
      priority: priority as CreateSubmittalInput["priority"],
      reviewerName: reviewerName || null,
      submitDate: submitDate || null,
      requiredDate: requiredDate || null,
      leadTime: leadTime ? parseInt(leadTime) : null,
      costImpact: costImpact || null,
      scheduleImpact: scheduleImpact || null,
      attachments: attachments.length > 0 ? attachments : null,
    });
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div>
        <Label>Title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Submittal title" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Submittal description" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUBMITTAL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Spec Section</Label>
          <Input value={specSection} onChange={(e) => setSpecSection(e.target.value)} placeholder="e.g. 03 30 00" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Reviewer</Label>
          <Input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="Reviewer name" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Submit Date</Label>
          <Input type="date" value={submitDate} onChange={(e) => setSubmitDate(e.target.value)} />
        </div>
        <div>
          <Label>Required Date</Label>
          <Input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
        </div>
        <div>
          <Label>Lead Time (days)</Label>
          <Input type="number" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Cost Impact</Label>
          <Input value={costImpact} onChange={(e) => setCostImpact(e.target.value)} placeholder="e.g. $2,500" />
        </div>
        <div>
          <Label>Schedule Impact</Label>
          <Input value={scheduleImpact} onChange={(e) => setScheduleImpact(e.target.value)} placeholder="e.g. 1 week" />
        </div>
      </div>
      <div>
        <Label className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> Attachments</Label>
        {attachments.length > 0 && (
          <div className="space-y-1 mt-1 mb-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                <span className="truncate flex-1">{att.name}</span>
                <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate max-w-[200px]">{att.url}</a>
                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeAttachment(idx)}><X className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input value={newAttachName} onChange={(e) => setNewAttachName(e.target.value)} placeholder="File name" className="text-sm h-8" />
          </div>
          <div className="flex-1">
            <Input value={newAttachUrl} onChange={(e) => setNewAttachUrl(e.target.value)} placeholder="https://..." className="text-sm h-8" />
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={addAttachment} disabled={!newAttachName || !newAttachUrl || !/^https?:\/\//i.test(newAttachUrl)}>Add</Button>
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={isLoading || !title} className="w-full">
        {isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );
}

function CreateSubmittalDialog({ open, onClose, onSubmit, isLoading }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSubmittalInput) => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Submittal</DialogTitle>
          <DialogDescription>Create a new submittal for review</DialogDescription>
        </DialogHeader>
        <SubmittalForm onSubmit={onSubmit} isLoading={isLoading} submitLabel="Create Submittal" />
      </DialogContent>
    </Dialog>
  );
}

function EditSubmittalDialog({ open, onClose, projectId, submittalId }: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  submittalId: number;
}) {
  const { data: submittal, isLoading: isLoadingSubmittal } = useSubmittal(projectId, submittalId);
  const updateMutation = useUpdateSubmittal(projectId);
  const { toast } = useToast();

  if (isLoadingSubmittal) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Submittal {submittal?.submittalNumber}</DialogTitle>
          <DialogDescription>Update this submittal</DialogDescription>
        </DialogHeader>
        {submittal && (
          <SubmittalForm
            initialData={submittal}
            onSubmit={async (data) => {
              try {
                await updateMutation.mutateAsync({ submittalId, data });
                toast({ title: "Submittal updated" });
                onClose();
              } catch (err) {
                toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update", variant: "destructive" });
              }
            }}
            isLoading={updateMutation.isPending}
            submitLabel="Save Changes"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewSubmittalDialog({ open, onClose, projectId, submittalId }: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  submittalId: number;
}) {
  const { data: submittal, isLoading } = useSubmittal(projectId, submittalId);
  const revisionMutation = useCreateSubmittalRevision(projectId, submittalId);
  const reviewMutation = useReviewSubmittalRevision(projectId, submittalId);
  const { toast } = useToast();

  const [reviewNotes, setReviewNotes] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  const handleReview = async (revisionId: number, status: ReviewRevisionInput["status"]) => {
    try {
      await reviewMutation.mutateAsync({ revisionId, data: { status, reviewNotes: reviewNotes || null } });
      toast({ title: `Submittal ${status.toLowerCase()}` });
      setReviewNotes("");
      setIsReviewing(false);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to review", variant: "destructive" });
    }
  };

  const handleNewRevision = async () => {
    try {
      await revisionMutation.mutateAsync({ status: "Pending" });
      toast({ title: "New revision created" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create revision", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!submittal) return null;

  const latestRevision = submittal.revisions?.[0];
  const canReview = latestRevision && (latestRevision.status === "Pending" || latestRevision.status === "Under Review");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{submittal.submittalNumber}</Badge>
            <Badge className={getStatusColor(submittal.status)}>{submittal.status}</Badge>
            {submittal.priority && <Badge className={getPriorityColor(submittal.priority)}>{submittal.priority}</Badge>}
            <Badge variant="secondary">Rev {submittal.currentRevision}</Badge>
          </div>
          <DialogTitle className="mt-2">{submittal.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {submittal.description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{submittal.description}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            {submittal.type && <div><span className="text-muted-foreground">Type:</span> {submittal.type}</div>}
            {submittal.specSection && <div><span className="text-muted-foreground">Spec Section:</span> {submittal.specSection}</div>}
            {submittal.submittedByName && <div><span className="text-muted-foreground">Submitted By:</span> {submittal.submittedByName}</div>}
            {submittal.reviewerName && <div><span className="text-muted-foreground">Reviewer:</span> {submittal.reviewerName}</div>}
            {submittal.submitDate && <div><span className="text-muted-foreground">Submit Date:</span> {format(parseISO(submittal.submitDate), "MMM d, yyyy")}</div>}
            {submittal.requiredDate && <div><span className="text-muted-foreground">Required Date:</span> {format(parseISO(submittal.requiredDate), "MMM d, yyyy")}</div>}
            {submittal.leadTime !== null && submittal.leadTime !== undefined && <div><span className="text-muted-foreground">Lead Time:</span> {submittal.leadTime} days</div>}
            {submittal.costImpact && <div><span className="text-muted-foreground">Cost Impact:</span> {submittal.costImpact}</div>}
            {submittal.scheduleImpact && <div><span className="text-muted-foreground">Schedule Impact:</span> {submittal.scheduleImpact}</div>}
          </div>

          {submittal.attachments && Array.isArray(submittal.attachments) && submittal.attachments.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-1">Attachments</h4>
              <div className="flex flex-wrap gap-2">
                {submittal.attachments.map((att: { name: string; url: string }, idx: number) => (
                  <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                    <Download className="h-3 w-3" /> {att.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          {(submittal.status === "Rejected" || submittal.status === "Revise & Resubmit") && (
            <Button size="sm" variant="outline" onClick={handleNewRevision} disabled={revisionMutation.isPending}>
              {revisionMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Submit New Revision
            </Button>
          )}

          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Revision History ({submittal.revisions?.length || 0})</h4>
            {submittal.revisions?.map((rev) => (
              <Card key={rev.id} className={cn(
                rev.status === "Approved" && "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/20",
                rev.status === "Rejected" && "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
              )}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Rev {rev.revisionNumber}</Badge>
                      <Badge className={cn("text-xs", getStatusColor(rev.status))}>{rev.status}</Badge>
                      {rev.createdByName && <span className="text-xs text-muted-foreground">by {rev.createdByName}</span>}
                      {rev.createdAt && <span className="text-xs text-muted-foreground">{format(new Date(rev.createdAt), "MMM d, yyyy")}</span>}
                    </div>
                  </div>
                  {rev.notes && <p className="text-sm mt-1">{rev.notes}</p>}
                  {rev.reviewNotes && (
                    <div className="mt-2 pl-3 border-l-2 border-muted">
                      <p className="text-xs text-muted-foreground">Review by {rev.reviewedByName || "Unknown"}{rev.reviewedAt ? ` on ${format(new Date(rev.reviewedAt), "MMM d, yyyy")}` : ""}</p>
                      <p className="text-sm">{rev.reviewNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {canReview && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Review Current Revision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Review notes (optional)"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleReview(latestRevision.id, "Approved")} disabled={reviewMutation.isPending}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReview(latestRevision.id, "Revise & Resubmit")} disabled={reviewMutation.isPending}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Revise & Resubmit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleReview(latestRevision.id, "Rejected")} disabled={reviewMutation.isPending}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
