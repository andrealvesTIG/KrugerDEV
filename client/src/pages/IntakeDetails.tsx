import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useIntakeWorkflow, AVAILABLE_INTAKE_FIELDS } from "@/hooks/use-intake-workflow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, ChevronLeft, ChevronRight, XCircle, AlertTriangle, FileText, DollarSign, Shield, Calculator, Save, Lightbulb, Filter, ClipboardCheck, Users, Gavel } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ProjectIntake, Portfolio } from "@shared/schema";

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-300">Approved</Badge>;
    case "rejected":
      return <Badge variant="default" className="bg-red-500/20 text-red-700 dark:text-red-300">Rejected</Badge>;
    case "deferred":
      return <Badge variant="default" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">Deferred</Badge>;
    case "in_progress":
      return <Badge variant="default" className="bg-blue-500/20 text-blue-700 dark:text-blue-300">In Progress</Badge>;
    case "draft":
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}

function getCompletedSteps(intake: ProjectIntake): string[] {
  const completed: string[] = [];
  if (intake.isBacklogComplete) completed.push("intake_capture");
  if (intake.basicInfoComplete) completed.push("triage");
  if (intake.financialsComplete) completed.push("business_case");
  if (intake.projectCostComplete) completed.push("technical_evaluation");
  if (intake.cyberArchComplete) completed.push("governance_review");
  if (intake.pmoSubmitted) completed.push("decision");
  return completed;
}

