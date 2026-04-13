import { useState } from "react";
import { useRfis, useRfi, useCreateRfi, useUpdateRfi, useDeleteRfi, useCreateRfiResponse } from "@/hooks/use-rfis";
import type { CreateRfiInput, UpdateRfiInput, CreateRfiResponseInput, RfiWithResponses } from "@/hooks/use-rfis";
import type { Rfi } from "@shared/schema";
import { exportRfisToFile } from "@/lib/rfiSubmittalExport";
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
import { Plus, Trash2, Pencil, MessageSquare, Eye, Search, Send, Loader2, Download } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const RFI_STATUSES = ["Open", "Answered", "Closed"] as const;
const RFI_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const RFI_CATEGORIES = ["Design", "Structural", "Mechanical", "Electrical", "Plumbing", "Fire Protection", "Civil", "Architectural", "General", "Other"];

function getStatusColor(status: string) {
  switch (status) {
    case "Open": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "Answered": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Closed": return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
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

export default function RFIsTab({ projectId }: { projectId: number }) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: allRfis = [], isLoading } = useRfis(projectId, statusFilter || undefined);
  const createMutation = useCreateRfi(projectId);
  const updateMutation = useUpdateRfi(projectId);
  const deleteMutation = useDeleteRfi(projectId);
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRfiId, setSelectedRfiId] = useState<number | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const rfis = allRfis.filter(rfi =>
    !searchQuery || rfi.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rfi.rfiNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusCounts = {
    all: allRfis.length,
    Open: allRfis.filter(r => r.status === "Open").length,
    Answered: allRfis.filter(r => r.status === "Answered").length,
    Closed: allRfis.filter(r => r.status === "Closed").length,
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
          <h3 className="text-lg font-semibold">RFIs</h3>
          <Badge variant="secondary">{rfis.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> Export</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportRfisToFile(rfis, "csv")}>Export CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportRfisToFile(rfis, "xlsx")}>Export Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New RFI
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search RFIs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["", ...RFI_STATUSES] as const).map((s) => (
            <Button
              key={s || "all"}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s || "All"} ({s ? statusCounts[s as keyof typeof statusCounts] : statusCounts.all})
            </Button>
          ))}
        </div>
      </div>

      {rfis.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No RFIs found</p>
            <Button variant="outline" className="mt-3" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create First RFI
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rfis.map((rfi) => (
            <RfiRow
              key={rfi.id}
              rfi={rfi}
              onView={() => { setSelectedRfiId(rfi.id); setIsViewOpen(true); }}
              onEdit={() => { setSelectedRfiId(rfi.id); setIsEditOpen(true); }}
              onDelete={() => setDeleteConfirmId(rfi.id)}
            />
          ))}
        </div>
      )}

      <CreateRfiDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={async (data) => {
          try {
            await createMutation.mutateAsync(data);
            toast({ title: "RFI created" });
            setIsCreateOpen(false);
          } catch (err) {
            toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create RFI", variant: "destructive" });
          }
        }}
        isLoading={createMutation.isPending}
      />

      {selectedRfiId && isViewOpen && (
        <ViewRfiDialog
          open={isViewOpen}
          onClose={() => { setIsViewOpen(false); setSelectedRfiId(null); }}
          projectId={projectId}
          rfiId={selectedRfiId}
        />
      )}

      {selectedRfiId && isEditOpen && (
        <EditRfiDialog
          open={isEditOpen}
          onClose={() => { setIsEditOpen(false); setSelectedRfiId(null); }}
          projectId={projectId}
          rfiId={selectedRfiId}
          onSubmit={async (data) => {
            try {
              await updateMutation.mutateAsync({ rfiId: selectedRfiId, data });
              toast({ title: "RFI updated" });
              setIsEditOpen(false);
              setSelectedRfiId(null);
            } catch (err) {
              toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update", variant: "destructive" });
            }
          }}
          isLoading={updateMutation.isPending}
        />
      )}

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete RFI</DialogTitle>
            <DialogDescription>Are you sure you want to delete this RFI? This action cannot be undone.</DialogDescription>
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
                    toast({ title: "RFI deleted" });
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

