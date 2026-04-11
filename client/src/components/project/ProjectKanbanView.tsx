import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Check, History, Milestone as MilestoneIcon } from "lucide-react";
import { DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent, closestCorners, pointerWithin, rectIntersection, useSensor, useSensors, PointerSensor, useDroppable, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useAllTaskResourceAssignments } from "@/hooks/use-resources";
import { useTaskHistory } from "@/hooks/use-tasks";
import type { Task } from "@shared/schema";

type GroupByField = 'status' | 'priority' | 'assignee' | 'phase';

const GROUP_BY_OPTIONS: { value: GroupByField; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'phase', label: 'Phase' },
];

const STATUS_COLUMNS = [
  { id: "Not Started", label: "Not Started", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { id: "In Progress", label: "In Progress", color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
  { id: "Completed", label: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200" },
];

const PRIORITY_COLUMNS = [
  { id: "Low", label: "Low", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { id: "Medium", label: "Medium", color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" },
  { id: "High", label: "High", color: "bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200" },
  { id: "Critical", label: "Critical", color: "bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200" },
];

function ProjectKanbanView({ 
  tasks, 
  onTaskClick, 
  onStatusChange,
  isFullscreen,
  organizationId,
  projectId,
  resources,
  onResourceAssign,
  isReadOnly = false,
}: { 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: number, newStatus: string) => void;
  isFullscreen?: boolean;
  organizationId: number | null;
  projectId: number;
  resources?: Array<{ id: number; displayName: string; resourceCode?: string | null }>;
  onResourceAssign?: (taskId: number, resourceIds: number[]) => void;
  isReadOnly?: boolean;
}) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeOverColumn, setActiveOverColumn] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [filterResourceId, setFilterResourceId] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<GroupByField>('status');
  
  const { data: allTaskAssignments } = useAllTaskResourceAssignments(organizationId);
  
  const projectTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  
  const taskAssignmentsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    if (allTaskAssignments) {
      for (const assignment of allTaskAssignments) {
        if (!projectTaskIds.has(assignment.taskId)) continue;
        if (!map.has(assignment.taskId)) {
          map.set(assignment.taskId, []);
        }
        map.get(assignment.taskId)!.push(assignment.resourceId);
      }
    }
    return map;
  }, [allTaskAssignments, projectTaskIds]);
  
  const summaryTaskIds = useMemo(() => {
    const parentIds = new Set<number>();
    for (const task of tasks) {
      if (task.parentId) {
        parentIds.add(task.parentId);
      }
    }
    return parentIds;
  }, [tasks]);
  
  const columns = useMemo(() => {
    if (groupBy === 'status') {
      return STATUS_COLUMNS;
    } else if (groupBy === 'priority') {
      return PRIORITY_COLUMNS;
    } else if (groupBy === 'assignee') {
      const cols: { id: string; label: string; color: string }[] = [
        { id: "Unassigned", label: "Unassigned", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" }
      ];
      if (resources && resources.length > 0) {
        resources.forEach(r => {
          cols.push({ id: String(r.id), label: r.displayName, color: "bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" });
        });
      }
      return cols;
    } else if (groupBy === 'phase') {
      const phaseSet = new Set<string>();
      tasks.forEach(t => {
        if (t.phase) phaseSet.add(t.phase);
      });
      const cols = [{ id: "No Phase", label: "No Phase", color: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" }];
      Array.from(phaseSet).sort().forEach(phase => {
        cols.push({ id: phase, label: phase, color: "bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200" });
      });
      return cols;
    }
    return STATUS_COLUMNS;
  }, [groupBy, tasks, resources]);
  
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (!showSummary) {
      result = result.filter(t => !summaryTaskIds.has(t.id));
    }
    if (filterResourceId !== null) {
      result = result.filter(t => {
        const assignedIds = taskAssignmentsMap.get(t.id);
        return assignedIds && assignedIds.includes(filterResourceId);
      });
    }
    return result;
  }, [tasks, showSummary, summaryTaskIds, filterResourceId, taskAssignmentsMap]);
  
  const getGroupValue = (task: Task): string => {
    if (groupBy === 'status') {
      return task.status || "Not Started";
    } else if (groupBy === 'priority') {
      return task.priority || "Medium";
    } else if (groupBy === 'assignee') {
      const assignedIds = taskAssignmentsMap.get(task.id);
      if (assignedIds && assignedIds.length > 0) {
        return String(assignedIds[0]);
      }
      return "Unassigned";
    } else if (groupBy === 'phase') {
      return task.phase || "No Phase";
    }
    return task.status || "Not Started";
  };
  
  const isDragEnabled = groupBy === 'status' || groupBy === 'assignee';
  
  const canDrag = isDragEnabled && !isReadOnly;
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: canDrag ? 8 : 999999,
      },
    })
  );

  const kanbanCollisionDetection: CollisionDetection = useMemo(() => {
    const columnIds = new Set(columns.map(c => c.id));
    return (args) => {
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) {
        const columnHit = pointerCollisions.find(c => columnIds.has(String(c.id)));
        if (columnHit) return [columnHit];
        const taskHit = pointerCollisions.find(c => c.data?.droppableContainer?.data?.current?.type === 'task');
        if (taskHit) return [taskHit];
        return pointerCollisions;
      }
      const rectCollisions = rectIntersection(args);
      if (rectCollisions.length > 0) {
        const columnHit = rectCollisions.find(c => columnIds.has(String(c.id)));
        if (columnHit) return [columnHit];
        return rectCollisions;
      }
      return closestCorners(args);
    };
  }, [columns]);

  const handleDragStart = (event: DragStartEvent) => {
    if (!canDrag) return;
    const taskId = Number(event.active.id);
    const task = tasks.find(t => t.id === taskId);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setActiveOverColumn(null);
      return;
    }
    
    const overData = over.data.current;
    if (overData?.type === 'column') {
      setActiveOverColumn(overData.columnId);
    } else if (overData?.type === 'task') {
      setActiveOverColumn(overData.columnId);
    } else if (columns.some(c => c.id === String(over.id))) {
      setActiveOverColumn(String(over.id));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    setActiveOverColumn(null);
    if (isReadOnly) return;
    const { active, over } = event;
    if (!over) return;
    
    const taskId = Number(active.id);
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let targetColumnId: string | null = null;
    
    const overData = over.data.current;
    if (overData?.type === 'column') {
      targetColumnId = overData.columnId;
    } else if (overData?.type === 'task') {
      targetColumnId = overData.columnId;
    } else if (columns.some(c => c.id === String(over.id))) {
      targetColumnId = String(over.id);
    }
    
    if (targetColumnId) {
      if (groupBy === 'status') {
        const currentValue = task.status || "Not Started";
        if (currentValue !== targetColumnId) {
          onStatusChange(taskId, targetColumnId);
        }
      } else if (groupBy === 'assignee' && onResourceAssign) {
        const currentAssignedIds = taskAssignmentsMap.get(taskId) || [];
        const currentColumnId = currentAssignedIds.length > 0 ? String(currentAssignedIds[0]) : "Unassigned";
        if (currentColumnId !== targetColumnId) {
          if (targetColumnId === "Unassigned") {
            onResourceAssign(taskId, []);
          } else {
            const targetResourceId = Number(targetColumnId);
            const otherAssignments = currentAssignedIds.filter(id => id !== (currentAssignedIds[0] || -1));
            onResourceAssign(taskId, [targetResourceId, ...otherAssignments]);
          }
        }
      }
    }
  };
  
  const handleDragCancel = () => {
    setActiveTask(null);
    setActiveOverColumn(null);
  };

  return (
    <Card className="overflow-hidden transition-all duration-200">
      <CardContent className={cn(
        "p-0 flex flex-col",
        isFullscreen && "h-full"
      )}>
        <div className="flex items-center gap-3 p-3 border-b bg-muted/30 flex-wrap">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-summary"
              checked={showSummary}
              onCheckedChange={(checked) => setShowSummary(!!checked)}
              data-testid="kanban-show-summary"
            />
            <label htmlFor="show-summary" className="text-sm cursor-pointer select-none">
              Show Summary
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group by:</span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByField)}>
              <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="kanban-group-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {resources && resources.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Resource:</span>
              <Select 
                value={filterResourceId?.toString() || "all"} 
                onValueChange={(v) => setFilterResourceId(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="kanban-filter-resource">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Resources</SelectItem>
                  {resources.map(r => (
                    <SelectItem key={r.id} value={r.id.toString()}>{r.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={cn("p-4", isFullscreen && "flex-1 overflow-auto")}>
          {!canDrag && (
            <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded mb-3 inline-block">
              {isReadOnly ? 'Project is read-only' : 'Drag and drop is available when grouping by Status or Assignee'}
            </div>
          )}
          <DndContext 
            sensors={sensors} 
            collisionDetection={kanbanCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div 
              className={cn("grid gap-6 overflow-x-auto pb-2", isFullscreen && "h-full")}
              style={{ 
                gridTemplateColumns: `repeat(${columns.length}, minmax(280px, 1fr))` 
              }}
            >
              {columns.map(column => (
                <ProjectKanbanColumn
                  key={column.id}
                  column={column}
                  tasks={filteredTasks.filter(t => getGroupValue(t) === column.id)}
                  onTaskClick={onTaskClick}
                  isActiveOver={activeOverColumn === column.id && canDrag}
                  resources={resources}
                  onResourceAssign={onResourceAssign}
                  isDragEnabled={canDrag}
                  taskAssignmentsMap={taskAssignmentsMap}
                  isReadOnly={isReadOnly}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask && canDrag && (
                <div className="opacity-80">
                  <Card className="shadow-lg border-primary">
                    <CardContent className="p-4">
                      <div className="font-medium text-sm">{activeTask.name}</div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectKanbanColumn({ 
  column, 
  tasks, 
  onTaskClick,
  isActiveOver,
  resources,
  onResourceAssign,
  isDragEnabled,
  taskAssignmentsMap,
  isReadOnly,
}: { 
  column: { id: string; label: string; color: string }; 
  tasks: Task[]; 
  onTaskClick: (task: Task) => void;
  isActiveOver: boolean;
  resources?: Array<{ id: number; displayName: string; resourceCode?: string | null }>;
  onResourceAssign?: (taskId: number, resourceIds: number[]) => void;
  isDragEnabled?: boolean;
  taskAssignmentsMap?: Map<number, number[]>;
  isReadOnly?: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: 'column',
      columnId: column.id,
    },
    disabled: !isDragEnabled,
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "space-y-4 min-h-[200px] rounded-lg transition-colors p-2",
        isActiveOver && "bg-primary/10 ring-2 ring-primary ring-dashed"
      )}
    >
      <div className={cn("rounded-lg p-3 font-semibold", column.color)}>
        {column.label} ({tasks.length})
      </div>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {tasks.map(task => (
            <ProjectDraggableTaskCard
              key={task.id}
              task={task}
              onTaskClick={onTaskClick}
              columnId={column.id}
              resources={resources}
              onResourceAssign={onResourceAssign}
              isDragEnabled={isDragEnabled}
              assignedResourceIds={taskAssignmentsMap?.get(task.id) || []}
              isReadOnly={isReadOnly}
            />
          ))}
          {tasks.length === 0 && isDragEnabled && (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              Drop tasks here
            </div>
          )}
          {tasks.length === 0 && !isDragEnabled && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No tasks
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function ProjectDraggableTaskCard({ 
  task, 
  onTaskClick,
  columnId,
  resources,
  onResourceAssign,
  isDragEnabled,
  assignedResourceIds,
  isReadOnly,
}: { 
  task: Task; 
  onTaskClick: (task: Task) => void;
  columnId: string;
  resources?: Array<{ id: number; displayName: string; resourceCode?: string | null }>;
  onResourceAssign?: (taskId: number, resourceIds: number[]) => void;
  isDragEnabled?: boolean;
  assignedResourceIds: number[];
  isReadOnly?: boolean;
}) {
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'task',
      task,
      columnId,
    },
    disabled: !isDragEnabled,
  });

  const style: React.CSSProperties = isDragEnabled ? {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  } : {};

  const assignedResources = useMemo(() => {
    if (!resources) return [];
    return resources.filter(r => assignedResourceIds.includes(r.id));
  }, [resources, assignedResourceIds]);

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onTaskClick(task);
  };
  
  const handleQuickAssign = (resourceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onResourceAssign) {
      const newIds = assignedResourceIds.includes(resourceId)
        ? assignedResourceIds.filter(id => id !== resourceId)
        : [...assignedResourceIds, resourceId];
      onResourceAssign(task.id, newIds);
    }
    setIsAssignOpen(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isDragEnabled ? { ...attributes, ...listeners } : {})}
      className={cn(
        isDragEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        isDragging && "opacity-50"
      )}
    >
      <Card 
        className="hover:shadow-md transition-shadow"
        onClick={handleClick}
        data-testid={`kanban-task-${task.id}`}
      >
        <CardContent className="p-4">
          <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
            {task.isMilestone && <MilestoneIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
            <span className="truncate" title={task.name}>{task.name}</span>
          </div>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {assignedResources.length > 0 ? (
              assignedResources.map(r => (
                <Badge key={r.id} variant="secondary" className="text-[10px] py-0 max-w-[100px] truncate" title={r.displayName}>
                  {r.displayName}
                </Badge>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground">No resources</span>
            )}
            {resources && resources.length > 0 && onResourceAssign && !isReadOnly && (
              <DropdownMenu open={isAssignOpen} onOpenChange={setIsAssignOpen}>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 ml-1"
                    data-testid={`kanban-assign-${task.id}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>
                  {resources.map(r => (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={(e) => handleQuickAssign(r.id, e)}
                      className="text-xs"
                    >
                      <Check className={cn("h-3 w-3 mr-2", assignedResourceIds.includes(r.id) ? "opacity-100" : "opacity-0")} />
                      {r.displayName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <Badge variant="outline" className="text-xs">
              {task.progress || 0}%
            </Badge>
            {task.endDate && (
              <span className="text-xs text-muted-foreground">
                Due: {format(parseISO(task.endDate), 'MMM d')}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProjectTaskHistoryDialog({ taskId, open, onOpenChange }: { taskId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useTaskHistory(taskId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Task Change History
          </DialogTitle>
          <DialogDescription>
            View all changes made to this task over time.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No changes recorded yet
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {history.map((log) => (
                  <div 
                    key={log.id} 
                    className="border-l-2 border-muted-foreground/30 pl-4 pb-4"
                    data-testid={`history-entry-${log.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-xs capitalize">{log.changeType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {log.changedAt ? format(new Date(log.changedAt), 'MMM d, yyyy h:mm a') : ''}
                      </span>
                    </div>
                    {log.changeSummary && (
                      <div className="text-sm mt-1">{log.changeSummary}</div>
                    )}
                    {log.previousValues && log.newValues && (
                      <div className="text-sm mt-1">
                        <span className="text-muted-foreground line-through">{log.previousValues}</span>
                        {' → '}
                        <span className="text-foreground">{log.newValues}</span>
                      </div>
                    )}
                    {log.changedByName && (
                      <div className="text-xs text-muted-foreground mt-1">by {log.changedByName}</div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ProjectKanbanView;
