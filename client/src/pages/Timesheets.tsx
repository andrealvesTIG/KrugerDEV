import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { 
  useTimesheetEntries, 
  useAssignedTasks, 
  useCurrentUserResource,
  useBulkUpsertTimesheetEntries,
  useSubmitTimesheetWeek,
  useTimesheetEntriesForApproval,
  useApproveTimesheetEntry,
  useRejectTimesheetEntry,
  type TimesheetEntryWithDetails 
} from "@/hooks/use-timesheets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Calendar, 
  Send, 
  Check, 
  X, 
  MessageSquare,
  Loader2,
  AlertCircle,
  CalendarDays,
  FolderOpen,
  StickyNote
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isToday, parseISO, isSameDay, startOfDay, endOfDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import type { Task, Project, InsertTimesheetEntry } from "@shared/schema";

type ViewMode = "workweek" | "week" | "day";

function getWorkWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  return [0, 1, 2, 3, 4].map(d => addDays(start, d)); // Mon-Fri
}

function getWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  return [0, 1, 2, 3, 4, 5, 6].map(d => addDays(start, d)); // Mon-Sun
}

function getDayDate(date: Date): Date[] {
  return [startOfDay(date)];
}

function formatDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

interface TaskRowProps {
  task: Task;
  project: Project;
  dates: Date[];
  entries: TimesheetEntryWithDetails[];
  gridData: Record<string, Record<string, { hours: string; notes: string; id?: number }>>;
  handleHoursChange: (taskId: number, dateKey: string, value: string) => void;
  getRowTotal: (taskId: number) => number;
  openNoteEditor: (taskId: number, dateKey: string) => void;
  index: number;
  indented?: boolean;
}

