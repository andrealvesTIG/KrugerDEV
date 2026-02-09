import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
  useTimeCategories,
  useNonProjectTimeEntries,
  useCreateNonProjectTimeEntry,
  useDeleteNonProjectTimeEntry,
  useTimesheetPeriods,
  useCreateTimesheetPeriod,
  useCloseTimesheetPeriod,
  useReopenTimesheetPeriod,
  useDeleteTimesheetPeriod,
  useClosedTimesheetPeriods,
  type TimesheetEntryWithDetails,
  type NonProjectTimeEntryWithCategory
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
import { Checkbox } from "@/components/ui/checkbox";
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
  CheckCircle2,
  FolderOpen,
  StickyNote,
  TrendingUp,
  ListTodo,
  History,
  Maximize2,
  Minimize2,
  Copy,
  AlertTriangle,
  Plus,
  Palmtree,
  Trash2,
  Lock,
  LockOpen,
  CalendarRange,
  Undo2,
  MoreVertical
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isToday, parseISO, isSameDay, startOfDay, endOfDay, isWeekend, getDay, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { TimerWidget } from "@/components/TimerWidget";
import { TimesheetReminder } from "@/components/TimesheetReminder";
import { exportTimesheetToExcel } from "@/lib/excelExport";
import { FileSpreadsheet } from "lucide-react";
import type { Task, Project, InsertTimesheetEntry, TimesheetPeriod } from "@shared/schema";

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
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, taskId: number, dateKey: string, taskIndex: number, dateIndex: number) => void;
  handleCellFocus: (taskId: number, dateKey: string) => void;
  getRowTotal: (taskId: number) => number;
  getDayTotal: (dateKey: string) => number;
  openNoteEditor: (taskId: number, dateKey: string) => void;
  clearRow: (taskId: number) => void;
  index: number;
  indented?: boolean;
  inputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  isDateInClosedPeriod: (date: Date) => boolean;
  getClosedPeriodName: (date: Date) => string | null;
}

