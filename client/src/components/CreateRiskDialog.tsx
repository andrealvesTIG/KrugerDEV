import { useState, useEffect } from "react";
import { useCreateRisk, useAiMitigationSuggestion } from "@/hooks/use-risks";
import { useProjects } from "@/hooks/use-projects";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
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
  dueDate: z.string().optional(),
  costExposure: z.string().optional(),
  riskScore: z.string().optional(),
  mitigationPlan: z.string().optional(),
});

interface CreateRiskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number | null;
  projectId?: number;
}

export function CreateRiskDialog({ open, onOpenChange, organizationId, projectId }: CreateRiskDialogProps) {
  const { toast } = useToast();
  const createRisk = useCreateRisk();
  const aiMitigationSuggestion = useAiMitigationSuggestion();
  const { data: projects } = useProjects(organizationId ?? null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);

  const defaultValues = {
    projectId: (projectId || undefined) as unknown as number,
    title: "",
    description: "",
    probability: "Medium" as "Low" | "Medium" | "High",
    impact: "Medium" as "Low" | "Medium" | "High",
    status: "Open",
    dueDate: "",
    costExposure: "",
    riskScore: "",
    mitigationPlan: "",
  };

  const form = useForm({
    resolver: zodResolver(riskFormSchema),
    defaultValues,
  });

  useEffect(() => {
    if (open && projectId) {
      form.reset({
        ...defaultValues,
        projectId,
      });
    }
  }, [open, projectId]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset(defaultValues);
    }
    onOpenChange(isOpen);
  };

  const onSubmit = (data: any) => {
    const payload = { ...data, dueDate: data.dueDate || null, costExposure: data.costExposure || null, riskScore: data.riskScore ? parseInt(data.riskScore) : null };
    createRisk.mutate(payload, {
      onSuccess: () => {
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Risk</DialogTitle>
            <DialogDescription>Add a new risk to track potential issues</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
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

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  {...form.register("dueDate")}
                  data-testid="input-risk-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Cost Exposure ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  {...form.register("costExposure")}
                  data-testid="input-risk-cost-exposure"
                  placeholder="$ amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Risk Score</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  {...form.register("riskScore")}
                  data-testid="input-risk-score"
                  placeholder="1-100"
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
                    const selectedProjectId = form.getValues("projectId");
                    const project = projects?.find((p) => p.id === selectedProjectId);
                    aiMitigationSuggestion.mutate(
                      {
                        title,
                        description: form.getValues("description"),
                        probability: form.getValues("probability"),
                        impact: form.getValues("impact"),
                        projectContext: project?.name,
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

            <DialogFooter>
              <Button
                type="submit"
                disabled={createRisk.isPending}
                data-testid="button-submit-risk"
              >
                {createRisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Risk
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
