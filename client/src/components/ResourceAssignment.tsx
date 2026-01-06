import { useState, useEffect } from "react";
import { useResources } from "@/hooks/use-resources";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, Users, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Resource } from "@shared/schema";

interface ResourceAssignmentProps {
  organizationId: number | null;
  selectedResourceIds: number[];
  onSelectionChange: (resourceIds: number[]) => void;
  label?: string;
  className?: string;
}

export function ResourceAssignment({ 
  organizationId, 
  selectedResourceIds, 
  onSelectionChange,
  label = "Resources",
  className 
}: ResourceAssignmentProps) {
  const { data: resources, isLoading } = useResources(organizationId);
  const [open, setOpen] = useState(false);

  const selectedResources = resources?.filter(r => selectedResourceIds.includes(r.id)) || [];
  const availableResources = resources?.filter(r => r.isActive) || [];

  const toggleResource = (resourceId: number) => {
    if (selectedResourceIds.includes(resourceId)) {
      onSelectionChange(selectedResourceIds.filter(id => id !== resourceId));
    } else {
      onSelectionChange([...selectedResourceIds, resourceId]);
    }
  };

  const removeResource = (resourceId: number) => {
    onSelectionChange(selectedResourceIds.filter(id => id !== resourceId));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      
      <div className="flex flex-wrap gap-2 items-center">
        {selectedResources.map(resource => (
          <Badge 
            key={resource.id} 
            variant="secondary" 
            className="flex items-center gap-1 pr-1"
            data-testid={`badge-resource-${resource.id}`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold">
              {resource.displayName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate max-w-[100px]">{resource.displayName}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeResource(resource.id); }}
              className="ml-1 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
              data-testid={`button-remove-resource-${resource.id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              className="h-7 gap-1"
              data-testid="button-add-resource"
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search resources..." />
              <CommandList>
                <CommandEmpty>No resources found.</CommandEmpty>
                <CommandGroup>
                  {availableResources.map(resource => (
                    <CommandItem
                      key={resource.id}
                      value={resource.displayName}
                      onSelect={() => toggleResource(resource.id)}
                      data-testid={`resource-option-${resource.id}`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                          {resource.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 truncate">
                          <div className="text-sm font-medium">{resource.displayName}</div>
                          {resource.title && (
                            <div className="text-xs text-muted-foreground truncate">{resource.title}</div>
                          )}
                        </div>
                        {selectedResourceIds.includes(resource.id) && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      
      {selectedResources.length === 0 && (
        <p className="text-xs text-muted-foreground">No resources assigned</p>
      )}
    </div>
  );
}

interface ResourceDisplayProps {
  organizationId: number | null;
  resourceIds: number[];
  compact?: boolean;
}

export function ResourceDisplay({ organizationId, resourceIds, compact }: ResourceDisplayProps) {
  const { data: resources } = useResources(organizationId);
  const assignedResources = resources?.filter(r => resourceIds.includes(r.id)) || [];

  if (assignedResources.length === 0) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  if (compact && assignedResources.length > 2) {
    return (
      <div className="flex items-center gap-1">
        {assignedResources.slice(0, 2).map(r => (
          <span 
            key={r.id}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold"
            title={r.displayName}
          >
            {r.displayName.charAt(0).toUpperCase()}
          </span>
        ))}
        <span className="text-xs text-muted-foreground">+{assignedResources.length - 2}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {assignedResources.map(r => (
        <span 
          key={r.id}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold"
          title={r.displayName}
        >
          {r.displayName.charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