function TaskRow({ task, project, dates, entries, gridData, handleHoursChange, handleKeyDown, handleCellFocus, getRowTotal, getDayTotal, openNoteEditor, clearRow, index, indented, inputRefs, isDateInClosedPeriod, getClosedPeriodName }: TaskRowProps) {
  const rowTotal = getRowTotal(task.id);
  const isRowOvertime = rowTotal > 40;
  
  return (
    <motion.tr
      key={task.id}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      className="border-t border-border/50 hover:bg-muted/20 transition-colors group"
    >
      <td className={`p-3 ${indented ? 'pl-10' : ''} w-[280px] min-w-[280px] max-w-[280px] align-top`}>
        <div className="flex items-start gap-2 w-full overflow-hidden">
          <ListTodo className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-foreground text-sm leading-snug break-all">{task.name}</span>
            {!indented && (
              <span className="text-xs text-muted-foreground break-all">{project.name}</span>
            )}
          </div>
        </div>
      </td>
      {dates.map((date, dateIndex) => {
        const dateKey = formatDateKey(date);
        const entry = entries.find(e => e.taskId === task.id && e.entryDate === dateKey);
        const status = entry?.status;
        const isPeriodClosed = isDateInClosedPeriod(date);
        const closedPeriodName = isPeriodClosed ? getClosedPeriodName(date) : null;
        const isEditable = (!status || status === "Draft" || status === "Rejected") && !isPeriodClosed;
        const hasNote = !!(gridData[task.id]?.[dateKey]?.notes);
        const isTodayDate = isToday(date);
        const isWeekendDay = isWeekend(date);
        const cellHours = parseFloat(gridData[task.id]?.[dateKey]?.hours || "0");
        const isCellOvertime = cellHours > 8;
        
        return (
          <td key={dateKey} className={`p-2 align-top ${
            isPeriodClosed ? "bg-destructive/5" :
            isTodayDate ? "bg-blue-500/5" : 
            isWeekendDay ? "bg-muted/40" : ""
          }`}>
            <div className="relative group/cell flex justify-center">
              <Input
                ref={(el) => { inputRefs.current[`${task.id}-${dateKey}`] = el; }}
                type="text"
                inputMode="decimal"
                value={gridData[task.id]?.[dateKey]?.hours || ""}
                onChange={(e) => handleHoursChange(task.id, dateKey, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, task.id, dateKey, index, dateIndex)}
                onFocus={(e) => {
                  e.target.select();
                  handleCellFocus(task.id, dateKey);
                }}
                placeholder="0"
                disabled={!isEditable}
                className={`w-16 text-center h-9 rounded-lg border-2 ${
                  isPeriodClosed
                    ? "border-destructive/30 bg-destructive/5"
                    : isCellOvertime
                    ? "border-amber-400 bg-amber-50/50 dark:border-amber-600 dark:bg-amber-900/20"
                    : isTodayDate 
                    ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20" 
                    : isWeekendDay
                    ? "border-muted bg-muted/30"
                    : "border-border bg-background"
                } ${!isEditable ? "opacity-60 cursor-not-allowed" : ""} 
                ${status === "Approved" ? "border-green-300 dark:border-green-700" : ""} 
                ${status === "Rejected" ? "border-destructive/30" : ""}
                focus:ring-2 focus:ring-primary/20`}
                data-testid={`input-hours-${task.id}-${dateKey}`}
              />
              {isPeriodClosed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute -top-1 -left-1">
                      <Lock className="h-3 w-3 text-destructive" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Period locked: {closedPeriodName || "Closed period"}
                  </TooltipContent>
                </Tooltip>
              )}
              {!isPeriodClosed && isCellOvertime && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute -top-1 -left-1">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">Over 8 hours on this task</TooltipContent>
                </Tooltip>
              )}
              {status && status !== "Draft" && (
                <div className="absolute -top-1 -right-1">
                  {status === "Approved" && <Check className="h-3 w-3 text-green-500" />}
                  {status === "Submitted" && <Clock className="h-3 w-3 text-amber-500" />}
                  {status === "Rejected" && <X className="h-3 w-3 text-destructive" />}
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
      <td className="p-2 bg-emerald-500/5 align-top">
        <div className="flex items-center justify-center gap-1 h-9">
          <span className={`font-medium tabular-nums ${isRowOvertime ? "text-amber-600" : "text-foreground"}`}>{rowTotal}h</span>
          {isRowOvertime ? (
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-3 w-3 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent side="top">Over 40 hours this week</TooltipContent>
            </Tooltip>
          ) : (
            <span className="w-3 h-3" />
          )}
          {rowTotal > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => clearRow(task.id)}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  data-testid={`button-clear-row-${task.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Clear row</TooltipContent>
            </Tooltip>
          ) : (
            <span className="w-4 h-4" />
          )}
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
  onAutoSave: () => void;
  isDateInClosedPeriod: (date: Date) => boolean;
  getClosedPeriodName: (date: Date) => string | null;
}

const QUICK_TIME_PRESETS = [
  { label: "8h", value: "8" },
  { label: "4h", value: "4" },
  { label: "2h", value: "2" },
  { label: "1h", value: "1" },
];

const MAX_UNDO_HISTORY = 20;

function TimesheetGrid({ dates, assignedTasks, entries, onSave, isSaving, viewMode, groupByProject, gridData, setGridData, hasChanges, setHasChanges, onAutoSave, isDateInClosedPeriod, getClosedPeriodName }: TimesheetGridProps) {
  const [editingNote, setEditingNote] = useState<{ taskId: number; dateKey: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());
  const [selectedCell, setSelectedCell] = useState<{ taskId: number; dateKey: string } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Undo history
  const [undoHistory, setUndoHistory] = useState<Record<string, Record<string, { hours: string; notes: string; id?: number }>>[]>([]);
  const isUndoingRef = useRef(false);
  
  // Save current state to history before making changes
  const saveToHistory = useCallback(() => {
    if (isUndoingRef.current) return;
    const snapshot = JSON.parse(JSON.stringify(gridData));
    setUndoHistory(prev => {
      const newHistory = [...prev, snapshot];
      return newHistory.slice(-MAX_UNDO_HISTORY);
    });
  }, [gridData]);
  
  const undo = useCallback(() => {
    if (undoHistory.length === 0) return;
    
    isUndoingRef.current = true;
    const previousState = undoHistory[undoHistory.length - 1];
    setUndoHistory(prev => prev.slice(0, -1));
    setGridData(previousState);
    setHasChanges(true);
    
    setTimeout(() => {
      isUndoingRef.current = false;
    }, 100);
  }, [undoHistory, setGridData, setHasChanges]);

  // Auto-save after 3 seconds of inactivity
  useEffect(() => {
    if (hasChanges && !isSaving) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        onAutoSave();
      }, 3000);
    }
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasChanges, gridData, onAutoSave, isSaving]);

  // Reschedule auto-save after save completes if there are still changes
  const prevIsSavingRef = useRef(isSaving);
  useEffect(() => {
    if (prevIsSavingRef.current && !isSaving && hasChanges) {
      // Save just completed but there are still unsaved changes - reschedule
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        onAutoSave();
      }, 3000);
    }
    prevIsSavingRef.current = isSaving;
  }, [isSaving, hasChanges, onAutoSave]);

  // Get flat list of tasks for keyboard navigation
  const flatTaskList = useMemo(() => {
    if (groupByProject) {
      const list: { task: Task; project: Project }[] = [];
      for (const group of Object.values(
        assignedTasks.reduce((acc, item) => {
          if (!acc[item.project.id]) acc[item.project.id] = [];
          acc[item.project.id].push(item);
          return acc;
        }, {} as Record<number, { task: Task; project: Project }[]>)
      )) {
        list.push(...group);
      }
      return list;
    }
    return assignedTasks;
  }, [assignedTasks, groupByProject]);

  // Precompute taskId→index map for O(1) keyboard navigation
  const taskIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    flatTaskList.forEach((item, index) => {
      map.set(item.task.id, index);
    });
    return map;
  }, [flatTaskList]);

  // Keyboard navigation handler
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    taskId: number,
    dateKey: string,
    taskIndex: number,
    dateIndex: number
  ) => {
    const tasksCount = flatTaskList.length;
    const datesCount = dates.length;

    let nextTaskIndex = taskIndex;
    let nextDateIndex = dateIndex;

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      nextTaskIndex = (taskIndex + 1) % tasksCount;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextTaskIndex = (taskIndex - 1 + tasksCount) % tasksCount;
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      nextDateIndex = dateIndex + 1;
      if (nextDateIndex >= datesCount) {
        nextDateIndex = 0;
        nextTaskIndex = (taskIndex + 1) % tasksCount;
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      nextDateIndex = dateIndex - 1;
      if (nextDateIndex < 0) {
        nextDateIndex = datesCount - 1;
        nextTaskIndex = (taskIndex - 1 + tasksCount) % tasksCount;
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextDateIndex = (dateIndex + 1) % datesCount;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextDateIndex = (dateIndex - 1 + datesCount) % datesCount;
    } else {
      return;
    }

    const nextTask = flatTaskList[nextTaskIndex];
    const nextDate = dates[nextDateIndex];
    if (nextTask && nextDate) {
      const nextKey = `${nextTask.task.id}-${formatDateKey(nextDate)}`;
      inputRefs.current[nextKey]?.focus();
    }
  };

  // Quick time preset handler
  const applyQuickTime = (value: string) => {
    if (!selectedCell) return;
    setGridData(prev => ({
      ...prev,
      [selectedCell.taskId]: {
        ...prev[selectedCell.taskId],
        [selectedCell.dateKey]: { ...prev[selectedCell.taskId]?.[selectedCell.dateKey], hours: value }
      }
    }));
    setHasChanges(true);
  };

  // Track focused cell for quick presets
  const handleCellFocus = (taskId: number, dateKey: string) => {
    setSelectedCell({ taskId, dateKey });
  };

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

  const clearRow = (taskId: number) => {
    saveToHistory();
    setGridData(prev => {
      const updated = { ...prev };
      if (updated[taskId]) {
        const taskData = { ...updated[taskId] };
        for (const dateKey of Object.keys(taskData)) {
          const date = parseISO(dateKey);
          if (!isDateInClosedPeriod(date)) {
            taskData[dateKey] = { ...taskData[dateKey], hours: "" };
          }
        }
        updated[taskId] = taskData;
      }
      return updated;
    });
    setHasChanges(true);
  };

  const clearAllRows = () => {
    saveToHistory();
    setGridData(prev => {
      const updated = { ...prev };
      for (const taskId of Object.keys(updated)) {
        const taskData = { ...updated[taskId] };
        for (const dateKey of Object.keys(taskData)) {
          const date = parseISO(dateKey);
          if (!isDateInClosedPeriod(date)) {
            taskData[dateKey] = { ...taskData[dateKey], hours: "" };
          }
        }
        updated[taskId] = taskData;
      }
      return updated;
    });
    setHasChanges(true);
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
    // Only sum hours for the visible week dates
    return dates.reduce((sum: number, date: Date) => {
      const dateKey = format(date, "yyyy-MM-dd");
      return sum + (parseFloat(gridData[taskId][dateKey]?.hours) || 0);
    }, 0);
  };

  const getColumnTotal = (dateKey: string): number => {
    return Object.values(gridData).reduce((sum, taskData) => {
      return sum + (parseFloat(taskData[dateKey]?.hours) || 0);
    }, 0);
  };

  const getGrandTotal = (): number => {
    // Only sum hours for the visible week dates
    return Object.values(gridData).reduce((sum, taskData) => {
      return sum + dates.reduce((s: number, date: Date) => {
        const dateKey = format(date, "yyyy-MM-dd");
        return s + (parseFloat(taskData[dateKey]?.hours) || 0);
      }, 0);
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
      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left p-4 font-medium text-muted-foreground w-[280px] min-w-[280px]">
                <span>Tasks</span>
              </th>
              {dates.map(date => {
                const isTodayDate = isToday(date);
                const isWeekendDay = isWeekend(date);
                const dayTotal = getColumnTotal(formatDateKey(date));
                const isDayOvertime = dayTotal > 8;
                const isPeriodClosed = isDateInClosedPeriod(date);
                const closedPeriodName = isPeriodClosed ? getClosedPeriodName(date) : null;
                return (
                  <th key={formatDateKey(date)} className={`p-3 text-center w-[90px] ${
                    isPeriodClosed ? "bg-destructive/5" :
                    isTodayDate ? "bg-blue-500/10" : isWeekendDay ? "bg-muted/40" : ""
                  }`}>
                    <div className={`text-xs font-medium flex items-center justify-center gap-1 ${
                      isPeriodClosed ? "text-destructive" :
                      isTodayDate ? "text-blue-600 dark:text-blue-400" : isWeekendDay ? "text-muted-foreground/70" : "text-muted-foreground"
                    }`}>
                      {isPeriodClosed && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Lock className="h-3 w-3" />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Period locked: {closedPeriodName || "Closed period"}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {format(date, "EEE")}
                    </div>
                    <div className={`text-lg font-semibold ${
                      isPeriodClosed ? "text-destructive" :
                      isTodayDate ? "text-blue-600 dark:text-blue-400" : isWeekendDay ? "text-muted-foreground" : "text-foreground"
                    }`}>
                      {format(date, "d")}
                    </div>
                    <div className={`text-xs flex items-center justify-center gap-1 ${
                      isDayOvertime ? "text-amber-600 font-medium" : isTodayDate ? "text-blue-500" : "text-muted-foreground"
                    }`}>
                      {dayTotal}h
                      {isDayOvertime && <AlertTriangle className="h-3 w-3" />}
                    </div>
                  </th>
                );
              })}
              <th className="p-3 text-center w-[80px] bg-emerald-500/5">
                <div className="text-xs font-medium text-emerald-600 flex items-center justify-center gap-1">
                  Total
                  {getGrandTotal() > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={clearAllRows}
                          className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          data-testid="button-clear-all"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Clear all hours</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className={`text-lg font-bold flex items-center justify-center gap-1 ${
                  getGrandTotal() > 40 ? "text-amber-600" : "text-emerald-600"
                }`}>
                  {getGrandTotal()}h
                  {getGrandTotal() > 40 && (
                    <Tooltip>
                      <TooltipTrigger>
                        <AlertTriangle className="h-4 w-4" />
                      </TooltipTrigger>
                      <TooltipContent>Over 40 hours this week</TooltipContent>
                    </Tooltip>
                  )}
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
                      <td className="p-3 align-middle">
                        <div className="flex items-center gap-2 min-w-0 max-w-[250px]">
                          <motion.div
                            animate={{ rotate: isCollapsed ? -90 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="shrink-0"
                          >
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </motion.div>
                          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-foreground truncate" title={group.project.name}>{group.project.name}</span>
                          <Badge variant="secondary" className="text-xs ml-1 shrink-0">
                            {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </td>
                      {dates.map(date => (
                        <td key={formatDateKey(date)} className={`p-3 text-center align-middle text-muted-foreground ${
                          isToday(date) ? "bg-blue-500/5" : isWeekend(date) ? "bg-muted/40" : ""
                        }`}>
                          -
                        </td>
                      ))}
                      <td className="p-3 text-center align-middle font-medium text-emerald-600 bg-emerald-500/5">
                        {projectTotal}h
                      </td>
                    </motion.tr>
                    
                    <AnimatePresence>
                      {!isCollapsed && group.tasks.map(({ task, project }) => {
                        const flatIndex = taskIndexMap.get(task.id) ?? 0;
                        return (
                          <TaskRow
                            key={task.id}
                            task={task}
                            project={project}
                            dates={dates}
                            entries={entries}
                            gridData={gridData}
                            handleHoursChange={handleHoursChange}
                            handleKeyDown={handleKeyDown}
                            handleCellFocus={handleCellFocus}
                            getRowTotal={getRowTotal}
                            getDayTotal={getColumnTotal}
                            openNoteEditor={openNoteEditor}
                            clearRow={clearRow}
                            index={flatIndex}
                            indented
                            inputRefs={inputRefs}
                            isDateInClosedPeriod={isDateInClosedPeriod}
                            getClosedPeriodName={getClosedPeriodName}
                          />
                        );
                      })}
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
                  handleKeyDown={handleKeyDown}
                  handleCellFocus={handleCellFocus}
                  getRowTotal={getRowTotal}
                  getDayTotal={getColumnTotal}
                  openNoteEditor={openNoteEditor}
                  clearRow={clearRow}
                  index={index}
                  inputRefs={inputRefs}
                  isDateInClosedPeriod={isDateInClosedPeriod}
                  getClosedPeriodName={getClosedPeriodName}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Quick entry:</span>
          {QUICK_TIME_PRESETS.map(preset => (
            <Button
              key={preset.value}
              variant="outline"
              size="sm"
              onClick={() => applyQuickTime(preset.value)}
              disabled={!selectedCell}
              data-testid={`button-quick-${preset.value}h`}
            >
              {preset.label}
            </Button>
          ))}
          {!selectedCell && <span className="text-xs text-muted-foreground">(select a cell first)</span>}
          <div className="h-4 w-px bg-border mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={undoHistory.length === 0}
                data-testid="button-undo"
              >
                <Undo2 className="h-4 w-4 mr-1" />
                Undo
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {undoHistory.length > 0 
                ? `Undo last change (${undoHistory.length} available)` 
                : "No changes to undo"}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-muted-foreground">Auto-saves in 3s...</span>
          )}
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
      </div>

      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
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
  const [statusFilter, setStatusFilter] = useState<"Submitted" | "Approved" | "Rejected">("Submitted");
  const { data: entries, isLoading } = useTimesheetEntriesForApproval(currentOrganization?.id || null, statusFilter);
  const approveEntry = useApproveTimesheetEntry();
  const rejectEntry = useRejectTimesheetEntry();
  const [rejectDialog, setRejectDialog] = useState<{ id: number; open: boolean; isBulk?: boolean }>({ id: 0, open: false });
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const isPending = statusFilter === "Submitted";

  const handleApprove = async (id: number) => {
    try {
      await approveEntry.mutateAsync(id);
      toast({ title: "Approved", description: "Timesheet entry has been approved" });
    } catch (err: any) {
      const message = err?.message || "Failed to approve entry";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleApproveAll = async (ids: number[]) => {
    setIsProcessing(true);
    try {
      let successCount = 0;
      for (const id of ids) {
        try {
          await approveEntry.mutateAsync(id);
          successCount++;
        } catch (err) {
          console.error(`Failed to approve entry ${id}`, err);
        }
      }
      toast({ 
        title: "Approval Complete", 
        description: `${successCount} of ${ids.length} entries approved` 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await handleApproveAll(ids);
    setSelectedIds(new Set());
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    const ids = Array.from(selectedIds);
    try {
      let successCount = 0;
      for (const id of ids) {
        try {
          await rejectEntry.mutateAsync({ id, rejectionReason });
          successCount++;
        } catch (err) {
          console.error(`Failed to reject entry ${id}`, err);
        }
      }
      toast({ 
        title: "Bulk Rejection Complete", 
        description: `${successCount} of ${ids.length} entries rejected` 
      });
      setSelectedIds(new Set());
      setRejectDialog({ id: 0, open: false });
      setRejectionReason("");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (rejectDialog.isBulk) {
      await handleBulkReject();
      return;
    }
    try {
      await rejectEntry.mutateAsync({ id: rejectDialog.id, rejectionReason });
      setRejectDialog({ id: 0, open: false });
      setRejectionReason("");
      toast({ title: "Rejected", description: "Timesheet entry has been rejected" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to reject entry", variant: "destructive" });
    }
  };

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (!entries) return;
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  };

  const handleExportToExcel = () => {
    if (!entries || entries.length === 0) return;
    
    const exportData = entries.map(entry => ({
      resource: (entry as any).resource?.displayName || "Unknown",
      project: (entry as any).project?.name || "Unknown",
      task: (entry as any).task?.name || "Unknown",
      date: entry.entryDate,
      hours: Number(entry.hours),
      status: entry.status || "Draft",
      notes: entry.notes || ""
    }));
    
    exportTimesheetToExcel(exportData, {
      filename: `pending-approvals-${format(new Date(), 'yyyy-MM-dd')}`,
      sheetName: 'Pending Approvals'
    });
    
    toast({ title: "Export Complete", description: "Excel file downloaded successfully" });
  };

  const statusFilterTabs = (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg mb-4">
      {(["Submitted", "Approved", "Rejected"] as const).map((status) => (
        <button
          key={status}
          onClick={() => { setStatusFilter(status); setSelectedIds(new Set()); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            statusFilter === status
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover-elevate"
          }`}
          data-testid={`button-filter-${status.toLowerCase()}`}
        >
          {status === "Submitted" ? "Pending" : status}
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {statusFilterTabs}
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    const emptyMessages: Record<string, { icon: typeof Check; title: string; description: string }> = {
      Submitted: { icon: Check, title: "All Caught Up", description: "No timesheets pending approval" },
      Approved: { icon: CheckCircle2, title: "No Approved Entries", description: "No approved timesheet entries found" },
      Rejected: { icon: X, title: "No Rejected Entries", description: "No rejected timesheet entries found" },
    };
    const msg = emptyMessages[statusFilter];
    const EmptyIcon = msg.icon;
    return (
      <div>
        {statusFilterTabs}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <EmptyIcon className={`h-12 w-12 mb-4 ${statusFilter === "Submitted" ? "text-green-500" : "text-muted-foreground"}`} />
          <h3 className="text-lg font-medium text-foreground mb-2">{msg.title}</h3>
          <p className="text-muted-foreground">{msg.description}</p>
        </div>
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
    <div className="space-y-4">
      {statusFilterTabs}

      {isPending && (
        <div className="flex items-center justify-between gap-2 flex-wrap p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedIds.size === entries.length && entries.length > 0}
              onCheckedChange={toggleSelectAll}
              data-testid="checkbox-select-all"
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button 
                  size="sm" 
                  onClick={handleBulkApprove}
                  disabled={isProcessing}
                  className="bg-emerald-600"
                  data-testid="button-bulk-approve"
                >
                  {isProcessing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Approve Selected ({selectedIds.size})
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => setRejectDialog({ id: 0, open: true, isBulk: true })}
                  disabled={isProcessing}
                  data-testid="button-bulk-reject"
                >
                  <X className="mr-1 h-4 w-4" />
                  Reject Selected
                </Button>
              </>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleExportToExcel}
                  data-testid="button-export-excel"
                >
                  <FileSpreadsheet className="mr-1 h-4 w-4" />
                  Export Excel
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download as Excel file</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {!isPending && (
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleExportToExcel}
                data-testid="button-export-excel-history"
              >
                <FileSpreadsheet className="mr-1 h-4 w-4" />
                Export Excel
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download as Excel file</TooltipContent>
          </Tooltip>
        </div>
      )}

      {Object.entries(groupedByUser).map(([userId, userEntries]) => {
        const resource = (userEntries[0] as any).resource;
        const totalHours = userEntries.reduce((sum, e) => sum + Number(e.hours), 0);
        const userSelectedCount = userEntries.filter(e => selectedIds.has(e.id)).length;
        
        return (
          <Card key={userId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  {isPending && (
                    <Checkbox
                      checked={userSelectedCount === userEntries.length}
                      onCheckedChange={() => {
                        const newSet = new Set(selectedIds);
                        if (userSelectedCount === userEntries.length) {
                          userEntries.forEach(e => newSet.delete(e.id));
                        } else {
                          userEntries.forEach(e => newSet.add(e.id));
                        }
                        setSelectedIds(newSet);
                      }}
                      data-testid={`checkbox-select-user-${userId}`}
                    />
                  )}
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
                    <p className="text-sm text-muted-foreground">{totalHours.toFixed(1)} hours {isPending ? "pending" : statusFilter.toLowerCase()}</p>
                  </div>
                </div>
                {isPending && (
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleApproveAll(userEntries.map(e => e.id))}
                      disabled={isProcessing}
                      data-testid={`button-approve-all-${userId}`}
                    >
                      {isProcessing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                      Approve All
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {userEntries.map(entry => (
                  <div 
                    key={entry.id} 
                    className={`flex items-center justify-between p-3 rounded-lg gap-4 flex-wrap transition-colors ${
                      isPending && selectedIds.has(entry.id) ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-[350px]">
                      {isPending && (
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={() => toggleSelection(entry.id)}
                          data-testid={`checkbox-entry-${entry.id}`}
                        />
                      )}
                      <div className="overflow-hidden">
                        <div className="font-medium truncate" title={(entry as any).task?.name || "Unknown Task"}>{(entry as any).task?.name || "Unknown Task"}</div>
                        <div className="text-sm text-muted-foreground truncate" title={`${(entry as any).project?.name || "Unknown Project"} • ${entry.entryDate}`}>
                          {(entry as any).project?.name || "Unknown Project"} • {entry.entryDate}
                        </div>
                        {entry.notes && (
                          <div className="text-sm text-muted-foreground mt-1 flex items-start gap-1">
                            <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-1">{entry.notes}</span>
                          </div>
                        )}
                        {statusFilter === "Rejected" && entry.rejectionReason && (
                          <div className="text-sm text-destructive mt-1 flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-1">Reason: {entry.rejectionReason}</span>
                          </div>
                        )}
                        {statusFilter === "Approved" && entry.approvedAt && (
                          <div className="text-sm text-green-600 dark:text-green-400 mt-1 flex items-start gap-1">
                            <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>Approved {format(new Date(entry.approvedAt), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium text-lg">{Number(entry.hours).toFixed(1)}h</span>
                      {isPending && (
                        <div className="flex gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="text-green-600"
                            onClick={() => handleApprove(entry.id)}
                            data-testid={`button-approve-${entry.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="text-red-600"
                            onClick={() => setRejectDialog({ id: entry.id, open: true })}
                            data-testid={`button-reject-${entry.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {!isPending && (
                        <Badge variant={statusFilter === "Approved" ? "default" : "destructive"} className="text-xs">
                          {statusFilter}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ ...rejectDialog, open })}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {rejectDialog.isBulk 
                ? `Reject ${selectedIds.size} Timesheet Entries` 
                : "Reject Timesheet Entry"
              }
            </DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting {rejectDialog.isBulk ? "these entries" : "this timesheet entry"}. The user{rejectDialog.isBulk ? "s" : ""} will be notified and can resubmit.
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
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={isProcessing}
              data-testid="button-confirm-reject"
            >
              {isProcessing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {rejectDialog.isBulk ? `Reject ${selectedIds.size} Entries` : "Reject Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PeriodManagementTab() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const { data: periods = [], isLoading } = useTimesheetPeriods(currentOrganization?.id || null);
  const createPeriod = useCreateTimesheetPeriod();
  const closePeriod = useCloseTimesheetPeriod();
  const reopenPeriod = useReopenTimesheetPeriod();
  const deletePeriod = useDeleteTimesheetPeriod();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPeriod, setNewPeriod] = useState({
    name: "",
    startDate: "",
    endDate: "",
    notes: "",
  });
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; open: boolean }>({ id: 0, open: false });

  const handleCreatePeriod = async () => {
    if (!currentOrganization?.id || !newPeriod.name || !dateRange.from || !dateRange.to) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    try {
      await createPeriod.mutateAsync({
        organizationId: currentOrganization.id,
        name: newPeriod.name,
        startDate: format(dateRange.from, "yyyy-MM-dd"),
        endDate: format(dateRange.to, "yyyy-MM-dd"),
        notes: newPeriod.notes || undefined,
      });
      toast({ title: "Success", description: "Period created successfully" });
      setShowCreateDialog(false);
      setNewPeriod({ name: "", startDate: "", endDate: "", notes: "" });
      setDateRange({ from: undefined, to: undefined });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create period", variant: "destructive" });
    }
  };

  const handleClosePeriod = async (id: number) => {
    try {
      await closePeriod.mutateAsync(id);
      toast({ title: "Success", description: "Period closed successfully. Time entries in this period are now locked." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to close period", variant: "destructive" });
    }
  };

  const handleReopenPeriod = async (id: number) => {
    try {
      await reopenPeriod.mutateAsync(id);
      toast({ title: "Success", description: "Period reopened. Time entries can be modified again." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to reopen period", variant: "destructive" });
    }
  };

  const handleDeletePeriod = async () => {
    if (!deleteConfirm.id) return;
    try {
      await deletePeriod.mutateAsync(deleteConfirm.id);
      toast({ title: "Success", description: "Period deleted successfully" });
      setDeleteConfirm({ id: 0, open: false });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete period", variant: "destructive" });
    }
  };

  const setQuickPeriod = (type: "lastWeek" | "lastMonth" | "thisMonth") => {
    const today = new Date();
    let from: Date;
    let to: Date;
    let name: string;

    switch (type) {
      case "lastWeek":
        from = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        to = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        name = `Week of ${format(from, "MMM d, yyyy")}`;
        break;
      case "lastMonth":
        from = startOfMonth(subMonths(today, 1));
        to = endOfMonth(subMonths(today, 1));
        name = format(from, "MMMM yyyy");
        break;
      case "thisMonth":
        from = startOfMonth(today);
        to = endOfMonth(today);
        name = format(from, "MMMM yyyy");
        break;
    }

    setDateRange({ from, to });
    setNewPeriod(prev => ({ ...prev, name }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" />
              Timesheet Periods
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Manage time periods to lock timesheet entries for specific date ranges
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-period">
            <Plus className="h-4 w-4 mr-2" />
            New Period
          </Button>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CalendarRange className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Periods Created</h3>
              <p className="text-muted-foreground max-w-md mb-4">
                Create timesheet periods to lock time entries for specific date ranges. 
                This prevents users from modifying entries in closed periods.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-period">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Period
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {periods.map((period) => (
                <div
                  key={period.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    period.status === "closed" 
                      ? "bg-destructive/5 border-destructive/20" 
                      : "bg-card border-border"
                  }`}
                  data-testid={`period-${period.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${
                      period.status === "closed" 
                        ? "bg-destructive/10" 
                        : "bg-muted"
                    }`}>
                      {period.status === "closed" ? (
                        <Lock className="h-5 w-5 text-destructive" />
                      ) : (
                        <LockOpen className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-foreground">{period.name}</h4>
                        <Badge variant={period.status === "closed" ? "destructive" : "secondary"} className="text-xs">
                          {period.status === "closed" ? "Closed" : "Open"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(period.startDate), "MMM d, yyyy")} - {format(parseISO(period.endDate), "MMM d, yyyy")}
                      </p>
                      {period.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{period.notes}</p>
                      )}
                      {period.status === "closed" && period.closedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Closed on {format(new Date(period.closedAt), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {period.status === "open" ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleClosePeriod(period.id)}
                        disabled={closePeriod.isPending}
                        data-testid={`button-close-period-${period.id}`}
                      >
                        {closePeriod.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Lock className="h-4 w-4 mr-1" />
                            Close Period
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReopenPeriod(period.id)}
                        disabled={reopenPeriod.isPending}
                        data-testid={`button-reopen-period-${period.id}`}
                      >
                        {reopenPeriod.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <LockOpen className="h-4 w-4 mr-1" />
                            Reopen
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm({ id: period.id, open: true })}
                      className="text-muted-foreground hover:text-destructive"
                      data-testid={`button-delete-period-${period.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Period Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Create New Period</DialogTitle>
            <DialogDescription>
              Create a timesheet period to manage and lock time entries for a specific date range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="period-name">Period Name</Label>
              <Input
                id="period-name"
                value={newPeriod.name}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., January 2024, Week 1"
                data-testid="input-period-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Quick Select</Label>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => setQuickPeriod("lastWeek")}>
                  Last Week
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setQuickPeriod("lastMonth")}>
                  Last Month
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setQuickPeriod("thisMonth")}>
                  This Month
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateRange.from}
                        onSelect={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateRange.to}
                        onSelect={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="period-notes">Notes (Optional)</Label>
              <Textarea
                id="period-notes"
                value={newPeriod.notes}
                onChange={(e) => setNewPeriod(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add any notes about this period..."
                data-testid="input-period-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreatePeriod} 
              disabled={createPeriod.isPending || !newPeriod.name || !dateRange.from || !dateRange.to}
              data-testid="button-confirm-create-period"
            >
              {createPeriod.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Create Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Period?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this period. Time entries will no longer be locked by this period.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePeriod} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Period
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Timesheets() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [viewMode, setViewMode] = useState<ViewMode>("workweek");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("entry");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [showReminder, setShowReminder] = useState(true);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleExportMyTimesheet = () => {
    if (!entries || entries.length === 0) {
      toast({ title: "No Data", description: "No timesheet entries to export", variant: "destructive" });
      return;
    }
    
    const exportData = entries.map(entry => ({
      resource: currentResource?.displayName || "Me",
      project: assignedTasks.find(t => t.task.id === entry.taskId)?.project?.name || "Unknown",
      task: assignedTasks.find(t => t.task.id === entry.taskId)?.task?.name || "Unknown",
      date: entry.entryDate,
      hours: Number(entry.hours),
      status: entry.status || "Draft",
      notes: entry.notes || ""
    }));
    
    exportTimesheetToExcel(exportData, {
      filename: `my-timesheet-${format(dates[0], 'yyyy-MM-dd')}-to-${format(dates[dates.length - 1], 'yyyy-MM-dd')}`,
      sheetName: 'My Timesheet'
    });
    
    toast({ title: "Export Complete", description: "Excel file downloaded successfully" });
  };
  
  // Lift grid data state to parent to persist across view changes
  const [gridData, setGridData] = useState<Record<string, Record<string, { hours: string; notes: string; id?: number }>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Unsaved changes warning on browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

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

  // Time off tracking hooks
  const { data: timeCategories = [] } = useTimeCategories(currentOrganization?.id || null);
  const { data: nonProjectTimeEntries = [] } = useNonProjectTimeEntries(
    user?.id,
    currentOrganization?.id || null,
    startDate,
    endDate
  );
  const createNonProjectTime = useCreateNonProjectTimeEntry();
  const deleteNonProjectTime = useDeleteNonProjectTimeEntry();

  // Closed periods for locking time entries
  const { data: closedPeriods = [] } = useClosedTimesheetPeriods(
    currentOrganization?.id || null,
    startDate,
    endDate
  );

  // Helper function to check if a date falls within a closed period
  const isDateInClosedPeriod = useCallback((date: Date): boolean => {
    const dateStr = formatDateKey(date);
    return closedPeriods.some(period => {
      return dateStr >= period.startDate && dateStr <= period.endDate;
    });
  }, [closedPeriods]);

  // Get the name of the closed period for a date (for tooltip)
  const getClosedPeriodName = useCallback((date: Date): string | null => {
    const dateStr = formatDateKey(date);
    const period = closedPeriods.find(p => dateStr >= p.startDate && dateStr <= p.endDate);
    return period ? period.name : null;
  }, [closedPeriods]);

  // Time off popover state
  const [timeOffPopoverOpen, setTimeOffPopoverOpen] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    categoryId: 0,
    startDate: formatDateKey(new Date()),
    endDate: formatDateKey(new Date()),
    hours: 8,
    notes: "",
    includeWeekends: false
  });

  // Clear week confirmation state
  const [clearWeekDialogOpen, setClearWeekDialogOpen] = useState(false);
  
  const handleClearWeek = () => {
    // Reset all hours for the current week to empty
    const newGridData = { ...gridData };
    for (const taskId of Object.keys(newGridData)) {
      for (const date of dates) {
        const dateKey = formatDateKey(date);
        if (newGridData[Number(taskId)][dateKey]) {
          newGridData[Number(taskId)][dateKey] = { 
            ...newGridData[Number(taskId)][dateKey], 
            hours: "" 
          };
        }
      }
    }
    setGridData(newGridData);
    setHasChanges(true);
    setClearWeekDialogOpen(false);
    toast({
      title: "Week Cleared",
      description: "All hours for this week have been reset. Remember to save your changes.",
    });
  };

  // Get previous week dates for copy feature
  const previousWeekDates = useMemo(() => {
    const prevWeekDate = subWeeks(currentDate, 1);
    return viewMode === "workweek" ? getWorkWeekDates(prevWeekDate) : getWeekDates(prevWeekDate);
  }, [currentDate, viewMode]);

  const previousStartDate = formatDateKey(previousWeekDates[0]);
  const previousEndDate = formatDateKey(previousWeekDates[previousWeekDates.length - 1]);

  const { data: previousWeekEntries = [] } = useTimesheetEntries(
    user?.id,
    currentOrganization?.id || null,
    previousStartDate,
    previousEndDate
  );

  // Copy previous week handler
  const handleCopyPreviousWeek = () => {
    // Guard against day view
    if (viewMode === "day") {
      toast({ title: "Not Available", description: "Copy feature is not available in day view" });
      return;
    }
    
    if (previousWeekEntries.length === 0) {
      toast({ title: "No Data", description: "No timesheet entries from last week to copy" });
      return;
    }

    const newGridData = { ...gridData };
    let copiedCount = 0;
    
    for (const entry of previousWeekEntries) {
      const taskId = entry.taskId;
      // Map the previous week date to current week date (same day of week)
      const entryDate = parseISO(entry.entryDate);
      const dayOfWeek = getDay(entryDate);
      const currentWeekDate = dates.find(d => getDay(d) === dayOfWeek);
      
      if (currentWeekDate && taskId) {
        const dateKey = formatDateKey(currentWeekDate);
        if (!newGridData[taskId]) {
          newGridData[taskId] = {};
        }
        // Only copy if current cell is empty or has 0 hours
        const existingHours = parseFloat(newGridData[taskId][dateKey]?.hours || "0");
        if (existingHours === 0 && Number(entry.hours) > 0) {
          newGridData[taskId][dateKey] = {
            hours: String(Number(entry.hours)),
            notes: entry.notes || "",
            id: newGridData[taskId][dateKey]?.id
          };
          copiedCount++;
        }
      }
    }

    if (copiedCount === 0) {
      toast({ title: "No Changes", description: "All matching cells already have values" });
      return;
    }

    setGridData(newGridData);
    setHasChanges(true);
    toast({ title: "Copied", description: `${copiedCount} entries copied from last week. Remember to save!` });
  };

  // Auto-save handler
  const handleAutoSave = useCallback(() => {
    if (!currentOrganization || !currentResource || !hasChanges) return;

    const formattedData: Record<string, Record<string, { hours: number; notes: string; id?: number }>> = {};
    for (const taskId in gridData) {
      formattedData[taskId] = {};
      for (const dateKey in gridData[taskId]) {
        const { hours, notes, id } = gridData[taskId][dateKey];
        formattedData[taskId][dateKey] = {
          hours: hours ? parseFloat(hours) : 0,
          notes: notes || "",
          id
        };
      }
    }
    handleSave(formattedData);
  }, [gridData, currentOrganization, currentResource, hasChanges]);

  const navigateDate = (direction: "prev" | "next") => {
    if (viewMode === "day") {
      setCurrentDate(prev => direction === "prev" ? addDays(prev, -1) : addDays(prev, 1));
    } else {
      setCurrentDate(prev => direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleTimerStop = (taskId: number, hours: number, notes: string) => {
    const dateKey = format(new Date(), "yyyy-MM-dd");
    const newGridData = JSON.parse(JSON.stringify(gridData));
    
    if (!newGridData[taskId]) {
      newGridData[taskId] = {};
    }
    
    const existingHours = parseFloat(newGridData[taskId][dateKey]?.hours || "0");
    newGridData[taskId][dateKey] = {
      hours: String(existingHours + hours),
      notes: notes || newGridData[taskId][dateKey]?.notes || "",
      id: newGridData[taskId][dateKey]?.id
    };
    
    setGridData(newGridData);
    setHasChanges(true);
    toast({ 
      title: "Time Logged", 
      description: `${hours}h added to today. Remember to save!`
    });
  };

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

  // Handle time off entry submission
  const handleTimeOffSubmit = async () => {
    if (!currentOrganization || !timeOffForm.categoryId) return;
    
    try {
      const start = parseISO(timeOffForm.startDate);
      const end = parseISO(timeOffForm.endDate);
      
      // Validate date range
      if (end < start) {
        toast({ title: "Invalid Date Range", description: "End date must be on or after start date", variant: "destructive" });
        return;
      }
      
      // Generate all dates in range
      const datesToCreate: Date[] = [];
      let current = start;
      while (current <= end) {
        const dayOfWeek = getDay(current);
        // Skip weekends unless includeWeekends is true
        if (timeOffForm.includeWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
          datesToCreate.push(current);
        }
        current = addDays(current, 1);
      }
      
      if (datesToCreate.length === 0) {
        toast({ title: "No Days Selected", description: "Selected range contains no applicable days", variant: "destructive" });
        return;
      }
      
      // Limit to prevent excessive entries (max 30 days)
      if (datesToCreate.length > 30) {
        toast({ title: "Range Too Large", description: "Maximum 30 days per submission. Please split into smaller ranges.", variant: "destructive" });
        return;
      }
      
      // Create entries for all dates with error tracking
      let successCount = 0;
      let failedDates: string[] = [];
      
      for (const date of datesToCreate) {
        try {
          await createNonProjectTime.mutateAsync({
            organizationId: currentOrganization.id,
            categoryId: timeOffForm.categoryId,
            entryDate: formatDateKey(date),
            hours: timeOffForm.hours,
            notes: timeOffForm.notes || undefined
          });
          successCount++;
        } catch {
          failedDates.push(format(date, "MMM d"));
        }
      }
      
      // Show appropriate message
      if (failedDates.length === 0) {
        toast({ 
          title: "Time Off Added", 
          description: `${successCount} day${successCount > 1 ? 's' : ''} of time off recorded` 
        });
      } else if (successCount > 0) {
        toast({ 
          title: "Partial Success", 
          description: `${successCount} day${successCount > 1 ? 's' : ''} added, but ${failedDates.length} failed: ${failedDates.join(", ")}`,
          variant: "destructive"
        });
      } else {
        toast({ title: "Error", description: "Failed to add any time off entries", variant: "destructive" });
      }
      
      setTimeOffPopoverOpen(false);
      setTimeOffForm({ categoryId: 0, startDate: formatDateKey(new Date()), endDate: formatDateKey(new Date()), hours: 8, notes: "", includeWeekends: false });
    } catch (err) {
      toast({ title: "Error", description: "Failed to add time off", variant: "destructive" });
    }
  };

  // Handle time off entry deletion
  const handleDeleteTimeOff = async (id: number) => {
    try {
      await deleteNonProjectTime.mutateAsync(id);
      toast({ title: "Deleted", description: "Time off entry has been removed" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete time off", variant: "destructive" });
    }
  };

  // Calculate total hours from local gridData for real-time updates (only current week's dates)
  const totalHoursThisWeek = useMemo(() => {
    // Create a set of valid date keys for the current view
    const validDateKeys = new Set(dates.map(d => formatDateKey(d)));
    let total = 0;
    for (const taskId in gridData) {
      for (const dateKey in gridData[taskId]) {
        // Only count hours for dates in the current week view
        if (validDateKeys.has(dateKey)) {
          const hours = parseFloat(gridData[taskId][dateKey]?.hours || "0");
          if (!isNaN(hours)) total += hours;
        }
      }
    }
    return total;
  }, [gridData, dates]);
  
  const weeklyTarget = 40;
  const progressPercent = Math.min((totalHoursThisWeek / weeklyTarget) * 100, 100);
  const hasDraftEntries = entries.some(e => e.status === "Draft");
  const isLoading = entriesLoading || tasksLoading;

  const [filterProjectId, setFilterProjectId] = useState<number | null>(null);

  const uniqueProjects = useMemo(() => {
    const projectMap = new Map<number, { id: number; name: string }>();
    assignedTasks.forEach(({ project }) => {
      if (!projectMap.has(project.id)) {
        projectMap.set(project.id, { id: project.id, name: project.name });
      }
    });
    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignedTasks]);

  const filteredAssignedTasks = useMemo(() => {
    if (!filterProjectId) return assignedTasks;
    return assignedTasks.filter(({ project }) => project.id === filterProjectId);
  }, [assignedTasks, filterProjectId]);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-b bg-background shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Timesheet - {viewMode === "day" ? "Day" : viewMode === "workweek" ? "Work Week" : "Full Week"}</h2>
              <p className="text-xs text-muted-foreground">
                {format(dates[0], "EEE, MMM d")} - {format(dates[dates.length - 1], "EEE, MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {uniqueProjects.length > 1 && (
              <Select 
                value={filterProjectId?.toString() || "all"} 
                onValueChange={(v) => setFilterProjectId(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="w-[180px]" data-testid="select-filter-project-fullscreen">
                  <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {uniqueProjects.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate("prev")}
              data-testid="button-prev-period-fullscreen"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate("next")}
              data-testid="button-next-period-fullscreen"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              data-testid="button-today-fullscreen"
            >
              Today
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCopyPreviousWeek}
                  disabled={viewMode === "day"}
                  data-testid="button-copy-previous-week-fullscreen"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Last Week
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy hours from previous week (only empty cells)</TooltipContent>
            </Tooltip>
            <Popover open={timeOffPopoverOpen} onOpenChange={setTimeOffPopoverOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  data-testid="button-add-time-off-fullscreen"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Time Off
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Palmtree className="h-4 w-4 text-emerald-600" />
                      Add Time Off
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Log vacation, PTO, sick leave, or other non-project time
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Category</Label>
                      <Select
                        value={timeOffForm.categoryId ? String(timeOffForm.categoryId) : ""}
                        onValueChange={(val) => setTimeOffForm(f => ({ ...f, categoryId: Number(val) }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {timeCategories.map((cat) => (
                            <SelectItem key={cat.id} value={String(cat.id)}>
                              <span className="flex items-center gap-2">
                                <span 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: cat.color || '#6b7280' }}
                                />
                                {cat.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Start Date</Label>
                        <Input
                          type="date"
                          value={timeOffForm.startDate}
                          onChange={(e) => setTimeOffForm(f => ({ ...f, startDate: e.target.value }))}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">End Date</Label>
                        <Input
                          type="date"
                          value={timeOffForm.endDate}
                          min={timeOffForm.startDate}
                          onChange={(e) => setTimeOffForm(f => ({ ...f, endDate: e.target.value }))}
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="include-weekends"
                        checked={timeOffForm.includeWeekends}
                        onCheckedChange={(checked) => setTimeOffForm(f => ({ ...f, includeWeekends: !!checked }))}
                      />
                      <Label htmlFor="include-weekends" className="text-xs cursor-pointer">
                        Include weekends
                      </Label>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Hours per Day</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0.5"
                          max="24"
                          step="0.5"
                          value={timeOffForm.hours}
                          onChange={(e) => setTimeOffForm(f => ({ ...f, hours: Number(e.target.value) }))}
                          className="h-9 w-20"
                        />
                        <div className="flex gap-1">
                          {[4, 8].map((h) => (
                            <Button 
                              key={h}
                              type="button"
                              variant={timeOffForm.hours === h ? "secondary" : "ghost"}
                              size="sm"
                              onClick={() => setTimeOffForm(f => ({ ...f, hours: h }))}
                            >
                              {h}h
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Notes (optional)</Label>
                      <Input
                        placeholder="e.g., Doctor appointment"
                        value={timeOffForm.notes}
                        onChange={(e) => setTimeOffForm(f => ({ ...f, notes: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTimeOffPopoverOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleTimeOffSubmit}
                      disabled={!timeOffForm.categoryId || createNonProjectTime.isPending}
                    >
                      {createNonProjectTime.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Add"
                      )}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setClearWeekDialogOpen(true)}
                  data-testid="button-clear-week"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Week
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear all time entries for this week</TooltipContent>
            </Tooltip>
            <AlertDialog open={clearWeekDialogOpen} onOpenChange={setClearWeekDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Week?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset all time entries for the current week to zero. You'll need to save for changes to take effect.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearWeek}>Clear Week</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {hasDraftEntries && viewMode !== "day" && (
              <Button 
                onClick={handleSubmitWeek}
                disabled={submitWeek.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
                size="sm"
                data-testid="button-submit-week-fullscreen"
              >
                {submitWeek.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Submit
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsFullscreen(false)}
              data-testid="button-exit-fullscreen"
            >
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit Fullscreen
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <TimesheetGrid
              dates={dates}
              assignedTasks={filteredAssignedTasks}
              entries={entries}
              onSave={handleSave}
              isSaving={bulkUpsert.isPending}
              viewMode={viewMode}
              groupByProject={!filterProjectId}
              gridData={gridData}
              setGridData={setGridData}
              hasChanges={hasChanges}
              setHasChanges={setHasChanges}
              onAutoSave={handleAutoSave}
              isDateInClosedPeriod={isDateInClosedPeriod}
              getClosedPeriodName={getClosedPeriodName}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Timesheet</h1>
              <p className="text-xs text-muted-foreground">Track your time across projects and tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-foreground">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.profileImageUrl || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
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
            {currentResource?.isApprover && (
              <button
                onClick={() => setActiveTab("periods")}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === "periods" 
                    ? "text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-periods"
              >
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Periods
                </div>
                {activeTab === "periods" && (
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

                  <div className="flex items-center gap-2 flex-wrap">
                    {uniqueProjects.length > 1 && (
                      <Select 
                        value={filterProjectId?.toString() || "all"} 
                        onValueChange={(v) => setFilterProjectId(v === "all" ? null : Number(v))}
                      >
                        <SelectTrigger className="w-[180px]" data-testid="select-filter-project">
                          <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                          <SelectValue placeholder="All Projects" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Projects</SelectItem>
                          {uniqueProjects.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                      <SelectTrigger className="w-[130px]" data-testid="select-view-mode">
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
                      size="sm"
                      onClick={goToToday}
                      data-testid="button-today"
                    >
                      Today
                    </Button>

                    <TimerWidget 
                      tasks={assignedTasks}
                      onTimerStop={handleTimerStop}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" data-testid="button-more-actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={handleCopyPreviousWeek}
                          disabled={viewMode === "day"}
                          data-testid="menu-copy-previous-week"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Last Week
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setTimeOffPopoverOpen(true)}
                          data-testid="menu-add-time-off"
                        >
                          <Palmtree className="h-4 w-4 mr-2" />
                          Add Time Off
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleExportMyTimesheet}
                          data-testid="menu-export-excel"
                        >
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Export to Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setIsFullscreen(true)}
                          data-testid="menu-fullscreen"
                        >
                          <Maximize2 className="h-4 w-4 mr-2" />
                          Fullscreen Mode
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Dialog open={timeOffPopoverOpen} onOpenChange={setTimeOffPopoverOpen}>
                      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <Palmtree className="h-4 w-4 text-emerald-600" />
                            Add Time Off
                          </DialogTitle>
                          <DialogDescription>
                            Log vacation, PTO, sick leave, or other non-project time
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Category</Label>
                              <Select
                                value={timeOffForm.categoryId ? String(timeOffForm.categoryId) : ""}
                                onValueChange={(val) => setTimeOffForm(f => ({ ...f, categoryId: Number(val) }))}
                              >
                                <SelectTrigger className="h-9" data-testid="select-time-off-category">
                                  <SelectValue placeholder="Select type..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {timeCategories.map((cat) => (
                                    <SelectItem key={cat.id} value={String(cat.id)}>
                                      <span className="flex items-center gap-2">
                                        <span 
                                          className="w-2 h-2 rounded-full" 
                                          style={{ backgroundColor: cat.color || '#6b7280' }}
                                        />
                                        {cat.name}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Start Date</Label>
                                <Input
                                  type="date"
                                  value={timeOffForm.startDate}
                                  onChange={(e) => setTimeOffForm(f => ({ ...f, startDate: e.target.value }))}
                                  className="h-9"
                                  data-testid="input-time-off-start-date"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">End Date</Label>
                                <Input
                                  type="date"
                                  value={timeOffForm.endDate}
                                  min={timeOffForm.startDate}
                                  onChange={(e) => setTimeOffForm(f => ({ ...f, endDate: e.target.value }))}
                                  className="h-9"
                                  data-testid="input-time-off-end-date"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="include-weekends-regular"
                                checked={timeOffForm.includeWeekends}
                                onCheckedChange={(checked) => setTimeOffForm(f => ({ ...f, includeWeekends: !!checked }))}
                                data-testid="checkbox-include-weekends"
                              />
                              <Label htmlFor="include-weekends-regular" className="text-xs cursor-pointer">
                                Include weekends
                              </Label>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Hours per Day</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0.5"
                                  max="24"
                                  step="0.5"
                                  value={timeOffForm.hours}
                                  onChange={(e) => setTimeOffForm(f => ({ ...f, hours: Number(e.target.value) }))}
                                  className="h-9 w-20"
                                  data-testid="input-time-off-hours"
                                />
                                <div className="flex gap-1">
                                  {[4, 8].map((h) => (
                                    <Button 
                                      key={h}
                                      type="button"
                                      variant={timeOffForm.hours === h ? "secondary" : "ghost"}
                                      size="sm"
                                      onClick={() => setTimeOffForm(f => ({ ...f, hours: h }))}
                                      data-testid={`button-time-off-preset-${h}`}
                                    >
                                      {h}h
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Notes (optional)</Label>
                              <Input
                                placeholder="e.g., Doctor appointment"
                                value={timeOffForm.notes}
                                onChange={(e) => setTimeOffForm(f => ({ ...f, notes: e.target.value }))}
                                className="h-9"
                                data-testid="input-time-off-notes"
                              />
                            </div>
                          </div>
                        <DialogFooter>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTimeOffPopoverOpen(false)}
                              data-testid="button-cancel-time-off"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleTimeOffSubmit}
                              disabled={!timeOffForm.categoryId || createNonProjectTime.isPending}
                              data-testid="button-submit-time-off"
                            >
                              {createNonProjectTime.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Add"
                              )}
                            </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {hasDraftEntries && viewMode !== "day" && (
                      <Button 
                        onClick={handleSubmitWeek}
                        disabled={submitWeek.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        size="sm"
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

            <TimesheetReminder
              weeklyTotal={totalHoursThisWeek}
              targetHours={weeklyTarget}
              weekStart={dates[0]}
              weekEnd={dates[dates.length - 1]}
              onDismiss={() => setShowReminder(false)}
              visible={showReminder}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                      <Clock className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">{totalHoursThisWeek}h</div>
                      <div className="text-xs text-muted-foreground">Total Hours</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10">
                      <ListTodo className="h-4 w-4 text-teal-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">{filteredAssignedTasks.length}</div>
                      <div className="text-xs text-muted-foreground">Active Tasks</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                      <TrendingUp className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">{Math.round(progressPercent)}%</div>
                      <div className="text-xs text-muted-foreground">of {weeklyTarget}h target</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">Weekly Progress</div>
                      <div className="text-xs font-semibold text-foreground">{totalHoursThisWeek}/{weeklyTarget}h</div>
                    </div>
                    <Progress value={progressPercent} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {nonProjectTimeEntries.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Palmtree className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium">Time Off This Week:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {nonProjectTimeEntries.map(({ entry, category }) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-xs group"
                          data-testid={`time-off-entry-${entry.id}`}
                        >
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: category.color || '#6b7280' }}
                          />
                          <span className="font-medium">{category.name}</span>
                          <span className="text-muted-foreground">
                            {format(parseISO(entry.entryDate), "MMM d")} - {Number(entry.hours)}h
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteTimeOff(entry.id)}
                            data-testid={`delete-time-off-${entry.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="ml-auto text-sm font-medium text-foreground">
                      {nonProjectTimeEntries.reduce((sum, { entry }) => sum + Number(entry.hours), 0)}h total
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

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
                  assignedTasks={filteredAssignedTasks}
                  entries={entries}
                  onSave={handleSave}
                  isSaving={bulkUpsert.isPending}
                  viewMode={viewMode}
                  groupByProject={!filterProjectId}
                  gridData={gridData}
                  setGridData={setGridData}
                  hasChanges={hasChanges}
                  setHasChanges={setHasChanges}
                  onAutoSave={handleAutoSave}
                  isDateInClosedPeriod={isDateInClosedPeriod}
                  getClosedPeriodName={getClosedPeriodName}
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

        {activeTab === "periods" && currentResource?.isApprover && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <PeriodManagementTab />
          </motion.div>
        )}
      </div>
    </div>
  );
}
