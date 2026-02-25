import { useState, useEffect } from "react";
import { useCreateResource, useUpdateResource } from "@/hooks/use-resources";
import { useQuery } from "@tanstack/react-query";
import { insertResourceSchema } from "@shared/schema";
import type { Resource } from "@shared/schema";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCircle } from "lucide-react";

const resourceFormSchema = insertResourceSchema.extend({
  displayName: z.string().min(1, "Name is required"),
});

type ResourceFormData = z.infer<typeof resourceFormSchema>;

interface OrgMember {
  userId: string;
  role: string;
  user?: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
}

export interface ResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | undefined;
  resource?: Resource;
  onSuccess: () => void;
}

export function ResourceDialog({ open, onOpenChange, organizationId, resource, onSuccess }: ResourceDialogProps) {
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const isEditing = !!resource;
  const [selectedUserId, setSelectedUserId] = useState<string | null>(resource?.userId || null);

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: [`/api/organizations/${organizationId}/members`],
    enabled: !!organizationId && open,
  });

  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      organizationId: organizationId || 0,
      displayName: resource?.displayName || "",
      email: resource?.email || "",
      title: resource?.title || "",
      department: resource?.department || "",
      skills: resource?.skills || "",
      hourlyRate: resource?.hourlyRate || "",
      isActive: resource?.isActive ?? true,
      isApprover: resource?.isApprover ?? false,
      isIntakeApprover: resource?.isIntakeApprover ?? false,
      timesheetHidden: resource?.timesheetHidden ?? false,
      notes: resource?.notes || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        organizationId: organizationId || 0,
        displayName: resource?.displayName || "",
        email: resource?.email || "",
        title: resource?.title || "",
        department: resource?.department || "",
        skills: resource?.skills || "",
        hourlyRate: resource?.hourlyRate || "",
        isActive: resource?.isActive ?? true,
        isApprover: resource?.isApprover ?? false,
        isIntakeApprover: resource?.isIntakeApprover ?? false,
        timesheetHidden: resource?.timesheetHidden ?? false,
        notes: resource?.notes || "",
      });
      setSelectedUserId(resource?.userId || null);
    }
  }, [open, organizationId, resource]);

  const { toast } = useToast();

  const onSubmit = async (data: ResourceFormData) => {
    if (!organizationId) {
      toast({ title: "Error", description: "No organization selected", variant: "destructive" });
      return;
    }
    try {
      const resourceData = {
        organizationId,
        displayName: data.displayName,
        email: data.email || null,
        title: data.title || null,
        department: data.department || null,
        skills: data.skills || null,
        hourlyRate: data.hourlyRate || null,
        isActive: data.isActive ?? true,
        isApprover: data.isApprover ?? false,
        isIntakeApprover: data.isIntakeApprover ?? false,
        timesheetHidden: data.timesheetHidden ?? false,
        notes: data.notes || null,
        userId: selectedUserId,
      };
      if (isEditing && resource) {
        await updateResource.mutateAsync({ id: resource.id, updates: resourceData });
      } else {
        await createResource.mutateAsync(resourceData);
      }
      onSuccess();
      form.reset();
    } catch (err: any) {
      console.error("Failed to save resource:", err?.message || err);
      if (err?.limitExceeded) {
        toast({
          title: "Credit Limit Reached",
          description: err.message || "Please upgrade your plan to create more resources.",
          variant: "destructive",
        });
        onOpenChange(false);
      } else {
        toast({
          title: "Error",
          description: err?.message || "Failed to save resource",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Resource" : "Add New Resource"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="displayName">Name *</Label>
                  <Input id="displayName" {...form.register("displayName")} placeholder="John Smith" data-testid="input-resource-name" />
                  {form.formState.errors.displayName && (
                    <p className="text-sm text-red-500 mt-1">{form.formState.errors.displayName.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...form.register("email")} placeholder="john@example.com" data-testid="input-resource-email" />
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" {...form.register("title")} placeholder="Software Engineer" data-testid="input-resource-title" />
                </div>
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" {...form.register("department")} placeholder="Engineering" data-testid="input-resource-department" />
                </div>
                <div>
                  <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                  <Input id="hourlyRate" {...form.register("hourlyRate")} placeholder="100" data-testid="input-resource-rate" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="skills">Skills</Label>
                  <Input id="skills" {...form.register("skills")} placeholder="React, TypeScript, Node.js" data-testid="input-resource-skills" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" {...form.register("notes")} placeholder="Additional notes..." rows={2} data-testid="input-resource-notes" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-5 mt-0">
              <div>
                <Label htmlFor="userId" className="flex items-center gap-2 mb-1.5">
                  <UserCircle className="h-4 w-4" />
                  Link to User Account
                </Label>
                <Select
                  value={selectedUserId || "none"}
                  onValueChange={(value) => setSelectedUserId(value === "none" ? null : value)}
                >
                  <SelectTrigger data-testid="select-resource-user">
                    <SelectValue placeholder="Select a user account..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked user</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.user?.firstName && member.user?.lastName
                          ? `${member.user.firstName} ${member.user.lastName}`
                          : member.user?.email || member.userId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Link this resource to a user account to enable timesheet logging
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <Label htmlFor="isActive" className="text-sm font-normal cursor-pointer">Active</Label>
                  <Switch
                    id="isActive"
                    checked={form.watch("isActive") ?? true}
                    onCheckedChange={(checked) => form.setValue("isActive", checked)}
                    data-testid="switch-resource-active"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <Label htmlFor="isApprover" className="text-sm font-normal cursor-pointer">Timesheet Approver</Label>
                  <Switch
                    id="isApprover"
                    checked={form.watch("isApprover") ?? false}
                    onCheckedChange={(checked) => form.setValue("isApprover", checked)}
                    data-testid="switch-resource-approver"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <Label htmlFor="isIntakeApprover" className="text-sm font-normal cursor-pointer">Intake Approver</Label>
                  <Switch
                    id="isIntakeApprover"
                    checked={form.watch("isIntakeApprover") ?? false}
                    onCheckedChange={(checked) => form.setValue("isIntakeApprover", checked)}
                    data-testid="switch-resource-intake-approver"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <Label htmlFor="timesheetHidden" className="text-sm font-normal cursor-pointer">Hide from Timesheets</Label>
                  <Switch
                    id="timesheetHidden"
                    checked={form.watch("timesheetHidden") ?? false}
                    onCheckedChange={(checked) => form.setValue("timesheetHidden", checked)}
                    data-testid="switch-resource-timesheet-hidden"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-resource">
              Cancel
            </Button>
            <Button type="submit" disabled={createResource.isPending || updateResource.isPending} data-testid="button-save-resource">
              {isEditing ? "Save Changes" : "Create Resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
