import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, useLocation } from "wouter";
import { useIntakeWorkflows } from "@/hooks/use-intake-workflow";
import { Plus, Search, FileInput, Check, Clock, XCircle, ChevronRight, ChevronDown, MoreVertical, Trash2, Eye, Gavel, Calendar, DollarSign, AlertCircle, FolderOpen, ChevronsUpDown, BarChart3, Timer } from "lucide-react";
import {
  WorkflowProgress,
  useResolvedWorkflowSteps,
  DEFAULT_WORKFLOW_STEPS,
} from "@/components/intake/IntakeWorkflowProgress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { CompactCurrency } from "@/components/CompactCurrency";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolios } from "@/hooks/use-portfolios";
import { motion } from "framer-motion";
import { cn, normalizeSearch } from "@/lib/utils";
import type { ProjectIntake, Portfolio } from "@shared/schema";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";

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

function WorkflowGateLabel({
  workflowId,
  currentStep,
}: {
  workflowId?: number | null;
  currentStep: string;
}) {
  const { steps } = useResolvedWorkflowSteps(workflowId);
  const step = steps.find(s => s.key === currentStep)
    ?? DEFAULT_WORKFLOW_STEPS.find(s => s.key === currentStep);
  return <>Gate: {step?.label || "Unknown"}</>;
}

interface CreateIntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolios: Portfolio[];
  organizationId?: number;
  workflowId?: number | null;
}