function RfiRow({ rfi, onView, onEdit, onDelete }: { rfi: Rfi; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="shrink-0">
              <Badge variant="outline" className="text-xs font-mono">{rfi.rfiNumber}</Badge>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{rfi.subject}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge className={cn("text-xs", getStatusColor(rfi.status))}>{rfi.status}</Badge>
                {rfi.priority && <Badge className={cn("text-xs", getPriorityColor(rfi.priority))}>{rfi.priority}</Badge>}
                {rfi.assignedToName && <span className="text-xs text-muted-foreground">Assigned: {rfi.assignedToName}</span>}
                {rfi.dueDate && <span className="text-xs text-muted-foreground">Due: {format(parseISO(rfi.dueDate), "MMM d, yyyy")}</span>}
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

function RfiForm({
  initialData,
  onSubmit,
  isLoading,
  submitLabel,
}: {
  initialData?: RfiWithResponses;
  onSubmit: (data: CreateRfiInput | UpdateRfiInput) => void;
  isLoading: boolean;
  submitLabel: string;
}) {
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [question, setQuestion] = useState(initialData?.question || "");
  const [priority, setPriority] = useState(initialData?.priority || "Medium");
  const [category, setCategory] = useState(initialData?.category || "");
  const [assignedToName, setAssignedToName] = useState(initialData?.assignedToName || "");
  const [dueDate, setDueDate] = useState(initialData?.dueDate || "");
  const [costImpact, setCostImpact] = useState(initialData?.costImpact || "");
  const [scheduleImpact, setScheduleImpact] = useState(initialData?.scheduleImpact || "");
  const [references, setReferences] = useState(initialData?.references || "");

  const handleSubmit = () => {
    onSubmit({
      subject,
      question,
      priority: priority as CreateRfiInput["priority"],
      category: category || null,
      assignedToName: assignedToName || null,
      dueDate: dueDate || null,
      costImpact: costImpact || null,
      scheduleImpact: scheduleImpact || null,
      references: references || null,
    });
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div>
        <Label>Subject *</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="RFI subject" />
      </div>
      <div>
        <Label>Question *</Label>
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Describe your question in detail" rows={4} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RFI_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {RFI_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Assigned To</Label>
          <Input value={assignedToName} onChange={(e) => setAssignedToName(e.target.value)} placeholder="Responsible party" />
        </div>
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Cost Impact</Label>
          <Input value={costImpact} onChange={(e) => setCostImpact(e.target.value)} placeholder="e.g. $5,000" />
        </div>
        <div>
          <Label>Schedule Impact</Label>
          <Input value={scheduleImpact} onChange={(e) => setScheduleImpact(e.target.value)} placeholder="e.g. 2 weeks delay" />
        </div>
      </div>
      <div>
        <Label>References</Label>
        <Input value={references} onChange={(e) => setReferences(e.target.value)} placeholder="Drawing numbers, spec sections, etc." />
      </div>
      <Button onClick={handleSubmit} disabled={isLoading || !subject || !question} className="w-full">
        {isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );
}

function CreateRfiDialog({ open, onClose, onSubmit, isLoading }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateRfiInput) => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New RFI</DialogTitle>
          <DialogDescription>Create a Request for Information</DialogDescription>
        </DialogHeader>
        <RfiForm onSubmit={onSubmit} isLoading={isLoading} submitLabel="Create RFI" />
      </DialogContent>
    </Dialog>
  );
}

function EditRfiDialog({ open, onClose, projectId, rfiId, onSubmit, isLoading }: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  rfiId: number;
  onSubmit: (data: UpdateRfiInput) => void;
  isLoading: boolean;
}) {
  const { data: rfi, isLoading: isLoadingRfi } = useRfi(projectId, rfiId);

  if (isLoadingRfi) {
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
          <DialogTitle>Edit RFI {rfi?.rfiNumber}</DialogTitle>
          <DialogDescription>Update this Request for Information</DialogDescription>
        </DialogHeader>
        {rfi && <RfiForm initialData={rfi} onSubmit={onSubmit} isLoading={isLoading} submitLabel="Save Changes" />}
      </DialogContent>
    </Dialog>
  );
}

