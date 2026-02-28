import { useState } from "react";
import { useCreateIssue } from "@/hooks/use-issues";
import { useUpdateIssueResourceAssignments } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIssueSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | null;
}

const defaultValues = {
  projectId: undefined as unknown as number,
  title: "",
  description: "",
  priority: "Medium" as string,
  status: "Open" as string,
  type: "Bug" as string,
  dueDate: "" as string,
  impactCost: "" as string,
};

export function CreateIssueDialog({ open, onOpenChange, organizationId }: CreateIssueDialogProps) {
  const { toast } = useToast();
  const createIssue = useCreateIssue();
  const updateIssueResources = useUpdateIssueResourceAssignments();
  const { data: projects } = useProjects(organizationId ?? null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);

  const form = useForm({
    resolver: zodResolver(
      insertIssueSchema.extend({
        projectId: insertIssueSchema.shape.projectId.refine((val) => val > 0, "Please select a project"),
      })
    ),
    defaultValues,
  });

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset(defaultValues);
      setSelectedResourceIds([]);
    }
    onOpenChange(isOpen);
  };

  const onSubmit = (data: any) => {
    const submitData = { ...data };
    if (!submitData.dueDate) delete submitData.dueDate;
    if (!submitData.impactCost) delete submitData.impactCost;
    createIssue.mutate(submitData, {
      onSuccess: (newIssue: any) => {
        if (selectedResourceIds.length > 0 && newIssue?.id) {
          updateIssueResources.mutate({ issueId: newIssue.id, resourceIds: selectedResourceIds });
        }
        toast({ title: "Success", description: "Issue created successfully" });
        handleOpenChange(false);
      },
      onError: (err: any) => {
        if (err.limitExceeded) {
          setLimitError({ message: err.message, resourceType: err.resourceType });
          setLimitDialogOpen(true);
          handleOpenChange(false);
        } else {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      },
    });
  };

  return (
    <>
      <LimitExceededDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        resourceType={limitError?.resourceType}
        message={limitError?.message}
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Issue</DialogTitle>
            <DialogDescription>Log a new issue for a project.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Project <span className="text-destructive">*</span></Label>
              <Controller
                control={form.control}
                name="projectId"
                render={({ field, fieldState }) => (
                  <>
                    <Select
                      onValueChange={(val) => field.onChange(parseInt(val))}
                      value={field.value?.toString()}
                    >
                      <SelectTrigger
                        data-testid="select-project"
                        className={fieldState.error ? "border-destructive" : ""}
                      >
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            <div className="truncate max-w-[300px]" title={p.name}>{p.name}</div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.error && (
                      <p className="text-sm text-destructive">{fieldState.error.message}</p>
                    )}
                  </>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                {...form.register("title")}
                data-testid="input-issue-title"
                placeholder="Brief description of the issue"
                className={form.formState.errors.title ? "border-destructive" : ""}
              />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.title.message as string}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Bug"}>
                      <SelectTrigger data-testid="select-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bug">Bug</SelectItem>
                        <SelectItem value="Enhancement">Enhancement</SelectItem>
                        <SelectItem value="Task">Task</SelectItem>
                        <SelectItem value="Question">Question</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                      <SelectTrigger data-testid="select-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  {...form.register("dueDate")}
                  data-testid="input-issue-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Exposure ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  {...form.register("impactCost")}
                  data-testid="input-issue-cost-exposure"
                  placeholder="$ amount"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                {...form.register("description")}
                data-testid="input-issue-description"
                placeholder="Detailed description"
              />
            </div>

            <ResourceAssignment
              organizationId={organizationId}
              selectedResourceIds={selectedResourceIds}
              onSelectionChange={setSelectedResourceIds}
              label="Assigned Resources"
              projectId={form.watch("projectId")}
            />

            <DialogFooter>
              <Button
                type="submit"
                disabled={createIssue.isPending}
                data-testid="button-submit-issue"
              >
                {createIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Issue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
