import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import type { IntakeWorkflowStep, InsertIntakeWorkflowStep, IntakeWorkflow } from "@shared/schema";
import { Lightbulb, Filter, FileText, Calculator, Shield, Gavel, LucideIcon } from "lucide-react";

// Map step keys to icons
const STEP_ICONS: Record<string, LucideIcon> = {
  intake_capture: Lightbulb,
  triage: Filter,
  business_case: FileText,
  technical_evaluation: Calculator,
  governance_review: Shield,
  decision: Gavel,
};

// Available intake fields that can be set as required
export const AVAILABLE_INTAKE_FIELDS = [
  { key: "projectName", label: "Intake Name", group: "Basic Info" },
  { key: "description", label: "Description", group: "Basic Info" },
  { key: "portfolioId", label: "Target Portfolio", group: "Basic Info" },
  { key: "fundingSource", label: "Funding Source", group: "Basic Info" },
  { key: "businessUnit", label: "Business Unit", group: "Basic Info" },
  { key: "programName", label: "Program Name", group: "Basic Info" },
  { key: "estimatedBudget", label: "Estimated Budget", group: "Business Case" },
  { key: "capitalExpense", label: "Capital Expense", group: "Business Case" },
  { key: "operatingExpense", label: "Operating Expense", group: "Business Case" },
  { key: "financialJustification", label: "Business Justification", group: "Business Case" },
  { key: "costBenefitAnalysis", label: "Cost-Benefit Analysis", group: "Business Case" },
  { key: "itCostEstimate", label: "IT Cost Estimate", group: "Technical" },
  { key: "resourceRequirements", label: "Resource Requirements", group: "Technical" },
  { key: "implementationTimeline", label: "Implementation Timeline", group: "Technical" },
  { key: "architecturalReview", label: "Architectural Review", group: "Technical" },
  { key: "cyberRiskAssessment", label: "Cybersecurity Assessment", group: "Governance" },
  { key: "complianceRequirements", label: "Compliance Requirements", group: "Governance" },
  { key: "securityApproval", label: "Security Approval", group: "Governance" },
];

export interface WorkflowStep extends IntakeWorkflowStep {
  icon: LucideIcon;
}

export function useIntakeWorkflow(workflowId?: number | null, options?: { enabled?: boolean }) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const wfId = workflowId ?? null;
  const enabledOpt = options?.enabled ?? true;

  const query = useQuery<IntakeWorkflowStep[]>({
    queryKey: ['/api/organizations', orgId, 'intake-workflow', wfId],
    queryFn: async () => {
      const url = wfId != null
        ? `/api/organizations/${orgId}/intake-workflow?workflowId=${wfId}`
        : `/api/organizations/${orgId}/intake-workflow`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!orgId && enabledOpt,
  });

  // Transform steps to include icons
  const steps: WorkflowStep[] = (query.data || []).map(step => ({
    ...step,
    icon: STEP_ICONS[step.stepKey] || Lightbulb,
  }));

  const updateWorkflow = useMutation({
    mutationFn: async (newSteps: InsertIntakeWorkflowStep[]) => {
      if (!orgId) throw new Error("No organization selected");
      const response = await apiRequest("PUT", `/api/organizations/${orgId}/intake-workflow`, { steps: newSteps });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'intake-workflow'] });
    },
  });

  const resetToDefaults = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization selected");
      const response = await apiRequest("POST", `/api/organizations/${orgId}/intake-workflow/reset`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'intake-workflow'] });
    },
  });

  // Helper to get step by key
  const getStepByKey = (stepKey: string): WorkflowStep | undefined => {
    return steps.find(s => s.stepKey === stepKey);
  };

  // Helper to get step index by key
  const getStepIndex = (stepKey: string): number => {
    const index = steps.findIndex(s => s.stepKey === stepKey);
    return index >= 0 ? index : 0;
  };

  // Helper to check if a field is required for a given step
  const isFieldRequired = (stepKey: string, fieldKey: string): boolean => {
    const step = getStepByKey(stepKey);
    return step?.requiredFields?.includes(fieldKey) || false;
  };

  // Helper to get all required fields up to and including a given step
  const getRequiredFieldsForStep = (stepKey: string): string[] => {
    const stepIndex = getStepIndex(stepKey);
    const allRequired: string[] = [];
    for (let i = 0; i <= stepIndex; i++) {
      const step = steps[i];
      if (step?.requiredFields) {
        allRequired.push(...step.requiredFields);
      }
    }
    return allRequired;
  };

  return {
    steps,
    isLoading: query.isLoading,
    isError: query.isError,
    updateWorkflow,
    resetToDefaults,
    getStepByKey,
    getStepIndex,
    isFieldRequired,
    getRequiredFieldsForStep,
  };
}

/**
 * Hook for listing/managing all intake workflows for the current organization.
 */
export function useIntakeWorkflows() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const query = useQuery<IntakeWorkflow[]>({
    queryKey: ['/api/organizations', orgId, 'intake-workflows'],
    enabled: !!orgId,
  });

  const createWorkflow = useMutation({
    mutationFn: async (data: { name: string; description?: string; isDefault?: boolean; creationMode?: 'dialog' | 'url'; creationUrl?: string | null; agentTarget?: 'powerbi' | null }) => {
      if (!orgId) throw new Error("No organization selected");
      const res = await apiRequest("POST", `/api/organizations/${orgId}/intake-workflows`, data);
      return res.json() as Promise<IntakeWorkflow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'intake-workflows'] });
    },
  });

  const updateWorkflowMeta = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; description?: string; isDefault?: boolean; isActive?: boolean; creationMode?: 'dialog' | 'url'; creationUrl?: string | null; agentTarget?: 'powerbi' | null }) => {
      if (!orgId) throw new Error("No organization selected");
      const res = await apiRequest("PATCH", `/api/organizations/${orgId}/intake-workflows/${id}`, data);
      return res.json() as Promise<IntakeWorkflow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'intake-workflows'] });
    },
  });

  const deleteWorkflow = useMutation({
    mutationFn: async (id: number) => {
      if (!orgId) throw new Error("No organization selected");
      await apiRequest("DELETE", `/api/organizations/${orgId}/intake-workflows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'intake-workflows'] });
    },
  });

  return {
    workflows: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    createWorkflow,
    updateWorkflowMeta,
    deleteWorkflow,
  };
}
