import { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DndContext, DragEndEvent, closestCorners, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, addDays, differenceInDays, parseISO, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { calculateEndDateFromWorkingDays, calculateDurationInWorkingDays, calculateStartDateFromEndAndDuration, parseDurationInput, formatDuration } from "@/lib/workingDays";
import { calculateCPM, type CPMResult } from "@/lib/cpm";
import { useUpdateTask, useCreateTask, useDeleteTask, useAddTaskDependency, useRemoveTaskDependency, useReorderTask, useProjectDependencies, useBulkUpdateTasks, useBulkDeleteTasks } from "@/hooks/use-tasks";
import { useTaskResourceAssignments, useUpdateTaskResourceAssignments, useProjectTaskAssignments, useResources, useCreateResource } from "@/hooks/use-resources";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Task, TaskResourceAssignment, Resource, SchedulingDefaults } from "@shared/schema";
import { computeWbsValues } from "@/lib/taskWbs";
import { ResourceAssignment, ResourceAllocation } from "@/components/ResourceAssignment";
import { MicrosoftContactCard } from "@/components/MicrosoftContactCard";
import { GanttDependencyLinks } from "@/components/GanttDependencyLinks";
import { TaskDependenciesSection } from "@/components/TaskDependenciesSection";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Loader2, Plus, Trash2, Pencil, Check, X, GripVertical, Users, Flag, Columns3, Clock, MoreVertical, ZoomIn, ZoomOut, ChevronDown, ChevronRight, ChevronLeft, Milestone as MilestoneIcon, Search, CheckCircle2, Circle, ArrowUpDown, ArrowUp, ArrowDown, Undo2, Redo2, FolderKanban, RefreshCw, Focus, Link2, Link as LinkIcon, IndentIncrease, IndentDecrease, Type, Lock as LockIcon, Calendar as CalendarIcon } from "lucide-react";

export { type ZoomLevel, type GanttColumn, type GanttColumnConfig, GANTT_COLUMNS, COLUMN_CATEGORIES, DEFAULT_GANTT_COLUMNS };

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter' | 'year' | '5year';
const zoomLevels: ZoomLevel[] = ['day', 'week', 'month', 'quarter', 'year', '5year'];
const zoomLabels: Record<ZoomLevel, string> = {
  'day': 'Daily',
  'week': 'Weekly',
  'month': 'Monthly',
  'quarter': 'Quarterly',
  'year': 'Yearly',
  '5year': '5 Years'
};

type GanttColumn = 
  | 'taskIndex' | 'task' | 'taskNumber' | 'wbs' | 'outlineLevel' | 'description'
  | 'startDate' | 'endDate' | 'baselineStartDate' | 'baselineEndDate' | 'actualStartDate' | 'actualEndDate'
  | 'durationDays' | 'progress' | 'status' | 'priority' | 'taskType'
  | 'estimatedHours' | 'actualHours' | 'remainingHours'
  | 'cost' | 'actualCost'
  | 'resources' | 'assignee' 
  | 'constraintType' | 'constraintDate'
  | 'isMilestone' | 'isCritical' | 'isSummary' | 'timesheetBlocked'
  | 'phase' | 'category' | 'labels' | 'notes';

type GanttColumnConfig = { 
  id: GanttColumn; 
  label: string; 
  width: string; 
  widthPx: number;
  category: 'basic' | 'schedule' | 'baseline' | 'effort' | 'cost' | 'assignment' | 'constraints' | 'flags' | 'metadata';
};

const GANTT_COLUMNS: GanttColumnConfig[] = [
  // Basic
  { id: 'taskIndex', label: '#', width: 'w-12', widthPx: 48, category: 'basic' },
  { id: 'wbs', label: 'WBS', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'outlineLevel', label: 'Outline Level', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'task', label: 'Task Name', width: 'w-48', widthPx: 192, category: 'basic' },
  { id: 'taskNumber', label: 'Task #', width: 'w-24', widthPx: 96, category: 'basic' },
  { id: 'description', label: 'Description', width: 'w-48', widthPx: 192, category: 'basic' },
  // Schedule
  { id: 'startDate', label: 'Start Date', width: 'w-24', widthPx: 96, category: 'schedule' },
  { id: 'endDate', label: 'End Date', width: 'w-24', widthPx: 96, category: 'schedule' },
  { id: 'durationDays', label: 'Duration', width: 'w-20', widthPx: 80, category: 'schedule' },
  { id: 'actualStartDate', label: 'Actual Start', width: 'w-24', widthPx: 96, category: 'schedule' },
  { id: 'actualEndDate', label: 'Actual End', width: 'w-24', widthPx: 96, category: 'schedule' },
  // Baseline
  { id: 'baselineStartDate', label: 'Baseline Start', width: 'w-28', widthPx: 112, category: 'baseline' },
  { id: 'baselineEndDate', label: 'Baseline End', width: 'w-28', widthPx: 112, category: 'baseline' },
  // Progress & Status
  { id: 'progress', label: 'Progress %', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'status', label: 'Status', width: 'w-28', widthPx: 112, category: 'basic' },
  { id: 'priority', label: 'Priority', width: 'w-20', widthPx: 80, category: 'basic' },
  { id: 'taskType', label: 'Type', width: 'w-24', widthPx: 96, category: 'basic' },
  // Effort
  { id: 'estimatedHours', label: 'Est. Hours', width: 'w-24', widthPx: 96, category: 'effort' },
  { id: 'actualHours', label: 'Actual Hrs', width: 'w-24', widthPx: 96, category: 'effort' },
  { id: 'remainingHours', label: 'Remain Hrs', width: 'w-24', widthPx: 96, category: 'effort' },
  // Cost
  { id: 'cost', label: 'Budget', width: 'w-24', widthPx: 96, category: 'cost' },
  { id: 'actualCost', label: 'Actual Cost', width: 'w-24', widthPx: 96, category: 'cost' },
  // Assignment
  { id: 'resources', label: 'Resources', width: 'w-32', widthPx: 128, category: 'assignment' },
  { id: 'assignee', label: 'Assignee', width: 'w-28', widthPx: 112, category: 'assignment' },
  // Constraints
  { id: 'constraintType', label: 'Constraint', width: 'w-32', widthPx: 128, category: 'constraints' },
  { id: 'constraintDate', label: 'Constraint Date', width: 'w-28', widthPx: 112, category: 'constraints' },
  // Flags
  { id: 'isMilestone', label: 'Milestone', width: 'w-20', widthPx: 80, category: 'flags' },
  { id: 'isCritical', label: 'Critical', width: 'w-18', widthPx: 72, category: 'flags' },
  { id: 'isSummary', label: 'Summary', width: 'w-20', widthPx: 80, category: 'flags' },
  { id: 'timesheetBlocked', label: 'TS Blocked', width: 'w-20', widthPx: 80, category: 'flags' },
  // Metadata
  { id: 'phase', label: 'Phase', width: 'w-24', widthPx: 96, category: 'metadata' },
  { id: 'category', label: 'Category', width: 'w-24', widthPx: 96, category: 'metadata' },
  { id: 'labels', label: 'Labels', width: 'w-32', widthPx: 128, category: 'metadata' },
  { id: 'notes', label: 'Notes', width: 'w-48', widthPx: 192, category: 'metadata' },
];

const COLUMN_CATEGORIES: { id: GanttColumnConfig['category']; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'baseline', label: 'Baseline' },
  { id: 'effort', label: 'Effort' },
  { id: 'cost', label: 'Cost' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'flags', label: 'Flags' },
  { id: 'metadata', label: 'Metadata' },
];

const DEFAULT_GANTT_COLUMNS: GanttColumn[] = ['taskIndex', 'wbs', 'task', 'startDate', 'endDate', 'durationDays', 'progress', 'estimatedHours', 'resources'];

const READ_ONLY_COLUMNS: GanttColumn[] = ['taskIndex', 'wbs', 'outlineLevel', 'isCritical', 'isSummary', 'resources', 'estimatedHours'];

interface CellPosition {
  taskId: number;
  columnId: GanttColumn;
}

interface CellRange {
  startTaskId: number;
  startColId: GanttColumn;
  endTaskId: number;
  endColId: GanttColumn;
}

// NOTE: Legacy ProjectGanttTaskRow removed - use ProjectGanttTaskRowMeta + ProjectGanttTaskRowTimeline instead

// Inline Editable Cell Component for Gantt
type InlineEditType = 'date' | 'select' | 'number' | 'text' | 'progress' | 'boolean';

interface InlineEditCellProps {
  value: string | number | boolean | null | undefined;
  displayValue: React.ReactNode;
  editType: InlineEditType;
  options?: { value: string; label: string }[];
  onSave: (newValue: string | number | boolean | null) => void;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  suffix?: string;
  externalEditing?: boolean;
  initialCharacter?: string;
  onEditingChange?: (editing: boolean) => void;
}

const InlineEditCell = memo(function InlineEditCell({ 
  value, 
  displayValue, 
  editType, 
  options, 
  onSave, 
  className,
  disabled = false,
  min,
  max,
  suffix = '',
  externalEditing,
  initialCharacter,
  onEditingChange
}: InlineEditCellProps) {
  const [internalEditing, setInternalEditing] = useState(false);
  const isEditing = externalEditing !== undefined ? externalEditing : internalEditing;
  const setIsEditing = useCallback((val: boolean) => {
    if (onEditingChange) onEditingChange(val);
    setInternalEditing(val);
  }, [onEditingChange]);
  const [editValue, setEditValue] = useState<string>('');
  const [selectOpen, setSelectOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingInitialChar = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      if (pendingInitialChar.current) {
        inputRef.current.value = pendingInitialChar.current;
        setEditValue(pendingInitialChar.current);
        pendingInitialChar.current = undefined;
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      } else {
        inputRef.current.select();
      }
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing && editType === 'select') {
      setSelectOpen(true);
    }
  }, [isEditing, editType]);

  useEffect(() => {
    if (externalEditing && !internalEditing) {
      const didStart = startEditInternal(initialCharacter);
      if (didStart) {
        setInternalEditing(true);
      } else if (onEditingChange) {
        onEditingChange(false);
      }
    } else if (!externalEditing && internalEditing) {
      setInternalEditing(false);
    }
  }, [externalEditing]);

  const startEditInternal = (initChar?: string): boolean => {
    if (disabled) return false;
    if (editType === 'boolean') {
      const newVal = !value;
      onSave(newVal);
      return false;
    }
    if (initChar && (editType === 'text' || editType === 'number' || editType === 'progress')) {
      pendingInitialChar.current = initChar;
      setEditValue(initChar);
    } else if (editType === 'date') {
      setEditValue(value ? String(value) : '');
    } else if (editType === 'number' || editType === 'progress') {
      setEditValue(value != null ? String(value) : '');
    } else {
      setEditValue(value ? String(value) : '');
    }
    return true;
  };

  const handleStartEdit = () => {
    if (disabled) return;
    const didStart = startEditInternal();
    if (didStart) setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    if (editType === 'date') {
      onSave(editValue || null);
    } else if (editType === 'number' || editType === 'progress') {
      const numVal = editValue === '' ? null : parseFloat(editValue);
      if (numVal !== null && !isNaN(numVal)) {
        const clampedVal = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, numVal));
        onSave(clampedVal);
      } else {
        onSave(null);
      }
    } else {
      onSave(editValue || null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleSelectChange = (newVal: string) => {
    setSelectOpen(false);
    setIsEditing(false);
    onSave(newVal);
  };

  const handleSelectOpenChange = (open: boolean) => {
    setSelectOpen(open);
    if (!open) {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    if (editType === 'select' && options) {
      return (
        <Select value={String(value || '')} onValueChange={handleSelectChange} open={selectOpen} onOpenChange={handleSelectOpenChange}>
          <SelectTrigger className="text-[10px] px-1 min-h-0 py-0.5" data-testid="inline-edit-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (editType === 'date') {
      const selectedDate = editValue ? parseISO(editValue) : undefined;
      return (
        <Popover open={true} onOpenChange={(open) => { if (!open) { setIsEditing(false); } }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] px-1 w-full min-h-0 h-6 justify-start font-normal"
              data-testid="inline-edit-date"
            >
              <CalendarIcon className="mr-1 h-3 w-3" />
              {selectedDate ? format(selectedDate, 'MM/dd/yyyy') : 'Select date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start" side="bottom">
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate}
              showDateInput
              onDateInputSelect={(date) => {
                const dateStr = format(date, 'yyyy-MM-dd');
                onSave(dateStr);
                setIsEditing(false);
              }}
              onSelect={(date) => {
                if (date) {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  onSave(dateStr);
                }
                setIsEditing(false);
              }}
              initialFocus
            />
            <div className="border-t p-2 flex justify-between">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  onSave(null);
                  setIsEditing(false);
                }}
              >
                Clear
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    if (editType === 'number' || editType === 'progress') {
      return (
        <Input
          ref={inputRef}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          min={min}
          max={max}
          className="text-[10px] px-1 w-full min-h-0 py-0.5"
          data-testid="inline-edit-number"
        />
      );
    }

    return (
      <Input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="text-[10px] px-1 w-full min-h-0 py-0.5"
        data-testid="inline-edit-text"
      />
    );
  }

  return (
    <div 
      className={cn(
        "cursor-pointer hover:bg-muted/50 transition-colors rounded px-0.5 min-h-[18px] flex items-center w-full",
        disabled && "cursor-default hover:bg-transparent",
        className
      )}
      onDoubleClick={handleStartEdit}
      data-testid="inline-edit-display"
    >
      {displayValue}
    </div>
  );
});

const TaskNameCell = memo(function TaskNameCell({
  task,
  colWidth,
  currentLevel,
  hasChildren,
  isCollapsed,
  canIndent,
  canOutdent,
  onToggleCollapse,
  onIndent,
  onOutdent,
  onSetBaseline,
  onClearBaseline,
  onEditDependencies,
  onUpdateName,
  onEdit,
  isReadOnly,
  onCreateTaskAt,
  onDeleteTask,
}: {
  task: Task;
  colWidth: number;
  currentLevel: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  onToggleCollapse: (taskId: number) => void;
  onIndent: (task: Task) => void;
  onOutdent: (task: Task) => void;
  onSetBaseline: (task: Task) => void;
  onClearBaseline: (task: Task) => void;
  onEditDependencies: (task: Task) => void;
  onUpdateName: (taskId: number, name: string) => void;
  onEdit: (task: Task) => void;
  isReadOnly?: boolean;
  onCreateTaskAt?: (task: Task, position: 'above' | 'below') => void;
  onDeleteTask?: (task: Task) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.name);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartInlineEdit = () => {
    if (isReadOnly) return;
    setEditValue(task.name);
    setIsEditing(true);
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(task);
  };

  const handleSave = () => {
    if (editValue.trim() && editValue !== task.name) {
      onUpdateName(task.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(task.name);
      setIsEditing(false);
    }
  };

  return (
    <div 
      style={{ width: `${colWidth}px`, paddingLeft: `${4 + (currentLevel - 1) * 12}px` }}
      className={cn(
        "flex-shrink-0 border-r px-1 flex items-center overflow-hidden min-w-0 group/taskname relative",
        hasChildren && "font-semibold bg-muted/30"
      )}
    >
      {/* Left arrow button (outdent) */}
      {canOutdent && (
        <button 
          className="absolute left-0 top-0 bottom-0 flex items-center justify-center w-5 opacity-0 group-hover/taskname:opacity-100 transition-opacity cursor-pointer z-10 hover:bg-primary/20"
          onClick={(e) => { e.stopPropagation(); onOutdent(task); }}
          data-testid={`task-outdent-btn-${task.id}`}
        >
          <ChevronLeft className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      
      {/* Right arrow button (indent) */}
      {canIndent && (
        <button 
          className="absolute right-6 top-0 bottom-0 flex items-center justify-center w-5 opacity-0 group-hover/taskname:opacity-100 transition-opacity cursor-pointer z-10 hover:bg-primary/20"
          onClick={(e) => { e.stopPropagation(); onIndent(task); }}
          data-testid={`task-indent-btn-${task.id}`}
        >
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
      )}

      <div className="truncate flex items-center gap-0.5 flex-1 min-w-0">
        {hasChildren ? (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-4 w-4 p-0 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(task.id); }}
            data-testid={`task-toggle-${task.id}`}
          >
            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        {task.isMilestone && <MilestoneIcon className="h-3 w-3 text-primary flex-shrink-0" />}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-background border border-primary rounded px-1 text-[11px] h-5 outline-none"
            data-testid={`task-name-input-${task.id}`}
          />
        ) : (
          <span 
            className={cn(
              "truncate cursor-pointer hover:bg-muted/50 px-0.5 rounded flex items-center gap-1 hover:underline",
              task.progress === 100 && "line-through text-muted-foreground"
            )}
            onClick={handleNameClick}
            data-testid={`task-name-${task.id}`}
          >
            {task.progress === 100 && (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            )}
            {task.name}
          </span>
        )}
      </div>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-5 w-5 p-0 flex-shrink-0 opacity-0 group-hover/taskname:opacity-100 transition-opacity" 
            onClick={(e) => e.stopPropagation()}
            data-testid={`task-actions-${task.id}`}
          >
            <MoreVertical className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(task); }} data-testid={`task-edit-${task.id}`}>
            <Pencil className="h-3.5 w-3.5 mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartInlineEdit(); }} disabled={isReadOnly} data-testid={`task-rename-${task.id}`}>
            <Type className="h-3.5 w-3.5 mr-2" />
            Edit Task Name
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditDependencies(task); }} data-testid={`task-dependencies-${task.id}`}>
            <Link2 className="h-3.5 w-3.5 mr-2" />
            Dependencies
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetBaseline(task); }} disabled={!task.startDate || !task.endDate} data-testid={`task-set-baseline-${task.id}`}>
            <Flag className="h-3.5 w-3.5 mr-2" />
            Set Baseline
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClearBaseline(task); }} disabled={!task.baselineStartDate && !task.baselineEndDate} data-testid={`task-clear-baseline-${task.id}`}>
            <X className="h-3.5 w-3.5 mr-2" />
            Clear Baseline
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onIndent(task); }} disabled={!canIndent} data-testid={`task-indent-${task.id}`}>
            <ChevronRight className="h-3.5 w-3.5 mr-2" />
            Indent
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOutdent(task); }} disabled={!canOutdent} data-testid={`task-outdent-${task.id}`}>
            <ChevronLeft className="h-3.5 w-3.5 mr-2" />
            Outdent
          </DropdownMenuItem>
          {onCreateTaskAt && !isReadOnly && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateTaskAt(task, 'above'); }} data-testid={`task-create-above-${task.id}`}>
                <ArrowUp className="h-3.5 w-3.5 mr-2" />
                Create Task Above
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateTaskAt(task, 'below'); }} data-testid={`task-create-below-${task.id}`}>
                <ArrowDown className="h-3.5 w-3.5 mr-2" />
                Create Task Below
              </DropdownMenuItem>
            </>
          )}
          {onDeleteTask && !isReadOnly && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); setIsDeleteDialogOpen(true); }}
                className="text-destructive focus:text-destructive"
                data-testid={`task-delete-${task.id}`}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete Task
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{task.name}"? You can undo this with Ctrl+Z.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid={`task-delete-cancel-${task.id}`}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDeleteTask?.(task); setIsDeleteDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid={`task-delete-confirm-${task.id}`}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

// Sortable task row wrapper for drag and drop reordering
function SortableTaskRow({ 
  task, 
  children,
  disabled = false,
}: { 
  task: Task; 
  children: (dragHandleProps: { listeners: Record<string, unknown>; attributes: Record<string, unknown> }) => React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style as React.CSSProperties}>
      {children({ listeners: listeners || {}, attributes: (attributes || {}) as unknown as Record<string, unknown> })}
    </div>
  );
}

