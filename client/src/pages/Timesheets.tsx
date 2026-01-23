import React, { useState, useMemo, useEffect, useRef } from "react";
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
import { MicrosoftContactCard } from "@/components/MicrosoftContactCard";
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
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon, 
  Send, 
  Check, 
  X, 
  MessageSquare,
  Loader2,
  AlertCircle,
  FolderOpen,
  StickyNote,
  TrendingUp,
  ListTodo,
  Trash2,
  History,
  Plus
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
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return [0, 1, 2, 3, 4].map(d => addDays(start, d));
}

function getWeekDates(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return [0, 1, 2, 3, 4, 5, 6].map(d => addDays(start, d));
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
  const rowTotal = getRowTotal(task.id);
  
  return (
    <motion.tr
      key={task.id}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className="border-t border-border/50 hover:bg-muted/20 transition-colors group"
    >
      <td className={`p-3 ${indented ? 'pl-10' : ''}`}>
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <span className="text-foreground">{task.name}</span>
          {!indented && (
            <span className="text-xs text-muted-foreground">({project.name})</span>
          )}
        </div>
      </td>
      {dates.map(date => {
        const dateKey = formatDateKey(date);
        const entry = entries.find(e => e.taskId === task.id && e.entryDate === dateKey);
        const status = entry?.status;
        const isEditable = !status || status === "Draft" || status === "Rejected";
        const hasNote = !!(gridData[task.id]?.[dateKey]?.notes);
        const isTodayDate = isToday(date);
        
        return (
          <td key={dateKey} className={`p-2 ${isTodayDate ? "bg-blue-500/5" : ""}`}>
            <div className="relative group/cell flex justify-center">
              <Input
                type="text"
                inputMode="decimal"
                value={gridData[task.id]?.[dateKey]?.hours || ""}
                onChange={(e) => handleHoursChange(task.id, dateKey, e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                disabled={!isEditable}
                className={`w-16 text-center h-9 rounded-lg border-2 ${
                  isTodayDate 
                    ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20" 
                    : "border-border bg-background"
                } ${!isEditable ? "opacity-60 cursor-not-allowed" : ""} 
                ${status === "Approved" ? "border-green-300" : ""} 
                ${status === "Rejected" ? "border-red-300" : ""}
                focus:ring-2 focus:ring-primary/20`}
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
                    className={`absolute -right-5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-opacity ${
                      hasNote ? 'opacity-100 text-primary' : 'opacity-0 group-hover/cell:opacity-60 text-muted-foreground'
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
      <td className="p-3 bg-emerald-500/5">
        <div className="flex items-center justify-center gap-2">
          <span className="font-medium text-foreground tabular-nums">{rowTotal}h</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
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
  gridData: Record<string, Record<string, { hours: string; notes: string; id?: number }>>;
  setGridData: React.Dispatch<React.SetStateAction<Record<string, Record<string, { hours: string; notes: string; id?: number }>>>>;
  hasChanges: boolean;
  setHasChanges: React.Dispatch<React.SetStateAction<boolean>>;
}

function TimesheetGrid({ dates, assignedTasks, entries, onSave, isSaving, viewMode, groupByProject, gridData, setGridData, hasChanges, setHasChanges }: TimesheetGridProps) {
  const [editingNote, setEditingNote] = useState<{ taskId: number; dateKey: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());

  // Initialize grid data for any new cells (tasks/dates not yet in gridData)
  useEffect(() => {
    setGridData(prevGridData => {
      const data = { ...prevGridData };
      let changed = false;
      
      for (const { task } of assignedTasks) {
        if (!data[task.id]) {
          data[task.id] = {};
          changed = true;
        }
        for (const date of dates) {
          const dateKey = formatDateKey(date);
          // Only initialize if this cell doesn't exist yet
          if (data[task.id][dateKey] === undefined) {
            const entry = entries.find(e => e.taskId === task.id && e.entryDate === dateKey);
            data[task.id][dateKey] = {
              hours: entry ? String(Number(entry.hours)) : "",
              notes: entry?.notes || "",
              id: entry?.id
            };
            changed = true;
          }
        }
      }
      
      return changed ? data : prevGridData;
    });
  }, [entries, assignedTasks, dates, setGridData]);

  const handleHoursChange = (taskId: number, dateKey: string, value: string) => {
    // Allow only numbers and one decimal point
    let numValue = value.replace(/[^0-9.]/g, "");
    
    // Prevent multiple decimal points
    const parts = numValue.split(".");
    if (parts.length > 2) {
      numValue = parts[0] + "." + parts.slice(1).join("");
    }
    
    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
      numValue = parts[0] + "." + parts[1].slice(0, 2);
    }
    
    // Validate the value is within reasonable limits (0-24 hours per day per task)
    const parsedValue = parseFloat(numValue);
    if (!isNaN(parsedValue) && parsedValue > 24) {
      numValue = "24";
    }
    if (!isNaN(parsedValue) && parsedValue < 0) {
      numValue = "0";
    }
    
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

  const groupedTasks = useMemo(() => {
    const groups: Record<number, { project: Project; tasks: { task: Task; project: Project }[] }> = {};
    for (const item of assignedTasks) {
      if (!groups[item.project.id]) {
        groups[item.project.id] = { project: item.project, tasks: [] };
      }
      groups[item.project.id].tasks.push(item);
    }
    return Object.values(groups);
  }, [assignedTasks]);

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

  const getProjectTotal = (projectId: number): number => {
    const group = groupedTasks.find(g => g.project.id === projectId);
    if (!group) return 0;
    return group.tasks.reduce((sum, { task }) => sum + getRowTotal(task.id), 0);
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
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left p-4 font-medium text-muted-foreground min-w-[250px]">
                <div className="flex items-center gap-2">
                  <span>Tasks</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" data-testid="button-add-task">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
              </th>
              {dates.map(date => {
                const isTodayDate = isToday(date);
                return (
                  <th key={formatDateKey(date)} className={`p-3 text-center min-w-[80px] ${
                    isTodayDate ? "bg-blue-500/10" : ""
                  }`}>
                    <div className={`text-xs font-medium ${isTodayDate ? "text-blue-600" : "text-muted-foreground"}`}>
                      {format(date, "EEE")}
                    </div>
                    <div className={`text-lg font-semibold ${isTodayDate ? "text-blue-600" : "text-foreground"}`}>
                      {format(date, "d")}
                    </div>
                    <div className={`text-xs ${isTodayDate ? "text-blue-500" : "text-muted-foreground"}`}>
                      {getColumnTotal(formatDateKey(date))}h
                    </div>
                  </th>
                );
              })}
              <th className="p-3 text-center min-w-[70px] bg-emerald-500/5">
                <div className="text-xs font-medium text-emerald-600">Total</div>
                <div className="text-lg font-bold text-emerald-600">
                  {getGrandTotal()}h
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {groupByProject ? (
              groupedTasks.map((group, groupIndex) => {
                const isCollapsed = collapsedProjects.has(group.project.id);
                const projectTotal = getProjectTotal(group.project.id);
                
                return (
                  <React.Fragment key={`group-${group.project.id}`}>
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: groupIndex * 0.05 }}
                      className="bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors border-t border-border"
                      onClick={() => toggleProjectCollapse(group.project.id)}
                      data-testid={`row-project-header-${group.project.id}`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <motion.div
                            animate={{ rotate: isCollapsed ? -90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </motion.div>
                          <FolderOpen className="h-4 w-4 text-primary" />
                          <span className="font-medium text-foreground">{group.project.name}</span>
                          <Badge variant="secondary" className="text-xs ml-1">
                            {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </td>
                      {dates.map(date => (
                        <td key={formatDateKey(date)} className={`p-3 text-center text-muted-foreground ${
                          isToday(date) ? "bg-blue-500/5" : ""
                        }`}>
                          -
                        </td>
                      ))}
                      <td className="p-3 text-center font-medium text-emerald-600 bg-emerald-500/5">
                        {projectTotal}h
                      </td>
                    </motion.tr>
                    
                    <AnimatePresence>
                      {!isCollapsed && group.tasks.map(({ task, project }, taskIndex) => (
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
                          index={taskIndex}
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
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isSaving}
          className="bg-primary"
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
                  <MicrosoftContactCard
                    displayName={resource?.displayName || "Unknown"}
                    email={resource?.email}
                    title={resource?.title}
                    department={resource?.department}
                    phone={resource?.phone}
                    photoUrl={resource?.photoUrl}
                    side="right"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold cursor-pointer hover:bg-primary/20 transition-colors">
                      {resource?.displayName?.charAt(0) || "?"}
                    </div>
                  </MicrosoftContactCard>
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
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("entry");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const { toast } = useToast();
  
  // Lift grid data state to parent to persist across view changes
  const [gridData, setGridData] = useState<Record<string, Record<string, { hours: string; notes: string; id?: number }>>>({});
  const [hasChanges, setHasChanges] = useState(false);

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
      setHasChanges(false);
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

  // Calculate total hours from local gridData for real-time updates
  const totalHoursThisWeek = useMemo(() => {
    let total = 0;
    for (const taskId in gridData) {
      for (const dateKey in gridData[taskId]) {
        const hours = parseFloat(gridData[taskId][dateKey]?.hours || "0");
        if (!isNaN(hours)) total += hours;
      }
    }
    return total;
  }, [gridData]);
  
  const weeklyTarget = 40;
  const progressPercent = Math.min((totalHoursThisWeek / weeklyTarget) * 100, 100);
  const hasDraftEntries = entries.some(e => e.status === "Draft");
  const isLoading = entriesLoading || tasksLoading;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Timesheet</h1>
              <p className="text-sm text-muted-foreground">Track your time across projects and tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="font-medium text-foreground">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-sm text-muted-foreground">{user?.email}</div>
            </div>
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.profileImageUrl || ""} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className="border-b border-border">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("entry")}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                activeTab === "entry" 
                  ? "text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-time-entry"
            >
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Time Entry
              </div>
              {activeTab === "entry" && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                activeTab === "history" 
                  ? "text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-history"
            >
              <div className="flex items-center gap-2">
                <History className="h-4 w-4" />
                History
              </div>
              {activeTab === "history" && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                />
              )}
            </button>
            {currentResource?.isApprover && (
              <button
                onClick={() => setActiveTab("approve")}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === "approve" 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-approvals"
              >
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Approvals
                </div>
                {activeTab === "approve" && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
            )}
          </nav>
        </div>

        {activeTab === "entry" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <Card className="border-0 shadow-sm bg-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => navigateDate("prev")}
                      data-testid="button-prev-period"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9"
                          data-testid="button-calendar"
                        >
                          <CalendarIcon className="h-5 w-5" />
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
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => navigateDate("next")}
                      data-testid="button-next-period"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>

                    <div className="ml-2">
                      <div className="text-lg font-semibold text-foreground">
                        {format(currentDate, "MMMM yyyy")}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(dates[0], "EEE, MMM d")} - {format(dates[dates.length - 1], "EEE, MMM d")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                      <SelectTrigger className="w-[140px]" data-testid="select-view-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="workweek">Work Week</SelectItem>
                        <SelectItem value="week">Full Week</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button 
                      variant="outline" 
                      onClick={goToToday}
                      data-testid="button-today"
                    >
                      Today
                    </Button>

                    {hasDraftEntries && viewMode !== "day" && (
                      <Button 
                        onClick={handleSubmitWeek}
                        disabled={submitWeek.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        data-testid="button-submit-week"
                      >
                        {submitWeek.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Submit
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                      <Clock className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-foreground">{totalHoursThisWeek}h</div>
                      <div className="text-sm text-muted-foreground">Total Hours</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10">
                      <ListTodo className="h-6 w-6 text-teal-600" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-foreground">{assignedTasks.length}</div>
                      <div className="text-sm text-muted-foreground">Active Tasks</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                      <TrendingUp className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-foreground">{Math.round(progressPercent)}%</div>
                      <div className="text-sm text-muted-foreground">of {weeklyTarget}h target</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-muted-foreground">Weekly Progress</div>
                      <div className="text-sm font-semibold text-foreground">{totalHoursThisWeek}/{weeklyTarget}h</div>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <TimesheetGrid
                  dates={dates}
                  assignedTasks={assignedTasks}
                  entries={entries}
                  onSave={handleSave}
                  isSaving={bulkUpsert.isPending}
                  viewMode={viewMode}
                  groupByProject={true}
                  gridData={gridData}
                  setGridData={setGridData}
                  hasChanges={hasChanges}
                  setHasChanges={setHasChanges}
                />
              </motion.div>
            )}
          </motion.div>
        )}

        {activeTab === "history" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-0 shadow-sm">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Timesheet History</h3>
                  <p className="text-muted-foreground max-w-md">
                    View your past timesheet submissions and their approval status. 
                    History feature coming soon.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === "approve" && currentResource?.isApprover && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ApprovalTab />
          </motion.div>
        )}
      </div>
    </div>
  );
}
