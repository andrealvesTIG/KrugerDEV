import React, { useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { useProjects } from "@/hooks/use-projects";
import {
  useCrossProjectReferences,
  useTasksForReference,
  useCreateCrossProjectReference,
  useDeleteCrossProjectReference,
} from "@/hooks/use-cross-project-references";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, X, ExternalLink, ArrowRight, Check, ChevronsUpDown } from "lucide-react";
import { cn, normalizeSearch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const TASK_RELATIONSHIP_TYPES = [
  { value: "blocks", label: "Blocks" },
  { value: "is_blocked_by", label: "Is Blocked By" },
  { value: "relates_to", label: "Relates To" },
  { value: "duplicates", label: "Duplicates" },
] as const;

const PROJECT_RELATIONSHIP_TYPES = [
  { value: "depends_on", label: "Depends On" },
  { value: "is_dependency_of", label: "Is Dependency Of" },
  { value: "relates_to", label: "Relates To" },
] as const;

const ALL_RELATIONSHIP_LABELS: Record<string, string> = {
  blocks: "Blocks",
  is_blocked_by: "Is Blocked By",
  depends_on: "Depends On",
  is_dependency_of: "Is Dependency Of",
  relates_to: "Relates To",
  duplicates: "Duplicates",
};

function getRelationshipLabel(type: string): string {
  return ALL_RELATIONSHIP_LABELS[type] ?? type;
}

function getRelationshipColor(type: string): string {
  switch (type) {
    case "blocks": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "is_blocked_by": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "depends_on": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "is_dependency_of": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "relates_to": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    case "duplicates": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    default: return "bg-gray-100 text-gray-800";
  }
}

interface CrossProjectReferencesProps {
  entityType: "task" | "project";
  entityId: number;
  entityProjectId: number;
  organizationId: number;
}

export function CrossProjectReferences({
  entityType,
  entityId,
  entityProjectId,
  organizationId,
}: CrossProjectReferencesProps) {
  const { toast } = useToast();
  const { data: refs, isLoading } = useCrossProjectReferences(entityType, entityId);
  const { data: orgProjects } = useProjects(organizationId);
  const createRef = useCreateCrossProjectReference();
  const deleteRef = useDeleteCrossProjectReference();

  const [isAdding, setIsAdding] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const selectedTargetType = entityType;
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>();
  const [relationshipType, setRelationshipType] = useState<string>("relates_to");
  const [taskSearch, setTaskSearch] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const otherProjects = orgProjects?.filter(p => p.id !== entityProjectId) ?? [];
  const { data: targetTasks } = useTasksForReference(selectedTargetType === "task" ? selectedProjectId : undefined);

  const filteredTasks = targetTasks?.filter(t => {
    if (!taskSearch) return true;
    return normalizeSearch(t.name).includes(normalizeSearch(taskSearch));
  }) ?? [];

  const displayRefs = refs?.filter(r => {
    if (entityType === "task") {
      return (r.sourceType === "task" && r.sourceId === entityId) ||
             (r.targetType === "task" && r.targetId === entityId);
    }
    return true;
  }) ?? [];

  const handleAdd = async () => {
    if (!selectedProjectId || !relationshipType) return;

    const resolvedTargetId = entityType === "task" ? selectedTaskId : selectedProjectId;
    if (!resolvedTargetId) return;

    try {
      const refType = entityType === "task" ? "task_to_task" : "project_to_project";

      await createRef.mutateAsync({
        organizationId,
        referenceType: refType,
        sourceType: entityType,
        sourceId: entityId,
        sourceProjectId: entityProjectId,
        targetType: entityType,
        targetId: resolvedTargetId,
        targetProjectId: selectedProjectId!,
        relationshipType,
      });

      setIsAdding(false);
      setSelectedProjectId(undefined);
      setSelectedTaskId(undefined);
      setRelationshipType("relates_to");
      setTaskSearch("");
      toast({ title: "Cross-project reference added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRef.mutateAsync(id);
      toast({ title: "Reference removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">Loading references...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{entityType === "project" ? "Related Projects" : "Cross-Project References"}</Label>
        {!isAdding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Reference
          </Button>
        )}
      </div>

      {displayRefs.length === 0 && !isAdding && (
        <div className="text-sm text-muted-foreground text-center py-3 border rounded-md border-dashed">
          {entityType === "project" ? "No related projects yet" : "No cross-project references yet"}
        </div>
      )}

      {displayRefs.length > 0 && (
        <div className="space-y-2">
          {displayRefs.map((ref) => {
            const isSource = ref.sourceType === entityType && ref.sourceId === entityId;
            const otherName = isSource ? ref.targetName : ref.sourceName;
            const otherProjectName = isSource ? ref.targetProjectName : ref.sourceProjectName;
            const displayRelationship = isSource ? ref.relationshipType : getInverseLabel(ref.relationshipType);

            return (
              <div
                key={ref.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md border bg-muted/30 group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge variant="outline" className={cn("shrink-0 text-xs", getRelationshipColor(displayRelationship))}>
                    {getRelationshipLabel(displayRelationship)}
                  </Badge>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium truncate block">{otherName || "Unknown"}</span>
                    {otherProjectName && (
                      <span className="text-xs text-muted-foreground truncate block">
                        in {otherProjectName}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => handleDelete(ref.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {isAdding && (
        <div className="space-y-3 p-3 border rounded-md bg-muted/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Relationship</Label>
              <Select value={relationshipType} onValueChange={setRelationshipType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(entityType === "task" ? TASK_RELATIONSHIP_TYPES : PROJECT_RELATIONSHIP_TYPES).map(r => (
                    <SelectItem key={r.value} value={r.value} className="text-xs">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          
          </div>

          <div>
            <Label className="text-xs">{entityType === "project" ? "Related Project" : "Target Project"}</Label>
            <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={projectPickerOpen}
                  className="h-8 w-full justify-between text-xs font-normal"
                >
                  {selectedProjectId
                    ? otherProjects.find(p => p.id === selectedProjectId)?.name ?? "Select..."
                    : "Search projects..."}
                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search projects..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty>No projects found.</CommandEmpty>
                    <CommandGroup>
                      {otherProjects.map(p => (
                        <CommandItem
                          key={p.id}
                          value={p.name}
                          onSelect={() => {
                            setSelectedProjectId(p.id);
                            setSelectedTaskId(undefined);
                            setTaskSearch("");
                            setProjectPickerOpen(false);
                          }}
                          className="text-xs"
                        >
                          <Check className={cn("mr-2 h-3 w-3", selectedProjectId === p.id ? "opacity-100" : "opacity-0")} />
                          {p.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedTargetType === "task" && selectedProjectId && (
            <div>
              <Label className="text-xs">Target Task</Label>
              <Input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks..."
                className="h-8 text-xs mb-2"
              />
              <div className="max-h-32 overflow-y-auto border rounded-md">
                {filteredTasks.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-2">No tasks found</div>
                ) : (
                  filteredTasks.map(t => (
                    <div
                      key={t.id}
                      className={cn(
                        "px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/50 flex items-center justify-between",
                        selectedTaskId === t.id && "bg-primary/10 font-medium"
                      )}
                      onClick={() => setSelectedTaskId(t.id)}
                    >
                      <span className="truncate">{t.name}</span>
                      <Badge variant="outline" className="text-[10px] ml-2 shrink-0">{t.status}</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setSelectedProjectId(undefined);
                setSelectedTaskId(undefined);
                setTaskSearch("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={
                !selectedProjectId ||
                !relationshipType ||
                (selectedTargetType === "task" && !selectedTaskId) ||
                createRef.isPending
              }
            >
              {createRef.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getInverseLabel(type: string): string {
  switch (type) {
    case "blocks": return "is_blocked_by";
    case "is_blocked_by": return "blocks";
    case "depends_on": return "is_dependency_of";
    case "is_dependency_of": return "depends_on";
    default: return type;
  }
}