// Split-pane Gantt: Metadata row (left pane)
const ProjectGanttTaskRowMeta = memo(function ProjectGanttTaskRowMeta({ 
  task, 
  rowIndex,
  visibleColumns,
  organizationId,
  onIndent,
  onOutdent,
  hasChildren,
  isCollapsed,
  dragHandleProps,
  onToggleCollapse,
  projectName,
  onSetBaseline,
  onClearBaseline,
  onEditDependencies,
  onEdit,
  columnWidths,
  showBaseline,
  baselineSelectionMode,
  isSelectedForBaseline,
  onToggleBaselineSelection,
  showCriticalPath,
  isOnCriticalPath,
  onTrackChange,
  prevTaskLevel,
  isSelected,
  onToggleSelection,
  hasDependencies,
  computedWbs,
  isReadOnly,
  onCreateTaskAt,
  onDeleteTask,
  preloadedAssignments,
  precomputedDates,
  focusedCell,
  selectionRange,
  isRowInSelectionRange,
  onCellClick,
  editingCell,
  editingInitialChar,
  onEditingChange,
}: { 
  task: Task;
  rowIndex: number;
  visibleColumns: GanttColumn[];
  organizationId: number | null;
  onIndent: (task: Task) => void;
  onOutdent: (task: Task) => void;
  hasChildren: boolean;
  isCollapsed: boolean;
  dragHandleProps?: { listeners: Record<string, unknown>; attributes: Record<string, unknown> };
  onToggleCollapse: (taskId: number) => void;
  projectName?: string;
  onSetBaseline: (task: Task) => void;
  onClearBaseline: (task: Task) => void;
  onEditDependencies: (task: Task) => void;
  onEdit: (task: Task) => void;
  columnWidths?: Record<GanttColumn, number>;
  showBaseline: boolean;
  baselineSelectionMode: boolean;
  isSelectedForBaseline: boolean;
  onToggleBaselineSelection: (taskId: number, hasChildren: boolean) => void;
  showCriticalPath: boolean;
  isOnCriticalPath: boolean;
  onTrackChange?: (taskId: number, projectId: number, before: Record<string, unknown>, after: Record<string, unknown>, label: string) => void;
  prevTaskLevel?: number;
  isSelected: boolean;
  onToggleSelection: (taskId: number, shiftKey?: boolean) => void;
  hasDependencies?: boolean;
  computedWbs?: string;
  isReadOnly?: boolean;
  onCreateTaskAt?: (task: Task, position: 'above' | 'below') => void;
  onDeleteTask?: (task: Task) => void;
  preloadedAssignments?: (TaskResourceAssignment & { resource: Resource })[];
  precomputedDates?: {
    startFormatted: string;
    endFormatted: string;
    baselineStartFormatted: string;
    baselineEndFormatted: string;
    actualStartFormatted: string;
    actualEndFormatted: string;
    constraintDateFormatted: string;
    duration: number | null;
  };
  focusedCell?: CellPosition | null;
  selectionRange?: CellRange | null;
  isRowInSelectionRange?: boolean;
  onCellClick?: (taskId: number, columnId: GanttColumn, shiftKey?: boolean) => void;
  editingCell?: CellPosition | null;
  editingInitialChar?: string;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [isEditingResources, setIsEditingResources] = useState(false);
  const { data: fetchedAssignments, isLoading: assignmentsLoading } = useTaskResourceAssignments(isEditingResources ? task.id : null);
  const taskAssignments = fetchedAssignments ?? preloadedAssignments;
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const updateTask = useUpdateTask();
  const { toast } = useToast();
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const inviteAssignedRef = useRef(false);
  
  const handleInlineUpdate = (field: string, value: string | number | boolean | null, oldValue?: unknown) => {
    // Prevent updates for read-only projects (Planner and MS Project imports)
    if (isReadOnly) return;
    
    // Build update object with auto-calculated related fields
    const updates: Record<string, string | number | boolean | null> = {
      [field]: value,
    };
    
    // Duration semantics (working days - excludes weekends):
    // - 0 = milestone marker (treated as same-day, end = start)
    // - 1 = single working day task (start == end if start is a weekday)
    // - N = N working-day task (end = N working days from start)
    
    if (field === 'taskType' && value === 'Ongoing') {
      updates.isOngoing = true;
      updates.startDate = null;
      updates.endDate = null;
      updates.durationDays = null;
      updates.isMilestone = false;
    } else if (field === 'taskType' && oldValue === 'Ongoing' && value !== 'Ongoing') {
      updates.isOngoing = false;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      updates.startDate = todayStr;
      updates.endDate = calculateEndDateFromWorkingDays(todayStr, 1);
      updates.durationDays = 1;
    }

    // Auto-calculate duration when start or end date changes
    if (field === 'startDate') {
      if (value) {
        const currentDuration = task.durationDays ?? (task.startDate && task.endDate
          ? calculateDurationInWorkingDays(task.startDate, task.endDate) : 1);
        if (currentDuration === 0) {
          updates.endDate = value as string;
        } else {
          updates.endDate = calculateEndDateFromWorkingDays(value as string, currentDuration);
        }
        updates.durationDays = currentDuration;
      } else {
        updates.endDate = null;
        updates.durationDays = null;
      }
    } else if (field === 'endDate') {
      if (value && task.startDate) {
        const start = parseISO(task.startDate);
        const end = parseISO(value as string);
        if (end >= start) {
          const calculatedDuration = calculateDurationInWorkingDays(task.startDate, value as string);
          updates.durationDays = calculatedDuration;
        } else {
          toast({
            title: "Invalid date",
            description: `End date cannot be before start date (${format(start, 'MM/dd/yyyy')})`,
            variant: "destructive"
          });
          return;
        }
      } else if (value && !task.startDate) {
        const duration = task.durationDays ?? 1;
        if (duration === 0) {
          updates.startDate = value as string;
        } else {
          updates.startDate = calculateStartDateFromEndAndDuration(value as string, duration);
        }
        updates.durationDays = duration;
      } else if (!value) {
        updates.durationDays = null;
      }
    }
    // Auto-calculate end date when duration changes (working days)
    else if (field === 'durationDays') {
      const parsed = Number(value);
      if (value === null || value === undefined || isNaN(parsed) || parsed < 0) return;
      const duration = parsed;
      updates.durationDays = duration;
      
      if (duration === 0) {
        updates.isMilestone = true;
        if (task.startDate) {
          updates.endDate = task.startDate;
        }
      } else {
        updates.isMilestone = false;
        if (task.startDate) {
          updates.endDate = calculateEndDateFromWorkingDays(task.startDate, duration);
        }
      }
    }
    
    if (onTrackChange) {
      const beforeSnapshot: Record<string, unknown> = {};
      const afterSnapshot: Record<string, unknown> = {};
      for (const key of Object.keys(updates)) {
        beforeSnapshot[key] = (task as Record<string, unknown>)[key] ?? null;
        afterSnapshot[key] = updates[key];
      }
      const fieldLabels: Record<string, string> = {
        startDate: 'Start Date', endDate: 'End Date', durationDays: 'Duration',
        name: 'Name', status: 'Status', progress: 'Progress', outlineLevel: 'Outline Level',
        isMilestone: 'Milestone',
      };
      onTrackChange(task.id, task.projectId, beforeSnapshot, afterSnapshot, fieldLabels[field] || field);
    }
    
    updateTask.mutate({
      id: task.id,
      projectId: task.projectId,
      ...updates,
    }, {
      onSuccess: (result) => {
        if (result?.datesCorrectedByDependency) {
          toast({ title: "Dates adjusted", description: "The dates were adjusted to respect task dependencies", variant: "default" });
        }
      },
      onError: (error) => {
        toast({ 
          title: "Update failed", 
          description: error instanceof Error ? error.message : "Failed to update task", 
          variant: "destructive" 
        });
      }
    });
  };

  useEffect(() => {
    if (taskAssignments && !hasInitialized) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
      setHasInitialized(true);
    }
  }, [taskAssignments, hasInitialized]);

  useEffect(() => {
    if (!isEditingResources) {
      setHasInitialized(false);
    }
  }, [isEditingResources]);

  useEffect(() => {
    if (isEditingResources && taskAssignments) {
      setSelectedResourceIds(taskAssignments.map(a => a.resourceId));
      // Initialize allocations from existing task assignments
      setAllocations(taskAssignments.map(a => ({
        resourceId: a.resourceId,
        allocationPercentage: a.allocationPercentage ?? 100
      })));
    }
  }, [isEditingResources, taskAssignments]);

  const assignedNames = taskAssignments && taskAssignments.length > 0
    ? taskAssignments.map(a => a.resource.displayName).join(", ")
    : "—";

  const handleSaveResources = () => {
    if (!inviteAssignedRef.current) {
      updateTaskResources.mutate({ 
        taskId: task.id, 
        resourceIds: selectedResourceIds,
        allocations: allocations.filter(a => selectedResourceIds.includes(a.resourceId)),
        expectedUpdatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : undefined,
      });
    }
    inviteAssignedRef.current = false;
    setIsEditingResources(false);
  };

  const progressPercent = task.progress || 0;
  const currentLevel = task.outlineLevel || 1;
  // canIndent: Check max level (6) AND hierarchy rule (can only indent one level deeper than previous task)
  // First task (no previous) cannot be indented past level 1
  const maxAllowedLevel = prevTaskLevel !== undefined ? Math.min(6, prevTaskLevel + 1) : 1;
  const canIndent = currentLevel < maxAllowedLevel;
  const canOutdent = currentLevel > 1;

  // Match timeline row height when baseline is shown
  const hasBaseline = task.baselineStartDate && task.baselineEndDate;
  const rowHeight = showBaseline && hasBaseline ? 'h-[36px]' : 'h-[28px]';

  const hasValidDates = task.startDate && task.endDate;
  
  // Critical path styling: highlight critical tasks in red, grey out non-critical tasks
  const isNonCritical = showCriticalPath && !isOnCriticalPath;
  const isCritical = showCriticalPath && isOnCriticalPath;

  return (
    <div 
      className={cn(
        "flex border-b hover:bg-muted/30 transition-colors group", 
        rowHeight,
        isSelectedForBaseline && baselineSelectionMode && "bg-primary/5",
        isNonCritical && "opacity-40",
        isCritical && "bg-red-50 dark:bg-red-950/30 border-l-2 border-l-red-500",
        hasDependencies && !isCritical && "bg-amber-50/50 dark:bg-amber-950/20"
      )}
      data-testid={`gantt-task-meta-${task.id}`}
    >
      {/* Bulk selection checkbox column */}
      <div
        className="w-8 flex-shrink-0 border-r flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelection(task.id, e.shiftKey);
        }}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {}}
          data-testid={`bulk-select-${task.id}`}
        />
      </div>
      {/* Baseline selection checkbox column */}
      {baselineSelectionMode && (
        <div className="w-8 flex-shrink-0 border-r flex items-center justify-center">
          <Checkbox
            checked={isSelectedForBaseline}
            onCheckedChange={() => onToggleBaselineSelection(task.id, hasChildren)}
            disabled={!hasValidDates}
            data-testid={`baseline-select-${task.id}`}
          />
        </div>
      )}
      {/* Drag handle column */}
      <div className="w-8 flex-shrink-0 border-r flex items-center justify-center">
        <button
          className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground touch-none"
          data-testid={`task-drag-handle-${task.id}`}
          {...(dragHandleProps?.listeners || {})}
          {...(dragHandleProps?.attributes || {})}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </div>
      
      {/* Dynamic column rendering */}
      {visibleColumns.map(colId => {
        const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
        if (!colConfig) return null;
        
        const colWidth = columnWidths?.[colId] || colConfig.widthPx;
        
        if (colId === 'task') {
          const isCellFocusedTask = focusedCell?.taskId === task.id && focusedCell?.columnId === 'task';
          const isTaskInRange = isRowInSelectionRange && (() => {
            if (!selectionRange) return false;
            const ci = visibleColumns.indexOf('task');
            const sc = visibleColumns.indexOf(selectionRange.startColId);
            const ec = visibleColumns.indexOf(selectionRange.endColId);
            return ci >= Math.min(sc, ec) && ci <= Math.max(sc, ec);
          })();
          return (
            <div
              key={colId}
              data-cell-task={task.id}
              data-cell-col="task"
              className={cn(
                isCellFocusedTask && "ring-2 ring-primary ring-inset z-10",
                isTaskInRange && !isCellFocusedTask && "bg-primary/10"
              )}
              onMouseDown={(e) => { onCellClick?.(task.id, 'task', e.shiftKey); }}
            >
              <TaskNameCell
                task={task}
                colWidth={colWidth}
                currentLevel={currentLevel}
                hasChildren={hasChildren}
                isCollapsed={isCollapsed}
                canIndent={canIndent}
                canOutdent={canOutdent}
                onToggleCollapse={onToggleCollapse}
                onIndent={onIndent}
                onOutdent={onOutdent}
                onSetBaseline={onSetBaseline}
                onClearBaseline={onClearBaseline}
                onEditDependencies={onEditDependencies}
                onUpdateName={(taskId, name) => handleInlineUpdate('name', name, task.name)}
                onEdit={onEdit}
                isReadOnly={isReadOnly}
                onCreateTaskAt={onCreateTaskAt}
                onDeleteTask={onDeleteTask}
              />
            </div>
          );
        }
        
        if (colId === 'resources') {
          const isCellFocusedRes = focusedCell?.taskId === task.id && focusedCell?.columnId === 'resources';
          const isResInRange = isRowInSelectionRange && (() => {
            if (!selectionRange) return false;
            const ci = visibleColumns.indexOf('resources');
            const sc = visibleColumns.indexOf(selectionRange.startColId);
            const ec = visibleColumns.indexOf(selectionRange.endColId);
            return ci >= Math.min(sc, ec) && ci <= Math.max(sc, ec);
          })();
          return (
            <div key={colId} data-cell-task={task.id} data-cell-col="resources" onMouseDown={(e) => { onCellClick?.(task.id, 'resources', e.shiftKey); }}>
              <div 
                style={{ width: `${colWidth}px` }}
                className={cn(
                  "flex-shrink-0 border-r px-1 text-muted-foreground flex items-center h-[28px] overflow-hidden min-w-0",
                  !hasChildren && !isReadOnly && "cursor-pointer hover:bg-muted/50",
                  isCellFocusedRes && "ring-2 ring-primary ring-inset z-10",
                  isResInRange && !isCellFocusedRes && "bg-primary/10"
                )}
                onClick={(e) => { e.stopPropagation(); if (!hasChildren && !isReadOnly) setIsEditingResources(true); }}
              >
                {hasChildren ? (
                  <span className="text-muted-foreground/70 italic truncate w-full">Summary</span>
                ) : taskAssignments && taskAssignments.length > 0 ? (
                  <div className="flex items-center gap-1 truncate w-full">
                    {taskAssignments.slice(0, 3).map((assignment, idx) => (
                      <MicrosoftContactCard
                        key={assignment.resourceId}
                        displayName={assignment.resource.displayName}
                        email={assignment.resource.email}
                        title={assignment.resource.title}
                        department={assignment.resource.department}
                        phone={assignment.resource.phone}
                        photoUrl={assignment.resource.photoUrl}
                        side="top"
                      >
                        <span className="text-xs hover:text-primary hover:underline cursor-pointer">
                          {assignment.resource.displayName}{idx < Math.min(taskAssignments.length, 3) - 1 ? ',' : ''}
                        </span>
                      </MicrosoftContactCard>
                    ))}
                    {taskAssignments.length > 3 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground">+{taskAssignments.length - 3} more</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            {taskAssignments.slice(3).map(a => (
                              <p key={a.resourceId} className="text-xs">{a.resource.displayName}</p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ) : (
                  <span className="truncate w-full text-muted-foreground/50">—</span>
                )}
              </div>
              <Dialog open={isEditingResources} onOpenChange={setIsEditingResources}>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Assign Resources</DialogTitle>
                    <DialogDescription>Assign team members to task "{task.name}"</DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <ResourceAssignment
                      organizationId={organizationId}
                      selectedResourceIds={selectedResourceIds}
                      onSelectionChange={setSelectedResourceIds}
                      allocations={allocations}
                      onAllocationsChange={setAllocations}
                      showAllocations={true}
                      label="Assigned Resources"
                      projectId={task.projectId}
                      projectName={projectName}
                      taskId={task.id}
                      taskName={task.name}
                      onInviteAssigned={() => { inviteAssignedRef.current = true; }}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditingResources(false)}>Cancel</Button>
                    <Button onClick={handleSaveResources} disabled={assignmentsLoading}>{assignmentsLoading ? "Loading..." : "Save"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          );
        }
        
        const centerAlign = ['progress', 'isMilestone', 'isCritical', 'isSummary', 'timesheetBlocked', 'durationDays'].includes(colId);
        const isSummaryTask = hasChildren;
        
        const statusOptions = [
          { value: 'Not Started', label: 'Not Started' },
          { value: 'In Progress', label: 'In Progress' },
          { value: 'Completed', label: 'Completed' },
        ];
        
        const priorityOptions = [
          { value: 'Low', label: 'Low' },
          { value: 'Medium', label: 'Medium' },
          { value: 'High', label: 'High' },
          { value: 'Critical', label: 'Critical' },
        ];
        
        const taskTypeOptions = [
          { value: 'Work', label: 'Work' },
          { value: 'Milestone', label: 'Milestone' },
          { value: 'Summary', label: 'Summary' },
          { value: 'Ongoing', label: 'Ongoing' },
        ];
        
        const constraintTypeOptions = [
          { value: 'As Soon As Possible', label: 'ASAP' },
          { value: 'As Late As Possible', label: 'ALAP' },
          { value: 'Must Start On', label: 'MSO' },
          { value: 'Must Finish On', label: 'MFO' },
          { value: 'Start No Earlier Than', label: 'SNET' },
          { value: 'Start No Later Than', label: 'SNLT' },
          { value: 'Finish No Earlier Than', label: 'FNET' },
          { value: 'Finish No Later Than', label: 'FNLT' },
        ];

        const isCellBeingEdited = editingCell?.taskId === task.id && editingCell?.columnId === colId;
        const cellEditProps = {
          externalEditing: isCellBeingEdited || undefined,
          initialCharacter: isCellBeingEdited ? editingInitialChar : undefined,
          onEditingChange: (editing: boolean) => {
            if (!editing && onEditingChange) onEditingChange(false);
          },
        };

        const renderEditableCell = () => {
          switch (colId) {
            case 'taskIndex':
              return (
                <div className="text-center font-mono text-muted-foreground">
                  {rowIndex}
                </div>
              );
            case 'taskNumber':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.taskNumber}
                  displayValue={<span className="truncate">{task.taskNumber || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('taskNumber', val as string | null, task.taskNumber)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'wbs':
              // Use computed WBS if available, otherwise fall back to stored value
              const displayWbs = computedWbs || task.wbs || '—';
              return (
                <span className="truncate font-mono text-muted-foreground">{displayWbs}</span>
              );
            case 'outlineLevel':
              return (
                <span className="truncate text-muted-foreground">{task.outlineLevel || 1}</span>
              );
            case 'description':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.description}
                  displayValue={<span className="truncate">{task.description || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('description', val as string | null, task.description)}
                  disabled={isReadOnly}
                />
              );
            case 'startDate':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.startDate}
                  displayValue={precomputedDates?.startFormatted ?? (task.startDate ? format(parseISO(task.startDate), 'MM/dd/yyyy') : '—')}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('startDate', val as string | null, task.startDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'endDate':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.endDate}
                  displayValue={precomputedDates?.endFormatted ?? (task.endDate ? format(parseISO(task.endDate), 'MM/dd/yyyy') : '—')}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('endDate', val as string | null, task.endDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'baselineStartDate':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.baselineStartDate}
                  displayValue={precomputedDates?.baselineStartFormatted ?? (task.baselineStartDate ? format(parseISO(task.baselineStartDate), 'MM/dd/yyyy') : '—')}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('baselineStartDate', val as string | null, task.baselineStartDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'baselineEndDate':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.baselineEndDate}
                  displayValue={precomputedDates?.baselineEndFormatted ?? (task.baselineEndDate ? format(parseISO(task.baselineEndDate), 'MM/dd/yyyy') : '—')}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('baselineEndDate', val as string | null, task.baselineEndDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'actualStartDate':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.actualStartDate}
                  displayValue={precomputedDates?.actualStartFormatted ?? (task.actualStartDate ? format(parseISO(task.actualStartDate), 'MM/dd/yyyy') : '—')}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('actualStartDate', val as string | null, task.actualStartDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'actualEndDate':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.actualEndDate}
                  displayValue={precomputedDates?.actualEndFormatted ?? (task.actualEndDate ? format(parseISO(task.actualEndDate), 'MM/dd/yyyy') : '—')}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('actualEndDate', val as string | null, task.actualEndDate)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'durationDays':
              const calculatedDuration = task.durationDays != null ? task.durationDays : (precomputedDates?.duration ?? ((task.startDate && task.endDate)
                ? (task.startDate === task.endDate ? 0 : calculateDurationInWorkingDays(task.startDate, task.endDate))
                : null));
              return (
                <InlineEditCell {...cellEditProps}
                  value={calculatedDuration != null ? formatDuration(calculatedDuration) : ''}
                  displayValue={calculatedDuration != null ? formatDuration(calculatedDuration) : '—'}
                  editType="text"
                  onSave={(val) => {
                    const parsed = parseDurationInput(String(val ?? ''));
                    handleInlineUpdate('durationDays', parsed, calculatedDuration);
                  }}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'progress':
              return (
                <InlineEditCell {...cellEditProps}
                  value={progressPercent}
                  displayValue={`${progressPercent}%`}
                  editType="progress"
                  min={0}
                  max={100}
                  onSave={(val) => handleInlineUpdate('progress', val as number | null, task.progress)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'status':
              const statusBadge = task.status ? (
                <Badge variant="outline" className={cn("text-[9px] px-1 py-0", 
                  task.status === 'Completed' && "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-700",
                  task.status === 'In Progress' && "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:border-blue-700",
                  task.status === 'Not Started' && "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                )}>
                  {task.status === 'In Progress' ? 'WIP' : task.status === 'Not Started' ? 'New' : 'Done'}
                </Badge>
              ) : '—';
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.status}
                  displayValue={statusBadge}
                  editType="select"
                  options={statusOptions}
                  onSave={(val) => handleInlineUpdate('status', val as string | null, task.status)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'priority':
              const priorityBadge = task.priority ? (
                <Badge variant="outline" className={cn("text-[9px] px-1 py-0",
                  task.priority === 'Critical' && "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-400 dark:border-red-700",
                  task.priority === 'High' && "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-400 dark:border-orange-700",
                  task.priority === 'Medium' && "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-700",
                  task.priority === 'Low' && "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                )}>
                  {task.priority[0]}
                </Badge>
              ) : '—';
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.priority}
                  displayValue={priorityBadge}
                  editType="select"
                  options={priorityOptions}
                  onSave={(val) => handleInlineUpdate('priority', val as string | null, task.priority)}
                  disabled={isReadOnly}
                />
              );
            case 'taskType':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.taskType}
                  displayValue={<span className="truncate">{task.taskType || '—'}</span>}
                  editType="select"
                  options={taskTypeOptions}
                  onSave={(val) => handleInlineUpdate('taskType', val as string | null, task.taskType)}
                  disabled={isReadOnly}
                />
              );
            case 'estimatedHours':
              // Est Hours is read-only - calculated from resource assignments
              const durationForCalc = task.durationDays ?? (task.startDate && task.endDate 
                ? calculateDurationInWorkingDays(task.startDate, task.endDate)
                : 0);
              const estHoursBreakdown = taskAssignments?.map(assignment => {
                const weeklyCapacity = Number(assignment.resource.weeklyCapacity) || 40;
                const dailyHours = weeklyCapacity / 5;
                const allocation = assignment.allocationPercentage ?? 100;
                const hoursContributed = (allocation / 100) * dailyHours * durationForCalc;
                const remainingAvailability = (assignment.resource.availability ?? 100) - allocation;
                return {
                  displayName: assignment.resource.displayName,
                  email: assignment.resource.email,
                  hours: Math.round(hoursContributed * 10) / 10,
                  allocation,
                  remainingAvailability: Math.max(0, remainingAvailability),
                };
              }) || [];
              
              return (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <div 
                      className={cn(
                        "px-2 h-full flex items-center cursor-default",
                        task.estimatedHours != null ? "text-foreground font-medium" : "text-muted-foreground"
                      )}
                    >
                      {task.estimatedHours != null ? `${task.estimatedHours}h` : '—'}
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-[340px] p-0" side="top">
                    <div className="p-4 border-b bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                          <Clock className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">Hours Breakdown</h4>
                          <p className="text-xs text-muted-foreground">{estHoursBreakdown.length} team member{estHoursBreakdown.length !== 1 ? 's' : ''} assigned</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 space-y-2 max-h-[240px] overflow-y-auto">
                      {estHoursBreakdown.length > 0 ? (
                        <>
                          {estHoursBreakdown.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-sm font-semibold shrink-0">
                                {item.displayName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{item.displayName}</div>
                                <div className="text-xs text-muted-foreground truncate">{item.email || 'No email'}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-semibold text-sm text-primary">{item.hours}h</div>
                                <div className="text-[10px] text-muted-foreground">{item.allocation}% allocated</div>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground">No resources assigned</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">Assign resources to calculate hours</p>
                        </div>
                      )}
                    </div>
                    {estHoursBreakdown.length > 0 && (
                      <div className="p-3 border-t bg-muted/20 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total Estimated</span>
                        <span className="font-bold text-lg text-primary">{task.estimatedHours || 0}h</span>
                      </div>
                    )}
                  </HoverCardContent>
                </HoverCard>
              );
            case 'actualHours':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.actualHours}
                  displayValue={task.actualHours != null ? `${task.actualHours}h` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('actualHours', val as number | null, task.actualHours)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'remainingHours':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.remainingHours}
                  displayValue={task.remainingHours != null ? `${task.remainingHours}h` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('remainingHours', val as number | null, task.remainingHours)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'cost':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.cost != null ? Number(task.cost) : null}
                  displayValue={task.cost != null ? `$${Number(task.cost).toLocaleString()}` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('cost', val != null ? String(val) : null, task.cost)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'actualCost':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.actualCost != null ? Number(task.actualCost) : null}
                  displayValue={task.actualCost != null ? `$${Number(task.actualCost).toLocaleString()}` : '—'}
                  editType="number"
                  min={0}
                  onSave={(val) => handleInlineUpdate('actualCost', val != null ? String(val) : null, task.actualCost)}
                  disabled={isSummaryTask || isReadOnly}
                />
              );
            case 'assignee':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.assignee}
                  displayValue={<span className="truncate">{task.assignee || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('assignee', val as string | null, task.assignee)}
                  disabled={isReadOnly}
                />
              );
            case 'constraintType':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.constraintType}
                  displayValue={<span className="truncate">{task.constraintType || '—'}</span>}
                  editType="select"
                  options={constraintTypeOptions}
                  onSave={(val) => handleInlineUpdate('constraintType', val as string | null, task.constraintType)}
                  disabled={isReadOnly}
                />
              );
            case 'constraintDate':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.constraintDate}
                  displayValue={precomputedDates?.constraintDateFormatted ?? (task.constraintDate ? format(parseISO(task.constraintDate), 'MM/dd/yyyy') : '—')}
                  editType="date"
                  onSave={(val) => handleInlineUpdate('constraintDate', val as string | null, task.constraintDate)}
                  disabled={isReadOnly}
                />
              );
            case 'isMilestone':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.isMilestone}
                  displayValue={task.isMilestone ? <Check className="h-3 w-3 text-primary mx-auto" /> : <span className="text-muted-foreground/50">—</span>}
                  editType="boolean"
                  onSave={(val) => handleInlineUpdate('isMilestone', val as boolean, task.isMilestone)}
                  disabled={isReadOnly}
                />
              );
            case 'isCritical':
              return isOnCriticalPath
                ? <Check className="h-3 w-3 text-red-500 mx-auto" />
                : <span className="text-muted-foreground/50">—</span>;
            case 'isSummary':
              return task.isSummary ? <Check className="h-3 w-3 text-blue-500 mx-auto" /> : <span className="text-muted-foreground/50">—</span>;
            case 'timesheetBlocked':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.timesheetBlocked}
                  displayValue={task.timesheetBlocked ? <LockIcon className="h-3 w-3 text-amber-500 mx-auto" /> : <span className="text-muted-foreground/50">—</span>}
                  editType="boolean"
                  onSave={(val) => handleInlineUpdate('timesheetBlocked', val as boolean, task.timesheetBlocked)}
                  disabled={isReadOnly}
                />
              );
            case 'phase':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.phase}
                  displayValue={<span className="truncate">{task.phase || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('phase', val as string | null, task.phase)}
                  disabled={isReadOnly}
                />
              );
            case 'category':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.category}
                  displayValue={<span className="truncate">{task.category || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('category', val as string | null, task.category)}
                  disabled={isReadOnly}
                />
              );
            case 'labels':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.labels}
                  displayValue={<span className="truncate">{task.labels || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('labels', val as string | null, task.labels)}
                  disabled={isReadOnly}
                />
              );
            case 'notes':
              return (
                <InlineEditCell {...cellEditProps}
                  value={task.notes}
                  displayValue={<span className="truncate">{task.notes || '—'}</span>}
                  editType="text"
                  onSave={(val) => handleInlineUpdate('notes', val as string | null, task.notes)}
                  disabled={isReadOnly}
                />
              );
            default:
              return '—';
          }
        };
        
        const isCellFocused = focusedCell?.taskId === task.id && focusedCell?.columnId === colId;
        const isCellInRange = (() => {
          if (!selectionRange || !isRowInSelectionRange) return false;
          const colIdx = visibleColumns.indexOf(colId);
          const startColIdx = visibleColumns.indexOf(selectionRange.startColId);
          const endColIdx = visibleColumns.indexOf(selectionRange.endColId);
          const minCol = Math.min(startColIdx, endColIdx);
          const maxCol = Math.max(startColIdx, endColIdx);
          return colIdx >= minCol && colIdx <= maxCol;
        })();

        return (
          <div 
            key={colId}
            data-cell-task={task.id}
            data-cell-col={colId}
            style={{ width: `${colWidth}px` }}
            className={cn(
              "flex-shrink-0 border-r px-1 text-muted-foreground flex items-center h-[28px] overflow-hidden min-w-0",
              centerAlign && "justify-center",
              colId === 'progress' && "font-medium",
              isCellFocused && "ring-2 ring-primary ring-inset z-10",
              isCellInRange && !isCellFocused && "bg-primary/10"
            )}
            onMouseDown={(e) => {
              onCellClick?.(task.id, colId, e.shiftKey);
            }}
          >
            <span className="truncate w-full">{renderEditableCell()}</span>
          </div>
        );
      })}
    </div>
  );
});