function ViewRfiDialog({ open, onClose, projectId, rfiId }: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  rfiId: number;
}) {
  const { data: rfi, isLoading } = useRfi(projectId, rfiId);
  const updateMutation = useUpdateRfi(projectId);
  const { toast } = useToast();
  const [newResponse, setNewResponse] = useState("");
  const [isOfficial, setIsOfficial] = useState(false);
  const responseMutation = useCreateRfiResponse(projectId, rfiId);

  const handleStatusChange = async (status: "Open" | "Answered" | "Closed") => {
    try {
      await updateMutation.mutateAsync({ rfiId, data: { status } });
      toast({ title: `RFI marked as ${status}` });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update status", variant: "destructive" });
    }
  };

  const handleAddResponse = async () => {
    if (!newResponse.trim()) return;
    try {
      await responseMutation.mutateAsync({ responseText: newResponse, isOfficial });
      toast({ title: "Response added" });
      setNewResponse("");
      setIsOfficial(false);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to add response", variant: "destructive" });
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

  if (!rfi) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{rfi.rfiNumber}</Badge>
            <Badge className={getStatusColor(rfi.status)}>{rfi.status}</Badge>
            {rfi.priority && <Badge className={getPriorityColor(rfi.priority)}>{rfi.priority}</Badge>}
          </div>
          <DialogTitle className="mt-2">{rfi.subject}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Question</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{rfi.question}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {rfi.assignedToName && <div><span className="text-muted-foreground">Assigned To:</span> {rfi.assignedToName}</div>}
            {rfi.dueDate && <div><span className="text-muted-foreground">Due Date:</span> {format(parseISO(rfi.dueDate), "MMM d, yyyy")}</div>}
            {rfi.category && <div><span className="text-muted-foreground">Category:</span> {rfi.category}</div>}
            {rfi.costImpact && <div><span className="text-muted-foreground">Cost Impact:</span> {rfi.costImpact}</div>}
            {rfi.scheduleImpact && <div><span className="text-muted-foreground">Schedule Impact:</span> {rfi.scheduleImpact}</div>}
            {rfi.references && <div><span className="text-muted-foreground">References:</span> {rfi.references}</div>}
          </div>

          {rfi.attachments && Array.isArray(rfi.attachments) && rfi.attachments.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-1">Attachments</h4>
              <div className="flex flex-wrap gap-2">
                {rfi.attachments.map((att: { name: string; url: string }, idx: number) => (
                  <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
                    <Download className="h-3 w-3" /> {att.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {rfi.status !== "Closed" && (
              <>
                {rfi.status === "Open" && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange("Answered")}>Mark Answered</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => handleStatusChange("Closed")}>Close RFI</Button>
              </>
            )}
            {rfi.status === "Closed" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("Open")}>Reopen</Button>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Responses ({rfi.responses?.length || 0})</h4>
            {rfi.responses?.map((response) => (
              <Card key={response.id} className={cn(response.isOfficial && "border-primary/50 bg-primary/5")}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{response.createdByName || "Unknown"}</span>
                    {response.isOfficial && <Badge className="text-xs bg-primary/10 text-primary">Official</Badge>}
                    {response.createdAt && <span className="text-xs text-muted-foreground">{format(new Date(response.createdAt), "MMM d, yyyy h:mm a")}</span>}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{response.responseText}</p>
                  {response.attachments && Array.isArray(response.attachments) && response.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {response.attachments.map((att: { name: string; url: string }, idx: number) => (
                        <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Download className="h-3 w-3" /> {att.name}
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {rfi.status !== "Closed" && (
              <div className="space-y-2">
                <Textarea
                  value={newResponse}
                  onChange={(e) => setNewResponse(e.target.value)}
                  placeholder="Add a response..."
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} className="rounded" />
                    Mark as official response
                  </label>
                  <Button size="sm" onClick={handleAddResponse} disabled={responseMutation.isPending || !newResponse.trim()}>
                    {responseMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                    Send Response
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
