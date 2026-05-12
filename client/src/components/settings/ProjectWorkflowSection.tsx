import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Plus, Pencil, RotateCw, GripVertical, LockIcon } from "lucide-react";
import { useProjectWorkflows } from "@/hooks/use-project-workflows";
import { useCustomFieldDefinitions } from "@/hooks/use-custom-fields";
import { PROJECT_FORM_FIELDS, PROJECT_FORM_FIELD_BY_KEY } from "@shared/projectFormRegistry";
import type { ProjectWorkflow, ProjectWorkflowStep, CustomFieldDefinition } from "@shared/schema";

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

  // Auto-select default workflow when list loads
  useEffect(() => {
    if (!selectedWorkflowId && workflows.length > 0) {
      const defaultWf = workflows.find(w => w.isDefault) || workflows[0];
      setSelectedWorkflowId(defaultWf.id);
    } else if (selectedWorkflowId && workflows.length > 0 && !workflows.find(w => w.id === selectedWorkflowId)) {
      const defaultWf = workflows.find(w => w.isDefault) || workflows[0];
      setSelectedWorkflowId(defaultWf.id);
    }
  }, [workflows, selectedWorkflowId]);

  const selectedWorkflow = useMemo(() => workflows.find(w => w.id === selectedWorkflowId) || null, [workflows, selectedWorkflowId]);
  const wfQuery = selectedWorkflowId ? `?workflowId=${selectedWorkflowId}` : '';
  const wfQueryKey: readonly unknown[] = selectedWorkflowId
    ? ['/api/organizations', organizationId, 'project-workflow', { workflowId: selectedWorkflowId }]
    : ['/api/organizations', organizationId, 'project-workflow'];

  const { data: allCustomFieldDefs = [] } = useCustomFieldDefinitions(organizationId);
  const projectCustomFields = useMemo<CustomFieldDefinition[]>(
    // Project forms render both project-scoped and intake-scoped custom
    // fields (intake CFs are carried over after conversion), so both are
    // valid choices for a project workflow step's required-field list.
    () => allCustomFieldDefs.filter(d => {
      const e = d.entityType || 'project';
      return e === 'project' || e === 'intake';
    }),
    [allCustomFieldDefs],
  );
  const fieldKeyLabel = (key: string): string => {
    if (key.startsWith('cf:')) {
      const id = Number(key.slice(3));
      const def = projectCustomFields.find(d => d.id === id);
      return def ? `${def.name} (custom)` : key;
    }
    return PROJECT_FORM_FIELD_BY_KEY[key]?.label || key;
  };

  const [editingStep, setEditingStep] = useState<ProjectWorkflowStep | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHelpText, setEditHelpText] = useState("");
  const [editRequiredFields, setEditRequiredFields] = useState<string[]>([]);
  const [editIsTerminal, setEditIsTerminal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepKey, setNewStepKey] = useState("");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [newIsTerminal, setNewIsTerminal] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<ProjectWorkflowStep | null>(null);

  const toggleRequiredField = (k: string) =>
    setEditRequiredFields(prev => prev.includes(k) ? prev.filter(f => f !== k) : [...prev, k]);

  const { data: workflowSteps, isLoading } = useQuery<ProjectWorkflowStep[]>({
    queryKey: wfQueryKey,
    enabled: !!selectedWorkflowId,
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/project-workflow${wfQuery}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async (steps: Partial<ProjectWorkflowStep>[]) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/project-workflow${wfQuery}`, { steps });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wfQueryKey });
      toast({ title: "Saved", description: "Project workflow configuration updated" });
      setEditingStep(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update project workflow", variant: "destructive" });
    },
  });

  const resetWorkflowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/organizations/${organizationId}/project-workflow/reset${wfQuery}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wfQueryKey });
      toast({ title: "Reset", description: "Project workflow reset to defaults" });
      setShowResetConfirm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset project workflow", variant: "destructive" });
    },
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
      return "Enter a valid URL (e.g. https://forms.example.com/projects)";
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

  const stepsForUpdate = (rows: ProjectWorkflowStep[]) =>
    rows.map((s, idx) => ({
      stepKey: s.stepKey,
      label: s.label,
      description: s.description,
      helpText: (s as any).helpText ?? null,
      requiredFields: (s as any).requiredFields ?? [],
      position: idx,
      isTerminal: s.isTerminal,
      isActive: s.isActive,
    }));

  const handleEditSave = () => {
    if (!editingStep || !workflowSteps) return;
    const updatedSteps = workflowSteps.map(s =>
      s.id === editingStep.id
        ? { ...s, label: editLabel, description: editDescription, helpText: editHelpText || null, requiredFields: editRequiredFields, isTerminal: editIsTerminal }
        : s
    );
    updateWorkflowMutation.mutate(stepsForUpdate(updatedSteps));
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
      helpText: null,
      requiredFields: [],
      position: maxPosition + 1,
      isTerminal: newIsTerminal,
      isActive: true,
    };
    updateWorkflowMutation.mutate([...stepsForUpdate(workflowSteps), newStep]);
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
    updateWorkflowMutation.mutate(stepsForUpdate(remaining));
    setStepToDelete(null);
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (!workflowSteps) return;
    const sorted = [...workflowSteps].sort((a, b) => a.position - b.position);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    [sorted[index], sorted[targetIndex]] = [sorted[targetIndex], sorted[index]];
    updateWorkflowMutation.mutate(stepsForUpdate(sorted));
  };

  if (workflowsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sortedSteps = [...(workflowSteps || [])].sort((a, b) => a.position - b.position);
  const isUrlMode = selectedWorkflow?.creationMode === 'url';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Project Workflow Steps</CardTitle>
            <CardDescription>
              Define the lifecycle stages that projects move through. These steps appear in the project status bar.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {workflows.length > 0 && (
              <Select
                value={selectedWorkflowId ? String(selectedWorkflowId) : ''}
                onValueChange={(v) => setSelectedWorkflowId(Number(v))}
              >
                <SelectTrigger className="w-[260px]" data-testid="select-active-project-workflow">
                  <SelectValue placeholder="Select workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map(w => (
                    <SelectItem key={w.id} value={String(w.id)} data-testid={`option-project-workflow-${w.id}`}>
                      <div className="flex items-center gap-2 pr-2">
                        <span className="truncate">{w.name}</span>
                        {w.isDefault && <Badge variant="secondary" className="text-[10px] px-1 py-0">Default</Badge>}
                        {w.creationMode === 'url' && <Badge variant="outline" className="text-[10px] px-1 py-0">URL</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => openWorkflowDialog(null)}
              data-testid="button-new-project-workflow"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Workflow
            </Button>
            {selectedWorkflow && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openWorkflowDialog(selectedWorkflow)}
                  data-testid="button-edit-project-workflow"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                {!selectedWorkflow.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetDefault(selectedWorkflow)}
                    data-testid="button-set-default-project-workflow"
                  >
                    Set Default
                  </Button>
                )}
                {workflows.length > 1 && !selectedWorkflow.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWorkflowToDelete(selectedWorkflow)}
                    data-testid="button-delete-project-workflow"
                  >
                    <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                    Delete
                  </Button>
                )}
              </>
            )}
            {selectedWorkflow && !isUrlMode && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(true)}>
                  <RotateCw className="h-4 w-4 mr-1" />
                  Reset to Defaults
                </Button>
                <Button size="sm" onClick={() => setShowAddStep(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedWorkflow && isUrlMode && (
            <div className="mb-4 p-3 rounded-md border bg-muted/30 text-sm">
              This workflow opens an external URL: <code className="text-xs">{selectedWorkflow.creationUrl}</code>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedSteps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {isUrlMode
                ? 'No step configuration is needed for URL-based workflows.'
                : 'No workflow steps configured. Click "Reset to Defaults" to start with the standard workflow.'}
            </p>
          ) : (
            <div className="space-y-2">
              {sortedSteps.map((step, index) => (
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
                      disabled={index === sortedSteps.length - 1 || updateWorkflowMutation.isPending}
                    >
                      <span className="text-xs">▼</span>
                    </Button>
                  </div>

                  <GripVertical className="h-4 w-4 text-muted-foreground" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
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
                    <div className="flex flex-wrap gap-1 mt-1">
                      {((step as any).requiredFields || []).length > 0 ? (
                        ((step as any).requiredFields as string[]).map(f => (
                          <Badge key={f} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {fieldKeyLabel(f)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-[10px] text-muted-foreground">No required fields</span>
                      )}
                    </div>
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
                        setEditHelpText((step as any).helpText || "");
                        setEditRequiredFields(((step as any).requiredFields || []) as string[]);
                        setEditIsTerminal(step.isTerminal ?? false);
                      }}
                      data-testid={`button-edit-project-step-${step.stepKey}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setStepToDelete(step)}
                      disabled={sortedSteps.length <= 2}
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Workflow Step</DialogTitle>
            <DialogDescription>Configure the step name, help text, required fields, and behavior.</DialogDescription>
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
            <div>
              <Label>Help Text</Label>
              <Textarea
                value={editHelpText}
                onChange={e => setEditHelpText(e.target.value)}
                placeholder="Additional guidance shown to users when they open this step"
                className="mt-1 resize-none"
                data-testid="input-project-step-helptext"
              />
            </div>
            <div className="space-y-2">
              <Label>Required Fields</Label>
              <p className="text-xs text-muted-foreground">
                Users must complete these fields before advancing past this step.
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded-md p-3">
                {PROJECT_FORM_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pf-${field.key}`}
                      checked={editRequiredFields.includes(field.key)}
                      onCheckedChange={() => toggleRequiredField(field.key)}
                      data-testid={`checkbox-project-required-${field.key}`}
                    />
                    <label htmlFor={`pf-${field.key}`} className="text-sm cursor-pointer">{field.label}</label>
                  </div>
                ))}
                {projectCustomFields.length > 0 && (
                  <div className="col-span-2 mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-t pt-2">
                    Custom Fields
                  </div>
                )}
                {projectCustomFields.map(def => {
                  const key = `cf:${def.id}`;
                  return (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`pf-${key}`}
                        checked={editRequiredFields.includes(key)}
                        onCheckedChange={() => toggleRequiredField(key)}
                        data-testid={`checkbox-project-required-${key}`}
                      />
                      <label htmlFor={`pf-${key}`} className="text-sm cursor-pointer">{def.name}</label>
                    </div>
                  );
                })}
              </div>
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
                onChange={e => setNewStepKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
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
              <Input value={wfName} onChange={(e) => setWfName(e.target.value)} placeholder="e.g., Standard Lifecycle" data-testid="input-project-workflow-name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={wfDescription} onChange={(e) => setWfDescription(e.target.value)} placeholder="What is this workflow for?" className="resize-none" data-testid="input-project-workflow-description" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="pwf-default" checked={wfIsDefault} onCheckedChange={(v) => setWfIsDefault(!!v)} disabled={!!editingWorkflow?.isDefault} />
              <Label htmlFor="pwf-default" className="cursor-pointer">Set as default workflow</Label>
            </div>
            <div className="space-y-2 pt-2 border-t">
              <Label>New project form</Label>
              <Select
                value={wfCreationMode}
                onValueChange={(v) => { setWfCreationMode(v as 'dialog' | 'url'); setWfUrlError(null); }}
              >
                <SelectTrigger data-testid="select-pwf-creation-mode">
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
                    placeholder="https://forms.example.com/projects"
                    data-testid="input-pwf-creation-url"
                  />
                  {wfUrlError && <p className="text-xs text-destructive">{wfUrlError}</p>}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkflowDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveWorkflow} disabled={!wfName.trim() || createWorkflow.isPending || updateWorkflowMeta.isPending} data-testid="button-save-project-workflow">
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
              Initiation → Planning → Execution → Monitoring → Closing.
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
