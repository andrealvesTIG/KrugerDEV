import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/use-organization";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { Plus, Search, FileInput, Check, Clock, XCircle, ChevronRight, MoreVertical, Trash2, Eye, Lightbulb, Filter, FileText, Calculator, Shield, Gavel } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortfolios } from "@/hooks/use-portfolios";
import type { ProjectIntake, Portfolio } from "@shared/schema";

const WORKFLOW_STEPS = [
  { id: "intake_capture", label: "Intake Capture", shortLabel: "Capture", icon: Lightbulb },
  { id: "triage", label: "Triage", shortLabel: "Triage", icon: Filter },
  { id: "business_case", label: "Business Case", shortLabel: "Business", icon: FileText },
  { id: "technical_evaluation", label: "Technical Evaluation", shortLabel: "Technical", icon: Calculator },
  { id: "governance_review", label: "Governance Review", shortLabel: "Governance", icon: Shield },
  { id: "decision", label: "Decision", shortLabel: "Decision", icon: Gavel },
];

function getStepIndex(stepId: string): number {
  const index = WORKFLOW_STEPS.findIndex(s => s.id === stepId);
  return index >= 0 ? index : 0;
}

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

function WorkflowProgress({ currentStep, status }: { currentStep: string; status: string }) {
  const currentIndex = getStepIndex(currentStep);
  
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {WORKFLOW_STEPS.map((step, index) => {
        const isCompleted = status === "approved" || index < currentIndex;
        const isCurrent = index === currentIndex && status !== "approved" && status !== "rejected";
        const Icon = step.icon;
        
        return (
          <div key={step.id} className="flex items-center">
            <div 
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                isCompleted 
                  ? "bg-primary text-primary-foreground" 
                  : isCurrent 
                    ? "border-2 border-primary text-primary bg-primary/10" 
                    : "border border-muted-foreground/30 text-muted-foreground"
              }`}
              title={step.label}
            >
              {isCompleted ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
            </div>
            {index < WORKFLOW_STEPS.length - 1 && (
              <div className={`w-4 h-0.5 ${isCompleted ? "bg-primary" : "bg-muted-foreground/30"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface CreateIntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolios: Portfolio[];
  organizationId?: number;
}

function CreateIntakeDialog({ open, onOpenChange, portfolios, organizationId }: CreateIntakeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [intakeName, setIntakeName] = useState("");
  const [description, setDescription] = useState("");
  const [portfolioId, setPortfolioId] = useState<string>("");
  const [fundingSource, setFundingSource] = useState("");
  const [businessUnit, setBu] = useState("");

  const createIntake = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/project-intakes', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-intakes'] });
      toast({ title: "Success", description: "Intake request created successfully" });
      onOpenChange(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Intake Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="intakeName">Intake Name *</Label>
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
              <Select value={portfolioId} onValueChange={setPortfolioId}>
                <SelectTrigger data-testid="select-portfolio">
                  <SelectValue placeholder="Assign to portfolio" />
                </SelectTrigger>
                <SelectContent>
                  {portfolios?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
    </Dialog>
  );
}

export default function ProjectIntakes() {
  const { currentOrganization } = useOrganization();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const { data: portfolios } = usePortfolios(currentOrganization?.id);
  const [deleteIntakeId, setDeleteIntakeId] = useState<number | null>(null);

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

  const filteredIntakes = intakes?.filter(intake => {
    const matchesSearch = intake.projectName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || intake.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: intakes?.length || 0,
    draft: intakes?.filter(i => i.status === "draft").length || 0,
    inProgress: intakes?.filter(i => i.status === "in_progress").length || 0,
    approved: intakes?.filter(i => i.status === "approved").length || 0,
    rejected: intakes?.filter(i => i.status === "rejected").length || 0,
  };

  const getStepLabel = (stepId: string) => {
    const step = WORKFLOW_STEPS.find(s => s.id === stepId);
    return step?.label || "Unknown";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Intake Requests</h1>
          <p className="mt-1 text-muted-foreground">Submit and track new requests through the approval workflow.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} data-testid="button-new-intake">
          <Plus className="h-4 w-4 mr-2" />
          New Intake
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
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
        <Card>
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
        <Card>
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
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
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
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Intake
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIntakes?.map(intake => (
            <Link key={intake.id} href={`/intakes/${intake.id}`} data-testid={`link-intake-${intake.id}`}>
              <Card className="hover-elevate cursor-pointer">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <span className="font-medium text-foreground">
                          {intake.projectName}
                        </span>
                        {getStatusBadge(intake.status || "draft")}
                        {intake.intakeNumber && (
                          <span className="text-xs text-muted-foreground font-mono">{intake.intakeNumber}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span>Current Gate: {getStepLabel(intake.currentStep || "intake_capture")}</span>
                        {intake.businessUnit && <span>BU: {intake.businessUnit}</span>}
                        {intake.createdAt && (
                          <span>Created: {format(new Date(intake.createdAt), "MMM d, yyyy")}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <WorkflowProgress 
                        currentStep={intake.currentStep || "intake_capture"} 
                        status={intake.status || "draft"} 
                      />
                    
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateIntakeDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        portfolios={portfolios || []}
        organizationId={currentOrganization?.id}
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
    </div>
  );
}
