import { useState } from "react";
import { useCorrespondence, useCreateCorrespondence, useUpdateCorrespondence, useDeleteCorrespondence } from "@/hooks/use-correspondence";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Pencil, Trash2, MoreVertical, Mail, FileText, Send, Bell, Calendar, Search, ArrowRight } from "lucide-react";

export default function CorrespondenceTab({ projectId }: { projectId: number }) {
  const { data: items, isLoading } = useCorrespondence(projectId);
  const createMutation = useCreateCorrespondence();
  const updateMutation = useUpdateCorrespondence();
  const deleteMutation = useDeleteCorrespondence();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [detailItem, setDetailItem] = useState<Record<string, unknown> | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [formType, setFormType] = useState<string>("Letter");
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formFromName, setFormFromName] = useState("");
  const [formFromEmail, setFormFromEmail] = useState("");
  const [formToName, setFormToName] = useState("");
  const [formToEmail, setFormToEmail] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formStatus, setFormStatus] = useState("Draft");
  const [formPriority, setFormPriority] = useState("Normal");
  const [formNotes, setFormNotes] = useState("");
  const [formAttachments, setFormAttachments] = useState("");

  const resetForm = () => {
    setFormType("Letter");
    setFormSubject("");
    setFormBody("");
    setFormFromName("");
    setFormFromEmail("");
    setFormToName("");
    setFormToEmail("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormStatus("Draft");
    setFormPriority("Normal");
    setFormNotes("");
    setFormAttachments("");
    setEditingItem(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (item: Record<string, unknown>) => {
    setEditingItem(item);
    setFormType((item.type as string) || "Letter");
    setFormSubject(item.subject as string);
    setFormBody((item.body as string) || "");
    setFormFromName((item.fromName as string) || "");
    setFormFromEmail((item.fromEmail as string) || "");
    setFormToName((item.toName as string) || "");
    setFormToEmail((item.toEmail as string) || "");
    setFormDate(item.date as string);
    setFormStatus((item.status as string) || "Draft");
    setFormPriority((item.priority as string) || "Normal");
    setFormNotes((item.notes as string) || "");
    setFormAttachments((item.attachments as string) || "");
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formSubject.trim()) {
      toast({ title: "Error", description: "Subject is required", variant: "destructive" });
      return;
    }

    const data: Record<string, unknown> = {
      type: formType,
      subject: formSubject.trim(),
      body: formBody.trim() || null,
      fromName: formFromName.trim() || null,
      fromEmail: formFromEmail.trim() || null,
      toName: formToName.trim() || null,
      toEmail: formToEmail.trim() || null,
      date: formDate,
      status: formStatus,
      priority: formPriority,
      notes: formNotes.trim() || null,
      attachments: formAttachments.trim() || null,
    };

    if (editingItem) {
      updateMutation.mutate({ projectId, correspondenceId: editingItem.id as number, data }, {
        onSuccess: () => { setIsDialogOpen(false); resetForm(); },
      });
    } else {
      createMutation.mutate({ projectId, data }, {
        onSuccess: () => { setIsDialogOpen(false); resetForm(); },
      });
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ projectId, correspondenceId: deleteTarget.id as number }, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "Email": return <Mail className="h-4 w-4" />;
      case "Transmittal": return <Send className="h-4 w-4" />;
      case "Notice": return <Bell className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "Email": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Transmittal": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "Notice": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Draft": return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
      case "Sent": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Received": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "Responded": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "Closed": return "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const filteredItems = (items as Record<string, unknown>[] || []).filter(item => {
    if (filterType !== "all" && item.type !== filterType) return false;
    if (filterDateFrom && (item.date as string) < filterDateFrom) return false;
    if (filterDateTo && (item.date as string) > filterDateTo) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (item.subject as string).toLowerCase().includes(term) ||
        ((item.correspondenceNumber as string) || "").toLowerCase().includes(term) ||
        ((item.fromName as string) || "").toLowerCase().includes(term) ||
        ((item.toName as string) || "").toLowerCase().includes(term);
    }
    return true;
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-8 w-48" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Letter">Letter</SelectItem>
              <SelectItem value="Email">Email</SelectItem>
              <SelectItem value="Transmittal">Transmittal</SelectItem>
              <SelectItem value="Notice">Notice</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 w-36" placeholder="From" title="From date" />
          <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 w-36" placeholder="To" title="To date" />
          {(filterDateFrom || filterDateTo) && (
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}>Clear</Button>
          )}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />New Correspondence
        </Button>
      </div>

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No correspondence found. Create one to get started.</CardContent></Card>
        ) : filteredItems.map((item) => (
          <Card key={item.id as number} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => { setDetailItem(item); setIsDetailOpen(true); }}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground font-mono">{item.correspondenceNumber as string}</span>
                    <Badge className={typeColor(item.type as string)} variant="secondary">
                      <span className="flex items-center gap-1">{typeIcon(item.type as string)}{item.type as string}</span>
                    </Badge>
                    <Badge className={statusColor(item.status as string)} variant="secondary">{item.status as string}</Badge>
                    {item.priority === "High" && <Badge variant="destructive">High</Badge>}
                    {item.priority === "Urgent" && <Badge variant="destructive">Urgent</Badge>}
                  </div>
                  <h3 className="font-semibold truncate">{item.subject as string}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{item.date as string}</span>
                    {Boolean(item.fromName || item.toName) && (
                      <span className="flex items-center gap-1">
                        {item.fromName as string}
                        {Boolean(item.fromName && item.toName) && <ArrowRight className="h-3 w-3" />}
                        {item.toName as string}
                      </span>
                    )}
                    {Boolean(item.attachments) && (
                      <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{(item.attachments as string).split(",").length} attachment(s)</span>
                    )}
                  </div>
                </div>
                <div onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(item)}>
                        <Pencil className="mr-2 h-4 w-4" />Edit
                      </DropdownMenuItem>
                      {item.status === "Draft" && (
                        <DropdownMenuItem onClick={() => updateMutation.mutate({ projectId, correspondenceId: item.id as number, data: { status: "Sent" } })}>
                          <Send className="mr-2 h-4 w-4" />Mark as Sent
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="mr-2 h-4 w-4" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-sm">{detailItem?.correspondenceNumber as string}</span>
              {detailItem?.subject as string}
            </DialogTitle>
            <DialogDescription className="sr-only">Correspondence details.</DialogDescription>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={typeColor(detailItem.type as string)} variant="secondary">
                  <span className="flex items-center gap-1">{typeIcon(detailItem.type as string)}{detailItem.type as string}</span>
                </Badge>
                <Badge className={statusColor(detailItem.status as string)} variant="secondary">{detailItem.status as string}</Badge>
                {detailItem.priority !== "Normal" && <Badge variant="outline">{detailItem.priority as string}</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {detailItem.date as string}</div>
                {Boolean(detailItem.fromName) && <div><span className="text-muted-foreground">From:</span> {detailItem.fromName as string}{detailItem.fromEmail ? ` <${detailItem.fromEmail as string}>` : ""}</div>}
                {Boolean(detailItem.toName) && <div><span className="text-muted-foreground">To:</span> {detailItem.toName as string}{detailItem.toEmail ? ` <${detailItem.toEmail as string}>` : ""}</div>}
              </div>

              {Boolean(detailItem.body) && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Body</h4>
                  <div className="text-sm bg-muted/50 p-3 rounded whitespace-pre-wrap">{detailItem.body as string}</div>
                </div>
              )}

              {Boolean(detailItem.attachments) && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Attachments</h4>
                  <div className="flex flex-wrap gap-2">
                    {(detailItem.attachments as string).split(",").map((att, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <FileText className="mr-1 h-3 w-3" />{att.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {Boolean(detailItem.notes) && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailItem.notes as string}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Correspondence" : "New Correspondence"}</DialogTitle>
            <DialogDescription className="sr-only">Create or edit a correspondence entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type *</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Letter">Letter</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                    <SelectItem value="Transmittal">Transmittal</SelectItem>
                    <SelectItem value="Notice">Notice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Subject *</Label>
                <Input value={formSubject} onChange={e => setFormSubject(e.target.value)} placeholder="Subject line" />
              </div>
              <div>
                <Label>From Name</Label>
                <Input value={formFromName} onChange={e => setFormFromName(e.target.value)} placeholder="Sender name" />
              </div>
              <div>
                <Label>From Email</Label>
                <Input value={formFromEmail} onChange={e => setFormFromEmail(e.target.value)} placeholder="sender@email.com" />
              </div>
              <div>
                <Label>To Name</Label>
                <Input value={formToName} onChange={e => setFormToName(e.target.value)} placeholder="Recipient name" />
              </div>
              <div>
                <Label>To Email</Label>
                <Input value={formToEmail} onChange={e => setFormToEmail(e.target.value)} placeholder="recipient@email.com" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                    <SelectItem value="Responded">Responded</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Body</Label>
                <Textarea value={formBody} onChange={e => setFormBody(e.target.value)} rows={6} placeholder="Correspondence body text..." />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} placeholder="Internal notes..." />
              </div>
              <div className="col-span-2">
                <Label>Attachments</Label>
                <Input value={formAttachments} onChange={e => setFormAttachments(e.target.value)} placeholder="Comma-separated file names or URLs" />
                <p className="text-xs text-muted-foreground mt-1">Enter file references (e.g., "contract.pdf, spec-rev2.docx")</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingItem ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Correspondence</DialogTitle>
            <DialogDescription className="sr-only">Confirm deletion of this correspondence entry.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete "{deleteTarget?.subject as string}"? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
