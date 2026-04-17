import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type WorkflowType = "intake" | "project";

type WorkflowSummary = {
  id: number;
  name: string;
  description?: string | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
};

type WorkflowStep = {
  id: number;
  workflowId: number | null;
  stepKey: string;
  position: number;
  label: string;
};

interface ChangeWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: WorkflowType;
  organizationId: number | undefined;
  recordId: number;
  currentWorkflowId: number | null | undefined;
  currentStepKey: string | null | undefined;
  onChanged?: () => void;
}

export function ChangeWorkflowDialog({
  open,
  onOpenChange,
  type,
  organizationId,
  recordId,
  currentWorkflowId,
  currentStepKey,
  onChanged,
}: ChangeWorkflowDialogProps) {
  const { toast } = useToast();
  const isIntake = type === "intake";
  const workflowsKey = isIntake
    ? ['/api/organizations', organizationId, 'intake-workflows']
    : ['/api/organizations', organizationId, 'project-workflows'];
  const workflowsUrl = isIntake
    ? `/api/organizations/${organizationId}/intake-workflows`
    : `/api/organizations/${organizationId}/project-workflows`;
  const stepsUrlBase = isIntake
    ? `/api/organizations/${organizationId}/intake-workflow`
    : `/api/organizations/${organizationId}/project-workflow`;
  const changeUrl = isIntake
    ? `/api/project-intakes/${recordId}/change-workflow`
    : `/api/projects/${recordId}/change-workflow`;

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [stepStrategy, setStepStrategy] = useState<"preserve" | "reset">("preserve");

  useEffect(() => {
    if (open) {
      setSelectedWorkflowId(null);
      setStepStrategy("preserve");
    }
  }, [open]);

  const { data: workflows = [], isLoading: workflowsLoading } = useQuery<WorkflowSummary[]>({
    queryKey: workflowsKey,
    queryFn: async () => {
      const res = await apiRequest("GET", workflowsUrl);
      return res.json();
    },
    enabled: open && !!organizationId,
  });

  const { data: targetSteps = [], isLoading: stepsLoading } = useQuery<WorkflowStep[]>({
    queryKey: [stepsUrlBase, { workflowId: selectedWorkflowId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `${stepsUrlBase}?workflowId=${selectedWorkflowId}`);
      return res.json();
    },
    enabled: open && !!organizationId && !!selectedWorkflowId,
  });

  const availableWorkflows = useMemo(
    () => workflows.filter(w => w.isActive !== false && w.id !== currentWorkflowId),
    [workflows, currentWorkflowId],
  );

  const stepExistsInTarget = useMemo(() => {
    if (!currentStepKey || targetSteps.length === 0) return false;
    return targetSteps.some(s => s.stepKey === currentStepKey);
  }, [targetSteps, currentStepKey]);

  const matchedStep = useMemo(() => targetSteps.find(s => s.stepKey === currentStepKey), [targetSteps, currentStepKey]);
  const firstStep = targetSteps[0];

  const effectiveStrategy: "preserve" | "reset" = stepExistsInTarget ? stepStrategy : "reset";

  const changeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkflowId) throw new Error("Select a target workflow");
      const res = await apiRequest("POST", changeUrl, {
        workflowId: selectedWorkflowId,
        resetToFirstStep: effectiveStrategy === "reset",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Workflow changed",
        description:
          effectiveStrategy === "preserve"
            ? "The current step was preserved in the new workflow."
            : `Moved to "${firstStep?.label ?? firstStep?.stepKey ?? "first step"}" in the new workflow.`,
      });
      if (isIntake) {
        queryClient.invalidateQueries({ queryKey: ["/api/project-intakes"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", organizationId, isIntake ? "intake-workflow" : "project-workflow"] });
      onChanged?.();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't change workflow", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-change-workflow">
        <DialogHeader>
          <DialogTitle>Change workflow</DialogTitle>
          <DialogDescription>
            Move this {isIntake ? "intake" : "project"} to a different workflow. The current
            {isIntake ? " step" : " status"} will be preserved when possible, otherwise it will be reset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Target workflow</Label>
            {workflowsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows…
              </div>
            ) : availableWorkflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other workflows available. Create one in Settings to switch.</p>
            ) : (
              <Select
                value={selectedWorkflowId ? String(selectedWorkflowId) : ""}
                onValueChange={(v) => setSelectedWorkflowId(Number(v))}
              >
                <SelectTrigger data-testid="select-target-workflow">
                  <SelectValue placeholder="Choose a workflow…" />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkflows.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}{w.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedWorkflowId && (
            <div className="rounded-md border p-3 text-sm space-y-3">
              {stepsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking steps…
                </div>
              ) : stepExistsInTarget ? (
                <>
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Current {isIntake ? "step" : "status"} exists in the new workflow</p>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        "{matchedStep?.label ?? currentStepKey}" — choose how to proceed.
                      </p>
                    </div>
                  </div>
                  <RadioGroup value={stepStrategy} onValueChange={(v) => setStepStrategy(v as "preserve" | "reset")}>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="preserve" id="strategy-preserve" className="mt-1" />
                      <Label htmlFor="strategy-preserve" className="font-normal cursor-pointer">
                        Keep current {isIntake ? "step" : "status"} ("{matchedStep?.label ?? currentStepKey}")
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="reset" id="strategy-reset" className="mt-1" />
                      <Label htmlFor="strategy-reset" className="font-normal cursor-pointer">
                        Reset to first step ("{firstStep?.label ?? firstStep?.stepKey ?? "first step"}")
                      </Label>
                    </div>
                  </RadioGroup>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">No matching {isIntake ? "step" : "status"} in the new workflow</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      The current value{currentStepKey ? ` ("${currentStepKey}")` : ""} doesn't exist in the new workflow.
                      It will be reset to <span className="font-medium">"{firstStep?.label ?? firstStep?.stepKey ?? "first step"}"</span>.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={changeMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => changeMutation.mutate()}
            disabled={!selectedWorkflowId || stepsLoading || changeMutation.isPending || availableWorkflows.length === 0}
            data-testid="button-confirm-change-workflow"
          >
            {changeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Changing…
              </>
            ) : (
              "Change workflow"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
