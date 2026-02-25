import { useState, useEffect } from "react";
import { useCreateRisk, useAiMitigationSuggestion } from "@/hooks/use-risks";
import { useUpdateRiskResourceAssignments } from "@/hooks/use-resources";
import { useProjects } from "@/hooks/use-projects";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, ArrowUpToLine } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const riskFormSchema = z.object({
  projectId: z.number().min(1, "Please select a project"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  probability: z.enum(["Low", "Medium", "High"]),
  impact: z.enum(["Low", "Medium", "High"]),
  status: z.string(),
  mitigationPlan: z.string().optional(),
});

interface CreateRiskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | null;
  projectId?: number;
  projectName?: string;
  portfolioId?: number | null;
  portfolioName?: string;
}

export function CreateRiskDialog({ open, onOpenChange, organizationId, projectId, projectName, portfolioId, portfolioName }: CreateRiskDialogProps) {
  const { toast } = useToast();
  const createRisk = useCreateRisk();
  const aiMitigationSuggestion = useAiMitigationSuggestion();
  const updateRiskResources = useUpdateRiskResourceAssignments();
  const { data: projects } = useProjects(organizationId ?? null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [escalateToPortfolio, setEscalateToPortfolio] = useState(false);

  const defaultValues = {
    projectId: (projectId || undefined) as unknown as number,
    title: "",
    description: "",
    probability: "Medium" as "Low" | "Medium" | "High",
    impact: "Medium" as "Low" | "Medium" | "High",
    status: "Open",
    mitigationPlan: "",
  };

  const form = useForm({
    resolver: zodResolver(riskFormSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      form.reset({
        ...defaultValues,
        projectId: (projectId || undefined) as unknown as number,
      });
      setSelectedResourceIds([]);
      setEscalateToPortfolio(false);
    }
  }, [open, projectId]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset(defaultValues);
      setSelectedResourceIds([]);
      setEscalateToPortfolio(false);
    }
    onOpenChange(isOpen);
  };

  const selectedProjectId = form.watch("projectId");
  const selectedProject = projects?.find((p) => p.id === selectedProjectId);
  const effectiveProjectName = projectName || selectedProject?.name;

  const onSubmit = (data: any) => {
    const escalationData = escalateToPortfolio
      ? { escalatedToPortfolio: true, escalatedAt: new Date().toISOString() }
      : { escalatedToPortfolio: false, escalatedAt: null };

    createRisk.mutate({ ...data, ...escalationData }, {
      onSuccess: (newRisk: any) => {
        if (selectedResourceIds.length > 0 && newRisk?.id) {
          updateRiskResources.mutate({ riskId: newRisk.id, resourceIds: selectedResourceIds });
        }
        toast({ title: "Success", description: "Risk created successfully" });
        handleOpenChange(false);
      },
      onError: (err: any) => {
        if (err.limitExceeded) {
          setLimitError({ message: err.message, resourceType: err.resourceType });
          setLimitDialogOpen(true);
          handleOpenChange(false);
        } else {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      },
    });
  };

  return (
    <>
      <LimitExceededDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        resourceType={limitError?.resourceType}
        message={limitError?.message}
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Add New Risk</DialogTitle>
            <DialogDescription>Identify and track potential project risks.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 pt-4 flex-1 overflow-y-auto pr-1">
              {!projectId && (
                <div className="space-y-2">
                  <Label>Project <span className="text-destructive">*</span></Label>
                  <Controller
                    control={form.control}
                    name="projectId"
                    render={({ field, fieldState }) => (
                      <>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          value={field.value?.toString()}
                        >
                          <SelectTrigger
                            data-testid="select-risk-project"
                            className={fieldState.error ? "border-destructive" : ""}
                          >
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects?.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.error && (
                          <p className="text-sm text-destructive">{fieldState.error.message}</p>
                        )}
                      </>
                    )}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  {...form.register("title")}
                  data-testid="input-risk-title"
                  placeholder="Brief description of the risk"
                  className={form.formState.errors.title ? "border-destructive" : ""}
                />
                {form.formState.errors.title && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.title.message as string}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Probability</Label>
                  <Controller
                    control={form.control}
                    name="probability"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                        <SelectTrigger data-testid="select-risk-probability">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Impact</Label>
                  <Controller
                    control={form.control}
                    name="impact"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                        <SelectTrigger data-testid="select-risk-impact">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Controller
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Open"}>
                        <SelectTrigger data-testid="select-risk-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Open">Open</SelectItem>
                          <SelectItem value="Mitigated">Mitigated</SelectItem>
                          <SelectItem value="Occurred">Occurred</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  {...form.register("description")}
                  data-testid="input-risk-description"
                  placeholder="Detailed description of the risk"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Mitigation Plan</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const title = form.getValues("title");
                      if (!title) {
                        toast({
                          title: "Title Required",
                          description: "Please enter a risk title first to get AI suggestions",
                          variant: "destructive",
                        });
                        return;
                      }
                      aiMitigationSuggestion.mutate(
                        {
                          title,
                          description: form.getValues("description"),
                          probability: form.getValues("probability"),
                          impact: form.getValues("impact"),
                          projectContext: effectiveProjectName,
                        },
                        {
                          onSuccess: (data) => {
                            form.setValue("mitigationPlan", data.suggestion);
                            toast({
                              title: "AI Suggestion Generated",
                              description: "Mitigation plan has been populated",
                            });
                          },
                          onError: (err: any) => {
                            toast({
                              title: "Error",
                              description: err.message || "Failed to generate suggestions",
                              variant: "destructive",
                            });
                          },
                        }
                      );
                    }}
                    disabled={aiMitigationSuggestion.isPending}
                    data-testid="button-ai-suggest-mitigation"
                  >
                    {aiMitigationSuggestion.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" />
                        AI Suggest
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  {...form.register("mitigationPlan")}
                  data-testid="input-risk-mitigation"
                  placeholder="Steps to mitigate or handle the risk"
                />
              </div>

              <ResourceAssignment
                organizationId={organizationId}
                selectedResourceIds={selectedResourceIds}
                onSelectionChange={setSelectedResourceIds}
                label="Assigned Resources"
                projectId={selectedProjectId}
                projectName={effectiveProjectName}
              />

              {portfolioId && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <ArrowUpToLine className="h-4 w-4 text-purple-600" />
                    <div>
                      <Label className="text-sm font-medium">Escalate to Portfolio</Label>
                      <p className="text-xs text-muted-foreground">Make this risk visible in <span className="font-medium text-foreground">{portfolioName || 'portfolio'}</span></p>
                    </div>
                  </div>
                  <Switch checked={escalateToPortfolio} onCheckedChange={setEscalateToPortfolio} data-testid="switch-escalate-risk" />
                </div>
              )}
            </div>

            <DialogFooter className="pt-4 border-t mt-4 shrink-0">
              <Button
                type="submit"
                disabled={createRisk.isPending}
                data-testid="button-submit-risk"
              >
                {createRisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Risk
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