export default function IntakeDetails() {
  const [, params] = useRoute("/intakes/:id");
  const [, navigate] = useLocation();
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const { steps: workflowSteps, isLoading: workflowLoading, getStepByKey, getStepIndex, isFieldRequired } = useIntakeWorkflow();
  
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState("details");

  // Check if user can approve intakes
  const { data: approvalPermission } = useQuery<{ canApprove: boolean }>({
    queryKey: ['/api/organizations', currentOrganization?.id, 'can-approve-intakes'],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${currentOrganization?.id}/can-approve-intakes`);
      if (!res.ok) return { canApprove: false };
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });
  const canApproveIntakes = approvalPermission?.canApprove ?? false;
  
  const { data: intake, isLoading, error } = useQuery<ProjectIntake>({
    queryKey: ['/api/project-intakes', id, currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes/${id}?organizationId=${currentOrganization?.id}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Intake not found in this organization');
        }
        throw new Error('Failed to fetch intake');
      }
      return res.json();
    },
    enabled: !!id && !!currentOrganization?.id,
  });

  const [formData, setFormData] = useState<Partial<ProjectIntake>>({});

  const updateIntake = useMutation({
    mutationFn: async (data: Partial<ProjectIntake>) => {
      const response = await apiRequest('PUT', `/api/project-intakes/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Saved", description: "Intake has been saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const approveIntake = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/project-intakes/${id}/approve`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: "Intake Approved", description: "A new project has been created from this intake" });
      if (data.project?.id) {
        navigate(`/projects/${data.project.id}`);
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const rejectIntake = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiRequest('POST', `/api/project-intakes/${id}/reject`, { reason });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Intake Rejected", description: "The intake has been rejected" });
      setIsRejectDialogOpen(false);
      navigate('/intakes');
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });


  const handleSave = () => {
    updateIntake.mutate({ ...formData });
  };

  const validateGate = (gateId: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const currentData = { ...intake, ...formData };
    
    // Get required fields from dynamic configuration
    const step = getStepByKey(gateId);
    const requiredFields = step?.requiredFields || [];
    
    // Check each required field
    for (const field of requiredFields) {
      const value = currentData[field as keyof typeof currentData];
      const fieldInfo = AVAILABLE_INTAKE_FIELDS.find(f => f.key === field);
      const fieldLabel = fieldInfo?.label || field;
      
      // Check for empty values based on field type
      if (typeof value === 'string' && !value.trim()) {
        errors.push(`${fieldLabel} is required`);
      } else if (typeof value === 'number' && value <= 0) {
        errors.push(`${fieldLabel} is required`);
      } else if (value === null || value === undefined) {
        errors.push(`${fieldLabel} is required`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  };

  const handleNextStep = () => {
    if (!intake) return;
    const currentIndex = getStepIndex(intake.currentStep || "intake_capture");
    const currentStepId = intake.currentStep || "intake_capture";
    
    const validation = validateGate(currentStepId);
    if (!validation.valid) {
      toast({
        title: "Gate Requirements Not Met",
        description: validation.errors.join(". "),
        variant: "destructive",
      });
      return;
    }
    
    if (currentIndex < workflowSteps.length - 1) {
      const nextStep = workflowSteps[currentIndex + 1].stepKey;
      
      const stepCompletionUpdate: Partial<ProjectIntake> = {};
      if (currentStepId === "intake_capture") stepCompletionUpdate.isBacklogComplete = true;
      if (currentStepId === "triage") stepCompletionUpdate.basicInfoComplete = true;
      if (currentStepId === "business_case") stepCompletionUpdate.financialsComplete = true;
      if (currentStepId === "technical_evaluation") stepCompletionUpdate.projectCostComplete = true;
      if (currentStepId === "governance_review") stepCompletionUpdate.cyberArchComplete = true;
      
      updateIntake.mutate({
        ...formData,
        currentStep: nextStep,
        ...stepCompletionUpdate,
        status: 'in_progress',
      });
    }
  };

  const handlePreviousStep = () => {
    if (!intake) return;
    const currentIndex = getStepIndex(intake.currentStep || "intake_capture");
    if (currentIndex > 0) {
      const prevStep = workflowSteps[currentIndex - 1].stepKey;
      updateIntake.mutate({
        currentStep: prevStep,
      });
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading || workflowLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!intake || error) {
    return (
      <div className="flex h-96 items-center justify-center flex-col gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Intake not found in this organization</p>
        <Button variant="outline" onClick={() => navigate('/intakes')}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Intakes
        </Button>
      </div>
    );
  }

  const currentStepIndex = getStepIndex(intake.currentStep || "intake_capture");
  const currentStep = workflowSteps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === workflowSteps.length - 1;
  const isApproved = intake.status === "approved";
  const isRejected = intake.status === "rejected";
  const isLocked = isApproved || isRejected;
  const completedSteps = getCompletedSteps(intake);
  const StepIcon = currentStep?.icon || FileText;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-4 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate('/intakes')} className="shrink-0">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <h1 className="text-2xl font-display font-bold text-foreground truncate" title={intake.projectName}>{intake.projectName}</h1>
                  {getStatusBadge(intake.status || "draft")}
                  {intake.intakeNumber && (
                    <span className="text-sm text-muted-foreground font-mono shrink-0">{intake.intakeNumber}</span>
                  )}
                </div>
              </div>
            </div>
            
            {!isLocked && (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSave} disabled={updateIntake.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Progress
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-2 overflow-x-auto pb-2">
            {workflowSteps.map((step, index) => {
              const isCompleted = completedSteps.includes(step.stepKey) || (isApproved && index <= currentStepIndex);
              const isCurrent = index === currentStepIndex && !isApproved && !isRejected;
              const isClickable = index <= currentStepIndex && !isLocked;
              const Icon = step.icon;
              
              return (
                <div key={step.stepKey} className="flex items-center flex-1">
                  <div 
                    className={cn(
                      "flex flex-col items-center text-center min-w-[80px]",
                      isClickable ? "cursor-pointer" : "",
                      isClickable ? "opacity-100" : "opacity-50"
                    )}
                    onClick={() => {
                      if (isClickable) {
                        updateIntake.mutate({ currentStep: step.stepKey });
                      }
                    }}
                  >
                    <div 
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium mb-2 transition-colors",
                        isCompleted 
                          ? "bg-primary text-primary-foreground" 
                          : isCurrent 
                            ? "border-2 border-primary text-primary bg-primary/10" 
                            : "border border-muted-foreground/30 text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={cn(
                      "text-xs",
                      isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-2 min-w-[20px]",
                      isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
          
          {!isLocked && (
            <div className="flex items-center justify-between gap-4 flex-wrap mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousStep}
                disabled={isFirstStep || updateIntake.isPending}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              
              <div className="flex items-center gap-2">
                {isLastStep ? (
                  canApproveIntakes ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsRejectDialogOpen(true)}
                        data-testid="button-reject-intake"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <div className="relative group">
                        <Button
                          size="sm"
                          onClick={() => approveIntake.mutate()}
                          disabled={approveIntake.isPending || !(formData.pmoApproved ?? intake.pmoApproved)}
                          data-testid="button-approve-intake"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {approveIntake.isPending ? "Converting..." : "Approve & Convert"}
                        </Button>
                        {!(formData.pmoApproved ?? intake.pmoApproved) && (
                          <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md whitespace-nowrap z-50 border">
                            Check "PM Approved" first
                          </div>
                        )}
                      </div>
                    </>
                  ) : null
                ) : (
                  <Button size="sm" onClick={handleNextStep} disabled={updateIntake.isPending}>
                    Next Gate
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          )}
          
          {currentStep?.helpText && !isLocked && (
            <div className="mt-4 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
              <StepIcon className="inline h-4 w-4 mr-2" />
              <strong>Gate {currentStepIndex + 1} - {currentStep.label}:</strong> {currentStep.helpText}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" data-testid="tab-details">
            <Lightbulb className="h-4 w-4 mr-2" />
            Intake Details
          </TabsTrigger>
          <TabsTrigger value="business-case" data-testid="tab-business-case">
            <FileText className="h-4 w-4 mr-2" />
            Business Case
          </TabsTrigger>
          <TabsTrigger value="technical" data-testid="tab-technical">
            <Calculator className="h-4 w-4 mr-2" />
            Technical Evaluation
          </TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            <Shield className="h-4 w-4 mr-2" />
            Governance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Intake Information</CardTitle>
              <CardDescription>Core details about this intake request. <span className="text-destructive">*</span> Required fields</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Intake Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={formData.projectName ?? intake.projectName}
                    onChange={(e) => handleFieldChange('projectName', e.target.value)}
                    disabled={isLocked}
                    placeholder="Enter a descriptive name for this intake"
                    data-testid="input-intake-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target Portfolio <span className="text-destructive text-xs">(required for Triage)</span></Label>
                  <Select 
                    value={String(formData.portfolioId ?? intake.portfolioId ?? "")}
                    onValueChange={(v) => handleFieldChange('portfolioId', v ? parseInt(v) : null)}
                    disabled={isLocked}
                  >
                    <SelectTrigger data-testid="select-portfolio">
                      <SelectValue placeholder="Assign to portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      {portfolios?.map((p: Portfolio) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          <div className="truncate max-w-[300px]" title={p.name}>{p.name}</div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Description / Problem Statement <span className="text-destructive">*</span></Label>
                <Textarea
                  value={formData.description ?? intake.description ?? ""}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  disabled={isLocked}
                  rows={4}
                  placeholder="Describe the problem, opportunity, or request..."
                  data-testid="input-description"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Funding Source <span className="text-destructive text-xs">(required for Triage)</span></Label>
                  <Select 
                    value={formData.fundingSource ?? intake.fundingSource ?? ""}
                    onValueChange={(v) => handleFieldChange('fundingSource', v)}
                    disabled={isLocked}
                  >
                    <SelectTrigger data-testid="select-funding-source">
                      <SelectValue placeholder="Select funding type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Business Funded">Business Funded</SelectItem>
                      <SelectItem value="IT Funded">IT Funded</SelectItem>
                      <SelectItem value="Shared">Shared Funding</SelectItem>
                      <SelectItem value="Capital">Capital Budget</SelectItem>
                      <SelectItem value="Operating">Operating Budget</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Requesting Business Unit</Label>
                  <Select 
                    value={formData.businessUnit ?? intake.businessUnit ?? ""}
                    onValueChange={(v) => handleFieldChange('businessUnit', v)}
                    disabled={isLocked}
                  >
                    <SelectTrigger data-testid="select-business-unit">
                      <SelectValue placeholder="Select BU" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HO">Head Office</SelectItem>
                      <SelectItem value="IT">Information Technology</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="HR">Human Resources</SelectItem>
                      <SelectItem value="Legal">Legal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Related Program</Label>
                  <Input
                    value={formData.programName ?? intake.programName ?? ""}
                    onChange={(e) => handleFieldChange('programName', e.target.value)}
                    disabled={isLocked}
                    placeholder="Program name (if applicable)"
                    data-testid="input-program-name"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business-case" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Business Case & Financial Justification</CardTitle>
              <CardDescription>Document the business value, expected benefits, and budget requirements. <span className="text-destructive">*</span> Required for this gate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Estimated Total Budget <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={formData.estimatedBudget ?? intake.estimatedBudget ?? ""}
                    onChange={(e) => handleFieldChange('estimatedBudget', e.target.value)}
                    disabled={isLocked}
                    placeholder="0.00"
                    data-testid="input-estimated-budget"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Capital Expense (CapEx)</Label>
                  <Input
                    type="number"
                    value={formData.capitalExpense ?? intake.capitalExpense ?? ""}
                    onChange={(e) => handleFieldChange('capitalExpense', e.target.value)}
                    disabled={isLocked}
                    placeholder="0.00"
                    data-testid="input-capital-expense"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Operating Expense (OpEx)</Label>
                  <Input
                    type="number"
                    value={formData.operatingExpense ?? intake.operatingExpense ?? ""}
                    onChange={(e) => handleFieldChange('operatingExpense', e.target.value)}
                    disabled={isLocked}
                    placeholder="0.00"
                    data-testid="input-operating-expense"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Business Justification & Expected Benefits <span className="text-destructive">*</span></Label>
                <Textarea
                  value={formData.financialJustification ?? intake.financialJustification ?? ""}
                  onChange={(e) => handleFieldChange('financialJustification', e.target.value)}
                  disabled={isLocked}
                  rows={4}
                  placeholder="Describe the business case, expected ROI, cost savings, revenue impact, or strategic benefits..."
                  data-testid="input-financial-justification"
                />
              </div>

              <div className="space-y-2">
                <Label>Cost-Benefit Analysis</Label>
                <Textarea
                  value={formData.costBenefitAnalysis ?? intake.costBenefitAnalysis ?? ""}
                  onChange={(e) => handleFieldChange('costBenefitAnalysis', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Summarize the expected return on investment and payback period..."
                  data-testid="input-cost-benefit-analysis"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Technical Evaluation</CardTitle>
              <CardDescription>Assess technical feasibility, resource requirements, and implementation approach. <span className="text-destructive">*</span> Required for this gate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>IT Cost Estimate <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  value={formData.itCostEstimate ?? intake.itCostEstimate ?? ""}
                  onChange={(e) => handleFieldChange('itCostEstimate', e.target.value)}
                  disabled={isLocked}
                  placeholder="0.00"
                  data-testid="input-it-cost-estimate"
                />
              </div>

              <div className="space-y-2">
                <Label>Resource Requirements <span className="text-destructive">*</span></Label>
                <Textarea
                  value={formData.resourceRequirements ?? intake.resourceRequirements ?? ""}
                  onChange={(e) => handleFieldChange('resourceRequirements', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="List required team members, skills, equipment, or external resources..."
                  data-testid="input-resource-requirements"
                />
              </div>

              <div className="space-y-2">
                <Label>Implementation Timeline</Label>
                <Textarea
                  value={formData.implementationTimeline ?? intake.implementationTimeline ?? ""}
                  onChange={(e) => handleFieldChange('implementationTimeline', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Describe estimated phases, key milestones, and expected duration..."
                  data-testid="input-implementation-timeline"
                />
              </div>

              <div className="space-y-2">
                <Label>Architectural Review Notes</Label>
                <Textarea
                  value={formData.architecturalReview ?? intake.architecturalReview ?? ""}
                  onChange={(e) => handleFieldChange('architecturalReview', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Technical architecture considerations, integration points, infrastructure needs..."
                  data-testid="input-architectural-review"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Governance & Compliance Review</CardTitle>
              <CardDescription>Security assessment, compliance requirements, and approval tracking. <span className="text-destructive">*</span> Required for this gate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Cybersecurity Risk Assessment <span className="text-destructive">*</span></Label>
                <Textarea
                  value={formData.cyberRiskAssessment ?? intake.cyberRiskAssessment ?? ""}
                  onChange={(e) => handleFieldChange('cyberRiskAssessment', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Identify security risks, data sensitivity, access requirements, and mitigation strategies..."
                  data-testid="input-cyber-risk-assessment"
                />
              </div>

              <div className="space-y-2">
                <Label>Compliance Requirements</Label>
                <Textarea
                  value={formData.complianceRequirements ?? intake.complianceRequirements ?? ""}
                  onChange={(e) => handleFieldChange('complianceRequirements', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Regulatory requirements, data privacy (GDPR, HIPAA), industry standards..."
                  data-testid="input-compliance-requirements"
                />
              </div>

              <div className="flex items-center gap-2 pt-4 pb-2">
                <Checkbox 
                  id="securityApproval"
                  checked={formData.securityApproval ?? intake.securityApproval ?? false}
                  onCheckedChange={(checked) => handleFieldChange('securityApproval', checked)}
                  disabled={isLocked}
                  data-testid="checkbox-security-approval"
                />
                <Label htmlFor="securityApproval" className="text-sm cursor-pointer">
                  Security review completed and approved
                </Label>
              </div>
            </CardContent>
          </Card>

          {canApproveIntakes && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="h-5 w-5 text-primary" />
                  PM Approval
                </CardTitle>
                <CardDescription>
                  PM approval is required before this intake can be converted to a project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 p-4 rounded-md bg-muted/50">
                  <Checkbox 
                    id="pmoApproved"
                    checked={formData.pmoApproved ?? intake.pmoApproved ?? false}
                    onCheckedChange={(checked) => {
                      handleFieldChange('pmoApproved', checked);
                      updateIntake.mutate({ pmoApproved: checked as boolean });
                    }}
                    disabled={isLocked}
                    data-testid="checkbox-pmo-approved"
                  />
                  <Label htmlFor="pmoApproved" className="text-sm cursor-pointer font-medium">
                    PM has reviewed and approved this intake for project conversion
                  </Label>
                </div>
                {(formData.pmoApproved ?? intake.pmoApproved) && (
                  <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    PM approval granted. This intake is ready for conversion by an admin.
                  </p>
                )}
                {!(formData.pmoApproved ?? intake.pmoApproved) && !isLocked && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    PM approval is required before the "Approve & Convert" button can be used.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>


      {isApproved && intake.createdProjectId && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 text-green-500" />
                <span>This intake has been approved and converted to a project.</span>
              </div>
              <Button onClick={() => navigate(`/projects/${intake.createdProjectId}`)}>
                View Project
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isRejected && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <span className="font-medium">This intake has been rejected.</span>
                {intake.rejectionReason && (
                  <p className="text-sm text-muted-foreground mt-1">Reason: {intake.rejectionReason}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Intake</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for rejecting this intake request. The submitter will be notified.
            </p>
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this intake is being rejected..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => rejectIntake.mutate(rejectionReason)}
              disabled={rejectIntake.isPending}
            >
              {rejectIntake.isPending ? "Rejecting..." : "Reject Intake"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
