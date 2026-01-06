import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useOrganization } from "@/hooks/use-organization";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useAuth } from "@/hooks/use-auth";
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
import { Loader2, Check, ChevronLeft, ChevronRight, XCircle, AlertTriangle, FileText, DollarSign, Shield, Calculator, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ProjectIntake, Portfolio } from "@shared/schema";

const WORKFLOW_STEPS = [
  { id: "is_backlog", label: "Is Backlog", description: "Determine if this is a backlog item or a new project" },
  { id: "provide_basic_information", label: "Basic Information", description: "Provide project details and context" },
  { id: "financials", label: "Financials", description: "Estimate budget and funding requirements" },
  { id: "project_cost_evaluation", label: "Cost Evaluation", description: "Review project cost breakdown and estimates" },
  { id: "cyber_arch_evaluation", label: "Cyber & Architecture", description: "Security and architecture review" },
  { id: "submit_to_pmo", label: "Submit to PMO", description: "Final review and submission for approval" },
];

function getStepIndex(stepId: string): number {
  return WORKFLOW_STEPS.findIndex(s => s.id === stepId);
}

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-300">Approved</Badge>;
    case "rejected":
      return <Badge variant="default" className="bg-red-500/20 text-red-700 dark:text-red-300">Rejected</Badge>;
    case "in_progress":
      return <Badge variant="default" className="bg-blue-500/20 text-blue-700 dark:text-blue-300">In Progress</Badge>;
    case "draft":
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}

function getCompletedSteps(intake: ProjectIntake): string[] {
  const completed: string[] = [];
  if (intake.isBacklogComplete) completed.push("is_backlog");
  if (intake.basicInfoComplete) completed.push("provide_basic_information");
  if (intake.financialsComplete) completed.push("financials");
  if (intake.projectCostComplete) completed.push("project_cost_evaluation");
  if (intake.cyberArchComplete) completed.push("cyber_arch_evaluation");
  if (intake.pmoSubmitted) completed.push("submit_to_pmo");
  return completed;
}

