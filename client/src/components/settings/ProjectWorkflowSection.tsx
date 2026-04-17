import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, Pencil, RotateCw, GripVertical, LockIcon, Star, GitBranch } from "lucide-react";
import { useProjectWorkflows } from "@/hooks/use-project-workflows";
import type { ProjectWorkflowStep, ProjectWorkflow } from "@shared/schema";

export function ProjectWorkflowSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { workflows, isLoading: workflowsLoading, createWorkflow, updateWorkflowMeta, deleteWorkflow } = useProjectWorkflows();

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<ProjectWorkflow | null>(null);
  const [wfName, setWfName] = useState("");
  const [wfDescription, setWfDescription] = useState("");
  const [wfIsDefault, setWfIsDefault] = useState(false);
  const [wfCreationMode, setWfCreationMode] = useState<'dialog' | 'url'>('dialog');
  const [wfCreationUrl, setWfCreationUrl] = useState("");
  const [wfUrlError, setWfUrlError] = useState<string | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<ProjectWorkflow | null>(null);

  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      const def = workflows.find(w => w.isDefault) || workflows[0];
      setSelectedWorkflowId(def.id);
    } else if (selectedWorkflowId && workflows.length > 0 && !workflows.find(w => w.id === selectedWorkflowId)) {
      const def = workflows.find(w => w.isDefault) || workflows[0];
      setSelectedWorkflowId(def.id);
    }
  }, [workflows, selectedWorkflowId]);

  const selectedWorkflow = useMemo(() => workflows.find(w => w.id === selectedWorkflowId) || null, [workflows, selectedWorkflowId]);
  const wfQuery = selectedWorkflowId ? `?workflowId=${selectedWorkflowId}` : '';
  const wfQueryKey: readonly unknown[] = selectedWorkflowId
    ? ['/api/organizations', organizationId, 'project-workflow', { workflowId: selectedWorkflowId }]
    : ['/api/organizations', organizationId, 'project-workflow'];

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
    queryKey: wfQueryKey,
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/project-workflow${wfQuery}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedWorkflowId,
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async (steps: Partial<ProjectWorkflowStep>[]) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/project-workflow${wfQuery}`, { steps });
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
      return apiRequest('POST', `/api/organizations/${organizationId}/project-workflow/reset${wfQuery}`);
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

  const openWorkflowDialog = (wf: ProjectWorkflow | null) => {
    setEditingWorkflow(wf);
    setWfName(wf?.name || "");
    setWfDescription(wf?.description || "");
    setWfIsDefault(wf?.isDefault || false);
    setWfCreationMode((wf?.creationMode as 'dialog' | 'url') || 'dialog');
    setWfCreationUrl(wf?.creationUrl || "");
    setWfUrlError(null);
    setShowWorkflowDialog(true);
  };

  const validateUrl = (value: string): string | null => {
    if (!value.trim()) return "URL is required";
    try {
      const u = new URL(value.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return "URL must use http or https";
      return null;
    } catch {
      return "Enter a valid URL (e.g. https://forms.example.com/project)";
    }
  };

  const handleSaveWorkflow = async () => {
    if (!wfName.trim()) return;
    if (wfCreationMode === 'url') {
      const err = validateUrl(wfCreationUrl);
      if (err) { setWfUrlError(err); return; }
    }
    try {
      const payload = {
        name: wfName.trim(),
        description: wfDescription,
        isDefault: wfIsDefault,
        creationMode: wfCreationMode,
        creationUrl: wfCreationMode === 'url' ? wfCreationUrl.trim() : null,
      };
      if (editingWorkflow) {
        await updateWorkflowMeta.mutateAsync({ id: editingWorkflow.id, ...payload });
        toast({ title: "Updated", description: "Workflow updated" });
      } else {
        const created = await createWorkflow.mutateAsync(payload);
        setSelectedWorkflowId(created.id);
        toast({ title: "Created", description: "Workflow created with default steps" });
      }
      setShowWorkflowDialog(false);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save workflow", variant: "destructive" });
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!workflowToDelete) return;
    try {
      await deleteWorkflow.mutateAsync(workflowToDelete.id);
      if (selectedWorkflowId === workflowToDelete.id) setSelectedWorkflowId(null);
      toast({ title: "Deleted", description: "Workflow deleted" });
      setWorkflowToDelete(null);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete workflow", variant: "destructive" });
    }
  };

  const handleSetDefault = async (wf: ProjectWorkflow) => {
    try {
      await updateWorkflowMeta.mutateAsync({ id: wf.id, isDefault: true });
      toast({ title: "Default updated", description: `${wf.name} is now the default workflow` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to set default", variant: "destructive" });
    }
  };

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

  const steps = workflowSteps || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Project Workflow Steps
              </CardTitle>
              <CardDescription>
                Define one or more project lifecycle workflows. Choose the workflow when creating a project.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => openWorkflowDialog(null)} data-testid="button-create-project-workflow">
                <Plus className="h-4 w-4 mr-1" />
                New Workflow
              </Button>
            </div>
          </div>
          <div className="flex flex-row items-center gap-2 flex-wrap pt-2 border-t">
            <Label className="text-sm">Workflow:</Label>
            <Select
              value={selectedWorkflowId ? String(selectedWorkflowId) : ''}
              onValueChange={(v) => setSelectedWorkflowId(Number(v))}
              disabled={workflowsLoading}
            >
              <SelectTrigger className="w-64" data-testid="select-project-workflow">
                <SelectValue placeholder="Select a workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map(wf => (
                  <SelectItem key={wf.id} value={String(wf.id)} data-testid={`option-project-workflow-${wf.id}`}>
                    {wf.name}{wf.isDefault ? ' (Default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWorkflow && (
              <>
                <Button variant="ghost" size="sm" onClick={() => openWorkflowDialog(selectedWorkflow)} data-testid="button-edit-project-workflow">
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                {!selectedWorkflow.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(selectedWorkflow)} data-testid="button-set-default-project-workflow">
                    <Star className="h-4 w-4 mr-1" /> Set Default
                  </Button>
                )}
                {!selectedWorkflow.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setWorkflowToDelete(selectedWorkflow)} data-testid="button-delete-project-workflow">
                    <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Delete
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(true)}>
                  <RotateCw className="h-4 w-4 mr-1" /> Reset Steps
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAddStep(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Step
                </Button>
              </>
            )}
          </div>
          {selectedWorkflow?.description && (
            <p className="text-sm text-muted-foreground">{selectedWorkflow.description}</p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : steps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No workflow steps configured. Click "Reset Steps" to start with the standard workflow.
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

      <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWorkflow ? 'Edit Workflow' : 'New Project Workflow'}</DialogTitle>
            <DialogDescription>
              {editingWorkflow ? 'Update workflow name and settings' : 'Create a new named project workflow with default steps'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={wfName} onChange={(e) => setWfName(e.target.value)} placeholder="e.g., Agile Delivery" data-testid="input-pw-name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={wfDescription} onChange={(e) => setWfDescription(e.target.value)} placeholder="What is this workflow for?" className="resize-none" data-testid="input-pw-description" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="pw-default" checked={wfIsDefault} onCheckedChange={(v) => setWfIsDefault(!!v)} disabled={!!editingWorkflow?.isDefault} />
              <Label htmlFor="pw-default" className="cursor-pointer">Set as default workflow</Label>
            </div>
            <div className="space-y-2 pt-2 border-t">
              <Label>New item form</Label>
              <Select
                value={wfCreationMode}
                onValueChange={(v) => { setWfCreationMode(v as 'dialog' | 'url'); setWfUrlError(null); }}
              >
                <SelectTrigger data-testid="select-pw-creation-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dialog">Built-in dialog</SelectItem>
                  <SelectItem value="url">Custom URL</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose what happens when users create a new project with this workflow.
              </p>
              {wfCreationMode === 'url' && (
                <div className="space-y-1">
                  <Input
                    value={wfCreationUrl}
                    onChange={(e) => { setWfCreationUrl(e.target.value); if (wfUrlError) setWfUrlError(null); }}
                    placeholder="https://forms.example.com/project"
                    data-testid="input-pw-creation-url"
                  />
                  {wfUrlError && <p className="text-xs text-destructive">{wfUrlError}</p>}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkflowDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveWorkflow} disabled={!wfName.trim() || createWorkflow.isPending || updateWorkflowMeta.isPending} data-testid="button-save-pw">
              {(createWorkflow.isPending || updateWorkflowMeta.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingWorkflow ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={workflowToDelete !== null} onOpenChange={() => setWorkflowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{workflowToDelete?.name}"? Any projects using this workflow will be reassigned to the default workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWorkflow} disabled={deleteWorkflow.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteWorkflow.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