// Split-pane Gantt: Timeline row (right pane)
const ProjectGanttTaskRowTimeline = memo(function ProjectGanttTaskRowTimeline({ 
  task, 
  onTaskClick, 
  minDate, 
  maxDate,
  hasChildren,
  showBaseline,
  showCriticalPath,
  isOnCriticalPath,
  hasDependencies,
  precomputedDates,
}: { 
  task: Task; 
  onTaskClick: (task: Task) => void;
  minDate: Date;
  maxDate: Date;
  hasChildren: boolean;
  showBaseline: boolean;
  showCriticalPath: boolean;
  isOnCriticalPath: boolean;
  hasDependencies?: boolean;
  precomputedDates?: { start: Date | null; end: Date | null; baselineStart: Date | null; baselineEnd: Date | null };
}) {
  const hasValidDates = task.startDate && task.endDate;
  const start = precomputedDates?.start ?? (hasValidDates ? parseISO(task.startDate) : null);
  const end = precomputedDates?.end ?? (hasValidDates ? parseISO(task.endDate) : null);
  
  const hasBaseline = task.baselineStartDate && task.baselineEndDate;
  const baselineStart = precomputedDates?.baselineStart ?? (hasBaseline ? parseISO(task.baselineStartDate!) : null);
  const baselineEnd = precomputedDates?.baselineEnd ?? (hasBaseline ? parseISO(task.baselineEndDate!) : null);
  
  let leftPercent = 0;
  let widthPercent = 0;
  let baselineLeftPercent = 0;
  let baselineWidthPercent = 0;
  
  const totalDays = differenceInDays(maxDate, minDate) || 1;
  
  if (start && end) {
    const startOffset = differenceInDays(start, minDate);
    const duration = differenceInDays(end, start) + 1;
    leftPercent = (startOffset / totalDays) * 100;
    widthPercent = (duration / totalDays) * 100;
  }
  
  if (baselineStart && baselineEnd) {
    const baselineStartOffset = differenceInDays(baselineStart, minDate);
    const baselineDuration = differenceInDays(baselineEnd, baselineStart) + 1;
    baselineLeftPercent = (baselineStartOffset / totalDays) * 100;
    baselineWidthPercent = (baselineDuration / totalDays) * 100;
  }

  const progressPercent = task.progress || 0;
  
  // Determine row height - taller when showing baseline
  const rowHeight = showBaseline && hasBaseline ? 'h-[36px]' : 'h-[28px]';
  
  // Critical path styling: highlight critical tasks in red, grey out non-critical tasks
  const isNonCritical = showCriticalPath && !isOnCriticalPath;
  const isCritical = showCriticalPath && isOnCriticalPath;
  
  // Determine rendering mode based on durationDays (authoritative field):
  // - durationDays === 0: Diamond only (milestone point)
  // - durationDays > 0 && isMilestone: Bar + diamond at end date
  // - durationDays > 0 && !isMilestone: Bar only
  const isMarkedAsMilestone = task.isMilestone === true;
  const isSameDate = start && end && differenceInDays(end, start) === 0;
  const isZeroDuration = (task.durationDays !== null && task.durationDays !== undefined && task.durationDays === 0) || (task.durationDays == null && isSameDate);
  const effectiveDuration = task.durationDays ?? (start && end ? (isSameDate ? 0 : differenceInDays(end, start) + 1) : null);
  const hasDuration = effectiveDuration !== null && effectiveDuration > 0;
  
  // Diamond only: 0-duration tasks or milestones with no duration
  const showDiamondOnly = (isZeroDuration || (isMarkedAsMilestone && !hasDuration)) && hasValidDates;
  // Bar: any task with duration > 0 (including milestones with duration)
  const showBar = hasDuration && hasValidDates;
  // Diamond at end of bar: milestones that have duration > 0
  const showMilestoneDiamond = isMarkedAsMilestone && hasDuration && hasValidDates;

  return (
    <div 
      className={cn(
        "relative border-b hover:bg-muted/30 transition-colors", 
        rowHeight, 
        hasChildren && "bg-muted/20",
        isNonCritical && "opacity-40",
        isCritical && "bg-red-50 dark:bg-red-950/30",
        hasDependencies && !isCritical && "bg-amber-50/50 dark:bg-amber-950/20"
      )}
      data-testid={`gantt-task-timeline-${task.id}`}
    >
      {/* Baseline bar (rendered below main bar) */}
      {showBaseline && hasBaseline && (
        <div
          className="absolute rounded-sm bg-muted-foreground/30 dark:bg-muted-foreground/20"
          style={{
            left: `${Math.max(0, baselineLeftPercent)}%`,
            width: `${Math.min(100 - Math.max(0, baselineLeftPercent), baselineWidthPercent)}%`,
            minWidth: '8px',
            top: '22px',
            height: '6px',
          }}
          title={`Baseline: ${task.baselineStartDate} - ${task.baselineEndDate}`}
        />
      )}
      
      {/* Render based on task type */}
      {hasValidDates ? (
        <>
          {/* Diamond only for zero-duration tasks */}
          {showDiamondOnly && (
            <div
              className="absolute cursor-pointer flex items-center justify-center"
              style={{
                left: `calc(${Math.max(0, leftPercent)}% - 8px)`,
                top: '4px',
                height: showBaseline && hasBaseline ? '16px' : '20px',
              }}
              onClick={() => onTaskClick(task)}
              title={`Milestone: ${task.name}`}
            >
              <div
                className={cn(
                  "rotate-45 border-2",
                  isCritical ? "bg-red-500 border-red-700" :
                  task.status === "Completed" ? "bg-emerald-500 border-emerald-700" :
                  task.status === "In Progress" ? "bg-blue-500 border-blue-700" : "bg-purple-500 border-purple-700"
                )}
                style={{
                  width: showBaseline && hasBaseline ? '12px' : '14px',
                  height: showBaseline && hasBaseline ? '12px' : '14px',
                }}
              />
            </div>
          )}
          
          {/* Bar for tasks with duration */}
          {showBar && (
            <div
              className={cn(
                "absolute rounded-sm overflow-hidden cursor-pointer border",
                isCritical ? "bg-red-200 dark:bg-red-900 border-red-400 dark:border-red-600" :
                task.status === "Completed" ? "bg-emerald-200 dark:bg-emerald-900 border-emerald-400 dark:border-emerald-600" :
                task.status === "In Progress" ? "bg-blue-200 dark:bg-blue-900 border-blue-400 dark:border-blue-600" : "bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600"
              )}
              style={{
                left: `${Math.max(0, leftPercent)}%`,
                width: `${Math.min(100 - Math.max(0, leftPercent), widthPercent)}%`,
                minWidth: '24px',
                top: '4px',
                height: showBaseline && hasBaseline ? '16px' : '20px',
              }}
              onClick={() => onTaskClick(task)}
            >
              <div 
                className={cn(
                  "h-full transition-all",
                  isCritical ? "bg-red-500" :
                  task.status === "Completed" ? "bg-emerald-500" :
                  task.status === "In Progress" ? "bg-blue-500" : "bg-slate-400"
                )}
                style={{ width: `${progressPercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-foreground">
                {progressPercent}%
              </span>
            </div>
          )}
          
          {/* Diamond at end of bar for tasks with duration that are marked as milestone */}
          {showMilestoneDiamond && (
            <div
              className="absolute cursor-pointer flex items-center justify-center z-10"
              style={{
                left: `calc(${Math.max(0, leftPercent) + Math.min(100 - Math.max(0, leftPercent), widthPercent)}% - 6px)`,
                top: '4px',
                height: showBaseline && hasBaseline ? '16px' : '20px',
              }}
              onClick={() => onTaskClick(task)}
              title={`Milestone: ${task.name}`}
            >
              <div
                className={cn(
                  "rotate-45 border-2",
                  isCritical ? "bg-red-500 border-red-700" :
                  task.status === "Completed" ? "bg-emerald-500 border-emerald-700" :
                  task.status === "In Progress" ? "bg-blue-500 border-blue-700" : "bg-purple-500 border-purple-700"
                )}
                style={{
                  width: showBaseline && hasBaseline ? '10px' : '12px',
                  height: showBaseline && hasBaseline ? '10px' : '12px',
                }}
              />
            </div>
          )}
        </>
      ) : (
        <div className="h-full flex items-center px-1" onClick={() => onTaskClick(task)}>
          {task.isOngoing ? (
            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-700">
              Ongoing
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
              No dates
            </Badge>
          )}
        </div>
      )}
    </div>
  );
});

function SortableColumnItem({ 
  id, 
  label, 
  isFirst, 
  isLast, 
  onMoveUp, 
  onMoveDown 
}: { 
  id: string; 
  label: string; 
  isFirst: boolean; 
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={cn(
        "flex items-center gap-2 p-2 bg-background border rounded-md",
        isDragging && "shadow-md"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <span className="flex-1 text-sm">{label}</span>
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={onMoveUp} 
          disabled={isFirst}
          data-testid={`column-move-up-${id}`}
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6" 
          onClick={onMoveDown} 
          disabled={isLast}
          data-testid={`column-move-down-${id}`}
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function ProjectGanttView({ 
  tasks, 
  onTaskClick, 
  onDependencyLineClick,
  projectId, 
  organizationId,
  onCreateTask,
  projectName,
  isFullscreen,
  projectStartDate,
  projectEndDate,
  hideTimeline = false,
  isReadOnly = false,
}: { 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
  onDependencyLineClick?: (task: Task) => void;
  projectId: number;
  organizationId: number | null;
  onCreateTask: (name: string) => void;
  projectName?: string;
  isFullscreen?: boolean;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  hideTimeline?: boolean;
  isReadOnly?: boolean;
}) {
  const updateTask = useUpdateTask();
  const reorderTask = useReorderTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const bulkUpdate = useBulkUpdateTasks();
  const bulkDelete = useBulkDeleteTasks();
  const addDependency = useAddTaskDependency();
  const removeDependency = useRemoveTaskDependency();
  const createResource = useCreateResource();
  const updateTaskResources = useUpdateTaskResourceAssignments();
  const { data: allResources } = useResources(organizationId);
  const { toast } = useToast();
  const { data: schedulingDefaults } = useQuery<SchedulingDefaults>({
    queryKey: ['/api/organizations', organizationId, 'scheduling-defaults'],
    enabled: !!organizationId,
  });
  const today = new Date();
  const { data: projectTaskAssignments } = useProjectTaskAssignments(projectId);
  const taskAssignmentsMap = useMemo(() => {
    const map = new Map<number, (TaskResourceAssignment & { resource: Resource })[]>();
    for (const a of projectTaskAssignments ?? []) {
      if (!map.has(a.taskId)) map.set(a.taskId, []);
      map.get(a.taskId)!.push(a);
    }
    return map;
  }, [projectTaskAssignments]);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('month');
  const [visibleColumns, setVisibleColumns] = useState<GanttColumn[]>(DEFAULT_GANTT_COLUMNS);
  const [newTaskName, setNewTaskName] = useState('');
  
  // Panel size state - persisted per project in localStorage
  const getSplitSizeKey = () => `project-gantt-split-${projectId}`;
  const [leftPanelSize, setLeftPanelSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(getSplitSizeKey());
      return saved ? Number(saved) : 50;
    } catch {
      return 50;
    }
  });
  
  // Save panel size when it changes
  const handlePanelResize = useCallback((sizes: number[]) => {
    if (sizes[0] && sizes[0] !== leftPanelSize) {
      setLeftPanelSize(sizes[0]);
      try {
        localStorage.setItem(getSplitSizeKey(), String(sizes[0]));
      } catch {}
    }
  }, [leftPanelSize, projectId]);
  
  // Scroll sync refs for left/right panes
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const [timelineContentWidth, setTimelineContentWidth] = useState(0);

  useEffect(() => {
    const el = timelineContentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTimelineContentWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  
  // Right pane is the sole vertical scroll driver. On scroll, sync left pane.
  const handleRightScroll = useCallback(() => {
    if (leftPaneRef.current && rightPaneRef.current) {
      leftPaneRef.current.scrollTop = rightPaneRef.current.scrollTop;
    }
  }, []);
  
  // Forward vertical wheel events on left pane to right pane (left pane has overflow-y: hidden in gantt mode)
  useEffect(() => {
    if (hideTimeline) return;
    const leftPane = leftPaneRef.current;
    if (!leftPane) return;
    const onWheel = (e: WheelEvent) => {
      const rp = rightPaneRef.current;
      if (rp && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const atTop = rp.scrollTop <= 0 && e.deltaY < 0;
        const atBottom = rp.scrollTop + rp.clientHeight >= rp.scrollHeight - 1 && e.deltaY > 0;
        if (atTop || atBottom) return;
        e.preventDefault();
        rp.scrollTop += e.deltaY;
      }
    };
    leftPane.addEventListener('wheel', onWheel, { passive: false });
    return () => leftPane.removeEventListener('wheel', onWheel);
  }, [hideTimeline]);
  
  // Baseline state
  const [showBaseline, setShowBaseline] = useState(false);
  const [isBaselineDialogOpen, setIsBaselineDialogOpen] = useState(false);
  const [baselineMode, setBaselineMode] = useState<'entire' | 'selected'>('entire');
  const [selectedTasksForBaseline, setSelectedTasksForBaseline] = useState<Set<number>>(new Set());
  const [isBaselinePending, setIsBaselinePending] = useState(false);
  const [baselineSelectionMode, setBaselineSelectionMode] = useState(false);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showProjectSummary, setShowProjectSummary] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  
  // Function to recalculate schedule based on dependencies
  const handleRecalculateSchedule = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/recalculate-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      
      if (response.ok) {
        // Invalidate tasks to refresh the view
        queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
        
        if (data.adjustedCount > 0) {
          toast({
            title: "Schedule Updated",
            description: `${data.adjustedCount} task(s) adjusted based on dependencies`,
          });
        } else {
          toast({
            title: "Schedule Up-to-Date",
            description: "All tasks already comply with dependency constraints",
          });
        }
      } else {
        toast({
          title: "Error",
          description: data.message || "Failed to recalculate schedule",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to recalculate schedule",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  };
  
  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [bulkTimesheetBlockPending, setBulkTimesheetBlockPending] = useState(false);
  const lastSelectedTaskIdRef = useRef<number | null>(null);
  const visibleTasksRef = useRef<Task[]>([]);
  const taskHasChildrenRef = useRef<Record<number, boolean>>({});
  
  const toggleTaskSelection = useCallback((taskId: number, shiftKey?: boolean) => {
    setFocusedCell(null);
    setSelectionRange(null);
    cellAnchorRef.current = null;
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      const currentVisibleTasks = visibleTasksRef.current;
      if (shiftKey && lastSelectedTaskIdRef.current !== null) {
        const currentIndex = currentVisibleTasks.findIndex(t => t.id === taskId);
        const lastIndex = currentVisibleTasks.findIndex(t => t.id === lastSelectedTaskIdRef.current);
        if (currentIndex !== -1 && lastIndex !== -1) {
          const start = Math.min(currentIndex, lastIndex);
          const end = Math.max(currentIndex, lastIndex);
          for (let i = start; i <= end; i++) {
            next.add(currentVisibleTasks[i].id);
          }
        } else {
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
        }
      } else {
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
      }
      return next;
    });
    lastSelectedTaskIdRef.current = taskId;
  }, []);
  
  const selectAllTasks = () => {
    setSelectedTaskIds(new Set(tasks.map(t => t.id)));
  };
  
  const clearTaskSelection = () => {
    setSelectedTaskIds(new Set());
    lastSelectedTaskIdRef.current = null;
  };

  const [focusedCell, setFocusedCell] = useState<CellPosition | null>(null);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);
  const [editingInitialChar, setEditingInitialChar] = useState<string | undefined>(undefined);
  const [selectionRange, setSelectionRange] = useState<CellRange | null>(null);
  const cellAnchorRef = useRef<CellPosition | null>(null);

  useEffect(() => {
    setSelectionRange(null);
    if (focusedCell && !visibleColumns.includes(focusedCell.columnId)) {
      setFocusedCell(null);
      cellAnchorRef.current = null;
    }
  }, [visibleColumns]);

  const getEditableColumns = useCallback((cols: GanttColumn[]) => {
    return cols.filter(c => !READ_ONLY_COLUMNS.includes(c));
  }, []);

  const handleCellClick = useCallback((taskId: number, columnId: GanttColumn, shiftKey?: boolean) => {
    setSelectedTaskIds(new Set());
    if (shiftKey && cellAnchorRef.current) {
      const currentVisibleTasks = visibleTasksRef.current;
      const anchorTaskIdx = currentVisibleTasks.findIndex(t => t.id === cellAnchorRef.current!.taskId);
      const clickedTaskIdx = currentVisibleTasks.findIndex(t => t.id === taskId);
      if (anchorTaskIdx !== -1 && clickedTaskIdx !== -1) {
        setSelectionRange({
          startTaskId: cellAnchorRef.current.taskId,
          startColId: cellAnchorRef.current.columnId,
          endTaskId: taskId,
          endColId: columnId,
        });
      }
      setFocusedCell({ taskId, columnId });
    } else {
      setFocusedCell({ taskId, columnId });
      cellAnchorRef.current = { taskId, columnId };
      setSelectionRange(null);
    }
    lastSelectedTaskIdRef.current = taskId;
  }, []);

  const isRowInSelectionRange = useCallback((taskId: number): boolean => {
    if (!selectionRange) return false;
    const currentVisibleTasks = visibleTasksRef.current;
    const startIdx = currentVisibleTasks.findIndex(t => t.id === selectionRange.startTaskId);
    const endIdx = currentVisibleTasks.findIndex(t => t.id === selectionRange.endTaskId);
    const taskIdx = currentVisibleTasks.findIndex(t => t.id === taskId);
    if (startIdx === -1 || endIdx === -1 || taskIdx === -1) return false;
    const minRow = Math.min(startIdx, endIdx);
    const maxRow = Math.max(startIdx, endIdx);
    return taskIdx >= minRow && taskIdx <= maxRow;
  }, [selectionRange]);

  const triggerCellEdit = useCallback((taskId: number, colId: GanttColumn, initialChar?: string) => {
    if (colId === 'task') {
      const trigger = document.querySelector(`[data-testid="task-actions-${taskId}"]`) as HTMLElement;
      if (trigger) {
        trigger.click();
        setTimeout(() => {
          const renameBtn = document.querySelector(`[data-testid="task-rename-${taskId}"]`) as HTMLElement;
          if (renameBtn) renameBtn.click();
        }, 100);
      }
      return;
    }

    setEditingInitialChar(initialChar);
    setEditingCell({ taskId, columnId: colId });
  }, []);
  
  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    
    setBulkDeletePending(true);
    try {
      const taskIds = Array.from(selectedTaskIds);
      const result = await bulkDelete.mutateAsync({ taskIds, projectId });
      clearTaskSelection();
      toast({ title: "Deleted", description: `${result.deletedCount} task${result.deletedCount !== 1 ? 's' : ''} deleted successfully` });
    } catch {
      toast({ title: "Delete failed", description: "Failed to delete tasks", variant: "destructive" });
    }
    setBulkDeletePending(false);
  };
  
  const handleBulkTimesheetBlock = async () => {
    if (selectedTaskIds.size === 0) return;
    
    setBulkTimesheetBlockPending(true);
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
    const allAlreadyBlocked = selectedTasks.every(t => t.timesheetBlocked);
    const newBlockedValue = !allAlreadyBlocked;
    
    try {
      const taskIds = selectedTasks.map(t => t.id);
      const result = await bulkUpdate.mutateAsync({
        taskIds,
        updates: { timesheetBlocked: newBlockedValue },
        projectId,
      });
      toast({ title: newBlockedValue ? "Timesheet entries blocked" : "Timesheet entries unblocked", description: `${result.updatedCount} task${result.updatedCount !== 1 ? 's' : ''} updated successfully` });
    } catch {
      toast({ title: "Update failed", description: "Failed to update tasks", variant: "destructive" });
    }
    setBulkTimesheetBlockPending(false);
  };

  type GanttAction = 
    | { type: 'reorder'; taskId: number; fromIndex: number; toIndex: number; taskIds?: number[] }
    | { type: 'update'; taskId: number; projectId: number; before: Record<string, unknown>; after: Record<string, unknown>; label: string }
    | { type: 'create'; taskId: number; projectId: number }
    | { type: 'delete'; taskId: number; projectId: number }
    | { type: 'addDependency'; taskId: number; dependsOnTaskId: number; projectId: number }
    | { type: 'removeDependency'; taskId: number; dependsOnTaskId: number; projectId: number };
  const MAX_UNDO_STACK = 50;
  const [undoStack, setUndoStack] = useState<GanttAction[]>([]);
  const [redoStack, setRedoStack] = useState<GanttAction[]>([]);
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  // Handle task reorder on drag end
  const getSubtaskIndices = useCallback((parentIndex: number, taskList: Task[]): number[] => {
    const parentLevel = taskList[parentIndex].outlineLevel || 1;
    const indices: number[] = [];
    for (let i = parentIndex + 1; i < taskList.length; i++) {
      const level = taskList[i].outlineLevel || 1;
      if (level > parentLevel) {
        indices.push(i);
      } else {
        break;
      }
    }
    return indices;
  }, []);

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const activeIndex = tasks.findIndex(t => t.id === active.id);
    const overIndex = tasks.findIndex(t => t.id === over.id);
    
    if (activeIndex === -1 || overIndex === -1) return;
    
    const subtaskIndices = getSubtaskIndices(activeIndex, tasks);
    const groupIds = [tasks[activeIndex].id, ...subtaskIndices.map(i => tasks[i].id)];
    const groupSize = groupIds.length;
    const groupEndIndex = activeIndex + subtaskIndices.length;

    if (overIndex >= activeIndex && overIndex <= groupEndIndex) return;

    const groupIdSet = new Set(groupIds);
    const remaining = tasks.filter(t => !groupIdSet.has(t.id));
    const overIndexInRemaining = remaining.findIndex(t => t.id === Number(over.id));

    let newIndex: number;
    if (overIndex > activeIndex) {
      const overLevel = remaining[overIndexInRemaining].outlineLevel || 1;
      let insertAfter = overIndexInRemaining;
      for (let i = overIndexInRemaining + 1; i < remaining.length; i++) {
        if ((remaining[i].outlineLevel || 1) > overLevel) {
          insertAfter = i;
        } else break;
      }
      newIndex = insertAfter + 1;
    } else {
      newIndex = overIndexInRemaining;
    }

    const fromIndex = remaining.findIndex(t => t.id === tasks[groupEndIndex + 1]?.id);
    const actionFromIndex = fromIndex === -1 ? remaining.length : fromIndex;

    const actionTaskIds = groupSize > 1 ? groupIds : undefined;
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO_STACK - 1)), { type: 'reorder', taskId: Number(active.id), fromIndex: actionFromIndex, toIndex: newIndex, taskIds: actionTaskIds }]);
    setRedoStack([]);
    
    reorderTask.mutate({
      projectId,
      taskId: Number(active.id),
      newIndex,
      taskIds: actionTaskIds,
    }, {
      onSuccess: () => {
        toast({ title: "Task reordered", description: "Task order updated successfully" });
      },
      onError: () => {
        setUndoStack(prev => prev.slice(0, -1));
        toast({ title: "Error", description: "Failed to reorder task", variant: "destructive" });
      }
    });
  };
  
  const pushActionToUndoStack = useCallback((action: GanttAction) => {
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO_STACK - 1)), action]);
    setRedoStack([]);
  }, []);

  const pushToUndoStack = useCallback((taskId: number, projectId: number, before: Record<string, unknown>, after: Record<string, unknown>, label: string) => {
    pushActionToUndoStack({ type: 'update', taskId, projectId, before, after, label });
  }, [pushActionToUndoStack]);
  
  const undoErrorRollback = useCallback((action: GanttAction) => {
    setUndoStack(prev => [...prev, action]);
    setRedoStack(prev => prev.slice(0, -1));
    toast({ title: "Error", description: "Failed to undo", variant: "destructive" });
  }, [toast]);

  const redoErrorRollback = useCallback((action: GanttAction) => {
    setRedoStack(prev => [...prev, action]);
    setUndoStack(prev => prev.slice(0, -1));
    toast({ title: "Error", description: "Failed to redo", variant: "destructive" });
  }, [toast]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const lastAction = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, lastAction]);
    
    switch (lastAction.type) {
      case 'reorder':
        reorderTask.mutate({ projectId, taskId: lastAction.taskId, newIndex: lastAction.fromIndex, taskIds: lastAction.taskIds }, {
          onSuccess: () => toast({ title: "Undone", description: "Task order restored" }),
          onError: () => undoErrorRollback(lastAction),
        });
        break;
      case 'update':
        updateTask.mutate({ id: lastAction.taskId, projectId: lastAction.projectId, ...lastAction.before }, {
          onSuccess: () => toast({ title: "Undone", description: `${lastAction.label} restored` }),
          onError: () => undoErrorRollback(lastAction),
        });
        break;
      case 'create':
        deleteTask.mutate({ id: lastAction.taskId, projectId: lastAction.projectId }, {
          onSuccess: () => toast({ title: "Undone", description: "Task creation undone" }),
          onError: () => undoErrorRollback(lastAction),
        });
        break;
      case 'delete':
        apiRequest('POST', `/api/organizations/${organizationId}/recycle-bin/restore`, { type: 'task', itemId: lastAction.taskId }).then(() => {
          queryClient.refetchQueries({ queryKey: ['/api/projects', lastAction.projectId, 'tasks'] });
          toast({ title: "Undone", description: "Task restored" });
        }).catch(() => undoErrorRollback(lastAction));
        break;
      case 'addDependency':
        removeDependency.mutate({ taskId: lastAction.taskId, dependsOnTaskId: lastAction.dependsOnTaskId, projectId: lastAction.projectId }, {
          onSuccess: () => toast({ title: "Undone", description: "Dependency removed" }),
          onError: () => undoErrorRollback(lastAction),
        });
        break;
      case 'removeDependency':
        addDependency.mutate({ taskId: lastAction.taskId, dependsOnTaskId: lastAction.dependsOnTaskId, projectId: lastAction.projectId }, {
          onSuccess: () => toast({ title: "Undone", description: "Dependency restored" }),
          onError: () => undoErrorRollback(lastAction),
        });
        break;
    }
  }, [undoStack, projectId, organizationId, reorderTask, updateTask, deleteTask, addDependency, removeDependency, toast, undoErrorRollback]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const lastAction = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, lastAction]);
    
    switch (lastAction.type) {
      case 'reorder':
        reorderTask.mutate({ projectId, taskId: lastAction.taskId, newIndex: lastAction.toIndex, taskIds: lastAction.taskIds }, {
          onSuccess: () => toast({ title: "Redone", description: "Task reordered" }),
          onError: () => redoErrorRollback(lastAction),
        });
        break;
      case 'update':
        updateTask.mutate({ id: lastAction.taskId, projectId: lastAction.projectId, ...lastAction.after }, {
          onSuccess: () => toast({ title: "Redone", description: `${lastAction.label} reapplied` }),
          onError: () => redoErrorRollback(lastAction),
        });
        break;
      case 'create':
        apiRequest('POST', `/api/organizations/${organizationId}/recycle-bin/restore`, { type: 'task', itemId: lastAction.taskId }).then(() => {
          queryClient.refetchQueries({ queryKey: ['/api/projects', lastAction.projectId, 'tasks'] });
          toast({ title: "Redone", description: "Task restored" });
        }).catch(() => redoErrorRollback(lastAction));
        break;
      case 'delete':
        deleteTask.mutate({ id: lastAction.taskId, projectId: lastAction.projectId }, {
          onSuccess: () => toast({ title: "Redone", description: "Task deleted" }),
          onError: () => redoErrorRollback(lastAction),
        });
        break;
      case 'addDependency':
        addDependency.mutate({ taskId: lastAction.taskId, dependsOnTaskId: lastAction.dependsOnTaskId, projectId: lastAction.projectId }, {
          onSuccess: () => toast({ title: "Redone", description: "Dependency added" }),
          onError: () => redoErrorRollback(lastAction),
        });
        break;
      case 'removeDependency':
        removeDependency.mutate({ taskId: lastAction.taskId, dependsOnTaskId: lastAction.dependsOnTaskId, projectId: lastAction.projectId }, {
          onSuccess: () => toast({ title: "Redone", description: "Dependency removed" }),
          onError: () => redoErrorRollback(lastAction),
        });
        break;
    }
  }, [redoStack, projectId, organizationId, reorderTask, updateTask, deleteTask, addDependency, removeDependency, toast, redoErrorRollback]);

  const describeAction = useCallback((action: GanttAction | undefined): string => {
    if (!action) return '';
    switch (action.type) {
      case 'reorder': return 'Reorder task';
      case 'update': return action.label;
      case 'create': return 'Create task';
      case 'delete': return 'Delete task';
      case 'addDependency': return 'Add dependency';
      case 'removeDependency': return 'Remove dependency';
    }
  }, []);

  // Helper: get a plain-text value for a task field (for clipboard copy)
  const getTaskCopyValue = useCallback((task: Task, colId: GanttColumn): string => {
    switch (colId) {
      case 'taskIndex': return '';
      case 'task': return task.name ?? '';
      case 'taskNumber': return task.taskNumber ?? '';
      case 'wbs': return task.wbs ?? '';
      case 'outlineLevel': return String(task.outlineLevel ?? 1);
      case 'description': return task.description ?? '';
      case 'startDate': return task.startDate ? format(parseISO(task.startDate), 'MM/dd/yyyy') : '';
      case 'endDate': return task.endDate ? format(parseISO(task.endDate), 'MM/dd/yyyy') : '';
      case 'baselineStartDate': return task.baselineStartDate ? format(parseISO(task.baselineStartDate), 'MM/dd/yyyy') : '';
      case 'baselineEndDate': return task.baselineEndDate ? format(parseISO(task.baselineEndDate), 'MM/dd/yyyy') : '';
      case 'actualStartDate': return task.actualStartDate ? format(parseISO(task.actualStartDate), 'MM/dd/yyyy') : '';
      case 'actualEndDate': return task.actualEndDate ? format(parseISO(task.actualEndDate), 'MM/dd/yyyy') : '';
      case 'durationDays': return task.durationDays != null ? String(task.durationDays) : '';
      case 'progress': return task.progress != null ? String(task.progress) : '';
      case 'status': return task.status ?? '';
      case 'priority': return task.priority ?? '';
      case 'taskType': return task.taskType ?? '';
      case 'estimatedHours': return task.estimatedHours != null ? String(task.estimatedHours) : '';
      case 'actualHours': return task.actualHours != null ? String(task.actualHours) : '';
      case 'remainingHours': return task.remainingHours != null ? String(task.remainingHours) : '';
      case 'cost': return task.cost != null ? String(task.cost) : '';
      case 'actualCost': return task.actualCost != null ? String(task.actualCost) : '';
      case 'constraintType': return task.constraintType ?? '';
      case 'constraintDate': return task.constraintDate ? format(parseISO(task.constraintDate), 'MM/dd/yyyy') : '';
      case 'isMilestone': return task.isMilestone ? 'Yes' : 'No';
      case 'isCritical': return task.isCritical ? 'Yes' : 'No';
      case 'isSummary': return task.isSummary ? 'Yes' : 'No';
      case 'timesheetBlocked': return task.timesheetBlocked ? 'Yes' : 'No';
      case 'phase': return task.phase ?? '';
      case 'category': return task.category ?? '';
      case 'labels': return task.labels ?? '';
      case 'notes': return task.notes ?? '';
      case 'assignee': return task.assignee ?? '';
      case 'resources': return '';
      default: return '';
    }
  }, []);

  // Copy selected cells/rows as TSV to clipboard
  const handleGridCopy = useCallback(() => {
    const currentVisibleTasks = visibleTasksRef.current;

    if (selectionRange) {
      const startIdx = currentVisibleTasks.findIndex(t => t.id === selectionRange.startTaskId);
      const endIdx = currentVisibleTasks.findIndex(t => t.id === selectionRange.endTaskId);
      if (startIdx === -1 || endIdx === -1) return;
      const minRow = Math.min(startIdx, endIdx);
      const maxRow = Math.max(startIdx, endIdx);
      const startColIdx = visibleColumns.indexOf(selectionRange.startColId);
      const endColIdx = visibleColumns.indexOf(selectionRange.endColId);
      const minCol = Math.min(startColIdx, endColIdx);
      const maxCol = Math.max(startColIdx, endColIdx);
      const rangeCols = visibleColumns.slice(minCol, maxCol + 1);
      const rangeTasks = currentVisibleTasks.slice(minRow, maxRow + 1);

      const rows = rangeTasks.map(task =>
        rangeCols.map(colId => getTaskCopyValue(task, colId)).join('\t')
      );
      const tsv = rows.join('\n');
      const cellCount = rangeTasks.length * rangeCols.length;
      navigator.clipboard.writeText(tsv).then(() => {
        toast({ title: "Copied", description: `${cellCount} cell${cellCount !== 1 ? 's' : ''} copied to clipboard` });
      }).catch(() => {
        toast({ title: "Copy failed", description: "Could not access clipboard", variant: "destructive" });
      });
      return;
    }

    if (focusedCell && selectedTaskIds.size === 0) {
      const task = currentVisibleTasks.find(t => t.id === focusedCell.taskId);
      if (!task) return;
      const val = getTaskCopyValue(task, focusedCell.columnId);
      navigator.clipboard.writeText(val).then(() => {
        toast({ title: "Copied", description: "Cell value copied to clipboard" });
      }).catch(() => {
        toast({ title: "Copy failed", description: "Could not access clipboard", variant: "destructive" });
      });
      return;
    }

    const selectedInOrder = currentVisibleTasks.filter(t => selectedTaskIds.has(t.id));
    if (selectedInOrder.length === 0) return;

    const header = visibleColumns.map(colId => {
      const col = GANTT_COLUMNS.find(c => c.id === colId);
      return col?.label ?? colId;
    }).join('\t');

    const rows = selectedInOrder.map(task =>
      visibleColumns.map(colId => getTaskCopyValue(task, colId)).join('\t')
    );

    const tsv = [header, ...rows].join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      toast({
        title: "Copied",
        description: `${selectedInOrder.length} row${selectedInOrder.length !== 1 ? 's' : ''} copied to clipboard`,
      });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Could not access clipboard", variant: "destructive" });
    });
  }, [selectedTaskIds, visibleColumns, getTaskCopyValue, toast, selectionRange, focusedCell]);

  // Helper: flexible date parsing for pasted values
  const parsePastedDate = (val: string): string | null => {
    if (!val || !val.trim()) return null;
    const trimmed = val.trim();

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = parseISO(trimmed);
      if (!isNaN(d.getTime())) return trimmed;
    }

    // MM/DD/YYYY or M/D/YYYY
    const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const [, m, d, y] = mdy;
      const month = Number(m), day = Number(d), year = Number(y);
      const date = new Date(year, month - 1, day);
      // Round-trip validate: reject auto-corrected dates (e.g. Feb 31)
      if (!isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return format(date, 'yyyy-MM-dd');
      }
    }

    // M/D/YY
    const mdyShort = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (mdyShort) {
      const [, m, d, y] = mdyShort;
      const month = Number(m), day = Number(d);
      const year = Number(y) < 70 ? 2000 + Number(y) : 1900 + Number(y);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime()) && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return format(date, 'yyyy-MM-dd');
      }
    }

    return null;
  };

  // Paste handler: parse TSV clipboard data and apply to tasks starting from focused row
  const handleGridPaste = useCallback(async (e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if (isReadOnly) return;

    // Scope paste to the Gantt metadata pane: check active element is inside it or body is focused
    const pane = leftPaneRef.current;
    const activeEl = document.activeElement;
    if (pane && activeEl && activeEl !== document.body && !pane.contains(activeEl)) return;

    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;

    const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '');
    if (lines.length === 0) return;

    const currentVisibleTasks = visibleTasksRef.current;

    // Detect if first row is a header (compare to column labels)
    let dataLines = lines;
    const firstRow = lines[0].split('\t');
    const columnLabels = visibleColumns.map(colId => {
      const col = GANTT_COLUMNS.find(c => c.id === colId);
      return col?.label ?? colId;
    });
    const isHeader = firstRow.some((cell, i) =>
      cell.trim().toLowerCase() === (columnLabels[i] ?? '').toLowerCase()
    );
    if (isHeader) dataLines = lines.slice(1);

    if (dataLines.length === 0) return;

    // Determine starting row and column index, honoring selection range if present
    let startIndex = 0;
    let effectiveStartCol = 0;
    let maxPasteRows = dataLines.length;
    let maxPasteCols = Infinity;

    if (selectionRange) {
      const rangeStartRow = currentVisibleTasks.findIndex(t => t.id === selectionRange.startTaskId);
      const rangeEndRow = currentVisibleTasks.findIndex(t => t.id === selectionRange.endTaskId);
      const rangeStartCol = visibleColumns.indexOf(selectionRange.startColId);
      const rangeEndCol = visibleColumns.indexOf(selectionRange.endColId);
      if (rangeStartRow !== -1 && rangeEndRow !== -1 && rangeStartCol !== -1 && rangeEndCol !== -1) {
        startIndex = Math.min(rangeStartRow, rangeEndRow);
        effectiveStartCol = Math.min(rangeStartCol, rangeEndCol);
        maxPasteRows = Math.abs(rangeEndRow - rangeStartRow) + 1;
        maxPasteCols = Math.abs(rangeEndCol - rangeStartCol) + 1;
      }
    } else {
      const anchorTaskId = focusedCell?.taskId ?? lastSelectedTaskIdRef.current;
      const anchorIndex = anchorTaskId != null
        ? currentVisibleTasks.findIndex(t => t.id === anchorTaskId)
        : -1;
      startIndex = anchorIndex >= 0 ? anchorIndex : 0;
      const startColIndex = focusedCell
        ? visibleColumns.indexOf(focusedCell.columnId)
        : 0;
      effectiveStartCol = startColIndex >= 0 ? startColIndex : 0;
    }

    const taskUpdates: Array<{ taskId: number; updates: Record<string, unknown> }> = [];
    const newTaskRows: Array<Record<string, unknown>> = [];
    const skippedRows: number[] = [];
    const invalidCells: string[] = [];

    const parsePastedRow = (rowCells: string[], rowNum: number) => {
      const updates: Record<string, unknown> = {};
      for (let j = 0; j < rowCells.length && j < maxPasteCols; j++) {
        const colIndex = effectiveStartCol + j;
        if (colIndex >= visibleColumns.length) break;
        const colId = visibleColumns[colIndex];
        const rawVal = rowCells[j]?.trim() ?? '';

        if (['taskIndex', 'wbs', 'outlineLevel', 'isCritical', 'isSummary', 'assignee'].includes(colId)) continue;
        if (rawVal === '' || rawVal === '—') continue;

        try {
          switch (colId) {
            case 'task':
              updates.name = rawVal;
              break;
            case 'taskNumber':
            case 'description':
            case 'notes':
            case 'phase':
            case 'category':
              updates[colId] = rawVal;
              break;
            case 'status': {
              const validStatuses = ['Not Started', 'In Progress', 'Completed'];
              const match = validStatuses.find(s => s.toLowerCase() === rawVal.toLowerCase());
              if (match) updates.status = match;
              else invalidCells.push(`Row ${rowNum} status: "${rawVal}"`);
              break;
            }
            case 'priority': {
              const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
              const match = validPriorities.find(p => p.toLowerCase() === rawVal.toLowerCase());
              if (match) updates.priority = match;
              else invalidCells.push(`Row ${rowNum} priority: "${rawVal}"`);
              break;
            }
            case 'taskType': {
              const validTypes = ['Work', 'Milestone', 'Summary', 'Ongoing'];
              const match = validTypes.find(t => t.toLowerCase() === rawVal.toLowerCase());
              if (match) updates.taskType = match;
              else invalidCells.push(`Row ${rowNum} type: "${rawVal}"`);
              break;
            }
            case 'constraintType': {
              const validConstraints = ['As Soon As Possible', 'As Late As Possible', 'Must Start On', 'Must Finish On', 'Start No Earlier Than', 'Start No Later Than', 'Finish No Earlier Than', 'Finish No Later Than'];
              const match = validConstraints.find(c => c.toLowerCase() === rawVal.toLowerCase());
              if (match) updates.constraintType = match;
              else invalidCells.push(`Row ${rowNum} constraint: "${rawVal}"`);
              break;
            }
            case 'startDate':
            case 'endDate':
            case 'baselineStartDate':
            case 'baselineEndDate':
            case 'actualStartDate':
            case 'actualEndDate':
            case 'constraintDate': {
              const parsed = parsePastedDate(rawVal);
              if (parsed) updates[colId] = parsed;
              else invalidCells.push(`Row ${rowNum} ${colId}: "${rawVal}"`);
              break;
            }
            case 'durationDays': {
              const parsed = parseDurationInput(rawVal);
              if (parsed !== null && parsed >= 0) updates.durationDays = parsed;
              else {
                const n = parseFloat(rawVal);
                if (!isNaN(n) && n >= 0) updates.durationDays = n;
                else invalidCells.push(`Row ${rowNum} duration: "${rawVal}"`);
              }
              break;
            }
            case 'progress': {
              const n = parseFloat(rawVal.replace('%', ''));
              if (!isNaN(n) && n >= 0 && n <= 100) updates.progress = n;
              else invalidCells.push(`Row ${rowNum} progress: "${rawVal}"`);
              break;
            }
            case 'estimatedHours':
            case 'actualHours':
            case 'remainingHours':
            case 'cost':
            case 'actualCost': {
              const n = parseFloat(rawVal.replace(/[$,]/g, ''));
              if (!isNaN(n) && n >= 0) updates[colId] = n;
              else invalidCells.push(`Row ${rowNum} ${colId}: "${rawVal}"`);
              break;
            }
            case 'isMilestone':
            case 'timesheetBlocked': {
              const truthy = ['yes', 'true', '1', 'x'].includes(rawVal.toLowerCase());
              const falsy = ['no', 'false', '0', ''].includes(rawVal.toLowerCase());
              if (truthy) updates[colId] = true;
              else if (falsy) updates[colId] = false;
              break;
            }
            case 'labels': {
              updates.labels = rawVal;
              break;
            }
            case 'resources': {
              updates._pastedResources = rawVal;
              break;
            }
          }
        } catch {
          invalidCells.push(`Row ${rowNum} ${colId}: "${rawVal}"`);
        }
      }
      return updates;
    };

    for (let i = 0; i < Math.min(dataLines.length, maxPasteRows); i++) {
      const taskIndex = startIndex + i;
      const cells = dataLines[i].split('\t');

      if (taskIndex >= currentVisibleTasks.length) {
        const updates = parsePastedRow(cells, i + 1);
        if (Object.keys(updates).length > 0) {
          newTaskRows.push(updates);
        }
        continue;
      }

      const task = currentVisibleTasks[taskIndex];

      const isHierarchySummary = !!taskHasChildrenRef.current[task.id];
      if (isHierarchySummary || task.isSummary) {
        skippedRows.push(taskIndex + 1);
        continue;
      }

      const updates = parsePastedRow(cells, i + 1);
      if (Object.keys(updates).length > 0) {
        taskUpdates.push({ taskId: task.id, updates });
      }
    }

    const resourceAssignments: Array<{ taskId: number; resourceNames: string[] }> = [];

    for (const tu of taskUpdates) {
      if (tu.updates._pastedResources) {
        const names = (tu.updates._pastedResources as string).split(/[,;]/).map(n => n.trim()).filter(Boolean);
        if (names.length > 0) resourceAssignments.push({ taskId: tu.taskId, resourceNames: names });
        delete tu.updates._pastedResources;
      }
    }

    const newTaskResourceNames: string[][] = newTaskRows.map(row => {
      if (row._pastedResources) {
        const names = (row._pastedResources as string).split(/[,;]/).map(n => n.trim()).filter(Boolean);
        delete row._pastedResources;
        return names;
      }
      return [];
    });

    const hasUpdates = taskUpdates.some(tu => Object.keys(tu.updates).length > 0);
    const hasNewRows = newTaskRows.some(row => Object.keys(row).length > 0);
    const hasResourceAssignments = resourceAssignments.length > 0 || newTaskResourceNames.some(n => n.length > 0);

    if (!hasUpdates && !hasNewRows && !hasResourceAssignments) {
      toast({
        title: "Nothing to paste",
        description: skippedRows.length > 0
          ? `${skippedRows.length} row(s) skipped (read-only or summary tasks)`
          : "No valid data found in clipboard",
        variant: "destructive",
      });
      return;
    }

    e.preventDefault();

    try {
      let updatedCount = 0;
      let createdCount = 0;
      let resourcesAssigned = 0;

      const cleanedUpdates = taskUpdates.filter(tu => Object.keys(tu.updates).length > 0);
      if (cleanedUpdates.length > 0) {
        const result = await bulkUpdate.mutateAsync({ taskUpdates: cleanedUpdates, projectId });
        updatedCount = result.updatedCount ?? cleanedUpdates.length;
      }

      const createdTaskIds: number[] = [];
      if (newTaskRows.length > 0) {
        const lastTask = currentVisibleTasks[currentVisibleTasks.length - 1];
        const baseOutlineLevel = lastTask?.outlineLevel || 1;
        const baseParentId = lastTask?.parentId || null;
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        for (let idx = 0; idx < newTaskRows.length; idx++) {
          const rowData = newTaskRows[idx];
          const taskName = (rowData.name as string) || 'New Task';
          const startDate = (rowData.startDate as string) || todayStr;
          const endDate = (rowData.endDate as string) || calculateEndDateFromWorkingDays(startDate, (rowData.durationDays as number) || 1);
          const durationDays = (rowData.durationDays as number) || 1;

          try {
            const newTask = await createTask.mutateAsync({
              projectId,
              name: taskName,
              startDate,
              endDate,
              durationDays,
              outlineLevel: baseOutlineLevel,
              parentId: baseParentId,
              status: (rowData.status as string) || 'Not Started',
              progress: (rowData.progress as number) ?? 0,
              ...(rowData.priority && { priority: rowData.priority as string }),
              ...(rowData.description && { description: rowData.description as string }),
              ...(rowData.taskNumber && { taskNumber: rowData.taskNumber as string }),
              ...(rowData.notes && { notes: rowData.notes as string }),
              ...(rowData.taskType && { taskType: rowData.taskType as string }),
              ...(rowData.isMilestone !== undefined && { isMilestone: rowData.isMilestone as boolean }),
              ...(rowData.category && { category: rowData.category as string }),
              ...(rowData.phase && { phase: rowData.phase as string }),
              ...(rowData.baselineStartDate && { baselineStartDate: rowData.baselineStartDate as string }),
              ...(rowData.baselineEndDate && { baselineEndDate: rowData.baselineEndDate as string }),
              ...(rowData.actualStartDate && { actualStartDate: rowData.actualStartDate as string }),
              ...(rowData.actualEndDate && { actualEndDate: rowData.actualEndDate as string }),
              ...(rowData.constraintType && { constraintType: rowData.constraintType as string }),
              ...(rowData.constraintDate && { constraintDate: rowData.constraintDate as string }),
              ...(rowData.cost !== undefined && { cost: rowData.cost as number }),
              ...(rowData.actualCost !== undefined && { actualCost: rowData.actualCost as number }),
              ...(rowData.actualHours !== undefined && { actualHours: rowData.actualHours as number }),
              ...(rowData.remainingHours !== undefined && { remainingHours: rowData.remainingHours as number }),
              ...(rowData.labels && { labels: rowData.labels as string }),
            });
            createdCount++;
            createdTaskIds.push(newTask.id);

            if (newTaskResourceNames[idx]?.length > 0) {
              resourceAssignments.push({ taskId: newTask.id, resourceNames: newTaskResourceNames[idx] });
            }
          } catch (err: unknown) {
            const error = err as { limitExceeded?: boolean; message?: string };
            if (error.limitExceeded) {
              invalidCells.push(`New row "${taskName}": task limit reached`);
              break;
            }
            invalidCells.push(`New row "${taskName}": failed to create`);
            createdTaskIds.push(-1);
          }
        }
      }

      if (resourceAssignments.length > 0 && organizationId) {
        const currentResources = allResources ?? [];
        const resourceNameToId = new Map<string, number>();

        for (const r of currentResources) {
          resourceNameToId.set(r.displayName.toLowerCase(), r.id);
          if (r.email) resourceNameToId.set(r.email.toLowerCase(), r.id);
        }

        for (const { taskId, resourceNames } of resourceAssignments) {
          const resolvedIds: number[] = [];

          for (const name of resourceNames) {
            const key = name.toLowerCase();
            let resId = resourceNameToId.get(key);

            if (!resId) {
              try {
                const newRes = await createResource.mutateAsync({
                  organizationId,
                  displayName: name,
                  resourceType: 'Employee',
                });
                resId = newRes.id;
                resourceNameToId.set(key, resId);
              } catch {
                invalidCells.push(`Resource "${name}": failed to create`);
                continue;
              }
            }

            resolvedIds.push(resId);
          }

          if (resolvedIds.length > 0) {
            try {
              const existingAssignments = projectTaskAssignments
                ?.filter(a => a.taskId === taskId)
                ?.map(a => a.resourceId) ?? [];
              const mergedIds = [...new Set([...existingAssignments, ...resolvedIds])];
              await updateTaskResources.mutateAsync({ taskId, resourceIds: mergedIds });
              resourcesAssigned += resolvedIds.length;
            } catch {
              invalidCells.push(`Task ${taskId}: failed to assign resources`);
            }
          }
        }
      }

      const parts: string[] = [];
      if (updatedCount > 0) parts.push(`${updatedCount} row${updatedCount !== 1 ? 's' : ''} updated`);
      if (createdCount > 0) parts.push(`${createdCount} new task${createdCount !== 1 ? 's' : ''} created`);
      if (resourcesAssigned > 0) parts.push(`${resourcesAssigned} resource${resourcesAssigned !== 1 ? 's' : ''} assigned`);
      if (skippedRows.length > 0) parts.push(`${skippedRows.length} skipped (read-only/summary)`);
      if (invalidCells.length > 0) parts.push(`${invalidCells.length} value${invalidCells.length !== 1 ? 's' : ''} could not be parsed`);

      toast({
        title: "Paste complete",
        description: parts.join(', '),
      });
    } catch {
      toast({ title: "Paste failed", description: "Could not save changes", variant: "destructive" });
    }
  }, [visibleColumns, isReadOnly, bulkUpdate, projectId, toast, focusedCell, selectionRange, createTask, organizationId, allResources, createResource, updateTaskResources, projectTaskAssignments]);

  // Attach paste event listener
  useEffect(() => {
    const pasteHandler = (e: ClipboardEvent) => { handleGridPaste(e); };
    document.addEventListener('paste', pasteHandler);
    return () => document.removeEventListener('paste', pasteHandler);
  }, [handleGridPaste]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!focusedCell) return;
      const target = e.target as HTMLElement;
      const pane = leftPaneRef.current;
      if (pane && !pane.contains(target)) {
        setFocusedCell(null);
        setSelectionRange(null);
        cellAnchorRef.current = null;
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [focusedCell]);

  // Keyboard shortcuts: undo, redo, copy, cell navigation, type-to-edit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputActive = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const isInsidePopover = !!target.closest('[role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper], [data-radix-select-viewport]');

      const isMod = e.metaKey || e.ctrlKey;

      if (isInputActive || isInsidePopover) return;
      if (editingCell) return;

      if (isMod) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          handleRedo();
        } else if (e.key === 'c') {
          if (focusedCell || selectedTaskIds.size > 0) {
            e.preventDefault();
            handleGridCopy();
          }
        }
        return;
      }

      const currentFocused = focusedCell;
      if (!currentFocused) return;

      const currentVisibleTasks = visibleTasksRef.current;
      const taskIdx = currentVisibleTasks.findIndex(t => t.id === currentFocused.taskId);
      const colIdx = visibleColumns.indexOf(currentFocused.columnId);
      if (taskIdx === -1 || colIdx === -1) return;

      const editableCols = getEditableColumns(visibleColumns);

      if (e.key === 'Escape') {
        e.preventDefault();
        setFocusedCell(null);
        setSelectionRange(null);
        cellAnchorRef.current = null;
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        let newTaskIdx = taskIdx;
        let newColIdx = colIdx;

        const isSummaryRow = (idx: number) => {
          const t = currentVisibleTasks[idx];
          return t && (t.isSummary || !!taskHasChildrenRef.current[t.id]);
        };

        if (e.key === 'ArrowUp') {
          for (let r = taskIdx - 1; r >= 0; r--) {
            if (!isSummaryRow(r)) { newTaskIdx = r; break; }
          }
        } else if (e.key === 'ArrowDown') {
          for (let r = taskIdx + 1; r < currentVisibleTasks.length; r++) {
            if (!isSummaryRow(r)) { newTaskIdx = r; break; }
          }
        } else if (e.key === 'ArrowLeft') {
          for (let c = colIdx - 1; c >= 0; c--) {
            if (!READ_ONLY_COLUMNS.includes(visibleColumns[c])) { newColIdx = c; break; }
          }
        } else if (e.key === 'ArrowRight') {
          for (let c = colIdx + 1; c < visibleColumns.length; c++) {
            if (!READ_ONLY_COLUMNS.includes(visibleColumns[c])) { newColIdx = c; break; }
          }
        }

        const newCell: CellPosition = {
          taskId: currentVisibleTasks[newTaskIdx].id,
          columnId: visibleColumns[newColIdx],
        };
        setFocusedCell(newCell);

        if (e.shiftKey) {
          const anchor = cellAnchorRef.current || currentFocused;
          setSelectionRange({
            startTaskId: anchor.taskId,
            startColId: anchor.columnId,
            endTaskId: newCell.taskId,
            endColId: newCell.columnId,
          });
        } else {
          cellAnchorRef.current = newCell;
          setSelectionRange(null);
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (editableCols.length === 0) return;
        const editableIdx = editableCols.indexOf(currentFocused.columnId);
        let nextEditableIdx = editableIdx;
        let nextTaskIdx = taskIdx;

        const isSummaryRowTab = (idx: number) => {
          const t = currentVisibleTasks[idx];
          return t && (t.isSummary || !!taskHasChildrenRef.current[t.id]);
        };

        const maxAttempts = currentVisibleTasks.length * editableCols.length;
        let attempts = 0;

        if (e.shiftKey) {
          do {
            nextEditableIdx--;
            if (nextEditableIdx < 0) {
              nextTaskIdx--;
              if (nextTaskIdx < 0) nextTaskIdx = currentVisibleTasks.length - 1;
              nextEditableIdx = editableCols.length - 1;
            }
            attempts++;
          } while (isSummaryRowTab(nextTaskIdx) && attempts < maxAttempts);
        } else {
          do {
            nextEditableIdx++;
            if (nextEditableIdx >= editableCols.length) {
              nextTaskIdx++;
              if (nextTaskIdx >= currentVisibleTasks.length) nextTaskIdx = 0;
              nextEditableIdx = 0;
            }
            attempts++;
          } while (isSummaryRowTab(nextTaskIdx) && attempts < maxAttempts);
        }

        if (attempts >= maxAttempts) return;

        const newCell: CellPosition = {
          taskId: currentVisibleTasks[nextTaskIdx].id,
          columnId: editableCols[nextEditableIdx],
        };
        setFocusedCell(newCell);
        cellAnchorRef.current = newCell;
        setSelectionRange(null);
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        if (editableCols.length > 0) {
          const newCell: CellPosition = { taskId: currentFocused.taskId, columnId: editableCols[0] };
          setFocusedCell(newCell);
          cellAnchorRef.current = newCell;
          setSelectionRange(null);
        }
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        if (editableCols.length > 0) {
          const newCell: CellPosition = { taskId: currentFocused.taskId, columnId: editableCols[editableCols.length - 1] };
          setFocusedCell(newCell);
          cellAnchorRef.current = newCell;
          setSelectionRange(null);
        }
        return;
      }

      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        if (!READ_ONLY_COLUMNS.includes(currentFocused.columnId)) {
          triggerCellEdit(currentFocused.taskId, currentFocused.columnId);
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        return;
      }

      if (e.key.length === 1 && !e.altKey && !READ_ONLY_COLUMNS.includes(currentFocused.columnId)) {
        e.preventDefault();
        triggerCellEdit(currentFocused.taskId, currentFocused.columnId, e.key);
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleGridCopy, selectedTaskIds, focusedCell, visibleColumns, getEditableColumns, triggerCellEdit, editingCell]);

  // Fetch project dependencies and calculate CPM
  const { data: projectDependenciesData } = useProjectDependencies(projectId);
  const projectDependencies = Array.isArray(projectDependenciesData) ? projectDependenciesData : [];
  
  // Calculate CPM results when tasks or dependencies change
  const cpmResults = useMemo(() => {
    if (tasks.length === 0) return { results: new Map<number, CPMResult>(), criticalPath: [] };
    
    const cpmTasks = tasks.map(t => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      durationDays: t.durationDays,
      isMilestone: t.isMilestone,
      isSummary: t.isSummary,
      constraintType: t.constraintType,
      constraintDate: t.constraintDate,
    }));
    
    const safeDeps = Array.isArray(projectDependencies) ? projectDependencies : [];
    const cpmDependencies = safeDeps.map(d => ({
      taskId: d.taskId,
      dependsOnTaskId: d.dependsOnTaskId,
      dependencyType: d.dependencyType,
      lagDays: d.lagDays,
    }));
    
    return calculateCPM(cpmTasks, cpmDependencies);
  }, [tasks, projectDependencies]);
  
  // Map of task ID to whether it's on critical path (from CPM calculation)
  const criticalTaskIds = useMemo(() => {
    const ids = new Set<number>();
    for (const [taskId, result] of Array.from(cpmResults.results.entries())) {
      if (result.isCritical) ids.add(taskId);
    }
    return ids;
  }, [cpmResults]);
  
  // Set of task IDs that have dependencies (dependent tasks)
  const tasksWithDependencies = useMemo(() => {
    const ids = new Set<number>();
    for (const dep of projectDependencies) {
      ids.add(dep.taskId); // The dependent task (successor)
    }
    return ids;
  }, [projectDependencies]);
  
  // Centralized list of tasks valid for baselining (have start and end dates)
  const validBaselineTasks = useMemo(() => 
    tasks.filter(t => t.startDate && t.endDate), 
    [tasks]
  );
  const validBaselineTaskIds = useMemo(() => 
    new Set(validBaselineTasks.map(t => t.id)),
    [validBaselineTasks]
  );
  
  // Column widths - use fixed pixel widths (no scaling)
  const [columnWidths, setColumnWidths] = useState<Record<GanttColumn, number>>(() => {
    const initial: Record<string, number> = {};
    GANTT_COLUMNS.forEach(col => {
      initial[col.id] = col.widthPx;
    });
    return initial as Record<GanttColumn, number>;
  });
  
  // Calculate total width of visible columns (for min-width of scrollable container)
  const totalColumnsWidth = useMemo(() => {
    // 32px for actions column + 32px for add column button
    return 64 + visibleColumns.reduce((sum, colId) => sum + (columnWidths[colId] || 96), 0);
  }, [visibleColumns, columnWidths]);
  
  // Resize state
  const [resizingColumn, setResizingColumn] = useState<GanttColumn | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  
  // Column add dropdown state
  const [isAddColumnOpen, setIsAddColumnOpen] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  
  // Column DnD state for direct header reordering
  const [draggingColumn, setDraggingColumn] = useState<GanttColumn | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<GanttColumn | null>(null);
  
  // Right-click context menu state
  const [contextMenuColumn, setContextMenuColumn] = useState<GanttColumn | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Handle column resize - adjusts only the resized column's width (panel scrolls if needed)
  const handleResizeStart = (e: React.MouseEvent, colId: GanttColumn) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(colId);
    setResizeStartX(e.clientX);
    setResizeStartWidth(columnWidths[colId] || 96);
  };
  
  useEffect(() => {
    if (!resizingColumn) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const pixelDiff = e.clientX - resizeStartX;
      const newWidth = Math.max(40, resizeStartWidth + pixelDiff);
      
      // Only update the resized column - other columns keep their widths
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };
    
    const handleMouseUp = () => {
      setResizingColumn(null);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);
  
  // Column context menu (right-click to remove)
  const handleColumnContextMenu = (e: React.MouseEvent, colId: GanttColumn) => {
    e.preventDefault();
    if (colId === 'task') return; // Can't remove task column
    setContextMenuColumn(colId);
    // Constrain to viewport bounds (assuming menu is ~150px wide and ~40px tall)
    const menuWidth = 150;
    const menuHeight = 40;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    setContextMenuPosition({ x: Math.max(10, x), y: Math.max(10, y) });
  };
  
  const removeColumn = (colId: GanttColumn) => {
    if (colId === 'task') return;
    setVisibleColumns(prev => prev.filter(c => c !== colId));
    setContextMenuColumn(null);
    setContextMenuPosition(null);
  };
  
  // Close context menu on click outside or Escape key
  useEffect(() => {
    if (!contextMenuPosition) return;
    const handleClick = () => {
      setContextMenuColumn(null);
      setContextMenuPosition(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuColumn(null);
        setContextMenuPosition(null);
      }
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuPosition]);
  
  // Add column from available fields
  const availableColumnsToAdd = useMemo(() => {
    return GANTT_COLUMNS.filter(col => !visibleColumns.includes(col.id));
  }, [visibleColumns]);
  
  const filteredColumnsToAdd = useMemo(() => {
    if (!columnSearchQuery.trim()) return availableColumnsToAdd;
    const query = normalizeSearch(columnSearchQuery);
    return availableColumnsToAdd.filter(col => 
      normalizeSearch(col.label).includes(query) || normalizeSearch(col.id).includes(query)
    );
  }, [availableColumnsToAdd, columnSearchQuery]);
  
  const addColumn = (colId: GanttColumn) => {
    setVisibleColumns(prev => [...prev, colId]);
  };
  
  // Column drag-and-drop reordering
  const handleColumnDragStart = (e: React.DragEvent, colId: GanttColumn) => {
    if (colId === 'task') return; // Can't drag task column
    setDraggingColumn(colId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colId);
  };
  
  const handleColumnDragOver = (e: React.DragEvent, colId: GanttColumn) => {
    e.preventDefault();
    if (draggingColumn && draggingColumn !== colId) {
      setDragOverColumn(colId);
    }
  };
  
  const handleColumnDragLeave = () => {
    setDragOverColumn(null);
  };
  
  const handleColumnDrop = (e: React.DragEvent, targetColId: GanttColumn) => {
    e.preventDefault();
    if (!draggingColumn || draggingColumn === targetColId) {
      setDraggingColumn(null);
      setDragOverColumn(null);
      return;
    }
    
    setVisibleColumns(prev => {
      const newCols = [...prev];
      const dragIdx = newCols.indexOf(draggingColumn);
      const targetIdx = newCols.indexOf(targetColId);
      if (dragIdx > -1 && targetIdx > -1) {
        newCols.splice(dragIdx, 1);
        newCols.splice(targetIdx, 0, draggingColumn);
      }
      return newCols;
    });
    
    setDraggingColumn(null);
    setDragOverColumn(null);
  };
  
  const handleColumnDragEnd = () => {
    setDraggingColumn(null);
    setDragOverColumn(null);
  };

  const handleIndent = useCallback((task: Task) => {
    const currentLevel = Math.max(1, Math.min(6, task.outlineLevel || 1));
    const newLevel = Math.min(6, currentLevel + 1);
    
    // Check max level
    if (currentLevel >= 6 || newLevel > 6) {
      toast({ title: "Cannot indent", description: "Maximum outline level (6) reached", variant: "destructive" });
      return;
    }
    
    // Validate hierarchy: can only indent one level deeper than the previous task
    const taskIndex = tasks.findIndex(t => t.id === task.id);
    if (taskIndex > 0) {
      const prevTask = tasks[taskIndex - 1];
      const prevLevel = prevTask.outlineLevel || 1;
      // New level cannot exceed previous task's level + 1
      if (newLevel > prevLevel + 1) {
        toast({ title: "Cannot indent", description: "Task can only be one level deeper than the task above", variant: "destructive" });
        return;
      }
    } else if (taskIndex === 0 && newLevel > 1) {
      // First task cannot be indented past level 1
      toast({ title: "Cannot indent", description: "First task cannot be a child", variant: "destructive" });
      return;
    }
    
    pushToUndoStack(task.id, task.projectId, { outlineLevel: currentLevel }, { outlineLevel: newLevel }, 'Indent');
    
    updateTask.mutate({ 
      id: task.id, 
      projectId: task.projectId, 
      outlineLevel: newLevel 
    }, {
      onSuccess: () => {
        toast({ title: "Updated", description: `Task indented to level ${newLevel}` });
      },
      onError: () => {
        setUndoStack(prev => prev.slice(0, -1));
        toast({ title: "Error", description: "Failed to indent task", variant: "destructive" });
      }
    });
  }, [tasks, pushToUndoStack, updateTask, toast]);

  const handleOutdent = useCallback((task: Task) => {
    const currentLevel = Math.max(1, Math.min(6, task.outlineLevel || 1));
    const newLevel = Math.max(1, currentLevel - 1);
    if (currentLevel <= 1 || newLevel < 1) {
      toast({ title: "Cannot outdent", description: "Minimum outline level (1) reached", variant: "destructive" });
      return;
    }
    
    pushToUndoStack(task.id, task.projectId, { outlineLevel: currentLevel }, { outlineLevel: newLevel }, 'Outdent');
    
    updateTask.mutate({ 
      id: task.id, 
      projectId: task.projectId, 
      outlineLevel: newLevel 
    }, {
      onSuccess: () => {
        toast({ title: "Updated", description: `Task outdented to level ${newLevel}` });
      },
      onError: () => {
        setUndoStack(prev => prev.slice(0, -1));
        toast({ title: "Error", description: "Failed to outdent task", variant: "destructive" });
      }
    });
  }, [tasks, pushToUndoStack, updateTask, toast]);

  // Bulk indent for selected tasks
  const handleBulkIndent = async () => {
    if (selectedTaskIds.size === 0) return;
    
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
    let successCount = 0;
    let errorCount = 0;
    
    for (const task of selectedTasks) {
      const currentLevel = Math.max(1, Math.min(6, task.outlineLevel || 1));
      const newLevel = Math.min(6, currentLevel + 1);
      
      if (currentLevel >= 6) {
        errorCount++;
        continue;
      }
      
      try {
        await updateTask.mutateAsync({ 
          id: task.id, 
          projectId: task.projectId, 
          outlineLevel: newLevel 
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }
    
    if (successCount > 0) {
      toast({ title: "Tasks indented", description: `${successCount} task${successCount !== 1 ? 's' : ''} indented${errorCount > 0 ? `, ${errorCount} failed` : ''}` });
    } else if (errorCount > 0) {
      toast({ title: "Cannot indent", description: "Selected tasks are at maximum level", variant: "destructive" });
    }
  };

  // Bulk outdent for selected tasks
  const handleBulkOutdent = async () => {
    if (selectedTaskIds.size === 0) return;
    
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
    let successCount = 0;
    let errorCount = 0;
    
    for (const task of selectedTasks) {
      const currentLevel = Math.max(1, Math.min(6, task.outlineLevel || 1));
      const newLevel = Math.max(1, currentLevel - 1);
      
      if (currentLevel <= 1) {
        errorCount++;
        continue;
      }
      
      try {
        await updateTask.mutateAsync({ 
          id: task.id, 
          projectId: task.projectId, 
          outlineLevel: newLevel 
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }
    
    if (successCount > 0) {
      toast({ title: "Tasks outdented", description: `${successCount} task${successCount !== 1 ? 's' : ''} outdented${errorCount > 0 ? `, ${errorCount} failed` : ''}` });
    } else if (errorCount > 0) {
      toast({ title: "Cannot outdent", description: "Selected tasks are at minimum level", variant: "destructive" });
    }
  };

  // Bulk baseline for selected tasks
  const handleBulkSetProgress = async (progressValue: number) => {
    if (selectedTaskIds.size < 1) return;
    
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
    try {
      const taskIds = selectedTasks.map(t => t.id);
      const result = await bulkUpdate.mutateAsync({
        taskIds,
        updates: { progress: progressValue },
        projectId,
      });
      toast({ title: "Progress updated", description: `${result.updatedCount} task${result.updatedCount !== 1 ? 's' : ''} set to ${progressValue}%` });
    } catch {
      toast({ title: "Update failed", description: "Failed to update progress", variant: "destructive" });
    }
  };

  const handleBulkBaseline = async () => {
    if (selectedTaskIds.size === 0) return;
    
    const selectedTasks = tasks.filter(t => selectedTaskIds.has(t.id));
    const tasksWithDates = selectedTasks.filter(t => t.startDate && t.endDate);
    const skippedCount = selectedTasks.length - tasksWithDates.length;
    
    if (tasksWithDates.length === 0) {
      toast({ title: "Cannot set baseline", description: "Selected tasks have no start/end dates", variant: "destructive" });
      return;
    }
    
    try {
      const taskUpdates = tasksWithDates.map(t => ({
        taskId: t.id,
        updates: { baselineStartDate: t.startDate!, baselineEndDate: t.endDate! },
      }));
      const result = await bulkUpdate.mutateAsync({ taskUpdates, projectId });
      toast({ title: "Baseline set", description: `${result.updatedCount} task${result.updatedCount !== 1 ? 's' : ''} baselined${skippedCount > 0 ? `, ${skippedCount} skipped (no dates)` : ''}` });
    } catch {
      toast({ title: "Baseline failed", description: "Failed to set baseline", variant: "destructive" });
    }
  };

  // Circular dependency detection helper
  const wouldCreateCircularDependency = (fromTaskId: number, toTaskId: number, existingDeps: typeof projectDependencies): boolean => {
    // Check if adding fromTaskId -> toTaskId would create a cycle
    // This means checking if there's already a path from toTaskId back to fromTaskId
    const visited = new Set<number>();
    const stack = [toTaskId];
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromTaskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      
      // Find all tasks that this task depends on
      for (const dep of existingDeps) {
        if (dep.taskId === current) {
          stack.push(dep.dependsOnTaskId);
        }
      }
    }
    return false;
  };

  // Bulk link for selected tasks (FS dependencies in grid order)
  const handleBulkLink = async () => {
    if (selectedTaskIds.size < 2) {
      toast({ title: "Select at least 2 tasks", description: "Link requires 2 or more tasks selected", variant: "destructive" });
      return;
    }
    
    // Get selected tasks in their grid order
    const selectedTasksInOrder = tasks.filter(t => selectedTaskIds.has(t.id));
    
    // Check for summary tasks (tasks that have children)
    const summaryTaskIds = new Set<number>();
    for (const task of tasks) {
      const parentId = task.parentId;
      if (parentId) summaryTaskIds.add(parentId);
    }
    
    const summaryTasksSelected = selectedTasksInOrder.filter(t => summaryTaskIds.has(t.id));
    if (summaryTasksSelected.length > 0) {
      toast({ 
        title: "Cannot link summary tasks", 
        description: `${summaryTasksSelected.length} summary task${summaryTasksSelected.length !== 1 ? 's' : ''} skipped (${summaryTasksSelected.map(t => t.name).join(', ')})`,
        variant: "destructive" 
      });
      // Filter out summary tasks and continue with remaining
      const linkableTasks = selectedTasksInOrder.filter(t => !summaryTaskIds.has(t.id));
      if (linkableTasks.length < 2) {
        return;
      }
    }
    
    const linkableTasks = selectedTasksInOrder.filter(t => !summaryTaskIds.has(t.id));
    
    // Build set of existing dependencies for quick lookup
    const existingDepSet = new Set(
      projectDependencies.map(d => `${d.taskId}-${d.dependsOnTaskId}`)
    );
    
    let successCount = 0;
    let duplicateCount = 0;
    let circularCount = 0;
    let errorCount = 0;
    let lastErrorMessage = '';
    
    // Create a working copy of dependencies to track additions
    const workingDeps = [...projectDependencies];
    
    // Link sequentially: task[0] -> task[1] -> task[2] ... (each depends on previous)
    for (let i = 1; i < linkableTasks.length; i++) {
      const successorTask = linkableTasks[i];
      const predecessorTask = linkableTasks[i - 1];
      
      const depKey = `${successorTask.id}-${predecessorTask.id}`;
      
      // Check for duplicate
      if (existingDepSet.has(depKey)) {
        duplicateCount++;
        continue;
      }
      
      // Check for circular dependency
      if (wouldCreateCircularDependency(predecessorTask.id, successorTask.id, workingDeps)) {
        circularCount++;
        continue;
      }
      
      const depType = schedulingDefaults?.defaultDependencyType || 'FinishToStart';
      const depLag = schedulingDefaults?.defaultLagDays || 0;
      try {
        await addDependency.mutateAsync({
          taskId: successorTask.id,
          dependsOnTaskId: predecessorTask.id,
          projectId,
          dependencyType: depType,
          lagDays: depLag,
        });
        workingDeps.push({
          id: 0,
          taskId: successorTask.id,
          dependsOnTaskId: predecessorTask.id,
          dependencyType: depType,
          lagDays: depLag,
          createdAt: new Date(),
        });
        existingDepSet.add(depKey);
        pushActionToUndoStack({ type: 'addDependency', taskId: successorTask.id, dependsOnTaskId: predecessorTask.id, projectId });
        successCount++;
      } catch (error: unknown) {
        errorCount++;
        // Capture first error message for feedback
        if (!lastErrorMessage && error instanceof Error) {
          lastErrorMessage = error.message;
        }
      }
    }
    
    // Provide feedback
    const messages: string[] = [];
    if (successCount > 0) messages.push(`${successCount} link${successCount !== 1 ? 's' : ''} created`);
    if (duplicateCount > 0) messages.push(`${duplicateCount} already existed`);
    if (circularCount > 0) messages.push(`${circularCount} blocked (circular)`);
    if (errorCount > 0 && lastErrorMessage) messages.push(lastErrorMessage);
    else if (errorCount > 0) messages.push(`${errorCount} failed`);
    
    if (successCount > 0) {
      toast({ title: "Tasks linked", description: messages.join(', ') });
    } else if (circularCount > 0) {
      toast({ title: "Cannot link", description: "Would create circular dependencies", variant: "destructive" });
    } else if (duplicateCount > 0) {
      toast({ title: "Already linked", description: "All selected tasks are already linked in sequence" });
    } else if (lastErrorMessage) {
      toast({ title: "Cannot link tasks", description: lastErrorMessage, variant: "destructive" });
    } else {
      toast({ title: "Link failed", description: messages.join(', '), variant: "destructive" });
    }
  };

  // Bulk unlink for selected tasks (remove dependencies between them only)
  const handleBulkUnlink = async () => {
    if (selectedTaskIds.size < 2) {
      toast({ title: "Select at least 2 tasks", description: "Unlink requires 2 or more tasks selected", variant: "destructive" });
      return;
    }
    
    // Find all dependencies that exist between the selected tasks
    const selectedSet = selectedTaskIds;
    const depsToRemove = projectDependencies.filter(
      dep => selectedSet.has(dep.taskId) && selectedSet.has(dep.dependsOnTaskId)
    );
    
    if (depsToRemove.length === 0) {
      toast({ title: "No links found", description: "No dependencies exist between the selected tasks" });
      return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    let lastErrorMessage = '';
    
    for (const dep of depsToRemove) {
      try {
        await removeDependency.mutateAsync({
          taskId: dep.taskId,
          dependsOnTaskId: dep.dependsOnTaskId,
          projectId,
        });
        pushActionToUndoStack({ type: 'removeDependency', taskId: dep.taskId, dependsOnTaskId: dep.dependsOnTaskId, projectId });
        successCount++;
      } catch (error: unknown) {
        errorCount++;
        if (!lastErrorMessage && error instanceof Error) {
          lastErrorMessage = error.message;
        }
      }
    }
    
    if (successCount > 0) {
      toast({ 
        title: "Tasks unlinked", 
        description: `${successCount} link${successCount !== 1 ? 's' : ''} removed${errorCount > 0 ? `, ${errorCount} failed` : ''}` 
      });
    } else if (lastErrorMessage) {
      toast({ title: "Cannot unlink tasks", description: lastErrorMessage, variant: "destructive" });
    } else {
      toast({ title: "Unlink failed", description: "Could not remove dependencies", variant: "destructive" });
    }
  };

  // Collapse/expand state management - persisted per user per project
  const { user: authUser } = useAuth();
  const getCollapsedTasksKey = (pid: number, uid: string) => `project-collapsed-tasks-${uid}-${pid}`;

  const [collapsedTasks, setCollapsedTasks] = useState<Set<number>>(() => {
    if (!authUser?.id) return new Set<number>();
    try {
      const saved = localStorage.getItem(getCollapsedTasksKey(projectId, authUser.id));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set<number>(parsed);
      }
    } catch {}
    return new Set<number>();
  });

  const hasInitializedCollapseRef = useRef(false);

  useEffect(() => {
    hasInitializedCollapseRef.current = false;
  }, [projectId, authUser?.id]);

  useEffect(() => {
    if (!authUser?.id) return;
    if (hasInitializedCollapseRef.current) return;

    try {
      const saved = localStorage.getItem(getCollapsedTasksKey(projectId, authUser.id));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCollapsedTasks(new Set<number>(parsed));
          hasInitializedCollapseRef.current = true;
          return;
        }
      }
    } catch {}

    if (tasks && tasks.length > 0) {
      const parentIds = new Set<number>();
      for (let i = 0; i < tasks.length; i++) {
        const currentLevel = tasks[i].outlineLevel || 1;
        if (i + 1 < tasks.length) {
          const nextLevel = tasks[i + 1].outlineLevel || 1;
          if (nextLevel > currentLevel) {
            parentIds.add(tasks[i].id);
          }
        }
      }
      setCollapsedTasks(parentIds);
      hasInitializedCollapseRef.current = true;
    }
  }, [projectId, authUser?.id, tasks]);

  const toggleCollapse = useCallback((taskId: number) => {
    setCollapsedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      if (authUser?.id) {
        try {
          localStorage.setItem(getCollapsedTasksKey(projectId, authUser.id), JSON.stringify(Array.from(next)));
        } catch {}
      }
      return next;
    });
  }, [authUser?.id, projectId]);

  const collapseAllTasks = useCallback(() => {
    if (!tasks || tasks.length === 0) return;
    const parentIds = new Set<number>();
    for (let i = 0; i < tasks.length; i++) {
      const currentLevel = tasks[i].outlineLevel || 1;
      if (i + 1 < tasks.length) {
        const nextLevel = tasks[i + 1].outlineLevel || 1;
        if (nextLevel > currentLevel) {
          parentIds.add(tasks[i].id);
        }
      }
    }
    setCollapsedTasks(parentIds);
    if (authUser?.id) {
      try {
        localStorage.setItem(getCollapsedTasksKey(projectId, authUser.id), JSON.stringify(Array.from(parentIds)));
      } catch {}
    }
  }, [tasks, authUser?.id, projectId]);

  const expandAllTasks = useCallback(() => {
    setCollapsedTasks(new Set<number>());
    if (authUser?.id) {
      try {
        localStorage.setItem(getCollapsedTasksKey(projectId, authUser.id), JSON.stringify([]));
      } catch {}
    }
  }, [authUser?.id, projectId]);

  // Determine which tasks have children, filter visible tasks, and compute WBS
  // Uses tasks in their original order to preserve hierarchy
  const { visibleTasks, taskHasChildren, wbsMap, absoluteIndexMap } = useMemo(() => {
    const taskHasChildren: Record<number, boolean> = {};

    // First pass: determine which tasks have children based on outline levels
    for (let i = 0; i < tasks.length; i++) {
      const currentTask = tasks[i];
      const currentLevel = currentTask.outlineLevel || 1;
      
      // Check if next task is a child (higher level)
      if (i + 1 < tasks.length) {
        const nextTask = tasks[i + 1];
        const nextLevel = nextTask.outlineLevel || 1;
        if (nextLevel > currentLevel) {
          taskHasChildren[currentTask.id] = true;
        }
      }
    }

    // Second pass: filter out collapsed children
    const visibleTasks: Task[] = [];
    let skipUntilLevel = -1;

    for (const task of tasks) {
      const taskLevel = task.outlineLevel || 1;

      // If we're skipping and this task is still a child, skip it
      if (skipUntilLevel > 0 && taskLevel > skipUntilLevel) {
        continue;
      } else {
        skipUntilLevel = -1;
      }

      visibleTasks.push(task);

      // If this task is collapsed and has children, skip its children
      if (collapsedTasks.has(task.id) && taskHasChildren[task.id]) {
        skipUntilLevel = taskLevel;
      }
    }

    // Compute WBS values based on task hierarchy (using ALL tasks, not just visible)
    const wbsMap = computeWbsValues(tasks);

    const absoluteIndexMap = new Map<number, number>();
    for (let i = 0; i < tasks.length; i++) {
      absoluteIndexMap.set(tasks[i].id, i + 1);
    }

    return { visibleTasks, taskHasChildren, wbsMap, absoluteIndexMap };
  }, [tasks, collapsedTasks]);

  visibleTasksRef.current = visibleTasks;
  taskHasChildrenRef.current = taskHasChildren;

  // Virtual scrolling: only render rows visible in the viewport when task count is large
  const VIRTUAL_SCROLL_THRESHOLD = 100;
  const [forceDisableVirtualScroll, setForceDisableVirtualScroll] = useState(false);
  useEffect(() => {
    const handleExportStart = () => setForceDisableVirtualScroll(true);
    const handleExportEnd = () => setForceDisableVirtualScroll(false);
    window.addEventListener('gantt-export-start', handleExportStart);
    window.addEventListener('gantt-export-end', handleExportEnd);
    return () => {
      window.removeEventListener('gantt-export-start', handleExportStart);
      window.removeEventListener('gantt-export-end', handleExportEnd);
    };
  }, []);
  const useVirtualScroll = visibleTasks.length > VIRTUAL_SCROLL_THRESHOLD && !forceDisableVirtualScroll;
  const rowVirtualizer = useVirtualizer({
    count: visibleTasks.length,
    getScrollElement: () => rightPaneRef.current,
    estimateSize: (index) => {
      const task = visibleTasks[index];
      return showBaseline && task?.baselineStartDate && task?.baselineEndDate ? 36 : 28;
    },
    overscan: 15,
    enabled: useVirtualScroll,
  });

  // Calculate project summary task (aggregated from all tasks)
  const projectSummaryTask = useMemo((): Partial<Task> & { id: number; projectId: number; name: string } | null => {
    if (!tasks || tasks.length === 0) return null;
    
    // Find earliest start date and latest end date
    let earliestStart: string | null = null;
    let latestEnd: string | null = null;
    let totalProgress = 0;
    let taskCount = 0;
    let totalEstimatedHours = 0;
    let totalActualHours = 0;
    let totalCost = 0;
    let totalActualCost = 0;
    
    for (const task of tasks) {
      if (task.startDate) {
        if (!earliestStart || task.startDate < earliestStart) {
          earliestStart = task.startDate;
        }
      }
      if (task.endDate) {
        if (!latestEnd || task.endDate > latestEnd) {
          latestEnd = task.endDate;
        }
      }
      if (task.progress !== null && task.progress !== undefined) {
        totalProgress += task.progress;
        taskCount++;
      }
      if (task.estimatedHours) totalEstimatedHours += Number(task.estimatedHours);
      if (task.actualHours) totalActualHours += Number(task.actualHours);
      if (task.cost) totalCost += Number(task.cost);
      if (task.actualCost) totalActualCost += Number(task.actualCost);
    }
    
    const avgProgress = taskCount > 0 ? Math.round(totalProgress / taskCount) : 0;
    
    return {
      id: -1, // Special ID for project summary
      projectId: projectId,
      name: projectName || 'Project Summary',
      description: null,
      taskNumber: null,
      taskIndex: 0,
      wbs: '0',
      taskType: null,
      priority: 'Medium',
      startDate: earliestStart || '',
      endDate: latestEnd || '',
      baselineStartDate: null,
      baselineEndDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: earliestStart && latestEnd ? 
        calculateDurationInWorkingDays(earliestStart, latestEnd) : null,
      estimatedHours: totalEstimatedHours > 0 ? String(totalEstimatedHours) : null,
      actualHours: totalActualHours > 0 ? String(totalActualHours) : null,
      remainingHours: null,
      progress: avgProgress,
      status: 'In Progress',
      constraintType: null,
      constraintDate: null,
      assignee: null,
      ownerId: null,
      outlineLevel: 0,
      parentId: null,
      isMilestone: false,
      isSummary: true,
      isCritical: false,
      cost: totalCost > 0 ? String(totalCost) : null,
      actualCost: totalActualCost > 0 ? String(totalActualCost) : null,
      phase: null,
      category: null,
      labels: null,
      notes: null,
      createdAt: new Date(),
      deletedAt: null,
      deletedBy: null,
      isDemo: false,
    };
  }, [tasks, projectId, projectName]);

  const handleAddTask = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTaskName.trim()) {
      const lastTask = tasks.length > 0 ? tasks[tasks.length - 1] : null;
      const outlineLevel = lastTask?.outlineLevel || 1;
      const parentId = lastTask?.parentId || null;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      createTask.mutate({
        projectId,
        name: newTaskName.trim(),
        startDate: todayStr,
        endDate: calculateEndDateFromWorkingDays(todayStr, 1),
        durationDays: 1,
        outlineLevel,
        parentId,
        status: 'Not Started',
        progress: 0,
      }, {
        onError: (error: unknown) => {
          const err = error as { limitExceeded?: boolean; message?: string };
          if (err.limitExceeded) {
            toast({ title: "Limit reached", description: err.message || "Task limit reached", variant: "destructive" });
          } else {
            toast({ title: "Error", description: err.message || "Failed to create task", variant: "destructive" });
          }
        }
      });
      setNewTaskName('');
    }
  };

  const handleCreateTaskAt = useCallback((referenceTask: Task, position: 'above' | 'below') => {
    const refIndex = tasks.findIndex(t => t.id === referenceTask.id);
    if (refIndex === -1) return;

    const targetIndex = position === 'above' ? refIndex : refIndex + 1;

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    createTask.mutate({
      projectId,
      name: 'New Task',
      startDate: todayStr,
      endDate: calculateEndDateFromWorkingDays(todayStr, 1),
      durationDays: 1,
      outlineLevel: referenceTask.outlineLevel || 1,
      parentId: referenceTask.parentId || null,
      status: 'Not Started',
      progress: 0,
    }, {
      onSuccess: (newTask: Task) => {
        reorderTask.mutate({
          projectId,
          taskId: newTask.id,
          newIndex: targetIndex,
        });
        pushActionToUndoStack({ type: 'create', taskId: newTask.id, projectId });
        toast({ title: "Task created", description: `New task created ${position} "${referenceTask.name}"` });
      },
      onError: (error: unknown) => {
        const err = error as { limitExceeded?: boolean; message?: string };
        if (err.limitExceeded) {
          toast({ title: "Limit reached", description: err.message || "Task limit reached", variant: "destructive" });
        } else {
          toast({ title: "Error", description: err.message || "Failed to create task", variant: "destructive" });
        }
      }
    });
  }, [tasks, projectId, createTask, reorderTask, pushActionToUndoStack, toast]);

  const handleDeleteTask = useCallback((task: Task) => {
    deleteTask.mutate({ id: task.id, projectId: task.projectId }, {
      onSuccess: () => {
        pushActionToUndoStack({ type: 'delete', taskId: task.id, projectId: task.projectId });
        toast({ title: "Task deleted", description: `"${task.name}" has been deleted` });
      },
      onError: (error: unknown) => {
        const err = error as { message?: string };
        toast({ title: "Error", description: err.message || "Failed to delete task", variant: "destructive" });
      }
    });
  }, [deleteTask, pushActionToUndoStack, toast]);

  // State for dependencies dialog
  const [dependenciesDialogTask, setDependenciesDialogTask] = useState<Task | null>(null);

  const handleSetBaseline = useCallback((task: Task) => {
    if (!task.startDate || !task.endDate) {
      toast({ title: "Cannot set baseline", description: "Task must have start and end dates", variant: "destructive" });
      return;
    }
    updateTask.mutate({
      id: task.id,
      projectId: task.projectId,
      baselineStartDate: task.startDate,
      baselineEndDate: task.endDate,
    }, {
      onSuccess: () => {
        toast({ title: "Baseline set", description: "Current dates saved as baseline" });
      }
    });
  }, [updateTask, toast]);

  const handleClearBaseline = useCallback((task: Task) => {
    updateTask.mutate({
      id: task.id,
      projectId: task.projectId,
      baselineStartDate: null,
      baselineEndDate: null,
    }, {
      onSuccess: () => {
        toast({ title: "Baseline cleared", description: "Baseline dates removed" });
      }
    });
  }, [updateTask, toast]);

  const handleEditDependencies = useCallback((task: Task) => {
    setDependenciesDialogTask(task);
  }, []);

  const toggleColumn = (col: GanttColumn) => {
    if (col === 'task') return;
    setVisibleColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  // Column reordering state and dialog
  const [isReorderDialogOpen, setIsReorderDialogOpen] = useState(false);
  const [reorderColumns, setReorderColumns] = useState<GanttColumn[]>([]);

  const openReorderDialog = () => {
    setReorderColumns([...visibleColumns]);
    setIsReorderDialogOpen(true);
  };

  const handleReorderDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setReorderColumns((cols) => {
        const oldIndex = cols.indexOf(active.id as GanttColumn);
        const newIndex = cols.indexOf(over.id as GanttColumn);
        const newCols = [...cols];
        newCols.splice(oldIndex, 1);
        newCols.splice(newIndex, 0, active.id as GanttColumn);
        return newCols;
      });
    }
  };

  const applyColumnOrder = () => {
    setVisibleColumns(reorderColumns);
    setIsReorderDialogOpen(false);
  };

  const moveColumnUp = (col: GanttColumn) => {
    const idx = reorderColumns.indexOf(col);
    if (idx > 0) {
      const newCols = [...reorderColumns];
      [newCols[idx - 1], newCols[idx]] = [newCols[idx], newCols[idx - 1]];
      setReorderColumns(newCols);
    }
  };

  const moveColumnDown = (col: GanttColumn) => {
    const idx = reorderColumns.indexOf(col);
    if (idx < reorderColumns.length - 1) {
      const newCols = [...reorderColumns];
      [newCols[idx], newCols[idx + 1]] = [newCols[idx + 1], newCols[idx]];
      setReorderColumns(newCols);
    }
  };

  // Baseline handlers
  const openBaselineDialog = () => {
    setBaselineMode('entire');
    setSelectedTasksForBaseline(new Set());
    setIsBaselineDialogOpen(true);
  };

  const toggleTaskForBaseline = useCallback((taskId: number, includeChildren: boolean = false) => {
    setSelectedTasksForBaseline(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
        // Also remove children if this is a summary task
        if (includeChildren) {
          const taskIndex = tasks.findIndex(t => t.id === taskId);
          const task = tasks[taskIndex];
          if (task) {
            const taskLevel = task.outlineLevel || 1;
            for (let i = taskIndex + 1; i < tasks.length; i++) {
              const childTask = tasks[i];
              const childLevel = childTask.outlineLevel || 1;
              if (childLevel > taskLevel) {
                next.delete(childTask.id);
              } else {
                break;
              }
            }
          }
        }
      } else {
        next.add(taskId);
        // Also add children if this is a summary task
        if (includeChildren) {
          const taskIndex = tasks.findIndex(t => t.id === taskId);
          const task = tasks[taskIndex];
          if (task) {
            const taskLevel = task.outlineLevel || 1;
            for (let i = taskIndex + 1; i < tasks.length; i++) {
              const childTask = tasks[i];
              const childLevel = childTask.outlineLevel || 1;
              if (childLevel > taskLevel) {
                next.add(childTask.id);
              } else {
                break;
              }
            }
          }
        }
      }
      return next;
    });
  }, [tasks]);

  const handleBaselineSubmit = async (): Promise<boolean> => {
    setIsBaselinePending(true);
    try {
      const taskIds = baselineMode === 'selected' ? Array.from(selectedTasksForBaseline) : undefined;
      const response = await fetch(`/api/projects/${projectId}/tasks/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskIds }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to set baseline');
      }
      
      const result = await response.json();
      toast({ 
        title: "Baseline Set", 
        description: `${result.updatedCount} task(s) baselined successfully` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setIsBaselineDialogOpen(false);
      setShowBaseline(true);
      return true;
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to set baseline", 
        variant: "destructive" 
      });
      return false;
    } finally {
      setIsBaselinePending(false);
    }
  };

  const handleClearAllBaselines = async () => {
    setIsBaselinePending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks/baseline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clearBaseline: true }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear baselines');
      }
      
      toast({ title: "Baselines Cleared", description: "All task baselines have been removed" });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'tasks'] });
      setShowBaseline(false);
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to clear baselines", 
        variant: "destructive" 
      });
    } finally {
      setIsBaselinePending(false);
    }
  };

  // Check if any tasks have baselines
  const hasAnyBaselines = useMemo(() => {
    return tasks.some(t => t.baselineStartDate && t.baselineEndDate);
  }, [tasks]);

  const parsedDatesMap = useMemo(() => {
    const map = new Map<number, {
      start: Date | null;
      end: Date | null;
      baselineStart: Date | null;
      baselineEnd: Date | null;
      actualStart: Date | null;
      actualEnd: Date | null;
      constraintDate: Date | null;
      startFormatted: string;
      endFormatted: string;
      baselineStartFormatted: string;
      baselineEndFormatted: string;
      actualStartFormatted: string;
      actualEndFormatted: string;
      constraintDateFormatted: string;
      duration: number | null;
    }>();
    for (const t of tasks) {
      const start = t.startDate ? parseISO(t.startDate) : null;
      const end = t.endDate ? parseISO(t.endDate) : null;
      const baselineStart = t.baselineStartDate ? parseISO(t.baselineStartDate) : null;
      const baselineEnd = t.baselineEndDate ? parseISO(t.baselineEndDate) : null;
      const actualStart = t.actualStartDate ? parseISO(t.actualStartDate) : null;
      const actualEnd = t.actualEndDate ? parseISO(t.actualEndDate) : null;
      const constraintDate = t.constraintDate ? parseISO(t.constraintDate) : null;
      const duration = t.durationDays != null ? t.durationDays : ((start && end) ? (t.startDate === t.endDate ? 0 : calculateDurationInWorkingDays(t.startDate, t.endDate)) : null);
      map.set(t.id, {
        start,
        end,
        baselineStart,
        baselineEnd,
        actualStart,
        actualEnd,
        constraintDate,
        startFormatted: start ? format(start, 'MM/dd/yyyy') : '—',
        endFormatted: end ? format(end, 'MM/dd/yyyy') : '—',
        baselineStartFormatted: baselineStart ? format(baselineStart, 'MM/dd/yyyy') : '—',
        baselineEndFormatted: baselineEnd ? format(baselineEnd, 'MM/dd/yyyy') : '—',
        actualStartFormatted: actualStart ? format(actualStart, 'MM/dd/yyyy') : '—',
        actualEndFormatted: actualEnd ? format(actualEnd, 'MM/dd/yyyy') : '—',
        constraintDateFormatted: constraintDate ? format(constraintDate, 'MM/dd/yyyy') : '—',
        duration,
      });
    }
    return map;
  }, [tasks]);
  
  const { minDate, maxDate, dateRange, autoZoomLevel } = useMemo(() => {
    let minDate: Date;
    let maxDate: Date;
    
    const projStart = projectStartDate ? parseISO(projectStartDate) : null;
    const projEnd = projectEndDate ? parseISO(projectEndDate) : null;

    const MIN_VALID_YEAR = 1970;
    const MAX_VALID_YEAR = 2100;
    const isValidDate = (d: Date) => {
      const y = d.getFullYear();
      return y >= MIN_VALID_YEAR && y <= MAX_VALID_YEAR && !isNaN(d.getTime());
    };
    const tasksWithDates = tasks.filter(t => {
      const parsed = parsedDatesMap.get(t.id);
      return parsed?.start && parsed?.end && isValidDate(parsed.start) && isValidDate(parsed.end);
    });
    let scheduleMin: Date | null = null;
    let scheduleMax: Date | null = null;
    if (tasksWithDates.length > 0) {
      const dates = tasksWithDates.flatMap(t => {
        const parsed = parsedDatesMap.get(t.id)!;
        return [parsed.start!, parsed.end!];
      }).filter(isValidDate);
      scheduleMin = new Date(Math.min(...dates.map(d => d.getTime())));
      scheduleMax = new Date(Math.max(...dates.map(d => d.getTime())));
    }

    let effStart: Date | null = null;
    let effEnd: Date | null = null;
    if (projStart && scheduleMin) {
      effStart = projStart < scheduleMin ? projStart : scheduleMin;
    } else {
      effStart = projStart || scheduleMin;
    }
    if (projEnd && scheduleMax) {
      effEnd = projEnd > scheduleMax ? projEnd : scheduleMax;
    } else {
      effEnd = projEnd || scheduleMax;
    }

    if (effStart && effEnd) {
      const totalDays = differenceInDays(effEnd, effStart);
      let autoZoom: ZoomLevel = 'month';
      if (totalDays <= 14) autoZoom = 'day';
      else if (totalDays <= 60) autoZoom = 'week';
      else if (totalDays <= 180) autoZoom = 'month';
      else if (totalDays <= 365) autoZoom = 'quarter';
      else if (totalDays <= 730) autoZoom = 'year';
      else autoZoom = '5year';
      
      minDate = startOfMonth(effStart);
      maxDate = endOfMonth(effEnd);
      
      return { minDate, maxDate, dateRange: eachDayOfInterval({ start: minDate, end: maxDate }), autoZoomLevel: autoZoom };
    } else {
      minDate = startOfMonth(today);
      maxDate = endOfMonth(addDays(today, 60));
      return { minDate, maxDate, dateRange: eachDayOfInterval({ start: minDate, end: maxDate }), autoZoomLevel: 'month' as ZoomLevel };
    }
  }, [tasks, parsedDatesMap, today, projectStartDate, projectEndDate]);

  useEffect(() => {
    setZoomLevel(autoZoomLevel);
  }, [autoZoomLevel]);

  const { adjustedMinDate, adjustedMaxDate, adjustedDateRange } = useMemo(() => {
    let adjMinDate = minDate;
    let adjMaxDate = maxDate;
    
    if (zoomLevel === 'quarter') {
      adjMinDate = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
      adjMaxDate = new Date(maxDate.getFullYear(), Math.ceil((maxDate.getMonth() + 1) / 3) * 3, 0);
    } else if (zoomLevel === 'year') {
      adjMinDate = new Date(minDate.getFullYear(), 0, 1);
      adjMaxDate = new Date(maxDate.getFullYear(), 11, 31);
    } else if (zoomLevel === '5year') {
      const startYear = minDate.getFullYear();
      const endYear = maxDate.getFullYear();
      adjMinDate = new Date(startYear, 0, 1);
      // Ensure we show all years up to maxDate, with at least 5 years span
      adjMaxDate = new Date(Math.max(startYear + 4, endYear), 11, 31);
    }
    
    const adjustedDateRange = eachDayOfInterval({ start: adjMinDate, end: adjMaxDate });
    return { adjustedMinDate: adjMinDate, adjustedMaxDate: adjMaxDate, adjustedDateRange };
  }, [minDate, maxDate, zoomLevel]);

  const { filteredDates, dateFormat, columnWidth } = useMemo(() => {
    switch (zoomLevel) {
      case 'day':
        return {
          filteredDates: adjustedDateRange,
          dateFormat: 'd',
          columnWidth: 'min-w-[40px]'
        };
      case 'week':
        return {
          filteredDates: adjustedDateRange.filter((_, i) => i % 7 === 0),
          dateFormat: 'MMM d',
          columnWidth: 'min-w-[100px]'
        };
      case 'month':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1),
          dateFormat: 'MMM yyyy',
          columnWidth: 'min-w-[100px]'
        };
      case 'quarter':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1 && date.getMonth() % 3 === 0),
          dateFormat: 'QQQ yyyy',
          columnWidth: 'min-w-[80px]'
        };
      case 'year':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1 && date.getMonth() === 0),
          dateFormat: 'yyyy',
          columnWidth: 'min-w-[80px]'
        };
      case '5year':
        return {
          filteredDates: adjustedDateRange.filter((date) => date.getDate() === 1 && date.getMonth() === 0),
          dateFormat: 'yyyy',
          columnWidth: 'min-w-[60px]'
        };
    }
  }, [adjustedDateRange, zoomLevel]);

  const handleZoomIn = () => {
    const idx = zoomLevels.indexOf(zoomLevel);
    if (idx > 0) setZoomLevel(zoomLevels[idx - 1]);
  };

  const handleZoomOut = () => {
    const idx = zoomLevels.indexOf(zoomLevel);
    if (idx < zoomLevels.length - 1) setZoomLevel(zoomLevels[idx + 1]);
  };

  const handleScrollToSelectedTask = () => {
    // Get the first selected task
    const selectedId = selectedTaskIds.size > 0 ? Array.from(selectedTaskIds)[0] : null;
    const selectedTask = selectedId ? tasks.find(t => t.id === selectedId) : null;
    
    if (selectedTask && selectedTask.startDate && selectedTask.endDate) {
      // Calculate optimal zoom level to show the task
      const taskStart = parseISO(selectedTask.startDate);
      const taskEnd = parseISO(selectedTask.endDate);
      const taskDays = differenceInDays(taskEnd, taskStart) + 1;
      
      // Choose zoom level based on task duration
      let optimalZoom: ZoomLevel = 'month';
      if (taskDays <= 7) optimalZoom = 'day';
      else if (taskDays <= 30) optimalZoom = 'week';
      else if (taskDays <= 90) optimalZoom = 'month';
      else if (taskDays <= 365) optimalZoom = 'quarter';
      else optimalZoom = 'year';
      
      setZoomLevel(optimalZoom);
      
      // Scroll to the task row in the Gantt view
      setTimeout(() => {
        const taskElement = document.querySelector(`[data-testid="gantt-task-timeline-${selectedTask.id}"]`);
        if (taskElement) {
          taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      // No task selected or task has no dates - just fit to project timeline
      setZoomLevel(autoZoomLevel);
    }
  };

  const ganttRenderCountRef = useRef(0);
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      ganttRenderCountRef.current += 1;
      if (ganttRenderCountRef.current % 20 === 1) {
        performance.mark('gantt-render-start');
        requestAnimationFrame(() => {
          performance.mark('gantt-render-end');
          performance.measure('gantt-render', 'gantt-render-start', 'gantt-render-end');
        });
      }
    }
  });

  return (
    <Card data-gantt-export="true" className={cn(
      "overflow-hidden transition-all duration-200",
      isFullscreen && "flex-1 flex flex-col"
    )}>
      <CardContent className={cn(
        "p-0 flex flex-col",
        isFullscreen && "h-full flex-1"
      )}>
        <div data-gantt-toolbar="true" className="flex items-center justify-between gap-2 sm:gap-4 p-3 border-b bg-muted/30 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {!hideTimeline && (
              <span className="text-sm font-medium text-muted-foreground">
                View: {zoomLabels[zoomLevel]}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Columns3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Columns</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[400px] overflow-y-auto w-56">
                {COLUMN_CATEGORIES.map(cat => (
                  <div key={cat.id}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                      {cat.label}
                    </div>
                    {GANTT_COLUMNS.filter(col => col.category === cat.id).map(col => (
                      <DropdownMenuItem 
                        key={col.id}
                        onSelect={(e) => { e.preventDefault(); toggleColumn(col.id); }}
                        className="gap-2"
                      >
                        <Checkbox 
                          checked={visibleColumns.includes(col.id)} 
                          disabled={col.id === 'task'}
                        />
                        {col.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={openReorderDialog}
              data-testid="button-reorder-columns"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reorder</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={openBaselineDialog}
              data-testid="button-baseline-schedule"
            >
              <Flag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Baseline Schedule</span>
            </Button>
            <div className="flex items-center border rounded-md">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 rounded-r-none border-r" onClick={expandAllTasks} data-testid="button-expand-all-tasks">
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline text-xs">Expand All</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Expand All Tasks</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 rounded-l-none" onClick={collapseAllTasks} data-testid="button-collapse-all-tasks">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline text-xs">Collapse All</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Collapse All Tasks</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                checked={showProjectSummary}
                onCheckedChange={setShowProjectSummary}
                data-testid="toggle-show-project-summary"
              />
              <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => setShowProjectSummary(!showProjectSummary)}>
                <span className="hidden sm:inline">Project </span>Summary
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={showCriticalPath}
                onCheckedChange={setShowCriticalPath}
                data-testid="toggle-show-critical-path"
              />
              <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => setShowCriticalPath(!showCriticalPath)}>
                Critical<span className="hidden sm:inline"> Path</span>
              </Label>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecalculateSchedule}
                  disabled={isRecalculating}
                  data-testid="button-recalculate-schedule"
                  className="gap-1"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isRecalculating && "animate-spin")} />
                  <span className="hidden sm:inline text-xs">Refresh Schedule</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recalculate all task dates based on dependencies</TooltipContent>
            </Tooltip>
            {!hideTimeline && hasAnyBaselines && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={showBaseline}
                  onCheckedChange={setShowBaseline}
                  data-testid="toggle-show-baseline"
                />
                <Label className="text-xs text-muted-foreground cursor-pointer" onClick={() => setShowBaseline(!showBaseline)}>
                  Show Baseline
                </Label>
              </div>
            )}
            <div className="flex items-center gap-1 border-l pl-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0 || updateTask.isPending || reorderTask.isPending || deleteTask.isPending}
                    data-testid="button-undo"
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-1.5">
                    <span>{undoStack.length > 0 ? `Undo: ${describeAction(undoStack[undoStack.length - 1])}` : 'Nothing to undo'}</span>
                    <kbd className="inline-flex h-5 items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">⌘Z</kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleRedo}
                    disabled={redoStack.length === 0 || updateTask.isPending || reorderTask.isPending || deleteTask.isPending}
                    data-testid="button-redo"
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-1.5">
                    <span>{redoStack.length > 0 ? `Redo: ${describeAction(redoStack[redoStack.length - 1])}` : 'Nothing to redo'}</span>
                    <kbd className="inline-flex h-5 items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">⌘Y</kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            {!hideTimeline && (
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleScrollToSelectedTask}
                      disabled={selectedTaskIds.size === 0}
                      data-testid="button-gantt-scroll-to-task"
                    >
                      <Focus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Scroll to selected task</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleZoomIn}
                      disabled={zoomLevels.indexOf(zoomLevel) === 0}
                      data-testid="button-gantt-zoom-in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom in timeline</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleZoomOut}
                      disabled={zoomLevels.indexOf(zoomLevel) === zoomLevels.length - 1}
                      data-testid="button-gantt-zoom-out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom out timeline</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
        {/* Bulk actions bar - outside scroll area to prevent row misalignment */}
        {selectedTaskIds.size > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 bg-primary/10 border-b flex-wrap flex-shrink-0 text-[11px]">
            <span className="text-sm font-medium">{selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected</span>
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllTasks}
              data-testid="button-select-all-tasks"
            >
              Select All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearTaskSelection}
              data-testid="button-clear-selection"
            >
              Clear
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkBaseline}
              disabled={updateTask.isPending || isReadOnly}
              data-testid="button-bulk-baseline"
            >
              <Flag className="h-4 w-4 mr-2" />
              Baseline
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkIndent}
              disabled={updateTask.isPending || isReadOnly}
              data-testid="button-bulk-indent"
            >
              <IndentIncrease className="h-4 w-4 mr-2" />
              Indent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkOutdent}
              disabled={updateTask.isPending || isReadOnly}
              data-testid="button-bulk-outdent"
            >
              <IndentDecrease className="h-4 w-4 mr-2" />
              Outdent
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedTaskIds.size < 1 || updateTask.isPending || isReadOnly}
                  data-testid="button-bulk-set-progress"
                >
                  <Circle className="h-4 w-4 mr-2" />
                  Set Progress
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {[0, 25, 50, 75, 100].map(val => (
                  <DropdownMenuItem
                    key={val}
                    onClick={() => handleBulkSetProgress(val)}
                    data-testid={`bulk-progress-${val}`}
                  >
                    {val}%
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkLink}
              disabled={selectedTaskIds.size < 2 || addDependency.isPending || isReadOnly}
              data-testid="button-bulk-link"
            >
              <Link2 className="h-4 w-4 mr-2" />
              Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkUnlink}
              disabled={selectedTaskIds.size < 2 || removeDependency.isPending || isReadOnly}
              data-testid="button-bulk-unlink"
            >
              <LinkIcon className="h-4 w-4 mr-2 line-through" />
              Unlink
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkTimesheetBlock}
              disabled={bulkTimesheetBlockPending || isReadOnly}
              data-testid="button-bulk-timesheet-block"
            >
              {bulkTimesheetBlockPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LockIcon className="h-4 w-4 mr-2" />}
              Block Timesheet Entries
            </Button>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeletePending || isReadOnly}
              data-testid="button-bulk-delete"
            >
              {bulkDeletePending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </div>
        )}
        {/* Split-pane Gantt layout with resizable panels */}
        {/* Key changes based on hideTimeline to force complete remount and avoid ResizablePanel index errors */}
        <ResizablePanelGroup 
          key={hideTimeline ? "table-mode" : "gantt-mode"} 
          direction="horizontal" 
          className={cn("text-[11px]", isFullscreen ? "flex-1" : "h-[500px]")}
          onLayout={hideTimeline ? undefined : handlePanelResize}
        >
          {/* Left pane: Metadata columns (horizontal scroll if columns exceed panel width) */}
          <ResizablePanel defaultSize={hideTimeline ? 100 : leftPanelSize} minSize={20} maxSize={hideTimeline ? 100 : 80}>
            <div ref={leftPaneRef} tabIndex={-1} className={cn("h-full overflow-x-auto relative scrollbar-thin outline-none", hideTimeline ? "overflow-y-auto" : "overflow-y-hidden")}>
              <div style={{ minWidth: `${totalColumnsWidth}px` }}>
              {/* Header row - height must match timeline header */}
              <div className="flex border-b bg-muted sticky top-0 z-20 h-[28px]">
                {/* Bulk selection header column */}
                <div className="w-8 flex-shrink-0 border-r p-1 flex items-center justify-center">
                  <Checkbox
                    checked={selectedTaskIds.size === tasks.length && tasks.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        selectAllTasks();
                      } else {
                        clearTaskSelection();
                      }
                    }}
                    data-testid="bulk-select-all"
                  />
                </div>
                {/* Baseline selection header column */}
                {baselineSelectionMode && (
                  <div className="w-8 flex-shrink-0 border-r p-1 flex items-center justify-center">
                    <Checkbox
                      checked={selectedTasksForBaseline.size === validBaselineTasks.length && validBaselineTasks.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTasksForBaseline(new Set(validBaselineTasks.map(t => t.id)));
                        } else {
                          setSelectedTasksForBaseline(new Set());
                        }
                      }}
                      data-testid="baseline-select-all"
                    />
                  </div>
                )}
                <div className="w-8 flex-shrink-0 border-r p-1"></div>
                {visibleColumns.map(colId => {
                  const col = GANTT_COLUMNS.find(c => c.id === colId);
                  if (!col) return null;
                  const colWidth = columnWidths[colId] || col.widthPx;
                  const isDraggable = col.id !== 'task';
                  return (
                    <div 
                      key={col.id}
                      style={{ width: `${colWidth}px` }}
                      className={cn(
                        "flex-shrink-0 border-r font-semibold text-[10px] text-foreground relative select-none flex items-center overflow-hidden",
                        ['progress', 'isMilestone', 'isCritical', 'isSummary'].includes(col.id) && "justify-center",
                        draggingColumn === col.id && "opacity-50",
                        dragOverColumn === col.id && "bg-muted"
                      )}
                      onDragOver={(e) => handleColumnDragOver(e, col.id)}
                      onDragLeave={handleColumnDragLeave}
                      onDrop={(e) => handleColumnDrop(e, col.id)}
                      onContextMenu={(e) => handleColumnContextMenu(e, col.id)}
                      data-testid={`column-header-${col.id}`}
                      data-column-id={col.id}
                    >
                      {/* Drag grip area */}
                      {isDraggable && (
                        <div
                          className="flex-shrink-0 px-0.5 cursor-grab text-muted-foreground"
                          draggable
                          onDragStart={(e) => handleColumnDragStart(e, col.id)}
                          onDragEnd={handleColumnDragEnd}
                        >
                          <GripVertical className="h-3 w-3" />
                        </div>
                      )}
                      <div className="flex-1 p-1 truncate min-w-0">
                        {col.label}
                      </div>
                      {/* Resize handle */}
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20"
                        draggable={false}
                        onMouseDown={(e) => handleResizeStart(e, col.id)}
                        data-testid={`column-resize-${col.id}`}
                      >
                        <div className="absolute inset-y-1 right-0.5 w-0.5 bg-border" />
                      </div>
                    </div>
                  );
                })}
                {/* Add column button - fixed at right edge */}
                <div className="flex-shrink-0 border-l p-1 bg-muted/50">
                  <DropdownMenu open={isAddColumnOpen} onOpenChange={(open) => { setIsAddColumnOpen(open); if (!open) setColumnSearchQuery(''); }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5"
                            data-testid="button-add-column"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Add column</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-56">
                      <div className="p-2">
                        <Input
                          placeholder="Search fields..."
                          value={columnSearchQuery}
                          onChange={(e) => setColumnSearchQuery(e.target.value)}
                          className="h-7 text-xs"
                          data-testid="input-column-search"
                        />
                      </div>
                      <div className="max-h-[300px] overflow-y-auto">
                        {filteredColumnsToAdd.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground text-center">
                            {availableColumnsToAdd.length === 0 ? "All columns added" : "No matching fields"}
                          </div>
                        ) : (
                          filteredColumnsToAdd.map(col => (
                            <DropdownMenuItem 
                              key={col.id}
                              onSelect={(e) => { e.preventDefault(); addColumn(col.id); }}
                              className="text-xs"
                              data-testid={`add-column-${col.id}`}
                            >
                              {col.label}
                              <span className="ml-auto text-muted-foreground text-[10px]">{col.category}</span>
                            </DropdownMenuItem>
                          ))
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {/* Context menu for column removal */}
                {contextMenuPosition && contextMenuColumn && (
                  <div
                    className="fixed z-50 bg-popover border rounded-md shadow-lg py-1"
                    style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
                    data-testid="column-context-menu"
                  >
                    <button
                      className="w-full px-3 py-1.5 text-left text-sm hover-elevate flex items-center gap-2"
                      onClick={() => removeColumn(contextMenuColumn)}
                      data-testid="button-remove-column"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove Column
                    </button>
                  </div>
                )}
                {/* Project Summary Row (when enabled) - conditions must match timeline side */}
                {showProjectSummary && projectSummaryTask && projectSummaryTask.startDate && projectSummaryTask.endDate && (
                  <div 
                    className="flex border-b bg-primary/10 font-semibold h-[28px]"
                    data-testid="project-summary-row"
                  >
                    {/* Bulk selection column placeholder */}
                    <div className="w-8 flex-shrink-0 border-r p-1" />
                    {/* Baseline selection column (conditional) */}
                    {baselineSelectionMode && <div className="w-8 flex-shrink-0 border-r p-1" />}
                    {/* Icon column (same position as drag handle) */}
                    <div className="w-8 flex-shrink-0 border-r p-1 flex items-center justify-center">
                      <FolderKanban className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {visibleColumns.map(colId => {
                      const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
                      if (!colConfig) return null;
                      const colWidth = columnWidths[colId] || colConfig.widthPx;
                      
                      if (colId === 'taskIndex') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center justify-center">
                            <span className="text-[11px] font-mono">0</span>
                          </div>
                        );
                      }
                      if (colId === 'wbs') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px] font-mono">0</span>
                          </div>
                        );
                      }
                      if (colId === 'task') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center overflow-hidden">
                            <span className="truncate text-[11px]">{projectSummaryTask.name}</span>
                          </div>
                        );
                      }
                      if (colId === 'startDate') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.startDate ? format(new Date(projectSummaryTask.startDate), 'MM/dd/yyyy') : '—'}</span>
                          </div>
                        );
                      }
                      if (colId === 'endDate') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.endDate ? format(new Date(projectSummaryTask.endDate), 'MM/dd/yyyy') : '—'}</span>
                          </div>
                        );
                      }
                      if (colId === 'progress') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.progress}%</span>
                          </div>
                        );
                      }
                      if (colId === 'durationDays') {
                        return (
                          <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                            <span className="text-[11px]">{projectSummaryTask.durationDays != null ? formatDuration(projectSummaryTask.durationDays) : '—'}</span>
                          </div>
                        );
                      }
                      return (
                        <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r px-1 flex items-center">
                          <span className="text-[11px] text-muted-foreground">—</span>
                        </div>
                      );
                    })}
                    <div className="flex-shrink-0 p-1 w-8" />
                  </div>
                )}
                
                {/* Task rows - metadata only */}
                {visibleTasks.length === 0 && tasks.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground">
                    No tasks yet. Add your first task below.
                  </div>
                ) : useVirtualScroll ? (
                  /* Virtual scrolling path: only render visible rows (no DnD for large task lists) */
                  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map(vRow => {
                      const task = visibleTasks[vRow.index];
                      const index = vRow.index;
                      return (
                        <div key={task.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)`, height: `${vRow.size}px` }}>
                          <ProjectGanttTaskRowMeta
                            task={task}
                            rowIndex={absoluteIndexMap.get(task.id) ?? (index + 1)}
                            visibleColumns={visibleColumns}
                            organizationId={organizationId}
                            onIndent={handleIndent}
                            onOutdent={handleOutdent}
                            hasChildren={!!taskHasChildren[task.id]}
                            isCollapsed={collapsedTasks.has(task.id)}
                            onToggleCollapse={toggleCollapse}
                            projectName={projectName}
                            onSetBaseline={handleSetBaseline}
                            onClearBaseline={handleClearBaseline}
                            onEditDependencies={handleEditDependencies}
                            onEdit={onTaskClick}
                            columnWidths={columnWidths}
                            showBaseline={showBaseline}
                            baselineSelectionMode={baselineSelectionMode}
                            isSelectedForBaseline={selectedTasksForBaseline.has(task.id)}
                            onToggleBaselineSelection={toggleTaskForBaseline}
                            showCriticalPath={showCriticalPath}
                            isOnCriticalPath={criticalTaskIds.has(task.id)}
                            onTrackChange={pushToUndoStack}
                            prevTaskLevel={index > 0 ? (visibleTasks[index - 1].outlineLevel || 1) : undefined}
                            isSelected={selectedTaskIds.has(task.id)}
                            onToggleSelection={toggleTaskSelection}
                            hasDependencies={tasksWithDependencies.has(task.id)}
                            computedWbs={wbsMap.get(task.id)}
                            isReadOnly={isReadOnly}
                            onCreateTaskAt={handleCreateTaskAt}
                            onDeleteTask={handleDeleteTask}
                            preloadedAssignments={taskAssignmentsMap.get(task.id)}
                            precomputedDates={parsedDatesMap.get(task.id)}
                            focusedCell={focusedCell}
                            selectionRange={selectionRange}
                            isRowInSelectionRange={isRowInSelectionRange(task.id)}
                            onCellClick={handleCellClick}
                            editingCell={editingCell}
                            editingInitialChar={editingInitialChar}
                            onEditingChange={(editing) => { if (!editing) { setEditingCell(null); setEditingInitialChar(undefined); } }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Standard path: all rows rendered with drag-and-drop support */
                  <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleTaskDragEnd}>
                    <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      {visibleTasks.map((task, index) => (
                        <SortableTaskRow key={task.id} task={task}>
                          {(dragHandleProps) => (
                            <ProjectGanttTaskRowMeta
                              task={task}
                              rowIndex={absoluteIndexMap.get(task.id) ?? (index + 1)}
                              visibleColumns={visibleColumns}
                              organizationId={organizationId}
                              onIndent={handleIndent}
                              onOutdent={handleOutdent}
                              hasChildren={!!taskHasChildren[task.id]}
                              isCollapsed={collapsedTasks.has(task.id)}
                              dragHandleProps={dragHandleProps}
                              onToggleCollapse={toggleCollapse}
                              projectName={projectName}
                              onSetBaseline={handleSetBaseline}
                              onClearBaseline={handleClearBaseline}
                              onEditDependencies={handleEditDependencies}
                              onEdit={onTaskClick}
                              columnWidths={columnWidths}
                              showBaseline={showBaseline}
                              baselineSelectionMode={baselineSelectionMode}
                              isSelectedForBaseline={selectedTasksForBaseline.has(task.id)}
                              onToggleBaselineSelection={toggleTaskForBaseline}
                              showCriticalPath={showCriticalPath}
                              isOnCriticalPath={criticalTaskIds.has(task.id)}
                              onTrackChange={pushToUndoStack}
                              prevTaskLevel={index > 0 ? (visibleTasks[index - 1].outlineLevel || 1) : undefined}
                              isSelected={selectedTaskIds.has(task.id)}
                              onToggleSelection={toggleTaskSelection}
                              hasDependencies={tasksWithDependencies.has(task.id)}
                              computedWbs={wbsMap.get(task.id)}
                              isReadOnly={isReadOnly}
                              onCreateTaskAt={handleCreateTaskAt}
                              onDeleteTask={handleDeleteTask}
                              preloadedAssignments={taskAssignmentsMap.get(task.id)}
                              precomputedDates={parsedDatesMap.get(task.id)}
                              focusedCell={focusedCell}
                              selectionRange={selectionRange}
                              isRowInSelectionRange={isRowInSelectionRange(task.id)}
                              onCellClick={handleCellClick}
                              editingCell={editingCell}
                              editingInitialChar={editingInitialChar}
                              onEditingChange={(editing) => { if (!editing) { setEditingCell(null); setEditingInitialChar(undefined); } }}
                            />
                          )}
                        </SortableTaskRow>
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
                {/* Add task row - hidden for read-only projects, height must match timeline side */}
                {!isReadOnly && (
                <div data-add-task-row="true" className="flex border-t bg-muted/20 h-[28px]">
                  <div className="w-8 flex-shrink-0 border-r p-1" />
                  {baselineSelectionMode && <div className="w-8 flex-shrink-0 border-r p-1" />}
                  <div className="w-8 flex-shrink-0 border-r p-1" />
                  {visibleColumns.map(colId => {
                    const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
                    if (!colConfig) return null;
                    const colWidth = columnWidths[colId] || colConfig.widthPx;
                    return colId === 'task' ? (
                      <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r p-1">
                        <Input
                          placeholder="Add task..."
                          value={newTaskName}
                          onChange={(e) => setNewTaskName(e.target.value)}
                          onKeyDown={handleAddTask}
                          className="h-6 text-[11px]"
                          data-testid="input-new-task"
                        />
                      </div>
                    ) : (
                      <div key={colId} style={{ width: `${colWidth}px` }} className="flex-shrink-0 border-r p-1" />
                    );
                  })}
                  {/* Spacer for add column button */}
                  <div className="flex-shrink-0 p-1 w-8" />
                </div>
                )}
              </div>
            </div>
          </ResizablePanel>
          
          {/* Resizable handle with grip - hidden in table view */}
          {!hideTimeline && <ResizableHandle withHandle />}
          
          {/* Right pane: Timeline (resizable + scrollable) - hidden in table view */}
          {!hideTimeline && (
            <ResizablePanel defaultSize={100 - leftPanelSize} minSize={20}>
              <div ref={rightPaneRef} onScroll={handleRightScroll} className="h-full overflow-x-auto overflow-y-auto scrollbar-thin">
                <div 
                  ref={timelineContentRef}
                  className="relative"
                  style={{ minWidth: `${filteredDates.length * 60}px` }}
                >
                  {/* Timeline header - height must match metadata header */}
                  <div className="flex border-b bg-muted sticky top-0 z-20 h-[28px]">
                    {filteredDates.map((date, i) => (
                      <div key={i} className={cn("flex-1 p-1 text-center text-[10px] font-medium text-muted-foreground border-l", columnWidth)}>
                        {format(date, dateFormat)}
                      </div>
                    ))}
                  </div>
                  {/* Project Summary Timeline Row */}
                  {showProjectSummary && projectSummaryTask && projectSummaryTask.startDate && projectSummaryTask.endDate && (
                    <div className="flex h-[28px] border-b bg-primary/10 relative" data-testid="project-summary-timeline">
                      {filteredDates.map((_, i) => (
                        <div key={i} className={cn("flex-1 border-l border-gray-200 dark:border-gray-700", columnWidth)} />
                      ))}
                      {(() => {
                        const startDate = new Date(projectSummaryTask.startDate!);
                        const endDate = new Date(projectSummaryTask.endDate!);
                        const totalDays = differenceInDays(adjustedMaxDate, adjustedMinDate) || 1;
                        const startOffset = differenceInDays(startDate, adjustedMinDate);
                        const duration = differenceInDays(endDate, startDate) + 1;
                        const leftPercent = (startOffset / totalDays) * 100;
                        const widthPercent = (duration / totalDays) * 100;
                        
                        return (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-4 rounded bg-primary/60 border border-primary"
                            style={{
                              left: `${Math.max(0, leftPercent)}%`,
                              width: `${Math.min(100 - leftPercent, widthPercent)}%`,
                            }}
                          />
                        );
                      })()}
                    </div>
                  )}
                  
                  {/* Timeline bars */}
                  {visibleTasks.length === 0 && tasks.length === 0 ? (
                    <div className="h-[28px]" />
                  ) : useVirtualScroll ? (
                    /* Virtual scrolling path: only render visible rows */
                    <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                      {rowVirtualizer.getVirtualItems().map(vRow => {
                        const task = visibleTasks[vRow.index];
                        return (
                          <div key={task.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)`, height: `${vRow.size}px` }}>
                            <ProjectGanttTaskRowTimeline
                              task={task}
                              onTaskClick={onTaskClick}
                              minDate={adjustedMinDate}
                              maxDate={adjustedMaxDate}
                              hasChildren={!!taskHasChildren[task.id]}
                              showBaseline={showBaseline}
                              showCriticalPath={showCriticalPath}
                              isOnCriticalPath={criticalTaskIds.has(task.id)}
                              hasDependencies={tasksWithDependencies.has(task.id)}
                              precomputedDates={parsedDatesMap.get(task.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Standard path: all rows rendered */
                    visibleTasks.map(task => (
                      <ProjectGanttTaskRowTimeline
                        key={task.id}
                        task={task}
                        onTaskClick={onTaskClick}
                        minDate={adjustedMinDate}
                        maxDate={adjustedMaxDate}
                        hasChildren={!!taskHasChildren[task.id]}
                        showBaseline={showBaseline}
                        showCriticalPath={showCriticalPath}
                        isOnCriticalPath={criticalTaskIds.has(task.id)}
                        hasDependencies={tasksWithDependencies.has(task.id)}
                        precomputedDates={parsedDatesMap.get(task.id)}
                      />
                    ))
                  )}
                  {/* Empty row for add task alignment - must match left pane condition */}
                  {!isReadOnly && <div data-add-task-row="true" className="h-[28px] border-t bg-muted/20" />}

                  {/* Dependency links overlay */}
                  {projectDependencies.length > 0 && visibleTasks.length > 0 && timelineContentWidth > 0 && (
                    <GanttDependencyLinks
                      tasks={visibleTasks}
                      dependencies={projectDependencies}
                      minDate={adjustedMinDate}
                      maxDate={adjustedMaxDate}
                      containerWidth={timelineContentWidth}
                      rowHeight={28}
                      headerHeight={28 + (showProjectSummary && projectSummaryTask?.startDate && projectSummaryTask?.endDate ? 28 : 0)}
                      showBaseline={showBaseline}
                      highlightedTaskIds={showCriticalPath ? criticalTaskIds : undefined}
                      onDependencyClick={onDependencyLineClick ? (dep) => {
                        const successorTask = visibleTasks.find(t => t.id === dep.taskId);
                        if (successorTask) {
                          onDependencyLineClick(successorTask);
                        }
                      } : undefined}
                    />
                  )}
                  
                  {/* TODAY vertical indicator line */}
                  {(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const totalDays = differenceInDays(adjustedMaxDate, adjustedMinDate) || 1;
                    const todayOffset = differenceInDays(today, adjustedMinDate);
                    const todayPercent = (todayOffset / totalDays) * 100;
                    
                    // Only show if today is within the visible range
                    if (todayPercent < 0 || todayPercent > 100) return null;
                    
                    return (
                      <div
                        className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-20 pointer-events-none"
                        style={{ left: `${todayPercent}%` }}
                        data-testid="gantt-today-indicator"
                      >
                        <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-b whitespace-nowrap">
                          TODAY
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </ResizablePanel>
          )}
        </ResizablePanelGroup>

        {/* Action bar for baseline selection mode */}
        {baselineSelectionMode && (
          <div className="bg-background border-t p-3 flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <Flag className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedTasksForBaseline.size} task{selectedTasksForBaseline.size !== 1 ? 's' : ''} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedTasksForBaseline(new Set(validBaselineTasks.map(t => t.id)))}
                data-testid="button-select-all-baseline"
              >
                Select All
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedTasksForBaseline(new Set())}
                data-testid="button-clear-baseline-selection"
              >
                Clear
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button 
                variant="outline" 
                onClick={() => {
                  setBaselineSelectionMode(false);
                  setSelectedTasksForBaseline(new Set());
                }}
                data-testid="button-cancel-baseline-selection"
              >
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  setBaselineMode('selected');
                  const success = await handleBaselineSubmit();
                  if (success) {
                    setBaselineSelectionMode(false);
                    setSelectedTasksForBaseline(new Set());
                  }
                }}
                disabled={selectedTasksForBaseline.size === 0 || isBaselinePending}
                data-testid="button-apply-baseline-selection"
              >
                {isBaselinePending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Flag className="h-4 w-4 mr-2" />
                    Apply Baseline
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Dependencies Dialog */}
      <Dialog open={!!dependenciesDialogTask} onOpenChange={(open) => !open && setDependenciesDialogTask(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 truncate" title="Task Dependencies">
              <Link2 className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">Task Dependencies</span>
            </DialogTitle>
            <DialogDescription className="max-w-full" title={dependenciesDialogTask?.name}>
              <span className="block truncate">Manage predecessor tasks for "{dependenciesDialogTask?.name}"</span>
            </DialogDescription>
          </DialogHeader>
          {dependenciesDialogTask && (
            <div className="py-4">
              <TaskDependenciesSection
                taskId={dependenciesDialogTask.id}
                projectId={dependenciesDialogTask.projectId}
                allTasks={tasks}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDependenciesDialogTask(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Reorder Dialog */}
      <Dialog open={isReorderDialogOpen} onOpenChange={setIsReorderDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5" />
              Reorder Columns
            </DialogTitle>
            <DialogDescription>
              Drag columns or use arrows to change the display order
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-y-auto">
            <DndContext collisionDetection={closestCorners} onDragEnd={handleReorderDragEnd}>
              <SortableContext items={reorderColumns} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {reorderColumns.map((colId, idx) => {
                    const colConfig = GANTT_COLUMNS.find(c => c.id === colId);
                    return (
                      <SortableColumnItem 
                        key={colId} 
                        id={colId} 
                        label={colConfig?.label || colId}
                        isFirst={idx === 0}
                        isLast={idx === reorderColumns.length - 1}
                        onMoveUp={() => moveColumnUp(colId)}
                        onMoveDown={() => moveColumnDown(colId)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReorderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyColumnOrder} data-testid="button-apply-column-order">
              Apply Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Baseline Schedule Dialog */}
      <Dialog open={isBaselineDialogOpen} onOpenChange={setIsBaselineDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Baseline Schedule
            </DialogTitle>
            <DialogDescription>
              Capture the current schedule as a baseline for comparison
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Baseline Options</Label>
              <div className="space-y-2">
                <div 
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    baselineMode === 'entire' ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => setBaselineMode('entire')}
                  data-testid="baseline-option-entire"
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                    baselineMode === 'entire' ? "border-primary" : "border-muted-foreground"
                  )}>
                    {baselineMode === 'entire' && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm">Baseline Entire Schedule</div>
                    <div className="text-xs text-muted-foreground">Set baseline for all {tasks.length} tasks in this project</div>
                  </div>
                </div>
                <div 
                  className="flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors border-border hover:bg-muted/50"
                  onClick={() => {
                    // Enter inline selection mode in the grid
                    setSelectedTasksForBaseline(new Set());
                    setBaselineSelectionMode(true);
                    setIsBaselineDialogOpen(false);
                  }}
                  data-testid="baseline-option-selected"
                >
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">Baseline Selected Tasks</div>
                    <div className="text-xs text-muted-foreground">Select tasks directly in the Gantt grid</div>
                  </div>
                </div>
              </div>
            </div>

            {hasAnyBaselines && (
              <div className="pt-2 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-destructive hover:text-destructive"
                  onClick={handleClearAllBaselines}
                  disabled={isBaselinePending}
                  data-testid="button-clear-all-baselines"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear All Baselines
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBaselineDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBaselineSubmit}
              disabled={isBaselinePending || (baselineMode === 'selected' && selectedTasksForBaseline.size === 0)}
              data-testid="button-apply-baseline"
            >
              {isBaselinePending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 mr-2" />
                  Set Baseline
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ProjectGanttView;
