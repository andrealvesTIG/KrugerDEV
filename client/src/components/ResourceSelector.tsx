import { useState } from "react";
import { useResources } from "@/hooks/use-resources";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, User, X, Mail, Loader2, UserPlus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Resource } from "@shared/schema";

interface ResourceSelectorProps {
  organizationId: number | null;
  selectedResourceId: number | null;
  onSelectionChange: (resourceId: number | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  projectId?: number;
  projectName?: string;
}

export function ResourceSelector({ 
  organizationId, 
  selectedResourceId, 
  onSelectionChange,
  label = "Resource",
  placeholder = "Select resource...",
  className,
  projectId,
  projectName
}: ResourceSelectorProps) {
  const { data: resources, isLoading } = useResources(organizationId);
  const [open, setOpen] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const selectedResource = resources?.find(r => r.id === selectedResourceId);
  const availableResources = resources?.filter(r => r.isActive) || [];

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/resources/invite", {
        organizationId,
        email,
        projectId,
        projectName
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invitation sent",
        description: `An invitation has been sent to ${inviteEmail}.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      
      if (data.resource) {
        onSelectionChange(data.resource.id);
      }
      
      setInviteEmail("");
      setShowInviteForm(false);
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  });

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

  if (!organizationId) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No organization selected
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid="button-resource-selector"
          >
            {selectedResource ? (
              <span className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {selectedResource.displayName}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search resources..." />
            <CommandList>
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <div className="py-4 text-center text-sm">
                    No resources found.
                  </div>
                )}
              </CommandEmpty>
              <CommandGroup heading="Resources">
                {selectedResourceId && (
                  <CommandItem
                    onSelect={() => {
                      onSelectionChange(null);
                      setOpen(false);
                    }}
                    className="text-muted-foreground"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear selection
                  </CommandItem>
                )}
                {availableResources.map((resource) => (
                  <CommandItem
                    key={resource.id}
                    value={resource.displayName || resource.email || undefined}
                    onSelect={() => {
                      onSelectionChange(resource.id);
                      setOpen(false);
                    }}
                    data-testid={`resource-option-${resource.id}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedResourceId === resource.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{resource.displayName}</span>
                      {resource.email && (
                        <span className="text-xs text-muted-foreground">{resource.email}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              
              <CommandGroup heading="Invite">
                {showInviteForm ? (
                  <div className="p-2">
                    <form onSubmit={handleInvite} className="space-y-2">
                      <Input
                        type="email"
                        placeholder="Enter email address"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        autoFocus
                        data-testid="input-invite-email"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={inviteMutation.isPending}
                          className="flex-1"
                          data-testid="button-send-invite"
                        >
                          {inviteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Mail className="h-4 w-4 mr-1" />
                              Send Invite
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowInviteForm(false);
                            setInviteEmail("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <CommandItem
                    onSelect={() => setShowInviteForm(true)}
                    data-testid="button-invite-new"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite someone new...
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
