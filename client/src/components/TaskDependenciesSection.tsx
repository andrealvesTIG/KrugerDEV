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
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const predecessorItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (schedulingDefaults && !defaultsApplied) {
      setSelectedType(schedulingDefaults.defaultDependencyType);
      setLagDays(schedulingDefaults.defaultLagDays);
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

  const handleAddDependency = (predecessorId: number) => {
    addDependency.mutate(
      { taskId, dependsOnTaskId: predecessorId, projectId, dependencyType: selectedType, lagDays },
      {
        onSuccess: (data: any) => {
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Predecessors
        </Label>
        <p className="text-xs text-muted-foreground">
          Tasks that must complete (or start) before this task, depending on the link type
        </p>
      </div>

      {dependencies && dependencies.length > 0 ? (
        <div className="space-y-2">
          {dependencies.map((dep) => {
            const predecessorTask = allTasks.find(t => t.id === dep.dependsOnTaskId);
            return (
              <div
                key={dep.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50 border gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">
                    {predecessorTask?.name || `Task #${dep.dependsOnTaskId}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Select
                    value={dep.dependencyType || "finish-to-start"}
                    onValueChange={(val) => handleUpdateDependencyType(dep.dependsOnTaskId, val)}
                  >
                    <SelectTrigger className="h-7 w-[160px] text-xs px-2">
                      <SelectValue />
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
                  <Input
                    type="number"
                    className="h-7 w-[52px] text-xs text-center px-1"
                    title="Lag days"
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
                  <span className="text-xs text-muted-foreground">d</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleRemoveDependency(dep.dependsOnTaskId)}
                    disabled={removeDependency.isPending}
                    data-testid={`remove-dependency-${dep.dependsOnTaskId}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-4 border rounded-md bg-muted/30">
          No predecessors defined
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
              data-testid="dependency-search-input"
            />
          </div>
          <Select value={selectedType} onValueChange={setSelectedType} disabled={orgDefaults.enforceDefaults}>
            <SelectTrigger className="w-[160px] h-9 text-xs" title={orgDefaults.enforceDefaults ? "Locked by organization settings" : undefined}>
              <SelectValue />
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
          <Input
            type="number"
            className="w-[52px] h-9 text-xs text-center px-1"
            title={orgDefaults.enforceDefaults ? "Locked by organization settings" : "Lag days for new dependency"}
            placeholder="Lag"
            value={lagDays}
            onChange={(e) => setLagDays(parseInt(e.target.value) || 0)}
            disabled={orgDefaults.enforceDefaults}
          />
          <span className="text-xs text-muted-foreground">d</span>
        </div>
        <div
          ref={listRef}
          className="max-h-[200px] overflow-y-auto border rounded-md"
        >
          {filteredPredecessors.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">
              {searchQuery ? "No matching tasks found" : "No available predecessor tasks"}
            </div>
          ) : (
            filteredPredecessors.map(task => {
              const isImmediatePredecessor = task.id === immediatePredecessorId;
              const taskIndex = allTasks.findIndex(t => t.id === task.id);
              return (
                <div
                  key={task.id}
                  ref={isImmediatePredecessor ? predecessorItemRef : undefined}
                  className={cn(
                    "flex items-center justify-between p-2 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors",
                    isImmediatePredecessor && "bg-primary/5"
                  )}
                  onClick={() => handleAddDependency(task.id)}
                  data-testid={`predecessor-option-${task.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground flex-shrink-0 w-8">
                      #{taskIndex + 1}
                    </span>
                    <span className="text-sm truncate">{task.name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    disabled={addDependency.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddDependency(task.id);
                    }}
                  >
                    {addDependency.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
