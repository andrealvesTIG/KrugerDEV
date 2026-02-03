import { useState } from "react";
import { useResources } from "@/hooks/use-resources";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, Users, X, Plus, Mail, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Resource } from "@shared/schema";

export interface ResourceAllocation {
  resourceId: number;
  allocationPercentage: number; // 0-100%
}

interface ResourceAssignmentProps {
  organizationId: number | null;
  selectedResourceIds: number[];
  onSelectionChange: (resourceIds: number[]) => void;
  allocations?: ResourceAllocation[];
  onAllocationsChange?: (allocations: ResourceAllocation[]) => void;
  showAllocations?: boolean;
  label?: string;
  className?: string;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  taskName?: string;
  onInviteAssigned?: () => void; // Called when an invite already assigned resource to task
}

export function ResourceAssignment({ 
  organizationId, 
  selectedResourceIds, 
  onSelectionChange,
  allocations = [],
  onAllocationsChange,
  showAllocations = false,
  label = "Resources",
  className,
  projectId,
  projectName,
  taskId,
  taskName,
  onInviteAssigned
}: ResourceAssignmentProps) {
  const { data: resources, isLoading } = useResources(organizationId);
  const [open, setOpen] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getAllocation = (resourceId: number): number => {
    const allocation = allocations.find(a => a.resourceId === resourceId);
    return allocation?.allocationPercentage ?? 100;
  };

  const updateAllocation = (resourceId: number, percentage: number) => {
    if (!onAllocationsChange) return;
    const newAllocations = allocations.filter(a => a.resourceId !== resourceId);
    newAllocations.push({ resourceId, allocationPercentage: Math.min(100, Math.max(0, percentage)) });
    onAllocationsChange(newAllocations);
  };

  const selectedResources = resources?.filter(r => selectedResourceIds.includes(r.id)) || [];
  const availableResources = resources?.filter(r => r.isActive) || [];

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/resources/invite", {
        organizationId,
        email,
        projectId,
        projectName,
        taskId,
        taskName
      });
      return response.json();
    },
    onSuccess: (data) => {
      const assignmentMsg = data.taskAssigned ? " They have been assigned to this task." : "";
      toast({
        title: "Invitation sent",
        description: `An invitation has been sent to ${inviteEmail}.${assignmentMsg}`,
      });
      
      // Invalidate resources to show the new resource in the list
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      
      // If backend assigned to task, invalidate task assignments AND update local state
      // We need to update local state because the parent's useEffect may not have fired yet
      if (taskId && data.taskAssigned && data.resource) {
        // Invalidate to refetch from server
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "resources"] });
        // Also update local state immediately so UI shows the assignment
        // This ensures the state is correct before any form submission
        if (!selectedResourceIds.includes(data.resource.id)) {
          onSelectionChange([...selectedResourceIds, data.resource.id]);
          // Add default allocation for the new resource
          if (onAllocationsChange) {
            onAllocationsChange([...allocations, { resourceId: data.resource.id, allocationPercentage: 100 }]);
          }
        }
        // Notify parent that invite already handled the assignment
        // This prevents form submission from overwriting with stale state
        onInviteAssigned?.();
      } else if (data.resource) {
        // No taskId, just add to selection for later save
        onSelectionChange([...selectedResourceIds, data.resource.id]);
        // Add default allocation for the new resource
        if (onAllocationsChange) {
          onAllocationsChange([...allocations, { resourceId: data.resource.id, allocationPercentage: 100 }]);
        }
      }
      
      setInviteEmail("");
      setShowInviteForm(false);
      // Keep the popover open so user can continue assigning resources
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  });

  const toggleResource = (resourceId: number) => {
    if (selectedResourceIds.includes(resourceId)) {
      // Remove resource and its allocation
      onSelectionChange(selectedResourceIds.filter(id => id !== resourceId));
      if (onAllocationsChange) {
        onAllocationsChange(allocations.filter(a => a.resourceId !== resourceId));
      }
    } else {
      // Add resource with default 100% allocation
      onSelectionChange([...selectedResourceIds, resourceId]);
      if (onAllocationsChange) {
        onAllocationsChange([...allocations, { resourceId, allocationPercentage: 100 }]);
      }
    }
    // Close the dropdown after selection
    setOpen(false);
  };

  const removeResource = (resourceId: number) => {
    onSelectionChange(selectedResourceIds.filter(id => id !== resourceId));
    if (onAllocationsChange) {
      onAllocationsChange(allocations.filter(a => a.resourceId !== resourceId));
    }
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    inviteMutation.mutate(inviteEmail.trim());
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      
      <div className="flex flex-wrap gap-2 items-center">
        {selectedResources.map(resource => (
          <div key={resource.id} className="flex items-center gap-1" data-testid={`badge-resource-${resource.id}`}>
            <Badge 
              variant="secondary" 
              className="flex items-center gap-1 pr-1"
              title={resource.email || resource.displayName}
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
            {showAllocations && onAllocationsChange && (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={getAllocation(resource.id)}
                  onChange={(e) => updateAllocation(resource.id, parseInt(e.target.value) || 0)}
                  className="h-6 w-14 text-xs text-center px-1"
                  data-testid={`input-allocation-${resource.id}`}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
          </div>
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
          <PopoverContent className="w-72 p-0" align="start">
            {showInviteForm ? (
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteForm(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium">Invite new team member</span>
                </div>
                <form onSubmit={handleInvite} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="h-8"
                      autoFocus
                      data-testid="input-invite-email"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="w-full"
                    disabled={inviteMutation.isPending || !inviteEmail.trim()}
                    data-testid="button-send-invite"
                  >
                    {inviteMutation.isPending ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="h-3 w-3 mr-2" />
                        Send Invitation
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    They'll receive an email to join and see their assignments
                  </p>
                </form>
              </div>
            ) : (
              <div className="flex flex-col">
                <Command>
                  <CommandInput placeholder="Search resources..." />
                  <CommandList className="max-h-[200px]">
                    <CommandEmpty>No resources found.</CommandEmpty>
                    <CommandGroup>
                      {availableResources.map(resource => (
                        <CommandItem
                          key={resource.id}
                          value={resource.displayName}
                          onSelect={() => {
                            toggleResource(resource.id);
                            // Keep popover open to allow multiple selections
                          }}
                          onPointerDown={(e) => e.preventDefault()}
                          data-testid={`resource-option-${resource.id}`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                              {resource.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{resource.displayName}</div>
                              {resource.email ? (
                                <div className="text-xs text-muted-foreground truncate">{resource.email}</div>
                              ) : resource.title ? (
                                <div className="text-xs text-muted-foreground truncate">{resource.title}</div>
                              ) : null}
                            </div>
                            {selectedResourceIds.includes(resource.id) && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
                <div className="border-t p-1">
                  <button
                    type="button"
                    onClick={() => setShowInviteForm(true)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary rounded-sm hover:bg-accent transition-colors"
                    data-testid="button-invite-new-resource"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>Invite new team member...</span>
                  </button>
                </div>
              </div>
            )}
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