function TaskRow({ task, project, dates, entries, gridData, handleHoursChange, getRowTotal, openNoteEditor, index, indented }: TaskRowProps) {
  return (
    <motion.tr 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="border-t border-border hover:bg-muted/30 transition-colors"
    >
      <td className={`p-3 sticky left-0 bg-card z-10 ${indented ? 'pl-8' : ''}`}>
        <div className="font-medium text-foreground truncate max-w-[180px]" title={task.name}>
          {task.name}
        </div>
        {!indented && (
          <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={project.name}>
            {project.name}
          </div>
        )}
      </td>
      {dates.map(date => {
        const dateKey = formatDateKey(date);
        const entry = entries.find(e => e.taskId === task.id && e.entryDate === dateKey);
        const status = entry?.status;
        const isEditable = !status || status === "Draft" || status === "Rejected";
        const hasNote = !!(gridData[task.id]?.[dateKey]?.notes);
        
        return (
          <td key={dateKey} className={`p-2 text-center ${isToday(date) ? "bg-primary/5" : ""}`}>
            <div className="relative group">
              <Input
                type="text"
                inputMode="decimal"
                value={gridData[task.id]?.[dateKey]?.hours || ""}
                onChange={(e) => handleHoursChange(task.id, dateKey, e.target.value)}
                placeholder="0"
                disabled={!isEditable}
                className={`w-full text-center h-9 pr-7 ${
                  !isEditable ? "bg-muted cursor-not-allowed" : ""
                } ${status === "Approved" ? "border-green-500/50" : ""} ${
                  status === "Rejected" ? "border-red-500/50" : ""
                }`}
                data-testid={`input-hours-${task.id}-${dateKey}`}
              />
              {status && status !== "Draft" && (
                <div className="absolute -top-1 -right-1">
                  {status === "Approved" && <Check className="h-3 w-3 text-green-500" />}
                  {status === "Submitted" && <Clock className="h-3 w-3 text-amber-500" />}
                  {status === "Rejected" && <X className="h-3 w-3 text-red-500" />}
                </div>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openNoteEditor(task.id, dateKey)}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-opacity ${
                      hasNote ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-60 text-muted-foreground'
                    }`}
                    data-testid={`button-note-${task.id}-${dateKey}`}
                  >
                    <StickyNote className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {hasNote ? gridData[task.id]?.[dateKey]?.notes : "Add note"}
                </TooltipContent>
              </Tooltip>
            </div>
          </td>
        );
      })}
      <td className="p-3 text-center font-medium bg-muted/30 tabular-nums">
        {getRowTotal(task.id).toFixed(1)}
      </td>
    </motion.tr>
  );
}

interface TimesheetGridProps {
  dates: Date[];
  assignedTasks: { task: Task; project: Project }[];
  entries: TimesheetEntryWithDetails[];
  onSave: (data: Record<string, Record<string, { hours: number; notes: string; id?: number }>>) => void;
  isSaving: boolean;
  viewMode: ViewMode;
  groupByProject: boolean;
}

function TimesheetGrid({ dates, assignedTasks, entries, onSave, isSaving, viewMode, groupByProject }: TimesheetGridProps) {
  const [gridData, setGridData] = useState<Record<string, Record<string, { hours: string; notes: string; id?: number }>>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [editingNote, setEditingNote] = useState<{ taskId: number; dateKey: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());

  useEffect(() => {
    const data: Record<string, Record<string, { hours: string; notes: string; id?: number }>> = {};
    for (const { task } of assignedTasks) {
      data[task.id] = {};
      for (const date of dates) {
        const dateKey = formatDateKey(date);
        const entry = entries.find(e => e.taskId === task.id && e.entryDate === dateKey);
        data[task.id][dateKey] = {
          hours: entry ? String(Number(entry.hours)) : "",
          notes: entry?.notes || "",
          id: entry?.id
        };
      }
    }
    setGridData(data);
    setHasChanges(false);
  }, [entries, assignedTasks, dates]);

  const handleHoursChange = (taskId: number, dateKey: string, value: string) => {
    const numValue = value.replace(/[^0-9.]/g, "");
    setGridData(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [dateKey]: { ...prev[taskId]?.[dateKey], hours: numValue }
      }
    }));
    setHasChanges(true);
  };

  const handleNoteSave = (taskId: number, dateKey: string) => {
    setGridData(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [dateKey]: { ...prev[taskId]?.[dateKey], notes: noteText }
      }
    }));
    setHasChanges(true);
    setEditingNote(null);
    setNoteText("");
  };

  const openNoteEditor = (taskId: number, dateKey: string) => {
    setNoteText(gridData[taskId]?.[dateKey]?.notes || "");
    setEditingNote({ taskId, dateKey });
  };

  // Group tasks by project
  const groupedTasks = useMemo(() => {
    if (!groupByProject) return null;
    const groups: Record<number, { project: Project; tasks: { task: Task; project: Project }[] }> = {};
    for (const item of assignedTasks) {
      if (!groups[item.project.id]) {
        groups[item.project.id] = { project: item.project, tasks: [] };
      }
      groups[item.project.id].tasks.push(item);
    }
    return Object.values(groups);
  }, [assignedTasks, groupByProject]);

  const toggleProjectCollapse = (projectId: number) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleSave = () => {
    const formattedData: Record<string, Record<string, { hours: number; notes: string; id?: number }>> = {};
    for (const taskId in gridData) {
      formattedData[taskId] = {};
      for (const dateKey in gridData[taskId]) {
        const { hours, notes, id } = gridData[taskId][dateKey];
        formattedData[taskId][dateKey] = {
          hours: hours ? parseFloat(hours) : 0,
          notes,
          id
        };
      }
    }
    onSave(formattedData);
    setHasChanges(false);
  };

  const getRowTotal = (taskId: number): number => {
    if (!gridData[taskId]) return 0;
    return Object.values(gridData[taskId]).reduce((sum, { hours }) => sum + (parseFloat(hours) || 0), 0);
  };

  const getColumnTotal = (dateKey: string): number => {
    return Object.values(gridData).reduce((sum, taskData) => {
      return sum + (parseFloat(taskData[dateKey]?.hours) || 0);
    }, 0);
  };

  const getGrandTotal = (): number => {
    return Object.values(gridData).reduce((sum, taskData) => {
      return sum + Object.values(taskData).reduce((s, { hours }) => s + (parseFloat(hours) || 0), 0);
    }, 0);
  };

  if (assignedTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No Tasks Assigned</h3>
        <p className="text-muted-foreground max-w-md">
          You don't have any tasks assigned to you yet. Contact your project manager to get assigned to tasks, then you can log time against them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground min-w-[200px] sticky left-0 bg-muted/50 z-10">
                Task / Project
              </th>
              {dates.map(date => (
                <th key={formatDateKey(date)} className={`p-3 text-center font-medium min-w-[100px] ${
                  isToday(date) ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}>
                  <div className="text-xs uppercase">{format(date, "EEE")}</div>
                  <div className={`text-sm ${isToday(date) ? "font-bold" : ""}`}>
                    {format(date, "MMM d")}
                  </div>
                </th>
              ))}
              <th className="p-3 text-center font-medium text-muted-foreground min-w-[80px] bg-muted/30">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {groupByProject && groupedTasks ? (
              groupedTasks.map((group, groupIndex) => {
                const isCollapsed = collapsedProjects.has(group.project.id);
                return (
                  <React.Fragment key={`group-${group.project.id}`}>
                    <tr 
                      className="bg-muted/70 border-t border-border cursor-pointer hover:bg-muted/90 transition-colors"
                      onClick={() => toggleProjectCollapse(group.project.id)}
                      data-testid={`row-project-header-${group.project.id}`}
                    >
                      <td colSpan={dates.length + 2} className="p-2 sticky left-0 z-10">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <motion.div
                            animate={{ rotate: isCollapsed ? -90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </motion.div>
                          <FolderOpen className="h-4 w-4 text-primary" />
                          {group.project.name}
                          <Badge variant="secondary" className="text-xs">
                            {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                          </Badge>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {!isCollapsed && group.tasks.map(({ task, project }, index) => (
                        <TaskRow 
                          key={task.id}
                          task={task}
                          project={project}
                          dates={dates}
                          entries={entries}
                          gridData={gridData}
                          handleHoursChange={handleHoursChange}
                          getRowTotal={getRowTotal}
                          openNoteEditor={openNoteEditor}
                          index={groupIndex * 10 + index}
                          indented
                        />
                      ))}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })
            ) : (
              assignedTasks.map(({ task, project }, index) => (
                <TaskRow 
                  key={task.id}
                  task={task}
                  project={project}
                  dates={dates}
                  entries={entries}
                  gridData={gridData}
                  handleHoursChange={handleHoursChange}
                  getRowTotal={getRowTotal}
                  openNoteEditor={openNoteEditor}
                  index={index}
                />
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50 font-medium">
              <td className="p-3 text-right sticky left-0 bg-muted/50 z-10">Daily Total</td>
              {dates.map(date => {
                const dateKey = formatDateKey(date);
                const total = getColumnTotal(dateKey);
                return (
                  <td key={dateKey} className={`p-3 text-center tabular-nums ${
                    isToday(date) ? "bg-primary/10" : ""
                  } ${total > 8 ? "text-amber-600" : ""}`}>
                    {total.toFixed(1)}
                  </td>
                );
              })}
              <td className="p-3 text-center font-bold bg-primary/10 text-primary tabular-nums">
                {getGrandTotal().toFixed(1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isSaving}
          data-testid="button-save-timesheet"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Draft"
          )}
        </Button>
      </div>

      {/* Note editing dialog */}
      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-primary" />
              Add Note
            </DialogTitle>
            <DialogDescription>
              Add a note to describe what you worked on
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What did you work on?"
              className="min-h-[100px]"
              data-testid="input-entry-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNote(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => editingNote && handleNoteSave(editingNote.taskId, editingNote.dateKey)}
              data-testid="button-save-note"
            >
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApprovalTab() {
  const { currentOrganization } = useOrganization();
  const { data: entries, isLoading } = useTimesheetEntriesForApproval(currentOrganization?.id || null, "Submitted");
  const approveEntry = useApproveTimesheetEntry();
  const rejectEntry = useRejectTimesheetEntry();
  const [rejectDialog, setRejectDialog] = useState<{ id: number; open: boolean }>({ id: 0, open: false });
  const [rejectionReason, setRejectionReason] = useState("");
  const { toast } = useToast();

  const handleApprove = async (id: number) => {
    try {
      await approveEntry.mutateAsync(id);
      toast({ title: "Approved", description: "Timesheet entry has been approved" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to approve entry", variant: "destructive" });
    }
  };

  const handleReject = async () => {
    try {
      await rejectEntry.mutateAsync({ id: rejectDialog.id, rejectionReason });
      setRejectDialog({ id: 0, open: false });
      setRejectionReason("");
      toast({ title: "Rejected", description: "Timesheet entry has been rejected" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to reject entry", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Check className="h-12 w-12 text-green-500 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">All Caught Up</h3>
        <p className="text-muted-foreground">No timesheets pending approval</p>
      </div>
    );
  }

  const groupedByUser = entries.reduce((acc, entry) => {
    const key = entry.userId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, TimesheetEntryWithDetails[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedByUser).map(([userId, userEntries]) => {
        const resource = (userEntries[0] as any).resource;
        const totalHours = userEntries.reduce((sum, e) => sum + Number(e.hours), 0);
        
        return (
          <Card key={userId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                    {resource?.displayName?.charAt(0) || "?"}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{resource?.displayName || "Unknown"}</CardTitle>
                    <p className="text-sm text-muted-foreground">{totalHours.toFixed(1)} hours pending</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => userEntries.forEach(e => handleApprove(e.id))}
                    data-testid={`button-approve-all-${userId}`}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Approve All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {userEntries.map(entry => (
                  <div 
                    key={entry.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-4 flex-wrap"
                  >
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-medium">{(entry as any).task?.name || "Unknown Task"}</div>
                      <div className="text-sm text-muted-foreground">
                        {(entry as any).project?.name || "Unknown Project"} • {entry.entryDate}
                      </div>
                      {entry.notes && (
                        <div className="text-sm text-muted-foreground mt-1 flex items-start gap-1">
                          <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-1">{entry.notes}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium text-lg">{Number(entry.hours).toFixed(1)}h</span>
                      <div className="flex gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleApprove(entry.id)}
                          data-testid={`button-approve-${entry.id}`}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRejectDialog({ id: entry.id, open: true })}
                          data-testid={`button-reject-${entry.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ ...rejectDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Timesheet Entry</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this timesheet entry. The user will be notified and can resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reason">Rejection Reason</Label>
            <Textarea
              id="reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Please provide a reason..."
              className="mt-2"
              data-testid="input-rejection-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ id: 0, open: false })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} data-testid="button-confirm-reject">
              Reject Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Timesheets() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [viewMode, setViewMode] = useState<ViewMode>("workweek");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("log");
  const [groupByProject, setGroupByProject] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const { toast } = useToast();

  const dates = useMemo(() => {
    switch (viewMode) {
      case "workweek": return getWorkWeekDates(currentDate);
      case "week": return getWeekDates(currentDate);
      case "day": return getDayDate(currentDate);
    }
  }, [viewMode, currentDate]);

  const startDate = formatDateKey(dates[0]);
  const endDate = formatDateKey(dates[dates.length - 1]);

  const { data: entries = [], isLoading: entriesLoading } = useTimesheetEntries(
    user?.id, 
    currentOrganization?.id || null, 
    startDate, 
    endDate
  );
  
  const { data: assignedTasks = [], isLoading: tasksLoading } = useAssignedTasks(
    currentOrganization?.id || null, 
    user?.id
  );

  const { data: currentResource } = useCurrentUserResource(currentOrganization?.id || null, user?.id);

  const bulkUpsert = useBulkUpsertTimesheetEntries();
  const submitWeek = useSubmitTimesheetWeek();

  const navigateDate = (direction: "prev" | "next") => {
    if (viewMode === "day") {
      setCurrentDate(prev => direction === "prev" ? addDays(prev, -1) : addDays(prev, 1));
    } else {
      setCurrentDate(prev => direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleSave = async (data: Record<string, Record<string, { hours: number; notes: string; id?: number }>>) => {
    if (!currentOrganization || !currentResource) return;

    const entriesToUpsert: (InsertTimesheetEntry & { id?: number })[] = [];
    
    for (const taskId in data) {
      const taskData = assignedTasks.find(t => t.task.id === Number(taskId));
      if (!taskData) continue;

      for (const dateKey in data[taskId]) {
        const { hours, notes, id } = data[taskId][dateKey];
        if (hours > 0 || id) {
          entriesToUpsert.push({
            id,
            organizationId: currentOrganization.id,
            userId: user!.id,
            resourceId: currentResource.id,
            taskId: Number(taskId),
            projectId: taskData.project.id,
            entryDate: dateKey,
            hours: String(hours),
            notes,
          });
        }
      }
    }

    try {
      await bulkUpsert.mutateAsync(entriesToUpsert);
      toast({ title: "Saved", description: "Your timesheet has been saved" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to save timesheet", variant: "destructive" });
    }
  };

  const handleSubmitWeek = async () => {
    if (!currentOrganization) return;
    try {
      await submitWeek.mutateAsync({
        organizationId: currentOrganization.id,
        startDate,
        endDate
      });
      toast({ title: "Submitted", description: "Your timesheet has been submitted for approval" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to submit timesheet", variant: "destructive" });
    }
  };

  const hasDraftEntries = entries.some(e => e.status === "Draft");
  const isLoading = entriesLoading || tasksLoading;

  const getDateRangeLabel = () => {
    if (viewMode === "day") {
      return format(dates[0], "EEEE, MMMM d, yyyy");
    }
    return `${format(dates[0], "MMM d")} - ${format(dates[dates.length - 1], "MMM d, yyyy")}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />
            Timesheets
          </h1>
          <p className="mt-1 text-muted-foreground">
            Log your time against assigned tasks
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="log" className="flex items-center gap-2" data-testid="tab-log-hours">
            <Clock className="h-4 w-4" />
            Log Hours
          </TabsTrigger>
          {currentResource?.isApprover && (
            <TabsTrigger value="approve" className="flex items-center gap-2" data-testid="tab-approvals">
              <Check className="h-4 w-4" />
              Approvals
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="log" className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => navigateDate("prev")}
                    data-testid="button-prev-period"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={goToToday}
                    data-testid="button-today"
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Today
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => navigateDate("next")}
                    data-testid="button-next-period"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  
                  {/* Date picker to jump to specific date */}
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="gap-2" data-testid="button-jump-to-date">
                        <Calendar className="h-4 w-4" />
                        {getDateRangeLabel()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={currentDate}
                        onSelect={(date) => {
                          if (date) {
                            setCurrentDate(date);
                            setDatePickerOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Group by project toggle */}
                  <Button
                    variant={groupByProject ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGroupByProject(!groupByProject)}
                    className="gap-2"
                    data-testid="button-group-by-project"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Group by Project
                  </Button>

                  <div className="flex rounded-lg border border-border p-1 bg-muted/50">
                    <Button
                      variant={viewMode === "day" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("day")}
                      className="h-7 px-3"
                      data-testid="button-view-day"
                    >
                      Day
                    </Button>
                    <Button
                      variant={viewMode === "workweek" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("workweek")}
                      className="h-7 px-3"
                      data-testid="button-view-workweek"
                    >
                      Work Week
                    </Button>
                    <Button
                      variant={viewMode === "week" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("week")}
                      className="h-7 px-3"
                      data-testid="button-view-week"
                    >
                      Week
                    </Button>
                  </div>

                  {hasDraftEntries && viewMode !== "day" && (
                    <Button 
                      onClick={handleSubmitWeek}
                      disabled={submitWeek.isPending}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="button-submit-week"
                    >
                      {submitWeek.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Submit for Approval
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${startDate}-${endDate}-${viewMode}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TimesheetGrid
                      dates={dates}
                      assignedTasks={assignedTasks}
                      entries={entries}
                      onSave={handleSave}
                      isSaving={bulkUpsert.isPending}
                      viewMode={viewMode}
                      groupByProject={groupByProject}
                    />
                  </motion.div>
                </AnimatePresence>
              )}
            </CardContent>
          </Card>

          {entries.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Entry Status Legend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border border-border" />
                    <span className="text-sm text-muted-foreground">Draft (editable)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-muted-foreground">Submitted (pending approval)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">Approved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <X className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-muted-foreground">Rejected (editable)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {currentResource?.isApprover && (
          <TabsContent value="approve" className="mt-6">
            <ApprovalTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
