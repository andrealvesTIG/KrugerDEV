import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, GitBranch, Plus, Pencil, RotateCw, X, Mail } from "lucide-react";
import { AVAILABLE_INTAKE_FIELDS, useIntakeWorkflows } from "@/hooks/use-intake-workflow";
import type { IntakeWorkflow, IntakeWorkflowStep } from "@shared/schema";

export function IntakeWorkflowSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const { workflows, isLoading: workflowsLoading, createWorkflow, updateWorkflowMeta, deleteWorkflow } = useIntakeWorkflows();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [showWorkflowDialog, setShowWorkflowDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<IntakeWorkflow | null>(null);
  const [wfName, setWfName] = useState("");
  const [wfDescription, setWfDescription] = useState("");
  const [wfIsDefault, setWfIsDefault] = useState(false);
  const [wfCreationMode, setWfCreationMode] = useState<'dialog' | 'url'>('dialog');
  const [wfCreationUrl, setWfCreationUrl] = useState("");
  const [wfUrlError, setWfUrlError] = useState<string | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<IntakeWorkflow | null>(null);

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
    ? ['/api/organizations', organizationId, 'intake-workflow', { workflowId: selectedWorkflowId }]
    : ['/api/organizations', organizationId, 'intake-workflow'];

  const [editingStep, setEditingStep] = useState<IntakeWorkflowStep | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHelpText, setEditHelpText] = useState("");
  const [editRequiredFields, setEditRequiredFields] = useState<string[]>([]);
  const [editNotifyOnEntry, setEditNotifyOnEntry] = useState<string[]>([]);
  const [editNotifyOnExit, setEditNotifyOnExit] = useState<string[]>([]);
  const [entryEmailDraft, setEntryEmailDraft] = useState("");
  const [exitEmailDraft, setExitEmailDraft] = useState("");
  const [entryEmailError, setEntryEmailError] = useState<string | null>(null);
  const [exitEmailError, setExitEmailError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepKey, setNewStepKey] = useState("");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [stepToDelete, setStepToDelete] = useState<IntakeWorkflowStep | null>(null);

  const { data: workflowSteps, isLoading } = useQuery<IntakeWorkflowStep[]>({
    queryKey: wfQueryKey,
    enabled: !!selectedWorkflowId,
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/intake-workflow${wfQuery}`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async (steps: Partial<IntakeWorkflowStep>[]) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/intake-workflow${wfQuery}`, { steps });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wfQueryKey });
      toast({ title: "Saved", description: "Workflow configuration updated" });
      setEditingStep(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update workflow", variant: "destructive" });
    }
  });

  const resetWorkflowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/organizations/${organizationId}/intake-workflow/reset${wfQuery}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wfQueryKey });
      toast({ title: "Reset", description: "Workflow restored to default configuration" });
      setShowResetConfirm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset workflow", variant: "destructive" });
    }
  });

  const openWorkflowDialog = (wf: IntakeWorkflow | null) => {
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
      return "Enter a valid URL (e.g. https://forms.example.com/intake)";
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

  const handleSetDefault = async (wf: IntakeWorkflow) => {
    try {
      await updateWorkflowMeta.mutateAsync({ id: wf.id, isDefault: true });
      toast({ title: "Default updated", description: `${wf.name} is now the default workflow` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to set default", variant: "destructive" });
    }
  };

  const openEditDialog = (step: IntakeWorkflowStep) => {
    setEditingStep(step);
    setEditLabel(step.label);
    setEditDescription(step.description || "");
    setEditHelpText(step.helpText || "");
    setEditRequiredFields(step.requiredFields || []);
    setEditNotifyOnEntry(step.notifyOnEntry || []);
    setEditNotifyOnExit(step.notifyOnExit || []);
    setEntryEmailDraft("");
    setExitEmailDraft("");
    setEntryEmailError(null);
    setExitEmailError(null);
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const addEmailToList = (
    raw: string,
    list: string[],
    setList: (v: string[]) => void,
    setDraft: (v: string) => void,
    setError: (v: string | null) => void,
  ) => {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }
    if (list.map(e => e.toLowerCase()).includes(trimmed)) {
      setError("Email is already in the list");
      return;
    }
    setList([...list, trimmed]);
    setDraft("");
    setError(null);
  };

  const stepToPayload = (s: IntakeWorkflowStep) => ({
    stepKey: s.stepKey,
    position: s.position,
    label: s.label,
    description: s.description,
    helpText: s.helpText,
    requiredFields: s.requiredFields,
    notifyOnEntry: s.notifyOnEntry || [],
    notifyOnExit: s.notifyOnExit || [],
    isActive: s.isActive,
  });

  const handleSaveStep = () => {
    if (!editingStep || !workflowSteps) return;

    const updatedSteps = workflowSteps.map(s => {
      if (s.stepKey === editingStep.stepKey) {
        return {
          stepKey: s.stepKey,
          position: s.position,
          label: editLabel,
          description: editDescription,
          helpText: editHelpText,
          requiredFields: editRequiredFields,
          notifyOnEntry: editNotifyOnEntry,
          notifyOnExit: editNotifyOnExit,
          isActive: s.isActive,
        };
      }
      return stepToPayload(s);
    });

    updateWorkflowMutation.mutate(updatedSteps);
  };

  const toggleRequiredField = (fieldKey: string) => {
    setEditRequiredFields(prev => 
      prev.includes(fieldKey) 
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey]
    );
  };

  const handleAddStep = () => {
    if (!newStepLabel.trim() || !workflowSteps) return;
    
    const stepKey = newStepKey.trim() || `custom_${Date.now()}`;
    const maxPosition = Math.max(...workflowSteps.map(s => s.position), -1);
    
    const newStep = {
      stepKey,
      position: maxPosition + 1,
      label: newStepLabel.trim(),
      description: newStepDescription.trim() || undefined,
      helpText: undefined,
      requiredFields: [],
      notifyOnEntry: [],
      notifyOnExit: [],
      isActive: true,
    };

    const updatedSteps = [
      ...workflowSteps.map(stepToPayload),
      newStep,
    ];
    
    updateWorkflowMutation.mutate(updatedSteps);
    setShowAddStep(false);
    setNewStepKey("");
    setNewStepLabel("");
    setNewStepDescription("");
  };

  const handleDeleteStep = () => {
    if (!stepToDelete || !workflowSteps) return;
    
    const updatedSteps = workflowSteps
      .filter(s => s.stepKey !== stepToDelete.stepKey)
      .map((s, idx) => ({ ...stepToPayload(s), position: idx }));
    
    updateWorkflowMutation.mutate(updatedSteps);
    setStepToDelete(null);
  };

  const handleToggleActive = (step: IntakeWorkflowStep) => {
    if (!workflowSteps) return;
    
    const updatedSteps = workflowSteps.map(s => ({
      ...stepToPayload(s),
      isActive: s.stepKey === step.stepKey ? !s.isActive : s.isActive,
    }));

    updateWorkflowMutation.mutate(updatedSteps);
  };

  const handleMoveStep = (step: IntakeWorkflowStep, direction: 'up' | 'down') => {
    if (!workflowSteps) return;
    
    const sorted = [...workflowSteps].sort((a, b) => a.position - b.position);
    const currentIndex = sorted.findIndex(s => s.stepKey === step.stepKey);
    
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === sorted.length - 1) return;
    
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    [sorted[currentIndex], sorted[swapIndex]] = [sorted[swapIndex], sorted[currentIndex]];
    
    const updatedSteps = sorted.map((s, idx) => ({ ...stepToPayload(s), position: idx }));

    updateWorkflowMutation.mutate(updatedSteps);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sortedSteps = [...(workflowSteps || [])].sort((a, b) => a.position - b.position);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Intake Workflow Configuration
          </CardTitle>
          <CardDescription>
            Customize the intake workflow steps and required fields for your organization
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {workflows.length > 0 && (
            <Select
              value={selectedWorkflowId ? String(selectedWorkflowId) : ''}
              onValueChange={(v) => setSelectedWorkflowId(Number(v))}
            >
              <SelectTrigger className="w-[260px]" data-testid="select-active-workflow">
                <SelectValue placeholder="Select workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map(w => (
                  <SelectItem key={w.id} value={String(w.id)} data-testid={`option-workflow-${w.id}`}>
                    <div className="flex items-center gap-2 pr-2">
                      <span className="truncate">{w.name}</span>
                      {w.isDefault && <Badge variant="secondary" className="text-[10px] px-1 py-0">Default</Badge>}
                      {w.agentTarget === 'powerbi' && <Badge variant="outline" className="text-[10px] px-1 py-0">Power BI</Badge>}
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
            data-testid="button-new-workflow"
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
                data-testid="button-edit-workflow"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              {!selectedWorkflow.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSetDefault(selectedWorkflow)}
                  data-testid="button-set-default-workflow"
                >
                  Set Default
                </Button>
              )}
              {workflows.length > 1 && !selectedWorkflow.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWorkflowToDelete(selectedWorkflow)}
                  data-testid="button-delete-workflow"
                >
                  <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                  Delete
                </Button>
              )}
            </>
          )}
          {selectedWorkflow && selectedWorkflow.creationMode === 'dialog' && !selectedWorkflow.agentTarget && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowAddStep(true)}
                data-testid="button-add-step"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResetConfirm(true)}
                data-testid="button-reset-workflow"
              >
                <RotateCw className="h-4 w-4 mr-2" />
                Reset to Defaults
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {selectedWorkflow && (selectedWorkflow.creationMode === 'url' || selectedWorkflow.agentTarget) && (
          <div className="mb-4 p-3 rounded-md border bg-muted/30 text-sm">
            {selectedWorkflow.agentTarget === 'powerbi' ? (
              <p>This workflow opens the <strong>Power BI agent</strong> instead of the standard intake form. No step configuration is needed.</p>
            ) : (
              <p>This workflow opens an external URL: <code className="text-xs">{selectedWorkflow.creationUrl}</code></p>
            )}
          </div>
        )}
        <div className="space-y-3">
          {sortedSteps.map((step, index) => (
            <div
              key={step.stepKey}
              className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-lg border hover-elevate overflow-hidden ${step.isActive === false ? 'opacity-50' : ''}`}
              data-testid={`workflow-step-${step.stepKey}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(step, 'up')}
                    disabled={index === 0 || updateWorkflowMutation.isPending}
                    data-testid={`button-move-up-${step.stepKey}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleMoveStep(step, 'down')}
                    disabled={index === sortedSteps.length - 1 || updateWorkflowMutation.isPending}
                    data-testid={`button-move-down-${step.stepKey}`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </Button>
                </div>
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-medium text-sm shrink-0">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{step.label}</span>
                    {step.isActive === false && (
                      <Badge variant="outline" className="text-xs">Disabled</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {step.description || "No description"}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {step.requiredFields && step.requiredFields.length > 0 ? (
                      step.requiredFields.map(field => {
                        const fieldInfo = AVAILABLE_INTAKE_FIELDS.find(f => f.key === field);
                        return (
                          <Badge key={field} variant="secondary" className="text-xs">
                            {fieldInfo?.label || field}
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">No required fields</span>
                    )}
                    {(() => {
                      const entryRecipients = step.notifyOnEntry || [];
                      const exitRecipients = step.notifyOnExit || [];
                      const totalRecipients = entryRecipients.length + exitRecipients.length;
                      if (totalRecipients === 0) return null;
                      return (
                        <HoverCard openDelay={150} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-xs text-muted-foreground hover-elevate focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              data-testid={`badge-notifications-${step.stepKey}`}
                              aria-label={`${entryRecipients.length} entry, ${exitRecipients.length} exit notification recipients`}
                            >
                              <Mail className="h-3 w-3" />
                              <span data-testid={`text-notifications-count-${step.stepKey}`}>
                                {entryRecipients.length} entry / {exitRecipients.length} exit
                              </span>
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="top"
                            align="start"
                            className="w-72 p-3"
                            data-testid={`popover-notifications-${step.stepKey}`}
                          >
                            <div className="space-y-3">
                              <div>
                                <div className="text-xs font-medium mb-1">
                                  On entry ({entryRecipients.length})
                                </div>
                                {entryRecipients.length > 0 ? (
                                  <ul className="space-y-0.5">
                                    {entryRecipients.map((email, idx) => (
                                      <li
                                        key={`entry-${email}`}
                                        className="text-xs text-muted-foreground break-all"
                                        data-testid={`text-notify-entry-${step.stepKey}-${idx}`}
                                      >
                                        {email}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No recipients</p>
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-medium mb-1">
                                  On exit ({exitRecipients.length})
                                </div>
                                {exitRecipients.length > 0 ? (
                                  <ul className="space-y-0.5">
                                    {exitRecipients.map((email, idx) => (
                                      <li
                                        key={`exit-${email}`}
                                        className="text-xs text-muted-foreground break-all"
                                        data-testid={`text-notify-exit-${step.stepKey}-${idx}`}
                                      >
                                        {email}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No recipients</p>
                                )}
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <Switch
                  checked={step.isActive !== false}
                  onCheckedChange={() => handleToggleActive(step)}
                  disabled={updateWorkflowMutation.isPending}
                  data-testid={`switch-step-active-${step.stepKey}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditDialog(step)}
                  data-testid={`button-edit-step-${step.stepKey}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStepToDelete(step)}
                  disabled={updateWorkflowMutation.isPending}
                  data-testid={`button-delete-step-${step.stepKey}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={editingStep !== null} onOpenChange={() => setEditingStep(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Workflow Step</DialogTitle>
            <DialogDescription>
              Customize the step name and required fields. Step key: {editingStep?.stepKey}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Step Name</Label>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Enter step name"
                data-testid="input-step-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description of this step"
                className="resize-none"
                data-testid="input-step-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Help Text</Label>
              <Textarea
                value={editHelpText}
                onChange={(e) => setEditHelpText(e.target.value)}
                placeholder="Additional guidance for users"
                className="resize-none"
                data-testid="input-step-helptext"
              />
            </div>
            {(() => {
              const renderEmailEditor = (
                kind: 'entry' | 'exit',
                list: string[],
                setList: (v: string[]) => void,
                draft: string,
                setDraft: (v: string) => void,
                error: string | null,
                setError: (v: string | null) => void,
              ) => {
                const label = kind === 'entry' ? 'Notify on entry' : 'Notify on exit';
                const helper = kind === 'entry'
                  ? 'Send an email to these recipients when an intake enters this step.'
                  : 'Send an email to these recipients when an intake leaves this step.';
                const testidPrefix = kind === 'entry' ? 'notify-entry' : 'notify-exit';
                return (
                  <div className="space-y-2" data-testid={`section-${testidPrefix}`}>
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {label}
                    </Label>
                    <p className="text-sm text-muted-foreground">{helper}</p>
                    <div className="flex flex-wrap gap-2">
                      {list.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">No recipients</span>
                      )}
                      {list.map(email => (
                        <Badge
                          key={email}
                          variant="secondary"
                          className="flex items-center gap-1 pl-2 pr-1 py-1 text-xs"
                          data-testid={`chip-${testidPrefix}-${email}`}
                        >
                          <span className="truncate max-w-[200px]">{email}</span>
                          <button
                            type="button"
                            onClick={() => setList(list.filter(e => e !== email))}
                            className="hover:bg-muted-foreground/10 rounded-sm p-0.5"
                            aria-label={`Remove ${email}`}
                            data-testid={`button-remove-${testidPrefix}-${email}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addEmailToList(draft, list, setList, setDraft, setError);
                          }
                        }}
                        placeholder="name@example.com"
                        data-testid={`input-${testidPrefix}-email`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addEmailToList(draft, list, setList, setDraft, setError)}
                        disabled={!draft.trim()}
                        data-testid={`button-add-${testidPrefix}`}
                      >
                        Add
                      </Button>
                    </div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                  </div>
                );
              };
              return (
                <>
                  {renderEmailEditor('entry', editNotifyOnEntry, setEditNotifyOnEntry, entryEmailDraft, setEntryEmailDraft, entryEmailError, setEntryEmailError)}
                  {renderEmailEditor('exit', editNotifyOnExit, setEditNotifyOnExit, exitEmailDraft, setExitEmailDraft, exitEmailError, setExitEmailError)}
                </>
              );
            })()}
            <div className="space-y-2">
              <Label>Required Fields</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Select which fields must be completed before advancing past this step
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {AVAILABLE_INTAKE_FIELDS.map(field => (
                  <div 
                    key={field.key} 
                    className="flex items-center space-x-2"
                    data-testid={`checkbox-field-${field.key}`}
                  >
                    <Checkbox
                      id={`field-${field.key}`}
                      checked={editRequiredFields.includes(field.key)}
                      onCheckedChange={() => toggleRequiredField(field.key)}
                    />
                    <label
                      htmlFor={`field-${field.key}`}
                      className="text-sm cursor-pointer"
                    >
                      {field.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveStep} 
              disabled={updateWorkflowMutation.isPending}
              data-testid="button-save-step"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Workflow to Defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore all workflow steps to their default names and required fields. 
              Your customizations will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetWorkflowMutation.mutate()}
              disabled={resetWorkflowMutation.isPending}
            >
              {resetWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset to Defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showAddStep} onOpenChange={setShowAddStep}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Workflow Step</DialogTitle>
            <DialogDescription>
              Create a new step in your intake workflow
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Step Name *</Label>
              <Input
                value={newStepLabel}
                onChange={(e) => setNewStepLabel(e.target.value)}
                placeholder="e.g., Security Review"
                data-testid="input-new-step-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Step Key (optional)</Label>
              <Input
                value={newStepKey}
                onChange={(e) => setNewStepKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder="e.g., security_review"
                data-testid="input-new-step-key"
              />
              <p className="text-xs text-muted-foreground">
                A unique identifier for this step. Leave blank to auto-generate.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newStepDescription}
                onChange={(e) => setNewStepDescription(e.target.value)}
                placeholder="Brief description of this step"
                className="resize-none"
                data-testid="input-new-step-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStep(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddStep} 
              disabled={!newStepLabel.trim() || updateWorkflowMutation.isPending}
              data-testid="button-confirm-add-step"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWorkflowDialog} onOpenChange={setShowWorkflowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWorkflow ? 'Edit Workflow' : 'New Intake Workflow'}</DialogTitle>
            <DialogDescription>
              {editingWorkflow ? 'Update workflow name and settings' : 'Create a new named intake workflow with default steps'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={wfName} onChange={(e) => setWfName(e.target.value)} placeholder="e.g., Standard Intake" data-testid="input-workflow-name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={wfDescription} onChange={(e) => setWfDescription(e.target.value)} placeholder="What is this workflow for?" className="resize-none" data-testid="input-workflow-description" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="wf-default" checked={wfIsDefault} onCheckedChange={(v) => setWfIsDefault(!!v)} disabled={!!editingWorkflow?.isDefault} />
              <Label htmlFor="wf-default" className="cursor-pointer">Set as default workflow</Label>
            </div>
            <div className="space-y-2 pt-2 border-t">
              <Label>New item form</Label>
              <Select
                value={wfCreationMode}
                onValueChange={(v) => { setWfCreationMode(v as 'dialog' | 'url'); setWfUrlError(null); }}
              >
                <SelectTrigger data-testid="select-wf-creation-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dialog">Built-in dialog</SelectItem>
                  <SelectItem value="url">Custom URL</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose what happens when users create a new intake with this workflow.
              </p>
              {wfCreationMode === 'url' && (
                <div className="space-y-1">
                  <Input
                    value={wfCreationUrl}
                    onChange={(e) => { setWfCreationUrl(e.target.value); if (wfUrlError) setWfUrlError(null); }}
                    placeholder="https://forms.example.com/intake"
                    data-testid="input-wf-creation-url"
                  />
                  {wfUrlError && <p className="text-xs text-destructive">{wfUrlError}</p>}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkflowDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveWorkflow} disabled={!wfName.trim() || createWorkflow.isPending || updateWorkflowMeta.isPending} data-testid="button-save-workflow">
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
              Delete "{workflowToDelete?.name}"? Any intakes using this workflow will be reassigned to the default workflow.
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

      <AlertDialog open={stepToDelete !== null} onOpenChange={() => setStepToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow Step?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{stepToDelete?.label}" from the workflow? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStep}
              disabled={updateWorkflowMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {updateWorkflowMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}