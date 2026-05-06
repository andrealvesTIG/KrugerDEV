import { useState } from "react";
import { formatCurrency } from "@/lib/format";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, ChevronLeft, ChevronRight, XCircle, AlertTriangle, FileText, Shield, Calculator, Save, Lightbulb, Gavel, ChevronsUpDown, Paperclip, MessageSquare, Image as ImageIcon, Download, User as UserIcon, Bot, Pencil, X, ExternalLink } from "lucide-react";
import { useCustomFieldDefinitions, useIntakeCustomFieldValues, useUpdateIntakeCustomFieldValue } from "@/hooks/use-custom-fields";
import { useResources } from "@/hooks/use-resources";
import { AttachmentFieldInput, AttachmentFieldDisplay } from "@/components/custom-fields/AttachmentField";
import { IntakeFinancialsSection } from "@/components/intake/IntakeFinancialsSection";
import { IntakeGovernanceQuestionsSection } from "@/components/intake/IntakeGovernanceQuestionsSection";
import { useIntakeGovernanceQuestions } from "@/hooks/use-intake-governance-questions";
import type { CustomFieldDefinition } from "@shared/schema";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ProjectIntake, Portfolio } from "@shared/schema";

function getStatusBadge(status: string) {
  switch (status) {
    case "approved":
      return <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-300">Approved</Badge>;
    case "rejected":
      return <Badge variant="default" className="bg-destructive/20 text-destructive">Rejected</Badge>;
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

interface SourceAttachment {
  name: string;
  objectPath: string;
  contentType: string;
  size: number;
  messageId: number;
  createdAt: string | null;
}
interface SourceMessage {
  id: number;
  role: string;
  content: string;
  attachments: Array<{ name: string; objectPath: string; contentType: string; size: number }> | null;
  createdAt: string | null;
}
interface IntakeSource {
  pbiRequest: { id: number; requestNumber: string | null; reportName: string | null; status: string | null } | null;
  conversation: { id: number; title: string | null; createdAt: string | null } | null;
  messages: SourceMessage[];
  attachments: SourceAttachment[];
}

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function IntakeSourcePanel({ intakeId }: { intakeId: number }) {
  const { data, isLoading, error } = useQuery<IntakeSource>({
    queryKey: ['/api/project-intakes', intakeId, 'source'],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes/${intakeId}/source`);
      if (!res.ok) throw new Error('Failed to fetch intake source');
      return res.json();
    },
    enabled: intakeId > 0,
  });

  if (isLoading) {
    return (
      <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>
    );
  }
  if (error) {
    return <Card><CardContent className="py-6 text-sm text-destructive">Failed to load source data.</CardContent></Card>;
  }

  const hasAny = !!(data && (data.conversation || data.attachments.length || data.pbiRequest));
  if (!hasAny) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No agent conversation or attachments are linked to this intake.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data!.pbiRequest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Source Request
            </CardTitle>
            <CardDescription>This intake was created from a Power BI request.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {data!.pbiRequest.requestNumber && (
              <div><span className="text-muted-foreground">Request:</span> <span className="font-mono">{data!.pbiRequest.requestNumber}</span></div>
            )}
            {data!.pbiRequest.reportName && (
              <div><span className="text-muted-foreground">Report:</span> {data!.pbiRequest.reportName}</div>
            )}
            {data!.pbiRequest.status && (
              <div><span className="text-muted-foreground">Status:</span> {data!.pbiRequest.status}</div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4" />
            Attachments
            <Badge variant="secondary" className="ml-1">{data!.attachments.length}</Badge>
          </CardTitle>
          <CardDescription>Files uploaded during the agent conversation.</CardDescription>
        </CardHeader>
        <CardContent>
          {data!.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attachments.</p>
          ) : (
            <ul className="divide-y">
              {data!.attachments.map((a, idx) => {
                const isImage = a.contentType?.startsWith('image/');
                return (
                  <li key={`${a.objectPath}-${idx}`} className="flex items-center gap-3 py-2">
                    {isImage ? <ImageIcon className="h-4 w-4 text-orange-500 flex-shrink-0" /> : <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <a
                        href={a.objectPath}
                        download={a.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline truncate block"
                        data-testid={`source-attachment-${idx}`}
                      >
                        {a.name}
                      </a>
                      <div className="text-xs text-muted-foreground">
                        {a.contentType} · {formatBytes(a.size)}
                        {a.createdAt && !isNaN(new Date(a.createdAt).getTime()) && (
                          <> · {format(new Date(a.createdAt), 'MMM d, yyyy h:mm a')}</>
                        )}
                      </div>
                    </div>
                    <a href={a.objectPath} download={a.name} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Agent Conversation
            {data!.messages.length > 0 && <Badge variant="secondary" className="ml-1">{data!.messages.length}</Badge>}
          </CardTitle>
          <CardDescription>
            {data!.conversation?.title || 'Conversation that produced this intake.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data!.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {data!.messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div key={m.id} className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
                    {!isUser && (
                      <div className="h-7 w-7 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-orange-500" />
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                      isUser ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <div>{m.content}</div>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.attachments.map((att, i) => (
                            <a
                              key={i}
                              href={att.objectPath}
                              download={att.name}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:underline",
                                isUser ? "bg-primary-foreground/20" : "bg-background border"
                              )}
                            >
                              <Paperclip className="h-3 w-3" />
                              {att.name}
                            </a>
                          ))}
                        </div>
                      )}
                      {m.createdAt && !isNaN(new Date(m.createdAt).getTime()) && (
                        <div className={cn("mt-1 text-[10px]", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {format(new Date(m.createdAt), 'MMM d, h:mm a')}
                        </div>
                      )}
                    </div>
                    {isUser && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <UserIcon className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
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
  const [activeTab, setActiveTab] = useState("details");
  const [portfolioOpen, setPortfolioOpen] = useState(false);

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

  const { steps: workflowSteps, isLoading: workflowLoading, getStepByKey, getStepIndex, isFieldRequired } = useIntakeWorkflow(intake?.workflowId ?? null);

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


  const isBudgetExceeded = (() => {
    const budget = parseFloat(String(formData.estimatedBudget ?? intake?.estimatedBudget ?? 0)) || 0;
    const capEx = parseFloat(String(formData.capitalExpense ?? intake?.capitalExpense ?? 0)) || 0;
    const opEx = parseFloat(String(formData.operatingExpense ?? intake?.operatingExpense ?? 0)) || 0;
    return budget > 0 && (capEx + opEx > budget);
  })();

  const handleSave = () => {
    if (isBudgetExceeded) {
      toast({ title: "Cannot save", description: "CapEx + OpEx exceeds the Estimated Total Budget. Please adjust the values.", variant: "destructive" });
      return;
    }
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

    // Governance questionnaires shown on this step must be fully answered
    // (every row must be Yes or No) before the user can advance to the next gate.
    // We also refuse to advance if the question lists are still loading or failed
    // to load, otherwise an empty/missing list would silently bypass the gate.
    const governanceErrors: string[] = [];
    if (showArchitectureForCurrentStep) {
      if (architectureQuestionsLoading || architectureQuestionsError || !architectureQuestions) {
        governanceErrors.push("Architecture questions could not be verified — please retry");
      } else {
        const unanswered = architectureQuestions.filter(q => q.answer !== "yes" && q.answer !== "no").length;
        if (unanswered > 0) {
          governanceErrors.push(`${unanswered} Architecture question${unanswered === 1 ? "" : "s"} unanswered`);
        }
      }
    }
    if (showCybersecurityForCurrentStep) {
      if (cybersecurityQuestionsLoading || cybersecurityQuestionsError || !cybersecurityQuestions) {
        governanceErrors.push("Cybersecurity questions could not be verified — please retry");
      } else {
        const unanswered = cybersecurityQuestions.filter(q => q.answer !== "yes" && q.answer !== "no").length;
        if (unanswered > 0) {
          governanceErrors.push(`${unanswered} Cybersecurity question${unanswered === 1 ? "" : "s"} unanswered`);
        }
      }
    }
    if (governanceErrors.length > 0) {
      toast({
        title: "Gate Requirements Not Met",
        description: `All questions must be answered Yes or No before advancing. ${governanceErrors.join("; ")}.`,
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

  const {
    data: architectureQuestions,
    isLoading: architectureQuestionsLoading,
    isError: architectureQuestionsError,
  } = useIntakeGovernanceQuestions(id, "architecture");
  const {
    data: cybersecurityQuestions,
    isLoading: cybersecurityQuestionsLoading,
    isError: cybersecurityQuestionsError,
  } = useIntakeGovernanceQuestions(id, "cybersecurity");

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

  // The Intake Estimates grid is shown when the *current* workflow step
  // has `showFinancials` enabled. Backward-compat: if no step in the workflow
  // has the flag set, fall back to showing it on the Business Case step so
  // existing organizations keep their previous behavior.
  const anyStepShowsFinancials = workflowSteps.some(s => s.showFinancials === true);
  const showFinancialsForCurrentStep = currentStep?.showFinancials === true
    || (!anyStepShowsFinancials && currentStep?.stepKey === "business_case");
  const showArchitectureForCurrentStep = currentStep?.showArchitectureQuestions === true;
  const showCybersecurityForCurrentStep = currentStep?.showCybersecurityQuestions === true;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate('/intakes')} className="shrink-0">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h1 className="text-xl sm:text-2xl font-display font-bold text-foreground truncate" title={intake.projectName}>{intake.projectName}</h1>
                  {getStatusBadge(intake.status || "draft")}
                  {intake.intakeNumber && (
                    <span className="text-xs sm:text-sm text-muted-foreground font-mono shrink-0">{intake.intakeNumber}</span>
                  )}
                </div>
              </div>
            </div>
            
            {!isLocked && (
              <div className="flex items-center gap-2 pl-11 sm:pl-0">
                <Button variant="outline" size="sm" onClick={handleSave} disabled={updateIntake.isPending}>
                  <Save className="h-4 w-4 mr-1" />
                  Save
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
              const tooltipDetail = step.description || step.helpText;

              return (
                <div key={step.stepKey} className="flex items-center flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={step.label}
                        data-testid={`detail-step-${step.stepKey}`}
                        onClick={() => {
                          if (isClickable) {
                            updateIntake.mutate({ currentStep: step.stepKey });
                          }
                        }}
                        className={cn(
                          "flex flex-col items-center text-center min-w-[40px] sm:min-w-[80px] bg-transparent p-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          isClickable ? "cursor-pointer" : "cursor-default",
                          isClickable ? "opacity-100" : "opacity-50"
                        )}
                      >
                        <div
                          className={cn(
                            "flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full text-sm font-medium mb-1 sm:mb-2 transition-colors",
                            isCompleted
                              ? "bg-primary text-primary-foreground"
                              : isCurrent
                                ? "border-2 border-primary text-primary bg-primary/10"
                                : "border border-muted-foreground/30 text-muted-foreground"
                          )}
                        >
                          {isCompleted ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                        </div>
                        <span className={cn(
                          "text-[10px] sm:text-xs leading-tight",
                          isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                        )}>
                          {step.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="font-medium text-xs">{step.label}</div>
                      {tooltipDetail && (
                        <div className="text-xs text-muted-foreground mt-0.5">{tooltipDetail}</div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                  {index < workflowSteps.length - 1 && (
                    <div className={cn(
                      "flex-1 h-0.5 mx-1 sm:mx-2 min-w-[12px] sm:min-w-[20px]",
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
            <div className="mt-4 p-3 bg-muted/50 rounded-md text-xs sm:text-sm text-muted-foreground">
              <StepIcon className="inline h-4 w-4 mr-1 sm:mr-2" />
              <strong>Gate {currentStepIndex + 1} - {currentStep.label}:</strong> {currentStep.helpText}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="details" data-testid="tab-details">
            <Lightbulb className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Intake </span>Details
          </TabsTrigger>
          <TabsTrigger value="business-case" data-testid="tab-business-case">
            <FileText className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Business </span>Case
          </TabsTrigger>
          <TabsTrigger value="technical" data-testid="tab-technical">
            <Calculator className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Technical </span>Eval
          </TabsTrigger>
          <TabsTrigger value="governance" data-testid="tab-governance">
            <Shield className="h-4 w-4 mr-1 sm:mr-2" />
            Governance
          </TabsTrigger>
          <TabsTrigger value="source" data-testid="tab-source">
            <MessageSquare className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Source &amp; </span>Conversation
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
                  <Popover open={portfolioOpen} onOpenChange={setPortfolioOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={portfolioOpen}
                        className="w-full h-9 justify-between font-normal bg-background hover:bg-background active:bg-background [border-color:hsl(var(--input))] shadow-none no-default-hover-elevate no-default-active-elevate"
                        disabled={isLocked}
                        data-testid="select-portfolio"
                      >
                        <span className={cn("truncate", !(formData.portfolioId ?? intake.portfolioId) && "text-muted-foreground")}>
                          {(formData.portfolioId ?? intake.portfolioId)
                            ? portfolios?.find((p: Portfolio) => p.id === (formData.portfolioId ?? intake.portfolioId))?.name ?? "Assign to portfolio"
                            : "Assign to portfolio"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[300px] p-0"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <Command shouldFilter={true}>
                        <CommandInput placeholder="Search portfolios..." />
                        <CommandList>
                          <CommandEmpty>No portfolio found.</CommandEmpty>
                          <CommandGroup>
                            {portfolios?.map((p: Portfolio) => (
                              <CommandItem
                                key={p.id}
                                value={p.name ?? String(p.id)}
                                onSelect={() => {
                                  handleFieldChange('portfolioId', p.id);
                                  setPortfolioOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    (formData.portfolioId ?? intake.portfolioId) === p.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                <span className="truncate" title={p.name}>{p.name}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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

              <IntakeCustomFieldsSection
                intakeId={intake.id}
                organizationId={currentOrganization?.id}
                isLocked={isLocked}
              />
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
              {(() => {
                const budget = parseFloat(String(formData.estimatedBudget ?? intake.estimatedBudget ?? 0)) || 0;
                const capEx = parseFloat(String(formData.capitalExpense ?? intake.capitalExpense ?? 0)) || 0;
                const opEx = parseFloat(String(formData.operatingExpense ?? intake.operatingExpense ?? 0)) || 0;
                const remaining = budget - capEx - opEx;
                if (budget > 0 && (capEx > 0 || opEx > 0)) {
                  if (remaining < 0) {
                    return (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                        <p className="text-sm text-destructive">
                          CapEx + OpEx exceeds the Estimated Total Budget by {formatCurrency(Math.abs(remaining))}. Please adjust the values before saving.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <p className="text-xs text-muted-foreground">
                      Remaining budget: {formatCurrency(remaining)}
                    </p>
                  );
                }
                return null;
              })()}

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

        <TabsContent value="source" className="space-y-4">
          <IntakeSourcePanel intakeId={id} />
        </TabsContent>
      </Tabs>

      {showFinancialsForCurrentStep && (
        <IntakeFinancialsSection intakeId={intake.id} readOnly={isLocked} />
      )}

      {showArchitectureForCurrentStep && (
        <IntakeGovernanceQuestionsSection intakeId={intake.id} category="architecture" readOnly={isLocked} />
      )}

      {showCybersecurityForCurrentStep && (
        <IntakeGovernanceQuestionsSection intakeId={intake.id} category="cybersecurity" readOnly={isLocked} />
      )}


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
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-destructive" />
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

function IntakeCustomFieldsSection({ intakeId, organizationId, isLocked }: { intakeId: number; organizationId: number | undefined; isLocked: boolean }) {
  const { toast } = useToast();
  const { data: allDefinitions = [], isLoading: definitionsLoading } = useCustomFieldDefinitions(organizationId);
  const definitions = allDefinitions.filter(d => (d.entityType || 'project') === 'intake');
  const { data: values = [], isLoading: valuesLoading } = useIntakeCustomFieldValues(intakeId);
  const { data: orgResources = [] } = useResources(organizationId ?? null);
  const updateValue = useUpdateIntakeCustomFieldValue();
  const [editingFieldId, setEditingFieldId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  if (!organizationId) return null;
  if (definitionsLoading || valuesLoading) return null;
  if (definitions.length === 0) return null;

  const getFieldValue = (fieldId: number): string => {
    const val = values.find(v => v.fieldDefinitionId === fieldId);
    return val?.value || "";
  };

  const handleEdit = (field: CustomFieldDefinition) => {
    if (isLocked) return;
    if (field.fieldType === "autonumber") return;
    setEditingFieldId(field.id);
    setEditValue(getFieldValue(field.id));
  };

  const handleSave = async (fieldId: number) => {
    try {
      await updateValue.mutateAsync({
        intakeId,
        fieldDefinitionId: fieldId,
        value: editValue || null,
      });
      toast({ title: "Saved" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
    setEditingFieldId(null);
  };

  const handleCancel = () => {
    setEditingFieldId(null);
    setEditValue("");
  };

  const parseMultiSelectValue = (value: string): string[] => {
    if (!value) return [];
    try { return JSON.parse(value); } catch { return value ? [value] : []; }
  };

  const toggleMultiSelectOption = (opt: string) => {
    const current = parseMultiSelectValue(editValue);
    const updated = current.includes(opt) ? current.filter(v => v !== opt) : [...current, opt];
    setEditValue(JSON.stringify(updated));
  };

  const renderFieldInput = (field: CustomFieldDefinition) => {
    switch (field.fieldType) {
      case "checkbox":
        return (
          <Checkbox
            checked={editValue === "true"}
            onCheckedChange={(checked) => setEditValue(checked ? "true" : "false")}
            data-testid={`input-intake-custom-field-${field.id}`}
          />
        );
      case "select":
        return (
          <Select value={editValue} onValueChange={setEditValue}>
            <SelectTrigger data-testid={`select-intake-custom-field-${field.id}`}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {(field.options as string[] || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "resource":
        return (
          <Select value={editValue} onValueChange={setEditValue}>
            <SelectTrigger data-testid={`select-intake-resource-custom-field-${field.id}`}>
              <SelectValue placeholder="Select resource..." />
            </SelectTrigger>
            <SelectContent>
              {orgResources.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "attachment":
        return (
          <AttachmentFieldInput
            value={editValue}
            onChange={setEditValue}
            testId={`attachment-intake-custom-field-${field.id}`}
          />
        );
      case "multiselect": {
        const selectedValues = parseMultiSelectValue(editValue);
        return (
          <div className="flex flex-wrap gap-1" data-testid={`multiselect-intake-custom-field-${field.id}`}>
            {(field.options as string[] || []).map((opt) => (
              <Badge
                key={opt}
                variant={selectedValues.includes(opt) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleMultiSelectOption(opt)}
                data-testid={`option-intake-${field.id}-${opt}`}
              >{opt}</Badge>
            ))}
          </div>
        );
      }
      case "date":
        return <Input type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-intake-custom-field-${field.id}`} />;
      case "number":
        return <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-intake-custom-field-${field.id}`} />;
      case "url":
        return <Input type="url" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="https://..." data-testid={`input-intake-custom-field-${field.id}`} />;
      default:
        return <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} data-testid={`input-intake-custom-field-${field.id}`} />;
    }
  };

  const renderFieldValue = (field: CustomFieldDefinition) => {
    const value = getFieldValue(field.id);
    if (field.fieldType === "autonumber") {
      if (!value) return <span className="text-muted-foreground text-sm italic" data-testid={`value-intake-autonumber-pending-${field.id}`}>Pending…</span>;
      return <span className="text-sm font-mono font-medium" data-testid={`value-intake-autonumber-${field.id}`}>{value}</span>;
    }
    if (field.fieldType === "attachment") {
      return <AttachmentFieldDisplay value={value} testId={`value-intake-attachment-${field.id}`} />;
    }
    if (!value) return <span className="text-muted-foreground text-sm" data-testid={`value-intake-empty-${field.id}`}>Not set</span>;

    switch (field.fieldType) {
      case "checkbox":
        return value === "true"
          ? <Check className="h-4 w-4 text-green-600" data-testid={`value-intake-check-${field.id}`} />
          : <X className="h-4 w-4 text-muted-foreground" data-testid={`value-intake-uncheck-${field.id}`} />;
      case "url":
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="underline text-sm flex items-center gap-1" data-testid={`link-intake-custom-field-${field.id}`}>
            {value.length > 30 ? value.substring(0, 30) + "..." : value}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
      case "multiselect": {
        const selected = parseMultiSelectValue(value);
        return (
          <div className="flex flex-wrap gap-1" data-testid={`value-intake-multiselect-${field.id}`}>
            {selected.map((v) => <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>)}
          </div>
        );
      }
      case "date":
        return <span className="text-sm" data-testid={`value-intake-date-${field.id}`}>{format(new Date(value), 'MMM d, yyyy')}</span>;
      case "resource": {
        const resource = orgResources.find(r => String(r.id) === String(value));
        return <span className="text-sm" data-testid={`value-intake-resource-${field.id}`}>{resource?.displayName ?? "Unknown resource"}</span>;
      }
      default:
        return <span className="text-sm" data-testid={`value-intake-text-${field.id}`}>{value}</span>;
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border" data-testid="section-intake-custom-fields">
      <div className="flex items-center gap-2 mb-3">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Custom Fields</Label>
        <Badge variant="secondary" className="text-[10px]">{definitions.length}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        {definitions.map((field) => (
          <div key={field.id} className="space-y-2" data-testid={`intake-custom-field-${field.id}`}>
            <Label className="text-xs flex items-center gap-1">
              {field.name}
              {field.isRequired && <span className="text-destructive">*</span>}
            </Label>
            {editingFieldId === field.id ? (
              <div className="flex items-center gap-2">
                {renderFieldInput(field)}
                <Button size="icon" variant="ghost" onClick={() => handleSave(field.id)} data-testid={`button-save-intake-field-${field.id}`}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={handleCancel} data-testid={`button-cancel-intake-field-${field.id}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : field.fieldType === "autonumber" ? (
              <div
                className="flex items-center justify-between p-2 rounded min-h-[36px] border border-input bg-muted/30"
                data-testid={`display-intake-autonumber-field-${field.id}`}
              >
                {renderFieldValue(field)}
              </div>
            ) : (
              <div
                className={cn(
                  "flex items-center justify-between p-2 rounded min-h-[36px] border border-input",
                  !isLocked && "cursor-pointer hover-elevate"
                )}
                onClick={() => handleEdit(field)}
                data-testid={`button-edit-intake-field-${field.id}`}
              >
                {renderFieldValue(field)}
                {!isLocked && <Pencil className="h-3 w-3 text-muted-foreground" />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
