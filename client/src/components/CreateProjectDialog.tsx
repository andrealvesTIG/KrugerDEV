import { useState, useMemo, useRef, useEffect } from "react";
import { useCreateProject } from "@/hooks/use-projects";
import { usePortfolios } from "@/hooks/use-portfolios";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertProjectSchema } from "@shared/schema";
import type { InsertProject } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn, normalizeSearch } from "@/lib/utils";
import { format } from "date-fns";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import plannerLogoPath from "@/assets/planner-logo.png";
import msprojectLogoPath from "@/assets/msproject-logo.png";
import {
  Plus,
  AlertCircle,
  CheckCircle,
  Loader2,
  ClipboardList,
  Download,
  RefreshCw,
  Upload,
  Crown,
  Database,
  Cloud,
  PenTool,
  FileSpreadsheet,
  Search,
} from "lucide-react";

type ProjectSource = "manual" | "planner" | "planner-premium" | "msproject";

interface PlannerPlan {
  id: string;
  title: string;
  createdDateTime: string;
  owner: string;
}

interface DataversePlan {
  id: string;
  title: string;
  createdDateTime: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  description?: string | null;
  isPremium: boolean;
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId?: number;
  portfolios?: any[];
  onProjectCreated?: (projectId: number) => void;
}

export function CreateProjectDialog({ open, onOpenChange, organizationId, portfolios: portfoliosProp, onProjectCreated }: CreateProjectDialogProps) {
  const { toast } = useToast();
  const createMutation = useCreateProject();
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);
  const [projectSource, setProjectSource] = useState<ProjectSource>("manual");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [plannerSearchTerm, setPlannerSearchTerm] = useState("");
  const [msProjectPortfolioId, setMsProjectPortfolioId] = useState<number | null>(null);
  const [isImportingMsProject, setIsImportingMsProject] = useState(false);
  const [selectedMsProjectFile, setSelectedMsProjectFile] = useState<File | null>(null);
  const msProjectFileInputRef = useRef<HTMLInputElement>(null);

  const { data: portfoliosFetched } = usePortfolios(portfoliosProp ? null : (organizationId ?? null));
  const portfolios = portfoliosProp ?? portfoliosFetched ?? [];

  const { data: plannerStatus, refetch: refetchPlannerStatus } = useQuery<{ configured: boolean; connected: boolean }>({
    queryKey: ["/api/planner/status", organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/status?organizationId=${organizationId}`);
      if (!res.ok) throw new Error("Failed to fetch planner status");
      return res.json();
    },
    enabled: open && projectSource === "planner" && !!organizationId,
  });

  const { data: plannerPlans, isLoading: isLoadingPlans, refetch: refetchPlans } = useQuery<{ plans: PlannerPlan[] }>({
    queryKey: ["/api/planner/plans", organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/planner/plans?organizationId=${organizationId}`);
      if (!res.ok) throw new Error("Failed to fetch planner plans");
      return res.json();
    },
    enabled: open && projectSource === "planner" && plannerStatus?.connected === true && !!organizationId,
  });

  const connectPlanner = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/planner/connect", { organizationId });
      return response.json();
    },
    onSuccess: (data: { authUrl: string }) => {
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to connect to Planner", variant: "destructive" });
    },
  });

  const importFromPlanner = useMutation({
    mutationFn: async ({ planId, portfolioId }: { planId: string; portfolioId: number | null }) => {
      const response = await apiRequest("POST", "/api/planner/import", { planId, organizationId, portfolioId });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Success", description: data.message || "Project imported successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      setSelectedPlanId(null);
      setProjectSource("manual");
    },
    onError: (err: any) => {
      if (err.limitExceeded) {
        setLimitError({ message: err.message, resourceType: err.resourceType });
        setLimitDialogOpen(true);
        onOpenChange(false);
      } else if (err.status === 401) {
        toast({ title: "Session Expired", description: "Please reconnect to Planner", variant: "destructive" });
        refetchPlannerStatus();
      } else {
        toast({ title: "Error", description: err.message || "Failed to import from Planner", variant: "destructive" });
      }
    },
  });

  const [dataverseEnvUrl, setDataverseEnvUrl] = useState("");
  const [dataverseSearchTerm, setDataverseSearchTerm] = useState("");
  const [selectedDataversePlanIds, setSelectedDataversePlanIds] = useState<Set<string>>(new Set());

  const { data: dataverseStatus, refetch: refetchDataverseStatus } = useQuery<{
    configured: boolean;
    connected: boolean;
    environmentUrl: string | null;
  }>({
    queryKey: ["/api/dataverse/status"],
    enabled: open && projectSource === "planner-premium",
  });

  const { data: dataversePlans, isLoading: isLoadingDataversePlans, refetch: refetchDataversePlans } = useQuery<{ plans: DataversePlan[] }>({
    queryKey: ["/api/dataverse/plans"],
    enabled: open && projectSource === "planner-premium" && dataverseStatus?.connected === true,
  });

  const setDataverseEnvironment = useMutation({
    mutationFn: async (environmentUrl: string) => {
      const response = await apiRequest("POST", "/api/dataverse/set-environment", { environmentUrl });
      return response.json();
    },
    onSuccess: () => {
      refetchDataverseStatus();
      toast({ title: "Success", description: "Dataverse environment configured" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to set environment URL", variant: "destructive" });
    },
  });

  const connectDataverse = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/dataverse/connect", { returnUrl: "/projects" });
      return response.json();
    },
    onSuccess: (data: { authUrl: string }) => {
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to connect to Dataverse", variant: "destructive" });
    },
  });

  const importFromDataverse = useMutation({
    mutationFn: async ({ planIds, portfolioId }: { planIds: string[]; portfolioId: number | null }) => {
      const results = [];
      for (const planId of planIds) {
        const response = await apiRequest("POST", "/api/dataverse/import", { planId, organizationId, portfolioId });
        results.push(await response.json());
      }
      return { count: planIds.length, results };
    },
    onSuccess: (data: any) => {
      toast({ title: "Success", description: `${data.count} Premium plan${data.count > 1 ? "s" : ""} imported successfully` });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      setSelectedDataversePlanIds(new Set());
      setProjectSource("manual");
    },
    onError: (err: any) => {
      if (err.limitExceeded) {
        setLimitError({ message: err.message, resourceType: err.resourceType });
        setLimitDialogOpen(true);
        onOpenChange(false);
      } else if (err.status === 401) {
        toast({ title: "Session Expired", description: "Please reconnect to Dataverse", variant: "destructive" });
        refetchDataverseStatus();
      } else {
        toast({ title: "Error", description: err.message || "Failed to import Premium plan", variant: "destructive" });
      }
    },
  });

  const filteredDataversePlans = useMemo(() => {
    if (!dataversePlans?.plans) return [];
    if (!dataverseSearchTerm.trim()) return dataversePlans.plans;
    const term = normalizeSearch(dataverseSearchTerm);
    return dataversePlans.plans.filter((plan) => normalizeSearch(plan.title).includes(term));
  }, [dataversePlans?.plans, dataverseSearchTerm]);

  const form = useForm<InsertProject>({
    resolver: zodResolver(
      insertProjectSchema.extend({
        name: z.string().min(1, "Project name is required"),
        organizationId: z.number().nullable().optional(),
        startDate: z.string().nullable().optional().transform((v) => v || null),
        endDate: z.string().nullable().optional().transform((v) => v || null),
        budget: z.string().nullable().optional().transform((v) => v || "0"),
      }).refine(
        (data) => {
          if (data.startDate && data.endDate) {
            return new Date(data.endDate) >= new Date(data.startDate);
          }
          return true;
        },
        { message: "End date cannot be before start date", path: ["endDate"] }
      )
    ),
    defaultValues: {
      name: "",
      description: "",
      priority: "Medium",
      status: "Initiation",
      budget: 0,
      startDate: undefined,
      endDate: undefined,
      organizationId: organizationId || undefined,
    },
  });

  useEffect(() => {
    if (organizationId) {
      form.setValue("organizationId", organizationId);
    }
  }, [organizationId, form]);

  const onSubmit = (data: InsertProject) => {
    const cleanedData = {
      ...data,
      organizationId: organizationId!,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      budget: Number(data.budget) || 0,
    };
    createMutation.mutate(cleanedData, {
      onSuccess: (newProject: any) => {
        toast({ title: "Success", description: "Project created successfully" });
        onOpenChange(false);
        form.reset();
        if (newProject?.id && onProjectCreated) {
          onProjectCreated(newProject.id);
        }
      },
      onError: (err: any) => {
        if (err.limitExceeded) {
          setLimitError({ message: err.message, resourceType: err.resourceType });
          setLimitDialogOpen(true);
          onOpenChange(false);
        } else {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      },
    });
  };

  const handlePlannerImport = () => {
    if (!selectedPlanId) {
      toast({ title: "Select a Plan", description: "Please select a Planner plan to import", variant: "destructive" });
      return;
    }
    importFromPlanner.mutate({ planId: selectedPlanId, portfolioId: selectedPortfolioId });
  };

  const selectedPlan = plannerPlans?.plans?.find((p) => p.id === selectedPlanId);

  const filteredPlannerPlans = useMemo(() => {
    if (!plannerPlans?.plans) return [];
    if (!plannerSearchTerm.trim()) return plannerPlans.plans;
    const searchLower = normalizeSearch(plannerSearchTerm).trim();
    return plannerPlans.plans.filter((plan) => normalizeSearch(plan.title).includes(searchLower));
  }, [plannerPlans?.plans, plannerSearchTerm]);

  const handleMsProjectFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedMsProjectFile(file);
  };

  const handleMsProjectImport = async () => {
    if (!selectedMsProjectFile) {
      toast({ title: "Select a File", description: "Please select an MS Project file to import", variant: "destructive" });
      return;
    }
    setIsImportingMsProject(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedMsProjectFile);
      if (organizationId) formData.append("organizationId", organizationId.toString());
      if (msProjectPortfolioId) formData.append("portfolioId", msProjectPortfolioId.toString());

      const uploadResponse = await fetch("/api/mpp-imports/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.message || "Upload failed");
      }

      const importRecord = await uploadResponse.json();

      const response = await fetch(`/api/mpp-imports/${importRecord.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importRecord.fileName.replace(/\.[^/.]+$/, ""),
          portfolioId: msProjectPortfolioId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }

      const result = await response.json();
      toast({ title: "Success", description: result.message || "Project imported successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      setSelectedMsProjectFile(null);
      setMsProjectPortfolioId(null);
      setProjectSource("manual");
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message || "Could not import MS Project file", variant: "destructive" });
    } finally {
      setIsImportingMsProject(false);
      if (msProjectFileInputRef.current) msProjectFileInputRef.current.value = "";
    }
  };

  return (
    <>
      <LimitExceededDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        resourceType={limitError?.resourceType}
        message={limitError?.message}
      />
      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) {
            setProjectSource("manual");
            setSelectedPlanId(null);
            setPlannerSearchTerm("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProjectSource("manual")}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
                projectSource === "manual" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              )}
              data-testid="button-source-manual"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <PenTool className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-center">Create Manually</span>
            </button>

            <button
              type="button"
              onClick={() => setProjectSource("planner")}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
                projectSource === "planner" ? "border-indigo-500 bg-indigo-500/5" : "border-border hover:border-indigo-500/50"
              )}
              data-testid="button-source-planner"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center relative">
                <img src={plannerLogoPath} alt="Planner" className="h-5 w-5" />
                <Cloud className="h-3 w-3 text-indigo-600 absolute -top-1 -right-1" />
              </div>
              <span className="text-xs font-medium text-center">Planner</span>
            </button>

            <button
              type="button"
              onClick={() => setProjectSource("planner-premium")}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
                projectSource === "planner-premium" ? "border-purple-500 bg-purple-500/5" : "border-border hover:border-purple-500/50"
              )}
              data-testid="button-source-planner-premium"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center relative">
                <img src={plannerLogoPath} alt="Planner Premium" className="h-5 w-5" />
                <Crown className="h-3 w-3 text-purple-600 absolute -top-1 -right-1" />
              </div>
              <span className="text-xs font-medium text-center">Premium</span>
            </button>

            <button
              type="button"
              onClick={() => setProjectSource("msproject")}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all hover-elevate",
                projectSource === "msproject" ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-emerald-500/50"
              )}
              data-testid="button-source-msproject"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center relative">
                <img src={msprojectLogoPath} alt="MS Project" className="h-5 w-5" />
                <FileSpreadsheet className="h-3 w-3 text-emerald-600 absolute -top-1 -right-1" />
              </div>
              <span className="text-xs font-medium text-center">MS Project</span>
            </button>
          </div>

          {projectSource === "manual" && (
            <form
              onSubmit={form.handleSubmit(onSubmit, (errors) => {
                const firstError = Object.values(errors)[0];
                const message = firstError?.message || "Please check the form fields and try again";
                toast({ title: "Validation Error", description: String(message), variant: "destructive" });
              })}
              className="space-y-4 pt-2"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="cp-name">Project Name</Label>
                  <Input id="cp-name" {...form.register("name")} placeholder="Project Alpha" data-testid="input-project-name" />
                  {form.formState.errors.name && <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>}
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="cp-portfolioId">Portfolio</Label>
                  <Controller
                    control={form.control}
                    name="portfolioId"
                    render={({ field }) => (
                      <Select
                        onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                        value={field.value?.toString() || "none"}
                      >
                        <SelectTrigger data-testid="select-portfolio">
                          <SelectValue placeholder="Select Portfolio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Portfolio</SelectItem>
                          {portfolios.map((p: any) => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cp-priority">Priority</Label>
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue placeholder="Select Priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cp-budget">Budget ($)</Label>
                  <Input id="cp-budget" type="number" {...form.register("budget")} data-testid="input-budget" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cp-startDate">Start Date</Label>
                  <Input id="cp-startDate" type="date" {...form.register("startDate")} data-testid="input-start-date" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cp-endDate">End Date</Label>
                  <Input id="cp-endDate" type="date" {...form.register("endDate")} data-testid="input-end-date" />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="cp-description">Description</Label>
                  <Textarea id="cp-description" {...form.register("description")} data-testid="input-description" />
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-project">
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus />
                      Create Project
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}

          {projectSource === "planner" && (
            <div className="space-y-4 pt-2">
              {!plannerStatus?.configured ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Microsoft 365 is not configured.</p>
                  <p className="text-sm text-muted-foreground mt-1">Contact your administrator to set up the integration.</p>
                </div>
              ) : !plannerStatus?.connected ? (
                <div className="text-center py-8">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-4">Connect to Microsoft Planner to import plans</p>
                  <Button onClick={() => connectPlanner.mutate()} disabled={connectPlanner.isPending} data-testid="button-connect-planner">
                    {connectPlanner.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Connect to Planner
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Connected to Microsoft Planner</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => refetchPlans()} disabled={isLoadingPlans} data-testid="button-refresh-plans">
                      <RefreshCw className={cn("h-4 w-4", isLoadingPlans && "animate-spin")} />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Select Plan to Import</Label>
                    {isLoadingPlans ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !plannerPlans?.plans?.length ? (
                      <div className="text-center py-8 border rounded-md bg-muted/20">
                        <p className="text-muted-foreground">No plans found in your Planner account.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search plans..."
                            value={plannerSearchTerm}
                            onChange={(e) => setPlannerSearchTerm(e.target.value)}
                            className="pl-9"
                            data-testid="input-planner-search"
                          />
                        </div>
                        {filteredPlannerPlans.length === 0 ? (
                          <div className="text-center py-4 text-sm text-muted-foreground">No plans match "{plannerSearchTerm}"</div>
                        ) : (
                          <div className="grid gap-2 max-h-[200px] overflow-y-auto">
                            {filteredPlannerPlans.map((plan) => (
                              <div
                                key={plan.id}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors hover-elevate",
                                  selectedPlanId === plan.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                                )}
                                onClick={() => setSelectedPlanId(plan.id)}
                                data-testid={`plan-option-${plan.id}`}
                              >
                                <ClipboardList className="h-5 w-5 text-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{plan.title}</p>
                                  <p className="text-xs text-muted-foreground">Created {format(new Date(plan.createdDateTime), "MMM d, yyyy")}</p>
                                </div>
                                {selectedPlanId === plan.id && <CheckCircle className="h-5 w-5 text-primary shrink-0" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Target Portfolio (Optional)</Label>
                    <Select
                      onValueChange={(val) => setSelectedPortfolioId(val === "none" ? null : parseInt(val))}
                      value={selectedPortfolioId?.toString() || "none"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Portfolio</SelectItem>
                        {portfolios.map((p: any) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPlan && (
                    <div className="p-3 bg-muted/30 rounded-md">
                      <p className="text-sm">
                        Importing <strong>{selectedPlan.title}</strong> will create a new project with all tasks from this Planner plan.
                      </p>
                    </div>
                  )}

                  <DialogFooter>
                    <Button onClick={handlePlannerImport} disabled={!selectedPlanId || importFromPlanner.isPending} data-testid="button-import-planner">
                      {importFromPlanner.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Import Project
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}

          {projectSource === "planner-premium" && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                <div className="relative">
                  <img src={plannerLogoPath} alt="Planner Premium" className="h-8 w-8" />
                  <Crown className="h-4 w-4 text-purple-600 absolute -top-1 -right-1" />
                </div>
                <div>
                  <p className="font-medium">Planner Premium</p>
                  <p className="text-sm text-muted-foreground">Import from Project for the Web via Dataverse</p>
                </div>
              </div>

              {!dataverseStatus?.configured ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Microsoft 365 is not configured.</p>
                  <p className="text-sm text-muted-foreground mt-1">Contact your administrator to set up the integration.</p>
                </div>
              ) : !dataverseStatus?.environmentUrl ? (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <Database className="h-12 w-12 mx-auto text-purple-500 mb-3" />
                    <p className="text-muted-foreground mb-2">Configure your Dataverse environment</p>
                    <p className="text-xs text-muted-foreground">Required for accessing Premium Planner plans</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Dataverse Environment URL</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://yourorg.crm.dynamics.com"
                        value={dataverseEnvUrl}
                        onChange={(e) => setDataverseEnvUrl(e.target.value)}
                        data-testid="input-dataverse-url"
                      />
                      <Button
                        onClick={() => setDataverseEnvironment.mutate(dataverseEnvUrl)}
                        disabled={!dataverseEnvUrl || setDataverseEnvironment.isPending}
                        data-testid="button-set-dataverse-env"
                      >
                        {setDataverseEnvironment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Find your URL in Power Platform Admin Center</p>
                  </div>
                </div>
              ) : !dataverseStatus?.connected ? (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 mx-auto text-purple-500 mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">Environment: {dataverseStatus.environmentUrl}</p>
                  <p className="text-muted-foreground mb-4">Connect to Dataverse to import Premium plans</p>
                  <Button
                    onClick={() => connectDataverse.mutate()}
                    disabled={connectDataverse.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="button-connect-dataverse"
                  >
                    {connectDataverse.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Database className="mr-2 h-4 w-4" />
                        Connect to Dataverse
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Connected to Dataverse</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchDataversePlans()}
                      disabled={isLoadingDataversePlans}
                      data-testid="button-refresh-dataverse-plans"
                    >
                      <RefreshCw className={cn("h-4 w-4", isLoadingDataversePlans && "animate-spin")} />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Select Premium Plans to Import</Label>
                      {dataversePlans?.plans?.length ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (selectedDataversePlanIds.size === filteredDataversePlans.length) {
                              setSelectedDataversePlanIds(new Set());
                            } else {
                              setSelectedDataversePlanIds(new Set(filteredDataversePlans.map((p) => p.id)));
                            }
                          }}
                          className="text-xs h-7"
                          data-testid="button-select-all-plans"
                        >
                          {selectedDataversePlanIds.size === filteredDataversePlans.length ? "Deselect All" : "Select All"}
                        </Button>
                      ) : null}
                    </div>
                    {isLoadingDataversePlans ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !dataversePlans?.plans?.length ? (
                      <div className="text-center py-8 border rounded-md bg-muted/20">
                        <p className="text-muted-foreground">No Premium plans found in your Dataverse environment.</p>
                        <p className="text-xs text-muted-foreground mt-1">Make sure you have access to Project for the Web.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search Premium plans..."
                            value={dataverseSearchTerm}
                            onChange={(e) => setDataverseSearchTerm(e.target.value)}
                            className="pl-9"
                            data-testid="input-dataverse-search"
                          />
                        </div>
                        {filteredDataversePlans.length === 0 ? (
                          <div className="text-center py-4 text-sm text-muted-foreground">No plans match "{dataverseSearchTerm}"</div>
                        ) : (
                          <div className="grid gap-2 max-h-[200px] overflow-y-auto overflow-x-hidden">
                            {filteredDataversePlans.map((plan) => {
                              const isSelected = selectedDataversePlanIds.has(plan.id);
                              return (
                                <div
                                  key={plan.id}
                                  className={cn(
                                    "flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors hover-elevate overflow-hidden",
                                    isSelected ? "border-purple-500 bg-purple-500/5" : "border-border hover:border-purple-500/50"
                                  )}
                                  onClick={(e) => {
                                    const newSet = new Set(selectedDataversePlanIds);
                                    if (isSelected) {
                                      newSet.delete(plan.id);
                                    } else {
                                      newSet.add(plan.id);
                                    }
                                    setSelectedDataversePlanIds(newSet);
                                  }}
                                  data-testid={`dataverse-plan-option-${plan.id}`}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(selectedDataversePlanIds);
                                      if (checked) {
                                        newSet.add(plan.id);
                                      } else {
                                        newSet.delete(plan.id);
                                      }
                                      setSelectedDataversePlanIds(newSet);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0"
                                    data-testid={`checkbox-plan-${plan.id}`}
                                  />
                                  <div className="relative shrink-0">
                                    <ClipboardList className="h-5 w-5 text-purple-600" />
                                    <Crown className="h-3 w-3 text-purple-500 absolute -top-1 -right-1" />
                                  </div>
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <p className="font-medium truncate">{plan.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Created {format(new Date(plan.createdDateTime), "MMM d, yyyy")}
                                    </p>
                                  </div>
                                  {isSelected && <CheckCircle className="h-5 w-5 text-purple-600 shrink-0" />}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Target Portfolio (Optional)</Label>
                    <Select
                      onValueChange={(val) => setSelectedPortfolioId(val === "none" ? null : parseInt(val))}
                      value={selectedPortfolioId?.toString() || "none"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Portfolio</SelectItem>
                        {portfolios.map((p: any) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedDataversePlanIds.size > 0 && (
                    <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-md">
                      <p className="text-sm">
                        {selectedDataversePlanIds.size === 1 ? (
                          <>
                            Importing <strong>{filteredDataversePlans.find((p) => selectedDataversePlanIds.has(p.id))?.title}</strong> will create a
                            new project with all tasks from this Premium plan.
                          </>
                        ) : (
                          <>
                            Importing <strong>{selectedDataversePlanIds.size} plans</strong> will create {selectedDataversePlanIds.size} new projects
                            with all tasks from these Premium plans.
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  <DialogFooter>
                    <Button
                      onClick={() => {
                        if (selectedDataversePlanIds.size === 0) {
                          toast({ title: "Select Plans", description: "Please select at least one Premium plan to import", variant: "destructive" });
                          return;
                        }
                        importFromDataverse.mutate({ planIds: Array.from(selectedDataversePlanIds), portfolioId: selectedPortfolioId });
                      }}
                      disabled={selectedDataversePlanIds.size === 0 || importFromDataverse.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="button-import-dataverse"
                    >
                      {importFromDataverse.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Import {selectedDataversePlanIds.size > 1 ? `${selectedDataversePlanIds.size} Plans` : "Premium Plan"}
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}

          {projectSource === "msproject" && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 p-4 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <img src={msprojectLogoPath} alt="MS Project" className="h-8 w-8" />
                <div>
                  <p className="font-medium">Import from MS Project</p>
                  <p className="text-sm text-muted-foreground">Upload .mpp, .xml (MSPDI), or .csv project files</p>
                </div>
              </div>

              <input
                type="file"
                ref={msProjectFileInputRef}
                onChange={handleMsProjectFileSelect}
                accept=".mpp,.xml,.csv"
                className="hidden"
                data-testid="input-msproject-file"
              />

              <div className="space-y-2">
                <Label>Select Project File</Label>
                <div
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-all hover-elevate",
                    selectedMsProjectFile ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-emerald-500/50"
                  )}
                  onClick={() => msProjectFileInputRef.current?.click()}
                  data-testid="dropzone-msproject"
                >
                  {selectedMsProjectFile ? (
                    <>
                      <div className="flex items-center gap-2">
                        <img src={msprojectLogoPath} alt="MS Project" className="h-5 w-5" />
                        <span className="font-medium">{selectedMsProjectFile.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{(selectedMsProjectFile.size / 1024).toFixed(1)} KB</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMsProjectFile(null);
                          if (msProjectFileInputRef.current) msProjectFileInputRef.current.value = "";
                        }}
                      >
                        Choose Different File
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to select a file</p>
                      <p className="text-xs text-muted-foreground">Supports .mpp, .xml, .csv</p>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Portfolio (Optional)</Label>
                <Select
                  onValueChange={(val) => setMsProjectPortfolioId(val === "none" ? null : parseInt(val))}
                  value={msProjectPortfolioId?.toString() || "none"}
                >
                  <SelectTrigger data-testid="select-msproject-portfolio">
                    <SelectValue placeholder="Select Portfolio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Portfolio</SelectItem>
                    {portfolios.map((p: any) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMsProjectFile && (
                <div className="p-3 bg-muted/30 rounded-md">
                  <p className="text-sm">
                    Importing <strong>{selectedMsProjectFile.name}</strong> will create a new project with all tasks from this file.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button onClick={handleMsProjectImport} disabled={!selectedMsProjectFile || isImportingMsProject} data-testid="button-import-msproject">
                  {isImportingMsProject ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Import Project
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
