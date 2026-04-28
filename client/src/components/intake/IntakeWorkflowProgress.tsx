import { useIntakeWorkflow } from "@/hooks/use-intake-workflow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Check,
  Lightbulb,
  Filter,
  FileText,
  Calculator,
  Shield,
  Gavel,
  type LucideIcon,
} from "lucide-react";

export type DisplayStep = {
  key: string;
  label: string;
  description?: string | null;
  helpText?: string | null;
  icon: LucideIcon;
};

export const STEP_ICONS: Record<string, LucideIcon> = {
  intake_capture: Lightbulb,
  triage: Filter,
  business_case: FileText,
  technical_evaluation: Calculator,
  governance_review: Shield,
  decision: Gavel,
};

export const DEFAULT_WORKFLOW_STEPS: DisplayStep[] = [
  { key: "intake_capture", label: "Intake Capture", icon: Lightbulb },
  { key: "triage", label: "Triage", icon: Filter },
  { key: "business_case", label: "Business Case", icon: FileText },
  { key: "technical_evaluation", label: "Technical Evaluation", icon: Calculator },
  { key: "governance_review", label: "Governance Review", icon: Shield },
  { key: "decision", label: "Decision", icon: Gavel },
];

export function resolveStepIndex(steps: DisplayStep[], stepKey: string): number {
  const index = steps.findIndex(s => s.key === stepKey);
  return index >= 0 ? index : 0;
}

export function useResolvedWorkflowSteps(workflowId?: number | null) {
  const hasWorkflow = workflowId != null;
  // Always call the hook to satisfy the rules of hooks, but ignore its result
  // when the intake has no workflow assigned so we fall back to the hardcoded
  // standard steps rather than whatever the org-level default endpoint returns.
  const { steps, isLoading } = useIntakeWorkflow(hasWorkflow ? workflowId : null, {
    enabled: hasWorkflow,
  });

  if (!hasWorkflow) {
    return { steps: DEFAULT_WORKFLOW_STEPS, isLoading: false };
  }

  const resolved: DisplayStep[] = (steps && steps.length > 0)
    ? steps.map(s => ({
        key: s.stepKey,
        label: s.label,
        description: s.description,
        helpText: s.helpText,
        icon: STEP_ICONS[s.stepKey] || s.icon || Lightbulb,
      }))
    : DEFAULT_WORKFLOW_STEPS;
  return { steps: resolved, isLoading };
}

export function WorkflowProgress({
  workflowId,
  currentStep,
  status,
}: {
  workflowId?: number | null;
  currentStep: string;
  status: string;
}) {
  const { steps: displaySteps } = useResolvedWorkflowSteps(workflowId);
  const currentIndex = resolveStepIndex(displaySteps, currentStep);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {displaySteps.map((step, index) => {
        const isCompleted = status === "approved" || index < currentIndex;
        const isCurrent = index === currentIndex && status !== "approved" && status !== "rejected";
        const Icon = step.icon;
        const tooltipDetail = step.description || step.helpText;

        return (
          <div key={step.key} className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  tabIndex={0}
                  onClick={(e) => e.preventDefault()}
                  aria-label={step.label}
                  data-testid={`step-dot-${step.key}`}
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "border-2 border-primary text-primary bg-primary/10"
                        : "border border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="font-medium text-xs">{step.label}</div>
                {tooltipDetail && (
                  <div className="text-xs text-muted-foreground mt-0.5">{tooltipDetail}</div>
                )}
              </TooltipContent>
            </Tooltip>
            {index < displaySteps.length - 1 && (
              <div className={`w-4 h-0.5 ${isCompleted ? "bg-primary" : "bg-muted-foreground/30"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
