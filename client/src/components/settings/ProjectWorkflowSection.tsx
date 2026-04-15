import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, Pencil, RotateCw, GripVertical, LockIcon } from "lucide-react";
import type { ProjectWorkflowStep } from "@shared/schema";

export function ProjectWorkflowSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [editingStep, setEditingStep] = useState<ProjectWorkflowStep | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsTerminal, setEditIsTerminal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepKey, setNewStepKey] = useState("");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [newIsTerminal, setNewIsTerminal] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<ProjectWorkflowStep | null>(null);

  const { data: workflowSteps, isLoading } = useQuery<ProjectWorkflowStep[]>({
    queryKey: ['/api/organizations', organizationId, 'project-workflow'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/project-workflow`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async (steps: Partial<ProjectWorkflowStep>[]) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/project-workflow`, { steps });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'project-workflow'] });
      toast({ title: "Saved", description: "Project workflow configuration updated" });
      setEditingStep(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update project workflow", variant: "destructive" });
    }
  });

  const resetWorkflowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/organizations/${organizationId}/project-workflow/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'project-workflow'] });
      toast({ title: "Reset", description: "Project workflow reset to defaults" });
      setShowResetConfirm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset project workflow", variant: "destructive" });
    }
  });

  const handleEditSave = () => {
    if (!editingStep || !workflowSteps) return;
    const updatedSteps = workflowSteps.map(s =>
      s.id === editingStep.id
        ? { ...s, label: editLabel, description: editDescription, isTerminal: editIsTerminal }
        : s
    );
    updateWorkflowMutation.mutate(updatedSteps);
  };

  const handleAddStep = () => {
    if (!newStepKey || !newStepLabel || !workflowSteps) return;
    const maxPosition = workflowSteps.length > 0
      ? Math.max(...workflowSteps.map(s => s.position))
      : -1;
    const newStep = {
      stepKey: newStepKey,
      label: newStepLabel,
      description: newStepDescription || null,
      position: maxPosition + 1,
      isTerminal: newIsTerminal,
      isActive: true,
    };
    updateWorkflowMutation.mutate([...workflowSteps, newStep]);
    setShowAddStep(false);
    setNewStepKey("");
    setNewStepLabel("");
    setNewStepDescription("");
    setNewIsTerminal(false);
  };

  const handleDeleteStep = () => {
    if (!stepToDelete || !workflowSteps) return;
    const remaining = workflowSteps
      .filter(s => s.id !== stepToDelete.id)
      .map((s, idx) => ({ ...s, position: idx }));
    updateWorkflowMutation.mutate(remaining);
    setStepToDelete(null);
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (!workflowSteps) return;
    const steps = [...workflowSteps];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    [steps[index], steps[targetIndex]] = [steps[targetIndex], steps[index]];
    const reordered = steps.map((s, idx) => ({ ...s, position: idx }));
    updateWorkflowMutation.mutate(reordered);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const steps = workflowSteps || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Project Workflow Steps</CardTitle>
              <CardDescription>
                Define the lifecycle stages that projects move through. These steps appear in the project status bar.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(true)}>
                <RotateCw className="h-4 w-4 mr-1" />
                Reset to Defaults
              </Button>
              <Button size="sm" onClick={() => setShowAddStep(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Step
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No workflow steps configured. Click "Reset to Defaults" to start with the standard workflow.
            </p>
          ) : (
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveStep(index, "up")}
                      disabled={index === 0 || updateWorkflowMutation.isPending}
                    >
                      <span className="text-xs">▲</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveStep(index, "down")}
                      disabled={index === steps.length - 1 || updateWorkflowMutation.isPending}
                    >
                      <span className="text-xs">▼</span>
                    </Button>
                  </div>

                  <GripVertical className="h-4 w-4 text-muted-foreground" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{step.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {step.stepKey}
                      </Badge>
                      {step.isTerminal && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <LockIcon className="h-3 w-3" />
                          Terminal
                        </Badge>
                      )}
                    </div>
                    {step.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingStep(step);
                        setEditLabel(step.label);
                        setEditDescription(step.description || "");
                        setEditIsTerminal(step.isTerminal ?? false);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setStepToDelete(step)}
                      disabled={steps.length <= 2}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workflow Step</DialogTitle>
            <DialogDescription>Modify the display name, description, and behavior of this step.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Step Key</Label>
              <Input value={editingStep?.stepKey || ""} disabled className="mt-1 bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">The step key cannot be changed after creation.</p>
            </div>
            <div>
              <Label>Display Label</Label>
              <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editIsTerminal} onCheckedChange={setEditIsTerminal} />
              <Label>Terminal step (locks the project)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!editLabel || updateWorkflowMutation.isPending}>
              {updateWorkflowMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddStep} onOpenChange={setShowAddStep}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Workflow Step</DialogTitle>
            <DialogDescription>Add a new step to the project lifecycle workflow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Step Key (identifier)</Label>
              <Input
                value={newStepKey}
                onChange={e => setNewStepKey(e.target.value)}
                placeholder="e.g. review"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A unique identifier for this step. Use lowercase with no spaces.
              </p>
            </div>
            <div>
              <Label>Display Label</Label>
              <Input
                value={newStepLabel}
                onChange={e => setNewStepLabel(e.target.value)}
                placeholder="e.g. Review"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={newStepDescription}
                onChange={e => setNewStepDescription(e.target.value)}
                placeholder="e.g. Final review before sign-off"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={newIsTerminal} onCheckedChange={setNewIsTerminal} />
              <Label>Terminal step (locks the project)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStep(false)}>Cancel</Button>
            <Button onClick={handleAddStep} disabled={!newStepKey || !newStepLabel || updateWorkflowMutation.isPending}>
              {updateWorkflowMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!stepToDelete} onOpenChange={(open) => !open && setStepToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow Step</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{stepToDelete?.label}" from the workflow? Projects currently at this status will need to be manually updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStep} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all current workflow steps with the default project lifecycle:
              Initiation → Planning → Execution → Monitoring → Closing → Billing, plus On Hold and Closed as terminal states.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetWorkflowMutation.mutate()}>
              Reset to Defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
