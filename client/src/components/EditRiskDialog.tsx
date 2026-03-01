import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, History, ChevronDown, ChevronUp, Sparkles, ArrowUpToLine } from "lucide-react";
import { Link } from "wouter";

const riskFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  probability: z.string(),
  impact: z.string(),
  status: z.string(),
  dueDate: z.string().optional(),
  costExposure: z.string().optional(),
  mitigationPlan: z.string(),
});

export type RiskFormData = z.infer<typeof riskFormSchema>;

export interface ChangeLogEntry {
  id: number;
  changedByName?: string | null;
  changedAt?: Date | string | null;
  changeSummary?: string | null;
  changeType?: string | null;
}

export interface EditRiskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  risk: {
    id: number;
    projectId: number;
    title: string;
    description?: string | null;
    probability?: string | null;
    impact?: string | null;
    status?: string | null;
    dueDate?: string | null;
    costExposure?: string | null;
    mitigationPlan?: string | null;
    escalatedToPortfolio?: boolean | null;
    escalatedAt?: Date | string | null;
    itemType?: string | null;
  } | null;
  onSubmit: (data: RiskFormData) => void;
  isSubmitting?: boolean;
  projectLink?: { name: string; id: number } | null;
  portfolioLink?: { name: string; id: number } | null;
  organizationId?: number | null;
  resourceIds?: number[];
  onResourcesChange?: (ids: number[]) => void;
  projectName?: string;
  portfolioId?: number | null;
  portfolioName?: string;
  escalateToPortfolio?: boolean;
  onEscalateChange?: (v: boolean) => void;
  onConvertToIssue?: () => void;
  isConverting?: boolean;
  history?: ChangeLogEntry[];
  historyLoading?: boolean;
  onAiSuggest?: (data: { title: string; description?: string; probability?: string; impact?: string; projectContext?: string }) => Promise<{ suggestion: string }>;
  isAiSuggesting?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function EditRiskDialog({
  open,
  onOpenChange,
  risk,
  onSubmit,
  isSubmitting = false,
  projectLink,
  portfolioLink,
  organizationId,
  resourceIds,
  onResourcesChange,
  projectName,
  portfolioId,
  portfolioName,
  escalateToPortfolio,
  onEscalateChange,
  onConvertToIssue,
  isConverting = false,
  history,
  historyLoading = false,
  onAiSuggest,
  isAiSuggesting = false,
  onDelete,
  isDeleting = false,
}: EditRiskDialogProps) {
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();
  const isIssue = risk?.itemType === 'issue';
  const itemLabel = isIssue ? 'Issue' : 'Risk';

  const form = useForm<RiskFormData>({
    resolver: zodResolver(riskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      probability: "Medium",
      impact: "Medium",
      status: "Open",
      dueDate: "",
      costExposure: "",
      mitigationPlan: "",
    },
  });

  useEffect(() => {
    if (risk) {
      form.reset({
        title: risk.title || "",
        description: risk.description || "",
        probability: risk.probability || "Medium",
        impact: risk.impact || "Medium",
        status: risk.status || "Open",
        dueDate: risk.dueDate ? risk.dueDate.substring(0, 10) : "",
        costExposure: risk.costExposure || "",
        mitigationPlan: risk.mitigationPlan || "",
      });
      setShowHistory(false);
    }
  }, [risk]);

  const handleSubmit = (data: RiskFormData) => {
    onSubmit({ ...data, dueDate: data.dueDate || null, costExposure: data.costExposure || null } as any);
  };

  const handleAiSuggest = async () => {
    if (!onAiSuggest) return;
    const title = form.getValues("title");
    if (!title) {
      toast({ title: "Title Required", description: "Please enter a risk title first to get AI suggestions", variant: "destructive" });
      return;
    }
    try {
      const result = await onAiSuggest({
        title,
        description: form.getValues("description"),
        probability: form.getValues("probability"),
        impact: form.getValues("impact"),
        projectContext: projectName,
      });
      form.setValue("mitigationPlan", result.suggestion);
      toast({ title: "AI Suggestion Generated", description: "Mitigation plan has been populated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate suggestions", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Edit {itemLabel}</DialogTitle>
          <DialogDescription>Modify the {itemLabel.toLowerCase()} details below.</DialogDescription>
        </DialogHeader>

        {(projectLink || portfolioLink) && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground border-b pb-3">
            {projectLink && (
              <>
                <span>Project:</span>
                <Link href={`/projects/${projectLink.id}`} className="text-primary hover:underline font-medium truncate max-w-[200px]" title={projectLink.name}>
                  {projectLink.name}
                </Link>
              </>
            )}
            {portfolioLink && (
              <>
                <span className="text-muted-foreground/50">|</span>
                <span>Portfolio:</span>
                <Link href={`/portfolios/${portfolioLink.id}`} className="text-primary hover:underline font-medium truncate max-w-[200px]" title={portfolioLink.name}>
                  {portfolioLink.name}
                </Link>
              </>
            )}
          </div>
        )}

        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-col gap-4 pt-4 flex-1 overflow-y-auto pr-1 [&_label]:relative [&_label]:z-10 [&_input]:focus-visible:ring-offset-0 [&_textarea]:focus-visible:ring-offset-0 [&_button[role=combobox]]:focus-visible:ring-offset-0">
            <div className="space-y-1.5 pb-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input {...form.register("title")} data-testid="input-risk-title" />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message as string || "Title is required"}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 pb-2">
              <div className="space-y-1.5">
                <Label>Probability</Label>
                <Controller control={form.control} name="probability" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger data-testid="select-risk-probability"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Impact</Label>
                <Controller control={form.control} name="impact" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger data-testid="select-risk-impact"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller control={form.control} name="status" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger data-testid="select-risk-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="Mitigated">Mitigated</SelectItem>
                      <SelectItem value="Occurred">Occurred</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-2">
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  {...form.register("dueDate")}
                  data-testid="input-risk-due-date"
                />
              </div>
              <div className="space-y-1.5">
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
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea {...form.register("description")} data-testid="input-risk-description" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Mitigation Plan</Label>
                {onAiSuggest && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAiSuggest}
                    disabled={isAiSuggesting}
                    data-testid="button-ai-suggest-mitigation"
                  >
                    {isAiSuggesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" />
                        AI Suggest
                      </>
                    )}
                  </Button>
                )}
              </div>
              <Textarea {...form.register("mitigationPlan")} placeholder="How will this risk be mitigated?" data-testid="input-risk-mitigation" />
            </div>

            {onResourcesChange && resourceIds !== undefined && (
              <ResourceAssignment
                organizationId={organizationId || null}
                selectedResourceIds={resourceIds}
                onSelectionChange={onResourcesChange}
                label="Assigned Resources"
                projectId={risk?.projectId}
                projectName={projectName}
              />
            )}

            {portfolioId && onEscalateChange && (
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <ArrowUpToLine className="h-4 w-4 text-purple-600" />
                  <div>
                    <Label className="text-sm font-medium">Escalate to Portfolio</Label>
                    <p className="text-xs text-muted-foreground">
                      Make this risk visible in <span className="font-medium text-foreground">{portfolioName || 'portfolio'}</span>
                    </p>
                  </div>
                </div>
                <Switch
                  checked={escalateToPortfolio}
                  onCheckedChange={onEscalateChange}
                  data-testid="switch-escalate-risk"
                />
              </div>
            )}
            {risk?.escalatedToPortfolio && risk.escalatedAt && (
              <p className="text-xs text-muted-foreground">
                Escalated on {new Date(risk.escalatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}

            {history !== undefined && (
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between px-0 hover:bg-transparent"
                  onClick={() => setShowHistory(!showHistory)}
                  data-testid="button-toggle-risk-history"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <History className="h-4 w-4" />
                    Change History
                  </span>
                  {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                {showHistory && (
                  <div className="mt-3 max-h-48 overflow-y-auto space-y-2">
                    {historyLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    ) : history && history.length > 0 ? (
                      history.map((log) => (
                        <div key={log.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="font-medium text-foreground">{log.changedByName || 'System'}</span>
                            <span>•</span>
                            <span>{new Date(log.changedAt!).toLocaleDateString()} {new Date(log.changedAt!).toLocaleTimeString()}</span>
                          </div>
                          <div className="mt-1">{log.changeSummary}</div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">No change history available</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between gap-2 pt-4 border-t mt-4 shrink-0">
            <div>
              {onConvertToIssue && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onConvertToIssue}
                  disabled={isConverting}
                  data-testid="button-convert-risk-to-issue"
                >
                  {isConverting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Convert to Issue
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-update-risk">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Risk
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