function CreateIntakeDialog({ open, onOpenChange, portfolios, organizationId, workflowId }: CreateIntakeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [intakeName, setIntakeName] = useState("");
  const [description, setDescription] = useState("");
  const [portfolioId, setPortfolioId] = useState<string>("");
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [fundingSource, setFundingSource] = useState("");
  const [businessUnit, setBu] = useState("");
  const [limitError, setLimitError] = useState<{ resourceType: string } | null>(null);

  const createIntake = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/project-intakes', data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || "Failed to create intake") as any;
        error.limitExceeded = errorData.limitExceeded;
        error.resourceType = errorData.resourceType;
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Success", description: "Intake request created successfully" });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => {
      if (err.limitExceeded) {
        setLimitError({ resourceType: err.resourceType || "intakes" });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    }
  });

  const resetForm = () => {
    setIntakeName("");
    setDescription("");
    setPortfolioId("");
    setFundingSource("");
    setBu("");
  };

  const handleSubmit = () => {
    if (!intakeName.trim()) {
      toast({ title: "Validation Error", description: "Intake name is required", variant: "destructive" });
      return;
    }

    createIntake.mutate({
      organizationId,
      projectName: intakeName,
      description,
      portfolioId: portfolioId ? parseInt(portfolioId) : null,
      fundingSource,
      businessUnit: businessUnit,
      submitterId: user?.id,
      currentStep: "intake_capture",
      workflowId: workflowId ?? undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Intake Request</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mt-2"><span className="text-destructive">*</span> Required fields</p>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="intakeName">Intake Name <span className="text-destructive">*</span></Label>
            <Input
              id="intakeName"
              value={intakeName}
              onChange={(e) => setIntakeName(e.target.value)}
              placeholder="Enter a descriptive name for this request"
              data-testid="input-intake-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description / Problem Statement</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the problem, opportunity, or request..."
              rows={3}
              data-testid="input-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Portfolio</Label>
              <Popover open={portfolioOpen} onOpenChange={setPortfolioOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={portfolioOpen}
                    className="w-full h-9 justify-between font-normal bg-background hover:bg-background active:bg-background [border-color:hsl(var(--input))] shadow-none no-default-hover-elevate no-default-active-elevate"
                    data-testid="select-portfolio"
                  >
                    <span className={cn("truncate", !portfolioId && "text-muted-foreground")}>
                      {portfolioId
                        ? portfolios?.find((p: Portfolio) => p.id.toString() === portfolioId)?.name ?? "Assign to portfolio"
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
                              setPortfolioId(p.id.toString());
                              setPortfolioOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                portfolioId === p.id.toString()
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
            <div className="space-y-2">
              <Label>Funding Source</Label>
              <Select value={fundingSource} onValueChange={setFundingSource}>
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="bu">Requesting Business Unit</Label>
            <Select value={businessUnit} onValueChange={setBu}>
              <SelectTrigger data-testid="select-business-unit">
                <SelectValue placeholder="Select business unit" />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createIntake.isPending} data-testid="button-submit-intake">
            {createIntake.isPending ? "Creating..." : "Submit Intake"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <LimitExceededDialog
        open={!!limitError}
        onOpenChange={(o) => !o && setLimitError(null)}
        resourceType={limitError?.resourceType || "intakes"}
      />
    </Dialog>
  );
}

interface PowerBIIntakeRequest {
  id: number;
  organizationId: number;
  requestNumber: string | null;
  submittedBy: string | null;
  status: string | null;
  reportType: string | null;
  reportName: string | null;
  description: string | null;
  numberOfPages: number | null;
  numberOfDrillDownPages: number | null;
  numberOfDataSources: number | null;
  dataSources: string | null;
  integrations: string | null;
  calculationComplexity: string | null;
  refreshFrequency: string | null;
  filtersAndSlicers: string | null;
  visualRequirements: string | null;
  securityRequirements: string | null;
  targetDeliveryDate: string | null;
  additionalNotes: string | null;
  estimatedEffortHours: number | null;
  effortBreakdown: Record<string, number> | null;
  projectIntakeId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function getPbiStatusBadge(status: string | null) {
  switch (status) {
    case "in_progress":
      return <Badge variant="default" className="bg-blue-500/20 text-blue-700 dark:text-blue-300">In Progress</Badge>;
    case "completed":
      return <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-300">Completed</Badge>;
    case "cancelled":
      return <Badge variant="default" className="bg-destructive/20 text-destructive">Cancelled</Badge>;
    case "new":
    default:
      return <Badge variant="default" className="bg-orange-500/20 text-orange-700 dark:text-orange-300">New</Badge>;
  }
}

function PowerBIRequestsSection({ organizationId }: { organizationId: number | undefined }) {
  const [pbiSearch, setPbiSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteRequestId, setDeleteRequestId] = useState<number | null>(null);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const { toast } = useToast();

  const deletePbiRequest = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/powerbi-agent/requests/${id}?organizationId=${organizationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/powerbi-agent/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Deleted", description: "Power BI request has been removed." });
      setDeleteRequestId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const convertPbiRequest = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/powerbi-agent/requests/${id}/convert?organizationId=${organizationId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/powerbi-agent/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Converted", description: `Project intake ${data.projectIntake?.intakeNumber || ''} has been created.` });
      setConvertingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setConvertingId(null);
    }
  });

  const { data: pbiRequests, isLoading: pbiLoading, isError: pbiError, refetch: pbiRefetch } = useQuery<PowerBIIntakeRequest[]>({
    queryKey: ['/api/powerbi-agent/requests', organizationId],
    queryFn: async () => {
      const res = await fetch(`/api/powerbi-agent/requests?organizationId=${organizationId}`);
      if (!res.ok) throw new Error('Failed to fetch Power BI requests');
      return res.json();
    },
    enabled: !!organizationId,
  });

  const pbiList = Array.isArray(pbiRequests) ? pbiRequests : [];
  const filteredPbi = pbiList.filter(r =>
    normalizeSearch(r.reportName || "").includes(normalizeSearch(pbiSearch)) ||
    normalizeSearch(r.requestNumber || "").includes(normalizeSearch(pbiSearch))
  );

  if (pbiLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (pbiError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">Failed to load Power BI requests</h3>
          <p className="text-sm text-muted-foreground mb-4">There was a problem fetching the data. Please try again.</p>
          <Button variant="outline" onClick={() => pbiRefetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <BarChart3 className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pbiList.length}</p>
                <p className="text-xs text-muted-foreground">Total Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pbiList.filter(r => r.status === "new").length}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Timer className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {pbiList.reduce((sum, r) => sum + (r.estimatedEffortHours || 0), 0)}h
                </p>
                <p className="text-xs text-muted-foreground">Total Est. Effort</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10 border-border"
            placeholder="Search Power BI requests..."
            value={pbiSearch}
            onChange={(e) => setPbiSearch(e.target.value)}
          />
        </div>
        <Link href="/powerbi-agent">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Power BI Request
          </Button>
        </Link>
      </div>

      {filteredPbi.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No Power BI requests found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {pbiSearch ? "Try adjusting your search" : "Use the Power BI Agent to submit a new request"}
            </p>
            {!pbiSearch && (
              <Link href="/powerbi-agent">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Request
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPbi.map((req, index) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <div
                className="group relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-xl hover:border-orange-500/30 transition-all duration-300 cursor-pointer"
                onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              >
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl transition-all duration-300 group-hover:w-2",
                  "bg-gradient-to-b from-orange-400 to-amber-600",
                )} />

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 pl-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-bold text-foreground group-hover:text-orange-600 transition-colors truncate">
                        {req.reportName || "Untitled Report"}
                      </h3>
                      {getPbiStatusBadge(req.status)}
                      {req.requestNumber && (
                        <span className="text-xs text-muted-foreground font-mono">{req.requestNumber}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {req.reportType && (
                        <div className="flex items-center gap-1.5">
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>{req.reportType}</span>
                        </div>
                      )}
                      {req.createdAt && !isNaN(new Date(req.createdAt).getTime()) && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Submitted {format(new Date(req.createdAt), "MMM d, yyyy")}</span>
                        </div>
                      )}
                      {req.numberOfPages && (
                        <span>{req.numberOfPages} page{req.numberOfPages !== 1 ? "s" : ""}</span>
                      )}
                      {req.numberOfDataSources && (
                        <span>{req.numberOfDataSources} data source{req.numberOfDataSources !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:flex-shrink-0">
                    {req.estimatedEffortHours && (
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 justify-end text-muted-foreground mb-0.5">
                          <Timer className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium uppercase tracking-wide">Est. Effort</span>
                        </div>
                        <p className="text-lg font-bold text-foreground">{req.estimatedEffortHours}h</p>
                      </div>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        {!req.projectIntakeId && (
                          <DropdownMenuItem
                            onClick={() => {
                              setConvertingId(req.id);
                              convertPbiRequest.mutate(req.id);
                            }}
                            disabled={convertPbiRequest.isPending}
                          >
                            <FileInput className="h-4 w-4 mr-2" />
                            Convert to Project Intake
                          </DropdownMenuItem>
                        )}
                        {req.projectIntakeId && (
                          <DropdownMenuItem asChild>
                            <Link href={`/intakes/${req.projectIntakeId}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Linked Intake
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteRequestId(req.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Request
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight className={cn(
                      "h-5 w-5 text-muted-foreground transition-transform",
                      expandedId === req.id && "rotate-90"
                    )} />
                  </div>
                </div>

                {expandedId === req.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.2 }}
                    className="pl-5 border-t pt-4 mt-2 space-y-4"
                  >
                    {req.description && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                        <p className="text-sm">{req.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {req.dataSources && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Data Sources</p>
                          <p className="text-sm">{req.dataSources}</p>
                        </div>
                      )}
                      {req.refreshFrequency && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Refresh Frequency</p>
                          <p className="text-sm">{req.refreshFrequency}</p>
                        </div>
                      )}
                      {req.calculationComplexity && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Complexity</p>
                          <p className="text-sm">{req.calculationComplexity}</p>
                        </div>
                      )}
                      {req.filtersAndSlicers && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Filters & Slicers</p>
                          <p className="text-sm">{req.filtersAndSlicers}</p>
                        </div>
                      )}
                      {req.securityRequirements && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Security / RLS</p>
                          <p className="text-sm">{req.securityRequirements}</p>
                        </div>
                      )}
                      {req.targetDeliveryDate && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Target Delivery</p>
                          <p className="text-sm">{req.targetDeliveryDate}</p>
                        </div>
                      )}
                    </div>

                    {req.projectIntakeId && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Linked Project Intake</p>
                        <Link href={`/intakes/${req.projectIntakeId}`}>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <Eye className="h-3.5 w-3.5" />
                            View Intake #{req.projectIntakeId}
                          </Button>
                        </Link>
                      </div>
                    )}

                    {req.effortBreakdown && typeof req.effortBreakdown === "object" && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Effort Breakdown</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(req.effortBreakdown).map(([task, hours]) => (
                            <div key={task} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                              <span className="text-xs text-muted-foreground">{task}</span>
                              <span className="text-xs font-semibold ml-2">{hours}h</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={deleteRequestId !== null} onOpenChange={(open) => { if (!open) setDeleteRequestId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Power BI Request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this Power BI request? This action cannot be undone.
            {pbiList.find(r => r.id === deleteRequestId)?.projectIntakeId && (
              <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                Note: The linked project intake will not be deleted.
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRequestId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteRequestId && deletePbiRequest.mutate(deleteRequestId)}
              disabled={deletePbiRequest.isPending}
            >
              {deletePbiRequest.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ProjectIntakes() {
  const { currentOrganization } = useOrganization();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingWorkflowId, setPendingWorkflowId] = useState<number | null>(null);
  const { workflows: outerIntakeWorkflows } = useIntakeWorkflows();
  const [, setLocation] = useLocation();
  const openCreateIntake = (workflowId: number | null = null) => {
    const wf = workflowId != null
      ? (outerIntakeWorkflows || []).find(w => w.id === workflowId)
      : ((outerIntakeWorkflows || []).find(w => w.isDefault) || (outerIntakeWorkflows || [])[0]);
    if (wf && wf.agentTarget === 'powerbi') {
      setLocation('/powerbi-agent');
      return;
    }
    if (wf && wf.creationMode === 'url' && wf.creationUrl) {
      window.open(wf.creationUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setPendingWorkflowId(workflowId);
    setIsDialogOpen(true);
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const [deleteIntakeId, setDeleteIntakeId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"project" | "powerbi">("project");

  const { data: intakes, isLoading } = useQuery<ProjectIntake[]>({
    queryKey: ['/api/project-intakes', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/project-intakes?organizationId=${currentOrganization?.id}`);
      if (!res.ok) throw new Error('Failed to fetch intakes');
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });

  const deleteIntake = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/project-intakes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Success", description: "Intake deleted" });
      setDeleteIntakeId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const intakesList = Array.isArray(intakes) ? intakes : [];
  
  const filteredIntakes = intakesList.filter(intake => {
    const matchesSearch = normalizeSearch(intake.projectName).includes(normalizeSearch(search));
    const matchesStatus = statusFilter === "all" 
      || (statusFilter === "in_review" && (intake.status === "draft" || intake.status === "in_progress"))
      || intake.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: intakesList.length,
    draft: intakesList.filter(i => i.status === "draft").length,
    inProgress: intakesList.filter(i => i.status === "in_progress").length,
    approved: intakesList.filter(i => i.status === "approved").length,
    rejected: intakesList.filter(i => i.status === "rejected").length,
  };

  const { data: pbiCount } = useQuery<PowerBIIntakeRequest[]>({
    queryKey: ['/api/powerbi-agent/requests', currentOrganization?.id],
    queryFn: async () => {
      const res = await fetch(`/api/powerbi-agent/requests?organizationId=${currentOrganization?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentOrganization?.id,
  });
  const pbiTotal = Array.isArray(pbiCount) ? pbiCount.length : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Intake Requests</h1>
          <p className="mt-1 text-muted-foreground">Submit and track new requests through the approval workflow.</p>
        </div>
        {activeTab === "project" ? (
          (outerIntakeWorkflows || []).length > 1 ? (
            <div className="flex">
              <Button
                className="rounded-r-none"
                onClick={() => openCreateIntake(null)}
                data-testid="button-new-intake"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Intake
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="rounded-l-none border-l border-primary-foreground/20 px-2"
                    data-testid="button-new-intake-workflow-menu"
                    aria-label="Choose workflow"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(outerIntakeWorkflows || []).filter(w => w.isActive !== false).map(w => (
                    <DropdownMenuItem
                      key={w.id}
                      onSelect={() => openCreateIntake(w.id)}
                      data-testid={`menu-new-intake-workflow-${w.id}`}
                    >
                      {w.name}{w.isDefault ? " (Default)" : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button onClick={() => openCreateIntake()} data-testid="button-new-intake">
              <Plus className="h-4 w-4 mr-2" />
              New Intake
            </Button>
          )
        ) : (
          <Link href="/powerbi-agent">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Power BI Request
            </Button>
          </Link>
        )}
      </div>

      <div className="flex gap-1 bg-muted/50 p-1 rounded-xl w-fit">
        <button
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "project"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("project")}
        >
          <div className="flex items-center gap-2">
            <FileInput className="h-4 w-4" />
            Project Intakes
            <Badge variant="secondary" className="text-xs">{intakesList.length}</Badge>
          </div>
        </button>
        <button
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeTab === "powerbi"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("powerbi")}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Power BI Requests
            {pbiTotal > 0 && <Badge variant="secondary" className="text-xs">{pbiTotal}</Badge>}
          </div>
        </button>
      </div>

      {activeTab === "powerbi" ? (
        <PowerBIRequestsSection organizationId={currentOrganization?.id} />
      ) : (<>

      {(!portfolios || portfolios.length === 0) && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/20">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">No Portfolios Available</p>
              <p className="text-sm text-amber-600 dark:text-amber-400">Create a portfolio first to assign intakes to it.</p>
            </div>
            <Link href="/portfolios">
              <Button variant="outline" className="gap-2" data-testid="button-add-portfolio">
                <FolderOpen className="h-4 w-4" />
                Add Portfolio
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card 
          className={cn(
            "cursor-pointer transition-all hover-elevate",
            statusFilter === "all" && "ring-2 ring-primary"
          )}
          onClick={() => setStatusFilter("all")}
          data-testid="card-filter-all"
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <FileInput className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Intakes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={cn(
            "cursor-pointer transition-all hover-elevate",
            statusFilter === "in_review" && "ring-2 ring-blue-500"
          )}
          onClick={() => setStatusFilter("in_review")}
          data-testid="card-filter-in-review"
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.draft + stats.inProgress}</p>
                <p className="text-xs text-muted-foreground">In Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={cn(
            "cursor-pointer transition-all hover-elevate",
            statusFilter === "approved" && "ring-2 ring-green-500"
          )}
          onClick={() => setStatusFilter("approved")}
          data-testid="card-filter-approved"
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.approved}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={cn(
            "cursor-pointer transition-all hover-elevate",
            statusFilter === "rejected" && "ring-2 ring-red-500"
          )}
          onClick={() => setStatusFilter("rejected")}
          data-testid="card-filter-rejected"
        >
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.rejected}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            className="pl-10 border-border" 
            placeholder="Search intakes..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-intakes"
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-status-filter">
              <SelectValue placeholder="Filter by Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filteredIntakes?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileInput className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No intakes found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusFilter !== "all" 
                ? "Try adjusting your filters" 
                : "Submit a new intake request to get started"}
            </p>
            {!search && statusFilter === "all" && (
              <Button onClick={() => openCreateIntake()}>
                <Plus className="h-4 w-4 mr-2" />
                New Intake
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredIntakes?.map((intake, index) => (
            <motion.div
              key={intake.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Link href={`/intakes/${intake.id}`} data-testid={`link-intake-${intake.id}`}>
                <div className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-card p-7 shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 sm:flex-row sm:items-center cursor-pointer">
                  
                  {/* Status Indicator Stripe */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl transition-all duration-300 group-hover:w-2",
                    intake.status === 'approved' && "bg-gradient-to-b from-emerald-400 to-emerald-600",
                    intake.status === 'rejected' && "bg-gradient-to-b from-rose-400 to-rose-600",
                    intake.status === 'in_progress' && "bg-gradient-to-b from-blue-400 to-blue-600",
                    (intake.status === 'draft' || !intake.status) && "bg-gradient-to-b from-slate-400 to-slate-600",
                  )} />

                  <div className="flex-1 pl-5 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                      <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors duration-200 truncate" title={intake.projectName}>
                        {intake.projectName}
                      </h3>
                      {getStatusBadge(intake.status || "draft")}
                      {intake.intakeNumber && (
                        <span className="text-xs text-muted-foreground font-mono">{intake.intakeNumber}</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Gavel className="h-4 w-4 text-muted-foreground" />
                        <span>
                          <WorkflowGateLabel
                            workflowId={intake.workflowId ?? null}
                            currentStep={intake.currentStep || "intake_capture"}
                          />
                        </span>
                      </div>
                      {intake.createdAt && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Created {format(new Date(intake.createdAt), "MMM d, yyyy")}</span>
                        </div>
                      )}
                      {intake.businessUnit && (
                        <div className="flex items-center gap-2">
                          <span>BU: {intake.businessUnit}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pl-5 sm:pl-0 mt-4 sm:mt-0">
                    {/* Estimated Budget */}
                    {intake.estimatedBudget && Number(intake.estimatedBudget) > 0 && (
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center gap-1.5 justify-end text-muted-foreground mb-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium uppercase tracking-wide">Est. Budget</span>
                        </div>
                        <p className="text-lg font-bold text-foreground"><CompactCurrency value={intake.estimatedBudget} /></p>
                      </div>
                    )}
                    
                    {/* Workflow Progress */}
                    <div className="hidden md:block" onClick={(e) => e.preventDefault()}>
                      <WorkflowProgress
                        workflowId={intake.workflowId ?? null}
                        currentStep={intake.currentStep || "intake_capture"}
                        status={intake.status || "draft"}
                      />
                    </div>
                    
                    <div onClick={(e) => e.preventDefault()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-menu-${intake.id}`} onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/intakes/${intake.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {intake.createdProjectId && (
                            <DropdownMenuItem asChild>
                              <Link href={`/projects/${intake.createdProjectId}`}>
                                <ChevronRight className="h-4 w-4 mr-2" />
                                View Project
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteIntakeId(intake.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <CreateIntakeDialog 
        open={isDialogOpen} 
        onOpenChange={(o) => { setIsDialogOpen(o); if (!o) setPendingWorkflowId(null); }}
        portfolios={portfolios || []}
        organizationId={currentOrganization?.id}
        workflowId={pendingWorkflowId}
      />

      <Dialog open={deleteIntakeId !== null} onOpenChange={() => setDeleteIntakeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Intake</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this intake? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteIntakeId(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteIntakeId && deleteIntake.mutate(deleteIntakeId)}
              disabled={deleteIntake.isPending}
            >
              {deleteIntake.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>)}
    </div>
  );
}
