import { useState, useEffect } from "react";
import { useAllIssues, useCreateIssue, useUpdateIssue, useDeleteIssue, useIssueHistory } from "@/hooks/use-issues";
import { useCreateRisk, useConvertRiskToIssue, useAiMitigationSuggestion } from "@/hooks/use-risks";
import { useProjects } from "@/hooks/use-projects";
import { useOrganization } from "@/hooks/use-organization";
import { useUpdateIssueResourceAssignments, useIssueResourceAssignments, useResources } from "@/hooks/use-resources";
import { ResourceAssignment } from "@/components/ResourceAssignment";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, MoreVertical, Pencil, Users, AlertTriangle, History, ChevronDown, ChevronUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertIssueSchema, type Issue } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { LimitExceededDialog } from "@/components/LimitExceededDialog";
import { z } from "zod";

function IssueResourceDisplay({ issueId }: { issueId: number }) {
  const { data: assignments, isLoading } = useIssueResourceAssignments(issueId);
  
  if (isLoading) return <span className="text-muted-foreground">Loading...</span>;
  if (!assignments || assignments.length === 0) return null;
  
  const names = assignments.map(a => a.resource.displayName).join(", ");
  return <span>Assigned: {names}</span>;
}

const priorityColors = {
  Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  High: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const statusColors = {
  Open: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "In Progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const typeIcons = {
  Bug: Bug,
  Enhancement: Sparkles,
  Task: ListTodo,
  Question: HelpCircle,
};

export default function Issues() {
  const { currentOrganization } = useOrganization();
  const { data: issues, isLoading } = useAllIssues(currentOrganization?.id);
  const { data: projects } = useProjects(currentOrganization?.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "issue" | "risk">("all");
  const createIssue = useCreateIssue();
  const createRisk = useCreateRisk();
  const convertRiskToIssue = useConvertRiskToIssue();
  const aiMitigationSuggestion = useAiMitigationSuggestion();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue();
  const updateIssueResources = useUpdateIssueResourceAssignments();
  const { toast } = useToast();
  const [deleteIssueData, setDeleteIssueData] = useState<{ id: number; projectId: number } | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [editResourceIds, setEditResourceIds] = useState<number[]>([]);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitError, setLimitError] = useState<{ message?: string; resourceType?: string } | null>(null);
  const [isRiskDialogOpen, setIsRiskDialogOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { data: issueHistory, isLoading: historyLoading } = useIssueHistory(editingIssue?.id || 0);

  const form = useForm({
    resolver: zodResolver(insertIssueSchema.extend({
      projectId: insertIssueSchema.shape.projectId.refine(val => val > 0, "Please select a project")
    })),
    defaultValues: {
      projectId: undefined as unknown as number,
      title: "",
      description: "",
      priority: "Medium",
      status: "Open",
      type: "Bug"
    }
  });

  const editForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      priority: "Medium",
      status: "Open",
      type: "Bug"
    }
  });

  const riskFormSchema = z.object({
    projectId: z.number().min(1, "Please select a project"),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    probability: z.enum(["Low", "Medium", "High"]),
    impact: z.enum(["Low", "Medium", "High"]),
    status: z.string(),
    mitigationPlan: z.string().optional(),
  });

  const riskForm = useForm({
    resolver: zodResolver(riskFormSchema),
    defaultValues: {
      projectId: undefined as unknown as number,
      title: "",
      description: "",
      probability: "Medium" as "Low" | "Medium" | "High",
      impact: "Medium" as "Low" | "Medium" | "High",
      status: "Open",
      mitigationPlan: "",
    }
  });

  const { data: editingIssueResources } = useIssueResourceAssignments(editingIssue?.id || null);
  const [resourcesInitialized, setResourcesInitialized] = useState(false);

  useEffect(() => {
    if (isEditDialogOpen && editingIssueResources && !resourcesInitialized) {
      setEditResourceIds(editingIssueResources.map(a => a.resource.id));
      setResourcesInitialized(true);
    }
  }, [isEditDialogOpen, editingIssueResources, resourcesInitialized]);

  const openEditDialog = (issue: Issue) => {
    setEditingIssue(issue);
    setResourcesInitialized(false);
    editForm.reset({
      title: issue.title,
      description: issue.description || "",
      priority: issue.priority || "Medium",
      status: issue.status || "Open",
      type: issue.type || "Bug"
    });
    setEditResourceIds([]);
    setShowHistory(false);
    setIsEditDialogOpen(true);
  };

  const onEditSubmit = (data: any) => {
    if (!editingIssue) return;
    updateIssue.mutate({ 
      id: editingIssue.id, 
      projectId: editingIssue.projectId,
      ...data 
    }, {
      onSuccess: () => {
        updateIssueResources.mutate({ issueId: editingIssue.id, resourceIds: editResourceIds });
        toast({ title: "Success", description: "Issue updated successfully" });
        setIsEditDialogOpen(false);
        setEditingIssue(null);
        setEditResourceIds([]);
        setResourcesInitialized(false);
      },
      onError: (err: Error) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const onSubmit = (data: any) => {
    createIssue.mutate(data, {
      onSuccess: (newIssue: any) => {
        if (selectedResourceIds.length > 0 && newIssue?.id) {
          updateIssueResources.mutate({ issueId: newIssue.id, resourceIds: selectedResourceIds });
        }
        toast({ title: "Success", description: "Issue created successfully" });
        setIsDialogOpen(false);
        setSelectedResourceIds([]);
        form.reset({
          projectId: undefined as unknown as number,
          title: "",
          description: "",
          priority: "Medium",
          status: "Open",
          type: "Bug"
        });
      },
      onError: (err: any) => {
        if (err.limitExceeded) {
          setLimitError({ message: err.message, resourceType: err.resourceType });
          setLimitDialogOpen(true);
          setIsDialogOpen(false);
        } else {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    });
  };

  const onRiskSubmit = (data: any) => {
    createRisk.mutate(data, {
      onSuccess: () => {
        toast({ title: "Success", description: "Risk created successfully" });
        setIsRiskDialogOpen(false);
        riskForm.reset({
          projectId: undefined as unknown as number,
          title: "",
          description: "",
          probability: "Medium",
          impact: "Medium",
          status: "Open",
          mitigationPlan: "",
        });
      },
      onError: (err: any) => {
        if (err.limitExceeded) {
          setLimitError({ message: err.message, resourceType: err.resourceType });
          setLimitDialogOpen(true);
          setIsRiskDialogOpen(false);
        } else {
          toast({ title: "Error", description: err.message, variant: "destructive" });
        }
      }
    });
  };

  const filteredIssues = issues?.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(search.toLowerCase()) ||
      issue.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || issue.priority === priorityFilter;
    const matchesType = typeFilter === "all" || issue.itemType === typeFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesType;
  });

  const getProjectName = (projectId: number) => {
    return projects?.find(p => p.id === projectId)?.name || "Unknown Project";
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <LimitExceededDialog
        open={limitDialogOpen}
        onOpenChange={setLimitDialogOpen}
        resourceType={limitError?.resourceType}
        message={limitError?.message}
      />
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-page-title">Issues & Risks</h1>
          <p className="mt-1 text-muted-foreground">Track and manage issues and risks across all projects.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-issue">
                <Plus className="mr-2 h-4 w-4" /> New Issue
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Issue</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Project <span className="text-destructive">*</span></Label>
                <Controller
                  control={form.control}
                  name="projectId"
                  render={({ field, fieldState }) => (
                    <>
                      <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString()}>
                        <SelectTrigger data-testid="select-project" className={fieldState.error ? "border-destructive" : ""}>
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects?.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
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
              <div className="space-y-2">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input {...form.register("title")} data-testid="input-issue-title" placeholder="Brief description of the issue" className={form.formState.errors.title ? "border-destructive" : ""} />
                {form.formState.errors.title && (
                  <p className="text-sm text-destructive">{form.formState.errors.title.message as string}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Controller
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Bug"}>
                        <SelectTrigger data-testid="select-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bug">Bug</SelectItem>
                          <SelectItem value="Enhancement">Enhancement</SelectItem>
                          <SelectItem value="Task">Task</SelectItem>
                          <SelectItem value="Question">Question</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Controller
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue />
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
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input {...form.register("description")} data-testid="input-issue-description" placeholder="Detailed description" />
              </div>
              <ResourceAssignment
                organizationId={currentOrganization?.id || null}
                selectedResourceIds={selectedResourceIds}
                onSelectionChange={setSelectedResourceIds}
                label="Assigned Resources"
                projectId={form.watch("projectId")}
              />
              <DialogFooter>
                <Button type="submit" disabled={createIssue.isPending} data-testid="button-submit-issue">
                  {createIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Issue
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        
          <Dialog open={isRiskDialogOpen} onOpenChange={setIsRiskDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-create-risk">
                <AlertTriangle className="mr-2 h-4 w-4" /> New Risk
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New Risk</DialogTitle>
                <DialogDescription>Add a new risk to track potential issues</DialogDescription>
              </DialogHeader>
              <form onSubmit={riskForm.handleSubmit(onRiskSubmit)} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Project <span className="text-destructive">*</span></Label>
                  <Controller
                    control={riskForm.control}
                    name="projectId"
                    render={({ field, fieldState }) => (
                      <>
                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString()}>
                          <SelectTrigger data-testid="select-risk-project" className={fieldState.error ? "border-destructive" : ""}>
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects?.map(p => (
                              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
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
                <div className="space-y-2">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input {...riskForm.register("title")} data-testid="input-risk-title" placeholder="Brief description of the risk" className={riskForm.formState.errors.title ? "border-destructive" : ""} />
                  {riskForm.formState.errors.title && (
                    <p className="text-sm text-destructive">{riskForm.formState.errors.title.message as string}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Probability</Label>
                    <Controller
                      control={riskForm.control}
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
                      control={riskForm.control}
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
                    control={riskForm.control}
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
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea {...riskForm.register("description")} data-testid="input-risk-description" placeholder="Detailed description of the risk" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Mitigation Plan</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const title = riskForm.getValues("title");
                        if (!title) {
                          toast({ title: "Title Required", description: "Please enter a risk title first to get AI suggestions", variant: "destructive" });
                          return;
                        }
                        const projectId = riskForm.getValues("projectId");
                        const project = projects?.find(p => p.id === projectId);
                        aiMitigationSuggestion.mutate({
                          title,
                          description: riskForm.getValues("description"),
                          probability: riskForm.getValues("probability"),
                          impact: riskForm.getValues("impact"),
                          projectContext: project?.name
                        }, {
                          onSuccess: (data) => {
                            riskForm.setValue("mitigationPlan", data.suggestion);
                            toast({ title: "AI Suggestion Generated", description: "Mitigation plan has been populated" });
                          },
                          onError: (err: any) => {
                            toast({ title: "Error", description: err.message || "Failed to generate suggestions", variant: "destructive" });
                          }
                        });
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
                  <Textarea {...riskForm.register("mitigationPlan")} data-testid="input-risk-mitigation" placeholder="Steps to mitigate or handle the risk" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createRisk.isPending} data-testid="button-submit-risk">
                    {createRisk.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Risk
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <Button
          variant={typeFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setTypeFilter("all")}
          data-testid="button-filter-all"
        >
          All
        </Button>
        <Button
          variant={typeFilter === "issue" ? "default" : "outline"}
          size="sm"
          onClick={() => setTypeFilter("issue")}
          data-testid="button-filter-issues"
        >
          Issues
        </Button>
        <Button
          variant={typeFilter === "risk" ? "default" : "outline"}
          size="sm"
          onClick={() => setTypeFilter("risk")}
          data-testid="button-filter-risks"
        >
          Risks
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10 border-slate-200"
            placeholder="Search issues and risks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-issues"
          />
        </div>
        <div className="w-full sm:w-[160px]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[160px]">
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger data-testid="select-filter-priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{typeFilter === "all" ? "All Issues & Risks" : typeFilter === "issue" ? "Issues" : "Risks"}</CardTitle>
          <CardDescription>{filteredIssues?.length || 0} {typeFilter === "all" ? "items" : typeFilter === "issue" ? "issues" : "risks"} found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredIssues?.map((issue, index) => {
              const TypeIcon = typeIcons[issue.type as keyof typeof typeIcons] || Bug;
              return (
                <motion.div
                  key={issue.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-start justify-between rounded-lg border p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => openEditDialog(issue)}
                  data-testid={`card-issue-${issue.id}`}
                >
                  <div className="flex gap-4">
                    <div className="mt-0.5">
                      <TypeIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold" data-testid={`text-issue-title-${issue.id}`}>{issue.title}</span>
                        <Badge variant="outline" className={cn("text-xs", issue.itemType === 'risk' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300")}>
                          {issue.itemType === 'risk' ? 'Risk' : 'Issue'}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", priorityColors[issue.priority as keyof typeof priorityColors])}>
                          {issue.priority}
                        </Badge>
                        <Badge variant="outline" className={cn("text-xs", statusColors[issue.status as keyof typeof statusColors])}>
                          {issue.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{issue.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <Link href={`/projects/${issue.projectId}`} onClick={(e) => e.stopPropagation()}>
                          <span className="hover:text-primary cursor-pointer">{getProjectName(issue.projectId)}</span>
                        </Link>
                        <IssueResourceDisplay issueId={issue.id} />
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`button-menu-issue-${issue.id}`}
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => openEditDialog(issue)}
                        data-testid={`menu-edit-issue-${issue.id}`}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {issue.itemType === 'risk' && (
                        <DropdownMenuItem 
                          onClick={() => {
                            convertRiskToIssue.mutate({ id: issue.id, projectId: issue.projectId }, {
                              onSuccess: () => {
                                toast({ title: "Success", description: "Risk converted to issue" });
                              },
                              onError: (err: any) => {
                                toast({ title: "Error", description: err.message, variant: "destructive" });
                              }
                            });
                          }}
                          data-testid={`menu-convert-risk-${issue.id}`}
                        >
                          <Bug className="h-4 w-4 mr-2" />
                          Convert to Issue
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        onClick={() => setDeleteIssueData({ id: issue.id, projectId: issue.projectId })}
                        className="text-red-600 focus:text-red-600"
                        data-testid={`menu-delete-issue-${issue.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              );
            })}
            {filteredIssues?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No issues found. Create your first issue to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Issue/Risk Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit {editingIssue?.itemType === 'risk' ? 'Risk' : 'Issue'}</DialogTitle>
            <DialogDescription>Update the {editingIssue?.itemType === 'risk' ? 'risk' : 'issue'} details below</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input {...editForm.register("title")} data-testid="input-edit-issue-title" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Controller
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Bug"}>
                      <SelectTrigger data-testid="select-edit-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bug">Bug</SelectItem>
                        <SelectItem value="Enhancement">Enhancement</SelectItem>
                        <SelectItem value="Task">Task</SelectItem>
                        <SelectItem value="Question">Question</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Controller
                  control={editForm.control}
                  name="priority"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "Medium"}>
                      <SelectTrigger data-testid="select-edit-priority">
                        <SelectValue />
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
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Controller
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || "Open"}>
                    <SelectTrigger data-testid="select-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Resolved">Resolved</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input {...editForm.register("description")} data-testid="input-edit-issue-description" />
            </div>
            <ResourceAssignment
              organizationId={currentOrganization?.id || null}
              selectedResourceIds={editResourceIds}
              onSelectionChange={setEditResourceIds}
              label="Assigned Resources"
              projectId={editingIssue?.projectId}
            />
            
            {/* Change History Section */}
            <div className="border-t pt-4">
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full justify-between px-0 hover:bg-transparent"
                onClick={() => setShowHistory(!showHistory)}
                data-testid="button-toggle-history"
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
                  ) : issueHistory && issueHistory.length > 0 ? (
                    issueHistory.map((log) => (
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

            <DialogFooter className="flex justify-between gap-2">
              <div>
                {editingIssue?.itemType === 'risk' && (
                  <Button 
                    type="button" 
                    variant="secondary"
                    onClick={() => {
                      if (editingIssue) {
                        convertRiskToIssue.mutate({ id: editingIssue.id, projectId: editingIssue.projectId }, {
                          onSuccess: () => {
                            toast({ title: "Success", description: "Risk converted to issue" });
                            setIsEditDialogOpen(false);
                          },
                          onError: (err: any) => {
                            toast({ title: "Error", description: err.message, variant: "destructive" });
                          }
                        });
                      }
                    }}
                    disabled={convertRiskToIssue.isPending}
                    data-testid="button-convert-risk-to-issue"
                  >
                    {convertRiskToIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Convert to Issue
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateIssue.isPending} data-testid="button-update-issue">
                  {updateIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update {editingIssue?.itemType === 'risk' ? 'Risk' : 'Issue'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteIssueData !== null} onOpenChange={() => setDeleteIssueData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Issue</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this issue? It will be moved to the recycle bin.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteIssueData(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (deleteIssueData) {
                  deleteIssue.mutate(deleteIssueData, {
                    onSuccess: () => setDeleteIssueData(null)
                  });
                }
              }}
              disabled={deleteIssue.isPending}
              data-testid="button-confirm-delete-issue"
            >
              {deleteIssue.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
