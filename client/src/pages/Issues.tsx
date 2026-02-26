  import { useState, useEffect } from "react";
  import { useAllIssues, useUpdateIssue, useDeleteIssue, useIssueHistory, useEscalateIssue } from "@/hooks/use-issues";
  import { useConvertRiskToIssue, useAiMitigationSuggestion } from "@/hooks/use-risks";
  import { CreateRiskDialog } from "@/components/CreateRiskDialog";
  import { CreateIssueDialog } from "@/components/CreateIssueDialog";
  import { EditRiskDialog, type RiskFormData } from "@/components/EditRiskDialog";
  import { useProjects } from "@/hooks/use-projects";
  import { usePortfolios } from "@/hooks/use-portfolios";
  import { useOrganization } from "@/hooks/use-organization";
  import { useUpdateIssueResourceAssignments, useIssueResourceAssignments, useAllIssueResourceAssignments, useResources } from "@/hooks/use-resources";
  import type { IssueResourceAssignment, Resource } from "@shared/schema";
  import { ResourceAssignment } from "@/components/ResourceAssignment";
  import { MicrosoftContactCard } from "@/components/MicrosoftContactCard";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import { Input } from "@/components/ui/input";
  import { Textarea } from "@/components/ui/textarea";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
  import { Label } from "@/components/ui/label";
  import { Loader2, Search, Plus, Trash2, Bug, Sparkles, ListTodo, HelpCircle, MoreVertical, Pencil, Users, AlertTriangle, History, ChevronDown, ChevronUp, ArrowUpToLine, ArrowDownFromLine } from "lucide-react";
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
  import { useForm, Controller } from "react-hook-form";
  import { type Issue } from "@shared/schema";
  import { useToast } from "@/hooks/use-toast";
  import { cn, normalizeSearch } from "@/lib/utils";
  import { motion } from "framer-motion";
  import { Link } from "wouter";

  function IssueResourceDisplay({ assignments }: { assignments: (IssueResourceAssignment & { resource: Resource })[] | undefined }) {
    if (!assignments || assignments.length === 0) return null;

    return (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground mr-1">Assigned:</span>
        <div className="flex -space-x-1.5">
          {assignments.slice(0, 3).map((a) => (
            <MicrosoftContactCard
              key={a.id}
              displayName={a.resource.displayName}
              email={a.resource.email}
              title={a.resource.title}
              department={a.resource.department}
              phone={a.resource.phone}
              photoUrl={a.resource.photoUrl}
              side="top"
            >
              <div 
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold border-2 border-background cursor-pointer hover:bg-primary/20 transition-colors hover:z-10"
                title={a.resource.displayName}
              >
                {a.resource.displayName.charAt(0).toUpperCase()}
              </div>
            </MicrosoftContactCard>
          ))}
          {assignments.length > 3 && (
            <div 
              className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium border-2 border-background"
              title={assignments.slice(3).map(a => a.resource.displayName).join(", ")}
            >
              +{assignments.length - 3}
            </div>
          )}
        </div>
      </div>
    );
  }

  const priorityColors = {
    Low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    High: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    Critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };

  const statusColors = {
    Open: "bg-destructive/10 text-destructive",
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
    const { data: portfolios } = usePortfolios(currentOrganization?.id);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [typeFilter, setTypeFilter] = useState<"all" | "issue" | "risk">("all");
    const convertRiskToIssue = useConvertRiskToIssue();
    const updateIssue = useUpdateIssue();
    const deleteIssue = useDeleteIssue();
    const escalateIssue = useEscalateIssue();
    const updateIssueResources = useUpdateIssueResourceAssignments();
    const aiMitigationSuggestion = useAiMitigationSuggestion();
    const { data: allIssueAssignments } = useAllIssueResourceAssignments(currentOrganization?.id ?? null);
    const { toast } = useToast();
    const [deleteIssueData, setDeleteIssueData] = useState<{ id: number; projectId: number } | null>(null);
    const [editResourceIds, setEditResourceIds] = useState<number[]>([]);
    const [isRiskDialogOpen, setIsRiskDialogOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const { data: issueHistory, isLoading: historyLoading } = useIssueHistory(editingIssue?.id || 0);

    const editForm = useForm({
      defaultValues: {
        title: "",
        description: "",
        priority: "Medium",
        status: "Open",
        type: "Bug"
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

    const filteredIssues = issues?.filter(issue => {
      const matchesSearch = normalizeSearch(issue.title).includes(normalizeSearch(search)) ||
        normalizeSearch(issue.description).includes(normalizeSearch(search));
      const matchesStatus = statusFilter === "all" || issue.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || issue.priority === priorityFilter;
      // Handle both null and "issue" as regular issues (null is legacy, "issue" is new format)
      const matchesType = typeFilter === "all" || 
        (typeFilter === "issue" && (issue.itemType === null || issue.itemType === "issue")) ||
        (typeFilter === "risk" && issue.itemType === "risk");
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
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-page-title">Issues & Risks</h1>
            <p className="mt-1 text-muted-foreground">Track and manage issues and risks across all projects.</p>
          </div>
          <div className="flex gap-2">
            <Button data-testid="button-create-issue" onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Issue
            </Button>
            <CreateIssueDialog
              open={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              organizationId={currentOrganization?.id ?? null}
            />

            <Button variant="outline" data-testid="button-create-risk" onClick={() => setIsRiskDialogOpen(true)}>
              <AlertTriangle className="mr-2 h-4 w-4" /> New Risk
            </Button>
            <CreateRiskDialog
              open={isRiskDialogOpen}
              onOpenChange={setIsRiskDialogOpen}
              organizationId={currentOrganization?.id ?? null}
            />
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
                    className="flex items-start justify-between rounded-lg border p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    onClick={() => openEditDialog(issue)}
                    data-testid={`card-issue-${issue.id}`}
                  >
                    <div className="flex gap-4">
                      <div className="mt-0.5">
                        <TypeIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold truncate max-w-[200px]" title={issue.title} data-testid={`text-issue-title-${issue.id}`}>{issue.title}</span>
                          <Badge variant="outline" className={cn("text-xs shrink-0", issue.itemType === 'risk' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300")}>
                            {issue.itemType === 'risk' ? 'Risk' : 'Issue'}
                          </Badge>
                          <Badge variant="outline" className={cn("text-xs shrink-0", priorityColors[issue.priority as keyof typeof priorityColors])}>
                            {issue.priority}
                          </Badge>
                          <Badge variant="outline" className={cn("text-xs shrink-0", statusColors[issue.status as keyof typeof statusColors])}>
                            {issue.status}
                          </Badge>
                          {issue.escalatedToPortfolio && (
                            <Badge variant="outline" className="text-xs shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                              <ArrowUpToLine className="h-3 w-3 mr-1" />
                              Escalated
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2" title={issue.description || ""}>{issue.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground min-w-0">
                          <Link href={`/projects/${issue.projectId}`} onClick={(e) => e.stopPropagation()}>
                            <span className="hover:text-primary cursor-pointer truncate max-w-[150px] inline-block align-bottom" title={getProjectName(issue.projectId)}>{getProjectName(issue.projectId)}</span>
                          </Link>
                          <IssueResourceDisplay assignments={allIssueAssignments?.filter(a => a.issueId === issue.id)} />
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
                        {(() => {
                          const project = projects?.find(p => p.id === issue.projectId);
                          if (!project?.portfolioId) return null;
                          return (
                            <DropdownMenuItem 
                              onClick={() => {
                                escalateIssue.mutate(
                                  { id: issue.id, projectId: issue.projectId, escalate: !issue.escalatedToPortfolio },
                                  {
                                    onSuccess: () => {
                                      toast({ 
                                        title: "Success", 
                                        description: issue.escalatedToPortfolio 
                                          ? "De-escalated from portfolio" 
                                          : "Escalated to portfolio" 
                                      });
                                    },
                                    onError: (err: any) => {
                                      toast({ title: "Error", description: err.message, variant: "destructive" });
                                    }
                                  }
                                );
                              }}
                              data-testid={`menu-escalate-issue-${issue.id}`}
                            >
                              {issue.escalatedToPortfolio ? (
                                <>
                                  <ArrowDownFromLine className="h-4 w-4 mr-2" />
                                  De-escalate from Portfolio
                                </>
                              ) : (
                                <>
                                  <ArrowUpToLine className="h-4 w-4 mr-2" />
                                  Escalate to Portfolio
                                </>
                              )}
                            </DropdownMenuItem>
                          );
                        })()}
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

        {/* Edit Risk Dialog (when editing a risk item) */}
        {editingIssue?.itemType === 'risk' && (() => {
          const project = projects?.find(p => p.id === editingIssue.projectId);
          const portfolio = project?.portfolioId ? portfolios?.find(pf => pf.id === project.portfolioId) : null;
          return (
            <EditRiskDialog
              open={isEditDialogOpen}
              onOpenChange={setIsEditDialogOpen}
              risk={editingIssue}
              onSubmit={(data: RiskFormData) => {
                updateIssue.mutate({
                  id: editingIssue.id,
                  projectId: editingIssue.projectId,
                  ...data,
                }, {
                  onSuccess: () => {
                    updateIssueResources.mutate({ issueId: editingIssue.id, resourceIds: editResourceIds });
                    toast({ title: "Success", description: "Risk updated successfully" });
                    setIsEditDialogOpen(false);
                    setEditingIssue(null);
                    setEditResourceIds([]);
                    setResourcesInitialized(false);
                  },
                  onError: (err: Error) => {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  }
                });
              }}
              isSubmitting={updateIssue.isPending}
              projectLink={project ? { name: project.name, id: project.id } : null}
              portfolioLink={portfolio ? { name: portfolio.name, id: portfolio.id } : null}
              organizationId={currentOrganization?.id}
              resourceIds={editResourceIds}
              onResourcesChange={setEditResourceIds}
              onConvertToIssue={() => {
                convertRiskToIssue.mutate({ id: editingIssue.id, projectId: editingIssue.projectId }, {
                  onSuccess: () => {
                    toast({ title: "Success", description: "Risk converted to issue" });
                    setIsEditDialogOpen(false);
                  },
                  onError: (err: any) => {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  }
                });
              }}
              isConverting={convertRiskToIssue.isPending}
              history={issueHistory || []}
              historyLoading={historyLoading}
              onAiSuggest={(data) => aiMitigationSuggestion.mutateAsync(data)}
              isAiSuggesting={aiMitigationSuggestion.isPending}
              projectName={project?.name}
              onDelete={() => {
                deleteIssue.mutate({ id: editingIssue.id, projectId: editingIssue.projectId }, {
                  onSuccess: () => {
                    toast({ title: "Deleted", description: "Risk deleted" });
                    setIsEditDialogOpen(false);
                    setEditingIssue(null);
                  },
                  onError: (err: any) => {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  }
                });
              }}
              isDeleting={deleteIssue.isPending}
            />
          );
        })()}

        {/* Edit Issue Dialog (when editing an issue item) */}
        {editingIssue?.itemType !== 'risk' && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>Edit Issue</DialogTitle>
              <DialogDescription>Modify the issue details below.</DialogDescription>
            </DialogHeader>

            {editingIssue && (() => {
              const project = projects?.find(p => p.id === editingIssue.projectId);
              const portfolio = project?.portfolioId ? portfolios?.find(pf => pf.id === project.portfolioId) : null;
              return (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground border-b pb-3">
                  <span>Project:</span>
                  <Link href={`/projects/${editingIssue.projectId}`} className="text-primary hover:underline font-medium truncate max-w-[200px]" title={project?.name || ""} data-testid="link-issue-project">
                    {project?.name || `Project #${editingIssue.projectId}`}
                  </Link>
                  {portfolio && (
                    <>
                      <span className="text-muted-foreground/50">|</span>
                      <span>Portfolio:</span>
                      <Link href={`/portfolios/${portfolio.id}`} className="text-primary hover:underline font-medium truncate max-w-[200px]" title={portfolio.name} data-testid="link-issue-portfolio">
                        {portfolio.name}
                      </Link>
                    </>
                  )}
                </div>
              );
            })()}

            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="flex flex-col flex-1 overflow-hidden">
              <div className="space-y-4 pt-4 flex-1 overflow-y-auto pr-1">
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
                <Textarea {...editForm.register("description")} data-testid="input-edit-issue-description" />
              </div>
              <ResourceAssignment
                organizationId={currentOrganization?.id || null}
                selectedResourceIds={editResourceIds}
                onSelectionChange={setEditResourceIds}
                label="Assigned Resources"
                projectId={editingIssue?.projectId}
              />

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
              </div>

              <DialogFooter className="flex justify-between gap-2 pt-4 border-t mt-4 shrink-0">
                <div />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={updateIssue.isPending} data-testid="button-update-issue">
                    {updateIssue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update Issue
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}

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
