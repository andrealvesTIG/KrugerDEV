import { useState, useEffect, useRef } from "react";
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
import { RISK_STATUSES, PROBABILITY_LEVELS, IMPACT_LEVELS, RISK_CATEGORIES } from "@shared/schema";
import { applyServerErrorsToForm } from "@/lib/serverErrors";
import { useResources } from "@/hooks/use-resources";

// Form schema mirrors what the server's insertRiskSchema accepts. We keep a
// local definition (rather than importing insertRiskSchema directly) because
// the create-risk UI surfaces only a small subset of fields, but the field
// names, types and nullability must match the server contract.
const riskFormSchema = z.object({
  projectId: z.number().min(1, "Please select a project"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  probability: z.enum(PROBABILITY_LEVELS),
  impact: z.enum(IMPACT_LEVELS),
  category: z.string().optional(),
  ownerId: z.string().optional(),
  status: z.string(),
  dueDate: z.string().optional(),
  // costExposure is `numeric` server-side -> string in the wire format.
  costExposure: z.string().optional(),
  // riskScore is `integer` server-side. Coerce empty string -> null and
  // numeric strings -> number to avoid sending NaN from parseInt(undefined).
  riskScore: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    }),
  mitigationPlan: z.string().optional(),
  // itemType has a server default of "risk", but we declare it explicitly so
  // the UI never accidentally posts an issue/risk ambiguity if defaults change.
  itemType: z.literal("risk").default("risk"),
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

  const { data: orgResources = [] } = useResources(organizationId);

  const defaultValues = {
    projectId: (projectId || undefined) as unknown as number,
    title: "",
    description: "",
    probability: "Possible" as (typeof PROBABILITY_LEVELS)[number],
    impact: "Moderate" as (typeof IMPACT_LEVELS)[number],
    category: "",
    ownerId: "",
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

  const prevOpenRef = useRef(false);
  useEffect(() => {
    // Only reset on `open` transitioning from false → true so mid-edit
    // projectId changes don't wipe user input.
    if (open && !prevOpenRef.current) {
      form.reset({
        ...defaultValues,
        projectId: projectId ?? (undefined as unknown as number),
      });
    }
    prevOpenRef.current = open;
  }, [open, projectId]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      form.reset(defaultValues);
    }
    onOpenChange(isOpen);
  };

  const onSubmit = (data: any) => {
    // riskScore is already coerced to number|null by the zod schema.
    const payload = {
      ...data,
      dueDate: data.dueDate || null,
      costExposure: data.costExposure || null,
      category: data.category || null,
      ownerId: data.ownerId || null,
      itemType: "risk" as const,
    };
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
          return;
        }
        // Map server-side validation errors (e.g. invalid status enum) onto
        // the corresponding form fields so users see the message inline.
        const { appliedFields, unknownMessage } = applyServerErrorsToForm(
          form,
          err?.message,
          [
            "projectId",
            "title",
            "description",
            "probability",
            "impact",
            "status",
            "dueDate",
            "costExposure",
            "riskScore",
            "mitigationPlan",
          ],
        );
        if (appliedFields.length === 0 || unknownMessage) {
          toast({
            title: "Error",
            description: unknownMessage || err.message,
            variant: "destructive",
          });
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
        <DialogContent className="sm:max-w-[560px]">
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
                <Label>Likelihood</Label>
                <Controller
                  control={form.control}
                  name="probability"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Possible"}>
                      <SelectTrigger data-testid="select-risk-probability">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROBABILITY_LEVELS.map(level => (
                          <SelectItem key={level} value={level}>{level}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Consequence</Label>
                <Controller
                  control={form.control}
                  name="impact"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Moderate"}>
                      <SelectTrigger data-testid="select-risk-impact">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPACT_LEVELS.map(level => (
                          <SelectItem key={level} value={level}>{level}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Select
                      onValueChange={(v) => field.onChange(v === "__clear__" ? "" : v)}
                      value={field.value || undefined}
                    >
                      <SelectTrigger data-testid="select-risk-category">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {field.value && <SelectItem value="__clear__">Clear selection</SelectItem>}
                        {RISK_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Owner</Label>
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => {
                    const active = orgResources.filter(r => r.isActive && r.userId);
                    return (
                      <Select
                        onValueChange={(v) => field.onChange(v === "__clear__" ? "" : v)}
                        value={field.value || undefined}
                      >
                        <SelectTrigger data-testid="select-risk-owner">
                          <SelectValue placeholder="Select owner..." />
                        </SelectTrigger>
                        <SelectContent>
                          {field.value && <SelectItem value="__clear__">Clear selection</SelectItem>}
                          {active.map(r => (
                            <SelectItem key={r.id} value={r.userId!}>{r.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field, fieldState }) => (
                  <>
                    <Select onValueChange={field.onChange} value={field.value || "Open"}>
                      <SelectTrigger
                        data-testid="select-risk-status"
                        className={fieldState.error ? "border-destructive" : ""}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>{status}</SelectItem>
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
