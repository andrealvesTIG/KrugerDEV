import { useState } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, GitBranch, Plus, Pencil, RotateCw } from "lucide-react";
import { AVAILABLE_INTAKE_FIELDS } from "@/hooks/use-intake-workflow";
import type { IntakeWorkflowStep } from "@shared/schema";

export function IntakeWorkflowSection({ organizationId }: { organizationId: number }) {
  const { toast } = useToast();
  const [editingStep, setEditingStep] = useState<IntakeWorkflowStep | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editHelpText, setEditHelpText] = useState("");
  const [editRequiredFields, setEditRequiredFields] = useState<string[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepKey, setNewStepKey] = useState("");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepDescription, setNewStepDescription] = useState("");
  const [stepToDelete, setStepToDelete] = useState<IntakeWorkflowStep | null>(null);

  const { data: workflowSteps, isLoading } = useQuery<IntakeWorkflowStep[]>({
    queryKey: ['/api/organizations', organizationId, 'intake-workflow'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organizationId}/intake-workflow`);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: async (steps: Partial<IntakeWorkflowStep>[]) => {
      return apiRequest('PUT', `/api/organizations/${organizationId}/intake-workflow`, { steps });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'intake-workflow'] });
      toast({ title: "Saved", description: "Workflow configuration updated" });
      setEditingStep(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update workflow", variant: "destructive" });
    }
  });

  const resetWorkflowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/organizations/${organizationId}/intake-workflow/reset`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'intake-workflow'] });
      toast({ title: "Reset", description: "Workflow restored to default configuration" });
      setShowResetConfirm(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset workflow", variant: "destructive" });
    }
  });

  const openEditDialog = (step: IntakeWorkflowStep) => {
    setEditingStep(step);
    setEditLabel(step.label);
    setEditDescription(step.description || "");
    setEditHelpText(step.helpText || "");
    setEditRequiredFields(step.requiredFields || []);
  };

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
          isActive: s.isActive,
        };
      }
      return {
        stepKey: s.stepKey,
        position: s.position,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      };
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
      isActive: true,
    };
    
    const updatedSteps = [
      ...workflowSteps.map(s => ({
        stepKey: s.stepKey,
        position: s.position,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      })),
      newStep
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
      .map((s, idx) => ({
        stepKey: s.stepKey,
        position: idx,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        requiredFields: s.requiredFields,
        isActive: s.isActive,
      }));
    
    updateWorkflowMutation.mutate(updatedSteps);
    setStepToDelete(null);
  };

  const handleToggleActive = (step: IntakeWorkflowStep) => {
    if (!workflowSteps) return;
    
    const updatedSteps = workflowSteps.map(s => ({
      stepKey: s.stepKey,
      position: s.position,
      label: s.label,
      description: s.description,
      helpText: s.helpText,
      requiredFields: s.requiredFields,
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
    
    const updatedSteps = sorted.map((s, idx) => ({
      stepKey: s.stepKey,
      position: idx,
      label: s.label,
      description: s.description,
      helpText: s.helpText,
      requiredFields: s.requiredFields,
      isActive: s.isActive,
    }));
    
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
        </div>
      </CardHeader>
      <CardContent>
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