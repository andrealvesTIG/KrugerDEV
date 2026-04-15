import React, { useState, useRef } from "react";
import { useResources } from "@/hooks/use-resources";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, Users, X, Plus, Mail, Loader2, UserPlus, Bell } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Resource } from "@shared/schema";

export interface ResourceAllocation {
  resourceId: number;
  allocationPercentage: number; // 0-100%
}

function AllocationInput({ value, onChange, resourceId }: { value: number; onChange: (v: number) => void; resourceId: number }) {
  const [localValue, setLocalValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  React.useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value));
    }
  }, [value, isFocused]);

  const commit = () => {
    const parsed = parseInt(localValue);
    const clamped = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
    onChange(clamped);
    setLocalValue(String(clamped));
    setIsFocused(false);
  };

  return (
    <Input
      type="number"
      min={0}
      max={100}
      step={1}
      value={localValue}
      onFocus={(e) => { setIsFocused(true); e.target.select(); }}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
        e.stopPropagation();
      }}
      className="h-6 w-14 text-xs text-center px-1 border-0 bg-transparent focus-visible:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      data-testid={`input-allocation-${resourceId}`}
    />
  );
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
  onInviteAssigned?: () => void;
  teamResourceIds?: number[];
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
  onInviteAssigned,
  teamResourceIds
}: ResourceAssignmentProps) {
  const { data: resources, isLoading } = useResources(organizationId);
  const [open, setOpen] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const commandInputRef = useRef<HTMLInputElement>(null);
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
  const teamFilterSet = teamResourceIds ? new Set(teamResourceIds) : null;
  const teamResources = teamFilterSet
    ? resources?.filter(r => r.isActive && teamFilterSet.has(r.id)) || []
    : [];
  const otherResources = teamFilterSet
    ? resources?.filter(r => r.isActive && !teamFilterSet.has(r.id)) || []
    : [];
  const availableResources = resources?.filter(r => r.isActive && (!teamFilterSet || teamFilterSet.has(r.id))) || [];

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

  const notifyMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No task selected");
      const response = await apiRequest("POST", `/api/tasks/${taskId}/notify-assignees`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Notifications sent",
        description: `Assignment notifications sent to ${data.sent} team member${data.sent !== 1 ? 's' : ''}${data.skipped > 0 ? ` (${data.skipped} skipped - no email)` : ''}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send notifications",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  });

  const addToProjectTeam = async (resourceId: number) => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/team-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add team member");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "task-resource-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    } catch {
      toast({
        title: "Could not add to project team",
        description: "The resource was assigned but could not be added to the project team automatically.",
        variant: "destructive",
      });
    }
  };

  const toggleResource = (resourceId: number, isFromOtherResources = false) => {
    if (selectedResourceIds.includes(resourceId)) {
      onSelectionChange(selectedResourceIds.filter(id => id !== resourceId));
      if (onAllocationsChange) {
        onAllocationsChange(allocations.filter(a => a.resourceId !== resourceId));
      }
    } else {
      onSelectionChange([...selectedResourceIds, resourceId]);
      if (onAllocationsChange) {
        onAllocationsChange([...allocations, { resourceId, allocationPercentage: 100 }]);
      }
      if (isFromOtherResources && projectId) {
        addToProjectTeam(resourceId);
      }
    }
    setSearchValue("");
    requestAnimationFrame(() => {
      commandInputRef.current?.focus();
    });
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
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-4 w-4 text-primary" />
        </div>
        <div>
          <span className="text-sm font-semibold">{label}</span>
          <p className="text-xs text-muted-foreground">{selectedResources.length} team member{selectedResources.length !== 1 ? 's' : ''} assigned</p>
        </div>
      </div>
      
      <div className="space-y-2">
        {selectedResources.map(resource => (
          <div 
            key={resource.id} 
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
            data-testid={`badge-resource-${resource.id}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-sm font-semibold shrink-0">
                {resource.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{resource.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">{resource.email || 'No email'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showAllocations && onAllocationsChange && (
                <div className="flex items-center gap-1 bg-muted/50 rounded-md px-2 py-1">
                  <AllocationInput
                    value={getAllocation(resource.id)}
                    onChange={(v) => updateAllocation(resource.id, v)}
                    resourceId={resource.id}
                  />
                  <span className="text-xs text-muted-foreground font-medium">%</span>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeResource(resource.id); }}
                className="opacity-0 group-hover:opacity-100 rounded-full p-1.5 hover:bg-destructive/10 hover:text-destructive transition-all"
                data-testid={`button-remove-resource-${resource.id}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        
        {selectedResources.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 rounded-lg border border-dashed bg-muted/30">
            <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground text-center">No team members assigned yet</p>
            <p className="text-xs text-muted-foreground/70 text-center mt-1">Click the button below to add resources</p>
          </div>
        )}
      </div>
      
      <Popover open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) setSearchValue(""); }}>
        <PopoverTrigger asChild>
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            className="w-full gap-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors"
            data-testid="button-add-resource"
          >
            <Plus className="h-4 w-4" />
            Add Team Member
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
                <Command shouldFilter={true}>
                  <CommandInput ref={commandInputRef} placeholder="Search resources..." value={searchValue} onValueChange={setSearchValue} />
                  <CommandList className="max-h-[280px]">
                    <CommandEmpty>No resources found.</CommandEmpty>
                    {teamFilterSet ? (
                      <>
                        {teamResources.length > 0 && (
                          <CommandGroup heading="Project Team">
                            {teamResources.map(resource => (
                              <CommandItem
                                key={resource.id}
                                value={resource.displayName}
                                onSelect={() => {
                                  toggleResource(resource.id);
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
                        )}
                        {otherResources.length > 0 && (
                          <CommandGroup heading="All Resources">
                            {otherResources.map(resource => (
                              <CommandItem
                                key={resource.id}
                                value={resource.displayName}
                                onSelect={() => {
                                  toggleResource(resource.id, true);
                                }}
                                onPointerDown={(e) => e.preventDefault()}
                                data-testid={`resource-option-${resource.id}`}
                              >
                                <div className="flex items-center gap-2 w-full">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold">
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
                        )}
                      </>
                    ) : (
                      <CommandGroup>
                        {availableResources.map(resource => (
                          <CommandItem
                            key={resource.id}
                            value={resource.displayName}
                            onSelect={() => {
                              toggleResource(resource.id);
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
                    )}
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

        {taskId && selectedResources.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => notifyMutation.mutate()}
                disabled={notifyMutation.isPending}
              >
                {notifyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Send Assignment Notification
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Send an email notification to all assigned team members</p>
            </TooltipContent>
          </Tooltip>
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
