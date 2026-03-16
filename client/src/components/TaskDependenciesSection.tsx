import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTaskDependencies, useAddTaskDependency, useRemoveTaskDependency, useUpdateTaskDependency } from "@/hooks/use-tasks";
import { useOrganization } from "@/hooks/use-organization";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Link2, ArrowRight, X, Plus, Search } from "lucide-react";
import { cn, normalizeSearch } from "@/lib/utils";
import type { Task, SchedulingDefaults } from "@shared/schema";

const DEPENDENCY_TYPES = [
  { value: "finish-to-start", label: "FS", description: "Finish-to-Start" },
  { value: "start-to-start", label: "SS", description: "Start-to-Start" },
  { value: "finish-to-finish", label: "FF", description: "Finish-to-Finish" },
  { value: "start-to-finish", label: "SF", description: "Start-to-Finish" },
] as const;

function getDependencyDescription(type: string | null | undefined): string {
  const found = DEPENDENCY_TYPES.find(t => t.value === type);
  return found ? found.description : "Finish-to-Start";
}

export function TaskDependenciesSection({
  taskId,
  projectId,
  allTasks,
}: {
  taskId: number;
  projectId: number;
  allTasks: Task[];
}) {
  const { data: dependencies, isLoading } = useTaskDependencies(taskId);
  const addDependency = useAddTaskDependency();
  const removeDependency = useRemoveTaskDependency();
  const updateDependency = useUpdateTaskDependency();
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const { data: schedulingDefaults } = useQuery<SchedulingDefaults>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'scheduling-defaults'],
    enabled: !!currentOrganization?.id,
  });

  const orgDefaults = schedulingDefaults || { defaultDependencyType: 'finish-to-start' as const, defaultLagDays: 0, enforceDefaults: false };

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>(orgDefaults.defaultDependencyType);
  const [lagDays, setLagDays] = useState<number>(orgDefaults.defaultLagDays);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [rowType, setRowType] = useState<string>(orgDefaults.defaultDependencyType);
  const [rowLag, setRowLag] = useState<number>(orgDefaults.defaultLagDays);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const predecessorItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (schedulingDefaults && !defaultsApplied) {
      setSelectedType(schedulingDefaults.defaultDependencyType);
      setLagDays(schedulingDefaults.defaultLagDays);
      setRowType(schedulingDefaults.defaultDependencyType);
      setRowLag(schedulingDefaults.defaultLagDays);
      setDefaultsApplied(true);
    }
  }, [schedulingDefaults, defaultsApplied]);

  const currentTaskIndex = allTasks.findIndex(t => t.id === taskId);

  const availablePredecessors = allTasks.filter((task, index) => {
    if (task.id === taskId) return false;
    if (dependencies?.some(d => d.dependsOnTaskId === task.id)) return false;
    const taskLevel = task.outlineLevel || 1;
    const hasChildren = index < allTasks.length - 1 && ((allTasks[index + 1].outlineLevel || 1) > taskLevel);
    if (hasChildren) return false;
    return true;
  });

  const filteredPredecessors = availablePredecessors.filter(task => {
    if (!searchQuery.trim()) return true;
    const query = normalizeSearch(searchQuery);
    const nameMatch = normalizeSearch(task.name).includes(query);
    const idMatch = String(task.id).includes(query);
    const taskIndexMatch = task.taskIndex ? String(task.taskIndex).includes(query) : false;
    return nameMatch || idMatch || taskIndexMatch;
  });

  const immediatePredecessorId = currentTaskIndex > 0
    ? allTasks[currentTaskIndex - 1]?.id
    : null;

  useEffect(() => {
    if (predecessorItemRef.current && listRef.current && !searchQuery) {
      setTimeout(() => {
        predecessorItemRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
      }, 100);
    }
  }, [searchQuery]);

  const handleAddDependency = (predecessorId: number, type?: string, lag?: number) => {
    const depType = type || selectedType;
    const depLag = lag !== undefined ? lag : lagDays;
    addDependency.mutate(
      { taskId, dependsOnTaskId: predecessorId, projectId, dependencyType: depType, lagDays: depLag },
      {
        onSuccess: (data: any) => {
          setExpandedTaskId(null);
          if (data?.dateAdjusted) {
            toast({
              title: "Dependency added",
              description: `Task dates automatically adjusted (${data.newStartDate} - ${data.newEndDate})`,
            });
          } else {
            toast({ title: "Success", description: "Dependency added" });
          }
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to add dependency",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleRemoveDependency = (predecessorId: number) => {
    removeDependency.mutate(
      { taskId, dependsOnTaskId: predecessorId },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Dependency removed" });
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to remove dependency",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleUpdateDependencyType = (predecessorId: number, newType: string) => {
    updateDependency.mutate(
      { taskId, dependsOnTaskId: predecessorId, dependencyType: newType, projectId },
      {
        onSuccess: () => {
          toast({ title: "Updated", description: `Dependency type changed to ${getDependencyDescription(newType)}` });
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to update dependency",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleUpdateLag = (predecessorId: number, newLag: number) => {
    updateDependency.mutate(
      { taskId, dependsOnTaskId: predecessorId, lagDays: newLag, projectId },
      {
        onSuccess: () => {
          toast({ title: "Updated", description: `Lag updated to ${newLag} day${newLag !== 1 ? 's' : ''}` });
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to update lag",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const depCount = dependencies?.length || 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4" />
            Predecessors
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Tasks that must complete (or start) before this task
        </p>
      </div>

      {dependencies && dependencies.length > 0 ? (
        <div className="border rounded-lg overflow-hidden divide-y">
          {dependencies.map((dep) => {
            const predecessorTask = allTasks.find(t => t.id === dep.dependsOnTaskId);
            const depTypeLabel = DEPENDENCY_TYPES.find(t => t.value === (dep.dependencyType || "finish-to-start"));
            return (
              <div
                key={dep.id}
                className="bg-background hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <ArrowRight className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {predecessorTask?.name || `Task #${dep.dependsOnTaskId}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Select
                      value={dep.dependencyType || "finish-to-start"}
                      onValueChange={(val) => handleUpdateDependencyType(dep.dependsOnTaskId, val)}
                    >
                      <SelectTrigger
                        id={`dep-type-${dep.id}`}
                        className="h-7 w-auto min-w-[70px] text-xs px-2 gap-1 border-dashed"
                        aria-label="Dependency type"
                      >
                        <span className="font-semibold">{depTypeLabel?.label || "FS"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {DEPENDENCY_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>
                            <span className="font-medium">{t.label}</span>
                            <span className="text-muted-foreground ml-1">({t.description})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-1 border border-dashed rounded-md px-1.5 h-7">
                      <span className="text-[10px] text-muted-foreground">lag</span>
                      <Input
                        id={`dep-lag-${dep.id}`}
                        type="number"
                        className="h-5 w-[36px] text-xs text-center px-0 border-0 shadow-none focus-visible:ring-0 bg-transparent"
                        title="Lag/lead days (negative = lead)"
                        key={`lag-${dep.id}-${dep.lagDays}`}
                        defaultValue={dep.lagDays || 0}
                        onBlur={(e) => {
                          const newLag = parseInt(e.target.value) || 0;
                          if (newLag !== (dep.lagDays || 0)) {
                            handleUpdateLag(dep.dependsOnTaskId, newLag);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveDependency(dep.dependsOnTaskId)}
                      disabled={removeDependency.isPending}
                      aria-label={`Remove dependency on ${predecessorTask?.name || `Task #${dep.dependsOnTaskId}`}`}
                      data-testid={`remove-dependency-${dep.dependsOnTaskId}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg bg-muted/20">
          <Link2 className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/50" />
          No predecessors defined
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs font-medium text-foreground">Add Predecessor</Label>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tasks by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="dependency-search-input"
          />
        </div>

        <div
          ref={listRef}
          className="max-h-[200px] overflow-y-auto border rounded-lg"
        >
          {filteredPredecessors.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {searchQuery ? "No matching tasks found" : "No available predecessor tasks"}
            </div>
          ) : (
            filteredPredecessors.map(task => {
              const isImmediatePredecessor = task.id === immediatePredecessorId;
              const taskIndex = allTasks.findIndex(t => t.id === task.id);
              const isExpanded = expandedTaskId === task.id;
              return (
                <div
                  key={task.id}
                  ref={isImmediatePredecessor ? predecessorItemRef : undefined}
                  className={cn(
                    "border-b last:border-b-0 transition-colors",
                    isImmediatePredecessor && !isExpanded && "bg-primary/5",
                    isExpanded && "bg-muted/50"
                  )}
                  data-testid={`predecessor-option-${task.id}`}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-primary/5 group"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedTaskId(null);
                      } else {
                        setExpandedTaskId(task.id);
                        setRowType(orgDefaults.enforceDefaults ? orgDefaults.defaultDependencyType : selectedType);
                        setRowLag(orgDefaults.enforceDefaults ? orgDefaults.defaultLagDays : lagDays);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-mono flex-shrink-0">
                        {taskIndex + 1}
                      </Badge>
                      <span className="text-sm truncate">{task.name}</span>
                    </div>
                    <Plus className={cn(
                      "h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform",
                      isExpanded && "rotate-45"
                    )} />
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-2.5 pt-1">
                      <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2">
                          <Select
                            value={rowType}
                            onValueChange={setRowType}
                            disabled={orgDefaults.enforceDefaults}
                          >
                            <SelectTrigger
                              className="h-7 w-auto min-w-[70px] text-xs px-2 gap-1"
                              aria-label="Dependency type"
                            >
                              <span className="font-semibold">
                                {DEPENDENCY_TYPES.find(t => t.value === rowType)?.label || "FS"}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {DEPENDENCY_TYPES.map(t => (
                                <SelectItem key={t.value} value={t.value}>
                                  <span className="font-medium">{t.label}</span>
                                  <span className="text-muted-foreground ml-1">({t.description})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <div className="flex items-center gap-1 border rounded-md px-1.5 h-7">
                            <span className="text-[10px] text-muted-foreground">lag</span>
                            <Input
                              type="number"
                              className="h-5 w-[36px] text-xs text-center px-0 border-0 shadow-none focus-visible:ring-0 bg-transparent"
                              title="Lag/lead days (negative = lead)"
                              value={rowLag}
                              onChange={(e) => setRowLag(parseInt(e.target.value) || 0)}
                              disabled={orgDefaults.enforceDefaults}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs px-3"
                          disabled={addDependency.isPending}
                          aria-label={`Add ${task.name} as predecessor`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddDependency(task.id, rowType, rowLag);
                          }}
                        >
                          {addDependency.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