export default function IntakeDetails() {
  const [, params] = useRoute("/intakes/:id");
  const [, navigate] = useLocation();
  const id = parseInt(params?.id || "0");
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  
  const { data: intake, isLoading } = useQuery<ProjectIntake>({
    queryKey: ['/api/project-intakes', id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes/${id}`);
      if (!res.ok) throw new Error('Failed to fetch intake');
      return res.json();
    },
    enabled: !!id,
  });

  const [formData, setFormData] = useState<Partial<ProjectIntake>>({});

  const updateIntake = useMutation({
    mutationFn: async (data: Partial<ProjectIntake>) => {
      const response = await apiRequest('PUT', `/api/project-intakes/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Saved", description: "Intake form has been saved" });
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
      toast({ title: "Approved", description: "Project has been created from intake" });
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
      toast({ title: "Rejected", description: "Intake has been rejected" });
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

  const handleNextStep = () => {
    if (!intake) return;
    const currentIndex = getStepIndex(intake.currentStep || "is_backlog");
    if (currentIndex < WORKFLOW_STEPS.length - 1) {
      const nextStep = WORKFLOW_STEPS[currentIndex + 1].id;
      const currentStepId = intake.currentStep || "is_backlog";
      
      const stepCompletionUpdate: Partial<ProjectIntake> = {};
      if (currentStepId === "is_backlog") stepCompletionUpdate.isBacklogComplete = true;
      if (currentStepId === "provide_basic_information") stepCompletionUpdate.basicInfoComplete = true;
      if (currentStepId === "financials") stepCompletionUpdate.financialsComplete = true;
      if (currentStepId === "project_cost_evaluation") stepCompletionUpdate.projectCostComplete = true;
      if (currentStepId === "cyber_arch_evaluation") stepCompletionUpdate.cyberArchComplete = true;
      
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
    const currentIndex = getStepIndex(intake.currentStep || "is_backlog");
    if (currentIndex > 0) {
      const prevStep = WORKFLOW_STEPS[currentIndex - 1].id;
      updateIntake.mutate({
        currentStep: prevStep,
      });
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!intake) {
    return (
      <div className="flex h-96 items-center justify-center flex-col gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Intake not found</p>
        <Button variant="outline" onClick={() => navigate('/intakes')}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Intakes
        </Button>
      </div>
    );
  }

  const currentStepIndex = getStepIndex(intake.currentStep || "is_backlog");
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === WORKFLOW_STEPS.length - 1;
  const isApproved = intake.status === "approved";
  const isRejected = intake.status === "rejected";
  const isLocked = isApproved || isRejected;
  const completedSteps = getCompletedSteps(intake);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/intakes')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-foreground">{intake.projectName}</h1>
              {getStatusBadge(intake.status || "draft")}
              {intake.intakeNumber && (
                <span className="text-sm text-muted-foreground">{intake.intakeNumber}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {WORKFLOW_STEPS[currentStepIndex]?.label}: {WORKFLOW_STEPS[currentStepIndex]?.description}
            </p>
          </div>
        </div>
        
        {!isLocked && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSave} disabled={updateIntake.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-6 overflow-x-auto pb-2">
            {WORKFLOW_STEPS.map((step, index) => {
              const isCompleted = completedSteps.includes(step.id) || (isApproved && index <= currentStepIndex);
              const isCurrent = index === currentStepIndex && !isApproved;
              const isClickable = index <= currentStepIndex;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div 
                    className={cn(
                      "flex flex-col items-center text-center cursor-pointer",
                      isClickable ? "opacity-100" : "opacity-50"
                    )}
                    onClick={() => {
                      if (isClickable && !isLocked) {
                        updateIntake.mutate({ currentStep: step.id });
                      }
                    }}
                  >
                    <div 
                      className={cn(
                        "flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium mb-2",
                        isCompleted 
                          ? "bg-primary text-primary-foreground" 
                          : isCurrent 
                            ? "border-2 border-primary text-primary" 
                            : "border border-muted-foreground/30 text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <Check className="w-5 h-5" /> : index + 1}
                    </div>
                    <span className={cn(
                      "text-xs max-w-[80px]",
                      isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  </div>
                  {index < WORKFLOW_STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-2",
                      isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="form" className="space-y-4">
        <TabsList>
          <TabsTrigger value="form" data-testid="tab-form">
            <FileText className="h-4 w-4 mr-2" />
            Intake Form
          </TabsTrigger>
          <TabsTrigger value="financials" data-testid="tab-financials">
            <DollarSign className="h-4 w-4 mr-2" />
            Financials
          </TabsTrigger>
          <TabsTrigger value="cyber-arch" data-testid="tab-cyber-arch">
            <Shield className="h-4 w-4 mr-2" />
            Cyber & Architecture
          </TabsTrigger>
          <TabsTrigger value="cost-eval" data-testid="tab-cost-eval">
            <Calculator className="h-4 w-4 mr-2" />
            Cost Evaluation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Core project details and context</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Project Name *</Label>
                  <Input
                    value={formData.projectName ?? intake.projectName}
                    onChange={(e) => handleFieldChange('projectName', e.target.value)}
                    disabled={isLocked}
                    data-testid="input-project-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Portfolio</Label>
                  <Select 
                    value={String(formData.portfolioId ?? intake.portfolioId ?? "")}
                    onValueChange={(v) => handleFieldChange('portfolioId', v ? parseInt(v) : null)}
                    disabled={isLocked}
                  >
                    <SelectTrigger data-testid="select-portfolio">
                      <SelectValue placeholder="Select portfolio" />
                    </SelectTrigger>
                    <SelectContent>
                      {portfolios?.map((p: Portfolio) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description ?? intake.description ?? ""}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  disabled={isLocked}
                  rows={4}
                  data-testid="input-description"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Funding Source</Label>
                  <Select 
                    value={formData.fundingSource ?? intake.fundingSource ?? ""}
                    onValueChange={(v) => handleFieldChange('fundingSource', v)}
                    disabled={isLocked}
                  >
                    <SelectTrigger data-testid="select-funding-source">
                      <SelectValue placeholder="Select funding" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Business Funded">Business Funded</SelectItem>
                      <SelectItem value="IT Funded">IT Funded</SelectItem>
                      <SelectItem value="Shared">Shared</SelectItem>
                      <SelectItem value="Capital">Capital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Business Unit</Label>
                  <Select 
                    value={formData.businessUnit ?? intake.businessUnit ?? ""}
                    onValueChange={(v) => handleFieldChange('businessUnit', v)}
                    disabled={isLocked}
                  >
                    <SelectTrigger data-testid="select-business-unit">
                      <SelectValue placeholder="Select BU" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HO">HO</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Program Name</Label>
                  <Input
                    value={formData.programName ?? intake.programName ?? ""}
                    onChange={(e) => handleFieldChange('programName', e.target.value)}
                    disabled={isLocked}
                    placeholder="Enter program name"
                    data-testid="input-program-name"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financials" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Financial Estimates</CardTitle>
              <CardDescription>Budget planning and funding allocation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Estimated Budget</Label>
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
                <Label>Financial Justification</Label>
                <Textarea
                  value={formData.financialJustification ?? intake.financialJustification ?? ""}
                  onChange={(e) => handleFieldChange('financialJustification', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Explain the budget requirements..."
                  data-testid="input-financial-justification"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cyber-arch" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cybersecurity & Architecture Evaluation</CardTitle>
              <CardDescription>Security requirements and technical architecture review</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Cyber Risk Assessment</Label>
                <Textarea
                  value={formData.cyberRiskAssessment ?? intake.cyberRiskAssessment ?? ""}
                  onChange={(e) => handleFieldChange('cyberRiskAssessment', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Describe cybersecurity risks and mitigation strategies..."
                  data-testid="input-cyber-risk-assessment"
                />
              </div>

              <div className="space-y-2">
                <Label>Architectural Review</Label>
                <Textarea
                  value={formData.architecturalReview ?? intake.architecturalReview ?? ""}
                  onChange={(e) => handleFieldChange('architecturalReview', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Technical architecture details and considerations..."
                  data-testid="input-architectural-review"
                />
              </div>

              <div className="space-y-2">
                <Label>Compliance Requirements</Label>
                <Textarea
                  value={formData.complianceRequirements ?? intake.complianceRequirements ?? ""}
                  onChange={(e) => handleFieldChange('complianceRequirements', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Regulatory and compliance requirements..."
                  data-testid="input-compliance-requirements"
                />
              </div>

              <div className="flex items-center gap-2 pt-4">
                <Checkbox 
                  id="securityApproval"
                  checked={formData.securityApproval ?? intake.securityApproval ?? false}
                  onCheckedChange={(checked) => handleFieldChange('securityApproval', checked)}
                  disabled={isLocked}
                  data-testid="checkbox-security-approval"
                />
                <Label htmlFor="securityApproval" className="text-sm">
                  Security review approved
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cost-eval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Cost Evaluation</CardTitle>
              <CardDescription>IT cost estimates and resource requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>IT Cost Estimate</Label>
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
                <Label>Resource Requirements</Label>
                <Textarea
                  value={formData.resourceRequirements ?? intake.resourceRequirements ?? ""}
                  onChange={(e) => handleFieldChange('resourceRequirements', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Describe required resources (team, skills, equipment)..."
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
                  placeholder="Estimated timeline and milestones..."
                  data-testid="input-implementation-timeline"
                />
              </div>

              <div className="space-y-2">
                <Label>Cost-Benefit Analysis</Label>
                <Textarea
                  value={formData.costBenefitAnalysis ?? intake.costBenefitAnalysis ?? ""}
                  onChange={(e) => handleFieldChange('costBenefitAnalysis', e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Business case and expected ROI..."
                  data-testid="input-cost-benefit-analysis"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!isLocked && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handlePreviousStep}
                disabled={isFirstStep}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous Step
              </Button>
              
              <div className="flex items-center gap-2">
                {isLastStep ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => setIsRejectDialogOpen(true)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => approveIntake.mutate()}
                      disabled={approveIntake.isPending}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      {approveIntake.isPending ? "Approving..." : "Approve & Create Project"}
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleNextStep}>
                    Next Step
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isApproved && intake.createdProjectId && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 text-green-500" />
                <span>This intake has been approved and a project has been created.</span>
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
            <DialogTitle>Reject Project Intake</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label>Reason for Rejection</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Provide a reason for rejecting this intake..."
              rows={4}
            />
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
