import { useState } from "react";
import { useMeetings, useMeetingActionItems, useCreateMeeting, useUpdateMeeting, useDeleteMeeting, useCreateActionItem, useUpdateActionItem, useDeleteActionItem } from "@/hooks/use-meetings";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Pencil, Trash2, MoreVertical, Calendar, MapPin, Users, Clock, CheckCircle, Circle, AlertCircle, ListTodo, ChevronDown, ChevronUp, Search, Download } from "lucide-react";

type ViewMode = "list" | "action-items";

interface AgendaItemData {
  title: string;
  description: string;
  presenter: string;
  duration: string;
}

function emptyAgendaItem(): AgendaItemData {
  return { title: "", description: "", presenter: "", duration: "" };
}

export default function MeetingsTab({ projectId }: { projectId: number }) {
  const { data: meetings, isLoading } = useMeetings(projectId);
  const { data: allActionItems } = useMeetingActionItems(projectId);
  const createMutation = useCreateMeeting();
  const updateMutation = useUpdateMeeting();
  const deleteMutation = useDeleteMeeting();
  const createActionMutation = useCreateActionItem();
  const updateActionMutation = useUpdateActionItem();
  const deleteActionMutation = useDeleteActionItem();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Record<string, unknown> | null>(null);
  const [detailMeeting, setDetailMeeting] = useState<Record<string, unknown> | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTimeframe, setFilterTimeframe] = useState("all");
  const [actionFilterStatus, setActionFilterStatus] = useState("all");
  const [actionFilterAssignee, setActionFilterAssignee] = useState("all");

  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formType, setFormType] = useState("General");
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formAttendees, setFormAttendees] = useState("");
  const [formAgendaItems, setFormAgendaItems] = useState<AgendaItemData[]>([emptyAgendaItem()]);

  const [isMinutesOpen, setIsMinutesOpen] = useState(false);
  const [minutesMeetingId, setMinutesMeetingId] = useState<number | null>(null);
  const [minutesNotes, setMinutesNotes] = useState("");
  const [minutesAgendaItems, setMinutesAgendaItems] = useState<{ id: number; title: string; notes: string }[]>([]);

  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [actionMeetingId, setActionMeetingId] = useState<number | null>(null);
  const [actionTitle, setActionTitle] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [actionAssignee, setActionAssignee] = useState("");
  const [actionDueDate, setActionDueDate] = useState("");
  const [actionPriority, setActionPriority] = useState("Medium");

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormType("General");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormStartTime("");
    setFormEndTime("");
    setFormLocation("");
    setFormAttendees("");
    setFormAgendaItems([emptyAgendaItem()]);
    setEditingMeeting(null);
  };

  const openCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = async (meeting: Record<string, unknown>) => {
    setEditingMeeting(meeting);
    setFormTitle(meeting.title as string);
    setFormDescription((meeting.description as string) || "");
    setFormType((meeting.meetingType as string) || "General");
    setFormDate(meeting.date as string);
    setFormStartTime((meeting.startTime as string) || "");
    setFormEndTime((meeting.endTime as string) || "");
    setFormLocation((meeting.location as string) || "");
    setFormAttendees((meeting.attendees as string) || "");
    setFormAgendaItems([emptyAgendaItem()]);
    setIsDialogOpen(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meeting.id}`);
      if (res.ok) {
        const detail = await res.json();
        if (detail.agendaItems && detail.agendaItems.length > 0) {
          setFormAgendaItems(detail.agendaItems.map((ai: Record<string, unknown>) => ({
            title: (ai.title as string) || "",
            description: (ai.description as string) || "",
            presenter: (ai.presenter as string) || "",
            duration: String(ai.duration || ""),
          })));
        }
      }
    } catch {}
  };

  const openDetail = async (meeting: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meeting.id}`);
      if (res.ok) {
        const detail = await res.json();
        setDetailMeeting(detail);
        setIsDetailOpen(true);
      }
    } catch {
      setDetailMeeting(meeting);
      setIsDetailOpen(true);
    }
  };

  const handleSubmit = () => {
    if (!formTitle.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    const validAgenda = formAgendaItems.filter(ai => ai.title.trim());
    const data: Record<string, unknown> = {
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      meetingType: formType,
      date: formDate,
      startTime: formStartTime || null,
      endTime: formEndTime || null,
      location: formLocation.trim() || null,
      attendees: formAttendees.trim() || null,
      agendaItems: validAgenda.map((ai, idx) => ({
        title: ai.title.trim(),
        description: ai.description.trim() || null,
        presenter: ai.presenter.trim() || null,
        duration: ai.duration ? parseInt(ai.duration) : null,
        sortOrder: idx,
      })),
    };

    if (editingMeeting) {
      updateMutation.mutate({ projectId, meetingId: editingMeeting.id as number, data }, {
        onSuccess: () => { setIsDialogOpen(false); resetForm(); },
      });
    } else {
      createMutation.mutate({ projectId, data }, {
        onSuccess: () => { setIsDialogOpen(false); resetForm(); },
      });
    }
  };

  const handleRecordMinutes = async (meeting: Record<string, unknown>) => {
    setMinutesMeetingId(meeting.id as number);
    setMinutesNotes((meeting.minutesNotes as string) || "");
    try {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meeting.id}`);
      if (res.ok) {
        const detail = await res.json();
        if (detail.agendaItems && detail.agendaItems.length > 0) {
          setMinutesAgendaItems(detail.agendaItems.map((ai: Record<string, unknown>) => ({
            id: ai.id as number,
            title: ai.title as string,
            notes: (ai.notes as string) || "",
          })));
        } else {
          setMinutesAgendaItems([]);
        }
      }
    } catch {
      setMinutesAgendaItems([]);
    }
    setIsMinutesOpen(true);
  };

  const saveMinutes = () => {
    if (minutesMeetingId === null) return;
    const agendaItemNotes = minutesAgendaItems
      .filter(ai => ai.notes.trim())
      .map(ai => ({ id: ai.id, notes: ai.notes.trim() }));
    updateMutation.mutate({
      projectId,
      meetingId: minutesMeetingId,
      data: {
        minutesNotes,
        status: "Completed",
        ...(agendaItemNotes.length > 0 ? { agendaItemNotes } : {}),
      },
    }, {
      onSuccess: () => { setIsMinutesOpen(false); setMinutesMeetingId(null); setMinutesAgendaItems([]); },
    });
  };

  const exportMinutesPdf = async (meeting: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/meetings/${meeting.id}`);
      if (!res.ok) return;
      const detail = await res.json();
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(16);
      doc.text(`Meeting Minutes: ${detail.title}`, 14, y);
      y += 10;
      doc.setFontSize(10);
      doc.text(`${detail.meetingNumber || ""} | ${detail.date} | ${detail.meetingType || "General"}`, 14, y);
      y += 6;
      if (detail.location) { doc.text(`Location: ${detail.location}`, 14, y); y += 6; }
      if (detail.attendees) { doc.text(`Attendees: ${detail.attendees}`, 14, y); y += 6; }
      y += 4;
      if (detail.agendaItems?.length) {
        doc.setFontSize(12);
        doc.text("Agenda", 14, y); y += 8;
        doc.setFontSize(10);
        for (const [idx, ai] of detail.agendaItems.entries()) {
          doc.text(`${idx + 1}. ${ai.title}${ai.presenter ? ` (${ai.presenter})` : ""}${ai.duration ? ` - ${ai.duration} min` : ""}`, 14, y);
          y += 6;
          if (ai.notes) {
            const lines = doc.splitTextToSize(`   Notes: ${ai.notes}`, 180);
            doc.text(lines, 14, y);
            y += lines.length * 5;
          }
          if (y > 270) { doc.addPage(); y = 20; }
        }
        y += 4;
      }
      if (detail.minutesNotes) {
        doc.setFontSize(12);
        doc.text("General Minutes", 14, y); y += 8;
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(detail.minutesNotes, 180);
        doc.text(lines, 14, y);
        y += lines.length * 5;
      }
      if (detail.actionItems?.length) {
        if (y > 240) { doc.addPage(); y = 20; }
        y += 4;
        doc.setFontSize(12);
        doc.text("Action Items", 14, y); y += 8;
        doc.setFontSize(10);
        for (const ai of detail.actionItems) {
          doc.text(`- [${ai.status}] ${ai.title}${ai.assignee ? ` (${ai.assignee})` : ""}${ai.dueDate ? ` Due: ${ai.dueDate}` : ""}`, 14, y);
          y += 6;
          if (y > 270) { doc.addPage(); y = 20; }
        }
      }
      doc.save(`${detail.meetingNumber || "meeting"}_minutes.pdf`);
      toast({ title: "PDF exported successfully" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const openAddAction = (meetingId: number) => {
    setActionMeetingId(meetingId);
    setActionTitle("");
    setActionDescription("");
    setActionAssignee("");
    setActionDueDate("");
    setActionPriority("Medium");
    setIsActionDialogOpen(true);
  };

  const handleCreateAction = () => {
    if (!actionTitle.trim() || !actionMeetingId) return;
    createActionMutation.mutate({
      projectId,
      meetingId: actionMeetingId,
      data: {
        title: actionTitle.trim(),
        description: actionDescription.trim() || null,
        assignee: actionAssignee.trim() || null,
        dueDate: actionDueDate || null,
        priority: actionPriority,
      },
    }, {
      onSuccess: () => { setIsActionDialogOpen(false); },
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ projectId, meetingId: deleteTarget.id as number }, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Scheduled": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "In Progress": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "Completed": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "Cancelled": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const actionStatusColor = (status: string) => {
    switch (status) {
      case "Open": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "In Progress": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "Completed": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "Overdue": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const today = new Date().toISOString().split("T")[0];

  const filteredMeetings = (meetings as Record<string, unknown>[] || []).filter(m => {
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (filterTimeframe === "upcoming" && (m.date as string) < today) return false;
    if (filterTimeframe === "past" && (m.date as string) >= today) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (m.title as string).toLowerCase().includes(term) ||
        ((m.location as string) || "").toLowerCase().includes(term) ||
        ((m.meetingNumber as string) || "").toLowerCase().includes(term);
    }
    return true;
  });

  const allItems = (allActionItems as Record<string, unknown>[] || []);
  const uniqueAssignees = [...new Set(allItems.map(i => (i.assignee as string) || "").filter(Boolean))];

  const filteredActionItems = allItems.filter(item => {
    if (actionFilterStatus !== "all" && item.status !== actionFilterStatus) return false;
    if (actionFilterAssignee !== "all" && (item.assignee as string) !== actionFilterAssignee) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (item.title as string).toLowerCase().includes(term) ||
        ((item.assignee as string) || "").toLowerCase().includes(term);
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
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <Calendar className="mr-1 h-4 w-4" />Meetings
          </Button>
          <Button
            variant={viewMode === "action-items" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("action-items")}
          >
            <ListTodo className="mr-1 h-4 w-4" />Action Items
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-8 w-48" />
          </div>
          {viewMode === "list" && (
            <>
              <Select value={filterTimeframe} onValueChange={setFilterTimeframe}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="past">Past</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          {viewMode === "action-items" && (
            <>
              <Select value={actionFilterStatus} onValueChange={setActionFilterStatus}>
                <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              {uniqueAssignees.length > 0 && (
                <Select value={actionFilterAssignee} onValueChange={setActionFilterAssignee}>
                  <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assignees</SelectItem>
                    {uniqueAssignees.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />New Meeting
          </Button>
        </div>
      </div>

      {viewMode === "list" && (
        <div className="space-y-3">
          {filteredMeetings.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No meetings found. Create one to get started.</CardContent></Card>
          ) : filteredMeetings.map((meeting) => (
            <Card key={meeting.id as number} className="hover:shadow-sm transition-shadow cursor-pointer" onClick={() => openDetail(meeting)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground font-mono">{meeting.meetingNumber as string}</span>
                      <Badge className={statusColor(meeting.status as string)} variant="secondary">{meeting.status as string}</Badge>
                      <Badge variant="outline">{meeting.meetingType as string}</Badge>
                    </div>
                    <h3 className="font-semibold truncate">{meeting.title as string}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{meeting.date as string}</span>
                      {meeting.startTime && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{meeting.startTime as string}{meeting.endTime ? ` - ${meeting.endTime as string}` : ""}</span>}
                      {meeting.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{meeting.location as string}</span>}
                      {meeting.attendees && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{(meeting.attendees as string).split(",").length} attendees</span>}
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(meeting)}>
                          <Pencil className="mr-2 h-4 w-4" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRecordMinutes(meeting)}>
                          <ListTodo className="mr-2 h-4 w-4" />Record Minutes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAddAction(meeting.id as number)}>
                          <Plus className="mr-2 h-4 w-4" />Add Action Item
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportMinutesPdf(meeting)}>
                          <Download className="mr-2 h-4 w-4" />Export PDF
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(meeting)}>
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
      )}

      {viewMode === "action-items" && (
        <div className="space-y-3">
          {filteredActionItems.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No action items found.</CardContent></Card>
          ) : filteredActionItems.map((item) => (
            <Card key={item.id as number}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={actionStatusColor(item.status as string)} variant="secondary">{item.status as string}</Badge>
                      {item.priority && <Badge variant="outline">{item.priority as string}</Badge>}
                    </div>
                    <h3 className="font-semibold">{item.title as string}</h3>
                    {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description as string}</p>}
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      {item.assignee && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{item.assignee as string}</span>}
                      {item.dueDate && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Due: {item.dueDate as string}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(item.status as string) !== "Completed" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => updateActionMutation.mutate({
                          projectId, meetingId: item.meetingId as number, actionItemId: item.id as number,
                          data: { status: "Completed" },
                        })}>
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Meeting Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-sm">{detailMeeting?.meetingNumber as string}</span>
              {detailMeeting?.title as string}
            </DialogTitle>
          </DialogHeader>
          {detailMeeting && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={statusColor(detailMeeting.status as string)} variant="secondary">{detailMeeting.status as string}</Badge>
                <Badge variant="outline">{detailMeeting.meetingType as string}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {detailMeeting.date as string}</div>
                {detailMeeting.startTime && <div><span className="text-muted-foreground">Time:</span> {detailMeeting.startTime as string}{detailMeeting.endTime ? ` - ${detailMeeting.endTime as string}` : ""}</div>}
                {detailMeeting.location && <div><span className="text-muted-foreground">Location:</span> {detailMeeting.location as string}</div>}
                {detailMeeting.attendees && <div className="col-span-2"><span className="text-muted-foreground">Attendees:</span> {detailMeeting.attendees as string}</div>}
              </div>

              {detailMeeting.description && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Description</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailMeeting.description as string}</p>
                </div>
              )}

              {(detailMeeting.agendaItems as Record<string, unknown>[] | undefined)?.length ? (
                <div>
                  <h4 className="font-medium text-sm mb-2">Agenda</h4>
                  <div className="space-y-2">
                    {(detailMeeting.agendaItems as Record<string, unknown>[]).map((ai, idx) => (
                      <div key={ai.id as number} className="border rounded p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{idx + 1}</span>
                          <span className="font-medium text-sm">{ai.title as string}</span>
                          {ai.duration && <span className="text-xs text-muted-foreground">{ai.duration as number} min</span>}
                        </div>
                        {ai.presenter && <p className="text-xs text-muted-foreground mt-1">Presenter: {ai.presenter as string}</p>}
                        {ai.description && <p className="text-xs text-muted-foreground mt-1">{ai.description as string}</p>}
                        {ai.notes && <p className="text-xs mt-1 bg-muted/50 p-2 rounded">{ai.notes as string}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {detailMeeting.minutesNotes && (
                <div>
                  <h4 className="font-medium text-sm mb-1">Meeting Minutes</h4>
                  <div className="text-sm bg-muted/50 p-3 rounded whitespace-pre-wrap">{detailMeeting.minutesNotes as string}</div>
                </div>
              )}

              {(detailMeeting.actionItems as Record<string, unknown>[] | undefined)?.length ? (
                <div>
                  <h4 className="font-medium text-sm mb-2">Action Items</h4>
                  <div className="space-y-2">
                    {(detailMeeting.actionItems as Record<string, unknown>[]).map(ai => (
                      <div key={ai.id as number} className="border rounded p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className={actionStatusColor(ai.status as string)} variant="secondary">{ai.status as string}</Badge>
                            <span className="font-medium text-sm">{ai.title as string}</span>
                          </div>
                          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                            {ai.assignee && <span>Assigned: {ai.assignee as string}</span>}
                            {ai.dueDate && <span>Due: {ai.dueDate as string}</span>}
                          </div>
                        </div>
                        {(ai.status as string) !== "Completed" && (
                          <Button variant="ghost" size="sm" onClick={() => updateActionMutation.mutate({
                            projectId, meetingId: detailMeeting.id as number, actionItemId: ai.id as number,
                            data: { status: "Completed" },
                          })}>
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setIsDetailOpen(false); handleRecordMinutes(detailMeeting); }}>
                  Record Minutes
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setIsDetailOpen(false); openAddAction(detailMeeting.id as number); }}>
                  Add Action Item
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportMinutesPdf(detailMeeting)}>
                  <Download className="mr-1 h-4 w-4" />Export PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Meeting Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMeeting ? "Edit Meeting" : "New Meeting"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Title *</Label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Meeting title" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Standup">Standup</SelectItem>
                    <SelectItem value="Review">Review</SelectItem>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Retrospective">Retrospective</SelectItem>
                    <SelectItem value="Kickoff">Kickoff</SelectItem>
                    <SelectItem value="OAC">OAC</SelectItem>
                    <SelectItem value="Safety">Safety</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Room, address, or link" />
              </div>
              <div>
                <Label>Attendees</Label>
                <Input value={formAttendees} onChange={e => setFormAttendees(e.target.value)} placeholder="Comma-separated names" />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={2} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Agenda Items</Label>
                <Button variant="outline" size="sm" onClick={() => setFormAgendaItems([...formAgendaItems, emptyAgendaItem()])}>
                  <Plus className="mr-1 h-3 w-3" />Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {formAgendaItems.map((item, idx) => (
                  <div key={idx} className="border rounded p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{idx + 1}</span>
                      <Input placeholder="Agenda item title" value={item.title} onChange={e => {
                        const updated = [...formAgendaItems];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setFormAgendaItems(updated);
                      }} className="flex-1 h-8" />
                      <Input placeholder="Presenter" value={item.presenter} onChange={e => {
                        const updated = [...formAgendaItems];
                        updated[idx] = { ...updated[idx], presenter: e.target.value };
                        setFormAgendaItems(updated);
                      }} className="w-32 h-8" />
                      <Input placeholder="Min" value={item.duration} onChange={e => {
                        const updated = [...formAgendaItems];
                        updated[idx] = { ...updated[idx], duration: e.target.value };
                        setFormAgendaItems(updated);
                      }} className="w-16 h-8" type="number" />
                      {formAgendaItems.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          setFormAgendaItems(formAgendaItems.filter((_, i) => i !== idx));
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingMeeting ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Minutes Dialog */}
      <Dialog open={isMinutesOpen} onOpenChange={setIsMinutesOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Meeting Minutes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {minutesAgendaItems.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Notes per Agenda Item</Label>
                <div className="space-y-3 mt-2">
                  {minutesAgendaItems.map((ai, idx) => (
                    <div key={ai.id} className="border rounded p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{idx + 1}</span>
                        <span className="text-sm font-medium">{ai.title}</span>
                      </div>
                      <Textarea
                        value={ai.notes}
                        onChange={e => {
                          const updated = [...minutesAgendaItems];
                          updated[idx] = { ...updated[idx], notes: e.target.value };
                          setMinutesAgendaItems(updated);
                        }}
                        rows={2}
                        placeholder="Notes for this agenda item..."
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>General Minutes / Summary</Label>
              <Textarea value={minutesNotes} onChange={e => setMinutesNotes(e.target.value)} rows={6} placeholder="Enter overall meeting minutes, key decisions, and notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMinutesOpen(false)}>Cancel</Button>
            <Button onClick={saveMinutes} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Minutes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Action Item Dialog */}
      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Action Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={actionTitle} onChange={e => setActionTitle(e.target.value)} placeholder="Action item title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={actionDescription} onChange={e => setActionDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Assignee</Label>
                <Input value={actionAssignee} onChange={e => setActionAssignee(e.target.value)} placeholder="Name" />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={actionDueDate} onChange={e => setActionDueDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={actionPriority} onValueChange={setActionPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsActionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAction} disabled={createActionMutation.isPending}>
              {createActionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Meeting</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete "{deleteTarget?.title as string}"? This action cannot be undone.</p>
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
